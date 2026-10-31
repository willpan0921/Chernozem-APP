// WHAT THIS FILE DOES
// Checks the pin cursor's click assist (cursorAssist.js) without a
// browser: how far the pin reaches around its click point, which link or
// button it picks from pretend rectangles (the one it covers most; when
// another is covered at least half as much, the nearer), the short wait
// that lets a double-click call
// a click off, and, on a small pretend page, the whole thing wired up: a
// click beside a button clicks it once, a double-click clicks nothing, a
// click on the globe's bare Earth still reaches a toggle but never a
// marker, and moving the mouse costs no hit tests until something is
// within reach. Also checks that the stylesheet's hotspot matches the pin's.
//
// WHO EDITS IT
// Whoever changes the cursor.
// Run: node --test src/site/cursorAssist.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLICKABLE, DOUBLE_CLICK_MS, EDGE, HANDS_OFF, NEVER_PICKED, PIN, TIE, createClickGate, pickTarget, rankTargets, reachRows, startCursorAssist } from "./cursorAssist.js";

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
  // The About page's toggles: a click 3 px under one toggle, 7 px above the
  // link below it. The tip covers more of the link, the click point is
  // nearer the toggle: the toggle wins.
  const soil = one("Black soil", rect(32, 530, 109, 40));
  const minor = one("Show minor alerts", rect(32, 580, 127, 36));
  assert.equal(pickTarget(86, 573, [minor, soil]), "Black soil");
  assert.equal(pickTarget(86, 577, [minor, soil]), "Show minor alerts"); // now nearer the link
});

test("a link that wraps onto two lines counts with both of its pieces", () => {
  const wrapped = { target: "paper", rects: [rect(300, 180, 200, 18), rect(40, 206, 50, 18)] };
  assert.equal(pickTarget(100, 200, [wrapped]), "paper"); // its second line ends 10 px to the left
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

test("what counts as clickable; markers are never picked; the globe's canvas and the round choices are not fields", () => {
  for (const selector of ["a[href]", "button", '[role="button"]', "label", "summary", 'input[type="checkbox"]', 'input[type="radio"]']) {
    assert.ok(CLICKABLE.includes(selector), `${selector} is clickable`);
  }
  assert.ok(!/textarea|select|input\[type="text"\]|globe-marker/.test(CLICKABLE));
  assert.match(NEVER_PICKED, /\.globe-marker/);
  assert.match(NEVER_PICKED, /data-assist="off"/);
  assert.doesNotMatch(HANDS_OFF, /canvas/, "a click on the bare Earth may still be helped");
  assert.match(HANDS_OFF, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  for (const field of ["textarea", "select", "video", "iframe", "contenteditable"]) assert.ok(HANDS_OFF.includes(field), `${field} is left alone`);
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

// ---- A pretend page: just enough of a document and a window for the assist ----
// Each element has a rectangle and a few kinds that stand for the selectors
// the assist asks about. Later elements lie on top of earlier ones.
function pretendPage() {
  const timers = clock();
  const elements = [];
  const kindsFor = new Map([
    [".site", "site"],
    [CLICKABLE, "clickable"],
    [HANDS_OFF, "field"],
    [NEVER_PICKED, "marker"],
    [".globe-stage", "stage"],
  ]);
  const make = (name, box, kinds = [], parent = null) => {
    const el = {
      name,
      box,
      kinds: new Set(kinds),
      parent,
      nodeType: 1,
      isConnected: true,
      disabled: false,
      clicks: 0,
      attrs: new Map(),
      getAttribute: (k) => (el.attrs.has(k) ? el.attrs.get(k) : null),
      setAttribute: (k, v) => el.attrs.set(k, v),
      removeAttribute: (k) => el.attrs.delete(k),
      getClientRects: () => (box ? [{ ...box, width: box.right - box.left, height: box.bottom - box.top }] : []),
      closest(selector) {
        const kind = kindsFor.get(selector);
        assert.ok(kind, `the pretend page knows the selector ${selector}`);
        for (let n = el; n; n = n.parent) if (n.kinds.has(kind)) return n;
        return null;
      },
      click: () => (el.clicks += 1),
    };
    elements.push(el);
    return el;
  };
  const counts = { hits: 0, queries: 0 };
  const listeners = { doc: [], win: [] };
  const add = (list) => (type, fn) => list.push({ type, fn });
  const remove = (list) => (type, fn) => {
    const i = list.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  };
  const frames = [];
  const doc = {
    documentElement: { clientWidth: 1440, clientHeight: 900 },
    body: null,
    elementFromPoint(x, y) {
      counts.hits += 1;
      for (let i = elements.length - 1; i >= 0; i--) {
        const b = elements[i].box;
        if (b && x >= b.left && x < b.right && y >= b.top && y < b.bottom) return elements[i];
      }
      return null;
    },
    querySelectorAll(selector) {
      counts.queries += 1;
      assert.equal(selector, CLICKABLE);
      return elements.filter((e) => e.kinds.has("clickable"));
    },
    addEventListener: add(listeners.doc),
    removeEventListener: remove(listeners.doc),
  };
  const win = {
    scrollX: 0,
    scrollY: 0,
    performance: { now: timers.now },
    setTimeout: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimeout: (n) => timers.clearTimeout(n),
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ visibility: "visible", pointerEvents: "auto" }),
    getSelection: () => ({ isCollapsed: true, toString: () => "" }),
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
    fire("pointermove", { ...mouse, clientX: x, clientY: y, target: doc.elementFromPoint(x, y) });
    flush();
  };
  // A style change on the page finishes (a hover colour, an entrance).
  const settle = (target) => {
    fire("transitionend", { target });
    flush();
  };
  // A press, a release and the click, as the browser sends them.
  const click = (x, y, detail = 1) => {
    const target = doc.elementFromPoint(x, y);
    fire("pointerdown", { ...mouse, clientX: x, clientY: y, target });
    fire("pointerup", { ...mouse, clientX: x, clientY: y, target });
    fire("click", { ...mouse, isTrusted: true, detail, clientX: x, clientY: y, target, defaultPrevented: false });
    timers.advance(0);
  };
  return { make, doc, win, timers, counts, move, click, settle, listeners };
}

function aboutHero() {
  const page = pretendPage();
  const site = page.make("site", { left: 0, top: 0, right: 1440, bottom: 5000 }, ["site"]);
  const stage = page.make("stage", { left: 0, top: 72, right: 1440, bottom: 900 }, ["stage"], site);
  const canvas = page.make("canvas", { left: 0, top: 72, right: 1440, bottom: 900 }, [], stage);
  const marker = page.make("marker", { left: 700, top: 500, right: 728, bottom: 528 }, ["clickable", "marker"], stage);
  const lead = page.make("lead", { left: 32, top: 300, right: 540, bottom: 380 }, [], site);
  const register = page.make("register", { left: 32, top: 412, right: 230, bottom: 460 }, ["clickable"], site);
  const soil = page.make("soil", { left: 32, top: 492, right: 140, bottom: 532 }, ["clickable"], site);
  return { ...page, site, canvas, marker, lead, register, soil };
}

test("a click beside a button clicks it once, a moment later", () => {
  const page = aboutHero();
  const stop = startCursorAssist(page.doc, page.win);
  page.click(236, 436); // 6 px right of Register, on the lead's ground (the canvas here)
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
  page.click(236, 436, 1);
  page.timers.advance(80);
  page.click(236, 436, 2);
  page.timers.advance(2000);
  assert.equal(page.register.clicks, 0);
});

test("a click on the globe's bare Earth still reaches a toggle, never a marker", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.click(86, 478); // 14 px above Black soil: the pin's tip lies on it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.soil.clicks, 1, "the toggle under the tip");
  page.click(714, 490); // 10 px above a marker
  page.click(736, 514); // 8 px beside it
  page.timers.advance(DOUBLE_CLICK_MS);
  assert.equal(page.marker.clicks, 0, "the globe keeps its markers to itself");
});

test("moving the mouse costs no hit test until a link or button is within reach", () => {
  const page = aboutHero();
  startCursorAssist(page.doc, page.win);
  page.move(400, 330); // over the lead, nothing within reach
  const afterFirst = { ...page.counts };
  for (let i = 1; i <= 20; i++) page.move(400 + i * 7, 330 + (i % 3)); // along the lead
  // The pretend move() itself asks what is under the pointer once a move (as
  // a browser would); the assist adds nothing to that.
  assert.equal(page.counts.hits - afterFirst.hits, 20, "no hit tests of its own");
  assert.equal(page.counts.queries, 1, "the links' places were noted once");
  const before = page.counts.hits;
  page.move(120, 395); // 17 px above Register: within reach of the pin's tip
  assert.equal(page.register.getAttribute("data-near"), "", "the hover look shows on Register");
  assert.equal(page.counts.hits - before, 2, "one hit test to check Register is really on top");
  page.move(121, 396); // under 3 px: nothing to work out again
  assert.equal(page.counts.hits - before, 3, "no hit test of its own");
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
