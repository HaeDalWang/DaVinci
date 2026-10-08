// src/core/edge-router.js — 신규 생성 전용 연결선 경로 (일반 그래프 라우터가 아니다)
//
// 지원하는 두 경우만 명시적 포트·경유점을 만든다. 나머지는 null을 돌려주고 호출자가 기존 라우팅을 쓴다.
//  1) 위아래로 쌓인 형제 서브넷의 서비스끼리: 서브넷 오른쪽 여백(없으면 왼쪽)의 세로 통로.
//  2) 중첩 그룹 안의 서비스에서 조상 그룹 직속(오른쪽 열) 서비스로: 자기 그룹 위쪽(안 되면 아래쪽) 틈새를 지나 오른쪽 열로.
// 세로 통로는 서브넷 안쪽 여백을 먼저, 라벨 띠나 아이콘에 막히면 서브넷 바깥(부모 그룹 여백 안)의 제한된 통로를 쓴다.
// 만든 경로가 다른 서비스 아이콘·그룹 라벨 띠를 지나면 버린다. 글자 폭은 보수적 추정이며 실제 렌더링 측정이 아니다.

import { compactMetrics, estimateLabelWidth, estimateTextWidth } from './layout-engine.js';

const LANE_INSET = 14;
const LANE_STEP = 10;
const CORRIDOR_OFFSET = 15;
const APPROACH_GAP = 20;
const LABEL_BAND_HEIGHT = 30;
const OUTSIDE_LANE_START = 8;
const OUTSIDE_LANE_STEP = 8;
const OUTSIDE_LANE_MARGIN = 4;
const SERVICE_LABEL_HEIGHT = 30;
const ICON_SIDE_PAD = 10;

const PORT = { right: [1, 0.5], left: [0, 0.5] };

const cx = r => r.x + r.w / 2;
const cy = r => r.y + r.h / 2;
const anchor = (r, [px, py]) => ({ x: r.x + r.w * px, y: r.y + r.h * py });
const segmentHits = (a, b, r) => {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
};

/**
 * @param {object} args
 * @param {Array<{from: string, to: string}>} args.connections
 * @param {Array<{id: string, label: string, group: string|null}>} args.services
 * @param {Array<{id: string, label: string}>} args.groups
 * @param {Record<string, {x: number, y: number, width: number, height: number}>} args.positions - 절대 좌표
 * @param {Map<string, string|null>} args.parentOf - 그룹 id → 부모 그룹 id
 * @param {Record<string, string>} [args.groupStyles] - 레이아웃에 쓴 그룹 스타일(라벨 글자 크기·헤더 높이 추정용)
 * @returns {Array<null | {exit: number[], entry: number[], points: Array<{x: number, y: number}>}>} connections와 같은 순서
 */
export function routeConnections({ connections, services, groups, positions, parentOf, groupStyles }) {
  const metrics = compactMetrics(groupStyles); // 레이아웃과 같은 글자 크기·헤더 높이로 라벨 띠를 추정한다
  const rectOf = (id) => {
    const p = positions[id];
    return p ? { x: p.x, y: p.y, w: p.width, h: p.height } : null;
  };
  const serviceById = new Map(services.map(s => [s.id, s]));
  const obstacles = [
    ...services.map((s) => {
      const r = rectOf(s.id);
      // 아이콘 아래 라벨이 아이콘보다 넓으면 그 폭까지 장애물로 본다.
      const half = Math.max(r.w / 2 + ICON_SIDE_PAD, estimateTextWidth(s.label) / 2 + 4);
      return { id: s.id, r: { x: r.x + r.w / 2 - half, y: r.y, w: half * 2, h: r.h + SERVICE_LABEL_HEIGHT } };
    }),
    ...groups.map(g => {
      const r = rectOf(g.id);
      return { id: g.id, r: { x: r.x, y: r.y, w: Math.min(r.w, estimateLabelWidth(g.label, metrics.fontSize)), h: Math.max(LABEL_BAND_HEIGHT, metrics.header) }, band: true };
    }),
  ];
  const ancestors = (groupId) => {
    const chain = [];
    for (let at = groupId; at; at = parentOf.get(at)) chain.push(at);
    return chain;
  };
  const lanesUsed = new Map();
  const accepted = []; // 이미 확정한 경로의 선분들

  // 서로 다른 연결선이 직교로 엇갈리면(끝점·공선·T자 합류 제외) 그 후보는 버린다.
  const between = (v, p, q) => v > Math.min(p, q) && v < Math.max(p, q);
  const crossesAccepted = (path) => path.some((a, i) => i < path.length - 1 && accepted.some(([c, d]) => {
    const b = path[i + 1];
    if ((a.y === b.y) === (c.y === d.y)) return false;
    const [h1, h2, v1, v2] = a.y === b.y ? [a, b, c, d] : [c, d, a, b];
    return between(v1.x, h1.x, h2.x) && between(h1.y, v1.y, v2.y);
  }));

  const valid = (path, sourceId, targetId) => path.every((a, i) => i === path.length - 1 ||
    obstacles.every(o => o.id === sourceId || o.id === targetId || !segmentHits(a, path[i + 1], o.r)));

  const routeOne = ({ from, to }) => {
    const source = serviceById.get(from);
    const target = serviceById.get(to);
    if (!source?.group || !target || !positions[from] || !positions[to]) return null;
    const s = rectOf(from), t = rectOf(to);
    const sg = rectOf(source.group);
    const sameColumn = target.group && target.group !== source.group &&
      parentOf.get(target.group) === parentOf.get(source.group) &&
      rectOf(target.group).x === sg.x && rectOf(target.group).w === sg.w;
    const outerTarget = target.group && target.group !== source.group && ancestors(source.group).includes(target.group) &&
      t.x > sg.x + sg.w;
    if (!sameColumn && !outerTarget) return null;

    // 통로 후보: 서브넷 안쪽 여백(오른쪽, 왼쪽) 다음에 서브넷 바깥 여백(오른쪽, 왼쪽). 바깥은 부모 그룹 안으로 제한한다.
    const parentRect = parentOf.get(source.group) ? rectOf(parentOf.get(source.group)) : null;
    const lanes = [];
    for (const kind of ['inside', 'outside']) {
      for (const side of ['right', 'left']) {
        const key = `${side}:${kind}:${source.group}`;
        const k = lanesUsed.get(key) || 0;
        const offset = kind === 'inside' ? LANE_INSET + LANE_STEP * k : OUTSIDE_LANE_START + OUTSIDE_LANE_STEP * k;
        const x = kind === 'inside'
          ? (side === 'right' ? sg.x + sg.w - offset : sg.x + offset)
          : (side === 'right' ? sg.x + sg.w + offset : sg.x - offset);
        if (kind === 'outside' && (!parentRect || x > parentRect.x + parentRect.w - OUTSIDE_LANE_MARGIN || x < parentRect.x + OUTSIDE_LANE_MARGIN)) continue;
        lanes.push({ side, x, k, key });
      }
    }
    const candidates = [];
    for (const lane of lanes) {
      if (sameColumn) {
        const entrySide = lane.x >= cx(t) ? 'right' : 'left';
        candidates.push({ lane, exit: PORT[lane.side], entry: PORT[entrySide], points: [{ x: lane.x, y: cy(s) }, { x: lane.x, y: cy(t) }] });
      } else {
        // 서브넷 위쪽 틈새를 먼저 쓴다: 아래쪽 틈새는 서브넷 사이를 오가는 세로 연결과 교차하기 쉽다.
        for (const corridorY of [sg.y - CORRIDOR_OFFSET, sg.y + sg.h + CORRIDOR_OFFSET]) {
          const approachX = t.x - APPROACH_GAP;
          candidates.push({
            lane, exit: PORT[lane.side], entry: PORT.left,
            points: [{ x: lane.x, y: cy(s) }, { x: lane.x, y: corridorY }, { x: approachX, y: corridorY }, { x: approachX, y: cy(t) }],
          });
        }
      }
    }
    for (const c of candidates) {
      const path = [anchor(s, c.exit), ...c.points, anchor(t, c.entry)];
      if (!valid(path, from, to) || crossesAccepted(path)) continue;
      path.slice(0, -1).forEach((a, i) => accepted.push([a, path[i + 1]]));
      lanesUsed.set(c.lane.key, c.lane.k + 1);
      return { exit: c.exit, entry: c.entry, points: c.points };
    }
    return null;
  };

  return connections.map(routeOne);
}
