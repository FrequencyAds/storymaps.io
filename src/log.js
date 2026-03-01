// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Log — real-time feed of map edits synced via Yjs Y.Array

import { getSessionId, getCursorColor, getPresenceName } from '/src/presence.js';

const MAX_ENTRIES = 20;

export const quoted = (name, max = 30) => {
    if (!name) return '';
    const trimmed = name.length > max ? name.slice(0, max) + '...' : name;
    return ` "${trimmed}"`;
};

const _isMobile = window.matchMedia('(pointer: coarse)').matches;

let _yarray = null;
let _observer = null;
let _container = null;

export const init = () => {
    _container = document.getElementById('logList');
};

/**
 * Attach to a Yjs doc's Y.Array('log').
 */
export const bindYjs = (ydoc) => {
    unbindYjs();
    _yarray = ydoc.getArray('log');

    _observer = () => render();
    _yarray.observe(_observer);

    render();
};

/**
 * Detach from Yjs doc.
 */
export const unbindYjs = () => {
    if (_yarray && _observer) {
        _yarray.unobserve(_observer);
    }
    _yarray = null;
    _observer = null;
    if (_container) _container.innerHTML = '';
};

/**
 * Log an event. Syncs to all clients via Yjs.
 * @param {string} text — short description, e.g. "Added step"
 * @param {string[]} ids — affected element IDs for hover-highlight
 */
export const logEvent = (text, ids = []) => {
    if (!_yarray) return;

    const entry = {
        ts: Date.now(),
        src: _isMobile ? 'mobile' : 'web',
        text,
        sid: getSessionId(),
        name: getPresenceName(),
        ids,
    };

    _yarray.doc.transact(() => {
        _yarray.push([entry]);
        // Trim oldest entries beyond limit
        while (_yarray.length > MAX_ENTRIES) {
            _yarray.delete(0);
        }
    }, 'local');
};

/**
 * Debounced text-edit logger. Waits 2s of inactivity before logging.
 */
let _textEditTimer = null;
let _textEditItemId = null;

export const logTextEdit = (label, itemId) => {
    if (_textEditItemId && _textEditItemId !== itemId) {
        clearTimeout(_textEditTimer);
        // Flush is unnecessary — the old timer was cleared, and a new item started
    }
    _textEditItemId = itemId;
    clearTimeout(_textEditTimer);
    _textEditTimer = setTimeout(() => {
        logEvent(`Edited ${label}`, [itemId]);
        _textEditItemId = null;
    }, 2000);
};

/**
 * Render the log list into the DOM container.
 */
const render = () => {
    if (!_container || !_yarray) return;

    const entries = _yarray.toArray();

    if (entries.length === 0) {
        _container.innerHTML = '<div class="log-empty">No activity yet</div>';
        return;
    }

    // Newest first
    const sorted = [...entries].reverse();

    _container.innerHTML = '';

    sorted.forEach(entry => {
        const color = /^[a-f0-9-]{36}$/i.test(entry.sid) ? getCursorColor(entry.sid) : '#888';
        const safeColor = /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : '#888';
        const time = formatTime(entry.ts);
        const isMe = entry.sid === getSessionId();
        const source = entry.src === 'cli' ? ''
            : entry.src === 'mobile' ? ''
            : isMe ? 'You' : (entry.name || 'Web user');
        const safeText = escapeHtml(source ? `${source}: ${entry.text}` : entry.text);

        const row = document.createElement('div');
        row.className = 'log-entry';
        const ids = entry.ids || [];

        let srcIcon = '';
        if (entry.src === 'cli') {
            srcIcon = '<svg class="log-src-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M2 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        } else if (entry.src === 'mobile') {
            srcIcon = '<span class="log-src-icon">📱</span>';
        }

        row.innerHTML =
            `<span class="log-dot" style="background:${safeColor}"></span>` +
            `<span class="log-time">${time}</span>` +
            `${srcIcon}` +
            `<span class="log-text">${safeText}</span>`;

        if (ids.length > 0) {
            row.classList.add('log-locatable');

            row.addEventListener('mouseenter', () => {
                for (const id of ids) {
                    document.querySelectorAll(
                        `[data-story-id="${id}"], [data-column-id="${id}"], [data-slice-id="${id}"]`
                    ).forEach(el => {
                        el.classList.add('log-highlight');
                    });
                }
            });
            row.addEventListener('mouseleave', () => {
                document.querySelectorAll('.log-highlight').forEach(el => {
                    el.classList.remove('log-highlight');
                });
            });
        }

        _container.appendChild(row);
    });
};

const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // If same day, show just time
    if (d.toDateString() === now.toDateString()) return time;

    // Otherwise show date + time
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
};

const escapeHtml = (str) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
