// src/core/aws-architecture-builder.js
// AWS 서비스 분류 및 Lightweight_JSON 재구성 엔진
//
// analyzeXmlServices() — draw.io XML에서 서비스 노드를 추출·분류
// reorganizeForAlignment() — Lightweight_JSON을 AWS 모범사례 계층 구조로 재구성
//   summarizeXml() → reorganizeForAlignment() → buildXml() 파이프라인에서 사용

import { SERVICE_PATTERNS, SERVICE_LABELS } from './aws-service-catalog.js';

// ---------------------------------------------------------
// Lightweight_JSON 기반 재구성 함수
// summarizeXml() → reorganizeForAlignment() → buildXml() 파이프라인용
// ---------------------------------------------------------

/**
 * SERVICE_PATTERNS에서 type → tier 매핑을 구축한다.
 * @returns {Map<string, string>}
 */
function buildTypeTierMap() {
  const map = new Map();
  for (const p of SERVICE_PATTERNS) {
    if (p.tier === 'group') continue;
    map.set(p.type, p.tier);
  }
  return map;
}

const TYPE_TIER_MAP = buildTypeTierMap();

/**
 * Lightweight_JSON을 AWS 모범사례 계층 구조로 재구성한다.
 *
 * summarizeXml()의 출력을 받아 AWS Cloud > VPC > AZ > Subnet 계층으로
 * 서비스를 재배치하고, connections는 그대로 보존한다.
 *
 * @param {object} json - Lightweight_JSON { groups, services, connections }
 * @param {string} mode - 'hierarchy' 또는 'left-right'
 * @returns {object} 재구성된 Lightweight_JSON
 */
export function reorganizeForAlignment(json, mode) {
  if (!json) return { groups: [], services: [], connections: [] };

  const { services = [], connections = [] } = json;

  // 1. 서비스를 tier별로 분류
  const tierBuckets = {
    external: [],
    edge: [],
    security: [],
    public: [],
    web: [],
    db: [],
    mgmt: [],
    storage: [],
    unknown: [],
  };

  for (const svc of services) {
    const tier = TYPE_TIER_MAP.get(svc.type) || 'unknown';
    tierBuckets[tier].push(svc);
  }

  // 2. 그룹 ID 정의
  const G = {
    cloud: 'aws_cloud',
    vpc: 'vpc',
    az_a: 'az_a',
    az_b: 'az_b',
    subnet_pub_a: 'subnet_public_a',
    subnet_pub_b: 'subnet_public_b',
    subnet_web_a: 'subnet_private_web_a',
    subnet_web_b: 'subnet_private_web_b',
    asg_a: 'asg_a',
    asg_b: 'asg_b',
    subnet_db_a: 'subnet_private_db_a',
    subnet_db_b: 'subnet_private_db_b',
  };

  // 3. AZ 분할: 각 tier의 서비스를 first half → AZ-A, second half → AZ-B
  const publicA = tierBuckets.public.slice(0, Math.ceil(tierBuckets.public.length / 2));
  const publicB = tierBuckets.public.slice(Math.ceil(tierBuckets.public.length / 2));
  const webA = tierBuckets.web.slice(0, Math.ceil(tierBuckets.web.length / 2));
  const webB = tierBuckets.web.slice(Math.ceil(tierBuckets.web.length / 2));
  const dbA = tierBuckets.db.slice(0, Math.ceil(tierBuckets.db.length / 2));
  const dbB = tierBuckets.db.slice(Math.ceil(tierBuckets.db.length / 2));

  // 4. 서비스에 group 할당 + 새 서비스 배열 구축 (group 프로퍼티 설정)
  const newServices = [];

  // external → ungrouped (group 없음)
  for (const svc of tierBuckets.external) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label });
  }

  // edge, security → AWS Cloud 직속 자식
  for (const svc of [...tierBuckets.edge, ...tierBuckets.security]) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.cloud });
  }

  // mgmt, storage → VPC 직속 자식
  for (const svc of [...tierBuckets.mgmt, ...tierBuckets.storage]) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.vpc });
  }

  // public → Public Subnet (A/B)
  for (const svc of publicA) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.subnet_pub_a });
  }
  for (const svc of publicB) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.subnet_pub_b });
  }

  // web → ASG inside Private Subnet Web (A/B)
  for (const svc of webA) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.asg_a });
  }
  for (const svc of webB) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.asg_b });
  }

  // db → Private Subnet DB (A/B)
  for (const svc of dbA) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.subnet_db_a });
  }
  for (const svc of dbB) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.subnet_db_b });
  }

  // unknown → VPC 직속 자식 (fallback)
  for (const svc of tierBuckets.unknown) {
    newServices.push({ id: svc.id, type: svc.type, label: svc.label, group: G.vpc });
  }

  // 5. 그룹 계층 구축
  // 각 그룹의 children = 자식 그룹 ID + 직속 서비스 ID
  const edgeSecurityIds = [...tierBuckets.edge, ...tierBuckets.security].map(s => s.id);
  const mgmtStorageIds = [...tierBuckets.mgmt, ...tierBuckets.storage, ...tierBuckets.unknown].map(s => s.id);

  const groups = [
    {
      id: G.cloud,
      type: 'aws_cloud',
      label: 'AWS Cloud',
      children: [G.vpc, ...edgeSecurityIds],
    },
    {
      id: G.vpc,
      type: 'vpc',
      label: 'VPC',
      children: [G.az_a, G.az_b, ...mgmtStorageIds],
    },
    {
      id: G.az_a,
      type: 'az',
      label: 'Availability Zone A',
      children: [G.subnet_pub_a, G.subnet_web_a, G.subnet_db_a],
    },
    {
      id: G.az_b,
      type: 'az',
      label: 'Availability Zone B',
      children: [G.subnet_pub_b, G.subnet_web_b, G.subnet_db_b],
    },
    {
      id: G.subnet_pub_a,
      type: 'subnet_public',
      label: 'Public Subnet',
      children: publicA.map(s => s.id),
    },
    {
      id: G.subnet_pub_b,
      type: 'subnet_public',
      label: 'Public Subnet',
      children: publicB.map(s => s.id),
    },
    {
      id: G.subnet_web_a,
      type: 'subnet_private',
      label: 'Private Subnet (Web)',
      children: [G.asg_a],
    },
    {
      id: G.subnet_web_b,
      type: 'subnet_private',
      label: 'Private Subnet (Web)',
      children: [G.asg_b],
    },
    {
      id: G.asg_a,
      type: 'asg',
      label: 'Auto Scaling Group',
      children: webA.map(s => s.id),
    },
    {
      id: G.asg_b,
      type: 'asg',
      label: 'Auto Scaling Group',
      children: webB.map(s => s.id),
    },
    {
      id: G.subnet_db_a,
      type: 'subnet_private',
      label: 'Private Subnet (DB)',
      children: dbA.map(s => s.id),
    },
    {
      id: G.subnet_db_b,
      type: 'subnet_private',
      label: 'Private Subnet (DB)',
      children: dbB.map(s => s.id),
    },
  ];

  // 6. connections 보존 (그대로 복사)
  const newConnections = connections.map(c => ({ ...c }));

  return { groups, services: newServices, connections: newConnections };
}

// ---------------------------------------------------------
// XML 파서
// ---------------------------------------------------------
function parseXml(xmlString) {
    return new DOMParser().parseFromString(xmlString, 'text/xml');
}

/**
 * draw.io XML에서 서비스 노드를 추출·분류한다.
 * @param {string} xml
 * @returns {object}
 */
export function analyzeXmlServices(xml) {
    console.log('[Builder] analyzeXmlServices — xml 길이:', xml?.length);

    if (!xml || xml.trim() === '') {
        console.warn('[Builder] XML이 비어 있습니다.');
        return { external: [], edge: [], security: [], public: [], web: [], db: [], storage: [], mgmt: [], unknown: [] };
    }

    const doc = parseXml(xml);
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('draw.io XML 파싱 실패. 유효한 .drawio 파일인지 확인해주세요.');

    const cells = Array.from(doc.querySelectorAll('mxCell'));
    console.log('[Builder] 전체 mxCell 수:', cells.length);

    const services = { external: [], edge: [], security: [], public: [], web: [], db: [], storage: [], mgmt: [], unknown: [] };

    for (const cell of cells) {
        const id = cell.getAttribute('id');
        if (id === '0' || id === '1') continue;
        const style = cell.getAttribute('style') || '';
        const value = cell.getAttribute('value') || '';
        if (cell.getAttribute('edge') === '1') continue;
        if (style.includes('container=1')) continue;
        if (cell.getAttribute('vertex') !== '1') continue;

        let matched = false;
        for (const p of SERVICE_PATTERNS) {
            if (p.tier === 'group') continue;
            if (p.pattern.test(style)) {
                const label = value || SERVICE_LABELS[p.type] || p.type;
                services[p.tier].push({ id, type: p.type, style, label, originalValue: value });
                console.log(`[Builder] 감지: ${p.type} (${p.tier}) — "${label}"`);
                matched = true;
                break;
            }
        }
        if (!matched) {
            services.unknown.push({ id, type: 'unknown', style, label: value });
        }
    }

    console.log('[Builder] 분류 결과:', Object.fromEntries(Object.entries(services).map(([k, v]) => [k, v.length])));
    return services;
}


