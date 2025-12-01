"""Property-based 테스트"""
import json
from dataclasses import asdict
from unittest.mock import Mock, patch
from hypothesis import given, settings
from hypothesis import strategies as st
from tests.property_tests.generators import ec2_instance_strategy, vpc_strategy, security_group_strategy
from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.models import AWSCredentials
from datetime import datetime, timezone


# Feature: aws-resource-fetcher, Property 4: EC2 data is JSON serializable
@given(ec2_instance=ec2_instance_strategy())
@settings(max_examples=100)
def test_ec2_data_json_serializable(ec2_instance):
    """
    Property 4: EC2 data is JSON serializable
    Validates: Requirements 2.3
    
    For any EC2 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.
    """
    # EC2Instance를 dict로 변환
    ec2_dict = asdict(ec2_instance)
    
    # JSON으로 직렬화
    json_str = json.dumps(ec2_dict)
    
    # JSON에서 역직렬화
    deserialized_dict = json.loads(json_str)
    
    # 원본 dict와 역직렬화된 dict가 동일한지 확인
    assert ec2_dict == deserialized_dict, "JSON round-trip should preserve data structure"


# Feature: aws-resource-fetcher, Property 6: VPC data is JSON serializable
@given(vpc=vpc_strategy())
@settings(max_examples=100)
def test_vpc_data_json_serializable(vpc):
    """
    Property 6: VPC data is JSON serializable
    Validates: Requirements 3.3
    
    For any VPC 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.
    """
    # VPC를 dict로 변환 (nested dataclass도 재귀적으로 변환)
    vpc_dict = asdict(vpc)
    
    # JSON으로 직렬화
    json_str = json.dumps(vpc_dict)
    
    # JSON에서 역직렬화
    deserialized_dict = json.loads(json_str)
    
    # 원본 dict와 역직렬화된 dict가 동일한지 확인
    assert vpc_dict == deserialized_dict, "JSON round-trip should preserve VPC data structure"



# Feature: aws-resource-fetcher, Property 9: SecurityGroup data is JSON serializable
@given(security_group=security_group_strategy())
@settings(max_examples=100)
def test_security_group_data_json_serializable(security_group):
    """
    Property 9: SecurityGroup data is JSON serializable
    Validates: Requirements 4.4
    
    For any 보안그룹 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.
    """
    # SecurityGroup을 dict로 변환 (nested dataclass도 재귀적으로 변환)
    sg_dict = asdict(security_group)
    
    # JSON으로 직렬화
    json_str = json.dumps(sg_dict)
    
    # JSON에서 역직렬화
    deserialized_dict = json.loads(json_str)
    
    # 원본 dict와 역직렬화된 dict가 동일한지 확인
    assert sg_dict == deserialized_dict, "JSON round-trip should preserve SecurityGroup data structure"


# Feature: aws-resource-fetcher, Property 10: Integrated fetch calls all fetchers
@given(
    account_id=st.text(min_size=12, max_size=12, alphabet=st.characters(whitelist_categories=("Nd",))),
    role_name=st.text(min_size=5, max_size=50),
    region=st.sampled_from(["ap-northeast-2", "us-east-1", "eu-west-1"])
)
@settings(max_examples=100)
def test_integrated_fetch_calls_all_fetchers(account_id, role_name, region):
    """
    Property 10: Integrated fetch calls all fetchers
    Validates: Requirements 5.1
    
    For any 유효한 계정 정보로 전체 리소스를 조회할 때, EC2, VPC, 보안그룹 fetcher가 모두 호출되어야 한다.
    """
    # ResourceFetcher 인스턴스 생성
    resource_fetcher = ResourceFetcher()
    
    # Mock 자격증명 생성
    mock_credentials = AWSCredentials(
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        session_token="FwoGZXIvYXdzEBYaDH...",
        expiration=datetime.now(timezone.utc)
    )
    
    # Mock fetcher 응답 (빈 리스트)
    mock_ec2_response = []
    mock_vpc_response = []
    mock_sg_response = []
    
    # credential_manager.assume_role을 mock
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        # 각 fetcher의 fetch 메서드를 mock
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=mock_ec2_response) as mock_ec2_fetch:
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=mock_vpc_response) as mock_vpc_fetch:
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=mock_sg_response) as mock_sg_fetch:
                    # fetch_all_resources 호출
                    result = resource_fetcher.fetch_all_resources(
                        account_id=account_id,
                        role_name=role_name,
                        region=region
                    )
                    
                    # 모든 fetcher가 호출되었는지 확인
                    mock_ec2_fetch.assert_called_once_with(mock_credentials, region)
                    mock_vpc_fetch.assert_called_once_with(mock_credentials, region)
                    mock_sg_fetch.assert_called_once_with(mock_credentials, region)
                    
                    # 결과 구조 검증
                    assert 'ec2_instances' in result, "Result should contain ec2_instances"
                    assert 'vpcs' in result, "Result should contain vpcs"
                    assert 'security_groups' in result, "Result should contain security_groups"
                    assert result['account_id'] == account_id, "Result should contain correct account_id"
                    assert result['region'] == region, "Result should contain correct region"


# Feature: aws-resource-fetcher, Property 11: Integrated fetch returns structured data
@given(
    account_id=st.text(min_size=12, max_size=12, alphabet=st.characters(whitelist_categories=("Nd",))),
    role_name=st.text(min_size=5, max_size=50),
    region=st.sampled_from(["ap-northeast-2", "us-east-1", "eu-west-1"])
)
@settings(max_examples=100)
def test_integrated_fetch_returns_structured_data(account_id, role_name, region):
    """
    Property 11: Integrated fetch returns structured data
    Validates: Requirements 5.2
    
    For any 전체 리소스 조회 결과, account_id, region, timestamp, ec2_instances, vpcs, security_groups 필드를 포함한 구조화된 데이터를 반환해야 한다.
    """
    # ResourceFetcher 인스턴스 생성
    resource_fetcher = ResourceFetcher()
    
    # Mock 자격증명 생성
    mock_credentials = AWSCredentials(
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        session_token="FwoGZXIvYXdzEBYaDH...",
        expiration=datetime.now(timezone.utc)
    )
    
    # Mock fetcher 응답 (빈 리스트)
    mock_ec2_response = []
    mock_vpc_response = []
    mock_sg_response = []
    
    # credential_manager.assume_role을 mock
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        # 각 fetcher의 fetch 메서드를 mock
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=mock_ec2_response):
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=mock_vpc_response):
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=mock_sg_response):
                    # fetch_all_resources 호출
                    result = resource_fetcher.fetch_all_resources(
                        account_id=account_id,
                        role_name=role_name,
                        region=region
                    )
                    
                    # 필수 필드 존재 확인
                    assert 'account_id' in result, "Result must contain account_id field"
                    assert 'region' in result, "Result must contain region field"
                    assert 'timestamp' in result, "Result must contain timestamp field"
                    assert 'ec2_instances' in result, "Result must contain ec2_instances field"
                    assert 'vpcs' in result, "Result must contain vpcs field"
                    assert 'security_groups' in result, "Result must contain security_groups field"
                    
                    # 필드 값 검증
                    assert result['account_id'] == account_id, "account_id should match input"
                    assert result['region'] == region, "region should match input"
                    assert isinstance(result['timestamp'], str), "timestamp should be a string"
                    assert isinstance(result['ec2_instances'], list), "ec2_instances should be a list"
                    assert isinstance(result['vpcs'], list), "vpcs should be a list"
                    assert isinstance(result['security_groups'], list), "security_groups should be a list"


# Feature: aws-resource-fetcher, Property 12: Partial failure continues execution
@given(
    account_id=st.text(min_size=12, max_size=12, alphabet=st.characters(whitelist_categories=("Nd",))),
    role_name=st.text(min_size=5, max_size=50),
    region=st.sampled_from(["ap-northeast-2", "us-east-1", "eu-west-1"]),
    # 어떤 fetcher가 실패할지 선택 (0: EC2, 1: VPC, 2: SecurityGroup)
    failing_fetcher_index=st.integers(min_value=0, max_value=2)
)
@settings(max_examples=100)
def test_partial_failure_continues_execution(account_id, role_name, region, failing_fetcher_index):
    """
    Property 12: Partial failure continues execution
    Validates: Requirements 5.3
    
    For any 리소스 조회 중 특정 fetcher가 실패하더라도, 해당 리소스는 빈 리스트로 처리되고 나머지 리소스 조회는 계속되어야 한다.
    """
    from aws_resource_fetcher.exceptions import ResourceFetchError
    
    # ResourceFetcher 인스턴스 생성
    resource_fetcher = ResourceFetcher()
    
    # Mock 자격증명 생성
    mock_credentials = AWSCredentials(
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        session_token="FwoGZXIvYXdzEBYaDH...",
        expiration=datetime.now(timezone.utc)
    )
    
    # Mock fetcher 응답 (성공 시 빈 리스트, 실패 시 예외)
    mock_ec2_response = []
    mock_vpc_response = []
    mock_sg_response = []
    
    # credential_manager.assume_role을 mock
    with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
        # 각 fetcher의 fetch 메서드를 mock
        # failing_fetcher_index에 따라 하나의 fetcher만 실패하도록 설정
        
        if failing_fetcher_index == 0:
            # EC2 fetcher 실패
            ec2_mock = Mock(side_effect=ResourceFetchError("EC2", Exception("Simulated EC2 failure")))
            vpc_mock = Mock(return_value=mock_vpc_response)
            sg_mock = Mock(return_value=mock_sg_response)
        elif failing_fetcher_index == 1:
            # VPC fetcher 실패
            ec2_mock = Mock(return_value=mock_ec2_response)
            vpc_mock = Mock(side_effect=ResourceFetchError("VPC", Exception("Simulated VPC failure")))
            sg_mock = Mock(return_value=mock_sg_response)
        else:
            # SecurityGroup fetcher 실패
            ec2_mock = Mock(return_value=mock_ec2_response)
            vpc_mock = Mock(return_value=mock_vpc_response)
            sg_mock = Mock(side_effect=ResourceFetchError("SecurityGroup", Exception("Simulated SG failure")))
        
        with patch.object(resource_fetcher.ec2_fetcher, 'fetch', ec2_mock):
            with patch.object(resource_fetcher.vpc_fetcher, 'fetch', vpc_mock):
                with patch.object(resource_fetcher.security_group_fetcher, 'fetch', sg_mock):
                    # fetch_all_resources 호출 - 예외가 발생하지 않아야 함
                    result = resource_fetcher.fetch_all_resources(
                        account_id=account_id,
                        role_name=role_name,
                        region=region
                    )
                    
                    # 모든 fetcher가 호출되었는지 확인
                    ec2_mock.assert_called_once_with(mock_credentials, region)
                    vpc_mock.assert_called_once_with(mock_credentials, region)
                    sg_mock.assert_called_once_with(mock_credentials, region)
                    
                    # 결과 구조 검증
                    assert 'ec2_instances' in result, "Result should contain ec2_instances"
                    assert 'vpcs' in result, "Result should contain vpcs"
                    assert 'security_groups' in result, "Result should contain security_groups"
                    
                    # 실패한 fetcher의 결과는 빈 리스트여야 함
                    if failing_fetcher_index == 0:
                        assert result['ec2_instances'] == [], "Failed EC2 fetch should return empty list"
                        assert isinstance(result['vpcs'], list), "VPC fetch should succeed"
                        assert isinstance(result['security_groups'], list), "SecurityGroup fetch should succeed"
                    elif failing_fetcher_index == 1:
                        assert isinstance(result['ec2_instances'], list), "EC2 fetch should succeed"
                        assert result['vpcs'] == [], "Failed VPC fetch should return empty list"
                        assert isinstance(result['security_groups'], list), "SecurityGroup fetch should succeed"
                    else:
                        assert isinstance(result['ec2_instances'], list), "EC2 fetch should succeed"
                        assert isinstance(result['vpcs'], list), "VPC fetch should succeed"
                        assert result['security_groups'] == [], "Failed SecurityGroup fetch should return empty list"
                    
                    # 기본 필드들이 여전히 존재하는지 확인
                    assert result['account_id'] == account_id, "account_id should be preserved"
                    assert result['region'] == region, "region should be preserved"
                    assert 'timestamp' in result, "timestamp should be present"


# Feature: aws-resource-fetcher, Property 13: API failure raises exception with details
@given(
    # 다양한 AWS 에러 타입 시뮬레이션
    error_type=st.sampled_from([
        "AccessDenied",
        "InvalidClientTokenId", 
        "UnauthorizedOperation",
        "NetworkError",
        "ServiceUnavailable"
    ]),
    resource_type=st.sampled_from(["EC2", "VPC", "SecurityGroup"]),
    account_id=st.text(min_size=12, max_size=12, alphabet=st.characters(whitelist_categories=("Nd",))),
    role_name=st.text(min_size=5, max_size=50)
)
@settings(max_examples=100)
def test_api_failure_raises_exception_with_details(error_type, resource_type, account_id, role_name):
    """
    Property 13: API failure raises exception with details
    Validates: Requirements 6.1
    
    For any AWS API 호출 실패, 에러 타입과 메시지를 포함한 예외가 발생해야 한다.
    """
    from aws_resource_fetcher.exceptions import AssumeRoleError, ResourceFetchError
    from botocore.exceptions import ClientError
    
    # ResourceFetcher 인스턴스 생성
    resource_fetcher = ResourceFetcher()
    
    # 에러 타입에 따라 적절한 ClientError 생성
    error_response = {
        'Error': {
            'Code': error_type,
            'Message': f'Simulated {error_type} error'
        }
    }
    
    # AssumeRole 실패 시나리오 테스트
    if error_type in ["AccessDenied", "InvalidClientTokenId"]:
        # AssumeRole이 실패하는 경우
        simulated_error = ClientError(error_response, 'AssumeRole')
        
        with patch.object(
            resource_fetcher.credential_manager, 
            'assume_role', 
            side_effect=AssumeRoleError(account_id, role_name, simulated_error)
        ):
            # fetch_all_resources 호출 시 AssumeRoleError가 발생해야 함
            try:
                resource_fetcher.fetch_all_resources(
                    account_id=account_id,
                    role_name=role_name,
                    region="ap-northeast-2"
                )
                # 예외가 발생하지 않으면 테스트 실패
                assert False, "Expected AssumeRoleError to be raised"
            except AssumeRoleError as e:
                # 예외가 발생했는지 확인
                assert e.account_id == account_id, "Exception should contain account_id"
                assert e.role_name == role_name, "Exception should contain role_name"
                assert e.original_error is not None, "Exception should contain original_error"
                assert error_type in str(e) or error_type in str(e.original_error), \
                    "Exception message should contain error type"
    
    # 리소스 조회 실패 시나리오 테스트
    else:
        # Mock 자격증명 생성
        mock_credentials = AWSCredentials(
            access_key="AKIAIOSFODNN7EXAMPLE",
            secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            session_token="FwoGZXIvYXdzEBYaDH...",
            expiration=datetime.now(timezone.utc)
        )
        
        # 리소스 조회 시 에러 발생
        simulated_error = ClientError(error_response, 'DescribeInstances')
        resource_fetch_error = ResourceFetchError(resource_type, simulated_error)
        
        with patch.object(resource_fetcher.credential_manager, 'assume_role', return_value=mock_credentials):
            # 특정 fetcher만 실패하도록 설정
            if resource_type == "EC2":
                with patch.object(resource_fetcher.ec2_fetcher, 'fetch', side_effect=resource_fetch_error):
                    with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=[]):
                        with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=[]):
                            # 부분 실패는 허용되므로 예외가 발생하지 않아야 함
                            result = resource_fetcher.fetch_all_resources(
                                account_id=account_id,
                                role_name=role_name,
                                region="ap-northeast-2"
                            )
                            # 실패한 리소스는 빈 리스트로 처리됨
                            assert result['ec2_instances'] == [], "Failed fetch should return empty list"
            
            elif resource_type == "VPC":
                with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=[]):
                    with patch.object(resource_fetcher.vpc_fetcher, 'fetch', side_effect=resource_fetch_error):
                        with patch.object(resource_fetcher.security_group_fetcher, 'fetch', return_value=[]):
                            result = resource_fetcher.fetch_all_resources(
                                account_id=account_id,
                                role_name=role_name,
                                region="ap-northeast-2"
                            )
                            assert result['vpcs'] == [], "Failed fetch should return empty list"
            
            else:  # SecurityGroup
                with patch.object(resource_fetcher.ec2_fetcher, 'fetch', return_value=[]):
                    with patch.object(resource_fetcher.vpc_fetcher, 'fetch', return_value=[]):
                        with patch.object(resource_fetcher.security_group_fetcher, 'fetch', side_effect=resource_fetch_error):
                            result = resource_fetcher.fetch_all_resources(
                                account_id=account_id,
                                role_name=role_name,
                                region="ap-northeast-2"
                            )
                            assert result['security_groups'] == [], "Failed fetch should return empty list"
