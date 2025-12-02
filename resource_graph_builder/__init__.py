"""
Resource Graph Builder - Phase 2

AWS 리소스 간 관계를 분석하여 그래프 구조로 표현하는 모듈
"""

__version__ = "0.1.0"

from .builder import GraphBuilder
from .exceptions import GraphBuilderError, InvalidReferenceError, ParseError
from .graph import ResourceGraph
from .models import Edge, Group, Node
from .parser import ParsedResources, ResourceParser

__all__ = [
    "GraphBuilder",
    "GraphBuilderError",
    "InvalidReferenceError",
    "ParseError",
    "ResourceGraph",
    "Edge",
    "Group",
    "Node",
    "ParsedResources",
    "ResourceParser",
]
