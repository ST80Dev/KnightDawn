// Knight Dawn — approdi nelle Scene: pontile di legno con la barca ormeggiata (traghetti di lago e rotte per mare) e
// barca tirata in secca (barcaiolo). Richiesta dell'utente (novembre 2026): «anche un pontile nella scena»; sulla Carta
// c'erano rotte e ancore, sul posto nulla. Il generatore (js/mondo/strade.js, `suRiva`) dà per ogni capo di una tratta il
// punto di riva vero `px, pz` (m del mondo) e il verso dell'acqua `vx, vz`: qui si costruisce soltanto.
//
// Regole del documento (docs/ESPLORAZIONE_3D.md, «Rotte per mare e barcaiolo»): il barcaiolo è una barca a noleggio,
// «nessun molo, nessun orario». Perciò: traghetto e rotta per mare → pontile e barca; barcaiolo → barca in secca dal lato
// del villaggio, un palo d'ormeggio dal lato dell'isola.
//
// Prestazioni (docs/PRESTAZIONI.md): due chiamate per pontile (legno fermo, barca che dondola), qualche centinaio di
// triangoli; materiali creati una volta sola, al primo uso. Ci si cammina sopra: `quotaSuolo` dà l'impalcato a
// componiSuolo (terrain.js), come i ponti delle strade.
//
// Stessa interfaccia dei villaggi (villaggio3d.js): object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci,
// sorgenti, misure, edifici, raggio, sito.

import * as THREE from 'three';
import { livelloLago } from '../mondo/scena.js';
import { hash2 } from '../mondo/rumore.js';

export const APPRODI = {
  pontile: {
    largo: 2.4,               // m
    sopra: 0.75,              // m: impalcato sopra il pelo dell'acqua
    lungo: [8, 22],           // m: dalla riva verso il largo, finché l'acqua non è profonda `fondale` m
    fondale: 1.1,
    aTerra: 6,                // m: al più tanto dentro terra, finché il terreno non arriva all'impalcato
    asse: 0.32,               // m: larghezza di una tavola
    spessore: 0.09,
    pali: 3,                  // m fra una coppia di pali e la successiva
    palo: 0.2,                // m: lato del palo
    bitta: 0.9,               // m sopra l'impalcato, ai pali di testa
  },
  barca: { lunga: 5.2, larga: 1.6, alta: 0.7, dondola: 0.06, rolla: 0.05, periodo: 3.4 },
  secca: { dentro: 3.5, inclina: 0.18 },   // barca del barcaiolo: m dentro terra dalla riva, rollio a riposo (rad)
  doppioni: 30,               // m: due capi di tratta più vicini di così sono lo stesso approdo
  colori: { tavole: '#6e5640', pali: '#3f2c1d', scafo: '#4a3424', bordo: '#2f2117', fondo: '#5b4632' },
};

let _mat = null;
/** Materiali condivisi da tutti gli approdi, creati al primo uso: colore per vertice, ombreggiatura piatta come il resto
 * del legno. La barca è a doppia faccia: lo scafo è un guscio aperto e se ne vede anche l'interno. */
function materiali() {
  if (!_mat) _mat = {
    legno: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    barca: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  };
  for (const m of Object.values(_mat)) m.userData.condivisa = true;   // main.js (libera) non li butta al cambio di blocco
  return _mat;
}

const colore = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

/** Scatola orientata: centro (x, y, z), mezze misure lungo l'asse `u` (orizzontale), in alto e di traverso. */
function scatola(parti, cx, cy, cz, ux, uz, a, h, b, rgb) {
  const g = new THREE.BoxGeometry(2 * a, 2 * h, 2 * b);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(-uz, ux)));
  g.translate(cx, cy, cz);
  parti.push(conColore(g.index ? g.toNonIndexed() : g, rgb));
}

function conColore(g, rgb) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Unisce geometrie non indicizzate con posizione, normale e colore. */
function unisci(parti) {
  let n = 0;
  for (const g of parti) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parti) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Scafo di una barca a remi, nelle coordinate della barca: x lungo lo scafo (prua a +x), y in alto (0 = linea
 * dell'acqua), z di traverso. Fianchi a doppia curvatura (pianta a fuso, fondo più stretto della falchetta), fondo
 * piatto dentro, due banchi. Colore per vertice.
 */
function geoBarca(B) {
  const C = APPRODI.colori, parti = [];
  const n = 10, L = B.lunga / 2, W = B.larga / 2, H = B.alta;
  const largo = (t) => W * Math.pow(Math.max(0, 1 - t * t), 0.55);           // t ∈ [-1, 1]
  const pos = [], col = [];
  const tri = (a, b, c, rgb) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) col.push(...rgb); };
  const scafo = colore(C.scafo), bordo = colore(C.bordo), dentro = colore(C.fondo, 0.8);
  const yF = -0.25, yS = H - 0.25;                                              // fondo e falchetta rispetto all'acqua
  for (let i = 0; i < n; i++) {
    const t0 = -1 + 2 * i / n, t1 = -1 + 2 * (i + 1) / n;
    const x0 = t0 * L, x1 = t1 * L;
    const sa0 = largo(t0), sa1 = largo(t1), fa0 = sa0 * 0.55, fa1 = sa1 * 0.55;
    const ya0 = yS + 0.12 * t0 * t0, ya1 = yS + 0.12 * t1 * t1;                 // falchetta che sale a prua e poppa
    for (const s of [1, -1]) {
      const A = [x0, ya0, s * sa0], Bq = [x1, ya1, s * sa1], Cq = [x1, yF, s * fa1], D = [x0, yF, s * fa0];
      if (s > 0) { tri(A, D, Bq, scafo); tri(Bq, D, Cq, scafo); } else { tri(A, Bq, D, scafo); tri(Bq, Cq, D, scafo); }
      // interno del fianco, più scuro (si vede dall'alto)
      const ai = [x0, ya0, s * sa0 * 0.9], bi = [x1, ya1, s * sa1 * 0.9], ci = [x1, yF + 0.12, s * fa1 * 0.9], di = [x0, yF + 0.12, s * fa0 * 0.9];
      if (s > 0) { tri(ai, bi, di, dentro); tri(bi, ci, di, dentro); } else { tri(ai, di, bi, dentro); tri(bi, di, ci, dentro); }
    }
    // fondo esterno e pagliolo interno
    tri([x0, yF, fa0], [x1, yF, -fa1], [x1, yF, fa1], scafo); tri([x0, yF, fa0], [x0, yF, -fa0], [x1, yF, -fa1], scafo);
    const yP = yF + 0.12;
    tri([x0, yP, fa0 * 0.9], [x1, yP, fa1 * 0.9], [x1, yP, -fa1 * 0.9], dentro); tri([x0, yP, fa0 * 0.9], [x1, yP, -fa1 * 0.9], [x0, yP, -fa0 * 0.9], dentro);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  parti.push(g);
  // banchi e falchetta di prua (tavole di traverso)
  for (const t of [-0.35, 0.2]) {
    const w = largo(t) * 0.92;
    scatola(parti, t * L, yS - 0.18, 0, 1, 0, 0.16, 0.035, w, bordo);
  }
  return unisci(parti);
}

/** Capi di tratta da costruire nel blocco: uno per approdo (i doppioni, stesso villaggio su più tratte, si uniscono). */
export function approdiDelBlocco(carta, cx, cz, half, margine = 40) {
  const tutti = [];
  for (const t of carta?.traghetti ?? []) {
    for (const [a, lato] of [[t.a, 'a'], [t.b, 'b']]) {
      if (!a.riva) continue;
      if (Math.abs(a.px - cx) > half + margine || Math.abs(a.pz - cz) > half + margine) continue;
      const tipo = t.tipo === 'barcaiolo' ? (lato === 'a' ? 'secca' : 'palo') : 'pontile';
      tutti.push({ a, tipo, lago: t.tipo !== 'mare' });
    }
  }
  // Prima i pontili: dove c'è già un pontile, la barca del barcaiolo sta ormeggiata lì e non serve altro.
  const peso = { pontile: 0, secca: 1, palo: 2 };
  tutti.sort((u, v) => peso[u.tipo] - peso[v.tipo]);
  const out = [];
  for (const q of tutti) {
    if (out.some((o) => Math.hypot(o.a.px - q.a.px, o.a.pz - q.a.pz) < APPRODI.doppioni)) continue;
    out.push({ ...q, id: out.length });
  }
  return out;
}

/**
 * Pontile, barca in secca o palo d'ormeggio di un approdo. `suolo.getHeight(x, z)` in coordinate del blocco; (cx, cz)
 * centro del blocco nel mondo; `ap` da approdiDelBlocco.
 */
export function creaApprodo(suolo, ap, cx, cz, carta) {
  const P = APPRODI.pontile, C = APPRODI.colori, a = ap.a;
  const sx = a.px - cx, sz = a.pz - cz, vx = a.vx, vz = a.vz, lx = -vz, lz = vx;
  const seme = hash2(Math.floor(a.px), Math.floor(a.pz), (carta.seme ?? 1) ^ 0x5017e) >>> 0;
  const rnd = (k) => (hash2(seme, k, 0x2b) >>> 0) / 4294967296;
  const quota = (x, z) => suolo.getHeight(x, z);
  // Pelo dell'acqua: il mare è a zero; un lago ha il suo livello (cercato verso il largo, dove c'è di sicuro).
  let pelo = 0;
  if (ap.lago) {
    for (const d of [10, 20, 35, 5]) {
      const l = livelloLago(carta, a.px + vx * d, a.pz + vz * d);
      if (!Number.isNaN(l)) { pelo = l; break; }
    }
  }
  const parti = [], barche = [];
  const oggetto = new THREE.Group();
  oggetto.name = `approdo-${ap.id}`;
  let impalcato = null;                                   // { y, d0, d1 } lungo il verso dell'acqua
  let barca = null, baseBarca = null;

  if (ap.tipo === 'pontile') {
    const y = pelo + P.sopra;
    // A terra: indietro finché il terreno non arriva all'impalcato (così ci si sale senza gradino).
    let d0 = -1;
    for (let d = 0; d <= P.aTerra; d += 0.5) { d0 = -d; if (quota(sx - vx * d, sz - vz * d) >= y - 0.12) break; }
    // Al largo: finché l'acqua non è abbastanza profonda per la barca.
    let d1 = P.lungo[0];
    while (d1 < P.lungo[1] && quota(sx + vx * d1, sz + vz * d1) > pelo - P.fondale) d1 += 1;
    impalcato = { y, d0, d1 };
    const tav = colore(C.tavole), pal = colore(C.pali);
    // Tavole di traverso, ognuna un poco diversa di tinta e di quota (legno vecchio).
    for (let d = d0 + P.asse / 2, k = 0; d < d1; d += P.asse + 0.03, k++) {
      const t = 0.82 + 0.3 * rnd(k);
      scatola(parti, sx + vx * d, y - P.spessore / 2 + 0.015 * (rnd(k + 500) - 0.5), sz + vz * d, lx, lz,
        P.largo / 2 + 0.06 * (rnd(k + 900) - 0.5), P.spessore / 2, P.asse / 2, [tav[0] * t, tav[1] * t, tav[2] * t]);
    }
    // Due correnti sotto le tavole, per il lungo.
    for (const s of [-1, 1]) {
      const o = s * (P.largo / 2 - 0.25), m = (d0 + d1) / 2;
      scatola(parti, sx + vx * m + lx * o, y - P.spessore - 0.09, sz + vz * m + lz * o, vx, vz, (d1 - d0) / 2, 0.09, 0.08, pal);
    }
    // Pali a coppie, dal fondale all'impalcato; quelli di testa salgono come bitte.
    const pali = [];
    for (let d = Math.max(d0 + 0.6, 1); d <= d1 - 0.2 + 1e-6; d += P.pali) pali.push(d);
    if (d1 - pali[pali.length - 1] > 0.8) pali.push(d1 - 0.2);
    pali.forEach((d, k) => {
      for (const s of [-1, 1]) {
        const x = sx + vx * d + lx * s * (P.largo / 2 - 0.1), z = sz + vz * d + lz * s * (P.largo / 2 - 0.1);
        const piede = Math.min(quota(x, z), pelo) - 0.5, cima = y + (k === pali.length - 1 ? P.bitta : -0.05);
        scatola(parti, x, (piede + cima) / 2, z, vx, vz, P.palo / 2, (cima - piede) / 2, P.palo / 2, pal);
      }
    });
    // Barca ormeggiata di fianco alla testa del pontile, parallela al pontile, lato a caso.
    const lato = rnd(7) < 0.5 ? -1 : 1, B = APPRODI.barca;
    const dB = d1 - B.lunga / 2 - 0.4, oB = lato * (P.largo / 2 + B.larga / 2 + 0.35);
    baseBarca = { x: sx + vx * dB + lx * oB, y: pelo, z: sz + vz * dB + lz * oB, rot: Math.atan2(-vz, vx) };
  } else if (ap.tipo === 'secca') {
    // Barca del barcaiolo tirata in secca: sulla riva, con la prua verso terra, un poco sbandata.
    const S = APPRODI.secca, x = sx - vx * S.dentro, z = sz - vz * S.dentro;
    baseBarca = { x, y: quota(x, z) + 0.22, z, rot: Math.atan2(vz, -vx), sbanda: S.inclina * (rnd(3) < 0.5 ? -1 : 1), ferma: true };
  } else {
    // Palo d'ormeggio sulla riva dell'isola: dove sbarca il barcaiolo.
    const x = sx - vx * 1.2, z = sz - vz * 1.2, h = quota(x, z);
    scatola(parti, x, h + 0.55, z, vx, vz, 0.12, 0.85, 0.12, colore(C.pali));
    scatola(parti, x, h + 1.25, z, vx, vz, 0.16, 0.05, 0.16, colore(C.bordo));
  }

  const misure = { case: 0, edifici: 0, chiamate: 0, triangoli: 0 };
  if (parti.length) {
    const g = unisci(parti);
    const m = new THREE.Mesh(g, materiali().legno);
    m.name = `approdo-${ap.id}-legno`;
    oggetto.add(m);
    misure.chiamate++; misure.triangoli += g.attributes.position.count / 3;
  }
  if (baseBarca) {
    const g = geoBarca(APPRODI.barca);
    barca = new THREE.Mesh(g, materiali().barca);
    barca.name = `approdo-${ap.id}-barca`;
    barca.position.set(baseBarca.x, baseBarca.y, baseBarca.z);
    barca.rotation.order = 'YXZ';
    barca.rotation.y = baseBarca.rot;
    if (baseBarca.sbanda) barca.rotation.x = baseBarca.sbanda;          // rollio: attorno all'asse dello scafo
    oggetto.add(barca);
    barche.push(barca);
    misure.chiamate++; misure.triangoli += g.attributes.position.count / 3;
  }

  /** Impalcato come suolo (coordinate del blocco), o null fuori. */
  function quotaSuolo(x, z) {
    if (!impalcato) return null;
    const ex = x - sx, ez = z - sz, lungo = ex * vx + ez * vz, trav = ex * lx + ez * lz;
    if (lungo < impalcato.d0 || lungo > impalcato.d1 || Math.abs(trav) > P.largo / 2) return null;
    return impalcato.y;
  }
  const B = APPRODI.barca, fase = rnd(11) * Math.PI * 2;
  return {
    tipo: 'approdo', sito: { id: ap.id, x: a.px, z: a.pz }, object: oggetto, solidi: [], quotaSuolo,
    spingiFuori: () => null, dentro: () => false, sorgenti: [], edifici: [], misure, raggio: 30,
    // La barca ormeggiata dondola sull'acqua (l'unico aggancio per fotogramma che i villaggi hanno già).
    aggiornaLuci(t) {
      if (!barca || baseBarca.ferma) return;
      const w = 2 * Math.PI / B.periodo;
      barca.position.y = baseBarca.y + B.dondola * Math.sin(t * w + fase);
      barca.rotation.x = B.rolla * Math.sin(t * w * 0.8 + fase + 1.3);
    },
  };
}
