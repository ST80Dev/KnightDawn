// FERRO & CENERE — scene manager minimale
// Gestisce il passaggio tra le schermate (titolo, gioco, ecc.).
// Ogni scena espone: init(canvas), draw(), e opzionalmente onMove/onClick.

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

  onMove(e) {
    if (this.current && this.current.onMove) this.current.onMove(e);
  },

  onClick(e) {
    if (this.current && this.current.onClick) this.current.onClick(e);
  },
};
