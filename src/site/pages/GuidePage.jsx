// WHAT THIS FILE DOES
// The website's "How to use" page (chernozem.app/guide). Two walkthroughs,
// one for Field (a farm) and one for Atlas (a country), seven steps each:
// the steps are cards on one side and the real screenshot of the active
// step stays pinned on the other, changing as the reader clicks a card or
// scrolls one into the middle of the screen (on a phone the pinned picture
// is the phone shot where one exists, else a small copy of the desktop
// shot). Then the questions people ask, as an accordion, and the
// invitation to open the app.
//
// Every button and page name here is the one the app really uses
// (src/pages/field/*, src/pages/atlas/*, src/components/field/*,
// src/components/atlas/*); the update times come from server/scheduler.js
// and server/field/run.js; "not measured" from src/lib/atlas/overview.js;
// the shared workspace from docs/DEPLOY.md; the seasons from
// src/lib/season.js. Numbers come from src/site/content/site.js.
//
// WHO EDITS IT
// Whoever changes how the app is used. When a button is renamed in the
// app, rename it here too, so the words stay true.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import PageHero from "../components/PageHero.jsx";
import SplitWords from "../components/SplitWords.jsx";
import Shot from "../components/Shot.jsx";
import { Arrow, Magnetic, Reveal, Stagger, StaggerItem, motion, useReducedMotion } from "../components/motion.jsx";
import { Smartphone, MapPin, Wheat, Gauge, MessageSquare, Database, PenLine, Globe2, Clock, LayoutGrid, SlidersHorizontal, Crosshair, FileText, Users, ShieldCheck, Satellite, CheckCircle2 } from "../components/Icons.jsx";
import { DATASETS, NUMBERS, SITE } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const EASE = [0.22, 1, 0.36, 1];

// The two walkthroughs. "where" is the page (and the button) in the app;
// "shot" is the picture in public/site/shots/ that shows that step.
const PRODUCTS = [
  { id: "field", label: "Field" },
  { id: "atlas", label: "Atlas" },
];

const FIELD_STEPS = [
  {
    icon: Smartphone,
    where: "chernozem.app/field",
    title: "Open Chernozem and enter the access code",
    text: "Open chernozem.app/field on a phone or a computer. The first screen asks for the access code you were given; type it and press Enter. The farm opens on its Overview. Everyone with the code sees the same farm.",
    shot: "field-overview",
    url: "chernozem.app/field",
    alt: "The Field overview that opens after the access code: the farm's latest satellite pass, the field counts, the weather and the field list",
    phoneShot: "phone-field-overview",
    phoneAlt: "The Field overview on a phone: the farm's latest Sentinel-2 pass, the fields to watch, growing, harvested and fallow, the weather and what needs doing",
  },
  {
    icon: MapPin,
    where: "Settings · Change farm",
    title: "Set up the farm",
    text: `In Settings, press "Change farm". Search a village or town, paste the corners of your land under Coordinates, or Draw the boundary on the satellite map. Press "Find my fields": the fields are traced from the imagery for you, and the app analyses a ten-field farm in about ${NUMBERS.tenFieldsSeconds} seconds. Pick the ones that are yours and save.`,
    shot: "field-fields",
    url: "chernozem.app/field/fields",
    alt: "The farm's fields traced on satellite imagery, each outlined and tinted by its condition",
    phoneShot: "phone-field-fields",
    phoneAlt: "The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below",
  },
  {
    icon: Wheat,
    where: "Settings · the list of fields",
    title: "Name your fields and set the crop",
    text: "The fields are numbered from the north-west corner; click a name to rename it. The crop is detected from how each field grew over the last 18 months (\"Detected: Corn\"). If you know better, pick the crop from the list; choose the detected line again to go back.",
    shot: "field-settings",
    url: "chernozem.app/field/settings",
    alt: "The Field settings page: the farm card with its satellite map of the twelve traced fields, and the list of fields below it, each with its detected crop in a dropdown and its hectares",
  },
  {
    icon: Gauge,
    where: "Fields",
    title: "Read a field",
    text: "On Fields, tap a field on the map. Four tiles: Water, Plant health, Stress and Harvest readiness, each compared with that field's own normal years, then the \"Plant health this season\" chart against the normal. \"How it's measured\" explains every number.",
    shot: "field-fields-detail",
    url: "chernozem.app/field/fields",
    alt: "Field 11 up close: near-normal water, plant health above normal, stress under 1%, past peak greenness, and the season chart",
    phoneShot: "phone-field-fields",
    phoneAlt: "The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's four tiles below",
  },
  {
    icon: MessageSquare,
    where: "AI",
    title: "Ask the AI about any field",
    text: "Press \"Ask AI about\" a field under its tiles, or open AI. It answers from your farm only: every field's readings, the history since 2019, the weather and your reports. Try \"Which field needs attention first?\"",
    shot: "field-ai",
    url: "chernozem.app/field/ai",
    alt: "The Field AI chat before a question: what it is using and four suggested questions about the farm's real fields",
  },
  {
    icon: Database,
    where: "Data",
    title: "See every pass since 2019",
    text: "Data is the satellite record of one field, month by month since 2019, against the farm average, with the normal years shaded and the day the war began marked. Below it: this season's clear Sentinel-2 passes and the downloads (GeoJSON, CSV, GeoTIFF and a printable season report).",
    shot: "field-data",
    url: "chernozem.app/field/data",
    alt: "The Field data page: plant health for one field since 2019 with the invasion of 24 February 2022 marked, the passes table and the downloads",
  },
  {
    icon: PenLine,
    where: "Overview · Tell us what happened",
    title: "Report damage, and let it keep itself updated",
    text: "On the Overview, \"Tell us what happened\": fire, flood, hail, pests, other, or shelling where there is a war, with up to four photos. Send saves it and opens a chat about it. With \"Update automatically\" on (Settings), every field is read again as new satellite passes arrive.",
    shot: "field-overview",
    url: "chernozem.app/field",
    alt: "The Field overview, where the damage report lives under what needs doing",
    phoneShot: "phone-field-overview",
    phoneAlt: "The Field overview on a phone, where the damage report lives under what needs doing",
  },
];

const ATLAS_STEPS = [
  {
    icon: Globe2,
    where: "Map · Change area",
    title: "Choose an area",
    text: "Press \"Change area\". Search a country (with Earth Engine, a state or region too), type the corners or a north-south-east-west box under Coordinates, or Draw the shape on the map. Then press Analyze.",
    shot: "atlas-map-satellite",
    url: "chernozem.app/atlas/map",
    alt: "The Atlas map with 'Satellite only' on: satellite imagery of Ukraine and the Black Sea",
  },
  {
    icon: Clock,
    where: "Data",
    title: "Let it read the months",
    text: `Earth Engine reads the area square by square: about ${NUMBERS.ukraineMonthMinutes} minutes for one month of Ukraine, and the first run covers the last twelve months. Every month is saved, and every saved area is analysed again each month by itself.`,
    shot: "atlas-data",
    url: "chernozem.app/atlas/data",
    alt: "The Atlas data page: heavily damaged hectares month by month over twelve months, with the monthly table",
  },
  {
    icon: LayoutGrid,
    where: "Overview",
    title: "Start on the Overview",
    text: "\"Where to start\" is the map coloured by priority with the top areas listed. \"Next steps\" is a list your team ticks off. \"Alerts\" are this month's fires detected and radar change, place by place. The Budget line turns an amount in dollars into the hectares it covers.",
    shot: "atlas-overview",
    url: "chernozem.app/atlas",
    alt: "The Atlas overview for Ukraine: hectares analysed, black soil, heavy damage, people, the priority map, next steps and alerts",
    phoneShot: "phone-atlas-overview",
    phoneAlt: "The Atlas overview on a phone: Ukraine, September 2026, the headline figures and where to start",
  },
  {
    icon: SlidersHorizontal,
    where: "Map",
    title: "Work the map",
    text: `Switch between Near term and Post-crisis. Move the Value and Damage sliders; in Near term the Feasibility cutoff leaves out the least reachable land (${NUMBERS.gatePercentile}% to start). Micro shows every square, Macro whole states. The tabs show Priority, Value, Damage or Feasibility on their own.`,
    shot: "atlas-map-near-macro",
    url: "chernozem.app/atlas/map",
    alt: "The Atlas map of Ukraine by state in the near term, each state filled by its priority and ranked on the right",
    phoneShot: "phone-atlas-map",
    phoneAlt: "The Atlas map of Ukraine on a phone, coloured by near-term priority, with the weights and the top areas below the map",
  },
  {
    icon: Crosshair,
    where: "Map · one square",
    title: "Click a square or a state",
    text: "Its rank and its three scores, \"How it's measured\", the soil types read from Earth Engine, the hectares and the people living there, and a recovery-cost range. \"Ask AI\" opens a chat about that very place.",
    shot: "atlas-map-picked",
    url: "chernozem.app/atlas/map",
    alt: "One map square in Kharkiv picked: its rank, value, damage and feasibility scores, soil types, hectares, people and recovery cost",
  },
  {
    icon: FileText,
    where: "Report",
    title: "Make the donor report",
    text: "One page a donor can read: the imagery periods, the headline hectares and people, the Top 10 tables for Near term and Post-crisis with their scores, the alerts and the method. \"Save as PDF\", or \"Download CSV\" with every square and its scores.",
    shot: "atlas-report",
    url: "chernozem.app/atlas/report",
    alt: "The report page for Ukraine: imagery periods, headline figures, new heavy damage this month and the Top 10 near-term areas",
  },
  {
    icon: Users,
    where: "Settings",
    title: "Set up the team and the crisis",
    text: "Team: the names of the people working on this area, each with a role label (admin, analyst or viewer) that appears on the report; the access code is what opens the app. Saved areas: open, rename, remove. The switch that analyses every saved area each month. And the crisis for an area: the app's list of wars, \"At war\" from a day you pick, a \"Natural disaster\" from its day (flood, wildfire, drought, storm, earthquake or landslide, or other), or \"No crisis\".",
    shot: "atlas-settings",
    url: "chernozem.app/atlas/settings",
    alt: "The Atlas settings page: the Crisis card with At war since 24 Feb 2022 from the app's list of wars, the Data card with the switch that analyses every saved area each month, and the Team card with two names and their role labels, Admin and Analyst",
  },
];

// ---------- One step card ----------

// The reading line: a thin band of the screen a card becomes the active
// one by crossing. On a wide screen it is a little above the middle; on a
// phone it is just under the pinned picture (the cards scroll beneath it).
const PHONE = "(max-width: 900px)";
const isPhone = () => typeof window !== "undefined" && window.matchMedia(PHONE).matches;
const readingLine = () => (isPhone() ? "-48% 0px -50% 0px" : "-36% 0px -62% 0px");

// True while the media query matches, kept up to date as the window changes
// (a phone turned sideways, a window made narrower).
function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function StepCard({ step, index, on, onPick, onCentered, register }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onCentered(index);
      },
      { rootMargin: readingLine() },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, onCentered]);
  const Icon = step.icon;
  return (
    <li
      ref={(el) => {
        ref.current = el;
        register(index, el);
      }}
      className={`step${on ? " is-on" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      onClick={() => onPick(index)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(index);
        }
      }}
    >
      <div>
        <span className="guide-step-where">
          <Icon size={14} aria-hidden="true" />
          {step.where}
        </span>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
      </div>
    </li>
  );
}

// ---------- One walkthrough: the cards and the pinned picture ----------

// The picture pinned for a step. On a phone (PHONE) a desktop picture is
// unreadable, so the phone shot is shown where one exists, else the
// 960-px-wide copy of the desktop shot (<name>-960.webp); on a wide screen
// the full desktop shot.
function pictureOf(step, phone) {
  if (phone && step.phoneShot) return { name: step.phoneShot, phone: true, alt: step.phoneAlt || step.alt };
  return { name: phone ? `${step.shot}-960` : step.shot, phone: false, alt: step.alt, url: step.url };
}

function Walkthrough({ steps }) {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const phone = useMedia(PHONE);
  const cards = useRef([]);
  const stickyRef = useRef(null);
  // After a click the page scrolls to the card; until then the scroll
  // observer keeps quiet so the cards it passes do not flash through.
  const quietUntil = useRef(0);

  // Fetch every picture of this walkthrough once, so a step's picture is
  // there the moment it is chosen.
  useEffect(() => {
    steps.forEach((step) => {
      const img = new Image();
      img.src = `/site/shots/${pictureOf(step, phone).name}.webp`;
    });
  }, [steps, phone]);

  const register = useCallback((index, el) => {
    cards.current[index] = el;
  }, []);

  const onCentered = useCallback((index) => {
    if (Date.now() < quietUntil.current) return;
    setActive(index);
  }, []);

  function pick(index) {
    setActive(index);
    const el = cards.current[index];
    if (!el || typeof window === "undefined") return;
    quietUntil.current = Date.now() + (reduced ? 0 : 1100);
    const box = el.getBoundingClientRect();
    // On a phone the picture is pinned under the menu bar: put the card
    // just below it. On a wider screen, on the reading line (readingLine).
    const pinned = isPhone() && stickyRef.current ? stickyRef.current.getBoundingClientRect().height + 68 + 12 : null;
    const top = pinned != null ? box.top + window.scrollY - pinned : box.top + window.scrollY - window.innerHeight * 0.3;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }

  const step = steps[active];
  const picture = pictureOf(step, phone);
  return (
    <div className="guide-layout">
      <ol className="steps guide-steps">
        {steps.map((item, i) => (
          <StepCard key={item.title} step={item} index={i} on={i === active} onPick={pick} onCentered={onCentered} register={register} />
        ))}
      </ol>
      <div className="guide-sticky" ref={stickyRef}>
        <div className="guide-frame">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={picture.name}
              className={`guide-slide${picture.phone ? " is-phone" : ""}`}
              initial={reduced ? false : { opacity: 0, scale: 0.97, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? undefined : { opacity: 0, scale: 1.02, y: -12, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              <Shot name={picture.name} url={picture.url} alt={picture.alt} phone={picture.phone} eager />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="guide-progress">
          <div className="guide-dots" aria-hidden="true">
            {steps.map((item, i) => (
              <span key={item.title} className={i === active ? "is-on" : ""} />
            ))}
          </div>
          <span className="guide-progress-text mono">
            Step {active + 1} of {steps.length} · {step.where}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- The two walkthroughs with their switch ----------

//   product     "field" | "atlas", the walkthrough shown
//   setProduct  the page's own setter (the hero's links use it too)
function Walkthroughs({ product, setProduct }) {
  const reduced = useReducedMotion();
  const steps = product === "atlas" ? ATLAS_STEPS : FIELD_STEPS;
  return (
    <section className="section anchor" id="walkthrough">
      {/* /guide#field and /guide#atlas land here, with the heading in view:
          the ids the links use sit at the top of the section, not on the
          switch's buttons (those are guide-tab-field and guide-tab-atlas). */}
      <span id="field" className="anchor guide-anchor" aria-hidden="true" />
      <span id="atlas" className="anchor guide-anchor" aria-hidden="true" />
      <div className="wrap">
        <div className="guide-head">
          <div className="section-head">
            <Reveal className="eyebrow">Two walkthroughs</Reveal>
            <h2 className="h-1">
              <SplitWords text="Seven steps for a farm.|Seven for a *country.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">Click a step, or scroll: the picture follows. Field is what a farmer uses; Atlas is what a ministry, an NGO or a donor uses. Both live in the same app.</p>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <div className="guide-switch" role="tablist" aria-label="Which walkthrough">
              {PRODUCTS.map((item) => {
                const on = product === item.id;
                return (
                  <button key={item.id} id={`guide-tab-${item.id}`} type="button" role="tab" aria-selected={on} aria-controls={on ? `guide-${item.id}` : undefined} className={on ? "is-on" : undefined} onClick={() => setProduct(item.id)}>
                    {on && <motion.span layoutId="guide-pill" className="guide-pill" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }} />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>
        <div className="guide-stage">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={product}
              id={`guide-${product}`}
              role="tabpanel"
              aria-labelledby={`guide-tab-${product}`}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0, pointerEvents: "none", transition: { duration: 0 } } : { opacity: 0, y: -10, pointerEvents: "none" }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <Walkthrough steps={steps} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ---------- Questions ----------

const FAQ = [
  {
    q: "Do I need to install anything?",
    a: (
      <>
        <p>No. Chernozem is a web page: open chernozem.app on a phone or a computer, enter the access code, and it works. No sensors, no drones, nothing from an app store. The satellite maths runs on Google Earth Engine, not on your device.</p>
      </>
    ),
  },
  {
    q: "How often does it update?",
    a: (
      <>
        <p>
          <strong>Field:</strong> with &ldquo;Update automatically&rdquo; on (Settings), the server checks every six hours and reads again any field whose reading is more than a day old. Sentinel-2 passes about every five days, so a clear sky brings a new reading within the week. &ldquo;Update now&rdquo; reads the fields at once.
        </p>
        <p>
          <strong>Atlas:</strong> every saved area is analysed again each month, by itself, as long as the switch in Settings is on. &ldquo;Re-run analysis&rdquo; does it now.
        </p>
      </>
    ),
  },
  {
    q: "What does Feasibility mean, and is the land safe?",
    a: (
      <>
        <p>Feasibility is the distance from each square to recorded fighting: from an ACLED file when one is connected, otherwise from fires that look like fighting. It says how reachable land is for recovery work, so the ranking can leave the least reachable land out for now.</p>
        <p>It never says land is safe. The report says so in as many words: scores do not replace field sampling, mine-risk assessment or local consultation, and only certified deminers can decide whether land is safe.</p>
      </>
    ),
  },
  {
    q: "What if no fighting is found?",
    a: (
      <>
        <p>Then the app does not pretend. In a war where no fire within 300 km looked like fighting and no ACLED battles are near, Feasibility reads &ldquo;not measured here&rdquo;, nothing is left out of the Near term ranking for it, and the order follows value and damage. The Feasibility tab on the map says &ldquo;Not measured here&rdquo; too.</p>
      </>
    ),
  },
  {
    q: "Which crises does it handle?",
    a: (
      <>
        <p>War, from the app&apos;s own list of wars or from a day your team picks; and natural disasters set for an area with their start day: flood, wildfire, drought, and storm, earthquake or landslide, or another disaster. The same Near term and Post-crisis ranking follows every one; only how Damage and Feasibility are measured changes with the crisis.</p>
        <p>On a farm, &ldquo;Tell us what happened&rdquo; takes fire, flood, hail, pests and other, and shelling where there is a war.</p>
      </>
    ),
  },
  {
    q: "Can I change the weights?",
    a: (
      <>
        <p>
          Yes, on the Map. In Near term, Value and Damage share the weight and the Feasibility cutoff sets how much of the least reachable land is left out ({NUMBERS.gatePercentile}% to start). In Post-crisis there are three sliders, Value, Damage and Feasibility ({NUMBERS.postWeights.value * 100} / {NUMBERS.postWeights.damage * 100} / {NUMBERS.postWeights.feasibility * 100} to start). The map recolours as you move them, and the weights are saved for the whole team.
        </p>
      </>
    ),
  },
  {
    q: "Is my data private?",
    a: (
      <>
        <p>One access code opens one shared workspace: one farm, one set of Atlas areas, one team list and one set of AI chats. Everyone with the code sees the same data and can change it; there are no personal accounts and no record of who changed what.</p>
        <p>So give the code only to people who may see and change everything, and press Sign out on a shared computer: a browser stays signed in for 30 days. The AI answers only from the data in your workspace.</p>
      </>
    ),
  },
  {
    q: "Where does the data come from?",
    a: (
      <>
        <p>{DATASETS.length} open datasets from ESA, NASA, the FAO and others, read in Google Earth Engine. None of it is collected from you.</p>
        <ul className="guide-sources" aria-label="The datasets">
          {DATASETS.map((d) => (
            <li key={d.name} className="chip">
              {d.name} <span>{d.role}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    q: "Does it work on a phone?",
    a: (
      <>
        <p>Yes. Open the same address: every page lays itself out for a phone, with the map on top and the field or square below it, and the map key under the map so it never hides a field.</p>
        <div className="guide-phones">
          <Shot name="phone-field-fields" phone alt="The Fields page on a phone: the satellite map with the field outlines and the selected field's details below" />
          <Shot name="phone-atlas-map" phone alt="The Atlas map of Ukraine on a phone, coloured by near-term priority, with the weights below" />
        </div>
      </>
    ),
  },
  {
    q: "Can I use it outside Ukraine?",
    a: (
      <>
        <p>Yes, any place on Earth: the example farms are in Ukraine, Iowa and Argentina. The growing season follows the latitude: April to September north of the tropics, October to March south of them, and the last twelve months in between.</p>
        <p>Damage is counted from the day of the war or disaster set for the area; in Ukraine, from the full-scale invasion of 24 February 2022. Months more than 24 months back cannot be analysed from the app.</p>
      </>
    ),
  },
];

function Faq() {
  const [open, setOpen] = useState(0);
  const reduced = useReducedMotion();
  return (
    <Stagger className="faq">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <StaggerItem key={item.q} className={`faq-item${isOpen ? " is-open" : ""}`}>
            <h3>
              <button type="button" className="faq-q" id={`faq-q-${i}`} aria-expanded={isOpen} aria-controls={`faq-a-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span>{item.q}</span>
                <span className="faq-plus" aria-hidden="true">
                  +
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="answer"
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="faq-a">{item.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

function Questions() {
  return (
    <section className="section section-dark anchor" id="faq">
      <div className="wrap">
        <div className="faq-layout">
          <div className="section-head">
            <Reveal className="eyebrow">Questions</Reveal>
            <h2 className="h-1">
              <SplitWords text="What people *ask* first." inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">Short answers, each true to what the app really does. Anything else: ask us on the contact page.</p>
            </Reveal>
            <Reveal delay={0.15}>
              <Link to="/contact" className="text-link">
                Ask a question <Arrow />
              </Link>
            </Reveal>
          </div>
          <Faq />
        </div>
      </div>
    </section>
  );
}

// ---------- The invitation ----------

function Cta() {
  return (
    <section className="section-tight">
      <div className="wrap">
        <Reveal>
          <div className="callout guide-cta">
            <h2 className="h-1">Ready when you are.</h2>
            <p className="lead">Open Chernozem with the access code you were given, or ask for one. Farmers, ministries, NGOs, researchers and investors are all welcome.</p>
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
            <ul className="guide-cta-points">
              <li>
                <Smartphone size={16} aria-hidden="true" /> Nothing to install
              </li>
              <li>
                <ShieldCheck size={16} aria-hidden="true" /> Never declares land safe
              </li>
              <li>
                <Satellite size={16} aria-hidden="true" /> Updated as the satellites pass
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" /> Any place on Earth
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function GuidePage() {
  usePageTitle("How to use");
  // /guide#atlas opens on the Atlas walkthrough; the hero's links and the
  // switch change it from there.
  const { hash } = useLocation();
  const [product, setProduct] = useState(() => (hash === "#atlas" ? "atlas" : "field"));
  useEffect(() => {
    if (hash === "#atlas" || hash === "#field") setProduct(hash.slice(1));
  }, [hash]);
  return (
    <>
      <PageHero eyebrow="How to use it" title="Drop a pin. *Everything* shows." lead="There is nothing to install and no sensors to buy. Open Chernozem on a phone or a computer with your access code, and the satellites do the rest. Two walkthroughs below: one for a farm, one for a country.">
        <nav className="toc" aria-label="On this page">
          <a href="#walkthrough" onClick={() => setProduct("field")}>
            Field walkthrough
          </a>
          <a href="#walkthrough" onClick={() => setProduct("atlas")}>
            Atlas walkthrough
          </a>
          <a href="#faq">Questions</a>
        </nav>
      </PageHero>
      <Walkthroughs product={product} setProduct={setProduct} />
      <Questions />
      <Cta />
    </>
  );
}
