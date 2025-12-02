"""
데이터 모델 테스트
"""

import pytest
from resource_graph_builder.models import Node, Edge, Group


def test_node_creation():
    """노드 생성 테스트"""
    node = Node(
        id="i-12345",
        type="ec2",
        name="web-server",
        attributes={"state": "running", "private_ip": "10.0.1.10"}
    )
    
    assert node.id == "i-12345"
    assert node.type == "ec2"
    assert node.name == "web-server"
    assert node.attributes["state"] == "running"


def test_node_validation():
    """노드 검증 테스트"""
    with pytest.raises(ValueError, match="Node id cannot be empty"):
        Node(id="", type="ec2", name="test")
    
    with pytest.raises(ValueError, match="Node type cannot be empty"):
        Node(id="i-123", type="", name="test")
    
    with pytest.raises(ValueError, match="Node name cannot be empty"):
        Node(id="i-123", type="ec2", name="")


def test_edge_creation():
    """엣지 생성 테스트"""
    edge = Edge(
        source="vpc-123",
        target="i-456",
        edge_type="contains",
        attributes={}
    )
    
    assert edge.source == "vpc-123"
    assert edge.target == "i-456"
    assert edge.edge_type == "contains"


def test_edge_validation():
    """엣지 검증 테스트"""
    with pytest.raises(ValueError, match="Edge source cannot be empty"):
        Edge(source="", target="i-123", edge_type="contains")
    
    with pytest.raises(ValueError, match="Edge target cannot be empty"):
        Edge(source="vpc-123", target="", edge_type="contains")
    
    with pytest.raises(ValueError, match="Edge edge_type cannot be empty"):
        Edge(source="vpc-123", target="i-123", edge_type="")
    
    with pytest.raises(ValueError, match="Invalid edge_type"):
        Edge(source="vpc-123", target="i-123", edge_type="invalid_type")


def test_edge_valid_types():
    """유효한 엣지 타입 테스트"""
    valid_types = ["contains", "hosts", "uses", "allows_traffic"]
    
    for edge_type in valid_types:
        edge = Edge(source="src", target="tgt", edge_type=edge_type)
        assert edge.edge_type == edge_type


def test_group_creation():
    """그룹 생성 테스트"""
    group = Group(
        id="vpc-123",
        type="vpc",
        name="production-vpc",
        members=["subnet-456", "i-789"],
        attributes={"cidr_block": "10.0.0.0/16"}
    )
    
    assert group.id == "vpc-123"
    assert group.type == "vpc"
    assert group.name == "production-vpc"
    assert len(group.members) == 2
    assert group.attributes["cidr_block"] == "10.0.0.0/16"


def test_group_validation():
    """그룹 검증 테스트"""
    with pytest.raises(ValueError, match="Group id cannot be empty"):
        Group(id="", type="vpc", name="test")
    
    with pytest.raises(ValueError, match="Group type cannot be empty"):
        Group(id="vpc-123", type="", name="test")
    
    with pytest.raises(ValueError, match="Group name cannot be empty"):
        Group(id="vpc-123", type="vpc", name="")
