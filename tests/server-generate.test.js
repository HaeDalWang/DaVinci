// @vitest-environment node
// 생성 모드의 서버 동작을 SDK mock으로 검증한다 (실제 AWS 호출 없음).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: class { constructor() { this.send = send; } },
    ConverseCommand: class { constructor(input) { this.input = input; } },
}));

const reply = (text, stopReason = 'end_turn') => ({ output: { message: { content: [{ text }] } }, stopReason });
const GENERATE = { type: 'generate_architecture', params: { architecture: { services: [], connections: [] } } };

let running;
let savedEnv;
async function start() {
    vi.resetModules();
    process.env.BEDROCK_MODEL_ID = 'example.other-model-v1:0';
    process.env.PORT = '0';
    const { server } = await import('../server/index.js');
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    running = server;
    return `http://127.0.0.1:${server.address().port}`;
}
async function chat(base, body) {
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
}

beforeEach(() => {
    savedEnv = { PORT: process.env.PORT, BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID };
    send.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
    if (running) await new Promise(resolve => running.close(resolve));
    running = undefined;
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    vi.restoreAllMocks();
});

describe('POST /api/chat mode=generate', () => {
    test('생성 전용 프롬프트를 쓰고 현재 그림 내용을 모델에 보내지 않는다', async () => {
        send.mockResolvedValue(reply(JSON.stringify({ message: '질문', questions: ['연결이 있나요?'], commands: [] })));
        const base = await start();

        await chat(base, { message: 'VPC에 EC2 그려줘', mode: 'generate', architecture: { services: [{ label: 'CUSTOMER-SECRET' }] }, channel: 'xml' });

        const system = send.mock.calls[0][0].input.system[0].text;
        expect(system).toContain('generate_architecture');
        expect(system).toContain('만들어 넣지 마세요');
        expect(system).not.toContain('### add_service');
        expect(system).not.toContain('### replace_all');
        expect(system).not.toContain('CUSTOMER-SECRET');
    });

    test('질문과 commands가 함께 오면 질문만 남기고 commands는 비운다', async () => {
        send.mockResolvedValue(reply(JSON.stringify({ message: '확인', questions: ['db는 어느 AZ인가요?'], commands: [GENERATE] })));
        const base = await start();

        const { body } = await chat(base, { message: '그려줘', mode: 'generate' });

        expect(body.questions).toEqual(['db는 어느 AZ인가요?']);
        expect(body.commands).toEqual([]);
    });

    test('형식이 잘못된 questions는 "질문 없음"으로 보지 않고 commands를 비운다', async () => {
        const base = await start();
        for (const questions of ['db는 어느 AZ?', [{ q: 1 }], [''], {}]) {
            send.mockResolvedValue(reply(JSON.stringify({ message: '확인', questions, commands: [GENERATE] })));

            const { body } = await chat(base, { message: '그려줘', mode: 'generate' });

            expect(body.commands).toEqual([]);
            expect(body.invalid).toBe(true);
        }
    });

    test('questions: []와 문자열 배열은 정상 형식이다', async () => {
        const base = await start();
        send.mockResolvedValue(reply(JSON.stringify({ message: '준비', questions: [], commands: [GENERATE] })));
        expect((await chat(base, { message: 'x', mode: 'generate' })).body.commands).toEqual([GENERATE]);
        send.mockResolvedValue(reply(JSON.stringify({ message: '확인', questions: ['a?'], commands: [GENERATE] })));
        expect((await chat(base, { message: 'x', mode: 'generate' })).body.commands).toEqual([]);
    });

    test('commands만 있고 질문이 없으면 그대로 전달한다', async () => {
        send.mockResolvedValue(reply(JSON.stringify({ message: '준비', commands: [GENERATE] })));
        const base = await start();

        const { body } = await chat(base, { message: '그려줘', mode: 'generate' });

        expect(body.commands).toEqual([GENERATE]);
        expect(body.questions).toEqual([]);
    });

    test('max_tokens로 잘리면 어떤 커맨드도 실행하지 않도록 비운다', async () => {
        send.mockResolvedValue(reply(JSON.stringify({ message: '완료', commands: [GENERATE] }), 'max_tokens'));
        const base = await start();

        const { body } = await chat(base, { message: '큰 구조', mode: 'generate' });

        expect(body.commands).toEqual([]);
        expect(body.truncated).toBe(true);
        expect(body.message).toContain('아무것도 실행하지 않았습니다');
    });

    test('잘린 JSON에서 복구된 일부 커맨드도 실행하지 않는다', async () => {
        const clipped = `{"message":"만들게요","commands":[${JSON.stringify(GENERATE)},{"type":"generate_arch`;
        send.mockResolvedValue(reply(clipped));
        const base = await start();

        const { body } = await chat(base, { message: '큰 구조', mode: 'generate' });

        expect(body.commands).toEqual([]);
        expect(body.truncated).toBe(true);
    });

    test('알 수 없는 mode는 거부하고 모델을 호출하지 않는다', async () => {
        const base = await start();

        const { status } = await chat(base, { message: 'x', mode: 'replace' });

        expect(status).toBe(400);
        expect(send).not.toHaveBeenCalled();
    });

    test('mode가 없으면 기존 편집 프롬프트와 응답 형식을 그대로 쓴다', async () => {
        send.mockResolvedValue(reply(JSON.stringify({ message: '완료', commands: [] })));
        const base = await start();

        const { body } = await chat(base, { message: '안녕', architecture: { services: [] }, channel: 'summary' });

        expect(send.mock.calls[0][0].input.system[0].text).toContain('### add_service');
        expect(body).toEqual({ message: '완료', commands: [] });
    });
});
