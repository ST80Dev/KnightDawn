// Knight Dawn — veicoli sulle strade (docs/ESPLORAZIONE_3D.md, «Veicoli sulle strade»; budget in docs/PRESTAZIONI.md)
//
// Tre veicoli, decisi con l'utente (28/11/2026), tutti a passo d'uomo e solo sulle strade da carro:
//  - carrozza: il carro coperto da viaggio del Trecento (chariot branlant, whirlicote delle miniature): quattro ruote,
//    cassone di legno dipinto, copertura a botte di tela a bande colorate, 2–4 cavalli in fila con il postiglione in
//    sella all'ultimo, un cavaliere di scorta dietro. Solo sulle strade maestre.
//  - carro: carro da trasporto a quattro ruote, sponde basse e merci leggere, 1–2 cavalli, il carrettiere a piedi.
//  - carretto: due ruote e stanghe, un mulo o un asino, il conducente a piedi alla testa. Soprattutto sulle carrarecce.
//
// Come esistono. Altrove nel mondo c'è solo un ORARIO: per ogni ramo della rete (strade maestre e carrarecce) partenze a
// intervalli regolari dai due capi, ciascuna con tipo, velocità e un tiro di presenza dal seme. Dove sia un veicolo a un
// certo istante è un conto (partenza, velocità), non uno stato: nessun lavoro e nessun disegno fuori dal blocco. Vicino
// al cavaliere (entro `vivi` m) i veicoli dell'orario prendono vita: seguono il tracciato fine della strada (quota e
// curve), a sinistra della carreggiata, rallentano in salita, si fermano se il cavaliere o il cavallo sbarrano la strada,
// e lasciano la vita oltre `vivi` m (il ritardo accumulato resta in memoria per la sessione).
//
// Prestazioni: tutto in poche InstancedMesh condivise (animali, ruote, corde, una per tipo di cassone, una per le
// persone): ~7 chiamate di disegno per tutti i veicoli del blocco, qualunque sia il loro numero, e 0 triangoli per chi
// non si vede (oltre `disegno` m o fuori dall'inquadratura). Gambe degli animali e passo delle persone nel vertex shader.
//
// Coordinate: la posizione vera di un veicolo è (ramo, s, verso) sulla rete del mondo, quindi sopravvive al cambio di
// blocco senza traslazioni; la Scena riceve coordinate locali (mondo − centro del blocco).

import * as THREE from 'three';
import { FORME_CAVALLO as F } from './cavallo3d.js';
import { creaPersone } from './persone3d.js';
import { _trattiPerProve as trattiStrade } from '../mondo/strade.js';

export const CARRI = {
  vivi: 1100,          // m dal cavaliere entro cui un veicolo dell'orario esiste davvero
  disegno: 500,        // m dalla camera: oltre non si disegna (docs: «oltre ~500 m forma semplificata o niente»)
  comparsa: 650,       // m: durante il gioco un veicolo prende vita solo oltre questa distanza (fuori vista)
  uscita: 20,          // s: appena partito da una porta compare anche vicino (esce dal borgo)
  massimo: 10,         // veicoli vivi al più
  controllo: 0.5,      // s di gioco tra due letture dell'orario
  saltoTempo: 600,     // s di Scena: un salto del tempo più lungo (riposo, sonno) rimette i veicoli all'orario
  // Intervallo tra due partenze nello stesso verso (s di Scena: 1 s reale = 1 s di Scena, 10 s di gioco). Tarati in Node
  // sul seme 570549: di giorno 1,5 veicoli per blocco con una strada maestra, 0,3 sulle carrarecce.
  intervallo: { maestra: 1800, carrareccia: 5500 },
  vicinoBorgo: 0.5,    // rami che toccano una rocca, un borgo o una città: intervallo × questo
  esiste: 0.85,        // parte di partenze che esistono
  tipi: {
    maestra: [['carrozza', 0.18], ['carro', 0.52], ['carretto', 0.30]],
    carrareccia: [['carretto', 0.85], ['carro', 0.15]],
  },
  notte: 0.06,         // presenza di notte (chi è in viaggio a notte fonda)
  accelerazione: 0.35, // m/s²
  frenata: 1.6,        // m/s²
  davanti: 4.5,        // m davanti al primo animale: se c'è il cavaliere, il cavallo o un altro veicolo, si ferma
  margine: 0.35,       // m in più attorno alle sagome per decidere che la strada è sbarrata
};

// Per tipo: velocità in piano (m/s), semilarghezza (m), animali, ruote (raggio, interasse, carreggiata), lunghezze.
const TIPI = {
  carrozza: { vel: 1.35, mezza: 1.0, animali: [2, 4], ruota: 0.62, interasse: 3.0, carreggiata: 0.9, passo: 2.7, stacco: 2.7 },
  carro: { vel: 1.2, mezza: 0.8, animali: [1, 2], ruota: 0.5, interasse: 2.2, carreggiata: 0.74, passo: 2.6, stacco: 2.35 },
  carretto: { vel: 1.05, mezza: 0.75, animali: [1, 1], ruota: 0.6, interasse: 0, carreggiata: 0.7, passo: 0, stacco: 2.45 },
};

// Mantelli: [mantello, crini e gambe]. Cavalli da tiro e da viaggio; muli e asini per i carretti.
const MANTELLI = {
  cavallo: [['#6e3b1f', '#17110d'], ['#7a4523', '#4a2814'], ['#4a2a18', '#120d0a'], ['#8d8a84', '#56524d'],
    ['#2a1e16', '#120d0a'], ['#8a6a44', '#3a2a1a']],
  mulo: [['#5a4030', '#2e2219'], ['#6b5644', '#3a2c20'], ['#3e3029', '#1d1612']],
  asino: [['#7d7468', '#3f3a34'], ['#5e4a3a', '#2e241c'], ['#8a8072', '#4a443c']],
};
const LIVREE = ['#8a1010', '#2a3f6e', '#2f5a34', '#6a2c5a', '#7a5a14'];
const VESTI = ['#6b5a44', '#7a6a50', '#5a4a3a', '#8a7458', '#5a5040', '#6a6a50'];
const PELLE = ['#d9b08c', '#c99872', '#b07d5a', '#e0bd9a'];

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// ─── Orario e rete (senza grafica: si prova in Node) ─────────────────────────────────────────────────────────────

/** Numero pseudo-casuale in [0, 1) da interi (stesso risultato a ogni avvio). */
export function tiro(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Quanti viaggiano a quell'ora (0–24): pieno di giorno, crepuscoli graduali, quasi nessuno di notte. */
export function presenzaDelGiorno(ora, notte = CARRI.notte) {
  if (ora >= 7 && ora <= 17) return 1;
  if (ora > 17 && ora < 20) return lerp(1, notte, (ora - 17) / 3);
  if (ora > 5 && ora < 7) return lerp(notte, 1, (ora - 5) / 2);
  return notte;
}

function lunghezza(xs, zs) {
  let l = 0;
  for (let i = 1; i < xs.length; i++) l += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return l;
}

/**
 * Rotte dei veicoli: una per ramo della rete di classe maestra o carrareccia, con i tratti fini in fila (coordinate del
 * mondo, m). La posizione s sulla rotta si misura sul percorso della rete (punti della Carta: un conto stabile); dentro
 * ogni tratto si passa al tracciato fine in proporzione (k = m di rete per m di tracciato).
 * @returns {{ rotte: Map<number, object>, lista: object[] }}
 */
export function reteCarri(carta, tratti = trattiStrade(carta)) {
  const C = carta.cella, perRamo = new Map();
  for (const t of tratti) {
    if (t.classe !== 'maestra' && t.classe !== 'carrareccia') continue;
    if (!perRamo.has(t.ramo)) perRamo.set(t.ramo, []);
    perRamo.get(t.ramo).push(t);
  }
  const nodi = carta.strade?.nodi ?? [];
  const nodoIn = (x, z) => nodi.find((n) => Math.hypot(n.x * C - x, n.y * C - z) < 3) ?? null;
  const rotte = new Map(), lista = [];
  for (const [ramo, ts] of perRamo) {
    const pezzi = [];
    for (const t of ts) {
      const lc = lunghezza(t.px, t.pz);
      if (!(lc > 1)) continue;
      let x, z, h;
      if (t.fine) {
        x = Array.from(t.fine.x); z = Array.from(t.fine.z); h = Array.from(t.fine.h);
        // Il tracciato fine va dall'inizio alla fine del tratto della rete: se è al contrario, si gira.
        const n = x.length - 1;
        const dritto = Math.hypot(x[0] - t.px[0], z[0] - t.pz[0]) + Math.hypot(x[n] - t.px[t.px.length - 1], z[n] - t.pz[t.pz.length - 1]);
        const rovescio = Math.hypot(x[n] - t.px[0], z[n] - t.pz[0]) + Math.hypot(x[0] - t.px[t.px.length - 1], z[0] - t.pz[t.pz.length - 1]);
        if (rovescio < dritto) { x.reverse(); z.reverse(); h.reverse(); }
      } else {
        x = Array.from(t.px); z = Array.from(t.pz); h = x.map(() => NaN);
      }
      const cum = new Float64Array(x.length);
      for (let i = 1; i < x.length; i++) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
      const lf = cum[x.length - 1];
      if (!(lf > 1)) continue;
      pezzi.push({ lc, lf, k: lc / lf, x: Float64Array.from(x), z: Float64Array.from(z), h: Float64Array.from(h), cum });
    }
    if (!pezzi.length) continue;
    const inizio = new Float64Array(pezzi.length + 1);
    pezzi.forEach((p, i) => { inizio[i + 1] = inizio[i] + p.lc; });
    const p0 = pezzi[0], p1 = pezzi[pezzi.length - 1];
    const capi = [{ x: p0.x[0], z: p0.z[0] }, { x: p1.x[p1.x.length - 1], z: p1.z[p1.z.length - 1] }];
    const meta = capi.map((c) => { const n = nodoIn(c.x, c.z); return n && (n.tipo === 'rocca' || n.tipo === 'villaggio') ? n.tipo : null; });
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pezzi) for (let i = 0; i < p.x.length; i++) {
      x0 = Math.min(x0, p.x[i]); x1 = Math.max(x1, p.x[i]); z0 = Math.min(z0, p.z[i]); z1 = Math.max(z1, p.z[i]);
    }
    const rotta = { id: ramo, classe: ts[0].classe, pezzi, inizio, L: inizio[pezzi.length], capi, meta,
      borgo: meta.includes('rocca'), riquadro: [x0, z0, x1, z1], vicini: [[], []] };
    rotte.set(ramo, rotta);
    lista.push(rotta);
  }
  // Incroci: per ogni capo, i capi delle altre rotte che toccano lo stesso punto (per proseguire oltre l'incrocio).
  for (const a of lista) {
    for (let e = 0; e < 2; e++) {
      for (const b of lista) {
        if (b === a) continue;
        for (let f = 0; f < 2; f++) {
          if (Math.hypot(a.capi[e].x - b.capi[f].x, a.capi[e].z - b.capi[f].z) < 25) a.vicini[e].push({ rotta: b, capo: f });
        }
      }
    }
  }
  return { rotte, lista };
}

/**
 * Punto della rotta a distanza s (m di rete dall'inizio): x, z, h (quota della strada), tangente unitaria (tx, tz)
 * verso la fine della rotta e k (m di rete per m di tracciato in quel tratto).
 */
export function puntoRotta(r, s, out = { x: 0, z: 0, h: 0, tx: 0, tz: 1, k: 1 }) {
  s = clamp(s, 0, r.L);
  let i = 0, j = r.pezzi.length - 1;
  while (i < j) { const m = (i + j + 1) >> 1; if (r.inizio[m] <= s) i = m; else j = m - 1; }
  const p = r.pezzi[i];
  const sf = ((s - r.inizio[i]) / p.lc) * p.lf;
  let a = 0, b = p.cum.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (p.cum[m] <= sf) a = m; else b = m; }
  const d = p.cum[b] - p.cum[a], t = d > 1e-9 ? clamp((sf - p.cum[a]) / d, 0, 1) : 0;
  out.x = p.x[a] + (p.x[b] - p.x[a]) * t;
  out.z = p.z[a] + (p.z[b] - p.z[a]) * t;
  out.h = p.h[a] + (p.h[b] - p.h[a]) * t;
  const dx = p.x[b] - p.x[a], dz = p.z[b] - p.z[a], l = Math.hypot(dx, dz) || 1;
  out.tx = dx / l; out.tz = dz / l;
  out.k = p.k;
  return out;
}

/** Tipo, velocità e colori di una partenza dell'orario (dal seme): sempre gli stessi per lo stesso id. */
function datiPartenza(seme, rotta, verso, n) {
  const r = (i) => tiro(seme, rotta.id * 2 + verso, n, 101 + i);
  let tipo = null, acc = 0;
  const u = r(1);
  for (const [t, p] of CARRI.tipi[rotta.classe]) { acc += p; if (u < acc) { tipo = t; break; } }
  tipo ??= CARRI.tipi[rotta.classe].at(-1)[0];
  const T = TIPI[tipo];
  return { tipo, vel: T.vel * (0.9 + 0.2 * r(2)), presenza: r(3), esiste: r(0) < CARRI.esiste, seme: Math.floor(r(4) * 1e9) };
}

/**
 * Veicoli dell'orario su una rotta all'istante t (s di Scena): [{ id, rotta, verso, s, ...datiPartenza }].
 * verso +1 parte dall'inizio della rotta, −1 dalla fine; s in m di rete dall'inizio. `ritardi`: id → s di ritardo.
 */
export function orarioRotta(seme, rotta, t, ritardi = null, out = []) {
  const H = CARRI.intervallo[rotta.classe] * (rotta.borgo ? CARRI.vicinoBorgo : 1);
  const vMin = Math.min(...CARRI.tipi[rotta.classe].map(([tp]) => TIPI[tp].vel)) * 0.9;
  for (const [verso, v] of [[1, 0], [-1, 1]]) {
    const fase = tiro(seme, rotta.id, v, 7) * H;
    const n0 = Math.floor((t - rotta.L / vMin - fase) / H), n1 = Math.floor((t - fase) / H);
    for (let n = Math.max(n0, -1e9); n <= n1; n++) {
      const d = datiPartenza(seme, rotta, v, n);
      if (!d.esiste) continue;
      const id = `${rotta.id}:${v}:${n}`;
      const ritardo = ritardi?.get(id) ?? 0;
      const tPartenza = fase + n * H;
      const percorso = (t - tPartenza - ritardo) * d.vel;
      if (percorso < 0 || percorso > rotta.L) continue;
      out.push({ id, rotta, verso, s: verso > 0 ? percorso : rotta.L - percorso, tPartenza, partito: t - tPartenza - ritardo, ...d });
    }
  }
  return out;
}

/** Fattore della velocità per la pendenza g lungo la marcia (+ salita): più lenti in salita, prudenti nelle discese ripide. */
export function fattorePendenza(g) {
  if (g >= 0) return Math.max(0.45, 1 / (1 + 6 * g));
  const d = -g;
  return d <= 0.06 ? 1 : Math.max(0.6, 1 - 2.5 * (d - 0.06));
}

// ─── Modelli: geometrie condivise, colori nei vertici ────────────────────────────────────────────────────────────

/** Unisce pezzi { geo, colore } in una geometria non indicizzata con colore nei vertici; le facce in basso più scure. */
function unisciColori(pezzi) {
  const gs = pezzi.map(({ geo, colore, ombra = true }) => ({ g: geo.index ? geo.toNonIndexed() : geo, c: new THREE.Color(colore), ombra }));
  for (const { g } of gs) if (!g.attributes.normal) g.computeVertexNormals();
  const n = gs.reduce((s, x) => s + x.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, c, ombra } of gs) {
    const k = g.attributes.position.count, na = g.attributes.normal;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(na.array, o * 3);
    for (let i = 0; i < k; i++) {
      const f = ombra ? 0.72 + 0.28 * (0.5 + 0.5 * na.getY(i)) : 1;
      col[(o + i) * 3] = c.r * f; col[(o + i) * 3 + 1] = c.g * f; col[(o + i) * 3 + 2] = c.b * f;
    }
    o += k;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Punta del timone (m davanti all'asse anteriore): lì il bilancino a cui si attaccano le tirelle dell'ultimo cavallo.
const TIMONE = { carrozza: 1.4, carro: 1.0 };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const LEGNO = '#6b5236', LEGNO_SCURO = '#4a3826', FERRO = '#3e3a36', TELA = '#b8a682', CUOIO = '#3a2a1c';

/** Ruota di raggio 1 nel piano YZ (asse X): cerchione cerchiato di ferro, sei raggi, mozzo. ~135 triangoli. */
function geometriaRuota() {
  const p = [];
  p.push({ geo: new THREE.TorusGeometry(0.92, 0.075, 3, 11).rotateY(Math.PI / 2), colore: FERRO });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(0.035, 0.045, 0.8, 4, 1, true).translate(0, 0.48, 0).rotateX((i / 6) * Math.PI * 2);
    p.push({ geo: g, colore: LEGNO });
  }
  p.push({ geo: new THREE.CylinderGeometry(0.13, 0.13, 0.24, 5).rotateZ(Math.PI / 2), colore: LEGNO_SCURO });
  return unisciColori(p);
}

/** Corda o tirella: scatola unitaria lungo +Z da 0 a 1 (la matrice dell'istanza le dà lunghezza e spessore). */
function geometriaCorda() {
  return unisciColori([{ geo: new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), colore: CUOIO, ombra: false }]);
}

/**
 * Carrozza (chariot branlant): origine a terra a metà tra gli assi, avanti +Z. Cassone lungo e basso con le sponde
 * dipinte, copertura a botte di tela a bande colorate (rosso, ocra, azzurro), timone corto per le tirelle. ~230 triangoli.
 */
function geometriaCarrozza() {
  const T = TIPI.carrozza, y0 = T.ruota + 0.22, L = 4.6;
  const p = [
    { geo: box(0.12, 0.18, 4.9, 0.7, y0 - 0.02, 0), colore: LEGNO_SCURO },
    { geo: box(0.12, 0.18, 4.9, -0.7, y0 - 0.02, 0), colore: LEGNO_SCURO },
    { geo: box(1.5, 0.08, L, 0, y0 + 0.08, 0), colore: LEGNO },
    { geo: box(0.07, 0.46, L, 0.76, y0 + 0.34, 0), colore: '#7a3b22' },
    { geo: box(0.07, 0.46, L, -0.76, y0 + 0.34, 0), colore: '#7a3b22' },
    { geo: box(0.1, 0.06, L + 0.04, 0.77, y0 + 0.6, 0), colore: '#b08a3a', ombra: false },   // filetto d'ocra sulle sponde
    { geo: box(0.1, 0.06, L + 0.04, -0.77, y0 + 0.6, 0), colore: '#b08a3a', ombra: false },
    { geo: box(1.6, 0.46, 0.07, 0, y0 + 0.34, L / 2), colore: '#7a3b22' },
    { geo: box(1.6, 0.46, 0.07, 0, y0 + 0.34, -L / 2), colore: '#7a3b22' },
    { geo: box(0.1, 0.1, 1.0, 0, T.ruota - 0.05, T.interasse / 2 + 0.9), colore: LEGNO_SCURO },   // timone
    { geo: box(0.8, 0.07, 0.07, 0, T.ruota - 0.05, T.interasse / 2 + TIMONE.carrozza), colore: LEGNO_SCURO },   // bilancino
  ];
  // Copertura a botte: cinque bande di tela dipinta, aperte sotto; testate a mezzo disco (dietro scura: l'apertura).
  const R = 0.82, yC = y0 + 0.58, bande = ['#8c2a20', '#c9a24a', '#2e4a7a', '#c9a24a', '#8c2a20'], lb = (L - 0.1) / bande.length;
  bande.forEach((c, i) => {
    const g = new THREE.CylinderGeometry(R, R, lb, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    p.push({ geo: g.translate(0, yC, -(L - 0.1) / 2 + lb * (i + 0.5)), colore: c, ombra: false });
  });
  p.push({ geo: new THREE.CircleGeometry(R, 10, 0, Math.PI).translate(0, yC, (L - 0.1) / 2), colore: '#b8a060', ombra: false });
  p.push({ geo: new THREE.CircleGeometry(R, 10, 0, Math.PI).rotateY(Math.PI).translate(0, yC, -(L - 0.1) / 2), colore: '#2a2018', ombra: false });
  return unisciColori(p);
}

/** Carro da trasporto: pianale con sponde basse a stecche, sacchi, due botti e una balla sotto un telo. ~300 triangoli. */
function geometriaCarro() {
  const T = TIPI.carro, y0 = T.ruota + 0.2, L = 3.3;
  const p = [
    { geo: box(0.1, 0.14, 3.5, 0.6, y0 - 0.04, 0), colore: LEGNO_SCURO },
    { geo: box(0.1, 0.14, 3.5, -0.6, y0 - 0.04, 0), colore: LEGNO_SCURO },
    { geo: box(1.34, 0.07, L, 0, y0 + 0.06, 0), colore: LEGNO },
    { geo: box(0.1, 0.1, 1.0, 0, T.ruota - 0.08, T.interasse / 2 + 0.5), colore: LEGNO_SCURO },   // timone
    { geo: box(0.8, 0.07, 0.07, 0, T.ruota - 0.08, T.interasse / 2 + TIMONE.carro), colore: LEGNO_SCURO },   // bilancino
  ];
  for (const sx of [-1, 1]) {
    for (const y of [0.2, 0.4]) p.push({ geo: box(0.05, 0.08, L, 0.65 * sx, y0 + y, 0), colore: LEGNO });
    for (const z of [-1.5, -0.5, 0.5, 1.5]) p.push({ geo: box(0.06, 0.44, 0.06, 0.65 * sx, y0 + 0.28, z), colore: LEGNO_SCURO });
  }
  for (const z of [-L / 2, L / 2]) p.push({ geo: box(1.34, 0.36, 0.05, 0, y0 + 0.26, z), colore: LEGNO });
  const sacco = (x, z, r) => new THREE.SphereGeometry(1, 6, 4).scale(0.3, 0.2, 0.42).rotateY(r).translate(x, y0 + 0.28, z);
  p.push({ geo: sacco(-0.3, -1.1, 0.2), colore: '#a89068' }, { geo: sacco(0.28, -1.0, -0.15), colore: '#9a8460' },
    { geo: sacco(0.0, -0.45, 1.4), colore: '#b09a70' });
  for (const [x, z] of [[-0.3, 0.45], [0.3, 0.55]]) {
    p.push({ geo: new THREE.CylinderGeometry(0.24, 0.24, 0.6, 7).translate(x, y0 + 0.4, z), colore: '#6a4a2c' });
    p.push({ geo: new THREE.CylinderGeometry(0.255, 0.255, 0.05, 7, 1, true).translate(x, y0 + 0.4, z), colore: FERRO, ombra: false });
  }
  p.push({ geo: box(1.1, 0.5, 0.75, 0, y0 + 0.33, 1.2), colore: TELA });
  return unisciColori(p);
}

/** Carretto a due ruote: origine a terra sotto l'asse, avanti +Z; cassetta, stanghe fino al mulo, fascina e un sacco. */
function geometriaCarretto() {
  const T = TIPI.carretto, y0 = T.ruota + 0.12, ys = y0 + 0.08;
  const p = [
    { geo: box(1.1, 0.06, 1.7, 0, y0 + 0.04, 0.1), colore: LEGNO },
    { geo: box(0.08, 0.05, 1.4, 0, T.ruota, -0.4), colore: LEGNO_SCURO },                        // sotto l'asse
    { geo: box(0.12, 0.12, 1.5, 0, T.ruota - 0.02, 0).rotateY(Math.PI / 2), colore: LEGNO_SCURO },   // asse
  ];
  for (const sx of [-1, 1]) {
    p.push({ geo: box(0.05, 0.3, 1.7, 0.55 * sx, y0 + 0.2, 0.1), colore: LEGNO });
    // Stanghe: dal fondo della cassetta fino ai fianchi del mulo (lo stacco del tipo, 2,45 m davanti all'asse)
    p.push({ geo: box(0.07, 0.07, 3.3, 0.38 * sx, ys, 0.95), colore: LEGNO_SCURO });
  }
  p.push({ geo: box(1.1, 0.3, 0.05, 0, y0 + 0.2, -0.75), colore: LEGNO }, { geo: box(1.1, 0.3, 0.05, 0, y0 + 0.2, 0.95), colore: LEGNO });
  p.push({ geo: box(0.06, 0.55, 0.06, 0, (y0 + 0.08) / 2, -0.7).rotateX(0.15), colore: LEGNO_SCURO });   // puntello
  // Fascina di legna e un sacco
  for (let i = 0; i < 5; i++) {
    p.push({ geo: new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5).rotateX(Math.PI / 2).translate(-0.3 + i * 0.15, y0 + 0.17 + (i % 2) * 0.1, 0.0), colore: '#7a6040' });
  }
  p.push({ geo: new THREE.SphereGeometry(1, 6, 4).scale(0.28, 0.2, 0.36).translate(0.18, y0 + 0.42, 0.55), colore: '#a89068' });
  return unisciColori(p);
}

// ─── Animali da tiro: cavallo e mulo dalle forme del cavallo (cavallo3d.js), istanziati, gambe nel vertex shader ──

// Pesi del colore: (mantello, crini, stoffa, fisso: 1 zoccolo · 2 cuoio · 3 ferro)
const A_MANTELLO = [1, 0, 0, 0], A_CRINI = [0, 1, 0, 0], A_STOFFA = [0, 0, 1, 0];
const A_ZOCCOLO = [0, 0, 0, 1], A_CUOIO = [0, 0, 0, 2], A_FERRO = [0, 0, 0, 3];
// Parti che si chiudono in un punto per chi non le porta: 1 collare (tiro), 2 sella e gualdrappa, 3 orecchie da cavallo,
// 4 orecchie da mulo (lo stesso modo dell'elmo delle guardie in persone3d.js: zero chiamate di disegno in più).
const P_SEMPRE = 0, P_COLLARE = 1, P_SELLA = 2, P_ORECCHIE = 3, P_ORECCHIE_MULO = 4;

/** Geometria comune di cavalli e muli, ~750 triangoli; attributi aSnodo, aTinta, aParte (vedi innestaAnimali). */
function geometriaAnimale() {
  const pezzi = [];
  const metti = (geo, snodo, tinta, parte = P_SEMPRE) => pezzi.push({ geo, snodo, tinta, parte });
  const FERMO = [0, 0, 0, 0], COLLO = [5, 0, 0, 0];
  const { TRONCO, COLLO: CK, CODA, TESTA, ANTERIORE, POSTERIORE, PERNO_TESTA, DIR_TESTA } = F;
  const tronco = F.tubo(F.chiaviZY(TRONCO), { n: 9, seg: 8 });
  metti(tronco.geo, FERMO, A_MANTELLO);
  const collo = F.tubo(F.chiaviZY(CK), { n: 5, seg: 7, tappi: false });
  metti(collo.geo, COLLO, A_MANTELLO);
  // Criniera: lama sulla cresta del collo
  const crini = collo.sezioni.map((s, i, a) => {
    const q = s.c.clone().addScaledVector(s.alto, s.hs * 0.9), k = i / (a.length - 1);
    return { x: -0.02, y: q.y, z: q.z, w: 0.022 - 0.006 * k, hs: 0.04 - 0.01 * k, hi: 0.012 };
  });
  metti(F.tubo(crini, { n: 5, seg: 4 }).geo, COLLO, A_CRINI);
  const testa = TESTA.map(([t, w, hs, hi]) => { const c = F.puntoTesta(t); return { x: 0, y: c.y, z: c.z, w, hs, hi }; });
  metti(F.tubo(testa, { n: 5, seg: 6 }).geo, COLLO, A_MANTELLO);
  // Orecchie: corte da cavallo, lunghe da mulo
  for (const [lung, larg, parte] of [[0.11, 0.028, P_ORECCHIE], [0.24, 0.042, P_ORECCHIE_MULO]]) {
    for (const sx of [-1, 1]) {
      const o = new THREE.ConeGeometry(larg, lung, 3, 1);
      o.scale(1, 1, 0.55).translate(0, lung / 2, 0).rotateX(0.2).rotateZ(-0.3 * sx);
      o.translate(PERNO_TESTA.x + 0.045 * sx, PERNO_TESTA.y + 0.03, PERNO_TESTA.z + 0.03);
      metti(o, COLLO, A_MANTELLO, parte);
    }
  }
  metti(F.tubo(F.chiaviZY(CODA), { n: 4, seg: 4 }).geo, FERMO, A_CRINI);
  // Gambe: alta attorno al gomito o alla grassella, bassa anche attorno al ginocchio o al garretto; zoccolo
  [[ANTERIORE, false], [POSTERIORE, true]].forEach(([G, post], gi) => {
    for (const lato of [1, -1]) {
      const codice = gi * 2 + (lato > 0 ? 1 : 2);             // 1 AS · 2 AD · 3 PS · 4 PD
      const yG = G.y - G.L1;
      const alta = F.tubo(F.chiaviGamba(post ? F.ALTA_POST : F.ALTA_ANT, G, lato), { n: 3, seg: 5, tappi: false });
      metti(alta.geo, [codice, 0, G.y, yG], A_MANTELLO);
      const bassa = F.tubo(F.chiaviGamba(post ? F.BASSA_POST : F.BASSA_ANT, { ...G, y: yG }, lato), { n: 4, seg: 5, tappi: false });
      metti(bassa.geo, [codice, 1, G.y, yG], A_CRINI);
      const z = F.tornio([[0.045, -0.43], [0.066, -G.L2 + 0.005], [0, -G.L2]], { seg: 5 }).translate(G.x * lato, yG, G.z + 0.04);
      metti(z, [codice, 1, G.y, yG], A_ZOCCOLO);
    }
  });
  // Collare imbottito (il collare rigido da tiro del Trecento) alla base del collo, con le tirelle ai lati
  const collare = new THREE.TorusGeometry(0.17, 0.05, 3, 8);
  collare.scale(0.95, 1.25, 1).rotateX(-0.75).translate(0, 1.36, 0.6);
  metti(collare, FERMO, A_CUOIO, P_COLLARE);
  metti(box(0.5, 0.05, 0.08, 0, 1.36, 0.08), FERMO, A_CUOIO, P_COLLARE);         // sellino del tiro sulla schiena
  // Sella e gualdrappa (scorta e postiglione)
  const sez = F.tubo(F.chiaviZY(TRONCO), { n: 60, seg: 4 }).sezioni;
  const sezione = (z) => sez.reduce((b, s) => (Math.abs(s.c.z - z) < Math.abs(b.c.z - z) ? s : b), sez[0]);
  const panno = [-0.3, -0.1, 0.12, 0.34].map((z) => { const s = sezione(z); return { x: 0, y: s.c.y, z, w: s.w, hs: s.hs, hi: s.hi }; });
  metti(F.tubo(panno, { n: 4, seg: 6, arco: [Math.PI / 2 - 1.25, Math.PI / 2 + 1.25], gonfia: 0.014 }).geo, FERMO, A_STOFFA, P_SELLA);
  const sopra = sezione(0.04).c.y + sezione(0.04).hs;
  metti(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, 1.1).scale(0.19, 0.1, 0.3).translate(0, sopra - 0.05, 0.04), FERMO, A_CUOIO, P_SELLA);

  // Unione: non indicizzata, con gli attributi; le facce in basso un poco più scure (il peso lo dice)
  const parti = pezzi.map((p) => ({ ...p, geo: p.geo.index ? p.geo.toNonIndexed() : p.geo }));
  let n = 0;
  for (const p of parti) { if (!p.geo.attributes.normal) p.geo.computeVertexNormals(); n += p.geo.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), sn = new Float32Array(n * 4), ti = new Float32Array(n * 4), pa = new Float32Array(n);
  let i = 0;
  for (const p of parti) {
    const c = p.geo.attributes.position.count, na = p.geo.attributes.normal;
    pos.set(p.geo.attributes.position.array, i * 3);
    nor.set(na.array, i * 3);
    for (let k = 0; k < c; k++) {
      sn.set(p.snodo, (i + k) * 4);
      const f = p.tinta[3] > 0 ? 1 : 0.66 + 0.34 * (0.5 + 0.5 * na.getY(k));
      ti.set([p.tinta[0] * f, p.tinta[1] * f, p.tinta[2] * f, p.tinta[3]], (i + k) * 4);
      pa[i + k] = p.parte;
    }
    i += c;
    p.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aSnodo', new THREE.BufferAttribute(sn, 4));
  geo.setAttribute('aTinta', new THREE.BufferAttribute(ti, 4));
  geo.setAttribute('aParte', new THREE.BufferAttribute(pa, 1));
  return geo;
}

const vec = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

/**
 * Andatura al passo nel vertex shader (sfasamenti di ANDATURE.passo in cavallo3d.js: laterale a quattro tempi): la gamba
 * alta oscilla attorno al gomito o alla grassella, la bassa si piega quando lo zoccolo è in volo; collo e testa annuiscono.
 * Funzione a livello di modulo: il testo fa da chiave della cache dei programmi (un solo programma per la partita).
 */
function innestaAnimali(shader) {
  const A = F.ANTERIORE, P = F.POSTERIORE, PC = F.PERNO_COLLO;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec4 aSnodo;    // gamba (0 nessuna · 1–4 · 5 collo e testa), parte bassa, quota del perno, quota del ginocchio
      attribute vec4 aTinta;    // pesi di mantello, crini, stoffa; w: colore fisso (1 zoccolo · 2 cuoio · 3 ferro)
      attribute float aParte;   // 0 sempre · 1 collare · 2 sella · 3 orecchie da cavallo · 4 orecchie da mulo
      attribute vec3 iMantello;
      attribute vec3 iCrini;
      attribute vec3 iStoffa;
      attribute vec4 iMoto;     // fase del passo (cicli), moto 0–1, mulo 0/1, finimenti (0 tiro · 1 sella · 2 entrambi)
      void kdRuotaX(inout vec3 p, float y0, float z0, float a) {
        float c = cos(a), s = sin(a), dy = p.y - y0, dz = p.z - z0;
        p.y = y0 + dy * c - dz * s;
        p.z = z0 + dy * s + dz * c;
      }`)
    .replace('#include <color_vertex>', `
      vec3 kdT = aTinta.x * iMantello + aTinta.y * iCrini + aTinta.z * iStoffa;
      if (aTinta.w > 0.5) kdT = aTinta.w < 1.5 ? ${vec('#2b2520')} : aTinta.w < 2.5 ? ${vec('#4e2c14')} : ${vec('#8e949b')};
      vColor = vec4(kdT, 1.0);`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float kdA1 = 0.0, kdA2 = 0.0, kdZ = 0.0, kdY = aSnodo.z;
      int kdG = int(aSnodo.x + 0.5);
      if (kdG >= 1 && kdG <= 4) {
        float sf = kdG == 1 ? 0.25 : kdG == 2 ? 0.75 : kdG == 3 ? 0.0 : 0.5;
        float p = fract(iMoto.x + sf), amp = 0.4 * iMoto.y;
        const float APP = 0.62;
        if (p < APP) kdA1 = mix(-amp, amp, p / APP);              // a terra: lo zoccolo va indietro
        else {
          float u = (p - APP) / (1.0 - APP), e = u * u * (3.0 - 2.0 * u);
          kdA1 = mix(amp, -amp, e);                               // in volo: torna avanti
          kdA2 = aSnodo.y * sin(3.14159 * u) * 0.85 * iMoto.y;    // e si piega al ginocchio
        }
        kdZ = kdG <= 2 ? ${A.z.toFixed(3)} : ${P.z.toFixed(3)};
      } else if (kdG == 5) {                                       // collo e testa: annuiscono a ogni passo
        kdA1 = 0.05 * iMoto.y * sin(12.566 * iMoto.x) + 0.04 * iMoto.y;
        kdY = ${PC.y.toFixed(3)}; kdZ = ${PC.z.toFixed(3)};
      }
      vec3 kdN = objectNormal;
      kdRuotaX(kdN, 0.0, 0.0, kdA2);
      kdRuotaX(kdN, 0.0, 0.0, kdA1);
      objectNormal = kdN;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      kdRuotaX(transformed, aSnodo.w, kdZ, kdA2);
      kdRuotaX(transformed, kdY, kdZ, kdA1);
      float kdVedi = 1.0;
      if (aParte > 0.5 && aParte < 1.5) kdVedi = (iMoto.w < 0.5 || iMoto.w > 1.5) ? 1.0 : 0.0;
      else if (aParte > 1.5 && aParte < 2.5) kdVedi = iMoto.w > 0.5 ? 1.0 : 0.0;
      else if (aParte > 2.5 && aParte < 3.5) kdVedi = 1.0 - iMoto.z;
      else if (aParte > 3.5) kdVedi = iMoto.z;
      transformed = mix(vec3(0.0, 1.0, 0.0), transformed, kdVedi);`);
}

// Materiali: uno per tutta la partita (userData.condivisa: libera() di main.js non li cancella, niente ricompilazioni).
let _matLegno = null, _matAnimali = null;
function materialeLegno() {
  if (!_matLegno) { _matLegno = new THREE.MeshLambertMaterial({ vertexColors: true }); _matLegno.userData.condivisa = true; }
  return _matLegno;
}
function materialeAnimali() {
  if (!_matAnimali) {
    _matAnimali = new THREE.MeshLambertMaterial({ vertexColors: true });
    _matAnimali.onBeforeCompile = innestaAnimali;
    _matAnimali.userData.condivisa = true;
  }
  return _matAnimali;
}

/** InstancedMesh con capacità fissa, `count` rifatto a ogni fotogramma (solo le istanze visibili). */
function istanze(geo, mat, n, nome) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.name = nome;
  m.frustumCulled = false;               // le istanze stanno sparse: la scelta la fa `count`
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  return m;
}

// ─── Sistema dei veicoli ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Veicoli sulle strade del mondo di una Carta. Si crea una volta per Carta; a ogni Scena (anche al cambio di blocco)
 * `blocco()` dà il suolo e il centro, `update()` a ogni fotogramma.
 * @returns {{ object:THREE.Group, carta:object, blocco:Function, update:Function, spingiFuori:Function, info:Function }}
 */
export function creaCarri(carta) {
  const seme = carta.seme | 0;
  const rete = reteCarri(carta);
  const object = new THREE.Group();
  object.name = 'carri';
  const M = CARRI.massimo;

  // Pool di istanze (capacità fissa per tutta la partita)
  const mAnimali = istanze(geometriaAnimale(), materialeAnimali(), M * 5, 'carri-animali');
  const capA = M * 5;
  const iMant = new THREE.InstancedBufferAttribute(new Float32Array(capA * 3), 3);
  const iCrin = new THREE.InstancedBufferAttribute(new Float32Array(capA * 3), 3);
  const iStof = new THREE.InstancedBufferAttribute(new Float32Array(capA * 3), 3);
  const iMoto = new THREE.InstancedBufferAttribute(new Float32Array(capA * 4), 4);
  for (const a of [iMant, iCrin, iStof, iMoto]) a.setUsage(THREE.DynamicDrawUsage);
  mAnimali.geometry.setAttribute('iMantello', iMant);
  mAnimali.geometry.setAttribute('iCrini', iCrin);
  mAnimali.geometry.setAttribute('iStoffa', iStof);
  mAnimali.geometry.setAttribute('iMoto', iMoto);
  const mRuote = istanze(geometriaRuota(), materialeLegno(), M * 4, 'carri-ruote');
  const mCorde = istanze(geometriaCorda(), materialeLegno(), M * 8, 'carri-corde');
  const mCasse = {
    carrozza: istanze(geometriaCarrozza(), materialeLegno(), M, 'carri-carrozze'),
    carro: istanze(geometriaCarro(), materialeLegno(), M, 'carri-carri'),
    carretto: istanze(geometriaCarretto(), materialeLegno(), M, 'carri-carretti'),
  };
  object.add(mAnimali, mRuote, mCorde, ...Object.values(mCasse));
  for (const m of Object.values(mCasse)) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(M * 3).fill(1), 3);

  // Persone: carrettieri a piedi, postiglioni e scorte in sella (persone3d.js, una InstancedMesh per tutte)
  const fabbrica = creaPersone();
  const libere = { piedi: [], sella: [] };
  for (let i = 0; i < M; i++) {
    const g = tiro(seme, i, 3, 77);
    const colori = { veste: VESTI[Math.floor(g * VESTI.length)], pelle: PELLE[Math.floor(tiro(seme, i, 4) * PELLE.length)] };
    libere.piedi.push(fabbrica.creaPersona({ ruolo: 'popolano', colori, seme: seme + i * 31 + 1 }));
    libere.sella.push(fabbrica.creaPersona({ ruolo: 'popolano', colori, seme: seme + i * 31 + 2, posa: [0.62, 0.42] }));
    libere.sella.push(fabbrica.creaPersona({ ruolo: 'guardia', colori: { ...colori, veste: LIVREE[i % LIVREE.length] }, seme: seme + i * 31 + 3, posa: [0.62, 0.42] }));
  }
  const tutte = [...libere.piedi, ...libere.sella];
  for (const p of tutte) { p.object.visible = false; object.add(p.object); }
  const gruppoPersone = fabbrica.finisci();
  if (gruppoPersone) object.add(gruppoPersone);

  const vivi = [];                       // veicoli vivi
  const ritardi = new Map();             // id dell'orario → s di ritardo accumulato (fermi, salite), per la sessione
  const arrivati = new Set();            // id arrivati a destinazione (non tornano dall'orario)
  let ctx = null;                        // { centro, altezza(x, z), coperto(x, z) } dell'ultima Scena
  let tControllo = 0, tPrec = null, iniziale = true, contatore = 0;
  const stat = { vivi: 0, disegnati: 0, animali: 0, persone: 0, fermi: 0, orario: 0 };

  /** Rotte vicine al punto (m del mondo). */
  const rotteVicine = (x, z, r) => rete.lista.filter((q) => x > q.riquadro[0] - r && x < q.riquadro[2] + r && z > q.riquadro[1] - r && z < q.riquadro[3] + r);

  /** Crea un veicolo vivo da una partenza dell'orario (o da un veicolo che prosegue oltre un incrocio). */
  function nasce(d) {
    const T = TIPI[d.tipo];
    const r = (i) => tiro(d.seme, i, 5);
    const nAnimali = T.animali[0] + Math.floor(r(1) * (T.animali[1] - T.animali[0] + 1));
    const specie = d.tipo === 'carretto' ? (r(2) < 0.6 ? 'mulo' : 'asino') : 'cavallo';
    const mant = MANTELLI[specie][Math.floor(r(3) * MANTELLI[specie].length)];
    const livrea = LIVREE[Math.floor(r(4) * LIVREE.length)];
    const animali = [];
    for (let i = 0; i < nAnimali; i++) {
      // Cavalli della stessa muta di solito dello stesso mantello; ogni tanto uno diverso
      const m = r(10 + i) < 0.7 ? mant : MANTELLI[specie][Math.floor(r(20 + i) * MANTELLI[specie].length)];
      const sc = specie === 'cavallo' ? 1.02 + 0.06 * r(30 + i) : specie === 'mulo' ? 0.9 : 0.74;
      animali.push({ off: 1.25 + i * T.passo, specie, scala: sc, mantello: new THREE.Color(m[0]), crini: new THREE.Color(m[1]),
        finimenti: d.tipo === 'carrozza' && i === nAnimali - 1 ? 2 : 0, fase: r(40 + i) });
    }
    const ultimo = animali[nAnimali - 1].off;
    const v = {
      id: d.id, n: ++contatore, tipo: d.tipo, T, rotta: d.rotta, s: d.s, verso: d.verso, vNom: d.vel, v: d.vel * 0.8,
      libero: !!d.libero, partenza: d.tPartenza, prec: null, animali, ruote: 0, fermo: 0, nascosto: false,
      asse: ultimo + T.stacco,              // m di tracciato dal primo animale all'asse (anteriore per i carri a 4 ruote)
      tinta: new THREE.Color().setHSL(0, 0, 0.88 + 0.2 * r(5)),
      livrea: new THREE.Color(livrea), persone: [], scorta: null, cerchi: [],
    };
    if (d.tipo === 'carrozza') {
      v.scorta = { off: v.asse + T.interasse + 3.2, scala: 1.04, mantello: new THREE.Color(MANTELLI.cavallo[Math.floor(r(6) * 6)][0]),
        crini: new THREE.Color('#17110d'), finimenti: 1, fase: r(7) };
      v.persone.push({ p: libere.sella.find((q, i) => i % 2 === 0 && !q.usata), su: animali[nAnimali - 1] });
      v.persone.push({ p: libere.sella.find((q, i) => i % 2 === 1 && !q.usata), su: v.scorta });
    } else {
      v.persone.push({ p: libere.piedi.find((q) => !q.usata), a: { avanti: 0.85, lato: d.tipo === 'carretto' ? 0.7 : 0.8 } });
    }
    for (const q of v.persone) if (q.p) { q.p.usata = true; q.p.object.visible = false; }
    v.persone = v.persone.filter((q) => q.p);
    vivi.push(v);
    return v;
  }

  function muore(v, arrivato = false) {
    const i = vivi.indexOf(v);
    if (i >= 0) vivi.splice(i, 1);
    for (const q of v.persone) { q.p.usata = false; q.p.object.visible = false; }
    if (v.libero) return;
    if (arrivato) { arrivati.add(v.id); ritardi.delete(v.id); return; }
    // Ritardo accumulato rispetto all'orario: la prossima volta che il blocco lo vede, è dove deve essere
    const percorso = v.verso > 0 ? v.s : v.rotta.L - v.s;
    ritardi.set(v.id, Math.max(0, v.partito - percorso / v.vNom));
  }

  const _p = { x: 0, z: 0, h: 0, tx: 0, tz: 1, k: 1 }, _q = { x: 0, z: 0, h: 0, tx: 0, tz: 1, k: 1 };

  /**
   * Punto della strada `dietro` m di tracciato alle spalle del primo animale (negativo: davanti), con lo spostamento
   * sulla corsia: out.x, out.z (mondo), out.h, out.fx, out.fz (verso di marcia).
   */
  function puntoDi(v, dietro, out) {
    puntoRotta(v.rotta, v.s, _q);
    let r = v.rotta, s = v.s - v.verso * dietro * _q.k, verso = v.verso;
    // Ancora sulla rotta di prima (il primo animale ha appena passato un incrocio)
    if ((s < 0 || s > r.L) && v.prec) {
      const oltre = s < 0 ? -s : s - r.L;
      r = v.prec.rotta; verso = v.prec.verso;
      s = v.prec.s - verso * oltre;
    }
    puntoRotta(r, s, out);
    out.fx = out.tx * verso; out.fz = out.tz * verso;
    const corsia = Math.max(0, (r.classe === 'maestra' ? 3.5 : 2.25) - v.T.mezza - 0.35);
    // A sinistra della carreggiata: sinistra di (fx, fz) è (fz, −fx), come in cavallo3d.js
    out.x += out.fz * corsia; out.z -= out.fx * corsia;
    if (ctx) {
      const hh = ctx.altezza(out.x, out.z);
      if (Number.isFinite(hh)) out.h = hh;
    }
    if (!Number.isFinite(out.h)) out.h = 0;
    return out;
  }

  /** Il primo animale è arrivato al capo della rotta: entra nel borgo, prosegue oltre l'incrocio o sparisce. */
  function capolinea(v) {
    const capo = v.verso > 0 ? 1 : 0;
    if (v.rotta.meta[capo]) { muore(v, true); return; }
    const scelte = v.rotta.vicini[capo].filter((c) => c.rotta.classe === v.rotta.classe || v.tipo !== 'carrozza');
    if (!scelte.length) { muore(v, true); return; }
    const c = scelte[Math.floor(tiro(v.n, seme, 9) * scelte.length) % scelte.length];
    const oltre = v.verso > 0 ? v.s - v.rotta.L : -v.s;
    v.prec = { rotta: v.rotta, s: v.verso > 0 ? v.rotta.L : 0, verso: v.verso };
    v.rotta = c.rotta;
    v.verso = c.capo === 0 ? 1 : -1;
    v.s = c.capo === 0 ? oltre : c.rotta.L - oltre;
    v.libero = true;                       // fuori dall'orario: quando lascia la vita, non lascia ritardi
  }

  /** Le sagome (cerchi nel piano, m del mondo) di un veicolo, per le collisioni e per chi sbarra la strada. */
  function sagome(v) {
    v.cerchi.length = 0;
    for (const a of v.animali) v.cerchi.push({ x: a.x, z: a.z, r: 0.5 * a.scala, fx: a.fx, fz: a.fz, lungo: 0.6 * a.scala });
    if (v.scorta) v.cerchi.push({ x: v.scorta.x, z: v.scorta.z, r: 0.5, fx: v.scorta.fx, fz: v.scorta.fz, lungo: 0.6 });
    const c = v.cassa;
    if (c) {
      const lungo = v.tipo === 'carretto' ? 0.9 : v.tipo === 'carrozza' ? 2.35 : 1.7;
      v.cerchi.push({ x: c.x, z: c.z, r: v.T.mezza, fx: c.fx, fz: c.fz, lungo });
    }
    for (const q of v.persone) if (q.a) v.cerchi.push({ x: q.x, z: q.z, r: 0.3, fx: 1, fz: 0, lungo: 0 });
  }

  /** Distanza (m) del punto dalla sagoma: capsula di raggio r lungo (fx, fz), mezza lunghezza `lungo`. */
  function distanzaSagoma(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    const t = clamp(dx * c.fx + dz * c.fz, -c.lungo, c.lungo);
    return Math.hypot(dx - c.fx * t, dz - c.fz * t) - c.r;
  }

  /** Il cavaliere, il cavallo o un altro veicolo nello stesso verso sbarrano la strada davanti? */
  function sbarrato(v, mobili) {
    const lato = v.T.mezza + CARRI.margine;
    const P = _p;
    for (let d = -0.6; d >= -CARRI.davanti; d -= 1) {
      puntoDi(v, d, P);
      for (const o of mobili) if (Math.hypot(o.x - P.x, o.z - P.z) < lato + o.r) return true;
      for (const w of vivi) {
        if (w === v || w.nascosto || !w.cerchi.length) continue;
        if (w.fx0 * v.fx0 + w.fz0 * v.fz0 < 0.3) continue;   // in senso opposto: corre sull'altra corsia
        for (const c of w.cerchi) if (distanzaSagoma(c, P.x, P.z) < lato - 0.2) return true;
      }
    }
    // Qualcuno a ridosso dei fianchi (girando in curva il carro lo toccherebbe)
    for (const c of v.cerchi) for (const o of mobili) if (distanzaSagoma(c, o.x, o.z) < o.r + 0.15) return true;
    return false;
  }

  /** Legge l'orario: fa nascere i veicoli che entrano nel raggio della vita, nei limiti decisi. */
  function leggiOrario(t, ora, kx, kz) {
    const presenza = presenzaDelGiorno(ora);
    const giaVivi = new Set(vivi.map((v) => v.id));
    const candidati = [];
    for (const r of rotteVicine(kx, kz, CARRI.vivi)) {
      for (const d of orarioRotta(seme, r, t, ritardi)) {
        if (giaVivi.has(d.id) || arrivati.has(d.id) || d.presenza >= presenza) continue;
        puntoRotta(r, d.s, _p);
        const dist = Math.hypot(_p.x - kx, _p.z - kz);
        if (dist > CARRI.vivi) continue;
        // Durante il gioco nasce solo fuori vista, salvo chi esce appena da una porta
        const appenaUscito = d.partito < CARRI.uscita && r.meta[d.verso > 0 ? 0 : 1];
        if (!iniziale && dist < CARRI.comparsa && !appenaUscito) continue;
        candidati.push({ d, dist });
      }
    }
    stat.orario = candidati.length + vivi.length;
    candidati.sort((a, b) => a.dist - b.dist);
    for (const { d } of candidati) {
      if (vivi.length >= M) break;
      nasce(d);
    }
    iniziale = false;
  }

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const frustum = new THREE.Frustum(), _sfera = new THREE.Sphere(), _pm = new THREE.Matrix4();

  /** Pone un animale nel suo punto: direzione della strada, beccheggio dalla quota davanti e dietro. */
  function poniAnimale(v, a, dietro) {
    puntoDi(v, dietro, _p);
    a.x = _p.x; a.z = _p.z; a.h = _p.h; a.fx = _p.fx; a.fz = _p.fz;
    const hA = puntoDi(v, dietro - 0.6 * a.scala, _q).h;
    const hP = puntoDi(v, dietro + 0.6 * a.scala, _q).h;
    a.beccheggio = Math.atan2(hA - hP, 1.2 * a.scala);
    a.dir = Math.atan2(a.fx, a.fz);
  }

  function matriceAnimale(a, c) {
    _e.set(-a.beccheggio, a.dir, 0);
    _qt.setFromEuler(_e);
    const mulo = a.specie !== 'cavallo';
    _s.set(a.scala * (mulo ? 0.9 : 1), a.scala, a.scala * (mulo ? 0.95 : 1));
    _m.compose(_v.set(a.x - c.x, a.h, a.z - c.z), _qt, _s);
    return _m;
  }

  /**
   * Un fotogramma: movimento, fermate, nascite e morti, poi le istanze delle mesh.
   * @param {number} dt s (0 in pausa o nel percorso di prova: tutto fermo)
   * @param {{ tempo:number, ora:number, cavaliere:{x,z}, cavallo?:{x,z}|null, camera:THREE.Camera, centro:{x,z} }} s
   *   cavaliere e cavallo in coordinate locali del blocco; tempo in s di Scena (calendario / rapporto del tempo)
   */
  function update(dt, s) {
    if (!ctx) return;
    const c = s.centro;
    ctx.centro = c;
    const kx = s.cavaliere.x + c.x, kz = s.cavaliere.z + c.z;
    // Salto del tempo (riposo, sonno): i veicoli vivi tornano all'orario, che li rimette dove devono essere. I salti brevi
    // (parlare, contrattare: pochi minuti di gioco) no: i veicoli restano dove sono, con un po' di ritardo in più.
    if (tPrec != null && Math.abs(s.tempo - tPrec - dt) > CARRI.saltoTempo) {
      for (const v of [...vivi]) muore(v);
      iniziale = true;
    }
    tPrec = s.tempo;
    if ((tControllo -= dt) <= 0 || iniziale) {
      tControllo = CARRI.controllo;
      for (const v of [...vivi]) {
        puntoDi(v, 0, _p);
        if (Math.hypot(_p.x - kx, _p.z - kz) > CARRI.vivi + 100) muore(v);
      }
      leggiOrario(s.tempo, s.ora, kx, kz);
    }
    const mobili = [{ x: kx, z: kz, r: 0.45 }];
    if (s.cavallo) mobili.push({ x: s.cavallo.x + c.x, z: s.cavallo.z + c.z, r: 1.05 });

    stat.fermi = 0;
    for (const v of [...vivi]) {
      v.partito = s.tempo - v.partenza;
      puntoDi(v, 0, _p);
      v.fx0 = _p.fx; v.fz0 = _p.fz;
      // Lontano dal cavaliere: solo il movimento lungo la strada (niente pose, sagome né fermate)
      const lontano = Math.hypot(_p.x - kx, _p.z - kz) > CARRI.disegno + 150;
      if (dt > 0) {
        // Velocità: pendenza sotto il primo animale, fermata se la strada è sbarrata
        const h0 = _p.h, h1 = puntoDi(v, -3, _q).h, g = (h1 - h0) / 3;
        const ferma = !lontano && !v.nascosto && sbarrato(v, mobili);
        const voluta = ferma ? 0 : v.vNom * 1.08 * fattorePendenza(g);
        const acc = voluta > v.v ? CARRI.accelerazione : CARRI.frenata;
        v.v += clamp(voluta - v.v, -acc * dt, acc * dt);
        if (v.v < 0.01 && voluta === 0) v.v = 0;
        v.fermo = v.v < 0.05 ? v.fermo + dt : 0;
        if (v.fermo > 0) stat.fermi++;
        const ds = v.v * dt;
        puntoRotta(v.rotta, v.s, _q);
        v.s += v.verso * ds * _q.k;
        if (v.prec && Math.abs(v.s - (v.verso > 0 ? 0 : v.rotta.L)) > 40) v.prec = null;   // il treno ha passato l'incrocio
        if (v.s < 0 || v.s > v.rotta.L) { capolinea(v); if (!vivi.includes(v)) continue; }
        v.ruote += ds / v.T.ruota;
        for (const a of v.animali) a.fase += ds / (1.5 * a.scala);
        if (v.scorta) v.scorta.fase += ds / 1.5;
        for (const q of v.persone) q.p.update(dt, { modo: q.a && v.v > 0.1 ? 'cammina' : 'fermo', velocita: v.v });
      }
      if (lontano) {
        puntoDi(v, 0, _p);
        v.cassa = { x: _p.x, z: _p.z, h: _p.h, fx: _p.fx, fz: _p.fz, beccheggio: 0, dir: 0 };
        v.cerchi.length = 0;
        v.lontano = true;
        continue;
      }
      v.lontano = false;
      // Pose (anche da fermi: il blocco cambia, la quota del suolo con lui)
      for (const a of v.animali) poniAnimale(v, a, a.off);
      if (v.scorta) poniAnimale(v, v.scorta, v.scorta.off);
      const anteriore = puntoDi(v, v.asse, { x: 0, z: 0, h: 0 });
      if (v.tipo === 'carretto') {
        // Due ruote: la cassa poggia sull'asse e le stanghe sul mulo
        const a = v.animali[0];
        const yAtt = a.h + 0.95 * a.scala, yAsse = anteriore.h + v.T.ruota;
        const dx = a.x - anteriore.x, dz = a.z - anteriore.z, dist = Math.hypot(dx, dz) || 1;
        v.cassa = { x: anteriore.x, z: anteriore.z, h: anteriore.h,
          fx: dx / dist, fz: dz / dist, beccheggio: Math.atan2(yAtt - yAsse - 0.2, dist), dir: Math.atan2(dx, dz) };
      } else {
        const post = puntoDi(v, v.asse + v.T.interasse, { x: 0, z: 0, h: 0 });
        const dx = anteriore.x - post.x, dz = anteriore.z - post.z, dist = Math.hypot(dx, dz) || 1;
        v.cassa = { x: (anteriore.x + post.x) / 2, z: (anteriore.z + post.z) / 2, h: (anteriore.h + post.h) / 2,
          fx: dx / dist, fz: dz / dist, beccheggio: Math.atan2(anteriore.h - post.h, dist), dir: Math.atan2(dx, dz) };
      }
      // Persone a piedi accanto alla testa del primo animale
      for (const q of v.persone) {
        if (!q.a) continue;
        const a = v.animali[0];
        q.x = a.x + a.fx * q.a.avanti + a.fz * q.a.lato;
        q.z = a.z + a.fz * q.a.avanti - a.fx * q.a.lato;
      }
      // Dentro un villaggio la strada è tagliata dalle case: il veicolo passa tra le vie, non si vede
      v.nascosto = !!ctx.coperto && ctx.coperto(v.cassa.x - c.x, v.cassa.z - c.z) > 0.5;
      sagome(v);
    }
    disegna(s);
    stat.vivi = vivi.length;
  }

  /** Riempie le istanze con i veicoli visibili (entro `disegno` m dalla camera e nell'inquadratura). */
  function disegna(s) {
    const c = s.centro, cam = s.camera;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(_pm);
    let na = 0, nr = 0, nc = 0;
    const nCasse = { carrozza: 0, carro: 0, carretto: 0 };
    stat.disegnati = 0; stat.persone = 0;
    for (const p of tutte) p.object.visible = false;
    for (const v of vivi) {
      const cx = v.cassa.x - c.x, cz = v.cassa.z - c.z;
      const vicino = Math.hypot(cx - cam.position.x, cz - cam.position.z) < CARRI.disegno;
      _sfera.center.set(cx, v.cassa.h + 1, cz); _sfera.radius = 6 + v.animali.length * 2.7;
      if (v.lontano || v.nascosto || !vicino || !frustum.intersectsSphere(_sfera)) continue;
      stat.disegnati++;
      // Animali
      for (const a of [...v.animali, ...(v.scorta ? [v.scorta] : [])]) {
        if (na >= mAnimali.instanceMatrix.count) break;
        matriceAnimale(a, c).toArray(mAnimali.instanceMatrix.array, na * 16);
        a.mantello.toArray(iMant.array, na * 3);
        a.crini.toArray(iCrin.array, na * 3);
        v.livrea.toArray(iStof.array, na * 3);
        iMoto.array[na * 4] = a.fase;
        iMoto.array[na * 4 + 1] = clamp(v.v / 0.5, 0, 1);
        iMoto.array[na * 4 + 2] = a.specie === 'cavallo' ? 0 : 1;
        iMoto.array[na * 4 + 3] = a.finimenti;
        na++;
      }
      // Cassa
      const K = v.cassa, mC = mCasse[v.tipo];
      _e.set(-K.beccheggio, K.dir, 0);
      _qt.setFromEuler(_e);
      _m2.compose(_v.set(K.x - c.x, K.h, K.z - c.z), _qt, _s.set(1, 1, 1));
      _m2.toArray(mC.instanceMatrix.array, nCasse[v.tipo] * 16);
      v.tinta.toArray(mC.instanceColor.array, nCasse[v.tipo] * 3);
      nCasse[v.tipo]++;
      // Ruote nel sistema della cassa
      const T = v.T, R = T.ruota;
      const assi = v.tipo === 'carretto' ? [0] : [T.interasse / 2, -T.interasse / 2];
      for (const zA of assi) {
        for (const sx of [-1, 1]) {
          _m.multiplyMatrices(_m2, _m3.makeTranslation(T.carreggiata * sx, R, zA));
          _m.multiply(_m3.makeRotationX(v.ruote));
          _m.scale(_s.set(R, R, R));
          _m.toArray(mRuote.instanceMatrix.array, nr * 16);
          nr++;
        }
      }
      // Tirelle: dal collare di ogni animale a quello dell'animale dietro, dall'ultimo al bilancino in punta al timone
      // (il carretto ha le stanghe, nella sua geometria)
      const A = v.animali;
      for (let i = 0; i < A.length; i++) {
        if (i + 1 === A.length && v.tipo === 'carretto') break;
        for (const sx of [-1, 1]) {
          if (nc >= mCorde.instanceMatrix.count) break;
          puntoCollare(A[i], sx, c, _a);
          if (i + 1 < A.length) puntoCollare(A[i + 1], sx, c, _b);
          else _b.set(0.36 * sx, R - 0.05, T.interasse / 2 + TIMONE[v.tipo]).applyMatrix4(_m2);
          corda(_a, _b, mCorde, nc++);
        }
      }
      // Persone
      for (const q of v.persone) {
        const o = q.p.object;
        o.visible = true;
        stat.persone++;
        if (q.a) {
          o.position.set(q.x - c.x, ctx.altezza(q.x, q.z), q.z - c.z);
          if (!Number.isFinite(o.position.y)) o.position.y = v.animali[0].h;
          o.rotation.set(0, v.animali[0].dir, 0);
        } else {
          const a = q.su;
          // In sella: l'anca ~8 cm sopra il seggio della sella (come il cavaliere in cavallo3d.js)
          const Ma = matriceAnimale(a, c);              // prima la matrice: usa _v al suo interno
          _v.set(0, 1.44, 0.02).applyMatrix4(Ma);
          o.position.set(_v.x, _v.y - 0.9 * q.p.altezza, _v.z);
          o.rotation.set(0, a.dir, 0);
        }
      }
    }
    mAnimali.count = na; mRuote.count = nr; mCorde.count = nc;
    for (const t in mCasse) { mCasse[t].count = nCasse[t]; mCasse[t].instanceMatrix.needsUpdate = true; mCasse[t].instanceColor.needsUpdate = true; }
    for (const m of [mAnimali, mRuote, mCorde]) m.instanceMatrix.needsUpdate = true;
    for (const a of [iMant, iCrin, iStof, iMoto]) a.needsUpdate = true;
    stat.animali = na;
  }

  /** Attacco della tirella al collare di un animale, lato sx (in coordinate locali del blocco). */
  function puntoCollare(a, sx, c, out) {
    return out.set(0.3 * sx, 1.18, 0.5).applyMatrix4(matriceAnimale(a, c));
  }

  const _z = new THREE.Vector3(0, 0, 1);
  function corda(A, B, mesh, i) {
    _v.subVectors(B, A);
    const l = _v.length();
    _qt.setFromUnitVectors(_z, _v.divideScalar(l || 1));
    _m.compose(A, _qt, _s.set(0.03, 0.03, l));
    _m.toArray(mesh.instanceMatrix.array, i * 16);
  }

  return {
    object, carta,
    /**
     * Nuova Scena o cambio di blocco. `altezza(x, z)`: quota del suolo in m del MONDO (NaN fuori dal blocco: si usa la
     * quota della strada); `coperto(x, z)`: copertura dei villaggi in coordinate LOCALI. `iniziale`: la Scena non si
     * vede ancora (caricamento), i veicoli dell'orario possono nascere anche vicino.
     */
    blocco({ altezza, coperto = null, iniziale: ini = false }) {
      ctx = { altezza, coperto };
      if (ini) iniziale = true;
    },
    update,
    /** Collisioni semplici con il cavaliere e il cavallo (coordinate locali del blocco). */
    spingiFuori(x, z, raggio) {
      if (!ctx || !vivi.length) return null;
      const c = ctx.centro;
      if (!c) return null;
      let mosso = false;
      for (const v of vivi) {
        if (v.nascosto) continue;
        for (const s of v.cerchi) {
          const lx = s.x - c.x, lz = s.z - c.z;
          if (Math.abs(lx - x) > s.lungo + s.r + raggio || Math.abs(lz - z) > s.lungo + s.r + raggio) continue;
          const d = distanzaSagoma({ ...s, x: lx, z: lz }, x, z);
          if (d >= raggio) continue;
          // Spinto fuori lungo la normale della capsula
          const t = clamp((x - lx) * s.fx + (z - lz) * s.fz, -s.lungo, s.lungo);
          const px = lx + s.fx * t, pz = lz + s.fz * t;
          let nx = x - px, nz = z - pz;
          const l = Math.hypot(nx, nz);
          if (l < 1e-6) { nx = s.fz; nz = -s.fx; } else { nx /= l; nz /= l; }
          x = px + nx * (s.r + raggio); z = pz + nz * (s.r + raggio);
          mosso = true;
        }
      }
      return mosso ? { x, z } : null;
    },
    /** Numeri per il pannello F3 e le prove. */
    info: () => ({ ...stat, rotte: rete.lista.length, ritardi: ritardi.size, arrivati: arrivati.size,
      tipi: vivi.map((v) => `${v.tipo}${v.animali.length}${v.fermo > 0 ? ' fermo' : ''}`) }),
    /** Veicoli vivi (per le prove: posizione nel mondo del primo animale, tipo, rotta). */
    get vivi() { return vivi; },
  };
}
