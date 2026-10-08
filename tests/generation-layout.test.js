import { describe, expect, test } from 'vitest';
import { generateArchitecture } from '../src/core/architecture-generator.js';
import { buildXml } from '../src/core/json-to-xml-builder.js';
import { calculateLayout, estimateLabelWidth } from '../src/core/layout-engine.js';
import { routeConnections } from '../src/core/edge-router.js';
import { getGroupStyle, getServiceStyle } from '../src/core/aws-service-catalog.js';

// 공개용 명시 입력(두 AZ, 각 public/private 서브넷, Cloud 직속 S3).
const fixture = () => ({
    groups: [
        { id: 'cloud', type: 'aws_cloud', label: 'Example Cloud', children: ['vpc'] },
        { id: 'vpc', type: 'vpc', label: 'Application VPC', children: ['az-a', 'az-c'] },
        { id: 'az-a', type: 'az', label: 'Zone A', children: ['public-a', 'private-a'] },
        { id: 'az-c', type: 'az', label: 'Zone C', children: ['public-c', 'private-c'] },
        { id: 'public-a', type: 'subnet_public', label: 'Public A', children: [] },
        { id: 'private-a', type: 'subnet_private', label: 'Private A', children: [] },
        { id: 'public-c', type: 'subnet_public', label: 'Public C', children: [] },
        { id: 'private-c', type: 'subnet_private', label: 'Private C', children: [] },
    ],
    services: [
        { id: 'web-a', type: 'ec2', label: 'Application A', group: 'public-a' },
        { id: 'web-c', type: 'ec2', label: 'Application C', group: 'public-c' },
        { id: 'db-a', type: 'rds', label: 'Database A', group: 'private-a' },
        { id: 'db-c', type: 'rds', label: 'Database C', group: 'private-c' },
        { id: 'logs', type: 's3', label: 'Log Archive', group: 'cloud' },
    ],
    connections: [
        { from: 'web-a', to: 'db-a', label: 'Query' },
        { from: 'web-c', to: 'db-c', label: 'Query' },
        { from: 'web-a', to: 'logs', label: 'Logs' },
        { from: 'web-c', to: 'logs', label: 'Logs' },
    ],
});

const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');

/** XML에서 절대 좌표 사각형·연결 경로를 읽는다. */
function inspect(xml) {
    const doc = parse(xml);
    const cells = new Map([...doc.querySelectorAll('mxCell')].map(c => [c.getAttribute('id'), c]));
    const rects = new Map();
    const rectOf = (id) => {
        if (rects.has(id)) return rects.get(id);
        const cell = cells.get(id);
        const g = cell.querySelector('mxGeometry');
        const parent = cell.getAttribute('parent');
        const base = parent === '1' || parent === '0' ? { x: 0, y: 0 } : rectOf(parent);
        const rect = { x: base.x + Number(g.getAttribute('x')), y: base.y + Number(g.getAttribute('y')), w: Number(g.getAttribute('width')), h: Number(g.getAttribute('height')) };
        rects.set(id, rect);
        return rect;
    };
    const vertices = [...cells.values()].filter(c => c.getAttribute('vertex') === '1');
    const rect = Object.fromEntries(vertices.map(c => [c.getAttribute('id'), rectOf(c.getAttribute('id'))]));
    const parentOf = Object.fromEntries(vertices.map(c => [c.getAttribute('id'), c.getAttribute('parent')]));
    const labelOf = Object.fromEntries(vertices.map(c => [c.getAttribute('id'), c.getAttribute('value')]));
    const edges = [...cells.values()].filter(c => c.getAttribute('edge') === '1').map(c => {
        const style = c.getAttribute('style');
        const port = key => style.split(';').find(s => s.startsWith(`${key}=`))?.slice(key.length + 1);
        return {
            source: c.getAttribute('source'), target: c.getAttribute('target'), label: c.getAttribute('value'), style,
            waypoints: [...c.querySelectorAll('mxPoint')].map(p => ({ x: Number(p.getAttribute('x')), y: Number(p.getAttribute('y')) })),
            exit: port('exitX') === undefined ? null : [Number(port('exitX')), Number(port('exitY'))],
            entry: port('entryX') === undefined ? null : [Number(port('entryX')), Number(port('entryY'))],
        };
    });
    return { rect, parentOf, labelOf, edges };
}

const LABEL_MARGIN = 30; // 서비스 라벨이 아이콘 아래에 차지하는 높이
const polyline = (edge, rect) => {
    const s = rect[edge.source], t = rect[edge.target];
    const anchor = (r, [px, py]) => ({ x: r.x + r.w * px, y: r.y + r.h * py });
    return [anchor(s, edge.exit), ...edge.waypoints, anchor(t, edge.entry)];
};
const hits = (a, b, r) => {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
};
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** 공통 구조 검사: 경계·겹침·라벨 영역. */
function expectSoundLayout(input, view) {
    const { rect, parentOf } = view;
    const ids = Object.keys(rect);
    for (const id of ids) {
        const parent = parentOf[id];
        if (parent !== '1') {
            expect(inside(rect[id], rect[parent]), `${id} 가 ${parent} 경계 안`).toBe(true);
            expect(rect[id].y, `${id} 는 ${parent}의 라벨 영역 아래`).toBeGreaterThanOrEqual(rect[parent].y + 50);
        }
    }
    const isAncestor = (a, b) => { for (let p = parentOf[b]; p && p !== '1'; p = parentOf[p]) if (p === a) return true; return false; };
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            if (isAncestor(ids[i], ids[j]) || isAncestor(ids[j], ids[i])) continue;
            expect(overlaps(rect[ids[i]], rect[ids[j]]), `${ids[i]} / ${ids[j]} 겹침`).toBe(false);
        }
    }
    // 서비스 라벨 영역(아이콘 아래)도 다른 서비스와 겹치지 않는다.
    const services = input.services.map(s => s.id);
    for (const a of services) for (const b of services) {
        if (a >= b) continue;
        const box = id => ({ ...rect[id], h: rect[id].h + LABEL_MARGIN });
        expect(overlaps(box(a), box(b)), `${a} / ${b} 라벨 겹침`).toBe(false);
    }
}

/** 서로 다른 연결 경로의 엄격한 직교 교차 수(끝점 공유·공선·T자 합류는 제외). */
function strictCrossings(view) {
    const { rect, edges } = view;
    const segments = edges.filter(e => e.exit).map(e => {
        const pts = polyline(e, rect);
        return pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
    });
    const between = (v, p, q) => v > Math.min(p, q) && v < Math.max(p, q);
    let crossings = 0;
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            for (const [a1, a2] of segments[i]) for (const [b1, b2] of segments[j]) {
                const aHorizontal = a1.y === a2.y, bHorizontal = b1.y === b2.y;
                if (aHorizontal === bHorizontal) continue;
                const [h1, h2, v1, v2] = aHorizontal ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
                if (between(v1.x, h1.x, h2.x) && between(h1.y, v1.y, v2.y)) crossings += 1;
            }
        }
    }
    return crossings;
}

/** 연결 경로가 직교이고 다른 서비스 아이콘·그룹 라벨 띠를 지나지 않는지 검사한다. */
function expectCleanRoutes(input, view, fallback = []) {
    const { rect, edges, labelOf } = view;
    expect(edges.map(e => [e.source, e.target, e.label])).toEqual(input.connections.map(c => [c.from, c.to, c.label]));
    const bands = input.groups.map(g => ({ id: g.id, x: rect[g.id].x, y: rect[g.id].y, w: Math.min(rect[g.id].w, 40 + 8 * labelOf[g.id].length), h: 30 }));
    for (const edge of edges) {
        if (fallback.includes(`${edge.source}>${edge.target}`)) {
            // 지원하지 않는 경우는 명시적 경로 없이 기존 직교 라우팅을 쓴다.
            expect(edge.exit).toBeNull();
            expect(edge.waypoints).toEqual([]);
            expect(edge.style).toContain('edgeStyle=orthogonalEdgeStyle');
            continue;
        }
        expect(edge.exit, `${edge.source}->${edge.target} 출구 포트`).not.toBeNull();
        expect(edge.entry, `${edge.source}->${edge.target} 입구 포트`).not.toBeNull();
        expect(edge.waypoints.length).toBeGreaterThan(0);
        const points = polyline(edge, rect);
        for (let i = 0; i < points.length - 1; i++) {
            const [a, b] = [points[i], points[i + 1]];
            expect(a.x === b.x || a.y === b.y, `${edge.source}->${edge.target} 직교 구간`).toBe(true);
            for (const service of input.services) {
                if ([edge.source, edge.target].includes(service.id)) continue;
                const r = rect[service.id];
                expect(hits(a, b, { x: r.x - 10, y: r.y, w: r.w + 20, h: r.h + LABEL_MARGIN }), `${edge.source}->${edge.target} 가 ${service.id} 아이콘 통과`).toBe(false);
            }
            for (const band of bands) expect(hits(a, b, band), `${edge.source}->${edge.target} 가 ${band.id} 라벨 통과`).toBe(false);
        }
    }
}

describe('새 그림 배치: 공개 명시 입력', () => {
    const input = fixture();
    const view = inspect(generateArchitecture(input).xml);

    test('AZ는 나란히, 각 AZ의 public 서브넷은 private 서브넷 위에 같은 x로 쌓인다', () => {
        const { rect } = view;
        expect(rect['az-a'].y).toBe(rect['az-c'].y);
        expect(rect['az-a'].x + rect['az-a'].w).toBeLessThanOrEqual(rect['az-c'].x);
        for (const zone of ['a', 'c']) {
            expect(rect[`public-${zone}`].x).toBe(rect[`private-${zone}`].x);
            expect(rect[`public-${zone}`].y + rect[`public-${zone}`].h).toBeLessThanOrEqual(rect[`private-${zone}`].y);
        }
    });

    test('형제 AZ의 대응 서브넷은 같은 높이 행·같은 너비로 정렬된다', () => {
        const { rect } = view;
        for (const kind of ['public', 'private']) {
            expect(rect[`${kind}-a`].y).toBe(rect[`${kind}-c`].y);
            expect(rect[`${kind}-a`].h).toBe(rect[`${kind}-c`].h);
            expect(rect[`${kind}-a`].w).toBe(rect[`${kind}-c`].w);
        }
        expect(rect['az-a'].w).toBe(rect['az-c'].w);
        expect(rect['web-a'].y).toBe(rect['web-c'].y);
        expect(rect['db-a'].y).toBe(rect['db-c'].y);
    });

    test('VPC 밖 Cloud 직속 S3는 VPC 오른쪽 열에 붙어 있고 세로로 VPC 범위 안에 있다', () => {
        const { rect } = view;
        expect(rect.logs.x).toBeGreaterThanOrEqual(rect.vpc.x + rect.vpc.w);
        expect(rect.logs.x - (rect.vpc.x + rect.vpc.w)).toBeLessThanOrEqual(120);
        expect(rect.logs.y).toBeGreaterThanOrEqual(rect.vpc.y);
        expect(rect.logs.y + rect.logs.h).toBeLessThanOrEqual(rect.vpc.y + rect.vpc.h);
        expect(view.parentOf.logs).toBe('cloud');
    });

    test('소속·ID·라벨·연결 수가 입력과 같고 경계·겹침·라벨 영역이 지켜진다', () => {
        expect(Object.keys(view.rect).sort()).toEqual([...input.groups, ...input.services].map(i => i.id).sort());
        expect(view.edges).toHaveLength(4);
        for (const s of input.services) expect(view.parentOf[s.id]).toBe(s.group);
        expectSoundLayout(input, view);
    });

    test('연결 4개는 포트와 경유점을 가지며 다른 아이콘·서브넷 라벨을 통과하지 않는다', () => {
        expectCleanRoutes(input, view);
    });

    test('연결 경로끼리 엄격한 직교 교차가 없다(끝점 공유와 같은 대상으로 가는 공선 줄기는 제외)', () => {
        expect(strictCrossings(view)).toBe(0);
    });

    test('EC2→S3 연결은 서브넷 위쪽 틈새로 지나 아래쪽 DB 세로 경로와 만나지 않는다', () => {
        const { rect, edges } = view;
        for (const edge of [edges[2], edges[3]]) {
            const corridor = edge.waypoints[1].y;
            expect(corridor).toBeLessThan(rect[`public-${edge.source.slice(-1)}`].y);
        }
    });

    test('EC2→DB 연결은 같은 AZ 안에 머물고 EC2→S3는 AZ·VPC 밖 S3 열로 이어진다', () => {
        const { rect, edges } = view;
        const az = { a: rect['az-a'], c: rect['az-c'] };
        for (const [edge, zone] of [[edges[0], 'a'], [edges[1], 'c']]) {
            for (const p of polyline(edge, rect)) {
                expect(p.x).toBeGreaterThanOrEqual(az[zone].x);
                expect(p.x).toBeLessThanOrEqual(az[zone].x + az[zone].w);
                expect(p.y).toBeGreaterThanOrEqual(az[zone].y);
                expect(p.y).toBeLessThanOrEqual(az[zone].y + az[zone].h);
            }
        }
        for (const edge of [edges[2], edges[3]]) {
            const end = polyline(edge, rect).at(-1);
            expect(end.x).toBeLessThanOrEqual(rect.logs.x + 1);
        }
    });
});

describe('새 그림 배치: 비대칭·중첩·템플릿·다른 그룹 타입', () => {
    test('AZ마다 서비스 수가 달라도 대응 행이 정렬되고 경계·겹침·경로가 유지된다', () => {
        const input = fixture();
        input.services.push({ id: 'web-a2', type: 'ec2', label: 'Application A2', group: 'public-a' });
        input.services.push({ id: 'db-a2', type: 'rds', label: 'Database A2', group: 'private-a' });
        input.services.push({ id: 'db-a3', type: 'rds', label: 'Database A3', group: 'private-a' });
        const view = inspect(generateArchitecture(input).xml);
        for (const kind of ['public', 'private']) {
            expect(view.rect[`${kind}-a`].y).toBe(view.rect[`${kind}-c`].y);
            expect(view.rect[`${kind}-a`].h).toBe(view.rect[`${kind}-c`].h);
            expect(view.rect[`${kind}-a`].w).toBe(view.rect[`${kind}-c`].w);
        }
        expectSoundLayout(input, view);
        // 같은 줄의 web-a2가 오른쪽을 막아도 서브넷 바깥 왼쪽 여백 통로로 명시적 경로를 만든다.
        expectCleanRoutes(input, view);
        expect(strictCrossings(view)).toBe(0);
    });

    test('AZ 하나에 private 서브넷이 없는 비대칭 구조도 public 행은 정렬된다', () => {
        const input = fixture();
        input.groups = input.groups.filter(g => g.id !== 'private-c');
        input.groups.find(g => g.id === 'az-c').children = ['public-c'];
        input.services = input.services.filter(s => s.id !== 'db-c');
        input.connections = input.connections.filter(c => c.to !== 'db-c');
        const view = inspect(generateArchitecture(input).xml);
        expect(view.rect['public-a'].y).toBe(view.rect['public-c'].y);
        expect(view.rect['public-a'].w).toBe(view.rect['public-c'].w);
        expectSoundLayout(input, view);
        expect(view.edges).toHaveLength(3);
    });

    test('템플릿 50px 아이콘 크기를 유지하며 같은 규칙으로 배치된다', () => {
        const style = getServiceStyle('ec2');
        const templateXml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="t" value="x" style="${style}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="50" as="geometry"/></mxCell></root></mxGraphModel>`;
        const input = fixture();
        const view = inspect(generateArchitecture(input, { templateXml }).xml);
        for (const s of input.services) expect([view.rect[s.id].w, view.rect[s.id].h]).toEqual([50, 50]);
        expect(view.rect['public-a'].y).toBeLessThan(view.rect['private-a'].y);
        expect(view.rect.logs.x).toBeGreaterThanOrEqual(view.rect.vpc.x + view.rect.vpc.w);
        expectSoundLayout(input, view);
        expectCleanRoutes(input, view);
    });

    test('서브넷이 아닌 그룹 타입(eks_cluster, asg)은 기존 가로 배치를 쓰고 직속 서비스만 오른쪽 열로 간다', () => {
        const input = {
            groups: [
                { id: 'cloud', type: 'aws_cloud', label: 'Cloud', children: ['vpc'] },
                { id: 'vpc', type: 'vpc', label: 'VPC', children: ['eks', 'asg'] },
                { id: 'eks', type: 'eks_cluster', label: 'Cluster', children: [] },
                { id: 'asg', type: 'asg', label: 'Scaling', children: [] },
            ],
            services: [
                { id: 'node', type: 'ec2', label: 'Node', group: 'eks' },
                { id: 'worker', type: 'ec2', label: 'Worker', group: 'asg' },
                { id: 'lb', type: 'alb', label: 'LB', group: 'vpc' },
            ],
            connections: [{ from: 'lb', to: 'node' }, { from: 'lb', to: 'worker' }],
        };
        const view = inspect(generateArchitecture(input).xml);
        expect(view.rect.eks.y).toBe(view.rect.asg.y);
        expect(view.rect.eks.x + view.rect.eks.w).toBeLessThanOrEqual(view.rect.asg.x);
        expect(view.rect.lb.x).toBeGreaterThanOrEqual(view.rect.asg.x + view.rect.asg.w);
        expectSoundLayout(input, view);
        // 경로를 못 찾으면 기본 라우팅으로 두되 끝점·라벨·개수는 유지한다.
        expect(view.edges.map(e => [e.source, e.target])).toEqual([['lb', 'node'], ['lb', 'worker']]);
    });
});

describe('레거시 호출은 그대로다', () => {
    test('옵션 없는 calculateLayout/buildXml은 서브넷을 가로로 놓고 경유점·포트를 만들지 않는다', () => {
        const input = fixture();
        const { positions } = calculateLayout(input);
        expect(positions['public-a'].y).toBe(positions['private-a'].y);
        expect(positions['private-a'].x).toBeGreaterThan(positions['public-a'].x);
        expect(calculateLayout(input, {})).toEqual({ positions });
        const xml = buildXml(input);
        expect(xml).not.toContain('exitX');
        expect(xml).not.toContain('mxPoint');
        expect(xml).toContain('edgeStyle=orthogonalEdgeStyle');
    });
});

// 실제 화면에 나온 공개 단어(회사 데이터 아님)와 한글 라벨.
const longLabels = () => {
    const input = fixture();
    const names = { cloud: 'AWS 클라우드', vpc: 'VPC', 'az-a': '가용 영역 A', 'az-c': '가용 영역 C',
        'public-a': 'Public Subnet A', 'private-a': 'Private Subnet A', 'public-c': 'Public Subnet C', 'private-c': 'Private Subnet C' };
    input.groups.forEach(g => { g.label = names[g.id]; });
    const labels = { 'web-a': 'EC2 A', 'web-c': 'EC2 C', 'db-a': 'RDS A', 'db-c': 'RDS C', logs: '로그 S3' };
    input.services.forEach(s => { s.label = labels[s.id]; });
    return input;
};
const ec2Template50 = () => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="t" value="x" style="${getServiceStyle('ec2')}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="50" as="geometry"/></mxCell></root></mxGraphModel>`;

describe('컴팩트 간격과 긴 그룹 라벨 경로', () => {
    test('신규 생성은 컴팩트 간격(패딩 24, 헤더 32, 간격 48)을 쓰고 면적이 줄어든다', () => {
        const view = inspect(generateArchitecture(fixture()).xml);
        const { rect } = view;
        expect(rect['web-a'].y - rect['public-a'].y).toBe(24 + 32);
        expect(rect['private-a'].y - (rect['public-a'].y + rect['public-a'].h)).toBe(24);
        expect(rect['az-c'].x - (rect['az-a'].x + rect['az-a'].w)).toBe(48);
        expect(rect.cloud.w * rect.cloud.h).toBeLessThan(0.8 * 874 * 906); // 직전 배치(874×906) 대비
    });

    test('레거시 배치의 패딩·헤더·간격 기본값은 그대로다', () => {
        const { positions } = calculateLayout(fixture());
        expect(positions['web-a'].y - positions['public-a'].y).toBe(40 + 50);
        expect(positions['az-c'].x - (positions['az-a'].x + positions['az-a'].width)).toBe(80);
    });

    test.each([['템플릿 없음', undefined], ['템플릿 50px', ec2Template50()]])('긴 영어·한글 라벨(%s): 네 경로가 모두 명시적이고 교차·충돌이 없다', (_n, templateXml) => {
        const input = longLabels();
        const view = inspect(generateArchitecture(input, { templateXml }).xml);
        expectSoundLayout(input, view);
        expect(view.edges.every(e => e.exit !== null)).toBe(true);
        expectCleanRoutes(input, view);
        expect(strictCrossings(view)).toBe(0);
    });

    test('그룹 너비는 라벨 폭 추정치보다 넓다(헤더 안에 들어감)', () => {
        const input = longLabels();
        const view = inspect(generateArchitecture(input).xml);
        for (const g of input.groups) expect(view.rect[g.id].w, g.id).toBeGreaterThanOrEqual(estimateLabelWidth(g.label));
        expect(estimateLabelWidth('Public Subnet A')).toBeGreaterThanOrEqual(7 * 'Public Subnet A'.length);
        expect(estimateLabelWidth('로그')).toBeGreaterThan(estimateLabelWidth('ab'));
    });

    test('3개 AZ도 서브넷 행이 정렬되고 경로가 교차하지 않으며 아이콘·헤더를 지나지 않는다', () => {
        const input = longLabels();
        input.groups.push(
            { id: 'az-b', type: 'az', label: '가용 영역 B', children: ['public-b', 'private-b'] },
            { id: 'public-b', type: 'subnet_public', label: 'Public Subnet B', children: [] },
            { id: 'private-b', type: 'subnet_private', label: 'Private Subnet B', children: [] },
        );
        input.groups.find(g => g.id === 'vpc').children = ['az-a', 'az-b', 'az-c'];
        input.services.push({ id: 'web-b', type: 'ec2', label: 'EC2 B', group: 'public-b' }, { id: 'db-b', type: 'rds', label: 'RDS B', group: 'private-b' });
        input.connections.push({ from: 'web-b', to: 'db-b', label: 'Query' }, { from: 'web-b', to: 'logs', label: 'Logs' });
        const view = inspect(generateArchitecture(input).xml);
        for (const kind of ['public', 'private']) {
            const ys = ['a', 'b', 'c'].map(z => view.rect[`${kind}-${z}`].y);
            expect(new Set(ys).size).toBe(1);
        }
        expectSoundLayout(input, view);
        expectCleanRoutes(input, view);
        expect(strictCrossings(view)).toBe(0);
    });

    test('같은 서브넷 오른쪽에 아이콘이 있어도 서브넷 바깥 여백 통로로 경로를 만든다', () => {
        const input = longLabels();
        input.services.push({ id: 'web-a2', type: 'ec2', label: 'EC2 A2', group: 'public-a' });
        const view = inspect(generateArchitecture(input).xml);
        expectSoundLayout(input, view);
        expectCleanRoutes(input, view);
        const toDb = view.edges.find(e => e.source === 'web-a' && e.target === 'db-a');
        const lane = toDb.waypoints[0].x;
        expect(lane < view.rect['public-a'].x || lane > view.rect['public-a'].x + view.rect['public-a'].w).toBe(true);
        expect(lane).toBeGreaterThan(view.rect['az-a'].x);
        expect(lane).toBeLessThan(view.rect['az-a'].x + view.rect['az-a'].w);
    });

    test('private 서브넷만 있는 AZ(public 없음)도 정상 배치되고 연결 끝점·라벨이 유지된다', () => {
        const input = longLabels();
        input.groups = input.groups.filter(g => g.id !== 'public-c');
        input.groups.find(g => g.id === 'az-c').children = ['private-c'];
        input.services = input.services.filter(s => s.id !== 'web-c');
        input.connections = input.connections.filter(c => c.from !== 'web-c');
        const view = inspect(generateArchitecture(input).xml);
        expectSoundLayout(input, view);
        expect(view.rect['private-c'].y).toBeGreaterThanOrEqual(view.rect['az-c'].y + 32 + 24);
        expect(view.edges.map(e => [e.source, e.target, e.label])).toEqual(input.connections.map(c => [c.from, c.to, c.label]));
    });
});

describe('큰 글자 그룹 라벨', () => {
    const bigFontTemplate = (size) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${
        ['aws_cloud', 'vpc', 'az', 'subnet_public', 'subnet_private'].map((type, i) =>
            `<mxCell id="g${i}" value="x" style="${getGroupStyle(type).replace('fontSize=12', `fontSize=${size}`)}" vertex="1" parent="1"><mxGeometry x="${i * 50}" y="0" width="40" height="40" as="geometry"/></mxCell>`).join('')
    }</root></mxGraphModel>`;

    test('fontSize 28 그룹 스타일: 헤더가 커지고 라벨 띠를 지나는 경로는 만들지 않으며 교차도 없다', () => {
        const input = longLabels();
        const view = inspect(generateArchitecture(input, { templateXml: bigFontTemplate(28) }).xml);
        const header = Math.ceil(28 * 1.5) + 14;
        expect(view.rect['web-a'].y - view.rect['public-a'].y).toBe(24 + header);
        for (const g of input.groups) expect(view.rect[g.id].w, g.id).toBeGreaterThanOrEqual(estimateLabelWidth(g.label, 28));
        expectSoundLayout(input, view);
        // 라벨 띠는 28px 글자·큰 헤더 기준으로 본다.
        const bands = input.groups.map(g => ({ id: g.id, x: view.rect[g.id].x, y: view.rect[g.id].y, w: Math.min(view.rect[g.id].w, estimateLabelWidth(g.label, 28)), h: header }));
        for (const edge of view.edges.filter(e => e.exit)) {
            const pts = polyline(edge, view.rect);
            for (let i = 0; i < pts.length - 1; i++) for (const band of bands) expect(hits(pts[i], pts[i + 1], band), `${edge.source}->${edge.target} 가 ${band.id} 라벨 통과`).toBe(false);
        }
        // 못 만든 경로는 기존 라우팅으로 남을 수 있지만 끝점·라벨·개수는 유지된다.
        expect(view.edges.map(e => [e.source, e.target, e.label])).toEqual(input.connections.map(c => [c.from, c.to, c.label]));
        expect(strictCrossings(view)).toBe(0);
    });

    test('라우터는 레이아웃과 같은 그룹 스타일로 라벨 띠를 추정한다(12px에서는 지나가던 통로가 28px에서는 막힌다)', () => {
        const positions = {
            az: { x: 0, y: 0, width: 400, height: 600 },
            g1: { x: 20, y: 60, width: 200, height: 200 }, g2: { x: 20, y: 300, width: 200, height: 200 },
            s: { x: 40, y: 110, width: 50, height: 50 }, t: { x: 40, y: 350, width: 50, height: 50 },
        };
        const args = {
            connections: [{ from: 's', to: 't' }],
            services: [{ id: 's', label: 'S', group: 'g1' }, { id: 't', label: 'T', group: 'g2' }],
            groups: [{ id: 'az', label: 'AZ' }, { id: 'g1', label: 'Public' }, { id: 'g2', label: 'AAAAAAAA' }],
            positions, parentOf: new Map([['g1', 'az'], ['g2', 'az']]),
        };
        const small = routeConnections({ ...args, groupStyles: {} })[0];
        expect(small.points[0].x).toBe(20 + 200 - 14); // 안쪽 오른쪽 통로: 12px 라벨 띠(104px) 오른쪽
        const big = routeConnections({ ...args, groupStyles: { subnet_private: 'fontSize=28;' } })[0];
        expect(big === null || big.points[0].x !== small.points[0].x).toBe(true);
        if (big) expect(big.points[0].x).toBeGreaterThan(20 + 200); // 바깥 여백 통로로 이동
    });
});
