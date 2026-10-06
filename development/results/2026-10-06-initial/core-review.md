# DaVinci src/core 읽기 전용 레거시 감사

- 기준: 원본 저장소와 동일한 커밋(cd67320), 워크트리 `kiro-smoke-test`
- 범위: `src/core/*.js`, `src/core/__tests__/*.js` 읽기, 호출부 확인을 위해 `src/components/{sidebar,align-modal}.js`, `src/main.js`의 해당 부분만 읽음
- 하지 않은 것: 테스트 실행, 동적 호출, PLAN.md 읽기, 서버 코드(`server/index.js`) 읽기, 코드 수정
- graph MCP: 이 세션에 도구가 없어서 사용하지 못했고 직접 읽었다.
- 확신도 표기: **[증명]** 코드만으로 확정 / **[추론]** 코드 + 외부 동작(draw.io, Bedrock) 가정 / **[미확인]** 확인 수단 없음

## 한눈에 보기

핵심 구조 문제는 하나다. `add_service`, 정렬, `replace_all`이 모두 "현재 XML → Lightweight_JSON → `buildXml`로 전체 재생성 → `loadXml`로 통째 교체" 경로를 쓴다. 그런데 Lightweight_JSON은 사용자가 그린 그림의 일부만 담을 수 있다. 그래서 "하나 추가해줘" 같은 작은 명령도 사용자 그림을 다시 그려 버린다. 아래 8개는 이 문제와, 그 위에 쌓인 명령 실행·신뢰 경계 문제다.

| # | 문제 | 심각도 | 확신도 |
|---|------|--------|--------|
| 1 | 전체 재생성 파이프라인이 사용자 그림을 손실시킴 | 높음 | 증명 |
| 2 | 카탈로그에 없는 AWS 아이콘이 "DB 아이콘"으로 바뀜 | 높음 | 증명 |
| 3 | 정렬은 스냅샷이 없고, 요약이 비면 `add_service`가 전체를 덮어씀 | 높음 | 증명(+추론 1건) |
| 4 | 한 배치 안에서 ID가 바뀌고 캐시가 낡아 뒤 명령이 엉뚱한 대상을 건드림 | 높음 | 증명 |
| 5 | AI 명령 파라미터 미검증 (삭제 대상, 라벨 매칭, XML 미이스케이프) | 높음 | 증명 |
| 6 | 브리지가 수신 postMessage의 origin/source를 검증하지 않음 | 중간 | 증명(악용성은 추론) |
| 7 | summary 채널이 서비스 `type`을 항상 잃음 + 의도 감지 과탐 | 중간 | 증명 |
| 8 | analyzer/catalog 타입 어휘 불일치로 규칙 판정이 어긋남 | 중간 | 증명(일부 추론) |

---

## 1. 전체 재생성 파이프라인이 사용자 그림을 손실시킴 — 높음 [증명]

**경로**
- `diagram-controller.js:128-142` `_addService`: `summarizeXml` → `services.push` → `buildXml` → `loadXml`
- `components/align-modal.js:128-` `runAwsStandardLayout`/`runLeftRightLayout`: `summarizeXml` → `reorganizeForAlignment` → `buildXml` → `loadXml`
- `diagram-controller.js:245-249` `replace_all`

**근거 (코드에서 확인한 손실 지점)**
- `xml-summarizer.js:71-87` `isServiceCell`은 `vertex="1"`이면서 (카탈로그 패턴 일치 또는 스타일에 `mxgraph.aws4` 포함)인 셀만 서비스로 본다. 일반 사각형, 텍스트 박스, 이미지, 주석, 타 벤더 아이콘은 서비스도 그룹도 아니라서 결과 JSON에 들어가지 못하고 사라진다.
- `xml-summarizer.js:134-141` 엣지는 `source && target`이 모두 있을 때만 보존한다. 한쪽이 끝점(terminal point)으로 그려진 화살표는 삭제된다.
- 끊어진 엣지도 조용히 사라진다. 비서비스 도형이 사라진 뒤 그 도형을 가리키던 엣지는 `json-to-xml-builder.js:146-149`에서 `console.warn` 후 건너뛴다.
- `json-to-xml-builder.js:98-140`은 좌표와 크기를 전부 `calculateLayout`에서 새로 계산한다. 서비스 스타일은 `getServiceStyle`(카탈로그 고정 문자열)로 대체하고, 크기는 `getServiceDimensions`의 78×78로 고정한다. 사용자의 위치, 크기, 색, 글꼴, 엣지 경로(waypoint)는 모두 사라진다. 엣지 스타일만 `conn.style`로 전달된다.
- `aws-architecture-builder.js:43` `reorganizeForAlignment`는 `json.groups`를 아예 읽지 않는다 (`const { services = [], connections = [] } = json`). 사용자의 그룹(EKS 클러스터, 리전, 커스텀 경계 등)은 모두 버려진다. 대신 항상 고정된 12개 그룹(AZ-A/B, 서브넷 등)을 만든다. 서비스가 없는 그룹도 생성된다. 서비스는 tier별 앞 절반/뒤 절반으로 AZ-A/B에 나뉜다(L73-78). 원래 소속과는 무관하다.
- `xml-summarizer.js:122` 셀 ID가 없으면 건너뛴다. draw.io가 라벨/링크/속성이 있는 도형을 `<object>`/`<UserObject>`로 감쌀 때 `id`와 `label`은 래퍼에 있고 안쪽 `mxCell`에는 없다. 이런 도형은 ID 없는 셀로 무시된다. 래퍼 형식은 draw.io 동작에 대한 지식에 의존하므로 [추론]이다. 저장소의 예제 두 개(`example-xml/example1.drawio`, `test-xml/test-2.drawio`)에는 `<object>`/`<UserObject>`가 없어 저장소 안에서는 재현되지 않는다.

**재현 입력**
1. 사용자가 EC2 2개, 일반 사각형 "온프레미스" 1개, 그 사각형에서 EC2로 가는 화살표 1개를 그린다.
2. AI에게 "S3 하나 추가해줘"라고 요청한다 (`add_service`).
3. 결과: 사각형과 화살표가 사라지고 EC2 좌표가 그리드로 바뀐다. 성공 메시지 "커맨드 실행 완료"가 표시된다.

**영향**: 사용자가 손으로 다듬은 그림이 "작은 수정"에서 조용히 파괴된다. 성공으로 보고되므로 사용자가 모른다.

## 2. 카탈로그에 없는 AWS 아이콘이 "DB 아이콘"으로 바뀜 — 높음 [증명]

**근거**
- `xml-summarizer.js:84, 162`: 스타일에 `mxgraph.aws4`만 있으면 서비스로 받고 `type:'unknown'`을 부여한다. 원본 스타일 정보는 JSON에 남지 않는다.
- `json-to-xml-builder.js:125-129`: `getServiceStyle('unknown')`이 `null`이면 `GENERIC_SERVICE_STYLE`(L8-9)을 쓴다. 그 스타일의 `resIcon`이 `mxgraph.aws4.generic_database`다.
- `aws-service-catalog.js:185-`의 `SERVICE_STYLES`는 약 38개 타입만 가진다. `eks`, `iam`, `guardduty`, `config`, `trusted_advisor`, `cognito`, `nlb` 등은 없다.

**재현 입력**: 저장소의 `example-xml/example1.drawio`에는 `resIcon=mxgraph.aws4.trusted_advisor`, `guardduty`, `config`가 있다 (`grep`으로 확인). 이 파일을 열고 정렬을 누르거나 `add_service`를 실행하면 세 아이콘이 모두 database 아이콘으로 바뀐다.

**연쇄 영향**
- `add_service`에서 AI가 카탈로그에 없는 `serviceType`(예: `iam`)을 보내면 `diagram-controller.js:128-139`에 타입 검증이 없다. 빈 라벨(`SERVICE_LABELS[type]`이 `undefined`)의 DB 아이콘이 추가된다. 성공으로 보고된다.
- `reorganizeForAlignment`는 `unknown`을 VPC 직속으로 밀어 넣는다 (`aws-architecture-builder.js:129-135`). 위치도 원래와 무관해진다.

## 3. 정렬은 스냅샷이 없고, 요약이 비면 `add_service`가 전체를 덮어씀 — 높음

**3-a 정렬에 되돌리기 경로가 없다 [증명]**
- `components/*.js`와 `main.js`에서 `snapshot`을 쓰는 곳은 `sidebar.js:35-38, 95-99`(DiagramController 주입과 되돌리기 버튼)뿐이다. 스냅샷 저장은 `diagram-controller.js:84` `executeCommands` 안에서만 일어난다.
- `align-modal.js`의 정렬 두 경로는 `bridge.loadXml(newXml)`만 호출하고 스냅샷을 저장하지 않는다.
- 결과: 1번에서 설명한 손실이 정렬에서는 앱 내부 "되돌리기"로도 복구되지 않는다. draw.io 자체 undo가 `load` 액션 뒤에도 남는지는 [미확인]이다.

**3-b 요약이 비었을 때 `add_service`가 전체를 덮어쓴다 [증명]**
- `summarizeXml`은 파싱 오류, 셀 없음, 비AWS 도형만 있는 경우 모두 `emptyResult()`를 돌려준다 (`xml-summarizer.js:95-110`).
- `_addService`는 빈 결과인지 확인하지 않고 서비스 1개를 넣어 `buildXml` → `loadXml`로 교체한다 (`diagram-controller.js:132-141`).
- 재현: 비AWS 도형(일반 플로차트)만 있는 캔버스에서 "EC2 추가해줘" → 캔버스에 EC2 1개만 남는다. 이 경로는 스냅샷이 저장되므로 1회 "되돌리기"는 가능하다.
- 정렬은 `services.length === 0`을 거부하므로(`align-modal.js`의 `reorganized.services.length === 0` 검사) 이 경우는 막힌다. 그러나 "AWS 1개 + 비AWS 다수" 조합은 통과하고 비AWS가 삭제된다.

**3-c 압축 XML [미확인]**: `getCurrentXml`은 draw.io 이벤트의 `msg.xml`을 그대로 쓴다(`drawio-bridge.js:233-241`). 압축된 `<diagram>` 본문이 오면 `summarizeXml`이 빈 결과를 돌려주고 3-b가 그대로 재현된다. draw.io가 압축 XML을 보내는지는 코드에서 알 수 없다. 확인하려면 `configure`의 `compressXml` 설정과 실제 autosave 페이로드 1건을 보면 된다.

## 4. 한 배치 안에서 ID가 바뀌고 캐시가 낡아 뒤 명령이 엉뚱한 대상을 건드림 — 높음 [증명]

**4-a `buildXml`이 ID를 매번 재부여한다**
- `json-to-xml-builder.js:66, 81, 84, 151`: `nextId = 2`부터 그룹 → 서비스 → 엣지 순으로 번호를 새로 매긴다. 원본 ID(`serviceId`로 AI가 본 값)가 보존되지 않는다.
- `executeCommands`(`diagram-controller.js:80-91`)는 명령을 순차 실행하고, 각 명령이 `getCurrentXml`을 새로 읽는다.
- 재현: AI가 요약 JSON 기준으로 `[add_service, remove_service{serviceId:"5"}]`를 보낸다. `add_service`가 `buildXml`로 ID를 재부여한 뒤 `remove_service`가 `"5"`를 찾는다.
  - ID가 숫자형이고 범위 안이면 조용히 다른 셀이 삭제된다.
  - 숫자가 아니면 "대상을 찾을 수 없습니다" 예외 → 배치 전체 롤백(안전하지만 의도 실패).
- 두 결과 모두 AI가 ID 안정성을 가정한다는 점이 문제다. 코드에는 ID 매핑이 없다.

**4-b `merge`가 캐시를 갱신하지 않는다**
- `drawio-bridge.js:173-185` `merge()`는 `_currentXml`을 갱신하지 않는다. 갱신은 draw.io가 나중에 보내는 `autosave`/`save` 이벤트에서만 일어난다(L233-241).
- `getCurrentXml`(L119-122)은 `_currentXml`에 `<mxCell`이 있으면 draw.io에 다시 묻지 않고 캐시를 반환한다.
- 재현: `[add_connection A→B, add_service C]` 배치에서, autosave가 도착하기 전에 `_addService`가 낡은 캐시로 `buildXml` → `loadXml`을 수행하면 방금 merge한 엣지가 사라진다. 결과는 "성공"으로 보고된다. autosave와의 경합이라 재현은 타이밍 의존이다.

**4-c 사용자 수동 편집이 캐시에 늦게 반영된다 [추론]**: 같은 캐시 때문에 사용자가 방금 옮긴 도형이 autosave 이벤트 전에 AI 명령이 실행되면 낡은 XML로 덮어쓸 수 있다. draw.io autosave의 지연 시간은 코드에 없다.

**4-d 롤백 범위**: `executeCommands`의 롤백(L92-99)은 스냅샷 XML을 `loadXml`로 다시 올리는 방식이다. 4-b처럼 캐시가 낡으면 스냅샷 자체(L82-84)가 낡은 상태일 수 있다.

## 5. AI 명령 파라미터 미검증 — 높음 [증명]

`_dispatch`(L105-120)는 `cmd.type`만 검사하고 `params`의 형식/범위는 검사하지 않는다.

- **임의 셀 삭제**: `_removeService`(L146-174)는 `serviceId`로 넘어온 ID를 그대로 `removeCellById`에 전달한다. 서비스인지 확인하지 않는다. `"0"`/`"1"`(루트/기본 레이어)이나 그룹 ID도 통과한다. `"1"`이면 기본 레이어 셀이 제거되어 모든 셀의 `parent`가 끊어진다. 그룹이 삭제되면 자식 셀은 함께 삭제되지 않고 `parent`가 끊어진 채 남는다(`removeCellById`는 해당 셀 하나만 지운다, L49-58).
- **라벨 매칭이 AI가 본 값과 다르다**: AI는 `summarizeXml`이 HTML을 제거한 라벨(`xml-summarizer.js:127`)을 본다. 컨트롤러는 원본 `value`와 `===`로 비교한다 (`diagram-controller.js:160, 189-190, 224-225`). `html=1` 도형의 라벨이 `Web<br>Server`처럼 태그를 포함하면 매칭에 실패한다.
- **라벨 매칭이 그룹과 중복 서비스를 구분하지 못한다**: 조건은 `c.value === label && c.style && !c.source`뿐이다. VPC, 서브넷 같은 그룹 셀도 후보가 된다. 정렬 결과는 "Public Subnet", "Private Subnet (Web)", "Auto Scaling Group"처럼 같은 라벨의 그룹/서비스를 AZ-A/B에 복제하므로 `find`가 항상 첫 번째를 고른다. 라벨 "VPC" 삭제 요청은 VPC 그룹을 지울 수 있다.
- **XML 미이스케이프**: `_addConnection`은 AI가 준 `label`을 `value="${label}"`로 그대로 끼워 merge XML을 만든다 (`diagram-controller.js:197-203`). `R&W`, `"x"`, `<` 같은 입력이면 XML이 깨지거나 속성이 주입된다. `escapeXml`은 `json-to-xml-builder.js`에 있지만 export되지 않아 재사용하지 못했다. 깨진 XML은 `merge`가 오류를 돌려주거나 10초 타임아웃 후 예외로 끝난다.
- **`replace_all`의 `params.xml`**: AI가 준 raw XML이 검증 없이 `loadXml`로 올라간다 (L250-252). 주석은 "하위 호환"이다.
- **`replace_all`의 `architecture`**: 순환 그룹(`A.children=[B]`, `B.children=[A]`, 또는 자기 참조)이면 `buildGroupTree`가 모든 그룹에 `parentId`를 채우므로 `rootGroupIds`가 비어 (`layout-engine.js:267-270`) 그룹이 하나도 배치되지 않는다. 서비스는 `groupedServiceIds`에 들어 있어 미소속 그리드에서도 빠진다(L280-286). 결과: 그룹은 200×200 기본값(`json-to-xml-builder.js:103-104`), 서비스는 모두 (0,0)에 겹쳐 생성된다. 예외도 경고도 없다.
- **`conn.style` 통과**: AI가 준 엣지 `style`이 그대로 `style` 속성에 들어간다 (`json-to-xml-builder.js:154`). draw.io 스타일 키 전체를 AI가 제어한다 (예: 이미지/링크를 가져오는 키). 실제 영향은 draw.io 쪽 처리에 달려 있어 [추론]이다.

**영향**: AI 응답은 신뢰 경계 밖의 입력이다. 모델이 다이어그램 라벨에 들어 있는 텍스트(프롬프트 인젝션)의 영향을 받을 수 있으므로 위 경로는 실제 공격면이다.

## 6. 브리지가 수신 메시지의 출처를 검증하지 않음 — 중간

- `drawio-bridge.js:210-215` `_handleMessage`는 `event.data`가 JSON 문자열인지만 본다. `event.origin`과 `event.source`를 확인하지 않는다. [증명]
- 반면 송신(L267 근처 `_postMessage`)은 `targetOrigin`을 `https://embed.diagrams.net`으로 제한한다. 수신 쪽만 빠져 있다.
- 결과: 같은 창에 메시지를 보낼 수 있는 다른 프레임/탭이 `{"event":"autosave","xml":"..."}`를 보내면 `_currentXml`이 덮인다. 이 값은 `onAutoSave` 콜백, 다음 AI 요청, `loadXml` 재생성에 쓰인다 (`main.js`에서 localStorage 저장도 이 콜백으로 연결될 가능성이 있으나 해당 부분은 전부 읽지 않았다). `export`, `merge` 이벤트도 같다.
- 악용 가능성(어떤 창이 메시지를 보낼 수 있는지)은 호스팅 환경에 달려 있어 [추론]이다. 수정 비용은 작다 (`event.source === iframe.contentWindow`, `event.origin === DRAWIO_BASE_URL`).

**부가 결함** [증명]: `_exportCallback`이 단일 슬롯이다 (`drawio-bridge.js:58, 126, 133, 153`). `getCurrentXml`과 `exportDiagram`이 겹치면 뒤 호출이 앞 호출의 콜백을 덮어 쓰고 앞 Promise는 타임아웃까지 결론 없이 남는다. 타임아웃 핸들러가 다른 호출의 콜백까지 `null`로 지운다.

## 7. summary 채널이 서비스 `type`을 항상 잃음 + 의도 감지 과탐 — 중간 [증명]

- `channel-router.js:57`은 `type: s.shapeName`을 쓴다. `analyzeArchitecture`가 만드는 서비스 객체에는 `shapeName`이 없다 (`aws-analyzer.js`의 서비스 필드: `id, type, serviceName, label, category, tier`). 값은 항상 `undefined`이고 `JSON.stringify`에서 키가 빠진다. summary 채널(분석/조언)에서 AI는 서비스의 `type`을 받지 못하고 라벨에만 의존한다.
- 이 경로를 검증하는 테스트가 없다. `summary-channel-parsing.property.test.js`는 `analyzeArchitecture`만 import하고 `ChannelRouter`는 import하지 않는다. 테스트 머리말에 "shapeName"이 언급되어 있어 이름이 바뀐 흔적으로 보인다.
- 의도 감지(`channel-router.js:79, 86`): 한국어는 부분 문자열 `includes`다. "그려"는 "그려져 있는"에, "수정해"는 "수정해야 하나요?"에 걸린다. 질문이 수정 채널(xml)로 라우팅되어 AI가 명령을 반환할 수 있다. 영어 `\badd\b` 역시 "what does add mean"에 걸린다. 수정 채널이 틀리게 선택되면 1~5번의 파괴 경로가 질문만으로 열린다.

## 8. analyzer/catalog 타입 어휘 불일치로 규칙 판정이 어긋남 — 중간

- [증명] `AWS_CATEGORIES`는 `nat_gateway`, `route53`, `certificate_manager`, `internet_gateway`, `transit_gateway`를 쓰지만 `SERVICE_PATTERNS`의 타입은 `nat`, `route_53`, `acm`, `igw`, `tgw`다 (`aws-service-catalog.js:11-19` vs `:25-`). `getCategoryByType`(L104-)은 정확 일치라서 이들은 전부 `'Other'`가 된다. 분석 결과의 카테고리 묶음과 `hasCategory` 기반 규칙(`good-security`, `no-cicd` 등)이 이 타입들을 세지 못한다.
- [증명] 규칙이 참조하는 타입 중 패턴에 없는 것: `iam`(`aws-analyzer.js:89`), `nlb`(L66, L144). `identifyServiceByStyle`은 이 타입을 만들지 못하고, 폴백(L247-248)은 `resIcon` 접미사를 타입으로 쓴다.
- [추론] draw.io의 IAM/NLB 아이콘 `resIcon` 이름이 `iam`/`nlb`가 아니라면(IAM은 `identity_and_access_management`, NLB는 `network_load_balancer`로 기억하지만 이번 세션에서 확인하지 못했다) "IAM 정책 미표시"는 IAM 아이콘이 있어도 항상 뜨고, NLB 뒤의 EC2는 `direct-ec2-exposure`(severity `error`)로 오판된다.
- [증명] 패턴은 접두사 일치다 (`/resIcon=mxgraph\.aws4\.rds/` 등 경계 없음). `cloudwatch_2`나 `certificate_manager_3`은 각각 `cloudwatch`, `acm`으로 잡힌다 (예제 파일에 실제로 있음). 반면 `rds_proxy`, `kinesis_data_firehose` 같은 변형도 상위 타입으로 뭉개진다. 의도일 수도 있지만 문서화되어 있지 않다.
- [증명] 분석기가 쓰는 그룹 식별(`aws-analyzer.js:263-`)과 요약기의 그룹 식별(`xml-summarizer.js:17-45`)이 별도로 구현되어 있다. 차이가 있다: analyzer는 `groupCenter`를 ASG로 보지만 summarizer는 `group_auto_scaling_group`만 본다. 같은 다이어그램이 두 경로에서 다른 그룹 수를 낸다.

---

## 기타 관찰 (상위 8개 밖, 짧게)

- **대화 트리밍** [증명 + 추론]: `trimToFit`(`conversation-context.js:60-65`)은 메시지를 하나씩 `splice(1, 1)`로 지운다. user/assistant 교대가 깨질 수 있다. 토큰 추정은 `글자수/4`(L53)라 한국어에서 과소 추정이다. 추정에 시스템 프롬프트와 다이어그램 페이로드가 들어가지 않는다 (`sidebar.js:187`). `maxTokenRatio` 생성자 인자는 저장만 하고 쓰지 않는다(L16). 실패 응답 경로(`sidebar.js:213-216`)는 user 메시지만 남기고 assistant 메시지를 추가하지 않아 다음 요청에 user가 연속된다. Bedrock Converse가 역할 교대를 요구한다는 점은 서버 코드를 읽지 않아서 [미확인]이다.
- **`getCurrentXml` 캐시 분기**(`drawio-bridge.js:121`): 빈 다이어그램에도 `<mxCell`이 있으므로 export 요청 경로는 사실상 실행되지 않는다. 타임아웃 폴백 코드는 도달하기 어렵다.
- **`prefixPositions`**(`layout-engine.js:190`)는 항상 `{}`를 돌려주는 죽은 코드다. 호출(L147)도 의미가 없다.
- **`DiagramController._removeService`의 엣지 제거**는 `parseCells` 결과(L167-171)를 기준으로 한다. 서비스와 그 엣지 제거를 각각 재직렬화하는 비효율이 있고, 래퍼 요소(`<object>`) 안의 셀은 래퍼가 남는다.
- **`SnapshotManager`**는 LIFO `restore()`가 pop이라 "되돌리기"를 한 번 누르면 그 스냅샷이 사라진다. 다시 실행(redo)은 없다. 제품 설명(`undo/redo`)과 다르다.

---

## 테스트 빈틈

증명된 사실: `src/core/__tests__`의 7개 파일 중 `diagram-controller`, `drawio-bridge`, `channel-router`, `snapshot-manager`, `conversation-context`를 import하는 파일이 없다 (`grep` 결과: `aws-analyzer`를 import하는 `summary-channel-parsing.property.test.js` 1개뿐). 위 문제 4~7은 테스트 자체가 없다. 이번 세션에서 테스트를 실행하지 않았으므로 통과 여부는 모른다.

증명된 사실(생성기): `align-preservation.property.test.js:24-37, 44-62`의 생성기는 카탈로그에 있는 `KNOWN_SERVICE_TYPES`와 `KNOWN_GROUP_TYPES`만 쓰고, 실제 draw.io XML이 아니라 **Lightweight_JSON에서 `buildXml`로 만든 XML**만 입력한다. 그래서 다음 사례가 생성되지 않는다: 카탈로그 밖 아이콘, 비AWS 도형, 끝점만 있는 엣지, `<object>` 래퍼, 순환 그룹. 1~3번 결함은 현재 테스트로는 잡히지 않는다. (`summarizeXml(buildXml(json))` 왕복 테스트는 서비스/연결 **개수**만 비교한다, L215-, 본문은 끝까지 읽지 않았다.)

추가하면 효과가 큰 테스트 (구현은 요청받지 않았으므로 제안만):
1. `example-xml/example1.drawio`를 입력으로 한 왕복 테스트: 서비스 수, 타입별 수, 엣지 수, 아이콘 `resIcon` 보존.
2. `DiagramController`에 가짜 `bridge`를 주입한 배치 테스트: `[add_service, remove_service]`의 ID 안정성, merge 후 캐시, 롤백.
3. `removeCellById`/`_removeService`에 `"0"`, `"1"`, 그룹 ID, 중복 라벨을 넣는 경계 테스트.
4. `ChannelRouter.preparePayload`의 summary 채널 페이로드에 `type`이 있는지.
5. `postMessage` origin/source 거부 테스트 (jsdom).
6. `calculateLayout`에 순환 그룹과 존재하지 않는 `group` 참조를 넣는 테스트.

---

## 재사용할 자산

- `layout-engine.js`: 순수 함수, DOM 의존 없음, 하위에서 위로 크기 계산 → 절대 좌표 변환 구조가 명확하다. 그룹 크기와 간격 상수를 export한다. 재작성에서도 그대로 쓸 수 있다. (순환 입력 방어와 죽은 코드 `prefixPositions` 정리만 필요하다.)
- `aws-service-catalog.js`: 타입 ↔ 패턴 ↔ 스타일 ↔ 라벨의 단일 소스라는 설계. 단, 2번과 8번의 어휘 불일치를 고친 뒤 써야 한다. `SERVICE_STYLES`/`GROUP_STYLES` 문자열은 그대로 가치가 있다.
- `json-to-xml-builder.js`의 연결 검증과 `escapeXml`, 부모 기준 상대 좌표 변환(`toRelative`): 실제로 동작하는 로직이다. 특히 `escapeXml`은 export해서 컨트롤러가 쓰면 5번의 미이스케이프를 바로 해결한다.
- Lightweight_JSON이라는 교환 형식 자체: 모델에 전달하는 페이로드로는 적합하다. 다만 "원본 보존용 메타(원본 셀 ID, 스타일, 지오메트리)"를 담지 못하는 것이 1~4번의 뿌리다.
- `snapshot-manager.js`: 작고 정확하다. 정렬 경로에도 이걸 연결하는 것이 3-a의 해결 방향이다.
- `analyzer`의 규칙 테이블 구조(`id/title/description/severity/check`): 데이터 주도 형태라 규칙 추가/검증이 쉽다.
- `drawio-bridge.js`의 프로토콜 처리 골격(`configure`/`init`/`autosave`/`export`/`merge`), 타임아웃 처리, 송신 `targetOrigin` 제한: 수신 검증과 단일 슬롯 콜백만 고치면 그대로 쓸 수 있다.
- 테스트 하네스(Vitest + jsdom + fast-check): 속성 테스트의 불변식 선택(모든 서비스가 부모 상자 안에 있는가 등)은 유효하다. 입력 생성기만 현실 입력으로 확장하면 된다.

## 미확인 / 다음에 확인할 것

- draw.io `load` 이후 undo 이력이 남는지 (3-a의 영향 범위)
- draw.io가 autosave에서 압축 XML을 보내는지 (3-c)
- autosave 지연 시간과 `merge` 응답 사이의 경합 (4-b, 4-c)
- IAM/NLB 등의 실제 `resIcon` 이름 (8번)
- 서버의 응답 검증과 Bedrock의 역할 교대 요구 (기타 관찰, 대화 트리밍)
- 테스트 통과 여부 (이번 감사에서는 실행하지 않음)
