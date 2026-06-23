// FERRO & CENERE — schermata gioco principale
// Disegnata direttamente sul canvas display (vedi main.js). Le dimensioni
// passano da S(...)/SF(...) per restare proporzionate al canvas.
//
// Layout adattivo:
//  - desktop (landscape ampio): 3 colonne — stato | mappa+diario | contesto.
//  - compatto (UI.compact, mobile portrait): mappa grande + footer con due
//    righe di mini-pulsanti (navigazione aree → overlay; azioni di gioco).
//
// Mappa: generata da World, disegnata da MapRenderer dentro il pannello mappa.
// Camera con pan libero (drag) e zoom a passi discreti centrato sul centro
// camera (rotella su desktop, +/- su mobile).
// Input via Pointer Events (mouse + touch).

const GameScreen = {
  canvas: null,
  ctx: null,

  hoverBtn: -1, pressedBtn: -1,     // azioni
  hoverNav: -1, pressedNav: -1,     // navigazione aree (compatto)
  hoverZoom: -1, pressedZoom: -1,   // +/- zoom (compatto)
  hoverClose: false,

  actionButtons: [],
  navButtons: [],
  zoomButtons: [],

  activeOverlay: null,
  overlayCard: null,
  overlayClose: null,
  overlayPressed: null,

  mapRect: null,
  cam: { cx: 0, cy: 0, step: 0 },
  knightPos: { x: 0, y: 0 },
  dragging: false,
  dragLast: { x: 0, y: 0 },
  dragStart: { x: 0, y: 0 },
  dragMoved: false,

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
    this.navButtons = [
      { label: 'STATO',    key: 'stato' },
      { label: 'CONTESTO', key: 'contesto' },
      { label: 'DIARIO',   key: 'log' },
      { label: 'REGIONE',  key: 'mini' },
    ];
  },

  onEnter() {
    Knight.init();
    this.knight = Knight;
    this.log = [
      'Inizi il tuo viaggio nelle Marche di Vorn.',
      'Il vento dell\'alba porta odore di pioggia.',
      'Lungo la strada incontri un mercante.',
      'Egli ti racconta di rovine a est.',
      'Una taverna si scorge a sud-ovest.',
    ];
    Calendar.init();
    this.meta = {
      meteo: 'Sereno', destinazione: 'nessuna',
    };

    // Genera il mondo e posiziona camera/cavaliere.
    World.generate((Math.random() * 0xFFFFFFFF) >>> 0);
    this.knightPos = { x: World.knightStart.x, y: World.knightStart.y };
    this.cam = { cx: this.knightPos.x + 0.5, cy: this.knightPos.y + 0.5, step: MAP_ZOOM_DEFAULT };
    this.activeOverlay = null;
    this.dragging = false;
    this.dragMoved = false;
    Travel.stop();

    Save.startAutosave();
  },

  // ─── Layout ───────────────────────────────────────────────────────────────
  layout() {
    return window.UI.compact ? this.layoutCompact() : this.layoutDesktop();
  },

  layoutDesktop() {
    const W = window.UI.w, H = window.UI.h;
    const pad = SF(12);
    const topBarH = SF(76);
    const leftW = SF(360);
    const rightW = SF(310);
    const logH = SF(220);     // cronaca eventi → in basso nella sidebar sinistra
    const miniH = SF(240);    // minimappa     → in basso nella sidebar destra
    const bottomH = SF(110);  // barra azioni e info di gioco sotto la mappa

    // Barra superiore divisa in due soli segmenti (sinistro e destro): la
    // fascia centrale resta libera così la mappa risale fino al bordo alto.
    const topBarLeft  = { x: 0,         y: 0, w: leftW,  h: topBarH };
    const topBarRight = { x: W - rightW, y: 0, w: rightW, h: topBarH };

    // Mappa centrale: altezza ridotta per lasciare spazio alla barra azioni.
    const mapW = W - leftW - rightW - pad * 2;
    const bottom = { x: leftW + pad, y: H - pad - bottomH, w: mapW, h: bottomH };
    const map = { x: leftW + pad, y: pad, w: mapW, h: bottom.y - pad - pad };

    // Sidebar sinistra: STATO (alto) + CRONACA (basso).
    const log  = { x: pad, y: H - pad - logH, w: leftW - pad, h: logH };
    const left = { x: pad, y: topBarH + pad, w: leftW - pad, h: log.y - (topBarH + pad) - pad };

    // Sidebar destra: CONTESTO (alto) + MINIMAPPA (basso).
    const mini  = { x: W - rightW, y: H - pad - miniH, w: rightW - pad, h: miniH };
    const right = { x: W - rightW, y: topBarH + pad, w: rightW - pad, h: mini.y - (topBarH + pad) - pad };

    return { compact: false, pad, topBarLeft, topBarRight, left, map, right, log, mini, bottom };
  },

  layoutCompact() {
    const W = window.UI.w, H = window.UI.h;
    const pad = SF(8);
    const topBarH = SF(56);
    const navH = SF(28), actH = SF(34), fGap = SF(6), fPad = SF(8);
    const footerH = fPad * 2 + navH + fGap + actH;

    const topBar = { x: 0, y: 0, w: W, h: topBarH };
    const map = { x: pad, y: topBarH + pad, w: W - pad * 2, h: H - topBarH - footerH - pad * 2 };
    const footer = { x: 0, y: H - footerH, w: W, h: footerH, navH, actH, fGap, fPad };

    return { compact: true, pad, topBar, map, footer };
  },

  layoutFooter(f) {
    const gap = f.fGap;
    const colW = (f.w - f.fPad * 2 - gap * 3) / 4;
    const x0 = f.x + f.fPad;
    const navY = f.y + f.fPad;
    const actY = navY + f.navH + gap;
    this.navButtons.forEach((b, i) => {
      b.x = Math.floor(x0 + i * (colW + gap)); b.y = navY; b.w = Math.floor(colW); b.h = f.navH;
    });
    this.actionButtons.forEach((b, i) => {
      b.x = Math.floor(x0 + i * (colW + gap)); b.y = actY; b.w = Math.floor(colW); b.h = f.actH;
    });
  },

  // ─── Input (Pointer Events) ────────────────────────────────────────────────
  inMap(p) {
    const r = this.mapRect;
    return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  },

  onPointerMove(p, type) {
    if (Scenes.current !== this) return;

    // Pan in corso: vale per mouse e touch.
    if (this.dragging) {
      const dx = p.x - this.dragLast.x, dy = p.y - this.dragLast.y;
      // Soglia di tolleranza per distinguere click da drag: oltre questa
      // distanza dal punto iniziale il gesto diventa pan, anche se l'utente
      // poi torna indietro (il viaggio non parte).
      const adx = p.x - this.dragStart.x, ady = p.y - this.dragStart.y;
      if (adx * adx + ady * ady > 100) this.dragMoved = true;
      MapRenderer.pan(this.cam, dx, dy);
      this.dragLast = { x: p.x, y: p.y };
      if (type !== 'touch') document.getElementById('game').style.cursor = 'grabbing';
      window.GameRender.invalidate();
      return;
    }

    if (type === 'touch') return; // hover solo su mouse

    if (this.activeOverlay) {
      const over = this.overlayWhere(p) === 'close';
      document.getElementById('game').style.cursor = over ? 'pointer' : 'default';
      if (over !== this.hoverClose) { this.hoverClose = over; window.GameRender.invalidate(); }
      return;
    }

    const compact = window.UI.compact;
    const hb = btnHitIndex(this.actionButtons, p.x, p.y);
    const hn = compact ? btnHitIndex(this.navButtons, p.x, p.y) : -1;
    const hz = compact ? btnHitIndex(this.zoomButtons, p.x, p.y) : -1;
    const onBtn = hb >= 0 || hn >= 0 || hz >= 0;
    document.getElementById('game').style.cursor =
      onBtn ? 'pointer' : (this.inMap(p) ? 'grab' : 'default');
    if (hb !== this.hoverBtn || hn !== this.hoverNav || hz !== this.hoverZoom) {
      this.hoverBtn = hb; this.hoverNav = hn; this.hoverZoom = hz;
      window.GameRender.invalidate();
    }
  },

  onPointerDown(p) {
    if (Scenes.current !== this) return;
    if (this.activeOverlay) { this.overlayPressed = this.overlayWhere(p); return; }

    const compact = window.UI.compact;
    this.pressedBtn = btnHitIndex(this.actionButtons, p.x, p.y);
    this.pressedNav = compact ? btnHitIndex(this.navButtons, p.x, p.y) : -1;
    this.pressedZoom = compact ? btnHitIndex(this.zoomButtons, p.x, p.y) : -1;

    if (this.pressedBtn < 0 && this.pressedNav < 0 && this.pressedZoom < 0 && this.inMap(p)) {
      // Nessun pulsante: inizia il pan della mappa. Tracciamo anche start e
      // movimento totale: se l'utente non sposta abbastanza, il pointerup
      // sarà interpretato come "click sulla tile" per il viaggio.
      this.dragging = true;
      this.dragLast = { x: p.x, y: p.y };
      this.dragStart = { x: p.x, y: p.y };
      this.dragMoved = false;
      return;
    }
    this.hoverBtn = this.pressedBtn; this.hoverNav = this.pressedNav; this.hoverZoom = this.pressedZoom;
    window.GameRender.invalidate();
  },

  onPointerUp(p, type) {
    if (Scenes.current !== this) return;

    if (this.dragging) {
      const wasDrag = this.dragMoved;
      this.dragging = false;
      this.dragMoved = false;
      if (type !== 'touch') document.getElementById('game').style.cursor = this.inMap(p) ? 'grab' : 'default';
      // Tap/click su tile (nessun pan reale): seleziona destinazione e parte
      // il viaggio. Se il viaggio è già in corso il click ricalcola; se la
      // meta coincide con la posizione attuale, ferma il viaggio.
      if (!wasDrag && this.inMap(p)) this._handleMapClick(p);
      return;
    }

    if (this.activeOverlay) {
      const where = this.overlayWhere(p);
      if ((this.overlayPressed === 'close' && where === 'close') ||
          (this.overlayPressed === 'outside' && where === 'outside')) {
        this.activeOverlay = null; this.hoverClose = false; window.GameRender.invalidate();
      }
      this.overlayPressed = null;
      return;
    }

    const compact = window.UI.compact;
    const bi = btnHitIndex(this.actionButtons, p.x, p.y);
    const ni = compact ? btnHitIndex(this.navButtons, p.x, p.y) : -1;
    const zi = compact ? btnHitIndex(this.zoomButtons, p.x, p.y) : -1;
    const fireB = bi >= 0 && bi === this.pressedBtn;
    const fireN = ni >= 0 && ni === this.pressedNav;
    const fireZ = zi >= 0 && zi === this.pressedZoom;
    this.pressedBtn = this.pressedNav = this.pressedZoom = -1;
    if (type === 'touch') { this.hoverBtn = this.hoverNav = this.hoverZoom = -1; }

    if (fireZ) {
      MapRenderer.zoom(this.cam, this.zoomButtons[zi].key === 'in' ? 1 : -1);
      window.GameRender.invalidate();
    } else if (fireN) {
      const k = this.navButtons[ni].key;
      this.activeOverlay = (this.activeOverlay === k) ? null : k;
      window.GameRender.invalidate();
    } else if (fireB) {
      const b = this.actionButtons[bi];
      if (!b.disabled) console.log('Azione gioco:', b.action);
    } else if (type === 'touch') {
      window.GameRender.invalidate();
    }
  },

  onPointerCancel() {
    this.dragging = false;
    this.dragMoved = false;
    this.pressedBtn = this.pressedNav = this.pressedZoom = -1;
    this.hoverBtn = this.hoverNav = this.hoverZoom = -1;
    this.overlayPressed = null;
    window.GameRender.invalidate();
  },

  onWheel(p, deltaY) {
    if (Scenes.current !== this) return;
    if (this.activeOverlay) return;
    if (!this.inMap(p)) return;
    MapRenderer.zoom(this.cam, deltaY < 0 ? 1 : -1); // centrato sul centro camera
    window.GameRender.invalidate();
  },

  // ─── Viaggio ──────────────────────────────────────────────────────────────
  _handleMapClick(p) {
    if (!this.mapRect || !World.tiles) return;
    const w = MapRenderer.screenToWorld(this.mapRect, this.cam, p.x, p.y);
    const tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (tx < 0 || ty < 0 || tx >= World.width || ty >= World.height) return;

    // Click sul tile in cui sei: ferma il viaggio in corso (o no-op).
    if (tx === this.knightPos.x && ty === this.knightPos.y) {
      if (Travel.isActive()) {
        Travel.stop();
        this.meta.destinazione = 'nessuna';
        this._logEvent('Viaggio interrotto.');
        window.GameRender.invalidate();
      }
      return;
    }

    const biome = World.biomeAt(tx, ty);
    if (TRAVEL_COST[biome] == null) {
      this._logEvent('Impossibile raggiungere quel luogo.');
      window.GameRender.invalidate();
      return;
    }

    const path = Travel.findPath(this.knightPos.x, this.knightPos.y, tx, ty);
    if (!path || !path.length) {
      this._logEvent('Nessuna via per quella meta.');
      window.GameRender.invalidate();
      return;
    }
    Travel.start(path);

    // Etichetta destinazione: se è una struttura nota usa il nome.
    const struct = World.structures.find(s => s.x === tx && s.y === ty);
    const name = struct ? struct.name : `(${tx}, ${ty})`;
    this.meta.destinazione = name;
    this._logEvent(`In marcia verso ${name}.`);
    window.GameRender.invalidate();
  },

  // Chiamato da main.js a ogni frame. dtMs include la pausa fra frame: senza,
  // il viaggio si bloccherebbe quando la finestra è inattiva e ripartirebbe
  // di colpo. Limitiamo il dt a ~250 ms (1 secondo di buffering al massimo)
  // per evitare maxi-balzi al rientro.
  update(dtMs) {
    if (!Travel.isActive()) return;
    const dt = Math.min(dtMs, 250);
    Travel.update(dt, this.knightPos, {
      onStep: (tile, _biome) => {
        // Pausa automatica su strutture (GAMEPLAY.md §1): il cavaliere si
        // ferma sopra il luogo, lasciando al giocatore decidere se entrare.
        const s = World.structures.find(st => st.x === tile.x && st.y === tile.y);
        if (s && (tile.x !== this.meta._lastStructX || tile.y !== this.meta._lastStructY)) {
          this.meta._lastStructX = tile.x; this.meta._lastStructY = tile.y;
          this._logEvent(`Attraversi ${s.name}.`);
        }
      },
      onArrive: () => {
        this.meta.destinazione = 'nessuna';
        this._logEvent('Sei giunto a destinazione.');
      },
      onBlocked: (reason) => {
        this.meta.destinazione = 'nessuna';
        if (reason === 'esausto') this._logEvent('Crolli per la stanchezza: ti fermi.');
        else this._logEvent('Il cammino si interrompe.');
      },
    });
    window.GameRender.invalidate();
  },

  _logEvent(msg) {
    this.log.push(msg);
    if (this.log.length > 24) this.log.shift();
  },

  overlayWhere(p) {
    const x = this.overlayClose;
    if (x && p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h) return 'close';
    const c = this.overlayCard;
    if (c && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return 'inside';
    return 'outside';
  },

  // ─── Draw ───────────────────────────────────────────────────────────────────
  draw() {
    const L = this.layout();
    const ctx = this.ctx;
    const W = window.UI.w, H = window.UI.h;

    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, W, H);
    const parchment = getParchmentTexture(W, H, 4242);
    ctx.drawImage(parchment, 0, 0);

    if (L.compact) this.drawCompact(L);
    else this.drawDesktop(L);
  },

  drawDesktop(L) {
    this.zoomButtons = [];           // niente +/- su desktop (solo rotella)
    this.activeOverlay = null;       // overlay solo in compatto
    this.mapRect = L.map;
    this.drawTopBarSplit(L.topBarLeft, L.topBarRight);
    this.drawPanel(L.left, 'STATO CAVALIERE');
    this.drawKnightStatus(L.left);
    this.drawMapPanel(L.map);
    this.drawPanel(L.right, 'CONTESTO');
    this.drawContext(L.right);
    this.drawPanel(L.log, 'CRONACA EVENTI');
    this.drawLog(L.log, L.log.y + L.log.h - SF(12));
    this.drawPanel(L.mini, 'MINIMAPPA REGIONALE');
    this.drawMinimap(L.mini);
    // Barra inferiore: comandi azione + informazioni di gioco.
    this.drawBottomBar(L.bottom);
  },

  drawCompact(L) {
    this.mapRect = L.map;
    this.layoutFooter(L.footer);

    this.drawTopBar(L.topBar, true);
    this.drawMapPanel(L.map);   // disegna anche i pulsanti +/-

    const ctx = this.ctx;
    const f = L.footer;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(f.x, f.y, f.w, PIXEL);
    this.drawNavButtons();
    this.drawActionButtons();

    if (this.activeOverlay) this.drawOverlay();
  },

  drawNavButtons() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.navButtons.forEach((b, i) => {
      const active = this.activeOverlay === b.key;
      const hovered = i === this.hoverNav;
      ctx.fillStyle = active ? PALETTE.pergMedia : (hovered ? PALETTE.pergScura : PALETTE.hudSfondo);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawPixelRectStroke(ctx, b.x, b.y, b.w, b.h, active ? PALETTE.hudTitolo : PALETTE.hudBordo);
      ctx.fillStyle = active ? PALETTE.inkNero : PALETTE.hudTitolo;
      ctx.font = `${active ? 'bold ' : ''}${SF(12)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  },

  drawActionButtons() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.actionButtons.forEach((b, i) => {
      const hovered = i === this.hoverBtn;
      ctx.fillStyle = hovered ? PALETTE.pergMedia : PALETTE.inkScuro;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawPixelRectStroke(ctx, b.x, b.y, b.w, b.h, hovered ? PALETTE.hudTitolo : PALETTE.hudBordo);
      ctx.fillStyle = b.disabled ? PALETTE.hudDim : (hovered ? PALETTE.inkNero : PALETTE.hudTitolo);
      ctx.font = `${hovered ? 'bold ' : ''}${SF(13)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  },

  drawZoomButtons(area) {
    const ctx = this.ctx;
    const s = SF(36), gap = SF(6), m = SF(10);
    const bx = area.x + area.w - m - s;
    const byIn = area.y + area.h - m - s * 2 - gap;
    const byOut = area.y + area.h - m - s;
    this.zoomButtons = [
      { key: 'in',  label: '+', x: bx, y: byIn,  w: s, h: s },
      { key: 'out', label: '−', x: bx, y: byOut, w: s, h: s },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.zoomButtons.forEach((b, i) => {
      const hovered = i === this.hoverZoom;
      ctx.fillStyle = hovered ? PALETTE.pergMedia : PALETTE.pergScura;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawPixelRectStroke(ctx, b.x, b.y, b.w, b.h, PALETTE.inkScuro);
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.font = `bold ${SF(22)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + PIXEL);
    });
  },

  drawOverlay() {
    const ctx = this.ctx;
    const W = window.UI.w, H = window.UI.h;
    ctx.fillStyle = 'rgba(10,6,2,0.72)';
    ctx.fillRect(0, 0, W, H);

    const m = SF(16);
    const card = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    this.overlayCard = card;

    const titleByKey = {
      stato: 'STATO CAVALIERE', contesto: 'CONTESTO',
      log: 'DIARIO EVENTI', mini: 'MINIMAPPA REGIONALE',
    };
    this.drawPanel(card, titleByKey[this.activeOverlay] || '');

    if (this.activeOverlay === 'stato')    this.drawKnightStatus(card);
    if (this.activeOverlay === 'contesto') this.drawContext(card);
    if (this.activeOverlay === 'log')      this.drawLog(card, card.y + card.h - SF(16));
    if (this.activeOverlay === 'mini')     this.drawMinimap(card);

    const bandH = SF(26);
    const cs = SF(20);
    const close = {
      x: card.x + card.w - PIXEL * 8 - cs,
      y: card.y + PIXEL * 4 + Math.floor((bandH - cs) / 2),
      w: cs, h: cs,
    };
    this.overlayClose = close;
    ctx.fillStyle = this.hoverClose ? PALETTE.rossoBandCh : PALETTE.rossoBandiera;
    ctx.fillRect(close.x, close.y, close.w, close.h);
    drawPixelRectStroke(ctx, close.x, close.y, close.w, close.h, PALETTE.inkScuro);
    ctx.fillStyle = PALETTE.pergChiara;
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', close.x + close.w / 2, close.y + close.h / 2 + PIXEL);
  },

  drawPanel(area, title) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.pergScura;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    drawPixelRectStroke(ctx, area.x, area.y, area.w, area.h, PALETTE.inkScuro);
    drawPixelRectStroke(ctx, area.x + PIXEL * 2, area.y + PIXEL * 2, area.w - PIXEL * 4, area.h - PIXEL * 4, PALETTE.inkMedio);
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

    ctx.fillStyle = PALETTE.hudNormale;
    ctx.textAlign = 'right';
    if (compact) {
      ctx.font = `${SF(12)}px "Courier New", monospace`;
      ctx.fillText(Calendar.formatCompatto(), area.w - SF(12), area.h / 2 - SF(8));
      ctx.fillText(`${Calendar.nomeStagione()} · ${this.meta.meteo}`, area.w - SF(12), area.h / 2 + SF(8));
    } else {
      ctx.font = `${SF(16)}px "Courier New", monospace`;
      ctx.fillText(Calendar.formatCompatto(), area.w - SF(18), area.h / 2 - SF(10));
      ctx.fillText(`${Calendar.nomeStagione()}  ·  ${this.meta.meteo}  ·  Destinazione: ${this.meta.destinazione}`, area.w - SF(18), area.h / 2 + SF(10));
      drawCompassRose(ctx, area.x + area.w / 2, area.y + area.h / 2, SF(26));
    }
  },

  // Barra superiore desktop: due soli segmenti (titolo a sx, meta a dx); la
  // fascia centrale è libera, lì la mappa risale fino in cima.
  drawTopBarSplit(left, right) {
    const ctx = this.ctx;
    this._drawBarSeg(left);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(32)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KNIGHT DAWN', left.x + SF(18), left.y + left.h / 2);

    this._drawBarSeg(right);
    const rx = right.x + right.w - SF(14);
    const ry = right.y + right.h / 2;
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(13)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(Calendar.formatCompatto(), rx, ry - SF(16));
    ctx.fillText(`${Calendar.nomeStagione()}  ·  ${this.meta.meteo}`, rx, ry);
    ctx.fillText(`Destinazione: ${this.meta.destinazione}`, rx, ry + SF(16));
  },

  _drawBarSeg(area) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(area.x, area.y + area.h - PIXEL, area.w, PIXEL);
  },

  // Barra inferiore desktop: pannello dedicato sotto la mappa con i comandi
  // azione a destra e un'area informativa a sinistra per testo/funzioni di
  // gioco (luogo, destinazione, suggerimenti, eventi imminenti…).
  drawBottomBar(area) {
    const ctx = this.ctx;
    this.drawPanel(area, 'COMANDI E AZIONI');

    const innerPad = SF(12);
    const titleBand = SF(26);
    const inner = {
      x: area.x + innerPad,
      y: area.y + PIXEL * 4 + titleBand + SF(6),
      w: area.w - innerPad * 2,
      h: area.h - PIXEL * 4 - titleBand - SF(6) - innerPad,
    };

    // Pulsanti azione: riga unica allineata a destra, dimensionata sul testo.
    const n = this.actionButtons.length;
    const bh = SF(34);
    const gap = SF(8);
    const btnW = SF(150);
    const btnsW = btnW * n + gap * (n - 1);
    const btnsX = inner.x + inner.w - btnsW;
    const btnsY = inner.y + Math.floor((inner.h - bh) / 2);
    this.actionButtons.forEach((b, i) => {
      b.x = Math.floor(btnsX + i * (btnW + gap));
      b.y = btnsY;
      b.w = btnW;
      b.h = bh;
    });
    this.drawActionButtons();

    // Area info a sinistra dei pulsanti: separatore + righe di testo.
    const infoR = { x: inner.x, y: inner.y, w: btnsX - inner.x - SF(14), h: inner.h };
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(btnsX - SF(10), inner.y, PIXEL, inner.h);

    if (infoR.w > SF(80)) this.drawBottomInfo(infoR);
  },

  // Informazioni di gioco nella barra inferiore. Pensata per crescere con il
  // gioco (suggerimenti, prossima azione disponibile, costi turno…); per ora
  // mostra luogo, destinazione e ultimo evento.
  drawBottomInfo(area) {
    const ctx = this.ctx;
    const last = this.log[this.log.length - 1] || '';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = area.y;

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.fillText('LUOGO', area.x, y);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(13)}px "Courier New", monospace`;
    ctx.fillText('Pianura, Marche di Vorn', area.x + SF(64), y - SF(1));
    y += SF(20);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.fillText('META', area.x, y);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(13)}px "Courier New", monospace`;
    ctx.fillText(this.meta.destinazione, area.x + SF(64), y - SF(1));
    y += SF(20);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.fillText('ULTIMO', area.x, y);
    ctx.fillStyle = PALETTE.hudEvento;
    ctx.font = `italic ${SF(13)}px "Courier New", monospace`;
    const maxW = area.w - SF(64);
    let s = last;
    while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    if (s.length < last.length) s += '…';
    ctx.fillText(s, area.x + SF(64), y - SF(1));
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
    this.drawAttrBar(innerX, y, barW, 'FORZA',   k.forza,   '#2a7a1a', '#3a9a22'); y += SF(28);
    this.drawAttrBar(innerX, y, barW, 'VOLONTÀ', k.volonta, '#4a3ab0', '#6050c8'); y += SF(28);
    this.drawAttrBar(innerX, y, barW, 'SALUTE',  k.salute,  '#aa2020', '#cc2828'); y += SF(28);
    this.drawOnore(innerX, y, barW, k.onore); y += SF(28);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(15)}px "Courier New", monospace`;
    ctx.fillText('EQUIPAGGIAMENTO', innerX, y); y += SF(22);
    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `${SF(14)}px "Courier New", monospace`;
    const equipSlots = [
      ['arma', 'Arma'], ['armatura', 'Armatura'], ['scudo', 'Scudo'],
      ['speciale', 'Speciale'], ['viaggio', 'Viaggio'],
    ];
    for (const [slot, label] of equipSlots) {
      const val = k.equip[slot];
      ctx.fillStyle = val ? PALETTE.hudNormale : PALETTE.hudDim;
      ctx.fillText((val ? '· ' : '  ') + label + ': ' + (val || '—'), innerX, y);
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
        const filled = (r.val >= 0 && i > 0 && i <= r.val) || (r.val < 0 && i < 0 && i >= r.val);
        ctx.fillStyle = i === 0 ? PALETTE.inkMedio : (filled ? (r.val > 0 ? '#3a9a22' : '#aa2020') : PALETTE.inkMedio);
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
    ctx.fillText(`${Math.ceil(value.cur)}/${value.max}`, x + w, y);
    const barY = y + SF(14), barH = SF(10);
    ctx.fillStyle = '#0e0804';
    ctx.fillRect(x, barY, w, barH);
    drawPixelRectStroke(this.ctx, x, barY, w, barH, PALETTE.inkScuro);
    const fillW = Math.floor((w - PIXEL * 2) * value.cur / value.max);
    ctx.fillStyle = color;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, barH - PIXEL * 2);
    ctx.fillStyle = colorHi;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, PIXEL);
  },

  // Onore: scala -5/+5, barra centrata. Metà sinistra = negativo (rosso),
  // metà destra = positivo (verde). Il tratto centrale = 0.
  drawOnore(x, y, w, val) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ONORE', x, y);

    const sign = val > 0 ? '+' : '';
    ctx.fillStyle = val > 0 ? '#3a9a22' : val < 0 ? '#aa2020' : PALETTE.hudNormale;
    ctx.font = `${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(sign + val + ' / ±5', x + w, y);

    // Barra centrata: 11 segmenti, il centrale è lo zero.
    const barY = y + SF(14), barH = SF(10);
    const segN = 11, gap = PIXEL;
    const segW = Math.floor((w - gap * (segN - 1)) / segN);
    for (let i = 0; i < segN; i++) {
      const segVal = i - 5;   // -5 … +5
      const bx = x + i * (segW + gap);
      // Sfondo
      ctx.fillStyle = '#0e0804';
      ctx.fillRect(bx, barY, segW, barH);
      // Riempimento se "attivo"
      const active = (val > 0 && segVal > 0 && segVal <= val) ||
                     (val < 0 && segVal < 0 && segVal >= val);
      if (active) {
        ctx.fillStyle = val > 0 ? '#2a7a1a' : '#aa2020';
        ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, barH - PIXEL * 2);
        ctx.fillStyle = val > 0 ? '#3a9a22' : '#cc2828';
        ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, PIXEL);
      }
      // Bordo: il segmento centrale (zero) è più chiaro
      drawPixelRectStroke(ctx, bx, barY, segW, barH,
        segVal === 0 ? PALETTE.hudNormale : PALETTE.inkScuro);
    }
  },

  drawMapPanel(area) {
    const ctx = this.ctx;
    const tex = getParchmentTexture(area.w, area.h, 9999);
    ctx.drawImage(tex, area.x, area.y);

    // Mondo reale (biomi + strutture + cavaliere), clippato nella cornice.
    MapRenderer.clampCam(this.cam, area); // mondo sempre inquadrato
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    MapRenderer.draw(ctx, area, this.cam, this.knightPos);
    ctx.restore();

    drawCartographicBorder(ctx, area.x, area.y, area.w, area.h);

    // Etichetta regione su targhetta chiara (leggibile su qualsiasi fondo).
    const rTxt = 'Le Marche di Vorn';
    const rFs = SF(17);
    ctx.font = `italic bold ${rFs}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const rw = ctx.measureText(rTxt).width;
    const rx = area.x + SF(14), ry = area.y + SF(12);
    const rpadX = SF(8), rpadY = SF(5);
    ctx.fillStyle = 'rgba(216,200,160,0.88)';
    ctx.fillRect(rx - rpadX, ry - rpadY, rw + rpadX * 2, rFs + rpadY * 2);
    drawPixelRectStroke(ctx, rx - rpadX, ry - rpadY, rw + rpadX * 2, rFs + rpadY * 2, PALETTE.inkScuro);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillText(rTxt, rx, ry);

    if (window.UI.compact) this.drawZoomButtons(area);
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
      for (const line of lines) { ctx.fillText(line, x, y); y += SF(18); }
      y += SF(10);
    };

    drawSection('LUOGO ATTUALE', 'Pianura, Marche di Vorn');
    drawSection('VISIBILITÀ',    '5 tile (pianura)');
    drawSection('STAGIONE',      'Primavera · 12° giorno');
    drawSection('METEO',         'Sereno · vento da est');
    drawSection('NOTIZIE DAL MONDO', [
      'Lord Aerin di Vorn', 'ha bandito una taglia', 'sui banditi del Sud.',
      '', 'L\'Ordine del Cervo', 'cerca cavalieri.',
    ]);
  },

  drawLog(area, bottomY) {
    const ctx = this.ctx;
    const x = area.x + PIXEL * 8;
    const yStart = area.y + PIXEL * 4 + SF(26) + SF(4);
    const logBottom = bottomY - PIXEL * 2;

    const colors = [PALETTE.hudEvento, PALETTE.hudNormale, PALETTE.hudNormale, PALETTE.hudDim, PALETTE.hudMorto];
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

    // Thumbnail del mondo reale (canvas cachato) + riquadro vista corrente.
    if (World.tiles) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(MapRenderer.thumbnail(), inner.x, inner.y, inner.w, inner.h);

      const t = MapRenderer.tilePx(this.cam);
      const vw = (this.mapRect ? this.mapRect.w / t : 0) / World.width * inner.w;
      const vh = (this.mapRect ? this.mapRect.h / t : 0) / World.height * inner.h;
      const vx = inner.x + (this.cam.cx / World.width) * inner.w - vw / 2;
      const vy = inner.y + (this.cam.cy / World.height) * inner.h - vh / 2;
      drawPixelRectStroke(ctx, vx, vy, Math.max(vw, PIXEL), Math.max(vh, PIXEL), PALETTE.cavMarker);
    }

    drawPixelRectStroke(ctx, inner.x, inner.y, inner.w, inner.h, PALETTE.inkScuro);

    // Marker cavaliere
    ctx.fillStyle = PALETTE.cavMarker;
    const kx = Math.floor(inner.x + (this.knightPos.x / World.width) * inner.w);
    const ky = Math.floor(inner.y + (this.knightPos.y / World.height) * inner.h);
    ctx.fillRect(kx - PIXEL, ky - PIXEL, PIXEL * 2, PIXEL * 2);

    ctx.fillStyle = PALETTE.hudNormale;
    ctx.font = `italic ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Sei qui · Marche di Vorn', area.x + area.w / 2, area.y + area.h - SF(8));
  },
};
