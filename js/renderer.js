// FERRO & CENERE — renderer mappa top-down
// Disegna il mondo (World) dentro un'area, data una camera. Stateless: la
// camera vive nella scena. Lo zoom è discreto (MAP_ZOOM_STEPS) e centrato sul
// centro camera; il pan sposta liberamente quel centro.
//
// camera = { cx, cy, step }  — cx,cy = centro vista in coordinate tile (float);
//                              step = indice in MAP_ZOOM_STEPS.

const MapRenderer = {
  tilePx(cam) { return MAP_ZOOM_STEPS[cam.step]; },

  // Tiene il centro camera così che il mondo resti inquadrato: niente pan nel
  // vuoto oltre i confini. Se il mondo è più piccolo della vista, lo centra.
  clampCam(cam, area) {
    const t = this.tilePx(cam);
    const halfW = (area.w / 2) / t, halfH = (area.h / 2) / t;
    cam.cx = World.width  <= halfW * 2 ? World.width  / 2
           : Math.min(Math.max(cam.cx, halfW), World.width  - halfW);
    cam.cy = World.height <= halfH * 2 ? World.height / 2
           : Math.min(Math.max(cam.cy, halfH), World.height - halfH);
  },

  zoom(cam, dir) {
    cam.step = Math.max(0, Math.min(cam.step + dir, MAP_ZOOM_STEPS.length - 1));
  },

  pan(cam, dxPx, dyPx) {
    const t = this.tilePx(cam);
    cam.cx -= dxPx / t;
    cam.cy -= dyPx / t;
    // Il clamp avviene al disegno (serve l'area): qui solo lo spostamento.
  },

  // Origine = coordinate tile (float) all'angolo alto-sx dell'area.
  _origin(area, cam) {
    const t = this.tilePx(cam);
    return { ox: cam.cx - (area.w / 2) / t, oy: cam.cy - (area.h / 2) / t, t };
  },

  screenToWorld(area, cam, sx, sy) {
    const { ox, oy, t } = this._origin(area, cam);
    return { x: ox + (sx - area.x) / t, y: oy + (sy - area.y) / t };
  },

  // ─── Disegno ──────────────────────────────────────────────────────────────
  draw(ctx, area, cam, knightPos) {
    const { ox, oy, t } = this._origin(area, cam);

    // 0. Oceano: tutto ciò che è oltre i confini del mondo è mare aperto
    //    (confine naturale "invalicabile"). Niente più pergamena vuota.
    ctx.fillStyle = PALETTE.bluFiume;
    ctx.fillRect(area.x, area.y, area.w, area.h);

    const x0 = Math.floor(ox) - 1;
    const y0 = Math.floor(oy) - 1;
    const x1 = Math.ceil(ox + area.w / t) + 1;
    const y1 = Math.ceil(oy + area.h / t) + 1;

    // 1-2. Terreno (biomi). Solo i tile visibili (culling).
    const cell = Math.ceil(t) + 1;
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const b = World.biomeAt(tx, ty);
        if (b < 0) continue;
        const sx = Math.floor(area.x + (tx - ox) * t);
        const sy = Math.floor(area.y + (ty - oy) * t);
        this._drawTile(ctx, b, sx, sy, cell, t, tx, ty);
      }
    }

    // 5-6. Strutture + etichette
    for (const s of World.structures) {
      const sx = area.x + (s.x + 0.5 - ox) * t;
      const sy = area.y + (s.y + 0.5 - oy) * t;
      if (sx < area.x - t || sx > area.x + area.w + t ||
          sy < area.y - t || sy > area.y + area.h + t) continue;
      this._drawStructure(ctx, s, sx, sy, t);
    }

    // 8. Cavaliere
    const kx = area.x + (knightPos.x + 0.5 - ox) * t;
    const ky = area.y + (knightPos.y + 0.5 - oy) * t;
    this._drawKnight(ctx, kx, ky, t);
  },

  _baseColor(b, tx, ty) {
    const B = World.BIOME;
    // Leggera variazione di tono per evitare campiture piatte.
    const v = ((tx * 7 + ty * 13) & 3);
    switch (b) {
      case B.ACQUA:    return v < 2 ? PALETTE.bluFiume : PALETTE.bluFiumeCh;
      case B.PIANURA:  return v === 0 ? PALETTE.pergMedia : PALETTE.pergChiara;
      case B.COLLINA:  return v < 1 ? PALETTE.pergScura : PALETTE.pergMedia;
      case B.SABBIA:   return PALETTE.sabbia;
      case B.PALUDE:   return PALETTE.verdePalude;
      case B.FORESTA:  return PALETTE.pergMedia;   // sfondo, l'albero ci va sopra
      case B.MONTAGNA: return PALETTE.pergScura;   // sfondo, il picco ci va sopra
      default:         return PALETTE.pergChiara;
    }
  },

  _drawTile(ctx, b, sx, sy, cell, t, tx, ty) {
    const B = World.BIOME;
    ctx.fillStyle = this._baseColor(b, tx, ty);
    ctx.fillRect(sx, sy, cell, cell);

    if (t < 7) {
      // Zoom out: niente icone, solo macchia di colore per foresta/montagna.
      if (b === B.FORESTA)  { ctx.fillStyle = PALETTE.verdeBosco;  ctx.fillRect(sx, sy, cell, cell); }
      if (b === B.MONTAGNA) { ctx.fillStyle = PALETTE.marrMontagna; ctx.fillRect(sx, sy, cell, cell); }
      return;
    }

    // Zoom in: icone cartografiche stilizzate centrate nel tile.
    const cx = sx + t / 2, cy = sy + t / 2;
    if (b === B.FORESTA) {
      const r = t * 0.34;
      this._tri(ctx, cx, cy - r, cx - r * 0.8, cy + r * 0.7, cx + r * 0.8, cy + r * 0.7, PALETTE.verdeBosco);
      this._tri(ctx, cx, cy - r * 1.4, cx - r * 0.6, cy + r * 0.2, cx + r * 0.6, cy + r * 0.2, PALETTE.verdeBoscoSc);
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.fillRect(cx - Math.max(1, t * 0.04), cy + r * 0.6, Math.max(2, t * 0.08), Math.max(2, t * 0.18));
    } else if (b === B.MONTAGNA) {
      const r = t * 0.42;
      this._tri(ctx, cx, cy - r, cx - r, cy + r * 0.6, cx + r, cy + r * 0.6, PALETTE.marrMontagna);
      this._tri(ctx, cx, cy - r, cx + r, cy + r * 0.6, cx + r * 0.15, cy + r * 0.6, PALETTE.marrMontCh);
      this._tri(ctx, cx, cy - r, cx - r * 0.3, cy - r * 0.4, cx + r * 0.3, cy - r * 0.4, PALETTE.neveCime);
    } else if (b === B.PALUDE && t >= 10) {
      ctx.strokeStyle = PALETTE.verdeBoscoSc;
      ctx.lineWidth = Math.max(1, t * 0.05);
      ctx.beginPath();
      ctx.moveTo(sx + t * 0.3, cy); ctx.lineTo(sx + t * 0.3, cy - t * 0.25);
      ctx.moveTo(sx + t * 0.6, cy); ctx.lineTo(sx + t * 0.6, cy - t * 0.18);
      ctx.stroke();
    }
  },

  _drawStructure(ctx, s, cx, cy, t) {
    if (s.type === 'castle') this._drawCastle(ctx, cx, cy, t, s.name);
    else this._drawVillage(ctx, cx, cy, t, s.name);
  },

  // Le strutture importanti hanno una dimensione MINIMA su schermo (in px
  // logici) così restano evidenti anche a zoom out massimo, non singole tile.
  // Tutte hanno un contorno scuro per staccare da qualsiasi bioma sotto.
  _drawCastle(ctx, cx, cy, t, name) {
    const s = Math.max(S(12), t * 0.95);
    const w = s, h = s * 0.85;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    const o = Math.max(1, s * 0.10);

    ctx.fillStyle = PALETTE.inkNero;                 // contorno
    ctx.fillRect(x - o, y - o, w + 2 * o, h + 2 * o);
    ctx.fillStyle = PALETTE.grigioPietra;            // corpo
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PALETTE.grigioPietraSc;          // ombra a destra
    ctx.fillRect(x + w * 0.62, y, w * 0.38, h);
    // merlature (scavate nel contorno in cima)
    ctx.fillStyle = PALETTE.inkNero;
    const nw = w / 5;
    for (let i = 0; i < 2; i++) ctx.fillRect(x + nw * (i * 2 + 1), y - o, nw, o * 1.6);
    // portone
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(cx - w * 0.13, y + h * 0.45, w * 0.26, h * 0.55);
    // stendardo
    const fh = h * 0.55;
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(cx - Math.max(1, o * 0.5), y - o - fh, Math.max(1, o), fh);
    ctx.fillStyle = PALETTE.rossoBandiera;
    ctx.fillRect(cx, y - o - fh, w * 0.30, fh * 0.45);

    this._label(ctx, name, cx, y + h + o + S(2), t, true);
  },

  _drawVillage(ctx, cx, cy, t, name) {
    const s = Math.max(S(10), t * 0.8);
    const u = s * 0.5;
    for (const ox of [-u * 0.85, u * 0.85]) {
      const hx = cx + ox;
      const bx = hx - u * 0.5, by = cy - u * 0.1;
      ctx.fillStyle = PALETTE.inkNero; // contorno casa
      ctx.fillRect(bx - 1, by - 1, u + 2, u * 0.7 + 2);
      ctx.fillStyle = PALETTE.pergChiara; // muro
      ctx.fillRect(bx, by, u, u * 0.7);
      // tetto con contorno
      this._tri(ctx, hx, by - u * 0.62, hx - u * 0.72, by, hx + u * 0.72, by, PALETTE.inkNero);
      this._tri(ctx, hx, by - u * 0.5,  hx - u * 0.6,  by, hx + u * 0.6,  by, PALETTE.marrTetto);
    }
    this._label(ctx, name, cx, cy + u + S(2), t, false);
  },

  _drawKnight(ctx, x, y, t) {
    const r = Math.max(S(6), t * 0.45);
    ctx.fillStyle = PALETTE.inkNero;            // alone scuro per stacco
    ctx.beginPath(); ctx.arc(x, y, r + Math.max(1, r * 0.25), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.cavMarker;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.inkNero;
    const w = Math.max(1, r * 0.3);
    ctx.fillRect(x - r * 1.5, y - w / 2, r * 3, w);
    ctx.fillRect(x - w / 2, y - r * 1.5, w, r * 3);
  },

  // Etichetta su targhetta chiara con bordo scuro: leggibile su qualunque
  // fondo (mare, foresta, montagna). Mostrata solo da un certo zoom in poi
  // per non affollare la vista regione.
  _label(ctx, text, cx, yTop, t, strong) {
    if (t < 8) return;
    const fs = Math.max(S(11), t * 0.6);
    ctx.font = `${strong ? 'bold ' : ''}${fs}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(text).width;
    const padX = fs * 0.45, padY = fs * 0.18;
    const bw = tw + padX * 2, bh = fs + padY * 2;
    const bx = cx - bw / 2, by = yTop;
    ctx.fillStyle = 'rgba(216,200,160,0.88)'; // pergChiara semitrasparente
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.lineWidth = Math.max(1, fs * 0.07);
    ctx.strokeStyle = PALETTE.inkScuro;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillText(text, cx, by + padY);
  },

  _tri(ctx, x0, y0, x1, y1, x2, y2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  },

  // ─── Thumbnail mondo (per minimappa) ────────────────────────────────────────
  // Canvas off-screen 1px/tile, cachato per seed: la minimappa lo scala con
  // drawImage invece di ridisegnare pixel-per-pixel a ogni frame.
  _thumbCanvas: null,
  _thumbSeed: null,
  _biomeRGB(b) {
    const B = World.BIOME;
    let hex;
    switch (b) {
      case B.ACQUA:    hex = PALETTE.bluFiume; break;
      case B.FORESTA:  hex = PALETTE.verdeBosco; break;
      case B.MONTAGNA: hex = PALETTE.marrMontagna; break;
      case B.COLLINA:  hex = PALETTE.pergScura; break;
      case B.PALUDE:   hex = PALETTE.verdePalude; break;
      case B.SABBIA:   hex = PALETTE.sabbia; break;
      default:         hex = PALETTE.pergChiara;
    }
    return hexToRgb(hex);
  },
  thumbnail() {
    if (this._thumbCanvas && this._thumbSeed === World.seed) return this._thumbCanvas;
    const W = World.width, H = World.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let i = 0; i < World.tiles.length; i++) {
      const rgb = this._biomeRGB(World.tiles[i]);
      const o = i * 4;
      img.data[o] = rgb.r; img.data[o + 1] = rgb.g; img.data[o + 2] = rgb.b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this._thumbCanvas = c;
    this._thumbSeed = World.seed;
    return c;
  },
};
