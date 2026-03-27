/**
 * Feature: ai-architecture-agent-enhancement, Property 6: Summary_Channel 파싱 완전성
 *
 * For any AWS 서비스 노드와 Edge를 포함하는 유효한 DrawIO XML에 대해,
 * Summary_Channel이 생성한 JSON 요약의 서비스 목록은 XML 내 모든 AWS 서비스 mxCell을 포함하고,
 * 연결 목록은 모든 Edge의 소스명·타겟명·라벨을 포함해야 한다.
 *
 * Validates: Requirements 2.1, 2.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { analyzeArchitecture } from '../aws-analyzer.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Known AWS service styles that analyzeArchitecture recognises.
 * Each entry produces a style string containing 'mxgraph.aws4' so the
 * analyser's check passes, AND includes a `shape=…` segment so shapeName
 * extraction works.
 */
const AWS_SERVICE_STYLES = [
  'shape=mxgraph.aws4.users',
  'shape=mxgraph.aws4.internet_gateway',
  'shape=mxgraph.aws4.nat_gateway',
  'shape=mxgraph.aws4.application_load_balancer',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#ED7100;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#ED7100;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#C925D1;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#3F8624;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#8C4FFF;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#E7157B;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#E7157B;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns',
  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#E7157B;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront',
];

/**
 * Arbitrary that produces a non-empty alphanumeric label (no whitespace-only).
 * Labels start with a letter to guarantee they are non-empty after trim().
 */
const arbLabel = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')),
    fc.string({ minLength: 0, maxLength: 15 }).map(s => s.replace(/[^A-Za-z0-9 _-]/g, '')),
  )
  .map(([first, rest]) => first + rest);

/**
 * Arbitrary that produces a single AWS service node descriptor.
 */
const arbServiceNode = fc.record({
  style: fc.constantFrom(...AWS_SERVICE_STYLES),
  label: arbLabel,
});

/**
 * Generate an array of service nodes with unique labels.
 * Uniqueness is enforced by appending an index suffix.
 */
function arbUniqueServiceNodes(min, max) {
  return fc.array(arbServiceNode, { minLength: min, maxLength: max }).map(nodes =>
    nodes.map((node, i) => ({
      ...node,
      label: `${node.label}_${i}`,
    })),
  );
}

/**
 * Build a valid DrawIO mxGraphModel XML from a list of service nodes and
 * a list of edges (index pairs into the service array).
 *
 * Returns { xml, nodeIds, edges } where edges carry the generated metadata
 * so the test can assert against them.
 */
function buildDrawioXml(serviceNodes, edgeIndices) {
  const baseId = 2; // 0 and 1 are reserved by mxGraph
  const cells = [];

  // Root cells required by mxGraphModel
  cells.push('<mxCell id="0"/>');
  cells.push('<mxCell id="1" parent="0"/>');

  // Service nodes
  const nodeIds = [];
  for (let i = 0; i < serviceNodes.length; i++) {
    const id = String(baseId + i);
    nodeIds.push(id);
    const { style, label } = serviceNodes[i];
    const safeLabel = label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    cells.push(
      `<mxCell id="${id}" value="${safeLabel}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${i * 200}" y="100" width="60" height="60" as="geometry"/></mxCell>`,
    );
  }

  // Edges — only between valid, distinct service indices
  const edgeStartId = baseId + serviceNodes.length;
  const edges = [];
  for (let i = 0; i < edgeIndices.length; i++) {
    const { srcIdx, tgtIdx } = edgeIndices[i];
    if (srcIdx >= serviceNodes.length || tgtIdx >= serviceNodes.length) continue;
    if (srcIdx === tgtIdx) continue;
    const edgeId = String(edgeStartId + edges.length);
    const sourceId = nodeIds[srcIdx];
    const targetId = nodeIds[tgtIdx];
    cells.push(
      `<mxCell id="${edgeId}" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="${sourceId}" target="${targetId}" parent="1">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
    edges.push({ sourceId, targetId, srcIdx, tgtIdx });
  }

  const xml = `<mxGraphModel><root>${cells.join('')}</root></mxGraphModel>`;
  return { xml, nodeIds, edges };
}

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Property 6: Summary_Channel 파싱 완전성', () => {
  it('서비스 목록은 XML 내 모든 AWS 서비스 mxCell을 포함해야 한다', () => {
    fc.assert(
      fc.property(
        arbUniqueServiceNodes(1, 8),
        (serviceNodes) => {
          const { xml } = buildDrawioXml(serviceNodes, []);
          const analysis = analyzeArchitecture(xml);

          // Every generated service node must appear in analysis.services
          expect(analysis.services.length).toBe(serviceNodes.length);
          expect(analysis.summary.totalServices).toBe(serviceNodes.length);

          // Each service label should be present
          const analysisLabels = analysis.services.map(s => s.label);
          for (const node of serviceNodes) {
            expect(analysisLabels).toContain(node.label);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('연결 목록은 모든 Edge의 소스명·타겟명을 포함해야 한다', () => {
    fc.assert(
      fc.property(
        arbUniqueServiceNodes(2, 6),
        fc.array(
          fc.record({
            srcIdx: fc.nat({ max: 5 }),
            tgtIdx: fc.nat({ max: 5 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (serviceNodes, rawEdges) => {
          // Filter edges to valid, non-self-loop pairs
          const validEdges = rawEdges.filter(
            e =>
              e.srcIdx < serviceNodes.length &&
              e.tgtIdx < serviceNodes.length &&
              e.srcIdx !== e.tgtIdx,
          );
          if (validEdges.length === 0) return; // skip if no valid edges

          const { xml, edges } = buildDrawioXml(serviceNodes, validEdges);
          const analysis = analyzeArchitecture(xml);

          // Every valid edge should appear in analysis.connections
          expect(analysis.connections.length).toBe(edges.length);
          expect(analysis.summary.totalConnections).toBe(edges.length);

          for (const edge of edges) {
            const expectedFrom = serviceNodes[edge.srcIdx].label;
            const expectedTo = serviceNodes[edge.tgtIdx].label;
            const found = analysis.connections.some(
              c => c.from === expectedFrom && c.to === expectedTo,
            );
            expect(found).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('summary.totalServices와 totalConnections가 정확해야 한다', () => {
    fc.assert(
      fc.property(
        arbUniqueServiceNodes(1, 8),
        fc.array(
          fc.record({
            srcIdx: fc.nat({ max: 7 }),
            tgtIdx: fc.nat({ max: 7 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (serviceNodes, rawEdges) => {
          const validEdges = rawEdges.filter(
            e =>
              e.srcIdx < serviceNodes.length &&
              e.tgtIdx < serviceNodes.length &&
              e.srcIdx !== e.tgtIdx,
          );

          const { xml, edges } = buildDrawioXml(serviceNodes, validEdges);
          const analysis = analyzeArchitecture(xml);

          expect(analysis.summary.totalServices).toBe(serviceNodes.length);
          expect(analysis.summary.totalConnections).toBe(edges.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
