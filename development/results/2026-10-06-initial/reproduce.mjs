// Historical diagnostic: assertions confirm legacy defects, not desired behavior.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
import { JSDOM } from '../../../node_modules/jsdom/lib/api.js';
import { summarizeXml } from '../../../src/core/xml-summarizer.js';
import { calculateLayout } from '../../../src/core/layout-engine.js';
import { reorganizeForAlignment } from '../../../src/core/aws-architecture-builder.js';
import { DrawIOBridge } from '../../../src/core/drawio-bridge.js';
import { DiagramController } from '../../../src/core/diagram-controller.js';
import { ChannelRouter } from '../../../src/core/channel-router.js';
import { SnapshotManager } from '../../../src/core/snapshot-manager.js';
const dom = new JSDOM('<!doctype html>');
for (const key of ['window', 'document', 'DOMParser', 'XMLSerializer']) globalThis[key] = dom.window[key];
globalThis.CSS = { escape: value => value };
const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="original-ec2" value="Web" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;" vertex="1" parent="1"><mxGeometry x="777" y="888" width="90" height="90" as="geometry"/></mxCell><mxCell id="memo" value="Keep this note" style="text;" vertex="1" parent="1"><mxGeometry x="900" y="200" width="120" height="30" as="geometry"/></mxCell></root></mxGraphModel>';
let currentXml = xml;
const fakeBridge = { getCurrentXml: async () => currentXml, loadXml: value => { currentXml = value; } };
const controller = new DiagramController(fakeBridge, new SnapshotManager());
assert.equal((await controller.executeCommands([{ type: 'add_service', params: { serviceType: 's3', label: 'Bucket' } }])).success, true);
const rebuilt = new DOMParser().parseFromString(currentXml, 'text/xml');
assert.equal(rebuilt.querySelector('[id="memo"]'), null);
assert.equal(rebuilt.querySelector('[id="original-ec2"]'), null);
assert.notEqual(rebuilt.querySelector('mxCell[value="Web"] mxGeometry').getAttribute('x'), '777');
console.log('CONFIRMED: add_service removes non-AWS memo, renumbers existing ID, resets manual geometry');
currentXml = xml;
const result = await controller.executeCommands([
  { type: 'add_service', params: { serviceType: 's3', label: 'Bucket' } },
  { type: 'remove_service', params: { serviceId: 'original-ec2' } },
]);
assert.equal(result.success, false);
assert.equal(currentXml, xml);
console.log('CONFIRMED: command batch using original service ID fails after add_service; rollback restores XML');
const bridge = new DrawIOBridge();
bridge.loadXml(xml);
bridge._handleMessage({ origin: 'https://untrusted.invalid', source: {}, data: JSON.stringify({ event: 'autosave', xml: 'FORGED' }) });
assert.equal(await bridge.getCurrentXml(), 'FORGED');
console.log('CONFIRMED: bridge accepts autosave message from unrelated origin/source');
bridge.loadXml(xml);
const pendingMerge = bridge.merge('<mxGraphModel/>');
bridge._handleMessage({ data: JSON.stringify({ event: 'merge' }) });
await pendingMerge;
assert.equal(await bridge.getCurrentXml(), xml);
console.log('CONFIRMED: successful merge does not refresh cached XML before subsequent edit');
const data = { groups: [], services: [{ id: 'a', type: 'ec2', label: 'A' }, { id: 'b', type: 'rds', label: 'B' }], connections: [{ from: 'a', to: 'b' }] };
assert.deepEqual(calculateLayout(data), calculateLayout({ ...data, connections: [{ from: 'b', to: 'a' }] }));
assert.deepEqual(reorganizeForAlignment(data, 'hierarchy'), reorganizeForAlignment(data, 'left-right'));
assert.equal(reorganizeForAlignment({ ...data, groups: [{ id: 'original-vpc', type: 'vpc', children: [] }] }).groups.some(g => g.id === 'original-vpc'), false);
console.log('CONFIRMED: connections do not affect layout; alignment discards input groups and ignores mode');
const summaryPayload = await new ChannelRouter({ getCurrentXml: async () => xml }).preparePayload('현재 구성을 설명해주세요');
assert.equal(summaryPayload.data.services[0].type, undefined);
assert.equal(JSON.stringify(summaryPayload.data.services).includes('"type"'), false);
console.log('CONFIRMED: summary channel drops service type because analyzer no longer supplies shapeName');
currentXml = xml.replace('</root>', '<mxCell id="bucket" value="Bucket" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;" vertex="1" parent="1"/></root>');
let mergedXml;
fakeBridge.merge = async value => { mergedXml = value; return { error: null }; };
await controller.executeCommands([{ type: 'add_connection', params: { sourceLabel: 'Web', targetLabel: 'Bucket', label: 'HTTPS "secure"' } }]);
assert.ok(new DOMParser().parseFromString(mergedXml, 'text/xml').querySelector('parsererror'));
console.log('CONFIRMED: add_connection produces invalid XML for a quoted connection label');
for (const name of ['example-xml/example1.drawio', 'test-xml/test-2.drawio']) {
  const source = readFileSync(`${repoRoot}${name}`, 'utf8');
  const doc = new DOMParser().parseFromString(source, 'text/xml');
  const summary = summarizeXml(source);
  console.log(JSON.stringify({ file: name, vertices: doc.querySelectorAll('mxCell[vertex="1"]').length, edges: doc.querySelectorAll('mxCell[edge="1"]').length, boundEdges: doc.querySelectorAll('mxCell[edge="1"][source][target]').length, summaryServices: summary.services.length, summaryGroups: summary.groups.length, summaryConnections: summary.connections.length }));
}
dom.window.close();
