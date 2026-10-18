// WHAT THIS FILE DOES
// Builds the short farm summary the Field AI reads with every question
// (sent as context.farm to POST /api/chat). It picks the useful facts out
// of the Field data (src/data/farm.js): the farm, each field and its
// status, this week's next steps and the recovery plan. It leaves out
// display-only things (colours, map positions, button labels) so the AI
// gets a compact, readable summary.
//
// WHO EDITS IT
// Danny. When the Field data becomes real, pass the real data in; the
// summary keeps the same shape. Tested in farmSummary.test.js.
//
// HOW TO CALL IT
//   import * as farmData from "../../data/farm.js";
//   buildFarmSummary(farmData, "Field 7")   // focus: a field name or "Whole farm"

export function buildFarmSummary({ farm, fields = [], recoveryPlan, nextSteps = [] }, focus = "Whole farm") {
  const fieldName = (id) => fields.find((field) => field.id === id)?.name || id;
  const summary = {
    focus,
    name: farm?.name,
    district: farm?.district,
    today: farm?.today,
    totalHa: farm?.totalHa,
    weather: [farm?.weather?.display, farm?.weather?.note].filter(Boolean).join(". "),
    fields: fields.map((field) => ({
      name: field.name,
      crop: field.crop,
      areaHa: field.areaHa,
      status: field.statusLabel,
      sown: field.sownOn,
      soil: field.soil,
    })),
    nextSteps: nextSteps.map((step) => ({ task: step.title, field: step.field, when: step.when, note: step.help })),
  };
  if (recoveryPlan) {
    const path = (p) =>
      p && {
        name: p.name,
        steps: p.steps,
        costPerHa: [p.costPerHa, p.costUnit].filter(Boolean).join(" "),
        total: p.total,
        replant: p.replant,
      };
    summary.recoveryPlan = {
      field: fieldName(recoveryPlan.fieldId),
      situation: recoveryPlan.subline,
      warning: recoveryPlan.warning?.text,
      chosenPath: recoveryPlan.paths?.[recoveryPlan.selectedPath]?.name,
      paths: [path(recoveryPlan.paths?.fast), path(recoveryPlan.paths?.full)].filter(Boolean),
      progress: recoveryPlan.progress?.display,
    };
  }
  return summary;
}
