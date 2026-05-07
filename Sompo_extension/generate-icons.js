/**
 * Generate PNG icons for Universal Sompo Extension
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Ensure icons directory exists
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// CRC32 lookup table
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (~c) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createIconBuffer(size) {
  // Sompo colors
  const r = 229, g = 57, b = 53;  // #E53935
  const dr = 198, dg = 40, db = 40; // Darker red
  
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  
  // Pixel data
  const rowSize = 1 + size * 3;
  const pixels = Buffer.alloc(rowSize * size);
  const cx = size / 2, cy = size / 2;
  
  for (let y = 0; y < size; y++) {
    pixels[y * rowSize] = 0;
    for (let x = 0; x < size; x++) {
      const idx = y * rowSize + 1 + x * 3;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Shield shape
      const inShield = Math.abs(dx) < 0.85 && Math.abs(dy) < 0.9 && !(Math.abs(dx) > 0.7 && dy > 0.7);
      
      // Simple "S" for larger icons
      let isS = false;
      if (size >= 32) {
        const sx = dx / 0.5;
        const sy = dy / 0.6;
        isS = Math.abs(sx) < 1 && Math.abs(sy) < 1 && (
          (sy < -0.4 && sx < 0.3) ||
          (Math.abs(sy) < 0.2) ||
          (sy > 0.4 && sx > -0.3)
        ) && Math.abs(sx + sy * 0.6) < 0.8;
      }
      
      if (isS) {
        pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255;
      } else if (inShield) {
        const shade = 1 - dist * 0.15;
        pixels[idx] = Math.floor(dr * shade);
        pixels[idx + 1] = Math.floor(dg * shade);
        pixels[idx + 2] = Math.floor(db * shade);
      } else {
        pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
      }
    }
  }
  
  const compressed = zlib.deflateSync(pixels);
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

console.log('🔴 Generating Universal Sompo Icons...\n');

[16, 48, 128].forEach(size => {
  const buf = createIconBuffer(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`✅ icon${size}.png created`);
});

console.log('\n🎉 Done! Icons are in the icons/ folder');
