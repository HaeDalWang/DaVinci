# B008 add_service 보존 (worker)
- src/core/diagram-controller.js: add_service를 선택 페이지 XML DOM 삽입으로 교체 (summarize/build 제거).
  pageId 명시 > 활성 pageIndex > 단일 페이지, 모호하면 원본 유지 실패.
  실제 편집기(getEditingState+merge)는 await merge(전체 XML), headless는 await loadXml. 롤백도 동일 방식, 검증 실패(변경 전)는 재로드 없음.
  거부: 미등록/프로토타입 type(문자열 style만 허용), 잘못된/압축/다중 model·root, 중복 ID(선택 페이지), 비유한·음수 geometry, 알 수 없는 그룹 자식 geometry, 자리 없음(탐색 상한 20000).
  removeCellById는 원래 CSS.escape 구현 그대로(제품 변경 없음). add-remove 테스트에서만 CSS.escape를 stubGlobal.
  추가 거부: 비문자열 serviceType(조회 전), 비어있거나 비문자열 group, geometry 없는 최상위 vertex.
- tests/diagram-controller-preservation.test.js: 38개 합성 테스트 통과.
- 미실행: 전체 npm test/build, 실제 iframe 확인 (root 담당). 커밋/푸시 없음.
- 레이어: 부모 없는 실제 root 셀을 찾고 그 ID를 parent로 가진 셀을 레이어로 사용(0/1 하드코딩 제거). 커스텀 root/레이어 ID 회귀 추가.
- 다중 레이어: 바깥 배치는 모든 레이어의 최상위 vertex 범위를 고려, 삽입 레이어는 visible/unlocked 첫 레이어(없으면 실패). 상대(relative=1) geometry는 거부(미지원).
ADD_PRESERVATION_DONE
