// Run from any cwd: node scripts/measure-baseline.mjs <new-output-directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { measureXml, comparePreservation } from './layout-metrics.js';
import { summarizeXml } from '../src/core/xml-summarizer.js';
import { reorganizeForAlignment } from '../src/core/aws-architecture-builder.js';
import { buildXml } from '../src/core/json-to-xml-builder.js';
import { DiagramController } from '../src/core/diagram-controller.js';
import { SnapshotManager } from '../src/core/snapshot-manager.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || `${root}development/results/2026-10-06-baseline`);
if (existsSync(output)) throw new Error('Use a new output directory; historical results cannot be overwritten.');
const read = path => readFileSync(resolve(root, path), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(read('development/fixtures/baseline/inputs.json'));
for (const input of manifest.inputs) assert.equal(hash(read(input.path)), input.sha256, `Changed input: ${input.path}`);
mkdirSync(output, { recursive: true });
const save = (path, text) => writeFileSync(resolve(output, path), text);
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(' '));
const dom = new JSDOM();
for (const key of ['window', 'document', 'DOMParser', 'XMLSerializer']) globalThis[key] = dom.window[key];
// All fixed fixture IDs are CSS-safe; do not pretend this is a general CSS.escape polyfill.
globalThis.CSS = { escape: id => { assert.match(id, /^[a-zA-Z0-9_-]+$/); return id; } };

async function command(xml, commands) {
    let current = xml;
    const bridge = { getCurrentXml: async () => current, loadXml: value => { current = value; } };
    const controller = new DiagramController(bridge, new SnapshotManager());
    const result = await controller.executeCommands(commands);
    return { xml: current, result };
}

function overlapBreakdown(measurement) {
    const cells = new Map(measurement.cells.map(cell => [cell.id, cell]));
    const result = { partialCount: 0, containmentCount: 0, identicalCount: 0 };
    const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
    for (const [aId, bId] of measurement.overlapPairs) {
        const a = cells.get(aId).rect, b = cells.get(bId).rect;
        if (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height) result.identicalCount++;
        else if (contains(a, b) || contains(b, a)) result.containmentCount++;
        else result.partialCount++;
    }
    // Containment does not establish intent; identical leaf nodes can be fully stacked.
    return result;
}

function explicitMetrics(input, measurement) {
    const cells = new Map(measurement.cells.map(cell => [cell.id, cell]));
    const edgeIds = input.primaryEdgeIds || [];
    const directed = edgeIds.map(id => cells.get(id)).filter(edge => edge?.edge && cells.get(edge.source)?.rect && cells.get(edge.target)?.rect);
    const backward = directed.filter(edge => {
        const from = cells.get(edge.source).rect, to = cells.get(edge.target).rect;
        return from.x + from.width / 2 > to.x + to.width / 2;
    }).length;
    const pairs = input.azPairs || [];
    const paired = pairs.filter(pair => pair.every(id => cells.get(id)?.rect && cells.get(cells.get(id).parent)?.rect));
    const deviations = paired.map(([aId, bId]) => {
        const a = cells.get(aId), b = cells.get(bId);
        const ap = cells.get(a.parent).rect, bp = cells.get(b.parent).rect;
        return Math.abs((a.rect.x - ap.x) - (b.rect.x - bp.x)) + Math.abs((a.rect.y - ap.y) - (b.rect.y - bp.y));
    });
    return {
        backwardPrimaryEdges: { value: edgeIds.length && directed.length === edgeIds.length ? backward : null, measured: directed.length, total: edgeIds.length, method: 'explicit fixture IDs, horizontal endpoint centers; missing IDs are unmeasured' },
        azPairOffsetDifference: { value: pairs.length && paired.length === pairs.length ? deviations.reduce((sum, n) => sum + n, 0) / pairs.length : null, measured: paired.length, total: pairs.length, unit: 'diagram unit, mean L1 offset difference relative to explicit AZ parents' },
        crossings: { value: null, measured: 0, total: measurement.counts.edges, reason: 'rendered routes unavailable; XML waypoints are not full rendered paths' },
        nodePenetrations: { value: null, reason: 'rendered routes unavailable' },
        labelOverlaps: { value: null, reason: 'rendered label bounds unavailable' },
        areaRatio: { value: null, reason: 'user golden diagrams not provided' },
    };
}

const records = [];
for (const input of manifest.inputs) {
    const original = read(input.path);
    const before = measureXml(original);
    const variants = [
        ['original', async () => ({ xml: original }), {}],
        ['hierarchy', async () => ({ xml: buildXml(reorganizeForAlignment(summarizeXml(original), 'hierarchy')) }), { allowGeometryChanges: true }],
        ['horizontal', async () => ({ xml: buildXml(reorganizeForAlignment(summarizeXml(original), 'left-right'), { direction: 'horizontal' }) }), { allowGeometryChanges: true }],
        ['add-service', () => command(original, [{ type: 'add_service', params: { serviceType: 's3', label: '__baseline_added_s3__' } }]), {}],
    ];
    if (input.commandTargetId) {
        variants.push(
            ['remove-by-id', () => command(original, [{ type: 'remove_service', params: { serviceId: input.commandTargetId } }]), { expectedRemovedIds: input.expectedRemovedWithTarget }],
            ['add-then-remove', () => command(original, [{ type: 'add_service', params: { serviceType: 's3', label: '__baseline_added_s3__' } }, { type: 'remove_service', params: { serviceId: input.commandTargetId } }]), { expectedRemovedIds: input.expectedRemovedWithTarget }],
            ['rollback', () => command(original, [{ type: 'remove_service', params: { serviceId: input.commandTargetId } }, { type: '__unsupported_baseline_command__', params: {} }]), {}],
        );
    }
    for (const [variant, run, options] of variants) {
        const samples = [];
        let executed;
        try {
            if (variant !== 'original') await run(); // One warm-up; not included in timings.
            for (let i = 0; i < (variant === 'original' ? 1 : 5); i++) {
                const started = performance.now();
                executed = await run();
                if (variant !== 'original') samples.push(performance.now() - started);
            }
            const measured = measureXml(executed.xml);
            const preservation = comparePreservation(before, measured, options);
            let commandCorrectness = null;
            if (executed.result) {
                const expectedSuccess = variant !== 'rollback';
                const added = measured.cells.filter(cell => cell.vertex && cell.value === '__baseline_added_s3__').length;
                const expectedAdded = variant === 'add-service' || variant === 'add-then-remove' ? 1 : 0;
                commandCorrectness = {
                    result: executed.result, expectedSuccess, addedCount: added, expectedAdded,
                    rollbackExact: variant === 'rollback' || !executed.result.success ? executed.xml === original : null,
                    passed: executed.result.success === expectedSuccess && added === expectedAdded && preservation.preservationPassed && preservation.expectedRemovedStillPresentIds.length === 0 && (variant !== 'rollback' || executed.xml === original),
                    scope: 'real controller + in-memory get/load adapter; no iframe, AI, merge or network',
                };
            }
            const xmlFile = `${input.id}-${variant}.drawio`;
            save(xmlFile, executed.xml);
            const sorted = [...samples].sort((a, b) => a - b);
            records.push({ input: input.id, variant, status: 'measured', xmlFile, outputSha256: hash(executed.xml), measurement: measured, overlapBreakdown: overlapBreakdown(measured), preservation, commandCorrectness, explicitMetrics: explicitMetrics(input, measured), timing: samples.length ? { unit: 'ms', warmup: 1, samples, min: sorted[0], median: sorted[2], max: sorted.at(-1), scope: 'transform/controller with warning capture; excludes metric parsing, disk IO, rendering, network' } : null });
        } catch (error) {
            records.push({ input: input.id, variant, status: 'failed', error: error.message, samplesMs: samples });
        }
    }
}

const sourcePaths = [
    ...readdirSync(resolve(root, 'src/core')).filter(name => name.endsWith('.js')).map(name => `src/core/${name}`),
    'src/components/align-modal.js', 'package-lock.json', 'scripts/layout-metrics.js', 'scripts/measure-baseline.mjs', 'development/fixtures/baseline/inputs.json',
];
const runLocal = (program, args) => execFileSync(program, args, { cwd: root, encoding: 'utf8' }).trim();
console.warn = originalWarn;
const report = {
    methodVersion: 2, createdAt: new Date().toISOString(), codeSha: runLocal('git', ['rev-parse', 'HEAD']),
    dirtyStatus: runLocal('git', ['status', '--short']),
    environment: { node: process.version, npm: runLocal('npm', ['--version']), platform: process.platform, arch: process.arch, jsdom: JSON.parse(read('node_modules/jsdom/package.json')).version },
    command: `node scripts/measure-baseline.mjs ${relative(root, output)}`,
    sourceSha256: Object.fromEntries(sourcePaths.map(path => [path, hash(read(path))])),
    warnings: Object.fromEntries([...new Set(warnings)].map(message => [message, warnings.filter(value => value === message).length])),
    manifest, records,
};
save('baseline.json', JSON.stringify(report, null, 2) + '\n');
const rows = records.map(record => {
    if (record.status !== 'measured') return `| ${record.input} | ${record.variant} | 실패: ${record.error} | — | — | — | — | — | — | — | — |`;
    const m = record.measurement;
    const b = record.overlapBreakdown, c = record.commandCorrectness;
    return `| ${record.input} | ${record.variant} | ${m.counts.vertices}/${m.counts.edges} | ${m.geometryCoverage.measured}/${m.geometryCoverage.total} | ${b.partialCount}/${b.containmentCount}/${b.identicalCount} | ${m.boundingBox?.area ?? '미측정'} | ${record.preservation.missingIds.length} | ${record.preservation.preservationPassed ? '통과' : '실패'} | ${c ? (c.result.success ? '성공' : '실패') : '—'} | ${c ? (c.passed ? '통과' : '실패') : '—'} | ${c?.rollbackExact === true ? '원본 복원' : '—'} |`;
});
save('table.md', '# 레거시 기준선 원시 표\n\n| 입력 | 변환 | vertex/edge | 좌표 측정/전체 | 교집합: 부분/포함/동일 | 경계 상자 면적 | 예상 밖 ID 누락 | 보존 | 명령 반환 | 기대 동작 | 롤백 |\n|---|---|---:|---:|---:|---:|---:|---|---|---|---|\n' + rows.join('\n') + '\n\n교집합은 라벨을 제외한 사각형 지표이며, XML의 실제 부모/자식 쌍만 제외한다. 포함이 의도한 배치라는 뜻은 아니며 같은 위치의 노드 중첩을 숨기지 않는다. 누락/변경이 있는 결과는 배치 개선으로 인정하지 않는다. 미측정·시간·명령 정확성·변경 ID 상세는 baseline.json을 확인한다.\n');
dom.window.close();
console.log(`Recorded ${records.length} cases; measurement failures: ${records.filter(record => record.status === 'failed').length}. Product preservation failures are observations, not measurement failures.`);
console.log(relative(root, output));
if (records.some(record => record.status === 'failed')) process.exitCode = 1;
