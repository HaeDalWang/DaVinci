"""AWS 자격증명 관리"""
from datetime import datetime
import boto3
from botocore.exceptions import ClientError, NoCredentialsError as BotoNoCredentialsError

from .exceptions import AssumeRoleError, PermissionError, NoCredentialsError
from .models import AWSCredentials


class AWSCredentialManager:
    """AWS 자격증명을 관리하는 클래스. 기본 자격증명과 CrossAccount AssumeRole을 지원합니다."""
    
    def get_default_credentials(self, region: str = 'ap-northeast-2') -> AWSCredentials:
        """
        기본 자격증명을 반환 (환경변수, ~/.aws/credentials, IAM Role 등)
        
        Args:
            region: AWS 리전 (기본값: ap-northeast-2)
            
        Returns:
            AWSCredentials: 자격증명 객체
            
        Raises:
            NoCredentialsError: 자격증명을 찾을 수 없을 때
        """
        try:
            # boto3 세션 생성 (기본 자격증명 체인 사용)
            session = boto3.Session(region_name=region)
            credentials = session.get_credentials()
            
            if credentials is None:
                raise NoCredentialsError()
            
            # frozen credentials 가져오기
            frozen_creds = credentials.get_frozen_credentials()
            
            return AWSCredentials(
                access_key=frozen_creds.access_key,
                secret_key=frozen_creds.secret_key,
                session_token=frozen_creds.token,
                expiration=None  # 기본 자격증명은 만료 시간이 없을 수 있음
            )
            
        except BotoNoCredentialsError as e:
            raise NoCredentialsError() from e
        except Exception as e:
            # 예상치 못한 에러
            raise NoCredentialsError() from e
    
    def assume_role(
        self, 
        account_id: str, 
        role_name: str, 
        region: str = 'ap-northeast-2'
    ) -> AWSCredentials:
        """
        CrossAccount Role을 assume하여 임시 자격증명을 반환
        
        Args:
            account_id: 대상 AWS 계정 번호
            role_name: AssumeRole할 IAM Role 이름
            region: AWS 리전 (기본값: ap-northeast-2)
            
        Returns:
            AWSCredentials: 임시 자격증명 객체
            
        Raises:
            AssumeRoleError: Role assume 실패 시
            PermissionError: 권한 부족 시
        """
        try:
            # STS 클라이언트 생성
            sts_client = boto3.client('sts', region_name=region)
            
            # Role ARN 구성
            role_arn = f"arn:aws:iam::{account_id}:role/{role_name}"
            
            # AssumeRole 호출
            response = sts_client.assume_role(
                RoleArn=role_arn,
                RoleSessionName=f"aws-resource-fetcher-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            )
            
            # 자격증명 추출
            credentials = response['Credentials']
            
            return AWSCredentials(
                access_key=credentials['AccessKeyId'],
                secret_key=credentials['SecretAccessKey'],
                session_token=credentials['SessionToken'],
                expiration=credentials['Expiration']
            )
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            
            # 권한 부족 에러 처리
            if error_code == 'AccessDenied':
                raise PermissionError(
                    action=f"assume role {role_name} in account {account_id}",
                    required_permissions=['sts:AssumeRole']
                ) from e
            
            # 잘못된 자격증명 에러 처리
            if error_code in ['InvalidClientTokenId', 'SignatureDoesNotMatch']:
                raise AssumeRoleError(
                    account_id=account_id,
                    role_name=role_name,
                    original_error=e
                ) from e
            
            # 기타 에러
            raise AssumeRoleError(
                account_id=account_id,
                role_name=role_name,
                original_error=e
            ) from e
            
        except Exception as e:
            # 예상치 못한 에러 (네트워크 에러 등)
            raise AssumeRoleError(
                account_id=account_id,
                role_name=role_name,
                original_error=e
            ) from e
