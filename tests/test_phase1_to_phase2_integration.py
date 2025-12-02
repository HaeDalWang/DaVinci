"""
Phase 1 → Phase 2 엔드투엔드 통합 테스트

Phase 1에서 수집한 AWS 리소스 데이터를 Phase 2에서 그래프로 변환하는
전체 플로우를 테스트합니다.

Requirements: 전체
"""

import pytest
from moto import mock_aws
import boto3
from datetime import datetime

from aws_resource_fetcher.models import AWSCredentials
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher
from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher

from resource_graph_builder.builder import GraphBuilder
from resource_graph_builder.models import Node, Edge, Group


@pytest.fixture
def aws_credentials():
    """AWS 자격증명 환경 변수 설정"""
    import os
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = 'ap-northeast-2'


@pytest.fixture
def mock_credentials():
    """Mock AWS 자격증명"""
    return AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )


def phase1_to_json(ec2_instances, vpcs, security_groups):
    """
    Phase 1 fetcher 결과를 Phase 2 입력 JSON 형식으로 변환
    
    Args:
        ec2_instances: EC2Fetcher.fetch() 결과
        vpcs: VPCFetcher.fetch() 결과
        security_groups: SecurityGroupFetcher.fetch() 결과
        
    Returns:
        dict: Phase 2 입력 JSON
    """
    return {
        'ec2_instances': [
            {
                'instance_id': ec2.instance_id,
                'name': ec2.name if ec2.name else ec2.instance_id,  # name이 비어있으면 ID 사용
                'state': ec2.state,
                'vpc_id': ec2.vpc_id,
                'subnet_id': ec2.subnet_id,
                'security_groups': ec2.security_groups,
                'private_ip': ec2.private_ip,
                'public_ip': ec2.public_ip
            }
            for ec2 in ec2_instances
        ],
        'vpcs': [
            {
                'vpc_id': vpc.vpc_id,
                'name': vpc.name if vpc.name else vpc.vpc_id,  # name이 비어있으면 ID 사용
                'cidr_block': vpc.cidr_block,
                'subnets': [
                    {
                        'subnet_id': subnet.subnet_id,
                        'name': subnet.name if subnet.name else subnet.subnet_id,  # name이 비어있으면 ID 사용
                        'cidr_block': subnet.cidr_block,
                        'availability_zone': subnet.availability_zone
                    }
                    for subnet in vpc.subnets
                ]
            }
            for vpc in vpcs
        ],
        'security_groups': [
            {
                'group_id': sg.group_id,
                'name': sg.name if sg.name else sg.group_id,  # name이 비어있으면 group_id 사용
                'vpc_id': sg.vpc_id,
                'description': sg.description,
                'inbound_rules': [
                    {
                        'protocol': rule.protocol,
                        'from_port': rule.from_port,
                        'to_port': rule.to_port,
                        'target': rule.target
                    }
                    for rule in sg.inbound_rules
                ],
                'outbound_rules': [
                    {
                        'protocol': rule.protocol,
                        'from_port': rule.from_port,
                        'to_port': rule.to_port,
                        'target': rule.target
                    }
                    for rule in sg.outbound_rules
                ]
            }
            for sg in security_groups
        ]
    }


@mock_aws
def test_phase1_to_phase2_simple_vpc(aws_credentials, mock_credentials):
    """
    시나리오: 단순 VPC 환경 (Phase 1 → Phase 2)
    
    Given: VPC 1개, Subnet 1개, EC2 1개가 존재
    When: Phase 1에서 리소스 조회 후 Phase 2에서 그래프 생성
    Then: 노드, 엣지, 그룹이 올바르게 생성됨
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # === Phase 1: AWS 리소스 생성 ===
    
    # VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    ec2_client.create_tags(Resources=[vpc_id], Tags=[{'Key': 'Name', 'Value': 'test-vpc'}])
    
    # Subnet 생성
    subnet_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.1.0/24',
        AvailabilityZone='ap-northeast-2a'
    )
    subnet_id = subnet_response['Subnet']['SubnetId']
    ec2_client.create_tags(Resources=[subnet_id], Tags=[{'Key': 'Name', 'Value': 'test-subnet'}])
    
    # SecurityGroup 생성
    sg_response = ec2_client.create_security_group(
        GroupName='test-sg',
        Description='Test security group',
        VpcId=vpc_id
    )
    sg_id = sg_response['GroupId']
    
    # EC2 인스턴스 생성
    instance_response = ec2_client.run_instances(
        ImageId='ami-12345678',
        MinCount=1,
        MaxCount=1,
        InstanceType='t2.micro',
        SubnetId=subnet_id,
        SecurityGroupIds=[sg_id],
        TagSpecifications=[
            {'ResourceType': 'instance', 'Tags': [{'Key': 'Name', 'Value': 'test-instance'}]}
        ]
    )
    instance_id = instance_response['Instances'][0]['InstanceId']
    
    # === Phase 1: 리소스 조회 ===
    
    ec2_fetcher = EC2Fetcher()
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    ec2_instances = ec2_fetcher.fetch(mock_credentials, region)
    vpcs = vpc_fetcher.fetch(mock_credentials, region)
    security_groups = sg_fetcher.fetch(mock_credentials, region)
    
    # Phase 1 결과를 JSON으로 변환
    phase1_json = phase1_to_json(ec2_instances, vpcs, security_groups)
    
    # === Phase 2: 그래프 생성 ===
    
    builder = GraphBuilder()
    graph = builder.build(phase1_json)
    
    # === 검증 ===
    
    # 노드 검증
    assert len(graph.nodes) >= 4, "Should have at least VPC, Subnet, EC2, SG nodes"
    assert instance_id in graph.nodes, "EC2 instance should be a node"
    assert vpc_id in graph.nodes, "VPC should be a node"
    assert subnet_id in graph.nodes, "Subnet should be a node"
    assert sg_id in graph.nodes, "SecurityGroup should be a node"
    
    # EC2 노드 상세 검증
    ec2_node = graph.nodes[instance_id]
    assert ec2_node.type == 'ec2'
    assert ec2_node.name == 'test-instance'
    assert 'private_ip' in ec2_node.attributes
    
    # VPC 노드 상세 검증
    vpc_node = graph.nodes[vpc_id]
    assert vpc_node.type == 'vpc'
    assert vpc_node.name == 'test-vpc'
    assert vpc_node.attributes['cidr_block'] == '10.0.0.0/16'
    
    # 엣지 검증
    assert len(graph.edges) >= 3, "Should have VPC-EC2, Subnet-EC2, EC2-SG edges"
    
    # VPC-EC2 엣지 확인 (contains)
    vpc_ec2_edges = [e for e in graph.edges if e.source == vpc_id and e.target == instance_id]
    assert len(vpc_ec2_edges) == 1, "Should have VPC-EC2 edge"
    assert vpc_ec2_edges[0].edge_type == 'contains'
    
    # Subnet-EC2 엣지 확인 (hosts)
    subnet_ec2_edges = [e for e in graph.edges if e.source == subnet_id and e.target == instance_id]
    assert len(subnet_ec2_edges) == 1, "Should have Subnet-EC2 edge"
    assert subnet_ec2_edges[0].edge_type == 'hosts'
    
    # EC2-SG 엣지 확인 (uses)
    ec2_sg_edges = [e for e in graph.edges if e.source == instance_id and e.target == sg_id]
    assert len(ec2_sg_edges) == 1, "Should have EC2-SG edge"
    assert ec2_sg_edges[0].edge_type == 'uses'
    
    # 그룹 검증
    assert len(graph.groups) >= 1, "Should have at least 1 VPC group"
    assert vpc_id in graph.groups, "VPC group should exist"
    
    vpc_group = graph.groups[vpc_id]
    assert vpc_group.type == 'vpc'
    assert vpc_group.name == 'test-vpc'
    assert subnet_id in vpc_group.members, "Subnet should be in VPC group"
    assert instance_id in vpc_group.members, "EC2 should be in VPC group"


@mock_aws
def test_phase1_to_phase2_with_sg_rules(aws_credentials, mock_credentials):
    """
    시나리오: SecurityGroup 규칙이 있는 환경 (Phase 1 → Phase 2)
    
    Given: 2개의 SecurityGroup이 서로를 참조하는 규칙을 가짐
    When: Phase 1에서 리소스 조회 후 Phase 2에서 그래프 생성
    Then: SecurityGroup 간 트래픽 허용 엣지가 생성됨
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # === Phase 1: AWS 리소스 생성 ===
    
    # VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    ec2_client.create_tags(Resources=[vpc_id], Tags=[{'Key': 'Name', 'Value': 'test-vpc'}])
    
    # SecurityGroup 2개 생성
    web_sg_response = ec2_client.create_security_group(
        GroupName='web-sg',
        Description='Web server security group',
        VpcId=vpc_id
    )
    web_sg_id = web_sg_response['GroupId']
    
    db_sg_response = ec2_client.create_security_group(
        GroupName='db-sg',
        Description='Database security group',
        VpcId=vpc_id
    )
    db_sg_id = db_sg_response['GroupId']
    
    # DB SG에 Web SG로부터의 인바운드 규칙 추가
    ec2_client.authorize_security_group_ingress(
        GroupId=db_sg_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 3306,
                'ToPort': 3306,
                'UserIdGroupPairs': [{'GroupId': web_sg_id}]
            }
        ]
    )
    
    # === Phase 1: 리소스 조회 ===
    
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    vpcs = vpc_fetcher.fetch(mock_credentials, region)
    security_groups = sg_fetcher.fetch(mock_credentials, region)
    
    # Phase 1 결과를 JSON으로 변환
    phase1_json = phase1_to_json([], vpcs, security_groups)
    
    # === Phase 2: 그래프 생성 ===
    
    builder = GraphBuilder()
    graph = builder.build(phase1_json)
    
    # === 검증 ===
    
    # 노드 검증
    assert web_sg_id in graph.nodes, "Web SG should be a node"
    assert db_sg_id in graph.nodes, "DB SG should be a node"
    
    # 트래픽 허용 엣지 확인 (web-sg -> db-sg)
    traffic_edges = [
        e for e in graph.edges
        if e.source == web_sg_id and e.target == db_sg_id and e.edge_type == 'allows_traffic'
    ]
    assert len(traffic_edges) == 1, "Should have traffic edge from web-sg to db-sg"
    
    # 엣지 속성 검증
    traffic_edge = traffic_edges[0]
    assert traffic_edge.attributes['protocol'] == 'tcp'
    assert traffic_edge.attributes['from_port'] == 3306
    assert traffic_edge.attributes['to_port'] == 3306
    assert traffic_edge.attributes['direction'] == 'inbound'


@mock_aws
def test_phase1_to_phase2_full_infrastructure(aws_credentials, mock_credentials):
    """
    시나리오: 완전한 인프라 환경 (Phase 1 → Phase 2)
    
    Given: VPC, Subnet, SecurityGroup, EC2가 모두 존재하고 복잡한 관계를 가짐
    When: Phase 1에서 리소스 조회 후 Phase 2에서 그래프 생성
    Then: 모든 노드, 엣지, 그룹이 올바르게 생성되고 JSON 직렬화 가능
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # === Phase 1: AWS 리소스 생성 ===
    
    # VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    ec2_client.create_tags(Resources=[vpc_id], Tags=[{'Key': 'Name', 'Value': 'production-vpc'}])
    
    # Subnet 2개 생성
    public_subnet_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.1.0/24',
        AvailabilityZone='ap-northeast-2a'
    )
    public_subnet_id = public_subnet_response['Subnet']['SubnetId']
    ec2_client.create_tags(Resources=[public_subnet_id], Tags=[{'Key': 'Name', 'Value': 'public-subnet'}])
    
    private_subnet_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.2.0/24',
        AvailabilityZone='ap-northeast-2b'
    )
    private_subnet_id = private_subnet_response['Subnet']['SubnetId']
    ec2_client.create_tags(Resources=[private_subnet_id], Tags=[{'Key': 'Name', 'Value': 'private-subnet'}])
    
    # SecurityGroup 2개 생성
    web_sg_response = ec2_client.create_security_group(
        GroupName='web-sg',
        Description='Web server security group',
        VpcId=vpc_id
    )
    web_sg_id = web_sg_response['GroupId']
    
    # Web SG 인바운드 규칙
    ec2_client.authorize_security_group_ingress(
        GroupId=web_sg_id,
        IpPermissions=[
            {'IpProtocol': 'tcp', 'FromPort': 80, 'ToPort': 80, 'IpRanges': [{'CidrIp': '0.0.0.0/0'}]},
            {'IpProtocol': 'tcp', 'FromPort': 443, 'ToPort': 443, 'IpRanges': [{'CidrIp': '0.0.0.0/0'}]}
        ]
    )
    
    db_sg_response = ec2_client.create_security_group(
        GroupName='db-sg',
        Description='Database security group',
        VpcId=vpc_id
    )
    db_sg_id = db_sg_response['GroupId']
    
    # DB SG 인바운드 규칙 (Web SG로부터만 허용)
    ec2_client.authorize_security_group_ingress(
        GroupId=db_sg_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 3306,
                'ToPort': 3306,
                'UserIdGroupPairs': [{'GroupId': web_sg_id}]
            }
        ]
    )
    
    # EC2 인스턴스 2개 생성
    web_instance_response = ec2_client.run_instances(
        ImageId='ami-12345678',
        MinCount=1,
        MaxCount=1,
        InstanceType='t2.micro',
        SubnetId=public_subnet_id,
        SecurityGroupIds=[web_sg_id],
        TagSpecifications=[
            {'ResourceType': 'instance', 'Tags': [{'Key': 'Name', 'Value': 'web-server'}]}
        ]
    )
    web_instance_id = web_instance_response['Instances'][0]['InstanceId']
    
    db_instance_response = ec2_client.run_instances(
        ImageId='ami-87654321',
        MinCount=1,
        MaxCount=1,
        InstanceType='t2.small',
        SubnetId=private_subnet_id,
        SecurityGroupIds=[db_sg_id],
        TagSpecifications=[
            {'ResourceType': 'instance', 'Tags': [{'Key': 'Name', 'Value': 'db-server'}]}
        ]
    )
    db_instance_id = db_instance_response['Instances'][0]['InstanceId']
    
    # === Phase 1: 리소스 조회 ===
    
    ec2_fetcher = EC2Fetcher()
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    ec2_instances = ec2_fetcher.fetch(mock_credentials, region)
    vpcs = vpc_fetcher.fetch(mock_credentials, region)
    security_groups = sg_fetcher.fetch(mock_credentials, region)
    
    # Phase 1 결과를 JSON으로 변환
    phase1_json = phase1_to_json(ec2_instances, vpcs, security_groups)
    
    # === Phase 2: 그래프 생성 ===
    
    builder = GraphBuilder()
    graph = builder.build(phase1_json)
    
    # === 검증 ===
    
    # 노드 개수 검증 (VPC 1 + Subnet 2 + EC2 2 + SG 2 + default SG 1 = 최소 8개)
    assert len(graph.nodes) >= 7, f"Should have at least 7 nodes, got {len(graph.nodes)}"
    
    # 주요 노드 존재 확인
    assert vpc_id in graph.nodes
    assert public_subnet_id in graph.nodes
    assert private_subnet_id in graph.nodes
    assert web_instance_id in graph.nodes
    assert db_instance_id in graph.nodes
    assert web_sg_id in graph.nodes
    assert db_sg_id in graph.nodes
    
    # 엣지 검증
    # - VPC-EC2: 2개
    # - Subnet-EC2: 2개
    # - EC2-SG: 2개
    # - SG-SG traffic: 1개
    # = 최소 7개
    assert len(graph.edges) >= 7, f"Should have at least 7 edges, got {len(graph.edges)}"
    
    # VPC 그룹 검증
    assert vpc_id in graph.groups
    vpc_group = graph.groups[vpc_id]
    assert vpc_group.name == 'production-vpc'
    assert public_subnet_id in vpc_group.members
    assert private_subnet_id in vpc_group.members
    assert web_instance_id in vpc_group.members
    assert db_instance_id in vpc_group.members
    
    # === JSON 직렬화/역직렬화 테스트 ===
    
    # 그래프를 JSON으로 직렬화
    graph_json = graph.to_dict()
    
    # JSON 구조 검증
    assert 'metadata' in graph_json
    assert 'nodes' in graph_json
    assert 'edges' in graph_json
    assert 'groups' in graph_json
    
    # 메타데이터 검증
    assert graph_json['metadata']['node_count'] == len(graph.nodes)
    assert graph_json['metadata']['edge_count'] == len(graph.edges)
    assert graph_json['metadata']['group_count'] == len(graph.groups)
    
    # JSON에서 그래프 복원
    from resource_graph_builder.graph import ResourceGraph
    restored_graph = ResourceGraph.from_dict(graph_json)
    
    # 복원된 그래프 검증
    assert len(restored_graph.nodes) == len(graph.nodes)
    assert len(restored_graph.edges) == len(graph.edges)
    assert len(restored_graph.groups) == len(graph.groups)
    
    # 노드 내용 검증
    assert web_instance_id in restored_graph.nodes
    restored_web_node = restored_graph.nodes[web_instance_id]
    assert restored_web_node.name == 'web-server'
    assert restored_web_node.type == 'ec2'


@mock_aws
def test_phase1_to_phase2_empty_account(aws_credentials, mock_credentials):
    """
    시나리오: 빈 계정 (Phase 1 → Phase 2)
    
    Given: AWS 계정에 사용자 생성 리소스가 없음 (default VPC만 존재)
    When: Phase 1에서 리소스 조회 후 Phase 2에서 그래프 생성
    Then: default VPC와 default SG만 그래프에 포함됨
    """
    region = 'ap-northeast-2'
    
    # === Phase 1: 리소스 조회 (빈 계정) ===
    
    ec2_fetcher = EC2Fetcher()
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    ec2_instances = ec2_fetcher.fetch(mock_credentials, region)
    vpcs = vpc_fetcher.fetch(mock_credentials, region)
    security_groups = sg_fetcher.fetch(mock_credentials, region)
    
    # Phase 1 결과를 JSON으로 변환
    phase1_json = phase1_to_json(ec2_instances, vpcs, security_groups)
    
    # === Phase 2: 그래프 생성 ===
    
    builder = GraphBuilder()
    graph = builder.build(phase1_json)
    
    # === 검증 ===
    
    # EC2 인스턴스는 없어야 함
    ec2_nodes = [node for node in graph.nodes.values() if node.type == 'ec2']
    assert len(ec2_nodes) == 0, "Should have no EC2 instances"
    
    # default VPC는 존재
    vpc_nodes = [node for node in graph.nodes.values() if node.type == 'vpc']
    assert len(vpc_nodes) >= 1, "Should have at least default VPC"
    
    # default SG는 존재
    sg_nodes = [node for node in graph.nodes.values() if node.type == 'security_group']
    assert len(sg_nodes) >= 1, "Should have at least default security group"
    
    # 그래프 JSON 직렬화 가능 확인
    graph_json = graph.to_dict()
    assert 'metadata' in graph_json
    assert 'nodes' in graph_json
    assert 'edges' in graph_json
    assert 'groups' in graph_json
