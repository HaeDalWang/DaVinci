"""
ResourceGraph 클래스 구현

그래프 자료구조를 관리하고 JSON 직렬화/역직렬화를 제공합니다.

Requirements: 6.1, 6.2, 6.3, 6.4
"""

from datetime import datetime, timezone
from typing import Any

from .models import Node, Edge, Group


class ResourceGraph:
    """
    리소스 그래프를 관리하는 클래스
    
    노드, 엣지, 그룹을 저장하고 JSON 직렬화/역직렬화를 지원합니다.
    """
    
    def __init__(self) -> None:
        """그래프 초기화"""
        self.nodes: dict[str, Node] = {}  # O(1) 조회를 위한 dict
        self.edges: list[Edge] = []
        self.groups: dict[str, Group] = {}
    
    def add_node(self, node: Node) -> None:
        """
        노드를 그래프에 추가
        
        Args:
            node: 추가할 노드
            
        Requirements: 6.1
        """
        self.nodes[node.id] = node
    
    def add_edge(self, edge: Edge) -> None:
        """
        엣지를 그래프에 추가
        
        Args:
            edge: 추가할 엣지
            
        Requirements: 6.1
        """
        self.edges.append(edge)
    
    def add_group(self, group: Group) -> None:
        """
        그룹을 그래프에 추가
        
        Args:
            group: 추가할 그룹
            
        Requirements: 6.1
        """
        self.groups[group.id] = group
    
    def to_dict(self) -> dict[str, Any]:
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
            
        Requirements: 6.1, 6.2, 6.3
        """
        return {
            'metadata': {
                'created_at': datetime.now(timezone.utc).isoformat(),
                'node_count': len(self.nodes),
                'edge_count': len(self.edges),
                'group_count': len(self.groups)
            },
            'nodes': [
                {
                    'id': node.id,
                    'type': node.type,
                    'name': node.name,
                    'attributes': node.attributes
                }
                for node in self.nodes.values()
            ],
            'edges': [
                {
                    'source': edge.source,
                    'target': edge.target,
                    'edge_type': edge.edge_type,
                    'attributes': edge.attributes
                }
                for edge in self.edges
            ],
            'groups': [
                {
                    'id': group.id,
                    'type': group.type,
                    'name': group.name,
                    'members': group.members,
                    'attributes': group.attributes
                }
                for group in self.groups.values()
            ]
        }
    
    def to_json(self) -> dict[str, Any]:
        """
        그래프를 JSON 형식으로 변환 (to_dict의 별칭)
        
        Returns:
            dict: JSON 직렬화 가능한 dict
        """
        return self.to_dict()
    
    @staticmethod
    def from_dict(data: dict[str, Any]) -> 'ResourceGraph':
        """
        dict에서 그래프 복원 (역직렬화)
        
        Args:
            data: to_dict()로 생성된 dict
            
        Returns:
            ResourceGraph: 복원된 그래프
            
        Requirements: 6.4
        """
        graph = ResourceGraph()
        
        # 노드 복원
        for node_data in data.get('nodes', []):
            node = Node(
                id=node_data['id'],
                type=node_data['type'],
                name=node_data['name'],
                attributes=node_data.get('attributes', {})
            )
            graph.add_node(node)
        
        # 엣지 복원
        for edge_data in data.get('edges', []):
            edge = Edge(
                source=edge_data['source'],
                target=edge_data['target'],
                edge_type=edge_data['edge_type'],
                attributes=edge_data.get('attributes', {})
            )
            graph.add_edge(edge)
        
        # 그룹 복원
        for group_data in data.get('groups', []):
            group = Group(
                id=group_data['id'],
                type=group_data['type'],
                name=group_data['name'],
                members=group_data.get('members', []),
                attributes=group_data.get('attributes', {})
            )
            graph.add_group(group)
        
        return graph
