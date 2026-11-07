// WHAT THIS FILE DOES
// Chinese for the About page's globe (components/EarthGlobe.jsx, the words
// globeMath.js composes for it, and the reviewed wars' names in
// worldData.js WAR_NAMES): what a screen reader is told the globe is, the
// zoom buttons and the quiet hints, the list of today's armed conflicts and
// disaster alerts, the card about a picked event (its kind, alert colour and
// dates, Chernozem's own measurement for Ukraine, whose food depends on its
// land), the legend and the small print about the sources. Keys are the
// English sentences as those files write them. The twelve months and the
// three alert colours are used only inside the date and status keys, never
// alone: the date keys add 年 and 日 around the month, the status keys put
// 预警 after the colour. A war the list knows only by its year reaches the
// status keys as a bare number ("2015": globeMath.js sinceText), so the two
// "{kind} since {date}" entries are functions that give it 年 (2015 年至今,
// never 2015至今). "Close" and "September 2026" come from common.js.
//
// WHO EDITS IT
// Whoever changes the globe's words. Keep a key identical to the English in
// the page, or the page shows English.

// A war's start as sinceText gives it: "2022 年 2 月" through the date keys
// below, or a bare year ("2015") when the list knows only the year; the bare
// year takes 年 and a space, as every other number before a Chinese word.
const dated = (date) => (/^\d{4}$/.test(String(date ?? "")) ? `${date} 年` : String(date ?? ""));

export default {
  // What a screen reader is told the globe is (EarthGlobe.jsx): the figure's hidden title, then the canvas's three sentences
  "The Earth today: where the black soil lies, today's armed conflicts and disaster alerts, and whose food depends on their land":
    "今日地球：黑土的分布、今天的武装冲突和灾害预警，以及谁的粮食依赖这些土地",
  "The real Earth seen from space, turning slowly.": "从太空看到的真实地球，缓缓转动。",
  "The world's black-soil belts are outlined in dark brown.": "世界各地的黑土带用深棕色勾出边界。",
  "Today's armed conflicts are terracotta dots and disaster alerts amber ones; thin lines run from each one to the countries whose food depends on its land. The list under the globe names each one.":
    "今天的武装冲突是赭红色的点，灾害预警是琥珀色的点；细线从每个点连向粮食依赖其土地的国家。地球下方的列表逐一列出它们。",
  // The reviewed armed conflicts' names (worldData.js WAR_NAMES): beside the dot, in the list and as the card's title
  "War in Ukraine": "乌克兰战争",
  "War in Sudan": "苏丹战争",
  "War in Gaza": "加沙战争",
  "Civil war in Myanmar": "缅甸内战",
  "Fighting in eastern DR Congo": "刚果（金）东部的战斗",
  "Insurgency in the central Sahel": "萨赫勒中部的叛乱",
  "Conflict in Somalia": "索马里冲突",
  "War in Yemen": "也门战争",
  "Conflict in Syria": "叙利亚冲突",
  "Fighting in Amhara, Ethiopia": "埃塞俄比亚阿姆哈拉州的战斗",
  "Fighting in South Sudan": "南苏丹的战斗",
  "Insurgency and banditry in northern Nigeria": "尼日利亚北部的叛乱与匪患",
  "Insurgency in Cabo Delgado, Mozambique": "莫桑比克德尔加杜角省的叛乱",
  "Armed gang violence in Haiti": "海地的武装帮派暴力",
  "Insurgency in northwest Pakistan": "巴基斯坦西北部的叛乱",
  "Strikes on southern Lebanon": "对黎巴嫩南部的空袭",
  "Armed groups in Colombia": "哥伦比亚的武装团体",
  // The zoom bar (EarthGlobe.jsx): the whole-Earth button's label and tooltip, then + and -
  "Show the whole Earth": "显示整个地球",
  "Whole Earth": "整个地球",
  "Zoom in": "放大",
  "Zoom out": "缩小",
  // The quiet line on the globe: on a phone after one finger tried to move a zoomed Earth; on a computer while the wheel zooms it
  "Two fingers move the zoomed Earth.": "放大后，用双指移动地球。",
  "Scroll to zoom. Esc to let the page scroll.": "滚动以缩放。按 Esc 恢复页面滚动。",
  // The list of events (EarthGlobe.jsx earth-panel): its name for screen readers, its close button, and the heading that counts each group
  "Today's armed conflicts and disaster alerts": "今天的武装冲突和灾害预警",
  "Close the list": "关闭列表",
  "1 armed conflict": "1 起武装冲突",
  "{n} armed conflicts": "{n} 起武装冲突",
  "1 disaster alert": "1 条灾害预警",
  "{n} disaster alerts": "{n} 条灾害预警",
  // The kinds of event (globeMath.js kindWord, KIND_WORD): the first words of the line under an event's name
  "War": "战争",
  "Armed conflict": "武装冲突",
  "Flood": "洪水",
  "Drought": "干旱",
  "Wildfires": "野火",
  "Storm": "风暴",
  "Earthquake": "地震",
  "Volcano": "火山",
  "Alert": "灾害",
  // GDACS's alert colours (globeMath.js LEVEL_WORD), only before 预警 in the status keys below: 红色预警
  "red": "红色",
  "orange": "橙色",
  "green": "绿色",
  // The months (globeMath.js MONTHS), only inside the date keys below, which add 年 before and 日 after
  "January": "1 月",
  "February": "2 月",
  "March": "3 月",
  "April": "4 月",
  "May": "5 月",
  "June": "6 月",
  "July": "7 月",
  "August": "8 月",
  "September": "9 月",
  "October": "10 月",
  "November": "11 月",
  "December": "12 月",
  // The dates (globeMath.js sinceText, dayMonthYear, spanText): a month and year, a full date, and three spans of days
  "{month} {year}": "{year} 年 {month}",
  "{day} {month} {year}": "{year} 年 {month} {day} 日",
  "{day} to {day2} {month} {year}": "{year} 年 {month} {day} 日至 {day2} 日",
  "{day} {month} to {day2} {month2} {year}": "{year} 年 {month} {day} 日至 {month2} {day2} 日",
  "{from} to {to}": "{from}至 {to}",
  // Under an event's name in the list (globeMath.js statusWords): a war; then an alert still going on, over after a span of days, over after one day, over with no last day, over with no dates, with no dates at all
  "{kind} since {date}": ({ kind, date }) => `${kind}，${dated(date)}至今`,
  "{kind}, {level} alert since {date}": "{kind}，{level}预警，{date}至今",
  "{kind}, {level} alert from {span}": "{kind}，{level}预警，{span}",
  "{kind}, {level} alert on {date}": "{kind}，{level}预警，{date}",
  "{kind}, {level} alert from {date}, now over": "{kind}，{level}预警，始于 {date}，已结束",
  "{kind}, {level} alert, now over": "{kind}，{level}预警，已结束",
  "{kind}, {level} alert": "{kind}，{level}预警",
  // The same line under the card's title (p.earth-card-meta), as a sentence (a war the list has no date for: its kind alone); GDACS named in brackets as the alerts' source
  "{kind} since {date}.": ({ kind, date }) => `${kind}，${dated(date)}至今。`,
  "{kind}.": "{kind}。",
  "{kind}, {level} alert since {date}, GDACS.": "{kind}，{level}预警，{date}至今（GDACS）。",
  "{kind}, {level} alert from {span}, GDACS.": "{kind}，{level}预警，{span}（GDACS）。",
  "{kind}, {level} alert on {date}, GDACS.": "{kind}，{level}预警，{date}（GDACS）。",
  "{kind}, {level} alert from {date}, now over, GDACS.": "{kind}，{level}预警，始于 {date}，已结束（GDACS）。",
  "{kind}, {level} alert, now over, GDACS.": "{kind}，{level}预警，已结束（GDACS）。",
  "{kind}, {level} alert, GDACS.": "{kind}，{level}预警（GDACS）。",
  // Chernozem's own figure in the card for the war in Ukraine (globeMath.js measuredSentence); {ha} and {people} arrive from the browser as 178万 and 120万, so no space before 公顷 and 人
  "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it ({month}).":
    "Chernozem 测得 {ha}公顷黑土严重损毁，这些土地上住着 {people}人（{month}）。",
  "Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it.": "Chernozem 测得 {ha}公顷黑土严重损毁，这些土地上住着 {people}人。",
  "Chernozem measured {ha} ha of black soil heavily damaged ({month}).": "Chernozem 测得 {ha}公顷黑土严重损毁（{month}）。",
  "Chernozem measured {ha} ha of black soil heavily damaged.": "Chernozem 测得 {ha}公顷黑土严重损毁。",
  // The card (EarthGlobe.jsx): the link after the measurement, the link to GDACS's report, the heading over the countries (also the legend's last entry)
  "See it in the demo": "在演示中查看",
  "GDACS report": "GDACS 报告",
  "Whose food depends on it": "谁的粮食依赖这片土地",
  // The countries in the card (globeMath.js cardText): a name with the year of its figure, the line under them about the share, and the stand-in for a nameless country
  "{name} ({year})": "{name}（{year} 年）",
  "The share of each country's farm and food imports that come from {from}, in {year} unless a year is given.":
    "各国农产品和食品进口中来自{from}的份额；除另有标注年份外，均为 {year} 年数据。",
  "The share of each country's farm and food imports that come from {from}.": "各国农产品和食品进口中来自{from}的份额。",
  "this country": "该国",
  // The legend (EarthGlobe.jsx earth-legend): its name for screen readers and its entries (Black soil is also the switch)
  "What the colours show": "颜色的含义",
  "Armed conflicts": "武装冲突",
  "Disaster alerts": "灾害预警",
  "Black soil": "黑土",
  // The button under the globe that opens and closes the list
  "See them all as a list": "以列表查看全部",
  "Hide the list": "隐藏列表",
  // The line under the globe when the feed could not be loaded
  "Today's conflicts and alerts could not be loaded.": "无法加载今天的冲突和预警。",
  // The small print about the sources (EarthGlobe.jsx earth-sources): the Earth's picture, the land, the black soil, the alerts, the conflicts (with the hidden stand-in for the review date), the trade
  "Earth: {link}, public domain.": "地球：{link}，公有领域。",
  "NASA Blue Marble": "NASA“蓝色弹珠”",
  "Land and borders: {link}.": "陆地和边界：{link}。",
  "Natural Earth": "Natural Earth 地图数据",
  "Black soil: {link} (Hengl and Nauman, 2018), {licence}, modified.": "黑土：{link}（Hengl 和 Nauman，2018），{licence}，经修改。",
  "OpenLandMap USDA great groups": "OpenLandMap 的 USDA 土壤大类",
  "Disaster alerts: {link}, live.": "灾害预警：{link}，实时更新。",
  "Armed conflicts: a list reviewed by hand on {date}.": "武装冲突：人工审核的清单，审核日期 {date}。",
  "Armed conflicts: a list reviewed by hand.": "武装冲突：人工审核的清单。",
  "on {date}": "审核日期 {date}",
  "Who buys whose food: World Bank {link}, the latest year each country reported ({years}).": "谁在买谁的粮食：世界银行 {link}，取各国最近报告的年份（{years}）。",
  "Who buys whose food: World Bank {link}, the latest year each country reported.": "谁在买谁的粮食：世界银行 {link}，取各国最近报告的年份。",
  // The screen-reader line of each event in the list (EarthGlobe.jsx lineOf): the name, then the status.
  "{name}: {status}.": "{name}：{status}。",
};
