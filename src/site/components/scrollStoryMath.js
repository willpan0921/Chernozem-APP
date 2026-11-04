// WHAT THIS FILE DOES
// The arithmetic of the About page's held, sideways stories
// (components/ScrollStory.jsx), kept here so it can be tested without a
// browser (components/scrollStory.test.js and src/site/site.test.js).
//
// The hold: while a story holds the screen, the page scrolls through a
// lead-in (LEAD of a share, in which the first step already rests whole),
// then `count` equal shares, one per step (each as long as HOLD says, set
// in scrollstory.css), then a lead-out (LEAD again, the last step still
// whole). progress runs from 0 (the stage has just reached the top of the
// screen) to 1 (the hold is over). Around each boundary between two shares
// the row of steps glides from one step to the next (the move, MOVE of a
// share, eased in and out); in the rest of each share the row stands still
// on its step (the step's plateau), so a step always has a stretch of the
// scroll in which it rests whole. The lead-in and the lead-out give the
// first and the last step a longer stretch: the swipe that brings a story
// onto the screen (going down, or going back up into it) ends on its first
// (or last) step instead of carrying the row on past it.
//
//   stepsAt(progress, count)
//       how far through the steps' shares a point of the hold is, in
//       shares: 0 where the first step's share starts, count where the last
//       one's ends (below 0 in the lead-in, above count in the lead-out).
//
//   rowAt(progress, count)
//       where the row of steps is, in steps: 0 shows the first step whole,
//       1.5 half of the second and half of the third. Whole numbers on the
//       plateaus, eased between them, never a jump.
//
//   stepAt(progress, count)
//       which step a point of the hold shows: the one whose share it is in
//       (the first in the lead-in, the last in the lead-out; the row passes
//       half-way between two steps exactly at the boundary of their shares,
//       so this is rowAt rounded).
//
//   fillAt(progress, count, step)
//       how far through its share the page is, 0 to 1, for the bar of that
//       step in the story's progress row (it fills while the visitor
//       scrolls, on the plateau as well; empty in the lead-in, full in the
//       lead-out).
//
//   holdFor(screen)
//       the length of one step's share in px for a window `screen` px
//       tall: the CSS in scrollstory.css (HOLD), worked out the same way.
//
// In the rest, top is the section's top on the page, height its height,
// screen the window's height and count the number of steps:
//
//   shareMiddle({ top, height, screen, count, step })
//       where the page rests to show a step (its resting place): the middle
//       of its share, always on the step's plateau (null when the section
//       has no hold). The page keys, a click in the progress row and the
//       settling below all bring the page here.
//
//   settleTarget({ top, height, screen, count, scrollY, from, heading })
//       where the page should glide when the visitor's scroll is over, so a
//       step comes to rest whole. scrollY is where the page stopped, from
//       where that scroll began. The visitor's own direction always decides:
//       - a nudge (under NUDGE of a share: a wheel notch or two, an arrow
//         key, a small touch) goes on to the next resting place the way the
//         visitor went, unless the step is still whole and the page within
//         COMMIT of a share of its resting place (one arrow key's 40 px:
//         then nothing, so two of them add up to a step);
//       - a longer scroll settles on the nearer step, leaning the visitor's
//         way: once the row is BIAS of a step past a whole one, on to the
//         next, so a settle never undoes more than that of the visitor's
//         scroll; in the lead-in or the lead-out never back against it (a
//         visitor leaving the story is let go).
//       heading is the resting place the page was gliding to when the
//       visitor's scroll began (null when it was still): a scroll the same
//       way, once the row was past half-way there, counts from that resting
//       place, so it moves one step further, as it would have a moment
//       later; short of half-way it counts from where it began, and never
//       ends short of where the glide was going (a trackpad's last flicker
//       does not undo the step the visitor asked for); a scroll the other
//       way counts from where it began; a touch that did not scroll lets
//       the glide go on. null when there is nothing to do, or the page is
//       not in the hold.
//
//   pageTarget({ top, height, screen, count, step, down })
//       where the page should glide when the visitor presses Page Down
//       (down: true) or Page Up (down: false), or Space, while a story holds
//       the screen, so that one key press moves exactly one step and never
//       skips one (a browser's Page Down moves about 0.9 of a screen, about
//       two steps' shares). step is the step on screen now (or the one the
//       page is already gliding to). It answers that step's neighbour's
//       resting place, or null past the first or the last step, where the
//       key scrolls the page as usual.
//
//   entryTarget({ top, height, screen, count, scrollY, down })
//       the same for the press that brings a story onto the screen: going
//       down while the section's top edge is on the screen, or going up
//       while its bottom edge is. The browser's own page step would carry
//       the page past the first step's share (or, going up, the last
//       one's), so that step would never come to rest; this answers its
//       resting place instead. scrollY is how far the page is scrolled now.
//       null when the story's edge is not on the screen (the key then does
//       what it always does).
//
//   nearlyHeld({ top, height, screen, scrollY, down })
//       a story almost holding the screen: a page key then goes on to the
//       next step rather than only settling the stage.
//
//   glideMs({ from, to, count }) and glideAt({ from, to, count, t })
//       the page's own glides (the settling, the page keys, a click in the
//       progress row), between two points given in shares (stepsAt): how
//       long one takes, and where it is at a part t (0 to 1) of that time.
//       The row's slide sets the pace (GLIDE.pace per share of it); a
//       stretch in which only a bar moves (a plateau, the lead-in) passes
//       at GLIDE.plateau of that time, so a press is answered at once. The
//       speed rises gently at the start (more gently still when the row was
//       left between two steps, so it never sets off with a jolt) and falls
//       gently at the end.
//
//   followStep({ x, v, target, dt, maxLag })
//       the drawn row following the scroll between the browser's scroll
//       events: one step of dt seconds of a critically damped spring
//       (FOLLOW.omega), which never overshoots, and never trails the scroll
//       by more than maxLag (the component passes FOLLOW.lag of a share), so
//       a fast fling still shows each step go by. x and target in progress
//       (0 to 1), v per second.
//
//   listStepAt(stepTops, line)
//       in the plain list (a phone on its side, reduced motion), which step
//       is at a line of the screen (its middle): the last one whose top is
//       at or above it, the first one when none is.
//
//   listTarget({ stepTop, stepHeight, screen, wordsTop, wordsBottom })
//       where the page rests to show one step of the plain list: the step
//       in the middle of the screen when it fits; when it is taller than
//       the screen, as much of its picture as leaves its words whole on the
//       screen (wordsTop and wordsBottom, LIST_MARGIN from either edge;
//       from the words' top when they alone are taller than the screen),
//       or its top when the words are not given.
//
// shareMiddle, listStepAt and listTarget keep the visitor's place when the
// window changes size or a phone is turned (ScrollStory.jsx).
//
// WHO EDITS IT
// Whoever works on the About page's stories.

// One step's share of the hold: half the window's height, never under
// 440 px or over 460 px (450 px on a 900 px window), so one ordinary
// trackpad swipe (about 230 to 600 px with its glide), one, two or three
// wheel notches (100 px each) or one flick of a thumb move exactly one step
// on any screen (a swipe is as long on a short screen as on a tall one).
// scrollstory.css sets the same: --story-hold: clamp(440px, 50svh, 460px).
export const HOLD = { min: 440, screens: 0.5, max: 460 };

export function holdFor(screen) {
  return Math.min(HOLD.max, Math.max(HOLD.min, HOLD.screens * screen));
}

// The lead-in before the first step's share and the lead-out after the
// last one's, as a part of one share (scrollstory.css: --story-lead).
export const LEAD = 0.5;

// The whole hold, in shares.
export function spanOf(count) {
  return count + 2 * LEAD;
}

// The move around each boundary, as a part of one share: 0.6, so a step's
// plateau is the middle 0.4 of its share (180 px on a 900 px window) and
// the glide takes the rest.
export const MOVE = 0.6;

// A scroll shorter than this part of a share is a nudge (settleTarget).
export const NUDGE = 0.5;

// A nudge that leaves the page this part of a share from its resting place
// or more goes on to the next step (68 px on a 900 px window: one wheel
// notch does, one arrow key's 40 px does not, two do).
export const COMMIT = 0.15;

// After a longer scroll, the row goes on to the next step once it is this
// far past a whole one the visitor's way (and settles back under it).
export const BIAS = 0.3;

// How far from whole a row may be and still count as resting whole
// (0.2% of a step: 3 px on a 1440 px window).
export const WHOLE = 0.002;

// Eased in and out (smoothstep): no jolt where a glide meets a plateau.
function ease(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function clampProgress(progress) {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

export function stepsAt(progress, count) {
  return clampProgress(progress) * spanOf(count) - LEAD;
}

// The row at a point given in shares (stepsAt).
function rowIn(u, count) {
  if (!(count > 1)) return 0;
  const v = Math.min(count, Math.max(0, u));
  const half = MOVE / 2;
  const boundary = Math.round(v); // the nearest boundary between two shares (1 to count - 1)
  if (boundary >= 1 && boundary <= count - 1 && Math.abs(v - boundary) < half) {
    return boundary - 1 + ease((v - (boundary - half)) / MOVE);
  }
  return Math.min(count - 1, Math.floor(v));
}

export function rowAt(progress, count) {
  return rowIn(stepsAt(progress, count), count);
}

export function stepAt(progress, count) {
  if (!(count > 0)) return 0;
  const p = Number.isFinite(progress) ? progress : 0;
  return Math.min(count - 1, Math.max(0, Math.floor(p * spanOf(count) - LEAD)));
}

export function fillAt(progress, count, step) {
  if (!(count > 0)) return 0;
  return Math.min(1, Math.max(0, stepsAt(progress, count) - step));
}

export function shareMiddle({ top, height, screen, count, step }) {
  const run = height - screen;
  if (!(run > 0) || !(count > 0)) return null;
  return Math.round(top + run * ((LEAD + step + 0.5) / spanOf(count)));
}

const isWhole = (row) => Math.abs(row - Math.round(row)) <= WHOLE;

// Where a scroll from `from` to `y` should settle (a resting place), or
// null to leave the page where it is.
function judge({ top, height, screen, count }, from, y) {
  const run = height - screen;
  const share = run / spanOf(count);
  const progress = (y - top) / run;
  const u = stepsAt(progress, count);
  const row = rowAt(progress, count);
  const whole = isWhole(row);
  const rests = Array.from({ length: count }, (_, step) => shareMiddle({ top, height, screen, count, step }));
  const d = y - from;
  if (Math.abs(d) < 1) return whole ? null : rests[Math.round(row)];
  const down = d > 0;
  // The resting places just behind the page and just ahead of it, the visitor's way.
  const behind = down ? rests.filter((r) => r <= y).pop() : rests.find((r) => r >= y);
  const ahead = down ? rests.find((r) => r > y) : rests.filter((r) => r < y).pop();
  if (Math.abs(d) < NUDGE * share) {
    if (whole && behind !== undefined && Math.abs(y - behind) < COMMIT * share) return null;
    return ahead ?? null;
  }
  const lean = down ? Math.floor(row + 1 - BIAS) : Math.ceil(row - 1 + BIAS);
  const target = rests[Math.min(count - 1, Math.max(0, lean))];
  if ((u < 0 || u > count) && (down ? target < y : target > y)) return null;
  return target;
}

export function settleTarget({ top, height, screen, count, scrollY, from, heading = null }) {
  const run = height - screen;
  if (!(run > 0) || !(count > 1)) return null;
  const inHold = (y) => y > top && y < top + run;
  if (!inHold(scrollY)) return null;
  const story = { top, height, screen, count };
  const answer = (target) => (target === null || Math.abs(target - scrollY) < 1 ? null : target);
  if (heading !== null && Number.isFinite(heading)) {
    const d = scrollY - from;
    if (Math.abs(d) < 2) return answer(heading); // a touch that did not scroll: the glide goes on
    const way = Math.sign(heading - from);
    if (Math.sign(d) === way) {
      // Past half-way to the step the glide was going to: from there.
      const rowFrom = rowAt((from - top) / run, count);
      const rowTo = rowAt((heading - top) / run, count);
      const end = heading + d;
      if (Math.abs(rowTo - rowFrom) < 0.5 && inHold(end)) return answer(judge(story, heading, end) ?? end);
      // Short of it: from where the scroll began, never short of that step.
      const target = judge(story, from, scrollY) ?? scrollY;
      return answer((target - heading) * way < 0 ? heading : target);
    }
  }
  return answer(judge(story, from, scrollY));
}

export function pageTarget({ top, height, screen, count, step, down }) {
  const next = step + (down ? 1 : -1);
  if (next < 0 || next >= count) return null;
  return shareMiddle({ top, height, screen, count, step: next });
}

// A story almost holding the screen already (its top within 15% of the
// screen below the top going down, or its foot within 15% above the foot
// going up): its first (or last) step is in view, so a page key goes on
// to the next step instead of only settling the stage (which looked like a
// press that did nothing).
export const NEARLY_HELD = 0.15;

export function nearlyHeld({ top, height, screen, scrollY, down }) {
  const boxTop = top - scrollY;
  const boxBottom = boxTop + height;
  if (height <= screen) return false;
  return down ? boxTop > 1 && boxTop <= screen * NEARLY_HELD : boxBottom < screen - 1 && screen - boxBottom <= screen * NEARLY_HELD;
}

export function entryTarget({ top, height, screen, count, scrollY, down }) {
  const boxTop = top - scrollY;
  const boxBottom = boxTop + height;
  // The top edge below the top of the screen but not below its foot (going
  // down); the bottom edge above the foot of the screen but not above its
  // top (going up). Within a pixel of the top or the foot the story already
  // holds the screen, and pageTarget answers.
  const entering = down ? boxTop > 1 && boxTop <= screen : boxBottom < screen - 1 && boxBottom >= 0;
  if (!entering) return null;
  return shareMiddle({ top, height, screen, count, step: down ? 0 : count - 1 });
}

// The page's own glides. pace: ms per share of the row's slide; plateau:
// the part of that a stretch in which only a bar moves takes; min and max:
// the shortest and longest glide in ms; ramp: the part of the time over
// which the speed rises when the row was left between two steps; land: the
// same at the start otherwise, and at the end.
export const GLIDE = { pace: 560, plateau: 0.35, min: 180, max: 700, ramp: 0.32, land: 0.14 };

// A point in shares, measured as the glides pace it: a share of the row's
// slide counts in full, a share of plateau (or lead) for GLIDE.plateau.
function slides(count) {
  const half = MOVE / 2;
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) => [i + 1 - half, i + 1 + half]);
}

function paced(u, count) {
  let sliding = 0;
  for (const [a, b] of slides(count)) sliding += Math.min(b, Math.max(a, u)) - a;
  return GLIDE.plateau * (u + LEAD - sliding) + sliding;
}

function unpaced(w, count) {
  const points = [-LEAD, ...slides(count).flat(), count + LEAD];
  for (let i = 1; i < points.length; i++) {
    const a = paced(points[i - 1], count);
    const b = paced(points[i], count);
    if (w <= b || i === points.length - 1) {
      const t = b > a ? (w - a) / (b - a) : 0;
      return points[i - 1] + (points[i] - points[i - 1]) * t;
    }
  }
  return w;
}

export function glideMs({ from, to, count }) {
  const span = Math.abs(paced(to, count) - paced(from, count));
  return Math.round(Math.min(GLIDE.max, Math.max(GLIDE.min, GLIDE.pace * span)));
}

// The part of the way covered at a part t of the time: the speed rises over
// the first `rise` of the time, holds, and falls over the last `fall`.
export function glideEase(t, rise, fall) {
  const x = Math.min(1, Math.max(0, t));
  const top = 1 / (1 - (rise + fall) / 2);
  if (x < rise) return (top * x * x) / (2 * rise);
  if (x <= 1 - fall) return top * (rise / 2 + (x - rise));
  return 1 - (top * (1 - x) * (1 - x)) / (2 * fall);
}

export function glideAt({ from, to, count, t }) {
  const rise = isWhole(rowIn(from, count)) ? GLIDE.land : GLIDE.ramp;
  const a = paced(from, count);
  const b = paced(to, count);
  return unpaced(a + (b - a) * glideEase(t, rise, GLIDE.land), count);
}

// How the drawn row follows the scroll: a critically damped spring with this
// angular speed (per second: it trails a steady scroll by about 36 ms and
// finishes a wheel notch's glide in about 80 ms), never more than `lag` of a
// share behind.
export const FOLLOW = { omega: 55, lag: 0.3 };

export function followStep({ x, v, target, dt, maxLag }) {
  const w = FOLLOW.omega;
  const d = x - target;
  const e = Math.exp(-w * dt);
  let nx = target + (d + (v + w * d) * dt) * e;
  let nv = (v - w * (v + w * d) * dt) * e;
  if (Math.abs(nx - target) > maxLag) {
    nx = target + Math.sign(nx - target) * maxLag;
    nv = -w * (nx - target); // closing in no faster than the spring would from there, so never past the scroll
  }
  return { x: nx, v: nv };
}

export function listStepAt(stepTops, line) {
  let step = 0;
  stepTops.forEach((top, i) => {
    if (top <= line) step = i;
  });
  return step;
}

// The space kept between a step's words and the edge of the screen when a
// step taller than the screen is put back on it.
export const LIST_MARGIN = 16;

export function listTarget({ stepTop, stepHeight, screen, wordsTop = null, wordsBottom = null }) {
  if (stepHeight <= screen) return Math.round(stepTop - (screen - stepHeight) / 2);
  if (!Number.isFinite(wordsTop) || !Number.isFinite(wordsBottom)) return Math.round(stepTop);
  // Words taller than the screen: from their top. Otherwise as little of the
  // step's top hidden as leaves the words whole on the screen.
  if (wordsBottom - wordsTop + 2 * LIST_MARGIN > screen) return Math.round(Math.max(stepTop, wordsTop - LIST_MARGIN));
  return Math.round(Math.max(stepTop, wordsBottom + LIST_MARGIN - screen));
}
