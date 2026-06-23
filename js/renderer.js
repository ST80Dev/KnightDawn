// FERRO & CENERE — renderer mappa top-down
// Disegna il mondo (World) dentro un'area, data una camera. Stateless: la
// camera vive nella scena. Lo zoom è discreto (MAP_ZOOM_STEPS) e centrato sul
// centro camera; il pan sposta liberamente quel centro.
//
// camera = { cx, cy, step }  — cx,cy = centro vista in coordinate tile (float);
//                              step = indice in MAP_ZOOM_STEPS.

const MapRenderer = {
  tilePx(cam) { return MAP_ZOOM_STEPS[cam.step]; },

  // Passo di zoom-out minimo: il più piccolo livello in cui il mondo COPRE
  // l'intera area. Sotto questo, ai bordi comparirebbe l'oltre-confine
  // indefinito; capparlo lega i confini del mondo alla cornice della mappa.
  minStep(area) {
    const need = Math.max(area.w / World.width, area.h / World.height);
    for (let i = 0; i < MAP_ZOOM_STEPS.length; i++) {
      if (MAP_ZOOM_STEPS[i] >= need) return i;
    }
    return MAP_ZOOM_STEPS.length - 1;
  },

  // Tiene il centro camera così che il mondo resti inquadrato: niente pan nel
  // vuoto oltre i confini. Limita anche lo zoom-out al cap (minStep) così i
  // bordi del mondo restano legati alla cornice. Se il mondo è più piccolo
  // della vista (caso limite), lo centra.
  clampCam(cam, area) {
    const ms = this.minStep(area);
    if (cam.step < ms) cam.step = ms;
    const t = this.tilePx(cam);
    const halfW = (area.w / 2) / t, halfH = (area.h / 2) / t;
    cam.cx = World.width  * t <= area.w ? World.width  / 2
           : Math.min(Math.max(cam.cx, halfW), World.width  - halfW);
    cam.cy = World.height * t <= area.h ? World.height / 2
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

    // 4. Isolinee di altitudine (cartografia a vista delle zone rialzate).
    if (t >= 5 && World.contourLevels && World.contourLevels.length) {
      this._drawContours(ctx, area, ox, oy, t, x0, y0, x1, y1);
    }

    // 5-6. Strutture + etichette
    for (const s of World.structures) {
      const sx = area.x + (s.x + 0.5 - ox) * t;
      const sy = area.y + (s.y + 0.5 - oy) * t;
      if (sx < area.x - t || sx > area.x + area.w + t ||
          sy < area.y - t || sy > area.y + area.h + t) continue;
      this._drawStructure(ctx, s, sx, sy, t);
    }

    // 6b. Zone speciali agli estremi (natura ignota finché non scoperte).
    for (const sp of World.specials) {
      const sx = area.x + (sp.x + 0.5 - ox) * t;
      const sy = area.y + (sp.y + 0.5 - oy) * t;
      if (sx < area.x - t || sx > area.x + area.w + t ||
          sy < area.y - t || sy > area.y + area.h + t) continue;
      this._drawSpecial(ctx, sp, sx, sy, t);
    }

    // 7. Percorso di viaggio (se in corso): scia di tile + marker meta.
    if (Travel.isActive() && Travel.path) {
      this._drawPath(ctx, area, ox, oy, t, Travel.path, Travel.idx);
    }

    // 8. Cavaliere
    const kx = area.x + (knightPos.x + 0.5 - ox) * t;
    const ky = area.y + (knightPos.y + 0.5 - oy) * t;
    this._drawKnight(ctx, kx, ky, t);
  },

  // Scia di puntini sul percorso ancora da percorrere + bandiera sulla meta.
  // Disegnata in inchiostro scuro: leggibile su qualsiasi bioma. I tile già
  // attraversati (idx > i) non vengono mostrati per non sporcare la mappa.
  _drawPath(ctx, area, ox, oy, t, path, idx) {
    const dot = Math.max(2, Math.floor(t * 0.20));
    ctx.fillStyle = PALETTE.inkScuro;
    for (let i = idx; i < path.length - 1; i++) {
      const p = path[i];
      const sx = area.x + (p.x + 0.5 - ox) * t;
      const sy = area.y + (p.y + 0.5 - oy) * t;
      if (sx < area.x - t || sx > area.x + area.w + t ||
          sy < area.y - t || sy > area.y + area.h + t) continue;
      ctx.fillRect(Math.round(sx - dot / 2), Math.round(sy - dot / 2), dot, dot);
    }
    // Bandierina sulla meta.
    const end = path[path.length - 1];
    if (!end) return;
    const ex = area.x + (end.x + 0.5 - ox) * t;
    const ey = area.y + (end.y + 0.5 - oy) * t;
    const fh = Math.max(S(10), t * 0.7);
    const fw = fh * 0.55;
    const pw = Math.max(1, fh * 0.10);
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(Math.round(ex - pw / 2), Math.round(ey - fh), pw, fh);
    ctx.fillStyle = PALETTE.rossoBandiera;
    ctx.fillRect(Math.round(ex), Math.round(ey - fh), Math.round(fw), Math.round(fh * 0.55));
  },

  _baseColor(b) {
    const B = World.BIOME;
    // Un solo tono per bioma: niente micro-texture intra-tile. La varietà
    // visiva nasce dalla MESCOLANZA di tile diversi (grumi di foresta,
    // chiazze di roccia, radure) non da accenti dentro al singolo tile.
    switch (b) {
      case B.ACQUA:    return PALETTE.bluFiume;
      case B.FIUME:    return PALETTE.bluFiumeCh;
      case B.GHIACCIO: return PALETTE.ghiaccio;
      case B.PIANURA:  return PALETTE.verdePrato;     // pianura temperata (centro)
      case B.PIANURA_N:return PALETTE.pianuraNord;    // pianura settentrionale
      case B.PIANURA_S:return PALETTE.pianuraSud;     // pianura meridionale
      case B.COLLINA:  return PALETTE.pergScura;
      case B.SABBIA:   return PALETTE.sabbia;
      case B.PALUDE:   return PALETTE.verdePalude;
      case B.NEVE:     return PALETTE.neveCime;
      case B.FORESTA:  return PALETTE.verdeBosco;
      case B.MONTAGNA: return PALETTE.marrMontagna;
      case B.ROCCIA:   return PALETTE.grigioPietra;
      default:         return PALETTE.pergChiara;
    }
  },

  _drawTile(ctx, b, sx, sy, cell, t, tx, ty) {
    const B = World.BIOME;
    // Campitura piatta: il bioma è leggibile dal colore + (a zoom) dall'icona.
    ctx.fillStyle = this._baseColor(b);
    ctx.fillRect(sx, sy, cell, cell);

    // Mare: sottili righe blu scure orizzontali per dare senso d'onda.
    // Pattern deterministico per tile, sfalsato così le righe sembrano
    // ondulare invece di formare bande nette.
    if (b === B.ACQUA && t >= 4) {
      ctx.fillStyle = PALETTE.bluMareSc;
      const stripeH = Math.max(1, Math.floor(t * 0.08));
      const ph = ((tx * 3 + ty * 5) & 3);  // 0..3 fase orizzontale
      const pv = ((tx + ty * 2) & 1);      // alternanza verticale
      const yy = sy + Math.floor(t * (pv ? 0.32 : 0.62));
      const x1 = sx + Math.floor(t * (ph * 0.12));
      const x2 = sx + Math.floor(t * (0.55 + ph * 0.10));
      ctx.fillRect(x1, yy, Math.floor(t * 0.32), stripeH);
      if (t >= 8) ctx.fillRect(x2, yy + stripeH * 2, Math.floor(t * 0.22), stripeH);
    }

    if (t < 7) return; // zoom out: solo colore

    // Zoom in: icone cartografiche stilizzate centrate nel tile.
    const cx = sx + t / 2, cy = sy + t / 2;
    if (b === B.FORESTA) {
      const r = t * 0.34;
      this._tri(ctx, cx, cy - r, cx - r * 0.8, cy + r * 0.7, cx + r * 0.8, cy + r * 0.7, PALETTE.verdeBoscoSc);
      this._tri(ctx, cx, cy - r * 1.4, cx - r * 0.6, cy + r * 0.2, cx + r * 0.6, cy + r * 0.2, PALETTE.verdeBoscoSc);
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.fillRect(cx - Math.max(1, t * 0.04), cy + r * 0.6, Math.max(2, t * 0.08), Math.max(2, t * 0.18));
    } else if (b === B.MONTAGNA) {
      const r = t * 0.42;
      this._tri(ctx, cx, cy - r, cx - r, cy + r * 0.6, cx + r, cy + r * 0.6, PALETTE.marrMontagna);
      this._tri(ctx, cx, cy - r, cx + r, cy + r * 0.6, cx + r * 0.15, cy + r * 0.6, PALETTE.marrMontCh);
      this._tri(ctx, cx, cy - r, cx - r * 0.3, cy - r * 0.4, cx + r * 0.3, cy - r * 0.4, PALETTE.neveCime);
    } else if (b === B.ROCCIA) {
      // Roccia: 3 ciottoli SEPARATI (niente overlap → niente effetto crescente).
      const r = t * 0.16;
      ctx.fillStyle = PALETTE.grigioPietraSc;
      ctx.beginPath(); ctx.arc(cx - r * 1.5, cy + r * 0.8, r * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 1.5, cy + r * 0.6, r * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.grigioPietra;
      ctx.beginPath(); ctx.arc(cx + r * 0.1, cy - r * 0.9, r * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.fillRect(cx - Math.max(1, t * 0.03), cy - r * 1.6, Math.max(1, t * 0.06), Math.max(1, t * 0.06));
    } else if (b === B.COLLINA && t >= 10) {
      // Collina: due gobbe basse marroncine
      const r = t * 0.28;
      ctx.fillStyle = PALETTE.pergMacchia;
      ctx.beginPath();
      ctx.arc(cx - r * 0.6, cy + r * 0.2, r * 0.9, Math.PI, 0); ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.6, cy + r * 0.2, r * 0.75, Math.PI, 0); ctx.fill();
    } else if (b === B.PALUDE && t >= 10) {
      ctx.strokeStyle = PALETTE.verdeBoscoSc;
      ctx.lineWidth = Math.max(1, t * 0.05);
      ctx.beginPath();
      ctx.moveTo(sx + t * 0.3, cy); ctx.lineTo(sx + t * 0.3, cy - t * 0.25);
      ctx.moveTo(sx + t * 0.6, cy); ctx.lineTo(sx + t * 0.6, cy - t * 0.18);
      ctx.stroke();
    } else if (b === B.SABBIA && t >= 9) {
      // Sabbia: due piccole onde-duna stilizzate
      ctx.strokeStyle = PALETTE.pergMacchia;
      ctx.lineWidth = Math.max(1, t * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - t * 0.28, cy - t * 0.05);
      ctx.quadraticCurveTo(cx - t * 0.10, cy - t * 0.20, cx + t * 0.08, cy - t * 0.05);
      ctx.moveTo(cx - t * 0.02, cy + t * 0.18);
      ctx.quadraticCurveTo(cx + t * 0.15, cy + t * 0.03, cx + t * 0.30, cy + t * 0.18);
      ctx.stroke();
    } else if (b === B.NEVE && t >= 9) {
      // Neve: 4 fiocchi piccoli sparsi → texture distinguibile dal vuoto bianco
      ctx.fillStyle = PALETTE.ghiaccio;
      const d = Math.max(1, Math.floor(t * 0.09));
      const pts = [
        [cx - t * 0.22, cy - t * 0.08],
        [cx + t * 0.18, cy - t * 0.22],
        [cx + t * 0.08, cy + t * 0.18],
        [cx - t * 0.16, cy + t * 0.22],
      ];
      for (const [px, py] of pts) ctx.fillRect(px, py, d, d);
    } else if (b === B.GHIACCIO && t >= 9) {
      // Ghiaccio: crepe sottili (linee spezzate angolate)
      ctx.strokeStyle = PALETTE.bluFiume;
      ctx.lineWidth = Math.max(1, t * 0.04);
      ctx.beginPath();
      ctx.moveTo(cx - t * 0.25, cy - t * 0.10);
      ctx.lineTo(cx - t * 0.05, cy + t * 0.05);
      ctx.lineTo(cx + t * 0.18, cy - t * 0.02);
      ctx.lineTo(cx + t * 0.28, cy + t * 0.18);
      ctx.moveTo(cx - t * 0.10, cy + t * 0.20);
      ctx.lineTo(cx + t * 0.08, cy + t * 0.10);
      ctx.stroke();
    }
  },

  // Disegna isolinee fra tile la cui elevazione attraversa una soglia. Più
  // soglie attraversate → più tratti vicini → terreno più ripido. Salta i
  // tile d'acqua (niente isolinee in mare/fiume).
  _drawContours(ctx, area, ox, oy, t, x0, y0, x1, y1) {
    const W = World.width, H = World.height;
    const elev = World.elev;
    const levels = World.contourLevels;
    const nL = levels.length;
    // Inchiostro da cartografo: più evidente, righe meno fitte (poche soglie).
    ctx.strokeStyle = 'rgba(58, 32, 16, 0.85)'; // inkScuro quasi pieno
    ctx.lineWidth = Math.max(1, Math.floor(t * 0.10));
    ctx.lineCap = 'butt';
    const isWater = (b) => World.isWater(b);
    for (let ty = Math.max(0, y0); ty < Math.min(H, y1); ty++) {
      for (let tx = Math.max(0, x0); tx < Math.min(W, x1); tx++) {
        const i = ty * W + tx;
        const b = World.tiles[i];
        if (isWater(b)) continue;
        const e = elev[i];
        const sx = area.x + (tx - ox) * t;
        const sy = area.y + (ty - oy) * t;
        // Bordo destro: confronto con il vicino a destra.
        if (tx + 1 < W) {
          const j = i + 1;
          if (!isWater(World.tiles[j])) {
            const en = elev[j];
            for (let k = 0; k < nL; k++) {
              const L = levels[k];
              if ((e >= L) !== (en >= L)) {
                ctx.beginPath();
                ctx.moveTo(sx + t, sy);
                ctx.lineTo(sx + t, sy + t);
                ctx.stroke();
                break;
              }
            }
          }
        }
        // Bordo inferiore: confronto con il vicino sotto.
        if (ty + 1 < H) {
          const j = i + W;
          if (!isWater(World.tiles[j])) {
            const en = elev[j];
            for (let k = 0; k < nL; k++) {
              const L = levels[k];
              if ((e >= L) !== (en >= L)) {
                ctx.beginPath();
                ctx.moveTo(sx,     sy + t);
                ctx.lineTo(sx + t, sy + t);
                ctx.stroke();
                break;
              }
            }
          }
        }
      }
    }
  },

  _drawStructure(ctx, s, cx, cy, t) {
    if (s.type === 'castle') this._drawCastle(ctx, cx, cy, t, s.name);
    else if (s.type === 'keep') this._drawKeep(ctx, cx, cy, t, s.name);
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

  // Castello minore / torre di guardia: una sola torre più piccola del
  // castello maggiore, senza stendardo, merlature sopra. Avamposto.
  _drawKeep(ctx, cx, cy, t, name) {
    const s = Math.max(S(9), t * 0.65);
    const w = s * 0.50, h = s * 0.95;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    const o = Math.max(1, s * 0.10);

    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(x - o, y - o, w + 2 * o, h + 2 * o);
    ctx.fillStyle = PALETTE.grigioPietra;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PALETTE.grigioPietraSc;       // ombra a destra
    ctx.fillRect(x + w * 0.60, y, w * 0.40, h);
    // merlatura a 3 denti
    ctx.fillStyle = PALETTE.inkNero;
    const nw = w / 3;
    ctx.fillRect(x + nw, y - o, nw, o * 1.6);
    // feritoia + portone
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(cx - w * 0.10, y + h * 0.30, w * 0.20, h * 0.18);
    ctx.fillRect(cx - w * 0.18, y + h * 0.62, w * 0.36, h * 0.38);

    this._label(ctx, name, cx, y + h + o + S(2), t, false);
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

  // Marker di zona speciale: rombo scuro con orlo chiaro. Finché non scoperta
  // mostra solo un "?" (la natura resta ignota); da scoperta mostrerebbe nome.
  _drawSpecial(ctx, sp, cx, cy, t) {
    const r = Math.max(S(7), t * 0.7);
    // rombo con contorno chiaro per stacco
    const dia = (rr, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rr); ctx.lineTo(cx + rr, cy);
      ctx.lineTo(cx, cy + rr); ctx.lineTo(cx - rr, cy);
      ctx.closePath(); ctx.fill();
    };
    dia(r + Math.max(1, r * 0.3), PALETTE.pergChiara);
    dia(r, sp.discovered ? PALETTE.rossoBandiera : PALETTE.inkScuro);
    ctx.fillStyle = PALETTE.pergChiara;
    ctx.font = `bold ${Math.max(S(9), r)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sp.discovered ? '!' : '?', cx, cy + r * 0.08);
    if (sp.discovered) this._label(ctx, sp.name, cx, cy + r + S(2), t, true);
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
      case B.FIUME:    hex = PALETTE.bluFiumeCh; break;
      case B.GHIACCIO: hex = PALETTE.ghiaccio; break;
      case B.FORESTA:  hex = PALETTE.verdeBosco; break;
      case B.MONTAGNA: hex = PALETTE.marrMontagna; break;
      case B.COLLINA:  hex = PALETTE.pergScura; break;
      case B.PALUDE:   hex = PALETTE.verdePalude; break;
      case B.SABBIA:   hex = PALETTE.sabbia; break;
      case B.NEVE:     hex = PALETTE.neveCime; break;
      case B.ROCCIA:   hex = PALETTE.grigioPietra; break;
      case B.PIANURA:  hex = PALETTE.verdePrato; break;
      case B.PIANURA_N:hex = PALETTE.pianuraNord; break;
      case B.PIANURA_S:hex = PALETTE.pianuraSud; break;
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
