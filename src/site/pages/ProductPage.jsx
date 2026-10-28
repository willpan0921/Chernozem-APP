// WHAT THIS FILE DOES
// The website's "Product" page (chernozem.app/product): what the two
// products do, in order:
//   1. the header: Field for farmers (bottom up), Atlas for governments,
//      NGOs and planners (top down), on the same satellite data
//   2. Field: its real features beside a screenshot of one field, then a
//      small gallery (overview, data, AI) and the phone view
//   3. Atlas: a tabbed viewer of the map's views (Near term and
//      Post-crisis, Micro and Macro, Damage, Feasibility, one square,
//      satellite only), its real features, then overview, report and data
//   4. Any crisis: what damage and feasibility mean for a war, a flood, a
//      wildfire, a drought and a storm, and which rules are checked
//   5. Who it is for: farmers, ministries, NGOs, researchers
//   6. the invitation to open the app or ask for access
//
// Every feature named here exists in the app: the Field ones in
// src/pages/field, src/lib/field and server/field; the Atlas ones in
// src/pages/atlas, src/lib/atlas and server; the crisis rules in
// src/config/research.js, src/lib/atlas/method.js and docs/METHODS.md.
// Numbers come from src/site/content/site.js.
//
// WHO EDITS IT
// Whoever works on the Product page. When a feature changes in the app,
// change its line here too.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import PageHero from "../components/PageHero.jsx";
import SplitWords from "../components/SplitWords.jsx";
import Shot from "../components/Shot.jsx";
import { Arrow, Magnetic, Reveal, Spotlight, Stagger, StaggerItem, motion, useReducedMotion } from "../components/motion.jsx";
import {
  Search,
  LayoutGrid,
  Wheat,
  Target,
  CloudRain,
  PenLine,
  MessageSquare,
  Download,
  Radar,
  Globe2,
  Satellite,
  Scale,
  SlidersHorizontal,
  Map as MapIcon,
  Layers,
  MapPin,
  Landmark,
  FileText,
  Bell,
  Database,
  Tractor,
  HandHeart,
  GraduationCap,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  Sprout,
} from "../components/Icons.jsx";
import { NUMBERS, SITE, compactHa, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const EASE = [0.22, 1, 0.36, 1];

// ---------- Field ----------

// What Field does, each verified in the app (src/pages/field/*,
// src/components/field/FarmSetup.jsx, src/lib/field/method.js and crops.js,
// server/field/*, server/scheduler.js, server/ai/field-context.js).
const FIELD_FEATURES = [
  {
    icon: Search,
    title: "Your fields, traced for you.",
    text: `Search a village, type coordinates or draw your land on the satellite map. Field finds the fields on it from Sentinel-2 imagery and you pick the ones that are yours. It reads a ten-field farm in about ${NUMBERS.tenFieldsSeconds} seconds.`,
  },
  {
    icon: LayoutGrid,
    title: "Four tiles per field.",
    text: "Water, Plant health, Stress and Harvest readiness, read from the latest pass and compared with that field's own normal: the same weeks of 2019 to 2021.",
  },
  {
    icon: Wheat,
    title: "The crop, identified.",
    text: "Each field's crop is read from how it greens up, peaks and dries down over the season, with how sure the app is. Set your own in Settings and it takes over.",
  },
  {
    icon: Target,
    title: "Stress patches, and the likely cause.",
    text: "Weak patches are mapped from the red-edge band one to two weeks before they show in plain greenness, and named: a dry patch, or not water, so check for pests or disease.",
  },
  {
    icon: CloudRain,
    title: "Pest and disease risk from the weather.",
    text: "Hourly humidity and temperature from Open-Meteo, the week behind and the week ahead, become one line: how high the disease risk and insect activity are this week.",
  },
  {
    icon: PenLine,
    title: "Tell us what happened.",
    text: "Report shelling, fire, flood, hail or pests on a field with up to four photos. The AI opens a chat about it and sees the photos. Shelling is offered only where a known war covers the farm.",
  },
  {
    icon: MessageSquare,
    title: "An assistant that knows only your farm.",
    text: "Ask which field needs attention first. Chernozem AI answers from your fields, their readings, their history since 2019, the weather and your reports, read on the server, and from nothing else.",
  },
  {
    icon: Download,
    title: "Everything since 2019, yours to keep.",
    text: "Plant health and water month by month since 2019, this season's clear passes, and downloads: field outlines as GeoJSON, passes and history as CSV, the latest image as GeoTIFF, and a printable season report.",
  },
  {
    icon: Radar,
    title: "Updated as the satellites pass.",
    text: "Sentinel-2 passes every two to five days. With automatic updates on, the server checks every six hours and reads again any field whose reading is more than a day old.",
  },
  {
    icon: Globe2,
    title: "Any farm, any day.",
    text: "Field works the same on a farm in Iowa, Argentina or Kharkiv, every day of the year, not only after a disaster. War damage and “Needs recovery” appear only where a known war covers the farm.",
  },
];

// The small gallery pictures (here and ATLAS_GALLERY) are the 960-px-wide
// copies, <name>-960.webp in public/site/shots; the big map viewer uses the
// full 1920-px files.
const FIELD_GALLERY = [
  { name: "field-overview", url: "chernozem.app/field", caption: "The overview: fields to watch, growing, harvested and fallow, the weather, and what needs doing." },
  { name: "field-data", url: "chernozem.app/field/data", caption: "Data since 2019: one field's plant health against the farm and its normal years, with the day the war began marked." },
  { name: "field-ai", url: "chernozem.app/field/ai", caption: "Ask the AI: it uses the farm, the latest pass and the weather, and suggests questions that name your real fields." },
];

// ---------- Atlas ----------

// The map viewer's tabs: real screenshots of the Atlas map page
// (public/site/shots/manifest.json).
const MAP_TABS = [
  {
    id: "near-micro",
    label: "Near term · Micro",
    shot: "atlas-map-near-micro",
    alt: "The Atlas map of Ukraine coloured by near-term priority, square by square",
    caption: "Ukraine by priority, square by square, in the near term: the weights and the Feasibility cutoff on the left, as the team had set them that day, the map in five greens with the land left out for now in pale grey, and the ten top squares listed on the right.",
  },
  {
    id: "near-macro",
    label: "Near term · Macro",
    shot: "atlas-map-near-macro",
    alt: "The same map by whole state, each oblast filled by its near-term priority",
    caption: "The same month by whole state (oblast): each filled by its near-term priority, with the states listed in order on the right, their squares and their hectares (weights as the team had set them that day: Value 76 / Damage 24, cutoff 36%).",
  },
  {
    id: "post-macro",
    label: "Post-crisis · Macro",
    shot: "atlas-map-post-macro",
    alt: "The states ranked for the post-crisis time frame",
    caption: "The same states for after the crisis, when value, damage and feasibility are blended and nothing is left out: the east is coloured again and the list on the right changes order (weights as the team had set them that day: Value 53 / Damage 17 / Feasibility 30).",
  },
  {
    id: "damage",
    label: "Damage",
    shot: "atlas-map-damage-micro",
    alt: "The Damage map of Ukraine, heaviest along the front",
    caption: "The Damage map, from unusual fire and lasting radar change: the heaviest damage runs along the front in Kharkiv, Luhansk, Donetsk, Zaporizhzhia and Kherson.",
  },
  {
    id: "feasibility",
    label: "Feasibility",
    shot: "atlas-map-feasibility",
    alt: "The Feasibility map of Ukraine: distance to fighting",
    caption: "The Feasibility map: distance to fighting, from under 20 km near the front to 100 km and more in the west.",
  },
  {
    id: "picked",
    label: "One square",
    shot: "atlas-map-picked",
    alt: "One map square in Kharkiv picked, with its scores, soil types, hectares, people and recovery cost",
    caption: "One square in Kharkiv picked: its three scores and rank, the soil types read from Earth Engine in plain words, hectares, people and a recovery-cost range.",
  },
  {
    id: "satellite",
    label: "Satellite only",
    shot: "atlas-map-satellite",
    alt: "The Atlas map with Satellite only on: imagery of Ukraine and the Black Sea",
    caption: "Satellite only: the squares, the borders and the key step aside for the imagery of Ukraine and the Black Sea.",
  },
];

// What Atlas does, each verified in the app (src/pages/atlas/*,
// src/components/atlas/*, src/lib/atlas/overview.js, server/runs.js,
// server/soil-names.js, server/scheduler.js).
const ATLAS_FEATURES = [
  {
    icon: Globe2,
    title: "Any area on Earth.",
    text: `Search a country or a region, paste GPS corners or draw a shape; Atlas lays a grid of squares over it and analyses its last twelve months. Ukraine is ${formatInt(NUMBERS.ukraineSquares)} squares.`,
  },
  {
    icon: Satellite,
    title: "Every square, every month.",
    text: "Each square gets its black-soil value, its damage and its feasibility on fixed scales from 0 to 1, with its hectares of cropland and black soil, its heavy damage and the people living on damaged land.",
  },
  {
    icon: Scale,
    title: "Near term and Post-crisis.",
    text: "In the near term the least feasible land is left out before the rest is ranked; post-crisis it comes back and all three scores are blended. One switch, the same squares.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your weights, your cutoff.",
    text: "Sliders for Value, Damage and Feasibility that always add up to 100, and in the near term the Feasibility cutoff. Every move recolours the map at once and is saved for the team.",
  },
  {
    icon: MapIcon,
    title: "Micro and Macro.",
    text: "Micro ranks every square. Macro ranks whole states, provinces or districts, drawn with their real borders and names from the FAO's GAUL dataset.",
  },
  {
    icon: Layers,
    title: "Four maps.",
    text: "Priority, Value, Damage and Feasibility, each with fixed colour steps, so a shade means the same thing in every month and every country.",
  },
  {
    icon: MapPin,
    title: "Click anything.",
    text: "A square or a state opens its scores and rank, “How it's measured” with the exact rule, its soil types in plain words (meadow black soil, chernozem), its hectares, its people and a recovery-cost range.",
  },
  {
    icon: Landmark,
    title: "A budget becomes hectares.",
    text: "Type a budget on the overview and it says how much damaged black soil the money covers and where to start; the team ticks off the next steps as they are done.",
  },
  {
    icon: FileText,
    title: "A donor report.",
    text: "One page for the month: the imagery used, the headline hectares and people, new heavy damage, the top ten for each time frame, the settings, the alerts and the method. Save it as a PDF, or download every square as CSV.",
  },
  {
    icon: Bell,
    title: "Alerts.",
    text: "Fires detected and radar change this month, each with its place, so a new strike or burn is not missed between reports.",
  },
  {
    icon: Database,
    title: "An archive to compare.",
    text: "Every analysed month stays: the trend as a bar chart, the monthly table, and a compare tool that lists the squares that changed most between any two months.",
  },
  {
    icon: MessageSquare,
    title: "The AI, on the same numbers.",
    text: "Ask about the month on screen with your weights and time frame; the answer uses exactly what the map shows. A square's “Ask AI” starts the chat from that square.",
  },
];

const ATLAS_GALLERY = [
  { name: "atlas-overview", url: "chernozem.app/atlas", caption: `The overview for Ukraine, ${NUMBERS.ukraineMonth}: cropland, black soil, heavy damage and people, the priority map, next steps, alerts and the budget.` },
  { name: "atlas-report", url: "chernozem.app/atlas/report", caption: "The donor report: imagery periods, the headline figures, new heavy damage this month and the top ten, ready to save as PDF or CSV." },
  { name: "atlas-data", url: "chernozem.app/atlas/data", caption: "Data: heavily damaged hectares month by month, the monthly table, the compare tool and how the method was tested." },
];

// ---------- Any crisis ----------

// What the two scores mean for each crisis: src/config/research.js
// (atlasMethods, atlasDisasterMethods, disasterValidation),
// src/lib/atlas/method.js (DISASTER_TYPES) and docs/METHODS.md.
const CRISES = [
  {
    name: "War",
    damage: "Fires above the place's own normal years, in its worst war year, and change in the ground seen by radar that lasts across two or more growing seasons.",
    feasibility: "Distance to fighting: battles from an ACLED file, or fires that look like fighting; full at 100 km.",
    status: "checked",
    note: `Research tested in Ukraine: ρ ${NUMBERS.acledCorrelation.toFixed(2)} against ${formatInt(NUMBERS.acledEvents)} recorded explosions.`,
  },
  {
    name: "Flood",
    damage: "Normally dry cropland seen under water by radar or in a clear optical image within 60 days of the day the flood began. Lakes, rivers, paddies and other land that is wet most years are left out, and so are days of snow or frozen ground, which look like water to radar.",
    feasibility: "Water now: the share of the square's cropland not under water at the satellites' latest look in the month.",
    status: "checked",
    note: "Checked on past floods: Greece 2023, Pakistan 2025, Iowa 2024.",
  },
  {
    name: "Wildfire",
    damage: "Land on the burned-area maps, or an unusual fire with a severe loss of vegetation (burn severity, dNBR), within 60 days of the day. Fields that burn every year, as stubble does, are left out.",
    feasibility: "Fires now: the distance to a fire burning in the month's last seven days, full at 10 km.",
    status: "checked",
    note: "Checked on past wildfires: Bulgaria 2024, Texas 2024.",
  },
  {
    name: "Drought",
    damage: "Crop greenness 20% or more below the same weeks of 2019 to 2021 (35% for heavy damage), keeping the season's worst reading. It fades only when a new, normal season begins.",
    feasibility: "Not measured: a drought does not stop fieldwork, so nothing is left out.",
    status: "checked",
    note: "Checked on a past drought: Nebraska 2026.",
  },
  {
    name: "Storm or ground movement",
    damage: "Lasting change over the growing season that holds the day: greenness 20% below normal and a radar change of 2 dB, where both sensors agree.",
    feasibility: "Not measured: satellites do not show what stops fieldwork afterwards, so nothing is left out.",
    status: "provisional",
    note: "Failed its checks so far: it read about as much change in places without a disaster. A pointer to where to look, not a measurement.",
  },
];

// ---------- Who it is for ----------

// The weights line comes from the founder's own words: a demining agency
// can raise safe access (Feasibility), a food ministry can raise soil value
// (Value), and a reconstruction fund can raise damage (Damage).
const WHO = [
  {
    icon: Tractor,
    title: "Farmers",
    text: "Set up the farm once, then open Field whenever you like: which field needs attention first, what is stressed and why, whether to harvest before the rain, and what the war or the flood did to each field.",
    weight: "Chernozem Field · nothing to set up but your fields",
  },
  {
    icon: Landmark,
    title: "Ministries and reconstruction funds",
    text: "Open Atlas on your country, set the weights your mandate needs and get a ranking of where recovery should start, what a budget covers, and a report donors can read.",
    weight: "Raise the Value weight · raise the Damage weight",
  },
  {
    icon: HandHeart,
    title: "NGOs and demining groups",
    text: "Rank by what can be reached now: keep the Near-term cutoff, read the alerts each month, and go where damage and access meet. Atlas never declares land safe; it says where to look first.",
    weight: "Raise the Feasibility weight",
  },
  {
    icon: GraduationCap,
    title: "Researchers and investors",
    text: "Every score comes with its components and the exact rule, every month is archived, every square downloads as CSV, and the method is published with its data and code on Harvard Dataverse.",
    weight: "Any weights · every square as CSV · the paper",
  },
];

function FeatureList({ items, className = "" }) {
  return (
    <Stagger as="ul" className={`feature-list ${className}`} amount={0.1}>
      {items.map(({ icon: Icon, title, text }) => (
        <StaggerItem as="li" key={title}>
          <Icon size={20} aria-hidden="true" />
          <div>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

// The Atlas map viewer: a row of tabs and one real screenshot per tab,
// crossfading as the reader switches. Arrow keys move between the tabs.
function MapViewer() {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState(MAP_TABS[0].id);
  const current = MAP_TABS.find((item) => item.id === tab) || MAP_TABS[0];
  const wrapRef = useRef(null);
  const warmed = useRef(false);

  // Fetch the six other views once, so a tab never opens on an empty
  // frame: when the viewer scrolls into view, or as soon as the reader's
  // pointer or focus reaches the tabs, not when the page loads (that was
  // 1.3 MB of pictures up front).
  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    MAP_TABS.forEach((item) => {
      if (item.id === MAP_TABS[0].id) return;
      const img = new Image();
      img.src = `/site/shots/${item.shot}.webp`;
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        warm();
        io.disconnect();
      },
      { rootMargin: "0px 0px 120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [warm]);

  function onKeyDown(event) {
    const index = MAP_TABS.findIndex((item) => item.id === tab);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % MAP_TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + MAP_TABS.length) % MAP_TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = MAP_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(MAP_TABS[next].id);
    document.getElementById(`product-map-tab-${MAP_TABS[next].id}`)?.focus();
  }

  return (
    <div className="map-viewer-wrap" ref={wrapRef}>
      <div className="gallery-tabs" role="tablist" aria-label="Views of the Atlas map" onKeyDown={onKeyDown} onPointerEnter={warm} onFocus={warm}>
        {MAP_TABS.map((item) => {
          const on = item.id === tab;
          return (
            <button key={item.id} id={`product-map-tab-${item.id}`} type="button" role="tab" aria-selected={on} aria-controls="product-map-panel" tabIndex={on ? 0 : -1} className={`gallery-tab${on ? " is-on" : ""}`} onClick={() => setTab(item.id)}>
              {on && <motion.span layoutId="product-map-pill" className="gallery-tab-pill" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }} />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="map-viewer" id="product-map-panel" role="tabpanel" aria-labelledby={`product-map-tab-${current.id}`}>
        <AnimatePresence initial={false}>
          <motion.div
            key={current.id}
            initial={reduced ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.35 } }}
            transition={{ duration: reduced ? 0 : 0.55, ease: EASE }}
          >
            <Shot name={current.shot} url="chernozem.app/atlas/map" alt={current.alt} eager />
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="map-caption" aria-live="polite">
        {current.caption}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === "provisional") return <span className="badge badge-amber">Provisional</span>;
  return <span className="badge">Checked</span>;
}

function FieldSection() {
  return (
    <section className="section anchor product-field" id="field">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Chernozem Field · bottom up</Reveal>
          <h2 className="h-1">
            <SplitWords text="Every field, every satellite *pass.*" inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">Field finds your fields, names them and watches them with every pass of the Sentinel satellites. It works on any farm on Earth, every day of the year, not only after a disaster.</p>
          </Reveal>
        </div>
        <div className="product-block is-start">
          <FeatureList items={FIELD_FEATURES} />
          <Reveal className="product-sticky" delay={0.1}>
            <div className="product-pair">
              <Shot name="field-fields-detail" url="chernozem.app/field/fields" ratio="1920 / 1369" alt="Chernozem Field: the farm map and Field 11's detail cards, near-normal water, plant health above normal, stress under 1%, past peak greenness, and the season chart" />
              <Shot name="phone-field-fields" phone alt="The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below" />
            </div>
            <p className="caption">Field 11, a rapeseed field in Ukraine, up close: four tiles against its own normal and this season&apos;s plant-health curve. On a phone, the map first and the field&apos;s details below it.</p>
          </Reveal>
        </div>
        <Stagger className="gallery product-gallery" amount={0.15}>
          {FIELD_GALLERY.map((item) => (
            <StaggerItem key={item.name}>
              <Shot name={`${item.name}-960`} url={item.url} caption={item.caption} alt={item.caption} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function AtlasSection() {
  return (
    <section className="section section-dark anchor product-atlas" id="atlas">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Chernozem Atlas · top down</Reveal>
          <h2 className="h-1">
            <SplitWords text="A whole country, square by *square.*" inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">
              Pick any country, region or drawn area and Atlas lays a grid of squares over it: {formatInt(NUMBERS.ukraineSquares)} for Ukraine. Every month it reads each square from space, scores it, and ranks where recovery should start.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <MapViewer />
        </Reveal>
        <FeatureList items={ATLAS_FEATURES} className="feature-list-2 product-atlas-features" />
        <Stagger className="gallery product-gallery" amount={0.15}>
          {ATLAS_GALLERY.map((item) => (
            <StaggerItem key={item.name}>
              <Shot name={`${item.name}-960`} url={item.url} caption={item.caption} alt={item.caption} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function CrisesSection() {
  return (
    <section className="section section-cream-2 anchor product-crises" id="crises">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Any crisis</Reveal>
          <h2 className="h-1">
            <SplitWords text="The same three questions, whatever *happened.*" inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">Value, damage and feasibility are the same questions after a war, a flood, a wildfire or a drought. What changes is how damage and feasibility are read from the satellites. Each crisis has its own rule, and each rule says what it cannot see.</p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className="table-scroll">
            <table className="s-table crisis-table">
              <thead>
                <tr>
                  <th scope="col">Crisis</th>
                  <th scope="col">What damage means</th>
                  <th scope="col">What feasibility means</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {CRISES.map((crisis) => (
                  <tr key={crisis.name}>
                    <td>{crisis.name}</td>
                    <td data-label="What damage means">{crisis.damage}</td>
                    <td data-label="What feasibility means">{crisis.feasibility}</td>
                    <td data-label="Status">
                      <div className="crisis-status">
                        <StatusBadge status={crisis.status} />
                        <span>{crisis.note}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="crisis-note">
            Every rule is checked against Copernicus emergency maps and official figures, on past disasters and on the same places in years without one (see{" "}
            <Link to="/technology#reliability">how reliable it is</Link>). Whatever the crisis, none of them ever declares land safe: a satellite cannot see a mine, a cracked bank or smouldering ground.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function WhoSection() {
  return (
    <section className="section anchor product-who" id="who">
      <div className="wrap">
        <div className="section-head">
          <Reveal className="eyebrow">Who it is for</Reveal>
          <h2 className="h-1">
            <SplitWords text="Built for the people doing the *work.*" inView delay={0} step={0.05} />
          </h2>
          <Reveal delay={0.1}>
            <p className="lead">Chernozem gives the evidence and lets the people doing the work make the call. The weights are sliders, so a demining agency, a food ministry and a reconstruction fund can each set their own.</p>
          </Reveal>
        </div>
        <Stagger className="grid grid-4 who-grid">
          {WHO.map(({ icon: Icon, title, text, weight }) => (
            <StaggerItem key={title}>
              <Spotlight className="who-card">
                <span className="card-icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3 className="h-3">{title}</h3>
                <p className="card-text">{text}</p>
                <p className="who-weight">{weight}</p>
              </Spotlight>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function Cta() {
  const reduced = useReducedMotion();
  return (
    <section className="section-tight product-cta-wrap">
      <div className="wrap">
        <Reveal>
          <div className="callout product-cta">
            <div className="product-cta-body">
              <h2 className="h-1">Open Field or Atlas today.</h2>
              <p className="lead">Both run in the browser, on a laptop or a phone, with an access code. Ask for one and say who you are: farmers, ministries, NGOs, researchers and investors are all welcome.</p>
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
              <ul className="product-cta-points">
                <li>
                  <Smartphone size={16} aria-hidden="true" /> Nothing to install
                </li>
                <li>
                  <ShieldCheck size={16} aria-hidden="true" /> Never declares land safe
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> {formatInt(NUMBERS.ukraineSquares)} squares of Ukraine every month
                </li>
                <li>
                  <Sprout size={16} aria-hidden="true" /> {compactHa(NUMBERS.heavyDamageHa)} ha of damage mapped there
                </li>
              </ul>
            </div>
            <div className="product-cta-phones" aria-hidden="true">
              <motion.div animate={reduced ? undefined : { y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
                <Shot name="phone-field-overview" phone alt="" />
              </motion.div>
              <motion.div animate={reduced ? undefined : { y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}>
                <Shot name="phone-atlas-overview" phone alt="" />
              </motion.div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function ProductPage() {
  usePageTitle("Product");
  return (
    <>
      <PageHero eyebrow="The product" title="Two products. One *app.*" lead="Chernozem Field is for farmers: it starts from one field and works upward. Chernozem Atlas is for governments, NGOs and planners: it starts from a whole country and works down to the square. Both read the same real satellite data, both run in the browser, and there is nothing to install.">
        <nav className="toc" aria-label="On this page">
          <a href="#field">Field</a>
          <a href="#atlas">Atlas</a>
          <a href="#crises">Any crisis</a>
          <a href="#who">Who it is for</a>
        </nav>
      </PageHero>
      <FieldSection />
      <AtlasSection />
      <CrisesSection />
      <WhoSection />
      <Cta />
    </>
  );
}
