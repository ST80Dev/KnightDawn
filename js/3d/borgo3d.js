// Knight Dawn — borgo murato (M7, passo 4). Senza edifici: terrazze con il loro pavimento, muri di contenimento
// tra una terrazza e l'altra con la rampa della via, cinta con torri quadrate e torre-porta dove arriva la strada.
//
// Il borgo poggia sui piani del terrapieno (js/mondo/luoghi.js, `luogo.piani`: il primo è la rocca, gli altri le
// terrazze, lungo il verso del borgo). Coordinate locali: u lungo il verso (dalla rocca verso la porta del borgo),
// v di traverso (come `distanzaPiano` in js/mondo/scena.js). Le geometrie si costruiscono direttamente in coordinate
// del blocco e si uniscono per materiale (docs/PRESTAZIONI.md, passo 6: mura unite per materiale, ≤ 8 materiali,
// ripetuti in InstancedMesh): pochi oggetti da disegnare qualunque sia la grandezza del borgo.
// Interfaccia come la rocca (castle3d.js): object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci.

import * as THREE from 'three';

/** Misure secondo la classe del luogo. */
export const CLASSI_BORGO = {
  minore:   { altezza: 6, spessore: 1.4, torre: 4.2, passoTorri: 32 },
  casata:   { altezza: 7, spessore: 1.6, torre: 5, passoTorri: 35 },
  maggiore: { altezza: 8, spessore: 1.8, torre: 5.6, passoTorri: 38 },
};

const PORTA = { larghezza: 3.6, imposta: 3.0, torreLarghezza: 8, torreProfondita: 6, sopraMura: 3.5 };
const VIA = { larghezza: 4, pendenza: 0.25, minima: 4, parapetto: 0.6 };   // rampe tra le terrazze
const RAMPA_PORTA = { pendenza: 0.2, minima: 3, massima: 24, larghezza: 5 };  // fuori dalla porta, fino al terreno
const CONTENIMENTO = { spessore: 1.0, parapetto: 1.0 };
const SCARPA = 0.15;                       // inclinazione della scarpa alla base delle mura (tangente)

const COL = { mattone: '#a8684d', scuro: '#8a523d', pietra: '#c4b597', terra: '#a08a64', legno: '#5b3b20' };
const LUCE_RIFLESSA = 0.2;                 // come la rocca: i lati in ombra non escono neri

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ─── Geometrie ──────────────────────────────────────────────────────────

/** Prisma a facce piane tra due quadrilateri orizzontali (punti [x, z], stesso ordine), facce verso l'esterno. */
function prisma(basso, alto, yb, yt) {
  const V = [...basso.map(([x, z]) => [x, yb, z]), ...alto.map(([x, z]) => [x, yt, z])];
  const C = [0, 1, 2].map((k) => V.reduce((s, v) => s + v[k], 0) / 8);
  const facce = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of facce) {
    const [a, b, c, d] = f.map((i) => V[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const fc = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - C[k]);
    const tri = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(...p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Unisce geometrie non indicizzate (posizione e normale) in una sola. */
function unisci(parti) {
  if (!parti.length) return null;
  const n = parti.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of parti) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
    if (g !== g0) g0.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ─── Borgo ──────────────────────────────────────────────────────────────

/**
 * Costruisce il borgo murato di un luogo.
 * @param {{getHeight:(x:number, z:number) => number}} suolo  quota del terreno in coordinate del blocco
 * @param {object} luogo  da carta.luoghi (piani, verso, classe)
 * @param {number} ox  centro del sito (rocca) in coordinate del blocco
 * @param {number} oz
 * @param {{ HZ:number, HX:number, R:number }} rocca  mezze misure della cinta della rocca e raggio delle torri
 */
export function createBorgo(suolo, luogo, ox, oz, rocca) {
  const K = CLASSI_BORGO[luogo.classe] ?? CLASSI_BORGO.casata;
  const ux = luogo.verso.x, uz = luogo.verso.z;
  const P = luogo.piani, R0 = P[0], T = P.slice(1);
  const SP = K.spessore, H = K.altezza;
  const ra = R0.a;                                         // fine del piano della rocca lungo u
  const lb = T[0].b;                                       // mezza larghezza del borgo
  const uFine = ra + T.reduce((s, t) => s + 2 * t.a, 0);   // fine dell'ultima terrazza (porta del borgo)
  // Locale (u, v) → blocco (x, z) e quota del terreno.
  const X = (u, v) => ox + ux * u - uz * v, Z = (u, v) => oz + uz * u + ux * v;
  const xz = (u, v) => [X(u, v), Z(u, v)];
  const terreno = (u, v) => suolo.getHeight(X(u, v), Z(u, v));
  const inLocale = (x, z) => { const dx = x - ox, dz = z - oz; return [dx * ux + dz * uz, -dx * uz + dz * ux]; };
  /** Quota minima del terreno lungo un segmento locale (campioni ogni ~1,5 m), anche un po' fuori. */
  function minimoLungo(u0, v0, u1, v1, fuoriU = 0, fuoriV = 0) {
    const n = Math.max(2, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 1.5));
    let mn = Infinity;
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * i / n, v = v0 + (v1 - v0) * i / n;
      mn = Math.min(mn, terreno(u, v), terreno(u + fuoriU, v + fuoriV));
    }
    return mn;
  }
  // Terrazze: estensione lungo u e quota.
  const terrazze = [];
  { let u = ra; for (const t of T) { terrazze.push({ u0: u, u1: u + 2 * t.a, q: t.q }); u += 2 * t.a; } }
  const terrazzaDi = (u) => terrazze.find((t) => u >= t.u0 && u <= t.u1) ?? null;

  const mat = {};
  for (const [k, c] of Object.entries(COL)) {
    mat[k] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.terra.flatShading = false;
  mat.terra.polygonOffset = true;                 // il pavimento coincide con il terreno dei piani più bassi
  mat.terra.polygonOffsetFactor = -1;
  mat.terra.polygonOffsetUnits = -1;
  const parti = { mattone: [], scuro: [], pietra: [], terra: [], legno: [] };
  const rettangoli = [];                          // collisioni in locale: { u0, u1, v0, v1 }

  /** Quadrilatero locale (u, v) → punti [x, z] del blocco. */
  const quad = (u0, u1, v0, v1) => [xz(u0, v0), xz(u1, v0), xz(u1, v1), xz(u0, v1)];
  /** Pavimento piano (due triangoli verso l'alto). */
  function pavimento(u0, u1, v0, v1, y, m = 'terra') {
    const [a, b, c, d] = quad(u0, u1, v0, v1).map(([x, z]) => [x, y, z]);
    const geo = new THREE.BufferGeometry();
    // Ordine dei vertici con la normale verso l'alto (dipende dal verso degli assi locali).
    const su = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]) < 0;
    const tri = su ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
    geo.computeVertexNormals();
    parti[m].push(geo);
  }

  // ─── Pavimenti delle terrazze ───
  for (const t of terrazze) pavimento(t.u0, t.u1, -lb + SP / 2, lb - SP / 2, t.q);

  // ─── Muri di contenimento e rampe della via ───
  const rampe = [];                               // { u0, u1, y0, y1 } in locale, |v| ≤ VIA.larghezza / 2
  for (let i = 0; i + 1 < terrazze.length; i++) {
    const su = terrazze[i], giu = terrazze[i + 1], ub = su.u1, salto = su.q - giu.q;
    if (salto < 0.3) continue;                    // quasi alla stessa quota: niente muro
    const w = VIA.larghezza / 2, sp = CONTENIMENTO.spessore;
    for (const [v0, v1] of [[-lb + SP / 2, -w - 0.4], [w + 0.4, lb - SP / 2]]) {
      parti.mattone.push(prisma(quad(ub, ub + sp, v0, v1), quad(ub, ub + sp, v0, v1), giu.q - 0.6, su.q + CONTENIMENTO.parapetto));
      rettangoli.push({ u0: ub - 0.3, u1: ub + sp, v0: Math.min(v0, v1), v1: Math.max(v0, v1) });
    }
    // Rampa nella terrazza più bassa, dal bordo del muro fino al suo pavimento.
    const lunga = clamp(salto / VIA.pendenza, VIA.minima, Math.max(VIA.minima, giu.u1 - giu.u0 - 6));
    const r = { u0: ub, u1: ub + lunga, y0: su.q, y1: giu.q };
    rampe.push(r);
    const [a, b, c, d] = [[ub, -w, r.y0], [ub + lunga, -w, r.y1], [ub + lunga, w, r.y1], [ub, w, r.y0]]
      .map(([u, v, y]) => [X(u, v), y + 0.03, Z(u, v)]);
    const geo = new THREE.BufferGeometry();
    const sopra = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]) < 0;
    geo.setAttribute('position', new THREE.Float32BufferAttribute((sopra ? [a, b, c, a, c, d] : [a, c, b, a, d, c]).flat(), 3));
    geo.computeVertexNormals();
    parti.pietra.push(geo);
    // Muretti ai lati della rampa (si vede il salto; non ci si cade di lato).
    for (const s of [-1, 1]) {
      const v0 = s * w, v1 = s * (w + 0.4);
      const n = Math.max(2, Math.ceil(lunga / 2));
      for (let k = 0; k < n; k++) {
        const ua = ub + lunga * k / n, ub2 = ub + lunga * (k + 1) / n;
        const yTop = r.y0 + (r.y1 - r.y0) * (k / n) + VIA.parapetto;
        parti.pietra.push(prisma(quad(ua, ub2, Math.min(v0, v1), Math.max(v0, v1)), quad(ua, ub2, Math.min(v0, v1), Math.max(v0, v1)), giu.q - 0.3, yTop));
      }
      rettangoli.push({ u0: ub, u1: ub + lunga, v0: Math.min(v0, v1), v1: Math.max(v0, v1) });
    }
  }

  // ─── Cinta ───
  // Tratti: lati (v = ±lb) per terrazza, fondo con la porta (u = uFine), retro (u = ra) dai lati fino alle torri
  // della rocca. Ognuno: base sotto il terreno esterno, cima H sopra il pavimento interno; scarpa all'esterno.
  const merli = [];                               // { u, v, y, nu, nv }
  const torri = [];                               // { u, v, base, cima }
  function tratto(u0, v0, u1, v1, nu, nv, qDentro) {
    const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv);
    if (len < 0.5) return;
    const tu = du / len, tv = dv / len;
    // Linea mediana del muro: spostata di SP/2 verso l'interno rispetto al bordo.
    const pu = -nu * SP / 2, pv = -nv * SP / 2;
    const a0 = [u0 + pu - nu * SP / 2, v0 + pv - nv * SP / 2], a1 = [u1 + pu - nu * SP / 2, v1 + pv - nv * SP / 2];
    const b0 = [u0 + pu + nu * SP / 2, v0 + pv + nv * SP / 2], b1 = [u1 + pu + nu * SP / 2, v1 + pv + nv * SP / 2];
    const base = minimoLungo(u0, v0, u1, v1, nu * 2, nv * 2) - 1;
    const cima = qDentro + H;
    const q4 = (p, q, r, s) => [xz(...p), xz(...q), xz(...r), xz(...s)];
    parti.mattone.push(prisma(q4(a0, a1, b1, b0), q4(a0, a1, b1, b0), base, cima));
    // Scarpa esterna fino a 2 m sopra il pavimento.
    const yS = Math.max(base + 0.5, qDentro + 2), off = (yS - base) * SCARPA;
    const c0 = [b0[0] + nu * off, b0[1] + nv * off], c1 = [b1[0] + nu * off, b1[1] + nv * off];
    parti.scuro.push(prisma(q4(a0, a1, c1, c0), q4(a0, a1, b1, b0), base, yS));
    // Collisione (con la scarpa).
    const us = [a0[0], a1[0], c0[0], c1[0]], vs = [a0[1], a1[1], c0[1], c1[1]];
    rettangoli.push({ u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) });
    // Merli sul filo esterno.
    const n = Math.floor(len / 1.9);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      merli.push({ u: u0 + du * t + pu + nu * (SP / 2 - 0.3), v: v0 + dv * t + pv + nv * (SP / 2 - 0.3), y: cima, nu, nv });
    }
    return { base, cima, tu, tv };
  }
  // Lati, terrazza per terrazza (la cima segue il pavimento: mura a gradoni).
  for (const s of [-1, 1]) {
    for (const t of terrazze) tratto(t.u0, s * lb, t.u1, s * lb, 0, s, t.q);
  }
  // Fondo, con la porta al centro.
  const ultima = terrazze[terrazze.length - 1];
  const gw = PORTA.torreLarghezza;
  for (const s of [-1, 1]) tratto(uFine, s * gw / 2, uFine, s * lb, 1, 0, ultima.q);
  // Retro: dal lato fino a dentro le torri della rocca (che coprono la giunzione).
  const vRocca = Math.max(0, rocca.HX - 1);
  for (const s of [-1, 1]) tratto(ra, s * lb, ra, s * vRocca, -1, 0, terrazze[0].q);

  // Torri quadrate: agli angoli del fondo e del retro, e lungo i lati ogni ~passoTorri.
  const lt = K.torre / 2;
  const posti = [[uFine, -lb], [uFine, lb], [ra, -lb], [ra, lb]];
  for (const s of [-1, 1]) {
    const n = Math.floor((uFine - ra) / K.passoTorri);
    for (let k = 1; k <= n - 0; k++) {
      const u = ra + (uFine - ra) * k / (n + 1);
      posti.push([u, s * lb]);
    }
  }
  for (const [u, v] of posti) {
    const t = terrazzaDi(clamp(u, ra + 0.01, uFine - 0.01));
    const qD = t ? t.q : terrazze[0].q;
    const base = Math.min(terreno(u - lt - 1, v), terreno(u + lt + 1, v), terreno(u, v - lt - 1), terreno(u, v + lt + 1), terreno(u, v)) - 1;
    const cima = qD + H + 2.5;
    parti.mattone.push(prisma(quad(u - lt, u + lt, v - lt, v + lt), quad(u - lt, u + lt, v - lt, v + lt), base, cima));
    const e = 0.35;                                       // parapetto sporgente in cima
    parti.mattone.push(prisma(quad(u - lt - e, u + lt + e, v - lt - e, v + lt + e), quad(u - lt - e, u + lt + e, v - lt - e, v + lt + e), cima - 1.2, cima));
    rettangoli.push({ u0: u - lt - e, u1: u + lt + e, v0: v - lt - e, v1: v + lt + e });
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const o of [-lt + 0.7, 0, lt - 0.7]) {
        merli.push({ u: u + nu * (lt + e - 0.3) + (nv !== 0 ? o : 0), v: v + nv * (lt + e - 0.3) + (nu !== 0 ? o : 0), y: cima, nu, nv });
      }
    }
    torri.push({ u, v, base, cima });
  }

  // ─── Torre-porta del borgo (sul fondo, al centro) ───
  {
    const pw = PORTA.larghezza, prof = PORTA.torreProfondita, q = ultima.q;
    const u0 = uFine - prof + 1, u1 = uFine + 1;          // sporge di 1 m fuori dalla cinta
    const base = Math.min(minimoLungo(u1, -gw / 2, u1, gw / 2, 2, 0), q) - 1.5;
    const cima = q + H + PORTA.sopraMura, imposta = q + PORTA.imposta;
    const s = new THREE.Shape();
    s.moveTo(-gw / 2, base); s.lineTo(gw / 2, base); s.lineTo(gw / 2, cima); s.lineTo(-gw / 2, cima); s.closePath();
    const foro = new THREE.Path();
    foro.moveTo(-pw / 2, q - 0.4); foro.lineTo(pw / 2, q - 0.4); foro.lineTo(pw / 2, imposta);
    foro.absarc(0, imposta, pw / 2, 0, Math.PI, false);
    foro.lineTo(-pw / 2, q - 0.4);
    s.holes.push(foro);
    const geo = new THREE.ExtrudeGeometry(s, { depth: prof, bevelEnabled: false, curveSegments: 10 }).toNonIndexed();
    // Forma: x → −v (così il sistema resta destrorso), y → quota, profondità → u.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = -p.getX(i), y = p.getY(i), u = u0 + p.getZ(i);
      p.setXYZ(i, X(u, v), y, Z(u, v));
    }
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    parti.mattone.push(geo);
    parti.pietra.push(prisma(quad(u0, u1, -pw / 2, pw / 2), quad(u0, u1, -pw / 2, pw / 2), q - 0.5, q + 0.02));   // soglia
    // Battenti aperti, contro la faccia interna.
    for (const lato of [-1, 1]) {
      const v0 = lato * pw / 2, v1 = lato * pw;
      parti.legno.push(prisma(quad(u0 - 0.14, u0, Math.min(v0, v1), Math.max(v0, v1)), quad(u0 - 0.14, u0, Math.min(v0, v1), Math.max(v0, v1)), q, imposta + 0.6));
    }
    for (const lato of [-1, 1]) {
      const v0 = lato * pw / 2, v1 = lato * gw / 2;
      rettangoli.push({ u0, u1, v0: Math.min(v0, v1), v1: Math.max(v0, v1) });
    }
    for (let k = 0; k < 4; k++) {
      const vv = -gw / 2 + 0.6 + (gw - 1.2) * k / 3;
      merli.push({ u: u1 - 0.3, v: vv, y: cima, nu: 1, nv: 0 });
      merli.push({ u: u0 + 0.3, v: vv, y: cima, nu: -1, nv: 0 });
    }
  }

  // ─── Rampa fuori dalla porta: dal passaggio al terreno (il terrapieno a 25° sta sotto il pavimento) ───
  const uPorta = uFine + 1;
  let lungaPorta = RAMPA_PORTA.minima;
  {
    let migliore = Infinity;
    for (let l = RAMPA_PORTA.minima; l <= RAMPA_PORTA.massima; l += 0.5) {
      const g = Math.abs(ultima.q - terreno(uPorta + l, 0)) / l;
      if (g < migliore) { migliore = g; lungaPorta = l; }
      if (g <= RAMPA_PORTA.pendenza) break;
    }
  }
  const piedePorta = (v) => terreno(uPorta + lungaPorta, v);
  const quotaRampaPorta = (u, v) => ultima.q + (piedePorta(v) - ultima.q) * clamp((u - uPorta) / lungaPorta, 0, 1);
  {
    const w = RAMPA_PORTA.larghezza / 2, n = Math.max(2, Math.ceil(lungaPorta / 1.5));
    for (let i = 0; i < n; i++) {
      const ua = uPorta + lungaPorta * i / n, ub2 = uPorta + lungaPorta * (i + 1) / n;
      const pts = [[ua, -w], [ub2, -w], [ub2, w], [ua, w]].map(([u, v]) => [X(u, v), quotaRampaPorta(u, v) + 0.04, Z(u, v)]);
      const [a, b, c, d] = pts;
      const geo = new THREE.BufferGeometry();
      const sopra = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]) < 0;
      geo.setAttribute('position', new THREE.Float32BufferAttribute((sopra ? [a, b, c, a, c, d] : [a, c, b, a, d, c]).flat(), 3));
      geo.computeVertexNormals();
      parti.pietra.push(geo);
      // Fianchi della rampa fino sotto il terreno (si vede un rilevato in muratura, non un nastro sospeso).
      for (const sv of [-1, 1]) {
        const v0 = sv * w, v1 = sv * (w + 0.5);
        const yTop = Math.max(quotaRampaPorta(ua, v0), quotaRampaPorta(ub2, v0)) + 0.3;
        const yBase = Math.min(terreno(ua, v1), terreno(ub2, v1), terreno(ua, v0), terreno(ub2, v0)) - 0.5;
        if (yTop - yBase > 0.6) parti.pietra.push(prisma(quad(ua, ub2, Math.min(v0, v1), Math.max(v0, v1)), quad(ua, ub2, Math.min(v0, v1), Math.max(v0, v1)), yBase, yTop));
      }
    }
  }

  // ─── Oggetti: uno per materiale, merli a istanze ───
  const object = new THREE.Group();
  object.name = 'borgo';
  const solidi = [];
  for (const [k, lista] of Object.entries(parti)) {
    const geo = unisci(lista);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat[k]);
    m.name = `borgo-${k}`;
    object.add(m);
    if (k === 'mattone' || k === 'scuro') solidi.push(m);   // la camera non passa attraverso le mura
  }
  {
    const geo = new THREE.BoxGeometry(0.85, 1.1, 0.5);
    geo.translate(0, 0.55, 0);
    const im = new THREE.InstancedMesh(geo, mat.mattone, merli.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), y = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1);
    merli.forEach((m, i) => {
      // Normale esterna in coordinate del blocco.
      const nx = ux * m.nu - uz * m.nv, nz = uz * m.nu + ux * m.nv;
      q4.setFromAxisAngle(y, Math.atan2(nx, nz));
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(X(m.u, m.v), m.y, Z(m.u, m.v)), q4, s1));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'borgo-merli';
    object.add(im);
  }
  object.updateMatrixWorld(true);

  // ─── Collisioni e suolo ───
  const INGOMBRO_U0 = ra - 4, INGOMBRO_U1 = uFine + 6 + lungaPorta, INGOMBRO_V = lb + 6;
  function spingiFuori(x, z, raggio) {
    let [u, v] = inLocale(x, z);
    if (u < INGOMBRO_U0 - raggio || u > INGOMBRO_U1 + raggio || Math.abs(v) > INGOMBRO_V + raggio) return null;
    for (let iter = 0; iter < 4; iter++) {
      let mosso = false;
      for (const r of rettangoli) {
        const qu = clamp(u, r.u0, r.u1), qv = clamp(v, r.v0, r.v1);
        const eu = u - qu, ev = v - qv, d2 = eu * eu + ev * ev;
        if (d2 >= raggio * raggio) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          u = qu + (eu / d) * raggio; v = qv + (ev / d) * raggio;
        } else {
          const vie = [u - r.u0, r.u1 - u, v - r.v0, r.v1 - v];
          const m = vie.indexOf(Math.min(...vie));
          if (m === 0) u = r.u0 - raggio; else if (m === 1) u = r.u1 + raggio;
          else if (m === 2) v = r.v0 - raggio; else v = r.v1 + raggio;
        }
        mosso = true;
      }
      if (!mosso) break;
    }
    return { x: X(u, v), z: Z(u, v) };
  }

  /** Quota del suolo costruito: pavimenti delle terrazze, rampe della via, passaggio della porta. null altrove. */
  function quotaSuolo(x, z) {
    const [u, v] = inLocale(x, z);
    if (u > uPorta && u <= uPorta + lungaPorta && Math.abs(v) <= RAMPA_PORTA.larghezza / 2) return quotaRampaPorta(u, v);
    if (u < ra || u > uPorta || Math.abs(v) > lb - SP / 2) return null;
    if (u > uFine - PORTA.torreProfondita + 1) return Math.abs(v) <= PORTA.larghezza / 2 ? ultima.q : null;
    if (Math.abs(v) <= VIA.larghezza / 2) {
      for (const r of rampe) if (u >= r.u0 && u <= r.u1) return r.y0 + (r.y1 - r.y0) * (u - r.u0) / (r.u1 - r.u0);
    }
    const t = terrazzaDi(u);
    return t ? t.q : null;
  }

  /** true se il punto è dentro la cinta del borgo. */
  function dentro(x, z) {
    const [u, v] = inLocale(x, z);
    return u > ra && u < uFine && Math.abs(v) < lb - SP;
  }

  return {
    tipo: 'borgo', luogo, object, solidi, rettangoli, spingiFuori, quotaSuolo, dentro,
    aggiornaLuci() {},                            // luci del borgo: passo 7
    misure: { terrazze: terrazze.length, rampe: rampe.length, torri: torri.length, merli: merli.length,
      oggetti: object.children.length, triangoli: object.children.reduce((s, m) => s + (m.isInstancedMesh
        ? m.geometry.index.count / 3 * m.count : m.geometry.attributes.position.count / 3), 0) },
  };
}
