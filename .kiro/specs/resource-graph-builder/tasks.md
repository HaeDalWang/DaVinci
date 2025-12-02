# Implementation Plan

- [x] 1. 프로젝트 구조 설정
  - 디렉토리 생성 (resource_graph_builder/, tests/)
  - _Requirements: 전체_

- [x] 2. 데이터 모델 및 예외 구현
- [x] 2.1 데이터 모델 정의 (models.py)
  - Node, Edge, Group dataclass 작성
  - 타입 힌트 포함
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2.2 커스텀 예외 구현 (exceptions.py)
  - GraphBuilderError, ParseError, InvalidReferenceError
  - _Requirements: 1.3, 8.1, 8.2_

- [x] 2.3 데이터 모델 property test
  - **Property 11: Graph serialization round-trip**
  - **Validates: Requirements 6.1, 6.4**

- [x] 3. ResourceParser 구현
- [x] 3.1 ResourceParser 클래스 (parser.py)
  - parse 메서드 구현
  - Phase 1 JSON → ParsedResources 변환
  - _Requirements: 1.1, 1.2_

- [x] 3.2 파싱 에러 처리
  - 필수 필드 검증
  - ParseError 발생
  - _Requirements: 1.3, 8.2_

- [x] 3.3 ResourceParser property test
  - **Property 1: Parsing round-trip preserves data**
  - **Validates: Requirements 1.1**

- [x] 3.4 ResourceParser property test
  - **Property 3: Invalid input raises descriptive errors**
  - **Validates: Requirements 1.3, 8.2**

- [x] 4. ResourceGraph 구현
- [x] 4.1 ResourceGraph 클래스 (graph.py)
  - add_node, add_edge, add_group 메서드
  - dict 기반 노드 저장 (O(1) 조회)
  - _Requirements: 6.1_

- [x] 4.2 그래프 직렬화
  - to_dict 메서드 (JSON 직렬화)
  - from_dict 메서드 (역직렬화)
  - metadata 포함
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4.3 ResourceGraph property test
  - **Property 12: JSON contains required sections**
  - **Validates: Requirements 6.2, 6.3**

- [ ] 5. GraphBuilder - VPC/Subnet 엣지 생성
- [x] 5.1 GraphBuilder 클래스 기본 구조 (builder.py)
  - build 메서드 뼈대
  - _create_vpc_edges 메서드 구현
  - VPC-EC2, Subnet-EC2 엣지 생성
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5.2 VPC 엣지 property test
  - **Property 4: EC2 creates edges to VPC and Subnet**
  - **Validates: Requirements 2.1, 2.2**

- [x] 5.3 엣지 타입 property test
  - **Property 5: Edge types are correctly assigned**
  - **Validates: Requirements 2.3, 2.4, 3.2, 4.3**

- [-] 6. GraphBuilder - SecurityGroup 엣지 생성
- [x] 6.1 EC2-SecurityGroup 엣지 구현
  - _create_security_group_edges 메서드
  - EC2에 연결된 모든 SG로 엣지 생성
  - _Requirements: 3.1, 3.2_

- [x] 6.2 SecurityGroup 엣지 property test
  - **Property 6: All SecurityGroups create edges**
  - **Validates: Requirements 3.1**

- [-] 7. GraphBuilder - 트래픽 허용 엣지 생성
- [x] 7.1 SG 규칙 분석 구현
  - _create_traffic_edges 메서드
  - SG 규칙에서 다른 SG 참조 시 엣지 생성
  - 프로토콜, 포트 정보 포함
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7.2 트래픽 엣지 property test
  - **Property 7: SG rules create traffic edges**
  - **Validates: Requirements 4.1, 4.2**

- [x] 7.3 트래픽 속성 property test
  - **Property 8: Traffic edges include protocol and port**
  - **Validates: Requirements 4.4**

- [x] 8. GraphBuilder - VPC 그룹핑
- [x] 8.1 VPC 그룹 생성 구현
  - _create_vpc_groups 메서드
  - VPC별로 Subnet, EC2 그룹핑
  - VPC 속성 포함 (ID, 이름, CIDR)
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 8.2 VPC 그룹 property test
  - **Property 9: VPC groups are created**
  - **Validates: Requirements 5.1**

- [x] 8.3 그룹 속성 property test
  - **Property 10: Groups contain required attributes**
  - **Validates: Requirements 5.3**

- [x] 9. GraphBuilder - 통합 및 검증
- [x] 9.1 build 메서드 완성
  - 전체 프로세스 조율
  - 노드 생성 → 엣지 생성 → 그룹 생성
  - _Requirements: 전체_

- [x] 9.2 참조 검증
  - 유효하지 않은 리소스 참조 확인
  - InvalidReferenceError 발생
  - _Requirements: 8.1_

- [x] 9.3 노드 속성 property test
  - **Property 2: All resources become nodes**
  - **Validates: Requirements 1.2**

- [x] 9.4 노드 필드 property test
  - **Property 13: Nodes contain required fields**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 9.5 참조 에러 property test
  - **Property 14: Invalid references raise exceptions**
  - **Validates: Requirements 8.1**

- [x] 10. Checkpoint - 모든 테스트 통과 확인
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문합니다.

- [x] 11. 통합 테스트 및 문서화
- [x] 11.1 엔드투엔드 통합 테스트
  - Phase 1 출력 → Phase 2 그래프 생성 전체 플로우
  - _Requirements: 전체_

- [x] 11.2 사용 예제 작성
  - README 업데이트
  - Phase 1-2 연계 예제
  - _Requirements: 전체_
