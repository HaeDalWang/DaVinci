# 프로젝트 다빈치 (Da Vinci)

AWS 인프라 다이어그램을 자동으로 생성하는 시스템 - Phase 1: 리소스 수집기

Saltware Cloud 사업부 엔지니어들이 AWS 인프라 아키텍처를 쉽고 빠르게 생성/수정/저장/공유할 수 있는 플랫폼

## 현재 단계: AWS Resource Fetcher

CrossAccount AssumeRole을 통해 고객사 AWS 계정의 리소스 정보를 수집하는 REST API 서버

### Features

- 🔐 CrossAccount AssumeRole 지원
- 🚀 FastAPI 기반 REST API
- 🐳 Docker 지원
- 📊 EC2, VPC, 보안그룹 조회

## Quick Start

### Docker (추천)

```bash
docker build -t aws-fetcher-api .
docker run -p 8000:8000 \
  -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  aws-fetcher-api
```

### Local

```bash
uv sync
./run_local.sh
```

API 문서: http://localhost:8000/docs

## API Usage

```bash
# 헬스체크
curl http://localhost:8000/health

# 전체 리소스 조회
curl "http://localhost:8000/api/v1/resources?account_id=123456789012&role_name=ReadRole"

# EC2만 조회
curl "http://localhost:8000/api/v1/ec2?account_id=123456789012&role_name=ReadRole"
```

## Development

```bash
# 테스트
uv run pytest

# 타입 체킹
uv run mypy aws_resource_fetcher/
```

## IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:DescribeVpcs",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups"
    ],
    "Resource": "*"
  }]
}
```

## Project Structure

```
aws_resource_fetcher/    # Core library
api/                     # FastAPI server
tests/                   # Tests
Dockerfile              # Container image
```

## Tech Stack

Python 3.11+ • FastAPI • boto3 • Docker • pytest

## Roadmap

- [x] Phase 1: AWS 리소스 수집 (현재)
- [ ] Phase 2: 다이어그램 생성 엔진
- [ ] Phase 3: 웹 UI 및 편집 기능
- [ ] Phase 4: 협업 및 공유 기능

## License

Saltware Cloud 사업부 내부 프로젝트
