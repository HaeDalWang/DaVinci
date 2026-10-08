# 기존 그림에 서비스 추가 통합

2026-10-07. [계획 0005](../../plans/0005-integrated-addition.md).
사용자 화면에서 새 S3가 그림 아래에 떨어지고 기존 아이콘보다 컸다.
group 미지정의 바깥 배치·카탈로그 기본 스타일이 원인이었다.

- 같은 서비스가 있으면 기존 아이콘의 부모·크기·색·글꼴을 참고해 주변 빈자리에 추가한다.
  가까운 격자부터 반경 400px, 전체 탐색 20,000회·최대 10개 참고 아이콘으로 제한한다.
  실제 사용한 참고 아이콘의 스타일을 적용하며 label은 html=0으로 처리한다.
- 여러 레이어의 요소를 장애물로 확인한다. 기존 아이콘을 둘러싼 배경·계정 테두리는
  장애물에서 제외하되 새 아이콘도 그 경계 안에 유지한다. 잠금·숨김 아이콘은 참고하지 않는다.
  명시적 group은 우선하며 잠금·숨김 대상은 거부한다. 기존 셀·geometry·연결·ID는 수정하지 않는다.
- 서버 프롬프트도 group 생략의 새 동작을 설명하고, 무관한 VPC/subnet 지정과 실행 전 성공 단정을 막았다.

## 확인 결과

- [실제 iframe 검사](live-addition-proof.json): 전체 KB 파일의 7개 대상 페이지 모두
  새 셀 1개만 추가, 기존 셀 하위 XML·다른 페이지·연결 보존 통과.
- 기존 S3가 있는 4개 페이지: 새 아이콘 50×50px, 기존 스타일·부모 일치.
  참고 S3와 거리 60~72.12px. 홈페이지 개발·운영 페이지 모두 계정 영역 내부에 추가됐다.
  [로컬 전후 비교](http://localhost:5184/development/results/2026-10-07-integrated-addition/private.local/comparison.html)를
  화면으로 확인했다. 사용자 최종 시각 판정은 아직 받지 않았다.
- 아이콘 사각형 충돌 0. 계정·배경 안에 놓인 의도적인 사각형 포함 관계 2개는 별도로 기록했다.
  기존 지표 코드는 변경하지 않았다. 실제 선 관통·라벨 겹침 지표는 B007에서 미완료다.
- 기존 S3가 없는 3개 페이지는 기존 안전 fallback(78px·그림 바깥)을 유지했다.
  새 서비스 종류의 위치 추론이나 전체 정렬 품질까지 완료한 것은 아니다.
- [테스트](test-output.txt): 16개 파일, **203개 테스트 통과**. [빌드](build-output.txt) 통과.
  [Docker](runtime-proof.json)는 기본 AWS 프로필 실행 도구로 재빌드해 healthy 상태다.
  이 작업에서 모델 호출은 0건이며 고객 그림을 추가 모델 요청으로 제출하지 않았다.
- 실제 빌드된 Docker 웹에서도 [합성 응답의 S3 통합](docker-integration-proof.json)과
  [파일 열기·선택 페이지 추가·다운로드·되돌리기](browser-use-proof.json)를 확인했다.
  이 검사의 모델 응답만 mock이며 편집기와 제품 버튼은 실제로 실행했다.

## 재현과 작업자 검증

`python3 development/tools/verify-kb-addition.py <새-result-dir> <drawio-probe-page-id> --integrated`
는 probe를 새로고침한 뒤 같은 전체 파일의 7페이지를 검사한다. 원시 XML·SVG·화면은
gitignore된 `private.local/`에 두었다. 기존 결과와 루트 PLAN.md는 수정하지 않았다.

Kiro Sonnet 5.5·medium 화면과 실제 작업 시작을 확인했다.
worker-start는 agent_unconfigured여서 Task/Dispatch 감독 대신 터미널로 지시·검토했다.
[작업자 보고](kiro-worker-report.md)를 조율자가 검토하고 전체 테스트·실제 KB 검사를 직접 실행했다.
검토에서 참고 아이콘과 상속 스타일의 불일치, 명시적 group의 잠금 처리를 보완했다.
실제 KB 검사에서는 AWS 테두리가 container=0인 시각적 프레임이라 배경 판별에서 빠지는 경우를 찾아 수정했다.
초기 실패는 [첫 검사 기록](attempt1-proof.json)과 무시되는 attempt1~3.local 원시 파일에 보존했다.
합성 container=1 테스트만으로 실제 그림을 합격 처리하지 않았다.

사용자는 기존의 떨어진 S3를 되돌린 다음 웹을 새로고침하고 같은 요청을 다시 실행할 수 있다.
이미 추가한 셀을 자동 재배치하지는 않는다. 커밋·푸시는 하지 않았다.
