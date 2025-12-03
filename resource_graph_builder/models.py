"""
데이터 모델 정의

그래프 구조를 표현하는 Node, Edge, Group 데이터 클래스
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Node:
    """
    그래프의 노드를 나타내는 데이터 모델
    
    Requirements: 7.1, 7.2, 7.3, 7.4
    """
    id: str                           # 리소스 ID (e.g., 'i-xxx', 'vpc-xxx')
    type: str                         # 리소스 타입 (ec2, vpc, subnet, security_group)
    name: str                         # 리소스 이름
    attributes: dict[str, Any] = field(default_factory=dict)  # 추가 속성
    
    def __post_init__(self) -> None:
        """데이터 검증"""
        if not self.id:
            raise ValueError("Node id cannot be empty")
        if not self.type:
            raise ValueError("Node type cannot be empty")
        if not self.name:
            raise ValueError("Node name cannot be empty")


@dataclass
class Edge:
    """
    그래프의 엣지를 나타내는 데이터 모델
    
    엣지 타입:
    - contains: VPC가 Subnet/EC2를 포함
    - hosts: Subnet이 EC2/NAT Gateway를 호스팅
    - uses: EC2가 SecurityGroup을 사용
    - allows_traffic: SecurityGroup 간 트래픽 허용
    - attaches: VPC가 Internet Gateway에 연결
    """
    source: str                       # 소스 노드 ID
    target: str                       # 타겟 노드 ID
    edge_type: str                    # 엣지 타입
    attributes: dict[str, Any] = field(default_factory=dict)  # 엣지 속성 (프로토콜, 포트 등)
    
    def __post_init__(self) -> None:
        """데이터 검증"""
        if not self.source:
            raise ValueError("Edge source cannot be empty")
        if not self.target:
            raise ValueError("Edge target cannot be empty")
        if not self.edge_type:
            raise ValueError("Edge edge_type cannot be empty")
        
        valid_edge_types = {"contains", "hosts", "uses", "allows_traffic", "attaches", "routes_to", "associates", "distributes_to", "resides_in", "peers_with"}
        if self.edge_type not in valid_edge_types:
            raise ValueError(
                f"Invalid edge_type '{self.edge_type}'. "
                f"Must be one of: {valid_edge_types}"
            )


@dataclass
class Group:
    """
    VPC 등 리소스 그룹을 나타내는 데이터 모델
    """
    id: str                           # 그룹 ID (VPC ID)
    type: str                         # 그룹 타입 (vpc)
    name: str                         # 그룹 이름
    members: list[str] = field(default_factory=list)  # 그룹에 속한 노드 ID 목록
    attributes: dict[str, Any] = field(default_factory=dict)  # 그룹 속성 (CIDR 등)
    
    def __post_init__(self) -> None:
        """데이터 검증"""
        if not self.id:
            raise ValueError("Group id cannot be empty")
        if not self.type:
            raise ValueError("Group type cannot be empty")
        if not self.name:
            raise ValueError("Group name cannot be empty")
