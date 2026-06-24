// FERRO & CENERE — viaggio automatico tile-by-tile + A*
// Granularità: 1 Passo = 1 tile (vedi GDD §3 Tempo e calendario, §3 Viaggio).
// Vanilla, niente dipendenze. Espone l'oggetto globale Travel.
//
// Modello:
//   - findPath(sx,sy,gx,gy)  → array di {x,y} (esclusa la sorgente, inclusa la
//     meta) oppure null se irraggiungibile.
//   - start(path)            → mette il viaggio in stato 'traveling'.
//   - stop()                 → reset.
//   - update(dtMs, knightPos, hooks) → consuma dt, avanza un Passo ogni
//     msPerStep, sposta il cavaliere, scala Forza, batte il Calendario,
//     invoca hooks.onStep e hooks.onArrive / onBlocked.
//
// La connessione fra mossa A* e costo di gioco la fa Knight.consumaForza(b):
// la stessa TRAVEL_COST guida sia il pathfinding (preferisce strade meno
// ostili) sia il consumo di Forza durante il cammino reale.

const Travel = {
  // Quanto dura un Passo in tempo reale, in ms. Per la fase corrente uso un
  // Velocità di viaggio: durata in secondi di un Passo (1 tile).
  // GDD: range 0.3 s (veloce, debug) → 30 s (lento, simulazione).
  SPEED_PRESETS: [0.3, 1.5, 5, 15, 30],
  speedIdx: 1,  // default: 1.5 s/passo (ritmo narrativo confortevole)
  speedMs()   { return this.SPEED_PRESETS[this.speedIdx] * 1000; },
  speedSec()  { return this.SPEED_PRESETS[this.speedIdx]; },
  speedUp()   { this.speedIdx = Math.min(this.speedIdx + 1, this.SPEED_PRESETS.length - 1); },
  speedDown() { this.speedIdx = Math.max(this.speedIdx - 1, 0); },

  state: 'idle',     // 'idle' | 'traveling'
  path: null,        // [{x,y}, ...] dopo la sorgente, fino alla meta inclusa
  idx: 0,            // prossimo indice da consumare
  accum: 0,          // accumulatore ms
  destination: null, // {x,y} solo per HUD

  start(path) {
    if (!path || !path.length) return false;
    this.path = path;
    this.idx = 0;
    this.accum = 0;
    this.state = 'traveling';
    this.destination = path[path.length - 1];
    return true;
  },

  stop() {
    this.state = 'idle';
    this.path = null;
    this.idx = 0;
    this.accum = 0;
    this.destination = null;
  },

  isActive() { return this.state === 'traveling'; },

  // hooks: { onStep(tile, biome), onArrive(), onBlocked(reason) }
  update(dtMs, knightPos, hooks) {
    if (this.state !== 'traveling' || !this.path) return;
    hooks = hooks || {};
    this.accum += dtMs;
    const stepMs = this.speedMs();
    while (this.state === 'traveling' && this.accum >= stepMs) {
      this.accum -= stepMs;
      const next = this.path[this.idx++];
      if (!next) { this.stop(); if (hooks.onArrive) hooks.onArrive(); return; }
      const biome = World.biomeAt(next.x, next.y);
      // L'A* ha già escluso i tile impassabili: in pratica consumaForza
      // ritorna true; teniamo il check per sicurezza (mondo modificabile).
      if (!Knight.consumaForza(biome)) {
        this.stop();
        if (hooks.onBlocked) hooks.onBlocked('impassabile');
        return;
      }
      knightPos.x = next.x;
      knightPos.y = next.y;
      Calendar.avanza(1);
      if (typeof Events !== 'undefined' && Events.tickDeadlines) Events.tickDeadlines();
      if (hooks.onStep) hooks.onStep(next, biome);
      if (this.idx >= this.path.length) {
        this.stop();
        if (hooks.onArrive) hooks.onArrive();
        return;
      }
      if (Knight.isExhausted()) {
        this.stop();
        if (hooks.onBlocked) hooks.onBlocked('esausto');
        return;
      }
    }
  },

  // ─── Pathfinding A* (8-connesso) ─────────────────────────────────────────
  // Costi per tile dal vettore TRAVEL_COST (in knight.js). I tile con costo
  // null sono impassabili. Diagonali: costo × √2; vietato "tagliare l'angolo"
  // se uno dei due tile cardinali adiacenti è impassabile (niente passaggio
  // di striscio attraverso il mare in diagonale).
  findPath(sx, sy, gx, gy) {
    const W = World.width, H = World.height;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) return null;
    if (sx === gx && sy === gy) return [];
    if (TRAVEL_COST[World.biomeAt(gx, gy)] == null) return null;

    const N = W * H;
    const idxOf = (x, y) => y * W + x;
    const gScore = new Float32Array(N);
    for (let i = 0; i < N; i++) gScore[i] = Infinity;
    const came = new Int32Array(N); came.fill(-1);
    const closed = new Uint8Array(N);

    // Heuristic: distanza ottile × costo minimo possibile per tile (0.25).
    // Ammissibile finché 0.25 è il minimo in TRAVEL_COST → A* ottimale.
    const MINC = 0.25;
    const h = (x, y) => {
      const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
      return MINC * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
    };

    const open = new _TravelHeap();
    const sIdx = idxOf(sx, sy);
    gScore[sIdx] = 0;
    open.push(h(sx, sy), sIdx);

    const DIRS = [
      [ 1, 0], [-1, 0], [0,  1], [0, -1],
      [ 1, 1], [ 1,-1], [-1, 1], [-1,-1],
    ];
    const gIdx = idxOf(gx, gy);

    while (open.size > 0) {
      const i = open.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === gIdx) {
        const path = [];
        let ci = i;
        while (ci !== sIdx) {
          path.push({ x: ci % W, y: (ci / W) | 0 });
          ci = came[ci];
        }
        path.reverse();
        return path;
      }
      const x = i % W, y = (i / W) | 0;
      const gCur = gScore[i];
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dy = DIRS[k][1];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = idxOf(nx, ny);
        if (closed[ni]) continue;
        const cost = TRAVEL_COST[World.biomeAt(nx, ny)];
        if (cost == null) continue;
        if (dx && dy) {
          // Niente taglio d'angolo attraverso l'impassabile.
          if (TRAVEL_COST[World.biomeAt(x + dx, y)] == null) continue;
          if (TRAVEL_COST[World.biomeAt(x, y + dy)] == null) continue;
        }
        const step = (dx && dy) ? cost * Math.SQRT2 : cost;
        const tg = gCur + step;
        if (tg < gScore[ni]) {
          gScore[ni] = tg;
          came[ni] = i;
          open.push(tg + h(nx, ny), ni);
        }
      }
    }
    return null;
  },
};

// Min-heap binario su (priority, value=int). Implementato inline per evitare
// allocazioni di oggetti durante l'A* (centinaia di migliaia di push/pop).
class _TravelHeap {
  constructor() { this.pri = []; this.val = []; this.size = 0; }
  push(p, v) {
    let i = this.size++;
    this.pri.push(p); this.val.push(v);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.pri[par] <= this.pri[i]) break;
      const tp = this.pri[par], tv = this.val[par];
      this.pri[par] = this.pri[i]; this.val[par] = this.val[i];
      this.pri[i] = tp; this.val[i] = tv;
      i = par;
    }
  }
  pop() {
    const top = this.val[0];
    this.size--;
    if (this.size > 0) {
      this.pri[0] = this.pri[this.size];
      this.val[0] = this.val[this.size];
    }
    this.pri.pop(); this.val.pop();
    let i = 0;
    while (true) {
      const l = i * 2 + 1, r = l + 1;
      let best = i;
      if (l < this.size && this.pri[l] < this.pri[best]) best = l;
      if (r < this.size && this.pri[r] < this.pri[best]) best = r;
      if (best === i) break;
      const tp = this.pri[best], tv = this.val[best];
      this.pri[best] = this.pri[i]; this.val[best] = this.val[i];
      this.pri[i] = tp; this.val[i] = tv;
      i = best;
    }
    return top;
  }
}
