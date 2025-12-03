"""RDS 인스턴스 조회 Fetcher"""
import logging
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, RDSInstance
from ..exceptions import ResourceFetchError

logger = logging.getLogger(__name__)


class RDSFetcher(BaseFetcher):
    """RDS 인스턴스 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='RDS')
    
    def fetch_rds_instances(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[RDSInstance]:
        """
        RDS 인스턴스 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            RDSInstance 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        logger.debug(f"Fetching RDS instances in region={region}")
        try:
            # RDS 클라이언트 생성
            rds_client = self._create_client('rds', credentials, region)
            
            # RDS 인스턴스 조회 (페이지네이션 처리)
            rds_instances = []
            paginator = rds_client.get_paginator('describe_db_instances')
            
            for page in paginator.paginate():
                for db_data in page.get('DBInstances', []):
                    rds_instance = self._parse_rds_instance(db_data, rds_client)
                    rds_instances.append(rds_instance)
            
            logger.info(f"Fetched {len(rds_instances)} RDS instances")
            return rds_instances
            
        except ClientError as e:
            logger.error(f"ClientError fetching RDS instances: {e}", exc_info=True)
            self._handle_client_error(e)
        except Exception as e:
            logger.error(f"Unexpected error fetching RDS instances: {e}", exc_info=True)
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
    ) -> list[RDSInstance]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            RDSInstance 객체 리스트
        """
        return self.fetch_rds_instances(credentials, region)
    
    def _parse_rds_instance(self, db_data: dict[str, Any], rds_client: Any) -> RDSInstance:
        """
        boto3 응답 데이터를 RDSInstance 모델로 변환
        
        Args:
            db_data: boto3 describe_db_instances 응답의 DBInstance 객체
            rds_client: RDS 클라이언트 (Subnet Group 조회용)
            
        Returns:
            RDSInstance 객체
        """
        db_instance_identifier = db_data['DBInstanceIdentifier']
        db_instance_arn = db_data['DBInstanceArn']
        
        # DBName이 없으면 identifier 사용
        name = db_data.get('DBName', db_instance_identifier)
        
        engine = db_data['Engine']
        engine_version = db_data['EngineVersion']
        db_instance_class = db_data['DBInstanceClass']
        availability_zone = db_data.get('AvailabilityZone', '')
        multi_az = db_data.get('MultiAZ', False)
        publicly_accessible = db_data.get('PubliclyAccessible', False)
        status = db_data['DBInstanceStatus']
        
        # Endpoint 정보
        endpoint_data = db_data.get('Endpoint', {})
        endpoint = endpoint_data.get('Address', '')
        port = endpoint_data.get('Port', 0)
        
        # VPC 정보
        db_subnet_group = db_data.get('DBSubnetGroup', {})
        vpc_id = db_subnet_group.get('VpcId', '')
        subnet_group_name = db_subnet_group.get('DBSubnetGroupName', '')
        
        # Subnet IDs 추출
        subnet_ids = []
        for subnet in db_subnet_group.get('Subnets', []):
            subnet_id = subnet.get('SubnetIdentifier')
            if subnet_id:
                subnet_ids.append(subnet_id)
        
        # Security Groups 추출
        security_groups = []
        for sg in db_data.get('VpcSecurityGroups', []):
            sg_id = sg.get('VpcSecurityGroupId')
            if sg_id:
                security_groups.append(sg_id)
        
        logger.debug(f"Parsed RDS instance: id={db_instance_identifier}, engine={engine}, "
                    f"vpc_id={vpc_id}, subnets={len(subnet_ids)}")
        
        return RDSInstance(
            db_instance_identifier=db_instance_identifier,
            db_instance_arn=db_instance_arn,
            name=name,
            engine=engine,
            engine_version=engine_version,
            db_instance_class=db_instance_class,
            vpc_id=vpc_id,
            subnet_group_name=subnet_group_name,
            subnet_ids=subnet_ids,
            security_groups=security_groups,
            availability_zone=availability_zone,
            multi_az=multi_az,
            publicly_accessible=publicly_accessible,
            endpoint=endpoint,
            port=port,
            status=status
        )
