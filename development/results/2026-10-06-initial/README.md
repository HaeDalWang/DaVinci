# 2026-10-06 초기 실행·관찰

상태: 초기 관찰 보존. **배치 품질의 전체 기준선은 미완료**다.
근거 계획: [0001 — 기준선](../../plans/0001-baseline.md).

이전 전반 검토는 [종합 리뷰](project-review.md)에 보존했다. 읽기 전용 작업자의 [핵심 로직](core-review.md)·[UI/서버](ui-review.md) 보고서도 함께 남긴다. 작업자 보고의 추정은 실제 확인과 구분한다.

## 조건

- 제품 코드 기준: `cd673209d3335a3db54c5963cdc5266aeaade706` (`main`).
- 작업 트리에는 AGENTS.md/PLAN.md, 개발 기록, MCP 설정과 .gitignore 변경이 있으며 제품 코드 수정은 없다.
- 환경: macOS, Node v25.8.1, npm 11.11.0, Vitest 4.1.2, Vite 6.4.1.
- 최초 설치: `npm ci --ignore-scripts --no-audit --no-fund`.
- AWS/Bedrock 실제 호출 없이 로컬 검사와 프론트엔드 브라우저 확인을 수행했다.
- 아래 초기 수치는 2026-10-06 조율자가 실제 실행한 결과다. 과거 설계 문서의 기대값을 옮긴 것이 아니다.

## 실행 상태

| 검사 | 결과 | 범위 |
|---|---|---|
| `npm test` | 7개 파일 / 84개 테스트 통과 | 기존 테스트 범위이며 그림 보존을 보장하지 않는다. |
| `npm run build` | 통과; JS 78.50 kB / gzip 19.00 kB | toast 정적·동적 import 중복 경고 1건. |
| 실제 브라우저 | [기본 화면](browser-home.png), [정렬 모달](browser-align-modal.png). draw.io 초기화, AWS 도형 패널, 정렬 모달 열기/Escape 닫기 확인 | AI 생성, 서버 런타임, 모바일은 미검증. |

원시 출력은 [테스트](test-output.txt), [빌드](build-output.txt), [결함 재현](reproduce-output.txt)에 보존했다. 실행마다 시간 값은 달라질 수 있다.

## 재현한 결함

명령: `node development/results/2026-10-06-initial/reproduce.mjs`.
실행 전 저장소 루트에서 `npm ci --ignore-scripts --no-audit --no-fund`로 의존성을 설치한다.
이 파일은 레거시 결함을 재현하는 역사적 관찰 검사다. 개선 후 정상 동작의 합격 테스트로 사용하지 않는다.

- 서비스 하나 추가 → 비AWS 메모 삭제, 기존 ID 변경, 수동 좌표 재계산.
- `[서비스 추가, 기존 ID로 서비스 삭제]` → 다음 명령 실패, 원본 XML 롤백.
- 다른 origin/source의 autosave → 브릿지 캐시 변경.
- merge 성공 → 다음 읽기에 이전 XML 캐시 반환(화면에서 실제 유실되는 타이밍은 미검증).
- 서비스 2개 합성 입력에서 연결 방향 반전 → 같은 배치 좌표. `reorganizeForAlignment`는 기존 그룹을 버리고 mode 인자를 무시. 실제 정렬의 direction 옵션은 별도다.
- summary 요청 → 서비스 type 누락.
- 따옴표가 있는 연결 라벨 → 유효하지 않은 XML 생성.

## 입력 관찰

| 입력 | vertex | edge | source/target 모두 있는 edge | 요약 서비스 | 요약 그룹 | 요약 연결 |
|---|---:|---:|---:|---:|---:|---:|
| `example-xml/example1.drawio` | 91 | 29 | 2 | 45 | 22 | 2 |
| `test-xml/test-2.drawio` | 18 | 0 | 0 | 11 | 7 | 0 |

첫 예제의 27개 선이 현재 요약에 들어가지 않는다. 이는 27개의 서비스 연결이 있다는 뜻이 아니다.
두 셀을 source/target으로 참조하지 않는 선도 원본 보존 검사에 포함해야 한다는 근거다.
교차·겹침·관통·AZ 대칭·주 흐름·실행 성능의 비교 기준선은 아직 미측정이다.

개발 기록의 [Kiro 독립 리뷰와 반영 상태](development-review.md)도 보존했다.

## 판정과 다음 작업

“기존 테스트 통과”와 “사용자가 손본 그림 보존”은 다른 검사다.
입력 내용이 삭제된 결과의 배치 점수를 개선으로 인정하지 않는다.
다음은 [B003/B004](../../backlog.md): 측정 정의·입력 고정 → 최소 측정기 → 전체 기준선.
