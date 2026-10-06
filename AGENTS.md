# DaVinci 작업 규칙

이 문서는 이 저장소에서 일하는 모든 에이전트의 공통 작업 기준이다.
사용자의 현재 지시가 우선하며, 다른 에이전트에게 맡긴 작업에도 같은 기준을 적용한다.

## 1. 자율 개발의 범위

- 사용자가 정한 목표 안에서 필요한 작업을 찾아 구현·검증까지 진행한다. 이미 허용된 작업의
  조사, 수정, 테스트, Orca 작업 분배에는 반복해서 승인을 묻지 않는다.
- 착수 전에 목표, 가정, 완료 기준과 짧은 작업 순서를 알린다. 기존 코드와 실제 호출 흐름부터 읽는다.
- 목표를 달성하는 데 필요한 후속 작업은 스스로 처리한다. 제품 방향, 범위 확대, 데이터 삭제처럼
  사용자 결정이 필요한 문제는 근거와 선택지를 제시하고 해당 작업만 답변을 기다린다.
- “새로 시작”만으로 기존 코드 전체 삭제나 전면 재작성을 결정하지 않는다.
- 개발 착수와 세션 복구 시 `development/README.md`와 `development/backlog.md`부터 읽고,
  해당 작업에 연결된 논의·결정·계획·결과를 따라간다. 현재 요청과 합의된 범위 안에서 진행한다.
- 기존 코드, `README.md`, `DESIGN.md`, `.kiro/specs/`는 레거시 참고다. 유지해야 할 설계 제약으로 보지 않는다.
  루트 `PLAN.md`는 사용자의 개선 원안으로 보존하고 현재 실행 계획은 `development/plans/`에 둔다.
- 필요한 개발 항목은 먼저 백로그에 기록한다. 큰 작업은 연결된 계획에 범위·검증·완료/중단 기준을 적은 뒤 구현한다.
  작은 수정은 백로그와 결과만 갱신한다. 완료 항목도 상태와 결과 링크를 남기며 삭제하지 않는다.
- 제품 방향·기술 선택·범위 변경의 결정은 대안, 근거, 상태와 관련 논의·계획 링크를 남긴다.
  방향이 바뀌면 이전 결정에 후속 결정 링크를 붙여 이력을 보존한다. 미결 사항은 논의에 기록한다.
- 개선 전에 같은 입력·측정 방법의 기준선을 남긴다. 미측정은 0으로 적지 않고,
  데이터 손실로 배치 지표가 좋아진 결과는 개선으로 인정하지 않는다.
- 작업 종료 시 계획·백로그·결과에 확인한 사실, 남은 문제와 다음 작업을 적는다.
  대화 기록이나 임시 파일에만 판단 근거를 남기지 않는다.

## 2. 최소한의 정확한 변경

- 기존 함수·패턴, 표준 기능, 설치된 의존성을 먼저 사용한다. 요청하지 않은 기능이나 미래용 추상화는 넣지 않는다.
- 변경은 목표에 필요한 파일과 줄로 제한한다. 주변 코드의 정리·포맷 변경을 섞지 않는다.
- 버그는 공유 함수와 모든 호출부를 확인해 원인에서 고친다. 자신의 변경으로 불필요해진 코드만 제거한다.
- 사용자와 다른 에이전트의 변경은 덮거나 되돌리지 않는다. 충돌하면 소유자에게 알리고 조율한다.
- 입력 검증, 데이터 보존, 보안, 접근성을 단순화 명목으로 생략하지 않는다.
- 자격 증명과 고객 정보를 코드·문서·로그·작업 지시에 넣지 않는다.

## 3. Orca로 작업 분배와 감독

주 에이전트는 조율자다. 독립적으로 나눌 수 있는 구현, 별도 리뷰, 다른 에이전트의 실제 사용 확인에는
Orca를 적극 활용한다. 작은 단일 수정은 직접 끝낸다. Orca 작업을 내장 서브에이전트로 대체하지 않는다.

### 시작과 작업 지시

- 설치된 `orca-cli` 스킬의 실행 파일 선택 규칙을 따른다. 선택한 CLI로
  `skills get orca-cli --json`을 읽고, 감독할 때는 `skills get orchestration --json`도 읽는다.
  실행 파일은 작업 중 바꾸지 않으며, 명령·옵션은 현재 가이드와 `--help`로 확인한다.
- Orca 런타임과 현재 저장소·워크트리를 확인한다. 연결할 수 없으면 그 사실을 알리고,
  로컬에서 가능한 일을 진행한다. 위임이나 실행이 된 것처럼 보고하지 않는다.
- 각 작업 지시에는 목표, 수정 가능한 파일, 금지 범위, 다른 작업과의 경계, 검증 방법을 명시한다.
  같은 파일을 여러 에이전트가 동시에 수정하도록 맡기지 않는다.
- 에이전트에게 다른 작업자가 함께 있음을 알리고, 다른 사람의 변경을 되돌리지 말도록 지시한다.
- 개발 목표 안에서 Orca 워크트리와 에이전트 세션을 직접 만들 수 있다.
  생성할 때 담당 에이전트와 맡긴 일을 사용자에게 알린다. Git 기준 브랜치도 확인한다.
- **Orca 작업자의 기본 에이전트는 Kiro, 모델은 `claude-sonnet-5.5`, effort는 `medium`이다.**
  사용자가 다른 조합을 지정하면 그 지시를 따른다. 다른 모델로 조용히 대체하지 않는다.
- 실행 전에 `kiro-cli chat --list-models --format json`과 `kiro-cli chat --help`로 지원을 확인한다.
  현재 Orca의 `worker-start --agent kiro`에는 `--model`·`--effort`를 직접 붙이지 않는다.
  대신 해당 워크트리에서 다음 명령으로 Kiro 터미널을 만든다:
  `kiro-cli chat --tui --model claude-sonnet-5.5 --effort medium`.
  실행 화면이나 세션 정보에서 실제 모델·effort를 확인한다. 지원 또는 적용을 확인할 수 없으면 알린다.
  Kiro V3에서 시작 옵션을 줘도 `high`로 뜨면 준비된 세션에 `/effort medium`을 보내고
  `terminal read --screen`으로 `medium` 적용을 확인한다. 이 명령은 폐기 예정이므로
  제거된 버전에서는 `/model` 설정 패널의 현재 절차를 확인한다.
  준비된 터미널은 `worker-start --terminal <handle> --worktree <selector>`로 연결을 시도한다.
  `agent_unconfigured`이면 실제 Kiro 실행 여부를 화면으로 확인한 뒤 terminal 명령으로
  지시·감독한다. 이 경우 Orca Task·Dispatch 기반 감독이 성립했다고 보고하지 않는다.
- Kiro는 에이전트 선택이나 셸 생성만으로 시작됐다고 가정하지 않는다.
  실제 실행 화면을 확인하고, 기본 실행기가 동작하지 않을 때만 현재 가이드에 따라 별도로 띄운다.
  긴 지시는 작업 파일로 전달하되 워크트리에서 읽을 수 있는지 확인한다.

### 전달과 실행 확인

- 기존 터미널에 보내기 직전 `terminal list`로 최신 핸들을 받고 `terminal read`로 현재 작업을 확인한다.
  진행 중인 세션에는 새 일을 끼워 넣지 않는다.
- `accepted: true`는 입력 접수다. 실행 시작은 `turn_started` 또는 실제 화면 변화로 확인한다.
  조용하다는 이유로 같은 지시를 다시 보내지 않는다.
- `terminal create --command`의 시작은 지연될 수 있다. 셸 화면만 보인다고 실행 명령을 다시 보내지 않는다.
  `terminal read --screen`으로 에이전트 입력창이 준비됐는지 확인한 뒤 작업을 보낸다.
- 현재 세션 밖의 셸에서 orchestration 명령이 `no_active_sender_terminal`로 실패하면
  `terminal list`에서 확인한 조율자 자신의 핸들을 `--from`으로 지정한다. 다른 세션 핸들을 쓰지 않는다.
- Kiro에서 `tui-idle`을 신뢰할 수 없으면 화면을 주기적으로 읽어 응답과 프롬프트 복귀를 확인한다.
  커서 증가는 활동 증거이며 작업 완료 증거로 쓰지 않는다.
- 가벼운 전달은 terminal 명령을 쓴다. 결과를 기다리고 감독하는 작업은
  `run-create` → `worker-start` → `check` 흐름과 현재 스킬의 Task·Dispatch 계약을 따른다.
- 입력 접수, 실행 중, 작업자 완료 보고, 조율자 검증 완료를 구분한다.
  타임아웃이나 연결 끊김만으로 실패·종료를 단정하거나 중복 작업자를 띄우지 않는다.

### 검증과 정리

- 작업자 결과의 diff와 완료 기준을 조율자가 확인하고 필요한 검증을 직접 실행한 뒤 현재 브랜치에 반영한다.
  작업자의 숫자와 주장만으로 확인 완료를 선언하지 않는다.
- 새 워크트리에는 미추적·gitignore 파일이 없을 수 있다. 필요한 입력과 의존성을 확인하고,
  비밀 파일을 무작정 복사하지 않는다.
- 작업자의 수정은 해당 작업자에게 요청한다. 사용자 지시 없이 다른 세션의 작업물을 직접 고치지 않는다.
- 감독 작업이 끝나면 현재 스킬에 따라 작업자 재사용·유지·해제를 처리한다.
  **만든 워크트리는 사용자에게 알리고 삭제 허락을 받은 뒤 지운다.** 터미널 해제와 워크트리 삭제를 구분한다.
- 보고에는 맡긴 일, 돌아온 결과, 조율자가 확인한 근거, 남은 문제를 짧게 적는다.
  위임해도 커밋·푸시·배포 권한은 넓어지지 않는다.

## 4. 검증과 완료

- 버그 수정은 가능한 한 먼저 재현하는 작은 회귀 테스트를 만든다. 기존 Vitest를 사용한다.
- 로직 변경은 관련 테스트를 실행한다. 공통 흐름이나 빌드에 영향을 주면 `npm test`와
  `npm run build`도 실행한다. UI 동작은 실제 화면으로 확인한다.
- 문서만 바꾸면 코드 테스트는 생략하고 내용과 `git diff --check`를 확인한다.
  새 파일은 `git check-ignore -v <파일>`로 제외 여부도 확인한다.
- 테스트는 가능한 한 로컬에서 검증한다. AWS·Bedrock 실제 호출이 필요하면 비용과 접근 범위를
  확인하고, 해당 호출이 사용자에게 허용된 범위인지 확인한다.
- 실행하지 못한 검증과 이유를 명시한다. 문서상 계획이나 설정을 실제 동작 확인으로 보고하지 않는다.
- 완료 보고는 변경 내용, 검증 결과, 남은 제한만 간결하게 적는다.

## 5. Git 커밋·푸시

- **사용자가 요청할 때만 커밋·푸시한다.** 요청에 포함된 범위는 추가 승인 없이 진행한다.
  배포·릴리스도 해당 작업에 대한 사용자 지시가 있어야 한다.
- 기본은 자신의 변경만 파일이나 hunk 단위로 선택한다. 사용자가 전체 변경 커밋을 요청하면
  숨김 파일과 도구 설정도 포함하되 비밀 정보와 staged diff를 먼저 확인한다.
- 커밋 전 `git diff --cached`와 `git diff --cached --check`로 범위와 오류를 확인한다.
  요청하지 않은 `reset --hard`, 강제 푸시, 기존 커밋 덮어쓰기를 하지 않는다.
- 커밋 제목과 본문은 한국어로 쓴다. `feat:`, `fix:`, `docs:`, `chore:` 등의 타입 접두사와
  파일 경로·식별자·명령어·설정 키·에러 문자열은 원문을 유지한다.
- `Co-Authored-By`, `Generated with` 같은 첨부는 붙이지 않는다.

예: `docs: 자율 개발과 Orca 조율 규칙 추가`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
