// src/components/sidebar.js — 좌측 접이식 사이드바 (AI Agent 연동)

import { showToast } from './toast.js';
import { showWellArchitectedModal } from './well-architected-modal.js';
import { ChannelRouter } from '../core/channel-router.js';
import { ConversationContext } from '../core/conversation-context.js';
import { DiagramController } from '../core/diagram-controller.js';
import { SnapshotManager } from '../core/snapshot-manager.js';

/** 모델 컨텍스트 윈도우 토큰 한도 (Claude 3.5 Sonnet 기준 근사치) */
const MAX_MODEL_TOKENS = 200000;

/** @type {ChannelRouter|null} */
let channelRouter = null;
/** @type {ConversationContext|null} */
let conversationContext = null;
/** @type {DiagramController|null} */
let diagramController = null;
/** @type {SnapshotManager|null} */
let snapshotManager = null;

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

    // 핵심 모듈 초기화
    snapshotManager = new SnapshotManager();
    channelRouter = new ChannelRouter(bridge);
    conversationContext = new ConversationContext();
    diagramController = new DiagramController(bridge, snapshotManager);

    // 사이드바 리사이즈 핸들 초기화
    initSidebarResize(sidebar);

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

    // Enter 키 전송 (Shift+Enter는 줄바꿈, IME 조합 중에는 무시)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
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

    // "새 대화" 버튼
    const newChatBtn = document.getElementById('btn-new-chat');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            conversationContext.reset();
            resetChatUI(chatMessages);
            showToast('새 대화를 시작합니다.', 'info');
        });
    }

    // "되돌리기" 버튼
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            const snapshot = snapshotManager.restore();
            if (snapshot) {
                bridge.loadXml(snapshot.xml);
                const time = new Date(snapshot.timestamp).toLocaleTimeString('ko-KR');
                showToast(`다이어그램을 복원했습니다 (${time}: ${snapshot.description})`, 'success');
            } else {
                showToast('되돌릴 수 있는 변경 사항이 없습니다.', 'info');
            }
        });
    }
}

/**
 * 채팅 UI를 웰컴 화면으로 복원한다.
 */
function resetChatUI(messagesEl) {
    messagesEl.innerHTML = `
    <div class="sidebar__welcome">
        <div class="sidebar__welcome-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-aws-orange)"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <path d="M8 7h.01M12 7h.01M16 7h.01" />
            </svg>
        </div>
        <h3>AWS 아키텍처 AI</h3>
        <p>자연어로 아키텍처를 생성하거나 수정할 수 있습니다.</p>
        <div class="sidebar__examples">
            <button class="sidebar__example-btn" data-prompt="3-tier 웹 애플리케이션 아키텍처를 그려줘">3-tier 웹 앱 아키텍처</button>
            <button class="sidebar__example-btn" data-prompt="서버리스 이벤트 드리븐 아키텍처를 그려줘">서버리스 아키텍처</button>
            <button class="sidebar__example-btn" data-prompt="EKS 기반 마이크로서비스 아키텍처를 그려줘">EKS 마이크로서비스</button>
        </div>
    </div>`;

    // 새로 생성된 예시 버튼에 이벤트 재바인딩
    const chatInput = document.getElementById('chat-input');
    messagesEl.querySelectorAll('.sidebar__example-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.dataset.prompt;
            chatInput.dispatchEvent(new Event('input'));
            chatInput.focus();
        });
    });
}

/**
 * Command_Response JSON을 파싱한다.
 * 유효하지 않은 경우 텍스트 메시지로 폴백한다.
 */
function parseCommandResponse(data) {
    if (data && typeof data.message === 'string' && Array.isArray(data.commands)) {
        return data;
    }
    if (data && typeof data.message === 'string') {
        return { message: data.message, commands: [], wellArchitected: data.wellArchitected || undefined };
    }
    // 폴백: 전체를 텍스트로 처리
    return { message: typeof data === 'string' ? data : JSON.stringify(data), commands: [] };
}

/**
 * 메시지 전송 처리
 */
async function sendMessage(inputEl, messagesEl, bridge) {
    const text = inputEl.value.trim();
    if (!text) return;

    // 웰컴 메시지 제거 (첫 전송 시)
    const welcome = messagesEl.querySelector('.sidebar__welcome');
    if (welcome) welcome.remove();

    // 사용자 메시지 추가
    appendMessage(messagesEl, text, 'user');
    conversationContext.addMessage('user', text);

    // 입력 초기화
    inputEl.value = '';
    inputEl.style.height = 'auto';
    document.getElementById('chat-send').disabled = true;

    // 로딩 인디케이터
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `<div id="${loadingId}" class="chat-message chat-message--ai"><div class="chat-message__bubble">생각 중...</div></div>`;
    messagesEl.insertAdjacentHTML('beforeend', loadingHtml);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        // 채널 라우팅으로 데이터 준비
        const payload = await channelRouter.preparePayload(text);

        // 토큰 한도 초과 시 트리밍
        conversationContext.trimToFit(Math.floor(MAX_MODEL_TOKENS * 0.8));

        // API 호출
        // Channel Router는 xml 채널에서 { architecture: lightweightJson }을,
        // summary 채널에서 { services, connections, categories, summary }를 반환한다.
        // 서버는 architecture 필드에 채널별 데이터를 직접 기대하므로,
        // xml 채널일 때는 data.architecture(Lightweight_JSON)를 추출하여 전달한다.
        const architectureData = payload.channel === 'xml'
            ? payload.data.architecture
            : payload.data;

        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                architecture: architectureData,
                channel: payload.channel,
                conversationHistory: conversationContext.getMessages().slice(0, -1), // 현재 메시지 제외 (서버에서 추가)
            }),
        });

        // 로딩 제거
        document.getElementById(loadingId)?.remove();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            appendMessage(messagesEl, errData.error || '백엔드에서 응답을 받지 못했습니다.', 'error');
            return;
        }

        const data = await response.json();
        const commandResponse = parseCommandResponse(data);

        // AI 텍스트 메시지 표시
        if (commandResponse.message) {
            appendMessage(messagesEl, commandResponse.message, 'ai');
            conversationContext.addMessage('assistant', commandResponse.message);
        }

        // Well-Architected 평가 응답 처리
        if (commandResponse.wellArchitected && commandResponse.wellArchitected.pillars) {
            showWellArchitectedModal(
                commandResponse.wellArchitected.pillars,
                async (commands) => {
                    const result = await diagramController.executeCommands(commands);
                    if (result.success) {
                        appendMessage(messagesEl, `✅ ${result.message}`, 'system');
                    } else {
                        showToast(`권장사항 적용 실패: ${result.message}`, 'error');
                    }
                },
            );
        }

        // 커맨드 실행
        if (commandResponse.commands && commandResponse.commands.length > 0) {
            const result = await diagramController.executeCommands(commandResponse.commands);
            if (result.success) {
                appendMessage(messagesEl, `✅ ${result.message}`, 'system');
            } else {
                showToast(`커맨드 실행 실패: ${result.message}`, 'error');
            }
        }
    } catch (err) {
        document.getElementById(loadingId)?.remove();
        console.error('AI 연결 에러:', err);
        appendMessage(messagesEl, 'AI Agent 서버(localhost:3000)에 연결할 수 없습니다.', 'error');
    }
}

/**
 * 사이드바 드래그 리사이즈 초기화
 * 사이드바 왼쪽 가장자리에 핸들을 삽입하고 드래그로 너비를 조절한다.
 * @param {HTMLElement} sidebar
 */
function initSidebarResize(sidebar) {
    const MIN_WIDTH = 260;
    const MAX_WIDTH = 700;

    // 리사이즈 핸들 DOM 생성
    const handle = document.createElement('div');
    handle.className = 'sidebar__resize-handle';
    handle.setAttribute('aria-label', '사이드바 크기 조절');
    sidebar.prepend(handle);

    // 드래그 중 iframe이 mousemove를 가로채지 못하도록 투명 오버레이
    let overlay = null;
    let startX = 0;
    let startWidth = 0;

    function onMouseMove(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        sidebar.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;

        sidebar.classList.add('is-resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // iframe 위에 투명 오버레이를 깔아 이벤트 캡처 보장
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
        document.body.appendChild(overlay);

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
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
