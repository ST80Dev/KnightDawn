// Knight Dawn — orizzonte attorno a una Scena del mondo generato (M6, passo 5).
// Terreno lontano solo da guardare (non calpestabile), costruito dalla Carta già in memoria: dal bordo del
// blocco di 2×2 km si vedono le montagne fino a ~50 km.
//
//   anello vicino:  dal bordo del blocco a 6 km, passo 62,5 m;
//   anello medio:   da 6 a 18 km, passo 187,5 m;
//   anello lontano: da 18 a 48 km, passo 750 m.
// Una sola funzione di quota per tutti: la quota del mondo (Carta + dettaglio della Scena) in cui ogni ottava
// del dettaglio si spegne alla distanza in cui la griglia non la rappresenta più (al bordo del blocco c'è
// tutto, a 18 km resta la sola Carta). Cuciture senza fessure: le celle che toccano il bordo interno sono a
// ventaglio sui vertici più fitti dentro, e i vertici in comune hanno la stessa quota (stessa funzione,
// stesse coordinate). Oltre 1,5 km dal centro la superficie scende con la curvatura della Terra (con la
// rifrazione dell'aria: raggio efficace 7/6 di quello vero).
//
// Coordinate locali della Scena: x verso est, z verso sud, centro del blocco in (0, 0).

import * as THREE from 'three';
import { quotaMondo, quotaCarta, SCENA, OTTAVE_DETTAGLIO } from '../mondo/scena.js';
import { hash2, derivaSeme } from '../mondo/rumore.js';
import { coloreTerreno } from './terrain.js';

export const ORIZZONTE = {
  anelli: [                                // passo e bordo esterno (m); il bordo interno è il precedente
    { passo: 62.5, raggio: 6000 },
    { passo: 187.5, raggio: 18000 },
    { passo: 750, raggio: 48000 },
  ],
  // Distanza (m, dal centro, in quadrato come gli anelli) a cui si spegne ciascuna ottava del dettaglio,
  // dalla più ampia (1400 m) alla più fine (~44 m). Tutte piene al bordo del blocco (1 km).
  spegnimento: [[15000, 18000], [12000, 17000], [6000, 9000], [4000, 6000], [1500, 3500], [1200, 2500]],
  curvatura: { da: 1500, raggioTerra: 6371000 * 7 / 6 },
  passoAcqua: 1000,
};

/** Abbassamento (m) dovuto alla curvatura della Terra a distanza d (m) dal centro della Scena. */
export function abbassamento(d) {
  const { da, raggioTerra } = ORIZZONTE.curvatura;
  return d > da ? (d - da) * (d - da) / (2 * raggioTerra) : 0;
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Un anello quadrato di terreno: celle di lato `passo` tra il bordo interno (`buco`, metà lato) e quello
 * esterno (`raggio`). Le celle che toccano un lato del buco sono a ventaglio sui `fini` sotto-punti di quel
 * lato, così coincidono con i vertici più fitti dentro. Facce piatte con colore per faccia.
 */
function anello(quota, buco, passo, raggio, fini, colore) {
  const n = Math.round(2 * raggio / passo);
  const pos = [], col = [];
  const tmp = new THREE.Color();
  const v = new Map();                       // quota dei vertici della griglia, calcolata una volta sola
  const q = (x, z) => {
    const k = x * 1e6 + z;
    let h = v.get(k);
    if (h === undefined) { h = quota(x, z); v.set(k, h); }
    return h;
  };
  function tri(a, b, c, seme) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (ny < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }   // faccia verso l'alto
    const len = Math.hypot(nx, ny, nz) || 1;
    const pendenza = Math.acos(Math.min(1, ny / len)) * 180 / Math.PI;
    colore(tmp, (a[1] + b[1] + c[1]) / 3, pendenza, seme);
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
  }
  const P = (x, z) => [x, q(x, z), z];
  for (let r = 0; r < n; r++) {
    const z0 = -raggio + r * passo, z1 = z0 + passo;
    for (let c = 0; c < n; c++) {
      const x0 = -raggio + c * passo, x1 = x0 + passo;
      if (x0 >= -buco && x1 <= buco && z0 >= -buco && z1 <= buco) continue;          // dentro il buco
      const seme = hash2(c, r, 911) / 4294967296;
      const dentroZ = z0 >= -buco && z1 <= buco, dentroX = x0 >= -buco && x1 <= buco;
      // Lato condiviso con il buco: punti fitti da un'estremità all'altra, e i due vertici opposti.
      let lato = null, q0, q1;
      if (dentroZ && x1 === -buco) { lato = (t) => [x1, z0 + t * passo]; q0 = P(x0, z0); q1 = P(x0, z1); }
      else if (dentroZ && x0 === buco) { lato = (t) => [x0, z0 + t * passo]; q0 = P(x1, z0); q1 = P(x1, z1); }
      else if (dentroX && z1 === -buco) { lato = (t) => [x0 + t * passo, z1]; q0 = P(x0, z0); q1 = P(x1, z0); }
      else if (dentroX && z0 === buco) { lato = (t) => [x0 + t * passo, z0]; q0 = P(x0, z1); q1 = P(x1, z1); }
      if (lato) {
        const punti = [];
        for (let k = 0; k <= fini; k++) { const [x, z] = lato(k / fini); punti.push(P(x, z)); }
        const meta = Math.floor(fini / 2);
        for (let k = 0; k < fini; k++) tri(k < meta ? q0 : q1, punti[k], punti[k + 1], seme);
        tri(q0, punti[meta], q1, seme);
        continue;
      }
      const a = P(x0, z0), b = P(x1, z0), d = P(x0, z1), e = P(x1, z1);
      tri(a, d, b, seme);
      tri(b, d, e, seme);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();                // facce piatte: i tre vertici di una faccia non sono condivisi
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Orizzonte per la Scena centrata in (cx, cz) del mondo.
 * @param {object} carta  dalla generaCarta
 * @param {object} terrain  il blocco della Scena (per la scala dei colori: minElev, maxElev)
 * @param {string} coloreAcqua
 * @returns {{ oggetto: THREE.Group, acqua: THREE.Mesh|null, triangoli: number, ms: number }}
 */
export function creaOrizzonte(carta, cx, cz, terrain, coloreAcqua) {
  const t0 = performance.now();
  const O = ORIZZONTE, half = SCENA.lato / 2;
  const seme = derivaSeme(carta.seme, 101);                // lo stesso del blocco (generaScena)
  const nOttave = OTTAVE_DETTAGLIO.length;
  const pesi = new Float64Array(nOttave);
  let minimo = Infinity;
  const colore = (out, h, pendenza, rnd) => coloreTerreno(out, h, pendenza, rnd, terrain.minElev, terrain.maxElev);

  const quota = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z));
    let tutti = true, nessuno = true;
    for (let o = 0; o < nOttave; o++) {
      const [a, b] = O.spegnimento[o];
      const p = 1 - smooth(a, b, d);
      pesi[o] = p;
      if (p < 1) tutti = false;
      if (p > 0) nessuno = false;
    }
    // Al bordo del blocco tutte le ottave sono piene: stesso calcolo del blocco (null = senza pesi).
    const h = nessuno ? quotaCarta(carta, cx + x, cz + z)
      : quotaMondo(carta, cx + x, cz + z, seme, tutti ? null : pesi);
    if (h < minimo) minimo = h;
    return h - abbassamento(Math.hypot(x, z));
  };
  const geometrie = [];
  let interno = half, passoDentro = SCENA.lato / SCENA.celle;
  for (const { passo, raggio } of O.anelli) {
    geometrie.push(anello(quota, interno, passo, raggio, Math.round(passo / passoDentro), colore));
    interno = raggio;
    passoDentro = passo;
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const oggetto = new THREE.Group();
  oggetto.name = 'orizzonte';
  for (const g of geometrie) oggetto.add(new THREE.Mesh(g, mat));

  // Mare: una griglia larga che scende con la curvatura (un piano dritto spunterebbe sopra le coste lontane).
  let acqua = null;
  if (minimo < 0 || terrain.minElev < 0) {
    const R = O.anelli[O.anelli.length - 1].raggio, n = Math.round(2 * R / O.passoAcqua);
    const geo = new THREE.PlaneGeometry(2 * R, 2 * R, n, n).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, -abbassamento(Math.hypot(p.getX(i), p.getZ(i))));
    geo.computeVertexNormals();
    acqua = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: coloreAcqua, transparent: true, opacity: 0.88 }));
    acqua.name = 'acqua';
  }
  const triangoli = geometrie.reduce((t, g) => t + g.attributes.position.count / 3, 0);
  return { oggetto, acqua, triangoli, ms: performance.now() - t0 };
}
