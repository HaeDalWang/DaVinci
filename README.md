# 프로젝트 다빈치 (Da Vinci)

AWS 인프라 다이어그램 자동 생성 플랫폼

Saltware Cloud 사업부 엔지니어들이 AWS 인프라 아키텍처를 쉽고 빠르게 생성/수정/저장/공유할 수 있는 플랫폼

## 아키텍처

```
Agent → AWS 리소스 조회 → 리소스 그래프 → draw.io XML → S3 저장
```

## 현재 단계: Phase 1-3 완료

### Phase 1: AWS 리소스 조회
CrossAccount AssumeRole을 통해 고객사 AWS 계정의 리소스 정보를 수집하는 REST API 서버

### Phase 2: 리소스 그래프 빌더
Phase 1에서 수집한 리소스 데이터를 분석하여 리소스 간 관계를 그래프로 표현

### Phase 3: draw.io XML 생성기
Phase 2 그래프를 draw.io 애플리케이션에서 열 수 있는 XML 다이어그램으로 변환

### Features

- 🔐 CrossAccount AssumeRole 지원
- 🚀 FastAPI 기반 REST API
- 🐳 Docker 지원
- 📊 EC2, VPC, SecurityGroup 조회
- 📈 리소스 관계 그래프 생성
- 🔗 VPC-EC2, Subnet-EC2, EC2-SG 엣지 생성
- 🛡️ SecurityGroup 규칙 기반 트래픽 허용 엣지
- 📦 VPC별 리소스 그룹핑
- 🎨 draw.io XML 다이어그램 생성
- 🏗️ AWS Architecture Icons 2025 적용
- 📐 자동 레이아웃 (VPC, Subnet, EC2)

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

## Usage

### Phase 1: AWS 리소스 조회 (API)

```bash
# 헬스체크
curl http://localhost:8000/health

# 전체 리소스 조회
curl "http://localhost:8000/api/v1/resources?account_id=123456789012&role_name=ReadRole"

# EC2만 조회
curl "http://localhost:8000/api/v1/ec2?account_id=123456789012&role_name=ReadRole"
```

### Phase 1 → Phase 2 → Phase 3: 전체 플로우 (Python)

```python
from aws_resource_fetcher.models import AWSCredentials
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher
from aws_resource_fetcher.fetchers.vpc import VPCFetcher
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher
from resource_graph_builder.builder import GraphBuilder
from drawio_generator.generator import DrawioGenerator
from datetime import datetime
import json

# 1. Phase 1: AWS 리소스 조회
credentials = AWSCredentials(
    access_key='YOUR_ACCESS_KEY',
    secret_key='YOUR_SECRET_KEY',
    session_token='YOUR_SESSION_TOKEN',
    expiration=datetime.now()
)

ec2_fetcher = EC2Fetcher()
vpc_fetcher = VPCFetcher()
sg_fetcher = SecurityGroupFetcher()

ec2_instances = ec2_fetcher.fetch(credentials, 'ap-northeast-2')
vpcs = vpc_fetcher.fetch(credentials, 'ap-northeast-2')
security_groups = sg_fetcher.fetch(credentials, 'ap-northeast-2')

# Phase 1 결과를 JSON으로 변환
phase1_json = {
    'ec2_instances': [
        {
            'instance_id': ec2.instance_id,
            'name': ec2.name,
            'state': ec2.state,
            'vpc_id': ec2.vpc_id,
            'subnet_id': ec2.subnet_id,
            'security_groups': ec2.security_groups,
            'private_ip': ec2.private_ip,
            'public_ip': ec2.public_ip
        }
        for ec2 in ec2_instances
    ],
    'vpcs': [
        {
            'vpc_id': vpc.vpc_id,
            'name': vpc.name,
            'cidr_block': vpc.cidr_block,
            'subnets': [
                {
                    'subnet_id': subnet.subnet_id,
                    'name': subnet.name,
                    'cidr_block': subnet.cidr_block,
                    'availability_zone': subnet.availability_zone,
                    'vpc_id': vpc.vpc_id
                }
                for subnet in vpc.subnets
            ]
        }
        for vpc in vpcs
    ],
    'security_groups': [
        {
            'group_id': sg.group_id,
            'name': sg.name,
            'vpc_id': sg.vpc_id,
            'description': sg.description,
            'inbound_rules': [
                {
                    'protocol': rule.protocol,
                    'from_port': rule.from_port,
                    'to_port': rule.to_port,
                    'target': rule.target
                }
                for rule in sg.inbound_rules
            ],
            'outbound_rules': [
                {
                    'protocol': rule.protocol,
                    'from_port': rule.from_port,
                    'to_port': rule.to_port,
                    'target': rule.target
                }
                for rule in sg.outbound_rules
            ]
        }
        for sg in security_groups
    ]
}

# 2. Phase 2: 리소스 그래프 생성
builder = GraphBuilder()
graph = builder.build(phase1_json)
graph_json = graph.to_dict()

# 3. Phase 3: draw.io XML 생성
generator = DrawioGenerator()
xml_output = generator.generate(graph_json)

# 4. XML 파일로 저장
with open('aws-infrastructure.drawio', 'w', encoding='utf-8') as f:
    f.write(xml_output)

print("✅ draw.io 다이어그램 생성 완료: aws-infrastructure.drawio")
print("   draw.io 웹/데스크톱 앱에서 열어서 확인하세요!")
```

### 간단한 예제

```python
from resource_graph_builder.builder import GraphBuilder
from drawio_generator.generator import DrawioGenerator

# Phase 1 JSON (간단한 예제)
phase1_json = {
    "ec2_instances": [
        {
            "instance_id": "i-123",
            "name": "web-server",
            "state": "running",
            "private_ip": "10.0.1.10",
            "public_ip": "54.180.1.1",
            "vpc_id": "vpc-123",
            "subnet_id": "subnet-456",
            "security_groups": ["sg-web"]
        }
    ],
    "vpcs": [
        {
            "vpc_id": "vpc-123",
            "name": "production-vpc",
            "cidr_block": "10.0.0.0/16",
            "subnets": [
                {
                    "subnet_id": "subnet-456",
                    "name": "public-subnet",
                    "cidr_block": "10.0.1.0/24",
                    "availability_zone": "ap-northeast-2a",
                    "vpc_id": "vpc-123"
                }
            ]
        }
    ],
    "security_groups": [
        {
            "group_id": "sg-web",
            "name": "web-sg",
            "description": "Web server security group",
            "vpc_id": "vpc-123",
            "inbound_rules": [],
            "outbound_rules": []
        }
    ]
}

# Phase 2: 그래프 생성
builder = GraphBuilder()
graph = builder.build(phase1_json)

# Phase 3: draw.io XML 생성
generator = DrawioGenerator()
xml_output = generator.generate(graph.to_dict())

# 파일 저장
with open('diagram.drawio', 'w', encoding='utf-8') as f:
    f.write(xml_output)
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
aws_resource_fetcher/       # Phase 1: AWS 리소스 조회
├── fetchers/              # EC2, VPC, SecurityGroup fetcher
├── models.py              # 데이터 모델
└── credentials.py         # AWS 자격증명 관리

resource_graph_builder/     # Phase 2: 리소스 그래프 빌더
├── builder.py             # GraphBuilder (통합 인터페이스)
├── parser.py              # Phase 1 JSON 파싱
├── graph.py               # ResourceGraph (그래프 자료구조)
├── models.py              # Node, Edge, Group 모델
└── exceptions.py          # 커스텀 예외

drawio_generator/          # Phase 3: draw.io XML 생성기
├── generator.py           # DrawioGenerator (통합 인터페이스)
├── converters/            # Shape, Container, Connector 변환기
├── layout.py              # LayoutEngine (자동 레이아웃)
├── xml_builder.py         # XMLBuilder (XML 생성)
├── models.py              # Shape, Container, Connector 모델
└── exceptions.py          # 커스텀 예외

api/                       # FastAPI REST API 서버
tests/                     # 테스트 (Unit, Property-Based, E2E)
Dockerfile                 # Container image
```

## Tech Stack

Python 3.11+ • FastAPI • boto3 • Docker • pytest

## Roadmap

- [x] Phase 1: AWS 리소스 조회 (완료)
  - EC2, VPC, SecurityGroup 조회
  - CrossAccount AssumeRole
  - REST API 서버
- [x] Phase 2: 리소스 관계 그래프 생성 (완료)
  - 리소스 간 연관성 분석
  - SecurityGroup 규칙 기반 연결성 판단
  - VPC별 그룹핑
  - JSON 직렬화/역직렬화
- [x] Phase 3: draw.io XML 생성 (완료)
  - 그래프를 draw.io 형식으로 변환
  - AWS Architecture Icons 2025 적용
  - 자동 레이아웃 (VPC, Subnet, EC2)
  - UTF-8 인코딩 지원
- [ ] Phase 4: 저장 및 공유 (예정)
  - S3 저장
  - Redis 캐시
  - 메타데이터 관리
- [ ] Phase 5: 웹 UI (예정)
  - 자연어 질의
  - 다이어그램 편집
  - 협업 및 공유

## License

Saltware Cloud 사업부 내부 프로젝트
