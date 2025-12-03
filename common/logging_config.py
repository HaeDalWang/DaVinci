"""
공통 로깅 설정

환경 변수 LOG_LEVEL로 로그 레벨 조정 가능
- DEBUG: 상세한 디버깅 정보
- INFO: 일반 정보 (기본값)
- WARNING: 경고
- ERROR: 에러만
"""
import logging
import os
import sys


def setup_logging(module_name: str | None = None) -> logging.Logger:
    """
    로깅 설정 및 logger 반환
    
    Args:
        module_name: 모듈 이름 (None이면 root logger)
        
    Returns:
        logging.Logger: 설정된 logger
        
    환경 변수:
        LOG_LEVEL: DEBUG, INFO, WARNING, ERROR (기본값: INFO)
    """
    # 환경 변수에서 로그 레벨 가져오기
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # 유효한 로그 레벨인지 확인
    valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if log_level_str not in valid_levels:
        log_level_str = "INFO"
    
    log_level = getattr(logging, log_level_str)
    
    # 로거 생성
    logger = logging.getLogger(module_name) if module_name else logging.getLogger()
    logger.setLevel(log_level)
    
    # 핸들러가 이미 있으면 추가하지 않음 (중복 방지)
    if not logger.handlers:
        # 콘솔 핸들러 생성
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)
        
        # 포맷 설정
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        
        logger.addHandler(handler)
    
    return logger


def get_logger(module_name: str) -> logging.Logger:
    """
    모듈별 logger 가져오기
    
    Args:
        module_name: 모듈 이름 (__name__ 사용 권장)
        
    Returns:
        logging.Logger: 설정된 logger
    """
    return setup_logging(module_name)
