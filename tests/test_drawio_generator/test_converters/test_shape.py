"""
ShapeConverter 유닛 테스트
"""
import pytest
from drawio_generator.converters.shape import ShapeConverter
from drawio_generator.models import Shape


class TestShapeConverter:
    """ShapeConverter 테스트"""
    
    def test_convert_ec2_basic(self):
        """기본 EC2 노드 변환 테스트"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-123456",
            "name": "web-server",
            "private_ip": "10.0.1.10",
            "parent_id": "subnet-abc"
        }
        
        shape = converter.convert_ec2(node, (100, 200))
        
        assert shape.id == "shape-i-123456"
        assert shape.node_id == "i-123456"
        assert shape.x == 100
        assert shape.y == 200
        assert shape.width == 78
        assert shape.height == 78
        assert shape.label == "web-server\n10.0.1.10"
        assert shape.icon_type == "ec2"
        assert shape.parent_id == "subnet-abc"
    
    def test_convert_ec2_without_name(self):
        """이름 없는 EC2 노드 변환 테스트"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-789",
            "private_ip": "10.0.2.20"
        }
        
        shape = converter.convert_ec2(node, (0, 0))
        
        assert shape.label == "10.0.2.20"
    
    def test_convert_ec2_without_ip(self):
        """IP 없는 EC2 노드 변환 테스트"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-999",
            "name": "app-server"
        }
        
        shape = converter.convert_ec2(node, (0, 0))
        
        assert shape.label == "app-server"
    
    def test_convert_ec2_empty_label(self):
        """이름과 IP 모두 없는 경우"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-empty"
        }
        
        shape = converter.convert_ec2(node, (0, 0))
        
        assert shape.label == ""
    
    def test_ec2_dimensions(self):
        """EC2 아이콘 크기 검증 (78x78)"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-test",
            "name": "test",
            "private_ip": "10.0.0.1"
        }
        
        shape = converter.convert_ec2(node, (0, 0))
        
        # Requirements 2.2: 아이콘 크기 78x78 픽셀
        assert shape.width == 78
        assert shape.height == 78
    
    def test_convert_ec2_with_public_ip(self):
        """Public IP가 있는 EC2 노드 변환 테스트"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-public",
            "name": "web-server",
            "private_ip": "10.0.1.10",
            "public_ip": "54.123.45.67"
        }
        
        shape = converter.convert_ec2(node, (100, 200))
        
        # Requirements 3.1, 3.2: 이름 + private IP + public IP 표시
        assert shape.label == "web-server\n10.0.1.10\n(Public: 54.123.45.67)"
    
    def test_convert_ec2_without_public_ip(self):
        """Public IP가 없는 EC2 노드 변환 테스트"""
        converter = ShapeConverter()
        
        node = {
            "id": "i-private",
            "name": "db-server",
            "private_ip": "10.0.2.20"
        }
        
        shape = converter.convert_ec2(node, (100, 200))
        
        # Public IP가 없으면 표시하지 않음
        assert shape.label == "db-server\n10.0.2.20"
