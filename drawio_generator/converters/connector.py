"""
SecurityGroup 규칙을 트래픽 화살표로 변환하는 Converter
"""
from typing import Any
from drawio_generator.models import Connector


class ConnectorConverter:
    """
    SecurityGroup 규칙을 draw.io Connector로 변환
    """
    
    def __init__(self) -> None:
        self._connector_counter = 0
    
    def convert_traffic_edge(
        self,
        edge: dict[str, Any],
        source_ec2_list: list[str],
        target_ec2_list: list[str]
    ) -> list[Connector]:
        """
        allows_traffic 엣지를 EC2 간 Connector로 변환
        
        SecurityGroup 간 allows_traffic 엣지를 받아서,
        해당 SecurityGroup을 사용하는 EC2 인스턴스 간의
        모든 연결선을 생성합니다.
        
        Args:
            edge: allows_traffic 엣지 정보
                - protocol: 프로토콜 (TCP, UDP 등)
                - port: 포트 번호
            source_ec2_list: 소스 SecurityGroup을 사용하는 EC2 ID 목록
            target_ec2_list: 타겟 SecurityGroup을 사용하는 EC2 ID 목록
            
        Returns:
            list[Connector]: EC2 간 Connector 목록
            
        Connector 속성:
            - 스타일: 굵은 실선 화살표
            - 라벨: 프로토콜 + 포트 (예: "TCP:80")
            - 색상: 검은색
        """
        connectors: list[Connector] = []
        
        # 엣지에서 프로토콜과 포트 정보 추출
        protocol = edge.get("protocol", "TCP")
        port = edge.get("port", "")
        
        # 라벨 생성: "프로토콜:포트" 형식
        label = self._create_traffic_label(protocol, port)
        
        # 스타일 생성: 굵은 실선 화살표
        style = self._create_connector_style()
        
        # 소스 EC2와 타겟 EC2 간 모든 조합에 대해 Connector 생성
        for source_ec2_id in source_ec2_list:
            for target_ec2_id in target_ec2_list:
                connector = Connector(
                    id=self._generate_connector_id(),
                    source_id=source_ec2_id,
                    target_id=target_ec2_id,
                    label=label,
                    style=style
                )
                connectors.append(connector)
        
        return connectors
    
    def _create_traffic_label(self, protocol: str, port: str | int) -> str:
        """
        트래픽 라벨 생성
        
        Args:
            protocol: 프로토콜 (TCP, UDP 등)
            port: 포트 번호
            
        Returns:
            str: "프로토콜:포트" 형식의 라벨
        """
        if port:
            return f"{protocol}:{port}"
        return protocol
    
    def _create_connector_style(self) -> str:
        """
        Connector 스타일 생성
        
        굵은 실선 화살표 스타일을 반환합니다.
        
        Returns:
            str: draw.io 스타일 문자열
        """
        return (
            "edgeStyle=orthogonalEdgeStyle;"
            "strokeWidth=2;"
            "strokeColor=#000000;"
            "endArrow=classic;"
            "html=1;"
        )
    
    def _generate_connector_id(self) -> str:
        """
        고유한 Connector ID 생성
        
        Returns:
            str: "connector-{번호}" 형식의 ID
        """
        self._connector_counter += 1
        return f"connector-{self._connector_counter}"
