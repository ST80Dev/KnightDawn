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

import { mulberry32, derivaSeme, hash2, fbm, ridged, smoothstep, codiceControllo } from './rumore.js';

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
  // m sotto il livello del mare. Già 40 m nella prima cella di mare: con meno, l'interpolazione liscia
  // delle Scene (passo 3) spostava la costa verso il largo e il mare quasi spariva.
  fondale: { costa: 40, massimo: 2500 },
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

  // ─── Fasi 4–5: drenaggio, valli, fiumi e laghi ───
  const dren = drenaggio(cols, rows, quota, mare, seme);

  // Statistiche: parte della terra per fascia di quota (dopo massicci e valli).
  const fasce = [0, 0, 0, 0];
  let cima = 0;
  for (let i = 0; i < n; i++) {
    if (mare[i] || dren.acque[i] === ACQUA.LAGO) continue;
    const q = quota[i];
    fasce[q < 200 ? 0 : q < 700 ? 1 : q < 1500 ? 2 : 3]++;
    if (q > cima) cima = q;
  }
  const celleTerra2 = fasce[0] + fasce[1] + fasce[2] + fasce[3];

  const ms = performance.now() - t0;
  return {
    seme, cols, rows, cella: opzioni.cella ?? CARTA_PREDEFINITA.cella,
    quota, mare, catena, massicci, carattere,
    acque: dren.acque,             // ACQUA.TERRA | MARE | LAGO_COSTIERO | LAGO
    livelloAcqua: dren.livello,    // m: superficie dei laghi in quota (0 altrove)
    ricevente: dren.ricevente,     // cella a valle (-1 = foce: mare, lago costiero, bordo)
    bacino: dren.bacino,           // km² drenati dalla cella
    sogliaFiume: DRENAGGIO.fiume,
    statistiche: {
      frazioneMare: celleMare / n, ms, cima, laghi: dren.laghi,
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

// ─── Fasi 4–5: drenaggio, valli, fiumi e laghi ─────────────────────────
// Lavorano su una quota qualunque (generata o, più avanti, reale): non sanno come è stata creata.
//   1. riempimento delle conche senza ε (priority-flood): le zone piatte sono esattamente piane;
//   2. direzione di flusso: verso una vicina più bassa; sulle zone piatte il gradiente combinato di
//      Barnes, Lehman e Mulla (2014), così l'acqua converge e non corre in righe parallele;
//   3. bacini in ordine topologico sul grafo del flusso.
// Senza cicli per costruzione: fuori dalle zone piatte si scende sempre, dentro scende il gradiente,
// e si esce da una zona solo verso una cella più bassa.

const DRENAGGIO = {
  mareMinimo: 1500,        // km²: uno specchio d'acqua chiuso più piccolo è un lago (a quota 0)
  // Valli: letto a quota − k·√(bacino km²) (al massimo una frazione della quota); versanti abbassati verso
  // il letto entro raggioBase + raggioPer·√bacino km. Si scava solo dove il bacino supera areaMinima.
  valli: { k: 8, frazione: 0.45, areaMinima: 15, raggioBase: 1.5, raggioPer: 0.12, raggioMax: 8 },
  fiume: 150,              // km² di bacino: da qui una cella porta un fiume
  lago: { profondita: 3, area: 4 },   // conche più profonde (m) e più ampie (km²) diventano laghi
  passoLetto: 0.01,        // m: dislivello minimo del letto scavato tra una cella e quella a valle
  // Direzione di flusso: tra le vicine che scendono almeno quanto questa frazione della più ripida se ne
  // sceglie una con un hash deterministico. Su un pendio uniforme la sola più ripida darebbe righe
  // parallele allineate alla griglia; così i corsi d'acqua serpeggiano (e scendono comunque tutti).
  quasiRipida: 0.9,
  ondulazionePianura: { metri: 6, lunghezza: 12 },   // micro-rilievo delle pianure (il flusso serpeggia)
};

const ACQUA = { TERRA: 0, MARE: 1, LAGO_COSTIERO: 2, LAGO: 3 };
export { ACQUA };

// 8 vicini: spostamenti e distanze (√2 come costante esatta).
const V8X = [1, -1, 0, 0, 1, 1, -1, -1], V8Y = [0, 0, 1, -1, 1, -1, 1, -1];
const V8D = [1, 1, 1, 1, 1.4142135623730951, 1.4142135623730951, 1.4142135623730951, 1.4142135623730951];

/** Mare (collegato al bordo o ampio) e laghi costieri (specchi chiusi piccoli, a quota 0). */
function classificaAcque(cols, rows, mare) {
  const n = cols * rows;
  const tipo = new Uint8Array(n);
  const coda = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mare[s] || tipo[s]) continue;
    let testa = 0, fine = 0, bordo = false;
    coda[fine++] = s; tipo[s] = 255;
    while (testa < fine) {
      const i = coda[testa++], x = i % cols, y = (i - x) / cols;
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) bordo = true;
      for (let k = 0; k < 4; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (mare[j] && !tipo[j]) { tipo[j] = 255; coda[fine++] = j; }
      }
    }
    const t = bordo || fine >= DRENAGGIO.mareMinimo ? ACQUA.MARE : ACQUA.LAGO_COSTIERO;
    for (let k = 0; k < fine; k++) tipo[coda[k]] = t;
  }
  return tipo;
}

/** Foci: mare, laghi costieri e bordi di terra (fiumi che escono oltre il confine). */
function foci(cols, rows, acque) {
  const f = new Uint8Array(cols * rows);
  for (let i = 0; i < f.length; i++) {
    const x = i % cols, y = (i - x) / cols;
    if (acque[i] === ACQUA.MARE || acque[i] === ACQUA.LAGO_COSTIERO
      || x === 0 || y === 0 || x === cols - 1 || y === rows - 1) f[i] = 1;
  }
  return f;
}

/**
 * Priority-flood (Barnes et al., 2014) senza ε: dalle foci si risale in ordine di quota; una cella più
 * bassa di quella da cui è raggiunta sale al suo livello (conca colmata, superficie esattamente piana).
 * Coda di priorità a heap binario su (quota, indice): a parità decide l'indice (deterministico).
 */
function riempi(cols, rows, quota, foce) {
  const n = cols * rows;
  const riempita = new Float64Array(n);
  const visto = new Uint8Array(n);
  const hk = new Float64Array(n), hi = new Int32Array(n);
  let dim = 0;
  const minore = (a, b) => hk[a] < hk[b] || (hk[a] === hk[b] && hi[a] < hi[b]);
  const scambia = (a, b) => {
    const k = hk[a]; hk[a] = hk[b]; hk[b] = k;
    const i = hi[a]; hi[a] = hi[b]; hi[b] = i;
  };
  const metti = (k, i) => {
    let c = dim++;
    hk[c] = k; hi[c] = i;
    while (c > 0) { const p = (c - 1) >> 1; if (!minore(c, p)) break; scambia(c, p); c = p; }
  };
  const togli = () => {
    const i = hi[0];
    dim--;
    if (dim > 0) {
      hk[0] = hk[dim]; hi[0] = hi[dim];
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < dim && minore(l, m)) m = l;
        if (r < dim && minore(r, m)) m = r;
        if (m === c) break;
        scambia(c, m); c = m;
      }
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    if (!foce[i]) continue;
    visto[i] = 1;
    riempita[i] = quota[i] < 0 ? 0 : quota[i];        // acqua: livello del mare
    metti(riempita[i], i);
  }
  while (dim > 0) {
    const i = togli();
    const x = i % cols, y = (i - x) / cols;
    for (let k = 0; k < 8; k++) {
      const nx = x + V8X[k], ny = y + V8Y[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (visto[j]) continue;
      visto[j] = 1;
      riempita[j] = quota[j] > riempita[i] ? quota[j] : riempita[i];
      metti(riempita[j], j);
    }
  }
  return riempita;
}

/** Cella a valle di ogni cella (−1 per le foci e, per ora, per le celle delle zone piatte). */
function direzioni(cols, rows, riempita, foce, seme) {
  const n = cols * rows;
  const ricevente = new Int32Array(n).fill(-1);
  const p = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    if (foce[i]) continue;
    const x = i % cols, y = (i - x) / cols;
    let pendenza = 0;
    for (let k = 0; k < 8; k++) {
      p[k] = (riempita[i] - riempita[(y + V8Y[k]) * cols + x + V8X[k]]) / V8D[k];
      if (p[k] > pendenza) pendenza = p[k];
    }
    if (pendenza <= 0) {
      // Piatta, ma accanto a una foce (bordo o mare) alla stessa quota: si esce lì. Altrimenti zona piatta.
      for (let k = 0; k < 8; k++) {
        const j = (y + V8Y[k]) * cols + x + V8X[k];
        if (foce[j] && riempita[j] <= riempita[i]) { ricevente[i] = j; break; }
      }
      continue;
    }
    let voto = -1;
    for (let k = 0; k < 8; k++) {
      if (p[k] <= 0 || p[k] < DRENAGGIO.quasiRipida * pendenza) continue;
      const h = hash2(i, k, seme);
      if (h > voto) { voto = h; ricevente[i] = (y + V8Y[k]) * cols + x + V8X[k]; }
    }
  }
  return ricevente;
}

/**
 * Zone piatte (Barnes, Lehman e Mulla, 2014). Una zona è un insieme collegato di celle con la stessa
 * quota riempita, che contiene almeno una cella senza vicine più basse. Gradiente combinato:
 * 2 × distanza dal bordo basso (celle con una vicina più bassa: da lì l'acqua esce) + vicinanza al bordo
 * alto (celle con una vicina più alta: l'acqua se ne allontana). Ogni cella senza direzione scende lungo
 * il gradiente; le celle del bordo basso tengono la loro direzione (verso una vicina più bassa).
 */
function dirigiZonePiatte(cols, rows, riempita, foce, ricevente, seme) {
  const n = cols * rows;
  const zona = new Int32Array(n).fill(-1);
  const dBasso = new Int32Array(n).fill(-1), dAlto = new Int32Array(n).fill(-1);
  const celle = new Int32Array(n), codaB = new Int32Array(n), codaA = new Int32Array(n);
  let nz = 0;
  for (let s = 0; s < n; s++) {
    if (foce[s] || ricevente[s] >= 0 || zona[s] >= 0) continue;
    const livello = riempita[s];
    let nc = 0, nb = 0, na = 0;
    celle[nc++] = s; zona[s] = nz;
    for (let t = 0; t < nc; t++) {
      const i = celle[t], x = i % cols, y = (i - x) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (zona[j] < 0 && !foce[j] && riempita[j] === livello) { zona[j] = nz; celle[nc++] = j; }
      }
    }
    for (let t = 0; t < nc; t++) {
      const i = celle[t], x = i % cols, y = (i - x) / cols;
      let alto = false;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (riempita[ny * cols + nx] > livello) alto = true;
      }
      if (ricevente[i] >= 0) { dBasso[i] = 0; codaB[nb++] = i; }     // bordo basso: ha già dove scendere
      if (alto) { dAlto[i] = 0; codaA[na++] = i; }
    }
    const espandi = (coda, quanti, d) => {
      for (let t = 0; t < quanti; t++) {
        const i = coda[t], x = i % cols, y = (i - x) / cols;
        for (let k = 0; k < 8; k++) {
          const nx = x + V8X[k], ny = y + V8Y[k];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (zona[j] === nz && d[j] < 0) { d[j] = d[i] + 1; coda[quanti++] = j; }
        }
      }
      return quanti;
    };
    nb = espandi(codaB, nb, dBasso);
    na = espandi(codaA, na, dAlto);
    let maxAlto = 0;
    for (let t = 0; t < na; t++) if (dAlto[codaA[t]] > maxAlto) maxAlto = dAlto[codaA[t]];
    const g = (i) => 2 * dBasso[i] + (dAlto[i] >= 0 ? maxAlto - dAlto[i] : 0);
    for (let t = 0; t < nc; t++) {
      const i = celle[t];
      if (ricevente[i] >= 0 || dBasso[i] < 0) continue;
      const x = i % cols, y = (i - x) / cols, gi = g(i);
      let m = -1, gm = gi, voto = -1;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (zona[j] !== nz || dBasso[j] < 0) continue;
        const gj = g(j), h = hash2(i, k, seme);
        if (gj < gm || (gj === gm && gj < gi && h > voto)) { gm = gj; m = j; voto = h; }
      }
      if (m >= 0) ricevente[i] = m;
    }
    nz++;
  }
}

/** Ordine topologico sul grafo del flusso: ogni cella prima di quella a valle (Kahn). */
function ordineTopologico(ricevente) {
  const n = ricevente.length;
  const entranti = new Int32Array(n);
  for (let i = 0; i < n; i++) if (ricevente[i] >= 0) entranti[ricevente[i]]++;
  const ordine = new Int32Array(n);
  let fine = 0;
  for (let i = 0; i < n; i++) if (entranti[i] === 0) ordine[fine++] = i;
  for (let t = 0; t < fine; t++) {
    const j = ricevente[ordine[t]];
    if (j >= 0 && --entranti[j] === 0) ordine[fine++] = j;
  }
  return ordine.subarray(0, fine);       // le celle in un ciclo (non dovrebbero esserci) restano fuori
}

/** Direzioni complete e bacini (km² drenati, cella compresa; solo terra e laghi in quota). */
function flusso(cols, rows, riempita, foce, acque, seme) {
  const ricevente = direzioni(cols, rows, riempita, foce, seme);
  dirigiZonePiatte(cols, rows, riempita, foce, ricevente, seme);
  const ordine = ordineTopologico(ricevente);
  const bacino = new Float32Array(cols * rows);
  for (let t = 0; t < ordine.length; t++) {
    const i = ordine[t];
    if (acque[i] === ACQUA.MARE || acque[i] === ACQUA.LAGO_COSTIERO) continue;
    bacino[i] += 1;
    if (ricevente[i] >= 0) bacino[ricevente[i]] += bacino[i];
  }
  return { ricevente, bacino, ordine };
}

/**
 * Fase 4 (versione semplice): scava le valli lungo il drenaggio.
 *   1. Letto dei fiumi: quota − k·√bacino (al massimo una frazione della quota), poi corretto dalla foce
 *      verso monte perché scenda sempre (mai più basso del letto a valle).
 *   2. Versanti: ogni cella vicina a un fiume si abbassa VERSO il letto secondo un profilo a V, mai sotto:
 *      lo scavo non crea conche nuove.
 */
function scavaValli(cols, rows, quota, acque, bacino, ricevente, ordine) {
  const V = DRENAGGIO.valli;
  const n = cols * rows;
  const letto = new Float32Array(n).fill(NaN);
  for (let t = ordine.length - 1; t >= 0; t--) {       // dalla foce verso monte: la cella a valle è già fatta
    const i = ordine[t];
    if (acque[i] || bacino[i] < V.areaMinima) continue;
    let b = quota[i] - Math.min(V.k * Math.sqrt(bacino[i]), V.frazione * quota[i]);
    const j = ricevente[i];
    if (j >= 0 && !Number.isNaN(letto[j]) && b < letto[j] + DRENAGGIO.passoLetto) b = letto[j] + DRENAGGIO.passoLetto;
    if (b > quota[i]) b = quota[i];
    letto[i] = b;
  }
  const nuova = Float32Array.from(quota);
  for (let i = 0; i < n; i++) {
    const b = letto[i];
    if (Number.isNaN(b)) continue;
    const raggio = Math.min(V.raggioMax, V.raggioBase + V.raggioPer * Math.sqrt(bacino[i]));
    const r = Math.ceil(raggio), x0 = i % cols, y0 = (i - x0) / cols;
    for (let dy = -r; dy <= r; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= rows) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= cols) continue;
        const j = y * cols + x;
        if (acque[j] || quota[j] <= b) continue;
        const t = Math.sqrt(dx * dx + dy * dy) / raggio;
        if (t >= 1) continue;
        // Profilo a V: il versante scende sempre verso il fiume (con un fondo piatto i rigagnoli
        // correrebbero affiancati lungo il fondovalle invece di confluire).
        const q = b + (quota[j] - b) * t;
        if (q < nuova[j]) nuova[j] = q;
      }
    }
  }
  for (let i = 0; i < n; i++) if (!acque[i]) quota[i] = nuova[i] < 1 ? 1 : nuova[i];
}

/**
 * Fasi 4–5 complete. Modifica `quota` (micro-rilievo delle pianure, valli scavate, conche colmate: il letto
 * dei fiumi non sale mai) e restituisce acque, livelli dei laghi, direzioni di flusso, bacini, numero di laghi.
 */
export function drenaggio(cols, rows, quota, mare, seme = 0) {
  const n = cols * rows;
  const acque = classificaAcque(cols, rows, mare);
  const foce = foci(cols, rows, acque);
  const sF = derivaSeme(seme, 42);

  // Micro-rilievo delle pianure (si spegne verso i 200 m): il flusso serpeggia invece di correre dritto.
  const OP = DRENAGGIO.ondulazionePianura, sO = derivaSeme(seme, 41);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (acque[i] || quota[i] >= 200) continue;
      const q = quota[i] + OP.metri * fbm(x, y, sO, OP.lunghezza, 3) * (1 - quota[i] / 200);
      quota[i] = q < 1 ? 1 : q;
    }
  }

  // Primo drenaggio: dove scorrerebbe l'acqua sul rilievo di partenza → valli.
  const f0 = flusso(cols, rows, riempi(cols, rows, quota, foce), foce, acque, sF);
  scavaValli(cols, rows, quota, acque, f0.bacino, f0.ricevente, f0.ordine);

  // Secondo drenaggio sul rilievo scavato: laghi nelle conche profonde, le altre colmate.
  const riempita = riempi(cols, rows, quota, foce);
  const livello = new Float32Array(n);
  const coda = new Int32Array(n);
  const visto = new Uint8Array(n);
  const profonda = (i) => !acque[i] && riempita[i] - quota[i] > DRENAGGIO.lago.profondita;
  let laghi = 0;
  for (let s = 0; s < n; s++) {
    if (visto[s] || !profonda(s)) continue;
    let fine = 0;
    coda[fine++] = s; visto[s] = 1;
    for (let t = 0; t < fine; t++) {
      const i = coda[t], x = i % cols, y = (i - x) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!visto[j] && profonda(j)) { visto[j] = 1; coda[fine++] = j; }
      }
    }
    if (fine >= DRENAGGIO.lago.area) {
      laghi++;
      for (let k = 0; k < fine; k++) { acque[coda[k]] = ACQUA.LAGO; livello[coda[k]] = riempita[coda[k]]; }
    }
  }
  // Conche non lacustri colmate: la quota della terra è la superficie riempita (letto mai in salita).
  for (let i = 0; i < n; i++) if (acque[i] === ACQUA.TERRA && riempita[i] > quota[i]) quota[i] = riempita[i];
  const { ricevente, bacino } = flusso(cols, rows, riempita, foce, acque, sF);
  return { acque, livello, ricevente, bacino, laghi };
}
