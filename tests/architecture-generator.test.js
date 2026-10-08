import { describe, expect, test, vi } from 'vitest';
import { ArchitectureInputError, generateArchitecture } from '../src/core/architecture-generator.js';
import { buildXml } from '../src/core/json-to-xml-builder.js';
import { DiagramController } from '../src/core/diagram-controller.js';
import { SnapshotManager } from '../src/core/snapshot-manager.js';

// 공개용으로 만든 입력과 템플릿이다. 고객 데이터는 쓰지 않는다.
const input = () => ({
    groups: [
        { id: 'cloud', type: 'aws_cloud', label: 'Cloud', children: ['vpc'] },
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['az-a', 'az-b'] },
        { id: 'az-a', type: 'az', label: 'AZ A' },
        { id: 'az-b', type: 'az', label: 'AZ B' },
    ],
    services: [
        { id: 'alb', type: 'alb', label: 'ALB', group: 'vpc' },
        { id: 'web-a', type: 'ec2', label: 'Web <A> & "B"', group: 'az-a' },
        { id: 'web-b', type: 'ec2', label: 'Web B', group: 'az-b' },
        { id: 'db', type: 'rds', label: 'DB', group: 'az-a' },
        { id: 'logs', type: 's3', label: 'Logs', group: null },
    ],
    connections: [{ from: 'alb', to: 'web-a' }, { from: 'alb', to: 'web-b' }, { from: 'web-a', to: 'db', label: 'SQL' }],
});

const CUSTOM_EC2 = 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;fillColor=#123456;strokeColor=#ffffff;fontSize=10;html=1;aspect=fixed;';
const HOSTILE_EC2 = `image=javascript:alert(1);url=http://example.invalid/x;${CUSTOM_EC2}fontFamily=&lt;b&gt;x&lt;/b&gt;;`;
const VPC_FRAME = 'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fontColor=#ABCDEF;container=0;html=1;';
const templateModel = (ec2Style = CUSTOM_EC2, size = 50) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
    `<mxCell id="cust-frame" value="SECRET-CORP VPC" style="${VPC_FRAME}" vertex="1" parent="1"><mxGeometry x="900" y="900" width="500" height="300" as="geometry"/></mxCell>` +
    `<mxCell id="cust-1" value="SECRET-CORP Server" style="${ec2Style}" vertex="1" parent="1"><mxGeometry x="777" y="888" width="${size}" height="${size}" as="geometry"/></mxCell>` +
    `<mxCell id="cust-edge" value="SECRET-EDGE" edge="1" source="cust-1" target="cust-frame" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`;

const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
const cellsOf = xml => [...parse(xml).querySelectorAll('mxCell')];
const geometry = cell => {
    const g = cell.querySelector('mxGeometry');
    return { x: Number(g.getAttribute('x')), y: Number(g.getAttribute('y')), width: Number(g.getAttribute('width')), height: Number(g.getAttribute('height')) };
};
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('generateArchitecture: 유효한 입력', () => {
    test('중첩 멀티 AZ 구조와 연결을 입력 그대로 만들고 템플릿의 표현만 적용한다', () => {
        const result = generateArchitecture(input(), { templateXml: templateModel() });
        expect(result.status).toBe('ready');
        expect(result.stats).toEqual({ groups: 4, services: 5, connections: 3 });
        const cells = cellsOf(result.xml);
        const byId = new Map(cells.map(c => [c.getAttribute('id'), c]));
        // 입력 ID 유지, 소속과 연결 일치
        expect(byId.get('web-a').getAttribute('parent')).toBe('az-a');
        expect(byId.get('logs').getAttribute('parent')).toBe('1');
        expect(byId.get('az-a').getAttribute('parent')).toBe('vpc');
        const edges = cells.filter(c => c.getAttribute('edge') === '1');
        expect(edges.map(e => `${e.getAttribute('source')}>${e.getAttribute('target')}`)).toEqual(['alb>web-a', 'alb>web-b', 'web-a>db']);
        expect(edges[2].getAttribute('value')).toBe('SQL');
        // 템플릿 표현: ec2는 색과 50px, 템플릿에 없는 서비스도 대표 크기(50px)
        expect(byId.get('web-a').getAttribute('style')).toContain('fillColor=#123456');
        expect(geometry(byId.get('web-a'))).toMatchObject({ width: 50, height: 50 });
        expect(geometry(byId.get('db'))).toMatchObject({ width: 50, height: 50 });
        // container=0이던 AWS 그룹 도형도 그룹으로 인식하되 새 그림에서는 container=1
        expect(byId.get('vpc').getAttribute('style')).toContain('fontColor=#ABCDEF');
        expect(byId.get('vpc').getAttribute('style')).toContain('container=1');
        expect(result.templateUsed).toEqual({ services: ['ec2'], groups: ['vpc'] });
    });

    test('라벨은 XML 이스케이프되고 모든 스타일은 html=0이다', () => {
        const { xml } = generateArchitecture(input(), { templateXml: templateModel() });
        expect(xml).toContain('Web &lt;A&gt; &amp; &quot;B&quot;');
        expect(parse(xml).querySelector('[id="web-a"]').getAttribute('value')).toBe('Web <A> & "B"');
        for (const cell of cellsOf(xml)) {
            const style = cell.getAttribute('style');
            if (style) { expect(style).toContain('html=0'); expect(style).not.toContain('html=1'); }
        }
    });

    test('템플릿의 라벨·ID·좌표·연결과 위험한 스타일은 새 그림에 복사하지 않는다', () => {
        const { xml } = generateArchitecture(input(), { templateXml: templateModel(HOSTILE_EC2) });
        for (const leaked of ['SECRET', 'cust-', '777', '888', 'javascript', 'example.invalid', 'image=', 'url=', '<b>']) {
            expect(xml).not.toContain(leaked);
        }
        expect(parse(xml).querySelector('[id="web-a"]').getAttribute('style')).toContain('fillColor=#123456');
    });

    test('형제 아이콘은 겹치지 않고 자식은 부모 경계 안에 있다', () => {
        const { xml } = generateArchitecture(input(), { templateXml: templateModel() });
        const cells = cellsOf(xml).filter(c => c.getAttribute('vertex') === '1');
        const byParent = Map.groupBy(cells, c => c.getAttribute('parent'));
        for (const [parentId, siblings] of byParent) {
            const rects = siblings.map(geometry);
            rects.forEach((a, i) => rects.slice(i + 1).forEach(b => expect(overlaps(a, b)).toBe(false)));
            if (parentId === '1') continue;
            const parent = geometry(cells.find(c => c.getAttribute('id') === parentId));
            for (const r of rects) {
                expect(r.x).toBeGreaterThanOrEqual(0);
                expect(r.y).toBeGreaterThanOrEqual(0);
                expect(r.x + r.width).toBeLessThanOrEqual(parent.width);
                expect(r.y + r.height).toBeLessThanOrEqual(parent.height);
            }
        }
    });

    test('템플릿이 없으면 카탈로그 기본 표현을 쓰고 레거시 buildXml 호출은 그대로다', () => {
        const generated = generateArchitecture(input()).xml;
        expect(geometry(parse(generated).querySelector('[id="web-a"]'))).toMatchObject({ width: 78, height: 78 });
        const legacy = buildXml({ groups: [], services: [{ id: 'x', type: 'ec2', label: 'X' }], connections: [] });
        expect(legacy).toContain('id="2"');
        expect(legacy).toContain('html=1');
    });

    test('서비스가 말하지 않은 그룹·서비스·연결을 추가하지 않는다', () => {
        const { xml } = generateArchitecture({ services: [{ id: 'a', type: 's3', label: 'A' }], connections: [] });
        const vertices = cellsOf(xml).filter(c => c.getAttribute('vertex') === '1');
        expect(vertices.map(c => c.getAttribute('id'))).toEqual(['a']);
        expect(cellsOf(xml).some(c => c.getAttribute('edge') === '1')).toBe(false);
    });
});

describe('generateArchitecture: 질문', () => {
    test('connections를 말하지 않으면 질문하고, 빈 배열이면 연결 없음으로 허용한다', () => {
        const missing = { ...input() };
        delete missing.connections;
        const asked = generateArchitecture(missing);
        expect(asked.status).toBe('needs_input');
        expect(asked.xml).toBeUndefined();
        expect(asked.questions.join()).toContain('연결');
        const none = generateArchitecture({ ...input(), connections: [] });
        expect(none.status).toBe('ready');
        expect(none.stats.connections).toBe(0);
    });

    test('그룹이 있는데 서비스 소속을 말하지 않으면 해당 서비스만 질문하고 XML을 만들지 않는다', () => {
        const data = input();
        delete data.services[3].group;
        const result = generateArchitecture(data);
        expect(result.status).toBe('needs_input');
        expect(result.questions).toHaveLength(1);
        expect(result.questions[0]).toContain('db');
        expect(result.xml).toBeUndefined();
    });

    test('children에 적힌 소속은 group 필드 없이도 사실로 쓴다', () => {
        const data = input();
        delete data.services[3].group;
        data.groups[2].children = ['db'];
        const result = generateArchitecture(data);
        expect(result.status).toBe('ready');
        expect(parse(result.xml).querySelector('[id="db"]').getAttribute('parent')).toBe('az-a');
    });

    test('서비스가 하나도 없으면 질문한다', () => {
        expect(generateArchitecture({ groups: [], services: [], connections: [] }).status).toBe('needs_input');
    });
});

describe('generateArchitecture: 잘못된 입력은 거부한다', () => {
    const mutate = fn => { const data = input(); fn(data); return data; };
    const cases = {
        'null': null,
        '배열': [],
        'services가 배열 아님': { services: {} },
        '중복 ID': mutate(d => { d.services[1].id = 'alb'; }),
        '그룹과 서비스 ID 중복': mutate(d => { d.services[0].id = 'vpc'; }),
        '예약 ID 0': mutate(d => { d.services[0].id = '0'; }),
        '예약 ID 1': mutate(d => { d.groups[0].id = '1'; }),
        '알 수 없는 serviceType': mutate(d => { d.services[0].type = 'not_a_service'; }),
        '알 수 없는 그룹 타입': mutate(d => { d.groups[0].type = 'not_a_group'; }),
        '없는 그룹을 가리키는 서비스': mutate(d => { d.services[0].group = 'ghost'; }),
        'children에 없는 ID': mutate(d => { d.groups[0].children.push('ghost'); }),
        '순환': mutate(d => { d.groups[0].children = ['vpc']; d.groups[1].children = ['cloud']; }),
        '자기 자신을 품는 그룹': mutate(d => { d.groups[2].children = ['az-a']; }),
        '부모 둘': mutate(d => { d.groups[3].children = ['web-a']; }),
        '서비스 group과 children 충돌': mutate(d => { d.groups[2].children = ['web-b']; }),
        '최상위(null)인데 children에 있음': mutate(d => { d.groups[2].children = ['logs']; }),
        '존재하지 않는 연결 끝': mutate(d => { d.connections[0].to = 'ghost'; }),
        '자기 연결': mutate(d => { d.connections[0].to = 'alb'; }),
        '중복 연결': mutate(d => { d.connections.push({ ...d.connections[0] }); }),
        '제어 문자 라벨': mutate(d => { d.services[0].label = 'a\u0000b'; }),
        'inherited 서비스 타입 constructor': mutate(d => { d.services[0].type = 'constructor'; }),
        'inherited 서비스 타입 toString': mutate(d => { d.services[0].type = 'toString'; }),
        'inherited 서비스 타입 __proto__': mutate(d => { d.services[0].type = '__proto__'; }),
        'inherited 그룹 타입 constructor': mutate(d => { d.groups[0].type = 'constructor'; }),
        'inherited 그룹 타입 __proto__': mutate(d => { d.groups[0].type = '__proto__'; }),
        '서비스 ID __proto__': mutate(d => { d.services[4].id = '__proto__'; }),
        '그룹 ID constructor': mutate(d => { d.groups[2].id = 'constructor'; d.groups[1].children[0] = 'constructor'; d.services[1].group = 'constructor'; d.services[3].group = 'constructor'; }),
        'prototype ID': mutate(d => { d.services[4].id = 'prototype'; }),
        '같은 부모 children 중복': mutate(d => { d.groups[1].children = ['az-a', 'az-b', 'az-a']; }),
    };
    test.each(Object.entries(cases))('%s', (_name, data) => {
        expect(() => generateArchitecture(data)).toThrow(ArchitectureInputError);
    });

    test('읽을 수 없는 템플릿은 거부한다', () => {
        for (const templateXml of ['not xml', '<mxfile/>', '<foo/>']) {
            expect(() => generateArchitecture(input(), { templateXml })).toThrow();
        }
    });

    test('연결이 상한(1000)을 넘으면 검증 전에 친절한 오류로 거부하고 XML을 쓰지 않는다', async () => {
        const data = input();
        data.connections = Array.from({ length: 1001 }, (_, i) => ({ from: 'alb', to: i % 2 ? 'web-a' : 'web-b', label: String(i) }));
        expect(() => generateArchitecture(data)).toThrow(/1000개 이하/);
        const bridgeXml = `<mxfile><diagram id="p1" name="p1">${templateModel()}</diagram></mxfile>`;
        const merge = vi.fn(async () => ({}));
        const bridge = { getCurrentXml: async () => bridgeXml, getEditingState: async () => ({ xml: bridgeXml, pageIndex: 0 }), merge };
        const result = await new DiagramController(bridge, new SnapshotManager()).executeCommands([{ type: 'generate_architecture', params: { architecture: data } }]);
        expect(result.success).toBe(false);
        expect(result.message).toContain('1000');
        expect(merge).not.toHaveBeenCalled();
    });

    test('입력 객체를 바꾸지 않는다', () => {
        const data = input();
        const before = JSON.stringify(data);
        generateArchitecture(data, { templateXml: templateModel() });
        expect(JSON.stringify(data)).toBe(before);
    });
});

describe('DiagramController generate_architecture', () => {
    const page = (id, ec2Style) => `<diagram id="${id}" name="${id}">${templateModel(ec2Style)}</diagram>`;
    const makeBridge = (xml, { pageIndex = 0, failFirstMerge = false } = {}) => {
        const state = { xml };
        const bridge = {
            getCurrentXml: async () => state.xml,
            getEditingState: async () => ({ xml: state.xml, pageIndex }),
            merge: vi.fn(async next => {
                if (failFirstMerge && bridge.merge.mock.calls.length === 1) return { error: 'write failed' };
                state.xml = next;
                return {};
            }),
        };
        return { state, bridge, controller: new DiagramController(bridge, new SnapshotManager()) };
    };
    const generate = (params = {}) => [{ type: 'generate_architecture', params: { architecture: input(), ...params } }];

    test('새 페이지를 추가하고 기존 모든 페이지를 그대로 보존하며 pageId로 고른 페이지의 스타일을 참고한다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}${page('p2', CUSTOM_EC2.replace('#123456', '#654321'))}</mxfile>`;
        const { state, controller } = makeBridge(xml, { pageIndex: 0 });
        const result = await controller.executeCommands(generate({ pageId: 'p2', title: '신규' }));
        expect(result.success).toBe(true);
        const before = parse(xml), after = parse(state.xml);
        const pages = [...after.querySelectorAll('diagram')];
        expect(pages).toHaveLength(3);
        expect(pages[0].outerHTML).toBe(before.querySelectorAll('diagram')[0].outerHTML);
        expect(pages[1].outerHTML).toBe(before.querySelectorAll('diagram')[1].outerHTML);
        expect(pages[2].getAttribute('name')).toBe('신규');
        expect(pages[2].querySelector('[id="web-a"]').getAttribute('style')).toContain('fillColor=#654321');
    });

    test('단일 mxGraphModel도 기존 그림을 보존한 mxfile로 묶어 새 페이지를 추가한다', async () => {
        const xml = templateModel();
        const { state, controller } = makeBridge(xml, { pageIndex: null });
        const result = await controller.executeCommands(generate());
        expect(result.success).toBe(true);
        const pages = [...parse(state.xml).querySelectorAll('diagram')];
        expect(pages).toHaveLength(2);
        expect(pages[0].querySelector('mxGraphModel').outerHTML).toBe(parse(xml).documentElement.outerHTML);
        expect(pages[1].querySelector('[id="web-a"]')).not.toBeNull();
    });

    test('질문이 필요하면 아무것도 쓰지 않고 질문을 돌려준다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}</mxfile>`;
        const { state, bridge, controller } = makeBridge(xml);
        const architecture = input();
        delete architecture.connections;
        const result = await controller.executeCommands(generate({ architecture }));
        expect(result.success).toBe(false);
        expect(result.questions.join()).toContain('연결');
        expect(result.message).toContain('연결');
        expect(bridge.merge).not.toHaveBeenCalled();
        expect(state.xml).toBe(xml);
    });

    test('잘못된 입력은 읽기 쉬운 메시지로 실패하고 아무것도 쓰지 않는다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}</mxfile>`;
        const { state, bridge, controller } = makeBridge(xml);
        const architecture = input();
        architecture.services[0].type = 'not_a_service';
        const result = await controller.executeCommands(generate({ architecture }));
        expect(result.success).toBe(false);
        expect(result.message).toContain('not_a_service');
        expect(bridge.merge).not.toHaveBeenCalled();
        expect(state.xml).toBe(xml);
    });

    test('쓰기에 실패하면 원본으로 복원하고 성공으로 보고하지 않는다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}</mxfile>`;
        const { state, bridge, controller } = makeBridge(xml, { failFirstMerge: true });
        const result = await controller.executeCommands(generate());
        expect(result.success).toBe(false);
        expect(bridge.merge).toHaveBeenCalledTimes(2);
        expect(state.xml).toBe(xml);
    });

    test('압축되어 읽을 수 없는 선택 페이지는 거부한다', async () => {
        const xml = '<mxfile><diagram id="p1" name="p1">eJzLSM3JyVcozy/KSQEAGgsEXQ==</diagram></mxfile>';
        const { state, bridge, controller } = makeBridge(xml);
        const result = await controller.executeCommands(generate());
        expect(result.success).toBe(false);
        expect(bridge.merge).not.toHaveBeenCalled();
        expect(state.xml).toBe(xml);
    });

    test('여러 페이지인데 스타일을 참고할 페이지를 모르면 조용히 기본값으로 만들지 않고 질문으로 멈춘다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}${page('p2', CUSTOM_EC2)}</mxfile>`;
        const { state, bridge, controller } = makeBridge(xml, { pageIndex: null });
        const result = await controller.executeCommands(generate());
        expect(result.success).toBe(false);
        expect(result.questions.join()).toContain('페이지');
        expect(bridge.merge).not.toHaveBeenCalled();
        expect(state.xml).toBe(xml);
        // 페이지를 정한 뒤 같은 요청은 계속할 수 있다.
        const retried = await controller.executeCommands(generate({ pageId: 'p2' }));
        expect(retried.success).toBe(true);
    });

    test('빈 그림, 단일 mxGraphModel, 1페이지 문서는 참고 대상을 정할 수 있어 기본 스타일로 생성한다', async () => {
        const empty = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
        for (const xml of [empty, `<mxfile><diagram id="only" name="only">${empty}</diagram></mxfile>`]) {
            const { state, controller } = makeBridge(xml, { pageIndex: null });
            expect((await controller.executeCommands(generate())).success).toBe(true);
            expect(parse(state.xml).querySelector('[id="web-a"]').getAttribute('style')).toContain('resIcon=mxgraph.aws4.ec2');
        }
    });

    test('제어 문자가 든 title은 쓰기 전에 거부하고 따옴표·꺾쇠는 속성에서 이스케이프된다', async () => {
        const xml = `<mxfile>${page('p1', CUSTOM_EC2)}</mxfile>`;
        const bad = makeBridge(xml);
        for (const title of ['a\u0000b', 'x'.repeat(61), 42]) {
            const result = await bad.controller.executeCommands(generate({ title }));
            expect(result.success).toBe(false);
        }
        expect(bad.bridge.merge).not.toHaveBeenCalled();
        expect(bad.state.xml).toBe(xml);
        const ok = makeBridge(xml);
        await ok.controller.executeCommands(generate({ title: 'A"B<C>&' }));
        expect(parse(ok.state.xml).querySelectorAll('diagram')[1].getAttribute('name')).toBe('A"B<C>&');
    });
});
