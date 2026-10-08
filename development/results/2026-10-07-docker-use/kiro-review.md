# Docker/frontend 변경 독립 리뷰 (읽기 전용)

범위: channel-router, drawio-bridge(loadXmlAndWait), toolbar(열기/다운로드), sidebar(same-origin, pageId, resetDiagramSession), main(onOpen), index.html, vite.config.js.
graph detect_changes: risk 0.60, 새 함수 전부 테스트 공백(이번 범위의 프론트 코드는 단위 테스트 없음). 코드 수정/브라우저 사용/실행 없음. 회사 XML·라벨·IP는 읽거나 적지 않음(파일 크기만 확인).
표기: confirmed = 코드를 읽고 확인한 사실, hypothesis = 외부 동작 가정.

문제 없음으로 확인된 것: /api same-origin 전환 + Vite proxy 3001, loadXmlAndWait의 requestId 상관·중복 호출 거부, 파일 열기 중 AI 로딩 표시가 있으면 거부, 열기 중 채팅 입력 비활성, 다운로드의 Blob URL 해제, origin/source 가드, preparePayload의 페이지 식별(모호하면 실패).

## Findings

1. HIGH (confirmed, 코드) — 다중 페이지 파일에서 add_service 외 명령이 전체 문서를 대상으로 동작한다.
   - AI는 현재 페이지 JSON만 받지만, `remove_service`/`add_connection`/`remove_connection`은 `getCurrentXml()` 전체 XML에서 `parseCells`(모든 페이지의 mxCell)로 serviceId/label을 찾고, `removeCellById`는 문서 전체에서 처음 일치한 mxCell을 지운다. 페이지 간 ID 반복이 유효하므로(계획 0002에서 확인) 현재 페이지의 id를 지우라고 해도 앞 페이지의 같은 id 셀이 삭제될 수 있다. label 검색도 다른 페이지의 동일 라벨을 잡는다.
   - 이들은 `loadXml(newXml)`로 전체를 다시 불러 활성 페이지도 첫 페이지로 돌아간다(draw.io load의 일반 동작, unknown→hypothesis).
   - 재현(합성): 두 페이지에 같은 id "a"를 두고 2번째 페이지를 활성으로 `remove_service {serviceId:"a"}` 실행 → 1번째 페이지 셀이 삭제됨.
   - 이번 변경으로 "다중 페이지 레퍼런스를 열어 자연어로 수정"이 공식 흐름이 되었으므로 범위 내 위험. 제안: 다중 페이지 문서에서는 add_service 외 명령을 선택 페이지로 제한하거나 명확히 거부(현재 pageId 핀은 add_service만 적용).

2. HIGH (confirmed, 코드) — replace_all이 열어 둔 다중 페이지 파일의 나머지 페이지를 모두 교체한다.
   - 프롬프트가 새 그림 생성에 replace_all을 안내하고, `_replaceAll`은 `buildXml` 단일 `mxGraphModel`을 `loadXml`로 올린다. "새로 그려줘"류 요청이 열린 레퍼런스 파일 전체(모든 페이지)를 대체한다. 되돌리기 스냅샷은 있으나 경고/확인이 없고, 사용자가 다른 작업으로 undo 스택을 지우면(새 파일 열기는 `snapshotManager.clear()`) 복구 불가.
   - 제안: 다중 페이지일 때 replace_all 실행 전 확인 또는 거부.

3. MEDIUM (confirmed, 코드) — 그림 열기가 현재 작업을 확인/백업 없이 덮어쓴다.
   - `loadXmlAndWait` 성공 직후 `localStorage.davinci_diagram`을 새 파일로 덮고 `onOpen`이 자동저장 대기분과 undo 스냅샷을 비운다. 저장/다운로드하지 않은 현재 그림은 되돌릴 방법이 없다(다운로드 안내 토스트는 열기 후에 표시).
   - 재현: 편집 → 그림 열기 → 이전 편집 복구 불가. 제안: 열기 전 확인 대화상자(또는 이전 XML을 undo 스냅샷으로 보존).

4. MEDIUM (confirmed, 코드) — 열기 후반 단계 실패 시 세션 상태 불일치.
   - 순서: load 성공 → `getCurrentXml()` → `localStorage.setItem` → `onOpen()`. load 뒤 export 타임아웃이나 setItem 예외(용량 초과; 파일이 커질 경우. 현재 KB 두 파일은 수백 KB라 해당 안 됨)가 나면 catch에서 "그림 열기 실패"를 띄우지만 편집기는 이미 새 파일이고, 대화 기록·undo 스냅샷은 이전 그림 것이 남는다(`onOpen` 미호출). 이후 undo가 이전 그림 XML을 불러온다.
   - 제안: load 성공 직후 `onOpen`(세션 초기화)을 먼저 호출하고 localStorage 저장은 별도 try로 분리.

5. MEDIUM (confirmed 코드, hypothesis 서버 동작) — 실패한 요청이 대화 기록에 고아 user 메시지를 남긴다.
   - `sendMessage`가 전송 전에 `addMessage('user')`를 하고, `!response.ok`(이번에 추가된 모델 미설정 503 포함) 또는 catch 경로에서는 assistant 메시지를 추가하지 않는다. 다음 요청의 `conversationHistory`에 user가 연속되고 서버 `buildMessages`는 그대로 Converse에 전달한다. Bedrock Converse가 연속 user 역할을 거부하는지는 이 세션에서 확인하지 못함(hypothesis; 확인: 503 후 모델 설정 → 재요청 시 500 여부). Docker 기본(모델 미설정) 흐름에서 바로 재현 가능한 경로.
   - 제안: 실패 시 마지막 user 메시지를 제거하거나 같은 역할 연속을 병합.

6. LOW (confirmed, 코드) — 오류 메시지 오귀속. `preparePayload` 실패(현재 페이지 확인 불가, XML 읽기 실패, export 진행 중/타임아웃)도 catch에서 "AI 서버에 연결할 수 없습니다"로 표시된다. 다중 페이지에서 활성 페이지를 못 읽을 때 사용자는 서버 문제로 오인.

7. LOW (confirmed, 코드) — 명령 실행 중 열기 가능. 열기 가드가 DOM의 `loading-*` 요소뿐인데, 응답 수신 직후 로딩이 제거된 뒤에도 `executeCommands`(export→merge/load)가 진행 중이다. 이 창에서 파일을 열면 old-doc 기반 XML이 새 파일에 merge될 수 있다. 창이 짧아 재현은 타이밍 의존. 제안: 전송 상태 플래그로 가드.

8. LOW (confirmed) — 다운로드 파일명이 항상 `architecture.drawio`(열었던 파일명 미사용), 다운로드 중 다른 export(분석/AI)가 진행 중이면 "export 요청이 진행 중" 오류 토스트(동작은 안전하게 실패).

9. LOW (confirmed) — Well-Architected 권장 적용 경로의 add_service에는 pageId가 붙지 않아 모달이 열려 있는 동안 페이지를 바꾸면 그 시점의 활성 페이지에 적용된다(모호하면 실패).

## 미검증
- draw.io가 load 이벤트에 `message.requestId`를 돌려주는 것은 코드상 가정(실제 열기 동작은 root의 실 화면 검증 몫).
- 위 1·2의 활성 페이지 리셋 동작은 draw.io 동작 가정.

DOCKER_REVIEW_DONE
