"""VPCFetcher 테스트"""
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.models import AWSCredentials
from aws_resource_fetcher.exceptions import ResourceFetchError, PermissionError


@pytest.fixture
def credentials() -> AWSCredentials:
    """테스트용 AWS 자격증명"""
    return AWSCredentials(
        access_key="test_access_key",
        secret_key="test_secret_key",
        session_token="test_session_token",
        expiration=datetime.now(timezone.utc)
    )


@pytest.fixture
def vpc_fetcher() -> VPCFetcher:
    """VPCFetcher 인스턴스"""
    return VPCFetcher()


def test_fetch_vpcs_success(vpc_fetcher: VPCFetcher, credentials: AWSCredentials) -> None:
    """VPC 조회 성공 테스트"""
    # Mock EC2 클라이언트 설정
    mock_client = Mock()
    
    # VPC 페이지네이터 mock
    vpc_paginator = Mock()
    vpc_paginator.paginate.return_value = [
        {
            'Vpcs': [
                {
                    'VpcId': 'vpc-123',
                    'CidrBlock': '10.0.0.0/16',
                    'Tags': [{'Key': 'Name', 'Value': 'Test VPC'}]
                }
            ]
        }
    ]
    
    # 서브넷 페이지네이터 mock
    subnet_paginator = Mock()
    subnet_paginator.paginate.return_value = [
        {
            'Subnets': [
                {
                    'SubnetId': 'subnet-123',
                    'CidrBlock': '10.0.1.0/24',
                    'AvailabilityZone': 'ap-northeast-2a',
                    'Tags': [{'Key': 'Name', 'Value': 'Test Subnet'}]
                }
            ]
        }
    ]
    
    mock_client.get_paginator.side_effect = lambda x: (
        vpc_paginator if x == 'describe_vpcs' else subnet_paginator
    )
    
    with patch.object(vpc_fetcher, '_create_client', return_value=mock_client):
        vpcs = vpc_fetcher.fetch_vpcs(credentials)
    
    assert len(vpcs) == 1
    assert vpcs[0].vpc_id == 'vpc-123'
    assert vpcs[0].name == 'Test VPC'
    assert vpcs[0].cidr_block == '10.0.0.0/16'
    assert len(vpcs[0].subnets) == 1
    assert vpcs[0].subnets[0].subnet_id == 'subnet-123'


def test_fetch_vpcs_empty(vpc_fetcher: VPCFetcher, credentials: AWSCredentials) -> None:
    """VPC가 없는 경우 테스트"""
    mock_client = Mock()
    
    vpc_paginator = Mock()
    vpc_paginator.paginate.return_value = [{'Vpcs': []}]
    
    mock_client.get_paginator.return_value = vpc_paginator
    
    with patch.object(vpc_fetcher, '_create_client', return_value=mock_client):
        vpcs = vpc_fetcher.fetch_vpcs(credentials)
    
    assert vpcs == []


def test_fetch_vpcs_permission_error(vpc_fetcher: VPCFetcher, credentials: AWSCredentials) -> None:
    """권한 부족 에러 테스트"""
    mock_client = Mock()
    
    error_response = {
        'Error': {
            'Code': 'UnauthorizedOperation',
            'Message': 'You are not authorized to perform this operation.'
        }
    }
    
    vpc_paginator = Mock()
    vpc_paginator.paginate.side_effect = ClientError(error_response, 'DescribeVpcs')
    
    mock_client.get_paginator.return_value = vpc_paginator
    
    with patch.object(vpc_fetcher, '_create_client', return_value=mock_client):
        with pytest.raises(PermissionError) as exc_info:
            vpc_fetcher.fetch_vpcs(credentials)
        
        assert 'fetch VPC' in str(exc_info.value)


def test_fetch_vpcs_client_error(vpc_fetcher: VPCFetcher, credentials: AWSCredentials) -> None:
    """일반 ClientError 테스트"""
    mock_client = Mock()
    
    error_response = {
        'Error': {
            'Code': 'InternalError',
            'Message': 'An internal error occurred.'
        }
    }
    
    vpc_paginator = Mock()
    vpc_paginator.paginate.side_effect = ClientError(error_response, 'DescribeVpcs')
    
    mock_client.get_paginator.return_value = vpc_paginator
    
    with patch.object(vpc_fetcher, '_create_client', return_value=mock_client):
        with pytest.raises(ResourceFetchError) as exc_info:
            vpc_fetcher.fetch_vpcs(credentials)
        
        assert exc_info.value.resource_type == 'VPC'
