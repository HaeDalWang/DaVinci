"""ResourceFetcher 통합 테스트"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime

from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.models import AWSCredentials, EC2Instance, VPC, SecurityGroup
from aws_resource_fetcher.exceptions import ResourceFetchError


@pytest.fixture
def mock_credentials() -> AWSCredentials:
    """테스트용 자격증명"""
    return AWSCredentials(
        access_key="test_access_key",
        secret_key="test_secret_key",
        session_token="test_session_token",
        expiration=datetime.now()
    )


@pytest.fixture
def resource_fetcher() -> ResourceFetcher:
    """ResourceFetcher 인스턴스"""
    return ResourceFetcher()


def test_fetch_all_resources_success(resource_fetcher: ResourceFetcher, mock_credentials: AWSCredentials) -> None:
    """모든 리소스 조회 성공 테스트"""
    # Mock 설정
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=[]):
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=[]):
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=[]):
                    # 실행
                    result = resource_fetcher.fetch_all_resources(
                        account_id="123456789012",
                        role_name="test-role"
                    )
                    
                    # 검증
                    assert result['account_id'] == "123456789012"
                    assert result['region'] == 'ap-northeast-2'
                    assert 'timestamp' in result
                    assert result['ec2_instances'] == []
                    assert result['vpcs'] == []
                    assert result['security_groups'] == []


def test_fetch_all_resources_partial_failure(resource_fetcher: ResourceFetcher, mock_credentials: AWSCredentials) -> None:
    """부분 실패 시 나머지 리소스 조회 계속 진행 테스트"""
    # Mock 설정 - EC2 fetcher는 실패, 나머지는 성공
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', side_effect=ResourceFetchError('EC2', Exception("Test error"))):
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=[]):
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=[]):
                    # 실행
                    result = resource_fetcher.fetch_all_resources(
                        account_id="123456789012",
                        role_name="test-role"
                    )
                    
                    # 검증 - EC2는 빈 리스트, 나머지는 정상 조회
                    assert result['account_id'] == "123456789012"
                    assert result['ec2_instances'] == []  # 실패했지만 빈 리스트 반환
                    assert result['vpcs'] == []
                    assert result['security_groups'] == []


def test_fetch_all_resources_with_data(resource_fetcher: ResourceFetcher, mock_credentials: AWSCredentials) -> None:
    """실제 데이터가 있는 경우 테스트"""
    # 테스트 데이터 생성
    test_ec2 = EC2Instance(
        instance_id="i-1234567890abcdef0",
        name="test-instance",
        state="running",
        vpc_id="vpc-12345678",
        subnet_id="subnet-12345678",
        security_groups=["sg-12345678"],
        private_ip="10.0.1.10",
        public_ip="54.123.45.67"
    )
    
    # Mock 설정
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=[test_ec2]):
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=[]):
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=[]):
                    # 실행
                    result = resource_fetcher.fetch_all_resources(
                        account_id="123456789012",
                        role_name="test-role"
                    )
                    
                    # 검증
                    assert len(result['ec2_instances']) == 1
                    assert result['ec2_instances'][0]['instance_id'] == "i-1234567890abcdef0"
                    assert result['ec2_instances'][0]['name'] == "test-instance"
                    assert result['ec2_instances'][0]['state'] == "running"
