// WHAT THIS FILE DOES
// The Atlas AI page (/atlas/ai): a regional office's chat with Chernozem AI
// about regions, budgets and the ranking. It is the shared chat screen
// (src/components/chat) filled with the Atlas data from src/data/chats.js.
//
// WHO EDITS IT
// Danny owns the chat building blocks in src/components/chat. To change the
// sample conversations, the "What AI is reading" list or the "Try asking"
// questions, edit src/data/chats.js instead.

import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import { atlasChats, atlasReading, atlasSuggestions, composer } from "../../data/chats.js";

export default function AiPage() {
  return (
    <div className="ai-page">
      <ChatScreen
        product="atlas"
        threads={atlasChats}
        reading={atlasReading}
        suggestions={atlasSuggestions}
        composer={composer.atlas}
      />
    </div>
  );
}
