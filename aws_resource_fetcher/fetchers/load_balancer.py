"""Load Balancer 조회 Fetcher (ALB, NLB, CLB)"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, LoadBalancer
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class LoadBalancerFetcher(BaseFetcher):
    """Load Balancer 정보를 조회하는 Fetcher (ALB, NLB, CLB)"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='LoadBalancer')
    
    def fetch_load_balancers(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[LoadBalancer]:
        """
        Load Balancer 목록을 조회 (ALB, NLB, CLB)
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            LoadBalancer 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching Load Balancers in region={region}")
        try:
            # ELBv2 클라이언트 생성 (ALB, NLB)
            elbv2_client = self._create_client('elbv2', credentials, region)
            
            # Load Balancer 조회 (페이지네이션 처리)
            load_balancers = []
            paginator = elbv2_client.get_paginator('describe_load_balancers')
            
            for page in paginator.paginate():
                for lb_data in page.get('LoadBalancers', []):
                    load_balancer = self._parse_load_balancer(lb_data)
                    load_balancers.append(load_balancer)
            
            logger.info(f"Fetched {len(load_balancers)} Load Balancers")
            return load_balancers
            
        except ClientError as e:
            logger.error(f"ClientError fetching Load Balancers: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching Load Balancers: {e}", exc_info=True)
            raise ResourceFetchError(
                resource_type=self.resource_type,
                original_error=e
            ) from e
        
        # mypy를 위한 명시적 return (실제로는 도달하지 않음)
        return []  # pragma: no cover
    
    def fetch(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[LoadBalancer]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            LoadBalancer 객체 리스트
        """
        return self.fetch_load_balancers(credentials, region)
    
    def _parse_load_balancer(self, lb_data: dict[str, Any]) -> LoadBalancer:
        """
        boto3 응답 데이터를 LoadBalancer 모델로 변환
        
        Args:
            lb_data: boto3 describe_load_balancers 응답의 LoadBalancer 객체
            
        Returns:
            LoadBalancer 객체
        """
        load_balancer_arn = lb_data['LoadBalancerArn']
        name = lb_data['LoadBalancerName']
        load_balancer_type = lb_data.get('Type', 'classic')  # application, network, classic
        scheme = lb_data.get('Scheme', 'internet-facing')  # internet-facing, internal
        vpc_id = lb_data.get('VpcId', '')
        state = lb_data.get('State', {}).get('Code', 'unknown')
        dns_name = lb_data.get('DNSName', '')
        
        # Subnet IDs 추출
        subnet_ids = []
        for az in lb_data.get('AvailabilityZones', []):
            subnet_id = az.get('SubnetId')
            if subnet_id:
                subnet_ids.append(subnet_id)
        
        # Security Groups 추출 (ALB/CLB만 해당, NLB는 없음)
        security_groups = lb_data.get('SecurityGroups', [])
        
        logger.debug(f"Parsed Load Balancer: arn={load_balancer_arn}, name={name}, "
                    f"type={load_balancer_type}, scheme={scheme}, subnets={len(subnet_ids)}")
        
        return LoadBalancer(
            load_balancer_arn=load_balancer_arn,
            name=name,
            load_balancer_type=load_balancer_type,
            scheme=scheme,
            vpc_id=vpc_id,
            subnet_ids=subnet_ids,
            security_groups=security_groups,
            state=state,
            dns_name=dns_name
        )
