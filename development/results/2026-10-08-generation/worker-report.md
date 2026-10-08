# B018 worker report — 새 그림 생성 첫 경로

모델/effort: claude-sonnet-5.5 / medium. 실제 AWS 호출·브라우저·Docker 재시작·커밋·푸시는 하지 않았다.

## 결과
- `npm test`: 20 파일 301개 통과(기존 225 + 신규 76). `npm run build` 성공.
- 실제 브라우저/draw.io 화면 확인은 하지 않았다. 아래 "새 페이지가 만들어진다"는 jsdom·mock bridge로만 확인했고 그림 품질 합격이 아니다. KB 최종 배치 품질과 85~90%는 주장하지 않는다.

## 변경 파일
- 신규 `src/core/architecture-template.js`: 템플릿 mxGraphModel에서 서비스/그룹 style·icon 크기만 추출. 허용 키 목록(allowlist)으로 sanitize, `html=0` 고정, `container=0`인 AWS 그룹 shape도 그룹으로 인식하되 새 그림에는 `container=1`. image/url/javascript 등은 복사되지 않음. 라벨·ID·좌표·연결은 읽지 않음.
- 신규 `src/core/architecture-generator.js`: 입력 검증(null/배열/중복/예약 0·1/내장 키/알 수 없는 타입/없는 참조/순환/다중부모/충돌/children 중복/자기·중복 연결/제어문자 라벨), 질문(connections 미명시, 그룹이 있는데 소속 미명시, 서비스 없음), `{status:'ready'|'needs_input'}` 계약, 생성 후 노드·연결·소속 개수 재검증.
- `src/core/layout-engine.js`, `json-to-xml-builder.js`: 옵션(`serviceSizes`, `serviceStyles`, `groupStyles`, `edgeStyle`, `useInputIds`)만 추가. 옵션 없는 레거시 호출 결과 동일(기존 테스트 통과).
- `src/core/aws-service-catalog.js`: `getServiceStyle/getGroupStyle/getServiceDimensions`가 `Object.hasOwn`으로 own key만 인정(`constructor`, `toString`, `__proto__` 거부).
- `src/core/diagram-controller.js`: `generate_architecture`(새 페이지 추가, 단일 모델은 mxfile로 감쌈, pageId/활성 페이지 템플릿, 질문·검증 실패는 쓰기 없이 실패, 쓰기 직전 `_mutated` 표시, 실패 시 스냅샷 복원). `replace_all` 변경 없음.
- 신규 `src/core/generation-flow.js`: 응답 처리 규칙(질문 우선, 잘림/혼합 명령 차단, pageId 고정, 성공 vs 품질 문구).
- `src/components/sidebar.js`, `src/styles/index.css`: "작업 방식" select(기본 기존 그림 편집)와 안내, 생성 모드 요청/표시. 질문·오류·성공을 채팅과 대화 기록에 남김. 생성 모드는 현재 그림 내용을 서버로 보내지 않음.
- `server/index.js`: `mode:'generate'` 프롬프트와 응답 정리(질문 우선, max_tokens·`_truncated` 복구 응답 모두 commands 비움, 잘못된 mode 400). 편집 모드 응답은 그대로.
- 테스트: `tests/architecture-generator.test.js`(52), `tests/generation-flow.test.js`(17, 사이드바 jsdom 포함), `tests/server-generate.test.js`(9).

## 중간 리뷰 반영(.local/generation-review.md)
- inherited type(`constructor`/`toString`/`__proto__`): 서비스·그룹 타입 모두 ArchitectureInputError로 거부. 카탈로그 getter는 own key만, 생성기는 반환 문자열 여부로 이중 확인.
- ID `__proto__`/`constructor`/`prototype` 등 `Object.prototype` 키는 예약 처리. 레이아웃 plain object 충돌 방지.
- 같은 부모 안 children id 중복 거부.
- 서버: 질문+commands 동시 응답은 질문 우선, `_truncated` 복구 응답도 실행 금지. 클라이언트도 혼합/다중 명령을 실행하지 않음.
- 사이드바: 질문이 오면 토스트가 아니라 채팅 메시지로 표시하고 대화 기록에 넣어 다음 답변에 포함(테스트로 다음 요청 `conversationHistory` 확인).
- 성공 메시지는 짧게("새 페이지 탭을 열어 확인하세요") 두고, 개발 검증 한계는 이 보고서에만 둔다(최종 리뷰 6번).

## 남은 한계 / 해석
- "부모없는그룹 거부"는 존재하지 않는 부모/자식 참조 거부로 해석했다. 최상위 그룹(aws_cloud 등)은 정상 입력이다.
- 레이아웃은 기존 그리드 엔진 그대로라 KB 수준의 배치 품질이 아니다. 선 교차·라벨 겹침은 측정하지 않는다.
- 템플릿 연결선 스타일, 그룹 라벨 영역 크기는 참고하지 않는다(기본값). 템플릿에 없는 서비스는 템플릿 대표 아이콘 크기에 맞추고 스타일은 카탈로그 기본.
- AZ/subnet 그룹은 카탈로그 색상 기준으로만 인식한다(다른 색의 KB 서브넷은 카탈로그 기본 표현으로 대체).
- 실제 draw.io에서 대화 분리·페이지 질문 흐름을 눈으로 확인하지는 않았다(jsdom 테스트만).
- 새 페이지로 자동 이동하지 않는다. 사용자가 탭을 열어야 한다. 실제 draw.io `merge`가 새 페이지를 반영하는지는 이 환경에서 확인하지 못했다.
- 서버 프롬프트는 mock으로만 검증했고 실제 모델의 구조화 출력 품질은 미검증.
- 신규 inherited/ID 테스트가 수정 전 코드에서 TypeError로 실패함을 되돌려 실행하지는 않았다(수정과 함께 작성).

## 최종 리뷰 반영(.local/generation-final-review.md)
1. 대화 분리: 사이드바에 생성 전용 `ConversationContext`(`generationContext`)를 추가. 생성 요청·질문 후속은 이것만 쓰고, 새 대화/되돌리기/그림 열기 초기화는 두 context를 모두 reset. 회귀: 편집↔생성 왕복 시 서로의 기록이 섞이지 않고 생성 질문 후속은 보존, 새 대화는 둘 다 비움.
2. 참고 페이지 불명: 컨트롤러는 여러 페이지이고 참고 대상을 모를 때 조용히 기본값으로 만들지 않고 질문으로 중단(쓰기 0회). 사이드바는 `preparePayload` 실패 시 AI 요청 없이 안내(요청·안내는 생성 기록에 저장)하고, 페이지를 선택하면 같은 요청을 이어갈 수 있다. 빈 그림/단일 mxGraphModel/1페이지 문서는 기본 스타일로 생성.
3. title: 문자열·60자 이하·제어 문자 없음을 쓰기 전에 검사(`'\u0000'` 거부, 쓰기 0회). 따옴표/꺾쇠는 DOM 속성 이스케이프로 유지.
4. 연결 상한 1000개(`MAX_CONNECTIONS`)를 검증 전에 검사하고 친절한 오류로 거부(쓰기 0회). `verifyXml` 연결 확인은 Set 조회로 변경.
5. questions 형식: `parseQuestions`(`generation-flow.js`)를 서버와 클라이언트가 공유. 문자열·객체·잘못된 항목이 든 배열은 commands를 비우고 다시 요청 안내(서버 `invalid:true`). `[]`는 정상, 문자열 배열은 질문 우선.
6. 성공 메시지에서 품질 안내 문구 제거.
