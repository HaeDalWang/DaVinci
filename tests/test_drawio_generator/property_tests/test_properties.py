"""
draw.io 생성기 Property-Based 테스트

각 property test는 설계 문서의 correctness property를 검증합니다.
"""
import pytest
from hypothesis import given, settings, HealthCheck

from drawio_generator.converters.shape import ShapeConverter
from drawio_generator.converters.container import ContainerConverter
from drawio_generator.converters.connector import ConnectorConverter
from drawio_generator.layout import LayoutEngine
from drawio_generator.models import Shape, Container, Connector
from tests.test_drawio_generator.property_tests.generators import (
    ec2_nodes, 
    positions, 
    vpc_groups, 
    subnet_lists,
    subnet_nodes,
    ec2_lists,
    vpc_ids,
    traffic_edges,
    ec2_id_lists,
    shape_lists,
    container_lists,
    bounds,
    connector_lists,
    security_group_nodes,
    graph_with_security_groups,
    graph_with_structural_edges
)


class TestXMLBuilderProperties:
    """XMLBuilder의 correctness properties 검증"""
    
    @given(
        shapes=shape_lists(),
        containers=container_lists(),
        connectors=connector_lists()
    )
    @settings(max_examples=100)
    def test_property_1_xml_parseable(self, shapes, containers, connectors):
        """
        Feature: drawio-generator, Property 1: XML 파싱 가능성
        
        *For any* 생성된 XML, draw.io 애플리케이션에서 파싱 가능해야 한다.
        
        **Validates: Requirements 7.1, 7.2**
        """
        from drawio_generator.xml_builder import XMLBuilder
        import xml.etree.ElementTree as ET
        from hypothesis import assume
        
        # ID 충돌 방지: Shape와 Container의 ID가 겹치지 않아야 함
        shape_ids = {s.id for s in shapes}
        container_ids = {c.id for c in containers}
        connector_ids = {c.id for c in connectors}
        
        # 모든 ID가 고유해야 함 (Shape, Container, Connector 간에도)
        all_ids = shape_ids | container_ids | connector_ids
        assume(len(all_ids) == len(shapes) + len(containers) + len(connectors))
        
        # 예약된 ID('0', '1')와 충돌하지 않아야 함
        assume('0' not in all_ids and '1' not in all_ids)
        
        builder = XMLBuilder()
        
        # XML 생성
        xml_string = builder.build(shapes, containers, connectors)
        
        # XML 문자열이 비어있지 않아야 함
        assert xml_string, "생성된 XML이 비어있으면 안 됨"
        
        # XML 파싱 가능 여부 검증
        try:
            root = ET.fromstring(xml_string)
        except ET.ParseError as e:
            pytest.fail(f"XML 파싱 실패: {e}")
        
        # 루트 요소가 mxfile이어야 함
        assert root.tag == "mxfile", "루트 요소는 'mxfile'이어야 함"
        
        # diagram 요소가 존재해야 함
        diagram = root.find("diagram")
        assert diagram is not None, "diagram 요소가 존재해야 함"
        
        # mxGraphModel 요소가 존재해야 함
        mxGraphModel = diagram.find("mxGraphModel")
        assert mxGraphModel is not None, "mxGraphModel 요소가 존재해야 함"
        
        # root 요소가 존재해야 함
        graph_root = mxGraphModel.find("root")
        assert graph_root is not None, "root 요소가 존재해야 함"
        
        # 기본 셀 (id="0", id="1")이 존재해야 함
        cells = graph_root.findall("mxCell")
        assert len(cells) >= 2, "최소 2개의 기본 셀이 존재해야 함"
        
        cell_ids = [cell.get("id") for cell in cells]
        assert "0" in cell_ids, "id='0' 셀이 존재해야 함"
        assert "1" in cell_ids, "id='1' 셀이 존재해야 함"
        
        # 모든 mxCell 수집 (id="0", id="1" 제외)
        all_cells = [cell for cell in cells if cell.get("id") not in ["0", "1"]]
        
        # vertex 셀과 edge 셀 분리
        vertex_cells = [cell for cell in all_cells if cell.get("vertex") == "1"]
        edge_cells = [cell for cell in all_cells if cell.get("edge") == "1"]
        
        # Shape + Container 개수와 vertex 셀 개수가 일치해야 함
        expected_vertex_count = len(shapes) + len(containers)
        assert len(vertex_cells) == expected_vertex_count, \
            f"vertex 셀 개수가 일치해야 함 (예상: {expected_vertex_count}, 실제: {len(vertex_cells)})"
        
        # Connector 개수와 edge 셀 개수가 일치해야 함
        assert len(edge_cells) == len(connectors), \
            f"edge 셀 개수가 일치해야 함 (예상: {len(connectors)}, 실제: {len(edge_cells)})"
        
        # 모든 vertex 셀이 geometry를 가져야 함
        for cell in vertex_cells:
            geometry = cell.find("mxGeometry")
            assert geometry is not None, f"셀 {cell.get('id')}는 geometry를 가져야 함"
            
            # geometry 속성 검증
            assert geometry.get("x") is not None, "X 좌표가 있어야 함"
            assert geometry.get("y") is not None, "Y 좌표가 있어야 함"
            assert geometry.get("width") is not None, "너비가 있어야 함"
            assert geometry.get("height") is not None, "높이가 있어야 함"
            assert geometry.get("as") == "geometry", "as 속성이 'geometry'여야 함"
        
        # 모든 edge 셀이 geometry를 가져야 함
        for cell in edge_cells:
            # source와 target이 설정되어야 함
            assert cell.get("source") is not None, f"셀 {cell.get('id')}는 source를 가져야 함"
            assert cell.get("target") is not None, f"셀 {cell.get('id')}는 target을 가져야 함"
            
            # geometry가 있어야 함
            geometry = cell.find("mxGeometry")
            assert geometry is not None, f"셀 {cell.get('id')}는 geometry를 가져야 함"
            assert geometry.get("relative") == "1", "Connector geometry는 relative여야 함"
            assert geometry.get("as") == "geometry", "as 속성이 'geometry'여야 함"
        
        # UTF-8 인코딩 확인
        assert "encoding='utf-8'" in xml_string.lower() or "encoding=\"utf-8\"" in xml_string.lower(), \
            "XML은 UTF-8 인코딩을 명시해야 함"
    
    @given(
        shapes=shape_lists(),
        containers=container_lists(),
        connectors=connector_lists()
    )
    @settings(max_examples=100)
    def test_property_13_xml_format_compliance(self, shapes, containers, connectors):
        """
        Feature: drawio-generator, Property 13: XML 형식 준수
        
        *For any* 생성된 XML, draw.io 표준 형식을 준수하고 UTF-8 인코딩을 사용해야 한다.
        
        **Validates: Requirements 7.1, 7.2, 7.3**
        """
        from drawio_generator.xml_builder import XMLBuilder
        import xml.etree.ElementTree as ET
        from hypothesis import assume
        
        # ID 충돌 방지
        shape_ids = {s.id for s in shapes}
        container_ids = {c.id for c in containers}
        connector_ids = {c.id for c in connectors}
        
        all_ids = shape_ids | container_ids | connector_ids
        assume(len(all_ids) == len(shapes) + len(containers) + len(connectors))
        assume('0' not in all_ids and '1' not in all_ids)
        
        # 참조 무결성을 위해 parent_id를 None으로 설정 (모든 요소가 최상위 레벨)
        for shape in shapes:
            shape.parent_id = None
        
        for container in containers:
            container.parent_id = None
        
        # connector의 source/target을 유효한 ID로 설정
        valid_shape_and_container_ids = list(shape_ids | container_ids)
        if len(valid_shape_and_container_ids) >= 2:
            for i, connector in enumerate(connectors):
                # 순환 참조를 피하기 위해 서로 다른 ID 사용
                connector.source_id = valid_shape_and_container_ids[i % len(valid_shape_and_container_ids)]
                connector.target_id = valid_shape_and_container_ids[(i + 1) % len(valid_shape_and_container_ids)]
        else:
            # 유효한 ID가 2개 미만이면 connector를 비움
            connectors.clear()
        
        builder = XMLBuilder()
        xml_string = builder.build(shapes, containers, connectors)
        
        # 1. XML 선언 검증 (UTF-8 인코딩)
        assert xml_string.startswith('<?xml'), "XML 선언으로 시작해야 함"
        assert "encoding='utf-8'" in xml_string.lower() or "encoding=\"utf-8\"" in xml_string.lower(), \
            "UTF-8 인코딩을 명시해야 함"
        
        # 2. 압축되지 않은 형식 검증 (압축된 경우 base64 인코딩된 문자열이 포함됨)
        # draw.io는 압축 시 diagram 요소에 compressed="true" 속성을 추가하고 내용을 base64로 인코딩
        assert "compressed=" not in xml_string, "압축되지 않은 형식이어야 함"
        
        # 3. draw.io 표준 구조 검증
        root = ET.fromstring(xml_string)
        
        # 3.1. 루트 요소는 mxfile
        assert root.tag == "mxfile", "루트 요소는 'mxfile'이어야 함"
        
        # 3.2. mxfile 속성 검증
        assert root.get("host") is not None, "mxfile은 host 속성을 가져야 함"
        
        # 3.3. diagram 요소 존재
        diagram = root.find("diagram")
        assert diagram is not None, "diagram 요소가 존재해야 함"
        assert diagram.get("name") is not None, "diagram은 name 속성을 가져야 함"
        
        # 3.4. mxGraphModel 요소 존재 및 속성 검증
        mxGraphModel = diagram.find("mxGraphModel")
        assert mxGraphModel is not None, "mxGraphModel 요소가 존재해야 함"
        assert mxGraphModel.get("dx") is not None, "mxGraphModel은 dx 속성을 가져야 함"
        assert mxGraphModel.get("dy") is not None, "mxGraphModel은 dy 속성을 가져야 함"
        assert mxGraphModel.get("grid") is not None, "mxGraphModel은 grid 속성을 가져야 함"
        assert mxGraphModel.get("gridSize") is not None, "mxGraphModel은 gridSize 속성을 가져야 함"
        
        # 3.5. root 요소 존재
        graph_root = mxGraphModel.find("root")
        assert graph_root is not None, "root 요소가 존재해야 함"
        
        # 3.6. 기본 셀 (id="0", id="1") 검증
        cells = graph_root.findall("mxCell")
        assert len(cells) >= 2, "최소 2개의 기본 셀이 존재해야 함"
        
        cell_ids = [cell.get("id") for cell in cells]
        assert "0" in cell_ids, "id='0' 셀이 존재해야 함"
        assert "1" in cell_ids, "id='1' 셀이 존재해야 함"
        
        # id="0" 셀 검증
        cell_0 = next(cell for cell in cells if cell.get("id") == "0")
        assert cell_0.get("parent") is None, "id='0' 셀은 parent가 없어야 함"
        
        # id="1" 셀 검증
        cell_1 = next(cell for cell in cells if cell.get("id") == "1")
        assert cell_1.get("parent") == "0", "id='1' 셀의 parent는 '0'이어야 함"
        
        # 4. 모든 vertex 셀 검증
        vertex_cells = [cell for cell in cells if cell.get("vertex") == "1"]
        for cell in vertex_cells:
            # 필수 속성 검증
            assert cell.get("id") is not None, "vertex 셀은 id를 가져야 함"
            assert cell.get("parent") is not None, "vertex 셀은 parent를 가져야 함"
            assert cell.get("vertex") == "1", "vertex 속성이 '1'이어야 함"
            
            # geometry 검증
            geometry = cell.find("mxGeometry")
            assert geometry is not None, "vertex 셀은 geometry를 가져야 함"
            assert geometry.get("x") is not None, "geometry는 x를 가져야 함"
            assert geometry.get("y") is not None, "geometry는 y를 가져야 함"
            assert geometry.get("width") is not None, "geometry는 width를 가져야 함"
            assert geometry.get("height") is not None, "geometry는 height를 가져야 함"
            assert geometry.get("as") == "geometry", "geometry의 as 속성은 'geometry'여야 함"
            
            # style 검증 (비어있지 않아야 함)
            style = cell.get("style")
            assert style is not None and style != "", "vertex 셀은 style을 가져야 함"
        
        # 5. 모든 edge 셀 검증
        edge_cells = [cell for cell in cells if cell.get("edge") == "1"]
        for cell in edge_cells:
            # 필수 속성 검증
            assert cell.get("id") is not None, "edge 셀은 id를 가져야 함"
            assert cell.get("parent") is not None, "edge 셀은 parent를 가져야 함"
            assert cell.get("edge") == "1", "edge 속성이 '1'이어야 함"
            assert cell.get("source") is not None, "edge 셀은 source를 가져야 함"
            assert cell.get("target") is not None, "edge 셀은 target를 가져야 함"
            
            # geometry 검증
            geometry = cell.find("mxGeometry")
            assert geometry is not None, "edge 셀은 geometry를 가져야 함"
            assert geometry.get("relative") == "1", "edge geometry는 relative='1'이어야 함"
            assert geometry.get("as") == "geometry", "geometry의 as 속성은 'geometry'여야 함"
            
            # style 검증
            style = cell.get("style")
            assert style is not None and style != "", "edge 셀은 style을 가져야 함"
        
        # 6. 모든 ID가 고유한지 검증
        all_cell_ids = [cell.get("id") for cell in cells]
        assert len(all_cell_ids) == len(set(all_cell_ids)), "모든 셀 ID는 고유해야 함"
        
        # 7. parent 참조 무결성 검증
        valid_parent_ids = set(all_cell_ids)
        for cell in cells:
            parent_id = cell.get("parent")
            if parent_id is not None:
                assert parent_id in valid_parent_ids, \
                    f"셀 {cell.get('id')}의 parent '{parent_id}'가 존재하지 않음"
        
        # 8. edge의 source/target 참조 무결성 검증
        for cell in edge_cells:
            source_id = cell.get("source")
            target_id = cell.get("target")
            assert source_id in valid_parent_ids, \
                f"edge {cell.get('id')}의 source '{source_id}'가 존재하지 않음"
            assert target_id in valid_parent_ids, \
                f"edge {cell.get('id')}의 target '{target_id}'가 존재하지 않음"


class TestShapeConverterProperties:
    """ShapeConverter의 correctness properties 검증"""
    
    @given(node=ec2_nodes(), position=positions())
    @settings(max_examples=100)
    def test_property_2_ec2_represented_as_icon(self, node, position):
        """
        Feature: drawio-generator, Property 2: EC2는 아이콘으로 표현
        
        *For any* EC2 노드, draw.io Shape로 변환되고 
        AWS Architecture Icons 2025 EC2 아이콘을 사용해야 한다.
        
        **Validates: Requirements 2.1, 2.2**
        """
        converter = ShapeConverter()
        
        # EC2 노드를 Shape로 변환
        shape = converter.convert_ec2(node, position)
        
        # Shape 객체가 생성되어야 함
        assert isinstance(shape, Shape), "EC2 노드는 Shape 객체로 변환되어야 함"
        
        # AWS Architecture Icons 2025 EC2 아이콘 사용 (icon_type이 'ec2')
        assert shape.icon_type == "ec2", "EC2 아이콘 타입이어야 함"
        
        # 아이콘 크기는 78x78 픽셀
        assert shape.width == 78, "EC2 아이콘 너비는 78px이어야 함"
        assert shape.height == 78, "EC2 아이콘 높이는 78px이어야 함"
        
        # 원본 노드 ID 보존
        assert shape.node_id == node["id"], "원본 노드 ID가 보존되어야 함"
        
        # 위치 정보 보존
        x, y = position
        assert shape.x == x, "X 좌표가 보존되어야 함"
        assert shape.y == y, "Y 좌표가 보존되어야 함"
        
        # 라벨에 이름 또는 private IP가 포함되어야 함
        name = node.get("name", "")
        private_ip = node.get("private_ip", "")
        
        if name:
            assert name in shape.label, "라벨에 이름이 포함되어야 함"
        if private_ip:
            assert private_ip in shape.label, "라벨에 private IP가 포함되어야 함"



class TestContainerConverterProperties:
    """ContainerConverter의 correctness properties 검증"""
    
    @given(vpc_group=vpc_groups(), subnets=subnet_lists(), position=positions())
    @settings(max_examples=100)
    def test_property_3_vpc_represented_as_aws_vpc_group(self, vpc_group, subnets, position):
        """
        Feature: drawio-generator, Property 3: VPC는 AWS VPC Group으로 표현
        
        *For any* VPC 그룹, draw.io AWS VPC Group 아이콘(mxgraph.aws4.group_vpc)으로 
        변환되어야 한다.
        
        **Validates: Requirements 2.4, 5.1, 5.2**
        """
        converter = ContainerConverter()
        
        # VPC 그룹을 Container로 변환
        container = converter.convert_vpc(vpc_group, subnets, position=position)
        
        # Container 객체가 생성되어야 함
        assert isinstance(container, Container), "VPC 그룹은 Container 객체로 변환되어야 함"
        
        # Container 타입이 'vpc'여야 함
        assert container.container_type == "vpc", "Container 타입은 'vpc'여야 함"
        
        # 원본 노드 ID 보존
        assert container.node_id == vpc_group["id"], "원본 VPC ID가 보존되어야 함"
        
        # 위치 정보 보존
        x, y = position
        assert container.x == x, "X 좌표가 보존되어야 함"
        assert container.y == y, "Y 좌표가 보존되어야 함"
        
        # 배경색은 투명 (none)
        assert container.background_color == "none", "VPC 배경색은 투명(none)이어야 함"
        
        # 부모 ID는 None (VPC는 최상위)
        assert container.parent_id is None, "VPC는 부모가 없어야 함"
        
        # 자식 목록에 모든 subnet이 포함되어야 함
        assert len(container.children) == len(subnets), "자식 개수가 subnet 개수와 일치해야 함"
        for subnet in subnets:
            expected_child_id = f"container-{subnet['id']}"
            assert expected_child_id in container.children, f"자식 목록에 {expected_child_id}가 포함되어야 함"
        
        # 라벨에 이름 또는 CIDR이 포함되어야 함
        name = vpc_group.get("name", "")
        cidr = vpc_group.get("cidr", "")
        
        if name:
            assert name in container.label, "라벨에 VPC 이름이 포함되어야 함"
        if cidr:
            assert cidr in container.label, "라벨에 CIDR이 포함되어야 함"
    
    @given(subnet_node=subnet_nodes(), ec2_instances=ec2_lists(), position=positions(), parent_vpc_id=vpc_ids())
    @settings(max_examples=100)
    def test_property_4_subnet_represented_as_aws_subnet_group_inside_vpc(
        self, subnet_node, ec2_instances, position, parent_vpc_id
    ):
        """
        Feature: drawio-generator, Property 4: Subnet은 VPC 내부 AWS Subnet Group으로 표현
        
        *For any* Subnet 노드, VPC Group 내부에 중첩된 AWS Subnet Group 아이콘
        (mxgraph.aws4.group_subnet)으로 변환되어야 한다.
        
        **Validates: Requirements 2.5, 5.3, 5.4**
        """
        converter = ContainerConverter()
        
        # Subnet 노드를 Container로 변환
        container = converter.convert_subnet(
            subnet_node, 
            ec2_instances, 
            position=position,
            parent_vpc_id=parent_vpc_id
        )
        
        # Container 객체가 생성되어야 함
        assert isinstance(container, Container), "Subnet 노드는 Container 객체로 변환되어야 함"
        
        # Container 타입이 'subnet'이어야 함
        assert container.container_type == "subnet", "Container 타입은 'subnet'이어야 함"
        
        # 원본 노드 ID 보존
        assert container.node_id == subnet_node["id"], "원본 Subnet ID가 보존되어야 함"
        
        # 위치 정보 보존
        x, y = position
        assert container.x == x, "X 좌표가 보존되어야 함"
        assert container.y == y, "Y 좌표가 보존되어야 함"
        
        # 배경색은 투명 (none)
        assert container.background_color == "none", "Subnet 배경색은 투명(none)이어야 함"
        
        # 부모 ID 검증 (VPC 내부에 중첩)
        if parent_vpc_id:
            expected_parent_id = f"container-{parent_vpc_id}"
            assert container.parent_id == expected_parent_id, f"부모 ID는 {expected_parent_id}여야 함"
        else:
            assert container.parent_id is None, "부모 VPC ID가 없으면 parent_id는 None이어야 함"
        
        # 자식 목록에 모든 EC2가 포함되어야 함
        assert len(container.children) == len(ec2_instances), "자식 개수가 EC2 개수와 일치해야 함"
        for ec2 in ec2_instances:
            expected_child_id = f"shape-{ec2['id']}"
            assert expected_child_id in container.children, f"자식 목록에 {expected_child_id}가 포함되어야 함"
        
        # 라벨에 이름 또는 CIDR이 포함되어야 함
        name = subnet_node.get("name", "")
        cidr = subnet_node.get("cidr", "")
        
        if name:
            assert name in container.label, "라벨에 Subnet 이름이 포함되어야 함"
        if cidr:
            assert cidr in container.label, "라벨에 CIDR이 포함되어야 함"


class TestConnectorConverterProperties:
    """ConnectorConverter의 correctness properties 검증"""
    
    @given(
        edge=traffic_edges(),
        source_ec2_list=ec2_id_lists(),
        target_ec2_list=ec2_id_lists()
    )
    @settings(max_examples=100)
    def test_property_7_traffic_edge_creates_ec2_connectors(
        self, edge, source_ec2_list, target_ec2_list
    ):
        """
        Feature: drawio-generator, Property 7: 트래픽 엣지는 EC2 간 연결선
        
        *For any* allows_traffic 엣지, 해당 SecurityGroup을 사용하는 
        EC2 인스턴스 간 Connector를 생성해야 한다.
        
        **Validates: Requirements 4.1, 4.2, 4.4**
        """
        converter = ConnectorConverter()
        
        # allows_traffic 엣지를 EC2 간 Connector로 변환
        connectors = converter.convert_traffic_edge(
            edge, 
            source_ec2_list, 
            target_ec2_list
        )
        
        # Connector 목록이 생성되어야 함
        assert isinstance(connectors, list), "Connector 목록이 반환되어야 함"
        
        # 모든 소스-타겟 조합에 대해 Connector가 생성되어야 함
        expected_count = len(source_ec2_list) * len(target_ec2_list)
        assert len(connectors) == expected_count, \
            f"Connector 개수는 {expected_count}개여야 함 (소스 {len(source_ec2_list)} × 타겟 {len(target_ec2_list)})"
        
        # 모든 Connector가 Connector 객체여야 함
        for connector in connectors:
            assert isinstance(connector, Connector), "각 항목은 Connector 객체여야 함"
        
        # 모든 소스-타겟 조합이 존재하는지 확인
        connector_pairs = {(c.source_id, c.target_id) for c in connectors}
        expected_pairs = {
            (source, target) 
            for source in source_ec2_list 
            for target in target_ec2_list
        }
        assert connector_pairs == expected_pairs, \
            "모든 소스-타겟 EC2 조합에 대해 Connector가 생성되어야 함"
        
        # 모든 Connector가 굵은 실선 화살표 스타일을 가져야 함
        for connector in connectors:
            assert "strokeWidth=2" in connector.style, "굵은 선(strokeWidth=2)이어야 함"
            assert "endArrow=classic" in connector.style, "화살표(endArrow=classic)가 있어야 함"
            assert "strokeColor" in connector.style, "선 색상이 지정되어야 함"
        
        # 모든 Connector가 프로토콜 정보를 라벨로 포함해야 함
        protocol = edge.get("protocol", "TCP")
        port = edge.get("port", "")
        
        for connector in connectors:
            assert protocol in connector.label, f"라벨에 프로토콜 '{protocol}'이 포함되어야 함"
            
            # 포트가 있으면 라벨에 포함되어야 함
            if port:
                assert str(port) in connector.label, f"라벨에 포트 '{port}'가 포함되어야 함"
        
        # 모든 Connector ID가 고유해야 함
        connector_ids = [c.id for c in connectors]
        assert len(connector_ids) == len(set(connector_ids)), "모든 Connector ID는 고유해야 함"
    
    @given(
        edge=traffic_edges(),
        source_ec2_list=ec2_id_lists(),
        target_ec2_list=ec2_id_lists()
    )
    @settings(max_examples=100)
    def test_property_8_traffic_label_included(
        self, edge, source_ec2_list, target_ec2_list
    ):
        """
        Feature: drawio-generator, Property 8: 트래픽 라벨 포함
        
        *For any* 트래픽 Connector, 프로토콜과 포트 정보를 라벨로 포함해야 한다.
        
        **Validates: Requirements 4.3**
        """
        converter = ConnectorConverter()
        
        # allows_traffic 엣지를 EC2 간 Connector로 변환
        connectors = converter.convert_traffic_edge(
            edge, 
            source_ec2_list, 
            target_ec2_list
        )
        
        # Connector가 생성되어야 함
        assert len(connectors) > 0, "최소 하나의 Connector가 생성되어야 함"
        
        # 엣지에서 프로토콜과 포트 정보 추출
        protocol = edge.get("protocol", "TCP")
        port = edge.get("port", "")
        
        # 모든 Connector의 라벨 검증
        for connector in connectors:
            # 라벨이 비어있지 않아야 함
            assert connector.label, "Connector 라벨이 비어있으면 안 됨"
            
            # 프로토콜이 라벨에 포함되어야 함
            assert protocol in connector.label, \
                f"라벨 '{connector.label}'에 프로토콜 '{protocol}'이 포함되어야 함"
            
            # 포트가 있으면 라벨에 포함되어야 함
            if port:
                port_str = str(port)
                assert port_str in connector.label, \
                    f"라벨 '{connector.label}'에 포트 '{port_str}'가 포함되어야 함"
                
                # 포트가 있으면 "프로토콜:포트" 형식이어야 함
                expected_format = f"{protocol}:{port_str}"
                assert connector.label == expected_format, \
                    f"라벨은 '{expected_format}' 형식이어야 함 (실제: '{connector.label}')"
            else:
                # 포트가 없으면 프로토콜만 표시되어야 함
                assert connector.label == protocol, \
                    f"포트가 없을 때 라벨은 프로토콜만 표시해야 함 (실제: '{connector.label}')"
        
        # 같은 엣지에서 생성된 모든 Connector는 동일한 라벨을 가져야 함
        labels = [c.label for c in connectors]
        assert len(set(labels)) == 1, \
            "같은 트래픽 엣지에서 생성된 모든 Connector는 동일한 라벨을 가져야 함"



class TestDrawioGeneratorProperties:
    """DrawioGenerator의 correctness properties 검증"""
    
    @given(graph_json=graph_with_security_groups())
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    def test_property_6_security_group_no_icon(self, graph_json):
        """
        Feature: drawio-generator, Property 6: SecurityGroup은 아이콘 없음
        
        *For any* SecurityGroup 노드, draw.io Shape나 Container를 생성하지 않아야 한다.
        
        **Validates: Requirements 2.3**
        """
        from drawio_generator.generator import DrawioGenerator
        
        generator = DrawioGenerator()
        
        # 그래프 JSON을 draw.io XML로 변환
        xml_output = generator.generate(graph_json)
        
        # XML이 생성되어야 함
        assert xml_output, "XML이 생성되어야 함"
        
        # SecurityGroup 노드 ID 수집
        sg_node_ids = [
            node["id"] 
            for node in graph_json["nodes"] 
            if node.get("type") == "SecurityGroup"
        ]
        
        # SecurityGroup이 있어야 테스트가 의미 있음
        assert len(sg_node_ids) > 0, "테스트를 위해 최소 1개의 SecurityGroup이 필요함"
        
        # XML 파싱
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_output)
        
        # 모든 mxCell 수집
        mxGraphModel = root.find(".//mxGraphModel")
        assert mxGraphModel is not None, "mxGraphModel이 존재해야 함"
        
        graph_root = mxGraphModel.find("root")
        assert graph_root is not None, "root가 존재해야 함"
        
        cells = graph_root.findall("mxCell")
        
        # 모든 vertex 셀의 ID 수집 (Shape와 Container)
        vertex_cell_ids = []
        for cell in cells:
            if cell.get("vertex") == "1":
                cell_id = cell.get("id", "")
                # 기본 셀(0, 1) 제외
                if cell_id not in ["0", "1"]:
                    vertex_cell_ids.append(cell_id)
        
        # SecurityGroup 노드에 대응하는 Shape나 Container가 없어야 함
        for sg_id in sg_node_ids:
            # Shape ID 형식: shape-{node_id}
            shape_id = f"shape-{sg_id}"
            assert shape_id not in vertex_cell_ids, \
                f"SecurityGroup {sg_id}에 대한 Shape({shape_id})가 생성되면 안 됨"
            
            # Container ID 형식: container-{node_id}
            container_id = f"container-{sg_id}"
            assert container_id not in vertex_cell_ids, \
                f"SecurityGroup {sg_id}에 대한 Container({container_id})가 생성되면 안 됨"
        
        # 추가 검증: SecurityGroup 노드 개수만큼 vertex가 적어야 함
        # (EC2 + VPC + Subnet만 vertex로 생성되어야 함)
        ec2_count = sum(1 for node in graph_json["nodes"] if node.get("type") == "EC2")
        vpc_count = sum(1 for node in graph_json["nodes"] if node.get("type") == "VPC")
        subnet_count = sum(1 for node in graph_json["nodes"] if node.get("type") == "Subnet")
        
        expected_vertex_count = ec2_count + vpc_count + subnet_count
        actual_vertex_count = len(vertex_cell_ids)
        
        assert actual_vertex_count == expected_vertex_count, \
            f"vertex 개수가 일치해야 함 (예상: {expected_vertex_count}, 실제: {actual_vertex_count}). " \
            f"SecurityGroup은 vertex로 생성되면 안 됨"
    
    @given(graph_json=graph_with_structural_edges())
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    def test_property_9_structural_edges_no_connectors(self, graph_json):
        """
        Feature: drawio-generator, Property 9: 구조 엣지는 연결선 없음
        
        *For any* contains, hosts, uses 엣지, Connector를 생성하지 않아야 한다.
        
        **Validates: Requirements 4.5**
        """
        from drawio_generator.generator import DrawioGenerator
        
        generator = DrawioGenerator()
        
        # 그래프 JSON을 draw.io XML로 변환
        xml_output = generator.generate(graph_json)
        
        # XML이 생성되어야 함
        assert xml_output, "XML이 생성되어야 함"
        
        # 구조 엣지 수집 (contains, hosts, uses)
        structural_edges = [
            edge 
            for edge in graph_json["edges"] 
            if edge.get("type") in ["contains", "hosts", "uses"]
        ]
        
        # 구조 엣지가 있어야 테스트가 의미 있음
        assert len(structural_edges) > 0, "테스트를 위해 최소 1개의 구조 엣지가 필요함"
        
        # XML 파싱
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_output)
        
        # 모든 mxCell 수집
        mxGraphModel = root.find(".//mxGraphModel")
        assert mxGraphModel is not None, "mxGraphModel이 존재해야 함"
        
        graph_root = mxGraphModel.find("root")
        assert graph_root is not None, "root가 존재해야 함"
        
        cells = graph_root.findall("mxCell")
        
        # 모든 edge 셀 수집 (Connector)
        edge_cells = [cell for cell in cells if cell.get("edge") == "1"]
        
        # 구조 엣지에 대한 Connector가 생성되지 않았는지 확인
        # allows_traffic 엣지만 Connector로 변환되어야 함
        traffic_edges = [
            edge 
            for edge in graph_json["edges"] 
            if edge.get("type") == "allows_traffic"
        ]
        
        # SecurityGroup → EC2 매핑 생성 (allows_traffic 엣지의 Connector 개수 계산용)
        ec2_nodes = [node for node in graph_json["nodes"] if node.get("type") == "EC2"]
        sg_to_ec2_map: dict[str, list[str]] = {}
        
        for edge in graph_json["edges"]:
            if edge.get("type") == "uses":
                source_id = edge.get("source")
                target_id = edge.get("target")
                
                if source_id and target_id:
                    # source가 EC2이고 target이 SecurityGroup인 경우
                    if any(ec2["id"] == source_id for ec2 in ec2_nodes):
                        if target_id not in sg_to_ec2_map:
                            sg_to_ec2_map[target_id] = []
                        sg_to_ec2_map[target_id].append(source_id)
        
        # 예상 Connector 개수 계산 (allows_traffic 엣지만)
        expected_connector_count = 0
        for edge in traffic_edges:
            source_sg_id = edge.get("source")
            target_sg_id = edge.get("target")
            
            if source_sg_id and target_sg_id:
                source_ec2_count = len(sg_to_ec2_map.get(source_sg_id, []))
                target_ec2_count = len(sg_to_ec2_map.get(target_sg_id, []))
                expected_connector_count += source_ec2_count * target_ec2_count
        
        # 실제 Connector 개수
        actual_connector_count = len(edge_cells)
        
        # Connector 개수가 일치해야 함 (구조 엣지는 Connector를 생성하지 않음)
        assert actual_connector_count == expected_connector_count, \
            f"Connector 개수가 일치해야 함 (예상: {expected_connector_count}, 실제: {actual_connector_count}). " \
            f"구조 엣지(contains, hosts, uses)는 Connector를 생성하면 안 됨"
        
        # 추가 검증: 구조 엣지의 source/target이 edge 셀의 source/target에 없어야 함
        edge_source_targets = {
            (cell.get("source"), cell.get("target")) 
            for cell in edge_cells
        }
        
        # 구조 엣지의 source/target 수집
        structural_source_targets = {
            (edge.get("source"), edge.get("target")) 
            for edge in structural_edges
        }
        
        # 구조 엣지가 edge 셀로 변환되지 않았는지 확인
        # (단, Shape ID는 "shape-{node_id}" 형식이므로 직접 비교는 불가능)
        # 대신 edge 셀의 개수가 allows_traffic 엣지에서 생성된 개수와 일치하는지만 확인
        # (위에서 이미 검증함)


class TestLayoutEngineProperties:
    """LayoutEngine의 correctness properties 검증"""
    
    @given(vpcs=container_lists())
    @settings(max_examples=100)
    def test_property_12_layout_spacing_maintained_vpcs(self, vpcs):
        """
        Feature: drawio-generator, Property 12: 레이아웃 간격 유지 (VPC)
        
        *For any* 배치된 VPC Container, 최소 간격 150px를 유지해야 한다.
        
        **Validates: Requirements 6.4, 6.5, 6.6**
        """
        # VPC 타입으로 설정
        for vpc in vpcs:
            vpc.container_type = "vpc"
        
        engine = LayoutEngine()
        
        # VPC 배치
        engine.layout_vpcs(vpcs)
        
        # 최소 2개 이상의 VPC가 있을 때만 간격 검증
        if len(vpcs) < 2:
            return
        
        # 인접한 VPC 간 간격 검증
        for i in range(len(vpcs) - 1):
            current_vpc = vpcs[i]
            next_vpc = vpcs[i + 1]
            
            # 현재 VPC의 오른쪽 끝
            current_right = current_vpc.x + current_vpc.width
            
            # 다음 VPC의 왼쪽 시작
            next_left = next_vpc.x
            
            # 간격 계산
            spacing = next_left - current_right
            
            # 최소 간격 150px 유지 확인
            assert spacing >= engine.VPC_SPACING, \
                f"VPC 간 간격이 {engine.VPC_SPACING}px 미만입니다 (실제: {spacing}px)"
    
    @given(subnets=container_lists(), vpc_bounds=bounds())
    @settings(max_examples=100)
    def test_property_12_layout_spacing_maintained_subnets(self, subnets, vpc_bounds):
        """
        Feature: drawio-generator, Property 12: 레이아웃 간격 유지 (Subnet)
        
        *For any* 배치된 Subnet Container, 최소 간격 120px를 유지해야 한다.
        
        **Validates: Requirements 6.4, 6.5, 6.6**
        """
        # Subnet 타입으로 설정
        for subnet in subnets:
            subnet.container_type = "subnet"
        
        engine = LayoutEngine()
        
        # Subnet 배치
        engine.layout_subnets(subnets, vpc_bounds)
        
        # 최소 2개 이상의 Subnet이 있을 때만 간격 검증
        if len(subnets) < 2:
            return
        
        # 2열 그리드 레이아웃이므로 같은 행과 같은 열의 간격을 각각 검증
        
        # 같은 행의 인접한 Subnet 간 수평 간격 검증 (짝수 인덱스 -> 홀수 인덱스)
        for i in range(0, len(subnets) - 1, 2):
            if i + 1 < len(subnets):
                left_subnet = subnets[i]
                right_subnet = subnets[i + 1]
                
                # 왼쪽 Subnet의 오른쪽 끝
                left_right = left_subnet.x + left_subnet.width
                
                # 오른쪽 Subnet의 왼쪽 시작
                right_left = right_subnet.x
                
                # 수평 간격 계산
                horizontal_spacing = right_left - left_right
                
                # 최소 간격 120px 유지 확인
                assert horizontal_spacing >= engine.SUBNET_SPACING, \
                    f"Subnet 간 수평 간격이 {engine.SUBNET_SPACING}px 미만입니다 (실제: {horizontal_spacing}px)"
        
        # 같은 열의 인접한 Subnet 간 수직 간격 검증
        for i in range(len(subnets) - 2):
            # 2열 그리드이므로 i와 i+2가 같은 열
            if i + 2 < len(subnets):
                top_subnet = subnets[i]
                bottom_subnet = subnets[i + 2]
                
                # 위쪽 Subnet의 아래쪽 끝
                top_bottom = top_subnet.y + top_subnet.height
                
                # 아래쪽 Subnet의 위쪽 시작
                bottom_top = bottom_subnet.y
                
                # 수직 간격 계산
                vertical_spacing = bottom_top - top_bottom
                
                # 최소 간격 120px 유지 확인
                assert vertical_spacing >= engine.SUBNET_SPACING, \
                    f"Subnet 간 수직 간격이 {engine.SUBNET_SPACING}px 미만입니다 (실제: {vertical_spacing}px)"
    
    @given(ec2_list=shape_lists(), subnet_bounds=bounds())
    @settings(max_examples=100)
    def test_property_12_layout_spacing_maintained_ec2(self, ec2_list, subnet_bounds):
        """
        Feature: drawio-generator, Property 12: 레이아웃 간격 유지 (EC2)
        
        *For any* 배치된 EC2 Shape, 최소 간격 100px를 유지해야 한다.
        
        **Validates: Requirements 6.4, 6.5, 6.6**
        """
        engine = LayoutEngine()
        
        # EC2 배치
        engine.layout_ec2_instances(ec2_list, subnet_bounds)
        
        # 최소 2개 이상의 EC2가 있을 때만 간격 검증
        if len(ec2_list) < 2:
            return
        
        # 3열 그리드 레이아웃이므로 같은 행과 같은 열의 간격을 각각 검증
        
        # 같은 행의 인접한 EC2 간 수평 간격 검증
        for i in range(len(ec2_list) - 1):
            # 같은 행인지 확인 (3열 그리드)
            if (i + 1) % engine.EC2_COLUMNS != 0:
                left_ec2 = ec2_list[i]
                right_ec2 = ec2_list[i + 1]
                
                # 왼쪽 EC2의 오른쪽 끝
                left_right = left_ec2.x + left_ec2.width
                
                # 오른쪽 EC2의 왼쪽 시작
                right_left = right_ec2.x
                
                # 수평 간격 계산
                horizontal_spacing = right_left - left_right
                
                # 최소 간격 100px 유지 확인
                assert horizontal_spacing >= engine.EC2_SPACING, \
                    f"EC2 간 수평 간격이 {engine.EC2_SPACING}px 미만입니다 (실제: {horizontal_spacing}px)"
        
        # 같은 열의 인접한 EC2 간 수직 간격 검증
        for i in range(len(ec2_list) - engine.EC2_COLUMNS):
            top_ec2 = ec2_list[i]
            bottom_ec2 = ec2_list[i + engine.EC2_COLUMNS]
            
            # 위쪽 EC2의 아래쪽 끝
            top_bottom = top_ec2.y + top_ec2.height
            
            # 아래쪽 EC2의 위쪽 시작
            bottom_top = bottom_ec2.y
            
            # 수직 간격 계산
            vertical_spacing = bottom_top - top_bottom
            
            # 최소 간격 100px 유지 확인
            assert vertical_spacing >= engine.EC2_SPACING, \
                f"EC2 간 수직 간격이 {engine.EC2_SPACING}px 미만입니다 (실제: {vertical_spacing}px)"
