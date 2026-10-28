// WHAT THIS FILE DOES
// Tests server/field/images.js: a real PNG, JPEG or WebP header gives its
// kind and size; the right first bytes followed by junk give nothing; so
// does anything else. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes images.js.

import test from "node:test";
import assert from "node:assert/strict";
import { imageInfo } from "./images.js";

// A real 1 x 1 PNG (67 bytes).
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// A PNG header that says it is `width` x `height` pixels (the rest of the
// 1 x 1 file follows; only the header is read).
function pngOf(width, height) {
  const b = Buffer.from(PNG_1x1);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

// The smallest JPEG shape: start, an APP0 segment, a frame header (SOF0)
// of `width` x `height`, the scan, the end.
function jpegOf(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, sos, Buffer.from([0xff, 0xd9])]);
}

// A lossless WebP (VP8L) header of `width` x `height`.
function webpLosslessOf(width, height) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8L", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return b;
}

test("a real PNG, JPEG and WebP header give their kind and size", () => {
  assert.deepEqual(imageInfo(PNG_1x1), { kind: "png", width: 1, height: 1 });
  assert.deepEqual(imageInfo(pngOf(4000, 3000)), { kind: "png", width: 4000, height: 3000 });
  assert.deepEqual(imageInfo(jpegOf(640, 480)), { kind: "jpg", width: 640, height: 480 });
  // A JPEG with padding bytes and a restart marker before the frame header.
  const padded = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xd0]), jpegOf(12, 34).subarray(2)]);
  assert.deepEqual(imageInfo(padded), { kind: "jpg", width: 12, height: 34 });
  assert.deepEqual(imageInfo(webpLosslessOf(300, 200)), { kind: "webp", width: 300, height: 200 });

  // Lossy WebP: the frame tag, the start code 9D 01 2A, then the size.
  const lossy = Buffer.alloc(30);
  lossy.write("RIFF", 0, "latin1");
  lossy.write("WEBP", 8, "latin1");
  lossy.write("VP8 ", 12, "latin1");
  lossy.set([0x9d, 0x01, 0x2a], 23);
  lossy.writeUInt16LE(1920, 26);
  lossy.writeUInt16LE(1080, 28);
  assert.deepEqual(imageInfo(lossy), { kind: "webp", width: 1920, height: 1080 });

  // Extended WebP: the canvas size in 24 bits each.
  const extended = Buffer.alloc(30);
  extended.write("RIFF", 0, "latin1");
  extended.write("WEBP", 8, "latin1");
  extended.write("VP8X", 12, "latin1");
  extended.writeUIntLE(8999, 24, 3);
  extended.writeUIntLE(0, 27, 3);
  assert.deepEqual(imageInfo(extended), { kind: "webp", width: 9000, height: 1 });
});

test("the right first bytes followed by junk, and anything else, give nothing", () => {
  assert.equal(imageInfo(Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.alloc(1000)])), null, "PNG magic plus junk");
  assert.equal(imageInfo(Buffer.concat([PNG_1x1.subarray(0, 12), Buffer.from("IDAT"), Buffer.alloc(100)])), null, "PNG without IHDR first");
  assert.equal(imageInfo(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1000)])), null, "JPEG magic plus junk");
  assert.equal(imageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null, "a JPEG with no frame");
  assert.equal(imageInfo(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08]), Buffer.alloc(100)])), null, "picture data before any frame header");
  assert.equal(imageInfo(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(100)])), null, "WebP magic plus junk");
  const lossyNoStart = Buffer.alloc(30);
  lossyNoStart.write("RIFF", 0, "latin1");
  lossyNoStart.write("WEBP", 8, "latin1");
  lossyNoStart.write("VP8 ", 12, "latin1");
  assert.equal(imageInfo(lossyNoStart), null, "lossy WebP without the start code");
  assert.equal(imageInfo(pngOf(0, 10)), null, "no width");
  assert.equal(imageInfo(Buffer.from("<svg onload=alert(1)></svg>")), null);
  assert.equal(imageInfo(Buffer.alloc(0)), null);
  assert.equal(imageInfo(PNG_1x1.subarray(0, 20)), null, "cut before the size");
  assert.equal(imageInfo("not a buffer"), null);
  assert.equal(imageInfo(null), null);
});
