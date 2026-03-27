// src/core/channel-router.js — 사용자 요청 유형에 따른 채널 라우팅

import { analyzeArchitecture } from './aws-analyzer.js';
import { summarizeXml } from './xml-summarizer.js';

/**
 * 수정/생성 의도를 나타내는 한국어 키워드 목록
 * 이 키워드가 포함되면 XML 채널로 라우팅한다.
 */
const MODIFICATION_KEYWORDS = [
    '그려줘', '추가해', '수정해', '삭제해', '만들어',
    '변경해', '제거해', '연결해', '그려', '추가',
    '수정', '삭제', '만들', '변경', '제거', '연결',
    '넣어', '빼', '바꿔', '교체', '생성',
    'add', 'remove', 'create', 'delete', 'connect',
    'modify', 'change', 'replace', 'draw', 'build',
];

/**
 * @typedef {'summary'|'xml'} ChannelType
 */

export class ChannelRouter {
    /**
     * @param {import('./drawio-bridge.js').DrawIOBridge} bridge
     */
    constructor(bridge) {
        this._bridge = bridge;
    }

    /**
     * 메시지 의도를 분석하여 적절한 채널과 데이터를 반환한다.
     * @param {string} userMessage
     * @returns {Promise<{channel: ChannelType, data: object}>}
     */
    async preparePayload(userMessage) {
        const channel = this._detectChannel(userMessage);
        const xml = await this._bridge.getCurrentXml();

        if (channel === 'xml') {
            // 변경: XML 대신 Lightweight_JSON 전달
            const lightweightJson = summarizeXml(xml);
            return { channel, data: { architecture: lightweightJson } };
        }

        // Summary 채널: 분석 요약 JSON 생성
        const analysis = analyzeArchitecture(xml);
        return {
            channel,
            data: {
                services: analysis.services.map(s => ({
                    type: s.shapeName, label: s.label, category: s.category,
                })),
                connections: analysis.connections,
                categories: analysis.categories,
                summary: analysis.summary,
            },
        };
    }

    /**
     * 메시지에 수정/생성 키워드가 포함되어 있는지 판별한다.
     * @param {string} message
     * @returns {ChannelType}
     * @private
     */
    _detectChannel(message) {
        if (!message) return 'summary';
        const lower = message.toLowerCase();
        for (const keyword of MODIFICATION_KEYWORDS) {
            if (lower.includes(keyword)) {
                return 'xml';
            }
        }
        return 'summary';
    }
}
