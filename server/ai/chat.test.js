// WHAT THIS FILE DOES
// Tests the AI chat (chat.js) without calling the real Claude: a fake
// Claude client plays back scripted replies, and a small in-memory store
// stands in for server/store.js. Checks: no key -> a clear setup message;
// a tool look-up goes round and comes back as text; a refusal becomes a
// polite error; the conversation is saved; Stop saves the part already
// written; "Try again" does not save the question twice. Field chats: the
// farm comes from the server, the Field tools run, and a report's photos
// go to Claude as images.
//
// WHO EDITS IT
// Whoever changes chat.js. Run with: npm test

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import {
  runChat,
  setClientFactory,
  setDepsForTests,
  buildMessages,
  titleFrom,
  requestFor,
  describeError,
  checkBody,
  echoableContent,
  imageBlocks,
  ATLAS_SYSTEM,
  FIELD_SYSTEM,
} from "./chat.js";

// ---------- Stand-ins ----------

function memoryStore({ workspace = {}, areas = {}, runs = {}, farm = null, analyses = {}, reports = [], photos = {} } = {}) {
  const chats = new Map();
  let counter = 0;
  return {
    chats,
    async getFarm() {
      return farm;
    },
    async getFieldAnalysis(id) {
      return analyses[id] || null;
    },
    async getFieldHistory() {
      return null;
    },
    async listReports() {
      return reports;
    },
    async getReport(id) {
      return reports.find((r) => r.id === id) || null;
    },
    async readPhoto(id) {
      return photos[id] ? { buffer: photos[id], type: "image/jpeg" } : null;
    },
    async getWorkspace() {
      return workspace;
    },
    async getArea(id) {
      return areas[id] || null;
    },
    async getRun(id) {
      return runs[id] || null;
    },
    async listRuns(areaId) {
      return Object.values(runs)
        .filter((r) => r.areaId === areaId)
        .sort((a, b) => b.month.localeCompare(a.month))
        .map(({ cells, alerts, ...summary }) => summary);
    },
    async getChat(id) {
      return chats.has(id) ? structuredClone(chats.get(id)) : null;
    },
    async saveChat(chat) {
      chats.set(chat.id, structuredClone(chat));
    },
    async listChats() {
      return [...chats.values()];
    },
    async deleteChat(id) {
      chats.delete(id);
    },
    async newId(prefix) {
      counter += 1;
      return `${prefix}-${String(counter).padStart(8, "0")}`;
    },
  };
}

// A fake stream: plays back the events, then gives the final message.
function fakeStream(message) {
  const events = [];
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      for (const piece of block.text.match(/.{1,8}/gs) || []) {
        events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: piece } });
      }
    } else if (block.type === "tool_use") {
      events.push({ type: "content_block_start", index, content_block: { ...block, input: {} } });
    }
    events.push({ type: "content_block_stop", index });
  });
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    async finalMessage() {
      return message;
    },
  };
}

// A fake Claude client that answers with the scripted replies in order and
// records every request.
function fakeClient(replies) {
  const requests = [];
  return {
    requests,
    beta: {
      messages: {
        stream(params) {
          requests.push(structuredClone(params));
          const next = replies.shift();
          if (!next) throw new Error("no more scripted replies");
          if (next instanceof Error) throw next;
          return fakeStream(next);
        },
      },
    },
  };
}

const CELLS = [
  { id: "r0c0", lat: 49.1, lon: 37.1, wrb: 0.9, agOutput: 0.8, firms: 0.7, chi: 0.6, distance: 0.8, blackSoilHa: 900, heavyDamageHa: 300, croplandHa: 1000, people: 50, peopleOnDamagedSoil: 10, admin1: "Kharkiv", admin2: "Izium" },
  { id: "r0c1", lat: 49.1, lon: 37.2, wrb: 0.8, agOutput: 0.7, firms: 0.6, chi: 0.5, distance: 0.7, blackSoilHa: 800, heavyDamageHa: 200, croplandHa: 900, people: 40, peopleOnDamagedSoil: 8 },
  { id: "r1c0", lat: 49.0, lon: 37.1, wrb: 0.3, agOutput: 0.4, firms: 0.1, chi: 0.1, distance: 0.1, blackSoilHa: 300, heavyDamageHa: 10, croplandHa: 500, people: 20, peopleOnDamagedSoil: 1 },
  { id: "r1c1", lat: 49.0, lon: 37.2, wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.3, distance: 0.9, blackSoilHa: 400, heavyDamageHa: 40, croplandHa: 600, people: 30, peopleOnDamagedSoil: 3 },
];

function sampleStore() {
  const run = (id, month, scale) => ({
    id,
    areaId: "area-test",
    month,
    label: month,
    provider: "sample",
    cellSizeDeg: 0.1,
    cellSizeKm: 7.2,
    cellCount: CELLS.length,
    totals: { croplandHa: 3000, blackSoilHa: 2400, heavyDamageHa: 550 * scale, peopleOnDamagedSoil: 22 },
    newHeavyDamageHa: 10,
    alertsCount: 1,
    checks: { passed: 3, total: 3, warnings: [] },
    cells: CELLS.map((c) => ({ ...c, heavyDamageHa: c.heavyDamageHa * scale })),
    alerts: [{ id: "a1", kind: "fire", date: `${month}-12`, lat: 49.1, lon: 37.1, place: "Izium, Kharkiv", cellIds: ["r0c0"], magnitude: 14, unit: "detections" }],
  });
  return memoryStore({
    workspace: { currentAreaId: "area-test", settings: { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30 }, budgetUsd: 10000000 },
    areas: { "area-test": { id: "area-test", name: "Testland", kind: "custom", source: "bbox", areaHa: 4000 } },
    runs: { "run-a": run("run-a", "2026-08", 1), "run-b": run("run-b", "2026-09", 1.2) },
  });
}

function collector() {
  const events = [];
  const send = (event, data) => events.push({ event, data });
  return { events, send, of: (name) => events.filter((e) => e.event === name).map((e) => e.data) };
}

const keyConfig = () => ({ anthropicKey: "sk-test", claudeModel: "claude-opus-5-5" });

beforeEach(() => {
  setClientFactory(null);
  setDepsForTests({});
});

// ---------- Tests ----------

test("no API key gives ai_not_configured with the setup steps, and saves nothing", async () => {
  const store = memoryStore();
  setDepsForTests({ store, config: () => ({ anthropicKey: null }) });
  let made = false;
  setClientFactory(() => {
    made = true;
  });
  const out = collector();
  await runChat({ product: "atlas", message: "Hello" }, out.send);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].event, "error");
  assert.equal(out.events[0].data.code, "ai_not_configured");
  assert.match(out.events[0].data.message, /console\.anthropic\.com/);
  assert.match(out.events[0].data.message, /ANTHROPIC_API_KEY=/);
  assert.match(out.events[0].data.message, /\.env/);
  assert.match(out.events[0].data.message, /npm run dev/);
  assert.equal(made, false);
  assert.equal(store.chats.size, 0);
});

test("a tool round trip sends one tool_result message, then streams the text, and saves the thread", async () => {
  const store = sampleStore();
  const client = fakeClient([
    {
      role: "assistant",
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Checking." },
        { type: "tool_use", id: "toolu_1", name: "get_ranking", input: { timeframe: "nearTerm", limit: 3 } },
        { type: "tool_use", id: "toolu_2", name: "get_history", input: {} },
      ],
    },
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Start with Izium, Kharkiv." }] },
  ]);
  setDepsForTests({ store, config: keyConfig, runs: { compareRuns: () => ({}) } });
  setClientFactory(() => client);
  const out = collector();
  await runChat({ product: "atlas", message: "Where should we start?", context: {} }, out.send);

  // Events: thread first, tool progress, text, done.
  assert.equal(out.events[0].event, "thread");
  assert.deepEqual(out.of("tool").map((t) => `${t.name}:${t.status}`), [
    "get_ranking:running",
    "get_history:running",
    "get_ranking:done",
    "get_history:done",
  ]);
  assert.equal(out.of("delta").map((d) => d.text).join(""), "Checking.\n\nStart with Izium, Kharkiv.");
  assert.equal(out.of("error").length, 0);
  const done = out.of("done")[0];
  assert.ok(done.threadId && done.messageId);

  // The second request carries the full assistant content and ONE user
  // message holding both tool results.
  assert.equal(client.requests.length, 2);
  const second = client.requests[1].messages;
  const assistant = second[second.length - 2];
  const results = second[second.length - 1];
  assert.equal(assistant.role, "assistant");
  assert.equal(assistant.content.length, 4);
  assert.equal(assistant.content[0].type, "thinking");
  assert.equal(results.role, "user");
  assert.deepEqual(results.content.map((r) => [r.type, r.tool_use_id]), [
    ["tool_result", "toolu_1"],
    ["tool_result", "toolu_2"],
  ]);
  const ranking = JSON.parse(results.content[0].content);
  assert.equal(ranking.places.length >= 1, true);
  assert.equal(ranking.places[0].label, "Izium, Kharkiv");
  const history = JSON.parse(results.content[1].content);
  assert.deepEqual(history.months.map((m) => m.month), ["2026-09", "2026-08"]);

  // Request shape follows the Claude API docs.
  const first = client.requests[0];
  assert.equal(first.model, "claude-opus-5-5");
  assert.equal(first.max_tokens, 16000);
  assert.deepEqual(first.thinking, { type: "adaptive" });
  assert.deepEqual(first.output_config, { effort: "medium" });
  assert.deepEqual(first.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(first.fallbacks, "default");
  assert.equal(first.system[0].text, ATLAS_SYSTEM);
  assert.deepEqual(first.system[0].cache_control, { type: "ephemeral" });
  assert.equal(first.tool_choice, undefined);
  assert.equal(first.temperature, undefined);
  for (const tool of first.tools) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.additionalProperties, false);
  }
  assert.match(first.messages[0].content[0].text, /Testland/);
  assert.match(first.messages[0].content[0].text, /SAMPLE DATA/);

  // Saved: the question and the final answer.
  const saved = store.chats.get(done.threadId);
  assert.equal(saved.title, "Where should we start?");
  assert.equal(saved.product, "atlas");
  assert.deepEqual(saved.messages.map((m) => [m.role, m.text]), [
    ["user", "Where should we start?"],
    ["assistant", "Checking.\n\nStart with Izium, Kharkiv."],
  ]);
  assert.equal(saved.messages[1].id, done.messageId);
});

test("continuing a thread sends the earlier messages and keeps one thread", async () => {
  const store = sampleStore();
  const client = fakeClient([
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "First answer." }] },
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Second answer." }] },
  ]);
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const one = collector();
  await runChat({ product: "atlas", message: "Question one" }, one.send);
  const threadId = one.of("thread")[0].threadId;
  const two = collector();
  await runChat({ product: "atlas", threadId, message: "Question two" }, two.send);
  assert.equal(two.of("thread")[0].threadId, threadId);
  assert.equal(store.chats.size, 1);
  const msgs = client.requests[1].messages;
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[0].content[1].text, "Question one");
  assert.equal(msgs[2].content, "Question two");
  assert.equal(store.chats.get(threadId).messages.length, 4);
});

test("a refusal gives a polite ai_refused error and saves no answer", async () => {
  const store = sampleStore();
  const client = fakeClient([
    { role: "assistant", stop_reason: "refusal", stop_details: { type: "refusal", category: null }, content: [{ type: "text", text: "partial" }] },
  ]);
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const out = collector();
  await runChat({ product: "atlas", message: "Something" }, out.send);
  const error = out.of("error")[0];
  assert.equal(error.code, "ai_refused");
  assert.equal(out.of("done").length, 0);
  const saved = [...store.chats.values()][0];
  assert.deepEqual(saved.messages.map((m) => m.role), ["user"]);
});

test("a bad key becomes ai_bad_key, a rate limit ai_rate_limited", async () => {
  const headers = new Headers();
  const auth = new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "bad" } }, "bad", headers);
  const rate = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow" } }, "slow", headers);
  assert.equal(describeError(auth).code, "ai_bad_key");
  assert.equal(describeError(rate).code, "ai_rate_limited");
  assert.equal(describeError(new Error("x")).code, "ai_error");

  const store = sampleStore();
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => fakeClient([auth]));
  const out = collector();
  await runChat({ product: "atlas", message: "Hi" }, out.send);
  assert.equal(out.of("error")[0].code, "ai_bad_key");
});

// ---------- Field ----------

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 8)]);

function farmStore(extra = {}) {
  return memoryStore({
    farm: {
      id: "farm-1",
      name: "Hill Farm",
      location: { label: "Kupiansk", lat: 49.73, lon: 37.54 },
      units: "ha",
      fields: [
        { id: "fld-aaaa1111", name: "Field 1", areaHa: 40, crop: "Winter wheat" },
        { id: "fld-bbbb2222", name: "Field 2", areaHa: 25, crop: "Sunflower" },
      ],
    },
    analyses: {
      "fld-aaaa1111": {
        fieldId: "fld-aaaa1111",
        provider: "sample",
        plantHealth: { ndvi: 0.61, normal: { low: 0.55, high: 0.7, median: 0.6 }, versus: "normal" },
        water: { ndwi: 0.2, normal: { low: 0.15, high: 0.25, median: 0.2 }, versus: "normal" },
        stress: { share: 0.01, level: "low", stressedHa: 0.4, patches: [] },
        harvest: { stage: "growing" },
        condition: { score: 0.9, class: "great" },
        damage: { detected: false },
        status: { id: "healthy", label: "Healthy", tone: "green" },
      },
      "fld-bbbb2222": {
        fieldId: "fld-bbbb2222",
        provider: "sample",
        plantHealth: { ndvi: 0.3, normal: { low: 0.5, high: 0.6, median: 0.55 }, versus: "below" },
        water: { ndwi: 0.02, normal: { low: 0.1, high: 0.2, median: 0.15 }, versus: "below" },
        stress: { share: 0.2, level: "high", stressedHa: 5, patches: [] },
        harvest: { stage: "growing" },
        condition: { score: 0.3, class: "poor" },
        damage: { detected: true, radarChangedShare: 0.3, firesSinceWar: 4, chiDrop: 0.2, damagedHa: 7.5 },
        status: { id: "recovery", label: "Needs recovery", tone: "red" },
      },
    },
    ...extra,
  });
}

test("Field without an API key gives ai_not_configured", async () => {
  setDepsForTests({ store: farmStore(), config: () => ({ anthropicKey: "" }) });
  const out = collector();
  await runChat({ product: "field", message: "Which field needs attention?" }, out.send);
  assert.deepEqual(out.events.map((e) => [e.event, e.data.code]), [["error", "ai_not_configured"]]);
});

test("Field chats answer from the server's farm data and run the Field tools", async () => {
  const store = farmStore();
  const client = fakeClient([
    {
      role: "assistant",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_f1", name: "get_field", input: { name_or_id: "Field 2" } }],
    },
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Field 2 needs recovery." }] },
  ]);
  setDepsForTests({ store, config: keyConfig, getWeather: async () => ({ current: { tempC: 9, label: "Clear" }, rain: null, daily: [] }) });
  setClientFactory(() => client);
  const out = collector();
  // A farm summary sent by the page is ignored: the server's data is used.
  await runChat({ product: "field", message: "Which field needs attention?", context: { farm: "Field Z: 999 ha" } }, out.send);
  assert.equal(out.of("error").length, 0, JSON.stringify(out.of("error")));
  assert.equal(out.of("delta").map((d) => d.text).join(""), "Field 2 needs recovery.");

  const first = client.requests[0];
  assert.equal(first.system[0].text, FIELD_SYSTEM);
  assert.match(FIELD_SYSTEM, /Never say a field or any land is free of mines/);
  assert.match(FIELD_SYSTEM, /SAMPLE DATA/);
  assert.deepEqual(first.tools.map((t) => t.name), ["get_field", "get_field_history", "get_weather", "get_reports"]);
  for (const tool of first.tools) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.additionalProperties, false);
  }
  assert.deepEqual(first.thinking, { type: "adaptive" });
  assert.deepEqual(first.output_config, { effort: "medium" });
  assert.equal(first.fallbacks, "default");
  const contextText = first.messages[0].content[0].text;
  assert.match(contextText, /Hill Farm/);
  assert.match(contextText, /SAMPLE DATA/);
  assert.match(contextText, /Field 2 .*Status: Needs recovery/);
  assert.match(contextText, /Weather now: 9°C, Clear/);
  assert.doesNotMatch(contextText, /999 ha/);
  assert.equal(first.messages[0].content.some((b) => b.type === "image"), false);

  // The tool answer went back with the field's details.
  const result = client.requests[1].messages.at(-1).content[0];
  assert.equal(result.type, "tool_result");
  assert.equal(result.tool_use_id, "toolu_f1");
  const detail = JSON.parse(result.content);
  assert.equal(detail.field.name, "Field 2");
  assert.equal(detail.status, "Needs recovery");
  assert.deepEqual(detail.damage.recoveryCostUsd, { fast: [713, 2175], full: [1950, 4650] });
  assert.equal([...store.chats.values()][0].product, "field");
});

test("a Field chat about a report sends its photos as images before the text, on every turn", async () => {
  const store = farmStore({
    reports: [{ id: "rep-abc12345", fieldId: "fld-bbbb2222", kind: "shelling", text: "Crater by the gate", photos: ["ph-1", "ph-2"], createdAt: "2026-10-17T09:00:00Z" }],
    photos: { "ph-1": JPEG, "ph-2": PNG },
  });
  const client = fakeClient([
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "I can see a crater." }] },
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Stay off it." }] },
  ]);
  setDepsForTests({ store, config: keyConfig, getWeather: async () => null });
  setClientFactory(() => client);
  const one = collector();
  await runChat({ product: "field", message: "What do you see in my photos?", context: { reportId: "rep-abc12345" } }, one.send);
  assert.equal(one.of("error").length, 0, JSON.stringify(one.of("error")));
  const threadId = one.of("thread")[0].threadId;
  assert.equal(store.chats.get(threadId).reportId, "rep-abc12345");

  const content = client.requests[0].messages[0].content;
  assert.deepEqual(content.map((b) => b.type), ["image", "image", "text", "text"]);
  assert.deepEqual(content[0].source, { type: "base64", media_type: "image/jpeg", data: JPEG.toString("base64") });
  assert.equal(content[1].source.media_type, "image/png");
  assert.match(content[2].text, /This chat is about the farmer's report: .*Crater by the gate/);
  assert.match(content[2].text, /Its 2 photos are attached above/);
  assert.equal(content[3].text, "What do you see in my photos?");

  // The next turn (no reportId sent) still shows the photos.
  await runChat({ product: "field", threadId, message: "Is it safe to plough?" }, collector().send);
  const again = client.requests[1].messages;
  assert.deepEqual(again.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(again[0].content.filter((b) => b.type === "image").length, 2);
  assert.equal(again[2].content, "Is it safe to plough?");
});

test("imageBlocks keeps at most 4 JPEG/PNG/WebP images", () => {
  const img = (media_type) => ({ media_type, data: "AAAA" });
  const blocks = imageBlocks([img("image/jpeg"), img("image/gif"), img("image/png"), img("image/webp"), { media_type: "image/png", data: "" }, img("image/jpeg"), img("image/png")]);
  assert.deepEqual(blocks.map((b) => b.source.media_type), ["image/jpeg", "image/png", "image/webp", "image/jpeg"]);
  assert.deepEqual(blocks[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
  assert.deepEqual(imageBlocks(null), []);
  // Atlas messages carry no images.
  const msgs = buildMessages([], "q", "CTX");
  assert.deepEqual(msgs[0].content.map((b) => b.type), ["text", "text"]);
});

test("the tool loop stops after 6 rounds", async () => {
  const store = sampleStore();
  const toolTurn = (i) => ({
    role: "assistant",
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: `toolu_${i}`, name: "get_history", input: {} }],
  });
  const client = fakeClient(Array.from({ length: 10 }, (_, i) => toolTurn(i)));
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const out = collector();
  await runChat({ product: "atlas", message: "Loop" }, out.send);
  assert.equal(client.requests.length, 7);
  assert.equal(out.of("done").length, 1);
});

test("helpers: titles, message building, body checks, request shape", () => {
  assert.equal(titleFrom("  short   question "), "short question");
  const long = "x".repeat(100);
  assert.equal(titleFrom(long).length, 60);

  const msgs = buildMessages(
    [
      { role: "assistant", text: "orphan" },
      { role: "user", text: "a" },
      { role: "user", text: "b" },
      { role: "assistant", text: "c" },
    ],
    "d",
    "CTX"
  );
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[0].content[0].text, "<context>\nCTX\n</context>");
  assert.equal(msgs[0].content[1].text, "a\n\nb");

  assert.equal(checkBody({ product: "atlas", message: "hi" }), null);
  assert.ok(checkBody({ message: "" }));
  assert.ok(checkBody({ product: "x", message: "hi" }));

  const params = requestFor({ model: "m", system: "S", tools: [], messages: [] });
  assert.equal(params.tools, undefined);
});

// ---------- The real SDK against a local stand-in for the Claude API ----------
// Checks the actual wiring: headers, the streamed events, finalMessage(),
// and the SDK's typed errors.


function sseBody(message) {
  const lines = [];
  const push = (type, data) => lines.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  push("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      push("content_block_start", { index, content_block: { type: "text", text: "" } });
      push("content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
    } else {
      push("content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      push("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    push("content_block_stop", { index });
  });
  push("message_delta", { delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } });
  push("message_stop", {});
  return lines.join("");
}

async function fakeApi(handler) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    seen.push({ headers: req.headers, body: JSON.parse(raw || "{}") });
    handler(seen.length, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { seen, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test("real SDK: streams a tool round trip and sends the right request", async () => {
  const api = await fakeApi((n, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (n === 1) {
      res.end(sseBody({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_9", name: "get_history", input: {} }] }));
    } else {
      res.end(sseBody({ stop_reason: "end_turn", content: [{ type: "text", text: "Damage grew." }] }));
    }
  });
  try {
    const store = sampleStore();
    setDepsForTests({ store, config: keyConfig });
    setClientFactory((apiKey) => new Anthropic({ apiKey, baseURL: api.url, maxRetries: 0 }));
    const out = collector();
    await runChat({ product: "atlas", message: "Trend?" }, out.send);
    assert.equal(out.of("error").length, 0, JSON.stringify(out.of("error")));
    assert.equal(out.of("delta").map((d) => d.text).join(""), "Damage grew.");
    assert.equal(api.seen.length, 2);
    const first = api.seen[0];
    assert.equal(first.headers["x-api-key"], "sk-test");
    assert.match(first.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
    assert.equal(first.body.stream, true);
    assert.equal(first.body.betas, undefined); // sent as the header, not in the body
    assert.equal(first.body.fallbacks, "default");
    const second = api.seen[1].body.messages;
    assert.equal(second.at(-2).content[0].type, "tool_use");
    assert.equal(second.at(-1).content[0].type, "tool_result");
    assert.equal(second.at(-1).content[0].tool_use_id, "toolu_9");
  } finally {
    await api.close();
  }
});

test("real SDK: a 401 becomes ai_bad_key", async () => {
  const api = await fakeApi((n, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  });
  try {
    setDepsForTests({ store: sampleStore(), config: keyConfig });
    setClientFactory((apiKey) => new Anthropic({ apiKey, baseURL: api.url, maxRetries: 0 }));
    const out = collector();
    await runChat({ product: "atlas", message: "Hi" }, out.send);
    assert.equal(out.of("error")[0]?.code, "ai_bad_key");
  } finally {
    await api.close();
  }
});

test("after a mid-answer fallback, blocks of the declining model are not echoed or run", async () => {
  // Pure filter first.
  const content = [
    { type: "thinking", thinking: "", signature: "a" },
    { type: "text", text: "Looking." },
    { type: "tool_use", id: "toolu_old", name: "get_history", input: {} },
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} },
    { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] },
    { type: "server_tool_use", id: "srv_2", name: "web_search", input: {} },
    { type: "redacted_thinking", data: "x" },
    { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } },
    { type: "thinking", thinking: "", signature: "b" },
    { type: "tool_use", id: "toolu_new", name: "get_ranking", input: { timeframe: "nearTerm", limit: 3 } },
  ];
  assert.deepEqual(
    echoableContent(content).map((b) => b.id || b.type),
    ["text", "srv_1", "web_search_tool_result", "fallback", "thinking", "toolu_new"],
  );
  const plain = [{ type: "thinking" }, { type: "tool_use", id: "t" }];
  assert.equal(echoableContent(plain), plain);

  // In the loop: only the new model's tool runs, and the echo is filtered.
  const store = sampleStore();
  const client = fakeClient([
    { role: "assistant", stop_reason: "tool_use", content },
    { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] },
  ]);
  setDepsForTests({ store, config: keyConfig, runs: { compareRuns: () => ({}) } });
  setClientFactory(() => client);
  const out = collector();
  await runChat({ product: "atlas", message: "Where?", context: {} }, out.send);
  assert.equal(out.of("error").length, 0);
  const second = client.requests[1].messages;
  const echoed = second[second.length - 2].content;
  assert.equal(echoed.some((b) => b.id === "toolu_old"), false);
  assert.equal(echoed.filter((b) => b.type === "thinking").length, 1);
  assert.deepEqual(second[second.length - 1].content.map((r) => r.tool_use_id), ["toolu_new"]);
  assert.ok(out.of("tool").some((t) => t.name === "get_history" && t.status === "skipped"));
});

test("Stop saves the part of the answer written so far, marked stopped", async () => {
  const store = sampleStore();
  const controller = new AbortController();
  // A stream that writes two pieces, then waits until it is stopped.
  const client = {
    beta: {
      messages: {
        stream(_params, { signal }) {
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Start with " } };
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Izium" } };
              await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
              throw Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" });
            },
            async finalMessage() {
              throw new Error("not reached");
            },
          };
        },
      },
    },
  };
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const out = collector();
  const running = runChat({ product: "atlas", message: "Where first?" }, out.send, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await running;
  assert.equal(out.of("error").length, 0);
  const saved = [...store.chats.values()][0];
  assert.deepEqual(saved.messages.map((m) => [m.role, m.text, Boolean(m.stopped)]), [
    ["user", "Where first?", false],
    ["assistant", "Start with Izium", true],
  ]);
});

test("Stop before any text saves only the question", async () => {
  const store = sampleStore();
  const controller = new AbortController();
  controller.abort();
  const client = {
    beta: {
      messages: {
        stream() {
          throw Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" });
        },
      },
    },
  };
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const out = collector();
  await runChat({ product: "atlas", message: "Where first?" }, out.send, { signal: controller.signal });
  const saved = [...store.chats.values()][0];
  assert.deepEqual(saved.messages.map((m) => m.role), ["user"]);
});

test("Try again after a failed answer does not save the question twice", async () => {
  const store = sampleStore();
  const headers = new Headers();
  const busy = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow" } }, "slow", headers);
  const client = fakeClient([busy, { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Izium first." }] }]);
  setDepsForTests({ store, config: keyConfig });
  setClientFactory(() => client);
  const one = collector();
  await runChat({ product: "atlas", message: "Where first?" }, one.send);
  assert.equal(one.of("error")[0].code, "ai_rate_limited");
  const threadId = one.of("thread")[0].threadId;
  const two = collector();
  await runChat({ product: "atlas", threadId, message: "Where first?" }, two.send);
  assert.equal(two.of("done").length, 1);
  const saved = store.chats.get(threadId);
  assert.deepEqual(saved.messages.map((m) => [m.role, m.text]), [
    ["user", "Where first?"],
    ["assistant", "Izium first."],
  ]);
  // Claude also gets the question once.
  const sent = client.requests[1].messages;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content[1].text, "Where first?");
  // Asking the same thing again after it WAS answered is a new question.
  setClientFactory(() => fakeClient([{ role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Still Izium." }] }]));
  await runChat({ product: "atlas", threadId, message: "Where first?" }, collector().send);
  assert.equal(store.chats.get(threadId).messages.filter((m) => m.role === "user").length, 2);
});
