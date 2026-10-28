// WHAT THIS FILE DOES
// The home page's scroll story "From a pin to an atlas": four steps of
// text on one side; on the other, a picture of the app that stays in place
// while the reader scrolls and changes to match the step in the middle of
// the screen. A thin line fills as the story goes on. On a phone the
// picture sits above each step instead.
//
// WHO EDITS IT
// Whoever works on the home page. The steps are listed below.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import Shot from "./Shot.jsx";
import { MapPin, Layers, Satellite, LayoutGrid } from "./Icons.jsx";
import { NUMBERS, formatInt } from "../content/site.js";

const STEPS = [
  {
    icon: MapPin,
    kicker: "01 · Drop a pin",
    title: "Start anywhere on Earth.",
    text: "Search a village, type coordinates or draw your land on the map. There is nothing to install: no sensors, no drones, only a phone or a computer.",
    shot: "field-overview",
    url: "chernozem.app/field",
  },
  {
    icon: Layers,
    kicker: "02 · Trace the fields",
    title: "It finds every field for you.",
    text: `Chernozem traces each field's edges from Sentinel-2 imagery and works out the crop from how it grew through the season. A ten-field farm is read in about ${NUMBERS.tenFieldsSeconds} seconds.`,
    shot: "field-fields",
    url: "chernozem.app/field/fields",
  },
  {
    icon: Satellite,
    kicker: "03 · Read the satellites",
    title: "What happened, in plain words.",
    text: "Water, plant health, stress and harvest readiness, each compared with that field's own normal years. Radar sees through cloud; fire and burn scars show the damage.",
    shot: "field-data",
    url: "chernozem.app/field/data",
  },
  {
    icon: LayoutGrid,
    kicker: "04 · Rank a whole country",
    title: "Then zoom out to the atlas.",
    text: `Atlas reads a whole country square by square, ${formatInt(NUMBERS.ukraineSquares)} of them for Ukraine, every month, and ranks where recovery should begin.`,
    shot: "atlas-map-near-macro",
    url: "chernozem.app/atlas/map",
  },
];

function Step({ step, index, onActive }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onActive(index);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, onActive]);
  const Icon = step.icon;
  return (
    <div ref={ref} className="ps-step">
      <div className="ps-step-phone">
        <Shot name={step.shot} url={step.url} alt={step.title} />
      </div>
      <div className="ps-kicker">
        <span className="ps-icon">
          <Icon size={18} />
        </span>
        {step.kicker}
      </div>
      <h3 className="h-2 ps-title">{step.title}</h3>
      <p className="lead ps-text">{step.text}</p>
    </div>
  );
}

export default function PinStory() {
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const step = STEPS[active];
  return (
    <div className="ps" ref={ref}>
      <div className="ps-visual">
        <div className="ps-sticky">
          <div className="ps-frame">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={step.shot}
                className="ps-slide"
                initial={reduced ? false : { opacity: 0, scale: 0.96, y: 24, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                exit={reduced ? undefined : { opacity: 0, scale: 1.02, y: -16, filter: "blur(8px)" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <Shot name={step.shot} url={step.url} alt={step.title} eager={active === 0} />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="ps-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.shot} className={i === active ? "is-on" : ""} />
            ))}
          </div>
        </div>
      </div>
      <div className="ps-steps">
        <div className="ps-line" aria-hidden="true">
          <motion.i style={{ scaleY: fill }} />
        </div>
        {STEPS.map((s, i) => (
          <Step key={s.shot} step={s} index={i} onActive={setActive} />
        ))}
      </div>
    </div>
  );
}
