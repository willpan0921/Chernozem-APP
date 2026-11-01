// WHAT THIS FILE DOES
// A held, sideways story on the About page (HomePage.jsx uses it twice:
// Field, then Atlas). While the visitor scrolls, the section stays still on
// the screen and its steps slide in from the right, one after another:
// first what the product is, then how it works. Each step is a short title,
// one or two plain sentences and a true-size picture of the app (crops in
// public/site/shots/crops/, 800 x 500 with a 1600 x 1000 copy for sharp
// screens; crops/manifest.json says where and how each was shot). A plain
// count ("2 of 5") says where the visitor is. When the steps run out, the
// page scrolls on to the next section.
//
// How it works: the section is as tall as the screen plus 0.6 of a screen
// for each step. Its stage sticks to the top of the screen (CSS position:
// sticky, scrollstory.css) while the section passes under it; motion's
// useScroll says how far through that hold the page is, and each step gets
// an equal share of it (scrollStoryMath.js stepAt). The row of steps then slides to that
// step (a CSS transition of its transform), so a step always comes to rest
// whole, never half of one beside half of the next. Nothing captures the
// wheel: the scrollbar, the arrow keys and a finger work as everywhere
// else, and scrolling back goes back through the steps. Only the page keys
// are helped: while a story holds the screen, Page Down, Page Up and Space
// move exactly one step (a browser's page is longer than a step's share,
// so a press could otherwise skip one); past the first or the last step
// they scroll the page as usual (scrollStoryMath.js pageTarget). The press
// that brings a story onto the screen is helped too: going down it stops
// on the first step, going up on the last one, where the browser's page
// would have carried the page past it (scrollStoryMath.js entryTarget). A
// change made while the section is off the screen (a jump back to the top
// of the page, say) is put in place at once, with no slide nobody would
// see.
//
// The visitor's place is kept when the window changes size or a phone is
// turned on its side (which can swap the held story for the plain list,
// below, and back): the story notes which step is on the screen as the
// page scrolls, and after the change it puts that same step back on the
// screen, in whichever layout it now has. The browser's bar coming and
// going on a phone does not count as a change. The browser's own way of
// keeping a place (scroll anchoring) is told not to use the held stage's
// parts, which stay put while the page moves under them (scrollstory.css).
//
// Without the hold: for visitors who asked for reduced motion, and on a
// screen too short to show a step (under 540 px tall, a phone on its side),
// the steps are a plain list, one under the other, all in place. The steps
// are always an ordered list in the page, so a screen reader reads them in
// order either way.
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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useMediaQuery, useNear } from "../hooks.js";
import { enterDemo } from "../../lib/demoMode.js";
import { entryTarget, listStepAt, listTarget, nearlyHeld, pageTarget, shareMiddle, stepAt } from "./scrollStoryMath.js";
import "./scrollstory.css";

const crop = (shot, px) => `/site/shots/crops/${shot}-${px}.webp`;

// Where a page key does its own work: typing, a button (Space presses
// it), a form control, a film, an open dialog or menu.
const OWN_KEYS = "input, textarea, select, button, [contenteditable], [role='button'], [role='slider'], [role='listbox'], [role='menu'], [role='dialog'], video, audio";

// How long after a change of the window's size the place noted before it
// is kept, while the browser and the page settle into the new layout.
const SETTLE_MS = 400;

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
  return listTarget({ stepTop: window.scrollY + r.top, stepHeight: r.height, screen });
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

export default function ScrollStory({ id, title, link, steps, surface = false }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const short = useMediaQuery("(max-height: 539px)");
  const held = !reduced && !short;
  const count = steps.length;

  const [ref, near] = useNear("1500px 0px");
  const [at, setAt] = useState(0);
  const [jump, setJump] = useState(false);
  const atRef = useRef(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const next = stepAt(progress, count);
    if (next === atRef.current) return;
    atRef.current = next;
    // Off the screen, the row is put in place at once (no slide to watch).
    const box = ref.current?.getBoundingClientRect();
    setJump(!box || box.bottom <= 0 || box.top >= window.innerHeight);
    setAt(next);
  });
  const current = held ? at : 0;

  // The visitor's place: the step on the screen, noted as the page scrolls
  // (null while the visitor is elsewhere on the page). When the window's
  // size really changes (its width, or the height the stage is cut to: a
  // phone's bar coming and going changes neither), the noted step is put
  // back on the screen in the new layout, and the note is held for a moment
  // while the browser settles, so the jumps of that settling never replace
  // it.
  const place = useRef(null);
  const size = useRef("");
  const settling = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const sizeOf = () => `${document.documentElement.clientWidth} ${el.offsetHeight}`;
    const note = () => {
      if (performance.now() < settling.current) return;
      place.current = placeIn(el, count);
      size.current = sizeOf();
    };
    const onResize = () => {
      const now = sizeOf();
      if (now === size.current) return;
      size.current = now;
      settling.current = performance.now() + SETTLE_MS;
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
  // is put at that step at once, with no slide.
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
      setJump(true);
      setAt(step);
    }
    putBack(el, count, step);
  }, [held, count, ref]);

  // Page Down, Page Up and Space move one step while the story holds the
  // screen, and stop on the first step (or, going up, the last) when they
  // bring the story onto the screen. A press made while the page is still
  // gliding to the last one counts from where that one is going, so
  // pressing twice moves two steps.
  const pending = useRef(null);
  useEffect(() => {
    if (!held) return undefined;
    const onKey = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const down = event.key === "PageDown" || (event.key === " " && !event.shiftKey);
      const up = event.key === "PageUp" || (event.key === " " && event.shiftKey);
      if (!down && !up) return;
      if (event.target instanceof Element && event.target.closest(OWN_KEYS)) return;
      if (document.documentElement.hasAttribute("data-menu")) return; // the phone menu is open over the page
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const screen = window.innerHeight;
      const story = { top: window.scrollY + box.top, height: box.height, screen, count };
      const now = performance.now();
      let from; // the step the press moves on from
      let top;
      if (pending.current && now < pending.current.until) {
        from = pending.current.step;
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
      if (top === null) return;
      event.preventDefault();
      pending.current = { step: from + (down ? 1 : -1), until: now + 700 };
      window.scrollTo({ top, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held, count, ref]);

  return (
    <section ref={ref} id={id} className={`story${surface ? " is-surface" : ""}${held ? " is-held" : ""}`} aria-labelledby={`${id}-title`} style={held ? { "--story-steps": count } : undefined}>
      <div className="story-stage">
        <div className="wrap story-head">
          <h2 id={`${id}-title`} className="head story-heading">
            {title}
          </h2>
          <div className="story-side">
            {held && (
              <p className="story-count" aria-hidden="true">
                {current + 1} of {count}
              </p>
            )}
            <Link to={link.to} className="link link-under story-link" onClick={enterDemo}>
              {link.label}
            </Link>
          </div>
        </div>
        <ol className={`story-track${jump ? " is-jump" : ""}`} style={held ? { "--story-at": current } : undefined}>
          {steps.map((step, i) => (
            <li className={`story-step${i === current ? " is-current" : ""}`} key={step.shot}>
              <div className="wrap story-panel">
                <div className="story-words">
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
