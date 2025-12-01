# Requirements Document

## Introduction

프로젝트 다빈치의 첫 번째 단계로, AWS 계정에서 EC2, VPC, 보안그룹 리소스를 조회하는 기본 기능을 구현합니다. CrossAccount AssumeRole을 통해 여러 고객사의 AWS 계정에 접근하여 리소스 정보를 JSON 형태로 수집합니다.

## Glossary

- **System**: AWS 리소스 조회 시스템
- **User**: Saltware Cloud 사업부 엔지니어
- **CrossAccount Role**: 고객사 AWS 계정에 접근하기 위한 IAM Role
- **Resource**: AWS의 EC2 인스턴스, VPC, 보안그룹
- **boto3**: AWS SDK for Python

## Requirements

### Requirement 1

**User Story:** 사용자로서, 특정 AWS 계정의 리소스를 조회하고 싶습니다. 그래야 다이어그램 생성을 위한 기본 데이터를 확보할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 AWS 계정 번호를 제공하면, THE System SHALL CrossAccount AssumeRole을 수행하여 해당 계정에 접근한다
2. WHEN AssumeRole이 성공하면, THE System SHALL 임시 자격증명을 반환한다
3. IF AssumeRole이 실패하면, THEN THE System SHALL 명확한 에러 메시지를 반환한다

### Requirement 2

**User Story:** 사용자로서, EC2 인스턴스 정보를 조회하고 싶습니다. 그래야 인프라 다이어그램에 컴퓨팅 리소스를 표시할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 EC2 조회를 요청하면, THE System SHALL 해당 계정의 모든 EC2 인스턴스 정보를 조회한다
2. WHEN EC2 정보를 조회하면, THE System SHALL 인스턴스 ID, 이름, 상태, VPC ID, 서브넷 ID, 보안그룹 ID 목록을 포함한다
3. WHEN EC2 정보를 조회하면, THE System SHALL 결과를 JSON 형태로 반환한다
4. IF EC2가 존재하지 않으면, THEN THE System SHALL 빈 리스트를 반환한다

### Requirement 3

**User Story:** 사용자로서, VPC 정보를 조회하고 싶습니다. 그래야 네트워크 구조를 파악할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 VPC 조회를 요청하면, THE System SHALL 해당 계정의 모든 VPC 정보를 조회한다
2. WHEN VPC 정보를 조회하면, THE System SHALL VPC ID, 이름, CIDR 블록, 서브넷 목록을 포함한다
3. WHEN VPC 정보를 조회하면, THE System SHALL 결과를 JSON 형태로 반환한다
4. IF VPC가 존재하지 않으면, THEN THE System SHALL 빈 리스트를 반환한다

### Requirement 4

**User Story:** 사용자로서, 보안그룹 정보를 조회하고 싶습니다. 그래야 리소스 간 연결성을 분석할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 보안그룹 조회를 요청하면, THE System SHALL 해당 계정의 모든 보안그룹 정보를 조회한다
2. WHEN 보안그룹 정보를 조회하면, THE System SHALL 보안그룹 ID, 이름, VPC ID, 인바운드 규칙, 아웃바운드 규칙을 포함한다
3. WHEN 보안그룹 규칙을 조회하면, THE System SHALL 프로토콜, 포트 범위, 소스/대상 정보를 포함한다
4. WHEN 보안그룹 정보를 조회하면, THE System SHALL 결과를 JSON 형태로 반환한다
5. IF 보안그룹이 존재하지 않으면, THEN THE System SHALL 빈 리스트를 반환한다

### Requirement 5

**User Story:** 사용자로서, 여러 리소스를 한 번에 조회하고 싶습니다. 그래야 효율적으로 전체 인프라 정보를 수집할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 전체 리소스 조회를 요청하면, THE System SHALL EC2, VPC, 보안그룹을 순차적으로 조회한다
2. WHEN 전체 리소스를 조회하면, THE System SHALL 각 리소스 타입별로 구조화된 JSON을 반환한다
3. IF 특정 리소스 조회가 실패하면, THEN THE System SHALL 해당 리소스는 빈 리스트로 처리하고 나머지 조회를 계속한다

### Requirement 6

**User Story:** 사용자로서, API 호출 실패 시 명확한 에러를 받고 싶습니다. 그래야 문제를 빠르게 파악하고 해결할 수 있습니다.

#### Acceptance Criteria

1. WHEN AWS API 호출이 실패하면, THE System SHALL 에러 타입과 메시지를 포함한 예외를 발생시킨다
2. WHEN 권한 부족 에러가 발생하면, THE System SHALL 필요한 권한 정보를 포함한 에러 메시지를 반환한다
3. WHEN 네트워크 에러가 발생하면, THE System SHALL 재시도 가능 여부를 포함한 에러 메시지를 반환한다
