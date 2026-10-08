# B016 — S3 이외 서비스 추가 검증

2026-10-08. 구현·로컬 검증 완료. 사용자는 구현·반복 테스트를 크레딧 여유가 있는 Kiro에 우선 맡기도록 요청했다.
이 선호를 AGENTS.md에 기록했다. 조율자는 작업 범위·리뷰·최종 검증·개발 기록을 맡는다.

현재 main의 미커밋 구현을 그대로 검사하도록 같은 checkout에 Kiro 세션을 만들었다.
`claude-sonnet-5.5` 지원을 조회했고, 초기 화면의 high를 `/effort medium`으로 바꿔 실제 medium을 확인했다.
Run `run_e15402770292`를 만들었지만 `worker-start --terminal`은 `agent_unconfigured`로 거부됐다.
Run의 worker 목록도 비어 있었다. 구조화 Task/Dispatch 감독은 성립하지 않았으며 직접 터미널 지시로 실행 중이다.
터미널: `term_fe85deaf-c3a2-412f-a143-33c1d4d92309`. 파일 읽기·검사 실행, 완료 응답과 프롬프트 복귀를 확인했다. 세션은 후속 리뷰를 위해 유지한다.

검증 범위: EC2·RDS·Lambda의 동일 서비스 peer가 있는 경우와 없는 경우를 구분해,
스타일·크기·부모·배치 및 기존 내용·ID·연결·다른 페이지 보존을 검사한다.
필요한 수정은 controller/catalog와 기존 테스트·로컬 검증 도구로 제한한다.
고객 원본·과거 결과·PLAN.md는 유지하며 모델 호출·Docker 변경·커밋·푸시는 하지 않는다.
앞선 브라우저의 localhost 접근 거부를 다른 브라우저 경로로 우회하지 않는다.

재시작 후 Orca/graph/Docker 접근이 복구됐고 `docker compose ps`에서 컨테이너가 healthy임을 확인했다.
실제 화면·자연어 명령의 품질은 이 로컬 검증과 구분한다. 사용자는 S3 추가 화면을 완벽하다고 평가했다.

## 최종 결과와 조율자 확인

Kiro가 구현·반복 테스트를 맡았고 조율자가 변경 diff를 리뷰하고 같은 검증을 별도로 다시 실행했다.
초기 결과는 resIcon 표기만 검사해 놓친 RDS shape 누락이 있어 추가 리뷰에서 수정했다.
RDS의 `rds_instance`/`rds_postgresql_instance`와 `_alt` 표기를 인식하고 관련 줄에 함께 배치한다.
뒤쪽 peer를 확인하지 못하던 예산 문제는 peer 탐색만 고쳤고 기존 그룹 탐색 상한은 유지했다.
검증기의 잘못된 크기 필드 비교도 수정했으며 같은 peer가 스타일·크기를 동시에 만족해야 통과한다.

- 조율자가 직접 `npm test`(17파일 225개)·`npm run build`를 실행해 통과했다.
- 조율자가 보정된 검증기로 KB 7페이지 × S3·EC2·RDS·Lambda, 28건을 다시 실행해 모두 통과했다.
  기존 내용·ID·연결·다른 페이지 보존과 새로운 아이콘 겹침 0을 확인했다.
- 같은 부모에 통합된 RDS는 4/7에서 5/7로 늘었으며 홈페이지 두 페이지는 여전히 빈자리 fallback이다.
  EC2·Lambda는 KB에 대응하는 스타일 peer가 없어 실제 KB에서는 fallback 경로를 검사했다.
  네 서비스의 peer가 있는 줄 재배치는 합성 테스트로 확인했으며 전체 서비스·실제 화면 품질 보증으로 확대하지 않는다.
- 현재 코드 SHA와 [조율자 재검증](coordinator-proof.json), [테스트](coordinator-test-output.txt), [빌드](coordinator-build-output.txt)를 남겼다.
  작업자의 최종 결과는 [final-checked](final-checked/local-kb-multiservice-proof.json), 상세 전후 기록은 [보고서](worker-report.md)다.
  이전 폴더의 크기 비교는 잘못된 필드로 무효였으며 최종 보정 결과를 사용한다.
- 실행 컨테이너 파일을 읽어 카탈로그 SHA가 이전 `fcfbff1d…d5`, JS가 `index-BjiiGnjQ.js`임을 확인했다.
  이번 수정의 카탈로그는 `c4e1f279…c2e9`, 로컬 빌드는 `index-B2h2Eosv.js`다. 이번 추가 수정은 Docker에 아직 반영하지 않았다.

다음: Docker를 갱신한 환경에서 실제 화면·연결선·다운로드를 확인한다.
브라우저 접근 거부는 우회하지 않았고 AWS/Bedrock 실제 호출·커밋·푸시·Docker 변경은 수행하지 않았다.
