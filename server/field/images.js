// WHAT THIS FILE DOES
// Reads the first bytes of a photo to say what it really is and how big
// the picture is:
//
//   imageInfo(buffer)  ->  { kind: "png" | "jpg" | "webp", width, height }
//                          or null when the bytes are not one of those
//
// A photo that only starts like an image (the right first bytes, then
// anything) gives null too: the size has to be where the format puts it.
//   PNG   the 8 signature bytes, then the IHDR chunk with width and height
//   JPEG  the segments after the start marker, up to the one that begins
//         the frame (SOF), which carries height and width; the picture
//         data (SOS) or the end (EOI) before any SOF means no image
//   WebP  "RIFF....WEBP", then the first chunk: "VP8 " (lossy, the size
//         after the start code 9D 01 2A), "VP8L" (lossless, 14 bits each
//         after the byte 2F) or "VP8X" (extended, 24 bits each)
// Only the header is looked at, never the whole picture: it is quick on a
// 3.75 MB photo, and it never decodes anything.
//
// Used by server/field/routes.js for the photos of a registered account's
// reports (the demo keeps its quicker first-bytes check).
//
// WHO EDITS IT
// Nobody, normally. Tested in images.test.js.

export function imageInfo(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return pngInfo(buffer) || jpegInfo(buffer) || webpInfo(buffer);
}

// { kind, width, height } when both sides are at least 1 pixel; else null.
function sized(kind, width, height) {
  return width > 0 && height > 0 ? { kind, width, height } : null;
}

function pngInfo(b) {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  // The first chunk must be IHDR, 13 bytes long: width, height, ...
  if (b.readUInt32BE(8) !== 13 || b.toString("latin1", 12, 16) !== "IHDR") return null;
  return sized("png", b.readUInt32BE(16), b.readUInt32BE(20));
}

// The markers that begin a frame (baseline, progressive, lossless...).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegInfo(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    // Padding between segments.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers that carry no data: another start, restarts, TEM.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    // The end, or the picture data, before any frame: not an image.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = b.readUInt16BE(at + 2);
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      // length (2), precision (1), height (2), width (2)
      if (at + 9 > b.length) return null;
      return sized("jpg", b.readUInt16BE(at + 7), b.readUInt16BE(at + 5));
    }
    at += 2 + length;
  }
  return null;
}

function webpInfo(b) {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8 ") {
    // Lossy: a 3-byte frame tag, the start code, then width and height (14 bits each).
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized("webp", b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    // Lossless: the byte 2F, then width - 1 and height - 1 (14 bits each).
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return sized("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") {
    // Extended: flags (1), reserved (3), then width - 1 and height - 1 (24 bits each).
    return sized("webp", b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
  }
  return null;
}
