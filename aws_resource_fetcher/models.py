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


@dataclass
class InternetGateway:
    """Internet Gateway 정보"""
    gateway_id: str
    name: str
    vpc_id: str | None  # Detached 상태일 수 있음
    state: str  # available, attaching, detaching, detached


@dataclass
class NATGateway:
    """NAT Gateway 정보"""
    gateway_id: str
    name: str
    vpc_id: str
    subnet_id: str
    state: str  # pending, failed, available, deleting, deleted
    public_ip: str | None  # Elastic IP


@dataclass
class Route:
    """Route Table의 개별 라우트"""
    destination: str  # CIDR (e.g., 0.0.0.0/0, 10.0.0.0/16)
    target_type: str  # igw, nat, local, peering, etc.
    target_id: str | None  # igw-xxx, nat-xxx, pcx-xxx, local


@dataclass
class RouteTable:
    """Route Table 정보"""
    route_table_id: str
    name: str
    vpc_id: str
    routes: list[Route]
    subnet_associations: list[str]  # 연결된 Subnet ID 목록
    is_main: bool  # Main route table 여부


@dataclass
class LoadBalancer:
    """Load Balancer 정보 (ALB, NLB, CLB)"""
    load_balancer_arn: str
    name: str
    load_balancer_type: str  # application, network, classic
    scheme: str  # internet-facing, internal
    vpc_id: str
    subnet_ids: list[str]  # 연결된 Subnet ID 목록
    security_groups: list[str]  # 연결된 SecurityGroup ID 목록 (ALB/CLB만)
    state: str  # active, provisioning, failed
    dns_name: str  # Load Balancer DNS 이름


@dataclass
class RDSInstance:
    """RDS 인스턴스 정보"""
    db_instance_identifier: str
    db_instance_arn: str
    name: str  # DBName 또는 identifier
    engine: str  # mysql, postgres, mariadb, oracle-ee, sqlserver-ex, aurora, etc.
    engine_version: str
    db_instance_class: str  # db.t3.micro, db.r5.large, etc.
    vpc_id: str
    subnet_group_name: str
    subnet_ids: list[str]  # DB Subnet Group의 Subnet ID 목록
    security_groups: list[str]  # VPC Security Group ID 목록
    availability_zone: str
    multi_az: bool
    publicly_accessible: bool
    endpoint: str  # 엔드포인트 주소
    port: int
    status: str  # available, creating, deleting, etc.


@dataclass
class VPCPeeringConnection:
    """VPC Peering Connection 정보"""
    peering_connection_id: str
    name: str  # Name 태그
    requester_vpc_id: str  # 요청자 VPC ID
    accepter_vpc_id: str  # 수락자 VPC ID
    requester_cidr: str  # 요청자 VPC CIDR
    accepter_cidr: str  # 수락자 VPC CIDR
    requester_owner_id: str  # 요청자 계정 ID
    accepter_owner_id: str  # 수락자 계정 ID
    requester_region: str  # 요청자 리전
    accepter_region: str  # 수락자 리전
    status: str  # active, pending-acceptance, deleted, etc.
