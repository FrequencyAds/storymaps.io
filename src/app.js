// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Orchestrator — imports all modules, wires init(), owns dom + persistence + event listeners

import * as notepad from '/src/notepad.js';
import { generateId, el, CARD_COLORS, DEFAULT_CARD_COLORS, STATUS_OPTIONS, ZOOM_LEVELS } from '/src/constants.js';
import { state, init as stateInit, initState, hasContent, confirmOverwrite, pushUndo, undo, redo, updateUndoRedoButtons, createColumn, createStory, createSlice, createRefColumn, selection, clearSelection, partialMapEditState, DEFAULT_NOTES } from '/src/state.js';
import { serialize, deserialize } from '/src/serialization.js';
import * as navigation from '/src/navigation.js';
import * as presence from '/src/presence.js';
import * as lock from '/src/lock.js';
import * as yjs from '/src/yjs.js';
import * as ui from '/src/ui.js';
import * as renderMod from '/src/render.js';
import * as exportsMod from '/src/exports.js';
import { exportToYaml, importFromYaml } from '/src/yaml.js';

// =============================================================================
// DOM References
// =============================================================================

const dom = {
    logoLink: document.getElementById('logoLink'),
    storyMap: document.getElementById('storyMap'),
    boardName: document.getElementById('boardName'),
    newMapBtn: document.getElementById('newMapBtn'),
    copyExistingBtn: document.getElementById('copyExistingBtn'),
    importJsonMenuItem: document.getElementById('importJsonMenuItem'),
    importYamlMenuItem: document.getElementById('importYamlMenuItem'),
    importSubmenuTrigger: document.getElementById('importSubmenuTrigger'),
    importSubmenu: document.getElementById('importSubmenu'),
    exportBtn: document.getElementById('exportMap'),
    exportYamlBtn: document.getElementById('exportYamlBtn'),
    printBtn: document.getElementById('printMap'),
    menuBtn: document.getElementById('menuBtn'),
    mainMenu: document.getElementById('mainMenu'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomReset: document.getElementById('zoomReset'),
    undoBtn: document.getElementById('undoBtn'),
    redoBtn: document.getElementById('redoBtn'),
    shareBtn: document.getElementById('shareBtn'),
    shareMenu: document.getElementById('shareMenu'),
    shareCopyLink: document.getElementById('shareCopyLink'),
    shareScreenshot: document.getElementById('shareScreenshot'),
    shareDownload: document.getElementById('shareDownload'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    welcomeNewBtn: document.getElementById('welcomeNewBtn'),
    welcomeCounter: document.getElementById('welcomeCounter'),
    storyMapWrapper: document.getElementById('storyMapWrapper'),
    samplesSubmenuTrigger: document.getElementById('samplesSubmenuTrigger'),
    samplesSubmenu: document.getElementById('samplesSubmenu'),
    exportSubmenuTrigger: document.getElementById('exportSubmenuTrigger'),
    exportSubmenu: document.getElementById('exportSubmenu'),
    zoomControls: document.getElementById('zoomControls'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    tutorialToast: document.getElementById('tutorialToast'),
    tutorialToastClose: document.getElementById('tutorialToastClose'),
    importModal: document.getElementById('importModal'),
    importModalClose: document.getElementById('importModalClose'),
    importJsonText: document.getElementById('importJsonText'),
    importJsonBtn: document.getElementById('importJsonBtn'),
    importDropzone: document.getElementById('importDropzone'),
    importFileInput: document.getElementById('importFileInput'),
    exportModal: document.getElementById('exportModal'),
    exportModalClose: document.getElementById('exportModalClose'),
    exportJsonText: document.getElementById('exportJsonText'),
    exportMinify: document.getElementById('exportMinify'),
    exportCopyBtn: document.getElementById('exportCopyBtn'),
    exportFilename: document.getElementById('exportFilename'),
    exportDownloadBtn: document.getElementById('exportDownloadBtn'),
    // YAML import modal
    importYamlModal: document.getElementById('importYamlModal'),
    importYamlModalClose: document.getElementById('importYamlModalClose'),
    importYamlText: document.getElementById('importYamlText'),
    importYamlBtn: document.getElementById('importYamlBtn'),
    importYamlDropzone: document.getElementById('importYamlDropzone'),
    importYamlFileInput: document.getElementById('importYamlFileInput'),
    importYamlValidationError: document.getElementById('importYamlValidationError'),
    // YAML export modal
    exportYamlModal: document.getElementById('exportYamlModal'),
    exportYamlModalClose: document.getElementById('exportYamlModalClose'),
    exportYamlText: document.getElementById('exportYamlText'),
    exportYamlCopyBtn: document.getElementById('exportYamlCopyBtn'),
    exportYamlFilename: document.getElementById('exportYamlFilename'),
    exportYamlDownloadBtn: document.getElementById('exportYamlDownloadBtn'),
    // Jira export
    exportJiraBtn: document.getElementById('exportJiraBtn'),
    jiraExportModal: document.getElementById('jiraExportModal'),
    jiraExportModalClose: document.getElementById('jiraExportModalClose'),
    jiraProjectName: document.getElementById('jiraProjectName'),
    jiraProjectKey: document.getElementById('jiraProjectKey'),
    jiraProjectType: document.getElementById('jiraProjectType'),
    jiraExportSlices: document.getElementById('jiraExportSlices'),
    jiraExportEpics: document.getElementById('jiraExportEpics'),
    jiraExportCount: document.getElementById('jiraExportCount'),
    jiraExportCancel: document.getElementById('jiraExportCancel'),
    jiraExportDownload: document.getElementById('jiraExportDownload'),
    jiraStatusNone: document.getElementById('jiraStatusNone'),
    jiraStatusDone: document.getElementById('jiraStatusDone'),
    jiraStatusInProgress: document.getElementById('jiraStatusInProgress'),
    jiraStatusPlanned: document.getElementById('jiraStatusPlanned'),
    jiraFilterNone: document.getElementById('jiraFilterNone'),
    jiraFilterPlanned: document.getElementById('jiraFilterPlanned'),
    jiraFilterInProgress: document.getElementById('jiraFilterInProgress'),
    jiraFilterDone: document.getElementById('jiraFilterDone'),
    // Phabricator export
    exportPhabBtn: document.getElementById('exportPhabBtn'),
    phabExportModal: document.getElementById('phabExportModal'),
    phabExportModalClose: document.getElementById('phabExportModalClose'),
    phabExportTitle: document.getElementById('phabExportTitle'),
    phabStage1: document.getElementById('phabStage1'),
    phabStage2: document.getElementById('phabStage2'),
    phabExportSlices: document.getElementById('phabExportSlices'),
    phabExportEpics: document.getElementById('phabExportEpics'),
    phabExportCount: document.getElementById('phabExportCount'),
    phabFilterNone: document.getElementById('phabFilterNone'),
    phabFilterPlanned: document.getElementById('phabFilterPlanned'),
    phabFilterInProgress: document.getElementById('phabFilterInProgress'),
    phabFilterDone: document.getElementById('phabFilterDone'),
    phabExportCancel: document.getElementById('phabExportCancel'),
    phabExportNext: document.getElementById('phabExportNext'),
    phabExportBack: document.getElementById('phabExportBack'),
    phabExportDone: document.getElementById('phabExportDone'),
    phabInstanceUrl: document.getElementById('phabInstanceUrl'),
    phabApiToken: document.getElementById('phabApiToken'),
    phabTags: document.getElementById('phabTags'),
    phabImportFunction: document.getElementById('phabImportFunction'),
    phabImportCall: document.getElementById('phabImportCall'),
    phabCopyFunction: document.getElementById('phabCopyFunction'),
    phabCopyCall: document.getElementById('phabCopyCall'),
    // Jira API export
    exportJiraApiBtn: document.getElementById('exportJiraApiBtn'),
    jiraApiExportModal: document.getElementById('jiraApiExportModal'),
    jiraApiExportModalClose: document.getElementById('jiraApiExportModalClose'),
    jiraApiExportTitle: document.getElementById('jiraApiExportTitle'),
    jiraApiStage1: document.getElementById('jiraApiStage1'),
    jiraApiStage2: document.getElementById('jiraApiStage2'),
    jiraApiExportSlices: document.getElementById('jiraApiExportSlices'),
    jiraApiExportEpics: document.getElementById('jiraApiExportEpics'),
    jiraApiExportCount: document.getElementById('jiraApiExportCount'),
    jiraApiFilterNone: document.getElementById('jiraApiFilterNone'),
    jiraApiFilterPlanned: document.getElementById('jiraApiFilterPlanned'),
    jiraApiFilterInProgress: document.getElementById('jiraApiFilterInProgress'),
    jiraApiFilterDone: document.getElementById('jiraApiFilterDone'),
    jiraApiExportCancel: document.getElementById('jiraApiExportCancel'),
    jiraApiExportNext: document.getElementById('jiraApiExportNext'),
    jiraApiExportBack: document.getElementById('jiraApiExportBack'),
    jiraApiExportDone: document.getElementById('jiraApiExportDone'),
    jiraApiEmail: document.getElementById('jiraApiEmail'),
    jiraApiToken: document.getElementById('jiraApiToken'),
    jiraApiProjectKey: document.getElementById('jiraApiProjectKey'),
    jiraApiImportFunction: document.getElementById('jiraApiImportFunction'),
    jiraApiImportCall: document.getElementById('jiraApiImportCall'),
    jiraApiCopyFunction: document.getElementById('jiraApiCopyFunction'),
    jiraApiCopyCall: document.getElementById('jiraApiCopyCall'),
    // Asana export
    exportAsanaBtn: document.getElementById('exportAsanaBtn'),
    asanaExportModal: document.getElementById('asanaExportModal'),
    asanaExportModalClose: document.getElementById('asanaExportModalClose'),
    asanaExportTitle: document.getElementById('asanaExportTitle'),
    asanaStage1: document.getElementById('asanaStage1'),
    asanaStage2: document.getElementById('asanaStage2'),
    asanaExportSlices: document.getElementById('asanaExportSlices'),
    asanaExportEpics: document.getElementById('asanaExportEpics'),
    asanaExportCount: document.getElementById('asanaExportCount'),
    asanaFilterNone: document.getElementById('asanaFilterNone'),
    asanaFilterPlanned: document.getElementById('asanaFilterPlanned'),
    asanaFilterInProgress: document.getElementById('asanaFilterInProgress'),
    asanaFilterDone: document.getElementById('asanaFilterDone'),
    asanaExportCancel: document.getElementById('asanaExportCancel'),
    asanaExportNext: document.getElementById('asanaExportNext'),
    asanaExportBack: document.getElementById('asanaExportBack'),
    asanaExportDone: document.getElementById('asanaExportDone'),
    asanaApiToken: document.getElementById('asanaApiToken'),
    asanaProjectUrl: document.getElementById('asanaProjectUrl'),
    asanaImportFunction: document.getElementById('asanaImportFunction'),
    asanaImportCall: document.getElementById('asanaImportCall'),
    asanaCreateSections: document.getElementById('asanaCreateSections'),
    asanaCopyFunction: document.getElementById('asanaCopyFunction'),
    asanaCopyCall: document.getElementById('asanaCopyCall'),
    // Asana CSV export
    exportAsanaCsvBtn: document.getElementById('exportAsanaCsvBtn'),
    asanaCsvExportModal: document.getElementById('asanaCsvExportModal'),
    asanaCsvExportModalClose: document.getElementById('asanaCsvExportModalClose'),
    asanaCsvExportSlices: document.getElementById('asanaCsvExportSlices'),
    asanaCsvExportEpics: document.getElementById('asanaCsvExportEpics'),
    asanaCsvExportCount: document.getElementById('asanaCsvExportCount'),
    asanaCsvFilterNone: document.getElementById('asanaCsvFilterNone'),
    asanaCsvFilterPlanned: document.getElementById('asanaCsvFilterPlanned'),
    asanaCsvFilterInProgress: document.getElementById('asanaCsvFilterInProgress'),
    asanaCsvFilterDone: document.getElementById('asanaCsvFilterDone'),
    asanaCsvCreateSections: document.getElementById('asanaCsvCreateSections'),
    asanaCsvExportCancel: document.getElementById('asanaCsvExportCancel'),
    asanaCsvExportDownload: document.getElementById('asanaCsvExportDownload'),
    // Cursor toggle
    toggleCursorsBtn: document.getElementById('toggleCursorsBtn'),
    toggleCursorsText: document.getElementById('toggleCursorsText'),
    // Focus mode
    toggleFocusModeBtn: document.getElementById('toggleFocusModeBtn'),
    toggleFocusModeText: document.getElementById('toggleFocusModeText'),
    toggleFullscreenBtn: document.getElementById('toggleFullscreenBtn'),
    toggleFullscreenText: document.getElementById('toggleFullscreenText'),
    // Lock feature
    lockMapBtn: document.getElementById('lockMapBtn'),
    relockBtn: document.getElementById('relockBtn'),
    updatePasswordBtn: document.getElementById('updatePasswordBtn'),
    removeLockBtn: document.getElementById('removeLockBtn'),
    lockDivider: document.getElementById('lockDivider'),
    lockModal: document.getElementById('lockModal'),
    lockModalTitle: document.getElementById('lockModalTitle'),
    lockModalDescription: document.getElementById('lockModalDescription'),
    lockModalClose: document.getElementById('lockModalClose'),
    lockPasswordInput: document.getElementById('lockPasswordInput'),
    lockModalCancel: document.getElementById('lockModalCancel'),
    lockModalConfirm: document.getElementById('lockModalConfirm'),
    readOnlyBanner: document.getElementById('readOnlyBanner'),
    legendPanel: document.getElementById('legendPanel'),
    legendToggle: document.getElementById('legendToggle'),
    legendBody: document.getElementById('legendBody'),
    legendEntries: document.getElementById('legendEntries'),
    legendAddBtn: document.getElementById('legendAddBtn'),
    controlsRight: document.getElementById('controlsRight'),
    panelBody: document.getElementById('panelBody'),
    notesToggle: document.getElementById('notesToggle'),
    // Partials
    partialsPanel: document.getElementById('partialsPanel'),
    partialsToggle: document.getElementById('partialsToggle'),
    partialsBody: document.getElementById('partialsBody'),
    partialsList: document.getElementById('partialsList'),
    // Backups
    backupsBtn: document.getElementById('backupsBtn'),
    backupsModal: document.getElementById('backupsModal'),
    backupsModalClose: document.getElementById('backupsModalClose'),
    backupsList: document.getElementById('backupsList'),
    createBackupBtn: document.getElementById('createBackupBtn'),
    backupCountBadge: document.getElementById('backupCountBadge'),
    appToast: document.getElementById('appToast'),
    // Card expand modal
    cardExpandModal: document.getElementById('cardExpandModal'),
    cardExpandName: document.getElementById('cardExpandName'),
    cardExpandBody: document.getElementById('cardExpandBody'),
    // Search
    searchBtn: document.getElementById('searchBtn'),
    searchBar: document.getElementById('searchBar'),
    searchInput: document.getElementById('searchInput'),
    searchClose: document.getElementById('searchClose'),
    // Filter
    searchFilterBtn: document.getElementById('searchFilterBtn'),
    filterCount: document.getElementById('filterCount'),
    filterPanel: document.getElementById('filterPanel'),
    filterStatusList: document.getElementById('filterStatusList'),
    filterColorList: document.getElementById('filterColorList'),
    filterTagsList: document.getElementById('filterTagsList'),
    filterClearBtn: document.getElementById('filterClearBtn'),
    filterDoneBtn: document.getElementById('filterDoneBtn'),
};

const { isMapEditable } = lock;
const { render, initSortable, addColumn, addColumnAt, addStory, addSlice, deleteColumn, deleteStory, deleteSlice, handleColumnSelection, updateSelectionUI, duplicateColumns, duplicateCards, deleteSelectedColumns, deleteSelectedCards } = renderMod;
const { closeMainMenu, closeAllOptionsMenus, zoomToFit, scrollElementIntoView } = navigation;
const { loadYjs, createYjsDoc, destroyYjs, syncFromYjs, syncToYjs, getProvider, getYdoc, getYmap, ensureSortable } = yjs;
const { trackPresence, clearPresence, trackCursor, clearCursors, toggleCursorsVisibility, updateCursorsVisibilityUI, getCursorColor, getSessionId, broadcastDragStart, broadcastDragEnd } = presence;
const { lockState, loadLockState, subscribeLockState, clearLockSubscription, updateLockUI, updateEditability, checkSessionUnlock, initLockListeners, hideLockModal } = lock;
const { renderLegend, getAllTagsInMap, renderPartialsList } = ui;

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'storymap';

// Generate a unique map ID, checking server-side SQLite for collisions
const newMapId = async () => {
    try {
        const res = await fetch('/api/maps/new-id');
        if (res.ok) return (await res.json()).id;
    } catch { /* fall through */ }
    return generateId();
};

// Subscribe to real-time updates via Yjs
const subscribeToMap = async (mapId) => {
    if (!getYdoc()) {
        await createYjsDoc(mapId);
    }

    syncFromYjs();
    // Ensure state.notes gets written to ytext (fixes .yaml/.json endpoints missing notes)
    if (state.notes && getYmap()) saveToStorage();
    render();

    const deferredTracking = async () => {
        trackPresence();
        trackCursor();
        await loadLockState(mapId);
        lockState.sessionUnlocked = checkSessionUnlock(mapId);
        subscribeLockState(mapId);
        updateLockUI();
        updateEditability();
        // Fetch backup count for menu badge
        fetch(`/api/backups/${mapId}`).then(r => r.json()).then(b => updateBackupBadge(b.length)).catch(() => {});

        const provider = getProvider();
        if (provider) {
            provider.awareness.on('change', () => {
                const ydoc = getYdoc();
                for (const [clientId, awarenessState] of provider.awareness.getStates()) {
                    if (clientId === ydoc.clientID) continue;
                    if (awarenessState.lock) {
                        loadLockState(mapId).then(() => {
                            lockState.sessionUnlocked = checkSessionUnlock(mapId);
                            updateLockUI();
                            updateEditability();
                        });
                        break;
                    }
                }
            });
        }
    };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(deferredTracking);
    } else {
        setTimeout(deferredTracking, 0);
    }
};

// Local storage save (also syncs to Yjs → WebSocket → server)
const saveToStorage = () => {
    if (state.mapId && !isMapEditable()) {
        return;
    }

    // Don't overwrite localStorage that has real data with an empty state
    // (protects against Yjs sync returning partial data e.g. notes only)
    if (state.columns.length === 0) {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) {
            try {
                const parsed = JSON.parse(existing);
                if (parsed.steps && parsed.steps.length > 0) return;
            } catch { /* corrupted — ok to overwrite */ }
        }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
    if (state.mapId) localStorage.setItem(STORAGE_KEY + ':mapId', state.mapId);
    if (state.mapId && getYmap()) {
        syncToYjs();
    }
};

// Combined render and save - used after state mutations
const renderAndSave = () => {
    ensurePartialBlankCol();
    render();
    saveToStorage();
    if (dom.searchInput.value.trim() || hasActiveFilters()) {
        applySearchFilter(dom.searchInput.value.trim());
    }
};

// =============================================================================
// Card Expand Modal
// =============================================================================

let _expandedItem = null;

const openExpandModal = (item, { readOnly = false } = {}) => {
    // If a previous close is still waiting for its popstate, absorb it now
    if (_poppingExpandState) {
        _poppingExpandState = false;
    }
    _expandedItem = item;
    const editable = !readOnly && isMapEditable();
    dom.cardExpandName.value = item.name || '';
    dom.cardExpandBody.value = item.body || '';
    dom.cardExpandName.readOnly = !editable;
    dom.cardExpandBody.readOnly = !editable;
    const modal = dom.cardExpandModal.querySelector('.card-expand-modal');
    if (modal) modal.style.backgroundColor = item.color || '';
    dom.cardExpandModal.classList.add('visible');
    requestAnimationFrame(autoResizeExpandName);
    if (editable) {
        dom.cardExpandName.focus();
        pushUndo();
    }
    history.pushState({ cardExpand: true }, '');
};

let _closingExpandViaBack = false;
let _poppingExpandState = false;

const closeExpandModal = () => {
    if (!dom.cardExpandModal.classList.contains('visible')) return;
    dom.cardExpandModal.classList.remove('visible');
    _expandedItem = null;
    renderAndSave();
    // Pop the history entry we pushed on open, unless we got here via back button
    if (!_closingExpandViaBack) {
        _poppingExpandState = true;
        history.back();
    }
};

const autoResizeExpandName = () => {
    dom.cardExpandName.style.height = 'auto';
    dom.cardExpandName.style.height = dom.cardExpandName.scrollHeight + 'px';
};

dom.cardExpandName.addEventListener('input', () => {
    if (!_expandedItem) return;
    _expandedItem.name = dom.cardExpandName.value;
    autoResizeExpandName();
    saveToStorage();
});

dom.cardExpandBody.addEventListener('input', () => {
    if (!_expandedItem) return;
    _expandedItem.body = dom.cardExpandBody.value;
    saveToStorage();
});

document.getElementById('cardExpandModalClose')?.addEventListener('click', closeExpandModal);
dom.cardExpandModal.addEventListener('click', (e) => {
    if (e.target === dom.cardExpandModal) closeExpandModal();
});

const loadFromStorage = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            deserialize(JSON.parse(data));
            return true;
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return false;
};

// =============================================================================
// Import / Export
// =============================================================================

const exportMap = () => {
    if (dom.welcomeScreen.classList.contains('visible')) return;
    saveToStorage();
    showExportModal();
};

const importBackupsIfPresent = async (data) => {
    if (!state.mapId || !Array.isArray(data?.backups) || !data.backups.length) return;
    // Send backups one at a time to stay under the 1MB body limit
    for (const backup of data.backups) {
        try {
            await fetch(`/api/backups/${state.mapId}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backups: [backup] }),
            });
        } catch { /* best-effort */ }
    }
};

const createAutoBackup = async (note) => {
    if (!state.mapId) return;
    try {
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
    } catch { /* best-effort */ }
};

const importMap = (file) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!confirmOverwrite()) return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (isFromWelcome) {
                hideWelcomeScreen();
                initState();
                const mapId = await newMapId();
                state.mapId = mapId;
                history.replaceState({ mapId }, '', `/${mapId}`);
                await createYjsDoc(mapId);
            } else {
                await createAutoBackup('Auto: before import');
                pushUndo();
            }
            deserialize(parsed);
            dom.boardName.value = state.name;
            renderAndSave();
            requestAnimationFrame(zoomToFit);
            if (isFromWelcome) {
                subscribeToMap(state.mapId);
            }
            importBackupsIfPresent(parsed);
        } catch {
            alert('Failed to import: Invalid file format');
        }
    };
    reader.readAsText(file);
};

const showImportModal = () => {
    dom.importModal.classList.add('visible');
    dom.importJsonText.value = '';
    dom.importJsonText.focus();
};

const hideImportModal = () => {
    dom.importModal.classList.remove('visible');
    dom.importJsonText.value = '';
};

const importFromJsonText = async (jsonText) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!confirmOverwrite()) return;
    }

    try {
        const data = JSON.parse(jsonText);
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        requestAnimationFrame(zoomToFit);
        hideImportModal();
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
        importBackupsIfPresent(data);
    } catch {
        alert('Failed to import: Invalid JSON format');
    }
};

// YAML Import
const showImportYamlModal = () => {
    dom.importYamlModal.classList.add('visible');
    dom.importYamlText.value = '';
    dom.importYamlValidationError.classList.add('hidden');
    dom.importYamlText.focus();
};

const hideImportYamlModal = () => {
    dom.importYamlModal.classList.remove('visible');
    dom.importYamlText.value = '';
};

const importFromYamlText = async (yamlText) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!confirmOverwrite()) return;
    }

    dom.importYamlValidationError.classList.add('hidden');

    let data;
    try {
        data = importFromYaml(yamlText);
    } catch (err) {
        if (err.validationErrors) {
            dom.importYamlValidationError.textContent = err.validationErrors.join('\n');
            dom.importYamlValidationError.classList.remove('hidden');
        } else {
            alert('Failed to import: Invalid YAML format');
        }
        return;
    }

    try {
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        requestAnimationFrame(zoomToFit);
        hideImportYamlModal();
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
        importBackupsIfPresent(data);
    } catch {
        alert('Failed to import: Invalid data structure');
    }
};

const importYamlFile = (file) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!confirmOverwrite()) return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = importFromYaml(e.target.result);
            if (isFromWelcome) {
                hideWelcomeScreen();
                initState();
                const mapId = await newMapId();
                state.mapId = mapId;
                history.replaceState({ mapId }, '', `/${mapId}`);
                await createYjsDoc(mapId);
            } else {
                await createAutoBackup('Auto: before import');
                pushUndo();
            }
            deserialize(data);
            dom.boardName.value = state.name;
            renderAndSave();
            requestAnimationFrame(zoomToFit);
            if (isFromWelcome) {
                subscribeToMap(state.mapId);
            }
            importBackupsIfPresent(data);
        } catch (err) {
            const msg = err.validationErrors ? err.validationErrors.join('\n') : 'Invalid YAML format';
            alert('Failed to import: ' + msg);
        }
    };
    reader.readAsText(file);
};

let _exportBackups = null;

const updateExportJson = () => {
    const minify = dom.exportMinify.checked;
    const data = serialize();
    if (_exportBackups?.length) data.backups = _exportBackups;
    const json = minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
    dom.exportJsonText.value = json;
};

const sanitizeFilename = (name) => {
    return name
        .toLowerCase()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
        .replace(/^\.+/, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 200)
        || 'story-map';
};
exportsMod.init({ dom, sanitizeFilename });
const {
    showJiraExportModal, hideJiraExportModal, confirmCloseJiraExportModal, populateJiraExportEpics, downloadJiraCsv, jiraExportState,
    showPhabExportModal, hidePhabExportModal, confirmClosePhabModal, populatePhabExportEpics, showPhabStage2, showPhabStage1,
    generatePhabImportFunction, generatePhabImportCall, copyPhabCode, phabExportState,
    showJiraApiExportModal, hideJiraApiExportModal, confirmCloseJiraApiModal, populateJiraApiExportEpics,
    showJiraApiStage2, showJiraApiStage1, generateJiraApiImportCall, jiraApiExportState,
    showAsanaExportModal, hideAsanaExportModal, confirmCloseAsanaModal, populateAsanaExportEpics,
    showAsanaStage2, showAsanaStage1, generateAsanaImportCall, asanaExportState,
    showAsanaCsvExportModal, hideAsanaCsvExportModal, confirmCloseAsanaCsvModal,
    populateAsanaCsvExportEpics, downloadAsanaCsv, asanaCsvExportState,
} = exportsMod;

const showExportModal = async () => {
    _exportBackups = null;
    dom.exportModal.classList.add('visible');
    dom.exportFilename.value = sanitizeFilename(state.name || 'story-map');
    dom.exportMinify.checked = false;
    updateExportJson();
    // Fetch full backups to include in export
    if (state.mapId) {
        try {
            const res = await fetch(`/api/backups/${state.mapId}`);
            const meta = await res.json();
            if (meta.length) {
                const fullBackups = [];
                for (const b of meta) {
                    const r = await fetch(`/api/backups/${state.mapId}/${b.id}`);
                    if (r.ok) fullBackups.push(await r.json());
                }
                _exportBackups = fullBackups;
                updateExportJson();
            }
        } catch { /* best-effort */ }
    }
};

const hideExportModal = () => {
    dom.exportModal.classList.remove('visible');
};

const copyExportJson = async () => {
    const json = dom.exportJsonText.value;
    try {
        await navigator.clipboard.writeText(json);
        dom.exportCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCopyBtn.textContent = 'Copy to Clipboard', 2000);
    } catch {
        dom.exportJsonText.select();
        document.execCommand('copy');
        dom.exportCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCopyBtn.textContent = 'Copy to Clipboard', 2000);
    }
};

const downloadExportFile = () => {
    const filename = sanitizeFilename(dom.exportFilename.value) + '.json';
    const json = dom.exportJsonText.value;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideExportModal();
};

// YAML Export
const exportYaml = () => {
    if (dom.welcomeScreen.classList.contains('visible')) return;
    saveToStorage();
    showExportYamlModal();
};

const showExportYamlModal = async () => {
    dom.exportYamlModal.classList.add('visible');
    dom.exportYamlFilename.value = sanitizeFilename(state.name || 'story-map');
    const data = serialize();
    dom.exportYamlText.value = exportToYaml(data);
    // Fetch full backups to include in YAML export
    if (state.mapId) {
        try {
            const res = await fetch(`/api/backups/${state.mapId}`);
            const meta = await res.json();
            if (meta.length) {
                const fullBackups = [];
                for (const b of meta) {
                    const r = await fetch(`/api/backups/${state.mapId}/${b.id}`);
                    if (r.ok) fullBackups.push(await r.json());
                }
                data.backups = fullBackups;
                dom.exportYamlText.value = exportToYaml(data);
            }
        } catch { /* best-effort */ }
    }
};

const hideExportYamlModal = () => {
    dom.exportYamlModal.classList.remove('visible');
};

const copyExportYaml = async () => {
    const yaml = dom.exportYamlText.value;
    try {
        await navigator.clipboard.writeText(yaml);
        dom.exportYamlCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportYamlCopyBtn.textContent = 'Copy to Clipboard', 2000);
    } catch {
        dom.exportYamlText.select();
        document.execCommand('copy');
        dom.exportYamlCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportYamlCopyBtn.textContent = 'Copy to Clipboard', 2000);
    }
};

const downloadExportYamlFile = () => {
    const filename = sanitizeFilename(dom.exportYamlFilename.value) + '.yaml';
    const yaml = dom.exportYamlText.value;
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideExportYamlModal();
};

// =============================================================================
// Backups
// =============================================================================

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let toastTimer;
const showToast = (message, duration = 2500) => {
    clearTimeout(toastTimer);
    dom.appToast.textContent = message;
    dom.appToast.classList.add('visible');
    toastTimer = setTimeout(() => dom.appToast.classList.remove('visible'), duration);
};

const relativeTime = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString();
};

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
};

const showBackupsModal = async () => {
    if (!state.mapId) return;
    dom.createBackupBtn.style.display = isMapEditable() ? '' : 'none';
    dom.backupsModal.classList.add('visible');
    await refreshBackupsList();
};

const hideBackupsModal = () => {
    dom.backupsModal.classList.remove('visible');
};

const updateBackupBadge = (count) => {
    if (count > 0) {
        dom.backupCountBadge.textContent = count;
        dom.backupCountBadge.classList.remove('hidden');
    } else {
        dom.backupCountBadge.classList.add('hidden');
    }
};

const refreshBackupsList = async () => {
    try {
        const res = await fetch(`/api/backups/${state.mapId}`);
        const backups = await res.json();
        updateBackupBadge(backups.length);
        if (!backups.length) {
            dom.backupsList.innerHTML = `<div class="backups-empty">
                <svg class="backups-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                <span>No backups yet</span>
            </div>`;
            return;
        }
        const isAuto = (note) => note && note.startsWith('Auto:');
        const editable = isMapEditable();
        const iconSvg = (b) => b.imported
            ? '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>'
            : isAuto(b.note)
            ? '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'
            : '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>';
        const iconClass = (b) => b.imported ? ' backup-icon-imported' : isAuto(b.note) ? ' backup-icon-auto' : '';
        const label = (b, safeNote) => {
            if (b.imported && safeNote) return safeNote;
            if (b.imported) return 'Imported backup';
            if (safeNote) return safeNote;
            return isAuto(b.note) ? 'Auto backup' : 'Manual backup';
        };
        dom.backupsList.innerHTML = backups.slice().sort((a, c) => new Date(c.timestamp) - new Date(a.timestamp)).map(b => {
            const safeId = escHtml(b.id);
            const safeNote = b.note ? escHtml(b.note) : '';
            return `
            <div class="backup-row" data-id="${safeId}">
                <div class="backup-icon${iconClass(b)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${iconSvg(b)}
                    </svg>
                </div>
                <div class="backup-info">
                    <div class="backup-time">${label(b, safeNote)}</div>
                    ${b.mapName ? `<div class="backup-meta">${b.imported ? '<span class="backup-imported-tag">Imported</span> &middot; ' : ''}${escHtml(b.mapName)}</div>` : (b.imported ? `<div class="backup-meta"><span class="backup-imported-tag">Imported</span></div>` : '')}
                    <div class="backup-meta" title="${new Date(b.timestamp).toLocaleString()}">${relativeTime(b.timestamp)} &middot; ${formatSize(b.size)}${b.cardCount ? ` &middot; ${b.cardCount} cards` : ''}</div>
                </div>
                <div class="backup-actions">
                    ${editable ? `<button class="backup-restore-btn" data-id="${safeId}">Restore</button>` : ''}
                    ${editable ? `<button class="backup-delete-btn" data-id="${safeId}" title="Delete">&times;</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch {
        dom.backupsList.innerHTML = '<div class="backups-empty">Failed to load backups</div>';
    }
};

const setCreateBtnLabel = (text) => {
    const svg = dom.createBackupBtn.querySelector('svg');
    dom.createBackupBtn.textContent = '';
    if (svg) dom.createBackupBtn.prepend(svg);
    dom.createBackupBtn.append(text);
};

const createBackup = async () => {
    const note = prompt('Backup note (optional):');
    if (note === null) return;
    try {
        dom.createBackupBtn.disabled = true;
        setCreateBtnLabel('Creating...');
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
        await refreshBackupsList();
    } catch {
        alert('Failed to create backup');
    } finally {
        dom.createBackupBtn.disabled = false;
        setCreateBtnLabel('Create Backup');
    }
};

const restoreBackup = async (backupId) => {
    if (!isMapEditable()) {
        alert('Cannot restore while the map is locked.');
        return;
    }
    if (!confirm('Restore this backup? A safety backup of the current state will be created first.')) return;
    try {
        // Create safety backup
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: 'Auto: before restore' }),
        });
        // Fetch backup data
        const res = await fetch(`/api/backups/${state.mapId}/${backupId}`);
        if (!res.ok) throw new Error('Backup not found');
        const backup = await res.json();
        const data = JSON.parse(backup.data);
        pushUndo();
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        hideBackupsModal();
        showToast('Backup restored');
    } catch {
        alert('Failed to restore backup');
    }
};

const deleteBackup = async (backupId) => {
    if (!confirm('Delete this backup?')) return;
    try {
        await fetch(`/api/backups/${state.mapId}/${backupId}`, { method: 'DELETE' });
        await refreshBackupsList();
    } catch {
        alert('Failed to delete backup');
    }
};

const loadSample = async (name) => {
    if (!state.mapId) {
        return startWithSample(name);
    }

    saveToStorage();
    if (!confirmOverwrite()) return;

    try {
        const response = await fetch(`samples/${name}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        pushUndo();
        deserialize(await response.json());
        dom.boardName.value = state.name;
        renderAndSave();
    } catch {
        alert('Failed to load sample');
    }
};

const newMap = async () => {
    saveToStorage();
    if (hasContent() && !confirm('Create a new story map?\n\nYou can return to this map using the back button.')) {
        return;
    }
    destroyYjs();

    state.mapId = null;

    hideWelcomeScreen();

    initState();
    dom.boardName.value = '';
    render();

    const mapId = await newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

const copyMap = async () => {
    saveToStorage();
    if (!confirm('Copy this map?\n\nA copy will be created with a new URL.')) {
        return;
    }
    destroyYjs();

    const currentName = dom.boardName.value || 'Untitled';
    state.name = `${currentName} (Copy)`;
    dom.boardName.value = state.name;

    const mapId = await newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

// =============================================================================
// Event Listeners
// =============================================================================

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// =============================================================================
// Search / Filter
// =============================================================================

let searchDebounceTimer = null;
const filterState = { statuses: new Set(), colors: new Set(), tags: new Set() };

const openSearch = () => {
    if (dom.searchBtn.disabled) return;
    dom.searchBar.classList.remove('hidden');
    dom.boardName.style.display = 'none';
    dom.storyMap.classList.add('search-active');
    dom.searchInput.focus();
};

const closeSearch = () => {
    dom.searchBar.classList.add('hidden');
    dom.boardName.style.display = '';
    dom.storyMap.classList.remove('search-active');
    dom.searchInput.value = '';
    closeFilterPanel();
    clearAllFilters();
    clearSearchFilter();
};

const clearSearchFilter = () => {
    dom.storyMap.querySelectorAll('.search-dimmed').forEach(el => el.classList.remove('search-dimmed'));
};

const hasActiveFilters = () => filterState.statuses.size > 0 || filterState.colors.size > 0 || filterState.tags.size > 0;

// Look up the state object for a card element
const getItemForStep = (step) => {
    const colId = step.dataset.columnId;
    const mainCol = state.columns.find(c => c.id === colId);
    if (mainCol) return mainCol;
    for (const pm of state.partialMaps) {
        const pmCol = pm.columns.find(c => c.id === colId);
        if (pmCol) return pmCol;
    }
    return undefined;
};

const getItemForStoryCard = (card) => {
    const storyId = card.dataset.storyId;
    const sliceId = card.dataset.sliceId;
    const colId = card.dataset.columnId;
    const rowType = card.dataset.rowType;
    if (rowType === 'users') {
        const main = state.users[colId]?.find(s => s.id === storyId);
        if (main) return main;
        for (const pm of state.partialMaps) {
            const found = pm.users?.[colId]?.find(s => s.id === storyId);
            if (found) return found;
        }
        return undefined;
    }
    if (rowType === 'activities') {
        const main = state.activities[colId]?.find(s => s.id === storyId);
        if (main) return main;
        for (const pm of state.partialMaps) {
            const found = pm.activities?.[colId]?.find(s => s.id === storyId);
            if (found) return found;
        }
        return undefined;
    }
    const slice = state.slices.find(s => s.id === sliceId);
    const mainStory = slice?.stories[colId]?.find(s => s.id === storyId);
    if (mainStory) return mainStory;
    for (const pm of state.partialMaps) {
        const found = pm.stories?.[sliceId]?.[colId]?.find(s => s.id === storyId);
        if (found) return found;
    }
    return undefined;
};

const itemMatchesFilters = (item) => {
    if (!item) return false;
    if (filterState.statuses.size > 0) {
        const itemStatus = item.status || 'none';
        if (!filterState.statuses.has(itemStatus)) return false;
    }
    if (filterState.colors.size > 0) {
        const itemColor = (item.color || DEFAULT_CARD_COLORS.story).toLowerCase();
        if (!filterState.colors.has(itemColor)) return false;
    }
    if (filterState.tags.size > 0) {
        const itemTags = item.tags || [];
        if (!itemTags.some(t => filterState.tags.has(t))) return false;
    }
    return true;
};

const applySearchFilter = (query) => {
    clearSearchFilter();
    const q = query?.toLowerCase() || '';
    const filtering = hasActiveFilters();

    if (!q && !filtering) return;

    // Dim non-matching step cards
    dom.storyMap.querySelectorAll('.step').forEach(step => {
        const text = step.querySelector('.step-text')?.value?.toLowerCase() || '';
        const textMatch = !q || text.includes(q);
        const filterMatch = !filtering || itemMatchesFilters(getItemForStep(step));
        if (!textMatch || !filterMatch) step.classList.add('search-dimmed');
    });

    // Dim non-matching story cards
    dom.storyMap.querySelectorAll('.story-card').forEach(card => {
        const text = (card.querySelector('.story-text')?.value
            || card.querySelector('.story-text-preview')?.textContent || '').toLowerCase();
        const textMatch = !q || text.includes(q);
        const filterMatch = !filtering || itemMatchesFilters(getItemForStoryCard(card));
        if (!textMatch || !filterMatch) card.classList.add('search-dimmed');
    });
};

// Filter panel
const getUsedStatusesAndColors = () => {
    const statuses = new Set();
    const colors = new Set();
    state.columns.forEach(c => { if (c.color) colors.add(c.color.toLowerCase()); });
    const addFromCards = (cards) => {
        cards.forEach(s => {
            if (s.status) statuses.add(s.status);
            else statuses.add('none');
            colors.add((s.color || DEFAULT_CARD_COLORS.story).toLowerCase());
        });
    };
    Object.values(state.users || {}).forEach(addFromCards);
    Object.values(state.activities || {}).forEach(addFromCards);
    state.slices.forEach(slice => {
        Object.values(slice.stories || {}).forEach(addFromCards);
    });
    (state.partialMaps || []).forEach(pm => {
        pm.columns.forEach(c => { if (c.color) colors.add(c.color.toLowerCase()); });
        Object.values(pm.users || {}).forEach(addFromCards);
        Object.values(pm.activities || {}).forEach(addFromCards);
        Object.values(pm.stories || {}).forEach(sliceStories => {
            Object.values(sliceStories).forEach(addFromCards);
        });
    });
    return { statuses, colors };
};

const populateFilterPanel = () => {
    const used = getUsedStatusesAndColors();
    // Status checkboxes
    dom.filterStatusList.innerHTML = '';
    const statusEntries = [['none', 'No Status', '#e5e5e5'], ...Object.entries(STATUS_OPTIONS).map(([k, v]) => [k, v.label, v.color])];
    statusEntries.forEach(([key, label, color]) => {
        const inUse = used.statuses.has(key);
        const lbl = el('label', 'filter-checkbox');
        if (!inUse) lbl.classList.add('filter-disabled');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = filterState.statuses.has(key);
        cb.disabled = !inUse;
        const dot = el('span', 'filter-status-dot');
        dot.style.backgroundColor = color;
        const text = el('span', null, { text: label });
        cb.addEventListener('change', () => {
            if (cb.checked) filterState.statuses.add(key); else filterState.statuses.delete(key);
            updateFilterCountBadge();
            applySearchFilter(dom.searchInput.value.trim());
        });
        lbl.append(cb, dot, text);
        dom.filterStatusList.appendChild(lbl);
    });

    // Color swatches
    dom.filterColorList.innerHTML = '';
    const colorEntries = Object.entries(CARD_COLORS);
    const usedColors = colorEntries.filter(([, hex]) => used.colors.has(hex.toLowerCase()));
    const unusedColors = colorEntries.filter(([, hex]) => !used.colors.has(hex.toLowerCase()));
    [...usedColors, ...unusedColors].forEach(([name, hex]) => {
        const inUse = used.colors.has(hex.toLowerCase());
        const swatch = el('button', 'filter-color-swatch', { title: name });
        swatch.style.backgroundColor = hex;
        if (!inUse) { swatch.classList.add('filter-disabled'); swatch.disabled = true; }
        if (filterState.colors.has(hex.toLowerCase())) swatch.classList.add('selected');
        swatch.addEventListener('click', () => {
            const lc = hex.toLowerCase();
            if (filterState.colors.has(lc)) {
                filterState.colors.delete(lc);
                swatch.classList.remove('selected');
            } else {
                filterState.colors.add(lc);
                swatch.classList.add('selected');
            }
            updateFilterCountBadge();
            applySearchFilter(dom.searchInput.value.trim());
        });
        dom.filterColorList.appendChild(swatch);
    });

    // Tag checkboxes
    dom.filterTagsList.innerHTML = '';
    const allTags = getAllTagsInMap();
    if (allTags.length === 0) {
        dom.filterTagsList.appendChild(el('span', 'filter-empty', { text: 'No tags in map' }));
    } else {
        allTags.forEach(tag => {
            const lbl = el('label', 'filter-checkbox');
            const cb = el('input');
            cb.type = 'checkbox';
            cb.checked = filterState.tags.has(tag);
            const text = el('span', null, { text: tag });
            cb.addEventListener('change', () => {
                if (cb.checked) filterState.tags.add(tag); else filterState.tags.delete(tag);
                updateFilterCountBadge();
                applySearchFilter(dom.searchInput.value.trim());
            });
            lbl.append(cb, text);
            dom.filterTagsList.appendChild(lbl);
        });
    }
};

const openFilterPanel = () => {
    populateFilterPanel();
    dom.filterPanel.classList.remove('hidden');
    dom.searchFilterBtn.classList.add('active');
};

const closeFilterPanel = () => {
    dom.filterPanel.classList.add('hidden');
    dom.searchFilterBtn.classList.remove('active');
};

const toggleFilterPanel = () => {
    if (dom.filterPanel.classList.contains('hidden')) openFilterPanel(); else closeFilterPanel();
};

const updateFilterCountBadge = () => {
    const count = filterState.statuses.size + filterState.colors.size + filterState.tags.size;
    dom.filterCount.textContent = count;
    dom.filterCount.classList.toggle('hidden', count === 0);
    dom.searchFilterBtn.classList.toggle('has-filters', count > 0);
};

const clearAllFilters = () => {
    filterState.statuses.clear();
    filterState.colors.clear();
    filterState.tags.clear();
    updateFilterCountBadge();
    applySearchFilter(dom.searchInput.value.trim());
};

const initEventListeners = () => {
    dom.logoLink.addEventListener('click', (e) => {
        if (!state.mapId) return;
        e.preventDefault();
        if (!hasContent() || confirm('Go to home page?\n\nYou can return to this map using the back button.')) {
            window.location.href = '/';
        }
    });

    dom.welcomeNewBtn.addEventListener('click', startNewMap);

    document.querySelector('.welcome-samples-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-sample');
        if (btn?.dataset.sample) {
            e.stopPropagation();
            startWithSample(btn.dataset.sample);
        }
    });

    window.addEventListener('popstate', async (e) => {
        // Ignore popstate from our own history.back() after closing expand modal
        if (_poppingExpandState) {
            _poppingExpandState = false;
            return;
        }
        // Back button closes expand modal instead of navigating
        if (_expandedItem) {
            _closingExpandViaBack = true;
            closeExpandModal();
            _closingExpandViaBack = false;
            return;
        }
        const mapId = window.location.pathname.slice(1) || null;
        if (mapId) {
            await loadMapById(mapId);
            hideWelcomeScreen();
        } else {
            destroyYjs();
            showWelcomeScreen();
        }
    });

    dom.boardName.addEventListener('input', (e) => {
        state.name = e.target.value;
        saveToStorage();
    });

    dom.boardName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dom.boardName.blur();
        }
    });

    dom.newMapBtn.addEventListener('click', () => {
        closeMainMenu();
        newMap();
    });
    dom.copyExistingBtn.addEventListener('click', () => {
        closeMainMenu();
        copyMap();
    });
    dom.exportBtn.addEventListener('click', () => {
        closeMainMenu();
        exportMap();
    });
    dom.printBtn.addEventListener('click', () => {
        closeMainMenu();
        const originalTitle = document.title;
        document.title = sanitizeFilename(state.name || 'story-map');
        window.print();
        document.title = originalTitle;
    });
    // Backups
    dom.backupsBtn.addEventListener('click', () => {
        closeMainMenu();
        showBackupsModal();
    });
    dom.backupsModalClose.addEventListener('click', hideBackupsModal);
    dom.backupsModal.addEventListener('click', (e) => {
        if (e.target === dom.backupsModal) hideBackupsModal();
    });
    dom.createBackupBtn.addEventListener('click', createBackup);
    dom.backupsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('backup-restore-btn')) restoreBackup(id);
        else if (btn.classList.contains('backup-delete-btn')) deleteBackup(id);
    });

    dom.toggleCursorsBtn?.addEventListener('click', () => {
        closeMainMenu();
        toggleCursorsVisibility();
    });
    // Focus mode toggle
    let focusMode = localStorage.getItem('focusMode') === 'true';
    function applyFocusMode() {
        document.body.classList.toggle('focus-mode', focusMode);
        if (dom.toggleFocusModeText) {
            dom.toggleFocusModeText.textContent = focusMode ? 'Exit Focus Mode' : 'Focus Mode';
        }
    }
    applyFocusMode();
    dom.toggleFocusModeBtn?.addEventListener('click', () => {
        closeMainMenu();
        focusMode = !focusMode;
        localStorage.setItem('focusMode', focusMode);
        applyFocusMode();
    });
    // Fullscreen mode — double-Esc to exit (single Esc is used by modals, expand view, etc.)
    let fullscreenMode = false;
    let lastFullscreenEsc = 0;
    let keyboardLocked = false;
    const updateFullscreenLabel = () => {
        if (dom.toggleFullscreenText) {
            dom.toggleFullscreenText.textContent = fullscreenMode ? 'Exit Full Screen Mode' : 'Full Screen Mode';
        }
    };
    const enterFullscreenMode = () => {
        fullscreenMode = true;
        lastFullscreenEsc = 0;
        document.documentElement.requestFullscreen().then(() => {
            requestAnimationFrame(zoomToFit);
            // Keyboard Lock API (Chrome/Edge): prevent browser from auto-exiting on Esc
            if (navigator.keyboard?.lock) {
                navigator.keyboard.lock(['Escape']).then(() => { keyboardLocked = true; }).catch(() => {});
            }
        }).catch(() => { fullscreenMode = false; });
    };
    const exitFullscreenMode = () => {
        fullscreenMode = false;
        lastFullscreenEsc = 0;
        keyboardLocked = false;
        if (document.fullscreenElement) {
            const p = document.exitFullscreen();
            if (p?.then) p.then(() => requestAnimationFrame(zoomToFit));
        }
    };
    if (dom.toggleFullscreenBtn && !document.fullscreenEnabled) {
        dom.toggleFullscreenBtn.style.display = 'none';
    }
    dom.toggleFullscreenBtn?.addEventListener('click', () => {
        closeMainMenu();
        if (fullscreenMode) exitFullscreenMode();
        else enterFullscreenMode();
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && fullscreenMode) {
            // Browser exited fullscreen (Esc without keyboard lock) — re-enter
            document.documentElement.requestFullscreen().then(() => {
                if (navigator.keyboard?.lock) {
                    navigator.keyboard.lock(['Escape']).then(() => { keyboardLocked = true; }).catch(() => {});
                }
            }).catch(() => { fullscreenMode = false; requestAnimationFrame(zoomToFit); });
        }
        if (!document.fullscreenElement && !fullscreenMode) {
            keyboardLocked = false;
            requestAnimationFrame(zoomToFit);
        }
        updateFullscreenLabel();
    });
    dom.importJsonMenuItem.addEventListener('click', () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            alert('This map is read-only. Unlock it first to import.');
            return;
        }
        showImportModal();
    });
    dom.importYamlMenuItem.addEventListener('click', () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            alert('This map is read-only. Unlock it first to import.');
            return;
        }
        showImportYamlModal();
    });

    // Import JSON modal events
    dom.importModalClose.addEventListener('click', hideImportModal);
    dom.importModal.addEventListener('click', (e) => {
        if (e.target === dom.importModal) hideImportModal();
    });
    dom.importJsonBtn.addEventListener('click', () => {
        const jsonText = dom.importJsonText.value.trim();
        if (jsonText) importFromJsonText(jsonText);
    });
    dom.importJsonText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const jsonText = dom.importJsonText.value.trim();
            if (jsonText) importFromJsonText(jsonText);
        }
    });
    dom.importDropzone.addEventListener('click', () => {
        dom.importFileInput.click();
    });
    dom.importFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            hideImportModal();
            importMap(e.target.files[0]);
            e.target.value = '';
        }
    });
    dom.importDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.importDropzone.classList.add('dragover');
    });
    dom.importDropzone.addEventListener('dragleave', () => {
        dom.importDropzone.classList.remove('dragover');
    });
    dom.importDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.importDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            hideImportModal();
            importMap(file);
        }
    });

    // Import YAML modal events
    dom.importYamlModalClose.addEventListener('click', hideImportYamlModal);
    dom.importYamlModal.addEventListener('click', (e) => {
        if (e.target === dom.importYamlModal) hideImportYamlModal();
    });
    dom.importYamlBtn.addEventListener('click', () => {
        const yamlText = dom.importYamlText.value.trim();
        if (yamlText) importFromYamlText(yamlText);
    });
    dom.importYamlText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const yamlText = dom.importYamlText.value.trim();
            if (yamlText) importFromYamlText(yamlText);
        }
    });
    dom.importYamlDropzone.addEventListener('click', () => {
        dom.importYamlFileInput.click();
    });
    dom.importYamlFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            hideImportYamlModal();
            importYamlFile(e.target.files[0]);
            e.target.value = '';
        }
    });
    dom.importYamlDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.importYamlDropzone.classList.add('dragover');
    });
    dom.importYamlDropzone.addEventListener('dragleave', () => {
        dom.importYamlDropzone.classList.remove('dragover');
    });
    dom.importYamlDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.importYamlDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.yaml') || file.name.endsWith('.yml'))) {
            hideImportYamlModal();
            importYamlFile(file);
        }
    });

    // Export JSON modal events
    dom.exportModalClose.addEventListener('click', hideExportModal);
    dom.exportModal.addEventListener('click', (e) => {
        if (e.target === dom.exportModal) hideExportModal();
    });
    dom.exportMinify.addEventListener('change', updateExportJson);
    dom.exportCopyBtn.addEventListener('click', copyExportJson);
    dom.exportDownloadBtn.addEventListener('click', downloadExportFile);

    // Export YAML modal events
    dom.exportYamlBtn.addEventListener('click', () => {
        closeMainMenu();
        exportYaml();
    });
    dom.exportYamlModalClose.addEventListener('click', hideExportYamlModal);
    dom.exportYamlModal.addEventListener('click', (e) => {
        if (e.target === dom.exportYamlModal) hideExportYamlModal();
    });
    dom.exportYamlCopyBtn.addEventListener('click', copyExportYaml);
    dom.exportYamlDownloadBtn.addEventListener('click', downloadExportYamlFile);

    // Jira Export Modal
    dom.exportJiraBtn.addEventListener('click', () => {
        closeMainMenu();
        showJiraExportModal();
    });
    dom.jiraExportModalClose.addEventListener('click', confirmCloseJiraExportModal);
    dom.jiraExportModal.addEventListener('click', (e) => {
        if (e.target === dom.jiraExportModal) confirmCloseJiraExportModal();
    });
    dom.jiraExportCancel.addEventListener('click', confirmCloseJiraExportModal);
    dom.jiraExportDownload.addEventListener('click', () => {
        downloadJiraCsv();
    });
    [dom.jiraStatusNone, dom.jiraStatusPlanned, dom.jiraStatusInProgress, dom.jiraStatusDone].forEach(input => {
        input.addEventListener('input', populateJiraExportEpics);
    });
    const statusFilters = [
        { el: dom.jiraFilterNone, status: 'none' },
        { el: dom.jiraFilterPlanned, status: 'planned' },
        { el: dom.jiraFilterInProgress, status: 'in-progress' },
        { el: dom.jiraFilterDone, status: 'done' }
    ];
    statusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                jiraExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                jiraExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateJiraExportEpics();
        });
    });

    // Phabricator Export Modal
    dom.exportPhabBtn.addEventListener('click', () => {
        if (dom.exportPhabBtn.disabled) return;
        closeMainMenu();
        showPhabExportModal();
    });
    dom.phabExportModalClose.addEventListener('click', confirmClosePhabModal);
    dom.phabExportModal.addEventListener('click', (e) => {
        if (e.target === dom.phabExportModal) confirmClosePhabModal();
    });
    dom.phabExportCancel.addEventListener('click', confirmClosePhabModal);
    dom.phabExportNext.addEventListener('click', showPhabStage2);
    dom.phabExportBack.addEventListener('click', showPhabStage1);
    dom.phabExportDone.addEventListener('click', hidePhabExportModal);
    dom.phabCopyFunction.addEventListener('click', () => {
        copyPhabCode(dom.phabImportFunction, dom.phabCopyFunction);
    });
    dom.phabCopyCall.addEventListener('click', () => {
        copyPhabCode(dom.phabImportCall, dom.phabCopyCall);
    });
    document.getElementById('phabTokenHelpLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To get your API token:\n\n1. Click your profile picture in Phabricator\n2. Go to Settings\n3. Click "Conduit API Tokens"\n4. Click "Generate Token"');
    });
    dom.phabInstanceUrl.addEventListener('input', () => {
        dom.phabImportFunction.textContent = generatePhabImportFunction();
    });
    dom.phabApiToken.addEventListener('input', () => {
        dom.phabImportCall.textContent = generatePhabImportCall();
    });
    dom.phabTags.addEventListener('input', () => {
        dom.phabImportCall.textContent = generatePhabImportCall();
    });
    const phabStatusFilters = [
        { el: dom.phabFilterNone, status: 'none' },
        { el: dom.phabFilterPlanned, status: 'planned' },
        { el: dom.phabFilterInProgress, status: 'in-progress' },
        { el: dom.phabFilterDone, status: 'done' }
    ];
    phabStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                phabExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                phabExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populatePhabExportEpics();
        });
    });

    // Jira API Export Modal
    dom.exportJiraApiBtn.addEventListener('click', () => {
        if (dom.exportJiraApiBtn.disabled) return;
        closeMainMenu();
        showJiraApiExportModal();
    });
    dom.jiraApiExportModalClose.addEventListener('click', confirmCloseJiraApiModal);
    dom.jiraApiExportModal.addEventListener('click', (e) => {
        if (e.target === dom.jiraApiExportModal) confirmCloseJiraApiModal();
    });
    dom.jiraApiExportCancel.addEventListener('click', confirmCloseJiraApiModal);
    dom.jiraApiExportNext.addEventListener('click', showJiraApiStage2);
    dom.jiraApiExportBack.addEventListener('click', showJiraApiStage1);
    dom.jiraApiExportDone.addEventListener('click', hideJiraApiExportModal);
    dom.jiraApiCopyFunction.addEventListener('click', () => {
        copyPhabCode(dom.jiraApiImportFunction, dom.jiraApiCopyFunction);
    });
    dom.jiraApiCopyCall.addEventListener('click', () => {
        copyPhabCode(dom.jiraApiImportCall, dom.jiraApiCopyCall);
    });
    dom.jiraApiEmail.addEventListener('input', () => {
        dom.jiraApiImportCall.textContent = generateJiraApiImportCall();
    });
    dom.jiraApiToken.addEventListener('input', () => {
        dom.jiraApiImportCall.textContent = generateJiraApiImportCall();
    });
    dom.jiraApiProjectKey.addEventListener('input', () => {
        dom.jiraApiImportCall.textContent = generateJiraApiImportCall();
    });
    const jiraApiStatusFilters = [
        { el: dom.jiraApiFilterNone, status: 'none' },
        { el: dom.jiraApiFilterPlanned, status: 'planned' },
        { el: dom.jiraApiFilterInProgress, status: 'in-progress' },
        { el: dom.jiraApiFilterDone, status: 'done' }
    ];
    jiraApiStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                jiraApiExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                jiraApiExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateJiraApiExportEpics();
        });
    });

    // Asana Export Modal
    dom.exportAsanaBtn.addEventListener('click', () => {
        if (dom.exportAsanaBtn.disabled) return;
        closeMainMenu();
        showAsanaExportModal();
    });
    dom.asanaExportModalClose.addEventListener('click', confirmCloseAsanaModal);
    dom.asanaExportModal.addEventListener('click', (e) => {
        if (e.target === dom.asanaExportModal) confirmCloseAsanaModal();
    });
    dom.asanaExportCancel.addEventListener('click', confirmCloseAsanaModal);
    dom.asanaExportNext.addEventListener('click', showAsanaStage2);
    dom.asanaExportBack.addEventListener('click', showAsanaStage1);
    dom.asanaExportDone.addEventListener('click', hideAsanaExportModal);
    dom.asanaCopyFunction.addEventListener('click', () => {
        copyPhabCode(dom.asanaImportFunction, dom.asanaCopyFunction);
    });
    dom.asanaCopyCall.addEventListener('click', () => {
        copyPhabCode(dom.asanaImportCall, dom.asanaCopyCall);
    });
    dom.asanaApiToken.addEventListener('input', () => {
        dom.asanaImportCall.textContent = generateAsanaImportCall();
    });
    dom.asanaProjectUrl.addEventListener('input', () => {
        dom.asanaImportCall.textContent = generateAsanaImportCall();
    });
    const asanaStatusFilters = [
        { el: dom.asanaFilterNone, status: 'none' },
        { el: dom.asanaFilterPlanned, status: 'planned' },
        { el: dom.asanaFilterInProgress, status: 'in-progress' },
        { el: dom.asanaFilterDone, status: 'done' }
    ];
    asanaStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                asanaExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                asanaExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateAsanaExportEpics();
        });
    });

    // Asana CSV Export Modal
    dom.exportAsanaCsvBtn.addEventListener('click', () => {
        if (dom.exportAsanaCsvBtn.disabled) return;
        closeMainMenu();
        showAsanaCsvExportModal();
    });
    dom.asanaCsvExportModalClose.addEventListener('click', confirmCloseAsanaCsvModal);
    dom.asanaCsvExportModal.addEventListener('click', (e) => {
        if (e.target === dom.asanaCsvExportModal) confirmCloseAsanaCsvModal();
    });
    dom.asanaCsvExportCancel.addEventListener('click', confirmCloseAsanaCsvModal);
    dom.asanaCsvExportDownload.addEventListener('click', downloadAsanaCsv);
    const asanaCsvStatusFilters = [
        { el: dom.asanaCsvFilterNone, status: 'none' },
        { el: dom.asanaCsvFilterPlanned, status: 'planned' },
        { el: dom.asanaCsvFilterInProgress, status: 'in-progress' },
        { el: dom.asanaCsvFilterDone, status: 'done' }
    ];
    asanaCsvStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                asanaCsvExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                asanaCsvExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateAsanaCsvExportEpics();
        });
    });

    // Share dropdown
    dom.shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMainMenu();
        const onMap = !dom.welcomeScreen.classList.contains('visible');
        dom.shareScreenshot.disabled = !onMap;
        dom.shareDownload.disabled = !onMap;
        dom.shareMenu.classList.toggle('visible');
    });
    dom.shareCopyLink.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            dom.shareBtn.textContent = 'Copied!';
            setTimeout(() => dom.shareBtn.textContent = 'Share', 2000);
        } catch {
            prompt('Copy this link to share:', url);
        }
    });
    const captureMap = async () => {
        if (!window._htmlToImage) {
            const mod = await import('/vendor/html-to-image.bundle.js');
            window._htmlToImage = mod;
        }

        const dpr = Math.max(window.devicePixelRatio || 2, 2);

        // Capture the map as a canvas (no logo in live DOM — avoids flicker)
        const mapCanvas = await window._htmlToImage.toCanvas(dom.storyMap, {
            backgroundColor: '#f8fafc',
            pixelRatio: dpr,
            style: {
                transform: 'none',
                margin: '0',
                minWidth: '0',
                padding: '24px',
            },
        });

        // Capture the logo separately
        const logoCanvas = await window._htmlToImage.toCanvas(dom.logoLink, {
            backgroundColor: 'transparent',
            pixelRatio: dpr,
        });

        // Composite: logo on top, then map below with spacing
        const logoPad = 24 * dpr; // padding around edges (matches map padding), scaled by pixelRatio
        const logoGap = 60 * dpr; // gap between logo and map, scaled by pixelRatio
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = Math.max(mapCanvas.width, logoCanvas.width + logoPad * 2);
        finalCanvas.height = mapCanvas.height + logoCanvas.height + logoGap;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(logoCanvas, logoPad, logoPad);
        ctx.drawImage(mapCanvas, 0, logoCanvas.height + logoGap);

        // Draw legend in bottom-right corner
        if (state.legend?.length) {
            const s = dpr; // scale factor
            const font = `${13 * s}px system-ui, -apple-system, sans-serif`;
            const titleFont = `600 ${12 * s}px system-ui, -apple-system, sans-serif`;
            const swatchSize = 22 * s;
            const rowH = 28 * s;
            const pad = 14 * s;
            const gap = 6 * s;

            // Measure text widths
            ctx.font = font;
            const maxLabelW = Math.max(...state.legend.map(e => ctx.measureText(e.label).width));
            const boxW = pad + swatchSize + gap + maxLabelW + pad;
            const titleH = 18 * s;
            const boxH = pad + titleH + state.legend.length * rowH + pad;

            const bx = finalCanvas.width - boxW - logoPad;
            const by = finalCanvas.height - boxH - logoPad;

            // Background with rounded corners
            const r = 8 * s;
            ctx.beginPath();
            ctx.moveTo(bx + r, by);
            ctx.lineTo(bx + boxW - r, by);
            ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
            ctx.lineTo(bx + boxW, by + boxH - r);
            ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
            ctx.lineTo(bx + r, by + boxH);
            ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
            ctx.lineTo(bx, by + r);
            ctx.quadraticCurveTo(bx, by, bx + r, by);
            ctx.closePath();
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = '#e2e2e2';
            ctx.lineWidth = 1 * s;
            ctx.stroke();

            // Title
            ctx.font = titleFont;
            ctx.fillStyle = '#666';
            ctx.fillText('Legend', bx + pad, by + pad + 12 * s);

            // Entries
            state.legend.forEach((entry, i) => {
                const ry = by + pad + titleH + i * rowH;
                // Swatch
                const sr = 4 * s;
                const sx = bx + pad;
                const sy = ry + (rowH - swatchSize) / 2;
                ctx.beginPath();
                ctx.moveTo(sx + sr, sy);
                ctx.lineTo(sx + swatchSize - sr, sy);
                ctx.quadraticCurveTo(sx + swatchSize, sy, sx + swatchSize, sy + sr);
                ctx.lineTo(sx + swatchSize, sy + swatchSize - sr);
                ctx.quadraticCurveTo(sx + swatchSize, sy + swatchSize, sx + swatchSize - sr, sy + swatchSize);
                ctx.lineTo(sx + sr, sy + swatchSize);
                ctx.quadraticCurveTo(sx, sy + swatchSize, sx, sy + swatchSize - sr);
                ctx.lineTo(sx, sy + sr);
                ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
                ctx.closePath();
                ctx.fillStyle = entry.color;
                ctx.fill();
                // Label
                ctx.font = font;
                ctx.fillStyle = '#333';
                ctx.fillText(entry.label, bx + pad + swatchSize + gap, ry + rowH / 2 + 5 * s);
            });
        }

        return finalCanvas;
    };
    dom.shareScreenshot.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.shareBtn.textContent = 'Capturing...';
        try {
            const canvas = await captureMap();
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            dom.shareBtn.textContent = 'Copied!';
            setTimeout(() => dom.shareBtn.textContent = 'Share', 2000);
        } catch (err) {
            alert('Screenshot failed: ' + err.message);
            dom.shareBtn.textContent = 'Share';
        }
    });
    dom.shareDownload.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.shareBtn.textContent = 'Capturing...';
        try {
            const canvas = await captureMap();
            const dataUrl = canvas.toDataURL('image/png');
            const link = el('a', null, {
                href: dataUrl,
                download: sanitizeFilename(state.name || 'story-map') + '.png'
            });
            link.click();
            dom.shareBtn.textContent = 'Share';
        } catch (err) {
            alert('Screenshot failed: ' + err.message);
            dom.shareBtn.textContent = 'Share';
        }
    });

    // Undo/Redo buttons
    dom.undoBtn.addEventListener('click', () => { undo(); });
    dom.redoBtn.addEventListener('click', () => { redo(); });

    // Panel tab controls
    dom.legendToggle?.addEventListener('click', () => switchPanelTab('legend'));
    dom.partialsToggle?.addEventListener('click', () => switchPanelTab('partials'));
    dom.notesToggle?.addEventListener('click', () => switchPanelTab('notepad'));
    dom.legendAddBtn?.addEventListener('click', () => {
        if (state.legend.length >= Object.keys(CARD_COLORS).length) return;
        pushUndo();
        state.legend.push({
            id: generateId(),
            color: CARD_COLORS.yellow,
            label: ''
        });
        renderAndSave();
        const inputs = dom.legendEntries.querySelectorAll('.legend-label');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Search
    dom.searchBtn.addEventListener('click', openSearch);
    dom.searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => applySearchFilter(dom.searchInput.value.trim()), 150);
    });
    dom.searchClose.addEventListener('click', closeSearch);

    // Filter panel
    dom.searchFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFilterPanel();
    });
    dom.filterClearBtn.addEventListener('click', () => {
        clearAllFilters();
        populateFilterPanel();
    });
    dom.filterPanel.addEventListener('click', (e) => e.stopPropagation());
    dom.filterDoneBtn.addEventListener('click', closeFilterPanel);

    // Zoom controls
    dom.zoomIn.addEventListener('click', navigation.zoomIn);
    dom.zoomOut.addEventListener('click', navigation.zoomOut);
    dom.zoomReset.addEventListener('click', navigation.zoomCycle);

    // Main menu dropdown
    dom.menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.mainMenu.classList.toggle('visible');
        document.body.classList.toggle('main-menu-open', dom.mainMenu.classList.contains('visible'));
        const onMap = !dom.welcomeScreen.classList.contains('visible');
        dom.copyExistingBtn.disabled = !onMap;
        dom.exportSubmenuTrigger.disabled = !onMap;
        dom.printBtn.disabled = !onMap;
    });

    // Submenu collapse helper
    const collapseSubmenus = (...except) => {
        const all = [
            [dom.samplesSubmenuTrigger, dom.samplesSubmenu],
            [dom.importSubmenuTrigger, dom.importSubmenu],
            [dom.exportSubmenuTrigger, dom.exportSubmenu],
        ];
        all.forEach(([trigger, menu]) => {
            if (except.includes(trigger)) return;
            trigger.classList.remove('expanded');
            menu.classList.remove('visible');
        });
    };

    // Samples submenu toggle
    dom.samplesSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.samplesSubmenuTrigger);
        dom.samplesSubmenuTrigger.classList.toggle('expanded');
        dom.samplesSubmenu.classList.toggle('visible');
    });

    // Import submenu toggle
    dom.importSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.importSubmenuTrigger);
        dom.importSubmenuTrigger.classList.toggle('expanded');
        dom.importSubmenu.classList.toggle('visible');
    });

    // Export submenu toggle
    dom.exportSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.exportSubmenuTrigger);
        dom.exportSubmenuTrigger.classList.toggle('expanded');
        dom.exportSubmenu.classList.toggle('visible');
    });

    // Handle clicks on sample items in main menu
    dom.mainMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item?.dataset.sample) {
            if (lockState.isLocked && !lockState.sessionUnlocked) {
                alert('This map is read-only. Unlock it first to load a sample.');
                closeMainMenu();
                return;
            }
            loadSample(item.dataset.sample);
            closeMainMenu();
        }
    });

    document.addEventListener('click', () => {
        closeMainMenu();
        closeAllOptionsMenus();
        dom.shareMenu.classList.remove('visible');
        closeFilterPanel();
    });

    document.addEventListener('keydown', (e) => {
        const isTextInput = e.target.matches('input, textarea') || e.target.closest('.cm-editor');

        const isEmptyTextInput = isTextInput && e.target.matches('input, textarea') && !e.target.value;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && (!isTextInput || isEmptyTextInput)) {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && (!isTextInput || isEmptyTextInput)) {
            e.preventDefault();
            redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !isTextInput && selection.columnIds.length > 0) {
            e.preventDefault();
            duplicateColumns();
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput && selection.columnIds.length > 0) {
            e.preventDefault();
            const hasStorySelection = selection.clickedCards.some(c => c.type === 'story');
            if (hasStorySelection) {
                deleteSelectedCards();
            } else {
                deleteSelectedColumns();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape' && fullscreenMode) {
            const now = Date.now();
            if (now - lastFullscreenEsc < 500) {
                exitFullscreenMode();
                lastFullscreenEsc = 0;
                return;
            }
            lastFullscreenEsc = now;
        }
        if (e.key === 'Escape') {
            const hadOpenUI =
                dom.cardExpandModal.classList.contains('visible') ||
                !dom.filterPanel.classList.contains('hidden') ||
                !dom.searchBar.classList.contains('hidden') ||
                selection.columnIds.length > 0 ||
                dom.mainMenu.classList.contains('visible') ||
                dom.shareMenu.classList.contains('visible') ||
                dom.importModal.classList.contains('visible') ||
                dom.exportModal.classList.contains('visible') ||
                dom.backupsModal?.classList.contains('visible');
            if (dom.cardExpandModal.classList.contains('visible')) {
                closeExpandModal();
                return;
            }
            if (!dom.filterPanel.classList.contains('hidden')) {
                closeFilterPanel();
            } else if (!dom.searchBar.classList.contains('hidden')) {
                closeSearch();
            } else if (selection.columnIds.length > 0) {
                clearSelection();
                updateSelectionUI();
            }
            closeMainMenu();
            closeAllOptionsMenus();
            dom.shareMenu.classList.remove('visible');
            hideImportModal();
            hideExportModal();
            hideJiraExportModal();
            hideJiraApiExportModal();
            hidePhabExportModal();
            hideAsanaExportModal();
            hideAsanaCsvExportModal();
            if (fullscreenMode && !hadOpenUI) {
                showToast('Press Esc again to exit full screen mode', 1500);
            }
        }
        if (!isTextInput && ((e.altKey && e.key === 'r') || (e.shiftKey && e.code === 'Digit0'))) {
            e.preventDefault();
            zoomToFit();
        }
        if (!isTextInput && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const PAN_AMOUNT = 100;
            const wrapper = dom.storyMapWrapper;
            switch (e.key) {
                case 'ArrowLeft':
                    wrapper.scrollBy({ left: -PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowRight':
                    wrapper.scrollBy({ left: PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowUp':
                    wrapper.scrollBy({ top: -PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowDown':
                    wrapper.scrollBy({ top: PAN_AMOUNT, behavior: 'smooth' });
                    break;
            }
            e.preventDefault();
        }
    });

    // Pan/drag navigation (right-click to pan, Miro-style)
    navigation.initPan();

    // Marquee (rectangle) selection
    navigation.initMarquee();

    // Ctrl+scroll wheel zoom
    navigation.initWheelZoom();

    // Pinch-to-zoom on touch devices
    navigation.initPinchZoom();

    // Lock feature event listeners
    initLockListeners();
};

// =============================================================================
// Welcome Screen / Loading
// =============================================================================

let counterLoaded = false;
let legendAutoOpened = false;

const setCounterValue = (count) => {
    if (!dom.welcomeCounter) return;
    dom.welcomeCounter.innerHTML = `📊 <span class="count">${count.toLocaleString()}</span> story maps created`;
    dom.welcomeCounter.classList.add('visible');
};

const subscribeToCounter = async () => {
    if (!dom.welcomeCounter || counterLoaded) return;

    const cached = localStorage.getItem('mapCount');
    if (cached) {
        setCounterValue(parseInt(cached));
    }

    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        const count = data.mapCount || 0;
        if (count > 0) {
            localStorage.setItem('mapCount', count);
            setCounterValue(count);
        }
        counterLoaded = true;
    } catch {
        // Silently fail - counter is non-essential
    }
};

const unsubscribeFromCounter = () => {
    counterLoaded = false;
    dom.welcomeCounter?.classList.remove('visible');
};

const incrementMapCounter = async () => {
    try {
        const res = await fetch('/api/stats', { method: 'POST' });
        const data = await res.json();
        localStorage.setItem('mapCount', data.mapCount);
    } catch {
        // Silently fail - counter is non-essential
    }
};

// Unified panel tab switching
const switchPanelTab = (sectionKey) => {
    const sections = dom.panelBody?.querySelectorAll('.panel-section');
    const tabs = document.querySelectorAll('.panel-tab');
    const activeSection = dom.panelBody?.querySelector(`.panel-section[data-section="${sectionKey}"]`);
    const activeTab = document.querySelector(`.panel-tab[data-section="${sectionKey}"]`);

    if (!activeSection || !activeTab || activeTab.disabled) return;

    const isAlreadyOpen = activeSection.classList.contains('open');

    // Close all sections and deactivate all tabs
    sections?.forEach(s => s.classList.remove('open'));
    tabs.forEach(t => t.classList.remove('active'));

    if (isAlreadyOpen) {
        // Close the panel entirely
        dom.controlsRight?.classList.remove('panel-open');
    } else {
        // Open the requested section
        activeSection.classList.add('open');
        activeTab.classList.add('active');
        dom.controlsRight?.classList.add('panel-open');
        if (sectionKey === 'notepad') notepad.ensureEditor();
    }
};

const showWelcomeScreen = () => {
    document.body.classList.add('welcome-visible');
    dom.welcomeScreen.classList.add('visible');
    dom.storyMapWrapper.classList.remove('visible');
    dom.boardName.classList.add('hidden');
    dom.zoomControls.classList.add('hidden');
    dom.controlsRight?.classList.add('hidden');
    dom.controlsRight?.classList.remove('panel-open');
    dom.panelBody?.querySelectorAll('.panel-section').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    dom.searchBtn.disabled = true;
    closeSearch();
    clearPresence();
    clearCursors();
    clearLockSubscription();
    updateLockUI();
    subscribeToCounter();
};

const hideWelcomeScreen = () => {
    document.body.classList.remove('welcome-visible');
    dom.welcomeScreen.classList.remove('visible');
    dom.storyMapWrapper.classList.add('visible');
    dom.boardName.classList.remove('hidden');
    dom.zoomControls.classList.remove('hidden');
    dom.controlsRight?.classList.remove('hidden');
    dom.searchBtn.disabled = false;
    unsubscribeFromCounter();
    if (!legendAutoOpened && window.matchMedia('(pointer: fine)').matches) {
        switchPanelTab('legend');
        legendAutoOpened = true;
    }
};

const showLoading = () => {
    dom.loadingIndicator.classList.add('visible');
};

const hideLoading = () => {
    dom.loadingIndicator.classList.remove('visible');
};

const startNewMap = async () => {
    hideWelcomeScreen();
    initState();
    const mapId = await newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);
    dom.boardName.value = state.name;
    render();
    requestAnimationFrame(zoomToFit);
    setTimeout(showTutorialToast, 800);
    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

const showTutorialToast = () => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
    const shortcutEl = dom.tutorialToast.querySelector('.reset-shortcut-key');
    if (isMac && shortcutEl) shortcutEl.textContent = 'Shift + 0';
    dom.tutorialToast.classList.add('visible');
    const dismiss = () => {
        dom.tutorialToast.classList.remove('visible');
        clearTimeout(timer);
    };
    const timer = setTimeout(dismiss, 5000);
    dom.tutorialToastClose.addEventListener('click', dismiss, { once: true });
};

const startWithSample = async (sampleName) => {
    hideWelcomeScreen();
    initState();
    const mapId = await newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);

    try {
        const response = await fetch(`samples/${sampleName}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        deserialize(await response.json());
    } catch {
        alert('Failed to load sample');
    }
    dom.boardName.value = state.name;
    render();
    requestAnimationFrame(zoomToFit);
    setTimeout(showTutorialToast, 800);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

// =============================================================================
// Module Wiring
// =============================================================================

// Wire state module (needs serialize/deserialize + renderAndSave)
stateInit({ dom, serialize, deserialize, renderAndSave });

// Wire navigation module
navigation.init({ dom, state, updateSelectionUI, selection, clearSelection, isMapEditable, addColumnAt, deleteColumn, duplicateColumns, duplicateCards, deleteSelectedColumns, deleteSelectedCards, insertPartialMapRef: (...args) => insertPartialMapRef(...args) });

// Wire presence module
presence.init({
    getProvider,
    getYdoc,
    dom,
    getZoomLevel: () => navigation.zoomLevel,
    getState: () => state,
});

// Wire lock module
lock.init({
    state,
    dom,
    getProvider,
    getYdoc,
    getCursorColor,
    render,
    notepadUpdate: () => notepad.update(),
    saveToStorage,
    closeMainMenu,
    initSortable,
    renderLegend,
});

// Wire yjs module
yjs.init({
    state,
    notepad,
    dom,
    isMapEditable,
    render,
});

// Materialize phantom columns up to and including the given index (0-based).
// Columns before the target are created hidden (spacers); the target column is visible.
const materializePhantomColumn = (phantomIndex = 0) => {
    pushUndo();
    let targetColumn = null;
    for (let i = 0; i <= phantomIndex; i++) {
        const hidden = i < phantomIndex;
        const column = createColumn('', null, null, hidden);
        state.columns.push(column);
        state.users[column.id] = [];
        state.activities[column.id] = [];
        state.slices.forEach(slice => slice.stories[column.id] = []);
        if (!hidden) targetColumn = column;
    }
    renderAndSave();
    return targetColumn;
};

// =============================================================================
// Partial Map Operations
// =============================================================================

const createPartialMap = (name, columnIds) => {
    pushUndo();

    const selectedCols = state.columns.filter(c => columnIds.includes(c.id));
    if (selectedCols.length === 0) return;

    const pmId = generateId();

    // Deep-copy columns into partial definition
    const pmColumns = selectedCols.map(c => ({
        ...c,
        id: c.id,
        tags: [...(c.tags || [])]
    }));

    // Move stories from slices into the partial
    const pmStories = {};
    state.slices.forEach(slice => {
        pmStories[slice.id] = {};
        selectedCols.forEach(col => {
            pmStories[slice.id][col.id] = (slice.stories[col.id] || []).map(s => ({
                ...s,
                tags: [...(s.tags || [])]
            }));
            delete slice.stories[col.id];
        });
    });

    // Move users/activities into the partial
    const pmUsers = {};
    const pmActivities = {};
    selectedCols.forEach(col => {
        pmUsers[col.id] = (state.users[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        pmActivities[col.id] = (state.activities[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        delete state.users[col.id];
        delete state.activities[col.id];
    });

    state.partialMaps.push({
        id: pmId,
        name,
        columns: pmColumns,
        users: pmUsers,
        activities: pmActivities,
        stories: pmStories
    });

    // Replace selected columns with a single reference column at the first selected position
    const firstIdx = state.columns.findIndex(c => c.id === selectedCols[0].id);
    const refCol = createRefColumn(pmId, true);

    state.columns = state.columns.filter(c => !columnIds.includes(c.id));
    state.columns.splice(firstIdx, 0, refCol);

    // Add empty story arrays for the ref column
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });

    clearSelection();
    renderAndSave();

    switchPanelTab('partials');
};

const isColumnEmpty = (col) => {
    if (col.name && col.name.trim() !== '') return false;
    if ((state.users[col.id] || []).length > 0) return false;
    if ((state.activities[col.id] || []).length > 0) return false;
    return !state.slices.some(s => (s.stories[col.id] || []).length > 0);
};

const ensurePartialBlankCol = () => {
    const pmId = partialMapEditState.activeId;
    if (!pmId) return;
    const refCol = state.columns.find(c => c.partialMapId === pmId && c._editingHidden);
    if (!refCol) return;
    const refIdx = state.columns.indexOf(refCol);

    // Find end of partial's editing range using tracked IDs
    let endIdx = refIdx + 1;
    while (endIdx < state.columns.length && partialMapEditState.editingColIds.has(state.columns[endIdx].id)) {
        endIdx++;
    }

    // Check if the last column in range is already an empty blank
    if (endIdx > refIdx + 1) {
        const lastCol = state.columns[endIdx - 1];
        if (lastCol._partialBlank && isColumnEmpty(lastCol)) return;
    }

    // Add a new blank column at endIdx
    const blankCol = createColumn('', null, null, false);
    blankCol._partialBlank = true;
    state.columns.splice(endIdx, 0, blankCol);
    state.users[blankCol.id] = [];
    state.activities[blankCol.id] = [];
    state.slices.forEach(slice => { slice.stories[blankCol.id] = []; });
    partialMapEditState.editingColIds.add(blankCol.id);
};

const startEditingPartial = (partialMapId) => {
    const pm = state.partialMaps.find(p => p.id === partialMapId);
    if (!pm) return;

    partialMapEditState.expandedIds.clear();
    pushUndo();

    const refCol = state.columns.find(c => c.partialMapId === partialMapId && c.partialMapOrigin)
        || state.columns.find(c => c.partialMapId === partialMapId);
    if (!refCol) return;

    const refIdx = state.columns.indexOf(refCol);

    // Mark ref column as hidden during editing
    refCol._editingHidden = true;

    // Splice partial's columns into state.columns after the ref
    state.columns.splice(refIdx + 1, 0, ...pm.columns);

    // Inject partial's stories into slices
    state.slices.forEach(slice => {
        const pmSliceStories = pm.stories[slice.id] || {};
        pm.columns.forEach(col => {
            slice.stories[col.id] = pmSliceStories[col.id] || [];
        });
    });

    // Inject partial's users/activities into state
    pm.columns.forEach(col => {
        state.users[col.id] = (pm.users?.[col.id] || []);
        state.activities[col.id] = (pm.activities?.[col.id] || []);
    });

    partialMapEditState.activeId = partialMapId;
    partialMapEditState.editingColIds = new Set(pm.columns.map(c => c.id));

    // Add blank column at the right edge for adding new steps
    ensurePartialBlankCol();

    renderAndSave();

    requestAnimationFrame(() => {
        if (pm.columns.length > 0) {
            const firstCol = dom.storyMap.querySelector(`.step[data-column-id="${pm.columns[0].id}"]`);
            if (firstCol) scrollElementIntoView(firstCol);
        }
    });
};

const stopEditingPartial = () => {
    const pmId = partialMapEditState.activeId;
    if (!pmId) return;

    const pm = state.partialMaps.find(p => p.id === pmId);
    if (!pm) return;

    pushUndo();

    // Find the hidden ref column
    const refCol = state.columns.find(c => c.partialMapId === pmId && c._editingHidden);

    // Gather editing columns in state.columns order using tracked IDs
    const allRangeColIds = new Set(partialMapEditState.editingColIds);
    const editedColumns = state.columns.filter(c => allRangeColIds.has(c.id));

    // Prune trailing empty columns (blank columns the user didn't fill)
    while (editedColumns.length > 0 && isColumnEmpty(editedColumns[editedColumns.length - 1])) {
        editedColumns.pop();
    }

    // Update partial columns from the kept edited columns
    pm.columns = editedColumns.map(c => {
        const { _partialBlank, ...rest } = c;
        return { ...rest, tags: [...(c.tags || [])] };
    });

    // Update partial stories from slices
    pm.stories = {};
    state.slices.forEach(slice => {
        pm.stories[slice.id] = {};
        pm.columns.forEach(col => {
            pm.stories[slice.id][col.id] = (slice.stories[col.id] || []).map(s => ({
                ...s,
                tags: [...(s.tags || [])]
            }));
        });
        // Clean up all range columns from slice stories
        for (const colId of allRangeColIds) {
            delete slice.stories[colId];
        }
    });

    // Update partial users/activities from state
    pm.users = {};
    pm.activities = {};
    pm.columns.forEach(col => {
        pm.users[col.id] = (state.users[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        pm.activities[col.id] = (state.activities[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
    });
    // Clean up all range columns from state users/activities
    for (const colId of allRangeColIds) {
        delete state.users[colId];
        delete state.activities[colId];
    }

    // Remove all range columns from state.columns
    state.columns = state.columns.filter(c => !allRangeColIds.has(c.id));

    // Unhide the ref column
    if (refCol) delete refCol._editingHidden;

    partialMapEditState.activeId = null;
    partialMapEditState.editingColIds.clear();
    renderAndSave();
};

const deletePartialMap = (partialMapId) => {
    pushUndo();

    // Remove all reference columns pointing to this partial
    state.columns = state.columns.filter(c => c.partialMapId !== partialMapId);

    // Clean up stories/users/activities for removed ref columns
    const colIds = new Set(state.columns.map(c => c.id));
    state.slices.forEach(slice => {
        for (const colId of Object.keys(slice.stories)) {
            if (!colIds.has(colId)) delete slice.stories[colId];
        }
    });
    for (const colId of Object.keys(state.users)) {
        if (!colIds.has(colId)) delete state.users[colId];
    }
    for (const colId of Object.keys(state.activities)) {
        if (!colIds.has(colId)) delete state.activities[colId];
    }

    state.partialMaps = state.partialMaps.filter(p => p.id !== partialMapId);

    if (partialMapEditState.activeId === partialMapId) {
        partialMapEditState.activeId = null;
    }

    // Ensure at least one column remains
    if (state.columns.length === 0) {
        const col = createColumn('New Step', CARD_COLORS.green, null, false);
        state.columns.push(col);
        state.users[col.id] = [];
        state.activities[col.id] = [];
        state.slices.forEach(slice => slice.stories[col.id] = []);
    }

    renderAndSave();
};

const restorePartialMap = (partialMapId) => {
    const pm = state.partialMaps.find(p => p.id === partialMapId);
    if (!pm) return;

    pushUndo();

    // Find the first ref column for this partial (prefer origin)
    const refCol = state.columns.find(c => c.partialMapId === partialMapId && c.partialMapOrigin)
        || state.columns.find(c => c.partialMapId === partialMapId);
    const insertIdx = refCol ? state.columns.indexOf(refCol) : state.columns.length;

    // Count ref columns before the insert point (to adjust index after removal)
    const refsBefore = state.columns.filter((c, i) => c.partialMapId === partialMapId && i < insertIdx).length;

    // Remove ALL ref columns for this partial and clean up their data
    const refColIds = state.columns.filter(c => c.partialMapId === partialMapId).map(c => c.id);
    state.columns = state.columns.filter(c => c.partialMapId !== partialMapId);
    refColIds.forEach(colId => {
        delete state.users[colId];
        delete state.activities[colId];
    });
    state.slices.forEach(slice => {
        refColIds.forEach(colId => { delete slice.stories[colId]; });
    });

    const adjustedIdx = Math.min(insertIdx - refsBefore, state.columns.length);

    // Splice partial's columns back into state.columns
    state.columns.splice(adjustedIdx, 0, ...pm.columns);

    // Restore stories into slices
    state.slices.forEach(slice => {
        const pmSliceStories = pm.stories[slice.id] || {};
        pm.columns.forEach(col => {
            slice.stories[col.id] = pmSliceStories[col.id] || [];
        });
    });

    // Restore users/activities
    pm.columns.forEach(col => {
        state.users[col.id] = pm.users?.[col.id] || [];
        state.activities[col.id] = pm.activities?.[col.id] || [];
    });

    // Remove the partial definition
    state.partialMaps = state.partialMaps.filter(p => p.id !== partialMapId);

    if (partialMapEditState.activeId === partialMapId) {
        partialMapEditState.activeId = null;
    }

    renderAndSave();
};

const replaceWithPartial = (partialMapId, columnIds) => {
    pushUndo();

    const selectedCols = state.columns.filter(c => columnIds.includes(c.id));
    if (selectedCols.length === 0) return;

    const firstIdx = state.columns.findIndex(c => c.id === selectedCols[0].id);

    // Delete selected columns and their data
    state.columns = state.columns.filter(c => !columnIds.includes(c.id));
    columnIds.forEach(colId => {
        delete state.users[colId];
        delete state.activities[colId];
    });
    state.slices.forEach(slice => {
        columnIds.forEach(colId => {
            delete slice.stories[colId];
        });
    });

    // Insert ref column at the first selected position
    const refCol = createRefColumn(partialMapId, false);
    state.columns.splice(firstIdx, 0, refCol);
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });

    clearSelection();
    renderAndSave();
    switchPanelTab('partials');
};

const insertPartialMapRef = (partialMapId, afterColumnIndex) => {
    pushUndo();
    const refCol = createRefColumn(partialMapId, false);
    state.columns.splice(afterColumnIndex + 1, 0, refCol);
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });
    renderAndSave();
};

// Wire ui module
ui.init({
    state,
    dom,
    isMapEditable,
    pushUndo,
    addStory,
    deleteColumn,
    deleteStory,
    deleteSlice,
    saveToStorage,
    renderAndSave,
    scrollElementIntoView,
    addColumn,
    addSlice,
    materializePhantomColumn,
    handleColumnSelection,
    startEditingPartial,
    stopEditingPartial,
    deletePartialMap,
    restorePartialMap,
    openExpandModal,
});

// Wire render module
renderMod.init({
    state,
    dom,
    isMapEditable,
    pushUndo,
    saveToStorage,
    renderAndSave,
    ensureSortable,
    scrollElementIntoView,
    notepadUpdate: () => notepad.update(),
    getIsSafari: () => isSafari,
    getZoomLevel: () => navigation.zoomLevel,
    broadcastDragStart,
    broadcastDragEnd,
    getIsPinching: () => navigation.isPinching,
    createPartialMap,
    deletePartialMap,
    replaceWithPartial,
});

// =============================================================================
// Initialize
// =============================================================================

const loadMapById = async (mapId) => {
    destroyYjs();

    if (mapId) {
        state.mapId = mapId;
        await createYjsDoc(mapId);
        await subscribeToMap(mapId);

        // Data arrived via Yjs sync
        if (state.columns.length > 0) {
            return true;
        }

        // Yjs doc may still be loading from server persistence — wait briefly
        const ymap = getYmap();
        if (ymap) {
            const hasData = await new Promise(resolve => {
                let resolved = false;
                const done = (result) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    ymap.unobserveDeep(check);
                    resolve(result);
                };
                const timeout = setTimeout(() => done(false), 500);
                const check = () => {
                    syncFromYjs();
                    if (state.columns.length > 0) {
                        render();
                        done(true);
                    }
                };
                ymap.observeDeep(check);
            });
            if (hasData) return true;
        }

        // Fallback: load from localStorage if Yjs sync failed
        // Only skip if a *different* mapId is stored (null = no tracking yet, allow it)
        const storedMapId = localStorage.getItem(STORAGE_KEY + ':mapId');
        if ((!storedMapId || storedMapId === mapId) && loadFromStorage()) {
            dom.boardName.value = state.name;
            render();
            saveToStorage();
            return true;
        }
    }
    return false;
};

const init = async () => {
    const mapId = window.location.pathname.slice(1) || null;

    initEventListeners();
    notepad.init({ state, saveToStorage, isMapEditable });
    updateCursorsVisibilityUI();

    // Populate browser-specific DevTools instructions
    const devtoolsHint = isSafari
        ? 'first enable via Safari &gt; Settings &gt; Advanced &gt; <em>Show features for web developers</em>, then press <strong>Cmd+Option+I</strong>'
        : /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
            ? 'press <strong>Cmd+Option+I</strong>'
            : 'press <strong>F12</strong>';
    document.querySelectorAll('.devtools-instructions').forEach(el => {
        el.innerHTML = devtoolsHint;
    });

    if (mapId) {
        loadYjs(); // Start downloading Yjs modules in parallel with DOM setup
        showLoading();
        const loaded = await loadMapById(mapId);
        hideLoading();
        if (loaded) {
            hideWelcomeScreen();
            requestAnimationFrame(zoomToFit);
            setTimeout(showTutorialToast, 800);
        } else {
            showWelcomeScreen();
        }
    } else {
        showWelcomeScreen();
    }
};

init();
