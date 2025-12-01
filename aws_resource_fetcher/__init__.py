"""AWS 리소스 조회 시스템

CrossAccount AssumeRole을 통해 AWS 계정의 EC2, VPC, 보안그룹 리소스를 조회합니다.
"""

__version__ = "0.1.0"

from .resource_fetcher import ResourceFetcher
from .credentials import AWSCredentialManager
from .models import (
    AWSCredentials,
    EC2Instance,
    VPC,
    Subnet,
    SecurityGroup,
    SecurityGroupRule,
)
from .exceptions import (
    AWSResourceFetcherError,
    AssumeRoleError,
    ResourceFetchError,
    PermissionError,
)

__all__ = [
    "ResourceFetcher",
    "AWSCredentialManager",
    "AWSCredentials",
    "EC2Instance",
    "VPC",
    "Subnet",
    "SecurityGroup",
    "SecurityGroupRule",
    "AWSResourceFetcherError",
    "AssumeRoleError",
    "ResourceFetchError",
    "PermissionError",
]
