// Draws the extension icon (red rounded square with a white bookmark ribbon) as PNGs.
// No image libraries needed: pixels are computed directly and encoded with zlib.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'extension', 'icons');
const SIZES = [16, 32, 48, 96, 128];
const BG = [214, 69, 61];
const FG = [255, 255, 255];

// Shape tests in unit coordinates (0..1).
function inRoundedSquare(x, y) {
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inRibbon(x, y) {
  const left = 0.32;
  const right = 0.68;
  const top = 0.18;
  const bottom = 0.84;
  const notch = 0.16;
  if (x < left || x > right || y < top || y > bottom) return false;
  // V-shaped notch cut into the bottom edge
  const mid = (left + right) / 2;
  const depth = notch * (1 - Math.abs(x - mid) / ((right - left) / 2));
  return y <= bottom - depth;
}

function render(size) {
  const ss = 4; // supersampling for smooth edges
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (inRoundedSquare(x, y)) {
            if (inRibbon(x, y)) fg++;
            else bg++;
          }
        }
      }
      const total = ss * ss;
      const cover = (bg + fg) / total;
      const o = 1 + px * 4;
      if (cover === 0) continue;
      const mixFg = fg / (bg + fg);
      for (let c = 0; c < 3; c++) row[o + c] = Math.round(BG[c] * (1 - mixFg) + FG[c] * mixFg);
      row[o + 3] = Math.round(cover * 255);
    }
    rows.push(row);
  }
  return encodePng(size, size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), render(size));
}
console.log(`Wrote ${SIZES.length} icons to ${path.relative(root, outDir)}/`);
