import { afterEach, expect, test, vi } from 'vitest';
import { DrawIOBridge } from '../src/core/drawio-bridge.js';

const bridges = [];
const setup = () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const bridge = new DrawIOBridge();
    bridge.init(iframe);
    bridges.push(bridge);
    const post = vi.spyOn(iframe.contentWindow, 'postMessage');
    const receive = (msg, overrides = {}) => window.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify(msg), origin: 'https://embed.diagrams.net', source: iframe.contentWindow, ...overrides,
    }));
    const respond = (xml, currentPage = 0) => receive({ event: 'export', format: 'xml', xml, currentPage,
        message: JSON.parse(post.mock.calls.at(-1)[0]) });
    return { bridge, post, receive, respond };
};
afterEach(() => {
    for (const bridge of bridges.splice(0)) window.removeEventListener('message', bridge._handleMessage);
    document.body.replaceChildren();
    vi.useRealTimers();
});

test('both load paths give standalone models a stable page id before the first merge', async () => {
    const { bridge, post, receive } = setup();
    const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
    for (const wait of [false, true]) {
        const pending = wait ? bridge.loadXmlAndWait(xml) : bridge.loadXml(xml);
        const sent = JSON.parse(post.mock.calls.at(-1)[0]);
        const doc = new DOMParser().parseFromString(sent.xml, 'text/xml');
        expect(doc.documentElement.localName).toBe('mxfile');
        expect(doc.querySelector('diagram').getAttribute('id')).toBeTruthy();
        expect(doc.querySelector('mxGraphModel').outerHTML).toBe(new DOMParser().parseFromString(xml, 'text/xml').documentElement.outerHTML);
        if (wait) receive({ event: 'load', xml: sent.xml });
        await pending;
        expect(bridge._currentXml).toBe(sent.xml);
    }
    const file = '<mxfile><diagram id="existing"><mxGraphModel/></diagram></mxfile>';
    bridge.loadXml(file);
    expect(JSON.parse(post.mock.calls.at(-1)[0]).xml).toBe(file);
});

test('file loading waits for its own acknowledgement and rejects editor errors without replacing the cache', async () => {
    const { bridge, post, receive } = setup();
    bridge._currentXml = 'previous';
    const pending = bridge.loadXmlAndWait('opened');
    await expect(bridge.loadXmlAndWait('concurrent')).rejects.toThrow(/진행 중/);
    receive({ event: 'load', message: { requestId: 'old' } });
    receive({ event: 'load', xml: 'other-file' });
    expect(bridge._currentXml).toBe('previous');
    receive({ event: 'load', xml: 'opened' });
    await pending;
    expect(bridge._currentXml).toBe('opened');
    const invalid = bridge.loadXmlAndWait('bad');
    const rejected = expect(invalid).rejects.toThrow('Invalid file');
    receive({ event: 'load', message: JSON.parse(post.mock.calls.at(-1)[0]), error: 'Invalid file' });
    await rejected;
    expect(bridge._currentXml).toBe('opened');
});

test('reads fresh XML and active page atomically instead of the loaded cache', async () => {
    const { bridge, post, respond } = setup();
    bridge.loadXml('<mxGraphModel><mxCell id="stale"/></mxGraphModel>');
    const pending = bridge.getEditingState();
    expect(JSON.parse(post.mock.calls.at(-1)[0])).toMatchObject({ action: 'export', format: 'xml' });
    respond('<mxfile>fresh</mxfile>', 2);
    expect(await pending).toEqual({ xml: '<mxfile>fresh</mxfile>', pageIndex: 2 });
    const current = bridge.getCurrentXml();
    respond('<mxfile>newer</mxfile>');
    expect(await current).toBe('<mxfile>newer</mxfile>');
});

test('rejects foreign messages and concurrent exports; only the matching request resolves', async () => {
    const { bridge, post, receive, respond } = setup();
    const pending = bridge.getEditingState();
    await expect(bridge.exportDiagram('svg')).rejects.toThrow(/진행 중/);
    const message = JSON.parse(post.mock.calls.at(-1)[0]);
    for (const overrides of [{ origin: 'https://example.com' }, { source: window }]) {
        receive({ event: 'autosave', xml: 'spoof' }, overrides);
        receive({ event: 'export', format: 'xml', xml: 'spoof', message }, overrides);
    }
    expect(bridge._currentXml).toBe('');
    receive({ event: 'export', format: 'xml', xml: 'late', message: { requestId: 'old' } });
    respond('fresh', -1);
    expect(await pending).toEqual({ xml: 'fresh', pageIndex: null });
});

test('missing response fails without returning stale cache; late responses do not resolve a new export', async () => {
    vi.useFakeTimers();
    const { bridge, post, receive, respond } = setup();
    bridge._currentXml = '<mxGraphModel><mxCell/></mxGraphModel>';
    const pending = bridge.getCurrentXml();
    const oldMessage = JSON.parse(post.mock.calls.at(-1)[0]);
    const rejected = expect(pending).rejects.toThrow(/타임아웃/);
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    const next = bridge.getEditingState();
    receive({ event: 'export', format: 'xml', xml: 'late', message: oldMessage });
    respond('latest', 1);
    expect(await next).toEqual({ xml: 'latest', pageIndex: 1 });
});

test('serializes merges and ignores a timed-out merge response during rollback', async () => {
    vi.useFakeTimers();
    const { bridge, post, receive } = setup();
    const first = bridge.merge('changed');
    const expiredMessage = JSON.parse(post.mock.calls.at(-1)[0]);
    await expect(bridge.merge('concurrent')).rejects.toThrow(/진행 중/);
    const rejected = expect(first).rejects.toThrow(/타임아웃/);
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    const rollback = bridge.merge('original');
    const message = JSON.parse(post.mock.calls.at(-1)[0]);
    receive({ event: 'merge', message: expiredMessage });
    expect(bridge._pendingCallbacks.has('merge')).toBe(true);
    receive({ event: 'merge', message, error: null });
    expect(await rollback).toEqual({ error: null });
    expect(bridge._pendingCallbacks.has('merge')).toBe(false);
});
