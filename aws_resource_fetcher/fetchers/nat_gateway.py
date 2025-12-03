"""NAT Gateway 조회 Fetcher"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, NATGateway
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class NATGatewayFetcher(BaseFetcher):
    """NAT Gateway 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='NATGateway')
    
    def fetch_nat_gateways(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[NATGateway]:
        """
        NAT Gateway 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            NATGateway 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching NAT Gateways in region={region}")
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # NAT Gateway 조회 (페이지네이션 처리)
            gateways = []
            paginator = ec2_client.get_paginator('describe_nat_gateways')
            
            for page in paginator.paginate():
                for nat_data in page.get('NatGateways', []):
                    # deleted 상태는 제외
                    if nat_data.get('State') != 'deleted':
                        gateway = self._parse_nat_gateway(nat_data)
                        gateways.append(gateway)
            
            logger.info(f"Fetched {len(gateways)} NAT Gateways")
            return gateways
            
        except ClientError as e:
            logger.error(f"ClientError fetching NAT Gateways: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching NAT Gateways: {e}", exc_info=True)
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
    ) -> list[NATGateway]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            NATGateway 객체 리스트
        """
        return self.fetch_nat_gateways(credentials, region)
    
    def _parse_nat_gateway(self, nat_data: dict[str, Any]) -> NATGateway:
        """
        boto3 응답 데이터를 NATGateway 모델로 변환
        
        Args:
            nat_data: boto3 describe_nat_gateways 응답의 NatGateway 객체
            
        Returns:
            NATGateway 객체
        """
        gateway_id = nat_data['NatGatewayId']
        vpc_id = nat_data['VpcId']
        subnet_id = nat_data['SubnetId']
        state = nat_data['State']
        
        # 이름 추출 (Name 태그에서)
        name = ''
        for tag in nat_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        # Public IP 추출 (첫 번째 NAT Gateway Address 사용)
        public_ip = None
        addresses = nat_data.get('NatGatewayAddresses', [])
        if addresses:
            public_ip = addresses[0].get('PublicIp')
        
        logger.debug(f"Parsed NAT Gateway: id={gateway_id}, name={name}, "
                    f"vpc_id={vpc_id}, subnet_id={subnet_id}, state={state}")
        
        return NATGateway(
            gateway_id=gateway_id,
            name=name,
            vpc_id=vpc_id,
            subnet_id=subnet_id,
            state=state,
            public_ip=public_ip
        )
