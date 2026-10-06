# DaVinci 재시도 계획서

> 작성: 2026-10-06 · 기준 커밋: `cd67320`
> 목적: 지난 시도가 왜 "못 쓰겠다"로 끝났는지 코드로 진단하고, 이번엔 무엇을 어떤 순서로 바꿀지 정한다.

## 한 줄

**AI는 "무엇이 있고 어떻게 흐르는가"만 말하고, 좌표는 검증된 레이아웃 엔진이, "AWS다운 모양"은 규칙이 맡는다.**
지난번은 AI 문제가 아니라 배치 엔진 문제였다.

---

## 1. 지난 시도 진단

사용자 불만("배치, 리소스 간 관계, 트래픽 흐름 같은 디테일이 안 맞는다")이 코드의 어디서 오는지 대응시켰다.
표기: **confirmed** = 코드에서 직접 확인 / **hypothesis** = 추론, 확인 방법 병기.

| # | 증상 | 원인 (위치) | 확신 |
|---|---|---|---|
| D1 | 배치가 흐름과 무관하다 | `layout-engine.js` — 그룹 내 서비스를 **배열 순서대로 4열 격자**(`GRID_MAX_COLS=4`)에 놓고, 하위 그룹은 가로로 나열, 서비스는 그 아래에 쌓는다. `connections`는 좌표 계산에 **쓰이지 않는다** | confirmed |
| D2 | 선이 꼬이고 아이콘을 관통한다 | `json-to-xml-builder.js` — edge에 `orthogonalEdgeStyle`만 주고 port·waypoint가 없다. 배치가 흐름과 안 맞으면 draw.io 자동 라우팅이 꼬인다 | confirmed (원인) / 체감은 hypothesis |
| D3 | AI가 의도를 전달할 수 없다 | `server/index.js` 프롬프트 스키마가 `groups / services / connections`뿐. 주 트래픽 경로, tier, AZ 대칭, 선의 종류(트래픽·데이터·관측·제어)를 담을 필드가 없다 | confirmed |
| D4 | 사람이 손본 배치가 AI 한 번에 날아간다 | `diagram-controller.js` `_addService` 등 — 현재 XML → `summarizeXml()` → JSON 수정 → `buildXml()` **전체 재생성**. `xml-summarizer.js`는 geometry를 읽지 않는다 → 수동 위치가 매번 초기화 | confirmed |
| D5 | 메모·텍스트·비AWS 도형이 사라진다 | `xml-summarizer.js` `isServiceCell` — `mxgraph.aws4` 스타일 셀만 서비스로 수집. 그 외 셀은 JSON에 안 담겨 재생성 시 소실 | confirmed (필터) |
| D6 | "좋아졌는지"를 판단할 수 없었다 | 테스트는 구조(JSON↔XML 정합성) 검증뿐, **배치 품질 지표가 없다** | confirmed |

> D1·D2는 "그림이 이상하다", D4·D5는 "써 보다가 포기한다"의 원인이다. 동료들이 draw.io MCP를 못 쓰겠다고 한 것도
> AI가 좌표를 직접 찍는 구조라서 같은 뿌리로 본다 (hypothesis — 어떤 MCP를 썼는지 확인 필요).

---

## 2. 원칙

```
AI (Bedrock)      → 구조 + 의도   : 어떤 리소스, 어디 소속, 어떻게 흐르는가
레이아웃 엔진 (ELK) → 좌표 + 선 경로 : 층 배치, 교차 최소화, 직각 라우팅
AWS 규칙 (후처리)  → MSP다운 모양  : AZ 대칭, 공통 서비스 띠, 진입점 위치
사람              → 최종 손질     : 손댄 건 AI가 다시 건드리지 않는다
```

- AI는 **좌표를 절대 만들지 않는다** (지금도 프롬프트가 XML 직접 생성을 금지 — 유지).
- 전체 재배치는 **사람이 정렬 버튼을 눌렀을 때만**. AI 편집은 증분이다.
- 모든 변경은 **지표로 비교**한다. 느낌으로 판단하지 않는다.

---

## 3. 개선 항목 (우선순위 순)

### P1. 배치 엔진을 ELK Layered로 교체 — 핵심

- 라이브러리: [`elkjs`](https://github.com/kieler/elkjs) (Eclipse Layout Kernel JS 판)
- 문서로 확인한 기능 (confirmed, [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)):
  - 노드를 층(layer)으로 나눠 **선 방향을 한쪽으로 통일**, 층 내 순서를 바꿔 **교차 최소화**
  - **직각(orthogonal) 라우팅** + port 제약
  - **compound graph**(그룹 안 그룹)와 **그룹을 넘는 선** 지원 — `hierarchyHandling: INCLUDE_CHILDREN` 이면 한 번에 계산
- 시작 옵션안 (키 이름은 구현 시 문서로 재확인):
  ```js
  {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',                 // Internet → Edge → App → Data
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
  }
  ```
- 구현 시 영향 (confirmed, 호출부 확인함):
  - `elk.layout()`은 **비동기**다. `calculateLayout` → `buildXml`이 async가 되고, 호출부 4곳을 `await`로 바꿔야 한다:
    `diagram-controller.js` 2곳, `align-modal.js` 2곳
  - ELK가 주는 **edge 경로(bend point)** 를 `mxGeometry` 안 `<Array as="points">`로 넣어야 D2가 풀린다.
    지금 builder는 edge geometry를 안 쓴다 (출력 형식 `edges[].sections[]`은 구현 시 재확인)
  - ELK 좌표는 부모 기준 상대 좌표다. draw.io도 parent가 있으면 상대 좌표라 `toRelative()` 변환이 단순해질 수 있다 (hypothesis)
- **기존 엔진은 지우지 않고 옵션으로 남긴다** → 같은 입력으로 구/신 비교 (P5)

### P2. JSON 스키마에 "의도" 필드 추가

```json
{
  "services": [{ "id": "alb", "type": "alb", "group": "pub-a", "tier": "edge", "az": "a" }],
  "connections": [{ "from": "alb", "to": "eks", "kind": "traffic", "label": "HTTPS" }]
}
```

| 필드 | 값 | 쓰임 |
|---|---|---|
| `tier` | `client` · `edge` · `public` · `app` · `data` · `ops` | ELK 층 힌트 (layer constraint) |
| `az` | `a` · `c` … | AZ 대칭 후처리 (P3) |
| `connections[].kind` | `traffic` · `data` · `async` · `control` · `observe` | **`traffic`·`data`만 층 계산에 사용.** 관측·IAM 선은 층을 망가뜨리므로 제외하고 따로 그린다 (hypothesis — P5 지표로 확인) |

- 서버 프롬프트 스키마·예시 갱신. 필드는 **전부 선택**으로 두고, 없으면 지금처럼 동작
- 의도 필드를 draw.io 파일에 보존해야 왕복(XML → JSON)이 된다. 후보: style 문자열에 `davinci_tier=edge;` 같은 키 추가, 또는 `<object>` 커스텀 속성.
  draw.io가 모르는 style 키를 저장 시 유지하는지 **unknown** → 첫 작업으로 확인

### P3. AWS 규칙 후처리 (ELK 다음 단계)

ELK가 일반 그래프로는 잘 배치해도 "우리가 그리는 AWS 그림"과는 다를 수 있다. 그 차이를 규칙으로 메운다.

- **AZ 대칭**: 같은 구성의 AZ는 같은 순서·같은 높이로 맞춘다
- **공통 서비스 띠**: CloudWatch·IAM·KMS 등 `ops` tier는 VPC 밖 한쪽 띠에 모은다
- **진입점 고정**: 사용자·인터넷은 맨 왼쪽, Route 53·CloudFront·WAF는 VPC 왼쪽 경계 밖
- 규칙은 팀이 실제로 지키는 것만 넣는다 → P5의 정답 다이어그램에서 뽑는다

### P4. 증분 편집 — 사람이 손본 건 보존 (D4·D5 해결)

- `summarizeXml()`이 geometry를 읽어 JSON에 `x, y, w, h`(선택)를 담는다
- AI 편집(`add_service` 등)은 **기존 노드 좌표를 고정**하고 새 노드만 배치한다
  (ELK의 interactive/semi-interactive 옵션 또는 고정 위치 — 방식은 hypothesis, 구현 시 검증)
- AWS가 아닌 셀(텍스트·메모·온프레미스 도형)은 JSON에 `others`로 통과시켜 재생성 시 그대로 되돌린다
- 전체 재배치는 정렬 버튼으로만

### P5. 평가 — "잘 그렸다"를 숫자로

- **정답 세트**: 팀이 실제로 그린 다이어그램 3~5개 (고객 정보는 지우고 `test-xml/golden/`에)
- **자동 지표** (`scripts/layout-metrics.js`, 작을수록 좋음):

| 지표 | 뜻 |
|---|---|
| edge crossings | 선끼리 교차 수 |
| node overlaps | 노드·라벨 겹침 수 |
| edge-through-node | 선이 다른 아이콘을 관통하는 수 |
| backward primary edges | `traffic` 선 중 흐름 반대 방향 수 |
| AZ asymmetry | 같은 구성 AZ 간 위치 차 |
| area ratio | 전체 면적 / 정답 면적 (너무 펼쳐지는 것 방지) |

- 구 엔진 vs 신 엔진, 그리고 정답과 비교 → 표로 남긴다
- 숫자와 별개로 **팀원 1~2명이 눈으로 본 판정**도 함께 기록 (지표가 놓치는 "보기 좋음")

---

## 4. 단계 계획

각 단계는 **완료 기준**을 넘어야 다음으로 간다. **중단 기준**에 걸리면 거기서 멈추고 원인을 적는다.

| 단계 | 할 일 | 완료 기준 | 중단 기준 |
|---|---|---|---|
| **0. 기준선** | `npm install` 후 기존 테스트 통과 확인 · 지표 스크립트 작성 · `example1`/`test-2`를 현 엔진으로 측정 · draw.io style 키 보존 확인 (P2 unknown) | 현 엔진 지표 표가 있다 | — |
| **1. ELK 교체** | P1. 정렬 버튼 경로부터 ELK로 (AI 경로는 그대로) · edge bend point 출력 | 같은 입력에서 crossings·overlaps·관통이 현 엔진보다 확실히 적다 + 눈 판정 "낫다" | **지표와 눈 판정 둘 다 개선이 없으면 접는다.** 이 단계가 이번 재시도의 승부처 |
| **2. 의도 스키마** | P2. 프롬프트·summarizer·builder 확장 · `kind`별 층 계산 제외 | AI가 만든 그림에서 backward primary edges가 0에 가깝다 | 모델이 필드를 안정적으로 못 채우면 → 규칙 기반 추론으로 대체 검토 |
| **3. AWS 규칙** | P3. 정답 세트에서 규칙 추출 → 후처리 | 정답 대비 AZ asymmetry·area ratio가 기준 이내 | — |
| **4. 증분 편집** | P4. geometry 보존 · 비AWS 셀 통과 · AI 편집 시 기존 좌표 고정 | 손으로 옮긴 뒤 AI로 서비스 추가 → 기존 위치 그대로 | — |

> 범위는 **패턴 하나**부터: "멀티 AZ + ALB → EKS(또는 ECS) → Aurora" 3-tier. 이게 되면 늘린다.

---

## 5. 하지 않는 것 (이번 범위 밖)

- UI 개편 (`DESIGN.md` 방향 유지)
- 멀티 클라우드, 온프레미스 전용 도형 세트
- draw.io MCP 연동 — AI가 좌표를 찍는 구조라 원칙과 충돌
- AWS 계정을 읽어서 자동으로 다이어그램 만들기 — 배치가 먼저 풀려야 의미가 있다

---

## 6. 리스크 · 모르는 것

| 항목 | 상태 | 확인 방법 |
|---|---|---|
| ELK 결과가 "AWS다운 그림"이 되는가 | unknown | 1단계 지표 + 눈 판정. 안 되면 중단 |
| draw.io가 커스텀 style 키를 보존하는가 | unknown | 0단계: 키 넣고 draw.io에서 저장 → XML 확인 |
| 관측·IAM 선 제외가 배치를 실제로 개선하는가 | hypothesis | 2단계: 포함/제외 지표 비교 |
| elkjs 번들 크기·속도 | unknown | 1단계: `vite build` 결과 크기, 노드 50개 기준 layout 시간 측정. 무거우면 web worker |
| 모델이 확장 스키마를 안정적으로 채우는가 | unknown | 2단계: 같은 프롬프트 N회 반복 시 필드 누락률 |
| async 전환 회귀 | 위험 낮음 | 호출부 4곳, 기존 테스트로 커버 |
| 현재 테스트가 통과하는가 | **unknown** — 이 계획서 작성 시 `node_modules`가 없어 실행 못 함 | 0단계 첫 작업 |

---

## 7. 참고

- ELK Layered 알고리즘: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
- ELK hierarchyHandling: https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html
- elkjs: https://github.com/kieler/elkjs
- awslabs/diagram-as-code (YAML → PNG, draw.io 출력은 없는 것으로 보임 — hypothesis): 그룹 순서·방향을 YAML로 지정하는 방식이 P2 스키마 설계에 참고할 만함
- 이전 spec: `.kiro/specs/align-layout-engine-integration/` — 정렬을 단일 파이프라인으로 모은 작업. 이번 P1은 그 파이프라인의 `calculateLayout()`만 교체한다

---

## 첫 할 일

- [ ] `npm install && npm test` — 기준선 테스트 상태 확인
- [ ] draw.io에 커스텀 style 키 넣고 저장 → 보존 여부 확인
- [ ] 팀이 그린 정답 다이어그램 3개 확보 (고객 정보 제거)
- [ ] `scripts/layout-metrics.js` 작성 → 현 엔진 기준선 측정
- [ ] `elkjs` 추가 (버전 고정) → 정렬 버튼 경로부터 교체
