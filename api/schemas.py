"""API Request/Response 스키마"""
from pydantic import BaseModel, Field
from typing import Optional


class FetchRequest(BaseModel):
    """리소스 조회 요청"""
    account_id: str = Field(..., description="AWS 계정 번호", min_length=12, max_length=12)
    role_name: str = Field(..., description="AssumeRole할 IAM Role 이름")
    region: str = Field(default="ap-northeast-2", description="AWS 리전")


class HealthResponse(BaseModel):
    """헬스체크 응답"""
    status: str = Field(..., description="서비스 상태")
    version: str = Field(..., description="API 버전")


class ErrorResponse(BaseModel):
    """에러 응답"""
    error: str = Field(..., description="에러 타입")
    message: str = Field(..., description="에러 메시지")
    detail: Optional[str] = Field(None, description="상세 정보")
