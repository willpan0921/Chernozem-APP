// WHAT THIS FILE DOES
// The message box at the bottom of an AI page: a text area, a row of
// context chips under it ("Field 7 ⌄" and a camera button on the Field
// page; "All regions ⌄" and "Near term ⌄" on the Atlas page), a round green
// send button, and the small warning line under the box.
//
// Pressing Enter sends the message (Shift+Enter makes a new line).
//
// WHO EDITS IT
// Danny. The placeholder, chips and warning text come from "composer" in
// src/data/chats.js.
//
// WHAT IT RECEIVES
// config   - composer.field or composer.atlas from src/data/chats.js
// draft    - the text in the box
// onDraft  - called with the new text as the person types
// chips    - the chosen value of each dropdown chip, keyed by chip kind,
//            e.g. { field: "Field 7" }
// onChip   - called with (kind, newValue) when a dropdown changes
// onSend   - called when the person sends (Enter or the arrow button)
// disabled - true while a reply is on its way

import { useEffect, useRef } from "react";
import { Camera, Send } from "lucide-react";
import { ChipSelect } from "../ui/index.js";

export default function ChatComposer({ config, draft, onDraft, chips, onChip, onSend, disabled }) {
  const inputRef = useRef(null);

  // Grow the text area with its content (or its placeholder, when it wraps
  // on a narrow screen), up to the limit in chat.css. Runs when the text
  // changes, when the box changes width, and once the web font has loaded
  // (the placeholder can wrap differently in the real font).
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let gone = false;
    function grow() {
      if (gone) return;
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    }
    grow();
    const observer = new ResizeObserver(grow);
    observer.observe(input.parentElement);
    if (document.fonts?.ready) document.fonts.ready.then(grow);
    return () => {
      gone = true;
      observer.disconnect();
    };
  }, [draft]);

  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    onSend();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) onSend();
    }
  }

  return (
    <div className="chat-composer-wrap">
      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-composer-input"
          rows={1}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={config.placeholder}
          aria-label="Message"
        />
        <div className="chat-composer-row">
          <div className="chat-composer-chips">
            {config.contextChips.map((chip) =>
              chip.kind === "camera" ? (
                <button
                  key={chip.kind}
                  type="button"
                  className="chat-camera-button"
                  aria-label={chip.label}
                  title="Not connected yet"
                >
                  <Camera size={16} />
                </button>
              ) : (
                <ChipSelect
                  key={chip.kind}
                  ariaLabel={chip.kind}
                  options={chip.options.map((option) => ({ value: option, label: option }))}
                  value={chips[chip.kind] ?? chip.label}
                  onChange={(value) => onChip(chip.kind, value)}
                />
              ),
            )}
          </div>
          <button type="submit" className="chat-send-button" aria-label="Send" disabled={disabled}>
            <Send size={16} />
          </button>
        </div>
      </form>
      <p className="disclaimer">{config.disclaimer}</p>
    </div>
  );
}
