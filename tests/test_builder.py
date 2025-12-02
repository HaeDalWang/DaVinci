"""
GraphBuilder 테스트

Requirements: 2.1, 2.2, 2.3, 2.4
"""

import pytest

from resource_graph_builder import GraphBuilder, InvalidReferenceError


class TestGraphBuilder:
    """GraphBuilder 클래스 테스트"""
    
    def test_build_creates_graph_with_nodes(self) -> None:
        """
        build 메서드가 모든 리소스를 노드로 변환하는지 테스트
        
        Requirements: 1.2
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': ['sg-001'],
                    'private_ip': '10.0.1.10',
                    'public_ip': '54.1.2.3'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # 모든 리소스가 노드로 변환되었는지 확인
        assert 'i-123' in graph.nodes
        assert 'vpc-abc' in graph.nodes
        assert 'subnet-xyz' in graph.nodes
        assert 'sg-001' in graph.nodes
        
        # 노드 타입 확인
        assert graph.nodes['i-123'].type == 'ec2'
        assert graph.nodes['vpc-abc'].type == 'vpc'
        assert graph.nodes['subnet-xyz'].type == 'subnet'
        assert graph.nodes['sg-001'].type == 'security_group'
    
    def test_create_vpc_edges(self) -> None:
        """
        VPC-EC2, Subnet-EC2 엣지가 올바르게 생성되는지 테스트
        
        Requirements: 2.1, 2.2, 2.3, 2.4
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': ['sg-001'],
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # VPC-EC2 엣지 확인
        vpc_edges = [e for e in graph.edges if e.source == 'vpc-abc' and e.target == 'i-123']
        assert len(vpc_edges) == 1
        assert vpc_edges[0].edge_type == 'contains'
        
        # Subnet-EC2 엣지 확인
        subnet_edges = [e for e in graph.edges if e.source == 'subnet-xyz' and e.target == 'i-123']
        assert len(subnet_edges) == 1
        assert subnet_edges[0].edge_type == 'hosts'
    
    def test_multiple_ec2_instances(self) -> None:
        """
        여러 EC2 인스턴스에 대해 엣지가 올바르게 생성되는지 테스트
        
        Requirements: 2.1, 2.2
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server-1',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.10'
                },
                {
                    'instance_id': 'i-456',
                    'name': 'web-server-2',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.11'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # 각 EC2에 대해 VPC, Subnet 엣지가 생성되었는지 확인
        assert len(graph.edges) == 4  # 2개 EC2 * 2개 엣지 (VPC, Subnet)
        
        # i-123 엣지
        assert any(e.source == 'vpc-abc' and e.target == 'i-123' and e.edge_type == 'contains' 
                   for e in graph.edges)
        assert any(e.source == 'subnet-xyz' and e.target == 'i-123' and e.edge_type == 'hosts' 
                   for e in graph.edges)
        
        # i-456 엣지
        assert any(e.source == 'vpc-abc' and e.target == 'i-456' and e.edge_type == 'contains' 
                   for e in graph.edges)
        assert any(e.source == 'subnet-xyz' and e.target == 'i-456' and e.edge_type == 'hosts' 
                   for e in graph.edges)
    
    def test_invalid_vpc_reference(self) -> None:
        """
        존재하지 않는 VPC를 참조하면 InvalidReferenceError 발생
        
        Requirements: 8.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-nonexistent',  # 존재하지 않는 VPC
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        with pytest.raises(InvalidReferenceError) as exc_info:
            builder.build(phase1_json)
        
        assert 'vpc-nonexistent' in str(exc_info.value)
        assert exc_info.value.resource_id == 'vpc-nonexistent'
        assert exc_info.value.resource_type == 'vpc'
    
    def test_invalid_subnet_reference(self) -> None:
        """
        존재하지 않는 Subnet을 참조하면 InvalidReferenceError 발생
        
        Requirements: 8.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-nonexistent',  # 존재하지 않는 Subnet
                    'security_groups': [],
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        with pytest.raises(InvalidReferenceError) as exc_info:
            builder.build(phase1_json)
        
        assert 'subnet-nonexistent' in str(exc_info.value)
        assert exc_info.value.resource_id == 'subnet-nonexistent'
        assert exc_info.value.resource_type == 'subnet'
    
    def test_node_attributes(self) -> None:
        """
        노드에 올바른 속성이 포함되는지 테스트
        
        Requirements: 7.1, 7.2, 7.3, 7.4
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.10',
                    'public_ip': '54.1.2.3'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # EC2 노드 속성 확인
        ec2_node = graph.nodes['i-123']
        assert ec2_node.attributes['state'] == 'running'
        assert ec2_node.attributes['private_ip'] == '10.0.1.10'
        assert ec2_node.attributes['public_ip'] == '54.1.2.3'
        
        # VPC 노드 속성 확인
        vpc_node = graph.nodes['vpc-abc']
        assert vpc_node.attributes['cidr_block'] == '10.0.0.0/16'
        
        # Subnet 노드 속성 확인
        subnet_node = graph.nodes['subnet-xyz']
        assert subnet_node.attributes['cidr_block'] == '10.0.1.0/24'
        assert subnet_node.attributes['availability_zone'] == 'ap-northeast-2a'
    
    def test_create_security_group_edges(self) -> None:
        """
        EC2-SecurityGroup 엣지가 올바르게 생성되는지 테스트
        
        Requirements: 3.1, 3.2
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': ['sg-001', 'sg-002'],
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                },
                {
                    'group_id': 'sg-002',
                    'name': 'ssh-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'SSH access security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # EC2-SecurityGroup 엣지 확인
        sg_edges = [e for e in graph.edges if e.source == 'i-123' and e.edge_type == 'uses']
        assert len(sg_edges) == 2
        
        # sg-001로의 엣지 확인
        assert any(e.target == 'sg-001' for e in sg_edges)
        
        # sg-002로의 엣지 확인
        assert any(e.target == 'sg-002' for e in sg_edges)
    
    def test_ec2_without_security_groups(self) -> None:
        """
        SecurityGroup이 없는 EC2도 정상 처리되는지 테스트
        
        Requirements: 3.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],  # 빈 리스트
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # EC2-SecurityGroup 엣지가 없어야 함
        sg_edges = [e for e in graph.edges if e.source == 'i-123' and e.edge_type == 'uses']
        assert len(sg_edges) == 0
        
        # VPC, Subnet 엣지는 여전히 존재해야 함
        assert len(graph.edges) == 2
    
    def test_invalid_security_group_reference(self) -> None:
        """
        존재하지 않는 SecurityGroup을 참조하면 InvalidReferenceError 발생
        
        Requirements: 8.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': ['sg-nonexistent'],  # 존재하지 않는 SG
                    'private_ip': '10.0.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        with pytest.raises(InvalidReferenceError) as exc_info:
            builder.build(phase1_json)
        
        assert 'sg-nonexistent' in str(exc_info.value)
        assert exc_info.value.resource_id == 'sg-nonexistent'
        assert exc_info.value.resource_type == 'security_group'

    def test_create_traffic_edges_inbound(self) -> None:
        """
        SecurityGroup 인바운드 규칙에서 다른 SG를 참조하면 트래픽 허용 엣지 생성
        
        Requirements: 4.1, 4.3, 4.4
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 80,
                            'to_port': 80,
                            'target': 'sg-002'  # 다른 SG 참조
                        }
                    ],
                    'outbound_rules': []
                },
                {
                    'group_id': 'sg-002',
                    'name': 'alb-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'ALB security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # 트래픽 허용 엣지 확인 (sg-002 -> sg-001)
        traffic_edges = [e for e in graph.edges if e.edge_type == 'allows_traffic']
        assert len(traffic_edges) == 1
        
        edge = traffic_edges[0]
        assert edge.source == 'sg-002'
        assert edge.target == 'sg-001'
        assert edge.attributes['protocol'] == 'tcp'
        assert edge.attributes['from_port'] == 80
        assert edge.attributes['to_port'] == 80
        assert edge.attributes['direction'] == 'inbound'
    
    def test_create_traffic_edges_outbound(self) -> None:
        """
        SecurityGroup 아웃바운드 규칙에서 다른 SG를 참조하면 트래픽 허용 엣지 생성
        
        Requirements: 4.2, 4.3, 4.4
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [],
                    'outbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 3306,
                            'to_port': 3306,
                            'target': 'sg-003'  # 다른 SG 참조
                        }
                    ]
                },
                {
                    'group_id': 'sg-003',
                    'name': 'db-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Database security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # 트래픽 허용 엣지 확인 (sg-001 -> sg-003)
        traffic_edges = [e for e in graph.edges if e.edge_type == 'allows_traffic']
        assert len(traffic_edges) == 1
        
        edge = traffic_edges[0]
        assert edge.source == 'sg-001'
        assert edge.target == 'sg-003'
        assert edge.attributes['protocol'] == 'tcp'
        assert edge.attributes['from_port'] == 3306
        assert edge.attributes['to_port'] == 3306
        assert edge.attributes['direction'] == 'outbound'
    
    def test_create_traffic_edges_cidr_ignored(self) -> None:
        """
        SecurityGroup 규칙의 target이 CIDR인 경우 엣지를 생성하지 않음
        
        Requirements: 4.1, 4.2
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 443,
                            'to_port': 443,
                            'target': '0.0.0.0/0'  # CIDR (SG가 아님)
                        }
                    ],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # CIDR 타겟은 엣지를 생성하지 않음
        traffic_edges = [e for e in graph.edges if e.edge_type == 'allows_traffic']
        assert len(traffic_edges) == 0
    
    def test_create_traffic_edges_multiple_rules(self) -> None:
        """
        여러 SecurityGroup 규칙에 대해 트래픽 허용 엣지가 올바르게 생성되는지 테스트
        
        Requirements: 4.1, 4.2, 4.3, 4.4
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 80,
                            'to_port': 80,
                            'target': 'sg-002'
                        },
                        {
                            'protocol': 'tcp',
                            'from_port': 443,
                            'to_port': 443,
                            'target': 'sg-002'
                        }
                    ],
                    'outbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 3306,
                            'to_port': 3306,
                            'target': 'sg-003'
                        }
                    ]
                },
                {
                    'group_id': 'sg-002',
                    'name': 'alb-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'ALB security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                },
                {
                    'group_id': 'sg-003',
                    'name': 'db-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Database security group',
                    'inbound_rules': [],
                    'outbound_rules': []
                }
            ]
        }
        
        graph = builder.build(phase1_json)
        
        # 트래픽 허용 엣지 확인
        traffic_edges = [e for e in graph.edges if e.edge_type == 'allows_traffic']
        assert len(traffic_edges) == 3
        
        # 인바운드 규칙 엣지 (sg-002 -> sg-001, 2개)
        inbound_edges = [e for e in traffic_edges if e.target == 'sg-001']
        assert len(inbound_edges) == 2
        assert all(e.source == 'sg-002' for e in inbound_edges)
        assert any(e.attributes['from_port'] == 80 for e in inbound_edges)
        assert any(e.attributes['from_port'] == 443 for e in inbound_edges)
        
        # 아웃바운드 규칙 엣지 (sg-001 -> sg-003, 1개)
        outbound_edges = [e for e in traffic_edges if e.source == 'sg-001']
        assert len(outbound_edges) == 1
        assert outbound_edges[0].target == 'sg-003'
        assert outbound_edges[0].attributes['from_port'] == 3306
    
    def test_invalid_traffic_sg_reference(self) -> None:
        """
        트래픽 규칙에서 존재하지 않는 SecurityGroup을 참조하면 InvalidReferenceError 발생
        
        Requirements: 8.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': [
                {
                    'group_id': 'sg-001',
                    'name': 'web-sg',
                    'vpc_id': 'vpc-abc',
                    'description': 'Web server security group',
                    'inbound_rules': [
                        {
                            'protocol': 'tcp',
                            'from_port': 80,
                            'to_port': 80,
                            'target': 'sg-nonexistent'  # 존재하지 않는 SG
                        }
                    ],
                    'outbound_rules': []
                }
            ]
        }
        
        with pytest.raises(InvalidReferenceError) as exc_info:
            builder.build(phase1_json)
        
        assert 'sg-nonexistent' in str(exc_info.value)
        assert exc_info.value.resource_id == 'sg-nonexistent'
        assert exc_info.value.resource_type == 'security_group'

    def test_create_vpc_groups(self) -> None:
        """
        VPC별로 그룹이 생성되고 Subnet과 EC2가 멤버로 포함되는지 테스트
        
        Requirements: 5.1, 5.2, 5.3
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server-1',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.10'
                },
                {
                    'instance_id': 'i-456',
                    'name': 'web-server-2',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.11'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # VPC 그룹이 생성되었는지 확인
        assert 'vpc-abc' in graph.groups
        
        group = graph.groups['vpc-abc']
        assert group.type == 'vpc'
        assert group.name == 'production-vpc'
        
        # 그룹 멤버 확인 (Subnet + EC2)
        assert 'subnet-xyz' in group.members
        assert 'i-123' in group.members
        assert 'i-456' in group.members
        assert len(group.members) == 3
        
        # 그룹 속성 확인
        assert group.attributes['vpc_id'] == 'vpc-abc'
        assert group.attributes['cidr_block'] == '10.0.0.0/16'
    
    def test_create_vpc_groups_multiple_vpcs(self) -> None:
        """
        여러 VPC에 대해 각각 그룹이 생성되는지 테스트
        
        Requirements: 5.1, 5.2
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': 'i-123',
                    'name': 'web-server',
                    'state': 'running',
                    'vpc_id': 'vpc-abc',
                    'subnet_id': 'subnet-xyz',
                    'security_groups': [],
                    'private_ip': '10.0.1.10'
                },
                {
                    'instance_id': 'i-456',
                    'name': 'db-server',
                    'state': 'running',
                    'vpc_id': 'vpc-def',
                    'subnet_id': 'subnet-uvw',
                    'security_groups': [],
                    'private_ip': '10.1.1.10'
                }
            ],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'production-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-xyz',
                            'name': 'public-subnet',
                            'cidr_block': '10.0.1.0/24',
                            'availability_zone': 'ap-northeast-2a'
                        }
                    ]
                },
                {
                    'vpc_id': 'vpc-def',
                    'name': 'staging-vpc',
                    'cidr_block': '10.1.0.0/16',
                    'subnets': [
                        {
                            'subnet_id': 'subnet-uvw',
                            'name': 'private-subnet',
                            'cidr_block': '10.1.1.0/24',
                            'availability_zone': 'ap-northeast-2b'
                        }
                    ]
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # 두 VPC 그룹이 모두 생성되었는지 확인
        assert len(graph.groups) == 2
        assert 'vpc-abc' in graph.groups
        assert 'vpc-def' in graph.groups
        
        # vpc-abc 그룹 확인
        group_abc = graph.groups['vpc-abc']
        assert 'subnet-xyz' in group_abc.members
        assert 'i-123' in group_abc.members
        assert len(group_abc.members) == 2
        
        # vpc-def 그룹 확인
        group_def = graph.groups['vpc-def']
        assert 'subnet-uvw' in group_def.members
        assert 'i-456' in group_def.members
        assert len(group_def.members) == 2
    
    def test_create_vpc_groups_empty_vpc(self) -> None:
        """
        EC2나 Subnet이 없는 VPC도 그룹이 생성되는지 테스트
        
        Requirements: 5.1
        """
        builder = GraphBuilder()
        
        phase1_json = {
            'ec2_instances': [],
            'vpcs': [
                {
                    'vpc_id': 'vpc-abc',
                    'name': 'empty-vpc',
                    'cidr_block': '10.0.0.0/16',
                    'subnets': []
                }
            ],
            'security_groups': []
        }
        
        graph = builder.build(phase1_json)
        
        # 빈 VPC도 그룹이 생성되어야 함
        assert 'vpc-abc' in graph.groups
        
        group = graph.groups['vpc-abc']
        assert group.type == 'vpc'
        assert group.name == 'empty-vpc'
        assert len(group.members) == 0  # 멤버가 없음
        assert group.attributes['cidr_block'] == '10.0.0.0/16'
