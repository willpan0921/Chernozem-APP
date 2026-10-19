// WHAT THIS FILE DOES
// The message box at the bottom of an AI page: a text area, an optional
// row of context chips under it (neither AI page uses them now: their
// choices are in the "Using" column), a round green send button, and the
// small warning line under the box.
//
// Pressing Enter sends the message (Shift+Enter makes a new line). While an
// answer is being written the send button becomes a stop button.
//
// WHO EDITS IT
// Danny. The placeholder and warning text come from "composer" in
// src/data/chats.js.
//
// WHAT IT RECEIVES
// placeholder - grey hint text in the empty box
// disclaimer  - the small note under the box
// draft       - the text in the box
// onDraft     - called with the new text as the person types
// chips       - dropdown chips: [{ kind, value, options: [{ value, label }], onChange }]
// onSend      - called when the person sends (Enter or the arrow button)
// onStop      - called when the stop button is clicked
// busy        - true while an answer is being written
// disabled    - true when the AI cannot answer at all (no key yet)
// focusKey    - when this changes, the box is focused (e.g. a new chat)

import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ChipSelect } from "../ui/index.js";

export default function ChatComposer({ placeholder, disclaimer, draft, onDraft, chips = [], onSend, onStop, busy, disabled, focusKey }) {
  const inputRef = useRef(null);

  // Grow the text area with its content, up to the limit in chat.css. Runs
  // when the text changes, when the box changes width, and once the web
  // font has loaded.
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

  // Put the cursor in the box when a chat opens (not on phones, where it
  // would pop the keyboard up).
  useEffect(() => {
    const input = inputRef.current;
    if (!input || window.matchMedia?.("(max-width: 600px)").matches) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusKey]);

  const canSend = !disabled && !busy && draft.trim().length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (busy) onStop?.();
    else if (canSend) onSend();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="chat-composer-wrap">
      <form className={disabled ? "chat-composer is-disabled" : "chat-composer"} onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-composer-input"
          rows={1}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message"
          maxLength={4000}
          disabled={disabled}
          data-testid="chat-input"
        />
        <div className="chat-composer-row">
          <div className="chat-composer-chips">
            {chips.map((chip) => (
              <ChipSelect
                key={chip.kind}
                ariaLabel={chip.label || chip.kind}
                options={chip.options}
                value={chip.value}
                onChange={chip.onChange}
              />
            ))}
          </div>
          {busy ? (
            <button type="submit" className="chat-send-button is-stop" aria-label="Stop" data-testid="chat-stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className="chat-send-button" aria-label="Send" disabled={!canSend} data-testid="chat-send">
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
      <p className="disclaimer">{disclaimer}</p>
    </div>
  );
}
