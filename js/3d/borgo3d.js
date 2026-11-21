// Knight Dawn — borgo murato (M7, passo 4). Senza edifici: cinta con torri quadrate e torre-porta dove arriva la
// strada, rete di strade interne di ciottolato.
//
// Il borgo sta in **pendio** (decisione dell'utente: niente terrazze piatte con muri di sostegno né scalinata
// centrale, «troppo moderno», «sembra l'interno di un palazzo»): il terreno dentro le mura è quello naturale
// lisciato (`luogo.piani[1].griglia`, js/mondo/luoghi.js; il primo piano è la rocca, in piano). Le mura seguono il
// pendio a gradoni brevi; le strade (via principale dalla porta alla rampa della rocca, a tornanti se il pendio è
// ripido; via lungo le mura; vicoli lungo le curve di livello) girano per tutto il borgo e ne fanno gli isolati
// dove andranno le case (passo 5).
//
// Coordinate locali: u lungo il verso (dalla rocca verso la porta del borgo), v di traverso (come `distanzaPiano` in
// js/mondo/scena.js). Le geometrie si costruiscono in coordinate del blocco e si uniscono per materiale
// (docs/PRESTAZIONI.md, passo 6: ≤ 8 materiali, ripetuti in InstancedMesh, dettaglio in una texture generata una
// volta): pochi oggetti da disegnare qualunque sia la grandezza del borgo.
// Interfaccia come la rocca (castle3d.js): object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci.

import * as THREE from 'three';

/** Misure secondo la classe del luogo. vicoli: quanti vicoli trasversali. */
export const CLASSI_BORGO = {
  minore:   { altezza: 6, spessore: 1.4, torre: 4.2, passoTorri: 32, vicoli: 1 },
  casata:   { altezza: 7, spessore: 1.6, torre: 5, passoTorri: 35, vicoli: 2 },
  maggiore: { altezza: 8, spessore: 1.8, torre: 5.6, passoTorri: 38, vicoli: 3 },
};

const PORTA = { larghezza: 3.6, imposta: 3.0, torreLarghezza: 8, torreProfondita: 6, sopraMura: 3.5 };
const RAMPA_PORTA = { pendenza: 0.2, minima: 3, massima: 24, larghezza: 5 };  // fuori dalla porta, fino al terreno
const TRATTO = 6;                          // m: lunghezza dei gradoni delle mura sul pendio
const SCARPA = 0.15;                       // inclinazione della scarpa alla base delle mura (tangente)
// Strade interne: larghezza (m), quota sopra il terreno (m; diverse, così agli incroci non sfarfallano).
const STRADE = {
  via: { larghezza: 4.2, sopra: 0.14 },
  mura: { larghezza: 3.0, sopra: 0.12, rientro: 10 },   // via lungo le mura, a `rientro` m dalla cinta
  vicolo: { larghezza: 2.6, sopra: 0.13 },
  pendenzaVia: 0.1,                        // oltre, la via principale sale a tornanti
  passo: 2,                                // m tra le sezioni del nastro
};

const COL = { mattone: '#a8684d', scuro: '#8a523d', pietra: '#c4b597', legno: '#5b3b20' };
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
  const n = parti.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count), 0);
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

// ─── Ciottolato: texture generata una volta (docs/PRESTAZIONI.md: dettaglio in texture, non in geometria) ───
let _ciottolato = null;
function texturaCiottolato() {
  if (_ciottolato) return _ciottolato;
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  g.fillStyle = '#857d70';                               // malta e terra tra i ciottoli
  g.fillRect(0, 0, N, N);
  // Ciottoli: ellissi irregolari, toni di grigio caldo; disegnati anche a cavallo dei bordi (texture ripetibile).
  for (let k = 0; k < 230; k++) {
    const x = rnd() * N, y = rnd() * N, rx = 7 + rnd() * 9, ry = 5 + rnd() * 7, a = rnd() * Math.PI;
    const t = 165 + Math.floor(rnd() * 55), cal = Math.floor(rnd() * 12);
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const cx = x + dx, cy = y + dy;
      if (cx < -20 || cy < -20 || cx > N + 20 || cy > N + 20) continue;
      const gr = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 1, cx, cy, Math.max(rx, ry));
      gr.addColorStop(0, `rgb(${t + 25 + cal},${t + 22},${t + 16})`);
      gr.addColorStop(1, `rgb(${t - 25 + cal},${t - 27},${t - 32})`);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  _ciottolato = tex;
  return tex;
}

/** Polilinea più morbida (Chaikin), estremi fermi. */
function chaikin(p, volte) {
  for (let k = 0; k < volte; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [a, b] = [p[i], p[i + 1]];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Punti ogni `passo` m lungo una polilinea (u, v). */
function ricampiona(p, passo) {
  const out = [p[0]];
  let resto = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const [a, b] = [p[i], p[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = passo - resto;
    while (t <= l) { out.push([a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]); t += passo; }
    resto = l - (t - passo);
  }
  const ult = p[p.length - 1];
  if (Math.hypot(ult[0] - out[out.length - 1][0], ult[1] - out[out.length - 1][1]) > passo * 0.3) out.push(ult);
  return out;
}

// ─── Borgo ──────────────────────────────────────────────────────────────

/**
 * Costruisce il borgo murato di un luogo.
 * @param {{getHeight:(x:number, z:number) => number}} suolo  quota del terreno in coordinate del blocco
 * @param {object} luogo  da carta.luoghi (piani, verso, classe)
 * @param {number} ox  centro del sito (rocca) in coordinate del blocco
 * @param {number} oz
 * @param {{ HZ:number, HX:number, R:number, piedeRampa:number }} rocca  mezze misure della cinta della rocca, raggio
 *   delle sue torri; distanza (m, lungo il verso dal centro della rocca) del piede della rampa della sua porta
 */
export function createBorgo(suolo, luogo, ox, oz, rocca) {
  const K = CLASSI_BORGO[luogo.classe] ?? CLASSI_BORGO.casata;
  const ux = luogo.verso.x, uz = luogo.verso.z;
  const R0 = luogo.piani[0], B = luogo.piani[1];
  const SP = K.spessore, H = K.altezza;
  const ra = R0.a;                                         // fine del piano della rocca lungo u
  const lb = B.b;                                          // mezza larghezza del borgo
  const uFine = ra + 2 * B.a;                              // fine del borgo (porta)
  const fase = (luogo.id + 1) * 1.7 + luogo.x * 1e-3;      // varia le curve da un borgo all'altro
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

  const mat = {};
  for (const [k, c] of Object.entries(COL)) {
    mat[k] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.strada = new THREE.MeshLambertMaterial({ map: texturaCiottolato(), color: '#ffffff' });
  mat.strada.polygonOffset = true;
  mat.strada.polygonOffsetFactor = -2;
  mat.strada.polygonOffsetUnits = -2;
  const parti = { mattone: [], scuro: [], pietra: [], legno: [] };
  const rettangoli = [];                          // collisioni in locale: { u0, u1, v0, v1 }
  const quad = (u0, u1, v0, v1) => [xz(u0, v0), xz(u1, v0), xz(u1, v1), xz(u0, v1)];

  // ─── Cinta, a gradoni sul pendio ───
  // Ogni lato in tratti di ~TRATTO m: base sotto il terreno esterno, cima H sopra il terreno interno più alto del
  // tratto; scarpa all'esterno. n = normale esterna (nu, nv); il muro sta tra il bordo e SP verso l'interno.
  const merli = [];                               // { u, v, y, nu, nv }
  function lato(u0, v0, u1, v1, nu, nv) {
    const len = Math.hypot(u1 - u0, v1 - v0);
    const n = Math.max(1, Math.round(len / TRATTO));
    for (let k = 0; k < n; k++) {
      const a = [u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n], b = [u0 + (u1 - u0) * (k + 1) / n, v0 + (v1 - v0) * (k + 1) / n];
      const dentroA = [a[0] - nu * (SP + 1), a[1] - nv * (SP + 1)], dentroB = [b[0] - nu * (SP + 1), b[1] - nv * (SP + 1)];
      const qDentro = Math.max(terreno(...dentroA), terreno(...dentroB), terreno((dentroA[0] + dentroB[0]) / 2, (dentroA[1] + dentroB[1]) / 2));
      const i0 = [a[0] - nu * SP, a[1] - nv * SP], i1 = [b[0] - nu * SP, b[1] - nv * SP];   // filo interno
      const base = minimoLungo(a[0], a[1], b[0], b[1], nu * 2, nv * 2) - 1;
      const cima = qDentro + H;
      // Il tratto si allunga di 0,05 m per lato: i gradoni non lasciano fessure.
      const eu = (b[0] - a[0]) / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])) * 0.05;
      const ev = (b[1] - a[1]) / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])) * 0.05;
      const P = [[i0[0] - eu, i0[1] - ev], [i1[0] + eu, i1[1] + ev], [b[0] + eu, b[1] + ev], [a[0] - eu, a[1] - ev]];
      const q4 = (pp) => pp.map(([u, v]) => xz(u, v));
      parti.mattone.push(prisma(q4(P), q4(P), base, cima));
      const yS = Math.max(base + 0.5, qDentro + 1.5), off = (yS - base) * SCARPA;
      const Ps = [P[0], P[1], [P[2][0] + nu * off, P[2][1] + nv * off], [P[3][0] + nu * off, P[3][1] + nv * off]];
      parti.scuro.push(prisma(q4(Ps), q4(P), base, yS));
      const us = Ps.map((p) => p[0]), vs = Ps.map((p) => p[1]);
      rettangoli.push({ u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) });
      const m = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.9));
      for (let j = 0; j < m; j++) {
        const t = (j + 0.5) / m;
        merli.push({ u: a[0] + (b[0] - a[0]) * t - nu * 0.3, v: a[1] + (b[1] - a[1]) * t - nv * 0.3, y: cima, nu, nv });
      }
    }
  }
  const gw = PORTA.torreLarghezza;
  for (const s of [-1, 1]) lato(ra, s * lb, uFine, s * lb, 0, s);              // fianchi
  for (const s of [-1, 1]) lato(uFine, s * gw / 2, uFine, s * lb, 1, 0);       // fondo, ai lati della porta
  const vRocca = Math.max(0, rocca.HX - 1);                                    // retro: fino a dentro le torri della rocca
  for (const s of [-1, 1]) lato(ra, s * lb, ra, s * vRocca, -1, 0);
  // Sperone tra la torre anteriore della rocca e il retro del borgo: chiude l'angolo rientrante (lì il cavaliere
  // restava incastrato tra la torre tonda e il muro, spinto a turno dall'una e dall'altro).
  const vSperone = rocca.HX + (rocca.R ?? 3.6) + 2;              // oltre la torre e la sua scarpa
  for (const s of [-1, 1]) lato(rocca.HZ, s * vSperone, ra + SP, s * vSperone, 0, s);

  // Torri quadrate: agli angoli e lungo i fianchi ogni ~passoTorri.
  const lt = K.torre / 2;
  const posti = [[uFine, -lb], [uFine, lb], [ra, -lb], [ra, lb]];
  const nt = Math.floor((uFine - ra) / K.passoTorri);
  for (const s of [-1, 1]) for (let k = 1; k <= nt; k++) posti.push([ra + (uFine - ra) * k / (nt + 1), s * lb]);
  let torri = 0;
  for (const [u, v] of posti) {
    const ui = clamp(u, ra + lt + SP, uFine - lt - SP), vi = clamp(v, -lb + lt + SP, lb - lt - SP);
    const qD = terreno(ui, vi);
    const base = Math.min(terreno(u - lt - 1, v), terreno(u + lt + 1, v), terreno(u, v - lt - 1), terreno(u, v + lt + 1), terreno(u, v)) - 1;
    const cima = Math.max(qD, terreno(u, v)) + H + 2.5;
    parti.mattone.push(prisma(quad(u - lt, u + lt, v - lt, v + lt), quad(u - lt, u + lt, v - lt, v + lt), base, cima));
    const e = 0.35;                                       // parapetto sporgente in cima
    parti.mattone.push(prisma(quad(u - lt - e, u + lt + e, v - lt - e, v + lt + e), quad(u - lt - e, u + lt + e, v - lt - e, v + lt + e), cima - 1.2, cima));
    rettangoli.push({ u0: u - lt - e, u1: u + lt + e, v0: v - lt - e, v1: v + lt + e });
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const o of [-lt + 0.7, 0, lt - 0.7]) {
        merli.push({ u: u + nu * (lt + e - 0.3) + (nv !== 0 ? o : 0), v: v + nv * (lt + e - 0.3) + (nu !== 0 ? o : 0), y: cima, nu, nv });
      }
    }
    torri++;
  }

  // ─── Torre-porta del borgo (sul fondo, al centro): il passaggio segue il terreno ───
  const uPorta = uFine + 1;
  let gMin = Infinity, gMax = -Infinity;
  for (let u = uFine - PORTA.torreProfondita + 1; u <= uPorta + 1e-6; u += 0.5) {
    const h = terreno(u, 0);
    gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
  }
  {
    const pw = PORTA.larghezza, prof = PORTA.torreProfondita;
    const u0 = uFine - prof + 1, u1 = uPorta;             // sporge di 1 m fuori dalla cinta
    const base = Math.min(minimoLungo(u1, -gw / 2, u1, gw / 2, 2, 0), gMin) - 1.5;
    const cima = gMax + H + PORTA.sopraMura, imposta = gMax + PORTA.imposta;
    const s = new THREE.Shape();
    s.moveTo(-gw / 2, base); s.lineTo(gw / 2, base); s.lineTo(gw / 2, cima); s.lineTo(-gw / 2, cima); s.closePath();
    const foro = new THREE.Path();
    foro.moveTo(-pw / 2, gMin - 0.6); foro.lineTo(pw / 2, gMin - 0.6); foro.lineTo(pw / 2, imposta);
    foro.absarc(0, imposta, pw / 2, 0, Math.PI, false);
    foro.lineTo(-pw / 2, gMin - 0.6);
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
    for (const lato2 of [-1, 1]) {                        // battenti aperti, contro la faccia interna
      const v0 = lato2 * pw / 2, v1 = lato2 * pw;
      parti.legno.push(prisma(quad(u0 - 0.14, u0, Math.min(v0, v1), Math.max(v0, v1)), quad(u0 - 0.14, u0, Math.min(v0, v1), Math.max(v0, v1)), gMin - 0.3, imposta + 0.6));
      const v2 = lato2 * gw / 2;
      rettangoli.push({ u0, u1, v0: Math.min(v0, v2), v1: Math.max(v0, v2) });
    }
    for (let k = 0; k < 4; k++) {
      const vv = -gw / 2 + 0.6 + (gw - 1.2) * k / 3;
      merli.push({ u: u1 - 0.3, v: vv, y: cima, nu: 1, nv: 0 });
      merli.push({ u: u0 + 0.3, v: vv, y: cima, nu: -1, nv: 0 });
    }
  }

  // ─── Rampa fuori dalla porta: dal passaggio al terreno (il terrapieno a 25° scende sotto) ───
  const qSoglia = terreno(uPorta, 0);
  let lungaPorta = RAMPA_PORTA.minima;
  {
    let migliore = Infinity;
    for (let l = RAMPA_PORTA.minima; l <= RAMPA_PORTA.massima; l += 0.5) {
      const g = Math.abs(qSoglia - terreno(uPorta + l, 0)) / l;
      if (g < migliore) { migliore = g; lungaPorta = l; }
      if (g <= RAMPA_PORTA.pendenza) break;
    }
  }
  const quotaRampaPorta = (u, v) => qSoglia + (terreno(uPorta + lungaPorta, v) - qSoglia) * clamp((u - uPorta) / lungaPorta, 0, 1);
  {
    const w = RAMPA_PORTA.larghezza / 2, n = Math.max(2, Math.ceil(lungaPorta / 1.5));
    for (let i = 0; i < n; i++) {
      const ua = uPorta + lungaPorta * i / n, ub = uPorta + lungaPorta * (i + 1) / n;
      for (const sv of [-1, 1]) {                         // fianchi in muratura fino sotto il terreno
        const v0 = sv * w, v1 = sv * (w + 0.5);
        const yTop = Math.max(quotaRampaPorta(ua, v0), quotaRampaPorta(ub, v0)) + 0.3;
        const yBase = Math.min(terreno(ua, v1), terreno(ub, v1), terreno(ua, v0), terreno(ub, v0)) - 0.5;
        if (yTop - yBase > 0.6) parti.pietra.push(prisma(quad(ua, ub, Math.min(v0, v1), Math.max(v0, v1)), quad(ua, ub, Math.min(v0, v1), Math.max(v0, v1)), yBase, yTop));
      }
    }
  }

  // ─── Strade interne ───
  // Polilinee in (u, v). Via principale: dalla porta (fuori, sulla rampa) al piede della rampa della rocca; se il
  // pendio supera STRADE.pendenzaVia sale a tornanti da un lato all'altro del borgo. Via lungo le mura: anello a
  // `rientro` m dalla cinta (lascia posto alle case addossate alle mura). Vicoli: lungo le curve di livello, da un
  // lato all'altro dell'anello. Curve morbide e un leggero serpeggiare: niente righe a squadra.
  const rientro = STRADE.mura.rientro;
  const uIn = ra + rientro, uOut = uFine - rientro, vIn = lb - rientro;
  const serpeggia = (p, ampiezza, onda, sfasa) => {
    let s = 0;
    return p.map((q, i) => {
      if (i > 0) s += Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]);
      if (i === 0 || i === p.length - 1) return q;
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nu = -(b[1] - a[1]) / tl, nv = (b[0] - a[0]) / tl;
      const o = ampiezza * (Math.sin(s / onda + sfasa) * 0.7 + Math.sin(s / (onda * 0.43) + sfasa * 2.3) * 0.3);
      return [q[0] + nu * o, q[1] + nv * o];
    });
  };
  const strade = [];                               // { punti: [[u, v]...], tipo }
  {
    const uA = uPorta + Math.min(lungaPorta, 6), uB = Math.max(uIn - 2, rocca.piedeRampa + 1);
    const salto = Math.abs(terreno(uA, 0) - terreno(uB, 0)), du = uA - uB;
    const pend = salto / Math.max(1, du);
    let pts;
    if (pend <= STRADE.pendenzaVia) {
      pts = [[uA, 0], [uOut, 0], [(uOut + uB) / 2, 0], [uB, 0]];
    } else {
      // Tornanti: n tratti da un lato all'altro (v = ±A), abbastanza lunghi da restare sotto la pendenza voluta.
      const A = vIn * 0.85, serve = salto / STRADE.pendenzaVia;
      let n = 2;
      while (n < 8 && n * Math.hypot(2 * A, du / n) < serve) n++;
      pts = [[uA, 0], [uOut + 2, 0]];
      for (let k = 0; k < n; k++) pts.push([uOut - (uOut - uB) * (k + 0.5) / n, (k % 2 ? -A : A)]);
      pts.push([uB, 0]);
    }
    strade.push({ tipo: 'via', punti: serpeggia(ricampiona(chaikin(pts, 3), STRADE.passo), 0.7, 9, fase) });
    // Anello lungo le mura (chiuso), angoli arrotondati.
    // Lati diritti suddivisi ogni 4 m prima di arrotondare: così Chaikin smussa solo gli angoli (raggio di pochi m).
    // Si parte e si chiude a metà di un lato (dove l'estremo fermo di Chaikin non fa spigolo).
    const giro = ricampiona([[(uIn + uOut) / 2, -vIn], [uOut, -vIn], [uOut, vIn], [uIn, vIn], [uIn, -vIn], [(uIn + uOut) / 2, -vIn]], 4);
    strade.push({ tipo: 'mura', punti: serpeggia(ricampiona(chaikin(giro, 2), STRADE.passo), 0.8, 11, fase + 1) });
    // Vicoli lungo le curve di livello.
    for (let k = 1; k <= K.vicoli; k++) {
      const u = uIn + (uOut - uIn) * k / (K.vicoli + 1) + Math.sin(fase * 3.1 + k) * 4;
      const pv = [[u, -vIn], [u + Math.sin(fase + k) * 5, -vIn * 0.3], [u - Math.sin(fase + k) * 4, vIn * 0.4], [u, vIn]];
      strade.push({ tipo: 'vicolo', punti: serpeggia(ricampiona(chaikin(pv, 3), STRADE.passo), 0.6, 7, fase + k * 2) });
    }
  }
  // Nastri di ciottolato: 5 vertici per sezione (bordi un po' irregolari), sul terreno + qualche cm.
  let triStrade = 0;
  const geoStrade = (() => {
    const pos = [], uv = [], idx = [];
    for (const s of strade) {
      const S = STRADE[s.tipo], P = s.punti, base = pos.length / 3;
      let lung = 0;
      for (let i = 0; i < P.length; i++) {
        if (i > 0) lung += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nu = -(b[1] - a[1]) / tl, nv = (b[0] - a[0]) / tl;
        for (let j = 0; j < 5; j++) {
          const t = j / 4 - 0.5;
          const bordo = (j === 0 || j === 4) ? 1 + 0.18 * Math.sin(lung * 0.9 + j * 2.1 + fase) * Math.sin(lung * 0.37 + fase) : 1;
          const u = P[i][0] + nu * t * S.larghezza * bordo, v = P[i][1] + nv * t * S.larghezza * bordo;
          pos.push(X(u, v), terreno(u, v) + S.sopra, Z(u, v));
          uv.push(t * S.larghezza / 1.6, lung / 1.6);
        }
      }
      for (let i = 0; i + 1 < P.length; i++) {
        for (let j = 0; j < 4; j++) {
          const a = base + i * 5 + j, b = a + 1, c = a + 5, d = c + 1;
          idx.push(a, c, b, b, c, d);
          triStrade += 2;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Le normali devono guardare in su (l'ordine dei vertici dipende dal verso degli assi locali).
    const nrm = geo.attributes.normal;
    let giu = 0;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) giu++;
    if (giu > nrm.count / 2) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    return geo;
  })();

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
    const m = new THREE.Mesh(geoStrade, mat.strada);
    m.name = 'borgo-strade';
    object.add(m);
  }
  {
    const geo = new THREE.BoxGeometry(0.85, 1.1, 0.5);
    geo.translate(0, 0.55, 0);
    const im = new THREE.InstancedMesh(geo, mat.mattone, merli.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), y = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1);
    merli.forEach((m, i) => {
      const nx = ux * m.nu - uz * m.nv, nz = uz * m.nu + ux * m.nv;   // normale esterna nel blocco
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
  const INGOMBRO_U0 = ra - 4, INGOMBRO_U1 = uPorta + 5 + lungaPorta, INGOMBRO_V = lb + 6;
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

  /** Quota del suolo costruito: solo la rampa fuori dalla porta (dentro il borgo si cammina sul pendio). */
  function quotaSuolo(x, z) {
    const [u, v] = inLocale(x, z);
    if (u > uPorta && u <= uPorta + lungaPorta && Math.abs(v) <= RAMPA_PORTA.larghezza / 2) return quotaRampaPorta(u, v);
    return null;
  }

  /** true se il punto è dentro la cinta del borgo. */
  function dentro(x, z) {
    const [u, v] = inLocale(x, z);
    return u > ra && u < uFine && Math.abs(v) < lb - SP;
  }

  return {
    tipo: 'borgo', luogo, object, solidi, rettangoli, spingiFuori, quotaSuolo, dentro,
    strade,                                       // polilinee locali (u, v): per gli edifici del passo 5
    aggiornaLuci() {},                            // luci del borgo: passo 7
    misure: {
      strade: strade.length, torri, merli: merli.length, oggetti: object.children.length,
      triangoli: object.children.reduce((s, m) => s + (m.isInstancedMesh ? m.geometry.index.count / 3 * m.count
        : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3), 0),
    },
  };
}
