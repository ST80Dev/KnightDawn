// Knight Dawn — generatore della Carta (M6). Modulo ES senza grafica né DOM.
// Stesso seme → stessa Carta, su qualunque browser (vedi rumore.js).
//
// Fase 1 (passo 1): forma del continente e catene.
//   - fBm su grande scala con il dominio deformato (coste frastagliate, golfi, penisole);
//   - bordi liberi (terra o mare), inclinazione diversa per seme (più mare da un lato);
//   - livello del mare per quantile (10–22 % della superficie, secondo il «carattere» del seme);
//   - catene lungo le linee di zero di un rumore liscio, in tratti scelti da una maschera.
// Fase 2 (passo 2): quote in metri. Un campo «composto» (pianure + colline + catene) si rimappa con
//   una curva a fasce fissate per quantile: pianure 0–200 m, colline 200–700 m (~20 % della terra),
//   pedemonte 700–1500 m, montagna 1500–3500 m (4,5–10 % della terra). Dentro ogni fascia la curva è
//   lineare sul valore composto: l'ordine delle quote e la forma del rilievo non cambiano.
// Fase 3 (passo 2): massicci isolati (1500–3000 m), pochi e sparsi, a cono irregolare, lontani da coste
//   e catene; possono sorgere in mezzo alle colline.
//
// Coordinate: colonna 0 = ovest, riga 0 = nord; una cella = 1 km. Le lunghezze d'onda sono in km.

import { mulberry32, derivaSeme, fbm, ridged, smoothstep, codiceControllo } from './rumore.js';

export const CARTA_PREDEFINITA = { cols: 600, rows: 450, cella: 1000 };

// Parametri della forma (km dove non indicato). Valori di partenza, da tarare guardando le Carte.
const FORMA = {
  deformazione: { lunghezza: 200, ampiezza: 55, ottave: 3 },   // deformazione del dominio
  continente: { lunghezza: 240, ottave: 7, guadagno: 0.55 },   // forma d'insieme e dettaglio delle coste
  scalaGrande: { lunghezza: 650, peso: 0.45 },                 // masse di terra, golfi e mari interni
  // Bordi: nessun anello di mare forzato (regola del 2D, docs/WORLD_GEN.md in 2c869fa). I bordi possono
  // essere terra o mare secondo il rumore; solo una leggera spinta verso il mare negli ultimi km.
  bordo: { larghezza: 40, profondita: 0.15 },
  inclinazione: 0.30,                                          // quanto un lato può avere più mare
  mare: [0.10, 0.22],                                          // parte della superficie (GDD)
  montagna: [0.045, 0.10],                                     // parte della terra con catene alte (GDD)
  // Catene: lungo le linee di zero di un rumore su grande scala (linee lunghe e sinuose), solo dove una
  // maschera le ammette (tratti di lunghezza limitata). Contrafforti laterali da rumore ridged.
  catene: {
    linea: 300, larghezza: 0.09, pedemonte: 0.26,
    maschera: 360, rampaMaschera: 0.15, sogliaMontagna: 0.35,
    dettaglio: 32, contrafforti: 0.7, creste: 14, altezza: 0.75,
  },
};

// Fase 2: fasce di quota (m) e parte della terra in ciascuna, per seme. La montagna usa frazioneMontagna.
const QUOTE = {
  limiti: [0, 200, 700, 1500],          // pianura | collina | pedemonte | montagna
  frazioneColline: [0.17, 0.25],        // GDD: ~20 %
  frazionePedemonte: [0.05, 0.09],
  cima: [2800, 3500],                   // quota massima delle catene
  // Campo composto (unità arbitrarie, ~km): pesi delle parti.
  pianura: { peso: 0.18, saturazione: 0.35, ondulazione: 0.04 },
  // Colline: zone dal campo su grande scala e dai fianchi delle catene, con una rampa larga (salgono
  // dalla pianura in modo graduale); dentro, rilievo ondulato (fBm) più qualche dorsale lunga (ridged).
  colline: { lunghezza: 110, soglia: -0.15, rampa: 0.75, fianchi: 0.9, peso: 0.6, ondulato: 16, dorsali: 40 },
  catene: { peso: 3.2 },
  fondale: { costa: 5, massimo: 2500 },  // m sotto il livello del mare
};

// Fase 3: massicci isolati.
const MASSICCI = {
  numero: [3, 7], raggio: [9, 19], cima: [1500, 3000],
  distanzaCosta: 25, distanzaCatene: 50, distanzaTraLoro: 100, tentativi: 600,
};

/**
 * Genera la Carta per un seme.
 * @param {number} seme  intero senza segno a 32 bit (vedi semeDaTesto in rumore.js)
 * @returns {{
 *   seme: number, cols: number, rows: number, cella: number,
 *   quota: Float32Array,      // metri s.l.m. (mare negativo), riga per riga da nord
 *   mare: Uint8Array,         // 1 = mare
 *   catena: Float32Array,     // contributo delle catene 0…1
 *   massicci: {x:number, y:number, cima:number, raggio:number}[],
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
  // Aggiunti al passo 2 con un generatore a parte: la forma del passo 1 non cambia.
  const rng2 = mulberry32(derivaSeme(seme, 2));
  const FC = QUOTE.frazioneColline, FP = QUOTE.frazionePedemonte;
  carattere.frazioneColline = FC[0] + rng2() * (FC[1] - FC[0]);
  carattere.frazionePedemonte = FP[0] + rng2() * (FP[1] - FP[0]);
  carattere.cima = QUOTE.cima[0] + rng2() * (QUOTE.cima[1] - QUOTE.cima[0]);

  const sW = derivaSeme(seme, 11), sW2 = derivaSeme(seme, 12), sC = derivaSeme(seme, 13);
  const sG = derivaSeme(seme, 14);
  const sL = derivaSeme(seme, 16), sM = derivaSeme(seme, 17), sD = derivaSeme(seme, 18);
  const D = FORMA.deformazione, K = FORMA.continente, G = FORMA.scalaGrande;
  const BO = FORMA.bordo, R = FORMA.catene;
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2, raggio = Math.max(cx, cy);
  const inc = carattere.inclinazione;
  const distBordo = (x, y) => Math.min(x, y, cols - 1 - x, rows - 1 - y);

  // ─── Fase 1a: forma d'insieme (base), maschera e profilo delle catene ───
  const base = new Float32Array(n);
  const maschera = new Float32Array(n);
  const profilo = new Float32Array(n);
  const fianchi = new Float32Array(n);     // vicinanza a una linea di catena (0…1), per le colline
  const collinare = new Float32Array(n);   // campo delle colline (fase 2)
  const sH = derivaSeme(seme, 21), sT = derivaSeme(seme, 22), sP = derivaSeme(seme, 23);
  const QC = QUOTE.colline;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = x + D.ampiezza * fbm(x, y, sW, D.lunghezza, D.ottave);
      const wy = y + D.ampiezza * fbm(x, y, sW2, D.lunghezza, D.ottave);
      let e = fbm(wx, wy, sC, K.lunghezza, K.ottave, K.guadagno) + G.peso * fbm(wx, wy, sG, G.lunghezza, 2);

      const d = distBordo(x, y);
      e -= BO.profondita * (1 - smoothstep(0, BO.larghezza, d));
      e -= inc.forza * ((x - cx) * inc.x + (y - cy) * inc.y) / raggio;

      const i = y * cols + x;
      base[i] = e;
      maschera[i] = fbm(wx, wy, sM, R.maschera, 2);

      // Profilo della catena: vicinanza alla linea di zero di un rumore liscio su grande scala.
      const l = Math.abs(fbm(wx, wy, sL, R.linea, 2, 0.35));
      if (l < R.pedemonte) {
        const spina = 1 - smoothstep(0, R.larghezza, l);
        const piede = 1 - smoothstep(0, R.pedemonte, l);
        // La spina ha creste e selle (ridged a scala più piccola), non un profilo liscio.
        const creste = spina > 0 ? 0.55 + 0.45 * ridged(wx, wy, sD ^ 0x6a09e667, R.creste, 4) : 0;
        profilo[i] = 0.6 * spina * spina * creste + R.contrafforti * piede * ridged(wx, wy, sD, R.dettaglio, 5);
        fianchi[i] = piede;
      }
      collinare[i] = fbm(wx, wy, sH, QC.lunghezza, 4);
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

  // ─── Fase 1c: mare e catene ───
  const mare = new Uint8Array(n);
  const catena = new Float32Array(n);
  const mascheraFinale = new Float32Array(n);
  let celleMare = 0, minBase = livello;
  for (let i = 0; i < n; i++) {
    const e = base[i] - livello;
    if (e >= 0) {
      const m = smoothstep(sogliaMaschera, sogliaMaschera + R.rampaMaschera, maschera[i]);
      mascheraFinale[i] = m;
      catena[i] = profilo[i] * m * smoothstep(0.0, 0.1, e);   // niente catene a picco sul mare
    } else {
      mare[i] = 1;
      celleMare++;
      if (base[i] < minBase) minBase = base[i];
    }
  }

  // ─── Fase 2a: campo composto sulla terra (pianure + colline + catene) ───
  const QP = QUOTE.pianura;
  const composto = new Float32Array(n);
  const valoriTerra = new Float32Array(n - celleMare);
  let k = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (mare[i]) continue;
      const e = base[i] - livello;
      const pianura = QP.peso * e / (e + QP.saturazione) + QP.ondulazione * (fbm(x, y, sP, 7, 3) + 1);
      // Colline: dove il campo lo vuole e sui fianchi delle catene; dentro, valli e dorsali (ridged).
      const h = smoothstep(QC.soglia, QC.soglia + QC.rampa,
        collinare[i] + QC.fianchi * fianchi[i] * mascheraFinale[i]) * smoothstep(0, 0.03, e);
      let colline = 0;
      if (h > 0) {
        // Contrasto alto dentro le colline (valli e dorsali); il bordo sale con h², l'interno con h.
        const rilievo = 0.6 * smoothstep(-0.45, 0.45, fbm(x, y, sT, QC.ondulato, 5, 0.55))
          + 0.4 * ridged(x, y, sT ^ 0x2545f491, QC.dorsali, 3);
        colline = QC.peso * h * (0.15 * h + 1.0 * rilievo);
      }
      const c = catena[i];
      const v = pianura + colline + QUOTE.catene.peso * carattere.forzaCatene * c * Math.sqrt(c);
      composto[i] = v;
      valoriTerra[k++] = v;
    }
  }

  // ─── Fase 2b: curva delle quote a fasce fissate per quantile ───
  valoriTerra.sort();
  const fM = carattere.frazioneMontagna, fP = carattere.frazionePedemonte, fH = carattere.frazioneColline;
  const v = [valoriTerra[0], quantile(valoriTerra, 1 - fH - fP - fM), quantile(valoriTerra, 1 - fP - fM),
    quantile(valoriTerra, 1 - fM), valoriTerra[valoriTerra.length - 1]];
  const metri = [...QUOTE.limiti, carattere.cima];
  const quota = new Float32Array(n);
  const QF = QUOTE.fondale;
  const spanFondale = (livello - minBase) || 1;
  for (let i = 0; i < n; i++) {
    if (mare[i]) {
      const g = (livello - base[i]) / spanFondale;          // 0 sulla costa, 1 nel punto più profondo
      quota[i] = -(QF.costa + (QF.massimo - QF.costa) * g * g);
      continue;
    }
    const c = composto[i];
    let f = 3;
    while (f > 0 && c < v[f]) f--;
    const t = (c - v[f]) / ((v[f + 1] - v[f]) || 1);
    const m = metri[f] + (metri[f + 1] - metri[f]) * (t > 1 ? 1 : t);
    quota[i] = m < 1 ? 1 : m;                                // la terra sta sopra il mare
  }

  // Fascia di montagna per rango, non lineare: pochi picchi estremi schiaccerebbero quasi tutte le celle
  // poco sopra i 1500 m (catene senza dislivelli). Con il rango (curva r^1,25) le quote si distribuiscono
  // tra 1500 m e la cima, e celle vicine con valore diverso hanno quote ben diverse.
  const alte = [];
  for (let i = 0; i < n; i++) if (!mare[i] && composto[i] >= v[3]) alte.push(i);
  alte.sort((a, b) => (composto[a] - composto[b]) || (a - b));
  for (let r = 0; r < alte.length; r++) {
    const t = alte.length > 1 ? r / (alte.length - 1) : 1;
    quota[alte[r]] = metri[3] + (metri[4] - metri[3]) * t * Math.sqrt(Math.sqrt(t));   // t^1,25
  }

  // ─── Fase 3: massicci isolati ───
  const massicci = piazzaMassicci(seme, cols, rows, quota, mare, catena);

  // Statistiche: parte della terra per fascia di quota (dopo i massicci).
  const fasce = [0, 0, 0, 0];
  let cima = 0;
  for (let i = 0; i < n; i++) {
    if (mare[i]) continue;
    const q = quota[i];
    fasce[q < 200 ? 0 : q < 700 ? 1 : q < 1500 ? 2 : 3]++;
    if (q > cima) cima = q;
  }
  const celleTerra2 = n - celleMare;

  const ms = performance.now() - t0;
  return {
    seme, cols, rows, cella: opzioni.cella ?? CARTA_PREDEFINITA.cella,
    quota, mare, catena, massicci, carattere,
    statistiche: {
      frazioneMare: celleMare / n, ms, cima,
      fasce: { pianura: fasce[0] / celleTerra2, collina: fasce[1] / celleTerra2,
        pedemonte: fasce[2] / celleTerra2, montagna: fasce[3] / celleTerra2 },
    },
    controllo: codiceControllo(quota),
  };
}

// ─── Fase 3: massicci isolati ───────────────────────────────────────────

/** Distanza (in celle, 4-vicini) dalla cella sorgente più vicina; 65535 se non raggiungibile. */
function distanze(cols, rows, sorgente) {
  const n = cols * rows;
  const d = new Uint16Array(n).fill(65535);
  const coda = new Int32Array(n);
  let testa = 0, fine = 0;
  for (let i = 0; i < n; i++) if (sorgente(i)) { d[i] = 0; coda[fine++] = i; }
  while (testa < fine) {
    const i = coda[testa++], x = i % cols, nd = d[i] + 1;
    if (x > 0 && d[i - 1] > nd) { d[i - 1] = nd; coda[fine++] = i - 1; }
    if (x < cols - 1 && d[i + 1] > nd) { d[i + 1] = nd; coda[fine++] = i + 1; }
    if (i >= cols && d[i - cols] > nd) { d[i - cols] = nd; coda[fine++] = i - cols; }
    if (i < n - cols && d[i + cols] > nd) { d[i + cols] = nd; coda[fine++] = i + cols; }
  }
  return d;
}

/**
 * Pochi massicci sparsi, a cono irregolare: il raggio varia con la direzione (rumore sulla direzione
 * unitaria, niente trigonometria), il profilo sta tra il cono e la cupola, con creste ridged sui fianchi.
 * Modifica `quota` (solo sulla terra, solo in alto) e restituisce l'elenco.
 */
function piazzaMassicci(seme, cols, rows, quota, mare, catena) {
  const M = MASSICCI;
  const rng = mulberry32(derivaSeme(seme, 3));
  const sF = derivaSeme(seme, 31), sR = derivaSeme(seme, 32);
  const distCosta = distanze(cols, rows, (i) => mare[i] === 1);
  const distCatene = distanze(cols, rows, (i) => catena[i] > 0.15);
  const quanti = M.numero[0] + Math.floor(rng() * (M.numero[1] - M.numero[0] + 1));
  const elenco = [];
  for (let t = 0; t < M.tentativi && elenco.length < quanti; t++) {
    const x = Math.floor(rng() * cols), y = Math.floor(rng() * rows), i = y * cols + x;
    if (mare[i] || distCosta[i] < M.distanzaCosta || distCatene[i] < M.distanzaCatene) continue;
    if (elenco.some((m) => (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y) < M.distanzaTraLoro * M.distanzaTraLoro)) continue;
    elenco.push({
      x, y,
      raggio: M.raggio[0] + rng() * (M.raggio[1] - M.raggio[0]),
      cima: M.cima[0] + rng() * (M.cima[1] - M.cima[0]),
      ox: rng() * 100, oy: rng() * 100,
    });
  }
  for (const m of elenco) {
    const base = quota[m.y * cols + m.x];
    const salita = m.cima - base;
    const creste = (x, y) => 0.85 + 0.15 * fbm(x, y, sR, 7, 3);
    const normaCentro = creste(m.x, m.y);                   // la cima è esattamente m.cima
    const rMax = Math.ceil(m.raggio * 1.4);
    let massima = base;
    for (let dy = -rMax; dy <= rMax; dy++) {
      for (let dx = -rMax; dx <= rMax; dx++) {
        const x = m.x + dx, y = m.y + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const i = y * cols + x;
        if (mare[i]) continue;
        const r = Math.sqrt(dx * dx + dy * dy);
        let rLocale = m.raggio;
        if (r > 0) rLocale *= 1 + 0.25 * fbm(dx / r * 0.9 + m.ox, dy / r * 0.9 + m.oy, sF, 1, 2);
        const t = 1 - r / rLocale;
        if (t <= 0) continue;
        const profilo = t * (0.35 + 0.65 * t) * creste(x, y) / normaCentro;
        const q = Math.min(m.cima, base + salita * profilo);
        if (q > quota[i]) quota[i] = q;
        if (quota[i] > massima) massima = quota[i];
      }
    }
    m.cima = Math.round(massima);
    delete m.ox; delete m.oy;
  }
  return elenco;
}
