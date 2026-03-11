// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Build with AI modal

import { dom } from '/src/ui/dom.js';
import { serialize } from '/src/core/serialization.js';
import { showConfirm } from '/src/core/modals.js';

let _deps = {};

const _link = (url, label) => `<a href="https://${url}" target="_blank" rel="noopener noreferrer">${label || url}</a>`;

const buildAiInstructions = {
    lovable: `Paste this prompt at ${_link('lovable.dev')}`,
    v0: `Paste this prompt at ${_link('v0.app')}`,
    bolt: `Paste this prompt at ${_link('bolt.new')}`,
    replit: `Paste this prompt at ${_link('replit.com')}`,
    base44: `Paste this prompt at ${_link('base44.com')}`,
    chatgpt: `Paste this prompt at ${_link('chatgpt.com')}`,
    claude: `Paste this prompt at ${_link('claude.ai')}`,
    'claude-code': 'Paste this prompt into Claude Code in your terminal',
    codex: 'Paste this prompt into Codex CLI in your terminal',
    cursor: `Paste this prompt into Cursor composer (${/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'}+I)`,
    windsurf: `Paste this prompt into Windsurf Cascade (${/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'}+L)`,
    'github-copilot': 'Paste this prompt into GitHub Copilot agent chat',
    gemini: `Paste this prompt at ${_link('gemini.google.com')}`,
    'gemini-cli': 'Paste this prompt into Gemini CLI in your terminal',
};

const shellEscape = (s) => s.replace(/["\\`$]/g, '\\$&');

const chatTargets = new Set(['chatgpt', 'gemini']);

const cliCommands = {
    'claude-code': 'claude',
    codex: 'codex',
    'gemini-cli': 'gemini',
};

const allTargetGrids = () => [dom.buildAiTargets, dom.buildAiTargets2, dom.buildAiTargets3];

const getSelectedTarget = () => {
    for (const grid of allTargetGrids()) {
        const sel = grid.querySelector('.selected');
        if (sel) return sel;
    }
    return null;
};

let _lastTargetId = null;

function updateBuildPrompt() {
    const { state } = _deps;
    const target = getSelectedTarget();
    const targetId = target?.dataset.target || 'lovable';
    const kind = target?.dataset.kind || 'builder';
    const isCli = targetId in cliCommands;
    const targetChanged = targetId !== _lastTargetId;
    _lastTargetId = targetId;
    const sel = dom.buildAiSlice;
    const sliceVal = sel.value;
    const sliceName = sel.options[sel.selectedIndex]?.text || 'Slice 1';
    const extra = dom.buildAiInstructionsInput.value.trim();
    const isChat = chatTargets.has(targetId);
    dom.buildAiCliToggleRow.style.display = isCli ? '' : 'none';
    if (!isCli) dom.buildAiCliToggle.checked = false;
    // Reset toggles when switching targets
    if (targetChanged) {
        dom.buildAiCliToggle.checked = isCli;
        dom.buildAiFetchToggle.checked = !isChat;
    }
    // Chat targets can't fetch URLs; hide the toggle and force inline JSON
    dom.buildAiFetchToggleRow.style.display = isChat ? 'none' : '';
    if (isChat) dom.buildAiFetchToggle.checked = false;
    // CLI on: fetch visible but visually disabled; re-enables when CLI toggled off
    const useCli = isCli && dom.buildAiCliToggle.checked;
    dom.buildAiFetchToggleRow.classList.toggle('disabled', useCli);
    if (useCli) dom.buildAiFetchToggle.checked = true;
    const useFetch = dom.buildAiFetchToggle.checked;
    const isPrototype = dom.buildAiModeSelect.value === 'prototype';
    const verb = isPrototype ? 'Build a prototype of' : 'Build';
    let prompt;
    if (isCli) {
        const cmd = cliCommands[targetId];
        const cliVerb = isPrototype ? 'build a prototype of' : 'build';
        if (useCli) {
            const pullTarget = `storymaps.io/${state.mapId}`;
            const fileRef = targetId === 'codex' ? 'storymap.yml' : '@storymap.yml';
            const buildArg = sliceVal === 'all'
                ? `${cliVerb} ${fileRef}`
                : `${cliVerb} the '${sliceName.replace(/'/g, "\\'")}' slice of ${fileRef}`;
            prompt = extra
                ? `npx storymaps pull --force ${pullTarget} && ${cmd} "${buildArg}. ${shellEscape(extra)}"`
                : `npx storymaps pull --force ${pullTarget} && ${cmd} "${buildArg}"`;
        } else if (useFetch) {
            const url = `https://storymaps.io/${state.mapId}.json`;
            let inner = sliceVal === 'all'
                ? `${cliVerb} ${url}`
                : `${cliVerb} the '${sliceName.replace(/'/g, "\\'")}' slice of ${url}`;
            if (extra) inner += ` ${shellEscape(extra)}`;
            prompt = `${cmd} "${inner}"`;
        } else {
            const json = shellEscape(JSON.stringify(serialize()));
            let inner = sliceVal === 'all'
                ? `${cliVerb} this storymap:\\n\\n${json}`
                : `${cliVerb} the '${sliceName.replace(/'/g, "\\'")}' slice of this storymap:\\n\\n${json}`;
            if (extra) inner += ` ${shellEscape(extra)}`;
            prompt = `${cmd} "${inner}"`;
        }
    } else if (useFetch) {
        prompt = sliceVal === 'all'
            ? `${verb} this storymap https://storymaps.io/${state.mapId}.json`
            : `${verb} the "${sliceName}" slice of this storymap https://storymaps.io/${state.mapId}.json`;
        if (extra) prompt += ` (Additional instructions: ${extra})`;
    } else {
        const json = JSON.stringify(serialize());
        prompt = sliceVal === 'all'
            ? `${verb} this storymap:\n\n${json}`
            : `${verb} the "${sliceName}" slice of this storymap:\n\n${json}`;
        if (isChat && isPrototype) prompt += ' Output a single self-contained HTML file with inline CSS and JavaScript. Do not use frameworks that require a build step';
        if (isChat && !isPrototype) prompt += ' If not supplied, pick the tech stack yourself and provide the code';
        if (extra) prompt += ` (Additional instructions: ${extra})`;
    }
    dom.buildAiPrompt.value = prompt;
    dom.buildAiPrompt.rows = (useFetch || useCli) ? 3 : Math.min(12, prompt.split('\n').length + 1);
    dom.buildAiInstructions.innerHTML = isCli
        ? 'Run this command in your terminal'
        : buildAiInstructions[targetId];
    dom.buildAiInstructionsInput.placeholder = kind === 'builder'
        ? 'e.g. Dark theme with purple accents. Mobile-first layout.'
        : 'e.g. Use Next.js + Tailwind. Dark theme with purple accents. Containerize with Docker. Add a README with getting started and build instructions.';
    dom.buildAiCopy.querySelector('span').textContent = isCli ? 'Copy Command' : 'Copy Prompt';
}

export const closeModal = () => dom.buildAiModal.classList.remove('visible');

export const confirmClose = async () => {
    if (!dom.buildAiModal.classList.contains('visible')) return;
    if (await showConfirm('Close Build with AI?')) closeModal();
};

export const init = (deps) => {
    _deps = deps;
    const { state, showPrompt } = deps;

    dom.buildAiBtn.addEventListener('click', () => {
        const sel = dom.buildAiSlice;
        sel.innerHTML = '';
        state.slices.forEach((s, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = s.name || `Slice ${i + 1}`;
            sel.appendChild(opt);
        });
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All Slices';
        sel.appendChild(allOpt);
        allTargetGrids().forEach(g => g.querySelectorAll('.build-ai-target').forEach(b => b.classList.remove('selected')));
        dom.buildAiTargets.querySelector('.build-ai-target').classList.add('selected');
        _lastTargetId = null;
        dom.buildAiFetchToggleRow.classList.remove('disabled');
        dom.buildAiInstructionsInput.value = '';
        updateBuildPrompt();
        dom.buildAiModal.classList.add('visible');
    });

    const handleTargetClick = (e) => {
        const btn = e.target.closest('.build-ai-target');
        if (!btn) return;
        allTargetGrids().forEach(g => g.querySelectorAll('.build-ai-target').forEach(b => b.classList.remove('selected')));
        btn.classList.add('selected');
        updateBuildPrompt();
    };
    dom.buildAiTargets.addEventListener('click', handleTargetClick);
    dom.buildAiTargets2.addEventListener('click', handleTargetClick);
    dom.buildAiTargets3.addEventListener('click', handleTargetClick);
    dom.buildAiSlice.addEventListener('change', updateBuildPrompt);
    dom.buildAiFetchToggle.addEventListener('change', updateBuildPrompt);
    dom.buildAiCliToggle.addEventListener('change', updateBuildPrompt);
    dom.buildAiModeSelect.addEventListener('change', updateBuildPrompt);
    dom.buildAiInstructionsInput.addEventListener('input', updateBuildPrompt);
    dom.buildAiCopy.addEventListener('click', async () => {
        const label = dom.buildAiCopy.querySelector('span');
        try {
            await navigator.clipboard.writeText(dom.buildAiPrompt.value);
            const prev = label.textContent;
            label.textContent = 'Copied!';
            setTimeout(() => label.textContent = prev, 2000);
        } catch {
            await showPrompt('Copy this AI build prompt:', dom.buildAiPrompt.value);
        }
    });
    dom.buildAiModalClose.addEventListener('click', closeModal);
    dom.buildAiModal.addEventListener('click', (e) => { if (e.target === dom.buildAiModal) confirmClose(); });
};
