// WHAT THIS FILE DOES
// Checks the two walkthrough films on the Methodology page and their
// captions, read straight from public/site/film/ (no browser needed):
//   - each film is one picture track and one sound track (the narrated
//     voice and the music), both as long as the film, and the film is as
//     long as walkthroughs.json says;
//   - the sound is AAC, stereo, 48 kHz, and says how long the encoder's
//     lead-in is (its "iTunSMPB" note) while its edit list starts at 0:
//     measured, the voice is then in step with the picture in Safari's
//     engine (AVFoundation) and in Chrome's audio decoder, and 44 ms late in
//     Chrome's video player, too little to hear (an edit list that skips
//     the lead-in fixes Chrome but makes Apple's players skip it twice,
//     44 ms early, which is easier to notice than late);
//   - the film's index is at the front of the file, so a browser can
//     start playing before the whole film has arrived;
//   - each film has its captions file (WebVTT, the narration's words):
//     every caption falls inside the film, none overlaps the next, all sit
//     at the top of the picture (line:5%, clear of the film's own caption
//     bar), each is at most two lines of 48 characters, broken by hand
//     (Chrome does not wrap a caption line that is too wide: it cuts it
//     off at both edges of the picture, at every width);
//   - the narration says nothing the website must not say;
//   - Walkthrough.jsx offers each film's captions as an English track
//     that stays off until the visitor turns it on.
// The small MP4 and WebVTT readers below are tried on made-up input too.
//
// WHO EDITS IT
// Whoever changes a film or its narration.
// Run: node --test src/site/components/walkthroughFiles.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const filmDir = join(root, "public", "site", "film");
const PRODUCTS = ["field", "atlas"];

// ---------- a small MP4 reader ----------

// The boxes between start and end of a buffer: { type, start, body, end }.
export function readBoxes(buf, start = 0, end = buf.length) {
  const boxes = [];
  let i = start;
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    let head = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(i + 8));
      head = 16;
    } else if (size === 0) size = end - i;
    if (size < head || i + size > end) throw new Error(`a broken ${type} box at byte ${i}`);
    boxes.push({ type, start: i, body: i + head, end: i + size });
    i += size;
  }
  return boxes;
}

const childOf = (buf, box, type) => readBoxes(buf, box.body, box.end).find((b) => b.type === type);
const childrenOf = (buf, box, type) => readBoxes(buf, box.body, box.end).filter((b) => b.type === type);

// The order of a file's top-level boxes and its moov box, read without
// loading the whole (25 MB) file.
function readIndex(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const order = [];
    let moov = null;
    let pos = 0;
    const head = Buffer.alloc(16);
    while (pos + 8 <= size) {
      readSync(fd, head, 0, 16, pos);
      let boxSize = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (boxSize === 1) boxSize = Number(head.readBigUInt64BE(8));
      else if (boxSize === 0) boxSize = size - pos;
      order.push(type);
      if (type === "moov") {
        moov = Buffer.alloc(boxSize);
        readSync(fd, moov, 0, boxSize, pos);
      }
      pos += boxSize;
    }
    return { order, moov };
  } finally {
    closeSync(fd);
  }
}

// What a moov box says: the film's length, and each track's kind, length,
// edit list and (for sound) its format, channels and sample rate.
export function describeMoov(moov) {
  const top = { body: 8, end: moov.length };
  const mvhd = childOf(moov, top, "mvhd");
  const v1 = moov[mvhd.body] === 1;
  const movieScale = moov.readUInt32BE(mvhd.body + (v1 ? 20 : 12));
  const movieLength = v1 ? Number(moov.readBigUInt64BE(mvhd.body + 24)) : moov.readUInt32BE(mvhd.body + 16);
  const tracks = childrenOf(moov, top, "trak").map((trak) => {
    const tkhd = childOf(moov, trak, "tkhd");
    const tv1 = moov[tkhd.body] === 1;
    const trackLength = tv1 ? Number(moov.readBigUInt64BE(tkhd.body + 28)) : moov.readUInt32BE(tkhd.body + 20);
    const mdia = childOf(moov, trak, "mdia");
    const hdlr = childOf(moov, mdia, "hdlr");
    const mdhd = childOf(moov, mdia, "mdhd");
    const mv1 = moov[mdhd.body] === 1;
    const mediaScale = moov.readUInt32BE(mdhd.body + (mv1 ? 20 : 12));
    const edits = [];
    const edts = childOf(moov, trak, "edts");
    const elst = edts && childOf(moov, edts, "elst");
    if (elst) {
      const ev1 = moov[elst.body] === 1;
      const n = moov.readUInt32BE(elst.body + 4);
      for (let k = 0; k < n; k++) {
        const at = elst.body + 8 + k * (ev1 ? 20 : 12);
        edits.push({
          seconds: (ev1 ? Number(moov.readBigUInt64BE(at)) : moov.readUInt32BE(at)) / movieScale,
          mediaTime: ev1 ? Number(moov.readBigInt64BE(at + 8)) : moov.readInt32BE(at + 4),
        });
      }
    }
    const stbl = childOf(moov, childOf(moov, mdia, "minf"), "stbl");
    const stsd = childOf(moov, stbl, "stsd");
    const entry = stsd.body + 8; // after version, flags and the entry count
    const format = moov.toString("latin1", entry + 4, entry + 8);
    const track = {
      kind: moov.toString("latin1", hdlr.body + 8, hdlr.body + 12),
      seconds: trackLength / movieScale,
      mediaScale,
      edits,
      format,
    };
    if (track.kind === "soun") {
      track.channels = moov.readUInt16BE(entry + 24);
      track.sampleRate = moov.readUInt32BE(entry + 32) >>> 16;
    }
    return track;
  });
  // The AAC lead-in note: " 00000000 <priming> <padding> <samples> ...".
  const text = moov.toString("latin1");
  const note = /iTunSMPB[\s\S]*?data[\s\S]{8}\s*([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{16})/.exec(text);
  const leadIn = note ? { priming: parseInt(note[2], 16), padding: parseInt(note[3], 16), samples: parseInt(note[4], 16) } : null;
  return { seconds: movieLength / movieScale, tracks, leadIn };
}

// ---------- a small WebVTT reader ----------

// "00:01:12.965" or "01:12.965" -> 72.965
export function vttTime(stamp) {
  const m = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(stamp.trim());
  if (!m) throw new Error(`not a WebVTT time: "${stamp}"`);
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

// The cues of a WebVTT file: [{ start, end, settings, text }] (NOTE, STYLE
// and REGION blocks left out; an identifier line before the times is fine).
export function parseVtt(source) {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) throw new Error("a WebVTT file starts with WEBVTT");
  const cues = [];
  for (const block of text.split(/\n{2,}/).slice(1)) {
    const lines = block.split("\n").filter((line) => line.length > 0);
    if (!lines.length || /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0 || at > 1) throw new Error(`a cue without its times: "${lines[0]}"`);
    const [stamps, ...rest] = lines[at].split(/\s+(?=[a-z]+:)/);
    const [from, to] = stamps.split("-->");
    cues.push({ start: vttTime(from), end: vttTime(to), settings: rest.join(" "), text: lines.slice(at + 1).join("\n") });
  }
  return cues;
}

// ---------- the readers, on made-up input ----------

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}
const u32 = (...values) => Buffer.concat(values.map((v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; }));

test("the MP4 reader: boxes, a film's length, its tracks, their edits and the sound's format", () => {
  const mvhd = box("mvhd", u32(0, 0, 0, 600, 1200), Buffer.alloc(80));
  const trak = (kind, length, scale, edit, entry) =>
    box("trak",
      box("tkhd", u32(0, 0, 0, 1, 0, length), Buffer.alloc(60)),
      box("edts", box("elst", u32(0, 1, length, edit), u32(0x00010000))),
      box("mdia",
        box("mdhd", u32(0, 0, 0, scale, 0), Buffer.alloc(4)),
        box("hdlr", u32(0, 0), Buffer.from(kind, "latin1"), Buffer.alloc(12)),
        box("minf", box("stbl", box("stsd", u32(0, 1), entry)))));
  const avc1 = box("avc1", Buffer.alloc(70));
  const mp4a = box("mp4a", Buffer.alloc(8), Buffer.alloc(8), Buffer.from([0, 2, 0, 16, 0, 0, 0, 0]), u32(48000 * 65536));
  const note = box("udta", box("meta", u32(0), box("ilst", box("----", box("name", u32(0), Buffer.from("iTunSMPB")), box("data", u32(1, 0), Buffer.from(" 00000000 00000840 00000000 00000000001D4C00 00000000"))))));
  const moov = box("moov", mvhd, trak("vide", 1200, 600, 0, avc1), trak("soun", 1200, 48000, 0, mp4a), note);
  assert.deepEqual(readBoxes(moov).map((b) => b.type), ["moov"]);
  const info = describeMoov(moov);
  assert.equal(info.seconds, 2);
  assert.deepEqual(info.tracks.map((t) => [t.kind, t.seconds, t.format]), [["vide", 2, "avc1"], ["soun", 2, "mp4a"]]);
  assert.deepEqual(info.tracks[1].edits, [{ seconds: 2, mediaTime: 0 }]);
  assert.equal(info.tracks[1].channels, 2);
  assert.equal(info.tracks[1].sampleRate, 48000);
  assert.deepEqual(info.leadIn, { priming: 0x840, padding: 0, samples: 0x1d4c00 });
  assert.throws(() => readBoxes(Buffer.from([0, 0, 0, 40, 109, 111, 111, 118])), /broken moov/);
});

test("the WebVTT reader: times, settings, identifiers, notes and broken files", () => {
  assert.equal(vttTime("00:01:12.965"), 72.965);
  assert.equal(vttTime("01:12.965"), 72.965);
  assert.throws(() => vttTime("1:12"), /not a WebVTT time/);
  const cues = parseVtt("WEBVTT\n\nNOTE\nA note --> not a cue.\n\nintro\n00:00:00.500 --> 00:00:02.250 line:5%\nFirst line\nsecond line\n\n00:00:03.000 --> 00:00:04.000\nNo settings\n");
  assert.deepEqual(cues, [
    { start: 0.5, end: 2.25, settings: "line:5%", text: "First line\nsecond line" },
    { start: 3, end: 4, settings: "", text: "No settings" },
  ]);
  assert.throws(() => parseVtt("00:00:00.000 --> 00:00:01.000\nNo header\n"), /starts with WEBVTT/);
});

// ---------- the real films ----------

const films = JSON.parse(readFileSync(join(filmDir, "walkthroughs.json"), "utf8"));

for (const product of PRODUCTS) {
  test(`the ${product} film: one picture track and one sound track, as long as the film and as walkthroughs.json says, index first`, () => {
    const path = join(filmDir, `${product}-walkthrough.mp4`);
    const { order, moov } = readIndex(path);
    assert.ok(moov, `${product}: the film has an index (moov)`);
    assert.ok(order.indexOf("moov") < order.indexOf("mdat"), `${product}: the index comes before the data, so a browser can start at once (${order.join(", ")})`);
    const info = describeMoov(moov);
    const video = info.tracks.filter((t) => t.kind === "vide");
    const sound = info.tracks.filter((t) => t.kind === "soun");
    assert.equal(video.length, 1, `${product}: one picture track`);
    assert.equal(sound.length, 1, `${product}: one sound track`);
    assert.equal(info.tracks.length, 2, `${product}: nothing else`);
    assert.ok(Math.abs(info.seconds - films[product].seconds) <= 0.1, `${product}: the film is ${info.seconds.toFixed(3)} s, walkthroughs.json says ${films[product].seconds} s`);
    // Each track plays for the whole film (its edit, or else its own length).
    const played = (t) => (t.edits.length ? t.edits.reduce((sum, e) => sum + e.seconds, 0) : t.seconds);
    assert.ok(Math.abs(played(video[0]) - info.seconds) <= 0.05, `${product}: the picture runs ${played(video[0]).toFixed(3)} s of ${info.seconds.toFixed(3)} s`);
    assert.ok(Math.abs(played(sound[0]) - info.seconds) <= 0.05, `${product}: the sound runs ${played(sound[0]).toFixed(3)} s of ${info.seconds.toFixed(3)} s`);
    // Every chapter starts inside the film with sound under it.
    for (const chapter of films[product].chapters) assert.ok(chapter.t < played(sound[0]), `${product}: "${chapter.label}" has sound`);
  });

  test(`the ${product} film's sound: AAC, stereo, 48 kHz, with its lead-in declared so the voice keeps step in every browser`, () => {
    const { moov } = readIndex(join(filmDir, `${product}-walkthrough.mp4`));
    const info = describeMoov(moov);
    const sound = info.tracks.find((t) => t.kind === "soun");
    assert.equal(sound.format, "mp4a", `${product}: AAC`);
    assert.equal(sound.channels, 2, `${product}: stereo`);
    assert.equal(sound.sampleRate, 48000, `${product}: 48 kHz`);
    assert.ok(info.leadIn, `${product}: the iTunSMPB note says how long the AAC lead-in is (without it Chrome plays the voice 44 ms late)`);
    assert.ok(info.leadIn.priming > 0 && info.leadIn.priming < 4096, `${product}: a lead-in of ${info.leadIn.priming} samples`);
    assert.ok(Math.abs(info.leadIn.samples / sound.sampleRate - info.seconds) <= 0.05, `${product}: the note's ${info.leadIn.samples} samples are the film's length`);
    assert.deepEqual(sound.edits.map((e) => e.mediaTime), [0], `${product}: the sound's edit starts at 0 (an edit that skips the lead-in makes Apple's players skip it twice)`);
  });

  test(`the ${product} film's captions: the narration, inside the film, in order, never overlapping, at the top, two short lines at most`, () => {
    const path = join(filmDir, `${product}-walkthrough.vtt`);
    assert.ok(existsSync(path), `${product}: ${product}-walkthrough.vtt exists`);
    const cues = parseVtt(readFileSync(path, "utf8"));
    const { moov } = readIndex(join(filmDir, `${product}-walkthrough.mp4`));
    const length = describeMoov(moov).seconds;
    assert.ok(cues.length >= films[product].chapters.length, `${product}: ${cues.length} captions, at least one per chapter`);
    let last = 0;
    for (const cue of cues) {
      assert.ok(cue.start >= 0 && cue.start < cue.end && cue.end <= length, `${product}: "${cue.text}" (${cue.start}-${cue.end} s) is inside the ${length.toFixed(3)} s film`);
      assert.ok(cue.start >= last, `${product}: "${cue.text}" starts at ${cue.start} s, after the caption before it ends (${last} s)`);
      assert.match(cue.settings, /(^|\s)line:5%(\s|$)/, `${product}: "${cue.text}" sits at the top of the picture`);
      const lines = cue.text.split("\n");
      assert.ok(cue.text.trim().length > 0 && lines.length <= 2, `${product}: "${cue.text}" is one or two lines`);
      for (const line of lines) assert.ok(line.length <= 48, `${product}: "${line}" (${line.length} characters) fits across the picture`);
      last = cue.end;
    }
    // Every chapter is narrated: a caption starts within its first 4 s.
    for (const chapter of films[product].chapters) {
      assert.ok(cues.some((cue) => cue.start >= chapter.t - 2.5 && cue.start <= chapter.t + 4), `${product}: "${chapter.label}" is narrated`);
    }
  });
}

const CHALLENGE = ["Congress", "ional"].join("");
const CODE_WORDS = new RegExp(["access code", "with a " + "code", "demo code", "ask for a " + "code"].join("|"), "i");

test("the narration says nothing the website must not say", () => {
  for (const product of PRODUCTS) {
    const words = parseVtt(readFileSync(join(filmDir, `${product}-walkthrough.vtt`), "utf8")).map((cue) => cue.text).join(" ");
    assert.doesNotMatch(words, CODE_WORDS, `${product}: no access code`);
    assert.doesNotMatch(words, new RegExp(CHALLENGE, "i"), `${product}: not the app challenge`);
    assert.doesNotMatch(words, /\b1[23] fields\b|twelve fields/i, `${product}: no field count`);
    assert.doesNotMatch(words, /register for (field|atlas)/i, `${product}: it is "Register for Chernozem" or the address, never "Register for Field"`);
    assert.doesNotMatch(words, /communis/i, `${product}: Ukraine is where Chernozem started`);
  }
});

test("Walkthrough.jsx offers each film's captions as an English track, off until the visitor turns it on", () => {
  const source = readFileSync(join(here, "Walkthrough.jsx"), "utf8");
  for (const product of PRODUCTS) {
    assert.ok(source.includes(`captions: "/site/film/${product}-walkthrough.vtt"`), `${product}: the component knows its captions file`);
  }
  const track = /<track [^>]*\/>/.exec(source)?.[0];
  assert.ok(track, "a <track> inside the film");
  assert.match(track, /kind="captions"/);
  assert.match(track, /src=\{files\.captions\}/);
  assert.match(track, /srcLang="en"/);
  assert.match(track, /label=\{t\("English"\)\}/);
  assert.doesNotMatch(track, /\bdefault\b/, "not on by default");
  const video = source.slice(source.indexOf("<video"), source.indexOf("</video>"));
  assert.ok(video.includes(track), "the track is the film's own");
  assert.match(source, /narrated voice/, "the header says the films have a voice");
  assert.match(source, /music/, "and music");
  assert.doesNotMatch(source, /no narration/, "and no longer says they are silent");
});
