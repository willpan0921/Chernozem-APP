// WHAT THIS FILE DOES
// Ukrainian for the About page's Earth (components/EarthGlobe.jsx,
// globeMath.js and worldData.js, the "globe" namespace): what a screen
// reader calls the globe, the seventeen reviewed conflicts' names, the zoom
// buttons and their hints, the list of events with its counts, the words a
// status line is made of (the kinds of event, GDACS's alert colours, the
// months and the dates), the card and the small print under the globe.
// Keys are the English sentences exactly as the files write them. A few
// entries are functions: the two counts take the noun in the form the
// number asks for (1 збройний конфлікт, 2 збройні конфлікти, 5 збройних
// конфліктів); a war's "since" line adds "р." after a bare year (з 2015 р.)
// and says "із" before a month that starts with a sibilant (із січня); the
// hidden stand-in for the review date is the date alone, because the
// sentence it stands in for puts no word before the date. The months are in
// the genitive (жовтня), since they are used only after a day number or
// after "з" and "по"; a span of days carries its own "з … по …", so the
// sentence before it adds nothing. GDACS's alert levels are said as
// Ukrainian weather warnings are: червоний / помаранчевий / зелений рівень
// небезпеки. Names stay: Chernozem, GDACS, NASA, USDA, OpenLandMap, Natural
// Earth, WITS, Hengl and Nauman. "Закрити" and "вересень 2026" come from
// common.js.
//
// WHO EDITS IT
// Whoever changes the globe's words. Keep a key identical to the English
// in the page, or the page shows English.

// The noun after a count: 1 конфлікт, 2–4 конфлікти, 5+ конфліктів (11–19
// take the last form, as 21 takes the first).
const plural = (n, one, few, many) => {
  const abs = Math.abs(Number(n)) || 0;
  const tens = abs % 100;
  const ones = abs % 10;
  if (tens >= 11 && tens <= 19) return many;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
};

// "з" before a date; "із" before a month that starts with a sibilant, as the
// orthography asks (із січня, із серпня, із червня).
const since = (date) => (/^[сзцчшщСЗЦЧШЩ]/.test(String(date)) ? "із" : "з");

// A war the list knows only by its year arrives as the bare year ("2015");
// it takes "р." like every other date here (з 2015 р.).
const dated = (date) => (/^\d{4}$/.test(String(date ?? "")) ? `${date} р.` : String(date ?? ""));

// A war's line: "Війна з лютого 2022 р.", "Збройний конфлікт з 2015 р."
const warLine = ({ kind, date }) => `${kind} ${since(dated(date))} ${dated(date)}`;

export default {
  // What a screen reader calls the globe: the figure's hidden title, then
  // the canvas's three sentences
  "The Earth today: where the black soil lies, today's armed conflicts and disaster alerts, and whose food depends on their land":
    "Земля сьогодні: де лежать чорноземи, сьогоднішні збройні конфлікти й сповіщення про лиха, і чиє продовольство залежить від тих земель",
  "The real Earth seen from space, turning slowly.": "Справжня Земля, як її видно з космосу, повільно обертається.",
  "The world's black-soil belts are outlined in dark brown.": "Чорноземні пояси світу окреслено темно-коричневим.",
  "Today's armed conflicts are terracotta dots and disaster alerts amber ones; thin lines run from each one to the countries whose food depends on its land. The list under the globe names each one.":
    "Сьогоднішні збройні конфлікти — теракотові точки, сповіщення про лиха — бурштинові; від кожної точки тонкі лінії ведуть до країн, чиє продовольство залежить від цієї землі. Список під глобусом називає кожну подію.",

  // The seventeen reviewed conflicts (worldData.js WAR_NAMES): beside the
  // dot, in the list and as the card's title
  "War in Ukraine": "Війна в Україні",
  "War in Sudan": "Війна в Судані",
  "War in Gaza": "Війна в Газі",
  "Civil war in Myanmar": "Громадянська війна в Мʼянмі",
  "Fighting in eastern DR Congo": "Бойові дії на сході ДР Конго",
  "Insurgency in the central Sahel": "Повстання в центральному Сахелі",
  "Conflict in Somalia": "Конфлікт у Сомалі",
  "War in Yemen": "Війна в Ємені",
  "Conflict in Syria": "Конфлікт у Сирії",
  "Fighting in Amhara, Ethiopia": "Бойові дії в Амхарі, Ефіопія",
  "Fighting in South Sudan": "Бойові дії в Південному Судані",
  "Insurgency and banditry in northern Nigeria": "Повстання й бандитизм на півночі Нігерії",
  "Insurgency in Cabo Delgado, Mozambique": "Повстання в Кабу-Делгаду, Мозамбік",
  "Armed gang violence in Haiti": "Насильство збройних банд на Гаїті",
  "Insurgency in northwest Pakistan": "Повстання на північному заході Пакистану",
  "Strikes on southern Lebanon": "Удари по півдню Лівану",
  "Armed groups in Colombia": "Збройні угруповання в Колумбії",

  // The zoom bar: the button that shows the whole Earth again, + and -,
  // and the two quiet hints on the globe
  "Show the whole Earth": "Показати всю Землю",
  "Whole Earth": "Вся Земля",
  "Zoom in": "Збільшити",
  "Zoom out": "Зменшити",
  "Two fingers move the zoomed Earth.": "Збільшену Землю рухайте двома пальцями.",
  "Scroll to zoom. Esc to let the page scroll.": "Прокручуйте, щоб масштабувати. Esc — щоб прокручувати сторінку.",

  // The list of events: the dialog's name, its close button, the two
  // group counts
  "Today's armed conflicts and disaster alerts": "Сьогоднішні збройні конфлікти й сповіщення про лиха",
  "Close the list": "Закрити список",
  "1 armed conflict": "1 збройний конфлікт",
  "{n} armed conflicts": ({ n }) => `${n} ${plural(n, "збройний конфлікт", "збройні конфлікти", "збройних конфліктів")}`,
  "1 disaster alert": "1 сповіщення про лихо",
  "{n} disaster alerts": ({ n }) => `${n} ${plural(n, "сповіщення про лихо", "сповіщення про лиха", "сповіщень про лиха")}`,

  // The kinds of event (globeMath.js kindWord, KIND_WORD): the first word
  // of a status line
  "War": "Війна",
  "Armed conflict": "Збройний конфлікт",
  "Flood": "Повінь",
  "Drought": "Посуха",
  "Wildfires": "Природні пожежі",
  "Storm": "Шторм",
  "Earthquake": "Землетрус",
  "Volcano": "Вулкан",
  "Alert": "Стихійне лихо",

  // GDACS's alert colours (LEVEL_WORD), only before "рівень небезпеки"
  "red": "червоний",
  "orange": "помаранчевий",
  "green": "зелений",

  // The months (MONTHS), only inside the dates below: after a day number
  // or after "з" / "по", so in the genitive
  "January": "січня",
  "February": "лютого",
  "March": "березня",
  "April": "квітня",
  "May": "травня",
  "June": "червня",
  "July": "липня",
  "August": "серпня",
  "September": "вересня",
  "October": "жовтня",
  "November": "листопада",
  "December": "грудня",

  // The dates (sinceText, dayMonthYear, spanText): a month and year, a full
  // day, and three spans that carry their own "з … по …"
  "{month} {year}": "{month} {year} р.",
  "{day} {month} {year}": "{day} {month} {year} р.",
  "{day} to {day2} {month} {year}": "з {day} по {day2} {month} {year} р.",
  "{day} {month} to {day2} {month2} {year}": "з {day} {month} по {day2} {month2} {year} р.",
  "{from} to {to}": "з {from} по {to}",

  // The status line under an event's name in the list (statusWords): a war,
  // then an alert still going on, over after a span of days, over after one
  // day, over with no last day, over with no dates, and with no dates at all
  "{kind} since {date}": warLine,
  "{kind}, {level} alert since {date}": "{kind}, {level} рівень небезпеки з {date}",
  "{kind}, {level} alert from {span}": "{kind}, {level} рівень небезпеки {span}",
  "{kind}, {level} alert on {date}": "{kind}, {level} рівень небезпеки {date}",
  "{kind}, {level} alert from {date}, now over": "{kind}, {level} рівень небезпеки з {date}, уже знято",
  "{kind}, {level} alert, now over": "{kind}, {level} рівень небезпеки, уже знято",
  "{kind}, {level} alert": "{kind}, {level} рівень небезпеки",

  // The same line under the card's title (statusWords with card): a war's
  // ends with the date's own "р." (one the list has no date for is its kind
  // alone, with a full stop); an alert's names GDACS
  "{kind} since {date}.": (vars) => {
    const text = warLine(vars);
    return /\.$/.test(text) ? text : `${text}.`;
  },
  "{kind}.": "{kind}.",
  "{kind}, {level} alert since {date}, GDACS.": "{kind}, {level} рівень небезпеки з {date}, GDACS.",
  "{kind}, {level} alert from {span}, GDACS.": "{kind}, {level} рівень небезпеки {span}, GDACS.",
  "{kind}, {level} alert on {date}, GDACS.": "{kind}, {level} рівень небезпеки {date}, GDACS.",
  "{kind}, {level} alert from {date}, now over, GDACS.": "{kind}, {level} рівень небезпеки з {date}, уже знято, GDACS.",
  "{kind}, {level} alert, now over, GDACS.": "{kind}, {level} рівень небезпеки, уже знято, GDACS.",
  "{kind}, {level} alert, GDACS.": "{kind}, {level} рівень небезпеки, GDACS.",

  // Chernozem's own measurement in Ukraine's card (measuredSentence):
  // {ha} and {people} arrive as "1,78 мільйона" from the browser, {month}
  // as "вересень 2026" from common.js
  "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it ({month}).":
    "Chernozem виміряв {ha} га сильно пошкоджених чорноземів, на яких живе {people} людей ({month}).",
  "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it.":
    "Chernozem виміряв {ha} га сильно пошкоджених чорноземів, на яких живе {people} людей.",
  "Chernozem measured {ha} ha of black soil heavily damaged ({month}).": "Chernozem виміряв {ha} га сильно пошкоджених чорноземів ({month}).",
  "Chernozem measured {ha} ha of black soil heavily damaged.": "Chernozem виміряв {ha} га сильно пошкоджених чорноземів.",

  // The card: the two links, the heading over the countries, a country with
  // its own year, the line under the countries, and the {from} fallback
  "See it in the demo": "Переглянути в демо",
  "GDACS report": "Звіт GDACS",
  "Whose food depends on it": "Кого годує ця земля",
  "{name} ({year})": "{name} ({year} р.)",
  "The share of each country's farm and food imports that come from {from}, in {year} unless a year is given.":
    "Частка сільськогосподарського та продовольчого імпорту, яку {from} постачає кожній країні, за {year} рік, якщо не вказано інший.",
  "The share of each country's farm and food imports that come from {from}.": "Частка сільськогосподарського та продовольчого імпорту, яку {from} постачає кожній країні.",
  "this country": "ця країна",

  // The legend under the globe, the list's toggle and the line when the
  // feed fails
  "What the colours show": "Що означають кольори",
  "Armed conflicts": "Збройні конфлікти",
  "Disaster alerts": "Сповіщення про лиха",
  "Black soil": "Чорнозем",
  "See them all as a list": "Показати всі списком",
  "Hide the list": "Сховати список",
  "Today's conflicts and alerts could not be loaded.": "Не вдалося завантажити сьогоднішні конфлікти й сповіщення.",

  // The small print under the globe: the Earth's picture, the land and
  // borders, the black-soil map, the alerts, the reviewed list (with its
  // hidden stand-in for the date) and the trade table
  "Earth: {link}, public domain.": "Земля: {link}, суспільне надбання.",
  "NASA Blue Marble": "«Блакитна кулька» NASA",
  "Land and borders: {link}.": "Суходіл і кордони: {link}.",
  "Natural Earth": "дані Natural Earth",
  "Black soil: {link} (Hengl and Nauman, 2018), {licence}, modified.": "Чорнозем: {link} (Hengl і Nauman, 2018), {licence}, зі змінами.",
  "OpenLandMap USDA great groups": "великі групи ґрунтів USDA з OpenLandMap",
  "Disaster alerts: {link}, live.": "Сповіщення про лиха: {link}, у реальному часі.",
  // The date (dayMonthYear) already ends in «р.», which closes the sentence.
  "Armed conflicts: a list reviewed by hand on {date}.": "Збройні конфлікти: список, перевірений вручну {date}",
  "Armed conflicts: a list reviewed by hand.": "Збройні конфлікти: список, перевірений вручну.",
  // Invisible: it holds the width of the date before the feed brings it.
  // The sentence above puts the date right after "вручну", with no word
  // before it, so the stand-in is the date alone.
  "on {date}": ({ date }) => String(date ?? ""),
  "Who buys whose food: World Bank {link}, the latest year each country reported ({years}).":
    "Хто купує чиє продовольство: Світовий банк, {link}; останній рік, за який звітувала кожна країна ({years}).",
  "Who buys whose food: World Bank {link}, the latest year each country reported.":
    "Хто купує чиє продовольство: Світовий банк, {link}; останній рік, за який звітувала кожна країна.",
  // The screen-reader line of each event in the list (EarthGlobe.jsx lineOf): the name, then the status; no full stop after a date that ends in «р.».
  "{name}: {status}.": "{name}: {status}",
};
