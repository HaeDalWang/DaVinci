// src/core/aws-analyzer.js — AWS 아키텍처 XML 분석 엔진

/**
 * AWS 서비스 카테고리 매핑
 * draw.io aws4 라이브러리의 shape 이름을 기준으로 분류
 */
const AWS_CATEGORIES = {
    Compute: ['ec2', 'lambda', 'ecs', 'eks', 'fargate', 'batch', 'lightsail', 'elastic_beanstalk', 'outposts', 'app_runner'],
    Networking: ['vpc', 'cloudfront', 'route53', 'api_gateway', 'elb', 'alb', 'nlb', 'direct_connect', 'transit_gateway', 'nat_gateway', 'internet_gateway', 'endpoint', 'global_accelerator'],
    Storage: ['s3', 'ebs', 'efs', 'fsx', 'glacier', 'storage_gateway', 'backup'],
    Database: ['rds', 'dynamodb', 'aurora', 'elasticache', 'redshift', 'neptune', 'documentdb', 'keyspaces', 'timestream', 'memorydb'],
    Security: ['iam', 'cognito', 'waf', 'shield', 'kms', 'secrets_manager', 'certificate_manager', 'guardduty', 'inspector', 'macie', 'security_hub', 'firewall_manager'],
    Integration: ['sqs', 'sns', 'eventbridge', 'step_functions', 'mq', 'appsync', 'kinesis', 'msk'],
    Management: ['cloudwatch', 'cloudformation', 'cloudtrail', 'config', 'systems_manager', 'organizations', 'control_tower', 'service_catalog', 'trusted_advisor'],
    AI_ML: ['sagemaker', 'comprehend', 'rekognition', 'lex', 'polly', 'textract', 'translate', 'bedrock'],
    Container: ['ecr', 'ecs', 'eks', 'fargate'],
};

/**
 * 최적화 규칙 정의
 * 각 규칙은 condition 함수와 메타데이터로 구성
 */
const OPTIMIZATION_RULES = [
    {
        id: 'single-az',
        title: '단일 AZ 구성 감지',
        description: '다중 AZ(Multi-AZ) 구성을 사용하면 고가용성을 확보할 수 있습니다. RDS, ElastiCache 등 상태 보존 서비스에 특히 권장됩니다.',
        severity: 'warning',
        check: (analysis) => {
            const hasDB = analysis.services.some((s) =>
                matchCategory(s.shapeName, 'Database')
            );
            const hasMultiAZ = analysis.services.some((s) =>
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
        check: (analysis) => {
            const hasS3 = analysis.services.some((s) => matchService(s.shapeName, 's3'));
            const hasCF = analysis.services.some((s) => matchService(s.shapeName, 'cloudfront'));
            return hasS3 && !hasCF;
        },
    },
    {
        id: 'no-waf',
        title: 'WAF 미적용',
        description: 'API Gateway나 ALB 앞에 AWS WAF를 배치하면 SQL 인젝션, XSS 등 일반적인 웹 공격을 차단할 수 있습니다.',
        severity: 'warning',
        check: (analysis) => {
            const hasPublicEndpoint = analysis.services.some((s) =>
                matchService(s.shapeName, 'api_gateway') || matchService(s.shapeName, 'alb') || matchService(s.shapeName, 'elb')
            );
            const hasWAF = analysis.services.some((s) => matchService(s.shapeName, 'waf'));
            return hasPublicEndpoint && !hasWAF;
        },
    },
    {
        id: 'no-monitoring',
        title: '모니터링 서비스 누락',
        description: 'CloudWatch를 통한 메트릭 수집, 알람 설정, 로그 분석은 운영 안정성의 기본입니다. CloudTrail과 함께 사용하면 감사 추적도 가능합니다.',
        severity: 'warning',
        check: (analysis) => {
            const hasCW = analysis.services.some((s) => matchService(s.shapeName, 'cloudwatch'));
            return analysis.services.length > 2 && !hasCW;
        },
    },
    {
        id: 'direct-ec2-exposure',
        title: 'EC2 직접 노출 가능성',
        description: 'EC2 인스턴스를 ALB/NLB 뒤에 배치하면 트래픽 분산, 헬스 체크, SSL 종료 등 이점을 얻을 수 있습니다.',
        severity: 'error',
        check: (analysis) => {
            const hasEC2 = analysis.services.some((s) => matchService(s.shapeName, 'ec2'));
            const hasLB = analysis.services.some((s) =>
                matchService(s.shapeName, 'alb') || matchService(s.shapeName, 'nlb') || matchService(s.shapeName, 'elb')
            );
            return hasEC2 && !hasLB;
        },
    },
    {
        id: 'no-nat',
        title: 'NAT Gateway 미구성',
        description: 'Private Subnet의 리소스가 인터넷에 접근해야 할 경우 NAT Gateway가 필요합니다. 보안상 Direct Internet Gateway 연결은 지양해야 합니다.',
        severity: 'info',
        check: (analysis) => {
            const hasVPC = analysis.services.some((s) => matchService(s.shapeName, 'vpc'));
            const hasNAT = analysis.services.some((s) => matchService(s.shapeName, 'nat_gateway'));
            return hasVPC && !hasNAT;
        },
    },
    {
        id: 'no-iam',
        title: 'IAM 정책 미표시',
        description: '아키텍처 다이어그램에 IAM 역할/정책을 명시하면 보안 검토 시 서비스 간 권한 흐름을 빠르게 파악할 수 있습니다.',
        severity: 'info',
        check: (analysis) => {
            const hasIAM = analysis.services.some((s) => matchService(s.shapeName, 'iam'));
            return analysis.services.length > 3 && !hasIAM;
        },
    },
    {
        id: 'good-ha',
        title: '고가용성 구성 확인됨',
        description: '로드 밸런서와 다중 컴퓨팅 리소스가 감지되었습니다. 고가용성 아키텍처의 기본 요건을 충족합니다.',
        severity: 'success',
        check: (analysis) => {
            const hasLB = analysis.services.some((s) =>
                matchService(s.shapeName, 'alb') || matchService(s.shapeName, 'nlb') || matchService(s.shapeName, 'elb')
            );
            const hasCompute = analysis.services.some((s) =>
                matchCategory(s.shapeName, 'Compute')
            );
            return hasLB && hasCompute;
        },
    },
];

/**
 * 서비스명 매칭 헬퍼
 */
function matchService(shapeName, keyword) {
    if (!shapeName) return false;
    return shapeName.toLowerCase().includes(keyword.toLowerCase());
}

function matchCategory(shapeName, category) {
    if (!shapeName) return false;
    const keywords = AWS_CATEGORIES[category] || [];
    return keywords.some((kw) => shapeName.toLowerCase().includes(kw));
}

/**
 * shape 이름에서 AWS 서비스명 추출
 */
function extractServiceName(shapeName) {
    if (!shapeName) return 'Unknown';
    // mxgraph.aws4.xxx 형태에서 서비스명 추출
    const parts = shapeName.replace('mxgraph.aws4.', '').split('.');
    const raw = parts[parts.length - 1] || parts[0] || 'unknown';
    return raw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * shape 이름에서 카테고리 분류
 */
function classifyService(shapeName) {
    for (const [category, keywords] of Object.entries(AWS_CATEGORIES)) {
        if (keywords.some((kw) => shapeName.toLowerCase().includes(kw))) {
            return category;
        }
    }
    return 'Other';
}

/**
 * draw.io XML을 분석하여 AWS 아키텍처 메타데이터를 추출한다.
 * @param {string} xml - mxGraphModel XML
 * @returns {AnalysisResult}
 */
export function analyzeArchitecture(xml) {
    if (!xml) {
        return { services: [], connections: [], categories: {}, tips: [], summary: { totalServices: 0, totalConnections: 0 } };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // mxCell 요소 추출
    const cells = doc.querySelectorAll('mxCell');
    const services = [];
    const connections = [];
    const serviceMap = new Map(); // id → service 매핑

    for (const cell of cells) {
        const id = cell.getAttribute('id');
        const style = cell.getAttribute('style') || '';
        const value = cell.getAttribute('value') || '';
        const source = cell.getAttribute('source');
        const target = cell.getAttribute('target');

        // AWS 서비스 노드 식별 (shape=mxgraph.aws4.*)
        if (style.includes('mxgraph.aws4') || style.includes('aws4.')) {
            const shapeMatch = style.match(/shape=([^;]+)/);
            const shapeName = shapeMatch ? shapeMatch[1] : '';
            // HTML 태그 제거하여 라벨 추출
            const label = value.replace(/<[^>]*>/g, '').trim();

            const service = {
                id,
                shapeName,
                serviceName: extractServiceName(shapeName),
                label: label || extractServiceName(shapeName),
                category: classifyService(shapeName),
            };
            services.push(service);
            serviceMap.set(id, service);
        }
        // 일반 노드 (그룹, VPC 등)
        else if (id && id !== '0' && id !== '1' && !source && !target && value) {
            const label = value.replace(/<[^>]*>/g, '').trim();
            if (label) {
                serviceMap.set(id, { id, shapeName: '', serviceName: label, label, category: 'Other' });
            }
        }

        // 연결(Edge) 식별
        if (source && target) {
            connections.push({ source, target });
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
    const analysisData = { services, connections: readableConnections, categories };
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
        tips,
        summary: {
            totalServices: services.length,
            totalConnections: readableConnections.length,
        },
    };
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
