// FERRO & CENERE — Schermata titolo
// Disegna direttamente sul canvas display (vedi main.js). Tutte le
// dimensioni assolute passano da S(...) per essere proporzionali al
// canvas attuale.

const TitleScreen = {
  buttons: [],
  hoverIndex: -1,
  _lastHover: -1,

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

    const display = document.getElementById('game');
    display.addEventListener('mousemove', (e) => this.onMove(e));
    display.addEventListener('click', (e) => this.onClick(e));
  },

  layout() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const btnW = SF(570);
    const btnH = SF(63);
    const gap = SF(18);
    const startY = Math.floor(h * 0.58);
    const x = Math.floor((w - btnW) / 2);
    this.buttons.forEach((b, i) => {
      b.x = x;
      b.y = startY + i * (btnH + gap);
      b.w = btnW;
      b.h = btnH;
    });
  },

  onMove(e) {
    if (Scenes.current !== this) return;
    const { x: mx, y: my } = window.GameRender.displayToInternal(e.clientX, e.clientY);
    let h = -1;
    this.buttons.forEach((b, i) => {
      if (!b.disabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) h = i;
    });
    if (h !== this.hoverIndex) {
      this.hoverIndex = h;
      document.getElementById('game').style.cursor = h >= 0 ? 'pointer' : 'default';
      window.GameRender.invalidate();
    }
  },

  onClick() {
    if (Scenes.current !== this) return;
    if (this.hoverIndex < 0) return;
    const b = this.buttons[this.hoverIndex];
    if (b.disabled) return;
    if (b.action === 'new') {
      Scenes.switchTo('game');
    } else {
      console.log('Azione titolo:', b.action);
    }
  },

  draw() {
    this.layout();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Sfondo inchiostro
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, w, h);

    // 2. Pergamena
    const m = SF(18);
    const pw = w - m * 2;
    const ph = h - m * 2;
    const parchment = getParchmentTexture(pw, ph, 1337);
    ctx.drawImage(parchment, m, m);

    // 3. Bordo cartografico
    drawCartographicBorder(ctx, m, m, pw, ph);

    // 4. Titolo
    const cx = Math.floor(w / 2);
    const titleY = Math.floor(h * 0.22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleSize = SF(144);
    ctx.fillStyle = PALETTE.inkMedio;
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;
    ctx.fillText('KNIGHT DAWN', cx + PIXEL * 2, titleY + PIXEL * 2);

    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillText('KNIGHT DAWN', cx, titleY);

    // 5. Separatori a rombi
    ctx.fillStyle = PALETTE.inkScuro;
    const lineW = SF(780);
    const yOffMag = SF(108);
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
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${SF(32)}px "Courier New", monospace`;
    ctx.fillText('- cronache di un cavaliere errante -', cx, titleY + SF(174));

    // 7. Rosa dei venti
    drawCompassRose(ctx, w - m - SF(90), m + SF(90), SF(64));

    // 8. Etichetta "Terra Incognita"
    ctx.save();
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${SF(26)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('Terra Incognita', m + SF(36), h - m - SF(36));
    ctx.restore();

    // 9. Pulsanti
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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
      ctx.font = `${hovered ? 'bold ' : ''}${SF(32)}px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });

    // 10. Footer
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `${SF(22)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('v0.0.6  fase 1  test grafico', w - m - SF(36), h - m - SF(36));
  },
};
