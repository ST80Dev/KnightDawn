// Knight Dawn — generatore della Carta (M6). Modulo ES senza grafica né DOM.
// Stesso seme → stessa Carta, su qualunque browser (vedi rumore.js).
//
// Passo 1 (fase 1 di docs/ESPLORAZIONE_3D.md, M6): forma del continente e catene.
//   - fBm su grande scala con il dominio deformato (coste frastagliate, golfi, penisole);
//   - abbassamento verso i bordi della Carta, con un'inclinazione diversa per seme (più mare da un lato);
//   - livello del mare per quantile (10–22 % della superficie, secondo il «carattere» del seme);
//   - catene montuose da rumore *ridged*, solo sulla terra e solo dove una maschera su grande scala
//     le ammette (linee che si diramano, non altopiani a macchia).
// La quota è ancora «grezza» (terra 0…1, mare −1…0): i metri arrivano al passo 2.
//
// Coordinate: colonna 0 = ovest, riga 0 = nord; una cella = 1 km. Le lunghezze d'onda sono in km.

import { mulberry32, derivaSeme, fbm, ridged, smoothstep, codiceControllo } from './rumore.js';

export const CARTA_PREDEFINITA = { cols: 600, rows: 450, cella: 1000 };

// Parametri della forma (km dove non indicato). Valori di partenza, da tarare guardando le Carte.
const FORMA = {
  deformazione: { lunghezza: 200, ampiezza: 55, ottave: 3 },   // deformazione del dominio
  continente: { lunghezza: 240, ottave: 7, guadagno: 0.55 },   // forma d'insieme e dettaglio delle coste
  scalaGrande: { lunghezza: 650, peso: 0.45 },                 // masse di terra, golfi e mari interni
  // Verso i bordi: un abbassamento largo e dolce più uno stretto, di larghezza variabile (le coste non
  // corrono parallele al bordo). Troppo forte consumerebbe tutto il mare nella cornice.
  bordoLargo: { larghezza: 150, profondita: 0.45 },
  bordoStretto: { larghezza: 25, variazione: 15, profondita: 0.5 },
  // Sicurezza: entro 5–45 km dal bordo una penalità che cresce verso il bordo, perché il mare ci sia
  // anche dove il rumore è forte. Agisce prima del quantile: la parte di mare resta quella voluta.
  costaMinima: { distanza: 25, variazione: 20, pendenza: 0.03 },
  inclinazione: 0.30,                                          // quanto un lato può avere più mare
  // Mare per quantile, compreso quello attorno al continente. Il GDD dice 10–22 %, ma la sola fascia
  // di mare lungo i bordi di 600×450 km vale ~15 %: con 10–22 % non restano golfi né mari interni.
  // [Proposta da confermare con l'utente] 25–38 %.
  mare: [0.25, 0.38],
  montagna: [0.045, 0.10],                                     // parte della terra con catene alte (GDD)
  pianura: 0.5, saturazione: 0.35,                             // quota grezza fuori dalle catene
  // Catene: lungo le linee di zero di un rumore su grande scala (linee lunghe e sinuose), solo dove una
  // maschera le ammette (tratti di lunghezza limitata). Contrafforti laterali da rumore ridged.
  catene: {
    linea: 300, larghezza: 0.09, pedemonte: 0.26,
    maschera: 360, rampaMaschera: 0.15, sogliaMontagna: 0.35,
    dettaglio: 45, altezza: 0.75,
  },
};

/**
 * Genera la Carta per un seme.
 * @param {number} seme  intero senza segno a 32 bit (vedi semeDaTesto in rumore.js)
 * @returns {{
 *   seme: number, cols: number, rows: number, cella: number,
 *   quota: Float32Array,      // grezza: terra 0…1, mare −1…0 (riga per riga da nord)
 *   mare: Uint8Array,         // 1 = mare
 *   catena: Float32Array,     // contributo delle catene 0…1 (per la vista e per il passo 2)
 *   carattere: object, statistiche: object, controllo: string,
 * }}
 */
export function generaCarta(seme, opzioni = {}) {
  const t0 = performance.now();
  const cols = opzioni.cols ?? CARTA_PREDEFINITA.cols;
  const rows = opzioni.rows ?? CARTA_PREDEFINITA.rows;
  const n = cols * rows;
  seme >>>= 0;

  // Carattere del seme: mondi diversi tra loro (più o meno mare, catene, inclinazione).
  const rng = mulberry32(derivaSeme(seme, 1));
  const ix = rng() * 2 - 1, iy = rng() * 2 - 1;
  const il = Math.sqrt(ix * ix + iy * iy) || 1;
  const carattere = {
    frazioneMare: FORMA.mare[0] + rng() * (FORMA.mare[1] - FORMA.mare[0]),
    frazioneMontagna: FORMA.montagna[0] + rng() * (FORMA.montagna[1] - FORMA.montagna[0]),
    forzaCatene: 0.8 + rng() * 0.4,
    inclinazione: { x: ix / il, y: iy / il, forza: FORMA.inclinazione * rng() },
  };

  const sW = derivaSeme(seme, 11), sW2 = derivaSeme(seme, 12), sC = derivaSeme(seme, 13);
  const sG = derivaSeme(seme, 14), sB = derivaSeme(seme, 15);
  const sL = derivaSeme(seme, 16), sM = derivaSeme(seme, 17), sD = derivaSeme(seme, 18);
  const D = FORMA.deformazione, K = FORMA.continente, G = FORMA.scalaGrande;
  const BL = FORMA.bordoLargo, BS = FORMA.bordoStretto, R = FORMA.catene;
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2, raggio = Math.max(cx, cy);
  const inc = carattere.inclinazione;
  const distBordo = (x, y) => Math.min(x, y, cols - 1 - x, rows - 1 - y);

  // ─── Fase 1a: forma d'insieme (base), maschera e profilo delle catene ───
  const base = new Float32Array(n);
  const maschera = new Float32Array(n);
  const profilo = new Float32Array(n);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = x + D.ampiezza * fbm(x, y, sW, D.lunghezza, D.ottave);
      const wy = y + D.ampiezza * fbm(x, y, sW2, D.lunghezza, D.ottave);
      let e = fbm(wx, wy, sC, K.lunghezza, K.ottave, K.guadagno) + G.peso * fbm(wx, wy, sG, G.lunghezza, 2);

      const d = distBordo(x, y);
      const tl = 1 - smoothstep(0, BL.larghezza, d);
      const ts = 1 - smoothstep(0, BS.larghezza + BS.variazione * fbm(x, y, sB, 140, 2), d);
      e -= BL.profondita * tl * tl + BS.profondita * ts * ts;
      e -= inc.forza * ((x - cx) * inc.x + (y - cy) * inc.y) / raggio;
      const cm = FORMA.costaMinima;
      const dentro = cm.distanza + cm.variazione * fbm(x, y, sB ^ 0x5bd1e995, 120, 3) - d;
      if (dentro > 0) e -= cm.pendenza * dentro;

      const i = y * cols + x;
      base[i] = e;
      maschera[i] = fbm(wx, wy, sM, R.maschera, 2);

      // Profilo della catena: vicinanza alla linea di zero di un rumore liscio su grande scala.
      const l = Math.abs(fbm(wx, wy, sL, R.linea, 2, 0.35));
      if (l < R.pedemonte) {
        const spina = 1 - smoothstep(0, R.larghezza, l);
        const piede = 1 - smoothstep(0, R.pedemonte, l);
        profilo[i] = 0.6 * spina * spina + 0.55 * piede * ridged(wx, wy, sD, R.dettaglio, 5);
      }
    }
  }

  // ─── Fase 1b: livello del mare per quantile ───
  const quantile = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * arr.length)))];
  const livello = quantile(Float32Array.from(base).sort(), carattere.frazioneMare);

  // Soglia della maschera delle catene: la si cerca (bisezione) perché le catene alte coprano la parte
  // di terra voluta dal carattere del seme. Così ogni mondo ha le sue montagne, ovunque cadano le linee.
  const terra = [];
  for (let i = 0; i < n; i++) if (base[i] >= livello && profilo[i] > R.sogliaMontagna) terra.push(i);
  let celleTerra = 0;
  for (let i = 0; i < n; i++) if (base[i] >= livello) celleTerra++;
  const areaMontagna = (soglia) => {
    let a = 0;
    for (const i of terra) {
      if (profilo[i] * smoothstep(soglia, soglia + R.rampaMaschera, maschera[i]) > R.sogliaMontagna) a++;
    }
    return a / celleTerra;
  };
  let lo = -1.5, hi = 1.5;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (areaMontagna(mid) > carattere.frazioneMontagna) lo = mid; else hi = mid;
  }
  const sogliaMaschera = (lo + hi) / 2;

  // ─── Fase 1c: quota grezza. Terra fuori dalle catene: pianure e colline che si saturano. ───
  const quota = new Float32Array(n);
  const mare = new Uint8Array(n);
  const catena = new Float32Array(n);
  let maxTerra = 0, minMare = 0, celleMare = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let e = base[i] - livello;
      if (distBordo(x, y) < 2 && e >= 0) e = -0.001;        // la cornice esterna è sempre mare
      if (e >= 0) {
        const m = smoothstep(sogliaMaschera, sogliaMaschera + R.rampaMaschera, maschera[i]);
        const c = profilo[i] * m * smoothstep(0.0, 0.1, e);   // niente catene a picco sul mare
        catena[i] = c;
        e = FORMA.pianura * e / (e + FORMA.saturazione) + R.altezza * carattere.forzaCatene * c;
        if (e > maxTerra) maxTerra = e;
      } else {
        mare[i] = 1;
        celleMare++;
        if (e < minMare) minMare = e;
      }
      quota[i] = e;
    }
  }
  for (let i = 0; i < n; i++) {
    quota[i] = mare[i] ? (minMare < 0 ? quota[i] / -minMare : -1) : quota[i] / (maxTerra || 1);
  }

  const ms = performance.now() - t0;
  return {
    seme, cols, rows, cella: opzioni.cella ?? CARTA_PREDEFINITA.cella,
    quota, mare, catena, carattere,
    statistiche: { frazioneMare: celleMare / n, ms },
    controllo: codiceControllo(quota),
  };
}
