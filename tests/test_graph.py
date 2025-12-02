"""
ResourceGraph 클래스 테스트

Requirements: 6.1, 6.2, 6.3, 6.4
"""

import pytest
from resource_graph_builder.graph import ResourceGraph
from resource_graph_builder.models import Node, Edge, Group


def test_add_node():
    """노드 추가 테스트"""
    graph = ResourceGraph()
    node = Node(id="i-123", type="ec2", name="web-server", attributes={"state": "running"})
    
    graph.add_node(node)
    
    assert "i-123" in graph.nodes
    assert graph.nodes["i-123"] == node


def test_add_edge():
    """엣지 추가 테스트"""
    graph = ResourceGraph()
    edge = Edge(source="vpc-123", target="i-123", edge_type="contains")
    
    graph.add_edge(edge)
    
    assert len(graph.edges) == 1
    assert graph.edges[0] == edge


def test_add_group():
    """그룹 추가 테스트"""
    graph = ResourceGraph()
    group = Group(
        id="vpc-123",
        type="vpc",
        name="production-vpc",
        members=["i-123", "subnet-123"],
        attributes={"cidr_block": "10.0.0.0/16"}
    )
    
    graph.add_group(group)
    
    assert "vpc-123" in graph.groups
    assert graph.groups["vpc-123"] == group


def test_to_dict():
    """그래프를 dict로 변환 테스트"""
    graph = ResourceGraph()
    
    # 노드 추가
    node = Node(id="i-123", type="ec2", name="web-server", attributes={"state": "running"})
    graph.add_node(node)
    
    # 엣지 추가
    edge = Edge(source="vpc-123", target="i-123", edge_type="contains")
    graph.add_edge(edge)
    
    # 그룹 추가
    group = Group(
        id="vpc-123",
        type="vpc",
        name="production-vpc",
        members=["i-123"],
        attributes={"cidr_block": "10.0.0.0/16"}
    )
    graph.add_group(group)
    
    # dict로 변환
    data = graph.to_dict()
    
    # metadata 검증
    assert 'metadata' in data
    assert data['metadata']['node_count'] == 1
    assert data['metadata']['edge_count'] == 1
    assert data['metadata']['group_count'] == 1
    assert 'created_at' in data['metadata']
    
    # nodes 검증
    assert 'nodes' in data
    assert len(data['nodes']) == 1
    assert data['nodes'][0]['id'] == 'i-123'
    assert data['nodes'][0]['type'] == 'ec2'
    assert data['nodes'][0]['name'] == 'web-server'
    
    # edges 검증
    assert 'edges' in data
    assert len(data['edges']) == 1
    assert data['edges'][0]['source'] == 'vpc-123'
    assert data['edges'][0]['target'] == 'i-123'
    assert data['edges'][0]['edge_type'] == 'contains'
    
    # groups 검증
    assert 'groups' in data
    assert len(data['groups']) == 1
    assert data['groups'][0]['id'] == 'vpc-123'
    assert data['groups'][0]['type'] == 'vpc'
    assert data['groups'][0]['members'] == ['i-123']


def test_from_dict():
    """dict에서 그래프 복원 테스트"""
    data = {
        'metadata': {
            'created_at': '2024-12-02T10:00:00Z',
            'node_count': 1,
            'edge_count': 1,
            'group_count': 1
        },
        'nodes': [
            {
                'id': 'i-123',
                'type': 'ec2',
                'name': 'web-server',
                'attributes': {'state': 'running'}
            }
        ],
        'edges': [
            {
                'source': 'vpc-123',
                'target': 'i-123',
                'edge_type': 'contains',
                'attributes': {}
            }
        ],
        'groups': [
            {
                'id': 'vpc-123',
                'type': 'vpc',
                'name': 'production-vpc',
                'members': ['i-123'],
                'attributes': {'cidr_block': '10.0.0.0/16'}
            }
        ]
    }
    
    graph = ResourceGraph.from_dict(data)
    
    # 노드 검증
    assert len(graph.nodes) == 1
    assert 'i-123' in graph.nodes
    assert graph.nodes['i-123'].type == 'ec2'
    assert graph.nodes['i-123'].name == 'web-server'
    
    # 엣지 검증
    assert len(graph.edges) == 1
    assert graph.edges[0].source == 'vpc-123'
    assert graph.edges[0].target == 'i-123'
    assert graph.edges[0].edge_type == 'contains'
    
    # 그룹 검증
    assert len(graph.groups) == 1
    assert 'vpc-123' in graph.groups
    assert graph.groups['vpc-123'].name == 'production-vpc'
    assert graph.groups['vpc-123'].members == ['i-123']


def test_round_trip():
    """직렬화 후 역직렬화 테스트 (round-trip)"""
    # 원본 그래프 생성
    original = ResourceGraph()
    
    node = Node(id="i-123", type="ec2", name="web-server", attributes={"state": "running"})
    original.add_node(node)
    
    edge = Edge(source="vpc-123", target="i-123", edge_type="contains")
    original.add_edge(edge)
    
    group = Group(
        id="vpc-123",
        type="vpc",
        name="production-vpc",
        members=["i-123"],
        attributes={"cidr_block": "10.0.0.0/16"}
    )
    original.add_group(group)
    
    # 직렬화 후 역직렬화
    data = original.to_dict()
    restored = ResourceGraph.from_dict(data)
    
    # 노드 비교
    assert len(restored.nodes) == len(original.nodes)
    assert restored.nodes['i-123'].id == original.nodes['i-123'].id
    assert restored.nodes['i-123'].type == original.nodes['i-123'].type
    assert restored.nodes['i-123'].name == original.nodes['i-123'].name
    assert restored.nodes['i-123'].attributes == original.nodes['i-123'].attributes
    
    # 엣지 비교
    assert len(restored.edges) == len(original.edges)
    assert restored.edges[0].source == original.edges[0].source
    assert restored.edges[0].target == original.edges[0].target
    assert restored.edges[0].edge_type == original.edges[0].edge_type
    
    # 그룹 비교
    assert len(restored.groups) == len(original.groups)
    assert restored.groups['vpc-123'].id == original.groups['vpc-123'].id
    assert restored.groups['vpc-123'].type == original.groups['vpc-123'].type
    assert restored.groups['vpc-123'].name == original.groups['vpc-123'].name
    assert restored.groups['vpc-123'].members == original.groups['vpc-123'].members
    assert restored.groups['vpc-123'].attributes == original.groups['vpc-123'].attributes
