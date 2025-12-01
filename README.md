# AWS Resource Fetcher

**프로젝트 다빈치 (Da Vinci)** - AWS 리소스 조회 및 다이어그램 생성 시스템의 첫 단계

Saltware Cloud 사업부의 엔지니어들이 AWS 인프라 다이어그램 아키텍처를 쉽고 빠르게 생성/수정/저장/공유할 수 있는 플랫폼을 목표로 합니다.

이 모듈은 CrossAccount AssumeRole을 통해 여러 고객사의 AWS 계정에 접근하여 EC2, VPC, 보안그룹 리소스 정보를 JSON 형태로 수집합니다.

## 주요 기능

- ✅ **CrossAccount AssumeRole**: 여러 AWS 계정에 안전하게 접근
- ✅ **EC2 인스턴스 조회**: 인스턴스 ID, 이름, 상태, VPC, 서브넷, 보안그룹 정보 수집
- ✅ **VPC 조회**: VPC 및 서브넷 정보 수집
- ✅ **보안그룹 조회**: 보안그룹 및 인바운드/아웃바운드 규칙 수집
- ✅ **통합 조회**: 모든 리소스를 한 번에 조회하여 구조화된 JSON 반환
- ✅ **에러 처리**: 명확한 에러 메시지와 부분 실패 처리

## 설치

이 프로젝트는 `uv` 패키지 관리자를 사용합니다.

```bash
# uv 설치 (아직 설치하지 않은 경우)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 프로젝트 의존성 설치
uv sync
```

## 사용 방법

### 기본 사용 예제

```python
from aws_resource_fetcher.resource_fetcher import ResourceFetcher

# ResourceFetcher 인스턴스 생성
fetcher = ResourceFetcher()

# 모든 리소스 조회
try:
    result = fetcher.fetch_all_resources(
        account_id="123456789012",
        role_name="CrossAccountReadRole",
        region="ap-northeast-2"
    )
    
    print(f"계정: {result['account_id']}")
    print(f"리전: {result['region']}")
    print(f"조회 시간: {result['timestamp']}")
    print(f"EC2 인스턴스 수: {len(result['ec2_instances'])}")
    print(f"VPC 수: {len(result['vpcs'])}")
    print(f"보안그룹 수: {len(result['security_groups'])}")
    
except Exception as e:
    print(f"에러 발생: {e}")
```

### 개별 리소스 조회

#### EC2 인스턴스만 조회

```python
from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.ec2 import EC2Fetcher

# 자격증명 획득
credential_manager = AWSCredentialManager()
credentials = credential_manager.assume_role(
    account_id="123456789012",
    role_name="CrossAccountReadRole",
    region="ap-northeast-2"
)

# EC2 인스턴스 조회
ec2_fetcher = EC2Fetcher()
instances = ec2_fetcher.fetch_instances(credentials, region="ap-northeast-2")

for instance in instances:
    print(f"인스턴스 ID: {instance['instance_id']}")
    print(f"이름: {instance['name']}")
    print(f"상태: {instance['state']}")
    print(f"VPC: {instance['vpc_id']}")
    print("---")
```

#### VPC 조회

```python
from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.vpc import VPCFetcher

credential_manager = AWSCredentialManager()
credentials = credential_manager.assume_role(
    account_id="123456789012",
    role_name="CrossAccountReadRole"
)

vpc_fetcher = VPCFetcher()
vpcs = vpc_fetcher.fetch_vpcs(credentials)

for vpc in vpcs:
    print(f"VPC ID: {vpc['vpc_id']}")
    print(f"이름: {vpc['name']}")
    print(f"CIDR: {vpc['cidr_block']}")
    print(f"서브넷 수: {len(vpc['subnets'])}")
    print("---")
```

#### 보안그룹 조회

```python
from aws_resource_fetcher.credentials import AWSCredentialManager
from aws_resource_fetcher.fetchers.security_group import SecurityGroupFetcher

credential_manager = AWSCredentialManager()
credentials = credential_manager.assume_role(
    account_id="123456789012",
    role_name="CrossAccountReadRole"
)

sg_fetcher = SecurityGroupFetcher()
security_groups = sg_fetcher.fetch_security_groups(credentials)

for sg in security_groups:
    print(f"보안그룹 ID: {sg['group_id']}")
    print(f"이름: {sg['name']}")
    print(f"인바운드 규칙 수: {len(sg['inbound_rules'])}")
    print(f"아웃바운드 규칙 수: {len(sg['outbound_rules'])}")
    print("---")
```

### 결과 데이터 구조

통합 조회 결과는 다음과 같은 구조를 가집니다:

```json
{
  "account_id": "123456789012",
  "region": "ap-northeast-2",
  "timestamp": "2024-01-15T10:30:00+09:00",
  "ec2_instances": [
    {
      "instance_id": "i-1234567890abcdef0",
      "name": "web-server-01",
      "state": "running",
      "vpc_id": "vpc-12345678",
      "subnet_id": "subnet-12345678",
      "security_groups": ["sg-12345678"],
      "private_ip": "10.0.1.10",
      "public_ip": "54.180.1.1"
    }
  ],
  "vpcs": [
    {
      "vpc_id": "vpc-12345678",
      "name": "main-vpc",
      "cidr_block": "10.0.0.0/16",
      "subnets": [
        {
          "subnet_id": "subnet-12345678",
          "name": "public-subnet-1a",
          "cidr_block": "10.0.1.0/24",
          "availability_zone": "ap-northeast-2a"
        }
      ]
    }
  ],
  "security_groups": [
    {
      "group_id": "sg-12345678",
      "name": "web-server-sg",
      "vpc_id": "vpc-12345678",
      "description": "Security group for web servers",
      "inbound_rules": [
        {
          "protocol": "tcp",
          "from_port": 80,
          "to_port": 80,
          "target": "0.0.0.0/0"
        }
      ],
      "outbound_rules": [
        {
          "protocol": "-1",
          "from_port": null,
          "to_port": null,
          "target": "0.0.0.0/0"
        }
      ]
    }
  ]
}
```

## 에러 처리

시스템은 다양한 에러 상황을 명확하게 처리합니다:

```python
from aws_resource_fetcher.resource_fetcher import ResourceFetcher
from aws_resource_fetcher.exceptions import (
    AssumeRoleError,
    ResourceFetchError,
    PermissionError
)

fetcher = ResourceFetcher()

try:
    result = fetcher.fetch_all_resources(
        account_id="123456789012",
        role_name="CrossAccountReadRole"
    )
except AssumeRoleError as e:
    print(f"Role Assume 실패: {e}")
    print(f"계정: {e.account_id}, Role: {e.role_name}")
except PermissionError as e:
    print(f"권한 부족: {e}")
    print(f"필요한 권한: {e.required_permissions}")
except ResourceFetchError as e:
    print(f"리소스 조회 실패: {e}")
    print(f"리소스 타입: {e.resource_type}")
except Exception as e:
    print(f"예상치 못한 에러: {e}")
```

## 필요한 IAM 권한

CrossAccount Role에는 다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    }
  ]
}
```

## 개발

### 테스트 실행

```bash
# 모든 테스트 실행
uv run pytest

# Property-based 테스트만 실행
uv run pytest tests/property_tests/

# 특정 테스트 파일 실행
uv run pytest tests/test_resource_fetcher.py

# Verbose 모드
uv run pytest -v
```

### 타입 체킹

```bash
uv run mypy aws_resource_fetcher/ --strict
```

## 기술 스택

- **Python**: 3.11+
- **AWS SDK**: boto3
- **테스팅**: pytest, hypothesis (property-based testing), moto (AWS mocking)
- **타입 체킹**: mypy
- **패키지 관리**: uv

## 프로젝트 구조

```
aws_resource_fetcher/
├── __init__.py
├── credentials.py          # AWSCredentialManager
├── exceptions.py           # 커스텀 예외
├── models.py              # 데이터 모델
├── resource_fetcher.py    # 통합 인터페이스
└── fetchers/
    ├── __init__.py
    ├── base.py            # BaseFetcher
    ├── ec2.py             # EC2Fetcher
    ├── vpc.py             # VPCFetcher
    └── security_group.py  # SecurityGroupFetcher

tests/
├── test_credentials.py
├── test_resource_fetcher.py
├── test_fetchers/
│   ├── test_ec2.py
│   ├── test_vpc.py
│   └── test_security_group.py
└── property_tests/
    ├── test_properties.py
    └── generators.py
```

## 라이선스

이 프로젝트는 Saltware Cloud 사업부의 내부 프로젝트입니다.

## 기여

Saltware Cloud 사업부 엔지니어들의 기여를 환영합니다.