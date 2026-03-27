// src/core/conversation-context.js — 대화 히스토리 관리 및 토큰 제한 처리

/**
 * @typedef {Object} ConversationMessage
 * @property {'user'|'assistant'} role
 * @property {string} content
 */

export class ConversationContext {
    /**
     * @param {number} maxTokenRatio - 모델 컨텍스트 윈도우 대비 최대 사용 비율 (기본 0.8)
     */
    constructor(maxTokenRatio = 0.8) {
        /** @type {ConversationMessage[]} */
        this._messages = [];
        this._maxTokenRatio = maxTokenRatio;
    }

    /**
     * 메시지를 대화 히스토리에 추가한다.
     * @param {'user'|'assistant'} role
     * @param {string} content
     */
    addMessage(role, content) {
        this._messages.push({ role, content });
    }

    /**
     * 전체 대화 히스토리를 순서대로 반환한다.
     * @returns {ConversationMessage[]}
     */
    getMessages() {
        return [...this._messages];
    }

    /**
     * 대화 히스토리를 초기화한다.
     */
    reset() {
        this._messages = [];
    }

    /**
     * 현재 대화 히스토리의 토큰 수를 추정한다.
     * 근사치: 1 토큰 ≈ 4자
     * @returns {number}
     */
    estimateTokens() {
        let totalChars = 0;
        for (const msg of this._messages) {
            totalChars += (msg.content || '').length;
        }
        return Math.ceil(totalChars / 4);
    }

    /**
     * 토큰 한도 이내로 대화 히스토리를 트리밍한다.
     * 가장 오래된 메시지부터 순차적으로 제거한다.
     * @param {number} maxTokens - 최대 허용 토큰 수
     */
    trimToFit(maxTokens) {
        while (this._messages.length > 0 && this.estimateTokens() > maxTokens) {
            this._messages.shift();
        }
    }
}
