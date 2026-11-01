// WHAT THIS FILE DOES
// An AAC encoder starts every sound with a short lead-in ("priming": 2112
// samples, 44 ms at 48 kHz) that players must skip. The .m4a from afconvert
// says so in its iTunes tag "iTunSMPB" (moov/udta/meta/ilst). AVFoundation's
// passthrough export (mux.swift) leaves that tag out of an .mp4, so the
// film carries no word about the priming: Apple's players skip it anyway,
// but Chrome plays it and the voice comes 44 ms late.
//
// This copies the m4a's udta box (the tag, nothing else) to the end of the
// film's moov box, and moves every chunk offset (stco/co64) on by the same
// number of bytes, since the film's index sits in front of its data. No
// sample is touched: the video and the sound bytes are the same, only
// later in the file.
//
//   node addsmpb.mjs <film.mp4> <sound.m4a> <out.mp4>
//
// WHO EDITS IT
// Nobody, normally.
import { readFileSync, writeFileSync } from "node:fs";

const [filmPath, soundPath, outPath] = process.argv.slice(2);
const film = readFileSync(filmPath);
const sound = readFileSync(soundPath);

function boxes(buf, start, end) {
  const list = [];
  let i = start;
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    let head = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(i + 8)); head = 16; }
    if (size === 0) size = end - i;
    if (size < head || i + size > end) throw new Error(`bad box ${type} at ${i}`);
    list.push({ type, start: i, body: i + head, end: i + size });
    i += size;
  }
  return list;
}

const top = boxes(film, 0, film.length);
const moov = top.find((b) => b.type === "moov");
const mdat = top.find((b) => b.type === "mdat");
if (!moov || !mdat || moov.start > mdat.start) throw new Error("expected the moov box before the mdat box");
if (moov.body - moov.start !== 8) throw new Error("64-bit moov size not handled");
if (boxes(film, moov.body, moov.end).some((b) => b.type === "udta")) throw new Error("the film already has a udta box");

const soundMoov = boxes(sound, 0, sound.length).find((b) => b.type === "moov");
const udta = boxes(sound, soundMoov.body, soundMoov.end).find((b) => b.type === "udta");
if (!udta) throw new Error("the m4a has no udta box");
const tag = sound.subarray(udta.start, udta.end);
if (!tag.includes(Buffer.from("iTunSMPB"))) throw new Error("the m4a's udta has no iTunSMPB");
const delta = tag.length;

// The new moov: the old one with the tag at its end, every chunk offset + delta.
const newMoov = Buffer.concat([film.subarray(moov.start, moov.end), tag]);
newMoov.writeUInt32BE(newMoov.length, 0);
const CONTAINERS = new Set(["trak", "mdia", "minf", "stbl", "edts", "dinf"]);
let moved = 0;
(function walk(start, end) {
  for (const b of boxes(newMoov, start, end)) {
    if (CONTAINERS.has(b.type)) walk(b.body, b.end);
    if (b.type === "stco" || b.type === "co64") {
      const n = newMoov.readUInt32BE(b.body + 4);
      for (let k = 0; k < n; k++) {
        if (b.type === "stco") {
          const at = b.body + 8 + k * 4;
          const value = newMoov.readUInt32BE(at) + delta;
          if (value > 0xffffffff) throw new Error("offset too large for stco");
          newMoov.writeUInt32BE(value, at);
        } else {
          const at = b.body + 8 + k * 8;
          newMoov.writeBigUInt64BE(newMoov.readBigUInt64BE(at) + BigInt(delta), at);
        }
        moved += 1;
      }
    }
  }
})(8, film.length > 0 ? moov.end - moov.start : 0);

const out = Buffer.concat([film.subarray(0, moov.start), newMoov, film.subarray(moov.end)]);
writeFileSync(outPath, out);
console.log(`${outPath}: added the ${delta}-byte iTunSMPB tag; ${moved} chunk offsets moved on by ${delta}; ${film.length} -> ${out.length} bytes`);
