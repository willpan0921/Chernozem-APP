// CHANGED (October 2026): the fake replies are gone. sendChatMessage now
// sends the question to the real AI (Claude) through the Atlas server
// (POST /api/chat, see server/ai/chat.js) and streams the answer back as it
// is written. It goes through streamChat in src/api/atlasApi.js. Saved
// chats now live on the server too, so this file also lists, opens and
// deletes them. The AI only answers once ANTHROPIC_API_KEY is in .env;
// until then the reply is one "ai_not_configured" error.
//
// WHAT THIS FILE DOES
// The one place the app "talks to the AI". Both AI pages use it: the Field
// AI page (/field/ai) and the Atlas AI page (/atlas/ai). The chat
// components in src/components/chat only call the functions below.
//
// WHO EDITS IT
// Danny. As long as sendChatMessage still takes a message and options and
// gives back the reply, the chat components do not need to change.
//
// HOW TO CALL IT
//   const reply = await sendChatMessage("Where should we start?", {
//     product: "atlas",                 // "atlas" or "field"
//     threadId: "chat-1a2b3c4d",        // leave out to start a new chat
//     context: { runId, settings, timeframe, selectedCellId },   // Atlas
//     //  or   { farm: { ...a short farm summary } }               // Field
//     onThread: ({ threadId, title }) => {},  // the chat was saved (new chats get an id here)
//     onText:   (piece, wholeSoFar) => {},    // more of the answer arrived
//     onTool:   ({ name, status }) => {},     // the AI is looking something up
//     onError:  ({ code, message }) => {},    // e.g. code "ai_not_configured"
//     signal,                                 // an AbortSignal to stop early (optional)
//   });
//   // reply = { threadId, messageId, text, error }   (error is null when it worked)
//
//   listThreads("atlas")  -> [{ id, title, updatedAt, preview }]  newest first
//   openThread(id)        -> { id, title, messages: [{ id, role: "user"|"assistant", text, at, stopped? }] }
//                            or null when the chat was deleted
//   removeThread(id)      -> true
//   getAiStatus()         -> { configured, model }

import { deleteChat, getChat, getStatus, listChats, streamChat } from "./atlasApi.js";

// Sends a question and streams the reply. Never throws for AI problems:
// they come back as reply.error (and through onError). Stopping with the
// signal throws an AbortError, like fetch does.
export async function sendChatMessage(message, options = {}) {
  const { product = "atlas", threadId, context = {}, onThread, onText, onTool, onError, signal } = options;
  let soFar = "";
  return streamChat({
    product,
    threadId: threadId || undefined,
    message,
    context,
    signal,
    onEvent(name, data) {
      if (name === "thread") onThread?.(data);
      else if (name === "delta") {
        soFar += data.text || "";
        onText?.(data.text || "", soFar);
      } else if (name === "tool") onTool?.(data);
      else if (name === "error") onError?.(data);
    },
  });
}

export const listThreads = (product) => listChats(product);
export const openThread = (id) => getChat(id);
export const removeThread = (id) => deleteChat(id);

// Whether the AI has its key. A server that cannot be reached counts as
// "not known" (null), so the page does not show the setup steps by mistake.
export async function getAiStatus() {
  try {
    const status = await getStatus();
    return status?.ai || null;
  } catch {
    return null;
  }
}
