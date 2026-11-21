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
import { VARIETA, TIPI, uniformita, distanzaDa, tipoPaesaggio } from './verifica.js';

// Regione di 120×90 km (deciso con l'utente, novembre 2026: a 600×450 km il mondo era troppo grande per i
// luoghi che contiene). Scala d'insieme (forma, catene, clima) ridotta; scala locale (valli, gruppi, poggi) uguale.
export const CARTA_PREDEFINITA = { cols: 120, rows: 90, cella: 1000 };

// Versione del generatore: entra nella chiave della cache delle Carte (IndexedDB, lavoratore.js).
// VA CAMBIATA a ogni modifica che cambia le Carte generate, altrimenti il browser riusa Carte vecchie.
// (In alternativa: ?rigenera nell'indirizzo ignora la cache.)
// Comprende i luoghi (M7, js/mondo/luoghi.js), che si aggiungono alla Carta nel Worker e stanno nella stessa cache.
// regione-2: punti panoramici solo alture (verifiche in cache); m7-terrapieno: terrapieni di rocca e borgo;
// strade: rete delle strade e dei sentieri (js/mondo/strade.js); strade-2: costo del rilievo dentro la cella.
export const VERSIONE_GENERATORE = 'regione-2+m7-forme-5+strade-2+mare-1';

// Parametri della forma (km dove non indicato). Valori di partenza, da tarare guardando le Carte.
const FORMA = {
  deformazione: { lunghezza: 60, ampiezza: 14, ottave: 3 },   // deformazione del dominio
  continente: { lunghezza: 70, ottave: 6, guadagno: 0.55 },   // forma d'insieme e dettaglio delle coste
  scalaGrande: { lunghezza: 160, peso: 0.45 },                 // masse di terra, golfi e mari interni
  // Bordi: nessun anello di mare forzato (regola del 2D, docs/WORLD_GEN.md in 2c869fa). I bordi possono
  // essere terra o mare secondo il rumore. Niente più spinta verso il mare negli ultimi km (era 0,15): con il
  // mondo di 120×90 km non c'è un «di là dal mare» [deciso con l'utente, novembre 2026].
  bordo: { larghezza: 10, profondita: 0 },
  inclinazione: 0.30,                                          // quanto un lato può avere più mare
  // Parte della superficie a mare [rivisto con l'utente, novembre 2026: prima 10–22 %; nel mondo di 120×90 km non c'è
  // un «di là dal mare», il mare aperto era spazio sprecato]. Il livello per quantile tiene le coste naturali: il mare
  // si ritira nelle parti più basse (bracci e mari interni compresi).
  mare: [0.05, 0.11],
  montagna: [0.045, 0.10],                                     // parte della terra con catene alte (GDD)
  // Catene: lungo le linee di zero di un rumore su grande scala (linee lunghe e sinuose), solo dove una
  // maschera le ammette (tratti di lunghezza limitata). Contrafforti laterali da rumore ridged.
  catene: {
    linea: 110, larghezza: 0.2, pedemonte: 0.5,
    maschera: 140, rampaMaschera: 0.15, sogliaMontagna: 0.35,
    // dettaglio: lunghezza d'onda dei contrafforti (km). A 32 km creste e valli si alternavano ogni ~16 km
    // (fondovalle→crinale ~9 km); la regola è ~3–5 km.
    dettaglio: 7, contrafforti: 1.4, creste: 7, altezza: 0.75,
    // Zoccolo dei contrafforti (deciso con l'utente): parte del piede della catena che è una base continua e non
    // solo contrafforti. Senza (0) le valli tra i contrafforti scendevano alla quota delle colline fin sotto la
    // spina; con lo zoccolo i fondovalle salgono gradualmente addentrandosi nella catena.
    zoccolo: 0.55,
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
  colline: { lunghezza: 40, soglia: -0.5, rampa: 0.8, fianchi: 0.9, peso: 0.6, ondulato: 12, dorsali: 22 },
  catene: { peso: 3.2 },
  // m sotto il livello del mare. Già 40 m nella prima cella di mare: con meno, l'interpolazione liscia
  // delle Scene (passo 3) spostava la costa verso il largo e il mare quasi spariva.
  fondale: { costa: 40, massimo: 2500 },
};

// Fase 3: poggi.
const POGGI = {
  densita: { lunghezza: 30, soglia: [-0.35, 0.45] },  // campo su grande scala: dove sono fitti e dove radi
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
        profilo[i] = 0.6 * spina * spina * creste
          + R.contrafforti * piede * (R.zoccolo + (1 - R.zoccolo) * ridged(wx, wy, sD, R.dettaglio, 5));
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
  // Prima, un'ondulazione su grande scala: su un pendio lungo e uniforme il flusso (8 direzioni) correva in
  // diagonale dritta per decine di km e l'erosione la scavava. Così i fiumi deviano e piegano su 10–30 km.
  const OE = EROSIONE.ondulazione, sOE = derivaSeme(seme, 45);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (mare[i]) continue;
      const A = OE.metri + OE.perMetro * quota[i];
      quota[i] += A * (0.6 * fbm(x, y, sOE, OE.lunghezze[0], 3) + 0.4 * fbm(x, y, sOE ^ 0x2545f491, OE.lunghezze[1], 2));
      if (quota[i] < 1) quota[i] = 1;
    }
  }
  erosioneFluviale(cols, rows, quota, mare, seme, (f) => avanzamento?.('Erosione dei fiumi', 0.25 + 0.5 * f));
  mappaFasce(quota, mare, carattere, quota);
  avanzamento?.('Fiumi, laghi e poggi', 0.78);

  // ─── Valichi tra grandi valli contrapposte (prima del drenaggio, che si ricalcola sul passo scavato) ───
  const valichiCarta = valichiTraValli(seme, cols, rows, quota, mare);

  // ─── Fasi 4–5: drenaggio, valli, fiumi e laghi ───
  const dren = drenaggio(cols, rows, quota, mare, seme);
  for (const v of valichiCarta) {                    // quota finale del passo (dopo lo scavo delle valli)
    v.quota = quota[Math.floor(v.y) * cols + Math.floor(v.x)];
    for (const t of v.valli) t.quota = quota[Math.floor(t.y) * cols + Math.floor(t.x)];
  }

  // ─── Fase 3 (dopo il drenaggio): poggi ───
  // Dopo, non prima: messi prima, i gruppi di poggi chiudevano conche nelle pianure (~150 laghetti in più).
  // Lontani dai corsi d'acqua, che restano più bassi: l'acqua dei poggi scende verso di loro.
  const poggi = piazzaPoggi(seme, cols, rows, quota, mare, catena, dren);

  // ─── Gruppi montuosi e forcelle (dopo il passo 8) ───
  const vette = massicciEForcelle(seme, cols, rows, quota, mare, dren.acque, valichiCarta);

  // ─── Fasi 6–7: clima e biomi ───
  avanzamento?.('Clima e biomi', 0.88);
  const clima = climaEBiomi(seme, cols, rows, quota, mare, dren.acque);
  // ─── Fase 8: correzioni per le regole di varietà (solo la copertura, mai il rilievo) ───
  avanzamento?.('Varietà del paesaggio', 0.9);
  // Creste aspre: roccia (o neve, se lassù fa così freddo), prima delle correzioni che le vedono.
  for (let i = 0; i < n; i++) {
    if (vette.asprezza[i] > MASSICCI.invalicabile && clima.bioma[i] !== BIOMA.NEVE && clima.bioma[i] !== BIOMA.GHIACCIO
      && !mare[i] && dren.acque[i] === ACQUA.TERRA) clima.bioma[i] = BIOMA.ROCCIA;
  }
  const correzioni = correggiVarieta(seme, cols, rows, quota, mare, dren, clima);
  const contaBiomi = new Array(NOMI_BIOMI.length).fill(0);
  let celleTerraB = 0;
  for (let i = 0; i < n; i++) if (!mare[i] && dren.acque[i] === ACQUA.TERRA) { contaBiomi[clima.bioma[i]]++; celleTerraB++; }

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
    sogliaTorrente: DRENAGGIO.torrente,       // carta.fiumi comprende anche i torrenti (bacino da qui a sogliaFiume)
    temperaturaMare: clima.temperaturaMare,   // °C, media annua al livello del mare (limite delle nevi)
    temperatura: clima.temperatura,           // °C, media annua alla quota della cella
    umidita: clima.umidita,                   // 0…1
    bioma: clima.bioma,                       // BIOMA.*
    valichiCarta,                             // valichi tra grandi valli (luoghi.js li rende carta.valichi)
    massicci: vette.massicci,                 // gruppi montuosi: { id, x, y (km), forma, altezza, torri, raggio }
    asprezza: vette.asprezza,                 // 0…1; > 0,5: pareti di un gruppo
    valico: vette.valico,                     // 1 = cella di una forcella tra le torri di un gruppo (non un valico:
                                              // i valichi veri sono carta.valichi, js/mondo/luoghi.js)
    statistiche: {
      frazioneMare: celleMare / n, ms, cima, laghi: dren.laghi,
      biomi: Object.fromEntries(NOMI_BIOMI.map((nome, b) => [nome, contaBiomi[b] / (celleTerraB || 1)])),
      copertura: clima.copertura, correzioni, valichi: vette.valichi, celleAspre: vette.aspre,
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

// ─── Fasi 6–7: clima e biomi (passo 7) ──────────────────────────────────

/** Biomi: gli stessi codici del 2D (World.BIOME), così costi di viaggio (TRAVEL_COST) ed eventi restano validi. */
export const BIOMA = {
  ACQUA: 0, PIANURA: 1, FORESTA: 2, COLLINA: 3, MONTAGNA: 4, PALUDE: 5,
  SABBIA: 6, NEVE: 7, GHIACCIO: 8, FIUME: 9, ROCCIA: 10, PIANURA_N: 11, PIANURA_S: 12,
};
export const NOMI_BIOMI = ['acqua', 'pianura', 'foresta', 'collina', 'montagna', 'palude', 'sabbia', 'neve',
  'ghiaccio', 'fiume', 'roccia', 'pianura settentrionale', 'pianura meridionale'];

// Temperature: media annua (°C). Lunghezze in km.
export const CLIMA = {
  latitudine: [-4, 21],          // al livello del mare: nord, sud (riga 0 = nord)
  scostamento: 2,                // ± per seme (mondi più caldi o più freddi)
  rumore: { lunghezza: 60, ampiezza: 3 },   // solo su grande scala (GDD: niente salti di clima)
  gradiente: 0.0065,             // °C in meno per metro di quota
  stagioni: { inverno: -9, estate: 8 },      // scarto dalla media annua (per il limite delle nevi)
  neve: -5,                      // media annua sotto cui la neve resta tutto l'anno (Alpi: ~−5 °C a ~2900 m)
  neveSuolo: -3,                 // media della stagione sotto cui il manto di neve resta al suolo
  mareGhiacciato: -3,            // media annua del mare sotto cui il mare gela
  bosco: 1.5,                    // limite degli alberi: media annua minima
  // sud: quanto il sud è più secco (nella regione di 120×90 km il mare è sempre vicino e l'aria sempre umida:
  // senza, la zona arida c'era in 6 mondi su 30; deciso con l'utente: ogni mondo dal freddo all'arido)
  umidita: { mare: 25, lunghezza: 45, monti: [800, 2000], sud: [0.6, 1, 0.25] },
  // Biomi (soglie): collina dove il dislivello nelle 3×3 celle supera `mosso` m; roccia dove la pendenza
  // della Carta supera `ripido` (o `ripidoAlto` sopra il limite degli alberi).
  biomi: { mosso: 110, ripido: 0.45, ripidoAlto: 0.25, nord: 5, sud: 16,
    deserto: { caldo: 16, secco: 0.32 }, palude: { quota: 40, umida: 0.68, caldo: 6, piatto: 45 },
    boschi: { lunghezza: 14, copertura: [0.2, 0.42], umida: 0.3, caldo: 24 },
    bordo: { lunghezza: 5, ampiezza: 1.5 } },   // soglie frastagliate: transizioni brevi e irregolari
};

/**
 * Temperatura media annua al livello del mare (°C) per ogni cella: latitudine, scostamento del seme e un
 * rumore su grande scala. La temperatura a una quota h è questa − CLIMA.gradiente · h.
 */
function temperatureBase(seme, cols, rows) {
  const C = CLIMA, n = cols * rows;
  const rng = mulberry32(derivaSeme(seme, 61));
  const sposta = (rng() * 2 - 1) * C.scostamento;
  const sT = derivaSeme(seme, 62);
  const t = new Float32Array(n);
  for (let y = 0; y < rows; y++) {
    const lat = C.latitudine[0] + (C.latitudine[1] - C.latitudine[0]) * (y / (rows - 1));
    for (let x = 0; x < cols; x++) {
      t[y * cols + x] = lat + sposta + C.rumore.ampiezza * fbm(x, y, sT, C.rumore.lunghezza, 3);
    }
  }
  return t;
}

/**
 * Fasi 6–7: temperatura, umidità e biomi per cella.
 * @returns {{ temperaturaMare: Float32Array, temperatura: Float32Array, umidita: Float32Array, bioma: Uint8Array,
 *   copertura: number }}
 */
function climaEBiomi(seme, cols, rows, quota, mare, acque) {
  const C = CLIMA, B = C.biomi, n = cols * rows;
  const temperaturaMare = temperatureBase(seme, cols, rows);
  const temperatura = new Float32Array(n);
  for (let i = 0; i < n; i++) temperatura[i] = temperaturaMare[i] - C.gradiente * Math.max(0, quota[i]);

  // Umidità 0…1: vicinanza al mare (1 / (1 + d / 80 km)), rumore su grande scala, piogge sui rilievi.
  const dMare = distanze(cols, rows, (i) => mare[i] === 1);
  const rng = mulberry32(derivaSeme(seme, 63));
  const aridita = (rng() * 2 - 1) * 0.08;               // carattere: mondi più secchi o più umidi
  const copertura = B.boschi.copertura[0] + rng() * (B.boschi.copertura[1] - B.boschi.copertura[0]);
  const sU = derivaSeme(seme, 64), sB = derivaSeme(seme, 65), sF = derivaSeme(seme, 66), sJ = derivaSeme(seme, 67);
  const umidita = new Float32Array(n);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const vicino = 1 / (1 + dMare[i] / C.umidita.mare);
      const r = 0.5 + 0.5 * fbm(x, y, sU, C.umidita.lunghezza, 4);
      const monti = smoothstep(C.umidita.monti[0], C.umidita.monti[1], quota[i]);
      const sud = C.umidita.sud[2] * smoothstep(C.umidita.sud[0], C.umidita.sud[1], y / (rows - 1));
      umidita[i] = Math.min(1, Math.max(0, 0.45 * vicino + 0.45 * r + 0.15 * monti - aridita - sud));
    }
  }

  // Dislivello nelle 3×3 celle e pendenza (Carta): collina, roccia.
  // (il fondale conta come 0: accanto alla costa il dislivello è quello della terra)
  const Q = (x, y) => Math.max(0, quota[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]);
  const bioma = new Uint8Array(n);
  const punteggio = new Float32Array(n).fill(-1);        // boschi: punteggio delle celle che li ammettono
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const T = temperatura[i], T0 = temperaturaMare[i], u = umidita[i], q = quota[i];
      if (mare[i]) { bioma[i] = T0 < C.mareGhiacciato ? BIOMA.GHIACCIO : BIOMA.ACQUA; continue; }
      if (acque[i] === ACQUA.LAGO || acque[i] === ACQUA.LAGO_COSTIERO) {
        bioma[i] = T < C.neve ? BIOMA.GHIACCIO : BIOMA.ACQUA; continue;
      }
      // Bordo frastagliato: un rumore fine sposta le soglie di temperatura (transizioni brevi e irregolari).
      const j = B.bordo.ampiezza * fbm(x, y, sJ, B.bordo.lunghezza, 3);
      let mn = Infinity, mx = -Infinity;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const v = Q(x + a, y + b); if (v < mn) mn = v; if (v > mx) mx = v; }
      const mosso = mx - mn;
      const gx = (Q(x + 1, y) - Q(x - 1, y)) / 2000, gy = (Q(x, y + 1) - Q(x, y - 1)) / 2000;
      const pend = Math.sqrt(gx * gx + gy * gy);
      let b;
      if (T + j < C.neve) b = BIOMA.NEVE;
      else if (pend > B.ripido || (T + j < C.bosco && pend > B.ripidoAlto)) b = BIOMA.ROCCIA;
      else if (q >= 1500) b = BIOMA.MONTAGNA;
      else if (q < B.palude.quota && u > B.palude.umida && T > B.palude.caldo && mosso < B.palude.piatto
        && dMare[i] <= 4) b = BIOMA.PALUDE;
      else if (T0 + j > B.deserto.caldo && u < B.deserto.secco && q < 700) b = BIOMA.SABBIA;
      else if (mosso > B.mosso || q >= 700) b = BIOMA.COLLINA;
      else b = T + j < B.nord ? BIOMA.PIANURA_N : T + j > B.sud ? BIOMA.PIANURA_S : BIOMA.PIANURA;
      // Boschi a grumi: grande scala + umidità + dettaglio dei bordi; sotto il limite degli alberi.
      if ((b === BIOMA.PIANURA || b === BIOMA.PIANURA_N || b === BIOMA.PIANURA_S || b === BIOMA.COLLINA
        || b === BIOMA.MONTAGNA) && T + j > C.bosco && T < B.boschi.caldo && u > B.boschi.umida) {
        const c1 = 0.5 + 0.5 * fbm(x, y, sB, B.boschi.lunghezza, 3);
        const c2 = 0.5 + 0.5 * fbm(x, y, sF, B.boschi.lunghezza / 2.2, 2);
        punteggio[i] = c1 * 0.55 + u * 0.25 + c2 * 0.2 - (b === BIOMA.MONTAGNA ? 0.06 : 0);
      }
      bioma[i] = b;
    }
  }
  // Soglia dei boschi per quantile: la parte di terra a bosco è la copertura del seme (20–42 %).
  let terra = 0;
  const validi = [];
  for (let i = 0; i < n; i++) {
    if (!mare[i] && acque[i] === ACQUA.TERRA) terra++;
    if (punteggio[i] >= 0) validi.push(punteggio[i]);
  }
  if (validi.length) {
    validi.sort((a, b) => a - b);
    const parte = Math.min(0.9, copertura * terra / validi.length);
    const soglia = validi[Math.min(validi.length - 1, Math.floor((1 - parte) * validi.length))];
    for (let i = 0; i < n; i++) if (punteggio[i] >= soglia) bioma[i] = BIOMA.FORESTA;
  }
  return { temperaturaMare, temperatura, umidita, bioma, copertura };
}

// ─── Valichi tra grandi valli contrapposte ───────────────────────────────

/**
 * Valichi (deciso con l'utente): dove due grandi valli di sistemi diversi salgono da lati opposti fin sotto una
 * catena, tra le loro testate c'è un passo: il punto più basso del crinale tra le due (percorso «minimax» in un
 * corridoio). Se il passo è troppo alto lo si scava (al più `scavo` m), prima del drenaggio: fiumi e laghi si
 * ricalcolano sul rilievo finale. Al più un valico ogni `distanza` km. Lunghezze in km, quote in m.
 */
export const VALICHI_CARTA = {
  // bacino: km² della valle alla testata (nella regione di 120×90 km i corsi da 150 km² nascono lontano dai monti)
  testata: { quota: [250, 2100], vicinoMonti: 10, monti: 1700, bacino: 40 },   // testata di una grande valle, vicino ai monti
  coppia: { distanza: [5, 25], giro: 20, corridoio: 3 },           // testate opposte; sistemi diversi
  sella: { sopra: 250, massima: 3000 },        // il passo sta almeno così sopra entrambe le testate
  bersaglio: 2000, scavo: 500,                 // si scava fino a bersaglio, al più di scavo m (valichi alti fino a ~2500)
  intaglio: { lungo: 45, largo: 220, raggio: 5 },   // m per km lungo il passo, m per km² ai lati; km
  distanza: 15,
  // Punteggio (più basso = meglio): quota del passo, salita dalla testata più bassa (le valli che salgono piano
  // fin sotto il passo sono le migliori), distanza tra le testate, grandezza delle due valli (bacino a `valle` km
  // sotto la testata: le valli grandi che si addentrano nella catena).
  peso: { quota: 0.5, salita: 1, distanza: 12, grandezza: 160 }, valle: 10,
};

function valichiTraValli(seme, cols, rows, quota, mare) {
  const V = VALICHI_CARTA, n = cols * rows;
  const acque = classificaAcque(cols, rows, mare);
  const foce = foci(cols, rows, acque);
  const { ricevente, bacino, ordine } = flusso(cols, rows, riempi(cols, rows, quota, foce), foce, acque, derivaSeme(seme, 42));
  const soglia = V.testata.bacino;
  const terra = (i) => !mare[i] && acque[i] === ACQUA.TERRA;
  const vicinoMonti = distanzaDa(cols, rows, (i) => terra(i) && quota[i] >= V.testata.monti);
  // Foce di ogni cella (sistema del fiume).
  const fociDi = new Int32Array(n).fill(-1);
  for (let t = ordine.length - 1; t >= 0; t--) {
    const i = ordine[t], r = ricevente[i];
    fociDi[i] = r < 0 ? i : fociDi[r] >= 0 ? fociDi[r] : r;
  }
  // Testate: celle di fiume senza affluenti di fiume a monte, vicino ai monti, ben sotto la catena.
  const affluente = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (bacino[i] >= soglia && ricevente[i] >= 0) affluente[ricevente[i]] = 1;
  const testate = [];
  for (let i = 0; i < n; i++) {
    if (!terra(i) || bacino[i] < soglia || affluente[i]) continue;
    if (quota[i] < V.testata.quota[0] || quota[i] > V.testata.quota[1] || vicinoMonti[i] > V.testata.vicinoMonti) continue;
    testate.push(i);
  }
  const passo = (i, j) => ((i % cols) !== (j % cols) && ((i / cols) | 0) !== ((j / cols) | 0) ? Math.SQRT2 : 1);
  /** Grandezza della valle: bacino (km²) V.valle km a valle della testata. */
  const grande = (i) => { for (let k = 0; k < V.valle && ricevente[i] >= 0; k++) i = ricevente[i]; return bacino[i]; };
  const lungoFiume = new Map();
  /** Giro lungo i fiumi tra due celle dello stesso sistema (km). */
  function giro(a, b) {
    lungoFiume.clear();
    let d = 0, j = a;
    for (let k = 0; j >= 0 && k < 5000; k++) { lungoFiume.set(j, d); const r = ricevente[j]; if (r >= 0) d += passo(j, r); j = r; }
    d = 0; j = b;
    for (let k = 0; j >= 0 && k < 5000; k++) {
      if (lungoFiume.has(j)) return d + lungoFiume.get(j);
      const r = ricevente[j]; if (r >= 0) d += passo(j, r); j = r;
    }
    return Infinity;
  }
  /** Passo tra due testate: percorso che minimizza la quota massima, nel corridoio attorno al segmento. */
  function sella(a, b) {
    const ax = a % cols, ay = (a / cols) | 0, bx = b % cols, by = (b / cols) | 0;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy, C = V.coppia.corridoio;
    const nel = (x, y) => {
      let t = ((x - ax) * vx + (y - ay) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - vx * t, dy = y - ay - vy * t;
      return dx * dx + dy * dy <= C * C;
    };
    const costo = new Map([[a, quota[a]]]), da = new Map(), coda = [[quota[a], a]];
    const fatto = new Set();
    while (coda.length) {
      let m = 0;
      for (let k = 1; k < coda.length; k++) if (coda[k][0] < coda[m][0]) m = k;
      const [c, i] = coda[m]; coda[m] = coda[coda.length - 1]; coda.pop();
      if (fatto.has(i)) continue;
      fatto.add(i);
      if (i === b) break;
      const x = i % cols, y = (i / cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= cols || yy >= rows || !nel(xx, yy)) continue;
        const j = yy * cols + xx;
        if (!terra(j) || fatto.has(j)) continue;
        const nc = Math.max(c, quota[j]);
        if (nc < (costo.get(j) ?? Infinity)) { costo.set(j, nc); da.set(j, i); coda.push([nc, j]); }
      }
    }
    if (!fatto.has(b)) return null;
    let alto = b;
    for (let i = b; i !== a; i = da.get(i)) if (quota[i] > quota[alto]) alto = i;
    return { cella: alto, quota: quota[alto] };
  }
  // Coppie di testate opposte e il loro passo.
  const candidati = [];
  const D = V.coppia.distanza;
  for (let p = 0; p < testate.length; p++) {
    const a = testate[p], ax = a % cols, ay = (a / cols) | 0;
    for (let q = p + 1; q < testate.length; q++) {
      const b = testate[q], dx = (b % cols) - ax, dy = ((b / cols) | 0) - ay, d = Math.sqrt(dx * dx + dy * dy);
      if (d < D[0] || d > D[1]) continue;
      if (fociDi[a] === fociDi[b] && giro(a, b) < V.coppia.giro) continue;
      const s = sella(a, b);
      if (!s) continue;
      const sopra = s.quota - Math.max(quota[a], quota[b]);
      if (sopra < V.sella.sopra || s.quota > V.sella.massima) continue;
      const finale = s.quota <= V.bersaglio ? s.quota : Math.max(V.bersaglio, s.quota - V.scavo);
      const P = V.peso, salita = finale - Math.min(quota[a], quota[b]);
      const grandezza = Math.log2(Math.min(grande(a), grande(b)) / soglia);
      const deviazione = fociDi[a] === fociDi[b] ? giro(a, b) : Infinity;
      candidati.push({ a, b, sella: s.cella, quotaSella: s.quota, finale, d, deviazione,
        punteggio: P.quota * finale + P.salita * salita + P.distanza * d - P.grandezza * grandezza });
    }
  }
  candidati.sort((u, v) => u.punteggio - v.punteggio || u.sella - v.sella);
  const scelti = [];
  for (const c of candidati) {
    const x = (c.sella % cols) + 0.5, y = ((c.sella / cols) | 0) + 0.5;
    if (scelti.some((v) => Math.hypot(v.x - x, v.y - y) < V.distanza)) continue;
    scelti.push({ x, y, c });
  }
  // Scavo: un intaglio morbido attorno al passo, dolce lungo la direzione tra le testate, che sale ai lati.
  const I = V.intaglio;
  const valichi = scelti.map(({ x, y, c }, id) => {
    if (c.finale < c.quotaSella) {
      const ax = c.a % cols, ay = (c.a / cols) | 0, bx = c.b % cols, by = (c.b / cols) | 0;
      const l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
      const sx = Math.floor(x), sy = Math.floor(y);
      for (let yy = Math.max(0, sy - I.raggio); yy <= Math.min(rows - 1, sy + I.raggio); yy++) {
        for (let xx = Math.max(0, sx - I.raggio); xx <= Math.min(cols - 1, sx + I.raggio); xx++) {
          const j = yy * cols + xx;
          if (!terra(j)) continue;
          const px = xx - sx, py = yy - sy, lungo = px * ux + py * uy, lato = -px * uy + py * ux;
          const bersaglio = c.finale + I.lungo * Math.abs(lungo) + I.largo * lato * lato;
          if (quota[j] > bersaglio) quota[j] = Math.max(quota[j] - V.scavo, bersaglio);
        }
      }
    }
    return { id, x, y, quota: c.finale, scavo: c.quotaSella - c.finale, distanza: c.d, deviazione: c.deviazione,
      valli: [c.a, c.b].map((t) => ({ x: (t % cols) + 0.5, y: ((t / cols) | 0) + 0.5, quota: quota[t] })) };
  });
  return valichi;
}

// ─── Gruppi montuosi e forcelle ──────────────────────────────────────────

/**
 * Gruppi montuosi riconoscibili (deciso con l'utente, sul modello delle Dolomiti): pochi gruppi distinti, ognuno
 * con una forma sua, separati da valli dove si cammina. Ogni gruppo ha 1–4 torri (pareti invalicabili sopra un
 * piede di ghiaioni percorribili); tra le torri dello stesso gruppo i ghiaioni si toccano e formano le forcelle.
 * Ogni gruppo potrà avere un nome («il monte X») con i luoghi. Lunghezze in km, altezze in m.
 */
export const MASSICCI = {
  quota: 1400,                  // m: cime da cui partono
  distanza: 14,                 // km tra due gruppi (le valli in mezzo)
  perArea: 300,                 // km² di terra oltre 1400 m per gruppo
  numero: [2, 6],
  forme: ['torre', 'altopiano', 'piramide', 'cresta'],
  torri: [1, 4],
  raggio: [0.55, 1.15],         // km: semiasse della torre (alla base della parete)
  altezza: [480, 880],          // m sopra il terreno, in cima
  contorno: { lunghezza: 0.45, ampiezza: 0.22 },   // km; il contorno delle pareti ondeggia (niente cilindri)
  piede: 1.9,                   // il ghiaione arriva a piede × raggio
  ghiaione: 0.22,               // altezza del ghiaione (frazione)
  muro: 0.82,                   // la parete va da 1 a muro × raggio
  invalicabile: 0.5,
  lontanoValichi: 9,            // km: nessun gruppo così vicino a un valico
};

const FORME_TORRI = {           // esponente della superellisse, allungamento, cima
  torre: { p: 2.6, allunga: [1, 1.5] },
  altopiano: { p: 4, allunga: [1.2, 2] },
  piramide: { p: 2, allunga: [1, 1.2] },
  cresta: { p: 2.4, allunga: [2.6, 3.6] },
};

/**
 * Profilo dei gruppi nel punto (x, y in km): { a: 0…1 altezza relativa, altezza (m), d (distanza normalizzata
 * dalla torre più alta: < 1 parete e cima), forcella: 0…1 (sul ghiaione tra due torri dello stesso gruppo),
 * forma, gruppo }.
 */
export function profiloMassicci(massicci, x, y, out = { a: 0, altezza: 0, d: Infinity, forcella: 0, forma: '', gruppo: -1 }) {
  out.a = 0; out.altezza = 0; out.d = Infinity; out.forcella = 0; out.forma = ''; out.gruppo = -1;
  if (!massicci) return out;
  const M = MASSICCI;
  for (const g of massicci) {
    if (Math.abs(x - g.x) > g.raggio || Math.abs(y - g.y) > g.raggio) continue;
    let primo = 0, secondo = 0;
    for (const t of g.torri) {
      const rx = x - t.x, ry = y - t.y;
      const lx = (rx * t.cos + ry * t.sin) / t.a, ly = (-rx * t.sin + ry * t.cos) / t.b;
      const F = FORME_TORRI[g.forma];
      let d = Math.pow(Math.pow(Math.abs(lx), F.p) + Math.pow(Math.abs(ly), F.p), 1 / F.p);
      if (d >= M.piede + M.contorno.ampiezza) continue;
      // Contorno irregolare: speroni e canaloni nelle pareti, rientranze nei ghiaioni.
      d *= 1 + M.contorno.ampiezza * fbm(x, y, g.seme, M.contorno.lunghezza, 3);
      if (d >= M.piede) continue;
      let a;
      if (d >= 1) a = M.ghiaione * smoothstep(M.piede, 1, d);                       // ghiaione (~15–25°)
      else if (d >= M.muro) a = M.ghiaione + (0.88 - M.ghiaione) * smoothstep(1, M.muro, d);   // parete
      else {
        const c = 1 - d / M.muro;                                                  // 0 al bordo della cima, 1 al centro
        a = g.forma === 'altopiano' ? 0.88 + 0.06 * c
          : g.forma === 'piramide' ? 0.88 + 0.5 * c
            : g.forma === 'cresta' ? 0.88 + 0.25 * Math.max(0, 1 - Math.abs(ly) / (M.muro * 0.6)) * (1 - Math.abs(lx) * 0.4)
              : 0.88 + 0.55 * Math.sqrt(c);                                       // torre: cima a punta, più alta
      }
      a *= t.h;
      if (a > primo) { secondo = primo; primo = a; if (d < out.d || g !== out._g) { out.d = d; } } else if (a > secondo) secondo = a;
      if (a >= out.a) { out.a = a; out.altezza = a * g.altezza; out.d = d; out.forma = g.forma; out.gruppo = g.id; out._g = g; }
    }
    // Forcella: sui ghiaioni dove due torri dello stesso gruppo si toccano (le due più alte nel punto, simili).
    if (secondo > 0.04 && primo < M.ghiaione * 1.05) out.forcella = Math.max(out.forcella, Math.min(1, secondo / primo) * smoothstep(0.03, 0.12, secondo));
  }
  return out;
}

/**
 * Sceglie i gruppi (cime alte e distanti tra loro) con forma, torri e misure dal seme; ne ricava l'asprezza per
 * cella (> MASSICCI.invalicabile: parete) e le celle delle forcelle.
 */
function massicciEForcelle(seme, cols, rows, quota, mare, acque, valichiCarta = []) {
  const M = MASSICCI, n = cols * rows;
  const rng = mulberry32(derivaSeme(seme, 81));
  const terra = (i) => !mare[i] && acque[i] === ACQUA.TERRA;
  let alte = 0;
  for (let i = 0; i < n; i++) if (terra(i) && quota[i] >= M.quota) alte++;
  const quanti = Math.max(M.numero[0], Math.min(M.numero[1], Math.round(alte / M.perArea)));
  const cime = [];
  for (let y = 4; y < rows - 4; y++) {
    for (let x = 4; x < cols - 4; x++) {
      const i = y * cols + x;
      if (!terra(i) || quota[i] < M.quota) continue;
      let massimo = true;
      for (let b = -3; b <= 3 && massimo; b++) for (let a = -3; a <= 3; a++) if ((a || b) && quota[i + b * cols + a] > quota[i]) { massimo = false; break; }
      if (massimo) cime.push(i);
    }
  }
  // Non solo le più alte: un po' di caso, così ci sono gruppi anche nel pedemonte alto.
  const punteggio = new Map(cime.map((i) => [i, quota[i] * (0.75 + 0.5 * rng())]));
  cime.sort((a, b) => punteggio.get(b) - punteggio.get(a));
  const massicci = [];
  for (const i of cime) {
    if (massicci.length >= quanti) break;
    const cx = (i % cols) + 0.5, cy = ((i / cols) | 0) + 0.5;
    if (massicci.some((g) => Math.hypot(g.x - cx, g.y - cy) < M.distanza)) continue;
    if (valichiCarta.some((v) => Math.hypot(v.x - cx, v.y - cy) < M.lontanoValichi)) continue;   // niente pareti sui valichi
    const forma = M.forme[Math.floor(rng() * M.forme.length)];
    const F = FORME_TORRI[forma];
    const nt = forma === 'cresta' ? 1 + Math.floor(rng() * 2) : M.torri[0] + Math.floor(rng() * (M.torri[1] - M.torri[0] + 1));
    const ang0 = rng() * Math.PI;
    const torri = [];
    for (let k = 0; k < nt; k++) {
      const r = M.raggio[0] + rng() * (M.raggio[1] - M.raggio[0]);
      const allunga = F.allunga[0] + rng() * (F.allunga[1] - F.allunga[0]);
      const a = r * Math.sqrt(allunga), b = r / Math.sqrt(allunga);
      // Torri vicine: i ghiaioni (piede × raggio) si toccano, le pareti no → forcelle tra le torri.
      let tx = cx, ty = cy, vicina = -1;
      if (k > 0) {
        vicina = Math.floor(rng() * torri.length);
        const prec = torri[vicina];
        const ang = ang0 + (rng() - 0.5) * 2.2 + (k % 2) * Math.PI;
        const dist = (Math.max(prec.a, prec.b) + Math.max(a, b)) * (1.15 + 0.35 * rng());
        tx = prec.x + Math.cos(ang) * dist; ty = prec.y + Math.sin(ang) * dist;
      }
      const rot = ang0 + (rng() - 0.5) * 0.8;
      torri.push({ x: tx, y: ty, a, b, cos: Math.cos(rot), sin: Math.sin(rot), h: k === 0 ? 1 : 0.65 + 0.3 * rng(), vicina });
    }
    let raggio = 0;
    for (const t of torri) raggio = Math.max(raggio, Math.hypot(t.x - cx, t.y - cy) + Math.max(t.a, t.b) * M.piede);
    massicci.push({ id: massicci.length, seme: derivaSeme(seme, 900 + massicci.length), x: cx, y: cy, forma, altezza: M.altezza[0] + rng() * (M.altezza[1] - M.altezza[0]),
      torri, raggio, forcelle: [] });
  }
  // Forcelle: tra ogni torre e quella a cui si appoggia, il punto più basso del profilo sulla congiungente
  // (se lì non c'è parete: la sella sta sui ghiaioni).
  const q = { a: 0, altezza: 0, d: 0, forcella: 0, forma: '', gruppo: -1 };
  for (const g of massicci) {
    for (const t of g.torri) {
      if (t.vicina < 0) continue;
      const u = g.torri[t.vicina];
      let migliore = null, aMin = Infinity;
      for (let k = 1; k < 40; k++) {
        const f = k / 40, x = u.x + (t.x - u.x) * f, y = u.y + (t.y - u.y) * f;
        profiloMassicci(massicci, x, y, q);
        if (q.a < aMin) { aMin = q.a; migliore = { x, y, parete: q.d < 1 }; }
      }
      if (migliore && !migliore.parete) g.forcelle.push({ x: migliore.x, y: migliore.y });
    }
  }
  const asprezza = new Float32Array(n), valico = new Uint8Array(n);
  const p = { a: 0, altezza: 0, d: 0, forcella: 0, forma: '', gruppo: -1 };
  for (const g of massicci) {
    const x0 = Math.max(0, Math.floor(g.x - g.raggio)), x1 = Math.min(cols - 1, Math.ceil(g.x + g.raggio));
    const y0 = Math.max(0, Math.floor(g.y - g.raggio)), y1 = Math.min(rows - 1, Math.ceil(g.y + g.raggio));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x;
        if (!terra(i)) continue;
        let a = 0;
        for (const [ox, oy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          profiloMassicci(massicci, x + ox, y + oy, p);
          if (p.d < 1) a = Math.max(a, 1); else a = Math.max(a, p.a * 0.5);
        }
        asprezza[i] = Math.max(asprezza[i], a);
      }
    }
  }
  // Celle delle forcelle: percorribili (anche se una parete sfiora la cella) e segnate come valichi.
  for (const g of massicci) {
    for (const f of g.forcelle) {
      const i = Math.floor(f.y) * cols + Math.floor(f.x);
      valico[i] = 1;
      asprezza[i] = Math.min(asprezza[i], 0.3);
    }
  }
  let aspre = 0;
  for (let i = 0; i < n; i++) if (asprezza[i] > M.invalicabile) aspre++;
  const valichi = massicci.reduce((s, g) => s + g.forcelle.length, 0);
  return { massicci, asprezza, valico, valichi, aspre };
}

// ─── Fase 8: correzioni per le regole di varietà ─────────────────────────

/**
 * Corregge i biomi perché valgano le regole di varietà del GDD (verifica in verifica.js), toccando solo la
 * copertura:
 *   - deserto troppo vicino alla neve → pianura arida;
 *   - distese uniformi più ampie di VARIETA.uniforme km → un grumo irregolare di 3–5 km di un paesaggio
 *     compatibile al loro centro (radura nel bosco, bosco nella pianura o in collina, bosco o pascolo in montagna);
 *   - finestre di 40×40 km con meno di 3 tipi di paesaggio → un grumo di un tipo plausibile che manca.
 * @returns {{ deserto: number, grumi: number, finestre: number }}  quante correzioni
 */
function correggiVarieta(seme, cols, rows, quota, mare, dren, clima) {
  const V = VARIETA, { bioma, temperatura, umidita } = clima, n = cols * rows;
  const rng = mulberry32(derivaSeme(seme, 70));
  const esito = { deserto: 0, grumi: 0, finestre: 0 };
  const carta = { cols, rows, bioma, mare, acque: dren.acque, bacino: dren.bacino, sogliaFiume: DRENAGGIO.fiume, quota };

  // Deserto lontano dalla neve.
  const dNeve = distanzaDa(cols, rows, (i) => bioma[i] === BIOMA.NEVE || bioma[i] === BIOMA.GHIACCIO && !mare[i]);
  for (let i = 0; i < n; i++) {
    if (bioma[i] === BIOMA.SABBIA && dNeve[i] < V.sabbiaNeve) { bioma[i] = BIOMA.PIANURA_S; esito.deserto++; }
  }

  const pendenza = (i) => {
    const x = i % cols, y = (i / cols) | 0;
    const Q = (a, b) => Math.max(0, quota[Math.min(rows - 1, Math.max(0, b)) * cols + Math.min(cols - 1, Math.max(0, a))]);
    return Math.hypot(Q(x + 1, y) - Q(x - 1, y), Q(x, y + 1) - Q(x, y - 1)) / 2000;
  };
  const pianuraPer = (T) => T < CLIMA.biomi.nord ? BIOMA.PIANURA_N : T > CLIMA.biomi.sud ? BIOMA.PIANURA_S : BIOMA.PIANURA;
  const boscoAmmesso = (i) => temperatura[i] > CLIMA.bosco + 0.5 && temperatura[i] < CLIMA.biomi.boschi.caldo && umidita[i] > 0.25;
  /** Un paesaggio compatibile e diverso da quello della cella, per rompere una distesa. */
  function contrasto(i) {
    const t = tipoPaesaggio(bioma[i], false);
    if (t === 2) return pianuraPer(temperatura[i]);                       // bosco → radura
    if (t === 3) return boscoAmmesso(i) ? BIOMA.FORESTA : BIOMA.COLLINA;  // montagna → bosco o pascolo
    if (boscoAmmesso(i)) return BIOMA.FORESTA;                            // pianura, collina → bosco
    if (pendenza(i) > 0.12) return BIOMA.ROCCIA;                          // affioramento di roccia
    return t === 0 ? BIOMA.COLLINA : pianuraPer(temperatura[i]);
  }
  /** Dove un paesaggio aggiunto può stare (i grumi non lo portano oltre). */
  const ammessa = (b, j) => b === BIOMA.PALUDE ? quota[j] < V.paludeQuota - 50
    : b === BIOMA.FORESTA ? boscoAmmesso(j) : true;
  /** Grumo organico: dalla cella, crescita casuale sulle celle dello stesso tipo, fino a `quante` celle. */
  function grumo(i0, nuovo, quante) {
    const t0 = tipoPaesaggio(bioma[i0], mare[i0] || dren.acque[i0] !== ACQUA.TERRA);
    const fatto = new Set([i0]), frontiera = [i0];
    let messe = 0;
    while (frontiera.length && messe < quante) {
      const k = Math.floor(rng() * frontiera.length);
      const i = frontiera[k];
      frontiera[k] = frontiera[frontiera.length - 1]; frontiera.pop();
      bioma[i] = nuovo; messe++;
      const x = i % cols;
      for (const j of [i - 1, i + 1, i - cols, i + cols, i - cols - 1, i - cols + 1, i + cols - 1, i + cols + 1]) {
        if (j < 0 || j >= n || fatto.has(j) || Math.abs((j % cols) - x) > 1) continue;
        fatto.add(j);
        if (mare[j] || dren.acque[j] !== ACQUA.TERRA || tipoPaesaggio(bioma[j], false) !== t0 || !ammessa(nuovo, j)) continue;
        if (rng() < 0.6) frontiera.push(j);
      }
    }
    return messe;
  }

  // Distese uniformi: a ogni giro, grumi ai centri delle distese troppo ampie (distanti tra loro), poi di nuovo.
  for (let giro = 0; giro < 12; giro++) {
    const { tipo, distanza } = uniformita(carta);
    const centri = [];
    for (let i = 0; i < n; i++) {
      if (tipo[i] === 4 || tipo[i] === 5 || tipo[i] === 7 || tipo[i] === 8 || 2 * distanza[i] <= V.uniforme) continue;
      const x = i % cols, y = (i / cols) | 0;
      let massimo = true;                                      // massimo locale della distanza (5×5)
      for (let b = -2; b <= 2 && massimo; b++) for (let a = -2; a <= 2; a++) {
        const xx = x + a, yy = y + b;
        if ((a || b) && xx >= 0 && yy >= 0 && xx < cols && yy < rows && distanza[yy * cols + xx] > distanza[i]) { massimo = false; break; }
      }
      if (!massimo) continue;
      if (centri.some((j) => Math.abs((j % cols) - x) < 10 && Math.abs(((j / cols) | 0) - y) < 10)) continue;
      centri.push(i);
    }
    if (!centri.length) break;
    for (const i of centri) { grumo(i, contrasto(i), 8 + Math.floor(rng() * 14)); esito.grumi++; }
  }

  // Finestre con meno di 3 tipi: un grumo del tipo plausibile che manca, vicino al centro della finestra.
  const F = V.finestra, conta = new Int32Array(TIPI.length);
  for (let giro = 0; giro < 3; giro++) {
    let corrette = 0;
    const { tipo } = uniformita(carta);
    for (let y0 = 0; y0 + F <= rows; y0 += V.passoFinestra) {
      for (let x0 = 0; x0 + F <= cols; x0 += V.passoFinestra) {
        conta.fill(0);
        for (let y = y0; y < y0 + F; y++) for (let x = x0; x < x0 + F; x++) conta[tipo[y * cols + x]]++;
        const terra = F * F - conta[7];
        if (terra < V.terraMinima * F * F || conta[4] + conta[5] > V.estremi * terra) continue;
        let tipi = 0;
        for (let t = 0; t < TIPI.length; t++) if (conta[t] >= V.parteTipo * F * F) tipi++;
        if (tipi >= V.tipiMinimi) continue;
        // Celle di terra vicine al centro, provate a caso: il primo paesaggio che manca e lì è plausibile.
        const servono = Math.ceil(V.parteTipo * F * F) + 4;
        for (let prova = 0; prova < 40; prova++) {
          const x = x0 + 8 + Math.floor(rng() * (F - 16)), y = y0 + 8 + Math.floor(rng() * (F - 16)), i = y * cols + x;
          if (tipo[i] === 7 || tipo[i] === 4 || tipo[i] === 5) continue;
          const candidati = [];
          if (boscoAmmesso(i)) candidati.push(BIOMA.FORESTA);
          if (pendenza(i) > 0.08) candidati.push(BIOMA.ROCCIA);
          // Tundra (sotto il limite degli alberi, in piano): torbiere e rocce levigate dai ghiacci.
          if (temperatura[i] < CLIMA.bosco + 0.5) {
            if (quota[i] < V.paludeQuota && umidita[i] > 0.35) candidati.push(BIOMA.PALUDE);
            candidati.push(BIOMA.ROCCIA);
          }
          candidati.push(BIOMA.COLLINA, pianuraPer(temperatura[i]), BIOMA.ROCCIA);   // ultima: affioramenti (anche in steppa)
          const nuovo = candidati.find((b) => conta[tipoPaesaggio(b, false)] < V.parteTipo * F * F && tipoPaesaggio(b, false) !== tipo[i]);
          if (nuovo === undefined) continue;
          const messe = grumo(i, nuovo, servono);
          conta[tipoPaesaggio(nuovo, false)] += messe;
          if (messe >= servono * 0.7) { corrette++; esito.finestre++; break; }
        }
      }
    }
    if (!corrette) break;
  }
  return esito;
}

/**
 * Quota (m) del limite delle nevi in un punto, dalla temperatura media annua al livello del mare e dalla
 * stagione: la quota a cui la media della stagione scende a CLIMA.neveSuolo (alla latitudine media ~1800 m in
 * primavera e autunno, ~3000 m d'estate, ~400 m d'inverno).
 * @param {number} t0  temperatura media annua al livello del mare (°C)
 * @param {'inverno'|'primavera'|'estate'|'autunno'} stagione
 */
export function limiteNevi(t0, stagione = 'primavera') {
  const S = CLIMA.stagioni;
  const scarto = stagione === 'inverno' ? S.inverno : stagione === 'estate' ? S.estate : 0;
  return (t0 + scarto - CLIMA.neveSuolo) / CLIMA.gradiente;
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
const EROSIONE = {
  iterazioni: 24, ogni: 3, forza: 0.004,
  ondulazione: { metri: 12, perMetro: 0.03, lunghezze: [12, 30] },   // prima dell'erosione (vedi generaCarta)
};

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
  // Torrenti (deciso con l'utente): da `torrente` km² si disegnano anche i corsi minori, che nascono in alto
  // sotto le cime, e confluiscono nei fiumi; non cambiano il drenaggio (le loro valli sono già scavate per cella).
  torrente: 20,
  spostaTorrenti: { ampiezza: 0.42, lunghezze: [3, 8] },   // km: i punti delle celle ondeggiano (niente righe a griglia)
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
 * Zone piatte: insiemi collegati di celle con la stessa quota riempita (conche colmate), che contengono almeno
 * una cella senza vicine più basse. Ogni cella senza direzione segue il percorso di costo minimo (Dijkstra)
 * verso il bordo basso della zona (celle che hanno già dove scendere). Il costo di un passo varia dolcemente
 * nello spazio (rumore su ~8 km): l'acqua segue i corridoi «più facili» e il percorso piega. (La distanza a
 * scacchiera di Barnes, Lehman e Mulla 2014 dava rette a 45° lunghe decine di km attraverso le conche grandi,
 * che l'erosione poi scavava.) Ogni cella punta alla precedente sul percorso minimo: niente cicli, nessuna cella
 * senza uscita. Modifica `ricevente` e segna in `piatta` le celle diretta così.
 */
const ZONE_PIATTE = { lunghezza: 8, variazione: 0.8 };

function dirigiZonePiatte(cols, rows, riempita, foce, ricevente, seme, piatta) {
  const n = cols * rows;
  const zona = new Int32Array(n).fill(-1);
  const dist = new Float64Array(n).fill(Infinity);
  const prec = new Int32Array(n).fill(-1);
  const costo = new Float32Array(n).fill(NaN);       // calcolato solo dove serve
  const celle = new Int32Array(n);
  const sC = derivaSeme(seme, 71);
  const costoDi = (j) => {
    if (Number.isNaN(costo[j])) {
      const x = j % cols, y = (j - x) / cols;
      costo[j] = 1 + ZONE_PIATTE.variazione * (fbm(x, y, sC, ZONE_PIATTE.lunghezza, 2) + 1) * 0.5;
    }
    return costo[j];
  };
  // Coda di priorità (heap binario) su (distanza, indice).
  const hk = new Float64Array(n), hi = new Int32Array(n);
  let dim = 0;
  const minore = (a, b) => hk[a] < hk[b] || (hk[a] === hk[b] && hi[a] < hi[b]);
  const scambia = (a, b) => { const k = hk[a]; hk[a] = hk[b]; hk[b] = k; const i = hi[a]; hi[a] = hi[b]; hi[b] = i; };
  const metti = (k, i) => {
    let c = dim++;
    hk[c] = k; hi[c] = i;
    while (c > 0) { const p = (c - 1) >> 1; if (!minore(c, p)) break; scambia(c, p); c = p; }
  };
  const togli = () => {
    const i = hi[0], k = hk[0];
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
    return [i, k];
  };
  let nz = 0;
  for (let s = 0; s < n; s++) {
    if (foce[s] || ricevente[s] >= 0 || zona[s] >= 0) continue;
    const livello = riempita[s];
    let nc = 0;
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
    // Sorgenti del percorso: il bordo basso (celle della zona che hanno già dove scendere).
    dim = 0;
    for (let t = 0; t < nc; t++) { const i = celle[t]; if (ricevente[i] >= 0) { dist[i] = 0; metti(0, i); } }
    while (dim > 0) {
      const [i, d] = togli();
      if (d > dist[i]) continue;
      const x = i % cols, y = (i - x) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = x + V8X[k], ny = y + V8Y[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (zona[j] !== nz || ricevente[j] >= 0) continue;
        const nd = d + V8D[k] * 0.5 * (costoDi(i) + costoDi(j));
        if (nd < dist[j] || (nd === dist[j] && i < prec[j])) { dist[j] = nd; prec[j] = i; metti(nd, j); }
      }
    }
    for (let t = 0; t < nc; t++) {
      const i = celle[t];
      if (ricevente[i] < 0 && prec[i] >= 0) { ricevente[i] = prec[i]; piatta[i] = 1; }
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
  const torrenti = tracciaTorrenti(cols, rows, quota, acque, ricevente, bacino, fiumi, seme);
  return { acque, livello, ricevente, bacino, laghi, fiumi: fiumi.concat(torrenti), torrenti: torrenti.length };
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
 * Torrenti: corsi con bacino tra DRENAGGIO.torrente e DRENAGGIO.fiume km², dalle loro sorgenti fino al fiume (o al
 * torrente) in cui confluiscono, come i fiumi: Float32Array di punti (x, y, bacino, letto = NaN), dalla sorgente
 * a valle. L'ultimo punto è esattamente un punto del corso in cui confluiscono (le Scene raccordano lì il letto).
 * Prima i più lunghi, così ogni affluente trova già il suo corso.
 */
function tracciaTorrenti(cols, rows, quota, acque, ricevente, bacino, fiumi, seme) {
  const D = DRENAGGIO, n = cols * rows, S = PASSO_PUNTO, SP = D.spostaTorrenti;
  const sX = derivaSeme(seme, 54), sY = derivaSeme(seme, 55);
  /** Punto di una cella: centro più uno spostamento dolce (lo stesso per chi ci passa). */
  const punto = (c, r) => [
    c + 0.5 + SP.ampiezza * (0.65 * fbm(c, r, sX, SP.lunghezze[0], 2) + 0.35 * fbm(c, r, sX ^ 0x9e3779b9, SP.lunghezze[1], 2)),
    r + 0.5 + SP.ampiezza * (0.65 * fbm(c, r, sY, SP.lunghezze[0], 2) + 0.35 * fbm(c, r, sY ^ 0x9e3779b9, SP.lunghezze[1], 2))];
  const torrente = (i) => i >= 0 && acque[i] === ACQUA.TERRA && bacino[i] >= D.torrente && bacino[i] < D.fiume;
  // Indice dei punti dei corsi già tracciati (celle di 1 km → [curva, punto]).
  const corsi = fiumi.slice(), indice = new Map();
  const indicizza = (ci) => {
    const f = corsi[ci];
    for (let k = 0; k < f.length; k += S) {
      const key = Math.floor(f[k + 1]) * cols + Math.floor(f[k]);
      let l = indice.get(key);
      if (!l) indice.set(key, (l = []));
      l.push(ci, k);
    }
  };
  corsi.forEach((_, ci) => indicizza(ci));
  /** Punto (x, y) esatto del corso più vicino alla cella (entro 1 cella), o null. */
  const aggancio = (i, x, y) => {
    let best = null, bd = Infinity;
    const c = i % cols, r = (i - c) / cols;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const l = indice.get((r + b) * cols + c + a);
      if (!l) continue;
      for (let t = 0; t < l.length; t += 2) {
        const f = corsi[l[t]], k = l[t + 1], d = (f[k] - x) * (f[k] - x) + (f[k + 1] - y) * (f[k + 1] - y);
        if (d < bd) { bd = d; best = [f[k], f[k + 1], f[k + 2]]; }
      }
    }
    return best;
  };
  // Sorgenti: torrenti senza affluenti torrente; lunghezza del percorso fino alla confluenza.
  const affluente = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (torrente(i) && ricevente[i] >= 0) affluente[ricevente[i]] = 1;
  const sorgenti = [];
  for (let i = 0; i < n; i++) {
    if (!torrente(i) || affluente[i]) continue;
    let l = 0, j = i;
    while (torrente(j) && l < 500) { j = ricevente[j]; l++; }
    sorgenti.push([l, i]);
  }
  sorgenti.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const fatto = new Uint8Array(n);
  const out = [];
  for (const [, i0] of sorgenti) {
    const p = [];
    let i = i0, fine = null;
    while (torrente(i) && !fatto[i]) {
      fatto[i] = 1;
      const [px, py] = punto(i % cols, (i / cols) | 0);
      p.push(px, py, bacino[i], NaN);
      i = ricevente[i];
    }
    if (p.length < 2 * S) continue;
    // Fine: il corso in cui confluisce (fiume o torrente già tracciato), se c'è; altrimenti (mare, lago) com'è.
    if (i >= 0) fine = aggancio(i, p[p.length - S], p[p.length - S + 1]);
    let q = ricampiona(chaikin(p, 3), TRACCIATI.passo);
    if (fine) { q = q.concat([fine[0], fine[1], Math.max(fine[2], q[q.length - 2]), NaN]); }
    const f = Float32Array.from(q);
    if (fine) { f[f.length - S] = fine[0]; f[f.length - S + 1] = fine[1]; }   // esatto (Float32 come il corso)
    out.push(f);
    corsi.push(f);
    indicizza(corsi.length - 1);
  }
  return out;
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
