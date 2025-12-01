"""Property-based 테스트"""
import json
from dataclasses import asdict
from hypothesis import given, settings
from tests.property_tests.generators import ec2_instance_strategy


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
