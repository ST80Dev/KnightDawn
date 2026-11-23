// Knight Dawn — luoghi del mondo generato (M7). Modulo ES senza grafica né DOM (regola 9).
// Passo 1: scelta dei siti delle rocche con borgo. Fase 9 ridotta del generatore: gira nel Worker dopo la
// Carta (generaCarta) e scrive `carta.luoghi`, che finisce nella cache con la Carta (VERSIONE_GENERATORE).
//
// Due stadi:
//   1. candidati sulle celle della Carta (1 km): terra, quota da collina a pedemonte, biomi abitabili, lontano
//      dalle pareti dei gruppi montuosi, dai bordi, dai fiumi e dai laghi; un'altura rispetto ai dintorni;
//   2. affinamento alla scala della Scena (quota del mondo, la stessa del terreno 3D): punto più alto della
//      cella, lavoro di terra sotto la rocca e sotto il borgo (nella direzione migliore), pendenza, dominanza
//      sui dintorni, distanza esatta dal tracciato del fiume più vicino e dal valico più vicino.
// Poi si scelgono 2–3 siti diversi e distanti tra loro, nella zona attorno al centro della Carta.
//
// Valichi (deciso con l'utente): passaggi ampi tra due valli diverse, ben sopra i fondovalle ma più bassi e
// più facili delle forcelle; quasi sempre presidiati da una costruzione di sentinella. Le forcelle (tra le
// torri di un gruppo montuoso, carta.massicci) sono un'altra cosa: più alte, faticose, spesso nella neve,
// raramente sorvegliate. Una rocca «di valico» sta più in basso, allo sbocco di una delle due valli.
// Solo operazioni dal risultato esatto (+ − × ÷, sqrt, floor) e costanti scritte a mano: il sito decide la
// forma del mondo (dal passo 2 il terrapieno), e deve essere identico in ogni browser.

import { ACQUA, BIOMA } from './carta.js';
import { quotaMondo, scavaFiumi, raffinaZona, quotaPiano, spianaPiani } from './scena.js';
import { derivaSeme } from './rumore.js';

/**
 * Rampe fuori dalla porta del borgo (condivise con js/3d/borgo3d.js e js/mondo/strade.js).
 * Dritta: dalla soglia al terreno lungo la normale della porta, `minima`–`massima` m, al più `pendenza`.
 * Lungo il muro (`muro`, M7 passo 10): dove la discesa dritta supererebbe `pendenza` (rocche in cima a colli ripidi da
 * ogni lato) un pianerottolo davanti alla porta e una rampa in terra e pietra lungo le mura, al `muro.pendenza`, fino
 * a dove tocca il terreno (al più `muro.massima` m): diventa un piano del luogo (tipo 'rampa'), così il terrapieno la
 * segue e taglia la scarpata del borgo.
 */
export const RAMPA_PORTA = {
  pendenza: 0.2, minima: 3, massima: 24, larghezza: 5, sopra: 0.5, sporgenza: 1,
  muro: { soglia: 0.28, pendenza: 0.18, larghezza: 5, massima: 120, minima: 8, pianerottolo: 7, spalla: 5, staccoMuro: 0.6,
    margine: 1.5 },
};

export const LUOGHI = {
  quota: [120, 900],              // m, quota della cella: collina e pedemonte
  quotaValico: 1300,              // m: quota massima per i siti vicino a un valico (sbocco di valle in pedemonte)
  biomi: [BIOMA.PIANURA, BIOMA.PIANURA_N, BIOMA.PIANURA_S, BIOMA.FORESTA, BIOMA.COLLINA],
  asprezza: 0.2,                  // oltre: vicino alle pareti dei gruppi montuosi
  bordo: 8,                       // km dal bordo della Carta
  lago: 1.5,                      // km (a celle) dai laghi
  fiume: { minimo: 0.9, minimoValle: 0.35, buono: [0.9, 4], fino: 6 },   // km dall'asse del tracciato della Carta
  valico: { buono: 8, fino: 15 },// km dal valico più vicino (il sito sta più in basso)
  riservati: 20,                  // per zona: celle affinate scelte tra quelle vicine a un valico
  candidati: 900,                 // celle affinate (le migliori secondo la stima sulla Carta)
  tessera: { km: 12, quanti: 8 }, // al più `quanti` celle affinate per tessera di km × km: candidati su tutta la Carta
  // Misure del sito (castello di casata, docs/ESPLORAZIONE_3D.md, M7): la classe ne cambierà la grandezza
  // dal passo 3; qui servono a giudicare il terreno.
  rocca: { semilato: 26, passo: 8.6667 },             // m: quadrato di 52 m attorno al punto più alto
  borgo: { distanza: 80, lungo: 45, largo: 65, nl: 7, nw: 9 },   // m: centro a 80 m, 90 × 130 m
  dominanza: { raggio: 1500, tetto: 250, minima: 15 },
  cima: { raggi: [150, 300, 450], tolleranza: 1 },    // m: niente più alto di così attorno alla rocca
  scarti: { rocca: 12, borgo: 30, pendenza: 15 },     // m, m, gradi (pendenza media del borgo)
  pesi: { fiume: 70, valico: 60, rocca: 4, borgo: 1.5, pendenza: 3 },
  // Scelta: zona attorno al centro (km), poi distanza minima tra i siti (km), a scalini se non bastano.
  zona: [25, 35, 50, 80],
  // Numero (GDD §2, densità: luoghi maggiori a ~18 km, 30–40 per mondo): per ora tutti rocche con borgo; con la
  // milestone dei luoghi una parte diventerà città e monasteri. Distanza minima a scalini finché non bastano.
  distanza: [15, 13, 11, 10],
  numero: 36,
  // Classi degli altri siti (la partenza è un castello di casata), per punteggio: le quote di sedi maggiori e di
  // castelli di casata, il resto rocche minori.
  quoteClassi: { maggiore: 0.15, casata: 0.35 },
  // Castello di valle (deciso con l'utente): a ≤ entro km da un crinale almeno sopra m più alto, così di persona
  // in 15–20 minuti si sale dal castello al crinale per guardare oltre. La partenza è di valle, se c'è.
  crinale: { entro: 5, sopra: 800 },
  // Passo 2: terrapieni. Misure piene (m) del piano della rocca e del borgo secondo la classe (lungo il verso del
  // borgo × di traverso); il borgo comincia dove finisce il piano della rocca.
  // Forme irregolari (decisione dell'utente: rocche e borghi tutti rettangolari sembravano uguali): la rocca segue la
  // cima (raggio tra `raggio` m, fin dove il terreno resta entro `cala` m dalla cima), 5–8 vertici; il borgo
  // (misure piene lungo il verso × di traverso) si aggancia ai due vertici anteriori della rocca.
  classi: {
    // Raggi più grandi col passo 10 di M7 (corte del signore: decisione dell'utente, rocche più grandi e articolate).
    minore: { rocca: [54, 48], raggio: [18, 27], borgo: [60, 80] },
    casata: { rocca: [68, 60], raggio: [23, 34], borgo: [90, 130] },
    maggiore: { rocca: [84, 74], raggio: [28, 41], borgo: [130, 200] },
  },
  forma: { cala: 5, vertici: [5, 8], ondula: 0.16, borgoOndula: 0.2, portaMin: 10 },
  // Arrivo alla porta del borgo: profilo del terreno fuori dalla porta (m), tratto più ripido su `finestra` m e pendenza
  // media; oltre `ripido` / `media` (tangenti, ~13% e 10%) il lato costa `peso` / `pesoMedia` m di salto per unità.
  // `pesoDirezione`: la stessa ripidezza conta anche nella scelta dell'orientamento del borgo (accanto al lavoro di terra).
  // `scesa`: pendenza della discesa dalla soglia al terreno fuori a `distanze` m; oltre `massima` (quella della rampa
  // della porta, RAMPA_PORTA.pendenza in borgo3d.js e strade.js) il lato costa `peso` per unità.
  portaArrivo: { da: 10, fino: 250, passo: 10, finestra: 40, ripido: 0.13, media: 0.1, peso: 60, pesoMedia: 30, pesoDirezione: 1,
    scesa: { distanze: [15, 24, 35, 45], massima: 0.2, peso: 80 } },
  // Spalto davanti alla porta della rocca: il borgo scende dalla rocca, e una rampa in muratura dal cortile al pendio
  // verrebbe lunga 30–40 m. Il terreno del borgo si rialza in un dosso di terra fino a `sotto` m sotto il cortile, piatto
  // per `piano` m attorno al punto davanti alla porta e poi in discesa a `pendenza`: la rampa resta di pochi metri.
  spalto: { sotto: 0.5, piano: 8, pendenza: 0.16, davanti: 7 },
  // Terrazzi sotto la rocca (decisione dell'utente: castelli diversi l'uno dall'altro): 0–3 fasce su 1–2 lati del
  // retro (non verso il borgo), larghe `largo` m (variano da vertice a vertice), `sotto` m sotto il cortile (secondo
  // il terreno); niente terrazzo dove il versante è troppo ripido (`ripido`: terreno oltre quei m sotto la fascia).
  terrazzi: { quanti: [0, 1, 2, 2, 3], largo: [8, 15], sotto: [2.5, 7], ripido: 9, margine: 40 },
  piani: {
    passo: 6,                     // m tra i campioni del terreno sotto un piano
    // Borgo in pendio (decisione dell'utente: niente terrazze piatte con muri di sostegno né scalinata centrale): il
    // terreno del borgo è quello naturale lisciato, su una griglia di `griglia` m, `liscia` passate di media 3×3.
    griglia: 10, liscia: 3,
    sopraRocca: 3,                // m: la rocca sta almeno così sopra il borgo, lungo il bordo comune
    // Larghezza della scarpata (m): quanto serve per riprendere il salto a 25° (salto / tan 25° ≈ 2,15 m per metro),
    // più un margine; oltre si torna al terreno naturale (TERRAPIENO.ritorno in scena.js).
    scarpa: { perMetro: 2.15, margine: 10, min: 15, max: 120 },
    acqua: { sopra: 6, margine: 300, alzaMax: 12 }, // m: piano più basso sopra il pelo dell'acqua vicino
    raggioCorner: { rocca: 6, borgo: 4 },
  },
};

/** Distanza (km, a celle) dal punto più vicino della Carta almeno `sopra` m più alto di h, entro `raggio` km. */
function distanzaCrinale(carta, px, py, h, sopra, raggio) {
  const { cols, rows, quota } = carta, c0 = Math.floor(px), r0 = Math.floor(py);
  let d = Infinity;
  for (let b = -raggio; b <= raggio; b++) for (let a = -raggio; a <= raggio; a++) {
    const c = c0 + a, r = r0 + b;
    if (c < 0 || r < 0 || c >= cols || r >= rows || quota[r * cols + c] < h + sopra) continue;
    const dx = c + 0.5 - px, dy = r + 0.5 - py, e = Math.sqrt(dx * dx + dy * dy);
    if (e < d) d = e;
  }
  return d;
}

// 8 e 16 direzioni come costanti (niente Math.cos: deve dare lo stesso numero in ogni motore JS).
const R2 = 0.7071067811865476, C1 = 0.9238795325112867, S1 = 0.3826834323650898;
const DIR8 = [[1, 0], [R2, R2], [0, 1], [-R2, R2], [-1, 0], [-R2, -R2], [0, -1], [R2, -R2]];
const DIR16 = [[1, 0], [C1, S1], [R2, R2], [S1, C1], [0, 1], [-S1, C1], [-R2, R2], [-C1, S1],
  [-1, 0], [-C1, -S1], [-R2, -R2], [-S1, -C1], [0, -1], [S1, -C1], [R2, -R2], [C1, -S1]];

/** Distanza (celle, metrica a scacchiera smussata) dalla sorgente più vicina. */
function distanzaCelle(cols, rows, sorgente) {
  const n = cols * rows, d = new Float32Array(n).fill(1e9), D = Math.SQRT2;
  for (let i = 0; i < n; i++) if (sorgente(i)) d[i] = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (y > 0) {
      d[i] = Math.min(d[i], d[i - cols] + 1);
      if (x > 0) d[i] = Math.min(d[i], d[i - cols - 1] + D);
      if (x < cols - 1) d[i] = Math.min(d[i], d[i - cols + 1] + D);
    }
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
    const i = y * cols + x;
    if (x < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (y < rows - 1) {
      d[i] = Math.min(d[i], d[i + cols] + 1);
      if (x < cols - 1) d[i] = Math.min(d[i], d[i + cols + 1] + D);
      if (x > 0) d[i] = Math.min(d[i], d[i + cols - 1] + D);
    }
  }
  return d;
}

/**
 * Segmenti dei tracciati dei fiumi (km) in una griglia di secchi da 2 km, per la distanza esatta da un punto.
 * Ogni segmento sta nei secchi toccati dal suo rettangolo.
 */
function indiceFiumi(carta) {
  const lato = 2, gc = Math.ceil(carta.cols / lato), gr = Math.ceil(carta.rows / lato);
  const secchi = Array.from({ length: gc * gr }, () => []);
  const soglia = carta.sogliaFiume ?? 0;
  for (const f of carta.fiumi || []) {
    if (f[2] < soglia && f[f.length - 2] < soglia) continue;          // torrente: non conta come fiume
    for (let i = 4; i < f.length; i += 4) {
      const ax = f[i - 4], ay = f[i - 3], bx = f[i], by = f[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) / lato)), x1 = Math.min(gc - 1, Math.floor(Math.max(ax, bx) / lato));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) / lato)), y1 = Math.min(gr - 1, Math.floor(Math.max(ay, by) / lato));
      const s = [ax, ay, bx, by, f[i + 2]];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) secchi[y * gc + x].push(s);
    }
  }
  /** Distanza (km) dal fiume più vicino entro `raggio` km (Infinity se nessuno) e suo bacino. */
  return function vicino(px, py, raggio, out = { d: Infinity, bacino: 0 }) {
    out.d = Infinity; out.bacino = 0;
    const x0 = Math.max(0, Math.floor((px - raggio) / lato)), x1 = Math.min(gc - 1, Math.floor((px + raggio) / lato));
    const y0 = Math.max(0, Math.floor((py - raggio) / lato)), y1 = Math.min(gr - 1, Math.floor((py + raggio) / lato));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const [ax, ay, bx, by, b] of secchi[y * gc + x]) {
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + vx * t - px, ey = ay + vy * t - py, d = Math.sqrt(ex * ex + ey * ey);
        if (d < out.d) { out.d = d; out.bacino = b; }
      }
    }
    if (out.d > raggio) out.d = Infinity;
    return out;
  };
}

// ─── Valichi ────────────────────────────────────────────────────────────
export const VALICHI = {
  // m: quota del valico (deciso con l'utente: un valico vero sta tra ~1000 e ~2000 m; più in basso, in collina,
  // una sella tra due valli è semmai un buon posto per una rocca; più in alto si va verso le forcelle).
  quota: [1000, 2500],            // fino a ~2500 m i valichi alti (deciso con l'utente; li affronta chi gioca)
  sopraFondovalle: 300,           // m: il valico sta almeno così sopra il fondovalle di entrambe le valli
  discesa: 30,                    // km: al più tanti passi di flusso per arrivare al fiume della valle
  deviazione: 25,                 // km: fuori dal valico, le due valli si raggiungono solo con un giro più lungo
  cresta: { sopra: 100, raggio: 5 }, // m, km: ai due lati il crinale sale almeno così (è un varco nel crinale)
  asprezza: 0.2,                  // niente pareti dei gruppi montuosi attorno (quelle sono forcelle)
  distanza: 10,                   // km tra due valichi (si tiene il più basso)
  presidio: 0.85,                 // parte dei valichi con una costruzione di sentinella
};

// 8 vicine in ordine attorno alla cella (per contare i cambi di segno: una sella ne ha almeno 4).
const ANELLO_X = [1, 1, 0, -1, -1, -1, 0, 1], ANELLO_Y = [0, 1, 1, 1, 0, -1, -1, -1];
const ANELLO_D = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/**
 * Valichi della Carta: selle del rilievo (celle con due lati più bassi e due più alti) i cui lati bassi
 * scendono, seguendo il flusso, a due fiumi diversi ben più in basso, che si raggiungono tra loro solo con
 * un lungo giro lungo i fiumi (o mai: foci diverse); ai due lati alti il crinale sale davvero. Lontano dalle
 * pareti dei gruppi montuosi. Dei valichi vicini si tiene il più basso.
 * @returns {{ id, x, y (km), quota, valli: [{x, y, quota}, {x, y, quota}], sopra (m), deviazione (km), presidio }[]}
 */
export function trovaValichi(carta, V = VALICHI) {
  const { cols, rows, quota, mare, acque, asprezza, ricevente, bacino, sogliaFiume } = carta;
  if (!ricevente || !bacino) return [];
  const terra = (i) => !mare[i] && (!acque || acque[i] === ACQUA.TERRA);
  const nasce = [];
  const dentro = (x, y) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1;
  /** Primo fiume a valle della cella, seguendo il flusso (−1 se non c'è entro V.discesa passi). */
  const fiumeDi = (i) => {
    for (let k = 0; k < V.discesa && i >= 0; k++) {
      if (bacino[i] >= sogliaFiume) return i;
      i = ricevente[i];
    }
    return -1;
  };
  /** Passo lungo il flusso (km): 1 o √2. */
  const passo = (i, j) => ((i % cols) !== (j % cols) && ((i / cols) | 0) !== ((j / cols) | 0) ? Math.SQRT2 : 1);
  const valle = new Map();                           // per il giro tra le due valli: cella → km dal fiume 1
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x, h = quota[i];
      if (!terra(i) || bacino[i] >= sogliaFiume || h < V.quota[0] || h > V.quota[1]) continue;
      // Sella: almeno 4 cambi di segno attorno (sopra / non sopra).
      let cambi = 0;
      const sopra = new Array(8);
      for (let k = 0; k < 8; k++) sopra[k] = quota[(y + ANELLO_Y[k]) * cols + x + ANELLO_X[k]] > h;
      for (let k = 0; k < 8; k++) if (sopra[k] !== sopra[(k + 1) % 8]) cambi++;
      if (cambi < 4) continue;
      let aspro = false;
      for (let dy = -2; dy <= 2 && !aspro; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dentro(x + dx, y + dy) && asprezza && asprezza[(y + dy) * cols + x + dx] > V.asprezza) { aspro = true; break; }
      }
      if (aspro) continue;
      // Archi bassi e alti: il punto più basso (o più alto) di ciascun arco.
      const archi = [];
      let k0 = 0;
      while (sopra[k0] === sopra[(k0 + 7) % 8]) k0++;      // inizio di un arco (esiste: cambi ≥ 4)
      for (let t = 0; t < 8;) {
        const k = (k0 + t) % 8, tipo = sopra[k];
        let best = k;
        while (t < 8 && sopra[(k0 + t) % 8] === tipo) {
          const kk = (k0 + t) % 8, v = quota[(y + ANELLO_Y[kk]) * cols + x + ANELLO_X[kk]];
          const vb = quota[(y + ANELLO_Y[best]) * cols + x + ANELLO_X[best]];
          if (tipo ? v > vb : v < vb) best = kk;
          t++;
        }
        archi.push({ sopra: tipo, k: best });
      }
      const bassi = archi.filter((a) => !a.sopra), alti = archi.filter((a) => a.sopra);
      if (bassi.length < 2 || alti.length < 2) continue;
      const qv = (a) => quota[(y + ANELLO_Y[a.k]) * cols + x + ANELLO_X[a.k]];
      bassi.sort((a, b) => qv(a) - qv(b));
      // Il crinale sale ai due lati alti (i due più alti), lungo la loro direzione.
      alti.sort((a, b) => qv(b) - qv(a));
      let crinale = true;
      for (const a of alti.slice(0, 2)) {
        let mx = -Infinity;
        for (let d = 1; d <= V.cresta.raggio; d++) {
          const xx = x + ANELLO_X[a.k] * d, yy = y + ANELLO_Y[a.k] * d;
          if (!dentro(xx, yy)) break;
          mx = Math.max(mx, quota[yy * cols + xx]);
        }
        if (mx < h + V.cresta.sopra) { crinale = false; break; }
      }
      if (!crinale) continue;
      // Le due valli: i fiumi a valle dei due lati bassi.
      const la = (y + ANELLO_Y[bassi[0].k]) * cols + x + ANELLO_X[bassi[0].k];
      const lb = (y + ANELLO_Y[bassi[1].k]) * cols + x + ANELLO_X[bassi[1].k];
      const fa = fiumeDi(la), fb = fiumeDi(lb);
      if (fa < 0 || fb < 0 || fa === fb) continue;
      const sopraFondo = Math.min(h - quota[fa], h - quota[fb]);
      if (sopraFondo < V.sopraFondovalle) continue;
      // Giro lungo i fiumi tra le due valli: da fa a valle (km), poi da fb a valle fino a incontrare quel percorso.
      valle.clear();
      let d = 0, j = fa;
      for (let k = 0; j >= 0 && k < 5000; k++) { valle.set(j, d); const r = ricevente[j]; if (r >= 0) d += passo(j, r); j = r; }
      let giro = Infinity;
      d = 0; j = fb;
      for (let k = 0; j >= 0 && k < 5000; k++) {
        if (valle.has(j)) { giro = d + valle.get(j); break; }
        const r = ricevente[j]; if (r >= 0) d += passo(j, r); j = r;
      }
      if (giro < V.deviazione) continue;
      nasce.push({ x: x + 0.5, y: y + 0.5, quota: h, sopra: sopraFondo, deviazione: giro,
        valli: [fa, fb].map((f) => ({ x: (f % cols) + 0.5, y: ((f / cols) | 0) + 0.5, quota: quota[f] })) });
    }
  }
  // Dei valichi vicini il più basso (a parità, quello col giro più lungo).
  nasce.sort((a, b) => a.quota - b.quota || b.deviazione - a.deviazione || a.y - b.y || a.x - b.x);
  const tenuti = [];
  for (const v of nasce) {
    if (tenuti.some((t) => (t.x - v.x) * (t.x - v.x) + (t.y - v.y) * (t.y - v.y) < V.distanza * V.distanza)) continue;
    tenuti.push(v);
  }
  const seme = derivaSeme(carta.seme, 950);
  return tenuti.map((v, id) => ({ id, ...v, presidio: hashUnita(Math.floor(v.x), Math.floor(v.y), seme) < V.presidio }));
}

/** Numero in [0, 1) da due interi e un seme (hash su interi: uguale in ogni motore JS). */
function hashUnita(a, b, seme) {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ seme;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Valico più vicino (km) al punto (km) e la sua quota. */
function valicoVicino(valichi, px, py, out = { d: Infinity, quota: 0 }) {
  out.d = Infinity; out.quota = 0;
  for (const v of valichi) {
    const ex = v.x - px, ey = v.y - py, e = Math.sqrt(ex * ex + ey * ey);
    if (e < out.d) { out.d = e; out.quota = v.quota; }
  }
  return out;
}

/** Rampa lineare da 1 (fino ad a) a 0 (da b in poi). */
const cala = (v, a, b) => (v <= a ? 1 : v >= b ? 0 : (b - v) / (b - a));

/**
 * Giudica un sito attorno alla cella (c, r). null se scartato; altrimenti le misure e il punteggio.
 * Coordinate del mondo in metri.
 */
function affina(carta, c, r, seed, fiumeVicino, valichi, L) {
  const C = carta.cella;
  const q = (x, z) => quotaMondo(carta, x, z, seed);
  // Punto più alto della cella (griglia di 50 m), poi ritocco a 10 m attorno.
  let bx = 0, bz = 0, bh = -Infinity;
  for (let j = 0; j <= 20; j++) for (let i = 0; i <= 20; i++) {
    const x = (c + i / 20) * C, z = (r + j / 20) * C, h = q(x, z);
    if (h > bh) { bh = h; bx = x; bz = z; }
  }
  {
    const x0 = bx, z0 = bz;
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
      const x = x0 + i * 10, z = z0 + j * 10, h = q(x, z);
      if (h > bh) { bh = h; bx = x; bz = z; }
    }
  }
  const S = L.scarti;
  // Castello di valle: crinale (L.crinale.sopra m più alto) entro L.crinale.entro km. Sta su un terrazzo o un dosso
  // del fondovalle, dominato dai versanti: per lui non valgono la cima e la dominanza.
  const crinale = distanzaCrinale(carta, bx / C, bz / C, bh, L.crinale.sopra, L.crinale.entro + 1);
  const valle = crinale <= L.crinale.entro;
  // Una cima vera: niente terreno più alto entro qualche centinaio di metri (altrimenti è un dosso ai piedi di un
  // rilievo più alto, dominato da vicino; con il solo punto più alto della cella capitava spesso).
  if (!valle) for (const raggio of L.cima.raggi) {
    for (const [ux, uz] of DIR16) if (q(bx + ux * raggio, bz + uz * raggio) > bh + L.cima.tolleranza) return null;
  }
  // Rocca: dislivello sul quadrato attorno alla cima.
  const R = L.rocca;
  let rMin = Infinity, rMax = -Infinity;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const h = q(bx + i * R.passo, bz + j * R.passo);
    if (h < rMin) rMin = h;
    if (h > rMax) rMax = h;
  }
  const dRocca = rMax - rMin;
  if (dRocca > S.rocca) return null;
  // Borgo: nella direzione che chiede meno lavoro di terra (più in basso della rocca).
  const B = L.borgo;
  let migliore = null;
  const hb = new Float64Array(B.nl * B.nw);
  for (let k = 0; k < 8; k++) {
    const [ux, uz] = DIR8[k];
    const cx = bx + ux * B.distanza, cz = bz + uz * B.distanza;
    let mn = Infinity, mx = -Infinity, somma = 0;
    for (let a = 0; a < B.nl; a++) {
      const tl = -B.lungo + 2 * B.lungo * a / (B.nl - 1);
      for (let b = 0; b < B.nw; b++) {
        const tw = -B.largo + 2 * B.largo * b / (B.nw - 1);
        const h = q(cx + ux * tl - uz * tw, cz + uz * tl + ux * tw);
        hb[a * B.nw + b] = h;
        if (h < mn) mn = h;
        if (h > mx) mx = h;
        somma += h;
      }
    }
    if (somma / hb.length > bh) continue;                 // il borgo sta sotto la rocca
    // Pendenza media: gradiente sulla griglia (passi lungo e largo).
    const pl = 2 * B.lungo / (B.nl - 1), pw = 2 * B.largo / (B.nw - 1);
    let g = 0, ng = 0;
    for (let a = 0; a + 1 < B.nl; a++) for (let b = 0; b + 1 < B.nw; b++) {
      const h0 = hb[a * B.nw + b];
      const gl = (hb[(a + 1) * B.nw + b] - h0) / pl, gw = (hb[a * B.nw + b + 1] - h0) / pw;
      g += Math.sqrt(gl * gl + gw * gw); ng++;
    }
    const tangente = g / ng;
    const dBorgo = mx - mn;
    if (!migliore || dBorgo < migliore.dBorgo) migliore = { k, dBorgo, tangente, quota: somma / hb.length };
  }
  if (!migliore || migliore.dBorgo > S.borgo) return null;
  // Gradi senza trigonometria: arcotangente approssimata (errore < 0,3°), basta per una soglia.
  const t = migliore.tangente;
  const pendenza = (t / (1 + 0.28 * t * t)) * 57.29577951308232;
  if (pendenza > S.pendenza) return null;
  // Dominanza: quanto la cima sta sopra la media di un anello attorno.
  const D = L.dominanza;
  let anello = 0;
  for (const [ux, uz] of DIR16) anello += q(bx + ux * D.raggio, bz + uz * D.raggio);
  const dominanza = bh - anello / 16;
  if (dominanza < D.minima && !valle) return null;
  // Fiume e valico (km).
  const fv = fiumeVicino(bx / C, bz / C, L.fiume.fino);
  if (fv.d < (valle ? L.fiume.minimoValle : L.fiume.minimo)) return null;   // in una valle stretta il fiume è vicino
  // Il valico conta solo se il sito sta più in basso (allo sbocco della valle, non sopra il passo).
  const vv = valicoVicino(valichi, bx / C, bz / C);
  const dValico = vv.d;
  const bonusFiume = fv.d === Infinity ? 0 : cala(fv.d, L.fiume.buono[1], L.fiume.fino);
  const bonusValico = bh < vv.quota ? cala(dValico, L.valico.buono, L.valico.fino) : 0;
  // sopra i 900 m solo vicino a un valico o sotto un crinale (castello di valle)
  if (bonusValico < 0.5 && !valle && bh > L.quota[1] + 60) return null;
  const P = L.pesi;
  const punteggio = Math.min(dominanza, D.tetto) + P.fiume * bonusFiume + P.valico * bonusValico
    - P.rocca * dRocca - P.borgo * migliore.dBorgo - P.pendenza * pendenza;
  const carattere = valle ? 'valle' : bonusValico >= 0.5 ? 'valico' : bonusFiume >= 0.5 ? 'fiume' : 'altura';
  const [ux, uz] = DIR8[migliore.k];
  return {
    x: bx, z: bz, quota: bh, verso: { x: ux, z: uz }, quotaBorgo: migliore.quota,
    dislivelli: { rocca: dRocca, borgo: migliore.dBorgo }, pendenza, dominanza,
    fiume: { distanza: fv.d, bacino: fv.bacino }, valico: dValico, crinale, carattere, punteggio,
  };
}

// ─── Passo 2: piani della rocca e del borgo (terrapieni) ─────────────────
const _es = { quota: 0, livello: NaN };

/**
 * Campioni del terreno (senza luoghi) sotto un rettangolo: minimo, massimo, media; con `rif`, anche lo scarto
 * medio |h − rif| (il lavoro di terra per un piano a quella quota).
 */
function sottoRettangolo(q, cx, cz, ux, uz, a, b, passo, rif = NaN) {
  const na = Math.max(1, Math.ceil(2 * a / passo)), nb = Math.max(1, Math.ceil(2 * b / passo));
  let mn = Infinity, mx = -Infinity, somma = 0, n = 0, scarto = 0;
  for (let i = 0; i <= na; i++) {
    const lu = -a + 2 * a * i / na;
    for (let j = 0; j <= nb; j++) {
      const lv = -b + 2 * b * j / nb;
      const h = q(cx + ux * lu - uz * lv, cz + uz * lu + ux * lv);
      if (h < mn) mn = h;
      if (h > mx) mx = h;
      somma += h; n++;
      if (rif === rif) scarto += h > rif ? h - rif : rif - h;
    }
  }
  return { min: mn, max: mx, media: somma / n, scarto: scarto / n };
}

/** Salto massimo (m) tra il piano e il terreno appena fuori dal contorno (anello a 4 m). */
function saltoBordo(q, p, passo) {
  const a = p.a + 4, b = p.b + 4;
  const perimetro = 4 * (a + b), n = Math.max(8, Math.ceil(perimetro / passo));
  let mx = 0;
  for (let k = 0; k < n; k++) {
    let t = (k / n) * perimetro, lu, lv;
    if (t < 2 * a) { lu = -a + t; lv = -b; } else if ((t -= 2 * a) < 2 * b) { lu = a; lv = -b + t; }
    else if ((t -= 2 * b) < 2 * a) { lu = a - t; lv = b; } else { t -= 2 * a; lu = -a; lv = b - t; }
    const x = p.cx + p.ux * lu - p.uz * lv, z = p.cz + p.uz * lu + p.ux * lv;
    const d = q(x, z) - quotaPiano(p, x, z);
    const e = d < 0 ? -d : d;
    if (e > mx) mx = e;
  }
  return mx;
}

// ─── Poligoni (coordinate locali u, v; solo operazioni esatte) ───
/** true se (u, v) sta dentro il poligono [[u, v]...] (pari/dispari). */
export function dentroPoligono(P, u, v) {
  let d = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ui, vi] = P[i], [uj, vj] = P[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) d = !d;
  }
  return d;
}
/** Pseudo-angolo in [0, 4) di una direzione (cresce in senso antiorario da +u), senza trigonometria. */
const pseudo = (du, dv) => {
  const s = (du < 0 ? -du : du) + (dv < 0 ? -dv : dv) || 1;
  return dv >= 0 ? 1 - du / s : 3 + du / s;
};
/** Normale esterna (unitaria) del lato a→b di un poligono attorno al punto interno c. */
function normaleEsterna(a, b, c) {
  const du = b[0] - a[0], dv = b[1] - a[1], l = Math.sqrt(du * du + dv * dv) || 1;
  let nu = dv / l, nv = -du / l;
  const mu = (a[0] + b[0]) / 2 - c[0], mv = (a[1] + b[1]) / 2 - c[1];
  if (nu * mu + nv * mv < 0) { nu = -nu; nv = -nv; }
  return [nu, nv];
}

/** Salto massimo (m) tra il piano e il terreno appena fuori dal contorno poligonale (4 m fuori). */
function saltoBordoPoligono(q, p, P, W, centro, passo) {
  let mx = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], [nu, nv] = normaleEsterna(a, b, centro);
    const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    const n = Math.max(1, Math.ceil(l / passo));
    for (let k = 0; k <= n; k++) {
      const u = a[0] + (b[0] - a[0]) * k / n + nu * 4, v = a[1] + (b[1] - a[1]) * k / n + nv * 4;
      const [x, z] = W(u, v), d = q(x, z) - quotaPiano(p, x, z);
      if ((d < 0 ? -d : d) > mx) mx = d < 0 ? -d : d;
    }
  }
  return mx;
}

/**
 * Piani (rocca in piano + borgo in pendio) per un sito, nella direzione `dir` del borgo. null se impossibile: il
 * terrapieno toccherebbe la fascia di un fiume o di un torrente, o servirebbe alzare troppo per stare sopra
 * l'acqua. Le quote vengono dal terreno senza luoghi (rilievo + fiumi).
 *
 * Forme (decisione dell'utente: niente rettangoli tutti uguali, porte sul lato col minor dislivello):
 *   - rocca: poligono di 5–8 vertici attorno alla cima, raggio in ogni direzione fin dove il terreno resta entro
 *     `forma.cala` m dalla cima (tra i raggi della classe), con un po' di variazione per castello;
 *   - borgo: dai due vertici anteriori della rocca (A a sinistra, B a destra del verso) gira dall'altra parte con un
 *     contorno arrotondato e irregolare; si chiude sui lati anteriori della rocca (le mura della rocca sono anche
 *     quelle del borgo lì);
 *   - porta del borgo: sul lato della sua cinta dove il terreno fuori sta più vicino a quello dentro;
 *   - porta della rocca: sul lato anteriore (verso il borgo) col salto minore verso il borgo.
 * Ogni piano ha `poligono` (coordinate del mondo) oltre all'ingombro rettangolare (cx, cz, ux, uz, a, b) che lo
 * contiene, usato per i controlli veloci e per la griglia del pendio.
 */
function pianiInDirezione(carta, sito, classe, dir, seed, L) {
  const Pc = L.piani, K = L.classi[classe], F = L.forma;
  const q = (x, z) => scavaFiumi(carta, x, z, quotaMondo(carta, x, z, seed), _es);
  const [ux, uz] = dir;
  const W = (lu, lv) => [sito.x + ux * lu - uz * lv, sito.z + uz * lu + ux * lv];
  const hq = (lu, lv) => q(...W(lu, lv));
  const semeForma = derivaSeme(carta.seme, 970);
  const caso = (k) => hashUnita(Math.floor(sito.x) + k * 7919, Math.floor(sito.z) - k * 104729, semeForma);

  // ─── Rocca: profilo in 16 direzioni, poi 5–8 vertici ───
  const cima = hq(0, 0);
  const raggi = DIR16.map(([c, sn]) => {
    let r = K.raggio[0];
    for (let t = K.raggio[0]; t <= K.raggio[1]; t += 1.5) {
      if (hq(c * t, sn * t) < cima - F.cala) break;
      r = t;
    }
    return r;
  });
  const lisci = raggi.map((r, k) => 0.25 * raggi[(k + 15) % 16] + 0.5 * r + 0.25 * raggi[(k + 1) % 16]);
  const M = F.vertici[0] + Math.floor(caso(1) * (F.vertici[1] - F.vertici[0] + 1));
  const o = caso(2) * 16;
  const indici = [];
  for (let j = 0; j < M; j++) indici.push(Math.floor(o + j * 16 / M) % 16);
  indici.sort((a, b) => a - b);
  const roccaL = indici.map((k, j) => {
    const r = Math.max(K.raggio[0], lisci[k] * (1 - F.ondula / 2 + F.ondula * caso(10 + j)));
    return [DIR16[k][0] * r, DIR16[k][1] * r];
  });
  // Vertici anteriori: A (a sinistra del verso, v > 0) e B (a destra).
  let iA = 0, iB = 0;
  for (let i = 0; i < M; i++) {
    if (roccaL[i][1] + 0.6 * roccaL[i][0] > roccaL[iA][1] + 0.6 * roccaL[iA][0]) iA = i;
    if (-roccaL[i][1] + 0.6 * roccaL[i][0] > -roccaL[iB][1] + 0.6 * roccaL[iB][0]) iB = i;
  }
  if (iA === iB || roccaL[iA][1] <= 0 || roccaL[iB][1] >= 0) return null;
  const fronte = [];                                         // da B ad A, passando per il davanti (indici crescenti)
  for (let i = iB; ; i = (i + 1) % M) { fronte.push(roccaL[i]); if (i === iA) break; if (fronte.length > M) return null; }
  let hU = -Infinity;
  for (const [u] of roccaL) if (u > hU) hU = u;

  // ─── Borgo: dai vertici A e B gira dall'altra parte ───
  const la = K.borgo[0] / 2, lb = K.borgo[1] / 2;
  const Cb = [hU + la * 0.85, 0];
  const A = roccaL[iA], B = roccaL[iB];
  const dA = [A[0] - Cb[0], A[1] - Cb[1]], dB = [B[0] - Cb[0], B[1] - Cb[1]];
  const croce = (a, b) => a[0] * b[1] - a[1] * b[0];
  const lontani = [];
  DIR16.forEach(([c, sn], k) => {
    const d = [c, sn];
    // Esclusa la fetta (< 180°) che va da A a B passando dietro (verso la rocca).
    if (croce(dA, d) >= 0 && croce(d, dB) >= 0) return;
    // Né troppo vicino alle direzioni di A e B (cos 25°): eviterebbe denti nel contorno dove si attacca alla rocca.
    const lA = Math.sqrt(dA[0] * dA[0] + dA[1] * dA[1]), lB = Math.sqrt(dB[0] * dB[0] + dB[1] * dB[1]);
    if ((c * dA[0] + sn * dA[1]) / lA > 0.906 || (c * dB[0] + sn * dB[1]) / lB > 0.906) return;
    const r = 1 / Math.sqrt(Math.sqrt((c / la) ** 4 + (sn / lb) ** 4)) * (1 - F.borgoOndula / 2 + F.borgoOndula * caso(40 + k));
    let ps = pseudo(c, sn);
    if (ps > 2) ps -= 4;
    lontani.push({ ps, p: [Cb[0] + c * r, Cb[1] + sn * r] });
  });
  lontani.sort((a, b) => b.ps - a.ps);                       // da A (sinistra) a B (destra)
  const catena = [A, ...lontani.map((l) => l.p), B];
  const borgoL = [...catena, ...fronte.slice(1, -1).reverse()];
  if (catena.length < 4) return null;

  // Ingombri rettangolari (frame u, v) che contengono i poligoni.
  let ra = 0, rb = 0;
  for (const [u, v] of roccaL) { ra = Math.max(ra, u < 0 ? -u : u); rb = Math.max(rb, v < 0 ? -v : v); }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of borgoL) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const [bcx, bcz] = W((u0 + u1) / 2, (v0 + v1) / 2);
  const mondo = (PL) => PL.map(([u, v]) => W(u, v));
  const rocca = { tipo: 'rocca', cx: sito.x, cz: sito.z, ux, uz, a: ra, b: rb, r: 0, q: 0, s: 0, poligono: mondo(roccaL) };
  const borgo = { tipo: 'borgo', cx: bcx, cz: bcz, ux, uz, a: (u1 - u0) / 2, b: (v1 - v0) / 2, r: 0, q: 0, s: 0,
    poligono: mondo(borgoL), nCatena: catena.length, griglia: null };

  // Quota della rocca: (massimo + media)/2 del terreno dentro il poligono.
  {
    let mx = -Infinity, somma = 0, n = 0;
    for (let lu = -ra; lu <= ra; lu += Pc.passo) for (let lv = -rb; lv <= rb; lv += Pc.passo) {
      if (!dentroPoligono(roccaL, lu, lv)) continue;
      const h = hq(lu, lv);
      mx = Math.max(mx, h); somma += h; n++;
    }
    if (!n) return null;
    rocca.q = (mx + somma / n) / 2;
  }
  // Borgo: griglia del pendio naturale lisciato sull'ingombro.
  {
    const nu = Math.max(3, Math.round(2 * borgo.a / Pc.griglia) + 1), nv = Math.max(3, Math.round(2 * borgo.b / Pc.griglia) + 1);
    let h = new Array(nu * nv);
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const lu = -borgo.a + 2 * borgo.a * i / (nu - 1), lv = -borgo.b + 2 * borgo.b * j / (nv - 1);
        h[j * nu + i] = q(bcx + ux * lu - uz * lv, bcz + uz * lu + ux * lv);
      }
    }
    for (let it = 0; it < Pc.liscia; it++) {
      const t = h.slice();
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          let somma = 0, n = 0;
          for (let b2 = -1; b2 <= 1; b2++) for (let a2 = -1; a2 <= 1; a2++) {
            const ii = i + a2, jj = j + b2;
            if (ii < 0 || jj < 0 || ii >= nu || jj >= nv) continue;
            somma += t[jj * nu + ii]; n++;
          }
          h[j * nu + i] = somma / n;
        }
      }
    }
    borgo.griglia = { nu, nv, h };
    borgo.q = h.reduce((s2, v) => s2 + v, 0) / h.length;
  }
  if (borgo.q > rocca.q) return null;                      // il borgo deve stare sotto la rocca
  // La rocca almeno Pc.sopraRocca m sopra il borgo lungo i lati anteriori (in comune).
  {
    let mx = -Infinity;
    for (let i = 0; i + 1 < fronte.length; i++) {
      for (let t = 0; t <= 1.0001; t += 0.25) {
        const u = fronte[i][0] + (fronte[i + 1][0] - fronte[i][0]) * t, v = fronte[i][1] + (fronte[i + 1][1] - fronte[i][1]) * t;
        const [x, z] = W(u, v);
        mx = Math.max(mx, quotaPiano(borgo, x, z));
      }
    }
    if (rocca.q < mx + Pc.sopraRocca) rocca.q = mx + Pc.sopraRocca;
  }
  const piani = [rocca, borgo];
  // Scarpate: larghe in proporzione al salto sul bordo.
  let salto = 0;
  for (const [p, PL, c] of [[rocca, roccaL, [0, 0]], [borgo, borgoL, Cb]]) {
    const sp = saltoBordoPoligono(q, p, PL, W, c, Pc.passo);
    if (sp > salto) salto = sp;
    const w = Pc.scarpa.perMetro * sp + Pc.scarpa.margine;
    p.s = w < Pc.scarpa.min ? Pc.scarpa.min : w > Pc.scarpa.max ? Pc.scarpa.max : w;
  }
  const pendenza = 25;                                     // per costruzione (scena.js, TERRAPIENO), sul terrapieno
  // Fiumi: niente piano né scarpata nella fascia di un fiume o di un torrente; intanto il pelo dell'acqua più alto
  // nei dintorni (sull'ingombro rettangolare, che contiene il poligono).
  let pelo = -Infinity;
  const passoAcqua = 12;
  for (const p of piani) {
    const AA = p.a + p.s + Pc.acqua.margine, BB = p.b + p.s + Pc.acqua.margine;
    const na = Math.ceil(2 * AA / (2 * passoAcqua)), nb = Math.ceil(2 * BB / (2 * passoAcqua));
    for (let i = 0; i <= na; i++) {
      for (let j = 0; j <= nb; j++) {
        const lu = -AA + 2 * AA * i / na, lv = -BB + 2 * BB * j / nb;
        const x = p.cx + p.ux * lu - p.uz * lv, z = p.cz + p.uz * lu + p.ux * lv;
        const h0 = quotaMondo(carta, x, z, seed), h = scavaFiumi(carta, x, z, h0, _es);
        if (!Number.isNaN(_es.livello) && _es.livello > pelo) pelo = _es.livello;
        const dentro = (lu < 0 ? -lu : lu) <= p.a + p.s && (lv < 0 ? -lv : lv) <= p.b + p.s;
        if (dentro && (h - h0 > 0.01 || h0 - h > 0.01 || !Number.isNaN(_es.livello))) return null;
      }
    }
  }
  // Sopra l'acqua: il punto più basso almeno Pc.acqua.sopra m sopra il pelo più alto vicino.
  let alza = 0;
  if (pelo > -Infinity) {
    const G = borgo.griglia, basso = Math.min(rocca.q, ...G.h);
    alza = pelo + Pc.acqua.sopra - basso;
    if (alza > Pc.acqua.alzaMax) return null;
    if (alza > 0) {
      for (let k = 0; k < G.h.length; k++) if (G.h[k] < pelo + Pc.acqua.sopra) G.h[k] = pelo + Pc.acqua.sopra;
      if (rocca.q < pelo + Pc.acqua.sopra) rocca.q = pelo + Pc.acqua.sopra;
    }
  }
  // Lavoro di terra: scarto medio |terreno − piano| dentro i poligoni.
  let lavoro = 0, nl = 0;
  for (const [p, PL] of [[rocca, roccaL], [borgo, borgoL]]) {
    for (let lu = -Math.max(ra, 2 * borgo.a + hU); lu <= hU + 2 * la + 10; lu += 2 * Pc.passo) {
      for (let lv = -Math.max(rb, borgo.b + 10); lv <= Math.max(rb, borgo.b + 10); lv += 2 * Pc.passo) {
        if (!dentroPoligono(PL, lu, lv)) continue;
        const [x, z] = W(lu, lv);
        lavoro += Math.abs(q(x, z) - quotaPiano(p, x, z)); nl++;
      }
    }
  }
  // ─── Porte ───
  // Borgo: sul lato della cinta (non i due attaccati alla rocca) col minor salto tra dentro e fuori e con l'arrivo da
  // fuori più dolce (richiesta dell'utente, seme 395728: la porta dava su un versante a 30° e non si saliva); lontano
  // dalla rocca, su un lato abbastanza lungo per la torre-porta.
  const P = L.portaArrivo;
  const arrivo = (m, nu, nv) => {
    // Profilo del terreno lungo la normale, da `da` a `fino` m fuori dalla porta: pendenza media e tratto più ripido.
    const hs = [];
    for (let d = P.da; d <= P.fino; d += P.passo) hs.push(hq(m[0] + nu * d, m[1] + nv * d));
    let ripido = 0;
    const k = Math.round(P.finestra / P.passo);
    for (let i = 0; i + k < hs.length; i++) ripido = Math.max(ripido, Math.abs(hs[i + k] - hs[i]) / P.finestra);
    const media = Math.abs(hs[hs.length - 1] - hs[0]) / (P.fino - P.da);
    return { ripido, media };
  };
  let porta = null;
  for (let i = 1; i + 2 < catena.length; i++) {
    const a = catena[i], b = catena[i + 1], l = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    if (l < F.portaMin) continue;
    const [nu, nv] = normaleEsterna(a, b, Cb), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [xi, zi] = W(m[0] - nu * 6, m[1] - nv * 6), dentroQ = quotaPiano(borgo, xi, zi);
    const fuoriQ = hq(m[0] + nu * 10, m[1] + nv * 10);
    const vicinoRocca = Math.sqrt(m[0] * m[0] + m[1] * m[1]) < hU + la * 0.6 ? 6 : 0;
    const ar = arrivo(m, nu, nv);
    // Discesa dalla soglia (piano del borgo, spesso rialzato dal terrapieno) al terreno fuori: la pendenza che servirebbe
    // a una rampa per arrivarci entro `scesa.fino` m (sessione M6: soglie 8–12 m sopra il terreno a 24 m, rampe al 40–54%).
    let scesa = 0;
    for (const d of P.scesa.distanze) scesa = Math.max(scesa, (dentroQ - hq(m[0] + nu * d, m[1] + nv * d)) / d);
    const ripidezza = P.peso * Math.max(0, ar.ripido - P.ripido) + P.pesoMedia * Math.max(0, ar.media - P.media)
      + P.scesa.peso * Math.max(0, scesa - P.scesa.massima);
    const costo = Math.abs(dentroQ - fuoriQ) + vicinoRocca + ripidezza;
    if (!porta || costo < porta.costo) porta = { costo, ripidezza, i, m, n: [nu, nv], salto: Math.abs(dentroQ - fuoriQ), arrivo: ar };
  }
  if (!porta) return null;
  // Rocca: sul lato anteriore col salto minore verso il borgo, con spazio davanti (i lati agli estremi A e B danno
  // sull'angolo stretto tra la rocca e la cinta del borgo: lì la rampa e la via restano schiacciate contro il muro).
  let portaR = null;
  for (let i = 0; i + 1 < fronte.length; i++) {
    const a = fronte[i], b = fronte[i + 1], l = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    if (l < F.portaMin) continue;
    const [nu, nv] = normaleEsterna(a, b, [0, 0]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [x, z] = W(m[0] + nu * 8, m[1] + nv * 8), salto2 = rocca.q - quotaPiano(borgo, x, z);
    let stretto = 0;
    for (const d of [10, 18, 26]) for (const e of [-8, 0, 8]) {
      const tu = (b[0] - a[0]) / l, tv = (b[1] - a[1]) / l;
      if (!dentroPoligono(borgoL, m[0] + nu * d + tu * e, m[1] + nv * d + tv * e)) stretto++;
    }
    const costo = salto2 + stretto * 1.5 + (i === 0 || i + 2 === fronte.length ? 1 : 0);
    if (!portaR || costo < portaR.costo) portaR = { costo, salto: salto2, m, n: [nu, nv], a, b, l };
  }
  if (!portaR) return null;
  {
    const S = L.spalto, [gx, gz] = W(portaR.m[0] + portaR.n[0] * S.davanti, portaR.m[1] + portaR.n[1] * S.davanti);
    const G = borgo.griglia;
    for (let j = 0; j < G.nv; j++) {
      for (let i = 0; i < G.nu; i++) {
        const lu = -borgo.a + 2 * borgo.a * i / (G.nu - 1), lv = -borgo.b + 2 * borgo.b * j / (G.nv - 1);
        const x = bcx + ux * lu - uz * lv, z = bcz + uz * lu + ux * lv;
        const d = Math.sqrt((x - gx) * (x - gx) + (z - gz) * (z - gz));
        const t = rocca.q - S.sotto - S.pendenza * (d > S.piano ? d - S.piano : 0);
        if (G.h[j * G.nu + i] < t) G.h[j * G.nu + i] = t;
      }
    }
    portaR.salto = rocca.q - quotaPiano(borgo, gx, gz);
  }
  // ─── Terrazzi sotto la rocca, sui lati del retro ───
  {
    const T = L.terrazzi, M2 = roccaL.length;
    const retro = [];                                        // lati da A a B girando dietro (i → i+1)
    for (let i = iA; i !== iB; i = (i + 1) % M2) retro.push(i);
    const quanti = T.quanti[Math.floor(caso(60) * T.quanti.length)];
    const usati = new Set();
    for (let t = 0; t < quanti && retro.length; t++) {
      const lung = 1 + (caso(61 + t) < 0.5 ? 1 : 0);
      const k0 = Math.floor(caso(62 + t) * retro.length);
      const lati = [];
      for (let k = k0; k < retro.length && lati.length < lung; k++) if (!usati.has(retro[k])) lati.push(retro[k]); else break;
      if (!lati.length) continue;
      // Vertici della fascia: quelli della rocca e, fuori, spostati lungo la bisettrice esterna.
      const V = [...lati.map((i) => roccaL[i]), roccaL[(lati[lati.length - 1] + 1) % M2]];
      const idx = [...lati, (lati[lati.length - 1] + 1) % M2];
      const O = idx.map((i, k) => {
        const p0 = roccaL[(i + M2 - 1) % M2], p1 = roccaL[i], p2 = roccaL[(i + 1) % M2];
        const [n1u, n1v] = normaleEsterna(p0, p1, [0, 0]), [n2u, n2v] = normaleEsterna(p1, p2, [0, 0]);
        let bu = n1u + n2u, bv = n1v + n2v;
        const c = Math.sqrt(bu * bu + bv * bv) / 2 || 1;
        bu /= 2 * c; bv /= 2 * c;
        const w = (T.largo[0] + (T.largo[1] - T.largo[0]) * caso(70 + t * 9 + k)) / Math.max(c, 0.6);
        return [p1[0] + bu * w, p1[1] + bv * w];
      });
      const PL = [...V, ...O.reverse()];
      // Dentro il borgo no (la sua cinta parte dai vertici A e B).
      let tocca = false;
      for (const [u, v] of PL) if (dentroPoligono(borgoL, u, v)) tocca = true;
      for (let k = 0; k + 1 < PL.length && !tocca; k++) {
        const m = [(PL[k][0] + PL[k + 1][0]) / 2, (PL[k][1] + PL[k + 1][1]) / 2];
        if (dentroPoligono(borgoL, m[0], m[1])) tocca = true;
      }
      if (tocca) continue;
      // Quota: quella media del terreno nella fascia, tra `sotto` m sotto il cortile.
      let tu0 = Infinity, tu1 = -Infinity, tv0 = Infinity, tv1 = -Infinity;
      for (const [u, v] of PL) { tu0 = Math.min(tu0, u); tu1 = Math.max(tu1, u); tv0 = Math.min(tv0, v); tv1 = Math.max(tv1, v); }
      let somma = 0, n = 0, basso = Infinity;
      for (let lu = tu0; lu <= tu1; lu += 3) for (let lv = tv0; lv <= tv1; lv += 3) {
        if (!dentroPoligono(PL, lu, lv)) continue;
        const h = hq(lu, lv);
        somma += h; n++; if (h < basso) basso = h;
      }
      if (n < 4) continue;
      const qt = Math.min(rocca.q - T.sotto[0], Math.max(rocca.q - T.sotto[1], somma / n));
      if (basso < qt - T.ripido) continue;
      if (pelo > -Infinity && qt < pelo + Pc.acqua.sopra) continue;
      const [tcx, tcz] = W((tu0 + tu1) / 2, (tv0 + tv1) / 2);
      const terr = { tipo: 'terrazzo', cx: tcx, cz: tcz, ux, uz, a: (tu1 - tu0) / 2, b: (tv1 - tv0) / 2, r: 0, q: qt, s: 0,
        poligono: mondo(PL), nRocca: V.length };
      const sp = saltoBordoPoligono(q, terr, PL, W, [0, 0], Pc.passo);
      const w2 = Pc.scarpa.perMetro * sp + Pc.scarpa.margine;
      terr.s = w2 < Pc.scarpa.min ? Pc.scarpa.min : w2 > Pc.scarpa.max ? Pc.scarpa.max : w2;
      // Niente fiumi né torrenti sotto il terrazzo e la sua scarpata.
      let acqua = false;
      for (let lu = tu0 - terr.s; lu <= tu1 + terr.s && !acqua; lu += 12) {
        for (let lv = tv0 - terr.s; lv <= tv1 + terr.s; lv += 12) {
          const [x, z] = W(lu, lv), h0 = quotaMondo(carta, x, z, seed), h = scavaFiumi(carta, x, z, h0, _es);
          if (h - h0 > 0.01 || h0 - h > 0.01 || !Number.isNaN(_es.livello)) { acqua = true; break; }
        }
      }
      if (acqua) continue;
      for (const i of lati) usati.add(i);
      piani.push(terr);
    }
  }
  const versoMondo = (nu, nv) => [ux * nu - uz * nv, uz * nu + ux * nv];
  // ─── Rampa lungo il muro, se la discesa dritta dalla soglia al terreno è troppo ripida ───
  let rampaMuro = null;
  {
    const RM = RAMPA_PORTA.muro, SPOR = RAMPA_PORTA.sporgenza, [nu, nv] = porta.n, m = porta.m;
    const [xi, zi] = W(m[0] - nu * 6, m[1] - nv * 6), qS = quotaPiano(borgo, xi, zi);
    let dritta = 0;
    for (const d of [15, 24, 35, 45]) dritta = Math.max(dritta, (qS - hq(m[0] + nu * (SPOR + d), m[1] + nv * (SPOR + d))) / d);
    if (dritta > RM.soglia) {
      const i = porta.i, w = RM.larghezza, e0 = RM.spalla, NB = borgoL.length;
      const dc = SPOR + RM.staccoMuro + w / 2;
      const lontano = (u, v, PL) => {
        let d2 = Infinity;
        for (let k = 0; k < PL.length; k++) {
          const p = PL[k], q2 = PL[(k + 1) % PL.length], du = q2[0] - p[0], dv = q2[1] - p[1], ll = du * du + dv * dv || 1;
          const tt = Math.max(0, Math.min(1, ((u - p[0]) * du + (v - p[1]) * dv) / ll));
          d2 = Math.min(d2, (u - p[0] - du * tt) ** 2 + (v - p[1] - dv * tt) ** 2);
        }
        return !dentroPoligono(PL, u, v) && Math.sqrt(d2) >= RM.margine;
      };
      // Terreno finale (coi terrapieni di rocca, borgo e terrazzi) dove arriva la rampa: lì le scarpate lo rialzano.
      const pianiFissi = piani.slice();
      const hFin = (u, v) => { const [x, z] = W(u, v), h = hq(u, v), r = spianaPiani(pianiFissi, x, z, h); return r === null ? h : r; };
      const nLato = (k) => normaleEsterna(borgoL[k], borgoL[(k + 1) % NB], Cb);
      // Percorso a `dc` m dalle mura, dalla porta nel verso sg, voltando agli spigoli della cinta (giro attorno al colle).
      const percorso = (sg) => {
        const [tu0, tv0] = [(borgoL[(i + 1) % NB][0] - borgoL[i][0]), (borgoL[(i + 1) % NB][1] - borgoL[i][1])];
        const l0 = Math.hypot(tu0, tv0), t = [tu0 / l0 * sg, tv0 / l0 * sg];
        const pts = [[m[0] + nu * dc + t[0] * e0, m[1] + nv * dc + t[1] * e0]];
        let k = i;
        for (let n = 0; n < NB - 2; n++) {
          const kn = (k + sg + NB) % NB, V = borgoL[sg > 0 ? (k + 1) % NB : k];
          const n1 = nLato(k), n2 = nLato(kn), dot = n1[0] * n2[0] + n1[1] * n2[1];
          if (dot < 0.2) break;                              // spigolo troppo acuto: lì la rampa non gira
          const f = dc / (1 + dot);
          pts.push([V[0] + (n1[0] + n2[0]) * f, V[1] + (n1[1] + n2[1]) * f]);
          k = kn;
        }
        return pts;
      };
      let migliore = null;
      for (const sg of [1, -1]) {
        const pts = percorso(sg), cammino = [pts[0]];
        let L = 0, q = qS, tocca = false, fermo = false;
        for (let j = 0; j + 1 < pts.length && !fermo; j++) {
          const A = pts[j], B = pts[j + 1], lAB = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (lAB < 0.5) continue;
          const tx = (B[0] - A[0]) / lAB, tz = (B[1] - A[1]) / lAB;
          for (let s2 = 1; s2 <= lAB; s2++) {
            const u = A[0] + tx * s2, v = A[1] + tz * s2;
            const fu = -tz * (w / 2), fv = tx * (w / 2);
            if (!lontano(u + fu, v + fv, borgoL) || !lontano(u - fu, v - fv, borgoL) || !lontano(u, v, roccaL) || L + 1 > RM.massima) { fermo = true; break; }
            L++; q = qS - RM.pendenza * L;
            if (L >= RM.minima && q <= hFin(u, v) + 0.3) { cammino.push([u, v]); tocca = true; fermo = true; break; }
            if (s2 + 1 > lAB) cammino.push([u, v]);
          }
        }
        if (cammino.length < 2) continue;
        const fine = cammino[cammino.length - 1];
        const scarto = Math.abs(q - hFin(...fine));
        const c = { sg, cammino, L, q1: q, scarto, tocca };
        if (L >= RM.minima && (!migliore || scarto < migliore.scarto - 0.5 || (Math.abs(scarto - migliore.scarto) <= 0.5 && L < migliore.L))) migliore = c;
      }
      if (migliore) {
        const [pnxw, pnzw] = versoMondo(nu, nv);
        const pd = (RM.pianerottolo - 1) / 2, [pcx, pcz] = W(m[0] + nu * pd, m[1] + nv * pd);
        piani.push({ tipo: 'rampa', parte: 'pianerottolo', cx: pcx, cz: pcz, ux: pnxw, uz: pnzw,
          a: (RM.pianerottolo + 1) / 2, b: e0 + 0.5, r: 0, q: qS, s: Pc.scarpa.min });
        const C = migliore.cammino, tratti = [];
        let s0 = 0;
        for (let j = 0; j + 1 < C.length; j++) {
          const A = C[j], B = C[j + 1], lAB = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (lAB < 0.5) continue;
          const q0 = qS - RM.pendenza * s0, q1 = qS - RM.pendenza * (s0 + lAB);
          const [dxw, dzw] = versoMondo((B[0] - A[0]) / lAB, (B[1] - A[1]) / lAB), [cx2, cz2] = W((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
          piani.push({ tipo: 'rampa', parte: 'tratto', cx: cx2, cz: cz2, ux: dxw, uz: dzw, a: lAB / 2, b: w / 2 + 0.5,
            r: 0, q: (q0 + q1) / 2, s: Pc.scarpa.min, griglia: { nu: 2, nv: 2, h: [q0, q1, q0, q1] } });
          if (j > 0) {                                      // ripiano allo spigolo: raccorda due tratti
            const [ax2, az2] = W(...A);
            piani.push({ tipo: 'rampa', parte: 'angolo', cx: ax2, cz: az2, ux: dxw, uz: dzw, a: w / 2 + 0.5, b: w / 2 + 0.5,
              r: 0, q: q0, s: Pc.scarpa.min });
          }
          tratti.push({ L: Math.round(lAB), q0, q1 });
          s0 += lAB;
        }
        const B = C[C.length - 1], A = C[C.length - 2], lAB = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
        const [axw, azw] = W(...B), [dxw, dzw] = versoMondo((B[0] - A[0]) / lAB, (B[1] - A[1]) / lAB);
        rampaMuro = { lato: migliore.sg, tratti, lunghezza: migliore.L, spalla: e0, scarto: +migliore.scarto.toFixed(1),
          percorso: C.map((p) => W(...p)), arrivo: { x: axw, z: azw, quota: migliore.q1, nx: dxw, nz: dzw } };
      }
    }
  }
  const [pnx, pnz] = versoMondo(...porta.n), [rnx, rnz] = versoMondo(...portaR.n);
  const [rex, rez] = versoMondo((portaR.b[0] - portaR.a[0]) / portaR.l, (portaR.b[1] - portaR.a[1]) / portaR.l);
  const [px, pz] = W(...porta.m), [rx, rz] = W(...portaR.m);
  return {
    piani, salto, pendenza, pelo: pelo > -Infinity ? pelo : null, alza: alza > 0 ? alza : 0, lavoro: nl ? lavoro / nl : 0,
    ripidezzaArrivo: porta.ripidezza,
    porta: { x: px, z: pz, nx: pnx, nz: pnz, salto: porta.salto,
      ...(rampaMuro ? { rampaMuro, arrivo: rampaMuro.arrivo } : {}) },
    portaRocca: { x: rx, z: rz, nx: rnx, nz: rnz, ex: rex, ez: rez, lato: portaR.l, salto: portaR.salto },
  };
}

/**
 * Piani della rocca e del borgo per un sito: la direzione del borgo (tra le 8) col minor lavoro di terra che non
 * tocca fiumi e sta sopra l'acqua; prima prova quella scelta dall'affinamento. null se nessuna va bene.
 * Aggiunge al sito: piani, verso, porta (fuori dalla porta del borgo), raggioPiani, terrapieno (misure).
 */
function pianifica(carta, sito, classe, L) {
  const seed = derivaSeme(carta.seme, 101);
  raffinaZona(carta, sito.x, sito.z, 1500);                 // percorsi dei fiumi come nelle Scene
  let migliore = null, dirMigliore = null;
  for (const dir of DIR8) {
    const r = pianiInDirezione(carta, sito, classe, dir, seed, L);
    if (!r) continue;
    const preferita = dir[0] === sito.verso.x && dir[1] === sito.verso.z;
    // Anche l'arrivo alla porta del borgo: un orientamento con la porta su un versante ripido costa di più.
    const costo = r.lavoro * (preferita ? 0.8 : 1) + L.portaArrivo.pesoDirezione * r.ripidezzaArrivo;
    if (!migliore || costo < migliore.costo) { migliore = { ...r, costo }; dirMigliore = dir; }
  }
  if (!migliore) return null;
  const [ux, uz] = dirMigliore;
  let raggio = 0;
  for (const p of migliore.piani) {
    const ex = p.cx - sito.x, ez = p.cz - sito.z;
    const e = Math.sqrt(ex * ex + ez * ez) + Math.sqrt(p.a * p.a + p.b * p.b) + p.s;
    if (e > raggio) raggio = e;
  }
  return {
    piani: migliore.piani, verso: { x: ux, z: uz }, raggioPiani: raggio + 1,
    porta: migliore.porta, portaRocca: migliore.portaRocca,
    terrapieno: { salto: migliore.salto, pendenza: migliore.pendenza, pelo: migliore.pelo, alza: migliore.alza,
      lavoro: migliore.lavoro },
  };
}

/**
 * Siti delle rocche con borgo per una Carta (generaCarta). Deterministico: stesso seme, stessi siti.
 * @returns {{ luoghi: object[], candidati: object[], info: object }}
 *   luoghi: [{ id, tipo:'rocca', classe, partenza, x, z (m), quota, verso, ... }]
 *   candidati: siti validi non scelti (per la vista di sviluppo: x, z, punteggio, carattere)
 */
export function scegliLuoghi(carta, L = LUOGHI) {
  const t0 = performance.now();
  const { cols, rows, quota, mare, acque, bioma, asprezza } = carta;
  const n = cols * rows;
  const seed = derivaSeme(carta.seme, 101);              // lo stesso seme del dettaglio delle Scene
  const vicino = indiceFiumi(carta);
  const dLago = distanzaCelle(cols, rows, (i) => acque && (acque[i] === ACQUA.LAGO || acque[i] === ACQUA.LAGO_COSTIERO));
  const ammesso = new Uint8Array(32);
  for (const b of L.biomi) ammesso[b] = 1;
  const valichi = carta.valichi ?? trovaValichi(carta);
  const vv = { d: 0, quota: 0 };

  // ─── Stadio 1: stima sulle celle ───
  const stime = [];
  const fv = { d: 0, bacino: 0 };
  const anello = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]];
  for (let r = L.bordo; r < rows - L.bordo; r++) {
    for (let c = L.bordo; c < cols - L.bordo; c++) {
      const i = r * cols + c, h = quota[i];
      if (mare[i] || (acque && acque[i] !== ACQUA.TERRA) || h < L.quota[0] || h > L.quotaValico) continue;
      valicoVicino(valichi, c + 0.5, r + 0.5, vv);
      const bv = h < vv.quota ? cala(vv.d, L.valico.buono, L.valico.fino) : 0;
      // Castello di valle: crinale (800 m più alto) entro L.crinale.entro km. Anche sopra i 900 m, come i valichi.
      const dc = distanzaCrinale(carta, c + 0.5, r + 0.5, h, L.crinale.sopra, L.crinale.entro);
      const bc = dc <= L.crinale.entro ? 1 : 0;
      if (h > L.quota[1] && bv < 0.5 && !bc) continue;
      if (bioma && !ammesso[bioma[i]]) continue;
      if (asprezza && asprezza[i] > L.asprezza) continue;
      if (dLago[i] < L.lago) continue;
      let m = 0;
      for (const [dx, dy] of anello) m += quota[(r + dy) * cols + c + dx];
      const dom = h - m / anello.length;
      if (dom <= 0 && !bc) continue;                       // nemmeno un rialzo alla scala della Carta (la valle non lo chiede)
      vicino(c + 0.5, r + 0.5, L.fiume.fino, fv);
      if (fv.d < 0.5) continue;                            // la cella è sul fiume
      const bf = fv.d === Infinity ? 0 : cala(fv.d, L.fiume.buono[1], L.fiume.fino);
      stime.push({ c, r, bv, bc, s: Math.min(dom, L.dominanza.tetto) + L.pesi.fiume * bf + L.pesi.valico * bv });
    }
  }
  // Le migliori stime per zona (anelli attorno al centro), così ogni scalino della scelta ha candidati.
  const cx0 = cols / 2, cy0 = rows / 2;
  const zonaDi = (c, r) => {
    const dx = c + 0.5 - cx0, dy = r + 0.5 - cy0, d = Math.sqrt(dx * dx + dy * dy);
    for (let z = 0; z < L.zona.length; z++) if (d <= L.zona[z]) return z;
    return L.zona.length;
  };
  stime.sort((a, b) => b.s - a.s || a.r - b.r || a.c - b.c);
  const perZona = Math.ceil(L.candidati / L.zona.length);   // (le zone esterne contengono le interne)
  const contaZona = new Array(L.zona.length + 1).fill(0), contaValico = new Array(L.zona.length + 1).fill(0);
  const contaValle = new Array(L.zona.length + 1).fill(0);
  const scelte = [];
  const tessere = new Map();
  for (const st of stime) {
    const z = zonaDi(st.c, st.r);
    if (z >= L.zona.length) continue;
    const kt = Math.floor(st.c / L.tessera.km) * 1000 + Math.floor(st.r / L.tessera.km);
    const nt = tessere.get(kt) ?? 0;
    if (nt >= L.tessera.quanti) continue;
    tessere.set(kt, nt + 1);
    // Posti riservati ai siti vicino a un valico: con la sola stima entrerebbero di rado.
    if (st.bv >= 0.5 && contaValico[z] < L.riservati) { contaValico[z]++; scelte.push(st); continue; }
    if (st.bc && contaValle[z] < L.riservati) { contaValle[z]++; scelte.push(st); continue; }
    if (contaZona[z] >= perZona) continue;
    contaZona[z]++;
    scelte.push(st);
  }

  // ─── Stadio 2: affinamento ───
  const validi = [];
  for (const st of scelte) {
    const sito = affina(carta, st.c, st.r, seed, vicino, valichi, L);
    if (sito) { sito.zona = zonaDi(sito.x / carta.cella, sito.z / carta.cella); validi.push(sito); }
  }
  validi.sort((a, b) => b.punteggio - a.punteggio || a.z - b.z || a.x - b.x);

  // ─── Scelta: siti diversi e distanti (L.numero), dal centro verso fuori ───
  // Ripetuta finché ogni sito scelto ha i suoi piani (passo 2): un sito il cui terrapieno toccherebbe un fiume
  // o starebbe troppo basso sull'acqua si scarta e si sceglie di nuovo.
  const distanzaKm = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) / carta.cella;
  const esclusi = new Set(), piani = new Map();
  let luoghi = [], scalino = null, giri = 0;
  for (; giri < 40; giri++) {
    const pool = validi.filter((s) => !esclusi.has(s));
    ({ luoghi, scalino } = scegli(pool));
    // Classi: la partenza (il primo, di valle se c'è) è un castello di casata; degli altri, per punteggio, le sedi
    // maggiori (almeno una se i siti sono tre o più), poi i castelli di casata, il resto rocche minori.
    const altri = luoghi.slice(1).sort((a, b) => b.punteggio - a.punteggio);
    const nM = altri.length >= 2 ? Math.max(1, Math.round(altri.length * L.quoteClassi.maggiore)) : 0;
    const nC = Math.round(altri.length * L.quoteClassi.casata);
    luoghi = luoghi.length ? [luoghi[0], ...altri] : [];
    const classi = luoghi.map((s, k) => (k === 0 ? 'casata' : k <= nM ? 'maggiore' : k <= nM + nC ? 'casata' : 'minore'));
    let tutti = true;
    luoghi.forEach((s, k) => {
      const chiave = classi[k];
      if (!piani.has(s)) piani.set(s, new Map());
      const m = piani.get(s);
      if (!m.has(chiave)) m.set(chiave, pianifica(carta, s, chiave, L));
      if (!m.get(chiave)) { esclusi.add(s); tutti = false; }
    });
    if (tutti) {
      luoghi = luoghi.map((s, k) => ({ id: k, tipo: 'rocca', partenza: k === 0, classe: classi[k], ...s,
        ...piani.get(s).get(classi[k]) }));
      break;
    }
  }

  function scegli(pool) {
    let luoghi = [], scalino = null;
    // Dalla zona più stretta e dalla distanza più larga: il primo scalino che arriva a L.numero siti, altrimenti
    // quello con più siti.
    for (let zi = 0; zi < L.zona.length && luoghi.length < L.numero; zi++) {
      for (let di = 0; di < L.distanza.length && luoghi.length < L.numero; di++) {
        const dmin = L.distanza[di];
        const inZona = pool.filter((s) => s.zona <= zi);
        if (!inZona.length) continue;
        // La partenza è un castello di valle (crinale vicino), se nella zona ce n'è uno.
        const presi = [inZona.find((s) => s.carattere === 'valle') ?? inZona[0]];
        const lontano = (s) => presi.every((p) => distanzaKm(p, s) >= dmin);
        // Prima un sito di carattere diverso (fiume, valico, altura), poi i migliori rimasti.
        const diverso = inZona.find((s) => !presi.includes(s) && lontano(s) && !presi.some((p) => p.carattere === s.carattere));
        if (diverso) presi.push(diverso);
        for (const s of inZona) {
          if (presi.length >= L.numero) break;
          if (!presi.includes(s) && lontano(s)) presi.push(s);
        }
        if (presi.length >= 2 && presi.length > luoghi.length) { luoghi = presi; scalino = { zona: L.zona[zi], distanza: dmin }; }
      }
    }
    if (!luoghi.length && pool.length) { luoghi = [pool[0]]; scalino = { zona: Infinity, distanza: Infinity }; }
    // Castello di valle (deciso con l'utente): se nessuno dei siti lo è, il miglior sito di valle (anche fuori
    // zona, lontano dagli altri) diventa la partenza, al posto del sito più debole.
    if (luoghi.length && !luoghi.some((l) => l.carattere === 'valle')) {
      const dmin = scalino && Number.isFinite(scalino.distanza) ? scalino.distanza : L.distanza[L.distanza.length - 1];
      for (const v of pool) {
        if (v.carattere !== 'valle') continue;
        const resto = luoghi.length >= L.numero ? luoghi.slice(0, -1) : luoghi;
        if (!resto.every((p) => distanzaKm(p, v) >= dmin)) continue;
        luoghi = [v, ...resto];
        break;
      }
    }
    return { luoghi, scalino };
  }
  const candidati = validi.filter((s) => !luoghi.some((l) => l.x === s.x && l.z === s.z))
    .map((s) => ({ x: s.x, z: s.z, punteggio: s.punteggio, carattere: s.carattere }));
  return {
    luoghi, candidati,
    info: { stime: stime.length, affinati: scelte.length, validi: validi.length, valichi: valichi.length,
      valle: { stime: stime.filter((x) => x.bc).length, affinati: scelte.filter((x) => x.bc).length,
        validi: validi.filter((x) => x.carattere === 'valle').length },
      scalino, scartatiPerPiani: esclusi.size, giri: giri + 1, ms: performance.now() - t0 },
  };
}

/**
 * Valichi della Carta dai passi tra grandi valli contrapposte (carta.valichiCarta, js/mondo/carta.js), nel formato
 * dei luoghi; se la Carta non li ha (Carte di prima), le selle cercate da trovaValichi.
 */
export function valichiDaCarta(carta, V = VALICHI) {
  if (!carta.valichiCarta) return trovaValichi(carta, V);
  const seme = derivaSeme(carta.seme, 950);
  return carta.valichiCarta.map((v, id) => ({
    // Valichi sul rilievo fine (G4): la sella è già quella vera; per le Carte di prima la cerca sellaFine.
    id, ...(carta.valichiFini ? { x: v.x, y: v.y, quota: v.quota } : sellaFine(carta, v)), scavo: v.scavo,
    sopra: v.quota - Math.max(v.valli[0].quota, v.valli[1].quota),
    deviazione: v.deviazione, valli: v.valli,
    presidio: hashUnita(Math.floor(v.x), Math.floor(v.y), seme) < V.presidio,
  }));
}

/**
 * Sella del valico sul rilievo delle Scene (M6, deciso con l'utente: passi come quelli dolomitici). La Carta la
 * trova su celle di 1 km; qui, su una griglia di `passo` m attorno, si cerca il percorso tra i due lati (due punti giù
 * per le discese) che sale meno in alto: il suo punto più alto è la sella, che scende verso le due valli e sale lungo
 * la cresta. Restituisce { x, y (km), quota }; senza lati (Carte di prima) il punto della Carta.
 */
export const SELLA_FINE = { passo: 125, margine: 1.5 };   // m; km attorno ai lati e al passo
function sellaFine(carta, v) {
  if (!v.lati) return { x: v.x, y: v.y, quota: v.quota };
  const S = SELLA_FINE, C = carta.cella, p = S.passo;
  const xs = [v.x, ...v.lati.map((l) => l.x)], ys = [v.y, ...v.lati.map((l) => l.y)];
  const x0 = (Math.min(...xs) - S.margine) * C, z0 = (Math.min(...ys) - S.margine) * C;
  const nx = Math.ceil(((Math.max(...xs) + S.margine) * C - x0) / p) + 1, nz = Math.ceil(((Math.max(...ys) + S.margine) * C - z0) / p) + 1;
  const h = new Float32Array(nx * nz);
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) h[r * nx + c] = scavaFiumi(carta, x0 + c * p, z0 + r * p, quotaMondo(carta, x0 + c * p, z0 + r * p), _es);
  const cella = (l) => Math.round((l.y * C - z0) / p) * nx + Math.round((l.x * C - x0) / p);
  const a = cella(v.lati[0]), b = cella(v.lati[1]);
  // Percorso «minimax» da a a b (Dijkstra sulla quota più alta raggiunta).
  const costo = new Float32Array(nx * nz).fill(Infinity), da = new Int32Array(nx * nz).fill(-1);
  const fatto = new Uint8Array(nx * nz), coda = [a];
  costo[a] = h[a];
  while (coda.length) {
    let m = 0;
    for (let k = 1; k < coda.length; k++) if (costo[coda[k]] < costo[coda[m]]) m = k;
    const i = coda[m]; coda[m] = coda[coda.length - 1]; coda.pop();
    if (fatto[i]) continue;
    fatto[i] = 1;
    if (i === b) break;
    const c = i % nx, r = (i / nx) | 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr;
      if ((!dc && !dr) || cc < 0 || rr < 0 || cc >= nx || rr >= nz) continue;
      const j = rr * nx + cc, nc = Math.max(costo[i], h[j]);
      if (!fatto[j] && nc < costo[j]) { costo[j] = nc; da[j] = i; coda.push(j); }
    }
  }
  if (!fatto[b]) return { x: v.x, y: v.y, quota: v.quota };
  let alto = b;
  for (let i = b; i !== a; i = da[i]) if (h[i] > h[alto]) alto = i;
  const c = alto % nx, r = (alto / nx) | 0;
  return { x: (x0 + c * p) / C, y: (z0 + r * p) / C, quota: h[alto] };
}

/** Aggiunge `carta.valichi`, `carta.luoghi`, `carta.candidatiLuoghi` e le statistiche alla Carta. */
export function aggiungiLuoghi(carta) {
  carta.valichi = valichiDaCarta(carta);
  const { luoghi, candidati, info } = scegliLuoghi(carta);
  carta.luoghi = luoghi;
  carta.candidatiLuoghi = candidati;
  if (carta.statistiche) carta.statistiche.luoghi = info;
  return carta;
}
