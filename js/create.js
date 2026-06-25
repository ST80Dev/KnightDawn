// Knight Dawn — Schermata creazione cavaliere
// Passo unico dell'avvio nuova partita: scelta del NOME (editabile o casuale).
// Titolo, equipaggiamento iniziale ed evento di soglia restano alla futura
// fase "Veglia" (vedi docs/GDD.md §3): qui si fissa solo l'identita' del POV.
//
// Stile coerente con TitleScreen (pergamena + bordo cartografico). Disegno
// diretto sul canvas display; input via Pointer Events come le altre scene.
// L'editing del nome usa un <input> DOM nascosto: cattura la tastiera fisica
// su desktop e fa comparire la tastiera virtuale su mobile (focus richiesto
// dentro un gesto utente — il tap sul campo). Il testo viene poi ridisegnato
// in stile sul canvas; il caret lampeggia via update(dt).

const CreateScreen = {
  name: '',
  input: null,          // <input> DOM nascosto (cattura tastiera)
  _focused: false,
  caretOn: true,
  _caretT: 0,

  fieldRect: null,
  buttons: [],          // { label, action, x, y, w, h, disabled }
  hoverIndex: -1,
  pressed: -1,          // indice pulsante premuto, o 'field'
  hoverField: false,
  _fitMaxW: 0,

  // Pool per il generatore casuale. Nome proprio + provenienza/casata.
  // Niente onorifici ("Sir", "Ser"): il titolo emerge in gioco (GDD §2),
  // e all'avvio il cavaliere e' ancora uno scudiero non investito.
  NOMI: [
    'Aldric', 'Corwin', 'Gareth', 'Roland', 'Edric', 'Tristan', 'Bertram',
    'Cedric', 'Lyonel', 'Aymeric', 'Owain', 'Godwin', 'Hadrian', 'Rainald',
    'Ulric', 'Percival', 'Aldous', 'Brennan', 'Cuthbert', 'Edmund',
  ],
  CASATE: [
    'di Vorn', 'di Ashford', 'di Morthane', 'di Valdris', 'di Greymoor',
    'di Blackfen', "dell'Erica", 'di Calanthe', 'di Dunmar', 'di Ravensholt',
    'di Thornwood', 'del Cervo', 'di Marghen', 'di Caldaross',
  ],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._ensureInput();
  },

  // Crea (una sola volta) l'input nascosto usato per l'editing del nome.
  _ensureInput() {
    if (this.input) return;
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 24;
    el.autocomplete = 'off';
    el.autocapitalize = 'words';
    el.spellcheck = false;
    el.setAttribute('aria-label', 'Nome del cavaliere');
    el.setAttribute('enterkeyhint', 'go');
    // Fuori dalla vista ma focusabile: niente display:none (impedirebbe il
    // focus e quindi la tastiera virtuale).
    el.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;' +
      'border:0;padding:0;font-size:16px;';
    el.addEventListener('input', () => {
      const clean = this._sanitize(el.value);
      if (clean !== el.value) el.value = clean;
      this.name = clean;
      window.GameRender.invalidate();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._start(); }
    });
    el.addEventListener('focus', () => {
      this._focused = true; this.caretOn = true; this._caretT = 0;
      window.GameRender.invalidate();
    });
    el.addEventListener('blur', () => {
      this._focused = false; window.GameRender.invalidate();
    });
    document.body.appendChild(el);
    this.input = el;
  },

  // Lettere (anche accentate), spazi singoli, apostrofo e trattino. Max 24.
  _sanitize(v) {
    return String(v)
      .replace(/[^\p{L} '\-]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s+/, '')
      .slice(0, 24);
  },

  _randomName() {
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    let n;
    do {
      n = pick(this.NOMI) + ' ' + pick(this.CASATE);
    } while (n === this.name);
    return n;
  },

  onEnter() {
    this._ensureInput();
    // Pre-compila con un nome casuale: il campo non e' mai vuoto e la
    // funzione "casuale" e' subito evidente. Resta del tutto sovrascrivibile.
    this.name = this._randomName();
    this.input.value = this.name;
    this._focused = false;
    this.caretOn = true;
    this._caretT = 0;
    this.hoverIndex = -1;
    this.pressed = -1;
    this.hoverField = false;
    window.GameRender.invalidate();
  },

  _leave(to) {
    if (this.input) this.input.blur();
    Scenes.switchTo(to);
  },

  _start() {
    const nome = (this.name || '').trim();
    if (!nome) return;                // INIZIA disabilitato se vuoto
    if (this.input) this.input.blur();
    GameScreen._newName = nome;       // letto da GameScreen.onEnter (nuova partita)
    GameScreen._resume = false;
    Scenes.switchTo('game');
  },

  // ─── Caret lampeggiante ────────────────────────────────────────────────
  update(dt) {
    if (!this._focused) return;
    this._caretT += dt;
    if (this._caretT >= 530) {
      this._caretT = 0;
      this.caretOn = !this.caretOn;
      window.GameRender.invalidate();
    }
  },

  // ─── Input (Pointer Events) ────────────────────────────────────────────
  _hitButton(p) {
    return btnHitIndex(this.buttons, p.x, p.y);
  },

  onPointerMove(p, type) {
    if (Scenes.current !== this) return;
    if (type === 'touch') return;
    const hi = this._hitButton(p);
    const hf = !!this.fieldRect && hitRect(this.fieldRect, p.x, p.y);
    document.getElementById('game').style.cursor =
      (hi >= 0 || hf) ? 'pointer' : 'default';
    if (hi !== this.hoverIndex || hf !== this.hoverField) {
      this.hoverIndex = hi;
      this.hoverField = hf;
      window.GameRender.invalidate();
    }
  },

  onPointerDown(p) {
    if (Scenes.current !== this) return;
    if (this.fieldRect && hitRect(this.fieldRect, p.x, p.y)) {
      this.pressed = 'field';
      return;
    }
    this.pressed = this._hitButton(p);
    if (this.pressed >= 0) {
      this.hoverIndex = this.pressed;
      window.GameRender.invalidate();
    }
  },

  onPointerUp(p, type) {
    if (Scenes.current !== this) return;
    const wasField = this.pressed === 'field';
    const wasBtn = typeof this.pressed === 'number' ? this.pressed : -1;
    this.pressed = -1;

    if (wasField && this.fieldRect && hitRect(this.fieldRect, p.x, p.y)) {
      // Focus nel gesto utente: indispensabile su iOS per la tastiera.
      if (this.input) { this.input.focus(); this.input.select(); }
      window.GameRender.invalidate();
      return;
    }

    const i = this._hitButton(p);
    if (type === 'touch') this.hoverIndex = -1;
    if (i >= 0 && i === wasBtn) this.activate(this.buttons[i]);
    else window.GameRender.invalidate();
  },

  onPointerCancel() {
    this.pressed = -1;
    this.hoverIndex = -1;
    this.hoverField = false;
    window.GameRender.invalidate();
  },

  activate(b) {
    if (!b || b.disabled) return;
    if (b.action === 'random') {
      this.name = this._randomName();
      if (this.input) this.input.value = this.name;
      window.GameRender.invalidate();
    } else if (b.action === 'back') {
      this._leave('title');
    } else if (b.action === 'start') {
      this._start();
    }
  },

  // Riduce il font finche' il testo non sta in this._fitMaxW.
  fitFontSize(text, startPx, weightFamily) {
    const ctx = this.ctx;
    ctx.font = weightFamily.replace('%d', startPx);
    const wpx = ctx.measureText(text).width;
    const max = this._fitMaxW;
    if (wpx <= max) return startPx;
    return Math.max(8, Math.floor(startPx * max / wpx));
  },

  // ─── Disegno ───────────────────────────────────────────────────────────
  draw() {
    this.layout();
    const ctx = this.ctx;
    const w = window.UI.w, h = window.UI.h, compact = window.UI.compact;

    // Sfondo + pergamena + bordo cartografico (coerente col titolo)
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, w, h);
    const m = compact ? SF(12) : SF(18);
    const pw = w - m * 2, ph = h - m * 2;
    ctx.drawImage(getParchmentTexture(pw, ph, 2024), m, m);
    drawCartographicBorder(ctx, m, m, pw, ph);

    const cx = Math.floor(w / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Titolo
    const titleY = Math.floor(h * (compact ? 0.17 : 0.19));
    this._fitMaxW = w - m * 2 - SF(24);
    const tSize = this.fitFontSize('IL TUO CAVALIERE', SF(compact ? 46 : 70),
      'bold %dpx "Courier New", monospace');
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `bold ${tSize}px "Courier New", monospace`;
    ctx.fillText('IL TUO CAVALIERE', cx, titleY);

    // Sottotitolo
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${SF(compact ? 17 : 23)}px "Courier New", monospace`;
    ctx.fillText('Con quale nome ti ricorderanno i cronisti?',
      cx, titleY + SF(compact ? 38 : 50));

    // ── Campo NOME ──
    const fr = this.fieldRect;
    // Etichetta
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.inkMedio;
    ctx.font = `bold ${SF(13)}px "Courier New", monospace`;
    ctx.fillText('NOME DEL CAVALIERE', fr.x, fr.y - SF(8));

    // Cornice campo
    ctx.fillStyle = (this._focused || this.hoverField)
      ? PALETTE.pergChiara : PALETTE.pergMedia;
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    drawPixelRectStroke(ctx, fr.x, fr.y, fr.w, fr.h,
      this._focused ? PALETTE.inkScuro : PALETTE.inkMedio);

    // Testo / placeholder
    ctx.textBaseline = 'middle';
    const tx = fr.x + SF(14);
    const tcy = fr.y + fr.h / 2;
    if (this.name) {
      ctx.fillStyle = PALETTE.inkNero;
      ctx.font = `bold ${SF(compact ? 22 : 26)}px "Courier New", monospace`;
      ctx.fillText(this.name, tx, tcy);
    } else {
      ctx.fillStyle = PALETTE.inkLeggero;
      ctx.font = `italic ${SF(compact ? 19 : 23)}px "Courier New", monospace`;
      ctx.fillText('tocca per scrivere…', tx, tcy);
    }
    // Caret
    if (this._focused && this.caretOn) {
      ctx.font = `bold ${SF(compact ? 22 : 26)}px "Courier New", monospace`;
      const twi = this.name ? ctx.measureText(this.name).width : 0;
      const ch = SF(compact ? 24 : 28);
      ctx.fillStyle = PALETTE.inkNero;
      ctx.fillRect(Math.round(tx + twi + SF(3)), Math.round(tcy - ch / 2), PIXEL, ch);
    }

    // ── Pulsanti ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.buttons.forEach((b, i) => {
      const hovered = i === this.hoverIndex;
      ctx.fillStyle = b.disabled
        ? PALETTE.pergMacchia
        : (hovered ? PALETTE.pergScura : PALETTE.pergMedia);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawPixelRectStroke(ctx, b.x, b.y, b.w, b.h,
        b.disabled ? PALETTE.inkLeggero : (hovered ? PALETTE.inkScuro : PALETTE.inkMedio));
      ctx.fillStyle = b.disabled
        ? PALETTE.inkLeggero
        : (hovered ? PALETTE.inkNero : PALETTE.inkScuro);
      ctx.font = `${hovered && !b.disabled ? 'bold ' : ''}${SF(compact ? 20 : 24)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  },

  // Calcola fieldRect e i rettangoli dei pulsanti per la larghezza corrente.
  layout() {
    const w = window.UI.w, h = window.UI.h, compact = window.UI.compact;
    const m = compact ? SF(12) : SF(18);
    const cx = Math.floor(w / 2);

    const fieldW = Math.min(SF(520), w - m * 2 - SF(40));
    const fieldH = compact ? SF(50) : SF(58);
    const fieldX = Math.floor(cx - fieldW / 2);
    const fieldY = Math.floor(h * (compact ? 0.36 : 0.40));
    this.fieldRect = { x: fieldX, y: fieldY, w: fieldW, h: fieldH };

    const gap = SF(14);
    // "Tira a sorte" sotto il campo, largo come il campo.
    const randH = compact ? SF(44) : SF(50);
    const randY = fieldY + fieldH + gap;
    const randBtn = {
      label: '⚄  TIRA A SORTE', action: 'random',
      x: fieldX, y: randY, w: fieldW, h: randH,
    };

    // INDIETRO / INIZIA in fondo, affiancati.
    const navH = compact ? SF(50) : SF(58);
    const navW = (fieldW - gap) / 2;
    const navY = randY + randH + SF(compact ? 22 : 30);
    const backBtn = {
      label: '← INDIETRO', action: 'back',
      x: fieldX, y: navY, w: Math.floor(navW), h: navH,
    };
    const startBtn = {
      label: 'INIZIA →', action: 'start',
      x: Math.floor(fieldX + navW + gap), y: navY, w: Math.floor(navW), h: navH,
      disabled: !(this.name && this.name.trim()),
    };

    this.buttons = [randBtn, backBtn, startBtn];
  },
};
