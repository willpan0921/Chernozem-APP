// WHAT THIS FILE DOES
// The "Chats" column: the title, a "New chat" button, and one row per saved
// chat (its title and "Today" / "Oct 11" under it). The open chat has a
// pale green background. Clicking a row opens that chat. The chats are
// saved on the server, so they are the same after a reload.
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// threads    - the saved chats [{ id, title, updatedAt }], newest first
// selectedId - the id of the open chat (null for a new, unsaved chat)
// onSelect   - called with a chat id when a row is clicked
// onNew      - called when "New chat" is clicked
// loading    - true until the list has arrived
// error      - a message when the list could not load

import { Plus } from "lucide-react";
import { Button } from "../ui/index.js";
import { threadDate } from "../../lib/chat/threads.js";

// The title and the button text at the top of the column.
const labels = {
  title: "Chats",
  newChat: "New chat",
  empty: "No chats yet",
};

export default function ChatThreadList({ threads, selectedId, onSelect, onNew, loading, error }) {
  return (
    <aside className="chat-threads" aria-label={labels.title}>
      <div className="chat-threads-header">
        <h2>{labels.title}</h2>
        <Button size="sm" variant="ink" icon={<Plus size={14} />} onClick={onNew} data-testid="chat-new">
          {labels.newChat}
        </Button>
      </div>

      <div className="chat-thread-list" data-testid="chat-thread-list">
        {loading && threads.length === 0 && (
          <>
            <span className="chat-thread-skel" />
            <span className="chat-thread-skel" />
          </>
        )}
        {!loading && error && <p className="chat-threads-note is-error">{error}</p>}
        {!loading && !error && threads.length === 0 && <p className="chat-threads-note">{labels.empty}</p>}
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={thread.id === selectedId ? "chat-thread is-selected" : "chat-thread"}
            onClick={() => onSelect(thread.id)}
            aria-current={thread.id === selectedId ? "true" : undefined}
            data-thread-id={thread.id}
          >
            <span className="chat-thread-title">{thread.title}</span>
            <span className="chat-thread-meta">{threadDate(thread.updatedAt)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
