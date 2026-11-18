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
// Fase 3: poggi (decisi con l'utente al posto dei massicci isolati): molti rialzi arrotondati di 60–240 m,
//   larghi 2–5 km, fitti o radi secondo un campo su grande scala (niente mosaico ripetuto), per salire e
//   guardare lontano.
//
// Coordinate: colonna 0 = ovest, riga 0 = nord; una cella = 1 km. Le lunghezze d'onda sono in km.

import { mulberry32, derivaSeme, hash2, fbm, ridged, smoothstep, codiceControllo } from './rumore.js';

export const CARTA_PREDEFINITA = { cols: 600, rows: 450, cella: 1000 };

// Versione del generatore: entra nella chiave della cache delle Carte (IndexedDB, lavoratore.js).
// VA CAMBIATA a ogni modifica che cambia le Carte generate, altrimenti il browser riusa Carte vecchie.
// (In alternativa: ?rigenera nell'indirizzo ignora la cache.)
export const VERSIONE_GENERATORE = 'm6-erosione-1';

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
  // GDD (rivisto con l'utente): collina 45–55 %. Si assegna il 5 % in più perché lo scavo delle valli dopo
  // l'erosione riporta in basso una parte della collina (misurato: −5…−6 %).
  frazioneColline: [0.5, 0.6],
  frazionePedemonte: [0.08, 0.12],
  cima: [2800, 3500],                   // quota massima delle catene
  // Campo composto (unità arbitrarie, ~km): pesi delle parti.
  pianura: { peso: 0.18, saturazione: 0.35, ondulazione: 0.04 },
  // Colline: zone dal campo su grande scala e dai fianchi delle catene, con una rampa larga (salgono
  // dalla pianura in modo graduale); dentro, rilievo ondulato (fBm) più qualche dorsale lunga (ridged).
  // Soglia bassa: le zone collinari coprono buona parte della terra (con la collina al 45–55 %, una soglia
  // alta lasciava altopiani lisci promossi a «collina» solo dalla curva delle quote).
  colline: { lunghezza: 110, soglia: -0.5, rampa: 0.8, fianchi: 0.9, peso: 0.6, ondulato: 16, dorsali: 40 },
  catene: { peso: 3.2 },
  // m sotto il livello del mare. Già 40 m nella prima cella di mare: con meno, l'interpolazione liscia
  // delle Scene (passo 3) spostava la costa verso il largo e il mare quasi spariva.
  fondale: { costa: 40, massimo: 2500 },
};

// Fase 3: poggi.
const POGGI = {
  densita: { lunghezza: 90, soglia: [-0.35, 0.45] },  // campo su grande scala: dove sono fitti e dove radi
  distanza: [4, 14],          // km: distanza minima tra poggi, da fitti a radi
  raggio: [1.6, 3.0],         // km: semiasse corto (molti piccoli, pochi grandi); sotto 1,6 km erano quadratini
  altezza: [80, 300],         // m sopra il terreno
  belvedere: { parte: 0.12, altezza: [300, 450] },   // alcuni dominano le colline attorno (punti panoramici)
  allungamento: [1, 2.6],     // dorsali: allungati lungo un campo di direzioni dolce (vicini allineati)
  quotaMassima: 900,          // non in montagna
  corso: 60, liberoCorsi: [1, 3],   // km²: corsi da cui stare lontani; km: niente rialzo / rialzo pieno
  distanzaCosta: 3, distanzaCatene: 6,
  tentativi: 60000,
};

/**
 * Genera la Carta per un seme.
 * @param {number} seme  intero senza segno a 32 bit (vedi semeDaTesto in rumore.js)
 * @returns {{
 *   seme: number, cols: number, rows: number, cella: number,
 *   quota: Float32Array,      // metri s.l.m. (mare negativo), riga per riga da nord
 *   mare: Uint8Array,         // 1 = mare
 *   catena: Float32Array,     // contributo delle catene 0…1
 *   poggi: number,             // quanti rialzi arrotondati
 *   carattere: object, statistiche: object, controllo: string,
 * }}
 */
export function generaCarta(seme, opzioni = {}) {
  const t0 = performance.now();
  const avanzamento = opzioni.avanzamento;           // (testo, frazione 0…1): per la schermata di caricamento
  avanzamento?.('Forma del continente', 0);
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
    }
  }

  // ─── Fase 2b: curva delle quote a fasce fissate per quantile ───
  const quota = new Float32Array(n);
  const QF = QUOTE.fondale;
  const spanFondale = (livello - minBase) || 1;
  for (let i = 0; i < n; i++) {
    if (!mare[i]) continue;
    const g = (livello - base[i]) / spanFondale;          // 0 sulla costa, 1 nel punto più profondo
    quota[i] = -(QF.costa + (QF.massimo - QF.costa) * g * g);
  }
  mappaFasce(composto, mare, carattere, quota);
  avanzamento?.('Erosione dei fiumi', 0.25);

  // ─── Fase 4a: erosione fluviale, poi di nuovo le fasce (trasformazione monotona: i fiumi scendono ancora) ───
  erosioneFluviale(cols, rows, quota, mare, seme, (f) => avanzamento?.('Erosione dei fiumi', 0.25 + 0.5 * f));
  mappaFasce(quota, mare, carattere, quota);
  avanzamento?.('Fiumi, laghi e poggi', 0.78);

  // ─── Fasi 4–5: drenaggio, valli, fiumi e laghi ───
  const dren = drenaggio(cols, rows, quota, mare, seme);

  // ─── Fase 3 (dopo il drenaggio): poggi ───
  // Dopo, non prima: messi prima, i gruppi di poggi chiudevano conche nelle pianure (~150 laghetti in più).
  // Lontani dai corsi d'acqua, che restano più bassi: l'acqua dei poggi scende verso di loro.
  const poggi = piazzaPoggi(seme, cols, rows, quota, mare, catena, dren);

  // Statistiche: parte della terra per fascia di quota (dopo poggi e valli).
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
  const carta = {
    seme, cols, rows, cella: opzioni.cella ?? CARTA_PREDEFINITA.cella,
    quota, mare, catena, poggi, carattere,
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
  // Tronchi curvi (km, punti x, y, bacino, letto) lungo cui sono scavate le valli: li usano la vista della
  // Carta e, al passo 6, le Scene (il letto scende sempre).
  carta.fiumi = dren.fiumi;
  avanzamento?.('Verifiche', 0.92);
  carta.statistiche.ms = performance.now() - t0;
  return carta;
}

// ─── Fasi 2b e 4a: fasce di quota, erosione fluviale ─────────────────────

/**
 * Quote della terra in metri da un campo di valori qualunque (ordine conservato): curva a fasce fissate per
 * quantile (pianura, collina, pedemonte; montagna per rango, curva r^1,25). Scrive in `quota` (anche lo
 * stesso array dei valori); il mare resta com'è.
 */
function mappaFasce(valori, mare, carattere, quota) {
  const n = valori.length;
  let nt = 0;
  for (let i = 0; i < n; i++) if (!mare[i]) nt++;
  const terra = new Float32Array(nt);
  let k = 0;
  for (let i = 0; i < n; i++) if (!mare[i]) terra[k++] = valori[i];
  terra.sort();
  const q = (f) => terra[Math.min(nt - 1, Math.max(0, Math.floor(f * nt)))];
  const fM = carattere.frazioneMontagna, fP = carattere.frazionePedemonte, fH = carattere.frazioneColline;
  const v = [terra[0], q(1 - fH - fP - fM), q(1 - fP - fM), q(1 - fM), terra[nt - 1]];
  const metri = [...QUOTE.limiti, carattere.cima];
  // Montagna per rango: pochi picchi estremi schiaccerebbero quasi tutte le celle poco sopra i 1500 m.
  const alte = [];
  for (let i = 0; i < n; i++) if (!mare[i] && valori[i] >= v[3]) alte.push(i);
  alte.sort((a, b) => (valori[a] - valori[b]) || (a - b));
  for (let i = 0; i < n; i++) {
    if (mare[i] || valori[i] >= v[3]) continue;
    const c = valori[i];
    let f = 2;
    while (f > 0 && c < v[f]) f--;
    const t = (c - v[f]) / ((v[f + 1] - v[f]) || 1);
    const m = metri[f] + (metri[f + 1] - metri[f]) * (t > 1 ? 1 : t < 0 ? 0 : t);
    quota[i] = m < 1 ? 1 : m;                                // la terra sta sopra il mare
  }
  for (let r = 0; r < alte.length; r++) {
    const t = alte.length > 1 ? r / (alte.length - 1) : 1;
    quota[alte[r]] = metri[3] + (metri[4] - metri[3]) * t * Math.sqrt(Math.sqrt(t));   // t^1,25
  }
}

// Erosione fluviale («stream power», schema implicito di Braun e Willett, 2013), senza sollevamento:
// a ogni passo ogni cella si avvicina alla cella a valle con peso forza·√(bacino km²). I fiumi grandi
// incidono e si regolarizzano, i versanti cambiano poco, le conche attraversate dall'acqua si colmano dal
// basso. Le direzioni di flusso si ricalcolano ogni `ogni` passi (riempimento e zone piatte come nel drenaggio).
const EROSIONE = { iterazioni: 24, ogni: 3, forza: 0.004 };

function erosioneFluviale(cols, rows, quota, mare, seme, avanzamento) {
  const E = EROSIONE, n = cols * rows;
  const acque = classificaAcque(cols, rows, mare);
  const foce = foci(cols, rows, acque);
  const h = Float64Array.from(quota);
  const sF = derivaSeme(seme, 44);
  let f = null;
  for (let it = 0; it < E.iterazioni; it++) {
    if (it % E.ogni === 0) f = flusso(cols, rows, riempi(cols, rows, h, foce), foce, acque, sF);
    const { ricevente, bacino, ordine } = f;
    for (let t = ordine.length - 1; t >= 0; t--) {            // dalla foce verso monte: la cella a valle è fatta
      const i = ordine[t], j = ricevente[i];
      if (foce[i] || j < 0) continue;
      const F = E.forza * Math.sqrt(bacino[i] > 1 ? bacino[i] : 1);
      h[i] = (h[i] + F * h[j]) / (1 + F);
    }
    avanzamento?.((it + 1) / E.iterazioni);
  }
  for (let i = 0; i < n; i++) if (!mare[i]) quota[i] = h[i];
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
 * Poggi: molti rialzi arrotondati sparsi nelle zone basse, per salire e guardare lontano. Per evitare il
 * mosaico ripetuto «pianura/colle»:
 *   - un campo su grande scala decide dove sono fitti (zone di colli) e dove radi (pianure aperte);
 *   - la distanza minima tra due poggi segue quel campo (niente griglia regolare);
 *   - misure sbilanciate (molti piccoli, pochi grandi), altezze varie;
 *   - forma allungata lungo un campo di direzioni dolce: i vicini si allineano in dorsali e gruppi.
 * Profilo arrotondato (1 − t²)², con piccole irregolarità. Si sommano al terreno, prima del drenaggio
 * (i fiumi ci girano attorno). Restituisce quanti ne ha messi.
 */
function piazzaPoggi(seme, cols, rows, quota, mare, catena, dren) {
  const P = POGGI;
  // Distanza (km) dai corsi d'acqua e dai laghi: niente rialzo sopra di loro, rampa fino a P.liberoCorsi[1].
  const distCorsi = distanze(cols, rows, (i) => dren.acque[i] === ACQUA.LAGO
    || (dren.acque[i] === ACQUA.TERRA && dren.bacino[i] >= P.corso));
  const rng = mulberry32(derivaSeme(seme, 5));
  const sD = derivaSeme(seme, 61), sX = derivaSeme(seme, 62), sY = derivaSeme(seme, 63), sF = derivaSeme(seme, 64);
  const distCosta = distanze(cols, rows, (i) => mare[i] === 1);
  const distCatene = distanze(cols, rows, (i) => catena[i] > 0.15);
  const base = Float32Array.from(quota);          // le quote prima dei poggi (per i vincoli)
  const lato = P.distanza[1];                     // griglia di appoggio per cercare i vicini
  const gc = Math.ceil(cols / lato), gr = Math.ceil(rows / lato);
  const griglia = Array.from({ length: gc * gr }, () => []);
  const accettati = [];
  for (let t = 0; t < P.tentativi; t++) {
    const x = rng() * cols, y = rng() * rows;
    const u1 = rng(), u2 = rng(), u3 = rng(), u4 = rng(), u5 = rng();
    const c = Math.floor(x), r = Math.floor(y), i = r * cols + c;
    if (mare[i] || dren.acque[i] || base[i] > P.quotaMassima || distCosta[i] < P.distanzaCosta
      || distCatene[i] < P.distanzaCatene || distCorsi[i] < P.liberoCorsi[1]) continue;
    const densita = smoothstep(P.densita.soglia[0], P.densita.soglia[1], fbm(x, y, sD, P.densita.lunghezza, 3));
    const dmin = P.distanza[1] + (P.distanza[0] - P.distanza[1]) * densita;
    const gx = Math.floor(x / lato), gy = Math.floor(y / lato);
    let libero = true;
    for (let yy = gy - 1; yy <= gy + 1 && libero; yy++) {
      for (let xx = gx - 1; xx <= gx + 1 && libero; xx++) {
        if (xx < 0 || yy < 0 || xx >= gc || yy >= gr) continue;
        for (const q of griglia[yy * gc + xx]) {
          const d = Math.max(dmin, q.dmin) * 0.5 + Math.min(dmin, q.dmin) * 0.5;
          if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < d * d) { libero = false; break; }
        }
      }
    }
    if (!libero) continue;
    // Direzione dal campo dolce (vicini allineati), senza trigonometria.
    let ax = fbm(x, y, sX, 60, 2), ay = fbm(x, y, sY, 60, 2);
    const al = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= al; ay /= al;
    const p = {
      x, y, dmin, ax, ay,
      raggio: P.raggio[0] + (P.raggio[1] - P.raggio[0]) * u1 * u1,
      altezza: u5 < P.belvedere.parte
        ? P.belvedere.altezza[0] + (P.belvedere.altezza[1] - P.belvedere.altezza[0]) * u2
        : P.altezza[0] + (P.altezza[1] - P.altezza[0]) * u2 * u2,
      allungamento: P.allungamento[0] + (P.allungamento[1] - P.allungamento[0]) * u3,
      piatto: u4 < 0.15,                         // alcuni a sommità larga (pianoro)
    };
    accettati.push(p);
    griglia[gy * gc + gx].push(p);
  }
  for (const p of accettati) {
    const estensione = p.raggio * p.allungamento;
    const x0 = Math.max(0, Math.floor(p.x - estensione)), x1 = Math.min(cols - 1, Math.ceil(p.x + estensione));
    const y0 = Math.max(0, Math.floor(p.y - estensione)), y1 = Math.min(rows - 1, Math.ceil(p.y + estensione));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x;
        if (mare[i] || dren.acque[i]) continue;
        const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y;
        const lungo = (dx * p.ax + dy * p.ay) / p.allungamento, largo = -dx * p.ay + dy * p.ax;
        const t2 = (lungo * lungo + largo * largo) / (p.raggio * p.raggio);
        if (t2 >= 1) continue;
        let f = (1 - t2) * (1 - t2);
        if (p.piatto) f = Math.min(1, f * 1.8);
        const libero = smoothstep(P.liberoCorsi[0], P.liberoCorsi[1], distCorsi[i]);
        quota[i] += p.altezza * f * libero * (0.9 + 0.2 * fbm(x, y, sF, 4, 2));
      }
    }
  }
  return accettati.length;
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
  // breccia: di quanto (m) il letto può scendere oltre lo scavo normale per tagliare il bordo di una conca e
  // svuotarla (come fa un fiume vero); le conche più profonde restano laghi.
  valli: { k: 5, frazione: 0.45, areaMinima: 15, raggioBase: 1.5, raggioPer: 0.12, raggioMax: 8, breccia: 60 },
  fiume: 150,              // km² di bacino: da qui una cella porta un fiume
  // Conche più profonde (m) e più ampie (km²) diventano laghi; le altre si colmano. Con la collina al
  // 45–55 % il rilievo a rumore ha molte conche: soglie basse davano 100–200 laghi.
  lago: { profondita: 20, area: 10 },
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
function dirigiZonePiatte(cols, rows, riempita, foce, ricevente, seme, piatta) {
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
      if (m >= 0) { ricevente[i] = m; piatta[i] = 1; }
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
  const piatta = new Uint8Array(cols * rows);          // direzione data dal gradiente delle zone piatte
  dirigiZonePiatte(cols, rows, riempita, foce, ricevente, seme, piatta);
  const ordine = ordineTopologico(ricevente);
  const bacino = new Float32Array(cols * rows);
  for (let t = 0; t < ordine.length; t++) {
    const i = ordine[t];
    if (acque[i] === ACQUA.MARE || acque[i] === ACQUA.LAGO_COSTIERO) continue;
    bacino[i] += 1;
    if (ricevente[i] >= 0) bacino[ricevente[i]] += bacino[i];
  }
  return { ricevente, bacino, ordine, piatta };
}

/**
 * Fase 4 (versione semplice): scava le valli lungo il drenaggio.
 *   1. Letto dei fiumi: quota − k·√bacino (al massimo una frazione della quota), poi corretto dalla foce
 *      verso monte perché scenda sempre (mai più basso del letto a valle).
 *   2. Versanti: ogni cella vicina a un fiume si abbassa VERSO il letto secondo un profilo a V, mai sotto:
 *      lo scavo non crea conche nuove.
 */
function scavaValli(cols, rows, quota, acque, bacino, ricevente, ordine, piatta, seme) {
  const V = DRENAGGIO.valli;
  const n = cols * rows;
  // Letto: dalle sorgenti verso la foce, mai più alto a valle che a monte. Dove il percorso attraversa il
  // bordo di una conca, il letto lo taglia (breccia) e la conca si svuota; oltre V.breccia m di taglio in
  // più ci si ferma e la conca resta un lago. (Dalla foce verso monte, come prima, il letto risaliva fino
  // al bordo e le conche restavano tutte chiuse: con la collina al 45–55 % erano un centinaio di laghi.)
  const letto = new Float32Array(n).fill(NaN);
  const monteMin = new Float32Array(n).fill(Infinity);   // letto più basso tra le celle a monte
  for (let t = 0; t < ordine.length; t++) {               // dalle sorgenti verso la foce
    const i = ordine[t];
    if (acque[i] || bacino[i] < V.areaMinima) continue;
    const b0 = quota[i] - Math.min(V.k * Math.sqrt(bacino[i]), V.frazione * quota[i]);
    let b = b0;
    if (monteMin[i] < Infinity) b = Math.min(b0, Math.max(monteMin[i] - DRENAGGIO.passoLetto, b0 - V.breccia));
    letto[i] = b;
    const j = ricevente[i];
    if (j >= 0 && b < monteMin[j]) monteMin[j] = b;
  }
  const nuova = Float32Array.from(quota);
  for (let i = 0; i < n; i++) {
    const b = letto[i];
    if (Number.isNaN(b)) continue;
    // Sulle zone piatte (conche colmate nel calcolo) il flusso corre in rigagnoli paralleli: scavati, davano
    // solchi paralleli («laghi a pettine», poi striature). Lì i corsi minori non scavano: la conca si svuota
    // dalla breccia nel bordo, dove il letto (calcolato anche per loro) scende sotto il fondo.
    if (piatta[i] && bacino[i] < DRENAGGIO.fiume) continue;   // niente solchi sui fondi piatti (la breccia è sul bordo)
    if (bacino[i] >= DRENAGGIO.fiume) continue;          // i fiumi scavano lungo i tracciati curvi (sotto)
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
  // Fiumi: la valle si scava lungo il tracciato curvo (anse comprese), con il letto che scende sempre
  // (interpolato tra i letti delle celle). Scavata lungo la catena di celle, la valle restava dritta e le
  // anse sarebbero finite a mezza costa.
  const tracciati = tracciaFiumi({ cols, rows, quota, acque, ricevente, bacino, sogliaFiume: DRENAGGIO.fiume,
    seme, cella: CARTA_PREDEFINITA.cella, letto }, { spostamento: true, anse: TRACCIATI.anse });
  for (const f of tracciati) {
    for (let k = 0; k < f.length; k += 2 * PASSO_PUNTO) {     // un punto ogni 0,4 km basta (raggi ≥ 1,5 km)
      const px = f[k], py = f[k + 1], b = f[k + 3];
      if (Number.isNaN(b)) continue;
      const raggio = Math.min(V.raggioMax, V.raggioBase + V.raggioPer * Math.sqrt(f[k + 2]));
      const x0 = Math.floor(px - raggio), x1 = Math.ceil(px + raggio);
      const y0 = Math.floor(py - raggio), y1 = Math.ceil(py + raggio);
      for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
          const j = y * cols + x;
          if (acque[j] || quota[j] <= b) continue;
          const dx = x + 0.5 - px, dy = y + 0.5 - py;
          const t = Math.sqrt(dx * dx + dy * dy) / raggio;
          if (t >= 1) continue;
          const q = b + (quota[j] - b) * t;
          if (q < nuova[j]) nuova[j] = q;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) if (!acque[i]) quota[i] = nuova[i] < 1 ? 1 : nuova[i];
  return tracciati;
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
  const tracciati = scavaValli(cols, rows, quota, acque, f0.bacino, f0.ricevente, f0.ordine, f0.piatta, seme);

  // Secondo drenaggio sul rilievo scavato: laghi nelle conche profonde, le altre colmate.
  const riempita = riempi(cols, rows, quota, foce);
  const livello = new Float32Array(n);
  const coda = new Int32Array(n);
  const visto = new Uint8Array(n);
  // Lago = l'intera conca colmata (fino al punto di sfioro), se in qualche punto è profonda più della soglia
  // e abbastanza ampia. Contando solo le celle profonde, una conca attraversata da canaletti diventava un
  // lago «a pettine» (profondi i canaletti, non il resto).
  const colma = (i) => !acque[i] && riempita[i] > quota[i];
  let laghi = 0;
  for (let s = 0; s < n; s++) {
    if (visto[s] || !colma(s)) continue;
    let fondo = 0;
    let fine = 0;
    coda[fine++] = s; visto[s] = 1;
    for (let t = 0; t < fine; t++) {
      const i = coda[t], x = i % cols, y = (i - x) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!visto[j] && colma(j)) { visto[j] = 1; coda[fine++] = j; }
      }
      if (riempita[i] - quota[i] > fondo) fondo = riempita[i] - quota[i];
    }
    if (fine >= DRENAGGIO.lago.area && fondo > DRENAGGIO.lago.profondita) {
      laghi++;
      for (let k = 0; k < fine; k++) { acque[coda[k]] = ACQUA.LAGO; livello[coda[k]] = riempita[coda[k]]; }
    }
  }
  // Niente dita sottili: i canaletti scavati nelle zone piatte restano più bassi del lago e lo
  // allungherebbero in righe larghe una cella. Una passata: una cella di lago con al più 2 vicine di lago
  // (sui 4 lati) torna terra, colmata al livello del lago; i laghi rimasti troppo piccoli spariscono.
  for (let passata = 0; passata < 1; passata++) {
    const togli = [];
    for (let i = 0; i < n; i++) {
      if (acque[i] !== ACQUA.LAGO) continue;
      const x = i % cols, y = (i - x) / cols;
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && acque[ny * cols + nx] === ACQUA.LAGO) v++;
      }
      if (v <= 2) togli.push(i);
    }
    for (const i of togli) { acque[i] = ACQUA.TERRA; livello[i] = 0; }
  }
  visto.fill(0);
  laghi = 0;
  for (let s = 0; s < n; s++) {
    if (acque[s] !== ACQUA.LAGO || visto[s]) continue;
    let fine = 0;
    coda[fine++] = s; visto[s] = 1;
    for (let t = 0; t < fine; t++) {
      const i = coda[t], x = i % cols, y = (i - x) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!visto[j] && acque[j] === ACQUA.LAGO) { visto[j] = 1; coda[fine++] = j; }
      }
    }
    if (fine < DRENAGGIO.lago.area) for (let k = 0; k < fine; k++) { acque[coda[k]] = ACQUA.TERRA; livello[coda[k]] = 0; }
    else laghi++;
  }
  // Conche non lacustri colmate: la quota della terra è la superficie riempita (letto mai in salita).
  for (let i = 0; i < n; i++) if (acque[i] === ACQUA.TERRA && riempita[i] > quota[i]) quota[i] = riempita[i];
  const { ricevente, bacino } = flusso(cols, rows, riempita, foce, acque, sF);

  // Tracciati dei fiumi: quelli lungo cui sono state scavate le valli (il fiume sta sul fondo della sua
  // valle curva). Ricavati di nuovo dal secondo drenaggio, a celle da 1 km, le anse si perdevano
  // (sinuosità mediana 1,22 contro 1,72). Dentro i laghi nati dal secondo drenaggio il tracciato si interrompe.
  const fiumi = [];
  for (const f of tracciati) {
    let pezzo = [];
    for (let k = 0; k < f.length; k += PASSO_PUNTO) {
      const c = Math.floor(f[k]), r = Math.floor(f[k + 1]);
      const inLago = c >= 0 && r >= 0 && c < cols && r < rows && acque[r * cols + c] === ACQUA.LAGO;
      if (inLago) {
        if (pezzo.length >= 2 * PASSO_PUNTO) fiumi.push(Float32Array.from(pezzo));
        pezzo = [];
        continue;
      }
      for (let v = 0; v < PASSO_PUNTO; v++) pezzo.push(f[k + v]);
    }
    if (pezzo.length >= 2 * PASSO_PUNTO) fiumi.push(Float32Array.from(pezzo));
  }
  return { acque, livello, ricevente, bacino, laghi, fiumi };
}

// ─── Tracciati dei fiumi ────────────────────────────────────────────────
// Il drenaggio dà una catena di celle (8 direzioni: solo angoli multipli di 45°, rettilinei e svolte ad
// angolo retto). Il tracciato è una curva in coordinate del mondo (km, cella (c, r) = [c, c+1] × [r, r+1]),
// la stessa che il passo 6 scaverà nelle Scene:
//   1. rete in tronchi: dal basso, a ogni confluenza prosegue il ramo con il percorso più lungo a monte;
//      gli altri sono tronchi che finiscono sul punto di confluenza;
//   2. ogni cella ha un punto spostato da un campo dolce (spezza i rettilinei; ampio in pianura, poco in
//      montagna); tronchi che passano per la stessa cella usano lo stesso punto, quindi si agganciano;
//   3. angoli arrotondati (Chaikin, estremi fermi);
//   4. anse: spostamento laterale lungo il percorso, con lunghezza d'onda e ampiezza che crescono con il
//      bacino e si riducono con la pendenza; nulle agli estremi; al massimo ~0,65 km dal fondovalle.

const TRACCIATI = {
  // Spostamento dolce dei punti delle celle, su due scale (km): spezza i rettilinei lunghi.
  // La valle si scava lungo il tracciato, quindi lo spostamento può piegare il corso su decine di km.
  spostamento: { montagna: 0.25, pianura: 1.5, lunghezze: [9, 30] },
  pendenza: [0.015, 0.07],      // m/m: da qui in giù è «pianura», da qui in su «montagna»
  // Anse: lunghezza d'onda (km) dal bacino; ampiezza = frazione della lunghezza d'onda, limitata da un tetto
  // che va da montagna a pianura. Sono le anse lungo cui si scavano le valli (passo 4).
  // Le valli si scavano lungo le anse: possono essere ampie anche in collina (solo la montagna le stringe).
  anse: { lunghezzaBase: 3, lunghezzaPer: 0.3, lunghezzaMax: 12, ampiezza: 0.4, tetto: [0.3, 1.8], forma: 1 },
  passo: 0.2,                   // km tra i punti del tracciato
  // Confluenza anticipata: un corso che arriva entro questa distanza (km) da uno più grande già tracciato lo
  // raggiunge lì. Sui fondovalle larghi e in pendenza uniforme i rigagnoli scendevano paralleli per decine di km.
  confluenza: 1.5,
};
const PASSO_PUNTO = 4;          // valori per punto: x, y (km), bacino (km²), letto (m; NaN se non noto)

/** Chaikin su punti a gruppi di PASSO_PUNTO valori, estremi fermi. */
function chaikin(p, volte) {
  const S = PASSO_PUNTO;
  for (let v = 0; v < volte; v++) {
    const n = p.length / S;
    if (n < 3) return p;
    const q = p.slice(0, S);
    for (let k = 0; k < n - 1; k++) {
      const a = k * S, b = a + S;
      for (const f of [0.25, 0.75]) {
        if ((k === 0 && f === 0.25) || (k === n - 2 && f === 0.75)) continue;
        for (let c = 0; c < S; c++) q.push(p[a + c] + (p[b + c] - p[a + c]) * f);
      }
    }
    for (let c = 0; c < S; c++) q.push(p[p.length - S + c]);
    p = q;
  }
  return p;
}

/** Ricampiona a passo costante (km). */
function ricampiona(p, passo) {
  const S = PASSO_PUNTO;
  const q = p.slice(0, S);
  let resto = 0;
  for (let k = S; k < p.length; k += S) {
    const dx = p[k] - p[k - S], dy = p[k + 1] - p[k - S + 1], l = Math.sqrt(dx * dx + dy * dy);
    let s = passo - resto;
    while (s <= l) {
      const f = s / l;
      for (let c = 0; c < S; c++) q.push(p[k - S + c] + (p[k + c] - p[k - S + c]) * f);
      s += passo;
    }
    resto = l - (s - passo);
  }
  const u = p.length - S;
  if (q[q.length - S] !== p[u] || q[q.length - S + 1] !== p[u + 1]) for (let c = 0; c < S; c++) q.push(p[u + c]);
  return q;
}

/**
 * Tracciati dei fiumi: tronchi come Float32Array di punti (x, y, bacino, letto), x e y in km dal bordo
 * ovest e nord, dalla sorgente verso la foce.
 * @param {object} dati  cols, rows, quota, acque, ricevente, bacino, sogliaFiume, seme, cella; letto (facoltativo)
 * @param {{ spostamento?: boolean, anse?: object }} opzioni  spostamento dei punti delle celle e parametri delle anse
 */
export function tracciaFiumi(dati, opzioni = {}) {
  const { cols, rows, quota, acque, ricevente, bacino, sogliaFiume, seme, cella, letto = null } = dati;
  const n = cols * rows;
  const T = TRACCIATI, S = PASSO_PUNTO;
  const sposta = opzioni.spostamento ?? true;
  const AN = opzioni.anse ?? T.anse;
  const fiume = (i) => i >= 0 && acque[i] === ACQUA.TERRA && bacino[i] >= sogliaFiume;
  const sX = derivaSeme(seme, 51), sY = derivaSeme(seme, 52), sA = derivaSeme(seme, 53);
  const lettoDi = (i) => (letto ? letto[i] : NaN);

  // Affluenti (in forma compatta) e lunghezza massima del percorso a monte di ogni cella di fiume.
  const nAff = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) if (fiume(i) && fiume(ricevente[i])) nAff[ricevente[i] + 1]++;
  for (let i = 0; i < n; i++) nAff[i + 1] += nAff[i];
  const aff = new Int32Array(nAff[n]), riempiti = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (fiume(i) && fiume(ricevente[i])) { const j = ricevente[i]; aff[nAff[j] + riempiti[j]++] = i; }
  }
  const monte = new Int32Array(n);              // celle sul percorso più lungo a monte
  const entranti = new Int32Array(n), coda = new Int32Array(n);
  let fine = 0;
  for (let i = 0; i < n; i++) if (fiume(i)) { entranti[i] = nAff[i + 1] - nAff[i]; if (!entranti[i]) coda[fine++] = i; }
  for (let t = 0; t < fine; t++) {
    const i = coda[t], j = ricevente[i];
    if (!fiume(j)) continue;
    if (monte[i] + 1 > monte[j]) monte[j] = monte[i] + 1;
    if (--entranti[j] === 0) coda[fine++] = j;
  }

  // Pendenza locale (m/m) e quanto la cella è «di pianura» (1) o «di montagna» (0).
  const pianeggiante = (c, r) => {
    const q = (x, y) => quota[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
    const gx = (q(c + 1, r) - q(c - 1, r)) / (2 * cella), gy = (q(c, r + 1) - q(c, r - 1)) / (2 * cella);
    return 1 - smoothstep(T.pendenza[0], T.pendenza[1], Math.sqrt(gx * gx + gy * gy));
  };
  // Punto di una cella: centro più (se richiesto) uno spostamento dolce, lo stesso per tutti i tronchi
  // che ci passano (così si agganciano).
  const punto = (i) => {
    const c = i % cols, r = (i - c) / cols;
    if (!sposta) return [c + 0.5, r + 0.5];
    const A = T.spostamento.montagna + (T.spostamento.pianura - T.spostamento.montagna) * pianeggiante(c, r);
    const [l1, l2] = T.spostamento.lunghezze;
    return [c + 0.5 + A * (0.6 * fbm(c, r, sX, l1, 3) + 0.4 * fbm(c, r, sX ^ 0x9e3779b9, l2, 2)),
      r + 0.5 + A * (0.6 * fbm(c, r, sY, l1, 3) + 0.4 * fbm(c, r, sY ^ 0x9e3779b9, l2, 2))];
  };

  // 1. Tronchi, dalla foce verso monte.
  const tronchi = [];
  const pila = [];
  for (let i = 0; i < n; i++) if (fiume(i) && !fiume(ricevente[i])) pila.push([i, -1]);
  while (pila.length) {
    const [inizio, valle] = pila.pop();
    const celle = [inizio];
    let cur = inizio;
    for (;;) {
      let scelta = -1;
      for (let k = nAff[cur]; k < nAff[cur + 1]; k++) {
        const a = aff[k];
        if (scelta < 0 || monte[a] > monte[scelta] || (monte[a] === monte[scelta] && bacino[a] > bacino[scelta])) scelta = a;
      }
      if (scelta < 0) break;
      for (let k = nAff[cur]; k < nAff[cur + 1]; k++) if (aff[k] !== scelta) pila.push([aff[k], cur]);
      celle.push(scelta);
      cur = scelta;
    }
    celle.reverse();                               // dalla sorgente verso valle
    const p = [];
    for (const c of celle) { const [x, y] = punto(c); p.push(x, y, bacino[c], lettoDi(c)); }
    if (valle >= 0) {                              // affluente: finisce sul punto della confluenza
      const [x, y] = punto(valle); p.push(x, y, bacino[valle], lettoDi(valle));
    } else {                                       // foce: a metà tra l'ultima cella e l'acqua
      const j = ricevente[inizio];
      if (j >= 0) {
        const cj = j % cols, rj = (j - cj) / cols, ci = inizio % cols, ri = (inizio - ci) / cols;
        p.push((ci + cj) / 2 + 0.5, (ri + rj) / 2 + 0.5, bacino[inizio], lettoDi(inizio));
      }
    }
    if (p.length >= 2 * S) tronchi.push(p);
  }

  // 2–4. Angoli arrotondati, anse, ancora un arrotondamento.
  const curve = tronchi.map((p0, k) => {
    const p = ricampiona(chaikin(p0, 3), T.passo);
    const m = p.length / S;
    let L = 0;
    const s = new Float64Array(m);
    for (let i = 1; i < m; i++) {
      const dx = p[i * S] - p[i * S - S], dy = p[i * S + 1] - p[i * S - S + 1];
      L += Math.sqrt(dx * dx + dy * dy);
      s[i] = L;
    }
    const q = p.slice();
    for (let i = 1; i < m - 1; i++) {
      const b = p[i * S + 2];
      const lambda = Math.min(AN.lunghezzaMax, AN.lunghezzaBase + AN.lunghezzaPer * Math.sqrt(b));
      const c = Math.floor(p[i * S]), r = Math.floor(p[i * S + 1]);
      // «forma» 1: l'ampiezza segue la pianeggianza; 2: il suo quadrato (anse solo dove è proprio piano).
      const f = pianeggiante(c, r), ff = AN.forma === 2 ? f * f : f;
      const a = Math.min(AN.tetto[0] + (AN.tetto[1] - AN.tetto[0]) * ff, lambda * AN.ampiezza * (0.25 + 0.75 * f));
      const smorza = smoothstep(0, lambda * 0.5, s[i]) * smoothstep(0, lambda * 0.5, L - s[i]);
      const g = fbm(s[i], k * 13.7, sA, lambda, 3);
      let tx = p[i * S + S] - p[i * S - S], ty = p[i * S + S + 1] - p[i * S - S + 1];
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      q[i * S] += -ty * a * g * smorza;
      q[i * S + 1] += tx * a * g * smorza;
    }
    return Float32Array.from(chaikin(q, 2));
  });
  return confluenzeAnticipate(curve);
}

/**
 * Confluenza anticipata: dal corso più grande al più piccolo, ogni corso viene percorso dalla sorgente e, al
 * primo punto entro TRACCIATI.confluenza km da un corso più grande già accettato, finisce lì (sul punto di
 * quel corso). Così i rigagnoli non corrono paralleli a un fiume per decine di km.
 */
function confluenzeAnticipate(curve) {
  const S = PASSO_PUNTO, D = TRACCIATI.confluenza, D2 = D * D;
  const ordine = curve.map((f, k) => [f[f.length - S + 2], k]).sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
  const griglia = new Map();                       // celle di D km → punti accettati [x, y]
  const chiave = (x, y) => Math.floor(x / D) * 100003 + Math.floor(y / D);
  const risultato = [];
  for (const [, k] of ordine) {
    const f = curve[k];
    let fine = f.length, aggancio = null;
    for (let i = 0; i < f.length - S && !aggancio; i += S) {
      const x = f[i], y = f[i + 1];
      const gx = Math.floor(x / D), gy = Math.floor(y / D);
      for (let dy = -1; dy <= 1 && !aggancio; dy++) {
        for (let dx = -1; dx <= 1 && !aggancio; dx++) {
          const lista = griglia.get((gx + dx) * 100003 + gy + dy);
          if (!lista) continue;
          for (const p of lista) {
            if ((p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) < D2) { aggancio = p; fine = i + S; break; }
          }
        }
      }
    }
    let g = f;
    if (aggancio) {
      if (fine < 2 * S) continue;                    // nato accanto a un fiume più grande: è già quel fiume
      g = f.slice(0, fine);
      g[fine - S] = aggancio[0]; g[fine - S + 1] = aggancio[1];
    }
    risultato.push(g);
    for (let i = 0; i < g.length; i += S) {
      const c = chiave(g[i], g[i + 1]);
      let lista = griglia.get(c);
      if (!lista) griglia.set(c, (lista = []));
      lista.push([g[i], g[i + 1]]);
    }
  }
  return risultato;
}
