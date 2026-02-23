// src/components/analysis-modal.js — 분석 결과 및 최적화 팁 모달

/**
 * 분석 결과 모달 표시
 * @param {import('../core/aws-analyzer.js').AnalysisResult} analysis
 */
export function showAnalysisModal(analysis) {
  const html = buildAnalysisContent(analysis);
  openModal('아키텍처 분석 결과', html);
}

/**
 * 최적화 팁 모달 표시
 * @param {Array} tips
 */
export function showOptimizationModal(tips) {
  const html = buildTipsContent(tips);
  openModal('최적화 팁', html);
}

/**
 * 범용 모달 열기
 */
function openModal(title, bodyHtml) {
  // 기존 모달 제거
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h2 class="modal__title">${title}</h2>
        <button class="modal__close" id="modal-close-btn" aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(backdrop);

  // 닫기 이벤트
  backdrop.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // ESC 키로 닫기
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 모달 닫기
 */
function closeModal() {
  const existing = document.getElementById('active-modal');
  if (existing) existing.remove();
}

/**
 * 분석 결과 HTML 생성
 */
function buildAnalysisContent(analysis) {
  const { services, connections, categories, tips, summary } = analysis;

  if (summary.totalServices === 0) {
    return `
      <div style="text-align:center; padding:32px; color:var(--text-muted);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.5">
          <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/>
        </svg>
        <p>AWS 서비스가 감지되지 않았습니다.</p>
        <p style="font-size:12px; margin-top:8px;">draw.io 패널에서 AWS 서비스를 배치해주세요.</p>
      </div>
    `;
  }

  let html = '';

  // 요약
  html += `
    <div class="analysis-section">
      <div class="analysis-section__title">요약</div>
      <div class="service-grid">
        <div class="service-card">
          <div class="service-card__count">${summary.totalServices}</div>
          <div class="service-card__name">AWS 서비스</div>
        </div>
        <div class="service-card">
          <div class="service-card__count">${summary.totalConnections}</div>
          <div class="service-card__name">연결 관계</div>
        </div>
        <div class="service-card">
          <div class="service-card__count">${Object.keys(categories).length}</div>
          <div class="service-card__name">카테고리</div>
        </div>
        <div class="service-card">
          <div class="service-card__count">${tips.length}</div>
          <div class="service-card__name">최적화 팁</div>
        </div>
      </div>
    </div>
  `;

  // 카테고리별 서비스
  html += '<div class="analysis-section">';
  html += '<div class="analysis-section__title">사용된 AWS 서비스</div>';
  for (const [category, svcs] of Object.entries(categories)) {
    if (svcs.length === 0) continue;
    html += `<div style="margin-bottom:12px;">`;
    html += `<div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">${formatCategory(category)} (${svcs.length})</div>`;
    html += '<div class="service-grid">';
    for (const svc of svcs) {
      html += `
        <div class="service-card">
          <div class="service-card__name" style="color:var(--text-primary);">${escapeHtml(svc.label)}</div>
        </div>
      `;
    }
    html += '</div></div>';
  }
  html += '</div>';

  // 연결 관계
  if (connections.length > 0) {
    html += '<div class="analysis-section">';
    html += '<div class="analysis-section__title">연결 관계</div>';
    html += '<ul class="connection-list">';
    for (const conn of connections) {
      html += `
        <li class="connection-item">
          <span>${escapeHtml(conn.from)}</span>
          <span class="connection-arrow">→</span>
          <span>${escapeHtml(conn.to)}</span>
        </li>
      `;
    }
    html += '</ul></div>';
  }

  // 최적화 팁 (분석 모달에도 간략 표시)
  if (tips.length > 0) {
    html += '<div class="analysis-section">';
    html += '<div class="analysis-section__title">최적화 제안</div>';
    html += buildTipCards(tips);
    html += '</div>';
  }

  return html;
}

/**
 * 최적화 팁 HTML 생성
 */
function buildTipsContent(tips) {
  if (tips.length === 0) {
    return `
      <div style="text-align:center; padding:32px; color:var(--text-muted);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="1.5" style="margin-bottom:12px;">
          <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
        </svg>
        <p>현재 아키텍처에 대한 최적화 제안이 없습니다.</p>
        <p style="font-size:12px; margin-top:8px;">더 많은 AWS 서비스를 배치하면 추가 분석이 가능합니다.</p>
      </div>
    `;
  }

  let html = `
    <div style="margin-bottom:16px; font-size:13px; color:var(--text-secondary);">
      ${tips.length}개의 최적화 제안이 발견되었습니다.
    </div>
  `;
  html += buildTipCards(tips);
  return html;
}

/**
 * 팁 카드 HTML 빌드
 */
function buildTipCards(tips) {
  return tips
    .map(
      (tip) => `
    <div class="tip-card tip-card--${tip.severity}">
      <div class="tip-card__title">${severityIcon(tip.severity)} ${escapeHtml(tip.title)}</div>
      <div class="tip-card__desc">${escapeHtml(tip.description)}</div>
    </div>
  `
    )
    .join('');
}

function severityIcon(severity) {
  switch (severity) {
    case 'error': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    case 'warning': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    case 'success': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';
    default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }
}

function formatCategory(cat) {
  return cat.replace(/_/g, ' / ');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
