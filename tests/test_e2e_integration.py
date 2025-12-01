"""엔드투엔드 통합 테스트 - moto를 사용한 전체 플로우 시뮬레이션"""
import pytest
from moto import mock_aws
import boto3
from datetime import datetime

from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher
from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher


@pytest.fixture
def aws_credentials():
    """AWS 자격증명 환경 변수 설정"""
    import os
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = 'ap-northeast-2'


@mock_aws
def test_e2e_fetch_empty_account(aws_credentials):
    """
    시나리오: 리소스가 없는 빈 AWS 계정 조회
    
    Given: AWS 계정에 사용자가 생성한 리소스가 없음 (default VPC는 존재)
    When: 전체 리소스 조회를 요청
    Then: EC2 인스턴스는 없고, default VPC와 default 보안그룹만 존재
    """
    # AWS 클라이언트 생성 (moto가 자동으로 모킹)
    region = 'ap-northeast-2'
    
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # Fetcher 인스턴스 생성
    ec2_fetcher = EC2Fetcher()
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    # 리소스 조회
    ec2_instances = ec2_fetcher.fetch(credentials, region)
    vpcs = vpc_fetcher.fetch(credentials, region)
    security_groups = sg_fetcher.fetch(credentials, region)
    
    # 검증: EC2 인스턴스는 없어야 함
    assert ec2_instances == [], "Empty account should have no EC2 instances"
    
    # 검증: default VPC가 존재 (moto가 자동 생성)
    assert len(vpcs) >= 1, "Should have at least default VPC"
    default_vpc = next((vpc for vpc in vpcs if vpc.cidr_block == '172.31.0.0/16'), None)
    assert default_vpc is not None, "Default VPC should exist"
    
    # 검증: default 보안그룹이 존재
    assert len(security_groups) >= 1, "Should have at least default security group"


@mock_aws
def test_e2e_fetch_vpc_with_subnets(aws_credentials):
    """
    시나리오: VPC와 서브넷이 있는 계정 조회
    
    Given: AWS 계정에 VPC 1개와 서브넷 2개가 존재
    When: VPC 조회를 요청
    Then: VPC와 서브넷 정보가 올바르게 반환됨
    """
    region = 'ap-northeast-2'
    
    # VPC 생성
    ec2_client = boto3.client('ec2', region_name=region)
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    
    # VPC에 태그 추가
    ec2_client.create_tags(
        Resources=[vpc_id],
        Tags=[{'Key': 'Name', 'Value': 'test-vpc'}]
    )
    
    # 서브넷 생성
    subnet1_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.1.0/24',
        AvailabilityZone='ap-northeast-2a'
    )
    subnet1_id = subnet1_response['Subnet']['SubnetId']
    ec2_client.create_tags(
        Resources=[subnet1_id],
        Tags=[{'Key': 'Name', 'Value': 'test-subnet-1'}]
    )
    
    subnet2_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.2.0/24',
        AvailabilityZone='ap-northeast-2b'
    )
    subnet2_id = subnet2_response['Subnet']['SubnetId']
    ec2_client.create_tags(
        Resources=[subnet2_id],
        Tags=[{'Key': 'Name', 'Value': 'test-subnet-2'}]
    )
    
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # VPC 조회
    vpc_fetcher = VPCFetcher()
    vpcs = vpc_fetcher.fetch(credentials, region)
    
    # 검증: test-vpc 찾기 (default VPC도 있을 수 있음)
    test_vpc = next((vpc for vpc in vpcs if vpc.name == 'test-vpc'), None)
    assert test_vpc is not None, "test-vpc should exist"
    
    assert test_vpc.vpc_id == vpc_id, "VPC ID should match"
    assert test_vpc.name == 'test-vpc', "VPC name should match"
    assert test_vpc.cidr_block == '10.0.0.0/16', "VPC CIDR should match"
    assert len(test_vpc.subnets) == 2, "Should have 2 subnets"
    
    # 서브넷 검증
    subnet_names = {subnet.name for subnet in test_vpc.subnets}
    assert 'test-subnet-1' in subnet_names, "Subnet 1 should exist"
    assert 'test-subnet-2' in subnet_names, "Subnet 2 should exist"


@mock_aws
def test_e2e_fetch_ec2_instances(aws_credentials):
    """
    시나리오: EC2 인스턴스가 있는 계정 조회
    
    Given: AWS 계정에 VPC, 서브넷, 보안그룹, EC2 인스턴스가 존재
    When: EC2 조회를 요청
    Then: EC2 인스턴스 정보가 올바르게 반환됨
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    
    # 서브넷 생성
    subnet_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.1.0/24',
        AvailabilityZone='ap-northeast-2a'
    )
    subnet_id = subnet_response['Subnet']['SubnetId']
    
    # 보안그룹 생성
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
            {
                'ResourceType': 'instance',
                'Tags': [{'Key': 'Name', 'Value': 'test-instance'}]
            }
        ]
    )
    instance_id = instance_response['Instances'][0]['InstanceId']
    
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # EC2 조회
    ec2_fetcher = EC2Fetcher()
    instances = ec2_fetcher.fetch(credentials, region)
    
    # 검증
    assert len(instances) == 1, "Should have exactly 1 EC2 instance"
    
    instance = instances[0]
    assert instance.instance_id == instance_id, "Instance ID should match"
    assert instance.name == 'test-instance', "Instance name should match"
    assert instance.vpc_id == vpc_id, "VPC ID should match"
    assert instance.subnet_id == subnet_id, "Subnet ID should match"
    assert sg_id in instance.security_groups, "Security group should be attached"


@mock_aws
def test_e2e_fetch_security_groups(aws_credentials):
    """
    시나리오: 보안그룹이 있는 계정 조회
    
    Given: AWS 계정에 VPC와 보안그룹이 존재하고, 인바운드/아웃바운드 규칙이 설정됨
    When: 보안그룹 조회를 요청
    Then: 보안그룹과 규칙 정보가 올바르게 반환됨
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    
    # 보안그룹 생성
    sg_response = ec2_client.create_security_group(
        GroupName='test-sg',
        Description='Test security group',
        VpcId=vpc_id
    )
    sg_id = sg_response['GroupId']
    
    # 인바운드 규칙 추가
    ec2_client.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 80,
                'ToPort': 80,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            },
            {
                'IpProtocol': 'tcp',
                'FromPort': 443,
                'ToPort': 443,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            }
        ]
    )
    
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # 보안그룹 조회
    sg_fetcher = SecurityGroupFetcher()
    security_groups = sg_fetcher.fetch(credentials, region)
    
    # 검증 (default 보안그룹도 포함되므로 최소 1개 이상)
    assert len(security_groups) >= 1, "Should have at least 1 security group"
    
    # test-sg 찾기
    test_sg = None
    for sg in security_groups:
        if sg.group_id == sg_id:
            test_sg = sg
            break
    
    assert test_sg is not None, "test-sg should exist"
    assert test_sg.name == 'test-sg', "Security group name should match"
    assert test_sg.vpc_id == vpc_id, "VPC ID should match"
    assert len(test_sg.inbound_rules) >= 2, "Should have at least 2 inbound rules"
    
    # 인바운드 규칙 검증
    ports = {rule.from_port for rule in test_sg.inbound_rules if rule.from_port is not None}
    assert 80 in ports, "Should have rule for port 80"
    assert 443 in ports, "Should have rule for port 443"


@mock_aws
def test_e2e_full_infrastructure_scenario(aws_credentials):
    """
    시나리오: 완전한 인프라 환경 조회
    
    Given: AWS 계정에 VPC, 서브넷, 보안그룹, EC2 인스턴스가 모두 존재
    When: 전체 리소스 조회를 요청 (ResourceFetcher 사용)
    Then: 모든 리소스가 올바르게 조회되고 구조화된 데이터로 반환됨
    """
    region = 'ap-northeast-2'
    ec2_client = boto3.client('ec2', region_name=region)
    
    # 1. VPC 생성
    vpc_response = ec2_client.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    ec2_client.create_tags(
        Resources=[vpc_id],
        Tags=[{'Key': 'Name', 'Value': 'production-vpc'}]
    )
    
    # 2. 서브넷 생성 (2개)
    subnet1_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.1.0/24',
        AvailabilityZone='ap-northeast-2a'
    )
    subnet1_id = subnet1_response['Subnet']['SubnetId']
    ec2_client.create_tags(
        Resources=[subnet1_id],
        Tags=[{'Key': 'Name', 'Value': 'public-subnet-1'}]
    )
    
    subnet2_response = ec2_client.create_subnet(
        VpcId=vpc_id,
        CidrBlock='10.0.2.0/24',
        AvailabilityZone='ap-northeast-2b'
    )
    subnet2_id = subnet2_response['Subnet']['SubnetId']
    ec2_client.create_tags(
        Resources=[subnet2_id],
        Tags=[{'Key': 'Name', 'Value': 'private-subnet-1'}]
    )
    
    # 3. 보안그룹 생성 (2개)
    web_sg_response = ec2_client.create_security_group(
        GroupName='web-sg',
        Description='Web server security group',
        VpcId=vpc_id
    )
    web_sg_id = web_sg_response['GroupId']
    
    # 웹 서버 보안그룹에 규칙 추가
    ec2_client.authorize_security_group_ingress(
        GroupId=web_sg_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 80,
                'ToPort': 80,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            },
            {
                'IpProtocol': 'tcp',
                'FromPort': 443,
                'ToPort': 443,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            }
        ]
    )
    
    db_sg_response = ec2_client.create_security_group(
        GroupName='db-sg',
        Description='Database security group',
        VpcId=vpc_id
    )
    db_sg_id = db_sg_response['GroupId']
    
    # DB 보안그룹에 규칙 추가
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
    
    # 4. EC2 인스턴스 생성 (2개)
    web_instance_response = ec2_client.run_instances(
        ImageId='ami-12345678',
        MinCount=1,
        MaxCount=1,
        InstanceType='t2.micro',
        SubnetId=subnet1_id,
        SecurityGroupIds=[web_sg_id],
        TagSpecifications=[
            {
                'ResourceType': 'instance',
                'Tags': [{'Key': 'Name', 'Value': 'web-server'}]
            }
        ]
    )
    web_instance_id = web_instance_response['Instances'][0]['InstanceId']
    
    db_instance_response = ec2_client.run_instances(
        ImageId='ami-87654321',
        MinCount=1,
        MaxCount=1,
        InstanceType='t2.small',
        SubnetId=subnet2_id,
        SecurityGroupIds=[db_sg_id],
        TagSpecifications=[
            {
                'ResourceType': 'instance',
                'Tags': [{'Key': 'Name', 'Value': 'db-server'}]
            }
        ]
    )
    db_instance_id = db_instance_response['Instances'][0]['InstanceId']
    
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # 전체 리소스 조회
    ec2_fetcher = EC2Fetcher()
    vpc_fetcher = VPCFetcher()
    sg_fetcher = SecurityGroupFetcher()
    
    ec2_instances = ec2_fetcher.fetch(credentials, region)
    vpcs = vpc_fetcher.fetch(credentials, region)
    security_groups = sg_fetcher.fetch(credentials, region)
    
    # === 검증 ===
    
    # VPC 검증: production-vpc 찾기 (default VPC도 있을 수 있음)
    production_vpc = next((vpc for vpc in vpcs if vpc.name == 'production-vpc'), None)
    assert production_vpc is not None, "production-vpc should exist"
    assert production_vpc.vpc_id == vpc_id
    assert production_vpc.name == 'production-vpc'
    assert len(production_vpc.subnets) == 2, "Should have 2 subnets"
    
    # 서브넷 검증
    subnet_names = {subnet.name for subnet in production_vpc.subnets}
    assert 'public-subnet-1' in subnet_names
    assert 'private-subnet-1' in subnet_names
    
    # EC2 인스턴스 검증
    assert len(ec2_instances) == 2, "Should have exactly 2 EC2 instances"
    instance_names = {instance.name for instance in ec2_instances}
    assert 'web-server' in instance_names
    assert 'db-server' in instance_names
    
    # 웹 서버 인스턴스 상세 검증
    web_instance = next(i for i in ec2_instances if i.name == 'web-server')
    assert web_instance.vpc_id == vpc_id
    assert web_instance.subnet_id == subnet1_id
    assert web_sg_id in web_instance.security_groups
    
    # DB 서버 인스턴스 상세 검증
    db_instance = next(i for i in ec2_instances if i.name == 'db-server')
    assert db_instance.vpc_id == vpc_id
    assert db_instance.subnet_id == subnet2_id
    assert db_sg_id in db_instance.security_groups
    
    # 보안그룹 검증 (default 포함하여 최소 3개)
    assert len(security_groups) >= 3, "Should have at least 3 security groups"
    
    sg_names = {sg.name for sg in security_groups}
    assert 'web-sg' in sg_names
    assert 'db-sg' in sg_names
    
    # 웹 보안그룹 상세 검증
    web_sg = next(sg for sg in security_groups if sg.name == 'web-sg')
    assert len(web_sg.inbound_rules) >= 2, "Web SG should have at least 2 inbound rules"
    web_ports = {rule.from_port for rule in web_sg.inbound_rules if rule.from_port is not None}
    assert 80 in web_ports
    assert 443 in web_ports
    
    # DB 보안그룹 상세 검증
    db_sg = next(sg for sg in security_groups if sg.name == 'db-sg')
    assert len(db_sg.inbound_rules) >= 1, "DB SG should have at least 1 inbound rule"
    db_ports = {rule.from_port for rule in db_sg.inbound_rules if rule.from_port is not None}
    assert 3306 in db_ports


@mock_aws
def test_e2e_multi_region_scenario(aws_credentials):
    """
    시나리오: 다중 리전 환경 조회
    
    Given: 서울과 도쿄 리전에 각각 리소스가 존재
    When: 각 리전별로 리소스 조회를 요청
    Then: 각 리전의 리소스가 독립적으로 올바르게 조회됨
    """
    # Mock 자격증명 생성
    from aws_resource_fetcher.models import AWSCredentials
    credentials = AWSCredentials(
        access_key='testing',
        secret_key='testing',
        session_token='testing',
        expiration=datetime.now()
    )
    
    # === 서울 리전 설정 ===
    seoul_region = 'ap-northeast-2'
    seoul_ec2 = boto3.client('ec2', region_name=seoul_region)
    
    seoul_vpc_response = seoul_ec2.create_vpc(CidrBlock='10.0.0.0/16')
    seoul_vpc_id = seoul_vpc_response['Vpc']['VpcId']
    seoul_ec2.create_tags(
        Resources=[seoul_vpc_id],
        Tags=[{'Key': 'Name', 'Value': 'seoul-vpc'}]
    )
    
    # === 도쿄 리전 설정 ===
    tokyo_region = 'ap-northeast-1'
    tokyo_ec2 = boto3.client('ec2', region_name=tokyo_region)
    
    tokyo_vpc_response = tokyo_ec2.create_vpc(CidrBlock='10.1.0.0/16')
    tokyo_vpc_id = tokyo_vpc_response['Vpc']['VpcId']
    tokyo_ec2.create_tags(
        Resources=[tokyo_vpc_id],
        Tags=[{'Key': 'Name', 'Value': 'tokyo-vpc'}]
    )
    
    # === 서울 리전 조회 ===
    vpc_fetcher = VPCFetcher()
    seoul_vpcs = vpc_fetcher.fetch(credentials, seoul_region)
    
    # seoul-vpc 찾기 (default VPC도 있을 수 있음)
    seoul_vpc = next((vpc for vpc in seoul_vpcs if vpc.name == 'seoul-vpc'), None)
    assert seoul_vpc is not None, "seoul-vpc should exist"
    assert seoul_vpc.name == 'seoul-vpc'
    assert seoul_vpc.cidr_block == '10.0.0.0/16'
    
    # === 도쿄 리전 조회 ===
    tokyo_vpcs = vpc_fetcher.fetch(credentials, tokyo_region)
    
    # tokyo-vpc 찾기 (default VPC도 있을 수 있음)
    tokyo_vpc = next((vpc for vpc in tokyo_vpcs if vpc.name == 'tokyo-vpc'), None)
    assert tokyo_vpc is not None, "tokyo-vpc should exist"
    assert tokyo_vpc.name == 'tokyo-vpc'
    assert tokyo_vpc.cidr_block == '10.1.0.0/16'
    
    # 리전 간 독립성 검증
    assert seoul_vpc.vpc_id != tokyo_vpc.vpc_id, "VPC IDs should be different across regions"
