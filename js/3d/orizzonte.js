// Knight Dawn — orizzonte attorno a una Scena del mondo generato (M6, passo 5).
// Terreno lontano solo da guardare (non calpestabile), costruito dalla Carta già in memoria: dal bordo del
// blocco di 2×2 km si vedono le montagne fino a ~110 km (per orientarsi: curvatura attenuata; la foschia dipende dal tempo).
//
//   anello vicino:  dal bordo del blocco a 6 km, passo 62,5 m;
//   anello medio:   da 6 a 18 km, passo 187,5 m;
//   anello lontano: da 18 a 48 km, passo 750 m;
//   anello estremo: da 48 a 110 km, passo 2 km.
// Una sola funzione di quota per tutti: la quota del mondo (Carta + dettaglio della Scena) in cui ogni ottava
// del dettaglio si spegne alla distanza in cui la griglia non la rappresenta più (al bordo del blocco c'è
// tutto, a 18 km resta la sola Carta). Cuciture senza fessure: le celle che toccano il bordo interno sono a
// ventaglio sui vertici più fitti dentro, e i vertici in comune hanno la stessa quota (stessa funzione,
// stesse coordinate). Oltre 1,5 km dal centro la superficie scende con la curvatura della Terra, attenuata per
// il gioco (raggio 4 volte quello vero). I gruppi montuosi ci sono a ogni distanza (sono riferimenti).
// Passo 6: valli dei fiumi scavate come nel blocco; i fiumi continuano come nastri posati sugli anelli e i
// laghi in quota come celle al livello del lago.
//
// Coordinate locali della Scena: x verso est, z verso sud, centro del blocco in (0, 0).

import * as THREE from 'three';
import { quotaMondo, quotaCarta, scavaFiumi, spianaLuoghi, livelloLago, tracciatiFiumi, SCENA, OTTAVE_DETTAGLIO } from '../mondo/scena.js';
import { creaNastro, materialeAcqua, SOPRA_PELO } from './acqua.js';
import { derivaSeme, completa } from '../mondo/rumore.js';
import { ACQUA } from '../mondo/carta.js';
import { coloreMondo, materialeSuolo, nuoviStrati } from './terrain.js';
import { MISURE_ROCCA } from './rocca3d.js';
import { CLASSI_BORGO } from './borgo3d.js';

export const ORIZZONTE = {
  anelli: [                                // passo e bordo esterno (m); il bordo interno è il precedente
    { passo: 62.5, raggio: 6000 },
    { passo: 187.5, raggio: 18000 },
    { passo: 750, raggio: 48000 },
    { passo: 2000, raggio: 110000 },       // sola Carta: grandi catene e gruppi montuosi fino a ~110 km
  ],
  // Distanza (m, dal centro, in quadrato come gli anelli) a cui si spegne ciascuna ottava del dettaglio,
  // dalla più ampia (1400 m) alla più fine (~44 m). Tutte piene al bordo del blocco (1 km).
  spegnimento: [[15000, 18000], [12000, 17000], [6000, 9000], [4000, 6000], [1500, 3500], [1200, 2500]],
  // Curvatura attenuata per il gioco (richiesta dell'utente): una catena a 100 km resta un riferimento per orientarsi.
  // [rivisto con l'utente, novembre 2026: da un'altura si vedeva quasi tutta la mappa] raggio 2 volte quello vero
  // (prima 4): a 100 km il terreno cala di ~390 m (vero ~680 con la rifrazione); restano le catene alte.
  curvatura: { da: 1500, raggioTerra: 6371000 * 2 },
  // Esagerazione verticale con la distanza (per il gioco): le montagne lontane un po' più alte del vero, per
  // orientarsi. Nessuna fino a `da` m, piena oltre `a` m; cresce piano, così avvicinandosi non si nota.
  // Solo i rilievi alti: si esagera la parte oltre `soglia` m (colline e pianure lontane restano vere) [rivisto con
  // l'utente, novembre 2026: prima tutto il terreno].
  esagera: { da: 20000, a: 100000, quanto: 0.4, soglia: 1000 },
  passoAcqua: 1500,
  // Fiumi lontani: fino a `raggio` (m, in quadrato), e ciascun punto finché è largo almeno ~1 pixel
  // (vista = metri di distanza per metro di semilarghezza). Si posano sulla superficie degli anelli, più
  // grossolana del blocco, appena sopra (sopra: m + per metro di distanza); il raccordo dal pelo dell'acqua
  // del blocco alla superficie è nei primi `raccordo` m.
  fiumi: { raggio: 18000, vista: 1800, sopra: [0.3, 0.0003], raccordo: 250 },
};

/** Quota h esagerata a distanza r (m): solo la parte oltre ORIZZONTE.esagera.soglia. */
function esagerata(h, r) {
  const E = ORIZZONTE.esagera;
  return h > E.soglia ? h + (h - E.soglia) * E.quanto * smooth(E.da, E.a, r) : h;
}

/** Abbassamento (m) dovuto alla curvatura della Terra a distanza d (m) dal centro della Scena. */
export function abbassamento(d) {
  const { da, raggioTerra } = ORIZZONTE.curvatura;
  return d > da ? (d - da) * (d - da) / (2 * raggioTerra) : 0;
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Celle di un anello quadrato di lato `passo` tra il bordo interno (`buco`, metà lato) e quello esterno
 * (`raggio`). Le celle che toccano un lato del buco sono a ventaglio sui `fini` sotto-punti di quel lato, così
 * coincidono con i vertici più fitti dentro. `cella(r, c, tri)` chiama tri(a, b, c) per ogni triangolo della
 * cella ([x, y, z] da P) e restituisce false se la cella è nel buco. Una sola definizione per la mesh e per
 * la quota della superficie (su cui si posano i fiumi lontani).
 */
function celleAnello(buco, passo, raggio, fini, P) {
  const n = Math.round(2 * raggio / passo);
  function cella(r, c, tri) {
    const z0 = -raggio + r * passo, z1 = z0 + passo;
    const x0 = -raggio + c * passo, x1 = x0 + passo;
    if (x0 >= -buco && x1 <= buco && z0 >= -buco && z1 <= buco) return false;          // dentro il buco
    const dentroZ = z0 >= -buco && z1 <= buco, dentroX = x0 >= -buco && x1 <= buco;
    // Lato condiviso con il buco: punti fitti da un'estremità all'altra, e i due vertici opposti.
    let lato = null, q0, q1;
    if (dentroZ && x1 === -buco) { lato = (t) => [x1, z0 + t * passo]; q0 = P(x0, z0); q1 = P(x0, z1); }
    else if (dentroZ && x0 === buco) { lato = (t) => [x0, z0 + t * passo]; q0 = P(x1, z0); q1 = P(x1, z1); }
    else if (dentroX && z1 === -buco) { lato = (t) => [x0 + t * passo, z1]; q0 = P(x0, z0); q1 = P(x1, z0); }
    else if (dentroX && z0 === buco) { lato = (t) => [x0 + t * passo, z0]; q0 = P(x0, z1); q1 = P(x1, z1); }
    if (lato) {
      const punti = [];
      for (let k = 0; k <= fini; k++) { const [x, z] = lato(k / fini); punti.push(P(x, z)); }
      const meta = Math.floor(fini / 2);
      for (let k = 0; k < fini; k++) tri(k < meta ? q0 : q1, punti[k], punti[k + 1]);
      tri(q0, punti[meta], q1);
      return true;
    }
    const a = P(x0, z0), b = P(x1, z0), d = P(x0, z1), e = P(x1, z1);
    tri(a, d, b);
    tri(b, d, e);
    return true;
  }
  return { n, cella, passo, buco, raggio };
}

/**
 * Mesh di un anello: vertici condivisi, normali lisce (somma delle facce attorno) e colore per vertice dalla
 * funzione del mondo generato (coloreMondo in terrain.js), come il blocco della Scena: niente chiazze a triangoli.
 * `colore(out, x, z, h, pendenza)` in coordinate del mondo; h è la quota vera (senza la curvatura).
 */
function* anello(celle, colore, cx, cz) {   // a pezzi: yield a ogni riga di celle e ogni 1000 vertici
  const indice = new Map();
  const px = [], py = [], pz = [], nx = [], ny = [], nz = [], tri = [];
  const vertice = (p) => {
    const k = p[0] * 1e6 + p[2];
    let i = indice.get(k);
    if (i === undefined) {
      i = px.length; indice.set(k, i);
      px.push(p[0]); py.push(p[1]); pz.push(p[2]); nx.push(0); ny.push(0); nz.push(0);
    }
    return i;
  };
  function faccia(a, b, c) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fy < 0) { const t = b; b = c; c = t; fx = -fx; fy = -fy; fz = -fz; }   // faccia verso l'alto
    const ia = vertice(a), ib = vertice(b), ic = vertice(c);
    for (const i of [ia, ib, ic]) { nx[i] += fx; ny[i] += fy; nz[i] += fz; }   // pesate per area
    tri.push(ia, ib, ic);
  }
  for (let r = 0; r < celle.n; r++) {
    for (let c = 0; c < celle.n; c++) celle.cella(r, c, faccia);
    yield;
  }
  const m = px.length;
  const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3);
  const bas = new Float32Array(m * 3), str = new Float32Array(m * 4), S = nuoviStrati();
  const tmp = new THREE.Color();
  for (let i = 0; i < m; i++) {
    if (i % 1000 === 0) yield;
    const l = Math.hypot(nx[i], ny[i], nz[i]) || 1;
    const a = nx[i] / l, b = ny[i] / l, c = nz[i] / l;
    pos[i * 3] = px[i]; pos[i * 3 + 1] = py[i]; pos[i * 3 + 2] = pz[i];
    nor[i * 3] = a; nor[i * 3 + 1] = b; nor[i * 3 + 2] = c;
    const pendenza = Math.acos(Math.min(1, b)) * 180 / Math.PI;
    colore(tmp, cx + px[i], cz + pz[i], py[i] + abbassamento(Math.hypot(px[i], pz[i])), pendenza, S);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    bas[i * 3] = S.base.r; bas[i * 3 + 1] = S.base.g; bas[i * 3 + 2] = S.base.b;
    str[i * 4] = S.roccia; str[i * 4 + 1] = S.neve; str[i * 4 + 2] = S.variazione; str[i * 4 + 3] = S.tono;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('base', new THREE.BufferAttribute(bas, 3));
  geo.setAttribute('strati', new THREE.BufferAttribute(str, 4));
  geo.setIndex(tri.length > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Quota (m, già abbassata dalla curvatura) della superficie disegnata degli anelli nel punto, o NaN. */
function superficie(anelli, x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const A = anelli.find((a) => d > a.buco && d <= a.raggio);
  if (!A) return NaN;
  const c = Math.min(A.n - 1, Math.floor((x + A.raggio) / A.passo));
  const r = Math.min(A.n - 1, Math.floor((z + A.raggio) / A.passo));
  let h = NaN, migliore = -Infinity;
  A.cella(r, c, (a, b, e) => {
    // Coordinate baricentriche nel piano x-z; si tiene il triangolo che contiene il punto (o il più vicino).
    const det = (b[2] - e[2]) * (a[0] - e[0]) + (e[0] - b[0]) * (a[2] - e[2]);
    if (det === 0) return;
    const l1 = ((b[2] - e[2]) * (x - e[0]) + (e[0] - b[0]) * (z - e[2])) / det;
    const l2 = ((e[2] - a[2]) * (x - e[0]) + (a[0] - e[0]) * (z - e[2])) / det;
    const l3 = 1 - l1 - l2, minimo = Math.min(l1, l2, l3);
    if (minimo > migliore) { migliore = minimo; h = l1 * a[1] + l2 * b[1] + l3 * e[1]; }
  });
  return h;
}

/** Fiumi (nastri posati sulla superficie degli anelli) e laghi in quota (celle degli anelli) oltre il blocco. */
function* acqueOrizzonte(carta, cx, cz, anelli, colore) {
  const F = ORIZZONTE.fiumi, half = SCENA.lato / 2;
  const gruppo = new THREE.Group();
  gruppo.name = 'acque-orizzonte';
  const mat = materialeAcqua(colore);
  const pezzi = tracciatiFiumi(carta, cx, cz, half, false, F.raggio, (w) => w * F.vista);
  for (const t of pezzi) {
    const quota = (x, z, pelo) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      const acquaY = pelo + SOPRA_PELO - abbassamento(Math.hypot(x, z));
      const s = smooth(half, half + F.raccordo, d);
      if (s === 0) return acquaY;
      const terra = superficie(anelli, x, z);
      if (Number.isNaN(terra)) return acquaY;
      return acquaY + s * Math.max(0, terra + F.sopra[0] + F.sopra[1] * d - acquaY);
    };
    // Suddivisione: metà del passo dell'anello in cui comincia il pezzo (al più fitto, 31 m).
    const d0 = Math.max(Math.abs(t[0]), Math.abs(t[1]));
    const A = anelli.find((a) => d0 <= a.raggio) || anelli[anelli.length - 1];
    gruppo.add(creaNastro(t, mat, A.passo / 2, quota));
    if (gruppo.children.length % 8 === 0) yield;
  }
  yield;
  // Laghi: una cella degli anelli è lago se l'indicatore lo è in un angolo o al centro (come nel blocco).
  const pos = [];
  // Un vertice è dentro il lago solo se la sua cella della Carta è lago (l'indicatore sfumato sborda oltre la riva).
  const cellaLago = (x, z) => {
    const i = Math.floor(z / carta.cella) * carta.cols + Math.floor(x / carta.cella);
    return x >= 0 && z >= 0 && x < carta.cols * carta.cella && z < carta.rows * carta.cella && carta.acque?.[i] === ACQUA.LAGO;
  };
  for (const A of anelli) {
    for (let r = 0; r < A.n; r++) {
      const z0 = -A.raggio + r * A.passo, z1 = z0 + A.passo;
      for (let c = 0; c < A.n; c++) {
        const x0 = -A.raggio + c * A.passo, x1 = x0 + A.passo;
        if (x0 >= -A.buco && x1 <= A.buco && z0 >= -A.buco && z1 <= A.buco) continue;
        let livello = NaN;
        for (const [x, z] of [[(x0 + x1) / 2, (z0 + z1) / 2], [x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
          livello = livelloLago(carta, cx + x, cz + z);
          if (!Number.isNaN(livello)) break;
        }
        if (Number.isNaN(livello)) continue;
        // Ogni angolo fuori dal lago scende sotto la superficie disegnata: la cella copre anche terreno oltre la riva o
        // a valle dell'emissario, e il quadrato piatto restava sospeso (da lontano, trattini nel cielo; segnalato
        // dall'utente tramite M1). Dentro il lago resta al livello.
        const v = (x, z) => {
          const r = Math.hypot(x, z);   // come il terreno
          let y = esagerata(livello, r) - abbassamento(r);
          if (!cellaLago(cx + x, cz + z)) {
            const t = superficie(anelli, x, z);
            if (!Number.isNaN(t)) y = Math.min(y, t - 1);
          }
          return [x, y, z];
        };
        pos.push(...v(x0, z0), ...v(x0, z1), ...v(x1, z0), ...v(x1, z0), ...v(x0, z1), ...v(x1, z1));
      }
      if (r % 16 === 15) yield;
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
  return gruppo.children.length ? gruppo : null;
}

// ─── Rocche e borghi da lontano (M7, passo 8) ──────────────────────────────
// Oltre il blocco la rocca e il borgo non sono modellati: una sagoma semplificata sugli anelli (cinte di rocca e borgo,
// torri agli spigoli della rocca, mastio, una massa di tetti nel borgo) fino a `pieno` m; fino a `mastio` m solo il
// mastio (a 18 km un mastio di 22 m è sotto il pixel). Esclusi i luoghi che la Scena costruisce già per intero (stessa
// regola di costruisciRocche in main.js): niente rocca doppia. Di notte qualche luce per borgo, punti che ignorano la
// nebbia, fino a `luci` m. Tutte le sagome in una sola mesh (una chiamata), le luci in un solo Points.
const LONTANO = {
  pieno: 6000, mastio: 18000, luci: 10000, margine: 50,
  colore: { muro: '#a39883', mastio: '#968b77', tetti: '#8a5a44' }, tetti: 5, torre: 1.25,
  luce: { colore: '#ffb46a', dimensione: 3, perBorgo: [4, 7, 11] },
};

function sagomeLuoghi(carta, cx, cz, half, anelli) {
  const L = LONTANO, pos = [], col = [], luci = [];
  const cM = new THREE.Color(L.colore.muro), cK = new THREE.Color(L.colore.mastio), cT = new THREE.Color(L.colore.tetti);
  const y = (h, x, z) => { const r = Math.hypot(x, z); return esagerata(h, r) - abbassamento(r); };
  const suolo = (x, z, h) => { const t = superficie(anelli, x, z); return Number.isNaN(t) ? y(h, x, z) : t; };
  const quad = (a, b, c, d, colore) => {        // due triangoli, entrambe le facce (le sagome si vedono da ogni lato)
    for (const v of [a, b, c, a, c, d, a, c, b, a, d, c]) { pos.push(...v); col.push(colore.r, colore.g, colore.b); }
  };
  // Muro lungo un contorno chiuso: da sotto il terreno a `alto` sopra la quota del piano.
  const cinta = (pol, q, alto, colore) => {
    for (let k = 0; k < pol.length; k++) {
      const [ax, az] = pol[k], [bx, bz] = pol[(k + 1) % pol.length];
      const ta = y(q + alto, ax, az), tb = y(q + alto, bx, bz);
      const ba = Math.min(suolo(ax, az, q), ta - alto) - 2, bb = Math.min(suolo(bx, bz, q), tb - alto) - 2;
      quad([ax, ba, az], [bx, bb, bz], [bx, tb, bz], [ax, ta, az], colore);
    }
  };
  // Prisma a base quadrata (torri, mastio): quattro facce e il tetto.
  const prisma = (x, z, lato, q, alto, colore) => {
    const h = lato / 2, t = y(q + alto, x, z), b = Math.min(suolo(x, z, q), t - alto) - 2;
    const P = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = P[k], [bx, bz] = P[(k + 1) % 4];
      quad([ax, b, az], [bx, b, bz], [bx, t, bz], [ax, t, az], colore);
    }
    quad([P[0][0], t, P[0][1]], [P[1][0], t, P[1][1]], [P[2][0], t, P[2][1]], [P[3][0], t, P[3][1]], colore);
  };
  let n = 0;
  for (const l of carta.luoghi ?? []) {
    if (!l.piani || !l.piani[0].poligono) continue;
    const lx = l.x - cx, lz = l.z - cz, m = (l.raggioPiani ?? 300) + L.margine;
    if (Math.abs(lx) <= half + m && Math.abs(lz) <= half + m) continue;      // la costruisce la Scena
    const d = Math.max(Math.abs(lx), Math.abs(lz));
    if (d > L.mastio) continue;
    const R = MISURE_ROCCA[l.classe] ?? MISURE_ROCCA.casata, B = CLASSI_BORGO[l.classe] ?? CLASSI_BORGO.casata;
    const locale = (pol) => pol.map(([x, z]) => [x - cx, z - cz]);
    const rocca = l.piani[0], polR = locale(rocca.poligono);
    let mx = 0, mz = 0;
    for (const [x, z] of polR) { mx += x; mz += z; }
    mx /= polR.length; mz /= polR.length;
    prisma(mx, mz, R.mastio.lato, rocca.q, R.mastio.altezza, cK);
    n++;
    if (d > L.pieno) continue;
    cinta(polR, rocca.q, R.altezza, cM);
    for (const [x, z] of polR) prisma(x, z, R.torre * 2 * L.torre, rocca.q, R.altezza + 3, cM);
    for (const p of l.piani.slice(1)) {
      if (!p.poligono || p.tipo !== 'borgo') continue;
      const pol = locale(p.poligono);
      cinta(pol, p.q, B.altezza, cM);
      // Tetti: il contorno del borgo rientrato verso il centro, poco sopra le mura (una falda piatta per lato).
      let bx = 0, bz = 0;
      for (const [x, z] of pol) { bx += x; bz += z; }
      bx /= pol.length; bz /= pol.length;
      const dentro = pol.map(([x, z]) => [bx + (x - bx) * 0.8, bz + (z - bz) * 0.8]);
      const tc = y(p.q + B.altezza + L.tetti, bx, bz);
      for (let k = 0; k < dentro.length; k++) {
        const [ax, az] = dentro[k], [cx2, cz2] = dentro[(k + 1) % dentro.length];
        const ta = y(p.q + B.altezza - 1, ax, az), tb = y(p.q + B.altezza - 1, cx2, cz2);
        quad([ax, ta, az], [cx2, tb, cz2], [bx, tc, bz], [bx, tc, bz], cT);
      }
      if (d <= L.luci) {
        const quante = L.luce.perBorgo[{ minore: 0, casata: 1, maggiore: 2 }[l.classe] ?? 1];
        for (let k = 0; k < quante; k++) {
          const a = (k * 2.399963) % (2 * Math.PI), f = 0.25 + 0.6 * ((k * 0.618034) % 1);
          const v = dentro[k % dentro.length], x = bx + (v[0] - bx) * f, z = bz + (v[1] - bz) * f;
          luci.push(x + Math.cos(a), y(p.q + B.altezza + L.tetti + 2, x, z), z + Math.sin(a));   // sopra i tetti
        }
      }
    }
  }
  const oggetto = new THREE.Group();
  oggetto.name = 'luoghi-lontani';
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    oggetto.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  let accendi = () => {};
  if (luci.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(luci, 3));
    const mat = new THREE.PointsMaterial({ color: L.luce.colore, size: L.luce.dimensione, sizeAttenuation: false,
      fog: false, transparent: true, opacity: 0, depthWrite: false });
    const punti = new THREE.Points(geo, mat);
    punti.visible = false;
    oggetto.add(punti);
    accendi = (notte) => { mat.opacity = Math.max(0, Math.min(1, (notte - 0.4) / 0.4)); punti.visible = mat.opacity > 0.01; };
  }
  return { oggetto: oggetto.children.length ? oggetto : null, triangoli: pos.length / 9, luci: accendi, luoghi: n };
}

/**
 * Orizzonte per la Scena centrata in (cx, cz) del mondo.
 * @param {object} carta  dalla generaCarta
 * @param {object} terrain  il blocco della Scena
 * @param {string} coloreAcqua
 * @param {number} stagione  indice del calendario (colori e limite delle nevi)
 * @returns {{ oggetto: THREE.Group, acqua: THREE.Mesh|null, triangoli: number, ms: number, quota: Function }}
 */
export function creaOrizzonte(carta, cx, cz, terrain, coloreAcqua, stagione) {
  return completa(creaOrizzonteAPezzi(carta, cx, cz, terrain, coloreAcqua, stagione));
}

/** creaOrizzonte a pezzi (blocco che segue il cavaliere, js/3d/blocchi.js). */
export function* creaOrizzonteAPezzi(carta, cx, cz, terrain, coloreAcqua, stagione = 0) {
  const t0 = performance.now();
  const O = ORIZZONTE, half = SCENA.lato / 2;
  const seme = derivaSeme(carta.seme, 101);                // lo stesso del blocco (generaScena)
  const nOttave = OTTAVE_DETTAGLIO.length;
  const pesi = new Float64Array(nOttave);
  let minimo = Infinity;
  const colore = coloreMondo(carta, stagione);

  const quota = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z));
    let tutti = true, nessuno = true;
    for (let o = 0; o < nOttave; o++) {
      const [a, b] = O.spegnimento[o];
      const p = 1 - smooth(a, b, d);
      pesi[o] = p;
      if (p < 1) tutti = false;
      if (p > 0) nessuno = false;
    }
    // Al bordo del blocco tutte le ottave sono piene: stesso calcolo del blocco (null = senza pesi).
    // Anche senza dettaglio i gruppi montuosi restano (quotaMondo con tutte le ottave spente).
    const base = nessuno && !carta.massicci?.length ? quotaCarta(carta, cx + x, cz + z)
      : quotaMondo(carta, cx + x, cz + z, seme, tutti ? null : pesi);
    // Le valli dei fiumi anche nell'orizzonte: stessa funzione del blocco (al bordo le quote coincidono).
    // e i terrapieni dei luoghi (M7): come quotaFinale, che però non ha il ramo «solo Carta» qui sopra.
    const h = spianaLuoghi(carta, cx + x, cz + z, scavaFiumi(carta, cx + x, cz + z, base));
    if (h < minimo) minimo = h;
    const r = Math.hypot(x, z);
    return esagerata(h, r) - abbassamento(r);
  };
  const cache = new Map();                   // quota dei vertici, calcolata una volta sola
  const P = (x, z) => {
    const k = x * 1e6 + z;
    let h = cache.get(k);
    if (h === undefined) { h = quota(x, z); cache.set(k, h); }
    return [x, h, z];
  };
  const anelli = [];
  let interno = half, passoDentro = SCENA.lato / SCENA.celle;
  for (const { passo, raggio } of O.anelli) {
    anelli.push(celleAnello(interno, passo, raggio, Math.round(passo / passoDentro), P));
    interno = raggio;
    passoDentro = passo;
  }
  const geometrie = [];
  for (const a of anelli) geometrie.push(yield* anello(a, colore, cx, cz));
  yield 'orizzonte: anelli';

  const mat = materialeSuolo(cx, cz);   // colore per pixel come il blocco (terrain.js)
  const oggetto = new THREE.Group();
  oggetto.name = 'orizzonte';
  for (const g of geometrie) oggetto.add(new THREE.Mesh(g, mat));

  // Mare: una griglia larga che scende con la curvatura (un piano dritto spunterebbe sopra le coste lontane).
  let acqua = null;
  if (minimo < 0 || terrain.minElev < 0) {
    const R = O.anelli[O.anelli.length - 1].raggio, n = Math.round(2 * R / O.passoAcqua);
    const geo = new THREE.PlaneGeometry(2 * R, 2 * R, n, n).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, -abbassamento(Math.hypot(p.getX(i), p.getZ(i))));
    geo.computeVertexNormals();
    acqua = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: coloreAcqua, transparent: true, opacity: 0.88 }));
    acqua.name = 'acqua';
  }
  // Fiumi e laghi in quota oltre il blocco (passo 6): continuano quelli della Scena.
  yield 'orizzonte: mare';
  const acque = yield* acqueOrizzonte(carta, cx, cz, anelli, coloreAcqua);
  if (acque) oggetto.add(acque);
  yield 'orizzonte: acque';
  // Rocche e borghi lontani (M7, passo 8): sagome sugli anelli e luci di notte.
  const lontani = sagomeLuoghi(carta, cx, cz, half, anelli);
  if (lontani.oggetto) oggetto.add(lontani.oggetto);
  const triangoli = geometrie.reduce((t, g) => t + g.index.count / 3, 0) + lontani.triangoli;
  // quota(x, z): superficie disegnata degli anelli in coordinate locali (la usa la vegetazione per il bosco lontano).
  // luciLontane(notte 0–1): accende le luci dei borghi lontani (la chiama main.js con le luci del cielo).
  return { oggetto, acqua, triangoli, ms: performance.now() - t0, quota: (x, z) => superficie(anelli, x, z),
    luciLontane: lontani.luci };
}
