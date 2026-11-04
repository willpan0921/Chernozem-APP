// WHAT THIS FILE DOES
// A held, sideways story on the About page (HomePage.jsx uses it twice:
// Field, then Atlas). While the visitor scrolls, the section stays still on
// the screen and its row of steps moves sideways with the scroll, one step
// after another: first what the product is, then how it works. Each step is
// a short title, one or two plain sentences and a true-size picture of the
// app (crops in public/site/shots/crops/, 800 x 500 with a 1600 x 1000 copy
// for sharp screens; crops/manifest.json says where and how each was shot).
// When the steps run out, the page scrolls on to the next section.
//
// How it moves: the section is as tall as the screen plus one share of
// scroll per step (half the screen, 440 to 460 px: scrollstory.css,
// scrollStoryMath.js HOLD), with half a share more before the first step
// and after the last (the lead-in and the lead-out, LEAD, in which that step
// already rests whole, so the swipe that brings a story onto the screen
// ends on its first step, or going back up, on its last). Its stage sticks
// to the top of the screen (CSS position: sticky) while the section passes
// under it; motion's useScroll says how far through that hold the page is,
// and the row follows it, frame by frame (scrollStoryMath.js rowAt): in the
// middle of each share the row stands still on its step, whole (the step's
// plateau), and around each boundary between two shares it glides to the
// next step, eased in and out. So the scroll is never answered by a jump.
// Between the browser's scroll events the drawn row follows through a
// short, critically damped spring (scrollStoryMath.js followStep), so a
// wheel's 100 px notches glide rather than stutter, without ever passing
// the scroll, and never more than FOLLOW.lag of a share behind it, so a
// fast fling still shows each step go by. The row, the dimming of the words
// of the steps on their way out, the progress bars and the hint are written
// straight onto the page from that one value; React draws again only when
// the current step changes (and once more to take the hint away).
//
// Where the visitor is: under the heading, a row with every step (on a wide
// screen their titles, on a narrower one a bar each and "2 of 5"); the
// current one is marked (aria-current) and its bar fills as the visitor
// scrolls through its share, on the plateau too. Each is a button that
// glides the page to that step's resting place (a click with the pointer
// gives the focus back, so Space then moves along). Under that row a short
// hint, "Scroll to move along" with an arrow, says that scrolling moves the
// story sideways, on whichever step the visitor arrives; it fades as the
// row starts to move, stays away once the visitor has moved a step (in
// either story), and is taken out of the page the next time the story is
// off the screen.
//
// Coming to rest whole: when the visitor's scroll is over (the browser's
// scrollend, or with no scroll for IDLE_MS where there is none, as in
// Safari before 26.2; then QUIET_MS more, with no finger on the screen and
// the main button not held: the other buttons and a Ctrl+click open a menu,
// which on a Mac keeps their release, so they count for nothing, and the
// menu's own event ends a press), the page glides to a step's resting place
// (scrollStoryMath.js settleTarget): after a nudge (one wheel notch, two
// arrow keys, a small touch), on to the next step the way the visitor
// went; after a longer scroll, to the nearer step, leaning the visitor's
// way. The page runs that glide itself, frame by frame (glideAt), and stops
// it the moment the visitor does anything: a wheel, a key, a finger or a
// button, or a scroll it did not make itself. The visitor always wins:
// their scroll then counts from where the glide stopped (or, the same way,
// once the row was past half-way, from the step the glide was going to, so
// a second notch or swipe moves one step more; short of half-way, never to
// less than that step). A scroll made without the wheel, a key, a finger
// or a button (a link, the page put back, the scrollbar, the browser's
// find) is settled only where it left the row between two steps, to the
// nearer one; a link to #field-story lands on the first step's resting
// place already (scrollstory.css). Nothing captures the wheel or a finger:
// every listener but the page keys' is passive, and the page scrolls
// natively (an arrow key too: the story only counts it).
//
// The page keys: while a story holds the screen, Page Down, Page Up and
// Space glide exactly one step (a browser's page is about two steps'
// shares, so a press could otherwise skip one); pressed during a glide,
// they count from the step it is going to; past the first or the last step
// they scroll the page as usual (scrollStoryMath.js pageTarget). The press
// that brings a story onto the screen is helped too: going down it stops on
// the first step, going up on the last one (entryTarget). A change made
// while the section is off the screen (a jump back to the top of the page,
// say) is put in place at once, with no glide nobody would see.
//
// The visitor's place is kept when the window changes size or a phone is
// turned on its side (which can swap the held story for the plain list,
// below, and back): the story notes which step is on the screen as the
// page scrolls, and after the change it puts that same step back on the
// screen, in whichever layout it now has (in the plain list with its words
// on the screen). The browser's bar coming and going on a phone does not
// count as a change. The browser's own way of keeping a place (scroll
// anchoring) is told not to use the held stage's parts, which stay put
// while the page moves under them (scrollstory.css).
//
// Without the hold: for visitors who asked for reduced motion, and on a
// screen too short to show a step (under 540 px tall, a phone on its side),
// the steps are a plain list, one under the other, all in place, with no
// progress row and no hint (on a phone on its side, each step's words
// beside its picture, so a step fits the screen). The steps are always an
// ordered list in the page, so a screen reader reads them in order either
// way.
//
// The pictures are fetched once the section comes within 1,500 px of the
// screen: the steps waiting off to the right would otherwise only start
// loading as they slide in. The arithmetic is in scrollStoryMath.js.
//
//   <ScrollStory id="field" title="Field, for one farm"
//                link={{ to: "/field", label: "Open Field in the demo" }}
//                steps={[{ title, text, shot, alt, fx, fy }, ...]}
//                surface />
//
//   surface the section on the page's surface tone (one step from the
//           ground), so two stories in a row read as two chapters
//   title   the step's title, also its name in the progress row (keep it
//           short: it shares a line with the others on a wide screen)
//   shot    the crop's name in crops/, without "-800.webp"
//   fx, fy  which part of the picture a phone's window shows (CSS
//           object-position, as percentages)
//   tx      (optional) the same sideways, for a window only a little
//           narrower than the picture (a tablet, a small laptop); fx
//           when it is not given
//
// WHO EDITS IT
// Whoever works on the About page. The steps' words and pictures are in
// HomePage.jsx; the look is in scrollstory.css.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useMediaQuery, useNear } from "../hooks.js";
import { enterDemo } from "../../lib/demoMode.js";
import { FOLLOW, LEAD, entryTarget, fillAt, followStep, glideAt, glideMs, listStepAt, listTarget, nearlyHeld, pageTarget, rowAt, settleTarget, shareMiddle, spanOf, stepAt } from "./scrollStoryMath.js";
import "./scrollstory.css";

const crop = (shot, px) => `/site/shots/crops/${shot}-${px}.webp`;

// Where a page key does its own work: typing, a form control, a film, an
// open dialog or menu. Space also presses a button (one of the progress
// row's, say), so it is left alone there too; Page Down and Page Up are not
// a button's keys, so a step chosen with the keyboard still lets them help.
const OWN_KEYS = "input, textarea, select, [contenteditable], [role='slider'], [role='listbox'], [role='menu'], [role='dialog'], video, audio";
const OWN_SPACE = "button, [role='button']";

// Keys that only change what the next key does: they stop no glide.
const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn"]);

// How long after a change of the window's size the place noted before it
// is kept, while the browser and the page settle into the new layout.
const SETTLE_MS = 400;

// How long the page must be still after the visitor's scroll ended before
// the row glides on to a whole step: long enough that two or three wheel
// notches in a row are one scroll, short enough to feel like part of it
// (a notch that comes later stops the glide, and moves a step more only if
// the row was past half-way: scrollStoryMath.js settleTarget).
const QUIET_MS = 100;

// Where the browser does not say a scroll has ended (no scrollend event):
// how long with no scrolling counts as the end, and the quiet in one.
const IDLE_MS = 150;

// The space kept above and below a step on the stage when the picture is
// fitted to a short screen.
const FIT_MARGIN = 16;

// How much the words of a step on its way out (or in) are dimmed, one step
// away from the screen's: 1 - 0.6 = 0.4 of full ink, never fainter.
const DIM = 0.6;

// The visitor has moved a step once (in either story): the hint stays away
// from then on, in both. Each story's hint listens.
let learned = false;
const learners = new Set();
function learn() {
  if (learned) return;
  learned = true;
  learners.forEach((hide) => hide());
}

// Which step of a story the visitor has on the screen, read from the page
// as it is laid out now, or null when the visitor is elsewhere on the page.
// Held: while the stage holds the screen. The plain list: while the story
// covers the middle of the screen, the step at that line.
function placeIn(el, count) {
  const box = el.getBoundingClientRect();
  const screen = window.innerHeight;
  if (el.classList.contains("is-held")) {
    if (box.top > 1 || box.bottom < screen - 1) return null;
    return stepAt(-box.top / (box.height - screen), count);
  }
  const middle = screen / 2;
  if (box.top > middle || box.bottom < middle) return null;
  const tops = [...el.querySelectorAll(".story-step")].map((li) => li.getBoundingClientRect().top);
  return listStepAt(tops, middle);
}

// Where the page rests to show a step, in the layout the story has now.
function placeTop(el, count, step) {
  const box = el.getBoundingClientRect();
  const screen = window.innerHeight;
  if (el.classList.contains("is-held")) return shareMiddle({ top: window.scrollY + box.top, height: box.height, screen, count, step });
  const li = el.querySelectorAll(".story-step")[step];
  if (!li) return null;
  const r = li.getBoundingClientRect();
  const words = li.querySelector(".story-words")?.getBoundingClientRect();
  return listTarget({ stepTop: window.scrollY + r.top, stepHeight: r.height, screen, wordsTop: words ? window.scrollY + words.top : null, wordsBottom: words ? window.scrollY + words.bottom : null });
}

// Puts a step back on the screen: at once, and once more on the next frame,
// in case a part of the page above was still settling into the new layout.
function putBack(el, count, step) {
  const go = () => {
    if (!el.isConnected) return; // the visitor has left the page
    const top = placeTop(el, count, step);
    if (top !== null && Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: "instant" });
  };
  go();
  window.requestAnimationFrame(go);
}

// How far through the hold the page is now, read from the page (0 to 1).
function progressIn(el) {
  const box = el.getBoundingClientRect();
  const run = box.height - window.innerHeight;
  return run > 0 ? Math.min(1, Math.max(0, -box.top / run)) : 0;
}

// The hint's arrow: drawn, so it looks the same in every browser.
function Along() {
  return (
    <svg className="story-hint-arrow" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M2 9h13M10 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
    </svg>
  );
}

export default function ScrollStory({ id, title, link, steps, surface = false }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const short = useMediaQuery("(max-height: 539px)");
  const held = !reduced && !short;
  const count = steps.length;

  const [ref, near] = useNear("1500px 0px");
  const [at, setAt] = useState(0);
  const [hinted, setHinted] = useState(() => !learned);
  const atRef = useRef(0);
  const hintedRef = useRef(hinted);
  const trackRef = useRef(null);
  const wordsRefs = useRef([]);
  const fillRefs = useRef([]);
  const hintRef = useRef(null);
  const landed = useRef(null);
  const steer = useRef(null);
  const current = held ? at : 0;

  // How far through the hold the page is (0 to 1).
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Draws the story at a point of its hold: the row, the words' dimming,
  // the progress bars and the hint, straight onto the page. The visitor
  // arrives on a step (landed: the whole step nearest the row) when the
  // story first holds the screen; once the row has moved half a step from
  // there, they have moved on. So at rest the hint is either all there or
  // gone, never half faded.
  const paint = useCallback(
    (progress) => {
      const track = trackRef.current;
      if (!track || !held) return;
      const row = rowAt(progress, count);
      if (progress > 0 && progress < 1) {
        if (landed.current === null) landed.current = Math.round(row);
        if (Math.abs(row - landed.current) >= 0.5) learn();
      } else {
        landed.current = null;
      }
      track.style.transform = `translate3d(${(-100 * row).toFixed(3)}%, 0, 0)`;
      for (let k = 0; k < count; k++) {
        const words = wordsRefs.current[k];
        if (words) words.style.opacity = (1 - DIM * Math.min(1, Math.abs(row - k))).toFixed(3);
        const fill = fillRefs.current[k];
        if (fill) fill.style.transform = `scaleX(${fillAt(progress, count, k).toFixed(4)})`;
      }
      if (hintRef.current) hintRef.current.style.opacity = learned ? "0" : Math.max(0, 1 - 3 * Math.abs(row - (landed.current ?? row))).toFixed(3);
      const step = stepAt(progress, count);
      if (step !== atRef.current) {
        atRef.current = step;
        setAt(step);
      }
    },
    [count, held]
  );

  // The drawn row follows the hold's progress through followStep, one step
  // per frame until it has caught up; a change is answered in the frame it
  // arrives. x is drawn, target is the page's.
  const drawn = useRef({ x: 0, v: 0, target: 0, time: 0, frame: 0 });
  const follow = useCallback(
    (target) => {
      const f = drawn.current;
      const run = () => {
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - f.time) / 1000));
        f.time = now;
        const next = followStep({ x: f.x, v: f.v, target: f.target, dt, maxLag: FOLLOW.lag / spanOf(count) });
        const still = Math.abs(next.x - f.target) < 1e-6 && Math.abs(next.v) < 1e-5;
        f.x = still ? f.target : next.x;
        f.v = still ? 0 : next.v;
        paint(f.x);
        f.frame = still ? 0 : window.requestAnimationFrame(run);
      };
      if (f.frame) window.cancelAnimationFrame(f.frame);
      else f.time = performance.now() - 1000 / 60; // starting out: as if one frame had passed
      f.target = target;
      run();
    },
    [count, paint]
  );
  const jump = useCallback(
    (progress) => {
      const f = drawn.current;
      if (f.frame) window.cancelAnimationFrame(f.frame);
      f.frame = 0;
      f.x = progress;
      f.target = progress;
      f.v = 0;
      paint(progress);
    },
    [paint]
  );
  useEffect(() => () => window.cancelAnimationFrame(drawn.current.frame), []);

  // A change made off the screen, or right after the page was put in place
  // (a resize, a layout change, the first measurement), is drawn at once.
  // The plain list draws nothing.
  const jumpNext = useRef(true);
  const onProgress = useCallback(
    (progress) => {
      if (!held) return;
      const box = ref.current?.getBoundingClientRect();
      const off = !box || box.bottom <= 0 || box.top >= window.innerHeight;
      if (jumpNext.current || off) {
        jumpNext.current = false;
        jump(progress);
      } else {
        follow(progress);
      }
    },
    [follow, held, jump, ref]
  );
  useMotionValueEvent(scrollYProgress, "change", onProgress);

  // Another story's hint went away: this one's too.
  useEffect(() => {
    const hide = () => {
      if (hintRef.current) hintRef.current.style.opacity = "0";
    };
    learners.add(hide);
    return () => learners.delete(hide);
  }, []);

  // The visitor's place: the step on the screen, noted as the page scrolls
  // (null while the visitor is elsewhere on the page). When the window's
  // size really changes (its width, or the height the stage is cut to: a
  // phone's bar coming and going changes neither), the noted step is put
  // back on the screen in the new layout, and the note is held for a moment
  // while the browser settles, so the jumps of that settling never replace
  // it. A hint no longer needed is taken out while the story is off the
  // screen, where its line going away moves nothing the visitor sees.
  const place = useRef(null);
  const size = useRef("");
  const settling = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const sizeOf = () => `${document.documentElement.clientWidth} ${el.offsetHeight}`;
    const note = () => {
      if (learned && hintedRef.current) {
        const box = el.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= window.innerHeight) {
          hintedRef.current = false;
          setHinted(false);
        }
      }
      if (performance.now() < settling.current) return;
      place.current = placeIn(el, count);
      size.current = sizeOf();
    };
    const onResize = () => {
      const now = sizeOf();
      if (now === size.current) return;
      size.current = now;
      settling.current = performance.now() + SETTLE_MS;
      jumpNext.current = true;
      if (place.current !== null) putBack(el, count, place.current);
    };
    note();
    window.addEventListener("scroll", note, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", note);
      window.removeEventListener("resize", onResize);
    };
  }, [count, ref]);

  // When the story changes between held and the plain list (a phone turned,
  // reduced motion switched on or off), the same step goes back on the
  // screen before the new layout is shown; back in the held layout, the row
  // is put at that step at once, with no glide.
  const wasHeld = useRef(held);
  useLayoutEffect(() => {
    if (wasHeld.current === held) return;
    wasHeld.current = held;
    const el = ref.current;
    const step = place.current;
    if (!el || step === null) return;
    settling.current = performance.now() + SETTLE_MS;
    if (held) {
      atRef.current = step;
      jumpNext.current = true;
      setAt(step);
    }
    putBack(el, count, step);
  }, [held, count, ref]);

  // Where the words sit under the picture (up to 900 px wide), the picture
  // takes the height the tallest step's words leave on the stage, with
  // FIT_MARGIN above and below, so every step fits whole on a short phone
  // (scrollstory.css keeps it between its floor and its usual height:
  // --story-fit). Measured when the stage, its heading or a step's words
  // change size, never as the page scrolls.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!held || !el || typeof ResizeObserver === "undefined") return undefined;
    const stage = el.querySelector(".story-stage");
    const head = el.querySelector(".story-head");
    const panel = el.querySelector(".story-panel");
    const words = [...el.querySelectorAll(".story-words")];
    const narrow = window.matchMedia("(max-width: 900px)");
    const fit = () => {
      if (!narrow.matches) {
        stage.style.removeProperty("--story-fit");
        return;
      }
      const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
      const between = parseFloat(getComputedStyle(panel).rowGap) || 0;
      const tallest = Math.max(...words.map((node) => node.offsetHeight));
      const room = stage.clientHeight - head.offsetHeight - gap - between - tallest - 2 * FIT_MARGIN;
      stage.style.setProperty("--story-fit", `${Math.floor(room)}px`);
    };
    const watch = new ResizeObserver(fit);
    [stage, head, ...words].forEach((node) => watch.observe(node));
    narrow.addEventListener("change", fit);
    fit();
    return () => {
      watch.disconnect();
      narrow.removeEventListener("change", fit);
      stage.style.removeProperty("--story-fit");
    };
  }, [held, ref, steps]);

  // Drawn as the layout is now (after the switch above has put the page
  // back in place): held, at the page's place in the hold; the plain list,
  // with nothing moved or dimmed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (held) {
      jumpNext.current = true;
      jump(progressIn(el));
      return;
    }
    window.cancelAnimationFrame(drawn.current.frame);
    drawn.current.frame = 0;
    if (trackRef.current) trackRef.current.style.transform = "";
    wordsRefs.current.forEach((words) => {
      if (words) words.style.opacity = "";
    });
  }, [held, jump, ref]);

  // The page's own glides and the visitor's scrolling, while the story is
  // held. The visitor's place is kept as an offset into the section (the
  // page's scroll less the section's top), so a change above it moves
  // nothing: rest is where the visitor's next scroll begins, heading the
  // resting place a glide was going to when the visitor stopped it, touched
  // whether the visitor has done anything since the page last came to rest.
  useEffect(() => {
    const el = ref.current;
    if (!held || !el) return undefined;
    const ends = "onscrollend" in window;
    const offset = () => -el.getBoundingClientRect().top;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const screen = window.innerHeight;
      return { box, story: { top: window.scrollY + box.top, height: box.height, screen, count } };
    };
    let glide = null;
    let frame = 0;
    let rest = offset();
    let heading = null;
    let touched = false;
    let pressed = false;
    let fingers = 0;
    let timer = 0;

    const wait = () => {
      window.clearTimeout(timer);
      timer = 0;
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      glide = null;
    };
    // The visitor did something while the page was gliding: the glide stops
    // where it is, and their scroll counts from there.
    const interrupt = () => {
      if (!glide) return;
      heading = glide.end;
      rest = glide.last;
      stop();
    };

    // One frame of a glide: the page moves to where glideAt says, unless
    // something else has moved it since the last frame.
    const tick = (now) => {
      frame = 0;
      const g = glide;
      if (!g) return;
      const off = offset();
      if (Math.abs(off - g.last) > 2) {
        interrupt();
        return;
      }
      const t = Math.min(1, (now - g.start) / g.ms);
      const next = t >= 1 ? g.end : (glideAt({ from: g.from, to: g.to, count, t }) + LEAD) * g.share;
      window.scrollTo({ top: window.scrollY + next - off, behavior: "instant" });
      g.last = offset();
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      glide = null;
      rest = g.last;
      heading = null;
      touched = false;
    };

    // Glides the page to `top` (a resting place on the page), step `step`'s.
    const glideTo = (top, step) => {
      stop();
      wait();
      const { box, story } = measure();
      const run = box.height - story.screen;
      if (!(run > 0)) return;
      const share = run / spanOf(count);
      const off = -box.top;
      const end = top - story.top;
      if (Math.abs(end - off) < 1) {
        rest = off;
        heading = null;
        return;
      }
      const from = off / share - LEAD;
      const to = end / share - LEAD;
      glide = { from, to, end, share, step, last: off, start: performance.now(), ms: glideMs({ from, to, count }) };
      frame = window.requestAnimationFrame(tick);
    };

    // The visitor's scroll is over: the page settles on a whole step.
    function check() {
      timer = 0;
      if (glide || pressed || fingers > 0 || document.documentElement.hasAttribute("data-menu")) return;
      const { story } = measure();
      const off = window.scrollY - story.top;
      // A scroll made without the wheel, a key, a finger or a button (a link,
      // the page put back, the scrollbar, the browser's find) has no way of
      // its own: it is left alone where a step is whole, and settled on the
      // nearer step only where it left the row between two.
      const from = touched ? story.top + rest : window.scrollY;
      const target = settleTarget({ ...story, scrollY: window.scrollY, from, heading: touched && heading !== null ? story.top + heading : null });
      touched = false;
      heading = null;
      if (target === null) {
        rest = off;
        return;
      }
      glideTo(target, stepAt((target - story.top) / (story.height - story.screen), count));
    }
    const later = (ms) => {
      wait();
      timer = window.setTimeout(check, ms);
    };

    // The visitor's hand: a wheel, a key, a finger or a button.
    const input = () => {
      touched = true;
      interrupt();
      later(ends ? QUIET_MS : IDLE_MS);
    };
    // A wheel turned with no button held: whatever press was noted is over
    // (its release went elsewhere).
    const onWheel = (event) => {
      if (event.buttons === 0) pressed = false;
      input();
    };
    const onScroll = () => {
      if (glide) {
        if (Math.abs(offset() - glide.last) <= 2) return; // the glide's own frame
        interrupt();
      }
      if (ends) wait();
      else later(IDLE_MS);
    };
    const onEnd = () => {
      if (!glide) later(QUIET_MS);
    };
    // The main button held (a mouse or a pen) holds the settling back. Not
    // the other buttons: they open a menu, and on a Mac the menu keeps
    // their release, as it does a Ctrl+click's (the menu's own event, then,
    // says the press is over), so the story would never settle again.
    const onPointerDown = (event) => {
      if (event.pointerType === "touch") return; // a finger: the touch events below
      if (event.button !== 0) return;
      pressed = true;
      input();
    };
    const onPointerUp = (event) => {
      if (event.pointerType === "touch") return;
      pressed = false;
      later(QUIET_MS);
    };
    const onMenu = () => {
      pressed = false;
      later(QUIET_MS);
    };
    const onTouchStart = (event) => {
      fingers = event.touches.length;
      input();
    };
    const onTouchEnd = (event) => {
      fingers = event.touches.length;
      if (!fingers) later(ends ? QUIET_MS : IDLE_MS);
    };
    const onBlur = () => {
      pressed = false;
      fingers = 0;
    };

    // Page Down, Page Up and Space move one step while the story holds the
    // screen, and stop on the first step (or, going up, the last) when they
    // bring the story onto the screen. A press made while the page is
    // gliding to a step counts from that step, so pressing twice moves two.
    // Answers whether the key was taken.
    const pageKey = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
      const down = event.key === "PageDown" || (event.key === " " && !event.shiftKey);
      const up = event.key === "PageUp" || (event.key === " " && event.shiftKey);
      if (!down && !up) return false;
      if (event.target instanceof Element && event.target.closest(event.key === " " ? `${OWN_KEYS}, ${OWN_SPACE}` : OWN_KEYS)) return false;
      if (document.documentElement.hasAttribute("data-menu")) return false; // the phone menu is open over the page
      const { box, story } = measure();
      const screen = story.screen;
      let from; // the step the press moves on from
      let top;
      if (glide) {
        from = glide.step;
        top = pageTarget({ ...story, step: from, down });
      } else if (box.top <= 1 && box.bottom >= screen - 1) {
        from = stepAt(-box.top / (box.height - screen), count);
        top = pageTarget({ ...story, step: from, down });
      } else if (nearlyHeld({ ...story, scrollY: window.scrollY, down })) {
        // Almost holding the screen, its first (or last) step in view: on to the next.
        from = down ? 0 : count - 1;
        top = pageTarget({ ...story, step: from, down });
      } else {
        // Not holding the screen: the press that brings the story in?
        from = down ? -1 : count;
        top = entryTarget({ ...story, scrollY: window.scrollY, down });
      }
      if (top === null) return false;
      event.preventDefault();
      glideTo(top, from + (down ? 1 : -1));
      return true;
    };
    const onKey = (event) => {
      if (MODIFIERS.has(event.key) || pageKey(event)) return;
      input();
    };

    // A step in the progress row: the page glides to where it rests.
    steer.current = (step) => {
      const { story } = measure();
      const top = shareMiddle({ ...story, step });
      if (top !== null) glideTo(top, step);
    };

    const passive = { passive: true };
    window.addEventListener("wheel", onWheel, passive);
    window.addEventListener("touchstart", onTouchStart, passive);
    window.addEventListener("touchend", onTouchEnd, passive);
    window.addEventListener("touchcancel", onTouchEnd, passive);
    window.addEventListener("pointerdown", onPointerDown, passive);
    window.addEventListener("pointerup", onPointerUp, passive);
    window.addEventListener("pointercancel", onPointerUp, passive);
    window.addEventListener("contextmenu", onMenu, passive);
    window.addEventListener("scroll", onScroll, passive);
    window.addEventListener("scrollend", onEnd, passive);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      wait();
      steer.current = null;
      window.removeEventListener("wheel", onWheel, passive);
      window.removeEventListener("touchstart", onTouchStart, passive);
      window.removeEventListener("touchend", onTouchEnd, passive);
      window.removeEventListener("touchcancel", onTouchEnd, passive);
      window.removeEventListener("pointerdown", onPointerDown, passive);
      window.removeEventListener("pointerup", onPointerUp, passive);
      window.removeEventListener("pointercancel", onPointerUp, passive);
      window.removeEventListener("contextmenu", onMenu, passive);
      window.removeEventListener("scroll", onScroll, passive);
      window.removeEventListener("scrollend", onEnd, passive);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [held, count, ref]);

  // A step in the progress row, clicked or pressed. A click with the
  // pointer gives the focus back (detail counts the clicks; a key's press
  // has none), so Space then moves the story along rather than pressing
  // this button again.
  const choose = (event, step) => {
    steer.current?.(step);
    if (event.detail > 0) event.currentTarget.blur();
  };

  return (
    <section ref={ref} id={id} className={`story${surface ? " is-surface" : ""}${held ? " is-held" : ""}`} aria-labelledby={`${id}-title`} style={held ? { "--story-steps": count } : undefined}>
      <div className="story-stage">
        <div className="wrap story-head">
          <h2 id={`${id}-title`} className="head story-heading">
            {title}
          </h2>
          <div className="story-side">
            <Link to={link.to} className="link link-under story-link" onClick={enterDemo}>
              {link.label}
            </Link>
          </div>
          {held && (
            <nav className="story-where" aria-label={`${title}, step by step`}>
              <ol className="story-progress">
                {steps.map((step, i) => (
                  <li key={step.shot}>
                    <button type="button" className="story-dot" aria-current={i === current ? "step" : undefined} onClick={(event) => choose(event, i)}>
                      <span className="story-bar" aria-hidden="true">
                        <span
                          className="story-fill"
                          ref={(node) => {
                            fillRefs.current[i] = node;
                          }}
                        />
                      </span>
                      <span className="story-label">{step.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="story-count" aria-hidden="true">
                {current + 1} of {count}
              </p>
              {hinted && (
                <p className="story-hint" aria-hidden="true" ref={hintRef}>
                  Scroll to move along
                  <Along />
                </p>
              )}
            </nav>
          )}
        </div>
        {/* role="list": Safari stops calling a list a list once its markers are styled away */}
        <ol className="story-track" role="list" ref={trackRef}>
          {steps.map((step, i) => (
            <li className="story-step" key={step.shot}>
              <div className="wrap story-panel">
                <div
                  className="story-words"
                  ref={(node) => {
                    wordsRefs.current[i] = node;
                  }}
                >
                  <h3 className="story-title">{step.title}</h3>
                  <p className="story-text">{step.text}</p>
                </div>
                <figure className="story-picture" style={{ "--fx": step.fx, "--fy": step.fy, "--tx": step.tx || step.fx }}>
                  <img
                    src={crop(step.shot, 800)}
                    srcSet={`${crop(step.shot, 800)} 1x, ${crop(step.shot, 1600)} 2x`}
                    alt={step.alt}
                    width="800"
                    height="500"
                    loading={near ? "eager" : "lazy"}
                    decoding="async"
                  />
                </figure>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
