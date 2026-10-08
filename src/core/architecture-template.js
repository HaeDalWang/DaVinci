// src/core/architecture-template.js — 선택한 페이지에서 "표현"(스타일·크기)만 추출한다.
//
// 템플릿의 라벨·ID·좌표·연결은 읽지도, 반환하지도 않는다. 반환값은 타입별 안전한 스타일과 크기뿐이다.

import { getGroupStyle, getServiceStyle, identifyServiceByStyle } from './aws-service-catalog.js';

const MIN_ICON = 16;
const MAX_ICON = 300;

const COLOR = /^(#[0-9a-fA-F]{3,8}|none|default|inherit|swimlane)$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const FLAG = /^[01]$/;
const AWS_SHAPE = /^mxgraph\.aws4\.[A-Za-z0-9_]+$/; // resourceIcon, groupCenter 같은 camelCase 이름도 허용한다
const WORD = /^[A-Za-z0-9_ ,-]{1,60}$/;
const POINTS = /^\[[\d.,\[\]\- ]+\]$/;

/** 복사를 허용하는 style 키와 값 검증기. 목록에 없는 키(image, url 등)는 버린다. */
const ALLOWED = {
    shape: v => AWS_SHAPE.test(v), resIcon: v => AWS_SHAPE.test(v), grIcon: v => AWS_SHAPE.test(v),
    fillColor: v => COLOR.test(v), strokeColor: v => COLOR.test(v), gradientColor: v => COLOR.test(v),
    fontColor: v => COLOR.test(v), labelBackgroundColor: v => COLOR.test(v),
    gradientDirection: v => /^(north|south|east|west)$/.test(v),
    fontSize: v => NUMBER.test(v), fontStyle: v => NUMBER.test(v), strokeWidth: v => NUMBER.test(v),
    spacing: v => NUMBER.test(v), spacingLeft: v => NUMBER.test(v), spacingTop: v => NUMBER.test(v),
    spacingRight: v => NUMBER.test(v), spacingBottom: v => NUMBER.test(v), grStroke: v => FLAG.test(v),
    fontFamily: v => WORD.test(v),
    dashed: v => FLAG.test(v), sketch: v => FLAG.test(v), outlineConnect: v => FLAG.test(v),
    pointerEvents: v => FLAG.test(v), collapsible: v => FLAG.test(v), recursiveResize: v => FLAG.test(v),
    container: v => FLAG.test(v), aspect: v => /^(fixed|variable)$/.test(v), whiteSpace: v => v === 'wrap',
    verticalLabelPosition: v => /^(top|middle|bottom)$/.test(v), verticalAlign: v => /^(top|middle|bottom)$/.test(v),
    align: v => /^(left|center|right)$/.test(v), labelPosition: v => /^(left|center|right)$/.test(v),
    points: v => POINTS.test(v),
};

/**
 * style 문자열에서 허용된 AWS 표현 키만 남기고 라벨을 literal(html=0)로 고정한다.
 * @param {string} style
 * @param {{container?: boolean}} [options] - container=true면 container=1을 강제한다(그룹용)
 * @returns {string}
 */
export function sanitizeStyle(style, { container = false } = {}) {
    const kept = new Map();
    for (const part of String(style || '').split(';')) {
        const at = part.indexOf('=');
        if (at < 1) continue;
        const key = part.slice(0, at).trim();
        const value = part.slice(at + 1).trim();
        if (Object.hasOwn(ALLOWED, key) && ALLOWED[key](value)) kept.set(key, value);
    }
    kept.set('html', '0');
    if (container) kept.set('container', '1');
    return [...kept].map(([k, v]) => `${k}=${v}`).join(';') + ';';
}

/** 그룹 타입별 인식 규칙. container=0인 AWS 그룹 도형도 shape 표기로 그룹으로 구분한다. */
const GROUP_RECOGNIZERS = [
    ['aws_cloud', s => /(^|;)grIcon=mxgraph\.aws4\.group_aws_cloud/.test(s)],
    ['vpc', s => /(^|;)grIcon=mxgraph\.aws4\.group_vpc/.test(s)],
    ['eks_cluster', s => /(^|;)grIcon=mxgraph\.aws4\.group_eks/.test(s)],
    ['asg', s => /(^|;)grIcon=mxgraph\.aws4\.group_auto_scaling_group/.test(s)],
    ['subnet_public', s => /(^|;)grIcon=mxgraph\.aws4\.group_security_group/.test(s) && /(^|;)strokeColor=#7AA116/i.test(s)],
    ['subnet_private', s => /(^|;)grIcon=mxgraph\.aws4\.group_security_group/.test(s) && /(^|;)strokeColor=#00A4A6/i.test(s)],
    ['az', s => !/(^|;)grIcon=/.test(s) && /(^|;)dashed=1/.test(s) && /(^|;)strokeColor=#147EBA/i.test(s)],
];

function identifyGroupType(style) {
    return GROUP_RECOGNIZERS.find(([, matches]) => matches(style))?.[0] || null;
}

function cellOf(element) {
    return element.localName === 'mxCell' ? element : element.querySelector('mxCell');
}

/** 가장 자주 쓰인 표현을 고른다(동률이면 문서 앞쪽). */
function mostCommon(counts) {
    let best = null;
    for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
    return best;
}

/**
 * 템플릿 mxGraphModel에서 타입별 스타일과 서비스 크기를 추출한다.
 * @param {string} templateXml - 선택한 페이지의 mxGraphModel XML
 * @returns {{serviceStyles: Record<string,string>, serviceSizes: Record<string,{width:number,height:number}>, groupStyles: Record<string,string>}}
 * @throws {Error} 읽을 수 없는 템플릿
 */
export function extractTemplate(templateXml) {
    if (typeof templateXml !== 'string' || !templateXml.trim()) throw new Error('템플릿 XML이 비어 있습니다.');
    const doc = new DOMParser().parseFromString(templateXml, 'text/xml');
    const model = doc.documentElement;
    if (doc.getElementsByTagName('parsererror').length > 0 || !model || model.localName !== 'mxGraphModel') {
        throw new Error('선택한 페이지를 스타일 참고용으로 읽을 수 없습니다.');
    }
    const services = new Map();
    const groups = new Map();
    for (const element of model.querySelectorAll('root > *')) {
        const cell = cellOf(element);
        if (!cell || cell.getAttribute('vertex') !== '1' || cell.getAttribute('visible') === '0') continue;
        const style = cell.getAttribute('style') || '';
        const groupType = identifyGroupType(style);
        const found = groupType ? null : identifyServiceByStyle(style);
        const type = groupType || (found && found.tier !== 'group' ? found.type : null);
        if (!type) continue;
        const clean = sanitizeStyle(style, { container: Boolean(groupType) });
        if (groupType) {
            if (!getGroupStyle(groupType)) continue;
            if (identifyGroupType(clean) !== groupType) continue;
            const entry = groups.get(groupType)?.get(clean) || { count: 0, style: clean };
            entry.count += 1;
            if (!groups.has(groupType)) groups.set(groupType, new Map());
            groups.get(groupType).set(clean, entry);
            continue;
        }
        if (!getServiceStyle(type) || identifyServiceByStyle(clean)?.type !== type) continue;
        const geometry = cell.querySelector('mxGeometry');
        const width = Number(geometry?.getAttribute('width'));
        const height = Number(geometry?.getAttribute('height'));
        if (![width, height].every(n => Number.isFinite(n) && n >= MIN_ICON && n <= MAX_ICON)) continue;
        const key = `${clean}|${width}x${height}`;
        if (!services.has(type)) services.set(type, new Map());
        const entry = services.get(type).get(key) || { count: 0, style: clean, width, height };
        entry.count += 1;
        services.get(type).set(key, entry);
    }
    const result = { serviceStyles: {}, serviceSizes: {}, groupStyles: {} };
    for (const [type, counts] of services) {
        const best = mostCommon(counts);
        result.serviceStyles[type] = best.style;
        result.serviceSizes[type] = { width: best.width, height: best.height };
    }
    for (const [type, counts] of groups) result.groupStyles[type] = mostCommon(counts).style;
    return result;
}
