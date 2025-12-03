"""통합 리소스 조회 인터페이스"""
from datetime import datetime
import logging
import os
from typing import Any

from .credentials import AWSCredentialManager
from .fetchers.ec2 import EC2Fetcher
from .fetchers.vpc import VPCFetcher
from .fetchers.security_group import SecurityGroupFetcher
from .fetchers.internet_gateway import InternetGatewayFetcher
from .fetchers.nat_gateway import NATGatewayFetcher
from .fetchers.route_table import RouteTableFetcher
from .fetchers.load_balancer import LoadBalancerFetcher
from .fetchers.rds import RDSFetcher
from .fetchers.vpc_peering import VPCPeeringFetcher
from .models import AWSCredentials
from .exceptions import ResourceFetchError


# 로거 설정
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ResourceFetcher:
    """모든 AWS 리소스를 통합 조회하는 고수준 인터페이스"""
    
    def __init__(self) -> None:
        """ResourceFetcher 초기화"""
        self.credential_manager = AWSCredentialManager()
        self.ec2_fetcher = EC2Fetcher()
        self.vpc_fetcher = VPCFetcher()
        self.security_group_fetcher = SecurityGroupFetcher()
        self.internet_gateway_fetcher = InternetGatewayFetcher()
        self.nat_gateway_fetcher = NATGatewayFetcher()
        self.route_table_fetcher = RouteTableFetcher()
        self.load_balancer_fetcher = LoadBalancerFetcher()
        self.rds_fetcher = RDSFetcher()
        self.vpc_peering_fetcher = VPCPeeringFetcher()
    
    def fetch_all_resources(
        self, 
        account_id: str, 
        role_name: str, 
        region: str = 'ap-northeast-2'
    ) -> dict[str, Any]:
        """
        모든 리소스를 조회
        
        Args:
            account_id: 대상 AWS 계정 번호
            role_name: AssumeRole할 IAM Role 이름
            region: AWS 리전 (기본값: ap-northeast-2)
            
        Returns:
            dict: {
                'account_id': str,
                'region': str,
                'timestamp': str,
                'ec2_instances': list[dict],
                'vpcs': list[dict],
                'security_groups': list[dict]
            }
            
        Raises:
            AssumeRoleError: Role assume 실패 시
            PermissionError: 권한 부족 시
        """
        logger.info(f"Starting resource fetch for account={account_id}, role={role_name}, region={region}")
        
        # 자격증명 획득
        logger.debug(f"Assuming role: {role_name} in account {account_id}")
        credentials = self.credential_manager.assume_role(
            account_id=account_id,
            role_name=role_name,
            region=region
        )
        logger.debug("Role assumed successfully")
        
        # 결과 구조 초기화
        result: dict[str, Any] = {
            'account_id': account_id,
            'region': region,
            'timestamp': datetime.now().isoformat(),
            'ec2_instances': [],
            'vpcs': [],
            'security_groups': [],
            'internet_gateways': [],
            'nat_gateways': [],
            'route_tables': [],
            'load_balancers': [],
            'rds_instances': [],
            'vpc_peering_connections': []
        }
        
        # EC2 인스턴스 조회
        logger.debug("Fetching EC2 instances...")
        result['ec2_instances'] = self._fetch_with_fallback(
            fetcher=self.ec2_fetcher,
            credentials=credentials,
            region=region,
            resource_name='EC2 instances'
        )
        logger.info(f"Fetched {len(result['ec2_instances'])} EC2 instances")
        
        # VPC 조회
        logger.debug("Fetching VPCs...")
        result['vpcs'] = self._fetch_with_fallback(
            fetcher=self.vpc_fetcher,
            credentials=credentials,
            region=region,
            resource_name='VPCs'
        )
        logger.info(f"Fetched {len(result['vpcs'])} VPCs")
        
        # 보안그룹 조회
        logger.debug("Fetching Security Groups...")
        result['security_groups'] = self._fetch_with_fallback(
            fetcher=self.security_group_fetcher,
            credentials=credentials,
            region=region,
            resource_name='Security Groups'
        )
        logger.info(f"Fetched {len(result['security_groups'])} Security Groups")
        
        # Internet Gateway 조회
        logger.debug("Fetching Internet Gateways...")
        result['internet_gateways'] = self._fetch_with_fallback(
            fetcher=self.internet_gateway_fetcher,
            credentials=credentials,
            region=region,
            resource_name='Internet Gateways'
        )
        logger.info(f"Fetched {len(result['internet_gateways'])} Internet Gateways")
        
        # NAT Gateway 조회
        logger.debug("Fetching NAT Gateways...")
        result['nat_gateways'] = self._fetch_with_fallback(
            fetcher=self.nat_gateway_fetcher,
            credentials=credentials,
            region=region,
            resource_name='NAT Gateways'
        )
        logger.info(f"Fetched {len(result['nat_gateways'])} NAT Gateways")
        
        # Route Table 조회
        logger.debug("Fetching Route Tables...")
        result['route_tables'] = self._fetch_with_fallback(
            fetcher=self.route_table_fetcher,
            credentials=credentials,
            region=region,
            resource_name='Route Tables'
        )
        logger.info(f"Fetched {len(result['route_tables'])} Route Tables")
        
        # Load Balancer 조회
        logger.debug("Fetching Load Balancers...")
        result['load_balancers'] = self._fetch_with_fallback(
            fetcher=self.load_balancer_fetcher,
            credentials=credentials,
            region=region,
            resource_name='Load Balancers'
        )
        logger.info(f"Fetched {len(result['load_balancers'])} Load Balancers")
        
        # RDS 인스턴스 조회
        logger.debug("Fetching RDS instances...")
        result['rds_instances'] = self._fetch_with_fallback(
            fetcher=self.rds_fetcher,
            credentials=credentials,
            region=region,
            resource_name='RDS instances'
        )
        logger.info(f"Fetched {len(result['rds_instances'])} RDS instances")
        
        # VPC Peering Connection 조회
        logger.debug("Fetching VPC Peering Connections...")
        result['vpc_peering_connections'] = self._fetch_with_fallback(
            fetcher=self.vpc_peering_fetcher,
            credentials=credentials,
            region=region,
            resource_name='VPC Peering Connections'
        )
        logger.info(f"Fetched {len(result['vpc_peering_connections'])} VPC Peering Connections")
        
        logger.info("Resource fetch completed successfully")
        return result
    
    def _fetch_with_fallback(
        self,
        fetcher: Any,
        credentials: AWSCredentials,
        region: str,
        resource_name: str
    ) -> list[dict[str, Any]]:
        """
        Fetcher를 호출하고 실패 시 빈 리스트를 반환
        
        Args:
            fetcher: 리소스 Fetcher 객체
            credentials: AWS 임시 자격증명
            region: AWS 리전
            resource_name: 리소스 이름 (로깅용)
            
        Returns:
            리소스 객체를 dict로 변환한 리스트, 실패 시 빈 리스트
        """
        try:
            # Fetcher 호출
            resources = fetcher.fetch(credentials, region)
            
            # dataclass를 dict로 변환
            return [self._to_dict(resource) for resource in resources]
            
        except ResourceFetchError as e:
            # 리소스 조회 실패 시 에러 로깅 후 빈 리스트 반환
            logger.error(
                f"Failed to fetch {resource_name}: {e}",
                exc_info=True
            )
            return []
        except Exception as e:
            # 예상치 못한 에러도 로깅 후 빈 리스트 반환
            logger.error(
                f"Unexpected error while fetching {resource_name}: {e}",
                exc_info=True
            )
            return []
    
    def _to_dict(self, obj: Any) -> Any:
        """
        dataclass 객체를 dict로 변환 (재귀적으로)
        
        Args:
            obj: 변환할 객체
            
        Returns:
            dict, list, str 등으로 변환된 객체
        """
        if hasattr(obj, '__dataclass_fields__'):
            # dataclass인 경우
            result: dict[str, Any] = {}
            for field_name in obj.__dataclass_fields__:
                value = getattr(obj, field_name)
                result[field_name] = self._to_dict(value)
            return result
        elif isinstance(obj, list):
            # 리스트인 경우
            return [self._to_dict(item) for item in obj]
        elif isinstance(obj, datetime):
            # datetime인 경우 ISO 형식 문자열로 변환
            return obj.isoformat()
        else:
            # 기본 타입인 경우 그대로 반환
            return obj
