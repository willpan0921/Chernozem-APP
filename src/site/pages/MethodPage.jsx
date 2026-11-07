// WHAT THIS FILE DOES
// The website's Methodology page (chernozem.app/method): how Chernozem
// works, in two parts, one for each product, then what is behind it, the
// three-minute film and a short close.
//   Field     next to its name, what Field is, in one plain sentence; the
//             walkthrough film (every feature, recorded from the real app:
//             Walkthrough.jsx), how to use it in five steps, and what it
//             reads in one line. Then its technical part, in the Atlas
//             part's look and on its classes, kept as short: the four
//             readings, two by two (clouds, the 30 days and the normal
//             years above them; plant health, water, stress and harvest
//             timing, each a formula and one sentence), the condition with
//             its formulas (the scores, and the stress rule's thresholds)
//             beside the sliders the reader can move (ConditionLab.jsx),
//             how the fields, the crop and damage are found (two sentences
//             each), and what it cannot see.
//   Atlas     next to its name, what Atlas is and whom it is for
//             (governments, NGOs and corporations), and why Ukraine is the
//             demo; its walkthrough film, the three scores, the gate with
//             the sliders the reader can move (GateLab.jsx: Near term
//             against Post-crisis), the Ukraine ranking as the app shows it
//             (DemoRanking.jsx, untouched) and the checks against
//             independent records (ProofTable.jsx).
//   Behind it what it reads, what it is built with, privacy, and where
//             the data and the code are.
//   The film  "Chernozem in three minutes" (Film.jsx, with its five
//             chapters), right after "Behind it"; it moved here from the
//             About page. /method#film lands on it.
//   The close Register for Chernozem, or try the demo.
// One film plays at a time: starting one pauses any other, so two films
// with sound never play over each other (useOneFilmAtATime below).
// The old addresses (/product, /guide, /technology, /design) still land
// on the matching part: those ids stay on the blocks (src/App.jsx).
// Every sentence goes through t() (src/site/i18n/): the English is written
// here and is the key to the Chinese and Ukrainian dictionaries
// (i18n/zh/method.js, i18n/uk/method.js); a number or an element inside a
// sentence is a {hole}. Lists ("Sentinel-1, Sentinel-2 and FIRMS") are
// joined the way the language joins them (listOf below), and a decimal is
// written with the language's decimal mark (0.40; 0,40 in Ukrainian: two
// and decimal below).
//
// WHO EDITS IT
// The founder, for the words. Atlas's formulas match
// src/lib/atlas/scoring.js and the paper; keep them in step. Field's rules
// are the app's own (src/lib/field/method.js with crops.js, and
// src/lib/atlas/method.js); the comments beside each block give the file
// and line each comes from. Their numbers are FIELD_METHOD in
// src/site/content/site.js (which says why the page does not import the
// app's method), and site-pages.test.js checks each against the code. Other
// numbers come from NUMBERS there.

// site.css first, before the components' sheets and the page's own, so it
// is always in the page first and their rules win their ties with it,
// however the page is loaded.
import "../site.css";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import ConditionLab from "../components/ConditionLab.jsx";
import { classOf } from "../components/conditionLab.js";
import DemoRanking from "../components/DemoRanking.jsx";
import Film from "../components/Film.jsx";
import GateLab from "../components/GateLab.jsx";
import ProofTable from "../components/ProofTable.jsx";
import Walkthrough from "../components/Walkthrough.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { CONTACT_EMAIL, DATASETS, FIELD_METHOD, LINKS, NUMBERS, SITE_ACTIONS, STACK, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import { useT } from "../i18n/i18n.js";
import "./pages.css";

// The five steps, in English; each is translated where it is shown
// ({t(step)}). The fourth has a hole for how long the first pass takes.
const FIELD_STEPS = ["Register and choose Field.", "Find your farm: search a village, type coordinates, or draw.", "Check the crops the app detected, and set your own.", "Read the first pass; a ten-field farm takes about {seconds} seconds.", "Come back after each pass, report what happened, or ask the assistant."];

// "Sentinel-1, Sentinel-2, FIRMS, ..., and ACLED": in English as the site
// writes a list (no comma before "and"; no "and" at all when told so), in
// another language as that language lists things (Intl.ListFormat: 、 in
// Chinese, і in Ukrainian).
function listOf(names, t, { and = true } = {}) {
  // Chinese lists Latin names with 、 alone (the narrow conjunction, "A、B、C"):
  // 和 would sit against them with no space. Not the "unit" type: in Chinese
  // it joins with nothing at all (it is for compound units, 3小时20分).
  if (t.lang !== "en") return new Intl.ListFormat(t.locale, t.lang === "zh" ? { type: "conjunction", style: "narrow" } : { type: "conjunction" }).format(names);
  if (names.length < 2 || !and) return names.join(", ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Small whole numbers in words, as the site writes them in English ("six
// pictures", "twenty seconds"); in another language the number itself, for
// its sentence to write as that language does (a dictionary entry may be a
// function of it).
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function inWords(n, t) {
  if (t.lang !== "en") return n;
  if (Number.isInteger(n) && n >= 0 && n < WORDS.length) return WORDS[n];
  return n === 20 ? "twenty" : formatInt(n);
}

// A threshold as the method writes it: two decimals (0.10, 0.08), with the
// language's decimal mark (0,10 in Ukrainian); and any other decimal the
// method writes (0.6, 0.805, 71.8), as it is, with that mark (formatInt
// keeps up to three decimals, which is all the method's numbers have).
const two = (n, t) => new Intl.NumberFormat(t.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const decimal = (n, t) => formatInt(n, t.locale);

// A class's name never splits across two lines ("Very / good"): its
// spaces become no-break spaces.
const unbroken = (name) => name.replace(/ /g, "\u00a0");

// The class just above the one a score falls in: a field held at 0.84 is
// "held under Very good" (the condition laboratory says it the same way).
// The class's name is site.js's, translated with the rest of site.js.
function classAbove(score, t) {
  const at = FIELD_METHOD.classes.indexOf(classOf(score));
  const label = FIELD_METHOD.classes[at + 1]?.label;
  return label ? unbroken(t(label)) : "";
}

// What the Field part's technical words say, worked out from FIELD_METHOD
// (site.js; the rules themselves: src/lib/field/method.js and crops.js,
// line numbers as of 3 November 2026), in the website's language (t):
//   classes        "Poor under 0.40, ..., Very good above" (CONDITION_CLASSES, method.js:100)
//   stressedUnder  the class a field with high stress is held under
//                  (STRESSED_CONDITION_MAX 0.84, method.js:296 and :309): Very good
//   damagedUnder   the same for a damaged field (DAMAGED_CONDITION_MAX 0.64,
//                  method.js:1076 and conditionForDamage :1078): Good
//   clearShare     "at least half" (MIN_CLEAR_SHARE 0.5, method.js:42)
//   normalYears    three (BASELINE 2019 to 2021, method.js:36)
//   highStress     15 (per cent; stressLevel, method.js:128-133)
//   damageShare    10 (per cent; DAMAGE_RULES.radarShare, method.js:1009)
// FM is FIELD_METHOD, short, for the words below.
const FM = FIELD_METHOD;
function fieldRules(t) {
  const classes = FM.classes.map((item) => (Number.isFinite(item.upTo) ? t("{label} under {upTo}", { label: unbroken(t(item.label)), upTo: two(item.upTo, t) }) : t("{label} above", { label: unbroken(t(item.label)) })));
  return {
    classes: listOf(classes, t, { and: false }),
    stressedUnder: classAbove(FM.stressedMax, t),
    damagedUnder: classAbove(FM.damagedMax, t),
    clearShare: FM.minClearShare === 0.5 ? t("at least half") : t("at least {percent}%", { percent: Math.round(FM.minClearShare * 100) }),
    normalYears: inWords(FM.baseline.to - FM.baseline.from + 1, t),
    highStress: Math.round(FM.stressHighShare * 100),
    damageShare: Math.round(FM.damageRadarShare * 100),
  };
}

// One film at a time: the page has three films (the two walkthroughs, with
// their narration and music, and the three-minute film with its own sound);
// when one starts, any other that is playing pauses, so two voices never
// talk over each other. ("play" does not bubble up, so the page listens on
// its way down: capture.)
function useOneFilmAtATime() {
  useEffect(() => {
    const onPlay = (event) => {
      const started = event.target;
      if (!(started instanceof HTMLMediaElement)) return;
      for (const video of document.querySelectorAll(".pg video")) {
        if (video !== started && !video.paused) video.pause();
      }
    };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, []);
}

export default function MethodPage() {
  const t = useT("method");
  usePageTitle(t("Methodology"));
  useOneFilmAtATime();
  const rules = fieldRules(t);
  const w = NUMBERS.postWeights;
  // Near term uses value and damage only, their weights re-shared (30/40 -> 0.43/0.57), as the app does.
  const nearShares = { value: two(w.value / (w.value + w.damage), t), damage: two(w.damage / (w.value + w.damage), t) };
  // The test count rounded down to the hundred ("More than 1,000"), so the
  // sentence stays true while tests are added between updates of site.js.
  const testsFloor = Math.floor(NUMBERS.automatedTests / 100) * 100;
  // The gate's formulas' exponents, elements inside their sentences (the
  // half with the language's decimal mark, like the weights beside it).
  const half = <sup>{decimal(0.5, t)}</sup>;
  const squared = <sup>2</sup>;
  // "meth": on this page the small size never drops under 14 px (pages.css).
  return (
    <div className="pg meth">
      <section className="pg-sec" aria-labelledby="meth-title">
        <div className="pg-grid">
          <div className="meth-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1" id="meth-title">
                {t("How Chernozem works")}
              </h1>
            </div>
            <p className="pg-lead pg-fade">{t("Free satellite data, read over farmland and turned into a plain answer: Field for one farm, Atlas for a whole region.")}</p>
          </div>
          <figure className="pg-fig meth-open-pic pg-fade-2">
            <img className="pg-pic" src="/site/shots/atlas-map-near-micro.webp" width="1920" height="1200" alt={t("The Atlas map of Ukraine by priority, square by square, with the weights on the left and the top ten areas on the right")} loading="eager" decoding="async" />
            <figcaption>{t("Ukraine, {month}, square by square: the weights on the left, the top ten on the right.", { month: t(NUMBERS.ukraineMonth) })}</figcaption>
          </figure>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" id="product" aria-labelledby="meth-field">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-field">
              Field
            </h2>
          </Reveal>
          <Reveal className="meth-body" delay={0.08}>
            <p className="pg-lead meth-what">{t("Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.")}</p>
          </Reveal>
          <Reveal className="meth-film" delay={0.1} y={30}>
            <Walkthrough product="field" title={t("The Field walkthrough")} />
          </Reveal>
          {/* The steps, the phone and "What it reads" in one block of their
              own: on a wide screen the phone stands beside both texts, which
              follow each other closely; on a tablet or a phone it sits
              between them (pages.css, ".meth-use-row"). */}
          <div className="meth-use-row">
            <Reveal className="meth-use" id="use">
              <p>
                <strong>{t("How to use it.")}</strong>
              </p>
              <ol>
                {FIELD_STEPS.map((step) => (
                  <li key={step}>{t(step, { seconds: inWords(NUMBERS.tenFieldsSeconds, t) })}</li>
                ))}
              </ol>
            </Reveal>
            <Reveal className="meth-use-phone" delay={0.16} y={36}>
              <img className="pg-pic" src="/site/shots/phone-field-fields.webp" width="780" height="1688" alt={t("The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below")} loading="lazy" decoding="async" />
            </Reveal>
            <Reveal className="meth-reads" delay={0.08}>
              <p>
                <strong>{t("What it reads.")}</strong> {t("Every clear Sentinel-2 pass at ten metres, radar from Sentinel-1 for lasting change in the ground, the local forecast, and the same weeks of 2019 to 2021 as the normal to compare with.")}
              </p>
            </Reveal>
          </div>

          {/* Field's technical part, in the Atlas part's look below and as
              calm: the four readings, the condition beside its laboratory,
              how the fields, the crop and damage are found, and what it
              cannot see. Sources (line numbers as of 3 November 2026): a
              clear pixel, method.js:40, applied in field-gee.js:456-460;
              a reading's 30 days, the median of every clear pixel in them
              (field-gee.js:361, :1540-1541 and :2146-2152; the half-clear
              rule, MIN_CLEAR_SHARE method.js:42, does not filter them: it
              picks the season's passes, fieldPlan field-gee.js:2232-2254,
              which harvest timing reads); the normal, BASELINE
              method.js:36, per pixel the median of the three years
              (normalOfYears field-gee.js:487-493), the one the scores and
              both stress rules use (conditionImages :523-544), while the
              lowest-to-highest range of the three yearly field means
              (range :2304-2308) gives only the tiles' Below normal, Normal
              and Above normal (versusNormal :2398-2399; method.js:118-125);
              the indices, field-gee.js:461-463 (method.js:11-20). */}
          <Reveal className="meth-scores-intro" id="readings">
            <p>
              <strong>{t("Four readings.")}</strong> {t("Google’s Cloud Score+ removes clouds pixel by pixel (clear at {score} or more). Plant health, water and stress use the median of the last {days} days’ clear pixels, against the same weeks of {years}: per pixel, the middle of the {count} years (the app’s Below and Above normal use their range). Harvest timing follows the passes {share} clear.", { score: decimal(FM.clearPixelScore, t), days: FM.latestDays, years: t(FM.baseline.label), count: rules.normalYears, share: rules.clearShare })}
            </p>
          </Reveal>
          {/* Stress: STRESS_RULES method.js:61 and isStressed :80-83,
              RED_EDGE_RULES :153 and isStressedRedEdge :155-158, either
              rule (pixelStress :169-173; field-gee.js:539-544); its
              thresholds are the third formula under the condition.
              Harvest: the ready level, method.js:692 (BARE_NDVI :547, the
              shares crops.js:66-74), heat units (crops.js gddEstimate :178)
              and the radar cut (RADAR_HARVEST method.js:778), which counts
              only for a tall crop (corn, soybean, sunflower) or one not
              known, never for cereals or rapeseed (combineHarvestEstimate
              :919-931). */}
          <Stagger as="dl" className="meth-scores meth-readings">
            <StaggerItem>
              <dt>{t("Plant health")}</dt>
              <dd className="meth-eq">
                NDVI = <span className="meth-whole">(B8 − B4) / (B8 + B4)</span>
              </dd>
              <dd>{t("Near-infrared against red: how green the crop is.")}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Water")}</dt>
              <dd className="meth-eq">
                NDWI = <span className="meth-whole">(B8 − B11) / (B8 + B11)</span>
              </dd>
              <dd>{t("Near-infrared against short-wave infrared: the water held in the leaves.")}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Stress")}</dt>
              <dd className="meth-eq">
                NDRE = <span className="meth-whole">(B8A − B5) / (B8A + B5)</span>
              </dd>
              <dd>{t("The share of the field weaker than the rest and than normal; the red edge reacts {lead} before NDVI.", { lead: t(FM.redEdgeLead) })}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Harvest timing")}</dt>
              <dd className="meth-eq">
                {t("ready")} = <span className="meth-whole">{t("{bare} + share·(peak − {bare})", { bare: decimal(FM.bareNdvi, t) })}</span>
              </dd>
              <dd>{t("Ready when NDVI falls back to this level (share {cereals} for cereals and rapeseed, {rowCrops} for row crops), checked by heat units and, for row crops, radar through cloud.", { cereals: decimal(FM.readyShare.cereals, t), rowCrops: decimal(FM.readyShare.rowCrops, t) })}</dd>
            </StaggerItem>
          </Stagger>

          {/* The condition: CONDITION_WEIGHTS method.js:52, conditionScore
              :88-97, the scores healthScore and waterScore :68-77 with
              HEALTH_SPAN and WATER_SPAN :55-56 (each clamped to 0..1),
              CONDITION_CLASSES :100-105, the holds in fieldCondition
              :306-311 (high stress, stressLevel :128-133; damage,
              :1076-1081), the stress rules as above; applied per field in
              server/field/analysis.js:451. */}
          <div className="meth-gate-text" id="condition">
            <Reveal>
              <p>
                <strong>{t("The condition.")}</strong> {t("One number from 0 to 1 for each field in crop, which colours it on the map: {classes}. High stress ({highStress}% of the field or more) holds it under {stressedUnder}, damage under {damagedUnder}, and a field with no crop has no condition.", { classes: rules.classes, highStress: rules.highStress, stressedUnder: rules.stressedUnder, damagedUnder: rules.damagedUnder })}
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="meth-formula">
                {t("condition")} = <span className="meth-whole">{t("{w}·health score", { w: decimal(FM.weights.plantHealth, t) })}</span> <span className="meth-whole">{t("+ {w}·water score", { w: decimal(FM.weights.water, t) })}</span> <span className="meth-whole">{t("+ {w}·(1 − stressed share)", { w: decimal(FM.weights.noStress, t) })}</span>
              </p>
              <p className="meth-formula">
                {t("health score")} = <span className="meth-whole">{t("1 + (NDVI − normal) / {span}", { span: decimal(FM.healthSpan, t) })}</span>
                <br />
                {t("water score")} = <span className="meth-whole">{t("1 + (NDWI − normal) / {span}", { span: decimal(FM.waterSpan, t) })}</span>
                <br />
                {t("each held between 0 and 1")}
              </p>
              <p className="meth-formula">
                {t("stressed")} = <span className="meth-whole">{t("NDVI < field median − {d}", { d: two(FM.stressNdvi.belowFieldMedian, t) })}</span> <span className="meth-whole">{t("and < normal − {d},", { d: two(FM.stressNdvi.belowNormal, t) })}</span> <span className="meth-whole">{t("or NDRE < field median − {d}", { d: two(FM.stressRedEdge.belowFieldMedian, t) })}</span> <span className="meth-whole">{t("and < normal − {d}", { d: two(FM.stressRedEdge.belowNormal, t) })}</span>
              </p>
            </Reveal>
          </div>
          <Reveal className="meth-gate-lab" delay={0.12} y={36}>
            <ConditionLab />
          </Reveal>

          {/* Finding the fields: WorldCover class 40 and the Canny trace,
              field-gee.js:747-781 (DETECT :244-270), the six windows (the
              early, middle and late thirds of the last two seasons,
              src/lib/season.js:300-314), the overlap docs/METHODS.md:156,
              measured on the demo farm. The crop: classifyCrop
              crops.js:741 with CROP_RULES :296-308, the radar peak and the
              red-edge gap :320 and :594; the accuracy, NUMBERS. Damage:
              RADAR_CHANGE_DB method.js:1005, in at least
              HEAVY_DAMAGE.persistSeasons war seasons (one, while only one
              is measured; atlas/method.js:96, field-gee.js:1665-1689),
              unusual fire counted since the war began, or over the last two
              years where no war covers the farm (method.js:997-999,
              atlas/method.js worstFireYear :220), DAMAGE_RULES
              method.js:1008-1013 and damageDetected :1050-1059. */}
          <Stagger as="dl" className="meth-scores meth-how">
            <StaggerItem>
              <dt>{t("Finding the fields")}</dt>
              <dd>{t("Canny edges in {pictures} Sentinel‑2 pictures of the last two seasons split ESA WorldCover’s cropland into fields from {minHa} ha. On the demo farm they overlap hand‑drawn outlines by {iou} {note}.", { pictures: inWords(FM.edgePictures, t), minHa: decimal(FM.minFieldHa, t), iou: decimal(FM.outlineIou, t), note: <span className="meth-whole">{t("(shared area ÷ combined area)")}</span> })}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("The crop")}</dt>
              <dd>{t("A phenology classifier, helped by radar and the red‑edge gap; your own choice wins. Against the USDA crop layer it named {heldOut}% of held‑out fields right, and {likely}% when it said “likely”.", { heldOut: decimal(NUMBERS.cropHeldOutPercent, t), likely: decimal(NUMBERS.cropLikelyPercent, t) })}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Damage on a field")}</dt>
              <dd>{t("Radar change of {db} dB or more in at least {seasons} growing seasons, and unusual fire (NASA FIRMS). In a war, radar change on {share}% of the field is enough; elsewhere, both are needed.", { db: FM.radarChangeDb, seasons: inWords(FM.radarSeasons, t), share: rules.damageShare })}</dd>
            </StaggerItem>
          </Stagger>
          <Reveal className="meth-limits-text" delay={0.12}>
            <p>
              <strong>{t("What it cannot see.")}</strong> {t("Which pest or disease is at work; mines and unexploded ordnance (a field with no damage found is not a safe field); a line between look‑alike fields.")}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec" id="atlas" aria-labelledby="meth-atlas">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-atlas">
              Atlas
            </h2>
          </Reveal>
          <Reveal className="meth-body" delay={0.08}>
            <p className="pg-lead meth-what">{t("Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start. Ukraine is the demo because that is where Chernozem started.")}</p>
          </Reveal>
          <Reveal className="meth-film" delay={0.1} y={30}>
            <Walkthrough product="atlas" title={t("The Atlas walkthrough")} />
          </Reveal>

          <Reveal className="meth-scores-intro" id="scores">
            <p>{t("{scores}, each from 0 to 100. Value and damage make the priority; feasibility decides whether a square is ranked now or later.", { scores: <strong>{t("Three scores")}</strong> })}</p>
          </Reveal>
          <Stagger as="dl" className="meth-scores">
            <StaggerItem>
              <dt>{t("Value")}</dt>
              <dd>{t("How likely the soil is black soil, and how much of the square is cropland.")}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Damage")}</dt>
              <dd>{t("Unusual fire and lasting radar change since the crisis began, against the same seasons in 2019 to 2021.")}</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>{t("Feasibility")}</dt>
              <dd>{t("Distance to recorded fighting; 100 km or more counts as fully feasible.")}</dd>
            </StaggerItem>
          </Stagger>

          <div className="meth-gate-text" id="gate">
            <Reveal>
              <p>
                <strong>{t("The gate.")}</strong> {t("Near term: the least feasible {percentile}% of squares are left out, with a soft edge of {ramp}, and the rest are ranked by value and damage.", { percentile: NUMBERS.gatePercentile, ramp: decimal(NUMBERS.rampWidth, t) })}
              </p>
              <p>{t("Post-crisis: feasibility becomes a pace factor. The three scores are combined in a weighted power mean with weights {value} / {damage} / {feasibility} and exponent {exponent}. Move the sliders and watch what the two time frames do with one place.", { value: w.value * 100, damage: w.damage * 100, feasibility: w.feasibility * 100, exponent: decimal(NUMBERS.postExponent, t) })}</p>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="meth-formula">{t("Near term: priority = ({v}·value{half} + {d}·damage{half}){squared}, faded in over the {ramp} ramp above the cutoff; below it, left out", { v: nearShares.value, d: nearShares.damage, half, squared, ramp: decimal(NUMBERS.rampWidth, t) })}</p>
              <p className="meth-formula">{t("Post-crisis: priority = ({v}·value{half} + {d}·damage{half} + {f}·feasibility{half}){squared}", { v: decimal(w.value, t), d: decimal(w.damage, t), f: decimal(w.feasibility, t), half, squared })}</p>
            </Reveal>
          </div>
          <Reveal className="meth-gate-lab" delay={0.12} y={36}>
            <GateLab />
          </Reveal>

          <Reveal className="meth-demo-head" id="demo">
            <p>
              <strong>{t("Ukraine, ranked.")}</strong> {t("The real {month} reading of {n} squares, as the app shows it: the top of the list for each time frame, and the whole country on the map.", { month: t(NUMBERS.ukraineMonth), n: formatInt(NUMBERS.ukraineSquares) })}
            </p>
          </Reveal>
          <Reveal className="meth-demo-stage" delay={0.12} y={36}>
            {/* The owner's own demo, untouched: a piece of the product, with the product's look. */}
            <div data-ui>
              <DemoRanking />
            </div>
          </Reveal>
          <Reveal className="meth-demo-link" delay={0.16}>
            <Link className="pg-btn pg-btn-light" to={SITE_ACTIONS.demo.path}>
              {t("Open the demo")}
            </Link>
          </Reveal>

          <Reveal className="meth-checks-intro" id="checks">
            <p>
              <strong>{t("Checked against independent records.")}</strong> {t("The app’s readings beside Copernicus’s maps of three disasters and the USDA crop layer, and the paper’s damage score beside ACLED’s record of fighting.")}
            </p>
          </Reveal>
          <Reveal className="meth-checks-table" delay={0.08} y={24}>
            <ProofTable />
          </Reveal>
          <Reveal className="meth-limits-text" delay={0.12}>
            <p>
              <strong>{t("What it cannot do.")}</strong> {t("A screen, not a survey. Ten-metre pixels miss small fields; clouds delay optical readings; radar change is less reliable where 2019 to 2021 were not calm; and it never declares land safe.")}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-dark" id="technology" aria-labelledby="meth-behind">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-behind">
              {t("Behind it")}
            </h2>
          </Reveal>
          <div className="meth-tech-body">
            <Reveal delay={0.08}>
              <p>
                <strong>{t("What it reads:")}</strong> {t("{list}, {count} open datasets, each read against its own normal years.", { list: listOf(DATASETS.map((item) => item.name), t), count: DATASETS.length })}
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <p id="design">
                <strong>{t("Built with:")}</strong> {t("{list}. More than {tests} automated tests. Drawn as a mockup first, then built.", { list: listOf(STACK.map((item) => item.name), t), tests: formatInt(testsFloor) })}
              </p>
            </Reveal>
            <Reveal className="meth-accounts" delay={0.16}>
              <p>{t("Accounts run on Firebase (Google, or e‑mail and password); your fields, readings and reports are kept on our own server and never sold, and messages from the contact page are kept on our server and e‑mailed to {email}. When you ask the assistant, your question and your fields’ readings go to Anthropic’s Claude to be answered; the satellite maths runs on Google Earth Engine.", { email: CONTACT_EMAIL })}</p>
              <p>
                {t("{code}, and {data}.", {
                  code: (
                    <a className="pg-link" href={LINKS.github} target="_blank" rel="noreferrer">
                      {t("The code is public on GitHub")}
                    </a>
                  ),
                  data: (
                    <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                      {t("the research data and code are on Harvard Dataverse")}
                    </a>
                  ),
                })}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* The three-minute film, moved here from the About page: its name
          across the top, the film across the frame, its chapters under it
          (Film.jsx brings its own entrance: the frame opens, the chapters
          rise). On the surface tone: its white title slide would melt into
          the page's lighter ground, and the dark field is "Behind it"'s. */}
      <section className="pg-sec pg-sec-surface" id="film" aria-labelledby="meth-film-title">
        <div className="pg-grid">
          <Reveal className="meth-film-head">
            <h2 className="pg-h2" id="meth-film-title">
              {t("Chernozem in three minutes")}
            </h2>
          </Reveal>
          <div className="meth-film">
            <Film />
          </div>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage" aria-labelledby="meth-close">
        <div className="pg-grid">
          <Reveal className="meth-close-head">
            <h2 className="pg-h2" id="meth-close">
              {t("Run it on your own land")}
            </h2>
          </Reveal>
          <Reveal className="meth-close-act" delay={0.1}>
            <p>{t("Register for Chernozem and read the first pass yourself. The demo is open to everyone and read-only.")}</p>
            <div className="pg-actions">
              <Link className="pg-btn" to={SITE_ACTIONS.register.path}>
                {t("Register")}
              </Link>
              <Link className="pg-link" to={SITE_ACTIONS.demo.path}>
                {t("Try the demo")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
