"""API 라우트"""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
import logging
import traceback

from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher
from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher
from aws_resource_fetcher.exceptions import (
    AssumeRoleError,
    ResourceFetchError,
    PermissionError as AWSPermissionError
)

from api.schemas import FetchRequest, HealthResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """헬스체크 엔드포인트"""
    return HealthResponse(status="healthy", version="1.0.0")


@router.get("/api/v1/resources")
async def fetch_all_resources(
    account_id: str = Query(..., description="AWS 계정 번호", min_length=12, max_length=12),
    role_name: str = Query(..., description="AssumeRole할 IAM Role 이름"),
    region: str = Query(default="ap-northeast-2", description="AWS 리전")
) -> Dict[str, Any]:
    """
    모든 AWS 리소스 조회
    
    - **account_id**: 대상 AWS 계정 번호 (12자리)
    - **role_name**: AssumeRole할 IAM Role 이름
    - **region**: AWS 리전 (기본값: ap-northeast-2)
    
    Returns:
        EC2 인스턴스, VPC, 보안그룹 정보를 포함한 구조화된 데이터
    """
    try:
        logger.info(f"전체 리소스 조회 시작: account_id={account_id}, role_name={role_name}, region={region}")
        fetcher = ResourceFetcher()
        result = fetcher.fetch_all_resources(
            account_id=account_id,
            role_name=role_name,
            region=region
        )
        logger.info(f"전체 리소스 조회 완료: EC2={len(result.get('ec2_instances', []))}, VPC={len(result.get('vpcs', []))}, SG={len(result.get('security_groups', []))}")
        return result
    except AssumeRoleError as e:
        logger.error(f"AssumeRole 실패: {str(e)}")
        logger.debug(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=403,
            detail={
                "error": "AssumeRoleError",
                "message": str(e),
                "account_id": e.account_id,
                "role_name": e.role_name,
                "original_error": str(e.original_error) if hasattr(e, 'original_error') else None
            }
        )
    except AWSPermissionError as e:
        logger.error(f"권한 부족: {str(e)}")
        logger.debug(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=403,
            detail={
                "error": "PermissionError",
                "message": str(e),
                "required_permissions": e.required_permissions
            }
        )
    except ResourceFetchError as e:
        logger.error(f"리소스 조회 실패: {str(e)}")
        logger.debug(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "ResourceFetchError",
                "message": str(e),
                "resource_type": e.resource_type
            }
        )
    except Exception as e:
        logger.error(f"예상치 못한 에러: {str(e)}")
        logger.error(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "InternalServerError",
                "message": str(e),
                "traceback": traceback.format_exc() if logger.level == logging.DEBUG else None
            }
        )


@router.get("/api/v1/ec2")
async def fetch_ec2_instances(
    account_id: str = Query(..., description="AWS 계정 번호", min_length=12, max_length=12),
    role_name: str = Query(..., description="AssumeRole할 IAM Role 이름"),
    region: str = Query(default="ap-northeast-2", description="AWS 리전")
) -> Dict[str, Any]:
    """
    EC2 인스턴스만 조회
    
    Returns:
        EC2 인스턴스 목록
    """
    try:
        logger.info(f"EC2 조회 시작: account_id={account_id}, role_name={role_name}, region={region}")
        credential_manager = AWSCredentialManager()
        credentials = credential_manager.assume_role(
            account_id=account_id,
            role_name=role_name,
            region=region
        )
        
        ec2_fetcher = EC2Fetcher()
        instances = ec2_fetcher.fetch(credentials, region)
        logger.info(f"EC2 조회 완료: {len(instances)}개")
        
        return {
            "account_id": account_id,
            "region": region,
            "ec2_instances": [instance.__dict__ for instance in instances]
        }
    except AssumeRoleError as e:
        logger.error(f"AssumeRole 실패: {str(e)}")
        logger.debug(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"EC2 조회 실패: {str(e)}")
        logger.error(f"상세 에러:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/vpcs")
async def fetch_vpcs(
    account_id: str = Query(..., description="AWS 계정 번호", min_length=12, max_length=12),
    role_name: str = Query(..., description="AssumeRole할 IAM Role 이름"),
    region: str = Query(default="ap-northeast-2", description="AWS 리전")
) -> Dict[str, Any]:
    """
    VPC 정보만 조회
    
    Returns:
        VPC 및 서브넷 목록
    """
    try:
        credential_manager = AWSCredentialManager()
        credentials = credential_manager.assume_role(
            account_id=account_id,
            role_name=role_name,
            region=region
        )
        
        vpc_fetcher = VPCFetcher()
        vpcs = vpc_fetcher.fetch(credentials, region)
        
        return {
            "account_id": account_id,
            "region": region,
            "vpcs": [
                {
                    **vpc.__dict__,
                    "subnets": [subnet.__dict__ for subnet in vpc.subnets]
                }
                for vpc in vpcs
            ]
        }
    except AssumeRoleError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/security-groups")
async def fetch_security_groups(
    account_id: str = Query(..., description="AWS 계정 번호", min_length=12, max_length=12),
    role_name: str = Query(..., description="AssumeRole할 IAM Role 이름"),
    region: str = Query(default="ap-northeast-2", description="AWS 리전")
) -> Dict[str, Any]:
    """
    보안그룹 정보만 조회
    
    Returns:
        보안그룹 및 규칙 목록
    """
    try:
        credential_manager = AWSCredentialManager()
        credentials = credential_manager.assume_role(
            account_id=account_id,
            role_name=role_name,
            region=region
        )
        
        sg_fetcher = SecurityGroupFetcher()
        security_groups = sg_fetcher.fetch(credentials, region)
        
        return {
            "account_id": account_id,
            "region": region,
            "security_groups": [
                {
                    **sg.__dict__,
                    "inbound_rules": [rule.__dict__ for rule in sg.inbound_rules],
                    "outbound_rules": [rule.__dict__ for rule in sg.outbound_rules]
                }
                for sg in security_groups
            ]
        }
    except AssumeRoleError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
