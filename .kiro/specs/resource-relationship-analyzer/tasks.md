# Implementation Plan

- [ ] 1. 프로젝트 구조 및 기본 설정
  - 디렉토리 구조 생성 (resource_relationship_analyzer/, tests/)
  - 필요한 의존성 추가 (networkx는 선택적)
  - _Requirements: 전체_

- [ ] 2. 데이터 모델 및 예외 클래스 구현
- [ ] 2.1 데이터 모델 정의 (models.py)
  - Node, Edge, ResourceGroup, ParsedResources dataclass 작성
  - 타입 힌트 포함
  - _Requirements: 6.2, 6.3, 7.3_

- [ ] 2.2 커스텀 예외 클래스 구현 (exceptions.py)
  - RelationshipAnalyzerError, ParseError, InvalidReferenceError, GraphSerializationError 작성
  - 에러 메시지 포맷팅
  - _Requirements: 1.3, 9.1, 9.3_

- [ ]* 2.3 데이터 모델 property test 작성
  - **Property 14: Graph serialization round-trip**
  - **Validates: Requirements 6.4, 8.1, 8.4**

- [ ] 3. ResourceParser 구현
- [ ] 3.1 ResourceParser 클래스 구현 (parser.py)
  - parse_resources 메서드 구현
  - Phase 1 JSON 데이터를 ParsedResources로 변환
  - 필수 필드 검증
  - _Requirements: 1.1, 1.2_

- [ ] 3.2 파싱 에러 처리 구현
  - 필수 필드 누락, 타입 불일치 처리
  - ParseError 발생
  - _Requirements: 1.3, 9.3_

- [ ]* 3.3 ResourceParser property test 작성
  - **Property 1: Parsing round-trip preserves structure**
  - **Validates: Requirements 1.1**

- [ ]* 3.4 ResourceParser property test 작성
  - **Property 2: Parsed resources contain required fields**
  - **Validates: Requirements 1.2**

- [ ]* 3.5 ResourceParser property test 작성
  - **Property 3: Invalid input raises descriptive errors**
  - **Validates: Requirements 1.3, 9.3**

- [ ] 4. ResourceGraph 구현
- [ ] 4.1 ResourceGraph 클래스 구현 (graph.py)
  - add_node, add_edge 메서드 구현
  - get_node, get_edges_from, get_edges_to 메서드 구현
  - 내부적으로 dict 기반 인덱싱 사용 (O(1) 조회)
  - _Requirements: 6.1_

- [ ] 4.2 그래프 직렬화 구현
  - to_dict 메서드 구현 (JSON 직렬화용)
  - from_dict 메서드 구현 (역직렬화용)
  - _Requirements: 6.4, 8.1_

- [ ]* 4.3 ResourceGraph property test 작성
  - **Property 11: Graph contains all resources as nodes**
  - **Validates: Requirements 6.1**

- [ ]* 4.4 ResourceGraph property test 작성
  - **Property 12: Nodes contain complete data**
  - **Validates: Requirements 6.2**

- [ ]* 4.5 ResourceGraph property test 작성
  - **Property 13: Edges contain complete data**
  - **Validates: Requirements 6.3**

- [ ] 5. RelationshipAnalyzer 구현
- [ ] 5.1 RelationshipAnalyzer 클래스 구현 (analyzers/relationship.py)
  - analyze_vpc_relationships 메서드 구현
  - VPC-EC2, Subnet-EC2 관계 생성
  - 관계 타입 설정 ("contains", "hosts")
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5.2 SecurityGroup 관계 분석 구현
  - analyze_security_group_relationships 메서드 구현
  - EC2-SecurityGroup 관계 생성
  - 관계 타입 설정 ("protected_by")
  - _Requirements: 3.1, 3.2_

- [ ]* 5.3 RelationshipAnalyzer property test 작성
  - **Property 4: EC2 analysis identifies VPC and Subnet**
  - **Validates: Requirements 2.1, 2.2**

- [ ]* 5.4 RelationshipAnalyzer property test 작성
  - **Property 5: Relationship types are correctly assigned**
  - **Validates: Requirements 2.3, 2.4, 3.2**

- [ ]* 5.5 RelationshipAnalyzer property test 작성
  - **Property 6: All SecurityGroups are identified**
  - **Validates: Requirements 3.1**

- [ ] 6. ConnectivityAnalyzer 구현
- [ ] 6.1 ConnectivityAnalyzer 클래스 구현 (analyzers/connectivity.py)
  - analyze_security_group_rules 메서드 구현
  - SecurityGroup 규칙에서 소스/대상 식별
  - SG 간 "allows_traffic_from/to" 관계 생성
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6.2 SecurityGroup 규칙 속성 포함
  - 프로토콜, 포트 정보를 관계 속성에 추가
  - _Requirements: 4.4_

- [ ] 6.3 EC2 간 통신 가능 여부 분석 구현
  - analyze_instance_connectivity 메서드 구현
  - 양방향 SecurityGroup 규칙 검증
  - "can_communicate_with" 관계 생성
  - _Requirements: 5.2, 5.3_

- [ ]* 6.4 ConnectivityAnalyzer property test 작성
  - **Property 7: SecurityGroup rules identify sources and destinations**
  - **Validates: Requirements 4.1, 4.2**

- [ ]* 6.5 ConnectivityAnalyzer property test 작성
  - **Property 8: SecurityGroup relationships include protocol and port**
  - **Validates: Requirements 4.4, 5.3**

- [ ]* 6.6 ConnectivityAnalyzer property test 작성
  - **Property 9: SG-to-SG relationships are created correctly**
  - **Validates: Requirements 4.3**

- [ ]* 6.7 ConnectivityAnalyzer property test 작성
  - **Property 10: Bidirectional communication creates relationship**
  - **Validates: Requirements 5.2**

- [ ] 7. GroupingAnalyzer 구현
- [ ] 7.1 GroupingAnalyzer 클래스 구현 (analyzers/grouping.py)
  - group_by_vpc 메서드 구현
  - VPC별로 리소스 그룹핑
  - ungrouped 카테고리 처리
  - _Requirements: 7.1, 7.4_

- [ ] 7.2 그룹 메타데이터 포함
  - VPC ID, 이름, CIDR 블록 정보 추가
  - _Requirements: 7.3_

- [ ]* 7.3 GroupingAnalyzer property test 작성
  - **Property 15: VPC grouping includes all members**
  - **Validates: Requirements 7.1**

- [ ]* 7.4 GroupingAnalyzer property test 작성
  - **Property 16: Groups contain required metadata**
  - **Validates: Requirements 7.3**

- [ ] 8. Checkpoint - 모든 테스트 통과 확인
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문합니다.

- [ ] 9. RelationshipGraphBuilder 통합 인터페이스 구현
- [ ] 9.1 RelationshipGraphBuilder 클래스 구현 (builder.py)
  - build_graph 메서드 구현
  - 전체 분석 프로세스 조율 (파싱 → 관계 분석 → 연결성 분석 → 그룹핑)
  - ResourceGraph 반환
  - _Requirements: 전체_

- [ ] 9.2 JSON 내보내기 구현
  - export_to_json 메서드 구현
  - metadata, nodes, edges, groups 섹션 포함
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 9.3 참조 에러 처리
  - 유효하지 않은 리소스 참조 검증
  - InvalidReferenceError 발생
  - _Requirements: 9.1_

- [ ]* 9.4 RelationshipGraphBuilder property test 작성
  - **Property 17: JSON export contains required sections**
  - **Validates: Requirements 8.2, 8.3**

- [ ]* 9.5 RelationshipGraphBuilder property test 작성
  - **Property 18: Invalid references raise exceptions**
  - **Validates: Requirements 9.1**

- [ ] 10. Checkpoint - 모든 테스트 통과 확인
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문합니다.

- [ ] 11. 통합 테스트 및 문서화
- [ ] 11.1 엔드투엔드 통합 테스트 작성
  - Phase 1 출력을 입력으로 사용하는 전체 플로우 테스트
  - 실제 시나리오 시뮬레이션
  - _Requirements: 전체_

- [ ] 11.2 사용 예제 작성
  - README.md에 기본 사용법 추가
  - Phase 1과 Phase 2 연계 예제
  - _Requirements: 전체_
