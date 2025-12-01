# Design Document

## Overview

AWS 리소스 조회 시스템은 boto3를 사용하여 CrossAccount AssumeRole을 통해 여러 AWS 계정의 EC2, VPC, 보안그룹 리소스를 조회하고 JSON 형태로 반환하는 Python 기반 모듈입니다. 이 시스템은 프로젝트 다빈치의 핵심 데이터 수집 레이어로 동작합니다.

## Architecture

시스템은 3개의 주요 레이어로 구성됩니다:

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (통합 조회 인터페이스)              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Service Layer                   │
│  - EC2Fetcher                       │
│  - VPCFetcher                       │
│  - SecurityGroupFetcher             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Infrastructure Layer            │
│  - AWSCredentialManager             │
│  - boto3 Client Factory             │
└─────────────────────────────────────┘
```

### 레이어 설명:

1. **Infrastructure Layer**: AWS 자격증명 관리 및 boto3 클라이언트 생성
2. **Service Layer**: 각 AWS 리소스 타입별 조회 로직
3. **Application Layer**: 여러 리소스를 통합 조회하는 고수준 인터페이스

## Components and Interfaces

### 1. AWSCredentialManager

CrossAccount AssumeRole을 처리하는 컴포넌트입니다.

```python
class AWSCredentialManager:
    def assume_role(self, account_id: str, role_name: str, region: str = 'ap-northeast-2') -> dict:
        """
        CrossAccount Role을 assume하여 임시 자격증명을 반환
        
        Args:
            account_id: 대상 AWS 계정 번호
            role_name: AssumeRole할 IAM Role 이름
            region: AWS 리전 (기본값: ap-northeast-2)
            
        Returns:
            dict: {
                'access_key': str,
                'secret_key': str,
                'session_token': str,
                'expiration': datetime
            }
            
        Raises:
            AssumeRoleError: Role assume 실패 시
        """
```

### 2. EC2Fetcher

EC2 인스턴스 정보를 조회하는 컴포넌트입니다.

```python
class EC2Fetcher:
    def fetch_instances(self, credentials: dict, region: str = 'ap-northeast-2') -> list[dict]:
        """
        EC2 인스턴스 목록을 조회
        
        Args:
            credentials: AWSCredentialManager에서 반환한 자격증명
            region: AWS 리전
            
        Returns:
            list[dict]: [
                {
                    'instance_id': str,
                    'name': str,
                    'state': str,
                    'vpc_id': str,
                    'subnet_id': str,
                    'security_groups': list[str],
                    'private_ip': str,
                    'public_ip': str | None
                }
            ]
        """
```

### 3. VPCFetcher

VPC 및 서브넷 정보를 조회하는 컴포넌트입니다.

```python
class VPCFetcher:
    def fetch_vpcs(self, credentials: dict, region: str = 'ap-northeast-2') -> list[dict]:
        """
        VPC 목록을 조회
        
        Args:
            credentials: AWSCredentialManager에서 반환한 자격증명
            region: AWS 리전
            
        Returns:
            list[dict]: [
                {
                    'vpc_id': str,
                    'name': str,
                    'cidr_block': str,
                    'subnets': [
                        {
                            'subnet_id': str,
                            'name': str,
                            'cidr_block': str,
                            'availability_zone': str
                        }
                    ]
                }
            ]
        """
```

### 4. SecurityGroupFetcher

보안그룹 및 규칙 정보를 조회하는 컴포넌트입니다.

```python
class SecurityGroupFetcher:
    def fetch_security_groups(self, credentials: dict, region: str = 'ap-northeast-2') -> list[dict]:
        """
        보안그룹 목록을 조회
        
        Args:
            credentials: AWSCredentialManager에서 반환한 자격증명
            region: AWS 리전
            
        Returns:
            list[dict]: [
                {
                    'group_id': str,
                    'name': str,
                    'vpc_id': str,
                    'description': str,
                    'inbound_rules': [
                        {
                            'protocol': str,
                            'from_port': int | None,
                            'to_port': int | None,
                            'source': str  # CIDR or sg-xxx
                        }
                    ],
                    'outbound_rules': [
                        {
                            'protocol': str,
                            'from_port': int | None,
                            'to_port': int | None,
                            'destination': str  # CIDR or sg-xxx
                        }
                    ]
                }
            ]
        """
```

### 5. ResourceFetcher (통합 인터페이스)

모든 리소스를 한 번에 조회하는 고수준 인터페이스입니다.

```python
class ResourceFetcher:
    def fetch_all_resources(self, account_id: str, role_name: str, region: str = 'ap-northeast-2') -> dict:
        """
        모든 리소스를 조회
        
        Args:
            account_id: 대상 AWS 계정 번호
            role_name: AssumeRole할 IAM Role 이름
            region: AWS 리전
            
        Returns:
            dict: {
                'account_id': str,
                'region': str,
                'timestamp': str,
                'ec2_instances': list[dict],
                'vpcs': list[dict],
                'security_groups': list[dict]
            }
        """
```

## Data Models

### AWSCredentials

```python
@dataclass
class AWSCredentials:
    access_key: str
    secret_key: str
    session_token: str
    expiration: datetime
```

### EC2Instance

```python
@dataclass
class EC2Instance:
    instance_id: str
    name: str
    state: str
    vpc_id: str
    subnet_id: str
    security_groups: list[str]
    private_ip: str
    public_ip: str | None
```

### VPC

```python
@dataclass
class VPC:
    vpc_id: str
    name: str
    cidr_block: str
    subnets: list[Subnet]

@dataclass
class Subnet:
    subnet_id: str
    name: str
    cidr_block: str
    availability_zone: str
```

### SecurityGroup

```python
@dataclass
class SecurityGroup:
    group_id: str
    name: str
    vpc_id: str
    description: str
    inbound_rules: list[SecurityGroupRule]
    outbound_rules: list[SecurityGroupRule]

@dataclass
class SecurityGroupRule:
    protocol: str
    from_port: int | None
    to_port: int | None
    target: str  # CIDR or sg-xxx
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: AssumeRole returns complete credentials

*For any* valid AWS 계정 번호와 role 이름, AssumeRole이 성공하면 반환되는 자격증명은 access_key, secret_key, session_token, expiration 필드를 모두 포함해야 한다.

**Validates: Requirements 1.2**

### Property 2: AssumeRole failure raises appropriate exception

*For any* 잘못된 계정 번호나 권한 부족 상황, AssumeRole 실패 시 명확한 에러 타입과 메시지를 포함한 예외가 발생해야 한다.

**Validates: Requirements 1.3**

### Property 3: EC2 fetch returns complete instance data

*For any* 유효한 자격증명으로 EC2를 조회할 때, 반환되는 모든 인스턴스 데이터는 instance_id, name, state, vpc_id, subnet_id, security_groups 필드를 포함해야 한다.

**Validates: Requirements 2.2**

### Property 4: EC2 data is JSON serializable

*For any* EC2 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.

**Validates: Requirements 2.3**

### Property 5: VPC fetch returns complete VPC data

*For any* 유효한 자격증명으로 VPC를 조회할 때, 반환되는 모든 VPC 데이터는 vpc_id, name, cidr_block, subnets 필드를 포함해야 한다.

**Validates: Requirements 3.2**

### Property 6: VPC data is JSON serializable

*For any* VPC 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.

**Validates: Requirements 3.3**

### Property 7: SecurityGroup fetch returns complete data

*For any* 유효한 자격증명으로 보안그룹을 조회할 때, 반환되는 모든 보안그룹 데이터는 group_id, name, vpc_id, inbound_rules, outbound_rules 필드를 포함해야 한다.

**Validates: Requirements 4.2**

### Property 8: SecurityGroup rules contain required fields

*For any* 보안그룹 규칙, protocol, from_port, to_port, target 정보를 포함해야 한다.

**Validates: Requirements 4.3**

### Property 9: SecurityGroup data is JSON serializable

*For any* 보안그룹 조회 결과, JSON으로 직렬화한 후 역직렬화하면 동일한 데이터 구조를 유지해야 한다.

**Validates: Requirements 4.4**

### Property 10: Integrated fetch calls all fetchers

*For any* 유효한 계정 정보로 전체 리소스를 조회할 때, EC2, VPC, 보안그룹 fetcher가 모두 호출되어야 한다.

**Validates: Requirements 5.1**

### Property 11: Integrated fetch returns structured data

*For any* 전체 리소스 조회 결과, account_id, region, timestamp, ec2_instances, vpcs, security_groups 필드를 포함한 구조화된 데이터를 반환해야 한다.

**Validates: Requirements 5.2**

### Property 12: Partial failure continues execution

*For any* 리소스 조회 중 특정 fetcher가 실패하더라도, 해당 리소스는 빈 리스트로 처리되고 나머지 리소스 조회는 계속되어야 한다.

**Validates: Requirements 5.3**

### Property 13: API failure raises exception with details

*For any* AWS API 호출 실패, 에러 타입과 메시지를 포함한 예외가 발생해야 한다.

**Validates: Requirements 6.1**

## Error Handling


### Error Types

시스템은 다음과 같은 커스텀 예외를 정의합니다:

```python
class AWSResourceFetcherError(Exception):
    """Base exception for all fetcher errors"""
    pass

class AssumeRoleError(AWSResourceFetcherError):
    """AssumeRole 실패 시 발생"""
    def __init__(self, account_id: str, role_name: str, original_error: Exception):
        self.account_id = account_id
        self.role_name = role_name
        self.original_error = original_error
        super().__init__(f"Failed to assume role {role_name} in account {account_id}: {original_error}")

class ResourceFetchError(AWSResourceFetcherError):
    """리소스 조회 실패 시 발생"""
    def __init__(self, resource_type: str, original_error: Exception):
        self.resource_type = resource_type
        self.original_error = original_error
        super().__init__(f"Failed to fetch {resource_type}: {original_error}")

class PermissionError(AWSResourceFetcherError):
    """권한 부족 시 발생"""
    def __init__(self, action: str, required_permissions: list[str]):
        self.action = action
        self.required_permissions = required_permissions
        super().__init__(f"Permission denied for {action}. Required permissions: {', '.join(required_permissions)}")
```

### Error Handling Strategy

1. **AssumeRole 실패**: 
   - AccessDenied → PermissionError 발생
   - InvalidClientTokenId → AssumeRoleError 발생
   - 네트워크 에러 → 재시도 가능 여부를 포함한 AssumeRoleError 발생

2. **리소스 조회 실패**:
   - 권한 부족 → PermissionError 발생 (필요한 권한 목록 포함)
   - 네트워크 에러 → ResourceFetchError 발생 (재시도 가능 표시)
   - 기타 에러 → ResourceFetchError 발생

3. **통합 조회 시 부분 실패**:
   - 특정 리소스 조회 실패 시 해당 리소스는 빈 리스트로 처리
   - 에러 로그 기록
   - 나머지 리소스 조회 계속 진행

## Testing Strategy

### Unit Testing

각 컴포넌트별로 단위 테스트를 작성합니다:

1. **AWSCredentialManager 테스트**:
   - 정상적인 AssumeRole 시나리오
   - 잘못된 계정 번호 처리
   - 권한 부족 에러 처리

2. **Fetcher 클래스 테스트**:
   - 각 리소스 타입별 정상 조회
   - 빈 결과 처리
   - API 에러 처리

3. **통합 인터페이스 테스트**:
   - 전체 리소스 조회
   - 부분 실패 시나리오

### Property-Based Testing

pytest와 Hypothesis 라이브러리를 사용하여 property-based testing을 구현합니다.

**설정**:
- 각 property test는 최소 100회 반복 실행
- 각 테스트는 설계 문서의 correctness property를 명시적으로 참조

**테스트 전략**:
1. **자격증명 완전성 테스트**: 임의의 유효한 AWS 응답을 생성하여 파싱 결과가 모든 필수 필드를 포함하는지 검증
2. **JSON 직렬화 테스트**: 임의의 리소스 데이터를 생성하여 JSON round-trip이 데이터를 보존하는지 검증
3. **에러 처리 테스트**: 다양한 에러 시나리오를 생성하여 적절한 예외가 발생하는지 검증

**Property Test 태그 형식**:
```python
# Feature: aws-resource-fetcher, Property 4: EC2 data is JSON serializable
```

### Mocking Strategy

실제 AWS API 호출을 피하기 위해 boto3 클라이언트를 mocking합니다:
- `moto` 라이브러리를 사용하여 AWS 서비스 mock
- 또는 `unittest.mock`을 사용하여 boto3 클라이언트 응답 mock

## Implementation Notes

### 기술 스택
- **언어**: Python 3.11+
- **AWS SDK**: boto3
- **테스팅**: pytest, hypothesis, moto
- **타입 체킹**: mypy

### 디렉토리 구조
```
aws_resource_fetcher/
├── __init__.py
├── credentials.py          # AWSCredentialManager
├── fetchers/
│   ├── __init__.py
│   ├── base.py            # BaseFetcher 추상 클래스
│   ├── ec2.py             # EC2Fetcher
│   ├── vpc.py             # VPCFetcher
│   └── security_group.py  # SecurityGroupFetcher
├── models.py              # 데이터 모델 (dataclasses)
├── exceptions.py          # 커스텀 예외
└── resource_fetcher.py    # ResourceFetcher (통합 인터페이스)

tests/
├── __init__.py
├── test_credentials.py
├── test_fetchers/
│   ├── test_ec2.py
│   ├── test_vpc.py
│   └── test_security_group.py
├── test_resource_fetcher.py
└── property_tests/
    ├── test_properties.py  # Property-based tests
    └── generators.py       # Hypothesis 전략 (generators)
```

### 성능 고려사항
- boto3 클라이언트는 재사용 (매번 생성하지 않음)
- 페이지네이션 처리 (대량의 리소스가 있는 경우)
- 타임아웃 설정 (기본 30초)

### 보안 고려사항
- 자격증명은 메모리에만 보관, 로그에 출력하지 않음
- AssumeRole 세션은 최소 권한 원칙 적용
- 민감한 정보(IP, 보안그룹 규칙)는 현재 단계에서는 마스킹하지 않음 (추후 고려)
