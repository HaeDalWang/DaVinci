# 백로그

상태: `대기` / `진행` / `완료` / `보류`. 완료 항목도 결과를 연결해 남긴다.

| ID | 작업 | 상태 | 근거·계획·결과 |
|---|---|---|---|
| B001 | 개발 기록 구조와 세션 복구 규칙 만들기 | 완료 | [논의](discussions/2026-10-06-restart.md), [결정](decisions/0001-baseline-first.md), [진입점](README.md) |
| B002 | 레거시 초기 실행·재현 근거 보존 | 완료 | [초기 결과](results/2026-10-06-initial/README.md). 품질 기준선 전체 완료를 뜻하지 않는다. |
| B003 | 지표·입력 세트·style 키 왕복 보존 확인 | 완료 | [기준선 계획 1단계](plans/0001-baseline.md#1-측정-정의와-입력-고정). [입력·정의](fixtures/baseline/README.md), [style 왕복](results/2026-10-06-baseline-v2/style-probe-reload-proof.json). 고정 입력 4개 완료; 사용자 정답 3개는 B005에서 확보. |
| B004 | 최소 측정기 구현·검증 후 레거시 기준선 산출 | 완료 | [기준선 계획 2단계](plans/0001-baseline.md#2-최소-측정기와-기준선), [v2 결과](results/2026-10-06-baseline-v2/README.md). 19개 측정; 116개 테스트 통과. 불가능한 지표는 null. |
| B005 | 원본/레거시 결과의 화면 비교와 한계 기록 | 진행 | [기준선 계획 3단계](plans/0001-baseline.md#3-시각-평가와-다음-계획). [KB 필수 조건](discussions/2026-10-07-kb-priority.md). [수정 전 기준선](results/2026-10-07-kb-baseline/README.md): 변환 27건 보존 실패. 사용자 판정은 “사람 눈에 부족”. [추가 수정 후](results/2026-10-07-preserved-addition/README.md)의 사용자 시각 합격·공유용 익명화는 미완료. 기존 결과는 보존. |
| B006 | 기준선으로 다음 개발 범위·재작성 전략 결정 | 완료 | 사용자가 KB 결과를 보고 계속 수정을 요청했다. [보존 편집 계획](plans/0002-preserve-service-addition.md)으로 서비스 추가부터 고친다. ELK·전면 재작성 채택은 미결. |
| B007 | 실제 렌더링 경로·라벨 기반 지표와 대응 정보 유지 보완 | 대기 | [v2의 미측정 한계](results/2026-10-06-baseline-v2/README.md). SVG는 확보했지만 교차·관통·라벨 추출기는 없다. |
| B008 | 페이지를 선택해 서비스만 추가하고 원본 그림 보존 | 완료 | [계획 0002](plans/0002-preserve-service-addition.md), [결과](results/2026-10-07-preserved-addition/README.md). 실제 전체 파일의 대상 7페이지에서 명령+보존 통과, 기존 셀 하위 XML·다른 페이지 불변, 새 vertex 겹침 0. 166개 테스트·빌드 통과. |
| B009 | 기존 경계·ID·내용·선을 유지하는 정렬 구현 | 대기 | [수정 후 결과](results/2026-10-07-preserved-addition/README.md). 기존 계층/좌→우 18건은 보존 실패. B007 지표 또는 사전에 정한 눈 판정과 KB 필수 기준으로 실험한다. ELK 채택은 미결. |
| B010 | Docker 웹 실행·파일 열기와 결과 다운로드·선택 페이지 자연어 컨텍스트 | 완료 | [계획 0003](plans/0003-docker-reference-use.md), [결과](results/2026-10-07-docker-use/README.md). 8080 실행, KB 7페이지 왕복, 합성 응답 UI 추가 보존, 177개 테스트·빌드 통과. 실제 모델 추론은 미연결. |
| B011 | 자연어 생성에서 기존 회사 그림을 레퍼런스로 활용 | 대기 | [계획 0003](plans/0003-docker-reference-use.md). 원본 복사 후 변경과 새 그림 스타일 참고의 사용자 선호를 확인한다. |
| B012 | 사내 배포 준비와 운영 의존성 업데이트 | 대기 | [Docker 실행의 제한](results/2026-10-07-docker-use/README.md). draw.io 자체 호스팅·사내 인증·운영 의존성 audit 8건을 배포 전에 검증한다. 회사 서버 배포는 아직 요청 전이다. |
| B013 | 웹 AI 모델 Sonnet 5.5 설정과 실제 인증 연결 | 완료 | [계획 0004](plans/0004-sonnet-web.md), [실제 연결](results/2026-10-07-sonnet-live/README.md). 사용자 승인 default 프로필, Sonnet 5.5·medium 실제 응답, 웹 S3 추가·다운로드 통과. 빈 모델 첫 merge 수정, 189개 테스트·빌드·health 통과. KB 자연어 품질은 B011. |
| B014 | 추가 서비스의 기존 배치·아이콘 스타일 통합 | 완료 | [계획 0005](plans/0005-integrated-addition.md), [결과](results/2026-10-07-integrated-addition/README.md). KB 7페이지 보존, 기존 S3가 있는 4페이지의 50px·스타일·부모·근접 배치 통과. 203개 테스트·빌드·Docker 갱신 완료. 참고 서비스가 없으면 기존 fallback 유지; 사용자 최종 눈 판정 대기. |
| B015 | 서비스 추가 시 기존 서비스 줄을 함께 재배치 | 진행 | [계획 0006](plans/0006-row-reflow.md), [결과](results/2026-10-08-row-reflow/README.md). 구현·KB 7페이지 로컬 보존·충돌 검사·196개 테스트·빌드 통과. 홈페이지 개발 줄의 이웃 3개 이동. Docker 갱신은 사용자 완료 보고. 서버 테스트 10개는 sandbox, 실제 화면은 브라우저 접근 권한 거부로 미확인. |
| B016 | S3 이외 서비스 추가의 통합·보존 검증 | 완료 | [결과](results/2026-10-08-multiservice/README.md). Kiro가 RDS 표기 인식·줄 배치·peer 탐색 예산을 수정. 조율자 재검증 225개 테스트·빌드·KB 28건 통과. EC2·Lambda의 peer 있는 줄은 합성 검증이며 KB에는 해당 peer가 없어 fallback만 확인. 이번 추가 수정은 Docker 미반영, 실제 화면 검증은 별도. |

현재 위치: **B016 Kiro 구현·서비스별 로컬 검증 완료**, 추가 수정의 Docker 반영·실제 화면 확인이 다음이다. B015의 S3 화면은 사용자에게 “완벽” 평가를 받았다. 이후 B011 레퍼런스 방식·생성 품질 검증으로 이어간다. B007 지표·B009 정렬은 별도 미완료다. 로컬 보존 통과를 새 그림 생성 품질의 합격으로 대신하지 않는다.
