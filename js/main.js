// FERRO & CENERE — bootstrap
// Rendering pixel-art: tutto viene disegnato su un canvas interno a bassa
// risoluzione (INTERNAL_W x INTERNAL_H) poi upscalato nearest-neighbor sul
// canvas visibile. Questo dà l'aspetto pixel autentico a tutto, font inclusi.

(function () {
  const displayCanvas = document.getElementById('game');
  const displayCtx = displayCanvas.getContext('2d');

  // Canvas interno a bassa risoluzione: qui disegnano tutti i sistemi.
  const lo = document.createElement('canvas');
  lo.width = INTERNAL_W;
  lo.height = INTERNAL_H;
  const loCtx = lo.getContext('2d');

  // Niente smoothing né su lo-res né sul display (per upscale pixelated).
  loCtx.imageSmoothingEnabled = false;
  displayCtx.imageSmoothingEnabled = false;

  let needsRedraw = true;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    displayCanvas.width = w;
    displayCanvas.height = h;
    displayCanvas.style.width = w + 'px';
    displayCanvas.style.height = h + 'px';

    // Scala intera massima che entra nel viewport (mantiene pixel netti).
    scale = Math.max(1, Math.floor(Math.min(w / INTERNAL_W, h / INTERNAL_H)));
    const drawW = INTERNAL_W * scale;
    const drawH = INTERNAL_H * scale;
    offsetX = Math.floor((w - drawW) / 2);
    offsetY = Math.floor((h - drawH) / 2);

    displayCtx.imageSmoothingEnabled = false;
    needsRedraw = true;
  }

  // Trasforma le coordinate del mouse (in pixel display) in coordinate
  // del canvas interno a bassa risoluzione.
  function displayToInternal(clientX, clientY) {
    const r = displayCanvas.getBoundingClientRect();
    const x = (clientX - r.left - offsetX) / scale;
    const y = (clientY - r.top - offsetY) / scale;
    return { x, y };
  }

  window.addEventListener('resize', resize);

  // Esponiamo il context lo-res e l'helper alle scene.
  window.GameRender = {
    ctx: loCtx,
    canvas: lo,
    width: INTERNAL_W,
    height: INTERNAL_H,
    displayToInternal,
    invalidate() { needsRedraw = true; },
  };

  TitleScreen.init(lo);

  function blit() {
    // Sfondo nero attorno al canvas interno (letterbox)
    displayCtx.fillStyle = '#1a0e04';
    displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(
      lo,
      0, 0, INTERNAL_W, INTERNAL_H,
      offsetX, offsetY, INTERNAL_W * scale, INTERNAL_H * scale
    );
  }

  function loop() {
    if (needsRedraw || TitleScreen.hoverIndex !== TitleScreen._lastHover) {
      TitleScreen.draw();
      TitleScreen._lastHover = TitleScreen.hoverIndex;
      blit();
      needsRedraw = false;
    }
    requestAnimationFrame(loop);
  }

  displayCanvas.addEventListener('mousemove', () => { needsRedraw = true; });

  resize();
  loop();
})();
