// WHAT THIS FILE DOES
// Ukrainian for the two laboratories on the website's Methodology page:
// the condition laboratory of the Field part (components/ConditionLab.jsx)
// and the gate laboratory of the Atlas part (components/GateLab.jsx). Keys
// are the English sentences as those files write them. The four class
// names (Poor, Fair, Good, Very good) come from content/site.js and live
// in common.js, not here. The gate's states are adjectives agreeing with
// «шлюз» (Відкритий, Закритий), as the glossary has them: states, not
// commands. Numbers the code writes ({value}, {width}) keep its decimal
// point; a percent sign is set off with a no-break space (\u00a0).
//
// WHO EDITS IT
// Whoever changes those words. Keep a key identical to the English in the
// component, or the page shows English.

export default {
  // The condition laboratory (ConditionLab.jsx): the instruction and the three sliders
  "One imagined field. Move its NDVI and NDWI against their normal, and the share of it that is stressed, and watch its condition.":
    "Одне уявне поле. Змінюйте його NDVI й NDWI відносно норми та частку під стресом — і стежте за його станом.",
  "NDVI against normal": "NDVI відносно норми",
  "NDVI {value} against normal": "NDVI {value} відносно норми",
  "NDWI against normal": "NDWI відносно норми",
  "NDWI {value} against normal": "NDWI {value} відносно норми",
  "Stressed share": "Частка під стресом",
  "{n}% of the field stressed": "{n}\u00a0% поля під стресом",
  // Its readout: the condition, its class, and the line about the hold under the top class
  "Condition": "Стан",
  "Class": "Клас",
  "High stress: held under {top}.": "Високий стрес: нижче за «{top}».",
  // The written sum's three parts (the PARTS constant, beside their colour swatches)
  "Health score": "Оцінка здоровʼя",
  "Water score": "Оцінка води",
  "Not stressed": "Без стресу",
  // The gate laboratory (GateLab.jsx): the two time frames and the instruction
  "Time frame": "Період",
  "Near term": "Найближчим часом",
  "Post-crisis": "Після кризи",
  "One imagined place with value {value} and damage {damage}. Move its feasibility and watch what the two time frames do with it.":
    "Одне уявне місце з цінністю {value} і пошкодженням {damage}. Змінюйте його доступність і дивіться, що з ним роблять обидва періоди.",
  // Its sliders
  "Feasibility of this place": "Доступність цього місця",
  "Feasibility cutoff": "Поріг доступності",
  "Feasibility weight": "Вага доступності",
  "Value weight": "Вага цінності",
  "Damage weight": "Вага пошкодження",
  // Its readout: the priority and the gate's state (large bold type in half a column: short)
  "Priority": "Пріоритет",
  "The gate": "Шлюз",
  "Left out": "Закритий",
  "{n}% open": "Відкритий на {n}\u00a0%",
  "Open": "Відкритий",
  "Not used": "Не діє",
  // Its chart (the screen reader's name, the axis) and the legend
  "Priority against feasibility for the current settings": "Пріоритет залежно від доступності за поточних налаштувань",
  "Feasibility": "Доступність",
  "priority of this place, at every feasibility": "пріоритет цього місця залежно від доступності",
  "below the cutoff: left out": "нижче порога: виключено",
  "the ramp, width {width}": "перехідна зона шириною {width}",
};
