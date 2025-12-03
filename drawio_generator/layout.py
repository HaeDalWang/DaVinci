"""
draw.io 다이어그램 요소의 자동 레이아웃 엔진
"""
import logging
from .models import Shape, Container

logger = logging.getLogger(__name__)


class LayoutEngine:
    """
    리소스를 자동으로 배치하는 레이아웃 엔진
    
    VPC는 좌측 상단부터 수평 배치
    Subnet은 VPC 내부에 그리드 레이아웃 (2열)
    EC2는 Subnet 내부에 그리드 레이아웃 (3열)
    """
    
    # 간격 상수
    VPC_SPACING = 150      # VPC 간 최소 간격
    SUBNET_SPACING = 120   # Subnet 간 최소 간격
    EC2_SPACING = 100      # EC2 간 최소 간격
    
    # 그리드 열 수
    SUBNET_COLUMNS = 2     # Subnet 그리드 열 수
    EC2_COLUMNS = 3        # EC2 그리드 열 수
    
    # 패딩
    CONTAINER_PADDING = 40  # Container 내부 패딩
    LABEL_HEIGHT = 30       # 라벨 높이
    
    def layout_vpcs(self, vpcs: list[Container], subnets: list[Container]) -> None:
        """
        VPC Container를 배치하고 크기를 재계산
        
        좌측 상단부터 수평으로 배치
        VPC 간 간격: 150px
        
        Args:
            vpcs: VPC Container 목록
            subnets: 모든 Subnet Container 목록 (VPC 크기 계산용)
        """
        logger.debug(f"Laying out {len(vpcs)} VPCs")
        current_x = 40  # 시작 X 좌표
        current_y = 40  # 시작 Y 좌표
        
        for vpc in vpcs:
            vpc.x = current_x
            vpc.y = current_y
            
            # VPC에 속한 Subnet 찾기
            vpc_subnets = [s for s in subnets if s.parent_id == vpc.id]
            logger.debug(f"VPC {vpc.id}: found {len(vpc_subnets)} subnets")
            
            # VPC 크기를 실제 Subnet 크기 기반으로 재계산
            if vpc_subnets:
                old_size = (vpc.width, vpc.height)
                self._recalculate_vpc_size(vpc, vpc_subnets)
                logger.debug(f"VPC {vpc.id}: size recalculated from {old_size} to ({vpc.width}, {vpc.height})")
            
            logger.debug(f"VPC {vpc.id}: positioned at ({vpc.x}, {vpc.y}), size ({vpc.width}, {vpc.height})")
            
            # 다음 VPC는 현재 VPC 너비 + 간격만큼 오른쪽에 배치
            current_x += vpc.width + self.VPC_SPACING
    
    def _recalculate_vpc_size(self, vpc: Container, subnets: list[Container]) -> None:
        """
        VPC 크기를 실제 Subnet 크기 기반으로 재계산
        
        Args:
            vpc: VPC Container
            subnets: VPC에 속한 Subnet 목록
        """
        if not subnets:
            return
        
        # Subnet 2열 그리드 기준
        subnet_columns = 2
        subnet_rows = (len(subnets) + subnet_columns - 1) // subnet_columns
        
        # 실제 Subnet 너비/높이의 최대값 사용
        max_subnet_width = max(s.width for s in subnets)
        max_subnet_height = max(s.height for s in subnets)
        
        # 너비: (최대 Subnet 너비 * 열 수) + (간격 * (열 수 - 1)) + (패딩 * 2)
        vpc.width = (max_subnet_width * subnet_columns) + \
                    (self.SUBNET_SPACING * (subnet_columns - 1)) + \
                    (self.CONTAINER_PADDING * 2)
        
        # 높이: (최대 Subnet 높이 * 행 수) + (간격 * (행 수 - 1)) + 라벨 + (패딩 * 2)
        vpc.height = (max_subnet_height * subnet_rows) + \
                     (self.SUBNET_SPACING * (subnet_rows - 1)) + \
                     self.LABEL_HEIGHT + \
                     (self.CONTAINER_PADDING * 2)
    
    def layout_subnets(
        self, 
        subnets: list[Container], 
        vpc_bounds: tuple[int, int, int, int]
        ) -> None:
        """
        Subnet Container를 VPC 내부에 배치
        
        그리드 레이아웃 (2열)
        Subnet 간 간격: 120px
        
        Args:
            subnets: Subnet Container 목록
            vpc_bounds: VPC 경계 (x, y, width, height)
        """
        if not subnets:
            logger.debug("No subnets to layout")
            return
        
        logger.debug(f"Laying out {len(subnets)} subnets in VPC")
        vpc_x, vpc_y, vpc_width, vpc_height = vpc_bounds
        
        # VPC 내부 시작 위치 (라벨 공간 고려) - 상대 좌표
        start_x = self.CONTAINER_PADDING
        start_y = self.LABEL_HEIGHT + self.CONTAINER_PADDING
        
        current_x = start_x
        current_y = start_y
        row_height = 0
        
        for i, subnet in enumerate(subnets):
            # 상대 좌표로 설정 (parent가 VPC이므로)
            subnet.x = current_x
            subnet.y = current_y
            logger.debug(f"Subnet {subnet.id}: positioned at ({subnet.x}, {subnet.y}) relative to VPC")
            
            # 현재 행의 최대 높이 추적
            row_height = max(row_height, subnet.height)
            
            # 2열 그리드: 짝수 인덱스면 다음 열로, 홀수면 다음 행으로
            if (i + 1) % self.SUBNET_COLUMNS == 0:
                # 다음 행으로
                current_x = start_x
                current_y += row_height + self.SUBNET_SPACING
                row_height = 0
            else:
                # 다음 열로
                current_x += subnet.width + self.SUBNET_SPACING
    
    def layout_ec2_instances(
        self, 
        ec2_list: list[Shape], 
        subnet_bounds: tuple[int, int, int, int]
    ) -> None:
        """
        EC2 Shape를 Subnet 내부에 배치
        
        그리드 레이아웃 (3열)
        EC2 간 간격: 100px
        
        Args:
            ec2_list: EC2 Shape 목록
            subnet_bounds: Subnet 경계 (x, y, width, height)
        """
        if not ec2_list:
            logger.debug("No EC2 instances to layout")
            return
        
        logger.debug(f"Laying out {len(ec2_list)} EC2 instances in Subnet")
        subnet_x, subnet_y, subnet_width, subnet_height = subnet_bounds
        
        # Subnet 내부 시작 위치 (라벨 공간 고려) - 상대 좌표
        start_x = self.CONTAINER_PADDING
        start_y = self.LABEL_HEIGHT + self.CONTAINER_PADDING
        
        current_x = start_x
        current_y = start_y
        row_height = 0
        
        for i, ec2 in enumerate(ec2_list):
            # 상대 좌표로 설정 (parent가 Subnet이므로)
            ec2.x = current_x
            ec2.y = current_y
            logger.debug(f"EC2 {ec2.id}: positioned at ({ec2.x}, {ec2.y}) relative to Subnet")
            
            # 현재 행의 최대 높이 추적 (EC2는 모두 같은 크기지만 일관성 유지)
            row_height = max(row_height, ec2.height)
            
            # 3열 그리드: 3의 배수면 다음 행으로
            if (i + 1) % self.EC2_COLUMNS == 0:
                # 다음 행으로
                current_x = start_x
                current_y += row_height + self.EC2_SPACING
                row_height = 0
            else:
                # 다음 열로
                current_x += ec2.width + self.EC2_SPACING
