#!/usr/bin/env python3
"""
실제 AWS 계정에서 리소스를 조회하고 draw.io 다이어그램을 생성하는 예제

사용법:
    # 기본 자격증명 사용 (환경변수 또는 ~/.aws/credentials)
    uv run python examples/generate_diagram.py
    
    # CrossAccount Role 사용
    uv run python examples/generate_diagram.py --account-id 123456789012 --role-name ReadOnlyRole
    
    # 특정 리전 지정
    uv run python examples/generate_diagram.py --region us-east-1
"""
import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher
from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher
from aws_resource_fetcher.fetchers.internet_gateway import InternetGatewayFetcher
from aws_resource_fetcher.fetchers.nat_gateway import NATGatewayFetcher
from aws_resource_fetcher.fetchers.route_table import RouteTableFetcher
from aws_resource_fetcher.fetchers.load_balancer import LoadBalancerFetcher
from aws_resource_fetcher.fetchers.rds import RDSFetcher
from aws_resource_fetcher.fetchers.vpc_peering import VPCPeeringFetcher
from resource_graph_builder.builder import GraphBuilder
from drawio_generator.generator import DrawioGenerator

# 로깅 설정 (환경변수 LOG_LEVEL로 조정 가능)
import os
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description='AWS 인프라 다이어그램 생성')
    parser.add_argument('--account-id', help='AWS 계정 ID (CrossAccount 사용 시)')
    parser.add_argument('--role-name', help='AssumeRole 이름 (CrossAccount 사용 시)')
    parser.add_argument('--region', default='ap-northeast-2', help='AWS 리전 (기본: ap-northeast-2)')
    parser.add_argument('--output', default='aws-infrastructure.drawio', help='출력 파일명')
    parser.add_argument('--save-json', action='store_true', help='중간 JSON 파일도 저장')
    
    args = parser.parse_args()
    
    try:
        # 1. AWS 자격증명 획득
        logger.info("=" * 60)
        logger.info("Phase 1: AWS 리소스 조회")
        logger.info("=" * 60)
        
        credential_manager = AWSCredentialManager()
        
        if args.account_id and args.role_name:
            logger.info(f"CrossAccount Role 사용: {args.account_id}/{args.role_name}")
            credentials = credential_manager.assume_role(
                account_id=args.account_id,
                role_name=args.role_name,
                region=args.region
            )
        else:
            logger.info("기본 자격증명 사용")
            credentials = credential_manager.get_default_credentials()
        
        logger.info(f"리전: {args.region}")
        
        # 2. AWS 리소스 조회
        ec2_fetcher = EC2Fetcher()
        vpc_fetcher = VPCFetcher()
        sg_fetcher = SecurityGroupFetcher()
        igw_fetcher = InternetGatewayFetcher()
        nat_fetcher = NATGatewayFetcher()
        rt_fetcher = RouteTableFetcher()
        lb_fetcher = LoadBalancerFetcher()
        rds_fetcher = RDSFetcher()
        pcx_fetcher = VPCPeeringFetcher()
        
        logger.info("EC2 인스턴스 조회 중...")
        ec2_instances = ec2_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ EC2 인스턴스 {len(ec2_instances)}개 발견")
        
        logger.info("VPC 조회 중...")
        vpcs = vpc_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ VPC {len(vpcs)}개 발견")
        
        logger.info("SecurityGroup 조회 중...")
        security_groups = sg_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ SecurityGroup {len(security_groups)}개 발견")
        
        logger.info("Internet Gateway 조회 중...")
        internet_gateways = igw_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ Internet Gateway {len(internet_gateways)}개 발견")
        
        logger.info("NAT Gateway 조회 중...")
        nat_gateways = nat_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ NAT Gateway {len(nat_gateways)}개 발견")
        
        logger.info("Route Table 조회 중...")
        route_tables = rt_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ Route Table {len(route_tables)}개 발견")
        
        logger.info("Load Balancer 조회 중...")
        load_balancers = lb_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ Load Balancer {len(load_balancers)}개 발견")
        
        logger.info("RDS 인스턴스 조회 중...")
        rds_instances = rds_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ RDS 인스턴스 {len(rds_instances)}개 발견")
        
        logger.info("VPC Peering Connection 조회 중...")
        vpc_peering_connections = pcx_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ VPC Peering Connection {len(vpc_peering_connections)}개 발견")
        
        # 3. Phase 1 JSON 생성
        phase1_json = {
            'ec2_instances': [
                {
                    'instance_id': ec2.instance_id,
                    'name': ec2.name,
                    'state': ec2.state,
                    'vpc_id': ec2.vpc_id,
                    'subnet_id': ec2.subnet_id,
                    'security_groups': ec2.security_groups,
                    'private_ip': ec2.private_ip,
                    'public_ip': ec2.public_ip
                }
                for ec2 in ec2_instances
            ],
            'vpcs': [
                {
                    'vpc_id': vpc.vpc_id,
                    'name': vpc.name,
                    'cidr_block': vpc.cidr_block,
                    'subnets': [
                        {
                            'subnet_id': subnet.subnet_id,
                            'name': subnet.name,
                            'cidr_block': subnet.cidr_block,
                            'availability_zone': subnet.availability_zone,
                            'vpc_id': vpc.vpc_id
                        }
                        for subnet in vpc.subnets
                    ]
                }
                for vpc in vpcs
            ],
            'security_groups': [
                {
                    'group_id': sg.group_id,
                    'name': sg.name,
                    'vpc_id': sg.vpc_id,
                    'description': sg.description,
                    'inbound_rules': [
                        {
                            'protocol': rule.protocol,
                            'from_port': rule.from_port,
                            'to_port': rule.to_port,
                            'target': rule.target
                        }
                        for rule in sg.inbound_rules
                    ],
                    'outbound_rules': [
                        {
                            'protocol': rule.protocol,
                            'from_port': rule.from_port,
                            'to_port': rule.to_port,
                            'target': rule.target
                        }
                        for rule in sg.outbound_rules
                    ]
                }
                for sg in security_groups
            ],
            'internet_gateways': [
                {
                    'gateway_id': igw.gateway_id,
                    'name': igw.name,
                    'vpc_id': igw.vpc_id,
                    'state': igw.state
                }
                for igw in internet_gateways
            ],
            'nat_gateways': [
                {
                    'gateway_id': nat.gateway_id,
                    'name': nat.name,
                    'vpc_id': nat.vpc_id,
                    'subnet_id': nat.subnet_id,
                    'state': nat.state,
                    'public_ip': nat.public_ip
                }
                for nat in nat_gateways
            ],
            'route_tables': [
                {
                    'route_table_id': rt.route_table_id,
                    'name': rt.name,
                    'vpc_id': rt.vpc_id,
                    'routes': [
                        {
                            'destination': route.destination,
                            'target_type': route.target_type,
                            'target_id': route.target_id
                        }
                        for route in rt.routes
                    ],
                    'subnet_associations': rt.subnet_associations,
                    'is_main': rt.is_main
                }
                for rt in route_tables
            ],
            'load_balancers': [
                {
                    'load_balancer_arn': lb.load_balancer_arn,
                    'name': lb.name,
                    'load_balancer_type': lb.load_balancer_type,
                    'scheme': lb.scheme,
                    'vpc_id': lb.vpc_id,
                    'subnet_ids': lb.subnet_ids,
                    'security_groups': lb.security_groups,
                    'state': lb.state,
                    'dns_name': lb.dns_name
                }
                for lb in load_balancers
            ],
            'rds_instances': [
                {
                    'db_instance_identifier': rds.db_instance_identifier,
                    'db_instance_arn': rds.db_instance_arn,
                    'name': rds.name,
                    'engine': rds.engine,
                    'engine_version': rds.engine_version,
                    'db_instance_class': rds.db_instance_class,
                    'vpc_id': rds.vpc_id,
                    'subnet_group_name': rds.subnet_group_name,
                    'subnet_ids': rds.subnet_ids,
                    'security_groups': rds.security_groups,
                    'availability_zone': rds.availability_zone,
                    'multi_az': rds.multi_az,
                    'publicly_accessible': rds.publicly_accessible,
                    'endpoint': rds.endpoint,
                    'port': rds.port,
                    'status': rds.status
                }
                for rds in rds_instances
            ],
            'vpc_peering_connections': [
                {
                    'peering_connection_id': pcx.peering_connection_id,
                    'name': pcx.name,
                    'requester_vpc_id': pcx.requester_vpc_id,
                    'accepter_vpc_id': pcx.accepter_vpc_id,
                    'requester_cidr': pcx.requester_cidr,
                    'accepter_cidr': pcx.accepter_cidr,
                    'requester_owner_id': pcx.requester_owner_id,
                    'accepter_owner_id': pcx.accepter_owner_id,
                    'requester_region': pcx.requester_region,
                    'accepter_region': pcx.accepter_region,
                    'status': pcx.status
                }
                for pcx in vpc_peering_connections
            ]
        }
        
        if args.save_json:
            phase1_file = args.output.replace('.drawio', '-phase1.json')
            with open(phase1_file, 'w', encoding='utf-8') as f:
                json.dump(phase1_json, f, indent=2, ensure_ascii=False)
            logger.info(f"Phase 1 JSON 저장: {phase1_file}")
        
        # 4. Phase 2: 리소스 그래프 생성
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 2: 리소스 그래프 생성")
        logger.info("=" * 60)
        
        builder = GraphBuilder()
        graph = builder.build(phase1_json)
        graph_json = graph.to_dict()
        
        logger.info(f"노드: {graph_json['metadata']['node_count']}개")
        logger.info(f"엣지: {graph_json['metadata']['edge_count']}개")
        logger.info(f"그룹: {graph_json['metadata']['group_count']}개")
        
        if args.save_json:
            phase2_file = args.output.replace('.drawio', '-phase2.json')
            with open(phase2_file, 'w', encoding='utf-8') as f:
                json.dump(graph_json, f, indent=2, ensure_ascii=False)
            logger.info(f"Phase 2 JSON 저장: {phase2_file}")
        
        # 5. Phase 3: draw.io XML 생성
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 3: draw.io XML 생성")
        logger.info("=" * 60)
        
        generator = DrawioGenerator()
        xml_output = generator.generate(graph_json)
        
        # 6. 파일 저장
        output_path = Path(args.output)
        output_path.write_text(xml_output, encoding='utf-8')
        
        logger.info("")
        logger.info("=" * 60)
        logger.info("✅ 완료!")
        logger.info("=" * 60)
        logger.info(f"출력 파일: {output_path.absolute()}")
        logger.info("")
        logger.info("다음 단계:")
        logger.info("1. draw.io 웹사이트 방문: https://app.diagrams.net/")
        logger.info(f"2. 파일 열기: {output_path.absolute()}")
        logger.info("3. 다이어그램 확인 및 편집")
        logger.info("")
        
        # 요약 정보 출력
        logger.info("리소스 요약:")
        logger.info(f"  - VPC: {len(vpcs)}개")
        total_subnets = sum(len(vpc.subnets) for vpc in vpcs)
        logger.info(f"  - Subnet: {total_subnets}개")
        logger.info(f"  - EC2: {len(ec2_instances)}개")
        logger.info(f"  - SecurityGroup: {len(security_groups)}개")
        logger.info(f"  - Internet Gateway: {len(internet_gateways)}개")
        logger.info(f"  - NAT Gateway: {len(nat_gateways)}개")
        logger.info(f"  - Route Table: {len(route_tables)}개")
        logger.info(f"  - Load Balancer: {len(load_balancers)}개")
        logger.info(f"  - RDS: {len(rds_instances)}개")
        logger.info(f"  - VPC Peering: {len(vpc_peering_connections)}개")
        
    except Exception as e:
        logger.error(f"❌ 에러 발생: {e}", exc_info=True)
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())
