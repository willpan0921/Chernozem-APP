// WHAT THIS FILE DOES
// The right column of an AI page: "What AI is reading" (an intro line and a
// list of sources, each with an icon, a title and a detail line) and "Try
// asking" (buttons that put a question into the message box).
//
// WHO EDITS IT
// Danny. The lists come from fieldReading / atlasReading and
// fieldSuggestions / atlasSuggestions in src/data/chats.js.
//
// WHAT IT RECEIVES
// reading     - { intro, items: [{ icon, tone?, title, detail }] }
// suggestions - a list of question strings
// onSuggest   - called with the question when a "Try asking" button is clicked

import ChatIcon from "./icons.jsx";

// The headings in this column.
// TODO move to src/data/chats.js (as a "chatLabels" export)
const labels = {
  reading: "What AI is reading",
  tryAsking: "Try asking",
};

export default function ChatRail({ reading, suggestions, onSuggest }) {
  return (
    <aside className="chat-rail" aria-label={labels.reading}>
      <div>
        <h2>{labels.reading}</h2>
        <p className="chat-rail-intro">{reading.intro}</p>
      </div>

      <ul className="chat-reading-list">
        {reading.items.map((item) => (
          <li key={item.title} className="chat-reading-item">
            <ChatIcon name={item.icon} tone={item.tone} size={15} />
            <span className="chat-reading-text">
              <span className="chat-reading-title">{item.title}</span>
              <span className="chat-reading-detail">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3>{labels.tryAsking}</h3>
      <div className="chat-suggestions">
        {suggestions.map((text) => (
          <button key={text} type="button" className="chat-suggestion" onClick={() => onSuggest(text)}>
            {text}
          </button>
        ))}
      </div>
    </aside>
  );
}
