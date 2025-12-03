"""Internet Gateway 조회 Fetcher"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, InternetGateway
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class InternetGatewayFetcher(BaseFetcher):
    """Internet Gateway 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='InternetGateway')
    
    def fetch_internet_gateways(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[InternetGateway]:
        """
        Internet Gateway 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            InternetGateway 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching Internet Gateways in region={region}")
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # Internet Gateway 조회 (페이지네이션 처리)
            gateways = []
            paginator = ec2_client.get_paginator('describe_internet_gateways')
            
            for page in paginator.paginate():
                for igw_data in page.get('InternetGateways', []):
                    gateway = self._parse_internet_gateway(igw_data)
                    gateways.append(gateway)
            
            logger.info(f"Fetched {len(gateways)} Internet Gateways")
            return gateways
            
        except ClientError as e:
            logger.error(f"ClientError fetching Internet Gateways: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching Internet Gateways: {e}", exc_info=True)
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
    ) -> list[InternetGateway]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            InternetGateway 객체 리스트
        """
        return self.fetch_internet_gateways(credentials, region)
    
    def _parse_internet_gateway(self, igw_data: dict[str, Any]) -> InternetGateway:
        """
        boto3 응답 데이터를 InternetGateway 모델로 변환
        
        Args:
            igw_data: boto3 describe_internet_gateways 응답의 InternetGateway 객체
            
        Returns:
            InternetGateway 객체
        """
        gateway_id = igw_data['InternetGatewayId']
        
        # 이름 추출 (Name 태그에서)
        name = ''
        for tag in igw_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        # VPC 연결 정보 추출
        vpc_id = None
        state = 'detached'
        attachments = igw_data.get('Attachments', [])
        if attachments:
            # 첫 번째 attachment 사용 (보통 하나만 있음)
            attachment = attachments[0]
            vpc_id = attachment.get('VpcId')
            state = attachment.get('State', 'detached')
        
        logger.debug(f"Parsed IGW: id={gateway_id}, name={name}, vpc_id={vpc_id}, state={state}")
        
        return InternetGateway(
            gateway_id=gateway_id,
            name=name,
            vpc_id=vpc_id,
            state=state
        )
