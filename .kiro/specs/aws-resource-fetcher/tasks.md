# Implementation Plan

- [x] 1. 프로젝트 구조 및 기본 설정
  - Python 프로젝트 초기화 (pyproject.toml 또는 requirements.txt)
  - 디렉토리 구조 생성 (aws_resource_fetcher/, tests/)
  - 필요한 의존성 설치 (boto3, pytest, hypothesis, moto, mypy)
  - _Requirements: 전체_

- [x] 2. 데이터 모델 및 예외 클래스 구현
- [x] 2.1 데이터 모델 정의 (models.py)
  - AWSCredentials, EC2Instance, VPC, Subnet, SecurityGroup, SecurityGroupRule dataclass 작성
  - 타입 힌트 포함
  - _Requirements: 3.2, 4.2, 5.2, 5.3_

- [x] 2.2 커스텀 예외 클래스 구현 (exceptions.py)
  - AWSResourceFetcherError, AssumeRoleError, ResourceFetchError, PermissionError 작성
  - NoCredentialsError 추가
  - 에러 메시지 포맷팅
  - _Requirements: 1.5, 2.3, 7.1, 7.2, 7.3_

- [x] 2.3 데이터 모델 property test 작성
  - **Property 6: EC2 data is JSON serializable**
  - **Validates: Requirements 3.3**

- [x] 2.4 데이터 모델 property test 작성
  - **Property 8: VPC data is JSON serializable**
  - **Validates: Requirements 4.3**

- [x] 2.5 데이터 모델 property test 작성
  - **Property 11: SecurityGroup data is JSON serializable**
  - **Validates: Requirements 5.4**

- [x] 3. AWS 자격증명 관리자 구현
- [x] 3.1 AWSCredentialManager 클래스 구현 (credentials.py)
  - assume_role 메서드 구현
  - boto3 STS 클라이언트 사용
  - 자격증명 반환 (dict 형태)
  - _Requirements: 2.1, 2.2_

- [ ] 3.2 기본 자격증명 지원 추가
  - get_default_credentials 메서드 구현
  - boto3 세션의 기본 자격증명 체인 사용
  - 환경변수, ~/.aws/credentials, IAM Role 순서로 조회
  - NoCredentialsError 예외 처리
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3.3 AssumeRole 에러 처리 구현
  - AccessDenied, InvalidClientTokenId 등 에러 타입별 처리
  - 적절한 예외 발생
  - _Requirements: 2.3, 7.1, 7.2_

- [ ]* 3.4 기본 자격증명 property test 작성
  - **Property 1: Default credentials returns valid credentials**
  - **Validates: Requirements 1.4**

- [ ]* 3.5 기본 자격증명 에러 property test 작성
  - **Property 2: Default credentials failure raises exception**
  - **Validates: Requirements 1.5**

- [ ]* 3.6 AWSCredentialManager property test 작성
  - **Property 3: AssumeRole returns complete credentials**
  - **Validates: Requirements 2.2**

- [ ]* 3.7 AWSCredentialManager property test 작성
  - **Property 4: AssumeRole failure raises appropriate exception**
  - **Validates: Requirements 2.3**

- [x] 4. EC2 Fetcher 구현
- [x] 4.1 BaseFetcher 추상 클래스 구현 (fetchers/base.py)
  - boto3 클라이언트 생성 공통 로직
  - 에러 처리 공통 로직
  - _Requirements: 전체_

- [x] 4.2 EC2Fetcher 클래스 구현 (fetchers/ec2.py)
  - fetch_instances 메서드 구현
  - boto3 EC2 클라이언트로 인스턴스 조회
  - 응답 데이터를 EC2Instance 모델로 변환
  - 빈 결과 처리
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 4.3 EC2 조회 에러 처리
  - 권한 부족, 네트워크 에러 등 처리
  - ResourceFetchError 발생
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 4.4 EC2Fetcher property test 작성
  - **Property 5: EC2 fetch returns complete instance data**
  - **Validates: Requirements 3.2**

- [x] 5. VPC Fetcher 구현
- [x] 5.1 VPCFetcher 클래스 구현 (fetchers/vpc.py)
  - fetch_vpcs 메서드 구현
  - boto3 EC2 클라이언트로 VPC 및 서브넷 조회
  - 응답 데이터를 VPC 모델로 변환
  - 빈 결과 처리
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 5.2 VPC 조회 에러 처리
  - 권한 부족, 네트워크 에러 등 처리
  - ResourceFetchError 발생
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 5.3 VPCFetcher property test 작성
  - **Property 7: VPC fetch returns complete VPC data**
  - **Validates: Requirements 4.2**

- [x] 6. SecurityGroup Fetcher 구현
- [x] 6.1 SecurityGroupFetcher 클래스 구현 (fetchers/security_group.py)
  - fetch_security_groups 메서드 구현
  - boto3 EC2 클라이언트로 보안그룹 조회
  - 인바운드/아웃바운드 규칙 파싱
  - 응답 데이터를 SecurityGroup 모델로 변환
  - 빈 결과 처리
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 6.2 SecurityGroup 조회 에러 처리
  - 권한 부족, 네트워크 에러 등 처리
  - ResourceFetchError 발생
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 6.3 SecurityGroupFetcher property test 작성
  - **Property 9: SecurityGroup fetch returns complete data**
  - **Validates: Requirements 5.2**

- [ ]* 6.4 SecurityGroupFetcher property test 작성
  - **Property 10: SecurityGroup rules contain required fields**
  - **Validates: Requirements 5.3**

- [x] 7. 통합 리소스 조회 인터페이스 구현
- [x] 7.1 ResourceFetcher 클래스 구현 (resource_fetcher.py)
  - fetch_all_resources 메서드 구현
  - AWSCredentialManager로 자격증명 획득
  - 각 Fetcher 순차 호출 (EC2, VPC, SecurityGroup)
  - 결과를 구조화된 dict로 반환 (account_id, region, timestamp 포함)
  - _Requirements: 6.1, 6.2_

- [x] 7.2 부분 실패 처리 구현
  - 특정 Fetcher 실패 시 빈 리스트로 처리
  - 에러 로깅
  - 나머지 Fetcher 계속 실행
  - _Requirements: 6.3_

- [x] 7.3 ResourceFetcher property test 작성
  - **Property 12: Integrated fetch calls all fetchers**
  - **Validates: Requirements 6.1**

- [x] 7.4 ResourceFetcher property test 작성
  - **Property 13: Integrated fetch returns structured data**
  - **Validates: Requirements 6.2**

- [x] 7.5 ResourceFetcher property test 작성
  - **Property 14: Partial failure continues execution**
  - **Validates: Requirements 6.3**

- [x] 7.6 에러 처리 property test 작성
  - **Property 15: API failure raises exception with details**
  - **Validates: Requirements 7.1**

- [x] 8. Checkpoint - 모든 테스트 통과 확인
  - 모든 테스트가 통과하는지 확인하고, 문제가 있으면 사용자에게 질문합니다.

- [x] 9. 통합 테스트 및 문서화
- [x] 9.1 간단한 사용 예제 작성
  - README.md에 기본 사용법 추가
  - 예제 코드 작성
  - _Requirements: 전체_

- [x] 9.2 엔드투엔드 통합 테스트 작성
  - moto를 사용한 전체 플로우 테스트
  - 실제 시나리오 시뮬레이션
  - _Requirements: 전체_
