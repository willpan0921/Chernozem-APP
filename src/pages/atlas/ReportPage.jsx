// WHAT THIS FILE DOES
// The printable report (/atlas/report), opened by "Report" on the
// overview. For the current area and month it shows where the data came
// from, the four totals, the top 10 places for Near term and for Postwar
// (called Long term at peace), the settings as the rankings use them, this
// month's alerts, the method and the disclaimer (mine risk and deminers
// only inside a known war, run.conflict; at peace a plain "check the land
// on the ground").
// The method says what the damage score and safe access really are for
// this run (overview.js damageMeaning, accessMeaning): in a war, unusual
// fire and radar change, and distance to fighting; at peace, the heavily
// damaged share of the black soil, and "everywhere counts as safe to
// reach" (never "distance to fighting"); in a war where no fire looked
// like fighting (overview.js noFightingFound), that safe access is not
// measured here: nothing is set aside, the tables' Access column shows
// "–", and the CSV leaves safe access and distance empty, never a full
// 100 (or 1) in a war zone.
// Everything is worked out from the selected run and the team's current
// weights, so it always matches what the map shows. The month is kept in
// the address (?month=2026-09), so a shared link opens the same month. Top
// areas get the same names as on the overview and the map (place names,
// else "North-west", "East"…), with the coordinates under the name; the
// black-soil column gives each group's size ("12 squares"), so groups with
// the same name in the two lists can be told apart. Priority is shown
// 0–100 (100 = the best square in that time frame).
//
// "Save as PDF" opens the browser's print window (pick "Save as PDF"
// there). When printed, the sidebar and the buttons are hidden.
// "Download CSV" saves every map square with its scores as a spreadsheet
// (src/lib/atlas/reportCsv.js cellsCsv).
//
// WHO EDITS IT
// Whoever changes what goes into the report.

import { useEffect, useMemo } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, Badge } from "../../components/ui/index.js";
import { AtlasGate, useAtlasData, useTimeframe } from "../../state/AtlasData.jsx";
import { accessMeaning, accessMeasured, alertPlaces, atPeace, damageMeaning, describeAlert, imageryText, kpis, longTermAccessNote, nearTermSetAside, noFightingFound, notMeasuredReason, seasonWords, shownNewDamage, summarize, timeframeLabel } from "../../lib/atlas/overview.js";
import { cellsCsv } from "../../lib/atlas/reportCsv.js";
import { formatHaShort, listNames } from "../../lib/format.js";
import { atlasLink, haFixed, nameAreas, priorityIndex, useMonthInUrl, warNote, weightItems } from "./overviewHelpers.js";
import "./ReportPage.css";

export default function ReportPage() {
  // Wait while a month from the address (?month=) is switched to.
  const switchingMonth = useMonthInUrl();
  return <AtlasGate>{switchingMonth ? null : <Report />}</AtlasGate>;
}

// Today in full, so a saved PDF is never ambiguous: "18 October 2026".
function fullDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// "Ukraine" -> "ukraine", "My farm (north)" -> "my-farm-north".
function slug(text) {
  return (
    String(text || "area")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "area"
  );
}

// The indicator names in plain words, for the method line.
const INDICATOR_NAMES = {
  wrb: "black-soil share",
  agOutput: "cropland share",
  firms: "unusual fire detections",
  radar: "radar change",
  chi: "soil-health decline",
  distance: "distance to fighting",
  population: "population",
  lights: "night lights",
};
// "damage is the mean of fire detections and soil-health decline".
function madeOf(label, list = []) {
  const words = list.map((key) => INDICATOR_NAMES[key] || key);
  return words.length === 1 ? `${label} is ${words[0]}` : `${label} is the mean of ${listNames(words)}`;
}

function downloadCsv(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before letting go.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Report() {
  const { area, run, runs, scored, hotspots, settings } = useAtlasData();
  const [timeframe] = useTimeframe();
  const summary = useMemo(() => summarize(scored.places), [scored]);
  const nearTerm = useMemo(() => nameAreas(hotspots.nearTerm), [hotspots]);
  const postwar = useMemo(() => nameAreas(hotspots.postwar), [hotspots]);
  const alerts = run.alerts || [];
  const fromEarthEngine = run.provider === "gee";
  const prepared = fullDate();
  const war = warNote(run);
  const title = `${area.name} · ${run.label}`;
  const fileBase = `chernozem-${slug(area.name)}-${run.month}`;

  // The PDF is named after the page title, so set it while the report is open.
  useEffect(() => {
    const before = document.title;
    document.title = `Chernozem report – ${area.name} – ${run.label}`;
    return () => {
      document.title = before;
    };
  }, [area.name, run.label]);

  const comp = run.method?.components || {};
  const longTerm = timeframeLabel("postwar", run);
  // At peace without an ACLED file safe access is full everywhere: there
  // is no cutoff, and it changes no order (scoring.js).
  // Alerts named as on the Overview and in the AI (overview.js alertPlaces).
  const alertNames = alertPlaces(run.alerts || []);
  const measured = accessMeasured(run);
  // Why nothing is set aside, in the run's own words: "no war recorded",
  // "not at war, set by your team" (never "no war recorded" over a war the
  // team overrode), "before the war, which began on 1 June 2026", or, in a
  // war where no fire looked like fighting, "safe access not measured here"
  // (overview.js notMeasuredReason).
  const quiet = notMeasuredReason(run);
  const nearTermWeights = weightItems(settings, "nearTerm")
    .filter((item) => measured || item.key !== "access")
    .map((item) => item.text)
    .concat(measured ? [] : [`nothing set aside (${quiet?.note || "no war recorded"})`])
    .join(" · ");
  // Safe access not measured in a war (no fire looked like fighting): the
  // tables show "–" for it, not 100.
  const accessUnknown = noFightingFound(run);

  return (
    <div className="page rp-page">
      <div className="rp-toolbar">
        <Button to={atlasLink("/atlas", { month: run.month, timeframe })} icon={<ArrowLeft size={14} />}>
          Overview
        </Button>
        <span className="rp-spacer" />
        <Button icon={<Download size={14} />} onClick={() => downloadCsv(cellsCsv(scored.places, run.cellSizeDeg, { accessUnknown }), `${fileBase}.csv`)}>
          Download CSV
        </Button>
        <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
          Save as PDF
        </Button>
      </div>

      <article className="card rp-doc">
        <header className="rp-head">
          <span className="eyebrow">Chernozem Recovery Atlas</span>
          <h1>{title}</h1>
          <p className="rp-meta">
            {fromEarthEngine ? <Badge tone="green">Earth Engine</Badge> : <Badge tone="amber">Sample data · not satellite measurements</Badge>}
            <span>{imageryText(run)}</span>
            <span>Prepared {prepared}</span>
          </p>
          {war && <p className="rp-meta">{war.line}</p>}
        </header>

        <section className="rp-kpis">
          {kpis(summary, run).map((kpi) => (
            <div key={kpi.id} className="rp-kpi">
              <span className={kpi.tone === "red" && kpi.value !== "0 ha" ? "rp-kpi-value rp-red" : "rp-kpi-value"}>{kpi.value}</span>
              <span className="rp-kpi-label">{kpi.label}</span>
            </div>
          ))}
        </section>
        {shownNewDamage(run, runs) > 0 && (
          <p className="rp-line">
            New heavy damage this month: <strong className="rp-red">+{formatHaShort(run.newHeavyDamageHa)}</strong>
            {/* The month a growing season joined the damage radar: most of
                the increase is older damage (overview.js seasonWords). */}
            {seasonWords(run, runs)?.jump && ` (mostly ${seasonWords(run, runs).jump.what}: ${seasonWords(run, runs).jump.why})`}
          </p>
        )}

        <section className="rp-section">
          <h2>Top 10 · Near term</h2>
          <TopTable list={nearTerm} accessUnknown={accessUnknown} />
        </section>

        <section className="rp-section">
          <h2>Top 10 · {longTerm}</h2>
          <TopTable list={postwar} accessUnknown={accessUnknown} />
        </section>

        <section className="rp-section">
          <h2>Settings used</h2>
          <dl className="rp-settings">
            <div>
              <dt>Near term</dt>
              <dd>
                {nearTermWeights}
                {measured && settings.gatePercentile > 0 && Math.round((scored.setAsideShare ?? 0) * 100) !== settings.gatePercentile
                  ? ` (${Math.round((scored.setAsideShare ?? 0) * 100)}% of black soil set aside in practice)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>{longTerm}</dt>
              <dd>
                {weightItems(settings, "postwar").map((item) => item.text).join(" · ")}
                {longTermAccessNote(run)}
              </dd>
            </div>
            <div>
              <dt>Squares</dt>
              <dd>
                {run.cellCount.toLocaleString("en-US")} squares, {run.cellSizeKm < 1 ? `${Math.round(run.cellSizeKm * 1000)} m` : `${run.cellSizeKm.toFixed(1)} km`} wide
              </dd>
            </div>
          </dl>
        </section>

        <section className="rp-section">
          <h2>Alerts</h2>
          {alerts.length === 0 ? (
            <p className="rp-line">None this month.</p>
          ) : (
            <ul className="rp-alerts">
              {alerts.map((alert) => {
                const view = describeAlert(alert);
                return (
                  <li key={alert.id}>
                    <strong>{view.title}</strong>
                    <span>{alertNames.get(alert.id) || view.place}</span>
                    <span className="rp-mono">{view.detail}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rp-section rp-method">
          <h2>Method</h2>
          <p>
            {madeOf("Soil value", comp.soil)}. Damage is {damageMeaning(run)}. Safe access is {accessMeaning(run)}. Each is scaled 0–1 on fixed
            scales.{" "}
            {nearTermSetAside(run, settings)}{" "}
            {longTerm} blends all three (weighted power mean, r = {settings.r}). The soil-health index (chi) is a diagnostic in the CSV, not part
            of the damage score. In the tables the three scores are shown 0–100, and priority is each area's score as a share of the best
            square in that time frame (100 = the best).{" "}
            {accessUnknown
              ? "The exact scores are in the CSV, where safe access and distance to fighting are left empty: they are not measured here."
              : "The exact scores are in the CSV."}
          </p>
          {/* A month before its war began keeps the deminers' line: the
              area is at war now, and the land may be mined since. */}
          {atPeace(run) ? (
            <p className="rp-disclaimer">
              Scores show model priority from satellite data, not proven restoration results. They do not replace field sampling or local
              advice: check the land on the ground before you act on it.
            </p>
          ) : (
            <p className="rp-disclaimer">
              Scores show model priority, not proven restoration results. They do not replace field sampling, mine-risk assessment or local
              consultation. Only certified deminers can decide whether land is safe.
            </p>
          )}
        </section>
      </article>
    </div>
  );
}

// 0.734 -> 73 (the three scores are 0–1).
const outOf100 = (value) => (Number.isFinite(value) ? Math.round(value * 100) : "–");

// One ranking: rank, area (name, then coordinates), black-soil hectares
// with the group's size, damaged hectares, the three scores and the
// priority, all 0–100. accessUnknown: safe access is not measured in this
// run (no fire looked like fighting), so its column shows "–".
function TopTable({ list, accessUnknown = false }) {
  if (!list.length) return <p className="rp-line">No place qualifies with these settings.</p>;
  return (
    <div className="table-wrap">
      <table className="table rp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Area</th>
            <th className="num">Black soil</th>
            <th className="num">Heavily damaged</th>
            <th className="num">Soil</th>
            <th className="num">Damage</th>
            <th className="num">Access</th>
            <th className="num">Priority</th>
          </tr>
        </thead>
        <tbody>
          {list.map((item) => (
            <tr key={item.id}>
              <td>{item.rank}</td>
              <td className="rp-place">
                <span className="rp-place-name">{item.title}</span>
                {item.point && <span className="rp-place-coords">{item.point}</span>}
              </td>
              <td className="num">
                <span className="rp-ha">{haFixed(item.blackSoilHa)}</span>
                {item.size && <span className="rp-size">{item.size}</span>}
              </td>
              <td className="num">{haFixed(item.heavyDamageHa)}</td>
              <td className="num">{outOf100(item.soil)}</td>
              <td className="num">{outOf100(item.damage)}</td>
              <td className="num">{accessUnknown ? "–" : outOf100(item.access)}</td>
              <td className="num rp-score">{priorityIndex(item) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
