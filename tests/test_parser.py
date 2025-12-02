"""
ResourceParser 테스트
"""

import pytest
from resource_graph_builder.parser import ResourceParser, ParsedResources
from resource_graph_builder.exceptions import ParseError


def test_parse_valid_data():
    """유효한 데이터 파싱 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [
            {
                'instance_id': 'i-123',
                'name': 'web-server',
                'state': 'running',
                'vpc_id': 'vpc-123',
                'subnet_id': 'subnet-123',
                'security_groups': ['sg-123'],
                'private_ip': '10.0.1.10',
                'public_ip': '54.1.1.1'
            }
        ],
        'vpcs': [
            {
                'vpc_id': 'vpc-123',
                'name': 'main-vpc',
                'cidr_block': '10.0.0.0/16',
                'subnets': [
                    {
                        'subnet_id': 'subnet-123',
                        'name': 'public-subnet',
                        'cidr_block': '10.0.1.0/24',
                        'availability_zone': 'ap-northeast-2a'
                    }
                ]
            }
        ],
        'security_groups': [
            {
                'group_id': 'sg-123',
                'name': 'web-sg',
                'vpc_id': 'vpc-123',
                'description': 'Web server security group',
                'inbound_rules': [
                    {
                        'protocol': 'tcp',
                        'from_port': 80,
                        'to_port': 80,
                        'target': '0.0.0.0/0'
                    }
                ],
                'outbound_rules': []
            }
        ]
    }
    
    result = parser.parse(json_data)
    
    assert isinstance(result, ParsedResources)
    assert len(result.ec2_instances) == 1
    assert len(result.vpcs) == 1
    assert len(result.subnets) == 1
    assert len(result.security_groups) == 1
    
    # Subnet에 vpc_id가 추가되었는지 확인
    assert result.subnets[0]['vpc_id'] == 'vpc-123'


def test_parse_missing_top_level_field():
    """최상위 필수 필드 누락 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [],
        'vpcs': []
        # security_groups 누락
    }
    
    with pytest.raises(ParseError) as exc_info:
        parser.parse(json_data)
    
    assert 'security_groups' in str(exc_info.value)


def test_parse_invalid_top_level_type():
    """최상위 필드 타입 불일치 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': 'not a list',  # list여야 함
        'vpcs': [],
        'security_groups': []
    }
    
    with pytest.raises(ParseError) as exc_info:
        parser.parse(json_data)
    
    assert 'ec2_instances' in str(exc_info.value)


def test_parse_ec2_missing_required_field():
    """EC2 필수 필드 누락 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [
            {
                'instance_id': 'i-123',
                'name': 'web-server'
                # 나머지 필수 필드 누락
            }
        ],
        'vpcs': [],
        'security_groups': []
    }
    
    with pytest.raises(ParseError) as exc_info:
        parser.parse(json_data)
    
    error_msg = str(exc_info.value)
    assert 'ec2_instances[0]' in error_msg


def test_parse_vpc_missing_required_field():
    """VPC 필수 필드 누락 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [],
        'vpcs': [
            {
                'vpc_id': 'vpc-123',
                'name': 'main-vpc'
                # cidr_block, subnets 누락
            }
        ],
        'security_groups': []
    }
    
    with pytest.raises(ParseError) as exc_info:
        parser.parse(json_data)
    
    error_msg = str(exc_info.value)
    assert 'vpcs[0]' in error_msg


def test_parse_sg_missing_required_field():
    """SecurityGroup 필수 필드 누락 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [],
        'vpcs': [],
        'security_groups': [
            {
                'group_id': 'sg-123',
                'name': 'web-sg'
                # 나머지 필수 필드 누락
            }
        ]
    }
    
    with pytest.raises(ParseError) as exc_info:
        parser.parse(json_data)
    
    error_msg = str(exc_info.value)
    assert 'security_groups[0]' in error_msg


def test_parse_empty_data():
    """빈 데이터 파싱 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [],
        'vpcs': [],
        'security_groups': []
    }
    
    result = parser.parse(json_data)
    
    assert len(result.ec2_instances) == 0
    assert len(result.vpcs) == 0
    assert len(result.subnets) == 0
    assert len(result.security_groups) == 0


def test_parse_ec2_without_public_ip():
    """public_ip가 없는 EC2 파싱 테스트"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [
            {
                'instance_id': 'i-123',
                'name': 'private-server',
                'state': 'running',
                'vpc_id': 'vpc-123',
                'subnet_id': 'subnet-123',
                'security_groups': ['sg-123'],
                'private_ip': '10.0.1.10',
                'public_ip': None
            }
        ],
        'vpcs': [],
        'security_groups': []
    }
    
    result = parser.parse(json_data)
    
    assert len(result.ec2_instances) == 1
    assert result.ec2_instances[0]['public_ip'] is None


def test_parse_sg_rule_without_ports():
    """포트 정보가 없는 SG 규칙 파싱 테스트 (protocol -1)"""
    parser = ResourceParser()
    
    json_data = {
        'ec2_instances': [],
        'vpcs': [],
        'security_groups': [
            {
                'group_id': 'sg-123',
                'name': 'all-traffic-sg',
                'vpc_id': 'vpc-123',
                'description': 'Allow all traffic',
                'inbound_rules': [
                    {
                        'protocol': '-1',
                        'from_port': None,
                        'to_port': None,
                        'target': 'sg-456'
                    }
                ],
                'outbound_rules': []
            }
        ]
    }
    
    result = parser.parse(json_data)
    
    assert len(result.security_groups) == 1
    assert result.security_groups[0]['inbound_rules'][0]['protocol'] == '-1'
