# Default AWS 인증 기동 리뷰 (읽기 전용)

대상: development/tools/start-docker-with-default-aws.py, tests/start-docker-default.test.js, compose.yaml. graph detect_changes 실행(이 3개 파일은 함수 그래프 범위 밖, 테스트 공백 표시만). AWS CLI/Bedrock/STS 호출, credentials·config 파일 읽기, docker inspect/config/env 출력 없음. 설치된 SDK 소스(node_modules)만 읽음. 키·계정 값은 어디에도 적지 않음.

## 확인한 것 (코드 기준)
- 자격 증명 경로: `aws configure export-credentials --profile default --format process`의 stdout을 `capture_output`으로 메모리에서만 파싱. 실패 시 stderr/stdout을 출력하지 않고 고정 한국어 메시지로 종료. 파일 저장·로그 출력 없음. `check=True`의 CalledProcessError도 명령 인자만 보이고 env는 노출되지 않음.
- Compose에는 복사한 환경(`os.environ.copy()`)에 AccessKeyId/SecretAccessKey/SessionToken(없으면 '')/리전만 덮어써 subprocess `env=`로 전달. 명령줄 인자에 비밀 없음(ps 노출 없음). 선택되는 컨테이너 변수는 compose.yaml의 pass-through 목록으로 한정(AWS_PROFILE·~/.aws 등 미전달, ~/.aws 마운트 없음). compose.yaml·Dockerfile·.dockerignore에 리터럴 키 없음, 빌드 ARG/ENV로 비밀이 들어가는 경로 없음 → 이미지/소스에 키가 들어가지 않음.
- 다른 앱 영향 없음: `name: davinci` 프로젝트, 127.0.0.1:8080만 게시, `--profile default` 명시로 다른 프로필을 고르지 않음. cwd는 저장소 루트.
- 셸 환경이 `.env`보다 우선하므로 `.env`에 남은 값이 덮어쓰지 않음(현재 .env 없음).

## Findings

1. HIGH (SDK 동작 confirmed, Compose 동작 hypothesis) — 빈 문자열 `AWS_BEARER_TOKEN_BEDROCK`이 인증을 깨뜨릴 수 있다.
   - 스크립트는 오래된 bearer 토큰을 지우려고 `'AWS_BEARER_TOKEN_BEDROCK': ''`(빈 값으로 "설정")한다. 설치된 SDK(@aws-sdk/core httpAuthSchemes)의 `authSchemePreference`는 **값이 아니라 키 존재 여부**(`bearerTokenKey in env`)로 httpBearerAuth를 선호하고, `fromEnvSigningName`도 `in process.env`만 확인해 빈 토큰을 그대로 반환한다. 즉 컨테이너에 변수가 빈 값으로라도 존재하면 SigV4 자격 증명이 있어도 bearer(빈 토큰)로 서명을 시도해 인증이 실패할 수 있다.
   - Compose가 호스트의 "설정됐지만 빈" pass-through 변수를 컨테이너에 빈 값으로 넣는지는 이 세션에서 확인하지 못함(unknown). 넣는다면 실제 추론 확인에서 인증 오류로 나타난다.
   - 제안(수정은 소유자): `environment.pop('AWS_BEARER_TOKEN_BEDROCK', None)` 로 **키를 제거**(설정하지 않음). 같은 이유로 SessionToken도 없을 때 `''` 대신 pop(env SDK는 falsy면 무시하므로 세션 토큰은 안전하나 일관성). 테스트 단언도 `== ''`가 아니라 `not in env`로 바꿔야 함.
   - 비밀 없이 확인하는 방법: 실행 중 컨테이너에서 `'AWS_BEARER_TOKEN_BEDROCK' in process.env`의 **불리언만** 출력(값 비출력). 이 검토에서는 docker 명령을 쓰지 않아 미실행.

2. MEDIUM (hypothesis) — 일시 자격 증명 만료. default 프로필이 SSO/assume-role이면 export-credentials는 만료 시각이 있는 임시 키를 주고(스크립트는 Expiration을 버림) 컨테이너에는 정적 env로 고정되며 `restart: unless-stopped`로 계속 유지된다. 만료 후 호출은 `CredentialsProviderError`(한국어 503)가 아니라 만료 오류라 일반 500으로 나온다. 장기 IAM 키면 해당 없음(프로필 종류는 읽지 않아 unknown). 완화: 재실행 안내 또는 Expiration 출력(값 아님), 만료 응답을 인증 안내로 매핑.

3. LOW — `json.loads`/`values.get`에서 비정상 출력이 오면 트레이스백으로 종료(내용은 포함되지 않지만 메시지가 거칠다). 리전은 호스트에 `AWS_REGION`을 명시해도 default 프로필 값이 우선한다(의도일 수 있음). `aws configure get region`의 returncode는 무시하고 빈 값이면 폴백.

4. LOW — 노출 범위 참고: 키는 컨테이너 Config.Env(평문)로 로컬 Docker 메타데이터에 남는다(이미지·소스·로그는 아님). 이후 `docker compose config`/`docker inspect`는 값을 출력하므로 공유 금지. `docker compose up`만 쓰고 스크립트 없이 재생성하면 키 없이 컨테이너가 다시 만들어진다(기능 저하이지 노출 아님).

5. LOW (테스트) — start-docker-default.test.js는 합성 키로 성공 경로 1개만 검증(명령 순서/`env`값/stdout이 `verified`뿐임을 확인, cwd 확인은 좋음). 빈 번들 토큰 "키 제거" 의미, SessionToken 없음, 인증 실패 메시지(비밀 미출력), 리전 폴백은 미검증. 테스트가 `cwd` 상대경로(`development/tools/...`)에 의존해 저장소 루트 밖에서 실행하면 실패.

## 결론
비밀 노출·타 앱 영향 측면에서 재현 가능한 문제는 발견하지 못했다. 다만 Finding 1(빈 bearer 변수)은 실제 추론 인증 실패의 유력한 원인이 될 수 있어 실호출 확인 전에 키 제거 방식으로 바꾸고 테스트를 함께 조정할 것을 권한다.

DEFAULT_AUTH_REVIEW_DONE
