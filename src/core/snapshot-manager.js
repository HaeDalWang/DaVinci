// src/core/snapshot-manager.js — 다이어그램 스냅샷 저장 및 복원 관리

/**
 * @typedef {Object} ArchitectureSnapshot
 * @property {string} xml - 다이어그램 XML
 * @property {number} timestamp - 생성 시각 (Date.now())
 * @property {string} description - 트리거한 커맨드 설명
 */

export class SnapshotManager {
    /**
     * @param {number} maxSnapshots - 최대 스냅샷 보관 수 (기본 20)
     */
    constructor(maxSnapshots = 20) {
        /** @type {ArchitectureSnapshot[]} */
        this._history = [];
        this._maxSnapshots = maxSnapshots;
    }

    /**
     * 현재 다이어그램 XML을 스냅샷으로 저장한다.
     * 최대 개수 초과 시 가장 오래된 스냅샷을 제거한다 (FIFO).
     * @param {string} xml - 다이어그램 XML
     * @param {string} description - 트리거한 커맨드 설명
     * @returns {ArchitectureSnapshot}
     */
    save(xml, description) {
        const snapshot = {
            xml,
            timestamp: Date.now(),
            description: description || '',
        };
        this._history.push(snapshot);
        if (this._history.length > this._maxSnapshots) {
            this._history.splice(0, this._history.length - this._maxSnapshots);
        }
        return snapshot;
    }

    /**
     * 가장 최근 스냅샷을 반환하고 히스토리에서 제거한다.
     * @returns {ArchitectureSnapshot|null}
     */
    restore() {
        return this._history.pop() || null;
    }

    /**
     * 전체 스냅샷 히스토리를 반환한다.
     * @returns {ArchitectureSnapshot[]}
     */
    getHistory() {
        return [...this._history];
    }

    /**
     * 모든 스냅샷을 제거한다.
     */
    clear() {
        this._history = [];
    }
}
