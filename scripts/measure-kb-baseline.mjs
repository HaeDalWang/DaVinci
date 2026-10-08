// Run from any cwd: node scripts/measure-kb-baseline.mjs <new-output-directory> [manifest.json | --manifest manifest.json]
//
// KB 다중 페이지 기준선. 두 종류의 진단을 분리해서 기록한다.
//  - page-extracted: 각 페이지의 mxGraphModel만 꺼내 변환한 진단. 실제 파일 전체 동작이 아니다.
//  - whole-file: 원본 mxfile을 그대로 실제 변환 함수에 넣은 결과. 출력이 mxGraphModel이면 보존된 페이지는 0이다.
// 원본 값·스타일·라벨이 담긴 XML과 전체 측정값은 <output>/private.local/ 아래에만 쓴다(.gitignore의 *.local).
// baseline.json/table.md에는 개수·해시·커버리지·불투명 ID 배열·오류 분류 코드만 남긴다.
// bridge/iframe/AI/네트워크는 검증하지 않는다(메모리 내 get/load 어댑터 + 실제 DiagramController).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { measureXml, comparePreservation } from './layout-metrics.js';
import { summarizeXml } from '../src/core/xml-summarizer.js';
import { reorganizeForAlignment } from '../src/core/aws-architecture-builder.js';
import { buildXml } from '../src/core/json-to-xml-builder.js';
import { DiagramController } from '../src/core/diagram-controller.js';
import { SnapshotManager } from '../src/core/snapshot-manager.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const METHOD_VERSION = 1;
const ADDED_MARKER = '__baseline_added_s3__';
const DEFAULT_MANIFEST = 'development/fixtures/baseline/kb-inputs.json';
const PRIVATE_DIR = 'private.local';

class InputError extends Error {}

const sha256 = data => createHash('sha256').update(data).digest('hex');
const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

function parseArgs(argv) {
    const positional = [];
    let manifest;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--manifest') manifest = argv[++i];
        else positional.push(argv[i]);
    }
    if (!positional[0]) throw new InputError('usage: node scripts/measure-kb-baseline.mjs <new-output-directory> [manifest.json | --manifest manifest.json]');
    return { output: resolve(positional[0]), manifest: resolve(root, manifest ?? positional[1] ?? DEFAULT_MANIFEST) };
}

/**
 * mxfile 또는 mxGraphModel을 페이지 목록으로 나눈다. 압축 페이지·잘못된 XML은 예외.
 * mxGraphModel이면 kind='model', 페이지 id/name은 null이다.
 */
function parsePages(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) throw new InputError('malformed XML');
    const top = doc.documentElement;
    if (top.localName === 'mxGraphModel') return { kind: 'model', pages: [{ id: null, name: null, xml }] };
    if (top.localName !== 'mxfile') throw new InputError('unsupported root element');
    const pages = Array.from(top.children).filter(el => el.localName === 'diagram').map(diagram => {
        const models = Array.from(diagram.children).filter(el => el.localName === 'mxGraphModel');
        if (models.length !== 1) throw new InputError('page is not an uncompressed single mxGraphModel');
        return { id: diagram.getAttribute('id'), name: diagram.getAttribute('name'), xml: new XMLSerializer().serializeToString(models[0]) };
    });
    return { kind: 'mxfile', pages };
}

/** 입력 hash, 페이지 ID/이름/순서, XML 유효성, 페이지 내 중복 ID를 검증한다. 실패하면 출력 디렉터리를 만들기 전에 중단한다. */
function loadInputs(manifest) {
    if (!Array.isArray(manifest.inputs) || manifest.inputs.length === 0) throw new InputError('manifest has no inputs');
    const ids = new Set();
    return manifest.inputs.map(input => {
        if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(input.id)) throw new InputError('input id must match /^[a-zA-Z0-9_-]+$/');
        if (ids.has(input.id)) throw new InputError(`duplicate input id: ${input.id}`);
        ids.add(input.id);
        if (!Array.isArray(input.pages) || input.pages.length === 0) throw new InputError(`pages must be a nonempty array: ${input.id}`);
        const pageIds = input.pages.map(page => page?.id);
        if (pageIds.some(id => typeof id !== 'string' || id === '') || new Set(pageIds).size !== pageIds.length) throw new InputError(`page ids must be unique nonempty strings: ${input.id}`);
        const path = isAbsolute(input.path) ? input.path : resolve(root, input.path);
        if (!existsSync(path)) throw new InputError(`input file missing: ${input.id}`);
        const buffer = readFileSync(path);
        if (sha256(buffer) !== input.sha256) throw new InputError(`input hash mismatch: ${input.id}`);
        const text = buffer.toString('utf8');
        const parsed = parsePages(text);
        if (parsed.kind !== 'mxfile') throw new InputError(`input is not an mxfile: ${input.id}`);
        if (parsed.pages.length !== input.pages.length) throw new InputError(`page count mismatch: ${input.id}`);
        const pages = parsed.pages.map((page, index) => {
            const expected = input.pages[index];
            if (page.id !== expected.id || page.name !== expected.name) throw new InputError(`page id/name/order mismatch: ${input.id} page ${index + 1}`);
            try {
                return { ...page, measurement: measureXml(page.xml) };
            } catch {
                throw new InputError(`page is not measurable (malformed or duplicate IDs): ${input.id} page ${index + 1}`);
            }
        });
        return { id: input.id, sha256: input.sha256, text, pages };
    });
}

async function command(xml, commands) {
    let current = xml;
    const bridge = { getCurrentXml: async () => current, loadXml: value => { current = value; } };
    const result = await new DiagramController(bridge, new SnapshotManager()).executeCommands(commands);
    return { xml: current, success: result.success };
}

/** 변환 중 콘솔 출력(라벨이 섞일 수 있음)을 숨기고 횟수만 센다. */
async function withConsoleCounts(fn) {
    const saved = { warn: console.warn, error: console.error, log: console.log };
    const counts = { warn: 0, error: 0, log: 0 };
    for (const key of Object.keys(counts)) console[key] = () => { counts[key]++; };
    try {
        return { value: await fn(), counts };
    } catch (error) {
        error.consoleCounts = counts;
        throw error;
    } finally {
        Object.assign(console, saved);
    }
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
    return result;
}

/** 측정 결과(여러 페이지 가능)를 값 없는 개수 요약으로 바꾼다. */
function safeSummary(measurements) {
    const reasonCounts = {};
    for (const m of measurements) for (const reason of Object.values(m.geometryCoverage.reasons)) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    const breakdowns = measurements.map(overlapBreakdown);
    const edgeKeys = Object.keys(measurements[0]?.edgeCoverage ?? {});
    return {
        pageCount: measurements.length,
        counts: Object.fromEntries(['cells', 'vertices', 'edges', 'groups'].map(key => [key, sum(measurements, m => m.counts[key])])),
        overlap: {
            total: sum(measurements, m => m.overlapCount),
            partialCount: sum(breakdowns, b => b.partialCount),
            containmentCount: sum(breakdowns, b => b.containmentCount),
            identicalCount: sum(breakdowns, b => b.identicalCount),
        },
        boundingBox: measurements.length === 1 ? measurements[0].boundingBox : null,
        geometryCoverage: {
            measured: sum(measurements, m => m.geometryCoverage.measured),
            total: sum(measurements, m => m.geometryCoverage.total),
            unmeasuredCount: sum(measurements, m => m.geometryCoverage.unmeasuredIds.length),
            reasonCounts,
        },
        edgeCoverage: Object.fromEntries(edgeKeys.map(key => [key, sum(measurements, m => m.edgeCoverage[key])])),
    };
}

const safePreservation = result => (result ? {
    passed: result.preservationPassed,
    missingIds: result.missingIds, addedIds: result.addedIds,
    changedStyleIds: result.changedStyleIds, changedParentIds: result.changedParentIds, changedValueIds: result.changedValueIds,
    changedGeometryIds: result.changedGeometryIds, changedEndpointIds: result.changedEndpointIds, changedKindIds: result.changedKindIds,
    geometryChangesIgnored: result.geometryChangesIgnored,
} : null);

const pageFile = (page, xml) => `<mxfile><diagram id="${escapeAttr(page.id)}" name="${escapeAttr(page.name)}">${xml}</diagram></mxfile>`;

function variantsFor(text) {
    const transform = (mode, options) => async () => ({ xml: buildXml(reorganizeForAlignment(summarizeXml(text), mode), options) });
    return [
        ['original', async () => ({ xml: text }), {}],
        ['hierarchy', transform('hierarchy'), { allowGeometryChanges: true }],
        ['horizontal', transform('left-right', { direction: 'horizontal' }), { allowGeometryChanges: true }],
        ['add-service', () => command(text, [{ type: 'add_service', params: { serviceType: 's3', label: ADDED_MARKER } }]), {}],
    ];
}

/** 측정 불가 출력의 개수만 센다(중복 ID 수 포함). 값은 읽지 않는다. */
function rawInventory(pages) {
    let cells = 0, vertices = 0, edges = 0, unique = 0;
    for (const page of pages) {
        const ids = new Set();
        for (const cell of new DOMParser().parseFromString(page.xml, 'text/xml').getElementsByTagName('mxCell')) {
            cells++;
            if (cell.getAttribute('vertex') === '1') vertices++;
            if (cell.getAttribute('edge') === '1') edges++;
            ids.add(cell.getAttribute('id'));
        }
        unique += ids.size;
    }
    return { pageCount: pages.length, cells, vertices, edges, duplicateIdCount: cells - unique };
}

/** 변환 1건을 실행·측정하고 (safe 기록, private 기록, 저장할 XML)을 반환한다. */
async function diagnose({ scope, input, pageIndex, variant, run, options, beforePages, originalText }) {
    const base = { scope, input: input.id, ...(pageIndex === undefined ? {} : { pageIndex: pageIndex + 1, pageId: input.pages[pageIndex].id }), variant };
    const started = performance.now();
    let executed, counts;
    try {
        ({ value: executed, counts } = await withConsoleCounts(run));
    } catch (error) {
        return { safe: { ...base, status: 'product-failed', errorCode: 'transform-threw', errorName: error.name, consoleMessages: error.consoleCounts } };
    }
    const timingMs = variant === 'original' ? null : Number((performance.now() - started).toFixed(2));
    const xml = variant === 'original' && scope === 'page-extracted' ? pageFile(input.pages[pageIndex], executed.xml) : executed.xml;
    let parsed = null, outputs = null;
    try { parsed = parsePages(executed.xml); } catch { /* reported as output-unparseable */ }
    if (parsed) {
        try {
            outputs = parsed.pages.map(page => ({ id: page.id, name: page.name, measurement: measureXml(page.xml) }));
        } catch { /* duplicate IDs etc.: reported with a raw inventory below */ }
    }

    const record = { ...base, status: outputs ? 'measured' : 'output-invalid', outputSha256: sha256(xml), consoleMessages: counts, timingMs };
    const privateRecord = { ...base };
    let inventory = null;
    if (outputs) {
        privateRecord.outputs = outputs.map(o => ({ id: o.id, measurement: o.measurement }));
        record.measurement = safeSummary(outputs.map(o => o.measurement));
    } else {
        inventory = parsed ? rawInventory(parsed.pages) : null;
        record.errorCode = !parsed ? 'output-unparseable' : inventory.duplicateIdCount > 0 ? 'duplicate-ids' : 'output-not-measurable';
        record.outputInventory = inventory;
    }

    if (scope === 'page-extracted') {
        record.preservation = outputs
            ? safePreservation(comparePreservation(beforePages[0].measurement, outputs[0].measurement, options))
            : { passed: false, reason: 'output-invalid' };
    } else {
        const kind = parsed ? parsed.kind : 'unparseable';
        const outPages = kind === 'mxfile' ? parsed.pages : [];
        // 페이지 ID·이름·순서가 모두 원본과 같아야 한다(ID만 일치하는 것으로는 부족).
        const identityOrderPreserved = outPages.length === beforePages.length
            && beforePages.every((page, index) => outPages[index].id === page.id && outPages[index].name === page.name);
        const matched = beforePages.filter(page => outPages.some(out => out.id === page.id));
        record.pageStructure = {
            originalPages: beforePages.length,
            outputKind: kind,
            outputPages: outPages.length,
            preservedPages: matched.length,
            pageLossCount: beforePages.length - matched.length,
            identityOrderPreserved,
            collapsedToSingleModel: kind === 'model',
            originalTotals: safeSummary(beforePages.map(p => p.measurement)).counts,
            outputTotals: outputs ? record.measurement.counts : inventory && { cells: inventory.cells, vertices: inventory.vertices, edges: inventory.edges },
            note: 'output cells cannot be assigned to original pages when pages are lost; no cross-page flattened comparison is made',
        };
        const pairs = outputs && kind === 'mxfile' ? matched.map(page => [page, outputs.find(out => out.id === page.id)]) : [];
        const results = pairs.map(([page, out]) => comparePreservation(page.measurement, out.measurement, options));
        record.pagePreservation = pairs.map(([page], i) => ({ pageIndex: beforePages.indexOf(page) + 1, ...safePreservation(results[i]) }));
        privateRecord.pagePreservation = results;
        record.preservation = {
            passed: Boolean(outputs) && identityOrderPreserved && record.pageStructure.pageLossCount === 0 && results.every(r => r.preservationPassed),
            identityOrderPreserved,
        };
    }

    if (variant === 'add-service') {
        const actualAdded = outputs ? sum(outputs, o => o.measurement.cells.filter(cell => cell.vertex && cell.value === ADDED_MARKER).length) : null;
        const markerAdded = actualAdded === 1;
        // observedSuccess/markerAdded는 "명령이 성공했고 표지가 추가됨"만 뜻한다. passed는 보존 계약까지 요구한다.
        record.command = {
            observedSuccess: executed.success === true, expectedAdded: 1, actualAdded, markerAdded,
            rollbackExact: executed.success ? null : executed.xml === originalText,
            passed: executed.success === true && markerAdded && record.preservation.passed,
            note: 'in-memory adapter, no iframe/AI/merge/network; passed also requires preservation',
        };
        if (!executed.success) record.command.errorCode = 'command-failed';
    }
    return { safe: record, privateRecord, xml };
}

function tableRow(record) {
    const label = `${record.scope === 'page-extracted' ? '페이지 추출' : '파일 전체'} | ${record.input} | ${record.pageIndex ? `p${record.pageIndex}` : '—'} | ${record.variant}`;
    if (record.status === 'product-failed') return `| ${label} | 제품 변환 실패: ${record.errorCode} | — | — | — | — | — |`;
    const m = record.measurement, o = m?.overlap, p = record.pageStructure, c = record.command, inv = record.outputInventory;
    const counts = m ? `${m.counts.vertices}/${m.counts.edges}` : `${inv ? `${inv.vertices}/${inv.edges}` : '—'} (출력 무효: ${record.errorCode})`;
    const pages = p ? `${p.preservedPages}/${p.originalPages}, 이름·순서 ${p.identityOrderPreserved ? '유지' : '불일치'}${p.collapsedToSingleModel ? ', 단일 모델로 축소' : ''}` : '—';
    const cmd = c ? `관찰 ${c.observedSuccess ? '성공' : '실패'} / 표지 ${c.actualAdded ?? '?'}/${c.expectedAdded} / 계약 ${c.passed ? '통과' : '실패'}${c.rollbackExact === true ? ' / 원본 복원' : ''}` : '—';
    return `| ${label} | ${counts} | ${m ? `${m.geometryCoverage.measured}/${m.geometryCoverage.total}` : '—'} | ${o ? `${o.partialCount}/${o.containmentCount}/${o.identicalCount}` : '—'} | ${record.preservation.passed ? '통과' : '실패'} | ${pages} | ${cmd} |`;
}

async function main() {
    const { output, manifest: manifestPath } = parseArgs(process.argv.slice(2));
    if (existsSync(output)) throw new InputError('output directory already exists; results are never overwritten');
    const manifestText = readFileSync(manifestPath, 'utf8');
    const dom = new JSDOM();
    for (const key of ['window', 'document', 'DOMParser', 'XMLSerializer']) globalThis[key] = dom.window[key];
    const manifest = JSON.parse(manifestText);
    const inputs = loadInputs(manifest);

    mkdirSync(resolve(output, PRIVATE_DIR, 'xml'), { recursive: true });
    mkdirSync(resolve(output, PRIVATE_DIR, 'measurements'));
    const records = [];
    const save = (path, data) => writeFileSync(resolve(output, path), data);
    const remember = async (key, args) => {
        const { safe, privateRecord, xml } = await diagnose(args);
        if (xml !== undefined) {
            safe.xmlFile = `${PRIVATE_DIR}/xml/${key}.drawio`;
            save(safe.xmlFile, xml);
        }
        if (privateRecord) save(`${PRIVATE_DIR}/measurements/${key}.json`, JSON.stringify({ ...privateRecord, preservationSafe: safe.preservation }, null, 2));
        records.push(safe);
    };

    for (const input of inputs) {
        for (const [index, page] of input.pages.entries()) {
            for (const [variant, run, options] of variantsFor(page.xml)) {
                await remember(`${input.id}-p${index + 1}-${variant}`, { scope: 'page-extracted', input, pageIndex: index, variant, run, options, beforePages: [page], originalText: page.xml });
            }
        }
    }
    for (const input of inputs) {
        for (const [variant, run, options] of variantsFor(input.text)) {
            await remember(`${input.id}-whole-${variant}`, { scope: 'whole-file', input, variant, run, options, beforePages: input.pages, originalText: input.text });
        }
    }

    const sourcePaths = [
        ...readdirSync(resolve(root, 'src/core')).filter(name => name.endsWith('.js')).map(name => `src/core/${name}`),
        'package-lock.json', 'scripts/layout-metrics.js', 'scripts/measure-kb-baseline.mjs',
    ];
    const run = (program, args) => execFileSync(program, args, { cwd: root, encoding: 'utf8' }).trim();
    const dirty = run('git', ['status', '--short']);
    const manifestRelative = relative(root, manifestPath);
    const report = {
        methodVersion: METHOD_VERSION,
        createdAt: new Date().toISOString(),
        codeSha: run('git', ['rev-parse', 'HEAD']),
        // 파일명이 고객 정보일 수 있어 git status 목록 대신 개수와 해시만 남긴다.
        dirty: { entries: dirty ? dirty.split('\n').length : 0, sha256: sha256(dirty) },
        environment: { node: process.version, npm: run('npm', ['--version']), platform: process.platform, arch: process.arch, jsdom: JSON.parse(readFileSync(resolve(root, 'node_modules/jsdom/package.json'), 'utf8')).version },
        command: 'node scripts/measure-kb-baseline.mjs <new-output-directory> [manifest]',
        manifest: { path: manifestRelative.startsWith('..') ? 'external' : manifestRelative, sha256: sha256(manifestText) },
        sourceSha256: Object.fromEntries(sourcePaths.map(path => [path, sha256(readFileSync(resolve(root, path)))])),
        inputs: inputs.map(input => ({ id: input.id, sha256: input.sha256, pages: input.pages.map((page, index) => ({ index: index + 1, id: page.id })) })),
        scopeNotes: {
            'page-extracted': 'each page mxGraphModel transformed separately; NOT whole-file behavior',
            'whole-file': 'real transformations on the original mxfile unchanged; an mxGraphModel output means zero preserved diagram pages',
            notMeasured: ['edge crossings', 'node penetrations', 'label overlaps', 'rendered routes', 'bridge/iframe behavior'],
            timing: 'single sample in ms, transform only; not a distribution',
        },
        records,
    };
    save('baseline.json', JSON.stringify(report, null, 2) + '\n');
    save('table.md', '# KB 기준선 원시 표\n\n'
        + '| 범위 | 입력 | 페이지 | 변환 | vertex/edge | 좌표 측정/전체 | 교집합: 부분/포함/동일 | 보존 | 보존된 페이지 | 명령 |\n|---|---|---|---|---:|---:|---:|---|---|---|\n'
        + records.map(tableRow).join('\n')
        + '\n\n"페이지 추출" 행은 한 페이지의 mxGraphModel만 변환한 진단이며 실제 파일 전체 동작이 아니다. "파일 전체" 행은 원본 mxfile을 그대로 변환한 결과다. 출력이 단일 모델이면 보존된 페이지는 0이며 출력 셀을 원본 페이지에 대응시키지 않는다.\n'
        + '교집합은 라벨을 제외한 사각형 지표이며 XML의 실제 부모/자식 쌍만 제외한다. 교차·관통·라벨 겹침·브라우저 동작은 측정하지 않았다. 원본 값·스타일이 담긴 XML/측정값은 private.local/ 아래에만 있다.\n');
    dom.window.close();
    const failed = records.filter(record => record.status !== 'measured').length;
    console.log(`Recorded ${records.length} diagnostics; unmeasurable product outputs/failures (observations): ${failed}. Preservation failures are observations.`);
    console.log(relative(root, output));
}

main().catch(error => {
    console.error(error instanceof InputError ? `Error: ${error.message}` : `Error: unexpected failure (${error.name})`);
    process.exit(1);
});
