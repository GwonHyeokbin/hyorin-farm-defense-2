import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2] ?? path.join(projectRoot, 'public/assets/hyorin/hyorin-stage-sprite-sheet.png');
const outputDir = path.join(projectRoot, 'public/art/hyorin');
const cellWidth = 64;
const cellHeight = 68;
const rows = { idle: 430, move: 500, attack: 575, hit: 650 };
const centers = [
  { idle: [117, 194, 270, 345, 420], move: [117, 194, 270, 345, 420], attack: [134, 216, 298, 380], hit: [134, 216, 298, 380] },
  { idle: [507, 587, 668, 750, 831], move: [507, 587, 668, 750, 831], attack: [507, 587, 668, 750, 831], hit: [522, 620, 718, 816] },
  { idle: [950, 1031, 1112, 1193, 1274], move: [950, 1031, 1112, 1193, 1274], attack: [950, 1031, 1112, 1193, 1274], hit: [967, 1070, 1174, 1277] },
  { idle: [1385, 1467, 1549, 1631, 1713], move: [1385, 1467, 1549, 1631, 1713], attack: [1385, 1467, 1549, 1631, 1713], hit: [1402, 1507, 1612, 1717] },
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(bytes) {
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('Input must be a PNG image.');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) throw new Error('Only non-interlaced 8-bit RGB/RGBA PNGs are supported.');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[source++];
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[source++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const above = y > 0 ? pixels[row - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : NaN;
      if (!Number.isFinite(predictor)) throw new Error(`Unsupported PNG filter ${filter}.`);
      pixels[row + x] = (raw + predictor) & 0xff;
    }
  }
  return { width, height, channels, stride, pixels };
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return result;
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function isPaper(r, g, b, color) {
  const close = Math.abs(r - color[0]) <= 34 && Math.abs(g - color[1]) <= 34 && Math.abs(b - color[2]) <= 34;
  const pale = r > 218 && g > 202 && b > 178 && r - g < 52 && g - b < 72;
  return close || pale;
}

function cropFrame(image, centerX, centerY) {
  const left = Math.round(centerX - cellWidth / 2);
  const top = Math.round(centerY - cellHeight / 2);
  const rgb = Buffer.alloc(cellWidth * cellHeight * 3);
  const alpha = new Uint8Array(cellWidth * cellHeight).fill(255);
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const source = (top + y) * image.stride + (left + x) * image.channels;
      const target = (y * cellWidth + x) * 3;
      rgb[target] = image.pixels[source];
      rgb[target + 1] = image.pixels[source + 1];
      rgb[target + 2] = image.pixels[source + 2];
    }
  }

  const paper = [];
  for (let x = 0; x < cellWidth; x += 1) {
    for (const y of [0, cellHeight - 1]) {
      const at = (y * cellWidth + x) * 3;
      if (rgb[at] > 220 && rgb[at + 1] > 200 && rgb[at + 2] > 175) paper.push([rgb[at], rgb[at + 1], rgb[at + 2]]);
    }
  }
  for (let y = 0; y < cellHeight; y += 1) {
    for (const x of [0, cellWidth - 1]) {
      const at = (y * cellWidth + x) * 3;
      if (rgb[at] > 220 && rgb[at + 1] > 200 && rgb[at + 2] > 175) paper.push([rgb[at], rgb[at + 1], rgb[at + 2]]);
    }
  }
  const average = [0, 0, 0];
  for (const color of paper) for (let c = 0; c < 3; c += 1) average[c] += color[c] / Math.max(1, paper.length);

  const queue = [];
  const add = (x, y) => {
    const index = y * cellWidth + x;
    if (alpha[index] === 0) return;
    const at = index * 3;
    if (!isPaper(rgb[at], rgb[at + 1], rgb[at + 2], average)) return;
    alpha[index] = 0;
    queue.push(index);
  };
  for (let x = 0; x < cellWidth; x += 1) { add(x, 0); add(x, cellHeight - 1); }
  for (let y = 0; y < cellHeight; y += 1) { add(0, y); add(cellWidth - 1, y); }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % cellWidth;
    const y = (index / cellWidth) | 0;
    if (x > 0) add(x - 1, y);
    if (x + 1 < cellWidth) add(x + 1, y);
    if (y > 0) add(x, y - 1);
    if (y + 1 < cellHeight) add(x, y + 1);
  }

  const rgba = Buffer.alloc(cellWidth * cellHeight * 4);
  for (let i = 0; i < alpha.length; i += 1) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return rgba;
}

const image = decodePng(fs.readFileSync(inputPath));
fs.mkdirSync(outputDir, { recursive: true });
for (let stage = 0; stage < centers.length; stage += 1) {
  for (const state of Object.keys(rows)) {
    const frames = centers[stage][state].map((x) => cropFrame(image, x, rows[state]));
    const sheet = Buffer.alloc(cellWidth * frames.length * cellHeight * 4);
    const sheetWidth = cellWidth * frames.length;
    frames.forEach((frame, frameIndex) => {
      for (let y = 0; y < cellHeight; y += 1) {
        const sourceOffset = y * cellWidth * 4;
        const targetOffset = (y * sheetWidth + frameIndex * cellWidth) * 4;
        frame.copy(sheet, targetOffset, sourceOffset, sourceOffset + cellWidth * 4);
      }
    });
    const outputPath = path.join(outputDir, `stage-${stage + 1}-${state}.png`);
    fs.writeFileSync(outputPath, encodePng(cellWidth * frames.length, cellHeight, sheet));
  }
}
console.log(`Extracted ${centers.length} stages × ${Object.keys(rows).length} animation rows to ${outputDir}`);
