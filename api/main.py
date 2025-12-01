"""FastAPI 메인 애플리케이션"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import sys
import traceback

from api.routes import router

# 환경 변수에서 로그 레벨 가져오기 (기본값: INFO)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# 로깅 설정
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# boto3 로깅도 활성화 (DEBUG 모드일 때)
if LOG_LEVEL == "DEBUG":
    logging.getLogger('boto3').setLevel(logging.DEBUG)
    logging.getLogger('botocore').setLevel(logging.DEBUG)
    logging.getLogger('urllib3').setLevel(logging.DEBUG)

# FastAPI 앱 생성
app = FastAPI(
    title="AWS Resource Fetcher API",
    description="AWS 리소스 조회 API - EC2, VPC, 보안그룹 정보를 수집합니다",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인으로 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """모든 요청/응답 로깅"""
    logger.info(f"요청: {request.method} {request.url}")
    logger.debug(f"헤더: {dict(request.headers)}")
    logger.debug(f"쿼리 파라미터: {dict(request.query_params)}")
    
    try:
        response = await call_next(request)
        logger.info(f"응답: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"요청 처리 중 에러: {str(e)}")
        logger.error(f"상세 에러:\n{traceback.format_exc()}")
        raise


@app.on_event("startup")
async def startup_event():
    """서버 시작 시 실행"""
    logger.info("=" * 50)
    logger.info("AWS Resource Fetcher API 서버 시작")
    logger.info(f"로그 레벨: {LOG_LEVEL}")
    logger.info(f"AWS_ACCESS_KEY_ID 설정: {'있음' if os.getenv('AWS_ACCESS_KEY_ID') else '없음'}")
    logger.info(f"AWS_SECRET_ACCESS_KEY 설정: {'있음' if os.getenv('AWS_SECRET_ACCESS_KEY') else '없음'}")
    logger.info(f"AWS_DEFAULT_REGION: {os.getenv('AWS_DEFAULT_REGION', 'ap-northeast-2')}")
    logger.info("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """서버 종료 시 실행"""
    logger.info("AWS Resource Fetcher API 서버 종료")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
