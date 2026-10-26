// WHAT THIS FILE DOES
// The Atlas AI page (/atlas/ai): chat with Chernozem AI (Claude) about the
// current area. It is the shared chat screen (src/components/chat) wired to
// the Atlas's live data:
//   - every question is sent with the month on screen, the user's weights,
//     Near term or Postwar, and (from the map's "Ask AI") the chosen place,
//     so the answers use the same numbers as the rest of the Atlas
//   - the right column ("Using") shows exactly that, and is where the month
//     and Near term / Postwar are changed: area, month, ranking, data
//     source, weights (and the place, with an x to stop using it)
//   - /atlas/ai?about=<square or top-area id> puts "Tell me about <place>"
//     in the message box (the x empties the box again if it is unchanged);
//     /atlas/ai?state=<name>&facts=<the map's numbers for it> (a state's
//     "Ask AI" on the map) puts "Tell me about the squares in <name>. On the
//     map's States view it is ranked 3 of 20 by state (near term), value
//     72, ..." there: the AI's data has the squares, not the states'
//     ranking, so the question carries the page's own numbers
//   - the "Try asking" questions suit the size of the area: a farm gets
//     farm questions, a region or country gets budget and donor questions
//
// The chats are saved on the server (server/.data/chats/). The AI answers
// once ANTHROPIC_API_KEY is in .env; until then the page shows the three
// steps to connect it.
//
// WHO EDITS IT
// Danny owns the chat building blocks in src/components/chat. The starter
// questions and the message-box text are in src/data/chats.js.

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import RunPicker from "../../components/atlas/RunPicker.jsx";
import { Segmented } from "../../components/ui/index.js";
import { AtlasGate, useAtlasData, useTimeframe } from "../../state/AtlasData.jsx";
import { findFocus, placeLabel } from "../../lib/atlas/hotspots.js";
import { weightItems } from "./overviewHelpers.js";
import { atPeace, disasterType, noFightingFound, outsideWar, timeframeOptions } from "../../lib/atlas/overview.js";
import { atlasStarterQuestions, SMALL_AREA_HA, composer } from "../../data/chats.js";

// The Near term | Postwar switch ("Long term" where no war is listed): timeframeOptions(run).

// $10,000,000 -> "$10M", $2,500,000 -> "$2.5M", $750,000 -> "$750k".
function shortUsd(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return "the budget";
  if (amount >= 1e9) return `$${+(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${+(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${Math.round(amount / 1e3)}k`;
  return `$${Math.round(amount)}`;
}

// "● Soil 30  ● Damage 40  ● Access 30" (Postwar) or "● Soil 43
// ● Damage 57  ● Cutoff 30%" (Near term), each dot in the colour the
// weights panel on the map page uses. No cutoff where nothing is set aside
// (safe access not measured: overview.js accessMeasured), as on the
// Overview.
function WeightsChip({ settings, timeframe, run }) {
  return (
    <span className="aai-weights" data-testid="aai-weights">
      {weightItems(settings, timeframe, run).map((item) => (
        <span key={item.key} className={`aai-weight is-${item.key}`}>
          {item.text}
        </span>
      ))}
    </span>
  );
}

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

function AtlasAi() {
  const { area, run, runSummary, settings, scored, hotspots, workspace } = useAtlasData();
  const [timeframe, setTimeframe] = useTimeframe();
  const [params, setParams] = useSearchParams();
  const about = params.get("about");
  // A state or district from the map's States view: only its name is
  // passed (short, as typed by the page).
  const stateName = (params.get("state") || "").slice(0, 120).trim();
  const stateFacts = (params.get("facts") || "").slice(0, 240).trim();
  const stateDraft = stateName ? `Tell me about the squares in ${stateName}.${stateFacts ? ` On the map's States view it is ${stateFacts} (black-soil-weighted means of its squares).` : ""}` : "";

  // The place from the map's "Ask AI" (a square, or a top area "h-<id>").
  const place = useMemo(() => {
    if (!about) return null;
    const found = findFocus(about, { places: scored.places, hotspots: [...hotspots.nearTerm, ...hotspots.postwar] });
    if (!found) return null;
    if (found.kind === "hotspot") return { cellId: found.hotspot.id.replace(/^h-/, ""), label: found.hotspot.label };
    return { cellId: found.place.id, label: placeLabel(found.place, run.cellSizeDeg) };
  }, [about, scored.places, hotspots, run.cellSizeDeg]);

  const clearPlace = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("about");
        return next;
      },
      { replace: true }
    );

  // What the AI reads with every question.
  const context = useMemo(
    () => ({ runId: runSummary?.id, settings, timeframe, ...(place ? { selectedCellId: place.cellId } : {}) }),
    [runSummary?.id, settings, timeframe, place]
  );

  const using = [
    { key: "area", icon: "map", label: "Area", value: area.name, to: "/atlas/settings" },
    { key: "month", icon: "calendar", label: "Month", control: <RunPicker /> },
    {
      key: "ranking",
      icon: "list-ordered",
      label: "Ranking",
      control: <Segmented options={timeframeOptions(run)} value={timeframe} onChange={setTimeframe} ariaLabel="Ranking" light />,
    },
    { key: "source", icon: "database", label: "Source", value: run.provider === "gee" ? "Earth Engine" : "Sample data", to: "/atlas/settings" },
    { key: "weights", icon: "sliders-horizontal", label: "Weights", control: <WeightsChip settings={settings} timeframe={timeframe} run={run} />, to: "/atlas/map" },
    ...(place ? [{ key: "place", icon: "map-pin", label: "Place", value: place.label, onClear: clearPlace }] : []),
  ];

  const values = { area: area.name, budget: shortUsd(workspace?.budgetUsd) };
  // No war covers the area (none in the app's list, or the team's "Not at
  // war"): no talk of deminers. A month before its war began keeps the
  // deminers line (the area is at war now) but, like a month at peace,
  // asks nothing about fighting: no distance to it was measured then.
  const peace = atPeace(run);
  // A natural disaster: no deminers either, and its own fourth question.
  const disaster = disasterType(run);
  const text = {
    placeholder: fill(composer.atlas.placeholder, values),
    disclaimer: disaster ? composer.atlas.disclaimerDisaster : peace ? composer.atlas.disclaimerPeace : composer.atlas.disclaimer,
    welcome: fill(composer.atlas.welcome, values),
  };
  // A farm-sized area gets farm-sized questions. In a war where no fire
  // looked like fighting no distance to it was measured either
  // (noFightingFound), so it is not asked "How far is it from the
  // fighting?" (the deminers' line stays: it is still a war).
  const small = Number.isFinite(area.areaHa) && area.areaHa < SMALL_AREA_HA;
  const suggestions = atlasStarterQuestions({ small, peace: outsideWar(run) || noFightingFound(run), disaster }).map((question) => fill(question, values));

  return (
    <div className="aai-page">
      <ChatScreen
        product="atlas"
        context={context}
        text={text}
        suggestions={suggestions}
        using={using}
        initialDraft={place ? `Tell me about ${place.label}` : stateDraft}
      />
    </div>
  );
}

export default function AiPage() {
  return (
    <AtlasGate>
      <AtlasAi />
    </AtlasGate>
  );
}
