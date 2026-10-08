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
export function initToolbar(bridge, { onAnalyze, onOptimize, onOpen }) {
    const btnAlign = document.getElementById('btn-align');
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnOptimize = document.getElementById('btn-optimize');
    const btnOpen = document.getElementById('btn-open');
    const btnDownload = document.getElementById('btn-download');
    const fileInput = document.getElementById('diagram-file-input');

    bridge.onReady(() => {
        btnOpen.disabled = false;
        btnDownload.disabled = false;
    });
    btnOpen.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (document.querySelector('#chat-messages [id^="loading-"]')) {
            showToast('AI 응답이 끝난 뒤 그림을 열어주세요.', 'info');
            fileInput.value = '';
            return;
        }
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        btnOpen.disabled = btnDownload.disabled = chatInput.disabled = chatSend.disabled = true;
        try {
            const xml = await file.text();
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            if (doc.querySelector('parsererror') || !['mxfile', 'mxGraphModel'].includes(doc.documentElement.tagName)) {
                throw new Error('올바른 .drawio 또는 XML 그림 파일을 선택해주세요.');
            }
            const top = doc.documentElement;
            if ((top.tagName === 'mxfile' && ![...top.children].some(el => el.tagName === 'diagram'))
                || (top.tagName === 'mxGraphModel' && ![...top.children].some(el => el.tagName === 'root'))) {
                throw new Error('파일에 그림 데이터가 없습니다.');
            }
            const previousXml = await bridge.getCurrentXml();
            await bridge.loadXmlAndWait(xml);
            onOpen?.(previousXml);
            try {
                localStorage.setItem('davinci_diagram', xml);
            } catch {
                showToast('브라우저에 저장하지 못했습니다. 다운로드로 파일을 보관해주세요.', 'error');
            }
            showToast('그림을 열었습니다. 변경 결과는 다운로드로 저장하세요.', 'success');
        } catch (error) {
            showToast(`그림 열기 실패: ${error.message}`, 'error');
        } finally {
            btnOpen.disabled = btnDownload.disabled = chatInput.disabled = false;
            chatSend.disabled = !chatInput.value.trim();
            fileInput.value = '';
        }
    });
    btnDownload.addEventListener('click', async () => {
        try {
            const xml = await bridge.getCurrentXml();
            const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'architecture.drawio';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            showToast(`다운로드 실패: ${error.message}`, 'error');
        }
    });


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
