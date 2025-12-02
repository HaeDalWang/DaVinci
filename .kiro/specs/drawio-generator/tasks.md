# Implementation Plan

- [x] 1. 프로젝트 구조 설정
  - 디렉토리 생성 (drawio_generator/, tests/)
  - _Requirements: 전체_

- [x] 2. 데이터 모델 및 예외 구현
- [x] 2.1 데이터 모델 정의 (models.py)
  - Shape, Container, Connector dataclass 작성
  - 타입 힌트 포함
  - _Requirements: 전체_

- [x] 2.2 커스텀 예외 구현 (exceptions.py)
  - DrawioGeneratorError, InvalidGraphError, UnknownNodeTypeError
  - _Requirements: 1.3, 8.1, 8.2_

- [x] 3. ShapeConverter 구현
- [x] 3.1 ShapeConverter 클래스 (converters/shape.py)
  - convert_ec2 메서드 구현
  - AWS Architecture Icons 2025 EC2 아이콘 스타일 적용
  - _Requirements: 2.1, 2.2_

- [x] 3.2 EC2 라벨 생성
  - 이름 + private IP 표시
  - 폰트 크기 12pt
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 3.3 ShapeConverter property test
  - **Property 2: EC2는 아이콘으로 표현**
  - **Validates: Requirements 2.1, 2.2**

- [x] 4. ContainerConverter 구현
- [x] 4.1 ContainerConverter 클래스 (converters/container.py)
  - convert_vpc 메서드 구현
  - AWS VPC Group 아이콘 스타일 적용
  - _Requirements: 2.4, 5.1, 5.2_

- [x] 4.2 Subnet Group 변환
  - convert_subnet 메서드 구현
  - AWS Subnet Group 아이콘 스타일 적용
  - _Requirements: 2.5, 5.3, 5.4_

- [x] 4.3 Container 라벨 생성
  - VPC/Subnet 이름 + CIDR 표시
  - _Requirements: 3.3, 3.4_

- [x] 4.4 ContainerConverter property test
  - **Property 3: VPC는 AWS VPC Group으로 표현**
  - **Validates: Requirements 2.4, 5.1, 5.2**

- [x] 4.5 ContainerConverter property test
  - **Property 4: Subnet은 VPC 내부 AWS Subnet Group으로 표현**
  - **Validates: Requirements 2.5, 5.3, 5.4**

- [x] 5. ConnectorConverter 구현
- [x] 5.1 ConnectorConverter 클래스 (converters/connector.py)
  - convert_traffic_edge 메서드 구현
  - SecurityGroup 간 엣지를 EC2 간 Connector로 변환
  - _Requirements: 4.1, 4.4_

- [x] 5.2 트래픽 라벨 생성
  - 프로토콜 + 포트 형식 (예: "TCP:80")
  - _Requirements: 4.3_

- [x] 5.3 Connector 스타일 적용
  - 굵은 실선 화살표
  - _Requirements: 4.2_

- [x] 5.4 ConnectorConverter property test
  - **Property 7: 트래픽 엣지는 EC2 간 연결선**
  - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 5.5 ConnectorConverter property test
  - **Property 8: 트래픽 라벨 포함**
  - **Validates: Requirements 4.3**

- [x] 6. LayoutEngine 구현
- [x] 6.1 LayoutEngine 클래스 (layout.py)
  - layout_vpcs 메서드 구현
  - VPC를 좌측 상단부터 수평 배치
  - _Requirements: 6.1, 6.6_

- [x] 6.2 Subnet 레이아웃
  - layout_subnets 메서드 구현
  - VPC 내부에 그리드 레이아웃 (2열)
  - _Requirements: 6.2, 6.5_

- [x] 6.3 EC2 레이아웃
  - layout_ec2_instances 메서드 구현
  - Subnet 내부에 그리드 레이아웃 (3열)
  - _Requirements: 6.3, 6.4_

- [x] 6.4 LayoutEngine property test
  - **Property 12: 레이아웃 간격 유지**
  - **Validates: Requirements 6.4, 6.5, 6.6**

- [x] 7. XMLBuilder 구현
- [x] 7.1 XMLBuilder 클래스 (xml_builder.py)
  - build 메서드 구현
  - draw.io XML 구조 생성
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 7.2 mxCell 생성
  - Shape, Container, Connector를 mxCell로 변환
  - AWS 아이콘 스타일 문자열 생성
  - _Requirements: 7.1_

- [x] 7.3 XML 인코딩
  - UTF-8 인코딩
  - 압축되지 않은 형식
  - _Requirements: 7.2, 7.3_

- [x] 7.4 XMLBuilder property test
  - **Property 1: XML 파싱 가능성**
  - **Validates: Requirements 7.1, 7.2**

- [x] 7.5 XMLBuilder property test
  - **Property 13: XML 형식 준수**
  - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 8. DrawioGenerator 통합
- [x] 8.1 DrawioGenerator 클래스 (generator.py)
  - generate 메서드 구현
  - 전체 변환 프로세스 조율
  - _Requirements: 전체_

- [x] 8.2 그래프 JSON 파싱
  - nodes, edges, groups 추출
  - 유효성 검증
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 8.3 SecurityGroup 처리
  - SecurityGroup 노드는 Shape 생성 안 함
  - allows_traffic 엣지만 처리
  - _Requirements: 2.3, 4.5_

- [x] 8.4 DrawioGenerator property test
  - **Property 6: SecurityGroup은 아이콘 없음**
  - **Validates: Requirements 2.3**

- [x] 8.5 DrawioGenerator property test
  - **Property 9: 구조 엣지는 연결선 없음**
  - **Validates: Requirements 4.5**

- [x] 9. 계층 구조 처리
- [x] 9.1 EC2를 Subnet 내부에 배치
  - parent_id 설정
  - 상대 좌표 계산
  - _Requirements: 5.5, 5.6_

- [x] 9.2 Subnet을 VPC 내부에 배치
  - parent_id 설정
  - 상대 좌표 계산
  - _Requirements: 5.5_

- [ ]* 9.3 계층 구조 property test
  - **Property 5: EC2는 Subnet 내부에 배치**
  - **Validates: Requirements 5.5**

- [x] 10. 리소스 정보 표시
- [x] 10.1 EC2 정보 표시
  - 이름 + private IP
  - public IP가 있으면 추가 표시
  - _Requirements: 3.1, 3.2_

- [x] 10.2 Container 정보 표시
  - VPC/Subnet 이름 + CIDR
  - _Requirements: 3.3, 3.4_

- [ ]* 10.3 정보 표시 property test
  - **Property 10: 리소스 정보 표시**
  - **Validates: Requirements 3.1, 3.2**

- [ ]* 10.4 정보 표시 property test
  - **Property 11: Container 정보 표시**
  - **Validates: Requirements 3.3, 3.4**

- [x] 11. 에러 처리
- [x] 11.1 그래프 JSON 검증
  - 필수 필드 확인
  - InvalidGraphError 발생
  - _Requirements: 1.3, 8.1_

- [x] 11.2 알 수 없는 노드 타입 처리
  - UnknownNodeTypeError 발생
  - _Requirements: 8.2_

- [ ]* 11.3 에러 처리 property test
  - **Property 14: 유효하지 않은 입력 에러 처리**
  - **Validates: Requirements 1.3, 8.1, 8.2**

- [x] 12. Checkpoint - 모든 테스트 통과 확인
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문합니다.

- [x] 13. 통합 테스트 및 문서화
- [x] 13.1 엔드투엔드 통합 테스트
  - Phase 2 그래프 JSON → Phase 3 draw.io XML 전체 플로우
  - 생성된 XML을 draw.io에서 열어 확인
  - _Requirements: 전체_

- [x] 13.2 사용 예제 작성
  - README 업데이트
  - Phase 2-3 연계 예제
  - _Requirements: 전체_
