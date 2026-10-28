// WHAT THIS FILE DOES
// The website's "Design" page (chernozem.app/design): how Chernozem was
// designed and why it looks the way it does, in order:
//   1. the hero: built to be understood in seconds, with a table of contents
//   2. the process: the real timeline from the research paper, through the
//      phone-first mockup and the Field / Atlas mockups, to the app online
//      (the dates are the repository's own history)
//   3. mockup to product: two before/after sliders, the mockup on one side
//      and the live app on the other
//   4. six principles, each a decision that can be found in the code
//   5. the logo, taken apart: the pin, the sky, the sun, the fields, the soil
//   6. colour and type: the palette (derived from the logo's colours and
//      tuned for the page) and the three fonts, with the stylesheets' values
//   7. the invitation to open the app or read the method
//
// WHO EDITS IT
// Whoever works on the website's Design page. Every fact here comes from
// the code, the docs or the git history; the colours are the real values
// from src/styles/tokens.css and src/site/site.css, which are derived from
// the logo's colours and lightened for the page, not read off the picture.

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animate, useInView } from "motion/react";
import PageHero from "../components/PageHero.jsx";
import SplitWords from "../components/SplitWords.jsx";
import { Arrow, Magnetic, Reveal, Spotlight, Stagger, StaggerItem, motion, useReducedMotion } from "../components/motion.jsx";
import { MessageSquare, SlidersHorizontal, Eye, Layers, Map, Sparkles, Quote, Smartphone, Landmark, Tractor } from "../components/Icons.jsx";
import Logo from "../../components/ui/Logo.jsx";
import { LINKS, NUMBERS, SITE, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

// The process, in the order it happened. Dates are from the repository's
// commits (git log) and docs/DEPLOY.md; the mockups are the PDFs the app
// was built from.
const PROCESS = [
  {
    when: "First, the research",
    title: "A question, then a paper",
    text: (
      <>
        Where should the recovery of war-damaged black soil begin? A year of research on Ukraine, supervised by Prof. Bo Zhao at the University of Washington&apos;s Humanistic GIS Lab, compared {NUMBERS.paperOperators} ways of combining soil value, damage and safe access. The design brief came out of it: whatever the app showed, it had to keep those three questions visible and let the reader weigh them.
      </>
    ),
  },
  {
    when: "The first mockup",
    title: "A phone, and one question",
    text: (
      <>
        The first design was a phone app around a single screen, <em>Check on your field</em>: drop a pin, type an address, or trace your field, and the app finds the soil type. Under it, a list of fields with their state in plain words (&ldquo;All good&rdquo;, &ldquo;2 to watch&rdquo;, &ldquo;Get it checked first&rdquo;). That list and those words survived every version since.
      </>
    ),
    figures: "phone",
  },
  {
    when: "The second mockups",
    title: "Two products, one sidebar",
    text: (
      <>
        A farmer needs one farm; a ministry needs a whole country. So the second round drew two products in one light sidebar app, switched with a Field / Atlas toggle at the top. Field opens on <em>My farm</em>: healthy, to watch, needs recovery, and a box to tell the app what happened. Atlas opens on a recovery overview with a Near term / Postwar switch, where to start, and next steps for the office.
      </>
    ),
    figures: "desktop",
  },
  {
    when: "11 October 2026",
    title: "Built from the mockups",
    text: (
      <>
        An earlier dark skeleton with photo backgrounds was dropped, and the app was rebuilt page by page from the two mockups, first on sample data. From that day every file has opened with a plain-English note, <em>WHAT THIS FILE DOES</em> and <em>WHO EDITS IT</em>, so teammates who do not code can still read the code.
      </>
    ),
  },
  {
    when: "15 to 18 October",
    title: "Real data, Atlas first",
    text: <>Real field outlines appeared on a satellite map. Then the Atlas was connected to Google Earth Engine for any area, and Field followed on the same day: every tile on screen became a measurement rather than a placeholder.</>,
  },
  {
    when: "19 to 20 October",
    title: "Anywhere on Earth",
    text: <>Ukraine became the case study instead of the limit. Growing seasons now follow each place&apos;s own calendar (north, south or tropics), war rules apply only where a war is listed or the team marks one, and every saved area updates itself every month.</>,
  },
  {
    when: "21 to 25 October",
    title: "Bigger maps, any crisis, a new pin",
    text: <>The side panels learned to resize and hide, and &ldquo;Satellite only&rdquo; clears the map. Floods, wildfires, droughts and storms joined wars. The Atlas gained states and regions, four map views, Feasibility, Post-crisis, and the Micro / Macro switch. The map-pin logo arrived.</>,
  },
  {
    when: "Late October",
    title: "Checked against the real world",
    text: (
      <>
        Flood and fire areas were compared with Copernicus emergency maps (a mean error of {NUMBERS.mapePercent}% in area) and the crop reading with the USDA Cropland Data Layer ({NUMBERS.cropLikelyPercent}% right on held-out fields when the app says &ldquo;likely&rdquo;). What read low was written down, not hidden.
      </>
    ),
  },
  {
    when: "27 October 2026",
    title: "Online",
    text: <>Chernozem went live at chernozem.app, one server on Render, with the mockups&apos; sidebar, tiles and time-frame switch still recognisable in the finished app.</>,
  },
];

// Six decisions, each with where it lives in the code.
const PRINCIPLES = [
  {
    icon: MessageSquare,
    title: "Plain words everywhere",
    text: "The screens say “Heavily damaged” and “left out for now”, never an index name. A “How it’s measured” link on the Fields page and the Atlas map opens the formula and the data behind every number. And each source file begins with WHAT THIS FILE DOES and WHO EDITS IT, written for teammates who do not program.",
    where: "src/components/field/HowMeasured.jsx",
  },
  {
    icon: SlidersHorizontal,
    title: "The user decides",
    text: "The weights are sliders. Near term has a Feasibility cutoff you can move; Post-crisis blends all three scores. Micro ranks every square, Macro every state. Four tabs, Priority, Value, Damage and Feasibility, colour the same map four ways. The app shows the evidence; the person doing the work makes the call.",
    where: "src/components/atlas/WeightsPanel.jsx",
  },
  {
    icon: Eye,
    title: "Honest states",
    text: "When something is not measured, the app says “Not measured” instead of inventing a number. A rule that failed its checks is marked “Provisional”. In a war where no fighting was found, the map says so rather than painting everything reachable. The AI’s rules begin: never say land is safe or cleared.",
    where: "server/ai/chat.js",
  },
  {
    icon: Layers,
    title: "Keep the map colourful",
    text: "Every state has its own look: five-step ramps for priority, value, damage and feasibility, hatching where there is no reading, a gold outline for “ready to harvest”, stubble lines over a harvested field. The legend is always complete. An honest map should never collapse into one grey.",
    where: "src/styles/tokens.css",
  },
  {
    icon: Map,
    title: "A map first",
    text: "The Field map is satellite imagery only, with the fields drawn over it and nothing else in the way. On both map pages the side panels can be dragged narrower or hidden with one tap, and “Satellite only” clears the squares, borders and key off the Atlas so the land itself can be seen.",
    where: "src/components/ui/PanelEdge.jsx",
  },
  {
    icon: Sparkles,
    title: "Gentle motion",
    text: "In the app, a transition lasts 0.12 to 0.15 seconds: enough to feel the change, never enough to wait for. This website moves more, because it tells a story, and every bit of that motion stops for anyone whose system asks for reduced motion.",
    where: "src/styles/components.css",
  },
];

// The logo's parts, top to bottom, each with the site token derived from
// that part's colour (site.css), not the picture's exact value.
const LOGO_PARTS = [
  { colour: "#1b3a1e", name: "A map pin", text: "A place on Earth. The app begins with the same gesture: drop a pin on your field." },
  { colour: "#f3eee3", name: "The cream wave", text: "The sky over the field, and the colour of this website’s pages.", light: true },
  { colour: "#c9693c", name: "The terracotta sun", text: "Warmth and the growing season. It is also the colour for damage and recovery." },
  { colour: "#8aa876", name: "Two greens", text: "Growing fields in sage and light sage: the crop the soil is for.", second: "#b8cb9f" },
  { colour: "#6b4a2b", name: "The brown layers", text: "The black soil’s horizons: the dark topsoil and the subsoil beneath it." },
];

const LOGO_COLOURS = [
  { name: "Dark green", hex: "#1b3a1e" },
  { name: "Sage", hex: "#8aa876" },
  { name: "Light sage", hex: "#b8cb9f" },
  { name: "Cream", hex: "#f3eee3" },
  { name: "Terracotta", hex: "#c9693c" },
  { name: "Brown", hex: "#6b4a2b" },
];

// The app's signal colours (src/styles/tokens.css).
const SIGNALS = [
  { name: "Green", hex: "#1f5c3a", role: "buttons, links, growing well" },
  { name: "Red", hex: "#b5452d", role: "damage, recovery, danger" },
  { name: "Amber", hex: "#e3a23a", role: "warnings, “to watch”" },
  { name: "Blue", hex: "#3b6fb6", role: "feasibility, safe access" },
];

// The priority ramp, lightest to darkest (--map-priority-1 to 5).
const PRIORITY = ["#e3ece2", "#b9d5bd", "#7fb08e", "#3f8159", "#1b4a31"];

function MockupFigure({ src, alt, caption, phone = false, width, height }) {
  return (
    <figure className={phone ? "dp-fig dp-fig-phone" : "dp-fig"}>
      <div className={phone ? "shot shot-phone" : "shot"}>
        {!phone && (
          <div className="shot-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>mockup</span>
          </div>
        )}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </div>
      <figcaption className="caption">{caption}</figcaption>
    </figure>
  );
}

// A before/after slider: the mockup under the handle's left, the app under
// its right. The picture itself takes the pointer: a mouse moves the handle
// at once; a finger only once it has moved further sideways than up or
// down, so a scroll that starts on the picture stays a scroll. The range
// input stays for the keyboard and screen readers (it takes no pointer
// events, see pages.css). The handle nudges once when the picture first
// comes into view, to show that it moves.
function Compare({ before, after, beforeAlt, afterAlt, label }) {
  const [pos, setPos] = useState(50);
  const ref = useRef(null);
  const drag = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const id = useId();
  useEffect(() => {
    if (!inView || reduced) return undefined;
    const controls = animate(50, [50, 62, 50], { duration: 1.6, ease: "easeInOut", delay: 0.3, onUpdate: (v) => setPos(v) });
    return () => controls.stop();
  }, [inView, reduced]);

  function moveTo(clientX) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    setPos(Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100)));
  }
  // Keeps the pointer's events coming to the picture even once the finger
  // or the mouse has left it; a pointer that is already gone is ignored.
  function hold(target, pointerId) {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* the pointer is no longer active */
    }
  }
  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const active = event.pointerType === "mouse";
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active };
    if (!active) return;
    hold(event.currentTarget, event.pointerId);
    moveTo(event.clientX);
  }
  function onPointerMove(event) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (!d.active) {
      const dx = Math.abs(event.clientX - d.x);
      const dy = Math.abs(event.clientY - d.y);
      if (dx < 4 || dx <= dy) return;
      d.active = true;
      hold(event.currentTarget, event.pointerId);
    }
    moveTo(event.clientX);
  }
  function onPointerEnd(event) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div ref={ref} className="compare dp-compare" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <img className="compare-before" src={before} alt={beforeAlt} loading="lazy" decoding="async" />
      <div className="compare-after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <img src={after} alt={afterAlt} loading="lazy" decoding="async" />
      </div>
      <div className="compare-handle" style={{ left: `${pos}%` }} aria-hidden="true">
        <span className="compare-knob">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7 4 12l5 5M15 7l5 5-5 5" />
          </svg>
        </span>
      </div>
      <span className="compare-label is-left" aria-hidden="true">
        Mockup
      </span>
      <span className="compare-label is-right" aria-hidden="true">
        The app
      </span>
      <input
        id={id}
        type="range"
        className="compare-range"
        min="0"
        max="100"
        step="1"
        value={Math.round(pos)}
        onChange={(event) => setPos(Number(event.target.value))}
        aria-label={`${label}: slide between the mockup and the app`}
        aria-valuetext={`${Math.round(pos)}% mockup, ${100 - Math.round(pos)}% app`}
      />
    </div>
  );
}

function Hero() {
  return (
    <PageHero eyebrow="Design process" title="Designed to be understood in *seconds.*" lead="Chernozem is built for a farmer on a phone in a field, and for a minister with ten minutes before a meeting. It follows humanistic GIS: the map serves the person reading it. So every number comes with plain words, the map gets the most room on the screen, and the decisions stay with the user.">
      <nav className="toc" aria-label="On this page">
        <a href="#process">Process</a>
        <a href="#compare">Mockup to product</a>
        <a href="#principles">Principles</a>
        <a href="#logo">The logo</a>
        <a href="#colour">Colour and type</a>
      </nav>
    </PageHero>
  );
}

function Process() {
  return (
    <section className="section anchor" id="process">
      <div className="wrap">
        <div className="dp-process">
          <div className="dp-process-intro">
            <Reveal className="eyebrow">The process</Reveal>
            <h2 className="h-1">
              <SplitWords text="From a paper to a *product.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead" style={{ marginTop: 18 }}>
                Research first, then a mockup, then another, then code. The dates are the repository&apos;s own history, and the three mockups below are the ones the app was built from.
              </p>
            </Reveal>
            <Reveal delay={0.15} className="dp-process-side">
              <span className="chip">
                <Smartphone size={14} /> One phone-first mockup
              </span>
              <span className="chip">
                <Tractor size={14} /> Field mockup
              </span>
              <span className="chip">
                <Landmark size={14} /> Atlas mockup
              </span>
            </Reveal>
          </div>
          <Stagger as="ol" className="timeline dp-timeline" amount={0.05}>
            {PROCESS.map((step) => (
              <StaggerItem key={step.title} as="li" className="timeline-item dp-step">
                <div className="timeline-when">{step.when}</div>
                <h3 className="h-3">{step.title}</h3>
                <p className="dp-step-text">{step.text}</p>
                {step.figures === "phone" && (
                  <div className="dp-figs">
                    <MockupFigure phone src="/site/design/mockup-v1-phone.webp" width={560} height={1212} alt="The first mockup: a phone screen titled Check on your field, with an address box, Use my location and Trace on map buttons, and a list of four fields with their state" caption="Mockup, first version: a phone app around one screen." />
                  </div>
                )}
                {step.figures === "desktop" && (
                  <div className="dp-figs dp-figs-2">
                    <MockupFigure src="/site/design/mockup-field.webp" width={1200} height={1552} alt="The Field mockup: a light sidebar, My farm with healthy, to watch and needs recovery tiles, Field 7 needs recovery with two recovery paths, and a Tell us what happened box" caption="Mockup, second version: Chernozem Field." />
                    <MockupFigure src="/site/design/mockup-atlas.webp" width={1200} height={1552} alt="The Atlas mockup: Recovery overview for Ukraine with a Near term and Postwar switch, headline hectares, a grid of regions titled Where to start, the top five, next steps and alerts" caption="Mockup, second version: Chernozem Atlas." />
                  </div>
                )}
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

function CompareSection() {
  return (
    <section className="section section-dark anchor" id="compare">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Mockup to product</Reveal>
          <h2 className="h-1">
            <SplitWords text="Drawn first. Then *built.*" inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">Drag the handle, or use the arrow keys. The mockup is on the left, the live app on the right. The sidebar, the tiles and the time-frame switch all survived; the invented numbers became {NUMBERS.ukraineMonth}&apos;s real ones, read from {formatInt(NUMBERS.ukraineSquares)} squares of Ukraine.</p>
          </Reveal>
        </div>
        <div className="grid grid-2 dp-compare-grid">
          <Reveal>
            <Compare label="Atlas" before="/site/design/mockup-atlas.webp" after="/site/shots/atlas-overview.webp" beforeAlt="The Atlas mockup: Recovery overview for Ukraine" afterAlt="The live Atlas overview: Ukraine, September 2026, with the priority map" />
            <p className="caption">
              <strong>Atlas.</strong> The mockup&apos;s grid of region squares became a real map; its sample totals became Earth Engine&apos;s.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <Compare label="Field" before="/site/design/mockup-field.webp" after="/site/shots/field-overview.webp" beforeAlt="The Field mockup: My farm" afterAlt="The live Field overview: a 12-field demo farm read from Sentinel-2" />
            <p className="caption">
              <strong>Field.</strong> The tiles and &ldquo;Tell us what happened&rdquo; kept their place; the field list is now coloured by what the satellite saw.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section className="section section-cream-2 anchor" id="principles">
      <div className="wrap">
        <div className="dp-principles-head">
          <div>
            <Reveal className="eyebrow">Principles</Reveal>
            <h2 className="h-1">
              <SplitWords text="Six decisions you can *see.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead" style={{ marginTop: 18 }}>
                None of these is a slogan. Each is a choice that sits in a file, with the file named so you can check.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <blockquote className="dp-quote">
              <Quote size={22} aria-hidden="true" />
              <p>Give as much autonomy to the users as possible.</p>
              <footer>William Pan, the founder</footer>
            </blockquote>
          </Reveal>
        </div>
        <Stagger className="grid grid-3 dp-principles">
          {PRINCIPLES.map(({ icon: Icon, title, text, where }) => (
            <StaggerItem key={title}>
              <Spotlight className="dp-principle">
                <span className="card-icon">
                  <Icon size={22} />
                </span>
                <h3 className="card-title">{title}</h3>
                <p className="card-text">{text}</p>
                <span className="dp-where mono">{where}</span>
              </Spotlight>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function LogoSection() {
  const reduced = useReducedMotion();
  return (
    <section className="section anchor" id="logo">
      <div className="wrap">
        <div className="logo-anatomy dp-logo-anatomy">
          <Reveal className="logo-layers dp-logo-stage" y={40}>
            <motion.div animate={reduced ? undefined : { y: [0, -14, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
              <Logo size={220} label="The Chernozem logo: a map pin filled with a cream sky, a terracotta sun, two green fields and brown soil layers" />
            </motion.div>
            <motion.span className="dp-logo-shadow" aria-hidden="true" animate={reduced ? undefined : { scaleX: [1, 0.82, 1], opacity: [0.35, 0.2, 0.35] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
          </Reveal>
          <div>
            <Reveal className="eyebrow">The logo</Reveal>
            <h2 className="h-1">
              <SplitWords text="A pin, a sky, and the *soil* under it." inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead" style={{ marginTop: 18 }}>
                The pin is the app&apos;s first gesture and its whole story: a place on Earth, and what lies under it. It arrived with the October 2026 polish and sits in the sidebar, on the access-code screen, as the AI&apos;s avatar and in the browser tab.
              </p>
            </Reveal>
            <Stagger className="logo-parts dp-logo-parts">
              {LOGO_PARTS.map((part) => (
                <StaggerItem key={part.name} className="logo-part">
                  <i style={{ background: part.second ? `linear-gradient(135deg, ${part.colour} 50%, ${part.second} 50%)` : part.colour, boxShadow: part.light ? "inset 0 0 0 1px rgba(23, 19, 15, 0.15)" : undefined }} aria-hidden="true" />
                  <div>
                    <strong>{part.name}</strong>
                    <span className="dp-part-text">{part.text}</span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </div>
    </section>
  );
}

function ColourAndType() {
  return (
    <section className="section section-cream-2 anchor" id="colour">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Colour and type</Reveal>
          <h2 className="h-1">
            <SplitWords text="Derived from the logo, *spent* carefully." inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">The website&apos;s six colours are derived from the logo&apos;s colours and tuned for the page: its dark green, two sages, cream, terracotta and brown as they are set in site.css, not read off the picture. The app keeps to four signal colours, so that red always means damage and blue always means safe access, and colours its maps with five-step ramps. Every value here is the one in the stylesheets.</p>
          </Reveal>
        </div>

        <Reveal>
          <h3 className="dp-sub">Derived from the logo (site.css)</h3>
        </Reveal>
        <Stagger className="palette">
          {LOGO_COLOURS.map((c) => (
            <StaggerItem key={c.hex} className="swatch">
              <i style={{ background: c.hex }} aria-hidden="true" />
              <div>
                <b>{c.name}</b>
                <span>{c.hex}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="grid grid-2 dp-colour-row">
          <div>
            <Reveal>
              <h3 className="dp-sub">The app&apos;s four signals</h3>
            </Reveal>
            <Stagger className="palette dp-palette-4">
              {SIGNALS.map((c) => (
                <StaggerItem key={c.hex} className="swatch">
                  <i style={{ background: c.hex }} aria-hidden="true" />
                  <div>
                    <b>{c.name}</b>
                    <span>{c.hex}</span>
                    <small>{c.role}</small>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <div>
            <Reveal>
              <h3 className="dp-sub">Priority, lower to highest</h3>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="dp-ramp" role="img" aria-label="The priority ramp, five greens from very light to very dark">
                {PRIORITY.map((hex) => (
                  <div key={hex} className="dp-ramp-step">
                    <i style={{ background: hex }} />
                    <span className="mono">{hex}</span>
                  </div>
                ))}
              </div>
              <p className="caption">
                <span className="mono">--map-priority-1</span> to <span className="mono">5</span> in tokens.css: the same five steps colour the Atlas map, its legend and its score bars. Value is a yellow-green ramp, damage a red one and feasibility a blue one, so the four tabs never share a colour.
              </p>
            </Reveal>
          </div>
        </div>

        <Reveal className="dp-sub-gap">
          <h3 className="dp-sub">Three typefaces, three jobs</h3>
        </Reveal>
        <Stagger className="dp-type">
          <StaggerItem className="dp-type-row">
            <div className="dp-type-meta">
              <b>Fraunces</b>
              <span>The website&apos;s headlines</span>
              <span className="mono">site.css · --s-display</span>
            </div>
            <p className="dp-type-sample dp-type-display">
              From a pin to an <em>atlas.</em>
            </p>
          </StaggerItem>
          <StaggerItem className="dp-type-row">
            <div className="dp-type-meta">
              <b>Inter</b>
              <span>All the words, in the app and here</span>
              <span className="mono">tokens.css · --font-sans</span>
            </div>
            <p className="dp-type-sample dp-type-sans">1 field to watch · 1 growing well · 4 harvested · 6 fallow or grass</p>
          </StaggerItem>
          <StaggerItem className="dp-type-row">
            <div className="dp-type-meta">
              <b>JetBrains Mono</b>
              <span>Numbers that have to line up</span>
              <span className="mono">tokens.css · --font-mono</span>
            </div>
            <p className="dp-type-sample dp-type-mono">
              {formatInt(NUMBERS.heavyDamageHa)} ha · {formatInt(NUMBERS.peopleOnDamagedSoil)} people · {formatInt(NUMBERS.ukraineSquares)} squares
            </p>
          </StaggerItem>
        </Stagger>
        <Reveal>
          <p className="caption">All three come from Google Fonts, loaded once in index.html. Inter and JetBrains Mono are the app&apos;s; Fraunces is kept for this website, so the app itself stays plain.</p>
        </Reveal>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="section-tight dp-cta-wrap">
      <div className="wrap">
        <Reveal>
          <div className="callout dp-cta">
            <div>
              <h2 className="h-1">See it for yourself.</h2>
              <p className="lead">Open the app and move the sliders, or read how every number on the map is made.</p>
            </div>
            <div className="btn-row">
              <Magnetic>
                <Link to={SITE.atlasPath} className="btn btn-light btn-lg">
                  Open the app <Arrow />
                </Link>
              </Magnetic>
              <Link to="/method" className="btn btn-ghost btn-ghost-light btn-lg">
                Read the method
              </Link>
            </div>
            <p className="dp-cta-note">
              The research behind it is on{" "}
              <a href={LINKS.paper} target="_blank" rel="noreferrer">
                Harvard Dataverse
              </a>
              .
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function DesignPage() {
  usePageTitle("Design");
  return (
    <>
      <Hero />
      <Process />
      <CompareSection />
      <Principles />
      <LogoSection />
      <ColourAndType />
      <Cta />
    </>
  );
}
