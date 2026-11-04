// WHAT THIS FILE DOES
// The arithmetic of the condition laboratory on the Methodology page
// (ConditionLab.jsx), as plain functions node can test
// (conditionLab.test.js). It is the app's own Field method
// (src/lib/field/method.js: healthScore, waterScore, conditionScore,
// fieldCondition, conditionClass), written again with the numbers the
// website keeps in src/site/content/site.js (FIELD_METHOD), the way the
// gate laboratory writes Atlas's formulas again: the website does not
// import the app's method (site.js says why). conditionLab.test.js checks
// every answer against method.js's own functions, so the two cannot drift
// apart unnoticed.
//
//   labReading({ healthDelta, waterDelta, stressShare })
//     healthDelta  NDVI minus its normal ("NDVI against normal")
//     waterDelta   NDWI minus its normal ("NDWI against normal")
//     stressShare  the stressed share of the field, 0 to 1
//   -> { health, water, notStressed   the three parts' scores, each held
//                between 0 and 1 (the page's health score, water score
//                and 1 − stressed share)
//        parts   [{ id, weight, score, value }] in the formula's order
//                (plant health, water, not stressed); value = weight x
//                score, so the three values add up to the sum
//        sum     the three added up (method.js conditionScore)
//        score   the field's condition (method.js fieldCondition: a field
//                with high stress is held under "Very good")
//        held    true when that hold lowered it
//        classId, label }   its class
//   classOf(score)  the class a condition falls in (method.js conditionClass)
//   SLIDERS     each slider's range and starting value, in hundredths of
//               the index (a range input steps in whole numbers) or in
//               per cent: from a little past the reading's whole span
//               below normal (score 0) to 0.10 above it (score 1)
//   shownScore(score)  the condition with two decimals, never a number
//               that belongs to the next class (0.8496 is "Good": 0.84)
//   signed(n)   "−0.10", "0.00", "+0.05" (a true minus sign)
//
// An imagined field has a crop and no damage: the app gives a field with
// no crop no condition at all, and holds a damaged one under "Good"; the
// page says so in words beside the laboratory.
//
// WHO EDITS IT
// Whoever changes the condition laboratory. The rules themselves live in
// src/lib/field/method.js; when they change, change FIELD_METHOD in
// site.js (the tests say which value).

import { FIELD_METHOD } from "../content/site.js";

const M = FIELD_METHOD;

// Each reading's slider: from 0.10 past the point where its score reaches
// 0 to 0.10 above normal; the stressed share over all of it. The starting
// field is a little below normal on both readings, with a little stress.
export const SLIDERS = {
  health: { min: -Math.round((M.healthSpan + 0.1) * 100), max: 10, start: -10 },
  water: { min: -Math.round((M.waterSpan + 0.1) * 100), max: 10, start: -5 },
  stress: { min: 0, max: 100, start: 8 },
};

// Between 0 and 1, kept to 6 decimals as the app keeps it (method.js
// clamp01), so arithmetic noise never shows.
const clamp01 = (value) => Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;

// A reading's score against its normal: 1 at or above it, falling to 0 at
// `span` below it (method.js healthScore and waterScore).
const scoreOf = (delta, span) => clamp01(1 + delta / span);

export function classOf(score) {
  return Number.isFinite(score) ? M.classes.find((item) => score < item.upTo) || null : null;
}

export function labReading({ healthDelta = 0, waterDelta = 0, stressShare = 0 } = {}) {
  const health = scoreOf(Number.isFinite(healthDelta) ? healthDelta : 0, M.healthSpan);
  const water = scoreOf(Number.isFinite(waterDelta) ? waterDelta : 0, M.waterSpan);
  const share = Math.min(1, Math.max(0, Number.isFinite(stressShare) ? stressShare : 0));
  const notStressed = 1 - share;
  const w = M.weights;
  const total = w.plantHealth + w.water + w.noStress;
  const parts = [
    { id: "health", weight: w.plantHealth / total, score: health },
    { id: "water", weight: w.water / total, score: water },
    { id: "noStress", weight: w.noStress / total, score: notStressed },
  ].map((part) => ({ ...part, value: part.weight * part.score }));
  // The weighted mean, in the app's own order (method.js conditionScore).
  const sum = clamp01((health * w.plantHealth + water * w.water + notStressed * w.noStress) / total);
  // High stress holds it just under "Very good" (method.js fieldCondition).
  const score = share >= M.stressHighShare ? Math.min(sum, M.stressedMax) : sum;
  const found = classOf(score);
  return {
    health,
    water,
    notStressed,
    parts,
    sum,
    score,
    held: score < sum,
    classId: found ? found.id : null,
    label: found ? found.label : null,
  };
}

// The condition as the laboratory prints it: two decimals, as the class
// boundaries are written (0.40, 0.65, 0.85). Rounded, except just under a
// boundary, where rounding up would print the next class's number beside
// this class's name: 0.8496 is "Good" (under 0.85), so it reads 0.84.
export function shownScore(score) {
  if (!Number.isFinite(score)) return "";
  const rounded = Math.round(score * 100) / 100;
  const same = classOf(rounded)?.id === classOf(score)?.id;
  return (same ? rounded : Math.floor(score * 100) / 100).toFixed(2);
}

// "−0.10", "0.00", "+0.05": signed, with a true minus sign, and never
// "−0.00" for a value that rounds to nothing.
export function signed(n, digits = 2) {
  const text = Math.abs(n).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${n < 0 ? "−" : "+"}${text}`;
}
