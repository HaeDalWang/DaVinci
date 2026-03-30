// src/core/utils.js — 공통 유틸리티 함수

/**
 * HTML 특수문자를 이스케이프한다.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
