// WHAT THIS FILE DOES
// The website's home page (chernozem.app/): what Chernozem is, in order:
//   1. the hero: the headline over a moving satellite pass and the pin
//   2. a band of the crises and places it already reads
//   3. the problem, lit word by word as the reader scrolls
//   4. the two directions: Field (one farmer) and Atlas (a whole country)
//   5. the scroll story "from a pin to an atlas"
//   6. the gate: the live Ukraine demo of Near term and Post-crisis
//   7. the proof: its numbers against independent records
//   8. the satellites it reads
//   9. the founder's story, in one line
//  10. the invitation to open the app
//
// WHO EDITS IT
// Whoever works on the home page. Numbers come from src/site/content/site.js.

import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import HeroField from "../components/HeroField.jsx";
import SplitWords from "../components/SplitWords.jsx";
import ScrollText from "../components/ScrollText.jsx";
import PinStory from "../components/PinStory.jsx";
import DemoRanking from "../components/DemoRanking.jsx";
import ProofBars from "../components/ProofBars.jsx";
import Shot from "../components/Shot.jsx";
import { Arrow, CountUp, Magnetic, Marquee, Reveal, Spotlight, Stagger, StaggerItem } from "../components/motion.jsx";
import { Tractor, Landmark, Sprout, Radar, ShieldCheck, Flame, Waves, Sun, CloudRain, Crosshair, CheckCircle2 } from "../components/Icons.jsx";
import Logo from "../../components/ui/Logo.jsx";
import { DATASETS, NUMBERS, SITE, compactHa, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./home.css";

const EASE = [0.22, 1, 0.36, 1];

const CRISES = [
  { icon: Crosshair, label: "War" },
  { icon: Waves, label: "Flood" },
  { icon: Flame, label: "Wildfire" },
  { icon: Sun, label: "Drought" },
  { icon: CloudRain, label: "Storm" },
];

const PLACES = ["Ukraine", "Iowa", "Kenya", "Heilongjiang", "Buenos Aires", "Saskatchewan", "Kharkiv oblast", "Greece", "Bulgaria", "Pakistan"];

function Hero() {
  const reduced = useReducedMotion();
  const [landed, setLanded] = useState(false);
  const onLanded = useCallback(() => setLanded(true), []);
  const { scrollY } = useScroll();
  const fade = useTransform(scrollY, [0, 500], [1, 0]);
  const lift = useTransform(scrollY, [0, 500], [0, -60]);
  return (
    <section className="hero">
      <HeroField onLanded={onLanded} />
      <div className="hero-veil" aria-hidden="true" />
      <motion.div className="wrap hero-content" style={reduced ? undefined : { opacity: fade, y: lift }}>
        <motion.div className="hero-live" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}>
          <span className="hero-live-dot" aria-hidden="true" />
          Live · {NUMBERS.ukraineMonth} · {formatInt(NUMBERS.ukraineSquares)} squares of Ukraine read from space
        </motion.div>
        <h1 className="h-display hero-title">
          <SplitWords text="From a pin|to an *atlas*." delay={0.35} step={0.09} />
        </h1>
        <motion.p className="lead hero-lead" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}>
          Chernozem turns free satellite data into clear answers about farmland after war and disaster, anywhere on Earth. One app for the farmer with one field, and for the government planning a whole country&apos;s recovery.
        </motion.p>
        <motion.div className="btn-row hero-ctas" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 1.1 }}>
          <Magnetic>
            <Link to={SITE.appPath} className="btn btn-light btn-lg">
              Open the app <Arrow />
            </Link>
          </Magnetic>
          <a href="#gate" className="btn btn-ghost btn-ghost-light btn-lg">
            Try the live demo
          </a>
        </motion.div>
        <motion.ul className="hero-facts" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: landed ? 1 : 0 }} transition={{ duration: 0.8 }}>
          <li>
            <strong>Any place</strong> on Earth
          </li>
          <li>
            <strong>Any crisis:</strong> war, flood, fire, drought
          </li>
          <li>
            <strong>No hardware</strong> to install
          </li>
        </motion.ul>
      </motion.div>
      <motion.a href="#problem" className="hero-cue" aria-label="Scroll down" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
        <span />
      </motion.a>
    </section>
  );
}

function Band() {
  return (
    <div className="band" aria-label="Crises and places Chernozem reads">
      <Marquee seconds={46}>
        {CRISES.map(({ icon: Icon, label }) => (
          <span key={label} className="band-item band-crisis">
            <Icon size={16} /> {label}
          </span>
        ))}
        {PLACES.map((place) => (
          <span key={place} className="band-item">
            <i aria-hidden="true" /> {place}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

function Problem() {
  return (
    <section className="section problem" id="problem">
      <div className="wrap">
        <Reveal className="eyebrow">The problem</Reveal>
        <ScrollText
          className="problem-text"
          text={`Black soil, *chernozem,* is some of the most fertile ground on Earth. It covers about ${NUMBERS.blackSoilCroplandPercent}% of the world's cropland and has grown about ${NUMBERS.blackSoilWheatPercent}% of its wheat. When war or disaster tears it apart, *satellites* see it within days. The farmers who live on it rarely make the news, and when the headlines move on, they are *left to recover alone.*`}
        />
        <Stagger className="grid grid-4 problem-stats">
          <StaggerItem className="stat">
            <span className="stat-value">
              <CountUp to={NUMBERS.blackSoilCroplandPercent} suffix="%" />
            </span>
            <span className="stat-label">of the world&apos;s cropland is black soil</span>
          </StaggerItem>
          <StaggerItem className="stat">
            <span className="stat-value">
              <CountUp to={NUMBERS.blackSoilWheatPercent} suffix="%" />
            </span>
            <span className="stat-label">of the world&apos;s wheat has grown on it</span>
          </StaggerItem>
          <StaggerItem className="stat">
            <span className="stat-value">
              <CountUp to={NUMBERS.cratersHa / 1e6} decimals={2} suffix="M" />
            </span>
            <span className="stat-label">hectares of Ukrainian farmland scarred by war craters</span>
          </StaggerItem>
          <StaggerItem className="stat">
            <span className="stat-value">
              <CountUp to={NUMBERS.peopleFedMillions} suffix="M" />
            </span>
            <span className="stat-label">people a year fed by Ukraine&apos;s food exports before the war</span>
          </StaggerItem>
        </Stagger>
        <p className="source-note muted">Sources: FAO, Global status of black soils (2022); FAO on Ukraine&apos;s farmland (2025); World Food Programme.</p>
      </div>
    </section>
  );
}

function Directions() {
  return (
    <section className="section section-cream-2 directions">
      <div className="wrap">
        <div className="directions-head">
          <Reveal className="eyebrow">Two products, one app</Reveal>
          <h2 className="h-1">
            <SplitWords text="Recovery has to come from *both* directions." inView delay={0} step={0.05} />
          </h2>
        </div>
        <div className="grid grid-2 directions-grid">
          <Reveal>
            <Spotlight className="dir-card">
              <div className="dir-top">
                <span className="card-icon">
                  <Tractor size={22} />
                </span>
                <span className="dir-tag">Bottom up · for farmers</span>
              </div>
              <h3 className="dir-name">
                Chernozem <em>Field</em>
              </h3>
              <p className="card-text">Every field traced, named and watched. Water, plant health, stress and harvest readiness, each against that field&apos;s own normal; the crop identified; stress caught one to two weeks early; pests forecast from the weather.</p>
              <div className="dir-shot">
                <Shot name="field-fields" url="chernozem.app/field/fields" alt="Chernozem Field: a farm's fields on satellite imagery with one field's readings" />
              </div>
              <Link to="/product#field" className="text-link">
                Explore Field <Arrow />
              </Link>
            </Spotlight>
          </Reveal>
          <Reveal delay={0.12}>
            <Spotlight className="dir-card card-dark">
              <div className="dir-top">
                <span className="card-icon">
                  <Landmark size={22} />
                </span>
                <span className="dir-tag">Top down · for governments and NGOs</span>
              </div>
              <h3 className="dir-name">
                Chernozem <em>Atlas</em>
              </h3>
              <p className="card-text">A whole country, square by square, every month: what the soil is worth, how hard it was hit, and whether anyone can safely reach it. Then a ranking of where recovery should start, and what a budget covers.</p>
              <div className="dir-shot">
                <Shot name="atlas-map-near-macro" url="chernozem.app/atlas/map" alt="Chernozem Atlas: Ukraine's oblasts ranked by recovery priority" />
              </div>
              <Link to="/product#atlas" className="text-link">
                Explore Atlas <Arrow />
              </Link>
            </Spotlight>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="section story-scroll">
      <div className="wrap">
        <div className="story-head">
          <Reveal className="eyebrow">How it works</Reveal>
          <h2 className="h-1">
            <SplitWords text="One pin. Then a whole *country.*" inView delay={0} step={0.05} />
          </h2>
        </div>
        <PinStory />
      </div>
    </section>
  );
}

function Gate() {
  return (
    <section className="section gate" id="gate">
      <div className="wrap">
        <div className="gate-head">
          <div>
            <Reveal className="eyebrow">Gated aggregation · the research inside</Reveal>
            <h2 className="h-1">
              <SplitWords text="Not every field can be reached *yet.*" inView delay={0} step={0.05} />
            </h2>
          </div>
          <Reveal delay={0.1}>
            <p className="lead">
              During a war, the most damaged land is often the land no one can enter. Chernozem&apos;s ranking comes from William Pan&apos;s research: in the <strong>near term</strong> it leaves out the least reachable land before ranking the rest; <strong>post-crisis</strong>, it brings that land back. Switch between them on Ukraine&apos;s real numbers.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <DemoRanking />
        </Reveal>
        <Stagger className="grid grid-3 gate-cards">
          {[
            { k: "Value", c: "value", q: "Is this soil worth restoring?", t: "Black soil and cropland, from global soil maps and 10 m land cover." },
            { k: "Damage", c: "damage", q: "How hard was it hit?", t: "Fires above each place's normal years, and lasting change seen by radar." },
            { k: "Feasibility", c: "access", q: "Can people safely reach it?", t: "Distance to recorded fighting, or to fires that look like fighting." },
          ].map((item) => (
            <StaggerItem key={item.k}>
              <div className={`gate-card gate-${item.c}`}>
                <span className="gate-card-k">{item.k}</span>
                <h3 className="h-3">{item.q}</h3>
                <p className="card-text">{item.t}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="gate-more">
          <Link to="/method" className="text-link">
            How the gate works, with the formulas <Arrow />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section className="section section-dark proof">
      <div className="wrap">
        <div className="split proof-split">
          <div>
            <Reveal className="eyebrow">Checked against the real world</Reveal>
            <h2 className="h-1">
              <SplitWords text="A map is only useful if it is *right.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">Ground samples are impossible inside a war zone, which is exactly why Chernozem works from space. So every method is checked against independent records it never saw: Copernicus flood maps, official burn areas, USDA crop data and the ACLED conflict record.</p>
            </Reveal>
            <Stagger className="grid grid-2 proof-stats">
              <StaggerItem className="stat">
                <span className="stat-value">
                  ρ <CountUp to={NUMBERS.acledCorrelation} decimals={2} />
                </span>
                <span className="stat-label">radar damage against {formatInt(NUMBERS.acledEvents)} recorded explosions</span>
              </StaggerItem>
              <StaggerItem className="stat">
                <span className="stat-value">
                  <CountUp to={NUMBERS.falseAlarmPercent} decimals={1} prefix="≤" suffix="%" />
                </span>
                <span className="stat-label">false damage in the same places in normal years</span>
              </StaggerItem>
              <StaggerItem className="stat">
                <span className="stat-value">
                  <CountUp to={NUMBERS.mapePercent} decimals={1} suffix="%" />
                </span>
                <span className="stat-label">mean error in mapped area against Copernicus flood and fire maps</span>
              </StaggerItem>
              <StaggerItem className="stat">
                <span className="stat-value">
                  <CountUp to={NUMBERS.automatedTests} />
                </span>
                <span className="stat-label">automated tests run on every change</span>
              </StaggerItem>
            </Stagger>
          </div>
          <Reveal delay={0.15}>
            <ProofBars />
            <Link to="/technology#reliability" className="text-link proof-link">
              All the checks, and where it reads low <Arrow />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Satellites() {
  return (
    <section className="section-tight satellites">
      <div className="wrap satellites-head">
        <Reveal className="eyebrow">What it reads</Reveal>
        <Reveal>
          <p className="lead">Fifteen datasets from ESA, NASA, the FAO and others: public satellite and map data processed in Google Earth Engine, plus weather and, when a team provides one, a conflict record. None of it was easy to use until now.</p>
        </Reveal>
      </div>
      <Marquee seconds={70}>
        {DATASETS.map((d) => (
          <div key={d.name} className="sat-card">
            <span className="sat-role">{d.role}</span>
            <strong>{d.name}</strong>
            <span className="sat-what">{d.what}</span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}

function Founder() {
  const reduced = useReducedMotion();
  return (
    <section className="section founder">
      <div className="wrap">
        <div className="split">
          <Reveal className="founder-art">
            <div className="founder-pin">
              <motion.div animate={reduced ? undefined : { y: [0, -12, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
                <Logo size={200} />
              </motion.div>
              <div className="founder-route" aria-hidden="true">
                <svg viewBox="0 0 320 90">
                  <motion.path d="M10 70 C 80 10, 150 10, 160 45 S 260 85, 310 25" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: "easeInOut" }} />
                  <circle cx="10" cy="70" r="5" />
                  <circle cx="160" cy="45" r="5" />
                  <circle cx="310" cy="25" r="5" />
                </svg>
                <div className="founder-route-labels">
                  <span>Northeast China</span>
                  <span>Ukraine</span>
                  <span>Anywhere</span>
                </div>
              </div>
            </div>
          </Reveal>
          <div>
            <Reveal className="eyebrow">Why it exists</Reveal>
            <Reveal>
              <blockquote className="founder-quote">&ldquo;There is a meal in my family that no one was supposed to survive.&rdquo;</blockquote>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="lead">After the Sino-Japanese War, William Pan&apos;s great-grandparents, farmers on the black soil of northeastern China, were starving. They survived, and in time that same soil fed them back to life. Today war is tearing up the same kind of soil in Ukraine. Chernozem is his answer: so that one family&apos;s story does not become another&apos;s.</p>
            </Reveal>
            <Reveal delay={0.2} className="btn-row founder-ctas">
              <Link to="/story" className="btn btn-primary">
                Read the founding story <Arrow />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  const reduced = useReducedMotion();
  return (
    <section className="section-tight cta-wrap">
      <div className="wrap">
        <Reveal>
          <div className="callout cta">
            <div className="cta-squares" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.i
                  key={i}
                  animate={reduced ? undefined : { opacity: [0.15, 0.8, 0.15] }}
                  transition={{ duration: 3 + (i % 5) * 0.6, repeat: Infinity, delay: (i * 0.37) % 3, ease: "easeInOut" }}
                />
              ))}
            </div>
            <div className="cta-body">
              <h2 className="h-1">See your land from space.</h2>
              <p className="lead">Open Chernozem with your access code, or ask for one. Farmers, ministries, NGOs, researchers and investors are all welcome.</p>
              <div className="btn-row">
                <Magnetic>
                  <Link to={SITE.appPath} className="btn btn-light btn-lg">
                    Open the app <Arrow />
                  </Link>
                </Magnetic>
                <Link to="/contact" className="btn btn-ghost btn-ghost-light btn-lg">
                  Request access
                </Link>
              </div>
              <ul className="cta-points">
                <li>
                  <CheckCircle2 size={16} /> Works on a phone
                </li>
                <li>
                  <ShieldCheck size={16} /> Never declares land safe
                </li>
                <li>
                  <Radar size={16} /> Updated as the satellites pass
                </li>
                <li>
                  <Sprout size={16} /> {compactHa(NUMBERS.heavyDamageHa)} ha of damage mapped in Ukraine
                </li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  usePageTitle(null);
  return (
    <>
      <Hero />
      <Band />
      <Problem />
      <Directions />
      <Story />
      <Gate />
      <Proof />
      <Satellites />
      <Founder />
      <Cta />
    </>
  );
}
