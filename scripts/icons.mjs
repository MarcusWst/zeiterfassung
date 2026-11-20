// Erzeugt die App-Symbole (PNG) ohne Zusatzpakete: blaue Fläche mit weißer Uhr.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };

// Abstand eines Punkts zu einer Strecke
const seg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };

function draw(size) {
  const ss = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let white = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const u = (x + (sx + 0.5) / ss) / size - 0.5, v = (y + (sy + 0.5) / ss) / size - 0.5, r = Math.hypot(u, v);
        const ring = Math.abs(r - 0.27) < 0.032;
        const hands = seg(u, v, 0, 0, 0, -0.17) < 0.03 || seg(u, v, 0, 0, 0.12, 0.07) < 0.03;
        if (ring || hands) white++;
      }
      const a = white / (ss * ss), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(0x39 + (255 - 0x39) * a); raw[o + 1] = Math.round(0x87 + (255 - 0x87) * a); raw[o + 2] = Math.round(0xe5 + (255 - 0xe5) * a); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), draw(s));
console.log('Symbole erzeugt');
