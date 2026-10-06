import { describe, test, expect } from 'vitest';
import { measureXml, comparePreservation } from '../scripts/layout-metrics.js';

const wrap = (cells) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

const vertex = (id, geo, { parent = '1', style = '', value = id } = {}) =>
    `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}">` +
    `<mxGeometry ${geo} as="geometry"/></mxCell>`;

const box = (x, y, w, h) => `x="${x}" y="${y}" width="${w}" height="${h}"`;

describe('measureXml — 인벤토리와 좌표', () => {
    test('nested child rect is the sum of parent and child offsets', () => {
        // Arrange
        const xml = wrap(
            vertex('g', box(100, 50, 400, 300), { style: 'container=1' }) +
                vertex('child', box(20, 30, 40, 40), { parent: 'g' }),
        );

        // Act
        const m = measureXml(xml);

        // Assert
        const child = m.cells.find((c) => c.id === 'child');
        expect(child.rect).toEqual({ x: 120, y: 80, width: 40, height: 40 });
        expect(m.counts).toEqual({ cells: 4, vertices: 2, edges: 0, groups: 1 });
    });

    test('inventories root cells and counts a vertex parent as a group without container style', () => {
        const m = measureXml(wrap(vertex('p', box(0, 0, 100, 100)) + vertex('c', box(1, 1, 5, 5), { parent: 'p' })));

        expect(m.cells.map((c) => c.id)).toEqual(['0', '1', 'p', 'c']);
        expect(m.counts.groups).toBe(1);
        expect(m.geometryCoverage).toMatchObject({ measured: 2, total: 2, unmeasuredIds: [] });
    });

    test('omitted x and y default to zero when geometry exists', () => {
        const m = measureXml(wrap(vertex('a', 'width="10" height="20"')));

        expect(m.cells.find((c) => c.id === 'a').rect).toEqual({ x: 0, y: 0, width: 10, height: 20 });
        expect(m.boundingBox).toEqual({ x: 0, y: 0, width: 10, height: 20, area: 200 });
    });

    test('bounding box spans only measured vertices and is null when none are measurable', () => {
        const some = measureXml(wrap(vertex('a', box(0, 0, 10, 10)) + vertex('b', box(90, 40, 10, 10))));
        const none = measureXml(wrap(vertex('a', 'relative="1"')));

        expect(some.boundingBox).toEqual({ x: 0, y: 0, width: 100, height: 50, area: 5000 });
        expect(none.boundingBox).toBeNull();
    });

    test('accepts an mxfile with exactly one uncompressed model', () => {
        const xml = `<mxfile><diagram id="d">${wrap(vertex('a', box(0, 0, 10, 10)))}</diagram></mxfile>`;

        expect(measureXml(xml).counts.vertices).toBe(1);
    });

    test('reads id and label from object wrappers', () => {
        const xml = wrap(
            '<object id="wrapped" label="Web"><mxCell vertex="1" parent="1"><mxGeometry x="5" y="5" width="10" height="10" as="geometry"/></mxCell></object>',
        );

        const cell = measureXml(xml).cells.find((c) => c.id === 'wrapped');

        expect(cell).toMatchObject({ vertex: true, value: 'Web' });
        expect(cell.rect).toEqual({ x: 5, y: 5, width: 10, height: 10 });
    });
});

describe('measureXml — 겹침', () => {
    test('counts sibling overlap but not parent/child containment', () => {
        const xml = wrap(
            vertex('g', box(0, 0, 200, 200)) +
                vertex('inside', box(10, 10, 50, 50), { parent: 'g' }) +
                vertex('a', box(300, 0, 50, 50)) +
                vertex('b', box(330, 20, 50, 50)),
        );

        const m = measureXml(xml);

        expect(m.overlapPairs).toEqual([['a', 'b']]);
        expect(m.overlapCount).toBe(1);
    });

    test('excludes deep ancestor pairs but counts cousins inside different groups', () => {
        const xml = wrap(
            vertex('root', box(0, 0, 500, 500)) +
                vertex('mid', box(10, 10, 300, 300), { parent: 'root' }) +
                vertex('leaf', box(10, 10, 20, 20), { parent: 'mid' }) +
                vertex('other', box(15, 15, 20, 20), { parent: 'root' }),
        );

        const m = measureXml(xml);

        // leaf 절대좌표 (20,20)-(40,40), other (15,15)-(35,35) → 겹침. root/mid 등 조상 쌍은 제외.
        // mid와 other도 형제이므로 겹친다.
        expect(m.overlapPairs).toEqual([
            ['mid', 'other'],
            ['leaf', 'other'],
        ]);
    });

    test('touching boundaries are not overlap', () => {
        const xml = wrap(vertex('a', box(0, 0, 10, 10)) + vertex('b', box(10, 0, 10, 10)) + vertex('c', box(0, 10, 10, 10)));

        expect(measureXml(xml).overlapCount).toBe(0);
    });

    test('ignores unmeasured vertices instead of guessing their rect', () => {
        const xml = wrap(vertex('a', box(0, 0, 100, 100)) + vertex('rel', 'relative="1" x="0.5"'));

        const m = measureXml(xml);

        expect(m.overlapCount).toBe(0);
        expect(m.geometryCoverage.reasons).toEqual({ rel: 'relative-geometry' });
    });
});

describe('measureXml — 부분 커버리지', () => {
    test('relative, missing geometry, zero size, rotated and unresolved parent are unmeasured', () => {
        const xml = wrap(
            vertex('rel', 'relative="1"') +
                '<mxCell id="nogeo" vertex="1" parent="1"/>' +
                vertex('zero', box(0, 0, 0, 10)) +
                vertex('rot', box(0, 0, 10, 10), { style: 'rotation=45;' }) +
                vertex('orphan', box(0, 0, 10, 10), { parent: 'missing' }) +
                vertex('ok', box(0, 0, 10, 10)),
        );

        const m = measureXml(xml);

        expect(m.geometryCoverage.reasons).toEqual({
            rel: 'relative-geometry',
            nogeo: 'missing-geometry',
            zero: 'non-positive-size',
            rot: 'unsupported-rotation',
            orphan: 'unresolved-parent',
        });
        expect(m.geometryCoverage).toMatchObject({ measured: 1, total: 6 });
    });

    test('descendants of an unsupported parent are unmeasured, not placed relative to zero', () => {
        const xml = wrap(
            vertex('parent', box(500, 500, 100, 100), { style: 'rotation=90;' }) +
                vertex('child', box(5, 5, 10, 10), { parent: 'parent' }) +
                vertex('grandchild', box(1, 1, 2, 2), { parent: 'child' }),
        );

        const m = measureXml(xml);

        expect(m.cells.find((c) => c.id === 'child').rect).toBeNull();
        expect(m.geometryCoverage.reasons).toMatchObject({
            parent: 'unsupported-rotation',
            child: 'parent-unmeasured',
            grandchild: 'parent-unmeasured',
        });
    });

    test('non-relative geometry with an offset point is unmeasured and so are its descendants', () => {
        const xml = wrap(
            '<mxCell id="off" vertex="1" parent="1"><mxGeometry x="10" y="10" width="100" height="100" as="geometry">' +
                '<mxPoint x="5" y="5" as="offset"/></mxGeometry></mxCell>' +
                vertex('kid', box(1, 1, 10, 10), { parent: 'off' }),
        );

        const m = measureXml(xml);

        expect(m.geometryCoverage.reasons).toEqual({ off: 'unsupported-offset', kid: 'parent-unmeasured' });
        expect(m.boundingBox).toBeNull();
    });

    test('parent cycles terminate and are reported as unmeasured', () => {
        const xml = wrap(vertex('a', box(0, 0, 10, 10), { parent: 'b' }) + vertex('b', box(0, 0, 10, 10), { parent: 'a' }));

        const m = measureXml(xml);

        expect(m.geometryCoverage.unmeasuredIds.sort()).toEqual(['a', 'b']);
        expect(m.geometryCoverage.reasons.a).toBe('parent-cycle');
    });
});

describe('measureXml — 선 표현 커버리지', () => {
    test('counts only XML representations without inferring routes', () => {
        const edge = (id, attrs, inner = '') =>
            `<mxCell id="${id}" edge="1" parent="1" ${attrs}><mxGeometry relative="1" as="geometry">${inner}</mxGeometry></mxCell>`;
        const xml = wrap(
            vertex('a', box(0, 0, 10, 10)) +
                vertex('b', box(50, 0, 10, 10)) +
                edge('both', 'source="a" target="b"', '<Array as="points"><mxPoint x="1" y="1"/></Array>') +
                edge('src', 'source="a"', '<mxPoint x="9" y="9" as="targetPoint"/>') +
                edge('tgt', 'target="b"', '<mxPoint x="0" y="0" as="sourcePoint"/>') +
                edge('none', '') +
                edge('dangling', 'source="a" target="ghost"'),
        );

        const { edgeCoverage, counts } = measureXml(xml);

        expect(counts.edges).toBe(5);
        expect(edgeCoverage).toEqual({
            total: 5,
            bothReferences: 2,
            sourceOnly: 1,
            targetOnly: 1,
            noReferences: 1,
            withSourcePoint: 1,
            withTargetPoint: 1,
            withWaypoints: 1,
            danglingReferences: 1,
        });
    });
});

describe('measureXml — 입력 거부', () => {
    test.each([
        ['malformed XML', '<mxGraphModel><root></mxGraphModel>'],
        ['empty string', ''],
        ['missing model', '<mxfile><diagram>compressedtext</diagram></mxfile>'],
        ['multiple models', `<mxfile><diagram>${wrap('')}</diagram><diagram>${wrap('')}</diagram></mxfile>`],
        ['unknown root', '<svg/>'],
        ['duplicate ids', wrap(vertex('a', box(0, 0, 1, 1)) + vertex('a', box(5, 5, 1, 1)))],
        ['cell without id', wrap('<mxCell vertex="1" parent="1"/>')],
    ])('throws for %s', (_name, xml) => {
        expect(() => measureXml(xml)).toThrow();
    });
});

describe('comparePreservation', () => {
    const original = () =>
        measureXml(
            wrap(
                vertex('a', box(0, 0, 10, 10), { style: 'shape=x;' }) +
                    vertex('b', box(50, 0, 10, 10)) +
                    '<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
            ),
        );

    test('identical content passes, and geometry formatting differences are not changes', () => {
        const reformatted = measureXml(
            wrap(
                '<mxCell id="a" value="a" style="shape=x;" vertex="1" parent="1"><mxGeometry as="geometry" height="10.0" width="10" x="0" y="0"/></mxCell>' +
                    vertex('b', box(50, 0, 10, 10)) +
                    '<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry as="geometry" relative="1"/></mxCell>',
            ),
        );

        const result = comparePreservation(original(), reformatted);

        expect(result).toMatchObject({ preservationPassed: true, missingIds: [], changedGeometryIds: [] });
    });

    test('reports loss even when the cell count stays the same (ID replaced)', () => {
        const replaced = measureXml(
            wrap(
                vertex('a', box(0, 0, 10, 10), { style: 'shape=x;' }) +
                    vertex('b2', box(50, 0, 10, 10)) +
                    '<mxCell id="e" edge="1" parent="1" source="a" target="b2"><mxGeometry relative="1" as="geometry"/></mxCell>',
            ),
        );

        const result = comparePreservation(original(), replaced);

        expect(replaced.counts.cells).toBe(original().counts.cells);
        expect(result.missingIds).toEqual(['b']);
        expect(result.addedIds).toEqual(['b2']);
        expect(result.changedEndpointIds).toEqual(['e']);
        expect(result.preservationPassed).toBe(false);
    });

    test('detects an ID reused for unrelated content through other fields', () => {
        const reused = measureXml(
            wrap(
                vertex('a', box(0, 0, 10, 10), { style: 'shape=other;', value: 'Different' }) +
                    vertex('b', box(50, 0, 10, 10)) +
                    '<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
            ),
        );

        const result = comparePreservation(original(), reused);

        expect(result.changedStyleIds).toEqual(['a']);
        expect(result.changedValueIds).toEqual(['a']);
        expect(result.preservationPassed).toBe(false);
    });

    test('detects changed kind and reparenting', () => {
        const changed = measureXml(
            wrap(
                vertex('a', box(0, 0, 10, 10), { style: 'shape=x;' }) +
                    vertex('g', box(0, 0, 100, 100)) +
                    '<mxCell id="b" value="b" vertex="1" parent="g"><mxGeometry x="50" width="10" height="10" as="geometry"/></mxCell>' +
                    '<mxCell id="e" vertex="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
            ),
        );

        const result = comparePreservation(original(), changed);

        expect(result.changedParentIds).toEqual(['b']);
        expect(result.changedKindIds).toEqual(['e']);
        expect(result.addedIds).toEqual(['g']);
        expect(result.preservationPassed).toBe(false);
    });

    test('moved coordinates fail by default and pass when alignment geometry changes are allowed', () => {
        const aligned = measureXml(
            wrap(
                vertex('a', box(200, 200, 10, 10), { style: 'shape=x;' }) +
                    vertex('b', box(50, 0, 10, 10)) +
                    '<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
            ),
        );

        const strict = comparePreservation(original(), aligned);
        const lenient = comparePreservation(original(), aligned, { allowGeometryChanges: true });

        expect(strict.preservationPassed).toBe(false);
        expect(lenient.changedGeometryIds).toEqual(['a']);
        expect(lenient).toMatchObject({ preservationPassed: true, geometryChangesIgnored: true });
    });

    test('allowGeometryChanges never excuses missing cells or other changes', () => {
        const broken = measureXml(wrap(vertex('a', box(200, 200, 10, 10), { style: 'shape=y;' })));

        const result = comparePreservation(original(), broken, { allowGeometryChanges: true });

        expect(result.preservationPassed).toBe(false);
        expect(result.missingIds).toEqual(['b', 'e']);
        expect(result.changedStyleIds).toEqual(['a']);
    });

    test('expected removals are excluded from missing only, and added cells are not violations', () => {
        const after = measureXml(
            wrap(
                vertex('a', box(0, 0, 10, 10), { style: 'shape=x;' }) +
                    vertex('new', box(90, 0, 10, 10)),
            ),
        );

        const result = comparePreservation(original(), after, { expectedRemovedIds: ['b', 'e'] });
        const unrequested = comparePreservation(original(), after, { expectedRemovedIds: ['b'] });

        expect(result).toMatchObject({ missingIds: [], addedIds: ['new'], preservationPassed: true });
        expect(unrequested.missingIds).toEqual(['e']);
        expect(unrequested.preservationPassed).toBe(false);
    });

    test('reports an expected removal that is still present without failing', () => {
        const result = comparePreservation(original(), original(), { expectedRemovedIds: ['b'] });

        expect(result.expectedRemovedStillPresentIds).toEqual(['b']);
        expect(result.preservationPassed).toBe(true);
    });

    test('ignores root and layer cells when comparing', () => {
        const noLayer = measureXml('<mxGraphModel><root><mxCell id="0"/>' + vertex('a', box(0, 0, 1, 1), { parent: '0' }) + '</root></mxGraphModel>');
        const withLayer = measureXml(wrap(vertex('a', box(0, 0, 1, 1), { parent: '1' })));

        const result = comparePreservation(noLayer, withLayer);

        expect(result.missingIds).toEqual([]);
        expect(result.changedParentIds).toEqual(['a']);
    });
});
