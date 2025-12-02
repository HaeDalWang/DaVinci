# Resource Graph Builder (Phase 2)

Phase 1에서 수집한 AWS 리소스 데이터를 분석하여 리소스 간 관계를 그래프로 표현합니다.

## Features

- 📊 리소스를 노드로 변환 (EC2, VPC, Subnet, SecurityGroup)
- 🔗 리소스 간 엣지 생성
  - VPC-EC2 (contains)
  - Subnet-EC2 (hosts)
  - EC2-SecurityGroup (uses)
  - SecurityGroup-SecurityGroup (allows_traffic)
- 📦 VPC별 리소스 그룹핑
- 💾 JSON 직렬화/역직렬화

## Quick Start

```python
from resource_graph_builder.builder import GraphBuilder

# Phase 1 JSON 데이터
phase1_json = {
    'ec2_instances': [...],
    'vpcs': [...],
    'security_groups': [...]
}

# 그래프 생성
builder = GraphBuilder()
graph = builder.build(phase1_json)

# JSON으로 출력
graph_json = graph.to_dict()
```

## Graph Structure

### Node
```python
{
    'id': 'i-xxx',
    'type': 'ec2',
    'name': 'web-server',
    'attributes': {
        'state': 'running',
        'private_ip': '10.0.1.10',
        'public_ip': '54.xxx.xxx.xxx'
    }
}
```

### Edge
```python
{
    'source': 'vpc-xxx',
    'target': 'i-xxx',
    'edge_type': 'contains',
    'attributes': {}
}
```

### Group
```python
{
    'id': 'vpc-xxx',
    'type': 'vpc',
    'name': 'production-vpc',
    'members': ['subnet-xxx', 'i-xxx'],
    'attributes': {
        'vpc_id': 'vpc-xxx',
        'cidr_block': '10.0.0.0/16'
    }
}
```

## Edge Types

- `contains`: VPC가 EC2를 포함
- `hosts`: Subnet이 EC2를 호스팅
- `uses`: EC2가 SecurityGroup을 사용
- `allows_traffic`: SecurityGroup 간 트래픽 허용

## Testing

```bash
# 전체 테스트
uv run pytest tests/

# Property-Based 테스트만
uv run pytest tests/property_tests/

# Phase 1-2 통합 테스트
uv run pytest tests/test_phase1_to_phase2_integration.py
```

## Architecture

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (GraphBuilder - 통합 인터페이스)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Graph Layer                     │
│  - ResourceGraph                    │
│  - Node / Edge / Group              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Parser Layer                    │
│  - ResourceParser                   │
│  - JSON Serializer                  │
└─────────────────────────────────────┘
```

## Requirements

모든 요구사항과 설계 문서는 `.kiro/specs/resource-graph-builder/`에서 확인할 수 있습니다.

- `requirements.md`: 기능 요구사항
- `design.md`: 설계 문서 및 Correctness Properties
- `tasks.md`: 구현 태스크 목록
