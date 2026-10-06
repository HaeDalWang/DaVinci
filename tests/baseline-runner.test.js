import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('records fixed inputs from another cwd, distinguishes missing metrics, and refuses overwrite', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'davinci-baseline-test-'));
    const output = join(scratch, 'result');
    const runner = resolve('scripts/measure-baseline.mjs');
    const run = () => spawnSync(process.execPath, [runner, output], { cwd: scratch, encoding: 'utf8' });
    try {
        const first = run();
        expect(first.status, first.stderr).toBe(0);
        const report = JSON.parse(readFileSync(join(output, 'baseline.json'), 'utf8'));
        expect(report.manifest.inputs).toHaveLength(4);
        expect(report.records).toHaveLength(19);
        for (const record of report.records) {
            expect(record.status).toBe('measured');
            const xml = readFileSync(join(output, record.xmlFile), 'utf8');
            expect(createHash('sha256').update(xml).digest('hex')).toBe(record.outputSha256);
            expect(new DOMParser().parseFromString(xml, 'text/xml').querySelector('parsererror')).toBeNull();
            expect(record.explicitMetrics.crossings.value).toBeNull();
            const breakdown = record.overlapBreakdown;
            expect(breakdown.partialCount + breakdown.containmentCount + breakdown.identicalCount).toBe(record.measurement.overlapCount);
            if (record.input !== 'multi-az') {
                expect(record.explicitMetrics.backwardPrimaryEdges.value).toBeNull();
                expect(record.explicitMetrics.azPairOffsetDifference.value).toBeNull();
            }
        }
        const explicit = report.records.find(record => record.input === 'multi-az' && record.variant === 'original');
        expect(explicit.explicitMetrics.backwardPrimaryEdges).toMatchObject({ value: 0, measured: 4, total: 4 });
        expect(explicit.explicitMetrics.azPairOffsetDifference).toMatchObject({ value: 0, measured: 3, total: 3 });
        const stacked = report.records.find(record => record.input === 'test2' && record.variant === 'original');
        expect(stacked.overlapBreakdown).toEqual({ partialCount: 0, containmentCount: 77, identicalCount: 76 });
        const saved = readFileSync(join(output, 'baseline.json'), 'utf8');
        const second = run();
        expect(second.status).not.toBe(0);
        expect(second.stderr).toContain('historical results cannot be overwritten');
        expect(readFileSync(join(output, 'baseline.json'), 'utf8')).toBe(saved);
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}, 10000);
