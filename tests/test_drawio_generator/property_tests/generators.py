"""
Property-Based 테스트를 위한 Hypothesis 생성기
"""
from hypothesis import strategies as st


def ec2_nodes():
    """
    EC2 노드 생성기
    
    Returns:
        Strategy: EC2 노드 딕셔너리를 생성하는 전략
    """
    return st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        "name": st.text(min_size=0, max_size=100),
        "private_ip": st.one_of(
            st.none(),
            st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True),
            st.from_regex(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$", fullmatch=True),
            st.from_regex(r"^192\.168\.\d{1,3}\.\d{1,3}$", fullmatch=True)
        ),
        "parent_id": st.one_of(st.none(), st.text(min_size=1, max_size=50))
    })


def positions():
    """
    좌표 생성기
    
    Returns:
        Strategy: (x, y) 튜플을 생성하는 전략
    """
    return st.tuples(
        st.integers(min_value=0, max_value=10000),
        st.integers(min_value=0, max_value=10000)
    )


def vpc_groups():
    """
    VPC 그룹 생성기
    
    Returns:
        Strategy: VPC 그룹 딕셔너리를 생성하는 전략
    """
    return st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        "name": st.text(min_size=0, max_size=100),
        "cidr": st.one_of(
            st.none(),
            st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            st.from_regex(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            st.from_regex(r"^192\.168\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
        )
    })


def subnet_lists():
    """
    Subnet 목록 생성기
    
    Returns:
        Strategy: Subnet 딕셔너리 리스트를 생성하는 전략
    """
    subnet = st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        ))
    })
    return st.lists(subnet, min_size=0, max_size=10)


def subnet_nodes():
    """
    Subnet 노드 생성기
    
    Returns:
        Strategy: Subnet 노드 딕셔너리를 생성하는 전략
    """
    return st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        "name": st.text(min_size=0, max_size=100),
        "cidr": st.one_of(
            st.none(),
            st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            st.from_regex(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            st.from_regex(r"^192\.168\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
        )
    })


def ec2_lists():
    """
    EC2 인스턴스 목록 생성기
    
    Returns:
        Strategy: EC2 딕셔너리 리스트를 생성하는 전략
    """
    ec2 = st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        ))
    })
    return st.lists(ec2, min_size=0, max_size=10)


def vpc_ids():
    """
    VPC ID 생성기
    
    Returns:
        Strategy: VPC ID 문자열을 생성하는 전략
    """
    return st.one_of(
        st.none(),
        st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        ))
    )


def traffic_edges():
    """
    allows_traffic 엣지 생성기
    
    Returns:
        Strategy: allows_traffic 엣지 딕셔너리를 생성하는 전략
    """
    return st.fixed_dictionaries({
        "protocol": st.sampled_from(["TCP", "UDP", "ICMP", "ALL"]),
        "port": st.one_of(
            st.none(),
            st.integers(min_value=1, max_value=65535),
            st.just("")
        )
    })


def ec2_id_lists():
    """
    EC2 ID 목록 생성기
    
    Returns:
        Strategy: EC2 ID 문자열 리스트를 생성하는 전략
    """
    ec2_id = st.text(min_size=1, max_size=50, alphabet=st.characters(
        whitelist_categories=("Lu", "Ll", "Nd"), 
        whitelist_characters="-_"
    ))
    return st.lists(ec2_id, min_size=1, max_size=5, unique=True)


def shape_lists():
    """
    Shape 목록 생성기 (EC2 인스턴스용)
    
    Returns:
        Strategy: Shape 객체 리스트를 생성하는 전략
    """
    from drawio_generator.models import Shape
    
    # XML에서 허용되는 문자만 사용 (제어 문자 제외)
    safe_text = st.text(
        min_size=0, 
        max_size=100,
        alphabet=st.characters(
            blacklist_categories=("Cc", "Cs"),  # 제어 문자 및 대리 문자 제외
            blacklist_characters="\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0b\x0c\x0e\x0f"
        )
    )
    
    safe_id = st.text(min_size=1, max_size=50, alphabet=st.characters(
        whitelist_categories=("Lu", "Ll", "Nd"), 
        whitelist_characters="-_"
    ))
    
    shape = st.builds(
        Shape,
        id=safe_id,
        node_id=st.text(min_size=1, max_size=50),
        x=st.integers(min_value=0, max_value=1000),
        y=st.integers(min_value=0, max_value=1000),
        width=st.just(78),  # EC2 아이콘 크기 고정
        height=st.just(78),
        label=safe_text,
        icon_type=st.just("ec2"),
        parent_id=st.one_of(st.none(), safe_id)
    )
    return st.lists(shape, min_size=2, max_size=10, unique_by=lambda s: s.id)


def container_lists():
    """
    Container 목록 생성기 (VPC/Subnet용)
    
    Returns:
        Strategy: Container 객체 리스트를 생성하는 전략
    """
    from drawio_generator.models import Container
    
    # XML에서 허용되는 문자만 사용 (제어 문자 제외)
    safe_text = st.text(
        min_size=0, 
        max_size=100,
        alphabet=st.characters(
            blacklist_categories=("Cc", "Cs"),  # 제어 문자 및 대리 문자 제외
            blacklist_characters="\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0b\x0c\x0e\x0f"
        )
    )
    
    safe_id = st.text(min_size=1, max_size=50, alphabet=st.characters(
        whitelist_categories=("Lu", "Ll", "Nd"), 
        whitelist_characters="-_"
    ))
    
    container = st.builds(
        Container,
        id=safe_id,
        node_id=st.text(min_size=1, max_size=50),
        x=st.integers(min_value=0, max_value=1000),
        y=st.integers(min_value=0, max_value=1000),
        width=st.integers(min_value=200, max_value=800),
        height=st.integers(min_value=200, max_value=600),
        label=safe_text,
        container_type=st.sampled_from(["vpc", "subnet"]),
        background_color=st.just("none"),
        parent_id=st.one_of(st.none(), safe_id),
        children=st.lists(safe_id, min_size=0, max_size=10)
    )
    return st.lists(container, min_size=2, max_size=10, unique_by=lambda c: c.id)


def bounds():
    """
    경계 영역 생성기 (x, y, width, height)
    
    Returns:
        Strategy: (x, y, width, height) 튜플을 생성하는 전략
    """
    return st.tuples(
        st.integers(min_value=0, max_value=1000),  # x
        st.integers(min_value=0, max_value=1000),  # y
        st.integers(min_value=400, max_value=1200),  # width
        st.integers(min_value=400, max_value=1000)   # height
    )


def connector_lists():
    """
    Connector 목록 생성기 (트래픽 화살표용)
    
    Returns:
        Strategy: Connector 객체 리스트를 생성하는 전략
    """
    from drawio_generator.models import Connector
    
    # XML에서 허용되는 문자만 사용 (제어 문자 제외)
    safe_text = st.text(
        min_size=0, 
        max_size=50,
        alphabet=st.characters(
            blacklist_categories=("Cc", "Cs"),  # 제어 문자 및 대리 문자 제외
            blacklist_characters="\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0b\x0c\x0e\x0f"
        )
    )
    
    connector = st.builds(
        Connector,
        id=st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        source_id=st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        target_id=st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        label=safe_text,
        style=st.just("strokeWidth=2;endArrow=classic;strokeColor=#000000;")
    )
    return st.lists(connector, min_size=0, max_size=10, unique_by=lambda c: c.id)


def security_group_nodes():
    """
    SecurityGroup 노드 생성기
    
    Returns:
        Strategy: SecurityGroup 노드 딕셔너리를 생성하는 전략
    """
    return st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )),
        "type": st.just("SecurityGroup"),
        "name": st.text(min_size=0, max_size=100)
    })


def graph_with_security_groups():
    """
    SecurityGroup을 포함한 그래프 JSON 생성기
    
    Returns:
        Strategy: 그래프 JSON 딕셔너리를 생성하는 전략
    """
    # XML에서 허용되는 안전한 텍스트 생성기
    safe_text = st.text(
        min_size=1, 
        max_size=50,
        alphabet=st.characters(
            blacklist_categories=("Cc", "Cs"),  # 제어 문자 및 대리 문자 제외
            blacklist_characters="\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0b\x0c\x0e\x0f"
        )
    )
    
    # 고유한 ID 생성을 위한 헬퍼
    def unique_id_generator(prefix: str):
        return st.text(min_size=1, max_size=40, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )).map(lambda x: f"{prefix}-{x}")
    
    # 각 타입별 노드 생성
    vpc_node = st.fixed_dictionaries({
        "id": unique_id_generator("vpc"),
        "type": st.just("VPC"),
        "name": safe_text,
        "cidr": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
    })
    
    subnet_node = st.fixed_dictionaries({
        "id": unique_id_generator("subnet"),
        "type": st.just("Subnet"),
        "name": safe_text,
        "cidr": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
    })
    
    ec2_node = st.fixed_dictionaries({
        "id": unique_id_generator("i"),
        "type": st.just("EC2"),
        "name": safe_text,
        "private_ip": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True)
    })
    
    sg_node = st.fixed_dictionaries({
        "id": unique_id_generator("sg"),
        "type": st.just("SecurityGroup"),
        "name": safe_text
    })
    
    # 그래프 구조 생성
    @st.composite
    def graph_strategy(draw):
        # 최소 1개씩의 각 타입 노드 생성
        vpc = draw(vpc_node)
        subnet = draw(subnet_node)
        ec2_list = draw(st.lists(ec2_node, min_size=1, max_size=3, unique_by=lambda x: x["id"]))
        sg_list = draw(st.lists(sg_node, min_size=1, max_size=3, unique_by=lambda x: x["id"]))
        
        # 모든 노드 수집
        nodes = [vpc, subnet] + ec2_list + sg_list
        
        # 엣지 생성
        edges = []
        
        # VPC contains Subnet
        edges.append({
            "source": vpc["id"],
            "target": subnet["id"],
            "type": "contains"
        })
        
        # Subnet hosts EC2
        for ec2 in ec2_list:
            edges.append({
                "source": subnet["id"],
                "target": ec2["id"],
                "type": "hosts"
            })
        
        # EC2 uses SecurityGroup
        for ec2 in ec2_list:
            sg = draw(st.sampled_from(sg_list))
            edges.append({
                "source": ec2["id"],
                "target": sg["id"],
                "type": "uses"
            })
        
        # SecurityGroup allows_traffic (선택적)
        if len(sg_list) >= 2:
            edges.append({
                "source": sg_list[0]["id"],
                "target": sg_list[1]["id"],
                "type": "allows_traffic",
                "protocol": "TCP",
                "port": 80
            })
        
        # 그룹 (VPC)
        groups = [{"id": vpc["id"], "type": "VPC"}]
        
        return {
            "nodes": nodes,
            "edges": edges,
            "groups": groups
        }
    
    return graph_strategy()


def graph_with_structural_edges():
    """
    구조 엣지(contains, hosts, uses)를 포함한 그래프 JSON 생성기
    
    Returns:
        Strategy: 그래프 JSON 딕셔너리를 생성하는 전략
    """
    # XML에서 허용되는 안전한 텍스트 생성기
    safe_text = st.text(
        min_size=1, 
        max_size=50,
        alphabet=st.characters(
            blacklist_categories=("Cc", "Cs"),
            blacklist_characters="\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0b\x0c\x0e\x0f"
        )
    )
    
    # 고유한 ID 생성을 위한 헬퍼
    def unique_id_generator(prefix: str):
        return st.text(min_size=1, max_size=40, alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"), 
            whitelist_characters="-_"
        )).map(lambda x: f"{prefix}-{x}")
    
    # 각 타입별 노드 생성
    vpc_node = st.fixed_dictionaries({
        "id": unique_id_generator("vpc"),
        "type": st.just("VPC"),
        "name": safe_text,
        "cidr": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
    })
    
    subnet_node = st.fixed_dictionaries({
        "id": unique_id_generator("subnet"),
        "type": st.just("Subnet"),
        "name": safe_text,
        "cidr": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
    })
    
    ec2_node = st.fixed_dictionaries({
        "id": unique_id_generator("i"),
        "type": st.just("EC2"),
        "name": safe_text,
        "private_ip": st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True)
    })
    
    sg_node = st.fixed_dictionaries({
        "id": unique_id_generator("sg"),
        "type": st.just("SecurityGroup"),
        "name": safe_text
    })
    
    # 그래프 구조 생성
    @st.composite
    def graph_strategy(draw):
        # 최소 1개씩의 각 타입 노드 생성
        vpc = draw(vpc_node)
        subnet = draw(subnet_node)
        ec2_list = draw(st.lists(ec2_node, min_size=2, max_size=4, unique_by=lambda x: x["id"]))
        sg_list = draw(st.lists(sg_node, min_size=1, max_size=2, unique_by=lambda x: x["id"]))
        
        # 모든 노드 수집
        nodes = [vpc, subnet] + ec2_list + sg_list
        
        # 엣지 생성
        edges = []
        
        # 구조 엣지: VPC contains Subnet
        edges.append({
            "source": vpc["id"],
            "target": subnet["id"],
            "type": "contains"
        })
        
        # 구조 엣지: Subnet hosts EC2
        for ec2 in ec2_list:
            edges.append({
                "source": subnet["id"],
                "target": ec2["id"],
                "type": "hosts"
            })
        
        # 구조 엣지: EC2 uses SecurityGroup
        for ec2 in ec2_list:
            sg = draw(st.sampled_from(sg_list))
            edges.append({
                "source": ec2["id"],
                "target": sg["id"],
                "type": "uses"
            })
        
        # 그룹 (VPC)
        groups = [{"id": vpc["id"], "type": "VPC"}]
        
        return {
            "nodes": nodes,
            "edges": edges,
            "groups": groups
        }
    
    return graph_strategy()
