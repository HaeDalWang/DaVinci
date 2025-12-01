"""Hypothesis 전략 (generators) 정의"""
from hypothesis import strategies as st
from aws_resource_fetcher.models import EC2Instance


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
