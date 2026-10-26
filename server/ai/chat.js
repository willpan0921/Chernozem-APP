// WHAT THIS FILE DOES
// The AI chat. It answers these web addresses:
//   POST   /api/chat        send a message; the reply streams back as it is written
//   GET    /api/chats       the saved conversations (?product=atlas or field)
//   GET    /api/chats/:id   one conversation ({ thread: null } when it is gone)
//   DELETE /api/chats/:id   delete one
//
// How a message is answered:
//   1. The conversation is loaded (or started) and the question is saved.
//   2. The facts are gathered on the server: for the Atlas (context.js) the
//      current run, scored with the user's weights; for Field
//      (field-context.js) the saved farm, its fields' analyses, weather and
//      reports. A Field chat opened about a "Tell us what happened" report
//      (context.reportId) also carries that report's photos as images.
//   3. Claude is asked, streaming. While it writes, each piece of text is
//      sent on to the page ("delta" events). When Claude wants to look
//      something up it calls a tool; we run it, give back the answer, and
//      ask again (at most 6 rounds).
//   4. The final answer is saved to the conversation. If the person
//      presses Stop, what was written so far is saved instead, marked
//      "stopped", so a reload shows the same thing as the screen did.
//   Sending the same question again after a failed answer ("Try again")
//   does not save it twice: the unanswered question is reused.
//
// The reply is a stream of events: thread, delta, tool, done, error.
// Without ANTHROPIC_API_KEY in .env the stream sends one "ai_not_configured"
// error that says exactly how to add it.
//
// WHO EDITS IT
// Whoever changes how the AI talks. The AI's instructions are the
// ATLAS_SYSTEM and FIELD_SYSTEM texts below; what it knows is in context.js
// (Atlas) and field-context.js (Field).

import Anthropic from "@anthropic-ai/sdk";
import { buildAtlasContext } from "./context.js";
import { buildFieldContext } from "./field-context.js";

// ---------- Settings ----------

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6; // tool look-ups per answer
const HISTORY_LIMIT = 20; // earlier messages sent back to Claude
const MAX_MESSAGE_CHARS = 4000;
const SAFE_ID = /^[a-z0-9-]{1,64}$/;

export const NOT_CONFIGURED_MESSAGE =
  "The AI is not connected yet. 1. Get an API key at console.anthropic.com (API keys). " +
  "2. Add ANTHROPIC_API_KEY=... to the .env file in the project folder. " +
  "3. Restart npm run dev.";

// The AI's standing instructions. Kept fixed (no dates or numbers in them)
// so Claude can cache them; the facts go in the first message instead.
export const ATLAS_SYSTEM = `You are the analyst inside Chernozem Atlas, a tool that helps government officials, city planners and companies decide where to restore damaged black-soil (chernozem) farmland, anywhere in the world.

How to answer:
- Be concise: a short direct answer first, then at most a few bullet points. Plain language for officials, no jargon, no formulas unless asked.
- Use only the facts in the context block and the tools. Quote real numbers (hectares, people, scores, months) and name places. If something is not in the data, say so plainly.
- Use the tools to look up rankings, a specific place, month-to-month changes, budgets and history rather than guessing.
- Scores are 0 to 100 and depend on the user's current weights for value (soil value: black soil and how much is farmed), damage and Feasibility. Feasibility means safe access: in a war, the distance to fighting (there call it "Feasibility (safe access: distance to fighting)" the first time). "Near term" leaves the least feasible places out for now (the Feasibility cutoff) and ranks the rest by value and damage only; "postwar" (called "long term" where no war is listed) blends all three. Quote the weights as the context's "Weights as used" line gives them.
- What the damage score and Feasibility mean depends on the area: follow the "War:" line (in a war, damage is unusual fire and radar change against the normal years 2019 to 2021; at peace, the heavily damaged share of the black soil).
- The map can show whole states or districts as well as squares; the scores and places in the context are squares unless they say otherwise.
- Top places are groups of touching map squares; give their size in squares when two share a name.
- If the data source is SAMPLE DATA, say once that the numbers are sample data for testing, not real measurements.
- Never say land is safe or cleared. Feasibility (safe access) is an estimate of the distance to fighting, never a safety check.
- Follow the "War:" line of the context block. When it names a war, only certified deminers can declare land safe, and costs exclude demining; when it says the user's team set that war (Atlas Settings), say so. When it says no war covers the area (none in the app's list, or the team marked it as not at war), do not bring up a war, a front line, fighting or demining unless the user does; Feasibility is then not measured (full everywhere), which does not make the land safe.
- When the context has a "Disaster:" line instead (a flood, wildfire, drought, storm, earthquake or landslide the user's team set), that is the area's crisis: follow its words for damage and Feasibility, say the team set it, and never bring up a war, fighting, a front line or demining unless the user does. Feasibility there is what satellites see in the way now (land under water, a fire burning nearby), never proof that land is safe or can be worked.`;

export const FIELD_SYSTEM = `You are the farming assistant inside Chernozem Field, an app that watches a farmer's black-soil (chernozem) fields from satellite images every few days and compares them with the normal years 2019 to 2021, anywhere in the world.

How to answer:
- Short and plain. A direct answer first, then at most a few short bullet points. Words a farmer uses: say "plant health" and "water in the plants" rather than NDVI and NDWI unless the farmer uses those words. No formulas unless asked.
- Use only the farm data in the context block and the tools. Quote real numbers from it (hectares, dates, days to harvest, millimetres of rain) and name the fields. If something is not in the data, say so plainly; do not guess.
- Use the tools for one field's full readings and season curve, its monthly history since 2019, the weather forecast and the farmer's reports.
- If the data source is SAMPLE DATA, say once, briefly, that the numbers are sample data for testing, not real satellite readings.
- Photos the farmer sent are attached as images. Say what you can actually see and what it may mean; say when a photo is unclear.
- A crop marked "detected" is the satellite's best guess from when the field greened up, peaked and dried down (and its radar return), "likely" or "possible": say so when it matters, and that the farmer can set the real crop in Settings.
- Stress "No crop" means the field is harvested or not sown: there is nothing growing to be stressed, which is neither good nor bad.
- A satellite cannot name a pest or a disease. Stress whose likely cause is "not water" means: check that part of the field on the ground for pests or disease. The pest and disease risk is a forecast from the weather (hours of wet, warm weather; insect degree-days), not a detection: call it a risk.
- Say what a harvest date rests on (the plant-health dry-down, heat units since green-up, or the radar, which sees through cloud) and that it is an estimate.
- Never say a field or any land is free of mines or unexploded ordnance, or that it is safe to enter. Satellites cannot see mines.
- Follow the context block's war line. When it names a known war at the farm and a field shows damage, or the farmer mentions shelling, craters, metal pieces or anything suspicious, tell them to stay off it and call the local demining or emergency service before any work (in Ukraine, the State Emergency Service on 101). When no war is recorded, "damage" means unusual fire or ground change from any cause: talk about the likely farm causes (harvest, tillage, fire, flood, hail) and do not bring up war or demining unless the farmer does; if they mention anything suspicious, still tell them to stay away and call the local emergency services.
- Recovery costs are rough ranges in US dollars; in a war zone they do not include demining.`;

// ---------- Swappable parts (for tests) ----------

// Makes the Claude client. Tests swap in a fake with setClientFactory().
let clientFactory = (apiKey) => new Anthropic({ apiKey });
let clientCache = { key: null, client: null };
export function setClientFactory(fn) {
  clientFactory = fn || ((apiKey) => new Anthropic({ apiKey }));
  clientCache = { key: null, client: null };
}
function getClient(apiKey) {
  if (clientCache.key !== apiKey || !clientCache.client) clientCache = { key: apiKey, client: clientFactory(apiKey) };
  return clientCache.client;
}

// The server modules this file uses. Loaded on first use so the tests can
// swap in stand-ins with setDepsForTests({ store, runs, config }).
let depOverrides = {};
export function setDepsForTests(overrides) {
  depOverrides = overrides || {};
}
async function deps() {
  return {
    store: depOverrides.store || (await import("../store.js")),
    runs: depOverrides.runs || (await import("../runs.js").catch(() => null)),
    config: depOverrides.config || (await import("../env.js")).config,
    // (farm) -> weather | null for the Field AI; field-context.js finds the
    // real one itself when this is not set.
    getWeather: depOverrides.getWeather,
  };
}

// ---------- Routes ----------

// Handles every /api/chat* address. Gives back true when it answered.
export async function handleChatRoutes(req, res, url) {
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api/chat" && path !== "/api/chats" && !path.startsWith("/api/chats/")) return false;
  const http = await import("../http.js");

  try {
    const { store } = await deps();

    if (path === "/api/chat") {
      if (req.method !== "POST") {
        http.sendError(res, 405, "method_not_allowed", "Use POST.");
        return true;
      }
      let body;
      try {
        body = await http.readJson(req);
      } catch (error) {
        http.sendError(res, error.status || 400, error.code || "bad_json", error.status ? error.message : "The request body must be JSON.");
        return true;
      }
      const problem = checkBody(body);
      if (problem) {
        http.sendError(res, 400, "bad_request", problem);
        return true;
      }
      const sse = http.openSse(res);
      // Stop asking Claude if the page goes away mid-answer.
      const abort = new AbortController();
      res.on("close", () => abort.abort());
      try {
        await runChat(body, (event, data) => {
          if (!abort.signal.aborted) sse.send(event, data);
        }, { signal: abort.signal });
      } finally {
        sse.close();
      }
      return true;
    }

    if (path === "/api/chats") {
      if (req.method !== "GET") {
        http.sendError(res, 405, "method_not_allowed", "Use GET.");
        return true;
      }
      const product = url.searchParams.get("product") === "field" ? "field" : "atlas";
      http.sendJson(res, 200, { threads: await store.listChats(product) });
      return true;
    }

    // /api/chats/:id
    const id = decodeURIComponent(path.slice("/api/chats/".length));
    const thread = SAFE_ID.test(id) ? await store.getChat(id) : null;
    // A link to a deleted chat answers { thread: null } (not an error), so
    // the page quietly opens a new chat instead.
    if (!thread && req.method === "GET") {
      http.sendJson(res, 200, { thread: null });
      return true;
    }
    if (!thread) {
      http.sendError(res, 404, "not_found", "No such conversation.");
      return true;
    }
    if (req.method === "GET") {
      http.sendJson(res, 200, { thread });
    } else if (req.method === "DELETE") {
      await store.deleteChat(id);
      http.sendJson(res, 200, { ok: true });
    } else {
      http.sendError(res, 405, "method_not_allowed", "Use GET or DELETE.");
    }
    return true;
  } catch (error) {
    console.error("[chat]", error);
    if (!res.headersSent) http.sendError(res, 500, "server_error", "Something went wrong with the chat.");
    else res.end();
    return true;
  }
}

// Gives back a problem with the request body, or null when it is fine.
export function checkBody(body) {
  if (!body || typeof body !== "object") return "Send { product, message, context }.";
  if (body.product !== undefined && body.product !== "atlas" && body.product !== "field") return 'product must be "atlas" or "field".';
  if (typeof body.message !== "string" || !body.message.trim()) return "Type a message first.";
  if (body.message.length > MAX_MESSAGE_CHARS) return `Messages can be at most ${MAX_MESSAGE_CHARS} characters.`;
  if (body.threadId !== undefined && body.threadId !== null && typeof body.threadId !== "string") return "threadId must be text.";
  if (body.context !== undefined && body.context !== null && typeof body.context !== "object") return "context must be an object.";
  return null;
}

// ---------- Answering one message ----------

// Answers one message. send(event, data) delivers each event to the page.
// Never throws: problems become an "error" event.
export async function runChat(body, send, { signal } = {}) {
  const { store, runs, config, getWeather } = await deps();
  const cfg = config();
  const product = body.product === "field" ? "field" : "atlas";
  const message = body.message.trim();

  if (!cfg.anthropicKey) {
    send("error", { code: "ai_not_configured", message: NOT_CONFIGURED_MESSAGE });
    return;
  }

  // 1. The conversation: continue it, or start a new one.
  let thread = null;
  try {
    thread = await openThread(store, body, product, message);
  } catch (error) {
    console.error("[chat] could not save the conversation", error);
    send("error", { code: "ai_error", message: "Could not save the conversation on the server." });
    return;
  }
  send("thread", { threadId: thread.id, title: thread.title });
  const history = thread.messages.slice(0, -1).slice(-HISTORY_LIMIT);

  // Everything written so far, so a stopped answer can still be saved.
  let partial = "";
  const relay = (event, data) => {
    if (event === "delta") partial += data?.text || "";
    send(event, data);
  };

  try {
    // 2. The facts.
    let contextBlock;
    let tools = [];
    let images = [];
    let runTool = async () => ({ error: "No tools." });
    if (product === "atlas") {
      const atlas = await buildAtlasContext({ store, runs, context: body.context || {} });
      contextBlock = atlas.text;
      tools = atlas.tools;
      runTool = atlas.runTool;
    } else {
      // Built from the saved farm on the server. The report a chat was
      // opened about stays with the chat, so its photos are seen every turn.
      const field = await buildFieldContext({ store, reportId: thread.reportId || null, ...(getWeather ? { getWeather } : {}) });
      contextBlock = field.text;
      tools = field.tools;
      runTool = field.runTool;
      images = field.images || [];
    }

    // 3. Ask Claude.
    const client = getClient(cfg.anthropicKey);
    const model = cfg.claudeModel || DEFAULT_MODEL;
    const messages = buildMessages(history, message, contextBlock, images);
    const system = product === "atlas" ? ATLAS_SYSTEM : FIELD_SYSTEM;
    const result = await toolLoop({ client, model, system, tools, messages, runTool, send: relay, signal });
    if (signal?.aborted) {
      await saveStopped(store, thread, partial);
      return;
    }

    if (result.refused) {
      send("error", {
        code: "ai_refused",
        message: "Claude could not help with that request. Try asking it a different way.",
      });
      return;
    }

    // 4. Save the answer.
    let text = result.text.trim();
    if (!text) text = "I could not put together an answer. Please try asking again.";
    const reply = { id: await store.newId("msg"), role: "assistant", text, at: new Date().toISOString() };
    thread.messages.push(reply);
    thread.updatedAt = reply.at;
    await store.saveChat(thread);
    send("done", { threadId: thread.id, messageId: reply.id });
  } catch (error) {
    if (signal?.aborted) {
      await saveStopped(store, thread, partial);
      return;
    }
    send("error", describeError(error));
  }
}

// The person pressed Stop: save the part of the answer they saw, marked
// "stopped" (the chat shows a "Stopped" tag under it). Nothing written yet
// means nothing to save.
async function saveStopped(store, thread, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  try {
    const at = new Date().toISOString();
    thread.messages.push({ id: await store.newId("msg"), role: "assistant", text: clean, at, stopped: true });
    thread.updatedAt = at;
    await store.saveChat(thread);
  } catch (error) {
    console.error("[chat] could not save the stopped answer", error);
  }
}

// Continues the conversation, or starts a new one, and saves the question.
async function openThread(store, body, product, message) {
  let thread = null;
  if (typeof body.threadId === "string" && SAFE_ID.test(body.threadId)) {
    thread = await Promise.resolve(store.getChat(body.threadId)).catch(() => null);
    if (thread && thread.product !== product) thread = null;
  }
  const now = new Date().toISOString();
  if (!thread) {
    thread = { id: await store.newId("chat"), product, title: titleFrom(message), createdAt: now, updatedAt: now, messages: [] };
  }
  // A Field chat opened from "Tell us what happened" remembers its report.
  const reportId = body.context?.reportId;
  if (product === "field" && !thread.reportId && typeof reportId === "string" && SAFE_ID.test(reportId)) {
    thread.reportId = reportId;
  }
  if (!Array.isArray(thread.messages)) thread.messages = [];
  const last = thread.messages[thread.messages.length - 1];
  if (last?.role === "user" && last.text === message) {
    // The same question again right after it got no answer ("Try again"):
    // keep the one already saved instead of adding a copy.
    last.at = now;
  } else {
    thread.messages.push({ id: await store.newId("msg"), role: "user", text: message, at: now });
  }
  thread.updatedAt = now;
  await store.saveChat(thread);
  return thread;
}

// The first question, trimmed, becomes the conversation's title.
export function titleFrom(message) {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length <= 60 ? flat : `${flat.slice(0, 59).trimEnd()}…`;
}

// Turns saved messages into Claude's format. The facts go at the top of the
// first user message, after any photos (at most 4 images, each
// { media_type, data } in base64). Messages of the same role in a row are
// merged, and the list always starts with the user.
export function buildMessages(history, message, contextBlock, images = []) {
  const turns = [...history.filter((m) => m && typeof m.text === "string" && m.text.trim()), { role: "user", text: message }];
  while (turns.length && turns[0].role !== "user") turns.shift();
  const merged = [];
  for (const turn of turns) {
    const role = turn.role === "assistant" ? "assistant" : "user";
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.text += `\n\n${turn.text}`;
    else merged.push({ role, text: turn.text });
  }
  return merged.map((turn, index) => {
    if (index === 0) {
      return {
        role: "user",
        content: [
          ...imageBlocks(images),
          { type: "text", text: `<context>\n${contextBlock}\n</context>` },
          { type: "text", text: turn.text },
        ],
      };
    }
    return { role: turn.role, content: turn.text };
  });
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Photos as Claude image blocks (base64), at most 4, known types only.
export function imageBlocks(images) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => image && IMAGE_TYPES.has(image.media_type) && typeof image.data === "string" && image.data)
    .slice(0, 4)
    .map((image) => ({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } }));
}

// The request to Claude for one round. Kept in one place so it is easy to
// check against the Claude API docs.
export function requestFor({ model, system, tools, messages }) {
  const params = {
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (tools.length) params.tools = tools;
  return params;
}

// When Claude switches to a fallback model part-way through a reply (the
// server-side fallback), the reply holds a "fallback" block at the switch.
// Per the Claude API docs ("Echoing fallback turns back"), what the
// declining model wrote before the last fallback block is not sent back,
// except its text and server-tool calls that have their result: thinking,
// redacted_thinking, tool_use, an unanswered server_tool_use and any other
// model-internal block are left out. Everything from the switch on is kept.
// Gives back a new list (or the same one when there was no switch).
export function echoableContent(content) {
  if (!Array.isArray(content)) return content;
  const cut = content.findLastIndex((block) => block?.type === "fallback");
  if (cut < 0) return content;
  const serverCalls = new Set(content.filter((block) => block?.type === "server_tool_use").map((block) => block.id));
  const answered = new Set(content.filter((block) => block?.tool_use_id && serverCalls.has(block.tool_use_id)).map((block) => block.tool_use_id));
  return content.filter((block, i) => {
    if (i >= cut) return true;
    if (block?.type === "text") return true;
    if (block?.type === "server_tool_use") return answered.has(block.id);
    if (block?.tool_use_id) return answered.has(block.tool_use_id);
    return false;
  });
}

// The back-and-forth with Claude: stream a reply, run any tools it asks
// for, send all their answers back in one message, repeat.
// Gives back { text, refused }.
async function toolLoop({ client, model, system, tools, messages, runTool, send, signal }) {
  let text = "";
  let toolRounds = 0;
  let continuations = 0;

  while (true) {
    const stream = client.beta.messages.stream(requestFor({ model, system, tools, messages }), { signal });
    let roundText = "";
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block?.type === "text") {
        // A new paragraph after earlier text (e.g. after a tool look-up).
        if ((text + roundText).trim() && !(text + roundText).endsWith("\n")) {
          roundText += "\n\n";
          send("delta", { text: "\n\n" });
        }
      } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        send("tool", { name: event.content_block.name, status: "running" });
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        roundText += event.delta.text;
        send("delta", { text: event.delta.text });
      }
    }
    const response = await stream.finalMessage();

    // A refusal can arrive part-way through; the partial text is dropped.
    if (response.stop_reason === "refusal") return { text: "", refused: true };
    text += roundText;

    // Keep the whole reply (thinking and tool calls included) in the history,
    // minus what a declining model wrote before a fallback switch.
    const content = echoableContent(response.content);
    messages.push({ role: "assistant", content });

    if (response.stop_reason === "pause_turn" && continuations < MAX_TOOL_ROUNDS) {
      continuations += 1;
      continue;
    }

    // Only tool calls from the model that is answering now are run.
    const toolUses = content.filter((block) => block.type === "tool_use");
    for (const block of response.content) {
      if (block.type === "tool_use" && !toolUses.includes(block)) send("tool", { name: block.name, status: "skipped" });
    }
    if (response.stop_reason === "tool_use" && toolUses.length) {
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        const note = "\n\n(I stopped looking things up here. Ask a narrower question for more detail.)";
        send("delta", { text: note });
        return { text: text + note, refused: false };
      }
      toolRounds += 1;
      const results = [];
      for (const use of toolUses) {
        let output;
        let failed = false;
        try {
          output = await runTool(use.name, use.input || {});
          failed = Boolean(output?.error);
        } catch (error) {
          console.error(`[chat] tool ${use.name} failed`, error);
          output = { error: "The look-up failed on the server." };
          failed = true;
        }
        send("tool", { name: use.name, status: failed ? "error" : "done" });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(output),
          ...(failed ? { is_error: true } : {}),
        });
      }
      // All the answers go back together, in a single user message.
      messages.push({ role: "user", content: results });
      continue;
    }

    if (response.stop_reason === "max_tokens") {
      const note = "\n\n(The answer was cut short.)";
      send("delta", { text: note });
      return { text: text + note, refused: false };
    }
    return { text, refused: false };
  }
}

// Turns an error into the event the page shows. Uses the SDK's error types.
export function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      code: "ai_bad_key",
      message: "Claude did not accept the API key. Check ANTHROPIC_API_KEY in the .env file, then restart npm run dev.",
    };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { code: "ai_bad_key", message: "This API key is not allowed to use Claude here. Check your account at console.anthropic.com." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "ai_rate_limited", message: "Claude is busy right now. Wait a minute and try again." };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { code: "ai_error", message: "The Claude model in CLAUDE_MODEL is not available to this account. Remove CLAUDE_MODEL from .env to use the default." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "ai_error", message: "Could not reach Claude. Check the internet connection and try again." };
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[chat] Claude API error", error.status, error.message);
    return { code: "ai_error", message: `Claude returned an error${error.status ? ` (${error.status})` : ""}. Try again in a moment.` };
  }
  console.error("[chat]", error);
  return { code: "ai_error", message: "Something went wrong while answering. Try again." };
}
