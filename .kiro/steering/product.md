# DaVinci — Product Overview

DaVinci is an AWS architecture diagram editor built on draw.io's embed mode. It specializes exclusively in AWS architecture diagrams using AWS 2024 icons.

## Core Capabilities

- Visual diagram editing via embedded draw.io iframe (JSON protocol communication)
- AI-powered architecture generation and modification through a chat sidebar, backed by Amazon Bedrock (Claude)
- Architecture analysis: service detection, connection mapping, category classification
- Optimization tips engine: rule-based checks against AWS Well-Architected best practices
- AWS Well-Architected Framework evaluation (5-pillar scoring via AI)
- Auto-alignment: reorganizes diagrams into AWS best-practice hierarchy (Cloud > VPC > AZ > Subnet)
- Diagram undo/redo via snapshot manager
- Auto-save to localStorage (debounce + beforeunload 즉시 저장)

## Key Concepts

- **Lightweight_JSON**: An intermediate representation (`{ groups, services, connections }`) used between the AI agent and draw.io XML. The AI never produces raw XML directly.
- **Command_Response**: The JSON protocol the AI returns (`{ message, commands }`) to describe diagram mutations.
- **Channel Router**: Routes user messages to either `summary` channel (analysis/advice) or `xml` channel (diagram modification) based on intent keywords. 한국어는 동사 어미 형태, 영어는 단어 경계(`\b`) 매칭으로 오탐을 줄인다.
- **Service Catalog**: Single source of truth for AWS service types, tiers, styles, labels, and categories.

## Language

The UI and all user-facing text are in Korean (한국어). Code comments are also primarily in Korean.
