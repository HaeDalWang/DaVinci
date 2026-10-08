# 기존 서비스 줄에 함께 추가 — B015

2026-10-08. 구현·로컬 검증 완료, Docker 갱신은 사용자 완료 보고, 실제 화면 검증 대기.

사용자는 기존 템플릿의 좌표도 자연스러운 통합을 위해 바꿀 수 있다고 명시했다.
기존 아이콘 사이에 새 서비스를 끼우고, 같은 줄의 주변 아이콘을 기존 간격에 맞춰 옮긴다.
스타일·크기·내용·ID·부모·연결과 다른 페이지는 유지한다. 잠금·공간 부족·충돌이 있으면 기존 가까운 빈자리 방식을 사용한다.
현재 범위는 같은 서비스가 있는 짧은 가로 줄이다. 전체 페이지 재배치와 연결선 경유점 최적화는 포함하지 않는다.

## 확인한 결과

- 회귀 테스트는 기존 방식에서 새 아이콘 x=0으로 실패했다. 수정 후 x=150에 추가되고, 기존 두 이웃은 x=240·330으로 이동한다. 잠금·공간 부족 시 보존과 실패 시 원상 복구도 통과했다.
- B014에서 저장한 동일한 native-normalized 전체 KB 입력으로 실제 controller를 실행했다. bridge는 mock이며 브라우저 검사와 구분한다.
- KB 7페이지 모두 서비스 1개 추가, 내용·연결·다른 페이지 보존, 추가·이동 아이콘의 새로운 겹침 0건을 확인했다.
  이동한 기존 아이콘은 RA 1~4페이지에서 각각 2·2·0·0개, 홈페이지 1~3페이지에서 3·2·0개다.
  홈페이지 개발 페이지는 기존 S3 바로 다음에 새 S3를 넣고 이웃 3개를 같은 줄로 옮긴다.
- 16파일 196개 테스트와 빌드 통과. 전체 `npm test`의 서버 테스트 10개는 포트 실행 권한 때문에 타임아웃했다.
  독립적인 `http.createServer().listen(0, '127.0.0.1')`도 `EPERM`으로 실패했다. 전체 테스트 통과로 기록하지 않는다.
- 고객 원본의 SHA를 확인했고 원본·과거 결과·루트 PLAN.md는 수정하지 않았다. 모델 호출·커밋·푸시는 하지 않았다.

검증 자료: [KB 로컬 결과](local-kb-proof.json), [통과 테스트](local-test-output.txt), [전체 테스트 실패 기록](test-output.txt), [빌드](build-output.txt).
고객 XML 출력은 gitignore 대상인 `private.local/`에 둔다.

## 재현과 남은 작업

```sh
node development/tools/verify-kb-row-reflow.mjs /tmp/davinci-row-reflow-new-result
npx vitest run --exclude tests/server-sonnet.test.js
npm run build
```

Orca는 `runtime_access_denied`/EPERM, graph 도구는 승인 불가, Docker는 socket 접근 권한 오류로 차단됐다.
Kiro 위임·실제 iframe 검증·Docker 갱신은 수행하지 못했다. 현재 웹사이트에 이번 수정이 반영됐다고 볼 수 없다.
권한이 있는 환경에서 `python3 development/tools/start-docker-with-default-aws.py`로 다시 빌드한 뒤,
실제 KB 홈페이지 개발 페이지에서 서비스 추가·다운로드·이동 후 연결선·눈 판정을 확인해야 B015를 완료할 수 있다.

연결: [계획 0006](../../plans/0006-row-reflow.md), [백로그](../../backlog.md).

후속 확인: 사용자가 Docker를 갱신했다고 알려줬다. 에이전트가 새 검증 탭에서 localhost:8080을 열려 했으나
브라우저 도구가 사용자 권한 거부로 접근을 차단했다. 다른 경로로 우회하지 않았다.
갱신은 사용자 보고이며 실행 버전·실제 S3 배치·연결선·다운로드는 에이전트가 확인하지 못했다.
