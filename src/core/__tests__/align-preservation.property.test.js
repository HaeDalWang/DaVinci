/**
 * Property 2: Preservation — Non-Alignment Code Paths Unchanged
 *
 * These tests verify that buildXml(), calculateLayout(), and summarizeXml()
 * behave correctly on the UNFIXED code. They capture baseline behavior that
 * must be preserved after the alignment bugfix is applied.
 *
 * All tests here MUST PASS on the current unfixed code.
 *
 * Validates: Requirements 3.4, 3.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildXml } from '../json-to-xml-builder.js';
import { calculateLayout } from '../layout-engine.js';
import { summarizeXml } from '../xml-summarizer.js';

// ---------------------------------------------------------------------------
// Known service types from SERVICE_PATTERNS (non-group, with catalog styles)
// ---------------------------------------------------------------------------
const KNOWN_SERVICE_TYPES = [
  'users', 'route_53', 'cloudfront', 'waf', 'shield', 'acm',
  'igw', 'nat', 'alb',
  'ec2', 'ecs', 'lambda',
  'rds', 'aurora', 'elasticache', 'dynamodb',
  'cloudwatch', 'cloudtrail', 's3', 'sns', 'sqs', 'tgw',
];

const KNOWN_GROUP_TYPES = [
  'aws_cloud', 'vpc', 'az', 'subnet_public', 'subnet_private', 'asg',
];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a unique ID string.
 */
const arbId = (prefix) =>
  fc.nat({ max: 9999 }).map((n) => `${prefix}_${n}`);

/**
 * Generate a flat list of services with unique IDs and known types.
 */
const arbServiceList = (minLen = 1, maxLen = 8) =>
  fc
    .array(
      fc.record({
        type: fc.constantFrom(...KNOWN_SERVICE_TYPES),
        label: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
      }),
      { minLength: minLen, maxLength: maxLen },
    )
    .map((arr) =>
      arr.map((s, i) => ({
        id: `svc_${i}`,
        type: s.type,
        label: s.label,
      })),
    );

/**
 * Generate a valid Lightweight_JSON with a simple group hierarchy and services.
 *
 * Structure: aws_cloud > vpc > subnet, with services distributed across groups
 * and some ungrouped. Connections between random service pairs.
 */
const arbLightweightJSON = fc
  .record({
    services: arbServiceList(1, 10),
    numConnections: fc.nat({ max: 4 }),
    hasGroups: fc.boolean(),
  })
  .map(({ services, numConnections, hasGroups }) => {
    const groups = [];
    const svcList = [...services];

    if (hasGroups && svcList.length >= 1) {
      // Build a simple hierarchy: cloud > vpc > subnet
      const subnetId = 'grp_subnet';
      const vpcId = 'grp_vpc';
      const cloudId = 'grp_cloud';

      // Assign roughly half the services to the subnet group
      const half = Math.max(1, Math.floor(svcList.length / 2));
      const groupedSvcs = svcList.slice(0, half);
      const ungroupedSvcs = svcList.slice(half);

      for (const s of groupedSvcs) {
        s.group = subnetId;
      }

      groups.push({
        id: cloudId,
        type: 'aws_cloud',
        label: 'AWS Cloud',
        children: [vpcId],
      });
      groups.push({
        id: vpcId,
        type: 'vpc',
        label: 'VPC',
        children: [subnetId],
      });
      groups.push({
        id: subnetId,
        type: 'subnet_public',
        label: 'Public Subnet',
        children: groupedSvcs.map((s) => s.id),
      });
    }

    // Build connections between existing service IDs
    const connections = [];
    if (svcList.length >= 2) {
      const count = Math.min(numConnections, svcList.length - 1);
      for (let i = 0; i < count; i++) {
        connections.push({
          from: svcList[i].id,
          to: svcList[i + 1].id,
        });
      }
    }

    return { groups, services: svcList, connections };
  });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Non-Alignment Code Paths Unchanged', () => {
  it('buildXml(json) produces valid XML containing all service IDs and connection pairs', () => {
    fc.assert(
      fc.property(arbLightweightJSON, (json) => {
        const xml = buildXml(json);

        // Must be valid XML wrapper
        expect(xml).toContain('<mxGraphModel>');
        expect(xml).toContain('</mxGraphModel>');
        expect(xml).toContain('<mxCell id="0"/>');
        expect(xml).toContain('<mxCell id="1" parent="0"/>');

        // Every service must appear as a vertex cell with its label
        for (const svc of json.services) {
          expect(xml).toContain(`value="${svc.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}"`);
        }

        // Every valid connection must appear as an edge cell
        const allIds = new Set([
          ...json.groups.map((g) => g.id),
          ...json.services.map((s) => s.id),
        ]);
        const validConnections = json.connections.filter(
          (c) => allIds.has(c.from) && allIds.has(c.to),
        );
        const edgeCount = (xml.match(/edge="1"/g) || []).length;
        expect(edgeCount).toBe(validConnections.length);
      }),
      { numRuns: 100 },
    );
  });

  it('calculateLayout(json) returns positions for every group and service with valid dimensions', () => {
    fc.assert(
      fc.property(arbLightweightJSON, (json) => {
        const { positions } = calculateLayout(json);

        // Every group must have a position
        for (const g of json.groups) {
          expect(positions[g.id]).toBeDefined();
          expect(positions[g.id].x).toBeGreaterThanOrEqual(0);
          expect(positions[g.id].y).toBeGreaterThanOrEqual(0);
          expect(positions[g.id].width).toBeGreaterThan(0);
          expect(positions[g.id].height).toBeGreaterThan(0);
        }

        // Every service must have a position
        for (const svc of json.services) {
          expect(positions[svc.id]).toBeDefined();
          expect(positions[svc.id].x).toBeGreaterThanOrEqual(0);
          expect(positions[svc.id].y).toBeGreaterThanOrEqual(0);
          expect(positions[svc.id].width).toBeGreaterThan(0);
          expect(positions[svc.id].height).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('calculateLayout(json) positions every service within its parent group bounding box', () => {
    fc.assert(
      fc.property(arbLightweightJSON, (json) => {
        const { positions } = calculateLayout(json);

        for (const svc of json.services) {
          if (!svc.group) continue;
          const sp = positions[svc.id];
          const gp = positions[svc.group];
          if (!sp || !gp) continue;

          // Service must be fully contained within its parent group
          expect(sp.x).toBeGreaterThanOrEqual(gp.x);
          expect(sp.y).toBeGreaterThanOrEqual(gp.y);
          expect(sp.x + sp.width).toBeLessThanOrEqual(gp.x + gp.width);
          expect(sp.y + sp.height).toBeLessThanOrEqual(gp.y + gp.height);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('summarizeXml(buildXml(json)) round-trip preserves service count and connection count', () => {
    fc.assert(
      fc.property(arbLightweightJSON, (json) => {
        const xml = buildXml(json);
        const roundTripped = summarizeXml(xml);

        // Service count must be preserved
        expect(roundTripped.services.length).toBe(json.services.length);

        // Connection count must be preserved (only valid connections)
        const allIds = new Set([
          ...json.groups.map((g) => g.id),
          ...json.services.map((s) => s.id),
        ]);
        const validConnections = json.connections.filter(
          (c) => allIds.has(c.from) && allIds.has(c.to),
        );
        expect(roundTripped.connections.length).toBe(validConnections.length);
      }),
      { numRuns: 100 },
    );
  });
});
