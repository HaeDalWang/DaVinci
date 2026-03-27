import { describe, it, expect } from 'vitest';
import { reorganizeForAlignment } from '../aws-architecture-builder.js';

// Helper: create a minimal service object
function svc(id, type, label) {
  return { id, type, label: label || type };
}

describe('reorganizeForAlignment', () => {
  // -------------------------------------------------------
  // Hierarchy mode: tier classification & group hierarchy
  // -------------------------------------------------------
  describe('hierarchy mode — tier classification and group hierarchy', () => {
    it('classifies services by tier and builds AWS Cloud > VPC > AZ > Subnet hierarchy', () => {
      const json = {
        groups: [],
        services: [
          svc('u1', 'users', 'Users'),
          svc('r1', 'route_53', 'Route 53'),
          svc('w1', 'waf', 'WAF'),
          svc('igw1', 'igw', 'IGW'),
          svc('ec2a', 'ec2', 'EC2'),
          svc('rds1', 'rds', 'RDS'),
          svc('cw1', 'cloudwatch', 'CloudWatch'),
          svc('s3a', 's3', 'S3'),
        ],
        connections: [],
      };

      const result = reorganizeForAlignment(json, 'hierarchy');

      // All services accounted for
      expect(result.services).toHaveLength(json.services.length);

      // Groups should include the full hierarchy
      const groupIds = result.groups.map(g => g.id);
      expect(groupIds).toContain('aws_cloud');
      expect(groupIds).toContain('vpc');
      expect(groupIds).toContain('az_a');
      expect(groupIds).toContain('az_b');

      // external (users) → ungrouped
      const usersOut = result.services.find(s => s.id === 'u1');
      expect(usersOut.group).toBeUndefined();

      // edge (route_53) → AWS Cloud child
      const r53Out = result.services.find(s => s.id === 'r1');
      expect(r53Out.group).toBe('aws_cloud');

      // security (waf) → AWS Cloud child
      const wafOut = result.services.find(s => s.id === 'w1');
      expect(wafOut.group).toBe('aws_cloud');

      // public (igw) → Public Subnet
      const igwOut = result.services.find(s => s.id === 'igw1');
      expect(igwOut.group).toMatch(/^subnet_public/);

      // web (ec2) → ASG
      const ec2Out = result.services.find(s => s.id === 'ec2a');
      expect(ec2Out.group).toMatch(/^asg/);

      // db (rds) → Private Subnet DB
      const rdsOut = result.services.find(s => s.id === 'rds1');
      expect(rdsOut.group).toMatch(/^subnet_private_db/);

      // mgmt (cloudwatch) → VPC child
      const cwOut = result.services.find(s => s.id === 'cw1');
      expect(cwOut.group).toBe('vpc');

      // storage (s3) → VPC child
      const s3Out = result.services.find(s => s.id === 's3a');
      expect(s3Out.group).toBe('vpc');
    });

    it('aws_cloud group contains vpc and edge/security service ids', () => {
      const json = {
        groups: [],
        services: [
          svc('r1', 'route_53'),
          svc('w1', 'waf'),
          svc('ec2a', 'ec2'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');
      const cloud = result.groups.find(g => g.id === 'aws_cloud');
      expect(cloud.children).toContain('vpc');
      expect(cloud.children).toContain('r1');
      expect(cloud.children).toContain('w1');
    });

    it('vpc group contains az_a, az_b, and mgmt/storage service ids', () => {
      const json = {
        groups: [],
        services: [
          svc('cw1', 'cloudwatch'),
          svc('s3a', 's3'),
          svc('ec2a', 'ec2'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');
      const vpc = result.groups.find(g => g.id === 'vpc');
      expect(vpc.children).toContain('az_a');
      expect(vpc.children).toContain('az_b');
      expect(vpc.children).toContain('cw1');
      expect(vpc.children).toContain('s3a');
    });
  });

  // -------------------------------------------------------
  // Left-right mode
  // -------------------------------------------------------
  describe('left-right mode — same classification, horizontal intent', () => {
    it('produces same tier classification as hierarchy mode', () => {
      const json = {
        groups: [],
        services: [
          svc('u1', 'users'),
          svc('r1', 'route_53'),
          svc('igw1', 'igw'),
          svc('ec2a', 'ec2'),
          svc('rds1', 'rds'),
        ],
        connections: [],
      };

      const hierarchy = reorganizeForAlignment(json, 'hierarchy');
      const leftRight = reorganizeForAlignment(json, 'left-right');

      // Same number of services and groups
      expect(leftRight.services).toHaveLength(hierarchy.services.length);
      expect(leftRight.groups).toHaveLength(hierarchy.groups.length);

      // Same group assignments per service
      for (const hSvc of hierarchy.services) {
        const lrSvc = leftRight.services.find(s => s.id === hSvc.id);
        expect(lrSvc).toBeDefined();
        expect(lrSvc.group).toBe(hSvc.group);
      }
    });
  });

  // -------------------------------------------------------
  // Connection preservation
  // -------------------------------------------------------
  describe('connection preservation', () => {
    it('preserves all connections from input JSON', () => {
      const json = {
        groups: [],
        services: [
          svc('u1', 'users'),
          svc('r1', 'route_53'),
          svc('ec2a', 'ec2'),
          svc('rds1', 'rds'),
        ],
        connections: [
          { from: 'u1', to: 'r1' },
          { from: 'r1', to: 'ec2a', label: 'HTTPS' },
          { from: 'ec2a', to: 'rds1', label: 'SQL' },
        ],
      };

      const result = reorganizeForAlignment(json, 'hierarchy');

      expect(result.connections).toHaveLength(3);
      expect(result.connections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'u1', to: 'r1' }),
          expect.objectContaining({ from: 'r1', to: 'ec2a', label: 'HTTPS' }),
          expect.objectContaining({ from: 'ec2a', to: 'rds1', label: 'SQL' }),
        ]),
      );
    });

    it('connections are shallow-copied (not same references)', () => {
      const original = [{ from: 'a', to: 'b' }];
      const json = { groups: [], services: [svc('a', 'ec2'), svc('b', 'rds')], connections: original };
      const result = reorganizeForAlignment(json, 'hierarchy');
      expect(result.connections[0]).not.toBe(original[0]);
      expect(result.connections[0]).toEqual(original[0]);
    });
  });

  // -------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------
  describe('edge cases', () => {
    it('returns empty structure for null input', () => {
      const result = reorganizeForAlignment(null, 'hierarchy');
      expect(result).toEqual({ groups: [], services: [], connections: [] });
    });

    it('handles no services', () => {
      const json = { groups: [], services: [], connections: [] };
      const result = reorganizeForAlignment(json, 'hierarchy');
      expect(result.services).toHaveLength(0);
      expect(result.groups).toBeDefined();
      expect(result.connections).toHaveLength(0);
    });

    it('handles unknown service types — placed in VPC as fallback', () => {
      const json = {
        groups: [],
        services: [svc('x1', 'totally_unknown', 'Mystery')],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');
      expect(result.services).toHaveLength(1);
      const mystery = result.services.find(s => s.id === 'x1');
      expect(mystery.group).toBe('vpc');
    });

    it('handles services already in groups — reassigns to new hierarchy', () => {
      const json = {
        groups: [{ id: 'old_vpc', type: 'vpc', label: 'Old VPC', children: ['ec2a'] }],
        services: [svc('ec2a', 'ec2', 'EC2')],
        connections: [],
      };
      // The old group is discarded; ec2 is reassigned based on tier
      const result = reorganizeForAlignment(json, 'hierarchy');
      const ec2 = result.services.find(s => s.id === 'ec2a');
      expect(ec2.group).toMatch(/^asg/); // web tier → ASG
      // Old group should not appear
      const oldGroup = result.groups.find(g => g.id === 'old_vpc');
      expect(oldGroup).toBeUndefined();
    });

    it('handles single service', () => {
      const json = {
        groups: [],
        services: [svc('ec2a', 'ec2', 'EC2')],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');
      expect(result.services).toHaveLength(1);
      const ec2 = result.services.find(s => s.id === 'ec2a');
      expect(ec2.group).toMatch(/^asg/);
    });
  });

  // -------------------------------------------------------
  // Service splitting across AZ-A and AZ-B
  // -------------------------------------------------------
  describe('service splitting across AZ-A and AZ-B', () => {
    it('splits web services: first half AZ-A, second half AZ-B', () => {
      const json = {
        groups: [],
        services: [
          svc('ec2_1', 'ec2', 'EC2-1'),
          svc('ec2_2', 'ec2', 'EC2-2'),
          svc('ec2_3', 'ec2', 'EC2-3'),
          svc('ec2_4', 'ec2', 'EC2-4'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');

      // 4 web services → ceil(4/2)=2 in AZ-A (asg_a), 2 in AZ-B (asg_b)
      const asgA = result.services.filter(s => s.group === 'asg_a');
      const asgB = result.services.filter(s => s.group === 'asg_b');
      expect(asgA).toHaveLength(2);
      expect(asgB).toHaveLength(2);
      expect(asgA.map(s => s.id)).toEqual(['ec2_1', 'ec2_2']);
      expect(asgB.map(s => s.id)).toEqual(['ec2_3', 'ec2_4']);
    });

    it('splits db services across AZ-A and AZ-B', () => {
      const json = {
        groups: [],
        services: [
          svc('rds1', 'rds', 'RDS-1'),
          svc('rds2', 'rds', 'RDS-2'),
          svc('rds3', 'rds', 'RDS-3'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');

      // 3 db services → ceil(3/2)=2 in AZ-A, 1 in AZ-B
      const dbA = result.services.filter(s => s.group === 'subnet_private_db_a');
      const dbB = result.services.filter(s => s.group === 'subnet_private_db_b');
      expect(dbA).toHaveLength(2);
      expect(dbB).toHaveLength(1);
    });

    it('splits public services across AZ-A and AZ-B', () => {
      const json = {
        groups: [],
        services: [
          svc('igw1', 'igw', 'IGW'),
          svc('nat1', 'nat', 'NAT'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');

      const pubA = result.services.filter(s => s.group === 'subnet_public_a');
      const pubB = result.services.filter(s => s.group === 'subnet_public_b');
      expect(pubA).toHaveLength(1);
      expect(pubB).toHaveLength(1);
    });

    it('single service in a tier goes to AZ-A only', () => {
      const json = {
        groups: [],
        services: [svc('rds1', 'rds', 'RDS')],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');

      const dbA = result.services.filter(s => s.group === 'subnet_private_db_a');
      const dbB = result.services.filter(s => s.group === 'subnet_private_db_b');
      expect(dbA).toHaveLength(1);
      expect(dbB).toHaveLength(0);
    });

    it('AZ groups children arrays reflect the split', () => {
      const json = {
        groups: [],
        services: [
          svc('ec2_1', 'ec2'),
          svc('ec2_2', 'ec2'),
          svc('rds1', 'rds'),
          svc('igw1', 'igw'),
        ],
        connections: [],
      };
      const result = reorganizeForAlignment(json, 'hierarchy');

      const azA = result.groups.find(g => g.id === 'az_a');
      const azB = result.groups.find(g => g.id === 'az_b');

      // AZ-A should contain subnet_public_a, subnet_private_web_a, subnet_private_db_a
      expect(azA.children).toContain('subnet_public_a');
      expect(azA.children).toContain('subnet_private_web_a');
      expect(azA.children).toContain('subnet_private_db_a');

      // AZ-B should contain subnet_public_b, subnet_private_web_b, subnet_private_db_b
      expect(azB.children).toContain('subnet_public_b');
      expect(azB.children).toContain('subnet_private_web_b');
      expect(azB.children).toContain('subnet_private_db_b');
    });
  });
});
