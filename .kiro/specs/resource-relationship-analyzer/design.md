# Design Document

## Overview

리소스 관계 분석 시스템은 Phase 1에서 수집한 AWS 리소스 데이터를 입력받아, 리소스 간 연관성과 네트워크 연결성을 분석하여 그래프 구조로 표현합니다. 이 시스템은 VPC 내부 네트워크 구조, EC2 인스턴스 간 통신 가능 여부, 보안그룹 규칙 기반 트래픽 흐름을 파악하여 Phase 3의 다이어그램 생성을 위한 구조화된 데이터를 제공합니다.

## Architecture

시스템은 4개의 주요 레이어로 구성됩니다:

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (통합 분석 인터페이스)              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Analysis Layer                  │
│  - RelationshipAnalyzer             │
│  - ConnectivityAnalyzer             │
│  - GroupingAnalyzer                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Graph Layer                     │
│  - ResourceGraph                    │
│  - Node / Edge                      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Data Layer                      │
│  - ResourceParser                   │
│  - JSON Serializer                  │
└─────────────────────────────────────┘
```

### 레이어 설명:

1. **Data Layer**: Phase 1 JSON 데이터 파싱 및 직렬화
2. **Graph Layer**: 그래프 자료구조 (노드, 엣지) 관리
3. **Analysis Layer**: 관계 분석, 연결성 분석, 그룹핑 로직
4. **Application Layer**: 전체 분석 프로세스 조율

## Components and Interfaces

### 1. ResourceParser

Phase 1의 JSON 데이터를 파싱하는 컴포넌트입니다.

```python
class ResourceParser:
    def parse_resources(self, json_data: dict) -> ParsedResources:
        """
        Phase 1 JSON 데이터를 파싱
        
        Args:
            json_data: {
                'ec2_instances': list[dict],
                'vpcs': list[dict],
                'security_groups': list[dict]
            }
            
        Returns:
            ParsedResources: {
                'ec2_instances': list[EC2Instance],
                'vpcs': list[VPC],
                'security_groups': list[SecurityGroup]
            }
            
        Raises:
            ParseError: 데이터 파싱 실패 시
        """
```

### 2. ResourceGraph

리소스와 관계를 그래프로 표현하는 컴포넌트입니다.

```python
class ResourceGraph:
    def add_node(self, node: Node) -> None:
        """노드 추가"""
        
    def add_edge(self, edge: Edge) -> None:
        """엣지 추가"""
        
    def get_node(self, node_id: str) -> Node | None:
        """노드 조회"""
        
    def get_edges_from(self, node_id: str) -> list[Edge]:
        """특정 노드에서 나가는 엣지 조회"""
        
    def get_edges_to(self, node_id: str) -> list[Edge]:
        """특정 노드로 들어오는 엣지 조회"""
        
    def to_dict(self) -> dict:
        """그래프를 dict로 변환 (JSON 직렬화용)"""
```

### 3. RelationshipAnalyzer

리소스 간 기본 관계를 분석하는 컴포넌트입니다.

```python
class RelationshipAnalyzer:
    def analyze_vpc_relationships(
        self, 
        ec2_instances: list[EC2Instance], 
        vpcs: list[VPC]
    ) -> list[Edge]:
        """
        VPC-EC2, Subnet-EC2 관계 분석
        
        Returns:
            list[Edge]: [
                Edge(
                    source='vpc-xxx',
                    target='i-xxx',
                    relationship_type='contains',
                    attributes={}
                ),
                Edge(
                    source='subnet-xxx',
                    target='i-xxx',
                    relationship_type='hosts',
                    attributes={}
                )
            ]
        """
        
    def analyze_security_group_relationships(
        self,
        ec2_instances: list[EC2Instance],
        security_groups: list[SecurityGroup]
    ) -> list[Edge]:
        """
        EC2-SecurityGroup 관계 분석
        
        Returns:
            list[Edge]: [
                Edge(
                    source='i-xxx',
                    target='sg-xxx',
                    relationship_type='protected_by',
                    attributes={}
                )
            ]
        """
```

### 4. ConnectivityAnalyzer

SecurityGroup 규칙 기반 연결성을 분석하는 컴포넌트입니다.

```python
class ConnectivityAnalyzer:
    def analyze_security_group_rules(
        self,
        security_groups: list[SecurityGroup]
    ) -> list[Edge]:
        """
        SecurityGroup 간 트래픽 허용 관계 분석
        
        Returns:
            list[Edge]: [
                Edge(
                    source='sg-xxx',
                    target='sg-yyy',
                    relationship_type='allows_traffic_to',
                    attributes={
                        'protocol': 'tcp',
                        'from_port': 80,
                        'to_port': 80
                    }
                )
            ]
        """
        
    def analyze_instance_connectivity(
        self,
        ec2_instances: list[EC2Instance],
        security_groups: list[SecurityGroup]
    ) -> list[Edge]:
        """
        EC2 인스턴스 간 통신 가능 여부 분석
        
        Returns:
            list[Edge]: [
                Edge(
                    source='i-xxx',
                    target='i-yyy',
                    relationship_type='can_communicate_with',
                    attributes={
                        'protocol': 'tcp',
                        'ports': [80, 443]
                    }
                )
            ]
        """
```

### 5. GroupingAnalyzer

VPC별 리소스 그룹핑을 수행하는 컴포넌트입니다.

```python
class GroupingAnalyzer:
    def group_by_vpc(
        self,
        graph: ResourceGraph,
        vpcs: list[VPC]
    ) -> dict[str, ResourceGroup]:
        """
        VPC별로 리소스 그룹핑
        
        Returns:
            dict[str, ResourceGroup]: {
                'vpc-xxx': ResourceGroup(
                    group_id='vpc-xxx',
                    group_type='vpc',
                    name='Production VPC',
                    members=['i-xxx', 'subnet-xxx', 'sg-xxx'],
                    attributes={'cidr_block': '10.0.0.0/16'}
                ),
                'ungrouped': ResourceGroup(...)
            }
        """
```

### 6. RelationshipGraphBuilder (통합 인터페이스)

전체 분석 프로세스를 조율하는 고수준 인터페이스입니다.

```python
class RelationshipGraphBuilder:
    def build_graph(self, json_data: dict) -> ResourceGraph:
        """
        Phase 1 JSON 데이터로부터 관계 그래프 생성
        
        Args:
            json_data: Phase 1의 리소스 조회 결과
            
        Returns:
            ResourceGraph: 노드, 엣지, 그룹 정보를 포함한 그래프
            
        Process:
            1. JSON 데이터 파싱
            2. 리소스를 노드로 추가
            3. 기본 관계 분석 (VPC-EC2, EC2-SG)
            4. 연결성 분석 (SG 규칙, 인스턴스 간 통신)
            5. VPC별 그룹핑
            6. 그래프 반환
        """
        
    def export_to_json(self, graph: ResourceGraph) -> dict:
        """
        그래프를 JSON으로 직렬화
        
        Returns:
            dict: {
                'metadata': {
                    'analyzed_at': str,
                    'node_count': int,
                    'edge_count': int,
                    'group_count': int
                },
                'nodes': [
                    {
                        'id': str,
                        'type': str,
                        'name': str,
                        'attributes': dict
                    }
                ],
                'edges': [
                    {
                        'source': str,
                        'target': str,
                        'relationship_type': str,
                        'attributes': dict
                    }
                ],
                'groups': [
                    {
                        'group_id': str,
                        'group_type': str,
                        'name': str,
                        'members': list[str],
                        'attributes': dict
                    }
                ]
            }
        """
```

## Data Models

### Node

```python
@dataclass
class Node:
    id: str                    # 리소스 ID (e.g., 'i-xxx', 'vpc-xxx')
    type: str                  # 리소스 타입 (e.g., 'ec2', 'vpc', 'security_group')
    name: str                  # 리소스 이름
    attributes: dict[str, Any] # 추가 속성 (IP, CIDR 등)
```

### Edge

```python
@dataclass
class Edge:
    source: str                # 소스 노드 ID
    target: str                # 타겟 노드 ID
    relationship_type: str     # 관계 타입 (e.g., 'contains', 'protected_by')
    attributes: dict[str, Any] # 관계 속성 (프로토콜, 포트 등)
```

### ResourceGroup

```python
@dataclass
class ResourceGroup:
    group_id: str              # 그룹 ID (VPC ID 또는 'ungrouped')
    group_type: str            # 그룹 타입 (e.g., 'vpc')
    name: str                  # 그룹 이름
    members: list[str]         # 그룹에 속한 노드 ID 목록
    attributes: dict[str, Any] # 그룹 속성 (CIDR 등)
```

### ParsedResources

```python
@dataclass
class ParsedResources:
    ec2_instances: list[EC2Instance]
    vpcs: list[VPC]
    security_groups: list[SecurityGroup]
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Parsing round-trip preserves structure

*For any* 유효한 Phase 1 JSON 데이터, 파싱 후 다시 JSON으로 직렬화하면 동일한 구조를 유지해야 한다.

**Validates: Requirements 1.1**

### Property 2: Parsed resources contain required fields

*For any* 유효한 JSON 데이터를 파싱할 때, 모든 리소스 객체는 ID, 타입, 필수 속성을 포함해야 한다.

**Validates: Requirements 1.2**

### Property 3: Invalid input raises descriptive errors

*For any* 유효하지 않은 입력 데이터, 파싱 실패 시 실패한 필드와 예상 형식을 포함한 명확한 에러 메시지를 가진 예외가 발생해야 한다.

**Validates: Requirements 1.3, 9.3**

### Property 4: EC2 analysis identifies VPC and Subnet

*For any* EC2 인스턴스 데이터를 분석할 때, 해당 인스턴스가 속한 VPC와 Subnet이 올바르게 식별되어야 한다.

**Validates: Requirements 2.1, 2.2**

### Property 5: Relationship types are correctly assigned

*For any* 생성된 관계, 관계 타입이 올바르게 설정되어야 한다 (VPC-EC2는 "contains", Subnet-EC2는 "hosts", EC2-SG는 "protected_by").

**Validates: Requirements 2.3, 2.4, 3.2**

### Property 6: All SecurityGroups are identified

*For any* EC2 인스턴스에 연결된 모든 SecurityGroup, 각 SecurityGroup마다 별도의 관계가 생성되어야 한다.

**Validates: Requirements 3.1**

### Property 7: SecurityGroup rules identify sources and destinations

*For any* SecurityGroup 규칙을 분석할 때, 인바운드 규칙의 소스와 아웃바운드 규칙의 대상이 올바르게 식별되어야 한다.

**Validates: Requirements 4.1, 4.2**

### Property 8: SecurityGroup relationships include protocol and port

*For any* SecurityGroup 간 관계, 관계 속성에 프로토콜과 포트 정보가 포함되어야 한다.

**Validates: Requirements 4.4, 5.3**

### Property 9: SG-to-SG relationships are created correctly

*For any* SecurityGroup 규칙이 다른 SecurityGroup을 참조할 때, 두 SecurityGroup 간 "allows_traffic_from" 또는 "allows_traffic_to" 관계가 생성되어야 한다.

**Validates: Requirements 4.3**

### Property 10: Bidirectional communication creates relationship

*For any* 두 EC2 인스턴스 쌍, 양방향 SecurityGroup 규칙이 허용하는 경우에만 "can_communicate_with" 관계가 생성되어야 한다.

**Validates: Requirements 5.2**

### Property 11: Graph contains all resources as nodes

*For any* 입력 리소스 데이터, 생성된 그래프는 모든 리소스를 노드로 포함해야 한다.

**Validates: Requirements 6.1**

### Property 12: Nodes contain complete data

*For any* 그래프의 노드, 리소스 ID, 타입, 이름, 속성을 포함해야 한다.

**Validates: Requirements 6.2**

### Property 13: Edges contain complete data

*For any* 그래프의 엣지, 관계 타입, 소스, 타겟, 속성을 포함해야 한다.

**Validates: Requirements 6.3**

### Property 14: Graph serialization round-trip

*For any* 생성된 그래프, JSON으로 직렬화 후 역직렬화하면 동일한 그래프 구조를 복원해야 한다.

**Validates: Requirements 6.4, 8.1, 8.4**

### Property 15: VPC grouping includes all members

*For any* VPC, 해당 VPC에 속한 모든 Subnet과 EC2 인스턴스가 그룹에 포함되어야 한다.

**Validates: Requirements 7.1**

### Property 16: Groups contain required metadata

*For any* 생성된 그룹, VPC ID, 이름, CIDR 블록 정보를 포함해야 한다.

**Validates: Requirements 7.3**

### Property 17: JSON export contains required sections

*For any* 그래프를 JSON으로 내보낼 때, nodes, edges, groups, metadata 섹션을 포함해야 한다.

**Validates: Requirements 8.2, 8.3**

### Property 18: Invalid references raise exceptions

*For any* 유효하지 않은 리소스 참조, 해당 리소스 ID와 에러 메시지를 포함한 예외가 발생해야 한다.

**Validates: Requirements 9.1**


## Error Handling

### Error Types

시스템은 다음과 같은 커스텀 예외를 정의합니다:

```python
class RelationshipAnalyzerError(Exception):
    """Base exception for all analyzer errors"""
    pass

class ParseError(RelationshipAnalyzerError):
    """데이터 파싱 실패 시 발생"""
    def __init__(self, field: str, expected_type: str, actual_value: Any):
        self.field = field
        self.expected_type = expected_type
        self.actual_value = actual_value
        super().__init__(
            f"Failed to parse field '{field}': expected {expected_type}, got {type(actual_value).__name__}"
        )

class InvalidReferenceError(RelationshipAnalyzerError):
    """유효하지 않은 리소스 참조 시 발생"""
    def __init__(self, resource_id: str, resource_type: str):
        self.resource_id = resource_id
        self.resource_type = resource_type
        super().__init__(f"Invalid {resource_type} reference: {resource_id}")

class GraphSerializationError(RelationshipAnalyzerError):
    """그래프 직렬화/역직렬화 실패 시 발생"""
    def __init__(self, message: str, original_error: Exception | None = None):
        self.original_error = original_error
        super().__init__(f"Graph serialization failed: {message}")
```

### Error Handling Strategy

1. **파싱 에러**:
   - 필수 필드 누락 → ParseError 발생 (필드명, 예상 타입 포함)
   - 타입 불일치 → ParseError 발생 (실제 값 포함)
   - 잘못된 JSON 형식 → ParseError 발생

2. **참조 에러**:
   - 존재하지 않는 VPC 참조 → InvalidReferenceError 발생
   - 존재하지 않는 SecurityGroup 참조 → InvalidReferenceError 발생
   - 순환 참조 → 경고 로그 출력, 분석 계속 진행

3. **직렬화 에러**:
   - JSON 직렬화 실패 → GraphSerializationError 발생
   - 역직렬화 실패 → GraphSerializationError 발생

## Testing Strategy

### Unit Testing

각 컴포넌트별로 단위 테스트를 작성합니다:

1. **ResourceParser 테스트**:
   - 정상적인 JSON 파싱
   - 필수 필드 누락 처리
   - 타입 불일치 처리

2. **RelationshipAnalyzer 테스트**:
   - VPC-EC2 관계 분석
   - EC2-SecurityGroup 관계 분석
   - 관계 타입 검증

3. **ConnectivityAnalyzer 테스트**:
   - SecurityGroup 규칙 분석
   - EC2 간 통신 가능 여부 판단
   - 양방향 통신 검증

4. **GroupingAnalyzer 테스트**:
   - VPC별 그룹핑
   - ungrouped 리소스 처리

5. **ResourceGraph 테스트**:
   - 노드/엣지 추가
   - 그래프 조회
   - JSON 직렬화/역직렬화

### Property-Based Testing

pytest와 Hypothesis 라이브러리를 사용하여 property-based testing을 구현합니다.

**설정**:
- 각 property test는 최소 100회 반복 실행
- 각 테스트는 설계 문서의 correctness property를 명시적으로 참조

**테스트 전략**:
1. **파싱 round-trip 테스트**: 임의의 유효한 JSON 데이터를 생성하여 파싱 후 재직렬화가 원본을 보존하는지 검증
2. **관계 생성 테스트**: 임의의 리소스 조합을 생성하여 올바른 관계가 생성되는지 검증
3. **그래프 직렬화 테스트**: 임의의 그래프를 생성하여 JSON round-trip이 구조를 보존하는지 검증
4. **연결성 분석 테스트**: 임의의 SecurityGroup 규칙을 생성하여 통신 가능 여부가 올바르게 판단되는지 검증

**Property Test 태그 형식**:
```python
# Feature: resource-relationship-analyzer, Property 1: Parsing round-trip preserves structure
```

**Hypothesis 전략 (Generators)**:

```python
# 임의의 EC2 인스턴스 생성
@st.composite
def ec2_instance_strategy(draw):
    return {
        'instance_id': draw(st.text(min_size=10, max_size=20)),
        'name': draw(st.text(min_size=1, max_size=50)),
        'vpc_id': draw(st.text(min_size=10, max_size=20)),
        'subnet_id': draw(st.text(min_size=10, max_size=20)),
        'security_groups': draw(st.lists(st.text(min_size=10, max_size=20), min_size=1, max_size=5))
    }

# 임의의 SecurityGroup 규칙 생성
@st.composite
def security_group_rule_strategy(draw):
    return {
        'protocol': draw(st.sampled_from(['tcp', 'udp', 'icmp', '-1'])),
        'from_port': draw(st.integers(min_value=0, max_value=65535)),
        'to_port': draw(st.integers(min_value=0, max_value=65535)),
        'source': draw(st.one_of(
            st.text(regex=r'\d+\.\d+\.\d+\.\d+/\d+'),  # CIDR
            st.text(min_size=10, max_size=20)  # SG ID
        ))
    }
```

## Implementation Notes

### 기술 스택
- **언어**: Python 3.11+
- **그래프 라이브러리**: networkx (선택적, 또는 자체 구현)
- **테스팅**: pytest, hypothesis
- **타입 체킹**: mypy

### 디렉토리 구조
```
resource_relationship_analyzer/
├── __init__.py
├── models.py              # Node, Edge, ResourceGroup 데이터 모델
├── exceptions.py          # 커스텀 예외
├── parser.py              # ResourceParser
├── graph.py               # ResourceGraph
├── analyzers/
│   ├── __init__.py
│   ├── relationship.py    # RelationshipAnalyzer
│   ├── connectivity.py    # ConnectivityAnalyzer
│   └── grouping.py        # GroupingAnalyzer
└── builder.py             # RelationshipGraphBuilder (통합 인터페이스)

tests/
├── __init__.py
├── test_parser.py
├── test_graph.py
├── test_analyzers/
│   ├── test_relationship.py
│   ├── test_connectivity.py
│   └── test_grouping.py
├── test_builder.py
└── property_tests/
    ├── test_properties.py  # Property-based tests
    └── generators.py       # Hypothesis 전략
```

### 성능 고려사항
- 그래프 조회는 O(1) 시간 복잡도 (dict 기반 인덱싱)
- 대량의 리소스 처리 시 메모리 사용량 모니터링
- SecurityGroup 규칙 분석은 O(n²) 복잡도 (모든 쌍 비교)

### 확장성 고려사항
- 추후 RDS, ECS 등 다른 리소스 타입 추가 가능하도록 설계
- Analyzer는 플러그인 방식으로 추가 가능
- 그래프 구조는 다양한 다이어그램 도구와 호환 가능

### Phase 3 연계
- 생성된 JSON 그래프는 Phase 3의 다이어그램 생성 입력으로 사용
- diagrams.mingrammer.com 라이브러리가 요구하는 형식 고려
- 노드 위치, 레이아웃 힌트 등 추가 메타데이터 포함 가능
