// WHAT THIS FILE DOES
// The showcase on the About page, "One field, one pass": the app's field
// row, once, in one of its three states, with three buttons beside it that
// switch between them:
//   Arrives    a new satellite pass is in ("New pass")
//   Read       the row as the pointer finds it, with "Read this pass";
//              pressing it shows "Reading" for 900 ms, then the answer
//   Answered   the pass read: plant health, stress, water, the harvest,
//              with "Read it again"
// The row moves from Arrives to Read by itself once, 1.2 s after it is
// half in view; visitors who asked for reduced motion find it at Read.
// The row is built in HTML with the app's own look (white panel, its 1px
// border, Inter at 13 to 15px), so its root carries data-ui. It is drawn
// at the app's true size (640 px wide) and, on a wide screen, enlarged as a
// whole (CSS zoom, --row-zoom) to fill the columns it sits in, at most
// twice its size, like a close-up. The numbers are the demo farm's real
// Field 11 (src/site/content/site.js, DEMO).
// Languages: the row's words go through t() (src/site/i18n/, namespace
// "home"); the demo farm's own words (the field's name, its crop, its
// dates, "near normal") come from site.js and are translated in common.
// Styles: src/site/pages/home.css (.showcase, .frow).
//
// WHO EDITS IT
// Whoever changes the showcase. Keep the numbers true to the demo farm.

import { useEffect, useRef, useState } from "react";
import { DEMO, formatInt } from "../content/site.js";
import { useMediaQuery } from "../hooks.js";
import { useT } from "../i18n/i18n.js";

const STATES = [
  { id: "arrives", word: "Arrives" },
  { id: "read", word: "Read" },
  { id: "answered", word: "Answered" },
];
const READING_MS = 900;
const AUTO_MS = 1200;
const ROW_WIDTH = 640; // the row's true width (home.css, .frow)

function Row({ state, reading, onRead }) {
  const t = useT("home");
  const field = `${t(DEMO.field11.name)} · ${t(DEMO.field11.crop)}`;
  if (state === "answered") {
    return (
      <div className="frow is-done" data-ui>
        <span className="frow-mark is-good" aria-hidden="true" />
        <div className="frow-main">
          <strong className="frow-name">{field}</strong>
          <span className="frow-meta">
            {t("Plant health {plantHealth} · Stress {stress} · Water {water}", { plantHealth: formatInt(DEMO.field11.plantHealth), stress: t(DEMO.field11.stress), water: t(DEMO.field11.water) })}
          </span>
          <span className="frow-answer">{t("Past peak; greenest on {date}", { date: t(DEMO.field11.peakDate) })}</span>
        </div>
        <span className="frow-chip is-good">{t("Growing well")}</span>
        <button type="button" className="frow-button is-quiet" onClick={onRead}>
          {t("Read it again")}
        </button>
      </div>
    );
  }
  const hovered = state === "read";
  return (
    <div className={`frow${hovered ? " is-hover" : ""}`} data-ui>
      <span className="frow-mark is-reading" aria-hidden="true" />
      <div className="frow-main">
        <strong className="frow-name">{field}</strong>
        <span className="frow-meta">{t("New pass · Sentinel-2 · {date} · clear sky", { date: t(DEMO.field11.latestPass) })}</span>
      </div>
      {reading ? (
        <span className="frow-chip" role="status">
          {t("Reading")}
        </span>
      ) : hovered ? (
        <button type="button" className="frow-button" onClick={onRead}>
          {t("Read this pass")}
        </button>
      ) : (
        <span className="frow-chip">{t("New pass")}</span>
      )}
    </div>
  );
}

export default function FieldRowStates() {
  const t = useT("home");
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

  // How much the row is enlarged: the width its columns give it, over its
  // true width, between 1 and 2 (home.css keeps it at 1 on a phone). Set on
  // the next frame: set at once, the taller row would be a change of size
  // the observer has to report again in the same frame, which Safari (with
  // reduced motion, where nothing eases it) reports as an error
  // ("ResizeObserver loop completed with undelivered notifications").
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => {
      const zoom = Math.min(2, Math.max(1, entry.contentRect.width / ROW_WIDTH)).toFixed(3);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (el.style.getPropertyValue("--row-zoom") !== zoom) el.style.setProperty("--row-zoom", zoom);
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

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
      <div className="showcase-states" role="group" aria-label={t("The row's state")} data-slide>
        {STATES.map(({ id, word }) => (
          <button type="button" key={id} className={`showcase-word${state === id ? " is-on" : ""}`} aria-pressed={state === id} onClick={() => choose(id)}>
            {t(word)}
          </button>
        ))}
      </div>
      <div className="showcase-copy" ref={rowRef} data-rise style={{ "--i": 1 }}>
        <Row state={state} reading={reading} onRead={read} />
      </div>
    </div>
  );
}
