"""
draw.io 다이어그램 요소의 자동 레이아웃 엔진
"""
from .models import Shape, Container


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
    
    def layout_vpcs(self, vpcs: list[Container]) -> None:
        """
        VPC Container를 배치
        
        좌측 상단부터 수평으로 배치
        VPC 간 간격: 150px
        
        Args:
            vpcs: VPC Container 목록
        """
        current_x = 40  # 시작 X 좌표
        current_y = 40  # 시작 Y 좌표
        
        for vpc in vpcs:
            vpc.x = current_x
            vpc.y = current_y
            
            # 다음 VPC는 현재 VPC 너비 + 간격만큼 오른쪽에 배치
            current_x += vpc.width + self.VPC_SPACING
    
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
            return
        
        vpc_x, vpc_y, vpc_width, vpc_height = vpc_bounds
        
        # VPC 내부 시작 위치 (라벨 공간 고려)
        start_x = self.CONTAINER_PADDING
        start_y = self.LABEL_HEIGHT + self.CONTAINER_PADDING
        
        current_x = start_x
        current_y = start_y
        row_height = 0
        
        for i, subnet in enumerate(subnets):
            # 상대 좌표로 설정 (VPC 내부)
            subnet.x = current_x
            subnet.y = current_y
            
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
            return
        
        subnet_x, subnet_y, subnet_width, subnet_height = subnet_bounds
        
        # Subnet 내부 시작 위치 (라벨 공간 고려)
        start_x = self.CONTAINER_PADDING
        start_y = self.LABEL_HEIGHT + self.CONTAINER_PADDING
        
        current_x = start_x
        current_y = start_y
        row_height = 0
        
        for i, ec2 in enumerate(ec2_list):
            # 상대 좌표로 설정 (Subnet 내부)
            ec2.x = current_x
            ec2.y = current_y
            
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
