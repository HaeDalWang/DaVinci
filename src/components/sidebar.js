// src/components/sidebar.js — 좌측 접이식 사이드바 (AI Agent 연동 준비)

import { showToast } from './toast.js';
import { analyzeXmlServices } from '../core/aws-architecture-builder.js';

/**
 * 사이드바 컴포넌트 초기화
 * @param {import('../core/drawio-bridge.js').DrawIOBridge} bridge
 */
export function initSidebar(bridge) {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const chatMessages = document.getElementById('chat-messages');
    const exampleBtns = document.querySelectorAll('.sidebar__example-btn');

    // 사이드바 토글
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('is-collapsed');
        toggleBtn.setAttribute('aria-expanded', !sidebar.classList.contains('is-collapsed'));
    });

    // 입력 필드 자동 높이 조절
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
        chatSend.disabled = chatInput.value.trim().length === 0;
    });

    // 전송 버튼
    chatSend.addEventListener('click', () => {
        sendMessage(chatInput, chatMessages, bridge);
    });

    // Enter 키 전송 (Shift+Enter는 줄바꿈)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim()) {
                sendMessage(chatInput, chatMessages, bridge);
            }
        }
    });

    // 예시 프롬프트 버튼
    exampleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            chatInput.value = prompt;
            chatInput.dispatchEvent(new Event('input'));
            chatInput.focus();
        });
    });
}

/**
 * 메시지 전송 처리
 */
async function sendMessage(inputEl, messagesEl, bridge) {
    const text = inputEl.value.trim();
    if (!text) return;

    // 웰컴 메시지 제거 (첫 전송 시)
    const welcome = messagesEl.querySelector('.sidebar__welcome');
    if (welcome) {
        welcome.remove();
    }

    // 사용자 메시지 추가
    appendMessage(messagesEl, text, 'user');

    // 입력 초기화
    inputEl.value = '';
    inputEl.style.height = 'auto';
    const sendBtn = document.getElementById('chat-send');
    sendBtn.disabled = true;

    // 로딩 인디케이터 추가
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `<div id="${loadingId}" class="chat-message chat-message--ai"><div class="chat-message__bubble">생각 중...</div></div>`;
    messagesEl.insertAdjacentHTML('beforeend', loadingHtml);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        // 현재 에디터 내용 (XML)
        const xml = await bridge.getCurrentXml();

        // XML 텍스트 전체 대신 분석된 서비스 논리 구조만 추출
        const services = analyzeXmlServices(xml);
        // 원본 XML에서 아이디, 스타일 데이터 등을 떼어내어 필요한 정보만 요약 (토큰 최적화용)
        const architectureSummary = Object.entries(services).map(([tier, items]) => {
            return {
                tier,
                items: items.map(i => ({ type: i.type, label: i.label }))
            };
        });

        // 벡엔드 API 호출 (클라우드 배포 시 상대 주소 사용 등 동적 처리 필요)
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, architecture: architectureSummary })
        });

        const data = await response.json();

        // 로딩 제거
        document.getElementById(loadingId)?.remove();

        if (response.ok && data.reply) {
            appendMessage(messagesEl, data.reply, 'ai');
        } else {
            appendMessage(messagesEl, data.error || '백엔드에서 응답을 받지 못했습니다.', 'error');
        }
    } catch (err) {
        document.getElementById(loadingId)?.remove();
        console.error('AI 연결 에러:', err);
        appendMessage(messagesEl, 'AI Agent 서버(localhost:3000)에 연결할 수 없습니다.', 'error');
    }
}

/**
 * 채팅 메시지 DOM 추가
 */
function appendMessage(container, text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message chat-message--${type}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-message__bubble';
    bubble.innerText = text;

    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}
