# DaVinci — AWS 아키텍처 다이어그램 에디터

DrawIO 임베드 모드 기반 AWS 아키텍처 다이어그램 에디터. AI Agent가 다이어그램을 직접 생성·수정·분석합니다.

## 퀵스타트

```bash
npm install
```

`.env` 파일을 프로젝트 루트에 생성:

```
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-6-20260217-v1:0
```

> AWS 자격 증명은 환경변수 또는 `~/.aws/credentials`로 설정하세요.

```bash
npm run dev
```

프론트엔드 `http://localhost:5173`, 백엔드 `http://localhost:3000`으로 실행됩니다.

## 테스트

```bash
npm test
```
