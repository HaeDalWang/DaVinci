"""
EC2 인스턴스를 draw.io Shape로 변환하는 컨버터
"""
from typing import Any
from drawio_generator.models import Shape


class ShapeConverter:
    """
    AWS 리소스를 AWS Architecture Icons 2025 아이콘 Shape로 변환
    """
    
    # AWS Architecture Icons 2025 아이콘 크기
    EC2_WIDTH = 78
    EC2_HEIGHT = 78
    IGW_WIDTH = 78
    IGW_HEIGHT = 78
    NAT_WIDTH = 78
    NAT_HEIGHT = 78
    LB_WIDTH = 78
    LB_HEIGHT = 78
    RDS_WIDTH = 78
    RDS_HEIGHT = 78
    
    def convert_ec2(self, node: dict[str, Any], position: tuple[int, int]) -> Shape:
        """
        EC2 노드를 draw.io Shape로 변환
        
        Args:
            node: EC2 노드 정보 (id, name, private_ip, public_ip 포함)
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
            
        Shape 속성:
            - 아이콘: AWS Architecture Icons 2025 EC2
            - 크기: 78x78 픽셀
            - 라벨: 이름 + private IP (+ public IP if exists)
            - 폰트: 12pt
        """
        node_id = node["id"]
        name = node.get("name", "")
        private_ip = node.get("private_ip", "")
        public_ip = node.get("public_ip")
        parent_id = node.get("parent_id")
        
        # 라벨 생성: 이름 + private IP + public IP (있으면)
        label = self._create_ec2_label(name, private_ip, public_ip)
        
        x, y = position
        
        return Shape(
            id=f"shape-{node_id}",
            node_id=node_id,
            x=x,
            y=y,
            width=self.EC2_WIDTH,
            height=self.EC2_HEIGHT,
            label=label,
            icon_type="ec2",
            parent_id=parent_id
        )
    
    def _create_ec2_label(self, name: str, private_ip: str, public_ip: str | None = None) -> str:
        """
        EC2 라벨 생성
        
        Args:
            name: EC2 인스턴스 이름
            private_ip: Private IP 주소
            public_ip: Public IP 주소 (선택적)
            
        Returns:
            str: 포맷된 라벨 (이름 + private IP + public IP if exists)
        """
        parts = []
        
        if name:
            parts.append(name)
        if private_ip:
            parts.append(private_ip)
        if public_ip:
            parts.append(f"(Public: {public_ip})")
        
        return "\n".join(parts) if parts else ""

    def convert_internet_gateway(self, node: dict[str, Any], position: tuple[int, int]) -> Shape:
        """
        Internet Gateway 노드를 draw.io Shape로 변환
        
        Args:
            node: IGW 노드 정보
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
        """
        node_id = node["id"]
        name = node.get("name", "")
        state = node.get("state", "")
        parent_id = node.get("parent_id")
        
        # 라벨 생성
        label = f"{name}\n{state}" if name else state
        
        x, y = position
        
        return Shape(
            id=f"shape-{node_id}",
            node_id=node_id,
            x=x,
            y=y,
            width=self.IGW_WIDTH,
            height=self.IGW_HEIGHT,
            label=label,
            icon_type="internet_gateway",
            parent_id=parent_id
        )
    
    def convert_nat_gateway(self, node: dict[str, Any], position: tuple[int, int]) -> Shape:
        """
        NAT Gateway 노드를 draw.io Shape로 변환
        
        Args:
            node: NAT Gateway 노드 정보
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
        """
        node_id = node["id"]
        name = node.get("name", "")
        public_ip = node.get("public_ip", "")
        parent_id = node.get("parent_id")
        
        # 라벨 생성
        parts = []
        if name:
            parts.append(name)
        if public_ip:
            parts.append(public_ip)
        
        label = "\n".join(parts) if parts else "NAT Gateway"
        
        x, y = position
        
        return Shape(
            id=f"shape-{node_id}",
            node_id=node_id,
            x=x,
            y=y,
            width=self.NAT_WIDTH,
            height=self.NAT_HEIGHT,
            label=label,
            icon_type="nat_gateway",
            parent_id=parent_id
        )



    def convert_load_balancer(self, node: dict[str, Any], position: tuple[int, int]) -> Shape:
        """
        Load Balancer 노드를 draw.io Shape로 변환
        
        Args:
            node: Load Balancer 노드 정보
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
        """
        node_id = node["id"]
        name = node.get("name", "")
        lb_type = node.get("load_balancer_type", "application")
        scheme = node.get("scheme", "internet-facing")
        parent_id = node.get("parent_id")
        
        # 라벨 생성
        label_parts = []
        if name:
            label_parts.append(name)
        
        # 타입 표시 (ALB/NLB/CLB)
        type_label = {
            'application': 'ALB',
            'network': 'NLB',
            'classic': 'CLB'
        }.get(lb_type, lb_type.upper())
        label_parts.append(f"({type_label})")
        
        # Scheme 표시
        if scheme == 'internal':
            label_parts.append('[Internal]')
        
        label = "\n".join(label_parts) if label_parts else "Load Balancer"
        
        x, y = position
        
        return Shape(
            id=f"shape-{node_id}",
            node_id=node_id,
            x=x,
            y=y,
            width=self.LB_WIDTH,
            height=self.LB_HEIGHT,
            label=label,
            icon_type=f"load_balancer_{lb_type}",  # application, network, classic
            parent_id=parent_id
        )


    def convert_rds(self, node: dict[str, Any], position: tuple[int, int]) -> Shape:
        """
        RDS 노드를 draw.io Shape로 변환
        
        Args:
            node: RDS 노드 정보
            position: (x, y) 좌표
            
        Returns:
            Shape: draw.io Shape 객체
        """
        node_id = node["id"]
        name = node.get("name", "")
        engine = node.get("engine", "")
        db_class = node.get("db_instance_class", "")
        multi_az = node.get("multi_az", False)
        parent_id = node.get("parent_id")
        
        # 라벨 생성
        label_parts = []
        if name:
            label_parts.append(name)
        
        # 엔진 표시
        if engine:
            engine_label = engine.upper()
            if 'mysql' in engine:
                engine_label = 'MySQL'
            elif 'postgres' in engine:
                engine_label = 'PostgreSQL'
            elif 'mariadb' in engine:
                engine_label = 'MariaDB'
            elif 'oracle' in engine:
                engine_label = 'Oracle'
            elif 'sqlserver' in engine:
                engine_label = 'SQL Server'
            elif 'aurora' in engine:
                engine_label = 'Aurora'
            label_parts.append(f"({engine_label})")
        
        # Multi-AZ 표시
        if multi_az:
            label_parts.append("[Multi-AZ]")
        
        label = "\n".join(label_parts) if label_parts else "RDS"
        
        x, y = position
        
        return Shape(
            id=f"shape-{node_id}",
            node_id=node_id,
            x=x,
            y=y,
            width=self.RDS_WIDTH,
            height=self.RDS_HEIGHT,
            label=label,
            icon_type="rds",
            parent_id=parent_id
        )
