# 요구사항 문서: AI 아키텍처 에이전트 고도화

## 소개

DaVinci는 DrawIO 임베드 모드를 활용한 AWS 아키텍처 전문 다이어그램 에디터이다. 현재 AI Agent는 다이어그램의 요약 정보만 수신하여 텍스트 조언만 제공하는 수준이다. 본 기능 고도화는 AI Agent가 다이어그램을 직접 파악·생성·수정·삭제·조언할 수 있도록 DrawIO 통신 전용 모듈을 구축하고, XML 원본/요약 분석 통신 채널을 분리하며, 서버 프롬프트와 응답 구조를 고도화하여 프로덕션 등급의 AI 아키텍처 어시스턴트로 발전시키는 것을 목표로 한다.

## 용어 정의

- **DaVinci_App**: DrawIO 임베드 모드 기반 AWS 아키텍처 다이어그램 에디터 웹 애플리케이션
- **AI_Agent**: AWS Bedrock Claude 모델을 활용하여 아키텍처를 분석·조언·생성·수정하는 백엔드 서비스
- **DrawIO_Bridge**: DrawIO iframe과 postMessage JSON 프로토콜로 통신하는 프론트엔드 모듈 (src/core/drawio-bridge.js)
- **Diagram_Controller**: AI Agent의 명령(커맨드)을 해석하여 DrawIO_Bridge를 통해 다이어그램을 실제로 조작하는 프론트엔드 모듈 (신규)
- **XML_Channel**: DrawIO 다이어그램의 원본 XML 전체를 전송하는 통신 경로
- **Summary_Channel**: XML을 파싱하여 서비스·연결·카테고리 등 논리 구조만 요약한 JSON을 전송하는 통신 경로
- **Command_Response**: AI_Agent가 반환하는 구조화된 JSON 응답으로, 텍스트 조언과 실행 가능한 다이어그램 조작 커맨드를 포함
- **Architecture_Snapshot**: 특정 시점의 다이어그램 XML과 분석 메타데이터를 저장한 불변 객체
- **Conversation_Context**: AI_Agent와의 대화 히스토리 및 현재 아키텍처 상태를 포함하는 세션 데이터
- **Well_Architected_Score**: AWS Well-Architected Framework 5개 Pillar 기준으로 산출한 아키텍처 평가 점수

## 요구사항

### 요구사항 1: DrawIO 통신 전용 Diagram Controller 모듈

**사용자 스토리:** 개발자로서, AI Agent의 다이어그램 조작 명령을 DrawIO Bridge를 통해 실행하는 전용 모듈이 필요하다. 이를 통해 AI가 다이어그램을 직접 생성·수정·삭제할 수 있다.

#### 인수 조건

1. WHEN AI_Agent가 다이어그램 조작 커맨드를 반환하면, THE Diagram_Controller SHALL 해당 커맨드를 파싱하여 DrawIO_Bridge의 적절한 메서드(loadXml, merge)를 호출한다
2. THE Diagram_Controller SHALL "add_service", "remove_service", "add_connection", "remove_connection", "replace_all" 5가지 커맨드 타입을 지원한다
3. WHEN "add_service" 커맨드를 수신하면, THE Diagram_Controller SHALL 지정된 AWS 서비스의 mxCell XML을 생성하여 DrawIO_Bridge의 merge 메서드로 현재 다이어그램에 추가한다
4. WHEN "remove_service" 커맨드를 수신하면, THE Diagram_Controller SHALL 대상 서비스의 mxCell을 식별하여 다이어그램에서 제거한다
5. WHEN "add_connection" 커맨드를 수신하면, THE Diagram_Controller SHALL 소스와 타겟 서비스 간 Edge mxCell XML을 생성하여 다이어그램에 추가한다
6. WHEN "remove_connection" 커맨드를 수신하면, THE Diagram_Controller SHALL 지정된 연결 Edge를 다이어그램에서 제거한다
7. WHEN "replace_all" 커맨드를 수신하면, THE Diagram_Controller SHALL DrawIO_Bridge의 loadXml 메서드를 호출하여 전체 다이어그램을 교체한다
8. IF 커맨드 실행 중 오류가 발생하면, THEN THE Diagram_Controller SHALL 오류 내용을 사용자에게 토스트 메시지로 표시하고 다이어그램을 커맨드 실행 이전 상태로 복원한다
9. WHEN 커맨드가 성공적으로 실행되면, THE Diagram_Controller SHALL 실행 결과를 채팅 인터페이스에 피드백 메시지로 표시한다

### 요구사항 2: XML 원본 통신과 요약 분석 통신 채널 분리

**사용자 스토리:** 개발자로서, AI Agent에게 전달하는 아키텍처 데이터를 XML 원본 채널과 요약 분석 채널로 분리하여, AI가 상황에 맞게 효율적으로 판단할 수 있도록 한다.

#### 인수 조건

1. THE Summary_Channel SHALL XML을 파싱하여 서비스 목록, 연결(Edge) 관계, 카테고리 분류, 서비스 간 데이터 흐름 방향을 포함하는 JSON 요약을 생성한다
2. THE Summary_Channel SHALL 연결(Edge) 정보에서 소스 서비스명, 타겟 서비스명, 연결 라벨을 추출하여 AI_Agent에게 전달한다
3. THE XML_Channel SHALL 다이어그램의 원본 XML 전체를 AI_Agent에게 전달한다
4. WHEN 사용자가 일반 질문이나 분석 요청을 보내면, THE DaVinci_App SHALL Summary_Channel을 통해 요약 데이터만 AI_Agent에게 전달한다
5. WHEN 사용자가 다이어그램 생성 또는 수정을 요청하면, THE DaVinci_App SHALL XML_Channel을 통해 원본 XML을 AI_Agent에게 전달한다
6. THE DaVinci_App SHALL aws-analyzer.js와 aws-architecture-builder.js 간 중복된 서비스 분류 로직(AWS_CATEGORIES와 SERVICE_PATTERNS)을 단일 공유 모듈로 통합한다

### 요구사항 3: AI Agent 서버 구조화된 응답 체계

**사용자 스토리:** 개발자로서, AI Agent가 텍스트 조언과 실행 가능한 다이어그램 조작 커맨드를 구조화된 JSON으로 반환하여, 프론트엔드가 자동으로 다이어그램을 수정할 수 있도록 한다.

#### 인수 조건

1. THE AI_Agent SHALL 모든 응답을 Command_Response JSON 형식으로 반환한다. Command_Response는 "message" (텍스트 조언)와 "commands" (실행 가능한 커맨드 배열) 필드를 포함한다
2. WHEN 사용자가 분석이나 조언만 요청하면, THE AI_Agent SHALL "commands" 배열을 빈 배열로 반환하고 "message"에 분석 결과를 포함한다
3. WHEN 사용자가 다이어그램 수정을 요청하면, THE AI_Agent SHALL "commands" 배열에 실행할 다이어그램 조작 커맨드를 포함하고 "message"에 수정 사유를 설명한다
4. THE AI_Agent SHALL 각 커맨드에 "type", "params" 필드를 포함하며, "type"은 Diagram_Controller가 지원하는 5가지 커맨드 타입 중 하나이다
5. IF AI_Agent의 응답이 유효한 Command_Response JSON 형식이 아니면, THEN THE DaVinci_App SHALL 응답 전체를 텍스트 메시지로 표시한다
6. THE AI_Agent SHALL 시스템 프롬프트에 Command_Response JSON 스키마와 사용 가능한 AWS 서비스 목록, mxCell 스타일 참조 정보를 포함한다

### 요구사항 4: 대화 히스토리 기반 맥락 유지

**사용자 스토리:** 사용자로서, AI Agent와 이전 대화 맥락을 유지하며 연속적인 아키텍처 수정 작업을 수행할 수 있다.

#### 인수 조건

1. THE DaVinci_App SHALL 사용자 메시지와 AI_Agent 응답을 Conversation_Context에 순서대로 저장한다
2. WHEN 사용자가 새 메시지를 전송하면, THE DaVinci_App SHALL 이전 대화 히스토리를 AI_Agent 요청에 포함하여 전달한다
3. THE AI_Agent SHALL Bedrock Converse API의 messages 배열에 전체 대화 히스토리를 포함하여 맥락 있는 응답을 생성한다
4. WHILE Conversation_Context의 토큰 수가 모델 컨텍스트 윈도우의 80%를 초과하면, THE DaVinci_App SHALL 가장 오래된 대화부터 순차적으로 제거하여 토큰 한도 이내로 유지한다
5. WHEN 사용자가 "새 대화" 버튼을 클릭하면, THE DaVinci_App SHALL Conversation_Context를 초기화하고 채팅 인터페이스를 웰컴 화면으로 복원한다

### 요구사항 5: 아키텍처 스냅샷 관리

**사용자 스토리:** 사용자로서, AI Agent의 다이어그램 수정 전후 상태를 스냅샷으로 저장하여 변경 사항을 비교하고 필요 시 이전 상태로 되돌릴 수 있다.

#### 인수 조건

1. WHEN Diagram_Controller가 커맨드를 실행하기 직전, THE DaVinci_App SHALL 현재 다이어그램 XML을 Architecture_Snapshot으로 자동 저장한다
2. THE Architecture_Snapshot SHALL 다이어그램 XML, 생성 타임스탬프, 트리거한 커맨드 설명을 포함한다
3. WHEN 사용자가 "되돌리기" 버튼을 클릭하면, THE DaVinci_App SHALL 가장 최근 Architecture_Snapshot의 XML을 DrawIO_Bridge의 loadXml 메서드로 복원한다
4. THE DaVinci_App SHALL 최대 20개의 Architecture_Snapshot을 메모리에 유지하며, 한도 초과 시 가장 오래된 스냅샷부터 제거한다
5. WHEN 스냅샷이 복원되면, THE DaVinci_App SHALL 복원된 시점의 타임스탬프와 커맨드 설명을 토스트 메시지로 표시한다

### 요구사항 6: AWS Well-Architected Framework 평가

**사용자 스토리:** 사용자로서, 현재 아키텍처를 AWS Well-Architected Framework 5개 Pillar 기준으로 평가받아 개선 방향을 파악할 수 있다.

#### 인수 조건

1. WHEN 사용자가 Well-Architected 평가를 요청하면, THE AI_Agent SHALL 현재 아키텍처를 운영 우수성, 보안, 안정성, 성능 효율성, 비용 최적화 5개 Pillar 기준으로 분석한다
2. THE AI_Agent SHALL 각 Pillar에 대해 1~5점 Well_Architected_Score와 근거 설명, 개선 권장사항을 포함하는 평가 결과를 반환한다
3. THE DaVinci_App SHALL Well-Architected 평가 결과를 Pillar별 점수 차트와 상세 설명이 포함된 전용 모달로 표시한다
4. WHEN 평가 결과에 개선 권장사항이 포함되면, THE DaVinci_App SHALL 각 권장사항에 "적용" 버튼을 제공하여 AI_Agent에게 해당 개선을 자동 적용하도록 요청할 수 있다

### 요구사항 7: 서비스 분류 로직 통합

**사용자 스토리:** 개발자로서, aws-analyzer.js의 AWS_CATEGORIES와 aws-architecture-builder.js의 SERVICE_PATTERNS에 중복된 서비스 분류 로직을 단일 모듈로 통합하여 유지보수성을 높인다.

#### 인수 조건

1. THE DaVinci_App SHALL AWS 서비스 분류 매핑(서비스 타입, 카테고리, DrawIO 스타일 패턴, 표시 라벨)을 단일 공유 모듈(aws-service-catalog)에 정의한다
2. THE aws-service-catalog 모듈 SHALL 서비스 타입명으로 카테고리를 조회하는 함수, DrawIO 스타일 문자열로 서비스 타입을 식별하는 함수, 서비스 타입명으로 기본 라벨을 반환하는 함수를 제공한다
3. WHEN aws-service-catalog 모듈이 도입되면, THE aws-analyzer.js와 aws-architecture-builder.js SHALL 자체 서비스 분류 로직을 제거하고 공유 모듈의 함수를 사용한다
4. THE aws-service-catalog 모듈 SHALL AI_Agent의 시스템 프롬프트에 포함할 수 있도록 전체 서비스 목록을 JSON 형태로 내보내는 함수를 제공한다

### 요구사항 8: AI Agent 시스템 프롬프트 고도화

**사용자 스토리:** 개발자로서, AI Agent의 시스템 프롬프트를 고도화하여 현재 아키텍처 상태를 정확히 이해하고 구조화된 응답을 생성할 수 있도록 한다.

#### 인수 조건

1. THE AI_Agent SHALL 시스템 프롬프트에 Command_Response JSON 스키마 정의, 사용 가능한 커맨드 타입과 파라미터 설명, 사용 가능한 AWS 서비스 목록과 DrawIO 스타일 참조를 포함한다
2. WHEN Summary_Channel로 데이터가 전달되면, THE AI_Agent SHALL 시스템 프롬프트에 서비스 목록, 연결 관계, 카테고리 분류를 구조화된 형태로 포함한다
3. WHEN XML_Channel로 데이터가 전달되면, THE AI_Agent SHALL 시스템 프롬프트에 원본 XML을 포함하여 정확한 mxCell 구조를 참조할 수 있도록 한다
4. THE AI_Agent SHALL 시스템 프롬프트에 AWS 모범사례 가이드라인(Multi-AZ, 보안 계층, 모니터링 등)을 포함하여 아키텍처 조언의 품질을 높인다
5. THE AI_Agent SHALL 응답 생성 시 현재 아키텍처에 존재하지 않는 서비스를 참조하는 remove 커맨드를 생성하지 않도록 시스템 프롬프트에 제약 조건을 명시한다
