#!/bin/bash
# AWS 인프라 다이어그램 생성 스크립트

# 프로젝트 루트를 PYTHONPATH에 추가
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# 스크립트 실행
uv run python examples/generate_diagram.py "$@"
