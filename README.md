# DaVinci — AWS 아키텍처 다이어그램 에디터

DrawIO 임베드 모드 기반 AWS 아키텍처 다이어그램 에디터. AI Agent가 자연어로 다이어그램을 생성·수정·분석합니다.

## 주요 기능

- 자연어 채팅으로 AWS 아키텍처 다이어그램 생성 및 수정 (Amazon Bedrock)
- AWS 서비스 자동 감지, 연결 관계 분석, 카테고리 분류
- AWS Well-Architected Framework 5-Pillar 평가
- 자동 정렬: AWS Cloud > VPC > AZ > Subnet 계층 구조 배치
- 최적화 팁 엔진 (규칙 기반 모범사례 검사)
- 다이어그램 되돌리기 (스냅샷 관리)
- localStorage 자동 저장 (debounce + 페이지 종료 시 즉시 저장)

## 퀵스타트

```bash
npm install
```

`.env` 파일을 프로젝트 루트에 생성:

```
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6
ALLOWED_ORIGINS=http://localhost:5173
```

> AWS 자격 증명은 환경변수 또는 `~/.aws/credentials`로 설정하세요.

```bash
npm run dev
```

프론트엔드 `http://localhost:5173`, 백엔드 `http://localhost:3000`으로 실행됩니다.

## 명령어

| 명령어 | 설명 |
|---|---|
| `npm install` | 의존성 설치 |
| `npm run dev` | 프론트엔드 + 백엔드 동시 실행 |
| `npm run dev:frontend` | Vite 개발 서버만 실행 |
| `npm run dev:server` | Express 백엔드만 실행 (nodemon) |
| `npm run build` | 프로덕션 빌드 |
| `npm test` | 테스트 실행 (vitest --run) |

## 프로젝트 구조

```
├── index.html                     # SPA 진입점 (한국어 UI)
├── server/
│   └── index.js                   # Express 백엔드 — Bedrock AI 프록시
├── src/
│   ├── main.js                    # 앱 초기화, 브릿지·툴바·사이드바 연결
│   ├── components/                # UI 컴포넌트 (vanilla JS)
│   │   ├── toolbar.js             # 상단 툴바: 정렬, 분석, 최적화
│   │   ├── sidebar.js             # 사이드바: AI 채팅, 되돌리기
│   │   ├── align-modal.js         # 정렬 프리셋 선택 모달
│   │   ├── analysis-modal.js      # 분석 결과 모달
│   │   ├── well-architected-modal.js  # WA 평가 모달
│   │   └── toast.js               # 토스트 알림
│   ├── core/                      # 비즈니스 로직 (DOM 비의존)
│   │   ├── utils.js               # 공통 유틸리티 (escapeHtml 등)
│   │   ├── drawio-bridge.js       # draw.io iframe 통신
│   │   ├── aws-service-catalog.js # AWS 서비스 카탈로그
│   │   ├── aws-architecture-builder.js  # 계층 구조 재구성
│   │   ├── json-to-xml-builder.js # Lightweight_JSON → XML
│   │   ├── xml-summarizer.js      # XML → Lightweight_JSON
│   │   ├── layout-engine.js       # 자동 레이아웃 좌표 계산
│   │   ├── channel-router.js      # 의도 기반 채널 라우팅
│   │   ├── diagram-controller.js  # AI 커맨드 실행
│   │   ├── conversation-context.js # 대화 히스토리 관리
│   │   ├── snapshot-manager.js    # 되돌리기 스냅샷
│   │   ├── aws-analyzer.js        # 아키텍처 분석 + 최적화 규칙
│   │   └── __tests__/             # 테스트 (unit + property-based)
│   └── styles/
│       └── index.css
├── vite.config.js
└── package.json
```

## 아키텍처

- **Components → Core** 단방향 의존. Core 모듈은 component를 import하지 않음.
- **Lightweight_JSON** (`{ groups, services, connections }`)이 AI, XML 파서, 레이아웃 엔진 간 중앙 교환 포맷.
- **AI 채팅 흐름**: 사용자 메시지 → ChannelRouter → `/api/chat` → DiagramController → DrawIOBridge
- **정렬 흐름**: XML → `summarizeXml()` → `reorganizeForAlignment()` → `buildXml()` → DrawIOBridge

## 기술 스택

- Vanilla JavaScript (ES modules) — 프레임워크 없음
- Vite v6 (프론트엔드)
- Express v5 + `express-rate-limit` (백엔드)
- Amazon Bedrock Converse API (AI)
- Vitest v4 + fast-check v4 (테스트)

## 환경변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `AWS_REGION` | AWS 리전 | `us-east-1` |
| `BEDROCK_MODEL_ID` | Bedrock 모델 ID | `anthropic.claude-3-5-sonnet-20240620-v1:0` |
| `ALLOWED_ORIGINS` | CORS 허용 origin (쉼표 구분) | `http://localhost:5173` |
