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
    const btnOpen = document.getElementById('btn-open');
    const btnSave = document.getElementById('btn-save');
    const btnExport = document.getElementById('btn-export');
    const exportMenu = document.getElementById('export-menu');

    // .drawio 파일 열기
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.drawio,.xml';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    btnOpen.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const xml = ev.target.result;
            bridge.loadXml(xml);
            showToast(`"${file.name}" 파일을 불러왔습니다.`, 'success');
        };
        reader.readAsText(file);
        fileInput.value = '';
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

    // 저장 (localStorage)
    btnSave.addEventListener('click', async () => {
        const xml = await bridge.getCurrentXml();
        if (xml) {
            localStorage.setItem('davinci_diagram', xml);
            showToast('다이어그램이 저장되었습니다.', 'success');
        }
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

    // 내보내기 드롭다운 토글
    btnExport.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('is-open');
    });

    // 내보내기 포맷 선택
    exportMenu.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-format]');
        if (!target) return;

        const format = target.dataset.format;
        exportMenu.classList.remove('is-open');

        showToast('내보내기 중...', 'info');

        if (format === 'xml') {
            const xml = await bridge.getCurrentXml();
            downloadFile(xml, 'architecture.xml', 'application/xml');
            showToast('XML 파일이 다운로드되었습니다.', 'success');
        } else {
            const result = await bridge.exportDiagram(format);
            if (result.data) {
                downloadDataUri(result.data, `architecture.${format}`);
                showToast(`${format.toUpperCase()} 파일이 다운로드되었습니다.`, 'success');
            }
        }
    });

    // 바깥 클릭 시 드롭다운 닫기
    document.addEventListener('click', () => {
        exportMenu.classList.remove('is-open');
    });
}

/**
 * 텍스트 콘텐츠를 파일로 다운로드
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * data URI를 파일로 다운로드
 */
function downloadDataUri(dataUri, filename) {
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = filename;
    a.click();
}
