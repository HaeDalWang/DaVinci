# 생성 아이콘 회귀 수정 보고

모델/effort: claude-sonnet-5.5 / medium. 구조화 Dispatch 없음(agent_unconfigured), 직접 실행. 커밋·푸시·배포·AWS·브라우저 동작은 하지 않았다.

## 정확한 원인 (확인됨)
`src/core/architecture-template.js`의 `AWS_SHAPE = /^mxgraph\.aws4\.[a-z0-9_]+$/`가 소문자만 허용했다.
AWS 아이콘 스타일의 `shape=mxgraph.aws4.resourceIcon`(서비스)과 `shape=mxgraph.aws4.groupCenter`(ASG 그룹)는 camelCase라서 `sanitizeStyle`이 `shape` 키를 조용히 버렸다.
`resIcon=mxgraph.aws4.ec2` 등은 소문자라 살아남았지만 `shape=resourceIcon`이 없으면 draw.io는 resIcon 글리프를 그리지 않고 색 사각형만 보여준다.
템플릿 경로와 템플릿 없는 경로(카탈로그 기본 스타일도 `sanitizeStyle`을 거침) 모두 같은 함수를 통과하므로 EC2/RDS/S3만이 아니라 카탈로그의 모든 `resourceIcon` 서비스가 영향을 받았다.
기존 생성 테스트가 이를 놓친 이유: 구조·색·크기만 검사하고 `shape` 값이 유지되는지는 검사하지 않았다.

## 수정 전 재현 증거
새 `tests/architecture-template.test.js`를 수정 전에 실행: 7개 중 5개 실패.
- `route_53.shape: expected undefined to be 'mxgraph.aws4.resourceIcon'` (카탈로그 전 서비스 정제 후 shape 소실)
- `expected 'resIcon=mxgraph.aws4.ec2;html=0;' to contain 'shape=mxgraph.aws4.resourceIcon'`
- 템플릿 추출 서비스/그룹(`asg: expected undefined to be 'mxgraph.aws4.groupCenter'`)과 생성 XML 셀 검사도 실패.

## 변경
- `src/core/architecture-template.js`: 정규식을 `/^mxgraph\.aws4\.[A-Za-z0-9_]+$/`로 한 줄 수정(영문 대소문자·숫자·밑줄). `aws4.` 접두사, 공백·`<`·`/`·`:`·`..` 거부는 그대로다. 카탈로그(`aws-service-catalog.js`)와 레이아웃은 바꾸지 않았다.
- `tests/architecture-template.test.js`(신규 7개): (1) 카탈로그 모든 서비스·그룹 스타일에서 shape/resIcon/grIcon이 정제 후에도 같은 값으로 남음, (2) 정제 후에도 서비스 타입 인식 동일, (3) resourceIcon/groupCenter 허용, (4) `shape=image`, `image=`, `url=`, `javascript:`, `<script>`, 다른 네임스페이스(azure), stencil, `..`, `data:` 주입은 계속 제거, (5) 템플릿에 카탈로그 스타일이 있을 때 모든 서비스·그룹의 shape 유지(container=0 그룹도 container=1로), (6) 템플릿 없음/있음 두 경로에서 생성한 XML의 모든 셀이 원본이 가진 도형 키를 유지.
- 공유 호출부 확인: `sanitizeStyle`/`AWS_SHAPE`는 `architecture-template.js`(`ALLOWED`의 shape/resIcon/grIcon, `extractTemplate`)와 `architecture-generator.js`(카탈로그 폴백 두 곳)에서만 쓰인다. 다른 파일 사용 없음.

## 검증
- `npx vitest --run tests/architecture-template.test.js`: 수정 전 5 실패 → 수정 후 7 통과.
- `npm test`: 21 파일 308개 통과. `npm run build`: 성공.

## 한계
- 글리프가 실제로 그려지는지는 draw.io 화면으로 확인하지 못했다(브라우저 사용 금지). 근거는 스타일 문자열에 `shape=…resourceIcon;resIcon=…`가 보존된다는 것까지다.
- Docker에는 아직 반영되지 않았다(루트가 담당). 이미 생성된 그림은 다시 생성해야 한다.
- 이번은 아이콘만 수정했다. 배치(레이아웃)는 변경하지 않았다.
