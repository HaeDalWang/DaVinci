# B021 생성 아이콘 복구

2026-10-08. 사용자 자연어 생성 화면에서 EC2·RDS·S3 아이콘이 색 사각형으로 보인다. 구조는 표시됐으나 사람 눈 품질은 불합격. 이 화면을 수정 전 기준으로 삼고 원인을 Kiro에게 맡긴다. 사진 원본은 고객 화면 정보 때문에 공개 기록에 복사하지 않는다.

범위: 공통 스타일 정제에서 AWS 아이콘 shape 보존, 전체 지원 서비스 회귀 검사. 보안 필터·입력 내용·그룹·선 보존 유지. 배치 전체 재설계는 이 수정에 섞지 않는다. 완료 기준: 수정 전 실패 테스트 → 수정 후 통과, 기존 전체 테스트·빌드, 공개 입력·KB 스타일 검사 및 Docker 웹 최신 코드 확인. 실제 화면은 사용자의 확인과 구분한다.

## 조율자 수정 전 재현

카탈로그 EC2/RDS/S3는 shape=mxgraph.aws4.resourceIcon이지만 sanitizeStyle 결과는 shape=null이다. 아이콘 존재 assert를 독립 측정기에 추가한 뒤 기존 공개 입력을 검사했으며 `AssertionError: AWS icon shape missing`으로 실패했다. 이전의 스타일 동등성 검사만으로는 함께 잘못 정제된 스타일을 정답으로 볼 수 있었다. 이번부터 shape 및 resourceIcon의 resIcon 존재도 별도로 확인한다.

## 수정·최종 검증

Kiro가 AWS 네임스페이스의 shape 이름에 영문 대문자를 허용하는 한 줄 수정과 회귀 테스트 7개를 추가했다. resourceIcon과 ASG의 groupCenter도 유지하며 URL·image·다른 네임스페이스·주입값 필터는 유지한다. [작업자 보고](worker-report.md). 작업자 세션은 완료 후 유지한다.

조율자가 직접 실행한 [테스트](tests.txt) 21파일 308개와 [빌드](build.txt)가 통과했다. [공개 입력·KB 7페이지 표현 검사](after-check/proof.json)는 ID·내용·그룹·연결·모든 서비스 shape·템플릿 표현·원본 페이지 보존·겹침 0을 확인했다. 고객 XML은 private.local에만 둔다. 이전 before-check는 아이콘 assert에서 실패했다.

사용자의 점진적 확인 요청에 따라 [Docker 웹 반영](docker.txt)을 완료했다. [health·최신 asset](web-proof.json) 확인: status=ok, modelConfigured=true, index-B-Xm10t7.js 제공. 실제 모델 호출이나 브라우저 화면 검증은 하지 않았다. 이미 생성된 그림의 사각형은 자동 복구되지 않으므로 새로 생성해야 한다. 이번 수정은 렌더링에 필요한 스타일 복구이며 KB 수준 배치 품질의 합격 판정이 아니다. 다음은 B020에서 선 경로·여백·AZ/서브넷 배치를 비교한다. 커밋·푸시는 하지 않았다.
