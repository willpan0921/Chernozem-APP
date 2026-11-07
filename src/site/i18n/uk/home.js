// WHAT THIS FILE DOES
// Ukrainian for the website's About page (chernozem.app/): the hero and
// its slogan, "What is Chernozem", the eight reasons and the photograph's
// caption, the two sideways stories (pages/HomePage.jsx and
// components/ScrollStory.jsx), the field row (components/FieldRowStates.jsx),
// the proof table (components/ProofTable.jsx), the demo's introduction and
// the close with the disclaimer. One namespace, "home". Keys are the English
// sentences exactly as those files write them. The demo farm's own words
// (Поле 11, Ріпак, the dates, «менше 1 %», «близько до норми», the month)
// and the shared strings of content/site.js are in common.js, not here.
// Where a number changes the form of a word (секунд, квадратів, подій),
// the entry is a function of the vars; the {holes} it keeps are filled
// afterwards.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page, or the page shows English.

// The form of a counted noun after a number that may arrive already written
// in Ukrainian ("1 176", "109 636"): 1 поле, 2–4 поля, 5+ полів.
function counted(n, one, few, many) {
  const count = Number(String(n).replace(/\D/g, ""));
  if (!Number.isFinite(count)) return many;
  const last = count % 10;
  const tens = count % 100;
  if (last === 1 && tens !== 11) return one;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

export default {
  // 1. The hero (pages/HomePage.jsx): the slogan as two lines, the problem, what Chernozem does about it, the two actions
  "Drop your pin,": "Поставте мітку —",
  "know your land.": "пізнайте свою землю.",
  "As geopolitical and environmental tensions rise, wars and climate disasters strike more often. They hit hardest the people noticed least: the farmers who depend on their land to survive.":
    "Зі зростанням геополітичної та екологічної напруги війни й кліматичні лиха дедалі частішають. Найбільше від них страждають ті, кого помічають найменше: фермери, чиє виживання залежить від власної землі.",
  "Chernozem solves the problem of that harm going unseen.": "Chernozem розвʼязує проблему: цієї шкоди ніхто не бачить.",
  "Register for Chernozem": "Зареєструватися в Chernozem",
  "Try the demo": "Спробувати демо",
  // 2. What is Chernozem: the heading, the definition and the two products, the link to the Story, the owner's picture and its caption
  "What is Chernozem": "Що таке Chernozem",
  "Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.":
    "Chernozem — це супутниковий моніторинг сільгоспугідь: безкоштовні супутникові дані над полями, прочитані й викладені простими словами для людей, які не є науковцями.",
  "Field watches a farmer’s own fields; Atlas scores a whole region for governments, NGOs and corporations. The name is the black soil of Ukraine and northeast China, where its story began.":
    "Field стежить за власними полями фермера; Atlas оцінює цілий регіон для урядів, неурядових організацій і компаній. Назва походить від чорнозему України та північно-східного Китаю, де й почалася його історія.",
  "How it started": "Як усе починалося",
  "Chernozem’s pin and name above two screens of the app: Field, with the demo farm’s fields outlined on satellite imagery and Field 12’s water, plant health, stress and harvest readings beside them; and Atlas, with Ukraine’s cropland in squares shaded by priority for September 2026, the weights on the left and the top areas on the right.":
    "Мітка й назва Chernozem над двома екранами застосунку: Field з контурами полів демонстраційного господарства на супутникових знімках і показниками Поля 12 (вода, здоровʼя рослин, стрес і час збирання) поруч із ними; та Atlas з орними землями України у квадратах, зафарбованих за пріоритетом на вересень 2026, з вагами ліворуч і найпершими територіями праворуч.",
  "Field, above, on the demo farm near Kupiansk; Atlas, below, across Ukraine.": "Угорі — Field на демонстраційному господарстві біля Купʼянська; унизу — Atlas по всій Україні.",
  // 3. Why Chernozem: the heading, then the eight reasons (a bold claim and one line each)
  "Why Chernozem": "Чому Chernozem",
  "No hardware, only software.": "Без обладнання, лише програма.",
  "Nothing to install on the land. In a disaster that matters most: equipment there is costly, and often impossible to bring in.":
    "На землі нічого не треба встановлювати. Під час лиха це найважливіше: обладнання там дороге, а завезти його часто неможливо.",
  "Free satellite data, read on {earthEngine}.": "Безкоштовні супутникові дані, прочитані в {earthEngine}.",
  "Open data anyone can use: the public Sentinel satellites, read for you on {earthEngine}.":
    "Відкриті дані, якими може користуватися кожен: загальнодоступні супутники Sentinel, прочитані для вас у {earthEngine}.",
  "Recovery, not only monitoring.": "Відновлення, а не лише моніторинг.",
  "Most tools only monitor healthy soil. Chernozem monitors it too, then ranks damaged land and shows where recovery should start.":
    "Більшість інструментів лише стежить за здоровим ґрунтом. Chernozem теж стежить за ним, а потім ранжує пошкоджені землі й показує, звідки починати відновлення.",
  "For every stakeholder.": "Для кожної зацікавленої сторони.",
  "Individuals and organizations alike: Field for a farmer’s own fields, Atlas for governments, NGOs and corporations.":
    "І для окремих людей, і для організацій: Field — для власних полів фермера, Atlas — для урядів, неурядових організацій і компаній.",
  "You choose what matters.": "Ви вирішуєте, що важливо.",
  "You set the weights for value, damage and feasibility, and the ranking follows your priorities.":
    "Ви задаєте ваги цінності, пошкодження й доступності — і ранжування йде за вашими пріоритетами.",
  "Drop the pin, see the field.": "Поставте мітку — побачте поле.",
  "Easy to use: point at a place, and the app finds the fields there and reads each one.":
    "Користуватися легко: вкажіть місце, і застосунок знайде там поля й прочитає кожне.",
  "A few clicks, start to finish.": "Кілька кліків від початку до кінця.",
  // {seconds} is already a written number; after «за» it takes 1 секунду, 2–4 секунди, 5+ секунд
  "Finding the right satellite images and analysing them happens for you: a ten-field farm is read in about {seconds} seconds.": ({ seconds }) =>
    `Потрібні супутникові знімки застосунок знаходить і аналізує сам: господарство з десяти полів він читає приблизно за {seconds} ${counted(seconds, "секунду", "секунди", "секунд")}.`,
  "All you need is a place.": "Потрібне лише місце.",
  "Select the coordinates, type an address or draw an outline. No files, no sensors, no survey.":
    "Вкажіть координати, введіть адресу або накресліть контур. Без файлів, без датчиків, без обстеження.",
  // 3. The photograph beside the reasons: its alt text and its caption with the credit
  "Spent artillery shell casings, some rusted, lie in the grass of a field, with dry weeds and trees behind.":
    "Стріляні артилерійські гільзи, деякі іржаві, лежать у траві на полі; позаду сухий бурʼян і дерева.",
  "Spent artillery shell casings left in a field. Photo: {credit}, as published in {article}.":
    "Стріляні артилерійські гільзи, залишені на полі. Фото: {credit}, опубліковано в {article}.",
  // 4. and 5. The two sideways stories: their headings and the links beside them (passed to components/ScrollStory.jsx)
  "Field, for one farm": "Field — для одного господарства",
  "Open Field in the demo": "Відкрити Field у демо",
  "Atlas, for a whole region": "Atlas — для цілого регіону",
  "Open Atlas in the demo": "Відкрити Atlas у демо",
  // The story's own words (components/ScrollStory.jsx): the progress row's name, the step counter, the hint
  "{title}, step by step": "{title}, крок за кроком",
  "{current} of {count}": "{current} з {count}",
  "Scroll to move along": "Прокручуйте, щоб рухатися далі",
  // 4. The Field story: five steps, each a short title, one or two sentences and the picture's alt text
  "Your farm, field by field": "Ваше господарство, поле за полем",
  "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.":
    "Field — це Chernozem для одного господарства: ви позначаєте свої поля один раз, і після кожного безхмарного проходу супутника він каже, як справи на кожному полі й що треба зробити.",
  "The demo farm near Kupiansk on satellite imagery in Field, each field outlined and patterned by its condition, Field 11 picked, after the Sentinel-2 pass of 26 October.":
    "Демонстраційне господарство біля Купʼянська на супутникових знімках у Field: кожне поле з контуром і штрихуванням за його станом, вибрано Поле 11, після проходу Sentinel-2 26 жовтня.",
  "Drop a pin on your land": "Поставте мітку на своїй землі",
  "Search for a place or paste coordinates. Field traces the edges between fields in Sentinel-2 images of the last two seasons and offers the fields it finds; you keep yours.":
    "Знайдіть місце або вставте координати. Field окреслює межі між полями на знімках Sentinel-2 за останні два сезони й пропонує знайдені поля; ви вибираєте свої.",
  "Field’s farm setup: coordinates typed in the search, the place found, “Find my fields”, and the pin on the satellite map inside the dashed circle it will search.":
    "Налаштування господарства у Field: координати, введені в пошук, знайдене місце, «Знайти мої поля» і мітка на супутниковій карті всередині пунктирного кола, в якому він шукатиме.",
  "Every clear pass, read": "Кожен безхмарний прохід прочитано",
  "Clouds are removed pixel by pixel. Each field gets plant health (NDVI), water (NDWI) and stress (two tests, one on the red edge) against the same weeks of 2019 to 2021, and its harvest timing.":
    "Хмари прибрано піксель за пікселем. Для кожного поля: здоровʼя рослин (вегетаційний індекс NDVI), вода (водний індекс NDWI) і стрес (два тести, один — на червоному краї) проти тих самих тижнів 2019–2021 років, а також час збирання.",
  "Field 11 in Field, growing well: its water near normal, its plant health above normal, stress under 1% and the harvest past its peak, beside the field on the map.":
    "Поле 11 у Field, росте добре: вода близько до норми, здоровʼя рослин вище норми, стрес менше 1 % і пік збирання позаду — поруч із полем на карті.",
  "This season against normal": "Цей сезон проти норми",
  "Every pass since 2019 on one chart: a field against the farm and against its normal years, with the day the full-scale invasion began marked.":
    "Кожен прохід з 2019 року на одному графіку: поле проти господарства й проти своїх нормальних років, з позначеним днем початку повномасштабного вторгнення.",
  "Field’s data page: one field’s plant health since 2019 against the farm average, the normal years 2019 to 2021 shaded, and the full-scale invasion of 24 February 2022 marked.":
    "Сторінка «Дані» у Field: здоровʼя рослин одного поля з 2019 року проти середнього по господарству, нормальні роки 2019–2021 затінено, повномасштабне вторгнення 24 лютого 2022 р. позначено.",
  "Tell us what happened": "Розкажіть, що сталося",
  "Report shelling, fire, flood, hail or pests with your photos, and ask the assistant what to do first. It answers only from your own fields’ data.":
    "Повідомте про обстріл, пожежу, повінь, град чи шкідників, додавши свої фото, і запитайте помічника, що робити насамперед. Він відповідає лише за даними ваших полів.",
  "Field’s overview: what needs doing, then “Tell us what happened” with Shelling, Fire, Flood, Hail, Pests and Other, a note, photos and Send.":
    "Огляд у Field: що треба зробити, далі «Розкажіть, що сталося» з кнопками «Обстріл», «Пожежа», «Повінь», «Град», «Шкідники» та «Інше», нотатка, фото й «Надіслати».",
  // 5. The Atlas story: five steps the same way
  "A whole region, square by square": "Цілий регіон, квадрат за квадратом",
  "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start.":
    "Atlas — це Chernozem для цілого регіону, для урядів, неурядових організацій і компаній: він оцінює кожен квадрат сільгоспугідь і ранжує, звідки починати відновлення.",
  "Atlas’s overview of Ukraine for September 2026: the cropland analysed, the black soil, the heavily damaged land and the people on it, above the map of where to start.":
    "Огляд України в Atlas за вересень 2026: проаналізовані орні землі, чорнозем, сильно пошкоджені землі й люди на них — над картою того, звідки починати.",
  "Pick a country, a region or a box": "Країна, регіон або прямокутник",
  "Search a country or a province, type the corners of a box, or draw it on the map. Atlas then reads the last twelve months there.":
    "Знайдіть країну чи провінцію, введіть кути прямокутника або накресліть його на карті. Далі Atlas читає там останні дванадцять місяців.",
  "Atlas’s “Choose an area”: a box around the Kharkiv region typed by its north, south, west and east edges, shown on a small map, ready to analyse.":
    "«Вибрати територію» в Atlas: прямокутник навколо Харківської області, заданий північним, південним, західним і східним краями, показаний на невеликій карті й готовий до аналізу.",
  "Three scores for every square": "Три оцінки для кожного квадрата",
  "Value: how good the soil is. Damage: what fire and radar have seen since the crisis began. Feasibility: whether anyone can safely reach it.":
    "Цінність: наскільки добрий ґрунт. Пошкодження: що показали пожежі й радар від початку кризи. Доступність: чи може хтось безпечно туди дістатися.",
  "One square in Mykolaiv picked in Atlas: highest priority, its value, damage and feasibility scores, and the soil types under its cropland.":
    "Один квадрат у Миколаївській області, вибраний в Atlas: найвищий пріоритет, його оцінки цінності, пошкодження й доступності та типи ґрунтів під його орними землями.",
  "Your weights, your ranking": "Ваші ваги — ваше ранжування",
  "Choose how much value and damage count, and how much of the least reachable land to leave out for now. The ranking follows your choice.":
    "Виберіть, скільки важать цінність і пошкодження та яку частку найменш доступних земель поки не враховувати. Ранжування йде за вашим вибором.",
  "Atlas’s weights for Ukraine in the near term, value, damage and the share of the least feasible land left out, beside the map of priorities square by square.":
    "Ваги Atlas для України на найближчий час — цінність, пошкодження й частка виключених найменш доступних земель — поруч із картою пріоритетів квадрат за квадратом.",
  "A report donors can read": "Звіт, який прочитають донори",
  "The top areas to start with, near term or after the crisis, in a report with the method and its limits, saved as a PDF or a table.":
    "Найперші території, з яких варто почати, на найближчий час або після кризи, у звіті з методом і його обмеженнями, збереженому як PDF або таблиця.",
  "Atlas’s donor report for Ukraine, September 2026, with Download CSV and Save as PDF: the headline figures, then the top ten areas for the near term.":
    "Звіт Atlas для донорів щодо України, вересень 2026, з кнопками «Завантажити CSV» і «Зберегти як PDF»: головні цифри, далі десять найперших територій на найближчий час.",
  // 6. One field, one pass, one answer (components/FieldRowStates.jsx): the heading, the three state buttons and the row's words
  "One field, one pass, one answer": "Одне поле, один прохід, одна відповідь",
  "The row's state": "Стан рядка",
  "Arrives": "Надходить",
  "Read": "Читання",
  "Answered": "Відповідь",
  "New pass · Sentinel-2 · {date} · clear sky": "Новий прохід · Sentinel-2 · {date} · безхмарно",
  "New pass": "Новий прохід",
  "Read this pass": "Прочитати цей прохід",
  "Reading": "Зчитування…",
  "Plant health {plantHealth} · Stress {stress} · Water {water}": "Здоровʼя рослин {plantHealth} · Стрес {stress} · Вода {water}",
  "Past peak; greenest on {date}": "Пік позаду; найзеленіше {date}",
  "Growing well": "Росте добре",
  "Read it again": "Прочитати ще раз",
  // 7. The proof (pages/HomePage.jsx, components/ProofTable.jsx): the two-line heading, the table's headers, its rows and the note under it
  "Checked against": "Перевірено",
  "the record": "за незалежними даними",
  "Year": "Рік",
  "What": "Що",
  "Compared with": "Порівняно з",
  "Result": "Результат",
  "Thessaly flood, Greece": "Повінь у Фессалії, Греція",
  "Yambol wildfire, Bulgaria": "Природна пожежа біля Ямбола, Болгарія",
  "Punjab flood, Pakistan": "Повінь у Пенджабі, Пакистан",
  "Crop detection, North Dakota": "Розпізнавання культур, Північна Дакота",
  "Damage against fighting, Ukraine": "Пошкодження проти бойових дій, Україна",
  "Paper": "Стаття",
  "USDA Cropland Data Layer": "USDA Cropland Data Layer (карта культур)",
  // {events} is already a written number: 1 подія, 2–4 події, 5+ подій
  "ACLED, {events} events": ({ events }) => `ACLED, {events} ${counted(events, "подія", "події", "подій")}`,
  // The page keeps a no-break space (U+00A0, a literal here as in story.js) before "ha"; so do the keys, and the values before га.
  "{measured} ha measured; {official} ha official": "Виміряно {measured} га; офіційно {official} га",
  "{measured} ha measured; {official} ha official (reads low)": "Виміряно {measured} га; офіційно {official} га (занижено)",
  "{likely}% right when it says “likely”; {all}% over all six crops": "{likely} % правильно, коли каже «ймовірно»; {all} % за всіма шістьма культурами",
  "rank correlation {rho}": "Рангова кореляція {rho}",
  "Mean error in area against the three Copernicus maps: {mape}%. Cropland wrongly flagged in a normal year: {worst}% at worst, {mean}% on average.":
    "Середня похибка площі порівняно з трьома картами Copernicus: {mape} %. Орні землі, помилково позначені в нормальний рік: {worst} % у найгіршому випадку, {mean} % у середньому.",
  // 8. The demo: the heading and the introduction above the live ranking
  "The demo is Ukraine": "Демо — це Україна",
  // {squares} is already a written number: 1 квадрат, 2–4 квадрати, 5+ квадратів
  "Chernozem started there. This is the real {month} reading of {squares} squares, rolled up to oblasts. The same app works anywhere.": ({ squares }) =>
    `Chernozem почався там. Це реальні дані за {month} для {squares} ${counted(squares, "квадрат", "квадрати", "квадратів")}, зведені по областях. Той самий застосунок працює будь-де.`,
  // 9. The close: the green tile, the satellite picture, the disclaimer and the small print
  "See your land from space": "Побачте свою землю з космосу",
  "Register, drop your pin or choose a region, and read what the satellites saw.": "Зареєструйтеся, поставте мітку або виберіть регіон — і прочитайте, що побачили супутники.",
  "Satellite view of southern Ukraine, Crimea and the Black Sea, as Atlas shows it.": "Супутниковий вид півдня України, Криму й Чорного моря, як його показує Atlas.",
  "A detection framework.": "Система виявлення.",
  "Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees. In our tests its readings were roughly {percent}% accurate: close, for a tool of its kind, but not 100%. Use them as a guide, check on the ground before acting, and know that Chernozem is not responsible for decisions made from them.":
    "Chernozem читає сільгоспугіддя з космосу. Він не може взяти проби ґрунту в зоні лиха і не має обладнання на землі, щоб підтвердити побачене. У наших тестах його показники були точними приблизно на {percent} %: близько до істини для інструмента такого типу, але не 100 %. Користуйтеся ними як орієнтиром, перевіряйте на місці, перш ніж діяти, і знайте, що Chernozem не відповідає за рішення, ухвалені на їхній основі.",
  "The maps in the pictures of the app: Esri World Imagery (Esri, Maxar, Earthstar Geographics) and Esri’s light grey canvas (Esri, HERE, Garmin, © OpenStreetMap contributors). The satellite view above: Esri World Imagery.":
    "Карти на знімках застосунку: Esri World Imagery (Esri, Maxar, Earthstar Geographics) і світло-сіра основа Esri (Esri, HERE, Garmin, © учасники OpenStreetMap). Супутниковий вид угорі: Esri World Imagery.",
};
