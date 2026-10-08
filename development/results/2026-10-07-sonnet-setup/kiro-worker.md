# Sonnet 5.5 호환 준비 (worker)
AWS/Kiro 추론·STS·자격증명 조회·프로필 선택 없음. 커밋/푸시 없음. 수정: server/index.js, compose.yaml, 신규 tests/server-sonnet.test.js.

- compose.yaml: `BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID:-global.anthropic.claude-sonnet-5-5}`(호스트 env로 덮어쓰기 유지), `AWS_BEARER_TOKEN_BEDROCK` 패스스루(값 없는 항목). `docker compose config --quiet` 통과. config 출력은 모델 ID와 토큰 키 이름(null)만 확인.
- server/index.js:
  - 모델 ID가 `anthropic.claude-sonnet-5-5`를 포함하면(global./리전 접두사 포함) 두 route 모두 inferenceConfig={maxTokens:4096}(temperature 없음) + additionalModelRequestFields={thinking:{type:'adaptive'}, output_config:{effort:'medium'}}. 다른 명시 모델은 기존(temperature 0.1/0.2) 유지, 추가 필드 없음.
  - 공통 `buildModelOptions`, `extractText`(text 블록만 이어 붙임, reasoning 선행 가능, text 없으면 오류→500), `sendBedrockError`(CredentialsProviderError → 한국어 503 "AWS 인증이 연결되지 않았습니다…", 원문 로그/노출 없음; 그 외는 기존 500+로그).
  - 미설정 503 계약 유지. `export const server = app.listen(...)` 추가(테스트용 종료 핸들).
- 테스트: tests/server-sonnet.test.js 10개 통과(SDK mock, 네트워크 없음) — 두 route 각각 modelID/temperature 부재/thinking·effort, 타 모델 설정 유지, reasoning 뒤 text 추출, text 없음 500, 인증오류 503+원문 미로그, 미설정 503. compose 문자열 검사는 제거(조율자가 컨테이너 메타데이터로 검증). PORT/BEDROCK_MODEL_ID는 각 테스트 후 원래 값(미설정이면 삭제)으로 복구.
- AWS_BEARER_TOKEN_BEDROCK (설치 SDK 소스 문자열 확인만, 실제 키 조회 없음): 설치된 @aws-sdk/client-bedrock-runtime 3.995.0의 runtimeConfig가 signingName "bedrock"으로 smithy.api#httpBearerAuth를 지원하고 fromEnvSigningName 사용, @aws-sdk/core getBearerTokenEnvKey = `AWS_BEARER_TOKEN_${signingName 대문자}` → AWS_BEARER_TOKEN_BEDROCK (confirmed in source).
- 주의(hypothesis, 미측정): adaptive thinking의 thinking 토큰이 maxTokens(4096)에 포함되면 긴 JSON 응답(특히 Well-Architected, replace_all)이 잘릴 수 있다. 실제 호출로 측정해 maxTokens 조정 필요. 공식 문서의 Converse 필드 수용(additionalModelRequestFields 경유)은 문서 기준이며 이 세션에서 실호출로 확인하지 않음. effort 값/위치는 지시된 사양 그대로.
- 최종 재실행: `npx vitest --run tests/server-sonnet.test.js` 직접 실행 exit 0, 10 tests passed.
SONNET_SETUP_DONE
