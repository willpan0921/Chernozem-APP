// WHAT THIS FILE DOES
// The Field AI page (/field/ai): a farmer's chat with Chernozem AI (Claude)
// about their farm. It is the shared chat screen (src/components/chat) and
// uses the same AI server as the Atlas, as product "field". Every question
// is sent with a short summary of the farm (fields, their status, this
// week's steps and the recovery plan), built from src/data/farm.js, so the
// answers are about this farm. The "Whole farm ⌄" chip under the message
// box says which field the question is about.
//
// WHO EDITS IT
// Danny owns the chat building blocks in src/components/chat. The starter
// questions and the message-box text are in src/data/chats.js; the farm
// facts are in src/data/farm.js.

import { useMemo, useState } from "react";
import "./AiPage.css";
import ChatScreen from "../../components/chat/ChatScreen.jsx";
import * as farmData from "../../data/farm.js";
import { buildFarmSummary } from "../../lib/chat/farmSummary.js";
import { composer, fieldSuggestions } from "../../data/chats.js";

const WHOLE_FARM = "Whole farm";
const focusOptions = [{ value: WHOLE_FARM, label: WHOLE_FARM }, ...farmData.fields.map((field) => ({ value: field.name, label: field.name }))];

export default function AiPage() {
  const [focus, setFocus] = useState(WHOLE_FARM);
  const context = useMemo(() => ({ farm: buildFarmSummary(farmData, focus) }), [focus]);

  const { farm, fields, recoveryPlan } = farmData;
  const recoveryField = farmData.fieldById(recoveryPlan.fieldId);
  const using = [
    { key: "farm", icon: "wheat", label: "Farm", value: `${farm.name} · ${farm.totalHaDisplay}`, to: "/field" },
    { key: "fields", icon: "layout-grid", label: "Fields", value: `${fields.length} fields`, to: "/field/fields" },
    { key: "recovery", icon: "shield", label: "Recovery", value: recoveryField?.name || "–", to: "/field/fields" },
    { key: "weather", icon: "cloud", label: "Weather", value: farm.weather.display },
  ];
  const chips = [{ kind: "field", label: "Field", value: focus, options: focusOptions, onChange: setFocus }];

  return (
    <div className="ai-page">
      <ChatScreen
        product="field"
        context={context}
        text={composer.field}
        suggestions={fieldSuggestions}
        using={using}
        chips={chips}
      />
    </div>
  );
}
