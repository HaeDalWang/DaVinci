// src/core/diagram-controller.js — AI Agent 커맨드를 해석하여 DrawIO Bridge로 다이어그램을 조작

import { SERVICE_LABELS } from './aws-service-catalog.js';
import { showToast } from '../components/toast.js';
import { buildXml } from './json-to-xml-builder.js';
import { summarizeXml } from './xml-summarizer.js';

/**
 * @typedef {Object} DiagramCommand
 * @property {'add_service'|'remove_service'|'add_connection'|'remove_connection'|'replace_all'} type
 * @property {Object} params
 */

const DEFAULT_EDGE_STYLE =
    'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;' +
    'html=1;strokeColor=#6B7785;strokeWidth=1.5;';

let _nextId = 1000;
function generateId() {
    return `ai_${_nextId++}_${Date.now()}`;
}

/**
 * mxCell XML 문자열에서 value(라벨) 속성을 추출한다.
 * @param {string} cellXml - 단일 mxCell XML
 * @returns {string}
 */
function extractLabel(cellXml) {
    const match = cellXml.match(/value="([^"]*)"/);
    return match ? match[1] : '';
}

/**
 * XML 문자열에서 모든 mxCell을 파싱하여 배열로 반환한다.
 * @param {string} xml
 * @returns {Array<{id: string, value: string, style: string, source: string, target: string, raw: string}>}
 */
function parseCells(xml) {
    const cells = [];
    const regex = /<mxCell\s[^>]*?\/?>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
        const raw = m[0];
        const id = (raw.match(/\bid="([^"]*)"/) || [])[1] || '';
        const value = (raw.match(/\bvalue="([^"]*)"/) || [])[1] || '';
        const style = (raw.match(/\bstyle="([^"]*)"/) || [])[1] || '';
        const source = (raw.match(/\bsource="([^"]*)"/) || [])[1] || '';
        const target = (raw.match(/\btarget="([^"]*)"/) || [])[1] || '';
        cells.push({ id, value, style, source, target, raw });
    }
    return cells;
}

/**
 * XML에서 특정 id의 mxCell(및 자식 mxGeometry 포함 블록)을 제거한다.
 * @param {string} xml
 * @param {string} cellId
 * @returns {string}
 */
function removeCellById(xml, cellId) {
    // 자기 닫힘 태그 제거
    const selfClosing = new RegExp(`<mxCell\\s[^>]*?\\bid="${escapeRegex(cellId)}"[^>]*?/>`, 'g');
    let result = xml.replace(selfClosing, '');
    // 열림/닫힘 태그 제거 (mxGeometry 자식 포함)
    const block = new RegExp(
        `<mxCell\\s[^>]*?\\bid="${escapeRegex(cellId)}"[^>]*?>\\s*(?:<mxGeometry[^]*?/>|<mxGeometry[^]*?>[^]*?</mxGeometry>)?\\s*</mxCell>`,
        'g'
    );
    result = result.replace(block, '');
    return result;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class DiagramController {
    /**
     * @param {import('./drawio-bridge.js').DrawIOBridge} bridge
     * @param {import('./snapshot-manager.js').SnapshotManager} snapshotManager
     */
    constructor(bridge, snapshotManager) {
        this._bridge = bridge;
        this._snapshotManager = snapshotManager;
    }

    /**
     * 커맨드 배열을 순차 실행한다.
     * 실행 전 스냅샷을 자동 저장하고, 오류 시 롤백한다.
     * @param {DiagramCommand[]} commands
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async executeCommands(commands) {
        if (!commands || commands.length === 0) {
            return { success: true, message: '실행할 커맨드가 없습니다.' };
        }

        // 실행 전 현재 XML 스냅샷 저장
        const currentXml = await this._bridge.getCurrentXml();
        const description = commands.map(c => `${c.type}: ${JSON.stringify(c.params)}`).join(', ');
        this._snapshotManager.save(currentXml, description);

        try {
            for (const cmd of commands) {
                await this._dispatch(cmd);
            }
            const summary = commands.map(c => c.type).join(', ');
            return { success: true, message: `커맨드 실행 완료: ${summary}` };
        } catch (err) {
            // 오류 시 스냅샷에서 롤백
            const snapshot = this._snapshotManager.restore();
            if (snapshot) {
                this._bridge.loadXml(snapshot.xml);
            }
            showToast(`커맨드 실행 오류: ${err.message}`, 'error');
            return { success: false, message: err.message };
        }
    }

    /**
     * 커맨드 타입에 따라 적절한 핸들러를 호출한다.
     * @param {DiagramCommand} cmd
     */
    async _dispatch(cmd) {
        switch (cmd.type) {
            case 'add_service':
                return this._addService(cmd.params);
            case 'remove_service':
                return this._removeService(cmd.params);
            case 'add_connection':
                return this._addConnection(cmd.params);
            case 'remove_connection':
                return this._removeConnection(cmd.params);
            case 'replace_all':
                return this._replaceAll(cmd.params);
            default:
                throw new Error(`지원하지 않는 커맨드 타입: ${cmd.type}`);
        }
    }

    /**
     * AWS 서비스를 다이어그램에 추가한다.
     * 현재 XML → Lightweight_JSON 변환 → 새 서비스 추가 → 전체 XML 재생성
     * @param {Object} params - { serviceType, label, group? }
     */
    async _addService(params) {
        if (!params.serviceType) throw new Error('add_service: serviceType이 필요합니다.');

        const currentXml = await this._bridge.getCurrentXml();
        const currentJson = summarizeXml(currentXml);
        // 새 서비스를 JSON에 추가
        currentJson.services.push({
            id: generateId(),
            type: params.serviceType,
            label: params.label || SERVICE_LABELS[params.serviceType],
            group: params.group || undefined,
        });
        const newXml = buildXml(currentJson);
        this._bridge.loadXml(newXml);
    }

    /**
     * 다이어그램에서 서비스를 제거한다.
     * @param {Object} params - { serviceId?, label? }
     */
    async _removeService(params) {
        const { serviceId, label } = params;
        if (!serviceId && !label) {
            throw new Error('remove_service: serviceId 또는 label이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        // serviceId로 먼저 검색, 없으면 label로 검색
        let target = serviceId
            ? cells.find(c => c.id === serviceId)
            : cells.find(c => c.value === label && c.style && !c.source);

        if (!target) {
            throw new Error(`remove_service: 대상 서비스를 찾을 수 없습니다 (id=${serviceId}, label=${label})`);
        }

        // 해당 서비스에 연결된 Edge도 함께 제거
        let newXml = removeCellById(xml, target.id);
        const connectedEdges = cells.filter(c => c.source === target.id || c.target === target.id);
        for (const edge of connectedEdges) {
            newXml = removeCellById(newXml, edge.id);
        }

        this._bridge.loadXml(newXml);
    }

    /**
     * 두 서비스 간 연결(Edge)을 추가한다.
     * @param {Object} params - { sourceLabel, targetLabel, label? }
     */
    async _addConnection(params) {
        const { sourceLabel, targetLabel, label = '' } = params;
        if (!sourceLabel || !targetLabel) {
            throw new Error('add_connection: sourceLabel과 targetLabel이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        const sourceCell = cells.find(c => c.value === sourceLabel && c.style && !c.source);
        const targetCell = cells.find(c => c.value === targetLabel && c.style && !c.source);

        if (!sourceCell) throw new Error(`add_connection: 소스 서비스 "${sourceLabel}"을 찾을 수 없습니다.`);
        if (!targetCell) throw new Error(`add_connection: 타겟 서비스 "${targetLabel}"을 찾을 수 없습니다.`);

        const edgeId = generateId();
        const mergeXml =
            `<mxGraphModel><root>` +
            `<mxCell id="${edgeId}" value="${label}" ` +
            `style="${DEFAULT_EDGE_STYLE}" edge="1" parent="1" ` +
            `source="${sourceCell.id}" target="${targetCell.id}">` +
            `<mxGeometry relative="1" as="geometry"/>` +
            `</mxCell>` +
            `</root></mxGraphModel>`;

        const result = await this._bridge.merge(mergeXml);
        if (result.error) {
            throw new Error(`add_connection 실패: ${result.error}`);
        }
    }

    /**
     * 두 서비스 간 연결(Edge)을 제거한다.
     * @param {Object} params - { sourceLabel, targetLabel }
     */
    async _removeConnection(params) {
        const { sourceLabel, targetLabel } = params;
        if (!sourceLabel || !targetLabel) {
            throw new Error('remove_connection: sourceLabel과 targetLabel이 필요합니다.');
        }

        const xml = await this._bridge.getCurrentXml();
        const cells = parseCells(xml);

        const sourceCell = cells.find(c => c.value === sourceLabel && c.style && !c.source);
        const targetCell = cells.find(c => c.value === targetLabel && c.style && !c.source);

        if (!sourceCell) throw new Error(`remove_connection: 소스 서비스 "${sourceLabel}"을 찾을 수 없습니다.`);
        if (!targetCell) throw new Error(`remove_connection: 타겟 서비스 "${targetLabel}"을 찾을 수 없습니다.`);

        const edge = cells.find(
            c => c.source === sourceCell.id && c.target === targetCell.id
        );
        if (!edge) {
            throw new Error(`remove_connection: "${sourceLabel}" → "${targetLabel}" 연결을 찾을 수 없습니다.`);
        }

        const newXml = removeCellById(xml, edge.id);
        this._bridge.loadXml(newXml);
    }

    /**
     * 전체 다이어그램을 교체한다.
     * @param {Object} params - { architecture?: LightweightJSON, xml?: string }
     */
    async _replaceAll(params) {
        if (params.architecture) {
            // 새 경로: Lightweight_JSON → Builder → XML
            try {
                const xml = buildXml(params.architecture);
                this._bridge.loadXml(xml);
            } catch (err) {
                // Builder 오류 시 스냅샷에서 롤백
                const snapshot = this._snapshotManager.restore();
                if (snapshot) {
                    this._bridge.loadXml(snapshot.xml);
                }
                showToast(`replace_all 빌더 오류: ${err.message}`, 'error');
                throw err;
            }
        } else if (params.xml) {
            // 하위 호환: 기존 XML 직접 로드
            this._bridge.loadXml(params.xml);
        } else {
            throw new Error('replace_all: architecture 또는 xml이 필요합니다.');
        }
    }
}
