"""EC2 인스턴스 조회 Fetcher"""
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, EC2Instance
from ..exceptions import ResourceFetchError


class EC2Fetcher(BaseFetcher):
    """EC2 인스턴스 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='EC2')
    
    def fetch_instances(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[EC2Instance]:
        """
        EC2 인스턴스 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            EC2Instance 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # EC2 인스턴스 조회 (페이지네이션 처리)
            instances = []
            paginator = ec2_client.get_paginator('describe_instances')
            
            for page in paginator.paginate():
                for reservation in page.get('Reservations', []):
                    for instance in reservation.get('Instances', []):
                        instances.append(self._parse_instance(instance))
            
            return instances
            
        except ClientError as e:
            self._handle_client_error(e)
        except Exception as e:
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
    ) -> list[EC2Instance]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            EC2Instance 객체 리스트
        """
        return self.fetch_instances(credentials, region)
    
    def _parse_instance(self, instance_data: dict[str, Any]) -> EC2Instance:
        """
        boto3 응답 데이터를 EC2Instance 모델로 변환
        
        Args:
            instance_data: boto3 describe_instances 응답의 Instance 객체
            
        Returns:
            EC2Instance 객체
        """
        # 인스턴스 이름 추출 (Name 태그에서)
        name = ''
        for tag in instance_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        # 보안그룹 ID 목록 추출
        security_groups = [
            sg['GroupId'] 
            for sg in instance_data.get('SecurityGroups', [])
        ]
        
        # Public IP 추출 (없을 수 있음)
        public_ip = instance_data.get('PublicIpAddress')
        
        return EC2Instance(
            instance_id=instance_data['InstanceId'],
            name=name,
            state=instance_data['State']['Name'],
            vpc_id=instance_data.get('VpcId', ''),
            subnet_id=instance_data.get('SubnetId', ''),
            security_groups=security_groups,
            private_ip=instance_data.get('PrivateIpAddress', ''),
            public_ip=public_ip
        )
