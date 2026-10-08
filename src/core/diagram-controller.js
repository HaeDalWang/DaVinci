// src/core/diagram-controller.js — AI Agent 커맨드를 해석하여 DrawIO Bridge로 다이어그램을 조작

import { getLabelByType, getServiceDimensions, getServiceStyle, identifyServiceByStyle } from './aws-service-catalog.js';
import { buildXml } from './json-to-xml-builder.js';
import { ArchitectureInputError, generateArchitecture } from './architecture-generator.js';

/**
 * @typedef {Object} DiagramCommand
 * @property {'add_service'|'remove_service'|'add_connection'|'remove_connection'|'replace_all'|'generate_architecture'} type
 * @property {Object} params
 */

const DEFAULT_EDGE_STYLE =
    'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;' +
    'html=1;strokeColor=#6B7785;strokeWidth=1.5;';

function generateId() {
    return `ai_${crypto.randomUUID()}`;
}

/**
 * XML 문자열에서 모든 mxCell을 파싱하여 배열로 반환한다.
 * @param {string} xml
 * @returns {Array<{id: string, value: string, style: string, source: string, target: string}>}
 */
function parseCells(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const cellElements = doc.querySelectorAll('mxCell');
    const cells = [];
    for (const el of cellElements) {
        cells.push({
            id: el.getAttribute('id') || '',
            value: el.getAttribute('value') || '',
            style: el.getAttribute('style') || '',
            source: el.getAttribute('source') || '',
            target: el.getAttribute('target') || '',
        });
    }
    return cells;
}

/**
 * XML에서 특정 id의 mxCell(및 자식 요소 포함)을 제거한다.
 * @param {string} xml
 * @param {string} cellId
 * @returns {string}
 */
function removeCellById(xml, cellId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const cell = doc.querySelector(`mxCell[id="${CSS.escape(cellId)}"]`);
    if (cell) {
        cell.parentNode.removeChild(cell);
    }
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
}


// ---------------------------------------------------------
// add_service: 원본 XML DOM에 새 셀만 삽입하는 헬퍼
// ---------------------------------------------------------

const LABEL_SPACE = 30; // 아이콘 아래 라벨용 여유
const GROUP_HEADER = 40; // 그룹 제목 영역
const GROUP_MARGIN = 10;
const GRID_STEP = 10;
const OUTSIDE_GAP = 60;
const DEFAULT_ORIGIN = 40;
const MAX_GRID_ATTEMPTS = 20000;
const PEER_SEARCH_RADIUS = 400; // 같은 서비스 아이콘 주변 탐색 반경
const MAX_PEERS = 10; // 자리를 시도할 같은 서비스 아이콘 수
const MAX_PARENT_DEPTH = 50;
const BACKGROUND_MIN_RATIO = 3; // 배경 사각형은 아이콘보다 충분히 커야 한다

function childrenNamed(el, name) {
    return Array.from(el.children).filter(c => c.localName === name);
}

/** root 직계 자식(mxCell / object / UserObject)의 실제 mxCell 요소를 반환한다. */
function innerCell(el) {
    return el.localName === 'mxCell' ? el : childrenNamed(el, 'mxCell')[0] || null;
}

function geometryOf(el) {
    const cell = innerCell(el);
    return cell ? childrenNamed(cell, 'mxGeometry')[0] || null : null;
}

/** 숫자 속성을 엄격히 읽는다. 없으면 fallback, 있는데 숫자가 아니면 실패한다. */
function strictNumber(geo, name, fallback) {
    if (!geo.hasAttribute(name)) return fallback;
    const raw = geo.getAttribute(name).trim();
    const n = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(n)) throw new Error('add_service: 셀 geometry 값이 올바르지 않습니다.');
    return n;
}

/** vertex의 영역. geometry가 없으면 null(알 수 없음), 값이 잘못됐으면 실패한다. */
function rectOf(el) {
    const geo = geometryOf(el);
    if (!geo) return null;
    // 상대 좌표는 절대 x/y로 해석할 수 없다. resolver가 생길 때까지 지원하지 않는다.
    if (geo.getAttribute('relative') === '1') throw new Error('add_service: 상대 geometry는 지원하지 않습니다.');
    const w = strictNumber(geo, 'width', NaN);
    const h = strictNumber(geo, 'height', NaN);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) {
        throw new Error('add_service: 셀 geometry 값이 올바르지 않습니다.');
    }
    return { x: strictNumber(geo, 'x', 0), y: strictNumber(geo, 'y', 0), w, h };
}

function isEdgeCell(el) {
    return innerCell(el)?.getAttribute('edge') === '1';
}

function parseDocument(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
        throw new Error('add_service: 현재 XML을 해석할 수 없습니다.');
    }
    return doc;
}

/** 선택할 페이지의 mxGraphModel을 찾는다. 모호하거나 압축된 대상은 실패한다. */
function selectPageModel(doc, pageId, pageIndex) {
    const top = doc.documentElement;
    if (top.localName === 'mxGraphModel') {
        if (pageId !== undefined && pageId !== null) throw new Error('add_service: 단일 페이지 XML에는 pageId를 지정할 수 없습니다.');
        return top;
    }
    if (top.localName !== 'mxfile') throw new Error('add_service: 지원하지 않는 XML 형식입니다.');
    const diagrams = childrenNamed(top, 'diagram');
    let diagram;
    if (pageId !== undefined && pageId !== null) {
        if (typeof pageId !== 'string') throw new Error('add_service: pageId는 문자열이어야 합니다.');
        diagram = diagrams.find(d => d.getAttribute('id') === pageId);
        if (!diagram) throw new Error('add_service: pageId에 해당하는 페이지가 없습니다.');
    } else if (Number.isInteger(pageIndex)) {
        diagram = diagrams[pageIndex];
        if (!diagram) throw new Error('add_service: 활성 페이지를 찾을 수 없습니다.');
    } else if (diagrams.length === 1) {
        diagram = diagrams[0];
    } else {
        throw new Error('add_service: 대상 페이지가 모호합니다. pageId를 지정하세요.');
    }
    const models = childrenNamed(diagram, 'mxGraphModel');
    if (models.length === 0) throw new Error('add_service: 압축된 페이지는 지원하지 않습니다.');
    if (models.length > 1) throw new Error('add_service: 페이지에 mxGraphModel이 여러 개입니다.');
    return models[0];
}

function isContainerCell(el) {
    const cell = innerCell(el);
    if (!cell || cell.getAttribute('vertex') !== '1') return false;
    const style = cell.getAttribute('style') || '';
    return /(^|;)container=1(;|$)/.test(style) || /(^|;)(swimlane|group)(;|$)/.test(style);
}

/** 사각형과 스타일로 겹침 검사 영역(라벨 여유 포함)을 만든다. */
function occupiedFrom(r, style) {
    const extra = /verticalLabelPosition=bottom/.test(style) ? LABEL_SPACE : 0;
    return { x: r.x - GROUP_MARGIN, y: r.y - GROUP_MARGIN, w: r.w + 2 * GROUP_MARGIN, h: r.h + extra + 2 * GROUP_MARGIN };
}

/** 겹침 검사에 쓰는 형제 영역 (라벨 여유 포함) */
function occupiedRect(el) {
    const r = rectOf(el);
    if (!r) return null; // 호출부에서 알 수 없는 geometry로 처리한다.
    return occupiedFrom(r, innerCell(el).getAttribute('style') || '');
}

function intersects(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 그룹 내부에서 기존 셀과 겹치지 않는 자리를 찾는다. 없으면 null. */
function findFreeSpotInGroup(groupEl, rows, size) {
    const groupId = groupEl.getAttribute('id');
    const groupRect = rectOf(groupEl);
    if (!groupRect) return null;
    const occupied = [];
    for (const el of rows) {
        const cell = innerCell(el);
        if (cell?.getAttribute('parent') !== groupId || isEdgeCell(el)) continue;
        const rect = occupiedRect(el);
        if (!rect) return null; // 알 수 없는 하위 geometry: 안전하게 자리 없음으로 처리
        occupied.push(rect);
    }
    const need = { w: size.width, h: size.height + LABEL_SPACE };
    // ponytail: 거대/무한 그룹에서 끝없이 돌지 않도록 탐색 횟수에 상한을 둔다.
    let attempts = 0;
    for (let y = GROUP_HEADER; y + need.h + GROUP_MARGIN <= groupRect.h; y += GRID_STEP) {
        for (let x = GROUP_MARGIN; x + need.w + GROUP_MARGIN <= groupRect.w; x += GRID_STEP) {
            if (++attempts > MAX_GRID_ATTEMPTS) return null;
            const cand = { x, y, w: need.w, h: need.h };
            if (!occupied.some(o => intersects(cand, o))) return { x, y };
        }
    }
    return null;
}

/** 최상위(레이어 직속) 셀의 하단 바깥 자리를 반환한다. */
function findSpotOutside(rows, layerIds) {
    let minX = Infinity;
    let maxY = -Infinity;
    for (const el of rows) {
        const cell = innerCell(el);
        if (!cell || !layerIds.has(cell.getAttribute('parent')) || isEdgeCell(el)) continue;
        const r = rectOf(el);
        if (!r) throw new Error('add_service: 최상위 셀의 geometry를 알 수 없습니다.');
        const extra = /verticalLabelPosition=bottom/.test(cell.getAttribute('style') || '') ? LABEL_SPACE : 0;
        minX = Math.min(minX, r.x);
        maxY = Math.max(maxY, r.y + r.h + extra);
    }
    if (!Number.isFinite(minX)) return { x: DEFAULT_ORIGIN, y: DEFAULT_ORIGIN };
    return { x: minX, y: maxY + OUTSIDE_GAP };
}

// ---------------------------------------------------------
// 같은 서비스 아이콘(peer) 기준 배치
// ---------------------------------------------------------

/** 결정적 탐색 순서: 가까운 격자점부터, 같은 거리면 dy, dx 순. */
const SEARCH_OFFSETS = (() => {
    const list = [];
    for (let dy = -PEER_SEARCH_RADIUS; dy <= PEER_SEARCH_RADIUS; dy += GRID_STEP) {
        for (let dx = -PEER_SEARCH_RADIUS; dx <= PEER_SEARCH_RADIUS; dx += GRID_STEP) {
            if (dx !== 0 || dy !== 0) list.push([dx, dy, dx * dx + dy * dy]);
        }
    }
    return list.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
})();

function isHiddenOrLocked(cell) {
    return cell.getAttribute('visible') === '0' || cell.getAttribute('locked') === '1' ||
        /(^|;)locked=1(;|$)/.test(cell.getAttribute('style') || '');
}

/** 셀과 모든 조상(레이어 포함)이 보이고 잠기지 않았으며 레이어까지 이어지는지 확인한다. */
function isUsableChain(el, byId, layerIds) {
    let cell = innerCell(el);
    for (let depth = 0; cell && depth < MAX_PARENT_DEPTH; depth++) {
        if (isHiddenOrLocked(cell)) return false;
        const parentId = cell.getAttribute('parent');
        if (layerIds.has(parentId)) {
            const layerCell = innerCell(byId.get(parentId));
            return !!layerCell && !isHiddenOrLocked(layerCell);
        }
        const parent = byId.get(parentId);
        cell = parent ? innerCell(parent) : null;
    }
    return false;
}

/** 레이어 기준 절대 좌표. 조상 geometry를 알 수 없으면 null. */
function absoluteRect(el, byId, layerIds) {
    const r = rectOf(el);
    if (!r) return null;
    let { x, y } = r;
    let parentId = innerCell(el).getAttribute('parent');
    for (let depth = 0; !layerIds.has(parentId); depth++) {
        const parent = byId.get(parentId);
        const pr = parent && depth < MAX_PARENT_DEPTH ? rectOf(parent) : null;
        if (!pr) return null;
        x += pr.x;
        y += pr.y;
        parentId = innerCell(parent).getAttribute('parent');
    }
    return { x, y, w: r.w, h: r.h };
}

const NON_BACKGROUND_TOKEN = /^(shape|image|ellipse|rhombus|triangle|cloud|hexagon|text|resIcon|prIcon|edgeStyle)(=|$)/;

/** 배경/계정 사각형 후보: 컨테이너 또는 단순 rect이며 아이콘·텍스트가 아니다. */
function isBackgroundCell(el) {
    const style = innerCell(el).getAttribute('style') || '';
    if (/(^|;)text(;|$)/.test(style)) return false;
    // 컨테이너는 identify 결과(tier 유무)에 의존하지 않고 아이콘 shape만 배제한다. AWS group shape는 허용.
    if (isContainerCell(el)) return !/(^|;)resIcon=/.test(style) && !/shape=mxgraph\.aws4\.(?!group)/.test(style);
    // container=0인 AWS group 시각 프레임도 배경으로 본다(의미상 부모 선택과는 무관).
    if (/(^|;)shape=mxgraph\.aws4\.group(;|$)/.test(style) && /(^|;)grIcon=/.test(style) && !/(^|;)resIcon=/.test(style)) return true;
    if (identifyServiceByStyle(style)) return false;
    return !style.split(';').some(t => NON_BACKGROUND_TOKEN.test(t.trim()));
}

function containsRect(outer, inner) {
    return outer.x <= inner.x && outer.y <= inner.y &&
        outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;
}

/** 대상 서비스와 같은 종류이며 보이고 잠기지 않은 기존 아이콘을 문서 순서대로 반환한다. */
function findPeers(rows, byId, layerIds, serviceType) {
    const peers = [];
    for (const el of rows) {
        const cell = innerCell(el);
        if (!cell || cell.getAttribute('vertex') !== '1') continue;
        if (identifyServiceByStyle(cell.getAttribute('style') || '')?.type !== serviceType) continue;
        let r;
        try {
            r = rectOf(el);
        } catch {
            continue;
        }
        if (!r || !(r.w > 0) || !(r.h > 0) || !isUsableChain(el, byId, layerIds)) continue;
        const parentId = cell.getAttribute('parent');
        const parent = layerIds.has(parentId) ? null : byId.get(parentId);
        if (!layerIds.has(parentId) && !(parent && isContainerCell(parent))) continue;
        peers.push(el);
    }
    return peers;
}

/**
 * peer 주변의 가까운 빈 자리를 찾는다. 같은 부모에 넣으며, peer가 배경 사각형 안에 있으면 그 안에 머문다.
 * 알 수 없는 geometry나 빈 자리 없음은 null(안전 fallback).
 */
function peerPlacementArea(peerEl, rows, byId, layerIds) {
    const peerId = peerEl.getAttribute('id');
    const parentId = innerCell(peerEl).getAttribute('parent');
    const peerRect = rectOf(peerEl);
    let bounds = null;
    const items = [];
    const inLayer = layerIds.has(parentId);
    if (!inLayer) {
        const parentRect = rectOf(byId.get(parentId));
        if (!parentRect) return null;
        bounds = parentRect;
    }
    for (const el of rows) {
        const cell = innerCell(el);
        if (!cell || cell.getAttribute('vertex') !== '1') continue;
        if (!inLayer && cell.getAttribute('parent') !== parentId) continue;
        const rect = inLayer ? absoluteRect(el, byId, layerIds) : rectOf(el);
        if (!rect) return null;
        items.push({ id: el.getAttribute('id'), el, rect, style: cell.getAttribute('style') || '' });
    }
    const minW = peerRect.w * BACKGROUND_MIN_RATIO;
    const minH = peerRect.h * BACKGROUND_MIN_RATIO;
    const enclosing = items.filter(it => it.id !== peerId && it.rect.w >= minW && it.rect.h >= minH &&
        containsRect(it.rect, peerRect) && isBackgroundCell(it.el));
    return { peerRect, bounds, items, enclosing };
}

function findSpotNearPeer(peerEl, rows, byId, layerIds, size, budget) {
    const area = peerPlacementArea(peerEl, rows, byId, layerIds);
    if (!area) return null;
    const { peerRect, bounds, items, enclosing } = area;
    const ignored = new Set(enclosing.map(it => it.id));
    const obstacles = items.filter(it => !ignored.has(it.id)).map(it => occupiedFrom(it.rect, it.style));
    const need = { w: size.width, h: size.height + LABEL_SPACE };
    for (const [dx, dy] of SEARCH_OFFSETS) {
        if (budget.left-- <= 0) return null;
        const cand = { x: peerRect.x + dx, y: peerRect.y + dy, w: need.w, h: need.h };
        if (bounds && (cand.x < GROUP_MARGIN || cand.y < GROUP_HEADER ||
            cand.x + cand.w + GROUP_MARGIN > bounds.w || cand.y + cand.h + GROUP_MARGIN > bounds.h)) continue;
        if (!enclosing.every(e => containsRect(e.rect, cand))) continue;
        if (obstacles.some(o => intersects(cand, o))) continue;
        return { x: cand.x, y: cand.y };
    }
    return null;
}

/** 이동 가능한 서비스 아이콘 스타일인지 판정한다. resIcon 또는 카탈로그가 인식하는 shape 표기이며 group·text·image는 제외한다. */
function isServiceIconStyle(style) {
    if (/(^|;)resIcon=mxgraph\.aws4\./.test(style)) return true;
    const service = identifyServiceByStyle(style);
    return Boolean(service && service.tier !== 'group');
}

/** 기존 서비스 줄에 끼워 넣는다. 충돌 없는 계획만 반환하며 이 단계에서는 XML을 바꾸지 않는다. */
function reflowPeerRow(peer, rows, byId, layerIds) {
    const area = peerPlacementArea(peer, rows, byId, layerIds);
    if (!area) return null;
    const { peerRect, bounds, items, enclosing } = area;
    const parentId = innerCell(peer).getAttribute('parent');
    const line = items.filter(it => innerCell(it.el).getAttribute('parent') === parentId &&
        isServiceIconStyle(it.style) && isUsableChain(it.el, byId, layerIds) &&
        Math.abs(it.rect.y - peerRect.y) <= GRID_STEP && it.rect.h === peerRect.h &&
        enclosing.every(e => containsRect(e.rect, it.rect))).sort((a, b) => a.rect.x - b.rect.x);
    const index = line.findIndex(it => it.el === peer);
    if (index < 0) return null;
    let start = index, end = index;
    const adjacent = (a, b) => b.rect.x - a.rect.x - a.rect.w >= 0 &&
        b.rect.x - a.rect.x - a.rect.w <= peerRect.w * 2;
    while (start > 0 && adjacent(line[start - 1], line[start])) start--;
    while (end + 1 < line.length && adjacent(line[end], line[end + 1])) end++;
    const row = line.slice(start, end + 1);
    // ponytail: 연속된 작은 서비스 줄만 정리한다. 전체 페이지 재배치는 별도 레이아웃 작업이다.
    if (row.length < 2 || row.length > MAX_PEERS) return null;
    const gaps = row.slice(1).map((it, i) => it.rect.x - row[i].rect.x - row[i].rect.w).sort((a, b) => a - b);
    const gap = Math.max(GROUP_MARGIN * 2, gaps[Math.floor(gaps.length / 2)]);
    const fresh = { rect: peerRect, style: innerCell(peer).getAttribute('style') };
    const sequence = [...row];
    sequence.splice(index - start + 1, 0, fresh);
    const width = sequence.reduce((sum, it) => sum + it.rect.w, 0) + gap * (sequence.length - 1);
    const minX = Math.max(bounds ? GROUP_MARGIN : -Infinity, ...enclosing.map(e => e.rect.x + GROUP_MARGIN));
    const maxX = Math.min(bounds ? bounds.w - GROUP_MARGIN : Infinity, ...enclosing.map(e => e.rect.x + e.rect.w - GROUP_MARGIN));
    let x = Math.max(minX, Math.min(row[0].rect.x, maxX - width));
    if (x + width > maxX) return null;
    const ignored = new Set([...row, ...enclosing].map(it => it.id));
    const obstacles = items.filter(it => !ignored.has(it.id)).map(it => occupiedFrom(it.rect, it.style));
    const updates = [];
    let spot;
    for (const it of sequence) {
        const r = { x, y: peerRect.y, w: it.rect.w, h: it.rect.h + LABEL_SPACE };
        if ((bounds && (r.y < GROUP_HEADER || r.y + r.h + GROUP_MARGIN > bounds.h)) ||
            !enclosing.every(e => containsRect(e.rect, r)) || obstacles.some(o => intersects(r, o))) return null;
        if (it === fresh) spot = { x, y: r.y };
        else if (it.rect.x !== x || it.rect.y !== r.y) updates.push({ el: it.el, x, y: r.y });
        x += it.rect.w + gap;
    }
    return { spot, updates, peer, parentId };
}

/** 첫 번째로 자리를 찾은 peer와 위치를 반환한다. 각 peer 자신의 크기로 탐색하며 잘못된 geometry는 fallback 처리한다. */
function placeNearPeers(peers, rows, byId, layerIds) {
    const budget = { left: SEARCH_OFFSETS.length * Math.min(peers.length, MAX_PEERS) }; // peer마다 전체 후보를 탐색할 수 있게 한다
    for (const peer of peers.slice(0, MAX_PEERS)) {
        let spot;
        try {
            const row = reflowPeerRow(peer, rows, byId, layerIds);
            if (row) return row;
            const r = rectOf(peer);
            spot = findSpotNearPeer(peer, rows, byId, layerIds, { width: r.w, height: r.h }, budget);
        } catch {
            spot = null;
        }
        if (spot) return { spot, peer, parentId: innerCell(peer).getAttribute('parent') };
        if (budget.left <= 0) break;
    }
    return null;
}

/** 스타일을 literal 라벨용(html=0)으로 바꾼다. */
function withLiteralLabel(style) {
    if (/(^|;)html=\d/.test(style)) return style.replace(/(^|;)html=\d/, '$1html=0');
    return style && !style.endsWith(';') ? `${style};html=0;` : `${style}html=0;`;
}

function newUniqueId(doc) {
    const used = new Set(Array.from(doc.querySelectorAll('[id]')).map(e => e.getAttribute('id')));
    let id = generateId();
    while (used.has(id)) id = generateId();
    return id;
}

/**
 * 서비스를 추가한다. 관련 서비스 줄의 좌표는 정리하고 내용·연결·다른 영역은 유지한다.
 * @returns {string}
 */
function insertServiceCell(xml, params, pageIndex) {
    if (typeof params.serviceType !== 'string') throw new Error('add_service: serviceType은 문자열이어야 합니다.');
    if (params.group !== undefined && params.group !== null && (typeof params.group !== 'string' || !params.group)) {
        throw new Error('add_service: group은 비어 있지 않은 문자열이어야 합니다.');
    }
    const catalogStyle = getServiceStyle(params.serviceType);
    const catalogSize = getServiceDimensions(params.serviceType);
    if (typeof catalogStyle !== 'string' || !catalogStyle || !catalogSize) throw new Error(`add_service: 등록되지 않은 serviceType입니다: ${params.serviceType}`);
    if (params.label !== undefined && params.label !== null && typeof params.label !== 'string') {
        throw new Error('add_service: label은 문자열이어야 합니다.');
    }
    const label = params.label || getLabelByType(params.serviceType);

    const doc = parseDocument(xml);
    const model = selectPageModel(doc, params.pageId, pageIndex);
    const roots = childrenNamed(model, 'root');
    if (roots.length !== 1) throw new Error('add_service: 페이지에는 root가 정확히 하나여야 합니다.');
    const root = roots[0];
    const rows = Array.from(root.children).filter(el => el.hasAttribute('id'));

    const seen = new Set();
    for (const el of rows) {
        const id = el.getAttribute('id');
        if (seen.has(id)) throw new Error('add_service: 선택한 페이지에 중복된 셀 ID가 있습니다.');
        seen.add(id);
    }
    const isPlain = c => c.getAttribute('vertex') !== '1' && c.getAttribute('edge') !== '1';
    const rootCell = rows.find(el => {
        const c = innerCell(el);
        return c && !c.hasAttribute('parent') && isPlain(c);
    });
    const layers = rootCell
        ? rows.filter(el => {
            const c = innerCell(el);
            return c && c.getAttribute('parent') === rootCell.getAttribute('id') && isPlain(c);
        })
        : [];
    // 보이고 잠기지 않은 첫 레이어에 삽입한다.
    const layer = layers.find(el => {
        const c = innerCell(el);
        return c.getAttribute('visible') !== '0' && c.getAttribute('locked') !== '1' &&
            !/(^|;)locked=1(;|$)/.test(c.getAttribute('style') || '');
    });
    const layerIds = new Set(layers.map(el => el.getAttribute('id')));
    if (!layer) throw new Error('add_service: 보이고 잠기지 않은 레이어를 찾을 수 없습니다.');

    const byId = new Map(rows.map(el => [el.getAttribute('id'), el]));
    const peers = findPeers(rows, byId, layerIds, params.serviceType);
    const sizeOf = (peer) => {
        const r = rectOf(peer);
        return { width: r.w, height: r.h };
    };
    const catalogCellStyle = catalogStyle.replace(/html=1;?/, 'html=0;');

    let parentId = layer.getAttribute('id');
    let spot;
    let style = catalogCellStyle;
    let size = catalogSize;
    let updates = [];
    if (typeof params.group === 'string') {
        const group = rows.find(el => el.getAttribute('id') === params.group);
        if (!group || !isContainerCell(group)) {
            throw new Error('add_service: 선택한 페이지에서 group 컨테이너를 찾을 수 없습니다.');
        }
        if (!isUsableChain(group, byId, layerIds)) {
            throw new Error('add_service: group이 숨겨져 있거나 잠겨 있습니다.');
        }
        const groupId = group.getAttribute('id');
        const inGroup = peers.filter(p => innerCell(p).getAttribute('parent') === groupId);
        const groupPeer = inGroup[0] || peers[0];
        if (groupPeer) {
            style = withLiteralLabel(innerCell(groupPeer).getAttribute('style'));
            size = sizeOf(groupPeer);
        }
        const row = inGroup.length ? reflowPeerRow(inGroup[0], rows, byId, layerIds) : null;
        spot = row?.spot || findFreeSpotInGroup(group, rows, size);
        updates = row?.updates || [];
        if (!spot) throw new Error('add_service: 그룹 안에 빈 자리가 없습니다.');
        parentId = groupId;
    } else {
        const near = peers.length ? placeNearPeers(peers, rows, byId, layerIds) : null;
        if (near) {
            style = withLiteralLabel(innerCell(near.peer).getAttribute('style'));
            size = sizeOf(near.peer);
            spot = near.spot;
            parentId = near.parentId;
            updates = near.updates || [];
        } else {
            spot = findSpotOutside(rows, layerIds);
        }
    }

    for (const update of updates) {
        const geo = geometryOf(update.el);
        geo.setAttribute('x', String(update.x));
        geo.setAttribute('y', String(update.y));
    }
    const cell = doc.createElementNS(root.namespaceURI, 'mxCell');
    cell.setAttribute('id', newUniqueId(doc));
    cell.setAttribute('value', label);
    cell.setAttribute('style', style);
    cell.setAttribute('vertex', '1');
    cell.setAttribute('parent', parentId);
    const geo = doc.createElementNS(root.namespaceURI, 'mxGeometry');
    geo.setAttribute('x', String(spot.x));
    geo.setAttribute('y', String(spot.y));
    geo.setAttribute('width', String(size.width));
    geo.setAttribute('height', String(size.height));
    geo.setAttribute('as', 'geometry');
    cell.appendChild(geo);
    root.appendChild(cell);
    return new XMLSerializer().serializeToString(doc);
}

/** 질문이 필요해서 그림을 만들지 않았음을 알리는 오류. executeCommands가 questions로 돌려준다. */
class GenerationQuestionsError extends Error {
    constructor(questions) {
        super(`그림을 만들기 전에 확인할 내용이 있습니다:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
        this.questions = questions;
    }
}

// eslint-disable-next-line no-control-regex
const TITLE_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** 새 페이지 이름은 문자열이고 60자 이하이며 제어 문자가 없어야 한다(그룹 label과 같은 XML 유효성). 쓰기 전에 검사한다. */
function validateTitle(title) {
    if (title === undefined || title === null) return;
    if (typeof title !== 'string' || title.length > 60 || TITLE_CONTROL_CHARS.test(title)) {
        throw new Error('generate_architecture: title은 60자 이하의 보이는 글자여야 합니다.');
    }
}

/** 스타일을 참고할 페이지의 mxGraphModel XML을 돌려준다. 여러 페이지에서 참고 대상을 알 수 없으면 질문으로 중단한다. */
function templateModelXml(xml, pageId, pageIndex) {
    const doc = parseDocument(xml);
    const top = doc.documentElement;
    const hasPageId = pageId !== undefined && pageId !== null;
    if (top.localName === 'mxGraphModel') {
        if (hasPageId) throw new Error('generate_architecture: 단일 페이지 XML에는 pageId를 지정할 수 없습니다.');
        return new XMLSerializer().serializeToString(top);
    }
    if (top.localName !== 'mxfile') throw new Error('generate_architecture: 지원하지 않는 XML 형식입니다.');
    const diagrams = childrenNamed(top, 'diagram');
    let diagram = null;
    if (hasPageId) {
        diagram = diagrams.find(d => d.getAttribute('id') === pageId);
        if (!diagram) throw new Error('generate_architecture: 스타일을 참고할 페이지를 찾을 수 없습니다.');
    } else if (Number.isInteger(pageIndex)) {
        diagram = diagrams[pageIndex];
        if (!diagram) throw new Error('generate_architecture: 현재 페이지를 찾을 수 없습니다.');
    } else if (diagrams.length === 1) {
        diagram = diagrams[0];
    } else {
        // 조용히 기본 스타일로 만들지 않고, 참고할 페이지를 정해 달라고 묻는다(아무것도 쓰지 않음).
        throw new GenerationQuestionsError(['여러 페이지가 있는데 어느 페이지의 스타일을 참고할지 알 수 없습니다. 참고할 페이지를 선택한 뒤 같은 요청을 다시 보내주세요.']);
    }
    const models = childrenNamed(diagram, 'mxGraphModel');
    if (models.length !== 1) throw new Error('generate_architecture: 선택한 페이지가 압축되어 있거나 읽을 수 없어 스타일 참고에 쓸 수 없습니다.');
    return new XMLSerializer().serializeToString(models[0]);
}

/** 생성한 mxGraphModel을 새 페이지로 붙인 전체 XML을 만든다. 기존 페이지는 그대로 두고, 단일 모델은 mxfile 첫 페이지로 감싼다. */
function appendGeneratedPage(currentXml, modelXml, title) {
    const doc = parseDocument(currentXml);
    const top = doc.documentElement;
    let file = top;
    if (top.localName === 'mxGraphModel') {
        const wrapper = new DOMParser().parseFromString('<mxfile/>', 'text/xml');
        const first = wrapper.createElement('diagram');
        first.setAttribute('id', generateId());
        first.setAttribute('name', '페이지-1');
        first.appendChild(wrapper.importNode(top, true));
        file = wrapper.documentElement;
        file.appendChild(first);
    } else if (top.localName !== 'mxfile') {
        throw new Error('generate_architecture: 지원하지 않는 XML 형식입니다.');
    }
    const owner = file.ownerDocument;
    const used = new Set(childrenNamed(file, 'diagram').map(d => d.getAttribute('id')));
    let id = generateId();
    while (used.has(id)) id = generateId();
    const page = owner.createElement('diagram');
    page.setAttribute('id', id);
    page.setAttribute('name', typeof title === 'string' && title.trim() ? title.trim() : '생성된 아키텍처');
    page.appendChild(owner.importNode(new DOMParser().parseFromString(modelXml, 'text/xml').documentElement, true));
    file.appendChild(page);
    return new XMLSerializer().serializeToString(owner);
}

// 선택 페이지로 범위를 좁히지 못하는 레거시 명령. 다중 페이지 문서에서는 실행하지 않는다.
const WHOLE_DOCUMENT_COMMANDS = new Set(['remove_service', 'add_connection', 'remove_connection', 'replace_all']);

/** mxfile의 직접 diagram이 2개 이상인지 확인한다. 해석할 수 없으면 false(기존 동작 유지). */
function hasMultiplePages(xml) {
    try {
        const top = parseDocument(xml).documentElement;
        return top.localName === 'mxfile' && childrenNamed(top, 'diagram').length >= 2;
    } catch {
        return false;
    }
}

export class DiagramController {
    /**
     * @param {import('./drawio-bridge.js').DrawIOBridge} bridge
     * @param {import('./snapshot-manager.js').SnapshotManager} snapshotManager
     */
    constructor(bridge, snapshotManager) {
        this._bridge = bridge;
        this._snapshotManager = snapshotManager;
        this._mutated = false;
    }

    /** 실제 편집기(getEditingState+merge 지원)인지 여부 */
    _isLiveEditor() {
        return typeof this._bridge.getEditingState === 'function' && typeof this._bridge.merge === 'function';
    }

    /** 전체 XML을 반영한다. 실제 편집기는 merge로 활성 페이지를 유지하고 headless는 loadXml을 쓴다. */
    async _writeFullXml(xml) {
        if (this._isLiveEditor()) {
            const result = await this._bridge.merge(xml);
            if (result?.error) throw new Error(`XML 반영 실패: ${result.error}`);
            return;
        }
        await this._bridge.loadXml(xml);
    }

    /**
     * 커맨드 배열을 순차 실행한다.
     * 실행 전 스냅샷을 자동 저장하고, 오류 시 롤백한다.
     * @param {DiagramCommand[]} commands
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async executeCommands(commands) {
        if (!commands || commands.length === 0) {
            return { success: true, message: '실행할 커맨드가 없습니다.' };
        }

        // 실행 전 현재 XML 스냅샷 저장
        const currentXml = await this._bridge.getCurrentXml();
        // 다중 페이지 문서에서 전체 문서를 대상으로 하는 명령은 변경/스냅샷 전에 배치째 거부한다.
        const unsafe = commands.find(c => WHOLE_DOCUMENT_COMMANDS.has(c.type));
        if (unsafe && hasMultiplePages(currentXml)) {
            return {
                success: false,
                message: `여러 페이지가 있는 그림에서는 ${unsafe.type} 명령을 실행할 수 없습니다. ` +
                    '다른 페이지가 바뀌거나 사라질 수 있어 요청 전체를 취소했습니다. 서비스 추가만 지원됩니다.',
            };
        }
        const description = commands.map(c => `${c.type}: ${JSON.stringify(c.params)}`).join(', ');
        this._snapshotManager.save(currentXml, description);

        this._mutated = false;
        try {
            for (const cmd of commands) {
                await this._dispatch(cmd);
            }
            const summary = commands.map(c => c.type).join(', ');
            return { success: true, message: `커맨드 실행 완료: ${summary}` };
        } catch (err) {
            // 오류 시 스냅샷에서 롤백
            // 변경 전에 실패했다면(검증 실패) 다시 불러오지 않는다.
            if (!this._mutated) return { success: false, message: err.message, ...(err.questions && { questions: err.questions }) };
            const snapshot = this._snapshotManager.restore();
            if (snapshot) {
                try {
                    await this._writeFullXml(snapshot.xml);
                } catch (rollbackErr) {
                    return { success: false, message: `${err.message} (롤백 실패: ${rollbackErr.message})` };
                }
            }
            return { success: false, message: err.message, ...(err.questions && { questions: err.questions }) };
        }
    }

    /**
     * 커맨드 타입에 따라 적절한 핸들러를 호출한다.
     * @param {DiagramCommand} cmd
     */
    async _dispatch(cmd) {
        // add_service는 쓰기 직전에 직접 표시한다. 나머지는 기존처럼 실패 시 롤백한다.
        if (cmd.type !== 'add_service' && cmd.type !== 'generate_architecture') this._mutated = true;
        switch (cmd.type) {
            case 'add_service':
                return this._addService(cmd.params);
            case 'remove_service':
                return this._removeService(cmd.params);
            case 'add_connection':
                return this._addConnection(cmd.params);
            case 'remove_connection':
                return this._removeConnection(cmd.params);
            case 'replace_all':
                return this._replaceAll(cmd.params);
            case 'generate_architecture':
                return this._generateArchitecture(cmd.params);
            default:
                throw new Error(`지원하지 않는 커맨드 타입: ${cmd.type}`);
        }
    }

    /**
     * AWS 서비스를 선택한 페이지의 원본 XML에 셀 하나만 삽입해 추가한다.
     * @param {Object} params - { serviceType, label?, group?, pageId? }
     */
    async _addService(params) {
        if (!params?.serviceType) throw new Error('add_service: serviceType이 필요합니다.');

        let xml;
        let pageIndex = null;
        if (typeof this._bridge.getEditingState === 'function') {
            ({ xml, pageIndex } = await this._bridge.getEditingState());
        } else {
            xml = await this._bridge.getCurrentXml();
        }
        const newXml = insertServiceCell(xml, params, pageIndex);
        this._mutated = true;
        await this._writeFullXml(newXml);
    }

    /**
     * 명시적 구조 입력으로 새 페이지에 그림을 만든다. 기존 페이지는 바꾸지 않는다.
     * 질문이 필요하거나 입력이 잘못되면 아무것도 쓰지 않고 실패한다.
     * @param {Object} params - { architecture: {groups, services, connections}, pageId?, title? }
     */
    async _generateArchitecture(params) {
        if (!params || typeof params.architecture !== 'object' || params.architecture === null) {
            throw new Error('generate_architecture: architecture가 필요합니다.');
        }
        validateTitle(params.title);
        let xml;
        let pageIndex = null;
        if (typeof this._bridge.getEditingState === 'function') {
            ({ xml, pageIndex } = await this._bridge.getEditingState());
        } else {
            xml = await this._bridge.getCurrentXml();
        }
        let result;
        try {
            result = generateArchitecture(params.architecture, { templateXml: templateModelXml(xml, params.pageId, pageIndex) });
        } catch (err) {
            if (err instanceof ArchitectureInputError) throw new Error(`generate_architecture: ${err.problems.join(' / ')}`);
            throw err;
        }
        if (result.status === 'needs_input') throw new GenerationQuestionsError(result.questions);
        const newXml = appendGeneratedPage(xml, result.xml, params.title);
        this._mutated = true;
        await this._writeFullXml(newXml);
    }

    /**
     * 다이어그램에서 서비스를 제거한다.
     * @param {Object} params - { serviceId?, label? }
     */
    async _removeService(params) {
        const { serviceId, label } = params;
        if (!serviceId && !label) {
            throw new Error('remove_service: serviceId 또는 label이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        // serviceId로 먼저 검색, 없으면 label로 검색
        let target = serviceId
            ? cells.find(c => c.id === serviceId)
            : cells.find(c => c.value === label && c.style && !c.source);

        if (!target) {
            throw new Error(`remove_service: 대상 서비스를 찾을 수 없습니다 (id=${serviceId}, label=${label})`);
        }

        // 해당 서비스에 연결된 Edge도 함께 제거
        let newXml = removeCellById(xml, target.id);
        const connectedEdges = cells.filter(c => c.source === target.id || c.target === target.id);
        for (const edge of connectedEdges) {
            newXml = removeCellById(newXml, edge.id);
        }

        this._bridge.loadXml(newXml);
    }

    /**
     * 두 서비스 간 연결(Edge)을 추가한다.
     * @param {Object} params - { sourceLabel, targetLabel, label? }
     */
    async _addConnection(params) {
        const { sourceLabel, targetLabel, label = '' } = params;
        if (!sourceLabel || !targetLabel) {
            throw new Error('add_connection: sourceLabel과 targetLabel이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        const sourceCell = cells.find(c => c.value === sourceLabel && c.style && !c.source);
        const targetCell = cells.find(c => c.value === targetLabel && c.style && !c.source);

        if (!sourceCell) throw new Error(`add_connection: 소스 서비스 "${sourceLabel}"을 찾을 수 없습니다.`);
        if (!targetCell) throw new Error(`add_connection: 타겟 서비스 "${targetLabel}"을 찾을 수 없습니다.`);

        const edgeId = generateId();
        const mergeXml =
            `<mxGraphModel><root>` +
            `<mxCell id="${edgeId}" value="${label}" ` +
            `style="${DEFAULT_EDGE_STYLE}" edge="1" parent="1" ` +
            `source="${sourceCell.id}" target="${targetCell.id}">` +
            `<mxGeometry relative="1" as="geometry"/>` +
            `</mxCell>` +
            `</root></mxGraphModel>`;

        const result = await this._bridge.merge(mergeXml);
        if (result.error) {
            throw new Error(`add_connection 실패: ${result.error}`);
        }
    }

    /**
     * 두 서비스 간 연결(Edge)을 제거한다.
     * @param {Object} params - { sourceLabel, targetLabel }
     */
    async _removeConnection(params) {
        const { sourceLabel, targetLabel } = params;
        if (!sourceLabel || !targetLabel) {
            throw new Error('remove_connection: sourceLabel과 targetLabel이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        const sourceCell = cells.find(c => c.value === sourceLabel && c.style && !c.source);
        const targetCell = cells.find(c => c.value === targetLabel && c.style && !c.source);

        if (!sourceCell) throw new Error(`remove_connection: 소스 서비스 "${sourceLabel}"을 찾을 수 없습니다.`);
        if (!targetCell) throw new Error(`remove_connection: 타겟 서비스 "${targetLabel}"을 찾을 수 없습니다.`);

        const edge = cells.find(
            c => c.source === sourceCell.id && c.target === targetCell.id
        );
        if (!edge) {
            throw new Error(`remove_connection: "${sourceLabel}" → "${targetLabel}" 연결을 찾을 수 없습니다.`);
        }

        const newXml = removeCellById(xml, edge.id);
        this._bridge.loadXml(newXml);
    }

    /**
     * 전체 다이어그램을 교체한다.
     * @param {Object} params - { architecture?: LightweightJSON, xml?: string }
     */
    async _replaceAll(params) {
        if (params.architecture) {
            const xml = buildXml(params.architecture);
            this._bridge.loadXml(xml);
        } else if (params.xml) {
            // 하위 호환: 기존 XML 직접 로드
            this._bridge.loadXml(params.xml);
        } else {
            throw new Error('replace_all: architecture 또는 xml이 필요합니다.');
        }
    }
}
