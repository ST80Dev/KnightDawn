// FERRO & CENERE — bootstrap
// Pipeline semplificata: render DIRETTO sul canvas visibile, alle dimensioni
// esatte dell'area utile del browser. Niente upscale/downscale interno:
// il testo resta nitido a qualsiasi finestra. PIXEL resta la "chunkiness"
// dei primitivi grafici (vedi config.js / tiles.js).
//
// Tutto cio che e disegnato dalle scene si dimensiona via UI.scale, che
// rapporta l'altezza del canvas a un'altezza di riferimento (DESIGN_H).

const DESIGN_H = 900; // altezza di riferimento per scaling tipografico

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let needsRedraw = true;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.imageSmoothingEnabled = false;
    // UI.scale: fattore per font/spaziature relative al DESIGN_H
    window.UI.scale = h / DESIGN_H;
    window.UI.w = w;
    window.UI.h = h;
    needsRedraw = true;
  }

  function displayToInternal(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  window.addEventListener('resize', resize);

  window.UI = { scale: 1, w: 0, h: 0 };
  window.GameRender = {
    ctx: ctx,
    canvas: canvas,
    get width()  { return canvas.width; },
    get height() { return canvas.height; },
    displayToInternal,
    invalidate() { needsRedraw = true; },
  };

  // Registra e inizializza le scene (entrambe disegnano sul canvas display)
  Scenes.register('title', TitleScreen);
  Scenes.register('game',  GameScreen);
  TitleScreen.init(canvas);
  GameScreen.init(canvas);
  Scenes.switchTo('title');

  function loop() {
    if (needsRedraw) {
      Scenes.draw();
      needsRedraw = false;
    }
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', () => { needsRedraw = true; });

  resize();
  loop();
})();

// Helper globali per dimensionamento responsivo:
// S(n)  → pixel scalati al canvas attuale (per font, padding, ecc.)
// SF(n) → numero floor-ato per allineamento pixel
function S(n)  { return n * (window.UI ? window.UI.scale : 1); }
function SF(n) { return Math.floor(S(n)); }
