// src/components/well-architected-modal.js — Well-Architected 평가 결과 모달

import { escapeHtml } from '../core/utils.js';

/**
 * @typedef {Object} Recommendation
 * @property {string} text - 개선 권장사항 설명
 * @property {import('../core/diagram-controller.js').DiagramCommand[]} commands - 자동 적용 커맨드
 */

/**
 * @typedef {Object} PillarScore
 * @property {string} pillar - Pillar 이름
 * @property {number} score - 1~5점
 * @property {string} rationale - 근거 설명
 * @property {Recommendation[]} recommendations - 개선 권장사항
 */

/** Pillar별 아이콘 색상 매핑 */
const PILLAR_COLORS = {
    '운영 우수성': '#4285F4',
    '보안': '#EA4335',
    '안정성': '#34A853',
    '성능 효율성': '#FBBC04',
    '비용 최적화': '#FF6D01',
};

/**
 * Well-Architected 평가 결과 모달을 표시한다.
 * @param {PillarScore[]} scores - Pillar별 평가 결과 배열
 * @param {(commands: import('../core/diagram-controller.js').DiagramCommand[]) => void} onApplyRecommendation - 권장사항 적용 콜백
 */
export function showWellArchitectedModal(scores, onApplyRecommendation) {
    closeWAModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'wa-modal';

    backdrop.innerHTML = `
    <div class="modal modal--wa">
      <div class="modal__header">
        <h2 class="modal__title">Well-Architected 평가</h2>
        <button class="modal__close" id="wa-modal-close" aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal__body">
        ${buildOverviewSection(scores)}
        ${buildPillarDetails(scores, onApplyRecommendation)}
      </div>
    </div>
  `;

    document.getElementById('modal-root').appendChild(backdrop);

    // 닫기 이벤트
    backdrop.querySelector('#wa-modal-close').addEventListener('click', closeWAModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeWAModal();
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeWAModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // "적용" 버튼 이벤트 바인딩
    backdrop.querySelectorAll('[data-wa-rec-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const pillarIdx = parseInt(btn.dataset.waPillarIndex, 10);
            const recIdx = parseInt(btn.dataset.waRecIndex, 10);
            const rec = scores[pillarIdx]?.recommendations?.[recIdx];
            if (rec && rec.commands && rec.commands.length > 0 && onApplyRecommendation) {
                onApplyRecommendation(rec.commands);
                btn.disabled = true;
                btn.textContent = '적용됨';
                btn.classList.add('wa-rec__apply-btn--applied');
            }
        });
    });
}

function closeWAModal() {
    const existing = document.getElementById('wa-modal');
    if (existing) existing.remove();
}

function buildOverviewSection(scores) {
    const avgScore = scores.length > 0
        ? (scores.reduce((sum, p) => sum + p.score, 0) / scores.length).toFixed(1)
        : '0';

    let barsHtml = '';
    for (const pillar of scores) {
        const color = PILLAR_COLORS[pillar.pillar] || 'var(--color-aws-orange)';
        const pct = (pillar.score / 5) * 100;
        barsHtml += `
      <div class="wa-bar">
        <div class="wa-bar__label">${escapeHtml(pillar.pillar)}</div>
        <div class="wa-bar__track">
          <div class="wa-bar__fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="wa-bar__score">${pillar.score}/5</div>
      </div>`;
    }

    return `
    <div class="wa-overview">
      <div class="wa-overview__avg">
        <div class="wa-overview__avg-value">${avgScore}</div>
        <div class="wa-overview__avg-label">평균 점수</div>
      </div>
      <div class="wa-overview__bars">${barsHtml}</div>
    </div>`;
}

function buildPillarDetails(scores) {
    let html = '';
    scores.forEach((pillar, pIdx) => {
        const color = PILLAR_COLORS[pillar.pillar] || 'var(--color-aws-orange)';
        let recsHtml = '';

        if (pillar.recommendations && pillar.recommendations.length > 0) {
            pillar.recommendations.forEach((rec, rIdx) => {
                const hasCommands = rec.commands && rec.commands.length > 0;
                recsHtml += `
          <div class="wa-rec">
            <div class="wa-rec__text">${escapeHtml(rec.text)}</div>
            ${hasCommands ? `<button class="wa-rec__apply-btn" data-wa-pillar-index="${pIdx}" data-wa-rec-index="${rIdx}">적용</button>` : ''}
          </div>`;
            });
        } else {
            recsHtml = '<div class="wa-rec wa-rec--empty">권장사항이 없습니다.</div>';
        }

        html += `
      <div class="wa-pillar">
        <div class="wa-pillar__header">
          <span class="wa-pillar__dot" style="background:${color};"></span>
          <span class="wa-pillar__name">${escapeHtml(pillar.pillar)}</span>
          <span class="wa-pillar__score">${pillar.score}/5</span>
        </div>
        <div class="wa-pillar__rationale">${escapeHtml(pillar.rationale)}</div>
        <div class="wa-pillar__recs">${recsHtml}</div>
      </div>`;
    });
    return html;
}
