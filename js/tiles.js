// FERRO & CENERE — texture e elementi grafici procedurali di base
// Per la home: pergamena di fondo, bordo cartografico, rosa dei venti.

/**
 * Disegna una texture pergamena procedurale su un canvas offscreen
 * delle dimensioni date e la restituisce. Cacheata per dimensioni.
 */
const _parchmentCache = new Map();
function getParchmentTexture(w, h, seed = 1337) {
  const key = `${w}x${h}_${seed}`;
  if (_parchmentCache.has(key)) return _parchmentCache.get(key);

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  const rnd = mulberry32(seed);

  // 1. base color
  ctx.fillStyle = PALETTE.pergChiara;
  ctx.fillRect(0, 0, w, h);

  // 2. grandi macchie di variazione tonale (perg-media)
  for (let i = 0; i < Math.max(20, (w * h) / 8000); i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const r = 40 + rnd() * 180;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const alpha = 0.08 + rnd() * 0.12;
    grad.addColorStop(0, `rgba(200,170,106,${alpha})`); // pergMedia
    grad.addColorStop(1, 'rgba(200,170,106,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 3. vignettatura scura ai bordi (perg-macchia)
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35,
                                       w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(154,122,58,0)');
  vg.addColorStop(1, 'rgba(90,58,24,0.55)'); // inkMedio
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // 4. macchie scure sparse (invecchiamento)
  for (let i = 0; i < (w * h) / 5000; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const r = 2 + rnd() * 8;
    ctx.fillStyle = `rgba(90,58,24,${0.05 + rnd() * 0.1})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. macchie più scure agli angoli (perg-macchia)
  const corners = [[0, 0], [w, 0], [0, h], [w, h]];
  for (const [cx, cy] of corners) {
    const r = Math.min(w, h) * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(58,32,16,0.35)'); // inkScuro
    grad.addColorStop(1, 'rgba(58,32,16,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 6. grana fine (pixel rumore)
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // 7. qualche fibra leggera (linee sottili)
  ctx.strokeStyle = 'rgba(122,90,42,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < w / 8; i++) {
    ctx.beginPath();
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 10 + rnd() * 60;
    const ang = rnd() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  _parchmentCache.set(key, off);
  return off;
}

/**
 * Disegna un bordo cartografico doppio con angoli decorati.
 */
function drawCartographicBorder(ctx, x, y, w, h) {
  const outer = 14;  // distanza linea esterna dal margine
  const inner = 22;  // distanza linea interna

  ctx.strokeStyle = PALETTE.inkScuro;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + outer, y + outer, w - outer * 2, h - outer * 2);

  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.inkMedio;
  ctx.strokeRect(x + inner, y + inner, w - inner * 2, h - inner * 2);

  // Angoli decorati: piccoli fregi
  const corners = [
    [x + inner, y + inner, 1, 1],
    [x + w - inner, y + inner, -1, 1],
    [x + inner, y + h - inner, 1, -1],
    [x + w - inner, y + h - inner, -1, -1],
  ];
  ctx.strokeStyle = PALETTE.inkScuro;
  ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    // L sull'angolo interno
    ctx.moveTo(cx + sx * 18, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * 18);
    ctx.stroke();
    // piccolo rombo decorativo
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.beginPath();
    ctx.moveTo(cx + sx * 6, cy + sy * 6);
    ctx.lineTo(cx + sx * 10, cy + sy * 6);
    ctx.lineTo(cx + sx * 8, cy + sy * 10);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Disegna una rosa dei venti stile cartografico.
 */
function drawCompassRose(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);

  // cerchio esterno
  ctx.strokeStyle = PALETTE.inkMedio;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // cerchio interno
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  // 4 punte principali (N, E, S, O)
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;

    ctx.fillStyle = i === 3 ? PALETTE.inkScuro : PALETTE.inkMedio; // N più scura (i=3 è -90°? ricalcoliamo)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.cos(ang + 0.18) * r * 0.25, Math.sin(ang + 0.18) * r * 0.25);
    ctx.lineTo(Math.cos(ang - 0.18) * r * 0.25, Math.sin(ang - 0.18) * r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 4 punte secondarie (NE, SE, SO, NO)
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2 + Math.PI / 4;
    const x = Math.cos(ang) * r * 0.7;
    const y = Math.sin(ang) * r * 0.7;
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.cos(ang + 0.22) * r * 0.18, Math.sin(ang + 0.22) * r * 0.18);
    ctx.lineTo(Math.cos(ang - 0.22) * r * 0.18, Math.sin(ang - 0.22) * r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // freccia Nord enfatizzata (verso l'alto = -Y)
  ctx.fillStyle = PALETTE.inkScuro;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.05);
  ctx.lineTo(-r * 0.08, -r * 0.4);
  ctx.lineTo(r * 0.08, -r * 0.4);
  ctx.closePath();
  ctx.fill();

  // lettera N
  ctx.fillStyle = PALETTE.inkScuro;
  ctx.font = `bold ${Math.floor(r * 0.35)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -r * 1.35);

  // borchia centrale
  ctx.fillStyle = PALETTE.inkScuro;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
