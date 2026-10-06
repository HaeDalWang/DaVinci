// scripts/layout-metrics.js — draw.io XML 기준선 측정기 (B004)
//
// 측정 범위: XML 인벤토리, 사각형 겹침, 경계 상자, 보존 비교.
// 측정하지 않는 것: 선 교차·노드 관통·AZ 대칭·주 흐름 방향(호출부가 null/미측정으로 보고한다).
// 한계: style 문자열에 직접 적힌 rotation/skew만 인식한다. named style(stylesheet)로 지정된 회전 등은 알 수 없다.
// DOMParser가 전역에 있어야 한다(브라우저 또는 jsdom).

const SIZE_ATTRS = ['x', 'y', 'width', 'height'];
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** "a=1;b=2" 형태의 style 문자열을 맵으로 변환한다. */
function parseStyle(style) {
    const map = new Map();
    for (const part of style.split(';')) {
        if (!part) continue;
        const idx = part.indexOf('=');
        if (idx === -1) map.set(part, '');
        else map.set(part.slice(0, idx), part.slice(idx + 1));
    }
    return map;
}

/** XML에서 유일한 mxGraphModel의 root 요소를 찾는다. 모호하면 예외를 던진다. */
function findModel(xml) {
    if (typeof xml !== 'string' || xml.trim() === '') {
        throw new Error('XML 문자열이 비어 있습니다.');
    }
    if (typeof globalThis.DOMParser !== 'function') {
        throw new Error('DOMParser를 사용할 수 없습니다.');
    }
    const doc = new globalThis.DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
        throw new Error('XML을 파싱할 수 없습니다.');
    }
    const root = doc.documentElement;
    let model;
    if (root.localName === 'mxGraphModel') {
        model = root;
    } else if (root.localName === 'mxfile') {
        const models = root.getElementsByTagName('mxGraphModel');
        if (models.length !== 1) {
            throw new Error(`mxfile 안의 비압축 mxGraphModel이 정확히 1개여야 합니다 (발견: ${models.length}).`);
        }
        model = models[0];
    } else {
        throw new Error(`지원하지 않는 루트 요소입니다: ${root.localName}`);
    }
    const roots = Array.from(model.children).filter((el) => el.localName === 'root');
    if (roots.length !== 1) throw new Error('mxGraphModel에 root 요소가 정확히 1개여야 합니다.');
    return roots[0];
}

/** 숫자 문자열을 정규화한다(10, 10.0 → "10"). */
function normalizeNumber(value) {
    return NUMBER_PATTERN.test(value) ? String(Number(value)) : value;
}

/**
 * 요소를 속성 정렬·숫자 정규화한 문자열로 바꾼다. 값이 0인 x/y/width/height는 생략과 같게 취급한다.
 * @param {Element} el
 * @returns {string}
 */
function canonicalElement(el) {
    const attrs = Array.from(el.attributes)
        .map((a) => [a.name, normalizeNumber(a.value)])
        .filter(([name, value]) => !(SIZE_ATTRS.includes(name) && value === '0'))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join(' ');
    const children = Array.from(el.children).map(canonicalElement).join('');
    return `<${el.localName}${attrs ? ' ' + attrs : ''}>${children}</${el.localName}>`;
}

/** 셀의 직계 mxGeometry 요소를 반환한다. */
function geometryElement(cellEl) {
    const children = Array.from(cellEl.children).filter((el) => el.localName === 'mxGeometry');
    return children.find((el) => el.getAttribute('as') === 'geometry') || children[0] || null;
}

/** XML에서 셀 목록을 읽고 ID 중복을 거부한다. */
function readCells(rootEl) {
    const seen = new Set();
    const cells = [];
    const cellEls = Array.from(rootEl.getElementsByTagName('mxCell'));
    for (const el of cellEls) {
        const wrapper = el.parentElement && el.parentElement !== rootEl ? el.parentElement : null;
        const wrapperName = wrapper ? wrapper.localName : '';
        const isWrapped = wrapperName === 'object' || wrapperName === 'UserObject';
        const id = (el.getAttribute('id') || (isWrapped ? wrapper.getAttribute('id') : '')) || '';
        if (!id) throw new Error('id가 없는 mxCell이 있습니다.');
        if (seen.has(id)) throw new Error(`중복된 셀 ID: ${id}`);
        seen.add(id);
        const geoEl = geometryElement(el);
        cells.push({
            id,
            parent: el.getAttribute('parent') || '',
            vertex: el.getAttribute('vertex') === '1',
            edge: el.getAttribute('edge') === '1',
            style: el.getAttribute('style') || '',
            value: el.getAttribute('value') ?? (isWrapped ? wrapper.getAttribute('label') || '' : ''),
            source: el.getAttribute('source') || '',
            target: el.getAttribute('target') || '',
            geometry: geoEl ? canonicalElement(geoEl) : null,
            rect: null,
            _geoEl: geoEl,
        });
    }
    return cells;
}

/**
 * 각 꼭짓점의 절대 좌표 원점을 구한다. 지원하지 않는 경우 사유를 반환한다.
 * 원점 해석은 크기와 무관하다(크기 0인 그룹도 자식의 원점은 계산할 수 있다).
 * @returns {Map<string, {x:number,y:number}|{reason:string}>}
 */
function resolveOrigins(cells) {
    const byId = new Map(cells.map((c) => [c.id, c]));
    const memo = new Map();
    const visiting = new Set();

    const resolve = (cell) => {
        if (memo.has(cell.id)) return memo.get(cell.id);
        if (visiting.has(cell.id)) return { reason: 'parent-cycle' };
        visiting.add(cell.id);
        const result = compute(cell);
        visiting.delete(cell.id);
        // 순환에 참여한 셀은 모두 사유를 공유한다
        memo.set(cell.id, result);
        return result;
    };

    const compute = (cell) => {
        const geo = cell._geoEl;
        if (!geo) return { reason: 'missing-geometry' };
        if (geo.getAttribute('relative') === '1') return { reason: 'relative-geometry' };
        // offset 점이 있으면 렌더 위치 해석이 불확실하므로 보수적으로 제외한다
        const hasOffset = Array.from(geo.children).some(
            (el) => el.localName === 'mxPoint' && el.getAttribute('as') === 'offset',
        );
        if (hasOffset) return { reason: 'unsupported-offset' };
        const style = parseStyle(cell.style);
        for (const key of ['rotation', 'skew']) {
            const raw = style.get(key);
            if (raw !== undefined && Number(raw) % 360 !== 0) return { reason: `unsupported-${key}` };
        }
        const x = geo.hasAttribute('x') ? Number(geo.getAttribute('x')) : 0;
        const y = geo.hasAttribute('y') ? Number(geo.getAttribute('y')) : 0;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { reason: 'invalid-geometry' };

        let origin = { x: 0, y: 0 };
        const parent = byId.get(cell.parent);
        if (!parent || parent.edge) return { reason: 'unresolved-parent' };
        if (parent.vertex) {
            const parentOrigin = resolve(parent);
            if (parentOrigin.reason) {
                return { reason: parentOrigin.reason === 'parent-cycle' ? 'parent-cycle' : 'parent-unmeasured' };
            }
            origin = parentOrigin;
        }
        return { x: origin.x + x, y: origin.y + y };
    };

    for (const cell of cells) {
        if (cell.vertex) resolve(cell);
    }
    return memo;
}

/** 두 사각형이 양의 면적으로 겹치는지(경계 접촉은 제외) 판정한다. */
function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** cell이 ancestorId의 자손인지 확인한다(순환 방지). */
function hasAncestor(cell, ancestorId, byId) {
    const seen = new Set();
    let current = cell;
    while (current && current.parent && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.parent === ancestorId) return true;
        current = byId.get(current.parent);
    }
    return false;
}

/**
 * draw.io XML을 측정한다.
 * mxfile은 비압축 mxGraphModel이 정확히 1개일 때만 받는다. 잘못된 XML·중복 ID는 예외를 던진다.
 * 추가 필드: geometryCoverage.reasons({id: 사유}), edgeCoverage.danglingReferences(존재하지 않는 ID를 가리키는 source/target 수).
 * @param {string} xml
 * @returns {object}
 */
export function measureXml(xml) {
    const rootEl = findModel(xml);
    const cells = readCells(rootEl);
    const byId = new Map(cells.map((c) => [c.id, c]));
    const origins = resolveOrigins(cells);

    const reasons = {};
    const unmeasuredIds = [];
    for (const cell of cells) {
        if (!cell.vertex) continue;
        const origin = origins.get(cell.id);
        let reason = origin.reason || null;
        if (!reason) {
            const geo = cell._geoEl;
            const width = geo.hasAttribute('width') ? Number(geo.getAttribute('width')) : 0;
            const height = geo.hasAttribute('height') ? Number(geo.getAttribute('height')) : 0;
            if (!Number.isFinite(width) || !Number.isFinite(height)) reason = 'invalid-geometry';
            else if (width <= 0 || height <= 0) reason = 'non-positive-size';
            else cell.rect = { x: origin.x, y: origin.y, width, height };
        }
        if (reason) {
            reasons[cell.id] = reason;
            unmeasuredIds.push(cell.id);
        }
    }

    const vertices = cells.filter((c) => c.vertex);
    const edges = cells.filter((c) => c.edge);
    const parentsOfVertices = new Set(vertices.map((v) => v.parent));
    const groups = vertices.filter(
        (v) => parseStyle(v.style).get('container') === '1' || parentsOfVertices.has(v.id),
    ).length;

    const measured = vertices.filter((v) => v.rect);
    const overlapPairs = [];
    for (let i = 0; i < measured.length; i++) {
        for (let j = i + 1; j < measured.length; j++) {
            const a = measured[i];
            const b = measured[j];
            if (!overlaps(a.rect, b.rect)) continue;
            if (hasAncestor(a, b.id, byId) || hasAncestor(b, a.id, byId)) continue;
            overlapPairs.push([a.id, b.id]);
        }
    }

    let boundingBox = null;
    if (measured.length > 0) {
        const minX = Math.min(...measured.map((v) => v.rect.x));
        const minY = Math.min(...measured.map((v) => v.rect.y));
        const maxX = Math.max(...measured.map((v) => v.rect.x + v.rect.width));
        const maxY = Math.max(...measured.map((v) => v.rect.y + v.rect.height));
        boundingBox = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            area: (maxX - minX) * (maxY - minY),
        };
    }

    const edgeCoverage = {
        total: edges.length,
        bothReferences: 0,
        sourceOnly: 0,
        targetOnly: 0,
        noReferences: 0,
        withSourcePoint: 0,
        withTargetPoint: 0,
        withWaypoints: 0,
        danglingReferences: 0,
    };
    for (const edge of edges) {
        if (edge.source && edge.target) edgeCoverage.bothReferences++;
        else if (edge.source) edgeCoverage.sourceOnly++;
        else if (edge.target) edgeCoverage.targetOnly++;
        else edgeCoverage.noReferences++;
        for (const ref of [edge.source, edge.target]) {
            if (ref && !byId.has(ref)) edgeCoverage.danglingReferences++;
        }
        const geo = edge._geoEl;
        if (!geo) continue;
        const points = Array.from(geo.children);
        if (points.some((p) => p.localName === 'mxPoint' && p.getAttribute('as') === 'sourcePoint')) {
            edgeCoverage.withSourcePoint++;
        }
        if (points.some((p) => p.localName === 'mxPoint' && p.getAttribute('as') === 'targetPoint')) {
            edgeCoverage.withTargetPoint++;
        }
        const array = points.find((p) => p.localName === 'Array' && p.getAttribute('as') === 'points');
        if (array && array.children.length > 0) edgeCoverage.withWaypoints++;
    }

    return {
        cells: cells.map(({ _geoEl, ...rest }) => rest),
        counts: { cells: cells.length, vertices: vertices.length, edges: edges.length, groups },
        overlapCount: overlapPairs.length,
        overlapPairs,
        boundingBox,
        geometryCoverage: { measured: measured.length, total: vertices.length, unmeasuredIds, reasons },
        edgeCoverage,
    };
}

/**
 * 측정 결과 두 개의 보존 여부를 원본 ID 기준으로 비교한다.
 * 내용 셀(vertex/edge)만 비교하며 루트/레이어 셀은 제외한다.
 * style은 문자열 그대로, geometry는 정규화한 표현으로 비교한다.
 * addedIds는 보고만 하며 위반이 아니다(의도한 추가인지는 호출부가 확인한다).
 * expectedRemovedIds는 missingIds에서만 제외한다.
 * @param {object} before measureXml 결과
 * @param {object} after measureXml 결과
 * @param {{allowGeometryChanges?: boolean, expectedRemovedIds?: string[]}} [options]
 * @returns {object}
 */
export function comparePreservation(before, after, { allowGeometryChanges = false, expectedRemovedIds = [] } = {}) {
    const content = (m) => new Map(m.cells.filter((c) => c.vertex || c.edge).map((c) => [c.id, c]));
    const beforeMap = content(before);
    const afterMap = content(after);
    const expected = new Set(expectedRemovedIds);

    const missingIds = [];
    const changed = { style: [], parent: [], value: [], geometry: [], endpoint: [], kind: [] };
    for (const [id, b] of beforeMap) {
        const a = afterMap.get(id);
        if (!a) {
            if (!expected.has(id)) missingIds.push(id);
            continue;
        }
        if (a.style !== b.style) changed.style.push(id);
        if (a.parent !== b.parent) changed.parent.push(id);
        if (a.value !== b.value) changed.value.push(id);
        if (a.geometry !== b.geometry) changed.geometry.push(id);
        if (a.source !== b.source || a.target !== b.target) changed.endpoint.push(id);
        if (a.vertex !== b.vertex || a.edge !== b.edge) changed.kind.push(id);
    }
    const addedIds = [...afterMap.keys()].filter((id) => !beforeMap.has(id));
    const expectedRemovedStillPresentIds = [...expected].filter((id) => afterMap.has(id));

    const preservationPassed =
        missingIds.length === 0 &&
        changed.style.length === 0 &&
        changed.parent.length === 0 &&
        changed.value.length === 0 &&
        changed.endpoint.length === 0 &&
        changed.kind.length === 0 &&
        (allowGeometryChanges || changed.geometry.length === 0);

    return {
        missingIds,
        addedIds,
        changedStyleIds: changed.style,
        changedParentIds: changed.parent,
        changedValueIds: changed.value,
        changedGeometryIds: changed.geometry,
        changedEndpointIds: changed.endpoint,
        changedKindIds: changed.kind,
        expectedRemovedStillPresentIds,
        geometryChangesIgnored: allowGeometryChanges,
        preservationPassed,
    };
}
