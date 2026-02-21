// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Export Modules — Jira CSV, Jira API, Phabricator, Asana

import { el } from '/src/constants.js';
import { state } from '/src/state.js';
import { showConfirm } from '/src/modals.js';

let dom = null;
let sanitizeFilename = null;

export const init = (deps) => {
    dom = deps.dom;
    sanitizeFilename = deps.sanitizeFilename;
};

// ==================== Jira CSV Export ====================

export const jiraExportState = {
    selectedSlices: new Set(),
    selectedStatuses: new Set(['none', 'planned', 'in-progress', 'done']),
    epicData: []
};

export const showJiraExportModal = () => {
    populateJiraExportSlices();
    populateJiraExportEpics();
    dom.jiraExportModal.classList.add('visible');
};

export const hideJiraExportModal = () => {
    dom.jiraExportModal.classList.remove('visible');
};

export const confirmCloseJiraExportModal = async () => {
    if (await showConfirm('Close export dialog?')) {
        hideJiraExportModal();
    }
};

const populateJiraExportSlices = () => {
    const container = document.getElementById('jiraExportSlices');
    container.innerHTML = '';
    jiraExportState.selectedSlices.clear();

    const slices = state.slices;

    slices.forEach(slice => {
        const sliceName = slice.name || 'Unnamed Release';
        jiraExportState.selectedSlices.add(slice.id);

        let storyCount = 0;
        state.columns.forEach(column => {
            const stories = slice.stories[column.id] || [];
            storyCount += stories.filter(s => s.name.trim()).length;
        });

        const label = el('label', 'export-slice-checkbox checked');
        const checkbox = el('input', null, { type: 'checkbox', checked: true });
        checkbox.dataset.sliceId = slice.id;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                jiraExportState.selectedSlices.add(slice.id);
                label.classList.add('checked');
            } else {
                jiraExportState.selectedSlices.delete(slice.id);
                label.classList.remove('checked');
            }
            populateJiraExportEpics();
        });
        const nameSpan = el('span', 'export-slice-name', { text: sliceName });
        const countSpan = el('span', 'export-slice-count', { text: `(${storyCount})` });
        label.append(checkbox, nameSpan, countSpan);
        container.append(label);
    });

    if (slices.length === 0) {
        container.innerHTML = '<span style="color: #666; font-size: 13px;">No releases found</span>';
    }
};

export const populateJiraExportEpics = () => {
    dom.jiraExportEpics.innerHTML = '';
    jiraExportState.epicData = [];

    state.columns.forEach((column, colIndex) => {
        const tasks = [];
        state.slices.forEach(slice => {
            if (!jiraExportState.selectedSlices.has(slice.id)) return;

            const sliceStories = slice.stories[column.id] || [];
            sliceStories.forEach(story => {
                if (story.name.trim()) {
                    const storyStatus = story.status || 'none';
                    if (!jiraExportState.selectedStatuses.has(storyStatus)) return;

                    tasks.push({
                        name: story.name,
                        body: story.body || '',
                        status: story.status || null,
                        url: story.url || null,
                        included: true
                    });
                }
            });
        });

        if (tasks.length === 0) return;

        const epicData = {
            columnId: column.id,
            name: column.name || `Activity ${colIndex + 1}`,
            type: 'Epic',
            description: '',
            included: true,
            tasks
        };
        jiraExportState.epicData.push(epicData);

        const epicDiv = el('div', 'jira-export-epic');
        epicDiv.dataset.columnId = column.id;

        const header = el('div', 'jira-export-epic-header');

        const checkbox = el('input', 'jira-export-epic-checkbox', { type: 'checkbox', checked: true });
        checkbox.addEventListener('change', (e) => {
            epicData.included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
        });

        const nameInput = el('input', 'jira-export-epic-name', {
            type: 'text',
            value: epicData.name,
            placeholder: 'Epic name'
        });
        nameInput.addEventListener('input', (e) => {
            epicData.name = e.target.value;
        });

        const typeSelect = el('select', 'jira-export-epic-type', { title: 'Jira issue type' });
        ['Epic', 'Task'].forEach(type => {
            const option = el('option', null, { value: type, text: type });
            typeSelect.append(option);
        });
        typeSelect.addEventListener('change', (e) => {
            epicData.type = e.target.value;
        });

        header.append(checkbox, nameInput, typeSelect);

        const description = el('textarea', 'jira-export-epic-description', {
            placeholder: 'Optional description for this epic...',
            rows: 2
        });
        description.addEventListener('input', (e) => {
            epicData.description = e.target.value;
        });

        const tasksList = el('div', 'jira-export-tasks');
        tasks.forEach((task, taskIndex) => {
            const taskEl = el('label', 'jira-export-task');
            if (task.body) taskEl.dataset.body = task.body;

            const taskCheckbox = el('input', 'jira-export-task-checkbox', { type: 'checkbox', checked: true });
            taskCheckbox.addEventListener('change', (e) => {
                task.included = e.target.checked;
                taskEl.classList.toggle('excluded', !e.target.checked);
            });
            taskEl.append(taskCheckbox);

            const nameSpan = el('span', 'jira-export-task-name', { text: task.name });
            taskEl.append(nameSpan);

            const statusClass = task.status === 'done' ? 'done' :
                task.status === 'in-progress' ? 'in-progress' :
                task.status === 'planned' ? 'planned' : 'none';
            const jiraStatus = task.status === 'done' ? dom.jiraStatusDone.value :
                task.status === 'in-progress' ? dom.jiraStatusInProgress.value :
                task.status === 'planned' ? dom.jiraStatusPlanned.value :
                dom.jiraStatusNone.value;
            const statusBadge = el('span', `jira-export-task-status ${statusClass}`, { text: jiraStatus });
            taskEl.append(statusBadge);
            tasksList.append(taskEl);
        });

        epicDiv.append(header, description, tasksList);
        dom.jiraExportEpics.append(epicDiv);
    });

    if (dom.jiraExportEpics.children.length === 0) {
        const emptyMsg = el('p', null, {
            style: 'color: #666; text-align: center; padding: 20px;',
            text: 'No stories to export. Add some stories to your map first, or select more releases above.'
        });
        dom.jiraExportEpics.append(emptyMsg);
    }

    const epicCount = jiraExportState.epicData.length;
    const taskCount = jiraExportState.epicData.reduce((sum, epic) => sum + epic.tasks.length, 0);
    if (dom.jiraExportCount) {
        dom.jiraExportCount.textContent = epicCount > 0 ? `(${epicCount} epics, ${taskCount} tasks)` : '';
    }
};

const escapeCSV = (str) => {
    if (str == null) return '';
    const s = String(str);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
};

const generateJiraCsv = () => {
    const rows = [];
    const projectName = dom.jiraProjectName.value.trim();
    const projectKey = dom.jiraProjectKey.value.trim().toUpperCase();
    const projectType = dom.jiraProjectType.value;
    const childType = 'Task';
    const hasProject = projectName && projectKey;
    const defaultDesc = 'Imported from Storymaps.io';

    const headers = ['Work type', 'Summary', 'Description', 'Work item ID', 'Parent', 'Status', 'Project type'];
    if (hasProject) {
        headers.unshift('Project key');
        headers.unshift('Project name');
    }
    rows.push(headers.map(escapeCSV).join(','));

    let issueId = 1;
    const epicInputs = dom.jiraExportEpics.querySelectorAll('.jira-export-epic');

    epicInputs.forEach((epicEl) => {
        const checkbox = epicEl.querySelector('.jira-export-epic-checkbox');
        if (!checkbox.checked) return;

        const epicId = issueId++;
        const nameInput = epicEl.querySelector('.jira-export-epic-name');
        const typeSelect = epicEl.querySelector('.jira-export-epic-type');
        const descTextarea = epicEl.querySelector('.jira-export-epic-description');

        const epicName = nameInput.value || 'Untitled Epic';
        const epicType = typeSelect.value || 'Epic';
        const epicDesc = descTextarea.value || defaultDesc;

        const epicRow = [epicType, epicName, epicDesc, epicId, '', '', projectType];
        if (hasProject) {
            epicRow.unshift(projectKey);
            epicRow.unshift(projectName);
        }
        rows.push(epicRow.map(escapeCSV).join(','));

        const taskEls = epicEl.querySelectorAll('.jira-export-task');
        taskEls.forEach((taskEl) => {
            const taskCheckbox = taskEl.querySelector('.jira-export-task-checkbox');
            if (!taskCheckbox.checked) return;

            const taskName = taskEl.querySelector('.jira-export-task-name')?.textContent || '';
            const statusBadge = taskEl.querySelector('.jira-export-task-status');
            const jiraStatus = statusBadge?.textContent || dom.jiraStatusNone.value;

            const taskDesc = taskEl.dataset.body || defaultDesc;
            const taskRow = [childType, taskName, taskDesc, issueId++, epicId, jiraStatus, projectType];
            if (hasProject) {
                taskRow.unshift(projectKey);
                taskRow.unshift(projectName);
            }
            rows.push(taskRow.map(escapeCSV).join(','));
        });
    });

    return rows.join('\n');
};

export const downloadJiraCsv = () => {
    const csv = generateJiraCsv();
    const filename = sanitizeFilename(state.name || 'story-map') + '-jira.csv';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideJiraExportModal();
};

// ==================== Phabricator Export ====================

export const phabExportState = {
    selectedSlices: new Set(),
    selectedStatuses: new Set(['none', 'planned', 'in-progress', 'done']),
    epicData: []
};

export const showPhabExportModal = () => {
    populatePhabExportSlices();
    populatePhabExportEpics();
    dom.phabStage1.classList.remove('hidden');
    dom.phabStage2.classList.add('hidden');
    dom.phabExportTitle.textContent = 'Step 1: Select Tasks';
    dom.phabExportModal.classList.add('visible');
};

export const hidePhabExportModal = () => {
    dom.phabExportModal.classList.remove('visible');
};

export const confirmClosePhabModal = async () => {
    if (await showConfirm('Close export dialog?')) {
        hidePhabExportModal();
    }
};

const populatePhabExportSlices = () => {
    const container = dom.phabExportSlices;
    container.innerHTML = '';
    phabExportState.selectedSlices.clear();

    const slices = state.slices;

    slices.forEach(slice => {
        const sliceName = slice.name || 'Unnamed Release';
        phabExportState.selectedSlices.add(slice.id);

        let storyCount = 0;
        state.columns.forEach(column => {
            const stories = slice.stories[column.id] || [];
            storyCount += stories.filter(s => s.name.trim()).length;
        });

        const label = el('label', 'export-slice-checkbox checked');
        const checkbox = el('input', null, { type: 'checkbox', checked: true });
        checkbox.dataset.sliceId = slice.id;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                phabExportState.selectedSlices.add(slice.id);
                label.classList.add('checked');
            } else {
                phabExportState.selectedSlices.delete(slice.id);
                label.classList.remove('checked');
            }
            populatePhabExportEpics();
        });
        const nameSpan = el('span', 'export-slice-name', { text: sliceName });
        const countSpan = el('span', 'export-slice-count', { text: `(${storyCount})` });
        label.append(checkbox, nameSpan, countSpan);
        container.append(label);
    });

    if (slices.length === 0) {
        container.innerHTML = '<span style="color: #666; font-size: 13px;">No releases found</span>';
    }
};

export const populatePhabExportEpics = () => {
    dom.phabExportEpics.innerHTML = '';
    phabExportState.epicData = [];

    state.columns.forEach((column, colIndex) => {
        const tasks = [];
        state.slices.forEach(slice => {
            if (!phabExportState.selectedSlices.has(slice.id)) return;

            const sliceStories = slice.stories[column.id] || [];
            sliceStories.forEach(story => {
                if (story.name.trim()) {
                    const storyStatus = story.status || 'none';
                    if (!phabExportState.selectedStatuses.has(storyStatus)) return;

                    tasks.push({
                        name: story.name,
                        body: story.body || '',
                        status: story.status || null,
                        included: true
                    });
                }
            });
        });

        if (tasks.length === 0) return;

        const epicData = {
            columnId: column.id,
            name: column.name || `Activity ${colIndex + 1}`,
            description: '',
            included: true,
            type: 'epic',
            tasks
        };
        phabExportState.epicData.push(epicData);

        const epicDiv = el('div', 'export-epic');
        epicDiv.dataset.columnId = column.id;

        const header = el('div', 'export-epic-header');

        const checkbox = el('input', 'export-epic-checkbox', { type: 'checkbox', checked: true });
        checkbox.addEventListener('change', (e) => {
            epicData.included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
        });

        const nameInput = el('input', 'export-epic-name', {
            type: 'text',
            value: epicData.name,
            placeholder: 'Epic name'
        });
        nameInput.addEventListener('input', (e) => {
            epicData.name = e.target.value;
        });

        const typeSelect = el('select', 'export-epic-type');
        const epicOption = el('option', null, { value: 'epic', text: 'Epic' });
        const taskOption = el('option', null, { value: 'task', text: 'Task' });
        typeSelect.append(epicOption, taskOption);
        typeSelect.addEventListener('change', (e) => {
            epicData.type = e.target.value;
        });

        header.append(checkbox, nameInput, typeSelect);

        const description = el('textarea', 'export-epic-description', {
            placeholder: 'Optional description for this epic...',
            rows: 2
        });
        description.addEventListener('input', (e) => {
            epicData.description = e.target.value;
        });

        const tasksList = el('div', 'export-tasks');
        tasks.forEach((task) => {
            const taskEl = el('label', 'export-task');
            taskEl.dataset.status = task.status || 'none';
            if (task.body) taskEl.dataset.body = task.body;

            const taskCheckbox = el('input', 'export-task-checkbox', { type: 'checkbox', checked: true });
            taskCheckbox.addEventListener('change', (e) => {
                task.included = e.target.checked;
                taskEl.classList.toggle('excluded', !e.target.checked);
            });
            taskEl.append(taskCheckbox);

            const nameSpan = el('span', 'export-task-name', { text: task.name });
            taskEl.append(nameSpan);

            const statusClass = task.status === 'done' ? 'done' :
                task.status === 'in-progress' ? 'in-progress' :
                task.status === 'planned' ? 'planned' : 'none';
            const statusText = task.status === 'done' ? 'Done' :
                task.status === 'in-progress' ? 'In Progress' :
                task.status === 'planned' ? 'Planned' : 'No Status';
            const statusBadge = el('span', `export-task-status ${statusClass}`, { text: statusText });
            taskEl.append(statusBadge);
            tasksList.append(taskEl);
        });

        epicDiv.append(header, description, tasksList);
        dom.phabExportEpics.append(epicDiv);
    });

    if (dom.phabExportEpics.children.length === 0) {
        const emptyMsg = el('p', null, {
            style: 'color: #666; text-align: center; padding: 20px;',
            text: 'No stories to export. Add some stories to your map first, or select more releases above.'
        });
        dom.phabExportEpics.append(emptyMsg);
    }

    const epicCount = phabExportState.epicData.length;
    const taskCount = phabExportState.epicData.reduce((sum, epic) => sum + epic.tasks.length, 0);
    if (dom.phabExportCount) {
        dom.phabExportCount.textContent = epicCount > 0 ? `(${epicCount} epics, ${taskCount} tasks)` : '';
    }
};

export const generatePhabImportFunction = () => {
    return `async function importTasks(token, items, tags) {
  const url = '${getPhabBaseUrl()}/api/maniphest.edit';
  async function createTask(t, parentId, itemTags) {
    const indent = parentId ? '  ' : '';
    const params = new URLSearchParams();
    params.set('api.token', token);
    let i = 0;
    params.set('transactions[' + i + '][type]', 'title');
    params.set('transactions[' + i++ + '][value]', t.title);
    params.set('transactions[' + i + '][type]', 'description');
    params.set('transactions[' + i++ + '][value]', t.description || '');
    if (t.status) {
      params.set('transactions[' + i + '][type]', 'status');
      params.set('transactions[' + i++ + '][value]', t.status);
    }
    if (parentId) {
      params.set('transactions[' + i + '][type]', 'parent');
      params.set('transactions[' + i++ + '][value]', parentId);
    }
    if (itemTags && itemTags.length) {
      params.set('transactions[' + i + '][type]', 'projects.add');
      itemTags.forEach((tag, j) => params.set('transactions[' + i + '][value][' + j + ']', tag));
    }
    const r = await (await fetch(url, {method:'POST', body:params, credentials:'omit'})).json();
    if (r.error_code) { console.log(indent + '✗ ' + t.title + ': ' + r.error_info); return null; }
    console.log(indent + '✓ T' + r.result.object.id + ': ' + t.title);
    return r.result.object.phid;
  }
  for (const item of items) {
    const itemTags = item.type === 'epic' ? ['epic', ...tags] : [...tags];
    const itemId = await createTask(item, null, itemTags);
    if (itemId && item.subtasks) {
      for (const sub of item.subtasks) { await createTask(sub, itemId, tags); }
    }
  }
  console.log('Import complete!');
}`;
};

const getPhabBaseUrl = () => {
    const input = dom.phabInstanceUrl.value.trim();
    if (!input) return 'https://phabricator.example.com';
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
        return 'https://' + input;
    }
    return input;
};

export const generatePhabImportCall = () => {
    const epics = [];
    const epicEls = dom.phabExportEpics.querySelectorAll('.export-epic');

    epicEls.forEach((epicEl) => {
        const checkbox = epicEl.querySelector('.export-epic-checkbox');
        if (!checkbox.checked) return;

        const nameInput = epicEl.querySelector('.export-epic-name');
        const descTextarea = epicEl.querySelector('.export-epic-description');
        const typeSelect = epicEl.querySelector('.export-epic-type');

        const epicName = nameInput.value || 'Untitled Epic';
        const epicDesc = descTextarea.value || '';
        const epicType = typeSelect?.value || 'epic';

        const subtasks = [];
        const phabStatusMap = {none: 'open', planned: 'open', 'in-progress': 'progress', done: 'resolved'};
        const taskEls = epicEl.querySelectorAll('.export-task');
        taskEls.forEach((taskEl) => {
            const taskCheckbox = taskEl.querySelector('.export-task-checkbox');
            if (!taskCheckbox.checked) return;

            const taskName = taskEl.querySelector('.export-task-name')?.textContent || '';
            const taskStatus = phabStatusMap[taskEl.dataset.status] || 'open';
            subtasks.push({ title: taskName, description: taskEl.dataset.body || 'Imported from Storymaps.io', status: taskStatus });
        });

        if (subtasks.length > 0) {
            epics.push({
                title: epicName,
                description: epicDesc || 'Imported from Storymaps.io',
                type: epicType,
                subtasks
            });
        }
    });

    const token = dom.phabApiToken.value.trim() || '<enter token above>';
    const tagsInput = dom.phabTags.value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    return `importTasks('${token}', ${JSON.stringify(epics, null, 2)}, ${JSON.stringify(tags)});`;
};

export const showPhabStage2 = () => {
    dom.phabStage1.classList.add('hidden');
    dom.phabStage2.classList.remove('hidden');
    dom.phabExportTitle.textContent = 'Step 2: Import';

    dom.phabImportFunction.textContent = generatePhabImportFunction();
    dom.phabImportCall.textContent = generatePhabImportCall();
};

export const showPhabStage1 = () => {
    dom.phabStage1.classList.remove('hidden');
    dom.phabStage2.classList.add('hidden');
    dom.phabExportTitle.textContent = 'Step 1: Select Tasks';
};

export const copyPhabCode = async (element, button) => {
    const text = element.textContent;
    try {
        await navigator.clipboard.writeText(text);
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => button.textContent = originalText, 2000);
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => button.textContent = originalText, 2000);
    }
};

// ==================== Jira API Export ====================

export const jiraApiExportState = {
    selectedSlices: new Set(),
    selectedStatuses: new Set(['none', 'planned', 'in-progress', 'done']),
    epicData: []
};

export const showJiraApiExportModal = () => {
    populateJiraApiExportSlices();
    populateJiraApiExportEpics();
    dom.jiraApiStage1.classList.remove('hidden');
    dom.jiraApiStage2.classList.add('hidden');
    dom.jiraApiExportTitle.textContent = 'Export to Jira';
    dom.jiraApiExportModal.classList.add('visible');
};

export const hideJiraApiExportModal = () => {
    dom.jiraApiExportModal.classList.remove('visible');
};

export const confirmCloseJiraApiModal = async () => {
    if (await showConfirm('Close export dialog?')) {
        hideJiraApiExportModal();
    }
};

const populateJiraApiExportSlices = () => {
    const container = dom.jiraApiExportSlices;
    container.innerHTML = '';
    jiraApiExportState.selectedSlices.clear();

    const slices = state.slices;

    slices.forEach(slice => {
        const sliceName = slice.name || 'Unnamed Release';
        jiraApiExportState.selectedSlices.add(slice.id);

        let storyCount = 0;
        state.columns.forEach(column => {
            const stories = slice.stories[column.id] || [];
            storyCount += stories.filter(s => s.name.trim()).length;
        });

        const label = el('label', 'export-slice-checkbox checked');
        const checkbox = el('input', null, { type: 'checkbox', checked: true });
        checkbox.dataset.sliceId = slice.id;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                jiraApiExportState.selectedSlices.add(slice.id);
                label.classList.add('checked');
            } else {
                jiraApiExportState.selectedSlices.delete(slice.id);
                label.classList.remove('checked');
            }
            populateJiraApiExportEpics();
        });
        const nameSpan = el('span', 'export-slice-name', { text: sliceName });
        const countSpan = el('span', 'export-slice-count', { text: `(${storyCount})` });
        label.append(checkbox, nameSpan, countSpan);
        container.append(label);
    });
};

export const populateJiraApiExportEpics = () => {
    dom.jiraApiExportEpics.innerHTML = '';
    jiraApiExportState.epicData = [];

    state.columns.forEach((column, colIndex) => {
        const tasks = [];
        state.slices.forEach(slice => {
            if (!jiraApiExportState.selectedSlices.has(slice.id)) return;

            const sliceStories = slice.stories[column.id] || [];
            sliceStories.forEach(story => {
                if (story.name.trim()) {
                    const storyStatus = story.status || 'none';
                    if (!jiraApiExportState.selectedStatuses.has(storyStatus)) return;

                    tasks.push({
                        name: story.name,
                        body: story.body || '',
                        status: story.status || null,
                        included: true
                    });
                }
            });
        });

        if (tasks.length === 0) return;

        const epicData = {
            columnId: column.id,
            name: column.name || `Activity ${colIndex + 1}`,
            description: '',
            included: true,
            tasks
        };
        jiraApiExportState.epicData.push(epicData);

        const epicDiv = el('div', 'export-epic');
        epicDiv.dataset.columnId = column.id;

        const header = el('div', 'export-epic-header');

        const checkbox = el('input', 'export-epic-checkbox', { type: 'checkbox', checked: true });
        checkbox.addEventListener('change', (e) => {
            epicData.included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
        });

        const nameInput = el('input', 'export-epic-name', {
            type: 'text',
            value: epicData.name,
            placeholder: 'Epic name'
        });
        nameInput.addEventListener('input', (e) => {
            epicData.name = e.target.value;
        });

        header.append(checkbox, nameInput);

        const description = el('textarea', 'export-epic-description', {
            placeholder: 'Epic description (optional)',
            rows: 2
        });
        description.addEventListener('input', (e) => {
            epicData.description = e.target.value;
        });

        const tasksList = el('div', 'export-tasks');
        tasks.forEach((task) => {
            const taskEl = el('label', 'export-task');
            taskEl.dataset.status = task.status || 'none';
            if (task.body) taskEl.dataset.body = task.body;

            const taskCheckbox = el('input', 'export-task-checkbox', { type: 'checkbox', checked: true });
            taskCheckbox.addEventListener('change', (e) => {
                task.included = e.target.checked;
                taskEl.classList.toggle('excluded', !e.target.checked);
            });
            taskEl.append(taskCheckbox);

            const nameSpan = el('span', 'export-task-name', { text: task.name });
            taskEl.append(nameSpan);

            const statusClass = task.status === 'done' ? 'done' :
                task.status === 'in-progress' ? 'in-progress' :
                task.status === 'planned' ? 'planned' : 'none';
            const statusText = task.status === 'done' ? 'Done' :
                task.status === 'in-progress' ? 'In Progress' :
                task.status === 'planned' ? 'Planned' : 'No Status';
            const statusBadge = el('span', `export-task-status ${statusClass}`, { text: statusText });
            taskEl.append(statusBadge);
            tasksList.append(taskEl);
        });

        epicDiv.append(header, description, tasksList);
        dom.jiraApiExportEpics.append(epicDiv);
    });

    if (dom.jiraApiExportEpics.children.length === 0) {
        const emptyMsg = el('p', null, {
            style: 'color: #666; text-align: center; padding: 20px;',
            text: 'No stories to export. Add some stories to your map first, or select more releases above.'
        });
        dom.jiraApiExportEpics.append(emptyMsg);
    }

    const epicCount = jiraApiExportState.epicData.length;
    const taskCount = jiraApiExportState.epicData.reduce((sum, epic) => sum + epic.tasks.length, 0);
    if (dom.jiraApiExportCount) {
        dom.jiraApiExportCount.textContent = epicCount > 0 ? `(${epicCount} epics, ${taskCount} stories)` : '';
    }
};

export const generateJiraApiImportFunction = () => {
    return `async function importToJira(email, token, projectKey, epics) {
  const auth = btoa(email + ':' + token);
  const headers = {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/json'
  };

  for (const epic of epics) {
    console.log('Creating Epic: ' + epic.summary);
    const epicRes = await fetch('/rest/api/3/issue', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: epic.summary,
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: epic.description || 'Imported from Storymaps.io' }] }] },
          issuetype: { name: 'Epic' }
        }
      })
    });
    const epicData = await epicRes.json();
    if (epicData.errors) {
      console.log('✗ Epic failed:', epicData.errors);
      continue;
    }
    console.log('✓ Created Epic: ' + epicData.key);

    for (const story of epic.stories) {
      const storyRes = await fetch('/rest/api/3/issue', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: story.summary,
            description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: story.description || 'Imported from Storymaps.io' }] }] },
            issuetype: { name: 'Story' },
            parent: { key: epicData.key }
          }
        })
      });
      const storyData = await storyRes.json();
      if (storyData.errors) {
        console.log('  ✗ Story failed:', storyData.errors);
      } else {
        console.log('  ✓ Created Story: ' + storyData.key + ' - ' + story.summary);
      }
    }
  }
  console.log('\\nImport complete!');
}`;
};

export const generateJiraApiImportCall = () => {
    const epics = [];
    const epicEls = dom.jiraApiExportEpics.querySelectorAll('.export-epic');

    epicEls.forEach((epicEl) => {
        const checkbox = epicEl.querySelector('.export-epic-checkbox');
        if (!checkbox.checked) return;

        const nameInput = epicEl.querySelector('.export-epic-name');
        const descTextarea = epicEl.querySelector('.export-epic-description');

        const epicName = nameInput.value || 'Untitled Epic';
        const epicDesc = descTextarea.value || '';

        const stories = [];
        const taskEls = epicEl.querySelectorAll('.export-task');
        taskEls.forEach((taskEl) => {
            const taskCheckbox = taskEl.querySelector('.export-task-checkbox');
            if (!taskCheckbox.checked) return;

            const taskName = taskEl.querySelector('.export-task-name')?.textContent || '';
            stories.push({ summary: taskName, description: taskEl.dataset.body || 'Imported from Storymaps.io' });
        });

        if (stories.length > 0) {
            epics.push({
                summary: epicName,
                description: epicDesc,
                stories
            });
        }
    });

    const email = dom.jiraApiEmail.value.trim() || '<enter email above>';
    const token = dom.jiraApiToken.value.trim() || '<enter token above>';
    const projectKey = dom.jiraApiProjectKey.value.trim().toUpperCase() || '<enter project key above>';

    return `importToJira('${email}', '${token}', '${projectKey}', ${JSON.stringify(epics, null, 2)});`;
};

export const showJiraApiStage2 = () => {
    dom.jiraApiStage1.classList.add('hidden');
    dom.jiraApiStage2.classList.remove('hidden');
    dom.jiraApiExportTitle.textContent = 'Step 2: Import';

    dom.jiraApiImportFunction.textContent = generateJiraApiImportFunction();
    dom.jiraApiImportCall.textContent = generateJiraApiImportCall();
};

export const showJiraApiStage1 = () => {
    dom.jiraApiStage1.classList.remove('hidden');
    dom.jiraApiStage2.classList.add('hidden');
    dom.jiraApiExportTitle.textContent = 'Step 1: Select Stories';
};

// ==================== Asana Export ====================

export const asanaExportState = {
    selectedSlices: new Set(),
    selectedStatuses: new Set(['none', 'planned', 'in-progress', 'done']),
    epicData: []
};

export const showAsanaExportModal = () => {
    populateAsanaExportSlices();
    populateAsanaExportEpics();
    dom.asanaStage1.classList.remove('hidden');
    dom.asanaStage2.classList.add('hidden');
    dom.asanaExportTitle.textContent = 'Step 1: Select Tasks';
    dom.asanaExportModal.classList.add('visible');
};

export const hideAsanaExportModal = () => {
    dom.asanaExportModal.classList.remove('visible');
};

export const confirmCloseAsanaModal = async () => {
    if (await showConfirm('Close export dialog?')) {
        hideAsanaExportModal();
    }
};

const populateAsanaExportSlices = () => {
    const container = dom.asanaExportSlices;
    container.innerHTML = '';
    asanaExportState.selectedSlices.clear();

    const slices = state.slices;

    slices.forEach(slice => {
        const sliceName = slice.name || 'Unnamed Release';
        asanaExportState.selectedSlices.add(slice.id);

        let storyCount = 0;
        state.columns.forEach(column => {
            const stories = slice.stories[column.id] || [];
            storyCount += stories.filter(s => s.name.trim()).length;
        });

        const label = el('label', 'export-slice-checkbox checked');
        const checkbox = el('input', null, { type: 'checkbox', checked: true });
        checkbox.dataset.sliceId = slice.id;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                asanaExportState.selectedSlices.add(slice.id);
                label.classList.add('checked');
            } else {
                asanaExportState.selectedSlices.delete(slice.id);
                label.classList.remove('checked');
            }
            populateAsanaExportEpics();
        });
        const nameSpan = el('span', 'export-slice-name', { text: sliceName });
        const countSpan = el('span', 'export-slice-count', { text: `(${storyCount})` });
        label.append(checkbox, nameSpan, countSpan);
        container.append(label);
    });

    if (slices.length === 0) {
        container.innerHTML = '<span style="color: #666; font-size: 13px;">No releases found</span>';
    }
};

const updateAsanaExportCount = () => {
    if (!dom.asanaExportCount) return;
    const epicCount = asanaExportState.epicData.filter(e => e.included).length;
    const taskCount = asanaExportState.epicData.reduce(
        (sum, epic) => epic.included ? sum + epic.tasks.filter(t => t.included).length : sum, 0
    );
    dom.asanaExportCount.textContent = epicCount > 0 ? `(${epicCount} parent tasks, ${taskCount} subtasks)` : '';
};

export const populateAsanaExportEpics = () => {
    dom.asanaExportEpics.innerHTML = '';
    asanaExportState.epicData = [];

    state.columns.forEach((column, colIndex) => {
        const tasks = [];
        state.slices.forEach(slice => {
            if (!asanaExportState.selectedSlices.has(slice.id)) return;

            const sliceStories = slice.stories[column.id] || [];
            sliceStories.forEach(story => {
                if (story.name.trim()) {
                    const storyStatus = story.status || 'none';
                    if (!asanaExportState.selectedStatuses.has(storyStatus)) return;

                    tasks.push({
                        name: story.name,
                        body: story.body || '',
                        status: story.status || null,
                        included: true
                    });
                }
            });
        });

        if (tasks.length === 0) return;

        const epicData = {
            columnId: column.id,
            name: column.name || `Activity ${colIndex + 1}`,
            description: '',
            included: true,
            tasks
        };
        asanaExportState.epicData.push(epicData);

        const epicDiv = el('div', 'export-epic');
        epicDiv.dataset.columnId = column.id;

        const header = el('div', 'export-epic-header');

        const checkbox = el('input', 'export-epic-checkbox', { type: 'checkbox', checked: true });
        checkbox.addEventListener('change', (e) => {
            epicData.included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
            updateAsanaExportCount();
        });

        const nameInput = el('input', 'export-epic-name', {
            type: 'text',
            value: epicData.name,
            placeholder: 'Parent task name'
        });
        nameInput.addEventListener('input', (e) => {
            epicData.name = e.target.value;
        });

        header.append(checkbox, nameInput);

        const description = el('textarea', 'export-epic-description', {
            placeholder: 'Task description (optional)',
            rows: 2
        });
        description.addEventListener('input', (e) => {
            epicData.description = e.target.value;
        });

        const tasksList = el('div', 'export-tasks');
        tasks.forEach((task) => {
            const taskEl = el('label', 'export-task');
            taskEl.dataset.status = task.status || 'none';
            if (task.body) taskEl.dataset.body = task.body;

            const taskCheckbox = el('input', 'export-task-checkbox', { type: 'checkbox', checked: true });
            taskCheckbox.addEventListener('change', (e) => {
                task.included = e.target.checked;
                taskEl.classList.toggle('excluded', !e.target.checked);
                updateAsanaExportCount();
            });
            taskEl.append(taskCheckbox);

            const nameSpan = el('span', 'export-task-name', { text: task.name });
            taskEl.append(nameSpan);

            const statusClass = task.status === 'done' ? 'done' :
                task.status === 'in-progress' ? 'in-progress' :
                task.status === 'planned' ? 'planned' : 'none';
            const statusText = task.status === 'done' ? 'Done' :
                task.status === 'in-progress' ? 'In Progress' :
                task.status === 'planned' ? 'Planned' : 'No Status';
            const statusBadge = el('span', `export-task-status ${statusClass}`, { text: statusText });
            taskEl.append(statusBadge);
            tasksList.append(taskEl);
        });

        epicDiv.append(header, description, tasksList);
        dom.asanaExportEpics.append(epicDiv);
    });

    if (dom.asanaExportEpics.children.length === 0) {
        const emptyMsg = el('p', null, {
            style: 'color: #666; text-align: center; padding: 20px;',
            text: 'No stories to export. Add some stories to your map first, or select more releases above.'
        });
        dom.asanaExportEpics.append(emptyMsg);
    }

    updateAsanaExportCount();
};

export const generateAsanaImportFunction = () => {
    const withSections = dom.asanaCreateSections.checked;
    return `async function importToAsana(token, projectGid, items) {
  const baseUrl = 'https://app.asana.com/api/1.0';
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
${withSections ? `
  async function createSection(name) {
    const res = await fetch(baseUrl + '/projects/' + projectGid + '/sections', {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { name: name } })
    });
    const data = await res.json();
    if (data.errors) {
      console.log('\\u2717 Section failed: ' + JSON.stringify(data.errors));
      return null;
    }
    console.log('\\u2713 Created section: ' + name);
    return data.data.gid;
  }
` : ''}
  for (const item of items) {${withSections ? `
    const sectionGid = await createSection(item.name);` : ''}
    console.log('Creating task: ' + item.name);
    const res = await fetch(baseUrl + '/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          name: item.name,
          notes: item.notes || 'Imported from Storymaps.io',
          projects: [projectGid],${withSections ? `
          memberships: [{ project: projectGid, section: sectionGid }],` : ''}
          completed: item.completed || false
        }
      })
    });
    const data = await res.json();
    if (data.errors) {
      console.log('\\u2717 Task failed: ' + JSON.stringify(data.errors));
      continue;
    }
    const parentGid = data.data.gid;
    console.log('\\u2713 Created: ' + item.name + ' (' + parentGid + ')');

    if (item.subtasks) {
      for (const sub of item.subtasks) {
        const subRes = await fetch(baseUrl + '/tasks/' + parentGid + '/subtasks', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: {
              name: sub.name,
              notes: sub.notes || 'Imported from Storymaps.io',
              completed: sub.completed || false
            }
          })
        });
        const subData = await subRes.json();
        if (subData.errors) {
          console.log('  \\u2717 Subtask failed: ' + JSON.stringify(subData.errors));
        } else {
          console.log('  \\u2713 Created subtask: ' + sub.name);
        }
      }
    }
  }
  console.log('\\nImport complete!');
}`;
};

const extractAsanaProjectGid = (input) => {
    if (!input) return '';
    // New-style URL: app.asana.com/1/.../project/PROJECT_GID/...
    const projectMatch = input.match(/\/project\/(\d+)/);
    if (projectMatch) return projectMatch[1];
    // Old-style URL: app.asana.com/0/PROJECT_GID/...
    const legacyMatch = input.match(/app\.asana\.com\/0\/(\d+)/);
    if (legacyMatch) return legacyMatch[1];
    // Bare GID number
    if (/^\d+$/.test(input)) return input;
    return '';
};

export const generateAsanaImportCall = () => {
    const items = [];
    const epicEls = dom.asanaExportEpics.querySelectorAll('.export-epic');

    epicEls.forEach((epicEl) => {
        const checkbox = epicEl.querySelector('.export-epic-checkbox');
        if (!checkbox.checked) return;

        const nameInput = epicEl.querySelector('.export-epic-name');
        const descTextarea = epicEl.querySelector('.export-epic-description');

        const epicName = nameInput.value || 'Untitled Task';
        const epicDesc = descTextarea.value || '';

        const subtasks = [];
        const taskEls = epicEl.querySelectorAll('.export-task');
        taskEls.forEach((taskEl) => {
            const taskCheckbox = taskEl.querySelector('.export-task-checkbox');
            if (!taskCheckbox.checked) return;

            const taskName = taskEl.querySelector('.export-task-name')?.textContent || '';
            const taskStatus = taskEl.dataset.status;
            subtasks.push({
                name: taskName,
                notes: taskEl.dataset.body || 'Imported from Storymaps.io',
                completed: taskStatus === 'done'
            });
        });

        if (subtasks.length > 0) {
            items.push({
                name: epicName,
                notes: epicDesc || 'Imported from Storymaps.io',
                completed: false,
                subtasks
            });
        }
    });

    const token = dom.asanaApiToken.value.trim() || '<enter token above>';
    const projectGid = extractAsanaProjectGid(dom.asanaProjectUrl.value.trim()) || '<paste project page URL above>';
    return `importToAsana('${token}', '${projectGid}', ${JSON.stringify(items, null, 2)});`;
};

export const showAsanaStage2 = () => {
    dom.asanaStage1.classList.add('hidden');
    dom.asanaStage2.classList.remove('hidden');
    dom.asanaExportTitle.textContent = 'Step 2: Import';

    dom.asanaImportFunction.textContent = generateAsanaImportFunction();
    dom.asanaImportCall.textContent = generateAsanaImportCall();
};

export const showAsanaStage1 = () => {
    dom.asanaStage1.classList.remove('hidden');
    dom.asanaStage2.classList.add('hidden');
    dom.asanaExportTitle.textContent = 'Step 1: Select Tasks';
};

// ==================== Asana CSV Export ====================

export const asanaCsvExportState = {
    selectedSlices: new Set(),
    selectedStatuses: new Set(['none', 'planned', 'in-progress', 'done']),
    epicData: []
};

export const showAsanaCsvExportModal = () => {
    populateAsanaCsvExportSlices();
    populateAsanaCsvExportEpics();
    dom.asanaCsvExportModal.classList.add('visible');
};

export const hideAsanaCsvExportModal = () => {
    dom.asanaCsvExportModal.classList.remove('visible');
};

export const confirmCloseAsanaCsvModal = async () => {
    if (await showConfirm('Close export dialog?')) {
        hideAsanaCsvExportModal();
    }
};

const populateAsanaCsvExportSlices = () => {
    const container = dom.asanaCsvExportSlices;
    container.innerHTML = '';
    asanaCsvExportState.selectedSlices.clear();

    const slices = state.slices;

    slices.forEach(slice => {
        const sliceName = slice.name || 'Unnamed Release';
        asanaCsvExportState.selectedSlices.add(slice.id);

        let storyCount = 0;
        state.columns.forEach(column => {
            const stories = slice.stories[column.id] || [];
            storyCount += stories.filter(s => s.name.trim()).length;
        });

        const label = el('label', 'export-slice-checkbox checked');
        const checkbox = el('input', null, { type: 'checkbox', checked: true });
        checkbox.dataset.sliceId = slice.id;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                asanaCsvExportState.selectedSlices.add(slice.id);
                label.classList.add('checked');
            } else {
                asanaCsvExportState.selectedSlices.delete(slice.id);
                label.classList.remove('checked');
            }
            populateAsanaCsvExportEpics();
        });
        const nameSpan = el('span', 'export-slice-name', { text: sliceName });
        const countSpan = el('span', 'export-slice-count', { text: `(${storyCount})` });
        label.append(checkbox, nameSpan, countSpan);
        container.append(label);
    });

    if (slices.length === 0) {
        container.innerHTML = '<span style="color: #666; font-size: 13px;">No releases found</span>';
    }
};

const updateAsanaCsvExportCount = () => {
    if (!dom.asanaCsvExportCount) return;
    const sectionCount = asanaCsvExportState.epicData.filter(e => e.included).length;
    const taskCount = asanaCsvExportState.epicData.reduce(
        (sum, epic) => epic.included ? sum + epic.tasks.filter(t => t.included).length : sum, 0
    );
    dom.asanaCsvExportCount.textContent = sectionCount > 0 ? `(${sectionCount} parent tasks, ${taskCount} subtasks)` : '';
};

export const populateAsanaCsvExportEpics = () => {
    dom.asanaCsvExportEpics.innerHTML = '';
    asanaCsvExportState.epicData = [];

    state.columns.forEach((column, colIndex) => {
        const tasks = [];
        state.slices.forEach(slice => {
            if (!asanaCsvExportState.selectedSlices.has(slice.id)) return;

            const sliceStories = slice.stories[column.id] || [];
            sliceStories.forEach(story => {
                if (story.name.trim()) {
                    const storyStatus = story.status || 'none';
                    if (!asanaCsvExportState.selectedStatuses.has(storyStatus)) return;

                    tasks.push({
                        name: story.name,
                        body: story.body || '',
                        status: story.status || null,
                        included: true
                    });
                }
            });
        });

        if (tasks.length === 0) return;

        const epicData = {
            columnId: column.id,
            name: column.name || `Activity ${colIndex + 1}`,
            included: true,
            tasks
        };
        asanaCsvExportState.epicData.push(epicData);

        const epicDiv = el('div', 'export-epic');
        epicDiv.dataset.columnId = column.id;

        const header = el('div', 'export-epic-header');

        const checkbox = el('input', 'export-epic-checkbox', { type: 'checkbox', checked: true });
        checkbox.addEventListener('change', (e) => {
            epicData.included = e.target.checked;
            epicDiv.classList.toggle('excluded', !e.target.checked);
            updateAsanaCsvExportCount();
        });

        const nameInput = el('input', 'export-epic-name', {
            type: 'text',
            value: epicData.name,
            placeholder: 'Section name'
        });
        nameInput.addEventListener('input', (e) => {
            epicData.name = e.target.value;
        });

        header.append(checkbox, nameInput);

        const tasksList = el('div', 'export-tasks');
        tasks.forEach((task) => {
            const taskEl = el('label', 'export-task');
            taskEl.dataset.status = task.status || 'none';
            if (task.body) taskEl.dataset.body = task.body;

            const taskCheckbox = el('input', 'export-task-checkbox', { type: 'checkbox', checked: true });
            taskCheckbox.addEventListener('change', (e) => {
                task.included = e.target.checked;
                taskEl.classList.toggle('excluded', !e.target.checked);
                updateAsanaCsvExportCount();
            });
            taskEl.append(taskCheckbox);

            const nameSpan = el('span', 'export-task-name', { text: task.name });
            taskEl.append(nameSpan);

            const statusClass = task.status === 'done' ? 'done' :
                task.status === 'in-progress' ? 'in-progress' :
                task.status === 'planned' ? 'planned' : 'none';
            const statusText = task.status === 'done' ? 'Done' :
                task.status === 'in-progress' ? 'In Progress' :
                task.status === 'planned' ? 'Planned' : 'No Status';
            const statusBadge = el('span', `export-task-status ${statusClass}`, { text: statusText });
            taskEl.append(statusBadge);
            tasksList.append(taskEl);
        });

        epicDiv.append(header, tasksList);
        dom.asanaCsvExportEpics.append(epicDiv);
    });

    if (dom.asanaCsvExportEpics.children.length === 0) {
        const emptyMsg = el('p', null, {
            style: 'color: #666; text-align: center; padding: 20px;',
            text: 'No stories to export. Add some stories to your map first, or select more releases above.'
        });
        dom.asanaCsvExportEpics.append(emptyMsg);
    }

    updateAsanaCsvExportCount();
};

export const downloadAsanaCsv = () => {
    const withSections = dom.asanaCsvCreateSections.checked;
    const header = ['Name', 'Description', 'Section', 'Parent Task'].map(escapeCSV).join(',');
    const rows = [header];
    const epicEls = dom.asanaCsvExportEpics.querySelectorAll('.export-epic');

    epicEls.forEach((epicEl) => {
        const checkbox = epicEl.querySelector('.export-epic-checkbox');
        if (!checkbox.checked) return;

        const nameInput = epicEl.querySelector('.export-epic-name');
        const parentName = nameInput.value || 'Untitled';
        const section = withSections ? parentName : '';

        // Parent task row — must come before subtasks
        rows.push([parentName, 'Imported from Storymaps.io', section, ''].map(escapeCSV).join(','));

        const taskEls = epicEl.querySelectorAll('.export-task');
        taskEls.forEach((taskEl) => {
            const taskCheckbox = taskEl.querySelector('.export-task-checkbox');
            if (!taskCheckbox.checked) return;
            const taskName = taskEl.querySelector('.export-task-name')?.textContent || '';
            const taskDesc = taskEl.dataset.body || 'Imported from Storymaps.io';
            // Subtask row — linked to parent via exact name match
            rows.push([taskName, taskDesc, section, parentName].map(escapeCSV).join(','));
        });
    });

    const csv = rows.join('\n');
    const filename = sanitizeFilename(state.name || 'story-map') + '-asana.csv';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideAsanaCsvExportModal();
};
