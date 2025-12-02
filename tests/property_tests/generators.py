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
    @st.composite
    def _cidr_block(draw):
        # 유효한 CIDR 블록 생성 (prefix는 0-32)
        octet1 = 10
        octet2 = draw(st.integers(min_value=0, max_value=255))
        octet3 = draw(st.integers(min_value=0, max_value=255))
        octet4 = draw(st.integers(min_value=0, max_value=255))
        prefix = draw(st.integers(min_value=16, max_value=28))  # 일반적인 서브넷 범위
        return f"{octet1}.{octet2}.{octet3}.{octet4}/{prefix}"
    
    return st.builds(
        Subnet,
        subnet_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"subnet-{x}"),
        name=st.text(min_size=1, max_size=50),
        cidr_block=_cidr_block(),
        availability_zone=st.sampled_from([
            "ap-northeast-2a",
            "ap-northeast-2b",
            "ap-northeast-2c",
            "ap-northeast-2d"
        ])
    )


def vpc_strategy() -> st.SearchStrategy[VPC]:
    """VPC 객체를 생성하는 Hypothesis 전략"""
    @st.composite
    def _cidr_block(draw):
        # 유효한 CIDR 블록 생성 (prefix는 0-32)
        octet1 = 10
        octet2 = draw(st.integers(min_value=0, max_value=255))
        octet3 = draw(st.integers(min_value=0, max_value=255))
        octet4 = draw(st.integers(min_value=0, max_value=255))
        prefix = draw(st.integers(min_value=16, max_value=24))  # VPC는 일반적으로 /16-/24
        return f"{octet1}.{octet2}.{octet3}.{octet4}/{prefix}"
    
    return st.builds(
        VPC,
        vpc_id=st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
            min_size=8,
            max_size=17
        ).map(lambda x: f"vpc-{x}"),
        name=st.text(min_size=1, max_size=50),
        cidr_block=_cidr_block(),
        subnets=st.lists(subnet_strategy(), min_size=0, max_size=5)
    )



def security_group_rule_strategy() -> st.SearchStrategy[SecurityGroupRule]:
    """SecurityGroupRule 객체를 생성하는 Hypothesis 전략"""
    @st.composite
    def _security_group_rule(draw):
        protocol = draw(st.sampled_from(["tcp", "udp", "icmp", "-1"]))  # -1은 all protocols
        
        # 포트 범위 생성 (from_port <= to_port 보장)
        # ICMP나 all protocols의 경우 포트가 None일 수 있음
        if protocol in ["icmp", "-1"]:
            # ICMP나 all protocols는 포트가 없을 수 있음
            from_port = None
            to_port = None
        else:
            # TCP/UDP는 포트 범위 필요
            port_option = draw(st.sampled_from(["none", "single", "range"]))
            
            if port_option == "none":
                from_port = None
                to_port = None
            elif port_option == "single":
                # 단일 포트
                port = draw(st.integers(min_value=0, max_value=65535))
                from_port = port
                to_port = port
            else:
                # 포트 범위 (from_port <= to_port 보장)
                port1 = draw(st.integers(min_value=0, max_value=65535))
                port2 = draw(st.integers(min_value=0, max_value=65535))
                from_port = min(port1, port2)
                to_port = max(port1, port2)
        
        target = draw(st.one_of(
            # CIDR 블록
            st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
            # 보안그룹 ID
            st.text(
                alphabet=st.characters(whitelist_categories=("Ll", "Nd")),
                min_size=8,
                max_size=17
            ).map(lambda x: f"sg-{x}")
        ))
        
        return SecurityGroupRule(
            protocol=protocol,
            from_port=from_port,
            to_port=to_port,
            target=target
        )
    
    return _security_group_rule()


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


def phase1_json_strategy() -> st.SearchStrategy[dict]:
    """
    Phase 1 JSON 데이터를 생성하는 Hypothesis 전략
    
    ResourceParser.parse()의 입력으로 사용되는 JSON 구조를 생성
    """
    @st.composite
    def _cidr_block_generator(draw, is_vpc=False):
        """유효한 CIDR 블록 생성"""
        octet1 = 10
        octet2 = draw(st.integers(min_value=0, max_value=255))
        octet3 = draw(st.integers(min_value=0, max_value=255))
        octet4 = draw(st.integers(min_value=0, max_value=255))
        if is_vpc:
            prefix = draw(st.integers(min_value=16, max_value=24))  # VPC는 /16-/24
        else:
            prefix = draw(st.integers(min_value=16, max_value=28))  # Subnet은 /16-/28
        return f"{octet1}.{octet2}.{octet3}.{octet4}/{prefix}"
    
    @st.composite
    def _phase1_json(draw):
        # VPC 생성 (먼저 생성하여 ID를 재사용)
        num_vpcs = draw(st.integers(min_value=0, max_value=3))
        vpcs = []
        vpc_ids = []
        used_vpc_ids = set()
        
        for i in range(num_vpcs):
            # 중복되지 않는 VPC ID 생성 (인덱스를 포함하여 고유성 보장)
            vpc_id = f"vpc-{i:08d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}"
            used_vpc_ids.add(vpc_id)
            vpc_ids.append(vpc_id)
            
            # Subnet 생성
            num_subnets = draw(st.integers(min_value=0, max_value=3))
            subnets = []
            used_subnet_ids = set()
            for j in range(num_subnets):
                # 중복되지 않는 Subnet ID 생성 (VPC 인덱스와 Subnet 인덱스를 포함하여 고유성 보장)
                subnet_id = f"subnet-{i:04d}{j:04d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}"
                used_subnet_ids.add(subnet_id)
                
                subnet = {
                    'subnet_id': subnet_id,
                    'name': draw(st.text(min_size=1, max_size=50)),
                    'cidr_block': draw(_cidr_block_generator(is_vpc=False)),
                    'availability_zone': draw(st.sampled_from(['ap-northeast-2a', 'ap-northeast-2b', 'ap-northeast-2c']))
                }
                subnets.append(subnet)
            
            vpc = {
                'vpc_id': vpc_id,
                'name': draw(st.text(min_size=1, max_size=50)),
                'cidr_block': draw(_cidr_block_generator(is_vpc=True)),
                'subnets': subnets
            }
            vpcs.append(vpc)
        
        # SecurityGroup 생성 (VPC ID 재사용)
        num_sgs = draw(st.integers(min_value=0, max_value=3))
        security_groups = []
        sg_ids = []
        used_sg_ids = set()
        
        for k in range(num_sgs):
            # 중복되지 않는 SecurityGroup ID 생성 (인덱스를 포함하여 고유성 보장)
            sg_id = f"sg-{k:08d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}"
            used_sg_ids.add(sg_id)
            sg_ids.append(sg_id)
            
            # 규칙 생성
            num_inbound = draw(st.integers(min_value=0, max_value=3))
            inbound_rules = []
            for _ in range(num_inbound):
                protocol = draw(st.sampled_from(['tcp', 'udp', 'icmp', '-1']))
                
                # 포트 범위 생성 (from_port <= to_port 보장)
                if protocol in ["icmp", "-1"]:
                    from_port = None
                    to_port = None
                else:
                    port_option = draw(st.sampled_from(["none", "single", "range"]))
                    if port_option == "none":
                        from_port = None
                        to_port = None
                    elif port_option == "single":
                        port = draw(st.integers(min_value=0, max_value=65535))
                        from_port = port
                        to_port = port
                    else:
                        port1 = draw(st.integers(min_value=0, max_value=65535))
                        port2 = draw(st.integers(min_value=0, max_value=65535))
                        from_port = min(port1, port2)
                        to_port = max(port1, port2)
                
                rule = {
                    'protocol': protocol,
                    'from_port': from_port,
                    'to_port': to_port,
                    'target': draw(st.one_of(
                        st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
                        st.sampled_from(sg_ids) if sg_ids else st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
                    ))
                }
                inbound_rules.append(rule)
            
            num_outbound = draw(st.integers(min_value=0, max_value=3))
            outbound_rules = []
            for _ in range(num_outbound):
                protocol = draw(st.sampled_from(['tcp', 'udp', 'icmp', '-1']))
                
                # 포트 범위 생성 (from_port <= to_port 보장)
                if protocol in ["icmp", "-1"]:
                    from_port = None
                    to_port = None
                else:
                    port_option = draw(st.sampled_from(["none", "single", "range"]))
                    if port_option == "none":
                        from_port = None
                        to_port = None
                    elif port_option == "single":
                        port = draw(st.integers(min_value=0, max_value=65535))
                        from_port = port
                        to_port = port
                    else:
                        port1 = draw(st.integers(min_value=0, max_value=65535))
                        port2 = draw(st.integers(min_value=0, max_value=65535))
                        from_port = min(port1, port2)
                        to_port = max(port1, port2)
                
                rule = {
                    'protocol': protocol,
                    'from_port': from_port,
                    'to_port': to_port,
                    'target': draw(st.one_of(
                        st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True),
                        st.sampled_from(sg_ids) if sg_ids else st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$", fullmatch=True)
                    ))
                }
                outbound_rules.append(rule)
            
            # SecurityGroup은 반드시 유효한 VPC를 참조해야 함
            if vpc_ids:
                # 기존 VPC 중 하나 선택
                sg_vpc_id = draw(st.sampled_from(vpc_ids))
            else:
                # VPC가 없으면 새로 생성
                sg_vpc_id = f"vpc-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=8, max_size=17))}"
                vpc_ids.append(sg_vpc_id)
                
                # 새 VPC를 vpcs 리스트에 추가
                new_vpc = {
                    'vpc_id': sg_vpc_id,
                    'name': draw(st.text(min_size=1, max_size=50)),
                    'cidr_block': draw(_cidr_block_generator(is_vpc=True)),
                    'subnets': []
                }
                vpcs.append(new_vpc)
            
            sg = {
                'group_id': sg_id,
                'name': draw(st.text(min_size=1, max_size=50)),
                'vpc_id': sg_vpc_id,
                'description': draw(st.text(min_size=0, max_size=255)),
                'inbound_rules': inbound_rules,
                'outbound_rules': outbound_rules
            }
            security_groups.append(sg)
        
        # EC2 인스턴스 생성 (VPC, Subnet, SG ID 재사용)
        # EC2는 반드시 유효한 VPC와 Subnet을 참조해야 함
        num_ec2 = draw(st.integers(min_value=0, max_value=3))
        ec2_instances = []
        used_ec2_ids = set()
        
        # VPC와 Subnet이 있는 경우에만 EC2 생성
        vpcs_with_subnets = [vpc for vpc in vpcs if vpc['subnets']]
        
        for m in range(num_ec2):
            # VPC와 Subnet 선택
            if vpcs_with_subnets:
                # Subnet이 있는 VPC 중에서 선택
                selected_vpc = draw(st.sampled_from(vpcs_with_subnets))
                vpc_id = selected_vpc['vpc_id']
                subnet_id = draw(st.sampled_from(selected_vpc['subnets']))['subnet_id']
            elif vpcs:
                # VPC는 있지만 Subnet이 없는 경우, 새로운 Subnet 생성
                selected_vpc = draw(st.sampled_from(vpcs))
                vpc_id = selected_vpc['vpc_id']
                
                # 새 Subnet 생성 및 VPC에 추가
                new_subnet_idx = len(selected_vpc['subnets'])
                new_subnet = {
                    'subnet_id': f"subnet-new{new_subnet_idx:08d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}",
                    'name': draw(st.text(min_size=1, max_size=50)),
                    'cidr_block': draw(_cidr_block_generator(is_vpc=False)),
                    'availability_zone': draw(st.sampled_from(['ap-northeast-2a', 'ap-northeast-2b', 'ap-northeast-2c']))
                }
                selected_vpc['subnets'].append(new_subnet)
                subnet_id = new_subnet['subnet_id']
            else:
                # VPC가 없는 경우, 새로운 VPC와 Subnet 생성
                new_vpc_idx = len(vpcs)
                vpc_id = f"vpc-new{new_vpc_idx:08d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}"
                subnet_id = f"subnet-new{new_vpc_idx:08d}0000{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=9))}"
                
                new_subnet = {
                    'subnet_id': subnet_id,
                    'name': draw(st.text(min_size=1, max_size=50)),
                    'cidr_block': draw(_cidr_block_generator(is_vpc=False)),
                    'availability_zone': draw(st.sampled_from(['ap-northeast-2a', 'ap-northeast-2b', 'ap-northeast-2c']))
                }
                
                new_vpc = {
                    'vpc_id': vpc_id,
                    'name': draw(st.text(min_size=1, max_size=50)),
                    'cidr_block': draw(_cidr_block_generator(is_vpc=True)),
                    'subnets': [new_subnet]
                }
                vpcs.append(new_vpc)
                vpc_ids.append(vpc_id)
            
            # SecurityGroup 선택
            if sg_ids:
                selected_sgs = draw(st.lists(st.sampled_from(sg_ids), min_size=0, max_size=min(3, len(sg_ids))))
            else:
                selected_sgs = []
            
            # 중복되지 않는 EC2 인스턴스 ID 생성 (인덱스를 포함하여 고유성 보장)
            instance_id = f"i-{m:010d}{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=1, max_size=10))}"
            used_ec2_ids.add(instance_id)
            
            ec2 = {
                'instance_id': instance_id,
                'name': draw(st.text(min_size=1, max_size=50)),
                'state': draw(st.sampled_from(['running', 'stopped', 'pending', 'terminated'])),
                'vpc_id': vpc_id,
                'subnet_id': subnet_id,
                'security_groups': selected_sgs,
                'private_ip': draw(st.from_regex(r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True)),
                'public_ip': draw(st.one_of(st.none(), st.from_regex(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", fullmatch=True)))
            }
            ec2_instances.append(ec2)
        
        return {
            'ec2_instances': ec2_instances,
            'vpcs': vpcs,
            'security_groups': security_groups
        }
    
    return _phase1_json()


def invalid_phase1_json_strategy() -> st.SearchStrategy[dict]:
    """
    유효하지 않은 Phase 1 JSON 데이터를 생성하는 Hypothesis 전략
    
    다양한 유형의 유효하지 않은 입력을 생성:
    - 필수 필드 누락
    - 잘못된 타입
    - 중첩된 객체의 필수 필드 누락
    """
    @st.composite
    def _invalid_phase1_json(draw):
        # 어떤 종류의 invalid input을 생성할지 선택
        invalid_type = draw(st.sampled_from([
            'missing_top_level_field',
            'wrong_top_level_type',
            'ec2_missing_field',
            'ec2_wrong_type',
            'vpc_missing_field',
            'vpc_wrong_type',
            'sg_missing_field',
            'sg_wrong_type',
            'subnet_missing_field',
            'sg_rule_missing_field'
        ]))
        
        # 기본 유효한 데이터 생성
        valid_ec2 = {
            'instance_id': f"i-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=10, max_size=20))}",
            'name': draw(st.text(min_size=1, max_size=50)),
            'state': 'running',
            'vpc_id': 'vpc-123',
            'subnet_id': 'subnet-123',
            'security_groups': ['sg-123'],
            'private_ip': '10.0.1.10',
            'public_ip': None
        }
        
        valid_subnet = {
            'subnet_id': 'subnet-123',
            'name': draw(st.text(min_size=1, max_size=50)),
            'cidr_block': '10.0.1.0/24',
            'availability_zone': 'ap-northeast-2a'
        }
        
        valid_vpc = {
            'vpc_id': 'vpc-123',
            'name': draw(st.text(min_size=1, max_size=50)),
            'cidr_block': '10.0.0.0/16',
            'subnets': [valid_subnet]
        }
        
        valid_sg = {
            'group_id': 'sg-123',
            'name': draw(st.text(min_size=1, max_size=50)),
            'vpc_id': 'vpc-123',
            'description': 'Test SG',
            'inbound_rules': [],
            'outbound_rules': []
        }
        
        # Invalid input 생성
        if invalid_type == 'missing_top_level_field':
            # 최상위 필수 필드 누락
            missing_field = draw(st.sampled_from(['ec2_instances', 'vpcs', 'security_groups']))
            result = {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
            del result[missing_field]
            return result
        
        elif invalid_type == 'wrong_top_level_type':
            # 최상위 필드 타입 불일치
            wrong_field = draw(st.sampled_from(['ec2_instances', 'vpcs', 'security_groups']))
            wrong_value = draw(st.one_of(
                st.text(),
                st.integers(),
                st.dictionaries(st.text(), st.text())
            ))
            result = {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
            result[wrong_field] = wrong_value
            return result
        
        elif invalid_type == 'ec2_missing_field':
            # EC2 필수 필드 누락
            missing_field = draw(st.sampled_from([
                'instance_id', 'name', 'state', 'vpc_id', 
                'subnet_id', 'security_groups', 'private_ip'
            ]))
            invalid_ec2 = valid_ec2.copy()
            del invalid_ec2[missing_field]
            return {
                'ec2_instances': [invalid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_type == 'ec2_wrong_type':
            # EC2 필드 타입 불일치
            wrong_field = draw(st.sampled_from([
                'instance_id', 'name', 'state', 'vpc_id', 
                'subnet_id', 'security_groups', 'private_ip'
            ]))
            invalid_ec2 = valid_ec2.copy()
            
            if wrong_field == 'security_groups':
                invalid_ec2[wrong_field] = 'not-a-list'
            else:
                invalid_ec2[wrong_field] = 12345  # 숫자로 변경
            
            return {
                'ec2_instances': [invalid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_type == 'vpc_missing_field':
            # VPC 필수 필드 누락
            missing_field = draw(st.sampled_from(['vpc_id', 'name', 'cidr_block', 'subnets']))
            invalid_vpc = valid_vpc.copy()
            del invalid_vpc[missing_field]
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [invalid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_type == 'vpc_wrong_type':
            # VPC 필드 타입 불일치
            wrong_field = draw(st.sampled_from(['vpc_id', 'name', 'cidr_block', 'subnets']))
            invalid_vpc = valid_vpc.copy()
            
            if wrong_field == 'subnets':
                invalid_vpc[wrong_field] = 'not-a-list'
            else:
                invalid_vpc[wrong_field] = 12345
            
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [invalid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_type == 'sg_missing_field':
            # SecurityGroup 필수 필드 누락
            missing_field = draw(st.sampled_from([
                'group_id', 'name', 'vpc_id', 'description', 
                'inbound_rules', 'outbound_rules'
            ]))
            invalid_sg = valid_sg.copy()
            del invalid_sg[missing_field]
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [invalid_sg]
            }
        
        elif invalid_type == 'sg_wrong_type':
            # SecurityGroup 필드 타입 불일치
            wrong_field = draw(st.sampled_from([
                'group_id', 'name', 'vpc_id', 'description', 
                'inbound_rules', 'outbound_rules'
            ]))
            invalid_sg = valid_sg.copy()
            
            if wrong_field in ['inbound_rules', 'outbound_rules']:
                invalid_sg[wrong_field] = 'not-a-list'
            else:
                invalid_sg[wrong_field] = 12345
            
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [invalid_sg]
            }
        
        elif invalid_type == 'subnet_missing_field':
            # Subnet 필수 필드 누락
            missing_field = draw(st.sampled_from([
                'subnet_id', 'name', 'cidr_block', 'availability_zone'
            ]))
            invalid_subnet = valid_subnet.copy()
            del invalid_subnet[missing_field]
            
            invalid_vpc = valid_vpc.copy()
            invalid_vpc['subnets'] = [invalid_subnet]
            
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [invalid_vpc],
                'security_groups': [valid_sg]
            }
        
        else:  # sg_rule_missing_field
            # SecurityGroup 규칙 필수 필드 누락
            missing_field = draw(st.sampled_from(['protocol', 'target']))
            invalid_rule = {
                'protocol': 'tcp',
                'from_port': 80,
                'to_port': 80,
                'target': '0.0.0.0/0'
            }
            del invalid_rule[missing_field]
            
            invalid_sg = valid_sg.copy()
            invalid_sg['inbound_rules'] = [invalid_rule]
            
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [invalid_sg]
            }
    
    return _invalid_phase1_json()



def phase1_json_with_invalid_references_strategy() -> st.SearchStrategy[dict]:
    """
    유효하지 않은 리소스 참조를 포함하는 Phase 1 JSON 데이터를 생성하는 Hypothesis 전략
    
    다양한 유형의 유효하지 않은 참조를 생성:
    - EC2가 존재하지 않는 VPC를 참조
    - EC2가 존재하지 않는 Subnet을 참조
    - EC2가 존재하지 않는 SecurityGroup을 참조
    - SecurityGroup이 존재하지 않는 VPC를 참조
    """
    @st.composite
    def _phase1_json_with_invalid_references(draw):
        # 어떤 종류의 invalid reference를 생성할지 선택
        invalid_ref_type = draw(st.sampled_from([
            'ec2_invalid_vpc',
            'ec2_invalid_subnet',
            'ec2_invalid_sg',
            'sg_invalid_vpc'
        ]))
        
        # 기본 유효한 데이터 생성
        vpc_id = 'vpc-valid123'
        subnet_id = 'subnet-valid123'
        sg_id = 'sg-valid123'
        
        valid_subnet = {
            'subnet_id': subnet_id,
            'name': draw(st.text(min_size=1, max_size=50)),
            'cidr_block': '10.0.1.0/24',
            'availability_zone': 'ap-northeast-2a'
        }
        
        valid_vpc = {
            'vpc_id': vpc_id,
            'name': draw(st.text(min_size=1, max_size=50)),
            'cidr_block': '10.0.0.0/16',
            'subnets': [valid_subnet]
        }
        
        valid_sg = {
            'group_id': sg_id,
            'name': draw(st.text(min_size=1, max_size=50)),
            'vpc_id': vpc_id,
            'description': 'Test SG',
            'inbound_rules': [],
            'outbound_rules': []
        }
        
        # Invalid reference 생성
        if invalid_ref_type == 'ec2_invalid_vpc':
            # EC2가 존재하지 않는 VPC를 참조
            invalid_vpc_id = f"vpc-invalid{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=5, max_size=10))}"
            
            invalid_ec2 = {
                'instance_id': f"i-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=10, max_size=20))}",
                'name': draw(st.text(min_size=1, max_size=50)),
                'state': 'running',
                'vpc_id': invalid_vpc_id,  # 존재하지 않는 VPC
                'subnet_id': subnet_id,
                'security_groups': [sg_id],
                'private_ip': '10.0.1.10',
                'public_ip': None
            }
            
            return {
                'ec2_instances': [invalid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_ref_type == 'ec2_invalid_subnet':
            # EC2가 존재하지 않는 Subnet을 참조
            invalid_subnet_id = f"subnet-invalid{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=5, max_size=10))}"
            
            invalid_ec2 = {
                'instance_id': f"i-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=10, max_size=20))}",
                'name': draw(st.text(min_size=1, max_size=50)),
                'state': 'running',
                'vpc_id': vpc_id,
                'subnet_id': invalid_subnet_id,  # 존재하지 않는 Subnet
                'security_groups': [sg_id],
                'private_ip': '10.0.1.10',
                'public_ip': None
            }
            
            return {
                'ec2_instances': [invalid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
        
        elif invalid_ref_type == 'ec2_invalid_sg':
            # EC2가 존재하지 않는 SecurityGroup을 참조
            invalid_sg_id = f"sg-invalid{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=5, max_size=10))}"
            
            invalid_ec2 = {
                'instance_id': f"i-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=10, max_size=20))}",
                'name': draw(st.text(min_size=1, max_size=50)),
                'state': 'running',
                'vpc_id': vpc_id,
                'subnet_id': subnet_id,
                'security_groups': [invalid_sg_id],  # 존재하지 않는 SecurityGroup
                'private_ip': '10.0.1.10',
                'public_ip': None
            }
            
            return {
                'ec2_instances': [invalid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [valid_sg]
            }
        
        else:  # sg_invalid_vpc
            # SecurityGroup이 존재하지 않는 VPC를 참조
            invalid_vpc_id = f"vpc-invalid{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=5, max_size=10))}"
            
            invalid_sg = {
                'group_id': sg_id,
                'name': draw(st.text(min_size=1, max_size=50)),
                'vpc_id': invalid_vpc_id,  # 존재하지 않는 VPC
                'description': 'Test SG',
                'inbound_rules': [],
                'outbound_rules': []
            }
            
            # EC2는 유효한 VPC를 참조
            valid_ec2 = {
                'instance_id': f"i-{draw(st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd')), min_size=10, max_size=20))}",
                'name': draw(st.text(min_size=1, max_size=50)),
                'state': 'running',
                'vpc_id': vpc_id,
                'subnet_id': subnet_id,
                'security_groups': [],  # SG 참조 안 함
                'private_ip': '10.0.1.10',
                'public_ip': None
            }
            
            return {
                'ec2_instances': [valid_ec2],
                'vpcs': [valid_vpc],
                'security_groups': [invalid_sg]
            }
    
    return _phase1_json_with_invalid_references()
