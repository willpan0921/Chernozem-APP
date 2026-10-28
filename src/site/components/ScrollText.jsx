// WHAT THIS FILE DOES
// <ScrollText text="…" />: a big paragraph whose words light up one by one
// as the reader scrolls past it, as if being read aloud. Words wrapped in
// *stars* are highlighted in the accent colour. Under reduced motion the
// whole paragraph is lit.
//
// WHO EDITS IT
// Nobody, normally.

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

function Word({ progress, from, to, children, accent }) {
  const opacity = useTransform(progress, [from, to], [0.16, 1]);
  return (
    <motion.span className={accent ? "st-word st-accent" : "st-word"} style={{ opacity }}>
      {children}
    </motion.span>
  );
}

// Marks every word between a *opening and a closing* star as accented.
function markAccents(text) {
  let inside = false;
  return text.split(" ").map((word) => {
    const starts = word.startsWith("*");
    const ends = word.endsWith("*") && word.length > 1;
    const accent = inside || starts;
    if (starts) inside = true;
    if (ends) inside = false;
    return { text: word.replace(/\*/g, ""), accent };
  });
}

export default function ScrollText({ text, className = "" }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = markAccents(text);
  const n = words.length + 0.5;
  if (reduced) {
    return (
      <p ref={ref} className={`st ${className}`}>
        {words.map((word, i) => (
          <span key={i} className={word.accent ? "st-word st-accent" : "st-word"}>
            {word.text}{" "}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p ref={ref} className={`st ${className}`}>
      {words.map((word, i) => (
        <Word key={i} progress={scrollYProgress} from={i / n} to={Math.min(1, (i + 1.5) / n)} accent={word.accent}>
          {word.text}{" "}
        </Word>
      ))}
    </p>
  );
}
