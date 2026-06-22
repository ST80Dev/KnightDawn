// FERRO & CENERE — bootstrap
// Pipeline: render DIRETTO sul canvas visibile. Il canvas ha un backing store
// in pixel FISICI (× devicePixelRatio) per testo e grafica nitidi su schermi
// retina e mobile; il contesto è scalato di dpr così tutto il codice di
// disegno lavora in pixel LOGICI (CSS px). Niente upscale/downscale interno.
//
// Layout adattivo: sotto una soglia di larghezza (UI.compact) le scene
// dispongono i pannelli in verticale (portrait) invece che a colonne.
// La tipografia si dimensiona via UI.scale (vedi sotto) e si legge da S()/SF().
//
// Input unificato: i Pointer Events coprono mouse e touch con un solo percorso
// (vedi scenes.js + i metodi onPointer* delle scene).

const DESIGN_H = 900;          // altezza di riferimento per scaling in landscape
const DESIGN_W_PORTRAIT = 440; // larghezza di riferimento per scaling in portrait
const COMPACT_BREAKPOINT = 820; // sotto questa larghezza (CSS px) → layout compatto

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let needsRedraw = true;
  let dpr = 1;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap del dpr: oltre ~2.5 il guadagno visivo è nullo ma il costo (area da
    // disegnare) cresce col quadrato — su mobile è la differenza tra fluido e
    // scattoso.
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));

    // Backing store in pixel fisici, CSS in pixel logici.
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    // Lavoriamo in coordinate logiche: il contesto scala di dpr una volta sola.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const isPortrait = h >= w;
    const compact = w < COMPACT_BREAKPOINT;

    // Scaling tipografico:
    //  - desktop (landscape ampio): legato all'altezza, come da design originale
    //  - compatto in portrait: legato alla larghezza (altrimenti i font
    //    sfondano lo schermo stretto)
    //  - compatto in landscape (telefono coricato): altezza ridotta di
    //    riferimento per non far diventare tutto gigante
    let scale;
    if (!compact) {
      scale = h / DESIGN_H;
    } else if (isPortrait) {
      scale = w / DESIGN_W_PORTRAIT;
    } else {
      scale = h / 560;
    }
    scale = Math.max(0.6, Math.min(scale, 1.6));

    window.UI.scale = scale;
    window.UI.w = w;            // dimensioni LOGICHE (CSS px) — usare queste
    window.UI.h = h;            // nelle scene al posto di canvas.width/height
    window.UI.dpr = dpr;
    window.UI.isPortrait = isPortrait;
    window.UI.compact = compact;
    needsRedraw = true;
  }

  // Coordinate cliente → coordinate logiche del canvas. Poiché il contesto è
  // già scalato di dpr, lo spazio di disegno coincide con i CSS px: basta la
  // differenza dal bordo (gestendo anche un'eventuale lettera-boxing CSS).
  function displayToInternal(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = r.width ? window.UI.w / r.width : 1;
    const sy = r.height ? window.UI.h / r.height : 1;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  window.UI = {
    scale: 1, w: 0, h: 0, dpr: 1,
    isPortrait: false, compact: false,
  };
  window.GameRender = {
    ctx: ctx,
    canvas: canvas,
    get width()  { return window.UI.w; },   // logiche, non backing store
    get height() { return window.UI.h; },
    displayToInternal,
    invalidate() { needsRedraw = true; },
  };

  // ─── Input unificato (Pointer Events: mouse + touch) ──────────────────────
  // touch-action:none in CSS evita scroll/zoom; qui preveniamo il default
  // residuo (es. gesture di sistema) sui pointer touch.
  const opts = { passive: false };
  canvas.addEventListener('pointermove', (e) => {
    Scenes.onPointerMove(displayToInternalEvt(e), e.pointerType);
  }, opts);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') e.preventDefault();
    Scenes.onPointerDown(displayToInternalEvt(e), e.pointerType);
  }, opts);
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') e.preventDefault();
    Scenes.onPointerUp(displayToInternalEvt(e), e.pointerType);
  }, opts);
  canvas.addEventListener('pointercancel', () => {
    Scenes.onPointerCancel();
  }, opts);
  // Evita il menu contestuale da long-press su mobile.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function displayToInternalEvt(e) {
    return displayToInternal(e.clientX, e.clientY);
  }

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

  resize();
  loop();
})();

// Helper globali per dimensionamento responsivo:
// S(n)  → pixel scalati al canvas attuale (per font, padding, ecc.)
// SF(n) → numero floor-ato per allineamento pixel
function S(n)  { return n * (window.UI ? window.UI.scale : 1); }
function SF(n) { return Math.floor(S(n)); }
