// FERRO & CENERE — scene manager minimale
// Gestisce il passaggio tra le schermate (titolo, gioco, ecc.).
// Ogni scena espone: init(canvas), draw(), e opzionalmente i metodi pointer
// onPointerMove(p, type) / onPointerDown(p, type) / onPointerUp(p, type) /
// onPointerCancel(), dove p = { x, y } in coordinate logiche del canvas e
// type = 'mouse' | 'pen' | 'touch'.

const Scenes = {
  current: null,
  registry: {},

  register(name, scene) {
    this.registry[name] = scene;
  },

  switchTo(name) {
    const next = this.registry[name];
    if (!next) {
      console.warn('Scena sconosciuta:', name);
      return;
    }
    this.current = next;
    if (next.onEnter) next.onEnter();
    window.GameRender.invalidate();
  },

  draw() {
    if (this.current && this.current.draw) this.current.draw();
  },

  onPointerMove(p, type) {
    if (this.current && this.current.onPointerMove) this.current.onPointerMove(p, type);
  },

  onPointerDown(p, type) {
    if (this.current && this.current.onPointerDown) this.current.onPointerDown(p, type);
  },

  onPointerUp(p, type) {
    if (this.current && this.current.onPointerUp) this.current.onPointerUp(p, type);
  },

  onPointerCancel() {
    if (this.current && this.current.onPointerCancel) this.current.onPointerCancel();
  },

  onWheel(p, deltaY) {
    if (this.current && this.current.onWheel) this.current.onWheel(p, deltaY);
  },
};

// ─── Utility condivisa: hit-test di una lista di pulsanti {x,y,w,h,disabled} ──
function hitRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function btnHitIndex(list, x, y) {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.disabled) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}
