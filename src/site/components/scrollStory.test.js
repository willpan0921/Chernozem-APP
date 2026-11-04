// WHAT THIS FILE DOES
// Checks the About page's held, sideways stories (ScrollStory.jsx and its
// arithmetic, scrollStoryMath.js) without a browser:
//   - the row follows the scroll: whole steps on plateaus in the middle of
//     each step's share (the first from the start of the hold, through the
//     lead-in; the last to its end, through the lead-out), eased glides
//     between them, never a jump, never backwards, the current step always
//     the one the row is nearest;
//   - each step's bar fills as the page goes through its share;
//   - the page rests on a plateau at every step's resting place;
//   - a scroll that is over leaves a whole step on the screen, the way the
//     visitor went: a nudge goes on, a longer scroll settles on the nearer
//     step leaning the visitor's way, and from a resting place one, two or
//     three wheel notches, an ordinary trackpad swipe, a thumb's drag or
//     flick move exactly one step, on any window; two arrow keys add up to
//     a step; the swipe that brings a story onto the screen rests on its
//     first step (going up, its last);
//   - a scroll made while the page glides never sends it back the way it
//     came from (the review of 3 November 2026: three arrow presses ended
//     on the step they started from), and the same way, once the row was
//     past half-way, it moves one step more;
//   - the share per step and the lead-in in scrollstory.css are the ones
//     the arithmetic uses, and a link to a story lands on its first step's
//     resting place;
//   - the page's own glide: its pace, its gentle start, never past its end;
//     the drawn row's spring: never past the scroll, never far behind it;
//   - the component draws the row from one followed value without drawing
//     the page again per frame; the progress row (every step, the current
//     one marked, each a button that glides there and gives the focus back
//     after a click; on a narrow screen bars at 3:1 against the ground and
//     "2 of 5"); the hint under it, on whichever step the visitor arrives,
//     until they move; the settling and the glides, which listen passively
//     and capture nothing, stop at the visitor's first touch, work without
//     the scrollend event, are held back only by the main button (a menu
//     that keeps a press's release never stops them for good), and leave
//     an arrow key to the browser;
//   - the link into the demo is a target a finger can hit; a phone on its
//     side shows a whole step in the plain list.
// The page keys, the place kept through a resize and the plain list are
// checked in src/site/site.test.js.
//
// WHO EDITS IT
// Whoever changes the About page's stories.
// Run: node --test src/site/components/scrollStory.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIAS, COMMIT, FOLLOW, GLIDE, HOLD, LEAD, MOVE, NUDGE, WHOLE, fillAt, followStep, glideAt, glideEase, glideMs, holdFor, listStepAt, listTarget, rowAt, settleTarget, shareMiddle, spanOf, stepAt, stepsAt } from "./scrollStoryMath.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

// A story of `count` steps on a window `screen` px tall, as scrollstory.css lays it out.
function story(screen, count = 5, top = 1000) {
  return { top, height: screen + spanOf(count) * holdFor(screen), screen, count };
}
const story900 = () => story(900);
const progressAt = (s, scrollY) => (scrollY - s.top) / (s.height - s.screen);
const rowOf = (s, scrollY) => rowAt(progressAt(s, scrollY), s.count);
const isWhole = (row) => Math.abs(row - Math.round(row)) <= WHOLE;
const settled = (s, from, scrollY, heading = null) => settleTarget({ ...s, scrollY, from, heading }) ?? scrollY;
const SCREENS = [540, 720, 768, 844, 900, 1024, 1080, 1440];

test("the row follows the scroll: plateaus at whole steps, eased glides between them, never a jump", () => {
  for (const count of [4, 5, 6]) {
    const span = spanOf(count);
    let before = 0;
    let steepest = 0;
    const N = 24000;
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      const row = rowAt(p, count);
      assert.ok(row >= before - 1e-12, `never backwards (${count} steps, at ${p})`);
      steepest = Math.max(steepest, ((row - before) * N) / span);
      before = row;
      // The step marked current is the one the row is nearest (away from the exact half-way points).
      if (Math.abs(row - Math.floor(row) - 0.5) > 1e-6) assert.equal(stepAt(p, count), Math.round(row), `current step at ${p}`);
    }
    // At most 1.5 / MOVE steps per share (the eased glide's steepest point): no jump anywhere.
    assert.ok(steepest <= 1.5 / MOVE + 1e-6, `${count} steps: steepest ${steepest.toFixed(3)} steps per share`);
    assert.equal(rowAt(0, count), 0);
    assert.equal(rowAt(1, count), count - 1);
    // Each step rests whole on its plateau, the middle (1 - MOVE) of its share; the first from the start
    // of the hold (the lead-in, LEAD of a share, and the start of its own share), the last to its end.
    for (let k = 0; k < count; k++) {
      const from = k === 0 ? -LEAD : k + MOVE / 2;
      const to = k === count - 1 ? count + LEAD : k + 1 - MOVE / 2;
      for (let u = from; u <= to + 1e-9; u += 0.01) assert.ok(Math.abs(rowAt((u + LEAD) / span, count) - k) < 1e-9, `step ${k + 1} whole at ${u.toFixed(2)} shares`);
    }
    // Half-way between two steps exactly at the boundary of their shares.
    for (let b = 1; b < count; b++) assert.ok(Math.abs(rowAt((b + LEAD) / span, count) - (b - 0.5)) < 1e-9);
  }
  // stepsAt: where the shares start and end.
  assert.equal(stepsAt(0, 5), -LEAD);
  assert.equal(stepsAt(1, 5), 5 + LEAD);
  assert.equal(stepsAt(LEAD / spanOf(5), 5), 0);
  // Eased: the glide starts and ends gently (no jolt where it meets a plateau).
  const at = (u) => rowAt((u + LEAD) / spanOf(5), 5);
  const slopeAt = (u) => (at(u + 1e-4) - at(u)) / 1e-4;
  assert.ok(slopeAt(1 - MOVE / 2) < 0.01 && slopeAt(1 + MOVE / 2 - 1e-4) < 0.01, "gentle at both ends");
  assert.ok(slopeAt(1) > 2, "and quickest in the middle");
  // Out of range and odd input.
  assert.equal(rowAt(-0.4, 5), 0);
  assert.equal(rowAt(1.7, 5), 4);
  assert.equal(rowAt(Number.NaN, 5), 0);
  assert.equal(rowAt(0.5, 1), 0, "one step: nothing to move");
});

test("each step's bar fills as the page goes through its share: empty in the lead-in, full in the lead-out", () => {
  const span = spanOf(5);
  const p = (u) => (u + LEAD) / span; // a point given in shares
  assert.deepEqual([-LEAD, -0.2, 0, 0.5, 1, 3].map((u) => fillAt(p(u), 5, 0)), [0, 0, 0, 0.5, 1, 1]);
  assert.deepEqual([0, 1, 1.5, 2, 5 + LEAD].map((u) => Math.round(fillAt(p(u), 5, 1) * 1e9) / 1e9), [0, 0, 0.5, 1, 1]);
  assert.equal(fillAt(1, 5, 4), 1);
  // Through the steps' shares, between two points at least one bar moves, plateau or not.
  for (let i = 0; i < 1000; i++) {
    const a = p((5 * i) / 1000);
    const b = p((5 * (i + 1)) / 1000);
    const moved = [0, 1, 2, 3, 4].some((k) => fillAt(b, 5, k) !== fillAt(a, 5, k));
    assert.ok(moved, `something moves between ${a} and ${b}`);
  }
});

test("every step's resting place is on its plateau, half-way through its bar", () => {
  for (const screen of SCREENS) {
    for (const count of [4, 5, 6]) {
      const s = story(screen, count);
      for (let step = 0; step < count; step++) {
        const p = progressAt(s, shareMiddle({ ...s, step }));
        assert.equal(rowAt(p, count), step, `${screen} px, ${count} steps: step ${step + 1} rests whole`);
        assert.equal(stepAt(p, count), step);
        assert.ok(Math.abs(fillAt(p, count, step) - 0.5) < 0.01);
      }
    }
  }
});

test("a scroll that is over leaves a whole step, the way the visitor went", () => {
  const s = story(900); // 450 px a share, a hold of 6 shares (2,700 px)
  const share = holdFor(900);
  const rest = (step) => shareMiddle({ ...s, step });
  // Outside the hold: nothing to do.
  assert.equal(settleTarget({ ...s, scrollY: s.top - 50, from: s.top - 400 }), null, "above the hold");
  assert.equal(settleTarget({ ...s, scrollY: s.top + s.height, from: s.top }), null, "past it");
  assert.equal(settleTarget({ ...s, height: 900, scrollY: 1200, from: 1000 }), null, "no hold");
  // Resting already: nothing (so a glide never starts another).
  for (let step = 0; step < 5; step++) assert.equal(settleTarget({ ...s, scrollY: rest(step), from: rest(step) - 400 }), null);
  // One arrow key's 40 px keeps the step whole and near its place: left alone, so the next press adds to it.
  assert.equal(COMMIT * share > 40 && COMMIT * share < 80, true, "one arrow key's 40 px stays, two go on");
  assert.equal(settleTarget({ ...s, scrollY: rest(2) + 40, from: rest(2) }), null);
  assert.equal(settleTarget({ ...s, scrollY: rest(2) - 40, from: rest(2) }), null);
  assert.equal(settleTarget({ ...s, scrollY: rest(2) + 80, from: rest(2) + 40 }), rest(3), "the second arrow key goes on");
  assert.equal(settleTarget({ ...s, scrollY: rest(2) - 80, from: rest(2) - 40 }), rest(1), "and back");
  // A nudge goes on to the next resting place the way the visitor went.
  assert.equal(settleTarget({ ...s, scrollY: rest(2) + 100, from: rest(2) }), rest(3), "one wheel notch down");
  assert.equal(settleTarget({ ...s, scrollY: rest(2) - 100, from: rest(2) }), rest(1), "one wheel notch up");
  // A longer scroll settles on the nearer step, leaning the visitor's way by BIAS of a step.
  const at = (row) => {
    // the point past rest(1) where the row reaches `row` (between 1 and 2), found by halving
    let lo = rest(1);
    let hi = rest(2);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (rowOf(s, mid) < row) lo = mid;
      else hi = mid;
    }
    return hi;
  };
  assert.equal(settleTarget({ ...s, scrollY: at(1 + BIAS - 0.02), from: rest(0) }), rest(1), "just under BIAS past step 2: back to it");
  assert.equal(settleTarget({ ...s, scrollY: at(1 + BIAS + 0.02), from: rest(0) }), rest(2), "BIAS past step 2: on to step 3");
  assert.equal(settleTarget({ ...s, scrollY: at(2 - BIAS + 0.02), from: rest(3) }), rest(2), "going up, the same the other way");
  assert.equal(settleTarget({ ...s, scrollY: at(2 - BIAS - 0.02), from: rest(3) }), rest(1));
  assert.equal(settleTarget({ ...s, scrollY: rest(1) + 0.1 * share, from: rest(0) }), rest(1), "on step 2's plateau, off its middle: to its middle");
  // In the lead-in or the lead-out, never back against the visitor's way (a visitor leaving the story is let go).
  const leadIn = s.top + 0.2 * share;
  const leadOut = s.top + s.height - s.screen - 0.2 * share;
  assert.equal(settleTarget({ ...s, scrollY: leadIn, from: s.top - 600 }), rest(0), "coming in from above: on to the first step's place");
  assert.equal(settleTarget({ ...s, scrollY: leadIn, from: rest(1) }), null, "leaving upwards: let go");
  assert.equal(settleTarget({ ...s, scrollY: leadOut, from: s.top + s.height }), rest(4), "coming in from below: on to the last step's place");
  assert.equal(settleTarget({ ...s, scrollY: leadOut, from: rest(3) }), null, "leaving downwards: let go");
  // Whatever the scroll, the page then rests on a whole step, and a nudge never moves it against the
  // visitor's way.
  for (let from = s.top - 300; from < s.top + s.height; from += 53) {
    for (let scrollY = s.top + 1; scrollY < s.top + s.height - s.screen; scrollY += 7) {
      const target = settleTarget({ ...s, scrollY, from });
      const row = rowOf(s, target ?? scrollY);
      assert.ok(isWhole(row), `from ${from} to ${scrollY}: ends on a whole step (row ${row.toFixed(4)})`);
      if (target !== null && Math.abs(scrollY - from) < NUDGE * share && Math.abs(scrollY - from) >= 1) {
        assert.ok(Math.sign(target - scrollY) === Math.sign(scrollY - from), `from ${from} to ${scrollY}: a nudge goes on the visitor's way`);
      }
    }
  }
});

test("from a resting place, one, two or three wheel notches, an ordinary swipe, a drag or a flick move exactly one step", () => {
  for (const screen of SCREENS) {
    const s = story(screen);
    const share = holdFor(screen);
    for (const step of [0, 1, 2, 3, 4]) {
      for (const sign of [1, -1]) {
        const target = step + sign;
        if (target < 0 || target > 4) continue;
        const start = shareMiddle({ ...s, step });
        // From a notch to a long swipe: COMMIT of a share (68 px on a 900 px window) to 1.35 shares.
        for (let d = Math.ceil(COMMIT * share); d < 1.35 * share; d += 3) {
          const row = rowOf(s, settled(s, start, start + sign * d));
          assert.ok(isWhole(row) && Math.round(row) === target, `${screen} px: ${sign * d} px from step ${step + 1} rests on step ${target + 1} (row ${row.toFixed(3)})`);
        }
      }
    }
  }
  // The scrolls the review of 3 November 2026 measured (on a 900 px window): one, two or three wheel notches
  // (100 px each), gentle, light and ordinary trackpad swipes (227, 327 and 592 px with their glide), a
  // thumb's drag (260) and a flick (450) are one step each; a firm swipe (1,015 px) two.
  const s = story(900);
  const start = shareMiddle({ ...s, step: 1 });
  for (const d of [100, 200, 300, 227, 327, 592, 260, 450]) {
    assert.equal(rowOf(s, settled(s, start, start + d)), 2, `${d} px down: one step`);
    assert.equal(rowOf(s, settled(s, start + 900, start + 900 - d)), 2, `${d} px up from step 4: one step`);
  }
  assert.equal(rowOf(s, settled(s, start, start + 1015)), 3, "a firm swipe: two steps");
  // A settle never undoes more than BIAS of a step of the visitor's scroll.
  for (let d = 1; d < 1200; d += 1) {
    const end = start + d;
    const after = rowOf(s, settled(s, start, end));
    assert.ok(rowOf(s, end) - after <= BIAS + 1e-9, `${d} px: settles back ${(rowOf(s, end) - after).toFixed(3)} of a step`);
  }
  // The share: 440 to 460 px, half the window.
  assert.deepEqual([540, 720, 768, 844, 900, 1024, 1440].map((h) => Math.round(holdFor(h))), [440, 440, 440, 440, 450, 460, 460]);
  assert.deepEqual([NUDGE, COMMIT, BIAS, MOVE, LEAD], [0.5, 0.15, 0.3, 0.6, 0.5]);
});

test("the swipe that brings a story onto the screen rests on its first step, or going back up, on its last", () => {
  for (const screen of SCREENS) {
    const s = story(screen);
    const end = s.top + s.height - s.screen;
    // Swipes of 227 to 600 px that end in the hold, wherever they began above it (or below it).
    for (let before = 0; before <= 900; before += 50) {
      for (const d of [227, 327, 450, 520, 600]) {
        if (d <= before) continue;
        const down = rowOf(s, settled(s, s.top - before, s.top - before + d));
        assert.equal(down, 0, `${screen} px: ${d} px from ${before} px above the story rests on step 1 (row ${down})`);
        const up = rowOf(s, settled(s, end + before, end + before - d));
        assert.equal(up, 4, `${screen} px: ${d} px up from ${before} px below it rests on step 5 (row ${up})`);
      }
    }
  }
});

test("a scroll made while the page glides never sends it back where it came from, and the same way past half-way moves one step more", () => {
  const s = story(900);
  const rest = (step) => shareMiddle({ ...s, step });
  // The page glides from step 2 (rest(1)) to step 3 (rest(2)) and the visitor scrolls on the way.
  for (let part = 0.05; part < 1; part += 0.05) {
    const stop = Math.round(rest(1) + part * (rest(2) - rest(1))); // where the visitor's input stopped the glide
    const pastHalf = Math.abs(2 - rowOf(s, stop)) < 0.5;
    for (const d of [8, 32, 40, 80, 100, 200, 300]) {
      // The same way: never back to step 2.
      const row = rowOf(s, settled(s, stop, stop + d, rest(2)));
      assert.ok(isWhole(row) && Math.round(row) >= 2, `stopped ${Math.round(part * 100)}% of the way, ${d} px on: rests on step ${Math.round(row) + 1} (row ${row.toFixed(3)})`);
      // Past half-way, a notch or more moves one step more (it counts from step 3); short of it, step 3
      // (even a trackpad's last flicker of a few px never undoes it).
      if (d >= 100) assert.equal(Math.round(row), pastHalf ? 3 : 2, `stopped ${Math.round(part * 100)}% of the way, ${d} px on`);
      if (d <= 40) assert.equal(Math.round(row), 2, `stopped ${Math.round(part * 100)}% of the way, ${d} px on: on to step 3`);
      // The other way: back, never on to step 3; after a notch or two, back to step 2 or one step before
      // the step on the screen (the row's nearest), never further.
      const back = rowOf(s, settled(s, stop, stop - d, rest(2)));
      assert.ok(isWhole(back) && Math.round(back) <= 2, `stopped ${Math.round(part * 100)}% of the way, ${d} px back: rests on step ${Math.round(back) + 1}`);
      if (d >= 100 && d <= 200) {
        assert.ok(Math.round(back) <= 1 && Math.round(back) >= Math.round(rowOf(s, stop)) - 1, `stopped ${Math.round(part * 100)}% of the way, ${d} px back: step ${Math.round(back) + 1}`);
      }
    }
    // A touch that did not scroll: the glide goes on.
    assert.equal(settleTarget({ ...s, scrollY: stop, from: stop, heading: rest(2) }), Math.abs(rest(2) - stop) < 1 ? null : rest(2));
  }
  // The review's case: an arrow key stopped the glide part of the way and scrolled 32 px further.
  const stop = Math.round(rest(1) + 0.4 * (rest(2) - rest(1)));
  assert.equal(settleTarget({ ...s, scrollY: stop + 32, from: stop, heading: rest(2) }), rest(2), "on to the next step, never back");
});

test("scrollstory.css holds each step for the share the arithmetic uses, lands a link on the first step, and moves nothing by itself", () => {
  const css = read("scrollstory.css");
  assert.ok(css.includes(`--story-hold: clamp(${HOLD.min}px, ${HOLD.screens * 100}svh, ${HOLD.max}px);`), "the same share in CSS and in scrollStoryMath.js");
  assert.ok(css.includes(`--story-lead: ${LEAD};`), "the same lead-in and lead-out");
  const held = css.match(/\.site \.story\.is-held \{[^}]*\}/)[0];
  assert.match(held, /height: calc\(100svh \+ \(var\(--story-steps\) \+ 2 \* var\(--story-lead\)\) \* var\(--story-hold\)\);/);
  // A link to #field-story lands on the first step's resting place (shareMiddle: the lead-in and half a
  // share down), not 24 px short of the stage (site.css gives every [id] a scroll margin of 24 px).
  assert.match(held, /scroll-margin-top: calc\(-1 \* \(var\(--story-lead\) \+ 0\.5\) \* var\(--story-hold\)\);/);
  const s = story(900, 5, 2000);
  assert.equal(shareMiddle({ ...s, step: 0 }), 2000 + (LEAD + 0.5) * holdFor(900));
  const track = css.match(/\.site \.story\.is-held \.story-track \{[^}]*\}/)[0];
  assert.match(track, /will-change: transform/);
  assert.doesNotMatch(track, /transition|transform:/, "the row has no slide of its own: it follows the scroll");
  assert.doesNotMatch(css, /story-at|is-jump/, "no step-at-a-time slide left");
});

test("the page's own glide: a calm pace, a gentle start, never past its end", () => {
  const rowIn = (u) => rowAt((u + LEAD) / spanOf(5), 5);
  // The ease: 0 to 1, never back, no jump.
  for (const [rise, fall] of [[GLIDE.land, GLIDE.land], [GLIDE.ramp, GLIDE.land]]) {
    let before = 0;
    for (let i = 0; i <= 1000; i++) {
      const x = glideEase(i / 1000, rise, fall);
      assert.ok(x >= before - 1e-12 && x - before < 0.004, `the ease at ${i / 1000}`);
      before = x;
    }
    assert.equal(glideEase(0, rise, fall), 0);
    assert.ok(Math.abs(glideEase(1, rise, fall) - 1) < 1e-12);
  }
  for (const [from, to] of [[1.5, 2.5], [2.5, 1.5], [1.717, 2.5], [2.05, 2.5], [0.5, 4.5], [-0.3, 0.5], [4.5, 5.3]]) {
    assert.ok(Math.abs(glideAt({ from, to, count: 5, t: 0 }) - from) < 1e-9 && Math.abs(glideAt({ from, to, count: 5, t: 1 }) - to) < 1e-9, `${from} to ${to}: from start to end`);
    let before = from;
    for (let i = 1; i <= 200; i++) {
      const u = glideAt({ from, to, count: 5, t: i / 200 });
      assert.ok(Math.sign(to - from) * (u - before) >= -1e-9, `${from} to ${to}: never back`);
      assert.ok(Math.min(from, to) - 1e-9 <= u && u <= Math.max(from, to) + 1e-9, "never past its end");
      before = u;
    }
    const ms = glideMs({ from, to, count: 5 });
    assert.ok(ms >= GLIDE.min && ms <= GLIDE.max);
  }
  // A page key's step (one resting place to the next): the row slides for about a quarter to a third of
  // a second, and starts within about 100 ms (only the bar moves before it).
  const ms = glideMs({ from: 1.5, to: 2.5, count: 5 });
  let starts = null;
  let ends = null;
  for (let t = 0; t <= ms; t++) {
    const row = rowIn(glideAt({ from: 1.5, to: 2.5, count: 5, t: t / ms }));
    if (starts === null && row > 1.01) starts = t;
    if (row < 1.99) ends = t;
  }
  assert.ok(ms >= 340 && ms <= 480, `the whole glide ${ms} ms`);
  assert.ok(starts <= 110, `the row sets off after ${starts} ms`);
  assert.ok(ends - starts >= 200 && ends - starts <= 330, `the row slides for ${ends - starts} ms`);
  // Left between two steps, the row sets off gently: its first 20 ms move it less than a twentieth of a step.
  const mid = glideMs({ from: 2.0, to: 2.5, count: 5 });
  assert.ok(rowIn(glideAt({ from: 2.0, to: 2.5, count: 5, t: 20 / mid })) - rowIn(2.0) < 0.05);
});

test("the drawn row follows the scroll: never past it, never far behind it, and still when it is", () => {
  const maxLag = FOLLOW.lag / spanOf(5);
  const dt = 1 / 60;
  // A wheel notch (100 px of a 2,700 px hold) is followed in about 80 ms, never past it.
  let f = { x: 0, v: 0 };
  const notch = 100 / 2700;
  let at80 = null;
  for (let i = 1; i <= 30; i++) {
    f = followStep({ ...f, target: notch, dt, maxLag });
    assert.ok(f.x <= notch + 1e-12, "never past the scroll");
    if (i === 5) at80 = f.x;
  }
  assert.ok(at80 > 0.85 * notch, `after 83 ms, ${Math.round((100 * at80) / notch)}% of the way`);
  assert.ok(Math.abs(f.x - notch) < 1e-5 && Math.abs(f.v) < 1e-3, "and then still");
  // A fling at 10,000 px a second: never more than FOLLOW.lag of a share behind, never past it once it stops.
  f = { x: 0, v: 0 };
  let target = 0;
  for (let i = 1; i <= 90; i++) {
    if (i <= 20) target += (10000 * dt) / 2700;
    f = followStep({ ...f, target, dt, maxLag });
    assert.ok(target - f.x <= maxLag + 1e-12, `${i} frames: ${(((target - f.x) * 2700) | 0)} px behind`);
    assert.ok(f.x <= target + 1e-12, "never past the scroll");
  }
  // Critically damped.
  assert.equal(FOLLOW.omega, 55);
  assert.ok(FOLLOW.lag > 0 && FOLLOW.lag <= LEAD, "the lead-out still shows the last step whole as the stage leaves");
});

test("the component draws the row from one followed value, never drawing the page again per frame", () => {
  const story = read("ScrollStory.jsx");
  assert.match(story, /import \{ useMotionValueEvent, useScroll \} from "motion\/react";/);
  assert.match(story, /const \{ scrollYProgress \} = useScroll\(\{ target: ref, offset: \["start start", "end end"\] \}\);/);
  assert.match(story, /useMotionValueEvent\(scrollYProgress, "change", onProgress\);/);
  assert.match(story, /const next = followStep\(\{ x: f\.x, v: f\.v, target: f\.target, dt, maxLag: FOLLOW\.lag \/ spanOf\(count\) \}\);/);
  assert.match(story, /paint\(f\.x\);\s*f\.frame = still \? 0 : window\.requestAnimationFrame\(run\);/);
  // The row, the words' dimming and the bars are written straight onto the page; React draws again only
  // when the current step changes (and once to take the hint away).
  assert.match(story, /track\.style\.transform = `translate3d\(\$\{\(-100 \* row\)\.toFixed\(3\)\}%, 0, 0\)`;/);
  assert.match(story, /fill\.style\.transform = `scaleX\(/);
  assert.match(story, /if \(step !== atRef\.current\) \{\s*atRef\.current = step;\s*setAt\(step\);/);
  assert.deepEqual(story.match(/\buseState\(/g), ["useState(", "useState("], "the current step and whether the hint is there");
  assert.match(story, /const \[at, setAt\] = useState\(0\);/);
  assert.match(story, /const \[hinted, setHinted\] = useState\(\(\) => !learned\);/);
  // A change made off the screen, or right after the page was put in place, is drawn at once.
  assert.match(story, /if \(jumpNext\.current \|\| off\) \{\s*jumpNext\.current = false;\s*jump\(progress\);/);
  assert.match(story, /jumpNext\.current = true;\s*if \(place\.current !== null\) putBack\(el, count, place\.current\);/);
});

test("the progress row: every step, the current one marked, each a button that glides there and gives the focus back", () => {
  const story = read("ScrollStory.jsx");
  const css = read("scrollstory.css");
  assert.match(story, /\{held && \(\s*<nav className="story-where" aria-label=\{`\$\{title\}, step by step`\}>/);
  assert.match(story, /<button type="button" className="story-dot" aria-current=\{i === current \? "step" : undefined\} onClick=\{\(event\) => choose\(event, i\)\}>/);
  assert.match(story, /<span className="story-label">\{step\.title\}<\/span>/);
  assert.match(story, /<p className="story-count" aria-hidden="true">\s*\{current \+ 1\} of \{count\}\s*<\/p>/);
  // The steps themselves: an ordered list a screen reader calls a list, in Safari too (role="list": Safari
  // stops calling one a list once site.css styles its markers away).
  assert.match(story, /<ol className="story-track" role="list" ref=\{trackRef\}>/);
  // A click glides to the step's resting place; a pointer's click gives the focus back (a key's press has
  // no detail), so Space then moves the story along rather than pressing the same button again.
  assert.match(story, /const choose = \(event, step\) => \{\s*steer\.current\?\.\(step\);\s*if \(event\.detail > 0\) event\.currentTarget\.blur\(\);/);
  assert.match(story, /steer\.current = \(step\) => \{[\s\S]*?const top = shareMiddle\(\{ \.\.\.story, step \}\);\s*if \(top !== null\) glideTo\(top, step\);/);
  // Wide: the titles in a row, as many columns as steps; the bar stretched across its button.
  assert.match(css, /\.site \.story-progress \{[^}]*grid-template-columns: repeat\(var\(--story-steps\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.site \.story-dot \{[^}]*align-items: stretch;[^}]*min-height: 44px/);
  assert.match(css, /\.site \.story-dot\[aria-current\] \{\s*color: var\(--ink\);/);
  assert.match(css, /\.site \.story-dot\[data-near\] \{\s*color: var\(--ink\);/, "the pin nearby looks like the pointer on it");
  // Up to 900 px wide: a bar per step (32 px to tap), the titles kept for screen readers, and "2 of 5".
  const narrow = css.slice(css.indexOf("@media (max-width: 900px)"), css.indexOf("@media (min-width: 600px) and (max-width: 900px)"));
  assert.match(narrow, /\.site \.story-dot \{[^}]*min-height: 32px/);
  assert.match(narrow, /\.site \.story-label \{[^}]*position: absolute;[^}]*clip: rect\(0, 0, 0, 0\)/);
  assert.match(narrow, /\.site \.story-count \{\s*display: block;/);
  assert.match(narrow, /\.site \.story-where \{\s*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.site \.story-count \{\s*display: none;/, "wide screens show the titles instead");
  // There the bars are the buttons: 4 px tall, every track at 3:1 or more against the ground and the
  // surface tone (WCAG 1.4.11), worked out from the colours in site.css.
  assert.match(narrow, /\.site \.story-bar \{\s*height: 4px;/);
  const track = narrow.match(/\.site \.story-bar::before \{\s*background: var\(--(\w+)\);\s*opacity: ([\d.]+);/);
  assert.ok(track, "the narrow bars' track");
  const site = readFileSync(join(here, "..", "site.css"), "utf8");
  const colour = (name) => site.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6})`))[1].match(/../g).map((h) => parseInt(h, 16));
  const lum = (rgb) => rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const alpha = Number(track[2]);
  for (const ground of ["bg", "surface"]) {
    const g = colour(ground);
    const mixed = colour(track[1]).map((c, i) => Math.round(c * alpha + g[i] * (1 - alpha)));
    assert.ok(contrast(mixed, g) >= 3, `the bars on --${ground}: ${contrast(mixed, g).toFixed(2)}:1`);
  }
  // A phone's heading never wraps the row into a second column.
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.site \.story-head \{[^}]*flex-direction: column;[^}]*flex-wrap: nowrap;/);
  // Page Down and Page Up still help on a focused step button; only Space presses it.
  assert.match(story, /const OWN_SPACE = "button, \[role='button'\]";/);
  assert.doesNotMatch(story.match(/const OWN_KEYS = "[^"]*";/)[0], /\bbutton\b/);
});

test("the hint says scrolling moves the story along, on whichever step the visitor arrives, until they move", () => {
  const story = read("ScrollStory.jsx");
  const css = read("scrollstory.css");
  // In the progress row (not in a step), so it is there on whichever step the visitor lands.
  const where = story.slice(story.indexOf('<nav className="story-where"'), story.indexOf("</nav>"));
  assert.match(where, /\{hinted && \(\s*<p className="story-hint" aria-hidden="true" ref=\{hintRef\}>\s*Scroll to move along\s*<Along \/>/);
  assert.doesNotMatch(story.slice(story.indexOf('<ol className="story-track"')), /story-hint/, "no hint in the steps");
  // The step the visitor arrives on (a whole step, so at rest the hint is all there or gone); it fades as the
  // row moves from there and goes once the row has moved half a step (in either story).
  assert.match(story, /if \(landed\.current === null\) landed\.current = Math\.round\(row\);\s*if \(Math\.abs\(row - landed\.current\) >= 0\.5\) learn\(\);/);
  assert.match(story, /hintRef\.current\.style\.opacity = learned \? "0" : Math\.max\(0, 1 - 3 \* Math\.abs\(row - \(landed\.current \?\? row\)\)\)\.toFixed\(3\);/);
  assert.match(story, /learners\.add\(hide\);/);
  // Taken out of the page while the story is off the screen, where its line going away moves nothing seen.
  assert.match(story, /if \(box\.bottom <= 0 \|\| box\.top >= window\.innerHeight\) \{\s*hintedRef\.current = false;\s*setHinted\(false\);/);
  // Its own line under the row, at every width; a short wide window's picture makes room for it.
  assert.match(css, /\.site \.story-hint \{\s*grid-column: 1 \/ -1;/);
  assert.match(css, /@media \(min-width: 901px\) \{\s*\.site \.story\.is-held:has\(\.story-hint\) \.story-picture \{\s*height: min\(500px, calc\(100svh - 300px\)\);/);
});

test("the page settles and glides by itself only after the visitor's scroll, stops at their first touch, and captures nothing", () => {
  const story = read("ScrollStory.jsx");
  // Its own glide, frame by frame, written as the browser's instant scroll; it stops when something else moves the page.
  assert.match(story, /const next = t >= 1 \? g\.end : \(glideAt\(\{ from: g\.from, to: g\.to, count, t \}\) \+ LEAD\) \* g\.share;\s*window\.scrollTo\(\{ top: window\.scrollY \+ next - off, behavior: "instant" \}\);/);
  assert.match(story, /if \(Math\.abs\(off - g\.last\) > 2\) \{\s*interrupt\(\);/, "a scroll it did not make stops it");
  assert.doesNotMatch(story, /behavior: "smooth"/, "never the browser's smooth scroll, which a wheel cannot stop");
  // Any input stops it at once: a wheel, a key, a finger, a button.
  assert.match(story, /const input = \(\) => \{\s*touched = true;\s*interrupt\(\);/);
  assert.match(story, /const interrupt = \(\) => \{\s*if \(!glide\) return;\s*heading = glide\.end;\s*rest = glide\.last;\s*stop\(\);/);
  // The visitor's scroll is judged from where it began (or the glide it stopped: heading), the way it went;
  // a scroll made without their hand (a link, the page put back, the scrollbar) as having no way of its own.
  assert.match(story, /const from = touched \? story\.top \+ rest : window\.scrollY;\s*const target = settleTarget\(\{ \.\.\.story, scrollY: window\.scrollY, from, heading: touched && heading !== null \? story\.top \+ heading : null \}\);/);
  const s = story900();
  const rest = shareMiddle({ ...s, step: 2 });
  assert.equal(settleTarget({ ...s, scrollY: rest + 60, from: rest + 60 }), null, "left alone where a step is whole");
  assert.equal(settleTarget({ ...s, scrollY: rest + 260, from: rest + 260 }), shareMiddle({ ...s, step: 3 }), "settled on the nearer step where it left the row between two");
  assert.equal(settleTarget({ ...s, scrollY: rest + 160, from: rest + 160 }), rest, "(the nearer one either way)");
  assert.match(story, /if \(glide \|\| pressed \|\| fingers > 0 \|\| document\.documentElement\.hasAttribute\("data-menu"\)\) return;/, "never under a finger or a held button");
  // Held means the main button. The others (and a Ctrl+click) open a menu, which on a Mac keeps their release:
  // they never count as held, the menu's own event ends a press, and so does a wheel turned with no button down,
  // so a lost release never stops the story settling for good.
  assert.match(story, /const onPointerDown = \(event\) => \{\s*if \(event\.pointerType === "touch"\) return;[^\n]*\s*if \(event\.button !== 0\) return;\s*pressed = true;/);
  assert.match(story, /const onMenu = \(\) => \{\s*pressed = false;\s*later\(QUIET_MS\);/);
  assert.match(story, /const onWheel = \(event\) => \{\s*if \(event\.buttons === 0\) pressed = false;\s*input\(\);/);
  assert.deepEqual(story.match(/pressed = true/g), ["pressed = true"], "set in one place only");
  // Over means scrollend and QUIET_MS, or, without scrollend (Safari before 26.2), IDLE_MS with no scroll.
  assert.match(story, /const ends = "onscrollend" in window;/);
  assert.match(story, /if \(ends\) wait\(\);\s*else later\(IDLE_MS\);/);
  assert.match(story, /const onEnd = \(\) => \{\s*if \(!glide\) later\(QUIET_MS\);/);
  const quiet = Number(story.match(/const QUIET_MS = (\d+);/)[1]);
  const idle = Number(story.match(/const IDLE_MS = (\d+);/)[1]);
  assert.ok(quiet >= 80 && quiet <= 250 && idle > quiet && idle <= 300, "a short quiet");
  // Passive listeners for the wheel, a finger, a button and the scroll; none captured; nothing prevented
  // but the page keys the story takes over.
  assert.match(story, /const passive = \{ passive: true \};/);
  for (const [name, handler] of [["wheel", "onWheel"], ["touchstart", "onTouchStart"], ["touchend", "onTouchEnd"], ["touchcancel", "onTouchEnd"], ["pointerdown", "onPointerDown"], ["pointerup", "onPointerUp"], ["pointercancel", "onPointerUp"], ["contextmenu", "onMenu"], ["scroll", "onScroll"], ["scrollend", "onEnd"]]) {
    assert.ok(story.includes(`window.addEventListener("${name}", ${handler}, passive);`), `${name}: passive`);
    assert.ok(story.includes(`window.removeEventListener("${name}", ${handler}, passive);`), `${name}: let go`);
  }
  for (const m of story.matchAll(/addEventListener\("(wheel|touch\w*|pointer\w*|contextmenu)"[^)]*\)/g)) assert.match(m[0], /, passive\)$/, `${m[0]}: passive`);
  assert.doesNotMatch(story, /capture: true|passive: false/, "nothing captured");
  assert.equal(story.match(/preventDefault\(\)/g).length, 1, "one preventDefault");
  assert.match(story, /if \(top === null\) return false;\s*event\.preventDefault\(\);\s*glideTo\(top, from \+ \(down \? 1 : -1\)\);/, "the page keys' own, and nothing else's");
  // The page moves only by the visitor's own scroll, the story's glide and a place put back: an arrow key is
  // the browser's to apply (the story only counts it), never applied again by the story.
  assert.equal(story.match(/window\.scrollTo\(/g).length, 2, "the glide's frame and putBack");
  assert.doesNotMatch(story, /ArrowDown|ArrowUp|ARROW_PX/);
});

test("the link into the demo is a target a finger can hit, and a phone on its side shows a whole step", () => {
  const css = read("scrollstory.css");
  // 5 px all round, given back by the margin; the ring 3 px from the words.
  assert.match(css, /\.site \.story-link \{\s*padding: 5px;\s*margin: -5px;/);
  assert.match(css, /\.site \.story-link:focus-visible \{\s*outline-offset: -2px;/);
  // The plain list on a phone on its side: each step's words beside its picture again.
  assert.match(css, /@media \(min-width: 600px\) and \(max-width: 900px\) and \(max-height: 539px\) \{\s*\.site \.story-panel \{\s*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[\s\S]*?\.site \.story-words \{\s*grid-column: 1 \/ 6;[\s\S]*?\.site \.story-picture \{\s*grid-column: 6 \/ 13;/);
  // A step taller than the screen is put back with its words on the screen (its picture above them as far
  // as there is room).
  assert.equal(listTarget({ stepTop: 8000, stepHeight: 700, screen: 390, wordsTop: 8420, wordsBottom: 8650 }), 8650 + 16 - 390);
  assert.equal(listTarget({ stepTop: 8000, stepHeight: 700, screen: 390, wordsTop: 8010, wordsBottom: 8300 }), 8000, "words at its top: from its top");
  assert.equal(listTarget({ stepTop: 8000, stepHeight: 900, screen: 390, wordsTop: 8300, wordsBottom: 8900 }), 8300 - 16, "words taller than the screen: from their top");
  assert.equal(listStepAt([-400, 2, 600], 195), 1, "and the step is read back as the same one");
});
