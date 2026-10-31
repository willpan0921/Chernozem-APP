// WHAT THIS FILE DOES
// Lets the website's pin cursor click with the whole pin, not only its
// tip. The pin (public/site/cursor-pin.png) is 22 x 32 pixels and clicks
// at the centre of its round head (site.css). When a mouse click lands on
// nothing clickable, this looks at the points the pin covers (a grid over
// its shape, around the pointer) and finds the links and buttons under
// them; the one under the most points (if two tie, the nearest to the
// head's centre) is clicked instead. While the mouse moves, the same
// choice gets the hover look ([data-near], next to each :hover rule in
// the stylesheets), so the visitor sees what a click would do.
//
// It is careful to stay out of the way:
//   - only a plain mouse click: the main button, no Ctrl, Shift, Alt or
//     Cmd, the pointer moved under 5 px between press and release, no text
//     selected (a drag stays a drag, a selection stays a selection);
//   - never on a field (inputs, text areas, menus, editable text), a video,
//     the globe's canvas (dragging it turns the Earth) or anything marked
//     data-assist="off";
//   - never for a finger or the keyboard (a keypress clears the hover look);
//   - only on the website (SiteShell starts it; the app never does).
//
// pickTarget() is the choice itself, kept apart so it can be checked with
// pretend rectangles (cursorAssist.test.js).
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

// What counts as clickable.
export const CLICKABLE = 'a[href], button, [role="button"], label, summary, input[type="checkbox"], input[type="radio"], .globe-marker';

// Where the assist never acts.
const HANDS_OFF = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], video, audio, iframe, canvas, [data-assist="off"]';

const STEP = 3; // pixels between the points sampled
const EDGE = 1; // the pin's outline counts too

// The points the pin covers when its click point is at (x, y): a grid
// over its shape, each with its distance from the click point.
export function pinPoints(x, y, pin = PIN, step = STEP) {
  const points = [{ x, y, d: 0 }];
  for (let row = 0; row < pin.rows.length; row += step) {
    const [first, last] = pin.rows[row];
    for (let col = first - EDGE; col <= last + EDGE + 0.001; col += step) {
      const dx = col - pin.hotspot.x;
      const dy = row - pin.hotspot.y;
      points.push({ x: x + dx, y: y + dy, d: Math.hypot(dx, dy) });
    }
    // The row's right edge, so the pin reaches as far right as it is drawn.
    const dx = last + EDGE - pin.hotspot.x;
    const dy = row - pin.hotspot.y;
    points.push({ x: x + dx, y: y + dy, d: Math.hypot(dx, dy) });
  }
  return points;
}

// The target under the most points; on a tie, the one with a point
// nearest the click point. targetAt(point) answers what is under a point
// (or null).
export function pickTarget(points, targetAt) {
  const tally = new Map();
  for (const p of points) {
    const target = targetAt(p);
    if (!target) continue;
    const entry = tally.get(target) || { target, hits: 0, nearest: Infinity };
    entry.hits += 1;
    entry.nearest = Math.min(entry.nearest, p.d);
    tally.set(target, entry);
  }
  let best = null;
  for (const entry of tally.values()) {
    if (!best || entry.hits > best.hits || (entry.hits === best.hits && entry.nearest < best.nearest)) best = entry;
  }
  return best ? best.target : null;
}

function usable(el) {
  if (!el) return null;
  if (el.disabled || el.getAttribute?.("aria-disabled") === "true") return null;
  if (!el.closest?.(".site")) return null;
  return el;
}

function clickableAt(doc, point) {
  if (point.x < 0 || point.y < 0 || point.x >= doc.documentElement.clientWidth || point.y >= doc.documentElement.clientHeight) return null;
  const hit = doc.elementFromPoint(point.x, point.y);
  if (!hit || hit.closest(HANDS_OFF)) return null;
  return usable(hit.closest(CLICKABLE));
}

// Starts the assist on this page; the answer stops it again.
export function startCursorAssist(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  if (!doc || !win || typeof doc.elementFromPoint !== "function") return () => {};
  let down = null;
  let last = null;
  let near = null;
  let frame = 0;

  const setNear = (el) => {
    if (near === el) return;
    near?.removeAttribute("data-near");
    near = el || null;
    near?.setAttribute("data-near", "");
  };

  const choose = (x, y) => pickTarget(pinPoints(x, y), (p) => clickableAt(doc, p));

  const update = () => {
    frame = 0;
    if (!last || down) {
      setNear(null);
      return;
    }
    const target = last.target;
    // On a link or button already (its own hover shows), on a field, the
    // globe's canvas, or off the website: nothing to add.
    if (!target?.closest || !target.closest(".site") || target.closest(CLICKABLE) || target.closest(HANDS_OFF)) {
      setNear(null);
      return;
    }
    setNear(choose(last.x, last.y));
  };

  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  const onMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      last = null;
      schedule();
      return;
    }
    last = { x: event.clientX, y: event.clientY, target: event.target };
    schedule();
  };

  const onDown = (event) => {
    down = event.pointerType === "mouse" && event.isPrimary !== false && event.button === 0 ? { x: event.clientX, y: event.clientY } : { other: true };
    setNear(null);
  };

  const onUp = () => {
    // The click comes right after; the press is forgotten once it has run.
    win.setTimeout(() => {
      down = null;
    }, 0);
  };

  const onClick = (event) => {
    const press = down;
    if (!press || press.other || !event.isTrusted || event.defaultPrevented) return;
    if (event.button !== 0 || event.detail === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 5) return;
    const selection = win.getSelection?.();
    if (selection && !selection.isCollapsed && String(selection).trim()) return;
    const target = event.target;
    if (!target?.closest || !target.closest(".site") || target.closest(CLICKABLE) || target.closest(HANDS_OFF)) return;
    const pick = choose(event.clientX, event.clientY);
    if (pick && pick !== target) {
      setNear(null);
      pick.click();
    }
  };

  const clear = () => {
    last = null;
    setNear(null);
  };
  const onOut = (event) => {
    if (!event.relatedTarget) clear();
  };
  const onScroll = () => {
    if (last) schedule();
  };

  doc.addEventListener("pointermove", onMove, { passive: true });
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", clear, true);
  doc.addEventListener("mouseout", onOut);
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("blur", clear);

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    setNear(null);
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("pointerup", onUp, true);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("keydown", clear, true);
    doc.removeEventListener("mouseout", onOut);
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("blur", clear);
  };
}
