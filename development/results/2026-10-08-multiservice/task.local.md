# B016 작업 지시

cwd: /Users/baeseungdo/work/DaVinci, main. 다른 작업자(조율자)가 함께 있으며 기존 미커밋 작업은 이미 사용자가 확인한 결과다. 되돌리거나 포맷 변경하지 말 것.

목표: S3만 되는 구현이 아닌지 EC2·RDS·Lambda를 검증하고, 실제로 재현되는 문제만 공유 함수에서 최소 수정한다.
수정 소유권: src/core/diagram-controller.js, src/core/aws-service-catalog.js, tests/diagram-row-reflow.test.js, development/tools/verify-kb-row-reflow.mjs,
development/results/2026-10-08-multiservice/worker-report.md 및 이 폴더의 검증 결과. 다른 파일은 수정하지 않는다.
조율자가 AGENTS.md·개발 진입점·백로그·계획·결과 요약을 관리한다. 필요하면 제안만 전달한다.

먼저 AGENTS.md, development/README.md, backlog.md, plans/0006-row-reflow.md 및 실제 공유 호출 흐름을 읽는다.
graph MCP 도구를 먼저 사용하고 실패 또는 미포함 시 파일 조사로 보완한다.
현재 로직은 reflowPeerRow에서 같은 parent의 resIcon 기반 작은 가로 줄만 재배치한다. S3 전용이 아닌 일반 동작인지 확인한다.
KB에서는 서비스가 없거나 다른 표현(shape=..., alias)인 경우도 있으니 peer가 없는데 있다고 판정하지 않는다.

검증:
1. 기존 합성 fixture를 재사용해서 EC2·RDS·Lambda 각각 같은 서비스 peer가 있는 줄에서 새 아이콘의 스타일·크기·부모·같은 줄 위치를 확인한다.
   기존 ID·내용·wrapper·연결·다른 페이지 보존, 잠금·공간 부족 fallback·실패 롤백을 검사한다. 비슷한 테스트를 중복 복사하지 말 것.
2. 기존 verify-kb-row-reflow.mjs를 최소 변경해 S3 포함 EC2·RDS·Lambda를 동일한 실제 KB 7페이지에서 각각 독립 원본으로 실행할 수 있게 한다.
   peer가 있는 경우와 없는 경우를 구분하고 content/ID/edges/other pages 및 새 겹침을 검증한다. 테스트한 입력·코드 SHA와 서비스별 통과/실패를 안전한 JSON으로 남긴다.
   고객 XML/이미지/이름/계정/IP는 private.local 내부에만 저장하고 보고서에는 넣지 않는다. 기존 결과를 덮어쓰지 않는다.
3. 변경 전 실패가 있으면 먼저 재현하고 원인·최소 수정·변경 전후 결과를 기록한다. npm test와 npm run build를 실행해 정확한 결과를 보고한다.

금지: PLAN.md/고객 원본/과거 결과 수정, git commit/push/reset, Docker 재시작·AWS/Bedrock 호출·자격 증명 접근, 브라우저 자동화(앞선 브라우저 권한 거부를 다른 경로로 우회하지 않는다), 임의 새 추상화/전면 재작성.
새 기능(연결 생성/정렬/전체 페이지 레이아웃) 추가하지 않는다. 동일 서비스가 없는 경우 자연스러운 통합이 불가능하면 한계를 명시하고 제품 방향을 임의 결정하지 않는다.

완료 시 worker-report.md에 변경 파일, 실행 명령, 서비스별 확인 사실, 실패 및 한계, 모델/effort를 간단히 적고 작업을 멈춘다.
구조화 Dispatch가 제공되면 그 preamble에 따라 worker_done. agent_unconfigured로 직접 터미널 지시이면 직접 완료 응답으로 보고하며 lifecycle 명령은 쓰지 않는다.
