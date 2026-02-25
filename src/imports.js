// Storymaps.io -- AGPL-3.0 -- see LICENCE for details
// Import Modules -- Jira Import via server proxy + shared import helpers

import { showConfirm } from '/src/modals.js';

let dom = null;
let onImportComplete = null;

export const init = (deps) => {
    dom = deps.dom;
    onImportComplete = deps.onImportComplete;
};

// ==================== SSE Reader (shared) ====================

export const readSSE = async (response, onProgress, onDone, onError) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', eventType = null;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            else if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (eventType === 'done') onDone(data);
                    else if (eventType === 'error') onError(data);
                    else onProgress(eventType, data);
                } catch { /* skip malformed event */ }
            }
        }
    }
};

// ==================== Verify Connection (shared) ====================

export const verifyConnection = async (verifyUrl, body, statusEl, verifyBtn) => {
    verifyBtn.disabled = true;
    statusEl.className = 'export-verify-status loading';
    statusEl.innerHTML = '<span class="spinner-sm"></span> Verifying\u2026';
    try {
        const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.ok) {
            statusEl.className = 'export-verify-status success';
            statusEl.textContent = `Connected as ${data.displayName || data.userName || data.name || 'Unknown'}`;
        } else {
            statusEl.className = 'export-verify-status error';
            statusEl.textContent = data.error || 'Verification failed';
        }
    } catch (e) {
        statusEl.className = 'export-verify-status error';
        statusEl.textContent = `Connection error: ${e.message}`;
    }
    verifyBtn.disabled = false;
};

// ==================== CSV Row Parser (shared) ====================

export const parseCsvRows = (text) => {
    const rows = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
        const row = [];
        while (i < len) {
            let value = '';
            if (text[i] === '"') {
                // Quoted field
                i++;
                while (i < len) {
                    if (text[i] === '"') {
                        if (i + 1 < len && text[i + 1] === '"') {
                            value += '"';
                            i += 2;
                        } else {
                            i++; // closing quote
                            break;
                        }
                    } else {
                        value += text[i];
                        i++;
                    }
                }
            } else {
                // Unquoted field
                while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
                    value += text[i];
                    i++;
                }
            }
            row.push(value);
            if (i < len && text[i] === ',') {
                i++;
                continue;
            }
            break;
        }
        // Skip line ending
        if (i < len && text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        rows.push(row);
    }
    return rows;
};

// ==================== Shared HTML Escape ====================

export const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ==================== Shared Preview Rendering ====================

export const renderImportPreview = (epics, projectKey, domRefs, updateCountFn, opts = {}) => {
    // Header
    const epicCount = epics.length;
    const storyCount = epics.reduce((n, e) => n + e.stories.length, 0);
    const groupLabel = opts.groupLabel || (epicCount !== 1 ? 'epics' : 'epic');
    const itemLabel = opts.itemLabel || (storyCount !== 1 ? 'stories' : 'story');
    domRefs.previewHeader.innerHTML =
        `Found <strong>${epicCount}</strong> ${groupLabel} and <strong>${storyCount}</strong> ` +
        `${itemLabel} in <strong>${escHtml(projectKey)}</strong>` +
        ` <a href="#" class="import-toggle-all">Deselect all</a>`;
    domRefs.previewHeader.querySelector('.import-toggle-all').addEventListener('click', (e) => {
        e.preventDefault();
        const allSelected = epics.every(ep => ep._included && ep.stories.every(s => s._included));
        const setTo = !allSelected;
        epics.forEach(ep => {
            ep._included = setTo;
            ep.stories.forEach(s => { s._included = setTo; });
        });
        domRefs.preview.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = setTo; });
        domRefs.preview.querySelectorAll('.import-epic').forEach(el => el.classList.toggle('excluded', !setTo));
        domRefs.preview.querySelectorAll('.import-story').forEach(el => el.classList.toggle('excluded', !setTo));
        e.target.textContent = setTo ? 'Deselect all' : 'Select all';
        updateCountFn();
    });

    // Preview list
    const container = domRefs.preview;
    container.innerHTML = '';

    epics.forEach((epic, epicIdx) => {
        epic._included = true;
        epic.stories.forEach(s => { s._included = true; });

        const epicDiv = document.createElement('div');
        epicDiv.className = 'import-epic expanded';

        // Header row
        const header = document.createElement('div');
        header.className = 'import-epic-header';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            epic._included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
            // Toggle all child stories
            const storyCheckboxes = epicDiv.querySelectorAll('.import-stories input[type="checkbox"]');
            storyCheckboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const storyIdx = parseInt(cb.dataset.storyIdx);
                epic.stories[storyIdx]._included = e.target.checked;
                cb.closest('.import-story').classList.toggle('excluded', !e.target.checked);
            });
            updateCountFn();
        });
        checkbox.addEventListener('click', (e) => e.stopPropagation());

        const toggle = document.createElement('span');
        toggle.className = 'import-epic-toggle';
        toggle.textContent = '\u25B6';

        const keyBadge = document.createElement('span');
        keyBadge.className = 'import-issue-key';
        keyBadge.textContent = epic.key || 'Other';

        const name = document.createElement('span');
        name.className = 'import-epic-name';
        name.textContent = epic.summary;

        const count = document.createElement('span');
        count.className = 'import-story-count';
        count.textContent = `(${epic.stories.length} ${epic.stories.length === 1 ? 'story' : 'stories'})`;

        header.append(checkbox, toggle, keyBadge, name, count);
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            epicDiv.classList.toggle('expanded');
        });

        // Stories list
        const storiesDiv = document.createElement('div');
        storiesDiv.className = 'import-stories';

        epic.stories.forEach((story, storyIdx) => {
            const storyDiv = document.createElement('div');
            storyDiv.className = 'import-story';

            const sCb = document.createElement('input');
            sCb.type = 'checkbox';
            sCb.checked = true;
            sCb.dataset.storyIdx = storyIdx;
            sCb.addEventListener('change', (e) => {
                story._included = e.target.checked;
                storyDiv.classList.toggle('excluded', !e.target.checked);
                updateCountFn();
            });

            const sKey = document.createElement('span');
            sKey.className = 'import-issue-key';
            sKey.textContent = story.key;

            const sName = document.createElement('span');
            sName.className = 'import-story-name';
            sName.textContent = story.summary;

            const sBadge = document.createElement('span');
            const safeStatus = ['planned', 'in-progress', 'done'].includes(story.status) ? story.status : 'planned';
            sBadge.className = 'import-status-badge ' + safeStatus;
            sBadge.textContent = safeStatus;

            storyDiv.append(sCb, sKey, sName, sBadge);

            if (story.points != null) {
                const pts = document.createElement('span');
                pts.className = 'import-points-badge';
                pts.textContent = story.points + ' pts';
                storyDiv.append(pts);
            }

            storiesDiv.append(storyDiv);
        });

        epicDiv.append(header, storiesDiv);
        container.append(epicDiv);
    });
};

// ==================== Shared Import Count ====================

export const updateImportCount = (epics, countEl, opts = {}) => {
    let epicCount = 0, storyCount = 0;
    epics.forEach(epic => {
        if (!epic._included) return;
        epicCount++;
        storyCount += epic.stories.filter(s => s._included).length;
    });
    const groupLabel = opts.groupLabel || (epicCount !== 1 ? 'epics' : 'epic');
    const itemLabel = opts.itemLabel || (storyCount !== 1 ? 'stories' : 'story');
    countEl.textContent = `Importing ${epicCount} ${groupLabel}, ${storyCount} ${itemLabel}`;
};

// ==================== Shared Storymap Builder ====================

export const buildStorymapFromImport = (epics, projectName, buildUrlFn, opts = {}) => {
    const steps = [];
    const users = [];
    const activities = [];
    const epicStories = [];
    const orphanCards = [];

    let includedIndex = 0;
    epics.forEach(epic => {
        if (!epic._included) return;

        // Skip the "Other" pseudo-epic as a column
        const isOther = !epic.key;
        if (isOther) {
            epic.stories.forEach(story => {
                if (!story._included) return;
                const card = { name: story.summary };
                if (story.description) card.body = story.description;
                if (story.status) card.status = story.status;
                if (story.points != null) card.points = story.points;
                if (story.labels?.length) card.tags = story.labels;
                const url = buildUrlFn(story.key);
                if (url) card.url = url;
                orphanCards.push(card);
            });
            return;
        }

        // Step (backbone column) = Epic
        const step = { name: epic.summary };
        const stepUrl = buildUrlFn(epic.key);
        if (stepUrl) step.url = stepUrl;
        steps.push(step);
        users.push(includedIndex === 0 ? [{ name: '', color: '#fca5a5' }] : []);
        activities.push(includedIndex === 0 ? [{ name: '', color: '#93c5fd' }] : []);
        includedIndex++;

        const columnStories = [];
        epic.stories.forEach(story => {
            if (!story._included) return;
            const card = { name: story.summary };
            if (story.description) card.body = story.description;
            if (story.status) card.status = story.status;
            if (story.points != null) card.points = story.points;
            if (story.labels?.length) card.tags = story.labels;
            const url = buildUrlFn(story.key);
            if (url) card.url = url;
            columnStories.push(card);
        });
        epicStories.push(columnStories);
    });

    // If only orphans (no epic columns), create placeholder steps
    if (steps.length === 0 && orphanCards.length > 0) {
        const cols = Math.min(orphanCards.length, 8);
        for (let c = 0; c < cols; c++) {
            steps.push({ name: `Column ${c + 1}` });
            users.push(c === 0 ? [{ name: '', color: '#fca5a5' }] : []);
            activities.push(c === 0 ? [{ name: '', color: '#93c5fd' }] : []);
        }
    }

    const sliceLabel = opts.sliceLabel || 'IMPORTED: Epics & stories';
    const slices = epicStories.length > 0
        ? [{ name: sliceLabel, stories: epicStories }]
        : [];

    // Lay out orphan cards left-to-right, 1 per column, rows of 8
    if (orphanCards.length > 0 && steps.length > 0) {
        const cols = Math.min(steps.length, 8);
        const otherGrid = Array.from({ length: steps.length }, () => []);
        orphanCards.forEach((card, i) => {
            otherGrid[i % cols].push(card);
        });
        slices.push({ name: 'IMPORTED: Other stories & tasks', stories: otherGrid });
    }

    return {
        app: 'storymap',
        v: 1,
        name: projectName + ' Import',
        steps,
        users,
        activities,
        slices
    };
};

// ==================== Jira Import State ====================

const jiraImportState = {
    epics: [],
    projectKey: '',
    fetching: false,
    mode: 'api',        // 'api' | 'csv'
    csvInstanceUrl: ''
};

// ==================== Modal Lifecycle ====================

export const showJiraImportModal = () => {
    jiraImportState.epics = [];
    jiraImportState.projectKey = '';
    jiraImportState.fetching = false;
    jiraImportState.mode = 'api';
    jiraImportState.csvInstanceUrl = '';
    dom.jiraImportStage1.classList.remove('hidden');
    dom.jiraCsvImportStage1.classList.add('hidden');
    dom.jiraImportStage2.classList.add('hidden');
    dom.jiraImportTitle.textContent = 'Import from Jira';
    dom.jiraImportProgress.classList.add('hidden');
    dom.jiraImportProgressItems.innerHTML = '';
    dom.jiraImportProgressBar.style.width = '0';
    dom.jiraImportFetchBtn.disabled = false;
    dom.jiraImportVerifyStatus.textContent = 'Optional - test before fetching';
    dom.jiraImportVerifyStatus.className = 'export-verify-status';
    dom.jiraImportVerifyBtn.disabled = false;
    dom.jiraImportModal.classList.add('visible');
};

export const hideJiraImportModal = () => {
    dom.jiraImportModal.classList.remove('visible');
    // Clear credentials from DOM
    dom.jiraImportToken.value = '';
    // Clear CSV state
    dom.jiraCsvFileInput.value = '';
    dom.jiraCsvFileInput._droppedFile = null;
    dom.jiraCsvInstanceUrl.value = '';
    dom.jiraCsvValidationError.classList.add('hidden');
    dom.jiraCsvImportParseBtn.disabled = true;
    dom.jiraCsvDropzone.querySelector('span').textContent = 'Drop .csv file here or click to browse';
};

export const confirmCloseJiraImportModal = async () => {
    if (jiraImportState.fetching) {
        if (await showConfirm('A fetch is in progress. Close anyway?')) {
            hideJiraImportModal();
        }
    } else if (await showConfirm('Close import dialog?')) {
        hideJiraImportModal();
    }
};

// ==================== Verify ====================

export const verifyJiraImport = () => {
    const instanceUrl = dom.jiraImportInstanceUrl.value.trim();
    const email = dom.jiraImportEmail.value.trim();
    const token = dom.jiraImportToken.value.trim();
    if (!instanceUrl || !email || !token) {
        dom.jiraImportVerifyStatus.className = 'export-verify-status error';
        dom.jiraImportVerifyStatus.textContent = 'Please fill in all fields first';
        return;
    }
    verifyConnection('/api/export/jira/verify', { instanceUrl, email, token }, dom.jiraImportVerifyStatus, dom.jiraImportVerifyBtn);
};

// ==================== Fetch from Jira ====================

export const fetchFromJira = async () => {
    const instanceUrl = dom.jiraImportInstanceUrl.value.trim();
    const projectKey = dom.jiraImportProjectKey.value.trim().toUpperCase();
    const email = dom.jiraImportEmail.value.trim();
    const token = dom.jiraImportToken.value.trim();

    if (!instanceUrl || !projectKey || !email || !token) {
        dom.jiraImportVerifyStatus.className = 'export-verify-status error';
        dom.jiraImportVerifyStatus.textContent = 'Please fill in all fields';
        return;
    }

    jiraImportState.fetching = true;
    dom.jiraImportFetchBtn.disabled = true;
    dom.jiraImportProgress.classList.remove('hidden');
    dom.jiraImportProgressItems.innerHTML = '';
    dom.jiraImportProgressBar.style.width = '0';
    dom.jiraImportProgressBar.classList.add('indeterminate');

    const addLine = (text, cls) => {
        const line = document.createElement('div');
        line.className = 'import-progress-line' + (cls ? ' ' + cls : '');
        line.textContent = text;
        dom.jiraImportProgressItems.append(line);
        dom.jiraImportProgressItems.scrollTop = dom.jiraImportProgressItems.scrollHeight;
    };

    addLine('Connecting to Jira...');

    let response;
    try {
        response = await fetch('/api/import/jira', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceUrl, email, token, projectKey })
        });
    } catch (e) {
        addLine(`Connection failed: ${e.message}`, 'error');
        dom.jiraImportProgressBar.classList.remove('indeterminate');
        jiraImportState.fetching = false;
        dom.jiraImportFetchBtn.disabled = false;
        return;
    }

    if (!response.ok) {
        try {
            const err = await response.json();
            addLine(err.error || `HTTP ${response.status}`, 'error');
        } catch {
            addLine(`HTTP ${response.status}`, 'error');
        }
        dom.jiraImportProgressBar.classList.remove('indeterminate');
        jiraImportState.fetching = false;
        dom.jiraImportFetchBtn.disabled = false;
        return;
    }

    await readSSE(response,
        (eventType, data) => {
            // progress event
            if (data.phase === 'epics') {
                addLine(`Fetching epics... ${data.fetched}`);
            } else if (data.phase === 'stories') {
                addLine(`Fetching stories... ${data.fetched}`);
            }
        },
        (data) => {
            // done event
            dom.jiraImportProgressBar.classList.remove('indeterminate');
            dom.jiraImportProgressBar.style.width = '100%';
            addLine(`Found ${data.epicCount} epics, ${data.storyCount} stories`, 'success');
            jiraImportState.epics = data.epics || [];
            jiraImportState.projectKey = data.projectKey || projectKey;
            jiraImportState.fetching = false;
            // Auto-advance to preview
            showJiraImportStage2();
        },
        (data) => {
            // error event
            dom.jiraImportProgressBar.classList.remove('indeterminate');
            addLine(data.error || 'Unknown error from Jira', 'error');
            jiraImportState.fetching = false;
            dom.jiraImportFetchBtn.disabled = false;
        }
    );

    // If stream ended without done event
    if (jiraImportState.fetching) {
        jiraImportState.fetching = false;
        dom.jiraImportFetchBtn.disabled = false;
    }
};

// ==================== Stage Navigation ====================

export const showJiraImportStage1 = () => {
    dom.jiraImportStage2.classList.add('hidden');
    if (jiraImportState.mode === 'csv') {
        dom.jiraImportStage1.classList.add('hidden');
        dom.jiraCsvImportStage1.classList.remove('hidden');
        dom.jiraImportTitle.textContent = 'Import from Jira CSV';
    } else {
        dom.jiraImportStage1.classList.remove('hidden');
        dom.jiraCsvImportStage1.classList.add('hidden');
        dom.jiraImportTitle.textContent = 'Import from Jira';
    }
};

const jiraPreviewDomRefs = () => ({
    previewHeader: dom.jiraImportPreviewHeader,
    preview: dom.jiraImportPreview
});

const jiraUpdateCount = () => updateImportCount(jiraImportState.epics, dom.jiraImportCount);

const showJiraImportStage2 = () => {
    dom.jiraImportStage1.classList.add('hidden');
    dom.jiraCsvImportStage1.classList.add('hidden');
    dom.jiraImportStage2.classList.remove('hidden');
    dom.jiraImportTitle.textContent = 'Review Import';
    renderImportPreview(jiraImportState.epics, jiraImportState.projectKey, jiraPreviewDomRefs(), jiraUpdateCount);
    jiraUpdateCount();
};

// ==================== Confirm Import ====================

export const confirmJiraImport = () => {
    const data = jiraDataToStorymap();
    if (data.steps.length === 0) return;
    hideJiraImportModal();
    onImportComplete(data);
};

const jiraDataToStorymap = () => {
    const rawUrl = jiraImportState.mode === 'csv'
        ? jiraImportState.csvInstanceUrl
        : dom.jiraImportInstanceUrl.value.trim();
    const instanceUrl = rawUrl.replace(/\/+$/, '');
    const origin = instanceUrl ? (instanceUrl.startsWith('http') ? instanceUrl : 'https://' + instanceUrl) : '';

    return buildStorymapFromImport(
        jiraImportState.epics,
        jiraImportState.projectKey,
        (key) => (origin && key) ? `${origin}/browse/${key}` : ''
    );
};

// ==================== Jira CSV Parsing ====================

const mapJiraCsvStatus = (status) => {
    if (!status) return 'planned';
    const s = status.toLowerCase().trim();
    if (s === 'done' || s === 'closed' || s === 'resolved') return 'done';
    if (s === 'in progress' || s === 'in review' || s === 'in development') return 'in-progress';
    return 'planned';
};

const parseJiraCsv = (csvText) => {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) return { epics: [], projectKey: '' };

    const headers = rows[0].map(h => h.trim());
    const col = (name) => headers.indexOf(name);

    const iSummary = col('Summary');
    const iKey = col('Issue key');
    const iType = col('Issue Type');
    if (iSummary === -1 || iKey === -1 || iType === -1) {
        throw new Error('Missing required columns: Summary, Issue key, Issue Type');
    }

    const iStatus = col('Status');
    const iDesc = col('Description');
    const iPoints = headers.findIndex(h => /story\s*point/i.test(h));
    const iParent = col('Parent key') !== -1 ? col('Parent key') : col('Parent');
    const iProject = col('Project key');

    // First pass: index all rows
    const epicMap = new Map(); // key -> epic object
    const storyRows = [];     // non-epic rows
    let projectKey = '';

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length <= iSummary || !row[iKey]?.trim()) continue;

        const key = row[iKey].trim();
        const summary = row[iSummary].trim();
        const type = (row[iType] || '').trim().toLowerCase();
        const status = iStatus !== -1 ? row[iStatus]?.trim() : '';
        const description = iDesc !== -1 ? row[iDesc]?.trim() : '';
        const points = iPoints !== -1 ? parseFloat(row[iPoints]) : NaN;
        const parentKey = iParent !== -1 ? (row[iParent] || '').trim() : '';

        if (!projectKey && iProject !== -1 && row[iProject]?.trim()) {
            projectKey = row[iProject].trim();
        }
        if (!projectKey && key.includes('-')) {
            projectKey = key.split('-')[0];
        }

        const item = {
            key, summary, type, status: mapJiraCsvStatus(status),
            description: description || undefined,
            points: isNaN(points) ? undefined : points,
            parentKey
        };

        if (type === 'epic') {
            epicMap.set(key, { key, summary, stories: [] });
        }
        storyRows.push(item);
    }

    // Second pass: group stories under epics
    const orphans = [];
    for (const item of storyRows) {
        if (item.type === 'epic') continue;
        const story = {
            key: item.key,
            summary: item.summary,
            status: item.status,
            description: item.description,
            points: item.points != null ? item.points : undefined
        };
        const epic = item.parentKey ? epicMap.get(item.parentKey) : null;
        if (epic) {
            epic.stories.push(story);
        } else {
            orphans.push(story);
        }
    }

    const epics = [...epicMap.values()];

    // Orphans go into "Other" pseudo-epic
    if (orphans.length > 0) {
        epics.push({ key: null, summary: 'Other (no parent epic)', stories: orphans });
    }

    return { epics, projectKey };
};

// ==================== CSV Import Modal ====================

export const showJiraCsvImportModal = () => {
    jiraImportState.epics = [];
    jiraImportState.projectKey = '';
    jiraImportState.fetching = false;
    jiraImportState.mode = 'csv';
    jiraImportState.csvInstanceUrl = '';
    dom.jiraImportStage1.classList.add('hidden');
    dom.jiraCsvImportStage1.classList.remove('hidden');
    dom.jiraImportStage2.classList.add('hidden');
    dom.jiraImportTitle.textContent = 'Import from Jira CSV';
    dom.jiraCsvFileInput.value = '';
    dom.jiraCsvInstanceUrl.value = '';
    dom.jiraCsvValidationError.classList.add('hidden');
    dom.jiraCsvImportParseBtn.disabled = true;
    dom.jiraCsvDropzone.querySelector('span').textContent = 'Drop .csv file here or click to browse';
    dom.jiraImportModal.classList.add('visible');
};

export const handleJiraCsvFile = (file) => {
    if (!file) return;
    dom.jiraCsvValidationError.classList.add('hidden');
    // Guard: reject files over 20 MB to prevent browser tab hangs
    if (file.size > 20 * 1024 * 1024) {
        dom.jiraCsvValidationError.textContent = 'File too large (max 20 MB). Try exporting fewer issues from Jira.';
        dom.jiraCsvValidationError.classList.remove('hidden');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const { epics, projectKey } = parseJiraCsv(e.target.result);
            if (epics.length === 0) {
                dom.jiraCsvValidationError.textContent = 'No issues found in CSV. Check that the file has Summary, Issue key, and Issue Type columns.';
                dom.jiraCsvValidationError.classList.remove('hidden');
                return;
            }
            jiraImportState.epics = epics;
            jiraImportState.projectKey = projectKey;
            jiraImportState.csvInstanceUrl = dom.jiraCsvInstanceUrl.value.trim();
            // Advance to stage 2
            dom.jiraCsvImportStage1.classList.add('hidden');
            dom.jiraImportStage2.classList.remove('hidden');
            dom.jiraImportTitle.textContent = 'Review Import';
            renderImportPreview(jiraImportState.epics, jiraImportState.projectKey, jiraPreviewDomRefs(), jiraUpdateCount);
            jiraUpdateCount();
        } catch (err) {
            dom.jiraCsvValidationError.textContent = err.message;
            dom.jiraCsvValidationError.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
};
