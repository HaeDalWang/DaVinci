// src/core/xml-summarizer.js — drawio XML → Lightweight_JSON 역변환
//
// 현재 drawio XML을 파싱하여 경량 JSON 포맷으로 변환한다.

import { identifyServiceByStyle } from './aws-service-catalog.js';

/**
 * 빈 Lightweight_JSON 객체를 반환한다.
 * @returns {{groups: Array, services: Array, connections: Array}}
 */
function emptyResult() {
  return { groups: [], services: [], connections: [] };
}

/**
 * mxCell의 style 문자열에서 그룹 타입을 식별한다.
 * @param {string} style - mxCell style 속성값
 * @returns {string|null} 그룹 타입 또는 null
 */
function identifyGroupType(style) {
  if (!style) return null;

  if (style.includes('group_aws_cloud_alt')) return 'aws_cloud';
  if (style.includes('group_vpc')) return 'vpc';
  if (style.includes('group_auto_scaling_group')) return 'asg';
  if (style.includes('group_eks')) return 'eks_cluster';

  // group_security_group → subnet_public 또는 subnet_private (색상으로 구분)
  if (style.includes('group_security_group')) {
    if (style.includes('strokeColor=#7AA116') || style.includes('fillColor=#F2F6E8')) {
      return 'subnet_public';
    }
    if (style.includes('strokeColor=#00A4A6') || style.includes('fillColor=#E6F6F7')) {
      return 'subnet_private';
    }
    // 기본 fallback for security group
    return 'subnet_private';
  }

  // dashed=1 + strokeColor=#147EBA → az
  if (style.includes('dashed=1') && style.includes('strokeColor=#147EBA')) {
    return 'az';
  }

  return null;
}

/**
 * mxCell이 그룹(컨테이너)인지 판별한다.
 * @param {Element} cell - mxCell DOM 요소
 * @returns {boolean}
 */
function isGroupCell(cell) {
  const style = cell.getAttribute('style') || '';
  const connectable = cell.getAttribute('connectable');

  // container=1 스타일을 가진 셀
  if (style.includes('container=1')) return true;

  // connectable="0"이면서 그룹 스타일을 가진 셀
  if (connectable === '0' && identifyGroupType(style) !== null) return true;

  return false;
}

/**
 * mxCell이 서비스(vertex)인지 판별한다.
 * @param {Element} cell - mxCell DOM 요소
 * @returns {boolean}
 */
function isServiceCell(cell) {
  const vertex = cell.getAttribute('vertex');
  if (vertex !== '1') return false;

  const style = cell.getAttribute('style') || '';
  // 그룹 셀은 서비스가 아님
  if (isGroupCell(cell)) return false;

  // AWS 서비스 스타일 패턴이 있는지 확인
  const serviceInfo = identifyServiceByStyle(style);
  if (serviceInfo) return true;

  // mxgraph.aws4 패턴이 있으면 서비스로 간주
  if (style.includes('mxgraph.aws4')) return true;

  return false;
}

/**
 * drawio XML을 Lightweight_JSON으로 역변환한다.
 * @param {string} xml - drawio mxGraphModel XML
 * @returns {{groups: Array, services: Array, connections: Array}}
 */
export function summarizeXml(xml) {
  if (!xml || typeof xml !== 'string') return emptyResult();

  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xml, 'text/xml');
  } catch {
    return emptyResult();
  }

  // 파싱 에러 체크
  const parseError = doc.querySelector('parsererror');
  if (parseError) return emptyResult();

  const cells = doc.querySelectorAll('mxCell');
  if (!cells || cells.length === 0) return emptyResult();

  const groups = [];
  const services = [];
  const connections = [];

  // 1차 패스: 그룹, 서비스, 연결 분류
  const groupIds = new Set();
  const cellMap = new Map(); // cellId → { type: 'group'|'service', originalId }

  for (const cell of cells) {
    const id = cell.getAttribute('id');
    if (!id || id === '0' || id === '1') continue;

    const style = cell.getAttribute('style') || '';
    const edge = cell.getAttribute('edge');
    const parent = cell.getAttribute('parent');
    const value = cell.getAttribute('value') || '';
    // HTML 태그 제거
    const label = value.replace(/<[^>]*>/g, '').trim();

    // 엣지 처리
    if (edge === '1') {
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      if (source && target) {
        const conn = { from: source, to: target };
        if (label) conn.label = label;
        if (style) conn.style = style;
        connections.push(conn);
      }
      continue;
    }

    // 그룹 판별
    if (isGroupCell(cell)) {
      const groupType = identifyGroupType(style) || 'unknown';
      groupIds.add(id);
      cellMap.set(id, { type: 'group', originalId: id });
      groups.push({
        id,
        type: groupType,
        label: label || groupType,
        children: [],
        _parent: parent,
      });
      continue;
    }

    // 서비스 판별
    if (isServiceCell(cell)) {
      const serviceInfo = identifyServiceByStyle(style);
      const serviceType = serviceInfo ? serviceInfo.type : 'unknown';
      const serviceLabel = label || (serviceInfo ? serviceInfo.label : 'unknown');
      cellMap.set(id, { type: 'service', originalId: id });
      services.push({
        id,
        type: serviceType,
        label: serviceLabel,
        _parent: parent,
      });
    }
  }

  // 2차 패스: 부모-자식 관계 복원
  // 그룹의 children 배열 구축
  for (const service of services) {
    const parentId = service._parent;
    if (parentId && groupIds.has(parentId)) {
      service.group = parentId;
      const parentGroup = groups.find(g => g.id === parentId);
      if (parentGroup) {
        parentGroup.children.push(service.id);
      }
    }
    delete service._parent;
  }

  // 그룹 간 중첩 관계 (자식 그룹을 부모 그룹의 children에 추가)
  for (const group of groups) {
    const parentId = group._parent;
    if (parentId && groupIds.has(parentId)) {
      const parentGroup = groups.find(g => g.id === parentId);
      if (parentGroup) {
        parentGroup.children.push(group.id);
      }
    }
    delete group._parent;
  }

  // 연결의 from/to를 원본 id로 유지 (이미 원본 id 사용 중)

  return { groups, services, connections };
}
