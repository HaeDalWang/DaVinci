import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyGenerationResponse, parseQuestions, planGeneration } from '../src/core/generation-flow.js';
import { initSidebar } from '../src/components/sidebar.js';

const GENERATE = { type: 'generate_architecture', params: { title: 't', architecture: { services: [] } } };

describe('planGeneration', () => {
    test('질문이 있으면 commands가 함께 와도 실행 계획이 비어 있다', () => {
        const plan = planGeneration({ questions: ['연결은요?'], commands: [GENERATE] }, { pageId: 'p1' });
        expect(plan.commands).toEqual([]);
        expect(plan.questions).toEqual(['연결은요?']);
    });

    test('잘린 응답과 섞인 명령(add_service, replace_all, 둘 이상)은 실행하지 않는다', () => {
        expect(planGeneration({ truncated: true, commands: [GENERATE] }).commands).toEqual([]);
        for (const commands of [[{ type: 'add_service', params: { serviceType: 's3' } }], [{ type: 'replace_all', params: {} }], [GENERATE, GENERATE], [GENERATE, { type: 'add_service', params: {} }]]) {
            const plan = planGeneration({ commands }, { pageId: 'p1' });
            expect(plan.commands).toEqual([]);
            expect(plan.blocked).toBeTruthy();
        }
    });

    test('요청 시점에 고정한 pageId를 덮어써 넣고 모델이 보낸 pageId는 믿지 않는다', () => {
        const withModelPage = { ...GENERATE, params: { ...GENERATE.params, pageId: 'model-guess' } };
        expect(planGeneration({ commands: [withModelPage] }, { pageId: 'p1' }).commands[0].params.pageId).toBe('p1');
        expect(planGeneration({ commands: [withModelPage] }, { pageId: null }).commands[0].params).not.toHaveProperty('pageId');
    });
});

describe('questions 형식 검사', () => {
    test('없음/null/빈 배열은 질문 없음, 문자열 배열은 질문, 그 밖은 형식 오류다', () => {
        expect(parseQuestions(undefined)).toEqual({ ok: true, questions: [] });
        expect(parseQuestions(null)).toEqual({ ok: true, questions: [] });
        expect(parseQuestions([])).toEqual({ ok: true, questions: [] });
        expect(parseQuestions(['a?'])).toEqual({ ok: true, questions: ['a?'] });
        for (const bad of ['db는?', {}, [1], [''], ['ok', null], [['중첩']]]) expect(parseQuestions(bad).ok).toBe(false);
    });

    test('형식이 잘못된 questions가 있으면 동시에 온 generate 명령도 실행하지 않고 다시 요청을 안내한다', async () => {
        for (const questions of ['db는 어느 AZ?', [{ q: 1 }], ['']]) {
            const executeCommands = vi.fn();
            const messages = await applyGenerationResponse({ message: 'x', questions, commands: [GENERATE] }, { pageId: 'p1', executeCommands });
            expect(executeCommands).not.toHaveBeenCalled();
            expect(messages[0].text).toContain('다시 보내주세요');
        }
    });

    test('questions: []는 정상으로 보고 commands를 실행한다', async () => {
        const executeCommands = vi.fn(async () => ({ success: true, message: 'ok' }));
        await applyGenerationResponse({ message: '', questions: [], commands: [GENERATE] }, { pageId: 'p1', executeCommands });
        expect(executeCommands).toHaveBeenCalledTimes(1);
    });
});

describe('applyGenerationResponse', () => {
    test('질문이 오면 실행하지 않고 질문 문장을 돌려준다', async () => {
        const executeCommands = vi.fn();
        const messages = await applyGenerationResponse({ message: '확인할게요', questions: ['db는 어느 AZ인가요?'], commands: [GENERATE] }, { pageId: 'p1', executeCommands });
        expect(executeCommands).not.toHaveBeenCalled();
        expect(messages).toHaveLength(1);
        expect(messages[0].text).toContain('db는 어느 AZ인가요?');
        expect(messages[0].text).toContain('아직 아무것도 그리지 않았습니다');
    });

    test('실행 중 소속·연결 질문이 나오면 오류가 아니라 질문으로 보여준다', async () => {
        const executeCommands = vi.fn(async () => ({ success: false, message: 'x', questions: ['"DB"는 어느 그룹 안에 두나요?'] }));
        const messages = await applyGenerationResponse({ message: '', commands: [GENERATE] }, { pageId: 'p1', executeCommands });
        expect(messages.map(m => m.type)).toEqual(['ai']);
        expect(messages[0].text).toContain('어느 그룹 안에 두나요');
    });

    test('성공 메시지는 새 페이지 생성과 품질 판정을 구분한다', async () => {
        const executeCommands = vi.fn(async () => ({ success: true, message: 'ok' }));
        const messages = await applyGenerationResponse({ message: '그릴게요', commands: [GENERATE] }, { pageId: 'p1', executeCommands });
        expect(executeCommands).toHaveBeenCalledWith([{ ...GENERATE, params: { ...GENERATE.params, pageId: 'p1' } }]);
        const done = messages.find(m => m.type === 'system').text;
        expect(done).toContain('새 페이지');
        expect(done).toContain('기존 페이지는 바꾸지 않았습니다');
        expect(done).not.toContain('합격');
        expect(done.length).toBeLessThan(80);
    });

    test('실패와 롤백 실패를 구분해 알린다', async () => {
        const fail = message => applyGenerationResponse({ commands: [GENERATE] }, { executeCommands: async () => ({ success: false, message }) });
        expect((await fail('XML 반영 실패: x'))[0].text).toContain('아무것도 바꾸지 않았습니다');
        expect((await fail('XML 반영 실패: x (롤백 실패: y)'))[0].text).toContain('되돌리는 데도 실패');
    });
});

describe('sidebar 새 그림 생성 모드', () => {
    const PAGE = '<mxfile><diagram id="p1" name="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
    let bridge;
    let requests;

    const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); };
    const send = async text => {
        const input = document.getElementById('chat-input');
        input.value = text;
        input.dispatchEvent(new Event('input'));
        document.getElementById('chat-send').click();
        await flush();
    };

    beforeEach(() => {
        document.body.innerHTML = `<aside id="sidebar"><button id="sidebar-toggle"></button><div id="chat-messages"></div>
            <div class="sidebar__input-area"><textarea id="chat-input"></textarea><button id="chat-send" disabled></button></div></aside>
            <button id="btn-open"></button><button id="btn-new-chat"></button>`;
        bridge = { getCurrentXml: async () => PAGE, getEditingState: async () => ({ xml: PAGE, pageIndex: 0 }), merge: vi.fn(async () => ({})), loadXml: vi.fn() };
        requests = [];
        initSidebar(bridge);
    });

    test('기본은 기존 그림 편집이고 접근 가능한 라벨이 있는 select를 제공한다', () => {
        const select = document.getElementById('chat-mode');
        expect(select.value).toBe('edit');
        expect(document.querySelector('label[for="chat-mode"]')).not.toBeNull();
        expect([...select.options].map(o => o.textContent)).toEqual(['기존 그림 편집', '새 그림 생성']);
        select.value = 'generate';
        select.dispatchEvent(new Event('change'));
        expect(document.getElementById('chat-mode-hint').hidden).toBe(false);
        expect(document.getElementById('chat-mode-hint').textContent).toContain('원래 페이지는 바꾸지 않습니다');
    });

    test('질문 응답은 채팅에 표시되고 대화 기록에 남아 다음 요청에 포함되며 아무것도 쓰지 않는다', async () => {
        const replies = [
            { message: '', questions: ['db는 어느 AZ인가요?'], commands: [GENERATE] },
            { message: '', commands: [] },
        ];
        globalThis.fetch = vi.fn(async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, json: async () => replies.shift() };
        });
        const select = document.getElementById('chat-mode');
        select.value = 'generate';
        select.dispatchEvent(new Event('change'));

        await send('db 포함해서 그려줘');
        expect(requests[0].mode).toBe('generate');
        expect(requests[0]).not.toHaveProperty('architecture');
        // jsdom은 innerText를 DOM에 반영하지 않으므로 속성값으로 읽는다.
        const shown = [...document.querySelectorAll('.chat-message__bubble')].map(b => b.innerText).join('\n');
        expect(shown).toContain('db는 어느 AZ인가요?');
        expect(bridge.merge).not.toHaveBeenCalled();

        await send('AZ A에 있어요');
        expect(requests[1].conversationHistory.map(m => m.content).join('\n')).toContain('db는 어느 AZ인가요?');
    });

    test('편집 대화와 생성 대화의 기록은 서로 섞이지 않고 모드를 오가도 각자 이어진다', async () => {
        const replies = [
            { message: '편집 응답: 기존 EDIT-SECRET 서비스를 봤습니다', commands: [] },
            { message: '', questions: ['db는 어느 AZ인가요?'], commands: [] },
            { message: '', commands: [] },
            { message: '편집 계속', commands: [] },
        ];
        globalThis.fetch = vi.fn(async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, json: async () => replies.shift() };
        });
        const select = document.getElementById('chat-mode');
        const choose = value => { select.value = value; select.dispatchEvent(new Event('change')); };
        const history = i => (requests[i].conversationHistory || []).map(m => m.content).join('\n');

        await send('EDIT-REQUEST 서비스 하나 수정');
        choose('generate');
        await send('새로 그려줘');
        expect(history(1)).not.toContain('EDIT-SECRET');
        expect(history(1)).not.toContain('EDIT-REQUEST');
        await send('AZ A에 있어요');
        expect(history(2)).toContain('db는 어느 AZ인가요?');
        expect(history(2)).not.toContain('EDIT-SECRET');
        choose('edit');
        await send('편집 이어서');
        expect(history(3)).toContain('EDIT-SECRET');
        expect(history(3)).not.toContain('db는 어느 AZ인가요?');
    });

    test('새 대화 버튼은 편집과 생성 기록을 모두 지운다', async () => {
        globalThis.fetch = vi.fn(async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, json: async () => ({ message: '', questions: ['질문?'], commands: [] }) };
        });
        const select = document.getElementById('chat-mode');
        select.value = 'generate';
        select.dispatchEvent(new Event('change'));
        await send('그려줘');
        document.getElementById('btn-new-chat').click();
        await send('다시 그려줘');
        expect((requests[1].conversationHistory || [])).toEqual([]);
    });

    test('스타일을 참고할 페이지를 읽지 못하면 AI 요청 없이 안내하고, 페이지를 정한 뒤 같은 요청을 이어갈 수 있다', async () => {
        const MULTI = `<mxfile>${['a', 'b'].map(id => `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>`).join('')}</mxfile>`;
        let pageIndex = null;
        bridge.getEditingState = async () => ({ xml: MULTI, pageIndex });
        globalThis.fetch = vi.fn(async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, json: async () => ({ message: '확인', commands: [] }) };
        });
        const select = document.getElementById('chat-mode');
        select.value = 'generate';
        select.dispatchEvent(new Event('change'));

        await send('VPC에 EC2 그려줘');
        expect(globalThis.fetch).not.toHaveBeenCalled();
        const shown = [...document.querySelectorAll('.chat-message__bubble')].map(b => b.innerText).join('\n');
        expect(shown).toContain('참고할 페이지를 선택한 뒤');
        expect(bridge.merge).not.toHaveBeenCalled();

        pageIndex = 1;
        await send('VPC에 EC2 그려줘');
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(requests[0].conversationHistory.map(m => m.content).join('\n')).toContain('참고할 페이지를 선택한 뒤');
    });

    test('편집 모드는 기존대로 mode 없이 현재 그림 요약을 보낸다', async () => {
        globalThis.fetch = vi.fn(async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, json: async () => ({ message: '완료', commands: [] }) };
        });
        await send('안녕');
        expect(requests[0]).not.toHaveProperty('mode');
        expect(requests[0]).toHaveProperty('architecture');
    });
});
