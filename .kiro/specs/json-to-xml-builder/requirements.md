# Requirements Document

## Introduction

DaVinci AWS Architect 앱에서 AI Agent(Bedrock Claude)가 drawio XML을 직접 읽고 생성하는 현재 구조의 문제점을 해결하기 위한 JSON-to-XML 빌더 레이어를 도입한다. AI는 경량 JSON 포맷(서비스 타입, 라벨, 그룹, 연결 관계 등 메타데이터만)을 출력하고, 별도의 빌더 레이어가 이 JSON을 받아서 drawio XML로 변환한다. 서비스 카탈로그에서 아이콘/스타일을 중앙 관리하고, 자동 레이아웃으로 좌표를 계산하여 AI가 좌표나 XML 문법을 신경 쓸 필요가 없도록 한다.

## Glossary

- **Builder**: 경량 JSON 입력을 받아 drawio XML을 생성하는 변환 모듈 (`JsonToXmlBuilder`)
- **Lightweight_JSON**: AI Agent가 출력하는 경량 아키텍처 메타데이터 포맷 (groups, services, connections 구조)
- **Service_Catalog**: AWS 서비스 타입별 drawio 스타일, 아이콘, 라벨, 카테고리 정보를 중앙 관리하는 모듈 (`aws-service-catalog.js`)
- **Layout_Engine**: Lightweight_JSON의 그룹/서비스 구조를 분석하여 drawio mxCell 좌표를 자동 계산하는 모듈
- **DrawIO_XML**: draw.io가 인식하는 mxGraphModel 기반 XML 포맷
- **Channel_Router**: 사용자 요청 유형에 따라 AI에게 전달할 데이터 채널을 결정하는 모듈
- **Diagram_Controller**: AI 응답의 커맨드를 해석하여 DrawIO Bridge로 다이어그램을 조작하는 모듈
- **XML_Summarizer**: 현재 drawio XML을 파싱하여 Lightweight_JSON 형태의 경량 요약으로 변환하는 모듈
- **Server**: Express 백엔드 서버 (`server/index.js`)

## Requirements

### Requirement 1: Lightweight JSON 스키마 정의

**User Story:** As a 개발자, I want Lightweight_JSON 포맷의 명확한 스키마를 정의하고 싶다, so that AI Agent와 Builder 간의 데이터 계약이 일관되게 유지된다.

#### Acceptance Criteria

1. THE Lightweight_JSON SHALL groups 배열을 포함하며, 각 그룹 객체는 id(문자열), type(문자열), label(문자열), children(문자열 배열) 필드를 가진다.
2. THE Lightweight_JSON SHALL services 배열을 포함하며, 각 서비스 객체는 id(문자열), type(문자열), label(문자열), group(문자열, 선택) 필드를 가진다.
3. THE Lightweight_JSON SHALL connections 배열을 포함하며, 각 연결 객체는 from(문자열), to(문자열), label(문자열, 선택) 필드를 가진다.
4. THE Lightweight_JSON SHALL services 배열의 type 필드 값으로 Service_Catalog에 등록된 서비스 타입만 허용한다.
5. THE Lightweight_JSON SHALL groups 배열의 type 필드 값으로 "vpc", "subnet_public", "subnet_private", "az", "asg", "aws_cloud" 중 하나를 허용한다.

### Requirement 2: JSON-to-XML 변환 빌더

**User Story:** As a 개발자, I want Lightweight_JSON을 drawio XML로 변환하는 빌더 모듈을 만들고 싶다, so that AI가 XML 문법을 알 필요 없이 경량 메타데이터만으로 다이어그램을 생성할 수 있다.

#### Acceptance Criteria

1. WHEN 유효한 Lightweight_JSON이 제공되면, THE Builder SHALL 해당 JSON을 draw.io가 인식하는 mxGraphModel XML로 변환한다.
2. WHEN Lightweight_JSON의 services 배열에 서비스가 포함되면, THE Builder SHALL Service_Catalog에서 해당 서비스 타입의 drawio 스타일 문자열을 조회하여 mxCell style 속성에 적용한다.
3. WHEN Lightweight_JSON의 groups 배열에 그룹이 포함되면, THE Builder SHALL 그룹을 container=1 속성을 가진 mxCell로 생성하고, children에 명시된 서비스/그룹을 해당 컨테이너의 자식으로 배치한다.
4. WHEN Lightweight_JSON의 connections 배열에 연결이 포함되면, THE Builder SHALL 각 연결을 source와 target이 지정된 edge mxCell로 생성한다.
5. IF Lightweight_JSON의 services에 Service_Catalog에 등록되지 않은 type이 포함되면, THEN THE Builder SHALL 해당 서비스를 기본 스타일(제네릭 AWS 아이콘)로 렌더링하고 경고를 콘솔에 출력한다.
6. IF Lightweight_JSON의 connections에 존재하지 않는 서비스 id가 참조되면, THEN THE Builder SHALL 해당 연결을 무시하고 경고를 콘솔에 출력한다.
7. THE Builder SHALL 생성된 XML의 모든 mxCell에 고유한 id를 부여한다.

### Requirement 3: 자동 레이아웃 엔진

**User Story:** As a 개발자, I want 빌더가 서비스와 그룹의 좌표를 자동으로 계산하길 원한다, so that AI가 좌표를 지정할 필요 없이 깔끔한 다이어그램이 생성된다.

#### Acceptance Criteria

1. WHEN Lightweight_JSON에 그룹 계층 구조가 포함되면, THE Layout_Engine SHALL 그룹 내부에 자식 서비스를 균등 간격으로 배치한다.
2. WHEN Lightweight_JSON에 중첩 그룹(예: VPC > Subnet)이 포함되면, THE Layout_Engine SHALL 부모 그룹의 크기를 자식 그룹과 서비스를 모두 포함할 수 있도록 자동 계산한다.
3. THE Layout_Engine SHALL 서비스 아이콘 간 최소 간격을 40px 이상으로 유지한다.
4. THE Layout_Engine SHALL 그룹 컨테이너 내부에 라벨 영역(상단 30px)을 확보한 후 자식 요소를 배치한다.
5. WHEN 그룹에 속하지 않는 서비스가 존재하면, THE Layout_Engine SHALL 해당 서비스를 다이어그램 최상위 레벨에 배치한다.

### Requirement 4: 서비스 카탈로그 확장

**User Story:** As a 개발자, I want Service_Catalog가 빌더에 필요한 drawio 스타일 정보를 완전하게 제공하길 원한다, so that 빌더가 서비스 타입만으로 올바른 아이콘과 스타일을 적용할 수 있다.

#### Acceptance Criteria

1. THE Service_Catalog SHALL 각 서비스 타입에 대해 완전한 drawio mxCell 스타일 문자열을 제공하는 함수를 노출한다.
2. THE Service_Catalog SHALL 각 그룹 타입(vpc, subnet_public, subnet_private, az, asg, aws_cloud)에 대해 완전한 drawio 컨테이너 스타일 문자열을 제공하는 함수를 노출한다.
3. THE Service_Catalog SHALL 각 서비스 타입에 대해 기본 아이콘 크기(width, height)를 제공한다.
4. WHEN 등록되지 않은 서비스 타입이 조회되면, THE Service_Catalog SHALL null을 반환한다.

### Requirement 5: XML-to-JSON 역변환 (XML Summarizer)

**User Story:** As a 개발자, I want 현재 drawio XML을 Lightweight_JSON으로 역변환하고 싶다, so that AI에게 현재 아키텍처 상태를 경량 포맷으로 전달할 수 있다.

#### Acceptance Criteria

1. WHEN 유효한 drawio XML이 제공되면, THE XML_Summarizer SHALL 해당 XML을 Lightweight_JSON 포맷으로 변환한다.
2. THE XML_Summarizer SHALL XML의 container mxCell을 groups 배열로, 서비스 mxCell을 services 배열로, edge mxCell을 connections 배열로 분류한다.
3. THE XML_Summarizer SHALL 각 서비스 mxCell의 style 속성을 Service_Catalog의 패턴과 매칭하여 서비스 type을 식별한다.
4. THE XML_Summarizer SHALL mxCell의 parent 속성을 기반으로 그룹-서비스 간 계층 관계를 복원한다.
5. FOR ALL 유효한 Lightweight_JSON 객체에 대해, Builder로 XML을 생성한 후 XML_Summarizer로 역변환하면 원본과 동등한 구조(서비스 타입, 그룹 관계, 연결 관계)를 가진 Lightweight_JSON이 생성된다 (라운드트립 속성).

### Requirement 6: Channel Router 통합

**User Story:** As a 개발자, I want Channel_Router가 XML 대신 Lightweight_JSON을 AI에게 전달하도록 변경하고 싶다, so that AI에게 전송되는 토큰 양이 대폭 감소한다.

#### Acceptance Criteria

1. WHEN 수정/생성 의도가 감지되면, THE Channel_Router SHALL 현재 drawio XML을 XML_Summarizer로 변환한 Lightweight_JSON을 AI에게 전달한다.
2. WHEN 분석/조언 의도가 감지되면, THE Channel_Router SHALL 기존 summary 채널의 분석 데이터를 AI에게 전달한다.
3. THE Channel_Router SHALL 더 이상 원본 drawio XML 전체를 AI에게 전달하지 않는다.

### Requirement 7: Server 시스템 프롬프트 변경

**User Story:** As a 개발자, I want Server의 시스템 프롬프트가 AI에게 Lightweight_JSON 포맷으로 응답하도록 지시하길 원한다, so that AI가 XML 대신 경량 JSON을 출력한다.

#### Acceptance Criteria

1. THE Server SHALL 시스템 프롬프트에 Lightweight_JSON 스키마와 응답 형식을 포함한다.
2. THE Server SHALL 시스템 프롬프트에서 replace_all 커맨드의 params를 xml 필드 대신 architecture 필드(Lightweight_JSON 객체)로 변경한다.
3. THE Server SHALL 시스템 프롬프트에서 AI가 drawio XML을 직접 생성하지 않도록 명시적으로 지시한다.
4. THE Server SHALL AI에게 전달하는 현재 아키텍처 컨텍스트를 Lightweight_JSON 포맷으로 제공한다.

### Requirement 8: Diagram Controller 통합

**User Story:** As a 개발자, I want Diagram_Controller가 AI의 Lightweight_JSON 응답을 Builder를 통해 XML로 변환하여 다이어그램에 적용하고 싶다, so that 전체 파이프라인이 JSON 기반으로 동작한다.

#### Acceptance Criteria

1. WHEN replace_all 커맨드의 params에 architecture 필드(Lightweight_JSON)가 포함되면, THE Diagram_Controller SHALL Builder를 호출하여 XML로 변환한 후 DrawIO Bridge에 로드한다.
2. WHEN replace_all 커맨드의 params에 기존 xml 필드가 포함되면, THE Diagram_Controller SHALL 하위 호환성을 위해 해당 XML을 직접 DrawIO Bridge에 로드한다.
3. WHEN add_service 커맨드가 실행되면, THE Diagram_Controller SHALL 현재 다이어그램 XML을 XML_Summarizer로 Lightweight_JSON으로 변환하고, 새 서비스를 추가한 후, Builder로 전체 XML을 재생성하여 로드한다.
4. IF Builder가 XML 변환 중 오류를 반환하면, THEN THE Diagram_Controller SHALL 스냅샷에서 이전 상태로 롤백하고 사용자에게 오류 메시지를 표시한다.

### Requirement 9: 엣지 스타일 관리

**User Story:** As a 개발자, I want 연결선(Edge)의 스타일이 중앙에서 관리되길 원한다, so that 일관된 다이어그램 스타일이 유지된다.

#### Acceptance Criteria

1. THE Builder SHALL 모든 연결선에 orthogonalEdgeStyle, rounded=1, strokeColor=#6B7785, strokeWidth=1.5 기본 스타일을 적용한다.
2. WHERE Lightweight_JSON의 connection 객체에 style 필드가 포함되면, THE Builder SHALL 기본 스타일 대신 지정된 스타일을 적용한다.
