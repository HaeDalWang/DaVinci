import { expect, test, vi } from 'vitest';
import { DiagramController } from '../src/core/diagram-controller.js';
import { SnapshotManager } from '../src/core/snapshot-manager.js';

const icon = (id, type, x, locked = '') => `<mxCell id="${id}" value="${id}" vertex="1" parent="services" ${locked} style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${type};html=1;verticalLabelPosition=bottom;fillColor=#7AA116;fontSize=10;"><mxGeometry x="${x}" y="70" width="50" height="50" as="geometry"/></mxCell>`;
const model = (body, width = 400) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="services" parent="0"/><mxCell id="background" parent="0"/><mxCell id="frame" vertex="1" parent="background" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud_alt;container=0;"><mxGeometry x="0" y="0" width="${width}" height="250" as="geometry"/></mxCell>${body}<mxCell id="edge" edge="1" parent="services" source="s3" target="web" style="endArrow=classic;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="160" y="20"/></Array></mxGeometry></mxCell></root></mxGraphModel>`;
// 같은 서비스 peer(id: s3)와 서로 다른 이웃 두 개. 이웃은 대상 서비스와 겹치지 않는 종류를 쓴다.
const NEIGHBORS = { s3: ['ec2', 'cloudwatch'], ec2: ['sns', 'cloudwatch'], rds: ['ec2', 'cloudwatch'], lambda: ['sns', 'cloudwatch'] };
const fixture = (width = 400, locked = '', type = 's3') => model(icon('s3', type, 60) + icon('web', NEIGHBORS[type][0], 150, locked) + icon('monitor', NEIGHBORS[type][1], 240), width);
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
const run = async (xml, fail = false, serviceType = 's3') => {
    const state = { xml };
    const bridge = { getCurrentXml: async () => state.xml, getEditingState: async () => ({ xml: state.xml, pageIndex: 0 }),
        merge: vi.fn(async next => { if (fail && bridge.merge.mock.calls.length === 1) return { error: 'failed' }; state.xml = next; return {}; }) };
    const result = await new DiagramController(bridge, new SnapshotManager()).executeCommands([{ type: 'add_service', params: { serviceType, label: 'Log Archive' } }]);
    return { state, result, bridge };
};

test.each(Object.keys(NEIGHBORS))('%s: inserts into a service row and moves only its neighboring icons, preserving all content and other pages', async type => {
    const xml = `<mxfile><diagram id="active">${fixture(400, '', type)}</diagram><diagram id="other">${fixture(400, '', type)}</diagram></mxfile>`;
    const { state, result } = await run(xml, false, type);
    expect(result.success).toBe(true);
    const before = parse(xml), after = parse(state.xml), page = after.querySelector('diagram');
    const added = [...page.querySelectorAll('mxCell[vertex="1"]')].find(c => c.getAttribute('value') === 'Log Archive');
    expect(added.querySelector('mxGeometry').getAttribute('x')).toBe('150');
    expect(added.querySelector('mxGeometry').getAttribute('y')).toBe('70');
    expect(page.querySelector('[id="web"] mxGeometry').getAttribute('x')).toBe('240');
    expect(page.querySelector('[id="monitor"] mxGeometry').getAttribute('x')).toBe('330');
    expect(added.getAttribute('style')).toBe(before.querySelector('[id="s3"]').getAttribute('style').replace('html=1', 'html=0'));
    for (const original of before.querySelector('root').children) {
        const actual = [...page.querySelector('root').children].find(c => c.id === original.id).cloneNode(true);
        if (['web', 'monitor'].includes(original.id)) actual.querySelector('mxGeometry').setAttribute('x', original.querySelector('mxGeometry').getAttribute('x'));
        expect(actual.outerHTML).toBe(original.outerHTML);
    }
    expect(after.querySelectorAll('diagram')[1].outerHTML).toBe(before.querySelectorAll('diagram')[1].outerHTML);
});

test.each(Object.keys(NEIGHBORS))('%s: insufficient room or a locked neighbor leaves original coordinates untouched', async type => {
    for (const xml of [fixture(300, '', type), fixture(400, 'locked="1"', type)]) {
        const { state, result } = await run(xml, false, type);
        expect(result.success).toBe(true);
        for (const original of parse(xml).querySelector('root').children) {
            expect([...parse(state.xml).querySelector('root').children].find(c => c.id === original.id).outerHTML).toBe(original.outerHTML);
        }
    }
});

test.each(Object.keys(NEIGHBORS))('%s: failed editor merge restores the original row snapshot', async type => {
    const xml = fixture(400, '', type);
    const { state, result, bridge } = await run(xml, true, type);
    expect(result.success).toBe(false);
    expect(state.xml).toBe(xml);
    expect(bridge.merge).toHaveBeenCalledTimes(2);
});

test.each(['ec2', 'rds', 'lambda'])('%s: without a same-service peer the original cells stay untouched and the new icon uses the catalog style', async type => {
    const xml = model(icon('a', 'sns', 60) + icon('b', 'cloudwatch', 150));
    const { state, result } = await run(xml, false, type);
    expect(result.success).toBe(true);
    const before = parse(xml), after = parse(state.xml);
    for (const original of before.querySelector('root').children) {
        expect([...after.querySelector('root').children].find(c => c.id === original.id).outerHTML).toBe(original.outerHTML);
    }
    const added = [...after.querySelectorAll('mxCell[vertex="1"]')].find(c => c.getAttribute('value') === 'Log Archive');
    expect(added.getAttribute('style')).toContain(`resIcon=mxgraph.aws4.${type};`);
});

test('a UserObject wrapper in the moved row keeps its attributes and children', async () => {
    const wrapped = `<UserObject label="web" id="web" tooltip="keep"><mxCell vertex="1" parent="services" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;"><mxGeometry x="150" y="70" width="50" height="50" as="geometry"/></mxCell></UserObject>`;
    const xml = model(icon('s3', 'lambda', 60) + wrapped + icon('monitor', 'cloudwatch', 240));
    const { state, result } = await run(xml, false, 'lambda');
    expect(result.success).toBe(true);
    const node = parse(state.xml).querySelector('UserObject[id="web"]');
    expect(node.getAttribute('tooltip')).toBe('keep');
    expect(node.querySelector('mxCell').getAttribute('parent')).toBe('services');
});

// KB의 실제 RDS 표기(shape=...rds_instance 등, resIcon 없음)도 같은 서비스 peer로 통합되어야 한다.
const alias = (id, shape, x, size = 48) => `<mxCell id="${id}" value="${id}" vertex="1" parent="services" style="sketch=0;fillColor=#C925D1;strokeColor=none;verticalLabelPosition=bottom;html=1;fontSize=10;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.${shape};"><mxGeometry x="${x}" y="70" width="${size}" height="${size}" as="geometry"/></mxCell>`;
const other = (id, style, x) => `<mxCell id="${id}" value="${id}" vertex="1" parent="services" style="${style}"><mxGeometry x="${x}" y="70" width="40" height="30" as="geometry"/></mxCell>`;

test.each(['rds_instance', 'rds_instance_alt', 'rds_postgresql_instance', 'rds_postgresql_instance_alt'])('rds alias %s: joins the row with the peer style, size and parent and moves only service icons', async shape => {
    const xml = model(alias('s3', shape, 60) + alias('web', 'rds_instance', 150) + alias('monitor', 'rds_postgresql_instance_alt', 240) +
        other('note', 'text;html=1;', 430) + other('pic', 'shape=image;image=data:image/png,AAAA;', 480), 600);
    const { state, result } = await run(xml, false, 'rds');
    expect(result.success).toBe(true);
    const before = parse(xml), after = parse(state.xml);
    const added = [...after.querySelectorAll('mxCell[vertex="1"]')].find(c => c.getAttribute('value') === 'Log Archive');
    const geo = added.querySelector('mxGeometry');
    expect(added.getAttribute('style')).toBe(before.querySelector('[id="s3"]').getAttribute('style').replace('html=1', 'html=0'));
    expect(added.getAttribute('parent')).toBe('services');
    expect([geo.getAttribute('width'), geo.getAttribute('height'), geo.getAttribute('y')]).toEqual(['48', '48', '70']);
    expect(geo.getAttribute('x')).toBe('150');
    expect(after.querySelector('[id="web"] mxGeometry').getAttribute('x')).not.toBe('150');
    for (const id of ['note', 'pic', 'frame', 'edge']) expect(after.querySelector(`[id="${id}"]`).outerHTML).toBe(before.querySelector(`[id="${id}"]`).outerHTML);
});

test('different AWS shapes are not recognised as RDS', async () => {
    const { identifyServiceByStyle } = await import('../src/core/aws-service-catalog.js');
    for (const shape of ['rds_instance_extra', 'rds_instance2', 'rdsx', 'dynamodb_table', 'aurora_instance', 'cache_node']) {
        expect(identifyServiceByStyle(`pointerEvents=1;shape=mxgraph.aws4.${shape};`)?.type).not.toBe('rds');
    }
    for (const shape of ['rds_instance', 'rds_instance_alt', 'rds_postgresql_instance', 'rds_postgresql_instance_alt']) {
        expect(identifyServiceByStyle(`pointerEvents=1;shape=mxgraph.aws4.${shape};`)?.type).toBe('rds');
        expect(identifyServiceByStyle(`shape=mxgraph.aws4.${shape}`)?.type).toBe('rds');
    }
});

test('a later peer is still tried when the first four peers have no free spot', async () => {
    // 작은 컨테이너 안 peer 4개는 빈자리가 없어 각각 탐색 후보 전체를 소진한다. 마지막 peer만 레이어에 빈 공간이 있다.
    const boxed = n => `<mxCell id="box${n}" vertex="1" parent="services" style="container=1;"><mxGeometry x="${n * 130}" y="300" width="100" height="100" as="geometry"/></mxCell>` +
        `<mxCell id="in${n}" value="in${n}" vertex="1" parent="box${n}" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;html=1;"><mxGeometry x="25" y="45" width="50" height="50" as="geometry"/></mxCell>`;
    const xml = model([1, 2, 3, 4].map(boxed).join('') + icon('free', 's3', 700), 1000);
    const { state, result } = await run(xml);
    expect(result.success).toBe(true);
    const added = [...parse(state.xml).querySelectorAll('mxCell[vertex="1"]')].find(c => c.getAttribute('value') === 'Log Archive');
    expect(added.getAttribute('parent')).toBe('services');
    const x = Number(added.querySelector('mxGeometry').getAttribute('x')), y = Number(added.querySelector('mxGeometry').getAttribute('y'));
    expect(Math.abs(x - 700) + Math.abs(y - 70)).toBeLessThanOrEqual(400);
});
