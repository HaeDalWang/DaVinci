// Local controller/XML check. This does not run draw.io, a browser, Docker, or a model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { DiagramController } from '../../src/core/diagram-controller.js';
import { SnapshotManager } from '../../src/core/snapshot-manager.js';
import { identifyServiceByStyle } from '../../src/core/aws-service-catalog.js';
import { measureXml, comparePreservation } from '../../scripts/layout-metrics.js';

const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
const serialize = el => new XMLSerializer().serializeToString(el);
const canonical = el => [el.tagName, [...el.attributes].map(a => [a.name, a.value]).sort(),
    [...el.children].map(canonical), [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent)];
const hash = text => createHash('sha256').update(text).digest('hex');
assert(process.argv[2], 'Usage: node development/tools/verify-kb-row-reflow.mjs <new-result-directory> [s3,ec2,rds,lambda]');
const services = (process.argv[3] || 's3').split(',');
const multi = Boolean(process.argv[3]);
const output = resolve(process.argv[2]);
const proofName = multi ? '/local-kb-multiservice-proof.json' : '/local-kb-proof.json';
assert(!existsSync(output + proofName), 'Existing results must not be overwritten');
mkdirSync(output + '/private.local', { recursive: true });
const manifest = JSON.parse(readFileSync('development/fixtures/baseline/kb-inputs.json'));
const records = [];
for (const serviceType of services) for (const source of manifest.inputs) {
    assert.equal(hash(readFileSync(source.path)), source.sha256);
    for (let index = 0; index < source.pages.length; index++) {
        const stem = `${source.id}-p${index + 1}`;
        const outStem = multi ? `${serviceType}-${stem}` : stem;
        let step = 'setup';
        try {
        // Same native-normalized input as B014. Earlier evidence is read only.
        const base = 'development/results/2026-10-07-integrated-addition/private.local/live-addition/';
        const beforeXml = readFileSync(base + stem + '-before.drawio', 'utf8');
        const before = parse(beforeXml), pages = [...before.querySelectorAll('diagram')];
        let xml = beforeXml;
        const bridge = { getCurrentXml: async () => xml,
            getEditingState: async () => ({ xml, pageIndex: index }),
            merge: async next => { xml = next; return {}; } };
        const result = await new DiagramController(bridge, new SnapshotManager()).executeCommands([
            { type: 'add_service', params: { serviceType, label: `__baseline_added_${serviceType}__`, pageId: pages[index].id } },
        ]);
        step = 'execute'; assert.equal(result.success, true);
        const afterPages = [...parse(xml).querySelectorAll('diagram')];
        step = 'other-pages'; assert.equal(pages.length, afterPages.length);
        for (let i = 0; i < pages.length; i++) if (i !== index) assert.deepEqual(canonical(afterPages[i]), canonical(pages[i]));
        step = 'preservation'; const input = measureXml(serialize(pages[index].querySelector('mxGraphModel')));
        const actual = measureXml(serialize(afterPages[index].querySelector('mxGraphModel')));
        const preservation = comparePreservation(input, actual, { allowGeometryChanges: true });
        assert.equal(preservation.preservationPassed, true);
        assert.equal(preservation.addedIds.length, 1);
        assert.equal(actual.counts.edges, input.counts.edges);
        assert.equal(actual.counts.vertices, input.counts.vertices + 1);
        const added = actual.cells.find(c => preservation.addedIds.includes(c.id));
        step = 'ids-content-edges'; const originals = [...pages[index].querySelector('root').children];
        const newRows = [...afterPages[index].querySelector('root').children];
        for (const original of originals) {
            const changed = newRows.find(el => el.id === original.id)?.cloneNode(true);
            assert(changed);
            const old = original.cloneNode(true);
            if (preservation.changedGeometryIds.includes(original.id)) {
                const cell = old.localName === 'mxCell' ? old : old.querySelector('mxCell');
                const moved = identifyServiceByStyle(cell.getAttribute('style'));
                assert(/(^|;)resIcon=mxgraph\.aws4\./.test(cell.getAttribute('style')) || (moved && moved.tier !== 'group'), 'moved cell must be a service icon');
                assert.equal(cell.getAttribute('parent'), added.parent);
                assert.notEqual(cell.getAttribute('locked'), '1');
                for (const el of [old, changed]) for (const name of ['x', 'y']) el.querySelector('mxGeometry').removeAttribute(name);
            }
            assert.deepEqual(canonical(changed), canonical(old));
        }
        step = 'row-and-style'; const moved = actual.cells.filter(c => preservation.changedGeometryIds.includes(c.id));
        assert(moved.every(c => c.rect.y === added.rect.y));
        const peers = input.cells.filter(c => identifyServiceByStyle(c.style)?.type === serviceType && c.parent === added.parent && c.rect);
        const peerCandidates = input.cells.filter(c => identifyServiceByStyle(c.style)?.type === serviceType).length;
        assert(!peers.length || peers.some(c => c.style.replace(/html=1;?/, 'html=0;') === added.style &&
            c.rect.width === added.rect.width && c.rect.height === added.rect.height), 'added icon must use one peer style and size');
        step = 'collisions'; const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
        const changedIds = new Set([...preservation.changedGeometryIds, added.id]);
        const existingPairs = new Set(input.overlapPairs.map(p => p.slice().sort().join('|')));
        const collisions = actual.overlapPairs.filter(pair => pair.some(id => changedIds.has(id)) && !existingPairs.has(pair.slice().sort().join('|'))).filter(pair => {
            const cells = pair.map(id => actual.cells.find(c => c.id === id));
            return !cells.some((c, i) => contains(c.rect, cells[1 - i].rect) && !c.style.includes('resourceIcon') &&
                input.cells.some(p => peers.some(peer => p.id === c.id && contains(p.rect, peer.rect))));
        });
        assert.equal(collisions.length, 0);
        writeFileSync(output + '/private.local/' + outStem + '-after.drawio', xml);
        records.push({ service: serviceType, passed: true, peerCandidates, hasPeerInParent: peers.length > 0, input: source.id, page: index + 1, inputSha256: hash(beforeXml), outputSha256: hash(xml),
            originalVertices: input.counts.vertices, originalEdges: input.counts.edges,
            addedVertices: 1, movedVertices: moved.length, relatedRowAligned: moved.length > 0,
            contentAndConnectionsPreserved: true, otherPagesUnchanged: true, newIconCollisions: 0 });
        console.log(outStem, 'moved:', moved.length, 'passed');
        } catch (error) {
            // 고객 데이터가 섞일 수 있어 실패 단계와 오류 이름만 남긴다.
            records.push({ service: serviceType, passed: false, input: source.id, page: index + 1, failedStep: step, error: error.name });
            console.log(outStem, 'FAILED at', step);
        }
    }
}
assert.equal(records.length, 7 * services.length);
const summary = Object.fromEntries(services.map(name => {
    const own = records.filter(r => r.service === name);
    return [name, { pages: own.length, passed: own.filter(r => r.passed).length, failed: own.filter(r => !r.passed).length,
        withPeer: own.filter(r => r.hasPeerInParent).length, withoutPeer: own.filter(r => r.passed && !r.hasPeerInParent).length }];
}));
writeFileSync(output + proofName, JSON.stringify({ scope: 'real controller, native-normalized KB XML; mocked bridge, no browser',
    manifestSha256: hash(readFileSync('development/fixtures/baseline/kb-inputs.json')), inputSha256: manifest.inputs.map(i => i.sha256),
    controllerSha256: hash(readFileSync('src/core/diagram-controller.js')), catalogSha256: hash(readFileSync('src/core/aws-service-catalog.js')),
    summary, records }, null, 2) + '\n');
process.exitCode = records.every(r => r.passed) ? 0 : 1;
