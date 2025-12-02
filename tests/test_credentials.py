"""AWSCredentialManager 유닛 테스트"""
import pytest
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError, NoCredentialsError as BotoNoCredentialsError

from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.exceptions import AssumeRoleError, PermissionError, NoCredentialsError
from aws_resource_fetcher.models import AWSCredentials


class TestAWSCredentialManager:
    """AWSCredentialManager 테스트"""
    
    def test_get_default_credentials_success(self):
        """기본 자격증명 조회 성공 시나리오"""
        manager = AWSCredentialManager()
        
        # Mock credentials
        mock_frozen_creds = Mock()
        mock_frozen_creds.access_key = 'AKIAIOSFODNN7EXAMPLE'
        mock_frozen_creds.secret_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        mock_frozen_creds.token = None
        
        mock_credentials = Mock()
        mock_credentials.get_frozen_credentials.return_value = mock_frozen_creds
        
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.get_credentials.return_value = mock_credentials
            mock_session_class.return_value = mock_session
            
            # 기본 자격증명 조회
            credentials = manager.get_default_credentials()
            
            # 검증
            assert isinstance(credentials, AWSCredentials)
            assert credentials.access_key == 'AKIAIOSFODNN7EXAMPLE'
            assert credentials.secret_key == 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
            assert credentials.session_token is None
            assert credentials.expiration is None
            
            # Session이 올바르게 생성되었는지 확인
            mock_session_class.assert_called_once_with(region_name='ap-northeast-2')
    
    def test_get_default_credentials_with_session_token(self):
        """세션 토큰이 있는 기본 자격증명 조회"""
        manager = AWSCredentialManager()
        
        # Mock credentials with session token
        mock_frozen_creds = Mock()
        mock_frozen_creds.access_key = 'AKIAIOSFODNN7EXAMPLE'
        mock_frozen_creds.secret_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        mock_frozen_creds.token = 'FwoGZXIvYXdzEBYaDH...'
        
        mock_credentials = Mock()
        mock_credentials.get_frozen_credentials.return_value = mock_frozen_creds
        
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.get_credentials.return_value = mock_credentials
            mock_session_class.return_value = mock_session
            
            # 기본 자격증명 조회
            credentials = manager.get_default_credentials()
            
            # 검증
            assert credentials.session_token == 'FwoGZXIvYXdzEBYaDH...'
    
    def test_get_default_credentials_no_credentials(self):
        """자격증명이 없을 때 에러 처리"""
        manager = AWSCredentialManager()
        
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.get_credentials.return_value = None
            mock_session_class.return_value = mock_session
            
            # NoCredentialsError가 발생해야 함
            with pytest.raises(NoCredentialsError) as exc_info:
                manager.get_default_credentials()
            
            # 에러 메시지 검증
            assert 'AWS 자격증명을 찾을 수 없습니다' in str(exc_info.value)
    
    def test_get_default_credentials_boto_no_credentials_error(self):
        """boto3 NoCredentialsError 처리"""
        manager = AWSCredentialManager()
        
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.get_credentials.side_effect = BotoNoCredentialsError()
            mock_session_class.return_value = mock_session
            
            # NoCredentialsError가 발생해야 함
            with pytest.raises(NoCredentialsError):
                manager.get_default_credentials()
    
    def test_assume_role_success(self):
        """정상적인 AssumeRole 시나리오"""
        manager = AWSCredentialManager()
        
        # Mock STS 응답
        mock_response = {
            'Credentials': {
                'AccessKeyId': 'AKIAIOSFODNN7EXAMPLE',
                'SecretAccessKey': 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                'SessionToken': 'FwoGZXIvYXdzEBYaDH...',
                'Expiration': datetime(2024, 12, 31, 23, 59, 59)
            }
        }
        
        with patch('boto3.client') as mock_boto_client:
            mock_sts = Mock()
            mock_sts.assume_role.return_value = mock_response
            mock_boto_client.return_value = mock_sts
            
            # AssumeRole 실행
            credentials = manager.assume_role(
                account_id='123456789012',
                role_name='TestRole'
            )
            
            # 검증
            assert isinstance(credentials, AWSCredentials)
            assert credentials.access_key == 'AKIAIOSFODNN7EXAMPLE'
            assert credentials.secret_key == 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
            assert credentials.session_token == 'FwoGZXIvYXdzEBYaDH...'
            assert credentials.expiration == datetime(2024, 12, 31, 23, 59, 59)
            
            # STS 클라이언트가 올바르게 호출되었는지 확인
            mock_boto_client.assert_called_once_with('sts', region_name='ap-northeast-2')
            mock_sts.assume_role.assert_called_once()
    
    def test_assume_role_access_denied(self):
        """권한 부족 에러 처리"""
        manager = AWSCredentialManager()
        
        # AccessDenied 에러 Mock
        error_response = {
            'Error': {
                'Code': 'AccessDenied',
                'Message': 'User is not authorized to perform: sts:AssumeRole'
            }
        }
        
        with patch('boto3.client') as mock_boto_client:
            mock_sts = Mock()
            mock_sts.assume_role.side_effect = ClientError(error_response, 'AssumeRole')
            mock_boto_client.return_value = mock_sts
            
            # PermissionError가 발생해야 함
            with pytest.raises(PermissionError) as exc_info:
                manager.assume_role(
                    account_id='123456789012',
                    role_name='TestRole'
                )
            
            # 에러 메시지 검증
            assert 'sts:AssumeRole' in str(exc_info.value)
            assert exc_info.value.required_permissions == ['sts:AssumeRole']
    
    def test_assume_role_invalid_client_token(self):
        """잘못된 자격증명 에러 처리"""
        manager = AWSCredentialManager()
        
        # InvalidClientTokenId 에러 Mock
        error_response = {
            'Error': {
                'Code': 'InvalidClientTokenId',
                'Message': 'The security token included in the request is invalid'
            }
        }
        
        with patch('boto3.client') as mock_boto_client:
            mock_sts = Mock()
            mock_sts.assume_role.side_effect = ClientError(error_response, 'AssumeRole')
            mock_boto_client.return_value = mock_sts
            
            # AssumeRoleError가 발생해야 함
            with pytest.raises(AssumeRoleError) as exc_info:
                manager.assume_role(
                    account_id='123456789012',
                    role_name='TestRole'
                )
            
            # 에러 정보 검증
            assert exc_info.value.account_id == '123456789012'
            assert exc_info.value.role_name == 'TestRole'
    
    def test_assume_role_network_error(self):
        """네트워크 에러 처리"""
        manager = AWSCredentialManager()
        
        with patch('boto3.client') as mock_boto_client:
            mock_sts = Mock()
            mock_sts.assume_role.side_effect = Exception('Network timeout')
            mock_boto_client.return_value = mock_sts
            
            # AssumeRoleError가 발생해야 함
            with pytest.raises(AssumeRoleError) as exc_info:
                manager.assume_role(
                    account_id='123456789012',
                    role_name='TestRole'
                )
            
            # 원본 에러가 포함되어 있는지 확인
            assert 'Network timeout' in str(exc_info.value.original_error)
