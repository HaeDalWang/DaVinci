# B010 Docker (worker)
변경: Dockerfile, compose.yaml, .dockerignore (신규), server/index.js. 의존성 추가/커밋/푸시 없음.

- Dockerfile: node:22-alpine 3단계(build=vite dist, deps=--omit=dev, runtime), USER node, PORT=3000, HEALTHCHECK(/api/health). 런타임에는 server/, aws-service-catalog.js, dist, 운영 node_modules만 포함.
- compose.yaml: name davinci, 127.0.0.1:8080->3000, 호스트 env 패스스루(AWS_REGION/BEDROCK_MODEL_ID/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN, 값 없는 항목이라 호스트에 있을 때만), ~/.aws 마운트 없음, env 파일 불필요, read_only/cap_drop ALL/no-new-privileges. ALLOWED_ORIGINS=8080 origin.
- .dockerignore: `*` 후 package*.json, vite.config.js, index.html, server/, src/ 만 허용 + __tests__/.env*/*.local 제외.
- server/index.js: /api/health {status:'ok', modelConfigured}(rate limit 앞, 자격증명/런타임 준비 여부 아님), BEDROCK_MODEL_ID 암묵 기본값 제거, 미설정 시 chat/well-architected 한국어 503, maxTokens 4096(chat 32768·WA 16384 → 공통 상수; WA 응답이 길면 잘릴 수 있음 — 측정 필요), dist 있을 때만 express.static(dist), 기본 PORT 3001.
  프롬프트: add_service를 serviceType/label/group(선택)/pageId(선택)로 수정, x/y 삭제, 기존 그림에는 replace_all 대신 add_service(보존) 안내. 다른 커맨드/파서 미변경.

검증(확인됨): node --check server/index.js OK, `docker compose config --quiet` OK, 임시 Dockerfile `COPY .` 로 빌드 컨텍스트 목록 확인 — index.html, package*.json, vite.config.js, server/index.js, src 소스(components/core/main.js/styles)만 포함, 테스트·dist·development·drawio-sample·.git 등 제외(임시 이미지는 삭제). 포트 3091 임시 서버로 미설정 상태의 /api/health(modelConfigured=false)와 chat/WA 503 확인.
미실행: 실제 이미지 빌드/컨테이너 기동/UI 테스트, 실제 Bedrock 호출 (root 담당). 호스트 3000은 건드리지 않음.
참고: 서버는 listen 시 모든 인터페이스에 바인딩(기존 동작), API에 인증 없음 — compose는 127.0.0.1로만 게시.
DOCKER_SETUP_DONE
