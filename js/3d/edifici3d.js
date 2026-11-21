// Knight Dawn — kit degli edifici (M7, passo 5): case e edifici nominati di borgo, rocca e campagna, poi villaggi.
//
// Un solo kit, così borgo, rocca e campagna hanno lo stesso stile: pietra (come le mura) con parti intonacate,
// tetti a due falde in coppi, legno scuro per porte e travi. Tipi di casa: a schiera, bassa, casa-torre, con
// bottega, rurale (con fienile). Edifici nominati: stalla, taverna, fabbro, guaritore, mercato (banchi e loggia),
// chiesa e loggia grande (sede maggiore); nella rocca cappella, pozzo, sala d'armi, armeria.
//
// Prestazioni (docs/PRESTAZIONI.md, passo 6): i volumi di tutte le case si uniscono per materiale (una chiamata per
// materiale per tutto il kit); finestre, porte e comignoli sono istanze condivise, divise in zone di ~60 m che si
// spengono oltre DETTAGLIO.lontano m (THREE.LOD): da lontano restano i volumi (~50 triangoli a casa). Dettaglio dei
// muri e dei coppi in texture generate una volta. Collisioni: una scatola per edificio. Camera: una sagoma a scatole
// invisibile (il raycast non passa sulle geometrie vere, troppe).
//
// Coordinate: il kit lavora nelle coordinate locali (u, v) di chi lo usa (borgo, rocca: quelle del luogo; campagna:
// quelle del blocco) e porta i punti nel blocco con X(u, v), Z(u, v); le direzioni con la stessa rotazione (ux, uz).

import * as THREE from 'three';
import { prisma, unisci, rifinisci, materialeMuro, tonoDelLuogo } from './rocca3d.js';

const COL = {
  pietra: '#aa9d87', intonaco: '#d6cbb5', coppi: '#a5634a', legno: '#4f3420', finestra: '#231d19',
};
const LUCE_RIFLESSA = 0.2;
const PIANO = 3.0;                         // m: altezza di un piano
const FALDA = 0.47;                        // tangente della pendenza dei tetti (~25°)
const SPORTO = 0.45;                       // m: sporto del tetto
// Irregolarità (richiesta dell'utente: spigoli non tutti lineari, l'idea delle pietre irregolari): pareti fuori
// squadra di ± fuoriSquadra m; cantonali alti `alto`, lunghi `lungo`, profondi `fondo` (m), sporgenti ~`sporge` m.
const IRREGOLARE = { fuoriSquadra: 0.07, alto: [0.38, 0.58], lungo: [0.5, 0.9], fondo: [0.26, 0.36], sporge: 0.03 };
export const DETTAGLIO = { lontano: 160, zona: 60 };

/** Tipi di casa: larghezza (lungo la via) e profondità [min, max] in m, piani [min, max], intonaco (probabilità). */
export const TIPI_CASA = {
  schiera: { largo: [5.5, 8], fondo: [7, 9.5], piani: [2, 3], intonaco: 0.45 },
  bassa:   { largo: [5, 7], fondo: [6, 8], piani: [1, 1], intonaco: 0.25 },
  torre:   { largo: [4.5, 5.5], fondo: [4.5, 5.5], piani: [3, 4], intonaco: 0.1 },
  bottega: { largo: [6.5, 9], fondo: [8, 10], piani: [2, 2], intonaco: 0.5 },
  rurale:  { largo: [8, 11], fondo: [6.5, 8], piani: [1, 2], intonaco: 0.35 },
};

/** Edifici nominati: misure (largo × fondo, m), piani, materiale delle pareti. */
export const EDIFICI = {
  stalla:    { nome: 'Stalla', largo: 14, fondo: 7, piani: 1, intonaco: false, recinto: 8 },
  taverna:   { nome: 'Taverna', largo: 11, fondo: 9, piani: 2, intonaco: true },
  fabbro:    { nome: 'Fabbro', largo: 9, fondo: 7, piani: 1, intonaco: false, tettoia: 4 },
  guaritore: { nome: 'Guaritore', largo: 7, fondo: 7, piani: 2, intonaco: true },
  loggia:    { nome: 'Loggia del mercato', largo: 10, fondo: 6, loggia: true },
  loggiaGrande: { nome: 'Loggia', largo: 16, fondo: 8, loggia: true },
  chiesa:    { nome: 'Chiesa', largo: 11, fondo: 22, piani: 3, intonaco: false, campanile: 4 },
  cappella:  { nome: 'Cappella', largo: 6, fondo: 10, piani: 2, intonaco: false, campanile: 1.8 },
  salaArmi:  { nome: "Sala d'armi", largo: 16, fondo: 9, piani: 2, intonaco: false },
  armeria:   { nome: 'Armeria', largo: 8, fondo: 6, piani: 1, intonaco: false },
};

// ─── Texture (una volta) ──────────────────────────────────────────────────

let _coppi = null, _intonaco = null;
const rndDa = (seme) => () => ((seme = (seme * 1103515245 + 12345) >>> 0) / 4294967296);
const lim = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Coppi (512 px = 6,4 m): canali lungo la falda (v) larghi ~0,25 m, file ogni ~0,45 m, toni vari, muschio. */
function texturaCoppi() {
  if (_coppi) return _coppi;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), rnd = rndDa(4242);
  g.fillStyle = 'rgb(90,70,60)';
  g.fillRect(0, 0, N, N);
  const col = 20, fila = 36;
  for (let x = 0; x < N; x += col) {
    const sfasa = Math.floor(rnd() * fila);
    for (let y = -fila; y < N + fila; y += fila) {
      const v = 165 + Math.floor(rnd() * 70), t = Math.floor(rnd() * 14);
      const gr = g.createLinearGradient(x, 0, x + col, 0);         // coppo tondo: chiaro al centro, scuro ai lati
      gr.addColorStop(0, `rgb(${lim(v - 55)},${lim(v - 70 - t)},${lim(v - 80 - t)})`);
      gr.addColorStop(0.5, `rgb(${lim(v + 15)},${lim(v - 8 - t)},${lim(v - 20 - t)})`);
      gr.addColorStop(1, `rgb(${lim(v - 60)},${lim(v - 75 - t)},${lim(v - 85 - t)})`);
      g.fillStyle = gr;
      g.fillRect(x + 1, y + sfasa, col - 2, fila - 3);
      g.fillStyle = 'rgba(20,12,8,0.35)';                           // ombra della fila sopra
      g.fillRect(x + 1, y + sfasa + fila - 6, col - 2, 3);
      if (rnd() < 0.12) { g.fillStyle = `rgba(90,105,60,${0.2 + rnd() * 0.25})`; g.fillRect(x + 2, y + sfasa + rnd() * fila, col - 4, 4 + rnd() * 8); }
    }
  }
  _coppi = new THREE.CanvasTexture(c);
  _coppi.colorSpace = THREE.SRGBColorSpace;
  _coppi.wrapS = _coppi.wrapT = THREE.RepeatWrapping;
  _coppi.anisotropy = 4;
  return _coppi;
}

/** Intonaco (512 px = 6,4 m): chiaro, macchiato, dilavato, con qualche pietra che affiora dove è caduto. */
function texturaIntonaco() {
  if (_intonaco) return _intonaco;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), rnd = rndDa(9191);
  g.fillStyle = 'rgb(226,220,208)';
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 90; k++) {                                   // macchie e aloni
    const x = rnd() * N, y = rnd() * N, r = 10 + rnd() * 70, scuro = rnd() < 0.6;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, scuro ? `rgba(110,95,75,${0.06 + rnd() * 0.1})` : `rgba(255,250,240,${0.08 + rnd() * 0.1})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  for (let k = 0; k < 7; k++) {                                    // intonaco caduto: pietre a vista
    const x0 = rnd() * N, y0 = rnd() * N, w = 30 + rnd() * 60, h = 20 + rnd() * 40;
    for (let s = 0; s < 10; s++) {
      const v = 120 + Math.floor(rnd() * 60);
      g.fillStyle = `rgb(${v + 8},${v},${v - 8})`;
      g.beginPath();
      g.ellipse(x0 + rnd() * w, y0 + rnd() * h, 6 + rnd() * 8, 4 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let k = 0; k < 40; k++) {                                   // colature verticali
    const x = rnd() * N, y = rnd() * N, l = 30 + rnd() * 120;
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, `rgba(90,80,65,${0.08 + rnd() * 0.08})`); gr.addColorStop(1, 'rgba(90,80,65,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 4, l);
  }
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * 14; d[i] = lim(d[i] + k); d[i + 1] = lim(d[i + 1] + k); d[i + 2] = lim(d[i + 2] + k); }
  g.putImageData(img, 0, 0);
  _intonaco = new THREE.CanvasTexture(c);
  _intonaco.colorSpace = THREE.SRGBColorSpace;
  _intonaco.wrapS = _intonaco.wrapT = THREE.RepeatWrapping;
  _intonaco.anisotropy = 4;
  return _intonaco;
}

// ─── Geometrie ────────────────────────────────────────────────────────────

/** Solido a 6 facce da 4 punti sopra e 4 sotto ([x, y, z], stesso ordine), facce verso l'esterno. */
function esaedro(sopra, sotto) {
  const V = [...sotto, ...sopra];
  const C = [0, 1, 2].map((k) => V.reduce((s, v) => s + v[k], 0) / 8);
  const facce = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of facce) {
    const [a, b, c, d] = f.map((i) => V[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(...n) < 1e-9) {                     // primo triangolo degenere (timpani): l'altro
      const w2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      n = [w[1] * w2[2] - w[2] * w2[1], w[2] * w2[0] - w[0] * w2[2], w[0] * w2[1] - w[1] * w2[0]];
    }
    const fc = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - C[k]);
    const tri = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(...p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Crea un kit di edifici.
 * @param {object} o
 * @param {(u:number, v:number) => number} o.X  da locale a blocco
 * @param {(u:number, v:number) => number} o.Z
 * @param {number} o.ux  rotazione delle direzioni (verso del luogo; 1, 0 per il blocco)
 * @param {number} o.uz
 * @param {(u:number, v:number) => number} o.terreno  quota del terreno nel punto locale
 * @param {object} [o.luogo]  per il tono di fondo della pietra (tonoDelLuogo)
 * @param {number} [o.seme]
 */
export function creaKit({ X, Z, ux = 1, uz = 0, terreno, luogo = null, seme = 1, nome = 'edifici' }) {
  let s0 = (seme >>> 0) || 1;
  const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296);
  const tono = (c) => (luogo ? tonoDelLuogo(luogo, c) : new THREE.Color(c));
  const mat = {
    pietra: materialeMuro(tono(COL.pietra), LUCE_RIFLESSA),
    intonaco: materialeMuro(tono(COL.intonaco), LUCE_RIFLESSA, texturaIntonaco()),
    coppi: materialeMuro(new THREE.Color(COL.coppi), LUCE_RIFLESSA, texturaCoppi()),
    legno: new THREE.MeshLambertMaterial({ color: COL.legno, flatShading: true }),
    finestra: new THREE.MeshLambertMaterial({ color: COL.finestra }),
  };
  mat.legno.emissive.set(COL.legno).multiplyScalar(LUCE_RIFLESSA * 0.5);
  const parti = { pietra: [], intonaco: [], coppi: [], legno: [] };
  const sagome = [];                                   // scatole invisibili per la camera
  const scatole = [];                                  // collisioni (locali)
  const dettagli = [];                                 // { tipo, u, v, y, fu, fv, sx, sy, sz }
  const edifici = [];                                  // edifici nominati: { tipo, nome, porta: { u, v, fu, fv } }
  let case_ = 0;
  const P = (u, v, y) => [X(u, v), y, Z(u, v)];
  const q4 = (pp) => pp.map(([u, v]) => [X(u, v), Z(u, v)]);

  /** Rettangolo locale: centro c, asse s (lungo la via), fronte f; mezze misure a (lungo s), b (lungo f). */
  const rett = (c, s, f, a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]].map(([i, j]) => [c[0] + s[0] * i + f[0] * j, c[1] + s[1] * i + f[1] * j]);

  /** Quote del terreno sotto un rettangolo (angoli, mezzerie, centro). */
  function quote(c, s, f, a, b) {
    let mn = Infinity, mx = -Infinity;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const h = terreno(c[0] + s[0] * a * i + f[0] * b * j, c[1] + s[1] * a * i + f[1] * b * j);
      if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return { mn, mx };
  }

  /** Tetto a due falde con colmo lungo s, da quota `gronda`; timpani nel materiale delle pareti. */
  function tetto(c, s, f, a, b, gronda, materialeTimpano, spessore = 0.22) {
    const A = a + SPORTO, Bf = b + SPORTO, colmo = gronda + b * FALDA, basso = gronda - SPORTO * FALDA;
    for (const lato of [-1, 1]) {
      const sopra = [[-A, 0, colmo], [A, 0, colmo], [A, lato * Bf, basso], [-A, lato * Bf, basso]]
        .map(([i, j, y]) => P(c[0] + s[0] * i + f[0] * j, c[1] + s[1] * i + f[1] * j, y));
      const sotto = sopra.map(([x, y, z]) => [x, y - spessore, z]);
      const g = esaedro(sopra, sotto);
      g.userData.asse = [ux * s[0] - uz * s[1], uz * s[0] + ux * s[1]];   // coppi lungo la falda
      parti.coppi.push(g);
    }
    for (const lato of [-1, 1]) {                       // timpani
      const pA = P(c[0] + s[0] * lato * a + f[0] * -b, c[1] + s[1] * lato * a + f[1] * -b, gronda);
      const pB = P(c[0] + s[0] * lato * a + f[0] * b, c[1] + s[1] * lato * a + f[1] * b, gronda);
      const pC = P(c[0] + s[0] * lato * a, c[1] + s[1] * lato * a, colmo - 0.05);
      const dx = (ux * s[0] - uz * s[1]) * -lato * 0.3, dz = (uz * s[0] + ux * s[1]) * -lato * 0.3;
      const sopra = [pA, pB, pC, pC], sotto = [pA, pB, pC, pC].map(([x, y, z]) => [x + dx, y, z + dz]);
      materialeTimpano.push(esaedro(sopra, sotto));
    }
    return colmo;
  }

  /** Finestre e porte su una facciata (lungo s, normale `n`), `piani` piani da `pavimento`. */
  function facciata(c, s, n, a, piani, pavimento, { porta = 0, finestre = true, bottega = false } = {}) {
    const passo = 2.6, k = Math.max(1, Math.floor((2 * a - 1) / passo));
    for (let p = 0; p < piani; p++) {
      for (let i = 0; i < k; i++) {
        const t = -a + 2 * a * (i + 0.5) / k;
        if (p === 0 && porta && Math.abs(t) < (bottega ? 1.6 : 0.9)) continue;
        if (!finestre) continue;
        if (p === 0 && rnd() < 0.3) continue;              // piano terra: meno finestre
        dettagli.push({ tipo: 'finestra', u: c[0] + s[0] * t + n[0] * 0.04, v: c[1] + s[1] * t + n[1] * 0.04,
          y: pavimento + p * PIANO + (p === 0 ? 1.4 : 1.6), fu: n[0], fv: n[1] });
      }
    }
    if (porta) {
      dettagli.push({ tipo: bottega ? 'portone' : 'porta', u: c[0] + n[0] * 0.05, v: c[1] + n[1] * 0.05, y: pavimento, fu: n[0], fv: n[1] });
    }
  }

  /**
   * Una casa (o il corpo di un edificio): zoccolo di pietra fino al terreno più basso, pareti, tetto, finestre.
   * c: centro; f: fronte (verso la via); largo lungo la via, fondo di traverso; quota: pavimento dato (rocca).
   */
  function corpo({ c, f, largo, fondo, piani, intonaco, quota = null, porta = true, bottega = false, comignolo = true, finestre = true, retro = true }) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2;
    const { mn, mx } = quote(c, s, f, a, b);
    const pavimento = (quota ?? mx) + 0.15;
    const R = rett(c, s, f, a, b);
    parti.pietra.push(prisma(q4(R), q4(R), Math.min(mn, pavimento) - 0.6, pavimento + 0.5));   // zoccolo
    const H = piani * PIANO, gronda = pavimento + H;
    // Pareti un po' fuori squadra (richiesta dell'utente: niente spigoli tutti lineari): ogni angolo spostato di
    // qualche cm, diverso alla base e in cima; il tetto sporge e copre la differenza.
    const storto = (RR) => RR.map(([u, v]) => [u + (rnd() - 0.5) * 2 * IRREGOLARE.fuoriSquadra, v + (rnd() - 0.5) * 2 * IRREGOLARE.fuoriSquadra]);
    (intonaco ? parti.intonaco : parti.pietra).push(prisma(q4(storto(R)), q4(storto(R)), pavimento + 0.5, gronda));
    cantonali(c, s, f, a, b, pavimento + 0.5, gronda);
    const colmo = tetto(c, s, f, a, b, gronda, intonaco ? parti.intonaco : parti.pietra);
    const fr = [c[0] + f[0] * b, c[1] + f[1] * b], rt = [c[0] - f[0] * b, c[1] - f[1] * b];
    facciata(fr, s, f, a, piani, pavimento, { porta, finestre, bottega });
    if (retro) facciata(rt, s, [-f[0], -f[1]], a, piani, pavimento, { finestre });
    if (comignolo && rnd() < 0.8) {
      const t = (rnd() - 0.5) * a, dq = -b * 0.4;
      dettagli.push({ tipo: 'comignolo', u: c[0] + s[0] * t + f[0] * dq, v: c[1] + s[1] * t + f[1] * dq,
        y: gronda + (b + dq) * FALDA - 0.3, fu: f[0], fv: f[1] });
    }
    // Sagoma per la camera e collisione.
    sagome.push(prisma(q4(R), q4(R), Math.min(mn, pavimento) - 0.5, colmo));
    scatole.push({ cu: c[0], cv: c[1], au: s[0], av: s[1], hl: a + 0.05, hw: b + 0.05 });
    return { pavimento, gronda, colmo, s, a, b };
  }

  /**
   * Cantonali: blocchi di pietra agli spigoli verticali, di misure diverse e alternati una volta lungo un lato e una
   * lungo l'altro, che sporgono di qualche cm (lo spigolo si legge dentellato, come nelle murature vere). Dettagli a
   * istanze: da lontano spariscono con le finestre.
   */
  function cantonali(c, s, f, a, b, y0, y1) {
    const I = IRREGOLARE;
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      let y = y0, k = rnd() < 0.5 ? 0 : 1;
      while (y < y1 - 0.15) {
        const h = Math.min(y1 - y, I.alto[0] + rnd() * (I.alto[1] - I.alto[0]));
        const L = I.lungo[0] + rnd() * (I.lungo[1] - I.lungo[0]), D = I.fondo[0] + rnd() * (I.fondo[1] - I.fondo[0]);
        const sp = I.sporge * (0.5 + rnd());
        const lungoS = (k++ % 2) === 0;                     // il lato lungo del blocco: lungo s o lungo f
        const ls = lungoS ? L : D, lf = lungoS ? D : L;
        const du = i * (a - ls / 2 + sp), dv = j * (b - lf / 2 + sp);
        dettagli.push({ tipo: 'cantonale', u: c[0] + s[0] * du + f[0] * dv, v: c[1] + s[1] * du + f[1] * dv, y: y + h / 2,
          fu: f[0], fv: f[1], sx: ls, sy: h - 0.03, sz: lf });
        y += h;
      }
    }
  }

  /** Casa di un tipo (TIPI_CASA), misure a caso nel tipo salvo quelle date. */
  function casa({ u, v, fu, fv, tipo = 'schiera', largo, fondo, quota = null }) {
    const T = TIPI_CASA[tipo] ?? TIPI_CASA.schiera;
    const L = largo ?? T.largo[0] + rnd() * (T.largo[1] - T.largo[0]);
    const F = fondo ?? T.fondo[0] + rnd() * (T.fondo[1] - T.fondo[0]);
    const piani = T.piani[0] + Math.floor(rnd() * (T.piani[1] - T.piani[0] + 1));
    const r = corpo({ c: [u, v], f: [fu, fv], largo: L, fondo: F, piani, intonaco: rnd() < T.intonaco, quota, bottega: tipo === 'bottega' });
    if (tipo === 'rurale' && rnd() < 0.6) {            // fienile: tettoia su pali accanto alla casa
      const lato = rnd() < 0.5 ? -1 : 1, w = 4.5, c2 = [u + r.s[0] * lato * (r.a + w / 2 + 0.2), v + r.s[1] * lato * (r.a + w / 2 + 0.2)];
      tettoia(c2, [fu, fv], w, F * 0.9, r.pavimento + 3.2);
    }
    case_++;
    return r;
  }

  /** Tettoia su quattro pali (fienile, fabbro). */
  function tettoia(c, f, largo, fondo, gronda) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2;
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const pu = c[0] + s[0] * (a - 0.2) * i + f[0] * (b - 0.2) * j, pv = c[1] + s[1] * (a - 0.2) * i + f[1] * (b - 0.2) * j;
      const R = rett([pu, pv], s, f, 0.13, 0.13);
      parti.legno.push(prisma(q4(R), q4(R), terreno(pu, pv) - 0.3, gronda));
    }
    tetto(c, s, f, a, b, gronda, parti.legno, 0.15);
    scatole.push({ cu: c[0], cv: c[1], au: s[0], av: s[1], hl: a, hw: b });
    sagome.push(prisma(q4(rett(c, s, f, a, b)), q4(rett(c, s, f, a, b)), gronda - 0.5, gronda + b * FALDA));
  }

  /** Loggia: tetto su pilastri di pietra, aperta. */
  function loggia(c, f, largo, fondo, quota) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2, { mn, mx } = quote(c, s, f, a, b);
    const pav = (quota ?? mx) + 0.15, gronda = pav + 4.2;
    const R = rett(c, s, f, a, b);
    parti.pietra.push(prisma(q4(R), q4(R), Math.min(mn, pav) - 0.6, pav));                  // pavimento rialzato
    const n = Math.max(2, Math.round(largo / 3.5));
    for (let i = 0; i <= n; i++) for (const j of [-1, 1]) {
      const t = -a + 0.4 + (2 * a - 0.8) * i / n, pu = c[0] + s[0] * t + f[0] * (b - 0.4) * j, pv = c[1] + s[1] * t + f[1] * (b - 0.4) * j;
      const Rp = rett([pu, pv], s, f, 0.3, 0.3);
      parti.pietra.push(prisma(q4(Rp), q4(Rp), pav, gronda));
      scatole.push({ cu: pu, cv: pv, au: s[0], av: s[1], hl: 0.32, hw: 0.32 });
    }
    const Rt = rett(c, s, f, a, b);                                                         // architrave
    parti.pietra.push(prisma(q4(Rt), q4(Rt), gronda - 0.5, gronda));
    const colmo = tetto(c, s, f, a, b, gronda, parti.pietra);
    sagome.push(prisma(q4(Rt), q4(Rt), gronda - 0.5, colmo));
    return { pavimento: pav };
  }

  /** Campanile (quadrato, tetto a piramide). */
  function campanile(c, lato, base, alto) {
    const h = lato / 2, R = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([i, j]) => [c[0] + i, c[1] + j]);
    parti.pietra.push(prisma(q4(R), q4(R), base, alto));
    cantonali(c, [1, 0], [0, 1], h, h, base, alto);
    const cima = P(c[0], c[1], alto + lato * 0.9), Rs = R.map(([u, v]) => P(u + Math.sign(u - c[0]) * 0.25, v + Math.sign(v - c[1]) * 0.25, alto));
    for (let k = 0; k < 4; k++) {
      const A = Rs[k], B = Rs[(k + 1) % 4];
      parti.coppi.push(esaedro([A, B, cima, cima], [A, B, cima, cima].map(([x, y, z]) => [x, y - 0.15, z])));
    }
    // Cella campanaria: aperture scure sui quattro lati.
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      dettagli.push({ tipo: 'cella', u: c[0] + nu * (h + 0.03), v: c[1] + nv * (h + 0.03), y: alto - 2.4, fu: nu, fv: nv, sx: lato * 0.45 });
    }
    sagome.push(prisma(q4(R), q4(R), base, alto + lato * 0.9));
    scatole.push({ cu: c[0], cv: c[1], au: 1, av: 0, hl: h, hw: h });
  }

  /**
   * Edificio nominato (EDIFICI). Restituisce le misure occupate (largo, fondo con gli annessi) per i lotti.
   */
  function edificio(tipo, { u, v, fu, fv, quota = null }) {
    const E = EDIFICI[tipo], f = [fu, fv], s = [-fv, fu], c = [u, v];
    let r;
    if (E.loggia) r = loggia(c, f, E.largo, E.fondo, quota);
    else r = corpo({ c, f, largo: E.largo, fondo: E.fondo, piani: E.piani, intonaco: E.intonaco, quota, bottega: tipo === 'stalla' || tipo === 'fabbro', comignolo: tipo !== 'chiesa' && tipo !== 'cappella' });
    if (E.campanile) {
      const l = E.campanile, cc = [u + s[0] * (E.largo / 2 - l / 2) + f[0] * (E.fondo / 2 - l / 2), v + s[1] * (E.largo / 2 - l / 2) + f[1] * (E.fondo / 2 - l / 2)];
      campanile(cc, l, r.gronda - 0.5, r.colmo + (tipo === 'chiesa' ? 9 : 2.2));
    }
    if (E.tettoia) tettoia([u + s[0] * (E.largo / 2 + E.tettoia / 2 + 0.2), v + s[1] * (E.largo / 2 + E.tettoia / 2 + 0.2)], f, E.tettoia, E.fondo * 0.9, r.pavimento + 3);
    if (E.recinto) {                                    // recinto di pali e due traverse, accanto alla stalla
      const w = E.recinto, cc = [u + s[0] * (E.largo / 2 + w / 2 + 0.5), v + s[1] * (E.largo / 2 + w / 2 + 0.5)], b = E.fondo / 2;
      const lati = [[[-w / 2, -b], [w / 2, -b]], [[w / 2, -b], [w / 2, b]], [[w / 2, b], [-w / 2, b]]];
      for (const [[i0, j0], [i1, j1]] of lati) {
        const A = [cc[0] + s[0] * i0 + f[0] * j0, cc[1] + s[1] * i0 + f[1] * j0], B = [cc[0] + s[0] * i1 + f[0] * j1, cc[1] + s[1] * i1 + f[1] * j1];
        const l = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(l / 2)), du = (B[0] - A[0]) / l, dv = (B[1] - A[1]) / l;
        for (let k = 0; k <= n; k++) {
          const pu = A[0] + (B[0] - A[0]) * k / n, pv = A[1] + (B[1] - A[1]) * k / n, Rp = rett([pu, pv], [du, dv], [-dv, du], 0.07, 0.07);
          parti.legno.push(prisma(q4(Rp), q4(Rp), terreno(pu, pv) - 0.3, terreno(pu, pv) + 1.3));
        }
        for (const y of [0.55, 1.1]) {
          const segs = Math.max(1, Math.round(l / 3));
          for (let k = 0; k < segs; k++) {
            const a0 = [A[0] + (B[0] - A[0]) * k / segs, A[1] + (B[1] - A[1]) * k / segs], a1 = [A[0] + (B[0] - A[0]) * (k + 1) / segs, A[1] + (B[1] - A[1]) * (k + 1) / segs];
            const m = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], Rr = rett(m, [du, dv], [-dv, du], l / segs / 2, 0.05);
            const h0 = terreno(...a0), h1 = terreno(...a1);
            parti.legno.push(prisma(q4(Rr), q4(Rr), Math.min(h0, h1) + y - 0.07, [h0 + y + 0.07, h1 + y + 0.07, h1 + y + 0.07, h0 + y + 0.07]));
          }
        }
        scatole.push({ cu: (A[0] + B[0]) / 2, cv: (A[1] + B[1]) / 2, au: du, av: dv, hl: l / 2, hw: 0.12 });
      }
    }
    if (tipo === 'taverna') {                           // insegna a bandiera sulla facciata
      const t = E.largo / 2 - 1.2, pu = u + s[0] * t + f[0] * (E.fondo / 2 + 0.7), pv = v + s[1] * t + f[1] * (E.fondo / 2 + 0.7);
      const R1 = rett([pu, pv], s, f, 0.04, 0.6), y = r.pavimento + 3.3;
      parti.legno.push(prisma(q4(R1), q4(R1), y - 0.75, y + 0.1));
      const R2 = rett([u + s[0] * t + f[0] * (E.fondo / 2 + 0.5), v + s[1] * t + f[1] * (E.fondo / 2 + 0.5)], s, f, 0.05, 0.55);
      parti.legno.push(prisma(q4(R2), q4(R2), y + 0.1, y + 0.22));
    }
    const porta = { u: u + f[0] * (E.fondo / 2 + 0.6), v: v + f[1] * (E.fondo / 2 + 0.6), fu, fv };
    edifici.push({ tipo, nome: E.nome, porta });
    const largo = E.largo + (E.recinto ? E.recinto + 1 : 0) * 2 + (E.tettoia ? E.tettoia + 0.4 : 0) * 2;
    return { largo, fondo: E.fondo };
  }

  /** Pozzo: vera di pietra, due pilastrini, trave e tettuccio. */
  function pozzo(u, v, quota = null) {
    const h0 = quota ?? terreno(u, v);
    const vera = new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12);
    vera.translate(X(u, v), h0 + 0.5, Z(u, v));
    parti.pietra.push(vera);
    for (const i of [-1, 1]) {
      const R = rett([u + i * 0.95, v], [1, 0], [0, 1], 0.12, 0.12);
      parti.legno.push(prisma(q4(R), q4(R), h0 + 0.9, h0 + 2.6));
    }
    const Rt = rett([u, v], [1, 0], [0, 1], 1.15, 0.08);
    parti.legno.push(prisma(q4(Rt), q4(Rt), h0 + 2.4, h0 + 2.55));
    scatole.push({ cu: u, cv: v, au: 1, av: 0, hl: 1.25, hw: 1.25 });
    edifici.push({ tipo: 'pozzo', nome: 'Pozzo', porta: { u: u, v: v + 1.6, fu: 0, fv: 1 } });
  }

  /** Banco del mercato: tavolo e tendone. */
  function banco(u, v, fu, fv) {
    const f = [fu, fv], s = [-fv, fu], h0 = terreno(u, v), R = rett([u, v], s, f, 1.1, 0.5);
    parti.legno.push(prisma(q4(R), q4(R), h0 - 0.2, h0 + 0.9));
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const Rp = rett([u + s[0] * 1.05 * i + f[0] * 0.55 * j, v + s[1] * 1.05 * i + f[1] * 0.55 * j], s, f, 0.05, 0.05);
      parti.legno.push(prisma(q4(Rp), q4(Rp), h0, h0 + 2.2));
    }
    const Rt = rett([u + f[0] * 0.15, v + f[1] * 0.15], s, f, 1.25, 0.85);
    parti.intonaco.push(prisma(q4(Rt), q4(Rt), h0 + 2.15, [h0 + 2.3, h0 + 2.3, h0 + 2.05, h0 + 2.05]));
    scatole.push({ cu: u, cv: v, au: s[0], av: s[1], hl: 1.15, hw: 0.6 });
  }

  /** Chiude il kit: oggetti da disegnare, collisioni, sagome per la camera, misure. */
  function chiudi() {
    const object = new THREE.Group();
    object.name = nome;
    const solidi = [];
    for (const [k, lista] of Object.entries(parti)) {
      const geo = unisci(lista);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat[k]);
      m.name = `${nome}-${k}`;
      object.add(m);
    }
    {
      const geo = unisci(sagome);                         // invisibile: solo per il raycast della camera
      if (geo) {
        const m = new THREE.Mesh(geo, mat.finestra);
        m.visible = false;
        m.name = `${nome}-sagome`;
        object.add(m);
        solidi.push(m);
      }
    }
    // Dettagli a istanze, per zone, spenti da lontano.
    const geoD = {
      finestra: (() => { const g = new THREE.BoxGeometry(0.85, 1.15, 0.14); return g; })(),
      porta: (() => { const g = new THREE.BoxGeometry(1.2, 2.2, 0.16); g.translate(0, 1.1, 0); return g; })(),
      portone: (() => { const g = new THREE.BoxGeometry(2.6, 2.6, 0.16); g.translate(0, 1.3, 0); return g; })(),
      comignolo: (() => { const g = new THREE.BoxGeometry(0.6, 1.4, 0.6); g.translate(0, 0.7, 0); return rifinisci(g, false); })(),
      cella: (() => { const g = new THREE.BoxGeometry(1, 1.6, 0.1); return g; })(),
      cantonale: rifinisci(new THREE.BoxGeometry(1, 1, 1), false),
    };
    const matD = { finestra: mat.finestra, porta: mat.legno, portone: mat.legno, comignolo: mat.pietra, cella: mat.finestra, cantonale: mat.pietra };
    // Zone: al più 2 × 2 qualunque sia la grandezza (le chiamate restano ≤ 4 × tipi di dettaglio), di lato almeno
    // DETTAGLIO.zona m.
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const d of dettagli) { u0 = Math.min(u0, d.u); u1 = Math.max(u1, d.u); v0 = Math.min(v0, d.v); v1 = Math.max(v1, d.v); }
    const lato = Math.max(DETTAGLIO.zona, (u1 - u0) / 2 + 0.01, (v1 - v0) / 2 + 0.01);
    const zone = new Map();
    for (const d of dettagli) {
      const k = `${Math.floor((d.u - u0) / lato)},${Math.floor((d.v - v0) / lato)}`;
      if (!zone.has(k)) zone.set(k, []);
      zone.get(k).push(d);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    let istanze = 0;
    for (const lista of zone.values()) {
      let cu = 0, cv = 0, cy = 0;
      for (const d of lista) { cu += d.u / lista.length; cv += d.v / lista.length; cy += d.y / lista.length; }
      const lod = new THREE.LOD();
      lod.position.set(X(cu, cv), cy, Z(cu, cv));
      const g = new THREE.Group();
      for (const tipo of Object.keys(geoD)) {
        const L = lista.filter((d) => d.tipo === tipo);
        if (!L.length) continue;
        const im = new THREE.InstancedMesh(geoD[tipo], matD[tipo], L.length);
        L.forEach((d, i) => {
          const nx = ux * d.fu - uz * d.fv, nz = uz * d.fu + ux * d.fv;
          q.setFromAxisAngle(yAx, Math.atan2(nx, nz));
          sc.set(d.sx ?? 1, d.sy ?? 1, d.sz ?? 1);
          im.setMatrixAt(i, m4.compose(p3.set(X(d.u, d.v) - lod.position.x, d.y - cy, Z(d.u, d.v) - lod.position.z), q, sc));
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.name = `${nome}-${tipo}`;
        g.add(im);
        istanze += L.length;
      }
      lod.addLevel(g, 0);
      lod.addLevel(new THREE.Object3D(), DETTAGLIO.lontano);
      object.add(lod);
    }
    object.updateMatrixWorld(true);
    let triangoli = 0, chiamate = 0;
    object.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      chiamate++;
      triangoli += (m.isInstancedMesh ? m.count : 1) * (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    });
    return { object, solidi, scatole, edifici, misure: { case: case_, edifici: edifici.length, istanze, zone: zone.size, chiamate, triangoli } };
  }

  return { casa, edificio, pozzo, banco, loggia, corpo, chiudi, rnd, rett };
}

// ─── Lotti ────────────────────────────────────────────────────────────────

/** true se due rettangoli orientati ({ c, s, f, a, b }) si sovrappongono (assi separatori), con margine. */
export function siToccano(A, B, margine = 0) {
  const assi = [A.s, A.f, B.s, B.f];
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
  for (const ax of assi) {
    const proA = A.a * Math.abs(A.s[0] * ax[0] + A.s[1] * ax[1]) + A.b * Math.abs(A.f[0] * ax[0] + A.f[1] * ax[1]);
    const proB = B.a * Math.abs(B.s[0] * ax[0] + B.s[1] * ax[1]) + B.b * Math.abs(B.f[0] * ax[0] + B.f[1] * ax[1]);
    if (Math.abs(d[0] * ax[0] + d[1] * ax[1]) > proA + proB + margine) return false;
  }
  return true;
}

/**
 * Case di campagna (siti da js/mondo/vegetazione.js, caseCampagna / posizionaVegetazione().case, coordinate del mondo)
 * nel blocco centrato in (cx, cz). Interfaccia come rocca e borgo per le collisioni e la camera.
 */
export function creaCaseCampagna(suolo, siti, cx, cz, seme = 7) {
  const kit = creaKit({ X: (u) => u, Z: (u, v) => v, terreno: (u, v) => suolo.getHeight(u, v), seme, nome: 'campagna' });
  for (const k of siti) {
    const fu = Math.cos(k.verso), fv = Math.sin(k.verso);
    kit.casa({ u: k.x - cx, v: k.z - cz, fu, fv, tipo: kit.rnd() < 0.75 ? 'rurale' : 'bassa' });
  }
  const r = kit.chiudi();
  const spingiOggetti = r.scatole;
  // Collisioni: le stesse scatole orientate di rocca e borgo, con una griglia di 32 m per cercare solo le vicine.
  const griglia = new Map(), G = 32;
  spingiOggetti.forEach((s, i) => {
    const e = Math.max(s.hl, s.hw) + 1;
    for (let a = Math.floor((s.cu - e) / G); a <= Math.floor((s.cu + e) / G); a++) {
      for (let b = Math.floor((s.cv - e) / G); b <= Math.floor((s.cv + e) / G); b++) {
        const k = a * 100003 + b;
        if (!griglia.has(k)) griglia.set(k, []);
        griglia.get(k).push(i);
      }
    }
  });
  function spingiFuori(x, z, raggio) {
    const L = griglia.get(Math.floor(x / G) * 100003 + Math.floor(z / G));
    if (!L) return null;
    let u = x, v = z;
    for (let it = 0; it < 4; it++) {
      let mosso = false;
      for (const i of L) {
        const s = spingiOggetti[i], du = u - s.cu, dv = v - s.cv;
        const a = du * s.au + dv * s.av, b = -du * s.av + dv * s.au;
        const qa = clamp(a, -s.hl, s.hl), qb = clamp(b, -s.hw, s.hw), ea = a - qa, eb = b - qb, d2 = ea * ea + eb * eb;
        if (d2 >= raggio * raggio) continue;
        let na = a, nb = b;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); na = qa + ea / d * raggio; nb = qb + eb / d * raggio; } else {
          const vie = [a + s.hl, s.hl - a, b + s.hw, s.hw - b], m = vie.indexOf(Math.min(...vie));
          if (m === 0) na = -s.hl - raggio; else if (m === 1) na = s.hl + raggio; else if (m === 2) nb = -s.hw - raggio; else nb = s.hw + raggio;
        }
        u = s.cu + na * s.au - nb * s.av; v = s.cv + na * s.av + nb * s.au;
        mosso = true;
      }
      if (!mosso) break;
    }
    return { x: u, z: v };
  }
  return { tipo: 'campagna', object: r.object, solidi: r.solidi, spingiFuori, quotaSuolo: () => null, dentro: () => false,
    aggiornaLuci() {}, misure: r.misure, edifici: r.edifici };
}
