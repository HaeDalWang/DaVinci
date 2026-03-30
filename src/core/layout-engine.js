// src/core/layout-engine.js — 자동 레이아웃 엔진
//
// Lightweight_JSON의 그룹/서비스 구조를 분석하여 좌표를 계산한다.

import { getServiceDimensions } from './aws-service-catalog.js';

// Layout 상수
export const SERVICE_GAP = 80;
export const GROUP_PADDING = 40;
export const GROUP_LABEL_HEIGHT = 50;
export const GRID_MAX_COLS = 4;
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
function computeGridSize(services) {
  if (services.length === 0) {
    return { width: 0, height: 0, cellPositions: [] };
  }

  const cols = Math.min(services.length, GRID_MAX_COLS);
  const rows = Math.ceil(services.length / cols);

  // Find max cell dimensions per column and row for uniform grid
  let maxW = 0;
  let maxH = 0;
  for (const svc of services) {
    const dim = getSize(svc.type);
    if (dim.width > maxW) maxW = dim.width;
    if (dim.height > maxH) maxH = dim.height;
  }

  // 서비스 라벨이 아이콘 아래에 표시되므로 세로 간격에 라벨 마진 추가
  const effectiveH = maxH + SERVICE_LABEL_MARGIN;

  const cellPositions = [];
  for (let i = 0; i < services.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dim = getSize(services[i].type);
    const cellX = col * (maxW + SERVICE_GAP);
    const cellY = row * (effectiveH + SERVICE_GAP);
    cellPositions.push({
      id: services[i].id,
      relX: cellX,
      relY: cellY,
      w: dim.width,
      h: dim.height,
    });
  }

  const totalWidth = cols * maxW + (cols - 1) * SERVICE_GAP;
  const totalHeight = rows * effectiveH + (rows - 1) * SERVICE_GAP;

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
function computeGroupSize(groupId, nodes, sizeCache) {
  if (sizeCache.has(groupId)) return sizeCache.get(groupId);

  const node = nodes.get(groupId);
  const innerPositions = {}; // id → {relX, relY, w, h} relative to group content area

  // 1. 자식 그룹 크기를 먼저 재귀 계산
  const childGroupSizes = [];
  for (const cgId of node.childGroupIds) {
    const cgSize = computeGroupSize(cgId, nodes, sizeCache);
    childGroupSizes.push({ id: cgId, ...cgSize });
  }

  // 2. 직속 서비스를 그리드로 배치
  const grid = computeGridSize(node.childServices);

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
function resolveAbsolutePositions(groupId, absX, absY, nodes, sizeCache, positions) {
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
  const contentX = absX + GROUP_PADDING;
  const contentY = absY + GROUP_PADDING + GROUP_LABEL_HEIGHT;

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
 * @returns {{positions: Record<string, {x: number, y: number, width: number, height: number}>}}
 */
export function calculateLayout(json, options = {}) {
  if (!json) throw new Error('calculateLayout: json is required');

  const { direction = 'vertical' } = options;
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
    computeGroupSize(rgId, nodes, sizeCache);
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
      resolveAbsolutePositions(rgId, 0, cursorY, nodes, sizeCache, positions);
      cursorY += cached.height + SERVICE_GAP;
    }

    // 미소속 서비스를 그리드로 배치 (루트 그룹 아래에)
    const ungroupedGrid = computeGridSize(ungroupedServices);
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
      resolveAbsolutePositions(rgId, cursorX, 0, nodes, sizeCache, positions);
      cursorX += cached.width + SERVICE_GAP;
    }

    // 미소속 서비스를 그리드로 배치 (루트 그룹 오른쪽에)
    const ungroupedGrid = computeGridSize(ungroupedServices);
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
