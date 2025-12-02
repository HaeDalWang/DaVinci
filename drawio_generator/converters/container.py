"""
VPC와 Subnet을 draw.io Container로 변환하는 컨버터
"""
from typing import Any
from drawio_generator.models import Container


class ContainerConverter:
    """
    VPC와 Subnet을 AWS Architecture Icons 2025 Groups 아이콘으로 변환
    """
    
    # 기본 크기 (멤버에 따라 자동 조정됨)
    DEFAULT_VPC_WIDTH = 800
    DEFAULT_VPC_HEIGHT = 600
    DEFAULT_SUBNET_WIDTH = 360
    DEFAULT_SUBNET_HEIGHT = 300
    
    # AWS Architecture Icons 2025 색상
    VPC_STROKE_COLOR = "#248814"  # 녹색
    SUBNET_STROKE_COLOR = "#147EBA"  # 파란색
    TRANSPARENT_BACKGROUND = "none"
    
    def convert_vpc(
        self,
        group: dict[str, Any],
        subnets: list[dict[str, Any]],
        position: tuple[int, int] = (40, 40)
    ) -> Container:
        """
        VPC 그룹을 draw.io AWS VPC Group으로 변환
        
        Args:
            group: VPC 그룹 정보 (id, name, cidr 포함)
            subnets: VPC에 속한 Subnet 목록
            position: (x, y) 좌표
            
        Returns:
            Container: draw.io Container 객체
            
        Container 속성:
            - 아이콘: mxgraph.aws4.group_vpc
            - 테두리 색상: 녹색 (#248814)
            - 배경: 투명
            - 라벨: VPC 이름 + CIDR
        """
        vpc_id = group["id"]
        name = group.get("name", "")
        cidr = group.get("cidr", "")
        
        # 라벨 생성: VPC 이름 + CIDR
        label = self._create_container_label(name, cidr)
        
        # 자식 요소 ID 목록 생성
        children = [f"container-{subnet['id']}" for subnet in subnets]
        
        # 크기는 멤버 수에 따라 조정 (기본값 사용)
        width = self.DEFAULT_VPC_WIDTH
        height = self.DEFAULT_VPC_HEIGHT
        
        x, y = position
        
        return Container(
            id=f"container-{vpc_id}",
            node_id=vpc_id,
            x=x,
            y=y,
            width=width,
            height=height,
            label=label,
            container_type="vpc",
            background_color=self.TRANSPARENT_BACKGROUND,
            parent_id=None,
            children=children
        )
    
    def convert_subnet(
        self,
        node: dict[str, Any],
        ec2_instances: list[dict[str, Any]],
        position: tuple[int, int] = (20, 60),
        parent_vpc_id: str | None = None
    ) -> Container:
        """
        Subnet 노드를 draw.io AWS Subnet Group으로 변환
        
        Args:
            node: Subnet 노드 정보 (id, name, cidr 포함)
            ec2_instances: Subnet에 속한 EC2 목록
            position: (x, y) 좌표
            parent_vpc_id: 부모 VPC ID
            
        Returns:
            Container: draw.io Container 객체
            
        Container 속성:
            - 아이콘: mxgraph.aws4.group_subnet
            - 테두리 색상: 파란색 (#147EBA)
            - 배경: 투명
            - 라벨: Subnet 이름 + CIDR
        """
        subnet_id = node["id"]
        name = node.get("name", "")
        cidr = node.get("cidr", "")
        
        # 라벨 생성: Subnet 이름 + CIDR
        label = self._create_container_label(name, cidr)
        
        # 자식 요소 ID 목록 생성
        children = [f"shape-{ec2['id']}" for ec2 in ec2_instances]
        
        # 크기는 멤버 수에 따라 조정 (기본값 사용)
        width = self.DEFAULT_SUBNET_WIDTH
        height = self.DEFAULT_SUBNET_HEIGHT
        
        x, y = position
        
        # parent_id 설정
        parent_id = f"container-{parent_vpc_id}" if parent_vpc_id else None
        
        return Container(
            id=f"container-{subnet_id}",
            node_id=subnet_id,
            x=x,
            y=y,
            width=width,
            height=height,
            label=label,
            container_type="subnet",
            background_color=self.TRANSPARENT_BACKGROUND,
            parent_id=parent_id,
            children=children
        )
    
    def _create_container_label(self, name: str, cidr: str) -> str:
        """
        Container 라벨 생성
        
        Args:
            name: VPC/Subnet 이름
            cidr: CIDR 블록
            
        Returns:
            str: 포맷된 라벨 (이름 + CIDR)
        """
        if name and cidr:
            return f"{name}\n{cidr}"
        elif name:
            return name
        elif cidr:
            return cidr
        else:
            return ""
