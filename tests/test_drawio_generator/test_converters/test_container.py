"""
ContainerConverter 유닛 테스트
"""
import pytest
from drawio_generator.converters.container import ContainerConverter
from drawio_generator.models import Container


class TestContainerConverter:
    """ContainerConverter 테스트"""
    
    def setup_method(self):
        """각 테스트 전에 실행"""
        self.converter = ContainerConverter()
    
    def test_convert_vpc_basic(self):
        """VPC 기본 변환 테스트"""
        vpc_group = {
            "id": "vpc-123",
            "name": "production-vpc",
            "cidr": "10.0.0.0/16"
        }
        subnets = [
            {"id": "subnet-1"},
            {"id": "subnet-2"}
        ]
        
        container = self.converter.convert_vpc(vpc_group, subnets)
        
        assert container.id == "container-vpc-123"
        assert container.node_id == "vpc-123"
        assert container.label == "production-vpc\n10.0.0.0/16"
        assert container.container_type == "vpc"
        assert container.background_color == "none"
        assert container.parent_id is None
        assert len(container.children) == 2
        assert "container-subnet-1" in container.children
        assert "container-subnet-2" in container.children
    
    def test_convert_vpc_with_position(self):
        """VPC 위치 지정 테스트"""
        vpc_group = {
            "id": "vpc-456",
            "name": "test-vpc",
            "cidr": "172.16.0.0/16"
        }
        
        container = self.converter.convert_vpc(vpc_group, [], position=(100, 200))
        
        assert container.x == 100
        assert container.y == 200
    
    def test_convert_vpc_without_name(self):
        """VPC 이름 없이 변환 테스트"""
        vpc_group = {
            "id": "vpc-789",
            "cidr": "192.168.0.0/16"
        }
        
        container = self.converter.convert_vpc(vpc_group, [])
        
        assert container.label == "192.168.0.0/16"
    
    def test_convert_vpc_without_cidr(self):
        """VPC CIDR 없이 변환 테스트"""
        vpc_group = {
            "id": "vpc-abc",
            "name": "my-vpc"
        }
        
        container = self.converter.convert_vpc(vpc_group, [])
        
        assert container.label == "my-vpc"
    
    def test_convert_subnet_basic(self):
        """Subnet 기본 변환 테스트"""
        subnet_node = {
            "id": "subnet-123",
            "name": "public-subnet",
            "cidr": "10.0.1.0/24"
        }
        ec2_instances = [
            {"id": "i-111"},
            {"id": "i-222"},
            {"id": "i-333"}
        ]
        
        container = self.converter.convert_subnet(
            subnet_node,
            ec2_instances,
            parent_vpc_id="vpc-123"
        )
        
        assert container.id == "container-subnet-123"
        assert container.node_id == "subnet-123"
        assert container.label == "public-subnet\n10.0.1.0/24"
        assert container.container_type == "subnet"
        assert container.background_color == "none"
        assert container.parent_id == "container-vpc-123"
        assert len(container.children) == 3
        assert "shape-i-111" in container.children
        assert "shape-i-222" in container.children
        assert "shape-i-333" in container.children
    
    def test_convert_subnet_with_position(self):
        """Subnet 위치 지정 테스트"""
        subnet_node = {
            "id": "subnet-456",
            "name": "private-subnet",
            "cidr": "10.0.2.0/24"
        }
        
        container = self.converter.convert_subnet(
            subnet_node,
            [],
            position=(50, 100)
        )
        
        assert container.x == 50
        assert container.y == 100
    
    def test_convert_subnet_without_parent(self):
        """Subnet 부모 없이 변환 테스트"""
        subnet_node = {
            "id": "subnet-789",
            "name": "isolated-subnet",
            "cidr": "10.0.3.0/24"
        }
        
        container = self.converter.convert_subnet(subnet_node, [])
        
        assert container.parent_id is None
    
    def test_convert_subnet_without_name(self):
        """Subnet 이름 없이 변환 테스트"""
        subnet_node = {
            "id": "subnet-abc",
            "cidr": "10.0.4.0/24"
        }
        
        container = self.converter.convert_subnet(subnet_node, [])
        
        assert container.label == "10.0.4.0/24"
    
    def test_convert_subnet_without_cidr(self):
        """Subnet CIDR 없이 변환 테스트"""
        subnet_node = {
            "id": "subnet-def",
            "name": "test-subnet"
        }
        
        container = self.converter.convert_subnet(subnet_node, [])
        
        assert container.label == "test-subnet"
    
    def test_create_container_label_full(self):
        """Container 라벨 생성 - 전체 정보"""
        label = self.converter._create_container_label("my-vpc", "10.0.0.0/16")
        assert label == "my-vpc\n10.0.0.0/16"
    
    def test_create_container_label_name_only(self):
        """Container 라벨 생성 - 이름만"""
        label = self.converter._create_container_label("my-vpc", "")
        assert label == "my-vpc"
    
    def test_create_container_label_cidr_only(self):
        """Container 라벨 생성 - CIDR만"""
        label = self.converter._create_container_label("", "10.0.0.0/16")
        assert label == "10.0.0.0/16"
    
    def test_create_container_label_empty(self):
        """Container 라벨 생성 - 빈 정보"""
        label = self.converter._create_container_label("", "")
        assert label == ""
