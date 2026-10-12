// WHAT THIS FILE DOES
// The placeholder AI chat threads for both products: the Field AI page
// (/field/ai) and the Atlas AI page (/atlas/ai). Every word, number and
// badge on those two screens comes from here, so the pages themselves hold
// no text of their own. It also holds the "What AI is reading" lists, the
// "Try asking" suggestions and the text in the message box at the bottom.
//
// This is PLACEHOLDER DATA copied from the design mockups. Nothing here
// talks to a real AI yet. When the real chat service exists, the team
// replaces these constants with its answers (same shapes, live values).
//
// WHO EDITS IT
// Whoever changes the sample conversations or wires up the real AI. Page
// files (src/pages/field/FieldAI.jsx, src/pages/atlas/AtlasAI.jsx) only
// read from here; they never contain chat text themselves.
//
// HOW TO EDIT IT
// - A thread is one chat in the left "Chats" list. Its "messages" list is
//   what shows in the middle, top to bottom.
// - A message is either from the person ("user") or from the AI ("ai").
//   Each has an id, a role, a time ("at" is the exact ISO time, "time" is
//   the short label the screen shows, e.g. "Sep 26 · 8:10"), and "text".
// - A message may also carry:
//     attachment - a photo chip under the bubble: { name: "photo.jpg" }
//     strong     - words inside "text" to show in bold, e.g. ["101"]
//     card       - a structured box drawn under the text. "card.type" is one
//                  of "plan", "whatif", "table" or "actions" (shapes below).
// - ONE REPLY, SEVERAL PARTS: when the AI answer on the mockup is a
//   paragraph, then a table, then another paragraph, then buttons, it is
//   stored as CONSECUTIVE "ai" messages (one per part), sharing the same
//   "at" time. The page shows the "Chernozem AI" name only on the first of a
//   run of ai messages, so it reads as one answer. (We chose this over a
//   "blocks" list so every message has the same shape.)
// - Icon keys ("icon": "shield", "cloud", ...) are the names of Lucide icons
//   at https://lucide.dev/icons, written in lower-case with dashes. The page
//   turns the key into the icon. Keys used here:
//     shield, cloud, file-text, calendar, landmark, map, map-pin,
//     sliders-horizontal, circle-dollar-sign, camera, plus
// - Badge tones are the tones Badge.jsx understands: "green", "red",
//   "amber", "blue", "ink", "outline", or leave the tone out for grey.
// - Dates: "date"/"at" are ISO ("2026-09-26" / "2026-09-26T08:10"). The
//   matching display string sits next to it so nothing has to be formatted.
//
// CARD SHAPES
//   { type: "plan",   title, items: [{ icon, text }], footer, link: { label, to } }
//   { type: "whatif", title, rows: [{ label, badge?: { text, tone? }, value }], footer }
//   { type: "table",  title, columns: [..], rows: [[..]], total: [..], footer }
//     - each table row is [rank, name, budget, land]; "total" has the same
//       columns with "" where the rank would be. Budget and land are shown
//       in the number font (var(--font-mono)).
//   { type: "actions", buttons: [{ label, icon, to? }] }
//     - a button with "to" is a link to that page; one without does nothing
//       yet (title="Not connected yet").

// The name shown above every AI answer, next to the small logo.
export const aiName = "Chernozem AI";

// ---------------------------------------------------------------------------
// FIELD AI  (/field/ai)  - what a farmer sees
// ---------------------------------------------------------------------------

// The Field AI chat threads. The first one is the thread open on the mockup;
// the rest only need a title for the "Chats" list for now (empty messages).
export const fieldChats = [
  {
    id: "field-shelling-7",
    title: "Shelling near Field 7",
    date: "2026-09-26",
    dateLabel: "Sep 26",
    scopeLabel: "Field 7",
    subtitle: "AI knows this field's report, your notes, and the local weather",
    messages: [
      {
        id: "f1",
        role: "user",
        at: "2026-09-26T08:10",
        time: "Sep 26 · 8:10",
        text:
          "Shelling hit near the east edge of Field 7 on the night of Sep 24. There's a new crater about 30 m from the tree line. What should I do?",
        attachment: { name: "crater_east_edge.jpg" },
      },
      {
        id: "f2",
        role: "ai",
        at: "2026-09-26T08:10",
        time: "Sep 26 · 8:10",
        text:
          "I'm sorry this happened. Your safety comes first. Stay out of Field 7 and keep others out. Report the crater to the State Emergency Service at 101 so deminers can mark it.",
        strong: ["101"],
        card: {
          type: "plan",
          title: "PLAN UPDATED · FIELD 7",
          items: [
            { icon: "shield", text: "The verdict stays Get it checked first." },
            {
              icon: "cloud",
              text:
                "Radar will recheck the east edge on its next pass, usually within a week, even through clouds.",
            },
            { icon: "file-text", text: "Your demining request now covers both damaged areas." },
          ],
          footer:
            "The fast path cost rises by about $80–250 for one more hectare of crater filling.",
          link: { label: "Open the plan", to: "/field/fields" },
        },
      },
      {
        id: "f3",
        role: "user",
        at: "2026-09-26T08:14",
        time: "Sep 26 · 8:14",
        text: "What if I plant sunflower next spring instead of winter wheat now?",
      },
      {
        id: "f4",
        role: "ai",
        at: "2026-09-26T08:14",
        time: "Sep 26 · 8:14",
        text:
          "That gives the deminers and the soil test more time. Winter wheat here should be sown by mid-October, which is too soon for this field.",
        card: {
          type: "whatif",
          title: "WHAT IF · SUNFLOWER NEXT SPRING",
          rows: [
            {
              label: "Winter wheat now",
              badge: { text: "Not possible", tone: "red" },
              value: "The survey has to come first.",
            },
            {
              label: "Sunflower next spring",
              badge: { text: "Possible", tone: "green" },
              value:
                "Sow Apr 20 to May 10 on the 33.5 ha that look undamaged, if the field is cleared by early April.",
            },
            { label: "Recovery cost", value: "No change" },
          ],
          footer: "Estimate. Clearing dates depend on the demining team.",
        },
      },
    ],
  },
  {
    id: "field-harvest-sunflower",
    title: "Harvest timing for sunflower",
    date: "2026-09-22",
    dateLabel: "Sep 22",
    scopeLabel: "Field 2",
    subtitle: "AI knows this field's report, your notes, and the local weather",
    messages: [],
  },
  {
    id: "field-corn-dry",
    title: "Is my corn too dry?",
    date: "2026-09-18",
    dateLabel: "Sep 18",
    scopeLabel: "Field 3",
    subtitle: "AI knows this field's report, your notes, and the local weather",
    messages: [],
  },
  {
    id: "field-seed-rate",
    title: "Seed rate for winter wheat",
    date: "2026-09-10",
    dateLabel: "Sep 10",
    scopeLabel: "Field 1",
    subtitle: "AI knows this field's report, your notes, and the local weather",
    messages: [],
  },
  {
    id: "field-programs",
    title: "Programs I can apply for",
    date: "2026-08-30",
    dateLabel: "Aug 30",
    scopeLabel: "Whole farm",
    subtitle: "AI knows your farm's reports, your notes, and the programs open in Ukraine",
    messages: [],
  },
];

// The "What AI is reading" column on the Field AI page: an intro sentence
// and the list of sources, each with an icon key, a title and a detail line.
export const fieldReading = {
  intro: "Answers come from your own data first.",
  items: [
    { icon: "shield", title: "Field 7 report", detail: "Sep 28 · 31% damaged · Get it checked first" },
    { icon: "file-text", title: "Your note", detail: "Sep 25 · New crater by the east tree line" },
    { icon: "cloud", title: "Weather", detail: "10-day forecast, Kupiansk district" },
    { icon: "landmark", title: "Programs", detail: "2 match in Ukraine" },
    { icon: "calendar", title: "Normal years", detail: "2019 to 2021, before the war" },
  ],
};

// The "Try asking" buttons on the Field AI page. Clicking one puts the text
// in the message box. The last one is Ukrainian for "Answer in Ukrainian".
export const fieldSuggestions = [
  "Draft my demining compensation request",
  "What if the field floods this winter?",
  "Explain the damage map to me",
  "Відповідай українською",
];

// ---------------------------------------------------------------------------
// ATLAS AI  (/atlas/ai)  - what a regional office sees
// ---------------------------------------------------------------------------

// The Atlas AI chat threads. The first one is open on the mockup; its first
// AI answer is stored as three consecutive "ai" messages (see header).
export const atlasChats = [
  {
    id: "atlas-spring-budget",
    title: "Spring budget, $10M",
    date: "2026-10-02",
    dateLabel: "Oct 2",
    scopeLabel: "Near term",
    subtitle: "AI reads the September run, your scoring rules, and the cost table",
    messages: [
      {
        id: "a1",
        role: "user",
        at: "2026-10-02T09:40",
        time: "Oct 2 · 9:40",
        text: "We have $10 million for spring 2027. Where should it go first?",
      },
      // Part 1 of the answer: the opening paragraph and the draft plan table.
      {
        id: "a2",
        role: "ai",
        at: "2026-10-02T09:40",
        time: "Oct 2 · 9:40",
        text:
          "Start with Odesa, Poltava, and Cherkasy. They lead the Near term ranking because crews can reach them today and their damaged black soil is worth restoring.",
        card: {
          type: "table",
          title: "DRAFT PLAN · SPRING 2027",
          columns: ["Region", "Budget", "Land it covers"],
          rows: [
            ["1", "Odesa", "$4.0M", "13,800–42,100 ha"],
            ["2", "Poltava", "$3.5M", "12,100–36,800 ha"],
            ["3", "Cherkasy", "$2.5M", "8,600–26,300 ha"],
          ],
          total: ["", "Total", "$10.0M", "34,500–105,200 ha"],
          footer:
            "Split by each region's damaged black soil that passes the Near term gate. Fast path at $95–290 per ha. Demining surveys come first and are funded separately.",
        },
      },
      // Part 2: the paragraph under the table.
      {
        id: "a3",
        role: "ai",
        at: "2026-10-02T09:40",
        time: "Oct 2 · 9:40",
        text:
          "Donetsk holds the most heavy damage, 702,000 ha, but almost none of it has safe access today. It rises to the top in Postwar.",
      },
      // Part 3: the two action buttons.
      {
        id: "a4",
        role: "ai",
        at: "2026-10-02T09:40",
        time: "Oct 2 · 9:40",
        text: "",
        card: {
          type: "actions",
          buttons: [
            { label: "Show on the Atlas", icon: "map", to: "/atlas/map" },
            { label: "Save as plan", icon: "plus" },
          ],
        },
      },
      {
        id: "a5",
        role: "user",
        at: "2026-10-02T09:43",
        time: "Oct 2 · 9:43",
        text: "What if we raise the damage weight to 50%?",
      },
      {
        id: "a6",
        role: "ai",
        at: "2026-10-02T09:43",
        time: "Oct 2 · 9:43",
        text:
          "Weights only change the Postwar ranking. Near term checks safe access first and then ranks by soil value and damage, so this spring plan stays the same.",
        card: {
          type: "whatif",
          title: "WHAT IF · DAMAGE WEIGHT 50%",
          rows: [
            {
              label: "Spring plan",
              badge: { text: "No change" },
              value: "Weights do not apply in Near term.",
            },
            {
              label: "Postwar top four",
              badge: { text: "Same four" },
              value: "Donetsk, Kharkiv, Luhansk, Zaporizhzhia",
            },
            { label: "New weights", value: "Soil 25 · Damage 50 · Access 25" },
          ],
          footer:
            "The research tested 28 Postwar settings. At r = 0.5 these four eastern regions lead under every weighting tested.",
        },
      },
    ],
  },
  {
    id: "atlas-donetsk-aside",
    title: "Why is Donetsk set aside?",
    date: "2026-09-30",
    dateLabel: "Sep 30",
    scopeLabel: "Near term",
    subtitle: "AI reads the September run, your scoring rules, and the cost table",
    messages: [],
  },
  {
    id: "atlas-kupiansk-brief",
    title: "Kupiansk cluster brief for donors",
    date: "2026-09-29",
    dateLabel: "Sep 29",
    scopeLabel: "Kharkiv",
    subtitle: "AI reads the September run, the Kupiansk help requests, and the cost table",
    messages: [],
  },
  {
    id: "atlas-compare-rankings",
    title: "Compare Near term and Postwar",
    date: "2026-09-24",
    dateLabel: "Sep 24",
    scopeLabel: "All regions",
    subtitle: "AI reads the September run, your scoring rules, and the cost table",
    messages: [],
  },
  {
    id: "atlas-damage-map-sure",
    title: "How sure is the damage map?",
    date: "2026-09-22",
    dateLabel: "Sep 22",
    scopeLabel: "Data",
    subtitle: "AI reads the September run and the research paper",
    messages: [],
  },
];

// The "What AI is reading" column on the Atlas AI page.
export const atlasReading = {
  intro: "Answers come from the Atlas data first.",
  items: [
    { icon: "map", title: "September 2026 run", detail: "24 regions · 15.07M ha of black soil" },
    {
      icon: "sliders-horizontal",
      title: "Scoring rules",
      detail: "Near term gate at the 30th percentile · Postwar weights 30 / 40 / 30",
    },
    {
      icon: "circle-dollar-sign",
      title: "Cost table",
      detail: "Fast path $95–290 per ha · Full recovery $260–620 per ha",
    },
    { icon: "map-pin", title: "Help requests", detail: "3 shared by farms in Kupiansk district" },
    { icon: "file-text", title: "The research paper", detail: "Method, validation, and limits" },
  ],
};

// The "Try asking" buttons on the Atlas AI page.
export const atlasSuggestions = [
  "Write a donor brief for the Kupiansk cluster",
  "Which parts of Kharkiv pass the gate today?",
  "How sure are these rankings?",
  "Відповідай українською",
];

// ---------------------------------------------------------------------------
// THE MESSAGE BOX at the bottom of each AI page, per product.
//   placeholder    - grey hint text in the empty box
//   contextChips   - the small chips under the text: a "field" chip is a
//                    dropdown (ChipSelect) with options; a "camera" chip is
//                    an icon button for attaching a photo; a plain chip
//                    with "options" is a dropdown; the default value is
//                    "label"
//   disclaimer     - the small note under the box
//   languageButton - the button in the page header ("Answers in English")
// ---------------------------------------------------------------------------
export const composer = {
  field: {
    placeholder: "Tell AI what happened, or ask anything about your farm",
    contextChips: [
      {
        kind: "field",
        label: "Field 7",
        options: ["Field 1", "Field 2", "Field 3", "Field 4", "Field 5", "Field 6", "Field 7", "Whole farm"],
      },
      { kind: "camera", icon: "camera", label: "Add a photo" },
    ],
    disclaimer:
      "AI can make mistakes. It never decides whether land is safe. Only official deminers can.",
    languageButton: "Answers in English",
  },
  atlas: {
    placeholder: "Ask about regions, budgets, or how the ranking works",
    contextChips: [
      {
        kind: "region",
        label: "All regions",
        options: ["All regions", "Kharkiv", "Donetsk", "Odesa", "Poltava", "Cherkasy"],
      },
      { kind: "horizon", label: "Near term", options: ["Near term", "Postwar"] },
    ],
    disclaimer:
      "AI can make mistakes. It never decides whether land is safe. Only certified deminers can.",
    languageButton: "Answers in English",
  },
};
