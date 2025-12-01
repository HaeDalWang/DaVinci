"""SecurityGroupFetcher 테스트"""
import pytest
from datetime import datetime
from moto import mock_aws
import boto3

from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher
from aws_resource_fetcher.models import AWSCredentials
from aws_resource_fetcher.exceptions import ResourceFetchError, PermissionError


@pytest.fixture
def credentials() -> AWSCredentials:
    """테스트용 자격증명"""
    return AWSCredentials(
        access_key='test_access_key',
        secret_key='test_secret_key',
        session_token='test_session_token',
        expiration=datetime.now()
    )


@mock_aws
def test_fetch_security_groups_success(credentials: AWSCredentials) -> None:
    """보안그룹 조회 성공 테스트"""
    # EC2 클라이언트로 테스트 데이터 생성
    ec2 = boto3.client('ec2', region_name='ap-northeast-2')
    
    # VPC 생성
    vpc_response = ec2.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    
    # 보안그룹 생성
    sg_response = ec2.create_security_group(
        GroupName='test-sg',
        Description='Test security group',
        VpcId=vpc_id
    )
    sg_id = sg_response['GroupId']
    
    # 인바운드 규칙 추가
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 80,
                'ToPort': 80,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            }
        ]
    )
    
    # SecurityGroupFetcher로 조회
    fetcher = SecurityGroupFetcher()
    security_groups = fetcher.fetch_security_groups(credentials, 'ap-northeast-2')
    
    # 검증
    assert len(security_groups) >= 1  # default + test-sg
    
    # test-sg 찾기
    test_sg = next((sg for sg in security_groups if sg.name == 'test-sg'), None)
    assert test_sg is not None
    assert test_sg.group_id == sg_id
    assert test_sg.vpc_id == vpc_id
    assert test_sg.description == 'Test security group'
    assert len(test_sg.inbound_rules) >= 1
    
    # 인바운드 규칙 검증
    http_rule = next((rule for rule in test_sg.inbound_rules 
                      if rule.protocol == 'tcp' and rule.from_port == 80), None)
    assert http_rule is not None
    assert http_rule.to_port == 80
    assert http_rule.target == '0.0.0.0/0'


@mock_aws
def test_fetch_security_groups_empty(credentials: AWSCredentials) -> None:
    """보안그룹이 없을 때 빈 리스트 반환 테스트"""
    # moto는 기본 보안그룹을 생성하므로, 실제로는 빈 리스트가 아닐 수 있음
    fetcher = SecurityGroupFetcher()
    security_groups = fetcher.fetch_security_groups(credentials, 'ap-northeast-2')
    
    # 최소한 빈 리스트가 아니라 리스트 타입이어야 함
    assert isinstance(security_groups, list)


@mock_aws
def test_fetch_security_groups_with_multiple_rules(credentials: AWSCredentials) -> None:
    """여러 규칙을 가진 보안그룹 조회 테스트"""
    ec2 = boto3.client('ec2', region_name='ap-northeast-2')
    
    # VPC 생성
    vpc_response = ec2.create_vpc(CidrBlock='10.0.0.0/16')
    vpc_id = vpc_response['Vpc']['VpcId']
    
    # 보안그룹 생성
    sg_response = ec2.create_security_group(
        GroupName='multi-rule-sg',
        Description='Security group with multiple rules',
        VpcId=vpc_id
    )
    sg_id = sg_response['GroupId']
    
    # 여러 인바운드 규칙 추가
    ec2.authorize_security_group_ingress(
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
            },
            {
                'IpProtocol': 'tcp',
                'FromPort': 22,
                'ToPort': 22,
                'IpRanges': [{'CidrIp': '10.0.0.0/16'}]
            }
        ]
    )
    
    # SecurityGroupFetcher로 조회
    fetcher = SecurityGroupFetcher()
    security_groups = fetcher.fetch_security_groups(credentials, 'ap-northeast-2')
    
    # test-sg 찾기
    test_sg = next((sg for sg in security_groups if sg.name == 'multi-rule-sg'), None)
    assert test_sg is not None
    assert len(test_sg.inbound_rules) >= 3
    
    # 각 규칙 검증
    protocols_ports = [(rule.protocol, rule.from_port, rule.to_port) 
                       for rule in test_sg.inbound_rules]
    assert ('tcp', 80, 80) in protocols_ports
    assert ('tcp', 443, 443) in protocols_ports
    assert ('tcp', 22, 22) in protocols_ports
