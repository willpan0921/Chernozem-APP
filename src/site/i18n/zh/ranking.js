// WHAT THIS FILE DOES
// Chinese for the Ukraine ranking demo (components/DemoRanking.jsx, shown on
// the About and Methodology pages): the two time-frame tabs and the note
// under them, the map's spoken label, the tooltip over an oblast, the colour
// legend, the Top 10 list with its markers and footnote, and the words that
// come from public/site/ukraine-demo.json in English (the 25 unit names, the
// month, Crimea's note). Keys are the English sentences exactly as the
// component or the data has them; the order is the manifest's
// (scratchpad i18n/keys/ranking.json).
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// page or the data, or the page shows English. Oblast names carry 州 so the
// list does not read as a list of cities; Crimea, a republic, has none.

export default {
  // When the data file cannot be downloaded (in place of the whole demo)
  "The demo data is not available right now. Open the app to see the live ranking.": "演示数据暂不可用。请打开应用查看实时排序。",
  // The two tabs (Near term / Post-crisis) and their spoken group label
  "Time frame": "时段",
  "Near term": "近期",
  "Post-crisis": "危机后",
  // The note under the tabs: the gate in the near term, no gate post-crisis
  "The gate: the least feasible {percent}% of black soil is left out for now ({count} oblasts, hatched), then value and damage set the order.":
    "门控：可行性最低的 {percent}% 黑土暂不纳入（{count} 个州，图中以斜线标出），再由价值和损毁决定排序。",
  "The gate: the least feasible {percent}% of black soil is left out for now, then value and damage set the order.":
    "门控：可行性最低的 {percent}% 黑土暂不纳入，再由价值和损毁决定排序。",
  "No gate: all three scores are blended, so the land left out comes back: {list}.": "无门控：三项得分综合计算，因此近期暂不纳入的土地回到排序中：{list}。",
  "{name} #{rank}": "{name}第 {rank} 名",
  "No gate: value, damage and feasibility are blended.": "无门控：价值、损毁和可行性综合计算。",
  // The 25 units of the demo (ukraine-demo.json units[].name): the Top 10
  // rows, the tooltip's title, the note's list and the footnote
  "Cherkasy": "切尔卡瑟州",
  "Chernihiv": "切尔尼戈夫州",
  "Chernivtsi": "切尔诺夫策州",
  "Crimea": "克里米亚",
  "Dnipropetrovsk": "第聂伯罗彼得罗夫斯克州",
  "Donetsk": "顿涅茨克州",
  "Ivano-Frankivsk": "伊万诺-弗兰科夫斯克州",
  "Kharkiv": "哈尔科夫州",
  "Kherson": "赫尔松州",
  "Khmelnytskyi": "赫梅利尼茨基州",
  "Kirovohrad": "基洛沃格勒州",
  "Kyiv": "基辅州",
  "Luhansk": "卢甘斯克州",
  "Lviv": "利沃夫州",
  "Mykolaiv": "尼古拉耶夫州",
  "Odesa": "敖德萨州",
  "Poltava": "波尔塔瓦州",
  "Rivne": "罗夫诺州",
  "Sumy": "苏梅州",
  "Ternopil": "捷尔诺波尔州",
  "Vinnytsia": "文尼察州",
  "Volyn": "沃伦州",
  "Zakarpattia": "外喀尔巴阡州",
  "Zaporizhzhia": "扎波罗热州",
  "Zhytomyr": "日托米尔州",
  // The map's label, read aloud by screen readers
  "Map of Ukraine's oblasts coloured by near-term priority": "乌克兰各州地图，按近期优先级着色",
  "Map of Ukraine's oblasts coloured by post-crisis priority": "乌克兰各州地图，按危机后优先级着色",
  // The tooltip over an oblast: the line under its name (Crimea's note comes
  // from ukraine-demo.json units[].note), the three scores, the last line
  "Not ranked, as in the research paper: occupied since 2014 and outside Ukrainian agricultural reporting.":
    "未排名，与研究论文一致：自 2014 年被占领，不在乌克兰农业统计之内。",
  "Left out for now: among the least feasible": "暂不纳入：可行性最低之列",
  "#{rank} near term": "近期第 {rank} 名",
  "#{rank} post-crisis": "危机后第 {rank} 名",
  "Not ranked": "未排名",
  "Value": "价值",
  "Damage": "损毁",
  "Feasibility": "可行性",
  // {ha} arrives formatted by compactHa: "323,756", or "178万" from a million
  // up. A space goes between digits and a Chinese character (323,756 公顷,
  // 178 万公顷) and none between 万 and 公顷.
  "{ha} ha heavily damaged · {people} people living on damaged black soil": ({ ha }) => {
    const area = String(ha).replace(/(\d)(?=[一-鿿])/, "$1 ");
    const unit = /[一-鿿]$/.test(area) ? "公顷" : " 公顷";
    return `${area}${unit}严重损毁 · {people} 人居住在受损黑土上`;
  },
  // The colour legend under the map: the light end and the dark end
  "Lower priority": "优先级较低",
  "Start here": "从这里开始",
  // The Top 10 list's header; the month comes from ukraine-demo.json area.monthLabel
  "Top {top} of {total} oblasts": "{total} 个州中的前 {top}",
  "September 2026": "2026 年 9 月",
  // The markers at the right of a Top 10 row: ▲ ▼ post-crisis (its hover
  // title), and the near-term arrow to the post-crisis rank (its hover title
  // and the marker itself, kept short for the narrow column)
  "Change from the near-term rank": "相对近期排名的变化",
  "Its post-crisis rank": "它的危机后排名",
  "→ #{rank}": "→ 第 {rank}",
  // The footnote under the list, three sentences joined with a space
  "{count} oblasts are left out of the near-term ranking for now.": "{count} 个州暂不纳入近期排序。",
  "{names} is not ranked, as in the research paper (occupied since 2014).": "{names}未排名，与研究论文一致（自 2014 年被占领）。",
  "Default weights {soil}/{damage}/{access}; the app lets you change them.": "默认权重 {soil}/{damage}/{access}；您可以在应用中更改。",
};
