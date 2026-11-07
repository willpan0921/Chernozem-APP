// WHAT THIS FILE DOES
// Chinese for the website's Methodology page (pages/MethodPage.jsx) and the
// two film players it uses (components/Walkthrough.jsx, components/Film.jsx):
// the opening, the Field part (what it is, the five steps, the four readings
// and their formulas, the condition and its formulas, how the fields, the
// crop and damage are found, what it cannot see), the Atlas part (the three
// scores, the gate and its formulas, the Ukraine ranking, the checks, what it
// cannot do), Behind it, the three-minute film, the close, the players' own
// words and every chapter caption (public/site/film/walkthroughs.json and
// Film.jsx FILM_CHAPTERS). Keys are the English sentences exactly as those
// files write them, in the order of the manifest (scratchpad
// i18n/keys/method.json); "crop\u00a0is" and the like keep the page's no-break
// spaces, "Sentinel\u20112" and "hand\u2011drawn" its non-breaking hyphens
// (written as escapes here so they can be seen). The words that come from
// content/site.js (the class names, "2019 to 2021", "one to two weeks",
// "September 2026", the dataset and stack names) and the shared buttons
// (Methodology, Register, Open the demo) live in common.js, not here. Names
// stay Latin: Chernozem, Field, Atlas, NDVI, NDWI, NDRE, Sentinel-1,
// Sentinel-2, Cloud Score+, WorldCover, FIRMS, USDA, ACLED, Copernicus,
// Firebase, Google, Anthropic, Claude, Google Earth Engine, GitHub, Harvard
// Dataverse, Canny, MP4, MB.
// Three entries are functions: a small count that the page hands over as a
// figure (6 pictures, 2 seasons, 3 years) is written in Chinese characters
// (六张, 两个, 三年), as the English writes it in words.
//
// WHO EDITS IT
// Whoever changes the Methodology page's words. Keep a key identical to the
// English in the page, or the page shows English.

// A small count in Chinese characters before its measure word (六张, 两个,
// 三年), as the English writes "six pictures"; a larger count stays a figure
// with its spaces (12 张).
const SMALL = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];
const small = (n) => (Number.isInteger(n) && n >= 0 && n < SMALL.length ? SMALL[n] : ` ${n} `);

export default {
  // The opening: the headline, the lead and the Atlas picture with its caption
  "How Chernozem works": "Chernozem 如何工作",
  "Free satellite data, read over farmland and turned into a plain answer: Field for one farm, Atlas for a whole region.":
    "读取农田上空的免费卫星数据，把它变成一个通俗易懂的答案：Field 面向一个农场，Atlas 面向整个地区。",
  "The Atlas map of Ukraine by priority, square by square, with the weights on the left and the top ten areas on the right":
    "Atlas 的乌克兰地图，按优先级逐格着色，左边是权重，右边是排名前十的地区",
  "Ukraine, {month}, square by square: the weights on the left, the top ten on the right.": "乌克兰，{month}，逐格显示：左边是权重，右边是前十名。",
  // Field: what it is, its walkthrough's title, how to use it (the five FIELD_STEPS), the phone picture, what it reads
  "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.":
    "Field 是面向一个农场的 Chernozem：您只需把田块标出一次，之后每次无云的卫星过境后，它都会告诉您每块田的状况和该做什么。",
  "The Field walkthrough": "Field 功能导览",
  "How to use it.": "使用方法。",
  "Register and choose Field.": "注册，然后选择 Field。",
  "Find your farm: search a village, type coordinates, or draw.": "找到您的农场：搜索村庄、输入坐标，或在地图上画出来。",
  "Check the crops the app detected, and set your own.": "核对应用识别出的作物，再设置成您实际种的作物。",
  "Read the first pass; a ten-field farm takes about {seconds} seconds.": "判读第一次过境；一个有十块田的农场大约需要 {seconds} 秒。",
  "Come back after each pass, report what happened, or ask the assistant.": "每次过境后回来看看，报告发生了什么，或者问问助手。",
  "The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below":
    "手机上的田块页：卫星地图上勾出各田块的边界，下方是状况图例和选中田块的详情",
  "What it reads.": "它读取什么。",
  "Every clear Sentinel-2 pass at ten metres, radar from Sentinel-1 for lasting change in the ground, the local forecast, and the same weeks of 2019 to 2021 as the normal to compare with.":
    "每次无云的 Sentinel-2 过境，分辨率 10 米；Sentinel-1 的雷达，用来看地面的持久变化；当地的天气预报；以及作为正常值用来对比的 2019 到 2021 年同期。",
  // Field, the four readings: the clouds and the normal years (the {share} is 'at least half' below), then plant health, water, stress and harvest timing, each a formula and one sentence
  "Four readings.": "四项读数。",
  "Google’s Cloud Score+ removes clouds pixel by pixel (clear at {score} or more). Plant health, water and stress use the median of the last {days} days’ clear pixels, against the same weeks of {years}: per pixel, the middle of the {count} years (the app’s Below and Above normal use their range). Harvest timing follows the passes {share}\u00a0clear.": ({ count }) =>
    `Google 的 Cloud Score+ 逐像素去云（{score} 或以上算无云）。作物长势、水分和胁迫取最近 {days} 天无云像素的中位数，与 {years}同期相比：每个像素取这${small(count)}年的中间值（应用里的“低于正常”和“高于正常”用的是这几年的范围）。收获时机看的是田块{share}无云的那些过境。`,
  "at least half": "至少一半",
  "at least {percent}%": "至少 {percent}%",
  "Plant health": "作物长势",
  "Near-infrared against red: how green the crop\u00a0is.": "近红外对比红光：作物有多绿。",
  "Water": "水分",
  "Near-infrared against short-wave infrared: the water held in the\u00a0leaves.": "近红外对比短波红外：叶片里含的水分。",
  "Stress": "胁迫",
  "The share of the field weaker than the rest and than normal; the red edge reacts {lead} before\u00a0NDVI.":
    "田块中既弱于其余部分、又弱于正常值的面积比例；红边比 NDVI 早{lead}反应。",
  "Harvest timing": "收获时机",
  "ready": "可收获",
  "{bare} + share·(peak − {bare})": "{bare} + 比例·(峰值 − {bare})",
  "Ready when NDVI falls back to this level (share {cereals} for cereals and rapeseed, {rowCrops} for row crops), checked by heat units and, for row crops, radar through\u00a0cloud.":
    "NDVI 回落到这个水平即可收获（谷物和油菜的比例为 {cereals}，行播作物为 {rowCrops}），再用积温核对；行播作物还用能穿透云层的雷达核对。",
  // Field, the condition: the paragraph (its {classes} list is built from '{label} under {upTo}' and '{label} above'), then the formulas, term by term
  "The condition.": "状况。",
  "One number from 0 to 1 for each field in crop, which colours it on the map: {classes}. High stress ({highStress}% of the field or more) holds it under {stressedUnder}, damage under {damagedUnder}, and a field with no crop has no\u00a0condition.":
    "每块有作物的田得到一个 0 到 1 之间的数，决定它在地图上的颜色：{classes}。高胁迫（占田块面积 {highStress}% 或以上）时等级不会达到“{stressedUnder}”，有损毁时不会达到“{damagedUnder}”；没有作物的田块没有状况评分。",
  "{label} under {upTo}": "{upTo} 以下为“{label}”",
  "{label} above": "再往上为“{label}”",
  "condition": "状况",
  "{w}·health score": "{w}·长势得分",
  "+ {w}·water score": "+ {w}·水分得分",
  "+ {w}·(1 − stressed share)": "+ {w}·(1 − 受胁迫比例)",
  "health score": "长势得分",
  "1 + (NDVI − normal) / {span}": "1 + (NDVI − 正常值) / {span}",
  "water score": "水分得分",
  "1 + (NDWI − normal) / {span}": "1 + (NDWI − 正常值) / {span}",
  "each held between 0 and 1": "两者都限定在 0 到 1 之间",
  "stressed": "受胁迫",
  "NDVI < field median − {d}": "NDVI < 田块中位数 − {d}",
  "and < normal − {d},": "且 < 正常值 − {d}，",
  "or NDRE < field median − {d}": "或 NDRE < 田块中位数 − {d}",
  "and < normal − {d}": "且 < 正常值 − {d}",
  // Field: how the fields, the crop and damage are found
  "Finding the fields": "找出田块",
  "Canny edges in {pictures} Sentinel\u20112 pictures of the last two seasons split ESA WorldCover’s cropland into fields from {minHa} ha. On the demo farm they overlap hand\u2011drawn outlines by {iou} {note}.": ({ pictures }) =>
    `用最近两个生长季的${small(pictures)}张 Sentinel-2 影像做 Canny 边缘检测，把 ESA WorldCover 的耕地切分成田块，最小 {minHa} 公顷。在演示农场上，它们与手绘边界的重叠度为 {iou}{note}。`,
  "(shared area ÷ combined\u00a0area)": "（重叠面积 ÷ 合并面积）",
  "The crop": "作物",
  "A phenology classifier, helped by radar and the red\u2011edge gap; your own choice wins. Against the USDA crop layer it named {heldOut}% of held\u2011out fields right, and {likely}% when it said\u00a0“likely”.":
    "一个物候分类器，辅以雷达和红边差值；以您的选择为准。对照 USDA 作物图层，它正确识别了 {heldOut}% 的留出田块；在它说“很可能”时，正确率为 {likely}%。",
  "Damage on a field": "田块损毁",
  "Radar change of {db} dB or more in at least {seasons} growing seasons, and unusual fire (NASA FIRMS). In a war, radar change on {share}% of the field is enough; elsewhere, both are\u00a0needed.": ({ seasons }) =>
    `至少${small(seasons)}个生长季里出现 {db} 分贝或以上的雷达变化，加上异常火情（NASA FIRMS）。在战争地区，田块 {share}% 的面积出现雷达变化就足够；其他地方两者都需要。`,
  // Field: what it cannot see
  "What it cannot see.": "它看不到什么。",
  "Which pest or disease is at work; mines and unexploded ordnance (a field with no damage found is not a safe field); a line between look\u2011alike\u00a0fields.":
    "具体是哪种虫害或病害；地雷和未爆弹药（没发现损毁的田块不等于安全的田块）；长得一样的相邻田块之间的分界线。",
  // Atlas: what it is and its walkthrough's title
  "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start. Ukraine is the demo because that is where Chernozem started.":
    "Atlas 是面向整个地区的 Chernozem，供政府、非政府组织和企业使用：它给每一格农田打分，排出恢复应从何处开始。演示选的是乌克兰，因为 Chernozem 从那里起步。",
  "The Atlas walkthrough": "Atlas 功能导览",
  // Atlas, the three scores: the bold opening (an element in the sentence after it) and the three terms
  "Three scores": "三项得分",
  "{scores}, each from 0 to 100. Value and damage make the priority; feasibility decides whether a square is ranked now or later.":
    "{scores}，每项从 0 到 100。价值和损毁决定优先级；可行性决定一个方格是现在排序还是以后排序。",
  "Value": "价值",
  "How likely the soil is black soil, and how much of the square is cropland.": "土壤是黑土的可能性有多大，以及方格中有多大比例是耕地。",
  "Damage": "损毁",
  "Unusual fire and lasting radar change since the crisis began, against the same seasons in 2019 to 2021.":
    "危机开始以来的异常火情和持久的雷达变化，与 2019 到 2021 年同期相比。",
  "Feasibility": "可行性",
  "Distance to recorded fighting; 100 km or more counts as fully feasible.": "与有记录战斗的距离；100 千米或以上算作完全可行。",
  // Atlas, the gate: the two paragraphs and the two formulas (half and squared are superscript elements)
  "The gate.": "门控。",
  "Near term: the least feasible {percentile}% of squares are left out, with a soft edge of {ramp}, and the rest are ranked by value and damage.":
    "近期：可行性最低的 {percentile}% 方格被排除，边缘有宽 {ramp} 的渐变区，其余按价值和损毁排序。",
  "Post-crisis: feasibility becomes a pace factor. The three scores are combined in a weighted power mean with weights {value} / {damage} / {feasibility} and exponent {exponent}. Move the sliders and watch what the two time frames do with one place.":
    "危机后：可行性变成一个节奏因子。三项得分用加权幂平均合并，权重为 {value} / {damage} / {feasibility}，指数为 {exponent}。移动滑块，看两个时段各自怎样处理同一个地点。",
  "Near term: priority = ({v}·value{half} + {d}·damage{half}){squared}, faded in over the {ramp} ramp above the cutoff; below it, left out":
    "近期：优先级 = ({v}·价值{half} + {d}·损毁{half}){squared}，在阈值之上宽 {ramp} 的渐变区内逐步生效；阈值以下排除",
  "Post-crisis: priority = ({v}·value{half} + {d}·damage{half} + {f}·feasibility{half}){squared}":
    "危机后：优先级 = ({v}·价值{half} + {d}·损毁{half} + {f}·可行性{half}){squared}",
  // Atlas: the Ukraine ranking as the app shows it
  "Ukraine, ranked.": "乌克兰的排序。",
  "The real {month} reading of {n} squares, as the app shows it: the top of the list for each time frame, and the whole country on the map.":
    "{month}对 {n} 个方格的真实读数，和应用里显示的一样：每个时段的排名前列，以及地图上的整个国家。",
  // Atlas: the checks against independent records, and what it cannot do
  "Checked against independent records.": "对照记录核验。",
  "The app’s readings beside Copernicus’s maps of three disasters and the USDA crop layer, and the paper’s damage score beside ACLED’s record of fighting.":
    "应用的读数对照 Copernicus 的三次灾害地图和 USDA 作物图层；论文的损毁得分对照 ACLED 的战斗记录。",
  "What it cannot do.": "它做不到什么。",
  "A screen, not a survey. Ten-metre pixels miss small fields; clouds delay optical readings; radar change is less reliable where 2019 to 2021 were not calm; and it never declares land safe.":
    "这是筛查，不是实地调查。10 米的像素会漏掉小田块；云会延迟光学读数；在 2019 到 2021 年并不平静的地方，雷达变化不那么可靠；而且它从不宣布土地是安全的。",
  // Behind it: the datasets and the stack ({list} comes joined by Intl.ListFormat), privacy, and the two links joined into one sentence
  "Behind it": "幕后",
  "What it reads:": "它读取什么：",
  "{list}, {count} open datasets, each read against its own normal years.": "{list}，共 {count} 个开放数据集，每一个都对照自己的正常年份判读。",
  "Built with:": "用什么构建：",
  "{list}. More than {tests} automated tests. Drawn as a mockup first, then built.": "{list}。超过 {tests} 项自动化测试。先画原型图，再构建。",
  "Accounts run on Firebase (Google, or e\u2011mail and password); your fields, readings and reports are kept on our own server and never sold, and messages from the contact page are kept on our server and e\u2011mailed to {email}. When you ask the assistant, your question and your fields’ readings go to Anthropic’s Claude to be answered; the satellite maths runs on Google Earth Engine.":
    "账户由 Firebase 管理（Google，或电子邮件加密码）；您的田块、读数和报告保存在我们自己的服务器上，绝不出售；联系页面的留言也保存在我们的服务器上，并通过电子邮件发送到 {email}。您向助手提问时，您的问题和田块读数会发送给 Anthropic 的 Claude 来回答；卫星运算在 Google Earth Engine 上进行。",
  "{code}, and {data}.": "{code}，而{data}。",
  "The code is public on GitHub": "代码在 GitHub 上公开",
  "the research data and code are on Harvard Dataverse": "研究数据和代码在 Harvard Dataverse 上",
  // The three-minute film's heading (also the film's title in Film.jsx)
  "Chernozem in three minutes": "三分钟了解 Chernozem",
  // The close
  "Run it on your own land": "在您自己的土地上运行",
  "Register for Chernozem and read the first pass yourself. The demo is open to everyone and read-only.": "注册 Chernozem，亲自判读第一次过境。演示对所有人开放，且为只读。",
  "Try the demo": "体验演示",
  // The players (components/Walkthrough.jsx, Film.jsx): the captions' language, the download links, the chapter list's spoken name, the line about the English voice
  "English": "英语",
  "Download the film (MP4)": "下载影片（MP4）",
  "Chapters of {title}": "“{title}”的章节",
  "The film is narrated in English.": "影片为英文解说。",
  "Download the film (MP4, 36 MB)": "下载影片（MP4，36 MB）",
  // The walkthroughs' chapter buttons (public/site/film/walkthroughs.json), Field's then Atlas's
  "The farm": "农场",
  "Weather": "天气",
  "Fields": "田块",
  "Data": "数据",
  "Tell us what happened": "告诉我们发生了什么",
  "The assistant": "助手",
  "Settings": "设置",
  "Change farm": "更换农场",
  "The overview": "概览",
  "The map": "地图",
  "Weights and the cutoff": "权重与阈值",
  "A place's details": "地点详情",
  "The report": "报告",
  "Choose an area": "选择区域",
  "Team and crisis": "团队与危机",
  // The three-minute film's chapter buttons (Film.jsx FILM_CHAPTERS); 'Field' and 'Atlas' are names and stay
  "Northeastern China": "中国东北",
  "Ukraine": "乌克兰",
  "How it reads the land": "它如何读取土地",
};
