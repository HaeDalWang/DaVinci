# 기본 AWS 프로필로 Sonnet 5.5 실제 연결

2026-10-07. 사용자가 본인 default 프로필 사용을 확인한 뒤 연결했다.
`global.anthropic.claude-sonnet-5-5`, adaptive thinking, effort medium.

- 기본 프로필 STS와 서울 리전의 추론 프로필 ACTIVE를 확인했다. 계정·키·ARN은 기록하지 않았다.
- `python3 development/tools/start-docker-with-default-aws.py`로 Docker를 재빌드했다.
  AWS CLI가 default 자격 증명을 메모리로 반환하고 Docker 실행 환경에만 전달한다.
  키 파일 생성·전체 ~/.aws 마운트·다른 프로필 설정 변경은 하지 않았다.
- 실제 API HTTP 200과 실제 웹 자연어 → S3 아이콘 → 다운로드 XML의 vertex 1개, edge 0개를 확인했다.
  최종 검사는 수동 파일 로드 없이 새 웹 세션의 빈 그림에서 실행했다. 화면에서도 S3와 라벨을 확인했다.
- 16개 테스트 파일, **189개 테스트 통과**, 빌드 통과, Docker health 정상.
  KB 원본은 모델에 제출하지 않았다. KB 자연어 품질과 새 아키텍처 전체 생성 품질은 미측정이다.

## 발견한 문제와 수정

첫 요청은 빈 `AWS_BEARER_TOKEN_BEDROCK` 변수가 존재해 SDK 서명이 실패했다.
Kiro 읽기 전용 리뷰에서 원인을 짚었고, 조율자가 기본 프로필 실행 도구에서 해당 변수를 제거했다.
현재 인증은 세션 토큰·만료 시각 없는 기본 프로필이다. 자격 증명 변경 시 실행 도구로 컨테이너를 다시 만든다.
리뷰 이후의 수정 요청은 Kiro에서 실행을 확인하지 못했으며, 해당 터미널을 닫고 조율자가 수정했다.

또한 페이지 ID 없는 단독 `mxGraphModel`을 처음 열면 draw.io 첫 merge가 성공 응답을 주면서
새 셀을 반영하지 않았다. 합성 입력으로 0→0을 재현했고, 같은 모델에 페이지 ID를 주면 0→1이었다.
공통 bridge의 두 load 경로에서만 페이지 wrapper를 추가했다. 기존 mxfile은 그대로 전달하고 모델 하위 XML을 유지한다.
회귀 테스트 실패를 먼저 확인한 뒤 수정했으며, 새 세션에서 실제 모델 요청과 저장 결과까지 다시 통과했다.

## 근거와 호출 범위

- [API 응답](api-smoke-proof.json), [최종 실제 웹 검사](browser-smoke-proof.json), [런타임](runtime-proof.json)
- [첫 merge 재현](first-merge-reproduction.json), [명시적 페이지 대조 검사](browser-stable-page-proof.json)
- [Kiro 인증 리뷰](kiro-auth-review.md), [테스트](test-output.txt), [빌드](build-output.txt)
- 웹 요청 총 5건: 실제 모델 응답 성공 4건, 모델 호출 전 로컬 서명 실패 1건.
  모두 고객 정보 없는 S3 한 개 추가 요청이다. 토큰 사용량·정확한 비용은 미측정(null)이다.
  화면·원시 XML은 gitignore된 `private.local/`에 둔다.
- 재현: 새 합성 브라우저 origin을 열고
  `python3 development/tools/verify-sonnet-web.py <orca-page-id> <새-result-dir>`.
  이 검사는 실제 유료 추론을 호출하므로 고객 그림이 열린 탭에서 실행하지 않는다.

사용: [localhost:8080](http://localhost:8080)을 새로고침하고 그림을 연 뒤
“기존 구성은 유지하고 로그 보관용 S3 하나 추가해줘”라고 입력한다.
이후에는 B011 레퍼런스를 이용한 생성 품질, B009 보존 정렬을 이어간다. 커밋·푸시는 하지 않았다.
