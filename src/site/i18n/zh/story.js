// WHAT THIS FILE DOES
// Chinese for the website's Story page (pages/StoryPage.jsx): the title on
// the dark band, the five steps of the story (the ROOTS constant, rendered
// through t()), the bar of the three editions, and the three editions'
// paragraphs, pictures and credits. Keys are the English sentences exactly
// as the page writes them: "Dr.\u00a0Bo Zhao" and "Field\u00a0yet" keep the
// page's no-break spaces, "great\u2011grandparents" and "black\u2011soil" its
// non-breaking hyphens (written as escapes here so they can be seen). The
// key " edition" starts with a space on purpose (the bar shows the ordinal
// and then this word; Chinese writes 第一 + 版 with no space). The tab's
// title "Story" comes from common.js. Names stay Latin: Chernozem, Field,
// Atlas, Google Earth Engine, Colab, ACLED, Harvard Dataverse, Penn, ZBDL,
// OpenStreetMap, OpenFreeMap, OpenMapTiles, localhost, chernozem.app.
//
// WHO EDITS IT
// Whoever changes the Story's words. Keep a key identical to the English
// in the page, or the page shows English.

export default {
  // The roots (the dark band): the page's title
  "Forged in Three Generations": "三代铸就",
  // The roots: the five steps (ROOTS), each a statement set large and its description
  "For three generations, one story was told at William’s family table.": "三代以来，威廉家的餐桌上一直讲着同一个故事。",
  "After the Sino-Japanese War, his great\u2011grandparents were starving: bombs, landmines and the remnants of war had torn apart the black soil they farmed in northeastern China. They survived, and in time that same soil fed them back to life.":
    "抗日战争之后，他的曾祖父母在挨饿：炸弹、地雷和战争留下的残骸撕碎了他们在中国东北耕种的黑土（Chernozem 这个名字就取自这种黑土）。他们活了下来。后来，还是这片黑土把他们重新养活了。",
  "The summer after his freshman year, William went to see that land.": "大一结束后的那个夏天，威廉去看了那片土地。",
  "He visited his relatives in northeastern China and walked the black\u2011soil plains his family once farmed. He saw what floods and droughts had done to their harvests, and met kids his age already working those fields. He wanted to build a tool for them.":
    "他去中国东北探望亲戚，走过家人曾经耕种的黑土平原。他看到了洪水和干旱给收成造成的损失，也遇到了和他同龄、已经在这些田里干活的孩子。他想为他们做一个工具。",
  "Then he saw the same story on the same black soil, in Ukraine.": "后来，他在乌克兰的同一种黑土上看到了同样的故事。",
  "Drawn to international relations, geopolitics and peace, he watched the same kind of war tear up Ukraine’s farmland. He chose to build for its farmers first, so they would not go through what his great\u2011grandparents did.":
    "他关注国际关系、地缘政治与和平，眼看着同一种战争撕碎乌克兰的农田。他决定先为乌克兰的农户做这个工具，让他们不必再经历他曾祖父母经历过的事。",
  "He built it for Ukraine, then for everyone.": "他先为乌克兰做出了这个工具，再为所有人。",
  // {ways} arrives as the figure (10); the story says it as a word, so the
  // count is written 十种 when it is ten, else the figure with its measure word.
  "He learned the basics of Google Earth Engine, its libraries and how to code. He spent a year researching chernozem rehabilitation with Dr.\u00a0Bo Zhao of the University of Washington: he compared {ways} ways to rank damaged land, designed gated aggregation and built the first Chernozem Atlas, bringing experience from an internship at ZBDL Land and Resources in Beijing, where he worked on recovering land after disasters.":
    ({ ways, count }) =>
      `他学了 Google Earth Engine 的基础和它的程序库，也学会了写代码。他用一年时间，和华盛顿大学的赵波博士一起研究黑土修复：比较了${count === 10 ? "十种" : ` ${ways} 种`}给受损土地排序的方法，设计了门控聚合，做出了第一个 Chernozem Atlas。他还用上了在北京 ZBDL Land and Resources 实习时的经验，那时他做的是灾后土地恢复。`,
  "Over three editions, the same method grew to work for any soil, anywhere on Earth, after any war or natural disaster, and for anyone, even as everyday monitoring. Now the farmers of Ukraine, his family in northeastern China and any farmer anywhere can use it.":
    "经过三个版本，同一套方法逐渐适用于任何土壤：地球上任何地方，任何战争或自然灾害之后，任何人都能用，甚至可以用作日常监测。现在，乌克兰的农户、他在中国东北的家人，以及任何地方的任何农户都能用它。",
  "William took that story with him to a business program at the University of Pennsylvania.":
    "威廉带着这个故事，进入了宾夕法尼亚大学的商科项目。",
  "There he met some of his current partners. They have worked on Chernozem together ever since, with support from people at Penn and in the industry, and have gradually scaled it.":
    "他在那里遇到了现在的几位合作伙伴。从那时起，他们一直一起做 Chernozem，有 Penn 的人和业内人士支持，一步步把它做大。",
  // The bar that follows the reading: its name, the ordinals, the word after them (no space in Chinese), and the three links' names, which are also the editions' headings
  "The three editions": "三个版本",
  "First": "第一",
  "Second": "第二",
  "Third": "第三",
  " edition": "版",
  "First edition": "第一版",
  "Second edition": "第二版",
  "Third edition": "第三版",
  // First edition: the two paragraphs
  "A Google Colab notebook on Google Earth Engine that mapped Ukraine’s black soil, oblast by oblast, and the disturbance on it.":
    "一个运行在 Google Earth Engine 上的 Google Colab 笔记本，逐州绘出乌克兰的黑土，以及黑土上的扰动。",
  "Checked against {events} recorded explosion and remote-violence events from ACLED (rank correlation {rho}) and against the change in harvests (r = {r}), it became a research paper ranking {oblasts} oblasts.":
    "它对照 ACLED 记录的 {events} 起爆炸与远程暴力事件（等级相关 {rho}）以及收成的变化（r = {r}）做了核验，最终成为一篇研究论文，为 {oblasts} 个州排序。",
  // First edition: the three pictures (alt, then caption) and the credit under them
  "The first edition's map: Ukraine's black soil shaded green, oblast by oblast, on a plain base map":
    "第一版的地图：素色底图上，乌克兰的黑土逐州涂成绿色",
  "Ukraine’s black soil in green, oblast by oblast.": "乌克兰的黑土，逐州标为绿色。",
  "The disturbance layer: unusual change on Ukraine's land in orange and red, heaviest in the east and the south":
    "扰动图层：乌克兰土地上的异常变化，以橙色和红色标出，东部和南部最严重",
  "The disturbance layer: unusual change on the land in orange and red.": "扰动图层：土地上的异常变化，以橙色和红色标出。",
  "ACLED's recorded attacks across Ukraine as orange and red dots, crowded along the front line in the east and the south":
    "ACLED 记录的乌克兰全境袭击，以橙色和红色圆点标出，沿东部和南部的前线密集分布",
  "The check: ACLED’s recorded attacks, as orange and red dots.": "核验依据：ACLED 记录的袭击，以橙色和红色圆点标出。",
  "Base maps © {osm} contributors. Attacks: {acled}.": "底图 © {osm} 贡献者。袭击数据：{acled}。",
  // Second edition: the two paragraphs and the link
  "The Chernozem Recovery Atlas, a web page run on a laptop. It was the first Chernozem Atlas, for Ukraine only. There was no Field\u00a0yet.":
    "Chernozem Recovery Atlas（黑土恢复地图集），一个在笔记本电脑上运行的网页。它是第一个 Chernozem Atlas，只覆盖乌克兰。那时还没有 Field。",
  "Near-term and postwar readings, sliders for soil value, disturbance and recovery context, about a dozen map layers and a ranked list of oblasts, in English or Chinese.":
    "近期和战后两种读数，调节土壤价值、扰动和恢复背景的滑块，十来个地图图层，以及各州的排序列表，界面有英文和中文。",
  "Its data and code are on Harvard Dataverse": "它的数据和代码在 Harvard Dataverse 上",
  // Second edition: the screenshot (alt), its caption and the map credit that follows it
  "The second edition, the Chernozem Recovery Atlas in a browser on localhost: the weights and map layers on the left, Ukraine's oblasts coloured by priority, the top oblasts on the right":
    "第二版，浏览器里运行在 localhost 上的 Chernozem Recovery Atlas：左侧是权重和地图图层，乌克兰各州按优先级着色，右侧是排在最前的州",
  "The Recovery Atlas on localhost: the weights and map layers on the left, the top oblasts on the right.":
    "运行在 localhost 上的 Recovery Atlas：左侧是权重和地图图层，右侧是排在最前的州。",
  "Base map: {openFreeMap}, © {openMapTiles}, © {osm} contributors.":
    "底图：{openFreeMap}，© {openMapTiles}，© {osm} 贡献者。",
  // Third edition: the three paragraphs
  "This app, at chernozem.app.": "就是这个应用，网址是 chernozem.app。",
  "Field reads a farmer’s own fields on every clear Sentinel-2 pass: plant health, water and stress against 2019 to 2021, and harvest timing.":
    "每次无云的 Sentinel-2 过境，Field 都会判读农户自己的田块：与 2019 到 2021 年相比的作物长势、水分和胁迫，以及收获时机。",
  "Atlas scores any country or region square by square for governments, NGOs and corporations, after a war, flood, wildfire or drought.":
    "在战争、洪水、野火或干旱之后，Atlas 为政府、非政府组织和企业逐格给任何国家或地区评分。",
  // Third edition: the two screenshots (alt, then caption)
  "Field: the demo farm near Kupiansk on satellite imagery, Field 11 selected with its water, plant health, stress and harvest readings":
    "Field：卫星影像上库皮扬斯克附近的演示农场，选中了 11 号田，显示它的水分、作物长势、胁迫和收获读数",
  "Field: Field 11 on the demo farm near Kupiansk, with its four readings.": "Field：库皮扬斯克附近演示农场的 11 号田及其四项读数。",
  "Atlas: the overview of Ukraine for September 2026, with the cropland analysed, the damage, and the map of where to start":
    "Atlas：2026 年 9 月的乌克兰概览，包括已分析的耕地、损毁情况，以及恢复应从何处开始的地图",
  "Atlas: Ukraine in September 2026, with the places to start.": "Atlas：2026 年 9 月的乌克兰，标出应从何处开始。",
};
