// WHAT THIS FILE DOES
// Lets the website's pin cursor click with the whole pin, not only its
// click point. The pin (public/site/cursor-pin.png) is 22 x 32 pixels and
// its click point is the centre of its round head (site.css), 21 pixels
// above its tip. Many people aim a map pin with its tip, or rest the edge
// of its head on what they want; without this, those clicks land on the
// empty ground beside the control and nothing happens.
//
// When a mouse click lands on nothing clickable, this looks at everything
// under the drawn pin, or within 3 pixels of it, and gives the control the
// pin covers most the action a click on it has (when another is covered at
// least half as much and lies nearer the click point, that one wins):
//   a link, a button, a tick box, a round choice, a label, a tab, a summary,
//   or anything else that shows the pointer (the Ukraine demo's map, the
//   globe's dots)                  is clicked, as if the click had landed on it
//                                  (a label so works its field, as a click
//                                  on its words does);
//   a text field or a text area    gets the caret, at the end of its text;
//   a drop-down menu               opens (where the browser can open it);
//   a slider                       moves its thumb to the pin's click point;
//   a film                         plays, or pauses if it is playing.
// A click on a film's own picture starts or stops it too, when the browser
// does not: Chrome ignores a click on a film that has not loaded yet, and
// the website's films load only once played. (A film's own row of buttons,
// at its foot, is always left to the browser: a click there is the
// browser's, and the pin near a film counts only its picture, so the
// chapter buttons just below it stay within reach.)
// While the mouse moves, the same choice gets the hover look ([data-near],
// next to each :hover rule in the stylesheets), so the visitor sees what a
// click would do. The look stays on through a plain press, so the click is
// worked out as the look was (what the look shows can be part of the page:
// a globe dot's name).
//
// It knows nothing about the pages. What counts as clickable is what the
// browser itself treats as a control (links, buttons, labels, summaries,
// form fields, films, and the roles button, link, tab, switch, checkbox,
// radio, option and menu item), plus anything the page's styles give the
// pointer cursor. So a new part of the website is covered as it is, as
// long as its controls are real buttons or links, or show the pointer.
//
// How it stays light (it runs while the mouse moves):
//   - it notes where the visible controls are (and again after a scroll, a
//     resize or a change on the page, at most ten times a second), and
//     compares the pin's shape with those rectangles in plain arithmetic.
//     A pointer that moved less than 3 pixels costs nothing at all;
//   - only when a control is within reach does it ask the browser what is
//     really on top, at one or two points, so nothing hidden under
//     something else, clipped away or invisible is ever chosen; for a
//     shape that does not fill its box (a region of the demo's map, a round
//     dot) it asks at points 3 pixels apart over the part under the pin;
//   - at the click itself (once, not while moving) it also asks at points
//     3 pixels apart over the whole pin, so anything showing the pointer
//     that the note missed is found too.
//
// It is careful to stay out of the way:
//   - only a plain single mouse click: the main button, no Ctrl, Shift, Alt
//     or Cmd, the pointer moved under 5 px between press and release, no
//     text selected before or after. The click is made a quarter of a
//     second later, and not at all if a second click follows: a
//     double-click selects a word, as it does everywhere else, and never
//     clicks a link twice;
//   - a click that lands on a control is that control's (the browser's own
//     click); a drag is never a click, so a drag still turns the globe or
//     selects text;
//   - never on anything marked data-assist="off", nor inside a frame;
//   - never for a finger, a pen or the keyboard (a keypress clears the
//     hover look);
//   - only on the website (SiteShell starts it; the app never does).
//
// The parts that decide (reachRows, rankTargets, pickTarget, kindOf,
// sliderValue, isPointerCursor, pointerSelectors, createClickGate) are kept
// apart so they can be checked without a browser (cursorAssist.test.js).
//
// WHO EDITS IT
// Whoever changes the cursor (keep PIN in step with the picture and the
// hotspot in site.css).

// The pin's picture, its click point, and for each row of pixels the first
// and last column the pin covers (measured from cursor-pin.png).
export const PIN = {
  width: 22,
  height: 32,
  hotspot: { x: 11, y: 10 },
  rows: [
    [7, 14], [5, 16], [4, 17], [3, 18], [2, 19], [1, 20], [1, 20], [0, 21],
    [0, 21], [0, 21], [0, 21], [0, 21], [0, 21], [0, 21], [1, 20], [1, 20],
    [2, 19], [2, 19], [3, 18], [3, 18], [4, 17], [4, 16], [5, 16], [6, 15],
    [6, 15], [7, 14], [7, 13], [8, 13], [9, 12], [9, 12], [10, 11], [10, 11],
  ],
};

// How far around the drawn pin a control still counts, in pixels.
export const EDGE = 3;

// When another control is covered at least half as much as the one covered
// most, the two count as even and the one nearer the click point wins (the
// pin's long tip covers a lot of whatever lies under it; the click point is
// where the visitor aims).
export const TIE = 0.5;

// A double-click's second press comes within this time of the first click.
export const DOUBLE_CLICK_MS = 250;

// What the browser itself treats as a control. (Anything else counts when
// it shows the pointer cursor.)
export const CONTROL = [
  "a[href]",
  "area[href]",
  "button",
  "summary",
  "label",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "video",
  "audio[controls]",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
].join(", ");

// Where the assist never looks or acts.
export const OFF = '[data-assist="off"], iframe, [inert]';

// The height of a film's own row of buttons at its foot (play, the
// timeline, the sound, full screen), in pixels: a click there is left to
// the browser.
export const FILM_BAR = 56;

// Half the width of a slider's thumb: the thumb's centre travels from this
// far inside the slider's left end to this far inside its right end
// (Chrome's thumb is 16 px wide).
export const THUMB_HALF = 8;

// Points under the pin are asked what is on top this many pixels apart.
export const STEP = 3;

const MIN_MOVE = 3; // pixels the pointer must move before the hover look is worked out again
const BAND = 200; // pixels above and below the screen whose controls are noted too
const MIN_AGE = 100; // milliseconds: the note is made again at most this often while the page changes
const MAX_AGE = 150; // milliseconds a note of the controls' places is trusted while the mouse moves (the globe's dots move by style alone, which is not watched)
const INSET = 2.5; // pixels inside a control's box where the browser is asked (the ends of a line of text answer for the paragraph)
const TEXT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number", "date", "time", "datetime-local", "month", "week"]);
const SVG_NS = "http://www.w3.org/2000/svg";

// The pin's reach, one entry per row of pixels, from EDGE rows above the
// pin's top to EDGE rows below its tip: the row's offset from the click
// point (dy) and the stretch it covers, from left to right (exclusive),
// also measured from the click point. It is the drawn pin grown by `edge`
// pixels on every side.
export function reachRows(pin = PIN, edge = EDGE) {
  const rows = [];
  const last = pin.rows.length - 1;
  for (let r = -edge; r <= last + edge; r++) {
    let first = Infinity;
    let end = -Infinity;
    for (let k = Math.max(0, r - edge); k <= Math.min(last, r + edge); k++) {
      first = Math.min(first, pin.rows[k][0]);
      end = Math.max(end, pin.rows[k][1]);
    }
    rows.push({ dy: r - pin.hotspot.y, left: first - edge - pin.hotspot.x, right: end + 1 + edge - pin.hotspot.x });
  }
  return rows;
}

const REACH = reachRows();

// The box around the reach, from the click point.
function boxOf(rows) {
  return {
    left: Math.min(...rows.map((r) => r.left)),
    right: Math.max(...rows.map((r) => r.right)),
    top: rows[0].dy,
    bottom: rows[rows.length - 1].dy + 1,
  };
}

// The centres of the reach's pixels, `step` pixels apart in both
// directions, through the click point's own pixel: { dx, dy } from the
// click point.
export function reachPoints(step = STEP, rows = REACH) {
  const points = [];
  for (const row of rows) {
    if (((row.dy % step) + step) % step !== 0) continue;
    const from = Math.ceil(row.left / step) * step;
    for (let dx = from; dx < row.right; dx += step) points.push({ dx: dx + 0.5, dy: row.dy + 0.5 });
  }
  return points;
}

const POINTS = reachPoints();

// How much of a control's rectangles the reach covers (square pixels), the
// point of that part nearest the click point (kept INSET pixels inside the
// rectangle where the part is wide enough, since the browser answers for
// the paragraph at the last pixel or so of a link in a line of text), its
// distance, and the middle of the covered part.
function cover(x, y, rects, rows) {
  let area = 0;
  let best = null;
  let sx = 0;
  let sy = 0;
  for (const rect of rects) {
    for (const row of rows) {
      const top = Math.max(y + row.dy, rect.top);
      const bottom = Math.min(y + row.dy + 1, rect.bottom);
      if (bottom <= top) continue;
      const left = Math.max(x + row.left, rect.left);
      const right = Math.min(x + row.right, rect.right);
      if (right <= left) continue;
      const a = (right - left) * (bottom - top);
      area += a;
      sx += ((left + right) / 2) * a;
      sy += ((top + bottom) / 2) * a;
      const lo = Math.min(Math.max(left, rect.left + INSET), (left + right) / 2);
      const hi = Math.max(Math.min(right, rect.right - INSET), (left + right) / 2);
      const px = Math.min(Math.max(x, lo), hi);
      const py = (top + bottom) / 2;
      const d = Math.hypot(x < left ? left - x : x > right ? x - right : 0, py - y);
      if (!best || d < best.d) best = { d, point: { x: px, y: py } };
    }
  }
  return area > 0 ? { area, d: best.d, point: best.point, mid: { x: sx / area, y: sy / area } } : null;
}

// Puts scored candidates ({ area, d }) in the order the pin picks them:
// the one covered most leads, unless another is covered at least TIE
// (half) as much and lies nearer the click point.
export function rank(scored) {
  const list = scored.filter((s) => s && s.area > 0).sort((a, b) => b.area - a.area || a.d - b.d);
  if (list.length < 2) return list;
  const even = list.filter((s) => s.area >= list[0].area * TIE);
  const first = even.reduce((a, b) => (b.d < a.d ? b : a));
  return [first, ...list.filter((s) => s !== first)];
}

// Every candidate ({ target, rects }) the reach touches, best first, each
// with the point to check it at.
export function rankTargets(x, y, candidates, rows = REACH) {
  const scored = [];
  for (const { target, rects } of candidates) {
    const c = cover(x, y, rects, rows);
    if (c) scored.push({ target, ...c });
  }
  return rank(scored);
}

// The target a click at (x, y) would reach, or null.
export function pickTarget(x, y, candidates, rows = REACH) {
  return rankTargets(x, y, candidates, rows)[0]?.target ?? null;
}

// Does a computed cursor show the pointer? The plain hand, or a picture
// (the site's pin) with the pointer as its fallback.
export function isPointerCursor(value) {
  return /(?:^|[\s,])pointer\s*$/.test(String(value || ""));
}

// What a click does to a control, by its kind:
//   "text"   a text field, a text area or editable text: the caret goes in;
//   "menu"   a drop-down menu: it opens;
//   "slider" a slider: its thumb moves to the click point;
//   "film"   a video or a sound: it plays or pauses;
//   "press"  everything else: it is clicked.
export function kindOf(el) {
  const tag = el.localName;
  if (tag === "video" || tag === "audio") return "film";
  if (tag === "select") return "menu";
  if (tag === "textarea") return "text";
  if (tag === "input") {
    const type = String(el.type ?? "text").toLowerCase();
    if (type === "range") return "slider";
    return TEXT_TYPES.has(type) ? "text" : "press";
  }
  if (el.isContentEditable) return "text";
  return "press";
}

// The value a slider takes when its thumb's centre is moved to x (screen
// pixels): its thumb travels from `half` pixels inside its left end to
// `half` inside its right end; the value is rounded to the slider's step
// and kept within its min and max. rect: { left, width }.
export function sliderValue(x, rect, { min = 0, max = 100, step = 1 } = {}, half = THUMB_HALF) {
  const number = (v, fallback) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v));
  const lo = number(min, 0);
  const hi = number(max, 100);
  if (!(hi > lo)) return lo;
  const inset = Math.min(half, rect.width / 2);
  const span = rect.width - 2 * inset;
  const f = span > 0 ? Math.min(1, Math.max(0, (x - rect.left - inset) / span)) : 0;
  let value = lo + f * (hi - lo);
  const s = String(step).toLowerCase() === "any" ? 0 : number(step, 1);
  if (s > 0) {
    value = lo + Math.round((value - lo) / s) * s;
    if (value > hi) value -= s;
  }
  return Number(Math.min(hi, Math.max(lo, value)).toFixed(10));
}

// Splits a selector list at its own commas (not those inside :is(), :not()
// or an attribute's value).
export function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

// The elements a stylesheet rule gives the pointer cursor, as a selector
// for querySelectorAll: without the moment it applies (:hover, :focus,
// :active) or a pseudo-element (::before), which a page cannot ask for.
export function shownBy(selector) {
  return selector
    .replace(/::?(?:before|after|marker|placeholder|selection|first-line|first-letter|backdrop|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g, "")
    .replace(/:(?:hover|active|focus-visible|focus-within|focus)(?![\w-])/g, "")
    .trim();
}

// Every selector in the page's stylesheets that sets a pointer cursor
// (inside @media, @supports and @layer too). A stylesheet from another site
// cannot be read and is skipped; a nested rule (CSS nesting) is left to the
// click's own look under the pin.
export function pointerSelectors(sheets) {
  const found = new Set();
  const visit = (rules, depth) => {
    if (!rules || depth > 8) return;
    for (const rule of rules) {
      const selector = rule.selectorText;
      const style = rule.style;
      const cursor = style ? (typeof style.getPropertyValue === "function" ? style.getPropertyValue("cursor") : style.cursor) : "";
      if (selector && isPointerCursor(cursor) && !selector.includes("&")) {
        for (const one of splitSelectors(selector)) {
          const s = shownBy(one);
          if (s) found.add(s);
        }
      }
      let inner = null;
      try {
        inner = rule.cssRules || (rule.styleSheet && rule.styleSheet.cssRules) || null;
      } catch {
        inner = null;
      }
      if (inner && inner.length) visit(inner, depth + 1);
    }
  };
  for (const sheet of sheets || []) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null; // another site's stylesheet
    }
    visit(rules, 0);
  }
  return [...found];
}

// Holds a click back for a moment, so that a double-click can call it off.
//   gate.later(fn)   runs fn after `delay` ms (a click still waiting is dropped)
//   gate.cancel()    drops the click still waiting, if any
//   gate.waiting     true while one waits
export function createClickGate(timers = globalThis, delay = DOUBLE_CLICK_MS) {
  let timer = 0;
  const cancel = () => {
    if (timer) timers.clearTimeout(timer);
    timer = 0;
  };
  return {
    later(fn) {
      cancel();
      timer = timers.setTimeout(() => {
        timer = 0;
        fn();
      }, delay);
    },
    cancel,
    get waiting() {
      return timer !== 0;
    },
  };
}

// The element a label works (its control), or the element itself.
const controlFor = (owner) => (owner.localName === "label" ? owner.control || null : owner);

// Can it be clicked at all? (Not switched off, and a label works something.)
function usable(owner) {
  const target = controlFor(owner);
  if (!target) return false;
  for (const el of target === owner ? [owner] : [owner, target]) {
    if (el.disabled || (el.getAttribute && el.getAttribute("aria-disabled") === "true")) return false;
  }
  return true;
}

// Starts the assist on this page; the answer stops it again.
export function startCursorAssist(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  if (!doc || !win || typeof doc.elementFromPoint !== "function") return () => {};
  const root = doc.documentElement;
  const box = boxOf(REACH);
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const gate = createClickGate(win);
  let down = null; // the press of the click in progress
  let last = null; // the pointer: where, over what, and the scroll then
  let near = null; // the element showing the hover look
  let seen = null; // what the hover look was last worked out for
  let frame = 0;
  let trail = 0; // the timer that looks once more after a scroll has stopped
  let version = 0; // goes up whenever the page may have changed
  let note = null; // the visible controls: { list, sx, sy, at, version }
  let sheets = { count: -1, selector: CONTROL }; // what to ask the page for, from its stylesheets

  const setNear = (el) => {
    if (near === el) return;
    near?.removeAttribute("data-near");
    near = el || null;
    near?.setAttribute("data-near", "");
  };
  // Clears the hover look from outside the hover pass, so the next move
  // works it out again (however small the move).
  const forget = () => {
    seen = null;
    setNear(null);
  };

  const style = (el) => win.getComputedStyle(el);
  const pointerOn = (el) => isPointerCursor(style(el).cursor);

  // The control an element belongs to: the nearest control around it (a
  // form field inside its own label belongs to the label, so the whole
  // card answers), or else the outermost element of a run that shows the
  // pointer; null for plain ground, for anything outside the website and
  // where the assist is off.
  const ownerOf = (el) => {
    if (!el || el.nodeType !== 1 || !el.closest) return null;
    if (!el.closest(".site") || el.closest(OFF)) return null;
    const control = el.closest(CONTROL);
    if (control) {
      if (control.localName !== "label") {
        const label = control.closest("label");
        if (label && label.control === control) return label;
      }
      return control;
    }
    if (!pointerOn(el)) return null;
    let own = el;
    for (let p = el.parentElement; p && !p.classList?.contains("site") && pointerOn(p); p = p.parentElement) own = p;
    return own;
  };

  // A shape that does not fill its box: a part of a drawing (an SVG shape),
  // or a round dot. Its points under the pin are asked one by one.
  const shapedIs = (el, st, rect) => {
    if (el.namespaceURI === SVG_NS && el.localName !== "svg") return true;
    const side = Math.min(rect.right - rect.left, rect.bottom - rect.top);
    const given = String(st.borderTopLeftRadius || "0");
    const radius = given.trim().endsWith("%") ? (parseFloat(given) / 100) * side : parseFloat(given) || 0;
    return radius > 0 && radius >= side / 4;
  };

  // What to ask the page for: its controls, whatever its stylesheets give
  // the pointer, and anything with a cursor in its own style. Worked out
  // again when a stylesheet arrives (a page's styles load with the page).
  const selectorNow = () => {
    const list = doc.styleSheets;
    const count = list ? list.length : 0;
    if (count !== sheets.count) {
      const extra = pointerSelectors(list ? Array.from(list) : []).filter((s) => {
        try {
          doc.querySelector(s);
          return true;
        } catch {
          return false;
        }
      });
      sheets = { count, selector: [CONTROL, ...extra, '[style*="cursor"]'].join(", ") };
    }
    return sheets.selector;
  };

  // Where the visible controls are, in screen pixels.
  const collect = () => {
    const list = [];
    const w = root.clientWidth;
    const h = root.clientHeight;
    const owners = new Set();
    let found;
    try {
      found = doc.querySelectorAll(selectorNow());
    } catch {
      found = doc.querySelectorAll(CONTROL);
    }
    for (const el of found) {
      const owner = ownerOf(el);
      if (!owner || owners.has(owner)) continue;
      owners.add(owner);
      // A film counts by its picture only: its own row of buttons at its
      // foot is the browser's (and its chapter buttons often lie just below).
      const foot = kindOf(owner) === "film" && owner.controls ? FILM_BAR : 0;
      let rects = null;
      for (const r of owner.getClientRects()) {
        const bottom = r.bottom - foot;
        if (r.width <= 0 || bottom - r.top <= 0 || bottom < -BAND || r.top > h + BAND || r.right < 0 || r.left > w) continue;
        (rects ||= []).push({ left: r.left, top: r.top, right: r.right, bottom });
      }
      if (!rects || !usable(owner)) continue;
      const st = style(owner);
      if (st.visibility !== "visible" || st.pointerEvents === "none") continue;
      list.push({ owner, rects, shaped: shapedIs(owner, st, rects[0]) });
    }
    note = { list, sx: win.scrollX, sy: win.scrollY, at: now(), version };
  };

  // The note, made again when it may be out of date (at most every
  // MIN_AGE while the page keeps changing; at once for a click), moved by
  // any scroll since.
  const current = (force) => {
    const age = note ? now() - note.at : Infinity;
    const scrolled = !!note && (note.sx !== win.scrollX || note.sy !== win.scrollY);
    const far = !!note && (Math.abs(win.scrollY - note.sy) > BAND / 2 || Math.abs(win.scrollX - note.sx) > BAND / 2);
    if (force || !note || far || age > MAX_AGE || ((note.version !== version || scrolled) && age >= MIN_AGE)) collect();
    return { list: note.list, dx: note.sx - win.scrollX, dy: note.sy - win.scrollY };
  };

  const inside = (p) => p.x >= 0 && p.y >= 0 && p.x < root.clientWidth && p.y < root.clientHeight;

  // Nothing between an element and the one the browser answered for cuts
  // it off (a box that hides what spills out of it, or a clip).
  const unclipped = (el, ancestor) => {
    for (let n = el.parentElement; n && n !== ancestor; n = n.parentElement) {
      const s = style(n);
      if (s.overflowX !== "visible" || s.overflowY !== "visible" || (s.clip && s.clip !== "auto") || (s.clipPath && s.clipPath !== "none")) return false;
    }
    return true;
  };

  // Is the control really what the visitor sees at this point? At the
  // very end of a link in a line of text the browser answers for the
  // paragraph around it: that counts, unless something between the two
  // cuts the link off there.
  const onTop = (owner, p, ownerAt) => {
    if (!p || !inside(p)) return false;
    const hit = doc.elementFromPoint(p.x, p.y);
    if (!hit) return false;
    const own = ownerAt(hit);
    if (own === owner) return true;
    return !own && hit !== owner && hit.contains(owner) && style(owner).display === "inline" && unclipped(owner, hit);
  };

  // The control a click at (x, y) would reach: { owner, point }, or null.
  // forClick: the click itself (a fresh note, and the whole pin asked).
  const choose = (x, y, forClick) => {
    const { list, dx, dy } = current(forClick);
    const L = x + box.left;
    const R = x + box.right;
    const T = y + box.top;
    const B = y + box.bottom;
    const scored = [];
    const shaped = [];
    const nearRects = [];
    const byRects = new Set();
    for (const c of list) {
      let rects = null;
      for (const r of c.rects) {
        const left = r.left + dx;
        const right = r.right + dx;
        const top = r.top + dy;
        const bottom = r.bottom + dy;
        if (right <= L || left >= R || bottom <= T || top >= B) continue;
        (rects ||= []).push({ left, top, right, bottom });
      }
      if (!rects) continue;
      nearRects.push(...rects);
      if (c.shaped) shaped.push(rects);
      else {
        const s = cover(x, y, rects, REACH);
        if (s) {
          scored.push({ owner: c.owner, ...s });
          byRects.add(c.owner);
        }
      }
    }
    if (!scored.length && !shaped.length && !forClick) return null;

    // The browser's answer at single points, each asked once.
    const owners = new Map();
    const ownerAt = (el) => {
      if (!owners.has(el)) owners.set(el, ownerOf(el));
      return owners.get(el);
    };
    const tally = new Map();
    const count = (want) => {
      for (const { dx: px, dy: py } of POINTS) {
        const p = { x: x + px, y: y + py };
        if (!inside(p) || !want(p)) continue;
        const hit = doc.elementFromPoint(p.x, p.y);
        const own = hit && ownerAt(hit);
        if (!own || byRects.has(own) || !usable(own) || (kindOf(own) === "film" && !filmPicture(own, p.y))) continue;
        const d = Math.hypot(px, py);
        const t = tally.get(own);
        if (!t) tally.set(own, { owner: own, area: STEP * STEP, d, point: p, sampled: true });
        else {
          t.area += STEP * STEP;
          if (d < t.d) Object.assign(t, { d, point: p });
        }
      }
    };
    const within = (rects) => (p) => rects.some((r) => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom);
    // A shape: only its points under the pin count, not its whole box.
    if (shaped.length) count(within(shaped.flat()));
    // The click: anything else under the pin that shows the pointer.
    if (forClick) {
      const known = within(nearRects);
      count((p) => !known(p));
    }
    scored.push(...tally.values());

    for (const c of rank(scored).slice(0, 3)) {
      if (c.sampled || onTop(c.owner, c.point, ownerAt) || onTop(c.owner, c.mid, ownerAt)) return c;
    }
    return null;
  };

  // A pointer over plain ground (not on a control, nor off the website).
  const plain = (target) => !!target?.closest && !!target.closest(".site") && !target.closest(OFF) && !ownerOf(target);

  const selected = () => {
    const selection = win.getSelection?.();
    return !!(selection && !selection.isCollapsed && String(selection).trim());
  };

  // A film's picture (not its own row of buttons at its foot).
  const filmPicture = (owner, y) => {
    if (!owner || kindOf(owner) !== "film") return false;
    if (!owner.controls) return true;
    return y < owner.getBoundingClientRect().bottom - FILM_BAR;
  };

  const toggle = (film) => {
    if (film.paused || film.ended) {
      const playing = film.play();
      if (playing && typeof playing.catch === "function") playing.catch(() => {});
    } else film.pause();
  };

  // The browser's own setter, so the page (React watches the property)
  // takes the new value as the visitor's.
  const setValue = (input, value) => {
    const proto = Object.getPrototypeOf(input);
    const own = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (own && own.set) own.set.call(input, value);
    else input.value = value;
  };

  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));

  // A click where the pin lay on the control, for one the browser cannot
  // click itself (a part of a drawing, or anything showing the pointer).
  const clickAt = (owner, p) => {
    let at = p && inside(p) ? doc.elementFromPoint(p.x, p.y) : null;
    if (!at || ownerOf(at) !== owner) at = owner;
    const View = win.MouseEvent || win.Event;
    at.dispatchEvent(new View("click", { bubbles: true, cancelable: true, composed: true, view: win, detail: 1, button: 0, clientX: p ? p.x : 0, clientY: p ? p.y : 0 }));
  };

  // What a click on the control does.
  const perform = (owner, p, click) => {
    const target = controlFor(owner);
    if (!target || !target.isConnected) return;
    // A label is clicked as a label (it focuses or ticks its control, as a
    // click on its words does), unless the pin lay on the control itself
    // (a field inside its own label).
    if (owner !== target) {
      const r = target.getBoundingClientRect();
      if (!p || p.x < r.left || p.x >= r.right || p.y < r.top || p.y >= r.bottom) {
        owner.click();
        return;
      }
    }
    const kind = kindOf(target);
    if (kind === "text") {
      target.focus({ preventScroll: true });
      const end = String(target.value ?? "").length;
      try {
        target.setSelectionRange?.(end, end);
      } catch {
        // an e-mail or number field keeps its own caret
      }
    } else if (kind === "menu") {
      target.focus({ preventScroll: true });
      try {
        target.showPicker?.();
      } catch {
        // the browser cannot open it from here: it stays focused
      }
    } else if (kind === "slider") {
      target.focus({ preventScroll: true });
      const r = target.getBoundingClientRect();
      const value = sliderValue(click.x, { left: r.left, width: r.width }, { min: target.min, max: target.max, step: target.step });
      if (String(value) !== target.value) {
        setValue(target, String(value));
        fire(target, "input");
        fire(target, "change");
      }
    } else if (kind === "film") toggle(target);
    else if (typeof owner.click === "function" && /^(a|area|button|input|summary|label)$/.test(owner.localName)) owner.click();
    else clickAt(owner, p);
  };

  const update = () => {
    frame = 0;
    if (!last || down) {
      forget();
      return;
    }
    const sx = win.scrollX;
    const sy = win.scrollY;
    // After a scroll under a resting pointer, something else may be under it.
    if (last.sx !== sx || last.sy !== sy) last = { ...last, target: doc.elementFromPoint(last.x, last.y) || last.target, sx, sy };
    const { x, y, target } = last;
    if (seen && seen.target === target && seen.version === version && seen.sx === sx && seen.sy === sy && Math.abs(seen.x - x) < MIN_MOVE && Math.abs(seen.y - y) < MIN_MOVE) return;
    seen = { x, y, target, version, sx, sy };
    setNear(plain(target) ? choose(x, y, false)?.owner : null);
  };

  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  // The page may have changed. (A change of style alone is not watched:
  // the globe moves its dots by their style every frame. Whatever moves
  // that way is noted again within MAX_AGE, and afresh at every click.)
  const changed = () => {
    version += 1;
    if (last && !down) schedule();
  };
  let watcher = null;
  if (typeof win.MutationObserver === "function" && doc.body) {
    watcher = new win.MutationObserver(changed);
    watcher.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "disabled", "aria-disabled", "open", "inert"] });
  }

  const onMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      last = null;
      schedule();
      return;
    }
    last = { x: event.clientX, y: event.clientY, target: event.target, sx: win.scrollX, sy: win.scrollY };
    schedule();
  };

  const onDown = (event) => {
    // A new press drops a click still waiting: it was the first half of a
    // double-click, or the visitor has moved on.
    gate.cancel();
    if (event.pointerType === "mouse" && event.isPrimary !== false && event.button === 0) {
      const own = ownerOf(event.target);
      down = { x: event.clientX, y: event.clientY, selection: selected(), film: own && kindOf(own) === "film" ? { el: own, paused: own.paused } : null };
      // A press on plain ground may become a helped click: the hover look
      // stays on (as what it shows can be part of the page, such as a dot's
      // name), so the click is worked out as the look was. Any move clears it.
      if (!plain(event.target)) forget();
    } else {
      down = { other: true };
      forget();
    }
  };

  const onUp = () => {
    // The click comes right after; the press is forgotten once it has run.
    win.setTimeout(() => {
      down = null;
    }, 0);
  };

  const onClick = (event) => {
    // The second click of a double-click is never helped, and calls off the first.
    if (event.detail > 1) {
      gate.cancel();
      forget();
      return;
    }
    if (!event.isTrusted) return; // the assist's own clicks, and a page's
    const press = down;
    const helpable =
      press &&
      !press.other &&
      !event.defaultPrevented &&
      event.button === 0 &&
      event.detail !== 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      (!event.pointerType || event.pointerType === "mouse") &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5 &&
      !press.selection &&
      !selected();
    if (!helpable) {
      forget();
      return;
    }
    // Worked out where the press was: on a Retina screen the pointer moves in
    // half pixels, and the hover look was worked out there (the click's own
    // position is rounded), so the click goes where the look said it would.
    const click = { x: press.x, y: press.y };
    // A click on a film's picture: if the browser has not started or
    // stopped it by the time a double-click would have come, the assist does.
    if (press.film && ownerOf(event.target) === press.film.el && filmPicture(press.film.el, click.y)) {
      const { el, paused } = press.film;
      gate.later(() => {
        if (el.isConnected && el.paused === paused && !selected()) toggle(el);
      });
      return;
    }
    if (!plain(event.target)) return;
    const pick = choose(click.x, click.y, true);
    if (!pick) {
      forget();
      return;
    }
    setNear(pick.owner);
    gate.later(() => {
      forget();
      if (selected() || !pick.owner.isConnected || !usable(pick.owner)) return;
      perform(pick.owner, pick.point, click);
    });
  };

  const onKey = () => {
    gate.cancel();
    last = null;
    forget();
  };
  const clear = () => {
    last = null;
    forget();
  };
  const onOut = (event) => {
    if (!event.relatedTarget) clear();
  };
  const onScroll = (event) => {
    // A panel scrolled inside the page moves its own controls; a pinned
    // part of the page does not move with the page. Either way the note is
    // made again, and once more when the scrolling stops.
    if (event.target !== doc && event.target !== root && event.target !== doc.body) changed();
    else if (last) schedule();
    win.clearTimeout(trail);
    trail = win.setTimeout(changed, MIN_AGE + 40);
  };
  const onResize = () => changed();

  doc.addEventListener("pointermove", onMove, { passive: true });
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("mouseout", onOut);
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  doc.addEventListener("transitionend", changed, true);
  doc.addEventListener("animationend", changed, true);
  win.addEventListener("resize", onResize);
  win.addEventListener("blur", clear);

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    win.clearTimeout(trail);
    gate.cancel();
    watcher?.disconnect();
    setNear(null);
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("pointerup", onUp, true);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("mouseout", onOut);
    doc.removeEventListener("scroll", onScroll, { capture: true });
    doc.removeEventListener("transitionend", changed, true);
    doc.removeEventListener("animationend", changed, true);
    win.removeEventListener("resize", onResize);
    win.removeEventListener("blur", clear);
  };
}
