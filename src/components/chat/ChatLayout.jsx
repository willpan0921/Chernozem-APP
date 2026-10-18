// WHAT THIS FILE DOES
// The three-column frame of an AI page: the "Chats" list on the left
// (248px), the conversation in the middle, and the "Using" / "Try asking"
// column on the right (288px). It fills the whole screen height.
//
// Before the first chat is saved there is nothing to list, so the "Chats"
// column is left out and the conversation gets the room. On screens
// narrower than 1100px the chat list becomes one row of chips above the
// conversation, and "Using" / "Try asking" move below it.
//
// WHO EDITS IT
// Danny. The column widths are in src/components/chat/chat.css.
//
// WHAT IT RECEIVES
// threads      - the left column (a <ChatThreadList />)
// conversation - the middle column (a <ChatConversation />)
// rail         - the right column (a <ChatRail />)
// noThreads    - true when there are no saved chats yet: the left column is hidden

import "./chat.css";

export default function ChatLayout({ threads, conversation, rail, noThreads = false }) {
  return (
    <div className="page-full">
      <div className={noThreads ? "chat-layout is-no-threads" : "chat-layout"}>
        {!noThreads && threads}
        {conversation}
        {rail}
      </div>
    </div>
  );
}
