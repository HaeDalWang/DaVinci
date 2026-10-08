import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// 합성 다중 페이지 fixture만 사용한다(고객 입력 아님). 페이지 간 ID 반복과 민감 표지를 일부러 넣는다.
const SECRET = 'SECRET_MARKER_7f3a';
const ec2 = `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;secretStyle=${SECRET};`;
const rds = 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;';
const vpcStyle = 'container=1;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;';
const vertex = (id, value, style, x, y, parent = '1') =>
    `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="78" height="78" as="geometry"/></mxCell>`;
const page = (id, name, body) =>
    `<diagram id="${id}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${body}</root></mxGraphModel></diagram>`;
const PAGES = [
    { id: 'page-one', name: `One ${SECRET}` },
    { id: 'page-two', name: 'Two' },
];
const fixture = (second = vertex('svc-a', 'Second page reuse', ec2, 300, 300)) => `<mxfile>${
    page(PAGES[0].id, PAGES[0].name,
        `<mxCell id="vpc" value="VPC ${SECRET}" style="${vpcStyle}" vertex="1" parent="1"><mxGeometry x="10" y="10" width="400" height="300" as="geometry"/></mxCell>` +
        vertex('svc-a', `Web ${SECRET}`, ec2, 40, 60, 'vpc') + vertex('svc-b', 'DB', rds, 240, 60) +
        '<mxCell id="memo" value="note" style="text;" vertex="1" parent="1"><mxGeometry x="500" y="20" width="100" height="30" as="geometry"/></mxCell>' +
        '<mxCell id="e1" edge="1" parent="1" source="svc-a" target="svc-b"><mxGeometry relative="1" as="geometry"/></mxCell>' +
        '<mxCell id="loose" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="0" y="400" as="sourcePoint"/><mxPoint x="90" y="400" as="targetPoint"/></mxGeometry></mxCell>')
}${
    page(PAGES[1].id, PAGES[1].name, second + '<mxCell id="e1" edge="1" parent="1" source="svc-a" target="svc-a"><mxGeometry relative="1" as="geometry"/></mxCell>')
}</mxfile>`;

const sha = (text) => createHash('sha256').update(text).digest('hex');
const script = resolve('scripts/measure-kb-baseline.mjs');
let scratch;

const manifestFor = (xml, overrides = {}) => ({
    inputs: [{ id: 'synthetic', path: join(scratch, 'input.drawio'), sha256: sha(xml), pages: PAGES, ...overrides }],
});
const writeInput = (name, xml, manifestOverrides) => {
    writeFileSync(join(scratch, 'input.drawio'), xml);
    const path = join(scratch, name);
    writeFileSync(path, JSON.stringify(manifestFor(xml, manifestOverrides)));
    return path;
};
const run = (output, manifest, { flag = false } = {}) =>
    spawnSync(process.execPath, [script, output, ...(flag ? ['--manifest', manifest] : [manifest])], { cwd: scratch, encoding: 'utf8' });
const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
});

beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), 'davinci-kb-test-')); });
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

describe('measure-kb-baseline (synthetic multipage fixture)', () => {
    let output;
    let report;

    beforeAll(() => {
        output = join(scratch, 'ok');
        const manifest = writeInput('manifest.json', fixture());
        const result = run(output, manifest);
        expect(result.status, result.stderr).toBe(0);
        report = JSON.parse(readFileSync(join(output, 'baseline.json'), 'utf8'));
    });

    test('records 2 pages x 4 extracted diagnostics and 4 whole-file diagnostics, clearly labelled', () => {
        const scopes = report.records.map((record) => record.scope);
        expect(scopes.filter((scope) => scope === 'page-extracted')).toHaveLength(8);
        expect(scopes.filter((scope) => scope === 'whole-file')).toHaveLength(4);
        expect(report.scopeNotes['page-extracted']).toMatch(/NOT whole-file/);
        expect(readFileSync(join(output, 'table.md'), 'utf8')).toContain('실제 파일 전체 동작이 아니다');
    });

    test('accepts the same cell IDs on different pages and measures each page separately', () => {
        const [first, second] = ['synthetic-p1-original', 'synthetic-p2-original'].map((key) =>
            JSON.parse(readFileSync(join(output, 'private.local/measurements', `${key}.json`), 'utf8')));
        const idsOf = (record) => record.outputs[0].measurement.cells.map((cell) => cell.id);
        expect(idsOf(first)).toContain('svc-a');
        expect(idsOf(second)).toContain('svc-a');
        expect(first.outputs[0].measurement.cells.find((c) => c.id === 'svc-a').rect).not.toEqual(
            second.outputs[0].measurement.cells.find((c) => c.id === 'svc-a').rect);
    });

    test('whole-file original preserves every page but a collapsed output reports page loss', () => {
        const whole = (variant) => report.records.find((r) => r.scope === 'whole-file' && r.variant === variant);

        expect(whole('original').pageStructure).toMatchObject({ outputKind: 'mxfile', preservedPages: 2, pageLossCount: 0, identityOrderPreserved: true });
        expect(whole('original').preservation).toEqual({ passed: true, identityOrderPreserved: true });
        for (const variant of ['hierarchy', 'horizontal']) {
            const record = whole(variant);
            expect(record.pageStructure, variant).toMatchObject({ originalPages: 2, outputKind: 'model', outputPages: 0, preservedPages: 0, pageLossCount: 2, identityOrderPreserved: false, collapsedToSingleModel: true });
            expect(record.pagePreservation).toEqual([]);
            expect(record.preservation.passed).toBe(false);
            // 측정 가능하든(status=measured) 중복 ID 때문에 무효든(output-invalid) 결과 개수는 남는다.
            expect(['measured', 'output-invalid']).toContain(record.status);
            expect(record.pageStructure.outputTotals.vertices).toBeGreaterThan(0);
        }
        // 대상 페이지가 없는 다중 페이지 추가는 원본을 보존하고 명령 실패로 기록한다.
        expect(whole('add-service').pageStructure).toMatchObject({ outputKind: 'mxfile', preservedPages: 2, identityOrderPreserved: true });
        expect(whole('add-service').command).toMatchObject({ observedSuccess: false, actualAdded: 0, rollbackExact: true, passed: false });
        expect(whole('add-service').preservation.passed).toBe(true);
    });

    test('command correctness and rollback are reported apart from preservation', () => {
        const command = report.records.find((r) => r.scope === 'page-extracted' && r.variant === 'add-service' && r.pageIndex === 1);

        expect(command.command).toMatchObject({ observedSuccess: true, expectedAdded: 1, actualAdded: 1, markerAdded: true, rollbackExact: null, passed: true });
        expect(command.command).not.toHaveProperty('correct');
        expect(command.preservation.passed).toBe(true);
        expect(command.preservation.missingIds).toEqual([]);
        expect(command.preservation.changedGeometryIds).toEqual([]);
    });

    test('keeps sensitive labels, styles and page names only under private.local', () => {
        const files = walk(output);
        const outside = files.filter((file) => !file.includes('/private.local/'));
        const inside = files.filter((file) => file.includes('/private.local/'));

        expect(outside.map((file) => file.slice(output.length + 1)).sort()).toEqual(['baseline.json', 'table.md']);
        for (const file of outside) expect(readFileSync(file, 'utf8'), file).not.toContain(SECRET);
        expect(inside.some((file) => readFileSync(file, 'utf8').includes(SECRET))).toBe(true);
        for (const record of report.records.filter((r) => r.xmlFile)) {
            expect(record.xmlFile.startsWith('private.local/')).toBe(true);
            expect(sha(readFileSync(join(output, record.xmlFile), 'utf8'))).toBe(record.outputSha256);
        }
    });

    test('refuses to overwrite an existing output directory', () => {
        const before = readFileSync(join(output, 'baseline.json'), 'utf8');
        const result = run(output, join(scratch, 'manifest.json'), { flag: true });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/already exists/);
        expect(readFileSync(join(output, 'baseline.json'), 'utf8')).toBe(before);
    });
});

describe('measure-kb-baseline input guards', () => {
    const expectRejected = (name, xml, overrides, pattern) => {
        const output = join(scratch, `reject-${name}`);
        const manifest = writeInput(`${name}.json`, xml, overrides);
        const result = run(output, manifest);
        expect(result.status, name).not.toBe(0);
        expect(result.stderr, name).toMatch(pattern);
        expect(result.stderr).not.toContain(SECRET);
        expect(existsSync(output), `${name} must not leave an output directory`).toBe(false);
    };

    test('rejects unsafe or duplicate input IDs, empty page lists and duplicate page IDs', () => {
        expectRejected('badid', fixture(), { id: '../escape' }, /input id must match/);
        expectRejected('nopages', fixture(), { pages: [] }, /nonempty array/);
        expectRejected('duppages', fixture(), { pages: [PAGES[0], { ...PAGES[1], id: PAGES[0].id }] }, /unique nonempty/);
        expectRejected('emptypageid', fixture(), { pages: [{ ...PAGES[0], id: '' }, PAGES[1]] }, /unique nonempty/);
        const xml = fixture();
        writeInput('dupinputs.json', xml);
        const one = manifestFor(xml).inputs[0];
        writeFileSync(join(scratch, 'dupinputs.json'), JSON.stringify({ inputs: [one, one] }));
        const result = run(join(scratch, 'reject-dupinputs'), join(scratch, 'dupinputs.json'));
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/duplicate input id/);
    });

    test('rejects a hash mismatch, page order/name mismatch, malformed XML and duplicate IDs in one page', () => {
        expectRejected('hash', fixture(), { sha256: '0'.repeat(64) }, /hash mismatch/);
        expectRejected('order', fixture(), { pages: [PAGES[1], PAGES[0]] }, /page id\/name\/order mismatch/);
        expectRejected('name', fixture(), { pages: [PAGES[0], { ...PAGES[1], name: 'Renamed' }] }, /page id\/name\/order mismatch/);
        expectRejected('count', fixture(), { pages: [PAGES[0]] }, /page count mismatch/);
        expectRejected('malformed', '<mxfile><diagram id="page-one"', {}, /malformed XML/);
        const dupe = fixture(vertex('dup', 'A', ec2, 0, 0) + vertex('dup', 'B', ec2, 10, 10));
        expectRejected('dupe', dupe, {}, /not measurable/);
    });
});
