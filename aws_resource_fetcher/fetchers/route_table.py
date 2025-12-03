"""Route Table 조회 Fetcher"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, RouteTable, Route
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class RouteTableFetcher(BaseFetcher):
    """Route Table 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='RouteTable')
    
    def fetch_route_tables(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[RouteTable]:
        """
        Route Table 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            RouteTable 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching Route Tables in region={region}")
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # Route Table 조회 (페이지네이션 처리)
            route_tables = []
            paginator = ec2_client.get_paginator('describe_route_tables')
            
            for page in paginator.paginate():
                for rt_data in page.get('RouteTables', []):
                    route_table = self._parse_route_table(rt_data)
                    route_tables.append(route_table)
            
            logger.info(f"Fetched {len(route_tables)} Route Tables")
            return route_tables
            
        except ClientError as e:
            logger.error(f"ClientError fetching Route Tables: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching Route Tables: {e}", exc_info=True)
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
    ) -> list[RouteTable]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            RouteTable 객체 리스트
        """
        return self.fetch_route_tables(credentials, region)
    
    def _parse_route_table(self, rt_data: dict[str, Any]) -> RouteTable:
        """
        boto3 응답 데이터를 RouteTable 모델로 변환
        
        Args:
            rt_data: boto3 describe_route_tables 응답의 RouteTable 객체
            
        Returns:
            RouteTable 객체
        """
        route_table_id = rt_data['RouteTableId']
        vpc_id = rt_data['VpcId']
        
        # 이름 추출 (Name 태그에서)
        name = ''
        for tag in rt_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        # Main route table 여부 확인
        is_main = False
        for assoc in rt_data.get('Associations', []):
            if assoc.get('Main', False):
                is_main = True
                break
        
        # Routes 파싱
        routes = []
        for route_data in rt_data.get('Routes', []):
            route = self._parse_route(route_data)
            if route:  # None이 아닌 경우만 추가
                routes.append(route)
        
        # Subnet associations 추출
        subnet_associations = []
        for assoc in rt_data.get('Associations', []):
            subnet_id = assoc.get('SubnetId')
            if subnet_id:
                subnet_associations.append(subnet_id)
        
        logger.debug(f"Parsed Route Table: id={route_table_id}, name={name}, "
                    f"vpc_id={vpc_id}, routes={len(routes)}, subnets={len(subnet_associations)}")
        
        return RouteTable(
            route_table_id=route_table_id,
            name=name,
            vpc_id=vpc_id,
            routes=routes,
            subnet_associations=subnet_associations,
            is_main=is_main
        )
    
    def _parse_route(self, route_data: dict[str, Any]) -> Route | None:
        """
        개별 Route 파싱
        
        Args:
            route_data: Route 데이터
            
        Returns:
            Route 객체 또는 None (파싱 불가능한 경우)
        """
        # Destination CIDR
        destination = route_data.get('DestinationCidrBlock')
        if not destination:
            # IPv6는 일단 스킵
            return None
        
        # Target 타입과 ID 결정
        target_type = 'unknown'
        target_id = None
        
        if route_data.get('GatewayId'):
            gateway_id = route_data['GatewayId']
            if gateway_id == 'local':
                target_type = 'local'
                target_id = 'local'
            elif gateway_id.startswith('igw-'):
                target_type = 'igw'
                target_id = gateway_id
            elif gateway_id.startswith('vgw-'):
                target_type = 'vgw'
                target_id = gateway_id
        elif route_data.get('NatGatewayId'):
            target_type = 'nat'
            target_id = route_data['NatGatewayId']
        elif route_data.get('VpcPeeringConnectionId'):
            target_type = 'peering'
            target_id = route_data['VpcPeeringConnectionId']
        elif route_data.get('TransitGatewayId'):
            target_type = 'tgw'
            target_id = route_data['TransitGatewayId']
        elif route_data.get('NetworkInterfaceId'):
            target_type = 'eni'
            target_id = route_data['NetworkInterfaceId']
        
        return Route(
            destination=destination,
            target_type=target_type,
            target_id=target_id
        )
