// FERRO & CENERE — Schermata titolo
// Disegnata sul canvas interno a 800x450 con primitivi pixel-art chunky
// (blocchi PIXEL×PIXEL). Upscalata nearest-neighbor sul display.

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
    const btnW = 260;
    const btnH = 26;
    const gap = 8;
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
    const { x: mx, y: my } = window.GameRender.displayToInternal(e.clientX, e.clientY);
    let h = -1;
    this.buttons.forEach((b, i) => {
      if (!b.disabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) h = i;
    });
    if (h !== this.hoverIndex) {
      this.hoverIndex = h;
      document.getElementById('game').style.cursor = h >= 0 ? 'pointer' : 'default';
    }
  },

  onClick() {
    if (this.hoverIndex < 0) return;
    const b = this.buttons[this.hoverIndex];
    if (b.disabled) return;
    console.log('Azione titolo:', b.action);
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
    const m = PIXEL * 6;
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

    // Ombra (decalata di PIXEL*2)
    ctx.fillStyle = PALETTE.inkMedio;
    ctx.font = 'bold 60px "Courier New", monospace';
    ctx.fillText('KNIGHT DAWN', cx + PIXEL * 2, titleY + PIXEL * 2);

    // Titolo
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillText('KNIGHT DAWN', cx, titleY);

    // 5. Separatori a rombi
    ctx.fillStyle = PALETTE.inkScuro;
    const lineW = 320;
    for (const yOff of [-44, 44]) {
      const ly = titleY + yOff;
      // linea: rettangolo PIXEL alto
      ctx.fillRect(Math.floor(cx - lineW / 2), Math.floor(ly), lineW, PIXEL);
      // rombi alle estremità (5 blocchi)
      for (const sx of [-1, 1]) {
        const ex = Math.floor(cx + sx * (lineW / 2 + PIXEL * 3));
        ctx.fillRect(ex, ly - PIXEL, PIXEL, PIXEL);
        ctx.fillRect(ex - PIXEL, ly, PIXEL * 3, PIXEL);
        ctx.fillRect(ex, ly + PIXEL, PIXEL, PIXEL);
      }
    }

    // 6. Sottotitolo
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = 'italic 14px "Courier New", monospace';
    ctx.fillText('- cronache di un cavaliere errante -', cx, titleY + 72);

    // 7. Rosa dei venti
    drawCompassRose(ctx, w - m - 36, m + 38, 26);

    // 8. Etichetta "Terra Incognita"
    ctx.save();
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = 'italic 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Terra Incognita', m + 18, h - m - 18);
    ctx.restore();

    // 9. Pulsanti
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.buttons.forEach((b, i) => {
      const hovered = i === this.hoverIndex;

      // Fondo del pulsante: tono pergamena più scuro pieno (no alpha smooth)
      ctx.fillStyle = hovered ? PALETTE.pergScura : PALETTE.pergMedia;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Bordo: rettangolo cavo da 1 blocco
      drawPixelRectStroke(
        ctx, b.x, b.y, b.w, b.h,
        hovered ? PALETTE.inkScuro : PALETTE.inkMedio
      );

      // Rombi laterali (in blocchi PIXEL)
      const cyB = Math.floor(b.y + b.h / 2);
      ctx.fillStyle = PALETTE.inkScuro;
      for (const sx of [-1, 1]) {
        const ex = sx === -1 ? b.x + PIXEL * 4 : b.x + b.w - PIXEL * 5;
        ctx.fillRect(ex, cyB - PIXEL, PIXEL, PIXEL);
        ctx.fillRect(ex - PIXEL, cyB, PIXEL * 3, PIXEL);
        ctx.fillRect(ex, cyB + PIXEL, PIXEL, PIXEL);
      }

      // Testo
      ctx.fillStyle = b.disabled
        ? PALETTE.inkLeggero
        : (hovered ? PALETTE.inkNero : PALETTE.inkScuro);
      ctx.font = `${hovered ? 'bold ' : ''}14px "Courier New", monospace`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });

    // 10. Footer
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('v0.0.3  fase 1  test grafico', w - m - 18, h - m - 18);
  },
};
