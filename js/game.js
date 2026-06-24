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

// SFmin(n) = font scalato come SF(n) ma con minimo assoluto in CSS px
// pari a n stesso (cioe' il font NON puo' scendere sotto il valore di
// design). Serve per i body text che devono restare leggibili su mobile
// anche quando UI.scale e' < 1.
function SFmin(n) { return Math.max(n, SF(n)); }

// ─── Scala tipografica UI ────────────────────────────────────────────────
// Token unici da riusare ovunque per coerenza tra sezioni e schermate.
// Tutti i token rispettano un MINIMO assoluto in CSS px (via SFmin) per
// garantire leggibilita anche su mobile dove UI.scale puo' essere < 1.
// Usare: ctx.font = FONT.body();  (sempre invocato, non assegnato)
//
// Regole:
//  - display:  titolo cinematico (logo gioco)
//  - title:    titoli pannello, nomi propri (cavaliere)
//  - heading:  titoli di sezione (LUOGO ATTUALE, NOTIZIE...)
//  - body:     corpo di testo lungo (cronaca, diario, contesto)
//  - label:    etichette compatte campi (FOR/VOL/SAL, ARMA, fazioni)
//  - value:    valori associati a label (100/100, +3, ecc.)
//  - button:   testo dei pulsanti azione/nav/tab
//  - caption:  testo secondario, sottotitoli, footer
//  - tiny:     solo per micro-tag decorativi
// Mai usare numeri SF "magici" per il testo dell'UI; aggiungere un nuovo
// token a questa tabella se serve un nuovo registro.
const FONT_FAMILY = '"Courier New", monospace';
const FONT = {
  display: () => `bold ${SFmin(28)}px ${FONT_FAMILY}`,
  title:   () => `bold ${SFmin(22)}px ${FONT_FAMILY}`,
  heading: () => `bold ${SFmin(18)}px ${FONT_FAMILY}`,
  body:    () => `${SFmin(18)}px ${FONT_FAMILY}`,
  bodyB:   () => `bold ${SFmin(18)}px ${FONT_FAMILY}`,
  bodyI:   () => `italic ${SFmin(18)}px ${FONT_FAMILY}`,
  label:   () => `bold ${SFmin(16)}px ${FONT_FAMILY}`,
  value:   () => `bold ${SFmin(17)}px ${FONT_FAMILY}`,
  valueI:  () => `bold italic ${SFmin(17)}px ${FONT_FAMILY}`,
  button:  () => `bold ${SFmin(17)}px ${FONT_FAMILY}`,
  caption: () => `italic ${SFmin(14)}px ${FONT_FAMILY}`,
  captionB:() => `bold ${SFmin(14)}px ${FONT_FAMILY}`,
  tiny:    () => `bold ${SFmin(12)}px ${FONT_FAMILY}`,
};
// Altezze di riga di riferimento (1.3x il font, usabili per spacing
// verticale coerente: usare LINEH.body, LINEH.heading, ecc.).
const LINEH = {
  display: () => SFmin(36),
  title:   () => SFmin(28),
  heading: () => SFmin(24),
  body:    () => SFmin(24),
  label:   () => SFmin(20),
  value:   () => SFmin(22),
  caption: () => SFmin(18),
};

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

    // Tab del pannello STATO CAVALIERE: una sottosezione alla volta per
    // garantire leggibilità (font generosi, niente wrap brutale).
    this.knightTab = 'profilo';
    this.knightTabs = [
      { key: 'profilo', label: 'PROFILO' },
      { key: 'equip',   label: 'EQUIP'   },
      { key: 'reput',   label: 'FAZIONI' },
      { key: 'diario',  label: 'DIARIO'  },
    ];
    this.knightTabRects = [];
    this.hoverKnightTab = -1;
    this.pressedKnightTab = -1;
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
    if (World.fog) World.explore(this.knightPos.x, this.knightPos.y, 5);
    this.cam = { cx: this.knightPos.x + 0.5, cy: this.knightPos.y + 0.5, step: MAP_ZOOM_DEFAULT };
    this.activeOverlay = null;
    this.preRecap = null;          // pannello pre-partenza
    this.preRecapBtnParti = null;
    this.preRecapBtnAnnulla = null;
    this.poiPause = null;          // interruzione POI durante viaggio
    this._poiPauseBtn = {};        // { ferma, ignora } rect
    this._dismissedPOIs = new Set(); // specials già notificate in questa tratta
    this.camAnchor = { x: World.knightStart.x, y: World.knightStart.y };
    this.camTarget = null;         // quando non-null la cam si avvicina qui
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
    const statStripH = SF(40);   // strip riassunto attributi cavaliere
    const navH = SF(32), actH = SF(38), fGap = SF(6), fPad = SF(8);
    const footerH = fPad * 2 + navH + fGap + actH;

    const topBar = { x: 0, y: 0, w: W, h: topBarH };
    const stat = { x: pad, y: topBarH + pad, w: W - pad * 2, h: statStripH };
    const map = {
      x: pad,
      y: stat.y + stat.h + pad,
      w: W - pad * 2,
      h: H - topBarH - statStripH - footerH - pad * 3,
    };
    const footer = { x: 0, y: H - footerH, w: W, h: footerH, navH, actH, fGap, fPad };

    return { compact: true, pad, topBar, stat, map, footer };
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
    const hk = !compact ? btnHitIndex(this.knightTabRects, p.x, p.y) : -1;
    const onBtn = hb >= 0 || hn >= 0 || hz >= 0 || hk >= 0;
    document.getElementById('game').style.cursor =
      onBtn ? 'pointer' : (this.inMap(p) ? 'grab' : 'default');
    if (hb !== this.hoverBtn || hn !== this.hoverNav || hz !== this.hoverZoom || hk !== this.hoverKnightTab) {
      this.hoverBtn = hb; this.hoverNav = hn; this.hoverZoom = hz; this.hoverKnightTab = hk;
      window.GameRender.invalidate();
    }
  },

  onPointerDown(p) {
    if (Scenes.current !== this) return;
    if (this.poiPause)  { this._poiPauseDown(p); return; }
    if (this.preRecap)  { this._preRecapDown(p); return; }
    if (this.activeOverlay) { this.overlayPressed = this.overlayWhere(p); return; }

    const compact = window.UI.compact;
    this.pressedBtn = btnHitIndex(this.actionButtons, p.x, p.y);
    this.pressedNav = compact ? btnHitIndex(this.navButtons, p.x, p.y) : -1;
    this.pressedZoom = compact ? btnHitIndex(this.zoomButtons, p.x, p.y) : -1;
    this.pressedKnightTab = !compact ? btnHitIndex(this.knightTabRects, p.x, p.y) : -1;

    if (this.pressedBtn < 0 && this.pressedNav < 0 && this.pressedZoom < 0 && this.pressedKnightTab < 0 && this.inMap(p)) {
      // Nessun pulsante: inizia il pan della mappa. Tracciamo anche start e
      // movimento totale: se l'utente non sposta abbastanza, il pointerup
      // sarà interpretato come "click sulla tile" per il viaggio.
      this.dragging = true;
      this.dragLast = { x: p.x, y: p.y };
      this.dragStart = { x: p.x, y: p.y };
      this.dragMoved = false;
      return;
    }
    this.hoverBtn = this.pressedBtn; this.hoverNav = this.pressedNav;
    this.hoverZoom = this.pressedZoom; this.hoverKnightTab = this.pressedKnightTab;
    window.GameRender.invalidate();
  },

  onPointerUp(p, type) {
    if (Scenes.current !== this) return;

    if (this.poiPause)  { this._poiPauseUp(p); return; }
    if (this.preRecap)  { this._preRecapUp(p); return; }

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

    // Controllo velocità viaggio
    if (this._speedBtnMinus && hitRect(this._speedBtnMinus, p.x, p.y)) {
      Travel.speedDown(); window.GameRender.invalidate(); return;
    }
    if (this._speedBtnPlus && hitRect(this._speedBtnPlus, p.x, p.y)) {
      Travel.speedUp(); window.GameRender.invalidate(); return;
    }

    const compact = window.UI.compact;
    const bi = btnHitIndex(this.actionButtons, p.x, p.y);
    const ni = compact ? btnHitIndex(this.navButtons, p.x, p.y) : -1;
    const zi = compact ? btnHitIndex(this.zoomButtons, p.x, p.y) : -1;
    const ki = !compact ? btnHitIndex(this.knightTabRects, p.x, p.y) : -1;
    const fireB = bi >= 0 && bi === this.pressedBtn;
    const fireN = ni >= 0 && ni === this.pressedNav;
    const fireZ = zi >= 0 && zi === this.pressedZoom;
    const fireK = ki >= 0 && ki === this.pressedKnightTab;
    this.pressedBtn = this.pressedNav = this.pressedZoom = this.pressedKnightTab = -1;
    if (type === 'touch') { this.hoverBtn = this.hoverNav = this.hoverZoom = this.hoverKnightTab = -1; }

    if (fireK) {
      this.knightTab = this.knightTabs[ki].key;
      window.GameRender.invalidate();
    } else if (fireZ) {
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
    this.pressedBtn = this.pressedNav = this.pressedZoom = this.pressedKnightTab = -1;
    this.hoverBtn = this.hoverNav = this.hoverZoom = this.hoverKnightTab = -1;
    this.overlayPressed = null;
    this.preRecap = null;
    this._preRecapPressed = null;
    this.poiPause = null;
    this._poiPausePressed = null;
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

    // Mostra il pannello di pre-partenza invece di partire immediatamente.
    const struct = World.structures.find(s => s.x === tx && s.y === ty);
    const name = struct ? struct.name : `(${tx}, ${ty})`;
    this.preRecap = {
      path, dest: { x: tx, y: ty }, name,
      stats: this._computePreRecapStats(path),
    };
    window.GameRender.invalidate();
  },

  // ─── Pre-recap partenza ───────────────────────────────────────────────────

  _computePreRecapStats(path) {
    const terrains = new Map();
    let forzaCost = 0;
    const onPath = new Set(path.map(t => t.y * World.width + t.x));
    for (const tile of path) {
      const b = World.biomeAt(tile.x, tile.y);
      terrains.set(b, (terrains.get(b) || 0) + 1);
      const c = TRAVEL_COST[b];
      if (c != null) forzaCost += c;
    }
    const terrainList = [...terrains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const structures  = World.structures.filter(s => onPath.has(s.y * World.width + s.x));
    const willExhaust = forzaCost > this.knight.forza.cur;
    return { steps: path.length, timeSec: path.length * Travel.speedSec(),
             forzaCost, willExhaust, terrainList, structures };
  },

  _fmtTime(sec) {
    if (sec < 60) return Math.round(sec) + ' s';
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    return (sec / 3600).toFixed(1) + ' h';
  },

  _preRecapDown(p) {
    // Usato in onPointerDown per segnare quale pulsante è stato premuto.
    this._preRecapPressed =
      (this.preRecapBtnParti   && hitRect(this.preRecapBtnParti, p.x, p.y))   ? 'parti'   :
      (this.preRecapBtnAnnulla && hitRect(this.preRecapBtnAnnulla, p.x, p.y)) ? 'annulla' :
      (this._preRecapCard      && !hitRect(this._preRecapCard, p.x, p.y))     ? 'outside' : null;
  },

  _preRecapUp(p) {
    const was = this._preRecapPressed;
    this._preRecapPressed = null;
    if (was === 'parti' && this.preRecapBtnParti && hitRect(this.preRecapBtnParti, p.x, p.y)) {
      const { path, name } = this.preRecap;
      this.preRecap = null;
      this._dismissedPOIs.clear();
      Travel.start(path);
      this.camAnchor.x = this.knightPos.x;
      this.camAnchor.y = this.knightPos.y;
      this.meta.destinazione = name;
      this._logEvent(`In marcia verso ${name}.`);
    } else if (was === 'annulla' || was === 'outside') {
      this.preRecap = null;
    }
    window.GameRender.invalidate();
  },

  // ─── POI pause ────────────────────────────────────────────────────────────

  _poiPauseDown(p) {
    this._poiPausePressed =
      (this._poiPauseBtn.ferma   && hitRect(this._poiPauseBtn.ferma,  p.x, p.y)) ? 'ferma'  :
      (this._poiPauseBtn.ignora  && hitRect(this._poiPauseBtn.ignora, p.x, p.y)) ? 'ignora' :
      (this._poiPauseCard        && !hitRect(this._poiPauseCard,      p.x, p.y)) ? 'outside': null;
  },

  _poiPauseUp(p) {
    const was = this._poiPausePressed;
    this._poiPausePressed = null;
    const poi = this.poiPause;
    this.poiPause = null;
    if (was === 'ferma' && this._poiPauseBtn.ferma && hitRect(this._poiPauseBtn.ferma, p.x, p.y)) {
      // Rotta verso il POI: avvia un percorso diretto dalla posizione attuale
      const path = Travel.findPath(this.knightPos.x, this.knightPos.y, poi.special.x, poi.special.y);
      if (path && path.length) {
        this._dismissedPOIs.clear();
        Travel.start(path);
        this.camAnchor.x = this.knightPos.x;
        this.camAnchor.y = this.knightPos.y;
        const label = poi.special.kind || 'luogo ignoto';
        this.meta.destinazione = label;
        this._logEvent(`Ti dirigi verso il ${label} avvistato.`);
      }
    } else if (was === 'ignora' || was === 'outside') {
      // Riprende il viaggio verso la meta originale usando il path residuo salvato.
      if (poi.remainingPath && poi.remainingPath.length) {
        Travel.start(poi.remainingPath);
        this.meta.destinazione = poi.savedDest || 'nessuna';
        this._logEvent('Continui il viaggio.');
      }
    }
    window.GameRender.invalidate();
  },

  drawPOIPause() {
    const ctx = this.ctx;
    const W = window.UI.w, H = window.UI.h;
    const poi = this.poiPause;
    const sp  = poi.special;

    const POI_HINT = {
      rovine:    'Un ammasso di pietre scheggiate intravisto tra la vegetazione.',
      tempio:    'Una sagoma di pilastri — forse un vecchio tempio dimenticato.',
      monolite:  'Una pietra scolpita eretta solitaria nella pianura.',
      relitto:   'Un relitto arenato, semi-sommerso, lontano dal mare.',
      cripta:    'Un\'apertura nel terreno: scalini che scendono nel buio.',
      faro:      'Un moncone di torre in rovina, ancora vagamente riconoscibile.',
      santuario: 'Resti di un piccolo santuario; fiori secchi sull\'altare.',
      voragine:  'Un vasto varco aperto nella roccia, aria fredda ne sale.',
    };

    const hint = POI_HINT[sp.kind] || 'Qualcosa di insolito attira la tua attenzione.';
    const kindLabel = sp.kind ? sp.kind.charAt(0).toUpperCase() + sp.kind.slice(1) : 'Luogo misterioso';
    const distLabel = poi.dist <= 1 ? 'a pochi passi' : `a ${poi.dist} tile`;

    const cw = Math.min(SF(320), W - SF(24));
    const ch = SF(148);
    // Ancorata in basso-centro sulla mappa (o sul canvas se mappa non disponibile)
    const mr = this.mapRect || { x: 0, y: 0, w: W, h: H };
    const cx = Math.round(mr.x + (mr.w - cw) / 2);
    const cy = mr.y + mr.h - ch - SF(12);
    this._poiPauseCard = { x: cx, y: cy, w: cw, h: ch };

    // Card body
    ctx.fillStyle = PALETTE.hudSfondo || '#1a1208';
    ctx.fillRect(cx, cy, cw, ch);

    // Banda titolo ambrata
    ctx.fillStyle = '#3d2a08';
    ctx.fillRect(cx, cy, cw, SF(26));
    ctx.fillStyle = '#ffd080';
    ctx.font = FONT.heading ? FONT.heading() : FONT.label();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${kindLabel}  ·  ${distLabel}`, cx + SF(10), cy + SF(13));

    // Testo descrittivo
    ctx.fillStyle = '#c8b880';
    ctx.font = FONT.body ? FONT.body() : FONT.value();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // Wrap manuale su due righe
    const maxTW = cw - SF(20);
    let line1 = hint, line2 = '';
    while (line1.length > 0 && ctx.measureText(line1).width > maxTW) {
      const cut = line1.lastIndexOf(' ');
      if (cut <= 0) break;
      line2 = line1.slice(cut + 1) + (line2 ? ' ' + line2 : '');
      line1 = line1.slice(0, cut);
    }
    ctx.fillText(line1, cx + SF(10), cy + SF(32));
    if (line2) ctx.fillText(line2, cx + SF(10), cy + SF(32) + SF(18));

    // Pulsanti
    const btnH = SF(26), btnW = SF(130);
    const by = cy + ch - SF(34);
    const ignoraR = { x: cx + SF(10),               y: by, w: btnW, h: btnH };
    const fermaR  = { x: cx + cw - SF(10) - btnW,   y: by, w: btnW, h: btnH };
    this._poiPauseBtn = { ignora: ignoraR, ferma: fermaR };

    const drawBtn = (r, label, bg, fg) => {
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawPixelRectStroke(ctx, r.x, r.y, r.w, r.h, fg);
      ctx.fillStyle = fg;
      ctx.font = FONT.button ? FONT.button() : FONT.label();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    };
    drawBtn(ignoraR, 'Ignora, continua', '#201408', '#a08050');
    drawBtn(fermaR,  'Esplora →',        '#3a2808', '#ffd080');

    drawPixelRectStroke(ctx, cx, cy, cw, ch, '#5a4020');
  },

  drawPreRecap() {
    const ctx = this.ctx;
    const W = window.UI.w, H = window.UI.h;
    const r = this.preRecap;
    const s = r.stats;

    const BIOME_NOME = ['Acqua','Pianura','Foresta','Collina','Montagna',
      'Palude','Sabbia','Neve','Ghiaccio','Fiume','Roccia','Steppa','Arido'];

    // Dimensioni card
    const cw = Math.min(SF(360), W - SF(32));
    const ch = SF(s.willExhaust ? 258 : 238);
    const cx = Math.round((W - cw) / 2);
    const cy = Math.round((H - ch) / 2);
    this._preRecapCard = { x: cx, y: cy, w: cw, h: ch };

    // Sfondo semi-trasparente
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Card body
    ctx.fillStyle = PALETTE.hudSfondo || '#1a1208';
    ctx.fillRect(cx, cy, cw, ch);

    // Banda titolo
    ctx.fillStyle = PALETTE.hudTitolo || '#3a2810';
    ctx.fillRect(cx, cy, cw, SF(28));
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.heading();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROTTA VERSO  ' + r.name.toUpperCase(), cx + cw / 2, cy + SF(14));

    // Bordo
    drawPixelRectStroke(ctx, cx, cy, cw, ch, PALETTE.inkScuro || '#5a4020');

    // Righe info
    const lx = cx + SF(12), rx = cx + cw - SF(12);
    const lw = SF(70);
    let y = cy + SF(36);
    const rh = SF(22);

    const row = (label, value, valColor) => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#e8c050';
      ctx.font = FONT.label();
      ctx.fillText(label, lx, y + SF(2));
      ctx.fillStyle = valColor || '#e8d8b0';
      ctx.font = FONT.value();
      ctx.fillText(value, lx + lw, y);
      y += rh;
    };

    row('PASSI',  s.steps + ' tile');
    row('TEMPO',  this._fmtTime(s.timeSec) + '  (a ' + Travel.speedSec() + ' s/passo)');

    // Riga Fatica con barra
    const fMax = this.knight.forza.max;
    const fCur = this.knight.forza.cur;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.fillText('FATICA', lx, y + SF(2));
    const barX = lx + lw, barW = SF(120), barH = SF(10);
    const barY = y + SF(5);
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(barX, barY, barW, barH);
    const fill = Math.min(1, s.forzaCost / fMax);
    ctx.fillStyle = s.willExhaust ? '#c04020' : '#60a030';
    ctx.fillRect(barX, barY, Math.round(barW * fill), barH);
    ctx.fillStyle = s.willExhaust ? '#ff8060' : '#e8d8b0';
    ctx.font = FONT.value();
    ctx.fillText(s.forzaCost.toFixed(1) + ' / ' + fCur.toFixed(1), barX + barW + SF(6), y);
    y += rh;

    // Terreni
    const terrStr = s.terrainList.map(([b, n]) => (BIOME_NOME[b] || '?') + ' ×' + n).join('  ·  ');
    row('TERRENI', terrStr);

    // Strutture sul cammino
    if (s.structures.length) {
      const stNames = s.structures.map(st => st.name).join(' · ');
      row('TAPPE', stNames, '#ffd080');
    }

    // Avviso esaurimento
    if (s.willExhaust) {
      y += SF(4);
      ctx.fillStyle = 'rgba(180,40,10,0.25)';
      ctx.fillRect(cx + SF(8), y, cw - SF(16), SF(20));
      ctx.fillStyle = '#ff7050';
      ctx.font = FONT.caption();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠  Le forze potrebbero esaurirsi prima di arrivare', cx + cw / 2, y + SF(10));
      y += SF(24);
    }

    // Pulsanti
    y = cy + ch - SF(38);
    const btnH = SF(26), btnW = SF(100);
    const annR = { x: cx + SF(16),          y, w: btnW, h: btnH };
    const parR = { x: cx + cw - SF(16) - btnW, y, w: btnW, h: btnH };
    this.preRecapBtnAnnulla = annR;
    this.preRecapBtnParti   = parR;

    const drawBtn = (r2, label, col, textCol) => {
      ctx.fillStyle = col;
      ctx.fillRect(r2.x, r2.y, r2.w, r2.h);
      drawPixelRectStroke(ctx, r2.x, r2.y, r2.w, r2.h, textCol);
      ctx.fillStyle = textCol;
      ctx.font = FONT.button();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, r2.x + r2.w / 2, r2.y + r2.h / 2);
    };

    drawBtn(annR, 'Annulla', '#2a1a08', '#a08050');
    drawBtn(parR, 'Parti →', '#3a2808', '#e8c050');
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
        // Esplora intorno alla nuova posizione (nebbia di guerra).
        if (World.fog) World.explore(tile.x, tile.y, 4);

        // Pausa automatica su strutture (GAMEPLAY.md §1 "Calmo"):
        // il cavaliere si ferma al luogo, lasciando al giocatore decidere.
        const s = World.structures.find(st => st.x === tile.x && st.y === tile.y);
        if (s && (tile.x !== this.meta._lastStructX || tile.y !== this.meta._lastStructY)) {
          this.meta._lastStructX = tile.x; this.meta._lastStructY = tile.y;
          Travel.stop();
          this.meta.destinazione = 'nessuna';
          this._logEvent(`Arrivi a ${s.name}.`);
          return;
        }

        // Pausa opzionale su POI vicini (rovine, templi, ecc.).
        const POI_RADIUS = 3;
        for (const sp of World.specials) {
          const id = sp.y * World.width + sp.x;
          if (this._dismissedPOIs.has(id)) continue;
          const dx = sp.x - tile.x, dy = sp.y - tile.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > POI_RADIUS) continue;
          // Trovato POI abbastanza vicino: pausa con scelta.
          // Salva il path residuo PRIMA di stop() che lo azzera.
          const remainingPath = Travel.path ? Travel.path.slice(Travel.idx) : [];
          const savedDest = this.meta.destinazione;
          this._dismissedPOIs.add(id);
          Travel.stop();
          this.poiPause = { special: sp, dist: Math.round(dist), remainingPath, savedDest };
          // Punta la camera verso il POI per farlo vedere
          this.camTarget = { cx: sp.x + 0.5, cy: sp.y + 0.5 };
          return;
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

    // Camera a scatti: la cam resta ferma finché il cavaliere supera CHUNK
    // tile dall'ultimo ancoraggio; poi scivola fluida verso di lui.
    const CHUNK = 4;
    if (Travel.isActive()) {
      const adx = Math.abs(this.knightPos.x - this.camAnchor.x);
      const ady = Math.abs(this.knightPos.y - this.camAnchor.y);
      if (adx >= CHUNK || ady >= CHUNK) {
        this.camAnchor.x = this.knightPos.x;
        this.camAnchor.y = this.knightPos.y;
        this.camTarget = { cx: this.knightPos.x + 0.5, cy: this.knightPos.y + 0.5 };
      }
    }
    if (this.camTarget) {
      const f = Math.min(1, dt * 6 / 1000);
      this.cam.cx += (this.camTarget.cx - this.cam.cx) * f;
      this.cam.cy += (this.camTarget.cy - this.cam.cy) * f;
      if (Math.abs(this.cam.cx - this.camTarget.cx) < 0.05 &&
          Math.abs(this.cam.cy - this.camTarget.cy) < 0.05) {
        this.cam.cx = this.camTarget.cx;
        this.cam.cy = this.camTarget.cy;
        this.camTarget = null;
      }
    }

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
    if (this.preRecap)  this.drawPreRecap();
    if (this.poiPause)  this.drawPOIPause();
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
    // Strip riassunto cavaliere sotto il topbar — sempre visibile
    if (L.stat) this.drawKnightStatStrip(L.stat.x, L.stat.y, L.stat.w, L.stat.h);
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
      ctx.font = FONT.button();
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
      ctx.font = FONT.button();
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
      ctx.font = FONT.title();
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
    ctx.font = FONT.button();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', close.x + close.w / 2, close.y + close.h / 2 + PIXEL);
  },

  // Pannello stile "cartiglio scuro su pergamena": fondo marrone inchiostro,
  // bordo esterno doppio, band del titolo in oro pieno con sottolineatura
  // rossa per richiamo araldico. Tutto il testo dei contenuti userà toni
  // chiari (crema / oro / accenti vivi) per massimo contrasto sullo scuro.
  drawPanel(area, title) {
    const ctx = this.ctx;
    // Fondo scuro pieno
    ctx.fillStyle = PALETTE.hudSfondo;  // #1e1008 — cuoio inchiostrato
    ctx.fillRect(area.x, area.y, area.w, area.h);
    // Bordo esterno: oro scuro per stacco netto sulla pergamena
    drawPixelRectStroke(ctx, area.x, area.y, area.w, area.h, '#8a6030');
    // Bordo interno: nero per cornice cesellata
    drawPixelRectStroke(ctx, area.x + PIXEL * 2, area.y + PIXEL * 2,
      area.w - PIXEL * 4, area.h - PIXEL * 4, '#3a2010');
    // Band titolo: gradiente piatto verso il marrone più scuro
    const bandH = SF(28);
    const bandX = area.x + PIXEL * 4;
    const bandW = area.w - PIXEL * 8;
    const bandY = area.y + PIXEL * 4;
    ctx.fillStyle = '#120a04';   // ancora più scuro per la band
    ctx.fillRect(bandX, bandY, bandW, bandH);
    // Sottolineatura oro brillante sotto il titolo (mezzaluna decorativa)
    ctx.fillStyle = '#e8c050';
    ctx.fillRect(bandX, bandY + bandH - PIXEL, bandW, PIXEL);
    // Sottolineatura rossa accento (1 blocco sotto l'oro)
    ctx.fillStyle = '#8a1010';
    ctx.fillRect(bandX, bandY + bandH, bandW, PIXEL);
    // Titolo: oro brillante
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.heading();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, area.x + PIXEL * 10, bandY + bandH / 2);
    // Decorazione: rombo oro a destra del titolo
    const dx = area.x + area.w - PIXEL * 12;
    const dy = bandY + bandH / 2;
    ctx.fillStyle = '#e8c050';
    ctx.fillRect(dx, dy - PIXEL, PIXEL, PIXEL);
    ctx.fillRect(dx - PIXEL, dy, PIXEL * 3, PIXEL);
    ctx.fillRect(dx, dy + PIXEL, PIXEL, PIXEL);
  },

  drawTopBar(area, compact) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.fillRect(area.x, area.y + area.h - PIXEL, area.w, PIXEL);

    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = compact ? FONT.title() : FONT.display();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KNIGHT DAWN', SF(compact ? 12 : 18), area.h / 2);

    ctx.fillStyle = '#e8d8b0';
    ctx.textAlign = 'right';
    if (compact) {
      ctx.font = FONT.body();
      ctx.fillText(Calendar.formatCompatto(), area.w - SF(12), area.h / 2 - SF(10));
      ctx.fillText(`${Calendar.nomeStagione()} · ${this.meta.meteo}`, area.w - SF(12), area.h / 2 + SF(10));
    } else {
      ctx.font = FONT.body();
      ctx.fillText(Calendar.formatCompatto(), area.w - SF(18), area.h / 2 - SF(12));
      ctx.fillText(`${Calendar.nomeStagione()}  ·  ${this.meta.meteo}  ·  Destinazione: ${this.meta.destinazione}`, area.w - SF(18), area.h / 2 + SF(12));
      drawCompassRose(ctx, area.x + area.w / 2, area.y + area.h / 2, SF(26));
    }
  },

  // Barra superiore desktop: tre segmenti — titolo a sx, strip riassunto al
  // centro (sempre visibile a prescindere dalla tab attiva nella sidebar),
  // meta del calendario/meteo/destinazione a dx.
  drawTopBarSplit(left, right) {
    const ctx = this.ctx;
    this._drawBarSeg(left);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = FONT.display();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KNIGHT DAWN', left.x + SF(18), left.y + left.h / 2);

    this._drawBarSeg(right);
    const rx = right.x + right.w - SF(14);
    const ry = right.y + right.h / 2;
    ctx.fillStyle = '#e8d8b0';
    ctx.font = FONT.body();
    ctx.textAlign = 'right';
    ctx.fillText(Calendar.formatCompatto(), rx, ry - SF(18));
    ctx.fillText(`${Calendar.nomeStagione()}  ·  ${this.meta.meteo}`, rx, ry);
    ctx.fillText(`Destinazione: ${this.meta.destinazione}`, rx, ry + SF(18));

    // Strip riassunto attributi nel centro del topbar
    const cx0 = left.x + left.w;
    const cx1 = right.x;
    const cy0 = left.y;
    const ch  = left.h;
    if (cx1 - cx0 > SF(280)) {
      // Banda di sfondo dietro lo strip
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.fillRect(cx0, cy0, cx1 - cx0, ch);
      ctx.fillStyle = PALETTE.hudTitolo;
      ctx.fillRect(cx0, cy0 + ch - PIXEL, cx1 - cx0, PIXEL);

      // Centra lo strip nella fascia disponibile (con margini interni)
      const stripPad = SF(20);
      const stripW = Math.min(cx1 - cx0 - stripPad * 2, SF(540));
      const stripX = Math.floor(cx0 + (cx1 - cx0 - stripW) / 2);
      const cellH = SF(40);
      const stripY = Math.floor(cy0 + (ch - cellH) / 2);
      this.drawKnightStatStrip(stripX, stripY, stripW, cellH);
    }
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
    const labelW = SF(80);
    const rowH = SF(26);

    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.fillText('LUOGO', area.x, y + SF(2));
    ctx.fillStyle = '#e8d8b0';
    ctx.font = FONT.value();
    ctx.fillText('Pianura, Marche di Vorn', area.x + labelW, y);
    y += rowH;

    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.fillText('META', area.x, y + SF(2));
    ctx.fillStyle = '#e8d8b0';
    ctx.font = FONT.value();
    ctx.fillText(this.meta.destinazione, area.x + labelW, y);
    y += rowH;

    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.fillText('ULTIMO', area.x, y + SF(2));
    // L'ultimo evento è evidenziato in arancio caldo (richiamo cronaca)
    ctx.fillStyle = '#ffa040';
    ctx.font = FONT.valueI();
    const maxW = area.w - labelW;
    let s = last;
    while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    if (s.length < last.length) s += '…';
    ctx.fillText(s, area.x + labelW, y);
    y += rowH;

    // Controllo velocità viaggio: [-] [◀◀  1.5 s  ▶▶] [+]
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.fillText('VELOCITÀ', area.x, y + SF(2));

    const btnW = SF(22), btnH = SF(20);
    const vx = area.x + labelW;
    const btnY = y + SF(3);
    const sec = Travel.speedSec();
    const secTxt = sec < 1 ? (sec * 1000 | 0) + ' ms' : sec + ' s';

    // Bottone [-]
    const r1 = { x: vx, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = Travel.speedIdx > 0 ? '#4a3820' : '#2a2010';
    ctx.fillRect(r1.x, r1.y, r1.w, r1.h);
    ctx.fillStyle = Travel.speedIdx > 0 ? '#e8c050' : '#5a5040';
    ctx.font = FONT.button();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−', r1.x + r1.w / 2, r1.y + r1.h / 2);

    // Valore centrale
    const valX = vx + btnW + SF(4);
    const valW = SF(60);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = FONT.value();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(secTxt + '/passo', valX, y);

    // Bottone [+]
    const maxIdx = Travel.SPEED_PRESETS.length - 1;
    const r2 = { x: valX + valW, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = Travel.speedIdx < maxIdx ? '#4a3820' : '#2a2010';
    ctx.fillRect(r2.x, r2.y, r2.w, r2.h);
    ctx.fillStyle = Travel.speedIdx < maxIdx ? '#e8c050' : '#5a5040';
    ctx.font = FONT.button();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', r2.x + r2.w / 2, r2.y + r2.h / 2);

    this._speedBtnMinus = r1;
    this._speedBtnPlus  = r2;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  // Pannello STATO CAVALIERE: nome+titolo in alto, tab bar con icone, poi
  // il contenuto della tab attiva (PROFILO/EQUIP/FAZIONI/DIARIO). Una sola
  // sezione alla volta = font generosi, nessun affollamento, ogni info ha
  // il suo posto.
  drawKnightStatus(area) {
    const ctx = this.ctx;
    const k = this.knight;
    const innerX = area.x + PIXEL * 8;
    const innerW = area.w - PIXEL * 16;
    let y = area.y + PIXEL * 4 + SF(26) + SF(12);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Nome + titolo: header su sfondo scuro → crema e oro vivo
    ctx.fillStyle = '#f0e0b8';   // crema chiara, alta leggibilità
    ctx.font = FONT.title();
    ctx.fillText(k.nome, innerX, y);
    y += LINEH.title();
    ctx.fillStyle = '#e8a838';   // oro vivo per il titolo cavalleresco
    ctx.font = FONT.valueI();
    ctx.fillText(k.titolo, innerX, y);
    y += SF(28);

    // (strip riassunto attributi: spostata nel topbar globale, vedi
    // drawTopBarSplit / drawTopBar — sempre visibile a prescindere dalla
    // scena/tab attiva)

    // Tab bar orizzontale (4 icone con label sotto)
    y = this.drawKnightTabs(area, innerX, y, innerW);
    y += SF(14);

    // Contenuto della tab attiva
    const contentArea = { x: innerX, y, w: innerW, h: area.y + area.h - y - PIXEL * 8 };
    switch (this.knightTab) {
      case 'profilo': this.drawTabProfilo(contentArea); break;
      case 'equip':   this.drawTabEquip(contentArea);   break;
      case 'reput':   this.drawTabReput(contentArea);   break;
      case 'diario':  this.drawTabDiario(contentArea);  break;
    }
  },

  // Disegna la tab bar e popola this.knightTabRects per hit-test.
  // Ogni tab: icona al centro + label sotto. Stato attivo evidenziato.
  drawKnightTabs(area, innerX, y, innerW) {
    const ctx = this.ctx;
    const n = this.knightTabs.length;
    const gap = SF(4);
    const tabW = Math.floor((innerW - gap * (n - 1)) / n);
    const tabH = SF(72);          // più alta per ospitare icone e label grandi
    const iconSize = SF(38);      // icone visibilmente più grandi (era 22)
    const labelSize = SF(13);     // label più grande (era 10) + bold sempre

    this.knightTabRects = [];
    this.knightTabs.forEach((t, i) => {
      const tx = innerX + i * (tabW + gap);
      const rect = { x: tx, y, w: tabW, h: tabH, key: t.key };
      this.knightTabRects.push(rect);

      const active = this.knightTab === t.key;
      const hovered = this.hoverKnightTab === i;

      // Sfondo: attiva = bronzo caldo (tab "illuminata"), inattiva = molto
      // scura; hover una via di mezzo.
      ctx.fillStyle = active ? '#5a3018'
                             : (hovered ? '#3a2010' : '#120a04');
      ctx.fillRect(tx, y, tabW, tabH);
      // Bordo doppio per la tab attiva, semplice per le altre
      drawPixelRectStroke(ctx, tx, y, tabW, tabH,
        active ? '#e8c050' : '#3a2010');
      if (active) {
        drawPixelRectStroke(ctx, tx + PIXEL, y + PIXEL, tabW - PIXEL * 2, tabH - PIXEL * 2,
          '#8a6030');
      }

      // Icona centrata orizzontalmente, posizionata leggermente più in alto
      // per lasciare spazio alla label grande sotto.
      const iconX = tx + Math.floor((tabW - iconSize) / 2);
      const iconY = y + SF(6);
      drawTabIcon(ctx, t.key, iconX, iconY, iconSize);

      // Label: sempre bold per peso visivo, attiva in crema viva, inattiva
      // in oro spento. Posizione sotto l'icona.
      ctx.fillStyle = active ? '#f0e0b8' : '#a08038';
      ctx.font = FONT.button();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.label, tx + tabW / 2, y + tabH - SF(12));
    });
    return y + tabH;
  },

  // Riepilogo permanente delle 4 caratteristiche del cavaliere. Disegnata
  // nella fascia centrale del topbar (desktop) o in una banda dedicata sotto
  // il topbar (compact), così è sempre visibile a prescindere dalla scena/
  // tab attiva. Ogni pillola: abbreviazione + valore con colore semantico.
  // cellHOpt opzionale: se omesso usa il default.
  drawKnightStatStrip(x, y, w, cellHOpt) {
    const ctx = this.ctx;
    const k = this.knight;
    const items = [
      { abbr: 'FOR', cur: k.forza.cur,   max: k.forza.max },
      { abbr: 'VOL', cur: k.volonta.cur, max: k.volonta.max },
      { abbr: 'SAL', cur: k.salute.cur,  max: k.salute.max },
      { abbr: 'ONO', cur: k.onore,       max: 5, signed: true },
    ];
    const n = items.length;
    const gap = SF(6);
    const cellW = Math.floor((w - gap * (n - 1)) / n);
    const cellH = cellHOpt || SF(34);
    const abbrFs = Math.max(12, Math.floor(cellH * 0.36));
    const valFs  = Math.max(14, Math.floor(cellH * 0.50));

    ctx.textBaseline = 'middle';
    items.forEach((it, i) => {
      const cx = x + i * (cellW + gap);
      // Sfondo: marrone leggermente più chiaro del pannello per separare
      ctx.fillStyle = '#2a1808';
      ctx.fillRect(cx, y, cellW, cellH);
      drawPixelRectStroke(ctx, cx, y, cellW, cellH, '#8a6030');

      // Colore semantico in base al livello
      let color;
      if (it.signed) {
        color = it.cur >= 3 ? '#6ce06a'
              : it.cur >= 1 ? '#a8e878'
              : it.cur === 0 ? '#e8d8b0'
              : it.cur >= -2 ? '#ffa040'
              :                '#ff5050';
      } else {
        const pct = it.max > 0 ? it.cur / it.max : 0;
        color = pct >= 0.8 ? '#6ce06a'
              : pct >= 0.6 ? '#a8e878'
              : pct >= 0.4 ? '#e8c050'
              : pct >= 0.2 ? '#ffa040'
              :              '#ff5050';
      }

      // Etichetta abbreviata a sinistra (oro brillante)
      ctx.fillStyle = '#e8c050';
      ctx.font = `bold ${abbrFs}px "Courier New", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(it.abbr, cx + SF(8), y + cellH / 2);

      // Valore a destra, grande e colorato per livello
      const valText = it.signed
        ? (it.cur > 0 ? '+' + it.cur : String(it.cur))
        : String(Math.ceil(it.cur));
      ctx.fillStyle = color;
      ctx.font = `bold ${valFs}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(valText, cx + cellW - SF(8), y + cellH / 2);
    });
    return y + cellH;
  },

  // PROFILO: 4 attributi (Forza/Volontà/Salute/Onore) con barre grandi.
  drawTabProfilo(area) {
    const ctx = this.ctx;
    const k = this.knight;
    let y = area.y;
    const x = area.x;
    const w = area.w;

    this.drawAttrBar(x, y, w, 'FORZA',   k.forza,   '#2a7a1a', '#3a9a22'); y += SF(40);
    this.drawAttrBar(x, y, w, 'VOLONTÀ', k.volonta, '#4a3ab0', '#6050c8'); y += SF(40);
    this.drawAttrBar(x, y, w, 'SALUTE',  k.salute,  '#aa2020', '#cc2828'); y += SF(40);
    this.drawOnore(x, y, w, k.onore); y += SF(48);

    // Riepilogo: ORO e STATO con label oro e valori vivaci sullo scuro
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ORO', x, y);
    ctx.fillStyle = '#ffd060';   // oro brillante per le monete
    ctx.font = FONT.value();
    ctx.textAlign = 'right';
    ctx.fillText(`◉ ${k.oro} mo`, x + w, y);
    y += SF(22);

    // Stato sintetico: colori vivaci su scuro
    const isDead = k.isDead(), isExh = k.isExhausted(), isBrk = k.isBroken();
    const isWounded = k.salute.cur < k.salute.max * 0.4;
    const isTired = k.forza.cur < k.forza.max * 0.3;
    const stato = isDead ? 'MORTO'
                : isExh  ? 'Esausto'
                : isBrk  ? 'Spezzato nello spirito'
                : isWounded ? 'Gravemente ferito'
                : isTired   ? 'Stanco'
                :             'In forze';
    const statoColor = (isDead || isWounded) ? '#ff5050'   // rosso brillante
                     : (isExh || isTired || isBrk) ? '#ffa030'  // arancio
                     :                                 '#6ce06a'; // verde brillante
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.textAlign = 'left';
    ctx.fillText('STATO', x, y);
    ctx.fillStyle = statoColor;
    ctx.font = FONT.valueI();
    ctx.textAlign = 'right';
    ctx.fillText(stato, x + w, y);
  },

  // EQUIP: 5 slot di equipaggiamento, ognuno con etichetta a sinistra e
  // contenuto a destra, font generoso.
  drawTabEquip(area) {
    const ctx = this.ctx;
    const k = this.knight;
    const x = area.x;
    const w = area.w;
    let y = area.y;

    // Slot: ogni slot ha un colore "araldico" del simbolo, con etichetta nera
    // e valore in marrone scuro. Sfondo riga = banda pergamena macchia, ben
    // contrastata col testo dark.
    const slots = [
      ['arma',     'Arma',     '⚔', '#8a1010'],   // rosso bandiera
      ['armatura', 'Armatura', '◇', '#3a5a80'],   // blu acciaio
      ['scudo',    'Scudo',    '◈', '#1a6a14'],   // verde araldico
      ['speciale', 'Speciale', '✦', '#7030a0'],   // viola arcano
      ['viaggio',  'Viaggio',  '◊', '#6a3a18'],   // marrone cuoio
    ];
    const rowH = SF(30);
    ctx.textBaseline = 'middle';
    for (const [slot, label, glyph, accent] of slots) {
      const val = k.equip[slot];

      // Riga: marrone leggermente piu chiaro del fondo pannello (#1e1008)
      // per evidenziare la riga senza spezzare il tema scuro.
      ctx.fillStyle = '#2a1808';
      ctx.fillRect(x, y, w, rowH - SF(2));
      // bordo sottile a sinistra colorato (accento araldico)
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, SF(3), rowH - SF(2));

      const cy = y + (rowH - SF(2)) / 2;

      // Glyph araldico colorato (brillante su scuro)
      ctx.fillStyle = accent;
      ctx.font = FONT.heading();   // glyph araldico: heading per dargli peso
      ctx.textAlign = 'left';
      ctx.fillText(glyph, x + SF(10), cy);

      // Label: oro brillante (token label)
      ctx.fillStyle = '#e8c050';
      ctx.font = FONT.label();
      ctx.fillText(label.toUpperCase(), x + SF(28), cy);

      // Valore: crema se presente, oro spento italic se vuoto
      ctx.fillStyle = val ? '#e8d8b0' : '#7a5a2a';
      ctx.font = val ? FONT.body() : FONT.bodyI();
      ctx.textAlign = 'right';
      ctx.fillText(val || '— vuoto —', x + w - SF(8), cy);

      y += rowH;
    }

    y += SF(14);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.textAlign = 'left';
    ctx.fillText('CAPIENZA SACCA', x, y);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = FONT.value();
    ctx.textAlign = 'right';
    ctx.fillText('3 / 8 oggetti', x + w, y);
  },

  // FAZIONI: ognuna su una riga con la sua barra -5/+5 ben visibile.
  drawTabReput(area) {
    const ctx = this.ctx;
    const k = this.knight;
    const x = area.x;
    const w = area.w;
    let y = area.y;

    const rowH = SF(46);
    for (const r of k.reputazione) {
      // Etichetta nome in oro brillante
      ctx.fillStyle = '#e8c050';
      ctx.font = FONT.label();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(r.nome, x, y);

      // Valore numerico in verde/rosso brillanti su scuro
      const sign = r.val > 0 ? '+' : '';
      ctx.fillStyle = r.val > 0 ? '#6ce06a' : (r.val < 0 ? '#ff5050' : '#e8d8b0');
      ctx.font = FONT.value();
      ctx.textAlign = 'right';
      ctx.fillText(sign + r.val, x + w, y);

      // Mini-barra orizzontale a 11 segmenti (-5..+5)
      const barY = y + SF(20), barH = SF(11);
      const segN = 11, gap = PIXEL;
      const segW = Math.floor((w - gap * (segN - 1)) / segN);
      for (let i = 0; i < segN; i++) {
        const segVal = i - 5;
        const bx = x + i * (segW + gap);
        ctx.fillStyle = '#0e0804';
        ctx.fillRect(bx, barY, segW, barH);
        const active = (r.val > 0 && segVal > 0 && segVal <= r.val) ||
                       (r.val < 0 && segVal < 0 && segVal >= r.val);
        if (active) {
          ctx.fillStyle = r.val > 0 ? '#2a7a1a' : '#aa2020';
          ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, barH - PIXEL * 2);
          ctx.fillStyle = r.val > 0 ? '#3a9a22' : '#cc2828';
          ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, PIXEL);
        }
        // Bordo: oro per il segmento zero, scuro per gli altri
        drawPixelRectStroke(ctx, bx, barY, segW, barH,
          segVal === 0 ? '#e8c050' : PALETTE.inkScuro);
      }
      y += rowH;
    }
  },

  // DIARIO: gli ultimi eventi personali del cavaliere, word-wrappati.
  // Per ora condivide la stessa fonte di cronaca eventi (this.log) ma con
  // formattazione differente (timeline, etichetta turno futuro).
  drawTabDiario(area) {
    const ctx = this.ctx;
    const x = area.x;
    const w = area.w;
    let y = area.y;

    ctx.fillStyle = '#e8c050';   // oro brillante
    ctx.font = FONT.heading();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ULTIMI AVVENIMENTI', x, y);
    // sottolineatura decorativa rossa
    ctx.fillStyle = '#ff5050';
    ctx.fillRect(x, y + SF(18), SF(80), PIXEL);
    y += LINEH.heading();

    const fs = SFmin(18);
    ctx.font = FONT.body();
    const lineH = LINEH.body();
    const recent = this.log.slice().reverse();
    const maxBottom = area.y + area.h - SF(8);

    // Scala di colori su SCURO: rosso brillante per il piu recente, crema /
    // oro spento / bruno a degradare per i piu vecchi.
    for (let i = 0; i < recent.length && y < maxBottom; i++) {
      const lines = wrapText(ctx, recent[i], w - SF(14));
      const color = i === 0 ? '#ff5050'      // appena accaduto
                  : i < 3   ? '#f0e0b8'      // recenti: crema
                  : i < 6   ? '#c8a878'      // vecchi: oro spento
                  :           '#7a5a2a';     // molto vecchi: bruno
      // bullet rosso per il piu recente, oro spento per gli altri
      ctx.fillStyle = i === 0 ? '#ff5050' : '#a08038';
      ctx.fillRect(x, y + Math.floor(fs / 2) - PIXEL, PIXEL * 2, PIXEL * 2);
      ctx.fillStyle = color;
      ctx.font = i === 0 ? FONT.bodyB() : FONT.body();
      for (let j = 0; j < lines.length; j++) {
        if (y >= maxBottom) break;
        ctx.fillText(lines[j], x + SF(12), y);
        y += lineH;
      }
      y += SF(4); // separatore fra eventi
    }
  },

  drawAttrBar(x, y, w, label, value, color, colorHi) {
    const ctx = this.ctx;
    // Label: oro brillante su scuro
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    // Numeri: crema chiara
    ctx.fillStyle = '#f0e0b8';
    ctx.font = FONT.value();
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(value.cur)}/${value.max}`, x + w, y);
    const barY = y + SF(16), barH = SF(11);
    // Scocca della barra: nero più scuro del pannello, bordo oro spento
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, barY, w, barH);
    drawPixelRectStroke(this.ctx, x, barY, w, barH, '#5a3a18');
    const fillW = Math.floor((w - PIXEL * 2) * value.cur / value.max);
    ctx.fillStyle = color;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, barH - PIXEL * 2);
    ctx.fillStyle = colorHi;
    ctx.fillRect(x + PIXEL, barY + PIXEL, fillW, PIXEL);
  },

  // Onore: scala -5/+5, barra centrata.
  drawOnore(x, y, w, val) {
    const ctx = this.ctx;
    ctx.fillStyle = '#e8c050';
    ctx.font = FONT.label();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ONORE', x, y);

    const sign = val > 0 ? '+' : '';
    // Verde/rosso brillanti sul fondo scuro
    ctx.fillStyle = val > 0 ? '#6ce06a' : val < 0 ? '#e83838' : '#f0e0b8';
    ctx.font = FONT.value();
    ctx.textAlign = 'right';
    ctx.fillText(sign + val + ' / ±5', x + w, y);

    // Barra centrata: 11 segmenti, il centrale è lo zero.
    const barY = y + SF(14), barH = SF(10);
    const segN = 11, gap = PIXEL;
    const segW = Math.floor((w - gap * (segN - 1)) / segN);
    for (let i = 0; i < segN; i++) {
      const segVal = i - 5;
      const bx = x + i * (segW + gap);
      ctx.fillStyle = '#000000';
      ctx.fillRect(bx, barY, segW, barH);
      const active = (val > 0 && segVal > 0 && segVal <= val) ||
                     (val < 0 && segVal < 0 && segVal >= val);
      if (active) {
        ctx.fillStyle = val > 0 ? '#3a9a22' : '#cc2828';
        ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, barH - PIXEL * 2);
        ctx.fillStyle = val > 0 ? '#6ce06a' : '#ff5050';
        ctx.fillRect(bx + PIXEL, barY + PIXEL, segW - PIXEL * 2, PIXEL);
      }
      drawPixelRectStroke(ctx, bx, barY, segW, barH,
        segVal === 0 ? '#e8c050' : '#5a3a18');
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
      // Titolo sezione: oro brillante su scuro
      ctx.fillStyle = '#e8c050';
      ctx.font = FONT.heading();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, x, y); y += LINEH.heading();
      // Corpo: crema chiara
      ctx.fillStyle = '#e8d8b0';
      ctx.font = FONT.body();
      const lines = Array.isArray(body) ? body : [body];
      for (const line of lines) { ctx.fillText(line, x, y); y += LINEH.body(); }
      y += SF(12);
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

  // CRONACA EVENTI: log scorrevole dal più recente al più vecchio.
  // Word-wrap automatico sulla larghezza del pannello, font generoso,
  // colori sfumati per anzianità. Disegnato dal basso verso l'alto
  // (riga più recente in alto, riga più vecchia in basso).
  drawLog(area, bottomY) {
    const ctx = this.ctx;
    const innerPad = SF(12);
    const x = area.x + innerPad;
    const w = area.w - innerPad * 2;
    const yStart = area.y + PIXEL * 4 + SF(26) + SF(8);
    const logBottom = bottomY - PIXEL * 2;

    // Cronaca eventi: testo body standard (token FONT.body) per leggibilità
    const fs = SFmin(18);
    ctx.font = FONT.body();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineH = LINEH.body();
    const eventGap = SF(7);

    // Scala di colori su sfondo SCURO: rosso brillante per l'evento appena
    // accaduto, poi crema viva, e oro spento a degradare per gli eventi
    // vecchi. Tutti scelti per restare leggibili sul fondo cuoio inchiostrato.
    const colors = [
      '#ff5050',   // appena accaduto: rosso brillante
      '#f0e0b8',   // recenti: crema chiara
      '#e8d8b0',
      '#c8a878',   // mezzo-vecchio: oro spento
      '#c8a878',
      '#8a7048',   // vecchio: bruno chiaro
      '#7a5a2a',   // molto vecchio: bruno spento
    ];
    const indentX = SF(14);
    const wrapW = w - indentX;
    const recent = this.log.slice().reverse();
    const lines = []; // {text, color, isFirst}
    let used = 0;
    for (let i = 0; i < recent.length; i++) {
      const color = colors[Math.min(i, colors.length - 1)];
      const ws = wrapText(ctx, recent[i], wrapW);
      const blockH = ws.length * lineH + eventGap;
      if (used + blockH > (logBottom - yStart) && lines.length > 0) break;
      for (let j = 0; j < ws.length; j++) {
        lines.push({ text: ws[j], color, isFirst: j === 0 });
      }
      lines.push({ separator: true });
      used += blockH;
    }

    let y = yStart;
    for (const ln of lines) {
      if (ln.separator) { y += eventGap; continue; }
      if (y + lineH > logBottom) break;
      if (ln.isFirst) {
        // bullet: rosso brillante se è l'evento appena accaduto, oro spento
        // per gli altri (entrambi ben visibili sul fondo scuro).
        const bulletCol = ln.color === '#ff5050' ? '#ff5050' : '#a08038';
        ctx.fillStyle = bulletCol;
        ctx.fillRect(x, y + Math.floor(fs / 2) - PIXEL, PIXEL * 3, PIXEL * 2);
      }
      ctx.fillStyle = ln.color;
      // Bold solo per la riga piu recente per dare gerarchia
      const isMostRecent = ln.color === '#ff5050';
      ctx.font = isMostRecent ? FONT.bodyB() : FONT.body();
      ctx.fillText(ln.text, x + indentX, y);
      y += lineH;
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

      // Nebbia di guerra sulla minimappa.
      if (World.fog) {
        const WW = World.width, WH = World.height;
        const fw = Math.floor(inner.w), fh = Math.floor(inner.h);
        const fc = document.createElement('canvas');
        fc.width = fw; fc.height = fh;
        const fctx = fc.getContext('2d');
        const id = fctx.createImageData(fw, fh);
        const d = id.data;
        for (let py = 0; py < fh; py++) {
          const ty = Math.min(WH - 1, Math.floor(py / fh * WH));
          for (let px = 0; px < fw; px++) {
            const tx = Math.min(WW - 1, Math.floor(px / fw * WW));
            if (!World.fog[ty * WW + tx]) {
              const i = (py * fw + px) * 4;
              d[i] = 10; d[i + 1] = 6; d[i + 2] = 2; d[i + 3] = 224;
            }
          }
        }
        fctx.putImageData(id, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fc, inner.x, inner.y);
      }

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
    ctx.font = FONT.caption();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Sei qui · Marche di Vorn', area.x + area.w / 2, area.y + area.h - SF(8));
  },
};
