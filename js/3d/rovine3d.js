// Knight Dawn — rovine e luoghi abbandonati del mondo generato (M8, passo 4). Piano: docs/ESPLORAZIONE_3D.md,
// «M8 — Luoghi del mondo». I siti arrivano da `carta.siti` (js/mondo/siti.js): `rovina` con le varianti castello,
// torre, chiesa e villaggio; `abbandonato` con torre, maniero e casale.
//
// Differenza fra i due, che guida tutto il modulo:
//   - una ROVINA non ha più tetti né solai: restano muri spezzati, monconi di torre e macerie, e il bosco se la
//     riprende. Niente terra battuta: l'erba ha coperto tutto. Si costruisce con geometria propria (prismi di
//     rocca3d.js uniti in una sola chiamata), non con il kit degli edifici, che fa case intere;
//   - un luogo ABBANDONATO sta ancora in piedi: la casa o la torre c'è, col suo tetto, ma è vuota, il muro di cinta
//     è crollato a tratti, l'aia è sbiadita e tutt'intorno cresce il campo. Qui il kit serve, e si aggiungono i
//     muri rotti e le macerie.
//
// Invecchiamento: dopo l'unione, il colore per vertice vira al verde al piede (edera) e sulle rotture in piano
// (muschio). Costa nulla e si vede: una rovina pulita sembra un cantiere.
//
// Costruzione a pezzi (blocco che segue il cavaliere, M7 passo 9): il generatore cede il passo ogni ~PEZZO_MS ms.

import * as THREE from 'three';
import { creaKit, completaPezzi, PEZZO_MS } from './edifici3d.js';
import { prisma, unisci, materialeMuro } from './rocca3d.js';
import { hash2 } from '../mondo/rumore.js';
import { climaDelLuogo } from '../mondo/siti.js';
import { SUOLO, geoTerra, distRett, attaccaSuolo, spintaDaScatole } from './villaggio3d.js';

export const ROVINE = {
  raggio: 26,                      // m: ingombro entro cui si costruisce
  muro: { spessore: 0.85, passo: 1.8, soglia: 0.18, affondo: 0.9 },
  torre: { lato: 6.4, alto: [4, 9.5], spessore: 1.0 },
  castello: { raggio: [11, 17], lati: [5, 7], torri: [2, 3], alto: [1.6, 4.2] },
  chiesa: { largo: 9, fondo: 18, alto: [2.2, 5], abside: 4.2 },
  villaggio: { case: [4, 8], largo: [5, 9], fondo: [4.5, 7], alto: [0.7, 2], sparse: 17 },
  macerie: { quante: [16, 34], lato: [0.3, 1.1], entro: 1.8 },
  // Luoghi abbandonati: ancora in piedi, ma vuoti.
  abbandonato: {
    torre: { lato: 6, alto: 11, spessore: 1.0 },
    maniero: { largo: 15, fondo: 9.5, piani: 2 },
    casale: { largo: 15.5, fondo: 8 },
    cinta: { raggio: [10, 15], lati: [4, 6], alto: [0.9, 2.2] },
    crollo: { largo: 7.5, fondo: 5.5, alto: [0.6, 1.6] },   // corpo di fabbrica crollato accanto alla casa
    aia: 9,
  },
  colore: 0x8e897e,                // pietra grigia, più fredda di quella dei luoghi vivi
  verde: { piede: 2.2, forza: 0.38 },   // oltre, la pietra sembra dipinta di verde
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Edera al piede e muschio sulle rotture in piano: il colore per vertice vira al verde. L'altezza si misura dal
 * terreno sotto OGNI vertice, non da un piano unico: in pendenza un piano solo tingeva di verde tutta la parte a
 * valle della rovina.
 */
function invecchia(geo, terreno, ox, oz) {
  const col = geo.attributes.color, pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!col) return;
  const V = ROVINE.verde;
  for (let i = 0; i < col.count; i++) {
    const h = pos.getY(i) - terreno(pos.getX(i) - ox, pos.getZ(i) - oz), su = nor ? nor.getY(i) : 0;
    // Quadrato: il verde resta nel primo metro e sfuma in fretta, invece di tingere tutto il muro.
    const t = h < V.piede ? 1 - h / V.piede : 0;
    let verde = V.forza * t * t;
    if (su > 0.6) verde = Math.max(verde, V.forza * 0.7);
    if (verde <= 0) continue;
    col.setXYZ(i, col.getX(i) * (1 - verde * 0.55), col.getY(i) * (1 - verde * 0.12), col.getZ(i) * (1 - verde * 0.72));
  }
  col.needsUpdate = true;
}

/**
 * Muro spezzato lungo la polilinea P (locale), appoggiato al terreno: tratti di ~passo m, altezza da un profilo che
 * ondeggia lungo il muro, con i tratti crollati dove il profilo scende sotto la soglia. Le due estremità di ogni
 * tratto hanno quote diverse: la cima non è mai dritta.
 */
function muroRotto(P, chiuso, { alto, spessore = ROVINE.muro.spessore, fase = 0 }, terreno, rnd, pezzi, scatole) {
  const M = ROVINE.muro;
  const punti = chiuso ? [...P, P[0]] : P;
  let s = 0;
  const profilo = (t) => clamp(0.55 + 0.45 * Math.sin(t * 0.23 + fase) + 0.3 * Math.sin(t * 0.61 + fase * 2.3), 0, 1);
  for (let i = 0; i + 1 < punti.length; i++) {
    const a = punti[i], b = punti[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.3) continue;
    const t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], n = [-t[1], t[0]];
    const nSeg = Math.max(1, Math.round(l / M.passo));
    for (let k = 0; k < nSeg; k++) {
      const d0 = l * k / nSeg, d1 = l * (k + 1) / nSeg;
      const p0 = profilo(s + d0), p1 = profilo(s + d1);
      if (p0 < M.soglia && p1 < M.soglia) continue;              // tratto crollato del tutto
      const q0 = [a[0] + t[0] * d0, a[1] + t[1] * d0], q1 = [a[0] + t[0] * d1, a[1] + t[1] * d1];
      const R = [q0, q1, [q1[0] + n[0] * spessore, q1[1] + n[1] * spessore], [q0[0] + n[0] * spessore, q0[1] + n[1] * spessore]];
      const h0 = terreno(q0[0], q0[1]), h1 = terreno(q1[0], q1[1]);
      const base = Math.min(h0, h1) - M.affondo;
      const y = [h0 + alto * Math.max(p0, M.soglia), h1 + alto * Math.max(p1, M.soglia)];
      const sbec = () => (rnd() - 0.5) * 0.35;                   // cima sbeccata
      pezzi.push(prisma(R, R, base, [y[0] + sbec(), y[1] + sbec(), y[1] + sbec(), y[0] + sbec()]));
      if (Math.max(y[0], y[1]) - Math.max(h0, h1) > 0.6) {
        scatole.push({ cu: (q0[0] + q1[0]) / 2 + n[0] * spessore / 2, cv: (q0[1] + q1[1]) / 2 + n[1] * spessore / 2,
          au: t[0], av: t[1], hl: (d1 - d0) / 2, hw: spessore / 2 });
      }
    }
    s += l;
  }
}

/** Moncone di torre: quattro muri con le cime a quote diverse, uno spigolo più alto degli altri. */
function monconeTorre(c, lato, alti, spessore, terreno, rnd, pezzi, scatole) {
  const a = lato / 2;
  const ang = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => [c[0] + i * a, c[1] + j * a]);
  for (let i = 0; i < 4; i++) {
    const p0 = ang[i], p1 = ang[(i + 1) % 4];
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const t = [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l], n = [t[1], -t[0]];   // verso l'interno
    const R = [p0, p1, [p1[0] + n[0] * spessore, p1[1] + n[1] * spessore], [p0[0] + n[0] * spessore, p0[1] + n[1] * spessore]];
    const h = terreno(p0[0], p0[1]);
    const y0 = h + alti[i], y1 = h + alti[(i + 1) % 4];
    pezzi.push(prisma(R, R, h - 1.2, [y0, y1, y1 - 0.2, y0 - 0.2]));
    scatole.push({ cu: (p0[0] + p1[0]) / 2 + n[0] * spessore / 2, cv: (p0[1] + p1[1]) / 2 + n[1] * spessore / 2,
      au: t[0], av: t[1], hl: l / 2, hw: spessore / 2 });
  }
}

/** Macerie: sassi squadrati sparsi, inclinati, mezzi affondati nell'erba. */
function macerie(c, raggio, quante, terreno, rnd, pezzi) {
  const L = ROVINE.macerie.lato;
  for (let k = 0; k < quante; k++) {
    const a = rnd() * Math.PI * 2, d = raggio * (0.3 + 0.7 * Math.sqrt(rnd()));
    const u = c[0] + Math.cos(a) * d, v = c[1] + Math.sin(a) * d;
    const lx = L[0] + rnd() * (L[1] - L[0]), lz = L[0] + rnd() * (L[1] - L[0]), ly = 0.2 + rnd() * 0.5;
    const r = rnd() * Math.PI, cs = Math.cos(r), sn = Math.sin(r);
    const R = [[-lx, -lz], [lx, -lz], [lx, lz], [-lx, lz]].map(([i, j]) => [u + (i * cs - j * sn) / 2, v + (i * sn + j * cs) / 2]);
    const h = terreno(u, v);
    // Cima inclinata: un sasso appoggiato male.
    const inc = (rnd() - 0.5) * 0.3;
    pezzi.push(prisma(R, R, h - 0.3, [h + ly + inc, h + ly - inc, h + ly - inc * 0.4, h + ly + inc * 0.4]));
  }
}

/** Poligono irregolare di `n` lati attorno all'origine, raggio medio r. */
function poligono(n, r, rnd) {
  const P = [], fase = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = fase + i / n * Math.PI * 2 + (rnd() - 0.5) * 0.25, d = r * (0.82 + rnd() * 0.36);
    P.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return P;
}

/**
 * Rovina o luogo abbandonato in coordinate del blocco: centro del sito in (ox, oz). `suolo.getHeight(x, z)` vale
 * anche fuori dal blocco (quotaFinale), `carta` per il clima delle case ancora in piedi.
 */
export function createRovina(suolo, sito, ox, oz, carta) {
  return completaPezzi(createRovinaAPezzi(suolo, sito, ox, oz, carta));
}

export function* createRovinaAPezzi(suolo, sito, ox, oz, carta) {
  const seme = hash2(Math.floor(sito.x), Math.floor(sito.z), (carta.seme ?? 1) ^ 0x20b1e5) || 1;
  let s0 = seme >>> 0 || 1;
  const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296);
  const terreno = (u, v) => suolo.getHeight(ox + u, oz + v);
  const abbandonato = sito.tipo === 'abbandonato';
  const A = ROVINE.abbandonato;
  const pezzi = [], scatole = [], forme = [];
  let t0 = performance.now();
  const forse = function* () { if (performance.now() - t0 > PEZZO_MS) { yield; t0 = performance.now(); } };
  const fra = ([a, b]) => a + rnd() * (b - a);
  const quante = () => Math.round(fra(ROVINE.macerie.quante));

  // Il kit serve solo ai luoghi ancora in piedi: una rovina non ha né tetti né infissi.
  const kit = abbandonato ? creaKit({ X: (u) => ox + u, Z: (u, v) => oz + v, terreno, seme,
    nome: `abbandonato-${sito.id}`, contesto: 'campagna', zone: 1, clima: climaDelLuogo(carta, sito.x, sito.z) }) : null;

  if (!abbandonato) {
    // ─── Rovine ──────────────────────────────────────────────────────────
    const V = sito.variante;
    if (V === 'castello') {
      const R = fra(ROVINE.castello.raggio), n = Math.round(fra(ROVINE.castello.lati));
      const P = poligono(n, R, rnd);
      muroRotto(P, true, { alto: fra(ROVINE.castello.alto) + 1.4, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      yield* forse();
      const nT = Math.round(fra(ROVINE.castello.torri));
      for (let k = 0; k < nT; k++) {
        const c = P[Math.floor(rnd() * P.length)];
        const alto = fra(ROVINE.torre.alto);
        monconeTorre(c, ROVINE.torre.lato * 0.8, [alto, alto * 0.7, alto * 0.45, alto * 0.85],
          ROVINE.torre.spessore, terreno, rnd, pezzi, scatole);
        yield* forse();
      }
      macerie([0, 0], R * 0.9, quante() + 10, terreno, rnd, pezzi);
      forme.push({ c: [0, 0], s: [1, 0], f: [0, 1], a: R, b: R });
    } else if (V === 'torre') {
      const alto = fra(ROVINE.torre.alto);
      monconeTorre([0, 0], ROVINE.torre.lato, [alto, alto * 0.55, alto * 0.35, alto * 0.8],
        ROVINE.torre.spessore, terreno, rnd, pezzi, scatole);
      // Un pezzo di muro che se ne va, dove c'era il recinto.
      const a = rnd() * Math.PI * 2, l = 6 + rnd() * 10;
      muroRotto([[Math.cos(a) * 4, Math.sin(a) * 4], [Math.cos(a) * (4 + l), Math.sin(a) * (4 + l)]], false,
        { alto: 1.6, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      macerie([0, 0], 8, quante(), terreno, rnd, pezzi);
      forme.push({ c: [0, 0], s: [1, 0], f: [0, 1], a: 8, b: 8 });
    } else if (V === 'chiesa') {
      const C = ROVINE.chiesa, a = rnd() * Math.PI * 2;
      const dir = [Math.cos(a), Math.sin(a)], nrm = [-dir[1], dir[0]];
      const pt = (du, dv) => [dir[0] * du + nrm[0] * dv, dir[1] * du + nrm[1] * dv];
      const la = C.largo / 2, fo = C.fondo / 2;
      // Navata: i due muri lunghi e la facciata; l'abside in fondo, a semicerchio.
      muroRotto([pt(-fo, -la), pt(fo * 0.7, -la)], false, { alto: fra(C.alto) + 1, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      muroRotto([pt(-fo, la), pt(fo * 0.7, la)], false, { alto: fra(C.alto) + 1, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      muroRotto([pt(-fo, -la), pt(-fo, la)], false, { alto: fra(C.alto) + 2.4, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      yield* forse();
      const abside = [];
      for (let k = 0; k <= 8; k++) {
        const t = -Math.PI / 2 + k / 8 * Math.PI;
        abside.push(pt(fo * 0.7 + Math.cos(t) * C.abside, Math.sin(t) * C.abside));
      }
      muroRotto(abside, false, { alto: fra(C.alto) + 1.8, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      macerie([0, 0], fo * 0.8, quante(), terreno, rnd, pezzi);
      forme.push({ c: [0, 0], s: dir, f: nrm, a: fo + 2, b: la + 2 });
    } else {
      // Villaggio in rovina: muri bassi di quattro-otto case sparse, qualche focolare di macerie.
      const n = Math.round(fra(ROVINE.villaggio.case));
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, d = ROVINE.villaggio.sparse * Math.sqrt(rnd());
        const c = [Math.cos(a) * d, Math.sin(a) * d];
        const av = rnd() * Math.PI * 2, dir = [Math.cos(av), Math.sin(av)], nrm = [-dir[1], dir[0]];
        const la = fra(ROVINE.villaggio.largo) / 2, fo = fra(ROVINE.villaggio.fondo) / 2;
        const P = [[-la, -fo], [la, -fo], [la, fo], [-la, fo]]
          .map(([i, j]) => [c[0] + dir[0] * i + nrm[0] * j, c[1] + dir[1] * i + nrm[1] * j]);
        muroRotto(P, true, { alto: fra(ROVINE.villaggio.alto) + 0.8, spessore: 0.6, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
        macerie(c, Math.max(la, fo), 6 + Math.floor(rnd() * 8), terreno, rnd, pezzi);
        forme.push({ c, s: dir, f: nrm, a: la, b: fo });
        yield* forse();
      }
    }
  } else {
    // ─── Luoghi abbandonati: ancora in piedi, ma vuoti ───────────────────
    const V = sito.variante;
    const av = rnd() * Math.PI * 2, dir = [Math.cos(av), Math.sin(av)];
    if (V === 'torre') {
      const T = A.torre, h = T.alto * (0.85 + rnd() * 0.3);
      monconeTorre([0, 0], T.lato, [h, h - 0.6, h - 1.1, h - 0.3], T.spessore, terreno, rnd, pezzi, scatole);
      macerie([0, 0], 7, Math.round(quante() * 0.6), terreno, rnd, pezzi);
      forme.push({ c: [0, 0], s: [1, 0], f: [0, 1], a: T.lato / 2 + 1, b: T.lato / 2 + 1 });
    } else {
      const E = V === 'maniero' ? A.maniero : A.casale;
      if (V === 'maniero') {
        kit.corpo({ c: [0, 0], f: dir, largo: E.largo, fondo: E.fondo, piani: E.piani, intonaco: false,
          comignolo: false, legno: false, copertura: 'lastre' });
      } else kit.casa({ u: 0, v: 0, fu: dir[0], fv: dir[1], tipo: 'rurale' });
      forme.push({ c: [0, 0], s: [-dir[1], dir[0]], f: dir, a: E.largo / 2 + 1.5, b: E.fondo / 2 + 1.5 });
      // Corpo crollato di fianco: senza, una casa vuota sembra solo una casa. Muri bassi e il tetto a terra.
      const lato = rnd() < 0.5 ? 1 : -1, nrm = [-dir[1] * lato, dir[0] * lato];
      const cc = [nrm[0] * (E.fondo / 2 + A.crollo.fondo / 2 + 0.4), nrm[1] * (E.fondo / 2 + A.crollo.fondo / 2 + 0.4)];
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
        .map(([i, j]) => [cc[0] + dir[0] * i * A.crollo.largo / 2 + nrm[0] * j * A.crollo.fondo / 2,
          cc[1] + dir[1] * i * A.crollo.largo / 2 + nrm[1] * j * A.crollo.fondo / 2]);
      muroRotto(P, true, { alto: fra(A.crollo.alto), spessore: 0.55, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
      macerie(cc, A.crollo.largo / 2, Math.round(quante() * 0.7), terreno, rnd, pezzi);
      forme.push({ c: cc, s: dir, f: nrm, a: A.crollo.largo / 2, b: A.crollo.fondo / 2 });
    }
    yield* forse();
    // Cinta crollata attorno, e le macerie di quello che è caduto.
    const R = fra(A.cinta.raggio), P = poligono(Math.round(fra(A.cinta.lati)), R, rnd);
    muroRotto(P, true, { alto: fra(A.cinta.alto) + 0.6, spessore: 0.6, fase: rnd() * 6 }, terreno, rnd, pezzi, scatole);
    macerie([Math.cos(av) * R * 0.7, Math.sin(av) * R * 0.7], 5, Math.round(quante() * 0.5), terreno, rnd, pezzi);
  }
  yield;

  // ─── Una sola chiamata per tutta la pietra, poi l'invecchiamento ───
  const r = kit ? yield* kit.chiudiAPezzi()
    : { object: new THREE.Group(), solidi: [], scatole: [], edifici: [], sorgenti: [],
      aggiornaLuci: () => {}, misure: { case: 0, edifici: 0, chiamate: 0, triangoli: 0 } };
  if (!kit) r.object.name = `rovina-${sito.id}`;
  const geo = unisci(pezzi);
  if (geo) {
    invecchia(geo, terreno, ox, oz);
    const mesh = new THREE.Mesh(geo, materialeMuro(new THREE.Color(ROVINE.colore), 0.16));
    mesh.name = `${r.object.name}-pietra`;
    r.object.add(mesh);
    r.solidi.push(mesh);
    r.misure.chiamate++;
    r.misure.triangoli += geo.attributes.position.count / 3;
  }
  yield;
  // Suolo: solo i luoghi abbandonati tengono un'aia sbiadita; su una rovina è cresciuta l'erba.
  if (abbandonato) {
    const distForme = (u, v) => {
      let m = Infinity;
      for (const L of forme) m = Math.min(m, distRett(L, u, v));
      return m;
    };
    attaccaSuolo(r, [['terra', geoTerra(ROVINE.raggio, distForme, ox, oz, terreno, seme, [1, 3]), 0]]);
  }
  const tutte = [...(r.scatole ?? []), ...scatole];
  return { tipo: sito.tipo, sito, object: r.object, solidi: r.solidi,
    spingiFuori: spintaDaScatole(tutte, ox, oz, ROVINE.raggio + 20), quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici,
    raggio: ROVINE.raggio };
}

// ─── Grotte e luoghi del fantastico (M8, passo 5) ──────────────────────────
// Qui la pietra non è muratura: una grotta e un cerchio di pietre sono roccia viva, senza corsi né malta. Perciò
// accanto alla mesh di muratura (materialeMuro, texture a corsi) ce n'è una seconda, a facce piatte e colore per
// vertice, che tiene roccia, terra del tumulo e legno. Il buio dentro la grotta è lo stesso materiale con il colore
// quasi nero: non costa una chiamata in più.
//
// I siti: `grotta` (10–15 per mondo, sul terreno più ripido della cella) e `fantastico` (8–12, in alto) con le
// varianti cerchio di pietre, tumulo, albero sacro e rovine antiche.

export const MISTERI = {
  raggio: 24,
  grotta: { imbocco: [3.4, 4.6], alto: [3, 4], parete: 7, stipite: [3.5, 6], massi: [6, 9], masso: [2.5, 5],
    dentro: 8, sfasciume: [10, 20] },
  cerchio: { raggio: [5, 9], pietre: [7, 12], alta: [1.8, 3.2], larga: [0.7, 1.3], spessa: [0.4, 0.7], cadute: [1, 2] },
  tumulo: { raggio: [7, 11], alto: [2, 3.2], anelli: 5, cordolo: [10, 16], porta: { largo: 1.5, alto: 1.6 } },
  albero: { tronco: { base: 1.5, cima: 1, alto: 5.5 }, chiome: [7, 10], chioma: [1.7, 2.7], pali: [2, 4], sassi: [8, 14] },
  antiche: { piano: [12, 9], gradino: 0.35, colonne: [6, 9], colonna: 0.85, alta: [1, 4.5], cadute: [1, 2], rocchi: 4 },
  colori: {
    roccia: [0.63, 0.59, 0.52], scuro: [0.045, 0.042, 0.04], terra: [0.36, 0.33, 0.24],
    erba: [0.33, 0.38, 0.22], fronde: [0.19, 0.32, 0.14], legno: [0.3, 0.23, 0.16], panno: [0.5, 0.18, 0.16], pietraChiara: 0xa8a295,
  },
};

/** Unisce geometrie dando a ciascuna un colore per vertice: una sola chiamata per roccia, terra e legno. */
function unisciTinte(parti) {
  if (!parti.length) return null;
  const geos = parti.map(({ g }) => (g.index ? g.toNonIndexed() : g));
  const n = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  geos.forEach((g, i) => {
    const p = g.attributes.position, [cr, cv, cb] = parti[i].c;
    pos.set(p.array, o * 3);
    for (let k = 0; k < p.count; k++) { col[3 * (o + k)] = cr; col[3 * (o + k) + 1] = cv; col[3 * (o + k) + 2] = cb; }
    o += p.count;
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();                      // non indicizzata: normali per faccia, facce piatte
  geo.computeBoundingSphere();
  return geo;
}

/** Blocco squadrato e storto, appoggiato al terreno: il mattone di tutto quello che è roccia. */
function blocco(c, ax, az, alto, rot, terreno, rnd, { affonda = 0.6, inclina = 0.25 } = {}) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const R = [[-ax, -az], [ax, -az], [ax, az], [-ax, az]]
    .map(([i, j]) => [c[0] + i * cs - j * sn, c[1] + i * sn + j * cs]);
  const h = terreno(c[0], c[1]);
  const y = R.map(() => h + alto + (rnd() - 0.5) * 2 * inclina * alto);
  return prisma(R, R, h - affonda, y);
}

/**
 * Masso: un icosaedro con i vertici tirati a caso, mezzo affondato nel terreno. Le scatole squadrate di `blocco` vanno
 * per le lastre e i rocchi di colonna, ma per la roccia viva sembrano casse: qui serve una forma irregolare.
 */
function masso(c, rx, ry, rz, terreno, rnd, affonda = 0.35) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + rnd() * 0.56;
    p.setXYZ(i, p.getX(i) * rx * k, p.getY(i) * ry * k, p.getZ(i) * rz * k);
  }
  g.translate(c[0], terreno(c[0], c[1]) + ry * (1 - affonda), c[1]);
  return g;
}

/** Cupola a facce piatte (tumulo): anelli dal centro al bordo, altezza a campana. */
function cupola(c, raggio, alto, anelli, nA, terreno) {
  const pos = [], idx = [];
  const p = (u, v, y) => { pos.push(u, y, v); return pos.length / 3 - 1; };
  const q = (d) => alto * Math.cos(Math.min(1, d / raggio) * Math.PI / 2);
  const centro = p(c[0], c[1], terreno(c[0], c[1]) + alto);
  const anello = [];
  for (let k = 1; k <= anelli; k++) {
    const d = raggio * k / anelli, fila = [];
    for (let j = 0; j < nA; j++) {
      const a = j / nA * Math.PI * 2, u = c[0] + Math.cos(a) * d, v = c[1] + Math.sin(a) * d;
      fila.push(p(u, v, terreno(u, v) + (k === anelli ? 0 : q(d))));
    }
    anello.push(fila);
  }
  for (let j = 0; j < nA; j++) idx.push(centro, anello[0][(j + 1) % nA], anello[0][j]);
  for (let k = 1; k < anelli; k++) for (let j = 0; j < nA; j++) {
    const a = anello[k - 1][j], b = anello[k - 1][(j + 1) % nA], cc = anello[k][j], d = anello[k][(j + 1) % nA];
    idx.push(a, b, cc, b, d, cc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Grotta o luogo del fantastico. Stessa forma di ritorno degli altri luoghi di M8.
 */
export function createMistero(suolo, sito, ox, oz, carta) {
  return completaPezzi(createMisteroAPezzi(suolo, sito, ox, oz, carta));
}

export function* createMisteroAPezzi(suolo, sito, ox, oz, carta) {
  const M = MISTERI, C = M.colori;
  const seme = hash2(Math.floor(sito.x), Math.floor(sito.z), (carta.seme ?? 1) ^ 0x6a17ec) || 1;
  let s0 = seme >>> 0 || 1;
  const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296);
  const terreno = (u, v) => suolo.getHeight(ox + u, oz + v);
  const fra = ([a, b]) => a + rnd() * (b - a);
  const quanti = (r) => Math.round(fra(r));
  const tinte = [], muratura = [], scatole = [];
  let t0 = performance.now();
  const forse = function* () { if (performance.now() - t0 > PEZZO_MS) { yield; t0 = performance.now(); } };
  /** Colore con una variazione per pezzo, così la roccia non è tutta uguale. */
  const varia = (c, f = 0.1) => { const k = 1 + (rnd() - 0.5) * 2 * f; return [c[0] * k, c[1] * k, c[2] * k]; };
  const roccia = (g) => tinte.push({ g, c: varia(C.roccia) });

  // Direzione di monte: dove il terreno sale di più (la grotta sta su terreno ripido, l'imbocco guarda a valle).
  let su = [0, 1], dMax = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, d = terreno(Math.cos(a) * 7, Math.sin(a) * 7) - terreno(0, 0);
    if (d > dMax) { dMax = d; su = [Math.cos(a), Math.sin(a)]; }
  }
  const giu = [-su[0], -su[1]], lat = [-su[1], su[0]];

  if (sito.tipo === 'grotta') {
    // ─── Grotta: una fascia di roccia attraversa il pendio, col vano aperto in mezzo ───
    // Tre tentativi prima di questo: un mucchio di massi tondi non legge mai come una grotta, perché non c'è una
    // parete in cui il buco sia un buco. Qui la parete è fatta di tre blocchi a facce piatte — a sinistra del vano, a
    // destra e sopra — così il vuoto in mezzo è davvero un vuoto; i massi irregolari si appoggiano dopo, a rompere la
    // regolarità. Tutto su UNA quota di riferimento: appoggiando ogni pezzo al terreno sotto di sé, su un pendio
    // ripido (e la grotta sta sempre sul punto più ripido della cella) i pezzi di monte salivano sopra l'architrave.
    const largo = fra(M.grotta.imbocco), alto = fra(M.grotta.alto), H = M.grotta.parete;
    const hM = terreno(giu[0] * 0.5, giu[1] * 0.5), piano = () => hM;
    const rotL = Math.atan2(lat[1], lat[0]);
    const fondo = M.grotta.dentro / 2;
    const dentro = [su[0] * fondo, su[1] * fondo];                 // la parete è spessa, sprofonda nel monte
    for (const lato of [1, -1]) {                                  // stipiti
      const w = fra(M.grotta.stipite);
      const c = [dentro[0] + lat[0] * lato * (largo / 2 + w / 2), dentro[1] + lat[1] * lato * (largo / 2 + w / 2)];
      roccia(blocco(c, w / 2, fondo, H * (0.8 + rnd() * 0.35), rotL, piano, rnd, { affonda: 1.2, inclina: 0.1 }));
      scatole.push({ cu: c[0], cv: c[1], au: lat[0], av: lat[1], hl: w / 2, hw: fondo });
    }
    roccia(blocco(dentro, largo / 2 + 0.2, fondo, H, rotL, piano, rnd, { affonda: -alto, inclina: 0.07 }));  // architrave
    const cB = [su[0] * (fondo + 0.3), su[1] * (fondo + 0.3)];     // il buio, dietro il piano della parete
    tinte.push({ g: blocco(cB, largo / 2 - 0.1, fondo, alto, rotL, piano, rnd, { affonda: 0, inclina: 0 }), c: C.scuro });
    yield* forse();
    // Massi appoggiati alla parete e sopra, perché non sembri un muro.
    for (let k = 0, n = quanti(M.grotta.massi); k < n; k++) {
      const m = fra(M.grotta.masso) * 0.7;
      const t = (rnd() - 0.5) * 2 * (largo / 2 + 4), d = fondo * (0.2 + rnd() * 1.4);
      const c = [lat[0] * t + su[0] * d, lat[1] * t + su[1] * d];
      const grosso = k % 3 === 0;
      const alta = grosso ? H * (0.55 + rnd() * 0.3) : m * (0.5 + rnd() * 0.7);
      roccia(masso(c, (grosso ? m : m * 0.6), alta / 2, (grosso ? m * 0.8 : m * 0.5), piano, rnd, grosso ? 0.1 : 0.3));
    }
    // Sfasciume davanti all'imbocco, questo sì appoggiato al terreno vero.
    for (let k = 0, n = quanti(M.grotta.sfasciume); k < n; k++) {
      const a = rnd() * Math.PI * 2, d = 2 + rnd() * 8;
      const c = [giu[0] * 3 + Math.cos(a) * d, giu[1] * 3 + Math.sin(a) * d], l = 0.35 + rnd() * 0.8;
      roccia(masso(c, l / 2, l / 2 * 0.55, l / 2 * 0.8, terreno, rnd, 0.45));
    }
  } else if (sito.variante === 'cerchio di pietre') {
    // ─── Cerchio di pietre: lastre infisse, un po' storte; una o due cadute ───
    const R = fra(M.cerchio.raggio), n = quanti(M.cerchio.pietre), cad = quanti(M.cerchio.cadute);
    const fase = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = fase + k / n * Math.PI * 2 + (rnd() - 0.5) * 0.14, d = R * (0.94 + rnd() * 0.12);
      const c = [Math.cos(a) * d, Math.sin(a) * d];
      const la = fra(M.cerchio.larga), sp = fra(M.cerchio.spessa), al = fra(M.cerchio.alta);
      if (k < cad) {                                   // caduta: lunga a terra, verso l'esterno
        roccia(blocco(c, al / 2, la / 2, sp, a, terreno, rnd, { affonda: 0.2, inclina: 0.05 }));
      } else {
        roccia(blocco(c, sp / 2, la / 2, al, a + Math.PI / 2, terreno, rnd, { affonda: 0.7, inclina: 0.1 }));
        scatole.push({ cu: c[0], cv: c[1], au: Math.cos(a), av: Math.sin(a), hl: sp / 2, hw: la / 2 });
      }
      yield* forse();
    }
  } else if (sito.variante === 'tumulo') {
    // ─── Tumulo: cupola d'erba, cordolo di pietre, porta di tre lastre a valle ───
    const R = fra(M.tumulo.raggio), H = fra(M.tumulo.alto);
    tinte.push({ g: cupola([0, 0], R, H, M.tumulo.anelli, 24, terreno), c: varia(C.erba, 0.06) });
    const nC = quanti(M.tumulo.cordolo);
    for (let k = 0; k < nC; k++) {
      const a = k / nC * Math.PI * 2, c = [Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02];
      roccia(masso(c, 0.55, 0.45 + rnd() * 0.25, 0.4, terreno, rnd, 0.4));
    }
    yield* forse();
    const P = M.tumulo.porta;
    const cP = [giu[0] * (R * 0.92), giu[1] * (R * 0.92)];
    for (const lato of [1, -1]) {                      // stipiti
      const c = [cP[0] + lat[0] * lato * (P.largo / 2 + 0.3), cP[1] + lat[1] * lato * (P.largo / 2 + 0.3)];
      roccia(blocco(c, 0.3, 0.45, P.alto, Math.atan2(lat[1], lat[0]), terreno, rnd, { affonda: 0.5, inclina: 0.04 }));
    }
    roccia(blocco(cP, P.largo / 2 + 0.9, 0.45, P.alto + 0.45, Math.atan2(lat[1], lat[0]), terreno, rnd, { affonda: 0, inclina: 0.03 }));
    const cB = [cP[0] + su[0] * 0.9, cP[1] + su[1] * 0.9];
    tinte.push({ g: blocco(cB, P.largo / 2 - 0.1, 0.6, P.alto - 0.15, Math.atan2(lat[1], lat[0]), terreno, rnd, { affonda: 0.2, inclina: 0 }), c: C.scuro });
    scatole.push({ cu: 0, cv: 0, au: 1, av: 0, hl: R * 0.8, hw: R * 0.8 });
  } else if (sito.variante === 'albero sacro') {
    // ─── Albero sacro: tronco grosso, chioma a blocchi, sassi e pali con i panni ───
    const T = M.albero.tronco, h = terreno(0, 0);
    const R0 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [i * T.base / 2, j * T.base / 2]);
    const R1 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [i * T.cima / 2, j * T.cima / 2]);
    tinte.push({ g: prisma(R0, R1, h - 0.8, h + T.alto), c: varia(C.legno, 0.08) });
    scatole.push({ cu: 0, cv: 0, au: 1, av: 0, hl: T.base / 2, hw: T.base / 2 });
    const nC = quanti(M.albero.chiome);
    for (let k = 0; k < nC; k++) {
      const a = rnd() * Math.PI * 2, d = k ? 1.2 + rnd() * 2.2 : 0, r = fra(M.albero.chioma);
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.translate(Math.cos(a) * d, h + T.alto + (k ? 0.4 + rnd() * 2.6 : 1.6), Math.sin(a) * d);
      tinte.push({ g, c: varia(C.fronde, 0.16) });
      yield* forse();
    }
    for (let k = 0, n = quanti(M.albero.sassi); k < n; k++) {
      const a = rnd() * Math.PI * 2, d = 2.2 + rnd() * 2.4, l = 0.3 + rnd() * 0.5;
      roccia(masso([Math.cos(a) * d, Math.sin(a) * d], l / 2, l / 2 * 0.6, l / 2 * 0.8, terreno, rnd, 0.4));
    }
    for (let k = 0, n = quanti(M.albero.pali); k < n; k++) {
      const a = rnd() * Math.PI * 2, d = 3.5 + rnd() * 2.5, c = [Math.cos(a) * d, Math.sin(a) * d];
      tinte.push({ g: blocco(c, 0.09, 0.09, 1.7 + rnd() * 0.6, rnd(), terreno, rnd, { affonda: 0.5, inclina: 0.06 }), c: varia(C.legno) });
      const hp = terreno(c[0], c[1]) + 1.5;
      tinte.push({ g: blocco([c[0] + 0.12, c[1]], 0.02, 0.22, 0, rnd(), () => hp, rnd, { affonda: -0.7, inclina: 0 }), c: varia(C.panno, 0.18) });
    }
  } else {
    // ─── Rovine antiche: basamento a gradini, colonne spezzate, due colonne a terra in rocchi ───
    const A = M.antiche, [pl, pf] = A.piano, av = rnd() * Math.PI * 2;
    const dir = [Math.cos(av), Math.sin(av)], nrm = [-dir[1], dir[0]];
    const pt = (du, dv) => [dir[0] * du + nrm[0] * dv, dir[1] * du + nrm[1] * dv];
    const hP = terreno(0, 0);
    for (const [k, g] of [[0, 0], [1, 1]]) {
      const a = pl / 2 + (1 - g) * 0.8, b = pf / 2 + (1 - g) * 0.8;
      const R = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => pt(i * a, j * b));
      muratura.push(prisma(R, R, hP - 1 + g * A.gradino, hP + g * A.gradino + A.gradino));
    }
    const base = hP + 2 * A.gradino;
    const n = quanti(A.colonne), cad = quanti(A.cadute);
    for (let k = 0; k < n; k++) {
      // Lungo i due lati lunghi del basamento, alternate.
      const lato = k % 2 ? 1 : -1, t = (Math.floor(k / 2) + 0.5) / Math.ceil(n / 2);
      const c = pt(-pl / 2 + 1.2 + t * (pl - 2.4), lato * (pf / 2 - 1.2));
      const al = fra(A.alta);
      const R0 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + i * A.colonna / 2, c[1] + j * A.colonna / 2]);
      const R1 = R0.map(([u, v]) => [c[0] + (u - c[0]) * 0.86, c[1] + (v - c[1]) * 0.86]);
      muratura.push(prisma(R0, R1, base - 0.2, [base + al, base + al - 0.12, base + al - 0.2, base + al - 0.08]));
      scatole.push({ cu: c[0], cv: c[1], au: 1, av: 0, hl: A.colonna / 2, hw: A.colonna / 2 });
      yield* forse();
    }
    for (let k = 0; k < cad; k++) {                    // colonne a terra, in rocchi staccati
      const a = av + Math.PI / 2 + (rnd() - 0.5) * 1.2, d = pf / 2 + 2 + rnd() * 4;
      const c0 = [Math.cos(a) * d, Math.sin(a) * d], dd = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];
      for (let j = 0; j < A.rocchi; j++) {
        const c = [c0[0] + dd[0] * j * (A.colonna + 0.25), c0[1] + dd[1] * j * (A.colonna + 0.25)];
        muratura.push(blocco(c, A.colonna / 2, A.colonna / 2, A.colonna, a, terreno, rnd, { affonda: 0.35, inclina: 0.05 }));
      }
    }
  }
  yield;

  const object = new THREE.Group();
  object.name = `${sito.tipo}-${sito.id}`;
  const solidi = [];
  const misure = { case: 0, edifici: 0, chiamate: 0, triangoli: 0 };
  const geoT = unisciTinte(tinte);
  if (geoT) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geoT, m);
    mesh.name = `${object.name}-roccia`;
    object.add(mesh);
    solidi.push(mesh);
    misure.chiamate++;
    misure.triangoli += geoT.attributes.position.count / 3;
  }
  const geoM = unisci(muratura);
  if (geoM) {
    invecchia(geoM, terreno, ox, oz);
    const mesh = new THREE.Mesh(geoM, materialeMuro(new THREE.Color(C.pietraChiara), 0.16));
    mesh.name = `${object.name}-pietra`;
    object.add(mesh);
    solidi.push(mesh);
    misure.chiamate++;
    misure.triangoli += geoM.attributes.position.count / 3;
  }
  yield;
  return { tipo: sito.tipo, sito, object, solidi,
    spingiFuori: spintaDaScatole(scatole, ox, oz, M.raggio + 20), quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: () => {}, sorgenti: [], misure, edifici: [], raggio: M.raggio };
}
