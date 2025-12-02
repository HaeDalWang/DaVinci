"""
resource_graph_builder용 Hypothesis 전략 (generators) 정의
"""
from hypothesis import strategies as st
from resource_graph_builder.models import Node, Edge, Group
from resource_graph_builder.graph import ResourceGraph


def node_strategy() -> st.SearchStrategy[Node]:
    """Node 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        Node,
        id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd", "Lu")),
            min_size=5,
            max_size=20
        ).map(lambda x: f"node-{x}"),
        type=st.sampled_from(["ec2", "vpc", "subnet", "security_group"]),
        name=st.text(min_size=1, max_size=50),
        attributes=st.dictionaries(
            keys=st.text(min_size=1, max_size=20),
            values=st.one_of(
                st.text(max_size=100),
                st.integers(),
                st.booleans(),
                st.none()
            ),
            min_size=0,
            max_size=5
        )
    )


def edge_strategy(node_ids: list[str] | None = None) -> st.SearchStrategy[Edge]:
    """
    Edge 객체를 생성하는 Hypothesis 전략
    
    Args:
        node_ids: 사용할 노드 ID 목록 (None이면 임의 생성)
    """
    if node_ids and len(node_ids) >= 2:
        # 주어진 노드 ID 중에서 선택
        source_strategy = st.sampled_from(node_ids)
        target_strategy = st.sampled_from(node_ids)
    else:
        # 임의의 노드 ID 생성
        source_strategy = st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=5,
            max_size=20
        ).map(lambda x: f"node-{x}")
        target_strategy = st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=5,
            max_size=20
        ).map(lambda x: f"node-{x}")
    
    return st.builds(
        Edge,
        source=source_strategy,
        target=target_strategy,
        edge_type=st.sampled_from(["contains", "hosts", "uses", "allows_traffic"]),
        attributes=st.dictionaries(
            keys=st.text(min_size=1, max_size=20),
            values=st.one_of(
                st.text(max_size=100),
                st.integers(),
                st.booleans(),
                st.none()
            ),
            min_size=0,
            max_size=5
        )
    )


def group_strategy(node_ids: list[str] | None = None) -> st.SearchStrategy[Group]:
    """
    Group 객체를 생성하는 Hypothesis 전략
    
    Args:
        node_ids: 사용할 노드 ID 목록 (None이면 임의 생성)
    """
    if node_ids:
        # 주어진 노드 ID 중에서 멤버 선택
        members_strategy = st.lists(
            st.sampled_from(node_ids),
            min_size=0,
            max_size=min(len(node_ids), 10)
        )
    else:
        # 임의의 노드 ID 생성
        members_strategy = st.lists(
            st.text(
                alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
                min_size=5,
                max_size=20
            ).map(lambda x: f"node-{x}"),
            min_size=0,
            max_size=10
        )
    
    return st.builds(
        Group,
        id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=5,
            max_size=20
        ).map(lambda x: f"vpc-{x}"),
        type=st.just("vpc"),
        name=st.text(min_size=1, max_size=50),
        members=members_strategy,
        attributes=st.dictionaries(
            keys=st.text(min_size=1, max_size=20),
            values=st.one_of(
                st.text(max_size=100),
                st.integers(),
                st.booleans(),
                st.none()
            ),
            min_size=0,
            max_size=5
        )
    )


@st.composite
def resource_graph_strategy(draw) -> ResourceGraph:
    """
    ResourceGraph 객체를 생성하는 Hypothesis 전략
    
    노드, 엣지, 그룹을 포함한 완전한 그래프를 생성
    """
    graph = ResourceGraph()
    
    # 노드 생성 (1~10개)
    num_nodes = draw(st.integers(min_value=1, max_value=10))
    nodes = [draw(node_strategy()) for _ in range(num_nodes)]
    node_ids = [node.id for node in nodes]
    
    # 노드 추가
    for node in nodes:
        graph.add_node(node)
    
    # 엣지 생성 (0~15개)
    num_edges = draw(st.integers(min_value=0, max_value=15))
    for _ in range(num_edges):
        edge = draw(edge_strategy(node_ids))
        graph.add_edge(edge)
    
    # 그룹 생성 (0~3개)
    num_groups = draw(st.integers(min_value=0, max_value=3))
    for _ in range(num_groups):
        group = draw(group_strategy(node_ids))
        graph.add_group(group)
    
    return graph
