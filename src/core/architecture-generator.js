// src/core/architecture-generator.js — 명시적 구조 입력(groups/services/connections)으로 새 그림 XML을 만든다.
//
// 반환: { status: 'ready', xml, stats, templateUsed } 또는 { status: 'needs_input', questions }.
// 입력이 잘못되면 ArchitectureInputError를 던진다. 어느 경우든 질문/오류가 있으면 XML은 만들지 않는다.
// 입력에 없는 서비스·그룹·연결은 절대 추가하지 않는다. 템플릿은 스타일·크기만 참고한다.

import { buildXml } from './json-to-xml-builder.js';
import { getGroupStyle, getLabelByType, getServiceStyle } from './aws-service-catalog.js';
import { extractTemplate, sanitizeStyle } from './architecture-template.js';

const MAX_ITEMS = 300;
const MAX_CONNECTIONS = 1000;
const MAX_LABEL = 100;
const ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const RESERVED_IDS = new Set(['0', '1']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=0;strokeColor=#6B7785;strokeWidth=1.5;';

/** 입력 구조 자체가 잘못되었을 때 던진다. problems는 사용자에게 보여줄 수 있는 문장이다. */
export class ArchitectureInputError extends Error {
    constructor(problems) {
        super(`생성 입력이 올바르지 않습니다: ${problems.join(' / ')}`);
        this.name = 'ArchitectureInputError';
        this.problems = problems;
    }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function checkLabel(label, where, problems) {
    if (label === undefined || label === null) return;
    if (typeof label !== 'string' || label.length > MAX_LABEL || CONTROL_CHARS.test(label)) {
        problems.push(`${where}의 label은 ${MAX_LABEL}자 이하의 보이는 글자여야 합니다.`);
    }
}

/** id 형식·예약값·중복을 검사하고 id를 반환한다(잘못되면 null). */
function checkId(item, where, seen, problems) {
    const id = item.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        problems.push(`${where}의 id는 영문·숫자·_ . - 로 된 64자 이하 문자열이어야 합니다.`);
        return null;
    }
    if (RESERVED_IDS.has(id)) {
        problems.push(`${where}의 id "${id}"는 예약된 값(0, 1)이라 쓸 수 없습니다.`);
        return null;
    }
    // __proto__, constructor 같은 내장 객체 키는 레이아웃의 좌표 객체와 충돌하므로 쓸 수 없다.
    if (id in Object.prototype || id === 'prototype') {
        problems.push(`${where}의 id "${id}"는 시스템이 쓰는 이름이라 쓸 수 없습니다. 다른 id를 쓰세요.`);
        return null;
    }
    if (seen.has(id)) {
        problems.push(`id "${id}"가 중복되었습니다.`);
        return null;
    }
    seen.add(id);
    return id;
}

/** 입력 모양과 참조를 검사해 정규화한 복사본을 만든다. 원본 입력은 바꾸지 않는다. */
function normalizeInput(input) {
    const problems = [];
    if (!isPlainObject(input)) throw new ArchitectureInputError(['architecture는 객체여야 합니다.']);
    const { groups = [], services, connections } = input;
    if (!Array.isArray(groups)) problems.push('groups는 배열이어야 합니다.');
    if (services !== undefined && !Array.isArray(services)) problems.push('services는 배열이어야 합니다.');
    if (connections !== undefined && !Array.isArray(connections)) problems.push('connections는 배열이어야 합니다.');
    if (problems.length) throw new ArchitectureInputError(problems);
    if (Array.isArray(connections) && connections.length > MAX_CONNECTIONS) {
        throw new ArchitectureInputError([`연결은 ${MAX_CONNECTIONS}개 이하로 요청해주세요(현재 ${connections.length}개). 나누어 요청해주세요.`]);
    }
    const serviceList = services ?? [];
    if (groups.length + serviceList.length > MAX_ITEMS) {
        throw new ArchitectureInputError([`그룹과 서비스는 합쳐서 ${MAX_ITEMS}개 이하로 요청해주세요.`]);
    }

    const seen = new Set();
    const groupIds = new Set();
    const groupList = groups.map((g, i) => {
        const where = `groups[${i}]`;
        if (!isPlainObject(g)) { problems.push(`${where}는 객체여야 합니다.`); return null; }
        const id = checkId(g, where, seen, problems);
        if (typeof g.type !== 'string' || typeof getGroupStyle(g.type) !== 'string') problems.push(`${where}의 type "${g.type}"은(는) 지원하지 않는 그룹입니다.`);
        if (g.children !== undefined && !Array.isArray(g.children)) problems.push(`${where}의 children은 배열이어야 합니다.`);
        checkLabel(g.label, where, problems);
        if (id) groupIds.add(id);
        return id ? { id, type: g.type, label: g.label || id, children: Array.isArray(g.children) ? [...g.children] : [] } : null;
    });
    const serviceIds = new Set();
    const serviceItems = serviceList.map((s, i) => {
        const where = `services[${i}]`;
        if (!isPlainObject(s)) { problems.push(`${where}는 객체여야 합니다.`); return null; }
        const id = checkId(s, where, seen, problems);
        if (typeof s.type !== 'string' || typeof getServiceStyle(s.type) !== 'string') problems.push(`${where}의 serviceType "${s.type}"은(는) 알 수 없는 서비스입니다.`);
        if (s.group !== undefined && s.group !== null && typeof s.group !== 'string') problems.push(`${where}의 group은 그룹 id 문자열 또는 null이어야 합니다.`);
        checkLabel(s.label, where, problems);
        if (id) serviceIds.add(id);
        return id ? { id, type: s.type, label: s.label || getLabelByType(s.type), group: s.group } : null;
    });
    if (problems.length) throw new ArchitectureInputError(problems);

    // 소속: group 필드와 groups[].children이 말한 사실을 합친다. 서로 어긋나면 거부한다.
    const parentOf = new Map(); // child id → parent group id
    const claim = (childId, parentId) => {
        if (parentOf.has(childId) && parentOf.get(childId) !== parentId) {
            problems.push(`"${childId}"의 부모가 둘 이상입니다(${parentOf.get(childId)}, ${parentId}).`);
        }
        parentOf.set(childId, parentId);
    };
    for (const g of groupList) {
        if (new Set(g.children).size !== g.children.length) problems.push(`그룹 "${g.id}"의 children에 같은 id가 두 번 들어 있습니다.`);
        for (const childId of g.children) {
            if (typeof childId !== 'string' || !(groupIds.has(childId) || serviceIds.has(childId))) {
                problems.push(`그룹 "${g.id}"의 children에 없는 id "${childId}"가 있습니다.`);
            } else claim(childId, g.id);
        }
    }
    for (const s of serviceItems) {
        if (typeof s.group === 'string') {
            if (!groupIds.has(s.group)) problems.push(`서비스 "${s.id}"의 group "${s.group}"을(를) 찾을 수 없습니다.`);
            else claim(s.id, s.group);
        } else if (s.group === null && parentOf.has(s.id)) {
            problems.push(`서비스 "${s.id}"는 group이 null(최상위)인데 그룹 "${parentOf.get(s.id)}"의 children에 들어 있습니다.`);
        }
    }
    if (problems.length) throw new ArchitectureInputError(problems);

    // 순환 검사: 그룹의 부모를 따라 올라가며 자기 자신을 만나면 순환이다.
    for (const g of groupList) {
        const trail = new Set([g.id]);
        for (let at = parentOf.get(g.id); at; at = parentOf.get(at)) {
            if (trail.has(at)) { problems.push(`그룹 "${g.id}"의 포함 관계가 순환합니다.`); break; }
            trail.add(at);
        }
    }

    const connectionList = connections === undefined ? undefined : connections.map((c, i) => {
        const where = `connections[${i}]`;
        if (!isPlainObject(c)) { problems.push(`${where}는 객체여야 합니다.`); return null; }
        for (const end of ['from', 'to']) {
            if (typeof c[end] !== 'string' || !(groupIds.has(c[end]) || serviceIds.has(c[end]))) {
                problems.push(`${where}의 ${end} "${c[end]}"에 해당하는 서비스나 그룹이 없습니다.`);
            }
        }
        if (c.from === c.to) problems.push(`${where}는 자기 자신으로 연결됩니다.`);
        checkLabel(c.label, where, problems);
        return { from: c.from, to: c.to, label: c.label || '' };
    });
    const pairs = new Set();
    for (const c of connectionList || []) {
        if (!c) continue;
        const key = `${c.from}>${c.to}`;
        if (pairs.has(key)) problems.push(`연결 "${c.from}" → "${c.to}"가 중복되었습니다.`);
        pairs.add(key);
    }
    if (problems.length) throw new ArchitectureInputError(problems);

    return { groupList, serviceItems, connectionList, parentOf, groupIds };
}

/** 빠진 사실을 질문으로 모은다. 임의로 채우지 않는다. */
function collectQuestions({ groupList, serviceItems, connectionList, parentOf }) {
    const questions = [];
    if (serviceItems.length === 0) questions.push('그림에 넣을 AWS 서비스를 알려주세요.');
    if (groupList.length > 0) {
        for (const s of serviceItems) {
            if (s.group === undefined && !parentOf.has(s.id)) {
                questions.push(`"${s.label}"(${s.id})는 어느 그룹 안에 두나요? 그룹 밖(최상위)이면 그렇게 알려주세요.`);
            }
        }
    }
    if (connectionList === undefined) {
        questions.push('서비스 사이의 연결(화살표)이 있나요? 있다면 어떤 서비스에서 어떤 서비스로 이어지는지, 없다면 "연결 없음"이라고 알려주세요.');
    }
    return questions;
}

/** 템플릿이 없는 타입의 크기를 템플릿의 대표 아이콘 크기에 맞춘다. 템플릿이 비어 있으면 카탈로그 기본값을 쓴다. */
function mostCommonSize(sizes) {
    const counts = new Map();
    for (const { width, height } of Object.values(sizes)) {
        const key = `${width}x${height}`;
        counts.set(key, { width, height, count: (counts.get(key)?.count || 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] || null;
}

function resolveAppearance(items, template) {
    const serviceStyles = {};
    const serviceSizes = {};
    const groupStyles = {};
    const fallbackSize = mostCommonSize(template.serviceSizes);
    const usedFromTemplate = { services: [], groups: [] };
    for (const type of new Set(items.serviceItems.map(s => s.type))) {
        const fromTemplate = template.serviceStyles[type];
        serviceStyles[type] = fromTemplate || sanitizeStyle(getServiceStyle(type));
        if (fromTemplate) {
            serviceSizes[type] = template.serviceSizes[type];
            usedFromTemplate.services.push(type);
        } else if (fallbackSize) {
            serviceSizes[type] = { width: fallbackSize.width, height: fallbackSize.height };
        }
    }
    for (const type of new Set(items.groupList.map(g => g.type))) {
        const fromTemplate = template.groupStyles[type];
        groupStyles[type] = fromTemplate || sanitizeStyle(getGroupStyle(type), { container: true });
        if (fromTemplate) usedFromTemplate.groups.push(type);
    }
    return { serviceStyles, serviceSizes, groupStyles, usedFromTemplate };
}

/** 만든 XML이 입력과 같은 개수·ID·소속·연결인지 확인한다. 어긋나면 던진다(그림을 쓰지 않는다). */
function verifyXml(xml, items) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('생성한 XML을 읽을 수 없습니다.');
    const cells = [...doc.querySelectorAll('mxCell')];
    const vertices = cells.filter(c => c.getAttribute('vertex') === '1');
    const edges = cells.filter(c => c.getAttribute('edge') === '1');
    const expectedVertices = items.groupList.length + items.serviceItems.length;
    const expectedEdges = (items.connectionList || []).length;
    if (vertices.length !== expectedVertices || edges.length !== expectedEdges) {
        throw new Error(`생성 결과의 개수가 입력과 다릅니다(노드 ${vertices.length}/${expectedVertices}, 연결 ${edges.length}/${expectedEdges}).`);
    }
    const byId = new Map(cells.map(c => [c.getAttribute('id'), c]));
    for (const item of [...items.groupList, ...items.serviceItems]) {
        const cell = byId.get(item.id);
        const parent = items.parentOf.get(item.id) || '1';
        if (!cell || cell.getAttribute('parent') !== parent) throw new Error(`생성 결과에서 "${item.id}"의 위치가 입력과 다릅니다.`);
    }
    const drawn = new Set(edges.map(e => `${e.getAttribute('source')}>${e.getAttribute('target')}`));
    for (const c of items.connectionList || []) {
        if (!drawn.has(`${c.from}>${c.to}`)) {
            throw new Error(`생성 결과에 연결 "${c.from}" → "${c.to}"가 없습니다.`);
        }
    }
}

/**
 * 구조 입력으로 새 그림 XML을 만든다.
 * @param {{groups?: object[], services?: object[], connections?: object[]}} input
 * @param {{templateXml?: string}} [options] - 스타일·크기를 참고할 mxGraphModel XML(선택)
 * @returns {{status: 'ready', xml: string, stats: object, templateUsed: object} | {status: 'needs_input', questions: string[]}}
 * @throws {ArchitectureInputError} 입력이 잘못된 경우
 */
export function generateArchitecture(input, { templateXml } = {}) {
    const items = normalizeInput(input);
    const questions = collectQuestions(items);
    if (questions.length > 0) return { status: 'needs_input', questions };

    const template = templateXml ? extractTemplate(templateXml) : { serviceStyles: {}, serviceSizes: {}, groupStyles: {} };
    const { usedFromTemplate, ...appearance } = resolveAppearance(items, template);
    const groups = items.groupList.map(g => ({
        id: g.id, type: g.type, label: g.label, children: g.children.filter(id => items.groupIds.has(id)),
    }));
    const services = items.serviceItems.map(s => ({ id: s.id, type: s.type, label: s.label, group: items.parentOf.get(s.id) || null }));
    const xml = buildXml({ groups, services, connections: items.connectionList }, { ...appearance, edgeStyle: EDGE_STYLE, useInputIds: true, tiered: true, routeEdges: true });
    verifyXml(xml, items);
    return {
        status: 'ready',
        xml,
        stats: { groups: groups.length, services: services.length, connections: items.connectionList.length },
        templateUsed: usedFromTemplate,
    };
}
