# Implementation Plan: JSON-to-XML Builder

## Overview

AI Agent가 drawio XML 대신 경량 JSON(Lightweight_JSON)을 입출력하도록 하는 JSON-to-XML Builder 레이어를 구현한다. Service Catalog 확장 → Layout Engine → Builder → XML Summarizer → Channel Router/Diagram Controller/Server 통합 순서로 점진적으로 구현한다.

## Tasks

- [x] 1. Service Catalog 확장 (`src/core/aws-service-catalog.js`)
  - [x] 1.1 `getServiceStyle(type)` 함수 추가
    - 서비스 타입에 대한 완전한 drawio mxCell 스타일 문자열 반환
    - 기존 `SERVICE_PATTERNS`의 pattern에서 스타일 문자열을 매핑하여 구축
    - 미등록 타입은 null 반환
    - _Requirements: 4.1, 4.4_

  - [x] 1.2 `getGroupStyle(type)` 함수 추가
    - 그룹 타입(vpc, subnet_public, subnet_private, az, asg, aws_cloud)에 대한 drawio 컨테이너 스타일 문자열 반환
    - 디자인 문서의 Group Style 매핑 테이블 참조
    - 미등록 타입은 null 반환
    - _Requirements: 4.2, 1.5_

  - [x] 1.3 `getServiceDimensions(type)` 함수 추가
    - 서비스 타입의 기본 아이콘 크기(width, height) 반환
    - 기본값 78×78, 미등록 타입은 null 반환
    - _Requirements: 4.3_

  - [ ]* 1.4 Property 7, 8 테스트 작성 (`src/core/__tests__/service-catalog-extended.property.test.js`)
    - **Property 7: 카탈로그 완전성** — 등록된 모든 서비스 타입에 대해 getServiceStyle, getServiceDimensions가 non-null 반환, 모든 그룹 타입에 대해 getGroupStyle이 non-null 반환
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - **Property 8: 미등록 타입 null 반환** — 등록되지 않은 임의 문자열에 대해 getServiceStyle이 null 반환
    - **Validates: Requirements 4.4**

- [x] 2. Checkpoint - 서비스 카탈로그 확장 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Layout Engine 구현 (`src/core/layout-engine.js`)
  - [x] 3.1 `calculateLayout(json)` 함수 구현
    - Lightweight_JSON을 받아 각 요소의 id → {x, y, width, height} 매핑 반환
    - 그룹 계층을 트리로 구성하여 bottom-up 크기 계산
    - 서비스 간 최소 간격 40px, 그룹 내부 패딩 20px, 라벨 영역 30px
    - 같은 그룹 내 서비스는 그리드 배치 (행당 최대 4개)
    - 그룹에 속하지 않는 서비스는 최상위 레벨에 배치
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Property 4, 5, 6 테스트 작성 (`src/core/__tests__/layout-engine.property.test.js`)
    - **Property 4: 부모 그룹이 자식을 포함** — 중첩 그룹 구조에서 부모 바운딩 박스가 모든 자식을 포함
    - **Validates: Requirements 3.1, 3.2**
    - **Property 5: 서비스 간 최소 간격** — 같은 그룹 내 두 서비스 간 바운딩 박스 간격 40px 이상
    - **Validates: Requirements 3.3**
    - **Property 6: 그룹 라벨 영역 확보** — 자식 요소의 y 좌표가 그룹 내부 기준 30px 이상
    - **Validates: Requirements 3.4**

- [x] 4. JSON-to-XML Builder 구현 (`src/core/json-to-xml-builder.js`)
  - [x] 4.1 `buildXml(json)` 함수 구현
    - Lightweight_JSON을 drawio mxGraphModel XML로 변환
    - 내부 처리: 스키마 검증 → Layout Engine 좌표 계산 → 그룹 container mxCell 생성 → 서비스 vertex mxCell 생성 → 연결 edge mxCell 생성 → mxGraphModel 래핑
    - Service Catalog에서 스타일/크기 조회
    - 미등록 서비스 타입은 기본 제네릭 스타일로 렌더링 + console.warn
    - 존재하지 않는 id 참조 연결은 무시 + console.warn
    - 모든 mxCell에 고유 id 부여
    - 기본 엣지 스타일: orthogonalEdgeStyle, rounded=1, strokeColor=#6B7785, strokeWidth=1.5
    - connection에 style 필드가 있으면 커스텀 스타일 적용
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.1, 9.2_

  - [ ]* 4.2 Property 2, 3, 9 테스트 작성 (`src/core/__tests__/json-to-xml-builder.property.test.js`)
    - **Property 2: mxCell ID 고유성** — buildXml이 생성한 XML 내 모든 mxCell id가 중복 없음
    - **Validates: Requirements 2.7**
    - **Property 3: 서비스 스타일 정확성** — 생성된 XML에서 서비스 mxCell style이 getServiceStyle 반환값 포함
    - **Validates: Requirements 2.2, 4.1**
    - **Property 9: 엣지 스타일 적용** — style 미지정 시 기본 스타일, 지정 시 커스텀 스타일 포함
    - **Validates: Requirements 9.1, 9.2**

- [x] 5. Checkpoint - Builder 및 Layout Engine 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. XML Summarizer 구현 (`src/core/xml-summarizer.js`)
  - [x] 6.1 `summarizeXml(xml)` 함수 구현
    - drawio XML을 Lightweight_JSON으로 역변환
    - DOMParser로 XML 파싱
    - container=1 mxCell → groups, vertex=1 + AWS 스타일 → services, edge=1 → connections 분류
    - identifyServiceByStyle()로 서비스 타입 식별
    - parent 속성으로 그룹-서비스 계층 관계 복원
    - 유효하지 않은 XML은 빈 Lightweight_JSON 반환
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 6.2 Property 1 테스트 작성 (`src/core/__tests__/json-to-xml-builder.property.test.js`에 추가)
    - **Property 1: Build-Summarize 라운드트립** — 유효한 Lightweight_JSON에 대해 buildXml → summarizeXml 결과가 원본과 동등한 구조
    - **Validates: Requirements 5.5, 2.1, 5.1, 5.2, 5.3, 5.4**

- [x] 7. Checkpoint - XML Summarizer 및 라운드트립 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Channel Router 통합 (`src/core/channel-router.js`)
  - [x] 8.1 Channel Router 수정
    - 수정/생성 의도 감지 시 XML 대신 summarizeXml로 변환한 Lightweight_JSON을 AI에게 전달
    - 분석/조언 의도 시 기존 summary 채널 유지
    - 원본 drawio XML 전체를 AI에게 전달하지 않도록 변경
    - xml-summarizer.js import 추가
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.2 Property 10 테스트 작성 (`src/core/__tests__/channel-router-json.property.test.js`)
    - **Property 10: Channel Router가 수정 의도 시 Lightweight_JSON 전달** — 수정/생성 키워드 포함 메시지에 대해 payload가 Lightweight_JSON 구조 포함
    - **Validates: Requirements 6.1, 6.3**

- [x] 9. Diagram Controller 통합 (`src/core/diagram-controller.js`)
  - [x] 9.1 `_replaceAll` 메서드 수정
    - params.architecture(Lightweight_JSON) 필드 시 Builder로 XML 변환 후 로드
    - params.xml 필드 시 기존 하위 호환 유지
    - Builder 오류 시 스냅샷 롤백 + 오류 메시지 표시
    - json-to-xml-builder.js, xml-summarizer.js import 추가
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 9.2 `_addService` 메서드 수정
    - 현재 XML을 summarizeXml로 Lightweight_JSON 변환
    - 새 서비스를 JSON에 추가 후 buildXml로 전체 XML 재생성
    - _Requirements: 8.3_

  - [ ]* 9.3 Property 11 테스트 작성 (`src/core/__tests__/diagram-controller-json.property.test.js`)
    - **Property 11: add_service가 기존 서비스 보존** — N개 서비스 다이어그램에 1개 추가 시 총 N+1개 서비스
    - **Validates: Requirements 8.3**

- [x] 10. Server 시스템 프롬프트 변경 (`server/index.js`)
  - [x] 10.1 시스템 프롬프트에 Lightweight_JSON 스키마 추가
    - groups, services, connections 구조 설명 포함
    - AI가 drawio XML을 직접 생성하지 않도록 명시적 지시
    - _Requirements: 7.1, 7.3_

  - [x] 10.2 `replace_all` 커맨드 params 변경
    - xml 필드 대신 architecture 필드(Lightweight_JSON 객체)로 변경
    - 현재 아키텍처 컨텍스트를 Lightweight_JSON 포맷으로 전달
    - _Requirements: 7.2, 7.4_

- [x] 11. Checkpoint - 전체 통합 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 최종 와이어링 및 정리
  - [x] 12.1 Sidebar에서 Channel Router 변경 반영 확인
    - sidebar.js의 API 호출 payload가 새 Channel Router 출력과 호환되는지 확인
    - 필요 시 sidebar.js 수정
    - _Requirements: 6.1, 7.4_

  - [x] 12.2 기존 코드 정리
    - diagram-controller.js에서 더 이상 사용하지 않는 SERVICE_STYLE_MAP 등 레거시 코드 제거
    - 불필요한 import 정리
    - _Requirements: 2.2, 4.1_

- [x] 13. Final checkpoint - 전체 테스트 통과 확인
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- 구현 순서는 의존성 기반: Service Catalog → Layout Engine → Builder → XML Summarizer → 통합 모듈들
