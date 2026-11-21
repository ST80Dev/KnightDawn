// Knight Dawn — acqua nelle Scene del mondo generato (M6, passo 6): fiumi e laghi in quota.
// Il mare è a parte (superficie curva in orizzonte.js). Qui:
//   - fiumi: un nastro lungo il tracciato curvo, largo quanto l'alveo (un po' di più: i bordi finiscono
//     sotto le sponde), al pelo dell'acqua, che scende con il letto (js/mondo/scena.js);
//   - laghi in quota: quadrati da ~31 m al livello del lago dove l'indicatore «lago» della Carta è ≥ 0,25;
//     dove il terreno è più alto del livello, il terreno copre l'acqua.

import * as THREE from 'three';

const PASSO_LAGHI = 4;
export const SOPRA_PELO = 0.03;        // m: il nastro appena sopra il pelo dell'acqua
const SEZIONE_FIUME = [-1, 1];          // vertici attraverso il nastro (× semilarghezza), per l'orizzonte
// Fiumi nel blocco: la griglia del terreno (7,8 m) non scava un alveo largo pochi metri e il terreno disegnato tra due
// vertici di sponda spuntava dall'acqua a morsi (segnalato dall'utente). Come per le strade, il nastro è fitto e,
// dove il terreno disegnato sta sopra il pelo, gli si appoggia appena sopra: il bordo dell'acqua resta quello del nastro.
const FIUME_SCENA = { sezione: [-1, -0.5, 0, 0.5, 1], passo: 2.5, sopraTerreno: 0.1 };

/**
 * Nastro d'acqua lungo un pezzo di tracciato [x, z, pelo, semilarghezza, …] (coordinate locali): due vertici
 * per punto, larghi un po' più dell'alveo (i bordi finiscono sotto le sponde). Con `passo` i tratti si
 * dividono in parti non più lunghe di passo; `quota(x, z, pelo)` dà l'altezza di ciascun vertice (senza: appena
 * sopra il pelo dell'acqua).
 */
export function creaNastro(t, mat, passo = Infinity, quota = null, sezione = SEZIONE_FIUME) {
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
  const q = pt.length / 4, k = sezione.length;
  const pos = new Float32Array(q * k * 3);
  for (let i = 0; i < q; i++) {
    // Direzione del tratto (ai capi quella del tratto stesso: blocco e orizzonte si chiudono sulla stessa linea).
    const a = Math.max(0, i - 1), b = Math.min(q - 1, i + 1);
    let tx = pt[b * 4] - pt[a * 4], tz = pt[b * 4 + 1] - pt[a * 4 + 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const x = pt[i * 4], z = pt[i * 4 + 1], pelo = pt[i * 4 + 2], w = pt[i * 4 + 3] * 1.15;
    for (let j = 0; j < k; j++) {
      const px = x - tz * w * sezione[j], pz = z + tx * w * sezione[j];
      pos.set([px, quota ? quota(px, pz, pelo) : pelo + SOPRA_PELO, pz], (i * k + j) * 3);
    }
  }
  const indici = [];
  for (let i = 0; i < q - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const s = i * k + j;
      indici.push(s, s + k, s + 1, s + 1, s + k, s + k + 1);
    }
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

  const F = FIUME_SCENA, alt = acqua.altezza;
  const matFiume = alt ? mat.clone() : mat;
  if (alt) Object.assign(matFiume, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const quota = alt ? (x, z, pelo) => Math.max(pelo + SOPRA_PELO, alt(x, z) + F.sopraTerreno) : null;
  for (const t of acqua.tracciati) gruppo.add(alt ? creaNastro(t, matFiume, F.passo, quota, F.sezione) : creaNastro(t, mat));

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
  // Strada piatta in larghezza, appena sopra il terreno disegnato. Prima il centro stava a +0,25 e i bordi a +0,08 (con
  // la profondità logaritmica il polygonOffset non valeva): la sezione bombata, con le normali calcolate da lei, faceva
  // sembrare le strade «tubi lungo il pendio» (segnalazione dell'utente). Con la profondità invertita il polygonOffset
  // vale e basta poco.
  sopra: [0.12, 0.12, 0.12, 0.12, 0.12],       // m sopra il terreno disegnato per ciascun vertice della sezione
  scarto: 0.15,                                // m: quanto la quota della strada può staccarsi dal terreno disegnato
  margine: 0.05,                               // m: luce minima tra la strada e il terreno che le sta sotto (sollevaSuTerreno)
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
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
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
 * Il terreno disegnato è a triangoli di 7,8 m, il nastro ha un punto ogni ~2 m: dove il pendio piega tra due punti del
 * nastro (spigoli dei triangoli, bordo della scarpata) il terreno spuntava sopra la strada a cunei diagonali, che
 * comparivano e sparivano muovendo la camera (segnalazione dell'utente). Per ogni quadrilatero del nastro si campiona il
 * terreno su una griglia 4×4 e, dove supera la strada, si alzano i quattro vertici quanto basta (+ STRADA.margine).
 */
function sollevaSuTerreno(pos, m, k, altezza) {
  const alza = new Float32Array(m * k);
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const v = [i * k + j, i * k + j + 1, (i + 1) * k + j, (i + 1) * k + j + 1];
      let serve = 0;
      for (let a = 0; a <= 3; a++) {
        for (let b = 0; b <= 3; b++) {
          const u = a / 3, w = b / 3, c = [(1 - u) * (1 - w), u * (1 - w), (1 - u) * w, u * w];
          let x = 0, y = 0, z = 0;
          for (let q = 0; q < 4; q++) { x += c[q] * pos[v[q] * 3]; y += c[q] * pos[v[q] * 3 + 1]; z += c[q] * pos[v[q] * 3 + 2]; }
          const d = altezza(x, z) + STRADA.margine - y;
          if (d > serve) serve = d;
        }
      }
      if (serve > 0) for (const q of v) if (serve > alza[q]) alza[q] = serve;
    }
  }
  for (let n = 0; n < m * k; n++) pos[n * 3 + 1] += alza[n];
}

/**
 * Quota della carreggiata disegnata nel punto (null fuori dalle strade), dai triangoli dei nastri del gruppo: serve al
 * cavaliere per posare i piedi SULLA strada, che sta qualche centimetro sopra il terreno (prima i piedi ci affondavano).
 * Coordinate locali del blocco. Indice a griglia di 4 m.
 */
export function suoloStrade(gruppo) {
  const CELLA = 4, celle = new Map(), tri = [];
  gruppo?.traverse((o) => {
    if (o.name !== 'strada' || !o.geometry?.index) return;
    const p = o.geometry.attributes.position.array, idx = o.geometry.index.array;
    for (let n = 0; n < idx.length; n += 3) {
      const t = [idx[n], idx[n + 1], idx[n + 2]].flatMap((v) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]);
      const id = tri.push(t) - 1;
      const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / CELLA), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / CELLA);
      const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / CELLA), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / CELLA);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        (celle.get(k) || celle.set(k, []).get(k)).push(id);
      }
    }
  });
  return {
    quotaSuolo(x, z) {
      const lista = celle.get(Math.floor(x / CELLA) * 100003 + Math.floor(z / CELLA));
      if (!lista) return null;
      for (const id of lista) {
        const t = tri[id];
        const det = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
        if (det === 0) continue;
        const l1 = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / det;
        const l2 = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * t[1] + l2 * t[4] + l3 * t[7];
      }
      return null;
    },
  };
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
  sollevaSuTerreno(pos, m, k, altezza);
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
  // Luce uniforme in larghezza: in ogni sezione la normale è la media della sezione (segue solo la salita o la discesa
  // lungo la strada), non la curvatura trasversale, che dava la luce di un cilindro.
  const nor = geo.attributes.normal;
  for (let i = 0; i < m; i++) {
    let nx = 0, ny = 0, nz = 0;
    for (let j = 0; j < k; j++) { const v = i * k + j; nx += nor.getX(v); ny += nor.getY(v); nz += nor.getZ(v); }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let j = 0; j < k; j++) nor.setXYZ(i * k + j, nx / l, ny / l, nz / l);
  }
  mat.side = THREE.FrontSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'strada';
  return mesh;
}

// ─── Ponti (strade, passo 4) ───────────────────────────────────────────────
// Dove una strada passa acqua più profonda del guado (js/mondo/strade.js, attraversamentiBlocco): pietra per le strade
// maestre e le luci oltre 20 m, legno per il resto (deciso con l'utente). Mesh da codice, una per ponte; ogni ponte è
// anche suolo (quotaSuolo, l'impalcato) e ostacolo (spingiFuori, i parapetti), come cortile e mura del castello.
const PONTE = {
  raccordo: 0.12,             // pendenza massima delle rampe di raccordo alle testate
  pietra: { colore: '#9a9182', scuro: '#7d7568', parapetto: 0.85, spessoreParapetto: 0.45, margine: 0.6,
    arco: 14, pila: 1.8, spalla: 1.2, chiave: 0.8, schiena: 0.035, schienaMax: 1.2 },
  legno: { colore: '#7a5a3a', scuro: '#5a4128', parapetto: 1.0, margine: 0.35, cavalletto: 6.5, montante: 2 },
};

/** Unisce geometrie (con o senza indice) in una sola, con un colore per geometria. */
function unisci(parti) {
  const pos = [], nor = [], col = [];
  for (const { geo, colore } of parti) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(colore.r, colore.g, colore.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/**
 * Ponti del blocco. `attraversamenti` da generaScena (acqua.attraversamenti), `altezza(x, z)` il terreno disegnato,
 * `quotaStrada(x, z)` (facoltativa) la carreggiata che arriva al ponte, o null fuori da essa.
 * Restituisce { gruppo, ponti: [{ object, solidi, quotaSuolo, spingiFuori }] }.
 */
export function creaPonti(attraversamenti, altezza, quotaStrada = null) {
  const gruppo = new THREE.Group();
  gruppo.name = 'ponti';
  const ponti = [];
  const matPietra = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const matLegno = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const at of attraversamenti || []) {
    if (!at.ponte) continue;
    const pietra = at.materiale === 'pietra', P = pietra ? PONTE.pietra : PONTE.legno;
    const dx = at.x1 - at.x0, dz = at.z1 - at.z0, L = Math.hypot(dx, dz);
    if (L < 2) continue;
    const ux = dx / L, uz = dz / L;                       // asse del ponte; v = (-uz, ux)
    const W = 2 * (at.semi + P.margine);                  // larghezza fuori tutto
    const schiena = pietra ? Math.min(P.schienaMax, P.schiena * L) : 0;
    const piano = (u) => at.quota + schiena * 4 * (u / L) * (1 - u / L);
    // Testate raccordate al terreno disegnato: ogni estremo parte alla quota del terreno lì (niente gradino né per l'occhio
    // né per i piedi) e raggiunge il piano con una rampa dolce (pendenza ≤ PONTE.raccordo) entro metà della luce.
    // Testate alla quota della carreggiata che arriva (rialzata sul terreno: partire dal terreno lasciava un gradino
    // di 30–50 cm tra strada e ponte, segnalato dall'utente), se più alta; altrimenti al terreno.
    // Media su tutta la larghezza: dove il terreno pende di traverso, un impalcato piatto alla quota dell'asse lasciava
    // su un lato uno scalino oltre i 40 cm (il gradino che il cavaliere sale da solo); così si divide tra i due lati.
    const suoloTestata = (x, z) => Math.max(altezza(x, z), quotaStrada?.(x, z) ?? -Infinity);
    const testata = (x, z) => {
      let s = 0;
      for (let k = -2; k <= 2; k++) { const v = k / 2 * (W / 2 - 0.3); s += suoloTestata(x - uz * v, z + ux * v); }
      return s / 5;
    };
    const hA = testata(at.x0, at.z0), hB = testata(at.x1, at.z1);
    const RA = Math.min(L / 2, Math.max(1, Math.abs(piano(0) - hA) / PONTE.raccordo));
    const RB = Math.min(L / 2, Math.max(1, Math.abs(piano(L) - hB) / PONTE.raccordo));
    const dolce = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const cima = (u) => piano(u) + (hA - piano(0)) * (1 - dolce(u / RA)) + (hB - piano(L)) * (1 - dolce((L - u) / RB));
    // Letto sotto il ponte (il più basso lungo l'asse) per pile e cavalletti.
    let letto = Infinity;
    for (let k = 0; k <= 20; k++) letto = Math.min(letto, altezza(at.x0 + ux * L * k / 20, at.z0 + uz * L * k / 20));
    const base = letto - 1.5;
    const c1 = new THREE.Color(P.colore), c2 = new THREE.Color(P.scuro);
    const parti = [];
    if (pietra) {
      // Fianco con gli archi (piano u–y), estruso per tutta la larghezza.
      const forma = new THREE.Shape();
      const N = 24;
      forma.moveTo(0, base); forma.lineTo(L, base);
      for (let k = N; k >= 0; k--) forma.lineTo(L * k / N, cima(L * k / N));
      forma.lineTo(0, base);
      const luceArchi = L - 2 * P.spalla;
      const n = Math.max(1, Math.round(luceArchi / P.arco));
      const a = (luceArchi - (n - 1) * P.pila) / n;
      const imposta = Math.max(at.pelo + 0.2, letto + 0.3);
      for (let k = 0; k < n && a > 1; k++) {
        const u0 = P.spalla + k * (a + P.pila), u1 = u0 + a, m = (u0 + u1) / 2;
        const freccia = Math.max(0.5, Math.min(a / 2, cima(m) - P.chiave - imposta));
        const foro = new THREE.Path();
        foro.moveTo(u0, base + 0.05); foro.lineTo(u1, base + 0.05); foro.lineTo(u1, imposta);
        for (let q = 1; q < 12; q++) {
          const t = q / 12, u = u1 - (u1 - u0) * t, w = (u - m) / (a / 2);
          foro.lineTo(u, imposta + freccia * Math.sqrt(Math.max(0, 1 - w * w)));
        }
        foro.lineTo(u0, imposta); foro.lineTo(u0, base + 0.05);
        forma.holes.push(foro);
      }
      const fianco = new THREE.ExtrudeGeometry(forma, { depth: W, bevelEnabled: false, curveSegments: 1 });
      fianco.translate(0, 0, -W / 2);
      parti.push({ geo: fianco, colore: c1 });
      // Parapetti: seguono la schiena d'asino.
      for (const lato of [-1, 1]) {
        const f = new THREE.Shape();
        f.moveTo(0, cima(0));
        for (let k = 1; k <= N; k++) f.lineTo(L * k / N, cima(L * k / N));
        for (let k = N; k >= 0; k--) f.lineTo(L * k / N, cima(L * k / N) + P.parapetto);
        const g = new THREE.ExtrudeGeometry(f, { depth: P.spessoreParapetto, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, lato > 0 ? W / 2 - P.spessoreParapetto : -W / 2);
        parti.push({ geo: g, colore: c2 });
      }
    } else {
      const scatola = (lu, ly, lw, u, y, v, colore) => {
        const g = new THREE.BoxGeometry(lu, ly, lw); g.translate(u, y, v); parti.push({ geo: g, colore });
      };
      const N = 24;
      const lastra = (spessore, sotto, larghezza, v, colore) => {     // lastra che segue la cima (tavolato, travi, correnti)
        const f = new THREE.Shape();
        f.moveTo(0, cima(0) - sotto);
        for (let k = 1; k <= N; k++) f.lineTo(L * k / N, cima(L * k / N) - sotto);
        for (let k = N; k >= 0; k--) f.lineTo(L * k / N, cima(L * k / N) - sotto - spessore);
        const g = new THREE.ExtrudeGeometry(f, { depth: larghezza, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, v - larghezza / 2);
        parti.push({ geo: g, colore });
      };
      lastra(0.22, 0, W, 0, c1);                                                             // tavolato
      for (const s of [-1, 1]) lastra(0.4, 0.22, 0.3, s * (W / 2 - 0.3), c2);                // travi
      const nc = Math.max(1, Math.round(L / P.cavalletto));
      for (let k = 1; k < nc; k++) {                                                         // cavalletti nel letto
        const u = L * k / nc, alto = cima(u) - 0.6 - base;
        for (const s of [-1, 1]) scatola(0.28, alto, 0.28, u, base + alto / 2, s * (W / 2 - 0.3), c2);
        scatola(0.25, 0.25, W - 0.3, u, cima(u) - 0.75, 0, c2);
      }
      const nm = Math.max(2, Math.round(L / P.montante));
      for (const s of [-1, 1]) {                                                              // parapetti
        for (let k = 0; k <= nm; k++) scatola(0.14, P.parapetto, 0.14, L * k / nm, cima(L * k / nm) + P.parapetto / 2, s * (W / 2 - 0.1), c2);
        lastra(0.12, -P.parapetto, 0.12, s * (W / 2 - 0.1), c1);                               // corrimano
        lastra(0.1, -P.parapetto * 0.5, 0.1, s * (W / 2 - 0.1), c1);
      }
    }
    const geo = unisci(parti);
    // Dal piano (u, y, v) al blocco: u lungo l'asse, v a sinistra.
    const m = new THREE.Matrix4().set(ux, 0, -uz, at.x0, 0, 1, 0, 0, uz, 0, ux, at.z0, 0, 0, 0, 1);
    geo.applyMatrix4(m);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, pietra ? matPietra : matLegno);
    mesh.name = 'ponte';
    gruppo.add(mesh);
    const locale = (x, z) => [(x - at.x0) * ux + (z - at.z0) * uz, -(x - at.x0) * uz + (z - at.z0) * ux];
    const dentro = W / 2 - (pietra ? P.spessoreParapetto : 0.2);   // carreggiata utile tra i parapetti
    ponti.push({
      object: mesh, solidi: [mesh], materiale: at.materiale, luce: L,
      asse: { x0: at.x0, z0: at.z0, x1: at.x1, z1: at.z1 },   // testate (per le prove dalla console)
      quotaSuolo(x, z) {
        const [u, v] = locale(x, z);
        return u >= 0 && u <= L && Math.abs(v) <= W / 2 ? cima(u) : null;
      },
      spingiFuori(x, z, r) {
        const [u, v] = locale(x, z);
        if (u < 0.4 || u > L - 0.4) return null;         // alle testate si entra e si esce
        const a = Math.abs(v), s = Math.sign(v) || 1;
        if (a > W / 2 + r || a < dentro - r) return null;
        const nv = a < (dentro + W / 2) / 2 ? s * (dentro - r) : s * (W / 2 + r);
        return { x: at.x0 + ux * u - uz * nv, z: at.z0 + uz * u + ux * nv };
      },
      aggiornaLuci() {},
    });
  }
  // Guadi: una fila di pietre piatte accanto alla carreggiata, appena sopra il pelo (per chi va a piedi), tutte in una
  // sola InstancedMesh per blocco. La soglia di ghiaia sotto l'acqua la fa il terreno (spianaStrade).
  const pietre = [];
  for (const at of attraversamenti || []) {
    if (at.ponte) continue;
    const P = at.punti, n = P.length / 2;
    for (let k = 0; k < n - 1; k++) {
      const ax = P[k * 2], az = P[k * 2 + 1], bx = P[k * 2 + 2], bz = P[k * 2 + 3];
      const l = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / l, tz = (bz - az) / l;
      for (let d = 0; d < l; d += GUADO.passo) {
        const x = ax + tx * d, z = az + tz * d;
        if (altezza(x, z) > at.pelo - 0.05) continue;     // solo dove c'è acqua
        const caso = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, r = caso - Math.floor(caso);
        const o = at.semi + GUADO.discosto + 0.2 * (r - 0.5);
        pietre.push({ x: x - tz * o, z: z + tx * o, y: at.pelo + GUADO.sopra, r, a: Math.atan2(tz, tx) + r * 2 });
      }
    }
  }
  if (pietre.length) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    geo.scale(GUADO.raggio, GUADO.alto, GUADO.raggio * 0.8);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: GUADO.colore, flatShading: true }), pietre.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), po = new THREE.Vector3();
    pietre.forEach((p, i) => {
      const k = 0.8 + 0.4 * p.r;
      m.compose(po.set(p.x, p.y, p.z), q.setFromEuler(e.set(0, p.a, 0)), sc.set(k, 1, k));
      mesh.setMatrixAt(i, m);
    });
    mesh.name = 'guadi';
    gruppo.add(mesh);
  }
  return { gruppo, ponti };
}

const GUADO = { passo: 0.95, discosto: 0.7, raggio: 0.38, alto: 0.22, sopra: 0.06, colore: '#8e877a' };
