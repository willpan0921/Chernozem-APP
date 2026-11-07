// WHAT THIS FILE DOES
// Ukrainian for what the website's frame says (the menu, the footer, the
// language switch, the tab) and what more than one page says. Every other
// namespace falls back to this one. Keys are the English sentences.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page, or the page shows English.

export default {
  // The menu and the footer (content/site.js, components/Nav.jsx, Footer.jsx)
  "About": "Про нас",
  "Story": "Історія",
  "Methodology": "Методологія",
  "Contact": "Контакти",
  "Demo": "Демо",
  "Register": "Зареєструватися",
  "Sign in": "Увійти",
  "Menu": "Меню",
  "Close": "Закрити",
  "Open Field": "Відкрити Field",
  "Open Atlas": "Відкрити Atlas",
  "Open the demo": "Відкрити демо",
  "Chernozem home": "Chernozem, головна сторінка",
  "Website pages": "Сторінки сайту",
  "Footer": "Нижня частина сторінки",
  "Skip to content": "Перейти до вмісту",
  "Language": "Мова",
  "satellite farmland monitoring": "супутниковий моніторинг сільгоспугідь",
  "Pasadena, California": "Пасадена, Каліфорнія",
  // The tab and the sharing text (content/site.js SITE, hooks.js)
  "Chernozem, satellite farmland monitoring": "Chernozem, супутниковий моніторинг сільгоспугідь",
  "Chernozem reads free satellite data over farmland and says what changed: Field for a farmer's own fields, Atlas for governments, NGOs and corporations ranking whole regions.":
    "Chernozem читає безкоштовні супутникові дані над сільгоспугіддями й каже, що змінилося: Field — для власних полів фермера, Atlas — для урядів, неурядових організацій і компаній, які ранжують цілі регіони.",
  // DEMO_DOORS (content/site.js; pages/DemoPage.jsx, pages/OwnerPage.jsx): the
  // two doors' labels are above ("Open Field", "Open Atlas"); their captions
  "Field: the demo farm near Kupiansk": "Field: демонстраційне господарство біля Купʼянська",
  "Atlas: Ukraine, September 2026": "Atlas: Україна, вересень 2026",
  // FIELD_METHOD (content/site.js; pages/MethodPage.jsx, components/ConditionLab.jsx):
  // the normal years, the red edge's lead, and the four condition classes.
  "2019 to 2021": "2019–2021",
  "one to two weeks": "один-два тижні",
  "Poor": "Поганий",
  "Fair": "Задовільний",
  "Good": "Добрий",
  "Very good": "Дуже добрий",
  // DEMO (content/site.js; components/FieldRowStates.jsx): Field 11's latest
  // reading.
  "Field 11": "Поле 11",
  "Rapeseed": "Ріпак",
  "under 1%": "менше 1 %",
  "near normal": "близько до норми",
  "26 October 2026": "26 жовтня 2026 р.",
  "29 June": "29 червня",
  // NUMBERS (content/site.js): the string values among the figures that a
  // page shows (the month; components/ProofTable.jsx's official flood area).
  "September 2026": "вересень 2026",
  // The thousands are held together with no-break spaces, as formatInt
  // writes them, and the dash is followed by a word joiner (U+2060), so the
  // range never parts at a line's end (a phone's proof table is narrow).
  "12,600 to 15,000": "12 600–⁠15 000",
  // The films' caption track (components/Walkthrough.jsx): its language.
  "English": "Англійська",
};
