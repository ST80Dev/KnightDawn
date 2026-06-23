// FERRO & CENERE — grafica procedurale pixel-art chunky
// Tutti i primitivi grafici disegnano in blocchi PIXEL×PIXEL
// (configurato in config.js). Le curve si vedono "a quadratini".

// Bayer 4x4 per dithering
const BAYER4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// Quantizza una coordinata sulla griglia dei pixel logici
function snap(v) { return Math.floor(v / PIXEL) * PIXEL; }

// Disegna un singolo "pixel logico" (un quadrato PIXEL×PIXEL)
function setPx(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), PIXEL, PIXEL);
}

// ─── Pergamena procedurale: toni piatti + dithering Bayer ───────────────
const _parchmentCache = new Map();
function getParchmentTexture(w, h, seed = 1337) {
  const key = `${w}x${h}_${seed}_${PIXEL}`;
  if (_parchmentCache.has(key)) return _parchmentCache.get(key);

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rnd = mulberry32(seed);

  const A = PALETTE.pergChiara;
  const B = PALETTE.pergMedia;
  const C = PALETTE.pergScura;
  const D = PALETTE.pergMacchia;

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(cx, cy);

  // Riempio per blocchi PIXEL×PIXEL: ogni blocco è un solo tono piatto
  // (scelto da 4 toni della pergamena) deciso da distanza dal centro + Bayer.
  // Risultato: vignettatura visibile "a quadratini", niente sfumatura smooth.
  for (let by = 0; by < h; by += PIXEL) {
    for (let bx = 0; bx < w; bx += PIXEL) {
      const dx = bx + PIXEL / 2 - cx;
      const dy = by + PIXEL / 2 - cy;
      const r = Math.hypot(dx, dy) / maxR; // 0 centro, 1 angolo
      // bayer sulla griglia di blocchi (non sui pixel fisici)
      const bxi = (bx / PIXEL) & 3;
      const byi = (by / PIXEL) & 3;
      const m = BAYER4[byi * 4 + bxi] / 16; // 0..1

      let col;
      const rd = r + m * 0.16;
      if      (rd < 0.55) col = A;
      else if (rd < 0.80) col = B;
      else if (rd < 1.00) col = C;
      else                col = D;

      ctx.fillStyle = col;
      ctx.fillRect(bx, by, PIXEL, PIXEL);
    }
  }

  // Macchie di invecchiamento: blob di pochi blocchi
  const blocks = (w / PIXEL) * (h / PIXEL);
  const macchie = Math.floor(blocks / 80);
  for (let i = 0; i < macchie; i++) {
    const bx = Math.floor(rnd() * (w / PIXEL)) * PIXEL;
    const by = Math.floor(rnd() * (h / PIXEL)) * PIXEL;
    const size = 1 + Math.floor(rnd() * 2); // raggio in blocchi
    const col = rnd() < 0.5 ? C : D;
    ctx.fillStyle = col;
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > size) continue;
        if (rnd() < 0.45) continue;
        ctx.fillRect(bx + dx * PIXEL, by + dy * PIXEL, PIXEL, PIXEL);
      }
    }
  }

  // Fibre orizzontali (1 blocco di altezza)
  const fibre = Math.floor((w / PIXEL) / 8);
  for (let i = 0; i < fibre; i++) {
    const by = Math.floor(rnd() * (h / PIXEL)) * PIXEL;
    const bx0 = Math.floor(rnd() * (w / PIXEL)) * PIXEL;
    const len = (2 + Math.floor(rnd() * 8)) * PIXEL;
    ctx.fillStyle = rnd() < 0.5 ? A : B;
    for (let k = 0; k < len; k += PIXEL) {
      ctx.fillRect(bx0 + k, by, PIXEL, PIXEL);
    }
  }

  _parchmentCache.set(key, off);
  return off;
}

// ─── Bordo cartografico in pixel logici ─────────────────────────────────
function drawCartographicBorder(ctx, x, y, w, h) {
  const outer = PIXEL * 3;
  const inner = PIXEL * 6;

  // Linea esterna
  drawPixelRectStroke(ctx, x + outer, y + outer, w - outer * 2, h - outer * 2,
                       PALETTE.inkScuro);
  // Linea interna
  drawPixelRectStroke(ctx, x + inner, y + inner, w - inner * 2, h - inner * 2,
                       PALETTE.inkMedio);

  // Angoli decorati: rombo 3 blocchi di lato
  const corners = [
    [x + inner + PIXEL * 2, y + inner + PIXEL * 2, 1, 1],
    [x + w - inner - PIXEL * 3, y + inner + PIXEL * 2, -1, 1],
    [x + inner + PIXEL * 2, y + h - inner - PIXEL * 3, 1, -1],
    [x + w - inner - PIXEL * 3, y + h - inner - PIXEL * 3, -1, -1],
  ];
  ctx.fillStyle = PALETTE.inkScuro;
  for (const [cx, cy] of corners) {
    // rombo composto da blocchi PIXEL×PIXEL
    ctx.fillRect(cx, cy - PIXEL, PIXEL, PIXEL);
    ctx.fillRect(cx - PIXEL, cy, PIXEL * 3, PIXEL);
    ctx.fillRect(cx, cy + PIXEL, PIXEL, PIXEL);
  }
}

// Rettangolo cavo con spessore PIXEL
function drawPixelRectStroke(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, PIXEL);                 // top
  ctx.fillRect(x, y + h - PIXEL, w, PIXEL);     // bottom
  ctx.fillRect(x, y, PIXEL, h);                 // left
  ctx.fillRect(x + w - PIXEL, y, PIXEL, h);     // right
}

// ─── Cerchio pixel (midpoint) in blocchi PIXEL ──────────────────────────
function pixelCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  // Lavoriamo in unità di blocchi
  const rb = Math.max(1, Math.round(r / PIXEL));
  const cxb = Math.round(cx / PIXEL);
  const cyb = Math.round(cy / PIXEL);
  let x = rb;
  let y = 0;
  let err = 0;
  while (x >= y) {
    const pts = [
      [cxb + x, cyb + y], [cxb + y, cyb + x],
      [cxb - y, cyb + x], [cxb - x, cyb + y],
      [cxb - x, cyb - y], [cxb - y, cyb - x],
      [cxb + y, cyb - x], [cxb + x, cyb - y],
    ];
    for (const [px, py] of pts) ctx.fillRect(px * PIXEL, py * PIXEL, PIXEL, PIXEL);
    y++;
    if (err <= 0) { err += 2 * y + 1; }
    if (err > 0)  { x--; err -= 2 * x + 1; }
  }
}

// Linea pixel (Bresenham) in blocchi PIXEL
function pixelLine(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  let bx0 = Math.round(x0 / PIXEL);
  let by0 = Math.round(y0 / PIXEL);
  const bx1 = Math.round(x1 / PIXEL);
  const by1 = Math.round(y1 / PIXEL);
  const dx = Math.abs(bx1 - bx0);
  const dy = -Math.abs(by1 - by0);
  const sx = bx0 < bx1 ? 1 : -1;
  const sy = by0 < by1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    ctx.fillRect(bx0 * PIXEL, by0 * PIXEL, PIXEL, PIXEL);
    if (bx0 === bx1 && by0 === by1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; bx0 += sx; }
    if (e2 <= dx) { err += dx; by0 += sy; }
  }
}

// Triangolo riempito in blocchi PIXEL
function pixelTriangle(ctx, p0, p1, p2, color) {
  ctx.fillStyle = color;
  // converti vertici a coordinate di blocco
  const q0 = [p0[0] / PIXEL, p0[1] / PIXEL];
  const q1 = [p1[0] / PIXEL, p1[1] / PIXEL];
  const q2 = [p2[0] / PIXEL, p2[1] / PIXEL];
  const minX = Math.floor(Math.min(q0[0], q1[0], q2[0]));
  const maxX = Math.ceil(Math.max(q0[0], q1[0], q2[0]));
  const minY = Math.floor(Math.min(q0[1], q1[1], q2[1]));
  const maxY = Math.ceil(Math.max(q0[1], q1[1], q2[1]));
  const sign = (a, b, c) =>
    (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const d1 = sign(p, q0, q1);
      const d2 = sign(p, q1, q2);
      const d3 = sign(p, q2, q0);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(hasNeg && hasPos)) ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
    }
  }
}

// ─── Rosa dei venti pixel-art ───────────────────────────────────────────
function drawCompassRose(ctx, cx, cy, r) {
  pixelCircle(ctx, cx, cy, r, PALETTE.inkMedio);
  pixelCircle(ctx, cx, cy, Math.floor(r * 0.5), PALETTE.inkMedio);

  // 4 punte principali
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2;
    const tip = [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    const baseL = [
      cx + Math.cos(ang + Math.PI / 2) * (r * 0.20),
      cy + Math.sin(ang + Math.PI / 2) * (r * 0.20),
    ];
    const baseR = [
      cx + Math.cos(ang - Math.PI / 2) * (r * 0.20),
      cy + Math.sin(ang - Math.PI / 2) * (r * 0.20),
    ];
    pixelTriangle(ctx, tip, baseL, baseR, PALETTE.inkScuro);
  }

  // 4 punte diagonali
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2 + Math.PI / 4;
    const tip = [cx + Math.cos(ang) * r * 0.7, cy + Math.sin(ang) * r * 0.7];
    const baseL = [
      cx + Math.cos(ang + Math.PI / 2) * (r * 0.14),
      cy + Math.sin(ang + Math.PI / 2) * (r * 0.14),
    ];
    const baseR = [
      cx + Math.cos(ang - Math.PI / 2) * (r * 0.14),
      cy + Math.sin(ang - Math.PI / 2) * (r * 0.14),
    ];
    pixelTriangle(ctx, tip, baseL, baseR, PALETTE.inkLeggero);
  }

  // Borchia centrale: 2x2 blocchi
  ctx.fillStyle = PALETTE.inkScuro;
  ctx.fillRect(snap(cx) - PIXEL, snap(cy) - PIXEL, PIXEL * 2, PIXEL * 2);
}

// ─── Word wrap su testo ──────────────────────────────────────────────────
// Spezza una stringa in righe la cui larghezza misurata col font corrente
// di ctx non superi maxWidth. Gestisce parole singole più lunghe del
// margine spezzandole a forza.
function wrapText(ctx, text, maxWidth) {
  if (!text) return [''];
  const out = [];
  const paragraphs = String(text).split('\n');
  for (const para of paragraphs) {
    if (!para.length) { out.push(''); continue; }
    const words = para.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if (!w) continue;
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        cur = test;
      } else {
        if (cur) { out.push(cur); cur = ''; }
        // parola sola più lunga del margine: spezza a forza
        if (ctx.measureText(w).width > maxWidth) {
          let chunk = '';
          for (const ch of w) {
            if (ctx.measureText(chunk + ch).width > maxWidth) {
              out.push(chunk); chunk = ch;
            } else chunk += ch;
          }
          cur = chunk;
        } else {
          cur = w;
        }
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// ─── Icone pixel-art per tab/HUD ─────────────────────────────────────────
// Due formati supportati:
//
// 1) Monocromatico (legacy): pattern = array di stringhe con '#' (pieno) e
//    '.' (vuoto). Disegnato da drawPixelPattern(ctx, pattern, x, y, size, color).
//
// 2) Multicolore: oggetto { pattern, palette } dove palette mappa ogni char
//    diverso da '.' (o ' ') a un colore esadecimale. Disegnato da
//    drawColoredPattern(ctx, icon, x, y, size).
//
// drawTabIcon() seleziona automaticamente il formato giusto.

function drawPixelPattern(ctx, pattern, x, y, size, color) {
  const rows = pattern.length;
  const cols = pattern[0].length;
  const bw = Math.max(1, Math.floor(size / cols));
  const bh = Math.max(1, Math.floor(size / rows));
  const offX = x + Math.floor((size - bw * cols) / 2);
  const offY = y + Math.floor((size - bh * rows) / 2);
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    const row = pattern[r];
    for (let c = 0; c < cols; c++) {
      if (row[c] === '#') ctx.fillRect(offX + c * bw, offY + r * bh, bw, bh);
    }
  }
}

function drawColoredPattern(ctx, icon, x, y, size) {
  const pattern = icon.pattern;
  const palette = icon.palette;
  const rows = pattern.length;
  const cols = pattern[0].length;
  const bw = Math.max(1, Math.floor(size / cols));
  const bh = Math.max(1, Math.floor(size / rows));
  const offX = x + Math.floor((size - bw * cols) / 2);
  const offY = y + Math.floor((size - bh * rows) / 2);
  for (let r = 0; r < rows; r++) {
    const row = pattern[r];
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(offX + c * bw, offY + r * bh, bw, bh);
    }
  }
}

// Scudo araldico: bordo nero scuro, corpo verde con ombra, croce d'oro
const ICON_SHIELD = {
  pattern: [
    '..DDDDDD..',
    '.DggggggD.',
    'DggggGggdD',
    'DggGGGGgdD',
    'DggggGggdD',
    'DggggGggdD',
    'DggggGggdD',
    '.DggggggD.',
    '..DggggD..',
    '...DDDD...',
  ],
  palette: {
    D: '#1a0a04',   // outline nero
    g: '#3a8a30',   // verde corpo
    d: '#1a5a18',   // verde ombra (lato destro)
    G: '#e8c050',   // oro croce
  },
};

// Spade incrociate: lame argentate con bordo nero, elsa marrone, gemma rossa
const ICON_SWORDS = {
  pattern: [
    'D........D',
    'DS......SD',
    '.DS....SD.',
    '..DS..SD..',
    '...DSrSD..',
    '..BBrrrBB.',
    '.BSSSSSSB.',
    'BSDrrrrDSB',
    'BSD.rr.DSB',
    'D..BB.BB..',
  ],
  palette: {
    D: '#1a0a04',   // outline
    S: '#c8c8d0',   // argento lame
    B: '#6a3a18',   // marrone elsa
    r: '#cc1818',   // rosso gemma centrale
  },
};

// Corona reale: corpo dorato con 3 punte rosse (gemme), bordo nero,
// banda di base con dettaglio
const ICON_CROWN = {
  pattern: [
    '..........',
    'r...rr...r',
    'GrDDrrDDrG',
    'GGGDrrDGGG',
    'GGGGrrGGGG',
    'DGGGGGGGGD',
    'DGGGgGGGGD',
    'DGgGGGgGGD',
    'DGGgGGgGGD',
    'DDDDDDDDDD',
  ],
  palette: {
    D: '#1a0a04',   // outline / banda base
    G: '#e8c050',   // oro
    g: '#a07020',   // oro scuro (ombra)
    r: '#cc1818',   // gemme rosse
  },
};

// Pergamena scritta: corpo crema, righe d'inchiostro, estremità arrotolate scure
const ICON_SCROLL = {
  pattern: [
    'BBBBBBBBBB',
    'BCCCCCCCCB',
    'CCDDDDDDCC',
    'CCCCCCCCCC',
    'CCDDDDDDCC',
    'CCCCCCCCCC',
    'CCDDDDDDCC',
    'CCCCCCCCCC',
    'BCCCCCCCCB',
    'BBBBBBBBBB',
  ],
  palette: {
    B: '#5a3a18',   // marrone arrotolato (estremità)
    C: '#f0e4c0',   // crema pergamena
    D: '#1a0a04',   // inchiostro nero
  },
};

const ICON_PROFILE_TABS = {
  profilo: ICON_SHIELD,
  equip:   ICON_SWORDS,
  reput:   ICON_CROWN,
  diario:  ICON_SCROLL,
};

function drawTabIcon(ctx, key, x, y, size, _legacyColor) {
  const icon = ICON_PROFILE_TABS[key];
  if (!icon) return;
  if (icon.pattern && icon.palette) drawColoredPattern(ctx, icon, x, y, size);
  else drawPixelPattern(ctx, icon, x, y, size, _legacyColor || '#000');
}
