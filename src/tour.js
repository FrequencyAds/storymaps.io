// Storymaps.io - AGPL-3.0 - see LICENCE for details
// Guided tour module - spotlight + tooltip walkthrough

const STEPS = [
    {
        target: null,
        title: 'What is User Story Mapping?',
        body: 'Story mapping is a planning tool that walks you through your idea from the user\'s perspective. Imagine you work at Lego and want to understand how a kid builds one of your sets. Let\'s map it out.',
        icon: '\u{1F44B}',
    },
    {
        target: ['#boardName', '.users-row', '.activities-row', '.steps-row', '.slice-container'],
        clipRight: '.step:not(.phantom-step)',
        tooltipTarget: '.panel-tabs',
        title: 'A Lego House',
        body: 'This is a story map for building a Lego house. It breaks the project down into <strong>who</strong> is involved, the <strong>activity</strong> they\'re performing, the <strong>steps</strong> they\'ll follow, and the <strong>tasks</strong> at each stage, all in one view.',
        icon: '\u{1F9F1}',
    },
    {
        target: '.users-row',
        title: 'Users',
        body: 'The top row defines <strong>who</strong> is involved. Each persona spans a group of activities below, e.g. an adult builder or a kid following along.',
        icon: '\u{1F464}',
    },
    {
        target: '.activities-row',
        title: 'Activities',
        body: 'Activities describe <strong>what</strong> each persona is trying to achieve, high-level goals like \u201CBuild a Lego House\u201D or \u201CDesign a Garden\u201D.',
        icon: '\u{1F3AF}',
    },
    {
        target: '.steps-row > :nth-child(2)',
        title: 'Steps',
        body: 'Steps are the journey from start to finish, read left-to-right. First up: <strong>look at the picture on the box</strong>.',
        icon: '\u{1F9ED}',
    },
    {
        target: '.steps-row > :nth-child(3)',
        title: 'Steps',
        body: 'Then <strong>open the box</strong>\u2026',
        icon: '\u{1F9ED}',
    },
    {
        target: '.steps-row > :nth-child(4)',
        title: 'Steps',
        body: '\u2026and <strong>layout the pieces</strong>. Each step is something the user does along the way. Together they form the <strong>backbone</strong> of your story map.',
        icon: '\u{1F9ED}',
    },
    {
        target: '.slice-container .story-column:nth-child(4) .story-card:first-child',
        title: 'Task Cards',
        body: 'Below each step are task cards, the actual work needed. To layout the pieces, first you <strong>open the lego bags</strong>\u2026',
        icon: '\u{1F4CB}',
    },
    {
        target: '.slice-container .story-column:nth-child(4) .story-card:nth-child(2)',
        title: 'Task Cards',
        body: '\u2026then <strong>sort pieces into groups</strong> so they\u2019re ready to build with. Cards are arranged top-to-bottom by priority.',
        icon: '\u{1F4CB}',
    },
    {
        target: '.slice-label-container',
        title: 'Release Slices',
        body: 'Horizontal rows group tasks into releases. This map has one slice, <strong>MVP: Basic House</strong>. Ship the essentials first, then add more slices for extras later.',
        icon: '\u{1F4E6}',
    },
    {
        target: '#legendToggle',
        title: 'Legend',
        body: 'Define colour-coded categories for your cards, like Tasks, Questions, or Notes. Great for spotting patterns at a glance.',
        icon: '\u{1F3A8}',
    },
    {
        target: '#notesToggle',
        title: 'Notepad',
        body: 'A shared scratchpad for meeting notes, decisions, or anything your team needs to capture alongside the map.',
        icon: '\u{1F4DD}',
    },
    {
        target: null,
        title: 'Your Turn!',
        body: 'That\'s the basics. Explore this map, or create your own when you\'re ready. If a sprint shows you the tree, a story map shows you the forest.',
        icon: '\u{1F680}',
    },
];

let _active = false;
let _step = 0;
const $ = (id) => document.getElementById(id);

const backdrop = () => $('tourBackdrop');
const spotlight = () => $('tourSpotlight');
const tooltip = () => $('tourTooltip');

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

const MARGIN = 12;
const TOOLTIP_GAP = 14;

const PAD = 6;
const RADIUS = 8;

const positionSpotlight = (rects) => {
    const bd = backdrop();
    const sl = spotlight();

    // Remove extra spotlights from previous step
    document.querySelectorAll('.tour-spotlight-extra').forEach(el => el.remove());

    if (!rects || rects.length === 0) {
        sl.style.display = 'none';
        bd.style.clipPath = '';
        bd.classList.add('tour-backdrop-dim');
        return;
    }

    bd.classList.remove('tour-backdrop-dim');

    // Build clip-path on backdrop - full screen with rounded-rect holes
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let d = `M0,0H${vw}V${vh}H0Z`;
    for (const rect of rects) {
        const x = rect.left - PAD;
        const y = rect.top - PAD;
        const w = rect.width + PAD * 2;
        const h = rect.height + PAD * 2;
        const r = RADIUS;
        d += ` M${x+r},${y}H${x+w-r}A${r},${r},0,0,1,${x+w},${y+r}V${y+h-r}A${r},${r},0,0,1,${x+w-r},${y+h}H${x+r}A${r},${r},0,0,1,${x},${y+h-r}V${y+r}A${r},${r},0,0,1,${x+r},${y}Z`;
    }
    bd.style.clipPath = `path(evenodd,"${d}")`;

    // Position glow spotlight(s)
    rects.forEach((rect, i) => {
        const el = i === 0 ? sl : createExtraSpotlight();
        el.style.display = '';
        el.style.top = `${rect.top - PAD}px`;
        el.style.left = `${rect.left - PAD}px`;
        el.style.width = `${rect.width + PAD * 2}px`;
        el.style.height = `${rect.height + PAD * 2}px`;
        el.style.borderRadius = `${RADIUS}px`;
    });
};

const createExtraSpotlight = () => {
    const el = document.createElement('div');
    el.className = 'tour-spotlight tour-spotlight-extra visible';
    spotlight().after(el);
    return el;
};

const positionTooltip = (rect) => {
    const tt = tooltip();
    // Reset for measurement
    tt.style.top = '0';
    tt.style.left = '0';
    tt.removeAttribute('data-arrow');

    const ttRect = tt.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect) {
        // Centered
        tt.style.top = `${Math.max(MARGIN, (vh - ttRect.height) / 2)}px`;
        tt.style.left = `${Math.max(MARGIN, (vw - ttRect.width) / 2)}px`;
        return;
    }

    const pad = 6;
    const spotTop = rect.top - pad;
    const spotLeft = rect.left - pad;
    const spotW = rect.width + pad * 2;
    const spotH = rect.height + pad * 2;
    const spotCenterX = spotLeft + spotW / 2;
    const spotBottom = spotTop + spotH;

    // Try below
    if (spotBottom + TOOLTIP_GAP + ttRect.height + MARGIN < vh) {
        tt.style.top = `${spotBottom + TOOLTIP_GAP}px`;
        tt.style.left = `${clampX(spotCenterX - ttRect.width / 2, ttRect.width, vw)}px`;
        tt.setAttribute('data-arrow', 'top');
        return;
    }
    // Try above
    if (spotTop - TOOLTIP_GAP - ttRect.height - MARGIN > 0) {
        tt.style.top = `${spotTop - TOOLTIP_GAP - ttRect.height}px`;
        tt.style.left = `${clampX(spotCenterX - ttRect.width / 2, ttRect.width, vw)}px`;
        tt.setAttribute('data-arrow', 'bottom');
        return;
    }
    // Try right
    const spotRight = spotLeft + spotW;
    if (spotRight + TOOLTIP_GAP + ttRect.width + MARGIN < vw) {
        tt.style.left = `${spotRight + TOOLTIP_GAP}px`;
        tt.style.top = `${clampY(spotTop + spotH / 2 - ttRect.height / 2, ttRect.height, vh)}px`;
        tt.setAttribute('data-arrow', 'left');
        return;
    }
    // Fall back to left
    tt.style.left = `${Math.max(MARGIN, spotLeft - TOOLTIP_GAP - ttRect.width)}px`;
    tt.style.top = `${clampY(spotTop + spotH / 2 - ttRect.height / 2, ttRect.height, vh)}px`;
    tt.setAttribute('data-arrow', 'right');
};

const clampX = (x, w, vw) => Math.max(MARGIN, Math.min(x, vw - w - MARGIN));
const clampY = (y, h, vh) => Math.max(MARGIN, Math.min(y, vh - h - MARGIN));

// ---------------------------------------------------------------------------
// Progress dots
// ---------------------------------------------------------------------------

const buildProgressDots = () => {
    const container = $('tourProgress');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < STEPS.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'tour-progress-dot';
        container.appendChild(dot);
    }
};

const updateProgressDots = () => {
    const dots = $('tourProgress')?.querySelectorAll('.tour-progress-dot');
    if (!dots) return;
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === _step);
        dot.classList.toggle('visited', i < _step);
    });
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const renderStep = () => {
    const step = STEPS[_step];
    const tt = tooltip();

    // Content transition - brief fade
    const content = tt.querySelector('.tour-tooltip-content');
    content.classList.remove('tour-step-enter');
    // Force reflow to restart animation
    void content.offsetWidth;
    content.classList.add('tour-step-enter');

    tt.querySelector('.tour-tooltip-icon').textContent = step.icon;
    tt.querySelector('.tour-tooltip-title').textContent = step.title;
    tt.querySelector('.tour-tooltip-body').innerHTML = step.body;

    const backBtn = tt.querySelector('.tour-btn-back');
    backBtn.style.display = _step === 0 ? 'none' : '';

    const nextBtn = tt.querySelector('.tour-btn-next');
    const arrow = nextBtn.querySelector('.tour-btn-next-arrow');
    if (_step === STEPS.length - 1) {
        nextBtn.firstChild.textContent = 'Finish ';
        if (arrow) arrow.style.display = 'none';
    } else {
        nextBtn.firstChild.textContent = 'Next ';
        if (arrow) arrow.style.display = '';
    }

    updateProgressDots();

    // Scroll target into view if needed
    let rects = resolveTargetRects(step.target);

    // Clip rects to the right edge of the last matching element
    if (rects && step.clipRight) {
        const clipEls = document.querySelectorAll(step.clipRight);
        const lastEl = clipEls.length ? clipEls[clipEls.length - 1] : null;
        if (lastEl) {
            const maxRight = lastEl.getBoundingClientRect().right;
            rects = rects.map(r => {
                const clippedWidth = maxRight - r.left;
                return clippedWidth < r.width
                    ? { top: r.top, left: r.left, width: clippedWidth, height: r.height }
                    : r;
            });
        }
    }

    positionSpotlight(rects);

    // Tooltip can anchor to a different element via tooltipTarget
    const tooltipAnchor = step.tooltipTarget
        ? document.querySelector(step.tooltipTarget)?.getBoundingClientRect()
        : (rects ? unionRect(rects) : null);
    positionTooltip(tooltipAnchor);

};

const resolveTargetRects = (target) => {
    if (!target) return null;
    const selectors = Array.isArray(target) ? target : [target];
    const elements = selectors.map(s => document.querySelector(s)).filter(Boolean);
    if (elements.length === 0) return null;

    // Scroll the first element into view
    const wrapper = document.getElementById('storyMapWrapper');
    if (wrapper && wrapper.contains(elements[0])) {
        elements[0].scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }

    return elements.map(el => el.getBoundingClientRect());
};

const unionRect = (rects) => {
    const top = Math.min(...rects.map(r => r.top));
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return { top, left, width: right - left, height: bottom - top };
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const next = () => {
    if (_step < STEPS.length - 1) {
        _step++;
        renderStep();
    } else {
        endTour();
    }
};

const back = () => {
    if (_step > 0) {
        _step--;
        renderStep();
    }
};

const onKeyDown = (e) => {
    if (!_active) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        next();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        back();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endTour();
    }
};

const onResize = () => {
    if (!_active) return;
    renderStep();
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const isActive = () => _active;
export const isTourCompleted = () => localStorage.getItem('tourCompleted') === 'true';

export const startTour = () => {
    _active = true;
    _step = 0;
    document.body.classList.add('tour-active');
    backdrop().classList.add('visible');
    spotlight().classList.add('visible');
    tooltip().classList.add('visible');

    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);

    buildProgressDots();
    renderStep();
};

export const endTour = () => {
    _active = false;
    localStorage.setItem('tourCompleted', 'true');
    document.body.classList.remove('tour-active');
    backdrop().classList.remove('visible', 'tour-backdrop-dim');
    backdrop().style.clipPath = '';
    spotlight().classList.remove('visible');
    tooltip().classList.remove('visible');
    document.querySelectorAll('.tour-spotlight-extra').forEach(el => el.remove());

    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
};

export const init = () => {
    // Wire tooltip buttons
    const tt = tooltip();
    if (!tt) return;

    tt.querySelector('.tour-btn-next').addEventListener('click', next);
    tt.querySelector('.tour-btn-back').addEventListener('click', back);
    tt.querySelector('.tour-btn-skip').addEventListener('click', endTour);
    // Backdrop click is intentionally a no-op - only Skip/Finish exits the tour
};
