import { test, expect, vi } from 'vitest';
import { initToolbar } from '../src/components/toolbar.js';

vi.mock('../src/components/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../src/components/align-modal.js', () => ({ showAlignModal: vi.fn() }));

test('opening validates before writing, keeps the previous drawing for undo, and resets the session even when browser storage fails', async () => {
    document.body.innerHTML = ['btn-align', 'btn-analyze', 'btn-optimize', 'btn-open', 'btn-download', 'chat-send']
        .map(id => `<button id="${id}"></button>`).join('')
        + '<input id="diagram-file-input" type="file"><textarea id="chat-input"></textarea><div id="chat-messages"></div>';
    const bridge = { onReady: fn => fn(), getCurrentXml: vi.fn().mockResolvedValue('<mxGraphModel/>'),
        loadXmlAndWait: vi.fn().mockResolvedValue() };
    const onOpen = vi.fn();
    initToolbar(bridge, { onOpen });
    const fileInput = document.getElementById('diagram-file-input');
    const open = async xml => {
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ text: async () => xml }] });
        fileInput.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(document.getElementById('btn-open').disabled).toBe(false));
    };
    try {
        await open('<invalid>');
        await open('<mxfile/>');
        await open('<mxGraphModel/>');
        expect(bridge.getCurrentXml).not.toHaveBeenCalled();
        expect(bridge.loadXmlAndWait).not.toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
        const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>';
        const storage = vi.fn(() => {
            throw new DOMException('Storage full', 'QuotaExceededError');
        });
        vi.stubGlobal('localStorage', { setItem: storage });
        await open(xml);
        expect(bridge.loadXmlAndWait).toHaveBeenCalledExactlyOnceWith(xml);
        expect(onOpen).toHaveBeenCalledExactlyOnceWith('<mxGraphModel/>');
        expect(storage).toHaveBeenCalledWith('davinci_diagram', xml);
        document.getElementById('chat-messages').innerHTML = '<div id="loading-active"></div>';
        await open(xml);
        expect(bridge.loadXmlAndWait).toHaveBeenCalledTimes(1);
    } finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    }
});
