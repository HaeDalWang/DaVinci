// add_service 보존 계약: 원본 XML에 새 셀만 삽입한다 (합성 데이터만 사용)
import { describe, expect, test, vi } from 'vitest';
import { DiagramController } from '../src/core/diagram-controller.js';
import { SnapshotManager } from '../src/core/snapshot-manager.js';

const ICON = 'shape=mxgraph.aws4.resourceIcon;verticalLabelPosition=bottom;html=1;';

function page(id, name, body) {
    return `<diagram id="${id}" name="${name}"><mxGraphModel><root>` +
        `<mxCell id="0"/><mxCell id="1" parent="0"/>${body}</root></mxGraphModel></diagram>`;
}

const PAGE_A_BODY =
    `<mxCell id="grp" value="G" style="container=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="300" height="200" as="geometry"/></mxCell>` +
    `<mxCell id="in1" value="in" style="${ICON}" vertex="1" parent="grp"><mxGeometry x="10" y="40" width="78" height="78" as="geometry"/></mxCell>` +
    `<UserObject id="wrap" label="w" tags="keep-me"><mxCell style="${ICON}" vertex="1" parent="1"><mxGeometry x="500" y="300" width="78" height="78" as="geometry"/></mxCell></UserObject>` +
    `<mxCell id="memo" value="memo" style="text;html=1;" vertex="1" parent="1"><mxGeometry x="20" y="500" width="120" height="40" as="geometry"/></mxCell>` +
    `<mxCell id="loose" style="endArrow=classic;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="5" as="sourcePoint"/><mxPoint x="50" y="50" as="targetPoint"/></mxGeometry></mxCell>`;

const MULTI = `<mxfile>${page('pA', 'A', PAGE_A_BODY)}${page('pB', 'B', `<mxCell id="in1" value="dup" style="${ICON}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>`)}</mxfile>`;

function parse(xml) {
    return new DOMParser().parseFromString(xml, 'text/xml');
}

function pageCells(xml, idx) {
    return Array.from(parse(xml).getElementsByTagName('diagram')[idx].getElementsByTagName('root')[0].children);
}

function makeLive(xml, pageIndex = null, mergeResult = { error: null }) {
    const state = { xml };
    const bridge = {
        getEditingState: vi.fn(async () => ({ xml: state.xml, pageIndex })),
        getCurrentXml: vi.fn(async () => state.xml),
        merge: vi.fn(async (next) => {
            if (!mergeResult.error) state.xml = next;
            return mergeResult;
        }),
        loadXml: vi.fn(),
    };
    return { bridge, state, ctl: new DiagramController(bridge, new SnapshotManager()) };
}

function makeHeadless(xml) {
    const state = { xml };
    const bridge = {
        getCurrentXml: vi.fn(async () => state.xml),
        loadXml: vi.fn(async (next) => { state.xml = next; }),
    };
    return { bridge, state, ctl: new DiagramController(bridge, new SnapshotManager()) };
}

const add = (ctl, params) => ctl.executeCommands([{ type: 'add_service', params }]);

describe('add_service 보존', () => {
  test('keeps every original cell, wrapper metadata and other pages byte-identical', async () => {
    const { ctl, state, bridge } = makeLive(MULTI, 0);

    const res = await add(ctl, { serviceType: 'lambda', label: 'New <b>x</b>' });

    expect(res.success).toBe(true);
    expect(bridge.loadXml).not.toHaveBeenCalled();
    expect(bridge.merge).toHaveBeenCalledTimes(1);
    const before = pageCells(MULTI, 0).map(e => e.outerHTML);
    const after = pageCells(state.xml, 0);
    expect(after.slice(0, before.length).map(e => e.outerHTML)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(pageCells(state.xml, 1).map(e => e.outerHTML)).toEqual(pageCells(MULTI, 1).map(e => e.outerHTML));
    expect(state.xml).toContain('tags="keep-me"');
  });

  test('new cell uses catalog style with plain literal label, real layer and unique id', async () => {
    const { ctl, state } = makeLive(MULTI, 0);

    await add(ctl, { serviceType: 'lambda', label: 'A & <b>B</b>' });

    const cell = pageCells(state.xml, 0).at(-1);
    expect(cell.getAttribute('value')).toBe('A & <b>B</b>');
    expect(cell.getAttribute('style')).toContain('html=0');
    expect(cell.getAttribute('style')).toContain('resIcon=mxgraph.aws4.lambda');
    expect(cell.getAttribute('parent')).toBe('1');
    expect(cell.getAttribute('id')).toMatch(/^ai_/);
    const ids = Array.from(parse(state.xml).querySelectorAll('[id]')).map(e => e.getAttribute('id'));
    expect(ids.filter(i => i === cell.getAttribute('id'))).toHaveLength(1);
  });

  test('defaults label from catalog when none is given', async () => {
    const { ctl, state } = makeLive(MULTI, 0);

    await add(ctl, { serviceType: 'lambda' });

    expect(pageCells(state.xml, 0).at(-1).getAttribute('value')).toBeTruthy();
  });

  test('places top-level service beyond existing bounds and repeated additions do not overlap', async () => {
    const { ctl, state } = makeLive(MULTI, 0);

    await add(ctl, { serviceType: 'lambda' });
    await add(ctl, { serviceType: 'sqs' });

    const [first, second] = pageCells(state.xml, 0).slice(-2).map(c => c.firstElementChild);
    const y1 = Number(first.getAttribute('y'));
    const y2 = Number(second.getAttribute('y'));
    expect(y1).toBeGreaterThanOrEqual(540);
    expect(y2).toBeGreaterThan(y1 + 78);
  });

  test('places service in requested group without touching group or siblings', async () => {
    const { ctl, state } = makeLive(MULTI, 0);

    const res = await add(ctl, { serviceType: 'ec2', group: 'grp' });

    expect(res.success).toBe(true);
    const cell = pageCells(state.xml, 0).at(-1);
    expect(cell.getAttribute('parent')).toBe('grp');
    const g = cell.firstElementChild;
    const x = Number(g.getAttribute('x'));
    const y = Number(g.getAttribute('y'));
    expect(x + 78).toBeLessThanOrEqual(300);
    expect(y + 78 + 30).toBeLessThanOrEqual(200);
    const overlapsSibling = x < 10 + 78 + 10 && 10 - 10 < x + 78 && y < 40 + 78 + 30 + 10 && 40 - 10 < y + 108;
    expect(overlapsSibling).toBe(false);
  });

  test('rejects group without free room and leaves diagram unchanged without reload', async () => {
    const tiny = MULTI.replace('width="300" height="200"', 'width="110" height="130"');
    const { ctl, state, bridge } = makeLive(tiny, 0);

    const res = await add(ctl, { serviceType: 'ec2', group: 'grp' });

    expect(res.success).toBe(false);
    expect(state.xml).toBe(tiny);
    expect(bridge.merge).not.toHaveBeenCalled();
    expect(bridge.loadXml).not.toHaveBeenCalled();
  });
});

describe('add_service 페이지 선택', () => {
  test('explicit pageId wins and allows ids repeated across pages', async () => {
    const { ctl, state } = makeHeadless(MULTI);

    const res = await add(ctl, { serviceType: 'lambda', pageId: 'pB' });

    expect(res.success).toBe(true);
    expect(pageCells(state.xml, 1)).toHaveLength(pageCells(MULTI, 1).length + 1);
    expect(pageCells(state.xml, 0)).toHaveLength(pageCells(MULTI, 0).length);
  });

  test('uses active page index from editing state when pageId is absent', async () => {
    const { ctl, state } = makeLive(MULTI, 1);

    await add(ctl, { serviceType: 'lambda' });

    expect(pageCells(state.xml, 1)).toHaveLength(pageCells(MULTI, 1).length + 1);
  });

  test('works on single page files and bare mxGraphModel', async () => {
    const bare = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`;
    const { ctl, state } = makeHeadless(bare);

    const res = await add(ctl, { serviceType: 'lambda' });

    expect(res.success).toBe(true);
    expect(state.xml).toContain('resIcon=mxgraph.aws4.lambda');
  });

  test('finds layer through a custom root id and non-1 layer id', async () => {
    const custom = `<mxGraphModel><root><mxCell id="r0"/><mxCell id="L9" parent="r0"/>` +
      `<mxCell id="v" value="x" style="${ICON}" vertex="1" parent="L9"><mxGeometry x="10" y="10" width="78" height="78" as="geometry"/></mxCell></root></mxGraphModel>`;
    const { ctl, state } = makeHeadless(custom);

    const res = await add(ctl, { serviceType: 'lambda' });

    expect(res.success).toBe(true);
    const cells = Array.from(parse(state.xml).getElementsByTagName('root')[0].children);
    expect(cells.slice(0, 3).map(e => e.outerHTML)).toEqual(Array.from(parse(custom).getElementsByTagName('root')[0].children).map(e => e.outerHTML));
    expect(cells.at(-1).getAttribute('parent')).toBe('L9');
  });

  test('outside placement clears vertices of every layer', async () => {
    const two = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" parent="0"/>` +
      `<mxCell id="a" style="${ICON}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="78" height="78" as="geometry"/></mxCell>` +
      `<mxCell id="b" style="${ICON}" vertex="1" parent="2"><mxGeometry x="0" y="400" width="78" height="78" as="geometry"/></mxCell></root></mxGraphModel>`;
    const { ctl, state } = makeHeadless(two);

    await add(ctl, { serviceType: 'lambda' });

    const cell = Array.from(parse(state.xml).getElementsByTagName('root')[0].children).at(-1);
    expect(cell.getAttribute('parent')).toBe('1');
    expect(Number(cell.firstElementChild.getAttribute('y'))).toBeGreaterThanOrEqual(478);
  });

  test('skips hidden and locked layers for insertion', async () => {
    const layers = `<mxGraphModel><root><mxCell id="0"/><mxCell id="h" parent="0" visible="0"/><mxCell id="l" parent="0" style="locked=1;"/><mxCell id="ok" parent="0"/></root></mxGraphModel>`;
    const { ctl, state } = makeHeadless(layers);

    await add(ctl, { serviceType: 'lambda' });

    expect(Array.from(parse(state.xml).getElementsByTagName('root')[0].children).at(-1).getAttribute('parent')).toBe('ok');
  });

  test('ambiguous multipage target fails and keeps the original', async () => {
    const { ctl, state, bridge } = makeHeadless(MULTI);

    const res = await add(ctl, { serviceType: 'lambda' });

    expect(res.success).toBe(false);
    expect(state.xml).toBe(MULTI);
    expect(bridge.loadXml).not.toHaveBeenCalled();
  });

  test('group id from another page is rejected', async () => {
    const { ctl, state } = makeHeadless(MULTI);

    const res = await add(ctl, { serviceType: 'lambda', pageId: 'pB', group: 'grp' });

    expect(res.success).toBe(false);
    expect(state.xml).toBe(MULTI);
  });
});

describe('add_service 거부', () => {
  const cases = {
    'unknown serviceType': [MULTI, { serviceType: 'nope', pageId: 'pA' }],
    'unknown pageId': [MULTI, { serviceType: 'lambda', pageId: 'zzz' }],
    'malformed xml': ['<mxfile><diagram', { serviceType: 'lambda' }],
    'compressed page': [`<mxfile><diagram id="c" name="c">eJxLy8kvSs</diagram></mxfile>`, { serviceType: 'lambda' }],
    'duplicate ids in page': [
      `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="d" vertex="1" parent="1"/><mxCell id="d" vertex="1" parent="1"/></root></mxGraphModel>`,
      { serviceType: 'lambda' },
    ],
    'prototype property as serviceType': [MULTI, { serviceType: 'toString', pageId: 'pA' }],
    'two models in one page': [
      `<mxfile><diagram id="d"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`,
      { serviceType: 'lambda' },
    ],
    'two roots in a model': [
      `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root><root><mxCell id="0"/></root></mxGraphModel>`,
      { serviceType: 'lambda' },
    ],
    'non-finite top-level geometry': [
      MULTI.replace('x="500" y="300" width="78"', 'x="500" y="300" width="Infinity"'),
      { serviceType: 'lambda', pageId: 'pA' },
    ],
    'negative width in group': [MULTI.replace('x="10" y="40" width="78"', 'x="10" y="40" width="-5"'), { serviceType: 'ec2', group: 'grp', pageId: 'pA' }],
    'non-numeric x': [MULTI.replace('x="20" y="500"', 'x="abc" y="500"'), { serviceType: 'lambda', pageId: 'pA' }],
    'group child without geometry': [
      MULTI.replace(/(<mxCell id="in1" value="in"[^>]*>)<mxGeometry[^>]*\/>/, '$1'),
      { serviceType: 'ec2', group: 'grp', pageId: 'pA' },
    ],
    'infinite group size': [MULTI.replace('width="300" height="200"', 'width="Infinity" height="Infinity"'), { serviceType: 'ec2', group: 'grp', pageId: 'pA' }],
    'non-string serviceType': [MULTI, { serviceType: { a: 1 }, pageId: 'pA' }],
    'empty group string': [MULTI, { serviceType: 'lambda', pageId: 'pA', group: '' }],
    'non-string group': [MULTI, { serviceType: 'lambda', pageId: 'pA', group: 7 }],
    'top-level vertex without geometry': [
      MULTI.replace(/(<mxCell id="memo"[^>]*>)<mxGeometry[^>]*\/>/, '$1'),
      { serviceType: 'lambda', pageId: 'pA' },
    ],
    'no visible unlocked layer': [
      `<mxGraphModel><root><mxCell id="0"/><mxCell id="h" parent="0" visible="0"/></root></mxGraphModel>`,
      { serviceType: 'lambda' },
    ],
    'relative geometry on requested group': [
      MULTI.replace('x="100" y="100" width="300" height="200" as', 'x="100" y="100" width="300" height="200" relative="1" as'),
      { serviceType: 'ec2', group: 'grp', pageId: 'pA' },
    ],
    'relative geometry on group child': [
      MULTI.replace('x="10" y="40" width="78" height="78" as', 'x="10" y="40" width="78" height="78" relative="1" as'),
      { serviceType: 'ec2', group: 'grp', pageId: 'pA' },
    ],
    'non-string label': [MULTI, { serviceType: 'lambda', pageId: 'pA', label: 42 }],
  };

  test.each(Object.keys(cases))('%s fails without touching the editor', async (name) => {
    const [xml, params] = cases[name];
    const { ctl, state, bridge } = makeHeadless(xml);

    const res = await add(ctl, params);

    expect(res.success).toBe(false);
    expect(state.xml).toBe(xml);
    expect(bridge.loadXml).not.toHaveBeenCalled();
  });
});

describe('롤백과 제거', () => {
  test('failed merge rolls back by merging the full snapshot and awaiting it', async () => {
    const { ctl, bridge } = makeLive(MULTI, 0, { error: 'boom' });

    const res = await add(ctl, { serviceType: 'lambda' });

    expect(res.success).toBe(false);
    expect(bridge.merge).toHaveBeenCalledTimes(2);
    expect(bridge.merge.mock.calls[1][0]).toBe(MULTI);
    expect(bridge.loadXml).not.toHaveBeenCalled();
  });

  test('headless rollback awaits loadXml with the snapshot', async () => {
    const { ctl, bridge } = makeHeadless(MULTI);
    bridge.loadXml.mockRejectedValueOnce(new Error('load failed'));

    const res = await add(ctl, { serviceType: 'lambda', pageId: 'pA' });

    expect(res.success).toBe(false);
    expect(bridge.loadXml).toHaveBeenCalledTimes(2);
    expect(bridge.loadXml.mock.calls[1][0]).toBe(MULTI);
  });

  test('added service can be removed by its generated id', async () => {
    // jsdom에는 CSS.escape가 없어 테스트에서만 보충한다 (생성 ID는 영숫자/_/-).
    vi.stubGlobal('CSS', { escape: (v) => String(v) });
    const bare = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`;
    const { ctl, state } = makeHeadless(bare);
    await add(ctl, { serviceType: 'lambda' });
    const id = parse(state.xml).querySelector('mxCell[vertex="1"]').getAttribute('id');

    const res = await ctl.executeCommands([{ type: 'remove_service', params: { serviceId: id } }]);

    expect(res.success).toBe(true);
    expect(state.xml).not.toContain(id);
    vi.unstubAllGlobals();
  });
});

describe('다중 페이지 전체 문서 명령 차단', () => {
  const unsafe = {
    remove_service: { serviceId: 'in1' },
    add_connection: { sourceLabel: 'in', targetLabel: 'dup' },
    remove_connection: { sourceLabel: 'in', targetLabel: 'dup' },
    replace_all: { architecture: { groups: [], services: [], connections: [] } },
  };

  const spyOn = (ctl) => vi.spyOn(ctl._snapshotManager, 'save');

  test.each(Object.keys(unsafe))('%s is rejected on multipage with repeated ids and no side effects', async (type) => {
    for (const make of [makeLive, makeHeadless]) {
      const { ctl, state, bridge } = make(MULTI);
      const save = spyOn(ctl);

      const res = await ctl.executeCommands([{ type, params: unsafe[type] }]);

      expect(res.success).toBe(false);
      expect(res.message).toContain('여러 페이지');
      expect(state.xml).toBe(MULTI);
      expect(save).not.toHaveBeenCalled();
      expect(bridge.loadXml).not.toHaveBeenCalled();
      if (bridge.merge) expect(bridge.merge).not.toHaveBeenCalled();
    }
  });

  test('mixed batch with add_service plus an unsafe command is rejected as a whole', async () => {
    const { ctl, state, bridge } = makeLive(MULTI, 0);
    const save = spyOn(ctl);

    const res = await ctl.executeCommands([
      { type: 'add_service', params: { serviceType: 'lambda' } },
      { type: 'remove_service', params: { serviceId: 'in1' } },
    ]);

    expect(res.success).toBe(false);
    expect(state.xml).toBe(MULTI);
    expect(save).not.toHaveBeenCalled();
    expect(bridge.merge).not.toHaveBeenCalled();
  });

  test('legacy commands still run on a single-page mxfile', async () => {
    const single = `<mxfile>${page('p1', 'A', '')}</mxfile>`;
    const { ctl, bridge } = makeHeadless(single);

    const res = await ctl.executeCommands([{ type: 'replace_all', params: { architecture: { groups: [], services: [], connections: [] } } }]);

    expect(res.success).toBe(true);
    expect(bridge.loadXml).toHaveBeenCalledTimes(1);
  });
});

describe('add_service 같은 서비스 아이콘 기준 배치', () => {
  const S3 = 'sketch=0;outlineConnect=0;fontColor=#ff0000;fontSize=9;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;verticalLabelPosition=bottom;html=1;';
  const rect = (id, parent, x, y, w, h, style = 'rounded=0;fillColor=#eeeeee;') =>
    `<mxCell id="${id}" value="" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
  const s3 = (id, parent, x, y, extra = '') =>
    `<mxCell id="${id}" value="S3" style="${S3}" vertex="1" parent="${parent}"${extra}><mxGeometry x="${x}" y="${y}" width="50" height="50" as="geometry"/></mxCell>`;
  const model = (layers, body) =>
    `<mxGraphModel><root><mxCell id="0"/>${layers}${body}</root></mxGraphModel>`;
  const L = (id, attrs = '') => `<mxCell id="${id}" parent="0"${attrs}/>`;
  const lastCell = (xml) => Array.from(parse(xml).getElementsByTagName('root')[0].children).at(-1);
  const geo = (cell) => {
    const g = cell.getElementsByTagName('mxGeometry')[0];
    return ['x', 'y', 'width', 'height'].map(n => Number(g.getAttribute(n)));
  };

  test('reuses peer style and size on the peer layer near it, enclosed by a background on another layer', async () => {
    const xml = model(L('base') + L('top'),
      rect('bg', 'base', -500, -300, 600, 400) + s3('peer', 'top', -300, -100));
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3', label: '<b>new</b>' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(cell.getAttribute('parent')).toBe('top');
    expect(cell.getAttribute('style')).toContain('fontColor=#ff0000');
    expect(cell.getAttribute('style')).toContain('html=0');
    expect(cell.getAttribute('style')).not.toContain('html=1');
    expect(cell.getAttribute('value')).toBe('<b>new</b>');
    const [x, y, w, h] = geo(cell);
    expect([w, h]).toEqual([50, 50]);
    expect(x).toBeGreaterThanOrEqual(-500);
    expect(x + w).toBeLessThanOrEqual(100);
    expect(y).toBeGreaterThanOrEqual(-300);
    expect(y + h + 30).toBeLessThanOrEqual(100);
    expect(Math.hypot(x + 300, y + 100)).toBeLessThan(150);
    expect(cell.getAttribute('id')).toMatch(/^ai_/);
  });

  test('keeps existing cells untouched and returns the same slot deterministically', async () => {
    const xml = model(L('base') + L('top'), rect('bg', 'base', 0, 0, 600, 400) + s3('peer', 'top', 100, 100));
    const first = makeHeadless(xml);
    const second = makeHeadless(xml);

    await add(first.ctl, { serviceType: 's3' });
    await add(second.ctl, { serviceType: 's3' });

    expect(geo(lastCell(first.state.xml))).toEqual(geo(lastCell(second.state.xml)));
    const before = Array.from(parse(xml).getElementsByTagName('root')[0].children).map(e => e.outerHTML);
    const after = Array.from(parse(first.state.xml).getElementsByTagName('root')[0].children).map(e => e.outerHTML);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test('does not ignore unrelated actual siblings inside the background', async () => {
    const siblings = [];
    // peer 오른쪽·아래 가까운 자리를 unrelated 아이콘으로 채운다.
    for (let dx = -60; dx <= 60; dx += 10) {
      for (let dy = -60; dy <= 60; dy += 10) {
        if (dx || dy) siblings.push(`<mxCell id="o${dx}_${dy}" value="o" style="${ICON}" vertex="1" parent="top"><mxGeometry x="${300 + dx}" y="${300 + dy}" width="20" height="20" as="geometry"/></mxCell>`);
      }
    }
    const xml = model(L('base') + L('top'), rect('bg', 'base', 0, 0, 800, 800) + s3('peer', 'top', 300, 300) + siblings.join(''));
    const { ctl, state } = makeHeadless(xml);

    await add(ctl, { serviceType: 's3' });

    const [x, y, w, h] = geo(lastCell(state.xml));
    const hitsSibling = x < 370 + 10 && 230 - 10 < x + w && y < 370 + 10 && 230 - 10 < y + h + 30;
    expect(hitsSibling).toBe(false);
  });

  test('locked layer content stays an obstacle for a top-layer peer', async () => {
    const xml = model(L('base', ' locked="1"') + L('top'),
      rect('bg', 'base', 0, 0, 400, 200) + rect('blocker', 'base', 160, 0, 240, 200, 'shape=mxgraph.aws4.resourceIcon;') + s3('peer', 'top', 100, 80));
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(cell.getAttribute('parent')).toBe('top');
    const [x, y, w, h] = geo(cell);
    expect(x >= 0 && x + w <= 400 && y >= 0 && y + h + 30 <= 200).toBe(true);
    expect(x + w).toBeLessThanOrEqual(150);
  });

  test('ignores hidden and locked peers and uses the catalog default', async () => {
    const hiddenLayer = model(L('h', ' visible="0"') + L('ok'), s3('p1', 'h', 0, 0));
    const lockedLayer = model(L('l', ' locked="1"') + L('ok'), s3('p2', 'l', 0, 0));
    for (const xml of [hiddenLayer, lockedLayer]) {
      const { ctl, state } = makeHeadless(xml);

      await add(ctl, { serviceType: 's3' });

      const cell = lastCell(state.xml);
      expect(cell.getAttribute('parent')).toBe('ok');
      expect(cell.getAttribute('style')).not.toContain('fontColor=#ff0000');
      expect(geo(cell).slice(2)).toEqual([78, 78]);
    }
  });

  test('peer inside a container is used only with the container as parent and bounds', async () => {
    const xml = model(L('base'),
      `<mxCell id="grp" value="G" style="container=1;" vertex="1" parent="base"><mxGeometry x="-200" y="-200" width="300" height="200" as="geometry"/></mxCell>` +
      s3('peer', 'grp', 10, 40));
    const { ctl, state } = makeHeadless(xml);

    await add(ctl, { serviceType: 's3' });

    const cell = lastCell(state.xml);
    expect(cell.getAttribute('parent')).toBe('grp');
    const [x, y, w, h] = geo(cell);
    expect([w, h]).toEqual([50, 50]);
    expect(x).toBeGreaterThanOrEqual(10);
    expect(x + w).toBeLessThanOrEqual(290);
    expect(y + h + 30).toBeLessThanOrEqual(190);
  });

  test('explicit group wins but still reuses the peer style and size', async () => {
    const xml = model(L('base') + L('top'),
      `<mxCell id="grp" value="G" style="container=1;" vertex="1" parent="base"><mxGeometry x="900" y="900" width="300" height="200" as="geometry"/></mxCell>` +
      s3('peer', 'top', 0, 0));
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3', group: 'grp' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(cell.getAttribute('parent')).toBe('grp');
    expect(cell.getAttribute('style')).toContain('fontColor=#ff0000');
    expect(geo(cell).slice(2)).toEqual([50, 50]);
  });

  test('falls back to the outside default when no safe nearby slot exists', async () => {
    // 반경 안의 모든 자리를 하나의 큰 비배경(아이콘) 도형이 덮는다.
    const xml = model(L('base'),
      s3('peer', 'base', 1000, 1000) +
      `<mxCell id="wall" value="w" style="${ICON}" vertex="1" parent="base"><mxGeometry x="400" y="400" width="1300" height="1300" as="geometry"/></mxCell>`);
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(geo(cell).slice(2)).toEqual([78, 78]);
    expect(cell.getAttribute('style')).not.toContain('fontColor=#ff0000');
    expect(geo(cell)[1]).toBeGreaterThanOrEqual(1700);
    expect(cell.getAttribute('parent')).toBe('base');
  });

  test('falls back when an obstacle has unknown geometry instead of guessing', async () => {
    const xml = model(L('base'),
      s3('peer', 'base', 0, 0) + `<mxCell id="nogeo" value="x" style="${ICON}" vertex="1" parent="base"/>`);
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3' });

    expect(res.success).toBe(false);
    expect(state.xml).toBe(xml);
  });

  test('does not pick an unrelated subnet when the peer is not in it', async () => {
    const xml = model(L('base'),
      `<mxCell id="vpc" value="V" style="container=1;" vertex="1" parent="base"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>` +
      s3('peer', 'base', 600, 0));
    const { ctl, state } = makeHeadless(xml);

    await add(ctl, { serviceType: 's3' });

    expect(lastCell(state.xml).getAttribute('parent')).toBe('base');
    const [x, y, w, h] = geo(lastCell(state.xml));
    expect(x < 410 && -10 < x + w && y < 310 && -10 < y + h + 30).toBe(false);
  });

  test('inherits style and size from the peer actually used when the first peer is blocked', async () => {
    const BLUE = S3.replace('#ff0000', '#0000ff');
    const big = `<mxCell id="peer2" value="S3" style="${BLUE}" vertex="1" parent="base"><mxGeometry x="2000" y="0" width="64" height="64" as="geometry"/></mxCell>`;
    // 첫 peer는 반경 안이 모두 막힌 벽 안에 있다.
    const xml = model(L('base'),
      s3('peer1', 'base', 1000, 1000) +
      `<mxCell id="wall" value="w" style="${ICON}" vertex="1" parent="base"><mxGeometry x="400" y="400" width="1300" height="1300" as="geometry"/></mxCell>` + big);
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(cell.getAttribute('style')).toContain('fontColor=#0000ff');
    expect(cell.getAttribute('style')).not.toContain('fontColor=#ff0000');
    const [x, y, w, h] = geo(cell);
    expect([w, h]).toEqual([64, 64]);
    expect(Math.hypot(x - 2000, y)).toBeLessThan(200);
  });

  test('explicit group prefers a peer inside that group over other same-type peers', async () => {
    const BLUE = S3.replace('#ff0000', '#0000ff');
    const xml = model(L('base'),
      `<mxCell id="grp" value="G" style="container=1;" vertex="1" parent="base"><mxGeometry x="900" y="900" width="300" height="200" as="geometry"/></mxCell>` +
      s3('outer', 'base', 0, 0) +
      `<mxCell id="inner" value="S3" style="${BLUE}" vertex="1" parent="grp"><mxGeometry x="10" y="40" width="40" height="40" as="geometry"/></mxCell>`);
    const { ctl, state } = makeHeadless(xml);

    await add(ctl, { serviceType: 's3', group: 'grp' });

    const cell = lastCell(state.xml);
    expect(cell.getAttribute('style')).toContain('fontColor=#0000ff');
    expect(geo(cell).slice(2)).toEqual([40, 40]);
  });

  test('rejects a hidden or locked explicit group and its locked ancestor', async () => {
    const grp = (attrs, parent = 'base') =>
      `<mxCell id="grp" value="G" style="container=1;${attrs}" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="300" height="200" as="geometry"/></mxCell>`;
    const cases = [
      model(L('base') + L('ok'), grp('locked=1;')),
      model(L('base', ' visible="0"') + L('ok'), grp('')),
      model(L('base') + L('ok'), `<mxCell id="outer" style="container=1;locked=1;" vertex="1" parent="base"><mxGeometry x="0" y="0" width="500" height="500" as="geometry"/></mxCell>` + grp('', 'outer')),
    ];
    for (const xml of cases) {
      const { ctl, state, bridge } = makeHeadless(xml);

      const res = await add(ctl, { serviceType: 's3', group: 'grp' });

      expect(res.success).toBe(false);
      expect(state.xml).toBe(xml);
      expect(bridge.loadXml).not.toHaveBeenCalled();
    }
  });

  test('treats a genuine AWS group container on another layer as the enclosing background', async () => {
    const AWS_GROUP = 'points=[[0,0]];outlineConnect=0;gradientColor=none;html=1;shape=mxgraph.aws4.group;container=0;grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;';
    const groupCell = `<mxCell id="awsg" value="AWS Cloud" style="${AWS_GROUP}" vertex="1" parent="base"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>`;
    const xml = model(L('base') + L('top'), groupCell + s3('peer', 'top', 100, 100));
    const { ctl, state } = makeHeadless(xml);

    const res = await add(ctl, { serviceType: 's3' });

    expect(res.success).toBe(true);
    const cell = lastCell(state.xml);
    expect(cell.getAttribute('parent')).toBe('top');
    const [x, y, w, h] = geo(cell);
    expect([w, h]).toEqual([50, 50]);
    expect(x >= 0 && x + w <= 400 && y >= 0 && y + h + 30 <= 300).toBe(true);
    expect(Math.hypot(x - 100, y - 100)).toBeLessThan(150);
    const before = Array.from(parse(xml).getElementsByTagName('root')[0].children).map(e => e.outerHTML);
    const after = Array.from(parse(state.xml).getElementsByTagName('root')[0].children).map(e => e.outerHTML);
    expect(after.slice(0, before.length)).toEqual(before);
  });
});
