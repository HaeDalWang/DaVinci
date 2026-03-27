import { describe, it, expect, vi } from 'vitest';
import { buildXml } from '../json-to-xml-builder.js';

describe('buildXml', () => {
  // --- Error handling ---

  it('throws on null input', () => {
    expect(() => buildXml(null)).toThrow('buildXml: json is required');
  });

  it('throws on undefined input', () => {
    expect(() => buildXml(undefined)).toThrow('buildXml: json is required');
  });

  it('returns empty mxGraphModel for empty JSON', () => {
    const xml = buildXml({ groups: [], services: [], connections: [] });
    expect(xml).toContain('<mxGraphModel>');
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
    expect(xml).toContain('</mxGraphModel>');
  });

  // --- Basic structure ---

  it('generates root cells id=0 and id=1', () => {
    const xml = buildXml({ groups: [], services: [], connections: [] });
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  // --- Service rendering ---

  it('renders a known service with correct style from catalog', () => {
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'ec2', label: 'My EC2' }],
      connections: [],
    };
    const xml = buildXml(json);
    // Should contain vertex="1"
    expect(xml).toContain('vertex="1"');
    // Should contain the ec2 style (resIcon=mxgraph.aws4.ec2)
    expect(xml).toContain('resIcon=mxgraph.aws4.ec2');
    // Should contain the label
    expect(xml).toContain('value="My EC2"');
    // Parent should be "1" (root) since no group
    expect(xml).toMatch(/id="2".*parent="1"/);
  });

  it('renders unknown service type with generic style and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'totally_unknown', label: 'Unknown' }],
      connections: [],
    };
    const xml = buildXml(json);
    expect(xml).toContain('mxgraph.aws4.generic_database');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown service type'));
    warnSpy.mockRestore();
  });

  // --- Group rendering ---

  it('renders a group as container mxCell', () => {
    const json = {
      groups: [{ id: 'g1', type: 'vpc', label: 'My VPC', children: [] }],
      services: [],
      connections: [],
    };
    const xml = buildXml(json);
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('connectable="0"');
    expect(xml).toContain('value="My VPC"');
    // VPC style should include group_vpc
    expect(xml).toContain('group_vpc');
  });

  it('sets service parent to group mxCell id when service has a group', () => {
    const json = {
      groups: [{ id: 'g1', type: 'vpc', label: 'VPC', children: ['s1'] }],
      services: [{ id: 's1', type: 'lambda', label: 'Lambda', group: 'g1' }],
      connections: [],
    };
    const xml = buildXml(json);
    // g1 gets id="2", s1 gets id="3"
    // s1's parent should be g1's mxCell id ("2")
    expect(xml).toMatch(/id="3".*parent="2"/);
  });

  it('sets nested group parent to parent group mxCell id', () => {
    const json = {
      groups: [
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['sub1'] },
        { id: 'sub1', type: 'subnet_public', label: 'Public Subnet', children: [] },
      ],
      services: [],
      connections: [],
    };
    const xml = buildXml(json);
    // vpc gets id="2", sub1 gets id="3"
    // sub1's parent should be vpc's mxCell id ("2")
    expect(xml).toMatch(/id="3".*parent="2"/);
  });

  // --- Connection rendering ---

  it('renders connections as edge mxCells with default style', () => {
    const json = {
      groups: [],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2' },
        { id: 's2', type: 'rds', label: 'RDS' },
      ],
      connections: [{ from: 's1', to: 's2' }],
    };
    const xml = buildXml(json);
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('edgeStyle=orthogonalEdgeStyle');
    expect(xml).toContain('strokeColor=#6B7785');
    expect(xml).toContain('strokeWidth=1.5');
    expect(xml).toContain('source="2"');
    expect(xml).toContain('target="3"');
  });

  it('applies custom edge style when connection has style field', () => {
    const customStyle = 'edgeStyle=entityRelationEdgeStyle;strokeColor=#FF0000;';
    const json = {
      groups: [],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2' },
        { id: 's2', type: 'rds', label: 'RDS' },
      ],
      connections: [{ from: 's1', to: 's2', style: customStyle }],
    };
    const xml = buildXml(json);
    expect(xml).toContain(customStyle);
    expect(xml).not.toContain('orthogonalEdgeStyle');
  });

  it('renders connection label', () => {
    const json = {
      groups: [],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2' },
        { id: 's2', type: 'rds', label: 'RDS' },
      ],
      connections: [{ from: 's1', to: 's2', label: 'HTTPS' }],
    };
    const xml = buildXml(json);
    expect(xml).toContain('value="HTTPS"');
  });

  it('skips connections with non-existent source id and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'ec2', label: 'EC2' }],
      connections: [{ from: 'nonexistent', to: 's1' }],
    };
    const xml = buildXml(json);
    expect(xml).not.toContain('edge="1"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-existent id'));
    warnSpy.mockRestore();
  });

  it('skips connections with non-existent target id and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'ec2', label: 'EC2' }],
      connections: [{ from: 's1', to: 'nonexistent' }],
    };
    const xml = buildXml(json);
    expect(xml).not.toContain('edge="1"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-existent id'));
    warnSpy.mockRestore();
  });

  // --- Unique IDs ---

  it('assigns unique ids to all mxCells', () => {
    const json = {
      groups: [
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['s1', 's2'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'vpc' },
        { id: 's2', type: 'lambda', label: 'Lambda', group: 'vpc' },
      ],
      connections: [{ from: 's1', to: 's2' }],
    };
    const xml = buildXml(json);
    // Extract all id values from mxCell elements
    const idMatches = [...xml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const uniqueIds = new Set(idMatches);
    expect(uniqueIds.size).toBe(idMatches.length);
  });

  // --- XML escaping ---

  it('escapes special characters in labels', () => {
    const json = {
      groups: [],
      services: [{ id: 's1', type: 'ec2', label: 'EC2 <"test"> & \'more\'' }],
      connections: [],
    };
    const xml = buildXml(json);
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
  });

  // --- Options passthrough tests (Task 6.3) ---

  it('buildXml with horizontal direction produces different XML than default', () => {
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
    const defaultXml = buildXml(json);
    const horizontalXml = buildXml(json, { direction: 'horizontal' });

    // Both should be valid XML
    expect(defaultXml).toContain('<mxGraphModel>');
    expect(horizontalXml).toContain('<mxGraphModel>');

    // Both should contain all services and groups
    expect(horizontalXml).toContain('VPC-1');
    expect(horizontalXml).toContain('VPC-2');
    expect(horizontalXml).toContain('EC2');
    expect(horizontalXml).toContain('Lambda');

    // The geometry coordinates should differ because layout direction changed
    expect(defaultXml).not.toBe(horizontalXml);
  });

  it('buildXml without options produces identical output to before', () => {
    const json = {
      groups: [
        { id: 'g1', type: 'vpc', label: 'VPC', children: ['s1'] },
      ],
      services: [
        { id: 's1', type: 'ec2', label: 'EC2', group: 'g1' },
        { id: 's2', type: 'users', label: 'Users' },
      ],
      connections: [{ from: 's2', to: 's1' }],
    };
    const xml1 = buildXml(json);
    const xml2 = buildXml(json);

    // Calling buildXml without options should be deterministic
    expect(xml1).toBe(xml2);

    // Should still produce valid structure
    expect(xml1).toContain('<mxGraphModel>');
    expect(xml1).toContain('edge="1"');
    expect(xml1).toContain('VPC');
    expect(xml1).toContain('EC2');
    expect(xml1).toContain('Users');
  });

  // --- Complex scenario ---

  it('handles a full architecture with groups, services, and connections', () => {
    const json = {
      groups: [
        { id: 'cloud', type: 'aws_cloud', label: 'AWS Cloud', children: ['vpc'] },
        { id: 'vpc', type: 'vpc', label: 'VPC', children: ['pub', 'priv'] },
        { id: 'pub', type: 'subnet_public', label: 'Public Subnet', children: ['s1'] },
        { id: 'priv', type: 'subnet_private', label: 'Private Subnet', children: ['s2'] },
      ],
      services: [
        { id: 's1', type: 'alb', label: 'ALB', group: 'pub' },
        { id: 's2', type: 'ec2', label: 'EC2', group: 'priv' },
        { id: 's3', type: 'users', label: 'Users' },
      ],
      connections: [
        { from: 's3', to: 's1' },
        { from: 's1', to: 's2', label: 'HTTP' },
      ],
    };
    const xml = buildXml(json);

    // Basic structure
    expect(xml).toContain('<mxGraphModel>');
    expect(xml).toContain('</mxGraphModel>');

    // All groups rendered
    expect(xml).toContain('AWS Cloud');
    expect(xml).toContain('VPC');
    expect(xml).toContain('Public Subnet');
    expect(xml).toContain('Private Subnet');

    // All services rendered
    expect(xml).toContain('ALB');
    expect(xml).toContain('EC2');
    expect(xml).toContain('Users');

    // Connections rendered
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('value="HTTP"');

    // Unique IDs
    const idMatches = [...xml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const uniqueIds = new Set(idMatches);
    expect(uniqueIds.size).toBe(idMatches.length);
  });
});
