// FERRO & CENERE — bootstrap

(function () {
  const canvas = document.getElementById('game');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    needsRedraw = true;
  }

  let needsRedraw = true;
  window.addEventListener('resize', resize);

  TitleScreen.init(canvas);

  // Loop di rendering: per la home basta ridisegnare quando serve.
  function loop() {
    if (needsRedraw || TitleScreen.hoverIndex !== TitleScreen._lastHover) {
      TitleScreen.draw();
      TitleScreen._lastHover = TitleScreen.hoverIndex;
      needsRedraw = false;
    }
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousemove', () => { needsRedraw = true; });

  resize();
  loop();
})();
