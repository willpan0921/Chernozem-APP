// WHAT THIS FILE DOES
// The arithmetic of the About page's held, sideways stories
// (components/ScrollStory.jsx), kept here so it can be tested without a
// browser (src/site/site.test.js). In all of them, top is the section's
// top on the page, height its height, screen the window's height and
// count the number of steps:
//
//   stepAt(progress, count)
//       which step a point of the hold shows. progress runs from 0 (the
//       stage has just reached the top of the screen) to 1 (the hold is
//       over); each of the `count` steps owns an equal share of it, the last
//       one up to the end.
//
//   shareMiddle({ top, height, screen, count, step })
//       where the page rests to show a step: the middle of its share of the
//       hold (null when the section has no hold).
//
//   pageTarget({ top, height, screen, count, step, down })
//       where the page should scroll to when the visitor presses Page Down
//       (down: true) or Page Up (down: false), or Space, while a story holds
//       the screen, so that one key press moves exactly one step and never
//       skips one (a browser's Page Down moves about 0.9 of a screen, and a
//       step's share is 0.6 of one). step is the step on screen now. It
//       answers the middle of the next step's share, or null past the first
//       or the last step, where the key scrolls the page as usual.
//
//   entryTarget({ top, height, screen, count, scrollY, down })
//       the same for the press that brings a story onto the screen: going
//       down while the section's top edge is on the screen, or going up
//       while its bottom edge is. The browser's own page step would carry
//       the page past the first step's share (or, going up, the last
//       one's), so that step would never come to rest; this answers the
//       middle of that share instead. scrollY is how far the page is
//       scrolled now. null when the story's edge is not on the screen (the
//       key then does what it always does).
//
//   listStepAt(stepTops, line)
//       in the plain list (a phone on its side, reduced motion), which step
//       is at a line of the screen (its middle): the last one whose top is
//       at or above it, the first one when none is.
//
//   listTarget({ stepTop, stepHeight, screen })
//       where the page rests to show one step of the plain list: the step
//       in the middle of the screen when it fits, its top at the top of the
//       screen when it is taller than the screen.
//
// shareMiddle, listStepAt and listTarget keep the visitor's place when the
// window changes size or a phone is turned (ScrollStory.jsx).
//
// WHO EDITS IT
// Whoever works on the About page's stories.

export function stepAt(progress, count) {
  const p = Number.isFinite(progress) ? progress : 0;
  return Math.min(count - 1, Math.max(0, Math.floor(p * count)));
}

export function shareMiddle({ top, height, screen, count, step }) {
  const run = height - screen;
  if (!(run > 0) || !(count > 0)) return null;
  return Math.round(top + run * ((step + 0.5) / count));
}

export function pageTarget({ top, height, screen, count, step, down }) {
  const next = step + (down ? 1 : -1);
  if (next < 0 || next >= count) return null;
  return shareMiddle({ top, height, screen, count, step: next });
}

// A story almost holding the screen already (its top within 15% of the
// screen below the top going down, or its foot within 15% above the foot
// going up, as after a link to #field-story): its first (or last) step is
// in view, so a page key goes on to the next step instead of only settling
// the stage (which looked like a press that did nothing).
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

export function listStepAt(stepTops, line) {
  let step = 0;
  stepTops.forEach((top, i) => {
    if (top <= line) step = i;
  });
  return step;
}

export function listTarget({ stepTop, stepHeight, screen }) {
  return Math.round(stepTop - Math.max(0, (screen - stepHeight) / 2));
}
