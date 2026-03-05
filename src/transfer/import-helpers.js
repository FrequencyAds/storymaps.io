// Storymaps.io -- AGPL-3.0 -- see LICENCE for details
// Shared import helpers used by all platform-specific importers

import { escHtml } from '/src/core/constants.js';

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
