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
    .geMenubar { display: none !important; }
    .geToolbar { display: none !important; }
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
        this._currentXml = xml;
        this._postMessage({
            action: 'load',
            xml: xml,
            autosave: 1,
        });
    }

    /**
     * 현재 다이어그램 XML을 반환한다.
     * 캐시된 _currentXml이 있으면 즉시 반환, 없으면 export 요청.
     * @returns {Promise<string>} mxGraphModel XML 문자열
     */
    getCurrentXml() {
        // save/autosave/loadXml 시 축적된 XML 우선 반환
        if (this._currentXml && this._currentXml.includes('<mxCell')) {
            return Promise.resolve(this._currentXml);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                console.warn('[Bridge] getCurrentXml 타임아웃 (5s)');
                resolve(this._currentXml || '');
            }, 5000);
            this._exportCallback = (data) => {
                clearTimeout(timer);
                // draw.io는 format:xml 시 data.xml 또는 data.data에 XML을 담아 보냄
                const xml = data.xml || data.data || '';
                console.log('[Bridge] getCurrentXml 응답:', xml.substring(0, 120));
                resolve(xml);
            };
            this._postMessage({ action: 'export', format: 'xml' });
        });
    }

    /**
     * 다이어그램을 PNG/SVG로 내보내기한다.
     * @param {'png'|'svg'|'xml'} format
     * @returns {Promise<{data: string, xml: string}>}
     */
    exportDiagram(format) {
        return new Promise((resolve) => {
            this._exportCallback = (data) => {
                resolve({ data: data.data, xml: data.xml });
            };
            const params = { action: 'export', format };
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
        return new Promise((resolve) => {
            this._pendingCallbacks.set('merge', (msg) => {
                resolve({ error: msg.error || null });
            });
            this._postMessage({ action: 'merge', xml });
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
                    this._exportCallback = null;
                }
                break;

            case 'merge':
                if (this._pendingCallbacks.has('merge')) {
                    this._pendingCallbacks.get('merge')(msg);
                    this._pendingCallbacks.delete('merge');
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
            this._iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
        }
    }
}
