"""VPC Peering Connection 조회 Fetcher"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, VPCPeeringConnection
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class VPCPeeringFetcher(BaseFetcher):
    """VPC Peering Connection 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='VPCPeering')
    
    def fetch_vpc_peering_connections(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[VPCPeeringConnection]:
        """
        VPC Peering Connection 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            VPCPeeringConnection 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching VPC Peering Connections in region={region}")
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # VPC Peering Connection 조회 (페이지네이션 처리)
            peering_connections = []
            paginator = ec2_client.get_paginator('describe_vpc_peering_connections')
            
            for page in paginator.paginate():
                for pcx_data in page.get('VpcPeeringConnections', []):
                    peering_connection = self._parse_vpc_peering_connection(pcx_data)
                    peering_connections.append(peering_connection)
            
            logger.info(f"Fetched {len(peering_connections)} VPC Peering Connections")
            return peering_connections
            
        except ClientError as e:
            logger.error(f"ClientError fetching VPC Peering Connections: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching VPC Peering Connections: {e}", exc_info=True)
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
    ) -> list[VPCPeeringConnection]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            VPCPeeringConnection 객체 리스트
        """
        return self.fetch_vpc_peering_connections(credentials, region)
    
    def _parse_vpc_peering_connection(self, pcx_data: dict[str, Any]) -> VPCPeeringConnection:
        """
        boto3 응답 데이터를 VPCPeeringConnection 모델로 변환
        
        Args:
            pcx_data: boto3 describe_vpc_peering_connections 응답의 VpcPeeringConnection 객체
            
        Returns:
            VPCPeeringConnection 객체
        """
        peering_connection_id = pcx_data['VpcPeeringConnectionId']
        
        # 이름 추출 (Name 태그에서)
        name = ''
        for tag in pcx_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        # Status
        status_data = pcx_data.get('Status', {})
        status = status_data.get('Code', 'unknown')
        
        # Requester VPC 정보
        requester_vpc_info = pcx_data.get('RequesterVpcInfo', {})
        requester_vpc_id = requester_vpc_info.get('VpcId', '')
        requester_cidr = requester_vpc_info.get('CidrBlock', '')
        requester_owner_id = requester_vpc_info.get('OwnerId', '')
        requester_region = requester_vpc_info.get('Region', region)
        
        # Accepter VPC 정보
        accepter_vpc_info = pcx_data.get('AccepterVpcInfo', {})
        accepter_vpc_id = accepter_vpc_info.get('VpcId', '')
        accepter_cidr = accepter_vpc_info.get('CidrBlock', '')
        accepter_owner_id = accepter_vpc_info.get('OwnerId', '')
        accepter_region = accepter_vpc_info.get('Region', region)
        
        logger.debug(f"Parsed VPC Peering Connection: id={peering_connection_id}, "
                    f"requester={requester_vpc_id}, accepter={accepter_vpc_id}, status={status}")
        
        return VPCPeeringConnection(
            peering_connection_id=peering_connection_id,
            name=name,
            requester_vpc_id=requester_vpc_id,
            accepter_vpc_id=accepter_vpc_id,
            requester_cidr=requester_cidr,
            accepter_cidr=accepter_cidr,
            requester_owner_id=requester_owner_id,
            accepter_owner_id=accepter_owner_id,
            requester_region=requester_region,
            accepter_region=accepter_region,
            status=status
        )
