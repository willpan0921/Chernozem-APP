// WHAT THIS FILE DOES
// The moving picture behind the home page's headline: a plane of map
// squares, like the Atlas, lying back in perspective. A satellite "pass"
// sweeps across it and colours the squares in as it goes (greens for
// priority, a few terracotta patches of damage, dark squares with no
// reading), the pin drops onto the plane and sends a ripple out, and after
// that the plane breathes quietly, re-swept every so often. The plane
// leans a few degrees toward the cursor.
//
// Everything is drawn on one canvas (the squares, the sweep, the ripple);
// the pin is the logo standing upright on the plane, in real 3D. Under
// reduced motion the finished plane is drawn once and nothing moves.
//
// WHO EDITS IT
// Whoever works on the home page's hero. The colours are the website's
// palette (src/site/site.css) and the app's priority greens.

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { LOGO_SRC } from "../../components/ui/Logo.jsx";

const TILT = 58; // degrees the plane lies back
const PITCH = 30; // one square plus its gap, in CSS pixels on the plane
const SQUARE = 25;
const GREENS = ["#dbe4cb", "#b8cb9f", "#8aa876", "#4f9a5a", "#2e6b3a"];
const REDS = ["#e6976d", "#c9693c", "#8e2c1a"];
const NODATA = "rgba(243, 238, 227, 0.045)";
const SWEEP_SECONDS = 6.5; // the first pass, left to right
const RESWEEP_EVERY = 15; // seconds between later passes
const PIN_AT = { x: 0.56, y: 0.5 }; // where the pin lands, as a share of the plane
const PIN_DROP_AT = 1.9; // seconds after start

// Value noise: smooth random hills between 0 and 1, so the squares form
// patches rather than static.
function makeNoise(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h ^= h >> 16;
    return ((h >>> 0) % 10000) / 10000;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = hash(x0, y0);
    const b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1);
    const d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// The squares of a plane w by h pixels: colour, a random phase for the
// breathing, and the position of each.
function buildCells(w, h) {
  const noise = makeNoise(7);
  const noise2 = makeNoise(31);
  const damage = makeNoise(101);
  const cols = Math.ceil(w / PITCH) + 1;
  const rows = Math.ceil(h / PITCH) + 1;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const n = 0.65 * noise(c / 6.5, r / 6.5) + 0.35 * noise2(c / 2.6, r / 2.6);
      // Damage sits mostly to the right, like the east of a country at war.
      const east = Math.max(0, (c / cols - 0.55) / 0.45);
      const d = damage(c / 3.4, r / 3.4) * (0.35 + 0.65 * east);
      let color;
      if (n < 0.22) color = NODATA;
      else if (d > 0.58) color = REDS[Math.min(2, Math.floor((d - 0.58) / 0.14))];
      else color = GREENS[Math.min(4, Math.floor(((n - 0.22) / 0.78) * 5))];
      cells.push({ x: c * PITCH, y: r * PITCH, color, nodata: color === NODATA, phase: (c * 7 + r * 13) % 100 / 100 });
    }
  }
  return cells;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default function HeroField({ onLanded }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const reduced = useReducedMotion();

  // The lean toward the cursor.
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 60, damping: 20, mass: 0.8 });
  const sy = useSpring(my, { stiffness: 60, damping: 20, mass: 0.8 });
  const rotateX = useTransform(sy, [0, 1], [TILT + 4, TILT - 4]);
  const rotateY = useTransform(sx, [0, 1], [-7, 7]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    const ctx = canvas.getContext("2d");
    let cells = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let frame = 0;
    let start = performance.now();
    let visible = true;
    let landed = false;

    function resize() {
      const box = stage.getBoundingClientRect();
      // The plane is wider and taller than the stage, so its edges never
      // show while it leans.
      w = Math.max(320, Math.round(box.width * 1.5));
      h = Math.max(300, Math.round(box.height * 1.7));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      cells = buildCells(w, h);
    }

    function draw(now) {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Where the first pass has reached (0 before it starts, >1 once done),
      // and where the later, lighter passes are.
      const sweep = reduced ? 2 : easeInOut(clamp01(t / SWEEP_SECONDS)) * 1.25 - 0.1;
      const sweepX = sweep * w;
      const later = t > SWEEP_SECONDS + 2 ? ((t - SWEEP_SECONDS - 2) % RESWEEP_EVERY) / 5 : -1;
      const laterX = later >= 0 && later <= 1 ? later * 1.2 * w - 0.1 * w : null;

      const px = PIN_AT.x * w;
      const py = PIN_AT.y * h;
      const sinceLand = t - (PIN_DROP_AT + 0.55);

      for (const cell of cells) {
        // Revealed by the pass, with a short easing band behind the line.
        const reveal = reduced ? 1 : clamp01((sweepX - cell.x) / 140);
        if (reveal <= 0) continue;
        const breathe = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 1.1 + cell.phase * 6.283);
        let alpha = reveal * (cell.nodata ? 1 : 0.55 + 0.45 * breathe);
        let size = SQUARE * (0.55 + 0.45 * reveal);
        // The later pass lifts the squares it crosses a little.
        if (laterX !== null && !cell.nodata) {
          const dist = Math.abs(cell.x - laterX);
          if (dist < 160) alpha = Math.min(1, alpha + 0.35 * (1 - dist / 160));
        }
        // The ripple from the pin: a ring that widens for 2 s after it lands.
        if (sinceLand > 0 && sinceLand < 2.2 && !cell.nodata) {
          const ring = sinceLand * 260;
          const dist = Math.hypot(cell.x - px, cell.y - py);
          const near = Math.abs(dist - ring);
          if (near < 70) {
            const lift = (1 - near / 70) * (1 - sinceLand / 2.2);
            alpha = Math.min(1, alpha + 0.5 * lift);
            size += 4 * lift;
          }
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = cell.color;
        const inset = (PITCH - size) / 2;
        ctx.fillRect(cell.x + inset, cell.y + inset, size, size);
      }
      ctx.globalAlpha = 1;

      // The pass itself: a soft band with a bright leading edge.
      function band(x, strength) {
        if (x < -200 || x > w + 200) return;
        const grad = ctx.createLinearGradient(x - 220, 0, x, 0);
        grad.addColorStop(0, "rgba(184, 203, 159, 0)");
        grad.addColorStop(1, `rgba(184, 203, 159, ${0.22 * strength})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x - 220, 0, 220, h);
        ctx.fillStyle = `rgba(243, 238, 227, ${0.8 * strength})`;
        ctx.fillRect(x, 0, 2, h);
      }
      if (!reduced) {
        if (sweep > -0.1 && sweep < 1.15) band(sweepX, 1);
        if (laterX !== null) band(laterX, 0.45);
      }

      // The pin's shadow on the plane, once it has landed.
      if (reduced || sinceLand > -0.1) {
        const grow = reduced ? 1 : clamp01((sinceLand + 0.1) / 0.3);
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 70 * grow);
        grad.addColorStop(0, "rgba(0, 0, 0, 0.55)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(px, py, 70 * grow, 34 * grow, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!landed && !reduced && sinceLand > 0) {
          landed = true;
          onLanded?.();
        }
      }

      if (!reduced && visible) frame = requestAnimationFrame(draw);
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now());
    });
    observer.observe(stage);

    // Only animate while the hero is on screen and the tab is in front.
    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduced) frame = requestAnimationFrame(draw);
    });
    io.observe(stage);
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else if (!reduced && visible) {
        frame = requestAnimationFrame(draw);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) {
      draw(performance.now());
      landed = true;
      onLanded?.();
    } else {
      start = performance.now();
      frame = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, onLanded]);

  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - box.left) / box.width);
    my.set((event.clientY - box.top) / box.height);
  }

  function onLeave() {
    mx.set(0.5);
    my.set(0.5);
  }

  return (
    <div className="hero-stage" ref={stageRef} onMouseMove={reduced ? undefined : onMove} onMouseLeave={onLeave} aria-hidden="true">
      <motion.div className="hero-plane" style={reduced ? { rotateX: TILT } : { rotateX, rotateY }}>
        <canvas ref={canvasRef} className="hero-canvas" />
        <div className="hero-pin-anchor" style={{ left: `${PIN_AT.x * 100}%`, top: `${PIN_AT.y * 100}%` }}>
          <motion.img
            className="hero-pin"
            src={LOGO_SRC}
            alt=""
            draggable="false"
            initial={reduced ? false : { y: -420, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: PIN_DROP_AT, type: "spring", stiffness: 120, damping: 14, mass: 1.1 }}
          />
        </div>
      </motion.div>
    </div>
  );
}
