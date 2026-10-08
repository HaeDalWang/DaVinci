"""Start local Docker with only the user's authorized default AWS credentials."""
import json
import os
from pathlib import Path
import subprocess


def main():
    credentials = subprocess.run(
        ['aws', 'configure', 'export-credentials', '--profile', 'default', '--format', 'process'],
        capture_output=True, text=True,
    )
    if credentials.returncode:
        raise SystemExit('기본 AWS 프로필의 인증을 확인해주세요. 자격 증명은 출력하지 않았습니다.')
    values = json.loads(credentials.stdout)
    if not values.get('AccessKeyId') or not values.get('SecretAccessKey'):
        raise SystemExit('기본 AWS 프로필에서 사용할 자격 증명을 찾지 못했습니다.')
    region = subprocess.run(['aws', 'configure', 'get', 'region', '--profile', 'default'],
                            capture_output=True, text=True)
    environment = os.environ.copy()
    environment.update({
        'AWS_ACCESS_KEY_ID': values['AccessKeyId'],
        'AWS_SECRET_ACCESS_KEY': values['SecretAccessKey'],
        'AWS_SESSION_TOKEN': values.get('SessionToken', ''),
        'AWS_REGION': region.stdout.strip() or environment.get('AWS_REGION', 'ap-northeast-2'),
    })
    environment.pop('AWS_BEARER_TOKEN_BEDROCK', None)
    # Only selected credentials reach Compose; no profile files or secret output.
    subprocess.run(['docker', 'compose', 'up', '-d', '--build'], env=environment,
                   cwd=Path(__file__).resolve().parents[2], check=True)


if __name__ == '__main__':
    main()
