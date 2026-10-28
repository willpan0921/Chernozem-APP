// WHAT THIS FILE DOES
// The home page's "checked against the real world" panel: for each test,
// Chernozem's own number and the independent record's, as two bars that
// grow side by side when they scroll into view, with the source named.
//
// WHO EDITS IT
// Whoever updates the website's figures (src/site/content/site.js).

import { motion, useReducedMotion } from "motion/react";
import { NUMBERS, formatInt } from "../content/site.js";

const ROWS = [
  {
    title: "Greece flood, 2023",
    unit: "flooded cropland, ha",
    app: NUMBERS.greeceFloodHa,
    ref: [12600, 15000],
    refLabel: `Copernicus ${NUMBERS.greeceFloodOfficial}`,
    max: 16000,
  },
  {
    title: "Bulgaria wildfire, 2024",
    unit: "burned area, ha",
    app: NUMBERS.bulgariaFireHa,
    ref: [NUMBERS.bulgariaFireOfficial, NUMBERS.bulgariaFireOfficial],
    refLabel: `Copernicus ${formatInt(NUMBERS.bulgariaFireOfficial)}`,
    max: 10000,
  },
  {
    title: "Crop detection, North Dakota",
    unit: "held-out fields named the right crop, % (245 fields)",
    app: NUMBERS.cropHeldOutPercent,
    ref: [100, 100],
    refLabel: "USDA Cropland Data Layer",
    max: 100,
    percent: true,
    note: `${NUMBERS.cropLikelyPercent}% when the app says "likely"; ${NUMBERS.cropAccuracyPercent}% on the Iowa fields it was tuned on`,
  },
];

const EASE = [0.22, 1, 0.36, 1];

export default function ProofBars() {
  const reduced = useReducedMotion();
  return (
    <div className="pb">
      {ROWS.map((row, i) => {
        const appW = (row.app / row.max) * 100;
        const refFrom = (row.ref[0] / row.max) * 100;
        const refTo = (row.ref[1] / row.max) * 100;
        return (
          <div key={row.title} className="pb-row">
            <div className="pb-head">
              <span className="pb-title">{row.title}</span>
              <span className="pb-unit">{row.unit}</span>
            </div>
            <div className="pb-track">
              <span className="pb-label">Chernozem</span>
              <div className="pb-bar">
                <motion.i
                  className="pb-fill pb-app"
                  initial={reduced ? false : { width: "0%" }}
                  whileInView={{ width: `${appW}%` }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1.3, ease: EASE, delay: 0.1 + i * 0.12 }}
                  style={reduced ? { width: `${appW}%` } : undefined}
                />
                <motion.b initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1 + i * 0.12 }} className="mono">
                  {row.percent ? `${row.app}%` : formatInt(row.app)}
                </motion.b>
              </div>
            </div>
            {row.note && <p className="pb-note">{row.note}</p>}
            <div className="pb-track">
              <span className="pb-label">Record</span>
              <div className="pb-bar">
                <motion.i
                  className="pb-fill pb-ref"
                  initial={reduced ? false : { width: "0%" }}
                  whileInView={{ width: `${refFrom}%` }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1.3, ease: EASE, delay: 0.25 + i * 0.12 }}
                  style={reduced ? { width: `${refFrom}%` } : undefined}
                />
                {refTo > refFrom && <i className="pb-range" style={{ left: `${refFrom}%`, width: `${refTo - refFrom}%` }} />}
                <motion.b initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.15 + i * 0.12 }} className="mono pb-ref-text">
                  {row.refLabel}
                </motion.b>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
