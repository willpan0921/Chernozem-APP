// WHAT THIS FILE DOES
// The middle column of an AI page: the chat title at the top (with a
// delete button for saved chats), then the scrolling list of messages,
// then the message box at the bottom.
//
// Messages from the person are dark bubbles on the right. Answers from the
// AI sit on the left next to the small logo, drawn by ChatMarkdown.jsx,
// with a "Copy" button under them. While an answer is on its way the
// column shows "Thinking…", then what the AI is looking up ("Looking up
// the ranking…"), then the text as it streams in. Problems show as a red
// line with "Try again" under the last message.
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// title      - the chat title ("New chat" for an unsaved one)
// onDelete   - called after the person confirms "Delete" (leave out for a new chat)
// messages   - [{ id, role: "user" | "assistant", text, stopped? }]
// pending    - the answer being written: { text, tool } or null
// error      - { code, message } or null
// onRetry    - called by the "Try again" button
// loading    - true while a saved chat is being opened
// empty      - what an empty chat shows (welcome line or the setup card)
// notice     - shown above the messages of a saved chat (the setup card)
// composer   - the <ChatComposer /> to show at the bottom

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, RotateCcw, Sprout, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "../ui/index.js";
import { aiName } from "../../data/chats.js";
import { plainText } from "../../lib/chat/markdown.js";
import { toolLabel } from "../../lib/chat/threads.js";
import ChatMarkdown from "./ChatMarkdown.jsx";

// The small bits of text this column shows on its own.
const labels = {
  thinking: "Thinking…",
  stopped: "Stopped",
  copy: "Copy",
  copied: "Copied",
  delete: "Delete chat",
  confirm: "Delete",
  cancel: "Cancel",
  retry: "Try again",
};

function AiLogo() {
  return (
    <span className="chat-ai-logo" title={aiName} aria-label={aiName}>
      <Sprout size={13} strokeWidth={2.4} />
    </span>
  );
}

function UserMessage({ message }) {
  return (
    <div className="chat-message-user" data-role="user">
      <div className="chat-bubble">{message.text}</div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(text));
      setCopied(true);
    } catch {
      // The browser refused (e.g. not a secure page): nothing to do.
    }
  }
  return (
    <button type="button" className="chat-copy" onClick={copy} data-testid="chat-copy">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? labels.copied : labels.copy}
    </button>
  );
}

function AiMessage({ message }) {
  return (
    <div className="chat-message-ai" data-role="assistant">
      <AiLogo />
      <div className="chat-ai-body">
        <ChatMarkdown text={message.text} />
        <div className="chat-ai-actions">
          {message.stopped && <span className="chat-ai-stopped">{labels.stopped}</span>}
          {message.text && <CopyButton text={message.text} />}
        </div>
      </div>
    </div>
  );
}

// The answer that is still being written.
function PendingMessage({ pending }) {
  const status = pending.tool ? toolLabel(pending.tool) : pending.text ? null : labels.thinking;
  return (
    <div className="chat-message-ai is-pending" data-role="pending" aria-live="polite">
      <AiLogo />
      <div className="chat-ai-body">
        {pending.text && <ChatMarkdown text={pending.text} streaming={!pending.tool} />}
        {status && (
          <p className={pending.tool ? "chat-status is-tool" : "chat-status"} data-testid="chat-status">
            <Loader2 size={13} className="chat-spin" aria-hidden="true" />
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

function ErrorLine({ error, onRetry }) {
  return (
    <div className="chat-error" role="alert" data-testid="chat-error">
      <TriangleAlert size={15} />
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" className="chat-error-retry" onClick={onRetry}>
          <RotateCcw size={12} />
          {labels.retry}
        </button>
      )}
    </div>
  );
}

function DeleteControl({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} aria-label={labels.delete} title={labels.delete} onClick={() => setConfirming(true)} data-testid="chat-delete" />
    );
  }
  return (
    <div className="chat-confirm">
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        data-testid="chat-delete-confirm"
        onClick={async () => {
          setBusy(true);
          try {
            await onDelete();
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      >
        {labels.confirm}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {labels.cancel}
      </Button>
    </div>
  );
}

export default function ChatConversation({ title, onDelete, messages, pending, error, onRetry, loading, empty, notice, composer }) {
  const listRef = useRef(null);
  const stickRef = useRef(true);

  // Keep the newest text in view while it streams, unless the person has
  // scrolled up to read something earlier.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [messages, pending, error, loading]);

  function handleScroll() {
    const list = listRef.current;
    if (list) stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  const isEmpty = !loading && messages.length === 0 && !pending;

  return (
    <section className="chat-conversation" aria-label="Conversation">
      <header className="chat-conversation-header">
        <h1 className="chat-title" data-testid="chat-title">
          {title}
        </h1>
        {onDelete && <DeleteControl key={title} onDelete={onDelete} />}
      </header>

      <div className={isEmpty ? "chat-messages is-empty" : "chat-messages"} ref={listRef} onScroll={handleScroll} data-testid="chat-messages">
        {loading && (
          <p className="chat-status">
            <Loader2 size={13} className="chat-spin" aria-hidden="true" />
          </p>
        )}
        {isEmpty && empty}
        {!isEmpty && notice}
        {!loading &&
          messages.map((message) =>
            message.role === "user" ? <UserMessage key={message.id} message={message} /> : <AiMessage key={message.id} message={message} />
          )}
        {pending && <PendingMessage pending={pending} />}
        {error && <ErrorLine error={error} onRetry={onRetry} />}
      </div>

      {composer}
    </section>
  );
}
