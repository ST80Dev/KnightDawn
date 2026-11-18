// Knight Dawn — castello 3D (milestone M4)
// Castello procedurale low-poly: cinta quadrata con scarpa, 4 torri angolari, mastio, torre-porta
// con passaggio ad arco. Merli a coda di rondine (ghibellini), come nelle rocche malatestiane della zona.
// Tutte le basi scendono sotto il punto più basso del terreno che coprono: niente fondamenta sospese.
// Il cortile è un terrapieno in piano alla quota più alta del terreno interno (le mura fanno da muro
// di contenimento); se fuori dalla porta il suolo è più basso, una rampa corta lo raccorda al pendio.
// quotaSuolo() dà la quota di cortile e rampa: il terreno la usa tramite componiSuolo (terrain.js).
//
// Coordinate locali del castello: origine al centro della cinta, la porta sta sul lato -Z locale.
// `rotazione` gira il castello attorno all'asse Y (π/2 = porta verso ovest).
// Collisioni: rettangoli e cerchi sul piano XZ locale; il passaggio della porta resta libero.

import * as THREE from 'three';

/** Parametri del castello: posizione e misure (m). */
export const CASTLE_CFG = {
  x: 225, z: 8,               // centro: sul colle a est del punto di partenza (~173 m s.l.m.)
  rotazione: Math.PI / 2,     // porta verso ovest, cioè verso il punto di partenza del cavaliere
  lato: 38,                   // interasse delle mura (cinta quadrata)
  spessore: 2.2,              // spessore delle mura
  altezzaMura: 9,             // sopra il punto più alto del terreno lungo ogni lato
  raggioTorre: 3.6,
  sopraTorri: 4,              // le torri superano le mura di tanto
  mastio: { lato: 11, altezza: 22 },
  porta: {
    larghezza: 3.4,           // luce del passaggio
    imposta: 3.0,             // altezza a cui parte l'arco (sopra il suolo più alto del passaggio)
    torreLarghezza: 8,        // torre-porta
    torreSporgenza: 3.5,      // quanto sporge all'esterno della cinta
    torreProfondita: 6,
    sopraMura: 3,
  },
  scarpa: 0.18,               // inclinazione della scarpa alla base (tangente: ~10°)
  rampa: { pendenzaMax: 0.25, lunghezzaMin: 3, lunghezzaMax: 20, parapetto: 0.5 },
};

const COL = {
  mattone:      '#a4634a',
  mattoneScuro: '#8a523d',
  pietra:       '#c4b597',
  merlo:        '#9b5c44',
  legno:        '#5b3b20',
  ferro:        '#2e2b28',
  fessura:      '#1c120c',
  terra:        '#9c8762',
};

// Luce riflessa (dal terreno e dal cielo) sulle pareti: senza, i lati in ombra delle mura escono
// quasi neri, perché la luce emisferica è tarata sul terreno, le cui facce guardano in alto.
const LUCE_RIFLESSA = 0.2;

const clamp = THREE.MathUtils.clamp;

// ─── Geometrie di base ──────────────────────────────────────────────────

/**
 * Prisma a facce piane tra due quadrilateri orizzontali (punti [x, z] nello stesso ordine).
 * Le facce si orientano da sole verso l'esterno: va bene per qualunque prisma convesso.
 */
function prisma(basso, alto, yb, yt) {
  const V = [...basso.map(([x, z]) => [x, yb, z]), ...alto.map(([x, z]) => [x, yt, z])];
  const C = [0, 1, 2].map((k) => V.reduce((s, v) => s + v[k], 0) / 8);
  const facce = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of facce) {
    const [a, b, c, d] = f.map((i) => V[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const fc = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - C[k]);
    const verso = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] >= 0;
    const tri = verso ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(...p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Quadrilatero di un rettangolo allineato agli assi locali. */
const rett4 = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Merlo a coda di rondine: base all'origine, faccia verso +Z. */
function geoMerlo() {
  const w = 0.95, h = 1.4, coda = 0.5;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h + coda);
  s.lineTo(0, h);
  s.lineTo(-w / 2, h + coda);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: false });
  geo.translate(0, 0, -0.275);
  return geo;
}

// ─── Castello ───────────────────────────────────────────────────────────

/**
 * Costruisce il castello sul terreno.
 * @param {object} terrain  getHeight(x, z)
 * @param {object} [opzioni] sovrascrive i campi di CASTLE_CFG (es. { x, z, rotazione })
 */
export function createCastle(terrain, opzioni = {}) {
  const cfg = { ...CASTLE_CFG, ...opzioni };
  const L = cfg.lato, H = L / 2, SP = cfg.spessore, R = cfg.raggioTorre, TAN = cfg.scarpa;
  const P = cfg.porta;
  const cos = Math.cos(cfg.rotazione), sin = Math.sin(cfg.rotazione);

  // Locale → mondo (stessa trasformazione del gruppo Three.js) e quota del terreno
  const mondoX = (lx, lz) => cfg.x + lx * cos + lz * sin;
  const mondoZ = (lx, lz) => cfg.z - lx * sin + lz * cos;
  const quota = (lx, lz) => terrain.getHeight(mondoX(lx, lz), mondoZ(lx, lz));

  /** Quote minima e massima del terreno su un rettangolo locale (campionato ogni `passo` m). */
  function quoteRett(x0, x1, z0, z1, passo = 1.5) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / passo)), nz = Math.max(1, Math.ceil((z1 - z0) / passo));
    let min = Infinity, max = -Infinity;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const h = quota(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    return { min, max };
  }

  // ─── Terrapieno del cortile e rampa della porta ───
  const INT = H - SP / 2;                                  // filo interno delle mura
  const gz0 = -H - P.torreSporgenza;                        // faccia esterna della torre-porta
  const qCortile = quoteRett(-INT, INT, -INT, INT, 0.75);
  const qPassaggio = quoteRett(-P.larghezza / 2, P.larghezza / 2, gz0, -INT, 0.5);
  const piano = Math.max(qCortile.max, qPassaggio.max) + 0.15;   // il terreno resta tutto sotto

  // Rampa: la più corta che resti entro la pendenza massima (se il pendio scende più in fretta,
  // quella con la pendenza minore). Raccorda in linea retta il piano al terreno al suo piede.
  const RA = cfg.rampa;
  const larghezzaRampa = P.larghezza + 0.6;
  let lunghezzaRampa = RA.lunghezzaMin;
  {
    let migliore = Infinity;
    for (let l = RA.lunghezzaMin; l <= RA.lunghezzaMax; l += 0.5) {
      const g = Math.abs(piano - quota(0, gz0 - l)) / l;
      if (g < migliore) { migliore = g; lunghezzaRampa = l; }
      if (g <= RA.pendenzaMax) break;
    }
  }
  function quotaRampa(lx, lz) {
    const t = clamp((gz0 - lz) / lunghezzaRampa, 0, 1);
    return piano + (quota(lx, gz0 - lunghezzaRampa) - piano) * t;
  }

  const mat = {};
  for (const [k, c] of Object.entries(COL)) {
    mat[k] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.terra.flatShading = false;
  mat.terra.polygonOffset = true;
  mat.terra.polygonOffsetFactor = -1;
  mat.terra.polygonOffsetUnits = -1;

  const object = new THREE.Group();
  object.name = 'castello';
  object.position.set(cfg.x, 0, cfg.z);
  object.rotation.y = cfg.rotazione;

  const solidi = [];          // mesh che bloccano la vista della camera
  function aggiungi(geo, m, solido = true) {
    const mesh = new THREE.Mesh(geo, m);
    object.add(mesh);
    if (solido) solidi.push(mesh);
    return mesh;
  }

  // Elementi ripetuti (instancing): posizioni raccolte qui, mesh create alla fine
  const merli = [], beccatelli = [], feritoie = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _y = new THREE.Vector3(0, 1, 0);
  const metti = (lista, x, y, z, angolo) => {
    _q.setFromAxisAngle(_y, angolo);
    lista.push(_m.compose(_p.set(x, y, z), _q, _s).clone());
  };
  const angoloDi = (nx, nz) => Math.atan2(nx, nz);   // ruota la faccia +Z verso (nx, nz)

  // Collisioni (coordinate locali)
  const rettangoli = [];      // { x0, x1, z0, z1 }
  const cerchi = [];          // { x, z, r }

  // ─── Mura ───
  // Ogni lato: linea mediana da a a b (lungo l'asse u), normale esterna n.
  const lati = {
    fronte: { u: [1, 0], n: [0, -1], c: -H },     // lato della porta
    retro:  { u: [1, 0], n: [0, 1], c: H },
    ovest:  { u: [0, 1], n: [-1, 0], c: -H },
    est:    { u: [0, 1], n: [1, 0], c: H },
  };
  const punto = (lato, s, d) => [                   // s lungo il lato, d verso l'esterno
    lato.u[0] * s + lato.n[0] * d + (lato.n[0] !== 0 ? lato.c : 0),
    lato.u[1] * s + lato.n[1] * d + (lato.n[1] !== 0 ? lato.c : 0),
  ];
  const rettLocale = (lato, s0, s1, d0, d1) => {
    const a = punto(lato, s0, d0), b = punto(lato, s1, d1);
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
  };

  for (const lato of Object.values(lati)) {
    const r = rettLocale(lato, -H, H, -SP / 2 - 1.5, SP / 2 + 2);
    const q = quoteRett(r.x0, r.x1, r.z0, r.z1);
    lato.base = q.min - 1;
    lato.cima = Math.max(q.max, piano) + cfg.altezzaMura;
    lato.scarpa = q.max + 2.5;          // fin dove arriva la scarpa
  }

  const tratti = [
    [lati.fronte, -H, -P.torreLarghezza / 2], [lati.fronte, P.torreLarghezza / 2, H],
    [lati.retro, -H, H], [lati.ovest, -H, H], [lati.est, -H, H],
  ];
  for (const [lato, s0, s1] of tratti) {
    const q4 = (d0, d1) => [punto(lato, s0, d0), punto(lato, s1, d0), punto(lato, s1, d1), punto(lato, s0, d1)];
    aggiungi(prisma(q4(-SP / 2, SP / 2), q4(-SP / 2, SP / 2), lato.base, lato.cima), mat.mattone);
    const off = (lato.scarpa - lato.base) * TAN;
    aggiungi(prisma(q4(0, SP / 2 + off), q4(0, SP / 2), lato.base, lato.scarpa), mat.mattoneScuro);

    // Collisione a pezzi di 2 m: la scarpa sporge di più dove il terreno è più basso
    for (let s = s0; s < s1 - 1e-6; s += 2) {
      const e = Math.min(s + 2, s1);
      const a = punto(lato, s, SP / 2), b = punto(lato, e, SP / 2 + 1.2);
      const q = quoteRett(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]));
      const sporge = SP / 2 + Math.max(0, lato.scarpa - q.min) * TAN;
      rettangoli.push(rettLocale(lato, s, e, -SP / 2, sporge));
    }

    // Merli sul filo esterno (non sopra le torri né sopra la torre-porta)
    const ang = angoloDi(lato.n[0], lato.n[1]);
    const libero = R + 0.9;
    for (let s = -H + libero; s <= H - libero + 1e-6; s += 2) {
      if (s < s0 || s > s1) continue;
      if (lato === lati.fronte && Math.abs(s) < P.torreLarghezza / 2 + 0.6) continue;
      const [x, z] = punto(lato, s, SP / 2 - 0.3);
      metti(merli, x, lato.cima, z, ang);
    }
  }

  // ─── Torri angolari ───
  const cordone = mat.pietra;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx * H, cz = sz * H;
    const q = quoteRett(cx - R - 1.5, cx + R + 1.5, cz - R - 1.5, cz + R + 1.5);
    const base = q.min - 1;
    const cima = Math.max(sx < 0 ? lati.ovest.cima : lati.est.cima, sz < 0 ? lati.fronte.cima : lati.retro.cima)
      + cfg.sopraTorri;
    const yScarpa = q.max + 2.5;
    const rBase = R + (yScarpa - base) * TAN;
    const parapetto = 1.3;

    const scarpa = aggiungi(new THREE.CylinderGeometry(R, rBase, yScarpa - base, 16), mat.mattoneScuro);
    scarpa.position.set(cx, (base + yScarpa) / 2, cz);
    const fusto = aggiungi(new THREE.CylinderGeometry(R, R, cima - parapetto - yScarpa, 16), mat.mattone);
    fusto.position.set(cx, (yScarpa + cima - parapetto) / 2, cz);
    const toro = aggiungi(new THREE.CylinderGeometry(R + 0.14, R + 0.14, 0.3, 16), cordone, false);
    toro.position.set(cx, yScarpa, cz);
    const par = aggiungi(new THREE.CylinderGeometry(R + 0.4, R + 0.4, parapetto, 16), mat.mattone);
    par.position.set(cx, cima - parapetto / 2, cz);

    const nMerli = Math.round((2 * Math.PI * (R + 0.15)) / 1.9);
    for (let i = 0; i < nMerli; i++) {
      const a = (i / nMerli) * Math.PI * 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      metti(merli, cx + nx * (R + 0.15), cima, cz + nz * (R + 0.15), a);
      metti(beccatelli, cx + nx * (R + 0.2), cima - parapetto - 0.3, cz + nz * (R + 0.2), a);
    }
    // Feritoie verso l'esterno, a due altezze
    for (const a of [Math.atan2(sx, sz), Math.atan2(sx, 0), Math.atan2(0, sz)]) {
      for (const y of [yScarpa + 3, cima - parapetto - 3]) {
        metti(feritoie, cx + Math.sin(a) * (R - 0.02), y, cz + Math.cos(a) * (R - 0.02), a);
      }
    }
    cerchi.push({ x: cx, z: cz, r: R + Math.max(0, yScarpa - q.min) * TAN });
  }

  // ─── Mastio, addossato al lato di fondo ───
  {
    const k = cfg.mastio.lato;
    const x0 = -k / 2, x1 = k / 2, z1 = H - SP / 2, z0 = z1 - k;
    const q = quoteRett(x0 - 1, x1 + 1, z0 - 1, z1);
    const base = q.min - 1;
    const yScarpa = piano + 1.5;                       // il mastio poggia sul terrapieno
    const cima = piano + cfg.mastio.altezza;
    const parapetto = 1.4;
    const off = (yScarpa - base) * TAN;

    aggiungi(prisma(rett4(x0 - off, x1 + off, z0 - off, z1), rett4(x0, x1, z0, z1), base, yScarpa), mat.mattoneScuro);
    aggiungi(prisma(rett4(x0, x1, z0, z1), rett4(x0, x1, z0, z1), yScarpa, cima - parapetto), mat.mattone);
    aggiungi(prisma(rett4(x0 - 0.14, x1 + 0.14, z0 - 0.14, z1), rett4(x0 - 0.14, x1 + 0.14, z0 - 0.14, z1),
      yScarpa - 0.15, yScarpa + 0.15), cordone, false);
    const e = 0.4;
    aggiungi(prisma(rett4(x0 - e, x1 + e, z0 - e, z1 + e), rett4(x0 - e, x1 + e, z0 - e, z1 + e),
      cima - parapetto, cima), mat.mattone);

    // Merli e beccatelli sui quattro lati
    const bordi = [
      { n: [0, -1], a: [x0, z0 - e], b: [x1, z0 - e] }, { n: [0, 1], a: [x0, z1 + e], b: [x1, z1 + e] },
      { n: [-1, 0], a: [x0 - e, z0], b: [x0 - e, z1] }, { n: [1, 0], a: [x1 + e, z0], b: [x1 + e, z1] },
    ];
    for (const { n, a, b } of bordi) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cnt = Math.round(len / 1.9);
      const ang = angoloDi(n[0], n[1]);
      for (let i = 0; i < cnt; i++) {
        const t = (i + 0.5) / cnt;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        metti(merli, x - n[0] * 0.3, cima, z - n[1] * 0.3, ang);
        metti(beccatelli, x - n[0] * 0.25, cima - parapetto - 0.3, z - n[1] * 0.25, ang);
      }
      if (n[1] === 1) continue;                     // il lato di fondo è dentro le mura: niente finestre
      for (const t of [0.3, 0.7]) {
        const x = a[0] + (b[0] - a[0]) * t - n[0] * (e + 0.02), z = a[1] + (b[1] - a[1]) * t - n[1] * (e + 0.02);
        metti(feritoie, x, yScarpa + 4, z, ang);
        metti(feritoie, x, cima - parapetto - 4, z, ang);
      }
    }
    const offSuolo = (yScarpa - piano) * TAN;
    rettangoli.push({ x0: x0 - offSuolo, x1: x1 + offSuolo, z0: z0 - offSuolo, z1 });
  }

  // ─── Torre-porta con passaggio ad arco ───
  let sogliaPorta;
  {
    const gw = P.torreLarghezza, pw = P.larghezza;
    const z0 = -H - P.torreSporgenza, z1 = z0 + P.torreProfondita;
    const q = quoteRett(-gw / 2 - 1, gw / 2 + 1, z0 - 1, z1);
    const base = Math.min(q.min, piano) - 1.5;
    const cima = lati.fronte.cima + P.sopraMura;
    const imposta = piano + P.imposta;
    sogliaPorta = piano;

    const s = new THREE.Shape();
    s.moveTo(-gw / 2, base);
    s.lineTo(gw / 2, base);
    s.lineTo(gw / 2, cima);
    s.lineTo(-gw / 2, cima);
    s.closePath();
    const foro = new THREE.Path();
    foro.moveTo(-pw / 2, piano - 0.4);
    foro.lineTo(pw / 2, piano - 0.4);
    foro.lineTo(pw / 2, imposta);
    foro.absarc(0, imposta, pw / 2, 0, Math.PI, false);
    foro.lineTo(-pw / 2, piano - 0.4);
    s.holes.push(foro);
    const geo = new THREE.ExtrudeGeometry(s, { depth: P.torreProfondita, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, z0);
    aggiungi(geo, mat.mattone);

    // Ghiera dell'arco in pietra sulla faccia esterna
    const ghiera = new THREE.Mesh(
      new THREE.TorusGeometry(pw / 2 + 0.2, 0.22, 4, 12, Math.PI), mat.pietra);
    ghiera.position.set(0, imposta, z0 - 0.05);
    object.add(ghiera);

    // Saracinesca sollevata: se ne vede solo il bordo dentuto sotto l'arco
    const yS = imposta + 0.45;
    for (let x = -pw / 2 + 0.25; x <= pw / 2 - 0.2; x += 0.38) {
      const barra = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), mat.ferro);
      barra.position.set(x, yS + 0.8, z0 + 0.5);
      const punta = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), mat.ferro);
      punta.rotation.x = Math.PI;
      punta.position.set(x, yS - 0.11, z0 + 0.5);
      object.add(barra, punta);
    }
    const traversa = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.1, 0.1), mat.ferro);
    traversa.position.set(0, yS + 0.15, z0 + 0.5);
    object.add(traversa);

    // Battenti aperti, appoggiati alla faccia interna della torre-porta
    const hBatt = imposta - piano + 0.6;
    for (const lato of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(pw / 2, hBatt, 0.12), mat.legno);
      b.position.set(lato * (pw / 2 + pw / 4), piano - 0.2 + hBatt / 2, z1 + 0.07);
      object.add(b);
      for (const y of [0.25, 0.75]) {                     // bandelle di ferro
        const f = new THREE.Mesh(new THREE.BoxGeometry(pw / 2 - 0.1, 0.1, 0.04), mat.ferro);
        f.position.set(lato * (pw / 2 + pw / 4), piano - 0.2 + hBatt * y, z1 + 0.15);
        object.add(f);
      }
    }

    // Merli sulla torre-porta
    for (let x = -gw / 2 + 0.6; x <= gw / 2 - 0.6 + 1e-6; x += (gw - 1.2) / 3) {
      metti(merli, x, cima, z0 + 0.3, Math.PI);
      metti(merli, x, cima, z1 - 0.3, 0);
    }
    for (const sx of [-1, 1]) {
      for (let z = z0 + 1.5; z <= z1 - 1.5 + 1e-6; z += (P.torreProfondita - 3) / 2) {
        metti(merli, sx * (gw / 2 - 0.3), cima, z, angoloDi(sx, 0));
      }
    }

    // Collisioni: le due spalle della porta (battenti compresi); il passaggio resta libero
    rettangoli.push({ x0: -gw / 2, x1: -pw / 2, z0, z1: z1 + 0.15 });
    rettangoli.push({ x0: pw / 2, x1: gw / 2, z0, z1: z1 + 0.15 });
  }

  // ─── Terrapieno, pavimento del passaggio, rampa ───
  {
    const pianoCortile = new THREE.Mesh(new THREE.PlaneGeometry(2 * INT, 2 * INT), mat.terra);
    pianoCortile.rotation.x = -Math.PI / 2;
    pianoCortile.position.y = piano;
    object.add(pianoCortile);
    const lastrico = new THREE.Mesh(new THREE.PlaneGeometry(P.larghezza, -INT - gz0), mat.pietra);
    lastrico.rotation.x = -Math.PI / 2;
    lastrico.position.set(0, piano + 0.01, (gz0 - INT) / 2);
    object.add(lastrico);

    // Rampa: striscia che segue quotaRampa, con due muretti ai lati fino sotto il terreno
    const n = Math.max(2, Math.ceil(lunghezzaRampa / 0.75));
    const w = larghezzaRampa / 2, sp = 0.45;
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const lz = gz0 - (lunghezzaRampa * i) / n;
      for (const lx of [-w, w]) pos.push(lx, quotaRampa(lx, lz) + 0.02, lz);
    }
    for (let i = 0; i < n; i++) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    aggiungi(geo, mat.pietra, false);
    for (const sx of [-1, 1]) {
      const x0 = sx * w, x1 = sx * (w + sp);
      for (let i = 0; i < n; i++) {
        const za = gz0 - (lunghezzaRampa * i) / n, zb = gz0 - (lunghezzaRampa * (i + 1)) / n;
        const yTop = Math.max(quotaRampa(x0, za), quotaRampa(x0, zb)) + RA.parapetto;
        const yBase = Math.min(quota(x1, za), quota(x1, zb), quota(x0, za), quota(x0, zb)) - 0.5;
        aggiungi(prisma(rett4(Math.min(x0, x1), Math.max(x0, x1), zb, za),
          rett4(Math.min(x0, x1), Math.max(x0, x1), zb, za), yBase, yTop), mat.mattoneScuro, false);
      }
      rettangoli.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: gz0 - lunghezzaRampa, z1: gz0 });
    }
  }

  /** Viottolo di terra battuta che prosegue dal piede della rampa, sul terreno. */
  function chiazza(x0, x1, z0, z1, passo = 1.0) {
    const nx = Math.ceil((x1 - x0) / passo), nz = Math.ceil((z1 - z0) / passo);
    const pos = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
        pos.push(x, quota(x, z) + 0.04, z);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    aggiungi(geo, mat.terra, false);
  }
  chiazza(-P.larghezza / 2, P.larghezza / 2, gz0 - lunghezzaRampa - 12, gz0 - lunghezzaRampa + 0.5);

  // ─── Instancing ───
  function istanze(geo, m, lista) {
    const im = new THREE.InstancedMesh(geo, m, lista.length);
    lista.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    object.add(im);
    return im;
  }
  const geoBecc = new THREE.BoxGeometry(0.35, 0.6, 0.5);
  istanze(geoMerlo(), mat.merlo, merli);
  istanze(geoBecc, mat.pietra, beccatelli);
  istanze(new THREE.BoxGeometry(0.22, 1.1, 0.12), mat.fessura, feritoie);

  object.updateMatrixWorld(true);       // la camera fa raycast su queste mesh già prima del primo render

  // ─── Collisioni ───
  const INGOMBRO = H + P.torreSporgenza + R + 4;

  /** Locale ↔ mondo per un punto sul piano XZ. */
  const inLocale = (x, z) => {
    const dx = x - cfg.x, dz = z - cfg.z;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };

  /**
   * Sposta un cerchio di raggio `raggio` centrato in (x, z) fuori da mura, torri e mastio.
   * Restituisce il punto corretto (mondo) oppure null se il punto è lontano dal castello.
   * Spingendo lungo la normale dell'ostacolo il cavaliere "scivola" lungo i muri.
   */
  function spingiFuori(x, z, raggio) {
    let [lx, lz] = inLocale(x, z);
    if (Math.abs(lx) > INGOMBRO || Math.abs(lz) > INGOMBRO) return null;
    for (let iter = 0; iter < 4; iter++) {
      let mosso = false;
      for (const r of rettangoli) {
        const qx = clamp(lx, r.x0, r.x1), qz = clamp(lz, r.z0, r.z1);
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= raggio * raggio) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          lx = qx + (ex / d) * raggio;
          lz = qz + (ez / d) * raggio;
        } else {                                  // centro dentro il rettangolo: esce dal lato più vicino
          const vie = [lx - r.x0, r.x1 - lx, lz - r.z0, r.z1 - lz];
          const m = vie.indexOf(Math.min(...vie));
          if (m === 0) lx = r.x0 - raggio; else if (m === 1) lx = r.x1 + raggio;
          else if (m === 2) lz = r.z0 - raggio; else lz = r.z1 + raggio;
        }
        mosso = true;
      }
      for (const c of cerchi) {
        const ex = lx - c.x, ez = lz - c.z;
        const d = Math.hypot(ex, ez), min = c.r + raggio;
        if (d >= min) continue;
        const k = d > 1e-6 ? min / d : 0;
        lx = d > 1e-6 ? c.x + ex * k : c.x + min;
        lz = d > 1e-6 ? c.z + ez * k : lz;
        mosso = true;
      }
      if (!mosso) break;
    }
    return { x: mondoX(lx, lz), z: mondoZ(lx, lz) };
  }

  /**
   * Quota del suolo costruito nel punto (mondo): terrapieno del cortile, passaggio della porta, rampa.
   * null fuori da queste aree (vale il terreno naturale).
   */
  function quotaSuolo(x, z) {
    const [lx, lz] = inLocale(x, z);
    if (Math.abs(lx) <= INT && Math.abs(lz) <= INT) return piano;
    if (Math.abs(lx) <= P.torreLarghezza / 2 && lz >= gz0 && lz <= -INT) return piano;
    if (Math.abs(lx) <= larghezzaRampa / 2 && lz < gz0 && lz >= gz0 - lunghezzaRampa) return quotaRampa(lx, lz);
    return null;
  }

  /** true se il punto (mondo) è dentro la cinta. */
  function dentro(x, z) {
    const [lx, lz] = inLocale(x, z);
    return Math.abs(lx) < H - SP / 2 && Math.abs(lz) < H - SP / 2;
  }

  /** Punto davanti alla porta, all'esterno (mondo): utile per i test e per i segnaposto. */
  function davantiPorta(distanza = 8) {
    const lz = gz0 - lunghezzaRampa - distanza;
    return { x: mondoX(0, lz), z: mondoZ(0, lz) };
  }

  return {
    object, cfg, solidi, rettangoli, cerchi, sogliaPorta, piano, lunghezzaRampa,
    spingiFuori, dentro, davantiPorta, inLocale, quotaSuolo,
  };
}
