// WHAT THIS FILE DOES
// The home page's interactive demo of the gate: a real map of Ukraine's
// oblasts coloured by the app's priority, with a switch between Near term
// (the least feasible oblasts are left out of the ranking) and Post-crisis
// (every oblast is blended in). Switching recolours the map and the Top 10
// list slides into its new order; hovering or tapping an oblast shows its
// three scores. The numbers are the app's own, for the month named in the
// data (public/site/ukraine-demo.json, built by scripts/site-demo-data.js).
// Every sentence a visitor reads goes through t() (namespace "ranking",
// src/site/i18n/); the oblast names, the month and Crimea's note come from
// the data file in English and are translated the same way.
//
// WHO EDITS IT
// Whoever works on the home page. Rebuild the data file after a new month
// rather than editing it by hand.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "./motion.jsx";
import { compactHa, formatInt } from "../content/site.js";
import { useT } from "../i18n/i18n.js";
import "./demo.css";

const DATA_URL = "/site/ukraine-demo.json";
const SHADES = ["#e3ece2", "#b9d5bd", "#7fb08e", "#3f8159", "#1b4a31"];
const TOP = 10;
const EXCLUDED = "#ddd7c9";

// Equirectangular: longitude stretched by cos(latitude) so the shape is
// right, fitted into a 1000-unit-wide box.
function makeProjection(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const cosMid = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const width = 1000;
  const scale = width / ((maxLon - minLon) * cosMid);
  const height = (maxLat - minLat) * scale;
  return {
    width,
    height,
    point: ([lon, lat]) => [((lon - minLon) * cosMid * scale).toFixed(1), ((maxLat - lat) * scale).toFixed(1)],
  };
}

function pathFor(rings, project) {
  return rings.map((ring) => `M${ring.map((p) => project.point(p).join(",")).join("L")}Z`).join("");
}

// Names in a row, separated the way the language does it ("a, b, c" in
// English and Ukrainian, "a、b、c" in Chinese).
function listOf(locale, items) {
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(items);
}

// The shade of an oblast: by its rank among the ranked ones (darkest fifth
// first); left out or unranked gets the lightest.
function shadeFor(unit, frame, ranked) {
  if (unit.excluded) return EXCLUDED;
  const info = unit[frame];
  if (!info || info.rank == null || info.leftOut) return SHADES[0];
  const step = Math.min(4, Math.floor(((info.rank - 1) / ranked) * 5));
  return SHADES[4 - step];
}

export default function DemoRanking() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [frame, setFrame] = useState("nearTerm");
  const [picked, setPicked] = useState(null);
  const reduced = useReducedMotion();
  const t = useT("ranking");

  useEffect(() => {
    let alive = true;
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((json) => alive && setData(json))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const project = useMemo(() => (data ? makeProjection(data.bbox) : null), [data]);
  const paths = useMemo(() => (data ? data.units.map((unit) => ({ id: unit.id, d: pathFor(unit.rings, project) })) : []), [data, project]);
  const ranked = data ? data.timeframes[frame === "nearTerm" ? "nearTerm" : "postCrisis"].ranked : 1;

  const top = useMemo(() => {
    if (!data) return [];
    return data.units
      .filter((unit) => unit[frame] && unit[frame].rank != null && !unit[frame].leftOut)
      .sort((a, b) => a[frame].rank - b[frame].rank)
      .slice(0, TOP);
  }, [data, frame]);

  const current = picked ? data?.units.find((unit) => unit.id === picked) : null;

  // The oblasts the near term leaves out, with their post-crisis ranks.
  const returning = useMemo(() => {
    if (!data) return [];
    return data.units
      .filter((unit) => unit.nearTerm?.leftOut && unit.postCrisis?.rank != null)
      .sort((a, b) => a.postCrisis.rank - b.postCrisis.rank);
  }, [data]);
  const excludedUnits = data ? data.units.filter((unit) => unit.excluded) : [];

  if (error) {
    return (
      <div className="demo demo-empty">
        <p className="muted">{t("The demo data is not available right now. Open the app to see the live ranking.")}</p>
      </div>
    );
  }

  return (
    <div className={`demo${data ? "" : " is-loading"}`}>
      <div className="demo-head">
        <div className="demo-switch" role="tablist" aria-label={t("Time frame")}>
          {[
            ["nearTerm", "Near term"],
            ["postCrisis", "Post-crisis"],
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={frame === key} className={`demo-tab${frame === key ? " is-on" : ""}`} onClick={() => setFrame(key)}>
              {frame === key && <motion.span layoutId="demo-tab-pill" className="demo-tab-pill" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
        <p className="demo-note">
          {frame === "nearTerm"
            ? returning.length
              ? t("The gate: the least feasible {percent}% of black soil is left out for now ({count} oblasts, hatched), then value and damage set the order.", { percent: data?.settings?.cutoffPercent ?? 30, count: returning.length })
              : t("The gate: the least feasible {percent}% of black soil is left out for now, then value and damage set the order.", { percent: data?.settings?.cutoffPercent ?? 30 })
            : returning.length
              ? t("No gate: all three scores are blended, so the land left out comes back: {list}.", {
                  list: listOf(
                    t.locale,
                    returning.map((unit) => t("{name} #{rank}", { name: t(unit.name), rank: unit.postCrisis.rank })),
                  ),
                })
              : t("No gate: value, damage and feasibility are blended.")}
        </p>
      </div>

      <div className="demo-body">
        <div className="demo-map">
          {data && (
            <svg viewBox={`0 0 ${project.width} ${project.height}`} role="img" aria-label={frame === "nearTerm" ? t("Map of Ukraine's oblasts coloured by near-term priority") : t("Map of Ukraine's oblasts coloured by post-crisis priority")}>
              <defs>
                <pattern id="demo-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#8c877a" strokeWidth="1.4" />
                </pattern>
              </defs>
              {data.units.map((unit, index) => {
                const info = unit[frame];
                const out = unit.excluded || !info || info.rank == null || info.leftOut;
                const shade = shadeFor(unit, frame, ranked);
                const isPicked = picked === unit.id;
                return (
                  <g key={unit.id} className={`demo-unit${isPicked ? " is-picked" : ""}${out ? " is-out" : ""}`} onMouseEnter={() => setPicked(unit.id)} onMouseLeave={() => setPicked(null)} onClick={() => setPicked(isPicked ? null : unit.id)}>
                    <path d={paths[index].d} fill={shade} style={{ transition: reduced ? "none" : `fill 0.7s ${0.015 * index}s cubic-bezier(.22,1,.36,1)` }} />
                    {out && <path d={paths[index].d} fill="url(#demo-hatch)" opacity={unit.excluded ? 0.25 : 0.5} pointerEvents="none" />}
                  </g>
                );
              })}
              {data.units.map((unit) => {
                const info = unit[frame];
                if (!info || info.rank == null || info.leftOut || info.rank > 5) return null;
                const [x, y] = project.point([unit.labelPoint.lon, unit.labelPoint.lat]);
                return (
                  <g key={`${unit.id}-label`} className="demo-label" pointerEvents="none">
                    <text x={x} y={y}>
                      {info.rank}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          <AnimatePresence>
            {current && (
              <motion.div className="demo-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}>
                <strong>{t(current.name)}</strong>
                <span className="demo-tip-rank">
                  {current.excluded
                    ? current.note && t(current.note)
                    : current[frame]?.leftOut
                    ? t("Left out for now: among the least feasible")
                    : current[frame]?.rank != null
                      ? frame === "nearTerm"
                        ? t("#{rank} near term", { rank: current[frame].rank })
                        : t("#{rank} post-crisis", { rank: current[frame].rank })
                      : t("Not ranked")}
                </span>
                {current.scores && (
                  <dl>
                    <dt>{t("Value")}</dt>
                    <dd>{Math.round(current.scores.value * 100)}</dd>
                    <dt>{t("Damage")}</dt>
                    <dd>{Math.round(current.scores.damage * 100)}</dd>
                    <dt>{t("Feasibility")}</dt>
                    <dd>{Math.round(current.scores.access * 100)}</dd>
                  </dl>
                )}
                <span className="demo-tip-ha">
                  {t("{ha} ha heavily damaged · {people} people living on damaged black soil", {
                    ha: compactHa(current.heavyDamageHa),
                    people: formatInt(current.peopleOnDamagedSoil),
                    peopleCount: current.peopleOnDamagedSoil,
                  })}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="demo-key" aria-hidden="true">
            <span>{t("Lower priority")}</span>
            <i style={{ background: `linear-gradient(90deg, ${SHADES.join(",")})` }} />
            <span>{t("Start here")}</span>
          </div>
        </div>

        <div className="demo-list">
          <div className="demo-list-head">
            <span>{t("Top {top} of {total} oblasts", { top: TOP, total: data ? data.timeframes.postCrisis.ranked : "…" })}</span>
            <span className="muted">{data?.area?.monthLabel && t(data.area.monthLabel)}</span>
          </div>
          <ol>
            <AnimatePresence initial={false} mode="popLayout">
              {top.map((unit) => {
                const change = unit.rankChange;
                return (
                  <motion.li
                    key={unit.id}
                    layout={!reduced}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`demo-row${picked === unit.id ? " is-picked" : ""}`}
                    onMouseEnter={() => setPicked(unit.id)}
                    onMouseLeave={() => setPicked(null)}
                  >
                    <span className="demo-row-rank">{unit[frame].rank}</span>
                    <span className="demo-row-name">{t(unit.name)}</span>
                    <span className="demo-row-bar">
                      <i style={{ width: `${Math.max(4, Math.round(unit[frame].priority * 100))}%`, background: shadeFor(unit, frame, ranked) }} />
                    </span>
                    <span className="demo-row-score mono">{Math.round(unit[frame].priority * 100)}</span>
                    {frame === "postCrisis" && typeof change === "number" && change !== 0 && (
                      <span className={`demo-row-change ${change > 0 ? "is-up" : "is-down"}`} title={t("Change from the near-term rank")}>
                        {change > 0 ? "▲" : "▼"} {Math.abs(change)}
                      </span>
                    )}
                    {frame === "nearTerm" && unit.postCrisis && unit.postCrisis.rank != null && unit.postCrisis.rank - unit.nearTerm.rank !== 0 && (
                      <span className="demo-row-change is-quiet" title={t("Its post-crisis rank")}>
                        {t("→ #{rank}", { rank: unit.postCrisis.rank })}
                      </span>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
          {data && (
            <p className="demo-foot muted">
              {[
                frame === "nearTerm" && data.timeframes.nearTerm.leftOutCount > 0 && t("{count} oblasts are left out of the near-term ranking for now.", { count: data.timeframes.nearTerm.leftOutCount }),
                excludedUnits.length > 0 && t("{names} is not ranked, as in the research paper (occupied since 2014).", { names: listOf(t.locale, excludedUnits.map((unit) => t(unit.name))) }),
                t("Default weights {soil}/{damage}/{access}; the app lets you change them.", { soil: data.settings.weights.soil, damage: data.settings.weights.damage, access: data.settings.weights.access }),
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
