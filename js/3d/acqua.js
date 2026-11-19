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
  // Strade (js/mondo/strade.js): nastro della carreggiata sul terreno disegnato.
  if (acqua.strade?.length && acqua.altezza) {
    const ms = materialeStrada();
    for (const t of acqua.strade) gruppo.add(creaNastroStrada(t, ms, acqua.altezza));
  }
  return gruppo.children.length ? gruppo : null;
}

// ─── Strade ────────────────────────────────────────────────────────────────
// Il colore del terreno per vertice (7,8 m) non disegna bene una carreggiata di 1–4,5 m (curve e incroci a
// cunei, segnalato dall'utente): la strada è un nastro suo, largo esatto, appoggiato sul terreno disegnato.
const STRADA = {
  colore: '#9a8260', solchi: 0.82, centro: '#7f8a4c', sopra: 0.25,
  sezione: [-1, -0.45, 0, 0.45, 1],            // vertici attraverso la carreggiata (× semilarghezza)
};

function materialeStrada() {
  // polygonOffset: il nastro vince sul terreno senza alzarlo (niente strada sospesa vista di taglio).
  return new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/**
 * Nastro di una strada lungo [x, z, semilarghezza, …] (coordinate locali): 5 vertici per sezione (bordi, solchi delle
 * ruote, centro), ciascuno alla quota del terreno disegnato `altezza(x, z)` più STRADA.sopra.
 */
export function creaNastroStrada(t, mat, altezza) {
  const m = t.length / 3, S = STRADA.sezione, k = S.length;
  const pos = new Float32Array(m * k * 3), col = new Float32Array(m * k * 3);
  const base = new THREE.Color(STRADA.colore), erba = new THREE.Color(STRADA.centro), c = new THREE.Color();
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
    let tx = t[b * 3] - t[a * 3], tz = t[b * 3 + 1] - t[a * 3 + 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const x = t[i * 3], z = t[i * 3 + 1], w = t[i * 3 + 2];
    const variazione = 0.92 + 0.16 * (Math.sin(x * 0.37 + z * 0.23) * 0.5 + 0.5);
    for (let j = 0; j < k; j++) {
      const px = x - tz * w * S[j], pz = z + tx * w * S[j];
      pos.set([px, altezza(px, pz) + STRADA.sopra, pz], (i * k + j) * 3);
      c.copy(base);
      if (w > 1.2 && Math.abs(S[j]) === 0.45) c.multiplyScalar(STRADA.solchi);     // solchi delle ruote
      if (w > 1.2 && S[j] === 0) c.lerp(erba, 0.35);                               // erba al centro
      c.multiplyScalar(variazione);
      col.set([c.r, c.g, c.b], (i * k + j) * 3);
    }
  }
  const indici = [];
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const p = i * k + j, q = p + k;
      indici.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(indici);
  geo.computeVertexNormals();
  // Il verso dei triangoli dipende dalla direzione della strada: normali verso l'alto.
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'strada';
  return mesh;
}
