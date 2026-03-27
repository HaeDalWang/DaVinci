// src/components/align-modal.js — 아키텍처 정렬 옵션 모달

import { reorganizeForAlignment } from '../core/aws-architecture-builder.js';
import { summarizeXml } from '../core/xml-summarizer.js';
import { buildXml } from '../core/json-to-xml-builder.js';

/**
 * 정렬 프리셋 2종:
 *   1. 계층 정렬     — AWS Cloud > VPC > Subnet 컨테이너 계층 구조 (위→아래)
 *   2. 좌→우 흐름 정렬 — draw.io mxHierarchicalLayout (좌→우, 연결선 기반)
 *
 * 화살표(Flow)는 정렬 후 사용자가 직접 그려야 합니다.
 */
const LAYOUT_PRESETS = [
  {
    id: 'aws-standard',
    name: '계층 정렬',
    description: 'AWS Cloud > VPC > AZ > Subnet 계층 구조 자동 배치 (3-Tier 표준)',
    icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="32" height="32" rx="4" stroke="#FF9900" stroke-width="1.5" fill="none"/>
      <rect x="9" y="10" width="22" height="6" rx="2" fill="#FF9900" opacity="0.8"/>
      <rect x="9" y="20" width="10" height="6" rx="2" fill="#FF9900" opacity="0.55"/>
      <rect x="21" y="20" width="10" height="6" rx="2" fill="#FF9900" opacity="0.55"/>
      <rect x="9" y="30" width="10" height="4" rx="1" fill="#FF9900" opacity="0.3"/>
      <rect x="21" y="30" width="10" height="4" rx="1" fill="#FF9900" opacity="0.3"/>
    </svg>`,
    // draw.io 내장 알고리즘 미사용 — runAwsStandardLayout() 직접 호출
    layouts: null,
  },
  {
    id: 'left-right',
    name: '좌→우 흐름 정렬',
    description: '연결선 기준 좌→우 방향 계층 배치 (트래픽 흐름 시각화)',
    icon: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="16" width="8" height="8" rx="2" fill="#FF9900"/>
      <rect x="14" y="11" width="8" height="18" rx="2" fill="#FF9900" opacity="0.7"/>
      <rect x="26" y="8"  width="8" height="24" rx="2" fill="#FF9900" opacity="0.45"/>
      <path d="M10 20h4M22 20h4" stroke="#FF9900" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    layouts: null,  // runLeftRightLayout() 직접 호출
  },
];

/**
 * 정렬 옵션 모달을 표시한다.
 * @param {import('../core/drawio-bridge.js').DrawIOBridge} bridge
 */
export function showAlignModal(bridge) {
  closeAlignModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'align-modal';

  const presetsHtml = LAYOUT_PRESETS.map(
    (preset) => `
    <button class="align-preset" data-preset="${preset.id}">
      <div class="align-preset__icon">${preset.icon}</div>
      <div class="align-preset__info">
        <div class="align-preset__name">${preset.name}</div>
        <div class="align-preset__desc">${preset.description}</div>
      </div>
    </button>
  `
  ).join('');

  backdrop.innerHTML = `
    <div class="modal modal--align">
      <div class="modal__header">
        <h2 class="modal__title">아키텍처 정렬</h2>
        <button class="modal__close" id="align-modal-close" aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal__body">
        <p class="align-modal__subtitle">
          원하는 정렬 방식을 선택하세요.
          <span class="align-modal__note">서비스 간 화살표(Flow)는 정렬 후 직접 그려주세요.</span>
        </p>
        <div class="align-preset-grid">${presetsHtml}</div>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(backdrop);

  backdrop.querySelector('#align-modal-close').addEventListener('click', closeAlignModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeAlignModal();
  });

  backdrop.querySelectorAll('.align-preset').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const presetId = btn.dataset.preset;
      closeAlignModal();

      if (presetId === 'aws-standard') {
        await runAwsStandardLayout(bridge);
        return;
      }
      if (presetId === 'left-right') {
        await runLeftRightLayout(bridge);
        return;
      }
    });
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeAlignModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeAlignModal() {
  const existing = document.getElementById('align-modal');
  if (existing) existing.remove();
}

/**
 * 계층 정렬 실행:
 * currentXml → summarizeXml → reorganizeForAlignment('hierarchy') → buildXml → bridge.loadXml
 */
async function runAwsStandardLayout(bridge) {
  const loadingEl = document.createElement('div');
  loadingEl.id = 'align-loading';
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;color:#FF9900;font-size:14px;font-family:Inter,sans-serif;flex-direction:column;gap:14px;';
  loadingEl.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF9900" stroke-width="2" style="animation:spin 0.9s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span>AWS 계층 구조로 정렬 중...</span>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
  document.body.appendChild(loadingEl);

  try {
    const currentXml = await bridge.getCurrentXml();
    if (!currentXml || currentXml.trim() === '') {
      throw new Error('다이어그램 데이터가 비어 있습니다.');
    }

    const json = summarizeXml(currentXml);
    const reorganized = reorganizeForAlignment(json, 'hierarchy');

    if (reorganized.services.length === 0) {
      throw new Error('분류 가능한 AWS 서비스가 없습니다. AWS4 아이콘을 배치하고 다시 시도해주세요.');
    }

    const newXml = buildXml(reorganized);
    bridge.loadXml(newXml);

    loadingEl.remove();
    const { showToast } = await import('./toast.js');
    showToast(`계층 정렬 완료 (${reorganized.services.length}개 서비스)`, 'success');
  } catch (err) {
    loadingEl.remove();
    console.error('[DaVinci] 계층 정렬 오류:', err);
    const { showToast } = await import('./toast.js');
    showToast('정렬 실패: ' + err.message, 'error');
  }
}

/**
 * 좌→우 흐름 정렬 실행:
 * currentXml → summarizeXml → reorganizeForAlignment('left-right') → buildXml({ direction: 'horizontal' }) → bridge.loadXml
 */
async function runLeftRightLayout(bridge) {
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;color:#FF9900;font-size:14px;font-family:Inter,sans-serif;flex-direction:column;gap:14px;';
  loadingEl.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF9900" stroke-width="2" style="animation:spin 0.9s linear infinite;">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    <span>좌→우 흐름 정렬 중...</span>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
  document.body.appendChild(loadingEl);

  try {
    const currentXml = await bridge.getCurrentXml();
    if (!currentXml || currentXml.trim() === '') throw new Error('다이어그램 데이터가 비어 있습니다.');

    const json = summarizeXml(currentXml);
    const reorganized = reorganizeForAlignment(json, 'left-right');

    if (reorganized.services.length === 0) {
      throw new Error('분류 가능한 AWS 서비스가 없습니다. AWS4 아이콘을 배치하고 다시 시도해주세요.');
    }

    const newXml = buildXml(reorganized, { direction: 'horizontal' });
    bridge.loadXml(newXml);

    loadingEl.remove();
    const { showToast } = await import('./toast.js');
    showToast(`좌→우 흐름 정렬 완료 (${reorganized.services.length}개 서비스)`, 'success');
  } catch (err) {
    loadingEl.remove();
    console.error('[DaVinci] 좌→우 정렬 오류:', err);
    const { showToast } = await import('./toast.js');
    showToast('정렬 실패: ' + err.message, 'error');
  }
}

