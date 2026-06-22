// FERRO & CENERE — schermata gioco principale (bozza pannelli HUD)
// Disegnata sul canvas interno (INTERNAL_W x INTERNAL_H). Mostra la
// struttura: barra superiore con titolo + meta, pannello stato cavaliere
// a sinistra, mappa al centro, info contesto a destra, log eventi e
// minimappa in basso. I contenuti sono placeholder rappresentativi.

const GameScreen = {
  canvas: null,
  ctx: null,
  hoverBtn: -1,
  _lastHover: -1,
  actionButtons: [],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.actionButtons = [
      { label: 'INVENTARIO', action: 'inventario' },
      { label: 'MAPPA',      action: 'mappa' },
      { label: 'ACCAMPA',    action: 'accampa' },
      { label: 'INTERAGISCI', action: 'interagisci', disabled: true },
    ];

    const display = document.getElementById('game');
    display.addEventListener('mousemove', (e) => this.onMove(e));
    display.addEventListener('click', (e) => this.onClick(e));
  },

  onEnter() {
    // Placeholder: in futuro qui si inizializza lo stato della partita
    this.knight = {
      nome: 'Sir Aldric di Vorn',
      titolo: 'Cavaliere Errante',
      vigore: { cur: 14, max: 20 },
      volonta: { cur: 11, max: 16 },
      onore: { cur: 8, max: 10 },
      ferite: { cur: 2, max: 12 },
      equip: ['Spada bastarda', 'Scudo araldico', 'Cotta di maglia', 'Mantello scuro'],
      reputazione: [
        { nome: 'Casata Vorn',    val: 3 },
        { nome: 'Ordine del Cervo', val: 1 },
        { nome: 'Mercanti Liberi', val: 0 },
        { nome: 'Banditi del Sud', val: -2 },
      ],
    };
    this.log = [
      'Inizi il tuo viaggio nelle Marche di Vorn.',
      'Il vento dell\'alba porta odore di pioggia.',
      'Lungo la strada incontri un mercante.',
      'Egli ti racconta di rovine a est.',
      'Una taverna si scorge a sud-ovest.',
    ];
    this.meta = {
      anno: 1042,
      turno: 1,
      stagione: 'Primavera',
      meteo: 'Sereno',
      destinazione: 'nessuna',
    };
  },

  // ─── layout calcolato a partire dalle dimensioni interne ───
  layout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const pad = PIXEL * 4;
    const topBarH = 90;
    const leftW = 420;
    const rightW = 360;
    const bottomH = 280;

    const map = {
      x: leftW + pad,
      y: topBarH + pad,
      w: W - leftW - rightW - pad * 3,
      h: H - topBarH - bottomH - pad * 3,
    };
    const left = {
      x: pad,
      y: topBarH + pad,
      w: leftW - pad,
      h: H - topBarH - pad * 2,
    };
    const right = {
      x: W - rightW,
      y: topBarH + pad,
      w: rightW - pad,
      h: H - topBarH - bottomH - pad * 3,
    };
    const log = {
      x: leftW + pad,
      y: H - bottomH - pad,
      w: map.w * 0.62,
      h: bottomH,
    };
    const mini = {
      x: log.x + log.w + pad,
      y: H - bottomH - pad,
      w: map.w - log.w - pad,
      h: bottomH,
    };
    const topBar = { x: 0, y: 0, w: W, h: topBarH };

    return { pad, topBar, left, map, right, log, mini };
  },

  layoutButtons(area) {
    // 4 pulsanti azione disposti in due righe da 2 dentro l'area log (in basso)
    const cols = 2;
    const rows = 2;
    const gap = PIXEL * 3;
    const padInner = PIXEL * 5;
    const bw = (area.w - padInner * 2 - gap * (cols - 1)) / cols;
    const bh = 36;
    const startX = area.x + padInner;
    const startY = area.y + area.h - bh * rows - gap * (rows - 1) - padInner;
    this.actionButtons.forEach((b, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      b.x = Math.floor(startX + c * (bw + gap));
      b.y = Math.floor(startY + r * (bh + gap));
      b.w = Math.floor(bw);
      b.h = bh;
    });
  },

  onMove(e) {
    if (Scenes.current !== this) return;
    const { x: mx, y: my } = window.GameRender.displayToInternal(e.clientX, e.clientY);
    let h = -1;
    this.actionButtons.forEach((b, i) => {
      if (!b.disabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) h = i;
    });
    if (h !== this.hoverBtn) {
      this.hoverBtn = h;
      document.getElementById('game').style.cursor = h >= 0 ? 'pointer' : 'default';
      window.GameRender.invalidate();
    }
  },

  onClick() {
    if (Scenes.current !== this) return;
    if (this.hoverBtn < 0) return;
    const b = this.actionButtons[this.hoverBtn];
    if (b.disabled) return;
    console.log('Azione gioco:', b.action);
  },

  // ─── disegno ───────────────────────────────────────────────
  draw() {
    const L = this.layout();
    this.layoutButtons(L.log);

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fondo: pergamena su tutto
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, W, H);
    const parchment = getParchmentTexture(W, H, 4242);
    ctx.drawImage(parchment, 0, 0);

    // Barra superiore (titolo + meta)
    this.drawTopBar(L.topBar);

    // Pannello stato cavaliere (sinistra)
    this.drawPanel(L.left, 'STATO CAVALIERE');
    this.drawKnightStatus(L.left);

    // Pannello mappa (centro)
    this.drawMapPanel(L.map);

    // Pannello info contesto (destra)
    this.drawPanel(L.right, 'CONTESTO');
    this.drawContext(L.right);

    // Log eventi (basso-centro)
    this.drawPanel(L.log, 'LOG EVENTI E AZIONI');
    this.drawLogAndActions(L.log);

    // Minimappa (basso-destra)
    this.drawPanel(L.mini, 'MINIMAPPA REGIONALE');
    this.drawMinimap(L.mini);
  },

  // Pannello base con cornice pixel-art
  drawPanel(area, title) {
    const ctx = this.ctx;
    // Sfondo del pannello (toni piu scuri della pergamena)
    ctx.fillStyle = PALETTE.pergScura;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    // Bordo esterno doppio
    drawPixelRectStroke(ctx, area.x, area.y, area.w, area.h, PALETTE.inkScuro);
    drawPixelRectStroke(ctx, area.x + PIXEL * 2, area.y + PIXEL * 2,
                        area.w - PIXEL * 4, area.h - PIXEL * 4, PALETTE.inkMedio);
    // Cartiglio del titolo (banda in alto)
    const bandH = 28;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x + PIXEL * 4, area.y + PIXEL * 4, area.w - PIXEL * 8, bandH);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, area.x + PIXEL * 8, area.y + PIXEL * 4 + bandH / 2);
  },

  // ─── BARRA SUPERIORE ───────────────────────────────────────
  drawTopBar(area) {
    const ctx = this.ctx;
    // Banda scura
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    // Bordo inferiore decorato
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(area.x, area.y + area.h - PIXEL, area.w, PIXEL);

    // Titolo gioco a sinistra
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 42px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KNIGHT DAWN', PIXEL * 6, area.h / 2);

    // Meta a destra
    const meta = this.meta;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '18px "Courier New", monospace';
    ctx.textAlign = 'right';
    const lines = [
      `Anno ${meta.anno}  ·  Turno ${meta.turno}`,
      `${meta.stagione}  ·  ${meta.meteo}  ·  Destinazione: ${meta.destinazione}`,
    ];
    ctx.fillText(lines[0], area.w - PIXEL * 6, area.h / 2 - 12);
    ctx.fillText(lines[1], area.w - PIXEL * 6, area.h / 2 + 12);

    // Rosa dei venti centrata (piccolina)
    drawCompassRose(ctx, area.x + area.w / 2, area.y + area.h / 2, 30);
  },

  // ─── PANNELLO STATO CAVALIERE ──────────────────────────────
  drawKnightStatus(area) {
    const ctx = this.ctx;
    const k = this.knight;
    const innerX = area.x + PIXEL * 8;
    let y = area.y + PIXEL * 4 + 28 + PIXEL * 6;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Nome
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText(k.nome, innerX, y);
    y += 28;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = 'italic 16px "Courier New", monospace';
    ctx.fillText(k.titolo, innerX, y);
    y += 30;

    // Barre attributi
    this.drawAttrBar(innerX, y, area.w - PIXEL * 16, 'VIGORE',  k.vigore,  '#2a7a1a',  '#3a9a22'); y += 30;
    this.drawAttrBar(innerX, y, area.w - PIXEL * 16, 'VOLONTÀ', k.volonta, '#4a3ab0',  '#6050c8'); y += 30;
    this.drawAttrBar(innerX, y, area.w - PIXEL * 16, 'ONORE',   k.onore,   '#b07a18',  '#d09820'); y += 30;
    this.drawAttrBar(innerX, y, area.w - PIXEL * 16, 'FERITE',  k.ferite,  '#aa2020',  '#cc2828'); y += 36;

    // Equipaggiamento
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('EQUIPAGGIAMENTO', innerX, y); y += 22;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '15px "Courier New", monospace';
    for (const item of k.equip) {
      ctx.fillText('· ' + item, innerX, y);
      y += 20;
    }
    y += 10;

    // Reputazione
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('REPUTAZIONE', innerX, y); y += 22;
    ctx.font = '15px "Courier New", monospace';
    for (const r of k.reputazione) {
      ctx.fillStyle = PALETTE.hudNormale;
      ctx.fillText(r.nome, innerX, y);
      // pallini di reputazione (-3..+3)
      const dotW = 10;
      const dotsX = area.x + area.w - PIXEL * 8 - dotW * 7;
      for (let i = -3; i <= 3; i++) {
        const filled = (r.val >= 0 && i > 0 && i <= r.val) ||
                       (r.val < 0 && i < 0 && i >= r.val);
        ctx.fillStyle = i === 0
          ? PALETTE.inkMedio
          : (filled
              ? (r.val > 0 ? '#3a9a22' : '#aa2020')
              : PALETTE.inkMedio);
        const dx = dotsX + (i + 3) * dotW;
        ctx.fillRect(dx, y + 4, dotW - 2, dotW - 2);
      }
      y += 20;
    }
  },

  drawAttrBar(x, y, w, label, value, color, colorHi) {
    const ctx = this.ctx;
    // etichetta
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    // numeri
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${value.cur}/${value.max}`, x + w, y);
    // barra
    const barY = y + 14;
    const barH = 10;
    ctx.fillStyle = '#0e0804';
    ctx.fillRect(x, barY, w, barH);
    drawPixelRectStroke(this.ctx, x, barY, w, barH, PALETTE.inkScuro);
    const fillW = Math.floor((w - PIXEL * 2) * value.cur / value.max);
    ctx.fillStyle = color;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, barH - PIXEL * 2);
    // highlight superiore (1 blocco)
    ctx.fillStyle = colorHi;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, PIXEL);
  },

  // ─── PANNELLO MAPPA (placeholder) ──────────────────────────
  drawMapPanel(area) {
    const ctx = this.ctx;

    // Sfondo pergamena del pannello mappa (texture propria dedicata)
    const tex = getParchmentTexture(area.w, area.h, 9999);
    ctx.drawImage(tex, area.x, area.y);

    // Bordo cartografico doppio
    drawCartographicBorder(ctx, area.x, area.y, area.w, area.h);

    // Demo tile (placeholder): qualche simbolo cartografico sparso
    // per dare un'idea di come apparira la mappa.
    this.drawDemoTiles(area);

    // Etichetta in alto
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = 'italic bold 16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Le Marche di Vorn', area.x + PIXEL * 8, area.y + PIXEL * 8);
  },

  // Disegna pochi simboli cartografici di esempio (foreste, montagne,
  // un castello, un villaggio, un fiume) per testare l'aspetto.
  drawDemoTiles(area) {
    const ctx = this.ctx;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;

    // Foresta: gruppo di "alberi" stilizzati
    this.drawTree(area.x + 120, area.y + 140);
    this.drawTree(area.x + 160, area.y + 170);
    this.drawTree(area.x + 110, area.y + 200);
    this.drawTree(area.x + 200, area.y + 145);
    this.drawTree(area.x + 180, area.y + 210);

    // Montagne: catena a nord-est
    this.drawMountain(area.x + area.w - 220, area.y + 100);
    this.drawMountain(area.x + area.w - 180, area.y + 110);
    this.drawMountain(area.x + area.w - 140, area.y + 100);
    this.drawMountain(area.x + area.w - 160, area.y + 150);

    // Fiume serpeggiante
    this.drawRiver([
      [area.x + 50, area.y + area.h - 60],
      [area.x + 180, area.y + area.h - 140],
      [area.x + 320, area.y + area.h - 100],
      [area.x + 460, area.y + area.h - 200],
      [area.x + 600, area.y + area.h - 180],
    ]);

    // Castello al centro
    this.drawCastle(cx, cy, 'Vornkeep');

    // Villaggio sud
    this.drawVillage(area.x + 280, area.y + area.h - 80, 'Lyhall');

    // Posizione cavaliere
    this.drawKnightMarker(cx - 60, cy + 30);

    // Strada tratteggiata castello → villaggio
    this.drawDashedPath(cx, cy + 20, area.x + 280, area.y + area.h - 90);
  },

  drawTree(x, y) {
    const ctx = this.ctx;
    // chioma: triangolino di 3 blocchi
    ctx.fillStyle = PALETTE.verdeBoscoSc;
    pixelTriangle(ctx, [x, y - 18], [x - 12, y + 4], [x + 12, y + 4], PALETTE.verdeBosco);
    // tronco
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(x - PIXEL, y + 4, PIXEL * 2, PIXEL * 2);
  },

  drawMountain(x, y) {
    const ctx = this.ctx;
    // Profilo triangolare grande
    pixelTriangle(ctx, [x, y - 30], [x - 26, y + 14], [x + 26, y + 14], PALETTE.marrMontagna);
    // Versante luce (triangolo piu piccolo a destra)
    pixelTriangle(ctx, [x, y - 30], [x + 26, y + 14], [x + 4, y + 14], PALETTE.marrMontCh);
    // Neve sulla cima
    pixelTriangle(ctx, [x, y - 30], [x - 8, y - 16], [x + 8, y - 16], PALETTE.neveCime);
  },

  drawRiver(points) {
    const ctx = this.ctx;
    for (let i = 0; i < points.length - 1; i++) {
      pixelLine(ctx, points[i][0], points[i][1], points[i+1][0], points[i+1][1], PALETTE.bluFiume);
      // doppia linea per spessore
      pixelLine(ctx, points[i][0], points[i][1] + PIXEL, points[i+1][0], points[i+1][1] + PIXEL, PALETTE.bluFiumeCh);
    }
  },

  drawCastle(x, y, name) {
    const ctx = this.ctx;
    // Base: blocco quadrato muro
    ctx.fillStyle = PALETTE.grigioPietra;
    ctx.fillRect(x - 18, y - 14, 36, 28);
    // Merlature in cima
    ctx.fillStyle = PALETTE.grigioPietra;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x - 18 + i * 8, y - 20, 4, 6);
    }
    // Torrette laterali
    ctx.fillRect(x - 22, y - 22, 8, 36);
    ctx.fillRect(x + 14, y - 22, 8, 36);
    // Portone
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(x - 4, y, 8, 14);
    // Stendardo rosso
    ctx.fillStyle = PALETTE.rossoBandiera;
    ctx.fillRect(x - 1, y - 32, 2, 12);
    ctx.fillRect(x - 4, y - 32, 8, 4);
    // Etichetta
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = 'italic bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x, y + 18);
  },

  drawVillage(x, y, name) {
    const ctx = this.ctx;
    // Tre casette: tetti a punta
    for (let i = 0; i < 3; i++) {
      const cx = x - 18 + i * 18;
      // tetto
      pixelTriangle(ctx, [cx, y - 10], [cx - 8, y + 2], [cx + 8, y + 2], PALETTE.marrTetto);
      // muri
      ctx.fillStyle = PALETTE.pergMedia;
      ctx.fillRect(cx - 6, y + 2, 12, 8);
    }
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = 'italic 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x, y + 14);
  },

  drawKnightMarker(x, y) {
    const ctx = this.ctx;
    // Cerchio rosso + croce
    pixelCircle(ctx, x, y, 8, PALETTE.cavMarker);
    ctx.fillStyle = PALETTE.cavMarker;
    ctx.fillRect(x - 8, y - PIXEL / 2, 16, PIXEL);
    ctx.fillRect(x - PIXEL / 2, y - 8, PIXEL, 16);
  },

  drawDashedPath(x0, y0, x1, y1) {
    const ctx = this.ctx;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.floor(dist / 8);
    for (let i = 0; i < steps; i += 2) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      pixelLine(ctx,
        x0 + dx * t1, y0 + dy * t1,
        x0 + dx * t2, y0 + dy * t2,
        PALETTE.inkLeggero);
    }
  },

  // ─── PANNELLO CONTESTO (destra) ───────────────────────────
  drawContext(area) {
    const ctx = this.ctx;
    const x = area.x + PIXEL * 8;
    let y = area.y + PIXEL * 4 + 28 + PIXEL * 6;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LUOGO ATTUALE', x, y); y += 20;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Pianura, Marche di Vorn', x, y); y += 30;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('VISIBILITÀ', x, y); y += 20;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('5 tile (pianura)', x, y); y += 30;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('STAGIONE', x, y); y += 20;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Primavera · 12° giorno', x, y); y += 30;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('METEO', x, y); y += 20;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Sereno · vento da est', x, y); y += 30;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('NOTIZIE DAL MONDO', x, y); y += 20;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = '13px "Courier New", monospace';
    const news = [
      'Lord Aerin di Vorn',
      'ha bandito una taglia',
      'sui banditi del Sud.',
      '',
      'L\'Ordine del Cervo',
      'cerca cavalieri.',
    ];
    for (const line of news) { ctx.fillText(line, x, y); y += 17; }
  },

  // ─── LOG EVENTI + AZIONI ───────────────────────────────────
  drawLogAndActions(area) {
    const ctx = this.ctx;
    const x = area.x + PIXEL * 8;
    const yStart = area.y + PIXEL * 4 + 28 + PIXEL * 4;
    const buttonsTop = this.actionButtons[0]
      ? this.actionButtons[0].y - PIXEL * 4
      : area.y + area.h;
    const logBottom = buttonsTop - PIXEL * 2;

    // Log: dal piu recente al piu vecchio, dal basso verso l'alto
    const colors = [PALETTE.hudEvento, PALETTE.hudNormale, PALETTE.hudNormale,
                    PALETTE.hudDim, PALETTE.hudMorto];
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const lineH = 20;
    const recent = this.log.slice().reverse();
    let yy = logBottom;
    for (let i = 0; i < recent.length && yy > yStart; i++) {
      ctx.fillStyle = colors[Math.min(i, colors.length - 1)];
      ctx.fillText('> ' + recent[i], x, yy);
      yy -= lineH;
    }

    // Pulsanti azione
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.actionButtons.forEach((b, i) => {
      const hovered = i === this.hoverBtn;
      ctx.fillStyle = hovered ? PALETTE.pergMedia : PALETTE.inkScuro;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawPixelRectStroke(ctx, b.x, b.y, b.w, b.h,
                          hovered ? PALETTE.hudTitolo : PALETTE.hudBordo);
      ctx.fillStyle = b.disabled
        ? PALETTE.hudDim
        : (hovered ? PALETTE.inkNero : PALETTE.hudTitolo);
      ctx.font = `${hovered ? 'bold ' : ''}14px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  },

  // ─── MINIMAPPA ─────────────────────────────────────────────
  drawMinimap(area) {
    const ctx = this.ctx;
    const inner = {
      x: area.x + PIXEL * 8,
      y: area.y + PIXEL * 4 + 28 + PIXEL * 4,
      w: area.w - PIXEL * 16,
      h: area.h - 28 - PIXEL * 16 - 22,
    };
    // Sfondo a tile di pergamena/foresta/montagna sparsi
    ctx.fillStyle = PALETTE.pergMedia;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    // Foreste random (piccole patch verdi)
    const rnd = mulberry32(7);
    ctx.fillStyle = PALETTE.verdeBosco;
    for (let i = 0; i < 18; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL * 2, PIXEL * 2);
    }
    // Montagne (patch marroni)
    ctx.fillStyle = PALETTE.marrMontagna;
    for (let i = 0; i < 8; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL * 2, PIXEL * 2);
    }
    // Acqua (linee blu)
    ctx.fillStyle = PALETTE.bluFiume;
    for (let i = 0; i < 10; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL, PIXEL);
    }

    // Cornice
    drawPixelRectStroke(ctx, inner.x, inner.y, inner.w, inner.h, PALETTE.inkScuro);

    // Posizione cavaliere (centro)
    ctx.fillStyle = PALETTE.cavMarker;
    const kx = Math.floor(inner.x + inner.w / 2);
    const ky = Math.floor(inner.y + inner.h / 2);
    ctx.fillRect(kx - PIXEL, ky - PIXEL, PIXEL * 2, PIXEL * 2);

    // Etichetta sotto
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = 'italic 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Sei qui · Marche di Vorn', area.x + area.w / 2, area.y + area.h - PIXEL * 4);
  },
};
