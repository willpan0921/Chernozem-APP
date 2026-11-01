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
//     Claude the report's photos for the whole chat. The report itself
//     (what happened, which field, the farmer's words, the photos) is the
//     chat's first message (ChatConversation's "about.report"), so it is
//     on screen whether the answer streams under it, the assistant is off
//     or over its limit (a plain sentence then), or the sending failed.
//     Reopening that chat later (from the Chats list, or a ?chat= link)
//     shows the report again: the server remembers it with the chat
//     (thread.reportId). The report arrives with the click from the
//     Overview (the page's "state"), so it is on screen at once; opened
//     from a link or a reload, it is read from the server, and a read that
//     fails is tried again (never dropped: the farmer's words must not
//     vanish). It stays only with the chat its own question created: if
//     the assistant could not answer (so no chat was made) and the farmer
//     opens a saved chat, the report leaves the address instead of joining
//     that chat (fieldChat.js reportChatStep).
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
import { useLocation, useSearchParams } from "react-router-dom";
import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import { FarmGate, useFieldData } from "../../state/FieldData.jsx";
import { listReports, photoUrl } from "../../api/fieldApi.js";
import { farmLine } from "../../lib/field/format.js";
import { reportChatStep, reportFirstQuestion, reportLine, reportMessage, reportRow, sourceRow, starterFields, weatherLine } from "../../lib/chat/fieldChat.js";
import { composer, fieldSuggestions } from "../../data/chats.js";

function FieldAi() {
  const { farm, analyses, provider, weather, conflict } = useFieldData();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
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

  // The report stays with the chat its own question created (the chat
  // screen says which: onCreated). Opening any other chat, or a new one,
  // lets it go (fieldChat.js reportChatStep). That is decided while the
  // page draws, so the report never shows, not even for a moment, over a
  // chat it does not belong to; the address is tidied just after.
  const reportChatRef = useRef(null);
  const createdRef = useRef(null); // { reportId, chatId }: the chat a question sent here created
  const reportIdRef = useRef(reportId);
  reportIdRef.current = reportId;
  const handleCreated = useCallback((id) => {
    if (reportIdRef.current) createdRef.current = { reportId: reportIdRef.current, chatId: id };
  }, []);
  const createdChat = createdRef.current?.reportId === reportId ? createdRef.current.chatId : null;
  const liveReportId = reportChatStep({ reportId, chatId, adopted: reportChatRef.current, created: createdChat }) === "drop" ? null : reportId;
  useEffect(() => {
    const created = createdRef.current?.reportId === reportId ? createdRef.current.chatId : null;
    const step = reportChatStep({ reportId, chatId, adopted: reportChatRef.current, created });
    if (step === "reset") reportChatRef.current = null;
    else if (step === "adopt") reportChatRef.current = chatId;
    else if (step === "drop") dropParam("report");
  }, [reportId, chatId, dropParam]);

  // The report a saved chat was started from (the server keeps it with the
  // chat), so a chat reopened from the list still shows its report.
  const [threadReport, setThreadReport] = useState(null);
  const handleThread = useCallback((thread) => {
    setThreadReport(thread?.reportId ? { chatId: thread.id, reportId: thread.reportId } : null);
  }, []);
  const savedReportId = chatId && threadReport?.chatId === chatId ? threadReport.reportId : null;
  // ?report= wins (a chat being started about it); else the open chat's own.
  const shownReportId = liveReportId || savedReportId;

  // The report itself: the one handed over by the Overview's Send (at
  // once), else read from the server. An id the server does not know is
  // dropped from the address. A read that fails (a dropped connection, a
  // server hiccup) is tried again after 1.5, 3 and 4.5 seconds, then every
  // 15 seconds while the page is open; meanwhile "Using" says the report is
  // loading, and the address keeps it all along.
  const handed = location.state?.report;
  const [report, setReport] = useState(null);
  const [reading, setReading] = useState({ id: null, status: "" }); // status: "loading" | "retrying" | ""
  useEffect(() => {
    if (!shownReportId) {
      setReport(null);
      return undefined;
    }
    if (handed && handed.id === shownReportId) {
      setReport(handed);
      return undefined;
    }
    let gone = false;
    let timer = 0;
    let tries = 0;
    const fromAddress = shownReportId === liveReportId;
    setReading({ id: shownReportId, status: "loading" });
    const read = () =>
      listReports()
        .then((list) => {
          if (gone) return;
          const found = list.find((item) => item.id === shownReportId);
          setReading({ id: shownReportId, status: "" });
          if (found) setReport(found);
          else if (fromAddress) dropParam("report");
        })
        .catch(() => {
          if (gone) return;
          tries += 1;
          if (tries > 3) setReading({ id: shownReportId, status: "retrying" });
          timer = window.setTimeout(read, tries <= 3 ? 1500 * tries : 15000);
        });
    read();
    return () => {
      gone = true;
      window.clearTimeout(timer);
    };
  }, [shownReportId, liveReportId, dropParam, handed]);
  const activeReport = report && report.id === shownReportId ? report : null;

  // The field from "Ask AI about <field>" (?about=).
  const aboutField = farm.fields.find((field) => field.id === aboutId) || null;

  // Only a chat being started about a report sends it; a saved chat already
  // has its report on the server.
  const context = useMemo(() => (activeReport && liveReportId ? { reportId: activeReport.id } : {}), [activeReport, liveReportId]);

  const weatherText = weatherLine(weather);
  const source = sourceRow(provider, analyses);
  const reportInfo = reportRow(activeReport, farm);
  const using = [
    { key: "farm", icon: "wheat", label: farm.name, value: farmLine(farm), to: "/field/fields" },
    { key: "source", icon: "satellite", label: source.label, value: source.value, to: "/field/data" },
    ...(weatherText ? [{ key: "weather", icon: "cloud", label: "Weather", value: weatherText }] : []),
    // No x on the report: the chat about it starts by itself (autoSend).
    ...(activeReport
      ? [{ key: "report", icon: "camera", label: reportInfo.label, value: reportInfo.value }]
      : shownReportId && reading.id === shownReportId && reading.status
        ? [{ key: "report", icon: "camera", label: "Your report", value: reading.status === "retrying" ? "Not loaded yet, trying again" : "Loading…" }]
        : []),
    ...(aboutField ? [{ key: "field", icon: "sprout", label: "Field", value: aboutField.name, onClear: () => dropParam("about") }] : []),
  ];

  // No known war covers the farm: no talk of deminers. The analyses say
  // so; before any analysis, the farm's place does (farm.conflict from the
  // server, format.js farmConflict). Only when nothing says either way is
  // the careful war wording kept.
  const peace = conflict === null;
  const suggestions = useMemo(() => fieldSuggestions({ ...starterFields(farm, analyses), peace }), [farm, analyses, peace]);
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
        autoSend={activeReport && liveReportId && !chatId ? reportFirstQuestion(activeReport, farm) : ""}
        onThread={handleThread}
        onCreated={handleCreated}
        about={activeReport ? { icon: "camera", text: reportLine(activeReport, farm), report: reportMessage(activeReport, farm, photoUrl) } : null}
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
