"""VPC 및 서브넷 조회 Fetcher"""
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, VPC, Subnet
from ..exceptions import ResourceFetchError


class VPCFetcher(BaseFetcher):
    """VPC 및 서브넷 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='VPC')
    
    def fetch_vpcs(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[VPC]:
        """
        VPC 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            VPC 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # VPC 조회 (페이지네이션 처리)
            vpcs = []
            vpc_paginator = ec2_client.get_paginator('describe_vpcs')
            
            for page in vpc_paginator.paginate():
                for vpc_data in page.get('Vpcs', []):
                    # 각 VPC에 대해 서브넷 조회
                    vpc_id = vpc_data['VpcId']
                    subnets = self._fetch_subnets(ec2_client, vpc_id)
                    
                    # VPC 객체 생성
                    vpc = self._parse_vpc(vpc_data, subnets)
                    vpcs.append(vpc)
            
            return vpcs
            
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
    ) -> list[VPC]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            VPC 객체 리스트
        """
        return self.fetch_vpcs(credentials, region)
    
    def _fetch_subnets(self, ec2_client: Any, vpc_id: str) -> list[Subnet]:
        """
        특정 VPC의 서브넷 목록을 조회
        
        Args:
            ec2_client: boto3 EC2 클라이언트
            vpc_id: VPC ID
            
        Returns:
            Subnet 객체 리스트
        """
        subnets = []
        
        # 서브넷 조회 (페이지네이션 처리)
        subnet_paginator = ec2_client.get_paginator('describe_subnets')
        
        for page in subnet_paginator.paginate(
            Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}]
        ):
            for subnet_data in page.get('Subnets', []):
                subnet = self._parse_subnet(subnet_data)
                subnets.append(subnet)
        
        return subnets
    
    def _parse_vpc(self, vpc_data: dict[str, Any], subnets: list[Subnet]) -> VPC:
        """
        boto3 응답 데이터를 VPC 모델로 변환
        
        Args:
            vpc_data: boto3 describe_vpcs 응답의 Vpc 객체
            subnets: 해당 VPC의 서브넷 목록
            
        Returns:
            VPC 객체
        """
        # VPC 이름 추출 (Name 태그에서)
        name = ''
        for tag in vpc_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        return VPC(
            vpc_id=vpc_data['VpcId'],
            name=name,
            cidr_block=vpc_data['CidrBlock'],
            subnets=subnets
        )
    
    def _parse_subnet(self, subnet_data: dict[str, Any]) -> Subnet:
        """
        boto3 응답 데이터를 Subnet 모델로 변환
        
        Args:
            subnet_data: boto3 describe_subnets 응답의 Subnet 객체
            
        Returns:
            Subnet 객체
        """
        # 서브넷 이름 추출 (Name 태그에서)
        name = ''
        for tag in subnet_data.get('Tags', []):
            if tag.get('Key') == 'Name':
                name = tag.get('Value', '')
                break
        
        return Subnet(
            subnet_id=subnet_data['SubnetId'],
            name=name,
            cidr_block=subnet_data['CidrBlock'],
            availability_zone=subnet_data['AvailabilityZone']
        )
