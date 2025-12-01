# 프로젝트 다빈치 - 진행 상황

## 전체 목표
AWS 인프라 다이어그램 자동 생성 플랫폼

Saltware Cloud 사업부의 모든 엔지니어들이 AWS 인프라 다이어그램을 쉽고 빠르게 생성/수정/저장/공유할 수 있는 플랫폼

## 아키텍처 플로우
```
Agent (MCP) 
  → AWS 리소스 조회 (Phase 1)
  → 리소스 그래프 생성 (Phase 2)
  → draw.io XML 생성 (Phase 3)
  → S3 저장 및 공유 (Phase 4)
```

## Phase 진행 상황

### ✅ Phase 1: AWS 리소스 조회 (완료)
- **Spec**: `.kiro/specs/aws-resource-fetcher/`
- **기능**: CrossAccount AssumeRole을 통한 EC2, VPC, SecurityGroup 조회
- **출력**: JSON 형태의 리소스 정보
- **상태**: 구현 완료, 테스트 통과

### 🚧 Phase 2: 리소스 관계 그래프 생성 (Spec 작성 완료)
- **Spec**: `.kiro/specs/resource-relationship-analyzer/`
- **기능**: 리소스 간 연관성 분석 및 그래프 구조 생성
- **입력**: Phase 1의 JSON 출력
- **출력**: 그래프 JSON (노드, 엣지, 그룹)
- **핵심 로직**:
  - EC2-VPC, EC2-Subnet, EC2-SecurityGroup 관계 분석
  - SecurityGroup 규칙 기반 통신 가능 여부 판단
  - VPC별 리소스 그룹핑
  - 리소스 간 연결성 정보 생성
- **상태**: Spec 작성 완료, 구현 대기

### 📋 Phase 3: draw.io XML 생성 (예정)
- **Spec**: `.kiro/specs/drawio-generator/` (작성 예정)
- **기능**: 그래프 JSON을 draw.io XML 형식으로 변환
- **입력**: Phase 2의 그래프 JSON
- **출력**: draw.io XML 파일
- **핵심 로직**:
  - 노드를 draw.io 도형으로 변환 (EC2, VPC, SecurityGroup 아이콘)
  - 엣지를 draw.io 연결선으로 변환
  - VPC 그룹을 컨테이너로 표현
  - 자동 레이아웃 적용

### 📋 Phase 4: 저장 및 메타데이터 관리 (예정)
- S3에 draw.io XML 저장
- Redis 캐시 (리소스 조회 결과, 1일 주기)
- 메타데이터 저장 (생성 시간, 계정 정보 등)

### 📋 Phase 5: 웹 UI 및 공유 기능 (예정)
- 자연어 질의 (Strands Agent 활용)
- 사전정의 파일 (스타일, AWS 서비스 범위)
- 다이어그램 다운로드/재생성/공유
- draw.io 편집 연동

## 현재 작업
**Phase 2 spec 작성 완료 - 구현 준비 완료**

## 기술 스택
- Python 3.11+
- boto3 (AWS SDK)
- uv (패키지 관리)
- FastAPI (API 서버)
- draw.io XML 생성 (직접 구현)

## 주요 제약사항
- 초기 지원 리소스: EC2, VPC, SecurityGroup (Phase 1 완료)
- 추후 확장: RDS, ECS, CloudFront, WAF, Route53, ELB, AutoScalingGroup
- CrossAccount Role은 사전에 모두 존재 (권한 할당 완료)
- 캐시 주기: 1일
- IAM Role/Policy 분석은 추후 지원
- VPC Peering, Transit Gateway는 추후 지원

## 설계 결정
- **AWS Diagram MCP 배제**: 원하는 수준의 결과물을 얻기 어려워 직접 draw.io XML 생성으로 변경
- **draw.io 선택 이유**: 
  - 편집 가능한 XML 형식
  - 웹/데스크톱 앱에서 열기 가능
  - 풍부한 AWS 아이콘 라이브러리
  - 추후 사용자 편집 기능 연동 용이
