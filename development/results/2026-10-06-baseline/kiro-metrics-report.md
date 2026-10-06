# B004 측정 모듈 작업 보고

## 변경 파일 (소유권 내 2개만)
- `scripts/layout-metrics.js` (신규): `measureXml(xml)`, `comparePreservation(before, after, opts)` ESM export.
- `tests/layout-metrics.test.js` (신규): Vitest 31개.
제품 소스, 의존성, 설정, 커밋은 건드리지 않았다. 전역 `DOMParser`를 호출 시점에 사용한다(러너가 jsdom 전역 설정 필요; vitest jsdom 환경에서는 자동).

## graph 사용
`get_architecture_overview_tool` 1회 호출(4개 커뮤니티, HEAD=cd67320과 일치 확인). 신규 모듈이라 그래프에 없으며 제품 코드는 읽지 않았다.

## API 상태: 지시한 형태 그대로. 추가/명확화한 필드
- `measureXml` 반환: `cells, counts, overlapCount, overlapPairs, boundingBox, geometryCoverage, edgeCoverage`(지시대로).
  - 추가: `geometryCoverage.reasons` = `{id: 사유}`. 사유값: `missing-geometry`, `relative-geometry`, `unsupported-rotation`, `unsupported-skew`, `unsupported-offset`, `invalid-geometry`, `non-positive-size`, `unresolved-parent`, `parent-unmeasured`, `parent-cycle`.
  - 추가: `edgeCoverage.danglingReferences` (존재하지 않는 ID를 가리키는 source/target 개수).
  - `cells[].geometry`는 문자열(canonical): 속성 정렬, 숫자 정규화(10.0→10), 값이 0인 x/y/width/height 생략. 자식(points) 순서는 유지.
- `comparePreservation` 반환: 지시한 배열들 + `preservationPassed`. 추가: `expectedRemovedStillPresentIds`(기대 제거 ID가 남아 있음; 위반 아님, 보고만), `geometryChangesIgnored`.

## 동작 결정 (문서화)
- `total`(geometryCoverage)은 vertex 셀 수. 루트/레이어 셀(vertex도 edge도 아닌 셀)은 geometry 불필요.
- 부모가 vertex가 아닌 셀(레이어)이면 원점 (0,0). 부모가 edge이거나 존재하지 않으면 `unresolved-parent`.
- 원점 계산은 크기와 분리: 폭 0인 부모도 자식 원점은 해석되나, 부모가 relative/회전/skew/순환/부모 미해석이면 자식은 `parent-unmeasured`.
- `rotation`/`skew` 스타일 키가 360의 배수가 아니면 미측정(보수적으로 180도도 포함하지 않음—360 배수만 허용).
- `<object>`/`<UserObject>` 래퍼: 래퍼의 id/label을 셀 id/value로 사용.
- 겹침은 사각형 프록시, 엄격 양의 교집합, 조상/자손 쌍 제외(부모 체인 순환 가드). 쌍은 문서 순서.
- `comparePreservation`의 style은 문자열 그대로 비교(속성 순서가 다른 style은 변경으로 본다). geometry만 canonical 비교.
- 선 교차/노드 관통/주 흐름/AZ 대칭은 구현하지 않았다(필드 없음). 러너가 null로 보고해야 함.
- 거부(예외): 비어 있거나 잘못된 XML, 알 수 없는 루트, mxfile 안 mxGraphModel이 정확히 1개가 아닌 경우(압축 포함), root 요소 없음, id 없는 셀, 중복 ID.

## 실제 실행
- `npx vitest run tests/layout-metrics.test.js` → 1 파일, 31 passed, 0 failed (후속 수정 후 재실행).
- 뮤테이션 확인 1건: 겹침 판정을 `<`에서 `<=`로 임시 변경 → "touching boundaries are not overlap" 1개 실패 확인 후 원복, 재실행 30 passed(초기 버전 기준).
- 전체 `npm test`, `npm run build`, 실제 예제 파일(example1/test-2) 측정은 실행하지 않았다(러너/조율자 몫).

## 후속 수정 (offset)
- non-relative `mxGeometry`에 `mxPoint as="offset"`이 있으면 `unsupported-offset`으로 미측정 처리한다. 자손은 `parent-unmeasured`. relative 지오메트리는 기존대로 `relative-geometry`가 먼저 적용된다.
- 회귀 검사 1개 추가(offset 부모 + 자식): reasons가 `{off: unsupported-offset, kid: parent-unmeasured}`이고 boundingBox가 null인지 확인.
- 코드 상단 주석과 JSDoc 2개를 줄였다. 기존 테스트는 유지했다.

## 측정 한계 (이번 범위)
- named style(stylesheet로 지정된 스타일)로 들어오는 회전·skew 등은 알 수 없다. 셀 `style` 문자열에 직접 적힌 `rotation`/`skew`만 인식하므로, named style로 회전된 꼭짓점은 회전 없는 사각형으로 측정될 수 있다.

## 테스트가 다루는 것
중첩 절대좌표, 조상 제외 vs 형제 겹침(깊은 중첩 포함), 경계 접촉, x/y 생략=0, 경계 상자/null, mxfile 1개, object 래퍼, relative/누락/0크기/회전/부모 미해석 및 자손 미측정, 부모 순환, 선 표현 커버리지 분류, 잘못된 입력 7종, 보존 비교(포맷 변경 무시, 동일 개수 ID 교체, ID 재사용, kind/parent 변경, 엔드포인트 변경, 정렬 geometry 허용/불허, 허용해도 누락 불가, 기대 제거, 추가는 위반 아님, 레이어 제외).

## 알려진 한계
- 라벨 범위·실제 도형 모양·회전 180도는 미지원(사각형 프록시, 보수적 미측정).
- 압축 mxfile(diagram 텍스트)은 거부한다.
- 실제 예제 파일에 대해 돌려 보지 않았으므로 커버리지 비율 등은 미확인.
- 파일들은 아직 미추적(`??`) 상태이며 커밋하지 않았다.
