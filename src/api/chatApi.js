// WHAT THIS FILE DOES
// The one place the app "talks to the AI". Right now there is no real AI: the
// function waits about a second and returns a fake reply, in the same language
// as the question (English, Ukrainian, Russian or Chinese).
//
// Both AI pages use it: the Field AI page (/field/ai) and the Atlas AI page
// (/atlas/ai). The "context" tells the AI which product the person is in and
// what the chat is about ("Field 7", "All regions"...).
//
// WHO EDITS IT
// Danny. To connect the real AI, replace the inside of sendChatMessage. As
// long as it still takes a message and a context and gives back the reply
// text, the chat components in src/components/chat do not need to change.
//
// HOW TO CALL IT
//   const reply = await sendChatMessage("What should I do?", {
//     product: "field",        // "field" or "atlas"
//     scopeLabel: "Field 7",   // the chip under the message box
//   });

// The fake reply in each language. "scope" is dropped into the sentence.
const fakeReplies = {
  english: (scope) =>
    `Thanks for your question about ${scope}. The AI isn't connected yet, so this is a placeholder answer.`,
  ukrainian: (scope) =>
    `Дякуємо за ваше запитання про ${scope}. ШІ ще не підключено, тому це тимчасова відповідь-заглушка.`,
  russian: (scope) =>
    `Спасибо за ваш вопрос о ${scope}. ИИ пока не подключён, поэтому это временный ответ-заглушка.`,
  chinese: (scope) =>
    `感谢你关于「${scope}」的提问。AI 尚未接入，所以这只是一条占位回复。`,
};

// What to call the scope when the context does not say.
const defaultScope = { field: "your farm", atlas: "the Atlas" };

// Works out which language a message is written in by looking at its letters.
function detectLanguage(message) {
  // Any Chinese character means Chinese.
  if (/[一-鿿]/.test(message)) return "chinese";

  // Cyrillic letters mean Ukrainian or Russian.
  if (/[Ѐ-ӿ]/.test(message)) {
    // Letters only Ukrainian uses.
    if (/[іїєґ]/i.test(message)) return "ukrainian";
    // Letters only Russian uses.
    if (/[ыэъё]/i.test(message)) return "russian";
    // No telltale letter, so it could be either. Assume Ukrainian, because
    // the app is for Ukrainian farmers.
    return "ukrainian";
  }

  // Everything else is treated as English.
  return "english";
}

// Pauses for the given number of milliseconds (1000 = 1 second).
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Sends a question and gives back the reply text.
//   message - what the person typed
//   context - { product: "field" | "atlas", scopeLabel: "Field 7" }
export async function sendChatMessage(message, context = {}) {
  // Pretend the AI is thinking.
  await wait(1000);

  const scope = context.scopeLabel || defaultScope[context.product] || "this";
  const language = detectLanguage(message);
  return fakeReplies[language](scope);
}
