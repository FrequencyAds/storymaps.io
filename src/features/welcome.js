// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Welcome screen, counter, tutorial toast, new/copy/sample map creation

import { dom } from '/src/ui/dom.js';
import { state, initState, hasContent, pushUndo, confirmOverwrite } from '/src/core/state.js';
import { deserialize } from '/src/core/serialization.js';
import { closeMainMenu, zoomToFit } from '/src/ui/navigation.js';
import { clearPresence, clearCursors } from '/src/ui/presence.js';
import { clearLockSubscription, updateLockUI } from '/src/core/lock.js';
import { destroyYjs } from '/src/core/yjs.js';
import { showAlert, showConfirm } from '/src/core/modals.js';
import * as tour from '/src/features/tour.js';
import { closeSearch } from '/src/features/search.js';

let _deps = {};

export const init = (deps) => { _deps = deps; };

// Counter state
let counterLoaded = false;
let legendAutoOpened = false;
let activeMappersInterval = null;

const setCounterValue = (count) => {
    if (!dom.welcomeCounter) return;
    dom.welcomeCounter.innerHTML = `\u{1f4ca} <span class="count">${count.toLocaleString()}</span> story maps created`;
    dom.welcomeCounter.classList.add('visible');
};

const updateActiveMappers = async () => {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (!counterLoaded) {
            const count = data.mapCount || 0;
            if (count > 0) {
                localStorage.setItem('mapCount', count);
                setCounterValue(count);
            }
            counterLoaded = true;
        }
        if (dom.activeMappers && document.body.classList.contains('welcome-visible')) {
            if (data.activeUsers > 0) {
                dom.activeMappers.textContent = `${data.activeUsers} ${data.activeUsers === 1 ? 'user' : 'users'} mapping now`;
                dom.activeMappers.classList.add('visible');
            } else {
                dom.activeMappers.classList.remove('visible');
            }
        }
    } catch {
        // Silently fail - counter is non-essential
    }
};

const subscribeToCounter = async () => {
    if (!dom.welcomeCounter || counterLoaded) return;

    const cached = localStorage.getItem('mapCount');
    if (cached) {
        setCounterValue(parseInt(cached));
    }

    await updateActiveMappers();
    activeMappersInterval = setInterval(updateActiveMappers, 5_000);
};

const unsubscribeFromCounter = () => {
    counterLoaded = false;
    dom.welcomeCounter?.classList.remove('visible');
    dom.activeMappers?.classList.remove('visible');
    if (activeMappersInterval) {
        clearInterval(activeMappersInterval);
        activeMappersInterval = null;
    }
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

export const showWelcomeScreen = () => {
    state.mapLoaded = false;
    document.body.classList.add('welcome-visible');
    dom.welcomeScreen.classList.add('visible');
    dom.storyMapWrapper.classList.remove('visible');
    dom.boardName.classList.add('hidden');
    dom.mapTags?.classList.add('hidden');
    dom.zoomControls.classList.add('hidden');
    dom.controlsRight?.classList.add('hidden');
    dom.controlsRight?.classList.remove('panel-open');
    dom.panelBody?.querySelectorAll('.panel-section').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    closeSearch();
    clearPresence();
    clearCursors();
    clearLockSubscription();
    updateLockUI();
    subscribeToCounter();
};

export const hideWelcomeScreen = () => {
    state.mapLoaded = true;
    document.body.classList.remove('welcome-visible');
    dom.welcomeScreen.classList.remove('visible');
    dom.storyMapWrapper.classList.add('visible');
    dom.boardName.classList.remove('hidden');
    dom.mapTags?.classList.remove('hidden');
    dom.zoomControls.classList.remove('hidden');
    dom.controlsRight?.classList.remove('hidden');
    dom.searchBtn.style.display = '';
    dom.undoBtn.style.display = '';
    dom.redoBtn.style.display = '';
    dom.buildAiBtn.style.display = '';
    unsubscribeFromCounter();
    if (!legendAutoOpened && window.matchMedia('(pointer: fine)').matches) {
        _deps.switchPanelTab('legend');
        legendAutoOpened = true;
    }
};

export const showLoading = () => {
    dom.loadingIndicator.classList.add('visible');
};

export const hideLoading = () => {
    dom.loadingIndicator.classList.remove('visible');
};

export const showTutorialToast = () => {
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

export const startNewMap = async () => {
    hideWelcomeScreen();
    showLoading();
    initState();
    const mapId = await _deps.newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);
    dom.boardName.value = state.name;
    _deps.render();
    _deps.renderMapTags?.();
    await _deps.createYjsDoc(mapId);
    _deps.subscribeToMap(mapId);
    hideLoading();
    requestAnimationFrame(zoomToFit);
    setTimeout(showTutorialToast, 800);
    _deps.saveToStorage();
    incrementMapCounter();
};

export const startWithSample = async (sampleName, { showToast = true } = {}) => {
    hideWelcomeScreen();
    showLoading();
    destroyYjs();
    initState();
    const mapId = await _deps.newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);

    try {
        const response = await fetch(`/samples/${sampleName}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        deserialize(await response.json());
    } catch {
        await showAlert('Failed to load sample');
    }
    dom.boardName.value = state.name;
    _deps.render();
    _deps.renderMapTags?.();
    await _deps.createYjsDoc(mapId);
    _deps.subscribeToMap(mapId);
    hideLoading();
    requestAnimationFrame(zoomToFit);
    if (showToast) setTimeout(showTutorialToast, 800);
    _deps.saveToStorage();
    incrementMapCounter();
};

export const newMap = async () => {
    _deps.saveToStorage();
    if (hasContent() && !await showConfirm('Create a new story map?\n\nYou can return to this map using the back button.')) {
        return;
    }
    destroyYjs();

    state.mapId = null;

    hideWelcomeScreen();

    initState();
    dom.boardName.value = '';
    _deps.render();
    _deps.renderMapTags?.();
    requestAnimationFrame(zoomToFit);

    const mapId = await _deps.newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await _deps.createYjsDoc(mapId);
    _deps.subscribeToMap(mapId);
    _deps.saveToStorage();
    incrementMapCounter();
};

export const copyMap = async () => {
    _deps.saveToStorage();
    if (!await showConfirm('Copy this map?\n\nA copy will be created with a new URL.')) {
        return;
    }
    destroyYjs();

    const currentName = dom.boardName.value || 'Untitled';
    state.name = `${currentName} (Copy)`;
    dom.boardName.value = state.name;

    const mapId = await _deps.newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await _deps.createYjsDoc(mapId);
    _deps.subscribeToMap(mapId);
    _deps.saveToStorage();
    incrementMapCounter();
};

export const loadSample = async (name) => {
    if (!state.mapId) {
        return startWithSample(name);
    }

    _deps.saveToStorage();
    if (!await confirmOverwrite()) return;

    showLoading();
    try {
        const response = await fetch(`/samples/${name}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        pushUndo();
        deserialize(await response.json());
        dom.boardName.value = state.name;
        _deps.renderAndSave();
    } catch {
        await showAlert('Failed to load sample');
    }
    hideLoading();
};

export const initListeners = () => {
    dom.welcomeNewBtn.addEventListener('click', startNewMap);

    const launchTour = async () => {
        closeMainMenu();
        if (state.mapId && hasContent() && !await showConfirm('Load the tour sample?\n\nYou can return to this map using the back button.')) {
            return;
        }
        await startWithSample('story-mapping-101', { showToast: false });
        // Close legend panel so tour starts clean
        dom.controlsRight?.classList.remove('panel-open');
        dom.panelBody?.querySelectorAll('.panel-section').forEach(s => s.classList.remove('open'));
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tour.startTour();
    };
    dom.welcomeTourBtn.addEventListener('click', launchTour);
    dom.tourMenuBtn.addEventListener('click', launchTour);

    document.querySelector('.welcome-samples-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-sample');
        if (btn?.dataset.sample) {
            e.stopPropagation();
            startWithSample(btn.dataset.sample);
        }
    });
};
