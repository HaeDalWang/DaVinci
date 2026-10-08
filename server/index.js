import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAllServicesAsJSON } from '../src/core/aws-service-catalog.js';
import { parseQuestions } from '../src/core/generation-flow.js';

dotenv.config();

const app = express();

// CORS: 허용 origin 제한
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS }));

app.use(express.json({ limit: '5mb' }));

const MODEL_ID = (process.env.BEDROCK_MODEL_ID || '').trim();
const MODEL_NOT_CONFIGURED_MESSAGE =
    'AI 모델이 설정되지 않았습니다. 서버 환경변수 BEDROCK_MODEL_ID를 지정한 뒤 다시 실행해주세요.';
// 보수적인 출력 한도: 모델별로 지원 범위가 달라 큰 기본값은 요청 자체를 실패시킬 수 있다.
const MAX_OUTPUT_TOKENS = 4096;

// Claude Sonnet 5.5는 temperature를 기본값 외로 보내면 400이고 adaptive thinking이 기본 켜진다.
// 그래서 temperature를 빼고 thinking/effort는 별도 필드로 명시한다. 다른 모델은 기존 설정을 유지한다.
const IS_SONNET_5_5 = /anthropic\.claude-sonnet-5-5/.test(MODEL_ID);
const SONNET_5_5_MODEL_FIELDS = {
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
};
const CREDENTIALS_NOT_CONNECTED_MESSAGE =
    'AWS 인증이 연결되지 않았습니다. AWS 자격 증명 또는 AWS_BEARER_TOKEN_BEDROCK을 서버 환경에 설정한 뒤 다시 실행해주세요.';

/** Converse 요청의 모델별 추론 설정 */
function buildModelOptions(temperature) {
    if (IS_SONNET_5_5) {
        return {
            inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS },
            additionalModelRequestFields: SONNET_5_5_MODEL_FIELDS,
        };
    }
    return { inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS, temperature } };
}

/** 응답의 text 블록만 이어 붙인다 (첫 블록이 reasoning일 수 있다). text가 없으면 오류. */
function extractText(response) {
    const blocks = response?.output?.message?.content;
    const text = Array.isArray(blocks)
        ? blocks.filter(b => typeof b?.text === 'string').map(b => b.text).join('')
        : '';
    if (!text) throw new Error('Bedrock 응답에 text 블록이 없습니다.');
    return text;
}

/** 인증 미연결은 안내 503으로, 그 외는 일반 500으로 응답한다. 인증 오류 원문은 기록하지 않는다. */
function sendBedrockError(res, error, logLabel, fallbackMessage) {
    if (error?.name === 'CredentialsProviderError') {
        return res.status(503).json({ error: CREDENTIALS_NOT_CONNECTED_MESSAGE });
    }
    console.error(logLabel, error);
    return res.status(500).json({ error: fallbackMessage });
}

// 상태 확인: 모델 ID 설정 여부만 알려준다. 자격 증명이나 Bedrock 호출 가능 여부는 확인하지 않는다.
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', modelConfigured: MODEL_ID !== '' });
});

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
params: { "serviceType": "ec2", "label": "Web Server", "group": "컨테이너 그룹 id (선택)", "pageId": "대상 페이지 id (선택)" }
- serviceType: 아래 서비스 카탈로그의 type 값 (필수)
- label: 표시할 라벨 (선택, 없으면 기본 라벨)
- group: 사용자가 특정 위치를 요청했을 때 서비스를 넣을 현재 페이지의 컨테이너 그룹 id (선택). 기존 같은 서비스가 있는 줄에 크기·색·글꼴을 맞춰 추가하고 필요한 주변 아이콘의 위치도 함께 정리합니다. 줄을 정리할 자리가 없으면 가까운 빈자리나 안전한 기본 위치를 사용합니다.
- 기존 스타일을 유지하는 단순 추가 요청에서는 group을 임의 지정하지 마세요. S3처럼 VPC 밖에서 쓰는 서비스를 무관한 subnet이나 VPC에 넣지 마세요.
- pageId: 대상 페이지 id (선택). 생략하면 현재 보고 있는 페이지에 추가됩니다.
- 좌표(x, y)는 지정하지 않습니다. 위치는 시스템이 기존 요소와 겹치지 않게 정합니다. 배치·저장 성공은 클라이언트가 확인하므로 message에서 이미 추가 완료되었다고 단정하지 말고 어떤 변경을 요청했는지 설명하세요.
- 이미 그려진 다이어그램에 서비스를 더할 때는 replace_all이 아니라 add_service를 사용하세요. 기존 템플릿은 변경할 수 있습니다. add_service는 관련 서비스 줄의 위치를 정리하면서 기존 요소의 내용·ID·연결 관계·다른 영역과 페이지를 유지합니다.

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
- 기존 그림을 유지한 채 변경하는 요청에는 replace_all을 사용하지 마세요. 그림 전체를 새로 만들거나 사용자가 명시적으로 교체를 요청한 경우에만 replace_all을 사용하세요.
- **절대로 drawio XML을 직접 생성하지 마세요.** replace_all 커맨드 사용 시 params.architecture에 Lightweight_JSON 객체를 넣으세요. params.xml은 사용하지 마세요.
- 현재 아키텍처에 존재하지 않는 서비스에 대해 remove_service 또는 remove_connection 커맨드를 생성하지 마세요.
- 커맨드의 serviceType은 반드시 위 서비스 카탈로그에 정의된 type 값을 사용하세요.
- "message" 필드는 간결하게 작성하세요 (최대 3~5문장). 상세 설명보다 핵심 요약에 집중하세요. commands가 포함된 응답에서 message가 너무 길면 응답이 잘릴 수 있습니다.
- 응답은 반드시 한국어로 작성하세요.`;
}

/**
 * 새 그림 생성 모드 전용 프롬프트. 기존 편집 커맨드는 알려주지 않는다.
 * 선택한 페이지의 내용은 보내지 않는다(스타일 참고는 클라이언트가 코드로 처리하며 요구사항이 아니다).
 */
function buildGenerationPrompt() {
    const serviceCatalog = JSON.stringify(getAllServicesAsJSON(), null, 2);

    return `당신은 AWS 아키텍처 구조를 정리하는 DaVinci AI Agent입니다.
사용자가 새 그림을 요청하면, 사용자가 말한 사실만 구조화된 JSON으로 옮깁니다. 그림은 시스템이 그립니다.

## 응답 형식
반드시 순수 JSON 텍스트만 반환하세요. 마크다운 코드블록을 쓰지 마세요.

{
  "message": "짧은 한국어 설명 (최대 3문장)",
  "questions": ["사용자에게 물어볼 질문"],
  "commands": [
    { "type": "generate_architecture",
      "params": { "title": "새 페이지 이름(선택)", "architecture": { "groups": [], "services": [], "connections": [] } } }
  ]
}

- 지원하는 커맨드는 generate_architecture 하나뿐입니다. add_service, replace_all 등은 쓰지 마세요.
- 질문이 하나라도 있으면 "commands"는 반드시 빈 배열 []로 두고 "questions"에 질문만 적으세요.
- 질문이 없고 구조가 충분히 명시되었을 때만 generate_architecture를 한 번 반환하세요.

## architecture 규칙
- groups: { "id", "type", "label", "children": [하위 그룹 id 또는 서비스 id] }. type: aws_cloud | vpc | az | subnet_public | subnet_private | asg | eks_cluster
- services: { "id", "type", "label", "group": 소속 그룹 id 또는 null }. type은 아래 카탈로그의 값만 쓰세요.
- connections: { "from", "to", "label"(선택) }. from/to는 서비스 또는 그룹 id입니다.
- id는 영문·숫자·_ . - 로 된 짧은 문자열이며 모두 서로 달라야 합니다. "0"과 "1"은 쓰지 마세요.
- 서비스가 그룹 밖(최상위)이면 "group": null 로 명시하세요. 그룹이 있는데 소속을 모르겠으면 질문하세요.
- 사용자가 연결을 말하지 않았으면 "connections" 키를 아예 빼고 연결을 질문하세요. 사용자가 연결이 없다고 말한 경우에만 "connections": [] 로 두세요.

## 절대 하지 말 것
- 사용자가 말하지 않은 AZ, 서브넷, 서비스, 연결, 보안 구성을 모범사례라는 이유로 만들어 넣지 마세요. 필요해 보이면 질문이나 제안(message)으로만 말하세요.
- 선택한 페이지의 기존 내용은 이 대화에 없습니다. 기존 그림의 리소스를 요구사항으로 가정하지 마세요.
- 구조가 너무 커서 한 번에 다 담기 어렵다면 일부만 만들지 말고, 규모를 줄이거나 나누어 요청해 달라고 questions 없이 message로 안내하고 commands를 []로 두세요.
- drawio XML을 직접 만들지 마세요.

## 사용 가능한 AWS 서비스 카탈로그

\`\`\`json
${serviceCatalog}
\`\`\`

응답은 반드시 한국어로 작성하세요.`;
}

/** 생성 모드 응답을 정리한다: 잘렸으면 아무것도 실행하지 않고, 질문이 있으면 질문만 남긴다. */
function finishGenerationResponse(parsed, stopReason) {
    if (stopReason === 'max_tokens' || parsed._truncated) {
        return {
            message: '요청한 구조가 너무 커서 응답이 중간에 끊겼습니다. 일부만 그리지 않고 아무것도 실행하지 않았습니다. 규모를 줄이거나 나누어 다시 요청해주세요.',
            commands: [],
            questions: [],
            truncated: true,
        };
    }
    const { ok, questions } = parseQuestions(parsed.questions);
    if (!ok) {
        // 형식이 잘못된 questions를 "질문 없음"으로 보고 commands를 실행하면 안 된다.
        return { message: '응답의 질문 형식이 올바르지 않아 아무것도 실행하지 않았습니다. 같은 요청을 다시 보내주세요.', commands: [], questions: [], invalid: true };
    }
    return { message: parsed.message, commands: questions.length > 0 ? [] : parsed.commands, questions };
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
            return { message: parsed.message, commands: [], ...(Array.isArray(parsed.questions) && { questions: parsed.questions }) };
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
    if (!MODEL_ID) return res.status(503).json({ error: MODEL_NOT_CONFIGURED_MESSAGE });

    const { message, architecture, channel, conversationHistory, mode } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'message 필드는 필수입니다.' });
    }
    if (mode !== undefined && mode !== 'edit' && mode !== 'generate') {
        return res.status(400).json({ error: 'mode는 edit 또는 generate여야 합니다.' });
    }
    const generating = mode === 'generate';

    try {
        // 시스템 프롬프트 구성
        // 생성 모드는 현재 그림의 내용을 모델에 보내지 않는다(선택 페이지는 표현 참고일 뿐 요구사항이 아니다).
        const systemPrompt = generating
            ? buildGenerationPrompt()
            : buildBaseSystemPrompt() + buildArchitectureContext(channel, architecture);

        // 대화 히스토리 + 현재 메시지
        const messages = buildMessages(conversationHistory, message);

        const command = new ConverseCommand({
            modelId: MODEL_ID,
            system: [{ text: systemPrompt }],
            messages,
            ...buildModelOptions(0.1),
        });

        const response = await client.send(command);
        const reply = extractText(response);

        // 응답이 토큰 한도로 잘렸는지 확인
        const stopReason = response.stopReason;
        if (stopReason === 'max_tokens') {
            console.warn('[Chat] 응답이 max_tokens로 잘렸습니다. 응답 길이:', reply.length);
        }

        // Command_Response 파싱 (유효하지 않은 JSON이면 텍스트 폴백)
        const commandResponse = parseCommandResponse(reply);

        if (generating) return res.json(finishGenerationResponse(commandResponse, stopReason));

        if (commandResponse._truncated) {
            console.warn('[Chat] JSON 파싱 실패 — message만 추출됨 (응답 잘림 가능성)');
        }

        res.json(commandResponse);
    } catch (error) {
        sendBedrockError(res, error, 'Bedrock API 에러:', 'AWS Bedrock 통신 중 서버 오류가 발생했습니다.');
    }
});

// ---------------------------------------------------------------------------
// POST /api/well-architected — Well-Architected 평가 엔드포인트
// ---------------------------------------------------------------------------

app.post('/api/well-architected', async (req, res) => {
    if (!MODEL_ID) return res.status(503).json({ error: MODEL_NOT_CONFIGURED_MESSAGE });

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
            ...buildModelOptions(0.2),
        });

        const response = await client.send(command);
        const reply = extractText(response);

        const parsed = parseCommandResponse(reply);
        res.json(parsed);
    } catch (error) {
        sendBedrockError(res, error, 'Well-Architected 평가 에러:', 'Well-Architected 평가 중 서버 오류가 발생했습니다.');
    }
});

// ---------------------------------------------------------------------------
// 서버 시작
// ---------------------------------------------------------------------------

// 빌드된 웹(dist)만 정적으로 제공한다. 개발 중 dist가 없으면 API만 동작한다.
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    app.use(express.static(DIST_DIR));
}

const PORT = process.env.PORT || 3001;
export const server = app.listen(PORT, () => {
    console.log(`AI Agent Backend running at http://localhost:${PORT}`);
});
