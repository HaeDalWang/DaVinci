// src/core/json-to-xml-builder.js — Lightweight_JSON → drawio mxGraphModel XML 변환
//
// AI Agent가 출력하는 경량 JSON을 draw.io가 인식하는 XML로 변환한다.

import { calculateLayout } from './layout-engine.js';
import { getServiceStyle, getGroupStyle, getServiceDimensions } from './aws-service-catalog.js';

const GENERIC_SERVICE_STYLE =
  'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.generic_database;sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=#232F3E;fillColor=#232F3E;labelBackgroundColor=#ffffff;align=center;verticalLabelPosition=bottom;verticalAlign=top;html=1;';

const DEFAULT_EDGE_STYLE =
  'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#6B7785;strokeWidth=1.5;';

/**
 * XML 특수문자를 이스케이프한다.
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Lightweight_JSON을 drawio mxGraphModel XML로 변환한다.
 * @param {object} json - Lightweight_JSON (groups, services, connections)
 * @param {object} [options={}] - Layout options forwarded to calculateLayout()
 * @param {string} [options.direction='vertical'] - 'vertical' (default) or 'horizontal'
 * @returns {string} drawio XML 문자열
 */
export function buildXml(json, options = {}) {
  if (json == null) {
    throw new Error('buildXml: json is required');
  }

  const { groups = [], services = [], connections = [] } = json;

  // 모든 서비스/그룹 id를 수집 (연결 검증용)
  const allIds = new Set();
  for (const g of groups) allIds.add(g.id);
  for (const s of services) allIds.add(s.id);

  // Layout Engine으로 절대 좌표 계산
  const { positions } = calculateLayout(json, options);

  // drawio에서 parent가 설정된 mxCell은 부모 기준 상대 좌표를 사용하므로,
  // 절대 좌표를 부모 기준 상대 좌표로 변환하는 헬퍼
  function toRelative(elementId, parentId) {
    const pos = positions[elementId];
    if (!pos) return { x: 0, y: 0 };
    if (!parentId || parentId === '1') return { x: pos.x, y: pos.y };
    // parentId는 Lightweight_JSON의 그룹 id
    const parentPos = positions[parentId];
    if (!parentPos) return { x: pos.x, y: pos.y };
    return { x: pos.x - parentPos.x, y: pos.y - parentPos.y };
  }

  // 그룹 id → mxCell id 매핑
  const groupIdMap = new Map();
  // 서비스 id → mxCell id 매핑
  const serviceIdMap = new Map();

  let nextId = 2; // 0과 1은 루트 셀에 예약

  // 그룹별 부모 그룹 매핑 구축
  const groupParentMap = new Map(); // groupId → parentGroupId
  for (const g of groups) {
    for (const childId of (g.children || [])) {
      // childId가 그룹인 경우에만 부모 매핑
      if (groups.some(gr => gr.id === childId)) {
        groupParentMap.set(childId, g.id);
      }
    }
  }

  // mxCell id 할당
  for (const g of groups) {
    groupIdMap.set(g.id, String(nextId++));
  }
  for (const s of services) {
    serviceIdMap.set(s.id, String(nextId++));
  }

  const cells = [];

  // 루트 셀
  cells.push('<mxCell id="0"/>');
  cells.push('<mxCell id="1" parent="0"/>');

  // 그룹 container mxCell 생성
  for (const g of groups) {
    const cellId = groupIdMap.get(g.id);
    const parentGroupId = groupParentMap.get(g.id);
    const parentCellId = parentGroupId ? groupIdMap.get(parentGroupId) : '1';
    const pos = positions[g.id];

    let style = getGroupStyle(g.type);
    if (!style) {
      console.warn(`buildXml: unknown group type "${g.type}", using default style`);
      style = 'fillColor=none;strokeColor=#232F3E;dashed=1;verticalAlign=top;fontStyle=0;fontColor=#232F3E;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;';
    }

    // 부모 기준 상대 좌표로 변환
    const rel = toRelative(g.id, parentGroupId);
    const w = pos ? pos.width : 200;
    const h = pos ? pos.height : 200;

    cells.push(
      `<mxCell id="${escapeXml(cellId)}" value="${escapeXml(g.label)}" style="${escapeXml(style)}" vertex="1" connectable="0" parent="${escapeXml(parentCellId)}">` +
      `<mxGeometry x="${rel.x}" y="${rel.y}" width="${w}" height="${h}" as="geometry"/>` +
      `</mxCell>`
    );
  }

  // 서비스 vertex mxCell 생성
  for (const s of services) {
    const cellId = serviceIdMap.get(s.id);
    // 부모 결정: 그룹에 속하면 그룹의 mxCell id, 아니면 "1"
    const parentCellId = (s.group && groupIdMap.has(s.group)) ? groupIdMap.get(s.group) : '1';
    const pos = positions[s.id];

    let style = getServiceStyle(s.type);
    if (!style) {
      console.warn(`buildXml: unknown service type "${s.type}", using generic style`);
      style = GENERIC_SERVICE_STYLE;
    }

    const dims = getServiceDimensions(s.type) || { width: 78, height: 78 };
    // 부모 기준 상대 좌표로 변환
    const parentGroupId = s.group || null;
    const rel = toRelative(s.id, parentGroupId);

    cells.push(
      `<mxCell id="${escapeXml(cellId)}" value="${escapeXml(s.label)}" style="${escapeXml(style)}" vertex="1" parent="${escapeXml(parentCellId)}">` +
      `<mxGeometry x="${rel.x}" y="${rel.y}" width="${dims.width}" height="${dims.height}" as="geometry"/>` +
      `</mxCell>`
    );
  }

  // 연결 edge mxCell 생성
  for (const conn of connections) {
    // 존재하지 않는 id 참조 검증
    if (!allIds.has(conn.from) || !allIds.has(conn.to)) {
      console.warn(`buildXml: connection references non-existent id (from="${conn.from}", to="${conn.to}"), skipping`);
      continue;
    }

    const edgeId = String(nextId++);
    const sourceId = serviceIdMap.get(conn.from) || groupIdMap.get(conn.from);
    const targetId = serviceIdMap.get(conn.to) || groupIdMap.get(conn.to);
    const edgeStyle = conn.style || DEFAULT_EDGE_STYLE;
    const label = conn.label || '';

    cells.push(
      `<mxCell id="${escapeXml(edgeId)}" value="${escapeXml(label)}" style="${escapeXml(edgeStyle)}" edge="1" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}" parent="1">` +
      `<mxGeometry relative="1" as="geometry"/>` +
      `</mxCell>`
    );
  }

  return `<mxGraphModel><root>${cells.join('')}</root></mxGraphModel>`;
}
