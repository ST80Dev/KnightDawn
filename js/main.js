// FERRO & CENERE — bootstrap
// Pipeline:
//  - canvas interno a INTERNAL_W × INTERNAL_H, dove disegnano le scene
//  - blit sul canvas visibile con nearest-neighbor a scala frazionaria
//    per riempire l'area utile del browser (window.innerWidth/innerHeight)
//  - scene manager (Scenes) sceglie cosa disegnare

(function () {
  const displayCanvas = document.getElementById('game');
  const displayCtx = displayCanvas.getContext('2d');

  const lo = document.createElement('canvas');
  lo.width = INTERNAL_W;
  lo.height = INTERNAL_H;
  const loCtx = lo.getContext('2d');
  loCtx.imageSmoothingEnabled = false;
  displayCtx.imageSmoothingEnabled = false;

  let needsRedraw = true;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    // Usa l'area utile del browser (esclude barre OS/scheda/URL).
    const w = window.innerWidth;
    const h = window.innerHeight;
    displayCanvas.width = w;
    displayCanvas.height = h;
    displayCanvas.style.width = w + 'px';
    displayCanvas.style.height = h + 'px';

    // Scala frazionaria mantenendo l'aspect ratio del canvas interno.
    scale = Math.min(w / INTERNAL_W, h / INTERNAL_H);
    const drawW = Math.floor(INTERNAL_W * scale);
    const drawH = Math.floor(INTERNAL_H * scale);
    offsetX = Math.floor((w - drawW) / 2);
    offsetY = Math.floor((h - drawH) / 2);

    displayCtx.imageSmoothingEnabled = false;
    needsRedraw = true;
  }

  function displayToInternal(clientX, clientY) {
    const r = displayCanvas.getBoundingClientRect();
    const x = (clientX - r.left - offsetX) / scale;
    const y = (clientY - r.top - offsetY) / scale;
    return { x, y };
  }

  window.addEventListener('resize', resize);

  window.GameRender = {
    ctx: loCtx,
    canvas: lo,
    width: INTERNAL_W,
    height: INTERNAL_H,
    displayToInternal,
    invalidate() { needsRedraw = true; },
  };

  // Registra e inizializza le scene
  Scenes.register('title', TitleScreen);
  Scenes.register('game',  GameScreen);
  TitleScreen.init(lo);
  GameScreen.init(lo);
  Scenes.switchTo('title');

  function blit() {
    displayCtx.fillStyle = '#1a0e04';
    displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(
      lo,
      0, 0, INTERNAL_W, INTERNAL_H,
      offsetX, offsetY, Math.floor(INTERNAL_W * scale), Math.floor(INTERNAL_H * scale)
    );
  }

  function loop() {
    if (needsRedraw) {
      Scenes.draw();
      blit();
      needsRedraw = false;
    }
    requestAnimationFrame(loop);
  }

  // Le scene chiamano invalidate() quando lo hover cambia ecc.
  displayCanvas.addEventListener('mousemove', () => { needsRedraw = true; });

  resize();
  loop();
})();
