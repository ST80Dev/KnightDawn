// FERRO & CENERE — schermata gioco principale (bozza pannelli HUD)
// Disegnata direttamente sul canvas display (vedi main.js). Le dimensioni
// passano da S(...)/SF(...) per restare proporzionate al canvas.
//
// Layout adattivo:
//  - desktop (landscape ampio): 3 colonne — stato | mappa+log | contesto
//  - compatto (UI.compact, tipico mobile portrait): impilato in verticale —
//    barra alta → mappa → schede (Stato/Contesto/Diario/Regione) → barra azioni.
// Input via Pointer Events (mouse + touch).

const GameScreen = {
  canvas: null,
  ctx: null,
  hoverBtn: -1,
  hoverTab: -1,
  pressedBtn: -1,
  pressedTab: -1,
  actionButtons: [],
  tabButtons: [],
  activeTab: 'stato',

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

    // Schede del layout compatto: ogni scheda mostra a tutta larghezza un
    // pannello che su desktop sta in una colonna a sé.
    this.tabButtons = [
      { label: 'STATO',    tab: 'stato' },
      { label: 'CONTESTO', tab: 'contesto' },
      { label: 'DIARIO',   tab: 'log' },
      { label: 'REGIONE',  tab: 'mini' },
    ];
  },

  onEnter() {
    this.knight = {
      nome: 'Sir Aldric di Vorn',
      titolo: 'Cavaliere Errante',
      vigore: { cur: 14, max: 20 },
      volonta: { cur: 11, max: 16 },
      onore: { cur: 8, max: 10 },
      ferite: { cur: 2, max: 12 },
      equip: ['Spada bastarda', 'Scudo araldico', 'Cotta di maglia', 'Mantello scuro'],
      reputazione: [
        { nome: 'Casata Vorn',      val: 3 },
        { nome: 'Ordine del Cervo', val: 1 },
        { nome: 'Mercanti Liberi',  val: 0 },
        { nome: 'Banditi del Sud',  val: -2 },
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

  // ─── Layout ───────────────────────────────────────────────────────────────
  layout() {
    return window.UI.compact ? this.layoutCompact() : this.layoutDesktop();
  },

  layoutDesktop() {
    const W = window.UI.w;
    const H = window.UI.h;
    const pad = SF(12);
    const topBarH = SF(76);
    const leftW = SF(360);
    const rightW = SF(310);
    const bottomH = SF(240);

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

    return { compact: false, pad, topBar, left, map, right, log, mini };
  },

  layoutCompact() {
    const W = window.UI.w;
    const H = window.UI.h;
    const pad = SF(8);
    const topBarH = SF(56);
    const tabsH = SF(38);
    // Barra azioni in basso: 2 righe (2×2) di pulsanti.
    const actBtnH = SF(40);
    const actGap = SF(8);
    const actPad = SF(8);
    const actionBarH = actBtnH * 2 + actGap + actPad * 2;

    const topBar = { x: 0, y: 0, w: W, h: topBarH };

    const contentY = topBarH + pad;
    const contentH = H - topBarH - actionBarH - pad * 2;
    // La mappa prende ~46% dello spazio centrale, il pannello a schede il resto.
    const mapH = Math.floor(contentH * 0.46);

    const map = { x: pad, y: contentY, w: W - pad * 2, h: mapH };
    const tabs = { x: pad, y: map.y + map.h + pad, w: W - pad * 2, h: tabsH };
    const panel = {
      x: pad,
      y: tabs.y + tabs.h + pad,
      w: W - pad * 2,
      h: contentH - mapH - tabsH - pad * 2,
    };
    const actionBar = { x: 0, y: H - actionBarH, w: W, h: actionBarH };

    return { compact: true, pad, topBar, map, tabs, panel, actionBar };
  },

  // Posiziona i pulsanti azione (2 colonne × 2 righe) nell'area indicata,
  // ancorati in basso a meno di `fill`, nel qual caso riempiono tutta l'area.
  layoutButtons(area, fill) {
    const cols = 2;
    const rows = 2;
    const gap = SF(8);
    const padInner = SF(14);
    const bw = (area.w - padInner * 2 - gap * (cols - 1)) / cols;
    const bh = fill
      ? (area.h - padInner * 2 - gap * (rows - 1)) / rows
      : SF(32);
    const startX = area.x + padInner;
    const startY = fill
      ? area.y + padInner
      : area.y + area.h - bh * rows - gap * (rows - 1) - padInner;
    this.actionButtons.forEach((b, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      b.x = Math.floor(startX + c * (bw + gap));
      b.y = Math.floor(startY + r * (bh + gap));
      b.w = Math.floor(bw);
      b.h = Math.floor(bh);
    });
  },

  layoutTabs(area) {
    const n = this.tabButtons.length;
    const gap = SF(4);
    const bw = (area.w - gap * (n - 1)) / n;
    this.tabButtons.forEach((t, i) => {
      t.x = Math.floor(area.x + i * (bw + gap));
      t.y = area.y;
      t.w = Math.floor(bw);
      t.h = area.h;
    });
  },

  // ─── Input (Pointer Events) ────────────────────────────────────────────────
  applyHover(btn, tab, updateCursor) {
    if (btn === this.hoverBtn && tab === this.hoverTab) return;
    this.hoverBtn = btn;
    this.hoverTab = tab;
    if (updateCursor) {
      const on = btn >= 0 || tab >= 0;
      document.getElementById('game').style.cursor = on ? 'pointer' : 'default';
    }
    window.GameRender.invalidate();
  },

  onPointerMove(p, type) {
    if (Scenes.current !== this) return;
    if (type === 'touch') return;
    const tab = window.UI.compact ? btnHitIndex(this.tabButtons, p.x, p.y) : -1;
    this.applyHover(btnHitIndex(this.actionButtons, p.x, p.y), tab, true);
  },

  onPointerDown(p) {
    if (Scenes.current !== this) return;
    this.pressedBtn = btnHitIndex(this.actionButtons, p.x, p.y);
    this.pressedTab = window.UI.compact ? btnHitIndex(this.tabButtons, p.x, p.y) : -1;
    this.applyHover(this.pressedBtn, this.pressedTab, false);
  },

  onPointerUp(p, type) {
    if (Scenes.current !== this) return;
    const bi = btnHitIndex(this.actionButtons, p.x, p.y);
    const ti = window.UI.compact ? btnHitIndex(this.tabButtons, p.x, p.y) : -1;
    const fireBtn = bi >= 0 && bi === this.pressedBtn;
    const fireTab = ti >= 0 && ti === this.pressedTab;
    this.pressedBtn = -1;
    this.pressedTab = -1;
    if (type === 'touch') this.applyHover(-1, -1, false);
    if (fireTab) {
      this.activeTab = this.tabButtons[ti].tab;
      window.GameRender.invalidate();
    } else if (fireBtn) {
      const b = this.actionButtons[bi];
      if (!b.disabled) console.log('Azione gioco:', b.action);
    }
  },

  onPointerCancel() {
    this.pressedBtn = -1;
    this.pressedTab = -1;
    this.applyHover(-1, -1, false);
  },

  // ─── Draw ───────────────────────────────────────────────────────────────────
  draw() {
    const L = this.layout();
    const ctx = this.ctx;
    const W = window.UI.w;
    const H = window.UI.h;

    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, W, H);
    const parchment = getParchmentTexture(W, H, 4242);
    ctx.drawImage(parchment, 0, 0);

    if (L.compact) this.drawCompact(L);
    else this.drawDesktop(L);
  },

  drawDesktop(L) {
    this.layoutButtons(L.log, false);
    this.drawTopBar(L.topBar, false);
    this.drawPanel(L.left, 'STATO CAVALIERE');
    this.drawKnightStatus(L.left);
    this.drawMapPanel(L.map);
    this.drawPanel(L.right, 'CONTESTO');
    this.drawContext(L.right);
    this.drawPanel(L.log, 'LOG EVENTI E AZIONI');
    const buttonsTop = this.actionButtons[0] ? this.actionButtons[0].y - SF(8) : L.log.y + L.log.h;
    this.drawLog(L.log, buttonsTop);
    this.drawActionButtons();
    this.drawPanel(L.mini, 'MINIMAPPA REGIONALE');
    this.drawMinimap(L.mini);
  },

  drawCompact(L) {
    this.layoutTabs(L.tabs);
    this.layoutButtons(L.actionBar, true);

    this.drawTopBar(L.topBar, true);
    this.drawMapPanel(L.map);
    this.drawTabs();

    // Pannello della scheda attiva
    const titleByTab = {
      stato: 'STATO CAVALIERE',
      contesto: 'CONTESTO',
      log: 'DIARIO',
      mini: 'MINIMAPPA REGIONALE',
    };
    this.drawPanel(L.panel, titleByTab[this.activeTab] || '');
    if (this.activeTab === 'stato')    this.drawKnightStatus(L.panel);
    if (this.activeTab === 'contesto') this.drawContext(L.panel);
    if (this.activeTab === 'log')      this.drawLog(L.panel, L.panel.y + L.panel.h - SF(10));
    if (this.activeTab === 'mini')     this.drawMinimap(L.panel);

    // Barra azioni
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(L.actionBar.x, L.actionBar.y, L.actionBar.w, L.actionBar.h);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(L.actionBar.x, L.actionBar.y, L.actionBar.w, PIXEL);
    this.drawActionButtons();
  },

  drawTabs() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.tabButtons.forEach((t, i) => {
      const active = t.tab === this.activeTab;
      const hovered = i === this.hoverTab;
      ctx.fillStyle = active ? PALETTE.pergMedia : (hovered ? PALETTE.pergScura : PALETTE.inkScuro);
      ctx.fillRect(t.x, t.y, t.w, t.h);
      drawPixelRectStroke(ctx, t.x, t.y, t.w, t.h,
                          active ? PALETTE.hudTitolo : PALETTE.hudBordo);
      ctx.fillStyle = active ? PALETTE.inkNero : PALETTE.hudTitolo;
      ctx.font = `${active ? 'bold ' : ''}${SF(13)}px "Courier New", monospace`;
      ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2);
    });
  },

  drawPanel(area, title) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.pergScura;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    drawPixelRectStroke(ctx, area.x, area.y, area.w, area.h, PALETTE.inkScuro);
    drawPixelRectStroke(ctx, area.x + PIXEL * 2, area.y + PIXEL * 2,
                        area.w - PIXEL * 4, area.h - PIXEL * 4, PALETTE.inkMedio);
    const bandH = SF(26);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x + PIXEL * 4, area.y + PIXEL * 4, area.w - PIXEL * 8, bandH);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(16)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, area.x + PIXEL * 8, area.y + PIXEL * 4 + bandH / 2);
  },

  drawTopBar(area, compact) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(area.x, area.y + area.h - PIXEL, area.w, PIXEL);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(compact ? 22 : 36)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KNIGHT DAWN', SF(compact ? 12 : 18), area.h / 2);

    const meta = this.meta;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.textAlign = 'right';
    if (compact) {
      // Una riga compatta a destra; niente rosa dei venti per risparmiare spazio.
      ctx.font = `${SF(12)}px "Courier New", monospace`;
      ctx.fillText(`A.${meta.anno} · T.${meta.turno}`, area.w - SF(12), area.h / 2 - SF(8));
      ctx.fillText(`${meta.stagione} · ${meta.meteo}`, area.w - SF(12), area.h / 2 + SF(8));
    } else {
      ctx.font = `${SF(16)}px "Courier New", monospace`;
      ctx.fillText(`Anno ${meta.anno}  ·  Turno ${meta.turno}`, area.w - SF(18), area.h / 2 - SF(10));
      ctx.fillText(`${meta.stagione}  ·  ${meta.meteo}  ·  Destinazione: ${meta.destinazione}`,
                   area.w - SF(18), area.h / 2 + SF(10));
      drawCompassRose(ctx, area.x + area.w / 2, area.y + area.h / 2, SF(26));
    }
  },

  drawKnightStatus(area) {
    const ctx = this.ctx;
    const k = this.knight;
    const innerX = area.x + PIXEL * 8;
    let y = area.y + PIXEL * 4 + SF(26) + SF(12);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(20)}px "Courier New", monospace`;
    ctx.fillText(k.nome, innerX, y);
    y += SF(26);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `italic ${SF(15)}px "Courier New", monospace`;
    ctx.fillText(k.titolo, innerX, y);
    y += SF(28);

    const barW = area.w - PIXEL * 16;
    this.drawAttrBar(innerX, y, barW, 'VIGORE',  k.vigore,  '#2a7a1a', '#3a9a22'); y += SF(28);
    this.drawAttrBar(innerX, y, barW, 'VOLONTÀ', k.volonta, '#4a3ab0', '#6050c8'); y += SF(28);
    this.drawAttrBar(innerX, y, barW, 'ONORE',   k.onore,   '#b07a18', '#d09820'); y += SF(28);
    this.drawAttrBar(innerX, y, barW, 'FERITE',  k.ferite,  '#aa2020', '#cc2828'); y += SF(34);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(15)}px "Courier New", monospace`;
    ctx.fillText('EQUIPAGGIAMENTO', innerX, y); y += SF(22);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(14)}px "Courier New", monospace`;
    for (const item of k.equip) {
      ctx.fillText('· ' + item, innerX, y);
      y += SF(20);
    }
    y += SF(10);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(15)}px "Courier New", monospace`;
    ctx.fillText('REPUTAZIONE', innerX, y); y += SF(22);
    ctx.font = `${SF(14)}px "Courier New", monospace`;
    for (const r of k.reputazione) {
      ctx.fillStyle = PALETTE.hudNormale;
      ctx.fillText(r.nome, innerX, y);
      const dotW = SF(9);
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
        ctx.fillRect(dx, y + SF(3), dotW - PIXEL, dotW - PIXEL);
      }
      y += SF(20);
    }
  },

  drawAttrBar(x, y, w, label, value, color, colorHi) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${value.cur}/${value.max}`, x + w, y);
    const barY = y + SF(14);
    const barH = SF(10);
    ctx.fillStyle = '#0e0804';
    ctx.fillRect(x, barY, w, barH);
    drawPixelRectStroke(this.ctx, x, barY, w, barH, PALETTE.inkScuro);
    const fillW = Math.floor((w - PIXEL * 2) * value.cur / value.max);
    ctx.fillStyle = color;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, barH - PIXEL * 2);
    ctx.fillStyle = colorHi;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, PIXEL);
  },

  drawMapPanel(area) {
    const ctx = this.ctx;
    const tex = getParchmentTexture(area.w, area.h, 9999);
    ctx.drawImage(tex, area.x, area.y);
    drawCartographicBorder(ctx, area.x, area.y, area.w, area.h);
    // Contiene i tile demo dentro la cornice (in compatto l'area è piccola e
    // gli offset assoluti sborderebbero sui pannelli sottostanti).
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    this.drawDemoTiles(area);
    ctx.restore();
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `italic bold ${SF(15)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Le Marche di Vorn', area.x + SF(14), area.y + SF(14));
  },

  drawDemoTiles(area) {
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;

    this.drawTree(area.x + SF(120), area.y + SF(140));
    this.drawTree(area.x + SF(160), area.y + SF(170));
    this.drawTree(area.x + SF(110), area.y + SF(200));
    this.drawTree(area.x + SF(200), area.y + SF(145));
    this.drawTree(area.x + SF(180), area.y + SF(210));

    this.drawMountain(area.x + area.w - SF(220), area.y + SF(100));
    this.drawMountain(area.x + area.w - SF(180), area.y + SF(110));
    this.drawMountain(area.x + area.w - SF(140), area.y + SF(100));
    this.drawMountain(area.x + area.w - SF(160), area.y + SF(150));

    this.drawRiver([
      [area.x + SF(50), area.y + area.h - SF(60)],
      [area.x + SF(180), area.y + area.h - SF(140)],
      [area.x + SF(320), area.y + area.h - SF(100)],
      [area.x + SF(460), area.y + area.h - SF(200)],
      [area.x + SF(600), area.y + area.h - SF(180)],
    ]);

    this.drawCastle(cx, cy, 'Vornkeep');
    this.drawVillage(area.x + SF(280), area.y + area.h - SF(80), 'Lyhall');
    this.drawKnightMarker(cx - SF(60), cy + SF(30));
    this.drawDashedPath(cx, cy + SF(20), area.x + SF(280), area.y + area.h - SF(90));
  },

  drawTree(x, y) {
    const ctx = this.ctx;
    pixelTriangle(ctx, [x, y - SF(18)], [x - SF(12), y + SF(4)], [x + SF(12), y + SF(4)], PALETTE.verdeBosco);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(x - PIXEL, y + SF(4), PIXEL * 2, PIXEL * 2);
  },

  drawMountain(x, y) {
    const ctx = this.ctx;
    pixelTriangle(ctx, [x, y - SF(30)], [x - SF(26), y + SF(14)], [x + SF(26), y + SF(14)], PALETTE.marrMontagna);
    pixelTriangle(ctx, [x, y - SF(30)], [x + SF(26), y + SF(14)], [x + SF(4), y + SF(14)], PALETTE.marrMontCh);
    pixelTriangle(ctx, [x, y - SF(30)], [x - SF(8), y - SF(16)], [x + SF(8), y - SF(16)], PALETTE.neveCime);
  },

  drawRiver(points) {
    const ctx = this.ctx;
    for (let i = 0; i < points.length - 1; i++) {
      pixelLine(ctx, points[i][0], points[i][1], points[i+1][0], points[i+1][1], PALETTE.bluFiume);
      pixelLine(ctx, points[i][0], points[i][1] + PIXEL, points[i+1][0], points[i+1][1] + PIXEL, PALETTE.bluFiumeCh);
    }
  },

  drawCastle(x, y, name) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.grigioPietra;
    ctx.fillRect(x - SF(18), y - SF(14), SF(36), SF(28));
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x - SF(18) + i * SF(8), y - SF(20), SF(4), SF(6));
    }
    ctx.fillRect(x - SF(22), y - SF(22), SF(8), SF(36));
    ctx.fillRect(x + SF(14), y - SF(22), SF(8), SF(36));
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(x - SF(4), y, SF(8), SF(14));
    ctx.fillStyle = PALETTE.rossoBandiera;
    ctx.fillRect(x - PIXEL, y - SF(32), PIXEL * 2, SF(12));
    ctx.fillRect(x - SF(4), y - SF(32), SF(8), SF(4));
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `italic bold ${SF(13)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x, y + SF(18));
  },

  drawVillage(x, y, name) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const cx = x - SF(18) + i * SF(18);
      pixelTriangle(ctx, [cx, y - SF(10)], [cx - SF(8), y + SF(2)], [cx + SF(8), y + SF(2)], PALETTE.marrTetto);
      ctx.fillStyle = PALETTE.pergMedia;
      ctx.fillRect(cx - SF(6), y + SF(2), SF(12), SF(8));
    }
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `italic ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x, y + SF(14));
  },

  drawKnightMarker(x, y) {
    const ctx = this.ctx;
    pixelCircle(ctx, x, y, SF(8), PALETTE.cavMarker);
    ctx.fillStyle = PALETTE.cavMarker;
    ctx.fillRect(x - SF(8), y - PIXEL / 2, SF(16), PIXEL);
    ctx.fillRect(x - PIXEL / 2, y - SF(8), PIXEL, SF(16));
  },

  drawDashedPath(x0, y0, x1, y1) {
    const ctx = this.ctx;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.floor(dist / SF(8));
    for (let i = 0; i < steps; i += 2) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      pixelLine(ctx,
        x0 + dx * t1, y0 + dy * t1,
        x0 + dx * t2, y0 + dy * t2,
        PALETTE.inkLeggero);
    }
  },

  drawContext(area) {
    const ctx = this.ctx;
    const x = area.x + PIXEL * 8;
    let y = area.y + PIXEL * 4 + SF(26) + SF(10);

    const drawSection = (title, body) => {
      ctx.fillStyle = PALETTE.hudTitolo;
      ctx.font = `bold ${SF(13)}px "Courier New", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, x, y); y += SF(20);
      ctx.fillStyle = PALETTE.hudNormale;
      ctx.font = `${SF(14)}px "Courier New", monospace`;
      const lines = Array.isArray(body) ? body : [body];
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += SF(18);
      }
      y += SF(10);
    };

    drawSection('LUOGO ATTUALE', 'Pianura, Marche di Vorn');
    drawSection('VISIBILITÀ',    '5 tile (pianura)');
    drawSection('STAGIONE',      'Primavera · 12° giorno');
    drawSection('METEO',         'Sereno · vento da est');
    drawSection('NOTIZIE DAL MONDO', [
      'Lord Aerin di Vorn',
      'ha bandito una taglia',
      'sui banditi del Sud.',
      '',
      'L\'Ordine del Cervo',
      'cerca cavalieri.',
    ]);
  },

  drawLog(area, bottomY) {
    const ctx = this.ctx;
    const x = area.x + PIXEL * 8;
    const yStart = area.y + PIXEL * 4 + SF(26) + SF(4);
    const logBottom = bottomY - PIXEL * 2;

    const colors = [PALETTE.hudEvento, PALETTE.hudNormale, PALETTE.hudNormale,
                    PALETTE.hudDim, PALETTE.hudMorto];
    ctx.font = `${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const lineH = SF(20);
    const recent = this.log.slice().reverse();
    let yy = logBottom;
    for (let i = 0; i < recent.length && yy > yStart; i++) {
      ctx.fillStyle = colors[Math.min(i, colors.length - 1)];
      ctx.fillText('> ' + recent[i], x, yy);
      yy -= lineH;
    }
  },

  drawActionButtons() {
    const ctx = this.ctx;
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
      ctx.font = `${hovered ? 'bold ' : ''}${SF(14)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  },

  drawMinimap(area) {
    const ctx = this.ctx;
    const inner = {
      x: area.x + PIXEL * 8,
      y: area.y + PIXEL * 4 + SF(26) + SF(4),
      w: area.w - PIXEL * 16,
      h: area.h - SF(26) - PIXEL * 16 - SF(22),
    };
    ctx.fillStyle = PALETTE.pergMedia;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    const rnd = mulberry32(7);
    ctx.fillStyle = PALETTE.verdeBosco;
    for (let i = 0; i < 18; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL * 2, PIXEL * 2);
    }
    ctx.fillStyle = PALETTE.marrMontagna;
    for (let i = 0; i < 8; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL * 2, PIXEL * 2);
    }
    ctx.fillStyle = PALETTE.bluFiume;
    for (let i = 0; i < 10; i++) {
      const px = inner.x + Math.floor(rnd() * inner.w);
      const py = inner.y + Math.floor(rnd() * inner.h);
      ctx.fillRect(px, py, PIXEL, PIXEL);
    }

    drawPixelRectStroke(ctx, inner.x, inner.y, inner.w, inner.h, PALETTE.inkScuro);

    ctx.fillStyle = PALETTE.cavMarker;
    const kx = Math.floor(inner.x + inner.w / 2);
    const ky = Math.floor(inner.y + inner.h / 2);
    ctx.fillRect(kx - PIXEL, ky - PIXEL, PIXEL * 2, PIXEL * 2);

    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `italic ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Sei qui · Marche di Vorn', area.x + area.w / 2, area.y + area.h - SF(8));
  },
};
