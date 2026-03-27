// src/core/aws-service-catalog.js — AWS 서비스 카탈로그 통합 모듈
//
// aws-analyzer.js의 AWS_CATEGORIES와 aws-architecture-builder.js의
// SERVICE_PATTERNS/SERVICE_LABELS를 단일 소스로 통합한다.

/**
 * AWS 서비스 카테고리 매핑
 * draw.io aws4 라이브러리의 shape 이름을 기준으로 분류
 */
export const AWS_CATEGORIES = {
    Compute: ['ec2', 'lambda', 'ecs', 'eks', 'fargate', 'batch', 'lightsail', 'elastic_beanstalk', 'outposts', 'app_runner'],
    Networking: ['vpc', 'cloudfront', 'route53', 'api_gateway', 'elb', 'alb', 'nlb', 'direct_connect', 'transit_gateway', 'nat_gateway', 'internet_gateway', 'endpoint', 'global_accelerator'],
    Storage: ['s3', 'ebs', 'efs', 'fsx', 'glacier', 'storage_gateway', 'backup'],
    Database: ['rds', 'dynamodb', 'aurora', 'elasticache', 'redshift', 'neptune', 'documentdb', 'keyspaces', 'timestream', 'memorydb'],
    Security: ['iam', 'cognito', 'waf', 'shield', 'kms', 'secrets_manager', 'certificate_manager', 'guardduty', 'inspector', 'macie', 'security_hub', 'firewall_manager'],
    Integration: ['sqs', 'sns', 'eventbridge', 'step_functions', 'mq', 'appsync', 'kinesis', 'msk'],
    Management: ['cloudwatch', 'cloudformation', 'cloudtrail', 'config', 'systems_manager', 'organizations', 'control_tower', 'service_catalog', 'trusted_advisor'],
    AI_ML: ['sagemaker', 'comprehend', 'rekognition', 'lex', 'polly', 'textract', 'translate', 'bedrock'],
    Container: ['ecr', 'ecs', 'eks', 'fargate'],
    Developer_Tools: ['codepipeline', 'codebuild', 'codecommit', 'codedeploy'],
};

/**
 * DrawIO 스타일 기반 서비스 패턴 매핑
 * @type {Array<{type: string, tier: string, pattern: RegExp}>}
 */
export const SERVICE_PATTERNS = [
    { type: 'users', tier: 'external', pattern: /shape=mxgraph\.aws4\.users/ },
    { type: 'route_53', tier: 'edge', pattern: /resIcon=mxgraph\.aws4\.route_53/ },
    { type: 'cloudfront', tier: 'edge', pattern: /resIcon=mxgraph\.aws4\.cloudfront/ },
    { type: 'waf', tier: 'security', pattern: /resIcon=mxgraph\.aws4\.waf/ },
    { type: 'shield', tier: 'security', pattern: /resIcon=mxgraph\.aws4\.shield/ },
    { type: 'acm', tier: 'security', pattern: /resIcon=mxgraph\.aws4\.certificate_manager/ },
    { type: 'igw', tier: 'public', pattern: /shape=mxgraph\.aws4\.internet_gateway/ },
    { type: 'nat', tier: 'public', pattern: /shape=mxgraph\.aws4\.nat_gateway/ },
    { type: 'alb', tier: 'public', pattern: /shape=mxgraph\.aws4\.application_load_balancer|resIcon=mxgraph\.aws4\.elastic_load_balancing/ },
    { type: 'ec2', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.ec2/ },
    { type: 'fargate', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.fargate/ },
    { type: 'ecs', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.ecs/ },
    { type: 'lambda', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.lambda/ },
    { type: 'ecr', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.ecr/ },
    { type: 'codepipeline', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.codepipeline/ },
    { type: 'codebuild', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.codebuild/ },
    { type: 'codecommit', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.codecommit/ },
    { type: 'codedeploy', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.codedeploy/ },
    { type: 'api_gateway', tier: 'public', pattern: /resIcon=mxgraph\.aws4\.api_gateway/ },
    { type: 'kinesis', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.kinesis/ },
    { type: 'step_functions', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.step_functions/ },
    { type: 'eventbridge', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.eventbridge/ },
    { type: 'secrets_manager', tier: 'security', pattern: /resIcon=mxgraph\.aws4\.secrets_manager/ },
    { type: 'kms', tier: 'security', pattern: /resIcon=mxgraph\.aws4\.key_management_service/ },
    { type: 'redshift', tier: 'db', pattern: /resIcon=mxgraph\.aws4\.redshift/ },
    { type: 'sagemaker', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.sagemaker/ },
    { type: 'bedrock', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.bedrock/ },
    { type: 'rds', tier: 'db', pattern: /resIcon=mxgraph\.aws4\.rds|shape=mxgraph\.aws4\.rds_instance_alt/ },
    { type: 'aurora', tier: 'db', pattern: /resIcon=mxgraph\.aws4\.aurora/ },
    { type: 'elasticache', tier: 'db', pattern: /resIcon=mxgraph\.aws4\.elasticache|shape=mxgraph\.aws4\.cache_node/ },
    { type: 'dynamodb', tier: 'db', pattern: /resIcon=mxgraph\.aws4\.dynamodb/ },
    { type: 'cloudwatch', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.cloudwatch/ },
    { type: 'cloudtrail', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.cloudtrail/ },
    { type: 's3', tier: 'storage', pattern: /resIcon=mxgraph\.aws4\.s3/ },
    { type: 'sns', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.sns/ },
    { type: 'sqs', tier: 'mgmt', pattern: /resIcon=mxgraph\.aws4\.sqs/ },
    { type: 'tgw', tier: 'public', pattern: /resIcon=mxgraph\.aws4\.transit_gateway/ },
    { type: 'group_cloud', tier: 'group', pattern: /grIcon=mxgraph\.aws4\.group_aws_cloud/ },
    { type: 'group_vpc', tier: 'group', pattern: /grIcon=mxgraph\.aws4\.group_vpc/ },
    { type: 'group_asg', tier: 'group', pattern: /group_auto_scaling_group|groupCenter/ },
    { type: 'group_eks', tier: 'group', pattern: /grIcon=mxgraph\.aws4\.group_eks/ },
];

/**
 * 서비스 타입별 기본 표시 라벨
 */
export const SERVICE_LABELS = {
    users: 'Users', route_53: 'Route 53', cloudfront: 'CloudFront',
    waf: 'AWS WAF', shield: 'AWS Shield', acm: 'ACM',
    igw: 'Internet Gateway', nat: 'NAT Gateway', alb: 'ALB',
    ec2: 'EC2', ecs: 'ECS', fargate: 'Fargate', lambda: 'Lambda',
    ecr: 'ECR', api_gateway: 'API Gateway',
    codepipeline: 'CodePipeline', codebuild: 'CodeBuild',
    codecommit: 'CodeCommit', codedeploy: 'CodeDeploy',
    rds: 'RDS', aurora: 'Aurora', elasticache: 'ElastiCache', dynamodb: 'DynamoDB',
    redshift: 'Redshift',
    cloudwatch: 'CloudWatch', cloudtrail: 'CloudTrail', s3: 'S3', sns: 'SNS', sqs: 'SQS',
    tgw: 'Transit Gateway',
    kinesis: 'Kinesis', step_functions: 'Step Functions', eventbridge: 'EventBridge',
    secrets_manager: 'Secrets Manager', kms: 'KMS',
    sagemaker: 'SageMaker', bedrock: 'Bedrock',
};


// ---------------------------------------------------------
// 역방향 조회 맵: type → category (빠른 조회용)
// ---------------------------------------------------------
const _typeToCategoryMap = {};
for (const [category, types] of Object.entries(AWS_CATEGORIES)) {
    for (const type of types) {
        // 첫 번째 매칭 카테고리를 우선 (중복 타입 존재: ecs, eks, fargate)
        if (!_typeToCategoryMap[type]) {
            _typeToCategoryMap[type] = category;
        }
    }
}

/**
 * 서비스 타입명으로 카테고리를 조회한다.
 * @param {string} type - 서비스 타입 식별자 (예: 'ec2', 'lambda')
 * @returns {string} 카테고리명 (매칭 없으면 'Other')
 */
export function getCategoryByType(type) {
    if (!type) return 'Other';
    return _typeToCategoryMap[type.toLowerCase()] || 'Other';
}

/**
 * DrawIO 스타일 문자열로 서비스를 식별한다.
 * @param {string} style - mxCell의 style 속성값
 * @returns {{type: string, tier: string, pattern: RegExp, category: string, label: string} | null}
 */
export function identifyServiceByStyle(style) {
    if (!style) return null;
    for (const entry of SERVICE_PATTERNS) {
        if (entry.pattern.test(style)) {
            return {
                type: entry.type,
                tier: entry.tier,
                pattern: entry.pattern,
                category: getCategoryByType(entry.type),
                label: SERVICE_LABELS[entry.type] || entry.type,
            };
        }
    }
    return null;
}

/**
 * 서비스 타입명으로 기본 라벨을 반환한다.
 * @param {string} type - 서비스 타입 식별자
 * @returns {string} 표시 라벨 (매칭 없으면 type 그대로 반환)
 */
export function getLabelByType(type) {
    if (!type) return '';
    return SERVICE_LABELS[type] || type;
}

/**
 * AI 시스템 프롬프트에 포함할 수 있도록 전체 서비스 목록을 JSON 배열로 반환한다.
 * @returns {Array<{type: string, tier: string, category: string, label: string}>}
 */
export function getAllServicesAsJSON() {
    return SERVICE_PATTERNS
        .filter(entry => entry.tier !== 'group')
        .map(entry => ({
            type: entry.type,
            tier: entry.tier,
            category: getCategoryByType(entry.type),
            label: SERVICE_LABELS[entry.type] || entry.type,
        }));
}

/**
 * 특정 카테고리에 속하는 서비스 목록을 반환한다.
 * @param {string} category - 카테고리명 (예: 'Compute', 'Database')
 * @returns {Array<{type: string, tier: string, category: string, label: string}>}
 */
export function getServicesByCategory(category) {
    if (!category || !AWS_CATEGORIES[category]) return [];
    const typesInCategory = AWS_CATEGORIES[category];
    return SERVICE_PATTERNS
        .filter(entry => typesInCategory.includes(entry.type))
        .map(entry => ({
            type: entry.type,
            tier: entry.tier,
            category,
            label: SERVICE_LABELS[entry.type] || entry.type,
        }));
}


// ---------------------------------------------------------
// Service Style 매핑: type → 완전한 drawio mxCell 스타일 문자열
// SERVICE_PATTERNS에서 tier !== 'group'인 항목들에 대한 스타일
// ---------------------------------------------------------

const SERVICE_STYLES = {
    users: 'sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#232F3D;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.users;',
    route_53: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;',
    cloudfront: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;',
    waf: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F54749;gradientDirection=north;fillColor=#C7131F;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf;',
    shield: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F54749;gradientDirection=north;fillColor=#C7131F;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.shield;',
    acm: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F54749;gradientDirection=north;fillColor=#C7131F;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.certificate_manager;',
    igw: 'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#8C4FFF;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.internet_gateway;',
    nat: 'outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#8C4FFF;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.nat_gateway;',
    alb: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;',
    api_gateway: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;',
    ec2: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;',
    ecs: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;',
    fargate: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.fargate;',
    ecr: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecr;',
    lambda: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;',
    codepipeline: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#3F8624;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.codepipeline;',
    codebuild: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#3F8624;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.codebuild;',
    codecommit: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#3F8624;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.codecommit;',
    codedeploy: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#3F8624;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.codedeploy;',
    rds: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#2E73B8;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;',
    aurora: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#2E73B8;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.aurora;',
    elasticache: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#2E73B8;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticache;',
    dynamodb: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#2E73B8;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;',
    cloudwatch: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F34482;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch;',
    cloudtrail: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F34482;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudtrail;',
    s3: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#60A337;gradientDirection=north;fillColor=#277116;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;',
    sns: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#FF4F8B;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;',
    sqs: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#FF4F8B;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;',
    kinesis: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.kinesis;',
    step_functions: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#FF4F8B;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.step_functions;',
    eventbridge: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#FF4F8B;gradientDirection=north;fillColor=#BC1356;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eventbridge;',
    secrets_manager: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F54749;gradientDirection=north;fillColor=#C7131F;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.secrets_manager;',
    kms: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F54749;gradientDirection=north;fillColor=#C7131F;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.key_management_service;',
    redshift: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#2E73B8;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.redshift;',
    sagemaker: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#1A7B30;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sagemaker;',
    bedrock: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4AB29A;gradientDirection=north;fillColor=#1A7B30;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.bedrock;',
    tgw: 'sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#945DF2;gradientDirection=north;fillColor=#5A30B5;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.transit_gateway;',
};

// ---------------------------------------------------------
// Group Style 매핑: groupType → 완전한 drawio 컨테이너 스타일 문자열
// 디자인 문서의 Group Style 매핑 테이블 기반
// ---------------------------------------------------------

const GROUP_STYLES = {
    aws_cloud: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#232F3E;dashed=0;',
    vpc: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#AAB7B8;dashed=0;',
    az: 'fillColor=none;strokeColor=#147EBA;dashed=1;verticalAlign=top;fontStyle=0;fontColor=#147EBA;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;',
    subnet_public: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#7AA116;fillColor=#F2F6E8;verticalAlign=top;align=left;spacingLeft=30;fontColor=#7AA116;dashed=0;',
    subnet_private: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#00A4A6;fillColor=#E6F6F7;verticalAlign=top;align=left;spacingLeft=30;fontColor=#00A4A6;dashed=0;',
    asg: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;grStroke=1;strokeColor=#D86613;fillColor=none;verticalAlign=top;align=center;fontColor=#D86613;dashed=1;spacingTop=25;',
    eks_cluster: 'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_eks;strokeColor=#D05C17;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#D05C17;dashed=0;',
};

// ---------------------------------------------------------
// 새 함수: getServiceStyle, getGroupStyle, getServiceDimensions
// ---------------------------------------------------------

/**
 * 서비스 타입에 대한 완전한 drawio mxCell 스타일 문자열 반환
 * @param {string} type - 서비스 타입 (예: 'ec2', 'lambda')
 * @returns {string|null} drawio 스타일 문자열, 미등록 시 null
 */
export function getServiceStyle(type) {
    if (!type) return null;
    return SERVICE_STYLES[type] || null;
}

/**
 * 그룹 타입에 대한 drawio 컨테이너 스타일 문자열 반환
 * @param {string} type - 그룹 타입 ('vpc', 'subnet_public', 'subnet_private', 'az', 'asg', 'aws_cloud')
 * @returns {string|null} drawio 컨테이너 스타일 문자열, 미등록 시 null
 */
export function getGroupStyle(type) {
    if (!type) return null;
    return GROUP_STYLES[type] || null;
}

/**
 * 서비스 타입의 기본 아이콘 크기 반환
 * @param {string} type - 서비스 타입
 * @returns {{width: number, height: number}|null} 기본 78×78, 미등록 시 null
 */
export function getServiceDimensions(type) {
    if (!type) return null;
    if (SERVICE_STYLES[type]) {
        return { width: 78, height: 78 };
    }
    return null;
}
