// WHAT THIS FILE DOES
// The Field AI page (/field/ai): a farmer's chat with Chernozem AI (Claude)
// about their own farm. It is the shared chat screen (src/components/chat)
// with product "field", on the same AI server as the Atlas.
//
// The page sends no farm facts: the server reads the saved farm itself
// (server/ai/field-context.js): every field's status and four readings,
// the history since 2019, the weather and the reports. The chats are saved
// on the server too.
//
//   - "Using" (right column): the farm, the satellite data and its newest
//     pass date, the weather, and the report or field the chat is about.
//     On a phone, where "Using" is below the chat, the report also shows as
//     one line at the top of the chat ("Fire · Field 1 · 1 photo").
//   - "Try asking": four questions that name the farm's real fields.
//   - /field/ai?report=<id> (from "Tell us what happened" on the Overview)
//     starts a new chat about that report by itself; the server shows
//     Claude the report's photos for the whole chat. Reopening that chat
//     later (from the Chats list, or a ?chat= link) shows the report again:
//     the server remembers it with the chat (thread.reportId).
//   - /field/ai?about=<fieldId> (from "Ask AI about <field>" on the Fields
//     page) puts "Tell me about <field>" in the message box.
//   - No AI key yet: the shared "Connect Claude" card.
//   - The disclaimer under the box talks about explosives only where a
//     known war covers the farm (useFieldData().conflict: the analyses,
//     else the farm's place), so a new farm in Iowa never sees it.
//
// WHO EDITS IT
// Danny owns the chat building blocks in src/components/chat. The starter
// questions and the message-box text are in src/data/chats.js; the wording
// made from the farm is in src/lib/chat/fieldChat.js.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import { FarmGate, useFieldData } from "../../state/FieldData.jsx";
import { listReports } from "../../api/fieldApi.js";
import { farmLine } from "../../lib/field/format.js";
import { reportFirstQuestion, reportLine, reportRow, sourceRow, starterFields, weatherLine } from "../../lib/chat/fieldChat.js";
import { composer, fieldSuggestions } from "../../data/chats.js";

function FieldAi() {
  const { farm, analyses, provider, weather, conflict } = useFieldData();
  const [params, setParams] = useSearchParams();
  const reportId = params.get("report");
  const aboutId = params.get("about");
  const chatId = params.get("chat");

  const dropParam = useCallback(
    (name) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(name);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  // The report a saved chat was started from (the server keeps it with the
  // chat), so a chat reopened from the list still shows its report.
  const [threadReport, setThreadReport] = useState(null);
  const handleThread = useCallback((thread) => {
    setThreadReport(thread?.reportId ? { chatId: thread.id, reportId: thread.reportId } : null);
  }, []);
  const savedReportId = chatId && threadReport?.chatId === chatId ? threadReport.reportId : null;
  // ?report= wins (a chat being started about it); else the open chat's own.
  const shownReportId = reportId || savedReportId;

  // The report itself. An unknown ?report= id is dropped from the address.
  const [report, setReport] = useState(null);
  useEffect(() => {
    if (!shownReportId) {
      setReport(null);
      return undefined;
    }
    let gone = false;
    const fromAddress = shownReportId === reportId;
    listReports()
      .then((list) => {
        if (gone) return;
        const found = list.find((item) => item.id === shownReportId);
        if (found) setReport(found);
        else if (fromAddress) dropParam("report");
      })
      .catch(() => !gone && fromAddress && dropParam("report"));
    return () => {
      gone = true;
    };
  }, [shownReportId, reportId, dropParam]);
  const activeReport = report && report.id === shownReportId ? report : null;

  // The report stays with the chat it started. Opening another chat, or a
  // new one, lets it go.
  const reportChatRef = useRef(null);
  useEffect(() => {
    if (!reportId) {
      reportChatRef.current = null;
      return;
    }
    if (!chatId) {
      if (reportChatRef.current) dropParam("report");
      return;
    }
    if (!reportChatRef.current) reportChatRef.current = chatId;
    else if (chatId !== reportChatRef.current) dropParam("report");
  }, [reportId, chatId, dropParam]);

  // The field from "Ask AI about <field>" (?about=).
  const aboutField = farm.fields.find((field) => field.id === aboutId) || null;

  // Only a chat being started about a report sends it; a saved chat already
  // has its report on the server.
  const context = useMemo(() => (activeReport && reportId ? { reportId: activeReport.id } : {}), [activeReport, reportId]);

  const weatherText = weatherLine(weather);
  const source = sourceRow(provider, analyses);
  const reportInfo = reportRow(activeReport, farm);
  const using = [
    { key: "farm", icon: "wheat", label: farm.name, value: farmLine(farm), to: "/field/fields" },
    { key: "source", icon: "satellite", label: source.label, value: source.value, to: "/field/data" },
    ...(weatherText ? [{ key: "weather", icon: "cloud", label: "Weather", value: weatherText }] : []),
    // No x on the report: the chat about it starts by itself (autoSend).
    ...(activeReport ? [{ key: "report", icon: "camera", label: reportInfo.label, value: reportInfo.value }] : []),
    ...(aboutField ? [{ key: "field", icon: "sprout", label: "Field", value: aboutField.name, onClear: () => dropParam("about") }] : []),
  ];

  const suggestions = useMemo(() => fieldSuggestions(starterFields(farm, analyses)), [farm, analyses]);
  // No known war covers the farm: no talk of deminers. The analyses say
  // so; before any analysis, the farm's place does (farm.conflict from the
  // server, format.js farmConflict). Only when nothing says either way is
  // the careful war wording kept.
  const peace = conflict === null;
  const text = {
    placeholder: composer.field.placeholder,
    disclaimer: peace ? composer.field.disclaimerPeace : composer.field.disclaimer,
    welcome: composer.field.welcome.replace("{farm}", farm.name),
  };

  return (
    <div className="fai-page">
      <ChatScreen
        product="field"
        context={context}
        text={text}
        suggestions={suggestions}
        using={using}
        initialDraft={aboutField ? `Tell me about ${aboutField.name}` : ""}
        autoSend={activeReport && reportId && !chatId ? reportFirstQuestion(activeReport, farm) : ""}
        onThread={handleThread}
        about={activeReport ? { icon: "camera", text: reportLine(activeReport, farm) } : null}
      />
    </div>
  );
}

export default function AiPage() {
  return (
    <FarmGate>
      <FieldAi />
    </FarmGate>
  );
}
