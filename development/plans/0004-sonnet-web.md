# 0004 — 웹 AI Sonnet 5.5 연결

- 날짜: 2026-10-07
- 상태: 완료 — 기본 프로필 인증·실제 모델 응답·웹 S3 반영과 다운로드 검증
- 사용자 선택: “Sonet 5.5로 가자”. 다른 모델로 대체하지 않는다.
- 연결 방식: 기존 웹은 AWS Bedrock Converse다. Kiro 작업자의 로그인은 웹 인증과 별도다.

1. 공식 모델 ID와 API 호환성을 확인한다.
   [AWS 모델 카드](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html):
   runtime에서는 `global.anthropic.claude-sonnet-5-5` 추론 프로필을 사용하며 서울에서 지원한다.
   이 프로필은 글로벌 라우팅을 사용한다. 단일 리전 처리로 기록하지 않는다.
2. Compose의 기본 모델을 선택된 모델로 선언하고 명시 환경변수 override를 유지한다.
   [Anthropic 모델 안내](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)에 따라
   해당 모델에는 비기본 temperature를 보내지 않는다. adaptive thinking과 effort medium을 사용하고
   응답의 reasoning 블록 뒤 text를 읽는다. chat·평가 모두 같은 정책을 적용한다.
3. 실제 AWS 호출 없이 SDK 응답 mock으로 모델 ID·옵션·응답 추출·인증 오류 처리를 검증한다.
   전체 테스트·빌드·Docker health와 한국어 오류 안내도 확인한다.
4. 인증 방식을 사용자가 정한 뒤 해당 계정만 연결한다. 로컬 프로필이 여럿이므로 default를 임의 사용하지 않는다.
   Bedrock 프로필/SSO, Bedrock API 키, 기존 Kiro 로그인 중 사용자의 선택을 질문했다.
   키/토큰 값은 대화에 받지 않는다. 인증 연결 전 모델 추론 성공이나 KB 자연어 품질을 완료로 기록하지 않는다.

Kiro 소유: `server/index.js`, `compose.yaml`, `tests/server-sonnet.test.js`.
조율자 소유: 계획·백로그·결과·실제 Docker 확인.
회사 원본 제출, 새 AWS 프로필 선택, 자격증명 복사, 유료 추론, 커밋·푸시는 이 준비 단계에서 수행하지 않는다.

[결과](../results/2026-10-07-sonnet-setup/README.md): Docker 모델 선언·두 API의 Sonnet 호환 처리를 완료했다.
187개 테스트·빌드 통과. 실제 컨테이너는 모델 설정 상태이며 인증 미연결 503을 반환한다. 실제 추론은 미확인이다.

## 기본 프로필 연결 승인 후

사용자가 기본 AWS 프로필이 본인 계정이라고 확인했다. 기존 인증 대기 기록은 당시 상태로 보존한다.
default 프로필로만 연결하며 다른 프로필·전역 설정은 바꾸지 않는다.
AWS CLI export-credentials를 메모리로 받아 Docker 실행 환경에만 전달한다. 키를 새 파일에 쓰거나 ~/.aws 전체를 마운트하지 않는다.
먼저 고객 정보 없는 합성 요청으로 실제 Sonnet 응답과 명령 계약을 확인한다. 짧은 모델 요청은 소액 추론 비용이 발생할 수 있으며
전체 KB 원본을 제출하지 않는다. 실제 호출 횟수·성공 여부·사용량은 새 결과에 기록한다.

[실제 연결 결과](../results/2026-10-07-sonnet-live/README.md): default 인증 연결, 실제 모델 응답 4건,
웹 자연어 S3 추가와 다운로드 통과. 빈 모델 첫 merge 문제도 공통 load 경로에서 수정했다.
189개 테스트·빌드·Docker health 통과. KB 자연어 품질과 레퍼런스 생성은 B011에서 검증한다.
