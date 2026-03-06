// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Card detail expand modal

import { dom } from '/src/ui/dom.js';
import { pushUndo } from '/src/core/state.js';
import { isMapEditable } from '/src/core/lock.js';
import * as log from '/src/core/log.js';

let _deps = {};

export const init = (deps) => { _deps = deps; };

let _expandedItem = null;
let _closingExpandViaBack = false;
let _poppingExpandState = false;

export const getExpandedItem = () => _expandedItem;
export const isPoppingExpandState = () => _poppingExpandState;
export const clearPoppingExpandState = () => { _poppingExpandState = false; };

const autoResizeExpandName = () => {
    dom.cardExpandName.style.height = 'auto';
    dom.cardExpandName.style.height = dom.cardExpandName.scrollHeight + 'px';
};

export const openExpandModal = (item, { readOnly = false } = {}) => {
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

export const closeExpandModal = () => {
    if (!dom.cardExpandModal.classList.contains('visible')) return;
    dom.cardExpandModal.classList.remove('visible');
    _expandedItem = null;
    _deps.renderAndSave();
    // Pop the history entry we pushed on open, unless we got here via back button
    if (!_closingExpandViaBack) {
        _poppingExpandState = true;
        history.back();
    }
};

// Called by popstate handler to close via back button
export const closeExpandViaBack = () => {
    _closingExpandViaBack = true;
    closeExpandModal();
    _closingExpandViaBack = false;
};

export const initListeners = () => {
    dom.cardExpandName.addEventListener('input', () => {
        if (!_expandedItem) return;
        _expandedItem.name = dom.cardExpandName.value;
        log.logTextEdit('card title', _expandedItem.id);
        autoResizeExpandName();
        _deps.saveToStorage();
    });

    dom.cardExpandBody.addEventListener('input', () => {
        if (!_expandedItem) return;
        _expandedItem.body = dom.cardExpandBody.value;
        log.logTextEdit('card body', _expandedItem.id);
        _deps.saveToStorage();
    });

    document.getElementById('cardExpandModalClose')?.addEventListener('click', closeExpandModal);
    dom.cardExpandModal.addEventListener('click', (e) => {
        if (e.target === dom.cardExpandModal) closeExpandModal();
    });
};
