# Chernozem website glossary: 简体中文 and Українська

Built 6 November 2026 from src/site/content/site.js, the pages (HomePage, MethodPage, StoryPage, ContactPage, RegisterPage, SignInPage, DemoPage), the components (ScrollStory, FieldRowStates, DemoRanking, ConditionLab, GateLab, ProofTable, EarthGlobe, Walkthrough, Film), src/lib/registration.js, public/site/film/walkthroughs.json, public/site/ukraine-demo.json and docs/METHODS.md. Eleven translators work from it in parallel: use these words and no others. If a term is missing, choose one, use it consistently, and append it under `## Added by <namespace>` at the end (append-only; read the file right before appending).

How to read the table:

- **中文** gives the term as it should appear in running text; a shorter form for a button or a table header follows "短：".
- **Українська** gives a countable noun in its three forms as `1 · 2–4 · 5+` (поле · поля · полів: 1 поле, 3 поля, 5 полів, 21 поле, 22 поля, 25 полів). An adjective is given in the masculine singular unless the site uses it only in one form. A button or link is given in the imperative.
- A term in **both** language columns written in Latin letters stays English (the i18n test's ALLOWED_WORDS). In Chinese, one space separates it from a Chinese character (Chernozem 读取、10 米). In Ukrainian it is never declined (в Chernozem, від Field).
- "Seeded" means the entry already exists in src/site/i18n/zh/common.js and uk/common.js: use it exactly, do not re-translate.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| **Products and the parts of the app** | | | | |
| Chernozem (the product, the company) | everywhere | Chernozem | Chernozem | Latin, unquoted. 注册 Chernozem / Зареєструватися в Chernozem. Never 黑土 or чорнозем for the product. |
| chernozem, black soil (the soil) | Story ("the black soil of Ukraine and northeast China"), Atlas's value, the globe's legend | 黑土 | чорнозем · чорноземи · чорноземів | One word for both English words. The Story says where the name comes from: 名字取自黑土 / назва походить від чорнозему. |
| Field (the product) | everywhere | Field | Field | Latin. "Field, for one farm" → Field 面向一个农场 / Field — для одного господарства. Never 田地 or Поле for the product. |
| Atlas (the product) | everywhere | Atlas | Atlas | Latin. "Atlas, for a whole region" → Atlas 面向整个地区 / Atlas — для цілого регіону. |
| field (a farmer's field); Field 11 | Field's unit of work; the demo farm's names | 田块；11 号田 | поле · поля · полів; Поле 11 | 田块 is one parcel; 田地 or 农田 is land in general. Counts need a function entry in Ukrainian: 1 поле, 2 поля, 5 полів. |
| farm; the demo farm | "a farm near Kupiansk", "for one farm", "Change farm" | 农场；演示农场 | господарство · господарства · господарств; демонстраційне господарство | Not ферма (reads as a livestock farm). "Field, for my farm" → Field，面向我的农场 / Field, для мого господарства. "a ten-field farm" → 一个有十块田的农场 / господарство з десяти полів. |
| the Overview; the Fields page; the Data page; the Map page | Field's and Atlas's pages, in chapter labels and alt texts | 概览；田块页；数据页；地图页 | огляд (сторінка «Огляд»); сторінка «Поля»; сторінка «Дані»; сторінка «Карта» | A chapter label alone: 概览 / Огляд, 田块 / Поля, 数据 / Дані, 地图 / Карта. In Ukrainian prose the page's name takes « ». |
| the assistant (the AI) | Field's and Atlas's chat; "ask the assistant" | 助手 | помічник | "AI assistant" → AI 助手 / AI-помічник. "answers only from your own fields' data" → 只根据您自己田块的数据回答 / відповідає лише за даними ваших полів. |
| settings | chapter label; Atlas Settings | 设置 | налаштування | |
| report; the donor report | Atlas's report page | 报告；捐助方报告 | звіт · звіти · звітів; звіт для донорів | "A report donors can read" → 捐助方能读懂的报告 / Звіт, який прочитають донори. |
| Download CSV; Save as PDF | the report's buttons (alt texts) | 下载 CSV；保存为 PDF | Завантажити CSV; Зберегти як PDF | CSV and PDF stay. |
| the demo; read-only; open to everyone | the owner's Ukraine workspace | 演示；只读；对所有人开放 | демо (indeclinable); лише для перегляду; відкрите для всіх | "Try the demo" → 体验演示 / Спробувати демо. Seeded: "Open the demo" = 打开演示 / Відкрити демо. |
| workspace | Register, Nav: the account's own workspace | 工作区 | робочий простір | |
| account | Register, Sign in | 账户 | обліковий запис · облікові записи · облікових записів | Not 帐户 or 帐号 (older spellings). "Create account" → 创建账户 / Створити обліковий запис. "An account is free and takes one step." → 账户免费，一步即可。 / Обліковий запис безкоштовний, один крок. |
| register; registration | menu, Register page | 注册 | зареєструватися (button, seeded); реєстрація (noun) | "Registration is not open yet." → 注册尚未开放。 / Реєстрація ще не відкрита. "Finish registering" → 完成注册 / Завершити реєстрацію. |
| sign in; sign out; signed in as | menu, Sign in page | 登录；退出；已登录为 … | увійти (seeded); вийти; ви увійшли як … | "Signed in as {email}." → 已登录为 {email}。 / Ви увійшли як {email}. |
| the owner | the Chernozem Google account that edits the demo | 所有者 | власник | "Signed in as …, the owner." → 已登录为 …（所有者）。 / Ви увійшли як … — власник. |
| pilot (a pilot on your land) | Contact's lead | 试点 | пілотний проєкт | "propose a pilot on your land" → 在您的土地上开展试点 / запропонувати пілотний проєкт на вашій землі. |
| the field row; "One field, one pass, one answer" | FieldRowStates | 田块行；一块田，一次过境，一个答案 | рядок поля; Одне поле, один прохід, одна відповідь | |
| Set up your farm; Find my fields; Choose an area; Change farm; Team and crisis; Tell us what happened | the app's own buttons and chapters, quoted in alts and chapter labels | 设置您的农场；查找我的田块；选择区域；更换农场；团队与危机；告诉我们发生了什么 | Налаштувати господарство; Знайти мої поля; Вибрати територію; Змінити господарство; Команда і криза; Розкажіть, що сталося | In prose a quoted app label keeps its quotes: “查找我的田块” / «Знайти мої поля». |
| **The method** | | | | |
| satellite; satellite imagery | everywhere | 卫星；卫星影像 | супутник · супутники · супутників; супутникові знімки (знімок · знімки · знімків) | "on satellite imagery" → 在卫星影像上 / на супутникових знімках. |
| satellite pass; a clear pass; New pass | "after every clear satellite pass" | 过境；无云过境；新过境 | прохід · проходи · проходів; безхмарний прохід; Новий прохід | 卫星过境 is the Chinese word for an overpass. Function entry for counts: 1 прохід, 2 проходи, 5 проходів. |
| to read (the land, a pass, data) | "Chernozem reads free satellite data", "Read this pass", "the first pass" | 读取（数据）；判读（一次过境、一幅影像） | читати / прочитати | Chinese: 读取 for data (seeded: Chernozem 读取), 判读 for interpreting a pass. Ukrainian keeps one verb. |
| a reading (what the app gives) | "four readings", "its readings", "the real September 2026 reading" | 读数 | показник · показники · показників | "Field 11 with its four readings" → 11 号田及其四项读数 / Поле 11 з чотирма показниками. "The real September 2026 reading of 1,176 squares" → 2026 年 9 月对 1,176 个方格的真实读数 / реальні дані за вересень 2026 для 1 176 квадратів. |
| clear pixel; clouds removed pixel by pixel | Four readings | 无云像素；逐像素去云 | чистий піксель · чисті пікселі · чистих пікселів; хмари прибрано піксель за пікселем | 像素 rather than 像元 (the reader is not a scientist). |
| cloud; through clouds | | 云 | хмара · хмари · хмар; крізь хмари | "clouds delay optical readings" → 云会延迟光学读数 / хмари затримують оптичні показники. |
| plant health (NDVI) | the first reading | 作物长势（短：长势） | здоровʼя рослин | Not the literal 植物健康 (too clinical). Not стан рослин (стан is the condition, below). "Health score" → 长势得分 / оцінка здоровʼя. "Plant health 0.79" → 长势 0.79 / Здоровʼя рослин 0,79. |
| NDVI; NDWI; NDRE | the formulas | 归一化植被指数（NDVI）；归一化水体指数（NDWI）；归一化红边指数（NDRE） | вегетаційний індекс NDVI; водний індекс NDWI; індекс червоного краю NDRE | Spell out once per page, then the acronym alone. |
| water (NDWI) | the second reading: the water held in the leaves | 水分 | вода | "Water 0.24 · near normal" → 水分 0.24 · 接近正常 / Вода 0,24 · близько до норми. "Water score" → 水分得分 / оцінка води. |
| stress; stressed share; high stress | the third reading | 胁迫；受胁迫比例；高胁迫 | стрес; частка під стресом; високий стрес | "stress under 1%" → 胁迫低于 1% / стрес менше 1 %. "Not stressed" (the lab's third part) → 未受胁迫 / без стресу. |
| red edge | NDRE | 红边 | червоний край | "the red edge reacts one to two weeks before NDVI" → 红边比 NDVI 早一到两周反应 / червоний край реагує на один-два тижні раніше за NDVI. |
| harvest timing; ready; past peak; greenest on …; heat units | the fourth reading | 收获时机；可收获；已过峰值；… 最绿；积温 | час збирання; готове; пік позаду; найзеленіше …; сума температур | "Past peak; greenest on 29 June" → 已过峰值；6 月 29 日最绿 / Пік позаду; найзеленіше 29 червня. |
| normal; the normal years 2019 to 2021 (the baseline); near / above / below normal; this season against normal | every reading is against them | 正常值；正常年份（2019 到 2021 年）；接近 / 高于 / 低于正常；本季对比正常 | норма; нормальні роки (2019–2021); близько до норми / вище норми / нижче норми; цей сезон проти норми | "against the same weeks of 2019 to 2021" → 与 2019 到 2021 年同期相比 / проти тих самих тижнів 2019–2021 років. |
| growing season | | 生长季 | вегетаційний сезон · сезони · сезонів | "the last two seasons" → 最近两个生长季 / останні два сезони. |
| condition (of a field, 0 to 1) | Field's map colour; ConditionLab | 状况 | стан (поля) | "The condition." → 状况。 / Стан. "has no condition" → 没有状况评分 / не має стану. |
| class; Poor / Fair / Good / Very good | the condition's four classes | 等级；差 / 一般 / 良好 / 很好 | клас; Поганий / Задовільний / Добрий / Дуже добрий | Masculine, agreeing with стан. «Дуже добрий» with a no-break space (U+00A0) so it never splits. |
| held under (a class) | ConditionLab, Methodology: high stress holds a field under Very good, damage under Good | 等级不会达到 … | клас не вище за … | Translate the meaning: "High stress: held under Very good." → 高胁迫：等级不会达到“很好”。 / Високий стрес: клас не вище за «Добрий». |
| damage; damaged | the second Atlas score; a damaged field | 损毁；受损的 | пошкодження; пошкоджений | Not 破坏 or 损害 (both too broad). "Damage on a field" → 田块损毁 / Пошкодження поля. "damaged land" → 受损土地 / пошкоджені землі. |
| heavy damage; heavily damaged (land, hectares) | Atlas totals | 严重损毁；严重损毁的 | сильне пошкодження; сильно пошкоджений | "1.78M ha heavily damaged" → 178 万公顷严重损毁 / 1,78 млн га сильно пошкоджено. |
| value (soil value) | the first Atlas score | 价值 | цінність (ґрунту) | "Value weight" → 价值权重 / вага цінності. "how good the soil is" → 土壤有多好 / наскільки добрий ґрунт. |
| feasibility | the third Atlas score: whether anyone can safely reach the land (distance to fighting) | 可行性 | доступність | Called "Safe access" before 2026-10-25. "Feasibility cutoff" → 可行性阈值 / поріг доступності. "fully feasible" → 完全可行 / повністю доступний. |
| score; the three scores | each from 0 to 100 | 得分；三项得分 | оцінка · оцінки · оцінок; три оцінки | "Three scores for every square" → 每个方格三项得分 / Три оцінки для кожного квадрата. |
| weights; weight; weighted power mean; exponent | the sliders | 权重；加权幂平均；指数 | ваги (вага · ваги · ваг); зважене степеневе середнє; показник степеня | "Your weights, your ranking" → 您的权重，您的排序 / Ваші ваги — ваше ранжування. "Default weights" → 默认权重 / ваги за замовчуванням. |
| the gate; No gate; Open / Left out / 40% open | Near term's mechanism and its readout | 门控；无门控；开 / 排除 / 开 40% | шлюз; без шлюзу; відкритий / закритий / відкритий на 40 % | 开 and відкритий here are states, not the button 打开 / Відкрити. |
| gated aggregation | the paper's method (Story) | 门控聚合 | шлюзова агрегація | "designed gated aggregation" → 设计了门控聚合 / розробив шлюзову агрегацію. |
| cutoff (the feasibility cutoff, 30%) | | 阈值 | поріг | "the least feasible 30% of squares are left out" → 可行性最低的 30% 方格被排除 / 30 % найменш доступних квадратів виключено. |
| ramp; soft edge (width 0.2) | | 渐变区 | перехідна зона | "the ramp, width 0.2" → 渐变区，宽度 0.2 / перехідна зона шириною 0,2. |
| left out; left out for now | squares below the cutoff | 排除；暂不纳入 | виключено; поки не враховано | "Left out for now: among the least feasible" → 暂不纳入：可行性最低之列 / Поки не враховано: серед найменш доступних. |
| ranking; to rank; rank (#3) | | 排序；排名（第 3） | ранжування; ранжувати; місце · місця · місць | Not рейтинг. "#3 near term" → 近期第 3 / 3-є місце найближчим часом. "ranks where recovery should start" → 排出恢复应从何处开始 / ранжує, звідки починати відновлення. |
| priority; highest priority; Lower priority / Start here | | 优先级；最高优先级；优先级较低 / 从这里开始 | пріоритет; найвищий пріоритет; Нижчий пріоритет / Починати тут | |
| near term | the first time frame | 近期 | найближчим часом | Tab label 近期 / Найближчим часом. "near-term ranking" → 近期排序 / ранжування на найближчий час. |
| post-crisis | the second time frame | 危机后 | після кризи | Tab label 危机后 / Після кризи. "post-crisis rank" → 危机后排名 / місце після кризи. |
| time frame | "the two time frames" | 时段 | період · періоди · періодів | aria-label "Time frame" → 时段 / Період. |
| square (Atlas's grid cell) | "1,176 squares", "square by square" | 方格 | квадрат · квадрати · квадратів | For Ukraine about 18 × 28 km. "square by square" → 逐格 / квадрат за квадратом. |
| oblast | Ukraine's first-level unit | 州 | область · області · областей | "24 oblasts" → 24 个州 / 24 області; "rolled up to oblasts" → 汇总到各州 / зведено по областях. The 25 names: appendix below. |
| region; province; district; state; country | GAUL "States, provinces, oblasts and districts" | 地区；省；区；州；国家 | регіон; провінція; район; штат; країна · країни · країн | 州 is both a US state and an oblast in Chinese: write 乌克兰的州 when both meet. "a whole region" → 整个地区 / цілий регіон. "Kharkiv region" → 哈尔科夫州 / Харківська область. |
| box (typed by its corners or drawn); coordinates; address | Atlas's "Choose an area"; the search | 方框；坐标；地址 | прямокутник; координати; адреса | "type the corners of a box" → 输入方框的角点坐标 / ввести кути прямокутника. |
| outline; draw an outline; outlined; hand-drawn | fields' edges | 边界；画出边界；勾出边界的；手绘的 | контур; накреслити контур; з контурами; накреслений вручну | "each field outlined" → 每块田都勾出边界 / кожне поле з контуром. |
| pin; drop a pin | the logo and the gesture | 图钉；放下图钉 | мітка; поставити мітку | Slogan: 放下图钉，读懂您的土地。 / Поставте мітку — пізнайте свою землю. "Drop the pin, see the field." → 放下图钉，看见田块。 / Поставте мітку — побачте поле. |
| farmland | general | 农田 | сільгоспугіддя | Seeded: "satellite farmland monitoring" = 卫星农田监测 / супутниковий моніторинг сільгоспугідь. |
| cropland; black-soil cropland | WorldCover class 40 | 耕地；黑土耕地 | орні землі; орні землі на чорноземах | |
| bare soil; soil type; soil carbon; organic carbon | DATASETS, formulas | 裸土；土壤类型；土壤碳；有机碳 | голий ґрунт; тип ґрунту; вуглець ґрунту; органічний вуглець | ґ in ґрунт. |
| radar; radar change (lasting) | Sentinel-1 | 雷达；雷达变化（持续的） | радар; радарна зміна · радарні зміни · радарних змін (стійка) | "Radar change of 3 dB or more" → 3 分贝或以上的雷达变化 / радарна зміна на 3 дБ або більше. |
| optical | Sentinel-2 | 光学 | оптичний | "optical readings" → 光学读数 / оптичні показники. |
| burn scar; active fire; fire detections | DATASETS | 火烧迹地；活跃火点；火点 | згарище · згарища · згарищ; активні пожежі; виявлені пожежі | |
| unusual fire | fire above the normal years | 异常火情 | аномальна пожежа · аномальні пожежі · аномальних пожеж | "unusual fire (NASA FIRMS)" → 异常火情（NASA FIRMS） / аномальна пожежа (NASA FIRMS). |
| flood; flooded | | 洪水；被淹的 | повінь · повені · повеней; затоплений | "a frozen field is not read as flooded" → 冻结的田块不会被判为被淹 / замерзле поле не читається як затоплене. |
| drought | | 干旱 | посуха · посухи · посух | |
| wildfire | | 野火 | природна пожежа · природні пожежі · природних пожеж | Not лісова пожежа (not only forests). |
| storm; earthquake; volcano; landslide | GDACS | 风暴；地震；火山；滑坡 | шторм · шторми · штормів; землетрус · землетруси · землетрусів; вулкан; зсув · зсуви · зсувів | |
| fire; hail; pests; disease; pest and disease risk | Field's report ("Report shelling, fire, flood, hail or pests"); the forecast | 火灾；冰雹；虫害；病害；病虫害风险 | пожежа · пожежі · пожеж; град; шкідники; хвороби; ризик шкідників і хвороб | |
| shelling | | 炮击 | обстріл · обстріли · обстрілів | |
| crater (shell crater) | FAO: over a million | 弹坑 | вирва · вирви · вирв | |
| mine; landmine; unexploded ordnance; demining | | 地雷；未爆弹药；排雷 | міна · міни · мін; нерозірвані боєприпаси; розмінування | "a field with no damage found is not a safe field" → 没发现损毁的田块不等于安全的田块 / поле без знайдених пошкоджень не є безпечним полем. |
| fighting (recorded); battles | ACLED | 战斗 | бойові дії; бої (бій · бої · боїв) | "distance to recorded fighting" → 与有记录战斗的距离 / відстань до зафіксованих бойових дій. |
| armed conflict | the globe's legend | 武装冲突 | збройний конфлікт · конфлікти · конфліктів | |
| war; the full-scale invasion (24 February 2022) | | 战争；全面入侵 | війна · війни · воєн; повномасштабне вторгнення | "the day the full-scale invasion began" → 全面入侵开始的那一天 / день початку повномасштабного вторгнення. |
| crisis; since the crisis began | | 危机；危机开始以来 | криза; від початку кризи | |
| disaster; natural disaster; disaster alerts; climate disasters; disaster zone | | 灾害；自然灾害；灾害预警；气候灾害；灾区 | лихо · лиха · лих; стихійне лихо; сповіщення про лиха; кліматичні лиха; зона лиха | "wars and climate disasters" → 战争和气候灾害 / війни та кліматичні лиха. |
| land cover | WorldCover | 地表覆盖 | земний покрив | |
| night lights; gone dark | VIIRS | 夜间灯光；变暗 | нічні вогні; згасла | "Whether an area has gone dark." → 一个地区是否已变暗。 / Чи згасла територія. |
| people (living) on damaged (black) soil | Atlas total | 受损黑土上的居民 | люди на пошкоджених чорноземах; counting: особа · особи · осіб | "1,204,041 people living on damaged black soil" → 1,204,041 人居住在受损黑土上 / 1 204 041 особа живе на пошкоджених чорноземах. |
| permanent water; lake; terrain; snow and frost; borders | DATASETS roles and sentences | 常年水体；湖泊；地形；雪和霜；行政边界 | постійна вода; озеро; рельєф; сніг і мороз; адміністративні межі | GAUL role "Borders" alone → 边界 / Межі. |
| false alarm; wrongly flagged | ProofTable's note | 误报；被误标 | хибна тривога · хибні тривоги · хибних тривог; помилково позначено | |
| held-out (test, fields); calibration (set) | the crop checks | 留出测试；留出的田块；校准（集） | відкладена вибірка; поля з відкладеної вибірки; калібрування (калібрувальна вибірка) | |
| accuracy; accurate; right | | 准确率；准确；正确 | точність; точний; правильно | "roughly 90% accurate" → 准确率约 90% / точність приблизно 90 %. "named 71.8% of held-out fields right" → 正确识别了 71.8% 的留出田块 / правильно назвав 71,8 % полів з відкладеної вибірки. |
| independent records; the record; official (figure); measured | ProofTable | 独立记录；官方；测得 | незалежні дані; офіційно; виміряно | "Checked against the record" → 对照记录核验 / Перевірено за незалежними даними. "12,151 ha measured; 12,600 ha official" → 测得 12,151 公顷；官方 12,600 公顷 / виміряно 12 151 га; офіційно 12 600 га. |
| mean error; rank correlation; median; threshold | | 平均误差；等级相关；中位数；阈值 | середня похибка; рангова кореляція; медіана; поріг | |
| crop; crop detection; phenology classifier | | 作物；作物识别；物候分类器 | культура · культури · культур; розпізнавання культур; фенологічний класифікатор | "your own choice wins" → 以您的选择为准 / ваш вибір має перевагу. |
| cereals; rapeseed; row crops; corn; soybean; sunflower; wheat | | 谷物；油菜；行播作物；玉米；大豆；向日葵；小麦 | зернові; ріпак; просапні культури; кукурудза; соя; соняшник; пшениця | "Field 11 · Rapeseed" → 11 号田 · 油菜 / Поле 11 · Ріпак. |
| recovery; rehabilitation; where recovery should start | | 恢复；修复；恢复应从何处开始 | відновлення; звідки починати відновлення | Ukrainian uses відновлення for both. "chernozem rehabilitation" → 黑土修复 / відновлення чорноземів. |
| free satellite data; open data; plain words; people who are not scientists | About | 免费卫星数据；开放数据；通俗的话；不是科学家的人 | безкоштовні супутникові дані; відкриті дані; прості слова (простими словами); люди, які не є науковцями | |
| no hardware on the ground; soil samples; a detection framework; a screen, not a survey | the caveats | 地面上没有设备；土壤样本；一个检测框架；是筛查，不是实地调查 | без обладнання на землі; проби ґрунту; система виявлення; скринінг, а не обстеження | |
| dataset; open datasets; layer; base map; table; chart | Behind it, captions | 数据集；开放数据集；图层；底图；表格；图表 | набір даних · набори · наборів; відкриті набори даних; шар · шари · шарів; базова карта; таблиця; графік | |
| automated tests; mockup; server; the data store; the monthly schedule; the last twelve months; monthly | STACK, Behind it | 自动化测试；原型图；服务器；数据存储；每月计划；过去十二个月；每月 | автоматичні тести; макет; сервер; сховище даних; щомісячний розклад; останні дванадцять місяців; щомісяця | "Drawn as a mockup first, then built." → 先画原型图，再构建。 / Спочатку намальовано макет, потім збудовано. |
| **Units, numbers and dates** | | | | |
| hectare, ha | everywhere | 公顷（从不写 ha） | га (гектар · гектари · гектарів) | 12,151 ha → 12,151 公顷 / 12 151 га; 1.5 ha → 1.5 公顷 / 1,5 га; 1.78M ha → 178 万公顷 / 1,78 млн га (compactHa writes these). |
| metre, m; kilometre, km; "at 10 m" | | 米；千米；10 米分辨率 | м; км; з роздільністю 10 м | "100 km or more" → 100 千米或以上 / 100 км або більше. |
| dB | radar | 分贝 | дБ | 3 dB → 3 分贝 / 3 дБ. |
| percentages | | 94%（无空格） | 94 % (a space, best U+00A0) | |
| numbers written by hand in a sentence | thousands and decimals | 1,176；0.79 | 1 176 (U+00A0 between groups); 0,79 | Numbers that arrive through {holes} come already formatted by formatInt/compactHa; only hand-written ones follow this. |
| a month: "September 2026" | | 2026 年 9 月 | вересень 2026 | Month lowercase, no "р." for a month alone. |
| a day: "26 October 2026"; "24 February 2022"; "29 June" | | 2026 年 10 月 26 日；2022 年 2 月 24 日；6 月 29 日 | 26 жовтня 2026 р.; 24 лютого 2022 р.; 29 червня | |
| a span: "2019 to 2021"; "since 2019"; "the last two years" | | 2019 到 2021 年；2019 年以来；最近两年 | 2019–2021 (en dash, no spaces; in prose з 2019 по 2021 рік); з 2019 року; останні два роки | |
| time: "about 20 seconds"; "3 to 4 minutes"; "one to two weeks"; small counts in words ("ten ways", "six pictures", "three generations") | | 约 20 秒；3 到 4 分钟；一到两周；十种方法；六张图片；三代 | близько 20 секунд; 3–4 хвилини; один-два тижні; десять способів; шість знімків; три покоління | секунда · секунди · секунд; хвилина · хвилини · хвилин; тиждень · тижні · тижнів; місяць · місяці · місяців; рік · роки · років. Chinese counts take a measure word. |
| **The kinds of visitor** | | | | |
| farmer; a farmer's own fields; landowner | | 农户；农户自己的田地；土地所有者 | фермер · фермери · фермерів; власні поля фермера; землевласник | Seeded (the description in common.js uses 农户 / фермера). |
| government | | 政府 | уряд · уряди · урядів | |
| NGO | | 非政府组织 | неурядова організація (short label: НУО) | Seeded phrase: "governments, NGOs and corporations" = 政府、非政府组织和企业 / уряди, неурядові організації та компанії. |
| corporation | | 企业 | компанія · компанії · компаній | Seeded. Not корпорація. |
| researcher; research (kind of organisation) | Contact, Register | 研究人员；研究 | дослідник · дослідники · дослідників; дослідження | |
| donor | | 捐助方 | донор · донори · донорів | |
| official; offices and funders; stakeholder; individuals and organizations | | 官员；机构和资助方；利益相关方；个人和组织 | посадовець · посадовці · посадовців; установи та донори; зацікавлена сторона; окремі люди й організації | "For every stakeholder." → 面向每一方。 / Для кожної зацікавленої сторони. |
| team; partners; the reader (you) | | 团队；合作伙伴；您 | команда; партнери; ви (lowercase) | |
| **The website's parts** | | | | |
| About / Story / Methodology / Contact | the menu's four tabs | 关于 / 故事 / 方法 / 联系 | Про нас / Історія / Методологія / Контакти | Seeded in common.js; use as is. |
| Demo / Register / Sign in / Menu / Close / Footer / Language | the menu's actions and frame | 演示 / 注册 / 登录 / 菜单 / 关闭 / 页脚 / 语言 | Демо / Зареєструватися / Увійти / Меню / Закрити / Нижня частина сторінки / Мова | Seeded. The language names in the switch are each in their own language: English / 中文 / Українська (the switch is done). |
| the slogan "Drop your pin, know your land." | the About page's title, two lines | 放下图钉，读懂您的土地。 | Поставте мітку — пізнайте свою землю. | Break after the comma / the dash. |
| "Register for Chernozem"; "Try the demo"; "Open Field in the demo"; "Open Atlas in the demo" | the actions | 注册 Chernozem；体验演示；在演示中打开 Field；在演示中打开 Atlas | Зареєструватися в Chernozem; Спробувати демо; Відкрити Field у демо; Відкрити Atlas у демо | |
| What is Chernozem / Why Chernozem / How it started / The demo is Ukraine / See your land from space | About's headings | 什么是 Chernozem / 为什么选择 Chernozem / 它是怎么开始的 / 演示就是乌克兰 / 从太空看您的土地 | Що таке Chernozem / Чому Chernozem / Як усе починалося / Демо — це Україна / Побачте свою землю з космосу | |
| "Checked against the record"; "Checked against independent records" | About's proof heading; Methodology | 对照记录核验 | Перевірено за незалежними даними | |
| "How Chernozem works"; "Behind it"; "Run it on your own land" | Methodology's headings | Chernozem 如何工作；幕后；在您自己的土地上运行 | Як працює Chernozem; За лаштунками; Запустіть на своїй землі | |
| "Forged in Three Generations" | the Story's title | 三代铸就 | Викувано трьома поколіннями | |
| the first / second / third edition | the Story | 第一版 / 第二版 / 第三版 | перша / друга / третя версія (версія · версії · версій) | The bar: "First edition" → 第一版 / Перша версія. |
| the Colab map; a Google Colab notebook; the Chernozem Recovery Atlas; the Recovery Atlas | the first and second editions | Colab 地图；Google Colab 笔记本；Chernozem Recovery Atlas（黑土恢复地图集）；Recovery Atlas | карта в Colab; блокнот Google Colab; Chernozem Recovery Atlas (атлас відновлення чорноземів); Recovery Atlas | The second edition's name stays Latin, glossed once in brackets, then "Recovery Atlas". |
| the research paper; the paper | | 研究论文；论文 | наукова стаття; стаття | Its title stays English. "it became a research paper" → 成为一篇研究论文 / стала науковою статтею. |
| walkthrough (film); "The Field walkthrough" | Methodology | 功能导览；Field 功能导览 | покроковий огляд; Покроковий огляд Field | |
| film; "Chernozem in three minutes"; chapters; "The film is narrated in English." | Methodology | 影片；三分钟了解 Chernozem；章节；影片为英文解说。 | фільм; Chernozem за три хвилини; розділи (розділ · розділи · розділів); Фільм озвучено англійською. | "Download the film (MP4)" → 下载影片（MP4） / Завантажити фільм (MP4). |
| the Earth; Show the whole Earth / Zoom in / Zoom out; "Scroll to zoom." | EarthGlobe | 地球；显示整个地球 / 放大 / 缩小；滚动以缩放。 | Земля; Показати всю Землю / Збільшити / Зменшити; Прокручуйте, щоб масштабувати. | |
| legend: Armed conflicts / Disaster alerts / Black soil / Whose food depends on it; "See them all as a list" / "Hide the list"; "GDACS report"; "See it in the demo" | EarthGlobe | 武装冲突 / 灾害预警 / 黑土 / 谁的粮食依赖这片土地；以列表查看全部 / 隐藏列表；GDACS 报告；在演示中查看 | Збройні конфлікти / Сповіщення про лиха / Чорнозем / Чиє продовольство залежить від цієї землі; Показати всі списком / Сховати список; Звіт GDACS; Переглянути в демо | |
| "Scroll to move along"; "2 of 5" | ScrollStory | 滚动以继续；第 2 步，共 5 步 | Прокручуйте, щоб рухатися далі; 2 з 5 | |
| Arrives / Read / Answered; Reading; Read this pass; Read it again; Growing well | FieldRowStates | 新到 / 判读 / 答复；判读中；判读本次过境；再判读一次；长势良好 | Надходить / Читання / Відповідь; Зчитування…; Прочитати цей прохід; Прочитати ще раз; Росте добре | |
| "Top 10 of 24 oblasts"; "Change from the near-term rank"; "Its post-crisis rank" | DemoRanking | 24 个州中的前 10；相对近期排名的变化；它的危机后排名 | 10 найперших із 24 областей; Зміна проти місця найближчим часом; Його місце після кризи | |
| slider; Move the sliders; One imagined field / place | the two labs | 滑块；移动滑块；一块假想的田 / 一个假想的地点 | повзунок · повзунки · повзунків; Посувайте повзунки; Одне уявне поле / Одне уявне місце | |
| **Places, people and institutions** | | | | |
| Ukraine | | 乌克兰 | Україна | |
| Kupiansk; Kharkiv; Kharkiv region | | 库皮扬斯克；哈尔科夫；哈尔科夫州 | Купʼянськ; Харків; Харківська область | ʼ is U+02BC. "near Kupiansk" → 库皮扬斯克附近 / біля Купʼянська. |
| Kyiv; Mykolaiv; Kirovohrad; Poltava; Crimea; the Black Sea | | 基辅；尼古拉耶夫；基洛沃格勒；波尔塔瓦；克里米亚；黑海 | Київ; Миколаїв; Кіровоград; Полтава; Крим; Чорне море | All 25 oblasts: appendix. |
| northeastern China; Beijing | the Story | 中国东北；北京 | північно-східний Китай; Пекін | "the black soil of Ukraine and northeast China" → 乌克兰和中国东北的黑土 / чорнозем України та північно-східного Китаю. |
| Pasadena, California | the footer | 美国加利福尼亚州帕萨迪纳 | Пасадена, Каліфорнія | Seeded. |
| Iowa; North Dakota; Thessaly, Greece; Yambol, Bulgaria; Punjab, Pakistan | the checks | 艾奥瓦州；北达科他州；希腊色萨利；保加利亚扬博尔；巴基斯坦旁遮普 | Айова; Північна Дакота; Фессалія, Греція; Ямбол, Болгарія; Пенджаб, Пакистан | |
| Dr. Bo Zhao | the Story | 赵波博士 | д-р Бо Чжао | Keep a no-break space (U+00A0) after д-р, as the English keeps one after Dr. |
| William (the founder) | the Story | 威廉 | Вільям | His Chinese given name is not known: 威廉 until the owner says otherwise. "William's family table" → 威廉家的餐桌 / родинний стіл Вільяма. |
| University of Pennsylvania; Penn; University of Washington | the Story | 宾夕法尼亚大学；华盛顿大学 | Пенсильванський університет; Вашингтонський університет | Penn stays Penn in both ("people at Penn" → Penn 的人 / люди з Penn). |
| ZBDL Land and Resources (Beijing) | the Story | ZBDL Land and Resources（北京） | ZBDL Land and Resources (Пекін) | ZBDL stays; the firm's Chinese name is not known. |
| the Sino-Japanese War | the Story | 抗日战争 | японсько-китайська війна | |
| Responsible Statecraft; Jose Hernandez, Camera 51 / Shutterstock.com; Esri World Imagery; Esri, Maxar, Earthstar Geographics, HERE, Garmin; OpenStreetMap contributors; OpenFreeMap; OpenMapTiles | photo and map credits | stay; "© OpenStreetMap contributors" → © OpenStreetMap 贡献者 | stay; "© OpenStreetMap contributors" → © учасники OpenStreetMap | "as published in" → 发表于 / опубліковано в. "Base maps" → 底图 / базові карти. |
| datasets and tools that stay English | everywhere | Sentinel-1, Sentinel-2, Cloud Score+, WorldCover, SoilGrids, OpenLandMap, WorldPop, GAUL, MERIT Hydro, ERA5-Land, Open-Meteo, FIRMS, VIIRS, MODIS, GDACS, ACLED, WITS, FAO, ESA, NASA, USDA, ISRIC, JRC, ECMWF, Copernicus, EMSR692, Google Earth Engine, Harvard Dataverse, GitHub, Firebase, Google, React, Node.js, Vite, Leaflet, Claude, Anthropic, Colab, USDA Cropland Data Layer | the same | ALLOWED_WORDS in i18n.test.js. "the USDA crop layer" → USDA 作物图层 / карта культур USDA. "ESA Copernicus" stays. |
| **UI words** | | | | |
| Open / Close | | 打开 / 关闭 | Відкрити / Закрити | Seeded. |
| Send; Send the message; Sending…; Send another | Contact | 发送；发送消息；正在发送…；再发一条 | Надіслати; Надіслати повідомлення; Надсилання…; Надіслати ще | |
| Back / Next / Loading… | | 返回 / 下一步 / 加载中… | Назад / Далі / Завантаження… | |
| Search; Choose | | 搜索；选择 | Шукати (noun: Пошук); Вибрати (to the reader: Виберіть) | "Choose Field or Atlas." → 请选择 Field 或 Atlas。 / Виберіть Field або Atlas. |
| (optional); required | form labels | （可选）；必填 | (необовʼязково); обовʼязково | |
| e-mail; E-mail (label); e-mail address | | 电子邮件；电子邮件地址 | електронна пошта; label «Ел. пошта»; адреса електронної пошти | "Enter your e-mail address." → 请输入电子邮件地址。 / Введіть адресу електронної пошти. |
| password; Show / Hide; Show password / Hide password; "8 characters or more" | | 密码；显示 / 隐藏；显示密码 / 隐藏密码；8 个字符或更多 | пароль; Показати / Сховати; Показати пароль / Сховати пароль; 8 символів або більше | |
| name; Name (label) | | 姓名 | імʼя (label «Імʼя») | |
| organisation; Kind of organisation; Government / NGO / Corporation / Research / Other | Register | 机构；机构类型；政府 / 非政府组织 / 企业 / 研究 / 其他 | організація; Тип організації; Уряд / НУО / Компанія / Дослідження / Інше | "Name your organisation." → 请填写您的机构名称。 / Назвіть вашу організацію. |
| message; characters; "{n} of {max} characters" | Contact | 留言；字符；已输入 {n}/{max} 字符 | повідомлення; символ · символи · символів; {n} з {max} символів | |
| Who you are; Farmer / Government or NGO / Corporation / Researcher / Something else | Contact | 您是谁；农户 / 政府或非政府组织 / 企业 / 研究人员 / 其他 | Хто ви; Фермер / Уряд або НУО / Компанія / Дослідник / Інше | |
| Something went wrong; Try again; Try again in a moment; Could not … (reach the server, save) | errors | 出错了；请重试；请稍后重试；无法…（连接服务器、保存） | Щось пішло не так; Спробуйте ще раз; Спробуйте ще раз за хвилину; Не вдалося … (зʼєднатися з сервером, зберегти) | |
| Thank you.; Your message was received. | Contact | 谢谢。；您的留言已收到。 | Дякуємо.; Ваше повідомлення отримано. | |
| Continue with Google; Continue as {email}; Create account; Sign out; Not you?; Opening…; Signing in…; Making your account… | Register, Sign in | 使用 Google 继续；以 {email} 继续；创建账户；退出；不是您？；正在打开…；正在登录…；正在创建账户… | Продовжити через Google; Продовжити як {email}; Створити обліковий запис; Вийти; Це не ви?; Відкриваємо…; Вхід…; Створюємо обліковий запис… | |
| Forgot it?; Already have an account?; New here?; Sign in instead; or | Register, Sign in | 忘记了？；已有账户？；新用户？；改为登录；或 | Забули?; Уже маєте обліковий запис?; Уперше тут?; Натомість увійдіть; або | |
| Write to us; Write to Chernozem | Contact | 给我们写信；写信给 Chernozem | Напишіть нам; Напишіть Chernozem | |
| Not ranked; Not measured; Not used; not available; Page not found | DemoRanking, GateLab, NotFound | 未排序；未测量；未使用；暂不可用；页面未找到 | Не ранжовано; Не виміряно; Не використовується; недоступно; Сторінку не знайдено | |

## Appendix: the 25 units of the Ukraine demo (DemoRanking, public/site/ukraine-demo.json)

The data gives the bare English name ("Kharkiv"). Chinese adds 州 so the list is not a list of cities; Ukrainian uses the adjective, as Ukrainians do in a list of oblasts («Харківська»), with «область» added only where a sentence needs the noun. Crimea is a republic, not an oblast: 克里米亚 / Крим.

| English | 中文 | Українська |
| --- | --- | --- |
| Cherkasy | 切尔卡瑟州 | Черкаська |
| Chernihiv | 切尔尼戈夫州 | Чернігівська |
| Chernivtsi | 切尔诺夫策州 | Чернівецька |
| Crimea | 克里米亚 | Крим |
| Dnipropetrovsk | 第聂伯罗彼得罗夫斯克州 | Дніпропетровська |
| Donetsk | 顿涅茨克州 | Донецька |
| Ivano-Frankivsk | 伊万诺-弗兰科夫斯克州 | Івано-Франківська |
| Kharkiv | 哈尔科夫州 | Харківська |
| Kherson | 赫尔松州 | Херсонська |
| Khmelnytskyi | 赫梅利尼茨基州 | Хмельницька |
| Kirovohrad | 基洛沃格勒州 | Кіровоградська |
| Kyiv | 基辅州 | Київська |
| Luhansk | 卢甘斯克州 | Луганська |
| Lviv | 利沃夫州 | Львівська |
| Mykolaiv | 尼古拉耶夫州 | Миколаївська |
| Odesa | 敖德萨州 | Одеська |
| Poltava | 波尔塔瓦州 | Полтавська |
| Rivne | 罗夫诺州 | Рівненська |
| Sumy | 苏梅州 | Сумська |
| Ternopil | 捷尔诺波尔州 | Тернопільська |
| Vinnytsia | 文尼察州 | Вінницька |
| Volyn | 沃伦州 | Волинська |
| Zakarpattia | 外喀尔巴阡州 | Закарпатська |
| Zaporizhzhia | 扎波罗热州 | Запорізька |
| Zhytomyr | 日托米尔州 | Житомирська |

Crimea's note in the data ("Not ranked, as in the research paper: occupied since 2014 and outside Ukrainian agricultural reporting.") → 未排序，与研究论文一致：自 2014 年被占领，不在乌克兰农业统计之内。 / Не ранжовано, як у науковій статті: окупований з 2014 року й поза українською сільськогосподарською статистикою.

## Voice: 中文

1. 简体中文，面向中国大陆的读者；称读者为“您”。
2. 只用全角标点：，。：；！？（）、“”《》。标点前不留空格。原文没有感叹号，译文也没有。
3. 汉字与拉丁词或数字之间留一个空格：Chernozem 读取、10 米、2019 到 2021 年、Field 面向。百分号紧跟数字：94%。
4. 单位写成公顷、米、千米、分贝，从不写 ha、m、km、dB。日期写成 2026 年 9 月、2026 年 10 月 26 日。
5. 句子短、直白；译意思，不译词序；不堆“的”；一句英文译成一句中文，可以拆成两句，不可以漏掉信息。
6. 产品名 Chernozem、Field、Atlas 保持拉丁字母，不加引号；作为土壤的 chernozem 译为“黑土”。
7. 数据集和工具的名字保持原文；一个指数在每页第一次出现时写全称并加括号缩写（归一化植被指数（NDVI）），之后只写缩写。
8. 菜单项、按钮、表头两到四个字：关于、故事、方法、联系、演示、注册、登录、打开、关闭、发送、下载 CSV。
9. 语气平实，像产品说明，不像广告：没有“强大”“领先”“革命性”“赋能”，不用成语堆砌。产品本身说话。
10. 除了上面列出的名字，译文里不留英文；引用应用自身的按钮时用“ ”：“查找我的田块”。

Three sentences from the About page, translated the way the whole site should read:

- Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.
  → Chernozem 是卫星农田监测：读取农田上空的免费卫星数据，再用通俗的话讲给不是科学家的人。
- Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.
  → Field 是面向一个农场的 Chernozem：您只需把田块标出一次，之后每次无云的卫星过境后，它都会告诉您每块田的状况和该做什么。
- Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees.
  → Chernozem 从太空读取农田。它无法在灾区采集土壤样本，地面上也没有设备来确认它看到的情况。

## Voice: Українська

1. Сучасна літературна українська, без русизмів і суржику: дані (не «данні»), зараз (не «на даний момент»), протягом (не «на протязі»), брати участь (не «приймати участь»), наступний крок (не «слідуючий»).
2. Апостроф тільки ʼ (U+02BC) або ’, ніколи ASCII '. Лапки « ». Тире — з пробілами по обидва боки. Ґ там, де належить: ґрунт, ґрунтовий.
3. «ви» з малої літери в тексті. Кнопки й посилання в інфінітиві або наказовому способі: Відкрити, Зареєструватися, Увійти, Надіслати, Спробувати демо; звернення до читача в наказовому: Поставте мітку, Виберіть Field або Atlas.
4. Числа: пробіл між групами тисяч (1 176, 1 780 400), десяткова кома (0,79), відсотки з пробілом (94 %), одиниці га, м, км, дБ. Мільйони: 1,78 млн га.
5. Дати: 26 жовтня 2026 р.; вересень 2026 (місяць з малої літери, без «р.»); проміжок 2019–2021 коротким тире без пробілів; у реченні — «з 2019 по 2021 рік».
6. Коли число змінюється, множина через функцію в словнику: 1 поле, 2–4 поля, 5+ полів; 1 прохід, 2–4 проходи, 5+ проходів; 1 область, 2–4 області, 5+ областей; 1 квадрат, 2–4 квадрати, 5+ квадратів.
7. Chernozem, Field, Atlas — латиницею, без лапок, не відмінюються (в Chernozem, для Field). Ґрунт — чорнозем. Назви наборів даних та інструментів не перекладаються; індекс першого разу зі словом: вегетаційний індекс NDVI, далі NDVI.
8. Речення не довші за англійські: українська довша сама по собі, тож обирайте коротшу природну форму; пункти меню, кнопки й заголовки таблиць — одне-два слова.
9. Тон рівний і спокійний, без реклами й окличних знаків: жодних «інноваційний», «потужний», «революційний», «унікальний». Продукт говорить сам за себе.
10. Англійських слів не лишається, крім назв зі списку; цитовані кнопки застосунку в « »: «Знайти мої поля».

Три речення зі сторінки «Про нас», перекладені так, як має читатися весь сайт:

- Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.
  → Chernozem — це супутниковий моніторинг сільгоспугідь: безкоштовні супутникові дані над полями, прочитані й викладені простими словами для людей, які не є науковцями.
- Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.
  → Field — це Chernozem для одного господарства: ви позначаєте свої поля один раз, і після кожного безхмарного проходу супутника він каже, як справи на кожному полі і що треба зробити.
- Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees.
  → Chernozem читає сільгоспугіддя з космосу. Він не може взяти проби ґрунту в зоні лиха і не має обладнання на землі, щоб підтвердити побачене.

## Terms added by the translators

Append-only. Each namespace adds its own heading below, for example `## Added by story`, with rows in the same five columns. Read the file right before appending.

## Added by demo

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| the About page (named as a website page in a link or sentence); "Back to the About page" | NotFoundPage's link | “关于”页面；返回“关于”页面 | сторінка «Про нас»; Назад на сторінку «Про нас» | The website's own page names take the menu word from common.js in quotes, like the app's quoted buttons: “关于”页面, not 关于页. Ukrainian: the menu word in « », as the glossary does for the app's pages (сторінка «Поля»). |
| "There is no page here"; "That address does not exist." | NotFoundPage | 这里没有页面；这个地址不存在。 | Тут немає сторінки; Такої адреси не існує. | 地址 = the web address (URL). Calm, no full stop on the heading. Ukrainian: адреса for a web address too (the same word as Atlas's search address). |
| "Want your own fields or region? Register, it’s free." | DemoPage's close, beside the Register button | 想看您自己的田块或地区？注册即可，免费。 | Хочете побачити свої поля чи регіон? Зареєструйтеся — це безкоштовно. | "Want" = want to see your own land the way the demo shows Ukraine (想看 / побачити), not to own land. Same verb 注册 as the button; in Ukrainian the button's зареєструватися as an imperative to the reader (Зареєструйтеся). |
| "Try the demo" as a heading (DemoPage's h1), not a button | DemoPage | 体验演示 | Спробуйте демо | The button form stays as the glossary has it (体验演示 / Спробувати демо). Ukrainian headings that speak to the reader use the imperative, like «Поставте мітку» and «Запустіть на своїй землі», so the h1 is Спробуйте демо. |

## Added by contact

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| supply region (a company buys crops from it) | Contact, the Corporation prompt | 供应产区 | — | zh: "Which farmland or supply region" → 哪片农田或供应产区. |
| the fields to watch (fields that need attention) | Contact, the first phone alt | 需要关注的田块 | — | zh only; uk translator adds its own. |
| tell us what is wrong (report a problem with the product) | Contact lead | 告诉我们哪里出了问题 | — | |
| Any reply will go to {sentTo} | Contact, after sending | 如有回复，将发送至 {sentTo}。 | — | No promise that a reply comes: 如有回复. |
| Website (the hidden robot-trap label) | Contact | 网站 | — | Nobody sees it. |

## Added by labs

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "NDVI against normal" / "NDWI against normal" (slider labels; a signed number follows on the line) | ConditionLab | NDVI 对比正常值 / NDWI 对比正常值 | — | From the glossary's 对比正常, with 值 so the label stands alone before the number. The screen-reader form puts the number last: NDVI 对比正常值 {value}. |
| "{n}% of the field stressed" (screen reader, the stressed-share slider) | ConditionLab | 田块面积的 {n}% 受胁迫 | — | 面积 so it reads as a share of the area, not a share of several fields. |
| "Feasibility of this place" (slider label) | GateLab | 这个地点的可行性 | — | 地点 as in the glossary's 一个假想的地点. |
| "Feasibility weight" / "Damage weight" (slider labels, beside 价值权重) | GateLab | 可行性权重 / 损毁权重 | — | Parallel to the glossary's 价值权重. |
| "watch what the two time frames do with it" | GateLab's instruction | 看两个时段各自怎样处理它 | — | 处理 = how each time frame ranks or scores the place. |
| "Priority against feasibility for the current settings" (the chart's screen-reader name); "the current settings" | GateLab | 当前设置下，优先级随可行性的变化；当前设置 | — | A noun phrase, as the English. |
| "priority of this place, at every feasibility" (legend) | GateLab | 这个地点在各个可行性下的优先级 | — | |
| "below the cutoff: left out" (legend) | GateLab | 低于阈值：排除 | — | Same words as 阈值 (cutoff) and 排除 (Left out). |

## Added by ranking

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| hatched (an oblast drawn with diagonal hatching on the map) | DemoRanking's near-term note "({count} oblasts, hatched)" | 图中以斜线标出 | — | zh: "（5 个州，图中以斜线标出）". The hatching is a picture, so say what the reader sees, not 阴影. |
| blended (the three scores blended, with no gate) | DemoRanking's post-crisis notes | 综合计算 | — | zh: "三项得分综合计算" / "价值、损毁和可行性综合计算". Not 混合 (reads as mixing liquids). |
| the app (Atlas, named from the website); "Open the app"; "the app lets you change them" | DemoRanking's failure line and footnote | 应用；打开应用；您可以在应用中更改 | — | Same 应用 as common.js ("Builds the app into a few small files" → 把应用构建成几个小文件). |
| live ranking | DemoRanking's failure line | 实时排序 | — | 排序 as the glossary's "ranking". |
| the land left out comes back (post-crisis, after the near-term gate) | DemoRanking's post-crisis note | 近期暂不纳入的土地重新回到排序中 | — | 近期 names the other tab, so the reader knows which "left out" is meant. |
| rank marks: "{name} #3" in a list, "#3 near term" in the tooltip; the narrow "→ #10" row marker | DemoRanking | {name}第 3 名；近期第 3 名 / 危机后第 3 名；→ 第 10 | — | 名 completes the ordinal where it reads as prose; the pill marker drops it for room (the hover title 它的危机后排名 explains it). Not #. |
| "Map of Ukraine's oblasts coloured by near-term priority" (the map's aria-label) | DemoRanking | 乌克兰各州地图，按近期优先级着色 | — | 各州 = all the oblasts; 着色 for "coloured". |
| "{total} oblasts" while loading ({total} = "…") | DemoRanking's list header | … 个州中的前 10 | — | The ellipsis takes the number's place; harmless for a moment. |

## Added by contact (Українська)

The Ukrainian column of the rows under "## Added by contact" above, plus the terms only the Ukrainian needed. Appended by the uk translator; the zh column is left to the rows above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| supply region (a company buys crops from it) | Contact, the Corporation prompt | (see above) | регіон постачання | "Which farmland or supply region" → Які сільгоспугіддя або регіон постачання. |
| the fields to watch (fields that need attention) | Contact, the first phone alt | (see above) | поля, що потребують уваги | Not «поля для спостереження» (reads as an instruction). |
| tell us what is wrong (report a problem with the product) | Contact lead | (see above) | розкажіть, що не так | Plain; not «повідомте про помилку» (too technical for the lead). |
| Any reply will go to {sentTo} | Contact, after sending | (see above) | Якщо буде відповідь, вона надійде на {sentTo}. | No promise that a reply comes: «якщо буде». |
| Website (the hidden robot-trap label) | Contact | (see above) | Вебсайт | One word, 2019 orthography (not веб-сайт). Nobody sees it. |
| Feel free to email us directly as well | Contact, the address line | (see above) | Можете також написати нам напряму. | напряму = without the form, from one's own mail program. |
| Messages go to {email} | Contact, the address line | (see above) | Повідомлення надходять на {email}. | надходять на + an address. |
| Who you are (the legend over the five choices) | Contact | (see above) | Хто ви | From the glossary's UI words; the small «(необовʼязково)» follows after a space. |
| on a phone (the four pictures; "Field and Atlas on a phone.") | Contact's phone screenshots | (see above) | на телефоні; Field і Atlas на телефоні. | |
| the farm's fields outlined on the satellite map | Contact, the second phone alt | (see above) | контури полів господарства на супутниковій карті | Glossary's контур for "outline"; господарство for the farm, as the glossary says (common.js has «демонстраційна ферма» in one caption; flagged). |
| the map of Ukraine by priority, with the weights under it | Contact, the fourth phone alt | (see above) | карта України за пріоритетом і ваги під нею | ваги as in the glossary (the sliders). |
| What would you like to say? (the open prompt) | Contact, the Something-else prompt | (see above) | Що ви хотіли б сказати? | хотіли б for "would like"; no «нам», as the English has no "us". |

## Added by ranking (Українська)

The Ukrainian column of the rows under "## Added by ranking" above, plus the terms only the Ukrainian needed. Appended by the uk translator of DemoRanking; the zh column is left to the rows above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| hatched (an oblast drawn with diagonal hatching on the map) | DemoRanking's near-term note "({count} oblasts, hatched)" | (see above) | заштриховані | "(5 областей, заштриховані)": a predicative plural after the count, the same for 1, 2–4 and 5+. |
| blended (the three scores blended, with no gate) | DemoRanking's post-crisis notes | (see above) | поєднано | "усі три оцінки поєднано"; "цінність, пошкодження й доступність поєднано". Not змішано. |
| the app (Atlas, named from the website); "Open the app"; "the app lets you change them" | DemoRanking's failure line and footnote | (see above) | застосунок; Відкрийте застосунок; у застосунку їх можна змінити | The same word as common.js («Збирає застосунок у кілька невеликих файлів»). |
| live ranking | DemoRanking's failure line | (see above) | актуальне ранжування | Not «живе ранжування». |
| the land left out comes back (post-crisis, after the near-term gate) | DemoRanking's post-crisis note | (see above) | виключені землі повертаються | виключено as the glossary's "left out" (the cutoff). |
| rank marks: "{name} #3" in a list, "#3 near term" in the tooltip; the narrow "→ #10" row marker | DemoRanking | (see above) | {name} (3-тє місце); 3-тє місце найближчим часом / 3-тє місце після кризи; → 10-те | An ordinal before «місце», by function: 1-ше, 2-ге, 3-тє, 4-те, 5-те, 6-те, 7-ме, 8-ме, 9-те, 10-те, 11-те … 19-те, 20-те, 21-ше, 22-ге, 23-тє, 24-те. Neuter ordinals take the two-letter ending (третє → 3-тє, пʼяте → 5-те), so the «3-є місце» in the ranking row of the main table is a slip to avoid. Not №. |
| "Map of Ukraine's oblasts coloured by near-term / post-crisis priority" (the map's aria-label) | DemoRanking | (see above) | Карта областей України, розфарбована за пріоритетом на найближчий час / після кризи | |
| "Top {top} of {total} oblasts" ({total} = 24, 21, or "…" while loading) | DemoRanking's list header | (see above) | {top} найперших із {total} областей | By function: «із 21 області» (a number ending in 1, not 11, takes the singular after «із»), otherwise «областей», «…» included. |
| "Its post-crisis rank" (hover title of the → marker in an oblast's row) | DemoRanking | — | Місце після кризи | The main table's «Його місце після кризи» would need «Її» (область is feminine); the pronoun is dropped, as the marker sits in the oblast's own row. |
| people living on damaged black soil, counted | DemoRanking's tooltip line | — | {people} особа живе / особи живуть / осіб живуть на пошкоджених чорноземах | By function of the raw count: 1 особа живе, 2–4 особи живуть, 5+ осіб живуть (1 204 041 особа живе; 6 864 особи живуть). |
| "{count} oblasts are left out of the near-term ranking for now." | DemoRanking's footnote | — | {count} область / області / областей поки не враховано в ранжуванні на найближчий час. | By function: 1 область, 2–4 області, 5+ областей (21 область, 22 області). |
| "Default weights {soil}/{damage}/{access}; the app lets you change them." | DemoRanking's footnote | — | Ваги за замовчуванням — 30/40/30; у застосунку їх можна змінити. | The glossary's «ваги за замовчуванням»; a dash before the figures. |

## Added by owner

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| Owner sign-in (the page's title and h1) | OwnerPage | 所有者登录 | — | 所有者 from the glossary's "the owner"; 登录 from the menu's "Sign in". |
| the Chernozem Google account; "Sign in with the Chernozem Google account" | OwnerPage's lead and button | Chernozem 的 Google 账户；使用 Chernozem 的 Google 账户登录 | — | 账户 as the glossary (not 帐户/帐号). The same shape as "Continue with Google" → 使用 Google 继续. |
| the Ukraine demo; change the demo | OwnerPage's lead; "The demo can be changed from this browser." | 乌克兰演示；修改演示 | — | 修改 for "change" (edit the demo's data), not 更改 or 改变. |
| Signing out… (the Sign out button while busy) | OwnerPage, pairs with "Signing in…" → 正在登录… | 正在退出… | — | Same 退出 as the button "Sign out" → 退出. |
| the Google window (the pop-up Google opens for signing in) | OwnerPage, RegisterPage, SignInPage error sentences | Google 登录窗口 | — | "The Google window was closed before you signed in. Try again." → Google 登录窗口在您完成登录前就关闭了。请重试。 |
| pop-ups; "Allow pop-ups for this site" | the browser-blocked error (owner, register, signin) | 弹出式窗口；允许本网站的弹出式窗口 | — | Chrome's own zh-CN term is 弹出式窗口. "The browser blocked the Google window. Allow pop-ups for this site and try again." → 浏览器拦截了 Google 登录窗口。请允许本网站的弹出式窗口，然后重试。 |
| Check your connection and try again (the advice after "Could not reach …") | owner, register, signin error sentences | 请检查网络连接后重试。 | — | "Could not reach the server. Check your connection and try again." → 无法连接服务器。请检查网络连接后重试。 "Could not reach Google. …" → 无法连接 Google。请检查网络连接后重试。 |
| Too many attempts. Wait a few minutes and try again. | owner, register, signin | 尝试次数过多。请等几分钟后重试。 | — | |
| switched off (a Google account disabled); "This Google account has been switched off." | owner, register, signin | 已被停用 | — | 这个 Google 账户已被停用。 停用 is the usual word for a disabled account. |
| does not take Google sign-ins yet; "This server does not take Google sign-ins yet." | OwnerPage (NOT_SET_UP) | 尚未开放 Google 登录 | — | 这台服务器尚未开放 Google 登录。 From the glossary's 尚未开放 ("not open yet"). |
| could not check the sign-in (our server could not verify Google's token) | OwnerPage (bad_token) | 无法验证这次登录 | — | 我们的服务器无法验证这次登录。请重试。 |
| The sign-in is still loading. Try again in a moment. | owner, register, signin (LOADING) | 登录功能还在加载中。请稍后重试。 | — | "The sign-in" = the sign-in feature → 登录功能. 请稍后重试 from the glossary. |
| Something went wrong ({reason}). Try again. | owner (register/signin name the hole {code}) | 出错了（{reason}）。请重试。 | — | Full-width brackets; without the hole: 出错了。请重试。 |
| this computer / this browser (the owner's machine) | OwnerPage's "open" and "owner" lines | 这台电脑；这个浏览器 | — | "This computer needs no sign-in: the demo can be changed from here." → 这台电脑无需登录，可以直接在这里修改演示。 The colon becomes a comma. |

## Added by owner (Українська)

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| Owner sign-in (the page's title and h1; "sign-in" the noun) | OwnerPage | — | Вхід для власника | Вхід is the noun for a sign-in throughout: "Signing in…" → Вхід…, "Signing out…" → Вихід…, "no sign-in is needed" → вхід не потрібен, "the sign-in is still loading" → Вхід ще завантажується. |
| the Chernozem Google account (the company's own Google account) | OwnerPage's lead and button | — | обліковий запис Google компанії Chernozem | The glossary's обліковий запис; "компанії" says whose it is, since Chernozem is not declined. Button: Увійти через обліковий запис Google компанії Chernozem ("sign in with" → увійти через, as Google's own Ukrainian UI says). |
| the Ukraine demo; "Everyone else can only look at it." | OwnerPage's lead | — | демо України; Усі інші можуть лише переглядати його. | демо is neuter and indeclinable, so "it" → його. |
| "Signed in as {who}. The demo can be changed from this browser." / "the owner" as the fallback for {who} | OwnerPage | — | Ви увійшли як {who}. Демо можна змінювати з цього браузера. / власник | After як the nominative: Ви увійшли як власник. |
| "This Google account is not the owner’s."; switched off (an account disabled) | OwnerPage's refusal; PROBLEMS user-disabled | — | Цей обліковий запис Google не належить власнику.; вимкнено (Цей обліковий запис Google вимкнено.) | |
| "This server does not take Google sign-ins yet." | OwnerPage (NOT_SET_UP) | — | Цей сервер ще не приймає вхід через Google. | |
| Check your connection and try again. | the error messages (OFFLINE, network-request-failed) | — | Перевірте підключення і спробуйте ще раз. | підключення, not зʼєднання, so it does not echo "Не вдалося зʼєднатися" in the same message. |
| pop-ups; "Allow pop-ups for this site" | PROBLEMS popup-blocked | — | спливні вікна; Дозвольте спливні вікна для цього сайту | The literary form; Chrome's Ukrainian settings say «спливаючі вікна», Firefox's «спливні». |
| "The Google window was closed before you signed in." | PROBLEMS popup-closed-by-user | — | Вікно Google було закрито до завершення входу. | |
| Too many attempts. Wait a few minutes and try again. | PROBLEMS too-many-requests | — | Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз. | |
| could not check the sign-in (our server could not verify Google's token) | OwnerPage (bad_token) | — | Наш сервер не зміг перевірити вхід. Спробуйте ще раз. | |
| Something went wrong ({reason}). Try again. | owner (register/signin name the hole {code}) | — | Щось пішло не так ({reason}). Спробуйте ще раз. | Round brackets as in the English; without the hole: Щось пішло не так. Спробуйте ще раз. |
| this computer / this browser (the owner's machine) | OwnerPage's "open" and "owner" lines | — | цей компʼютер; цей браузер | "This computer needs no sign-in: the demo can be changed from here." → На цьому компʼютері вхід не потрібен: демо можна змінювати звідси. Apostrophe ʼ (U+02BC) in компʼютер. |

## Added by register

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "This browser is signed in as {email}." (the browser, not the person, holds a sign-in) | Register's box for a browser Firebase knows | 此浏览器已登录为 {email}。 | — | 此浏览器 names the subject, on the glossary's 已登录为. |
| the sign-in (the sign-in machinery, Firebase's code downloaded by the page); "The sign-in is still loading" / "could not be downloaded" | Register's LOADING and NOT_LOADED | 登录功能 | — | 登录功能还在加载。 / 登录功能未能下载。 Not 登录 alone (which reads as the person's act of signing in). |
| "That sign-in has ended." (the remembered sign-in is no longer valid); "Your sign-in ran out." (the cookie expired) | SIGN_IN_ENDED; Register's 401 message | 该登录已失效。；您的登录已过期。 | — | 失效 for ended by a sign-out elsewhere, 过期 for ran out of time. |
| "could not be checked by our server" (the token could not be verified) | registration.js bad_token | 我们的服务器无法核验这次登录 | — | 核验, as the glossary's "Checked against the record" (对照记录核验). |
| pop-ups; "Allow pop-ups for this site"; "the Google window" | Firebase auth/popup-blocked, popup-closed | 弹出窗口；请允许本网站的弹出窗口；Google 窗口 | — | The browsers' own term 弹出窗口. 拦截 for "blocked" (what Chinese browsers say). |
| "Check your connection"; "reload the page" | the network errors | 请检查网络连接；刷新页面 | — | 刷新 is what browsers call reload; not 重新加载. |
| "switched off" (an account disabled by the owner); "not switched on yet" (Google sign-in for this web address); "this address" (the website's domain) | Firebase auth/user-disabled, auth/unauthorized-domain | 已被停用；尚未开启；此网址 | — | 网址 so the web address is not confused with the e-mail address (电子邮件地址). |
| "Too many attempts." | Firebase auth/too-many-requests | 尝试次数过多。 | — | |
| "does not look right" (an e-mail not shaped like one); "do not match" (e-mail and password); "already has an account" | the e-mail and password checks | 看起来不对；不匹配；已有账户 | — | 这个电子邮件地址看起来不对。 / 电子邮件和密码不匹配。 / 这个电子邮件已有账户。 Gentle, no accusation. |
| "Keep … to {n} characters or fewer." (a length limit) | validateProfile, emailProblem, passwordProblem | …请不要超过 {n} 个字符。 | — | 姓名请不要超过 {n} 个字符。 / 密码请不要超过 … / 电子邮件请不要超过 … / 机构名称请不要超过 … Parallel for all four. |
| "Use {n} characters or more." (the password's minimum, agreeing with the hint "{n} characters or more") | passwordProblem; the password hint | 请使用 {n} 个字符或更多。 | — | Kept parallel with the glossary's hint 8 个字符或更多. |
| "Could not save." (the answers could not be stored on the server) | Register's generic save failure | 无法保存。 | — | On the glossary's 无法…. |
| "filled and ranked by near-term priority, … first" (the Atlas map's alt) | PICTURES.atlas | 按近期优先级着色并排序，…居前 | — | 着色 as ranking's "coloured" (乌克兰各州地图，按近期优先级着色); 居前 for "first" in a list of three. |
| "square by square" shown as a caption; "the damage layer" | PICTURES.atlas | 逐格显示；损毁图层 | — | The glossary's 逐格 with 显示 so the caption stands alone: 损毁，逐格显示. |
| "the headline figures"; "the top ten areas"; "The month's figures" | PICTURES.atlas (the report and the overview) | 主要数字；前十个地区；本月数字 | — | 数字 rather than 数据 for figures the reader sees as numbers. |
| "suggested questions" (the assistant's); "Ask what changed" | PICTURES.field | 推荐问题；问问发生了什么变化 | — | 发生了什么变化 as common.js's description ("says what changed" → 告诉你发生了什么变化). |
| "read after every clear pass" (a caption); "after the latest pass" | PICTURES.field, PICTURES.signin | 每次无云过境后判读；最近一次过境后 | — | 判读 for reading a pass, 无云过境 for a clear pass, both per the glossary. |

## Added by labs (Українська)

The Ukrainian column of the rows under "## Added by labs" above, plus the terms only the Ukrainian needed. Appended by the uk translator of the two laboratories (ConditionLab.jsx, GateLab.jsx); the zh column is left to the rows above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "NDVI against normal" / "NDWI against normal" (slider labels: the signed difference from normal, −0.10 follows) | ConditionLab | (see above) | NDVI відносно норми / NDWI відносно норми | A comparison keeps the glossary's «проти норми» (цей сезон проти норми); a signed difference reads as «відносно норми». Screen reader: NDVI {value} відносно норми. |
| "{n}% of the field stressed" (screen reader, the stressed-share slider) | ConditionLab | (see above) | {n} % поля під стресом | The glossary's «частка під стресом»; the % after a no-break space. |
| Health score / Water score / Not stressed (the written sum's three labels) | ConditionLab's PARTS | — | Оцінка здоровʼя / Оцінка води / Без стресу | The glossary's terms, capitalised as labels. |
| "High stress: held under {top}." (one line across the readout) | ConditionLab's hold line | — | Високий стрес: нижче за «{top}». | {top} is the top class translated («Дуже добрий», no-break space inside), so the glossary's «клас не вище за «Добрий»» cannot be written; «нижче за» = held below it. Without «клас», so the absolute-positioned line stays on one line in the narrow column. |
| "watch its condition"; "watch what the two time frames do with it" | the two labs' instructions | (see above) | стежте за його станом; дивіться, що з ним роблять два періоди | «Посувайте його NDVI … / його доступність» for "Move its …" (the glossary's «Посувайте повзунки»). |
| "Feasibility of this place"; "Feasibility weight" / "Damage weight" | GateLab's slider labels | (see above) | Доступність цього місця; Вага доступності / Вага пошкодження | Parallel to the glossary's «вага цінності», «поріг доступності». |
| Not used (the gate's state under Post-crisis, large bold type in half a column) | GateLab's readout | — | Не діє | The glossary's «Не використовується» (a 16-letter word at --step-head size, 32–64 px, weight 800) cannot fit half of the 5/12 column; «Не діє» = the gate is not in effect. Elsewhere (DemoRanking, NotFound) the glossary's word stands. |
| Left out / Open / {n}% open (the gate's states) | GateLab's readout | — | Закритий / Відкритий / Відкритий на {n} % | As the glossary has them: adjectives agreeing with «шлюз», states, not commands. The legend's "below the cutoff: left out" keeps «виключено» (what happens to the place): нижче порога: виключено. |
| "Priority against feasibility for the current settings" (the chart's screen-reader name); "priority of this place, at every feasibility" (legend) | GateLab | (see above) | Пріоритет залежно від доступності за поточних налаштувань; пріоритет цього місця залежно від доступності | «залежно від» for a curve of one against the other; "at every feasibility" folded into it. |

## Added by story

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| disturbance; the disturbance layer (the paper's word for unusual change on the land) | Story, First edition (paragraph, alt, caption) and Second edition (the sliders) | 扰动；扰动图层 | (the uk translator fills this) | The remote-sensing term; the alt text explains it as 土地上的异常变化 ("unusual change on the land"). |
| recovery context (the Recovery Atlas's third slider) | Story, Second edition | 恢复背景 | (the uk translator fills this) | |
| near-term and postwar readings (the Recovery Atlas's two time frames) | Story, Second edition | 近期和战后两种读数 | (the uk translator fills this) | 近期 as the glossary's near term; 战后 for postwar (the Recovery Atlas was Ukraine only, so "war", not the later "crisis"). |
| the check (the data the first edition was checked against) | Story, the ACLED map's caption "The check: …" | 核验依据 | (the uk translator fills this) | From the glossary's 核验 (Checked against the record → 对照记录核验). |
| explosion and remote-violence events (ACLED's category) | Story, First edition | 爆炸与远程暴力事件 | (the uk translator fills this) | Events, not explosions: {events} 起爆炸与远程暴力事件. |
| freshman year; a business program | Story, the second and fifth steps | 大一；商科项目 | (the uk translator fills this) | "The summer after his freshman year" → 大一结束后的那个夏天. |
| to scale it (grow it to more users) | Story, the fifth step | 把它做大 | (the uk translator fills this) | Not 扩展 or 规模化 (jargon). |
| the Sino-Japanese War's remnants: bombs, landmines and the remnants of war | Story, the first step | 炸弹、地雷和战争的其他残留 | (the uk translator fills this) | |
| where the name comes from (said once, in the first step) | Story | Chernozem 这个名字正是取自这种土壤 | (the uk translator fills this) | The glossary's 名字取自黑土, placed right after 黑土 first appears. |
| Base map (one) / Base maps (several); Attacks: (the source of the attack dots) | Story, the two map credits | 底图；袭击数据： | (the uk translator fills this) | 底图 for both numbers; "Attacks: {acled}." → 袭击数据：{acled}。 |
| localhost; chernozem.app | Story, Second and Third editions | stay | stay | A technical address and the domain; neither is a word. |

## Added by signin

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Your fields or your region, as you left them." (the lead under "Sign in") | SignInPage | 您的田块或地区，还是您离开时的样子。 | — | 田块 and 地区 from the glossary; "as you left them" → 还是您离开时的样子. |
| "Registering is not finished yet." (the account's registration was never completed) | SignInPage's unfinished panel | 注册尚未完成。 | — | Parallel to the glossary's 注册尚未开放。; the button under it is 完成注册. |
| "Signed in as {email}, the owner." and the bold fallback "the owner" | SignInPage's owner panel | 已登录为 {email}（所有者）。; fallback 所有者 | — | The glossary's form. When the server does not name the address the sentence reads 已登录为 所有者（所有者）。, tolerable for a moment. |
| "Not you? Sign out"; "New here? {register}" | SignInPage's text buttons | 不是您？退出；新用户？{register} | — | The glossary's 不是您？, 退出 and 新用户？ joined; {register} is the link 注册. |
| "Forgot it?" (the small button beside the Password label) | SignInPage | 忘记了？ | — | The glossary's form (not the manifest's suggestion 忘记密码？); it sits beside the label 密码, which says what was forgotten. |
| "If {email} has an account, a link to choose a new password is on its way." | SignInPage's reset note | 如果 {email} 有账户，设置新密码的链接已经发出。 | — | 设置新密码的链接 for the reset link; 已经发出 for "is on its way". The conditional 如果 stays: the page never says who has an account. |
| "Enter your e-mail first; the link goes there." | SignInPage, "Forgot it?" with an empty e-mail | 请先输入电子邮件地址，链接会发到那里。 | — | The semicolon becomes a comma; 链接 = the reset link. |
| "Open {product}" ({product} = Field or Atlas) | SignInPage's signed panel | 打开 {product} | — | common.js's 打开 Field / 打开 Atlas with the name as the hole. |
| the Firebase sentences shared by Register and Sign in (the Google window, pop-ups, this browser, "Check your connection and try again", "could not be checked by our server") | SignInPage useSaid | as zh/register.js: Google 窗口；弹出窗口；此浏览器；请检查网络连接并重试；无法核验这次登录 | — | The Sign in page is the Register page's twin, so it follows register. The owner addendum above chose Google 登录窗口 / 弹出式窗口 / 这个浏览器 / 请检查网络连接后重试 / 无法验证这次登录 for OwnerPage; the reviewers may settle on one set. |

## Added by story (Українська)

The Ukrainian column of the rows under "## Added by story" above, plus the terms only the Ukrainian needed. Appended by the uk translator of the Story (pages/StoryPage.jsx); the zh column is left to the rows above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| disturbance; the disturbance layer (the paper's word for unusual change on the land) | Story, First edition (paragraph, alt, caption) and Second edition (the sliders) | (see above) | порушення; шар порушень | The remote-sensing term (порушення земного покриву); the alt text explains it as «незвичні зміни на землі». Not пошкодження (that is damage, the Atlas score). |
| recovery context (the Recovery Atlas's third slider) | Story, Second edition | (see above) | контекст відновлення | |
| near-term and postwar readings (the Recovery Atlas's two time frames) | Story, Second edition | (see above) | показники на найближчий час і на повоєнний період | The glossary's «найближчим часом» as a noun phrase, «повоєнний» as the paper's title in common.js. |
| the check (the data the first edition was checked against) | Story, the ACLED map's caption "The check: …" | (see above) | Перевірка: … | From the glossary's «Перевірено за незалежними даними»; "Checked against {events} …" → «Перевірений за … подіями». |
| explosion and remote-violence events (ACLED's category) | Story, First edition | (see above) | події категорії «вибухи й дистанційне насильство» | Events, not explosions; the category name in « ». |
| freshman year; a business program | Story, the second and fifth steps | (see above) | перший курс; бізнес-програма | "The summer after his freshman year" → Влітку після першого курсу. |
| to scale it (grow it to more users) | Story, the fifth step | (see above) | масштабувати (поступово його масштабують) | |
| bombs, landmines and the remnants of war; torn apart (the soil) | Story, the first step | (see above) | бомби, міни й залишки війни; пошматували | |
| where the name comes from | Story, the first step | (see above) | (nothing added) | In Ukrainian the name is the word itself (Chernozem = чорнозем), so the first step says «чорнозем» and no gloss is needed; the glossary's «назва походить від чорнозему» stays available if a reviewer wants it said. |
| great-grandparents | Story, the first and third steps | — | прадід і прабаба | Not прадіди (reads as ancestors in general). |
| the first / second / third edition in the bar: "First" + " edition" | Story, the bar and the h2s | — | Перша / Друга / Третя + « версія» | Feminine, agreeing with the glossary's версія (not the wrap note's «видання»). |
| Dr. Bo Zhao in a declined position ("with Dr. Bo Zhao") | Story, the fourth step | — | разом із д-ром Бо Чжао | The abbreviation declines (д-ром); a no-break space (U+00A0) after it, as the glossary asks after д-р. |
| this app (the third edition) | Story, Third edition | — | застосунок (Цей застосунок, за адресою chernozem.app.) | Not додаток. |
| the top oblasts (in the Recovery Atlas's list) | Story, Second edition (alt, caption) | — | найперші області | As the glossary's «10 найперших із 24 областей». |
| coloured by priority; the weights and map layers on the left … on the right | Story, Second edition (alt, caption) | — | розфарбовані за пріоритетом; ваги й шари карти зліва … справа | |
| Base map / Base maps; Attacks: | Story, the two map credits | (see above) | базова карта / базові карти; Атаки: | «© учасники OpenStreetMap» as the glossary has it. |
| localhost; chernozem.app | Story, Second and Third editions | stay | stay | A technical address and the domain; neither is a word. |

## Added by register (Українська)

The Ukrainian column for the Register page (uk/register.js), the terms the glossary lacked or where the chosen form differs from a glossary example. Appended by the uk translator; the zh column is in "## Added by register" above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "An account is free and takes one step." | Register, the lead | (see above) | Обліковий запис безкоштовний, усього один крок. | The glossary's example without «усього» read as two unconnected fragments. |
| sign-in (the remembered or expired one): "That sign-in has ended."; "Your sign-in ran out." | Register, Sign in | (see above) | сеанс; Цей сеанс завершився.; Ваш сеанс завершився. | «вхід» is the act of signing in (Вхід через Google); the thing that ends or runs out is the сеанс, as Ukrainian UIs say («Сеанс завершено»). |
| "The sign-in is still loading." / "The sign-in could not be downloaded." | Register, Sign in (Firebase's code) | (see above) | Вхід ще завантажується. / Не вдалося завантажити вхід. | The sign-in machinery as «вхід», kept the same in both so they read as a pair. |
| "This browser is signed in as {email}." | Register, Sign in | (see above) | У цьому браузері виконано вхід як {email}. | «виконано вхід» (impersonal): the browser, not the person, holds the sign-in. |
| pop-ups; "Allow pop-ups for this site" | the Firebase table | (see above) | спливаючі вікна; Дозвольте спливаючі вікна для цього сайту | The browsers' own Ukrainian term (Chrome, Firefox). |
| "Name your organisation." | Register, Atlas's organisation | (see above) | Вкажіть назву організації. | Not the glossary example «Назвіть вашу організацію» (reads as «give it a name»); «вкажіть назву» is the form Ukrainian forms use. |
| "Choose what kind of organisation." | Register | (see above) | Виберіть тип організації. | Same «тип організації» as the legend. |
| "Keep … to {n} characters or fewer." (password, e-mail, name, organisation) | Register, the length checks | (see above) | Пароль / Імʼя має бути не довшим за {n} символів.; Адреса електронної пошти / Назва організації має бути не довшою за {n} символів. | Function entries: 1 символ, 2–4 символи, 5+ символів (21 символ, 22 символи). «не довшим / не довшою» agrees with the noun. |
| "Use {n} characters or more."; the hint "{n} characters or more" | Register, the password | (see above) | Використайте щонайменше {n} символів.; {n} символів або більше | The hint follows the glossary; the error says the same with «щонайменше», as Ukrainian password errors do. |
| "That e-mail address does not look right." | Register, Sign in | (see above) | Схоже, ця адреса електронної пошти неправильна. | «Схоже» keeps the English's gentleness. |
| "That e-mail already has an account." | Register, Sign in | (see above) | Для цієї електронної пошти вже є обліковий запис. | Followed by «Натомість увійдіть». |
| "That e-mail and password do not match." | Register, Sign in | (see above) | Ця електронна пошта і пароль не збігаються. | Says neither is wrong, as the English. |
| "This account has been switched off." | the Firebase table | (see above) | Цей обліковий запис вимкнено. | |
| "Google sign-in is not switched on for this address yet." | the Firebase table | (see above) | Вхід через Google для цієї адреси ще не увімкнено. | «адреса» = the website's address, the glossary's word for a web address. |
| "you" and "the owner" filling {who} in "Signed in as {who}." / "…, the owner." | Register, the panels | (see above) | ви; власник | «Ви увійшли як ви.» is as tautological as the English «Signed in as you.»; a reviewer may prefer another shape. |
| for my farm / for a region (the taglines under Field and Atlas; read aloud as "Field, for my farm") | Register, the switch | (see above) | для мого господарства / для регіону | From the glossary's «Field, для мого господарства». |
| "The month's figures"; "the headline figures" | Register, the Atlas pictures | (see above) | Цифри за місяць; головні цифри | «цифри» for the overview's and the report's totals; «показники» stays for Field's four readings. |
| "the top ten areas" (the donor report) | Register, the Atlas pictures | (see above) | десять найпріоритетніших територій | Says what «top» means here (priority), not «перші». |
| "A whole region, ranked"; "Atlas: a region, ranked" | Register, captions | (see above) | Цілий регіон, ранжований; Atlas: регіон, ранжований | |
| oblasts named in a list ("Mykolaiv, Kirovohrad and Poltava first") | Register, the Atlas alt | (see above) | перші — Миколаївська, Кіровоградська і Полтавська | The appendix's adjective forms, as a list of oblasts. |
| "Each field, read after every clear pass"; "Field: each field after the latest pass" | Register, captions | (see above) | Кожне поле, прочитане після кожного безхмарного проходу; Field: кожне поле після останнього проходу | The glossary's прохід / безхмарний прохід / прочитати. |
| "Field's data page"; "Atlas's overview"; "Atlas's donor report"; "Field's assistant" | Register, alt texts | (see above) | Сторінка «Дані» у Field; Огляд Atlas; Звіт Atlas для донорів; Помічник Field | The product name undeclined after the noun. |

## Added by demo (中文 review)

Two renderings in "## Added by demo" above were revised by the zh reviewer; the dictionary (src/site/i18n/zh/demo.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Want your own fields or region? Register, it’s free." | DemoPage's close | 想看您自己的田块或地区？免费注册即可。 | (unchanged) | "注册即可，免费。" left 免费 hanging after a comma, which reads as a translation; 免费注册即可 says the same (just register, it costs nothing) in the natural order. Same verb 注册 as the button. |
| "That address does not exist." | NotFoundPage | 这个网址不存在。 | (unchanged) | 网址 is the word for a web address (the register glossary uses it for the same reason); 地址 alone reads as a street or e-mail address. |

## Added by home

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Chernozem solves the problem of that harm going unseen." | HomePage's bold hero line | Chernozem 解决的，正是这些伤害无人看见的问题。 | — | 伤害 for the harm to farmland and farmers; 无人看见 for "going unseen". |
| the eight claims of "Why Chernozem" | HomePage WHY[].claim | 没有硬件，只有软件。／不只是监测，还有恢复。／由您决定什么重要。／从头到尾，只需几次点击。／您只需要一个地点。 | — | The other three are in the glossary (面向每一方。, 放下图钉，看见田块。) or the reason's hole ({earthEngine}). |
| step titles: "Your farm, field by field" / "A whole region, square by square" | the two stories' first steps, parallel | 您的农场，每一块田 / 整个地区，每一个方格 | — | Parallel titles; not the literal 逐块 / 逐格 (those stay for prose: 逐格着色). |
| step titles: "Drop a pin on your land" / "Every clear pass, read" / "Pick a country, a region or a box" | the stories' progress-row labels (short) | 在您的土地上放下图钉 / 每次无云过境都判读 / 选一个国家、地区或方框 | — | |
| "{title}, step by step" (the progress row's spoken name) | ScrollStory's nav aria-label | {title}：各步骤 | — | It names the list of step buttons, so a noun (各步骤), not an adverb. |
| clear sky (the field row's meta line: "New pass · Sentinel-2 · 26 October 2026 · clear sky") | FieldRowStates | 无云 | — | The same word as the glossary's 无云过境. |
| "The row's state" (the three buttons' group label) | FieldRowStates aria-label | 这一行的状态 | — | |
| "Checked against" / "the record" (the two lines of the proof heading) | HomePage h2#proof-title | 对照记录 / 核验 | — | The glossary's 对照记录核验 split after its object; the second line is the verb. |
| table headers Year / What / Compared with / Result | ProofTable | 年份 / 事项 / 对照 / 结果 | — | 对照 is the heading's own word; 事项 for the thing checked. |
| the proof rows: "Thessaly flood, Greece" / "Yambol wildfire, Bulgaria" / "Punjab flood, Pakistan" / "Crop detection, North Dakota" / "Damage against fighting, Ukraine" | ProofTable ROWS[].what | 希腊色萨利洪水 / 保加利亚扬博尔野火 / 巴基斯坦旁遮普洪水 / 北达科他州作物识别 / 乌克兰：损毁对照战斗 | — | The place first, as Chinese writes it. |
| "USDA Cropland Data Layer" (a table cell, needs Chinese characters) | ProofTable ROWS[3].against | USDA 作物图层（Cropland Data Layer） | — | The glossary's USDA 作物图层 first, the dataset's own name after it in brackets. |
| "ACLED, {events} events" | ProofTable ROWS[4].against | ACLED，{events} 起事件 | — | 起 is the measure word for recorded events. |
| "reads low" (the app's figure is under the official one) | ProofTable ROWS[2].result | （测得偏低） | — | 测得 as the glossary's "measured", so it is clear which figure is low. |
| "when it says “likely”" (the app's confidence label) | ProofTable ROWS[3].result | 标为“可能”时 | — | The app's English label translated in “ ”, like “查找我的田块”. "{likely}% right when it says “likely”; {all}% over all six crops" → 标为“可能”时 {likely}% 正确；六种作物合计 {all}%. |
| mean error in area (against the Copernicus maps) | ProofTable's note | 面积平均误差 | — | "Mean error in area against the three Copernicus maps: 12.9%." → 与三张 Copernicus 地图对照的面积平均误差：12.9%。 |
| "Photo: {credit}" (the photograph's credit label) | HomePage figcaption | 摄影：{credit} | — | With the glossary's 发表于 for "as published in": 摄影：{credit}，发表于 {article}。 |
| Esri's light grey canvas (the basemap) | HomePage small print | Esri 的浅灰底图 | — | The words translated, the names kept, per the glossary's credits row. |
| "One square in Mykolaiv" (a grid square inside the oblast) | ATLAS_STEPS[2].alt | 尼古拉耶夫州的一个方格 | — | 州 added, as in ranking.js: a square is 18 × 28 km, so it is the oblast, not the city. |
| "the top areas" (the highest-ranked areas) | the picture alts and the report step | 排名最前的地区；最应优先着手的地区 | — | The second where "to start with" follows. |

## Added by signin (Українська)

The Ukrainian column of the rows under "## Added by signin" above, plus the terms only the Ukrainian needed. Appended by the uk translator; the zh column is left to the rows above. Where the Register page says the same English sentence, uk/register.js's wording is followed, so the twin pages read alike.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Your fields or your region, as you left them." (the lead under "Sign in") | SignInPage | (see above) | Ваші поля чи ваш регіон — такими, як ви їх залишили. | «такими, як» for "as you left them"; поля and регіон per the glossary. |
| "Registering is not finished yet." | SignInPage's unfinished panel | (see above) | Реєстрацію ще не завершено. | Parallel to «Реєстрація ще не відкрита.»; the button under it is «Завершити реєстрацію». |
| "Signed in as {email}, the owner." and the bold fallback "the owner" | SignInPage's owner panel | (see above) | Ви увійшли як {email} — власник.; fallback власник | The glossary's form; with the fallback it reads «Ви увійшли як власник — власник.» for a moment, as the English does. |
| "This browser is signed in as {email}." (the browser, not the person, holds a sign-in) | SignInPage's known block; Register's box | — | У цьому браузері виконано вхід як {email}. | As uk/register.js. |
| "Not you? Sign out"; "New here? {register}" | SignInPage's text buttons | (see above) | Це не ви? Вийти; Уперше тут? {register} | The glossary's pieces joined; {register} is the link «Зареєструватися». |
| "Forgot it?" (the small button beside the Password label) | SignInPage | (see above) | Забули? | The glossary's form; the label «Пароль» beside it says what was forgotten. |
| "If {email} has an account, a link to choose a new password is on its way." | SignInPage's reset note | (see above) | Якщо на {email} є обліковий запис, посилання для вибору нового пароля вже надіслано. | «якщо … є» keeps the conditional: the page never says who has an account; «вже надіслано» for "is on its way". |
| "Enter your e-mail first; the link goes there." | SignInPage, "Forgot it?" with an empty e-mail | (see above) | Спершу введіть електронну пошту — посилання надійде туди. | The semicolon becomes a dash. |
| "Open {product}" ({product} = Field or Atlas) | SignInPage's signed panel | (see above) | Відкрити {product} | common.js's «Відкрити Field» / «Відкрити Atlas» with the name as the hole. |
| the sign-in (Firebase's code the page downloads): "is still loading" / "could not be downloaded"; "That sign-in has ended." | LOADING, NOT_LOADED, SIGN_IN_ENDED | (see above) | Вхід ще завантажується. / Не вдалося завантажити вхід.; Цей сеанс завершився. | As uk/register.js; «сеанс» for a remembered sign-in that is no longer valid. |
| "Check your connection"; "reload the page"; "the Google window was closed" | the network and pop-up errors | (see above) | Перевірте зʼєднання; перезавантажте сторінку; Вікно Google закрито (no «було») | As uk/register.js. uk/owner.js has «Перевірте підключення», «було закрито» and «спливні вікна» for the same English; the glossary's «спливаючі вікна» is used here. One set to settle in review. |
| "this address" (the website's domain, in "Google sign-in is not switched on for this address yet") | Firebase auth/unauthorized-domain | (see above) | на цьому сайті | Under an e-mail form «ця адреса» reads as the e-mail address, so the site is named instead: «Вхід через Google на цьому сайті ще не увімкнено. Увійдіть натомість через електронну пошту і пароль.» uk/register.js has «для цієї адреси»; to settle in review. |
| "does not look right"; "do not match" (e-mail and password); "already has an account" | the e-mail and password checks | (see above) | Схоже, ця адреса електронної пошти неправильна.; Ця електронна пошта і пароль не збігаються.; Для цієї електронної пошти вже є обліковий запис. | As uk/register.js. «Неправильна електронна пошта або пароль.» would be the more idiomatic form of "do not match" with the same vagueness; to settle in review. |
| "Keep the e-mail to {n} characters or fewer." | emailProblem | (see above) | Адреса електронної пошти має бути не довшою за {n} символ · символи · символів (a function entry) | «не довшою за» + accusative keeps the numeral's ordinary forms (120 символів, 121 символ, 122 символи). |

## Added by globe

The Chinese column; the uk translator of the globe adds its own. The globe's dates and status lines are composed from keys, so the Chinese shape is given here as it comes out on the page.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| alert (a GDACS alert); red / orange / green alert | EarthGlobe's status lines, legend ("Disaster alerts" = 灾害预警) | 预警；红色预警 / 橙色预警 / 绿色预警 | — | GDACS is 全球灾害预警与协调系统 in Chinese, so 预警 is its own word. The colour key gives 红色 and the status key appends 预警 with no space: "{kind}，{level}预警，{date}至今". |
| the kind of an alert of a kind the globe does not know ("Alert" as a kind) | globeMath.js kindWord fallback | 灾害 | — | "Alert, red alert since …" would be 预警，红色预警…; the kind is said as 灾害 (the event) so the line reads 灾害，红色预警，… |
| "{kind} since {date}" (still going on); "from {date}, now over"; "now over" | status lines | {kind}，{date}至今；始于 {date}，已结束；已结束 | — | 至今 carries "since … and still going". A war the list knows only by its year ("2015") comes out as 2015至今 with no 年 and no space: a limit of sinceText in globeMath.js, not of the dictionary. |
| ", GDACS." (the source closing the card's status line) | the card's meta line | （GDACS）。 | — | In brackets: 风暴，红色预警，2026 年 10 月 26 日至今（GDACS）。 |
| dates composed from the month keys: "{month} {year}", "{day} {month} {year}", spans | globeMath.js sinceText, dayMonthYear, spanText | 月 keys give "10 月"; {year} 年 {month}; {year} 年 {month} {day} 日; {year} 年 {month} {day} 日至 {day2} 日; …日至 {month2} {day2} 日; {from}至 {to} | — | 2022 年 2 月; 2026 年 10 月 22 日; 2026 年 10 月 22 日至 25 日; 2026 年 7 月 31 日至 9 月 27 日; 2025 年 12 月 21 日至 2026 年 10 月 29 日. |
| counting the groups: "{n} armed conflicts", "{n} disaster alerts" | the list's group headings | {n} 起武装冲突；{n} 条灾害预警 | — | Measure words 起 (incidents) and 条 (alerts); Chinese needs no function entry. |
| the 17 reviewed conflicts' names | worldData.js WAR_NAMES | 乌克兰战争；苏丹战争；加沙战争；缅甸内战；刚果（金）东部的战斗；萨赫勒中部的叛乱；索马里冲突；也门战争；叙利亚冲突；埃塞俄比亚阿姆哈拉州的战斗；南苏丹的战斗；尼日利亚北部的叛乱与匪患；莫桑比克德尔加杜角的叛乱；海地的武装帮派暴力；巴基斯坦西北部的叛乱；对黎巴嫩南部的空袭；哥伦比亚的武装团体 | — | "War in X" → X战争; "Conflict in X" → X冲突; "Fighting in" → 的战斗 (the glossary's 战斗); "Insurgency" → 叛乱; "banditry" → 匪患; "Strikes on" → 空袭 (the strikes are mostly from the air; to settle in review). DR Congo → 刚果（金）; Amhara → 阿姆哈拉州; Cabo Delgado → 德尔加杜角. |
| terracotta dots / amber dots (the two colours of dots, read aloud) | the canvas's aria-label | 赭红色的点 / 琥珀色的点 | — | |
| "farm and food imports"; "The share of each country's farm and food imports that come from {from}" | the card's small print under the countries | 农产品和食品进口；各国农产品和食品进口中来自{from}的份额 | — | {from} is a Chinese country name from the browser, so no space around the hole. "in {year} unless a year is given" → 除另有标注年份外，均为 {year} 年数据. |
| "{name} ({year})" (a country whose figure is from another year) | the card's country list | {name}（{year} 年） | — | 黎巴嫩（2022 年）: the 年 makes it Chinese (the dictionary test wants a Chinese character in the value, and full-width brackets are not one). |
| "this country" (the stand-in for a nameless event's country) | globeMath.js cardText | 该国 | — | |
| "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it ({month})." | Ukraine's card | Chernozem 测得 {ha}公顷黑土严重损毁，这些土地上住着 {people}人（{month}）。 | — | {ha} and {people} arrive from the browser as 178万 and 120万 (Intl, zh-CN), so no space before 公顷 and 人. |
| public domain; "Land and borders"; "modified" (the data was changed); "live" (updated as it happens) | the sources line | 公有领域；陆地和边界；经修改；实时更新 | — | 实时更新 as common.js says for "as they happen". |
| NASA Blue Marble; Natural Earth; OpenLandMap USDA great groups | the sources line's link texts | NASA“蓝色弹珠”；Natural Earth 地图数据；OpenLandMap 的 USDA 土壤大类 | — | Names glossed so the value has Chinese in it; 蓝色弹珠 is the usual Chinese name of NASA's picture. |
| "a list reviewed by hand on {date}"; the hidden stand-in "on {date}" | the sources line | 人工审核的清单，审核日期 {date}；审核日期 {date} | — | From common.js's 人工审核清单 ("Reviewed list"). |
| World Bank; "Who buys whose food" | the sources line | 世界银行；谁在买谁的粮食 | — | As common.js's WORLD_SOURCES sentence. |
| "What the colours show" (the legend's name); "Whole Earth" (tooltip) | the legend; the zoom bar | 颜色的含义；整个地球 | — | |
| "Two fingers move the zoomed Earth."; "Scroll to zoom. Esc to let the page scroll." | the hints on the globe | 放大后，用两指移动地球。；滚动以缩放。按 Esc 恢复页面滚动。 | — | |

## Added by home (Українська)

The Ukrainian column of the terms the About page needed beyond the glossary. Appended by the uk translator of HomePage, ScrollStory, FieldRowStates and ProofTable; the zh column is left to the zh translator.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Chernozem solves the problem of that harm going unseen." | the hero's bold line | — | Chernozem розвʼязує проблему шкоди, якої ніхто не бачить. | шкода for "harm"; "going unseen" → якої ніхто не бачить. |
| clear sky (the field row's meta line) | FieldRowStates | — | безхмарно | One word, as a weather report; pairs with the glossary's безхмарний прохід. |
| spent artillery shell casings | the photograph beside Why | — | стріляні артилерійські гільзи | гільза for a casing; стріляні = already fired. |
| reads low (the app's figure is below the official one) | ProofTable, Pakistan row | — | (занижено) | In brackets after the two figures, as the English. |
| Esri's light grey canvas (the basemap's name) | the small print | — | світло-сіра основа Esri | The words translated, Esri kept. |
| Year / What / Compared with / Result | ProofTable's headers | — | Рік / Що / Порівняно з / Результат | One or two words each. |
| The row's state (aria-label of the three state buttons) | FieldRowStates | — | Стан рядка | |
| "Checked against" / "the record" as two lines | About's proof heading | — | Перевірено / за незалежними даними | The glossary's «Перевірено за незалежними даними» split after the first word, so the second line carries the whole phrase «за незалежними даними». |
| USDA Cropland Data Layer (a table cell; needs Cyrillic) | ProofTable | — | USDA Cropland Data Layer (карта культур) | The name in Latin, the glossary's карта культур as the gloss. |
| "likely" (the app's confidence label, quoted) | ProofTable, North Dakota row | — | «ймовірно» | |
| Result cells start with a capital | ProofTable | — | Виміряно 12 151 га; офіційно 12 600 га / Рангова кореляція 0,8 | The glossary's words; capitalised like the other cells of the table («Повінь у Фессалії»), where the English keeps "rank correlation" lowercase. |
| the top areas (the first in the ranking) | the What picture's alt, the Atlas report step | — | найперші території | As the ranking's «10 найперших». |
| Pick a country, a region or a box (a step title, kept under 34 characters) | the Atlas story | — | Країна, регіон або прямокутник | The imperative «Виберіть країну, регіон або прямокутник» is 39 characters, too long for the progress row. |
| you keep yours (the farmer picks the found fields that are theirs) | the Field story, step 2 | — | ви вибираєте свої | Not «залишаєте» (reads as leaving them behind). |
| in Mykolaiv (the square of the alt text; a square is 18 × 28 km, so the oblast) | the Atlas story, step 3 alt | — | у Миколаївській області | |

## Added by globe (Українська)

The Ukrainian column of the rows under "## Added by globe" above, plus the terms only the Ukrainian needed. Appended by the uk translator of the globe (EarthGlobe.jsx, globeMath.js, worldData.js); the zh column is left to the rows above. The globe's dates and status lines are composed from keys, so the Ukrainian shape is given as it comes out on the page.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| alert (a GDACS alert); red / orange / green alert | EarthGlobe's status lines, legend ("Disaster alerts" = Сповіщення про лиха) | (see above) | сповіщення (the legend, the counts); червоний / помаранчевий / зелений рівень небезпеки (the status lines) | Said as Ukrainian weather warnings are («помаранчевий рівень небезпеки»); the colour keys are masculine, agreeing with рівень. "Storm, red alert since 26 October 2026" → Шторм, червоний рівень небезпеки з 26 жовтня 2026 р. |
| "Alert" as a kind (an alert of a kind the globe does not know) | globeMath.js kindWord fallback | (see above) | Сповіщення | «Сповіщення, червоний рівень небезпеки з …». |
| "{kind} since {date}" (a war); "from {date}, now over"; "now over" | status lines | (see above) | {kind} з {date} (a function: «із» before a month starting with с or з, and a bare year takes «р.»: Збройний конфлікт з 2015 р.); з {date}, уже знято; уже знято | знято = the level was lifted; impersonal, so it agrees with nothing. The card's war line ends with the date's own «р.», no second full stop. |
| ", GDACS." (the source closing the card's status line) | the card's meta line | (see above) | , GDACS. | As the English, after the date: Шторм, червоний рівень небезпеки з 26 жовтня 2026 р., GDACS. |
| dates composed from the month keys: "{month} {year}", "{day} {month} {year}", spans | globeMath.js sinceText, dayMonthYear, spanText | (see above) | the twelve months in the genitive (січня … грудня); {month} {year} р.; {day} {month} {year} р.; з {day} по {day2} {month} {year} р.; з {day} {month} по {day2} {month2} {year} р.; з {from} по {to} | з лютого 2022 р.; 26 жовтня 2026 р.; з 22 по 25 жовтня 2026 р.; з 31 липня по 27 вересня 2026 р.; з 21 грудня 2025 р. по 29 жовтня 2026 р. The span carries its own «з … по», so the status sentence adds nothing before it («рівень небезпеки {span}»); a bare «{from} – {to}» has no Cyrillic for the dictionary test. |
| counting the groups: "{n} armed conflicts", "{n} disaster alerts" | the list's group headings | (see above) | {n} збройний конфлікт · збройні конфлікти · збройних конфліктів; {n} сповіщення про лихо · сповіщення про лиха · сповіщень про лиха (function entries); 1 збройний конфлікт; 1 сповіщення про лихо | 2 збройні конфлікти, 17 збройних конфліктів, 21 збройний конфлікт; 3 сповіщення про лиха, 11 сповіщень про лиха. |
| the 17 reviewed conflicts' names | worldData.js WAR_NAMES | (see above) | Війна в Україні; Війна в Судані; Війна в Газі; Громадянська війна в Мʼянмі; Бойові дії на сході ДР Конго; Повстання в центральному Сахелі; Конфлікт у Сомалі; Війна в Ємені; Конфлікт у Сирії; Бойові дії в Амхарі, Ефіопія; Бойові дії в Південному Судані; Повстання й бандитизм на півночі Нігерії; Повстання в Кабу-Делгаду, Мозамбік; Насильство збройних банд на Гаїті; Повстання на північному заході Пакистану; Удари по півдню Лівану; Збройні угруповання в Колумбії | "Insurgency" → Повстання (Ukrainian Wikipedia's word for an ongoing insurgency: «Повстання в Кабу-Делгаду»; «повстанський рух» is more exact but too long beside a dot); "Fighting in" → Бойові дії (the glossary); "Strikes on" → Удари по; "Armed gang violence" → Насильство збройних банд; "Armed groups" → Збройні угруповання. DR Congo → ДР Конго; на Гаїті, as the island. |
| terracotta dots / amber dots (the two colours of dots, read aloud) | the canvas's aria-label | (see above) | теракотові точки / бурштинові точки | |
| "farm and food imports"; "The share of each country's farm and food imports that come from {from}, in {year} unless a year is given." | the card's small print under the countries | (see above) | сільськогосподарський та продовольчий імпорт; Частка сільськогосподарського та продовольчого імпорту кожної країни, яку постачає {from}, за {year} рік, якщо не вказано інший. | {from} is a country's name from the browser in the nominative (Україна) and cannot be declined after «з», so the clause makes it the subject: «яку постачає {from}». |
| "{name} ({year})" (a country whose figure is from another year) | the card's country list | (see above) | {name} ({year} р.) | Ліван (2022 р.): the usual form, and the «р.» gives the value its Cyrillic for the dictionary test. |
| "this country" (the stand-in for a nameless event's country) | globeMath.js cardText | (see above) | ця країна | Nominative, the subject of «яку постачає». |
| "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it ({month})." | Ukraine's card | (see above) | Chernozem виміряв {ha} га сильно пошкоджених чорноземів, на яких живе {people} людей ({month}). | {ha} and {people} arrive from the browser as «1,78 мільйона» and «1,2 мільйона» (Intl, uk-UA), so the genitive plural «людей» follows; {month} is common.js's «вересень 2026». |
| public domain; "Land and borders"; "modified" (the data was changed); "live" (updated as it happens) | the sources line | (see above) | суспільне надбання; Суходіл і кордони; зі змінами; у реальному часі | у реальному часі as common.js says for "as they happen". |
| NASA Blue Marble; Natural Earth; OpenLandMap USDA great groups; (Hengl and Nauman, 2018) | the sources line's link texts and the authors | (see above) | «Блакитна кулька» NASA; дані Natural Earth; великі групи ґрунтів USDA з OpenLandMap; (Hengl і Nauman, 2018) | «Блакитна кулька» is the picture's Ukrainian name (Wikipedia); the authors stay in Latin, as in a citation. |
| "a list reviewed by hand on {date}"; the hidden stand-in "on {date}" | the sources line | (see above) | Збройні конфлікти: список, перевірений вручну {date}.; the stand-in is the date alone (a function entry) | A date after «перевірений вручну» takes no preposition, so the stand-in that holds its width has no word to add; a function entry, because a bare «{date}» has no Cyrillic for the dictionary test. |
| World Bank; "Who buys whose food" | the sources line | (see above) | Світовий банк; Хто купує чиє продовольство: Світовий банк, {link}; останній рік, за який звітувала кожна країна ({years}). | As common.js's WORLD_SOURCES sentence. |
| "What the colours show" (the legend's name); "Whole Earth" (tooltip) | the legend; the zoom bar | (see above) | Що означають кольори; Вся Земля | |
| "Two fingers move the zoomed Earth."; "Scroll to zoom. Esc to let the page scroll." | the hints on the globe | (see above) | Збільшену Землю рухайте двома пальцями.; Прокручуйте, щоб масштабувати. Esc — щоб прокручувати сторінку. | The glossary's «Прокручуйте, щоб масштабувати». |
| "See them all as a list" / "Hide the list" / "Close the list"; "Today's armed conflicts and disaster alerts" (the list dialog's name) | the list under the globe | — | Показати всі списком / Сховати список / Закрити список; Сьогоднішні збройні конфлікти й сповіщення про лиха | The first two as the glossary. |
| "The Earth today: where the black soil lies, today's armed conflicts and disaster alerts, and whose food depends on their land" (the figure's hidden title) | EarthGlobe's screen-reader title | — | Земля сьогодні: де лежать чорноземи, сьогоднішні збройні конфлікти й сповіщення про лиха, і чиє продовольство залежить від тих земель | «тих земель» = the land of those conflicts and alerts. |
| "Today's conflicts and alerts could not be loaded." | the line when the feed fails | — | Не вдалося завантажити сьогоднішні конфлікти й сповіщення. | The glossary's «Не вдалося …». |

## Added by contact (中文 review)

Two forms in the Contact rows above were settled by the zh reviewer; the dictionary (src/site/i18n/zh/contact.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Who you are" (the legend over the five choices) | ContactPage | 您的身份（可选） | (unchanged) | The UI-words row gives 您是谁, which is the blunt question "who are you?" and not how a Chinese form labels a role picker; 您的身份 is the usual label over choices like 农户 / 企业 / 研究人员. |
| "Send the message" (the submit button) | ContactPage | 发送留言 | (unchanged) | The UI-words row says 发送消息, but the Contact rows and every sentence on the page say 留言 for the message (留言会发到…, 您的留言已收到, 留言未能发送, the label 留言); the button keeps the same word. |

## Added by contact (Українська review)

Four renderings in "## Added by contact (Українська)" above were revised by the uk reviewer; the dictionary (src/site/i18n/uk/contact.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Write to Chernozem" (the h1) | ContactPage | (unchanged) | Напишіть у Chernozem | The glossary's «Напишіть Chernozem» can be read as "write the word Chernozem", since the undeclined name shows no dative; «у» marks the addressee, as «Зареєструватися в Chernozem» does. «Напишіть нам» stays for "Write to us". |
| "Send another" (the button after the thank-you) | ContactPage | (unchanged) | Надіслати ще одне | «Надіслати ще» alone invites the reading «ще раз» (resend); «ще одне» says another message, and is still three words. |
| "Which country or region, …" / "Which farmland or supply region, …" (two prompts) | ContactPage | (unchanged) | Яка країна чи який регіон …; Які сільгоспугіддя чи який регіон постачання … і що вам потрібно про них знати? | «Яка країна або регіон» and «Які сільгоспугіддя або регіон» left the second noun without an agreeing pronoun; each noun gets its own. "about it" was dropped and «саме» added; «про них» restores it. |

## Added by labs (中文 review)

Three renderings in "## Added by labs" above were revised by the zh reviewer; the dictionary (src/site/i18n/zh/labs.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Move its NDVI and NDWI against their normal" / "Move its feasibility" (changing a slider's value in the two labs' instructions) | ConditionLab, GateLab | 调整它的 NDVI 和 NDWI 相对正常值的高低 / 调整它的可行性 | (unchanged) | 移动 moves a thing in space (the glossary's 移动滑块 moves the slider itself); a value is 调整. 高低 (how far above or below) is the plain word for the signed difference the slider sets; 偏差 is a statistics term. |
| "watch what the two time frames do with it" | GateLab's instruction | 看两个时段各自怎样对待它 | (unchanged) | 处理 reads as a computer processing a task; 对待 is how one treats something, the English's own figure. |
| "priority of this place, at every feasibility" (legend) | GateLab | 这个地点在不同可行性下的优先级 | (unchanged) | 在不同……下 is the idiom for "at every value of"; 各个可行性下 is word order from the English. |

## Added by owner (中文 review)

The zh reviewer of OwnerPage aligned the error sentences that the owner, Register and Sign-in pages share to the wording zh/register.js and zh/signin.js already agree on; the rows under "## Added by owner" above that say otherwise are superseded by these.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| the Google window; pop-ups; "The Google window was closed before you signed in. Try again."; "The browser blocked the Google window. Allow pop-ups for this site and try again." | owner, register, signin | Google 窗口；弹出窗口；Google 窗口在您登录前被关闭了。请重试。；浏览器拦截了 Google 窗口。请允许本网站的弹出窗口，然后重试。 | (unchanged) | As zh/register.js and zh/signin.js (two of the three), not the earlier Google 登录窗口 / 弹出式窗口. |
| "Check your connection and try again."; "Wait a few minutes and try again."; "The sign-in is still loading." | owner, register, signin | 请检查网络连接并重试。；请等几分钟再试。；登录功能还在加载。 | (unchanged) | 并重试 / 再试 / 加载 (no 中), as zh/register.js and zh/signin.js. |
| "This Google account is not the owner’s." | OwnerPage's refusal | 这个 Google 账户不属于所有者。 | (unchanged) | 不属于 is the written form; 不是所有者的 reads as speech. |
| could not check the sign-in | OwnerPage bad_token (its own English sentence) | 我们的服务器无法验证这次登录。 | (unchanged) | Kept 验证 (the usual word for a sign-in token); zh/register.js says 核验 for its differently worded sentence. Left for a cross-page reviewer. |

## Added by method

Terms the Methodology page (pages/MethodPage.jsx, components/Walkthrough.jsx, components/Film.jsx) needed that the glossary lacked, or where a glossary example had to be shaped for the page. Appended by the zh translator; the uk column is left to the uk translator.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "How to use it." (the bold label above the five steps) | MethodPage, the Field part | 使用方法。 | — | |
| "What it reads." / "What it reads:" / "What it cannot see." / "What it cannot do." (bold lead-ins; "it" = Field or Atlas) | MethodPage | 它读取什么。/ 它读取什么：/ 它看不到什么。/ 它做不到什么。 | — | Parallel questions, as the English. |
| "Built with:" (bold lead-in before the stack) | MethodPage, Behind it | 用什么构建： | — | Parallel to 它读取什么：. |
| "Four readings." / "The condition." / "The gate." / "Ukraine, ranked." (bold lead-ins) | MethodPage | 四项读数。/ 状况。/ 门控。/ 乌克兰的排序。 | — | |
| "Finding the fields" / "The crop" / "Damage on a field" (dt labels of the how-it-is-found list) | MethodPage, the Field part | 找出田块 / 作物 / 田块损毁 | — | |
| clear at 0.6 or more (Cloud Score+'s threshold for a clear pixel) | MethodPage, Four readings | 0.6 或以上算无云 | — | |
| the median; "the middle of the three years" | MethodPage, Four readings | 中位数；这三年的中间值 | — | 中位数 for the statistic; the plain 中间值 where the English itself says "the middle". |
| the passes at least half clear (the passes harvest timing uses) | MethodPage, Four readings | 田块至少一半无云的那些过境 | — | "at least half" → 至少一半; "at least {percent}%" → 至少 {percent}% fills the same hole. |
| "ready" (the harvest formula's left side); share (the crop's ready share); peak (the season's peak NDVI) | MethodPage, Harvest timing | 可收获；比例；峰值 | — | The formula reads 可收获 = 0.2 + 比例·(峰值 − 0.2). Formulas keep ASCII brackets and operators. |
| field median (the middle NDVI over the field) | MethodPage, the stress rule | 田块中位数 | — | |
| "each held between 0 and 1" (the two scores are clamped) | MethodPage, the scores' formulas | 两者都限定在 0 到 1 之间 | — | |
| "{label} under {upTo}" / "{label} above" (the items of the classes list) | MethodPage, The condition | {upTo} 以下为“{label}” / 再往上为“{label}” | — | Class names in “ ”, as labs.js writes 等级不会达到“很好”. Intl.ListFormat joins the items with 、 and 和 before the last. |
| Canny edges (the edge-detection algorithm) | MethodPage, Finding the fields | Canny 边缘检测 | — | Canny stays (a name). |
| shared area ÷ combined area (intersection over union, the overlap 0.805) | MethodPage, Finding the fields | 重叠面积 ÷ 合并面积 | — | Plain words, not 交并比. |
| the red-edge gap (the gap between NDVI and NDRE the crop classifier uses) | MethodPage, The crop | 红边差值 | — | |
| “likely” (the app's own word when it is confident about a crop) | MethodPage, The crop | “很可能” | — | |
| a pace factor (post-crisis, feasibility sets how fast recovery can go rather than excluding) | MethodPage, The gate | 节奏因子 | — | |
| faded in over the ramp above the cutoff; below it, left out (the near-term formula's tail) | MethodPage, The gate | 在阈值之上宽 0.2 的渐变区内逐步生效；阈值以下排除 | — | 阈值 and 渐变区 as the glossary. |
| a line between look-alike fields (what Field cannot see) | MethodPage, What it cannot see | 长得一样的相邻田块之间的分界线 | — | |
| the condition key (the colour legend for field condition) | MethodPage, the phone picture's alt | 状况图例 | — | |
| the top ten (areas), in the Atlas picture's alt and caption | MethodPage, the opening | 排名前十的地区；前十名 | — | |
| "Chapters of {title}" (the chapter list's aria-label) | Walkthrough.jsx, Film.jsx | “{title}”的章节 | — | Quotes, so a title that ends in a Latin name (三分钟了解 Chernozem) keeps the spacing rule. |
| the walkthroughs' chapters: The farm / Weather / Fields / Data / The assistant / Settings / The overview / The map / Weights and the cutoff / A place's details / The report | walkthroughs.json | 农场 / 天气 / 田块 / 数据 / 助手 / 设置 / 概览 / 地图 / 权重与阈值 / 地点详情 / 报告 | — | The glossary's page names without 页, as it says for a chapter label alone. |
| the film's chapters: Northeastern China / How it reads the land | Film.jsx FILM_CHAPTERS | 中国东北 / 它如何读取土地 | — | |
| "{code}, and {data}." (two linked clauses made one sentence) | MethodPage, Behind it | {code}，而{data}。 | — | 而 joins the clauses: 代码在 GitHub 上公开，而研究数据和代码在 Harvard Dataverse 上。 |
| "Accounts run on Firebase (Google, or e-mail and password)" | MethodPage, the privacy paragraph | 账户由 Firebase 管理（Google，或电子邮件加密码） | — | |
| "The demo is open to everyone and read-only." | MethodPage, the close | 演示对所有人开放，且为只读。 | — | |

## Added by ranking (中文 review)

Three renderings in the main table and "## Added by ranking" above were revised by the zh reviewer; the dictionary (src/site/i18n/zh/ranking.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Not ranked" (the tooltip's fallback); Crimea's note "Not ranked, as in the research paper: …"; the footnote "{names} is not ranked, as in the research paper (occupied since 2014)." | DemoRanking | 未排名；未排名，与研究论文一致：自 2014 年被占领，不在乌克兰农业统计之内。；{names}未排名，与研究论文一致（自 2014 年被占领）。 | (unchanged) | The main table's 未排序 says a list is unsorted; of a place with no rank a reader says 未排名, the same 排名 as "rank" in 相对近期排名的变化. 排序 stays for "ranking" everywhere else in the unit (实时排序, 近期排序, 回到排序中). |
| "No gate: all three scores are blended, so the land left out comes back: {list}." | DemoRanking's post-crisis note | 无门控：三项得分综合计算，因此近期暂不纳入的土地回到排序中：{list}。 | (unchanged) | 因此 restores the English "so"; 重新回到 doubled the verb. |
| "{ha} ha heavily damaged" with compactHa's "178万" | DemoRanking's tooltip line | 178 万公顷严重损毁 (a space between the digits and 万, none before 公顷); 323,756 公顷严重损毁 | (unchanged) | The dictionary's function entry adds the space the glossary's rule 3 asks for; Intl writes 178万 without it. |

## Added by method (Українська)

The Ukrainian column of the rows under "## Added by method" above, plus the terms only the Ukrainian needed. Appended by the uk translator of the Methodology page (src/site/i18n/uk/method.js: pages/MethodPage.jsx, components/Walkthrough.jsx, components/Film.jsx); the zh column is left to the rows above.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "How to use it." (the bold label above the five steps) | MethodPage, the Field part | (see above) | Як користуватися. | |
| "What it reads." / "What it reads:" / "What it cannot see." / "What it cannot do." (bold lead-ins; "it" = Field or Atlas) | MethodPage | (see above) | Що він читає. / Що він читає: / Чого він не бачить. / Чого він не може. | «він» = the product (masculine, as Chernozem / Field / Atlas are read). |
| "Built with:" (bold lead-in before the stack) | MethodPage, Behind it | (see above) | Збудовано на: | «Збудовано на: React 19, Node.js, … і Vite.» |
| "Four readings." / "The condition." / "The gate." / "Ukraine, ranked." (bold lead-ins) | MethodPage | (see above) | Чотири показники. / Стан. / Шлюз. / Україна, ранжована. | The glossary's показник, стан, шлюз. |
| "Finding the fields" / "The crop" / "Damage on a field" (dt labels) | MethodPage, the Field part | (see above) | Пошук полів / Культура / Пошкодження поля | |
| clear at 0.6 or more (Cloud Score+'s threshold for a clear pixel) | MethodPage, Four readings | (see above) | чистий від {score} | The number keeps the code's point (0.6). |
| the median; "the middle of the three years" | MethodPage, Four readings | (see above) | медіана; медіана за три роки | By function: 1 рік, 2–4 роки, 5+ років. |
| the app's labels Below normal / Above normal | MethodPage, Four readings | — | «Нижче норми» / «Вище норми» | The glossary's нижче норми / вище норми, in « » as app labels. |
| the passes at least half clear (the passes harvest timing uses) | MethodPage, Four readings | (see above) | проходи, чисті щонайменше наполовину; "at least {percent}%" → щонайменше на {percent} % | Both fill the same hole after «чисті». |
| near-infrared; short-wave infrared; red (the bands of the formulas) | MethodPage, the readings | — | ближній інфрачервоний; короткохвильовий інфрачервоний; червоний | |
| "ready" (the harvest formula's left side); share; peak | MethodPage, Harvest timing | (see above) | готове; частка; пік | The formula reads готове = 0.2 + частка·(пік − 0.2). |
| row crops, short, after the glossary's «просапні культури» | MethodPage, Harvest timing | — | просапні | «частка 0.25 для зернових і ріпаку, 0.35 для просапних». |
| the formula variables condition / health score / water score / stressed | MethodPage, the condition's formulas | — | стан / оцінка здоровʼя / оцінка води / стрес | Lowercase, as the English; «стрес = NDVI < …» is the rule that makes a pixel stressed. |
| field median; normal (in a formula) | MethodPage, the stress rule, the scores | (see above) | медіана поля; норма | «NDVI < медіана поля − 0.10», «1 + (NDVI − норма) / 0.3». |
| "each held between 0 and 1" (the two scores are clamped) | MethodPage, the scores' formulas | (see above) | кожна в межах від 0 до 1 | оцінка is feminine: кожна. |
| "{label} under {upTo}" / "{label} above" (the items of the classes list) | MethodPage, The condition | (see above) | {label} нижче {upTo} / {label} вище цього | Intl.ListFormat joins them: «Поганий нижче 0.40, Задовільний нижче 0.65, Добрий нижче 0.85 і Дуже добрий вище цього». |
| holds it under {class} (high stress, damage) | MethodPage, The condition | — | тримає його нижче за «{class}» | The same shape as labs' «Високий стрес: нижче за «{top}».»; the class name in « ». |
| Canny edges (the edge-detection algorithm) | MethodPage, Finding the fields | (see above) | контури Canny | Canny stays (a name): «Контури Canny на шести знімках Sentinel‑2 …». |
| in six Sentinel-2 pictures; in at least two growing seasons (small counts the English writes in words) | MethodPage, Finding the fields; Damage on a field | — | на шести знімках; щонайменше у двох вегетаційних сезонах | A function writes 1–10 in the locative in words (одному, двох, трьох … десяти); larger numbers stay digits. |
| overlap hand-drawn outlines by 0.805 | MethodPage, Finding the fields | — | перекривають накреслені вручну контури на 0.805 | The glossary's накреслений вручну. |
| shared area ÷ combined area (intersection over union) | MethodPage, Finding the fields | (see above) | (спільна площа ÷ сумарна площа) | |
| the red-edge gap (the crop classifier's clue) | MethodPage, The crop | (see above) | розрив червоного краю | On the glossary's червоний край. |
| “likely” (the app's own word when it is confident about a crop) | MethodPage, The crop | (see above) | «імовірно» | |
| both are needed (radar change and fire) | MethodPage, Damage on a field | — | потрібні обидві | Both nouns feminine (радарна зміна, пожежа). |
| a pace factor (post-crisis feasibility) | MethodPage, The gate | (see above) | чинник темпу | «доступність стає чинником темпу». |
| faded in over the ramp above the cutoff; below it, left out (the near-term formula's tail) | MethodPage, The gate | (see above) | плавно наростає в перехідній зоні {ramp} над порогом; нижче порога — виключено | The glossary's перехідна зона, поріг, виключено. |
| a line between look-alike fields (what Field cannot see) | MethodPage, What it cannot see | (see above) | межа між схожими полями | |
| the condition key (the colour legend for field condition) | MethodPage, the phone picture's alt | (see above) | легенда стану | |
| the top ten (areas), in the Atlas picture's alt and caption | MethodPage, the opening | (see above) | десять найперших територій; десять найперших | As the glossary's «10 найперших із 24 областей». |
| make the priority (value and damage); counts as fully feasible (100 km) | MethodPage, Three scores; Feasibility | — | складають пріоритет; вважається повністю доступним | |
| the real {month} reading of {n} squares; the top of the list for each time frame | MethodPage, Ukraine ranked | — | Реальні дані за {month} для {n} квадратів; верхівка списку для кожного періоду | By function after «для» (genitive): 1 квадрата, otherwise квадратів; {n} arrives formatted (1 176). |
| {count} open datasets, each read against its own normal years | MethodPage, Behind it | — | {list} — {count} відкритих наборів даних, кожний читається проти своїх нормальних років | By function: 1 відкритий набір даних, 2–4 відкриті набори даних, 5+ відкритих наборів даних. |
| More than {tests} automated tests | MethodPage, Behind it | — | Понад {tests} автоматичних тестів | {tests} is rounded down to a hundred, so «тестів» always fits. |
| "Accounts run on Firebase (Google, or e-mail and password)"; the contact page | MethodPage, the privacy paragraph | (see above) | Облікові записи працюють на Firebase (Google або електронна пошта з паролем); сторінка «Контакти» | The menu word in « », as demo's «Про нас». |
| "{code}, and {data}." (two linked clauses made one sentence) | MethodPage, Behind it | (see above) | {code}, а {data}. | Код відкритий на GitHub, а дані й код дослідження — на Harvard Dataverse. |
| "The demo is open to everyone and read-only." | MethodPage, the close | (see above) | Демо відкрите для всіх і лише для перегляду. | The glossary's відкрите для всіх, лише для перегляду. |
| "Chapters of {title}" (the chapter list's aria-label) | Walkthrough.jsx, Film.jsx | (see above) | Розділи фільму «{title}» | |
| "Download the film (MP4, 36 MB)" | Film.jsx | — | Завантажити фільм (MP4, 36 МБ) | МБ for MB. |
| the walkthroughs' chapters: The farm / Weather / Fields / Data / The assistant / Settings / The overview / The map / Weights and the cutoff / A place's details / The report | walkthroughs.json | (see above) | Господарство / Погода / Поля / Дані / Помічник / Налаштування / Огляд / Карта / Ваги і поріг / Деталі місця / Звіт | The glossary's page names alone, capitalised as buttons; the app's own buttons as the glossary has them (Розкажіть, що сталося; Змінити господарство; Вибрати територію; Команда і криза). |
| the film's chapters: Northeastern China / How it reads the land | Film.jsx FILM_CHAPTERS | (see above) | Північно-східний Китай / Як він читає землю | The glossary's північно-східний Китай, capitalised as a button. |

## Added by signin (中文 review)

The zh reviewer of SignInPage read every entry of zh/signin.js against the page, the glossary and zh/register.js. The shared Firebase sentences stay as "## Added by owner (中文 review)" settled them (Google 窗口, 弹出窗口, 请检查网络连接并重试, 请等几分钟再试, 登录功能还在加载). One row changes.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "the owner" (the bold fallback for {email} in "Signed in as {email}, the owner." when the server did not name the address) | SignInPage's owner panel | Chernozem 的 Google 账户 | (unchanged) | 所有者 in that hole gave 已登录为 所有者（所有者）。: a space before a Chinese word and the word twice. The owner is the Chernozem Google account (the owner page's 使用 Chernozem 的 Google 账户登录), so the hole now reads 已登录为 Chernozem 的 Google 账户（所有者）。 zh/register.js's "the owner" for {who} has the same shape and could follow. |

## Added by story (中文 review)

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| bombs, landmines and the remnants of war | Story, the first step | 炸弹、地雷和战争留下的残骸 | — | Replaces the row above's 战争的其他残留: 其他 was not in the English, and 残骸 (debris, wreckage) is the plain word for what war leaves in a field. |
| where the name comes from (said once, in the first step) | Story, the first step | （Chernozem 这个名字就取自这种黑土） | — | In full-width brackets right after 黑土 first appears, as an aside, so the sentence about the war is not broken by a comma; 取自 as home.js writes it (名字取自乌克兰和中国东北的黑土). |
| "plant health, water and stress against 2019 to 2021" | Story, Third edition | 与 2019 到 2021 年相比的作物长势、水分和胁迫 | — | The glossary's 与……相比, as home.js and method.js write it; not 相对……的情况. 以及收获时机 stays apart at the end. |
| "grew to work for any soil" | Story, the fourth step | 逐渐适用于任何土壤 | — | Not 管用 (colloquial). "even as everyday monitoring" → 甚至可以用作日常监测. |
| "He built it for Ukraine, then for everyone." | Story, the fourth statement | 他先为乌克兰做出了这个工具，再为所有人。 | — | 这个工具, as the second and third steps call it; 做了它 reads as a translation. |
| "bringing experience from an internship at …" | Story, the fourth step | 他还用上了在北京 ZBDL Land and Resources 实习时的经验 | — | Not 带来了经验 (literal). |

## Added by register (中文 review)

Six renderings in "## Added by register" and the UI-words row above were revised by the zh reviewer; the dictionary (src/site/i18n/zh/register.js) has the forms below. Two of them are sentences the Sign in page shares (zh/signin.js still has the older form); a cross-page reviewer should align them.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Research" (a kind of organisation, one of five radio buttons under 机构类型) | RegisterPage ORG_KINDS | 研究机构 | (unchanged) | Beside 政府 / 非政府组织 / 企业 / 其他, the bare 研究 names an activity, not a body; a Chinese form says 研究机构 (or 科研机构). Four characters, fits two across on a phone. |
| "Sign in instead" (the link after "That e-mail already has an account.") | RegisterPage | 直接登录 | (unchanged) | 改为登录 is "instead" word for word; 直接登录 is what Chinese sign-up forms say in exactly this place (该邮箱已注册，请直接登录). |
| "{n} characters or more" (the password hint); "Use {n} characters or more." (the password error) | RegisterPage | 至少 {n} 个字符；请至少使用 {n} 个字符。 | (unchanged) | "{n} 个字符或更多" copies "or more"; the natural hint is 至少 {n} 个字符, and the error says the same with 请…使用. |
| "Keep the e-mail to {n} characters or fewer."; "That e-mail already has an account." | RegisterPage, SignInPage (shared) | 电子邮件地址请不要超过 {n} 个字符。；这个电子邮件地址已有账户。 | (unchanged) | 电子邮件 alone is the message; the thing with a length or an account is the address, the glossary's 电子邮件地址. zh/signin.js has 电子邮件请不要超过 / 这个电子邮件已有账户 for the same keys: to align. |
| "with its water, plant health, stress and harvest readings" (the large Field picture's alt) | RegisterPage PICTURES.field | 显示其水分、作物长势、胁迫和收获时机四项读数 | (unchanged) | The fourth reading is the glossary's 收获时机 (harvest timing), not 收获; 四项读数 as the glossary's "Field 11 with its four readings". |
| "the top ten areas" (the donor report's alt) | RegisterPage PICTURES.atlas | 排名前十的地区 | (unchanged) | 前十个地区 reads as "the first ten regions"; 排名前十 says they are ranked, as zh/method.js writes it. |

## Added by labs (Українська review)

Reviewed 6 November 2026 against ConditionLab.jsx and GateLab.jsx. Two values changed in src/site/i18n/uk/labs.js; the rest stands as the "## Added by labs (Українська)" section has it.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Move its NDVI and NDWI against their normal …" / "Move its feasibility …" (a value, not a slider, is moved) | the two labs' instructions | (see above) | Змінюйте його NDVI й NDWI відносно норми … / Змінюйте його доступність … | «Посувайте» takes a thing one slides («Посувайте повзунки», as method.js has it); a value is «змінюйте». «й» after the vowel sound that ends NDVI. |
| "the two time frames" (both, already named by the two buttons) | GateLab's instruction | (see above) | обидва періоди | «обидва» is the natural Ukrainian for "the two" when both are known; method.js's twin sentence («що два періоди роблять з одним місцем») is also correct and may stay. |

## Added by signin (Українська review)

Five renderings in "## Added by signin (Українська)" above were revised by the uk reviewer; the dictionary (src/site/i18n/uk/signin.js) has the forms below. The last two are sentences the Register page shares (uk/register.js still has the older forms); the register reviewer may align.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Your fields or your region, as you left them." | SignInPage's lead | (see above) | Ваші поля чи ваш регіон — такі, якими ви їх залишили. | After the dash the nominative «такі»; the state they were left in is instrumental «якими». «такими, як» mixed the two. |
| "If {email} has an account, a link to choose a new password is on its way." | SignInPage's reset note | (see above) | Якщо для {email} є обліковий запис, посилання для створення нового пароля вже надіслано. | «для … є обліковий запис» as in «Для цієї електронної пошти вже є обліковий запис»; «створення нового пароля» is what Ukrainian reset mails say, «вибору пароля» read as a translation. |
| "Enter your e-mail first; the link goes there." | SignInPage, "Forgot it?" with an empty e-mail | (see above) | Спершу введіть адресу електронної пошти — на неї надійде посилання. | «на неї» (the address) for "there"; «туди» was spoken Ukrainian. Same noun phrase as «Введіть адресу електронної пошти». |
| "That e-mail and password do not match." | Register, Sign in (Firebase's refusal of the pair) | (see above) | Неправильна електронна пошта або пароль. | What Ukrainian sign-in forms say; keeps the English's vagueness (either may be wrong). «не збігаються» is said of two password fields that differ. |
| "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead." | Firebase auth/unauthorized-domain | (see above) | Вхід через Google на цьому сайті ще не увімкнено. Натомість увійдіть через електронну пошту і пароль. | «на цьому сайті» (the manifest: "this address" is the domain, not an e-mail); «Натомість увійдіть» in the glossary's order ("Sign in instead"). |

## Added by home (中文 review)

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| rank correlation {rho} (a table cell with the number after it) | ProofTable ROWS[4].result | 等级相关系数 {rho} | — | 等级相关 alone leaves the number hanging; 等级相关系数 0.8 is how Chinese writes the figure. The glossary's 等级相关 stays for the term in prose. |
| "Damage against fighting, Ukraine" (a table cell) | ProofTable ROWS[4].what | 乌克兰：损毁与战斗对照 | — | 损毁对照战斗 read as a verb phrase; 损毁与战斗对照 is the noun phrase a table cell wants. |
| "the people noticed least" | HomePage hero lead | 最不受关注的人 | — | Not 最少被注意到的人 (a passive that reads as translation). The same sentence: 地缘政治和环境局势日益紧张 for "tensions rise". |
| "equipment there is costly" (bringing equipment into a disaster zone) | HomePage WHY[0].text | 设备在那里代价高昂 | — | 那里的设备昂贵 read as "the equipment already there is expensive". |
| "you keep yours" (the farmer picks the found fields that are theirs) | the Field story, step 2 | 您从中选出自己的那些 | — | 您留下属于自己的那些 read as leaving them behind, as the uk reviewer found for залишаєте. |
| "close, for a tool of its kind, but not 100%" | the disclaimer | 就这类工具而言已经很接近了，但不是 100% | — | 接近 needs the 100% that follows to lean on; 已经接近 alone floated. "and know that …" → 并请知悉，… (the register of a disclaimer), not 并且知道. |
| spent artillery shell casings (the photograph's alt) | HomePage PHOTO.alt | 废弃的炮弹壳 | — | 用过的炮弹壳 is not what a Chinese caption says; the caption under it keeps 遗留在田里的炮弹壳. |

## Added by register (Українська review)

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Use {n} characters or more." (the password's minimum) | Register, the password check | (see above) | Пароль має містити щонайменше {n} символ · символи · символів. | Replaces «Використайте щонайменше …»: Ukrainian password errors name the password («Пароль має містити…»), and it is parallel to «Пароль має бути не довшим за …». The hint «{n} символів або більше» stays. |
| "That e-mail and password do not match." | the Firebase table (shown by the Sign in page in practice) | (see above) | Неправильна електронна пошта або пароль. | «не збігаються» is what Ukrainian UIs say when two password fields differ, so it misleads here; «або» keeps the English's vagueness about which one is wrong. uk/signin.js still has «Ця електронна пошта і пароль не збігаються.»: to align there. |
| "this address" in "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead." | Firebase auth/unauthorized-domain | (see above) | Вхід через Google на цьому сайті ще не увімкнено. Натомість скористайтеся електронною поштою і паролем. | «на цьому сайті» as uk/signin.js (under an e-mail form «ця адреса» reads as the e-mail). The second sentence differs from the Sign in page on purpose: there one signs in, here one registers. |
| "An account is free and takes one step." | Register, the lead | (see above) | Обліковий запис безкоштовний — усього один крок. | A dash, not a comma, before the elliptical second part. |

## Added by globe (中文 review)

Four renderings in "## Added by globe" above were revised by the zh reviewer; the dictionary (src/site/i18n/zh/globe.js) has the forms below. Everything else in that section stands.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "{kind} since {date}" / "{kind} since {date}." when the list knows a war only by its year ("2015") | the status line under a war's name, and the card's meta line (Sahel since 2015, Somalia since 2006) | {kind}，{date} 年至今 (a function entry: a bare four-digit date takes 年) | (unchanged: uk already adds «р.») | 2015至今 broke the space rule and dropped 年; it was called a limit of sinceText, but a function entry settles it in the dictionary, as uk/globe.js does: 武装冲突，2015 年至今. A full date is untouched: 战争，2022 年 2 月至今。 |
| Cabo Delgado (Mozambique's province) | WAR_NAMES "Insurgency in Cabo Delgado, Mozambique" | 莫桑比克德尔加杜角省的叛乱 | (unchanged) | 德尔加杜角 alone reads as a cape; the province takes 省, as 阿姆哈拉州 takes 州. |
| "Two fingers move the zoomed Earth." | the phone hint | 放大后，用双指移动地球。 | (unchanged) | 双指 is the word phone interfaces use (双指缩放、双指拖动); 两指 reads as a translation. |
| "Strikes on southern Lebanon" | WAR_NAMES | 对黎巴嫩南部的空袭 (kept) | (unchanged) | Settled: the strikes are air and drone strikes, which Chinese news calls 空袭; 打击 or 袭击 would be vaguer than what the reader expects. The owner may prefer 袭击 if the list ever counts ground strikes. |

## Added by globe (Українська review)

Changes the uk reviewer of the globe made to src/site/i18n/uk/globe.js; the rows under "## Added by globe (Українська)" above stand except where a row here says otherwise.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Alert" as a kind (an alert of a kind the globe does not know) | globeMath.js kindWord fallback | (see above) | Стихійне лихо | Replaces «Сповіщення»: the kind names the event, like Повінь or Шторм, and «Сповіщення, червоний рівень небезпеки» said the word twice. «Стихійне лихо, червоний рівень небезпеки з 26 жовтня 2026 р., GDACS.» |
| "The share of each country's farm and food imports that come from {from}, in {year} unless a year is given." | the card's small print under the countries | (see above) | Частка сільськогосподарського та продовольчого імпорту, яку {from} постачає кожній країні, за {year} рік, якщо не вказано інший. | Replaces «…імпорту кожної країни, яку постачає {from}»: there «яку» read as «країни, яку постачає Україна» (the country Ukraine supplies). With «імпорту» (masculine) beside it, «яку» can only be «Частка». {from} stays the nominative subject. |
| "The real Earth seen from space, turning slowly." | the canvas's first sentence (read aloud) | (see above) | Справжня Земля, як її видно з космосу, повільно обертається. | Replaces «Справжня Земля з космосу, що повільно обертається.», where «що» hung on «космосу». |
| "з" / "із" before a date (the war's status line) | globe.js since() | — | із before с, з, ц, ч, ш, щ (із січня, із серпня, із червня); з elsewhere (з лютого, з 2015 р.) | Was с and з only; the orthography (§ 23) names all six sibilants. |

## Added by method (Українська review)

Renderings in "## Added by method (Українська)" above that the uk reviewer revised; the dictionary (src/site/i18n/uk/method.js) has the forms below.

| English term | where / meaning | 中文 | Українська | note |
| --- | --- | --- | --- | --- |
| "Ukraine, ranked." (bold lead-in) | MethodPage, above the demo | (unchanged) | Україна за пріоритетом. | «Україна, ранжована.» is a calque no Ukrainian would write as a heading; the alt text already says «за пріоритетом». |
| the formula variable "stressed" | MethodPage, the stress rule | (unchanged) | під стресом | Ties the rule to «частка під стресом» in the sum above it; «стрес = NDVI < …» named the quantity, not the state of a pixel. |
| "{label} under {upTo}" / "{label} above" | MethodPage, The condition | (unchanged) | «{label}» нижче {upTo} / «{label}» вище цього | Class names in « », as the hold («нижче за «Дуже добрий»») and labs write them; a capitalised adjective mid-sentence otherwise reads as a slip. |
| overlap hand-drawn outlines by 0.805 | MethodPage, Finding the fields | (unchanged) | збігаються з накресленими вручну контурами на 0.805 | «перекривають … на 0.805» reads as covering them; the figure says how far they coincide. |
| shared area ÷ combined area | MethodPage, Finding the fields | (unchanged) | (спільна площа ÷ обʼєднана площа) | «сумарна площа» is the sum of both areas, which is not the union the figure divides by. |
| counts as fully feasible (100 km) | MethodPage, Feasibility | (unchanged) | 100 км і більше — повна доступність | «100 км або більше вважається повністю доступним» had no noun for the adjective to agree with. |
| the top of the list for each time frame | MethodPage, Ukraine ranked | (unchanged) | початок списку для кожного періоду | Not «верхівка списку». |
| checked against the USDA crop layer | MethodPage, The crop | (unchanged) | Порівняно з картою культур USDA | «Проти» stays for a baseline («проти норми»); a check against a reference is «порівняно з». |
| Ukraine is the demo because that is where Chernozem started | MethodPage, the Atlas lead | (unchanged) | Демо — це Україна, бо саме там почався Chernozem. | The glossary's «Демо — це Україна»; «там», not «тут»: the reader is not in Ukraine. |
| go to Anthropic's Claude to be answered | MethodPage, privacy | (unchanged) | передаються Claude від Anthropic, який і відповідає | Not «ідуть … за відповіддю». |
| search a village, type coordinates, or draw (step 2) | MethodPage, How to use it | (unchanged) | за назвою села, за координатами або накресливши його контур | Three parallel ways; the glossary's контур for the outline. |
| a ten-field farm takes about 20 seconds (step 4) | MethodPage, How to use it | (unchanged) | для господарства з десяти полів це триває близько 20 секунд | A farm does not «займає» seconds. |
| the middle of the three years | MethodPage, Four readings | (unchanged) | медіана за три роки | The count in words (один … десять) by function, as the English writes it; digits past ten. |
| with a soft edge of 0.2 | MethodPage, The gate | (unchanged) | з перехідною зоною шириною 0.2 | The glossary's «перехідна зона шириною». |
