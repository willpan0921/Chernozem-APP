// WHAT THIS FILE DOES
// Chinese for the About page (pages/HomePage.jsx) and the components only
// it shows: the two sideways stories (components/ScrollStory.jsx), the
// field row in its three states (components/FieldRowStates.jsx) and the
// proof table (components/ProofTable.jsx, also on the Methodology page).
// Keys are the English sentences exactly as the files write them; the order
// is the manifest's (scratchpad i18n/keys/home.json). The demo farm's own
// words (11 号田, 油菜, the dates, 接近正常) and the month come from
// common.js. Product names (Chernozem, Field, Atlas) and dataset names stay
// Latin; the soil is 黑土.
//
// WHO EDITS IT
// Whoever changes the About page's words. Keep a key identical to the
// English in the page, or the page shows English. Holes like {seconds} stay
// as written; the page fills them.

export default {
  // 1. The hero: the slogan in two lines, the problem, what Chernozem does, the two actions
  "Drop your pin,": "放下图钉，",
  "know your land.": "读懂您的土地。",
  "As geopolitical and environmental tensions rise, wars and climate disasters strike more often. They hit hardest the people noticed least: the farmers who depend on their land to survive.":
    "随着地缘政治和环境局势日益紧张，战争和气候灾害越来越频繁。受打击最重的，是最不受关注的人：靠土地为生的农户。",
  "Chernozem solves the problem of that harm going unseen.": "Chernozem 解决的，正是这些伤害无人看见的问题。",
  "Register for Chernozem": "注册 Chernozem",
  "Try the demo": "体验演示",
  // 2. What is Chernozem: the definition beside the owner's picture of Field and Atlas
  "What is Chernozem": "什么是 Chernozem",
  "Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.":
    "Chernozem 是卫星农田监测：读取农田上空的免费卫星数据，再用通俗的话讲给不是科学家的人。",
  "Field watches a farmer’s own fields; Atlas scores a whole region for governments, NGOs and corporations. The name is the black soil of Ukraine and northeast China, where its story began.":
    "Field 关注农户自己的田地；Atlas 面向政府、非政府组织和企业，为整个地区打分。名字取自乌克兰和中国东北的黑土，它的故事就是从那里开始的。",
  "How it started": "它是怎么开始的",
  "Chernozem’s pin and name above two screens of the app: Field, with the demo farm’s fields outlined on satellite imagery and Field 12’s water, plant health, stress and harvest readings beside them; and Atlas, with Ukraine’s cropland in squares shaded by priority for September 2026, the weights on the left and the top areas on the right.":
    "Chernozem 的图钉和名字，下方是应用的两个画面：Field，卫星影像上勾出演示农场各田块的边界，旁边是 12 号田的水分、长势、胁迫和收获读数；Atlas，乌克兰的耕地按 2026 年 9 月的优先级逐格着色，左边是权重，右边是排名最前的地区。",
  "Field, above, on the demo farm near Kupiansk; Atlas, below, across Ukraine.": "上图是 Field，在库皮扬斯克附近的演示农场；下图是 Atlas，覆盖整个乌克兰。",
  // 3. Why Chernozem: the eight reasons, each a bold claim and one line
  "Why Chernozem": "为什么选择 Chernozem",
  "No hardware, only software.": "没有硬件，只有软件。",
  "Nothing to install on the land. In a disaster that matters most: equipment there is costly, and often impossible to bring in.":
    "土地上不需要安装任何东西。灾害发生时这一点最重要：设备在那里代价高昂，而且常常根本运不进去。",
  "Free satellite data, read on {earthEngine}.": "免费卫星数据，在 {earthEngine} 上读取。",
  "Open data anyone can use: the public Sentinel satellites, read for you on {earthEngine}.": "人人可用的开放数据：公开的 Sentinel 卫星，在 {earthEngine} 上为您读取。",
  "Recovery, not only monitoring.": "不只是监测，还有恢复。",
  "Most tools only monitor healthy soil. Chernozem monitors it too, then ranks damaged land and shows where recovery should start.":
    "多数工具只监测健康的土壤。Chernozem 也监测，然后对受损土地排序，指出恢复应从何处开始。",
  "For every stakeholder.": "面向每一方。",
  "Individuals and organizations alike: Field for a farmer’s own fields, Atlas for governments, NGOs and corporations.":
    "个人和组织都适用：Field 面向农户自己的田地，Atlas 面向政府、非政府组织和企业。",
  "You choose what matters.": "由您决定什么重要。",
  "You set the weights for value, damage and feasibility, and the ranking follows your priorities.": "您设定价值、损毁和可行性的权重，排序就按您的优先级来。",
  "Drop the pin, see the field.": "放下图钉，看见田块。",
  "Easy to use: point at a place, and the app finds the fields there and reads each one.": "易于使用：指向一个地方，应用会找出那里的田块，并逐块判读。",
  "A few clicks, start to finish.": "从头到尾，只需几次点击。",
  "Finding the right satellite images and analysing them happens for you: a ten-field farm is read in about {seconds} seconds.":
    "找到合适的卫星影像并加以分析，都由它替您完成：一个有十块田的农场约 {seconds} 秒就能判读完。",
  "All you need is a place.": "您只需要一个地点。",
  "Select the coordinates, type an address or draw an outline. No files, no sensors, no survey.": "选择坐标、输入地址，或画出边界。不需要文件，不需要传感器，也不需要实地调查。",
  // 3. The photograph beside the reasons: its alt text and the credit under it
  "Spent artillery shell casings, some rusted, lie in the grass of a field, with dry weeds and trees behind.": "废弃的炮弹壳散落在田间草地上，有些已经生锈，后面是枯草和树木。",
  "Spent artillery shell casings left in a field. Photo: {credit}, as published in {article}.": "遗留在田里的炮弹壳。摄影：{credit}，发表于 {article}。",
  // 4. and 5. The two stories' headings and the links beside them
  "Field, for one farm": "Field 面向一个农场",
  "Open Field in the demo": "在演示中打开 Field",
  "Atlas, for a whole region": "Atlas 面向整个地区",
  "Open Atlas in the demo": "在演示中打开 Atlas",
  // The story's own words (ScrollStory.jsx): the progress row's spoken name, the counter, the hint
  "{title}, step by step": "{title}：各步骤",
  "{current} of {count}": "第 {current} 步，共 {count} 步",
  "Scroll to move along": "滚动以继续",
  // 4. The Field story: five steps, each a title, a text and a picture's alt
  "Your farm, field by field": "您的农场，每一块田",
  "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.":
    "Field 是面向一个农场的 Chernozem：您只需把田块标出一次，之后每次无云的卫星过境后，它都会告诉您每块田的状况和该做什么。",
  "The demo farm near Kupiansk on satellite imagery in Field, each field outlined and patterned by its condition, Field 11 picked, after the Sentinel-2 pass of 26 October.":
    "Field 中，库皮扬斯克附近的演示农场显示在卫星影像上，每块田都勾出边界并按状况填充图案，11 号田被选中，时间是 10 月 26 日 Sentinel-2 过境之后。",
  "Drop a pin on your land": "在您的土地上放下图钉",
  "Search for a place or paste coordinates. Field traces the edges between fields in Sentinel-2 images of the last two seasons and offers the fields it finds; you keep yours.":
    "搜索一个地方，或粘贴坐标。Field 在最近两个生长季的 Sentinel-2 影像中描出田块之间的边界，把找到的田块列给您，您从中选出自己的那些。",
  "Field’s farm setup: coordinates typed in the search, the place found, “Find my fields”, and the pin on the satellite map inside the dashed circle it will search.":
    "Field 的农场设置：搜索框里输入了坐标，地点已找到，“查找我的田块”按钮，以及卫星地图上的图钉，周围的虚线圆圈是它将搜索的范围。",
  "Every clear pass, read": "每次无云过境都判读",
  "Clouds are removed pixel by pixel. Each field gets plant health (NDVI), water (NDWI) and stress (two tests, one on the red edge) against the same weeks of 2019 to 2021, and its harvest timing.":
    "逐像素去云。每块田都会得到作物长势（归一化植被指数，NDVI）、水分（归一化水体指数，NDWI）和胁迫（两项检验，其中一项用红边），均与 2019 到 2021 年同期相比；另外还有收获时机。",
  "Field 11 in Field, growing well: its water near normal, its plant health above normal, stress under 1% and the harvest past its peak, beside the field on the map.":
    "Field 中的 11 号田，长势良好：水分接近正常，长势高于正常，胁迫不到 1%，收获已过峰值，旁边是地图上的这块田。",
  "This season against normal": "本季对比正常",
  "Every pass since 2019 on one chart: a field against the farm and against its normal years, with the day the full-scale invasion began marked.":
    "2019 年以来的每次过境都在一张图上：一块田与全农场对比，与它的正常年份对比，并标出全面入侵开始的那一天。",
  "Field’s data page: one field’s plant health since 2019 against the farm average, the normal years 2019 to 2021 shaded, and the full-scale invasion of 24 February 2022 marked.":
    "Field 的数据页：一块田 2019 年以来的长势与全农场平均值对比，2019 到 2021 年的正常年份以底色标出，并标出了 2022 年 2 月 24 日的全面入侵。",
  "Tell us what happened": "告诉我们发生了什么",
  "Report shelling, fire, flood, hail or pests with your photos, and ask the assistant what to do first. It answers only from your own fields’ data.":
    "附上您的照片，报告炮击、火灾、洪水、冰雹或虫害，再问助手先该做什么。它只根据您自己田块的数据回答。",
  "Field’s overview: what needs doing, then “Tell us what happened” with Shelling, Fire, Flood, Hail, Pests and Other, a note, photos and Send.":
    "Field 的概览：该做什么，然后是“告诉我们发生了什么”，有炮击、火灾、洪水、冰雹、虫害和其他几个按钮，以及备注、照片和发送。",
  // 5. The Atlas story: five steps
  "A whole region, square by square": "整个地区，每一个方格",
  "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start.":
    "Atlas 是面向整个地区的 Chernozem，供政府、非政府组织和企业使用：它给每一个农田方格打分，排出恢复应从何处开始。",
  "Atlas’s overview of Ukraine for September 2026: the cropland analysed, the black soil, the heavily damaged land and the people on it, above the map of where to start.":
    "Atlas 的乌克兰 2026 年 9 月概览：分析过的耕地、黑土、严重损毁的土地及其上的居民，下方是从何处开始的地图。",
  "Pick a country, a region or a box": "选一个国家、地区或方框",
  "Search a country or a province, type the corners of a box, or draw it on the map. Atlas then reads the last twelve months there.":
    "搜索一个国家或省份，输入方框的角点坐标，或直接在地图上画出来。Atlas 随后判读那里过去十二个月的情况。",
  "Atlas’s “Choose an area”: a box around the Kharkiv region typed by its north, south, west and east edges, shown on a small map, ready to analyse.":
    "Atlas 的“选择区域”：按北、南、西、东四条边输入的一个方框，框住哈尔科夫州，显示在一张小地图上，等待分析。",
  "Three scores for every square": "每个方格三项得分",
  "Value: how good the soil is. Damage: what fire and radar have seen since the crisis began. Feasibility: whether anyone can safely reach it.":
    "价值：土壤有多好。损毁：危机开始以来火点和雷达看到了什么。可行性：是否有人能安全到达那里。",
  "One square in Mykolaiv picked in Atlas: highest priority, its value, damage and feasibility scores, and the soil types under its cropland.":
    "Atlas 中选中的尼古拉耶夫州的一个方格：最高优先级，它的价值、损毁和可行性得分，以及其耕地之下的土壤类型。",
  "Your weights, your ranking": "您的权重，您的排序",
  "Choose how much value and damage count, and how much of the least reachable land to leave out for now. The ranking follows your choice.":
    "选择价值和损毁各占多大比重，以及暂不纳入多少最难到达的土地。排序随您的选择而变。",
  "Atlas’s weights for Ukraine in the near term, value, damage and the share of the least feasible land left out, beside the map of priorities square by square.":
    "Atlas 对乌克兰近期的权重：价值、损毁，以及被排除的可行性最低土地的比例，旁边是逐格显示优先级的地图。",
  "A report donors can read": "捐助方能读懂的报告",
  "The top areas to start with, near term or after the crisis, in a report with the method and its limits, saved as a PDF or a table.":
    "近期或危机后最应优先着手的地区，写进一份说明方法及其局限的报告，可保存为 PDF 或表格。",
  "Atlas’s donor report for Ukraine, September 2026, with Download CSV and Save as PDF: the headline figures, then the top ten areas for the near term.":
    "Atlas 的乌克兰捐助方报告，2026 年 9 月，带“下载 CSV”和“保存为 PDF”：先是主要数字，然后是近期排名前十的地区。",
  // 6. One field, one pass, one answer: the heading and the field row (FieldRowStates.jsx)
  "One field, one pass, one answer": "一块田，一次过境，一个答案",
  "The row's state": "这一行的状态",
  "Arrives": "新到",
  "Read": "判读",
  "Answered": "答复",
  "New pass · Sentinel-2 · {date} · clear sky": "新过境 · Sentinel-2 · {date} · 无云",
  "New pass": "新过境",
  "Read this pass": "判读本次过境",
  "Reading": "判读中",
  "Plant health {plantHealth} · Stress {stress} · Water {water}": "长势 {plantHealth} · 胁迫 {stress} · 水分 {water}",
  "Past peak; greenest on {date}": "已过峰值；{date}最绿",
  "Growing well": "长势良好",
  "Read it again": "再判读一次",
  // 7. The proof: the two-line heading and the table (ProofTable.jsx)
  "Checked against": "对照记录",
  "the record": "核验",
  "Year": "年份",
  "What": "事项",
  "Compared with": "对照",
  "Result": "结果",
  "Thessaly flood, Greece": "希腊色萨利洪水",
  "Yambol wildfire, Bulgaria": "保加利亚扬博尔野火",
  "Punjab flood, Pakistan": "巴基斯坦旁遮普洪水",
  "Crop detection, North Dakota": "北达科他州作物识别",
  "Damage against fighting, Ukraine": "乌克兰：损毁与战斗对照",
  "Paper": "论文",
  "USDA Cropland Data Layer": "USDA 作物图层（Cropland Data Layer）",
  "ACLED, {events} events": "ACLED，{events} 起事件",
  // The page's no-break spaces (U+00A0) before "ha" are written as escapes so they can be seen.
  "{measured} ha measured; {official} ha official": "测得 {measured} 公顷；官方 {official} 公顷",
  "{measured} ha measured; {official} ha official (reads low)": "测得 {measured} 公顷；官方 {official} 公顷（测得偏低）",
  "{likely}% right when it says “likely”; {all}% over all six crops": "标为“可能”时 {likely}% 正确；六种作物合计 {all}%",
  "rank correlation {rho}": "等级相关系数 {rho}",
  "Mean error in area against the three Copernicus maps: {mape}%. Cropland wrongly flagged in a normal year: {worst}% at worst, {mean}% on average.":
    "与三张 Copernicus 地图对照的面积平均误差：{mape}%。正常年份被误标的耕地：最差 {worst}%，平均 {mean}%。",
  // 8. The demo: the heading and the introduction above the live ranking
  "The demo is Ukraine": "演示就是乌克兰",
  "Chernozem started there. This is the real {month} reading of {squares} squares, rolled up to oblasts. The same app works anywhere.":
    "Chernozem 从那里起步。这是 {month}对 {squares} 个方格的真实读数，汇总到各州。同一个应用在任何地方都能用。",
  // 9. The close: the green tile, the satellite picture, the disclaimer and the small print
  "See your land from space": "从太空看您的土地",
  "Register, drop your pin or choose a region, and read what the satellites saw.": "先注册，再放下图钉或选择一个地区，读一读卫星看到了什么。",
  "Satellite view of southern Ukraine, Crimea and the Black Sea, as Atlas shows it.": "Atlas 中显示的乌克兰南部、克里米亚和黑海的卫星视图。",
  "A detection framework.": "一个检测框架。",
  "Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees. In our tests its readings were roughly {percent}% accurate: close, for a tool of its kind, but not 100%. Use them as a guide, check on the ground before acting, and know that Chernozem is not responsible for decisions made from them.":
    "Chernozem 从太空读取农田。它无法在灾区采集土壤样本，地面上也没有设备来确认它看到的情况。在我们的测试中，它的读数准确率约为 {percent}%：就这类工具而言已经很接近了，但不是 100%。请把读数当作参考，行动前先到实地核实，并请知悉，Chernozem 不对据此作出的决定负责。",
  "The maps in the pictures of the app: Esri World Imagery (Esri, Maxar, Earthstar Geographics) and Esri’s light grey canvas (Esri, HERE, Garmin, © OpenStreetMap contributors). The satellite view above: Esri World Imagery.":
    "应用图片中的地图：Esri World Imagery（Esri、Maxar、Earthstar Geographics）和 Esri 的浅灰底图（Esri、HERE、Garmin、© OpenStreetMap 贡献者）。上方的卫星视图：Esri World Imagery。",
};
