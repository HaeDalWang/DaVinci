# Requirements Document

## Introduction

프로젝트 다빈치의 Phase 3로, Phase 2에서 생성한 리소스 그래프 JSON을 draw.io XML 형식으로 변환합니다. 생성된 XML은 draw.io 웹/데스크톱 앱에서 열어 편집할 수 있으며, AWS Architecture Icons 2025를 사용하여 시각적으로 표현됩니다.

## Glossary

- **System**: draw.io XML 생성기 시스템
- **Graph JSON**: Phase 2에서 생성한 리소스 그래프 JSON
- **draw.io XML**: draw.io 애플리케이션에서 사용하는 다이어그램 XML 형식
- **Shape**: draw.io에서 노드를 나타내는 도형
- **Connector**: draw.io에서 엣지를 나타내는 연결선
- **Container**: draw.io에서 그룹을 나타내는 컨테이너 (VPC 등)
- **AWS Icon**: AWS Architecture Icons 2025 아이콘 세트

## Requirements

### Requirement 1

**User Story:** 사용자로서, Phase 2 그래프 JSON을 입력하고 싶습니다. 그래야 draw.io XML 생성을 시작할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 Phase 2 그래프 JSON을 제공하면, THE System SHALL nodes, edges, groups 데이터를 파싱한다
2. WHEN 데이터를 파싱하면, THE System SHALL 각 노드를 draw.io Shape로 변환한다
3. IF 입력 데이터가 유효하지 않으면, THEN THE System SHALL 명확한 에러 메시지를 반환한다

### Requirement 2

**User Story:** 사용자로서, EC2 인스턴스를 AWS Architecture Icons 2025로 표현하고 싶습니다. 그래야 표준화된 다이어그램을 생성할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 노드를 변환하면, THE System SHALL AWS Architecture Icons 2025의 EC2 아이콘을 사용한다
2. WHEN 아이콘을 사용하면, THE System SHALL 아이콘 크기를 78x78 픽셀로 설정한다
3. WHEN SecurityGroup 노드를 만나면, THE System SHALL 아이콘을 생성하지 않는다
4. WHEN VPC 노드를 만나면, THE System SHALL 컨테이너로 변환한다
5. WHEN Subnet 노드를 만나면, THE System SHALL 컨테이너로 변환한다

### Requirement 3

**User Story:** 사용자로서, 리소스에 정보를 표시하고 싶습니다. 그래야 다이어그램에서 리소스를 식별할 수 있습니다.

#### Acceptance Criteria

1. WHEN EC2 Shape를 생성하면, THE System SHALL 리소스 이름을 아이콘 아래에 표시한다
2. WHEN EC2 Shape를 생성하면, THE System SHALL private IP를 이름 아래에 표시한다
3. WHEN VPC Container를 생성하면, THE System SHALL VPC 이름과 CIDR 블록을 상단에 표시한다
4. WHEN Subnet Container를 생성하면, THE System SHALL Subnet 이름과 CIDR 블록을 상단에 표시한다
5. WHEN 텍스트를 표시하면, THE System SHALL 폰트 크기를 12pt로 설정한다

### Requirement 4

**User Story:** 사용자로서, EC2 인스턴스 간 트래픽 흐름을 화살표로 표현하고 싶습니다. 그래야 네트워크 통신 구조를 이해할 수 있습니다.

#### Acceptance Criteria

1. WHEN allows_traffic 엣지를 변환하면, THE System SHALL EC2 인스턴스 간 연결선으로 생성한다
2. WHEN allows_traffic 엣지를 변환하면, THE System SHALL 굵은 실선 화살표로 표시한다
3. WHEN allows_traffic 엣지를 변환하면, THE System SHALL 프로토콜과 포트 정보를 라벨로 표시한다
4. WHEN SecurityGroup 간 allows_traffic 엣지를 만나면, THE System SHALL 해당 SecurityGroup을 사용하는 EC2 인스턴스 간 연결선을 생성한다
5. WHEN contains, hosts, uses 엣지를 만나면, THE System SHALL 연결선을 생성하지 않는다

### Requirement 5

**User Story:** 사용자로서, VPC와 Subnet을 AWS Groups 아이콘으로 표현하고 싶습니다. 그래야 네트워크 경계를 명확히 볼 수 있습니다.

#### Acceptance Criteria

1. WHEN VPC 그룹을 변환하면, THE System SHALL AWS Architecture Icons 2025의 VPC Group 아이콘을 사용한다
2. WHEN VPC Group을 생성하면, THE System SHALL 녹색 테두리와 투명 배경을 사용한다
3. WHEN Subnet 노드를 변환하면, THE System SHALL AWS Architecture Icons 2025의 Subnet Group 아이콘을 사용한다
4. WHEN Subnet Group을 생성하면, THE System SHALL 파란색 테두리와 투명 배경을 사용한다
5. WHEN Subnet Group을 배치하면, THE System SHALL VPC Group 내부에 중첩하여 배치한다
6. WHEN EC2 인스턴스를 배치하면, THE System SHALL 해당 Subnet Group 내부에 배치한다
7. WHEN Group을 생성하면, THE System SHALL 멤버 개수에 따라 크기를 자동 조정한다

### Requirement 6

**User Story:** 사용자로서, 리소스를 자동으로 배치하고 싶습니다. 그래야 수동으로 위치를 조정할 필요가 없습니다.

#### Acceptance Criteria

1. WHEN 다이어그램을 생성하면, THE System SHALL VPC Container를 좌측 상단부터 배치한다
2. WHEN VPC Container 내부에 Subnet Container를 배치하면, THE System SHALL 그리드 레이아웃을 사용한다
3. WHEN Subnet Container 내부에 EC2를 배치하면, THE System SHALL 그리드 레이아웃을 사용한다
4. WHEN EC2를 배치하면, THE System SHALL EC2 간 최소 간격을 100 픽셀로 유지한다
5. WHEN Subnet Container를 배치하면, THE System SHALL Subnet 간 최소 간격을 120 픽셀로 유지한다
6. WHEN VPC Container를 배치하면, THE System SHALL VPC 간 최소 간격을 150 픽셀로 유지한다

### Requirement 7

**User Story:** 사용자로서, 생성된 XML을 draw.io에서 열고 싶습니다. 그래야 다이어그램을 확인하고 편집할 수 있습니다.

#### Acceptance Criteria

1. WHEN XML을 생성하면, THE System SHALL draw.io 표준 형식을 준수한다
2. WHEN XML을 생성하면, THE System SHALL UTF-8 인코딩을 사용한다
3. WHEN XML을 생성하면, THE System SHALL 압축되지 않은 형식으로 저장한다
4. WHEN XML을 파일로 저장하면, THE System SHALL .drawio 확장자를 사용한다

### Requirement 8

**User Story:** 사용자로서, 에러 발생 시 명확한 정보를 받고 싶습니다. 그래야 문제를 빠르게 해결할 수 있습니다.

#### Acceptance Criteria

1. WHEN 그래프 JSON 파싱이 실패하면, THE System SHALL 실패한 필드를 포함한 에러 메시지를 반환한다
2. WHEN 알 수 없는 노드 타입을 만나면, THE System SHALL 해당 노드 ID와 타입을 포함한 예외를 발생시킨다
