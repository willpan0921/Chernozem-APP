// WHAT THIS FILE DOES
// The one place the app "talks to the AI". Right now there is no real AI: the
// function waits about a second and returns a fake reply, in the same language
// as the question (English, Ukrainian, Russian or Chinese).
//
// WHO EDITS IT
// Danny. To connect the real AI, replace the inside of sendChatMessage. As
// long as it still takes a message and a field name and gives back the reply
// text, the chat panel does not need to change.

// The fake reply in each language. "fieldName" is dropped into the sentence.
const fakeReplies = {
  english: (fieldName) =>
    `Thanks for your question about ${fieldName}. The AI isn't connected yet, so this is a placeholder answer.`,
  ukrainian: (fieldName) =>
    `Дякуємо за ваше запитання про ${fieldName}. ШІ ще не підключено, тому це тимчасова відповідь-заглушка.`,
  russian: (fieldName) =>
    `Спасибо за ваш вопрос о ${fieldName}. ИИ пока не подключён, поэтому это временный ответ-заглушка.`,
  chinese: (fieldName) =>
    `感谢你关于「${fieldName}」的提问。AI 尚未接入，所以这只是一条占位回复。`,
};

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
//   message   - what the person typed
//   fieldName - the field they are looking at
export async function sendChatMessage(message, fieldName) {
  // Pretend the AI is thinking.
  await wait(1000);

  const language = detectLanguage(message);
  return fakeReplies[language](fieldName);
}
