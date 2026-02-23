import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// AWS SDK는 기본적으로 ~/.aws/credentials 또는 환경 변수(AWS_ACCESS_KEY_ID 등)를 사용합니다.
const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

app.post('/api/chat', async (req, res) => {
    const { message, architecture } = req.body;

    try {
        const systemPrompt = `당신은 AWS 아키텍처 전문가이자 개발자인 DaVinci AI Agent입니다. 
사용자의 아키텍처 논리 구조(JSON 요약본)를 분석하거나 요청에 따라 기 구축된 인프라 구성을 제안해야 합니다.

현재 사용자의 아키텍처 컴포넌트 구조:
\`\`\`json
${JSON.stringify(architecture || [], null, 2)}
\`\`\`

사용자의 아키텍처 수정 요청이 있을 경우 어떤 컴포넌트를 추가/제거해야 하는지 설명하세요. 현재는 테스트 단계이므로 수정된 내용이나 새로운 XML을 반환할 필요 없이, 무엇을 할 것인지만 텍스트로 자세하게 답변해주면 됩니다. 답변은 한국어로 작성하세요.`;

        const command = new ConverseCommand({
            modelId: MODEL_ID,
            system: [{ text: systemPrompt }],
            messages: [
                {
                    role: 'user',
                    content: [{ text: message }]
                }
            ],
            inferenceConfig: {
                maxTokens: 2048,
                temperature: 0.1,
            }
        });

        const response = await client.send(command);
        const reply = response.output.message.content[0].text;

        res.json({ reply });
    } catch (error) {
        console.error('Bedrock API 에러:', error);
        res.status(500).json({ error: 'AWS Bedrock 통신 중 서버 오류가 발생했습니다.', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AI Agent Backend running at http://localhost:${PORT}`);
});
