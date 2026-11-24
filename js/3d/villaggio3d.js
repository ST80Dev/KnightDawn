// Knight Dawn — villaggi e ovili del mondo generato (M8, passo 2). Piano: docs/ESPLORAZIONE_3D.md, «M8 — Luoghi del
// mondo». Usa il kit di edifici di M7 (edifici3d.js: case, edifici nominati, torce, finestre accese), lo stesso dei
// borghi e della campagna: stesso stile, stesse prestazioni (una chiamata per materiale, dettagli a istanze per zone
// spente da lontano).
//
// Impianto (richiesta dell'utente: niente strada che muore in una piazza, sviluppo realistico):
//   - una VIA PRINCIPALE attraversa il villaggio: prosegue la direzione della strada che arriva (strade.js la porta al
//     centro del sito), passa per il nucleo ed esce dall'altra parte, dove continua come carrareccia nei campi;
//   - uno o due VICOLI se ne staccano di traverso; una PIAZZETTA sulla via principale con il pozzo (selciata nei
//     villaggi grandi, di terra nelle frazioni);
//   - le case si allineano lungo via e vicoli, con la porta verso la strada; le altre, in seconda fila, guardano la via
//     più vicina. Villaggio grande: pieve sulla piazzetta, locanda sulla via vicino alla piazzetta, fabbro all'ingresso;
//   - TERRA BATTUTA continua tra le case, attorno a quasi tutte e per qualche metro oltre il nucleo (bordo frastagliato);
//     via e vicoli di terra più scura e solcata. Niente case sulle strade, nell'acqua o su terreno troppo ripido.
//   - Ovile: una stalla con il recinto e un pagliaio, terra calpestata attorno.
// Niente terrapieno: le case stanno sul terreno com'è, con lo zoccolo di pietra del kit (i siti dei villaggi sono già i
// punti più piani della cella). Gli alberi non crescono nel villaggio: main.js passa alla vegetazione un piano rotondo
// per sito (pianoDelSito) che la tiene fuori.
//
// Costruzione a pezzi (blocco che segue il cavaliere, M7 passo 9): createVillaggioAPezzi è un generatore che cede il
// passo ogni ~PEZZO_MS ms e restituisce lo stesso oggetto di createVillaggio.

import * as THREE from 'three';
import { creaKit, completaPezzi, siToccano, PEZZO_MS } from './edifici3d.js';
// Geometrie e utilità comuni di M7 (sola lettura: rocca3d.js non si tocca).
import { localeDelLuogo, dentroPoligono, distanzaContorno, prisma, unisci, materialeMuro, tonoDelLuogo } from './rocca3d.js';
import { quotaFinale, livelloLago } from '../mondo/scena.js';
import { distanzaStrada } from '../mondo/strade.js';
import { hash2 } from '../mondo/rumore.js';
import { raggioSito, climaDelLuogo } from '../mondo/siti.js';

export const VILLAGGI = {
  frazione: { case: [6, 10], piazza: 7, pozzo: 0.6, vicoli: [0, 1] },
  villaggio: { case: [12, 20], piazza: 11, pozzo: 1, vicoli: [1, 2] },
  // Pieve: la chiesa del kit, più piccola (EDIFICI.chiesa è quella del borgo).
  pieve: { largo: 9, fondo: 16, piani: 2 },
  tipi: { frazione: { rurale: 0.6, bassa: 0.4 }, villaggio: { rurale: 0.4, bassa: 0.35, schiera: 0.25 } },
  dislivello: 2.6,          // m: dislivello massimo sotto una casa (lo zoccolo copre il resto)
  strada: { libero: 3.5 },  // m oltre il bordo della banchina della rete
  via: { largo: 4.5, oltre: 35, serpeggia: 3 },   // via principale; prosegue `oltre` m fuori dal nucleo come carrareccia
  vicolo: { largo: 2.8, lungo: [22, 45] },
  arretra: [1.5, 4],        // m tra il bordo della via e la facciata
  margine: 2.2,             // m tra due edifici
  tentativi: 160,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Piano rotondo per tenere fuori la vegetazione (formato dei piani di luoghi.js, distanzaPiano di scena.js). Dentro il
 * piano niente vegetazione; oltre, per VEGETAZIONE.spianata m, solo erba e sassi: con raggio 0,7 R gli alberi restano
 * fuori da tutto il villaggio, e oltre la terra battuta cresce l'erba.
 */
export function pianoDelSito(s, frazione = 0.7) {
  const r = frazione * raggioSito(s);
  return { cx: s.x, cz: s.z, ux: 1, uz: 0, a: r, b: r, r, s: 4 };
}

// ─── Suolo del villaggio ───────────────────────────────────────────────────
// Terra battuta: una griglia che copre solo dove serve (entro `margine` m da case, aie e strade, con il bordo che
// ondeggia), alpha per vertice e alphaTest: bordo frastagliato, nessuna trasparenza da ordinare. Strade: nastri di
// terra più scura. Piazzetta selciata (villaggi grandi). Al più 3 chiamate, qualche cm sopra il terreno.
export const SUOLO = { sopra: 0.06, passo: 2.5, tessera: 4, margine: [3, 7], aia: 6 };
const _tex = {};
/** 0 terra battuta, 1 selciato rustico, 2 carreggiata (solchi delle ruote), 3 orto arato: 512 px = SUOLO.tessera m. */
function texturaSuolo(tipo) {
  if (_tex[tipo]) return _tex[tipo];
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let sm = [2718, 4711, 1618, 3141][tipo];
  const rnd = () => ((sm = (sm * 1103515245 + 12345) >>> 0) / 4294967296);
  // Terra battuta chiara e polverosa (richiesta dell'utente: la terra scura sembrava fango); carreggiata poco più bruna;
  // l'orto è terra rivoltata, scura e umida.
  g.fillStyle = ['rgb(198,178,142)', 'rgb(158,144,124)', 'rgb(150,126,96)', 'rgb(104,84,58)'][tipo];
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 6000; k++) {                           // grana, impronte, ghiaia
    const v = 140 + Math.floor(rnd() * 90);
    g.fillStyle = `rgba(${v + 22},${v + 10},${v - 8},0.45)`;
    g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  if (tipo === 2) {                                          // solchi delle ruote lungo v
    for (const x0 of [0.3, 0.7]) {
      for (let y = 0; y < N; y += 2) {
        const x = x0 * N + 6 * Math.sin(y * 0.03) + (rnd() - 0.5) * 3;
        g.fillStyle = 'rgba(95,78,58,0.3)'; g.fillRect(x - 9, y, 18, 2);
      }
    }
  }
  if (tipo === 3) {                                          // porche dell'orto: solchi regolari lungo v
    for (let k = 0; k < 9; k++) {
      const x = (k + 0.5) / 9 * N;
      for (let y = 0; y < N; y += 2) {
        const w = 10 + 2 * Math.sin(y * 0.05 + k);
        g.fillStyle = 'rgba(72,56,38,0.40)'; g.fillRect(x - w / 2, y, w, 2);
        g.fillStyle = 'rgba(138,114,82,0.30)'; g.fillRect(x + w / 2, y, 7, 2);
      }
    }
  }
  const nP = tipo === 1 ? 520 : tipo === 0 ? 70 : tipo === 3 ? 20 : 40;   // pietre piatte (selciato) o sassi sparsi
  for (let k = 0; k < nP; k++) {
    const x = rnd() * N, y = rnd() * N, r = tipo === 1 ? 10 + rnd() * 14 : 3 + rnd() * 6, v = 120 + Math.floor(rnd() * 70);
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      g.fillStyle = `rgb(${v + 6},${v},${v - 10})`;
      g.beginPath(); g.ellipse(x + dx, y + dy, r * (0.8 + rnd() * 0.4), r * (0.6 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(45,35,25,0.35)'; g.lineWidth = 1.3; g.stroke();
    }
  }
  for (let k = 0; k < 40; k++) {                             // fango, polvere, ciuffi d'erba
    const x = rnd() * N, y = rnd() * N, r = 20 + rnd() * 80, t = rnd();
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      // Orto: chiazze umide e qualche ciuffo verde, mai polvere chiara. Altrove: polvere chiara, poco fango, ciuffi.
      gr.addColorStop(0, tipo === 3 ? (t < 0.6 ? 'rgba(78,60,40,0.30)' : 'rgba(104,126,66,0.30)')
        : t < 0.12 ? 'rgba(105,85,62,0.25)' : t < 0.8 ? `rgba(${222 + Math.floor(rnd() * 20)},${208 + Math.floor(rnd() * 20)},${178 + Math.floor(rnd() * 20)},${0.3 + rnd() * 0.3})` : 'rgba(110,125,70,0.25)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return (_tex[tipo] = t);
}

/** Finisce una geometria del suolo: triangoli verso l'alto, normali, sfera. */
function chiudiGeo(pos, uv, idx, col = null) {
  if (!idx.length) return null;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Nastri (polilinee locali con larghezza) appoggiati su quota(u, v): uv lungo la strada (solchi lungo v). */
function geoNastri(nastri, ox, oz, quota, sopra) {
  const pos = [], uv = [], idx = [], T = SUOLO.tessera;
  for (const { punti: P, largo } of nastri) {
    if (P.length < 2) continue;
    const base = pos.length / 3;
    let lung = 0;
    for (let i = 0; i < P.length; i++) {
      if (i) lung += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nu = -(b[1] - a[1]) / tl, nv = (b[0] - a[0]) / tl;
      for (const t of [-0.5, 0, 0.5]) {
        const u = P[i][0] + nu * t * largo, v = P[i][1] + nv * t * largo;
        pos.push(ox + u, quota(u, v) + sopra, oz + v); uv.push((t + 0.5) * largo / T * 0.8, lung / T);
      }
    }
    for (let i = 0; i + 1 < P.length; i++) for (let j = 0; j < 2; j++) {
      const a = base + i * 3 + j, b = a + 1, c = a + 3, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return chiudiGeo(pos, uv, idx);
}

/** Chiazza tonda (centro, raggio) col bordo che ondeggia. */
function geoChiazza(c, r, ox, oz, quota, sopra, rnd) {
  const pos = [], uv = [], idx = [], T = SUOLO.tessera;
  const nA = Math.max(12, Math.round(r * 1.6)), nR = Math.max(2, Math.round(r / 3)), on = [rnd() * 6, rnd() * 6];
  const raggio = (a) => r * (1 + 0.1 * Math.sin(3 * a + on[0]) + 0.06 * Math.sin(7 * a + on[1]));
  const p = (u, v) => { pos.push(ox + u, quota(u, v) + sopra, oz + v); uv.push(u / T, v / T); };
  p(c[0], c[1]);
  for (let k = 1; k <= nR; k++) for (let j = 0; j < nA; j++) {
    const a = j / nA * Math.PI * 2, d = raggio(a) * k / nR;
    p(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d);
  }
  for (let j = 0; j < nA; j++) idx.push(0, 1 + (j + 1) % nA, 1 + j);
  for (let k = 1; k < nR; k++) for (let j = 0; j < nA; j++) {
    const a = 1 + (k - 1) * nA + j, b = 1 + (k - 1) * nA + (j + 1) % nA, cc = a + nA, d = b + nA;
    idx.push(a, b, cc, b, d, cc);
  }
  return chiudiGeo(pos, uv, idx);
}

/**
 * Terra battuta del nucleo: griglia di SUOLO.passo m su [−L, L]², vertici con alpha 1 entro il margine (che ondeggia)
 * dalla forma più vicina, 0 oltre; si tengono solo le celle con almeno un vertice dentro. `dist(u, v)` dà la distanza
 * dalla forma più vicina (case con aia, strade, piazzetta).
 */
export function geoTerra(L, dist, ox, oz, quota, seme, M = SUOLO.margine) {
  const P = SUOLO.passo, n = Math.ceil(2 * L / P) + 1, T = SUOLO.tessera;
  const alfa = new Float32Array(n * n), id = new Int32Array(n * n).fill(-1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = -L + i * P, v = -L + j * P;
    const onda = 0.5 + 0.3 * Math.sin(u * 0.21 + v * 0.13 + seme % 7) + 0.2 * Math.sin(u * 0.07 - v * 0.17 + seme % 5);
    const lim = M[0] + (M[1] - M[0]) * clamp(onda, 0, 1);
    alfa[j * n + i] = clamp(0.5 + (lim - dist(u, v)) / 2.5, 0, 1);
  }
  const pos = [], uv = [], col = [], idx = [];
  const vert = (i, j) => {
    const k = j * n + i;
    if (id[k] < 0) {
      const u = -L + i * P, v = -L + j * P;
      id[k] = pos.length / 3;
      pos.push(ox + u, quota(u, v) + SUOLO.sopra, oz + v); uv.push(u / T, v / T); col.push(1, 1, 1, alfa[k]);
    }
    return id[k];
  };
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    const k = j * n + i;
    if (alfa[k] <= 0 && alfa[k + 1] <= 0 && alfa[k + n] <= 0 && alfa[k + n + 1] <= 0) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  return chiudiGeo(pos, uv, idx, col);
}

/**
 * Attacca all'oggetto i pezzi di suolo: `[nome, geometria, tipo di textura]`. Le strade e le chiazze stanno sopra la
 * terra battuta (polygonOffset crescente), la terra sola ha l'alpha per vertice.
 */
export function attaccaSuolo(r, pezzi) {
  pezzi.forEach(([nome, geo, tipo], k) => {
    if (!geo) return;
    // Solo i pezzi con l'alpha per vertice (la griglia di geoTerra) hanno il bordo frastagliato: alphaTest.
    const sfumato = !!geo.getAttribute('color');
    const m = new THREE.MeshLambertMaterial({ map: texturaSuolo(tipo), vertexColors: sfumato, alphaTest: sfumato ? 0.5 : 0 });
    m.polygonOffset = true; m.polygonOffsetFactor = -2 - k; m.polygonOffsetUnits = -2 - k;
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = `${r.object.name}-suolo-${nome}`;
    mesh.renderOrder = k;
    r.object.add(mesh);
    r.misure.chiamate++;
    r.misure.triangoli += geo.index.count / 3;
  });
}

/**
 * Collisioni dalle scatole orientate locali (u, v) = (x − ox, z − oz), con una griglia di 16 m per cercare solo le
 * vicine. Restituisce `spingiFuori(x, z, raggio, yPiedi, superabile)`: null se non ha spostato nulla.
 */
export function spintaDaScatole(scatole, ox, oz, limite) {
  const griglia = new Map(), G = 16;
  scatole.forEach((s, i) => {
    const e = Math.max(s.hl, s.hw) + 1;
    for (let a = Math.floor((s.cu - e) / G); a <= Math.floor((s.cu + e) / G); a++) {
      for (let b = Math.floor((s.cv - e) / G); b <= Math.floor((s.cv + e) / G); b++) {
        const k = a * 100003 + b;
        if (!griglia.has(k)) griglia.set(k, []);
        griglia.get(k).push(i);
      }
    }
  });
  return function spingiFuori(x, z, raggio, yPiedi = -Infinity, superabile = 0) {
    let u = x - ox, v = z - oz;
    if (Math.abs(u) > limite || Math.abs(v) > limite) return null;
    const L = griglia.get(Math.floor(u / G) * 100003 + Math.floor(v / G));
    if (!L) return null;
    let mosso = false;
    for (let it = 0; it < 4; it++) {
      let qui = false;
      for (const i of L) {
        const s = scatole[i], du = u - s.cu, dv = v - s.cv;
        if (s.cima !== undefined && s.cima <= yPiedi + superabile) continue;   // basso: si supera
        const a = du * s.au + dv * s.av, b = -du * s.av + dv * s.au;
        const qa = clamp(a, -s.hl, s.hl), qb = clamp(b, -s.hw, s.hw), ea = a - qa, eb = b - qb, d2 = ea * ea + eb * eb;
        if (d2 >= raggio * raggio) continue;
        let na = a, nb = b;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); na = qa + ea / d * raggio; nb = qb + eb / d * raggio; } else {
          const vie = [a + s.hl, s.hl - a, b + s.hw, s.hw - b], m = vie.indexOf(Math.min(...vie));
          if (m === 0) na = -s.hl - raggio; else if (m === 1) na = s.hl + raggio; else if (m === 2) nb = -s.hw - raggio; else nb = s.hw + raggio;
        }
        u = s.cu + na * s.au - nb * s.av; v = s.cv + na * s.av + nb * s.au;
        qui = mosso = true;
      }
      if (!qui) break;
    }
    return mosso ? { x: u + ox, z: v + oz } : null;
  };
}

/** Distanza (m) di (u, v) dal rettangolo orientato { c, s, f, a, b } (0 dentro). */
export function distRett(L, u, v) {
  const du = u - L.c[0], dv = v - L.c[1];
  const x = Math.abs(du * L.s[0] + dv * L.s[1]) - L.a, y = Math.abs(du * L.f[0] + dv * L.f[1]) - L.b;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0));
}

/** Punto più vicino di una polilinea: { d, q: [u, v], t: tangente }. */
function vicinoPolilinea(P, u, v) {
  let best = { d: Infinity, q: null, t: null };
  for (let i = 0; i + 1 < P.length; i++) {
    const ax = P[i][0], av = P[i][1], vx = P[i + 1][0] - ax, vz = P[i + 1][1] - av, l2 = vx * vx + vz * vz || 1;
    const t = clamp(((u - ax) * vx + (v - av) * vz) / l2, 0, 1), qx = ax + vx * t, qz = av + vz * t, d = Math.hypot(u - qx, v - qz);
    if (d < best.d) { const l = Math.sqrt(l2); best = { d, q: [qx, qz], t: [vx / l, vz / l] }; }
  }
  return best;
}

/**
 * Villaggio o ovile in coordinate del blocco: centro del sito in (ox, oz). `suolo.getHeight(x, z)` nel blocco (anche
 * fuori, con quotaFinale), `carta` per strade e acqua, (cx, cz) centro del blocco nel mondo.
 */
export function createVillaggio(suolo, sito, ox, oz, carta, cx, cz) {
  return completaPezzi(createVillaggioAPezzi(suolo, sito, ox, oz, carta, cx, cz));
}

export function* createVillaggioAPezzi(suolo, sito, ox, oz, carta, cx, cz) {
  const seme = hash2(Math.floor(sito.x), Math.floor(sito.z), carta.seme ^ 0x7a11a6e) || 1;
  const ovile = sito.tipo === 'ovile';
  const kit = creaKit({ X: (u) => ox + u, Z: (u, v) => oz + v, terreno: (u, v) => suolo.getHeight(ox + u, oz + v),
    seme, nome: ovile ? `ovile-${sito.id}` : `villaggio-${sito.id}`, contesto: 'campagna', zone: 1,
    clima: climaDelLuogo(carta, sito.x, sito.z) });   // stile delle case per clima (kit di M7)   // zone: 1 = dettagli in una zona sola (meno chiamate)
  const rnd = kit.rnd;
  const R = raggioSito(sito);
  const quota = (u, v) => suolo.getHeight(ox + u, oz + v);
  const lotti = [];                                       // rettangoli occupati { c, s, f, a, b }
  const es = { quota: 0, livello: NaN }, st = { d: Infinity, semi: 0, banchina: 0 };
  const W = (u, v) => [sito.x + u, sito.z + v];          // locale → mondo
  const fuoriStrada = (u, v) => {
    const [x, z] = W(u, v);
    distanzaStrada(carta, x, z, st);
    return st.d - st.semi - (st.banchina ?? 0);
  };
  const asciutto = (u, v) => {
    const [x, z] = W(u, v);
    quotaFinale(carta, x, z, undefined, es);
    return Number.isNaN(es.livello) && Number.isNaN(livelloLago(carta, x, z));
  };
  const vie = [];                                         // strade del villaggio: { punti, largo }
  const piazze = [];                                      // { c, r }
  const fuoriVie = (u, v) => {
    let m = Infinity;
    for (const s of vie) m = Math.min(m, vicinoPolilinea(s.punti, u, v).d - s.largo / 2);
    for (const p of piazze) m = Math.min(m, Math.hypot(u - p.c[0], v - p.c[1]) - p.r);
    return m;
  };
  /** Il rettangolo (centro c, fronte f, mezze misure a lungo s, b lungo f) si può costruire qui? */
  function libero(c, f, a, b) {
    const s = [-f[1], f[0]], L = { c, s, f, a, b };
    if (!ovile && Math.hypot(c[0], c[1]) + Math.max(a, b) > R) return false;
    if (lotti.some((o) => siToccano(o, L, VILLAGGI.margine))) return false;
    let mn = Infinity, mx = -Infinity;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const u = c[0] + s[0] * a * i + f[0] * b * j, v = c[1] + s[1] * a * i + f[1] * b * j;
      if (fuoriStrada(u, v) < VILLAGGI.strada.libero || fuoriVie(u, v) < 0.8 || !asciutto(u, v)) return false;
      const h = quota(u, v);
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    return mx - mn <= VILLAGGI.dislivello;
  }
  let t0 = performance.now();
  const forse = function* () { if (performance.now() - t0 > PEZZO_MS) { yield; t0 = performance.now(); } };
  const misure = { case: 0, scartate: 0 };
  const forme = [];                                       // per la terra battuta: lotti con l'aia

  /** Misure di un tipo di casa (con il fienile accanto per la rurale). */
  const misureCasa = (tipo) => ({ largo: tipo === 'rurale' ? 15.5 : tipo === 'schiera' ? 7 : 6.5, fondo: tipo === 'rurale' ? 8 : 8.5 });
  /** Costruisce un edificio o una casa sul lotto e lo registra. */
  function costruisci(e, c, f, largo, fondo) {
    if (e.tipo === 'chiesa') kit.edificio('chiesa', { u: c[0], v: c[1], fu: f[0], fv: f[1], misure: VILLAGGI.pieve });
    else if (e.tipo) kit.edificio(e.tipo, { u: c[0], v: c[1], fu: f[0], fv: f[1] });
    else { kit.casa({ u: c[0], v: c[1], fu: f[0], fv: f[1], tipo: e.casa }); misure.case++; }
    const L = { c, s: [-f[1], f[0]], f, a: largo / 2, b: fondo / 2 };
    lotti.push(L);
    // Aia: dietro le case rurali (cortile), davanti agli altri edifici; la terra battuta la copre.
    const aia = e.casa === 'rurale' ? SUOLO.aia : 2;
    forme.push({ ...L, c: [c[0] - f[0] * aia / 2, c[1] - f[1] * aia / 2], b: fondo / 2 + aia / 2 });
  }
  /** Prova a mettere `e` affacciato sulla via `via` vicino al parametro di lunghezza `s0` (m), sul lato `lato`. */
  function lungoVia(e, via, s0, lato) {
    const { largo, fondo } = e.tipo === 'chiesa' ? VILLAGGI.pieve : e.tipo === 'taverna' ? { largo: 11, fondo: 9 }
      : e.tipo === 'fabbro' ? { largo: 17.8, fondo: 7 } : misureCasa(e.casa);
    const P = via.punti;
    let acc = 0, i = 0;
    while (i + 1 < P.length && acc + Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) < s0) { acc += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); i++; }
    if (i + 1 >= P.length) return false;
    const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) || 1, t = [(P[i + 1][0] - P[i][0]) / l, (P[i + 1][1] - P[i][1]) / l];
    const k = (s0 - acc) / l, q = [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k];
    const n = [-t[1] * lato, t[0] * lato];                     // dalla via verso il lotto
    const arretra = VILLAGGI.arretra[0] + rnd() * (VILLAGGI.arretra[1] - VILLAGGI.arretra[0]);
    const d = via.largo / 2 + arretra + fondo / 2, c = [q[0] + n[0] * d, q[1] + n[1] * d];
    const tw = (rnd() - 0.5) * 0.15, f0 = [-n[0], -n[1]], f = [f0[0] * Math.cos(tw) - f0[1] * Math.sin(tw), f0[0] * Math.sin(tw) + f0[1] * Math.cos(tw)];
    if (!libero(c, f, largo / 2, fondo / 2)) { misure.scartate++; return false; }
    costruisci(e, c, f, largo, fondo);
    return true;
  }
  const lunghezza = (P) => P.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);

  if (ovile) {
    // Stalla con recinto (EDIFICI.stalla) e un pagliaio: verso a caso, spostata un poco se il punto non va.
    for (let k = 0; k < 12; k++) {
      const a = rnd() * Math.PI * 2, d = k ? 4 + rnd() * 10 : 0, c = [Math.cos(a) * d, Math.sin(a) * d];
      const fa = rnd() * Math.PI * 2, f = [Math.cos(fa), Math.sin(fa)];
      if (!libero(c, f, 7 + 9, 4)) continue;                // stalla 14 m + recinto 8 m
      kit.edificio('stalla', { u: c[0], v: c[1], fu: f[0], fv: f[1] });
      lotti.push({ c, s: [-f[1], f[0]], f, a: 16, b: 4 });
      forme.push({ c: [c[0] + f[0] * 3, c[1] + f[1] * 3], s: [-f[1], f[0]], f, a: 16, b: 8 });
      kit.pagliaio(c[0] - f[0] * 9 + f[1] * 4, c[1] - f[1] * 9 - f[0] * 4);
      misure.case++;
      break;
    }
  } else {
    const grande = sito.dimensione === 'villaggio', V = VILLAGGI[grande ? 'villaggio' : 'frazione'];
    // ─── Via principale: dal lato da cui arriva la strada della rete, attraverso il centro, fino all'altro lato ───
    let ang = rnd() * Math.PI * 2, dMin = Infinity;
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, d = fuoriStrada(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
      if (d < dMin) { dMin = d; ang = a; }
    }
    const dir = [-Math.cos(ang), -Math.sin(ang)], nrm = [-dir[1], dir[0]];   // dall'ingresso verso l'uscita
    const L0 = R * 0.85, L1 = R * 0.85 + VILLAGGI.via.oltre, fase = rnd() * 6, amp = VILLAGGI.via.serpeggia * (0.5 + rnd());
    const asse = [];
    for (let s = -L0; s <= L1 + 0.01; s += 2) {
      // dritta nel tratto d'ingresso (coincide con la strada della rete che arriva al centro), poi serpeggia
      const o = amp * Math.sin(s / 23 + fase) * clamp(s / 25, 0, 1);
      asse.push([dir[0] * s + nrm[0] * o, dir[1] * s + nrm[1] * o]);
    }
    const via = { punti: asse, largo: VILLAGGI.via.largo };
    vie.push(via);
    const sCentro = L0;                                    // parametro di lunghezza del centro lungo la via
    // Piazzetta sulla via, a un lato del centro: pozzo nel mezzo.
    const latoP = rnd() < 0.5 ? -1 : 1, cP = [nrm[0] * latoP * (V.piazza * 0.6), nrm[1] * latoP * (V.piazza * 0.6)];
    piazze.push({ c: cP, r: V.piazza });
    if (rnd() < V.pozzo && fuoriStrada(cP[0], cP[1]) > 2 && asciutto(cP[0], cP[1])) {
      kit.pozzo(cP[0] + nrm[0] * latoP * 2, cP[1] + nrm[1] * latoP * 2);
    }
    // Vicoli di traverso, a uno o due punti della via, da un lato o da tutti e due.
    const nV = V.vicoli[0] + Math.floor(rnd() * (V.vicoli[1] - V.vicoli[0] + 1));
    for (let k = 0; k < nV; k++) {
      const s0 = sCentro + (k % 2 ? -1 : 1) * (12 + rnd() * R * 0.35);
      const p0 = asse[clamp(Math.round(s0 / 2), 0, asse.length - 1)];
      for (const lato of rnd() < 0.5 ? [-1, 1] : [rnd() < 0.5 ? -1 : 1]) {
        const lun = VILLAGGI.vicolo.lungo[0] + rnd() * (VILLAGGI.vicolo.lungo[1] - VILLAGGI.vicolo.lungo[0]);
        const piega = (rnd() - 0.5) * 0.6, P = [];
        for (let s = 0; s <= lun; s += 2) {
          const a = piega * s / lun, d0 = [nrm[0] * lato, nrm[1] * lato], dd = [d0[0] * Math.cos(a) - d0[1] * Math.sin(a), d0[0] * Math.sin(a) + d0[1] * Math.cos(a)];
          P.push([p0[0] + dd[0] * s, p0[1] + dd[1] * s]);
        }
        vie.push({ punti: P, largo: VILLAGGI.vicolo.largo });
      }
    }
    // ─── Edifici nominati: pieve sulla piazzetta, locanda sulla via vicino alla piazzetta, fabbro all'ingresso ───
    if (grande) {
      const cc = [cP[0] + nrm[0] * latoP * (V.piazza + 1 + VILLAGGI.pieve.fondo / 2), cP[1] + nrm[1] * latoP * (V.piazza + 1 + VILLAGGI.pieve.fondo / 2)];
      const f = [-nrm[0] * latoP, -nrm[1] * latoP];
      if (libero(cc, f, VILLAGGI.pieve.largo / 2, VILLAGGI.pieve.fondo / 2)) costruisci({ tipo: 'chiesa' }, cc, f, VILLAGGI.pieve.largo, VILLAGGI.pieve.fondo);
      else for (let k = 0; k < 20 && !lungoVia({ tipo: 'chiesa' }, via, sCentro + (rnd() - 0.5) * 40, rnd() < 0.5 ? -1 : 1); k++);
      // Se il posto preferito non va, più in là lungo la via o su un vicolo.
      const altrove = (k) => (k < 20 ? null : vie[Math.floor(rnd() * vie.length)]);
      for (let k = 0; k < 60; k++) {
        const v2 = altrove(k);
        if (lungoVia({ tipo: 'taverna' }, v2 ?? via, v2 ? 6 + rnd() * (lunghezza(v2.punti) - 10) : sCentro + (k % 2 ? -1 : 1) * (V.piazza + 8 + rnd() * 15), v2 || k % 3 ? (rnd() < 0.5 ? -1 : 1) : -latoP)) break;
      }
      for (let k = 0; k < 60; k++) {
        const v2 = altrove(k);
        if (lungoVia({ tipo: 'fabbro' }, v2 ?? via, v2 ? 6 + rnd() * (lunghezza(v2.punti) - 10) : sCentro - R * (0.3 + rnd() * 0.4), rnd() < 0.5 ? -1 : 1)) break;
      }
    }
    yield* forse();
    // ─── Case: prima lungo le vie (fronte sulla strada), poi in seconda fila ───
    const nCase = V.case[0] + Math.floor(rnd() * (V.case[1] - V.case[0] + 1));
    const tipoCasa = () => { let x = rnd(), t = 'bassa'; for (const [k, p] of Object.entries(VILLAGGI.tipi[grande ? 'villaggio' : 'frazione'])) { t = k; if ((x -= p) < 0) break; } return t; };
    for (let k = 0; k < VILLAGGI.tentativi && misure.case < nCase; k++) {
      const e = { casa: tipoCasa() };
      if (k < VILLAGGI.tentativi * 0.7) {
        // Sulla via principale entro il nucleo (più fitte vicino al centro) o su un vicolo.
        const suVicolo = vie.length > 1 && rnd() < 0.35;
        const s = suVicolo ? vie[1 + Math.floor(rnd() * (vie.length - 1))] : via;
        const s0 = suVicolo ? 6 + rnd() * (lunghezza(s.punti) - 8) : sCentro + (rnd() - 0.5) * 2 * R * 0.75 * Math.sqrt(rnd());
        lungoVia(e, s, s0, rnd() < 0.5 ? -1 : 1);
      } else {
        // Seconda fila: punto a caso nel nucleo, fronte verso la via più vicina (l'aia dietro).
        const a = rnd() * Math.PI * 2, d = R * 0.75 * Math.sqrt(rnd()), c = [Math.cos(a) * d, Math.sin(a) * d];
        let best = null;
        for (const s of vie) { const b = vicinoPolilinea(s.punti, c[0], c[1]); if (!best || b.d < best.d) best = b; }
        if (!best || best.d > 35) continue;
        const n = Math.hypot(best.q[0] - c[0], best.q[1] - c[1]) || 1, f = [(best.q[0] - c[0]) / n, (best.q[1] - c[1]) / n];
        const { largo, fondo } = misureCasa(e.casa);
        if (libero(c, f, largo / 2, fondo / 2)) costruisci(e, c, f, largo, fondo); else misure.scartate++;
      }
      yield* forse();
    }
  }
  yield;
  const r = yield* kit.chiudiAPezzi();
  Object.assign(r.misure, misure);
  // ─── Suolo: terra battuta del nucleo, strade, piazzetta ───
  const distForme = (u, v) => {
    let m = Infinity;
    for (const L of forme) m = Math.min(m, distRett(L, u, v));
    for (const s of vie) m = Math.min(m, vicinoPolilinea(s.punti, u, v).d - s.largo / 2 - (s === vie[0] ? -1 : 0));
    for (const p of piazze) m = Math.min(m, Math.hypot(u - p.c[0], v - p.c[1]) - p.r);
    return m;
  };
  // La via principale fuori dal nucleo resta solo carreggiata: la terra battuta la segue fino a R.
  const distNucleo = (u, v) => (Math.hypot(u, v) > R + 4 ? Infinity : distForme(u, v));
  const pezzi = [
    ['terra', geoTerra(R + 8, distNucleo, ox, oz, quota, seme), 0],
    ['strade', geoNastri(vie, ox, oz, quota, SUOLO.sopra + 0.02), 2],
    ['piazza', sito.dimensione === 'villaggio' && piazze[0] ? geoChiazza(piazze[0].c, piazze[0].r, ox, oz, quota, SUOLO.sopra + 0.04, rnd) : null, 1],
  ];
  attaccaSuolo(r, pezzi);
  yield;
  return { tipo: ovile ? 'ovile' : 'villaggio', sito, object: r.object, solidi: r.solidi,
    spingiFuori: spintaDaScatole(r.scatole, ox, oz, R + 20), quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici, raggio: R };
}

// ─── Monastero ed eremo (M8, passo 3) ──────────────────────────────────────
// Un monastero è una rocca che ha cambiato tipo nel generatore (`luogo.tipo === 'monastero'`, 4–6 per mondo, decisione
// dell'utente: ricavati dalle rocche), quindi ha già il suo terrapieno, il poligono del piano e la porta scelti da
// `luoghi.js`. Al posto delle mura e del mastio: un muro di cinta basso, la chiesa, il chiostro con il portico, le ali
// (dormitorio, biblioteca, refettorio), la foresteria, l'infermeria e gli orti.
//
// Impianto: la chiesa chiude il lato opposto alla porta; il chiostro le sta davanti, quadrato, con il portico sui
// quattro lati e il pozzo nella corte; le ali stanno addossate al portico sui due lati lunghi; foresteria e infermeria
// verso la porta, dove il pellegrino arriva. Il terrazzo che sarebbe stato del borgo (il generatore lo ha già spianato)
// diventa l'orto grande: così non resta una terrazza vuota sotto il monastero.
//
// Un eremo è un sito di `carta.siti` (6–10 per mondo, in alto e isolati): una cappella, una cella, una croce di pietra
// e un orticello.

// Misure tarate sul piano della rocca, che è largo 50–65 m (mezze misure 25–34 m sui semi provati): tutto deve stare
// dentro la cinta, chiesa in fondo, chiostro al centro, foresteria e infermeria verso la porta.
export const MONASTERI = {
  corte: 13,                       // m: lato della corte del chiostro
  portico: 3,                      // m: profondità del portico attorno alla corte
  chiesa: { largo: 9.5, fondo: 17, piani: 3 },
  ala: { fondo: 7.5, piani: 2 },   // ali addossate al portico: dormitorio, biblioteca, refettorio
  foresteria: { largo: 11, fondo: 7.5, piani: 2 },
  infermeria: { largo: 8, fondo: 6.5, piani: 1 },
  muro: { alto: 2.3, spessore: 0.75, dentro: 1.2, porta: 3.4, pilastro: 0.5 },
  orto: { lato: [5, 8], quanti: [3, 6], margine: 1.6 },
  terrazzo: { aiuola: [9, 6], passo: 2.2, file: 2 },   // orto grande sul terrazzo: aiuole con i passaggi in mezzo
  margine: 2.2,                    // m tra due edifici
  dislivello: 2.8,
};

export const EREMI = {
  cappella: { largo: 6, fondo: 10, piani: 2 },
  cella: { largo: 5, fondo: 5, piani: 1 },
  raggio: 16,                      // m: entro cui si cerca posto
  orto: 5,
  margine: [1.5, 4],               // m: la terra calpestata attorno, più stretta che in un villaggio
};

/**
 * Suolo pieno dentro un poligono a stella (il piano di una rocca lo è): anelli dal centro al bordo, nessun buco e
 * nessuna sfumatura. Serve dove il contorno è netto perché c'è un muro, invece del bordo frastagliato di `geoTerra`.
 */
/** Distanza dal centro al bordo del poligono lungo la direzione (dx, dz), per poligoni a stella sul centro. */
function raggioPoligono(P, dx, dz) {
  let r = 0;
  for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
    const [u0, v0] = P[k], [u1, v1] = P[i], eu = u1 - u0, ev = v1 - v0;
    const den = dx * ev - dz * eu;
    if (Math.abs(den) < 1e-9) continue;
    const t = (u0 * ev - v0 * eu) / den, s = (dz * u0 - dx * v0) / den;   // t: lungo il raggio, s: lungo il lato
    if (t > r && s >= 0 && s <= 1) r = t;
  }
  return r;
}

function geoPoligono(P, ox, oz, quota, sopra, anelli = 6) {
  const nA = 64, T = SUOLO.tessera;
  const raggi = [];
  for (let j = 0; j < nA; j++) {
    const a = j / nA * Math.PI * 2;
    raggi.push(raggioPoligono(P, Math.cos(a), Math.sin(a)));
  }
  const pos = [], uv = [], idx = [];
  const p = (u, v) => { pos.push(ox + u, quota(u, v) + sopra, oz + v); uv.push(u / T, v / T); };
  p(0, 0);
  for (let k = 1; k <= anelli; k++) for (let j = 0; j < nA; j++) {
    const a = j / nA * Math.PI * 2, d = raggi[j] * k / anelli;
    p(Math.cos(a) * d, Math.sin(a) * d);
  }
  for (let j = 0; j < nA; j++) idx.push(0, 1 + (j + 1) % nA, 1 + j);
  for (let k = 1; k < anelli; k++) for (let j = 0; j < nA; j++) {
    const a = 1 + (k - 1) * nA + j, b = 1 + (k - 1) * nA + (j + 1) % nA, c = a + nA, d = b + nA;
    idx.push(a, b, c, b, d, c);
  }
  return chiudiGeo(pos, uv, idx);
}

/** Rettangoli di suolo (orti, spiazzi) appoggiati sul terreno: griglia di ~2 m per lotto. */
function geoRettangoli(lotti, ox, oz, quota, sopra) {
  const pos = [], uv = [], idx = [], T = SUOLO.tessera;
  for (const { c, s, f, a, b } of lotti) {
    const na = Math.max(1, Math.round(2 * a / 2)), nb = Math.max(1, Math.round(2 * b / 2)), base = pos.length / 3;
    for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
      const ti = -a + 2 * a * i / na, tj = -b + 2 * b * j / nb;
      const u = c[0] + s[0] * ti + f[0] * tj, v = c[1] + s[1] * ti + f[1] * tj;
      pos.push(ox + u, quota(u, v) + sopra, oz + v);
      uv.push((ti + a) / T, (tj + b) / T);
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      const p = base + j * (na + 1) + i;
      idx.push(p, p + na + 1, p + 1, p + 1, p + na + 1, p + na + 2);
    }
  }
  return chiudiGeo(pos, uv, idx);
}

/**
 * Monastero in coordinate del blocco: il luogo (rocca che è diventata monastero) ha il centro in (ox, oz) e il verso in
 * `luogo.verso`, come per la rocca di M7. `suolo.getHeight(x, z)` vale anche fuori dal blocco (quotaFinale).
 */
export function createMonastero(suolo, luogo, ox, oz, carta) {
  return completaPezzi(createMonasteroAPezzi(suolo, luogo, ox, oz, carta));
}

export function* createMonasteroAPezzi(suolo, luogo, ox, oz, carta) {
  const M = MONASTERI;
  const ux = luogo.verso.x, uz = luogo.verso.z;
  const X = (u, v) => ox + ux * u - uz * v, Z = (u, v) => oz + uz * u + ux * v;
  const terreno = (u, v) => suolo.getHeight(X(u, v), Z(u, v));
  const seme = hash2(Math.floor(luogo.x), Math.floor(luogo.z), (carta.seme ?? 1) ^ 0x3b05e21) || 1;
  const kit = creaKit({ X, Z, ux, uz, terreno, luogo, seme, nome: `monastero-${luogo.id}`, contesto: 'rocca', zone: 1,
    clima: climaDelLuogo(carta, luogo.x, luogo.z) });
  const rnd = kit.rnd;
  const P = localeDelLuogo(luogo, luogo.piani[0].poligono);
  const terrazzo = luogo.piani.find((p) => p.tipo === 'borgo' || p.tipo === 'terrazzo') ?? null;
  // Quota del piano del chiostro: il terrapieno del generatore, alzato al punto più alto che tocca.
  let piano = luogo.piani[0].q;
  for (const [u, v] of P) piano = Math.max(piano, terreno(u * 0.6, v * 0.6));
  piano += 0.15;
  const lotti = [], forme = [], orti = [];
  let t0 = performance.now();
  const forse = function* () { if (performance.now() - t0 > PEZZO_MS) { yield; t0 = performance.now(); } };

  // ─── Porta nel muro di cinta: dal lato da cui arriva la strada della rete ───
  // Il punto scelto dal generatore (`portaRocca`) guarda il borgo, che qui non c'è: se lo usassimo, la strada
  // entrerebbe scavalcando il muro da un'altra parte. Si cerca invece il punto del contorno più vicino alla strada,
  // e si apre il varco sul lato che gli corrisponde; senza strade vicine si torna al punto del generatore.
  const Rm = Math.max(...P.map(([u, v]) => Math.hypot(u, v)));
  const mondoX = (u, v) => X(u, v) - ox + luogo.x, mondoZ = (u, v) => Z(u, v) - oz + luogo.z;
  const st = { d: Infinity, semi: 0, banchina: 0 };
  let pu = 0, pv = 0, dStrada = Infinity;
  for (let k = 0; k < 48; k++) {
    const a = k / 48 * Math.PI * 2, u = Math.cos(a) * (Rm + 6), v = Math.sin(a) * (Rm + 6);
    distanzaStrada(carta, mondoX(u, v), mondoZ(u, v), st);
    if (st.d < dStrada) { dStrada = st.d; pu = u; pv = v; }
  }
  if (dStrada > 150) {                                           // nessuna strada vicina: il punto del generatore
    const pr = luogo.portaRocca;
    [pu, pv] = pr ? localeDelLuogo(luogo, [[pr.x, pr.z]])[0] : [P[0][0], P[0][1]];
  }
  let latoPorta = 0, dPorta = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(m[0] - pu, m[1] - pv);
    if (d < dPorta) { dPorta = d; latoPorta = i; }
  }
  const a0 = P[latoPorta], b0 = P[(latoPorta + 1) % P.length];
  const mPorta = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const lp = Math.hypot(mPorta[0], mPorta[1]) || 1;
  const dentroDir = [-mPorta[0] / lp, -mPorta[1] / lp];          // dalla porta verso il centro
  const croce = [-dentroDir[1], dentroDir[0]];

  // ─── Muro di cinta basso lungo il poligono, con il varco della porta ───
  const pezziMuro = [];
  const muroScatole = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.5) continue;
    const t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], n = [-t[1], t[0]];
    const dentro = dentroPoligono(P, a[0] + t[0] * l / 2 + n[0], a[1] + t[1] * l / 2 + n[1]) ? 1 : -1;
    const nn = [n[0] * dentro, n[1] * dentro];                   // verso l'interno
    // Tratti da costruire lungo il lato (m): tutto il lato, meno il varco della porta, esattamente largo quanto serve.
    const varco = i === latoPorta ? [(l - M.muro.porta) / 2, (l + M.muro.porta) / 2] : null;
    const tratti = varco ? [[0, varco[0]], [varco[1], l]] : [[0, l]];
    const pezzi = [];
    for (const [d0, d1] of tratti) {
      const n = Math.max(1, Math.round((d1 - d0) / 2.5));
      for (let k = 0; k < n; k++) pezzi.push([d0 + (d1 - d0) * k / n, d0 + (d1 - d0) * (k + 1) / n]);
    }
    for (const [d0, d1] of pezzi) {
      const q0 = [a[0] + t[0] * d0, a[1] + t[1] * d0], q1 = [a[0] + t[0] * d1, a[1] + t[1] * d1];
      const R = [q0, q1, [q1[0] + nn[0] * M.muro.spessore, q1[1] + nn[1] * M.muro.spessore],
        [q0[0] + nn[0] * M.muro.spessore, q0[1] + nn[1] * M.muro.spessore]];
      const Q = R.map(([u, v]) => [X(u, v), Z(u, v)]);
      const base = Math.min(terreno(q0[0], q0[1]), terreno(q1[0], q1[1]), piano) - 0.8;
      const cima = Math.max(terreno(q0[0], q0[1]), terreno(q1[0], q1[1]), piano - M.muro.dentro) + M.muro.alto;
      pezziMuro.push(prisma(Q, Q, base, cima));
      const cu = (q0[0] + q1[0]) / 2 + nn[0] * M.muro.spessore / 2, cv = (q0[1] + q1[1]) / 2 + nn[1] * M.muro.spessore / 2;
      muroScatole.push({ cu, cv, au: t[0], av: t[1], hl: Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / 2, hw: M.muro.spessore / 2 });
    }
    if (varco) {                                                 // pilastri ai lati del varco
      for (const s of varco) {
        const q = [a[0] + t[0] * s, a[1] + t[1] * s];
        const c = [q[0] + nn[0] * M.muro.spessore / 2, q[1] + nn[1] * M.muro.spessore / 2];
        const R = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([si, sj]) =>
          [X(c[0] + t[0] * si * M.muro.pilastro + nn[0] * sj * (M.muro.spessore / 2 + 0.12),
            c[1] + t[1] * si * M.muro.pilastro + nn[1] * sj * (M.muro.spessore / 2 + 0.12)),
          Z(c[0] + t[0] * si * M.muro.pilastro + nn[0] * sj * (M.muro.spessore / 2 + 0.12),
            c[1] + t[1] * si * M.muro.pilastro + nn[1] * sj * (M.muro.spessore / 2 + 0.12))]);
        pezziMuro.push(prisma(R, R, terreno(q[0], q[1]) - 0.8, Math.max(terreno(q[0], q[1]), piano) + M.muro.alto + 0.6));
        muroScatole.push({ cu: c[0], cv: c[1], au: t[0], av: t[1], hl: M.muro.pilastro, hw: M.muro.spessore / 2 + 0.12 });
      }
    }
    yield* forse();
  }
  yield;

  /** Il rettangolo (centro c, fronte f, mezze misure a lungo s, b lungo f) ci sta? */
  function libero(c, f, a, b, dentroMuro = true) {
    const s = [-f[1], f[0]], L = { c, s, f, a, b };
    if (lotti.some((o) => siToccano(o, L, M.margine))) return false;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const u = c[0] + s[0] * a * i + f[0] * b * j, v = c[1] + s[1] * a * i + f[1] * b * j;
      if (dentroMuro && (!dentroPoligono(P, u, v) || distanzaContorno(P, u, v) < M.muro.spessore + 0.6)) return false;
    }
    return true;
  }
  /** Registra il lotto e la fascia di terra battuta attorno. */
  function segnaLotto(c, f, largo, fondo, attorno = 2.5) {
    const L = { c, s: [-f[1], f[0]], f, a: largo / 2, b: fondo / 2 };
    lotti.push(L);
    forme.push({ ...L, a: largo / 2 + attorno, b: fondo / 2 + attorno });
    return L;
  }

  // ─── Chiesa: chiude il lato opposto alla porta, facciata verso il chiostro ───
  // Dove la cinta da quella parte è corta, la chiesa si accorcia (come il palazzo della rocca); se nemmeno accorciata
  // ci sta, si cerca lungo gli altri due assi del chiostro.
  const C = M.chiesa;
  const dCorte = M.corte / 2 + M.portico;
  const fondoQui = (d) => Math.min(C.fondo, raggioPoligono(P, d[0], d[1]) - (dCorte + 0.6) - 1.8);
  let verso = dentroDir, fondo = fondoQui(dentroDir);
  if (fondo < C.fondo) {
    for (const d of [croce, [-croce[0], -croce[1]]]) {
      const f2 = fondoQui(d);
      if (f2 > fondo) { verso = d; fondo = f2; }
    }
  }
  let chiesa = null;
  if (fondo >= 12) {
    const misureC = { ...C, fondo };
    const dC = dCorte + fondo / 2 + 0.6;
    for (let k = 0; k < 10 && !chiesa; k++) {
      // Se non ci sta, prima un poco di sbieco lungo la cinta, poi più vicina al chiostro.
      const sposta = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5, arretra = Math.floor(k / 4) * 2;
      const lato = [-verso[1], verso[0]];
      const c = [verso[0] * (dC - arretra) + lato[0] * sposta, verso[1] * (dC - arretra) + lato[1] * sposta];
      const f = [-verso[0], -verso[1]];
      if (!libero(c, f, C.largo / 2, fondo / 2)) continue;
      kit.edificio('chiesa', { u: c[0], v: c[1], fu: f[0], fv: f[1], quota: piano, misure: misureC });
      chiesa = segnaLotto(c, f, C.largo, fondo, 3);
    }
  }
  yield* forse();

  // ─── Ali addossate al portico sui due lati: dormitorio, biblioteca, refettorio ───
  // Prima del chiostro, perché gli stanno attaccate: il test di sovrapposizione vale solo con la chiesa e fra loro.
  // Edifici nominati del kit (M7): hanno il punto «porta», da cui nascono «Entra» e la riga del cronista.
  const A = M.ala, ALI = ['dormitorio', 'biblioteca', 'refettorio'];
  const largoAla = M.corte * 0.56;
  // Posti attorno al chiostro, in ordine di preferenza: i due lati, poi il lato della porta (la chiesa tiene il quarto).
  const postiAla = [];
  for (const lato of [1, -1]) for (const avanti of [0.5, -0.5, 0]) postiAla.push([lato, avanti, croce]);
  for (const avanti of [0.5, -0.5]) postiAla.push([-1, avanti, dentroDir]);
  let nAli = 0;
  for (const [lato, avanti, asse] of postiAla) {
    if (nAli >= ALI.length) break;
    const perp = [-asse[1], asse[0]];
    const c = [asse[0] * lato * (dCorte + A.fondo / 2) + perp[0] * avanti * largoAla,
      asse[1] * lato * (dCorte + A.fondo / 2) + perp[1] * avanti * largoAla];
    const f = [-asse[0] * lato, -asse[1] * lato];
    if (!libero(c, f, largoAla / 2, A.fondo / 2)) continue;
    kit.edificio(ALI[nAli], { u: c[0], v: c[1], fu: f[0], fv: f[1], quota: piano,
      misure: { largo: largoAla, fondo: A.fondo, piani: A.piani } });
    segnaLotto(c, f, largoAla, A.fondo, 2);
    nAli++;
    yield* forse();
  }

  // ─── Chiostro: corte quadrata col portico sui quattro lati, pozzo nel mezzo ───
  for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = [dentroDir[0] * du + croce[0] * dv, dentroDir[1] * du + croce[1] * dv];
    const c = [d[0] * (M.corte / 2 + M.portico / 2), d[1] * (M.corte / 2 + M.portico / 2)];
    kit.loggia(c, [-d[0], -d[1]], M.corte + 2 * M.portico, M.portico, piano);
    yield* forse();
  }
  lotti.push({ c: [0, 0], s: dentroDir, f: croce, a: dCorte, b: dCorte });
  forme.push({ c: [0, 0], s: dentroDir, f: croce, a: dCorte + 1, b: dCorte + 1 });
  kit.pozzo(croce[0] * 2.5, croce[1] * 2.5, piano);

  // ─── Foresteria e infermeria verso la porta, dove arriva il pellegrino ───
  for (const [tipo, E, lato] of [['foresteria', M.foresteria, 1], ['infermeria', M.infermeria, -1]]) {
    let messo = false;
    // Verso la porta, sul proprio lato; se non ci sta, più in là, più di fianco e infine dall'altro lato.
    for (const l of [lato, -lato]) {
      for (const sposta of [0.55, 0.95, 0.2, 1.35]) {
        for (let k = 0; k < 10 && !messo; k++) {
          const d = dCorte + 3 + k * 1.2;
          const c = [-dentroDir[0] * d + croce[0] * l * (dCorte * sposta), -dentroDir[1] * d + croce[1] * l * (dCorte * sposta)];
          const f = [dentroDir[0], dentroDir[1]];
          if (!libero(c, f, E.largo / 2, E.fondo / 2)) continue;
          kit.edificio(tipo, { u: c[0], v: c[1], fu: f[0], fv: f[1], misure: E });
          segnaLotto(c, f, E.largo, E.fondo, 2.5);
          messo = true;
        }
        if (messo) break;
      }
      if (messo) break;
    }
    yield* forse();
  }

  // ─── Orti: aiuole dentro la cinta dove è rimasto posto, e l'orto grande sul terrazzo del generatore ───
  const nOrti = M.orto.quanti[0] + Math.floor(rnd() * (M.orto.quanti[1] - M.orto.quanti[0] + 1));
  for (let k = 0; k < 90 && orti.length < nOrti; k++) {
    const lato = M.orto.lato[0] + rnd() * (M.orto.lato[1] - M.orto.lato[0]);
    const a = rnd() * Math.PI * 2, d = (dCorte + 4) + rnd() * 18;
    const c = [Math.cos(a) * d, Math.sin(a) * d], f = [Math.cos(a), Math.sin(a)];
    if (!libero(c, f, lato / 2, lato / 2 * 0.7)) continue;
    const L = { c, s: [-f[1], f[0]], f, a: lato / 2, b: lato / 2 * 0.7 };
    lotti.push(L);
    orti.push(L);
  }
  if (terrazzo) {
    // Il terrazzo che sarebbe stato del borgo (il generatore lo ha già spianato): l'orto grande dell'abbazia, ad
    // aiuole separate dai passaggi, con la stalla e il pagliaio in fondo. Così non resta una terrazza vuota.
    const T = localeDelLuogo(luogo, [[terrazzo.cx, terrazzo.cz]])[0];
    const tf = localeDelLuogo(luogo, [[luogo.x + terrazzo.ux, luogo.z + terrazzo.uz]])[0];
    const f = [tf[0], tf[1]], s = [-f[1], f[0]];             // f: asse lungo del terrazzo
    const [la, lb] = M.terrazzo.aiuola, passo = M.terrazzo.passo;
    const ta = Math.max(4, Math.min(20, terrazzo.a - 3)), tb = Math.max(4, Math.min(14, terrazzo.b - 3));
    const nA = Math.max(1, Math.floor((2 * ta + passo) / (la + passo)));   // aiuole lungo l'asse del terrazzo
    const nB = Math.max(1, Math.min(M.terrazzo.file, Math.floor((2 * tb + passo) / (lb + passo))));
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
      const du = -ta + la / 2 + i * (la + passo), dv = -((nB - 1) * (lb + passo)) / 2 + j * (lb + passo);
      const c = [T[0] + f[0] * du + s[0] * dv, T[1] + f[1] * du + s[1] * dv];
      if (Math.abs(terreno(c[0], c[1]) - terrazzo.q) > 2.5) continue;      // solo sul ripiano, non sulla scarpata
      orti.push({ c, s: f, f: s, a: la / 2, b: lb / 2 });
    }
    const cs = [T[0] + f[0] * (ta + 7), T[1] + f[1] * (ta + 7)];
    if (libero(cs, s, 8, 4, false) && Math.abs(terreno(cs[0], cs[1]) - terrazzo.q) < 2.5) {
      kit.edificio('stalla', { u: cs[0], v: cs[1], fu: s[0], fv: s[1] });
      segnaLotto(cs, s, 14, 7, 3);
      kit.pagliaio(cs[0] - s[0] * 10, cs[1] - s[1] * 10);
    }
  }
  yield;

  const r = yield* kit.chiudiAPezzi();
  // Muro di cinta: una sola chiamata, nella pietra del luogo.
  const geoMuro = unisci(pezziMuro);
  if (geoMuro) {
    const mesh = new THREE.Mesh(geoMuro, materialeMuro(tonoDelLuogo(luogo, 0x9c968a), 0.18));
    mesh.name = `monastero-${luogo.id}-cinta`;
    r.object.add(mesh);
    r.misure.chiamate++;
    r.misure.triangoli += geoMuro.attributes.position.count / 3;
  }
  // ─── Suolo: terra battuta dentro la cinta, sentiero dalla porta alla chiesa, aiuole degli orti ───
  // Il suolo segue il terreno, mai sopra: `quotaSuolo` qui è null (come nei villaggi) e il cavaliere cammina sul
  // terreno, quindi un suolo disegnato più in alto lo farebbe sprofondare. Il terrapieno del generatore ha già
  // spianato il piano, perciò dentro la cinta il terreno è già alla quota del chiostro.
  const quotaS = (u, v) => terreno(u, v);
  const distForme = (u, v) => {
    let m = Infinity;
    for (const L of forme) m = Math.min(m, distRett(L, u, v));
    return m;
  };
  // Sentiero dalla porta alla facciata della chiesa, che esce di 14 m dalla cinta (di là arriva la strada della rete).
  const sentiero = { punti: [], largo: 3 };
  const dPortaC = Math.hypot(mPorta[0], mPorta[1]);
  for (let t = 0; t <= 1.001; t += 0.08) {
    const d = (1 - t) * (dPortaC + 14) + t * (dCorte + 1);
    sentiero.punti.push([-dentroDir[0] * d, -dentroDir[1] * d]);
  }
  const Lm = Math.max(...P.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v)))) + 6;
  // Fuori dalla cinta: solo la fascia attorno al sentiero che esce dalla porta e alle forme che stanno fuori (la
  // stalla sul terrazzo). Gli edifici dentro non devono tirarsi dietro terra oltre il muro, o si vedono striature.
  // Dentro ci pensa `geoPoligono`, che riempie tutto senza buchi fino al muro.
  const formeFuori = forme.filter((L) => !dentroPoligono(P, L.c[0], L.c[1]));
  const fuoriCinta = (u, v) => {
    if (dentroPoligono(P, u, v)) return Infinity;
    let m = vicinoPolilinea(sentiero.punti, u, v).d - sentiero.largo / 2;
    for (const L of formeFuori) m = Math.min(m, distRett(L, u, v));
    return m;
  };
  attaccaSuolo(r, [
    // Cortile: terra battuta piena fino al muro (richiesta dell'utente: non a macchie). Fuori, una fascia stretta.
    ['terra', geoPoligono(P, ox, oz, quotaS, SUOLO.sopra), 0],
    ['fuori', geoTerra(Lm, fuoriCinta, ox, oz, quotaS, seme, [1.5, 4]), 0],
    ['sentiero', geoNastri([sentiero], ox, oz, quotaS, SUOLO.sopra + 0.02), 1],
    ['orti', geoRettangoli(orti, ox, oz, quotaS, SUOLO.sopra + 0.03), 3],
  ]);
  yield;
  const raggio = Lm;
  return { tipo: 'monastero', luogo, object: r.object, solidi: r.solidi,
    spingiFuori: spintaDaScatole([...r.scatole, ...muroScatole], ox, oz, raggio + 20), quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici, raggio };
}

/** Eremo: cappella, cella, croce di pietra e orticello, su un sito di `carta.siti`. */
export function createEremo(suolo, sito, ox, oz, carta) {
  return completaPezzi(createEremoAPezzi(suolo, sito, ox, oz, carta));
}

export function* createEremoAPezzi(suolo, sito, ox, oz, carta) {
  const E = EREMI;
  const seme = hash2(Math.floor(sito.x), Math.floor(sito.z), (carta.seme ?? 1) ^ 0x51e3401) || 1;
  const kit = creaKit({ X: (u) => ox + u, Z: (u, v) => oz + v, terreno: (u, v) => suolo.getHeight(ox + u, oz + v),
    seme, nome: `eremo-${sito.id}`, contesto: 'campagna', zone: 1, clima: climaDelLuogo(carta, sito.x, sito.z) });
  const rnd = kit.rnd;
  const quota = (u, v) => suolo.getHeight(ox + u, oz + v);
  const lotti = [], forme = [], orti = [];
  const dislivello = (c, f, a, b) => {
    const s = [-f[1], f[0]];
    let mn = Infinity, mx = -Infinity;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const h = quota(c[0] + s[0] * a * i + f[0] * b * j, c[1] + s[1] * a * i + f[1] * b * j);
      if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return mx - mn;
  };
  const libero = (c, f, a, b) => {
    const L = { c, s: [-f[1], f[0]], f, a, b };
    return !lotti.some((o) => siToccano(o, L, 2)) && dislivello(c, f, a, b) <= 2.6;
  };
  // Cappella: al centro, verso a caso (sui monti non c'è una strada da seguire).
  const af = rnd() * Math.PI * 2, f0 = [Math.cos(af), Math.sin(af)];
  let cap = null;
  for (let k = 0; k < 14 && !cap; k++) {
    const a = rnd() * Math.PI * 2, d = k ? 2 + rnd() * (E.raggio - 4) : 0;
    const c = [Math.cos(a) * d, Math.sin(a) * d];
    if (!libero(c, f0, E.cappella.largo / 2, E.cappella.fondo / 2)) continue;
    kit.edificio('cappella', { u: c[0], v: c[1], fu: f0[0], fv: f0[1], misure: E.cappella });
    const L = { c, s: [-f0[1], f0[0]], f: f0, a: E.cappella.largo / 2, b: E.cappella.fondo / 2 };
    lotti.push(L);
    forme.push({ ...L, a: L.a + 1, b: L.b + 1 });
    cap = L;
  }
  if (cap) {
    // Cella dell'eremita, di fianco alla cappella; croce di pietra davanti; orticello dietro.
    const lato = rnd() < 0.5 ? 1 : -1, s = [-f0[1] * lato, f0[0] * lato];
    for (let k = 0; k < 8; k++) {
      const c = [cap.c[0] + s[0] * (E.cappella.largo / 2 + 2 + E.cella.largo / 2 + k * 0.8) - f0[0] * 2,
        cap.c[1] + s[1] * (E.cappella.largo / 2 + 2 + E.cella.largo / 2 + k * 0.8) - f0[1] * 2];
      if (!libero(c, f0, E.cella.largo / 2, E.cella.fondo / 2)) continue;
      kit.corpo({ c, f: f0, largo: E.cella.largo, fondo: E.cella.fondo, piani: 1, intonaco: false,
        comignolo: true, legno: false, retro: false });
      const L = { c, s: [-f0[1], f0[0]], f: f0, a: E.cella.largo / 2, b: E.cella.fondo / 2 };
      lotti.push(L);
      forme.push({ ...L, a: L.a + 1, b: L.b + 1 });
      break;
    }
    const co = [cap.c[0] + f0[0] * (E.cappella.fondo / 2 + 3.5), cap.c[1] + f0[1] * (E.cappella.fondo / 2 + 3.5)];
    kit.catasta(co[0], co[1], f0[0], f0[1], 0.8);
    const cOrto = [cap.c[0] - f0[0] * (E.cappella.fondo / 2 + E.orto), cap.c[1] - f0[1] * (E.cappella.fondo / 2 + E.orto)];
    if (dislivello(cOrto, f0, E.orto / 2, E.orto / 2) < 2.2) {
      orti.push({ c: cOrto, s: [-f0[1], f0[0]], f: f0, a: E.orto / 2, b: E.orto / 2 * 0.8 });
    }
  }
  yield;
  const r = yield* kit.chiudiAPezzi();
  const distForme = (u, v) => {
    let m = Infinity;
    for (const L of forme) m = Math.min(m, distRett(L, u, v));
    return m;
  };
  attaccaSuolo(r, [
    ['terra', geoTerra(E.raggio + 6, distForme, ox, oz, quota, seme, EREMI.margine), 0],
    ['orti', geoRettangoli(orti, ox, oz, quota, SUOLO.sopra + 0.03), 3],
  ]);
  yield;
  return { tipo: 'eremo', sito, object: r.object, solidi: r.solidi,
    spingiFuori: spintaDaScatole(r.scatole, ox, oz, E.raggio + 20), quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici,
    raggio: E.raggio };
}
