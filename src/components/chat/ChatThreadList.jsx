// WHAT THIS FILE DOES
// The "Chats" column: the title, a "New" button, and one row per chat
// thread (its title and "Sep 26 · Field 7" under it). The open thread has a
// pale green background. Clicking a row opens that thread.
//
// WHO EDITS IT
// Danny.
//
// WHAT IT RECEIVES
// threads    - the list of threads from src/data/chats.js (or new ones)
// selectedId - the id of the open thread
// onSelect   - called with a thread id when a row is clicked
// onNew      - called when "New" is clicked

import { Plus } from "lucide-react";
import { Button } from "../ui/index.js";

// The title and the button text at the top of the column.
// TODO move to src/data/chats.js (as a "chatLabels" export)
const labels = {
  title: "Chats",
  newChat: "New",
};

export default function ChatThreadList({ threads, selectedId, onSelect, onNew }) {
  return (
    <aside className="chat-threads" aria-label={labels.title}>
      <div className="chat-threads-header">
        <h2>{labels.title}</h2>
        <Button size="sm" icon={<Plus size={14} />} onClick={onNew}>
          {labels.newChat}
        </Button>
      </div>

      <div className="chat-thread-list">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={thread.id === selectedId ? "chat-thread is-selected" : "chat-thread"}
            onClick={() => onSelect(thread.id)}
            aria-current={thread.id === selectedId ? "true" : undefined}
          >
            <span className="chat-thread-title">{thread.title}</span>
            <span className="chat-thread-meta">
              {thread.dateLabel} · {thread.scopeLabel}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
