# 웹 Sonnet 5.5 설정과 인증 대기

2026-10-07, B013 준비 완료·인증 연결 대기. 사용자 모델 선택을 반영했으며 실제 모델 추론 성공은 미확인이다.

- Docker 기본 모델: `global.anthropic.claude-sonnet-5-5`, 기존 리전 `ap-northeast-2`, effort `medium`.
  명시한 `BEDROCK_MODEL_ID` 환경변수는 기본값을 덮어쓴다.
- [AWS 모델 카드](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html)에
  명시된 Converse·글로벌 추론 프로필을 사용한다. 글로벌 라우팅이며 서울 한 리전 안의 처리로 기록하지 않는다.
- [Anthropic 모델 안내](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)에 맞춰 해당 모델의
  비기본 temperature를 제거하고 adaptive thinking을 사용한다. 두 API 경로 모두 reasoning 뒤의 text 블록을 읽는다.
- Bedrock API 키 환경변수 `AWS_BEARER_TOKEN_BEDROCK`도 Compose에서 전달할 수 있다.
  실제 키는 읽거나 출력하지 않았다. 설치 SDK의 환경변수 지원은 소스로 확인했다.
- [전체 테스트](test-output.txt): **15개 파일·187개 통과**. 신규 10개는 실제 로컬 HTTP와 SDK mock으로
  모델 옵션·reasoning 뒤 텍스트·인증 오류·타 모델 설정 유지·미설정 계약을 검증한다. 실제 AWS 추론은 없다.
- [빌드](build-output.txt)·[Docker 이미지 빌드](docker-build-output.txt) 성공.
- [실제 컨테이너 확인](runtime-proof.json): `modelConfigured=true`, 인증 환경변수와 AWS 설정 마운트는 없다.
  chat·평가 요청은 자격 증명 해석 단계에서 한국어 인증 미연결 안내와 503을 반환한다.
- [Kiro 보고](kiro-worker.md). 주 에이전트가 최종 소스·테스트·컨테이너를 직접 확인했다.

현재 웹은 <http://localhost:8080>다. 사용자는 새로고침 후 다시 요청할 수 있으나 인증 연결 전에는 추론되지 않는다.
인증은 Bedrock 프로필/SSO, Bedrock API 키, 기존 Kiro 로그인 중 무엇으로 연결할지 질문한 상태다.
로컬의 여러 AWS 프로필 중 default를 임의 선택하거나 자격 증명을 컨테이너에 복사하지 않았다.
Kiro 로그인으로 웹을 사용하려면 별도 연결 구현이 필요하며 지금의 Bedrock 경로에 자동 적용되지 않는다.
키/토큰은 대화로 받지 않는다. 인증을 연결한 뒤 먼저 합성 입력으로 실제 모델 응답을 확인하고,
레퍼런스 편집 보존과 출력 길이를 측정한다. adaptive thinking을 포함한 4096 출력 토큰 한도는 실제 호출로 아직 측정하지 않았다.

이전 [Docker 사용 결과](../2026-10-07-docker-use/README.md)의 모델 미설정 상태는 당시 기록으로 보존한다.
커밋·푸시·회사 서버 배포·실제 모델 추론은 하지 않았다.
