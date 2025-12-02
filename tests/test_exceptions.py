"""
커스텀 예외 테스트
"""

from resource_graph_builder.exceptions import (
    GraphBuilderError,
    ParseError,
    InvalidReferenceError
)


def test_parse_error():
    """ParseError 테스트"""
    error = ParseError(
        field="vpc_id",
        expected_type="str",
        actual_value=123
    )
    
    assert error.field == "vpc_id"
    assert error.expected_type == "str"
    assert error.actual_value == 123
    assert "Failed to parse 'vpc_id'" in str(error)
    assert "expected str" in str(error)
    assert "got int" in str(error)


def test_invalid_reference_error():
    """InvalidReferenceError 테스트"""
    error = InvalidReferenceError(
        resource_id="vpc-nonexistent",
        resource_type="VPC"
    )
    
    assert error.resource_id == "vpc-nonexistent"
    assert error.resource_type == "VPC"
    assert "Invalid VPC reference: vpc-nonexistent" in str(error)


def test_exception_hierarchy():
    """예외 계층 구조 테스트"""
    assert issubclass(ParseError, GraphBuilderError)
    assert issubclass(InvalidReferenceError, GraphBuilderError)
    assert issubclass(GraphBuilderError, Exception)
