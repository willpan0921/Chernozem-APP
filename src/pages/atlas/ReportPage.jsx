// WHAT THIS FILE DOES
// The printable report (/atlas/report), opened by "Report" on the
// overview. For the current area and month it shows where the data came
// from, the four totals, the top 10 places for Near term and for Postwar,
// the settings used, this month's alerts, the method in one line and the
// disclaimer. Everything is worked out from the selected run and the team's
// current weights, so it always matches what the map shows. The month is
// kept in the address (?month=2026-09), so a shared link opens the same
// month. Top areas get the same names as on the overview and the map
// (place names, else "North-west", "East"…), with the coordinates under
// the name, and their
// priority is shown 0–100 (100 = the best square in that time frame).
//
// "Save as PDF" opens the browser's print window (pick "Save as PDF"
// there). When printed, the sidebar and the buttons are hidden.
// "Download CSV" saves every map square with its scores as a spreadsheet.
//
// WHO EDITS IT
// Whoever changes what goes into the report.

import { useEffect, useMemo } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, Badge } from "../../components/ui/index.js";
import { AtlasGate, useAtlasData, useTimeframe } from "../../state/AtlasData.jsx";
import { placeLabel } from "../../lib/atlas/hotspots.js";
import { atPeace, describeAlert, imageryText, kpis, summarize, timeframeLabel } from "../../lib/atlas/overview.js";
import { formatHaShort, listNames } from "../../lib/format.js";
import { toCsv } from "../../lib/csv.js";
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
  wrb: "chernozem probability",
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

const round = (value, digits) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : "");

// One spreadsheet row per map square: where it is, its hectares and
// people, the three scores and both rankings, and the raw indicators.
export function cellsCsv(places, cellSizeDeg) {
  const rows = places.map((place) => ({
    cell_id: place.id,
    place: placeLabel(place, cellSizeDeg),
    lat: place.lat,
    lon: place.lon,
    admin1: place.admin1 || "",
    admin2: place.admin2 || "",
    cropland_ha: round(place.croplandHa, 1),
    black_soil_ha: round(place.blackSoilHa, 1),
    heavy_damage_ha: round(place.heavyDamageHa, 1),
    people: round(place.people, 0),
    people_on_damaged_soil: round(place.peopleOnDamagedSoil, 0),
    soil_value: round(place.soil, 4),
    damage: round(place.damage, 4),
    safe_access: round(place.access, 4),
    near_term_rank: place.nearTerm.rank ?? "",
    near_term_score: round(place.nearTerm.score, 4),
    near_term_tier: place.nearTerm.tier,
    postwar_rank: place.postwar.rank ?? "",
    postwar_score: round(place.postwar.score, 4),
    postwar_tier: place.postwar.tier,
    wrb: place.wrb,
    ag_output: place.agOutput,
    firms: place.firms,
    radar: place.radar,
    chi: place.chi,
    distance: place.distance,
    population: place.population,
    lights: place.lights,
  }));
  // Best Postwar rank first, unranked squares last.
  rows.sort((a, b) => (a.postwar_rank || Infinity) - (b.postwar_rank || Infinity));
  return toCsv(rows);
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
  const { area, run, scored, hotspots, settings } = useAtlasData();
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

  return (
    <div className="page rp-page">
      <div className="rp-toolbar">
        <Button to={atlasLink("/atlas", { month: run.month, timeframe })} icon={<ArrowLeft size={14} />}>
          Overview
        </Button>
        <span className="rp-spacer" />
        <Button icon={<Download size={14} />} onClick={() => downloadCsv(cellsCsv(scored.places, run.cellSizeDeg), `${fileBase}.csv`)}>
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
        {run.newHeavyDamageHa > 0 && (
          <p className="rp-line">
            New heavy damage this month: <strong className="rp-red">+{formatHaShort(run.newHeavyDamageHa)}</strong>
          </p>
        )}

        <section className="rp-section">
          <h2>Top 10 · Near term</h2>
          <TopTable list={nearTerm} />
        </section>

        <section className="rp-section">
          <h2>Top 10 · {timeframeLabel("postwar", run)}</h2>
          <TopTable list={postwar} />
        </section>

        <section className="rp-section">
          <h2>Settings used</h2>
          <dl className="rp-settings">
            <div>
              <dt>Near term</dt>
              <dd>
                {weightItems(settings, "nearTerm").map((item) => item.text).join(" · ")}
                {settings.gatePercentile > 0 && Math.round((scored.setAsideShare ?? 0) * 100) !== settings.gatePercentile
                  ? ` (${Math.round((scored.setAsideShare ?? 0) * 100)}% of black soil set aside in practice)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>{timeframeLabel("postwar", run)}</dt>
              <dd>{weightItems(settings, "postwar").map((item) => item.text).join(" · ")}</dd>
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
                    <span>{view.place}</span>
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
            {madeOf("Soil value", comp.soil)}; {madeOf("damage", comp.damage)}; {madeOf("safe access", comp.access)}. Each indicator is
            scaled 0–1 on fixed scales.{" "}
            {atPeace(run) && run.accessSource !== "acled"
              ? "No war in the app's list covers this area, so distance to fighting is not measured and nothing is set aside for it (this does not mean the land is safe); Near term ranks by soil value and damage"
              : `Near term sets aside the least safe ${settings.gatePercentile}% of black soil (the squares nearest the fighting; squares 100 km or more from any recorded fighting are never set aside) and ranks the rest by soil value and damage`}
            ; {timeframeLabel("postwar", run)} blends all three (weighted power mean, r = {settings.r}). The soil-health index (chi) is a diagnostic in the CSV, not part of the damage score. In the
            tables, soil value, damage and safe access are shown 0–100, and priority is each area's score as a share of the best square
            in that time frame (100 = the best). The exact scores are in the CSV.
          </p>
          <p className="rp-disclaimer">
            Scores show model priority, not proven restoration results. They do not replace field sampling, mine-risk assessment or local
            consultation. Only certified deminers can decide whether land is safe.
          </p>
        </section>
      </article>
    </div>
  );
}

// 0.734 -> 73 (the three scores are 0–1).
const outOf100 = (value) => (Number.isFinite(value) ? Math.round(value * 100) : "–");

// One ranking: rank, area (name, then coordinates), black-soil and damaged
// hectares, the three scores and the priority, all 0–100.
function TopTable({ list }) {
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
                {item.coords && <span className="rp-place-coords">{item.coords}</span>}
              </td>
              <td className="num">{haFixed(item.blackSoilHa)}</td>
              <td className="num">{haFixed(item.heavyDamageHa)}</td>
              <td className="num">{outOf100(item.soil)}</td>
              <td className="num">{outOf100(item.damage)}</td>
              <td className="num">{outOf100(item.access)}</td>
              <td className="num rp-score">{priorityIndex(item) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
