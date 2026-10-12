// WHAT THIS FILE DOES
// The three-column frame of an AI page: the "Chats" list on the left
// (260px), the conversation in the middle, and the "What AI is reading"
// column on the right (300px). It fills the whole screen height. On narrow
// screens the three columns stack on top of each other.
//
// WHO EDITS IT
// Danny. The column widths are in src/components/chat/chat.css.
//
// WHAT IT RECEIVES
// threads      - the left column (a <ChatThreadList />)
// conversation - the middle column (a <ChatConversation />)
// rail         - the right column (a <ChatRail />)

import "./chat.css";

export default function ChatLayout({ threads, conversation, rail }) {
  return (
    <div className="page-full">
      <div className="chat-layout">
        {threads}
        {conversation}
        {rail}
      </div>
    </div>
  );
}
