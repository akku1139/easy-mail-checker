/**
 * Generates PNG toolbar icons (16/32/48/128) from a tiny envelope drawing,
 * without external assets. Uses the "pureimage"-free approach: raw PNG encode
 * with zlib from node core. Deterministic, no deps.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SIZES = [16, 32, 48, 128];
const ACCENT = [74, 144, 217]; // #4a90d9

function renderEnvelope(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = rgba[0];
    px[i + 1] = rgba[1];
    px[i + 2] = rgba[2];
    px[i + 3] = rgba[3] ?? 255;
  };
  const fillRect = (x0, y0, x1, y1, rgba) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, rgba);
  };

  const m = Math.max(1, Math.round(size * 0.08)); // margin
  fillRect(m, Math.round(size * 0.22), size - 1 - m, Math.round(size * 0.78), [...ACCENT]);
  // flap
  const top = Math.round(size * 0.22);
  const bottom = Math.round(size * 0.62);
  const midX = (size - 1) / 2;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = t * midX;
    const white = [255, 255, 255, 235];
    for (let x = Math.round(midX - half); x <= Math.round(midX + half); x++) {
      set(x, y, white);
    }
  }
  return px;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = resolve(new URL("..", import.meta.url).pathname, "assets/icons");
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = resolve(outDir, `${size}.png`);
  writeFileSync(file, encodePng(renderEnvelope(size), size));
  console.log("wrote", file);
}
