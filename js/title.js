// FERRO & CENERE — Schermata titolo (home)
// Primo test estetico: pergamena + bordo cartografico + tipografia + rosa dei venti.

const TitleScreen = {
  buttons: [],
  hoverIndex: -1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buttons = [
      { label: 'Nuova Partita',   action: 'new' },
      { label: 'Continua',        action: 'continue', disabled: true },
      { label: 'Carica / Importa', action: 'load',    disabled: true },
      { label: 'Crediti',         action: 'credits',  disabled: true },
    ];

    canvas.addEventListener('mousemove', (e) => this.onMove(e));
    canvas.addEventListener('click', (e) => this.onClick(e));
  },

  layout() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Geometria pulsanti: centrati, parte inferiore-centrale
    const btnW = Math.min(360, w * 0.45);
    const btnH = 44;
    const gap = 14;
    const totalH = this.buttons.length * btnH + (this.buttons.length - 1) * gap;
    const startY = h * 0.58;
    const x = (w - btnW) / 2;
    this.buttons.forEach((b, i) => {
      b.x = x;
      b.y = startY + i * (btnH + gap);
      b.w = btnW;
      b.h = btnH;
    });
  },

  onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (this.canvas.width / r.width);
    const my = (e.clientY - r.top) * (this.canvas.height / r.height);
    let h = -1;
    this.buttons.forEach((b, i) => {
      if (!b.disabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) h = i;
    });
    if (h !== this.hoverIndex) {
      this.hoverIndex = h;
      this.canvas.style.cursor = h >= 0 ? 'pointer' : 'default';
    }
  },

  onClick() {
    if (this.hoverIndex < 0) return;
    const b = this.buttons[this.hoverIndex];
    if (b.disabled) return;
    console.log('Azione titolo:', b.action);
    // Hook futuro: switch a creazione personaggio / vista mondo
  },

  draw() {
    this.layout();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Sfondo nero/inchiostro (vignetta esterna fuori dalla pergamena)
    ctx.fillStyle = PALETTE.inkNero;
    ctx.fillRect(0, 0, w, h);

    // 2. Pergamena: occupiamo quasi tutto il canvas con un piccolo margine
    const m = Math.floor(Math.min(w, h) * 0.025);
    const pw = w - m * 2;
    const ph = h - m * 2;
    const parchment = getParchmentTexture(pw, ph, 1337);
    ctx.drawImage(parchment, m, m);

    // 3. Bordo cartografico
    drawCartographicBorder(ctx, m, m, pw, ph);

    // 4. Titolo
    const cx = w / 2;
    const titleY = h * 0.22;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ombra leggera sotto il titolo
    ctx.fillStyle = 'rgba(26,14,4,0.25)';
    ctx.font = `bold ${Math.floor(h * 0.11)}px Georgia, "Times New Roman", serif`;
    ctx.fillText('Ferro & Cenere', cx + 3, titleY + 3);

    // titolo principale
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillText('Ferro & Cenere', cx, titleY);

    // separatori decorativi sopra/sotto il titolo
    ctx.strokeStyle = PALETTE.inkMedio;
    ctx.lineWidth = 1.5;
    const lineW = Math.min(440, w * 0.5);
    for (const yOff of [-h * 0.075, h * 0.075]) {
      const ly = titleY + yOff;
      ctx.beginPath();
      ctx.moveTo(cx - lineW / 2, ly);
      ctx.lineTo(cx + lineW / 2, ly);
      ctx.stroke();
      // rombi alle estremità
      ctx.fillStyle = PALETTE.inkScuro;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * (lineW / 2 + 8), ly);
        ctx.lineTo(cx + sx * (lineW / 2 + 4), ly - 4);
        ctx.lineTo(cx + sx * (lineW / 2),     ly);
        ctx.lineTo(cx + sx * (lineW / 2 + 4), ly + 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    // sottotitolo in corsivo
    ctx.fillStyle = PALETTE.inkLeggero;
    ctx.font = `italic ${Math.floor(h * 0.028)}px Georgia, serif`;
    ctx.fillText('— cronache di un cavaliere errante —', cx, titleY + h * 0.11);

    // 5. Rosa dei venti decorativa in alto a destra
    const roseR = Math.min(60, w * 0.05);
    drawCompassRose(ctx, w - m - 60, m + 60, roseR);

    // 6. Etichetta "Terra Incognita" in basso a sinistra (vibe cartografico)
    ctx.save();
    ctx.fillStyle = 'rgba(58,32,16,0.35)';
    ctx.font = `italic ${Math.floor(h * 0.022)}px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Terra Incognita', m + 36, h - m - 36);
    ctx.restore();

    // 7. Pulsanti
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.buttons.forEach((b, i) => {
      const hovered = i === this.hoverIndex;
      // Sfondo pulsante: lieve oscuramento della pergamena
      ctx.fillStyle = hovered
        ? 'rgba(26,14,4,0.18)'
        : 'rgba(26,14,4,0.08)';
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Bordo
      ctx.strokeStyle = hovered ? PALETTE.inkScuro : PALETTE.inkMedio;
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

      // Decorazioni laterali (piccoli rombi)
      const cy = b.y + b.h / 2;
      ctx.fillStyle = PALETTE.inkMedio;
      for (const sx of [-1, 1]) {
        const ex = sx === -1 ? b.x + 10 : b.x + b.w - 10;
        ctx.beginPath();
        ctx.moveTo(ex - 4, cy);
        ctx.lineTo(ex, cy - 4);
        ctx.lineTo(ex + 4, cy);
        ctx.lineTo(ex, cy + 4);
        ctx.closePath();
        ctx.fill();
      }

      // Testo
      ctx.fillStyle = b.disabled
        ? 'rgba(58,32,16,0.4)'
        : (hovered ? PALETTE.inkNero : PALETTE.inkScuro);
      ctx.font = `${hovered ? 'bold ' : ''}${Math.floor(h * 0.028)}px Georgia, serif`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // 8. Versione / footer
    ctx.fillStyle = 'rgba(58,32,16,0.5)';
    ctx.font = `${Math.floor(h * 0.018)}px "Courier New", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('v0.0.1 — fase 1 · test grafico', w - m - 36, h - m - 36);
  },
};
