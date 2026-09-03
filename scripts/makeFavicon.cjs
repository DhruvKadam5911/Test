const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// 1. Load logo.png
const logoBuf = fs.readFileSync(path.join(__dirname, '../public/logo.png'));
const logo = PNG.sync.read(logoBuf);

const minX = 199;
const maxX = 388;
const minY = 122;
const maxY = 422;
const markW = maxX - minX + 1; // 190
const markH = maxY - minY + 1; // 301

// Create high-res 1024x1024 master canvas with transparency
const MASTER_SIZE = 1024;
const master = new PNG({ width: MASTER_SIZE, height: MASTER_SIZE });

// Background is transparent
for (let i = 0; i < master.data.length; i += 4) {
  master.data[i] = 0;
  master.data[i + 1] = 0;
  master.data[i + 2] = 0;
  master.data[i + 3] = 0;
}

// Scale the mark to fit nicely within 82% of the master size
const targetH = Math.round(MASTER_SIZE * 0.82);
const scale = targetH / markH;
const targetW = Math.round(markW * scale);
const offsetX = Math.round((MASTER_SIZE - targetW) / 2);
const offsetY = Math.round((MASTER_SIZE - targetH) / 2);

// Render mark to master with bilinear scaling & background knockout
for (let destY = 0; destY < targetH; destY++) {
  const srcY = minY + (destY / targetH) * markH;
  const srcYFloor = Math.floor(srcY);
  const srcYCeil = Math.min(maxY, srcYFloor + 1);
  const yWeight = srcY - srcYFloor;

  for (let destX = 0; destX < targetW; destX++) {
    const srcX = minX + (destX / targetW) * markW;
    const srcXFloor = Math.floor(srcX);
    const srcXCeil = Math.min(maxX, srcXFloor + 1);
    const xWeight = srcX - srcXFloor;

    const sample = (x, y) => {
      const idx = (logo.width * y + x) << 2;
      const r = logo.data[idx];
      const g = logo.data[idx + 1];
      const b = logo.data[idx + 2];
      const a = logo.data[idx + 3];
      // Knockout white
      if (r > 230 && g > 230 && b > 230) {
        return { r: 255, g: 255, b: 255, a: 0 };
      }
      // Smooth edge near white
      if (r > 200 && g > 200 && b > 200) {
        const whiteGrad = (Math.min(r, g, b) - 200) / 30;
        return { r, g, b, a: Math.round(a * (1 - whiteGrad)) };
      }
      return { r, g, b, a };
    };

    const c00 = sample(srcXFloor, srcYFloor);
    const c10 = sample(srcXCeil, srcYFloor);
    const c01 = sample(srcXFloor, srcYCeil);
    const c11 = sample(srcXCeil, srcYCeil);

    const r = Math.round(
      (c00.r * (1 - xWeight) + c10.r * xWeight) * (1 - yWeight) +
      (c01.r * (1 - xWeight) + c11.r * xWeight) * yWeight
    );
    const g = Math.round(
      (c00.g * (1 - xWeight) + c10.g * xWeight) * (1 - yWeight) +
      (c01.g * (1 - xWeight) + c11.g * xWeight) * yWeight
    );
    const b = Math.round(
      (c00.b * (1 - xWeight) + c10.b * xWeight) * (1 - yWeight) +
      (c01.b * (1 - xWeight) + c11.b * xWeight) * yWeight
    );
    const a = Math.round(
      (c00.a * (1 - xWeight) + c10.a * xWeight) * (1 - yWeight) +
      (c01.a * (1 - xWeight) + c11.a * xWeight) * yWeight
    );

    const outIdx = (MASTER_SIZE * (offsetY + destY) + (offsetX + destX)) << 2;
    master.data[outIdx] = r;
    master.data[outIdx + 1] = g;
    master.data[outIdx + 2] = b;
    master.data[outIdx + 3] = a;
  }
}

// Downsampler using supersampled box filter
function resize(source, targetSize) {
  const target = new PNG({ width: targetSize, height: targetSize });
  const scale = source.width / targetSize;

  for (let ty = 0; ty < targetSize; ty++) {
    for (let tx = 0; tx < targetSize; tx++) {
      const sxStart = Math.floor(tx * scale);
      const sxEnd = Math.min(source.width, Math.floor((tx + 1) * scale));
      const syStart = Math.floor(ty * scale);
      const syEnd = Math.min(source.height, Math.floor((ty + 1) * scale));

      let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
      let count = 0;

      for (let sy = syStart; sy < syEnd; sy++) {
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const idx = (source.width * sy + sx) << 2;
          const a = source.data[idx + 3] / 255;
          totalR += source.data[idx] * a;
          totalG += source.data[idx + 1] * a;
          totalB += source.data[idx + 2] * a;
          totalA += source.data[idx + 3];
          count++;
        }
      }

      const outIdx = (targetSize * ty + tx) << 2;
      if (count > 0 && totalA > 0) {
        const avgA = totalA / count;
        const normA = totalA / 255;
        target.data[outIdx] = Math.round(totalR / normA);
        target.data[outIdx + 1] = Math.round(totalG / normA);
        target.data[outIdx + 2] = Math.round(totalB / normA);
        target.data[outIdx + 3] = Math.round(avgA);
      } else {
        target.data[outIdx] = 0;
        target.data[outIdx + 1] = 0;
        target.data[outIdx + 2] = 0;
        target.data[outIdx + 3] = 0;
      }
    }
  }
  return target;
}

// Generate all sizes
const sizes = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'android-chrome-192x192.png', size: 192 },
  { file: 'android-chrome-512x512.png', size: 512 },
  { file: 'favicon.png', size: 512 },
];

const pngBuffers = {};

for (const s of sizes) {
  const resized = resize(master, s.size);
  const buf = PNG.sync.write(resized);
  fs.writeFileSync(path.join(__dirname, '../public', s.file), buf);
  pngBuffers[s.size] = buf;
  console.log(`Generated public/${s.file} (${s.size}x${s.size})`);
}

// Build standard ICO file containing 16x16 and 32x32 PNG entries
function createIco(entries) {
  // entries: [{ width, height, buffer }]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(entries.length, 4); // Count

  let offset = 6 + entries.length * 16;
  const dirBuffers = [];
  const imageBuffers = [];

  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(entry.width === 256 ? 0 : entry.width, 0);
    dir.writeUInt8(entry.height === 256 ? 0 : entry.height, 1);
    dir.writeUInt8(0, 2); // Color palette
    dir.writeUInt8(0, 3); // Reserved
    dir.writeUInt16LE(1, 4); // Color planes
    dir.writeUInt16LE(32, 6); // Bits per pixel
    dir.writeUInt32LE(entry.buffer.length, 8); // Image size in bytes
    dir.writeUInt32LE(offset, 12); // Offset of image data

    dirBuffers.push(dir);
    imageBuffers.push(entry.buffer);
    offset += entry.buffer.length;
  }

  return Buffer.concat([header, ...dirBuffers, ...imageBuffers]);
}

const icoBuf = createIco([
  { width: 16, height: 16, buffer: pngBuffers[16] },
  { width: 32, height: 32, buffer: pngBuffers[32] },
]);

fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), icoBuf);
console.log('Generated public/favicon.ico');
