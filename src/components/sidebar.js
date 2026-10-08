// src/components/sidebar.js — 좌측 접이식 사이드바 (AI Agent 연동)

import { showToast } from './toast.js';
import { showWellArchitectedModal } from './well-architected-modal.js';
import { ChannelRouter } from '../core/channel-router.js';
import { ConversationContext } from '../core/conversation-context.js';
import { DiagramController } from '../core/diagram-controller.js';
import { SnapshotManager } from '../core/snapshot-manager.js';
import { applyGenerationResponse, formatPageUnreadable } from '../core/generation-flow.js';

/** 모델 컨텍스트 윈도우 토큰 한도 (Claude 3.5 Sonnet 기준 근사치) */
const MAX_MODEL_TOKENS = 200000;

/** @type {ChannelRouter|null} */
let channelRouter = null;
/** @type {ConversationContext|null} */
let conversationContext = null;
/** 새 그림 생성 전용 대화 기록. 편집 대화(기존 그림 내용 포함)가 생성 요구사항으로 섞이지 않게 분리한다. */
/** @type {ConversationContext|null} */
let generationContext = null;
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
    generationContext = new ConversationContext();
    diagramController = new DiagramController(bridge, snapshotManager);

    initModeSelect(chatInput);

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
            generationContext.reset();
            resetChatUI(chatMessages);
            showToast('새 대화를 시작합니다.', 'info');
        });
    }

    // "되돌리기" 버튼
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', async () => {
            if (chatMessages.querySelector('[id^="loading-"]') || document.getElementById('btn-open').disabled) return;
            const snapshot = snapshotManager.restore();
            if (snapshot) {
                try {
                    await bridge.loadXmlAndWait(snapshot.xml);
                    conversationContext.reset();
                    generationContext.reset();
                    resetChatUI(chatMessages);
                    try {
                        localStorage.setItem('davinci_diagram', snapshot.xml);
                    } catch {
                        showToast('브라우저에 저장하지 못했습니다. 다운로드로 보관해주세요.', 'error');
                    }
                    showToast('다이어그램을 복원했습니다.', 'success');
                } catch (error) {
                    snapshotManager.save(snapshot.xml, snapshot.description);
                    showToast(`되돌리기 실패: ${error.message}`, 'error');
                }
            } else {
                showToast('되돌릴 수 있는 변경 사항이 없습니다.', 'info');
            }
        });
    }
}

const MODE_HINTS = {
    edit: '',
    generate: '새 그림 생성: 지금 보고 있는 페이지의 스타일·크기만 참고해 새 페이지에 그립니다. 원래 페이지는 바꾸지 않습니다. 스타일을 참고할 페이지를 바꾸려면 먼저 그 페이지를 선택하세요.',
};
const MODE_PLACEHOLDERS = {
    edit: '아키텍처를 설명해주세요...',
    generate: '그릴 서비스·소속·연결을 말해주세요 (예: VPC 안에 ALB와 EC2 두 대, ALB에서 EC2로 연결)',
};

/** 입력창 위에 "기존 그림 편집 / 새 그림 생성" 선택을 추가한다. 기본값은 기존 그림 편집이다. */
function initModeSelect(chatInput) {
    const area = chatInput.closest('.sidebar__input-area');
    if (!area || document.getElementById('chat-mode')) return;
    const wrap = document.createElement('div');
    wrap.className = 'sidebar__mode';
    wrap.innerHTML = `<label class="sidebar__mode-label" for="chat-mode">작업 방식</label>
        <select id="chat-mode" class="sidebar__mode-select" aria-describedby="chat-mode-hint">
            <option value="edit" selected>기존 그림 편집</option>
            <option value="generate">새 그림 생성</option>
        </select>
        <p id="chat-mode-hint" class="sidebar__mode-hint" hidden></p>`;
    area.prepend(wrap);
    const select = wrap.querySelector('select');
    const hint = wrap.querySelector('#chat-mode-hint');
    select.addEventListener('change', () => {
        hint.textContent = MODE_HINTS[select.value];
        hint.hidden = !MODE_HINTS[select.value];
        chatInput.placeholder = MODE_PLACEHOLDERS[select.value];
    });
}

/** 현재 선택된 작업 방식. 선택 UI가 없으면 기존 편집이다. */
function currentMode() {
    return document.getElementById('chat-mode')?.value === 'generate' ? 'generate' : 'edit';
}

/**
 * 채팅 UI를 웰컴 화면으로 복원한다.
 */
export function resetDiagramSession(previousXml) {
    conversationContext.reset();
    generationContext.reset();
    snapshotManager.clear();
    if (previousXml) snapshotManager.save(previousXml, '그림 열기 전');
    resetChatUI(document.getElementById('chat-messages'));
}

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
    if (messagesEl.querySelector('[id^="loading-"]')) return;

    // 웰컴 메시지 제거 (첫 전송 시)
    const welcome = messagesEl.querySelector('.sidebar__welcome');
    if (welcome) welcome.remove();

    // 사용자 메시지 추가
    appendMessage(messagesEl, text, 'user');

    // 입력 초기화
    inputEl.value = '';
    inputEl.disabled = true;
    inputEl.style.height = 'auto';
    document.getElementById('chat-send').disabled = true;

    // 로딩 인디케이터
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `<div id="${loadingId}" class="chat-message chat-message--ai"><div class="chat-message__bubble">생각 중...</div></div>`;
    messagesEl.insertAdjacentHTML('beforeend', loadingHtml);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const mode = currentMode();
    try {
        if (mode === 'generate') {
            await sendGenerationRequest(text, messagesEl);
            return;
        }
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

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                architecture: architectureData,
                channel: payload.channel,
                conversationHistory: conversationContext.getMessages(),
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            appendMessage(messagesEl, errData.error || '백엔드에서 응답을 받지 못했습니다.', 'error');
            return;
        }

        const data = await response.json();
        conversationContext.addMessage('user', text);
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
            // AI 대기 중 사용자가 페이지를 바꿔도 추가 대상은 요청한 페이지다.
            const commands = commandResponse.commands.map(command => command.type === 'add_service' && payload.pageId
                ? { ...command, params: { ...command.params, pageId: payload.pageId } }
                : command);
            const result = await diagramController.executeCommands(commands);
            if (result.success) {
                appendMessage(messagesEl, `✅ ${result.message}`, 'system');
            } else {
                showToast(`커맨드 실행 실패: ${result.message}`, 'error');
            }
        }
    } catch (err) {
        console.error('AI 연결 에러:', err);
        appendMessage(messagesEl, 'AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
        document.getElementById(loadingId)?.remove();
        inputEl.disabled = false;
        document.getElementById('chat-send').disabled = !inputEl.value.trim();
    }
}

/**
 * 새 그림 생성 요청. 현재 그림의 내용은 서버로 보내지 않고, 스타일을 참고할 페이지 id만 요청 시점에 고정한다.
 * 질문·오류·성공은 모두 채팅에 남기고 대화 기록에도 넣어 다음 답변이 이어지게 한다.
 */
async function sendGenerationRequest(text, messagesEl) {
    let pageId;
    try {
        pageId = (await channelRouter.preparePayload(text)).pageId;
    } catch (err) {
        // 참고할 페이지를 모르면 AI 요청 없이 멈추고, 같은 요청을 다시 보낼 수 있게 기록만 남긴다.
        const notice = formatPageUnreadable(err.message);
        appendMessage(messagesEl, notice, 'ai');
        generationContext.addMessage('user', text);
        generationContext.addMessage('assistant', notice);
        return;
    }
    generationContext.trimToFit(Math.floor(MAX_MODEL_TOKENS * 0.8));
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode: 'generate', conversationHistory: generationContext.getMessages() }),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        appendMessage(messagesEl, errData.error || '백엔드에서 응답을 받지 못했습니다.', 'error');
        return;
    }
    const data = await response.json();
    generationContext.addMessage('user', text);
    const messages = await applyGenerationResponse(data, {
        pageId,
        executeCommands: commands => diagramController.executeCommands(commands),
    });
    for (const m of messages) appendMessage(messagesEl, m.text, m.type);
    if (messages.length > 0) generationContext.addMessage('assistant', messages.map(m => m.text).join('\n\n'));
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
