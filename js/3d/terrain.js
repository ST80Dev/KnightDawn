// Knight Dawn — terreno 3D (milestone M1)
// Carica la heightmap reale (assets/terrain/<nome>.bin + .json) oppure, se manca, genera un
// terreno collinare procedurale con la stessa griglia. Costruisce una mesh low-poly a facce
// piatte, colorata per faccia in base ad altitudine e pendenza, ed espone le query di quota.
//
// Coordinate: 1 unità = 1 m, Y in alto = quota reale s.l.m., origine al centro dell'area.
// Colonna 0 = ovest (x = -size/2), riga 0 = nord (z = -size/2): il nord è verso -Z.
//
// Ogni cella è divisa in due triangoli lungo la diagonale NE–SO. getHeight() interpola sul
// triangolo effettivamente disegnato (non in bilineare), così ciò che sta sul terreno
// combacia esattamente con la superficie visibile.

import * as THREE from 'three';

const PAL = (typeof PALETTE !== 'undefined') ? PALETTE : {};

// Colori del terreno (adattati alla luce 3D, ispirati alla PALETTE di config.js)
const COL = {
  fondovalle: new THREE.Color('#76a043'),          // campi di fondovalle, più verdi
  prato:      new THREE.Color(PAL.verdePrato || '#9ec060').lerp(new THREE.Color(PAL.pianuraSud || '#d4bc84'), 0.3).multiplyScalar(0.87),
  pratoAlto:  new THREE.Color('#ab9c55'),          // crinali, stoppie e grano: più ocra
  bosco:      new THREE.Color('#3f6428'),
  roccia:     new THREE.Color(PAL.grigioPietra || '#8a7a5a').lerp(new THREE.Color('#b0a080'), 0.3),
  bordo:      new THREE.Color(PAL.inkLeggero || '#7a5a2a'),
};

// Soglie di pendenza (gradi) per il passaggio prato → bosco → roccia
const PENDENZA_BOSCO = [13, 24];
const PENDENZA_ROCCIA = [30, 40];
const VARIAZIONE_FACCIA = 0.05;   // ± luminosità casuale per faccia (look low-poly)
const PROFONDITA_BORDO = 25;      // m sotto la quota minima a cui scendono i lati del blocco

// Griglia del fallback (uguale a quella prevista per i dati reali)
const FALLBACK_META = {
  name: 'procedurale', cols: 257, rows: 257, cellSize: 2000 / 256, sizeMeters: 2000,
  source: 'procedurale (dati reali non trovati)',
};

// ─── Caricamento ────────────────────────────────────────────────────────

/**
 * Carica il terreno e restituisce l'oggetto Terrain (vedi createTerrain).
 * Se i file mancano o non sono validi usa il terreno procedurale (isFallback = true).
 */
export async function loadTerrain(name = 'tavullia', basePath = 'assets/terrain/') {
  try {
    const [metaRes, binRes] = await Promise.all([
      fetch(`${basePath}${name}.json`),
      fetch(`${basePath}${name}.bin`),
    ]);
    if (!metaRes.ok || !binRes.ok) throw new Error(`HTTP ${metaRes.status}/${binRes.status}`);
    const meta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    const n = meta.cols * meta.rows;
    if (buf.byteLength !== n * 2) throw new Error(`dimensione .bin errata: ${buf.byteLength} byte, attesi ${n * 2}`);

    const view = new DataView(buf);
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) heights[i] = view.getUint16(i * 2, true) / 10;   // decimetri → metri
    return createTerrain(meta, heights, false);
  } catch (err) {
    console.warn(`[terreno] heightmap "${name}" non disponibile (${err.message}): uso il terreno procedurale.`);
    const meta = { ...FALLBACK_META };
    return createTerrain(meta, proceduralHeights(meta), true);
  }
}

// ─── Terreno ────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   mesh: THREE.Group, meta: object, isFallback: boolean,
 *   size: number, half: number, minElev: number, maxElev: number,
 *   getHeight: (x:number, z:number) => number,
 *   getSlope:  (x:number, z:number) => number,
 *   contains:  (x:number, z:number) => boolean,
 * }}
 */
function createTerrain(meta, heights, isFallback) {
  const { cols, rows } = meta;
  const cell = meta.cellSize;
  const size = cell * (cols - 1);
  const half = size / 2;

  let minElev = Infinity, maxElev = -Infinity;
  for (const h of heights) { if (h < minElev) minElev = h; if (h > maxElev) maxElev = h; }
  meta.minElev = minElev;
  meta.maxElev = maxElev;

  const H = (c, r) => heights[r * cols + c];

  // Trova cella e coordinate locali (u verso est, v verso sud), con clamp ai bordi.
  function locate(x, z) {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = Math.min(Math.max(fx, 0), cols - 1);
    fz = Math.min(Math.max(fz, 0), rows - 1);
    const c = Math.min(Math.floor(fx), cols - 2);
    const r = Math.min(Math.floor(fz), rows - 2);
    return { c, r, u: fx - c, v: fz - r };
  }

  /** Quota del terreno (m) nel punto (x, z), interpolata sul triangolo disegnato. */
  function getHeight(x, z) {
    const { c, r, u, v } = locate(x, z);
    const a = H(c, r), b = H(c + 1, r), d = H(c, r + 1), e = H(c + 1, r + 1);
    if (u + v <= 1) return a + (b - a) * u + (d - a) * v;            // triangolo NO: a, d, b
    return e + (d - e) * (1 - u) + (b - e) * (1 - v);                // triangolo SE: b, d, e
  }

  /** Pendenza del terreno (gradi, 0 = piano) nel punto (x, z). */
  function getSlope(x, z) {
    const { c, r, u, v } = locate(x, z);
    const a = H(c, r), b = H(c + 1, r), d = H(c, r + 1), e = H(c + 1, r + 1);
    const gx = (u + v <= 1) ? (b - a) / cell : (e - d) / cell;
    const gz = (u + v <= 1) ? (d - a) / cell : (e - b) / cell;
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }

  /** true se (x, z) è dentro l'area del terreno. */
  function contains(x, z) {
    return x >= -half && x <= half && z >= -half && z <= half;
  }

  const mesh = new THREE.Group();
  mesh.name = 'terreno';
  mesh.add(buildSurface(heights, cols, rows, cell, half, minElev, maxElev));
  mesh.add(buildSkirt(heights, cols, rows, cell, half, minElev - PROFONDITA_BORDO));

  return { mesh, meta, isFallback, size, half, minElev, maxElev, getHeight, getSlope, contains };
}

// ─── Mesh della superficie ──────────────────────────────────────────────

function buildSurface(heights, cols, rows, cell, half, minElev, maxElev) {
  const triCount = (cols - 1) * (rows - 1) * 2;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const range = Math.max(maxElev - minElev, 1);
  const tmp = new THREE.Color();
  let o = 0;

  // Pendenza "di zona" per vertice (differenze centrali su 2 celle): il colore segue i versanti
  // e non il rumore della singola faccia, che darebbe macchie a quadretti.
  const H = (c, r) => heights[Math.min(Math.max(r, 0), rows - 1) * cols + Math.min(Math.max(c, 0), cols - 1)];
  const zona = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = (H(c + 1, r) - H(c - 1, r)) / (2 * cell);
      const gz = (H(c, r + 1) - H(c, r - 1)) / (2 * cell);
      zona[r * cols + c] = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
    }
  }

  // Scrive un triangolo (vertici in senso antiorario visti dall'alto) con normale e colore della faccia.
  function tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, slope, seed) {
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const t = ((y0 + y1 + y2) / 3 - minElev) / range;
    faceColor(tmp, t, slope, seed);

    pos.set([x0, y0, z0, x1, y1, z1, x2, y2, z2], o);
    for (let k = 0; k < 9; k += 3) {
      nor[o + k] = nx; nor[o + k + 1] = ny; nor[o + k + 2] = nz;
      col[o + k] = tmp.r; col[o + k + 1] = tmp.g; col[o + k + 2] = tmp.b;
    }
    o += 9;
  }

  for (let r = 0; r < rows - 1; r++) {
    const z0 = -half + r * cell, z1 = z0 + cell;
    for (let c = 0; c < cols - 1; c++) {
      const x0 = -half + c * cell, x1 = x0 + cell;
      const a = heights[r * cols + c], b = heights[r * cols + c + 1];
      const d = heights[(r + 1) * cols + c], e = heights[(r + 1) * cols + c + 1];
      const za = zona[r * cols + c], zb = zona[r * cols + c + 1];
      const zd = zona[(r + 1) * cols + c], ze = zona[(r + 1) * cols + c + 1];
      tri(x0, a, z0, x0, d, z1, x1, b, z0, (za + zd + zb) / 3, hash2(c, r * 2, 7));       // NO: a, d, b
      tri(x1, b, z0, x0, d, z1, x1, e, z1, (zb + zd + ze) / 3, hash2(c, r * 2 + 1, 7));   // SE: b, d, e
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'terreno-superficie';
  return m;
}

const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

// Colore di una faccia: altitudine relativa t (0 = punto più basso, 1 = più alto) e pendenza di zona in gradi.
function faceColor(out, t, slope, rnd) {
  // prato: dal fondovalle ai crinali
  if (t < 0.5) out.copy(COL.fondovalle).lerp(COL.prato, smooth(0, 0.5, t));
  else out.copy(COL.prato).lerp(COL.pratoAlto, smooth(0.5, 1, t));
  // versanti ripidi → bosco; ripidissimi → roccia/argilla (calanchi)
  out.lerp(COL.bosco, smooth(PENDENZA_BOSCO[0], PENDENZA_BOSCO[1], slope));
  out.lerp(COL.roccia, smooth(PENDENZA_ROCCIA[0], PENDENZA_ROCCIA[1], slope));
  out.multiplyScalar(1 + (rnd * 2 - 1) * VARIAZIONE_FACCIA);
}

// ─── Lati del blocco di terreno ─────────────────────────────────────────
// Pareti verticali dal bordo della superficie fino a una base comune: viste da lontano,
// l'area sembra un plastico invece di un foglio sottile sospeso.

function buildSkirt(heights, cols, rows, cell, half, baseY) {
  const edges = [
    { n: cols, p: (i) => [-half + i * cell, heights[i], -half] },                                   // nord
    { n: cols, p: (i) => [-half + i * cell, heights[(rows - 1) * cols + i], half] },                // sud
    { n: rows, p: (i) => [-half, heights[i * cols], -half + i * cell] },                            // ovest
    { n: rows, p: (i) => [half, heights[i * cols + cols - 1], -half + i * cell] },                  // est
  ];
  const pos = [];
  for (const { n, p } of edges) {
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0, z0] = p(i), [x1, y1, z1] = p(i + 1);
      pos.push(x0, y0, z0, x0, baseY, z0, x1, y1, z1);
      pos.push(x1, y1, z1, x0, baseY, z0, x1, baseY, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: COL.bordo, side: THREE.DoubleSide, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'terreno-bordo';
  return m;
}

// ─── Fallback procedurale ───────────────────────────────────────────────

// Hash deterministico 2D → [0, 1)
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise 2D con interpolazione smoothstep, in [0, 1)
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Colline simili all'entroterra marchigiano: quote ~40–230 m.
function proceduralHeights(meta) {
  const { cols, rows, cellSize } = meta;
  const ottave = [[900, 75], [420, 32], [190, 12], [80, 4]];   // [lunghezza d'onda m, ampiezza m]
  const h = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellSize, z = r * cellSize;
      let y = 130;
      ottave.forEach(([w, amp], i) => { y += (valueNoise(x / w, z / w, 11 + i) * 2 - 1) * amp; });
      h[r * cols + c] = Math.max(y, 20);
    }
  }
  return h;
}

// ─── Suolo: terreno + strutture ─────────────────────────────────────────

/**
 * Suolo calpestabile: il terreno naturale, sostituito dove serve da superfici costruite
 * (terrapieno del cortile, rampe, più avanti pavimenti). Stessa interfaccia del terreno,
 * così cavaliere e camera non distinguono tra i due.
 * @param {object} terrain  oggetto restituito da loadTerrain
 * @param {Array<{quotaSuolo:(x:number, z:number) => (number|null)}>} strutture
 */
export function componiSuolo(terrain, strutture) {
  function costruita(x, z) {
    for (const s of strutture) {
      const h = s.quotaSuolo(x, z);
      if (h !== null) return h;
    }
    return null;
  }
  function getHeight(x, z) {
    const h = costruita(x, z);
    return h !== null ? h : terrain.getHeight(x, z);
  }
  function getSlope(x, z) {
    if (costruita(x, z) === null) return terrain.getSlope(x, z);
    const e = 0.3;
    const gx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
    const gz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }
  return { ...terrain, terreno: terrain, getHeight, getSlope };
}
