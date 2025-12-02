# Design Document

## Overview

draw.io XML 생성기는 Phase 2에서 생성한 리소스 그래프 JSON을 입력받아, draw.io 애플리케이션에서 열 수 있는 XML 다이어그램으로 변환합니다. EC2 인스턴스는 AWS Architecture Icons 2025 아이콘으로, VPC와 Subnet은 중첩된 컨테이너로, SecurityGroup 규칙은 트래픽 화살표로 표현됩니다.

## Architecture

시스템은 3개의 주요 레이어로 구성됩니다:

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (DrawioGenerator - 통합 인터페이스) │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Conversion Layer                │
│  - ShapeConverter                   │
│  - ContainerConverter               │
│  - ConnectorConverter               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     XML Layer                       │
│  - XMLBuilder                       │
│  - LayoutEngine                     │
└─────────────────────────────────────┘
```

### 레이어 설명:

1. **XML Layer**: draw.io XML 구조 생성 및 레이아웃 계산
2. **Conversion Layer**: 그래프 요소를 draw.io 요소로 변환
3. **Application Layer**: 전체 변환 프로세스 조율

## Components and Interfaces

### 1. DrawioGenerator (통합 인터페이스)

```python
class DrawioGenerator:
    def generate(self, graph_json: dict) -> str:
        """
        그래프 JSON을 draw.io XML로 변환
        
        Args:
            graph_json: Phase 2의 그래프 JSON
            
        Returns:
            str: draw.io XML 문자열
            
        Process:
            1. 그래프 JSON 파싱
            2. VPC Container 생성
            3. Subnet Container 생성 (VPC 내부)
            4. EC2 Shape 생성 (Subnet 내부)
            5. 트래픽 Connector 생성
            6. 레이아웃 적용
            7. XML 생성
        """
```

### 2. ShapeConverter

EC2 인스턴스를 AWS 아이콘 Shape로 변환합니다.

```python
class ShapeConverter:
    def convert_ec2(self, node: dict, position: tuple[int, int]) -> Shape:
        """
        EC2 노드를 draw.io Shape로 변환
        
        Args:
            node: EC2 노드 정보
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
            
        Shape 속성:
            - 아이콘: AWS Architecture Icons 2025 EC2
            - 크기: 78x78 픽셀
            - 라벨: 이름 + private IP
            - 폰트: 12pt
        """
```

### 3. ContainerConverter

VPC와 Subnet을 AWS Groups 아이콘으로 변환합니다.

```python
class ContainerConverter:
    def convert_vpc(self, group: dict, subnets: list[dict]) -> Container:
        """
        VPC 그룹을 draw.io AWS VPC Group으로 변환
        
        Args:
            group: VPC 그룹 정보
            subnets: VPC에 속한 Subnet 목록
            
        Returns:
            Container: draw.io Container 객체
            
        Container 속성:
            - 아이콘: mxgraph.aws4.group_vpc
            - 테두리 색상: 녹색 (#248814)
            - 배경: 투명
            - 라벨: VPC 이름 + CIDR
        """
    
    def convert_subnet(self, node: dict, ec2_instances: list[dict]) -> Container:
        """
        Subnet 노드를 draw.io AWS Subnet Group으로 변환
        
        Args:
            node: Subnet 노드 정보
            ec2_instances: Subnet에 속한 EC2 목록
            
        Returns:
            Container: draw.io Container 객체
            
        Container 속성:
            - 아이콘: mxgraph.aws4.group_subnet
            - 테두리 색상: 파란색 (#147EBA)
            - 배경: 투명
            - 라벨: Subnet 이름 + CIDR
        """
```

### 4. ConnectorConverter

SecurityGroup 규칙을 트래픽 화살표로 변환합니다.

```python
class ConnectorConverter:
    def convert_traffic_edge(
        self,
        edge: dict,
        source_ec2_list: list[str],
        target_ec2_list: list[str]
    ) -> list[Connector]:
        """
        allows_traffic 엣지를 EC2 간 Connector로 변환
        
        Args:
            edge: allows_traffic 엣지 정보
            source_ec2_list: 소스 SecurityGroup을 사용하는 EC2 ID 목록
            target_ec2_list: 타겟 SecurityGroup을 사용하는 EC2 ID 목록
            
        Returns:
            list[Connector]: EC2 간 Connector 목록
            
        Connector 속성:
            - 스타일: 굵은 실선 화살표
            - 라벨: 프로토콜 + 포트 (예: "TCP:80")
            - 색상: 검은색
        """
```

### 5. LayoutEngine

리소스를 자동으로 배치합니다.

```python
class LayoutEngine:
    def layout_vpcs(self, vpcs: list[Container]) -> None:
        """
        VPC Container를 배치
        
        좌측 상단부터 수평으로 배치
        VPC 간 간격: 150px
        """
    
    def layout_subnets(self, subnets: list[Container], vpc_bounds: tuple) -> None:
        """
        Subnet Container를 VPC 내부에 배치
        
        그리드 레이아웃 (2열)
        Subnet 간 간격: 120px
        """
    
    def layout_ec2_instances(self, ec2_list: list[Shape], subnet_bounds: tuple) -> None:
        """
        EC2 Shape를 Subnet 내부에 배치
        
        그리드 레이아웃 (3열)
        EC2 간 간격: 100px
        """
```

### 6. XMLBuilder

draw.io XML 구조를 생성합니다.

```python
class XMLBuilder:
    def build(
        self,
        shapes: list[Shape],
        containers: list[Container],
        connectors: list[Connector]
    ) -> str:
        """
        draw.io XML 생성
        
        Returns:
            str: UTF-8 인코딩된 XML 문자열
            
        XML 구조:
            <mxfile>
              <diagram>
                <mxGraphModel>
                  <root>
                    <mxCell id="0"/>
                    <mxCell id="1" parent="0"/>
                    <!-- VPC Containers -->
                    <!-- Subnet Containers -->
                    <!-- EC2 Shapes -->
                    <!-- Traffic Connectors -->
                  </root>
                </mxGraphModel>
              </diagram>
            </mxfile>
        """
```

## Data Models

### Shape (EC2 아이콘)

```python
@dataclass
class Shape:
    id: str                    # 고유 ID
    node_id: str               # 원본 노드 ID
    x: int                     # X 좌표
    y: int                     # Y 좌표
    width: int                 # 너비 (78px)
    height: int                # 높이 (78px)
    label: str                 # 표시 텍스트
    icon_type: str             # 아이콘 타입 (ec2)
    parent_id: str | None      # 부모 Container ID
```

### Container (VPC/Subnet)

```python
@dataclass
class Container:
    id: str                    # 고유 ID
    node_id: str               # 원본 노드 ID
    x: int                     # X 좌표
    y: int                     # Y 좌표
    width: int                 # 너비
    height: int                # 높이
    label: str                 # 표시 텍스트
    container_type: str        # 타입 (vpc, subnet)
    background_color: str      # 배경색
    parent_id: str | None      # 부모 Container ID (Subnet의 경우 VPC ID)
    children: list[str]        # 자식 요소 ID 목록
```

### Connector (트래픽 화살표)

```python
@dataclass
class Connector:
    id: str                    # 고유 ID
    source_id: str             # 소스 Shape ID
    target_id: str             # 타겟 Shape ID
    label: str                 # 표시 텍스트 (프로토콜:포트)
    style: str                 # 스타일 (굵은 실선)
```

## AWS Architecture Icons 2025

draw.io에는 AWS Architecture Icons가 내장되어 있으며, `mxgraph.aws4` 네임스페이스를 사용합니다.

### EC2 아이콘 스타일

```
shape=mxgraph.aws4.resourceIcon;
resIcon=mxgraph.aws4.ec2;
strokeColor=#ffffff;
fillColor=#ED7100;
verticalLabelPosition=bottom;
verticalAlign=top;
```

### VPC 그룹 아이콘 (Groups 카테고리)

```
shape=mxgraph.aws4.group;
grIcon=mxgraph.aws4.group_vpc;
strokeColor=#248814;
fillColor=none;
verticalAlign=top;
```

### Subnet 그룹 아이콘 (Groups 카테고리)

```
shape=mxgraph.aws4.group;
grIcon=mxgraph.aws4.group_subnet;
strokeColor=#147EBA;
fillColor=none;
verticalAlign=top;
```

### 아이콘 크기
- EC2: 78x78px
- VPC/Subnet 그룹: 자동 크기 조정 (멤버에 따라)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: XML 파싱 가능성

*For any* 생성된 XML, draw.io 애플리케이션에서 파싱 가능해야 한다.

**Validates: Requirements 7.1, 7.2**

### Property 2: EC2는 아이콘으로 표현

*For any* EC2 노드, draw.io Shape로 변환되고 AWS Architecture Icons 2025 EC2 아이콘을 사용해야 한다.

**Validates: Requirements 2.1, 2.2**

### Property 3: VPC는 AWS VPC Group으로 표현

*For any* VPC 그룹, draw.io AWS VPC Group 아이콘(mxgraph.aws4.group_vpc)으로 변환되어야 한다.

**Validates: Requirements 2.4, 5.1, 5.2**

### Property 4: Subnet은 VPC 내부 AWS Subnet Group으로 표현

*For any* Subnet 노드, VPC Group 내부에 중첩된 AWS Subnet Group 아이콘(mxgraph.aws4.group_subnet)으로 변환되어야 한다.

**Validates: Requirements 2.5, 5.3, 5.4**

### Property 5: EC2는 Subnet 내부에 배치

*For any* EC2 인스턴스, 해당 Subnet Container 내부에 배치되어야 한다.

**Validates: Requirements 5.5**

### Property 6: SecurityGroup은 아이콘 없음

*For any* SecurityGroup 노드, draw.io Shape나 Container를 생성하지 않아야 한다.

**Validates: Requirements 2.3**

### Property 7: 트래픽 엣지는 EC2 간 연결선

*For any* allows_traffic 엣지, 해당 SecurityGroup을 사용하는 EC2 인스턴스 간 Connector를 생성해야 한다.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 8: 트래픽 라벨 포함

*For any* 트래픽 Connector, 프로토콜과 포트 정보를 라벨로 포함해야 한다.

**Validates: Requirements 4.3**

### Property 9: 구조 엣지는 연결선 없음

*For any* contains, hosts, uses 엣지, Connector를 생성하지 않아야 한다.

**Validates: Requirements 4.5**

### Property 10: 리소스 정보 표시

*For any* EC2 Shape, 이름과 private IP를 라벨로 포함해야 한다.

**Validates: Requirements 3.1, 3.2**

### Property 11: Container 정보 표시

*For any* VPC/Subnet Container, 이름과 CIDR 블록을 라벨로 포함해야 한다.

**Validates: Requirements 3.3, 3.4**

### Property 12: 레이아웃 간격 유지

*For any* 배치된 리소스, 최소 간격을 유지해야 한다 (EC2: 100px, Subnet: 120px, VPC: 150px).

**Validates: Requirements 6.4, 6.5, 6.6**

### Property 13: XML 형식 준수

*For any* 생성된 XML, draw.io 표준 형식을 준수하고 UTF-8 인코딩을 사용해야 한다.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 14: 유효하지 않은 입력 에러 처리

*For any* 유효하지 않은 그래프 JSON, 명확한 에러 메시지를 포함한 예외를 발생시켜야 한다.

**Validates: Requirements 1.3, 8.1, 8.2**

## Error Handling

### Error Types

```python
class DrawioGeneratorError(Exception):
    """Base exception"""
    pass

class InvalidGraphError(DrawioGeneratorError):
    """그래프 JSON 파싱 실패"""
    def __init__(self, field: str, reason: str):
        self.field = field
        self.reason = reason
        super().__init__(f"Invalid graph JSON at '{field}': {reason}")

class UnknownNodeTypeError(DrawioGeneratorError):
    """알 수 없는 노드 타입"""
    def __init__(self, node_id: str, node_type: str):
        self.node_id = node_id
        self.node_type = node_type
        super().__init__(f"Unknown node type '{node_type}' for node '{node_id}'")
```

## Testing Strategy

### Unit Testing

1. **ShapeConverter**: EC2 Shape 변환, 아이콘 스타일, 라벨 생성
2. **ContainerConverter**: VPC/Subnet Container 변환, 배경색, 중첩 구조
3. **ConnectorConverter**: 트래픽 Connector 생성, 라벨 형식
4. **LayoutEngine**: 그리드 레이아웃, 간격 계산
5. **XMLBuilder**: XML 구조 생성, 인코딩

### Property-Based Testing

pytest와 Hypothesis 사용, 최소 100회 반복

**Property Test 태그 형식**:
```python
# Feature: drawio-generator, Property 1: XML 파싱 가능성
```

### Integration Testing

Phase 2 그래프 JSON → Phase 3 draw.io XML 전체 플로우 테스트

## Implementation Notes

### 기술 스택
- Python 3.11+
- xml.etree.ElementTree (XML 생성)
- pytest, hypothesis
- mypy

### 디렉토리 구조
```
drawio_generator/
├── __init__.py
├── models.py           # Shape, Container, Connector
├── exceptions.py       # 커스텀 예외
├── converters/
│   ├── __init__.py
│   ├── shape.py        # ShapeConverter
│   ├── container.py    # ContainerConverter
│   └── connector.py    # ConnectorConverter
├── layout.py           # LayoutEngine
├── xml_builder.py      # XMLBuilder
└── generator.py        # DrawioGenerator

tests/
├── test_converters/
│   ├── test_shape.py
│   ├── test_container.py
│   └── test_connector.py
├── test_layout.py
├── test_xml_builder.py
├── test_generator.py
└── property_tests/
    ├── test_properties.py
    └── generators.py
```

### draw.io XML 예시

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="AWS Architecture">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        
        <!-- VPC Group (AWS Architecture Icons 2025) -->
        <mxCell id="vpc-123" value="production-vpc&#xa;10.0.0.0/16" 
                style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fillColor=none;verticalAlign=top;" 
                vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="800" height="600" as="geometry"/>
        </mxCell>
        
        <!-- Subnet Group (AWS Architecture Icons 2025) -->
        <mxCell id="subnet-456" value="public-subnet&#xa;10.0.1.0/24" 
                style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;strokeColor=#147EBA;fillColor=none;verticalAlign=top;" 
                vertex="1" parent="vpc-123">
          <mxGeometry x="20" y="60" width="360" height="300" as="geometry"/>
        </mxCell>
        
        <!-- EC2 Shape (AWS Architecture Icons 2025) -->
        <mxCell id="i-789" value="web-server&#xa;10.0.1.10" 
                style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;strokeColor=#ffffff;fillColor=#ED7100;verticalLabelPosition=bottom;verticalAlign=top;" 
                vertex="1" parent="subnet-456">
          <mxGeometry x="40" y="60" width="78" height="78" as="geometry"/>
        </mxCell>
        
        <!-- Traffic Connector -->
        <mxCell id="edge-1" value="TCP:80" 
                style="edgeStyle=orthogonalEdgeStyle;strokeWidth=2;" 
                edge="1" parent="1" source="i-789" target="i-abc">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Phase 2 연계

Phase 2 그래프 JSON의 구조를 그대로 사용:
- `nodes`: EC2, VPC, Subnet, SecurityGroup
- `edges`: allows_traffic만 사용
- `groups`: VPC 그룹 사용

SecurityGroup 노드는 아이콘을 생성하지 않지만, allows_traffic 엣지를 통해 EC2 간 연결을 생성하는 데 사용됩니다.
