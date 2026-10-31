// WHAT THIS FILE DOES
// Lets the website's pin cursor click with the whole pin, not only its
// click point. The pin (public/site/cursor-pin.png) is 22 x 32 pixels and
// its click point is the centre of its round head (site.css). When a mouse
// click lands on nothing clickable, this looks at the links and buttons
// that lie under the drawn pin, or within 3 pixels of it, and clicks the
// one the pin covers most; when another is covered at least half as much
// and lies nearer the click point, that one wins. While the mouse moves, the same choice gets the hover
// look ([data-near], next to each :hover rule in the stylesheets), so the
// visitor sees what a click would do.
//
// How it stays light (it runs while the mouse moves, beside the globe's
// 3D Earth): it notes where the visible links and buttons are once, and
// again only after a scroll, a resize or a change on the page (and at most
// every third of a second while something moves), then compares the pin's
// shape with those rectangles in plain arithmetic. Only when a link or a
// button is within reach does it ask the browser what is really on top at
// one point, so nothing hidden under something else is ever chosen. A
// pointer that moved less than 3 pixels costs nothing at all.
//
// It is careful to stay out of the way:
//   - only a plain single mouse click: the main button, no Ctrl, Shift, Alt
//     or Cmd, the pointer moved under 5 px between press and release, no
//     text selected. The click is made a quarter of a second later, and not
//     at all if a second click follows: a double-click selects a word, as
//     it does everywhere else, and never clicks a link twice;
//   - never on a field (text inputs, sliders, text areas, menus, editable
//     text), a video or anything marked data-assist="off". On the globe's
//     bare Earth it helps like anywhere else (a drag still turns the Earth,
//     since a drag is never a click), but it never picks one of the globe's
//     markers: they keep the globe's own behaviour;
//   - never for a finger or the keyboard (a keypress clears the hover look);
//   - only on the website (SiteShell starts it; the app never does).
//
// The parts that decide (reachRows, rankTargets, pickTarget,
// createClickGate) are kept apart so they can be checked without a browser
// (cursorAssist.test.js).
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

// How far around the drawn pin a link or button still counts, in pixels.
export const EDGE = 3;

// When another link or button is covered at least half as much as the one
// covered most, the two count as even and the one nearer the click point
// wins (the pin's long tip covers a lot of whatever lies under it; the
// click point is where the visitor aims).
export const TIE = 0.5;

// A double-click's second press comes within this time of the first click.
export const DOUBLE_CLICK_MS = 250;

// What counts as clickable.
export const CLICKABLE = 'a[href], button, [role="button"], label, summary, input[type="checkbox"], input[type="radio"]';

// Never picked, even when the pin covers it: the globe's markers (the globe
// handles them itself) and anything marked data-assist="off".
export const NEVER_PICKED = '.globe-marker, [data-assist="off"]';

// Where the assist never acts. A tick box or a round choice is not a field:
// it can be covered by its card (the Contact page's choices), and the card
// should answer the pin.
export const HANDS_OFF = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"], video, audio, iframe, [data-assist="off"]';

const MIN_MOVE = 3; // pixels the pointer must move before the hover look is worked out again
const BAND = 200; // pixels above and below the screen whose links are noted too
const MAX_AGE = 300; // milliseconds a note of the links' places is trusted while things move

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

// How much of one rectangle the reach covers (square pixels) and the point
// of that part nearest the click point (inside it, to check what is on top
// there), with its distance.
function cover(x, y, rect, rows) {
  let area = 0;
  let best = null;
  for (const row of rows) {
    const top = Math.max(y + row.dy, rect.top);
    const bottom = Math.min(y + row.dy + 1, rect.bottom);
    if (bottom <= top) continue;
    const left = Math.max(x + row.left, rect.left);
    const right = Math.min(x + row.right, rect.right);
    if (right <= left) continue;
    area += (right - left) * (bottom - top);
    const px = right - left > 1 ? Math.min(Math.max(x, left + 0.5), right - 0.5) : (left + right) / 2;
    const py = (top + bottom) / 2;
    const d = Math.hypot(x < left ? left - x : x > right ? x - right : 0, py - y);
    if (!best || d < best.d) best = { d, point: { x: px, y: py } };
  }
  return area > 0 ? { area, ...best } : null;
}

// Every candidate ({ target, rects }) the reach touches, best first: the
// one covered most leads, unless another is covered at least TIE (half) as
// much and lies nearer the click point. Each comes with the point to check
// it at.
export function rankTargets(x, y, candidates, rows = REACH) {
  const scored = [];
  for (const { target, rects } of candidates) {
    let area = 0;
    let near = null;
    for (const rect of rects) {
      const c = cover(x, y, rect, rows);
      if (!c) continue;
      area += c.area;
      if (!near || c.d < near.d) near = c;
    }
    if (area > 0) scored.push({ target, area, d: near.d, point: near.point });
  }
  scored.sort((a, b) => b.area - a.area || a.d - b.d);
  if (scored.length < 2) return scored;
  const even = scored.filter((s) => s.area >= scored[0].area * TIE);
  const first = even.reduce((a, b) => (b.d < a.d ? b : a));
  return [first, ...scored.filter((s) => s !== first)];
}

// The target a click at (x, y) would reach, or null.
export function pickTarget(x, y, candidates, rows = REACH) {
  return rankTargets(x, y, candidates, rows)[0]?.target ?? null;
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

function usable(el) {
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
  return !!el.closest(".site") && !el.closest(HANDS_OFF);
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
  let version = 0; // goes up whenever the page may have changed
  let note = null; // the visible links and buttons: { list, sx, sy, at, version }

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

  // Where the visible links and buttons are, in screen pixels.
  const collect = () => {
    const list = [];
    const w = root.clientWidth;
    const h = root.clientHeight;
    for (const el of doc.querySelectorAll(CLICKABLE)) {
      if (el.closest(NEVER_PICKED)) continue;
      let rects = null;
      for (const r of el.getClientRects()) {
        if (r.width <= 0 || r.height <= 0 || r.bottom < -BAND || r.top > h + BAND || r.right < 0 || r.left > w) continue;
        (rects ||= []).push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
      if (!rects || !usable(el)) continue;
      const style = win.getComputedStyle(el);
      if (style.visibility !== "visible" || style.pointerEvents === "none") continue;
      list.push({ target: el, rects });
    }
    note = { list, sx: win.scrollX, sy: win.scrollY, at: now(), version };
  };

  // The note, renewed when it may be out of date, moved by any scroll since.
  const current = (force) => {
    if (force || !note || note.version !== version || now() - note.at > MAX_AGE || Math.abs(win.scrollY - note.sy) > BAND / 2 || Math.abs(win.scrollX - note.sx) > BAND / 2) collect();
    return { list: note.list, dx: note.sx - win.scrollX, dy: note.sy - win.scrollY };
  };

  // Is the target really what the visitor sees at this point?
  const onTop = (target, p) => {
    if (p.x < 0 || p.y < 0 || p.x >= root.clientWidth || p.y >= root.clientHeight) return false;
    const hit = doc.elementFromPoint(p.x, p.y);
    if (!hit || hit.closest(HANDS_OFF)) return false;
    return hit.closest(CLICKABLE) === target;
  };

  const choose = (x, y, force) => {
    const { list, dx, dy } = current(force);
    const L = x + box.left;
    const R = x + box.right;
    const T = y + box.top;
    const B = y + box.bottom;
    const close = [];
    for (const c of list) {
      let rects = null;
      for (const r of c.rects) {
        const left = r.left + dx;
        const right = r.right + dx;
        const top = r.top + dy;
        const bottom = r.bottom + dy;
        if (right <= L || left >= R || bottom <= T || top >= B) continue;
        (rects ||= []).push({ left, right, top, bottom });
      }
      if (rects) close.push({ target: c.target, rects });
    }
    if (!close.length) return null;
    for (const c of rankTargets(x, y, close).slice(0, 3)) {
      if (onTop(c.target, c.point)) return c.target;
    }
    return null;
  };

  // A pointer over plain ground (not already on a link, a field or off the website).
  const plain = (target) => !!target?.closest && !!target.closest(".site") && !target.closest(CLICKABLE) && !target.closest(HANDS_OFF);

  const selected = () => {
    const selection = win.getSelection?.();
    return !!(selection && !selection.isCollapsed && String(selection).trim());
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
    setNear(plain(target) ? choose(x, y, false) : null);
  };

  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  // The page changed (not the globe's markers, which move all the time and are never picked).
  const changed = () => {
    version += 1;
    if (last && !down) schedule();
  };
  const outsideGlobe = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el && !el.closest(".globe-stage");
  };
  let watcher = null;
  if (typeof win.MutationObserver === "function" && doc.body) {
    watcher = new win.MutationObserver((records) => {
      if (records.some((r) => outsideGlobe(r.target))) changed();
    });
    watcher.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "disabled", "aria-disabled", "open"] });
  }
  const onSettled = (event) => {
    if (outsideGlobe(event.target)) changed();
  };

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
    down = event.pointerType === "mouse" && event.isPrimary !== false && event.button === 0 ? { x: event.clientX, y: event.clientY } : { other: true };
    forget();
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
      return;
    }
    const press = down;
    if (!press || press.other || !event.isTrusted || event.defaultPrevented) return;
    if (event.button !== 0 || event.detail === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 5) return;
    if (selected() || !plain(event.target)) return;
    const pick = choose(event.clientX, event.clientY, true);
    if (!pick) return;
    setNear(pick);
    gate.later(() => {
      forget();
      if (selected() || !pick.isConnected) return;
      pick.click();
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
    // A panel scrolled inside the page moves its own links.
    if (event.target !== doc && event.target !== root && event.target !== doc.body) changed();
    else if (last) schedule();
  };
  const onResize = () => changed();

  doc.addEventListener("pointermove", onMove, { passive: true });
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("mouseout", onOut);
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  doc.addEventListener("transitionend", onSettled, true);
  doc.addEventListener("animationend", onSettled, true);
  win.addEventListener("resize", onResize);
  win.addEventListener("blur", clear);

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
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
    doc.removeEventListener("transitionend", onSettled, true);
    doc.removeEventListener("animationend", onSettled, true);
    win.removeEventListener("resize", onResize);
    win.removeEventListener("blur", clear);
  };
}
