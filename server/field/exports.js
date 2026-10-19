// WHAT THIS FILE DOES
// The Field downloads (Data page):
//   fieldsGeoJson(farm, analyses)   every field outline with its status and readings
//   readingsCsv(farm, analyses)     this season's clear passes: field, date, ndvi, ndwi, clearPct
//   historyCsv(farm, histories)     monthly means since 2019: field, month, ndvi, ndwi, clearPct
// analyses / histories are maps fieldId -> the stored object.
//
// WHO EDITS IT
// Whoever adds a column. Keep the column names short and stable: people
// open these in spreadsheets.

// One CSV value: quoted when it holds a comma, quote or line break; a
// leading = + - @ is defused so spreadsheets never run it as a formula.
export function csvValue(value) {
  if (value == null) return "";
  let text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== "number") text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (values) => values.map(csvValue).join(",");

export function fieldsGeoJson(farm, analyses = {}) {
  return {
    type: "FeatureCollection",
    features: (farm?.fields || []).map((field) => {
      const a = analyses[field.id];
      return {
        type: "Feature",
        id: field.id,
        properties: {
          id: field.id,
          name: field.name,
          crop: field.crop,
          areaHa: field.areaHa,
          status: a?.status?.label ?? null,
          condition: a?.condition?.score ?? null,
          ndvi: a?.plantHealth?.ndvi ?? null,
          ndwi: a?.water?.ndwi ?? null,
          stressedHa: a?.stress?.stressedHa ?? null,
          damaged: a?.damage?.detected ?? null,
          latestPass: a?.latestPass?.date ?? null,
          source: a?.provider ?? null,
        },
        geometry: field.geometry,
      };
    }),
  };
}

export function readingsCsv(farm, analyses = {}) {
  const lines = [csvLine(["field", "date", "ndvi", "ndwi", "clearPct"])];
  for (const field of farm?.fields || []) {
    for (const pass of analyses[field.id]?.season || []) lines.push(csvLine([field.name, pass.date, pass.ndvi, pass.ndwi, pass.clearPct]));
  }
  return `${lines.join("\n")}\n`;
}

export function historyCsv(farm, histories = {}) {
  const lines = [csvLine(["field", "month", "ndvi", "ndwi", "clearPct"])];
  for (const field of farm?.fields || []) {
    for (const month of histories[field.id]?.months || []) lines.push(csvLine([field.name, month.month, month.ndvi, month.ndwi, month.clearPct]));
  }
  return `${lines.join("\n")}\n`;
}
