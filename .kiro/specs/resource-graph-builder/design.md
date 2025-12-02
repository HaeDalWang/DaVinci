# Design Document

## Overview

리소스 그래프 빌더는 Phase 1에서 수집한 AWS 리소스 데이터를 입력받아, 리소스 간 관계를 분석하고 그래프 구조(노드, 엣지, 그룹)로 표현합니다. 생성된 그래프 JSON은 Phase 3에서 draw.io XML로 변환되어 시각적 다이어그램이 됩니다.

## Architecture

시스템은 3개의 주요 레이어로 구성됩니다:

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (GraphBuilder - 통합 인터페이스)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Graph Layer                     │
│  - ResourceGraph                    │
│  - Node / Edge / Group              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Parser Layer                    │
│  - ResourceParser                   │
│  - JSON Serializer                  │
└─────────────────────────────────────┘
```

### 레이어 설명:

1. **Parser Layer**: Phase 1 JSON 데이터 파싱 및 직렬화
2. **Graph Layer**: 그래프 자료구조 (노드, 엣지, 그룹) 관리
3. **Application Layer**: 전체 그래프 생성 프로세스 조율

## Components and Interfaces

### 1. ResourceParser

Phase 1 JSON 데이터를 파싱하는 컴포넌트입니다.

```python
class ResourceParser:
    def parse(self, json_data: dict) -> ParsedResources:
        """
        Phase 1 JSON 데이터를 파싱
        
        Args:
            json_data: {
                'ec2_instances': list[dict],
                'vpcs': list[dict],
                'security_groups': list[dict]
            }
            
        Returns:
            ParsedResources: 파싱된 리소스 객체
            
        Raises:
            ParseError: 데이터 파싱 실패 시
        """
```

### 2. Node

그래프의 노드를 나타내는 데이터 모델입니다.

```python
@dataclass
class Node:
    id: str                    # 리소스 ID (e.g., 'i-xxx', 'vpc-xxx')
    type: str                  # 리소스 타입 (ec2, vpc, subnet, security_group)
    name: str                  # 리소스 이름
    attributes: dict[str, Any] # 추가 속성
    
    # draw.io 렌더링을 위한 정보
    # EC2: private_ip, public_ip, state
    # VPC: cidr_block
    # SecurityGroup: description
```

### 3. Edge

그래프의 엣지를 나타내는 데이터 모델입니다.

```python
@dataclass
class Edge:
    source: str                # 소스 노드 ID
    target: str                # 타겟 노드 ID
    edge_type: str             # 엣지 타입 (contains, hosts, uses, allows_traffic)
    attributes: dict[str, Any] # 엣지 속성 (프로토콜, 포트 등)
```

### 4. Group

VPC 등 리소스 그룹을 나타내는 데이터 모델입니다.

```python
@dataclass
class Group:
    id: str                    # 그룹 ID (VPC ID)
    type: str                  # 그룹 타입 (vpc)
    name: str                  # 그룹 이름
    members: list[str]         # 그룹에 속한 노드 ID 목록
    attributes: dict[str, Any] # 그룹 속성 (CIDR 등)
```

### 5. ResourceGraph

그래프 자료구조를 관리하는 컴포넌트입니다.

```python
class ResourceGraph:
    def __init__(self):
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.groups: dict[str, Group] = {}
        
    def add_node(self, node: Node) -> None:
        """노드 추가"""
        
    def add_edge(self, edge: Edge) -> None:
        """엣지 추가"""
        
    def add_group(self, group: Group) -> None:
        """그룹 추가"""
        
    def to_dict(self) -> dict:
        """
        그래프를 dict로 변환 (JSON 직렬화용)
        
        Returns:
            dict: {
                'metadata': {
                    'created_at': str,
                    'node_count': int,
                    'edge_count': int,
                    'group_count': int
                },
                'nodes': list[dict],
                'edges': list[dict],
                'groups': list[dict]
            }
        """
        
    @staticmethod
    def from_dict(data: dict) -> 'ResourceGraph':
        """dict에서 그래프 복원 (역직렬화)"""
```

### 6. GraphBuilder (통합 인터페이스)

전체 그래프 생성 프로세스를 조율하는 고수준 인터페이스입니다.

```python
class GraphBuilder:
    def build(self, phase1_json: dict) -> ResourceGraph:
        """
        Phase 1 JSON으로부터 리소스 그래프 생성
        
        Args:
            phase1_json: Phase 1의 리소스 조회 결과
            
        Returns:
            ResourceGraph: 노드, 엣지, 그룹을 포함한 그래프
            
        Process:
            1. JSON 데이터 파싱
            2. 리소스를 노드로 추가
            3. VPC-EC2, Subnet-EC2 엣지 생성
            4. EC2-SecurityGroup 엣지 생성
            5. SecurityGroup 규칙 기반 엣지 생성
            6. VPC별 그룹 생성
            7. 그래프 반환
        """
        
    def _create_vpc_edges(self, graph: ResourceGraph, ec2_list: list, vpc_list: list) -> None:
        """VPC-EC2, Subnet-EC2 엣지 생성"""
        
    def _create_security_group_edges(self, graph: ResourceGraph, ec2_list: list, sg_list: list) -> None:
        """EC2-SecurityGroup 엣지 생성"""
        
    def _create_traffic_edges(self, graph: ResourceGraph, sg_list: list) -> None:
        """SecurityGroup 규칙 기반 트래픽 허용 엣지 생성"""
        
    def _create_vpc_groups(self, graph: ResourceGraph, vpc_list: list) -> None:
        """VPC별 그룹 생성"""
```

## Data Models

### ParsedResources

```python
@dataclass
class ParsedResources:
    ec2_instances: list[dict]
    vpcs: list[dict]
    subnets: list[dict]
    security_groups: list[dict]
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Parsing round-trip preserves data

*For any* 유효한 Phase 1 JSON 데이터, 파싱 후 다시 JSON으로 직렬화하면 동일한 구조를 유지해야 한다.

**Validates: Requirements 1.1**

### Property 2: All resources become nodes

*For any* Phase 1 JSON 데이터, 모든 리소스(EC2, VPC, Subnet, SecurityGroup)가 노드로 변환되어야 한다.

**Validates: Requirements 1.2**

### Property 3: Invalid input raises descriptive errors

*For any* 유효하지 않은 입력 데이터, 파싱 실패 시 실패한 필드와 예상 형식을 포함한 명확한 에러 메시지를 가진 예외가 발생해야 한다.

**Validates: Requirements 1.3, 8.2**

### Property 4: EC2 creates edges to VPC and Subnet

*For any* EC2 인스턴스, 해당 인스턴스가 속한 VPC와 Subnet으로의 엣지가 생성되어야 한다.

**Validates: Requirements 2.1, 2.2**

### Property 5: Edge types are correctly assigned

*For any* 생성된 엣지, 엣지 타입이 올바르게 설정되어야 한다 (VPC-EC2는 "contains", Subnet-EC2는 "hosts", EC2-SG는 "uses", SG-SG는 "allows_traffic").

**Validates: Requirements 2.3, 2.4, 3.2, 4.3**

### Property 6: All SecurityGroups create edges

*For any* EC2 인스턴스에 연결된 모든 SecurityGroup, 각 SecurityGroup으로의 엣지가 생성되어야 한다.

**Validates: Requirements 3.1**

### Property 7: SG rules create traffic edges

*For any* SecurityGroup 규칙이 다른 SecurityGroup을 참조할 때, 두 SecurityGroup 간 엣지가 생성되어야 한다.

**Validates: Requirements 4.1, 4.2**

### Property 8: Traffic edges include protocol and port

*For any* SecurityGroup 간 트래픽 허용 엣지, 프로토콜과 포트 정보가 엣지 속성에 포함되어야 한다.

**Validates: Requirements 4.4**

### Property 9: VPC groups are created

*For any* VPC, 해당 VPC에 속한 모든 Subnet과 EC2를 멤버로 하는 그룹이 생성되어야 한다.

**Validates: Requirements 5.1**

### Property 10: Groups contain required attributes

*For any* VPC 그룹, VPC ID, 이름, CIDR 정보를 포함해야 한다.

**Validates: Requirements 5.3**

### Property 11: Graph serialization round-trip

*For any* 생성된 그래프, JSON으로 직렬화 후 역직렬화하면 동일한 그래프를 복원해야 한다.

**Validates: Requirements 6.1, 6.4**

### Property 12: JSON contains required sections

*For any* 그래프를 JSON으로 내보낼 때, nodes, edges, groups, metadata 섹션을 포함해야 한다.

**Validates: Requirements 6.2, 6.3**

### Property 13: Nodes contain required fields

*For any* 노드, 리소스 타입, ID, 이름을 포함해야 하며, 타입별 특화 속성(EC2는 IP, VPC는 CIDR)을 포함해야 한다.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 14: Invalid references raise exceptions

*For any* 유효하지 않은 리소스 참조, 해당 리소스 ID를 포함한 예외가 발생해야 한다.

**Validates: Requirements 8.1**


## Error Handling

### Error Types

```python
class GraphBuilderError(Exception):
    """Base exception"""
    pass

class ParseError(GraphBuilderError):
    """데이터 파싱 실패"""
    def __init__(self, field: str, expected_type: str, actual_value: Any):
        self.field = field
        self.expected_type = expected_type
        self.actual_value = actual_value
        super().__init__(
            f"Failed to parse '{field}': expected {expected_type}, got {type(actual_value).__name__}"
        )

class InvalidReferenceError(GraphBuilderError):
    """유효하지 않은 리소스 참조"""
    def __init__(self, resource_id: str, resource_type: str):
        self.resource_id = resource_id
        self.resource_type = resource_type
        super().__init__(f"Invalid {resource_type} reference: {resource_id}")
```

### Error Handling Strategy

1. **파싱 에러**: 필수 필드 누락, 타입 불일치 → ParseError
2. **참조 에러**: 존재하지 않는 VPC/SG 참조 → InvalidReferenceError
3. **직렬화 에러**: JSON 직렬화 실패 → GraphBuilderError

## Testing Strategy

### Unit Testing

1. **ResourceParser**: JSON 파싱, 에러 처리
2. **ResourceGraph**: 노드/엣지/그룹 추가, 직렬화
3. **GraphBuilder**: 엣지 생성, 그룹핑

### Property-Based Testing

pytest와 Hypothesis 사용, 최소 100회 반복

**Property Test 태그 형식**:
```python
# Feature: resource-graph-builder, Property 1: Parsing round-trip preserves data
```

**Hypothesis 전략**:
```python
@st.composite
def ec2_instance_strategy(draw):
    return {
        'instance_id': draw(st.text(min_size=10)),
        'name': draw(st.text(min_size=1)),
        'vpc_id': draw(st.text(min_size=10)),
        'subnet_id': draw(st.text(min_size=10)),
        'security_groups': draw(st.lists(st.text(min_size=10), min_size=1))
    }
```

## Implementation Notes

### 기술 스택
- Python 3.11+
- pytest, hypothesis
- mypy

### 디렉토리 구조
```
resource_graph_builder/
├── __init__.py
├── models.py       # Node, Edge, Group
├── exceptions.py   # 커스텀 예외
├── parser.py       # ResourceParser
├── graph.py        # ResourceGraph
└── builder.py      # GraphBuilder

tests/
├── test_parser.py
├── test_graph.py
├── test_builder.py
└── property_tests/
    ├── test_properties.py
    └── generators.py
```

### Phase 3 연계

생성된 JSON 그래프는 다음 형식을 따릅니다:

```json
{
  "metadata": {
    "created_at": "2024-12-02T10:00:00Z",
    "node_count": 10,
    "edge_count": 15,
    "group_count": 2
  },
  "nodes": [
    {
      "id": "i-xxx",
      "type": "ec2",
      "name": "web-server",
      "attributes": {
        "state": "running",
        "private_ip": "10.0.1.10",
        "public_ip": "54.xxx.xxx.xxx"
      }
    }
  ],
  "edges": [
    {
      "source": "vpc-xxx",
      "target": "i-xxx",
      "edge_type": "contains",
      "attributes": {}
    }
  ],
  "groups": [
    {
      "id": "vpc-xxx",
      "type": "vpc",
      "name": "production-vpc",
      "members": ["subnet-xxx", "i-xxx"],
      "attributes": {
        "cidr_block": "10.0.0.0/16"
      }
    }
  ]
}
```

이 JSON은 Phase 3에서 draw.io XML로 변환됩니다.
