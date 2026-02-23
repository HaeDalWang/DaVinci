// src/components/toolbar.js — 상단 툴바 이벤트 핸들링

import { showToast } from './toast.js';
import { showAlignModal } from './align-modal.js';

/**
 * 툴바 컴포넌트 초기화
 * @param {import('../core/drawio-bridge.js').DrawIOBridge} bridge
 * @param {object} options
 * @param {Function} options.onAnalyze - 분석 버튼 클릭 콜백
 * @param {Function} options.onOptimize - 최적화 팁 버튼 클릭 콜백
 */
export function initToolbar(bridge, { onAnalyze, onOptimize }) {
    const btnAlign = document.getElementById('btn-align');
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnOptimize = document.getElementById('btn-optimize');


    // 아키텍처 정렬 — 레이아웃 프리셋 모달 표시
    btnAlign.addEventListener('click', () => {
        showAlignModal(bridge);
    });

    // 아키텍처 분석
    btnAnalyze.addEventListener('click', async () => {
        const xml = await bridge.getCurrentXml();
        if (!xml || xml.trim().length < 50) {
            showToast('분석할 다이어그램이 없습니다. 먼저 AWS 서비스를 배치해주세요.', 'info');
            return;
        }
        onAnalyze(xml);
    });

    // 최적화 팁
    btnOptimize.addEventListener('click', async () => {
        const xml = await bridge.getCurrentXml();
        if (!xml || xml.trim().length < 50) {
            showToast('분석할 다이어그램이 없습니다. 먼저 AWS 서비스를 배치해주세요.', 'info');
            return;
        }
        onOptimize(xml);
    });



    // Ctrl+S 단축키
    window.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const xml = await bridge.getCurrentXml();
            if (xml) {
                localStorage.setItem('davinci_diagram', xml);
                showToast('다이어그램이 저장되었습니다.', 'success');
            }
        }
    });

}
