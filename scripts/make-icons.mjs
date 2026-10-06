// Makes the extension icons and the website logo from assets/cat-logo.png (the cat on a
// transparent background). A thin periwinkle outline keeps the black cat visible on dark toolbars.
// No image libraries needed: PNGs are decoded and encoded here with zlib.
//   npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'assets', 'cat-logo.png');
const ICON_SIZES = [16, 32, 48, 96, 128];
const OUTLINE = [0xa3, 0xb1, 0xe3]; // #A3B1E3 from the palette
const OUTLINE_WIDTH = 0.035; // as a share of the cat's width, at least 1px

// ---------- PNG in and out (8-bit RGB or RGBA, not interlaced) ----------

function decodePng(buf) {
  let pos = 8;
  let w, h, depth, type, interlace;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) {
    throw new Error(`${path.relative(root, SOURCE)} must be an 8-bit RGB or RGBA PNG without interlacing.`);
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) px[(y * w + x) * 4 + k] = line[x * bpp + k];
      px[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
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

function encodePng(w, h, px) {
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(Buffer.from([0]), px.subarray(y * w * 4, (y + 1) * w * 4));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- drawing (premultiplied floats, 0..1) ----------

function toFloat({ w, h, px }) {
  const f = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) f[i * 4 + k] = (px[i * 4 + k] / 255) * a;
    f[i * 4 + 3] = a;
  }
  return f;
}

// Shrink by averaging every source pixel each target pixel covers.
function resize(src, sw, sh, tw, th) {
  const out = new Float32Array(tw * th * 4);
  const fx = sw / tw;
  const fy = sh / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = ty * fy;
    const y1 = y0 + fy;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = tx * fx;
      const x1 = x0 + fx;
      const o = (ty * tw + tx) * 4;
      for (let sy = Math.floor(y0); sy < Math.min(sh, Math.ceil(y1)); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.min(sw, Math.ceil(x1)); sx++) {
          const wgt = (wy * (Math.min(x1, sx + 1) - Math.max(x0, sx))) / (fx * fy);
          const i = (sy * sw + sx) * 4;
          for (let k = 0; k < 4; k++) out[o + k] += src[i + k] * wgt;
        }
      }
    }
  }
  return out;
}

/** Draw the cat centred in a w×h canvas, as large as fits, with its outline. */
function render(cat, w, h) {
  const scale = Math.min(w / cat.w, h / cat.h);
  // Leave room for the outline, which grows with the cat.
  const r0 = Math.max(1, cat.w * scale * OUTLINE_WIDTH);
  const fit = Math.min((w - 2 * r0) / cat.w, (h - 2 * r0) / cat.h);
  const cw = Math.max(1, Math.round(cat.w * fit));
  const ch = Math.max(1, Math.round(cat.h * fit));
  const r = Math.max(1, cw * OUTLINE_WIDTH);
  const small = resize(cat.f, cat.w, cat.h, cw, ch);

  const ox = Math.round((w - cw) / 2);
  const oy = Math.round((h - ch) / 2);
  const img = new Float32Array(w * h * 4);
  for (let y = 0; y < ch; y++) img.set(small.subarray(y * cw * 4, (y + 1) * cw * 4), ((y + oy) * w + ox) * 4);

  // Outline: the cat's shape grown by r pixels, with a soft edge.
  const reach = Math.ceil(r) + 1;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ring = 0;
      for (let dy = -reach; dy <= reach; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const edge = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(dx, dy)));
          ring = Math.max(ring, img[(ny * w + nx) * 4 + 3] * edge);
        }
      }
      const i = (y * w + x) * 4;
      const a = img[i + 3];
      const outA = a + ring * (1 - a);
      if (outA <= 0) continue;
      for (let k = 0; k < 3; k++) {
        const c = img[i + k] + (OUTLINE[k] / 255) * ring * (1 - a);
        px[i + k] = Math.round((c / outA) * 255);
      }
      px[i + 3] = Math.round(outA * 255);
    }
  }
  return encodePng(w, h, px);
}

// ---------- outputs ----------

const source = decodePng(fs.readFileSync(SOURCE));
const cat = { w: source.w, h: source.h, f: toFloat(source) };
const write = (rel, png) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), png);
  console.log(`Wrote ${rel}`);
};

// Square toolbar icons.
for (const size of ICON_SIZES) write(`extension/icons/icon-${size}.png`, render(cat, size, size));
// The cat at its own shape, for page headers (shown up to ~56px wide, so this is 2x and up).
const LOGO_H = 96;
const logo = render(cat, Math.round((LOGO_H * cat.w) / cat.h), LOGO_H);
write('extension/icons/logo.png', logo);
write('web/public/logo.png', logo);
write('web/public/favicon.png', render(cat, 64, 64));
