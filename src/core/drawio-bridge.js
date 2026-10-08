// src/core/drawio-bridge.js — draw.io iframe 통신 레이어

const DRAWIO_BASE_URL = 'https://embed.diagrams.net';
const DRAWIO_PARAMS = new URLSearchParams({
    embed: '1',
    proto: 'json',
    configure: '1',
    spin: '1',
    libraries: '1',
    noExitBtn: '1',
    saveAndExit: '0',
    dark: '1',
    ui: 'dark',
    lang: 'ko',
});

/**
 * draw.io 에디터 설정 — AWS 전용
 * enabledLibraries: aws4 관련 라이브러리만 허용
 * defaultLibraries: 좌측 패널에 기본 표시할 라이브러리
 */
const DRAWIO_CONFIG = {
    defaultLibraries: 'aws4',
    enabledLibraries: ['aws4'],
    css: `
    .geFooter { display: none !important; }
  `,
    defaultEdgeStyle: {
        edgeStyle: 'orthogonalEdgeStyle',
        rounded: '1',
        jettySize: 'auto',
        orthogonalLoop: '1',
        strokeColor: '#6B7785',
        strokeWidth: '1.5',
    },
};

// 페이지 ID 없는 모델을 열면 draw.io의 첫 merge가 성공 응답만 주고 반영되지 않는다.
function withPageId(xml) {
    const model = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
    return model?.localName === 'mxGraphModel'
        ? `<mxfile><diagram id="${crypto.randomUUID()}" name="페이지-1">${model.outerHTML}</diagram></mxfile>`
        : xml;
}

/**
 * draw.io iframe과의 JSON 프로토콜 통신 브릿지
 */
export class DrawIOBridge {
    constructor() {
        /** @type {HTMLIFrameElement|null} */
        this._iframe = null;
        /** @type {boolean} */
        this._ready = false;
        /** @type {string} */
        this._currentXml = '';
        /** @type {Map<string, Function>} */
        this._pendingCallbacks = new Map();
        /** @type {Function[]} */
        this._onReadyCallbacks = [];
        /** @type {Function[]} */
        this._onSaveCallbacks = [];
        /** @type {Function[]} */
        this._onAutoSaveCallbacks = [];
        /** @type {Function|null} */
        this._exportCallback = null;

        this._handleMessage = this._handleMessage.bind(this);
        window.addEventListener('message', this._handleMessage);
    }

    /**
     * iframe 요소를 초기화하고 draw.io를 로드한다.
     * @param {HTMLIFrameElement} iframe
     */
    init(iframe) {
        this._iframe = iframe;
        this._iframe.src = `${DRAWIO_BASE_URL}/?${DRAWIO_PARAMS.toString()}`;
    }

    /**
     * draw.io 준비 완료 시 콜백 등록
     * @param {Function} callback
     */
    onReady(callback) {
        if (this._ready) {
            callback();
        } else {
            this._onReadyCallbacks.push(callback);
        }
    }

    /**
     * 저장 이벤트 리스너 등록
     * @param {Function} callback - (xml: string) => void
     */
    onSave(callback) {
        this._onSaveCallbacks.push(callback);
    }

    /**
     * 자동 저장 이벤트 리스너 등록
     * @param {Function} callback - (xml: string) => void
     */
    onAutoSave(callback) {
        this._onAutoSaveCallbacks.push(callback);
    }

    /**
     * 다이어그램 XML을 로드한다.
     * @param {string} xml - mxGraphModel XML 문자열
     */
    loadXml(xml) {
        xml = withPageId(xml);
        this._currentXml = xml;
        this._postMessage({
            action: 'load',
            xml: xml,
            autosave: 1,
        });
    }

    /** 파일 열기는 편집기의 load 성공 응답을 확인한 뒤 완료한다. */
    loadXmlAndWait(xml) {
        if (this._pendingCallbacks.has('load')) return Promise.reject(new Error('[Bridge] load 요청이 진행 중입니다.'));
        xml = withPageId(xml);
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomUUID();
            const timer = setTimeout(() => {
                this._pendingCallbacks.delete('load');
                reject(new Error('[Bridge] load 타임아웃 (15s)'));
            }, 15000);
            this._pendingCallbacks.set('load', (msg) => {
                // XML load 응답은 requestId를 돌려주지 않고 입력 XML을 그대로 돌려준다.
                if (msg.message?.requestId !== requestId && (msg.message || msg.xml !== xml)) return;
                clearTimeout(timer);
                this._pendingCallbacks.delete('load');
                if (msg.error) reject(new Error(msg.error));
                else {
                    this._currentXml = xml;
                    resolve();
                }
            });
            this._postMessage({ action: 'load', xml, autosave: 1, requestId });
        });
    }

    /**
     * 현재 다이어그램 XML을 반환한다.
     * 편집기에서 최신 상태를 export한다.
     * @returns {Promise<string>} mxGraphModel XML 문자열
     */
    async getCurrentXml() {
        return (await this.getEditingState()).xml;
    }

    /** 최신 XML과 그 XML의 활성 페이지를 같은 응답에서 읽는다. */
    async getEditingState() {
        const { xml, currentPage } = await this.exportDiagram('xml');
        if (typeof xml !== 'string' || !xml.trim()) throw new Error('[Bridge] XML export 응답이 비어 있습니다.');
        this._currentXml = xml;
        return { xml, pageIndex: Number.isInteger(currentPage) && currentPage >= 0 ? currentPage : null };
    }

    /**
     * 다이어그램을 PNG/SVG로 내보내기한다.
     * @param {'png'|'svg'|'xml'} format
     * @returns {Promise<{data: string, xml: string, currentPage: number}>}
     */
    exportDiagram(format) {
        // ponytail: export 하나만 허용한다. 동시 사용이 필요해지면 요청 큐를 둔다.
        if (this._exportCallback) return Promise.reject(new Error('[Bridge] export 요청이 진행 중입니다.'));
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomUUID();
            const timer = setTimeout(() => {
                this._exportCallback = null;
                reject(new Error(`[Bridge] exportDiagram(${format}) 타임아웃 (15s)`));
            }, 15000);
            this._exportCallback = (data) => {
                if (data.message?.requestId !== requestId || data.format !== format) return;
                clearTimeout(timer);
                this._exportCallback = null;
                resolve({ data: data.data, xml: data.xml, currentPage: data.currentPage });
            };
            const params = { action: 'export', format, requestId };
            if (format === 'png') {
                params.scale = 2;
                params.border = 10;
                params.background = '#0F1923';
                params.spin = 'Exporting...';
            }
            this._postMessage(params);
        });
    }

    /**
     * XML을 현재 다이어그램에 병합한다. (AI Agent 연동용)
     * @param {string} xml
     * @returns {Promise<{error: string|null}>}
     */
    merge(xml) {
        if (this._pendingCallbacks.has('merge')) return Promise.reject(new Error('[Bridge] merge 요청이 진행 중입니다.'));
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomUUID();
            const timer = setTimeout(() => {
                this._pendingCallbacks.delete('merge');
                reject(new Error('[Bridge] merge 타임아웃 (10s)'));
            }, 10000);
            this._pendingCallbacks.set('merge', (msg) => {
                if (msg.message?.requestId !== requestId) return;
                clearTimeout(timer);
                this._pendingCallbacks.delete('merge');
                resolve({ error: msg.error || null });
            });
            this._postMessage({ action: 'merge', xml, requestId });
        });
    }

    /**
     * 자동 정렬(레이아웃)을 실행한다.
     * @param {Array} layouts - 레이아웃 배열
     */
    executeLayout(layouts) {
        const defaultLayouts = layouts || [
            { layout: 'mxHierarchicalLayout', config: { interRankCellSpacing: 80, interHierarchySpacing: 60 } },
        ];
        this._postMessage({ action: 'layout', layouts: defaultLayouts });
    }

    /**
     * 상태바 메시지 표시
     * @param {string} message
     */
    setStatus(message) {
        this._postMessage({ action: 'status', message });
    }

    /**
     * draw.io 로부터의 postMessage 처리
     * @private
     */
    _handleMessage(event) {
        if (event.origin !== DRAWIO_BASE_URL || event.source !== this._iframe?.contentWindow) return;
        if (!event.data || typeof event.data !== 'string') return;

        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }

        switch (msg.event) {
            case 'configure':
                this._postMessage({ action: 'configure', config: DRAWIO_CONFIG });
                break;

            case 'init':
                this._ready = true;
                this._onReadyCallbacks.forEach((cb) => cb());
                this._onReadyCallbacks = [];
                break;

            case 'load':
                this._pendingCallbacks.get('load')?.(msg);
                break;

            case 'save':
                this._currentXml = msg.xml || '';
                this._onSaveCallbacks.forEach((cb) => cb(this._currentXml));
                break;

            case 'autosave':
                this._currentXml = msg.xml || '';
                this._onAutoSaveCallbacks.forEach((cb) => cb(this._currentXml));
                break;

            case 'export':
                if (this._exportCallback) {
                    this._exportCallback(msg);
                }
                break;

            case 'merge':
                if (this._pendingCallbacks.has('merge')) {
                    this._pendingCallbacks.get('merge')(msg);
                }
                break;

            default:
                break;
        }
    }

    /**
     * iframe에 postMessage 전송
     * @private
     */
    _postMessage(msg) {
        if (this._iframe && this._iframe.contentWindow) {
            this._iframe.contentWindow.postMessage(JSON.stringify(msg), DRAWIO_BASE_URL);
        }
    }
}
