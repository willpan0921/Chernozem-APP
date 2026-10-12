// WHAT THIS FILE DOES
// The Field AI page (/field/ai): a farmer's chat with Chernozem AI about
// their farm. It is the shared chat screen (src/components/chat) filled
// with the Field data from src/data/chats.js.
//
// WHO EDITS IT
// Danny owns the chat building blocks in src/components/chat. To change the
// sample conversations, the "What AI is reading" list or the "Try asking"
// questions, edit src/data/chats.js instead.

import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import { fieldChats, fieldReading, fieldSuggestions, composer } from "../../data/chats.js";

export default function AiPage() {
  return (
    <div className="ai-page">
      <ChatScreen
        product="field"
        threads={fieldChats}
        reading={fieldReading}
        suggestions={fieldSuggestions}
        composer={composer.field}
      />
    </div>
  );
}
