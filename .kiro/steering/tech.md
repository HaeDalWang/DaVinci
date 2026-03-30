# Tech Stack & Build

## Runtime & Language

- Vanilla JavaScript (ES modules, no TypeScript, no framework)
- Node.js backend (Express v5)
- `"type": "module"` in package.json — all imports use ESM syntax

## Frontend

- Vite v6 (dev server on port 5173, build to `dist/`)
- Plain HTML/CSS/JS — no React, Vue, or other UI framework
- draw.io embedded via iframe using JSON postMessage protocol
- Inter font from Google Fonts

## Backend

- Express v5 with CORS (origin 제한: `ALLOWED_ORIGINS` 환경변수)
- `express-rate-limit` — API rate limiting (분당 30회)
- Amazon Bedrock (`@aws-sdk/client-bedrock-runtime`) using the Converse API
- Two endpoints: `POST /api/chat`, `POST /api/well-architected`
- Runs on port 3000

## Security

- CORS origin을 `ALLOWED_ORIGINS` 환경변수로 제한 (기본: `http://localhost:5173`)
- API rate limiting 적용 (`express-rate-limit`)
- 서버 에러 응답에 내부 상세 정보 미노출
- draw.io iframe postMessage targetOrigin을 `https://embed.diagrams.net`으로 제한

## Testing

- Vitest v4 with jsdom environment
- fast-check v4 for property-based testing
- Test files live in `src/core/__tests__/`
- Naming: `*.test.js` for unit tests, `*.property.test.js` for property-based tests

## Dev Dependencies

- `concurrently` — runs frontend + backend in parallel
- `nodemon` — auto-restarts backend on changes

## Common Commands

```bash
npm install          # Install dependencies
npm run dev          # Start both frontend (5173) and backend (3000)
npm run dev:frontend # Start only Vite dev server
npm run dev:server   # Start only Express backend with nodemon
npm run build        # Production build via Vite
npm test             # Run tests once (vitest --run)
```

## Environment Variables

Configured via `.env` in project root:

- `AWS_REGION` — AWS region (default: us-east-1)
- `BEDROCK_MODEL_ID` — Bedrock model identifier
- `ALLOWED_ORIGINS` — 쉼표 구분 허용 origin 목록 (default: `http://localhost:5173`)
- AWS credentials via environment or `~/.aws/credentials`
