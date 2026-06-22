// FERRO & CENERE — Schermata titolo
// Disegna direttamente sul canvas display (vedi main.js). Le dimensioni
// assolute passano da S(...) per restare proporzionali al canvas; il layout
// si adatta a schermi stretti (UI.compact) e il titolo viene rimpicciolito
// per stare nella larghezza disponibile. Input via Pointer Events.

const TitleScreen = {
  buttons: [],
  hoverIndex: -1,
  pressed: -1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.buttons = [
      { label: 'NUOVA PARTITA',    action: 'new' },
      { label: 'CONTINUA',         action: 'continue', disabled: true },
      { label: 'CARICA / IMPORTA', action: 'load',     disabled: true },
      { label: 'CREDITI',          action: 'credits',  disabled: true },
    ];
  },

  layout() {
    const w = window.UI.w;
    const h = window.UI.h;
    const compact = window.UI.compact;
    // In compatto i pulsanti occupano quasi tutta la larghezza; altrimenti
    // larghezza fissa di design ma comunque limitata allo schermo.
    const margin = compact ? SF(28) : SF(40);
    const btnW = Math.min(SF(570), w - margin * 2);
    const btnH = compact ? SF(54) : SF(63);
    const gap = SF(16);
    const startY = Math.floor(h * (compact ? 0.50 : 0.58));
    const x = Math.floor((w - btnW) / 2);
    this.buttons.forEach((b, i) => {
      b.x = x;
      b.y = startY + i * (btnH + gap);
      b.w = btnW;
      b.h = btnH;
    });
  },

  // ─── Input (Pointer Events) ──────────────────────────────────────────────
  setHover(i, updateCursor) {
    if (i === this.hoverIndex) return;
    this.hoverIndex = i;
    if (updateCursor) {
      document.getElementById('game').style.cursor = i >= 0 ? 'pointer' : 'default';
    }
    window.GameRender.invalidate();
  },

  onPointerMove(p, type) {
    if (Scenes.current !== this) return;
    if (type === 'touch') return; // l'hover non esiste finché il dito non preme
    this.setHover(btnHitIndex(this.buttons, p.x, p.y), true);
  },

  onPointerDown(p) {
    if (Scenes.current !== this) return;
    this.pressed = btnHitIndex(this.buttons, p.x, p.y);
    this.setHover(this.pressed, false);
  },

  onPointerUp(p, type) {
    if (Scenes.current !== this) return;
    const i = btnHitIndex(this.buttons, p.x, p.y);
    const fire = i >= 0 && i === this.pressed;
    this.pressed = -1;
    if (type === 'touch') this.setHover(-1, false);
    if (fire) this.activate(this.buttons[i]);
  },

  onPointerCancel() {
    this.pressed = -1;
    this.setHover(-1, false);
  },

  activate(b) {
    if (!b || b.disabled) return;
    if (b.action === 'new') Scenes.switchTo('game');
    else console.log('Azione titolo:', b.action);
  },

  // Riduce la dimensione del font finché il testo non sta in maxWidth.
  fitFontSize(text, startPx, weightFamily) {
    const ctx = this.ctx;
    ctx.font = `${weightFamily.replace('%d', startPx)}`;
    const wpx = ctx.measureText(text).width;
    const max = this._fitMaxW;
    if (wpx <= max) return startPx;
    return Math.max(8, Math.floor(startPx * max / wpx));
  },

  draw() {
    this.layout();
    const ctx = this.ctx;
    const w = window.UI.w;
    const h = window.UI.h;
    const compact = window.UI.compact;

    // 1. Sfondo inchiostro
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, w, h);

    // 2. Pergamena
    const m = compact ? SF(12) : SF(18);
    const pw = w - m * 2;
    const ph = h - m * 2;
    const parchment = getParchmentTexture(pw, ph, 1337);
    ctx.drawImage(parchment, m, m);

    // 3. Bordo cartografico
    drawCartographicBorder(ctx, m, m, pw, ph);

    // 4. Titolo (rimpicciolito se non sta nella larghezza)
    const cx = Math.floor(w / 2);
    const titleY = Math.floor(h * (compact ? 0.20 : 0.22));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._fitMaxW = w - m * 2 - SF(24);
    const titleSize = this.fitFontSize('KNIGHT DAWN', SF(144),
      'bold %dpx "Courier New", monospace');
    ctx.fillStyle = PALETTE.inkMedio;
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;
    ctx.fillText('KNIGHT DAWN', cx + PIXEL * 2, titleY + PIXEL * 2);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillText('KNIGHT DAWN', cx, titleY);

    // 5. Separatori a rombi (larghezza limitata allo schermo)
    ctx.fillStyle = PALETTE.inkScuro;
    const lineW = Math.min(SF(780), w - m * 2 - SF(40));
    const yOffMag = Math.round(titleSize * 0.75);
    for (const yOff of [-yOffMag, yOffMag]) {
      const ly = titleY + yOff;
      ctx.fillRect(Math.floor(cx - lineW / 2), Math.floor(ly), lineW, PIXEL);
      for (const sx of [-1, 1]) {
        const ex = Math.floor(cx + sx * (lineW / 2 + PIXEL * 3));
        ctx.fillRect(ex, ly - PIXEL, PIXEL, PIXEL);
        ctx.fillRect(ex - PIXEL, ly, PIXEL * 3, PIXEL);
        ctx.fillRect(ex, ly + PIXEL, PIXEL, PIXEL);
      }
    }

    // 6. Sottotitolo
    const subSize = this.fitFontSize('- cronache di un cavaliere errante -',
      SF(32), 'italic %dpx "Courier New", monospace');
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${subSize}px "Courier New", monospace`;
    ctx.fillText('- cronache di un cavaliere errante -', cx, titleY + yOffMag + SF(48));

    // 7. Rosa dei venti (più piccola e vicina al bordo in compatto)
    const roseR = compact ? SF(44) : SF(64);
    drawCompassRose(ctx, w - m - roseR - SF(10), m + roseR + SF(10), roseR);

    // 8. Etichetta "Terra Incognita"
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${SF(compact ? 18 : 26)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('Terra Incognita', m + SF(24), h - m - SF(28));

    // 9. Pulsanti
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const btnFont = SF(compact ? 26 : 32);
    this.buttons.forEach((b, i) => {
      const hovered = i === this.hoverIndex;

      ctx.fillStyle = hovered ? PALETTE.pergScura : PALETTE.pergMedia;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      drawPixelRectStroke(
        ctx, b.x, b.y, b.w, b.h,
        hovered ? PALETTE.inkScuro : PALETTE.inkMedio
      );

      const cyB = Math.floor(b.y + b.h / 2);
      ctx.fillStyle = PALETTE.inkScuro;
      for (const sx of [-1, 1]) {
        const ex = sx === -1 ? b.x + PIXEL * 4 : b.x + b.w - PIXEL * 5;
        ctx.fillRect(ex, cyB - PIXEL, PIXEL, PIXEL);
        ctx.fillRect(ex - PIXEL, cyB, PIXEL * 3, PIXEL);
        ctx.fillRect(ex, cyB + PIXEL, PIXEL, PIXEL);
      }

      ctx.fillStyle = b.disabled
        ? PALETTE.inkLeggero
        : (hovered ? PALETTE.inkNero : PALETTE.inkScuro);
      ctx.font = `${hovered ? 'bold ' : ''}${btnFont}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });

    // 10. Footer
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `${SF(compact ? 14 : 22)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('v0.0.7  fase 1  adattivo', w - m - SF(24), h - m - SF(28));
  },
};
