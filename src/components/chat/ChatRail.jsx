// WHAT THIS FILE DOES
// The right column of an AI page: "Using" (what the AI reads for its
// answers, e.g. the area, the month, the data source and the weights) and
// "Try asking" (starter questions that are sent straight away).
//
// WHO EDITS IT
// Danny. The page decides what goes in "Using" (live values from the app);
// the starter questions come from src/data/chats.js.
//
// WHAT IT RECEIVES
// using       - [{ key, icon, label, value, to?, control?, onClear? }]
//               "to" makes the row a link; "control" (e.g. a month picker)
//               is drawn in place of the value; "onClear" adds an x button
// suggestions - a list of question strings
// onSuggest   - called with the question when a "Try asking" button is clicked
// disabled    - true when the questions cannot be sent (no AI key, or busy)
// emptyChat   - true when the open chat has no messages (on narrow screens
//               the questions then show in the chat itself, not here)

import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, X } from "lucide-react";
import ChatIcon from "./icons.jsx";

// The headings in this column.
const labels = {
  using: "Using",
  tryAsking: "Try asking",
};

function UsingRow({ item }) {
  const body = (
    <>
      <ChatIcon name={item.icon} tone={item.tone} size={15} />
      <span className="chat-using-label">{item.label}</span>
      {item.control ? <span className="chat-using-control">{item.control}</span> : <span className="chat-using-value">{item.value}</span>}
      {item.to && <ChevronRight size={14} className="chat-using-go" aria-hidden="true" />}
      {item.onClear && (
        <button type="button" className="chat-using-clear" onClick={item.onClear} aria-label={`Stop using ${item.label.toLowerCase()}`} data-testid="chat-using-clear">
          <X size={13} />
        </button>
      )}
    </>
  );
  if (item.to) {
    return (
      <Link to={item.to} className="chat-using-item is-link" data-using={item.key}>
        {body}
      </Link>
    );
  }
  return (
    <div className="chat-using-item" data-using={item.key}>
      {body}
    </div>
  );
}

export default function ChatRail({ using = [], suggestions = [], onSuggest, disabled, emptyChat }) {
  return (
    <aside className={emptyChat ? "chat-rail is-empty-chat" : "chat-rail"} aria-label={labels.using}>
      {using.length > 0 && (
        <section className="chat-rail-section">
          <h2>{labels.using}</h2>
          <div className="chat-using-list" data-testid="chat-using">
            {using.map((item) => (
              <UsingRow key={item.key} item={item} />
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="chat-rail-section">
          <h2>{labels.tryAsking}</h2>
          <div className="chat-suggestions">
            {suggestions.map((text) => (
              <button key={text} type="button" className="chat-suggestion" onClick={() => onSuggest(text)} disabled={disabled} data-testid="chat-suggestion">
                <span>{text}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
