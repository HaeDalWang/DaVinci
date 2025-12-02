"""
ResourceParser - Phase 1 JSON 데이터 파싱

Requirements: 1.1, 1.2, 1.3, 8.2
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from .exceptions import ParseError


@dataclass
class ParsedResources:
    """
    파싱된 리소스 데이터
    
    Phase 1 JSON을 파싱한 결과를 담는 컨테이너
    """
    ec2_instances: list[dict[str, Any]] = field(default_factory=list)
    vpcs: list[dict[str, Any]] = field(default_factory=list)
    subnets: list[dict[str, Any]] = field(default_factory=list)
    security_groups: list[dict[str, Any]] = field(default_factory=list)


class ResourceParser:
    """
    Phase 1 JSON 데이터를 파싱하는 컴포넌트
    
    Requirements: 1.1, 1.2, 1.3, 8.2
    """
    
    def parse(self, json_data: dict[str, Any]) -> ParsedResources:
        """
        Phase 1 JSON 데이터를 파싱
        
        Args:
            json_data: {
                'ec2_instances': list[dict],
                'vpcs': list[dict],
                'security_groups': list[dict]
            }
            
        Returns:
            ParsedResources: 파싱된 리소스 객체
            
        Raises:
            ParseError: 데이터 파싱 실패 시
            
        Requirements: 1.1, 1.2
        """
        # 필수 필드 검증
        self._validate_top_level_structure(json_data)
        
        # 각 리소스 타입별 파싱
        ec2_instances = self._parse_ec2_instances(json_data.get('ec2_instances', []))
        vpcs = self._parse_vpcs(json_data.get('vpcs', []))
        security_groups = self._parse_security_groups(json_data.get('security_groups', []))
        
        # Subnet은 VPC 내부에 포함되어 있으므로 추출
        subnets = self._extract_subnets(vpcs)
        
        return ParsedResources(
            ec2_instances=ec2_instances,
            vpcs=vpcs,
            subnets=subnets,
            security_groups=security_groups
        )
    
    def _validate_top_level_structure(self, json_data: dict[str, Any]) -> None:
        """
        최상위 구조 검증
        
        Requirements: 1.3, 8.2
        """
        if not isinstance(json_data, dict):
            raise ParseError('json_data', 'dict', json_data)
        
        # 필수 필드 확인
        required_fields = ['ec2_instances', 'vpcs', 'security_groups']
        for field in required_fields:
            if field not in json_data:
                raise ParseError(field, 'required field', None)
            
            if not isinstance(json_data[field], list):
                raise ParseError(field, 'list', json_data[field])
    
    def _parse_ec2_instances(self, instances: list[Any]) -> list[dict[str, Any]]:
        """
        EC2 인스턴스 파싱
        
        Requirements: 1.1, 1.2, 1.3, 8.2
        """
        parsed_instances = []
        
        for idx, instance in enumerate(instances):
            if not isinstance(instance, dict):
                raise ParseError(f'ec2_instances[{idx}]', 'dict', instance)
            
            # 필수 필드 검증
            required_fields = {
                'instance_id': str,
                'name': str,
                'state': str,
                'vpc_id': str,
                'subnet_id': str,
                'security_groups': list,
                'private_ip': str
            }
            
            self._validate_required_fields(instance, required_fields, f'ec2_instances[{idx}]')
            
            # public_ip는 선택적 필드
            if 'public_ip' in instance and instance['public_ip'] is not None:
                if not isinstance(instance['public_ip'], str):
                    raise ParseError(
                        f'ec2_instances[{idx}].public_ip',
                        'str or None',
                        instance['public_ip']
                    )
            
            parsed_instances.append(instance)
        
        return parsed_instances
    
    def _parse_vpcs(self, vpcs: list[Any]) -> list[dict[str, Any]]:
        """
        VPC 파싱
        
        Requirements: 1.1, 1.2, 1.3, 8.2
        """
        parsed_vpcs = []
        
        for idx, vpc in enumerate(vpcs):
            if not isinstance(vpc, dict):
                raise ParseError(f'vpcs[{idx}]', 'dict', vpc)
            
            # 필수 필드 검증
            required_fields = {
                'vpc_id': str,
                'name': str,
                'cidr_block': str,
                'subnets': list
            }
            
            self._validate_required_fields(vpc, required_fields, f'vpcs[{idx}]')
            
            # Subnet 검증
            for subnet_idx, subnet in enumerate(vpc['subnets']):
                if not isinstance(subnet, dict):
                    raise ParseError(
                        f'vpcs[{idx}].subnets[{subnet_idx}]',
                        'dict',
                        subnet
                    )
                
                subnet_required_fields = {
                    'subnet_id': str,
                    'name': str,
                    'cidr_block': str,
                    'availability_zone': str
                }
                
                self._validate_required_fields(
                    subnet,
                    subnet_required_fields,
                    f'vpcs[{idx}].subnets[{subnet_idx}]'
                )
            
            parsed_vpcs.append(vpc)
        
        return parsed_vpcs
    
    def _parse_security_groups(self, security_groups: list[Any]) -> list[dict[str, Any]]:
        """
        SecurityGroup 파싱
        
        Requirements: 1.1, 1.2, 1.3, 8.2
        """
        parsed_sgs = []
        
        for idx, sg in enumerate(security_groups):
            if not isinstance(sg, dict):
                raise ParseError(f'security_groups[{idx}]', 'dict', sg)
            
            # 필수 필드 검증
            required_fields = {
                'group_id': str,
                'name': str,
                'vpc_id': str,
                'description': str,
                'inbound_rules': list,
                'outbound_rules': list
            }
            
            self._validate_required_fields(sg, required_fields, f'security_groups[{idx}]')
            
            # 규칙 검증
            self._validate_sg_rules(sg['inbound_rules'], f'security_groups[{idx}].inbound_rules')
            self._validate_sg_rules(sg['outbound_rules'], f'security_groups[{idx}].outbound_rules')
            
            parsed_sgs.append(sg)
        
        return parsed_sgs
    
    def _validate_sg_rules(self, rules: list[Any], field_path: str) -> None:
        """
        SecurityGroup 규칙 검증
        
        Requirements: 1.3, 8.2
        """
        for idx, rule in enumerate(rules):
            if not isinstance(rule, dict):
                raise ParseError(f'{field_path}[{idx}]', 'dict', rule)
            
            # 필수 필드
            required_fields = {
                'protocol': str,
                'target': str
            }
            
            self._validate_required_fields(rule, required_fields, f'{field_path}[{idx}]')
            
            # from_port, to_port는 선택적 (protocol이 -1이면 없을 수 있음)
            if 'from_port' in rule and rule['from_port'] is not None:
                if not isinstance(rule['from_port'], int):
                    raise ParseError(
                        f'{field_path}[{idx}].from_port',
                        'int or None',
                        rule['from_port']
                    )
            
            if 'to_port' in rule and rule['to_port'] is not None:
                if not isinstance(rule['to_port'], int):
                    raise ParseError(
                        f'{field_path}[{idx}].to_port',
                        'int or None',
                        rule['to_port']
                    )
    
    def _validate_required_fields(
        self,
        data: dict[str, Any],
        required_fields: Mapping[str, type],
        field_path: str
    ) -> None:
        """
        필수 필드 검증
        
        Args:
            data: 검증할 데이터
            required_fields: {필드명: 예상 타입}
            field_path: 에러 메시지용 필드 경로
            
        Raises:
            ParseError: 필수 필드 누락 또는 타입 불일치
            
        Requirements: 1.3, 8.2
        """
        for field_name, expected_type in required_fields.items():
            if field_name not in data:
                raise ParseError(
                    f'{field_path}.{field_name}',
                    f'required field of type {expected_type.__name__}',
                    None
                )
            
            if not isinstance(data[field_name], expected_type):
                raise ParseError(
                    f'{field_path}.{field_name}',
                    expected_type.__name__,
                    data[field_name]
                )
    
    def _extract_subnets(self, vpcs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        VPC에서 Subnet 추출
        
        Subnet은 VPC 내부에 포함되어 있으므로 별도 리스트로 추출
        
        Requirements: 1.2
        """
        subnets = []
        
        for vpc in vpcs:
            for subnet in vpc.get('subnets', []):
                # VPC ID 추가 (그래프 생성 시 필요)
                subnet_with_vpc = subnet.copy()
                subnet_with_vpc['vpc_id'] = vpc['vpc_id']
                subnets.append(subnet_with_vpc)
        
        return subnets
