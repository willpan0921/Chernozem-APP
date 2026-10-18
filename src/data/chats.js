// WHAT THIS FILE DOES
// The words on the two AI chat screens: the Field AI page (/field/ai) and
// the Atlas AI page (/atlas/ai). The conversations themselves are real now:
// they are saved on the server (server/.data/chats/) and come from the AI,
// so there are no sample chats here any more. What is left is the fixed
// text: the AI's name, the "Try asking" starter questions, the message box
// text and the steps to connect Claude.
//
// WHO EDITS IT
// Danny, or anyone changing what the chat screens say. The page files and
// src/components/chat read from here.

// The name shown next to the small logo on AI answers.
export const aiName = "Chernozem AI";

// The "Try asking" buttons. Clicking one sends the question straight away.
// The last Field one is Ukrainian for "Answer in Ukrainian".
export const fieldSuggestions = [
  "What should I do first on Field 7?",
  "Fast path or full recovery for Field 7?",
  "Which fields need watching this month?",
  "Відповідай українською",
];

// For the Atlas, "{budget}" is replaced with the workspace budget ("$10M").
// A region or country gets these:
export const atlasSuggestions = [
  "Which areas should we restore first?",
  "Where would {budget} go furthest?",
  "What changed since last month?",
  "Write a short brief for donors",
];

// An area smaller than this many hectares (a farm or a few fields) gets the
// farm-sized questions below instead.
export const SMALL_AREA_HA = 1000;
export const atlasSmallAreaSuggestions = [
  "Which part of this area should we start with?",
  "What changed since last month?",
  "What would restoring it cost?",
  "How far is it from the fighting?",
];

// The message box at the bottom of each AI page.
//   placeholder - grey hint text in the empty box
//   disclaimer  - the small note under the box
//   welcome     - the line in an empty new chat ("{area}" is the area name)
export const composer = {
  field: {
    placeholder: "Ask anything about your farm",
    disclaimer: "AI can make mistakes. It never decides whether land is safe. Only official deminers can.",
    welcome: "Ask about your farm",
  },
  atlas: {
    placeholder: "Ask about {area}",
    disclaimer: "AI can make mistakes. It never decides whether land is safe. Only certified deminers can.",
    welcome: "Ask about {area}",
  },
};

// The card shown when the AI has no key yet (the .env file at the top of
// the project folder has no ANTHROPIC_API_KEY). Three steps, exactly as the
// server explains them.
export const aiSetup = {
  title: "Connect Claude",
  steps: [
    { text: "Get an API key at", link: { label: "console.anthropic.com", href: "https://console.anthropic.com/settings/keys" } },
    { text: "Add it to .env:", code: "ANTHROPIC_API_KEY=" },
    { text: "Restart", code: "npm run dev" },
  ],
  check: "Check again",
};
