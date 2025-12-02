"""
draw.io 생성기 커스텀 예외
"""


class DrawioGeneratorError(Exception):
    """draw.io 생성기 기본 예외"""
    pass


class InvalidGraphError(DrawioGeneratorError):
    """
    그래프 JSON 파싱 실패 예외
    
    Attributes:
        field: 실패한 필드명
        reason: 실패 이유
    """
    def __init__(self, field: str, reason: str):
        self.field = field
        self.reason = reason
        super().__init__(f"Invalid graph JSON at '{field}': {reason}")


class UnknownNodeTypeError(DrawioGeneratorError):
    """
    알 수 없는 노드 타입 예외
    
    Attributes:
        node_id: 노드 ID
        node_type: 노드 타입
    """
    def __init__(self, node_id: str, node_type: str):
        self.node_id = node_id
        self.node_type = node_type
        super().__init__(f"Unknown node type '{node_type}' for node '{node_id}'")
