"""
DrawioGenerator 통합 테스트
"""
import pytest
import xml.etree.ElementTree as ET

from drawio_generator.generator import DrawioGenerator
from drawio_generator.exceptions import InvalidGraphError, UnknownNodeTypeError


def test_generate_simple_graph():
    """
    간단한 그래프 JSON을 draw.io XML로 변환
    """
    # Given: 간단한 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "vpc-1",
                "type": "VPC",
                "name": "test-vpc",
                "cidr": "10.0.0.0/16"
            },
            {
                "id": "subnet-1",
                "type": "Subnet",
                "name": "test-subnet",
                "cidr": "10.0.1.0/24"
            },
            {
                "id": "ec2-1",
                "type": "EC2",
                "name": "web-server",
                "private_ip": "10.0.1.10"
            },
            {
                "id": "sg-1",
                "type": "SecurityGroup",
                "name": "web-sg"
            }
        ],
        "edges": [
            {
                "type": "contains",
                "source": "vpc-1",
                "target": "subnet-1"
            },
            {
                "type": "hosts",
                "source": "subnet-1",
                "target": "ec2-1"
            },
            {
                "type": "uses",
                "source": "ec2-1",
                "target": "sg-1"
            }
        ],
        "groups": [
            {
                "id": "vpc-1",
                "type": "VPC"
            }
        ]
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: XML이 생성되어야 함
    assert xml_output is not None
    assert len(xml_output) > 0
    
    # XML 파싱 가능 확인
    root = ET.fromstring(xml_output)
    assert root.tag == "mxfile"
    
    # diagram 요소 확인
    diagram = root.find("diagram")
    assert diagram is not None
    
    # mxGraphModel 확인
    model = diagram.find("mxGraphModel")
    assert model is not None
    
    # root 요소 확인
    graph_root = model.find("root")
    assert graph_root is not None
    
    # mxCell 요소들 확인
    cells = graph_root.findall("mxCell")
    assert len(cells) > 0


def test_generate_with_traffic():
    """
    트래픽 엣지가 있는 그래프 JSON을 draw.io XML로 변환
    """
    # Given: 트래픽 엣지가 있는 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "vpc-1",
                "type": "VPC",
                "name": "test-vpc",
                "cidr": "10.0.0.0/16"
            },
            {
                "id": "subnet-1",
                "type": "Subnet",
                "name": "test-subnet",
                "cidr": "10.0.1.0/24"
            },
            {
                "id": "ec2-1",
                "type": "EC2",
                "name": "web-server",
                "private_ip": "10.0.1.10"
            },
            {
                "id": "ec2-2",
                "type": "EC2",
                "name": "app-server",
                "private_ip": "10.0.1.20"
            },
            {
                "id": "sg-1",
                "type": "SecurityGroup",
                "name": "web-sg"
            },
            {
                "id": "sg-2",
                "type": "SecurityGroup",
                "name": "app-sg"
            }
        ],
        "edges": [
            {
                "type": "contains",
                "source": "vpc-1",
                "target": "subnet-1"
            },
            {
                "type": "hosts",
                "source": "subnet-1",
                "target": "ec2-1"
            },
            {
                "type": "hosts",
                "source": "subnet-1",
                "target": "ec2-2"
            },
            {
                "type": "uses",
                "source": "ec2-1",
                "target": "sg-1"
            },
            {
                "type": "uses",
                "source": "ec2-2",
                "target": "sg-2"
            },
            {
                "type": "allows_traffic",
                "source": "sg-1",
                "target": "sg-2",
                "protocol": "TCP",
                "port": "80"
            }
        ],
        "groups": []
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: XML이 생성되어야 함
    assert xml_output is not None
    
    # XML 파싱 가능 확인
    root = ET.fromstring(xml_output)
    assert root.tag == "mxfile"
    
    # Connector가 생성되었는지 확인
    model = root.find("diagram").find("mxGraphModel")
    graph_root = model.find("root")
    
    # edge 속성이 있는 mxCell 찾기 (Connector)
    connectors = [cell for cell in graph_root.findall("mxCell") if cell.get("edge") == "1"]
    assert len(connectors) > 0
    
    # 라벨에 프로토콜:포트 정보가 있는지 확인
    connector = connectors[0]
    label = connector.get("value", "")
    assert "TCP" in label
    assert "80" in label


def test_invalid_graph_missing_nodes():
    """
    nodes 필드가 없는 경우 InvalidGraphError 발생
    """
    # Given: nodes 필드가 없는 그래프 JSON
    graph_json = {
        "edges": [],
        "groups": []
    }
    
    # When/Then: InvalidGraphError 발생
    generator = DrawioGenerator()
    with pytest.raises(InvalidGraphError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.field == "nodes"


def test_invalid_graph_missing_edges():
    """
    edges 필드가 없는 경우 InvalidGraphError 발생
    """
    # Given: edges 필드가 없는 그래프 JSON
    graph_json = {
        "nodes": [],
        "groups": []
    }
    
    # When/Then: InvalidGraphError 발생
    generator = DrawioGenerator()
    with pytest.raises(InvalidGraphError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.field == "edges"


def test_unknown_node_type():
    """
    알 수 없는 노드 타입을 만나면 UnknownNodeTypeError 발생
    """
    # Given: 알 수 없는 노드 타입이 있는 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "unknown-1",
                "type": "UnknownType",
                "name": "unknown"
            }
        ],
        "edges": [],
        "groups": []
    }
    
    # When/Then: UnknownNodeTypeError 발생
    generator = DrawioGenerator()
    with pytest.raises(UnknownNodeTypeError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.node_id == "unknown-1"
    assert exc_info.value.node_type == "unknowntype"  # 소문자로 변환됨


def test_security_group_no_shape():
    """
    SecurityGroup 노드는 Shape를 생성하지 않음
    """
    # Given: SecurityGroup 노드가 있는 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "sg-1",
                "type": "SecurityGroup",
                "name": "web-sg"
            }
        ],
        "edges": [],
        "groups": []
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: SecurityGroup Shape가 생성되지 않아야 함
    root = ET.fromstring(xml_output)
    model = root.find("diagram").find("mxGraphModel")
    graph_root = model.find("root")
    
    # vertex 속성이 있는 mxCell 찾기 (Shape/Container)
    vertices = [cell for cell in graph_root.findall("mxCell") if cell.get("vertex") == "1"]
    
    # SecurityGroup ID가 포함된 vertex가 없어야 함
    sg_vertices = [v for v in vertices if "sg-1" in v.get("id", "")]
    assert len(sg_vertices) == 0


def test_structural_edges_no_connector():
    """
    contains, hosts, uses 엣지는 Connector를 생성하지 않음
    """
    # Given: 구조 엣지만 있는 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "vpc-1",
                "type": "VPC",
                "name": "test-vpc",
                "cidr": "10.0.0.0/16"
            },
            {
                "id": "subnet-1",
                "type": "Subnet",
                "name": "test-subnet",
                "cidr": "10.0.1.0/24"
            }
        ],
        "edges": [
            {
                "type": "contains",
                "source": "vpc-1",
                "target": "subnet-1"
            }
        ],
        "groups": []
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: Connector가 생성되지 않아야 함
    root = ET.fromstring(xml_output)
    model = root.find("diagram").find("mxGraphModel")
    graph_root = model.find("root")
    
    # edge 속성이 있는 mxCell 찾기 (Connector)
    connectors = [cell for cell in graph_root.findall("mxCell") if cell.get("edge") == "1"]
    assert len(connectors) == 0



def test_hierarchical_structure():
    """
    계층 구조: EC2는 Subnet 내부에, Subnet은 VPC 내부에 배치
    """
    # Given: 계층 구조가 있는 그래프 JSON
    graph_json = {
        "nodes": [
            {
                "id": "vpc-1",
                "type": "VPC",
                "name": "test-vpc",
                "cidr": "10.0.0.0/16"
            },
            {
                "id": "subnet-1",
                "type": "Subnet",
                "name": "test-subnet",
                "cidr": "10.0.1.0/24"
            },
            {
                "id": "i-1",
                "type": "EC2",
                "name": "web-1",
                "private_ip": "10.0.1.10"
            }
        ],
        "edges": [
            {
                "type": "contains",
                "source": "vpc-1",
                "target": "subnet-1"
            },
            {
                "type": "hosts",
                "source": "subnet-1",
                "target": "i-1"
            }
        ],
        "groups": []
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: 계층 구조가 올바르게 생성되어야 함
    root = ET.fromstring(xml_output)
    
    # VPC Container 찾기
    vpc_cell = root.find(".//mxCell[@id='container-vpc-1']")
    assert vpc_cell is not None
    assert vpc_cell.get('parent') == '1'  # VPC는 루트의 자식
    
    # Subnet Container 찾기
    subnet_cell = root.find(".//mxCell[@id='container-subnet-1']")
    assert subnet_cell is not None
    assert subnet_cell.get('parent') == 'container-vpc-1'  # Subnet은 VPC의 자식
    
    # EC2 Shape 찾기
    ec2_cell = root.find(".//mxCell[@id='shape-i-1']")
    assert ec2_cell is not None
    assert ec2_cell.get('parent') == 'container-subnet-1'  # EC2는 Subnet의 자식
    
    # 상대 좌표 확인 (Subnet과 EC2는 부모 내부 상대 좌표를 가져야 함)
    subnet_geometry = subnet_cell.find('mxGeometry')
    subnet_x = int(subnet_geometry.get('x'))
    subnet_y = int(subnet_geometry.get('y'))
    
    # Subnet은 VPC 내부에 배치되므로 작은 상대 좌표를 가져야 함
    assert subnet_x < 200  # VPC 내부 패딩 + 여유
    assert subnet_y < 200
    
    ec2_geometry = ec2_cell.find('mxGeometry')
    ec2_x = int(ec2_geometry.get('x'))
    ec2_y = int(ec2_geometry.get('y'))
    
    # EC2는 Subnet 내부에 배치되므로 작은 상대 좌표를 가져야 함
    assert ec2_x < 200  # Subnet 내부 패딩 + 여유
    assert ec2_y < 200


def test_invalid_graph_nodes_not_list():
    """
    nodes가 리스트가 아닌 경우 InvalidGraphError 발생
    """
    # Given: nodes가 리스트가 아닌 그래프 JSON
    graph_json = {
        "nodes": "not a list",
        "edges": [],
        "groups": []
    }
    
    # When/Then: InvalidGraphError 발생
    generator = DrawioGenerator()
    with pytest.raises(InvalidGraphError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.field == "nodes"
    assert "list" in exc_info.value.reason.lower()


def test_invalid_graph_edges_not_list():
    """
    edges가 리스트가 아닌 경우 InvalidGraphError 발생
    """
    # Given: edges가 리스트가 아닌 그래프 JSON
    graph_json = {
        "nodes": [],
        "edges": "not a list",
        "groups": []
    }
    
    # When/Then: InvalidGraphError 발생
    generator = DrawioGenerator()
    with pytest.raises(InvalidGraphError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.field == "edges"
    assert "list" in exc_info.value.reason.lower()


def test_invalid_graph_groups_not_list():
    """
    groups가 리스트가 아닌 경우 InvalidGraphError 발생
    """
    # Given: groups가 리스트가 아닌 그래프 JSON
    graph_json = {
        "nodes": [],
        "edges": [],
        "groups": "not a list"
    }
    
    # When/Then: InvalidGraphError 발생
    generator = DrawioGenerator()
    with pytest.raises(InvalidGraphError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.field == "groups"
    assert "list" in exc_info.value.reason.lower()


def test_empty_graph():
    """
    빈 그래프 JSON도 정상적으로 처리
    """
    # Given: 빈 그래프 JSON
    graph_json = {
        "nodes": [],
        "edges": [],
        "groups": []
    }
    
    # When: DrawioGenerator로 XML 생성
    generator = DrawioGenerator()
    xml_output = generator.generate(graph_json)
    
    # Then: XML이 생성되어야 함
    assert xml_output is not None
    
    # XML 파싱 가능 확인
    root = ET.fromstring(xml_output)
    assert root.tag == "mxfile"


def test_node_without_type():
    """
    type 필드가 없는 노드는 빈 문자열로 처리되어 UnknownNodeTypeError 발생
    """
    # Given: type 필드가 없는 노드
    graph_json = {
        "nodes": [
            {
                "id": "node-1",
                "name": "test"
            }
        ],
        "edges": [],
        "groups": []
    }
    
    # When/Then: UnknownNodeTypeError 발생
    generator = DrawioGenerator()
    with pytest.raises(UnknownNodeTypeError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.node_id == "node-1"
    assert exc_info.value.node_type == ""


def test_node_without_id():
    """
    id 필드가 없는 노드는 "unknown"으로 처리
    """
    # Given: id 필드가 없는 노드
    graph_json = {
        "nodes": [
            {
                "type": "InvalidType",
                "name": "test"
            }
        ],
        "edges": [],
        "groups": []
    }
    
    # When/Then: UnknownNodeTypeError 발생 (id는 "unknown"으로 처리)
    generator = DrawioGenerator()
    with pytest.raises(UnknownNodeTypeError) as exc_info:
        generator.generate(graph_json)
    
    assert exc_info.value.node_id == "unknown"
    assert exc_info.value.node_type == "invalidtype"  # 소문자로 변환됨
