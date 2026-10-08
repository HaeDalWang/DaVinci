# B016 worker-report — EC2·RDS·Lambda 검증

2026-10-08. 모델/effort: claude-sonnet-5.5 / medium. 구조화 Dispatch 없음(agent_unconfigured), 직접 실행. lifecycle 명령·커밋·푸시·브라우저·Docker·AWS 호출은 하지 않았다.

## 결론 (최종)
- 최종 상태: 소스 변경은 `src/core/aws-service-catalog.js`(RDS shape 패턴)와 `src/core/diagram-controller.js`(`isServiceIconStyle`, `placeNearPeers` budget) 두 파일이다. `npm test` 17 파일 225개 통과, `npm run build` 성공. 실제 KB 7페이지 × s3·ec2·rds·lambda 28건 모두 통과(`final-checked/`).
- 처음 검증(EC2·RDS·Lambda의 resIcon 표기)에서는 재현되는 실패가 없어 소스를 수정하지 않았다(`local-kb-multiservice-proof.json`에 보존). 이후 추가 리뷰에서 KB의 RDS shape 표기(`rds_instance` 등) 미인식과 그로 인한 peer 탐색 예산 퇴행을 재현해 위 두 파일을 최소 수정했다. 상세는 아래 "추가 리뷰"·"예산 수정".
- EC2·Lambda는 KB에 해당 표기가 없어 peer 있는 실제 경로는 합성 테스트로만 확인했다.
- 검증기 보정: peer 크기 assert가 존재하지 않는 `rect.w/h`를 비교해 항상 통과하던 결함을 `width/height`로 고치고, peer 한 개가 스타일과 크기를 동시에 만족하도록 합쳤다. 보정판 28건 결과가 `final-checked/local-kb-multiservice-proof.json`(controller `01dca77a…2616`, catalog `c4e1f279…c2e9`)이며 서비스별 7/7, rds peer 통합 5/7이다. 이전 `after-alias-fix`·`after-budget-fix` 결과의 크기 검사는 이 결함 때문에 무효이므로 최종 근거는 `final-checked/`다(출력 해시는 무작위 ID 때문에 실행마다 다르다).
- `reflowPeerRow`·`findPeers`는 서비스 타입 일반 로직이며 S3 전용 코드는 없다(소스 확인).

## 변경 파일
- `tests/diagram-row-reflow.test.js`: 기존 3개 테스트를 s3·ec2·rds·lambda로 `test.each` 확장하고, peer 없음 fallback(ec2·rds·lambda)과 UserObject wrapper 보존 테스트 추가. fixture 복사 없이 기존 헬퍼 재사용.
- `development/tools/verify-kb-row-reflow.mjs`: 2번째 인자(`s3,ec2,rds,lambda`)로 서비스별 독립 실행. 인자가 없으면 기존 동작(s3, `local-kb-proof.json`)이며 있으면 `local-kb-multiservice-proof.json`에 기록한다. 케이스별 실패는 단계명·오류 이름만 기록한다. 코드·카탈로그·입력 SHA 포함.
- 이 폴더: `local-kb-multiservice-proof.json`, `private.local/*-after.drawio`(고객 XML, gitignore 대상 `*.local`).

## 실행 명령과 결과
- `npx vitest --run tests/diagram-row-reflow.test.js` → 16개 통과.
- `node development/tools/verify-kb-row-reflow.mjs development/results/2026-10-08-multiservice s3,ec2,rds,lambda` → 28/28 케이스 통과, 서비스별 7/7.
- `npm test` → 17 파일 219개 통과. `npm run build` → 성공.
- 코드 SHA256: diagram-controller `bb2e1ed4…8d24`, aws-service-catalog `fcfbff1d…d5`(전체 값은 JSON). 입력 SHA는 `kb-inputs.json`의 2개 파일(JSON 기록).

## 서비스별 확인 사실
합성: s3·ec2·rds·lambda 모두 같은 줄 삽입 시 새 아이콘 x=150·y=70, 이웃만 이동, 스타일은 peer 스타일에 html=0만 변경, 크기·부모 동일, 기존 ID·내용·연결·다른 페이지 동일. 공간 부족·잠금 이웃은 좌표 불변, merge 실패는 원본 복구(merge 2회 호출).

실제 KB 7페이지(각 서비스 독립 원본, 새 겹침 0, 내용·ID·edge·다른 페이지 보존):

| 서비스 | 통과 | peer 있음(같은 parent) | peer 없음 | 줄 재배치(이동 발생) |
|---|---|---|---|---|
| s3 | 7/7 | 4 | 3 | 4페이지(2,2,3,2개 이동) |
| rds | 7/7 | 4 | 3 | 1페이지(2개 이동), 나머지 peer 있는 페이지는 주변 빈자리 배치 |
| ec2 | 7/7 | 0 | 7 | 없음 |
| lambda | 7/7 | 0 | 7 | 없음 |

## 한계
- KB 7페이지에는 `resIcon=mxgraph.aws4.ec2`/`lambda` 스타일이 없다(스타일 문자열 검색 확인; 이미지 data URI 등 다른 표현은 검사하지 않음). 따라서 EC2·Lambda의 peer 있는 실제 KB 경로는 검증하지 못했고 합성 fixture로만 확인했다. peer 없음은 기존 fallback(외곽 빈자리) 동작이다.
- (해소됨, 아래 "추가 리뷰" 참조) 초기 보고 시점에는 KB의 `rds_instance`/`rds_postgresql_instance(_alt)`가 RDS로 인식되지 않았다.
- 모의 bridge 기반 로컬 검사다. 실제 draw.io 화면·SVG 겹침은 확인하지 않았다.

## 추가 리뷰: RDS shape 표기 수정 (2026-10-08)
모델/effort: claude-sonnet-5.5 / medium. 이전 증거(`local-kb-multiservice-proof.json`)는 덮어쓰지 않았다. 새 결과는 `after-alias-fix/`.

### 재현 (수정 전)
- 합성 테스트 `rds alias …`(4종 표기) 4건 실패: 카탈로그 패턴이 `rds_instance_alt`만 인식했고, 인식되는 `rds_instance_alt`도 `reflowPeerRow`가 `resIcon`만 허용해 줄에 끼지 못하고 외곽(x=0) fallback으로 갔다. 인식 경계 테스트 1건도 실패.
- 카탈로그만 고친 상태에서도 4건 실패, 컨트롤러까지 고쳐야 통과함을 각각 실행으로 확인했다. `pre-alias-fix-test-output.txt`는 첫 fixture(결함 있음: 이웃 높이 불일치·장애물 간섭)로 찍은 5건 실패 기록이므로 참고용이고, 근거는 위 컨트롤러 되돌림 재실행(4건 실패)이다.

### 수정 (최소)
1. `aws-service-catalog.js` RDS 패턴: `shape=mxgraph.aws4.rds(?:_postgresql)?_instance(?:_alt)?(?:;|$)` — 정확한 4개 토큰만 허용(`;`/끝 경계). `rds_instance_extra`, `rds_instance2`, `rdsx`, `dynamodb_table`, `aurora_instance`, `cache_node`는 RDS가 아님을 테스트로 확인.
2. `diagram-controller.js` `reflowPeerRow`: 줄 후보 조건을 `isServiceIconStyle`(resIcon 또는 `identifyServiceByStyle`이 인식한 `tier !== 'group'`)로 교체. group·text·image는 인식되지 않거나 group이라 이동 대상이 아님(테스트: text·image·frame·edge 불변).
3. (정정됨, 아래 "예산 수정" 참조) 처음에 `MAX_GRID_ATTEMPTS`를 70000으로 올렸으나 `findFreeSpotInGroup`과 공유하는 전역 상한이라 사용자 지시로 철회하고 20000을 유지한다.

### 호출부 영향
- `identifyServiceByStyle`/패턴 사용 호출부는 전체 테스트로 검증: `npm test` 17 파일 224개 통과, `npm run build` 성공(카탈로그 단독 호출부 개별 코드 추적은 하지 않았다).
- 검증기: 이동 셀 검사를 resIcon 또는 non-group 인식 서비스로 바꾸고, peer 있을 때 새 아이콘 크기가 peer 크기와 같은지 검사를 추가.

### 전후 차이 (실제 KB 7페이지 × 4서비스, 28건 모두 통과 유지)
코드 SHA256 이전 `bb2e1ed4…8d24` → 이후 `712a197d…caa7`(controller), 카탈로그 `fcfbff1d…d5` → `c4e1f279…c2e9`.

| 항목 | 전 | 후 |
|---|---|---|
| s3 | peer 4/무 3, 이동 2,2,0,0,3,2,0 | 동일 |
| ec2, lambda | peer 0/7 | 동일(KB에 해당 표기 없음) |
| rds peer 후보(페이지별) | 3,3,0,3,2,3,1 | 12,9,3,3,2,7,3 |
| rds peer와 같은 parent에 통합 | 4/7 | 5/7 (ra p3 신규 통합) |
| rds 줄 재배치 | ra p4 (2개 이동) | 동일 |
| rds fallback 남음 | ra p3, homepage p1·p3 | homepage p1·p3 |

homepage p1·p3의 RDS는 peer가 인식되지만 줄 후보가 없고 반경 400px 안에 빈 자리·충돌 없는 위치가 없어 기존 fallback으로 간다(homepage p2의 줄 재배치는 장애물 충돌로 null이 되는 것을 계측 확인; 원인 가설 "주변 밀집"은 셀 단위로 확인하지 않음). 이는 별칭 문제가 아닌 기존 밀집 페이지 동작이다.

### 남은 한계
- 별칭 줄(rds_instance 등으로만 이뤄진 줄)의 실제 KB 재배치는 재현되지 않았고 합성 테스트로만 확인했다.
- 다른 RDS 계열 표기(`rds_mysql_instance` 등)는 요청 범위 밖이라 추가하지 않았다. 실제 draw.io 화면 확인은 하지 않았다.

## 예산 수정 (중간 리뷰 반영)
- 원인(확인): `placeNearPeers`의 탐색 예산이 `MAX_GRID_ATTEMPTS`(20000, 그룹 탐색과 공유)라 peer당 6560칸이면 앞선 약 3개 peer가 소진해 뒤 peer를 시도하지 못한다. RDS 인식 확대로 후보가 늘며 homepage p2가 퇴행했다.
- 수정: `MAX_GRID_ATTEMPTS`는 20000으로 유지, `placeNearPeers`의 budget만 `SEARCH_OFFSETS.length * Math.min(peers.length, MAX_PEERS)`로 한정(1줄). 그룹 탐색 상한은 변경하지 않았다.
- 회귀 테스트 `a later peer is still tried when the first four peers have no free spot`: 작은 컨테이너 속 peer 4개(빈자리 없음)+레이어의 5번째 peer. 수정 전(20000) 실패(`expected 1090 <= 400`, 즉 외곽 fallback), 수정 후 통과.
- 새 측정: `after-budget-fix/local-kb-multiservice-proof.json`(28건 모두 통과; s3 7/7, ec2 7/7, rds 7/7(peer 통합 5), lambda 7/7). 페이지별 peer 통합·이동 수는 `after-alias-fix`(70000 시도본)와 동일. 이전 JSON·출력은 삭제·덮어쓰기하지 않았다.
- 코드 SHA256 controller `01dca77a…2616`, catalog `c4e1f279…c2e9`. `npm test` 17 파일 225개 통과, `npm run build` 성공.
- 참고: `after-alias-fix/`의 JSON은 70000 시도본 코드(`712a197d…`)로 만든 중간 결과이며 최종 코드의 증거는 `after-budget-fix/`다.
