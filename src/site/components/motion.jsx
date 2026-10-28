// WHAT THIS FILE DOES
// The small moving parts the website's pages share, on the "motion"
// library (motion.dev):
//
//   <Reveal>          its children rise into place when they scroll into
//                     view (delay, y and once can be set)
//   <Stagger>         a group whose children rise one after another; wrap
//                     each child in <StaggerItem>
//   useReducedMotion  true when the visitor asked for reduced motion; every
//                     part here then stands still, already in place
//
// Most of the home page's entrances are plain CSS instead (site.css,
// "Entrances", with the useReveal hook in hooks.js); these components are
// for the pages that prefer to write them in React.
//
// WHO EDITS IT
// Whoever works on the website's motion. Keep every effect off under
// reduced motion, and never hide content for good.

import { motion, useReducedMotion } from "motion/react";

export { motion, useReducedMotion };

const EASE = [0.16, 1, 0.3, 1];

export function Reveal({ children, delay = 0, y = 24, once = true, className, as = "div", style, amount = 0.2 }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      className={className}
      style={style}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const staggerChild = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function Stagger({ children, className, style, once = true, amount = 0.15, as = "div" }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag className={className} style={style} variants={staggerParent} initial={reduced ? false : "hidden"} whileInView="show" viewport={{ once, amount, margin: "0px 0px -8% 0px" }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, style, as = "div" }) {
  const Tag = motion[as] || motion.div;
  return (
    <Tag className={className} style={style} variants={staggerChild}>
      {children}
    </Tag>
  );
}
