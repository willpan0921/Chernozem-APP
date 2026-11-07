// WHAT THIS FILE DOES
// Ukrainian for the Ukraine ranking demo (components/DemoRanking.jsx, on
// the About and Methodology pages): the two time-frame tabs, the note under
// them, the map's label, the tooltip of an oblast, the colour key, the Top
// 10 list and its footnote. Keys are the English sentences as the page
// writes them; the oblast names, the month and Crimea's note are keyed by
// the English of public/site/ukraine-demo.json. Oblasts are named by their
// adjective (Харківська), as a Ukrainian list of oblasts reads. Where a
// number changes the form of a word, the entry is a function of the vars.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page or the data, or the page shows English.

// 1 область, 2–4 області, 5+ областей (21 область, 22 області, 25 областей).
function oblasts(n) {
  const count = Number(n);
  if (!Number.isFinite(count)) return "областей";
  const last = count % 10;
  const tens = count % 100;
  if (last === 1 && tens !== 11) return "область";
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return "області";
  return "областей";
}

// The ending of an ordinal before «місце»: 1-ше, 2-ге, 3-тє, 4-те, 5-те,
// 7-ме, 8-ме, 11-те … 21-ше, 22-ге, 23-тє, 24-те.
function placeEnding(n) {
  const rank = Number(n);
  const last = rank % 10;
  const tens = rank % 100;
  if (tens >= 11 && tens <= 19) return "те";
  if (last === 1) return "ше";
  if (last === 2) return "ге";
  if (last === 3) return "тє";
  if (last === 7 || last === 8) return "ме";
  return "те";
}

// 1 особа живе, 2–4 особи живуть, 5+ осіб живуть (1 204 041 особа живе).
function peopleLive(n) {
  const count = Number(n);
  if (!Number.isFinite(count)) return "осіб живуть";
  const last = count % 10;
  const tens = count % 100;
  if (last === 1 && tens !== 11) return "особа живе";
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return "особи живуть";
  return "осіб живуть";
}

export default {
  // When the data file cannot be downloaded (in place of the whole demo)
  "The demo data is not available right now. Open the app to see the live ranking.": "Дані для демо зараз недоступні. Відкрийте застосунок, щоб побачити актуальне ранжування.",
  // The two tabs above the map (aria-label of the pair, then the tabs)
  "Time frame": "Період",
  "Near term": "Найближчим часом",
  "Post-crisis": "Після кризи",
  // The note under the tabs: the near-term gate, then the post-crisis blend
  "The gate: the least feasible {percent}% of black soil is left out for now ({count} oblasts, hatched), then value and damage set the order.": ({ count }) =>
    `Шлюз: {percent} % найменш доступних чорноземів поки не враховано ({count} ${oblasts(count)}, заштриховано), далі порядок визначають цінність і пошкодження.`,
  "The gate: the least feasible {percent}% of black soil is left out for now, then value and damage set the order.": "Шлюз: {percent} % найменш доступних чорноземів поки не враховано, далі порядок визначають цінність і пошкодження.",
  "No gate: all three scores are blended, so the land left out comes back: {list}.": "Без шлюзу: усі три оцінки поєднано, тож невраховані землі повертаються: {list}.",
  "{name} #{rank}": ({ rank }) => `{name} ({rank}-${placeEnding(rank)} місце)`,
  "No gate: value, damage and feasibility are blended.": "Без шлюзу: цінність, пошкодження й доступність поєднано.",
  // The 25 units of the demo (public/site/ukraine-demo.json units[].name):
  // the oblast adjective, Crimea by its name
  "Cherkasy": "Черкаська",
  "Chernihiv": "Чернігівська",
  "Chernivtsi": "Чернівецька",
  "Crimea": "Крим",
  "Dnipropetrovsk": "Дніпропетровська",
  "Donetsk": "Донецька",
  "Ivano-Frankivsk": "Івано-Франківська",
  "Kharkiv": "Харківська",
  "Kherson": "Херсонська",
  "Khmelnytskyi": "Хмельницька",
  "Kirovohrad": "Кіровоградська",
  "Kyiv": "Київська",
  "Luhansk": "Луганська",
  "Lviv": "Львівська",
  "Mykolaiv": "Миколаївська",
  "Odesa": "Одеська",
  "Poltava": "Полтавська",
  "Rivne": "Рівненська",
  "Sumy": "Сумська",
  "Ternopil": "Тернопільська",
  "Vinnytsia": "Вінницька",
  "Volyn": "Волинська",
  "Zakarpattia": "Закарпатська",
  "Zaporizhzhia": "Запорізька",
  "Zhytomyr": "Житомирська",
  // The map (aria-label of the <svg>, read aloud only)
  "Map of Ukraine's oblasts coloured by near-term priority": "Карта областей України, розфарбована за пріоритетом на найближчий час",
  "Map of Ukraine's oblasts coloured by post-crisis priority": "Карта областей України, розфарбована за пріоритетом після кризи",
  // The tooltip of a hovered or tapped oblast: its standing in this frame
  // (Crimea's note is units[].note in the data)
  "Not ranked, as in the research paper: occupied since 2014 and outside Ukrainian agricultural reporting.": "Не ранжовано, як у науковій статті: в окупації з 2014 року й поза українською сільськогосподарською статистикою.",
  "Left out for now: among the least feasible": "Поки не враховано: серед найменш доступних",
  "#{rank} near term": ({ rank }) => `{rank}-${placeEnding(rank)} місце найближчим часом`,
  "#{rank} post-crisis": ({ rank }) => `{rank}-${placeEnding(rank)} місце після кризи`,
  "Not ranked": "Не ранжовано",
  // The tooltip's three scores (<dt> labels) and its last line
  "Value": "Цінність",
  "Damage": "Пошкодження",
  "Feasibility": "Доступність",
  "{ha} ha heavily damaged · {people} people living on damaged black soil": ({ peopleCount }) =>
    `{ha} га сильно пошкоджено · {people} ${peopleLive(peopleCount)} на пошкоджених чорноземах`,
  // The colour key under the map
  "Lower priority": "Нижчий пріоритет",
  "Start here": "Починати тут",
  // The Top 10 list's header (the month is area.monthLabel in the data)
  "Top {top} of {total} oblasts": ({ total }) => `{top} найперших із {total} ${Number(total) % 10 === 1 && Number(total) % 100 !== 11 ? "області" : "областей"}`,
  "September 2026": "вересень 2026",
  // The markers at the right of a Top 10 row (title = hover text)
  "Change from the near-term rank": "Зміна проти місця найближчим часом",
  "Its post-crisis rank": "Місце після кризи",
  "→ #{rank}": ({ rank }) => `→ {rank}-${placeEnding(rank)}`,
  // The footnote under the list: three sentences joined with a space
  "{count} oblasts are left out of the near-term ranking for now.": ({ count }) => `{count} ${oblasts(count)} поки не враховано в ранжуванні на найближчий час.`,
  "{names} is not ranked, as in the research paper (occupied since 2014).": "{names} не ранжовано, як у науковій статті (в окупації з 2014 року).",
  "Default weights {soil}/{damage}/{access}; the app lets you change them.": "Ваги за замовчуванням — {soil}/{damage}/{access}; у застосунку їх можна змінити.",
};
