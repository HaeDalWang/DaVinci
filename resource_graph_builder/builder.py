"""
GraphBuilder - 리소스 그래프 생성 통합 인터페이스

Phase 1 JSON 데이터로부터 리소스 그래프를 생성합니다.

Requirements: 2.1, 2.2, 2.3, 2.4
"""

import logging
from typing import Any

from .exceptions import InvalidReferenceError
from .graph import ResourceGraph
from .models import Node, Edge
from .parser import ResourceParser, ParsedResources

logger = logging.getLogger(__name__)


class GraphBuilder:
    """
    전체 그래프 생성 프로세스를 조율하는 고수준 인터페이스
    
    Phase 1 JSON으로부터 리소스 그래프를 생성합니다.
    """
    
    def __init__(self) -> None:
        """GraphBuilder 초기화"""
        self.parser = ResourceParser()
    
    def build(self, phase1_json: dict[str, Any]) -> ResourceGraph:
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
            4. EC2-SecurityGroup 엣지 생성 (추후 구현)
            5. SecurityGroup 규칙 기반 엣지 생성 (추후 구현)
            6. VPC별 그룹 생성 (추후 구현)
            7. 그래프 반환
        """
        logger.info("Starting graph build from Phase 1 JSON")
        
        # 1. JSON 데이터 파싱
        logger.debug("Parsing Phase 1 JSON...")
        parsed = self.parser.parse(phase1_json)
        logger.debug(f"Parsed: {len(parsed.ec2_instances)} EC2, {len(parsed.vpcs)} VPCs, "
                    f"{len(parsed.subnets)} Subnets, {len(parsed.security_groups)} SGs")
        
        # 2. 그래프 생성 및 노드 추가
        graph = ResourceGraph()
        self._add_nodes(graph, parsed)
        
        # 3. VPC-EC2, Subnet-EC2 엣지 생성
        self._create_vpc_edges(graph, parsed)
        
        # 4. EC2-SecurityGroup 엣지 생성
        self._create_security_group_edges(graph, parsed)
        
        # 5. SecurityGroup 규칙 기반 트래픽 허용 엣지 생성
        self._create_traffic_edges(graph, parsed)
        
        # 6. IGW, NAT Gateway 엣지 생성
        self._create_gateway_edges(graph, parsed)
        
        # 7. Route Table 엣지 생성
        self._create_route_table_edges(graph, parsed)
        
        # 8. Load Balancer 엣지 생성
        self._create_load_balancer_edges(graph, parsed)
        
        # 9. RDS 엣지 생성
        self._create_rds_edges(graph, parsed)
        
        # 10. VPC Peering 엣지 생성
        self._create_vpc_peering_edges(graph, parsed)
        
        # 11. VPC별 그룹 생성
        self._create_vpc_groups(graph, parsed)
        
        return graph
    
    def _add_nodes(self, graph: ResourceGraph, parsed: ParsedResources) -> None:
        """
        파싱된 리소스를 노드로 변환하여 그래프에 추가
        
        Args:
            graph: 노드를 추가할 그래프
            parsed: 파싱된 리소스 데이터
            
        Requirements: 1.2, 7.1, 7.2, 7.3, 7.4
        """
        # EC2 인스턴스 노드 추가
        for ec2 in parsed.ec2_instances:
            # Name이 없으면 ID 사용
            name = ec2['name'] if ec2['name'] else ec2['instance_id']
            
            node = Node(
                id=ec2['instance_id'],
                type='ec2',
                name=name,
                attributes={
                    'state': ec2['state'],
                    'private_ip': ec2['private_ip'],
                    'public_ip': ec2.get('public_ip')
                }
            )
            graph.add_node(node)
        
        # VPC 노드 추가
        for vpc in parsed.vpcs:
            # Name이 없으면 ID 사용
            name = vpc['name'] if vpc['name'] else vpc['vpc_id']
            
            node = Node(
                id=vpc['vpc_id'],
                type='vpc',
                name=name,
                attributes={
                    'cidr_block': vpc['cidr_block']
                }
            )
            graph.add_node(node)
        
        # Subnet 노드 추가
        for subnet in parsed.subnets:
            # Name이 없으면 ID 사용
            name = subnet['name'] if subnet['name'] else subnet['subnet_id']
            
            node = Node(
                id=subnet['subnet_id'],
                type='subnet',
                name=name,
                attributes={
                    'cidr_block': subnet['cidr_block'],
                    'availability_zone': subnet['availability_zone'],
                    'vpc_id': subnet['vpc_id']
                }
            )
            graph.add_node(node)
        
        # SecurityGroup 노드 추가
        for sg in parsed.security_groups:
            # SecurityGroup이 참조하는 VPC가 존재하는지 확인
            vpc_id = sg['vpc_id']
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # Name이 없으면 ID 사용
            name = sg['name'] if sg['name'] else sg['group_id']
            
            node = Node(
                id=sg['group_id'],
                type='security_group',
                name=name,
                attributes={
                    'description': sg['description'],
                    'vpc_id': sg['vpc_id']
                }
            )
            graph.add_node(node)
        
        # Internet Gateway 노드 추가
        for igw in parsed.internet_gateways:
            # Name이 없으면 ID 사용
            name = igw['name'] if igw['name'] else igw['gateway_id']
            
            node = Node(
                id=igw['gateway_id'],
                type='internet_gateway',
                name=name,
                attributes={
                    'state': igw['state'],
                    'vpc_id': igw.get('vpc_id')
                }
            )
            graph.add_node(node)
        
        # NAT Gateway 노드 추가
        for nat in parsed.nat_gateways:
            # NAT Gateway가 참조하는 VPC와 Subnet이 존재하는지 확인
            vpc_id = nat['vpc_id']
            subnet_id = nat['subnet_id']
            
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            if subnet_id not in graph.nodes:
                raise InvalidReferenceError(subnet_id, 'subnet')
            
            # Name이 없으면 ID 사용
            name = nat['name'] if nat['name'] else nat['gateway_id']
            
            node = Node(
                id=nat['gateway_id'],
                type='nat_gateway',
                name=name,
                attributes={
                    'state': nat['state'],
                    'vpc_id': nat['vpc_id'],
                    'subnet_id': nat['subnet_id'],
                    'public_ip': nat.get('public_ip')
                }
            )
            graph.add_node(node)
        
        # Route Table 노드 추가
        for rt in parsed.route_tables:
            # Route Table이 참조하는 VPC가 존재하는지 확인
            vpc_id = rt['vpc_id']
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # Name이 없으면 ID 사용
            name = rt['name'] if rt['name'] else rt['route_table_id']
            
            node = Node(
                id=rt['route_table_id'],
                type='route_table',
                name=name,
                attributes={
                    'vpc_id': rt['vpc_id'],
                    'is_main': rt['is_main'],
                    'routes': rt['routes'],
                    'subnet_associations': rt['subnet_associations']
                }
            )
            graph.add_node(node)
        
        # Load Balancer 노드 추가
        for lb in parsed.load_balancers:
            # Load Balancer가 참조하는 VPC가 존재하는지 확인
            vpc_id = lb['vpc_id']
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # Name이 없으면 ARN에서 이름 추출
            name = lb['name'] if lb['name'] else lb['load_balancer_arn'].split('/')[-2]
            
            node = Node(
                id=lb['load_balancer_arn'],
                type='load_balancer',
                name=name,
                attributes={
                    'load_balancer_type': lb['load_balancer_type'],
                    'scheme': lb['scheme'],
                    'vpc_id': lb['vpc_id'],
                    'subnet_ids': lb['subnet_ids'],
                    'security_groups': lb['security_groups'],
                    'state': lb['state'],
                    'dns_name': lb['dns_name']
                }
            )
            graph.add_node(node)
        
        # RDS 인스턴스 노드 추가
        for rds in parsed.rds_instances:
            # RDS가 참조하는 VPC가 존재하는지 확인
            vpc_id = rds['vpc_id']
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # Name이 없으면 identifier 사용
            name = rds['name'] if rds['name'] else rds['db_instance_identifier']
            
            node = Node(
                id=rds['db_instance_identifier'],
                type='rds',
                name=name,
                attributes={
                    'db_instance_arn': rds['db_instance_arn'],
                    'engine': rds['engine'],
                    'engine_version': rds['engine_version'],
                    'db_instance_class': rds['db_instance_class'],
                    'vpc_id': rds['vpc_id'],
                    'subnet_group_name': rds['subnet_group_name'],
                    'subnet_ids': rds['subnet_ids'],
                    'security_groups': rds['security_groups'],
                    'availability_zone': rds['availability_zone'],
                    'multi_az': rds['multi_az'],
                    'publicly_accessible': rds['publicly_accessible'],
                    'endpoint': rds['endpoint'],
                    'port': rds['port'],
                    'status': rds['status']
                }
            )
            graph.add_node(node)
    
    def _create_vpc_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        VPC-EC2, Subnet-EC2 엣지 생성
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
            
        Requirements: 2.1, 2.2, 2.3, 2.4
        """
        for ec2 in parsed.ec2_instances:
            instance_id = ec2['instance_id']
            vpc_id = ec2['vpc_id']
            subnet_id = ec2['subnet_id']
            
            # VPC 존재 확인
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # Subnet 존재 확인
            if subnet_id not in graph.nodes:
                raise InvalidReferenceError(subnet_id, 'subnet')
            
            # VPC-EC2 엣지 생성 (contains)
            vpc_edge = Edge(
                source=vpc_id,
                target=instance_id,
                edge_type='contains',
                attributes={}
            )
            graph.add_edge(vpc_edge)
            
            # Subnet-EC2 엣지 생성 (hosts)
            subnet_edge = Edge(
                source=subnet_id,
                target=instance_id,
                edge_type='hosts',
                attributes={}
            )
            graph.add_edge(subnet_edge)
    
    def _create_security_group_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        EC2-SecurityGroup 엣지 생성
        
        EC2 인스턴스에 연결된 모든 SecurityGroup으로의 엣지를 생성합니다.
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
            
        Requirements: 3.1, 3.2
        """
        for ec2 in parsed.ec2_instances:
            instance_id = ec2['instance_id']
            security_groups = ec2.get('security_groups', [])
            
            # EC2에 연결된 모든 SecurityGroup으로 엣지 생성
            for sg_id in security_groups:
                # SecurityGroup 존재 확인
                if sg_id not in graph.nodes:
                    raise InvalidReferenceError(sg_id, 'security_group')
                
                # EC2-SecurityGroup 엣지 생성 (uses)
                edge = Edge(
                    source=instance_id,
                    target=sg_id,
                    edge_type='uses',
                    attributes={}
                )
                graph.add_edge(edge)
    
    def _create_traffic_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        SecurityGroup 규칙 기반 트래픽 허용 엣지 생성
        
        SecurityGroup의 인바운드/아웃바운드 규칙에서 다른 SecurityGroup을 참조하는 경우,
        두 SecurityGroup 간 트래픽 허용 엣지를 생성합니다.
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
            
        Requirements: 4.1, 4.2, 4.3, 4.4
        """
        for sg in parsed.security_groups:
            source_sg_id = sg['group_id']
            
            # 인바운드 규칙 처리
            for rule in sg.get('inbound_rules', []):
                target = rule.get('target', '')
                
                # target이 SecurityGroup ID인지 확인 (sg-로 시작)
                if target.startswith('sg-'):
                    # 참조된 SecurityGroup이 존재하는지 확인
                    if target not in graph.nodes:
                        raise InvalidReferenceError(target, 'security_group')
                    
                    # 트래픽 허용 엣지 생성 (target -> source)
                    # 인바운드 규칙이므로 target에서 source로 트래픽 허용
                    edge = Edge(
                        source=target,
                        target=source_sg_id,
                        edge_type='allows_traffic',
                        attributes={
                            'protocol': rule.get('protocol', ''),
                            'from_port': rule.get('from_port'),
                            'to_port': rule.get('to_port'),
                            'direction': 'inbound'
                        }
                    )
                    graph.add_edge(edge)
            
            # 아웃바운드 규칙 처리
            for rule in sg.get('outbound_rules', []):
                target = rule.get('target', '')
                
                # target이 SecurityGroup ID인지 확인 (sg-로 시작)
                if target.startswith('sg-'):
                    # 참조된 SecurityGroup이 존재하는지 확인
                    if target not in graph.nodes:
                        raise InvalidReferenceError(target, 'security_group')
                    
                    # 트래픽 허용 엣지 생성 (source -> target)
                    # 아웃바운드 규칙이므로 source에서 target으로 트래픽 허용
                    edge = Edge(
                        source=source_sg_id,
                        target=target,
                        edge_type='allows_traffic',
                        attributes={
                            'protocol': rule.get('protocol', ''),
                            'from_port': rule.get('from_port'),
                            'to_port': rule.get('to_port'),
                            'direction': 'outbound'
                        }
                    )
                    graph.add_edge(edge)

    def _create_vpc_groups(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        VPC별 그룹 생성
        
        각 VPC에 속한 Subnet과 EC2 인스턴스를 그룹 멤버로 포함하는 그룹을 생성합니다.
        
        Args:
            graph: 그룹을 추가할 그래프
            parsed: 파싱된 리소스 데이터
            
        Requirements: 5.1, 5.2, 5.3
        """
        from .models import Group
        
        # 각 VPC에 대해 그룹 생성
        for vpc in parsed.vpcs:
            vpc_id = vpc['vpc_id']
            
            # VPC가 노드로 존재하는지 확인
            if vpc_id not in graph.nodes:
                raise InvalidReferenceError(vpc_id, 'vpc')
            
            # 이 VPC에 속한 멤버 수집
            members: list[str] = []
            
            # 1. VPC에 속한 Subnet 추가
            for subnet in parsed.subnets:
                if subnet['vpc_id'] == vpc_id:
                    members.append(subnet['subnet_id'])
            
            # 2. VPC에 속한 EC2 인스턴스 추가
            for ec2 in parsed.ec2_instances:
                if ec2['vpc_id'] == vpc_id:
                    members.append(ec2['instance_id'])
            
            # VPC 그룹 생성
            group = Group(
                id=vpc_id,
                type='vpc',
                name=vpc['name'],
                members=members,
                attributes={
                    'vpc_id': vpc_id,
                    'cidr_block': vpc['cidr_block']
                }
            )
            graph.add_group(group)

    def _create_gateway_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        Internet Gateway와 NAT Gateway 엣지 생성
        
        - VPC → Internet Gateway (attaches)
        - Subnet → NAT Gateway (hosts)
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
        """
        # VPC → Internet Gateway 엣지
        for igw in parsed.internet_gateways:
            vpc_id = igw.get('vpc_id')
            
            # VPC에 연결된 경우에만 엣지 생성
            if vpc_id and vpc_id in graph.nodes:
                edge = Edge(
                    source=vpc_id,
                    target=igw['gateway_id'],
                    edge_type='attaches',
                    attributes={}
                )
                graph.add_edge(edge)
        
        # Subnet → NAT Gateway 엣지
        for nat in parsed.nat_gateways:
            subnet_id = nat['subnet_id']
            
            # Subnet이 존재하는지 확인
            if subnet_id in graph.nodes:
                edge = Edge(
                    source=subnet_id,
                    target=nat['gateway_id'],
                    edge_type='hosts',
                    attributes={}
                )
                graph.add_edge(edge)

    def _create_route_table_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        Route Table 엣지 생성
        
        - RouteTable → Subnet (associates)
        - RouteTable → IGW/NAT Gateway (routes_to)
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
        """
        for rt in parsed.route_tables:
            rt_id = rt['route_table_id']
            
            # RouteTable → Subnet 연결 (associates)
            for subnet_id in rt['subnet_associations']:
                if subnet_id in graph.nodes:
                    edge = Edge(
                        source=rt_id,
                        target=subnet_id,
                        edge_type='associates',
                        attributes={}
                    )
                    graph.add_edge(edge)
            
            # RouteTable → Gateway 연결 (routes_to)
            for route in rt['routes']:
                target_type = route['target_type']
                target_id = route.get('target_id')
                
                # local 라우트는 스킵
                if target_type == 'local' or not target_id:
                    continue
                
                # 타겟이 그래프에 존재하는 경우에만 엣지 생성
                if target_id in graph.nodes:
                    edge = Edge(
                        source=rt_id,
                        target=target_id,
                        edge_type='routes_to',
                        attributes={
                            'destination': route['destination'],
                            'target_type': target_type
                        }
                    )
                    graph.add_edge(edge)


    def _create_load_balancer_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        Load Balancer 엣지 생성
        
        - LoadBalancer → Subnet (distributes_to)
        - LoadBalancer → SecurityGroup (uses)
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
        """
        for lb in parsed.load_balancers:
            lb_arn = lb['load_balancer_arn']
            
            # LoadBalancer → Subnet 연결 (distributes_to)
            for subnet_id in lb['subnet_ids']:
                if subnet_id in graph.nodes:
                    edge = Edge(
                        source=lb_arn,
                        target=subnet_id,
                        edge_type='distributes_to',
                        attributes={}
                    )
                    graph.add_edge(edge)
            
            # LoadBalancer → SecurityGroup 연결 (uses)
            # ALB/CLB만 SecurityGroup 사용, NLB는 없음
            for sg_id in lb['security_groups']:
                if sg_id in graph.nodes:
                    edge = Edge(
                        source=lb_arn,
                        target=sg_id,
                        edge_type='uses',
                        attributes={}
                    )
                    graph.add_edge(edge)


    def _create_rds_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        RDS 엣지 생성
        
        - RDS → Subnet (resides_in) - 첫 번째 Subnet에만
        - RDS → SecurityGroup (uses)
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
        """
        for rds in parsed.rds_instances:
            rds_id = rds['db_instance_identifier']
            
            # RDS → 첫 번째 Subnet 연결 (resides_in)
            # RDS는 여러 Subnet에 걸쳐 있지만 다이어그램에서는 첫 번째 Subnet에 표시
            subnet_ids = rds['subnet_ids']
            if subnet_ids and subnet_ids[0] in graph.nodes:
                edge = Edge(
                    source=rds_id,
                    target=subnet_ids[0],
                    edge_type='resides_in',
                    attributes={}
                )
                graph.add_edge(edge)
            
            # RDS → SecurityGroup 연결 (uses)
            for sg_id in rds['security_groups']:
                if sg_id in graph.nodes:
                    edge = Edge(
                        source=rds_id,
                        target=sg_id,
                        edge_type='uses',
                        attributes={}
                    )
                    graph.add_edge(edge)


    def _create_vpc_peering_edges(
        self,
        graph: ResourceGraph,
        parsed: ParsedResources
    ) -> None:
        """
        VPC Peering Connection 엣지 생성
        
        - Requester VPC ↔ Accepter VPC (peers_with)
        
        Args:
            graph: 엣지를 추가할 그래프
            parsed: 파싱된 리소스 데이터
        """
        for pcx in parsed.vpc_peering_connections:
            requester_vpc_id = pcx['requester_vpc_id']
            accepter_vpc_id = pcx['accepter_vpc_id']
            peering_connection_id = pcx['peering_connection_id']
            status = pcx['status']
            
            # 두 VPC가 모두 존재하는지 확인
            if requester_vpc_id not in graph.nodes or accepter_vpc_id not in graph.nodes:
                logger.debug(f"Skipping VPC Peering {peering_connection_id}: VPC not found")
                continue
            
            # active 상태인 경우에만 엣지 생성
            if status != 'active':
                logger.debug(f"Skipping VPC Peering {peering_connection_id}: status={status}")
                continue
            
            # VPC Peering 엣지 생성 (양방향)
            edge = Edge(
                source=requester_vpc_id,
                target=accepter_vpc_id,
                edge_type='peers_with',
                attributes={
                    'peering_connection_id': peering_connection_id,
                    'name': pcx.get('name', ''),
                    'status': status
                }
            )
            graph.add_edge(edge)
