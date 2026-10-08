// src/core/generation-flow.js — "새 그림 생성" 모드의 응답 처리 규칙 (DOM 없음, 사이드바가 표시만 한다)
//
// 규칙: 질문이 있으면 질문만 보여주고 아무것도 실행하지 않는다. 잘린 응답·섞인 명령은 실행하지 않는다.

export const GENERATE_COMMAND = 'generate_architecture';

const CLIPPED_NOTICE = '요청한 구조가 너무 커서 응답이 중간에 끊겼습니다. 일부만 그리지 않고 아무것도 실행하지 않았습니다. 규모를 줄이거나 나누어 다시 요청해주세요.';
const MIXED_NOTICE = '새 그림 생성 모드에서는 "새 그림 만들기" 응답 하나만 실행합니다. 다른 편집 명령이 섞여 있어 아무것도 실행하지 않았습니다. 기존 그림을 고치려면 "기존 그림 편집"으로 바꿔주세요.';
const BAD_QUESTIONS_NOTICE = '응답의 질문 형식이 올바르지 않아 아무것도 실행하지 않았습니다. 같은 요청을 다시 보내주세요.';

/**
 * 모델이 준 questions 필드를 검사한다. 없거나 null이면 질문 없음, 비어 있지 않은 문자열 배열이면 질문,
 * 그 밖의 형식(문자열, 객체, 잘못된 항목이 섞인 배열)은 ok:false다. 형식 오류를 "질문 없음"으로 보고 실행하면 안 된다.
 * @param {unknown} value
 * @returns {{ok: boolean, questions: string[]}}
 */
export function parseQuestions(value) {
    if (value === undefined || value === null) return { ok: true, questions: [] };
    if (!Array.isArray(value) || !value.every(q => typeof q === 'string' && q.trim())) return { ok: false, questions: [] };
    return { ok: true, questions: value.map(q => q.trim()).slice(0, 10) };
}

/** 스타일을 참고할 페이지를 읽지 못했을 때의 안내. AI 요청 전에 멈추므로 아무것도 보내거나 그리지 않았다. */
export function formatPageUnreadable(reason) {
    return `스타일을 참고할 페이지를 정하지 못했습니다(${reason}). 아직 AI 요청을 보내지 않았고 아무것도 그리지 않았습니다. ` +
        '참고할 페이지를 선택한 뒤 같은 요청을 다시 보내주세요.';
}

/** 사용자에게 보여줄 질문 목록 문장을 만든다. 대화 기록에도 그대로 남겨 다음 답변이 이어지게 한다. */
export function formatQuestions(questions, intro = '') {
    const list = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    return `${intro ? `${intro}\n\n` : ''}그리기 전에 확인할 내용이 있어요. 아직 아무것도 그리지 않았습니다.\n${list}\n\n답해 주시면 이어서 그리겠습니다.`;
}

/**
 * 모델 응답을 실행 계획으로 바꾼다.
 * @param {{message?: string, commands?: object[], questions?: string[], truncated?: boolean}} response
 * @param {{pageId?: string|null}} context - 스타일을 참고할 페이지(요청 시점에 고정)
 * @returns {{commands: object[], questions: string[], blocked: string|null}}
 */
export function planGeneration(response, { pageId } = {}) {
    if (response?.truncated) return { commands: [], questions: [], blocked: CLIPPED_NOTICE };
    const parsed = parseQuestions(response?.questions);
    if (!parsed.ok) return { commands: [], questions: [], blocked: BAD_QUESTIONS_NOTICE };
    const questions = parsed.questions;
    // 질문이 있으면 commands가 함께 와도 실행하지 않는다.
    if (questions.length > 0) return { commands: [], questions, blocked: null };
    const commands = Array.isArray(response?.commands) ? response.commands : [];
    if (commands.length === 0) return { commands: [], questions: [], blocked: null };
    if (commands.length > 1 || commands[0]?.type !== GENERATE_COMMAND) {
        return { commands: [], questions: [], blocked: MIXED_NOTICE };
    }
    const params = { ...commands[0].params };
    if (typeof pageId === 'string' && pageId) params.pageId = pageId;
    else delete params.pageId;
    return { commands: [{ type: GENERATE_COMMAND, params }], questions: [], blocked: null };
}

/**
 * 모델 응답을 처리하고 화면에 보여줄 메시지를 돌려준다.
 * @param {object} response - 서버의 생성 모드 응답
 * @param {{pageId?: string|null, executeCommands: (commands: object[]) => Promise<{success: boolean, message: string, questions?: string[]}>}} deps
 * @returns {Promise<Array<{type: 'ai'|'system'|'error', text: string}>>} 표시 순서대로의 메시지
 */
export async function applyGenerationResponse(response, { pageId, executeCommands }) {
    const messages = [];
    const plan = planGeneration(response, { pageId });
    if (plan.blocked) return [{ type: 'error', text: plan.blocked }];
    if (plan.questions.length > 0) return [{ type: 'ai', text: formatQuestions(plan.questions, response.message) }];
    if (response?.message) messages.push({ type: 'ai', text: response.message });
    if (plan.commands.length === 0) return messages;

    const result = await executeCommands(plan.commands);
    if (result.success) {
        messages.push({
            type: 'system',
            text: '✅ 새 페이지로 그림을 추가했습니다. 기존 페이지는 바꾸지 않았습니다. 새 페이지 탭을 열어 확인하세요.',
        });
    } else if (Array.isArray(result.questions) && result.questions.length > 0) {
        messages.push({ type: 'ai', text: formatQuestions(result.questions) });
    } else {
        const restoreFailed = result.message.includes('롤백 실패');
        messages.push({
            type: 'error',
            text: `${restoreFailed ? '그림을 만들지 못했고 원래대로 되돌리는 데도 실패했습니다. 되돌리기 버튼이나 다운로드한 파일을 확인하세요.' : '그림을 만들지 못했습니다. 아무것도 바꾸지 않았습니다.'} ${result.message}`,
        });
    }
    return messages;
}
