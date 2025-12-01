"""AWS 리소스 데이터 모델 정의"""
from dataclasses import dataclass
from datetime import datetime


@dataclass
class AWSCredentials:
    """AWS 임시 자격증명"""
    access_key: str
    secret_key: str
    session_token: str
    expiration: datetime


@dataclass
class EC2Instance:
    """EC2 인스턴스 정보"""
    instance_id: str
    name: str
    state: str
    vpc_id: str
    subnet_id: str
    security_groups: list[str]
    private_ip: str
    public_ip: str | None


@dataclass
class Subnet:
    """서브넷 정보"""
    subnet_id: str
    name: str
    cidr_block: str
    availability_zone: str


@dataclass
class VPC:
    """VPC 정보"""
    vpc_id: str
    name: str
    cidr_block: str
    subnets: list[Subnet]


@dataclass
class SecurityGroupRule:
    """보안그룹 규칙"""
    protocol: str
    from_port: int | None
    to_port: int | None
    target: str  # CIDR or sg-xxx


@dataclass
class SecurityGroup:
    """보안그룹 정보"""
    group_id: str
    name: str
    vpc_id: str
    description: str
    inbound_rules: list[SecurityGroupRule]
    outbound_rules: list[SecurityGroupRule]
