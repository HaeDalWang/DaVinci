"""
draw.io XML 생성기

Shape, Container, Connector를 draw.io XML 형식으로 변환합니다.
"""
import xml.etree.ElementTree as ET
from xml.dom import minidom

from drawio_generator.models import Shape, Container, Connector


class XMLBuilder:
    """
    draw.io XML 구조를 생성하는 클래스
    
    Shape, Container, Connector를 mxCell로 변환하고
    draw.io 표준 형식의 XML을 생성합니다.
    """
    
    def __init__(self) -> None:
        """XMLBuilder 초기화"""
        self._cell_counter = 2  # 0과 1은 루트 셀로 예약됨
    
    def build(
        self,
        shapes: list[Shape],
        containers: list[Container],
        connectors: list[Connector]
    ) -> str:
        """
        draw.io XML 생성
        
        Args:
            shapes: EC2 Shape 목록
            containers: VPC/Subnet Container 목록
            connectors: 트래픽 Connector 목록
            
        Returns:
            str: UTF-8 인코딩된 draw.io XML 문자열
        """
        # 루트 요소 생성
        mxfile = ET.Element('mxfile', host="app.diagrams.net")
        diagram = ET.SubElement(mxfile, 'diagram', name="AWS Architecture")
        mxGraphModel = ET.SubElement(
            diagram,
            'mxGraphModel',
            dx="1422",
            dy="794",
            grid="1",
            gridSize="10"
        )
        root = ET.SubElement(mxGraphModel, 'root')
        
        # 기본 셀 생성 (id="0", id="1")
        cell0 = ET.SubElement(root, 'mxCell')
        cell0.set('id', '0')
        
        cell1 = ET.SubElement(root, 'mxCell')
        cell1.set('id', '1')
        cell1.set('parent', '0')
        
        # Container 먼저 생성 (VPC, Subnet)
        for container in containers:
            self._create_container_cell(root, container)
        
        # Shape 생성 (EC2)
        for shape in shapes:
            self._create_shape_cell(root, shape)
        
        # Connector 생성 (트래픽 화살표)
        for connector in connectors:
            self._create_connector_cell(root, connector)
        
        # XML을 문자열로 변환 (UTF-8, 압축되지 않은 형식)
        return self._prettify_xml(mxfile)
    
    def _create_container_cell(self, root: ET.Element, container: Container) -> None:
        """
        Container를 mxCell로 변환
        
        Args:
            root: XML 루트 요소
            container: Container 객체
        """
        # Container 타입에 따른 스타일 결정
        if container.container_type == "vpc":
            style = self._get_vpc_style()
        elif container.container_type == "subnet":
            style = self._get_subnet_style()
        else:
            style = ""
        
        # parent 결정
        parent_id = container.parent_id if container.parent_id else "1"
        
        # mxCell 생성
        cell = ET.SubElement(root, 'mxCell')
        cell.set('id', container.id)
        cell.set('value', container.label)
        cell.set('style', style)
        cell.set('vertex', '1')
        cell.set('parent', parent_id)
        
        # geometry 추가
        geometry = ET.SubElement(cell, 'mxGeometry')
        geometry.set('x', str(container.x))
        geometry.set('y', str(container.y))
        geometry.set('width', str(container.width))
        geometry.set('height', str(container.height))
        geometry.set('as', 'geometry')
    
    def _create_shape_cell(self, root: ET.Element, shape: Shape) -> None:
        """
        Shape를 mxCell로 변환
        
        Args:
            root: XML 루트 요소
            shape: Shape 객체
        """
        # EC2 아이콘 스타일
        style = self._get_ec2_style()
        
        # parent 결정
        parent_id = shape.parent_id if shape.parent_id else "1"
        
        # mxCell 생성
        cell = ET.SubElement(root, 'mxCell')
        cell.set('id', shape.id)
        cell.set('value', shape.label)
        cell.set('style', style)
        cell.set('vertex', '1')
        cell.set('parent', parent_id)
        
        # geometry 추가
        geometry = ET.SubElement(cell, 'mxGeometry')
        geometry.set('x', str(shape.x))
        geometry.set('y', str(shape.y))
        geometry.set('width', str(shape.width))
        geometry.set('height', str(shape.height))
        geometry.set('as', 'geometry')
    
    def _create_connector_cell(self, root: ET.Element, connector: Connector) -> None:
        """
        Connector를 mxCell로 변환
        
        Args:
            root: XML 루트 요소
            connector: Connector 객체
        """
        # mxCell 생성
        cell = ET.SubElement(root, 'mxCell')
        cell.set('id', connector.id)
        cell.set('value', connector.label)
        cell.set('style', connector.style)
        cell.set('edge', '1')
        cell.set('parent', '1')
        cell.set('source', connector.source_id)
        cell.set('target', connector.target_id)
        
        # geometry 추가
        geometry = ET.SubElement(cell, 'mxGeometry')
        geometry.set('relative', '1')
        geometry.set('as', 'geometry')
    
    def _get_ec2_style(self) -> str:
        """
        EC2 아이콘 스타일 문자열 생성
        
        Returns:
            str: AWS Architecture Icons 2025 EC2 스타일
        """
        return (
            "shape=mxgraph.aws4.resourceIcon;"
            "resIcon=mxgraph.aws4.ec2;"
            "strokeColor=#ffffff;"
            "fillColor=#ED7100;"
            "verticalLabelPosition=bottom;"
            "verticalAlign=top;"
        )
    
    def _get_vpc_style(self) -> str:
        """
        VPC 그룹 아이콘 스타일 문자열 생성
        
        Returns:
            str: AWS Architecture Icons 2025 VPC Group 스타일
        """
        return (
            "shape=mxgraph.aws4.group;"
            "grIcon=mxgraph.aws4.group_vpc;"
            "strokeColor=#248814;"
            "fillColor=none;"
            "verticalAlign=top;"
        )
    
    def _get_subnet_style(self) -> str:
        """
        Subnet 그룹 아이콘 스타일 문자열 생성
        
        Returns:
            str: AWS Architecture Icons 2025 Subnet Group 스타일
        """
        return (
            "shape=mxgraph.aws4.group;"
            "grIcon=mxgraph.aws4.group_subnet;"
            "strokeColor=#147EBA;"
            "fillColor=none;"
            "verticalAlign=top;"
        )
    
    def _prettify_xml(self, elem: ET.Element) -> str:
        """
        XML을 읽기 좋은 형식으로 변환 (UTF-8 인코딩)
        
        Args:
            elem: XML 요소
            
        Returns:
            str: 포맷팅된 XML 문자열
        """
        # ElementTree를 문자열로 변환
        rough_string = ET.tostring(elem, encoding='utf-8')
        
        # minidom으로 예쁘게 포맷팅
        reparsed = minidom.parseString(rough_string)
        pretty_xml = reparsed.toprettyxml(indent="  ", encoding='utf-8')
        
        # UTF-8 문자열로 디코딩
        return pretty_xml.decode('utf-8')
