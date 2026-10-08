# KB 기준선 러너 작업 보고

## 변경 (소유 파일 2개만, 둘 다 신규)
- `scripts/measure-kb-baseline.mjs`: `node scripts/measure-kb-baseline.mjs <새 출력 디렉터리> [manifest | --manifest manifest]`. 기본 manifest는 `development/fixtures/baseline/kb-inputs.json`. 기존 `measureXml`/`comparePreservation`, 실제 `summarizeXml`/`reorganizeForAlignment`/`buildXml`/`DiagramController`/`SnapshotManager`, 설치된 jsdom만 사용했다(새 패키지 없음).
- `tests/kb-baseline.test.js`: 합성 다중 페이지 fixture 통합 테스트 8개(고객 입력 미사용).
- 기존 러너, 제품 코드, 문서, `.gitignore`, fixture manifest는 수정하지 않았다. 커밋/푸시/AWS 호출 없음.

## 출력 구조
- 페이지 추출 진단 7×4=28건(`scope: page-extracted`, 파일 전체 동작이 아님을 `scopeNotes`와 table.md 각주에 명시) + 전체 파일 진단 2×4=8건(`scope: whole-file`, 원본 mxfile을 변환 함수에 그대로 전달).
- `private.local/xml/<key>.drawio`(원본 XML, 페이지 원본은 페이지 ID/이름을 유지한 1페이지 mxfile), `private.local/measurements/<key>.json`(전체 측정값). 그 밖의 `baseline.json`/`table.md`에는 개수·해시·커버리지·교집합 분류(부분/포함/동일)·불투명 ID 배열·오류 분류 코드만 넣었다(셀 값·스타일·페이지 이름·입력 경로·명령 메시지·경고 문자열·`git status` 목록 없음; dirty는 개수+해시). 변환 중 콘솔 출력은 숨기고 횟수만 센다.
- xmlFile은 출력 디렉터리 기준 `private.local/...` 상대 경로.
- 교차/관통/라벨/렌더 경로/bridge/iframe은 측정하지 않았고 `scopeNotes.notMeasured`에 적었다. 타이밍은 변환 1회 ms(분포 아님).

## 조율자 검토 반영 (steering 4건)
1. 전체 파일 `pageStructure`가 페이지 ID·이름·순서를 모두 검증한다. `identityOrderPreserved` 추가, `preservation.passed`는 이것이 거짓이면 실패한다. ID만 일치한 페이지 수는 `preservedPages`로 따로 둔다.
2. 명령 기록을 `observedSuccess`(명령 반환), `markerAdded`(표지 1개 추가 확인), `rollbackExact`, `passed`(관찰 성공 && 표지 추가 && 보존 통과)로 분리했다. 이전 `correct` 필드는 제거했다.
3. `KB_BASELINE_DEBUG` 분기를 제거했다. 예기치 못한 오류는 `Error: unexpected failure (<이름>)`만 출력한다.
4. manifest 검증: 입력 id는 `/^[a-zA-Z0-9_-]+$/`이고 유일해야 한다. pages는 비어 있지 않아야 하며 페이지 ID는 비어 있지 않고 파일 내에서 유일해야 한다. 서로 다른 페이지의 같은 셀 ID는 허용한다.

추가로, 변환 결과가 중복 ID 등으로 측정 불가일 때는 `status: output-invalid`와 `errorCode`(`duplicate-ids`/`output-unparseable`/`output-not-measurable`), 원시 개수(`outputInventory`)를 남긴다. 변환 중 예외는 `product-failed`/`transform-threw`이다. 이 둘은 제품 관찰이므로 종료 코드는 0이다. 입력 hash·페이지 ID/이름/순서·형식·페이지 내 중복 ID 위반 등 하네스 입력 오류는 출력 디렉터리를 만들기 전에 종료 코드 1로 중단한다.

## 검증 (실제 실행)
- `npx vitest run tests/kb-baseline.test.js` → 8 passed. 확인한 것: 페이지 2×4+전체 4 기록과 라벨, 서로 다른 페이지의 같은 셀 ID 허용(각 페이지 별도 측정), 전체 파일 original은 보존되고 변환 출력은 단일 모델로 축소되어 페이지 손실 2·`identityOrderPreserved=false`, 명령 성공과 보존 실패의 분리(`passed=false`, `correct` 없음), 민감 표지(라벨·스타일·페이지 이름)가 `private.local` 밖 파일에 없고 안에는 있음, 출력 파일 해시 일치, 기존 출력 덮어쓰기 거부, hash 불일치/페이지 순서·이름·개수 불일치/깨진 XML/페이지 내 중복 ID/안전하지 않은 입력 ID/중복 입력 ID/빈 페이지 목록/중복·빈 페이지 ID 거부와 출력 디렉터리 미생성.
- 실제 KB 입력으로 `/tmp`에 1회 실행 후 삭제: 36건 기록, 모두 `measured`(측정 불가 출력 0), 페이지 추출 28건 전부 측정됨, 전체 파일 original은 페이지 ID/이름/순서 유지, 전체 파일 hierarchy/horizontal/add-service는 모두 단일 모델로 축소(kb-ra 4페이지 손실, kb-homepage 3페이지 손실), add-service는 관찰 성공·표지 추가 1개지만 계약 통과는 거짓. 산출물의 바깥 파일에서 파일명·셀 값은 확인하지 않았다(개수와 분류 코드만 조회).
- 전체 `npm test`/`npm run build`는 실행하지 않았다(범위 밖).

## 알려진 한계
- `identityOrderPreserved`가 거짓이 되는 경우는 합성 테스트에서 "단일 모델로 축소"뿐이다. 변환이 mxfile을 내면서 페이지 이름·순서만 바꾸는 경우를 만들 수단이 없어 그 분기는 단위 검증 없이 코드로만 구현했다.
- 전체 파일 출력이 단일 모델이면 출력 셀을 원본 페이지에 대응시키지 않으며, 페이지 간 평탄화 비교는 하지 않았다.
- 페이지 ID는 불투명하다고 보고 `baseline.json`에 남겼다. 셀 ID 배열도 같다. 이 가정이 틀리면 공유 전 확인이 필요하다.
- 사용자 시각 판정, 교차/관통/라벨 지표(B007), bridge/iframe 동작은 범위 밖이다.

KB_BASELINE_WORKER_DONE
