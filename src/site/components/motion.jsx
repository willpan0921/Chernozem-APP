// WHAT THIS FILE DOES
// The small moving parts every website page is built from, all on the
// "motion" library (motion.dev):
//
//   <Reveal>          its children fade and rise into place when they scroll
//                     into view (delay, y and once can be set)
//   <Stagger>         a group whose children reveal one after another; wrap
//                     each child in <StaggerItem>
//   <CountUp to=…>    a number that counts up from 0 when it comes into view
//   <Spotlight>       a .card whose border glows where the cursor is
//   <Marquee>         a row that scrolls sideways forever (pauses on hover)
//   <TiltShot>        a picture that lies tilted in 3D and straightens as it
//                     scrolls up the screen
//   <Magnetic>        a button that leans slightly toward the cursor
//   useReducedMotion  true when the visitor asked for reduced motion; every
//                     part here then stands still
//
// WHO EDITS IT
// Whoever works on the website's motion. Keep every effect off under
// reduced motion.

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { formatInt } from "../content/site.js";

export { motion, useReducedMotion };

const EASE = [0.22, 1, 0.36, 1];

export function Reveal({ children, delay = 0, y = 28, once = true, className, as = "div", style, amount = 0.25 }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      className={className}
      style={style}
      initial={reduced ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, amount, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const staggerChild = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease: EASE } },
};

export function Stagger({ children, className, style, once = true, amount = 0.2, as = "div" }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      className={className}
      style={style}
      variants={staggerParent}
      initial={reduced ? false : "hidden"}
      whileInView="show"
      viewport={{ once, amount, margin: "0px 0px -40px 0px" }}
    >
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

// to: the final number. decimals: how many to show. format: a function from
// number to text (default: thousands separators). Counts for 1.6 s.
export function CountUp({ to, decimals = 0, format, duration = 1.6, className, prefix = "", suffix = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (!inView || reduced) return undefined;
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduced]);
  const shown = format ? format(value) : decimals ? value.toFixed(decimals) : formatInt(Math.round(value));
  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

// A .card that remembers where the cursor is (CSS reads --mx and --my).
export function Spotlight({ children, className = "", as = "div", ...rest }) {
  const Tag = as;
  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
  }
  return (
    <Tag className={`card ${className}`} onMouseMove={onMove} {...rest}>
      {children}
    </Tag>
  );
}

// children are shown twice so the loop is seamless. seconds: one full loop.
export function Marquee({ children, seconds = 40, className = "" }) {
  const reduced = useReducedMotion();
  return (
    <div className={`marquee ${className}`} style={{ "--marquee-s": `${seconds}s` }}>
      <div className="marquee-track">
        {children}
        {!reduced && (
          <span aria-hidden="true" style={{ display: "contents" }}>
            {children}
          </span>
        )}
      </div>
    </div>
  );
}

// A picture (any children) lying back at `angle` degrees that comes
// upright as it scrolls from the bottom of the screen to the middle.
export function TiltShot({ children, angle = 22, className = "", style }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [angle, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.5, 1]);
  return (
    <div ref={ref} className={className} style={{ perspective: 1400, ...style }}>
      <motion.div style={reduced ? undefined : { rotateX, scale, opacity, transformOrigin: "50% 100%" }}>{children}</motion.div>
    </div>
  );
}

// A wrapper whose contents lean a few pixels toward the cursor.
export function Magnetic({ children, strength = 0.25, className }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });
  function onMove(event) {
    if (reduced) return;
    const box = ref.current.getBoundingClientRect();
    x.set((event.clientX - (box.left + box.width / 2)) * strength);
    y.set((event.clientY - (box.top + box.height / 2)) * strength);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }
  return (
    <motion.div ref={ref} className={className} style={{ x: sx, y: sy, display: "inline-block" }} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </motion.div>
  );
}

// The arrow at the end of buttons and links.
export function Arrow() {
  return (
    <span className="btn-arrow" aria-hidden="true">
      →
    </span>
  );
}
