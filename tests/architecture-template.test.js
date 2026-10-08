import { describe, expect, test } from 'vitest';
import { extractTemplate, sanitizeStyle } from '../src/core/architecture-template.js';
import { generateArchitecture } from '../src/core/architecture-generator.js';
import { getAllServicesAsJSON, getGroupStyle, getServiceStyle, identifyServiceByStyle } from '../src/core/aws-service-catalog.js';

const SERVICE_TYPES = getAllServicesAsJSON().map(s => s.type).filter(type => typeof getServiceStyle(type) === 'string');
const GROUP_TYPES = ['aws_cloud', 'vpc', 'az', 'subnet_public', 'subnet_private', 'asg', 'eks_cluster'];
const ICON_KEYS = ['shape', 'resIcon', 'grIcon'];

const valueOf = (style, key) => style.split(';').find(part => part.startsWith(`${key}=`))?.slice(key.length + 1);
const modelWith = (styles) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${styles.map((style, i) =>
    `<mxCell id="t${i}" value="x" style="${style}" vertex="1" parent="1"><mxGeometry x="${i * 100}" y="0" width="50" height="50" as="geometry"/></mxCell>`).join('')}</root></mxGraphModel>`;

describe('sanitizeStyle keeps the AWS glyph keys', () => {
    test('카탈로그가 지원하는 모든 서비스·그룹 스타일에서 shape/resIcon/grIcon 값이 그대로 남는다', () => {
        expect(SERVICE_TYPES.length).toBeGreaterThan(20);
        for (const type of [...SERVICE_TYPES, ...GROUP_TYPES]) {
            const original = getServiceStyle(type) ?? getGroupStyle(type);
            expect(typeof original, type).toBe('string');
            const clean = sanitizeStyle(original, { container: GROUP_TYPES.includes(type) });
            for (const key of ICON_KEYS) {
                if (valueOf(original, key) !== undefined) expect(valueOf(clean, key), `${type}.${key}`).toBe(valueOf(original, key));
            }
        }
    });

    test('정제 뒤에도 서비스 타입이 같게 인식된다', () => {
        for (const type of SERVICE_TYPES) {
            const original = getServiceStyle(type);
            expect(identifyServiceByStyle(sanitizeStyle(original))?.type, type).toBe(identifyServiceByStyle(original)?.type);
        }
    });

    test('shape=mxgraph.aws4.resourceIcon(camelCase)와 groupCenter를 허용한다', () => {
        expect(sanitizeStyle('shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;')).toContain('shape=mxgraph.aws4.resourceIcon');
        expect(sanitizeStyle('shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;')).toContain('shape=mxgraph.aws4.groupCenter');
    });

    test('안전하지 않은 shape·image·url 값은 계속 제거한다', () => {
        const hostile = [
            'shape=image;image=https://example.invalid/a.png;url=http://example.invalid',
            'shape=javascript:alert(1)',
            'shape=mxgraph.aws4.res<script>',
            'shape=mxgraph.aws4.;resIcon=mxgraph.aws4.',
            'shape=mxgraph.aws4.a b',
            'shape=mxgraph.azure.vm',
            'shape=stencil(abc);resIcon=mxgraph.aws4.ec2/../x',
            'shape=mxgraph.aws4.ec2;image=data:image/svg+xml,<svg/>',
        ];
        for (const style of hostile) {
            const clean = sanitizeStyle(style);
            expect(clean, style).not.toMatch(/image|url|javascript|script|azure|stencil|\.\.|<|data:/);
            expect(valueOf(clean, 'shape') ?? '', style).toMatch(/^(mxgraph\.aws4\.[A-Za-z0-9_]+)?$/);
        }
        expect(sanitizeStyle('shape=mxgraph.aws4.ec2;image=data:x')).toContain('shape=mxgraph.aws4.ec2');
    });
});

describe('템플릿 경로와 템플릿 없는 경로 모두 아이콘 도형을 유지한다', () => {
    test('템플릿에 카탈로그 스타일 그대로 있는 서비스는 모두 추출되고 shape가 유지된다', () => {
        const template = extractTemplate(modelWith(SERVICE_TYPES.map(type => getServiceStyle(type))));
        for (const type of SERVICE_TYPES) {
            const original = getServiceStyle(type);
            // 같은 스타일을 공유하는 타입은 패턴 순서상 앞 타입으로 인식될 수 있어 인식된 타입 기준으로 확인한다.
            const recognized = identifyServiceByStyle(original).type;
            expect(template.serviceStyles[recognized], `${type}->${recognized}`).toBeDefined();
            expect(valueOf(template.serviceStyles[recognized], 'shape'), type).toBe(valueOf(original, 'shape'));
        }
    });

    test('템플릿 그룹 shape(AWS 그룹, container=0 포함)도 추출되고 shape/grIcon이 유지된다', () => {
        const styles = ['aws_cloud', 'vpc', 'subnet_public', 'subnet_private', 'asg', 'eks_cluster']
            .map(type => getGroupStyle(type).replace('container=1', 'container=0'));
        const template = extractTemplate(modelWith(styles));
        for (const type of ['aws_cloud', 'vpc', 'subnet_public', 'subnet_private', 'asg', 'eks_cluster']) {
            const original = getGroupStyle(type);
            expect(template.groupStyles[type], type).toBeDefined();
            expect(valueOf(template.groupStyles[type], 'shape'), type).toBe(valueOf(original, 'shape'));
            expect(valueOf(template.groupStyles[type], 'grIcon'), type).toBe(valueOf(original, 'grIcon'));
            expect(valueOf(template.groupStyles[type], 'container'), type).toBe('1');
        }
    });

    test('생성한 XML의 모든 서비스·그룹 셀이 아이콘 도형(resourceIcon+resIcon 또는 group+grIcon)을 가진다 (템플릿 없음/있음)', () => {
        const input = {
            groups: GROUP_TYPES.map(type => ({ id: `g-${type}`, type, label: type })),
            services: SERVICE_TYPES.map(type => ({ id: `s-${type}`, type, label: type, group: null })),
            connections: [],
        };
        const withTemplate = modelWith([getServiceStyle('ec2').replace('#D05C17', '#123456')]);
        for (const templateXml of [undefined, withTemplate]) {
            const { xml } = generateArchitecture(input, { templateXml });
            const cells = [...new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('mxCell[vertex="1"]')];
            expect(cells).toHaveLength(input.groups.length + input.services.length);
            for (const cell of cells) {
                const style = cell.getAttribute('style');
                const isGroup = cell.getAttribute('id').startsWith('g-');
                const id = cell.getAttribute('id');
                const type = id.slice(2);
                const original = getServiceStyle(type) ?? getGroupStyle(type);
                // AZ는 카탈로그가 도형 없이 점선 사각형으로 정의한다. 나머지는 원본이 가진 도형 키가 모두 남아야 한다.
                for (const key of ICON_KEYS) {
                    if (valueOf(original, key) !== undefined) expect(valueOf(style, key), `${id}.${key}`).toBe(valueOf(original, key));
                }
                if (!isGroup) expect(valueOf(style, 'shape') ?? valueOf(style, 'resIcon'), id).toMatch(/^mxgraph\.aws4\./);
            }
        }
    });
});
