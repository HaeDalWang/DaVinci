"""
커스텀 예외 정의

Requirements: 1.3, 8.1, 8.2
"""

from typing import Any


class GraphBuilderError(Exception):
    """Base exception for resource graph builder"""
    pass


class ParseError(GraphBuilderError):
    """
    데이터 파싱 실패 시 발생하는 예외
    
    Requirements: 1.3, 8.2
    """
    
    def __init__(self, field: str, expected_type: str, actual_value: Any):
        self.field = field
        self.expected_type = expected_type
        self.actual_value = actual_value
        
        super().__init__(
            f"Failed to parse '{field}': expected {expected_type}, "
            f"got {type(actual_value).__name__}"
        )


class InvalidReferenceError(GraphBuilderError):
    """
    유효하지 않은 리소스 참조 시 발생하는 예외
    
    Requirements: 8.1
    """
    
    def __init__(self, resource_id: str, resource_type: str):
        self.resource_id = resource_id
        self.resource_type = resource_type
        
        super().__init__(
            f"Invalid {resource_type} reference: {resource_id}"
        )
