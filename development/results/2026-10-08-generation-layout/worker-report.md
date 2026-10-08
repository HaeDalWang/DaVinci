# 생성 배치 개선 보고 (B022 첫 단계)

모델/effort: claude-sonnet-5.5 / medium. 구조화 Dispatch 없음(agent_unconfigured), 직접 실행. git·AWS·모델·브라우저·배포 동작은 하지 않았다. 아이콘 수정(AWS_SHAPE)은 그대로다.

## 구현 (신규 생성 경로에만 적용, 레거시 기본값 불변)
- `layout-engine.js`: `calculateLayout(json, { tiered: true })`일 때만 `computeTieredGroup` 사용.
  - public/private 서브넷만 자식인 그룹(AZ)은 서브넷을 위아래로 쌓음(public 위, 간격 40).
  - 같은 타입의 형제 그룹(AZ들)은 너비·높이·대응 행 높이를 최댓값으로 맞춤(비대칭 개수는 있는 행만 정렬).
  - 자식 그룹과 직속 서비스가 함께 있으면 직속 서비스를 오른쪽 한 열에 세로로 두고 자식 블록 높이의 가운데에 맞춤.
  - 서브넷이 아닌 그룹 타입(vpc, eks_cluster, asg 등)은 기존 가로 배치. 템플릿 아이콘 크기(`serviceSizes`)는 그대로 사용.
- `edge-router.js`(신규 102줄, 일반 라우터 아님): 두 경우만 명시적 포트·경유점을 만든다.
  1. 위아래로 쌓인 형제 서브넷의 서비스끼리: 서브넷 오른쪽(없으면 왼쪽) 여백의 세로 통로.
  2. 중첩 그룹 서비스 → 조상 그룹 직속 오른쪽 열 서비스: 자기 서브넷 **위쪽** 틈새(y−15)를 먼저, 안 되면 아래쪽(+15) 틈새를 지나 대상 왼쪽 20px 앞에서 대상 높이로 이동.
  다른 서비스 아이콘(+라벨 영역)·그룹 라벨 띠를 지나는 후보는 버리고, 둘 다 안 되면 null(기존 `orthogonalEdgeStyle` 유지).
- `json-to-xml-builder.js`: `routeEdges` 옵션. 경로가 있는 연결은 자동 라우팅 키(edgeStyle/orthogonalLoop/jettySize/rounded)를 빼고 `rounded=0` + `exit/entry X/Y/Dx/Dy/Perimeter`와 `<Array as="points">` 경유점을 씀. 입력 연결에 `style`이 있으면 그대로 존중.
- `architecture-generator.js`: 두 옵션(`tiered`, `routeEdges`)을 `buildXml`에 전달하는 한 줄.
- 공유 호출부 확인: `calculateLayout`/`buildXml`은 `aws-architecture-builder`·`diagram-controller replace_all`·기존 테스트에서 옵션 없이 호출 → 결과 불변(옵션 없는 레거시 회귀 테스트 + 기존 전체 테스트 통과).

## 전후 증거 (공개 명시 입력: 서비스 5, 그룹 8, 연결 4)
| 항목 | 전 | 후 |
|---|---|---|
| 서브넷 | AZ 안에서 가로(public-a 120,270 / private-a 358,270) | 위아래 (public 120,270 / private 120,548), AZ A·C 같은 행·너비 |
| 전체 크기 | cloud 1192×816 | cloud 874×906 |
| 로그 S3 | VPC 아래 왼쪽 (40,668) | VPC 오른쪽 열 (756,424), VPC 세로 범위 안 |
| 연결 | 4개 모두 자동 라우팅(포트·경유점 없음) | 4개 모두 명시적 경유점, EC2→S3는 서브넷 위쪽 틈새(y=255) 사용 |
`tests/generation-layout.test.js`를 구현 전에 실행: 11개 중 7개 실패(서브넷 가로, S3 위치, 경유점 없음 등). 구현 후 11개 통과.

## 검증
- `npx vitest --run tests/generation-layout.test.js`: 13 통과 (공개 입력 배치·정렬·경계·라벨 영역, 4개 연결 경로가 직교이며 다른 아이콘·그룹 라벨 띠 미통과, EC2→DB가 AZ 안, 비대칭 개수, 서브넷 없는 AZ, 템플릿 50px, eks_cluster/asg 폴백, 레거시 불변).
- `npm test`: 22 파일 321개 통과. `npm run build`: 성공.

## 한계 (정직하게)
- 라우팅은 위 두 경우만 지원한다. 임의 그래프, 같은 줄에 여러 아이콘이 있어 통로가 막히는 경우(예: 같은 서브넷 두 번째 EC2가 오른쪽에 있을 때 web-a→db-a)는 `null`로 기존 `orthogonalEdgeStyle`에 맡긴다(테스트에 알려진 한계로 명시). 선 교차 최소화는 하지 않는다.
- 아이콘 안쪽 교차와 그룹 라벨 띠만 XML 좌표로 검사한다. 라벨 폭은 글자 수 추정(8px/자)이라 긴 라벨은 보장하지 않는다.
- 실제 draw.io 렌더링·경로 표시는 확인하지 못했다(브라우저 사용 금지). 포트/경유점이 draw.io에서 의도대로 그려지는지는 미검증.
- Docker 미반영. KB 7페이지 스타일 참고 검사는 루트가 수행한다.

## 독립 검사 후 수정 (엄격한 직교 교차 3건)
- 원인(확인): 처음에는 EC2→S3 통로를 서브넷 **아래쪽** 틈새(+15)에 두어, 같은 틈새를 가로지르는 EC2→DB 세로 경로와 직교 교차했다.
- 수정: `edge-router.js` outerTarget 후보를 위쪽 틈새(`sg.y - 15`) → 아래쪽 순으로 시도하고 기존처럼 아이콘·라벨 띠 충돌을 검증한다. 일반 라우터가 아니며 지원하지 않는 경우는 계속 null(기존 라우팅).
- 회귀 테스트 2개 추가: (1) 공개 입력 4개 연결 경로 간 엄격한 직교 교차 0(끝점 공유·같은 대상 공선/T자 합류는 제외), (2) EC2→S3 통로가 해당 public 서브넷 위쪽에 있음. 위쪽 후보를 제거하면 두 테스트가 실패함을 확인한 뒤 복구했다.
- 한계: 교차 검사는 이 입력과 위 두 경우의 XML 좌표 기준이다. 임의 그래프의 교차는 보장하지 않으며, 실제 draw.io 렌더링은 미검증이다. 도구/문서는 수정하지 않았다.
