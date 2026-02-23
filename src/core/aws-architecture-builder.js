// src/core/aws-architecture-builder.js
// AWS 모범사례 기반 아키텍처 XML 재생성 엔진
//
// 레이아웃 1 (buildAwsStandardLayout) — 계층 정렬:
//   AWS Cloud 상단에 Route53/CloudFront/WAF 가로 배치
//   VPC 내부에 AZ-A(좌) / AZ-B(우), 서브넷 위→아래 적층
//
// 레이아웃 2 (buildAwsLeftRightLayout) — 좌→우 흐름:
//   AWS Cloud 좌측에 Route53/CloudFront/WAF 세로 배치
//   VPC 내부에 AZ-A(위 행) / AZ-B(아래 행), 각 행에서 서브넷 좌→우 나열

// ---------------------------------------------------------
// 서비스 분류 매핑 (style/shape 속성 기반)
// ---------------------------------------------------------
const SERVICE_PATTERNS = [
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
    { type: 'ecs', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.ecs/ },
    { type: 'lambda', tier: 'web', pattern: /resIcon=mxgraph\.aws4\.lambda/ },
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
];

const SERVICE_LABELS = {
    users: 'Users', route_53: 'Route 53', cloudfront: 'CloudFront',
    waf: 'AWS WAF', shield: 'AWS Shield', acm: 'ACM',
    igw: 'Internet Gateway', nat: 'NAT Gateway', alb: 'ALB',
    ec2: 'EC2', ecs: 'ECS', lambda: 'Lambda',
    rds: 'RDS', aurora: 'Aurora', elasticache: 'ElastiCache', dynamodb: 'DynamoDB',
    cloudwatch: 'CloudWatch', cloudtrail: 'CloudTrail', s3: 'S3', sns: 'SNS', sqs: 'SQS',
    tgw: 'Transit Gateway',
};

// ---------------------------------------------------------
// XML 파서
// ---------------------------------------------------------
function parseXml(xmlString) {
    return new DOMParser().parseFromString(xmlString, 'text/xml');
}

/**
 * draw.io XML에서 서비스 노드를 추출·분류한다.
 * @param {string} xml
 * @returns {object}
 */
export function analyzeXmlServices(xml) {
    console.log('[Builder] analyzeXmlServices — xml 길이:', xml?.length);

    if (!xml || xml.trim() === '') {
        console.warn('[Builder] XML이 비어 있습니다.');
        return { external: [], edge: [], security: [], public: [], web: [], db: [], storage: [], mgmt: [], unknown: [] };
    }

    const doc = parseXml(xml);
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('draw.io XML 파싱 실패. 유효한 .drawio 파일인지 확인해주세요.');

    const cells = Array.from(doc.querySelectorAll('mxCell'));
    console.log('[Builder] 전체 mxCell 수:', cells.length);

    const services = { external: [], edge: [], security: [], public: [], web: [], db: [], storage: [], mgmt: [], unknown: [] };

    for (const cell of cells) {
        const id = cell.getAttribute('id');
        if (id === '0' || id === '1') continue;
        const style = cell.getAttribute('style') || '';
        const value = cell.getAttribute('value') || '';
        if (cell.getAttribute('edge') === '1') continue;
        if (style.includes('container=1')) continue;
        if (cell.getAttribute('vertex') !== '1') continue;

        let matched = false;
        for (const p of SERVICE_PATTERNS) {
            if (p.tier === 'group') continue;
            if (p.pattern.test(style)) {
                const label = value || SERVICE_LABELS[p.type] || p.type;
                services[p.tier].push({ id, type: p.type, style, label, originalValue: value });
                console.log(`[Builder] 감지: ${p.type} (${p.tier}) — "${label}"`);
                matched = true;
                break;
            }
        }
        if (!matched) {
            services.unknown.push({ id, type: 'unknown', style, label: value });
        }
    }

    console.log('[Builder] 분류 결과:', Object.fromEntries(Object.entries(services).map(([k, v]) => [k, v.length])));
    return services;
}

// ---------------------------------------------------------
// 공통 유틸리티
// ---------------------------------------------------------
function uid() {
    return Math.random().toString(36).slice(2, 11) + '-' + Math.random().toString(36).slice(2, 11);
}

const STYLES = {
    awsCloud: `points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#232F3E;dashed=0;`,
    vpc: `points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#AAB7B8;dashed=0;`,
    publicSubnet: `points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#7AA116;fillColor=#F2F6E8;verticalAlign=top;align=left;spacingLeft=30;fontColor=#248814;dashed=0;`,
    privateSubnet: `points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#00A4A6;fillColor=#E6F6F7;verticalAlign=top;align=left;spacingLeft=30;fontColor=#147EBA;dashed=0;`,
    asg: `points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;grStroke=1;strokeColor=#D86613;fillColor=none;verticalAlign=top;align=center;fontColor=#D86613;dashed=1;spacingTop=25;`,
    az: `fillColor=none;strokeColor=#147EBA;dashed=1;verticalAlign=top;fontStyle=1;fontColor=#147EBA;html=1;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;`,
};

function makeCell({ id, style, value = '', parent, x, y, width, height }) {
    const geo = `<mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />`;
    return `<mxCell id="${id}" value="${escXml(value)}" style="${style}" parent="${parent}" vertex="1">${geo}</mxCell>`;
}

function escXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapXml(cells) {
    return `<mxfile>
  <diagram name="AWS Architecture">
    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

// 상수
const CLOUD_X = 220, CLOUD_Y = 30, CLOUD_PAD = 30;
const ICON = 40, ICON_STRIDE = 70, EXT_X = 30;
const MIN_SW = 160;

function sortedEdgeSec(services) {
    return [
        ...services.edge.slice().sort((a, b) => {
            const o = ['route_53', 'cloudfront'];
            return (o.indexOf(a.type) === -1 ? 99 : o.indexOf(a.type)) -
                (o.indexOf(b.type) === -1 ? 99 : o.indexOf(b.type));
        }),
        ...services.security,
    ];
}

// =============================================================
// 레이아웃 1: 계층 정렬
//   - Edge/Security: AWS Cloud 상단 가로 배치
//   - AZ-A (좌) / AZ-B (우)
//   - 서브넷: 위→아래 (Public → Web → DB)
// =============================================================
/**
 * @param {object} services - analyzeXmlServices() 반환값
 * @returns {string}
 */
export function buildAwsStandardLayout(services) {
    const cells = [];

    const igwList = services.public.filter(s => s.type === 'igw');
    const natList = services.public.filter(s => s.type === 'nat');
    const albList = services.public.filter(s => s.type === 'alb');
    const webA = services.web.slice(0, Math.ceil(services.web.length / 2));
    const webB = services.web.slice(Math.ceil(services.web.length / 2));
    const dbA = services.db.slice(0, Math.ceil(services.db.length / 2));
    const dbB = services.db.slice(Math.ceil(services.db.length / 2));

    const pubMax = Math.max(igwList.length + natList.slice(0, 1).length + albList.length, 1);
    const webMax = Math.max(webA.length, webB.length, 1);
    const dbMax = Math.max(dbA.length, dbB.length, 1);

    const subPad = 20;
    const pubSubW = Math.max(MIN_SW, pubMax * ICON_STRIDE + subPad * 2);
    const webSubW = Math.max(MIN_SW, webMax * ICON_STRIDE + subPad * 2 + 20);
    const dbSubW = Math.max(MIN_SW, dbMax * ICON_STRIDE + subPad * 2);
    const azW = Math.max(pubSubW, webSubW, dbSubW) + subPad * 2;

    const publicH = 130;
    const privateWH = webMax > 0 ? 170 : 100;
    const privateDbH = 130;
    const subGapV = 20;

    const vpcH = 60 + publicH + subGapV + privateWH + subGapV + privateDbH + 30;
    const vpcW = 2 * azW + 20 + 60; // AZ gap 20, VPC pad 30*2

    const edgeSvcs = sortedEdgeSec(services);
    const edgeRowH = edgeSvcs.length > 0 ? ICON + 50 : 10;

    const cloudW = vpcW + CLOUD_PAD * 2;
    const cloudH = vpcH + edgeRowH + CLOUD_PAD * 2;
    const cloudX = CLOUD_X + (services.external.length > 0 ? ICON + 50 : 0);
    const cloudY = CLOUD_Y;

    const idCloud = uid(), idVpc = uid();
    const idAzA = uid(), idAzB = uid();
    const idPubA = uid(), idPubB = uid();
    const idWebA = uid(), idWebB = uid();
    const idDbA = uid(), idDbB = uid();
    const idAsgA = uid(), idAsgB = uid();

    // 1. Users (Cloud 외부)
    if (services.external.length > 0) {
        const s = services.external[0];
        cells.push(makeCell({
            id: uid(), style: s.style, value: s.label, parent: '1',
            x: EXT_X, y: cloudY + cloudH / 2 - ICON / 2, width: ICON, height: ICON
        }));
    }

    // 2. AWS Cloud
    cells.push(makeCell({
        id: idCloud, style: STYLES.awsCloud, value: 'AWS Cloud', parent: '1',
        x: cloudX, y: cloudY, width: cloudW, height: cloudH
    }));

    // 3. Edge/Security: 상단 가로 배치
    let ex = CLOUD_PAD + 10;
    for (const s of edgeSvcs) {
        cells.push(makeCell({
            id: uid(), style: s.style, value: s.label, parent: idCloud,
            x: ex, y: CLOUD_PAD + 8, width: ICON, height: ICON
        }));
        ex += ICON + 40;
    }

    // 4. Management/Storage: Cloud 하단 우측
    const mgmt = [...services.mgmt, ...services.storage];
    let mx = cloudW - CLOUD_PAD - ICON - 10;
    for (let i = mgmt.length - 1; i >= 0; i--) {
        const s = mgmt[i];
        cells.push(makeCell({
            id: uid(), style: s.style, value: s.label, parent: idCloud,
            x: mx, y: cloudH - CLOUD_PAD - ICON - 10, width: ICON, height: ICON
        }));
        mx -= ICON + 40;
    }

    // 5. VPC (Edge 행 아래)
    const vpcX = CLOUD_PAD;
    const vpcY = CLOUD_PAD + edgeRowH;
    cells.push(makeCell({
        id: idVpc, style: STYLES.vpc, value: 'VPC', parent: idCloud,
        x: vpcX, y: vpcY, width: vpcW, height: vpcH
    }));

    // 6. AZ 컨테이너 (좌우)
    const VPC_PAD = 30;
    const AZ_GAP = 20;
    const azH = vpcH - VPC_PAD - 50 - 20; // 위 50, 아래 20
    cells.push(makeCell({
        id: idAzA, style: STYLES.az, value: 'Availability Zone A', parent: idVpc,
        x: VPC_PAD, y: 50, width: azW, height: azH
    }));
    cells.push(makeCell({
        id: idAzB, style: STYLES.az, value: 'Availability Zone B', parent: idVpc,
        x: VPC_PAD + azW + AZ_GAP, y: 50, width: azW, height: azH
    }));

    // 7. 서브넷 + 아이콘 배치 헬퍼 (위→아래)
    function placeVertical(azId, pubSvcs, webSvcs, dbSvcs) {
        const sw = azW - subPad * 2;
        const sy = subPad;

        // Public Subnet
        const pubId = azId === idAzA ? idPubA : idPubB;
        cells.push(makeCell({
            id: pubId, style: STYLES.publicSubnet, value: 'Public Subnet',
            parent: azId, x: subPad, y: sy, width: sw, height: publicH
        }));
        let px = subPad + 10;
        for (const s of pubSvcs) {
            cells.push(makeCell({
                id: uid(), style: s.style, value: s.label, parent: pubId,
                x: px, y: 50, width: ICON, height: ICON
            }));
            px += ICON_STRIDE;
        }

        // Private Web Subnet (ASG)
        const webId = azId === idAzA ? idWebA : idWebB;
        const asgId = azId === idAzA ? idAsgA : idAsgB;
        const wyOff = publicH + subGapV;
        cells.push(makeCell({
            id: webId, style: STYLES.privateSubnet, value: 'Private Subnet (Web)',
            parent: azId, x: subPad, y: wyOff, width: sw, height: privateWH
        }));
        const asgPad = 15;
        const asgW = sw - asgPad * 2;
        const asgH = privateWH - asgPad - 30;
        cells.push(makeCell({
            id: asgId, style: STYLES.asg, value: 'Auto Scaling Group',
            parent: webId, x: asgPad, y: 30, width: asgW, height: asgH
        }));
        if (webSvcs.length > 0) {
            const tw = webSvcs.length * ICON_STRIDE - 30;
            let wx = Math.max(asgPad + 8, (asgW - tw) / 2);
            for (const s of webSvcs) {
                cells.push(makeCell({
                    id: uid(), style: s.style, value: s.label, parent: asgId,
                    x: wx, y: 30, width: ICON, height: ICON
                }));
                wx += ICON_STRIDE;
            }
        }

        // Private DB Subnet
        const dbId = azId === idAzA ? idDbA : idDbB;
        const dyOff = wyOff + privateWH + subGapV;
        cells.push(makeCell({
            id: dbId, style: STYLES.privateSubnet, value: 'Private Subnet (DB)',
            parent: azId, x: subPad, y: dyOff, width: sw, height: privateDbH
        }));
        const finalDb = dbSvcs.length > 0 ? dbSvcs :
            (dbA.length > 0 ? [{ ...dbA[0], label: (dbA[0].label || 'RDS') + '\n(Replica)' }] : []);
        const td = finalDb.length * ICON_STRIDE - 30;
        let dx = Math.max(subPad, (sw - td) / 2);
        for (const s of finalDb) {
            cells.push(makeCell({
                id: uid(), style: s.style, value: s.label, parent: dbId,
                x: dx, y: 40, width: ICON, height: ICON
            }));
            dx += ICON_STRIDE;
        }
    }

    placeVertical(idAzA,
        [...igwList, ...natList.slice(0, 1), ...albList],
        webA,
        dbA.map((s, i) => ({ ...s, label: (s.label || 'RDS') + (i === 0 ? '\n(Primary)' : '') }))
    );
    const pubBSvcs = natList.length > 1 ? [natList[1]] : (natList[0] ? [{ ...natList[0], label: 'NAT Gateway' }] : []);
    const webBSvcs = webB.length > 0 ? webB : (webA[0] ? [{ ...webA[0], label: 'EC2' }] : []);
    placeVertical(idAzB, pubBSvcs, webBSvcs, dbB);

    return wrapXml(cells);
}

// =============================================================
// 레이아웃 2: 좌→우 흐름 정렬
//   - Edge/Security: AWS Cloud 좌측 세로 열
//   - AZ-A (위 행) / AZ-B (아래 행)
//   - 각 행: Public Subnet | Private Web Subnet | Private DB Subnet (좌→우)
// =============================================================
/**
 * @param {object} services - analyzeXmlServices() 반환값
 * @returns {string}
 */
export function buildAwsLeftRightLayout(services) {
    const cells = [];

    const igwList = services.public.filter(s => s.type === 'igw');
    const natList = services.public.filter(s => s.type === 'nat');
    const albList = services.public.filter(s => s.type === 'alb');
    const webA = services.web.slice(0, Math.ceil(services.web.length / 2));
    const webB = services.web.slice(Math.ceil(services.web.length / 2));
    const dbA = services.db.slice(0, Math.ceil(services.db.length / 2));
    const dbB = services.db.slice(Math.ceil(services.db.length / 2));

    const pubMax = Math.max(igwList.length + natList.slice(0, 1).length + albList.length, 1);
    const webMax = Math.max(webA.length, webB.length, 1);
    const dbMax = Math.max(dbA.length, dbB.length, 1);

    const SUB_PAD = 12;
    const SUB_GAP = 16;
    const AZ_PAD = 12;
    const AZ_GAP_V = 20;

    const pubSubW = Math.max(MIN_SW, pubMax * ICON_STRIDE + SUB_PAD * 2);
    const webSubW = Math.max(MIN_SW, webMax * ICON_STRIDE + SUB_PAD * 2 + 20);
    const dbSubW = Math.max(MIN_SW, dbMax * ICON_STRIDE + SUB_PAD * 2);

    const subH = 140;     // Public/DB 서브넷 높이
    const webH = 170;     // Web 서브넷 높이 (ASG 포함)
    const azSubH = Math.max(subH, webH);  // 서브넷 높이 기준

    // AZ 크기
    const AZ_LABEL = 26;
    const azInnerH = AZ_LABEL + azSubH + AZ_PAD * 2;
    const azInnerW = AZ_PAD + pubSubW + SUB_GAP + webSubW + SUB_GAP + dbSubW + AZ_PAD;

    const VPC_PAD = 30;
    const vpcW = azInnerW + VPC_PAD * 2;
    const vpcH = VPC_PAD + azInnerH + AZ_GAP_V + azInnerH + 20;

    const edgeSvcs = sortedEdgeSec(services);
    const EDGE_STRIDE = ICON + 35;
    const edgeColW = edgeSvcs.length > 0 ? ICON + 70 : 0;

    const cloudW = edgeColW + vpcW + CLOUD_PAD * 2;
    const cloudH = vpcH + CLOUD_PAD * 2;
    const cloudX = CLOUD_X + (services.external.length > 0 ? ICON + 50 : 0);
    const cloudY = CLOUD_Y;

    const idCloud = uid(), idVpc = uid();
    const idAzA = uid(), idAzB = uid();
    const idPubA = uid(), idPubB = uid();
    const idWebA = uid(), idWebB = uid();
    const idDbA = uid(), idDbB = uid();
    const idAsgA = uid(), idAsgB = uid();

    // 1. Users
    if (services.external.length > 0) {
        const s = services.external[0];
        cells.push(makeCell({
            id: uid(), style: s.style, value: s.label, parent: '1',
            x: EXT_X, y: cloudY + cloudH / 2 - ICON / 2, width: ICON, height: ICON
        }));
    }

    // 2. AWS Cloud
    cells.push(makeCell({
        id: idCloud, style: STYLES.awsCloud, value: 'AWS Cloud', parent: '1',
        x: cloudX, y: cloudY, width: cloudW, height: cloudH
    }));

    // 3. Edge/Security: 좌측 세로 열
    edgeSvcs.forEach((s, i) => {
        cells.push(makeCell({
            id: uid(), style: s.style, value: s.label, parent: idCloud,
            x: CLOUD_PAD + 10, y: CLOUD_PAD + 10 + i * EDGE_STRIDE, width: ICON, height: ICON
        }));
    });

    // 4. VPC
    const vpcX = CLOUD_PAD + edgeColW;
    const vpcY = CLOUD_PAD + 10;
    cells.push(makeCell({
        id: idVpc, style: STYLES.vpc, value: 'VPC', parent: idCloud,
        x: vpcX, y: vpcY, width: vpcW, height: vpcH
    }));

    // 5. AZ 컨테이너 (위/아래 행)
    const azAY = VPC_PAD;
    const azBY = VPC_PAD + azInnerH + AZ_GAP_V;
    cells.push(makeCell({
        id: idAzA, style: STYLES.az, value: 'Availability Zone A', parent: idVpc,
        x: VPC_PAD, y: azAY, width: azInnerW, height: azInnerH
    }));
    cells.push(makeCell({
        id: idAzB, style: STYLES.az, value: 'Availability Zone B', parent: idVpc,
        x: VPC_PAD, y: azBY, width: azInnerW, height: azInnerH
    }));

    // 6. 서브넷 + 아이콘 배치 헬퍼 (좌→우)
    function placeHorizontal(azId, pubSvcs, webSvcs, dbSvcs) {
        const iy = AZ_LABEL; // AZ 라벨 아래

        // Public Subnet
        const pubId = azId === idAzA ? idPubA : idPubB;
        cells.push(makeCell({
            id: pubId, style: STYLES.publicSubnet, value: 'Public Subnet',
            parent: azId, x: AZ_PAD, y: iy, width: pubSubW, height: azInnerH - AZ_LABEL - AZ_PAD
        }));
        let px = SUB_PAD;
        for (const s of pubSvcs) {
            cells.push(makeCell({
                id: uid(), style: s.style, value: s.label, parent: pubId,
                x: px, y: 42, width: ICON, height: ICON
            }));
            px += ICON_STRIDE;
        }

        // Private Web Subnet
        const webId = azId === idAzA ? idWebA : idWebB;
        const asgId = azId === idAzA ? idAsgA : idAsgB;
        const wx = AZ_PAD + pubSubW + SUB_GAP;
        cells.push(makeCell({
            id: webId, style: STYLES.privateSubnet, value: 'Private Subnet (Web)',
            parent: azId, x: wx, y: iy, width: webSubW, height: azInnerH - AZ_LABEL - AZ_PAD
        }));
        const asgP = 12;
        const asgW = webSubW - asgP * 2;
        const asgH = (azInnerH - AZ_LABEL - AZ_PAD) - asgP - 28;
        cells.push(makeCell({
            id: asgId, style: STYLES.asg, value: 'Auto Scaling Group',
            parent: webId, x: asgP, y: 28, width: asgW, height: asgH
        }));
        if (webSvcs.length > 0) {
            const tw = webSvcs.length * ICON_STRIDE - 30;
            let wix = Math.max(asgP + 8, (asgW - tw) / 2);
            for (const s of webSvcs) {
                cells.push(makeCell({
                    id: uid(), style: s.style, value: s.label, parent: asgId,
                    x: wix, y: 28, width: ICON, height: ICON
                }));
                wix += ICON_STRIDE;
            }
        }

        // Private DB Subnet
        const dbId = azId === idAzA ? idDbA : idDbB;
        const dx = AZ_PAD + pubSubW + SUB_GAP + webSubW + SUB_GAP;
        cells.push(makeCell({
            id: dbId, style: STYLES.privateSubnet, value: 'Private Subnet (DB)',
            parent: azId, x: dx, y: iy, width: dbSubW, height: azInnerH - AZ_LABEL - AZ_PAD
        }));
        const finalDb = dbSvcs.length > 0 ? dbSvcs :
            (dbA.length > 0 ? [{ ...dbA[0], label: (dbA[0].label || 'RDS') + '\n(Replica)' }] : []);
        const td = finalDb.length * ICON_STRIDE - 30;
        let dix = Math.max(SUB_PAD, (dbSubW - td) / 2);
        for (const s of finalDb) {
            cells.push(makeCell({
                id: uid(), style: s.style, value: s.label, parent: dbId,
                x: dix, y: 40, width: ICON, height: ICON
            }));
            dix += ICON_STRIDE;
        }
    }

    placeHorizontal(idAzA,
        [...igwList, ...natList.slice(0, 1), ...albList],
        webA,
        dbA.map((s, i) => ({ ...s, label: (s.label || 'RDS') + (i === 0 ? '\n(Primary)' : '') }))
    );
    const pubBSvcs = natList.length > 1 ? [natList[1]] : (natList[0] ? [{ ...natList[0], label: 'NAT Gateway' }] : []);
    const webBSvcs = webB.length > 0 ? webB : (webA[0] ? [{ ...webA[0], label: 'EC2' }] : []);
    placeHorizontal(idAzB, pubBSvcs, webBSvcs, dbB);

    return wrapXml(cells);
}
