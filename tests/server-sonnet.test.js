// @vitest-environment node
// 서버의 Bedrock 요청 구성을 SDK mock으로 검증한다 (실제 AWS 네트워크/자격 증명 사용 없음).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: class {
        constructor() { this.send = send; }
    },
    ConverseCommand: class {
        constructor(input) { this.input = input; }
    },
}));

const SONNET = 'global.anthropic.claude-sonnet-5-5';
const OTHER = 'example.other-model-v1:0';
const TEXT = '{"message":"완료","commands":[]}';
const REASONING_THEN_TEXT = {
    output: { message: { content: [
        { reasoningContent: { reasoningText: { text: 'thinking' } } },
        { text: TEXT },
    ] } },
    stopReason: 'end_turn',
};
const ROUTES = {
    chat: ['/api/chat', { message: '안녕' }],
    'well-architected': ['/api/well-architected', {}],
};

let running;
const ENV_KEYS = ['PORT', 'BEDROCK_MODEL_ID'];
let savedEnv;

async function start(modelId) {
    vi.resetModules();
    process.env.BEDROCK_MODEL_ID = modelId;
    process.env.PORT = '0';
    const { server } = await import('../server/index.js');
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    running = server;
    return `http://127.0.0.1:${server.address().port}`;
}

async function post(base, [route, body]) {
    const res = await fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
    send.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
    if (running) await new Promise(resolve => running.close(resolve));
    running = undefined;
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    }
    vi.restoreAllMocks();
});

describe.each(Object.keys(ROUTES))('%s route', (name) => {
    test('Sonnet 5.5 omits temperature and declares adaptive thinking with medium effort', async () => {
        send.mockResolvedValue(REASONING_THEN_TEXT);
        const base = await start(SONNET);

        const res = await post(base, ROUTES[name]);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('완료');
        const input = send.mock.calls[0][0].input;
        expect(input.modelId).toBe(SONNET);
        expect(input.inferenceConfig).toEqual({ maxTokens: 4096 });
        expect(input.inferenceConfig).not.toHaveProperty('temperature');
        expect(input.additionalModelRequestFields).toEqual({
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
        });
    });

    test('other explicit models keep temperature and get no extra fields', async () => {
        send.mockResolvedValue(REASONING_THEN_TEXT);
        const base = await start(OTHER);

        await post(base, ROUTES[name]);

        const input = send.mock.calls[0][0].input;
        expect(input.modelId).toBe(OTHER);
        expect(input.inferenceConfig.temperature).toBe(name === 'chat' ? 0.1 : 0.2);
        expect(input).not.toHaveProperty('additionalModelRequestFields');
    });

    test('returns 500 when the response has no text block', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        send.mockResolvedValue({ output: { message: { content: [{ reasoningContent: { reasoningText: { text: 'x' } } }] } } });
        const base = await start(SONNET);

        const res = await post(base, ROUTES[name]);

        expect(res.status).toBe(500);
    });

    test('maps CredentialsProviderError to a Korean 503 without logging the raw error', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const err = new Error('secret-detail');
        err.name = 'CredentialsProviderError';
        send.mockRejectedValue(err);
        const base = await start(SONNET);

        const res = await post(base, ROUTES[name]);

        expect(res.status).toBe(503);
        expect(res.body.error).toContain('인증');
        expect(JSON.stringify(res.body)).not.toContain('secret-detail');
        expect(errorLog).not.toHaveBeenCalled();
    });

    test('keeps the 503 contract when no model is configured', async () => {
        const base = await start('');

        const res = await post(base, ROUTES[name]);

        expect(res.status).toBe(503);
        expect(res.body.error).toContain('BEDROCK_MODEL_ID');
        expect(send).not.toHaveBeenCalled();
    });
});
