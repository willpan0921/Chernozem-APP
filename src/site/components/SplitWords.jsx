// WHAT THIS FILE DOES
// <SplitWords text="From a pin to an *atlas*." />: a headline whose words
// rise into place one after another, each from behind its own edge. Words
// wrapped in *stars* are set in italics. Put <br/> breaks in with "|".
// Under reduced motion the words are simply there.
//
// WHO EDITS IT
// Nobody, normally.

import { Fragment, useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1];

export default function SplitWords({
  text,
  delay = 0.1,
  step = 0.06,
  inView = false,
}) {
  const reduced = useReducedMotion();
  // In-view headlines: the words start hidden below their clipped boxes,
  // so the boxes (not the words) are watched; once the headline is on
  // screen every word rises.
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const lines = text.split("|");
  let index = 0;
  let inside = false;
  return (
    <span ref={ref} className="sw">
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {line
            .trim()
            .split(" ")
            .map((word, wordIndex, words) => {
              const starts = word.startsWith("*");
              const ends = word.endsWith("*") && word.length > 1;
              const italic = inside || starts;
              if (starts) inside = true;
              if (ends) inside = false;
              const clean = word.replace(/\*/g, "");
              const i = index;
              index += 1;
              const motionProps = reduced
                ? {}
                : inView
                  ? {
                      initial: { y: "110%" },
                      animate: { y: seen ? "0%" : "110%" },
                    }
                  : { initial: { y: "110%" }, animate: { y: "0%" } };
              // The space sits between the clipped boxes, not inside one (a space
              // at the end of an inline-block is dropped by the browser).
              return (
                <Fragment key={`${word}-${wordIndex}`}>
                  <span className="ph-word">
                    <motion.span
                      className="ph-word-in"
                      {...motionProps}
                      transition={{
                        duration: 0.95,
                        ease: EASE,
                        delay: delay + i * step,
                      }}
                    >
                      {italic ? <em>{clean}</em> : clean}
                    </motion.span>
                  </span>
                  {wordIndex < words.length - 1 ? " " : ""}
                </Fragment>
              );
            })}
          {lineIndex < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </span>
  );
}
