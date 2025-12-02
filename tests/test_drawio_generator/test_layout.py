"""
LayoutEngine 테스트
"""
import pytest
from drawio_generator.layout import LayoutEngine
from drawio_generator.models import Shape, Container


class TestLayoutEngine:
    """LayoutEngine 클래스 테스트"""
    
    def test_layout_vpcs_horizontal(self):
        """VPC를 수평으로 배치하는지 테스트"""
        engine = LayoutEngine()
        
        vpcs = [
            Container(
                id="vpc-1", node_id="vpc-1", x=0, y=0,
                width=800, height=600, label="VPC 1",
                container_type="vpc", background_color="transparent",
                parent_id=None, children=[]
            ),
            Container(
                id="vpc-2", node_id="vpc-2", x=0, y=0,
                width=800, height=600, label="VPC 2",
                container_type="vpc", background_color="transparent",
                parent_id=None, children=[]
            ),
        ]
        
        engine.layout_vpcs(vpcs)
        
        # 첫 번째 VPC는 (40, 40)에 배치
        assert vpcs[0].x == 40
        assert vpcs[0].y == 40
        
        # 두 번째 VPC는 첫 번째 VPC 오른쪽에 배치 (width + spacing)
        assert vpcs[1].x == 40 + 800 + engine.VPC_SPACING
        assert vpcs[1].y == 40
    
    def test_layout_subnets_grid(self):
        """Subnet을 2열 그리드로 배치하는지 테스트"""
        engine = LayoutEngine()
        
        subnets = [
            Container(
                id=f"subnet-{i}", node_id=f"subnet-{i}", x=0, y=0,
                width=360, height=300, label=f"Subnet {i}",
                container_type="subnet", background_color="transparent",
                parent_id="vpc-1", children=[]
            )
            for i in range(4)
        ]
        
        vpc_bounds = (40, 40, 800, 600)
        engine.layout_subnets(subnets, vpc_bounds)
        
        # 첫 번째 행 (0, 1)
        assert subnets[0].x == engine.CONTAINER_PADDING
        assert subnets[0].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING
        
        assert subnets[1].x == engine.CONTAINER_PADDING + 360 + engine.SUBNET_SPACING
        assert subnets[1].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING
        
        # 두 번째 행 (2, 3)
        assert subnets[2].x == engine.CONTAINER_PADDING
        assert subnets[2].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING + 300 + engine.SUBNET_SPACING
    
    def test_layout_ec2_instances_grid(self):
        """EC2를 3열 그리드로 배치하는지 테스트"""
        engine = LayoutEngine()
        
        ec2_list = [
            Shape(
                id=f"ec2-{i}", node_id=f"i-{i}", x=0, y=0,
                width=78, height=78, label=f"EC2 {i}",
                icon_type="ec2", parent_id="subnet-1"
            )
            for i in range(6)
        ]
        
        subnet_bounds = (40, 40, 360, 300)
        engine.layout_ec2_instances(ec2_list, subnet_bounds)
        
        # 첫 번째 행 (0, 1, 2)
        assert ec2_list[0].x == engine.CONTAINER_PADDING
        assert ec2_list[0].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING
        
        assert ec2_list[1].x == engine.CONTAINER_PADDING + 78 + engine.EC2_SPACING
        assert ec2_list[1].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING
        
        assert ec2_list[2].x == engine.CONTAINER_PADDING + 2 * (78 + engine.EC2_SPACING)
        assert ec2_list[2].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING
        
        # 두 번째 행 (3, 4, 5)
        assert ec2_list[3].x == engine.CONTAINER_PADDING
        assert ec2_list[3].y == engine.LABEL_HEIGHT + engine.CONTAINER_PADDING + 78 + engine.EC2_SPACING
    
    def test_layout_empty_lists(self):
        """빈 리스트 처리 테스트"""
        engine = LayoutEngine()
        
        # 빈 리스트는 에러 없이 처리되어야 함
        engine.layout_vpcs([])
        engine.layout_subnets([], (0, 0, 100, 100))
        engine.layout_ec2_instances([], (0, 0, 100, 100))
    
    def test_spacing_constants(self):
        """간격 상수가 요구사항을 만족하는지 테스트"""
        engine = LayoutEngine()
        
        # Requirements 6.4, 6.5, 6.6
        assert engine.EC2_SPACING == 100
        assert engine.SUBNET_SPACING == 120
        assert engine.VPC_SPACING == 150
