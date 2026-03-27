import { describe, it, expect } from 'vitest';
import {
  calculateLayout,
  SERVICE_GAP,
  GROUP_PADDING,
  GROUP_LABEL_HEIGHT,
  GRID_MAX_COLS,
} from '../layout-engine.js';

describe('calculateLayout', () => {
  it('throws on null input', () => {
    expect(() => calculateLayout(null)).toThrow();
  });

  it('returns empty positions for empty JSON', () => {
    const result = calculateLayout({ groups: [], services: [], connections: [] });
    expect(result).toEqual({ positions: {} });
  });

  it('positions a single ungrouped service at origin', () => {
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'ec2', label: 'EC2' }],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    expect(positions.s1).toBeDefined();
    expect(positions.s1.x).toBe(0);
    expect(positions.s1.y).toBe(0);
    expect(positions.s1.width).toBe(78);
    expect(positions.s1.height).toBe(78);
  });

  it('positions multiple ungrouped services in a grid', () => {
    const services = [];
    for (let i = 0; i < 5; i++) {
      services.push({ id: `s${i}`, type: 'lambda', label: `Lambda ${i}` });
    }
    const json = { groups: [], services, connections: [] };
    const { positions } = calculateLayout(json);

    // 5 services → 4 cols, 2 rows
    expect(positions.s0.x).toBe(0);
    expect(positions.s0.y).toBe(0);
    expect(positions.s4.x).toBe(0); // 5th service wraps to row 2, col 0
    expect(positions.s4.y).toBe(78 + 30 + SERVICE_GAP); // icon height + label margin + gap
  });

  it('positions services inside a group with padding and label height', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);

    // Group should exist
    expect(positions.g1).toBeDefined();
    // Service should be offset by padding + label height
    expect(positions.s1.x).toBe(positions.g1.x + GROUP_PADDING);
    expect(positions.s1.y).toBe(positions.g1.y + GROUP_PADDING + GROUP_LABEL_HEIGHT);
  });

  it('parent group bounding box contains all children', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1', 's2', 's3'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'lambda', label: 'Lambda', group: 'g1' },
        { id: 's3', type: 'rds', label: 'RDS', group: 'g1' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    const g = positions.g1;

    for (const sId of ['s1', 's2', 's3']) {
      const s = positions[sId];
      expect(s.x).toBeGreaterThanOrEqual(g.x);
      expect(s.y).toBeGreaterThanOrEqual(g.y);
      expect(s.x + s.width).toBeLessThanOrEqual(g.x + g.width);
      expect(s.y + s.height).toBeLessThanOrEqual(g.y + g.height);
    }
  });

  it('maintains minimum SERVICE_GAP between services in same group', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1', 's2'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'lambda', label: 'Lambda', group: 'g1' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    const s1 = positions.s1;
    const s2 = positions.s2;

    // They should be in the same row, so horizontal gap
    const hGap = s2.x - (s1.x + s1.width);
    expect(hGap).toBeGreaterThanOrEqual(SERVICE_GAP);
  });

  it('ensures label area is reserved (child y >= group y + padding + label height)', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'az', label: 'AZ-1', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 's3', label: 'S3', group: 'g1' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    const g = positions.g1;
    const s = positions.s1;
    expect(s.y).toBeGreaterThanOrEqual(g.y + GROUP_PADDING + GROUP_LABEL_HEIGHT);
  });

  it('handles nested groups (vpc > subnet)', () => {
    const json = {
      groups: [
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['sub1'] },
        { id: 'sub1', type: 'subnet_public', label: 'Public Subnet', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'sub1' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);

    // VPC contains subnet
    const vpc = positions.vpc;
    const sub = positions.sub1;
    expect(sub.x).toBeGreaterThanOrEqual(vpc.x);
    expect(sub.y).toBeGreaterThanOrEqual(vpc.y);
    expect(sub.x + sub.width).toBeLessThanOrEqual(vpc.x + vpc.width);
    expect(sub.y + sub.height).toBeLessThanOrEqual(vpc.y + vpc.height);

    // Subnet contains service
    const s = positions.s1;
    expect(s.x).toBeGreaterThanOrEqual(sub.x);
    expect(s.y).toBeGreaterThanOrEqual(sub.y);
    expect(s.x + s.width).toBeLessThanOrEqual(sub.x + sub.width);
    expect(s.y + s.height).toBeLessThanOrEqual(sub.y + sub.height);
  });

  it('places ungrouped services alongside root groups', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'users', label: 'Users' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    const g = positions.g1;
    const s2 = positions.s2;

    // Ungrouped service should be to the right of the group
    expect(s2.x).toBeGreaterThanOrEqual(g.x + g.width + SERVICE_GAP);
  });

  it('handles unknown service types with default 78x78 size', () => {
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'unknown_service', label: 'Unknown' }],
      connections: [],
    };
    const { positions } = calculateLayout(json);
    expect(positions.s1.width).toBe(78);
    expect(positions.s1.height).toBe(78);
  });

  it('handles group with both child groups and direct services', () => {
    const json = {
      groups: [
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['sub1', 's2'] },
        { id: 'sub1', type: 'subnet_public', label: 'Public', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'sub1' },
        { id: 's2', type: 'rds', label: 'RDS', group: 'vpc' },
      ],
      connections: [],
    };
    const { positions } = calculateLayout(json);

    // All elements should have positions
    expect(positions.vpc).toBeDefined();
    expect(positions.sub1).toBeDefined();
    expect(positions.s1).toBeDefined();
    expect(positions.s2).toBeDefined();

    // VPC contains everything
    const vpc = positions.vpc;
    for (const id of ['sub1', 's1', 's2']) {
      const p = positions[id];
      expect(p.x).toBeGreaterThanOrEqual(vpc.x);
      expect(p.y).toBeGreaterThanOrEqual(vpc.y);
      expect(p.x + p.width).toBeLessThanOrEqual(vpc.x + vpc.width);
      expect(p.y + p.height).toBeLessThanOrEqual(vpc.y + vpc.height);
    }
  });

  // --- Direction option tests (Task 6.2) ---

  it('horizontal direction produces different positions than default vertical', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC-1', children: ['s1'] },
        { id: 'g2', type: 'vpc', label: 'VPC-2', children: ['s2'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'lambda', label: 'Lambda', group: 'g2' },
      ],
      connections: [],
    };
    const vertical = calculateLayout(json);
    const horizontal = calculateLayout(json, { direction: 'horizontal' });

    // Both should have positions for all elements
    expect(horizontal.positions.g1).toBeDefined();
    expect(horizontal.positions.g2).toBeDefined();

    // In vertical (default), root groups are side-by-side (same y, different x)
    // In horizontal, root groups stack top-to-bottom (same x, different y)
    expect(vertical.positions.g1.y).toBe(vertical.positions.g2.y);
    expect(horizontal.positions.g1.x).toBe(horizontal.positions.g2.x);
    expect(horizontal.positions.g2.y).toBeGreaterThan(horizontal.positions.g1.y);
  });

  it('calculateLayout without options produces identical results to before (backward compat)', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1', 's2'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'lambda', label: 'Lambda', group: 'g1' },
        { id: 's3', type: 'users', label: 'Users' },
      ],
      connections: [],
    };
    const withoutOptions = calculateLayout(json);
    const withEmptyOptions = calculateLayout(json, {});

    // No-arg and empty-options should be identical
    expect(withoutOptions).toEqual(withEmptyOptions);
  });

  it('explicit vertical direction produces same results as no-option call', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['sub1'] },
        { id: 'sub1', type: 'subnet_public', label: 'Public', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'sub1' },
        { id: 's2', type: 'users', label: 'Users' },
      ],
      connections: [],
    };
    const noOption = calculateLayout(json);
    const explicitVertical = calculateLayout(json, { direction: 'vertical' });

    expect(noOption).toEqual(explicitVertical);
  });

  it('respects GRID_MAX_COLS for service grid layout', () => {
    const services = [];
    for (let i = 0; i < 6; i++) {
      services.push({ id: `s${i}`, type: 'ec2', label: `EC2-${i}`, group: 'g1' });
    }
    const json = {
      groups: [{ id: 'g1', type: 'vpc', label: 'VPC', children: services.map(s => s.id) }],
      services,
      connections: [],
    };
    const { positions } = calculateLayout(json);

    // 6 services, max 4 cols → 2 rows
    // First row: s0, s1, s2, s3
    // Second row: s4, s5
    // s4 should be on a new row (different y than s0)
    expect(positions.s4.y).toBeGreaterThan(positions.s0.y);
    // s3 and s0 should be on the same row
    expect(positions.s3.y).toBe(positions.s0.y);
  });
});
