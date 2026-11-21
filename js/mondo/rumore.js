// Knight Dawn — rumore deterministico per il generatore del mondo (M6, passo 1).
// Modulo ES senza grafica né DOM: gira anche in un Web Worker o in Node.
//
// Determinismo tra browser: si usano solo hash su interi (Math.imul) e operazioni dal risultato
// esatto in IEEE 754 (+ − × ÷, Math.sqrt, Math.floor, Math.abs). Niente Math.sin/exp/pow: i motori JS
// possono differire nell'ultima cifra, e l'erosione amplificherebbe lo scarto.
// Le direzioni dei gradienti sono costanti scritte a mano per lo stesso motivo.

/** Hash di due interi e di un seme → intero senza segno a 32 bit. */
export function hash2(ix, iy, seed) {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mescola un seme con una costante: semi indipendenti per ogni livello di rumore. */
export function derivaSeme(seed, sale) {
  return hash2(sale, 0x51ed270b, seed);
}

/** Generatore pseudo-casuale (mulberry32): restituisce una funzione → [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seme numerico da un testo: un numero intero (es. "48213") vale se stesso, qualsiasi altro testo
 * passa per un hash FNV-1a. Così il seme si può condividere anche come parola.
 */
export function semeDaTesto(testo) {
  const t = String(testo).trim();
  if (/^\d{1,9}$/.test(t)) return Number(t) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// 16 direzioni unitarie (multipli di 22,5°), scritte come costanti.
const C1 = 0.9238795325112867, C2 = 0.7071067811865476, C3 = 0.3826834323650898;
const GX = new Float64Array([1, C1, C2, C3, 0, -C3, -C2, -C1, -1, -C1, -C2, -C3, 0, C3, C2, C1]);
const GY = new Float64Array([0, C3, C2, C1, 1, C1, C2, C3, 0, -C3, -C2, -C1, -1, -C1, -C2, -C3]);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Rumore a gradiente 2D (tipo Perlin), circa in [−0,7, 0,7], 0 sui nodi della griglia. */
export function gradiente(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g00 = hash2(ix, iy, seed) & 15, g10 = hash2(ix + 1, iy, seed) & 15;
  const g01 = hash2(ix, iy + 1, seed) & 15, g11 = hash2(ix + 1, iy + 1, seed) & 15;
  const n00 = GX[g00] * fx + GY[g00] * fy;
  const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
  const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
  const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  const u = fade(fx), v = fade(fy);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/**
 * fBm: somma di ottave di rumore a gradiente. x, y nelle unità del chiamante; `lunghezza` è la
 * lunghezza d'onda dell'ottava più ampia nelle stesse unità. Risultato circa in [−1, 1].
 */
export function fbm(x, y, seed, lunghezza, ottave = 5, guadagno = 0.5, lacunarita = 2) {
  let f = 1 / lunghezza, amp = 1, somma = 0, norma = 0;
  for (let i = 0; i < ottave; i++) {
    // Ogni ottava ha un seme suo e uno spostamento, così i nodi delle griglie non coincidono.
    somma += amp * gradiente(x * f + i * 17.31, y * f - i * 9.73, (seed + Math.imul(i, 0x9e3779b9)) | 0);
    norma += amp;
    amp *= guadagno;
    f *= lacunarita;
  }
  return (somma / norma) * 1.6;
}

/**
 * Rumore *ridged* multifrattale (Musgrave): linee di cresta strette che si diramano, per le catene
 * montuose. Ogni ottava è pesata dalla precedente: il dettaglio si concentra sulle creste.
 * Risultato in [0, 1].
 */
export function ridged(x, y, seed, lunghezza, ottave = 5, guadagno = 0.5, lacunarita = 2) {
  let f = 1 / lunghezza, amp = 1, somma = 0, norma = 0, peso = 1;
  for (let i = 0; i < ottave; i++) {
    let n = gradiente(x * f + i * 17.31, y * f - i * 9.73, (seed + Math.imul(i, 0x9e3779b9)) | 0);
    n = 1 - Math.abs(n) * 1.45;
    if (n < 0) n = 0;
    n *= n;
    somma += amp * n * peso;
    norma += amp;
    peso = n * 1.5;
    if (peso > 1) peso = 1;
    amp *= guadagno;
    f *= lacunarita;
  }
  return somma / norma;
}

/** Interpolazione «a S» tra a e b (0 sotto a, 1 sopra b). */
export function smoothstep(a, b, x) {
  let t = (x - a) / (b - a);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

/** Codice di controllo (FNV-1a su parole a 32 bit) di un array tipizzato: 8 cifre esadecimali. */
export function codiceControllo(array) {
  const u = new Uint32Array(array.buffer, array.byteOffset, array.byteLength >>> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Rumore a gradiente con le derivate esatte: scrive in out[0] il valore, in out[1], out[2] le derivate
 * rispetto a x e y. Stesso valore di gradiente(). Serve al fBm «eroso» delle Scene.
 */
export function gradienteD(x, y, seed, out) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g00 = hash2(ix, iy, seed) & 15, g10 = hash2(ix + 1, iy, seed) & 15;
  const g01 = hash2(ix, iy + 1, seed) & 15, g11 = hash2(ix + 1, iy + 1, seed) & 15;
  const ax = GX[g00], ay = GY[g00], bx = GX[g10], by = GY[g10];
  const cx = GX[g01], cy = GY[g01], dx = GX[g11], dy = GY[g11];
  const n00 = ax * fx + ay * fy;
  const n10 = bx * (fx - 1) + by * fy;
  const n01 = cx * fx + cy * (fy - 1);
  const n11 = dx * (fx - 1) + dy * (fy - 1);
  const u = fade(fx), v = fade(fy);
  const du = 30 * fx * fx * (fx - 1) * (fx - 1), dv = 30 * fy * fy * (fy - 1) * (fy - 1);
  const k = n00 - n10 - n01 + n11;
  out[0] = n00 + u * (n10 - n00) + v * (n01 - n00) + u * v * k;
  out[1] = ax + du * (n10 - n00) + u * (bx - ax) + v * (cx - ax) + du * v * k + u * v * (ax - bx - cx + dx);
  out[2] = ay + dv * (n01 - n00) + u * (by - ay) + v * (cy - ay) + dv * u * k + u * v * (ay - by - cy + dy);
  return out;
}

/**
 * Esegue fino in fondo un generatore «a pezzi» (funzioni function* che fanno yield ogni pochi ms: blocco che segue il
 * cavaliere, js/3d/blocchi.js) e ne restituisce il risultato: la versione tutta in una volta delle stesse funzioni.
 */
export function completa(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}
