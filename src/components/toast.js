// src/components/toast.js — 토스트 알림 컴포넌트

import { escapeHtml } from '../core/utils.js';

/**
 * 토스트 알림을 표시한다.
 * @param {string} message - 메시지 텍스트
 * @param {'success'|'error'|'info'} type - 알림 타입
 * @param {number} duration - 표시 시간 (ms)
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
    <span>${typeIcon(type)}</span>
    <span>${escapeHtml(message)}</span>
  `;

    container.appendChild(toast);

    // 자동 제거
    setTimeout(() => {
        toast.classList.add('is-exiting');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

function typeIcon(type) {
    switch (type) {
        case 'success': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;"><polyline points="20,6 9,17 4,12"/></svg>';
        case 'error': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
}
