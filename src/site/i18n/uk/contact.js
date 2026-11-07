// WHAT THIS FILE DOES
// Ukrainian for the website's Contact page (pages/ContactPage.jsx, the
// "contact" namespace): the heading, the form's labels and choices, the
// message box's prompts, the thank-you, the error line's sentences and the
// pictures' descriptions. Keys are the English sentences exactly as the
// page writes them ("E‑mail" keeps its no-break hyphen, U+2011). The tab
// title "Contact" is in common.js with the menu (Контакти).
//
// WHO EDITS IT
// Whoever changes the Contact page's words. Keep a key identical to the
// English in the page, or the page shows English.

// A count in the error line, in the accusative after «зачекайте» and
// «містити»: 1 хвилину, 2–4 хвилини, 5+ хвилин (21 хвилину, 22 хвилини,
// 25 хвилин); 1 символ, 2–4 символи, 5+ символів. The minutes come from the
// server's sentence, the characters from the page's MIN.
const count = (n, one, few, many) => {
  const number = Number(n);
  const last = number % 10;
  const tens = number % 100;
  if (last === 1 && tens !== 11) return `${n} ${one}`;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
};

export default {
  // The heading, the lead and the address under it
  "Write to Chernozem": "Напишіть у Chernozem",
  "Ask a question, propose a pilot on your land, or tell us what is wrong.": "Поставте запитання, запропонуйте пілотний проєкт на своїй землі або розкажіть, що не так.",
  "Messages go to {email}. Feel free to email us directly as well.": "Повідомлення надходять на {email}. Можете також написати нам напряму.",
  // After the message is sent: the thank-you that replaces the form
  "Thank you.": "Дякуємо.",
  "Your message was received. Any reply will go to {sentTo}.": "Ваше повідомлення отримано. Якщо буде відповідь, вона надійде на {sentTo}.",
  "Send another": "Надіслати ще одне",
  // Who you are: the legend, its small mark and the five choices
  "Who you are {optional}": "Хто ви {optional}",
  "(optional)": "(необовʼязково)",
  "Farmer": "Фермер",
  "Government or NGO": "Уряд або НУО",
  "Corporation": "Компанія",
  "Researcher": "Дослідник",
  "Something else": "Інше",
  // The fields: name, e-mail, organisation, message and its length
  "Name": "Імʼя",
  "E‑mail": "Ел. пошта",
  "Organisation {optional}": "Організація {optional}",
  "Message {limit}": "Повідомлення {limit}",
  "({min} to {max} characters)": "(від {min} до {max} символів)",
  // The grey prompt inside the empty message box, one per choice, then the default
  "Where is your farm, and what do you grow?": "Де ваше господарство і що ви вирощуєте?",
  "Which country or region, and what do you need to decide?": "Яка країна чи який регіон і що вам потрібно вирішити?",
  "Which farmland or supply region, and what do you need to know about it?": "Які сільгоспугіддя чи який регіон постачання і що вам потрібно про них знати?",
  "What are you working on, and what would help?": "Над чим ви працюєте і що вам допомогло б?",
  "What would you like to say?": "Що ви хотіли б сказати?",
  "Where is your land, and what would you like to do with Chernozem?": "Де ваша земля і що ви хотіли б робити з Chernozem?",
  // The live counter, the robot trap and the Send button
  "{count} of {max} characters": "{count} з {max} символів",
  "Website": "Вебсайт",
  "Sending…": "Надсилання…",
  "Send the message": "Надіслати повідомлення",
  // The error line, by what the server answered (ContactPage.jsx sayRefusal):
  // the server out of reach, too many messages in a row (the wait in
  // minutes), the three 400s a form the browser accepted can still get, and
  // the one sentence for everything else (the form busy, a 500), the address
  // a link. The first and the two 400s read as in register.js.
  "Could not reach the server. Check your connection and try again.": "Не вдалося зʼєднатися з сервером. Перевірте зʼєднання і спробуйте ще раз.",
  "Too many messages in a row. Try again in {minutes} minutes.": ({ minutes }) => `Забагато повідомлень поспіль. Зачекайте ${count(minutes, "хвилину", "хвилини", "хвилин")} і спробуйте ще раз.`,
  "Enter your name.": "Введіть своє імʼя.",
  "That email address does not look right.": "Схоже, ця адреса електронної пошти неправильна.",
  "The message must be at least {min} characters.": ({ min }) => `Повідомлення має містити щонайменше ${count(min, "символ", "символи", "символів")}.`,
  "The message could not be sent. Try again in a moment, or write to {email}.": "Не вдалося надіслати повідомлення. Спробуйте ще раз за хвилину або напишіть на {email}.",
  // The four phone screens beside the form (wide screens only) and their caption
  "Field on a phone: the demo farm's overview, with the fields to watch and the weather": "Field на телефоні: огляд демонстраційного господарства з полями, що потребують уваги, та погодою",
  "Field on a phone: the farm's fields outlined on the satellite map": "Field на телефоні: контури полів господарства на супутниковій карті",
  "Atlas on a phone: Ukraine in September 2026, with the cropland analysed and the damage": "Atlas на телефоні: Україна у вересні 2026, проаналізовані орні землі й пошкодження",
  "Atlas on a phone: the map of Ukraine by priority, with the weights under it": "Atlas на телефоні: карта України за пріоритетом і ваги під нею",
  "Field and Atlas on a phone.": "Field і Atlas на телефоні.",
};
