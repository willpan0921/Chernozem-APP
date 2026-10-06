// WHAT THIS FILE DOES
// The chat panel on the Field page: a list of chat bubbles and an input box.
// Typing a question and pressing Send (or Enter) shows the question as a
// bubble, then shows the reply as another bubble. The reply comes from
// src/api/chatApi.js, which is a fake for now.
//
// WHO EDITS IT
// Danny. How the chat looks (colours, bubbles) is in the "Chat panel" part of
// src/styles.css.
//
// WHAT IT RECEIVES
// fieldName - the name of the field the person is looking at, so the chat
//             knows which field the conversation is about.

import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../api/chatApi.js";

export default function ChatPanel({ fieldName }) {
  // Every bubble in the conversation, oldest first.
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: "assistant",
      text: `Ask me anything about ${fieldName}.`,
    },
  ]);
  // The text currently in the input box.
  const [draft, setDraft] = useState("");
  // True while we are waiting for a reply.
  const [waiting, setWaiting] = useState(false);
  // Lets us scroll the message list.
  const listRef = useRef(null);

  // Whenever a bubble is added, scroll the list down to show it.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, waiting]);

  // Adds one bubble to the end of the conversation.
  function addMessage(from, text) {
    setMessages((current) => [...current, { id: current.length + 1, from, text }]);
  }

  // Runs when Send is clicked or Enter is pressed.
  async function handleSubmit(event) {
    // Stops the page from reloading.
    event.preventDefault();

    // Ignore empty messages, and wait for one reply before sending the next.
    const question = draft.trim();
    if (!question || waiting) return;

    // Show the question straight away and clear the input box.
    addMessage("user", question);
    setDraft("");

    // Ask for the reply, then show it.
    setWaiting(true);
    try {
      const reply = await sendChatMessage(question, fieldName);
      addMessage("assistant", reply);
    } catch {
      addMessage("assistant", "Sorry, something went wrong. Please try again.");
    } finally {
      setWaiting(false);
    }
  }

  return (
    <section className="chat-panel">
      <h2 className="chat-title">
        {/* A small sparkle icon, drawn directly so no icon library is needed. */}
        <svg className="chat-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z" />
          <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
        </svg>
        Ask about this field
      </h2>

      <ul className="chat-messages" ref={listRef}>
        {messages.map((message) => (
          <li
            key={message.id}
            className={`chat-message chat-message-${message.from}`}
          >
            {message.text}
          </li>
        ))}

        {/* Shown while the reply is on its way. */}
        {waiting && (
          <li className="chat-message chat-message-waiting">Typing…</li>
        )}
      </ul>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          className="chat-input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question"
          aria-label="Chat message"
        />
        {/* The Send button, shown as an upward arrow. */}
        <button className="chat-send" type="submit" disabled={waiting} aria-label="Send">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5" />
            <path d="M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>
    </section>
  );
}
