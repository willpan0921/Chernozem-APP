// WHAT THIS FILE DOES
// A whole AI page in one piece: it holds the state (which chat is open, its
// messages, the text being typed, the answer being written) and puts the
// building blocks together with ChatLayout. The Field and Atlas AI pages
// are each just a <ChatScreen /> with their own context.
//
// WHAT HAPPENS
// - The saved chats load from the server (src/api/chatApi.js). Clicking one
//   opens it; the open chat is kept in the address (?chat=...), so a reload
//   or a shared link opens the same chat.
// - "New chat" starts an empty chat. It is saved on the server when the
//   first question is sent.
// - Sending shows the question at once, then "Thinking…", then what the AI
//   is looking up, then the answer as it is written. The square button
//   stops it; the part already written stays (and is saved) as "Stopped".
// - Problems show as a red line with "Try again". Without an AI key the
//   "Connect Claude" steps show instead.
// - Until the first chat is saved, the "Chats" column is hidden.
// - A "Try asking" question is sent straight away.
// - The bin icon deletes the open chat (after "Delete" to confirm).
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// product      - "field" or "atlas" (sent to the AI with every message)
// context      - what the AI should read, sent with every message
//                Atlas: { runId, settings, timeframe, selectedCellId }
//                Field: { reportId? } (the server reads the farm itself)
// text         - { placeholder, disclaimer, welcome } (from "composer" in src/data/chats.js)
// suggestions  - the "Try asking" questions
// using        - the "Using" rows for the right column (see ChatRail.jsx)
// chips        - dropdown chips for the message box (see ChatComposer.jsx)
// initialDraft - text to put in the message box when the page opens
//                (e.g. "Tell me about Kharkiv"); changing it puts the new text in.
//                When it becomes "" and the box still holds the old text
//                untouched, the box is emptied too.
// autoSend     - a question to send by itself, once, in a new chat, as soon
//                as the AI is known to be connected (e.g. the Field AI page
//                opened from "Tell us what happened"). Each text is sent at
//                most once.
// onThread     - called with each saved chat as it opens ({ id, reportId?, ... }),
//                and with null for a new chat, so the page can show what that
//                chat is about (e.g. the report a Field chat was started from)
// about        - a short line about what the chat is about, shown at the top
//                of the conversation on narrow screens (where "Using" is far
//                below): { icon, text } or null

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Sprout } from "lucide-react";
import { getAiStatus, listThreads, openThread, removeThread, sendChatMessage } from "../../api/chatApi.js";
import { titleFrom, upsertThread } from "../../lib/chat/threads.js";
import ChatLayout from "./ChatLayout.jsx";
import ChatThreadList from "./ChatThreadList.jsx";
import ChatConversation from "./ChatConversation.jsx";
import ChatComposer from "./ChatComposer.jsx";
import ChatRail from "./ChatRail.jsx";
import ChatSetupCard from "./ChatSetupCard.jsx";

// Text the screen needs on its own.
const labels = {
  newChatTitle: "New chat",
  listFailed: "Could not load your chats.",
  openFailed: "Could not open this chat.",
  deleteFailed: "Could not delete this chat. Try again.",
};

let localCount = 0;
const localId = (prefix) => `${prefix}-local-${Date.now()}-${(localCount += 1)}`;

export default function ChatScreen({ product, context, text, suggestions = [], using = [], chips = [], initialDraft = "", autoSend = "", onThread, about = null }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("chat") || null;

  // The saved chats, newest first.
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(null);
  // The open chat's messages.
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  // The answer being written: { text, tool } or null.
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(initialDraft);
  // { configured, model } from the server, or null while unknown.
  const [aiStatus, setAiStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  // Changes whenever a chat opens, so the message box takes the cursor.
  const [focusKey, setFocusKey] = useState(0);

  // The running answer (to stop it), and a counter so a stopped answer can
  // never write into a chat opened after it.
  const abortRef = useRef(null);
  const sessionRef = useRef(0);
  // A chat the server just created while we were sending: its messages are
  // already on screen, so it is not loaded again.
  const createdRef = useRef(null);
  const lastQuestionRef = useRef("");
  // The latest context, read when a message is sent.
  const contextRef = useRef(context);
  contextRef.current = context;
  // The last pre-filled question, to tell whether the box still holds it.
  const initialDraftRef = useRef(initialDraft);
  // The last question sent by itself (autoSend), so it is sent only once.
  const autoSentRef = useRef("");
  // The latest onThread, so a new function from the page never reopens a chat.
  const onThreadRef = useRef(onThread);
  onThreadRef.current = onThread;

  const notConfigured = aiStatus?.configured === false;
  const busy = Boolean(pending);

  const setChat = useCallback(
    (id) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id) next.set("chat", id);
          else next.delete("chat");
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // The saved chats and whether the AI has a key, once.
  useEffect(() => {
    let gone = false;
    listThreads(product)
      .then((list) => !gone && (setThreads(list), setThreadsError(null)))
      .catch(() => !gone && setThreadsError(labels.listFailed))
      .finally(() => !gone && setThreadsLoading(false));
    getAiStatus().then((status) => !gone && setAiStatus(status));
    return () => {
      gone = true;
    };
  }, [product]);

  // A new pre-filled question (e.g. "Tell me about ..." from the map). When
  // the page takes it away (the place was cleared), an unedited copy in the
  // box goes too.
  useEffect(() => {
    const previous = initialDraftRef.current;
    initialDraftRef.current = initialDraft;
    if (initialDraft) {
      setDraft(initialDraft);
      setFocusKey((n) => n + 1);
    } else if (previous) {
      setDraft((current) => (current.trim() === previous.trim() ? "" : current));
    }
  }, [initialDraft]);

  // Open the chat named in the address.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setThreadLoading(false);
      onThreadRef.current?.(null);
      return undefined;
    }
    if (createdRef.current === selectedId) return undefined;
    let gone = false;
    setThreadLoading(true);
    setMessages([]);
    setError(null);
    openThread(selectedId)
      .then((thread) => {
        if (gone) return;
        // A chat that no longer exists: go back to a new chat.
        if (!thread) {
          setChat(null);
          return;
        }
        onThreadRef.current?.(thread);
        setMessages(
          (thread.messages || []).map((m) => ({ id: m.id, role: m.role === "user" ? "user" : "assistant", text: m.text, stopped: Boolean(m.stopped) }))
        );
        setFocusKey((n) => n + 1);
      })
      .catch((err) => {
        if (gone) return;
        // A chat that no longer exists: go back to a new chat.
        if (err?.status === 404) setChat(null);
        else setError({ code: err?.code || "error", message: labels.openFailed });
      })
      .finally(() => !gone && setThreadLoading(false));
    return () => {
      gone = true;
    };
  }, [selectedId, setChat]);

  // A question to send by itself: once, in a new chat, when the AI is ready.
  useEffect(() => {
    if (!autoSend || autoSentRef.current === autoSend) return;
    if (aiStatus?.configured !== true || selectedId || busy) return;
    autoSentRef.current = autoSend;
    send(autoSend);
    // send() reads the latest state itself; only these decide when to run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, aiStatus, selectedId, busy]);

  // Stop an answer when the page closes.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Stops the answer being written and forgets it.
  function cancelRunning() {
    sessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(null);
  }

  function openChat(id) {
    if (id === selectedId) return;
    cancelRunning();
    createdRef.current = null;
    setError(null);
    setChat(id);
  }

  function newChat() {
    cancelRunning();
    createdRef.current = null;
    setError(null);
    setMessages([]);
    setDraft("");
    setChat(null);
    setFocusKey((n) => n + 1);
  }

  async function send(question) {
    const textToSend = (question ?? draft).trim();
    if (!textToSend || busy || notConfigured) return;

    const session = (sessionRef.current += 1);
    const controller = new AbortController();
    abortRef.current = controller;
    lastQuestionRef.current = textToSend;
    const startedIn = selectedId;
    let soFar = "";

    setError(null);
    setMessages((list) => [...list, { id: localId("u"), role: "user", text: textToSend }]);
    setPending({ text: "", tool: null });
    if (question === undefined) setDraft("");

    const live = () => sessionRef.current === session;

    try {
      const reply = await sendChatMessage(textToSend, {
        product,
        threadId: startedIn,
        context: contextRef.current,
        signal: controller.signal,
        onThread: ({ threadId, title }) => {
          if (!live()) return;
          setThreads((list) => upsertThread(list, { id: threadId, title: title || titleFrom(textToSend), updatedAt: new Date().toISOString() }));
          if (threadId !== startedIn) {
            createdRef.current = threadId;
            setChat(threadId);
          }
        },
        onText: (_piece, all) => {
          soFar = all;
          if (live()) setPending({ text: all, tool: null });
        },
        onTool: ({ name, status }) => {
          if (live()) setPending((p) => ({ text: p?.text || "", tool: status === "running" ? name : null }));
        },
      });
      if (!live()) return;
      abortRef.current = null;
      setPending(null);
      if (reply.error) {
        if (soFar.trim()) setMessages((list) => [...list, { id: localId("a"), role: "assistant", text: soFar, stopped: true }]);
        if (reply.error.code === "ai_not_configured") setAiStatus((s) => ({ ...s, configured: false }));
        setError(reply.error);
        return;
      }
      setMessages((list) => [...list, { id: reply.messageId || localId("a"), role: "assistant", text: reply.text }]);
      if (reply.threadId) setThreads((list) => upsertThread(list, { id: reply.threadId, updatedAt: new Date().toISOString() }));
    } catch (err) {
      if (!live()) return;
      abortRef.current = null;
      setPending(null);
      if (err?.name === "AbortError") {
        // Stopped by the person: keep what was written so far.
        if (soFar.trim()) setMessages((list) => [...list, { id: localId("a"), role: "assistant", text: soFar, stopped: true }]);
        return;
      }
      setError({ code: "error", message: err?.message || "Something went wrong. Try again." });
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  // "Try again": send the last question once more. The server keeps the
  // question it already saved (server/ai/chat.js) instead of a second copy.
  function retry() {
    const question = lastQuestionRef.current;
    if (!question) return;
    // The failed question is already on screen; send it without adding it twice.
    setMessages((list) => {
      const last = list[list.length - 1];
      return last?.role === "user" && last.text === question ? list.slice(0, -1) : list;
    });
    send(question);
  }

  async function deleteOpenChat() {
    const id = selectedId;
    if (!id) return;
    try {
      await removeThread(id);
      setThreads((list) => list.filter((item) => item.id !== id));
      newChat();
    } catch {
      setError({ code: "error", message: labels.deleteFailed });
    }
  }

  async function checkAgain() {
    setChecking(true);
    const status = await getAiStatus();
    setChecking(false);
    setAiStatus(status);
    if (status?.configured) setError((e) => (e?.code === "ai_not_configured" ? null : e));
  }

  const openTitle = selectedId ? threads.find((item) => item.id === selectedId)?.title || "" : labels.newChatTitle;
  const setupCard = notConfigured ? <ChatSetupCard onCheck={checkAgain} checking={checking} /> : null;
  // Nothing saved and nothing typed yet: no "Chats" column.
  const noThreads = !threadsLoading && !threadsError && threads.length === 0 && !selectedId && messages.length === 0 && !pending;

  const welcome = (
    <div className="chat-welcome">
      <span className="chat-welcome-logo">
        <Sprout size={22} strokeWidth={2.2} />
      </span>
      <p className="chat-welcome-text">{text.welcome}</p>
      {suggestions.length > 0 && (
        <div className="chat-welcome-suggestions">
          {suggestions.map((question) => (
            <button key={question} type="button" className="chat-suggestion" onClick={() => send(question)}>
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <ChatLayout
      noThreads={noThreads}
      threads={
        <ChatThreadList
          threads={threads}
          selectedId={selectedId}
          onSelect={openChat}
          onNew={newChat}
          loading={threadsLoading}
          error={threadsError}
        />
      }
      conversation={
        <ChatConversation
          title={openTitle}
          onDelete={selectedId && !busy ? deleteOpenChat : undefined}
          messages={messages}
          pending={pending}
          error={error?.code === "ai_not_configured" ? null : error}
          onRetry={error && error.code !== "ai_not_configured" ? retry : undefined}
          loading={threadLoading}
          about={about}
          notice={setupCard && messages.length > 0 ? setupCard : null}
          empty={setupCard || welcome}
          composer={
            <ChatComposer
              placeholder={text.placeholder}
              disclaimer={text.disclaimer}
              draft={draft}
              onDraft={setDraft}
              chips={chips}
              onSend={() => send()}
              onStop={stop}
              busy={busy}
              disabled={notConfigured}
              focusKey={`${selectedId}-${focusKey}`}
            />
          }
        />
      }
      rail={<ChatRail using={using} suggestions={suggestions} onSuggest={send} disabled={busy || notConfigured} emptyChat={messages.length === 0 && !pending && !threadLoading && !notConfigured} />}
    />
  );
}
