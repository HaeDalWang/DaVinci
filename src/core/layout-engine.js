// src/core/layout-engine.js — 자동 레이아웃 엔진
//
// Lightweight_JSON의 그룹/서비스 구조를 분석하여 좌표를 계산한다.

import { getServiceDimensions } from './aws-service-catalog.js';

// Layout 상수
export const SERVICE_GAP = 80;
export const GROUP_PADDING = 40;
export const GROUP_LABEL_HEIGHT = 50;
export const GRID_MAX_COLS = 4;
// 레거시 간격(기본값)과 신규 생성(tiered) 전용 컴팩트 간격
const LEGACY_METRICS = { padding: GROUP_PADDING, header: GROUP_LABEL_HEIGHT, gap: SERVICE_GAP };
const COMPACT_HEADER_MIN = 32;
const COMPACT_PADDING = 24;
const COMPACT_GAP = 48;
const LABEL_ICON_WIDTH = 40; // 그룹 아이콘 + 왼쪽 여백
const BASE_FONT_SIZE = 12;
const DEFAULT_SERVICE_SIZE = { width: 78, height: 78 };
// 서비스 라벨이 아이콘 아래에 표시되므로 추가 여백 확보
const SERVICE_LABEL_MARGIN = 30;

/**
 * 서비스의 크기를 조회한다. 미등록 타입은 기본 78×78.
 * @param {string} type
 * @returns {{width: number, height: number}}
 */
function getSize(type) {
  return getServiceDimensions(type) || DEFAULT_SERVICE_SIZE;
}

/**
 * 서비스 목록을 그리드로 배치했을 때의 콘텐츠 크기를 계산한다.
 * @param {Array<{id: string, type: string}>} services
 * @returns {{width: number, height: number, cellPositions: Array<{id: string, relX: number, relY: number, w: number, h: number}>}}
 */
function computeGridSize(services, sizeOf = getSize, gap = SERVICE_GAP) {
  if (services.length === 0) {
    return { width: 0, height: 0, cellPositions: [] };
  }

  const cols = Math.min(services.length, GRID_MAX_COLS);
  const rows = Math.ceil(services.length / cols);

  // Find max cell dimensions per column and row for uniform grid
  let maxW = 0;
  let maxH = 0;
  for (const svc of services) {
    const dim = sizeOf(svc.type);
    if (dim.width > maxW) maxW = dim.width;
    if (dim.height > maxH) maxH = dim.height;
  }

  // 서비스 라벨이 아이콘 아래에 표시되므로 세로 간격에 라벨 마진 추가
  const effectiveH = maxH + SERVICE_LABEL_MARGIN;

  const cellPositions = [];
  for (let i = 0; i < services.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dim = sizeOf(services[i].type);
    const cellX = col * (maxW + gap);
    const cellY = row * (effectiveH + gap);
    cellPositions.push({
      id: services[i].id,
      relX: cellX,
      relY: cellY,
      w: dim.width,
      h: dim.height,
    });
  }

  const totalWidth = cols * maxW + (cols - 1) * gap;
  const totalHeight = rows * effectiveH + (rows - 1) * gap;

  return { width: totalWidth, height: totalHeight, cellPositions };
}

/**
 * 그룹 트리 노드를 구성한다.
 * @param {import('./json-to-xml-builder.js').LightweightJSON} json
 * @returns {Map<string, object>} groupId → node 매핑
 */
function buildGroupTree(json) {
  const { groups = [], services = [] } = json;

  // groupId → node
  const nodes = new Map();
  for (const g of groups) {
    nodes.set(g.id, {
      id: g.id,
      type: g.type,
      label: g.label,
      childGroupIds: [],
      childServices: [],
      parentId: null,
    });
  }

  // children 배열로 부모-자식 관계 설정
  for (const g of groups) {
    for (const childId of (g.children || [])) {
      if (nodes.has(childId)) {
        // child is a group
        nodes.get(g.id).childGroupIds.push(childId);
        nodes.get(childId).parentId = g.id;
      }
    }
  }

  // 서비스를 그룹에 할당
  for (const svc of services) {
    if (svc.group && nodes.has(svc.group)) {
      nodes.get(svc.group).childServices.push(svc);
    }
  }

  return nodes;
}

/**
 * 그룹의 내부 콘텐츠 크기를 bottom-up으로 계산한다.
 * @param {string} groupId
 * @param {Map<string, object>} nodes
 * @param {Map<string, {width: number, height: number, innerPositions: object}>} sizeCache
 * @returns {{width: number, height: number, innerPositions: object}}
 */
function computeGroupSize(groupId, nodes, sizeCache, sizeOf = getSize) {
  if (sizeCache.has(groupId)) return sizeCache.get(groupId);

  const node = nodes.get(groupId);
  const innerPositions = {}; // id → {relX, relY, w, h} relative to group content area

  // 1. 자식 그룹 크기를 먼저 재귀 계산
  const childGroupSizes = [];
  for (const cgId of node.childGroupIds) {
    const cgSize = computeGroupSize(cgId, nodes, sizeCache, sizeOf);
    childGroupSizes.push({ id: cgId, ...cgSize });
  }

  // 2. 직속 서비스를 그리드로 배치
  const grid = computeGridSize(node.childServices, sizeOf);

  // 3. 자식 그룹들과 서비스 그리드를 수직으로 쌓기
  // Layout: [child groups horizontally] then [service grid below]
  let contentWidth = 0;
  let contentHeight = 0;
  let cursorX = 0;

  // 자식 그룹을 수평으로 배치
  for (const cg of childGroupSizes) {
    innerPositions[cg.id] = { relX: cursorX, relY: 0, w: cg.width, h: cg.height };
    // 자식 그룹의 내부 위치도 전파
    Object.assign(innerPositions, prefixPositions(cg.innerPositions, cursorX, 0));
    cursorX += cg.width + SERVICE_GAP;
    if (cg.height > contentHeight) contentHeight = cg.height;
  }
  if (childGroupSizes.length > 0) {
    contentWidth = cursorX - SERVICE_GAP;
  }

  // 서비스 그리드를 자식 그룹 아래에 배치
  let serviceOffsetY = 0;
  if (childGroupSizes.length > 0 && grid.cellPositions.length > 0) {
    serviceOffsetY = contentHeight + SERVICE_GAP;
  }

  for (const cell of grid.cellPositions) {
    innerPositions[cell.id] = {
      relX: cell.relX,
      relY: serviceOffsetY + cell.relY,
      w: cell.w,
      h: cell.h,
    };
  }

  if (grid.width > contentWidth) contentWidth = grid.width;
  if (grid.cellPositions.length > 0) {
    contentHeight = serviceOffsetY + grid.height;
  }

  // 그룹 전체 크기 = 콘텐츠 + 패딩 + 라벨 영역
  const groupWidth = contentWidth + GROUP_PADDING * 2;
  const groupHeight = contentHeight + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT;

  const result = { width: groupWidth, height: groupHeight, innerPositions };
  sizeCache.set(groupId, result);
  return result;
}

/**
 * 글자 폭을 보수적으로 추정한다(실제 렌더링 측정이 아니다). ASCII는 fontSize의 약 0.67배, 한글·한자 등 넓은 글자는 약 1.17배.
 * @param {string} text
 * @param {number} [fontSize=12]
 * @returns {number}
 */
export function estimateTextWidth(text, fontSize = BASE_FONT_SIZE) {
  let units = 0;
  for (const ch of String(text ?? '')) units += ch.codePointAt(0) >= 0x2E80 ? 14 : 8;
  return Math.ceil(units * fontSize / BASE_FONT_SIZE);
}

/** 그룹 라벨(아이콘 + 글자)이 차지할 폭의 보수적 추정. */
export function estimateLabelWidth(label, fontSize = BASE_FONT_SIZE) {
  return LABEL_ICON_WIDTH + estimateTextWidth(label, fontSize);
}

/** 그룹 스타일의 fontSize로 컴팩트 헤더 높이를 정한다(최소 32). 라우터도 같은 값으로 라벨 장애물을 추정한다. */
export function compactMetrics(groupStyles) {
  const sizes = Object.values(groupStyles || {}).map(style => Number(/(?:^|;)fontSize=(\d+)/.exec(style)?.[1])).filter(Number.isFinite);
  const fontSize = Math.max(BASE_FONT_SIZE, ...sizes);
  return { padding: COMPACT_PADDING, header: Math.max(COMPACT_HEADER_MIN, Math.ceil(fontSize * 1.5) + 14), gap: COMPACT_GAP, fontSize };
}

// ---------------------------------------------------------------------------
// 신규 생성 전용 배치(tiered). options.tiered=true일 때만 쓰며 기존 호출의 결과는 바뀌지 않는다.
//  - public/private 서브넷만 자식으로 가진 그룹(AZ)은 서브넷을 위아래로 쌓는다(public이 위).
//  - 같은 타입의 형제 그룹(AZ들)은 너비·높이·행 높이를 맞춘다.
//  - 자식 그룹과 직속 서비스를 함께 가진 그룹은 직속 서비스를 오른쪽 열에 둔다.
// ---------------------------------------------------------------------------
const SUBNET_RANK = { subnet_public: 0, subnet_private: 1 };

/**
 * @param {{width?: number, height?: number, rowHeights?: number[]}} forced - 형제와 맞추기 위한 최소 크기
 * @returns {{width: number, height: number, innerPositions: object, rowHeights: number[]}}
 */
function computeTieredGroup(groupId, nodes, cache, sizeOf, metrics, forced = {}) {
  const node = nodes.get(groupId);
  const stacked = node.childGroupIds.length > 0 && node.childGroupIds.every(id => nodes.get(id).type in SUBNET_RANK);
  const kids = stacked
    ? [...node.childGroupIds].sort((a, b) => SUBNET_RANK[nodes.get(a).type] - SUBNET_RANK[nodes.get(b).type])
    : node.childGroupIds;
  const innerPositions = {};
  let contentWidth = 0;
  let contentHeight = 0;
  let rowHeights = [];

  if (stacked) {
    const natural = kids.map(id => computeTieredGroup(id, nodes, cache, sizeOf, metrics));
    const columnWidth = Math.max(...natural.map(n => n.width), (forced.width || 0) - metrics.padding * 2);
    rowHeights = natural.map((n, i) => Math.max(n.height, forced.rowHeights?.[i] || 0));
    let cursorY = 0;
    kids.forEach((id, i) => {
      computeTieredGroup(id, nodes, cache, sizeOf, metrics, { width: columnWidth, height: rowHeights[i] });
      innerPositions[id] = { relX: 0, relY: cursorY, w: columnWidth, h: rowHeights[i] };
      cursorY += rowHeights[i] + metrics.padding;
    });
    contentWidth = columnWidth;
    contentHeight = cursorY - metrics.padding;
  } else if (kids.length > 0) {
    const natural = kids.map(id => computeTieredGroup(id, nodes, cache, sizeOf, metrics));
    const sameType = kids.length > 1 && kids.every(id => nodes.get(id).type === nodes.get(kids[0]).type);
    const shared = sameType ? {
      width: Math.max(...natural.map(n => n.width)),
      height: Math.max(...natural.map(n => n.height)),
      rowHeights: natural.reduce((rows, n) => n.rowHeights.map((h, i) => Math.max(h, rows[i] || 0)).concat(rows.slice(n.rowHeights.length)), []),
    } : {};
    let cursorX = 0;
    kids.forEach((id, i) => {
      const size = sameType ? computeTieredGroup(id, nodes, cache, sizeOf, metrics, shared) : natural[i];
      innerPositions[id] = { relX: cursorX, relY: 0, w: size.width, h: size.height };
      cursorX += size.width + metrics.gap;
      contentHeight = Math.max(contentHeight, size.height);
    });
    contentWidth = cursorX - metrics.gap;
  }

  const services = node.childServices;
  if (services.length > 0 && kids.length > 0) {
    // 직속 서비스는 자식 그룹 오른쪽의 한 열에 세로로 놓고, 자식 그룹 높이의 가운데에 맞춘다.
    const columnX = contentWidth + metrics.gap;
    const sizes = services.map(svc => sizeOf(svc.type));
    const columnHeight = sizes.reduce((sum, d) => sum + d.height + SERVICE_LABEL_MARGIN, 0) + metrics.gap * (services.length - 1);
    const top = Math.max(0, (contentHeight - columnHeight) / 2);
    let cursorY = top;
    services.forEach((svc, i) => {
      innerPositions[svc.id] = { relX: columnX, relY: cursorY, w: sizes[i].width, h: sizes[i].height };
      cursorY += sizes[i].height + SERVICE_LABEL_MARGIN + metrics.gap;
    });
    contentWidth = columnX + Math.max(...sizes.map(d => d.width));
    contentHeight = Math.max(contentHeight, columnHeight);
  } else if (services.length > 0) {
    const grid = computeGridSize(services, sizeOf, metrics.gap);
    for (const cell of grid.cellPositions) innerPositions[cell.id] = { relX: cell.relX, relY: cell.relY, w: cell.w, h: cell.h };
    contentWidth = grid.width;
    contentHeight = grid.height;
  }

  // 라벨이 헤더 안에 들어가도록 보수적으로 추정한 폭 + 오른쪽 여백을 최소 너비로 한다.
  const labelWidth = estimateLabelWidth(node.label, metrics.fontSize) + metrics.padding;
  const result = {
    width: Math.max(contentWidth + metrics.padding * 2, forced.width || 0, labelWidth),
    height: Math.max(contentHeight + metrics.padding * 2 + metrics.header, forced.height || 0),
    innerPositions,
    rowHeights,
  };
  cache.set(groupId, result);
  return result;
}

/**
 * 상대 위치를 오프셋만큼 이동시킨 새 객체를 반환한다.
 * 자식 그룹 내부 요소의 위치를 부모 좌표계로 변환할 때 사용한다.
 * (실제 절대 좌표 변환은 resolveAbsolutePositions에서 재귀적으로 처리하므로
 *  여기서는 빈 객체를 반환 — 중복 오프셋 적용 방지)
 */
function prefixPositions(_innerPositions, _offsetX, _offsetY) {
  return {};
}

/**
 * 그룹 트리를 순회하며 절대 좌표를 계산한다.
 * @param {string} groupId
 * @param {number} absX - 그룹의 절대 x
 * @param {number} absY - 그룹의 절대 y
 * @param {Map<string, object>} nodes
 * @param {Map<string, object>} sizeCache
 * @param {Record<string, {x: number, y: number, width: number, height: number}>} positions
 */
function resolveAbsolutePositions(groupId, absX, absY, nodes, sizeCache, positions, metrics = LEGACY_METRICS) {
  const node = nodes.get(groupId);
  const cached = sizeCache.get(groupId);

  // 그룹 자체의 위치 기록
  positions[groupId] = {
    x: absX,
    y: absY,
    width: cached.width,
    height: cached.height,
  };

  // 콘텐츠 영역의 시작점 (패딩 + 라벨 영역)
  const contentX = absX + metrics.padding;
  const contentY = absY + metrics.padding + metrics.header;

  // 자식 그룹의 절대 좌표 계산
  for (const cgId of node.childGroupIds) {
    const rel = cached.innerPositions[cgId];
    if (rel) {
      resolveAbsolutePositions(
        cgId,
        contentX + rel.relX,
        contentY + rel.relY,
        nodes,
        sizeCache,
        positions,
        metrics,
      );
    }
  }

  // 직속 서비스의 절대 좌표 계산
  for (const svc of node.childServices) {
    const rel = cached.innerPositions[svc.id];
    if (rel) {
      positions[svc.id] = {
        x: contentX + rel.relX,
        y: contentY + rel.relY,
        width: rel.w,
        height: rel.h,
      };
    }
  }
}

/**
 * Lightweight_JSON의 그룹/서비스 구조를 분석하여 좌표를 계산한다.
 * @param {object} json - Lightweight_JSON (groups, services, connections)
 * @param {object} [options={}] - Layout options
 * @param {string} [options.direction='vertical'] - 'vertical' (default) or 'horizontal'
 * @param {Record<string, {width: number, height: number}>} [options.serviceSizes] - 타입별 아이콘 크기 override
 * @param {boolean} [options.tiered=false] - 신규 생성 전용 배치(서브넷 위아래, 형제 정렬, 직속 서비스 오른쪽 열)
 * @returns {{positions: Record<string, {x: number, y: number, width: number, height: number}>}}
 */
export function calculateLayout(json, options = {}) {
  if (!json) throw new Error('calculateLayout: json is required');

  const { direction = 'vertical', serviceSizes, tiered = false, groupStyles } = options;
  const metrics = tiered ? compactMetrics(groupStyles) : LEGACY_METRICS;
  // 템플릿이 준 타입별 크기만 덮어쓰고, 없으면 기존 카탈로그 크기를 쓴다.
  const sizeOf = (type) => serviceSizes?.[type] || getSize(type);
  const { groups = [], services = [] } = json;
  const positions = {};

  // 그룹 트리 구성
  const nodes = buildGroupTree(json);
  const sizeCache = new Map();

  // 루트 그룹 찾기 (parentId가 null인 그룹)
  const rootGroupIds = [];
  for (const [id, node] of nodes) {
    if (node.parentId === null) {
      rootGroupIds.push(id);
    }
  }

  // 각 루트 그룹의 크기를 bottom-up 계산
  for (const rgId of rootGroupIds) {
    if (tiered) computeTieredGroup(rgId, nodes, sizeCache, sizeOf, metrics);
    else computeGroupSize(rgId, nodes, sizeCache, sizeOf);
  }

  // 그룹에 속하지 않는 서비스 수집
  const groupedServiceIds = new Set();
  for (const [, node] of nodes) {
    for (const svc of node.childServices) {
      groupedServiceIds.add(svc.id);
    }
  }
  const ungroupedServices = services.filter(s => !groupedServiceIds.has(s.id));

  if (direction === 'horizontal') {
    // Horizontal mode: root groups stack vertically (top-to-bottom),
    // child groups remain horizontal (left-to-right) within each parent
    let cursorY = 0;

    for (const rgId of rootGroupIds) {
      const cached = sizeCache.get(rgId);
      resolveAbsolutePositions(rgId, 0, cursorY, nodes, sizeCache, positions, metrics);
      cursorY += cached.height + metrics.gap;
    }

    // 미소속 서비스를 그리드로 배치 (루트 그룹 아래에)
    const ungroupedGrid = computeGridSize(ungroupedServices, sizeOf, metrics.gap);
    for (const cell of ungroupedGrid.cellPositions) {
      positions[cell.id] = {
        x: cell.relX,
        y: cursorY + cell.relY,
        width: cell.w,
        height: cell.h,
      };
    }
  } else {
    // Default vertical mode: root groups arranged horizontally (left-to-right)
    let cursorX = 0;

    for (const rgId of rootGroupIds) {
      const cached = sizeCache.get(rgId);
      resolveAbsolutePositions(rgId, cursorX, 0, nodes, sizeCache, positions, metrics);
      cursorX += cached.width + metrics.gap;
    }

    // 미소속 서비스를 그리드로 배치 (루트 그룹 오른쪽에)
    const ungroupedGrid = computeGridSize(ungroupedServices, sizeOf, metrics.gap);
    for (const cell of ungroupedGrid.cellPositions) {
      positions[cell.id] = {
        x: cursorX + cell.relX,
        y: cell.relY,
        width: cell.w,
        height: cell.h,
      };
    }
  }

  return { positions };
}
