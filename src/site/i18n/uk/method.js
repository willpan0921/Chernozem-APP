// WHAT THIS FILE DOES
// Ukrainian for the website's Methodology page (pages/MethodPage.jsx) and
// its two kinds of film (components/Walkthrough.jsx, components/Film.jsx):
// how Chernozem works; Field's steps, its four readings, the condition and
// its formulas, how fields, crops and damage are found, and what it cannot
// see; Atlas's three scores, the gate and its formulas, Ukraine ranked, the
// checks and what it cannot do; what is behind it; the films' chapters and
// the close. Keys are the English sentences as those files write them (a
// no-break space or a non-breaking hyphen inside a key is written as its
// \u escape so it can be seen); the chapter names are keyed by the English
// of public/site/film/walkthroughs.json and Film.jsx's FILM_CHAPTERS.
// Numbers that arrive through a hole come with the Ukrainian decimal comma
// (0,40: the page formats them by locale, MethodPage.jsx two and decimal);
// a percent sign is set off with a no-break space. Where a number changes
// the form of a word, the entry is a function of the vars. The four class
// names, the normal years, the red edge's lead and the month come from
// content/site.js and live in common.js, not here.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page, or the page shows English.

// The form of a counted noun after a number: 1 (21, 31 …) the first,
// 2–4 (22, 23 …) the second, the rest the third; 11–14 take the third. The
// number may arrive formatted («1\u00a0176»).
function forms(n, one, few, many) {
  const value = Number(String(n).replace(/\D/g, ""));
  if (!Number.isFinite(value)) return many;
  const last = value % 10;
  const tens = value % 100;
  if (last === 1 && tens !== 11) return one;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

// A small number in words in the locative («на шести знімках», «у двох
// сезонах»), as the English writes small numbers in words; larger ones stay
// digits.
const IN_WORDS = ["", "одному", "двох", "трьох", "чотирьох", "пʼяти", "шести", "семи", "восьми", "девʼяти", "десяти"];
const inWords = (n) => IN_WORDS[Number(n)] || String(n);

export default {
  // The opening (MethodPage.jsx): the headline, the lead and the Atlas picture with its caption
  "How Chernozem works": "Як працює Chernozem",
  "Free satellite data, read over farmland and turned into a plain answer: Field for one farm, Atlas for a whole region.":
    "Безкоштовні супутникові дані, прочитані над сільгоспугіддями й перетворені на просту відповідь: Field — для одного господарства, Atlas — для цілого регіону.",
  "The Atlas map of Ukraine by priority, square by square, with the weights on the left and the top ten areas on the right":
    "Карта України в Atlas за пріоритетом, квадрат за квадратом: ваги зліва, десять найперших територій справа",
  "Ukraine, {month}, square by square: the weights on the left, the top ten on the right.":
    "Україна, {month}, квадрат за квадратом: ваги зліва, десять найперших справа.",
  // Field: what it is, its walkthrough's title, how to use it (five steps), the phone picture and what it reads
  "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.":
    "Field — це Chernozem для одного господарства: ви позначаєте свої поля один раз, і після кожного безхмарного проходу супутника він каже, як справи на кожному полі і що треба зробити.",
  "The Field walkthrough": "Покроковий огляд Field",
  "How to use it.": "Як користуватися.",
  "Register and choose Field.": "Зареєструйтеся і виберіть Field.",
  "Find your farm: search a village, type coordinates, or draw.":
    "Знайдіть своє господарство: за назвою села, за координатами або накресливши його контур.",
  "Check the crops the app detected, and set your own.":
    "Перевірте культури, які розпізнав застосунок, і вкажіть свої.",
  "Read the first pass; a ten-field farm takes about {seconds} seconds.": ({ seconds }) => `Прочитайте перший прохід; для господарства з десяти полів це триває близько {seconds} ${forms(seconds, "секунди", "секунд", "секунд")}.`,
  "Come back after each pass, report what happened, or ask the assistant.":
    "Повертайтеся після кожного проходу, повідомляйте, що сталося, або запитуйте помічника.",
  "The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below":
    "Сторінка «Поля» на телефоні: супутникова карта з контурами полів, легенда стану і деталі вибраного поля внизу",
  "What it reads.": "Що він читає.",
  "Every clear Sentinel-2 pass at ten metres, radar from Sentinel-1 for lasting change in the ground, the local forecast, and the same weeks of 2019 to 2021 as the normal to compare with.":
    "Кожний безхмарний прохід Sentinel-2 з роздільністю 10 м, радар Sentinel-1 для стійких змін на місцевості, місцевий прогноз і ті самі тижні 2019–2021 років як норма для порівняння.",
  // Four readings: the clouds and the normal years, then plant health, water, stress and harvest timing (a <dt>, a formula, one sentence each)
  "Four readings.": "Чотири показники.",
  "Google’s Cloud Score+ removes clouds pixel by pixel (clear at {score} or more). Plant health, water and stress use the median of the last {days} days’ clear pixels, against the same weeks of {years}: per pixel, the middle of the {count} years (the app’s Below and Above normal use their range). Harvest timing follows the passes {share}\u00a0clear.": ({ days, count }) =>
    `Cloud Score+ від Google прибирає хмари піксель за пікселем (чистий — від {score} і вище). Здоровʼя рослин, вода і стрес беруть медіану чистих пікселів за останні {days} ${forms(days, "день", "дні", "днів")} проти тих самих тижнів {years} років: для кожного пікселя — медіана за ${["", "один", "два", "три", "чотири", "пʼять", "шість", "сім", "вісім", "девʼять", "десять"][Number(count)] || count} ${forms(count, "рік", "роки", "років")} («Нижче норми» і «Вище норми» в застосунку використовують їхній діапазон). Час збирання визначають проходи, чисті {share}.`,
  "at least half": "щонайменше наполовину",
  "at least {percent}%": "щонайменше на {percent}\u00a0%",
  "Plant health": "Здоровʼя рослин",
  "Near-infrared against red: how green the crop\u00a0is.":
    "Ближній інфрачервоний проти червоного: наскільки зелена культура.",
  "Water": "Вода",
  "Near-infrared against short-wave infrared: the water held in the\u00a0leaves.":
    "Ближній інфрачервоний проти короткохвильового інфрачервоного: вода в листі.",
  "Stress": "Стрес",
  "The share of the field weaker than the rest and than normal; the red edge reacts {lead} before\u00a0NDVI.":
    "Частка поля, слабша за решту і за норму; червоний край реагує на {lead} раніше за NDVI.",
  "Harvest timing": "Час збирання",
  "ready": "готове",
  "{bare} + share·(peak − {bare})": "{bare} + частка·(пік − {bare})",
  "Ready when NDVI falls back to this level (share {cereals} for cereals and rapeseed, {rowCrops} for row crops), checked by heat units and, for row crops, radar through\u00a0cloud.":
    "Готове, коли NDVI спадає до цього рівня (частка {cereals} для зернових і ріпаку, {rowCrops} для просапних), з перевіркою за сумою температур і, для просапних, радаром крізь хмари.",
  // The condition: the paragraph, the two shapes of a class in its list, and the formulas (the sum, the two scores, the stress rule)
  "The condition.": "Стан.",
  "One number from 0 to 1 for each field in crop, which colours it on the map: {classes}. High stress ({highStress}% of the field or more) holds it under {stressedUnder}, damage under {damagedUnder}, and a field with no crop has no\u00a0condition.":
    "Одне число від 0 до 1 для кожного поля з культурою, яке зафарбовує його на карті: {classes}. Високий стрес ({highStress}\u00a0% поля або більше) тримає його нижче за «{stressedUnder}», пошкодження — нижче за «{damagedUnder}», а поле без культури не має стану.",
  "{label} under {upTo}": "«{label}» нижче {upTo}",
  "{label} above": "«{label}» вище цього",
  "condition": "стан",
  "{w}·health score": "{w}·оцінка здоровʼя",
  "+ {w}·water score": "+ {w}·оцінка води",
  "+ {w}·(1 − stressed share)": "+ {w}·(1 − частка під стресом)",
  "health score": "оцінка здоровʼя",
  "1 + (NDVI − normal) / {span}": "1 + (NDVI − норма) / {span}",
  "water score": "оцінка води",
  "1 + (NDWI − normal) / {span}": "1 + (NDWI − норма) / {span}",
  "each held between 0 and 1": "кожна в межах від 0 до 1",
  "stressed": "під стресом",
  "NDVI < field median − {d}": "NDVI < медіана поля − {d}",
  "and < normal − {d},": "і < норма − {d},",
  "or NDRE < field median − {d}": "або NDRE < медіана поля − {d}",
  "and < normal − {d}": "і < норма − {d}",
  // Finding the fields, the crop, damage on a field (a <dt> and two sentences each), and what it cannot see
  "Finding the fields": "Пошук полів",
  "Canny edges in {pictures} Sentinel\u20112 pictures of the last two seasons split ESA WorldCover’s cropland into fields from {minHa} ha. On the demo farm they overlap hand\u2011drawn outlines by {iou} {note}.": ({ pictures }) =>
    `Контури Canny на ${inWords(pictures)} ${Number(pictures) === 1 ? "знімку" : "знімках"} Sentinel\u20112 за останні два сезони ділять орні землі ESA WorldCover на поля від {minHa} га. На демонстраційному господарстві вони збігаються з накресленими вручну контурами на {iou} {note}.`,
  "(shared area ÷ combined\u00a0area)": "(спільна площа ÷ обʼєднана площа)",
  "The crop": "Культура",
  "A phenology classifier, helped by radar and the red\u2011edge gap; your own choice wins. Against the USDA crop layer it named {heldOut}% of held\u2011out fields right, and {likely}% when it said\u00a0“likely”.":
    "Фенологічний класифікатор, якому допомагають радар і розрив червоного краю; ваш вибір має перевагу. Порівняно з картою культур USDA він правильно назвав {heldOut}\u00a0% полів з відкладеної вибірки і {likely}\u00a0%, коли казав «імовірно».",
  "Damage on a field": "Пошкодження поля",
  "Radar change of {db} dB or more in at least {seasons} growing seasons, and unusual fire (NASA FIRMS). In a war, radar change on {share}% of the field is enough; elsewhere, both are\u00a0needed.": ({ seasons }) =>
    `Радарна зміна на {db} дБ або більше щонайменше у ${inWords(seasons)} ${Number(seasons) === 1 ? "вегетаційному сезоні" : "вегетаційних сезонах"} і аномальна пожежа (NASA FIRMS). Під час війни досить радарної зміни на {share}\u00a0% поля; в інших місцях потрібні обидві.`,
  "What it cannot see.": "Чого він не бачить.",
  "Which pest or disease is at work; mines and unexploded ordnance (a field with no damage found is not a safe field); a line between look\u2011alike\u00a0fields.":
    "Який саме шкідник чи хвороба діє; міни й нерозірвані боєприпаси (поле без знайдених пошкоджень не є безпечним полем); межа між схожими полями.",
  // Atlas: what it is, its walkthrough's title, and the three scores (the bold opening, the sentence, three <dt>s with a sentence each)
  "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start. Ukraine is the demo because that is where Chernozem started.":
    "Atlas — це Chernozem для цілого регіону, для урядів, неурядових організацій і компаній: він оцінює кожний квадрат сільгоспугідь і ранжує, звідки починати відновлення. Демо — це Україна, бо саме там почався Chernozem.",
  "The Atlas walkthrough": "Покроковий огляд Atlas",
  "Three scores": "Три оцінки",
  "{scores}, each from 0 to 100. Value and damage make the priority; feasibility decides whether a square is ranked now or later.":
    "{scores}, кожна від 0 до 100. Цінність і пошкодження складають пріоритет; доступність вирішує, ранжувати квадрат зараз чи пізніше.",
  "Value": "Цінність",
  "How likely the soil is black soil, and how much of the square is cropland.":
    "Наскільки ймовірно, що ґрунт — чорнозем, і яка частка квадрата — орні землі.",
  "Damage": "Пошкодження",
  "Unusual fire and lasting radar change since the crisis began, against the same seasons in 2019 to 2021.":
    "Аномальні пожежі та стійкі радарні зміни від початку кризи проти тих самих сезонів 2019–2021 років.",
  "Feasibility": "Доступність",
  "Distance to recorded fighting; 100 km or more counts as fully feasible.":
    "Відстань до зафіксованих бойових дій; 100 км і більше — повна доступність.",
  // The gate: the two time frames in words, then their two formulas
  "The gate.": "Шлюз.",
  "Near term: the least feasible {percentile}% of squares are left out, with a soft edge of {ramp}, and the rest are ranked by value and damage.":
    "Найближчим часом: {percentile}\u00a0% найменш доступних квадратів виключено, з перехідною зоною шириною {ramp}, а решту ранжовано за цінністю і пошкодженням.",
  "Post-crisis: feasibility becomes a pace factor. The three scores are combined in a weighted power mean with weights {value} / {damage} / {feasibility} and exponent {exponent}. Move the sliders and watch what the two time frames do with one place.":
    "Після кризи: доступність стає чинником темпу. Три оцінки поєднано у зваженому степеневому середньому з вагами {value} / {damage} / {feasibility} і показником степеня {exponent}. Посувайте повзунки й дивіться, що обидва періоди роблять з одним місцем.",
  "Near term: priority = ({v}·value{half} + {d}·damage{half}){squared}, faded in over the {ramp} ramp above the cutoff; below it, left out":
    "Найближчим часом: пріоритет = ({v}·цінність{half} + {d}·пошкодження{half}){squared}, плавно наростає в перехідній зоні {ramp} над порогом; нижче порога — виключено",
  "Post-crisis: priority = ({v}·value{half} + {d}·damage{half} + {f}·feasibility{half}){squared}":
    "Після кризи: пріоритет = ({v}·цінність{half} + {d}·пошкодження{half} + {f}·доступність{half}){squared}",
  // Ukraine ranked (above the demo), the checks against independent records (above the table), and what it cannot do
  "Ukraine, ranked.": "Україна за пріоритетом.",
  "The real {month} reading of {n} squares, as the app shows it: the top of the list for each time frame, and the whole country on the map.": ({ n }) =>
    `Реальні дані за {month} для {n} ${forms(n, "квадрата", "квадратів", "квадратів")}, як їх показує застосунок: початок списку для кожного періоду і вся країна на карті.`,
  "Checked against independent records.": "Перевірено за незалежними даними.",
  "The app’s readings beside Copernicus’s maps of three disasters and the USDA crop layer, and the paper’s damage score beside ACLED’s record of fighting.":
    "Показники застосунку поруч із картами трьох лих від Copernicus і картою культур USDA, а оцінка пошкодження зі статті — поруч із даними ACLED про бойові дії.",
  "What it cannot do.": "Чого він не може.",
  "A screen, not a survey. Ten-metre pixels miss small fields; clouds delay optical readings; radar change is less reliable where 2019 to 2021 were not calm; and it never declares land safe.":
    "Скринінг, а не обстеження. Десятиметрові пікселі пропускають малі поля; хмари затримують оптичні показники; радарна зміна менш надійна там, де 2019–2021 роки не були спокійними; і він ніколи не оголошує землю безпечною.",
  // Behind it: the heading, the datasets, the stack, privacy, and the two linked clauses in one sentence
  "Behind it": "За лаштунками",
  "What it reads:": "Що він читає:",
  "{list}, {count} open datasets, each read against its own normal years.": ({ count }) => `{list} — {count} ${forms(count, "відкритий набір даних", "відкриті набори даних", "відкритих наборів даних")}, кожний читається проти своїх нормальних років.`,
  "Built with:": "Збудовано на:",
  "{list}. More than {tests} automated tests. Drawn as a mockup first, then built.":
    "{list}. Понад {tests} автоматичних тестів. Спочатку намальовано макет, потім збудовано.",
  "Accounts run on Firebase (Google, or e\u2011mail and password); your fields, readings and reports are kept on our own server and never sold, and messages from the contact page are kept on our server and e\u2011mailed to {email}. When you ask the assistant, your question and your fields’ readings go to Anthropic’s Claude to be answered; the satellite maths runs on Google Earth Engine.":
    "Облікові записи працюють на Firebase (Google або електронна пошта з паролем); ваші поля, показники і звіти зберігаються на нашому власному сервері й ніколи не продаються, а повідомлення зі сторінки «Контакти» зберігаються на нашому сервері й пересилаються на {email}. Коли ви запитуєте помічника, ваше запитання і показники ваших полів передаються Claude від Anthropic, який і відповідає; супутникові обчислення виконуються в Google Earth Engine.",
  "{code}, and {data}.": "{code}, а {data}.",
  "The code is public on GitHub": "Код відкритий на GitHub",
  "the research data and code are on Harvard Dataverse": "дані й код дослідження — на Harvard Dataverse",
  // The three-minute film's heading, and the close (its heading, its sentence, the link beside the Register button)
  "Chernozem in three minutes": "Chernozem за три хвилини",
  "Run it on your own land": "Запустіть на своїй землі",
  "Register for Chernozem and read the first pass yourself. The demo is open to everyone and read-only.":
    "Зареєструйтеся в Chernozem і прочитайте перший прохід самі. Демо відкрите для всіх і лише для перегляду.",
  "Try the demo": "Спробувати демо",
  // The players (Walkthrough.jsx, Film.jsx): the captions' language, the fallback links, the chapter list's name and the line about the voice
  "English": "Англійська",
  "Download the film (MP4)": "Завантажити фільм (MP4)",
  "Chapters of {title}": "Розділи фільму «{title}»",
  "The film is narrated in English.": "Фільм озвучено англійською.",
  "Download the film (MP4, 36 MB)": "Завантажити фільм (MP4, 36 МБ)",
  // Chapter buttons of the Field walkthrough (public/site/film/walkthroughs.json)
  "The farm": "Господарство",
  "Weather": "Погода",
  "Fields": "Поля",
  "Data": "Дані",
  "Tell us what happened": "Розкажіть, що сталося",
  "The assistant": "Помічник",
  "Settings": "Налаштування",
  "Change farm": "Змінити господарство",
  // Chapter buttons of the Atlas walkthrough (Data and The assistant are above)
  "The overview": "Огляд",
  "The map": "Карта",
  "Weights and the cutoff": "Ваги і поріг",
  "A place's details": "Деталі місця",
  "The report": "Звіт",
  "Choose an area": "Вибрати територію",
  "Team and crisis": "Команда і криза",
  // Chapter buttons of the three-minute film (Film.jsx FILM_CHAPTERS; Field and Atlas are names and stay)
  "Northeastern China": "Північно-східний Китай",
  "Ukraine": "Україна",
  "How it reads the land": "Як він читає землю",
};
