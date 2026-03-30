import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAllServicesAsJSON } from '../src/core/aws-service-catalog.js';

dotenv.config();

const app = express();

// CORS: 허용 origin 제한
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS }));

app.use(express.json({ limit: '5mb' }));

// Rate limiting: 분당 30회 제한
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api/', apiLimiter);

const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

// ---------------------------------------------------------------------------
// 시스템 프롬프트 빌더
// ---------------------------------------------------------------------------

/**
 * Command_Response JSON 스키마 및 커맨드 타입 설명을 포함하는 기본 시스템 프롬프트를 생성한다.
 */
function buildBaseSystemPrompt() {
    const serviceCatalog = JSON.stringify(getAllServicesAsJSON(), null, 2);

    return `당신은 AWS 아키텍처 전문가이자 개발자인 DaVinci AI Agent입니다.
사용자의 아키텍처를 분석하고, 요청에 따라 다이어그램을 직접 수정할 수 있습니다.

## 응답 형식 (Command_Response JSON)

모든 응답은 반드시 아래 JSON 형식으로 반환하세요.
절대로 마크다운 코드블록(\`\`\`)으로 감싸지 마세요. 순수 JSON 텍스트만 반환하세요.

{
  "message": "텍스트 응답 (분석 결과, 수정 사유 등)",
  "commands": [
    {
      "type": "커맨드 타입",
      "params": { }
    }
  ]
}

- 분석/조언만 필요한 경우: "commands"를 빈 배열 []로 반환
- 다이어그램 수정이 필요한 경우: "commands"에 실행할 커맨드를 포함하고 "message"에 수정 사유를 설명

## 사용 가능한 커맨드 타입

### add_service
서비스를 다이어그램에 추가합니다.
params: { "serviceType": "ec2", "label": "Web Server", "x": 400, "y": 300 }
- serviceType: 아래 서비스 카탈로그의 type 값
- label: 표시할 라벨
- x, y: 다이어그램 내 좌표

### remove_service
서비스를 다이어그램에서 제거합니다.
params: { "serviceId": "mxCell id", "label": "대상 서비스 라벨" }
- serviceId 또는 label 중 하나로 대상을 식별

### add_connection
두 서비스 간 연결을 추가합니다.
params: { "sourceLabel": "소스 서비스 라벨", "targetLabel": "타겟 서비스 라벨", "label": "연결 라벨(선택)" }

### remove_connection
두 서비스 간 연결을 제거합니다.
params: { "sourceLabel": "소스 서비스 라벨", "targetLabel": "타겟 서비스 라벨" }

### replace_all
전체 다이어그램을 교체합니다.
params: { "architecture": { "groups": [...], "services": [...], "connections": [...] } }
- architecture: Lightweight_JSON 객체 (아래 스키마 참조). 절대로 XML 문자열을 넣지 마세요.

## 사용 가능한 AWS 서비스 카탈로그

\`\`\`json
${serviceCatalog}
\`\`\`

## Lightweight_JSON 스키마

다이어그램을 생성하거나 수정할 때는 반드시 아래 Lightweight_JSON 포맷을 사용하세요.
**절대로 drawio XML을 직접 생성하지 마세요.** 시스템이 Lightweight_JSON을 자동으로 drawio XML로 변환합니다.

{
  "groups": [
    { "id": "string", "type": "GroupType", "label": "string", "children": ["서비스 또는 하위 그룹 id"] }
  ],
  "services": [
    { "id": "string", "type": "서비스 카탈로그의 type 값", "label": "string", "group": "소속 그룹 id (선택)" }
  ],
  "connections": [
    { "from": "소스 id", "to": "타겟 id", "label": "연결 라벨 (선택)", "style": "커스텀 엣지 스타일 (선택)" }
  ]
}

GroupType: 'vpc' | 'subnet_public' | 'subnet_private' | 'az' | 'asg' | 'aws_cloud' | 'eks_cluster'

- groups: VPC, 서브넷, AZ, EKS 클러스터 등 컨테이너 그룹 정의. children에 포함된 서비스/그룹 id를 자식으로 배치합니다.
  - **EKS 클러스터**: type을 'eks_cluster'로 설정하면 EKS 클러스터 그룹으로 렌더링됩니다. EKS 워커 노드, Fargate 프로파일, 파드 등을 children으로 포함하세요. EKS는 절대 서비스(services)가 아닌 그룹(groups)으로 표현해야 합니다.
- services: AWS 서비스 노드 정의. type은 반드시 아래 서비스 카탈로그의 type 값을 사용하세요.
- connections: 서비스/그룹 간 연결선 정의. from/to는 services 또는 groups의 id를 참조합니다.

## AWS 모범사례 가이드라인

아키텍처 조언 시 다음 모범사례를 고려하세요:
- **고가용성**: Multi-AZ 배포, Auto Scaling Group, 다중 리전 고려
- **보안 계층**: WAF → Shield → ALB → Security Group → NACL 순서의 다층 보안
- **네트워크 분리**: Public/Private 서브넷 분리, NAT Gateway를 통한 아웃바운드 트래픽
- **모니터링**: CloudWatch 메트릭/알람, CloudTrail 감사 로그, VPC Flow Logs
- **데이터 보호**: KMS 암호화, Secrets Manager, 전송 중 암호화(TLS)
- **비용 최적화**: 적절한 인스턴스 타입, Reserved/Spot 인스턴스, S3 수명주기 정책
- **느슨한 결합**: SQS/SNS를 활용한 비동기 통신, EventBridge 이벤트 기반 아키텍처

## 제약 조건

- 응답은 반드시 순수 JSON 텍스트로만 반환하세요. 마크다운 코드블록(\`\`\`json ... \`\`\`)이나 기타 포맷팅을 절대 사용하지 마세요.
- **절대로 drawio XML을 직접 생성하지 마세요.** replace_all 커맨드 사용 시 params.architecture에 Lightweight_JSON 객체를 넣으세요. params.xml은 사용하지 마세요.
- 현재 아키텍처에 존재하지 않는 서비스에 대해 remove_service 또는 remove_connection 커맨드를 생성하지 마세요.
- 커맨드의 serviceType은 반드시 위 서비스 카탈로그에 정의된 type 값을 사용하세요.
- "message" 필드는 간결하게 작성하세요 (최대 3~5문장). 상세 설명보다 핵심 요약에 집중하세요. commands가 포함된 응답에서 message가 너무 길면 응답이 잘릴 수 있습니다.
- 응답은 반드시 한국어로 작성하세요.`;
}

/**
 * 채널 유형과 아키텍처 데이터에 따라 컨텍스트 섹션을 추가한다.
 */
function buildArchitectureContext(channel, architecture) {
    if (!architecture) return '';

    if (channel === 'xml') {
        // Lightweight_JSON 포맷으로 전달 (Channel Router가 이미 JSON으로 변환하여 전달)
        const jsonData = typeof architecture === 'string' ? architecture : JSON.stringify(architecture, null, 2);
        return `\n\n## 현재 아키텍처 (Lightweight_JSON)\n\n\`\`\`json\n${jsonData}\n\`\`\`\n\n위 Lightweight_JSON의 groups, services, connections 구조를 참조하여 정확한 서비스 ID와 연결 관계를 파악하세요.\nreplace_all 커맨드 사용 시 architecture 필드에 Lightweight_JSON 객체를 넣으세요. XML을 직접 생성하지 마세요.`;
    }

    // summary 채널 (기본)
    const summaryData = typeof architecture === 'string' ? architecture : JSON.stringify(architecture, null, 2);
    return `\n\n## 현재 아키텍처 요약\n\n\`\`\`json\n${summaryData}\n\`\`\``;
}


/**
 * Well-Architected 평가 전용 시스템 프롬프트를 생성한다.
 */
function buildWellArchitectedPrompt(architecture) {
    const archContext = buildArchitectureContext('summary', architecture);

    return `당신은 AWS Well-Architected Framework 전문 평가자입니다.
사용자의 현재 아키텍처를 AWS Well-Architected Framework의 5개 Pillar 기준으로 분석하세요.
${archContext}

## 응답 형식

반드시 아래 JSON 형식으로 응답하세요.
절대로 마크다운 코드블록(\`\`\`)으로 감싸지 마세요. 순수 JSON 텍스트만 반환하세요.

{
  "message": "전체 평가 요약 텍스트",
  "wellArchitected": {
    "pillars": [
      {
        "pillar": "운영 우수성",
        "score": 3,
        "rationale": "점수 근거 설명",
        "recommendations": [
          {
            "text": "개선 권장사항 설명",
            "commands": []
          }
        ]
      }
    ]
  },
  "commands": []
}

## 평가 기준

5개 Pillar 각각에 대해 1~5점으로 평가하세요:
1. **운영 우수성** (Operational Excellence): 모니터링, 로깅, 자동화, IaC 수준
2. **보안** (Security): 암호화, 접근 제어, 네트워크 분리, 감사 로그
3. **안정성** (Reliability): Multi-AZ, Auto Scaling, 장애 복구, 백업
4. **성능 효율성** (Performance Efficiency): 적절한 서비스 선택, 캐싱, CDN
5. **비용 최적화** (Cost Optimization): 적절한 인스턴스 타입, 스토리지 계층화, 예약 인스턴스

## 점수 기준
- 1점: 해당 Pillar 관련 구성 요소가 거의 없음
- 2점: 기본적인 구성만 존재
- 3점: 일부 모범사례 적용
- 4점: 대부분의 모범사례 적용
- 5점: 모범사례를 완벽히 적용

각 권장사항의 commands 배열에는 해당 개선을 자동 적용할 수 있는 다이어그램 커맨드를 포함하세요.
응답은 반드시 한국어로 작성하세요.`;
}

// ---------------------------------------------------------------------------
// 대화 히스토리를 Bedrock Converse API messages 형식으로 변환
// ---------------------------------------------------------------------------

function buildMessages(conversationHistory, currentMessage) {
    const messages = [];

    if (Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory) {
            if (msg.role && msg.content) {
                messages.push({
                    role: msg.role,
                    content: [{ text: msg.content }],
                });
            }
        }
    }

    // 현재 사용자 메시지 추가
    messages.push({
        role: 'user',
        content: [{ text: currentMessage }],
    });

    return messages;
}

// ---------------------------------------------------------------------------
// Command_Response 파싱 헬퍼
// ---------------------------------------------------------------------------

function parseCommandResponse(text) {
    // 마크다운 코드블록( ```json ... ``` )으로 감싸진 경우 벗겨낸다
    let cleaned = text.trim();
    const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
    }

    try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed.message === 'string' && Array.isArray(parsed.commands)) {
            return parsed;
        }
        // message 필드가 있지만 commands가 없는 경우
        if (typeof parsed.message === 'string') {
            return { message: parsed.message, commands: [] };
        }
        // 유효한 Command_Response가 아닌 JSON
        return { message: text, commands: [] };
    } catch {
        // JSON 파싱 실패 — 응답이 잘렸을 수 있으므로 복구 시도

        // 1단계: 잘린 JSON을 닫아서 commands 배열까지 복구 시도
        const commandsRecovered = tryRecoverTruncatedCommands(cleaned);
        if (commandsRecovered) {
            return { ...commandsRecovered, _truncated: true };
        }

        // 2단계: message 필드만이라도 추출
        const msgMatch = cleaned.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (msgMatch) {
            return {
                message: msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                commands: [],
                _truncated: true,
            };
        }
        return { message: text, commands: [] };
    }
}

/**
 * 잘린 JSON에서 완전한 commands 항목을 복구한다.
 * replace_all 같은 큰 커맨드가 잘렸을 때, 완전한 커맨드만 추출한다.
 */
function tryRecoverTruncatedCommands(text) {
    // message 필드 추출
    const msgMatch = text.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!msgMatch) return null;

    const message = msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // commands 배열 시작 위치 찾기
    const commandsStart = text.indexOf('"commands"');
    if (commandsStart === -1) return null;

    const arrayStart = text.indexOf('[', commandsStart);
    if (arrayStart === -1) return null;

    // 완전한 커맨드 객체들을 하나씩 추출 (중괄호 매칭)
    const commands = [];
    let i = arrayStart + 1;
    while (i < text.length) {
        // 다음 객체 시작 찾기
        const objStart = text.indexOf('{', i);
        if (objStart === -1) break;

        // 중괄호 매칭으로 완전한 객체 찾기
        let depth = 0;
        let objEnd = -1;
        for (let j = objStart; j < text.length; j++) {
            if (text[j] === '{') depth++;
            else if (text[j] === '}') {
                depth--;
                if (depth === 0) {
                    objEnd = j;
                    break;
                }
            }
        }

        if (objEnd === -1) break; // 불완전한 객체 — 여기서 중단

        try {
            const cmdObj = JSON.parse(text.substring(objStart, objEnd + 1));
            if (cmdObj.type && cmdObj.params) {
                commands.push(cmdObj);
            }
        } catch {
            break; // 파싱 실패 — 여기서 중단
        }

        i = objEnd + 1;
    }

    if (commands.length > 0) {
        return { message, commands };
    }

    return null;
}

// ---------------------------------------------------------------------------
// POST /api/chat — 메인 채팅 엔드포인트
// ---------------------------------------------------------------------------

app.post('/api/chat', async (req, res) => {
    const { message, architecture, channel, conversationHistory } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'message 필드는 필수입니다.' });
    }

    try {
        // 시스템 프롬프트 구성
        const basePrompt = buildBaseSystemPrompt();
        const archContext = buildArchitectureContext(channel, architecture);
        const systemPrompt = basePrompt + archContext;

        // 대화 히스토리 + 현재 메시지
        const messages = buildMessages(conversationHistory, message);

        const command = new ConverseCommand({
            modelId: MODEL_ID,
            system: [{ text: systemPrompt }],
            messages,
            inferenceConfig: {
                maxTokens: 32768,
                temperature: 0.1,
            },
        });

        const response = await client.send(command);
        const reply = response.output.message.content[0].text;

        // 응답이 토큰 한도로 잘렸는지 확인
        const stopReason = response.stopReason;
        if (stopReason === 'max_tokens') {
            console.warn('[Chat] 응답이 max_tokens로 잘렸습니다. 응답 길이:', reply.length);
        }

        // Command_Response 파싱 (유효하지 않은 JSON이면 텍스트 폴백)
        const commandResponse = parseCommandResponse(reply);

        if (commandResponse._truncated) {
            console.warn('[Chat] JSON 파싱 실패 — message만 추출됨 (응답 잘림 가능성)');
        }

        res.json(commandResponse);
    } catch (error) {
        console.error('Bedrock API 에러:', error);
        res.status(500).json({
            error: 'AWS Bedrock 통신 중 서버 오류가 발생했습니다.',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/well-architected — Well-Architected 평가 엔드포인트
// ---------------------------------------------------------------------------

app.post('/api/well-architected', async (req, res) => {
    const { architecture, conversationHistory } = req.body;

    try {
        const systemPrompt = buildWellArchitectedPrompt(architecture);

        const messages = buildMessages(
            conversationHistory,
            '현재 아키텍처에 대한 AWS Well-Architected Framework 평가를 수행해주세요.',
        );

        const command = new ConverseCommand({
            modelId: MODEL_ID,
            system: [{ text: systemPrompt }],
            messages,
            inferenceConfig: {
                maxTokens: 16384,
                temperature: 0.2,
            },
        });

        const response = await client.send(command);
        const reply = response.output.message.content[0].text;

        const parsed = parseCommandResponse(reply);
        res.json(parsed);
    } catch (error) {
        console.error('Well-Architected 평가 에러:', error);
        res.status(500).json({
            error: 'Well-Architected 평가 중 서버 오류가 발생했습니다.',
        });
    }
});

// ---------------------------------------------------------------------------
// 서버 시작
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AI Agent Backend running at http://localhost:${PORT}`);
});
