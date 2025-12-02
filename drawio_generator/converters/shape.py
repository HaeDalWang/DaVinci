"""
EC2 인스턴스를 draw.io Shape로 변환하는 컨버터
"""
from typing import Any
from drawio_generator.models import Shape


class ShapeConverter:
    """
    EC2 인스턴스를 AWS Architecture Icons 2025 아이콘 Shape로 변환
    """
    
    # AWS Architecture Icons 2025 EC2 아이콘 크기
    EC2_WIDTH = 78
    EC2_HEIGHT = 78
    
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
