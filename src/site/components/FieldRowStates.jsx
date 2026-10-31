// WHAT THIS FILE DOES
// The showcase on the About page, "One field, one pass": the app's field
// row, once, at true size, in one of its three states, with three buttons
// beside it that switch between them:
//   Arrives    a new satellite pass is in ("New pass")
//   Read       the row as the pointer finds it, with "Read this pass";
//              pressing it shows "Reading" for 900 ms, then the answer
//   Answered   the pass read: plant health, stress, water, the harvest,
//              with "Read it again"
// The row moves from Arrives to Read by itself once, 1.2 s after it is
// half in view; visitors who asked for reduced motion find it at Read.
// The row is built in HTML with the app's own look (white panel, its 1px
// border, Inter at 13 to 15px), so its root carries data-ui. The numbers
// are the demo farm's real Field 11 (src/site/content/site.js, DEMO).
// Styles: src/site/pages/home.css (.showcase, .frow).
//
// WHO EDITS IT
// Whoever changes the showcase. Keep the numbers true to the demo farm.

import { useEffect, useRef, useState } from "react";
import { DEMO } from "../content/site.js";
import { useMediaQuery } from "../hooks.js";

const FIELD = `${DEMO.field11.name} · ${DEMO.field11.crop}`;
const PASS = `New pass · Sentinel-2 · ${DEMO.field11.latestPass} · clear sky`;
const STATES = [
  { id: "arrives", word: "Arrives" },
  { id: "read", word: "Read" },
  { id: "answered", word: "Answered" },
];
const READING_MS = 900;
const AUTO_MS = 1200;

function Row({ state, reading, onRead }) {
  if (state === "answered") {
    return (
      <div className="frow is-done" data-ui>
        <span className="frow-mark is-good" aria-hidden="true" />
        <div className="frow-main">
          <strong className="frow-name">{FIELD}</strong>
          <span className="frow-meta">
            Plant health {DEMO.field11.plantHealth} · Stress {DEMO.field11.stress} · Water {DEMO.field11.water}
          </span>
          <span className="frow-answer">Past peak; greenest on {DEMO.field11.peakDate}</span>
        </div>
        <span className="frow-chip is-good">Growing well</span>
        <button type="button" className="frow-button is-quiet" onClick={onRead}>
          Read it again
        </button>
      </div>
    );
  }
  const hovered = state === "read";
  return (
    <div className={`frow${hovered ? " is-hover" : ""}`} data-ui>
      <span className="frow-mark is-reading" aria-hidden="true" />
      <div className="frow-main">
        <strong className="frow-name">{FIELD}</strong>
        <span className="frow-meta">{PASS}</span>
      </div>
      {reading ? (
        <span className="frow-chip" role="status">
          Reading
        </span>
      ) : hovered ? (
        <button type="button" className="frow-button" onClick={onRead}>
          Read this pass
        </button>
      ) : (
        <span className="frow-chip">New pass</span>
      )}
    </div>
  );
}

export default function FieldRowStates() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [state, setState] = useState(() => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "read" : "arrives"));
  const [reading, setReading] = useState(false);
  const touched = useRef(false);
  const rowRef = useRef(null);
  const readTimer = useRef(0);

  // Once, 1.2 s after the row is half in view, it moves from Arrives to Read.
  useEffect(() => {
    if (reduced) return undefined;
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        io.disconnect();
        timer = setTimeout(() => {
          if (!touched.current) setState((s) => (s === "arrives" ? "read" : s));
        }, AUTO_MS);
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [reduced]);

  useEffect(() => () => clearTimeout(readTimer.current), []);

  const choose = (id) => {
    touched.current = true;
    clearTimeout(readTimer.current);
    setReading(false);
    setState(id);
  };

  const read = () => {
    touched.current = true;
    clearTimeout(readTimer.current);
    setState("read");
    setReading(true);
    readTimer.current = setTimeout(() => {
      setReading(false);
      setState("answered");
    }, READING_MS);
  };

  return (
    <div className="showcase-rows">
      <div className="showcase-states" role="group" aria-label="The row's state" data-slide>
        {STATES.map(({ id, word }) => (
          <button type="button" key={id} className={`showcase-word${state === id ? " is-on" : ""}`} aria-pressed={state === id} onClick={() => choose(id)}>
            {word}
          </button>
        ))}
      </div>
      <div className="showcase-copy" ref={rowRef} data-rise style={{ "--i": 1 }}>
        <Row state={state} reading={reading} onRead={read} />
      </div>
    </div>
  );
}
