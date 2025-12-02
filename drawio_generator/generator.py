"""
draw.io XML 생성기 - 통합 인터페이스

Phase 2 그래프 JSON을 draw.io XML로 변환하는 메인 클래스
"""
from typing import Any
import logging

from drawio_generator.models import Shape, Container, Connector
from drawio_generator.converters.shape import ShapeConverter
from drawio_generator.converters.container import ContainerConverter
from drawio_generator.converters.connector import ConnectorConverter
from drawio_generator.layout import LayoutEngine
from drawio_generator.xml_builder import XMLBuilder
from drawio_generator.exceptions import InvalidGraphError, UnknownNodeTypeError

logger = logging.getLogger(__name__)


class DrawioGenerator:
    """
    그래프 JSON을 draw.io XML로 변환하는 통합 인터페이스
    
    전체 변환 프로세스를 조율합니다:
    1. 그래프 JSON 파싱 및 검증
    2. VPC Container 생성
    3. Subnet Container 생성 (VPC 내부)
    4. EC2 Shape 생성 (Subnet 내부)
    5. 트래픽 Connector 생성
    6. 레이아웃 적용
    7. XML 생성
    """
    
    def __init__(self) -> None:
        """DrawioGenerator 초기화"""
        self.shape_converter = ShapeConverter()
        self.container_converter = ContainerConverter()
        self.connector_converter = ConnectorConverter()
        self.layout_engine = LayoutEngine()
        self.xml_builder = XMLBuilder()
    
    def generate(self, graph_json: dict[str, Any]) -> str:
        """
        그래프 JSON을 draw.io XML로 변환
        
        Args:
            graph_json: Phase 2의 그래프 JSON
                - nodes: 노드 목록 (EC2, VPC, Subnet, SecurityGroup)
                - edges: 엣지 목록 (allows_traffic, contains, hosts, uses)
                - groups: 그룹 목록 (VPC)
                
        Returns:
            str: draw.io XML 문자열
            
        Raises:
            InvalidGraphError: 그래프 JSON이 유효하지 않은 경우
            UnknownNodeTypeError: 알 수 없는 노드 타입을 만난 경우
        """
        logger.info("Starting draw.io XML generation")
        
        # 1. 그래프 JSON 파싱 및 검증
        nodes, edges, groups = self._parse_graph_json(graph_json)
        
        # 2. 노드를 타입별로 분류
        ec2_nodes, vpc_nodes, subnet_nodes, sg_nodes = self._classify_nodes(nodes)
        
        # 3. SecurityGroup → EC2 매핑 생성
        sg_to_ec2_map = self._build_sg_to_ec2_map(ec2_nodes, edges)
        
        # 4. VPC → Subnet 매핑 생성
        vpc_to_subnets_map = self._build_vpc_to_subnets_map(subnet_nodes, edges)
        
        # 5. Subnet → EC2 매핑 생성
        subnet_to_ec2_map = self._build_subnet_to_ec2_map(ec2_nodes, edges)
        
        # 6. VPC Container 생성
        containers: list[Container] = []
        for vpc_node in vpc_nodes:
            vpc_id = vpc_node["id"]
            subnets = vpc_to_subnets_map.get(vpc_id, [])
            vpc_container = self.container_converter.convert_vpc(vpc_node, subnets)
            containers.append(vpc_container)
        
        # 7. Subnet Container 생성 (VPC 내부)
        for subnet_node in subnet_nodes:
            subnet_id = subnet_node["id"]
            ec2_instances = subnet_to_ec2_map.get(subnet_id, [])
            
            # 부모 VPC ID 찾기
            parent_vpc_id = self._find_parent_vpc(subnet_id, edges)
            
            subnet_container = self.container_converter.convert_subnet(
                subnet_node,
                ec2_instances,
                parent_vpc_id=parent_vpc_id
            )
            containers.append(subnet_container)
        
        # 8. EC2 Shape 생성 (Subnet 내부)
        shapes: list[Shape] = []
        for ec2_node in ec2_nodes:
            # 부모 Subnet ID 찾기
            parent_subnet_id = self._find_parent_subnet(ec2_node["id"], edges)
            
            # parent_id를 노드에 추가
            ec2_node_with_parent = {**ec2_node, "parent_id": f"container-{parent_subnet_id}" if parent_subnet_id else None}
            
            # 초기 위치 (레이아웃 엔진이 나중에 조정)
            shape = self.shape_converter.convert_ec2(ec2_node_with_parent, (0, 0))
            shapes.append(shape)
        
        # 9. 레이아웃 적용
        self._apply_layout(containers, shapes)
        
        # 10. 트래픽 Connector 생성 (allows_traffic 엣지만)
        connectors = self._create_traffic_connectors(edges, sg_to_ec2_map)
        
        # 11. XML 생성
        xml_output = self.xml_builder.build(shapes, containers, connectors)
        
        logger.info("draw.io XML generation completed")
        return xml_output
    
    def _parse_graph_json(self, graph_json: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        """
        그래프 JSON 파싱 및 검증
        
        Args:
            graph_json: 그래프 JSON
            
        Returns:
            tuple: (nodes, edges, groups)
            
        Raises:
            InvalidGraphError: 필수 필드가 없는 경우
        """
        # 필수 필드 검증
        if "nodes" not in graph_json:
            raise InvalidGraphError("nodes", "Missing 'nodes' field")
        
        if "edges" not in graph_json:
            raise InvalidGraphError("edges", "Missing 'edges' field")
        
        nodes = graph_json["nodes"]
        edges = graph_json["edges"]
        groups = graph_json.get("groups", [])
        
        # 타입 검증
        if not isinstance(nodes, list):
            raise InvalidGraphError("nodes", "Must be a list")
        
        if not isinstance(edges, list):
            raise InvalidGraphError("edges", "Must be a list")
        
        if not isinstance(groups, list):
            raise InvalidGraphError("groups", "Must be a list")
        
        logger.debug(f"Parsed graph: {len(nodes)} nodes, {len(edges)} edges, {len(groups)} groups")
        
        return nodes, edges, groups
    
    def _classify_nodes(self, nodes: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        """
        노드를 타입별로 분류
        
        Args:
            nodes: 노드 목록
            
        Returns:
            tuple: (ec2_nodes, vpc_nodes, subnet_nodes, sg_nodes)
            
        Raises:
            UnknownNodeTypeError: 알 수 없는 노드 타입을 만난 경우
        """
        ec2_nodes = []
        vpc_nodes = []
        subnet_nodes = []
        sg_nodes = []
        
        for node in nodes:
            node_type = node.get("type", "").lower()  # 대소문자 구분 없이 처리
            node_id = node.get("id", "unknown")
            
            if node_type == "ec2":
                ec2_nodes.append(node)
            elif node_type == "vpc":
                vpc_nodes.append(node)
            elif node_type == "subnet":
                subnet_nodes.append(node)
            elif node_type in ("securitygroup", "security_group"):
                sg_nodes.append(node)
            else:
                raise UnknownNodeTypeError(node_id, node_type)
        
        logger.debug(f"Classified nodes: {len(ec2_nodes)} EC2, {len(vpc_nodes)} VPC, "
                    f"{len(subnet_nodes)} Subnet, {len(sg_nodes)} SecurityGroup")
        
        return ec2_nodes, vpc_nodes, subnet_nodes, sg_nodes
    
    def _build_sg_to_ec2_map(self, ec2_nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[str]]:
        """
        SecurityGroup → EC2 매핑 생성
        
        Args:
            ec2_nodes: EC2 노드 목록
            edges: 엣지 목록
            
        Returns:
            dict: {sg_id: [ec2_id1, ec2_id2, ...]}
        """
        sg_to_ec2_map: dict[str, list[str]] = {}
        
        # uses 엣지를 통해 EC2 → SecurityGroup 관계 파악
        for edge in edges:
            if edge.get("type") == "uses":
                source_id = edge.get("source")
                target_id = edge.get("target")
                
                # None 체크
                if source_id is None or target_id is None:
                    continue
                
                # source가 EC2이고 target이 SecurityGroup인 경우
                if any(ec2["id"] == source_id for ec2 in ec2_nodes):
                    if target_id not in sg_to_ec2_map:
                        sg_to_ec2_map[target_id] = []
                    sg_to_ec2_map[target_id].append(f"shape-{source_id}")
        
        return sg_to_ec2_map
    
    def _build_vpc_to_subnets_map(self, subnet_nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        """
        VPC → Subnet 매핑 생성
        
        Args:
            subnet_nodes: Subnet 노드 목록
            edges: 엣지 목록
            
        Returns:
            dict: {vpc_id: [subnet1, subnet2, ...]}
        """
        vpc_to_subnets_map: dict[str, list[dict[str, Any]]] = {}
        
        # contains 엣지를 통해 VPC → Subnet 관계 파악
        for edge in edges:
            if edge.get("type") == "contains":
                source_id = edge.get("source")
                target_id = edge.get("target")
                
                # None 체크
                if source_id is None or target_id is None:
                    continue
                
                # target이 Subnet인 경우
                subnet = next((s for s in subnet_nodes if s["id"] == target_id), None)
                if subnet:
                    if source_id not in vpc_to_subnets_map:
                        vpc_to_subnets_map[source_id] = []
                    vpc_to_subnets_map[source_id].append(subnet)
        
        return vpc_to_subnets_map
    
    def _build_subnet_to_ec2_map(self, ec2_nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        """
        Subnet → EC2 매핑 생성
        
        Args:
            ec2_nodes: EC2 노드 목록
            edges: 엣지 목록
            
        Returns:
            dict: {subnet_id: [ec2_1, ec2_2, ...]}
        """
        subnet_to_ec2_map: dict[str, list[dict[str, Any]]] = {}
        
        # hosts 엣지를 통해 Subnet → EC2 관계 파악
        for edge in edges:
            if edge.get("type") == "hosts":
                source_id = edge.get("source")
                target_id = edge.get("target")
                
                # None 체크
                if source_id is None or target_id is None:
                    continue
                
                # target이 EC2인 경우
                ec2 = next((e for e in ec2_nodes if e["id"] == target_id), None)
                if ec2:
                    if source_id not in subnet_to_ec2_map:
                        subnet_to_ec2_map[source_id] = []
                    subnet_to_ec2_map[source_id].append(ec2)
        
        return subnet_to_ec2_map
    
    def _find_parent_vpc(self, subnet_id: str, edges: list[dict[str, Any]]) -> str | None:
        """
        Subnet의 부모 VPC ID 찾기
        
        Args:
            subnet_id: Subnet ID
            edges: 엣지 목록
            
        Returns:
            str | None: VPC ID 또는 None
        """
        for edge in edges:
            if edge.get("type") == "contains" and edge.get("target") == subnet_id:
                return edge.get("source")
        return None
    
    def _find_parent_subnet(self, ec2_id: str, edges: list[dict[str, Any]]) -> str | None:
        """
        EC2의 부모 Subnet ID 찾기
        
        Args:
            ec2_id: EC2 ID
            edges: 엣지 목록
            
        Returns:
            str | None: Subnet ID 또는 None
        """
        for edge in edges:
            if edge.get("type") == "hosts" and edge.get("target") == ec2_id:
                return edge.get("source")
        return None
    
    def _apply_layout(self, containers: list[Container], shapes: list[Shape]) -> None:
        """
        레이아웃 적용
        
        Args:
            containers: Container 목록
            shapes: Shape 목록
        """
        # VPC Container 분리
        vpcs = [c for c in containers if c.container_type == "vpc"]
        subnets = [c for c in containers if c.container_type == "subnet"]
        
        # 1. VPC 배치
        self.layout_engine.layout_vpcs(vpcs)
        
        # 2. 각 VPC 내부에 Subnet 배치
        for vpc in vpcs:
            vpc_subnets = [s for s in subnets if s.parent_id == vpc.id]
            if vpc_subnets:
                vpc_bounds = (vpc.x, vpc.y, vpc.width, vpc.height)
                self.layout_engine.layout_subnets(vpc_subnets, vpc_bounds)
        
        # 3. 각 Subnet 내부에 EC2 배치
        for subnet in subnets:
            subnet_ec2s = [s for s in shapes if s.parent_id == subnet.id]
            if subnet_ec2s:
                subnet_bounds = (subnet.x, subnet.y, subnet.width, subnet.height)
                self.layout_engine.layout_ec2_instances(subnet_ec2s, subnet_bounds)
    
    def _create_traffic_connectors(
        self,
        edges: list[dict[str, Any]],
        sg_to_ec2_map: dict[str, list[str]]
    ) -> list[Connector]:
        """
        트래픽 Connector 생성 (allows_traffic 엣지만)
        
        Args:
            edges: 엣지 목록
            sg_to_ec2_map: SecurityGroup → EC2 매핑
            
        Returns:
            list[Connector]: Connector 목록
        """
        connectors: list[Connector] = []
        
        for edge in edges:
            # allows_traffic 엣지만 처리
            if edge.get("type") == "allows_traffic":
                source_sg_id = edge.get("source")
                target_sg_id = edge.get("target")
                
                # None 체크
                if source_sg_id is None or target_sg_id is None:
                    continue
                
                # SecurityGroup을 사용하는 EC2 목록 가져오기
                source_ec2_list = sg_to_ec2_map.get(source_sg_id, [])
                target_ec2_list = sg_to_ec2_map.get(target_sg_id, [])
                
                # EC2 간 Connector 생성
                if source_ec2_list and target_ec2_list:
                    edge_connectors = self.connector_converter.convert_traffic_edge(
                        edge,
                        source_ec2_list,
                        target_ec2_list
                    )
                    connectors.extend(edge_connectors)
        
        logger.debug(f"Created {len(connectors)} traffic connectors")
        
        return connectors
