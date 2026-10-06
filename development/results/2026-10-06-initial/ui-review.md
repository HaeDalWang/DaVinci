# DaVinci UI/API 레거시 감사 보고서

범위: index.html, src/main.js, src/components/*, src/styles/index.css, server/index.js, vite.config.js, package.json, 그리고 호출 흐름 확인용으로 src/core/{drawio-bridge,diagram-controller,snapshot-manager,conversation-context,channel-router}.js.
방법: 정적 코드 읽기만 수행. 앱 실행, 브라우저 렌더링, Bedrock/API 호출, 테스트 실행은 하지 않았다. PLAN.md는 읽지 않았다. graph MCP는 로드하지 않고 직접 읽었다(이번 범위가 작아서).
표기: [확인]=코드에서 직접 읽은 사실, [추론]=코드로부터의 추정이며 실행 미검증.

## 상위 문제

### 1. 채팅 전송 동시성 가드 없음 + 커맨드 실행 중 스냅샷/XML 경합 (높음)
- 위치: src/components/sidebar.js:159-255, :174(전송 버튼만 disable), :64-69(Enter 키 경로), src/core/diagram-controller.js:84-96, src/core/drawio-bridge.js:105-110, :121.
- [확인] 전송 중 플래그가 없다. 전송 후 input이 비워지고 버튼만 disabled이며, 응답 대기 중 다시 입력하면 Enter/버튼으로 두 번째 요청이 동시에 나간다. `conversationContext`에는 두 번째 user 메시지가 응답 전에 들어간다(:166).
- [확인] `loadXml()`은 iframe 응답 없이 `_currentXml = xml`을 즉시 덮어쓰고(:106), `getCurrentXml()`은 이 캐시를 우선 반환한다(:121). 즉 draw.io가 실제로 로드하기 전/도중의 상태를 "현재 XML"로 간주한다. 사용자가 그 사이에 손으로 편집하면 autosave가 캐시를 다시 덮어쓰므로 어느 쪽이 이기는지 순서에 의존한다.
- [추론] 두 응답이 겹치면 각 `executeCommands`가 서로의 스냅샷 직후 XML을 기준으로 `loadXml` 전체 교체를 하므로 한쪽 변경이 유실될 수 있다. 재현: 느린 응답 대기 중 두 번째 "추가해줘" 전송.

### 2. 되돌리기(undo)와 롤백의 신뢰성 결함 (높음)
- 위치: src/core/diagram-controller.js:80-99, src/components/sidebar.js:92-104, src/core/snapshot-manager.js:34-36.
- [확인] 스냅샷은 `executeCommands` 시작 시 1회 저장. 커맨드 중 하나가 실패하면 `restore()`로 pop 후 `loadXml` 복원(:94-97)하므로 오류 롤백은 되나, 성공한 뒤 사용자가 undo를 누르면 스냅샷은 pop만 하고 redo가 없다. 또한 스냅샷은 메모리 전용이라 새로고침 시 소실(저장소는 localStorage의 최신 1개 XML만).
- [확인] 실패 분기에서 `getCurrentXml()`이 스냅샷 저장 전에 reject(타임아웃)하면 try 밖이라 예외가 `sendMessage`의 catch(:252-255)로 가서 "AI Agent 서버(localhost:3000)에 연결할 수 없습니다"라는 잘못된 메시지가 나온다.
- [확인] 스냅샷을 `getCurrentXml()`로 얻는데 위 1번의 캐시 특성상 사용자의 최신 수동 편집이 반영되지 않았을 수 있다(autosave 이벤트가 오기 전 상태). [추론] 그 경우 undo 시 수동 편집이 사라진다.
- Well-Architected "적용" 버튼은 콜백을 await하지 않고 즉시 "적용됨"으로 바꾼다(src/components/well-architected-modal.js:76-82) → 실행이 실패해도 버튼은 적용됨 상태.

### 3. 서버 입력 검증·인증 부재 (높음)
- 위치: server/index.js:14(CORS), :16(`limit: '5mb'`), :353-358, :408-412, :217-240(buildMessages), :367-376.
- [확인] 검증은 `if (!message)` 하나뿐. `message`의 타입/길이, `architecture` 크기, `channel` 값, `conversationHistory` 항목의 `role`(임의 문자열 허용, Converse API는 user/assistant만 허용)과 `content` 타입/개수를 검증하지 않는다. 잘못된 role은 Bedrock 오류 → 500으로 흐른다.
- [확인] 인증이 없다. CORS는 브라우저만 막을 뿐 curl 등 비브라우저 호출은 통과하며, 유일한 보호는 분당 30회 rate limit(IP 기준, :19-27). 각 요청이 `maxTokens: 32768`(:374)까지 쓸 수 있어 서버 측 AWS 자격증명으로 비용이 발생한다. 서버를 localhost 밖에 노출하면 즉시 비용 노출 경로가 된다.
- [확인] `express.json` 5MB 한도와 토큰 한도 사이에 서버 측 제한이 없다. 클라이언트의 토큰 트리밍(conversation-context.js)은 서버가 신뢰할 수 없다.
- [확인] `/api/well-architected`(:408)는 `architecture` 존재 검증조차 없고, 클라이언트 어디서도 호출하지 않는다(src, server grep 결과 서버 정의 한 곳뿐). 즉 서버 엔드포인트는 사실상 죽은 코드이며 WA 모달은 `/api/chat` 응답에 `wellArchitected`가 올 때만 뜨는데, `/api/chat` 프롬프트는 그 필드를 요청하지 않는다(:46-50 응답 형식). [추론] 현재 WA 모달은 사용자가 도달할 수 없는 기능이다.

### 4. AI 응답 스키마 미검증 → 커맨드가 그대로 실행됨 + XML 속성 주입 (높음)
- 위치: server/index.js:243-293(parseCommandResponse), src/components/sidebar.js:142-152, src/core/diagram-controller.js:101-121, :196-203, :134.
- [확인] 서버는 `message`(string)/`commands`(array)만 확인하고 각 command의 `type`, `params` 형태는 검증하지 않는다. 클라이언트도 `_dispatch`에서 type만 switch로 거른다. `replace_all`의 `params.architecture`는 구조 검증 없이 `buildXml`에 전달되고, `params.xml` 하위 호환 경로(:248-251)는 모델이 만든 임의 XML을 `loadXml`로 그대로 로드한다. 프롬프트는 "XML 금지"라 하지만 코드 수준 차단은 없다.
- [확인] `_addConnection`은 `label`을 이스케이프 없이 XML 속성에 보간한다(`value="${label}"`, :198). 라벨에 `"`나 `<`가 들어오면 XML이 깨지거나 속성 주입이 가능하다. 재현(설계상): AI 또는 WA 권장 커맨드가 `label: 'a" style="...'`를 반환. [추론] 실제 draw.io에서의 영향은 미실행.
- [확인] 응답 잘림 복구(tryRecoverTruncatedCommands, :301-351)는 잘린 응답에서 "완전한 커맨드만" 실행한다. 사용자에게는 잘림이 알려지지 않는다: `_truncated` 플래그를 서버가 붙이지만(:263, :273) 클라이언트는 사용하지 않는다. 결과적으로 부분 적용된 다이어그램이 성공처럼 보일 수 있다.
- [확인] `response.output.message.content[0].text`(:380, :430)는 첫 content 블록이 text가 아니면 TypeError → 일반 500.
- 라벨 기반 대상 찾기(`cells.find(c => c.value === label && c.style && !c.source)`, diagram-controller.js:138, :182-183, :224-225)는 중복 라벨이면 첫 항목만 선택한다. 또 `c.style` 존재만으로 서비스 셀로 간주하므로 그룹/컨테이너도 매칭된다. [추론] 같은 라벨이 2개인 다이어그램에서 엉뚱한 서비스가 삭제/연결된다.

### 5. draw.io iframe 메시지 origin 검증 없음 + 이벤트 생명주기 취약 (중간)
- 위치: src/core/drawio-bridge.js:210-258, :117-139, :141-160, :60-62(생성자 리스너).
- [확인] `_handleMessage`는 `event.origin`/`event.source`를 확인하지 않고 문자열 JSON만 파싱한다(:211-220). 송신(`_postMessage`)은 `https://embed.diagrams.net`로 제한돼 있으나 수신은 제한이 없다. 같은 창에 메시지를 보낼 수 있는 다른 출처(예: 다른 iframe/팝업)가 `{"event":"autosave","xml":...}`를 보내면 `_currentXml`과 localStorage 저장본이 조작된다. 프로젝트 규칙(targetOrigin 제한)은 송신에만 적용돼 있음.
- [확인] 요청-응답 상관관계가 없다. `export`는 `_exportCallback` 단일 슬롯(:133, :153)이라 `getCurrentXml`의 export와 `exportDiagram`이 겹치면 서로의 콜백을 덮어쓴다. 타임아웃 분기는 콜백만 null로 만들고 늦게 도착한 응답은 무시된다. `merge`도 'merge' 단일 키(:179)라 동시 호출 시 앞선 호출이 타임아웃까지 대기.
- [확인] `init` 전 `_postMessage`(예: 아주 빨리 누른 분석/정렬)는 `contentWindow`가 있으면 그대로 전송되고 draw.io가 준비 전이면 유실될 수 있다. `bridge.loadXml`은 준비 여부를 확인하지 않는다(:105-111).
- [확인] 로드 실패 처리가 없다. `editor-loading`은 `onReady`에서만 숨겨지고(src/main.js:22), 네트워크 차단/`embed.diagrams.net` 장애 시 타임아웃·오류 UI 없이 스피너가 영구 유지된다. [추론] 오프라인에서 재현.

### 6. 저장 경로 분산 + 조용한 실패 (중간)
- 위치: src/main.js:28-62, src/components/toolbar.js:47-57.
- [확인] `localStorage.setItem('davinci_diagram', ...)`가 main.js(:46,:54,:60)와 toolbar.js(:52) 네 곳에 흩어져 있고 키 문자열이 중복이다. 어느 곳에도 try/catch가 없다. 용량 초과(QuotaExceededError)나 시크릿 모드에서 autosave 타이머 내부 또는 beforeunload에서 예외가 나며 사용자에게 알림이 없다.
- [확인] 복원 시 저장본을 검증 없이 `loadXml`한다(main.js:30-31). 손상된 값이면 사용자가 빈 캔버스/로드 오류를 보고, 손상본은 다음 autosave 전까지 지워지지 않는다.
- [확인] Ctrl+S 핸들러는 `async` 리스너에서 `getCurrentXml()`을 호출(toolbar.js:47-53)하는데, 캐시된 XML을 바로 저장하므로 draw.io의 `save` 이벤트 경로와 중복 토스트가 날 수 있다(main.js:58-61). 주석은 "30초 간격"인데 실제는 5000ms(main.js:38 vs :48) — 문서/코드 불일치.
- [확인] 자동 저장이 5초 debounce이므로 `beforeunload` 전에 `pendingXml`이 있을 때만 즉시 저장한다. 그러나 AI 커맨드로 `loadXml`한 결과는 autosave 이벤트가 와야 pendingXml이 생기므로, 그 이벤트 전에 탭을 닫으면 AI 변경이 저장되지 않을 수 있다 [추론].

### 7. 접근성·모바일 (중간)
- 위치: index.html:76-141, src/styles/index.css:581(outline:none), :1040-1072(@media), src/components/*-modal.js, src/components/toast.js:17, sidebar.js:324-332.
- [확인] 모달에 `role="dialog"`, `aria-modal`, `aria-labelledby`가 없고 포커스 이동/포커스 트랩/닫은 뒤 포커스 복귀가 없다. Escape 핸들러는 모달이 다른 방식(배경 클릭)으로 닫히면 `document`에 리스너가 남는다(align-modal.js:109-116, well-architected-modal.js:64-71: 제거는 Escape 경로에서만).
- [확인] 토스트와 채팅 메시지 영역에 `aria-live`/`role="status"`/`role="log"`가 없다. 스크린리더는 AI 응답, 오류, 저장 알림을 알 수 없다. 전송 버튼(index.html:124)은 `title`만 있고 `aria-label`이 없으며, 채팅 입력(`#chat-input`)에도 `<label>`/`aria-label`이 없다.
- [확인] `.sidebar__input`(css:581 근처)에서 `outline: none`을 쓰고 전체 CSS에 `:focus-visible`이 없다. 키보드 포커스가 보이지 않을 수 있다. `prefers-reduced-motion` 처리도 없다(grep 결과 없음).
- [확인] 모바일(≤768px)에서 사이드바가 `position: fixed; width: 100%`(css:1040-1058)이고 초기 상태가 접힘이 아니다(`aria-expanded="true"`, index.html:62). [추론] 좁은 화면에서 로드 직후 사이드바가 에디터를 완전히 덮는다. 실제 렌더링은 확인하지 않았다. 토글 버튼이 툴바에 남아 있어 닫을 수는 있을 것이다.
- [확인] 접힌 사이드바는 `width:0; opacity:0; pointer-events:none`이지만 `visibility:hidden`/`inert`가 아니라 키보드 Tab 순서에 남는다(css:339-344). [추론] 접힌 상태에서도 보이지 않는 입력에 포커스가 간다.
- [확인] 리사이즈 핸들은 마우스 전용(mousedown)이며 키보드/터치 대안이 없다(sidebar.js:280-306).
- 사소: `resetChatUI`가 welcome HTML을 index.html과 중복 보유(sidebar.js:107-131), 로딩 인디케이터 id를 `Date.now()`로 생성(:177, 동일 ms 충돌 가능), 로딩 메시지는 `innerHTML` 삽입(고정 문자열이라 XSS는 아님).

### 8. 오류 처리·배포 가정의 하드코딩 (낮음~중간)
- 위치: src/components/sidebar.js:198, :254, vite.config.js:1-16, server/index.js:12-14.
- [확인] 클라이언트가 `http://localhost:3000/api/chat`을 하드코딩한다(sidebar.js:198). Vite proxy나 환경변수가 없다(vite.config.js). 다른 호스트/포트/배포 환경에서는 동작하지 않고, 모든 fetch 예외가 "localhost:3000에 연결할 수 없습니다"로 표시된다(:254). 이 catch는 fetch 실패뿐 아니라 `executeCommands`/파싱 예외도 포함하므로 오진 메시지가 된다.
- [확인] fetch에 타임아웃/AbortController가 없다. Bedrock 호출이 길어지면 "생각 중..."이 무기한 유지된다. `response.json()` 실패도 catch로 흡수된다.
- [확인] `ALLOWED_ORIGINS` 항목은 공백 trim 없이 split한다(server/index.js:12). `a, b`처럼 쓰면 두 번째 origin이 매칭되지 않는다.
- [확인] 서버 로그에 전체 error 객체를 출력한다(server/index.js:398-399, 436-437). 클라이언트에는 일반화된 메시지만 보낸다는 점은 양호.
- `vite.config.js`의 `server.open: true`는 `npm run dev`마다 브라우저를 연다(에이전트/CI 환경에서 불필요). [확인] 테스트 설정이 `test` 키로 vite.config.js에 있어 vitest 외 별도 파일은 없음.

## 사실/추론 구분 요약
- 실행 검증한 것: 없음. 모든 항목은 코드 읽기 결과이며 브라우저·서버를 띄우지 않았다.
- 명시적으로 확인한 사실: 전송 중복 가드 부재, `/api/well-architected` 클라이언트 미호출, origin 수신 미검증, `label` 비이스케이프 보간, localStorage 쓰기 4곳 try/catch 없음, 모달 ARIA 속성 부재(grep 기준), 모바일 사이드바 기본 펼침.
- 추론으로 남긴 것: 동시 전송 시 변경 유실, 라벨 중복 시 오대상 삭제, 모바일 실제 화면, 속성 주입의 실제 draw.io 영향, 탭 종료 시 AI 변경 유실.

## 재사용할 자산 (현재 코드에서 가치가 있는 것)
- `src/core/aws-service-catalog.js` — 서비스 타입/스타일/라벨 단일 출처. 서버 프롬프트에도 사용 중(server/index.js:5, :36).
- Lightweight_JSON 파이프라인: `xml-summarizer.js`, `json-to-xml-builder.js`, `layout-engine.js`, `aws-architecture-builder.js` + `src/core/__tests__/` 의 단위/속성 테스트. UI를 다시 쓰더라도 그대로 쓸 수 있는 순수 로직(코어→컴포넌트 import 금지 규칙 유지).
- `DrawIOBridge`의 action/event 구조(configure/init/load/autosave/export/merge)와 draw.io 설정(aws4 전용, 다크 테마) — 요청 ID 상관관계와 origin 검증만 보강하면 재사용 가능.
- `ChannelRouter`의 summary/xml 분기 개념(한국어 어미 + 영어 `\b`), `ConversationContext.trimToFit`의 첫 메시지 보존, `SnapshotManager`(단순하고 테스트하기 쉬움).
- `escapeHtml`(src/core/utils.js)를 쓰는 모달/토스트 렌더링 — 사용자/AI 텍스트는 `escapeHtml` 또는 `innerText`로 삽입하고 있어(well-architected-modal.js, toast.js, sidebar.js:325) XSS 측면은 전반적으로 양호. 단 WA 모달의 `pillar.score`는 escape 없이 보간된다(well-architected-modal.js:103, :126, :132 근처; 숫자 가정) [확인: 문자열이면 HTML 삽입 가능, 서버가 타입 검증 안 함].
- 서버: 시스템 프롬프트 구조(Command_Response 스키마, 서비스 카탈로그 주입), 잘린 JSON 복구 로직, rate limit + CORS 제한 구성.
- 디자인 토큰이 `:root` 변수로 정리된 `index.css`(1264줄, 단일 파일) — 구조는 재사용 가능하나 파일이 크다.

## 우선순위 제안 (구현 아님, 참고)
1. 서버 입력/출력 스키마 검증(3, 4번)과 전송 중복 가드(1번)
2. 브릿지 요청 ID + origin/source 검증(5번)
3. 모달·채팅 접근성, 모바일 기본 접힘(7번)
4. 저장 경로 단일화와 오류 처리(6, 8번)

(이 파일 외 저장소 파일은 수정하지 않았다.)
