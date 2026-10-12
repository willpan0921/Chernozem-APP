// WHAT THIS FILE DOES
// A whole AI page in one piece: it holds the state (which thread is open,
// the messages, the text being typed, whether a reply is on its way) and
// puts the building blocks together with ChatLayout. The Field and Atlas AI
// pages are each just a <ChatScreen /> with their own data.
//
// WHAT HAPPENS
// - Clicking a chat in the left list opens it.
// - "New" starts an empty chat called "New chat" and opens it.
// - Sending a message adds it as a dark bubble, shows "Thinking…", then adds
//   the reply from src/api/chatApi.js (a fake reply for now).
// - A "Try asking" button puts its question in the message box.
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// product     - "field" or "atlas" (passed to the AI with every message)
// threads     - fieldChats or atlasChats from src/data/chats.js
// reading     - fieldReading or atlasReading
// suggestions - fieldSuggestions or atlasSuggestions
// composer    - composer.field or composer.atlas

import { useState } from "react";
import { sendChatMessage } from "../../api/chatApi.js";
import ChatLayout from "./ChatLayout.jsx";
import ChatThreadList from "./ChatThreadList.jsx";
import ChatConversation from "./ChatConversation.jsx";
import ChatComposer from "./ChatComposer.jsx";
import ChatRail from "./ChatRail.jsx";

// Text the screen needs that is not in the thread data yet.
// TODO move to src/data/chats.js (as a "chatLabels" export; the new-chat
// subtitle should become a per-product default in "composer")
const labels = {
  newChatTitle: "New chat",
  replyFailed: "Sorry, something went wrong. Please try again.",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Oct 11" for the chat list.
function shortDate(date) {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "Oct 11 · 9:40" for under a message.
function shortTime(date) {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${shortDate(date)} · ${date.getHours()}:${minutes}`;
}

// "2026-10-11T09:40" in local time, matching the data file.
function isoMinute(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ChatScreen({ product, threads: initialThreads, reading, suggestions, composer }) {
  // All threads, newest first. Starts from the data file; new chats and new
  // messages are added here (they are not saved anywhere yet).
  const [threads, setThreads] = useState(initialThreads);
  // The id of the open thread.
  const [selectedId, setSelectedId] = useState(initialThreads[0]?.id);
  // The text in the message box.
  const [draft, setDraft] = useState("");
  // The chosen value of each dropdown chip, keyed by its kind.
  const [chips, setChips] = useState(() =>
    Object.fromEntries(
      composer.contextChips.filter((chip) => chip.options).map((chip) => [chip.kind, chip.label]),
    ),
  );
  // True while we wait for a reply.
  const [thinking, setThinking] = useState(false);

  const thread = threads.find((item) => item.id === selectedId) || threads[0];

  // The chip that names what the chat is about ("Field 7", "All regions").
  const scopeChip = composer.contextChips.find((chip) => chip.options);
  const scopeLabel = scopeChip ? chips[scopeChip.kind] : thread?.scopeLabel;

  // Adds a message to the end of one thread.
  function addMessage(threadId, message) {
    setThreads((current) =>
      current.map((item) =>
        item.id === threadId ? { ...item, messages: [...item.messages, message] } : item,
      ),
    );
  }

  // "New": an empty thread at the top of the list, opened straight away.
  function handleNew() {
    const now = new Date();
    const fresh = {
      id: `new-${now.getTime()}`,
      title: labels.newChatTitle,
      date: isoMinute(now).slice(0, 10),
      dateLabel: shortDate(now),
      scopeLabel,
      // Same helper line as the data chat about the same scope, or else
      // the first chat in this product.
      subtitle:
        initialThreads.find((item) => item.scopeLabel === scopeLabel)?.subtitle ||
        initialThreads[0]?.subtitle ||
        "",
      messages: [],
    };
    setThreads((current) => [fresh, ...current]);
    setSelectedId(fresh.id);
    setDraft("");
  }

  // Sends the draft: show it, ask for the reply, show the reply.
  async function handleSend() {
    const text = draft.trim();
    if (!text || thinking || !thread) return;

    const threadId = thread.id;
    const now = new Date();
    addMessage(threadId, {
      id: `u-${now.getTime()}`,
      role: "user",
      at: isoMinute(now),
      time: shortTime(now),
      text,
    });
    setDraft("");
    setThinking(true);

    let replyText;
    try {
      replyText = await sendChatMessage(text, { product, scopeLabel });
    } catch {
      replyText = labels.replyFailed;
    }
    const replyAt = new Date();
    addMessage(threadId, {
      id: `ai-${replyAt.getTime()}`,
      role: "ai",
      at: isoMinute(replyAt),
      time: shortTime(replyAt),
      text: replyText,
    });
    setThinking(false);
  }

  return (
    <ChatLayout
      threads={
        <ChatThreadList
          threads={threads}
          selectedId={thread?.id}
          onSelect={setSelectedId}
          onNew={handleNew}
        />
      }
      conversation={
        <ChatConversation
          thread={thread}
          thinking={thinking}
          languageButton={composer.languageButton}
          composer={
            <ChatComposer
              config={composer}
              draft={draft}
              onDraft={setDraft}
              chips={chips}
              onChip={(kind, value) => setChips((current) => ({ ...current, [kind]: value }))}
              onSend={handleSend}
              disabled={thinking}
            />
          }
        />
      }
      rail={<ChatRail reading={reading} suggestions={suggestions} onSuggest={setDraft} />}
    />
  );
}
