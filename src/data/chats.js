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
// The Field ones name the farm's real fields: fieldSuggestions() is given
// the name of the field that most needs work and the one closest to
// harvest (either can be missing). peace: true when no known war covers
// the farm, so the last question asks about stress, not damage.
export function fieldSuggestions({ urgent, harvest, peace = false } = {}) {
  return [
    urgent ? `What should I do on ${urgent}?` : "Which field needs me first?",
    harvest ? `When should I harvest ${harvest}?` : "When can I harvest?",
    "How is this season vs normal?",
    peace ? "Is any field under stress?" : "Is any field damaged?",
  ];
}

// The kinds of event in "Tell us what happened" (the Overview's chips) and
// on the Field AI page. One list for both, so a new kind shows the same
// everywhere. The server accepts the same ids (REPORT_KINDS in
// server/field/routes.js).
//   id     - what is saved with the report
//   label  - the chip and the AI page's "Using" row ("Shelling")
//   phrase - the words in the first question ("I reported shelling on ...")
export const REPORT_KINDS = [
  { id: "shelling", label: "Shelling", phrase: "shelling" },
  { id: "fire", label: "Fire", phrase: "a fire" },
  { id: "flood", label: "Flood", phrase: "a flood" },
  { id: "hail", label: "Hail", phrase: "hail" },
  { id: "pests", label: "Pests", phrase: "pests" },
  { id: "other", label: "Other", phrase: "a problem" },
];

// The kind for an id; anything unknown counts as "other".
export const reportKind = (id) => REPORT_KINDS.find((kind) => kind.id === id) || REPORT_KINDS[REPORT_KINDS.length - 1];

// The first question of a chat opened from "Tell us what happened"
// (the report's photos go with it). "{what}" is the kind's phrase, "{where}"
// the field ("Field 7", or "my farm").
export const reportQuestion = "I reported {what} on {where}. What should I do now?";

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
// The same where no war in the app's list covers the area (the run's
// conflict is null): no question about fighting.
export const atlasSmallAreaPeaceSuggestions = [
  "Which part of this area should we start with?",
  "What changed since last month?",
  "What would restoring it cost?",
  "What caused the damage here?",
];
// The questions for an area: small or not, at war or at peace.
//   small  the area is under SMALL_AREA_HA
//   peace  true when no war in the app's list covers it, or when no
//          distance to fighting was measured (a month before its war
//          began, or a war where no fire looked like fighting): no
//          question about fighting
// In a natural disaster the team set (src/lib/atlas/method.js
// DISASTER_TYPES) the fourth question follows its type, never fighting.
export const atlasDisasterQuestions = {
  flood: "Which fields are still under water?",
  wildfire: "Where is it still burning?",
  drought: "Where did the crop fail worst?",
  ground: "Where did the land change most?",
  other: "Where did the land change most?",
};
//   disaster  the disaster's type ("flood", ...), or null
export function atlasStarterQuestions({ small = false, peace = false, disaster = null } = {}) {
  if (!small) return atlasSuggestions;
  if (disaster) return [...atlasSmallAreaPeaceSuggestions.slice(0, 3), atlasDisasterQuestions[disaster] || atlasDisasterQuestions.other];
  return peace ? atlasSmallAreaPeaceSuggestions : atlasSmallAreaSuggestions;
}

// The message box at the bottom of each AI page.
//   placeholder - grey hint text in the empty box
//   disclaimer  - the small note under the box; disclaimerPeace where no
//                 war is recorded (no mention of deminers)
//   welcome     - the line in an empty new chat ("{area}" is the area name,
//                 "{farm}" the farm name)
export const composer = {
  field: {
    placeholder: "Ask about your farm",
    disclaimer: "AI can make mistakes. It never decides whether land is safe. Only official deminers can.",
    disclaimerPeace: "AI can make mistakes. It never decides whether land is safe.",
    welcome: "Ask about {farm}",
  },
  atlas: {
    placeholder: "Ask about {area}",
    disclaimer: "AI can make mistakes. It never decides whether land is safe. Only certified deminers can.",
    disclaimerPeace: "AI can make mistakes. It never decides whether land is safe.",
    // A natural disaster: no deminers, but no promise either.
    disclaimerDisaster: "AI can make mistakes. It never decides whether land is safe or can be worked: check it on the ground with local authorities.",
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
