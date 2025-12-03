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
        
        logger.info("EC2 인스턴스 조회 중...")
        ec2_instances = ec2_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ EC2 인스턴스 {len(ec2_instances)}개 발견")
        
        logger.info("VPC 조회 중...")
        vpcs = vpc_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ VPC {len(vpcs)}개 발견")
        
        logger.info("SecurityGroup 조회 중...")
        security_groups = sg_fetcher.fetch(credentials, args.region)
        logger.info(f"  ✓ SecurityGroup {len(security_groups)}개 발견")
        
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
        
    except Exception as e:
        logger.error(f"❌ 에러 발생: {e}", exc_info=True)
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())
