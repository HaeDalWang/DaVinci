# Docker 웹과 레퍼런스 사용 확인

2026-10-07, B010 완료. AI 모델 연결·실제 생성 품질은 B011의 다음 작업이다.

## 실행과 사용

```sh
docker compose up -d --build
```

<http://localhost:8080> → **그림 열기**에서 `.drawio` 선택 → 대상 페이지 선택 → 자연어 요청 → **다운로드**.
내려받는 이름은 `architecture.drawio`이며 원본 파일을 덮어쓰지 않는다. 열기 직전 그림은 되돌리기 스냅샷으로 남긴다.
브라우저 저장은 같은 브라우저·주소에 한정된다. 결과 보관에는 다운로드를 사용한다.

현재 웹·API는 실행 중이고 `modelConfigured=false`다. AI 요청은 한국어 설정 안내와 503을 반환한다.
Bedrock의 사용 가능한 **리전·정확한 모델 ID·인증 방식**을 확인한 뒤 연결한다. 키나 토큰 값을 대화에 보내지 않는다.
Compose는 호스트 환경에 있는 `AWS_REGION`, `BEDROCK_MODEL_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`만 전달하며 `~/.aws`를 자동 마운트하지 않는다. 로컬 프로필/SSO 인증은 별도 연결이 필요하다.
환경을 설정한 뒤 `docker compose up -d`로 컨테이너를 갱신한다. 모델 ID 설정만으로 인증·추론 성공이 확인되지는 않는다.

첫 추천 요청은 “기존 구성을 유지하고 현재 페이지에 로그 보관용 S3 하나 추가해줘”다.
현재 여러 페이지 파일의 자동 편집은 **서비스 추가만** 지원한다. 삭제·연결 변경·전체 교체가 섞이면 배치 전체를 취소한다.
원본 손실이 측정된 기존 정렬 버튼도 B009 완료 전까지 비활성화했다. 수동 draw.io 편집은 가능하다.
빈 그림의 생성은 레거시 생성 경로이며 KB 수준의 배치 품질은 검증되지 않았다.

## 직접 확인한 결과

- 전체 테스트 **14개 파일·177개 통과**, Vite 빌드·Docker 이미지 빌드 성공.
- `davinci-web-1` 정상 실행, 호스트 `127.0.0.1:8080` 게시, 런타임 사용자 `node`.
  기존 3000 포트의 다른 Compose 앱은 유지했다. 개발 API 기본 포트는 3001이고 Vite는 `/api`를 프록시한다.
- 웹·health HTTP 200, 모델 없는 chat/Well-Architected 503. 저장소·환경 파일·회사 샘플 경로는 HTTP 404.
- 실제 파일 선택으로 KB 2파일을 열었다. 내려받기 버튼이 만든 XML에서 총 **7페이지·797 vertex·281 edge**와 셀 ID·페이지 ID가 유지됐다.
  브라우저 다운로드 Blob을 `private.local/`에 포착했다. 운영체제의 다운로드 저장 창은 검증하지 않았다.
- 실제 자연어 입력 UI가 `/api/chat`으로 요청했고 선택한 두 번째 페이지의 ID만 전달했다.
  503 안내가 화면에 표시됐고 실패한 요청은 다음 대화 히스토리에 남지 않았다.
- AI 응답을 **합성 JSON으로 대체**한 UI 검사: 잘못된 응답 pageId를 요청 페이지로 고정하고 S3 1개만 추가했다.
  기존 셀 하위 XML과 다른 페이지는 불변, 기존 edge 개수 유지. 전체 교체 거부·되돌리기·잘못된 파일 거부도 통과했다.
  이것은 모델 추론 또는 자연어 이해 품질의 검증이 아니다. **실제 Bedrock 호출 0회**.

## 근거와 재현

- [화면·파일·합성 응답 확인](browser-use-proof.json), [실제 API 오류 전달](chat-api-proof.json), [HTTP 확인](http-check.json)
- [테스트](test-output.txt), [빌드](build-output.txt), [Docker 빌드](docker-build-output.txt), [컨테이너](container-state.json)
- [최종 소스 해시·실제 제공되는 빌드·healthy 확인](runtime-proof.json)
- Kiro `claude-sonnet-5.5`·`medium`이 Docker 구성을 구현하고 읽기 전용 리뷰와 다중 페이지 가드를 수행했다.
  [구현 보고](kiro-worker.md), [리뷰 당시 판단](kiro-review.md), [가드 보고](kiro-guard.md).
  리뷰의 graph 테스트 공백은 실제 테스트 부재를 뜻하지 않는다. 조율자는 177개 테스트와 실제 화면으로 확인했다.
  load 응답의 requestId 가정도 실제 응답에서 폐기했다. XML load 성공 응답은 원래 입력 XML로 상관시킨다.
- 원본 XML·다운로드·snapshot은 `private.local/`에만 둔다. 공개 근거에는 개수·해시·불투명 ID만 남긴다.

새 결과 폴더를 지정해 Docker UI를 재현한다. Docker는 먼저 실행하고 Orca에서 8080 탭을 열어 page ID를 확인한다.

```sh
python3 development/tools/verify-docker-use.py <새-결과-디렉토리> <orca-page-id>
```

## 다음 단계와 실제 제한

원본 복사 후 자연어로 변경하는 방식을 우선 제안했다. 새 그림에 배치·스타일만 참고하는 방식의 사용자 선택은 미결이다.
이를 위해 처음부터 RAG나 학습을 넣지 않고, 우선 기존 파일을 템플릿으로 사용할 수 있게 했다.
AI 연결 후 실제 요청과 보존 결과를 같은 기준으로 측정한다. 다음 구현은 선택 페이지 내 이름·개수·연결의 보존 편집이다.

이번 실행은 로컬이다. API에 사내 인증은 아직 없고 draw.io 편집기는 기존 `https://embed.diagrams.net` iframe을 사용한다.
완전한 내부 호스팅은 draw.io 자체 호스팅·사내 인증을 포함해 따로 검증해야 한다.
이미지 설치에서 실제 발견한 운영 의존성 취약점은 [audit 결과](production-dependency-audit.json)의 8건이다.
이번에는 잠금 파일을 바꾸지 않았으며 사내 배포 전 업데이트·회귀 검사를 B012로 기록했다.
커밋·푸시·회사 서버 배포는 하지 않았다.
