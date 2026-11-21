// Gera o ícone do app (PNG 256/512 e ICO com PNGs embutidos) sem dependências externas.
// Desenho: quadrado arredondado escuro com barras de forma de onda, uma delas destacada (o instrumento separado).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'apps', 'desktop', 'build');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Cor RGBA do pixel (x, y) num ícone de tamanho `size` (com 4x4 superamostragem nas bordas). */
function sample(x, y, size) {
  const s = size;
  const radius = s * 0.22;
  const inset = s * 0.04;
  // Quadrado arredondado
  const inside = (px, py) => {
    const lo = inset;
    const hi = s - inset;
    if (px < lo || px > hi || py < lo || py > hi) return false;
    const cx = Math.min(Math.max(px, lo + radius), hi - radius);
    const cy = Math.min(Math.max(py, lo + radius), hi - radius);
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
  };
  // Barras da forma de onda: alturas relativas
  const heights = [0.28, 0.5, 0.72, 0.42, 0.86, 0.58, 0.34];
  const highlight = 4;
  const barW = s * 0.07;
  const gap = s * 0.045;
  const total = heights.length * barW + (heights.length - 1) * gap;
  const x0 = (s - total) / 2;
  const bar = (px, py) => {
    for (let i = 0; i < heights.length; i += 1) {
      const bx = x0 + i * (barW + gap);
      const h = (heights[i] ?? 0) * s * 0.62;
      const top = s / 2 - h / 2;
      if (px >= bx && px <= bx + barW && py >= top && py <= top + h) {
        // Pontas arredondadas
        const r = barW / 2;
        const cx = bx + r;
        if (py < top + r && (px - cx) ** 2 + (py - (top + r)) ** 2 > r * r) return -1;
        if (py > top + h - r && (px - cx) ** 2 + (py - (top + h - r)) ** 2 > r * r) return -1;
        return i;
      }
    }
    return -1;
  };
  let acc = [0, 0, 0, 0];
  const n = 4;
  for (let sy = 0; sy < n; sy += 1) {
    for (let sx = 0; sx < n; sx += 1) {
      const px = x + (sx + 0.5) / n;
      const py = y + (sy + 0.5) / n;
      let c = [0, 0, 0, 0];
      if (inside(px, py)) {
        // Fundo com leve gradiente vertical
        const t = py / s;
        c = [Math.round(23 - 8 * t), Math.round(27 - 8 * t), Math.round(40 - 6 * t), 255];
        const b = bar(px, py);
        if (b === highlight) c = [124, 156, 255, 255];
        else if (b >= 0) c = [214, 220, 235, 255];
      }
      acc = acc.map((v, i) => v + (c[i] ?? 0));
    }
  }
  return acc.map((v) => Math.round(v / (n * n)));
}

/** @param {number} size */
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = sample(x, y, size);
      raw.writeUInt8(r ?? 0, row + 1 + x * 4);
      raw.writeUInt8(g ?? 0, row + 2 + x * 4);
      raw.writeUInt8(b ?? 0, row + 3 + x * 4);
      raw.writeUInt8(a ?? 0, row + 4 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO com imagens PNG embutidas (formato aceito pelo Windows Vista em diante). @param {[number, Buffer][]} images */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const [size, data] of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map(([, d]) => d)]);
}

fs.mkdirSync(outDir, { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256, 512];
const pngs = new Map(sizes.map((s) => [s, png(s)]));
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs.get(512) ?? Buffer.alloc(0));
fs.writeFileSync(path.join(outDir, 'icon-256.png'), pngs.get(256) ?? Buffer.alloc(0));
fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  ico([16, 32, 48, 64, 128, 256].map((s) => [s, pngs.get(s) ?? Buffer.alloc(0)])),
);
console.log(`Ícones gerados em ${path.relative(root, outDir)}`);
