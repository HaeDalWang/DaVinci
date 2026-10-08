# 다중 페이지 가드 (HIGH 1/2 최소 수정)
- src/core/diagram-controller.js: executeCommands가 현재 XML을 읽은 직후(변경/snapshot.save 전에) remove_service/add_connection/remove_connection/replace_all이 배치에 하나라도 있고 mxfile의 직접 diagram이 2개 이상이면 배치 전체를 한국어 안내와 함께 거부. parseDocument/childrenNamed 재사용. XML을 해석할 수 없으면 기존 동작 유지. 단일 페이지/bare model/add_service 경로는 변경 없음.
- tests/diagram-controller-preservation.test.js: 반복 id가 있는 다중 페이지에서 레거시 4명령 각각(live/headless), add_service+remove_service 혼합 배치가 XML 그대로·snapshot.save/merge/loadXml 호출 0인지, 단일 페이지 mxfile의 replace_all은 그대로 동작하는지 추가.
- 결과: `npx vitest --run tests/diagram-controller-preservation.test.js` 44개 통과(기존 38 + 신규 6). 전체 npm test/build와 실제 화면은 미실행(root 담당). 다른 파일 수정 없음, 커밋/푸시 없음.
- 참고: 거부 시점에 읽기용 getCurrentXml 1회가 발생한다(쓰기 부작용 아님). 이전 리뷰의 load 응답 message 가정은 폐기.
DOCKER_GUARD_DONE
