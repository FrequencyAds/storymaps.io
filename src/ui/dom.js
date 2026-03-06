// Storymaps.io — AGPL-3.0 — see LICENCE for details
// DOM References (lazy — getElementById on first access, cached)

const DOM_ALIASES = { exportBtn: 'exportMap', printBtn: 'printMap' };

const _warned = new Set();

export const dom = new Proxy(Object.create(null), {
    get: (cache, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop in cache) return cache[prop];
        const el = document.getElementById(DOM_ALIASES[prop] || prop);
        if (el) cache[prop] = el;
        else if (!_warned.has(prop) && location.hostname === 'localhost') {
            console.warn(`dom.${prop}: no element found (id="${DOM_ALIASES[prop] || prop}")`);
            _warned.add(prop);
        }
        return el;
    }
});
