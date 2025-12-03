"""
XMLBuilder 유닛 테스트
"""
import xml.etree.ElementTree as ET
import pytest

from drawio_generator.xml_builder import XMLBuilder
from drawio_generator.models import Shape, Container, Connector


def test_build_creates_valid_xml_structure():
    """기본 XML 구조가 올바르게 생성되는지 테스트"""
    builder = XMLBuilder()
    
    # 빈 요소로 XML 생성
    xml_string = builder.build(shapes=[], containers=[], connectors=[])
    
    # XML 파싱 가능 확인
    root = ET.fromstring(xml_string)
    
    # 기본 구조 확인
    assert root.tag == 'mxfile'
    assert root.attrib['host'] == 'app.diagrams.net'
    
    diagram = root.find('diagram')
    assert diagram is not None
    assert diagram.attrib['name'] == 'AWS Architecture'
    
    mxGraphModel = diagram.find('mxGraphModel')
    assert mxGraphModel is not None
    
    xml_root = mxGraphModel.find('root')
    assert xml_root is not None
    
    # 기본 셀 확인 (id="0", id="1")
    cells = xml_root.findall('mxCell')
    assert len(cells) >= 2
    assert cells[0].attrib['id'] == '0'
    assert cells[1].attrib['id'] == '1'
    assert cells[1].attrib['parent'] == '0'


def test_create_shape_cell():
    """EC2 Shape가 올바르게 mxCell로 변환되는지 테스트"""
    builder = XMLBuilder()
    
    shape = Shape(
        id="i-123",
        node_id="ec2-1",
        x=100,
        y=200,
        width=78,
        height=78,
        label="web-server\n10.0.1.10",
        icon_type="ec2",
        parent_id=None
    )
    
    xml_string = builder.build(shapes=[shape], containers=[], connectors=[])
    root = ET.fromstring(xml_string)
    
    # Shape 셀 찾기
    xml_root = root.find('.//root')
    shape_cell = xml_root.find(f".//mxCell[@id='{shape.id}']")
    
    assert shape_cell is not None
    assert shape_cell.attrib['value'] == shape.label
    assert shape_cell.attrib['vertex'] == '1'
    assert shape_cell.attrib['parent'] == '1'
    
    # 스타일 확인
    style = shape_cell.attrib['style']
    assert 'mxgraph.aws4.resourceIcon' in style
    assert 'mxgraph.aws4.ec2' in style
    assert '#ED7100' in style
    
    # geometry 확인
    geometry = shape_cell.find('mxGeometry')
    assert geometry is not None
    assert geometry.attrib['x'] == '100'
    assert geometry.attrib['y'] == '200'
    assert geometry.attrib['width'] == '78'
    assert geometry.attrib['height'] == '78'


def test_create_vpc_container_cell():
    """VPC Container가 올바르게 mxCell로 변환되는지 테스트"""
    builder = XMLBuilder()
    
    vpc = Container(
        id="vpc-123",
        node_id="vpc-1",
        x=40,
        y=40,
        width=800,
        height=600,
        label="production-vpc\n10.0.0.0/16",
        container_type="vpc",
        background_color="none",
        parent_id=None,
        children=[]
    )
    
    xml_string = builder.build(shapes=[], containers=[vpc], connectors=[])
    root = ET.fromstring(xml_string)
    
    # VPC 셀 찾기
    xml_root = root.find('.//root')
    vpc_cell = xml_root.find(f".//mxCell[@id='{vpc.id}']")
    
    assert vpc_cell is not None
    assert vpc_cell.attrib['value'] == vpc.label
    assert vpc_cell.attrib['vertex'] == '1'
    assert vpc_cell.attrib['parent'] == '1'
    
    # VPC 스타일 확인
    style = vpc_cell.attrib['style']
    assert 'mxgraph.aws4.group' in style
    assert 'mxgraph.aws4.group_vpc' in style
    assert 'fillColor=none' in style
    # strokeColor 지정 안 함 - 아이콘 기본 색상 사용
    
    # geometry 확인
    geometry = vpc_cell.find('mxGeometry')
    assert geometry is not None
    assert geometry.attrib['x'] == '40'
    assert geometry.attrib['y'] == '40'
    assert geometry.attrib['width'] == '800'
    assert geometry.attrib['height'] == '600'


def test_create_subnet_container_cell():
    """Subnet Container가 올바르게 mxCell로 변환되는지 테스트"""
    builder = XMLBuilder()
    
    subnet = Container(
        id="subnet-456",
        node_id="subnet-1",
        x=20,
        y=60,
        width=360,
        height=300,
        label="public-subnet\n10.0.1.0/24",
        container_type="subnet",
        background_color="none",
        parent_id="vpc-123",
        children=[]
    )
    
    xml_string = builder.build(shapes=[], containers=[subnet], connectors=[])
    root = ET.fromstring(xml_string)
    
    # Subnet 셀 찾기
    xml_root = root.find('.//root')
    subnet_cell = xml_root.find(f".//mxCell[@id='{subnet.id}']")
    
    assert subnet_cell is not None
    assert subnet_cell.attrib['value'] == subnet.label
    assert subnet_cell.attrib['vertex'] == '1'
    assert subnet_cell.attrib['parent'] == 'vpc-123'  # VPC 내부에 배치
    
    # Subnet 스타일 확인
    style = subnet_cell.attrib['style']
    assert 'mxgraph.aws4.group' in style
    assert 'mxgraph.aws4.group_subnet' in style
    assert 'fillColor=none' in style
    # strokeColor 지정 안 함 - 아이콘 기본 색상 사용


def test_create_connector_cell():
    """Connector가 올바르게 mxCell로 변환되는지 테스트"""
    builder = XMLBuilder()
    
    connector = Connector(
        id="edge-1",
        source_id="i-123",
        target_id="i-456",
        label="TCP:80",
        style="edgeStyle=orthogonalEdgeStyle;strokeWidth=2;"
    )
    
    xml_string = builder.build(shapes=[], containers=[], connectors=[connector])
    root = ET.fromstring(xml_string)
    
    # Connector 셀 찾기
    xml_root = root.find('.//root')
    connector_cell = xml_root.find(f".//mxCell[@id='{connector.id}']")
    
    assert connector_cell is not None
    assert connector_cell.attrib['value'] == connector.label
    assert connector_cell.attrib['edge'] == '1'
    assert connector_cell.attrib['parent'] == '1'
    assert connector_cell.attrib['source'] == 'i-123'
    assert connector_cell.attrib['target'] == 'i-456'
    assert connector_cell.attrib['style'] == connector.style
    
    # geometry 확인
    geometry = connector_cell.find('mxGeometry')
    assert geometry is not None
    assert geometry.attrib['relative'] == '1'


def test_build_with_nested_structure():
    """중첩된 구조(VPC > Subnet > EC2)가 올바르게 생성되는지 테스트"""
    builder = XMLBuilder()
    
    vpc = Container(
        id="vpc-123",
        node_id="vpc-1",
        x=40,
        y=40,
        width=800,
        height=600,
        label="vpc",
        container_type="vpc",
        background_color="none",
        parent_id=None,
        children=["subnet-456"]
    )
    
    subnet = Container(
        id="subnet-456",
        node_id="subnet-1",
        x=20,
        y=60,
        width=360,
        height=300,
        label="subnet",
        container_type="subnet",
        background_color="none",
        parent_id="vpc-123",
        children=["i-789"]
    )
    
    ec2 = Shape(
        id="i-789",
        node_id="ec2-1",
        x=40,
        y=60,
        width=78,
        height=78,
        label="ec2",
        icon_type="ec2",
        parent_id="subnet-456"
    )
    
    xml_string = builder.build(shapes=[ec2], containers=[vpc, subnet], connectors=[])
    root = ET.fromstring(xml_string)
    
    xml_root = root.find('.//root')
    
    # 계층 구조 확인
    vpc_cell = xml_root.find(f".//mxCell[@id='vpc-123']")
    assert vpc_cell.attrib['parent'] == '1'
    
    subnet_cell = xml_root.find(f".//mxCell[@id='subnet-456']")
    assert subnet_cell.attrib['parent'] == 'vpc-123'
    
    ec2_cell = xml_root.find(f".//mxCell[@id='i-789']")
    assert ec2_cell.attrib['parent'] == 'subnet-456'


def test_xml_encoding_utf8():
    """XML이 UTF-8로 인코딩되는지 테스트"""
    builder = XMLBuilder()
    
    shape = Shape(
        id="i-123",
        node_id="ec2-1",
        x=100,
        y=200,
        width=78,
        height=78,
        label="한글-서버\n10.0.1.10",  # 한글 포함
        icon_type="ec2",
        parent_id=None
    )
    
    xml_string = builder.build(shapes=[shape], containers=[], connectors=[])
    
    # UTF-8 선언 확인
    assert '<?xml version="1.0" encoding="utf-8"?>' in xml_string or \
           '<?xml version="1.0" encoding="UTF-8"?>' in xml_string.lower()
    
    # 한글이 올바르게 포함되어 있는지 확인
    assert '한글-서버' in xml_string
    
    # XML 파싱 가능 확인
    root = ET.fromstring(xml_string)
    xml_root = root.find('.//root')
    shape_cell = xml_root.find(f".//mxCell[@id='{shape.id}']")
    assert shape_cell is not None
    assert '한글-서버' in shape_cell.attrib['value']
