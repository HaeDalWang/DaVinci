"""Property-based 테스트"""
import json
from dataclasses import asdict
from unittest.mock import Mock, patch
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from tests.property_tests.generators import (
    ec2_instance_strategy, 
    vpc_strategy, 
    security_group_strategy,
    phase1_json_strategy,
    invalid_phase1_json_strategy
)
from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.models import AWSCredentials
from datetime import datetime, timezone


# Feature: resource-graph-builder, Property 1: Parsing round-trip preserves data
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_parsing_round_trip_preserves_data(phase1_json):
    """
    Property 1: Parsing round-trip preserves data
    Validates: Requirements 1.1
    
    For any 유효한 Phase 1 JSON 데이터, 파싱 후 다시 JSON으로 직렬화하면 동일한 구조를 유지해야 한다.
    """
    from resource_graph_builder.parser import ResourceParser
    
    # ResourceParser 인스턴스 생성
    parser = ResourceParser()
    
    # Phase 1 JSON 파싱
    parsed_resources = parser.parse(phase1_json)
    
    # 파싱된 데이터를 다시 JSON 형태로 재구성
    reconstructed_json = {
        'ec2_instances': parsed_resources.ec2_instances,
        'vpcs': parsed_resources.vpcs,
        'security_groups': parsed_resources.security_groups
    }
    
    # JSON 직렬화 가능 여부 확인
    json_str = json.dumps(reconstructed_json)
    deserialized_json = json.loads(json_str)
    
    # 원본과 재구성된 데이터 비교
    # EC2 인스턴스 비교
    assert len(phase1_json['ec2_instances']) == len(deserialized_json['ec2_instances']), \
        "EC2 instance count should be preserved"
    
    for original, reconstructed in zip(phase1_json['ec2_instances'], deserialized_json['ec2_instances']):
        assert original['instance_id'] == reconstructed['instance_id'], \
            "EC2 instance_id should be preserved"
        assert original['name'] == reconstructed['name'], \
            "EC2 name should be preserved"
        assert original['state'] == reconstructed['state'], \
            "EC2 state should be preserved"
        assert original['vpc_id'] == reconstructed['vpc_id'], \
            "EC2 vpc_id should be preserved"
        assert original['subnet_id'] == reconstructed['subnet_id'], \
            "EC2 subnet_id should be preserved"
        assert original['security_groups'] == reconstructed['security_groups'], \
            "EC2 security_groups should be preserved"
        assert original['private_ip'] == reconstructed['private_ip'], \
            "EC2 private_ip should be preserved"
        assert original.get('public_ip') == reconstructed.get('public_ip'), \
            "EC2 public_ip should be preserved"
    
    # VPC 비교
    assert len(phase1_json['vpcs']) == len(deserialized_json['vpcs']), \
        "VPC count should be preserved"
    
    for original, reconstructed in zip(phase1_json['vpcs'], deserialized_json['vpcs']):
        assert original['vpc_id'] == reconstructed['vpc_id'], \
            "VPC vpc_id should be preserved"
        assert original['name'] == reconstructed['name'], \
            "VPC name should be preserved"
        assert original['cidr_block'] == reconstructed['cidr_block'], \
            "VPC cidr_block should be preserved"
        
        # Subnet 비교
        assert len(original['subnets']) == len(reconstructed['subnets']), \
            "Subnet count should be preserved"
        
        for orig_subnet, recon_subnet in zip(original['subnets'], reconstructed['subnets']):
            assert orig_subnet['subnet_id'] == recon_subnet['subnet_id'], \
                "Subnet subnet_id should be preserved"
            assert orig_subnet['name'] == recon_subnet['name'], \
                "Subnet name should be preserved"
            assert orig_subnet['cidr_block'] == recon_subnet['cidr_block'], \
                "Subnet cidr_block should be preserved"
            assert orig_subnet['availability_zone'] == recon_subnet['availability_zone'], \
                "Subnet availability_zone should be preserved"
    
    # SecurityGroup 비교
    assert len(phase1_json['security_groups']) == len(deserialized_json['security_groups']), \
        "SecurityGroup count should be preserved"
    
    for original, reconstructed in zip(phase1_json['security_groups'], deserialized_json['security_groups']):
        assert original['group_id'] == reconstructed['group_id'], \
            "SecurityGroup group_id should be preserved"
        assert original['name'] == reconstructed['name'], \
            "SecurityGroup name should be preserved"
        assert original['vpc_id'] == reconstructed['vpc_id'], \
            "SecurityGroup vpc_id should be preserved"
        assert original['description'] == reconstructed['description'], \
            "SecurityGroup description should be preserved"
        
        # 규칙 비교
        assert len(original['inbound_rules']) == len(reconstructed['inbound_rules']), \
            "Inbound rules count should be preserved"
        assert len(original['outbound_rules']) == len(reconstructed['outbound_rules']), \
            "Outbound rules count should be preserved"
        
        for orig_rule, recon_rule in zip(original['inbound_rules'], reconstructed['inbound_rules']):
            assert orig_rule['protocol'] == recon_rule['protocol'], \
                "Rule protocol should be preserved"
            assert orig_rule.get('from_port') == recon_rule.get('from_port'), \
                "Rule from_port should be preserved"
            assert orig_rule.get('to_port') == recon_rule.get('to_port'), \
                "Rule to_port should be preserved"
            assert orig_rule['target'] == recon_rule['target'], \
                "Rule target should be preserved"
        
        for orig_rule, recon_rule in zip(original['outbound_rules'], reconstructed['outbound_rules']):
            assert orig_rule['protocol'] == recon_rule['protocol'], \
                "Rule protocol should be preserved"
            assert orig_rule.get('from_port') == recon_rule.get('from_port'), \
                "Rule from_port should be preserved"
            assert orig_rule.get('to_port') == recon_rule.get('to_port'), \
                "Rule to_port should be preserved"
            assert orig_rule['target'] == recon_rule['target'], \
                "Rule target should be preserved"


# Feature: resource-graph-builder, Property 3: Invalid input raises descriptive errors
@given(invalid_json=invalid_phase1_json_strategy())
@settings(max_examples=100)
def test_invalid_input_raises_descriptive_errors(invalid_json):
    """
    Property 3: Invalid input raises descriptive errors
    Validates: Requirements 1.3, 8.2
    
    For any 유효하지 않은 입력 데이터, 파싱 실패 시 실패한 필드와 예상 형식을 포함한 
    명확한 에러 메시지를 가진 예외가 발생해야 한다.
    """
    from resource_graph_builder.parser import ResourceParser
    from resource_graph_builder.exceptions import ParseError
    
    # ResourceParser 인스턴스 생성
    parser = ResourceParser()
    
    # 유효하지 않은 데이터 파싱 시도
    try:
        parser.parse(invalid_json)
        # 예외가 발생하지 않으면 테스트 실패
        assert False, "Expected ParseError to be raised for invalid input"
    except ParseError as e:
        # ParseError가 발생했는지 확인
        assert e.field is not None, "ParseError should contain field information"
        assert e.expected_type is not None, "ParseError should contain expected_type information"
        
        # 에러 메시지가 명확한지 확인
        error_message = str(e)
        assert 'Failed to parse' in error_message, \
            "Error message should indicate parsing failure"
        assert 'expected' in error_message, \
            "Error message should describe expected type"
        assert 'got' in error_message, \
            "Error message should describe actual type"
        
        # 필드 정보가 에러 메시지에 포함되어 있는지 확인
        # field는 'ec2_instances[0].name' 같은 형식이어야 함
        assert len(e.field) > 0, "Field should not be empty"
        
        # expected_type이 의미있는 정보를 포함하는지 확인
        assert len(e.expected_type) > 0, "Expected type should not be empty"


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


# Feature: resource-graph-builder, Property 11: Graph serialization round-trip
@given(st.data())
@settings(max_examples=100)
def test_graph_serialization_round_trip(data):
    """
    Property 11: Graph serialization round-trip
    Validates: Requirements 6.1, 6.4
    
    For any 생성된 그래프, JSON으로 직렬화 후 역직렬화하면 동일한 그래프를 복원해야 한다.
    """
    from resource_graph_builder.graph import ResourceGraph
    from tests.property_tests.graph_generators import resource_graph_strategy
    
    # 그래프 생성
    graph = data.draw(resource_graph_strategy())
    
    # 그래프를 dict로 직렬화
    graph_dict = graph.to_dict()
    
    # dict에서 그래프 복원
    restored_graph = ResourceGraph.from_dict(graph_dict)
    
    # 노드 비교
    assert len(graph.nodes) == len(restored_graph.nodes), \
        "Round-trip should preserve node count"
    
    for node_id, original_node in graph.nodes.items():
        assert node_id in restored_graph.nodes, \
            f"Node {node_id} should exist after round-trip"
        
        restored_node = restored_graph.nodes[node_id]
        assert original_node.id == restored_node.id, \
            "Node id should be preserved"
        assert original_node.type == restored_node.type, \
            "Node type should be preserved"
        assert original_node.name == restored_node.name, \
            "Node name should be preserved"
        assert original_node.attributes == restored_node.attributes, \
            "Node attributes should be preserved"
    
    # 엣지 비교
    assert len(graph.edges) == len(restored_graph.edges), \
        "Round-trip should preserve edge count"
    
    for i, original_edge in enumerate(graph.edges):
        restored_edge = restored_graph.edges[i]
        assert original_edge.source == restored_edge.source, \
            "Edge source should be preserved"
        assert original_edge.target == restored_edge.target, \
            "Edge target should be preserved"
        assert original_edge.edge_type == restored_edge.edge_type, \
            "Edge type should be preserved"
        assert original_edge.attributes == restored_edge.attributes, \
            "Edge attributes should be preserved"
    
    # 그룹 비교
    assert len(graph.groups) == len(restored_graph.groups), \
        "Round-trip should preserve group count"
    
    for group_id, original_group in graph.groups.items():
        assert group_id in restored_graph.groups, \
            f"Group {group_id} should exist after round-trip"
        
        restored_group = restored_graph.groups[group_id]
        assert original_group.id == restored_group.id, \
            "Group id should be preserved"
        assert original_group.type == restored_group.type, \
            "Group type should be preserved"
        assert original_group.name == restored_group.name, \
            "Group name should be preserved"
        assert original_group.members == restored_group.members, \
            "Group members should be preserved"
        assert original_group.attributes == restored_group.attributes, \
            "Group attributes should be preserved"
    
    # 메타데이터 검증
    assert 'metadata' in graph_dict, \
        "Serialized graph should contain metadata"
    assert 'created_at' in graph_dict['metadata'], \
        "Metadata should contain created_at"
    assert 'node_count' in graph_dict['metadata'], \
        "Metadata should contain node_count"
    assert 'edge_count' in graph_dict['metadata'], \
        "Metadata should contain edge_count"
    assert 'group_count' in graph_dict['metadata'], \
        "Metadata should contain group_count"


# Feature: resource-graph-builder, Property 12: JSON contains required sections
@given(st.data())
@settings(max_examples=100)
def test_json_contains_required_sections(data):
    """
    Property 12: JSON contains required sections
    Validates: Requirements 6.2, 6.3
    
    For any 그래프를 JSON으로 내보낼 때, nodes, edges, groups, metadata 섹션을 포함해야 한다.
    """
    from resource_graph_builder.graph import ResourceGraph
    from tests.property_tests.graph_generators import resource_graph_strategy
    
    # 그래프 생성
    graph = data.draw(resource_graph_strategy())
    
    # 그래프를 dict로 직렬화
    graph_dict = graph.to_dict()
    
    # 필수 섹션 존재 확인
    assert 'nodes' in graph_dict, \
        "JSON should contain 'nodes' section"
    assert 'edges' in graph_dict, \
        "JSON should contain 'edges' section"
    assert 'groups' in graph_dict, \
        "JSON should contain 'groups' section"
    assert 'metadata' in graph_dict, \
        "JSON should contain 'metadata' section"
    
    # 각 섹션이 올바른 타입인지 확인
    assert isinstance(graph_dict['nodes'], list), \
        "'nodes' section should be a list"
    assert isinstance(graph_dict['edges'], list), \
        "'edges' section should be a list"
    assert isinstance(graph_dict['groups'], list), \
        "'groups' section should be a list"
    assert isinstance(graph_dict['metadata'], dict), \
        "'metadata' section should be a dict"
    
    # 메타데이터 필수 필드 확인
    metadata = graph_dict['metadata']
    assert 'created_at' in metadata, \
        "Metadata should contain 'created_at' field"
    assert 'node_count' in metadata, \
        "Metadata should contain 'node_count' field"
    assert 'edge_count' in metadata, \
        "Metadata should contain 'edge_count' field"
    assert 'group_count' in metadata, \
        "Metadata should contain 'group_count' field"
    
    # 메타데이터 값이 실제 개수와 일치하는지 확인
    assert metadata['node_count'] == len(graph_dict['nodes']), \
        "node_count in metadata should match actual node count"
    assert metadata['edge_count'] == len(graph_dict['edges']), \
        "edge_count in metadata should match actual edge count"
    assert metadata['group_count'] == len(graph_dict['groups']), \
        "group_count in metadata should match actual group count"
    
    # created_at이 ISO 8601 형식인지 확인
    from datetime import datetime
    try:
        datetime.fromisoformat(metadata['created_at'])
    except ValueError:
        assert False, "created_at should be in ISO 8601 format"
    
    # 노드 구조 검증 (노드가 있는 경우)
    if graph_dict['nodes']:
        sample_node = graph_dict['nodes'][0]
        assert 'id' in sample_node, "Node should contain 'id' field"
        assert 'type' in sample_node, "Node should contain 'type' field"
        assert 'name' in sample_node, "Node should contain 'name' field"
        assert 'attributes' in sample_node, "Node should contain 'attributes' field"
    
    # 엣지 구조 검증 (엣지가 있는 경우)
    if graph_dict['edges']:
        sample_edge = graph_dict['edges'][0]
        assert 'source' in sample_edge, "Edge should contain 'source' field"
        assert 'target' in sample_edge, "Edge should contain 'target' field"
        assert 'edge_type' in sample_edge, "Edge should contain 'edge_type' field"
        assert 'attributes' in sample_edge, "Edge should contain 'attributes' field"
    
    # 그룹 구조 검증 (그룹이 있는 경우)
    if graph_dict['groups']:
        sample_group = graph_dict['groups'][0]
        assert 'id' in sample_group, "Group should contain 'id' field"
        assert 'type' in sample_group, "Group should contain 'type' field"
        assert 'name' in sample_group, "Group should contain 'name' field"
        assert 'members' in sample_group, "Group should contain 'members' field"
        assert 'attributes' in sample_group, "Group should contain 'attributes' field"


# Feature: resource-graph-builder, Property 2: All resources become nodes
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_all_resources_become_nodes(phase1_json):
    """
    Property 2: All resources become nodes
    Validates: Requirements 1.2
    
    For any Phase 1 JSON 데이터, 모든 리소스(EC2, VPC, Subnet, SecurityGroup)가 노드로 변환되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 모든 EC2 인스턴스가 노드로 변환되었는지 확인
    for ec2 in phase1_json['ec2_instances']:
        instance_id = ec2['instance_id']
        assert instance_id in graph.nodes, \
            f"EC2 instance {instance_id} should be converted to a node"
        
        node = graph.nodes[instance_id]
        assert node.type == 'ec2', \
            f"EC2 instance node should have type 'ec2', got '{node.type}'"
        assert node.name == ec2['name'], \
            f"EC2 instance node name should match, expected '{ec2['name']}', got '{node.name}'"
    
    # 모든 VPC가 노드로 변환되었는지 확인
    for vpc in phase1_json['vpcs']:
        vpc_id = vpc['vpc_id']
        assert vpc_id in graph.nodes, \
            f"VPC {vpc_id} should be converted to a node"
        
        node = graph.nodes[vpc_id]
        assert node.type == 'vpc', \
            f"VPC node should have type 'vpc', got '{node.type}'"
        assert node.name == vpc['name'], \
            f"VPC node name should match, expected '{vpc['name']}', got '{node.name}'"
    
    # 모든 Subnet이 노드로 변환되었는지 확인
    for vpc in phase1_json['vpcs']:
        for subnet in vpc.get('subnets', []):
            subnet_id = subnet['subnet_id']
            assert subnet_id in graph.nodes, \
                f"Subnet {subnet_id} should be converted to a node"
            
            node = graph.nodes[subnet_id]
            assert node.type == 'subnet', \
                f"Subnet node should have type 'subnet', got '{node.type}'"
            assert node.name == subnet['name'], \
                f"Subnet node name should match, expected '{subnet['name']}', got '{node.name}'"
    
    # 모든 SecurityGroup이 노드로 변환되었는지 확인
    for sg in phase1_json['security_groups']:
        group_id = sg['group_id']
        assert group_id in graph.nodes, \
            f"SecurityGroup {group_id} should be converted to a node"
        
        node = graph.nodes[group_id]
        assert node.type == 'security_group', \
            f"SecurityGroup node should have type 'security_group', got '{node.type}'"
        assert node.name == sg['name'], \
            f"SecurityGroup node name should match, expected '{sg['name']}', got '{node.name}'"
    
    # 총 노드 개수 검증
    expected_node_count = (
        len(phase1_json['ec2_instances']) +
        len(phase1_json['vpcs']) +
        sum(len(vpc.get('subnets', [])) for vpc in phase1_json['vpcs']) +
        len(phase1_json['security_groups'])
    )
    
    actual_node_count = len(graph.nodes)
    assert actual_node_count == expected_node_count, \
        f"Total node count should be {expected_node_count}, got {actual_node_count}"


# Feature: resource-graph-builder, Property 4: EC2 creates edges to VPC and Subnet
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_ec2_creates_edges_to_vpc_and_subnet(phase1_json):
    """
    Property 4: EC2 creates edges to VPC and Subnet
    Validates: Requirements 2.1, 2.2
    
    For any EC2 인스턴스, 해당 인스턴스가 속한 VPC와 Subnet으로의 엣지가 생성되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 각 EC2 인스턴스에 대해 검증
    for ec2 in phase1_json['ec2_instances']:
        instance_id = ec2['instance_id']
        vpc_id = ec2['vpc_id']
        subnet_id = ec2['subnet_id']
        
        # VPC-EC2 엣지 존재 확인
        vpc_edge_found = False
        for edge in graph.edges:
            if edge.source == vpc_id and edge.target == instance_id:
                vpc_edge_found = True
                # 엣지 타입이 'contains'인지 확인 (Property 5에서 검증하지만 여기서도 확인)
                assert edge.edge_type == 'contains', \
                    f"VPC-EC2 edge should have type 'contains', got '{edge.edge_type}'"
                break
        
        assert vpc_edge_found, \
            f"EC2 instance {instance_id} should have an edge from VPC {vpc_id}"
        
        # Subnet-EC2 엣지 존재 확인
        subnet_edge_found = False
        for edge in graph.edges:
            if edge.source == subnet_id and edge.target == instance_id:
                subnet_edge_found = True
                # 엣지 타입이 'hosts'인지 확인 (Property 5에서 검증하지만 여기서도 확인)
                assert edge.edge_type == 'hosts', \
                    f"Subnet-EC2 edge should have type 'hosts', got '{edge.edge_type}'"
                break
        
        assert subnet_edge_found, \
            f"EC2 instance {instance_id} should have an edge from Subnet {subnet_id}"


# Feature: resource-graph-builder, Property 5: Edge types are correctly assigned
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_edge_types_are_correctly_assigned(phase1_json):
    """
    Property 5: Edge types are correctly assigned
    Validates: Requirements 2.3, 2.4, 3.2, 4.3
    
    For any 생성된 엣지, 엣지 타입이 올바르게 설정되어야 한다:
    - VPC-EC2는 "contains"
    - Subnet-EC2는 "hosts"
    - EC2-SG는 "uses" (추후 구현)
    - SG-SG는 "allows_traffic" (추후 구현)
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 모든 엣지에 대해 검증
    for edge in graph.edges:
        source_node = graph.nodes.get(edge.source)
        target_node = graph.nodes.get(edge.target)
        
        # 노드가 존재하는지 확인
        assert source_node is not None, \
            f"Source node {edge.source} should exist in graph"
        assert target_node is not None, \
            f"Target node {edge.target} should exist in graph"
        
        # 엣지 타입 검증
        if source_node.type == 'vpc' and target_node.type == 'ec2':
            # VPC-EC2 엣지는 "contains"
            assert edge.edge_type == 'contains', \
                f"VPC-EC2 edge should have type 'contains', got '{edge.edge_type}'"
        
        elif source_node.type == 'subnet' and target_node.type == 'ec2':
            # Subnet-EC2 엣지는 "hosts"
            assert edge.edge_type == 'hosts', \
                f"Subnet-EC2 edge should have type 'hosts', got '{edge.edge_type}'"
        
        elif source_node.type == 'ec2' and target_node.type == 'security_group':
            # EC2-SecurityGroup 엣지는 "uses" (아직 미구현)
            assert edge.edge_type == 'uses', \
                f"EC2-SecurityGroup edge should have type 'uses', got '{edge.edge_type}'"
        
        elif source_node.type == 'security_group' and target_node.type == 'security_group':
            # SecurityGroup-SecurityGroup 엣지는 "allows_traffic" (아직 미구현)
            assert edge.edge_type == 'allows_traffic', \
                f"SecurityGroup-SecurityGroup edge should have type 'allows_traffic', got '{edge.edge_type}'"
        
        else:
            # 알 수 없는 엣지 타입 조합
            # 현재는 VPC-EC2, Subnet-EC2만 구현되어 있으므로 다른 조합이 있으면 실패
            assert False, \
                f"Unexpected edge type combination: {source_node.type} -> {target_node.type}"


# Feature: resource-graph-builder, Property 6: All SecurityGroups create edges
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_all_security_groups_create_edges(phase1_json):
    """
    Property 6: All SecurityGroups create edges
    Validates: Requirements 3.1
    
    For any EC2 인스턴스에 연결된 모든 SecurityGroup, 각 SecurityGroup으로의 엣지가 생성되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 각 EC2 인스턴스에 대해 검증
    for ec2 in phase1_json['ec2_instances']:
        instance_id = ec2['instance_id']
        security_groups = ec2.get('security_groups', [])
        
        # EC2에 연결된 각 SecurityGroup에 대해 엣지 존재 확인
        for sg_id in security_groups:
            # EC2-SecurityGroup 엣지 존재 확인
            sg_edge_found = False
            for edge in graph.edges:
                if edge.source == instance_id and edge.target == sg_id:
                    sg_edge_found = True
                    # 엣지 타입이 'uses'인지 확인
                    assert edge.edge_type == 'uses', \
                        f"EC2-SecurityGroup edge should have type 'uses', got '{edge.edge_type}'"
                    break
            
            assert sg_edge_found, \
                f"EC2 instance {instance_id} should have an edge to SecurityGroup {sg_id}"



# Feature: resource-graph-builder, Property 7: SG rules create traffic edges
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_sg_rules_create_traffic_edges(phase1_json):
    """
    Property 7: SG rules create traffic edges
    Validates: Requirements 4.1, 4.2
    
    For any SecurityGroup 규칙이 다른 SecurityGroup을 참조할 때, 
    두 SecurityGroup 간 엣지가 생성되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 각 SecurityGroup에 대해 검증
    for sg in phase1_json['security_groups']:
        source_sg_id = sg['group_id']
        
        # 인바운드 규칙 검증
        for rule in sg.get('inbound_rules', []):
            target = rule.get('target', '')
            
            # target이 SecurityGroup ID인지 확인 (sg-로 시작)
            if target.startswith('sg-'):
                # 트래픽 허용 엣지가 존재하는지 확인
                # 인바운드 규칙이므로 target -> source 방향
                # 각 규칙에 정확히 매칭되는 엣지를 찾아야 함
                traffic_edge_found = False
                for edge in graph.edges:
                    if (edge.source == target and 
                        edge.target == source_sg_id and 
                        edge.edge_type == 'allows_traffic' and
                        edge.attributes.get('direction') == 'inbound'):
                        
                        # 프로토콜, 포트가 모두 일치하는지 확인
                        protocol_match = edge.attributes.get('protocol') == rule.get('protocol', '')
                        from_port_match = edge.attributes.get('from_port') == rule.get('from_port')
                        to_port_match = edge.attributes.get('to_port') == rule.get('to_port')
                        
                        if protocol_match and from_port_match and to_port_match:
                            traffic_edge_found = True
                            
                            # 엣지 속성 검증
                            assert 'protocol' in edge.attributes, \
                                "Traffic edge should contain 'protocol' attribute"
                            assert 'direction' in edge.attributes, \
                                "Traffic edge should contain 'direction' attribute"
                            
                            break
                
                assert traffic_edge_found, \
                    f"Inbound rule from {target} to {source_sg_id} (protocol={rule.get('protocol')}, from_port={rule.get('from_port')}, to_port={rule.get('to_port')}) should create a traffic edge"
        
        # 아웃바운드 규칙 검증
        for rule in sg.get('outbound_rules', []):
            target = rule.get('target', '')
            
            # target이 SecurityGroup ID인지 확인 (sg-로 시작)
            if target.startswith('sg-'):
                # 트래픽 허용 엣지가 존재하는지 확인
                # 아웃바운드 규칙이므로 source -> target 방향
                # 각 규칙에 정확히 매칭되는 엣지를 찾아야 함
                traffic_edge_found = False
                for edge in graph.edges:
                    if (edge.source == source_sg_id and 
                        edge.target == target and 
                        edge.edge_type == 'allows_traffic' and
                        edge.attributes.get('direction') == 'outbound'):
                        
                        # 프로토콜, 포트가 모두 일치하는지 확인
                        protocol_match = edge.attributes.get('protocol') == rule.get('protocol', '')
                        from_port_match = edge.attributes.get('from_port') == rule.get('from_port')
                        to_port_match = edge.attributes.get('to_port') == rule.get('to_port')
                        
                        if protocol_match and from_port_match and to_port_match:
                            traffic_edge_found = True
                            
                            # 엣지 속성 검증
                            assert 'protocol' in edge.attributes, \
                                "Traffic edge should contain 'protocol' attribute"
                            assert 'direction' in edge.attributes, \
                                "Traffic edge should contain 'direction' attribute"
                            
                            break
                
                assert traffic_edge_found, \
                    f"Outbound rule from {source_sg_id} to {target} (protocol={rule.get('protocol')}, from_port={rule.get('from_port')}, to_port={rule.get('to_port')}) should create a traffic edge"


# Feature: resource-graph-builder, Property 8: Traffic edges include protocol and port
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_traffic_edges_include_protocol_and_port(phase1_json):
    """
    Property 8: Traffic edges include protocol and port
    Validates: Requirements 4.4
    
    For any SecurityGroup 간 트래픽 허용 엣지, 프로토콜과 포트 정보가 엣지 속성에 포함되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # allows_traffic 타입의 모든 엣지에 대해 검증
    traffic_edges = [edge for edge in graph.edges if edge.edge_type == 'allows_traffic']
    
    for edge in traffic_edges:
        # 엣지 속성에 protocol이 포함되어 있는지 확인
        assert 'protocol' in edge.attributes, \
            f"Traffic edge from {edge.source} to {edge.target} should contain 'protocol' attribute"
        
        # protocol 값이 유효한지 확인
        protocol = edge.attributes['protocol']
        assert isinstance(protocol, str), \
            f"Protocol should be a string, got {type(protocol).__name__}"
        assert len(protocol) > 0, \
            "Protocol should not be empty"
        
        # from_port와 to_port가 포함되어 있는지 확인
        # 주의: ICMP나 all protocols (-1)의 경우 포트가 None일 수 있음
        assert 'from_port' in edge.attributes, \
            f"Traffic edge from {edge.source} to {edge.target} should contain 'from_port' attribute"
        assert 'to_port' in edge.attributes, \
            f"Traffic edge from {edge.source} to {edge.target} should contain 'to_port' attribute"
        
        from_port = edge.attributes['from_port']
        to_port = edge.attributes['to_port']
        
        # 포트 값이 None이거나 정수인지 확인
        if from_port is not None:
            assert isinstance(from_port, int), \
                f"from_port should be an integer or None, got {type(from_port).__name__}"
            assert 0 <= from_port <= 65535, \
                f"from_port should be in range 0-65535, got {from_port}"
        
        if to_port is not None:
            assert isinstance(to_port, int), \
                f"to_port should be an integer or None, got {type(to_port).__name__}"
            assert 0 <= to_port <= 65535, \
                f"to_port should be in range 0-65535, got {to_port}"
        
        # from_port와 to_port가 모두 None이 아닌 경우, from_port <= to_port 확인
        if from_port is not None and to_port is not None:
            assert from_port <= to_port, \
                f"from_port ({from_port}) should be less than or equal to to_port ({to_port})"
        
        # direction 속성도 포함되어 있는지 확인
        assert 'direction' in edge.attributes, \
            f"Traffic edge from {edge.source} to {edge.target} should contain 'direction' attribute"
        
        direction = edge.attributes['direction']
        assert direction in ['inbound', 'outbound'], \
            f"Direction should be 'inbound' or 'outbound', got '{direction}'"


# Feature: resource-graph-builder, Property 9: VPC groups are created
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_vpc_groups_are_created(phase1_json):
    """
    Property 9: VPC groups are created
    Validates: Requirements 5.1
    
    For any VPC, 해당 VPC에 속한 모든 Subnet과 EC2를 멤버로 하는 그룹이 생성되어야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 각 VPC에 대해 검증
    for vpc in phase1_json['vpcs']:
        vpc_id = vpc['vpc_id']
        
        # VPC 그룹이 존재하는지 확인
        assert vpc_id in graph.groups, \
            f"VPC {vpc_id} should have a corresponding group"
        
        vpc_group = graph.groups[vpc_id]
        
        # 그룹 타입이 'vpc'인지 확인
        assert vpc_group.type == 'vpc', \
            f"VPC group type should be 'vpc', got '{vpc_group.type}'"
        
        # 그룹 이름이 VPC 이름과 일치하는지 확인
        assert vpc_group.name == vpc['name'], \
            f"VPC group name should match VPC name, expected '{vpc['name']}', got '{vpc_group.name}'"
        
        # 이 VPC에 속한 모든 Subnet이 그룹 멤버에 포함되어 있는지 확인
        for subnet in vpc.get('subnets', []):
            subnet_id = subnet['subnet_id']
            assert subnet_id in vpc_group.members, \
                f"Subnet {subnet_id} should be a member of VPC group {vpc_id}"
        
        # 이 VPC에 속한 모든 EC2 인스턴스가 그룹 멤버에 포함되어 있는지 확인
        for ec2 in phase1_json['ec2_instances']:
            if ec2['vpc_id'] == vpc_id:
                instance_id = ec2['instance_id']
                assert instance_id in vpc_group.members, \
                    f"EC2 instance {instance_id} should be a member of VPC group {vpc_id}"
        
        # 그룹 멤버가 실제로 이 VPC에 속한 리소스만 포함하는지 확인
        # (다른 VPC의 리소스가 포함되지 않았는지 확인)
        expected_members = set()
        
        # VPC의 모든 Subnet 추가
        for subnet in vpc.get('subnets', []):
            expected_members.add(subnet['subnet_id'])
        
        # VPC의 모든 EC2 인스턴스 추가
        for ec2 in phase1_json['ec2_instances']:
            if ec2['vpc_id'] == vpc_id:
                expected_members.add(ec2['instance_id'])
        
        # 그룹 멤버가 예상된 멤버와 정확히 일치하는지 확인
        actual_members = set(vpc_group.members)
        assert actual_members == expected_members, \
            f"VPC group {vpc_id} members mismatch. Expected: {expected_members}, Got: {actual_members}"
        
        # 그룹 속성에 VPC ID와 CIDR 블록이 포함되어 있는지 확인 (Property 10에서 검증하지만 여기서도 확인)
        assert 'vpc_id' in vpc_group.attributes, \
            f"VPC group should contain 'vpc_id' attribute"
        assert vpc_group.attributes['vpc_id'] == vpc_id, \
            f"VPC group vpc_id attribute should match VPC ID"
        
        assert 'cidr_block' in vpc_group.attributes, \
            f"VPC group should contain 'cidr_block' attribute"
        assert vpc_group.attributes['cidr_block'] == vpc['cidr_block'], \
            f"VPC group cidr_block attribute should match VPC CIDR block"


# Feature: resource-graph-builder, Property 10: Groups contain required attributes
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_groups_contain_required_attributes(phase1_json):
    """
    Property 10: Groups contain required attributes
    Validates: Requirements 5.3
    
    For any VPC 그룹, VPC ID, 이름, CIDR 정보를 포함해야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 각 VPC에 대해 검증
    for vpc in phase1_json['vpcs']:
        vpc_id = vpc['vpc_id']
        vpc_name = vpc['name']
        vpc_cidr = vpc['cidr_block']
        
        # VPC 그룹이 존재하는지 확인
        assert vpc_id in graph.groups, \
            f"VPC {vpc_id} should have a corresponding group"
        
        vpc_group = graph.groups[vpc_id]
        
        # 그룹 ID가 VPC ID와 일치하는지 확인
        assert vpc_group.id == vpc_id, \
            f"Group id should match VPC ID, expected '{vpc_id}', got '{vpc_group.id}'"
        
        # 그룹 이름이 VPC 이름과 일치하는지 확인
        assert vpc_group.name == vpc_name, \
            f"Group name should match VPC name, expected '{vpc_name}', got '{vpc_group.name}'"
        
        # 그룹 속성에 필수 필드가 포함되어 있는지 확인
        assert 'vpc_id' in vpc_group.attributes, \
            f"VPC group {vpc_id} should contain 'vpc_id' attribute"
        
        assert 'cidr_block' in vpc_group.attributes, \
            f"VPC group {vpc_id} should contain 'cidr_block' attribute"
        
        # 속성 값이 올바른지 확인
        assert vpc_group.attributes['vpc_id'] == vpc_id, \
            f"VPC group vpc_id attribute should be '{vpc_id}', got '{vpc_group.attributes['vpc_id']}'"
        
        assert vpc_group.attributes['cidr_block'] == vpc_cidr, \
            f"VPC group cidr_block attribute should be '{vpc_cidr}', got '{vpc_group.attributes['cidr_block']}'"
        
        # 속성 값의 타입이 올바른지 확인
        assert isinstance(vpc_group.attributes['vpc_id'], str), \
            f"vpc_id attribute should be a string, got {type(vpc_group.attributes['vpc_id']).__name__}"
        
        assert isinstance(vpc_group.attributes['cidr_block'], str), \
            f"cidr_block attribute should be a string, got {type(vpc_group.attributes['cidr_block']).__name__}"
        
        # CIDR 블록 형식이 유효한지 확인 (간단한 검증)
        cidr = vpc_group.attributes['cidr_block']
        assert '/' in cidr, \
            f"CIDR block should contain '/', got '{cidr}'"
        
        # CIDR 블록이 비어있지 않은지 확인
        assert len(cidr) > 0, \
            "CIDR block should not be empty"


# Feature: resource-graph-builder, Property 13: Nodes contain required fields
@given(phase1_json=phase1_json_strategy())
@settings(max_examples=100, suppress_health_check=[HealthCheck.data_too_large])
def test_nodes_contain_required_fields(phase1_json):
    """
    Property 13: Nodes contain required fields
    Validates: Requirements 7.1, 7.2, 7.3, 7.4
    
    For any 노드, 리소스 타입, ID, 이름을 포함해야 하며, 
    타입별 특화 속성(EC2는 IP, VPC는 CIDR)을 포함해야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성
    graph = builder.build(phase1_json)
    
    # 모든 노드에 대해 기본 필드 검증
    for node_id, node in graph.nodes.items():
        # 7.1: 리소스 타입 포함 확인
        assert hasattr(node, 'type'), \
            f"Node {node_id} should have 'type' field"
        assert node.type is not None, \
            f"Node {node_id} type should not be None"
        assert isinstance(node.type, str), \
            f"Node {node_id} type should be a string, got {type(node.type).__name__}"
        assert node.type in ['ec2', 'vpc', 'subnet', 'security_group'], \
            f"Node {node_id} type should be one of ['ec2', 'vpc', 'subnet', 'security_group'], got '{node.type}'"
        
        # 7.2: 리소스 ID, 이름 포함 확인
        assert hasattr(node, 'id'), \
            f"Node {node_id} should have 'id' field"
        assert node.id is not None, \
            f"Node {node_id} id should not be None"
        assert isinstance(node.id, str), \
            f"Node {node_id} id should be a string, got {type(node.id).__name__}"
        assert len(node.id) > 0, \
            f"Node {node_id} id should not be empty"
        
        assert hasattr(node, 'name'), \
            f"Node {node_id} should have 'name' field"
        assert node.name is not None, \
            f"Node {node_id} name should not be None"
        assert isinstance(node.name, str), \
            f"Node {node_id} name should be a string, got {type(node.name).__name__}"
        
        assert hasattr(node, 'attributes'), \
            f"Node {node_id} should have 'attributes' field"
        assert isinstance(node.attributes, dict), \
            f"Node {node_id} attributes should be a dict, got {type(node.attributes).__name__}"
    
    # EC2 노드에 대한 특화 검증
    for ec2 in phase1_json['ec2_instances']:
        instance_id = ec2['instance_id']
        node = graph.nodes[instance_id]
        
        # 7.2: 상태 정보 포함 확인
        assert 'state' in node.attributes, \
            f"EC2 node {instance_id} should contain 'state' in attributes"
        assert node.attributes['state'] == ec2['state'], \
            f"EC2 node {instance_id} state should match, expected '{ec2['state']}', got '{node.attributes['state']}'"
        
        # 7.3: private_ip, public_ip 정보 포함 확인
        assert 'private_ip' in node.attributes, \
            f"EC2 node {instance_id} should contain 'private_ip' in attributes"
        assert node.attributes['private_ip'] == ec2['private_ip'], \
            f"EC2 node {instance_id} private_ip should match, expected '{ec2['private_ip']}', got '{node.attributes['private_ip']}'"
        
        assert 'public_ip' in node.attributes, \
            f"EC2 node {instance_id} should contain 'public_ip' in attributes"
        # public_ip는 None일 수 있음
        assert node.attributes['public_ip'] == ec2.get('public_ip'), \
            f"EC2 node {instance_id} public_ip should match, expected '{ec2.get('public_ip')}', got '{node.attributes['public_ip']}'"
        
        # private_ip와 public_ip 타입 검증
        assert isinstance(node.attributes['private_ip'], str), \
            f"EC2 node {instance_id} private_ip should be a string, got {type(node.attributes['private_ip']).__name__}"
        
        if node.attributes['public_ip'] is not None:
            assert isinstance(node.attributes['public_ip'], str), \
                f"EC2 node {instance_id} public_ip should be a string or None, got {type(node.attributes['public_ip']).__name__}"
    
    # VPC 노드에 대한 특화 검증
    for vpc in phase1_json['vpcs']:
        vpc_id = vpc['vpc_id']
        node = graph.nodes[vpc_id]
        
        # 7.4: CIDR 블록 정보 포함 확인
        assert 'cidr_block' in node.attributes, \
            f"VPC node {vpc_id} should contain 'cidr_block' in attributes"
        assert node.attributes['cidr_block'] == vpc['cidr_block'], \
            f"VPC node {vpc_id} cidr_block should match, expected '{vpc['cidr_block']}', got '{node.attributes['cidr_block']}'"
        
        # CIDR 블록 타입 검증
        assert isinstance(node.attributes['cidr_block'], str), \
            f"VPC node {vpc_id} cidr_block should be a string, got {type(node.attributes['cidr_block']).__name__}"
        
        # CIDR 블록 형식 검증 (간단한 검증)
        cidr = node.attributes['cidr_block']
        assert '/' in cidr, \
            f"VPC node {vpc_id} cidr_block should contain '/', got '{cidr}'"
        assert len(cidr) > 0, \
            f"VPC node {vpc_id} cidr_block should not be empty"
    
    # Subnet 노드에 대한 검증
    # 중복 ID 체크 (generator가 중복 ID를 생성할 수 있음)
    seen_subnet_ids = set()
    for vpc in phase1_json['vpcs']:
        for subnet in vpc.get('subnets', []):
            subnet_id = subnet['subnet_id']
            
            # 중복 ID는 skip (나중 것이 이전 것을 덮어씀)
            if subnet_id in seen_subnet_ids:
                continue
            seen_subnet_ids.add(subnet_id)
            
            node = graph.nodes[subnet_id]
            
            # Subnet도 CIDR 블록 정보를 포함해야 함
            assert 'cidr_block' in node.attributes, \
                f"Subnet node {subnet_id} should contain 'cidr_block' in attributes"
            assert node.attributes['cidr_block'] == subnet['cidr_block'], \
                f"Subnet node {subnet_id} cidr_block should match, expected '{subnet['cidr_block']}', got '{node.attributes['cidr_block']}'"
            
            # availability_zone 정보도 포함되어야 함
            assert 'availability_zone' in node.attributes, \
                f"Subnet node {subnet_id} should contain 'availability_zone' in attributes"
            assert node.attributes['availability_zone'] == subnet['availability_zone'], \
                f"Subnet node {subnet_id} availability_zone should match"
    
    # SecurityGroup 노드에 대한 검증
    for sg in phase1_json['security_groups']:
        group_id = sg['group_id']
        node = graph.nodes[group_id]
        
        # SecurityGroup은 description을 포함해야 함
        assert 'description' in node.attributes, \
            f"SecurityGroup node {group_id} should contain 'description' in attributes"
        assert node.attributes['description'] == sg['description'], \
            f"SecurityGroup node {group_id} description should match, expected '{sg['description']}', got '{node.attributes['description']}'"
        
        # vpc_id도 포함되어야 함
        assert 'vpc_id' in node.attributes, \
            f"SecurityGroup node {group_id} should contain 'vpc_id' in attributes"
        assert node.attributes['vpc_id'] == sg['vpc_id'], \
            f"SecurityGroup node {group_id} vpc_id should match"



# Feature: resource-graph-builder, Property 14: Invalid references raise exceptions
@given(invalid_json=st.data())
@settings(max_examples=100)
def test_invalid_references_raise_exceptions(invalid_json):
    """
    Property 14: Invalid references raise exceptions
    Validates: Requirements 8.1
    
    For any 유효하지 않은 리소스 참조, 해당 리소스 ID를 포함한 예외가 발생해야 한다.
    """
    from resource_graph_builder.builder import GraphBuilder
    from resource_graph_builder.exceptions import InvalidReferenceError
    from tests.property_tests.generators import phase1_json_with_invalid_references_strategy
    
    # 유효하지 않은 참조를 포함하는 Phase 1 JSON 생성
    phase1_json = invalid_json.draw(phase1_json_with_invalid_references_strategy())
    
    # GraphBuilder 인스턴스 생성
    builder = GraphBuilder()
    
    # 그래프 생성 시도 - InvalidReferenceError가 발생해야 함
    try:
        graph = builder.build(phase1_json)
        # 예외가 발생하지 않으면 테스트 실패
        assert False, "Expected InvalidReferenceError to be raised for invalid resource reference"
    except InvalidReferenceError as e:
        # InvalidReferenceError가 발생했는지 확인
        assert e.resource_id is not None, \
            "InvalidReferenceError should contain resource_id"
        assert e.resource_type is not None, \
            "InvalidReferenceError should contain resource_type"
        
        # 에러 메시지가 명확한지 확인
        error_message = str(e)
        assert 'Invalid' in error_message, \
            "Error message should indicate invalid reference"
        assert 'reference' in error_message, \
            "Error message should mention 'reference'"
        
        # resource_id가 에러 메시지에 포함되어 있는지 확인
        assert e.resource_id in error_message, \
            f"Error message should contain resource_id '{e.resource_id}'"
        
        # resource_type이 에러 메시지에 포함되어 있는지 확인
        assert e.resource_type in error_message, \
            f"Error message should contain resource_type '{e.resource_type}'"
        
        # resource_id가 의미있는 정보를 포함하는지 확인
        assert len(e.resource_id) > 0, \
            "resource_id should not be empty"
        
        # resource_type이 의미있는 정보를 포함하는지 확인
        assert len(e.resource_type) > 0, \
            "resource_type should not be empty"
        
        # resource_type이 유효한 리소스 타입인지 확인
        valid_resource_types = ['vpc', 'subnet', 'security_group', 'ec2']
        assert e.resource_type in valid_resource_types, \
            f"resource_type should be one of {valid_resource_types}, got '{e.resource_type}'"
        
        # resource_id가 AWS 리소스 ID 형식인지 확인 (간단한 검증)
        # VPC: vpc-xxx, Subnet: subnet-xxx, SecurityGroup: sg-xxx, EC2: i-xxx
        assert any(e.resource_id.startswith(prefix) for prefix in ['vpc-', 'subnet-', 'sg-', 'i-']), \
            f"resource_id should start with valid AWS resource prefix, got '{e.resource_id}'"
