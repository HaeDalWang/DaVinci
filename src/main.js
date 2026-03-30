// src/main.js — DaVinci 앱 진입점

import { DrawIOBridge } from './core/drawio-bridge.js';
import { analyzeArchitecture, getOptimizationTips } from './core/aws-analyzer.js';
import { initToolbar } from './components/toolbar.js';
import { initSidebar } from './components/sidebar.js';
import { showAnalysisModal, showOptimizationModal } from './components/analysis-modal.js';
import { showToast } from './components/toast.js';

// draw.io 통신 브릿지 인스턴스
const bridge = new DrawIOBridge();

/**
 * 앱 초기화
 */
function init() {
    const iframe = document.getElementById('drawio-frame');
    const loadingEl = document.getElementById('editor-loading');

    // draw.io iframe 로드
    bridge.init(iframe);

    // draw.io 준비 완료 시
    bridge.onReady(() => {
        // 로딩 화면 숨기기
        loadingEl.classList.add('is-hidden');

        // localStorage에서 저장된 다이어그램 복원
        const savedXml = localStorage.getItem('davinci_diagram');
        if (savedXml) {
            bridge.loadXml(savedXml);
            showToast('이전 다이어그램을 불러왔습니다.', 'info');
        } else {
            // 빈 다이어그램 로드
            bridge.loadXml(EMPTY_DIAGRAM);
        }
    });

    // 자동 저장 (30초 간격 debounce)
    let autoSaveTimer = null;
    let pendingXml = null;
    bridge.onAutoSave((xml) => {
        pendingXml = xml;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            localStorage.setItem('davinci_diagram', xml);
            pendingXml = null;
        }, 5000);
    });

    // 페이지 언로드 시 미저장 변경사항 즉시 저장
    window.addEventListener('beforeunload', () => {
        if (pendingXml) {
            localStorage.setItem('davinci_diagram', pendingXml);
        }
    });

    // 명시적 저장
    bridge.onSave((xml) => {
        localStorage.setItem('davinci_diagram', xml);
        showToast('다이어그램이 저장되었습니다.', 'success');
    });

    // 상단 툴바 초기화
    initToolbar(bridge, {
        onAnalyze: (xml) => {
            const analysis = analyzeArchitecture(xml);
            showAnalysisModal(analysis);
        },
        onOptimize: (xml) => {
            const tips = getOptimizationTips(xml);
            showOptimizationModal(tips);
        },
    });

    // 사이드바 초기화
    initSidebar(bridge);
}

/**
 * 빈 다이어그램 XML (AWS 기본 그리드 설정)
 */
const EMPTY_DIAGRAM = `
<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
  </root>
</mxGraphModel>
`.trim();

// DOM 준비 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
