# Requirements Document

## Introduction

프로젝트 다빈치의 Phase 2로, Phase 1에서 수집한 AWS 리소스 정보를 분석하여 리소스 간 관계를 파악하고 그래프 구조로 표현합니다. 생성된 그래프 JSON은 Phase 3에서 draw.io XML로 변환되어 시각적 다이어그램이 됩니다.

## Glossary

- **System**: 리소스 그래프 빌더 시스템
- **Resource**: AWS의 EC2, VPC, SecurityGroup 등의 인프라 구성요소
- **Node**: 그래프에서 리소스를 나타내는 노드
- **Edge**: 그래프에서 리소스 간 관계를 나타내는 엣지
- **Graph**: 노드와 엣지로 구성된 리소스 관계 그래프
- **Group**: VPC 등 리소스를 논리적으로 묶는 그룹

## Requirements

### Requirement 1

**User Story:** 사용자로서, Phase 1의 리소스 데이터를 입력하고 싶습니다. 그래야 그래프 생성을 시작할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 Phase 1 JSON 데이터를 제공하면, THE System SHALL EC2, VPC, SecurityGroup 데이터를 파싱한다
2. WHEN 데이터를 파싱하면, THE System SHALL 각 리소스를 노드로 변환한다
3. IF 입력 데이터가 유효하지 않으면, THEN THE System SHALL 명확한 에러 메시지를 반환한다

### Requirement 2

**User Story:** 사용자로서, EC2와 VPC 간 관계를 그래프에 표현하고 싶습니다. 그래야 네트워크 구조를 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 인스턴스를 분석하면, THE System SHALL 해당 인스턴스가 속한 VPC로의 엣지를 생성한다
2. WHEN EC2 인스턴스를 분석하면, THE System SHALL 해당 인스턴스가 속한 Subnet으로의 엣지를 생성한다
3. WHEN VPC-EC2 엣지를 생성하면, THE System SHALL 엣지 타입을 "contains"로 설정한다
4. WHEN Subnet-EC2 엣지를 생성하면, THE System SHALL 엣지 타입을 "hosts"로 설정한다

### Requirement 3

**User Story:** 사용자로서, EC2와 SecurityGroup 간 관계를 그래프에 표현하고 싶습니다. 그래야 보안 설정을 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 인스턴스를 분석하면, THE System SHALL 연결된 모든 SecurityGroup으로의 엣지를 생성한다
2. WHEN EC2-SecurityGroup 엣지를 생성하면, THE System SHALL 엣지 타입을 "uses"로 설정한다

### Requirement 4

**User Story:** 사용자로서, SecurityGroup 규칙을 분석하여 리소스 간 통신 가능성을 파악하고 싶습니다. 그래야 트래픽 흐름을 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN SecurityGroup 인바운드 규칙이 다른 SecurityGroup을 참조하면, THE System SHALL 두 SecurityGroup 간 엣지를 생성한다
2. WHEN SecurityGroup 아웃바운드 규칙이 다른 SecurityGroup을 참조하면, THE System SHALL 두 SecurityGroup 간 엣지를 생성한다
3. WHEN SecurityGroup 간 엣지를 생성하면, THE System SHALL 엣지 타입을 "allows_traffic"로 설정한다
4. WHEN SecurityGroup 간 엣지를 생성하면, THE System SHALL 프로토콜과 포트 정보를 엣지 속성에 포함한다

### Requirement 5

**User Story:** 사용자로서, VPC별로 리소스를 그룹핑하고 싶습니다. 그래야 네트워크 경계를 명확히 표현할 수 있습니다.

#### Acceptance Criteria

1. WHEN 그래프를 생성하면, THE System SHALL VPC별로 리소스 그룹을 생성한다
2. WHEN VPC 그룹을 생성하면, THE System SHALL 해당 VPC에 속한 모든 Subnet과 EC2를 그룹 멤버로 포함한다
3. WHEN VPC 그룹을 생성하면, THE System SHALL VPC ID, 이름, CIDR 정보를 그룹 속성에 포함한다

### Requirement 6

**User Story:** 사용자로서, 생성된 그래프를 JSON 형태로 저장하고 싶습니다. 그래야 Phase 3에서 draw.io로 변환할 수 있습니다.

#### Acceptance Criteria

1. WHEN 그래프 생성이 완료되면, THE System SHALL 그래프를 JSON 형태로 직렬화한다
2. WHEN JSON을 생성하면, THE System SHALL nodes, edges, groups 섹션을 포함한다
3. WHEN JSON을 생성하면, THE System SHALL 메타데이터(생성 시간, 리소스 개수)를 포함한다
4. WHEN JSON을 직렬화하면, THE System SHALL 역직렬화 시 동일한 그래프를 복원할 수 있어야 한다

### Requirement 7

**User Story:** 사용자로서, 노드에 draw.io 렌더링에 필요한 정보를 포함하고 싶습니다. 그래야 Phase 3에서 적절한 아이콘과 레이아웃을 적용할 수 있습니다.

#### Acceptance Criteria

1. WHEN 노드를 생성하면, THE System SHALL 리소스 타입(ec2, vpc, security_group)을 포함한다
2. WHEN 노드를 생성하면, THE System SHALL 리소스 ID, 이름, 상태 정보를 포함한다
3. WHEN EC2 노드를 생성하면, THE System SHALL private_ip, public_ip 정보를 포함한다
4. WHEN VPC 노드를 생성하면, THE System SHALL CIDR 블록 정보를 포함한다

### Requirement 8

**User Story:** 사용자로서, 에러 발생 시 명확한 정보를 받고 싶습니다. 그래야 문제를 빠르게 해결할 수 있습니다.

#### Acceptance Criteria

1. WHEN 리소스 참조가 유효하지 않으면, THE System SHALL 해당 리소스 ID를 포함한 예외를 발생시킨다
2. WHEN 데이터 파싱이 실패하면, THE System SHALL 실패한 필드와 예상 형식을 포함한 에러 메시지를 반환한다
