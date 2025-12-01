"""보안그룹 조회 Fetcher"""
from typing import Any
from botocore.exceptions import ClientError

from .base import BaseFetcher
from ..models import AWSCredentials, SecurityGroup, SecurityGroupRule
from ..exceptions import ResourceFetchError


class SecurityGroupFetcher(BaseFetcher):
    """보안그룹 정보를 조회하는 Fetcher"""
    
    def __init__(self) -> None:
        super().__init__(resource_type='SecurityGroup')
    
    def fetch_security_groups(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[SecurityGroup]:
        """
        보안그룹 목록을 조회
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            SecurityGroup 객체 리스트
            
        Raises:
            ResourceFetchError: 리소스 조회 실패 시
            PermissionError: 권한 부족 시
        """
        try:
            # EC2 클라이언트 생성
            ec2_client = self._create_client('ec2', credentials, region)
            
            # 보안그룹 조회 (페이지네이션 처리)
            security_groups = []
            paginator = ec2_client.get_paginator('describe_security_groups')
            
            for page in paginator.paginate():
                for sg_data in page.get('SecurityGroups', []):
                    security_group = self._parse_security_group(sg_data)
                    security_groups.append(security_group)
            
            return security_groups
            
        except ClientError as e:
            self._handle_client_error(e)
        except Exception as e:
            raise ResourceFetchError(
                resource_type=self.resource_type,
                original_error=e
            ) from e
        
        # mypy를 위한 명시적 return (실제로는 도달하지 않음)
        return []  # pragma: no cover
    
    def fetch(
        self, 
        credentials: AWSCredentials, 
        region: str = 'ap-northeast-2'
    ) -> list[SecurityGroup]:
        """
        BaseFetcher의 추상 메서드 구현
        
        Args:
            credentials: AWS 임시 자격증명
            region: AWS 리전
            
        Returns:
            SecurityGroup 객체 리스트
        """
        return self.fetch_security_groups(credentials, region)
    
    def _parse_security_group(self, sg_data: dict[str, Any]) -> SecurityGroup:
        """
        boto3 응답 데이터를 SecurityGroup 모델로 변환
        
        Args:
            sg_data: boto3 describe_security_groups 응답의 SecurityGroup 객체
            
        Returns:
            SecurityGroup 객체
        """
        # 인바운드 규칙 파싱
        inbound_rules = self._parse_rules(sg_data.get('IpPermissions', []))
        
        # 아웃바운드 규칙 파싱
        outbound_rules = self._parse_rules(sg_data.get('IpPermissionsEgress', []))
        
        return SecurityGroup(
            group_id=sg_data['GroupId'],
            name=sg_data.get('GroupName', ''),
            vpc_id=sg_data.get('VpcId', ''),
            description=sg_data.get('Description', ''),
            inbound_rules=inbound_rules,
            outbound_rules=outbound_rules
        )
    
    def _parse_rules(self, permissions: list[dict[str, Any]]) -> list[SecurityGroupRule]:
        """
        보안그룹 규칙 목록을 파싱
        
        Args:
            permissions: boto3 IpPermissions 또는 IpPermissionsEgress 목록
            
        Returns:
            SecurityGroupRule 객체 리스트
        """
        rules = []
        
        for permission in permissions:
            protocol = permission.get('IpProtocol', '-1')
            from_port = permission.get('FromPort')
            to_port = permission.get('ToPort')
            
            # CIDR 기반 규칙 처리
            for ip_range in permission.get('IpRanges', []):
                cidr = ip_range.get('CidrIp', '')
                if cidr:
                    rules.append(SecurityGroupRule(
                        protocol=protocol,
                        from_port=from_port,
                        to_port=to_port,
                        target=cidr
                    ))
            
            # IPv6 CIDR 기반 규칙 처리
            for ipv6_range in permission.get('Ipv6Ranges', []):
                cidr_ipv6 = ipv6_range.get('CidrIpv6', '')
                if cidr_ipv6:
                    rules.append(SecurityGroupRule(
                        protocol=protocol,
                        from_port=from_port,
                        to_port=to_port,
                        target=cidr_ipv6
                    ))
            
            # 보안그룹 기반 규칙 처리
            for user_id_group_pair in permission.get('UserIdGroupPairs', []):
                group_id = user_id_group_pair.get('GroupId', '')
                if group_id:
                    rules.append(SecurityGroupRule(
                        protocol=protocol,
                        from_port=from_port,
                        to_port=to_port,
                        target=group_id
                    ))
            
            # Prefix List 기반 규칙 처리
            for prefix_list in permission.get('PrefixListIds', []):
                prefix_list_id = prefix_list.get('PrefixListId', '')
                if prefix_list_id:
                    rules.append(SecurityGroupRule(
                        protocol=protocol,
                        from_port=from_port,
                        to_port=to_port,
                        target=prefix_list_id
                    ))
        
        return rules
