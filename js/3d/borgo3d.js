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
  scatolaLato, geoTorrePorta, materialeMuro, rifinisci } from './rocca3d.js';

/** Misure secondo la classe del luogo. vicoli: quanti vicoli trasversali. */
export const CLASSI_BORGO = {
  minore:   { altezza: 6, spessore: 1.4, torre: 4.2, passoTorri: 32, vicoli: 1 },
  casata:   { altezza: 7, spessore: 1.6, torre: 5, passoTorri: 35, vicoli: 2 },
  maggiore: { altezza: 8, spessore: 1.8, torre: 5.6, passoTorri: 38, vicoli: 3 },
};

const PORTA = { larghezza: 3.6, imposta: 3.0, torreLarghezza: 8, torreProfondita: 6, sporgenza: 1, sopraMura: 3.5 };
const RAMPA_PORTA = { pendenza: 0.2, minima: 3, massima: 24, larghezza: 5, sopra: 0.35 };  // fuori dalla porta, fino al terreno
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
 * @param {object} luogo  da carta.luoghi (piani con `poligono`, porta, verso, classe)
 * @param {number} ox  centro del sito (rocca) in coordinate del blocco
 * @param {number} oz
 * @param {{ piede:number[], poligono:number[][] }} rocca  la rocca (rocca3d.js): piede della sua rampa, contorno (locali)
 */
export function createBorgo(suolo, luogo, ox, oz, rocca) {
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
    mat[k] = k === 'legno' ? new THREE.MeshLambertMaterial({ color: c, flatShading: true }) : materialeMuro(c, LUCE_RIFLESSA);
    if (k === 'legno') mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.strada = new THREE.MeshLambertMaterial({ map: texturaCiottolato(), color: '#ffffff' });
  mat.strada.polygonOffset = true;
  mat.strada.polygonOffsetFactor = -2;
  mat.strada.polygonOffsetUnits = -2;
  const parti = { mattone: [], scuro: [], pietra: [], legno: [] };
  const scatole = [];                              // collisioni in locale (rocca3d.js, creaSpinta)

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
  for (const t of posti) {
    if (Math.hypot(t.u - gm[0], t.v - gm[1]) < gw / 2 + lt + 2) continue;          // non addosso alla porta
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

  // ─── Torre-porta del borgo: il passaggio segue il terreno ───
  let gMin = Infinity, gMax = -Infinity;
  for (let d = SPOR - prof + 1; d <= SPOR + 1e-6; d += 0.5) {
    const h = terreno(...loc(0, d));
    gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
  }
  {
    const base = Math.min(minimoLungo(loc(-gw / 2, SPOR), loc(gw / 2, SPOR), gn[0] * 2, gn[1] * 2), gMin) - 1.5;
    const imposta = gMax + PORTA.imposta;
    parti.mattone.push(geoTorrePorta({ m: gm, e: ge, n: gn, gw, pw, sporgenza: SPOR, profondita: prof, base,
      cima: gMax + H + PORTA.sopraMura, soglia: gMin - 0.6, imposta }, X, Z));
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
    for (let i = 0; i < n; i++) {
      const da = SPOR + lungaPorta * i / n, db = SPOR + lungaPorta * (i + 1) / n;
      for (const se of [-1, 1]) {                         // fianchi in muratura fino sotto il terreno
        const e0 = se * w, e1 = se * (w + 0.5);
        const sopra = Math.max(quotaRampaPorta(da, e0) - terreno(...loc(e0, da)), quotaRampaPorta(db, e0) - terreno(...loc(e0, db)),
          quotaRampaPorta(da, e0) - terreno(...loc(e1, da)), quotaRampaPorta(db, e0) - terreno(...loc(e1, db)));
        if (sopra < RAMPA_PORTA.sopra) continue;
        rampaVera = true;
        const yTop = Math.max(quotaRampaPorta(da, e0), quotaRampaPorta(db, e0)) + 0.3;
        const yBase = Math.min(terreno(...loc(e0, da)), terreno(...loc(e0, db)), terreno(...loc(e1, da)), terreno(...loc(e1, db))) - 0.5;
        const pp = [loc(e0, da), loc(e1, da), loc(e1, db), loc(e0, db)];
        parti.pietra.push(prisma(q4(pp), q4(pp), yBase, yTop));
      }
    }
  }

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
    const G0 = loc(0, SPOR + Math.min(lungaPorta, 6)), G1 = loc(0, SPOR - prof - 3);
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
      pts = [G0, G1, [(G1[0] + E[0]) / 2, (G1[1] + E[1]) / 2], ...avvio, E, piede];
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
      pts = [G0, G1, ...zig, ...avvio, E, piede];
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
  object.updateMatrixWorld(true);

  // ─── Collisioni e suolo ───
  let U0 = Infinity, U1 = -Infinity, V0 = Infinity, V1 = -Infinity;
  for (const [u, v] of BL) { U0 = Math.min(U0, u); U1 = Math.max(U1, u); V0 = Math.min(V0, v); V1 = Math.max(V1, v); }
  const M = 8 + lungaPorta;
  const spingi = creaSpinta(scatole, []);
  function spingiFuori(x, z, raggio) {
    const [u, v] = inLocale(x, z);
    if (u < U0 - M - raggio || u > U1 + M + raggio || v < V0 - M - raggio || v > V1 + M + raggio) return null;
    const [u2, v2] = spingi(u, v, raggio);
    return { x: X(u2, v2), z: Z(u2, v2) };
  }

  /** Quota del suolo costruito: solo la rampa fuori dalla porta (dentro il borgo si cammina sul pendio). */
  function quotaSuolo(x, z) {
    const [u, v] = inLocale(x, z);
    const du = u - gm[0], dv = v - gm[1], e = du * ge[0] + dv * ge[1], d = du * gn[0] + dv * gn[1];
    if (rampaVera && d > SPOR && d <= SPOR + lungaPorta && Math.abs(e) <= RAMPA_PORTA.larghezza / 2) return quotaRampaPorta(d, e);
    return null;
  }

  /** true se il punto è dentro la cinta del borgo. */
  function dentro(x, z) {
    const [u, v] = inLocale(x, z);
    return dentroPoligono(BL, u, v) && distanzaContorno(BL, u, v) > SP;
  }

  return {
    tipo: 'borgo', luogo, object, solidi, scatole, spingiFuori, quotaSuolo, dentro, inLocale,
    strade,                                       // polilinee locali (u, v): per gli edifici del passo 5
    poligono: BL,
    porta: { u: gm[0], v: gm[1], nu: gn[0], nv: gn[1], rampa: rampaVera ? lungaPorta : 0 },
    aggiornaLuci() {},                            // luci del borgo: passo 7
    misure: {
      strade: strade.length, torri, merli: merli.length, oggetti: object.children.length,
      triangoli: object.children.reduce((s, m) => s + (m.isInstancedMesh ? m.geometry.index.count / 3 * m.count
        : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3), 0),
    },
  };
}
