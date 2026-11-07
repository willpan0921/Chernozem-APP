// WHAT THIS FILE DOES
// Chinese for the two laboratories on the website's Methodology page: the
// condition laboratory of the Field part (components/ConditionLab.jsx) and
// the gate laboratory of the Atlas part (components/GateLab.jsx). Keys are
// the English sentences as those files write them. The four class names
// (Poor, Fair, Good, Very good) come from content/site.js and live in
// common.js, not here.
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// component, or the page shows English.

export default {
  // The condition laboratory (ConditionLab.jsx): the instruction and the three sliders
  "One imagined field. Move its NDVI and NDWI against their normal, and the share of it that is stressed, and watch its condition.":
    "一块假想的田。调整它的 NDVI 和 NDWI 相对正常值的高低，以及受胁迫的比例，观察它的状况。",
  "NDVI against normal": "NDVI 对比正常值",
  "NDVI {value} against normal": "NDVI 对比正常值 {value}",
  "NDWI against normal": "NDWI 对比正常值",
  "NDWI {value} against normal": "NDWI 对比正常值 {value}",
  "Stressed share": "受胁迫比例",
  "{n}% of the field stressed": "田块面积的 {n}% 受胁迫",
  // Its readout: the condition, its class, and the line about the hold under the top class
  "Condition": "状况",
  "Class": "等级",
  "High stress: held under {top}.": "高胁迫：等级不会达到“{top}”。",
  // The written sum's three parts (the PARTS constant, beside their colour swatches)
  "Health score": "长势得分",
  "Water score": "水分得分",
  "Not stressed": "未受胁迫",
  // The gate laboratory (GateLab.jsx): the two time frames and the instruction
  "Time frame": "时段",
  "Near term": "近期",
  "Post-crisis": "危机后",
  "One imagined place with value {value} and damage {damage}. Move its feasibility and watch what the two time frames do with it.":
    "一个假想的地点，价值 {value}，损毁 {damage}。调整它的可行性，看两个时段各自怎样对待它。",
  // Its sliders
  "Feasibility of this place": "这个地点的可行性",
  "Feasibility cutoff": "可行性阈值",
  "Feasibility weight": "可行性权重",
  "Value weight": "价值权重",
  "Damage weight": "损毁权重",
  // Its readout: the priority and the gate's state
  "Priority": "优先级",
  "The gate": "门控",
  "Left out": "排除",
  "{n}% open": "开 {n}%",
  "Open": "开",
  "Not used": "未使用",
  // Its chart (the screen reader's name, the axis) and the legend
  "Priority against feasibility for the current settings": "当前设置下，优先级随可行性的变化",
  "Feasibility": "可行性",
  "priority of this place, at every feasibility": "这个地点在不同可行性下的优先级",
  "below the cutoff: left out": "低于阈值：排除",
  "the ramp, width {width}": "渐变区，宽度 {width}",
};
