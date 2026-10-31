// WHAT THIS FILE DOES
// Reads the first bytes of a photo to say what it really is and how big
// the picture is, and takes the hidden details out of a JPEG before it is
// kept:
//
//   imageInfo(buffer)  ->  { kind: "png" | "jpg" | "webp", width, height }
//                          or null when the bytes are not one of those
//   stripJpegMetadata(buffer) -> the same JPEG without what a camera or
//                          phone writes about the photo: APP1 (EXIF, with
//                          the GPS position, the camera and the time, and
//                          XMP), APP13 (IPTC: names, places) and comments.
//                          Only the EXIF Orientation is kept, in a tiny new
//                          EXIF block, so a portrait photo still shows
//                          upright. The picture itself is not touched (no
//                          decoding: the bytes from the scan on are copied
//                          as they are). A file it cannot read, or with
//                          nothing to take out, comes back as it was.
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
// Used by server/field/routes.js for the photos of the reports: imageInfo
// for a registered account's (the owner's keep the quicker first-bytes
// check), stripJpegMetadata for everyone's, so a photo shown on the public
// demo, or kept in an account, never carries where it was taken.
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

// ---------- Taking a JPEG's hidden details out ----------

// The segments that may say who took a photo, where and with what.
const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]);

// The Orientation (1 to 8) in an APP1 EXIF block's first directory, or
// null. payload: the segment after its length.
function exifOrientation(payload) {
  if (payload.length < 14 || payload.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = payload.subarray(6);
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const u16 = (at) => (at + 2 <= tiff.length ? (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at)) : null);
  const u32 = (at) => (at + 4 <= tiff.length ? (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at)) : null);
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  const count = ifd === null ? null : u16(ifd);
  if (count === null) return null;
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    // Tag 0x0112, of type SHORT (3): the value sits in the entry itself.
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// A tiny APP1 EXIF block that says only the Orientation.
function orientationSegment(value) {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); // one entry:
  tiff.writeUInt16BE(0x0112, 10); // Orientation,
  tiff.writeUInt16BE(3, 12); // a SHORT,
  tiff.writeUInt32BE(1, 14); // one of them,
  tiff.writeUInt16BE(value, 18); // this one;
  tiff.writeUInt32BE(0, 22); // no other directory.
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

export function stripJpegMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const parts = [buffer.subarray(0, 2)];
  // Where the new EXIF block goes: after the start, or after JFIF's APP0
  // when that comes first (as JFIF wants).
  let insertAt = 1;
  let removed = false;
  let orientation = null;
  let at = 2;
  while (true) {
    if (at + 4 > buffer.length || buffer[at] !== 0xff) return buffer;
    const marker = buffer[at + 1];
    // Padding between segments.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers that carry no data.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(buffer.subarray(at, at + 2));
      at += 2;
      continue;
    }
    // The end before any picture: nothing to keep apart.
    if (marker === 0xd9) return buffer;
    const length = buffer.readUInt16BE(at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > buffer.length) return buffer;
    // The scan: the picture data and everything after it, as it is.
    if (marker === 0xda) {
      parts.push(buffer.subarray(at));
      break;
    }
    if (METADATA_MARKERS.has(marker)) {
      if (marker === 0xe1 && orientation === null) orientation = exifOrientation(buffer.subarray(at + 4, end));
      removed = true;
    } else {
      parts.push(buffer.subarray(at, end));
      if (marker === 0xe0 && parts.length === 2) insertAt = 2;
    }
    at = end;
  }
  if (!removed) return buffer;
  if (orientation && orientation !== 1) parts.splice(insertAt, 0, orientationSegment(orientation));
  return Buffer.concat(parts);
}
