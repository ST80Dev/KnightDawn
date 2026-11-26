// Knight Dawn — borgo murato (M7, passo 4). Senza edifici: cinta irregolare con torri quadrate e torre-porta sul lato
// col minor dislivello, rete di strade interne di ciottolato.
//
// Il borgo sta in **pendio** (decisione dell'utente: niente terrazze piatte con muri di sostegno né scalinata
// centrale, «troppo moderno», «sembra l'interno di un palazzo»): il terreno dentro le mura è quello naturale
// lisciato (`luogo.piani[1].griglia`, js/mondo/luoghi.js; il primo piano è la rocca, in piano). Le mura seguono il
// pendio a gradoni brevi; le strade (via principale dalla porta alla rampa della rocca, a tornanti se il pendio è
// ripido; via lungo le mura; vicoli lungo le curve di livello) girano per tutto il borgo e ne fanno gli isolati
// dove andranno le case (passo 5).
//
// Contorno (js/mondo/luoghi.js, `piani[1].poligono`): dai due vertici anteriori della rocca gira dall'altra parte con
// una catena irregolare (i primi `nCatena` punti); il resto del contorno sono i lati anteriori della rocca, le cui mura
// chiudono anche il borgo. Coordinate locali: u lungo il verso (dalla rocca verso il borgo), v di traverso. Le geometrie si costruiscono in coordinate del blocco e si uniscono per materiale
// (docs/PRESTAZIONI.md, passo 6: ≤ 8 materiali, ripetuti in InstancedMesh, dettaglio in una texture generata una
// volta): pochi oggetti da disegnare qualunque sia la grandezza del borgo.
// Interfaccia come la rocca (rocca3d.js): object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci.

import * as THREE from 'three';
import { prisma, unisci, dentroPoligono, distanzaContorno, areaPoligono, normaleLato, localeDelLuogo, creaSpinta,
  scatolaLato, geoTorrePorta, geoGhiera, materialeMuro, rifinisci, tonoDelLuogo } from './rocca3d.js';
import { creaKit, siToccano, EDIFICI, PEZZO_MS, completaPezzi } from './edifici3d.js';
import { RAMPA_PORTA } from '../mondo/luoghi.js';

/** Misure secondo la classe del luogo. vicoli: quanti vicoli trasversali. */
export const CLASSI_BORGO = {
  minore:   { altezza: 6, spessore: 1.4, torre: 4.2, passoTorri: 32, vicoli: 1,
    case: 14, edifici: ['stalla', 'taverna', 'fabbro'], piazza: 0, torriCasa: 0 },
  casata:   { altezza: 7, spessore: 1.6, torre: 5, passoTorri: 35, vicoli: 2,
    case: 30, edifici: ['stalla', 'taverna', 'fabbro', 'guaritore'], piazza: 11, loggia: 'loggia', banchi: 4, torriCasa: 0.15 },
  maggiore: { altezza: 8, spessore: 1.8, torre: 5.6, passoTorri: 38, vicoli: 3,
    case: 60, edifici: ['stalla', 'taverna', 'fabbro', 'guaritore'], piazza: 15, loggia: 'loggiaGrande', chiesa: true, banchi: 7, torriCasa: 0.25 },
};
// Case e edifici (passo 5, edifici3d.js): `case` al più per classe (8–14, 20–30, 40–60: dove c'è posto), edifici
// nominati lungo la via principale dalla porta, piazza del mercato (raggio m) a metà della via con banchi e loggia,
// chiesa nella sede maggiore; torriCasa: quota di case-torre nella metà del borgo verso la rocca.

const PORTA = { larghezza: 3.6, imposta: 3.0, torreLarghezza: 8, torreProfondita: 6, sporgenza: 1, sopraMura: 3.5 };
// RAMPA_PORTA (fuori dalla porta, fino al terreno; anche la rampa lungo il muro) viene da js/mondo/luoghi.js.
const TRATTO = 6;                          // m: lunghezza dei gradoni delle mura sul pendio
const SCARPA = 0.15;                       // inclinazione della scarpa alla base delle mura (tangente)
// Strade interne: larghezza (m), quota sopra il terreno (m; diverse, così agli incroci non sfarfallano).
const STRADE = {
  via: { larghezza: 4.2, sopra: 0.14 },
  mura: { larghezza: 3.0, sopra: 0.12, rientro: 10 },   // via lungo le mura, a `rientro` m dalla cinta
  vicolo: { larghezza: 2.6, sopra: 0.13 },
  pendenzaVia: 0.1,                        // oltre, la via principale sale a tornanti
  passo: 2,                                // m tra le sezioni del nastro
  tessera: 3.2,                            // m: lato della texture del selciato (512 px)
};

// Pietra grigio-bruna come la rocca, un poco più calda (pietra più comune, meno squadrata).
const COL = { mattone: '#aaa090', scuro: '#8f8578', pietra: '#c4bcab', legno: '#5b3b20' };
const LUCE_RIFLESSA = 0.2;                 // come la rocca: i lati in ombra non escono neri

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ─── Ciottolato: texture generata una volta (docs/PRESTAZIONI.md: dettaglio in texture, non in geometria) ───
let _ciottolato = null;
function texturaCiottolato() {
  // Sanpietrini grossi e irregolari (richiesta dell'utente: niente «mosaico»): 512 px = STRADE.tessera m, pietre di
  // ~15–25 cm in file approssimative di traverso alla strada, consumate, coi bordi storti; terra bruna tra le pietre,
  // qualche pietra mancante (resta la terra), erba nelle fughe, polvere e fango a chiazze larghe.
  if (_ciottolato) return _ciottolato;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const lim = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  g.fillStyle = 'rgb(112,96,76)';                          // terra tra le pietre
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 4000; k++) {                          // grana della terra
    const v = 80 + Math.floor(rnd() * 70);
    g.fillStyle = `rgba(${v + 20},${v + 8},${v - 10},0.5)`;
    g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const pietra = (x, y, w, h) => {
    const v = 120 + Math.floor(rnd() * 80), cal = Math.floor(rnd() * 16) - 4;
    const pts = [];
    for (let k = 0; k < 7; k++) {                           // contorno storto, angoli smussati
      const a = k / 7 * Math.PI * 2 + rnd() * 0.5;
      const rx = w / 2 * (0.78 + rnd() * 0.22), ry = h / 2 * (0.78 + rnd() * 0.22);
      const cs = Math.cos(a), sn = Math.sin(a), q = Math.pow(Math.abs(cs) ** 3 + Math.abs(sn) ** 3, -1 / 3);   // quasi quadrata
      pts.push([x + cs * rx * q, y + sn * ry * q]);
    }
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      if (x + dx < -60 || x + dx > N + 60 || y + dy < -60 || y + dy > N + 60) continue;
      const gr = g.createLinearGradient(x + dx, y + dy - h / 2, x + dx, y + dy + h / 2);
      gr.addColorStop(0, `rgb(${lim(v + 22 + cal)},${lim(v + 18)},${lim(v + 10)})`);
      gr.addColorStop(1, `rgb(${lim(v - 30 + cal)},${lim(v - 34)},${lim(v - 40)})`);
      g.fillStyle = gr;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 1.5; g.stroke();
    }
  };
  for (let y = 0; y < N;) {
    const h = 26 + Math.floor(rnd() * 14);
    let x = -Math.floor(rnd() * 30);
    while (x < N) {
      const w = 26 + Math.floor(rnd() * 22);
      if (rnd() > 0.08) pietra(x + w / 2 + (rnd() - 0.5) * 4, y + h / 2 + (rnd() - 0.5) * 5, w - 4, h - 4);   // l'8 % manca
      x += w;
    }
    y += h;
  }
  for (let k = 0; k < 120; k++) {                           // erba nelle fughe
    const x = rnd() * N, y = rnd() * N;
    g.strokeStyle = `rgba(${70 + rnd() * 30},${95 + rnd() * 30},${40 + rnd() * 20},0.7)`;
    g.lineWidth = 1;
    for (let f = 0; f < 4; f++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y - 3 - rnd() * 6); g.stroke(); }
  }
  for (let k = 0; k < 28; k++) {                            // polvere e fango a chiazze larghe
    const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 90, fango = rnd() < 0.3;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, fango ? `rgba(70,55,40,${0.25 + rnd() * 0.2})` : `rgba(165,145,115,${0.3 + rnd() * 0.25})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
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

/** Versione sincrona: costruisce il borgo in un colpo (stesso risultato di createBorgoAPezzi). */
export function createBorgo(suolo, luogo, ox, oz, rocca, clima = 'temperato') {
  return completaPezzi(createBorgoAPezzi(suolo, luogo, ox, oz, rocca, clima));
}

/**
 * Costruisce il borgo murato di un luogo.
 * @param {{getHeight:(x:number, z:number) => number}} suolo  quota del terreno in coordinate del blocco
 * @param {object} luogo  da carta.luoghi (piani con `poligono`, porta, verso, classe)
 * @param {number} ox  centro del sito (rocca) in coordinate del blocco
 * @param {number} oz
 * @param {{ piede:number[], poligono:number[][] }} rocca  la rocca (rocca3d.js): piede della sua rampa, contorno (locali)
 */
export function* createBorgoAPezzi(suolo, luogo, ox, oz, rocca, clima = 'temperato') {
  const K = CLASSI_BORGO[luogo.classe] ?? CLASSI_BORGO.casata;
  const ux = luogo.verso.x, uz = luogo.verso.z;
  const B = luogo.piani[1];
  const SP = K.spessore, H = K.altezza;
  const fase = (luogo.id + 1) * 1.7 + luogo.x * 1e-3;      // varia le curve da un borgo all'altro
  // Locale (u, v) → blocco (x, z) e quota del terreno.
  const X = (u, v) => ox + ux * u - uz * v, Z = (u, v) => oz + uz * u + ux * v;
  const xz = (u, v) => [X(u, v), Z(u, v)];
  const terreno = (u, v) => suolo.getHeight(X(u, v), Z(u, v));
  const inLocale = (x, z) => { const dx = x - ox, dz = z - oz; return [dx * ux + dz * uz, -dx * uz + dz * ux]; };
  const BL = localeDelLuogo(luogo, B.poligono);
  const nC = B.nCatena ?? BL.length;
  const verso = areaPoligono(BL);
  const q4 = (pp) => pp.map(([u, v]) => xz(u, v));
  /** Quota minima del terreno lungo un segmento locale (campioni ogni ~1,5 m), anche spostato di (fu, fv). */
  function minimoLungo(a, b, fu = 0, fv = 0) {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
    let mn = Infinity;
    for (let i = 0; i <= n; i++) {
      const u = a[0] + (b[0] - a[0]) * i / n, v = a[1] + (b[1] - a[1]) * i / n;
      mn = Math.min(mn, terreno(u, v), terreno(u + fu, v + fv));
    }
    return mn;
  }

  const mat = {};
  for (const [k, c] of Object.entries(COL)) {
    mat[k] = k === 'legno' ? new THREE.MeshLambertMaterial({ color: c, flatShading: true }) : materialeMuro(tonoDelLuogo(luogo, c), LUCE_RIFLESSA);
    if (k === 'legno') mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.strada = new THREE.MeshLambertMaterial({ map: texturaCiottolato(), color: '#ffffff' });
  mat.strada.polygonOffset = true;
  mat.strada.polygonOffsetFactor = -2;
  mat.strada.polygonOffsetUnits = -2;
  const parti = { mattone: [], scuro: [], pietra: [], legno: [] };
  const scatole = [];                              // collisioni in locale (rocca3d.js, creaSpinta)

  yield;
  // ─── Porta: sul lato della catena più vicino al punto scelto dal generatore ───
  const [pu, pv] = luogo.porta ? localeDelLuogo(luogo, [[luogo.porta.x, luogo.porta.z]])[0] : BL[1];
  let latoPorta = 1, dP = Infinity;
  for (let i = 0; i + 1 < nC; i++) {
    const a = BL[i], b = BL[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = clamp(((pu - a[0]) * (b[0] - a[0]) + (pv - a[1]) * (b[1] - a[1])) / (l * l), 0, 1);
    const d = Math.hypot(a[0] + (b[0] - a[0]) * t - pu, a[1] + (b[1] - a[1]) * t - pv);
    if (d < dP) { dP = d; latoPorta = i; }
  }
  const gA = BL[latoPorta], gB = BL[latoPorta + 1], gL = Math.hypot(gB[0] - gA[0], gB[1] - gA[1]);
  const ge = [(gB[0] - gA[0]) / gL, (gB[1] - gA[1]) / gL], gn = normaleLato(gA, gB, verso);
  const gw = PORTA.torreLarghezza, pw = PORTA.larghezza, SPOR = PORTA.sporgenza, prof = PORTA.torreProfondita;
  // Centro della porta: il punto del generatore, tenuto lontano dagli estremi del lato.
  const tP = clamp(((pu - gA[0]) * ge[0] + (pv - gA[1]) * ge[1]), Math.min(gL / 2, gw / 2 + 3), Math.max(gL / 2, gL - gw / 2 - 3));
  const gm = [gA[0] + ge[0] * tP, gA[1] + ge[1] * tP];
  const loc = (e, d) => [gm[0] + ge[0] * e + gn[0] * d, gm[1] + ge[1] * e + gn[1] * d];

  yield;
  // ─── Cinta, a gradoni sul pendio ───
  // Ogni lato della catena in tratti di ~TRATTO m: base sotto il terreno esterno, cima H sopra il terreno interno più
  // alto del tratto; scarpa all'esterno. n = normale esterna; il muro sta tra il bordo e SP verso l'interno.
  const merli = [];                               // { u, v, y, nu, nv }
  function lato(A0, B0, n) {
    const [nu, nv] = n;
    const len = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
    const k = Math.max(1, Math.round(len / TRATTO));
    for (let j = 0; j < k; j++) {
      const a = [A0[0] + (B0[0] - A0[0]) * j / k, A0[1] + (B0[1] - A0[1]) * j / k];
      const b = [A0[0] + (B0[0] - A0[0]) * (j + 1) / k, A0[1] + (B0[1] - A0[1]) * (j + 1) / k];
      const dentroA = [a[0] - nu * (SP + 1), a[1] - nv * (SP + 1)], dentroB = [b[0] - nu * (SP + 1), b[1] - nv * (SP + 1)];
      const qDentro = Math.max(terreno(...dentroA), terreno(...dentroB), terreno((dentroA[0] + dentroB[0]) / 2, (dentroA[1] + dentroB[1]) / 2));
      const i0 = [a[0] - nu * SP, a[1] - nv * SP], i1 = [b[0] - nu * SP, b[1] - nv * SP];   // filo interno
      const base = minimoLungo(a, b, nu * 2, nv * 2) - 1;
      const cima = qDentro + H;
      // Il tratto si allunga di 0,05 m per lato: i gradoni non lasciano fessure.
      const l = Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
      const eu = (b[0] - a[0]) / l * 0.05, ev = (b[1] - a[1]) / l * 0.05;
      const P = [[i0[0] - eu, i0[1] - ev], [i1[0] + eu, i1[1] + ev], [b[0] + eu, b[1] + ev], [a[0] - eu, a[1] - ev]];
      parti.mattone.push(prisma(q4(P), q4(P), base, cima));
      const yS = Math.max(base + 0.5, qDentro + 1.5), off = (yS - base) * SCARPA;
      const Ps = [P[0], P[1], [P[2][0] + nu * off, P[2][1] + nv * off], [P[3][0] + nu * off, P[3][1] + nv * off]];
      parti.scuro.push(prisma(q4(Ps), q4(P), base, yS));
      const terra = Math.min(terreno(a[0] + nu, a[1] + nv), terreno(b[0] + nu, b[1] + nv));
      scatole.push(scatolaLato(a, b, n, -SP, Math.max(0.2, (yS - terra) * SCARPA)));
      const m = Math.max(1, Math.floor(l / 1.9));
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        merli.push({ u: a[0] + (b[0] - a[0]) * t - nu * 0.3, v: a[1] + (b[1] - a[1]) * t - nv * 0.3, y: cima, nu, nv });
      }
    }
  }
  for (let i = 0; i + 1 < nC; i++) {
    const a = BL[i], b = BL[i + 1], n = normaleLato(a, b, verso);
    if (i === latoPorta) {
      lato(a, loc(-gw / 2, 0), n);
      lato(loc(gw / 2, 0), b, n);
    } else lato(a, b, n);
  }

  yield;
  // ─── Torri quadrate: sui vertici della catena (non quelli della rocca) e lungo i lati ogni ~passoTorri ───
  const lt = K.torre / 2;
  const posti = [];                                // { u, v, au, av }: centro e asse
  for (let i = 0; i + 1 < nC; i++) {
    const a = BL[i], b = BL[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const au = (b[0] - a[0]) / l, av = (b[1] - a[1]) / l;
    if (i > 0) {
      const n1 = normaleLato(BL[i - 1], a, verso), n2 = normaleLato(a, b, verso);
      const bu = n1[0] + n2[0], bv = n1[1] + n2[1], bl = Math.hypot(bu, bv) || 1;
      posti.push({ u: a[0], v: a[1], au: bv / bl, av: -bu / bl });
    }
    const nt = Math.floor(l / K.passoTorri);
    for (let k = 1; k <= nt; k++) posti.push({ u: a[0] + (b[0] - a[0]) * k / (nt + 1), v: a[1] + (b[1] - a[1]) * k / (nt + 1), au, av });
  }
  let torri = 0;
  const torriFatte = [];
  for (const t of posti) {
    if (Math.hypot(t.u - gm[0], t.v - gm[1]) < gw / 2 + lt + 2) continue;          // non addosso alla porta
    torriFatte.push([t.u, t.v]);
    const { u, v, au, av } = t;
    const sq = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => [u + au * a - av * b, v + av * a + au * b]);
    let qMin = Infinity, qD = -Infinity;
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const h = terreno(u + a * (lt + 1), v + b * (lt + 1));
      qMin = Math.min(qMin, h); qD = Math.max(qD, h);
    }
    const base = qMin - 1, cima = qD + H + 2.5, e = 0.35;
    parti.mattone.push(prisma(q4(sq(lt)), q4(sq(lt)), base, cima));
    parti.mattone.push(prisma(q4(sq(lt + e)), q4(sq(lt + e)), cima - 1.2, cima));    // parapetto sporgente
    scatole.push({ cu: u, cv: v, au, av, hl: lt + e, hw: lt + e });
    for (const [n0, n1] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nu = au * n0 - av * n1, nv = av * n0 + au * n1, tu = -nv, tv = nu;
      for (const o of [-lt + 0.7, 0, lt - 0.7]) {
        merli.push({ u: u + nu * (lt + e - 0.3) + tu * o, v: v + nv * (lt + e - 0.3) + tv * o, y: cima, nu, nv });
      }
    }
    torri++;
  }

  yield;
  // ─── Torre-porta del borgo: il passaggio segue il terreno ───
  let gMin = Infinity, gMax = -Infinity;
  for (let d = SPOR - prof + 1; d <= SPOR + 1e-6; d += 0.5) {
    const h = terreno(...loc(0, d));
    gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
  }
  {
    const base = Math.min(minimoLungo(loc(-gw / 2, SPOR), loc(gw / 2, SPOR), gn[0] * 2, gn[1] * 2), gMin) - 1.5;
    const imposta = gMax + PORTA.imposta;
    const tp = { m: gm, e: ge, n: gn, gw, pw, sporgenza: SPOR, profondita: prof, base,
      cima: gMax + H + PORTA.sopraMura, soglia: gMin - 0.6, imposta };
    parti.mattone.push(geoTorrePorta(tp, X, Z));
    parti.pietra.push(...geoGhiera(tp, X, Z));
    const dIn = SPOR - prof;                              // faccia interna
    for (const s of [-1, 1]) {                            // battenti aperti, contro la faccia interna
      const a = loc(s * pw / 2, dIn), b = loc(s * pw, dIn);
      const fb = [a, b, [b[0] - gn[0] * 0.14, b[1] - gn[1] * 0.14], [a[0] - gn[0] * 0.14, a[1] - gn[1] * 0.14]];
      parti.legno.push(prisma(q4(fb), q4(fb), gMin - 0.3, imposta + 0.6));
      const c0 = s * (pw / 2 + gw / 2) / 2, cd = (SPOR + dIn) / 2;
      scatole.push({ cu: gm[0] + ge[0] * c0 + gn[0] * cd, cv: gm[1] + ge[1] * c0 + gn[1] * cd, au: ge[0], av: ge[1],
        hl: (gw / 2 - pw / 2) / 2, hw: prof / 2 + 0.15 });
    }
    const cima = gMax + H + PORTA.sopraMura;
    for (let k = 0; k < 4; k++) {
      const o = -gw / 2 + 0.6 + (gw - 1.2) * k / 3, [a1, b1] = loc(o, SPOR - 0.3), [a2, b2] = loc(o, dIn + 0.3);
      merli.push({ u: a1, v: b1, y: cima, nu: gn[0], nv: gn[1] });
      merli.push({ u: a2, v: b2, y: cima, nu: -gn[0], nv: -gn[1] });
    }
  }

  yield;
  // ─── Rampa fuori dalla porta: dal passaggio al terreno (il terrapieno a 25° scende sotto) ───
  const qSoglia = terreno(...loc(0, SPOR));
  let lungaPorta = RAMPA_PORTA.minima;
  {
    let migliore = Infinity;
    for (let l = RAMPA_PORTA.minima; l <= RAMPA_PORTA.massima; l += 0.5) {
      const g = Math.abs(qSoglia - terreno(...loc(0, SPOR + l))) / l;
      if (g < migliore) { migliore = g; lungaPorta = l; }
      if (g <= RAMPA_PORTA.pendenza) break;
    }
  }
  const quotaRampaPorta = (d, e) => qSoglia + (terreno(...loc(e, SPOR + lungaPorta)) - qSoglia) * clamp((d - SPOR) / lungaPorta, 0, 1);
  // La rampa serve solo dove il terreno davanti alla porta scende sotto la soglia: se gli resta vicino (entro
  // RAMPA_PORTA.sopra m) non c'è (prima i fianchi uscivano comunque, come due panche di pietra ai lati della strada).
  let rampaVera = false;
  {
    const w = RAMPA_PORTA.larghezza / 2, n = Math.max(2, Math.ceil(lungaPorta / 1.5));
    // Un tratto di rampa ha i fianchi su entrambi i lati se da una parte il terreno scende sotto (mai uno solo).
    // Conta il terreno sotto la rampa, non quello accanto (la strada che arriva rialzata ha le sue scarpe di terra).
    const sopraTratto = (da, db) => Math.max(...[-1, 0, 1].flatMap((se) => [
      quotaRampaPorta(da, se * w) - terreno(...loc(se * w, da)), quotaRampaPorta(db, se * w) - terreno(...loc(se * w, db))]));
    const alti = [];
    for (let i = 0; i < n; i++) alti.push(sopraTratto(SPOR + lungaPorta * i / n, SPOR + lungaPorta * (i + 1) / n) >= RAMPA_PORTA.sopra);
    rampaVera = alti.some(Boolean) && !luogo.porta?.rampaMuro;   // con la rampa lungo il muro niente rampa dritta
    for (let i = 0; i < n && rampaVera; i++) {
      // Piano della rampa: un corpo pieno in pietra fino sotto il terreno, la cima in pendenza.
      const da = SPOR + lungaPorta * i / n, db = SPOR + lungaPorta * (i + 1) / n;
      const pl = [loc(-w, da), loc(w, da), loc(w, db), loc(-w, db)];
      const ya = quotaRampaPorta(da, 0), yb2 = quotaRampaPorta(db, 0);
      const yB = Math.min(...pl.map(([u, v]) => terreno(u, v))) - 0.4;
      parti.pietra.push(prisma(q4(pl), q4(pl), Math.min(yB, ya - 0.3, yb2 - 0.3), [ya, ya, yb2, yb2]));
      if (!alti[i]) continue;
      for (const se of [-1, 1]) {                         // fianchi in muratura fino sotto il terreno
        const e0 = se * w, e1 = se * (w + 0.5);
        // Cima in pendenza con la rampa (niente gradini).
        const ya = quotaRampaPorta(da, e0) + 0.3, yb = quotaRampaPorta(db, e0) + 0.3;
        const yBase = Math.min(terreno(...loc(e0, da)), terreno(...loc(e0, db)), terreno(...loc(e1, da)), terreno(...loc(e1, db))) - 0.5;
        const pp = [loc(e0, da), loc(e1, da), loc(e1, db), loc(e0, db)];
        parti.pietra.push(prisma(q4(pp), q4(pp), yBase, [ya, ya, yb, yb]));
      }
    }
  }

  // ─── Rampa d'accesso lungo il muro (luoghi.js, piani di tipo 'rampa'): pianerottolo, tratti, tornante ───
  // Il terreno la segue già (è un piano del terrapieno); qui il lastricato, i parapetti sul lato esterno e il suolo.
  const rampeMuro = [];                            // { tipo, c, au, av, A, B, q0, q1 } locali
  const accesso = [];                              // dall'arrivo alla porta (locali): per le prove e la vista
  if (luogo.porta?.rampaMuro) {
    const lux = luogo.verso.x, luz = luogo.verso.z;
    for (const p of luogo.piani) {
      if (p.tipo !== 'rampa') continue;
      const [c] = localeDelLuogo(luogo, [[p.cx, p.cz]]);
      const au = p.ux * lux + p.uz * luz, av = -p.ux * luz + p.uz * lux;
      const q0 = p.griglia ? p.griglia.h[0] : p.q, q1 = p.griglia ? p.griglia.h[1] : p.q;
      rampeMuro.push({ parte: p.parte, c, au, av, A: p.a, B: p.parte === 'tratto' ? p.b - 0.5 : p.b, q0, q1 });
    }
    const tratti = rampeMuro.filter((r) => r.parte === 'tratto');
    if (tratti.length) tratti.reduce((m2, r) => (r.q1 < m2.q1 ? r : m2)).ultimo = true;
    const punto = (r, a, b) => [r.c[0] + r.au * a - r.av * b, r.c[1] + r.av * a + r.au * b];
    const quotaIn = (r, a) => r.q0 + (r.q1 - r.q0) * clamp((a + r.A) / (2 * r.A), 0, 1);
    const parapetto = (r, a0, b0, a1, b1) => {
      const P0 = punto(r, a0, b0), P1 = punto(r, a1, b1), l = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
      if (l < 0.3) return;
      const tu = (P1[0] - P0[0]) / l, tv = (P1[1] - P0[1]) / l, h = 0.22;
      const pp = [[P0[0] - tv * h, P0[1] + tu * h], [P1[0] - tv * h, P1[1] + tu * h], [P1[0] + tv * h, P1[1] - tu * h], [P0[0] + tv * h, P0[1] - tu * h]];
      const y0 = quotaIn(r, a0), y1 = quotaIn(r, a1);
      const yb = Math.min(terreno(...P0), terreno(...P1), y0, y1) - 0.6;
      parti.pietra.push(prisma(q4(pp), q4(pp), yb, [y0 + 0.95, y1 + 0.95, y1 + 0.95, y0 + 0.95]));
      scatole.push({ cu: (P0[0] + P1[0]) / 2, cv: (P0[1] + P1[1]) / 2, au: tu, av: tv, hl: l / 2, hw: h + 0.05 });
    };
    // Lato esterno di un tratto: il più lontano dalla cinta; lato chiuso del tornante: il più lontano dalla porta.
    const lontanoDalBorgo = (r, b) => { const [u, v] = punto(r, 0, b); return dentroPoligono(BL, u, v) ? -100 : distanzaContorno(BL, u, v); };
    for (const r of rampeMuro) {
      // Lastricato: lastre su tutto il rettangolo, alla quota della rampa (il terrapieno sta subito sotto).
      const cc = [punto(r, -r.A, -r.B), punto(r, r.A, -r.B), punto(r, r.A, r.B), punto(r, -r.A, r.B)];
      const yb = Math.min(r.q0, r.q1) - 0.6;
      parti.pietra.push(prisma(q4(cc), q4(cc), yb, [r.q0 + 0.06, r.q1 + 0.06, r.q1 + 0.06, r.q0 + 0.06]));
      if (r.parte === 'tratto') {
        // Parapetto sul lato lontano dal muro.
        const b = lontanoDalBorgo(r, r.B) > lontanoDalBorgo(r, -r.B) ? r.B + 0.25 : -r.B - 0.25;
        parapetto(r, -r.A, b, r.A, b);
      } else if (r.parte === 'pianerottolo') {
        // Bordo esterno (lontano dalla porta) e il lato dove non parte la rampa.
        parapetto(r, r.A, -r.B, r.A, r.B);
        const tratto0 = rampeMuro.find((x) => x.parte === 'tratto');
        const lato = tratto0 ? Math.sign((tratto0.c[0] - r.c[0]) * -r.av + (tratto0.c[1] - r.c[1]) * r.au) : 1;
        parapetto(r, -r.A + 1.2, -lato * r.B, r.A, -lato * r.B);
      }
      // Ripiano d'angolo (r.parte === 'angolo'): solo il lastricato, raccorda due tratti allo spigolo della cinta.
    }
    // Percorso d'accesso: dall'arrivo (6 m oltre) a ritroso lungo la rampa fino al pianerottolo.
    const RMW = luogo.porta.rampaMuro, ar = RMW.arrivo, [arU, arV] = localeDelLuogo(luogo, [[ar.x, ar.z]])[0];
    const dau = ar.nx * lux + ar.nz * luz, dav = -ar.nx * luz + ar.nz * lux;
    accesso.push([arU + dau * 6, arV + dav * 6]);
    accesso.push(...localeDelLuogo(luogo, RMW.percorso.slice().reverse()));
    const pian = rampeMuro.find((r) => r.parte === 'pianerottolo');
    if (pian) accesso.push(pian.c);
  }

  yield;
  // ─── Strade interne ───
  // Polilinee in (u, v). Via principale: dalla porta (fuori, sulla rampa) al piede della rampa della rocca; se il
  // pendio supera STRADE.pendenzaVia sale a tornanti. Via lungo le mura: anello a `rientro` m dalla cinta (lascia posto
  // alle case addossate alle mura). Vicoli: di traverso alla via, da un lato all'altro dell'anello. Curve morbide e un
  // leggero serpeggiare: niente righe a squadra.
  const rientro = STRADE.mura.rientro;
  const NB = BL.length;
  // Contorno rientrato: ogni vertice spostato verso l'interno lungo la bisettrice (spigolo vivo, al più 2,5 × rientro).
  const BI = BL.map((p, i) => {
    const n1 = normaleLato(BL[(i + NB - 1) % NB], p, verso), n2 = normaleLato(p, BL[(i + 1) % NB], verso);
    const su = n1[0] + n2[0], sv = n1[1] + n2[1], c = Math.hypot(su, sv) / 2;
    const k = Math.min(rientro / Math.max(c, 0.4), 2.5 * rientro) / (2 * Math.max(c, 1e-3));
    return [p[0] - su * k, p[1] - sv * k];
  });
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
  /** Quanto si può andare da `c` lungo ±p restando dentro il contorno rientrato. */
  const estensione = (c, p, s) => {
    let d = 0;
    while (d < 400 && dentroPoligono(BI, c[0] + p[0] * s * (d + 1), c[1] + p[1] * s * (d + 1))) d += 1;
    return d;
  };
  const strade = [];                               // { punti: [[u, v]...], tipo }
  {
    // Tratto dritto attraverso la porta e per qualche metro dopo: Chaikin smussa gli angoli, e con un solo punto subito
    // dentro l'arco la via curvava già nel passaggio (chi la seguiva strisciava contro il fianco della torre-porta).
    const G0 = loc(0, SPOR + Math.min(lungaPorta, 6)), Gm = loc(0, SPOR - prof / 2), G1 = loc(0, SPOR - prof - 3);
    const G2 = loc(0, SPOR - prof - 8);
    // Arrivo al piede della rampa della rocca da davanti, nel suo verso (di fianco si urterebbe pianerottolo e parapetti).
    // Prima un punto più lontano dal muro della rocca: la via non taglia sopra la rampa che corre lungo il muro.
    const piede = rocca.piede, rd = rocca.rampa?.dir ?? [0, 0], rn = rocca.porta ? [rocca.porta.nu, rocca.porta.nv] : [0, 0];
    let E = [piede[0] + rd[0] * 6, piede[1] + rd[1] * 6];
    if (!dentroPoligono(BL, E[0], E[1])) E = piede;
    const Efuori = [E[0] + rn[0] * 10, E[1] + rn[1] * 10];
    const avvio = dentroPoligono(BI, Efuori[0], Efuori[1]) ? [Efuori] : [];
    const lungo = Math.hypot(E[0] - G1[0], E[1] - G1[1]) || 1;
    const d = [(E[0] - G1[0]) / lungo, (E[1] - G1[1]) / lungo], p = [-d[1], d[0]];
    const salto = Math.abs(terreno(...G1) - terreno(...E));
    let pts;
    if (salto / lungo <= STRADE.pendenzaVia) {
      pts = [G0, Gm, G1, G2, [(G1[0] + E[0]) / 2, (G1[1] + E[1]) / 2], ...avvio, E, piede];
    } else {
      // Tornanti: n tratti da un lato all'altro, quanto lo consente il contorno, abbastanza lunghi per la pendenza.
      const serve = salto / STRADE.pendenzaVia;
      let n = 2, zig = [];
      for (; n <= 8; n++) {
        zig = [];
        let tot = 0, prec = G1;
        for (let k = 0; k < n; k++) {
          const c = [G1[0] + d[0] * lungo * (k + 0.5) / n, G1[1] + d[1] * lungo * (k + 0.5) / n];
          const s = k % 2 ? -1 : 1, A = estensione(c, p, s) * 0.8;
          const q = [c[0] + p[0] * s * A, c[1] + p[1] * s * A];
          zig.push(q);
          tot += Math.hypot(q[0] - prec[0], q[1] - prec[1]);
          prec = q;
        }
        tot += Math.hypot(E[0] - prec[0], E[1] - prec[1]);
        if (tot >= serve) break;
      }
      pts = [G0, Gm, G1, G2, ...zig, ...avvio, E, piede];
    }
    strade.push({ tipo: 'via', punti: serpeggia(ricampiona(chaikin(pts, 3), STRADE.passo), 0.7, 9, fase) });
    // Anello lungo le mura (chiuso), angoli arrotondati: lati suddivisi ogni 4 m prima di arrotondare, così Chaikin
    // smussa solo gli angoli. Si parte e si chiude a metà di un lato (l'estremo fermo di Chaikin non fa spigolo).
    const k0 = Math.max(0, Math.floor(nC / 2) - 1);
    const mezzo = [(BI[k0][0] + BI[k0 + 1][0]) / 2, (BI[k0][1] + BI[k0 + 1][1]) / 2];
    const giro = [mezzo];
    for (let k = 1; k <= NB; k++) giro.push(BI[(k0 + k) % NB]);
    giro.push(mezzo);
    strade.push({ tipo: 'mura', punti: serpeggia(ricampiona(chaikin(ricampiona(giro, 4), 2), STRADE.passo), 0.8, 11, fase + 1) });
    // Vicoli di traverso alla via, da un lato all'altro dell'anello.
    for (let k = 1; k <= K.vicoli; k++) {
      const c = [E[0] + (G1[0] - E[0]) * k / (K.vicoli + 1), E[1] + (G1[1] - E[1]) * k / (K.vicoli + 1)];
      if (!dentroPoligono(BI, c[0], c[1])) continue;
      const s0 = estensione(c, p, -1), s1 = estensione(c, p, 1);
      if (s0 + s1 < 16) continue;
      const w = Math.sin(fase + k) * 4;
      const pv = [[c[0] - p[0] * s0, c[1] - p[1] * s0], [c[0] - p[0] * s0 * 0.35 + d[0] * w, c[1] - p[1] * s0 * 0.35 + d[1] * w],
        [c[0] + p[0] * s1 * 0.4 - d[0] * w, c[1] + p[1] * s1 * 0.4 - d[1] * w], [c[0] + p[0] * s1, c[1] + p[1] * s1]];
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
          uv.push(t * S.larghezza / STRADE.tessera, lung / STRADE.tessera);
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

  yield;
  // ─── Edifici e case (passo 5) ───
  // Lotti rettangolari lungo le strade (facciata sulla via, colmo parallelo), anche col retro contro le mura nella
  // fascia lasciata dall'anello. Prima gli edifici nominati lungo la via principale dalla porta, poi la piazza, poi
  // le case finché c'è posto. Un lotto è libero se sta nel borgo, fuori dalle strade, dalle torri, dalla porta, dalla
  // rampa della rocca, dalla piazza e dagli altri lotti.
  const kit = creaKit({ X, Z, ux, uz, terreno, luogo, seme: (Math.floor(luogo.x) * 73856093) ^ (Math.floor(luogo.z) * 19349663), nome: 'borgo-edifici', clima });
  // Torce ai lati della porta del borgo (passo 7), sulla faccia esterna; una sola sorgente di luce tra le due.
  {
    const yT = terreno(...loc(0, SPOR)) + 2.7;
    for (const lato of [-1, 1]) {
      const [tu, tv] = loc(lato * (pw / 2 + 1.15), SPOR);
      kit.torcia(tu, tv, yT, gn[0], gn[1], lato < 0 ? undefined : null);
    }
  }
  yield;
  const lotti = [];
  const segmenti = [], CS = 8, gSeg = new Map();
  for (const st of strade) {
    const w = STRADE[st.tipo].larghezza / 2 + 0.3;
    for (let i = 0; i + 1 < st.punti.length; i++) {
      const a = st.punti[i], b = st.punti[i + 1], k = segmenti.length;
      segmenti.push([a, b, w]);
      for (let gu = Math.floor((Math.min(a[0], b[0]) - 3) / CS); gu <= Math.floor((Math.max(a[0], b[0]) + 3) / CS); gu++) {
        for (let gv = Math.floor((Math.min(a[1], b[1]) - 3) / CS); gv <= Math.floor((Math.max(a[1], b[1]) + 3) / CS); gv++) {
          const key = gu * 100003 + gv;
          if (!gSeg.has(key)) gSeg.set(key, []);
          gSeg.get(key).push(k);
        }
      }
    }
  }
  const suStrada = (u, v, margine = 0.4) => {
    const L = gSeg.get(Math.floor(u / CS) * 100003 + Math.floor(v / CS));
    if (!L) return false;
    for (const k of L) {
      const [a, b, w] = segmenti[k], du = b[0] - a[0], dv = b[1] - a[1], l2 = du * du + dv * dv;
      const t = l2 > 0 ? clamp(((u - a[0]) * du + (v - a[1]) * dv) / l2, 0, 1) : 0;
      if (Math.hypot(u - a[0] - du * t, v - a[1] - dv * t) < w + margine) return true;
    }
    return false;
  };
  const rp = rocca.porta, rr = rocca.rampa;
  const pianerottolo = rp ? [rp.u + rp.nu * (rp.sporgenza + 4), rp.v + rp.nv * (rp.sporgenza + 4)] : null;
  let piazza = null;
  const lontanoDa = (u, v) => {
    if (Math.hypot(u - gm[0], v - gm[1]) < prof + 5) return false;
    for (const [tu, tv] of rocca.poligono) if (Math.hypot(u - tu, v - tv) < (rocca.torre ?? 3.6) + 3) return false;
    for (const [tu, tv] of torriFatte) if (Math.hypot(u - tu, v - tv) < lt + 1.5) return false;
    if (pianerottolo && Math.hypot(u - pianerottolo[0], v - pianerottolo[1]) < 7) return false;
    if (rr) {
      const a = rr.inizio, b = [rocca.piede[0], rocca.piede[1]], du = b[0] - a[0], dv = b[1] - a[1], l2 = du * du + dv * dv;
      const t = l2 > 0 ? clamp(((u - a[0]) * du + (v - a[1]) * dv) / l2, 0, 1) : 0;
      if (Math.hypot(u - a[0] - du * t, v - a[1] - dv * t) < 4.5) return false;
    }
    if (piazza && Math.hypot(u - piazza.c[0], v - piazza.c[1]) < piazza.r) return false;
    return true;
  };
  const libero = (L, { piazzaOk = false } = {}) => {
    const pz = piazza;
    if (piazzaOk) piazza = null;
    let ok = true;
    // Campioni ogni ~2 m su tutto il lotto (bordi compresi): una strada in curva non passa tra un campione e l'altro.
    const ni = Math.max(2, Math.ceil(2 * L.a / 2)), nj = Math.max(2, Math.ceil(2 * L.b / 2));
    for (let ii = 0; ii <= ni; ii++) {
      for (let jj = 0; jj <= nj; jj++) {
        const i = -1 + 2 * ii / ni, j = -1 + 2 * jj / nj;
        const u = L.c[0] + L.s[0] * L.a * i + L.f[0] * L.b * j, v = L.c[1] + L.s[1] * L.a * i + L.f[1] * L.b * j;
        if (!dentroPoligono(BL, u, v) || distanzaContorno(BL, u, v) < SP + 0.3 || suStrada(u, v) || !lontanoDa(u, v)) { ok = false; break; }
      }
      if (!ok) break;
    }
    piazza = pz;
    return ok && !lotti.some((A) => siToccano(A, L, -0.15));
  };
  const lotto = (c, f, largo, fondo) => ({ c, f, s: [-f[1], f[0]], a: largo / 2, b: fondo / 2 });
  /** Cammina lungo una strada su un lato e prova i lotti; `prossimo()` dà le misure (null: basta). */
  // Generatore: cede il passo (yield) quando il pezzo supera PEZZO_MS, senza cambiare l'ordine delle scelte casuali.
  function* lungo(st, lato, prossimo, posa, { da = 0, passoVuoto = 1 } = {}) {
    const P = st.punti, w = STRADE[st.tipo].larghezza / 2;
    let i = da;
    while (i < P.length - 2) {
      const spec = prossimo();
      if (!spec) return;
      const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 3)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], n = [-t[1] * lato, t[0] * lato];
      const off = w + 0.9 + spec.fondo / 2, c = [P[i][0] + t[0] * spec.largo / 2 + n[0] * off, P[i][1] + t[1] * spec.largo / 2 + n[1] * off];
      const L = lotto(c, [-n[0], -n[1]], spec.largo, spec.fondo);
      if (libero(L)) {
        lotti.push(L);
        posa(L, spec);
        i += Math.max(1, Math.ceil((spec.largo + (kit.rnd() < 0.25 ? 2 + kit.rnd() * 3 : 0)) / STRADE.passo));
        if (performance.now() - inizioPezzo > PEZZO_MS) { yield; inizioPezzo = performance.now(); }
      } else i += passoVuoto;
    }
  }
  const via = strade.find((st) => st.tipo === 'via');
  // Piazza del mercato a metà della via, dove la via è più larga di posto.
  if (K.piazza && via) {
    const P = via.punti;
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const c = P[Math.floor(P.length * f)];
      if (dentroPoligono(BL, c[0], c[1]) && distanzaContorno(BL, c[0], c[1]) > K.piazza + 4 && lontanoDa(c[0], c[1])) { piazza = { c, r: K.piazza }; break; }
    }
  }
  // Edifici nominati lungo la via principale, dalla porta.
  const daFare = [...K.edifici];
  // Lotto del prossimo edificio da posare: largo quanto l'edificio più recinto e tettoia ai lati (tutti e tre i giri:
  // prima il terzo usava la sola larghezza dell'edificio, e la tettoia del fabbro poteva finire sulla via).
  const prossimoEdificio = () => {
    if (!daFare.length) return null;
    const E = EDIFICI[daFare[0]];
    return { ...E, largo: E.largo + (E.recinto ? 2 * E.recinto + 2 : 0) + (E.tettoia ? 2 * E.tettoia + 1 : 0) };
  };
  let inizioPezzo = performance.now();
  if (via) {
    for (const lato of [1, -1]) {
      yield* lungo(via, lato, prossimoEdificio,
        (L) => { const tipo = daFare.shift(); kit.edificio(tipo, { u: L.c[0], v: L.c[1], fu: L.f[0], fv: L.f[1] }); }, { da: 3 });
    }
  }
  for (const st of strade) {                            // quelli rimasti, sulle altre strade
    if (!daFare.length) break;
    if (st === via) continue;
    for (const lato of [1, -1]) {
      yield* lungo(st, lato, prossimoEdificio,
        (L) => { const tipo = daFare.shift(); kit.edificio(tipo, { u: L.c[0], v: L.c[1], fu: L.f[0], fv: L.f[1] }); });
    }
  }
  // Piazza: loggia e chiesa sul bordo, rivolte al centro; banchi dentro, fuori dalla via.
  if (piazza) {
    const sulBordo = (tipo) => {
      const E = EDIFICI[tipo];
      for (let k = 0; k < 24; k++) {
        const ang = k / 24 * Math.PI * 2, d = [Math.cos(ang), Math.sin(ang)];
        const c = [piazza.c[0] + d[0] * (piazza.r + E.fondo / 2 - 1), piazza.c[1] + d[1] * (piazza.r + E.fondo / 2 - 1)];
        const L = lotto(c, [-d[0], -d[1]], E.largo, E.fondo);
        if (libero(L, { piazzaOk: true }) && Math.hypot(c[0] - piazza.c[0], c[1] - piazza.c[1]) >= piazza.r - 1) {
          lotti.push(L);
          kit.edificio(tipo, { u: c[0], v: c[1], fu: -d[0], fv: -d[1] });
          return true;
        }
      }
      return false;
    };
    if (K.loggia) sulBordo(K.loggia);
    if (K.chiesa && !sulBordo('chiesa')) daFare.push('chiesa');   // se sulla piazza non c'è posto, lungo le strade
    let fatti = 0;
    for (let k = 0; k < 16 && fatti < K.banchi; k++) {
      const ang = k / 16 * Math.PI * 2 + 0.2, d = [Math.cos(ang), Math.sin(ang)], rr2 = piazza.r * 0.62;
      const u = piazza.c[0] + d[0] * rr2, v = piazza.c[1] + d[1] * rr2;
      if (suStrada(u, v, 1.2) || !dentroPoligono(BL, u, v)) continue;
      const L = lotto([u, v], [-d[0], -d[1]], 2.6, 1.8);
      if (lotti.some((A) => siToccano(A, L, 0.5))) continue;
      lotti.push(L);
      kit.banco(u, v, -d[0], -d[1]);
      fatti++;
    }
  }
  for (const st of strade) {                            // la chiesa, se non è andata sulla piazza
    if (!daFare.length) break;
    for (const lato of [1, -1]) {
      yield* lungo(st, lato, prossimoEdificio,
        (L) => { const tipo = daFare.shift(); kit.edificio(tipo, { u: L.c[0], v: L.c[1], fu: L.f[0], fv: L.f[1] }); });
    }
  }
  // Case: via (botteghe e schiere), poi anello lungo le mura, poi vicoli.
  let caseFatte = 0;
  const vicinoRocca = (c) => Math.hypot(c[0], c[1]) < Math.hypot(gm[0], gm[1]) * 0.5;
  for (const st of [via, ...strade.filter((x) => x.tipo === 'mura'), ...strade.filter((x) => x.tipo === 'vicolo')]) {
    if (!st) continue;
    for (const lato of [1, -1]) {
      let tipo = 'schiera';
      yield* lungo(st, lato, () => {
        if (caseFatte >= K.case) return null;
        const r0 = kit.rnd();
        tipo = st.tipo === 'via' ? (r0 < 0.4 ? 'bottega' : 'schiera') : st.tipo === 'mura' ? (r0 < 0.55 ? 'schiera' : 'bassa') : (r0 < 0.5 ? 'bassa' : 'schiera');
        const T = { bottega: [7.5, 9], schiera: [6.5, 8.5], bassa: [6, 7], torre: [5, 5] }[tipo];
        return { largo: T[0] + kit.rnd() * 1.5, fondo: T[1] };
      }, (L, spec) => {
        const t = K.torriCasa && vicinoRocca(L.c) && kit.rnd() < K.torriCasa ? 'torre' : tipo;
        kit.casa({ u: L.c[0], v: L.c[1], fu: L.f[0], fv: L.f[1], tipo: t, largo: t === 'torre' ? Math.min(spec.largo, 5.5) : spec.largo, fondo: t === 'torre' ? Math.min(spec.fondo, 5.5) : spec.fondo });
        caseFatte++;
      });
    }
  }
  yield;
  const edificiBorgo = yield* kit.chiudiAPezzi();
  yield;
  scatole.push(...edificiBorgo.scatole);

  yield;
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
    const geo = rifinisci(new THREE.BoxGeometry(0.85, 1.1, 0.5), false);
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
  const triMura = object.children.reduce((t, m) => t + (m.isInstancedMesh ? m.geometry.index.count / 3 * m.count
    : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3), 0);
  const oggettiMura = object.children.length;
  object.add(edificiBorgo.object);
  solidi.push(...edificiBorgo.solidi);
  object.updateMatrixWorld(true);

  yield;
  // ─── Collisioni e suolo ───
  let U0 = Infinity, U1 = -Infinity, V0 = Infinity, V1 = -Infinity;
  for (const [u, v] of BL) { U0 = Math.min(U0, u); U1 = Math.max(U1, u); V0 = Math.min(V0, v); V1 = Math.max(V1, v); }
  const M = 8 + lungaPorta;
  const spingi = creaSpinta(scatole, []);
  function spingiFuori(x, z, raggio, yPiedi, superabile) {
    const [u, v] = inLocale(x, z);
    if (u < U0 - M - raggio || u > U1 + M + raggio || v < V0 - M - raggio || v > V1 + M + raggio) return null;
    const [u2, v2] = spingi(u, v, raggio, yPiedi, superabile);
    return { x: X(u2, v2), z: Z(u2, v2) };
  }

  /** Quota del suolo costruito: solo la rampa fuori dalla porta (dentro il borgo si cammina sul pendio). */
  function quotaSuolo(x, z) {
    const [u, v] = inLocale(x, z);
    for (const r of rampeMuro) {                   // rampa lungo il muro: la sua quota esatta
      const du = u - r.c[0], dv = v - r.c[1], a = du * r.au + dv * r.av, b = -du * r.av + dv * r.au;
      // Mai sotto il terreno: all'arrivo la griglia del blocco ammorbidisce il bordo e resterebbe un gradino.
      if (Math.abs(a) <= r.A + 0.2 && Math.abs(b) <= r.B + 0.6) {
        let q = r.q0 + (r.q1 - r.q0) * clamp((a + r.A) / (2 * r.A), 0, 1);
        const h = terreno(u, v);
        // Ultimi 3 m dell'ultimo tratto: raccordo sul terreno (la rampa arriva entro qualche decimetro, non a filo).
        if (r.ultimo && a > r.A - 3) q += (h - q) * clamp((a - (r.A - 3)) / 3, 0, 1);
        return Math.max(q, h);
      }
    }
    const du = u - gm[0], dv = v - gm[1], e = du * ge[0] + dv * ge[1], d = du * gn[0] + dv * gn[1];
    // Mai sotto il terreno (dove la rampa vi resta vicina il terreno può sporgere di poco).
    if (rampaVera && d > SPOR && d <= SPOR + lungaPorta && Math.abs(e) <= RAMPA_PORTA.larghezza / 2) return Math.max(quotaRampaPorta(d, 0), terreno(u, v));
    // Passaggio sotto la torre-porta: pavimento in pendenza uniforme dalla soglia esterna alla faccia interna (il
    // terreno lì è il bordo del terrapieno e saliva di colpo di qualche decimetro: il cavaliere si fermava sulla soglia).
    // Raccordo sul terreno, punto per punto, fino a 2,5 m oltre la faccia interna (niente gradini ai lati).
    const dFine = SPOR - prof - 2.5;
    if (d > dFine && d <= SPOR && Math.abs(e) <= pw / 2 + 0.3) {
      const qa = terreno(...loc(e, SPOR)), qb = terreno(...loc(e, dFine));
      return qa + (qb - qa) * clamp((SPOR - d) / (SPOR - dFine), 0, 1);
    }
    return null;
  }

  /** true se il punto è dentro la cinta del borgo. */
  function dentro(x, z) {
    const [u, v] = inLocale(x, z);
    return dentroPoligono(BL, u, v) && distanzaContorno(BL, u, v) > SP;
  }

  return {
    tipo: 'borgo', luogo, object, solidi, scatole, spingiFuori, quotaSuolo, dentro, inLocale,
    inBlocco: (u, v) => [X(u, v), Z(u, v)],      // locale → blocco (abitanti3d.js)
    strade,                                       // polilinee locali (u, v): per gli edifici del passo 5
    poligono: BL,
    porta: { u: gm[0], v: gm[1], nu: gn[0], nv: gn[1], rampa: rampaVera ? lungaPorta : 0 },
    accesso,                                      // rampa lungo il muro: punti locali dall'arrivo al pianerottolo ([] se non c'è)
    aggiornaLuci: edificiBorgo.aggiornaLuci,     // finestre e torce (t, buio, quota di finestre accese)
    sorgenti: edificiBorgo.sorgenti,              // per le PointLight più vicine (main.js)
    edifici: edificiBorgo.edifici,                // nominati: { tipo, nome, porta } (passo 6)
    misure: {
      strade: strade.length, torri, merli: merli.length, oggetti: oggettiMura + edificiBorgo.misure.chiamate,
      triangoli: triMura + edificiBorgo.misure.triangoli, case: edificiBorgo.misure.case,
      edifici: edificiBorgo.edifici.length, zone: edificiBorgo.misure.zone,
      porteAlte: edificiBorgo.misure.porteAlte, distacco: edificiBorgo.misure.distacco,
      porteAlteV: edificiBorgo.misure.porteAlteV, distaccoV: edificiBorgo.misure.distaccoV,
    },
  };
}
