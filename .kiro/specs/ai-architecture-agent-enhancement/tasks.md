# 구현 계획: AI 아키텍처 에이전트 고도화

## 개요

DaVinci AI Agent를 텍스트 전용 조언 시스템에서 다이어그램을 직접 조작할 수 있는 프로덕션 등급 아키텍처 어시스턴트로 고도화한다. 서비스 카탈로그 통합 → 핵심 인프라 모듈(스냅샷, 대화 컨텍스트, 채널 라우터) → Diagram Controller → 서버 고도화 → 사이드바 통합 → Well-Architected 평가 순서로 점진적으로 구현한다.

## Tasks

- [x] 1. AWS 서비스 카탈로그 공유 모듈 구현
  - [x] 1.1 `src/core/aws-service-catalog.js` 생성
    - aws-analyzer.js의 AWS_CATEGORIES와 aws-architecture-builder.js의 SERVICE_PATTERNS를 통합하는 단일 서비스 카탈로그 정의
    - `getCategoryByType(type)`, `identifyServiceByStyle(style)`, `getLabelByType(type)`, `getAllServicesAsJSON()`, `getServicesByCategory(category)` 함수 구현
    - _Requirements: 7.1, 7.2, 7.4_

  - [ ]* 1.2 서비스 카탈로그 프로퍼티 테스트 작성
    - **Property 16: 서비스 카탈로그 조회 일관성**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 1.3 `src/core/aws-analyzer.js`에서 자체 AWS_CATEGORIES 제거 후 aws-service-catalog 사용으로 리팩터링
    - classifyService(), matchCategory(), matchService() 함수가 카탈로그 모듈을 참조하도록 수정
    - _Requirements: 7.3_

  - [x] 1.4 `src/core/aws-architecture-builder.js`에서 자체 SERVICE_PATTERNS, SERVICE_LABELS 제거 후 aws-service-catalog 사용으로 리팩터링
    - analyzeXmlServices() 함수가 카탈로그 모듈을 참조하도록 수정
    - _Requirements: 7.3_

- [x] 2. 체크포인트 — 서비스 카탈로그 통합 검증
  - 모든 테스트가 통과하는지 확인하고, 기존 분석/빌더 기능이 정상 동작하는지 사용자에게 확인 요청

- [x] 3. 핵심 인프라 모듈 구현
  - [x] 3.1 `src/core/snapshot-manager.js` 생성
    - SnapshotManager 클래스 구현: save(xml, description), restore(), getHistory(), clear()
    - 최대 20개 스냅샷 제한, FIFO 방식으로 오래된 스냅샷 제거
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 3.2 스냅샷 매니저 프로퍼티 테스트 작성
    - **Property 12: 스냅샷 저장 완전성**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 3.3 스냅샷 매니저 프로퍼티 테스트 작성
    - **Property 13: 스냅샷 저장/복원 라운드트립**
    - **Validates: Requirements 5.3**

  - [ ]* 3.4 스냅샷 매니저 프로퍼티 테스트 작성
    - **Property 14: 스냅샷 최대 개수 제한**
    - **Validates: Requirements 5.4**

  - [x] 3.5 `src/core/conversation-context.js` 생성
    - ConversationContext 클래스 구현: addMessage(role, content), getMessages(), reset(), estimateTokens(), trimToFit(maxTokens)
    - 토큰 추정은 문자열 길이 기반 근사치 사용 (1 토큰 ≈ 4자)
    - _Requirements: 4.1, 4.4, 4.5_

  - [ ]* 3.6 대화 컨텍스트 프로퍼티 테스트 작성
    - **Property 10: 대화 히스토리 순서 보존**
    - **Validates: Requirements 4.1**

  - [ ]* 3.7 대화 컨텍스트 프로퍼티 테스트 작성
    - **Property 11: 토큰 트리밍 한도 준수**
    - **Validates: Requirements 4.4**

  - [x] 3.8 `src/core/channel-router.js` 생성
    - ChannelRouter 클래스 구현: preparePayload(userMessage) → { channel, data }
    - 수정/생성 키워드(그려줘, 추가해, 수정해, 삭제해, 만들어, 변경해, 제거해, 연결해 등) 감지 → XML 채널, 그 외 → Summary 채널
    - Summary 채널은 aws-analyzer.js의 analyzeArchitecture()를 활용하여 요약 JSON 생성
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.9 채널 라우터 프로퍼티 테스트 작성
    - **Property 7: 채널 라우팅 정확성**
    - **Validates: Requirements 2.4, 2.5**

- [x] 4. 체크포인트 — 인프라 모듈 검증
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문

- [-] 5. Diagram Controller 구현
  - [x] 5.1 `src/core/diagram-controller.js` 생성
    - DiagramController 클래스 구현: executeCommands(commands)
    - 5가지 커맨드 타입 핸들러 구현: _addService, _removeService, _addConnection, _removeConnection, _replaceAll
    - 커맨드 실행 전 SnapshotManager.save() 호출, 오류 시 restore()로 롤백
    - aws-service-catalog에서 서비스 스타일 정보를 조회하여 mxCell XML 생성
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ]* 5.2 Diagram Controller 프로퍼티 테스트 작성
    - **Property 1: 커맨드 디스패치 정확성**
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 5.3 Diagram Controller 프로퍼티 테스트 작성
    - **Property 5: 오류 시 다이어그램 상태 보존**
    - **Validates: Requirements 1.8**

  - [ ]* 5.4 Command_Response 파싱 유틸리티 단위 테스트 작성
    - **Property 8: Command_Response 구조 유효성**
    - **Validates: Requirements 3.1, 3.4**

  - [ ]* 5.5 잘못된 응답 폴백 프로퍼티 테스트 작성
    - **Property 9: 잘못된 응답 폴백**
    - **Validates: Requirements 3.5**

- [x] 6. 체크포인트 — Diagram Controller 검증
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문

- [x] 7. 서버 API 고도화
  - [x] 7.1 `server/index.js`의 POST /api/chat 엔드포인트 수정
    - 요청 body에 channel, conversationHistory 필드 추가 지원
    - 채널에 따라 시스템 프롬프트에 요약 JSON 또는 원본 XML 포함
    - Bedrock Converse API의 messages 배열에 대화 히스토리 포함
    - 응답을 Command_Response JSON 형식({ message, commands })으로 반환
    - Bedrock 응답이 유효한 JSON이 아닌 경우 원본 텍스트를 message에 담아 반환
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 4.2, 4.3, 8.1, 8.2, 8.3_

  - [x] 7.2 시스템 프롬프트 고도화
    - Command_Response JSON 스키마 정의, 커맨드 타입별 params 설명 포함
    - aws-service-catalog의 getAllServicesAsJSON()으로 사용 가능한 서비스 목록 포함
    - AWS 모범사례 가이드라인(Multi-AZ, 보안 계층, 모니터링 등) 포함
    - 존재하지 않는 서비스에 대한 remove 커맨드 생성 금지 제약 조건 명시
    - _Requirements: 8.1, 8.4, 8.5_

  - [x] 7.3 Well-Architected 평가 전용 엔드포인트 또는 분기 로직 추가
    - 사용자가 Well-Architected 평가를 요청하면 5개 Pillar 기준 분석 결과를 반환
    - 각 Pillar에 score(1~5), rationale, recommendations 포함
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.4 Well-Architected 응답 구조 프로퍼티 테스트 작성
    - **Property 15: Well-Architected 응답 구조 유효성**
    - **Validates: Requirements 6.2**

- [x] 8. 체크포인트 — 서버 API 검증
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문

- [x] 9. 프론트엔드 통합 — sidebar.js 수정
  - [x] 9.1 sidebar.js에 ChannelRouter, ConversationContext, DiagramController 통합
    - sendMessage() 함수에서 ChannelRouter.preparePayload()로 채널 데이터 준비
    - ConversationContext로 대화 히스토리 관리 및 API 요청에 포함
    - AI 응답을 Command_Response로 파싱하여 commands가 있으면 DiagramController.executeCommands() 호출
    - 유효하지 않은 JSON 응답은 텍스트 메시지로 폴백 표시
    - _Requirements: 2.4, 2.5, 3.5, 4.1, 4.2_

  - [x] 9.2 "새 대화" 버튼 및 "되돌리기" 버튼 UI 추가
    - "새 대화" 버튼 클릭 시 ConversationContext.reset() 호출 및 채팅 UI 웰컴 화면 복원
    - "되돌리기" 버튼 클릭 시 SnapshotManager.restore()로 이전 다이어그램 복원 및 토스트 메시지 표시
    - index.html에 해당 버튼 요소 추가
    - _Requirements: 4.5, 5.3, 5.5_

  - [x] 9.3 커맨드 실행 결과 피드백 메시지 표시
    - 커맨드 성공 시 채팅 인터페이스에 실행 결과 메시지 추가
    - 커맨드 실패 시 토스트 메시지로 오류 표시
    - _Requirements: 1.8, 1.9_

- [x] 10. Well-Architected 평가 모달 구현
  - [x] 10.1 `src/components/well-architected-modal.js` 생성
    - showWellArchitectedModal(scores, onApplyRecommendation) 함수 구현
    - Pillar별 점수 바 차트, 근거 설명, 개선 권장사항 목록 표시
    - 각 권장사항에 "적용" 버튼 제공 → 클릭 시 onApplyRecommendation 콜백 호출
    - _Requirements: 6.3, 6.4_

  - [x] 10.2 sidebar.js에서 Well-Architected 평가 요청 및 모달 표시 연동
    - Well-Architected 평가 응답 수신 시 showWellArchitectedModal() 호출
    - "적용" 버튼 클릭 시 해당 recommendations의 commands를 DiagramController로 실행
    - _Requirements: 6.3, 6.4_

  - [x] 10.3 `src/styles/index.css`에 Well-Architected 모달 스타일 추가
    - Pillar별 점수 바, 권장사항 카드, 적용 버튼 스타일 정의
    - _Requirements: 6.3_

- [x] 11. Summary_Channel 파싱 완전성 검증
  - [x]* 11.1 Summary_Channel 프로퍼티 테스트 작성
    - **Property 6: Summary_Channel 파싱 완전성**
    - **Validates: Requirements 2.1, 2.2**

- [x] 12. 최종 체크포인트 — 전체 통합 검증
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있음
- 각 태스크는 특정 요구사항을 참조하여 추적 가능성을 보장
- 체크포인트에서 점진적 검증을 수행하여 안정성 확보
- 프로퍼티 테스트는 fast-check 라이브러리를 사용하여 구현
- 단위 테스트와 프로퍼티 테스트는 보완적으로 사용
