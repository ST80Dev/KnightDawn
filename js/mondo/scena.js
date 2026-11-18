// Knight Dawn — blocco di terreno di una Scena ricavato dalla Carta (M6, passo 3).
// Modulo ES senza grafica né DOM.
//
// La quota di un punto del mondo è una funzione pura delle sue coordinate (e del seme): blocchi vicini
// combaciano senza giunture, e una Scena si rigenera identica senza salvare il terreno.
//   quota = Carta interpolata (B-spline cubica sui centri delle celle da 1 km: liscia, senza pieghe a
//           griglia) + dettaglio su più scale (fBm «eroso»), con ampiezza che cresce con la quota.
//
// Coordinate del mondo: metri; x verso est dal bordo ovest della Carta, z verso sud dal bordo nord.
// La cella (c, r) della Carta copre [c·cella, (c+1)·cella] × [r·cella, (r+1)·cella].
// Il blocco usa coordinate locali centrate sul suo centro (vedi docs/ESPLORAZIONE_3D.md, Coordinate).

import { gradienteD, derivaSeme, smoothstep } from './rumore.js';

export const SCENA = { lato: 2000, celle: 256 };   // 2×2 km, 257×257 vertici (come Tavullia)

// Dettaglio: lunghezza d'onda della prima ottava (m), ottave, ampiezza in funzione della quota.
const DETTAGLIO = {
  lunghezza: 1400, ottave: 6, guadagno: 0.5,
  // Ampiezza (m) in funzione della quota h della Carta: bassa in pianura, poi cresce forte dalla fascia
  // collinare (valli e crinali come a Tavullia: ~100 m di fondo valle ogni 500–800 m).
  // Tetto: oltre ~1300 m non cresce più (montagne percorribili a tratti, non pareti ovunque).
  ampiezza: { base: 8, perMetro: 0.05, collina: 0.32, rampa: [120, 420], massimo: 480, fondale: 1.5 },
  erosione: 1.0,                // quanto la pendenza accumulata smorza le ottave fini
};

// Rotazione tra un'ottava e l'altra (costanti esatte: 0,8 e 0,6), così le griglie non si allineano.
const RC = 0.8, RS = 0.6;

/** Quota della Carta interpolata con una B-spline cubica (m), nel punto (x, z) del mondo. */
export function quotaCarta(carta, x, z) {
  const { cols, rows, quota, cella } = carta;
  const u = x / cella - 0.5, v = z / cella - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const tu = u - i0, tv = v - j0;
  const wu = pesi(tu), wv = pesi(tv);
  let somma = 0;
  for (let b = 0; b < 4; b++) {
    let j = j0 - 1 + b;
    j = j < 0 ? 0 : j >= rows ? rows - 1 : j;
    let riga = 0;
    for (let a = 0; a < 4; a++) {
      let i = i0 - 1 + a;
      i = i < 0 ? 0 : i >= cols ? cols - 1 : i;
      riga += wu[a] * quota[j * cols + i];
    }
    somma += wv[b] * riga;
  }
  return somma;
}

function pesi(t) {
  const t2 = t * t, t3 = t2 * t, s = 1 - t;
  return [s * s * s / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

const _n = [0, 0, 0];

/**
 * fBm «eroso» (alla maniera di I. Quílez): ogni ottava è divisa per (1 + |gradiente accumulato|²),
 * così sui versanti ripidi il dettaglio fine si smorza e il rilievo prende valli lisce e creste nette.
 * Risultato circa in [−1, 1].
 * `pesi` (facoltativo): peso di ogni ottava, 0…1. L'orizzonte spegne le ottave fini con la distanza; senza
 * pesi il calcolo è identico a quello del blocco della Scena (le quote al bordo coincidono).
 */
function fbmEroso(x, z, seed, pesi = null) {
  const D = DETTAGLIO;
  let px = x / D.lunghezza, pz = z / D.lunghezza;
  let somma = 0, amp = 1, norma = 0, dx = 0, dz = 0;
  for (let o = 0; o < D.ottave; o++) {
    const p = pesi ? pesi[o] : 1;
    if (p > 0) {
      gradienteD(px, pz, (seed + Math.imul(o, 0x9e3779b9)) | 0, _n);
      dx += _n[1] * amp; dz += _n[2] * amp;
      const c = amp * _n[0] / (1 + D.erosione * (dx * dx + dz * dz));
      somma += pesi ? c * p : c;
    }
    norma += amp;
    amp *= D.guadagno;
    const qx = (RC * px - RS * pz) * 2, qz = (RS * px + RC * pz) * 2;   // ruota e raddoppia
    px = qx + 1.7; pz = qz - 3.1;
  }
  return (somma / norma) * 1.8;
}

/** Numero di ottave del dettaglio e loro lunghezze d'onda (m), per chi le spegne con la distanza. */
export const OTTAVE_DETTAGLIO = Array.from({ length: DETTAGLIO.ottave }, (_, o) => DETTAGLIO.lunghezza / 2 ** o);

/**
 * Quota (m) del mondo generato nel punto (x, z), in metri del mondo.
 * `pesi`: vedi fbmEroso (solo per l'orizzonte; il blocco della Scena non li passa).
 */
export function quotaMondo(carta, x, z, seedDettaglio = derivaSeme(carta.seme, 101), pesi = null) {
  const h = quotaCarta(carta, x, z);
  const A = DETTAGLIO.ampiezza;
  // Sulla costa il dettaglio resta pieno: su un pendio così dolce sposta la riva di ~100 m e la rende
  // irregolare (insenature, lingue di terra). Verso il largo si spegne.
  const ampiezza = h > 0
    ? Math.min(A.massimo, A.base + A.perMetro * h + A.collina * h * smoothstep(A.rampa[0], A.rampa[1], h))
    : A.fondale + (A.base - A.fondale) * smoothstep(-60, 0, h);
  return h + ampiezza * fbmEroso(x, z, seedDettaglio, pesi);
}

/**
 * Blocco di terreno di una Scena, nello stesso formato del terreno reale (griglia di quote + metadati):
 * terrain.js lo usa senza sapere da dove viene.
 * @param {object} carta  dalla generaCarta
 * @param {number} cx  centro del blocco, x del mondo (m)
 * @param {number} cz  centro del blocco, z del mondo (m)
 * @returns {{ meta: object, heights: Float32Array }}
 */
export function generaScena(carta, cx, cz) {
  const t0 = performance.now();
  const n = SCENA.celle + 1, cell = SCENA.lato / SCENA.celle, half = SCENA.lato / 2;
  const heights = new Float32Array(n * n);
  const seed = derivaSeme(carta.seme, 101);
  for (let r = 0; r < n; r++) {
    const z = cz - half + r * cell;
    for (let c = 0; c < n; c++) {
      heights[r * n + c] = quotaMondo(carta, cx - half + c * cell, z, seed);
    }
  }
  const meta = {
    name: `mondo-${carta.seme}`, cols: n, rows: n, cellSize: cell, sizeMeters: SCENA.lato,
    source: `generato · seme ${carta.seme} · centro ${(cx / 1000).toFixed(2)}, ${(cz / 1000).toFixed(2)} km`,
    seme: carta.seme, centroMondo: { x: cx, z: cz },
    ms: performance.now() - t0,
  };
  return { meta, heights };
}
