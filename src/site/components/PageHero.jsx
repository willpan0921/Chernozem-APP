// WHAT THIS FILE DOES
// The dark band at the top of every website page except the home page: a
// small label, the headline (its words rise in one after another) and a
// short lead paragraph. A faint grid of map squares drifts behind it.
//
// WHO EDITS IT
// Whoever works on the website's pages.

import { motion, useReducedMotion } from "motion/react";
import SplitWords from "./SplitWords.jsx";
import "./pagehero.css";

const EASE = [0.22, 1, 0.36, 1];

export default function PageHero({ eyebrow, title, lead, children }) {
  const reduced = useReducedMotion();
  return (
    <section className="page-hero">
      <div className="ph-grid" aria-hidden="true" />
      <div className="wrap">
        {eyebrow && (
          <motion.div className="eyebrow" initial={reduced ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            {eyebrow}
          </motion.div>
        )}
        <h1 className="h-1 ph-title">
          <SplitWords text={title} />
        </h1>
        {lead && (
          <motion.p className="lead" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.45 }}>
            {lead}
          </motion.p>
        )}
        {children && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.6 }} style={{ marginTop: 32 }}>
            {children}
          </motion.div>
        )}
      </div>
    </section>
  );
}
