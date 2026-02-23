// src/components/sidebar.js — 좌측 접이식 사이드바 (AI Agent 연동 준비)

import { showToast } from './toast.js';

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
        sendMessage(chatInput, chatMessages);
    });

    // Enter 키 전송 (Shift+Enter는 줄바꿈)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim()) {
                sendMessage(chatInput, chatMessages);
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
function sendMessage(inputEl, messagesEl) {
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

    // AI 응답 시뮬레이션 (향후 실제 AI 연동 포인트)
    setTimeout(() => {
        const response = generateSimulatedResponse(text);
        appendMessage(messagesEl, response, 'ai');
    }, 800);
}

/**
 * 채팅 메시지 DOM 추가
 */
function appendMessage(container, text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message chat-message--${type}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-message__bubble';
    bubble.textContent = text;

    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

/**
 * AI 응답 시뮬레이션
 * 향후 이 함수를 실제 AI API 호출로 교체
 */
function generateSimulatedResponse(userMessage) {
    const lower = userMessage.toLowerCase();

    if (lower.includes('3-tier') || lower.includes('3tier') || lower.includes('웹 앱') || lower.includes('웹앱')) {
        return '3-Tier 웹 앱 아키텍처를 생성하겠습니다.\n\nAI Agent 기능은 현재 개발 중입니다. 이 기능이 완성되면 자연어 명령으로 CloudFront → ALB → EC2/ECS → RDS 구성의 다이어그램을 자동 생성할 수 있습니다.';
    }

    if (lower.includes('서버리스') || lower.includes('serverless') || lower.includes('lambda')) {
        return '서버리스 이벤트 드리븐 아키텍처를 그리겠습니다.\n\nAI Agent 기능은 현재 개발 중입니다. 이 기능이 완성되면 API Gateway → Lambda → DynamoDB + EventBridge 구성을 자동 생성할 수 있습니다.';
    }

    if (lower.includes('eks') || lower.includes('kubernetes') || lower.includes('마이크로서비스')) {
        return 'EKS 기반 마이크로서비스 아키텍처를 구성하겠습니다.\n\nAI Agent 기능은 현재 개발 중입니다. 이 기능이 완성되면 VPC → EKS Cluster → Node Groups + ECR + ALB Ingress 패턴을 자동 생성할 수 있습니다.';
    }

    return 'AI Agent 기능은 현재 Preview 단계입니다. 추후 업데이트를 통해 자연어 기반 아키텍처 생성/수정 기능이 지원될 예정입니다.\n\n현재는 draw.io 패널에서 AWS 서비스를 직접 드래그 앤 드롭하여 아키텍처를 설계할 수 있습니다.';
}
