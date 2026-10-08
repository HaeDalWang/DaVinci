# KB 서비스 추가 — 원본 보존 수정

- 범위: [B008 계획](../../plans/0002-preserve-service-addition.md). 사용자는 기존 결과가 사람 눈에 부족하다고 평가했다. 전체 재생성으로 업무 경계·선을 잃는 문제부터 고쳤다.
- 코드: `add_service`는 대상 페이지의 XML에 서비스 셀 하나를 삽입한다. 기존 위치·ID·스타일·선·표·메모·metadata와 다른 페이지를 유지한다. 현재 편집 페이지는 최신 XML export 응답에서 읽으며, 실제 편집기에는 전체 XML을 merge한다.
- 비교: Vite가 실행 중이면 [수정 전/후 비교](http://localhost:5184/development/tools/kb-comparison.html?result=preserved-addition)를 연다. 기본은 통합홈페이지 운영 Multi-AZ의 S3 추가다. 실제 파일 전체 편집 증거는 별도 [live-addition-proof.json](live-addition-proof.json)이다.

| 검사 | 결과 |
|---|---|
| 같은 36건 기준선 재측정 | 7개 페이지 추출 추가는 명령·보존 함께 통과. 2개 파일 전체 추가는 대상 페이지가 없으므로 명령 실패·원본 그대로 유지 |
| 실제 iframe에서 전체 파일의 대상 7페이지 각각 추가 | 7/7 성공, 대상 vertex +1·선 변화 0, 활성 페이지 유지 |
| 실제 편집의 모든 페이지 비교 | 25회 페이지 검사에서 기존 셀 속성·geometry·하위 XML 불변, 대상 외 페이지 불변, 페이지 ID·이름·순서 유지 |
| 추가 vertex 겹침 | 7회 모두 0. 실제 라벨과 선 경로 겹침까지 측정한 결과는 아님 |
| 전체 테스트·빌드 | 12개 파일·166개 테스트 통과, 빌드 통과. 기존 toast import 경고는 남음 |
| 비교 화면 | 9사례의 추가 결과와 공통 배율 4단계 확인. 조율자가 Multi-AZ 화면에서 기존 경계·연결 흐름 유지 확인. 사용자 시각 합격은 미확인 |

## 재현과 근거

입력과 SHA-256은 [기존 KB manifest](../../fixtures/baseline/kb-inputs.json)를 그대로 사용했다. 예전 [수정 전 기준선](../2026-10-07-kb-baseline/README.md)은 보존했다.
현재 코드는 미커밋이며 HEAD만으로 재현할 수 없다. `baseline.json`·`live-addition-proof.json`의 파일별 SHA-256으로 실행 코드를 구분한다.

```sh
node scripts/measure-kb-baseline.mjs <새-결과-디렉터리>
# localhost:5184에서 development/tools/drawio-probe.html을 연 뒤 Orca page ID 지정
python3 development/tools/verify-kb-addition.py <새-결과-디렉터리> <page-id>
python3 development/tools/render-kb-baseline.py <새-결과-디렉터리> <page-id>
npm test
npm run build
```

[baseline.json](baseline.json)·[table.md](table.md)는 개수·hash·보존/명령 판정, [render-proof.json](render-proof.json)은 SVG 출처,
[roundtrip-proof.json](roundtrip-proof.json)은 두 원본 전체 파일의 XML 왕복, [comparison-proof.json](comparison-proof.json)은 비교 화면 검사다.
원문 XML·SVG·스크린샷은 gitignore된 `private.local/`에만 저장했다.
실제 편집 비교는 draw.io가 원본을 로드하고 export한 상태를 기준으로 삼는다. native 정규화 전 입력과 byte-identical하다는 뜻은 아니다.
동일한 원본이 유지되는지는 별도 원본 왕복과 추출 진단으로도 확인했다.

Kiro는 `claude-sonnet-5.5`·`medium` 화면을 확인하고 컨트롤러·합성 검사를 구현했다. 오래된 idle 터미널은 입력 실행을 확인할 수 없어 종료하고 새 터미널의 실제 작업 시작을 확인했다.
[작업자 보고](kiro-worker-report.md)·[bridge 리뷰](kiro-bridge-review.md)를 조율자가 검토했다.
실제 KB 검사에서 발견한 커스텀 root/레이어 ID·다중 레이어를 보완했고, 리뷰에서 발견한 merge 동시 요청·지연 응답 혼동도 수정했다.
초기 검증 후보는 무시되는 `*-attempt*.local/`에 남겼으며 최종 판정에 사용하지 않았다.

최신 XML·페이지와 응답 메시지 형식, merge 프로토콜은 [draw.io 공식 embed 문서](https://www.drawio.com/docs/reference/embed-mode/)와 실제 응답으로 확인했다.

## 남은 문제와 다음 작업

- 계층/좌→우 정렬의 18건은 여전히 보존 실패다. 이 수정은 서비스 추가만 고친다.
- 그룹을 지정하지 않으면 기존 영역 아래에 추가한다. 자동으로 VPC·AZ·서브넷을 추론하지 않는다. 그룹은 현재 경계 안 빈 자리만 사용하며 상대 geometry·알 수 없는 geometry·자리 부족은 거부한다. 그룹 탐색 상한은 20,000회다.
- 새 vertex 사각형 겹침만 확인했다. B007에서 실제 SVG의 선 교차·아이콘 관통·라벨 겹침을 측정하고, 경계를 유지하는 정렬을 검증해야 한다.
- XML 조회와 반영 사이에 사람이 동시에 편집하면 충돌할 수 있다. iframe이 준비되지 않으면 응답 타임아웃으로 실패한다. 동시 편집 잠금·자동 복구는 이번 범위에 넣지 않았다.
- 정렬 품질과 아키텍처 의미가 합격됐다고 판정하지 않는다. 사용자 피드백과 후속 계획은 [백로그](../../backlog.md)로 이어간다.

커밋·푸시·AWS/Bedrock 호출은 하지 않았다.
