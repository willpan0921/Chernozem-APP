// WHAT THIS FILE DOES
// Ukrainian for the website's Story page (pages/StoryPage.jsx, the "story"
// namespace): the title on the dark band, the five steps under it, the bar
// of the three editions, and the editions themselves with their pictures'
// descriptions and map credits. Keys are the English sentences exactly as
// the page writes them: "Dr. Bo" and "Field yet" keep their no-break
// spaces (U+00A0, written   here so no editor can turn them into
// plain spaces), "great‑grandparents" and "black‑soil" their non-breaking
// hyphens (U+2011, ‑). Two entries are functions: the count of ways
// compared is written as a word with the noun in the right form (десять
// способів), and the paper's correlations take the Ukrainian decimal comma
// with область in the form the count asks for. The tab title "Story" is in
// common.js with the menu (Історія). Names stay as they are: Chernozem,
// Field, Atlas, Google Earth Engine, Colab, ACLED, Harvard Dataverse, ZBDL,
// Penn, localhost, chernozem.app.
//
// WHO EDITS IT
// Whoever changes the Story's words. Keep a key identical to the English in
// the page, or the page shows English.

// The noun after a count: 1 область, 2–4 області, 5+ областей (11–19 take
// the last form, as 21 takes the first).
const plural = (n, one, few, many) => {
  const abs = Math.abs(Number(n)) || 0;
  const tens = abs % 100;
  const ones = abs % 10;
  if (tens >= 11 && tens <= 19) return many;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
};

// A small count as a word, the way the story is told (десять способів); a
// larger one stays the figure the page hands over.
const COUNT_WORDS = ["нуль", "один", "два", "три", "чотири", "пʼять", "шість", "сім", "вісім", "девʼять", "десять", "одинадцять", "дванадцять"];

// 0.8 → 0,8; −0.8 → −0,8 (the page hands the numbers over as the paper
// writes them, with a point).
const decimal = (x) => String(x).replace(".", ",");

export default {
  // The title on the dark band
  "Forged in Three Generations": "Викувано трьома поколіннями",

  // The five steps: each sentence set large, then its description
  "For three generations, one story was told at William’s family table.": "Упродовж трьох поколінь за родинним столом Вільяма розповідали одну історію.",
  "After the Sino-Japanese War, his great‑grandparents were starving: bombs, landmines and the remnants of war had torn apart the black soil they farmed in northeastern China. They survived, and in time that same soil fed them back to life.":
    "Після японсько-китайської війни його прадід і прабаба голодували: бомби, міни й залишки війни пошматували чорнозем, який вони обробляли в північно-східному Китаї. Вони вижили, і з часом той самий ґрунт нагодував їх і повернув до життя.",
  "The summer after his freshman year, William went to see that land.": "Влітку після першого курсу Вільям поїхав побачити ту землю.",
  "He visited his relatives in northeastern China and walked the black‑soil plains his family once farmed. He saw what floods and droughts had done to their harvests, and met kids his age already working those fields. He wanted to build a tool for them.":
    "Він відвідав родичів у північно-східному Китаї й пройшов чорноземними рівнинами, які колись обробляла його родина. Він побачив, що повені й посухи зробили з їхніми врожаями, і зустрів однолітків, які вже працювали на тих полях. Він захотів створити для них інструмент.",
  "Then he saw the same story on the same black soil, in Ukraine.": "Потім він побачив ту саму історію на тому самому чорноземі — в Україні.",
  "Drawn to international relations, geopolitics and peace, he watched the same kind of war tear up Ukraine’s farmland. He chose to build for its farmers first, so they would not go through what his great‑grandparents did.":
    "Його цікавили міжнародні відносини, геополітика й питання миру, і він бачив, як така сама війна шматує сільгоспугіддя України. Він вирішив спершу будувати для її фермерів, щоб їм не довелося пережити те, що пережили його прадід і прабаба.",
  "He built it for Ukraine, then for everyone.": "Він створив його для України, а потім для всіх.",
  // {ways}: the page hands over the figure (ways) and the number itself
  // (count); the story says the word, with спосіб in the form the count asks for.
  "He learned the basics of Google Earth Engine, its libraries and how to code. He spent a year researching chernozem rehabilitation with Dr. Bo Zhao of the University of Washington: he compared {ways} ways to rank damaged land, designed gated aggregation and built the first Chernozem Atlas, bringing experience from an internship at ZBDL Land and Resources in Beijing, where he worked on recovering land after disasters.":
    ({ ways, count }) => {
      const n = Number(count);
      const word = COUNT_WORDS[n] ?? ways;
      return `Він опанував основи Google Earth Engine, його бібліотеки й навчився писати код. Рік він досліджував відновлення чорноземів разом із д-ром Бо Чжао з Вашингтонського університету: порівняв ${word} ${plural(n, "спосіб", "способи", "способів")} ранжувати пошкоджені землі, розробив шлюзову агрегацію й створив перший Chernozem Atlas, спираючись на досвід стажування в ZBDL Land and Resources у Пекіні, де працював над відновленням земель після лих.`;
    },
  "Over three editions, the same method grew to work for any soil, anywhere on Earth, after any war or natural disaster, and for anyone, even as everyday monitoring. Now the farmers of Ukraine, his family in northeastern China and any farmer anywhere can use it.":
    "За три версії той самий метод розвинувся так, що працює з будь-яким ґрунтом, будь-де на Землі, після будь-якої війни чи стихійного лиха й для будь-кого — навіть як повсякденний моніторинг. Тепер ним можуть користуватися фермери України, його родина в північно-східному Китаї й будь-який фермер де завгодно.",
  "William took that story with him to a business program at the University of Pennsylvania.": "Вільям узяв цю історію із собою на бізнес-програму в Пенсильванському університеті.",
  "There he met some of his current partners. They have worked on Chernozem together ever since, with support from people at Penn and in the industry, and have gradually scaled it.":
    "Там він познайомився з кількома своїми нинішніми партнерами. Відтоді вони разом працюють над Chernozem за підтримки людей із Penn і з галузі та поступово його масштабують.",

  // The bar of the three editions: its name for screen readers, the ordinal
  // alone (before " edition"; feminine, agreeing with версія), the word
  // after it with its leading space, and the three headings the bar reads out
  "The three editions": "Три версії",
  "First": "Перша",
  "Second": "Друга",
  "Third": "Третя",
  " edition": " версія",
  "First edition": "Перша версія",
  "Second edition": "Друга версія",
  "Third edition": "Третя версія",

  // First edition: the two paragraphs
  "A Google Colab notebook on Google Earth Engine that mapped Ukraine’s black soil, oblast by oblast, and the disturbance on it.":
    "Блокнот Google Colab на Google Earth Engine, що картографував чорноземи України, область за областю, і порушення на них.",
  // events arrives formatted (109 636); rho and r with a point (0.8, −0.8),
  // written here with the comma; oblasts is the number 24.
  "Checked against {events} recorded explosion and remote-violence events from ACLED (rank correlation {rho}) and against the change in harvests (r = {r}), it became a research paper ranking {oblasts} oblasts.":
    ({ events, rho, r, oblasts }) =>
      `Перевірений за ${events} подіями категорії «вибухи й дистанційне насильство», зафіксованими ACLED (рангова кореляція ${decimal(rho)}), і за зміною врожаїв (r = ${decimal(r)}), він став науковою статтею, що ранжує ${oblasts} ${plural(oblasts, "область", "області", "областей")}.`,
  // First edition: the three maps (alt, then caption) and the credit under them
  "The first edition's map: Ukraine's black soil shaded green, oblast by oblast, on a plain base map": "Карта першої версії: чорноземи України, зафарбовані зеленим область за областю, на простій базовій карті",
  "Ukraine’s black soil in green, oblast by oblast.": "Чорноземи України зеленим, область за областю.",
  "The disturbance layer: unusual change on Ukraine's land in orange and red, heaviest in the east and the south": "Шар порушень: незвичні зміни на землях України помаранчевим і червоним, найсильніші на сході та півдні",
  "The disturbance layer: unusual change on the land in orange and red.": "Шар порушень: незвичні зміни на землі помаранчевим і червоним.",
  "ACLED's recorded attacks across Ukraine as orange and red dots, crowded along the front line in the east and the south": "Зафіксовані ACLED атаки по всій Україні — помаранчеві й червоні точки, скупчені вздовж лінії фронту на сході та півдні",
  "The check: ACLED’s recorded attacks, as orange and red dots.": "Перевірка: зафіксовані ACLED атаки — помаранчеві й червоні точки.",
  "Base maps © {osm} contributors. Attacks: {acled}.": "Базові карти © учасники {osm}. Атаки: {acled}.",

  // Second edition: the two paragraphs and the Dataverse link
  "The Chernozem Recovery Atlas, a web page run on a laptop. It was the first Chernozem Atlas, for Ukraine only. There was no Field yet.":
    "Chernozem Recovery Atlas (атлас відновлення чорноземів) — вебсторінка, що працювала на ноутбуці. Це був перший Chernozem Atlas, лише для України. Field ще не існував.",
  "Near-term and postwar readings, sliders for soil value, disturbance and recovery context, about a dozen map layers and a ranked list of oblasts, in English or Chinese.":
    "Показники на найближчий час і на повоєнний період, повзунки для цінності ґрунту, порушень і контексту відновлення, близько дванадцяти шарів карти й ранжований список областей — англійською або китайською.",
  "Its data and code are on Harvard Dataverse": "Його дані й код — на Harvard Dataverse",
  // Second edition: the screenshot (alt, caption) and the map credit after the caption
  "The second edition, the Chernozem Recovery Atlas in a browser on localhost: the weights and map layers on the left, Ukraine's oblasts coloured by priority, the top oblasts on the right":
    "Друга версія, Chernozem Recovery Atlas у браузері на localhost: ваги й шари карти зліва, області України, розфарбовані за пріоритетом, найперші області справа",
  "The Recovery Atlas on localhost: the weights and map layers on the left, the top oblasts on the right.": "Recovery Atlas на localhost: ваги й шари карти зліва, найперші області справа.",
  "Base map: {openFreeMap}, © {openMapTiles}, © {osm} contributors.": "Базова карта: {openFreeMap}, © {openMapTiles}, © учасники {osm}.",

  // Third edition: the three paragraphs
  "This app, at chernozem.app.": "Цей застосунок, за адресою chernozem.app.",
  "Field reads a farmer’s own fields on every clear Sentinel-2 pass: plant health, water and stress against 2019 to 2021, and harvest timing.":
    "Field читає власні поля фермера на кожному безхмарному проході Sentinel-2: здоровʼя рослин, воду й стрес проти 2019–2021 років, а також час збирання.",
  "Atlas scores any country or region square by square for governments, NGOs and corporations, after a war, flood, wildfire or drought.":
    "Atlas оцінює будь-яку країну чи регіон квадрат за квадратом для урядів, неурядових організацій та компаній — після війни, повені, природної пожежі чи посухи.",
  // Third edition: the two screenshots (alt, then caption)
  "Field: the demo farm near Kupiansk on satellite imagery, Field 11 selected with its water, plant health, stress and harvest readings":
    "Field: демонстраційне господарство біля Купʼянська на супутникових знімках, вибрано Поле 11 з показниками води, здоровʼя рослин, стресу й часу збирання",
  "Field: Field 11 on the demo farm near Kupiansk, with its four readings.": "Field: Поле 11 у демонстраційному господарстві біля Купʼянська, з чотирма показниками.",
  "Atlas: the overview of Ukraine for September 2026, with the cropland analysed, the damage, and the map of where to start":
    "Atlas: огляд України за вересень 2026 з проаналізованими орними землями, пошкодженнями й картою місць, звідки починати",
  "Atlas: Ukraine in September 2026, with the places to start.": "Atlas: Україна у вересні 2026, з місцями, звідки починати.",
};
