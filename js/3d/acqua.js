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
 * @param {{x:number, z:number}} [centro]  centro del blocco in coordinate del mondo (per il rumore delle strade)
 * @returns {THREE.Group|null}
 */
export function creaAcqueScena(acqua, meta, colore, centro) {
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
    const ms = materialeStrada(centro);
    acqua.strade.forEach((t, n) => gruppo.add(creaNastroStrada(t, ms, acqua.altezza, acqua.quoteStrade?.[n])));
  }
  return gruppo.children.length ? gruppo : null;
}

// ─── Strade ────────────────────────────────────────────────────────────────
// Il colore del terreno per vertice (7,8 m) non disegna bene una carreggiata di 1–4,5 m (curve e incroci a
// cunei, segnalato dall'utente): la strada è un nastro suo, largo esatto, appoggiato sul terreno disegnato.
const STRADA = {
  colore: '#a89272', solchi: 0.85, centro: '#7f8a4c',
  sezione: [-1, -0.45, 0, 0.45, 1],            // vertici attraverso la carreggiata (× semilarghezza)
  sopra: [0.08, 0.2, 0.25, 0.2, 0.08],         // m sopra il terreno disegnato per ciascun vertice: il bordo tocca terra
  scarto: 0.3,                                 // m: quanto la quota della strada può staccarsi dal terreno disegnato
  // Bordo e superficie (shader, docs/GRAFICA_3D.md): il bordo si mangia fino al 22% della semilarghezza con un rumore
  // del mondo e sfuma nell'erba calpestata; chiazze di tono (2–6 m) e ghiaia scura entro 30 m dalla camera.
  erbaPestata: '#80804e', mangiaBordo: 0.22, periodo: 8192,
};

/**
 * Materiale della strada. `centro`: coordinate del mondo dell'origine del blocco, per un rumore che non cambia tra
 * un blocco e l'altro (stesso periodo di 8192 m del suolo).
 */
function materialeStrada(centro = { x: 0, z: 0 }) {
  // polygonOffset: il nastro vince sul terreno senza alzarlo (niente strada sospesa vista di taglio).
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const P = STRADA.periodo;
  const uniformi = {
    uOrigineStrada: { value: new THREE.Vector2(((centro.x % P) + P) % P, ((centro.z % P) + P) % P) },
    uErbaPestata: { value: new THREE.Color(STRADA.erbaPestata) },
    uMangiaBordo: { value: STRADA.mangiaBordo },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformi);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTrasversale;
uniform vec2 uOrigineStrada;
varying float vTrasversale;
varying vec2 vPosStrada;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vTrasversale = aTrasversale;
  vPosStrada = (modelMatrix * vec4(transformed, 1.0)).xz + uOrigineStrada;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uErbaPestata;
uniform float uMangiaBordo;
varying float vTrasversale;
varying vec2 vPosStrada;
float hashStrada(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rumoreStrada(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashStrada(i), hashStrada(i + vec2(1.0, 0.0)), u.x),
             mix(hashStrada(i + vec2(0.0, 1.0)), hashStrada(i + vec2(1.0)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vPosStrada;
    float dist = length(vViewPosition);
    float t = abs(vTrasversale);
    // Bordo frastagliato: fino a uMangiaBordo della semilarghezza si lascia vedere il terreno sotto.
    float r = rumoreStrada(p / 0.6) * 0.55 + rumoreStrada(p / 2.1) * 0.45;
    float bordo = 1.0 - uMangiaBordo * r;
    if (t > bordo) discard;
    // Verso il bordo la terra battuta lascia il posto all'erba calpestata.
    diffuseColor.rgb = mix(diffuseColor.rgb, uErbaPestata * (0.8 + 0.4 * r), smoothstep(bordo - 0.3, bordo, t) * 0.75);
    // Chiazze di tono e ghiaia scura (solo vicino: lontano sfarfallerebbe).
    diffuseColor.rgb *= 0.86 + 0.28 * rumoreStrada(p / 4.0);
    // Sassolini tondi: un punto a caso per cella di 25 cm, presente in circa metà delle celle, raggio variabile.
    vec2 q = p / 0.25, ci = floor(q);
    vec2 centroSasso = vec2(hashStrada(ci), hashStrada(ci + 7.1)) * 0.6 + 0.2;
    float raggio = 0.05 + 0.07 * hashStrada(ci + 1.7);
    float sasso = step(0.5, hashStrada(ci + 3.3)) * (1.0 - smoothstep(raggio * 0.6, raggio, length(fract(q) - centroSasso)));
    diffuseColor.rgb *= 1.0 - 0.28 * sasso * (1.0 - smoothstep(20.0, 30.0, dist));
  }`);
  };
  mat.customProgramCacheKey = () => 'strada-1';
  return mat;
}

/**
 * Nastro di una strada lungo [x, z, semilarghezza, …] (coordinate locali): 5 vertici per sezione (bordi, solchi delle
 * ruote, centro), ciascuno alla quota del terreno disegnato `altezza(x, z)` (o della strada, `quote[i]`, se data) più
 * STRADA.sopra.
 */
export function creaNastroStrada(t, mat, altezza, quote = null) {
  const m = t.length / 3, S = STRADA.sezione, k = S.length;
  const pos = new Float32Array(m * k * 3), col = new Float32Array(m * k * 3), trasv = new Float32Array(m * k);
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
      // Con la quota della strada (generaScena: acqua.quoteStrade) il nastro è piano in larghezza, come la
      // carreggiata spianata; resta entro ±STRADA.scarto dal terreno disegnato (negli alvei la quota è quella del
      // futuro ponte o guado: niente nastro sospeso sull'acqua, niente nastro sepolto).
      const suolo = altezza(px, pz);
      const h = quote ? Math.min(Math.max(quote[i], suolo - STRADA.scarto), suolo + STRADA.scarto) : suolo;
      pos.set([px, h + STRADA.sopra[j], pz], (i * k + j) * 3);
      trasv[i * k + j] = S[j];
      c.copy(base);
      if (w > 1.2 && Math.abs(S[j]) === 0.45) c.multiplyScalar(STRADA.solchi);     // solchi delle ruote
      if (w > 1.2 && S[j] === 0) c.lerp(erba, 0.35);                               // erba al centro
      c.multiplyScalar(variazione);
      col.set([c.r, c.g, c.b], (i * k + j) * 3);
    }
  }
  // Triangoli sempre rivolti verso l'alto (senso antiorario visto da sopra). Prima si giravano solo le normali, ma
  // il materiale a due facce, vedendo il retro dei triangoli, le rigirava di nuovo verso il basso: la strada era
  // illuminata da sotto e usciva quasi nera, «un nastro di stoffa» (segnalazione dell'utente).
  const indici = [];
  const giu = (a, b, c) => {
    const ux = pos[b * 3] - pos[a * 3], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    return uz * vx - ux * vz < 0;          // componente Y del prodotto vettoriale
  };
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const p = i * k + j, q = p + k;
      if (giu(p, q, p + 1)) indici.push(p, p + 1, q, p + 1, q + 1, q);
      else indici.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aTrasversale', new THREE.BufferAttribute(trasv, 1));
  geo.setIndex(indici);
  geo.computeVertexNormals();
  mat.side = THREE.FrontSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'strada';
  return mesh;
}
