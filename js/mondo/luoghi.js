// Knight Dawn — luoghi del mondo generato (M7). Modulo ES senza grafica né DOM (regola 9).
// Passo 1: scelta dei siti delle rocche con borgo. Fase 9 ridotta del generatore: gira nel Worker dopo la
// Carta (generaCarta) e scrive `carta.luoghi`, che finisce nella cache con la Carta (VERSIONE_GENERATORE).
//
// Due stadi:
//   1. candidati sulle celle della Carta (1 km): terra, quota da collina a pedemonte, biomi abitabili, lontano
//      dalle pareti dei gruppi montuosi, dai bordi, dai fiumi e dai laghi; un'altura rispetto ai dintorni;
//   2. affinamento alla scala della Scena (quota del mondo, la stessa del terreno 3D): punto più alto della
//      cella, lavoro di terra sotto la rocca e sotto il borgo (nella direzione migliore), pendenza, dominanza
//      sui dintorni, distanza esatta dal tracciato del fiume più vicino e dalla forcella più vicina.
// Poi si scelgono 2–3 siti diversi e distanti tra loro, nella zona attorno al centro della Carta.
// Solo operazioni dal risultato esatto (+ − × ÷, sqrt, floor) e costanti scritte a mano: il sito decide la
// forma del mondo (dal passo 2 il terrapieno), e deve essere identico in ogni browser.

import { ACQUA, BIOMA } from './carta.js';
import { quotaMondo } from './scena.js';
import { derivaSeme } from './rumore.js';

export const LUOGHI = {
  quota: [120, 900],              // m, quota della cella: collina e pedemonte
  biomi: [BIOMA.PIANURA, BIOMA.PIANURA_N, BIOMA.PIANURA_S, BIOMA.FORESTA, BIOMA.COLLINA],
  asprezza: 0.2,                  // oltre: vicino alle pareti dei gruppi montuosi
  bordo: 25,                      // km dal bordo della Carta
  lago: 1.5,                      // km (a celle) dai laghi
  fiume: { minimo: 0.9, buono: [0.9, 4], fino: 6 },   // km dall'asse del tracciato della Carta
  valico: { buono: 8, fino: 12 }, // km dalla forcella più vicina
  candidati: 260,                 // celle affinate (le migliori secondo la stima sulla Carta)
  // Misure del sito (castello di casata, docs/ESPLORAZIONE_3D.md, M7): la classe ne cambierà la grandezza
  // dal passo 3; qui servono a giudicare il terreno.
  rocca: { semilato: 26, passo: 8.6667 },             // m: quadrato di 52 m attorno al punto più alto
  borgo: { distanza: 80, lungo: 45, largo: 65, nl: 7, nw: 9 },   // m: centro a 80 m, 90 × 130 m
  dominanza: { raggio: 1500, tetto: 250, minima: 15 },
  cima: { raggi: [150, 300, 450], tolleranza: 1 },    // m: niente più alto di così attorno alla rocca
  scarti: { rocca: 12, borgo: 30, pendenza: 15 },     // m, m, gradi (pendenza media del borgo)
  pesi: { fiume: 70, valico: 60, rocca: 4, borgo: 1.5, pendenza: 3 },
  // Scelta: zona attorno al centro (km), poi distanza minima tra i siti (km), a scalini se non bastano.
  zona: [90, 140, 220, 400],
  distanza: [20, 15, 10],
  numero: 3,
};

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
  for (const f of carta.fiumi || []) {
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

/** Forcella più vicina (km) al punto (km). */
function distanzaValico(carta, px, py) {
  let d = Infinity;
  for (const g of carta.massicci || []) {
    for (const f of g.forcelle) {
      const ex = f.x - px, ey = f.y - py, e = Math.sqrt(ex * ex + ey * ey);
      if (e < d) d = e;
    }
  }
  return d;
}

/** Rampa lineare da 1 (fino ad a) a 0 (da b in poi). */
const cala = (v, a, b) => (v <= a ? 1 : v >= b ? 0 : (b - v) / (b - a));

/**
 * Giudica un sito attorno alla cella (c, r). null se scartato; altrimenti le misure e il punteggio.
 * Coordinate del mondo in metri.
 */
function affina(carta, c, r, seed, fiumeVicino, L) {
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
  // Una cima vera: niente terreno più alto entro qualche centinaio di metri (altrimenti è un dosso ai piedi di un
  // rilievo più alto, dominato da vicino; con il solo punto più alto della cella capitava spesso).
  for (const raggio of L.cima.raggi) {
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
  if (dominanza < D.minima) return null;
  // Fiume e valico (km).
  const fv = fiumeVicino(bx / C, bz / C, L.fiume.fino);
  if (fv.d < L.fiume.minimo) return null;
  const dValico = distanzaValico(carta, bx / C, bz / C);
  const bonusFiume = fv.d === Infinity ? 0 : cala(fv.d, L.fiume.buono[1], L.fiume.fino);
  const bonusValico = cala(dValico, L.valico.buono, L.valico.fino);
  const P = L.pesi;
  const punteggio = Math.min(dominanza, D.tetto) + P.fiume * bonusFiume + P.valico * bonusValico
    - P.rocca * dRocca - P.borgo * migliore.dBorgo - P.pendenza * pendenza;
  const carattere = bonusValico >= 0.5 ? 'valico' : bonusFiume >= 0.5 ? 'fiume' : 'altura';
  const [ux, uz] = DIR8[migliore.k];
  return {
    x: bx, z: bz, quota: bh, verso: { x: ux, z: uz }, quotaBorgo: migliore.quota,
    dislivelli: { rocca: dRocca, borgo: migliore.dBorgo }, pendenza, dominanza,
    fiume: { distanza: fv.d, bacino: fv.bacino }, valico: dValico, carattere, punteggio,
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

  // ─── Stadio 1: stima sulle celle ───
  const stime = [];
  const fv = { d: 0, bacino: 0 };
  const anello = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]];
  for (let r = L.bordo; r < rows - L.bordo; r++) {
    for (let c = L.bordo; c < cols - L.bordo; c++) {
      const i = r * cols + c, h = quota[i];
      if (mare[i] || (acque && acque[i] !== ACQUA.TERRA) || h < L.quota[0] || h > L.quota[1]) continue;
      if (bioma && !ammesso[bioma[i]]) continue;
      if (asprezza && asprezza[i] > L.asprezza) continue;
      if (dLago[i] < L.lago) continue;
      let m = 0;
      for (const [dx, dy] of anello) m += quota[(r + dy) * cols + c + dx];
      const dom = h - m / anello.length;
      if (dom <= 0) continue;                              // nemmeno un rialzo alla scala della Carta
      vicino(c + 0.5, r + 0.5, L.fiume.fino, fv);
      if (fv.d < 0.5) continue;                            // la cella è sul fiume
      const bf = fv.d === Infinity ? 0 : cala(fv.d, L.fiume.buono[1], L.fiume.fino);
      const bv = cala(distanzaValico(carta, c + 0.5, r + 0.5), L.valico.buono, L.valico.fino);
      stime.push({ c, r, s: Math.min(dom, L.dominanza.tetto) + L.pesi.fiume * bf + L.pesi.valico * bv });
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
  const perZona = Math.ceil(L.candidati / L.zona.length);
  const contaZona = new Array(L.zona.length + 1).fill(0);
  const scelte = [];
  for (const st of stime) {
    const z = zonaDi(st.c, st.r);
    if (z >= L.zona.length || contaZona[z] >= perZona) continue;
    contaZona[z]++;
    scelte.push(st);
  }

  // ─── Stadio 2: affinamento ───
  const validi = [];
  for (const st of scelte) {
    const sito = affina(carta, st.c, st.r, seed, vicino, L);
    if (sito) { sito.zona = zonaDi(sito.x / carta.cella, sito.z / carta.cella); validi.push(sito); }
  }
  validi.sort((a, b) => b.punteggio - a.punteggio || a.z - b.z || a.x - b.x);

  // ─── Scelta: 2–3 siti diversi e distanti, attorno al centro ───
  const distanzaKm = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) / carta.cella;
  let luoghi = [], scalino = null;
  for (let zi = 0; zi < L.zona.length && luoghi.length < 2; zi++) {
    for (let di = 0; di < L.distanza.length && luoghi.length < 2; di++) {
      const dmin = L.distanza[di];
      const inZona = validi.filter((s) => s.zona <= zi);
      if (!inZona.length) continue;
      const presi = [inZona[0]];
      const lontano = (s) => presi.every((p) => distanzaKm(p, s) >= dmin);
      // Prima un sito di carattere diverso (fiume, valico, altura), poi i migliori rimasti.
      const diverso = inZona.find((s) => !presi.includes(s) && lontano(s) && !presi.some((p) => p.carattere === s.carattere));
      if (diverso) presi.push(diverso);
      for (const s of inZona) {
        if (presi.length >= L.numero) break;
        if (!presi.includes(s) && lontano(s)) presi.push(s);
      }
      if (presi.length >= 2) { luoghi = presi; scalino = { zona: L.zona[zi], distanza: dmin }; }
    }
  }
  if (!luoghi.length && validi.length) { luoghi = [validi[0]]; scalino = { zona: Infinity, distanza: Infinity }; }

  // Classi: la partenza (il primo, il migliore nella zona più vicina al centro) è un castello di casata;
  // degli altri, quello col punteggio più alto è la sede maggiore se i siti sono tre, gli altri rocche minori.
  const altri = luoghi.slice(1).sort((a, b) => b.punteggio - a.punteggio);
  const maggiore = luoghi.length === 3 ? altri[0] : null;
  luoghi = [luoghi[0], ...altri].map((s, k) => ({
    id: k, tipo: 'rocca', partenza: k === 0,
    classe: k === 0 ? 'casata' : s === maggiore ? 'maggiore' : 'minore',
    ...s,
  }));
  const candidati = validi.filter((s) => !luoghi.some((l) => l.x === s.x && l.z === s.z))
    .map((s) => ({ x: s.x, z: s.z, punteggio: s.punteggio, carattere: s.carattere }));
  return {
    luoghi, candidati,
    info: { stime: stime.length, affinati: scelte.length, validi: validi.length, scalino, ms: performance.now() - t0 },
  };
}

/** Aggiunge `carta.luoghi`, `carta.candidatiLuoghi` e le statistiche alla Carta. */
export function aggiungiLuoghi(carta) {
  const { luoghi, candidati, info } = scegliLuoghi(carta);
  carta.luoghi = luoghi;
  carta.candidatiLuoghi = candidati;
  if (carta.statistiche) carta.statistiche.luoghi = info;
  return carta;
}
