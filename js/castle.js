// Knight Dawn — Vista luoghi (Livello 1): cortile del castello
// Variante "piantina cliccabile" (docs/GRAFICA.md §2b), DISEGNATA DENTRO IL
// PANNELLO MAPPA (non a tutto schermo): le sidebar dell'HUD restano visibili.
// Vista dall'alto pixel-art: mura con torri angolari e porta, terreno erboso
// fuori, cortile lastricato dentro, edifici distinti con emblemi. Niente
// camminata: cliccando un edificio si apre la sua Carta del cronista (Livello
// 2). Le logiche stanno in js/data/events_veglia.js (veglia.<id>).

const CastleView = {
  active: false,
  buildings: [],        // { ...DEF, cx, cy, rect }
  rect: null,           // pannello in cui è disegnato (area mappa)
  inner: null,          // cortile interno (dentro le mura)
  wallT: 0,
  marker: { x: 0, y: 0 },
  hover: -1,
  pressed: -1,

  // Disposizione (fx,fy in [0,1] del cortile interno) + stile per edificio.
  DEFS: [
    { id: 'cappella',  label: 'Cappella',    eventId: 'veglia.cappella',  fx: 0.50, fy: 0.18, roof: '#b6b6c0', emblem: 'croce' },
    { id: 'stalla',    label: 'Stalla',      eventId: 'veglia.stalla',    fx: 0.16, fy: 0.34, roof: '#7a4a22', emblem: 'ferro' },
    { id: 'taverna',   label: 'Taverna',     eventId: 'veglia.taverna',   fx: 0.84, fy: 0.34, roof: '#a8662c', emblem: 'boccale' },
    { id: 'saladarmi', label: "Sala d'armi", eventId: 'veglia.saladarmi', fx: 0.16, fy: 0.66, roof: '#8a3422', emblem: 'spade' },
    { id: 'mercato',   label: 'Armeria',     eventId: 'veglia.mercato',   fx: 0.84, fy: 0.66, roof: '#9a7a30', emblem: 'moneta' },
    { id: 'cortile',   label: 'Cortile',     eventId: 'veglia.cortile',   fx: 0.50, fy: 0.50, kind: 'pozzo' },
    { id: 'portale',   label: 'Portale',     eventId: 'veglia.portale',   fx: 0.50, fy: 0.95, kind: 'gate' },
  ],

  open() {
    this.active = true;
    this.buildings = [];   // posizionati al primo draw, quando si conosce il rect
    this.hover = -1;
    this.pressed = -1;
    window.GameRender.invalidate();
  },

  close() {
    if (!this.active) return;
    this.active = false;
    window.GameRender.invalidate();
  },

  _layout(rect) {
    this.rect = rect;
    const wall = Math.max(SF(8), Math.min(rect.w, rect.h) * 0.05);
    this.wallT = wall;
    // Cortile interno: dentro le mura, con un margine.
    const pad = wall * 2.0;
    this.inner = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2 };
    const inW = this.inner.w, inH = this.inner.h;
    const bw = Math.max(SF(34), Math.min(SF(86), inW * 0.18));
    const bh = Math.max(SF(26), Math.min(SF(56), inH * 0.20));
    this.buildings = this.DEFS.map(d => {
      const cx = this.inner.x + d.fx * inW;
      const cy = this.inner.y + d.fy * inH;
      return { ...d, cx, cy, rect: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
    });
    this.marker = { x: this.inner.x + inW * 0.5, y: this.inner.y + inH * 0.64 };
  },

  // ─── Input ────────────────────────────────────────────────────────────────
  _hit(p) {
    for (let i = 0; i < this.buildings.length; i++) {
      const r = this.buildings[i].rect;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h + SF(18)) return i;
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
    if (fire) this._enter(this.buildings[i]);
    else window.GameRender.invalidate();
  },

  onPointerCancel() {
    this.pressed = -1;
    this.hover = -1;
  },

  update() {},   // vista statica, nessuna camminata

  _enter(b) {
    if (!b || typeof Events === 'undefined' || typeof GameScreen === 'undefined') return;
    const ev = Events.getById(b.eventId);
    if (ev && GameScreen.openChronicle) GameScreen.openChronicle(ev, { resumeAfter: false });
  },

  // ─── Disegno (dentro rect = pannello mappa) ─────────────────────────────────
  draw(ctx, rect) {
    if (!this.active) return;
    rect = rect || { x: 0, y: 0, w: window.UI.w, h: window.UI.h };
    this._layout(rect);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    this._drawGround(ctx, rect);
    this._drawWalls(ctx, rect);
    for (let i = 0; i < this.buildings.length; i++) {
      this._drawBuilding(ctx, this.buildings[i], i === this.hover || i === this.pressed);
    }
    this._drawMarker(ctx);
    this._drawHeader(ctx, rect);

    ctx.restore();
    drawCartographicBorder(ctx, rect.x, rect.y, rect.w, rect.h);
  },

  // Terreno: erba fuori, cortile lastricato dentro le mura, sentiero alla porta.
  _drawGround(ctx, r) {
    ctx.fillStyle = '#6f7e3e';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // chiazze d'erba (deterministiche, niente Math.random per stabilità frame)
    let s = 0x1a2b3c;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const px = Math.max(2, SF(3));
    ctx.fillStyle = '#62702f';
    for (let i = 0; i < 260; i++) {
      ctx.fillRect((r.x + rnd() * r.w) | 0, (r.y + rnd() * r.h) | 0, px, px);
    }
    ctx.fillStyle = '#7c8c48';
    for (let i = 0; i < 120; i++) {
      ctx.fillRect((r.x + rnd() * r.w) | 0, (r.y + rnd() * r.h) | 0, px, px);
    }
    // Cortile lastricato (dentro le mura).
    const t = this.wallT;
    const cx = r.x + t, cy = r.y + t, cw = r.w - t * 2, chh = r.h - t * 2;
    ctx.fillStyle = '#c8b387';
    ctx.fillRect(cx, cy, cw, chh);
    // venature lastricato
    ctx.fillStyle = '#b9a274';
    for (let i = 0; i < 90; i++) {
      ctx.fillRect((cx + rnd() * cw) | 0, (cy + rnd() * chh) | 0, px, px);
    }
    // Sentiero in terra dalla porta verso il centro.
    const inn = this.inner;
    ctx.fillStyle = '#a98e5e';
    ctx.fillRect(inn.x + inn.w / 2 - SF(10), inn.y + inn.h * 0.5, SF(20), inn.h * 0.5 + t);
  },

  // Mura di cinta + torri angolari + porta a sud.
  _drawWalls(ctx, r) {
    const t = this.wallT;
    const stone = '#9a9286', stoneHi = '#b3ab9d', stoneLo = '#6c655a';
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;

    const seg = (x, y, w, h) => {
      ctx.fillStyle = stone; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = stoneHi; ctx.fillRect(x, y, w, PIXEL);            // luce in alto
      ctx.fillStyle = stoneLo; ctx.fillRect(x, y + h - PIXEL, w, PIXEL); // ombra in basso
    };
    seg(x0, y0, r.w, t);            // nord
    seg(x0, y1 - t, r.w, t);        // sud
    seg(x0, y0, t, r.h);            // ovest
    seg(x1 - t, y0, t, r.h);        // est

    // Porta a sud (varco scuro + battenti).
    const gw = Math.max(SF(28), r.w * 0.14);
    const gx = (x0 + x1) / 2 - gw / 2;
    ctx.fillStyle = '#2e2113';
    ctx.fillRect(gx, y1 - t, gw, t);
    ctx.fillStyle = '#43321c';      // battenti
    ctx.fillRect(gx + PIXEL, y1 - t + PIXEL, gw / 2 - PIXEL * 1.5, t - PIXEL * 2);
    ctx.fillRect(gx + gw / 2 + PIXEL * 0.5, y1 - t + PIXEL, gw / 2 - PIXEL * 1.5, t - PIXEL * 2);

    // Merli sul muro nord.
    ctx.fillStyle = stone;
    const mh = Math.max(PIXEL * 2, t * 0.5), mw = Math.max(SF(5), t * 0.7);
    for (let x = x0 + mw; x < x1 - mw; x += mw * 2) {
      ctx.fillRect(x, y0 - mh, mw, mh);
    }

    // Torri angolari (quadrate, con merli).
    const tw = t * 1.7;
    const towers = [[x0, y0], [x1 - tw, y0], [x0, y1 - tw], [x1 - tw, y1 - tw]];
    for (const [tx, ty] of towers) {
      ctx.fillStyle = stone; ctx.fillRect(tx, ty, tw, tw);
      drawPixelRectStroke(ctx, tx, ty, tw, tw, stoneLo);
      ctx.fillStyle = stoneHi; ctx.fillRect(tx, ty, tw, PIXEL);
      // tetto conico stilizzato
      ctx.fillStyle = '#5a3c6a';
      ctx.beginPath();
      ctx.moveTo(tx - PIXEL, ty);
      ctx.lineTo(tx + tw / 2, ty - tw * 0.5);
      ctx.lineTo(tx + tw + PIXEL, ty);
      ctx.closePath(); ctx.fill();
    }
  },

  _drawBuilding(ctx, b, hot) {
    const r = b.rect;
    if (b.kind === 'gate') {
      // Il portale è già nel muro: qui solo etichetta + evidenza al passaggio.
      if (hot) {
        ctx.fillStyle = 'rgba(255,220,120,0.25)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      this._label(ctx, b, hot);
      return;
    }
    if (b.kind === 'pozzo') {
      // Pozzo al centro del cortile.
      const cx = b.cx, cy = b.cy, rad = Math.min(r.w, r.h) * 0.42;
      ctx.fillStyle = hot ? '#b3ab9d' : '#9a9286';
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = PIXEL * 2; ctx.strokeStyle = '#6c655a'; ctx.stroke();
      ctx.fillStyle = '#241a0e';
      ctx.beginPath(); ctx.arc(cx, cy, rad * 0.55, 0, Math.PI * 2); ctx.fill();
      this._label(ctx, b, hot);
      return;
    }

    // Casa: corpo in pietra + tetto colorato + portone + emblema.
    const roofH = Math.max(SF(10), r.h * 0.42);
    // Corpo
    ctx.fillStyle = hot ? '#a99a76' : '#8f8160';
    ctx.fillRect(r.x, r.y + roofH, r.w, r.h - roofH);
    drawPixelRectStroke(ctx, r.x, r.y + roofH, r.w, r.h - roofH, '#4a3a20');
    // Tetto (trapezio)
    ctx.fillStyle = b.roof || '#6a3a18';
    ctx.beginPath();
    ctx.moveTo(r.x - SF(3), r.y + roofH);
    ctx.lineTo(r.x + r.w * 0.5, r.y);
    ctx.lineTo(r.x + r.w + SF(3), r.y + roofH);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';   // ombra di gronda
    ctx.fillRect(r.x, r.y + roofH - PIXEL, r.w, PIXEL);
    // Portone
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(r.x + r.w / 2 - SF(5), r.y + r.h - SF(12), SF(10), SF(12));
    // Emblema sul corpo
    this._drawEmblem(ctx, b.emblem, r.x + r.w / 2, r.y + roofH + (r.h - roofH) * 0.42, Math.max(SF(7), r.w * 0.16));
    if (hot) { ctx.fillStyle = 'rgba(255,220,120,0.18)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    this._label(ctx, b, hot);
  },

  _label(ctx, b, hot) {
    const r = b.rect;
    ctx.fillStyle = hot ? '#fff2cf' : '#f0e6c8';
    ctx.font = `bold ${SF(12)}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // alone scuro per leggibilità sull'erba
    ctx.save();
    ctx.lineWidth = PIXEL * 2; ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.strokeText(b.label, b.cx, r.y + r.h + SF(3));
    ctx.restore();
    ctx.fillText(b.label, b.cx, r.y + r.h + SF(3));
  },

  // Emblemi disegnati (pixel, no glyph unicode per robustezza font).
  _drawEmblem(ctx, type, x, y, s) {
    if (!type) return;
    const u = Math.max(PIXEL, s / 6);
    ctx.save();
    switch (type) {
      case 'croce':
        ctx.fillStyle = '#f4ead0';
        ctx.fillRect(x - u / 2, y - s * 0.7, u, s * 1.4);
        ctx.fillRect(x - s * 0.55, y - s * 0.25, s * 1.1, u);
        break;
      case 'ferro': // ferro di cavallo (U)
        ctx.strokeStyle = '#2a1c0c'; ctx.lineWidth = Math.max(PIXEL, u);
        ctx.beginPath(); ctx.arc(x, y, s * 0.55, Math.PI * 0.15, Math.PI * 0.85, false);
        ctx.stroke();
        break;
      case 'boccale': // boccale: corpo + manico
        ctx.fillStyle = '#d8c9a0';
        ctx.fillRect(x - s * 0.5, y - s * 0.5, s * 0.8, s);
        ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = Math.max(PIXEL, u);
        ctx.strokeRect(x + s * 0.32, y - s * 0.28, s * 0.32, s * 0.55);
        ctx.fillStyle = '#f1e7c8'; ctx.fillRect(x - s * 0.5, y - s * 0.5, s * 0.8, u); // schiuma
        break;
      case 'spade': // due spade incrociate
        ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = Math.max(PIXEL, u);
        ctx.beginPath();
        ctx.moveTo(x - s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 0.6, y + s * 0.6);
        ctx.moveTo(x + s * 0.6, y - s * 0.6); ctx.lineTo(x - s * 0.6, y + s * 0.6);
        ctx.stroke();
        break;
      case 'moneta': // moneta
        ctx.fillStyle = '#f0c850';
        ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8902a';
        ctx.beginPath(); ctx.arc(x, y, s * 0.26, 0, Math.PI * 2); ctx.fill();
        break;
    }
    ctx.restore();
  },

  _drawMarker(ctx) {
    ctx.fillStyle = (typeof PALETTE !== 'undefined' && PALETTE.cavaliereMarker) || '#cc2020';
    ctx.beginPath();
    ctx.arc(this.marker.x, this.marker.y, SF(6), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = PIXEL; ctx.strokeStyle = '#1a0e04'; ctx.stroke();
  },

  // Targhetta nome castello + giorno di Veglia (in alto a sinistra nel pannello).
  _drawHeader(ctx, r) {
    const name = 'Castello di ' + this._castleName();
    const giorno = (typeof Calendar !== 'undefined') ? Calendar.giornoVeglia : 0;
    const sub = 'Veglia · giorno ' + giorno;
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    const w1 = ctx.measureText(name).width;
    ctx.font = `italic ${SF(11)}px "Courier New", monospace`;
    const w2 = ctx.measureText(sub).width;
    const bw = Math.max(w1, w2) + SF(16), bh = SF(38);
    const bx = r.x + SF(10), by = r.y + SF(10);
    ctx.fillStyle = 'rgba(24,16,6,0.78)';
    ctx.fillRect(bx, by, bw, bh);
    drawPixelRectStroke(ctx, bx, by, bw, bh, '#5a4020');
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#f0e0b0';
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    ctx.fillText(name, bx + SF(8), by + SF(6));
    ctx.fillStyle = '#c8a86a';
    ctx.font = `italic ${SF(11)}px "Courier New", monospace`;
    ctx.fillText(sub, bx + SF(8), by + SF(23));
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
