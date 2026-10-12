// WHAT THIS FILE DOES
// The middle column of an AI page: the thread title and subtitle at the top
// with the "Answers in English" button, then the scrolling list of
// messages, then the message box at the bottom.
//
// Messages from the person are dark pills on the right with the time under
// them. Messages from the AI show the "Chernozem AI" name once per thread
// (above the first answer), then plain text and, if the data has one, a
// card (see ChatCard.jsx).
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// thread         - the open thread { title, subtitle, messages }
// thinking       - true while a reply is on its way ("Thinking…")
// languageButton - the text of the pill button in the header
// composer       - the <ChatComposer /> to show at the bottom

import { useEffect, useRef } from "react";
import { Globe, Sprout } from "lucide-react";
import { Button } from "../ui/index.js";
import { aiName } from "../../data/chats.js";
import ChatCard from "./ChatCard.jsx";

// The small bits of text this column shows on its own.
// TODO move to src/data/chats.js (as a "chatLabels" export)
const labels = {
  empty: "No messages yet. Ask something in the box below.",
  thinking: "Thinking…",
};

// The "Chernozem AI" name with the small logo in front of it.
function AiNameLabel() {
  return (
    <span className="chat-ai-name">
      <span className="chat-ai-logo">
        <Sprout size={11} strokeWidth={2.4} />
      </span>
      {aiName}
    </span>
  );
}

// Shows "text" with the words listed in "strong" in bold, e.g. ["101"].
function TextWithStrong({ text, strong }) {
  if (!strong || strong.length === 0) return text;
  // Split the text on every strong word, keeping the words in the result.
  const pattern = new RegExp(`(${strong.map(escapeRegExp).join("|")})`, "g");
  return text.split(pattern).map((part, index) =>
    strong.includes(part) ? <strong key={index}>{part}</strong> : part,
  );
}

// Makes a plain string safe to put inside a regular expression.
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The small picture in a photo attachment. A real thumbnail can replace it
// when photos are stored somewhere.
function AttachmentThumb() {
  return (
    <span className="chat-attachment-thumb" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <rect width="36" height="36" fill="var(--c-border-strong)" />
        <rect x="5" y="5" width="26" height="26" rx="5" fill="var(--c-muted)" />
        <circle cx="18" cy="18" r="8" fill="var(--c-ink)" />
        <circle cx="18" cy="18" r="3.5" fill="var(--c-surface-3)" />
      </svg>
    </span>
  );
}

function UserMessage({ message }) {
  return (
    <div className="chat-message-user">
      <div className="chat-bubble">{message.text}</div>
      {message.attachment && (
        <span className="chat-attachment">
          <AttachmentThumb />
          {message.attachment.name}
        </span>
      )}
      <span className="chat-time">{message.time}</span>
    </div>
  );
}

function AiMessage({ message, showName }) {
  return (
    <div className="chat-message-ai">
      {showName && <AiNameLabel />}
      {message.text && (
        <p className="chat-ai-text">
          <TextWithStrong text={message.text} strong={message.strong} />
        </p>
      )}
      <ChatCard card={message.card} />
    </div>
  );
}

export default function ChatConversation({ thread, thinking, languageButton, composer }) {
  const listRef = useRef(null);
  const messages = thread?.messages || [];
  // The name is shown once per thread, above the first AI answer (like the
  // mockup). Later answers follow on without it.
  const firstAiIndex = messages.findIndex((message) => message.role === "ai");

  // Whenever a message is added, scroll the list down to show it.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, thinking, thread?.id]);

  return (
    <section className="chat-conversation" aria-label="Conversation">
      <header className="chat-conversation-header">
        <div>
          <h1>{thread?.title}</h1>
          {thread?.subtitle && <p className="chat-conversation-subtitle">{thread.subtitle}</p>}
        </div>
        <Button
          className="chat-language-button"
          icon={<Globe size={14} />}
          title="Not connected yet"
        >
          {languageButton}
        </Button>
      </header>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && !thinking && (
          <p className="chat-empty">{labels.empty}</p>
        )}
        {messages.map((message, index) => {
          if (message.role === "user") {
            return <UserMessage key={message.id} message={message} />;
          }
          return <AiMessage key={message.id} message={message} showName={index === firstAiIndex} />;
        })}
        {thinking && (
          <div className="chat-message-ai">
            {/* Only the very first answer in a thread gets the name. */}
            {firstAiIndex === -1 && <AiNameLabel />}
            <p className="chat-thinking">{labels.thinking}</p>
          </div>
        )}
      </div>

      {composer}
    </section>
  );
}
