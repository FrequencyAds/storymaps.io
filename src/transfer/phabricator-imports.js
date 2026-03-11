// Storymaps.io -- AGPL-3.0 -- see LICENCE for details
// Import Modules -- Phabricator Maniphest CSV file upload

import { state } from '/src/core/state.js';
import { showConfirm } from '/src/core/modals.js';
import {
    renderImportPreview, updateImportCount, buildStorymapFromImport
} from '/src/transfer/import-helpers.js';
import { parseCsv } from '/src/transfer/csv.js';

let dom = null;
let onImportComplete = null;

export const init = (deps) => {
    dom = new Proxy({}, {
        get: (cache, id) => cache[id] ??= document.getElementById(id)
    });
    onImportComplete = deps.onImportComplete;
};

// ==================== Phabricator Import State ====================

const phabImportState = { epics: [], projectKey: '', baseUrl: '' };

// ==================== Modal Lifecycle ====================

export const showPhabCsvImportModal = () => {
    phabImportState.epics = [];
    phabImportState.projectKey = '';
    phabImportState.baseUrl = '';
    dom.phabCsvImportStage1.classList.remove('hidden');
    dom.phabImportStage2.classList.add('hidden');
    dom.phabImportTitle.textContent = 'Import from Phabricator CSV';
    dom.phabCsvFileInput.value = '';
    dom.phabCsvFileInput._droppedFile = null;
    dom.phabCsvValidationError.classList.add('hidden');
    dom.phabCsvImportParseBtn.disabled = true;
    dom.phabCsvDropzone.querySelector('span').textContent = 'Drop .csv file here or click to browse';
    dom.phabImportModal.classList.add('visible');
};

export const hidePhabImportModal = () => {
    dom.phabImportModal.classList.remove('visible');
    dom.phabCsvFileInput.value = '';
    dom.phabCsvFileInput._droppedFile = null;
    dom.phabCsvValidationError.classList.add('hidden');
    dom.phabCsvImportParseBtn.disabled = true;
    dom.phabCsvDropzone.querySelector('span').textContent = 'Drop .csv file here or click to browse';
};

export const confirmClosePhabImportModal = async () => {
    if (await showConfirm('Close import dialog?')) {
        hidePhabImportModal();
    }
};

// ==================== Stage Navigation ====================

export const showPhabImportStage1 = () => {
    dom.phabImportStage2.classList.add('hidden');
    dom.phabCsvImportStage1.classList.remove('hidden');
    dom.phabImportTitle.textContent = 'Import from Phabricator CSV';
};

const phabPreviewDomRefs = () => ({
    previewHeader: dom.phabImportPreviewHeader,
    preview: dom.phabImportPreview
});

const phabLabels = () => {
    const total = phabImportState.epics.reduce((n, e) => n + e.stories.filter(s => s._included !== false).length, 0);
    return { groupLabel: phabImportState.epics.length !== 1 ? 'columns' : 'column', itemLabel: total !== 1 ? 'tasks' : 'task' };
};

const phabUpdateCount = () => updateImportCount(phabImportState.epics, dom.phabImportCount, phabLabels());

const showPhabImportStage2 = () => {
    dom.phabCsvImportStage1.classList.add('hidden');
    dom.phabImportStage2.classList.remove('hidden');
    dom.phabImportTitle.textContent = 'Review Import';
    // Show import mode toggle only when importing into an existing map
    if (state.mapLoaded) {
        dom.phabImportMode.classList.remove('hidden');
        dom.phabImportMode.querySelector('input[value="append"]').checked = true;
    } else {
        dom.phabImportMode.classList.add('hidden');
    }
    renderImportPreview(phabImportState.epics, phabImportState.projectKey, phabPreviewDomRefs(), phabUpdateCount, phabLabels());
    phabUpdateCount();
};

// ==================== CSV Parsing ====================

const mapPhabStatus = (status) => {
    if (!status) return 'planned';
    const s = status.toLowerCase().trim();
    if (s === 'open' || s === 'stalled') return 'planned';
    return 'done';
};

const parsePhabricatorCsv = (csvText) => {
    const rows = parseCsv(csvText);
    if (rows.length < 2) return { epics: [], projectKey: '', baseUrl: '' };

    const headers = rows[0].map(h => h.trim());
    const col = (name) => headers.indexOf(name);

    const iTitle = col('Title');
    if (iTitle === -1) {
        throw new Error('Missing required column: Title');
    }

    const iId = col('ID');
    const iDesc = col('Description');
    const iStatus = col('Status');
    const iPoints = col('Points');
    const iFinalPoints = col('Final Story Points');
    const iUri = col('URI');
    const iMonogram = col('Monogram');

    const stories = [];
    let baseUrl = '';

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const title = (row[iTitle] || '').trim();
        if (!title) continue;

        // Extract task key (T416600) from Monogram or ID columns
        let key = '';
        if (iMonogram !== -1 && row[iMonogram]?.trim()) {
            key = row[iMonogram].trim();
        } else if (iId !== -1 && row[iId]?.trim()) {
            const id = row[iId].trim();
            key = id.startsWith('T') ? id : 'T' + id;
        }

        const uri = iUri !== -1 ? (row[iUri] || '').trim() : '';
        if (!baseUrl && uri) {
            try {
                const url = new URL(uri);
                baseUrl = url.origin;
            } catch { /* skip */ }
        }

        const status = iStatus !== -1 ? (row[iStatus] || '').trim() : '';
        const description = iDesc !== -1 ? (row[iDesc] || '').trim() : '';

        // Points: prefer Final Story Points, fall back to Points
        let points;
        if (iFinalPoints !== -1 && row[iFinalPoints]?.trim()) {
            const p = parseFloat(row[iFinalPoints]);
            if (!isNaN(p)) points = p;
        }
        if (points == null && iPoints !== -1 && row[iPoints]?.trim()) {
            const p = parseFloat(row[iPoints]);
            if (!isNaN(p)) points = p;
        }

        stories.push({
            key,
            summary: title,
            status: mapPhabStatus(status),
            description: description || undefined,
            points
        });
    }

    if (stories.length === 0) return { epics: [], projectKey: '', baseUrl: '' };

    // Distribute flat tasks across columns (up to 8) with blank step names
    const cols = Math.min(stories.length, 8);
    const epics = [];
    for (let c = 0; c < cols; c++) {
        epics.push({ key: `_col${c}`, summary: '', stories: [] });
    }
    stories.forEach((s, i) => epics[i % cols].stories.push(s));

    return { epics, projectKey: 'Phabricator', baseUrl };
};

// ==================== CSV File Handler ====================

export const handlePhabCsvFile = (file) => {
    if (!file) return;
    dom.phabCsvValidationError.classList.add('hidden');
    if (file.size > 20 * 1024 * 1024) {
        dom.phabCsvValidationError.textContent = 'File too large (max 20 MB). Try exporting fewer tasks from Phabricator.';
        dom.phabCsvValidationError.classList.remove('hidden');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const { epics, projectKey, baseUrl } = parsePhabricatorCsv(e.target.result);
            if (epics.length === 0) {
                dom.phabCsvValidationError.textContent = 'No tasks found in CSV. Check that the file has a Title column.';
                dom.phabCsvValidationError.classList.remove('hidden');
                return;
            }
            phabImportState.epics = epics;
            phabImportState.projectKey = projectKey;
            phabImportState.baseUrl = baseUrl;
            showPhabImportStage2();
        } catch (err) {
            dom.phabCsvValidationError.textContent = err.message;
            dom.phabCsvValidationError.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
};

// ==================== Confirm Import ====================

export const confirmPhabImport = () => {
    const { baseUrl } = phabImportState;
    const data = buildStorymapFromImport(
        phabImportState.epics,
        phabImportState.projectKey,
        (key) => (key && baseUrl) ? baseUrl + '/' + key : '',
        { sliceLabel: 'IMPORTED: Phabricator tasks' }
    );
    if (data.steps.length === 0) return;
    const mode = dom.phabImportMode?.querySelector('input:checked')?.value || 'replace';
    hidePhabImportModal();
    onImportComplete(data, { mode });
};
