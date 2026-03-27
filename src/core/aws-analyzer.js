// src/core/aws-analyzer.js — AWS 아키텍처 XML 분석 엔진

import { AWS_CATEGORIES, identifyServiceByStyle, getCategoryByType } from './aws-service-catalog.js';

/**
 * 최적화 규칙 정의
 * 각 규칙은 condition 함수와 메타데이터로 구성
 * check 함수는 { services, connections, categories } 를 받는다.
 * services[].type 은 서비스 카탈로그의 type 값 (예: 'ec2', 'fargate', 'codebuild')
 */
const OPTIMIZATION_RULES = [
    {
        id: 'single-az',
        title: '단일 AZ 구성 감지',
        description: '다중 AZ(Multi-AZ) 구성을 사용하면 고가용성을 확보할 수 있습니다. RDS, ElastiCache 등 상태 보존 서비스에 특히 권장됩니다.',
        severity: 'warning',
        check: (a) => {
            const hasDB = a.services.some((s) => hasCategory(s.type, 'Database'));
            const hasMultiAZ = a.services.some((s) =>
                s.label && s.label.toLowerCase().includes('multi-az')
            );
            return hasDB && !hasMultiAZ;
        },
    },
    {
        id: 'no-cdn',
        title: 'CloudFront CDN 미사용',
        description: '정적 콘텐츠 배포 시 CloudFront를 사용하면 글로벌 엣지 로케이션을 통해 지연 시간을 크게 줄일 수 있습니다.',
        severity: 'info',
        check: (a) => {
            const hasS3 = a.services.some((s) => s.type === 's3');
            const hasCF = a.services.some((s) => s.type === 'cloudfront');
            return hasS3 && !hasCF;
        },
    },
    {
        id: 'no-waf',
        title: 'WAF 미적용',
        description: 'API Gateway나 ALB 앞에 AWS WAF를 배치하면 SQL 인젝션, XSS 등 일반적인 웹 공격을 차단할 수 있습니다.',
        severity: 'warning',
        check: (a) => {
            const hasPublicEndpoint = a.services.some((s) =>
                s.type === 'api_gateway' || s.type === 'alb'
            );
            const hasWAF = a.services.some((s) => s.type === 'waf');
            return hasPublicEndpoint && !hasWAF;
        },
    },
    {
        id: 'no-monitoring',
        title: '모니터링 서비스 누락',
        description: 'CloudWatch를 통한 메트릭 수집, 알람 설정, 로그 분석은 운영 안정성의 기본입니다. CloudTrail과 함께 사용하면 감사 추적도 가능합니다.',
        severity: 'warning',
        check: (a) => {
            const hasCW = a.services.some((s) => s.type === 'cloudwatch');
            return a.services.length > 2 && !hasCW;
        },
    },
    {
        id: 'direct-ec2-exposure',
        title: 'EC2 직접 노출 가능성',
        description: 'EC2 인스턴스를 ALB/NLB 뒤에 배치하면 트래픽 분산, 헬스 체크, SSL 종료 등 이점을 얻을 수 있습니다.',
        severity: 'error',
        check: (a) => {
            const hasEC2 = a.services.some((s) => s.type === 'ec2');
            const hasLB = a.services.some((s) => s.type === 'alb' || s.type === 'nlb');
            return hasEC2 && !hasLB;
        },
    },
    {
        id: 'no-nat',
        title: 'NAT Gateway 미구성',
        description: 'Private Subnet의 리소스가 인터넷에 접근해야 할 경우 NAT Gateway가 필요합니다.',
        severity: 'info',
        check: (a) => {
            const hasPrivateCompute = a.services.some((s) =>
                s.type === 'ec2' || s.type === 'ecs' || s.type === 'fargate' || s.type === 'lambda'
            );
            const hasNAT = a.services.some((s) => s.type === 'nat');
            return hasPrivateCompute && !hasNAT;
        },
    },
    {
        id: 'no-iam',
        title: 'IAM 정책 미표시',
        description: '아키텍처 다이어그램에 IAM 역할/정책을 명시하면 보안 검토 시 서비스 간 권한 흐름을 빠르게 파악할 수 있습니다.',
        severity: 'info',
        check: (a) => {
            const hasIAM = a.services.some((s) => s.type === 'iam');
            return a.services.length > 3 && !hasIAM;
        },
    },
    {
        id: 'no-encryption',
        title: '암호화 서비스 미표시',
        description: 'KMS 또는 Secrets Manager를 사용하여 데이터 암호화 및 비밀 관리를 다이어그램에 명시하면 보안 검토에 도움이 됩니다.',
        severity: 'info',
        check: (a) => {
            const hasDB = a.services.some((s) => hasCategory(s.type, 'Database'));
            const hasKMS = a.services.some((s) => s.type === 'kms' || s.type === 'secrets_manager');
            return hasDB && !hasKMS;
        },
    },
    {
        id: 'no-cicd',
        title: 'CI/CD 파이프라인 미구성',
        description: 'CodePipeline, CodeBuild 등 CI/CD 서비스를 포함하면 배포 자동화 흐름을 명확히 할 수 있습니다.',
        severity: 'info',
        check: (a) => {
            const hasCompute = a.services.some((s) => hasCategory(s.type, 'Compute') || hasCategory(s.type, 'Container'));
            const hasCICD = a.services.some((s) =>
                s.type === 'codepipeline' || s.type === 'codebuild' || s.type === 'codedeploy'
            );
            return a.services.length > 4 && hasCompute && !hasCICD;
        },
    },
    {
        id: 'no-logging',
        title: 'CloudTrail 감사 로그 미구성',
        description: 'CloudTrail을 활성화하면 API 호출 기록을 통해 보안 감사 및 문제 추적이 가능합니다.',
        severity: 'info',
        check: (a) => {
            const hasCT = a.services.some((s) => s.type === 'cloudtrail');
            return a.services.length > 3 && !hasCT;
        },
    },
    {
        id: 'eks-no-fargate',
        title: 'EKS에 Fargate 미사용',
        description: 'EKS 클러스터에서 Fargate를 사용하면 노드 관리 부담 없이 서버리스 컨테이너를 실행할 수 있습니다. EC2 노드와 혼합 사용도 가능합니다.',
        severity: 'info',
        check: (a) => {
            const hasEKSGroup = a.groups.some((g) => g.type === 'eks_cluster');
            const hasFargate = a.services.some((s) => s.type === 'fargate');
            return hasEKSGroup && !hasFargate;
        },
    },
    {
        id: 'good-ha',
        title: '고가용성 구성 확인됨',
        description: '로드 밸런서와 컴퓨팅 리소스가 감지되었습니다. 고가용성 아키텍처의 기본 요건을 충족합니다.',
        severity: 'success',
        check: (a) => {
            const hasLB = a.services.some((s) => s.type === 'alb' || s.type === 'nlb');
            const hasCompute = a.services.some((s) => hasCategory(s.type, 'Compute') || hasCategory(s.type, 'Container'));
            return hasLB && hasCompute;
        },
    },
    {
        id: 'good-security',
        title: '보안 계층 구성 확인됨',
        description: 'WAF, Shield 등 보안 서비스가 감지되었습니다. 다층 보안 아키텍처가 적용되어 있습니다.',
        severity: 'success',
        check: (a) => {
            const securityCount = a.services.filter((s) => hasCategory(s.type, 'Security')).length;
            return securityCount >= 2;
        },
    },
    {
        id: 'good-monitoring',
        title: '모니터링 구성 확인됨',
        description: 'CloudWatch가 감지되었습니다. 메트릭 수집 및 알람 설정이 가능합니다.',
        severity: 'success',
        check: (a) => {
            return a.services.some((s) => s.type === 'cloudwatch');
        },
    },
];

/**
 * 서비스 type이 특정 카테고리에 속하는지 확인한다.
 * @param {string} type - 서비스 타입 (예: 'ec2', 'fargate')
 * @param {string} category - 카테고리명 (예: 'Compute', 'Database')
 * @returns {boolean}
 */
function hasCategory(type, category) {
    if (!type || !category) return false;
    return getCategoryByType(type) === category;
}

/**
 * draw.io XML을 분석하여 AWS 아키텍처 메타데이터를 추출한다.
 * identifyServiceByStyle()을 사용하여 정확한 서비스 식별을 수행한다.
 * @param {string} xml - mxGraphModel XML
 * @returns {object}
 */
export function analyzeArchitecture(xml) {
    if (!xml) {
        return { services: [], connections: [], categories: {}, groups: [], tips: [], summary: { totalServices: 0, totalConnections: 0, totalGroups: 0 } };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const cells = doc.querySelectorAll('mxCell');
    const services = [];
    const connections = [];
    const groups = [];
    const serviceMap = new Map(); // id → service/group 매핑

    for (const cell of cells) {
        const id = cell.getAttribute('id');
        if (!id || id === '0' || id === '1') continue;

        const style = cell.getAttribute('style') || '';
        const value = cell.getAttribute('value') || '';
        const source = cell.getAttribute('source');
        const target = cell.getAttribute('target');
        const label = value.replace(/<[^>]*>/g, '').trim();

        // 연결(Edge) 식별
        if (source && target) {
            connections.push({ source, target });
            continue;
        }

        // 그룹(컨테이너) 식별
        if (style.includes('container=1') || cell.getAttribute('connectable') === '0') {
            const groupType = identifyGroupType(style);
            if (groupType) {
                const group = { id, type: groupType, label: label || groupType };
                groups.push(group);
                serviceMap.set(id, { id, label: label || groupType, type: groupType, isGroup: true });
                continue;
            }
        }

        // 서비스 식별 — identifyServiceByStyle 사용
        const serviceInfo = identifyServiceByStyle(style);
        if (serviceInfo) {
            const service = {
                id,
                type: serviceInfo.type,
                serviceName: serviceInfo.label,
                label: label || serviceInfo.label,
                category: serviceInfo.category,
                tier: serviceInfo.tier,
            };
            services.push(service);
            serviceMap.set(id, service);
            continue;
        }

        // mxgraph.aws4 패턴이 있지만 카탈로그에 없는 서비스 — style에서 추출 시도
        if (style.includes('mxgraph.aws4')) {
            const resMatch = style.match(/resIcon=mxgraph\.aws4\.([^;]+)/);
            const shapeMatch = style.match(/shape=mxgraph\.aws4\.([^;]+)/);
            const rawType = resMatch ? resMatch[1] : (shapeMatch ? shapeMatch[1] : 'unknown');
            const prettyName = rawType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const category = getCategoryByType(rawType);

            const service = {
                id,
                type: rawType,
                serviceName: prettyName,
                label: label || prettyName,
                category,
                tier: 'unknown',
            };
            services.push(service);
            serviceMap.set(id, service);
        }
    }

    // 카테고리별 분류
    const categories = {};
    for (const svc of services) {
        if (!categories[svc.category]) {
            categories[svc.category] = [];
        }
        categories[svc.category].push(svc);
    }

    // 연결 관계를 사람이 읽을 수 있는 형태로 변환
    const readableConnections = connections
        .map((conn) => {
            const src = serviceMap.get(conn.source);
            const tgt = serviceMap.get(conn.target);
            return {
                from: src ? src.label : conn.source,
                to: tgt ? tgt.label : conn.target,
            };
        })
        .filter((c) => c.from && c.to);

    // 최적화 팁 실행
    const analysisData = { services, connections: readableConnections, categories, groups };
    const tips = OPTIMIZATION_RULES
        .filter((rule) => rule.check(analysisData))
        .map((rule) => ({
            id: rule.id,
            title: rule.title,
            description: rule.description,
            severity: rule.severity,
        }));

    return {
        services,
        connections: readableConnections,
        categories,
        groups,
        tips,
        summary: {
            totalServices: services.length,
            totalConnections: readableConnections.length,
            totalGroups: groups.length,
        },
    };
}

/**
 * style 문자열에서 그룹 타입을 식별한다.
 * @param {string} style
 * @returns {string|null}
 */
function identifyGroupType(style) {
    if (!style) return null;
    if (style.includes('group_aws_cloud_alt')) return 'aws_cloud';
    if (style.includes('group_vpc')) return 'vpc';
    if (style.includes('group_eks')) return 'eks_cluster';
    if (style.includes('group_auto_scaling_group') || style.includes('groupCenter')) return 'asg';
    if (style.includes('group_security_group')) {
        if (style.includes('strokeColor=#7AA116') || style.includes('fillColor=#F2F6E8')) return 'subnet_public';
        if (style.includes('strokeColor=#00A4A6') || style.includes('fillColor=#E6F6F7')) return 'subnet_private';
        return 'subnet_private';
    }
    if (style.includes('dashed=1') && style.includes('strokeColor=#147EBA')) return 'az';
    return null;
}

/**
 * 최적화 팁만 실행 (팁 버튼용)
 * @param {string} xml
 * @returns {Array}
 */
export function getOptimizationTips(xml) {
    const analysis = analyzeArchitecture(xml);
    return analysis.tips;
}
