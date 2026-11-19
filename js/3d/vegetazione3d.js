// Knight Dawn — vegetazione e oggetti sparsi: parte 3D (milestone in parallelo a M7).
// Il posizionamento sta in js/mondo/vegetazione.js (senza Three.js): qui solo ciò che si disegna.
//
// Passo 1: punti di controllo. Ogni oggetto è un punto colorato per tipo, in tre gruppi (alberi; arbusti e canne;
// rocce e tronchi): tre chiamate di disegno. Servono a vedere dove il posizionamento mette le cose prima di fare le
// mesh (passo 2 e seguenti). Il tasto V li mostra e li nasconde.

import * as THREE from 'three';
import { STRIDE } from '../mondo/vegetazione.js';

/** Colore del punto e altezza sopra il suolo (m) per tipo. */
const ASPETTO = {
  latifoglia:     ['#2f6b1f', 4],
  conifera:       ['#0f3d2a', 4],
  pino:           ['#7a8f2a', 4],
  riva:           ['#2fa37a', 4],
  secco:          ['#6b4a2a', 4],
  cespuglio:      ['#5fae3a', 1.2],
  'arbusto alto': ['#2d4f3a', 1],
  sterpo:         ['#b39350', 1],
  canne:          ['#d8d04a', 1.5],
  sasso:          ['#9a9a9a', 0.5],
  masso:          ['#5a5a66', 1.5],
  affioramento:   ['#d0c8b8', 1.5],
  tronco:         ['#8a3a1a', 0.6],
};
const GRUPPI = [
  { nome: 'alberi', tipi: ['alberi'], dimensione: 5 },
  { nome: 'arbusti', tipi: ['arbusti', 'acqua'], dimensione: 3 },
  { nome: 'rocce', tipi: ['rocce', 'bosco'], dimensione: 3 },
];

/**
 * Oggetto 3D della vegetazione del blocco.
 * @param {{ tipi: Object<string, {dati: Float32Array, n: number, gruppo: string}>, ms: number, msCampi: number }} pos
 *        esito di posizionaVegetazione
 * @returns {{ oggetto: THREE.Group, conteggi: Object<string, number>, totale: number, msPosiziona: number,
 *             msCostruzione: number, chiamate: number }}
 */
export function creaVegetazione(pos) {
  const t0 = performance.now();
  const oggetto = new THREE.Group();
  oggetto.name = 'vegetazione';
  const col = new THREE.Color();
  let chiamate = 0;
  for (const g of GRUPPI) {
    const voci = Object.entries(pos.tipi).filter(([, t]) => g.tipi.includes(t.gruppo));
    const n = voci.reduce((s, [, t]) => s + t.n, 0);
    if (!n) continue;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    let o = 0;
    for (const [nome, t] of voci) {
      const [colore, sopra] = ASPETTO[nome] || ['#ff00ff', 1];
      col.set(colore);
      for (let k = 0; k < t.n; k++, o += 3) {
        p[o] = t.dati[k * STRIDE]; p[o + 1] = t.dati[k * STRIDE + 1] + sopra; p[o + 2] = t.dati[k * STRIDE + 2];
        c[o] = col.r; c[o + 1] = col.g; c[o + 2] = col.b;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.computeBoundingSphere();
    const punti = new THREE.Points(geo, new THREE.PointsMaterial({ size: g.dimensione, vertexColors: true, sizeAttenuation: true }));
    punti.name = `vegetazione-${g.nome}`;
    oggetto.add(punti);
    chiamate++;
  }
  const conteggi = Object.fromEntries(Object.entries(pos.tipi).map(([k, t]) => [k, t.n]));
  return {
    oggetto, conteggi, chiamate,
    totale: Object.values(conteggi).reduce((s, v) => s + v, 0),
    msPosiziona: pos.ms, msCampi: pos.msCampi,
    msCostruzione: performance.now() - t0,
  };
}
