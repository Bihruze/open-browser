// js/qrcode.js — Minimal QR code generator (pure JS, no dependencies)
// Generates SVG-based QR codes for wallet addresses

// Simplified QR encoder using alphanumeric mode for short strings
// For production, use a full QR library. This handles typical crypto addresses.

export function generateQRSvg(text, size = 160, fgColor = '#3d2810', bgColor = '#faf7f2') {
  const modules = encodeQR(text);
  if (!modules) return fallbackQR(text, size, fgColor);

  const n = modules.length;
  const cellSize = size / n;

  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) {
        rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize + 0.5}" height="${cellSize + 0.5}" fill="${fgColor}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${bgColor}"/>
    ${rects}
  </svg>`;
}

// ---- QR Encoding (Version 1-6, Byte mode, Error correction L) ----

function encodeQR(text) {
  const data = new TextEncoder().encode(text);
  const len = data.length;

  // Version selection based on data length (EC level L, byte mode)
  const capacities = [0, 17, 32, 53, 78, 106, 134]; // v1-v6 byte capacity at EC=L
  let version = 0;
  for (let v = 1; v <= 6; v++) {
    if (len <= capacities[v]) { version = v; break; }
  }
  if (version === 0) return null; // Too long

  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  // Place finder patterns
  placeFinder(modules, reserved, 0, 0);
  placeFinder(modules, reserved, size - 7, 0);
  placeFinder(modules, reserved, 0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0 ? 1 : 0;
    modules[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  // Alignment pattern (v2+)
  if (version >= 2) {
    const pos = [6, size - 7];
    for (const r of pos) {
      for (const c of pos) {
        if (reserved[r]?.[c]) continue;
        placeAlignment(modules, reserved, r, c);
      }
    }
  }

  // Dark module
  modules[size - 8][8] = 1;
  reserved[size - 8][8] = true;

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
    if (i < 8) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }
  }

  // Encode data
  const ecBlocks = [0, 7, 10, 15, 20, 26, 36]; // EC codewords per version (L)
  const totalCodewords = [0, 26, 44, 70, 100, 134, 172];
  const dataCodewords = totalCodewords[version] - ecBlocks[version];

  const bitStream = [];
  // Mode indicator: 0100 (byte mode)
  bitStream.push(0, 1, 0, 0);
  // Character count (8 bits for v1-9)
  for (let i = 7; i >= 0; i--) bitStream.push((len >> i) & 1);
  // Data
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bitStream.push((byte >> i) & 1);
  }
  // Terminator
  while (bitStream.length < dataCodewords * 8 && bitStream.length < dataCodewords * 8 + 4) bitStream.push(0);
  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) bitStream.push(0);
  // Pad codewords
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (bitStream.length < dataCodewords * 8) {
    for (let i = 7; i >= 0; i--) bitStream.push((padBytes[padIdx % 2] >> i) & 1);
    padIdx++;
  }

  // Convert to bytes
  const codewords = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bitStream[i + j] || 0);
    codewords.push(byte);
  }

  // EC calculation (simplified Reed-Solomon)
  const ecCodewords = generateEC(codewords, ecBlocks[version]);
  const allCodewords = [...codewords, ...ecCodewords];

  // Place data
  const allBits = [];
  for (const cw of allCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  }

  let bitIdx = 0;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    for (let i = 0; i < size; i++) {
      const row = ((Math.floor((size - 1 - col) / 2)) % 2 === 0) ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (c < 0 || reserved[row]?.[c]) continue;
        if (bitIdx < allBits.length) {
          modules[row][c] = allBits[bitIdx] ^ ((row + c) % 2 === 0 ? 1 : 0); // Mask 0
          bitIdx++;
        }
      }
    }
  }

  // Apply mask pattern 0 and format info
  const formatBits = getFormatBits(0); // EC=L, mask=0
  placeFormatBits(modules, size, formatBits);

  return modules;
}

function placeFinder(m, r, row, col) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = row + dr, cc = col + dc;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const outer = dr === -1 || dr === 7 || dc === -1 || dc === 7;
      const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      m[rr][cc] = (ring || inner) && !outer ? 1 : 0;
      r[rr][cc] = true;
    }
  }
}

function placeAlignment(m, r, row, col) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const rr = row + dr, cc = col + dc;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const edge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
      const center = dr === 0 && dc === 0;
      m[rr][cc] = edge || center ? 1 : 0;
      r[rr][cc] = true;
    }
  }
}

// Simplified Reed-Solomon EC generation
function generateEC(data, ecLen) {
  const gfExp = new Uint8Array(512);
  const gfLog = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
  }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

  // Generator polynomial
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfExp[(gfLog[gen[j]] + i) % 255];
    }
    gen = next;
  }

  const msg = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      msg[i + j] ^= gfExp[(gfLog[gen[j]] + gfLog[coef]) % 255];
    }
  }
  return msg.slice(data.length);
}

function getFormatBits(mask) {
  // Pre-computed format strings for EC=L (01), masks 0-7
  const formats = [
    0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976
  ];
  const bits = [];
  const val = formats[mask] || formats[0];
  for (let i = 14; i >= 0; i--) bits.push((val >> i) & 1);
  return bits;
}

function placeFormatBits(m, size, bits) {
  // Around top-left finder
  const positions = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = positions[i];
    m[r][c] = bits[i];
  }
  // Around other finders
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bits[i];
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bits[i];
}

// Fallback: text-based "QR" for very long addresses
function fallbackQR(text, size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#faf7f2"/>
    <rect x="4" y="4" width="${size-8}" height="${size-8}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="3 2"/>
    <text x="${size/2}" y="${size/2 - 8}" text-anchor="middle" font-family="DM Mono" font-size="8" fill="${color}">SCAN ADDRESS</text>
    <text x="${size/2}" y="${size/2 + 8}" text-anchor="middle" font-family="DM Mono" font-size="6" fill="#9c8060">${text.slice(0,20)}...</text>
  </svg>`;
}
