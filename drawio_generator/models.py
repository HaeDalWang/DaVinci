"""
draw.io 다이어그램 요소를 위한 데이터 모델
"""
from dataclasses import dataclass


@dataclass
class Shape:
    """
    EC2 인스턴스를 나타내는 draw.io Shape
    
    Attributes:
        id: 고유 ID
        node_id: 원본 노드 ID
        x: X 좌표
        y: Y 좌표
        width: 너비 (78px)
        height: 높이 (78px)
        label: 표시 텍스트
        icon_type: 아이콘 타입 (ec2)
        parent_id: 부모 Container ID
    """
    id: str
    node_id: str
    x: int
    y: int
    width: int
    height: int
    label: str
    icon_type: str
    parent_id: str | None


@dataclass
class Container:
    """
    VPC/Subnet을 나타내는 draw.io Container
    
    Attributes:
        id: 고유 ID
        node_id: 원본 노드 ID
        x: X 좌표
        y: Y 좌표
        width: 너비
        height: 높이
        label: 표시 텍스트
        container_type: 타입 (vpc, subnet)
        background_color: 배경색
        parent_id: 부모 Container ID (Subnet의 경우 VPC ID)
        children: 자식 요소 ID 목록
    """
    id: str
    node_id: str
    x: int
    y: int
    width: int
    height: int
    label: str
    container_type: str
    background_color: str
    parent_id: str | None
    children: list[str]


@dataclass
class Connector:
    """
    트래픽 흐름을 나타내는 draw.io Connector
    
    Attributes:
        id: 고유 ID
        source_id: 소스 Shape ID
        target_id: 타겟 Shape ID
        label: 표시 텍스트 (프로토콜:포트)
        style: 스타일 (굵은 실선)
    """
    id: str
    source_id: str
    target_id: str
    label: str
    style: str
