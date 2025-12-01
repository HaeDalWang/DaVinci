"""AWS 리소스 조회 시스템 커스텀 예외"""


class AWSResourceFetcherError(Exception):
    """모든 fetcher 에러의 기본 예외"""
    pass


class AssumeRoleError(AWSResourceFetcherError):
    """AssumeRole 실패 시 발생"""
    
    def __init__(self, account_id: str, role_name: str, original_error: Exception):
        self.account_id = account_id
        self.role_name = role_name
        self.original_error = original_error
        super().__init__(
            f"Failed to assume role {role_name} in account {account_id}: {original_error}"
        )


class ResourceFetchError(AWSResourceFetcherError):
    """리소스 조회 실패 시 발생"""
    
    def __init__(self, resource_type: str, original_error: Exception):
        self.resource_type = resource_type
        self.original_error = original_error
        super().__init__(f"Failed to fetch {resource_type}: {original_error}")


class PermissionError(AWSResourceFetcherError):
    """권한 부족 시 발생"""
    
    def __init__(self, action: str, required_permissions: list[str]):
        self.action = action
        self.required_permissions = required_permissions
        super().__init__(
            f"Permission denied for {action}. "
            f"Required permissions: {', '.join(required_permissions)}"
        )
