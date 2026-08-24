/**
 * Packages dist-mv2 → easy-mail-checker-mv2.zip and dist-mv3 → …-mv3.zip
 * using only node core (store + deflate via zlib).
 */
import { createWriteStream } from "node:fs";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { resolve, join, relative, sep } from "node:path";

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

function listFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out.sort();
}

function zipDir(dir, outFile) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of listFiles(dir)) {
    const name = relative(dir, file).split(sep).join("/");
    const data = readFileSync(file);
    const compressed = deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method = deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1980-01-01, deterministic)
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, Buffer.from(name, "utf8"), compressed);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, Buffer.from(name, "utf8")]));

    offset += local.length + Buffer.byteLength(name) + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(listFiles(dir).length, 8);
  end.writeUInt16LE(listFiles(dir).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  const stream = createWriteStream(outFile);
  stream.end(Buffer.concat([...chunks, centralBuf, end]));
  console.log("wrote", outFile);
}

const root = new URL("..", import.meta.url).pathname;
zipDir(resolve(root, "dist-mv2"), resolve(root, "easy-mail-checker-mv2.zip"));
zipDir(resolve(root, "dist-mv3"), resolve(root, "easy-mail-checker-mv3.zip"));
