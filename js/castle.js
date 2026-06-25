// FERRO & CENERE — Vista luoghi (Livello 1): cortile del castello
// Variante "piantina cliccabile" del modello docs/GRAFICA.md §2b "Vista luoghi
// — Layout top-down": vista dall'alto schematica dell'area, edifici CLICCABILI.
// Niente camminata del personaggio (point&click leggero): cliccando un edificio
// si apre subito la sua Carta del cronista (Livello 2). Un marker statico
// "sei qui" indica il cortile.
//
// Usata durante l'Età della Veglia: il garzone gira il cortile e, recandosi
// alle strutture, gli vengono proposti i compiti. Ogni edificio rimanda a un
// evento veglia.<id> (vedi js/data/events_veglia.js); le logiche sono lì, qui
// c'è solo la vista. Disegna a tutto schermo sopra la mappa; le carte
// (chronicle/market/combat) di GameScreen si sovrappongono a questa vista.

const CastleView = {
  active: false,
  buildings: [],        // { id, label, eventId, cx, cy, rect }
  grounds: null,
  marker: { x: 0, y: 0 },
  target: null,         // { x, y } destinazione del marker
  pending: null,        // edificio da aprire all'arrivo
  hover: -1,
  pressed: -1,

  // Disposizione degli edifici nel cortile (posizioni relative fx,fy in [0,1]).
  DEFS: [
    { id: 'cappella',  label: 'Cappella',    eventId: 'veglia.cappella',  fx: 0.50, fy: 0.16 },
    { id: 'stalla',    label: 'Stalla',      eventId: 'veglia.stalla',    fx: 0.17, fy: 0.34 },
    { id: 'taverna',   label: 'Taverna',     eventId: 'veglia.taverna',   fx: 0.83, fy: 0.34 },
    { id: 'cortile',   label: 'Cortile',     eventId: 'veglia.cortile',   fx: 0.50, fy: 0.50 },
    { id: 'saladarmi', label: "Sala d'armi", eventId: 'veglia.saladarmi', fx: 0.17, fy: 0.70 },
    { id: 'mercato',   label: 'Armeria',     eventId: 'veglia.mercato',   fx: 0.83, fy: 0.70 },
    { id: 'portale',   label: 'Portale',     eventId: 'veglia.portale',   fx: 0.50, fy: 0.86 },
  ],

  open() {
    this.active = true;
    this._layout();
    const g = this.grounds;
    this.marker = { x: g.x + g.w / 2, y: g.y + g.h * 0.62 };
    this.target = null;
    this.pending = null;
    this.hover = -1;
    this.pressed = -1;
    window.GameRender.invalidate();
  },

  close() {
    if (!this.active) return;
    this.active = false;
    window.GameRender.invalidate();
  },

  _layout() {
    const W = window.UI.w, H = window.UI.h;
    const m = SF(20);
    const headerH = SF(64);
    this.grounds = { x: m, y: headerH, w: W - m * 2, h: H - headerH - SF(20) };
    const bw = Math.min(SF(104), this.grounds.w * 0.26);
    const bh = Math.min(SF(76), this.grounds.h * 0.22);
    this.buildings = this.DEFS.map(d => {
      const cx = this.grounds.x + d.fx * this.grounds.w;
      const cy = this.grounds.y + d.fy * this.grounds.h;
      return { ...d, cx, cy, rect: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
    });
  },

  // ─── Input ────────────────────────────────────────────────────────────────
  _hit(p) {
    for (let i = 0; i < this.buildings.length; i++) {
      const r = this.buildings[i].rect;
      // Area cliccabile estesa un po' sotto l'edificio (etichetta inclusa).
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h + SF(20)) return i;
    }
    return -1;
  },

  onPointerMove(p, type) {
    if (!this.active) return;
    if (type === 'touch') return;
    const h = this._hit(p);
    document.getElementById('game').style.cursor = h >= 0 ? 'pointer' : 'default';
    if (h !== this.hover) { this.hover = h; window.GameRender.invalidate(); }
  },

  onPointerDown(p) {
    if (!this.active) return;
    this.pressed = this._hit(p);
    if (this.pressed >= 0) { this.hover = this.pressed; window.GameRender.invalidate(); }
  },

  onPointerUp(p, type) {
    if (!this.active) return;
    const i = this._hit(p);
    const fire = i >= 0 && i === this.pressed;
    this.pressed = -1;
    if (type === 'touch') this.hover = -1;
    // Piantina cliccabile (no camminata): il click apre subito la carta.
    if (fire) this._enter(this.buildings[i]);
    else window.GameRender.invalidate();
  },

  onPointerCancel() {
    this.pressed = -1;
    this.hover = -1;
  },

  // Nessun movimento del personaggio: la vista è statica (point&click leggero).
  update() {},

  _enter(b) {
    if (!b || typeof Events === 'undefined' || typeof GameScreen === 'undefined') return;
    const ev = Events.getById(b.eventId);
    if (ev && GameScreen.openChronicle) GameScreen.openChronicle(ev, { resumeAfter: false });
  },

  // ─── Disegno ──────────────────────────────────────────────────────────────
  draw(ctx) {
    if (!this.active) return;
    this._layout();
    const W = window.UI.w, H = window.UI.h;

    // Sfondo pergamena + cornice cartografica (coerente con titolo/mappa).
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, W, H);
    const parch = getParchmentTexture(W, H, 909);
    ctx.drawImage(parch, 0, 0);

    // Header: nome castello + stato Veglia + oro.
    const castName = this._castleName();
    const giorno = (typeof Calendar !== 'undefined') ? Calendar.giornoVeglia : 0;
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `bold ${SF(22)}px "Courier New", monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Castello di ' + castName, SF(22), SF(24));
    ctx.fillStyle = PALETTE.inkMedio;
    ctx.font = `italic ${SF(15)}px "Courier New", monospace`;
    ctx.fillText('Veglia · giorno ' + giorno, SF(22), SF(46));
    if (typeof Knight !== 'undefined') {
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.inkScuro;
      ctx.font = `bold ${SF(16)}px "Courier New", monospace`;
      const tit = Knight.titolo || 'Garzone';
      ctx.fillText('◉ ' + Knight.oro + ' mo   ·   ' + tit, W - SF(22), SF(30));
    }

    // Riquadro cortile.
    const g = this.grounds;
    drawCartographicBorder(ctx, g.x, g.y, g.w, g.h);

    // Edifici.
    for (let i = 0; i < this.buildings.length; i++) {
      this._drawBuilding(ctx, this.buildings[i], i === this.hover || i === this.pressed);
    }

    // Marker garzone (pallino rosso come sulla mappa).
    ctx.fillStyle = PALETTE.cavaliereMarker || '#cc2020';
    ctx.beginPath();
    ctx.arc(this.marker.x, this.marker.y, SF(7), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = PIXEL;
    ctx.strokeStyle = PALETTE.inkNero;
    ctx.stroke();

    // Suggerimento in basso.
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Tocca un edificio del cortile per svolgere un compito.',
      W / 2, H - SF(6));
  },

  _drawBuilding(ctx, b, hot) {
    const r = b.rect;
    const roofH = SF(18);
    // Tetto (triangolo).
    ctx.fillStyle = hot ? '#7a4420' : '#6a3a18';   // marrone-tetto
    ctx.beginPath();
    ctx.moveTo(r.x - SF(4), r.y + roofH);
    ctx.lineTo(r.x + r.w / 2, r.y - SF(6));
    ctx.lineTo(r.x + r.w + SF(4), r.y + roofH);
    ctx.closePath();
    ctx.fill();
    // Corpo.
    ctx.fillStyle = hot ? '#9a8a64' : '#8a7a5a';   // grigio-pietra
    ctx.fillRect(r.x, r.y + roofH, r.w, r.h - roofH);
    drawPixelRectStroke(ctx, r.x, r.y + roofH, r.w, r.h - roofH, PALETTE.inkScuro);
    // Portone.
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(r.x + r.w / 2 - SF(8), r.y + r.h - SF(18), SF(16), SF(18));
    // Etichetta.
    ctx.fillStyle = hot ? PALETTE.inkNero : PALETTE.inkScuro;
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h + SF(4));
  },

  _castleName() {
    if (typeof World !== 'undefined' && World.structures && typeof GameScreen !== 'undefined') {
      const s = World.structures.find(
        st => st.x === GameScreen.knightPos.x && st.y === GameScreen.knightPos.y);
      if (s) return s.name;
    }
    return (typeof World !== 'undefined' && World.regionName) ? World.regionName : 'Vorn';
  },
};
