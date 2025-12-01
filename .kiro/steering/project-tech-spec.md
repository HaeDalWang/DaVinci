# AWS Resource Fetcher 프로젝트 기술 명세

## 프로젝트 개요
- **프로젝트명**: AWS Resource Fetcher
- **목적**: 프로젝트 다빈치 - AWS 리소스 조회 및 다이어그램 생성 시스템의 첫 단계
- **언어**: Python 3.11+

## 필수 기술 스택

### 패키지 관리자
- **uv**: Python 패키지 관리 및 실행 도구
- **명령어 규칙**:
  - 의존성 추가: `uv add <package>`
  - 개발 의존성 추가: `uv add --dev <package>`
  - 의존성 제거: `uv remove <package>`
  - 환경 동기화: `uv sync`
  - Python 실행: `uv run python <script>`
  - 테스트 실행: `uv run pytest`
  - 타입 체킹: `uv run mypy <files>`
  - **절대 `python`, `pip`, `pytest` 명령어를 직접 사용하지 말것!**

### 핵심 라이브러리
- **boto3**: AWS SDK (>=1.34.0)
- **boto3-stubs[ec2,sts]**: boto3 타입 힌트

### 개발 도구
- **pytest**: 테스트 프레임워크 (>=7.4.0)
- **hypothesis**: Property-Based Testing (>=6.92.0)
- **moto**: AWS 서비스 모킹 (>=4.2.0)
- **mypy**: 정적 타입 체킹 (>=1.7.0)

## 프로젝트 구조
```
aws_resource_fetcher/
├── __init__.py
├── models.py              # 데이터 모델 (dataclasses)
├── exceptions.py          # 커스텀 예외
├── credentials.py         # AWSCredentialManager
├── fetchers/
│   ├── __init__.py
│   ├── base.py           # BaseFetcher 추상 클래스
│   ├── ec2.py            # EC2Fetcher
│   ├── vpc.py            # VPCFetcher
│   └── security_group.py # SecurityGroupFetcher
└── resource_fetcher.py   # ResourceFetcher (통합 인터페이스)

tests/
├── __init__.py
├── test_fetchers/
│   ├── test_ec2.py
│   ├── test_vpc.py
│   └── test_security_group.py
├── test_credentials.py
├── test_resource_fetcher.py
└── property_tests/
    ├── test_properties.py
    └── generators.py
```

## 코딩 규칙

### 타입 힌트
- 모든 함수와 메서드에 타입 힌트 필수
- Python 3.11+ 문법 사용 (`list[str]`, `dict[str, Any]`, `str | None`)
- mypy strict 모드 통과 필수

### 데이터 모델
- dataclass 사용
- 불변성이 필요한 경우 `frozen=True` 옵션 고려

### 에러 처리
- 커스텀 예외 사용 (exceptions.py)
- 에러 메시지는 명확하고 구체적으로
- 원본 에러를 항상 포함 (original_error)

### 테스트
- Unit Test: pytest 사용
- Property-Based Test: hypothesis 사용, 최소 100회 반복
- AWS 모킹: moto 라이브러리 사용
- 각 property test는 설계 문서의 property 번호를 주석으로 명시

## AWS 관련 규칙

### 리전
- 기본 리전: `ap-northeast-2` (서울)

### 자격증명
- CrossAccount AssumeRole 사용
- 임시 자격증명만 사용 (access_key, secret_key, session_token)
- 자격증명은 로그에 출력 금지

### 리소스 조회
- boto3 클라이언트 재사용
- 페이지네이션 처리 필수
- 타임아웃: 기본 30초

## 명령어 치트시트

```bash
# 프로젝트 초기 설정
uv sync  # pyproject.toml 기반으로 환경 동기화

# 의존성 관리
uv add boto3  # 의존성 추가
uv add --dev pytest hypothesis moto mypy  # 개발 의존성 추가
uv remove <package>  # 의존성 제거
uv lock  # lockfile 업데이트 (설치 없이)
uv lock --upgrade  # 모든 패키지 업그레이드
uv lock --upgrade-package <package>  # 특정 패키지만 업그레이드

# 테스트 실행
uv run pytest
uv run pytest tests/property_tests/  # property test만
uv run pytest -v  # verbose 모드

# 타입 체킹
uv run mypy aws_resource_fetcher/ --strict

# 특정 파일 실행
uv run python -m aws_resource_fetcher.resource_fetcher
```

## 중요 참고사항
- **절대 `python` 명령어를 직접 사용하지 말 것** → `uv run python` 사용
- **절대 `pip` 명령어를 직접 사용하지 말 것** → `uv add` / `uv remove` 사용
- **절대 `pytest` 명령어를 직접 사용하지 말 것** → `uv run pytest` 사용
- **절대 `mypy` 명령어를 직접 사용하지 말 것** → `uv run mypy` 사용
- 모든 Python 관련 명령어는 `uv`를 통해 실행
- 패키지 설치는 `uv add`, 제거는 `uv remove`, 환경 동기화는 `uv sync`
