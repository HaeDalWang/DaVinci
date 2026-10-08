# Bridge/verifier read-only review

detect_changes(3 files): risk 0.60, 테스트 공백 목록은 대부분 diagram-controller 함수(이 리뷰 범위 밖). 파일 수정 없음, 브라우저 미제어, export 내용 미열람.

확인됨(코드 읽기):
- origin+source 가드가 모든 이벤트(export/autosave 포함) 앞에 있음. 테스트가 foreign origin/source 모두 검증.
- export는 requestId+format으로 상관, 동시 요청은 즉시 reject, 타임아웃 시 콜백 해제. 늦은 응답은 새 요청에 의해 무시됨(테스트 3개가 커버).
- getEditingState는 캐시를 쓰지 않고 export 응답의 xml/currentPage를 한 응답에서 읽음. 비정상 currentPage는 null → 다중 페이지는 컨트롤러가 모호로 실패(안전).
- 증거 아티팩트는 `*.local`(gitignore 확인)에만 저장, proof json에는 원문 XML/SVG 없음.

## Findings

1. MEDIUM — `merge()`에 상관관계가 없다. (drawio-bridge.js merge)
   - 단일 키 `'merge'` 슬롯. (a) 10초 타임아웃 타이머가 `_pendingCallbacks.delete('merge')`를 키로 지워서, 이미 교체된 다음 merge의 콜백을 삭제할 수 있다. (b) 타임아웃된 merge의 늦은 `merge` 응답이 이후(예: 롤백) merge를 조기에 성공으로 해소한다. export에서 고친 문제가 merge에는 남아 있고, add_service 실패 시 rollback이 바로 merge라서 영향이 있다.
   - 제안: 콜백을 보관할 때 자신의 함수 참조를 확인하고(`if (map.get('merge') === cb) delete`), 동시 merge는 export처럼 거부. draw.io merge 응답이 요청 ID를 돌려주는지는 unknown(해결: 프로토콜 문서/실측). 테스트도 없음.

2. LOW — `_postMessage`가 iframe이 없거나 contentWindow가 없으면 조용히 무시한다. export/merge는 15s/10s 타임아웃까지 대기 후 일반 타임아웃으로 실패. 즉시 reject하면 진단이 쉬움.

3. LOW — 테스트 공백: (a) 같은 requestId지만 format이 다른 응답 무시, (b) `currentPage` 누락/비정수 → null, (c) 빈 xml 응답 reject, (d) 타임아웃된 export의 늦은 응답이 `_currentXml`을 바꾸지 않음, (e) merge 전부. 현재 테스트 3개는 핵심 경로를 커버하지만 (a)~(e)는 코드로만 확인.

4. LOW — verifier 증거 교차검증 누락 (verify-kb-addition.py):
   - 브라우저가 계산한 `beforeSha256/afterSha256/sourceSha256`를 Python이 쓴 파일 바이트의 sha256(`artifacts`)과 비교하지 않는다. XML 아티팩트는 `value.encode()` = TextEncoder 바이트와 같으므로 단순 assert로 가능. 또 record의 sourceSha256이 매니페스트 해시와 같은지도 재검증 없음(브라우저에서는 검사함).
   - `code_paths`에 `aws-service-catalog.js`, `snapshot-manager.js`가 없다(컨트롤러가 import). 실행 중 변경 감지에서 빠짐. proof의 최상위 `sourceSha256` 키는 코드 해시인데 레코드의 동명 필드는 입력 해시라 혼동 여지 → 이름 구분 권장.
   - `subprocess.run` returncode 미확인, stdout이 JSON이 아니면 JSONDecodeError로 원인 불명. 실패 메시지에 고객 데이터가 섞일 가능성은 낮으나 stderr를 그대로 출력하지 않는 현재 방식은 적절.
   - 매니페스트 페이지 수와 실제 export 페이지 수(`beforePages.length`)를 비교하지 않음(records==7 assert만 있음).

5. LOW/unknown — 추가 셀 검증은 `value` 라벨로 셀을 찾고 overlapPairs(`measureXml`)에 의존. 다중 레이어/그룹 상대좌표에서 measureXml의 절대좌표 해석이 올바른지는 이번에 읽지 않았음(unknown; scripts/layout-metrics.js 리뷰 필요). 추가 셀의 parent가 보이고 잠기지 않은 레이어인지는 verifier가 확인하지 않는다.

6. INFO — getEditingState와 이후 merge 사이의 사용자 편집은 전체 XML merge로 덮일 수 있음(TOCTOU). 계획 범위에서는 수용 가능하나 문서화 권장.

BRIDGE_REVIEW_DONE

---

# Recheck (read-only, 코드 읽기 + bridge 테스트 4개 재실행 통과; 브라우저 미사용)

## Resolution status
1. merge 상관관계 — RESOLVED(코드/단위). requestId를 전송하고 응답의 `message.requestId`가 다를 때 무시, 콜백은 일치할 때만 해제, 동시 merge는 reject라서 타이머의 무조건 delete가 더는 다른 요청을 지울 수 없음. 타임아웃된 merge의 늦은 응답이 롤백 merge를 해소하지 않는 회귀 테스트가 있고 통과. 단 draw.io가 merge 응답에 `message`를 실제로 돌려주는지는 이 리뷰에서 직접 확인 못함(unknown) — root의 live 재실행(컨트롤러의 merge 경로)이 그 증거이며, 응답이 오지 않으면 10s 타임아웃으로 드러남.
2. 부재 iframe 타임아웃(LOW) — 문서화된 제한으로 수용.
3. 테스트 공백(format 불일치, currentPage 누락, 빈 XML, 타임아웃 후 늦은 export) — 여전히 미커버(LOW, 수용 가능). merge는 이제 커버.
4. verifier 교차검증 — 대부분 RESOLVED:
   - catalog/snapshot-manager 해시 추가됨.
   - 매니페스트 페이지 수/ID를 브라우저에서 검증, Python이 입력 해시와 before/after XML 해시(브라우저 계산값 vs 기록 바이트)를 assert.
   - 새 셀을 라벨이 아닌 before/after ID 차집합으로 식별, 부모가 visible/unlocked 레이어인지 검사(`measureXml` 셀에 `parent` 필드 있음 확인; 없거나 새 셀이 없으면 fail-closed).
   - 남음(LOW): `subprocess` returncode 미확인 / 최상위 `sourceSha256`(코드 해시) 키가 레코드의 동명 필드(입력 해시)와 이름 충돌 / SVG는 브라우저 측 해시와 교차검증 없음. 플레이스홀더 치환은 `PAGE_IDS`가 `PAGE_ID`보다 먼저 와야 하는 순서 의존(현재 올바름) — 순서를 바꾸면 깨지므로 주석 권장.
5. 겹침/상대좌표 해석(unknown이던 항목) — PARTIAL: `layout-metrics.js`에 부모 체인 해석(parent-cycle/unresolved-parent 처리)이 있음을 확인. 다중 레이어/그룹 정밀 정확성은 미검증이나 이번 verifier는 그룹을 쓰지 않음.
6. getEditingState→merge 사이 동시 사용자 편집(INFO) — 문서화된 제한으로 수용.

새 발견 없음. 남은 항목은 모두 LOW/INFO.

BRIDGE_REVIEW_DONE
