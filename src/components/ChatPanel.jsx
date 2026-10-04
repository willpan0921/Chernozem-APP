// WHAT THIS FILE DOES
// The chat panel on the Field page: a list of messages and an input box.
// Right now it is a placeholder. It shows one message and sends nothing.
//
// WHO EDITS IT
// Danny. Replace the inside of this file with the real AI chat. Nothing else
// in the app needs to change, as long as this file still exports a component
// called ChatPanel.
//
// WHAT IT RECEIVES
// fieldName - the name of the field the person is looking at, so the real
//             chat can know which field the conversation is about.

export default function ChatPanel({ fieldName }) {
  // Placeholder messages. The real chat will build this list as people talk.
  const messages = [
    {
      id: 1,
      from: "assistant",
      text: `Chat is coming soon. You will be able to ask questions about ${fieldName} here.`,
    },
  ];

  // Stops the page from reloading when Send is clicked. Does nothing else yet.
  function handleSubmit(event) {
    event.preventDefault();
  }

  return (
    <section className="chat-panel">
      <h2 className="chat-title">Ask about this field</h2>

      <ul className="chat-messages">
        {messages.map((message) => (
          <li key={message.id} className={`chat-message chat-message-${message.from}`}>
            {message.text}
          </li>
        ))}
      </ul>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          className="chat-input"
          type="text"
          placeholder="Type a question (not working yet)"
          aria-label="Chat message"
        />
        <button className="button" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
