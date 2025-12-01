# Python 3.11 베이스 이미지
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# uv 설치
RUN pip install uv

# 프로젝트 파일 복사
COPY pyproject.toml uv.lock ./
COPY aws_resource_fetcher/ ./aws_resource_fetcher/
COPY api/ ./api/

# 의존성 설치
RUN uv sync --frozen

# 포트 노출
EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# 서버 실행
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
