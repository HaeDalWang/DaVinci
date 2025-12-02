# 사용 예제

## 빠른 시작 (샘플 데이터)

실제 AWS 연결 없이 샘플 데이터로 테스트:

```bash
uv run python examples/quick_test.py
```

생성된 `sample-infrastructure.drawio` 파일을 [draw.io](https://app.diagrams.net/)에서 열어보세요!

## 실제 AWS 계정 사용

### 1. 기본 자격증명 사용

환경변수 또는 `~/.aws/credentials` 파일의 자격증명 사용:

```bash
# 환경변수 설정
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="ap-northeast-2"

# 실행
uv run python examples/generate_diagram.py
```

### 2. CrossAccount Role 사용

다른 AWS 계정의 리소스 조회:

```bash
uv run python examples/generate_diagram.py \
  --account-id 123456789012 \
  --role-name ReadOnlyRole \
  --region ap-northeast-2
```

**필요한 IAM 권한:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:DescribeVpcs",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups"
    ],
    "Resource": "*"
  }]
}
```

### 3. 옵션

```bash
# 중간 JSON 파일도 저장 (디버깅용)
uv run python examples/generate_diagram.py --save-json

# 출력 파일명 지정
uv run python examples/generate_diagram.py --output my-infra.drawio

# 특정 리전 지정
uv run python examples/generate_diagram.py --region us-east-1

# 모든 옵션 조합
uv run python examples/generate_diagram.py \
  --account-id 123456789012 \
  --role-name ReadOnlyRole \
  --region ap-northeast-2 \
  --output production-infra.drawio \
  --save-json
```

## 출력 파일

### draw.io 파일 (.drawio)
- draw.io 웹/데스크톱 앱에서 열 수 있는 XML 파일
- AWS Architecture Icons 2025 적용
- 자동 레이아웃 (VPC, Subnet, EC2)
- 편집 가능

### JSON 파일 (--save-json 옵션)
- `*-phase1.json`: Phase 1 AWS 리소스 조회 결과
- `*-phase2.json`: Phase 2 리소스 그래프

## draw.io에서 열기

1. [draw.io 웹사이트](https://app.diagrams.net/) 방문
2. File → Open from → Device
3. 생성된 `.drawio` 파일 선택
4. 다이어그램 확인 및 편집

## 문제 해결

### AWS 자격증명 에러
```
Error: NoCredentialsError
```

**해결:**
```bash
# 환경변수 확인
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# 또는 ~/.aws/credentials 파일 확인
cat ~/.aws/credentials
```

### 권한 부족 에러
```
Error: AccessDenied
```

**해결:** IAM 정책에 필요한 권한 추가 (위 IAM 권한 참조)

### 리소스가 없음
```
VPC: 0개
EC2: 0개
```

**확인사항:**
- 올바른 리전 지정 (`--region`)
- 해당 리전에 실제 리소스 존재 여부

## 예제 시나리오

### 시나리오 1: 개발 환경 다이어그램
```bash
uv run python examples/generate_diagram.py \
  --region ap-northeast-2 \
  --output dev-environment.drawio
```

### 시나리오 2: 운영 환경 (CrossAccount)
```bash
uv run python examples/generate_diagram.py \
  --account-id 987654321098 \
  --role-name ProductionReadOnly \
  --region ap-northeast-2 \
  --output production-environment.drawio
```

### 시나리오 3: 다중 리전 비교
```bash
# 서울 리전
uv run python examples/generate_diagram.py \
  --region ap-northeast-2 \
  --output seoul-infra.drawio

# 도쿄 리전
uv run python examples/generate_diagram.py \
  --region ap-northeast-1 \
  --output tokyo-infra.drawio
```

## 다음 단계

생성된 다이어그램을:
- 팀과 공유
- 문서에 삽입
- 아키텍처 리뷰에 활용
- 정기적으로 업데이트하여 최신 상태 유지
