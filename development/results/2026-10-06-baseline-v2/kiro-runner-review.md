# baseline runner 독립 리뷰 (오류만)

범위: scripts/measure-baseline.mjs, development/fixtures/baseline/{inputs.json, multi-az.drawio, preservation.drawio}, development/tools/drawio-probe.html, development/results/2026-10-06-baseline/{baseline.json, table.md, style-probe*.json/.drawio, test-output.txt, build-output.txt}.
방법: graph `detect_changes_tool`(base=HEAD, 변경 함수 0개 — 전부 미추적 신규 파일이라 그래프에 없음), 소스 전체 읽기, baseline.json을 node로 조회, sha256 재계산. 테스트/빌드/러너는 재실행하지 않았고 저장소 파일은 수정하지 않았다.

## 확인했고 문제 없는 것
- 입력 hash: example1, test-2, multi-az, preservation 4개 모두 `shasum -a 256` 결과가 inputs.json과 일치한다. 러너는 실행 시작 시 assert로 검증한다. 출력 XML마다 `outputSha256`도 기록한다. multi-az-original.drawio는 입력 fixture와 바이트가 같다(해시 da0f64ab…).
- 재실행 metadata: baseline.json의 `sourceSha256`에 있는 scripts/layout-metrics.js, measure-baseline.mjs, inputs.json 해시가 현재 파일과 같다. 즉 offset 수정 이후 metric 소스로 측정된 결과다. codeSha(cd67320)는 HEAD와 같고 Node/npm/jsdom 버전과 명령이 기록돼 있다. 기존 결과 디렉터리는 덮어쓰지 않는다.
- 미측정 처리: explicitMetrics의 `value: cond && cond ? x : null` 우선순위는 `(a && b) ? x : null`로 동작해, primaryEdgeIds/azPairs가 비는 example1·test2·preservation은 0이 아닌 `null`(measured 0/total 0)이다. 정렬 변환 결과처럼 ID가 바뀌어 대응을 못 찾는 경우(multi-az hierarchy 등 measured 0/4, 0/3)도 null이다. 실제 좌표가 없는 교차/관통/라벨은 null+사유다.
- 명령 성공/보존/롤백은 baseline.json `commandCorrectness`에서 구분된다. 예: add-service는 success=true인데 passed=false(보존 실패), add-then-remove는 success=false(remove_service 대상 없음), rollback은 success=false이고 xml이 원본과 같다(rollbackExact=true, passed=true).
- test-output.txt(8 파일/115 테스트 = 기존 84 + 신규 31)와 build-output.txt는 baseline.json 이후(19:13:47) 실행본이며 숫자가 서로 맞는다.

## 실제 결함

### R1. 겹침 지표가 기존 두 예제에서 "시각적 포함"을 겹침으로 세어 개선처럼 보이게 만든다 (높음, 수정 필요)
- 위치: development/results/2026-10-06-baseline/table.md (example1 original 291, test2 original 153 → 변환 후 0), 각주 "부모 포함 관계는 제외한다"; 측정은 scripts/layout-metrics.js `measureXml`의 조상/자손 제외.
- 근거(baseline.json 조회): example1 original의 겹침 291쌍 중 한쪽이 다른 쪽을 완전히 포함하는 쌍이 285개, 부분 겹침은 6개뿐이다. test2는 153쌍 전부가 완전 포함(부분 겹침 0)이다. 제외 규칙은 실제 `parent` 체인뿐이라, 컨테이너 안에 그려졌지만 parent가 그 컨테이너가 아닌(최상위 형제인) 아이콘이 전부 "겹침"으로 집계된다.
- 영향: 표에서 레거시 정렬/서비스 추가 후 겹침이 291→0, 153→0으로 보이지만 그 변환들은 120개(example1)·18개(test2) ID를 잃는다. 각주가 "누락 결과는 개선으로 인정하지 않는다"고 적어 두었지만 숫자 열만 보는 독자는 "원본이 겹침투성이, 레거시가 해결"로 읽게 된다. 또 이 수치는 사용자가 의도한 포함 배치를 결함으로 세고 있어 ELK 이후 비교의 기준값으로 쓸 수 없다. 사실은 두 예제 원본에는 측정 가능한 진짜 겹침이 거의 없다(6쌍).
- 수정안: 결과를 "부분 겹침 쌍"과 "완전 포함(비부모) 쌍"으로 나눠 기록하거나(둘을 합친 값은 쓰지 않는다), 표에서 두 예제의 원본 겹침을 "포함 285 / 부분 6"처럼 분리 표기한다. 각주에 "parent 관계가 아닌 시각적 포함은 별도"라고 명시한다. 이 변경은 metric 소스(layout-metrics.js)를 건드리므로 조율자/소유자가 결정해야 한다.

### R2. table.md의 "보존 판정 통과"가 명령 실패 후 롤백된 행에도 붙어 성공으로 읽힌다 (중간, 수정 필요)
- 위치: table.md의 preservation add-then-remove 행과 rollback 행(둘 다 "통과", 5/2, 누락 0). 표에는 명령 성공 열이 없다.
- 근거: baseline.json에서 add-then-remove는 `result.success=false`, `commandCorrectness.passed=false`이고 보존 판정만 true다. 출력 XML이 롤백으로 복원된 원본과 같기 때문이다. rollback 행은 passed=true이지만 명령 자체는 의도적으로 실패한다. 세 상태(명령 성공, 보존, 롤백 정합)가 표에서는 한 열의 "통과"로 합쳐진다. 지시사항 중 "보존/명령성공/롤백 구분"이 표에서는 구분되지 않는다.
- 수정안: table.md 생성(measure-baseline.mjs 끝부분 rows)에 명령 success/expected, commandCorrectness.passed, rollbackExact 열을 추가하고, 명령이 없는 행은 "—"로 표시한다. 이미 생성된 table.md를 덮어쓰면 안 되므로 재측정은 새 디렉터리로 하거나 결과 README에서 이 열 해석을 추가 기록한다.

### R3. 브라우저 왕복 증거의 공백 (낮음~중간, 허위는 아님)
- 위치: development/results/2026-10-06-baseline/style-probe.json(`method`: "load → export → write file → fetch saved file and reload → export"), style-probe-first.json(`editorVersion: null`).
- 근거: 두 export 파일(first/second)은 바이트까지 동일하고 양쪽에서 ecs-a, ecs-b에 `davinciBaselineProbe=keep-me`가 보존된 것은 확인된다. draw.io 직렬화 형식(mxfile host, 속성 순서 변경)이라 입력 그대로의 에코도 아니다. 그러나 "write file → fetch saved file"의 중간 단계를 증명하는 산출물(저장 파일의 해시, fetch 응답, 두 번째 로드의 입력)이 저장소에 없다. 두 export가 같다는 것만 남는다. 로드마다 바뀌는 diagram id(WhboMaAE…)가 두 export에서 같은 것은 두 번째 입력이 mxfile(첫 export)였다면 설명되지만, 그 입력이 첫 export였다는 증거는 없다. editorVersion은 null이다.
- 영향: `passed: true`는 "임의 style 키 1개가 ecs 2개에서 유지됨"으로 범위가 좁게 적혀 있어 허위 주장은 아니다. 다만 "저장 파일 재로드"는 산출물로 재검증할 수 없다.
- 수정안: 결과 README에 이 한계를 적거나, 재로드에 사용한 파일의 sha256과 로드 직전/직후 이벤트 시각을 style-probe.json에 추가한다.

## 결함 아님(혼동 방지)
- multi-az original의 backwardPrimaryEdges 0, azPairOffsetDifference 0은 fixture가 대칭으로 손으로 만들어진 합성 입력이라 당연한 값이다. 레거시 품질의 증거가 아니며, 정렬 결과는 ID가 바뀌어 비교 불가(null)다. 문서에 "합성 fixture의 기준값"이라고만 적으면 된다.
- 각 변환 결과 표의 경계 상자 면적은 좌표 측정 범위가 다르다(example1 original 86/91 vs 변환 57/57). 표에 측정/전체 열이 있어 오류는 아니지만 면적을 직접 비교하지 않는 편이 안전하다.

RUNNER_REVIEW_DONE
