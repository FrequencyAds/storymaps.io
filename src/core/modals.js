// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Custom modal dialogs — replaces native alert/confirm/prompt to avoid Safari fullscreen exit

let overlay = null;
let modal = null;
let messageEl = null;
let inputEl = null;
let btnRow = null;
let okBtn = null;
let cancelBtn = null;
let resolve = null;
let queue = [];
let active = false;
let previousFocus = null;

const ensureDOM = () => {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay dialog-overlay';

    modal = document.createElement('div');
    modal.className = 'modal dialog-modal';

    messageEl = document.createElement('div');
    messageEl.className = 'dialog-message';

    inputEl = document.createElement('input');
    inputEl.className = 'dialog-input';
    inputEl.type = 'text';

    btnRow = document.createElement('div');
    btnRow.className = 'dialog-buttons';

    cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-btn dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    okBtn = document.createElement('button');
    okBtn.className = 'dialog-btn dialog-btn-ok';
    okBtn.textContent = 'OK';

    btnRow.append(cancelBtn, okBtn);
    modal.append(messageEl, inputEl, btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) dismiss(false);
    });
    cancelBtn.addEventListener('click', () => dismiss(false));
    okBtn.addEventListener('click', () => dismiss(true));
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); dismiss(false); }
        if (e.key === 'Enter' && document.activeElement !== cancelBtn) {
            e.preventDefault();
            dismiss(true);
        }
        if (e.key === 'Tab') {
            const focusable = [inputEl, cancelBtn, okBtn].filter(
                el => el.style.display !== 'none'
            );
            const i = focusable.indexOf(document.activeElement);
            if (e.shiftKey) {
                e.preventDefault();
                focusable[i <= 0 ? focusable.length - 1 : i - 1].focus();
            } else {
                e.preventDefault();
                focusable[i < 0 || i >= focusable.length - 1 ? 0 : i + 1].focus();
            }
        }
    });
};

const dismiss = (ok) => {
    if (!resolve) return;
    const r = resolve;
    resolve = null;
    overlay.classList.remove('visible');
    active = false;

    if (inputEl._mode === 'prompt') {
        r(ok ? inputEl.value : null);
    } else if (inputEl._mode === 'confirm') {
        r(ok);
    } else {
        r(undefined);
    }

    // Restore focus to the element that was focused before the dialog opened
    if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
        previousFocus = null;
    }

    // Process next in queue
    if (queue.length > 0) {
        const next = queue.shift();
        next();
    }
};

const show = (mode, message, defaultValue, placeholder) => {
    return new Promise((res) => {
        const run = () => {
            ensureDOM();
            previousFocus = document.activeElement;
            active = true;
            resolve = res;
            inputEl._mode = mode;
            messageEl.textContent = message;

            if (mode === 'prompt') {
                inputEl.style.display = '';
                inputEl.value = defaultValue ?? '';
                inputEl.placeholder = placeholder || '';
                cancelBtn.style.display = '';
            } else if (mode === 'confirm') {
                inputEl.style.display = 'none';
                cancelBtn.style.display = '';
            } else {
                inputEl.style.display = 'none';
                cancelBtn.style.display = 'none';
            }

            overlay.classList.add('visible');

            requestAnimationFrame(() => {
                if (mode === 'prompt') inputEl.focus();
                else okBtn.focus();
            });
        };

        if (active) {
            queue.push(run);
        } else {
            run();
        }
    });
};

export const showAlert = (message) => show('alert', message);
export const showConfirm = (message) => show('confirm', message);
export const showPrompt = (message, defaultValue, placeholder) => show('prompt', message, defaultValue, placeholder);

// Toast notification (non-modal, auto-dismissing)
let toastTimer;
export const showToast = (message, duration = 2500) => {
    clearTimeout(toastTimer);
    const el = document.getElementById('appToast');
    el.textContent = message;
    el.classList.add('visible');
    toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
};
