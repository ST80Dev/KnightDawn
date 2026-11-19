// Knight Dawn — vegetazione e oggetti sparsi: parte 3D (milestone in parallelo a M7).
// Il posizionamento sta in js/mondo/vegetazione.js (senza Three.js): qui solo ciò che si disegna.
//
// Passo 2: oggetti veri al posto dei punti di controllo. Ogni tipo ha 1–3 livelli di dettaglio, ognuno una sola
// InstancedMesh (una chiamata di disegno): alberi vicini ricchi, a media distanza semplici, lontani ridotti a una
// sagoma; arbusti, canne e sassi solo entro una distanza. Le matrici si calcolano una volta; quando la camera si
// sposta di qualche metro ogni istanza passa al livello giusto (copia di 16 numeri). Geometrie da primitive Three.js
// deformate a codice, colori per vertice, un materiale per livello; nessun asset esterno (regola 6).

import * as THREE from 'three';
import { STRIDE } from '../mondo/vegetazione.js';

// ─── Costruzione delle geometrie ─────────────────────────────────────────

/** Generatore pseudo-casuale fisso (le geometrie sono le stesse a ogni avvio). */
function casuale(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3();

/** Rende la geometria non indicizzata e le aggiunge i colori: fn(colore, x, y, z) per vertice. */
function colora(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    fn(_c, p.getX(i), p.getY(i), p.getZ(i), i);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Unisce geometrie non indicizzate con posizione, normale e colore. */
function unisci(parti) {
  const n = parti.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parti) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Spostamento deterministico secondo la direzione (vertici coincidenti restano uniti: niente crepe). */
function bozza(x, y, z, seme, forza) {
  return 1 + forza * (Math.sin(x * 2.1 + seme) * Math.cos(z * 1.7 - seme * 0.7) * 0.6
    + Math.sin(y * 2.9 + seme * 1.3) * 0.4);
}

/**
 * Chioma (o masso): icosaedro deformato, scalato e spostato. Normali a metà tra la sfera (morbida) e la faccia
 * (un po' di sfaccettatura: si leggono le foglie). `scuro`/`chiaro`: colore sotto e sopra, `macchie` variazione.
 */
function lobo(r, dettaglio, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, forza = 0.18, seme = 1,
  scuro, chiaro, macchie = 0.12, morbido = 0.6, rnd }) {
  const geo = new THREE.IcosahedronGeometry(r, dettaglio);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    const k = bozza(_v.x / r, _v.y / r, _v.z / r, seme, forza);
    p.setXYZ(i, _v.x * k * sx + x, _v.y * k * sy + y, _v.z * k * sz + z);
  }
  geo.computeVertexNormals();                          // per faccia (non indicizzata)
  const nf = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _n.set((p.getX(i) - x) / sx, (p.getY(i) - y) / sy, (p.getZ(i) - z) / sz).normalize().multiplyScalar(morbido);
    _v.set(nf.getX(i), nf.getY(i), nf.getZ(i)).multiplyScalar(1 - morbido).add(_n).normalize();
    nf.setXYZ(i, _v.x, _v.y, _v.z);
  }
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro);
  let faccia = 0;
  return colora(geo, (c, px, py, pz, i) => {
    if (i % 3 === 0) faccia = 1 + (rnd() * 2 - 1) * macchie;   // un tono per faccia: foglie a ciuffi
    const t = Math.min(1, Math.max(0, ((py - y) / (r * sy) + 1) / 2));
    c.copy(ca).lerp(cb, t).multiplyScalar(faccia);
  });
}

/** Tronco o ramo: cilindro da (0,0,0) verso l'alto lungo h, inclinato e spostato; base sotto terra di `sotto`. */
function fusto(r0, r1, h, lati, colore, { x = 0, y = 0, z = 0, inclinaX = 0, inclinaZ = 0, sotto = 0.5, chiuso = false } = {}) {
  const geo = new THREE.CylinderGeometry(r1, r0, h + sotto, lati, 1, !chiuso);
  geo.translate(0, (h + sotto) / 2 - sotto, 0);
  geo.rotateX(inclinaX); geo.rotateZ(inclinaZ);
  geo.translate(x, y, z);
  const cs = new THREE.Color(colore), cc = cs.clone().multiplyScalar(0.7);
  return colora(geo, (c, px, py) => c.copy(cc).lerp(cs, Math.min(1, Math.max(0, (py - y) / 2))));
}

/** Cono (palco di conifera, foglie di canna), frastagliato sul bordo. */
function cono(r, h, lati, y, scuro, chiaro, { seme = 1, frastaglio = 0.15, x = 0, z = 0, inclinaX = 0, inclinaZ = 0, rnd } = {}) {
  const geo = new THREE.ConeGeometry(r, h, lati, 1, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i);
    if (vx * vx + vz * vz > 1e-6) {
      const k = 1 + frastaglio * Math.sin(Math.atan2(vz, vx) * 3 + seme);
      p.setX(i, vx * k); p.setZ(i, vz * k);
    }
  }
  geo.translate(0, h / 2, 0);
  geo.rotateX(inclinaX); geo.rotateZ(inclinaZ);
  geo.translate(x, y, z);
  geo.computeVertexNormals();
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro);
  let faccia = 1;
  return colora(geo, (c, px, py, pz, i) => {
    if (i % 3 === 0) faccia = 1 + (rnd() * 2 - 1) * 0.1;
    c.copy(ca).lerp(cb, Math.min(1, Math.max(0, (py - y) / h))).multiplyScalar(faccia);
  });
}

// Colori (tarati sulla luce 3D, in tono con il terreno di terrain.js).
const COL = {
  corteccia: '#5a4532', cortecciaChiara: '#7d7468', cortecciaPino: '#6b4a34',
  foglia: ['#2c4f1d', '#5f8a37'], fogliaRiva: ['#3d5f2a', '#86a35a'], fogliaPino: ['#34502a', '#6f8a40'],
  ago: ['#1a3322', '#3d6a42'], cespuglio: ['#2f4f21', '#62873a'], mugo: ['#1f3524', '#46634a'],
  sterpo: '#8a7448', canna: ['#5f7a34', '#c4b46a'], roccia: ['#6c665e', '#a39b8d'],
};

/** Geometrie per tipo: un array di livelli { geo, fino (m), piatto (sfaccettato) }. */
function creaModelli() {
  const rnd = casuale(20261119);
  const M = {};

  // Latifoglia (quercia, castagno, faggio stilizzati): ~11 m, chioma a lobi.
  const lobiLat = [[0, 7.6, 0, 2.7], [1.7, 6.9, 0.6, 2.2], [-1.5, 7.1, -0.8, 2.3], [0.4, 6.5, -1.8, 2.0],
    [-0.6, 9.0, 0.7, 2.0], [-1.2, 6.4, 1.4, 1.8]];
  M.latifoglia = [
    { fino: 150, geo: unisci([
      fusto(0.38, 0.22, 6, 7, COL.corteccia),
      fusto(0.13, 0.06, 2.6, 5, COL.corteccia, { y: 4.2, inclinaZ: 0.8, sotto: 0 }),
      fusto(0.12, 0.06, 2.4, 5, COL.corteccia, { y: 4.5, inclinaX: -0.8, sotto: 0 }),
      ...lobiLat.map(([x, y, z, r], k) => lobo(r, 1, { x, y, z, sy: 0.85, seme: k * 1.7, scuro: COL.foglia[0], chiaro: COL.foglia[1], rnd })),
    ]) },
    { fino: 500, geo: unisci([
      fusto(0.36, 0.25, 5, 5, COL.corteccia),
      lobo(3.0, 0, { y: 7.4, sy: 0.85, seme: 1, forza: 0.12, scuro: COL.foglia[0], chiaro: COL.foglia[1], rnd }),
      lobo(2.2, 0, { x: 1.2, y: 6.6, z: 1.0, seme: 2, forza: 0.12, scuro: COL.foglia[0], chiaro: COL.foglia[1], rnd }),
    ]) },
    { fino: Infinity, geo: unisci([
      fusto(0.4, 0.3, 5, 3, COL.corteccia),
      lobo(3.4, 0, { y: 7.3, sy: 0.9, seme: 3, forza: 0.08, scuro: COL.foglia[0], chiaro: COL.foglia[1], macchie: 0.04, rnd }),
    ]) },
  ];

  // Conifera (abete): ~14 m, palchi a cono.
  const palchi = [[3.0, 4.6, 2.2], [2.5, 4.0, 4.6], [2.0, 3.6, 6.9], [1.45, 3.2, 9.1], [0.85, 2.9, 11.1]];
  M.conifera = [
    { fino: 150, geo: unisci([
      fusto(0.3, 0.12, 12, 6, COL.corteccia),
      ...palchi.map(([r, h, y], k) => cono(r, h, 9, y, COL.ago[0], COL.ago[1], { seme: k * 2.3, rnd })),
    ]) },
    { fino: 500, geo: unisci([
      fusto(0.3, 0.15, 4, 4, COL.corteccia),
      cono(2.9, 6.5, 6, 2.4, COL.ago[0], COL.ago[1], { seme: 1, frastaglio: 0.08, rnd }),
      cono(1.9, 6.0, 6, 6.6, COL.ago[0], COL.ago[1], { seme: 2, frastaglio: 0.08, rnd }),
    ]) },
    { fino: Infinity, geo: unisci([
      fusto(0.35, 0.2, 3, 3, COL.corteccia),
      cono(2.8, 11.5, 5, 2.4, COL.ago[0], COL.ago[1], { frastaglio: 0, rnd }),
    ]) },
  ];

  // Pino domestico: fusto alto e un po' storto, chioma a ombrello.
  const ombrello = [[0, 10.4, 0, 2.6], [2.0, 9.9, 0.5, 2.1], [-1.8, 10.0, -0.6, 2.2], [0.3, 9.8, -2.0, 2.0], [-0.4, 9.9, 1.9, 2.0]];
  M.pino = [
    { fino: 150, geo: unisci([
      fusto(0.36, 0.2, 9.4, 7, COL.cortecciaPino, { inclinaZ: 0.06 }),
      fusto(0.12, 0.07, 2.6, 5, COL.cortecciaPino, { x: 0.5, y: 8.0, inclinaZ: 0.9, sotto: 0 }),
      ...ombrello.map(([x, y, z, r], k) => lobo(r, 1, { x: x + 0.55, y, z, sy: 0.42, seme: k * 2.1 + 5, scuro: COL.fogliaPino[0], chiaro: COL.fogliaPino[1], rnd })),
    ]) },
    { fino: 500, geo: unisci([
      fusto(0.34, 0.22, 9.2, 5, COL.cortecciaPino, { inclinaZ: 0.06 }),
      lobo(3.8, 0, { x: 0.55, y: 10.2, sy: 0.4, seme: 4, forza: 0.1, scuro: COL.fogliaPino[0], chiaro: COL.fogliaPino[1], rnd }),
    ]) },
    { fino: Infinity, geo: unisci([
      fusto(0.36, 0.26, 9, 3, COL.cortecciaPino),
      lobo(3.9, 0, { x: 0.5, y: 10.2, sy: 0.4, seme: 6, forza: 0.05, scuro: COL.fogliaPino[0], chiaro: COL.fogliaPino[1], macchie: 0.04, rnd }),
    ]) },
  ];

  // Albero di riva (pioppo): alto e stretto, verde più chiaro.
  const colonna = [[0, 7.5, 0, 1.6], [0.2, 10.2, 0.1, 1.5], [-0.1, 12.8, -0.1, 1.3], [0, 15.0, 0, 0.95]];
  M.riva = [
    { fino: 150, geo: unisci([
      fusto(0.36, 0.16, 13, 7, COL.cortecciaChiara),
      ...colonna.map(([x, y, z, r], k) => lobo(r, 1, { x, y, z, sy: 1.6, sx: 1.1, sz: 1.1, seme: k * 1.9 + 9, scuro: COL.fogliaRiva[0], chiaro: COL.fogliaRiva[1], rnd })),
    ]) },
    { fino: 500, geo: unisci([
      fusto(0.34, 0.2, 6, 5, COL.cortecciaChiara),
      lobo(1.9, 0, { y: 10.6, sy: 3.4, seme: 8, forza: 0.1, scuro: COL.fogliaRiva[0], chiaro: COL.fogliaRiva[1], rnd }),
    ]) },
    { fino: Infinity, geo: unisci([
      fusto(0.35, 0.25, 6, 3, COL.cortecciaChiara),
      lobo(2.0, 0, { y: 10.6, sy: 3.3, seme: 7, forza: 0.05, scuro: COL.fogliaRiva[0], chiaro: COL.fogliaRiva[1], macchie: 0.04, rnd }),
    ]) },
  ];

  // Albero secco: fusto e rami spogli.
  const rami = [[3.2, 0.9, 0.2], [4.0, -0.7, 0.9], [4.8, 0.3, -1.0], [5.6, -1.1, -0.4], [6.2, 0.6, 0.7]];
  M.secco = [
    { fino: 150, geo: unisci([
      fusto(0.3, 0.1, 7.5, 6, COL.cortecciaChiara),
      ...rami.map(([y, iz, ix]) => fusto(0.1, 0.03, 2.8, 4, COL.cortecciaChiara, { y, inclinaZ: iz, inclinaX: ix, sotto: 0 })),
    ]) },
    { fino: 500, geo: unisci([
      fusto(0.3, 0.12, 7, 4, COL.cortecciaChiara),
      fusto(0.1, 0.04, 2.8, 3, COL.cortecciaChiara, { y: 4, inclinaZ: 0.9, sotto: 0 }),
      fusto(0.1, 0.04, 2.6, 3, COL.cortecciaChiara, { y: 5, inclinaZ: -0.8, sotto: 0 }),
    ]) },
    { fino: Infinity, geo: unisci([fusto(0.32, 0.15, 7, 3, COL.cortecciaChiara)]) },
  ];

  // Cespuglio: tre lobi bassi.
  const cesp = (d) => unisci([[0, 0.55, 0, 0.85], [0.6, 0.45, 0.3, 0.65], [-0.4, 0.42, -0.5, 0.7]]
    .slice(0, d ? 3 : 2).map(([x, y, z, r], k) => lobo(r, d, { x, y, z, sy: 0.75, seme: k * 2.7 + 11, scuro: COL.cespuglio[0], chiaro: COL.cespuglio[1], rnd })));
  M.cespuglio = [{ fino: 70, geo: cesp(1) }, { fino: 300, geo: cesp(0) }];

  // Arbusto alto (mugo, ginepro): basso, largo, scuro.
  const mugo = (d) => unisci([[0, 0.35, 0, 1.0], [0.8, 0.3, 0.4, 0.8], [-0.7, 0.28, -0.3, 0.8]]
    .slice(0, d ? 3 : 2).map(([x, y, z, r], k) => lobo(r, d, { x, y, z, sy: 0.5, seme: k * 3.1 + 17, scuro: COL.mugo[0], chiaro: COL.mugo[1], rnd })));
  M['arbusto alto'] = [{ fino: 70, geo: mugo(1) }, { fino: 300, geo: mugo(0) }];

  // Sterpo: ramaglie secche a raggiera.
  M.sterpo = [{ fino: 200, geo: unisci(Array.from({ length: 7 }, (_, k) =>
    fusto(0.04, 0.01, 0.9 + 0.3 * (k % 3), 3, COL.sterpo, { inclinaZ: 0.6 * Math.cos(k * 0.9), inclinaX: 0.6 * Math.sin(k * 0.9), sotto: 0.1 }))) }];

  // Canne: ciuffo di steli sottili con la punta chiara.
  M.canne = [{ fino: 150, geo: unisci(Array.from({ length: 11 }, (_, k) => {
    const a = k * 2.4, d = 0.15 + 0.25 * ((k * 7) % 5) / 5;
    return cono(0.035, 1.6 + 0.6 * ((k * 3) % 4) / 4, 3, 0, COL.canna[0], COL.canna[1],
      { x: d * Math.cos(a), z: d * Math.sin(a), inclinaX: 0.12 * Math.sin(a), inclinaZ: 0.12 * Math.cos(a), frastaglio: 0, rnd });
  })) }];

  // Rocce (sfaccettate): sasso, masso semisepolto, affioramento largo e basso.
  const roccia = (r, d, o) => lobo(r, d, { forza: 0.32, morbido: 0, macchie: 0.08, scuro: COL.roccia[0], chiaro: COL.roccia[1], rnd, ...o });
  M.sasso = [{ fino: 120, piatto: true, geo: unisci([roccia(0.32, 0, { y: 0.08, sy: 0.65, seme: 21 })]) }];
  M.masso = [
    { fino: 200, piatto: true, geo: unisci([roccia(1.2, 1, { y: 0.35, sy: 0.72, seme: 23 })]) },
    { fino: Infinity, piatto: true, geo: unisci([roccia(1.2, 0, { y: 0.35, sy: 0.72, seme: 23 })]) },
  ];
  M.affioramento = [{ fino: Infinity, piatto: true, geo: unisci([
    roccia(1.0, 1, { y: 0.15, sx: 3.6, sy: 0.85, sz: 2.3, seme: 29, forza: 0.4 }),
    roccia(0.8, 1, { x: 1.9, y: 0.3, z: 0.6, sx: 1.6, sy: 1.1, sz: 1.4, seme: 31 }),
  ]) }];

  // Tronco caduto: cilindro coricato con due monconi di ramo.
  const tronco = fusto(0.3, 0.24, 5, 7, COL.corteccia, { sotto: 0, chiuso: true });
  tronco.rotateZ(Math.PI / 2); tronco.translate(2.5, 0.22, 0);
  const moncone = fusto(0.09, 0.05, 0.8, 4, COL.corteccia, { x: -1.2, y: 0.4, inclinaZ: 0.7, sotto: 0 });
  M.tronco = [{ fino: 250, geo: unisci([tronco, moncone]) }];

  return M;
}

// ─── Istanze ─────────────────────────────────────────────────────────────

/** Variazione per istanza: tono (chiaro/scuro e più giallo o più verde) e proporzioni. */
const TONO = {
  alberi: [0.78, 1.12, 0.12], arbusti: [0.8, 1.12, 0.1], acqua: [0.85, 1.1, 0.1],
  rocce: [0.82, 1.1, 0], bosco: [0.8, 1.05, 0],
};
const GIALLO = new THREE.Color('#d9c85a');
const RIASSEGNA_DOPO = 12;              // m di spostamento della camera prima di ridistribuire le istanze

/**
 * Oggetto 3D della vegetazione del blocco.
 * @param {{ tipi: Object<string, {dati: Float32Array, n: number, gruppo: string}>, ms: number, msCampi: number }} pos
 *        esito di posizionaVegetazione
 * @returns {{ oggetto: THREE.Group, aggiorna: (x: number, z: number) => void, conteggi: Object<string, number>,
 *   totale: number, msPosiziona: number, msCampi: number, msCostruzione: number, statistiche: () => object }}
 */
export function creaVegetazione(pos) {
  const t0 = performance.now();
  const oggetto = new THREE.Group();
  oggetto.name = 'vegetazione';
  const modelli = creaModelli();
  const tipi = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [nome, t] of Object.entries(pos.tipi)) {
    const livelli = modelli[nome];
    if (!livelli || !t.n) continue;
    // Matrici e colori di tutte le istanze, calcolati una volta.
    const matrici = new Float32Array(t.n * 16), colori = new Float32Array(t.n * 3), xz = new Float32Array(t.n * 2);
    const [lo, hi, giallo] = TONO[t.gruppo] || [0.9, 1.1, 0];
    const roccia = t.gruppo === 'rocce';
    for (let k = 0; k < t.n; k++) {
      const d = t.dati, o = k * STRIDE;
      const s = d[o + 3], rot = d[o + 4], v = d[o + 5];
      const affonda = roccia ? -0.15 * s : 0;
      p.set(d[o], d[o + 1] + affonda, d[o + 2]);
      // Le rocce si inclinano un po'; gli alberi variano tra slanciati e tozzi.
      e.set(roccia ? (v - 0.5) * 0.5 : 0, rot, roccia ? ((v * 7) % 1 - 0.5) * 0.4 : 0);
      q.setFromEuler(e);
      const sy = roccia ? 1 : 0.88 + 0.24 * v;
      sc.set(s, s * sy, s);
      m4.compose(p, q, sc).toArray(matrici, k * 16);
      xz[k * 2] = d[o]; xz[k * 2 + 1] = d[o + 2];
      const b = lo + (hi - lo) * ((v * 13) % 1);
      _c.setRGB(b, b, b).lerp(GIALLO, giallo * ((v * 5) % 1));
      colori[k * 3] = _c.r; colori[k * 3 + 1] = _c.g; colori[k * 3 + 2] = _c.b;
    }
    const mesh = livelli.map((L) => {
      const m = new THREE.InstancedMesh(L.geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!L.piatto }), t.n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(t.n * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;                 // le istanze coprono tutto il blocco
      m.count = 0;
      m.visible = false;
      m.name = `vegetazione-${nome}-${L.fino}`;
      oggetto.add(m);
      return m;
    });
    tipi.push({ nome, n: t.n, livelli, mesh, matrici, colori, xz });
  }

  let ultimo = null, msAggiorna = 0;
  /** Ridistribuisce le istanze tra i livelli secondo la distanza dalla camera (x, z locali). */
  function aggiorna(cx, cz, forza = false) {
    if (!forza && ultimo && Math.hypot(cx - ultimo.x, cz - ultimo.z) < RIASSEGNA_DOPO) return;
    const t1 = performance.now();
    ultimo = { x: cx, z: cz };
    for (const T of tipi) {
      const L = T.livelli, nL = L.length, fino2 = L.map((l) => l.fino * l.fino);
      const conta = new Array(nL).fill(0);
      const am = T.mesh.map((m) => m.instanceMatrix.array), ac = T.mesh.map((m) => m.instanceColor.array);
      for (let k = 0; k < T.n; k++) {
        const dx = T.xz[k * 2] - cx, dz = T.xz[k * 2 + 1] - cz, d2 = dx * dx + dz * dz;
        let l = 0;
        while (l < nL && d2 > fino2[l]) l++;
        if (l === nL) continue;                    // oltre l'ultima distanza: non si disegna
        const j = conta[l]++;
        am[l].set(T.matrici.subarray(k * 16, k * 16 + 16), j * 16);
        ac[l][j * 3] = T.colori[k * 3]; ac[l][j * 3 + 1] = T.colori[k * 3 + 1]; ac[l][j * 3 + 2] = T.colori[k * 3 + 2];
      }
      T.mesh.forEach((m, l) => {
        m.count = conta[l];
        m.visible = conta[l] > 0;
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, conta[l] * 16);
        m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, conta[l] * 3);
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      });
    }
    msAggiorna = performance.now() - t1;
  }

  /** Istanze disegnate, chiamate e triangoli della vegetazione (F3). */
  function statistiche() {
    let istanze = 0, chiamate = 0, triangoli = 0;
    for (const T of tipi) {
      T.mesh.forEach((m, l) => {
        if (!m.visible) return;
        istanze += m.count; chiamate++;
        triangoli += m.count * T.livelli[l].geo.attributes.position.count / 3;
      });
    }
    return { istanze, chiamate, triangoli, msAggiorna, livelli: tipi.reduce((s, T) => s + T.mesh.length, 0) };
  }

  const conteggi = Object.fromEntries(Object.entries(pos.tipi).map(([k, t]) => [k, t.n]));
  return {
    oggetto, aggiorna, statistiche, conteggi,
    totale: Object.values(conteggi).reduce((s, v) => s + v, 0),
    msPosiziona: pos.ms, msCampi: pos.msCampi,
    msCostruzione: performance.now() - t0,
  };
}
