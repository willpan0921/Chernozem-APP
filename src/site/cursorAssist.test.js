// WHAT THIS FILE DOES
// Checks the pin cursor's click assist (cursorAssist.js) without a
// browser. First the parts that decide: how far the pin reaches around its
// click point and the points under it that are asked what is on top; which
// control it picks from pretend rectangles (the one it covers most; when
// another is covered at least half as much, the nearer); what counts as
// clickable (the browser's controls, and anything a stylesheet gives the
// pointer cursor); what a click does to each kind of control; where a
// slider's thumb goes; the short wait that lets a double-click call a click
// off. Then, on a small pretend page, the whole thing wired up: a click
// beside a button clicks it once, a double-click clicks nothing, the pin
// beside a field puts the caret in it, over a slider moves its thumb, over
// a menu opens it, over a film plays it, over a region of the demo's map
// clicks that region where the pin lay, over the globe's dots clicks the
// dot; a click on a film's picture plays it when the browser did not, its
// own row of buttons is left to the browser, and between a film and its
// chapter buttons the chapter wins; the
// end of a link in a line of text still counts while a field clipped out of
// sight never does; a control that holds still while the page scrolls is
// found where it is; a click that clears a selection, a finger, a disabled
// button and data-assist="off" are left alone; moving the mouse costs no
// hit tests until something is within reach. Also checks that the
// stylesheet's hotspot matches the pin's, and that every control keeps the
// pin with a near look beside each hover look.
//
// WHO EDITS IT
// Whoever changes the cursor.
// Run: node --test src/site/cursorAssist.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTROL,
  DOUBLE_CLICK_MS,
  EDGE,
  FILM_BAR,
  OFF,
  PIN,
  STEP,
  THUMB_HALF,
  TIE,
  createClickGate,
  isPointerCursor,
  kindOf,
  pickTarget,
  pointerSelectors,
  rankTargets,
  reachPoints,
  reachRows,
  shownBy,
  sliderValue,
  splitSelectors,
  startCursorAssist,
} from "./cursorAssist.js";

const here = dirname(fileURLToPath(import.meta.url));

// A pretend rectangle in screen pixels.
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
const one = (target, r) => ({ target, rects: [r] });

test("the pin reaches as far as it is drawn, plus a few pixels all round", () => {
  const rows = reachRows();
  assert.equal(rows.length, PIN.height + 2 * EDGE);
  const left = Math.min(...rows.map((r) => r.left));
  const right = Math.max(...rows.map((r) => r.right));
  assert.equal(left, -PIN.hotspot.x - EDGE, "the head's left side, plus EDGE");
  assert.equal(right, PIN.width - PIN.hotspot.x + EDGE, "the head's right side, plus EDGE");
  assert.equal(rows[0].dy, -PIN.hotspot.y - EDGE, "the top of the head, plus EDGE");
  assert.equal(rows[rows.length - 1].dy, PIN.height - 1 - PIN.hotspot.y + EDGE, "the tip, plus EDGE");
  // The tip is narrow: a few pixels either side of the click point's column.
  const tip = rows[rows.length - 1];
  assert.ok(tip.right - tip.left <= 2 + 2 * EDGE);
});

test("the points asked under the pin lie inside its reach, a few pixels apart, the click point's own pixel among them", () => {
  const rows = reachRows();
  const points = reachPoints(STEP, rows);
  assert.ok(points.length > 40 && points.length < 140, `${points.length} points`);
  assert.ok(points.some((p) => p.dx === 0.5 && p.dy === 0.5), "the click point's pixel");
  for (const p of points) {
    const row = rows.find((r) => r.dy + 0.5 === p.dy);
    assert.ok(row && p.dx > row.left && p.dx < row.right, `(${p.dx}, ${p.dy}) is inside the reach`);
  }
  // The tip (21 px below the click point) and the head's sides are asked too.
  assert.ok(points.some((p) => p.dy >= 21));
  assert.ok(points.some((p) => p.dx <= -11) && points.some((p) => p.dx >= 10));
});

test("a button under part of the pin is picked", () => {
  assert.equal(pickTarget(100, 200, [one("register", rect(108, 190, 80, 30))]), "register"); // 8 px to the right
  assert.equal(pickTarget(100, 200, [one("register", rect(10, 190, 77, 30))]), "register"); // ends 13 px to the left
});

test("a link under the pin's tip, or just past it, is picked", () => {
  assert.equal(pickTarget(100, 200, [one("story", rect(90, 215, 60, 20))]), "story"); // 15 px below
  assert.equal(pickTarget(100, 200, [one("story", rect(90, 224, 60, 20))]), "story"); // 24 px below: the tip plus EDGE
});

test("nothing is picked on empty ground or beyond the pin's reach", () => {
  assert.equal(pickTarget(100, 200, []), null);
  assert.equal(pickTarget(100, 200, [one("far", rect(140, 150, 80, 40))]), null); // 40 px to the right
  assert.equal(pickTarget(100, 200, [one("right", rect(115, 190, 50, 20))]), null); // 15 px to the right
  assert.equal(pickTarget(100, 200, [one("left", rect(20, 190, 66, 20))]), null); // ends 14 px to the left
  assert.equal(pickTarget(100, 200, [one("below", rect(90, 225, 60, 20))]), null); // 25 px below
  assert.equal(pickTarget(100, 200, [one("above", rect(90, 150, 60, 37))]), null); // ends 13 px above
});

test("the target the pin covers most wins", () => {
  const sliver = one("about", rect(85, 196, 6, 8)); // a sliver to the left
  const big = one("story", rect(104, 186, 60, 40)); // most of the right half
  assert.equal(pickTarget(100, 200, [sliver, big]), "story");
  assert.equal(pickTarget(100, 200, [big, sliver]), "story");
});

test("when two are about even (the nearer covered at least half as much), the nearer wins, whatever the order", () => {
  // Left link ends 1 px from the click point, right link starts 3 px from it.
  const left = one("near", rect(40, 190, 59, 20));
  const right = one("far", rect(103, 190, 60, 20));
  const ranked = rankTargets(100, 200, [right, left]);
  assert.ok(Math.min(ranked[0].area, ranked[1].area) >= Math.max(ranked[0].area, ranked[1].area) * TIE, "the two really are about even");
  assert.equal(pickTarget(100, 200, [left, right]), "near");
  assert.equal(pickTarget(100, 200, [right, left]), "near");
  // Not even: the one covered far more wins although it is farther away.
  const tall = one("tall", rect(106, 150, 60, 100)); // 6 px to the right
  const dot = one("dot", rect(99, 203, 4, 3)); // 3 px below
  assert.equal(pickTarget(100, 200, [dot, tall]), "tall");
  // Two toggles one above the other: a click 3 px under the upper one,
  // 7 px above the lower one. The tip covers more of the lower one, the
  // click point is nearer the upper one: the upper one wins.
  const soil = one("Black soil", rect(32, 530, 109, 40));
  const minor = one("Show minor alerts", rect(32, 580, 127, 36));
  assert.equal(pickTarget(86, 573, [minor, soil]), "Black soil");
  assert.equal(pickTarget(86, 577, [minor, soil]), "Show minor alerts"); // now nearer the lower one
});

test("a link that wraps onto two lines counts with both of its pieces", () => {
  const wrapped = { target: "paper", rects: [rect(300, 180, 200, 18), rect(40, 206, 50, 18)] };
  assert.equal(pickTarget(100, 200, [wrapped]), "paper"); // its second line ends 10 px to the left
});

test("the point checked on a control lies a little inside it, not on its very edge", () => {
  // The head's side over the last 4 px of a link: the browser answers for
  // the paragraph at a link's last pixel or so, so the check is 2 px in.
  const [c] = rankTargets(100, 200, [one("link", rect(40, 190, 56, 20))]); // ends 4 px left of the click point
  assert.ok(c.point.x <= 96 - 2 && c.point.x >= 92, `checked at x ${c.point.x}`);
  // A wide control is checked right beside the click point, still inside it.
  const [d] = rankTargets(100, 200, [one("bar", rect(0, 210, 400, 30))]); // under the tip
  assert.equal(d.point.x, 100);
  assert.ok(d.point.y >= 210 && d.point.y < 240);
});

test("a click waits a quarter of a second, and a second click calls it off", () => {
  const timers = clock();
  const gate = createClickGate(timers, DOUBLE_CLICK_MS);
  let runs = 0;
  gate.later(() => (runs += 1));
  assert.ok(gate.waiting);
  timers.advance(DOUBLE_CLICK_MS - 1);
  assert.equal(runs, 0, "not yet");
  timers.advance(1);
  assert.equal(runs, 1, "made once the wait is over");
  gate.later(() => (runs += 1));
  timers.advance(100);
  gate.cancel();
  timers.advance(1000);
  assert.equal(runs, 1, "called off");
  gate.later(() => (runs += 10));
  gate.later(() => (runs += 100));
  timers.advance(1000);
  assert.equal(runs, 101, "only the latest of two waiting clicks is made");
});

test("what counts as clickable: the browser's controls, form fields, films and their roles; the assist can be switched off", () => {
  for (const selector of ["a[href]", "button", "summary", "label", 'input:not([type="hidden"])', "select", "textarea", "video", '[role="button"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="link"]', '[role="option"]', '[role="menuitem"]']) {
    assert.ok(CONTROL.split(", ").includes(selector), `${selector} is a control`);
  }
  assert.doesNotMatch(CONTROL, /canvas|globe-marker|earth/, "nothing of a particular page");
  assert.match(OFF, /data-assist="off"/);
  assert.match(OFF, /iframe/);
});

test("a cursor shows the pointer when its last word is pointer (the site's pin falls back to it)", () => {
  assert.ok(isPointerCursor("pointer"));
  assert.ok(isPointerCursor('url("https://chernozem.app/site/cursor-pin.png") 11 10, pointer'));
  assert.ok(isPointerCursor('image-set(url("/site/cursor-pin.png") 1x, url("/site/cursor-pin@2x.png") 2x) 11 10, pointer'));
  for (const not of ["auto", "default", "text", "grab", 'url("/site/cursor-pin.png") 11 10, auto', "", null, undefined]) assert.ok(!isPointerCursor(not), `${not} is not the pointer`);
});

test("what a click does to each kind of control", () => {
  const el = (localName, extra = {}) => ({ localName, ...extra });
  assert.equal(kindOf(el("a")), "press");
  assert.equal(kindOf(el("button")), "press");
  assert.equal(kindOf(el("label")), "press");
  assert.equal(kindOf(el("path")), "press", "a region of a map");
  for (const type of ["text", "email", "password", "search", "tel", "url", "number", "date"]) assert.equal(kindOf(el("input", { type })), "text", type);
  for (const type of ["checkbox", "radio", "submit", "button", "file", "color"]) assert.equal(kindOf(el("input", { type })), "press", type);
  assert.equal(kindOf(el("input", { type: "range" })), "slider");
  assert.equal(kindOf(el("textarea")), "text");
  assert.equal(kindOf(el("div", { isContentEditable: true })), "text");
  assert.equal(kindOf(el("select")), "menu");
  assert.equal(kindOf(el("video")), "film");
  assert.equal(kindOf(el("audio")), "film");
});

test("a slider's thumb goes where the pin points, on its step, within its ends", () => {
  const track = { left: 100, width: 216 }; // the thumb's centre runs from 108 to 308
  const range = { min: "0", max: "100", step: "1" };
  assert.equal(sliderValue(108, track, range), 0);
  assert.equal(sliderValue(308, track, range), 100);
  assert.equal(sliderValue(208, track, range), 50);
  assert.equal(sliderValue(158, track, range), 25);
  assert.equal(sliderValue(40, track, range), 0, "left of the slider: its lowest");
  assert.equal(sliderValue(900, track, range), 100, "right of it: its highest");
  assert.equal(sliderValue(208, track, { min: "0", max: "60", step: "1" }), 30);
  assert.equal(sliderValue(208, track, { min: "0", max: "1", step: "0.1" }), 0.5);
  assert.equal(sliderValue(213, track, { min: "0", max: "100", step: "10" }), 50, "to the nearest step");
  assert.equal(sliderValue(158.4, track, { min: "0", max: "100", step: "any" }), 25.2);
  assert.equal(sliderValue(208, track, { min: "", max: "", step: "" }), 50, "the defaults: 0 to 100 by 1");
  assert.equal(THUMB_HALF, 8);
});

test("a stylesheet's pointer cursors are found, without :hover or ::before, inside @media too; other sites' sheets are skipped", () => {
  assert.deepEqual(splitSelectors('.a, .b :is(x, y), [data-x="1,2"]'), [".a", ".b :is(x, y)", '[data-x="1,2"]']);
  assert.equal(shownBy(".demo-unit:hover path:first-child"), ".demo-unit path:first-child");
  assert.equal(shownBy(".x::before"), ".x");
  assert.equal(shownBy("a:focus-visible"), "a");
  const rule = (selectorText, cursor) => ({ selectorText, style: { getPropertyValue: (name) => (name === "cursor" ? cursor : "") } });
  const sheets = [
    { cssRules: [rule(".demo-unit path", "pointer"), rule(".plain", "auto"), rule(".site .pin", 'url("/site/cursor-pin.png") 11 10, pointer')] },
    { cssRules: [{ cssRules: [rule(".card:hover, .row", "pointer")] }] }, // an @media block
    {
      get cssRules() {
        throw new Error("SecurityError");
      },
    }, // another site's stylesheet
    { cssRules: [rule("& .nested", "pointer")] },
  ];
  assert.deepEqual(pointerSelectors(sheets).sort(), [".card", ".demo-unit path", ".row", ".site .pin"]);
});

test("the stylesheet clicks at the pin's head, where the assist measures from", () => {
  const css = readFileSync(join(here, "site.css"), "utf8");
  const spots = [...css.matchAll(/cursor-pin(?:@2x)?\.png\)[^;]*?(\d+) (\d+), (?:auto|pointer)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(spots.length >= 4);
  for (const spot of spots) assert.equal(spot, `${PIN.hotspot.x} ${PIN.hotspot.y}`);
  // The head's centre: the widest rows of the pin are around row 10.
  const widest = Math.max(...PIN.rows.map(([a, b]) => b - a));
  const rows = PIN.rows.map(([a, b], i) => (b - a === widest ? i : null)).filter((i) => i !== null);
  assert.ok(Math.abs((rows[0] + rows[rows.length - 1]) / 2 - PIN.hotspot.y) <= 1);
});

test("every control keeps the pin (never the system's hand), the roles the assist clicks included, and the near looks mirror their hover looks", () => {
  const css = readFileSync(join(here, "site.css"), "utf8");
  const rule = css.match(/\.site :is\(([^)]*\([^)]*\)[^)]*)*[^)]*\)[^{]*\{[^}]*\}/);
  assert.ok(rule, "one rule for every control");
  for (const part of ['[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="link"]', '[role="option"]', '[role="menuitem"]', 'input[type="file"]', 'input[type="color"]', 'input[type="reset"]']) {
    assert.ok(rule[0].includes(part), `${part} keeps the pin`);
  }
  assert.match(rule[0], /cursor-pin\.png\) 11 10, pointer/);
  // register.css's hover looks, and the demo map's, have their pin-near twins here.
  for (const near of [".reg-btn-primary[data-near]:not([disabled])", ".reg-btn-second[data-near]:not([disabled])", ".reg-choice-item[data-near]:not(:has(input:checked))", ".reg-kind[data-near]:not(:has(input:checked))", ".reg-textbtn[data-near]", ".reg-show[data-near]", ".reg a:not(.reg-btn)[data-near]", ".demo-unit path:first-child[data-near]"]) {
    assert.ok(css.includes(near), `site.css styles ${near}`);
  }
});

// Pretend timers with a clock that only moves when told to.
function clock() {
  let t = 0;
  let id = 0;
  const due = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) {
      id += 1;
      due.set(id, { at: t + (ms || 0), fn });
      return id;
    },
    clearTimeout(n) {
      due.delete(n);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        due.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

// ---- A pretend page: just enough of a document and a window for the assist ----
// Each element has a tag, a box, a parent and a computed style. Later
// elements lie on top of earlier ones. The selectors the assist asks about
// are answered by plain tests on the element, as a browser would.
const ROLES = ["button", "link", "tab", "switch", "checkbox", "radio", "option", "menuitem", "menuitemcheckbox", "menuitemradio"];
const isControl = (el) =>
  (el.localName === "a" && el.attrs.has("href")) ||
  ["button", "summary", "label", "select", "textarea", "video"].includes(el.localName) ||
  (el.localName === "input" && el.type !== "hidden") ||
  ROLES.includes(el.attrs.get("role")) ||
  el.isContentEditable;

class PretendElement {
  constructor(page, tag, box, { parent = null, classes = [], attrs = {}, style = {}, hitBox, ...extra } = {}) {
    this.page = page;
    this.localName = tag;
    this.box = box;
    this.hitBox = hitBox === undefined ? box : hitBox; // where the browser says it is on top (null: nowhere)
    this.parentElement = parent;
    this.classList = { contains: (c) => classes.includes(c) };
    this.classes = classes;
    this.attrs = new Map(Object.entries(attrs));
    this.computed = { cursor: "auto", display: "block", visibility: "visible", pointerEvents: "auto", overflowX: "visible", overflowY: "visible", clip: "auto", clipPath: "none", borderTopLeftRadius: "0px", ...style };
    this.nodeType = 1;
    this.isConnected = true;
    this.disabled = false;
    this.namespaceURI = tag === "path" ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml";
    this.clicks = 0;
    this.events = [];
    this.focused = 0;
    Object.assign(this, extra);
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  setAttribute(k, v) {
    this.attrs.set(k, v);
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  getClientRects() {
    return this.box ? [{ ...this.box, width: this.box.right - this.box.left, height: this.box.bottom - this.box.top }] : [];
  }
  getBoundingClientRect() {
    return this.getClientRects()[0] || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  contains(other) {
    for (let n = other; n; n = n.parentElement) if (n === this) return true;
    return false;
  }
  closest(selector) {
    const test = {
      ".site": (n) => n.classes.includes("site"),
      label: (n) => n.localName === "label",
    }[selector] || (selector === CONTROL ? isControl : selector === OFF ? (n) => n.attrs.get("data-assist") === "off" || n.localName === "iframe" : null);
    assert.ok(test, `the pretend page knows the selector ${selector}`);
    for (let n = this; n; n = n.parentElement) if (test(n)) return n;
    return null;
  }
  click() {
    this.clicks += 1;
    this.page.log.push(`click ${this.name || this.localName}`);
    if (this.localName === "label" && this.control) this.control.focus();
  }
  dispatchEvent(event) {
    this.events.push(event);
    for (let n = this; n; n = n.parentElement) if (event.type === "click") n.heard = (n.heard || 0) + 1;
    this.page.log.push(`${event.type} ${this.name || this.localName}`);
    return true;
  }
  focus(options) {
    this.focused += 1;
    this.focusOptions = options;
    this.page.log.push(`focus ${this.name || this.localName}`);
  }
}

// A field's value lives on its prototype, as in a browser, so the assist
// can set it the way the page (React) expects.
class PretendInput extends PretendElement {
  get value() {
    return this._value ?? "";
  }
  set value(v) {
    this._value = String(v);
    this.page.log.push(`value ${this.name} ${v}`);
  }
  setSelectionRange(a, b) {
    this.caret = [a, b];
  }
}

function pretendPage() {
  const timers = clock();
  const elements = [];
  const log = [];
  const counts = { hits: 0, queries: 0 };
  const page = { log };
  const make = (tag, box, options = {}) => {
    const el = new (["input", "textarea", "select"].includes(tag) ? PretendInput : PretendElement)(page, tag, box, options);
    elements.push(el);
    return el;
  };
  const listeners = { doc: [], win: [] };
  const add = (list) => (type, fn) => list.push({ type, fn });
  const remove = (list) => (type, fn) => {
    const i = list.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  };
  const frames = [];
  let selection = "";
  const hitTest = (x, y) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const b = el.hitBox;
      if (!b || el.computed.pointerEvents === "none" || el.computed.visibility !== "visible") continue;
      if (x >= b.left && x < b.right && y >= b.top && y < b.bottom && (!el.shape || el.shape(x, y))) return el;
    }
    return null;
  };
  const doc = {
    documentElement: { clientWidth: 1440, clientHeight: 900 },
    body: null,
    styleSheets: [],
    elementFromPoint(x, y) {
      counts.hits += 1;
      return hitTest(x, y);
    },
    querySelectorAll(selector) {
      counts.queries += 1;
      assert.ok(selector.startsWith(CONTROL), "the controls, then what the stylesheets add");
      return elements.filter((e) => isControl(e) || e.styled);
    },
    querySelector: () => null,
    addEventListener: add(listeners.doc),
    removeEventListener: remove(listeners.doc),
  };
  class PretendEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  const win = {
    scrollX: 0,
    scrollY: 0,
    performance: { now: timers.now },
    setTimeout: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimeout: (n) => timers.clearTimeout(n),
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    getComputedStyle: (el) => el.computed,
    getSelection: () => ({ isCollapsed: !selection, toString: () => selection }),
    Event: PretendEvent,
    MouseEvent: PretendEvent,
    addEventListener: add(listeners.win),
    removeEventListener: remove(listeners.win),
  };
  const fire = (type, event) => {
    for (const l of listeners.doc.filter((l) => l.type === type)) l.fn(event);
  };
  const flush = () => {
    while (frames.length) frames.shift()(0);
  };
  const mouse = { pointerType: "mouse", isPrimary: true, button: 0 };
  const move = (x, y) => {
    fire("pointermove", { ...mouse, clientX: x, clientY: y, target: hitTest(x, y) });
    flush();
  };
  // A style change on the page finishes (a hover colour, an entrance).
  const settle = (target) => {
    fire("transitionend", { target });
    flush();
  };
  // A press, a release and the click, as the browser sends them; `during`
  // runs between the press and the click (the browser's own reaction).
  const click = (x, y, { detail = 1, pointerType = "mouse", during } = {}) => {
    const target = hitTest(x, y);
    const kind = { ...mouse, pointerType };
    fire("pointerdown", { ...kind, clientX: x, clientY: y, target });
    fire("pointerup", { ...kind, clientX: x, clientY: y, target });
    during?.();
    fire("click", { ...kind, isTrusted: true, detail, clientX: x, clientY: y, target, defaultPrevented: false });
    timers.advance(0);
  };
  const select = (text) => (selection = text);
  // The page scrolls (win.scrollX/Y already set by the test).
  const scroll = () => {
    fire("scroll", { target: doc });
    flush();
  };
  return { make, doc, win, timers, counts, move, click, settle, scroll, listeners, log, select, flush };
}

// The About page's first screen: the words with a button and a toggle at
// the left, the globe's bare Earth (its canvas) with one dot.
function aboutHero() {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 5000), { classes: ["site"] });
  const stage = page.make("div", rect(0, 72, 1440, 828), { parent: site });
  const canvas = page.make("canvas", rect(0, 72, 1440, 828), { parent: stage });
  const marker = page.make("button", rect(700, 500, 28, 28), { parent: stage, name: "marker", style: { cursor: "pointer" } });
  const lead = page.make("p", rect(32, 300, 508, 80), { parent: site });
  const register = page.make("a", rect(32, 412, 198, 48), { parent: site, attrs: { href: "/register" }, name: "register", style: { cursor: "pointer" } });
  const soil = page.make("button", rect(32, 492, 108, 40), { parent: site, name: "soil", style: { cursor: "pointer" } });
  return { ...page, site, canvas, marker, lead, register, soil };
}

test("a click beside a button clicks it once, a moment later", () => {
  const page = aboutHero();
  const stop = startCursorAssist(page.doc, page.win);
  page.click(236, 436); // 6 px right of Register, on the canvas
  assert.equal(page.register.clicks, 0, "it waits in case a second click follows");
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 1);
  page.timers.advance(5000);
  assert.equal(page.register.clicks, 1, "only once");
  stop();
  assert.equal(page.listeners.doc.length + page.listeners.win.length, 0, "stopping removes every listener");
});

test("a double-click beside a link clicks nothing (it selects a word instead)", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.click(236, 436, { detail: 1 });
  page.timers.advance(80);
  page.click(236, 436, { detail: 2 });
  page.timers.advance(2000);
  assert.equal(page.register.clicks, 0);
});

test("a click on the globe's bare Earth reaches a toggle under the tip, and a dot under any part of the pin", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.click(86, 478); // 14 px above Black soil: the pin's tip lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.soil.clicks, 1, "the toggle under the tip");
  page.click(714, 482); // 18 px above a dot: the tip lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.marker.clicks, 1, "the dot under the tip");
  page.click(736, 514); // 8 px right of it: the head's side
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.marker.clicks, 2, "the dot under the head");
});

test("the click goes where the hover look shows, even when the look itself changes what lies under the pin (a dot's name)", () => {
  // Two round dots of the globe, 10 px apart. The dot with the pin's hover
  // look shows its name: a strip from 26 px right of its centre, over the
  // other dot.
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const round = (cx, cy) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= 256;
  const a = page.make("button", rect(100, 100, 32, 32), { parent: site, name: "A", style: { cursor: "pointer", borderTopLeftRadius: "50%" }, shape: round(116, 116) });
  const b = page.make("button", rect(142, 100, 32, 32), { parent: site, name: "B", style: { cursor: "pointer", borderTopLeftRadius: "50%" }, shape: round(158, 116) });
  const name = page.make("span", { left: 142, top: 109, right: 330, bottom: 123 }, { parent: a, name: "A's name" });
  Object.defineProperty(name, "hitBox", { get: () => (a.attrs.has("data-near") ? name.box : null) });
  startCursorAssist(page.doc, page.win);
  page.move(135, 118); // nearer A: A's look, and its name shows
  assert.equal(a.getAttribute("data-near"), "");
  page.move(139, 118); // 4 px on, just short of the name: without the name B would be nearer and covered more
  assert.equal(a.getAttribute("data-near"), "", "the look stays on A, whose name now lies under most of the pin");
  page.click(139, 118);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(a.clicks, 1, "the click reaches A, as the look showed");
  assert.equal(b.clicks, 0);
});

test("a finger, a click with a key held, one after selecting text and one where the assist is off are left alone", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.click(236, 436, { pointerType: "touch" });
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 0, "a finger");
  page.select("Chernozem");
  page.click(236, 436); // the click that clears the selection
  page.select("");
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 0, "a click that clears a selection");
  page.register.attrs.set("data-assist", "off");
  page.click(236, 436);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 0, "data-assist=off");
  page.register.attrs.delete("data-assist");
  page.register.disabled = true;
  page.click(236, 436);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 0, "a disabled control");
  page.register.disabled = false;
  page.click(236, 436);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 1, "and then a plain click is helped again");
});

test("moving the mouse costs no hit test until a control is within reach", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.move(400, 330); // over the lead, nothing within reach
  const afterFirst = { ...page.counts };
  for (let i = 1; i <= 20; i++) page.move(400 + i * 7, 330 + (i % 3)); // along the lead
  // (The pretend page counts only the assist's own questions to the browser.)
  assert.equal(page.counts.hits - afterFirst.hits, 0, "no hit tests");
  assert.equal(page.counts.queries, 1, "the controls' places were noted once");
  const before = page.counts.hits;
  page.move(120, 395); // 17 px above Register: within reach of the pin's tip
  assert.equal(page.register.getAttribute("data-near"), "", "the hover look shows on Register");
  assert.equal(page.counts.hits - before, 1, "one hit test to check Register is really on top");
  page.move(121, 396); // under 3 px: nothing to work out again
  assert.equal(page.counts.hits - before, 1, "no hit test");
  assert.equal(page.register.getAttribute("data-near"), "");
  page.move(600, 700); // away again
  assert.equal(page.register.getAttribute("data-near"), null);
  assert.equal(page.counts.queries, 1, "the page did not change, so the places were never noted again");
});

test("after a helped click is made, the next move, however small, shows the hover look again", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.move(236, 436); // 6 px right of Register
  assert.equal(page.register.getAttribute("data-near"), "");
  page.click(236, 436);
  page.settle(page.register); // its hover colour finishes changing while the click waits
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.register.clicks, 1);
  assert.equal(page.register.getAttribute("data-near"), null, "cleared as the click is made");
  page.move(237, 437); // a 1 px move
  assert.equal(page.register.getAttribute("data-near"), "", "worked out again");
});

test("a control that holds still on the screen while the page scrolls (a story that holds the screen) is found where it is", () => {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 5000), { classes: ["site"] });
  const story = page.make("section", rect(0, 0, 1440, 900), { parent: site });
  const link = page.make("a", rect(600, 500, 120, 24), { parent: story, attrs: { href: "/field" }, name: "story link", style: { cursor: "pointer" } });
  startCursorAssist(page.doc, page.win);
  page.move(727, 512); // 7 px right of the link
  assert.equal(link.getAttribute("data-near"), "");
  // The page scrolls 60 px; the story holds still, so its link stays put
  // on the screen (a note moved by the scroll would put it 60 px higher).
  page.win.scrollY = 60;
  page.timers.advance(150);
  page.scroll();
  assert.equal(link.getAttribute("data-near"), "", "still found where it is");
  page.click(727, 512);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(link.clicks, 1);
});

// A form: a text field inside its own label, a slider with its label above
// it, a menu, a tick box inside a card, and a field clipped out of sight
// (a trap for robots).
function form() {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const formEl = page.make("form", rect(0, 0, 1440, 3000), { parent: site });
  const nameLabel = page.make("label", rect(40, 100, 400, 80), { parent: formEl, name: "name label" });
  const name = page.make("input", rect(40, 130, 400, 50), { parent: nameLabel, type: "text", name: "name", style: { cursor: "text" } });
  nameLabel.control = name;
  name._value = "Danylo";
  const email = page.make("input", rect(480, 130, 400, 50), { parent: formEl, type: "email", name: "email", style: { cursor: "text" } });
  email.setSelectionRange = () => {
    throw new Error("InvalidStateError");
  };
  const sliderLabel = page.make("label", rect(40, 260, 120, 22), { parent: formEl, name: "slider label" });
  const slider = page.make("input", rect(40, 290, 216, 20), { parent: formEl, type: "range", name: "slider", min: "0", max: "100", step: "1", style: { cursor: "pointer" } });
  slider._value = "50";
  sliderLabel.control = slider;
  const menu = page.make("select", rect(480, 260, 200, 44), { parent: formEl, name: "menu", style: { cursor: "pointer" } });
  menu.showPicker = () => page.log.push("picker menu");
  const card = page.make("label", rect(40, 400, 300, 64), { parent: formEl, name: "card", style: { cursor: "pointer" } });
  const tick = page.make("input", rect(52, 420, 20, 20), { parent: card, type: "checkbox", name: "tick", style: { cursor: "pointer" } });
  card.control = tick;
  const trap = page.make("div", rect(40, 560, 1, 1), { parent: formEl, style: { overflowX: "hidden", overflowY: "hidden", clip: "rect(0px, 0px, 0px, 0px)" } });
  const trapLabel = page.make("label", rect(40, 560, 300, 40), { parent: trap, name: "trap label", style: { display: "inline" }, hitBox: null });
  const trapField = page.make("input", rect(40, 570, 300, 30), { parent: trapLabel, type: "text", name: "trap", hitBox: null });
  trapLabel.control = trapField;
  return { ...page, name, nameLabel, email, slider, sliderLabel, menu, card, tick, trapField };
}

test("the pin beside a text field puts the caret in it, at the end of its text", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(447, 150); // 7 px right of the name field: the head's side lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.name.focused, 1, "focused");
  assert.deepEqual(page.name.caret, [6, 6], "the caret after 'Danylo'");
  assert.deepEqual(page.name.focusOptions, { preventScroll: true });
  page.click(680, 112); // 18 px above the e-mail field: the tip lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.email.focused, 1, "an e-mail field, which keeps its own caret");
});

test("the pin over a slider moves its thumb to the click point, and the page hears it as the visitor's", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(200, 274); // 16 px above the slider, right of its label: the body and the tip lie on it
  page.timers.advance(DOUBLE_CLICK_MS);
  // The thumb's centre runs from 48 to 248: 200 is 76% of the way.
  assert.equal(page.slider.value, "76", "the thumb under the click point");
  assert.deepEqual(page.slider.events.map((e) => e.type), ["input", "change"]);
  assert.ok(page.log.includes("value slider 76"), "set through the browser's own setter");
  assert.equal(page.slider.focused, 1);
});

test("the pin over a slider's label works it as a label: the slider is focused, its thumb stays", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(167, 271); // 7 px right of the label's words; the tip just reaches the slider below
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.sliderLabel.clicks, 1, "the label, covered more and nearer");
  assert.equal(page.slider.focused, 1, "which focuses its slider");
  assert.equal(page.slider.value, "50", "the thumb did not move");
  assert.equal(page.slider.events.length, 0);
});

test("the pin beside a menu opens it", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(687, 282); // 7 px right of the menu
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.menu.focused, 1);
  assert.ok(page.log.includes("picker menu"), "opened");
});

test("the pin beside a card with a tick box clicks the card (a label), which ticks its box", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(347, 432); // 7 px right of the card
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.card.clicks, 1);
});

test("a field clipped out of sight is never picked, though its box is under the pin", () => {
  const page = form();
  startCursorAssist(page.doc, page.win);
  page.click(200, 575); // on the trap's invisible box
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.trapField.focused, 0);
  page.move(200, 575);
  assert.equal(page.trapField.getAttribute("data-near"), null);
});

test("the end of a link in a line of text counts, though the browser answers for the paragraph at its last pixels", () => {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const p = page.make("p", rect(40, 400, 800, 72), { parent: site });
  // The link's box ends at 405.3; the browser finds it only up to 402.3.
  const link = page.make("a", { left: 362.25, top: 416.7, right: 405.3, bottom: 434.7 }, { parent: p, attrs: { href: "https://acleddata.com/" }, name: "ACLED", style: { display: "inline", cursor: "pointer" }, hitBox: { left: 362.25, top: 416.7, right: 402.3, bottom: 434.7 } });
  startCursorAssist(page.doc, page.win);
  page.click(412.3, 425.7); // 7 px right of the link, on the paragraph's words
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(link.clicks, 1);
  // The same link cut off by a box that hides what spills out of it is not.
  const page2 = pretendPage();
  const site2 = page2.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const p2 = page2.make("p", rect(40, 400, 800, 72), { parent: site2 });
  const box = page2.make("span", rect(40, 400, 200, 72), { parent: p2, style: { overflowX: "hidden", overflowY: "hidden" }, hitBox: null });
  const cut = page2.make("a", { left: 362.25, top: 416.7, right: 405.3, bottom: 434.7 }, { parent: box, attrs: { href: "/x" }, style: { display: "inline", cursor: "pointer" }, hitBox: null });
  startCursorAssist(page2.doc, page2.win);
  page2.click(412.3, 425.7);
  page2.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(cut.clicks, 0);
});

// Films: one on a page, with its own row of buttons at its foot.
function filmPage({ preload = "none" } = {}) {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const section = page.make("section", rect(0, 0, 1440, 3000), { parent: site });
  const film = page.make("video", rect(32, 200, 1376, 774), { parent: section, controls: true, paused: true, ended: false, name: "film", preload });
  film.play = () => {
    film.paused = false;
    page.log.push("play");
    return Promise.resolve();
  };
  film.pause = () => {
    film.paused = true;
    page.log.push("pause");
  };
  return { ...page, film };
}

test("the pin over a film plays it, and pauses it the next time", () => {
  const page = filmPage();
  startCursorAssist(page.doc, page.win);
  page.click(720, 181); // 19 px above the film: the tip lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.film.paused, false, "playing");
  page.click(1415, 500); // 7 px right of it: the head's side
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.film.paused, true, "paused");
});

test("a click on a film's picture plays it when the browser did not, and is left to the browser when it did, or on the film's own buttons", () => {
  const page = filmPage();
  startCursorAssist(page.doc, page.win);
  page.click(720, 500); // a film not loaded yet: Chrome does nothing
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.film.paused, false, "the assist started it");
  assert.deepEqual(page.log.filter((l) => l === "play" || l === "pause"), ["play"]);
  page.log.length = 0;
  page.click(720, 500, { during: () => page.film.pause() }); // a loaded film: Chrome pauses it itself
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.film.paused, true, "left paused: no second toggle");
  assert.deepEqual(page.log.filter((l) => l === "play" || l === "pause"), ["pause"]);
  page.log.length = 0;
  page.click(60, 974 - FILM_BAR / 2); // on the film's own row of buttons
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.deepEqual(page.log.filter((l) => l === "play" || l === "pause"), [], "the browser's");
  page.click(720, 500, { detail: 1 });
  page.timers.advance(60);
  page.click(720, 500, { detail: 2 }); // a double-click (Chrome: full screen)
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.deepEqual(page.log.filter((l) => l === "play" || l === "pause"), [], "a double-click toggles nothing");
});

test("between a film and its chapter buttons, the chapter wins: the film counts by its picture, not its own row of buttons", () => {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const figure = page.make("figure", rect(0, 0, 1440, 900), { parent: site });
  const film = page.make("video", rect(32, 100, 800, 450), { parent: figure, controls: true, paused: true, ended: false, name: "film" });
  film.play = () => {
    film.paused = false;
    return Promise.resolve();
  };
  film.pause = () => (film.paused = true);
  const chapter = page.make("button", rect(32, 566, 140, 40), { parent: figure, name: "chapter", style: { cursor: "pointer" } });
  startCursorAssist(page.doc, page.win);
  page.click(100, 555); // 5 px under the film (its row of buttons), 11 px above the chapter
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(chapter.clicks, 1, "the chapter");
  assert.equal(film.paused, true, "the film did not start");
  page.click(839, 530); // 7 px right of the film, level with its row of buttons
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(film.paused, true, "nothing: the row is the browser's");
  page.click(839, 400); // 7 px right of its picture
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(film.paused, false, "the picture plays it");
});

// A drawing: the Ukraine demo's map, two regions that are SVG shapes inside
// boxes that overlap, showing the pointer because a stylesheet says so. (A
// browser never answers for an SVG group, only for what it paints.)
function mapPage() {
  const page = pretendPage();
  const site = page.make("div", rect(0, 0, 1440, 3000), { classes: ["site"] });
  const svg = page.make("svg", rect(100, 100, 600, 400), { parent: site });
  const g1 = page.make("g", rect(100, 100, 300, 400), { parent: svg, hitBox: null });
  // The west region: the lower-left half of its box.
  const west = page.make("path", rect(100, 100, 300, 400), { parent: g1, name: "west", styled: true, style: { cursor: "pointer" }, shape: (x, y) => x - 100 < (y - 100) * 0.75 });
  const g2 = page.make("g", rect(300, 100, 400, 400), { parent: svg, hitBox: null });
  // The east region: its box reaches back over the west one, its shape starts at 400.
  const east = page.make("path", rect(300, 100, 400, 400), { parent: g2, name: "east", styled: true, style: { cursor: "pointer" }, shape: (x) => x > 400 });
  return { ...page, svg, west, east, g1, g2 };
}

test("the pin over a region of the demo's map clicks that region where the pin lay, its shape, not its box, deciding", () => {
  const page = mapPage();
  page.doc.styleSheets = [{ cssRules: [{ selectorText: ".demo-unit path", style: { getPropertyValue: () => "pointer" } }] }];
  startCursorAssist(page.doc, page.win);
  // Just below the map: the pin's head lies on the map's foot, where the
  // west region is drawn and the east region's box (not its shape) reaches.
  page.click(350, 506);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.west.events.length, 1, "the west region got the click");
  assert.equal(page.east.events.length, 0);
  const [event] = page.west.events;
  assert.equal(event.type, "click");
  assert.equal(event.bubbles, true, "it rises to the region's group, whose handler picks it");
  assert.ok(event.clientY < 500 && event.clientY >= 506 - 13, `at the point where the pin lay on it (${event.clientY})`);
  assert.equal(page.g1.heard, 1);
  // The hover look goes on the region too.
  page.move(350, 506);
  assert.equal(page.west.getAttribute("data-near"), "");
});

test("at a click, anything under the pin that shows the pointer is found even when no stylesheet says so", () => {
  const page = mapPage();
  page.west.styled = false; // a cursor the note cannot know (say, from a sheet another site serves)
  page.east.styled = false;
  startCursorAssist(page.doc, page.win);
  page.click(350, 506);
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.west.events.length, 1);
});

test("the website starts the assist; nothing on the page has to know about it", () => {
  const shell = readFileSync(join(here, "SiteShell.jsx"), "utf8");
  assert.match(shell, /useEffect\(\(\) => startCursorAssist\(\), \[\]\)/);
  const source = readFileSync(join(here, "cursorAssist.js"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /globe|earth|demo-unit|wk-chapter|film-chapter/i, "no page's names in the code");
});

test("a helped click is worked out where the press was, so it goes where the hover look said it would", () => {
  // On a Retina screen the pointer moves in half pixels: the hover look is
  // worked out at the pointer's own (fractional) position and stays on
  // through a plain press, while the click event's position is rounded. A
  // click worked out at the rounded position could reach the neighbouring
  // control (seen at /demo between the two doors, and on /contact's fields).
  const source = readFileSync(new URL("./cursorAssist.js", import.meta.url), "utf8");
  assert.match(source, /const click = \{ x: press\.x, y: press\.y \};/);
  assert.doesNotMatch(source, /const click = \{ x: event\.clientX, y: event\.clientY \};/);
});
