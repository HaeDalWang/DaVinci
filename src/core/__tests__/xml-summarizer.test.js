import { describe, it, expect } from 'vitest';
import { summarizeXml } from '../xml-summarizer.js';

// Helper: wrap mxCells in a valid mxGraphModel
function wrapXml(cells) {
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
}

describe('summarizeXml', () => {
  // --- Error handling ---

  it('returns empty result for null input', () => {
    const result = summarizeXml(null);
    expect(result).toEqual({ groups: [], services: [], connections: [] });
  });

  it('returns empty result for undefined input', () => {
    const result = summarizeXml(undefined);
    expect(result).toEqual({ groups: [], services: [], connections: [] });
  });

  it('returns empty result for empty string', () => {
    const result = summarizeXml('');
    expect(result).toEqual({ groups: [], services: [], connections: [] });
  });

  it('returns empty result for invalid XML', () => {
    const result = summarizeXml('<not valid xml>>>');
    expect(result).toEqual({ groups: [], services: [], connections: [] });
  });

  it('returns empty result for non-string input', () => {
    const result = summarizeXml(42);
    expect(result).toEqual({ groups: [], services: [], connections: [] });
  });

  // --- Root cells skipped ---

  it('skips root cells id=0 and id=1', () => {
    const xml = wrapXml('');
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(0);
    expect(result.services).toHaveLength(0);
    expect(result.connections).toHaveLength(0);
  });

  // --- Service identification ---

  it('identifies EC2 service by style', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="My EC2" style="sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].id).toBe('s1');
    expect(result.services[0].type).toBe('ec2');
    expect(result.services[0].label).toBe('My EC2');
  });

  it('identifies Lambda service by style', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="My Lambda" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe('lambda');
  });

  it('sets type to unknown for unrecognizable service style', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="Custom" style="shape=mxgraph.aws4.some_unknown_thing;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe('unknown');
  });

  // --- Group identification ---

  it('identifies VPC group by style', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="My VPC" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fillColor=none;container=1;collapsible=0;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].id).toBe('g1');
    expect(result.groups[0].type).toBe('vpc');
    expect(result.groups[0].label).toBe('My VPC');
  });

  it('identifies AWS Cloud group', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="AWS Cloud" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="600" height="400" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('aws_cloud');
  });

  it('identifies public subnet group', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="Public Subnet" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;strokeColor=#7AA116;fillColor=#F2F6E8;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="200" height="200" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('subnet_public');
  });

  it('identifies private subnet group', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="Private Subnet" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;strokeColor=#00A4A6;fillColor=#E6F6F7;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="200" height="200" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('subnet_private');
  });

  it('identifies AZ group by dashed + strokeColor', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="AZ-1" style="fillColor=none;strokeColor=#147EBA;dashed=1;verticalAlign=top;fontStyle=0;fontColor=#147EBA;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="300" height="300" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('az');
  });

  it('identifies ASG group', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="Auto Scaling group" style="shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;strokeColor=#D86613;fillColor=none;container=1;dashed=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="200" height="200" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe('asg');
  });

  // --- Connection identification ---

  it('identifies edge connections', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="EC2" style="resIcon=mxgraph.aws4.ec2;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>` +
      `<mxCell id="s2" value="RDS" style="resIcon=mxgraph.aws4.rds;" vertex="1" parent="1"><mxGeometry x="200" y="0" width="78" height="78" as="geometry"/></mxCell>` +
      `<mxCell id="e1" value="HTTPS" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" source="s1" target="s2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].from).toBe('s1');
    expect(result.connections[0].to).toBe('s2');
    expect(result.connections[0].label).toBe('HTTPS');
    expect(result.connections[0].style).toContain('orthogonalEdgeStyle');
  });

  it('skips edges without source or target', () => {
    const xml = wrapXml(
      `<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.connections).toHaveLength(0);
  });

  // --- Parent-child relationships ---

  it('restores group-service hierarchy via parent attribute', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="VPC" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>` +
      `<mxCell id="s1" value="EC2" style="resIcon=mxgraph.aws4.ec2;" vertex="1" parent="g1"><mxGeometry x="20" y="40" width="78" height="78" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(1);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].group).toBe('g1');
    expect(result.groups[0].children).toContain('s1');
  });

  it('restores nested group hierarchy', () => {
    const xml = wrapXml(
      `<mxCell id="g1" value="AWS Cloud" style="grIcon=mxgraph.aws4.group_aws_cloud_alt;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="600" height="400" as="geometry"/></mxCell>` +
      `<mxCell id="g2" value="VPC" style="grIcon=mxgraph.aws4.group_vpc;container=1;" vertex="1" connectable="0" parent="g1"><mxGeometry x="20" y="40" width="400" height="300" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.groups).toHaveLength(2);
    const cloud = result.groups.find(g => g.type === 'aws_cloud');
    expect(cloud.children).toContain('g2');
  });

  // --- Complex scenario ---

  it('handles a full architecture with groups, services, and connections', () => {
    const xml = wrapXml(
      // AWS Cloud group
      `<mxCell id="cloud" value="AWS Cloud" style="grIcon=mxgraph.aws4.group_aws_cloud_alt;container=1;" vertex="1" connectable="0" parent="1"><mxGeometry x="0" y="0" width="800" height="600" as="geometry"/></mxCell>` +
      // VPC inside cloud
      `<mxCell id="vpc" value="VPC" style="grIcon=mxgraph.aws4.group_vpc;container=1;" vertex="1" connectable="0" parent="cloud"><mxGeometry x="20" y="40" width="600" height="400" as="geometry"/></mxCell>` +
      // Public subnet inside VPC
      `<mxCell id="pub" value="Public Subnet" style="grIcon=mxgraph.aws4.group_security_group;strokeColor=#7AA116;fillColor=#F2F6E8;container=1;" vertex="1" connectable="0" parent="vpc"><mxGeometry x="20" y="40" width="250" height="200" as="geometry"/></mxCell>` +
      // ALB in public subnet
      `<mxCell id="s1" value="ALB" style="resIcon=mxgraph.aws4.elastic_load_balancing;" vertex="1" parent="pub"><mxGeometry x="20" y="40" width="78" height="78" as="geometry"/></mxCell>` +
      // EC2 in VPC (not in subnet)
      `<mxCell id="s2" value="EC2" style="resIcon=mxgraph.aws4.ec2;" vertex="1" parent="vpc"><mxGeometry x="300" y="100" width="78" height="78" as="geometry"/></mxCell>` +
      // Users outside
      `<mxCell id="s3" value="Users" style="shape=mxgraph.aws4.users;" vertex="1" parent="1"><mxGeometry x="-100" y="200" width="78" height="78" as="geometry"/></mxCell>` +
      // Connections
      `<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="s3" target="s1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>` +
      `<mxCell id="e2" value="HTTP" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="s1" target="s2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );

    const result = summarizeXml(xml);

    // Groups
    expect(result.groups).toHaveLength(3);
    const cloudGroup = result.groups.find(g => g.type === 'aws_cloud');
    const vpcGroup = result.groups.find(g => g.type === 'vpc');
    const pubGroup = result.groups.find(g => g.type === 'subnet_public');
    expect(cloudGroup).toBeDefined();
    expect(vpcGroup).toBeDefined();
    expect(pubGroup).toBeDefined();

    // Hierarchy
    expect(cloudGroup.children).toContain('vpc');
    expect(vpcGroup.children).toContain('pub');
    expect(vpcGroup.children).toContain('s2');
    expect(pubGroup.children).toContain('s1');

    // Services
    expect(result.services).toHaveLength(3);
    const alb = result.services.find(s => s.type === 'alb');
    const ec2 = result.services.find(s => s.type === 'ec2');
    const users = result.services.find(s => s.type === 'users');
    expect(alb.group).toBe('pub');
    expect(ec2.group).toBe('vpc');
    expect(users.group).toBeUndefined();

    // Connections
    expect(result.connections).toHaveLength(2);
    expect(result.connections[0].from).toBe('s3');
    expect(result.connections[0].to).toBe('s1');
    expect(result.connections[1].label).toBe('HTTP');
  });

  // --- HTML tag stripping in labels ---

  it('strips HTML tags from labels', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="&lt;font color=&quot;#000000&quot;&gt;My EC2&lt;/font&gt;" style="resIcon=mxgraph.aws4.ec2;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.services[0].label).toBe('My EC2');
  });

  // --- Connection without label omits label field ---

  it('omits label field from connection when empty', () => {
    const xml = wrapXml(
      `<mxCell id="s1" value="EC2" style="resIcon=mxgraph.aws4.ec2;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>` +
      `<mxCell id="s2" value="RDS" style="resIcon=mxgraph.aws4.rds;" vertex="1" parent="1"><mxGeometry x="200" y="0" width="78" height="78" as="geometry"/></mxCell>` +
      `<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="s1" target="s2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
    const result = summarizeXml(xml);
    expect(result.connections[0]).not.toHaveProperty('label');
  });
});
