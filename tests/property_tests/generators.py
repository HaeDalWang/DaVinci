"""Hypothesis 전략 (generators) 정의"""
from hypothesis import strategies as st
from aws_resource_fetcher.models import EC2Instance, VPC, Subnet, SecurityGroup, SecurityGroupRule


def ec2_instance_strategy() -> st.SearchStrategy[EC2Instance]:
    """EC2Instance 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        EC2Instance,
        instance_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=10,
            max_size=20
        ).map(lambda x: f"i-{x}"),
        name=st.text(min_size=1, max_size=50),
        state=st.sampled_from(["running", "stopped", "pending", "terminated", "stopping"]),
        vpc_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"vpc-{x}"),
        subnet_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"subnet-{x}"),
        security_groups=st.lists(
            st.text(
                alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
                min_size=8,
                max_size=17
            ).map(lambda x: f"sg-{x}"),
            min_size=0,
            max_size=5
        ),
        private_ip=st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True),
        public_ip=st.one_of(
            st.none(),
            st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True)
        )
    )


def subnet_strategy() -> st.SearchStrategy[Subnet]:
    """Subnet 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        Subnet,
        subnet_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"subnet-{x}"),
        name=st.text(min_size=1, max_size=50),
        cidr_block=st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
        availability_zone=st.sampled_from([
            "ap-northeast-2a",
            "ap-northeast-2b",
            "ap-northeast-2c",
            "ap-northeast-2d"
        ])
    )


def vpc_strategy() -> st.SearchStrategy[VPC]:
    """VPC 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        VPC,
        vpc_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"vpc-{x}"),
        name=st.text(min_size=1, max_size=50),
        cidr_block=st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
        subnets=st.lists(subnet_strategy(), min_size=0, max_size=5)
    )



def security_group_rule_strategy() -> st.SearchStrategy[SecurityGroupRule]:
    """SecurityGroupRule 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        SecurityGroupRule,
        protocol=st.sampled_from(["tcp", "udp", "icmp", "-1"]),  # -1은 all protocols
        from_port=st.one_of(
            st.none(),
            st.integers(min_value=0, max_value=65535)
        ),
        to_port=st.one_of(
            st.none(),
            st.integers(min_value=0, max_value=65535)
        ),
        target=st.one_of(
            # CIDR 블록
            st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            # 보안그룹 ID
            st.text(
                alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
                min_size=8,
                max_size=17
            ).map(lambda x: f"sg-{x}")
        )
    )


def security_group_strategy() -> st.SearchStrategy[SecurityGroup]:
    """SecurityGroup 객체를 생성하는 Hypothesis 전략"""
    return st.builds(
        SecurityGroup,
        group_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"sg-{x}"),
        name=st.text(min_size=1, max_size=50),
        vpc_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"vpc-{x}"),
        description=st.text(min_size=0, max_size=255),
        inbound_rules=st.lists(security_group_rule_strategy(), min_size=0, max_size=10),
        outbound_rules=st.lists(security_group_rule_strategy(), min_size=0, max_size=10)
    )
