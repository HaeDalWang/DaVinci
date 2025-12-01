# Requirements Document

## Introduction

프로젝트 다빈치의 Phase 2로, Phase 1에서 수집한 AWS 리소스 정보(EC2, VPC, SecurityGroup)를 분석하여 리소스 간 연관성과 연결성을 파악합니다. 이를 통해 Phase 3의 다이어그램 생성을 위한 구조화된 관계 데이터를 생성합니다.

## Glossary

- **System**: 리소스 관계 분석 시스템
- **Resource**: AWS의 EC2, VPC, SecurityGroup 등의 인프라 구성요소
- **Relationship**: 두 리소스 간의 연결 또는 의존 관계
- **Connectivity**: 보안그룹 규칙을 기반으로 한 네트워크 통신 가능 여부
- **Resource Graph**: 리소스와 관계를 노드와 엣지로 표현한 그래프 구조
- **Network Flow**: 리소스 간 네트워크 트래픽이 흐를 수 있는 경로

## Requirements

### Requirement 1

**User Story:** 사용자로서, Phase 1에서 수집한 리소스 데이터를 입력받고 싶습니다. 그래야 관계 분석을 시작할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 리소스 데이터를 제공하면, THE System SHALL JSON 형식의 EC2, VPC, SecurityGroup 데이터를 파싱한다
2. WHEN 리소스 데이터를 파싱하면, THE System SHALL 각 리소스의 ID, 타입, 속성을 추출한다
3. IF 입력 데이터가 유효하지 않으면, THEN THE System SHALL 명확한 에러 메시지를 반환한다
4. WHEN 리소스 데이터를 파싱하면, THE System SHALL 파싱된 리소스 객체 목록을 반환한다

### Requirement 2

**User Story:** 사용자로서, EC2 인스턴스와 VPC 간의 관계를 파악하고 싶습니다. 그래야 네트워크 구조를 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 인스턴스 데이터를 분석하면, THE System SHALL 해당 인스턴스가 속한 VPC를 식별한다
2. WHEN EC2 인스턴스 데이터를 분석하면, THE System SHALL 해당 인스턴스가 속한 Subnet을 식별한다
3. WHEN VPC-EC2 관계를 생성하면, THE System SHALL 관계 타입을 "contains"로 설정한다
4. WHEN Subnet-EC2 관계를 생성하면, THE System SHALL 관계 타입을 "hosts"로 설정한다

### Requirement 3

**User Story:** 사용자로서, EC2 인스턴스와 SecurityGroup 간의 관계를 파악하고 싶습니다. 그래야 보안 설정을 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 인스턴스 데이터를 분석하면, THE System SHALL 해당 인스턴스에 연결된 모든 SecurityGroup을 식별한다
2. WHEN EC2-SecurityGroup 관계를 생성하면, THE System SHALL 관계 타입을 "protected_by"로 설정한다
3. WHEN SecurityGroup이 여러 개 연결되어 있으면, THE System SHALL 각 SecurityGroup마다 별도의 관계를 생성한다

### Requirement 4

**User Story:** 사용자로서, SecurityGroup 규칙을 분석하여 리소스 간 통신 가능 여부를 파악하고 싶습니다. 그래야 네트워크 트래픽 흐름을 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN SecurityGroup의 인바운드 규칙을 분석하면, THE System SHALL 허용된 소스(CIDR 또는 다른 SecurityGroup)를 식별한다
2. WHEN SecurityGroup의 아웃바운드 규칙을 분석하면, THE System SHALL 허용된 대상(CIDR 또는 다른 SecurityGroup)을 식별한다
3. WHEN SecurityGroup 규칙에서 다른 SecurityGroup을 참조하면, THE System SHALL 두 SecurityGroup 간 "allows_traffic_from" 또는 "allows_traffic_to" 관계를 생성한다
4. WHEN SecurityGroup 규칙을 분석하면, THE System SHALL 프로토콜과 포트 정보를 관계 속성에 포함한다

### Requirement 5

**User Story:** 사용자로서, 두 EC2 인스턴스 간 통신 가능 여부를 판단하고 싶습니다. 그래야 애플리케이션 흐름을 파악할 수 있습니다.

#### Acceptance Criteria

1. WHEN 두 EC2 인스턴스를 비교하면, THE System SHALL 각 인스턴스의 SecurityGroup 규칙을 분석한다
2. WHEN 인스턴스 A의 아웃바운드 규칙이 인스턴스 B의 SecurityGroup을 허용하고, 인스턴스 B의 인바운드 규칙이 인스턴스 A의 SecurityGroup을 허용하면, THE System SHALL 두 인스턴스 간 "can_communicate_with" 관계를 생성한다
3. WHEN 통신 가능 관계를 생성하면, THE System SHALL 허용된 프로토콜과 포트 정보를 포함한다
4. IF 양방향 통신이 불가능하면, THEN THE System SHALL 관계를 생성하지 않는다

### Requirement 6

**User Story:** 사용자로서, 분석된 관계를 그래프 구조로 표현하고 싶습니다. 그래야 다이어그램 생성에 활용할 수 있습니다.

#### Acceptance Criteria

1. WHEN 모든 관계 분석이 완료되면, THE System SHALL 리소스를 노드로, 관계를 엣지로 하는 그래프를 생성한다
2. WHEN 그래프를 생성하면, THE System SHALL 각 노드에 리소스 ID, 타입, 이름, 속성을 포함한다
3. WHEN 그래프를 생성하면, THE System SHALL 각 엣지에 관계 타입, 방향, 속성을 포함한다
4. WHEN 그래프를 생성하면, THE System SHALL JSON 형태로 직렬화 가능한 구조를 반환한다

### Requirement 7

**User Story:** 사용자로서, VPC별로 리소스를 그룹핑하고 싶습니다. 그래야 네트워크 경계를 명확히 표현할 수 있습니다.

#### Acceptance Criteria

1. WHEN 그래프를 생성하면, THE System SHALL VPC별로 리소스를 그룹핑한다
2. WHEN VPC 그룹을 생성하면, THE System SHALL 해당 VPC에 속한 모든 Subnet과 EC2 인스턴스를 포함한다
3. WHEN VPC 그룹을 생성하면, THE System SHALL VPC ID, 이름, CIDR 블록 정보를 포함한다
4. WHEN 리소스가 VPC에 속하지 않으면, THE System SHALL 별도의 "ungrouped" 카테고리에 포함한다

### Requirement 8

**User Story:** 사용자로서, 분석 결과를 JSON 형태로 저장하고 싶습니다. 그래야 Phase 3에서 다이어그램 생성에 활용할 수 있습니다.

#### Acceptance Criteria

1. WHEN 분석이 완료되면, THE System SHALL 그래프 데이터를 JSON 형태로 직렬화한다
2. WHEN JSON을 생성하면, THE System SHALL nodes, edges, groups 섹션을 포함한다
3. WHEN JSON을 생성하면, THE System SHALL 메타데이터(분석 시간, 리소스 개수)를 포함한다
4. WHEN JSON을 직렬화하면, THE System SHALL 역직렬화 시 동일한 그래프 구조를 복원할 수 있어야 한다

### Requirement 9

**User Story:** 사용자로서, 분석 중 발생한 에러를 명확히 알고 싶습니다. 그래야 문제를 빠르게 해결할 수 있습니다.

#### Acceptance Criteria

1. WHEN 리소스 참조가 유효하지 않으면, THE System SHALL 해당 리소스 ID와 에러 메시지를 포함한 예외를 발생시킨다
2. WHEN 순환 참조가 발견되면, THE System SHALL 경고 로그를 출력하고 분석을 계속한다
3. WHEN 데이터 파싱이 실패하면, THE System SHALL 실패한 필드와 예상 형식을 포함한 에러 메시지를 반환한다
