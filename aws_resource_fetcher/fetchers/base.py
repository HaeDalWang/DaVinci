"""AWS 리소스 조회를 위한 기본 Fetcher 추상 클래스"""
from abc import ABC, abstractmethod
from typing import Any
import boto3
from botocore.exceptions import ClientError

from ..exceptions import ResourceFetchError, PermissionError
from ..models import AWSCredentials


class BaseFetcher(ABC):
    """모든 리소스 Fetcher의 기본 추상 클래스"""
    
    def __init__(self, resource_type: str):
        """
        Args:
            resource_type: 조회할 리소스 타입 (예: 'EC2', 'VPC', 'SecurityGroup')
        """
        self.resource_type = resource_type
    
    def _create_client(
        self, 
        service_name: str,
        credentials: AWSCredentials, 
        region: str
    ) -> Any:
        """
        boto3 클라이언트를 생성하는 공통 메서드
        
        Args:
            service_name: AWS 서비스 이름 (예: 'ec2', 'sts')
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            boto3 클라이언트 객체
        """
        return boto3.client(
            service_name,
            aws_access_key_id=credentials.access_key,
            aws_secret_access_key=credentials.secret_key,
            aws_session_token=credentials.session_token,
            region_name=region
        )
    
    def _handle_client_error(self, error: ClientError) -> None:
        """
        boto3 ClientError를 처리하는 공통 메서드
        
        Args:
            error: boto3 ClientError
            
        Raises:
            PermissionError: 권한 부족 시
            ResourceFetchError: 기타 리소스 조회 실패 시
        """
        error_code = error.response.get('Error', {}).get('Code', '')
        error_message = error.response.get('Error', {}).get('Message', '')
        
        # 권한 부족 에러 처리
        if error_code in ['UnauthorizedOperation', 'AccessDenied', 'AccessDeniedException']:
            # 에러 메시지에서 필요한 권한 추출 시도
            required_permissions = self._extract_required_permissions(error_message)
            raise PermissionError(
                action=f"fetch {self.resource_type}",
                required_permissions=required_permissions
            ) from error
        
        # 기타 에러는 ResourceFetchError로 래핑
        raise ResourceFetchError(
            resource_type=self.resource_type,
            original_error=error
        ) from error
        
        # mypy를 위한 명시적 return (실제로는 도달하지 않음)
        return None  # pragma: no cover
    
    def _extract_required_permissions(self, error_message: str) -> list[str]:
        """
        에러 메시지에서 필요한 권한을 추출
        
        Args:
            error_message: AWS 에러 메시지
            
        Returns:
            필요한 권한 목록
        """
        # 기본 권한 매핑
        permission_map = {
            'EC2': ['ec2:DescribeInstances'],
            'VPC': ['ec2:DescribeVpcs', 'ec2:DescribeSubnets'],
            'SecurityGroup': ['ec2:DescribeSecurityGroups']
        }
        
        return permission_map.get(self.resource_type, [f'{self.resource_type.lower()}:Describe*'])
    
    @abstractmethod
    def fetch(self, credentials: AWSCredentials, region: str = 'ap-northeast-2') -> list[Any]:
        """
        리소스를 조회하는 추상 메서드 (하위 클래스에서 구현 필요)
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            조회된 리소스 목록
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        pass
