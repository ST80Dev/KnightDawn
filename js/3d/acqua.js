// Knight Dawn — acqua nelle Scene del mondo generato (M6, passo 6): fiumi e laghi in quota.
// Il mare è a parte (superficie curva in orizzonte.js). Qui:
//   - fiumi: un nastro lungo il tracciato curvo, largo quanto l'alveo (un po' di più: i bordi finiscono
//     sotto le sponde), al pelo dell'acqua, che scende con il letto (js/mondo/scena.js);
//   - laghi in quota: quadrati da ~31 m al livello del lago dove l'indicatore «lago» della Carta è ≥ 0,25;
//     dove il terreno è più alto del livello, il terreno copre l'acqua.

import * as THREE from 'three';

const PASSO_LAGHI = 4;
export const SOPRA_PELO = 0.03;        // m: il nastro appena sopra il pelo dell'acqua

/**
 * Nastro d'acqua lungo un pezzo di tracciato [x, z, pelo, semilarghezza, …] (coordinate locali): due vertici
 * per punto, larghi un po' più dell'alveo (i bordi finiscono sotto le sponde). Con `passo` i tratti si
 * dividono in parti non più lunghe di passo; `quota(x, z, pelo)` dà l'altezza di ciascun vertice (senza: appena
 * sopra il pelo dell'acqua).
 */
export function creaNastro(t, mat, passo = Infinity, quota = null) {
  const pt = [];                                          // punti suddivisi: x, z, pelo, w
  const m = t.length / 4;
  for (let i = 0; i < m; i++) {
    if (i > 0) {
      const l = Math.hypot(t[i * 4] - t[i * 4 - 4], t[i * 4 + 1] - t[i * 4 - 3]);
      const n = Math.min(64, Math.ceil(l / passo));
      for (let k = 1; k < n; k++) {
        const f = k / n;
        for (let c = 0; c < 4; c++) pt.push(t[i * 4 - 4 + c] + (t[i * 4 + c] - t[i * 4 - 4 + c]) * f);
      }
    }
    pt.push(t[i * 4], t[i * 4 + 1], t[i * 4 + 2], t[i * 4 + 3]);
  }
  const q = pt.length / 4;
  const pos = new Float32Array(q * 2 * 3);
  for (let i = 0; i < q; i++) {
    // Direzione del tratto (ai capi quella del tratto stesso: blocco e orizzonte si chiudono sulla stessa linea).
    const a = Math.max(0, i - 1), b = Math.min(q - 1, i + 1);
    let tx = pt[b * 4] - pt[a * 4], tz = pt[b * 4 + 1] - pt[a * 4 + 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const x = pt[i * 4], z = pt[i * 4 + 1], pelo = pt[i * 4 + 2], w = pt[i * 4 + 3] * 1.15;
    const xa = x - tz * w, za = z + tx * w, xb = x + tz * w, zb = z - tx * w;
    const ya = quota ? quota(xa, za, pelo) : pelo + SOPRA_PELO, yb = quota ? quota(xb, zb, pelo) : pelo + SOPRA_PELO;
    pos.set([xa, ya, za, xb, yb, zb], i * 6);
  }
  const indici = [];
  for (let i = 0; i < q - 1; i++) {
    const s = i * 2;
    indici.push(s, s + 2, s + 1, s + 1, s + 2, s + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(indici);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fiume';
  return mesh;
}               // vertici del blocco per lato di un quadrato di lago (4 × 7,8 m)

/** Materiale di fiumi e laghi: a due facce (il verso del nastro dipende dalla direzione del fiume). */
export function materialeAcqua(colore) {
  return new THREE.MeshLambertMaterial({ color: colore, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
}

/**
 * @param {{ fiume: Float32Array, lago: Float32Array, tracciati: Float32Array[] }} acqua  da generaScena
 * @param {object} meta  metadati del blocco (cols, rows, cellSize)
 * @param {string} colore
 * @returns {THREE.Group|null}
 */
export function creaAcqueScena(acqua, meta, colore) {
  const gruppo = new THREE.Group();
  gruppo.name = 'acque-scena';
  const mat = materialeAcqua(colore);

  for (const t of acqua.tracciati) gruppo.add(creaNastro(t, mat));

  // Laghi in quota.
  const { cols, rows, cellSize } = meta, half = (cols - 1) * cellSize / 2;
  const pos = [];
  for (let r = 0; r + PASSO_LAGHI < rows; r += PASSO_LAGHI) {
    for (let c = 0; c + PASSO_LAGHI < cols; c += PASSO_LAGHI) {
      let livello = NaN;
      for (const [dr, dc] of [[0, 0], [0, PASSO_LAGHI], [PASSO_LAGHI, 0], [PASSO_LAGHI, PASSO_LAGHI]]) {
        const v = acqua.lago[(r + dr) * cols + c + dc];
        if (!Number.isNaN(v)) { livello = v; break; }
      }
      if (Number.isNaN(livello)) continue;
      const x0 = -half + c * cellSize, x1 = x0 + PASSO_LAGHI * cellSize;
      const z0 = -half + r * cellSize, z1 = z0 + PASSO_LAGHI * cellSize;
      pos.push(x0, livello, z0, x0, livello, z1, x1, livello, z0, x1, livello, z0, x0, livello, z1, x1, livello, z1);
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'laghi';
    gruppo.add(mesh);
  }
  return gruppo.children.length ? gruppo : null;
}
