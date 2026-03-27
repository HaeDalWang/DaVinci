/**
 * Property 1: Bug Condition — Alignment Uses Layout Engine Pipeline
 *
 * This test encodes the EXPECTED (correct) behavior for the NEW pipeline:
 *   summarizeXml() → reorganizeForAlignment() → buildXml()
 *
 * The new pipeline should:
 *   - Produce output XML that contains edge cells when connections exist
 *   - Produce output XML that uses Layout Engine spacing constants (78x78 service icons)
 *
 * On UNFIXED code (before align-modal.js is rewritten), this test validates that
 * the new pipeline functions themselves work correctly.
 * After the full fix (Task 5), this confirms alignment uses the Layout Engine pipeline.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { reorganizeForAlignment } from '../aws-architecture-builder.js';
import { buildXml } from '../json-to-xml-builder.js';
import { SERVICE_GAP, GROUP_PADDING } from '../layout-engine.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a Lightweight_JSON object with AWS services across key tiers
 * and connections between them. This simulates what summarizeXml() would
 * produce from a real diagram.
 */
const arbLightweightJson = fc
  .record({
    edgeExtra: fc.array(
      fc.constantFrom(
        { id: 'e2', type: 'route_53', label: 'Route 53' },
      ),
      { minLength: 0, maxLength: 1 },
    ),
    publicExtra: fc.array(
      fc.constantFrom(
        { id: 'p2', type: 'nat_gateway', label: 'NAT Gateway' },
      ),
      { minLength: 0, maxLength: 1 },
    ),
    webExtra: fc.array(
      fc.constantFrom(
        { id: 'w2', type: 'ecs', label: 'ECS' },
        { id: 'w3', type: 'lambda', label: 'Lambda' },
      ),
      { minLength: 0, maxLength: 2 },
    ),
    dbExtra: fc.array(
      fc.constantFrom(
        { id: 'd2', type: 'aurora', label: 'Aurora' },
        { id: 'd3', type: 'dynamodb', label: 'DynamoDB' },
      ),
      { minLength: 0, maxLength: 2 },
    ),
  })
  .map(({ edgeExtra, publicExtra, webExtra, dbExtra }) => {
    const services = [
      // Base services (always present)
      { id: 'edge1', type: 'cloudfront', label: 'CloudFront' },
      ...edgeExtra,
      { id: 'pub1', type: 'alb', label: 'ALB' },
      ...publicExtra,
      { id: 'web1', type: 'ec2', label: 'EC2' },
      ...webExtra,
      { id: 'db1', type: 'rds', label: 'RDS' },
      ...dbExtra,
    ];

    // Create connections between adjacent services in the flow
    const connections = [
      { from: 'edge1', to: 'pub1', label: '' },
      { from: 'pub1', to: 'web1', label: '' },
      { from: 'web1', to: 'db1', label: '' },
    ];

    return { groups: [], services, connections };
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count the number of edge="1" cells in the output XML.
 */
function countEdgeCells(xml) {
  const matches = xml.match(/edge="1"/g);
  return matches ? matches.length : 0;
}

/**
 * Extract all width/height values from mxGeometry elements in the XML.
 */
function extractGeometryValues(xml) {
  const values = [];
  const regex = /width="(\d+)"\s+height="(\d+)"/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push({
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    });
  }
  return values;
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — Alignment Uses Layout Engine Pipeline', () => {
  it('new pipeline (reorganizeForAlignment → buildXml) output should contain edge cells (connections preserved)', () => {
    fc.assert(
      fc.property(arbLightweightJson, (json) => {
        const reorganized = reorganizeForAlignment(json, 'hierarchy');
        const xml = buildXml(reorganized);

        // The new pipeline preserves connections from the input JSON.
        // buildXml() creates edge="1" mxCells for each connection.
        // The input always has 3 connections (edge1→pub1, pub1→web1, web1→db1).
        const edgeCount = countEdgeCells(xml);
        expect(edgeCount).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 50 },
    );
  });

  it('new pipeline (reorganizeForAlignment → buildXml) left-right mode should contain edge cells', () => {
    fc.assert(
      fc.property(arbLightweightJson, (json) => {
        const reorganized = reorganizeForAlignment(json, 'left-right');
        const xml = buildXml(reorganized, { direction: 'horizontal' });

        const edgeCount = countEdgeCells(xml);
        expect(edgeCount).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 50 },
    );
  });

  it('new pipeline hierarchy mode output should use Layout Engine spacing constants (78x78 service icons)', () => {
    fc.assert(
      fc.property(arbLightweightJson, (json) => {
        const reorganized = reorganizeForAlignment(json, 'hierarchy');
        const xml = buildXml(reorganized);

        const geometries = extractGeometryValues(xml);

        // Layout Engine uses 78x78 for service icons (default from aws-service-catalog)
        // The old buggy code used 40x40 hardcoded icons
        const hasLayoutEngineServiceSize = geometries.some(
          (g) => g.width === 78 && g.height === 78
        );
        const hasHardcodedServiceSize = geometries.some(
          (g) => g.width === 40 && g.height === 40
        );

        // Should use Layout Engine's 78x78 service dimensions
        expect(hasLayoutEngineServiceSize).toBe(true);
        // Should NOT have the old hardcoded 40x40 dimensions
        expect(hasHardcodedServiceSize).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it('new pipeline left-right mode output should use Layout Engine spacing constants (78x78 service icons)', () => {
    fc.assert(
      fc.property(arbLightweightJson, (json) => {
        const reorganized = reorganizeForAlignment(json, 'left-right');
        const xml = buildXml(reorganized, { direction: 'horizontal' });

        const geometries = extractGeometryValues(xml);

        const hasLayoutEngineServiceSize = geometries.some(
          (g) => g.width === 78 && g.height === 78
        );
        const hasHardcodedServiceSize = geometries.some(
          (g) => g.width === 40 && g.height === 40
        );

        expect(hasLayoutEngineServiceSize).toBe(true);
        expect(hasHardcodedServiceSize).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});
