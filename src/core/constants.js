// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Constants and pure utility functions

// Generate cryptographically secure 8-char ID
// 6 random bytes → BigInt → base36 string (0-9, a-z) → last 8 chars
const _crypto = globalThis.crypto ?? (await import('node:crypto')).webcrypto;
export const generateId = () => {
    const bytes = new Uint8Array(6);
    _crypto.getRandomValues(bytes);
    const num = Array.from(bytes).reduce((acc, b) => acc * 256n + BigInt(b), 0n);
    return num.toString(36).slice(-8).padStart(8, '0');
};

export const isValidUrl = (url) => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

export const CARD_COLORS = {
    red: '#e84d6d',
    rose: '#ea6582',
    orange: '#ffa356',
    amber: '#f9cd4c',
    yellow: '#fad875',
    lime: '#8dd99c',
    green: '#77bf81',
    teal: '#5ddcf2',
    cyan: '#30d3ef',
    blue: '#45b2e1',
    indigo: '#a5b4fc',
    purple: '#9f7dd0',
    fuchsia: '#f2699d',
    pink: '#f584af'
};

// Default colors for card types (references CARD_COLORS values)
export const DEFAULT_CARD_COLORS = {
    Users: '#e84d6d',       // red
    Context: '#9f7dd0',     // purple
    Activities: '#45b2e1',  // blue
    story: '#fad875'        // yellow
};

export const STATUS_OPTIONS = {
    done: { label: 'Done', color: '#22c55e' },
    'in-progress': { label: 'In Progress', color: '#eab308' },
    planned: { label: 'Planned', color: '#3b82f6' },
    blocked: { label: 'Blocked', color: '#ef4444' }
};

export const TITLE_MAX_LENGTH = 38;

export const ZOOM_LEVELS = [1, 0.75, 0.5, 0.25, 0.1];

export const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const el = (tag, className, attrs = {}) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.entries(attrs).forEach(([key, value]) => {
        if (value == null) return; // Skip null/undefined for all attributes
        if (key === 'text') element.textContent = value;
        else if (key === 'html') element.innerHTML = value;
        else if (key.startsWith('data-')) {
            // kebab-case: data-column-id -> columnId
            const dataKey = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            element.dataset[dataKey] = value;
        }
        else if (key.startsWith('data') && key.length > 4) {
            // camelCase: dataColumnId -> columnId
            element.dataset[key.charAt(4).toLowerCase() + key.slice(5)] = value;
        }
        else if (key.startsWith('aria')) {
            // Special cases for ARIA attributes that don't follow simple lowercase
            const ariaMap = { ariaHasPopup: 'aria-haspopup' };
            const ariaKey = ariaMap[key] || 'aria-' + key.slice(4).toLowerCase();
            element.setAttribute(ariaKey, String(value));
        }
        else element[key] = value;
    });
    return element;
};
