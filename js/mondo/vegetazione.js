// Knight Dawn — vegetazione e oggetti sparsi: posizionamento (milestone in parallelo a M7, passo 1).
// Modulo ES senza Three.js né DOM: gira anche in un Web Worker o in Node. Le mesh stanno in js/3d/vegetazione3d.js.
//
// Due parti:
// 1. `coperturaMondo`: quanto bosco, radura, macchia, roccia, ghiaione e neve c'è in un punto del mondo. È la stessa
//    funzione da cui `coloreMondo` (js/3d/terrain.js) ricava il colore del terreno: alberi e colore dicono la stessa cosa.
// 2. `posizionaVegetazione`: gli oggetti di un blocco. Per ogni tipo una griglia del MONDO a passo proprio; per ogni
//    cella un hash su interi decide se c'è un oggetto, un altro lo sposta dentro la cella, altri ne danno scala,
//    rotazione e variante. Le densità si leggono dai vertici della griglia del blocco, che sta su punti fissi del mondo
//    (centroBlocco in scena.js): due blocchi vicini danno gli stessi oggetti nella zona comune (tranne nei ~30 m dal
//    bordo, dove la pendenza «di zona» del colore non vede oltre il blocco). La quota a cui si posa un oggetto è quella
//    dei triangoli disegnati del blocco (come terrain.getHeight), non quotaFinale: la superficie visibile è la mesh.

import { BIOMA, CLIMA, limiteNevi } from './carta.js';
import { fbm, derivaSeme, smoothstep, hash2 } from './rumore.js';
import { specchio, distanzaPiano } from './scena.js';

// ─── 1. Copertura del terreno (condivisa con il colore) ───────────────────

/** Parametri della copertura: sono quelli del colore del terreno (in terrain.js anche come COLORI_MONDO). */
export const COPERTURA = {
  // Confini tra biomi: ondeggiano di ±350 m (4 ottave: frastagliati fino a ~200 m) e sono netti, non sfumati su
  // tutto il km della cella [richiesto dall'utente: i colori devono dire il terreno, non sfumarsi]. I pesi
  // bilineari delle 4 celle si accentuano con la potenza `nitidezza` (8: passaggio largo ~140 m). Il clima
  // (temperatura, umidità) resta continuo. Lontano la griglia degli anelli ammorbidisce da sola.
  bordo: { spostamento: 350, lunghezza: 1600, ottave: 4, nitidezza: 8 },
  roccia: [35, 41],                               // gradi: dal prato (o bosco) alla roccia (prima 32–44: sfumato)
  rocciaBosco: [41, 47],
  rocciaAlta: [21, 27],                           // gradi, sopra il limite degli alberi e nei biomi di montagna
  affioramenti: { lunghezza: 90, soglia: [0.27, 0.35], pendenza: [15, 26] },   // chiazze di roccia sui pendii medi
  ghiaioni: { sotto: [3, 6], quanto: 0.25 },      // °C sotto il limite degli alberi: detriti anche sui pendii dolci
  scalaPendenza: 62.5,                            // m: pendenza per il colore su questa scala (come l'orizzonte vicino)
  toni: { lunghezza: 140 },                       // roccia chiara e scura
  neve: { fascia: 30, ondeggia: 90, lunghezza: 500, pendenza: [30, 42] },   // m, gradi
  variazione: { lunghezza: 180, ampiezza: 0.08 },
  tono: { lunghezza: 700, ampiezza: 0.45 },        // macchie ampie più verdi o più secche
  macchia: [14, 28, 0.35],                          // gradi, quanto: sui pendii cespugli più scuri
  radure: { lunghezza: 260, soglia: -0.3 },        // nel bosco, dove il rumore è basso
};

const STAGIONI = ['primavera', 'estate', 'autunno', 'inverno'];

/** Esito vuoto di una copertura (da riusare: niente allocazioni per punto). */
export function nuovaCopertura() {
  return {
    bi: new Uint8Array(4), w: new Float64Array(4),   // biomi delle 4 celle vicine e pesi (bilineare)
    t0: 0, T: 0, umidita: 0, bosco: 0, neveFissa: 0, monte: 0,
    radura: 0, alpeggio: 0, tono: 0, macchia: 0, alto: 0, chiazze: 0, roccia: 0, ghiaia: 0, tonoRoccia: 0,
    variazione: 1, neve: 0,
  };
}

/**
 * Copertura del mondo generato in un punto (x, z in metri, quota h, pendenza «di zona» in gradi).
 * Le formule e l'ordine delle operazioni sono quelli che coloreMondo usava per il colore: il colore non cambia.
 * @returns {(out: object, x: number, z: number, h: number, pendenza: number) => object}
 */
export function coperturaMondo(carta, stagione = 0) {
  const K = COPERTURA, { cols, rows, cella, bioma, temperaturaMare, umidita } = carta;
  const nomeStagione = STAGIONI[stagione] ?? 'primavera';
  const s1 = derivaSeme(carta.seme, 301), s2 = derivaSeme(carta.seme, 302), s3 = derivaSeme(carta.seme, 303);
  const s4 = derivaSeme(carta.seme, 304), s5 = derivaSeme(carta.seme, 305);
  const nitidi = new Float64Array(4);
  return (out, x, z, h, pendenza) => {
    // Confini irregolari: si legge la Carta in un punto spostato da un rumore.
    const bx = x + K.bordo.spostamento * fbm(x, z, s1, K.bordo.lunghezza, K.bordo.ottave);
    const bz = z + K.bordo.spostamento * fbm(x, z, s2, K.bordo.lunghezza, K.bordo.ottave);
    const u = bx / cella - 0.5, v = bz / cella - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    let t0 = 0, bosco = 0, neveFissa = 0, monte = 0, umid = 0, n = 0;
    for (let b = 0; b < 2; b++) {
      const j = specchio(j0 + b, rows);
      for (let a = 0; a < 2; a++) {
        const i = specchio(i0 + a, cols), k = j * cols + i;
        const w = (a ? fu : 1 - fu) * (b ? fv : 1 - fv);
        out.bi[n] = bioma ? bioma[k] : BIOMA.PIANURA; out.w[n] = w; n++;
        t0 += (temperaturaMare ? temperaturaMare[k] : 10) * w;
        umid += (umidita ? umidita[k] : 0.5) * w;
      }
    }
    // Confini netti: peso di ciascun bioma (somma delle celle uguali) alla potenza `nitidezza`, poi normalizzato.
    // Le celle dello stesso bioma si spartiscono il suo peso in proporzione al bilineare.
    let somma = 0;
    for (let a = 0; a < 4; a++) {
      let wb = 0;
      for (let b = 0; b < 4; b++) if (out.bi[b] === out.bi[a]) wb += out.w[b];
      nitidi[a] = wb > 0 ? Math.pow(wb, K.bordo.nitidezza - 1) * out.w[a] : 0;
      somma += nitidi[a];
    }
    for (let a = 0; a < 4; a++) {
      const w = (out.w[a] = nitidi[a] / somma), bi = out.bi[a];
      if (bi === BIOMA.FORESTA) bosco += w;
      if (bi === BIOMA.NEVE || bi === BIOMA.GHIACCIO) neveFissa += w;
      if (bi === BIOMA.ROCCIA) monte += w; else if (bi === BIOMA.MONTAGNA) monte += 0.5 * w;
    }
    const T = t0 - CLIMA.gradiente * h;
    out.t0 = t0; out.T = T; out.umidita = umid; out.bosco = bosco; out.neveFissa = neveFissa; out.monte = monte;
    // Radure nel bosco; sopra il limite degli alberi il bosco lascia il posto agli alpeggi.
    out.radura = 0; out.alpeggio = 0;
    if (bosco > 0) {
      out.radura = smoothstep(K.radure.soglia, K.radure.soglia - 0.2, fbm(x, z, s4, K.radure.lunghezza, 2));
      if (T < CLIMA.bosco + 1) out.alpeggio = smoothstep(CLIMA.bosco + 1, CLIMA.bosco - 1, T);
    }
    // Toni ampi (più verde o più secco) e macchia sui pendii.
    out.tono = K.tono.ampiezza * fbm(x, z, s3 ^ 0x5bd1, K.tono.lunghezza, 2);
    out.macchia = smoothstep(K.macchia[0], K.macchia[1], pendenza);
    // Roccia: pareti e pendii ripidi (nel bosco un po' più tardi); sopra il limite degli alberi e nei biomi di
    // montagna già dai pendii medi, con affioramenti a chiazze e, più in alto, ghiaioni anche sul dolce.
    const alto = Math.max(smoothstep(CLIMA.bosco + 2, CLIMA.bosco - 2, T), monte);
    const R = bosco > 0.5 ? K.rocciaBosco : K.roccia;
    const r0 = R[0] + (K.rocciaAlta[0] - R[0]) * alto, r1 = R[1] + (K.rocciaAlta[1] - R[1]) * alto;
    let roccia = smoothstep(r0, r1, pendenza);
    const A = K.affioramenti;
    const chiazze = smoothstep(A.soglia[0], A.soglia[1], fbm(x, z, s1 ^ 0x2c1b, A.lunghezza, 3))
      * smoothstep(A.pendenza[0], A.pendenza[1], pendenza) * (0.35 + 0.65 * alto);
    roccia = Math.max(roccia, chiazze);
    out.alto = alto; out.chiazze = chiazze; out.roccia = roccia;
    out.ghiaia = K.ghiaioni.quanto * smoothstep(CLIMA.bosco - K.ghiaioni.sotto[0], CLIMA.bosco - K.ghiaioni.sotto[1], T);
    out.tonoRoccia = roccia > 0 ? 0.5 + 0.5 * fbm(x, z, s2 ^ 0x77e1, K.toni.lunghezza, 2) : 0;
    // Variazione lenta di luminosità (niente distese piatte, niente chiazze a triangoli).
    out.variazione = 1 + K.variazione.ampiezza * fbm(x, z, s3, K.variazione.lunghezza, 2);
    // Neve: sopra il limite della stagione (ondeggiante), non sui pendii più ripidi; sempre sulla neve perenne.
    const limite = limiteNevi(t0, nomeStagione) + K.neve.ondeggia * fbm(x, z, s5, K.neve.lunghezza, 2);
    const neve = smoothstep(limite - K.neve.fascia, limite + K.neve.fascia, h);
    out.neve = Math.max(neve, neveFissa) * (1 - smoothstep(K.neve.pendenza[0], K.neve.pendenza[1], pendenza));
    return out;
  };
}

/**
 * Copertura della scena di prova di Tavullia (niente Carta né biomi): profilo fisso di collina temperata, con il
 * bosco e la roccia dove il colore di Tavullia li dipinge (pendenze 13–24° e 30–40°, terrain.js).
 */
export function coperturaTavullia() {
  return (out, x, z, h, pendenza) => {
    out.bi.fill(BIOMA.COLLINA); out.w.fill(0.25);
    out.t0 = 13; out.T = 13 - CLIMA.gradiente * h; out.umidita = 0.55;
    out.bosco = smoothstep(13, 24, pendenza); out.neveFissa = 0; out.monte = 0;
    out.radura = 0; out.alpeggio = 0; out.tono = 0;
    out.macchia = smoothstep(9, 16, pendenza);
    out.alto = 0; out.chiazze = 0; out.roccia = smoothstep(30, 40, pendenza); out.ghiaia = 0; out.tonoRoccia = 0;
    out.variazione = 1; out.neve = 0;
    return out;
  };
}

// ─── 2. Posizionamento degli oggetti ─────────────────────────────────────

/**
 * Tipi di oggetto. `passo`: lato della cella della griglia del mondo (m), al più un oggetto per cella.
 * `gruppo`: alberi (una griglia sola, i tipi si contendono la cella), arbusti, acqua, rocce, bosco.
 * `scala`: intervallo della scala casuale. Le densità sono in `densitaVertice`.
 */
export const TIPI = [
  // Età diverse (richiesta dell'utente: alberi tutti uguali): molti giovani e bassi, pochi vecchi molto alti.
  { nome: 'latifoglia', gruppo: 'alberi', scala: [0.45, 1.45], curva: 1.4 },
  { nome: 'conifera', gruppo: 'alberi', scala: [0.4, 1.5], curva: 1.4 },
  { nome: 'pino', gruppo: 'alberi', scala: [0.55, 1.3], curva: 1.2 },
  { nome: 'riva', gruppo: 'alberi', scala: [0.55, 1.3], curva: 1.2 },
  { nome: 'secco', gruppo: 'alberi', scala: [0.5, 1.15] },
  { nome: 'cespuglio', gruppo: 'arbusti', passo: 4, scala: [0.6, 1.4] },
  { nome: 'arbusto alto', gruppo: 'arbusti', passo: 4, scala: [0.6, 1.3] },
  { nome: 'sterpo', gruppo: 'arbusti', passo: 5, scala: [0.6, 1.2] },
  { nome: 'canne', gruppo: 'acqua', passo: 3, scala: [0.7, 1.3] },
  // Rocce (richiesta dell'utente): misure molto varie, tante piccole e poche enormi (`curva`: esponente della scala).
  { nome: 'sasso', gruppo: 'rocce', passo: 4, scala: [0.2, 2.2], curva: 2 },
  { nome: 'masso', gruppo: 'rocce', passo: 16, scala: [0.4, 3.4], curva: 2.5 },
  { nome: 'affioramento', gruppo: 'rocce', passo: 40, scala: [0.7, 1.5] },
  { nome: 'tronco', gruppo: 'bosco', passo: 15, scala: [0.7, 1.2] },
];
export const STRIDE = 6;                 // per oggetto: x, quota, z (locali al blocco), scala, rotazione, variante

/** Parametri del posizionamento ([Ipotesi] da tarare guardando). */
export const VEGETAZIONE = {
  passoAlberi: 6,                        // m: un albero al più ogni cella di 6×6 m
  // Bosco: ~0,62 alberi per cella di 6×6 m (≈ 170 alberi per ettaro; 0,9 provato e scartato: troppo carico).
  bosco: { soglia: [0.32, 0.62], bordo: { lunghezza: 90, ampiezza: 0.12 }, densita: 0.62 },
  // Boschi di versante (deciso con l'utente): a macchie sui pendii di collina e montagna che non si coltivano,
  // sotto il limite degli alberi e dove non è secco. Pendenza «di zona» (come il colore), gradi.
  versante: { pendenza: [15, 22], troppo: [34, 40], lunghezza: 350, soglia: [-0.05, 0.2], umidita: [0.3, 0.45] },
  // Alberi isolati veri (deciso con l'utente): uno ogni ~100–150 m nei prati.
  isolati: { base: 0.0012, umidita: 0.0025 },
  limiteAlberi: [-0.5, 2],               // °C attorno a CLIMA.bosco: gli alberi si diradano e si abbassano
  pendenza: { alberi: [30, 40], arbusti: [36, 46], pareti: 48 },   // gradi (pendenza fine della mesh)
  riva: { celle: [1, 3], densita: 0.22, canne: 0.35 },             // celle di 7,8 m dall'acqua
  spianata: 20,                          // m oltre la scarpata dei terrapieni: niente alberi né arbusti
  acquaCelle: 4,                         // distanza dall'acqua misurata fino a 4 celle
  // Solo vicino al cavaliere (erbaAttorno): probabilità per cella di 0,6 m (erba) e di 2 m (felci).
  vicino: { erba: 0.75, felce: 0.45, ciottolo: 1, passoErba: 0.6, passoFelci: 2, passoCiottoli: 1.5 },
};

const _cop = nuovaCopertura();

/**
 * Densità per vertice della griglia del blocco: per ogni tipo la probabilità che una cella della sua griglia abbia
 * un oggetto, più i pesi delle specie di albero. `pend` è la pendenza «di zona» (come il colore), `pf` quella fine.
 */
function densitaVertice(cp, pend, pf, distAcqua, x, z, semeBordo, D, i) {
  const V = VEGETAZIONE;
  const prato = 1 - Math.max(cp.roccia, cp.neve, cp.ghiaia * 2);
  let sabbia = 0, palude = 0, nordSud = 0;
  for (let k = 0; k < 4; k++) {
    const b = cp.bi[k], w = cp.w[k];
    if (b === BIOMA.SABBIA) sabbia += w;
    else if (b === BIOMA.PALUDE) palude += w;
    else if (b === BIOMA.PIANURA_N || b === BIOMA.PIANURA_S) nordSud += w;
  }
  // Bosco: lo stesso «quanto bosco» del colore (radure, alpeggi), con bordi organici e non a righello.
  const vista = cp.bosco * (1 - 0.8 * cp.radura) * (1 - cp.alpeggio);
  const e = cp.bosco > 0 ? V.bosco.bordo.ampiezza * fbm(x, z, semeBordo, V.bosco.bordo.lunghezza, 2) : 0;
  // Boschi di versante: anche fuori dal bosco della Carta, sui pendii (non in sabbia, palude, neve).
  const W = V.versante;
  let versante = smoothstep(W.pendenza[0], W.pendenza[1], pend) * (1 - smoothstep(W.troppo[0], W.troppo[1], pend));
  if (versante > 0) {
    versante *= smoothstep(W.umidita[0], W.umidita[1], cp.umidita) * (1 - sabbia) * (1 - palude) * (1 - cp.neveFissa)
      * smoothstep(W.soglia[0], W.soglia[1], fbm(x, z, semeBordo ^ 0x3c6ef372, W.lunghezza, 2));
  }
  const foresta = Math.max(smoothstep(V.bosco.soglia[0], V.bosco.soglia[1], vista + e), versante);
  const limite = smoothstep(CLIMA.bosco + V.limiteAlberi[0], CLIMA.bosco + V.limiteAlberi[1], cp.T);
  const ripido = 1 - smoothstep(V.pendenza.alberi[0], V.pendenza.alberi[1], pf);
  const riva = distAcqua >= V.riva.celle[0] && distAcqua <= V.riva.celle[1] && cp.T > 3 ? 1 : 0;
  const isolati = (V.isolati.base + V.isolati.umidita * cp.umidita) * (1 - foresta) * prato * (1 - 0.8 * sabbia);
  const asciutto = distAcqua >= 1 ? 1 : 0;
  D.alberi[i] = asciutto * (1 - cp.neveFissa) * (1 - cp.roccia) * (1 - 0.8 * cp.ghiaia) * ripido * limite
    * Math.max(V.bosco.densita * foresta, isolati, riva * V.riva.densita, 0.04 * palude);
  D.limite[i] = limite;
  D.conifera[i] = Math.max(smoothstep(8, 3, cp.T), 0.6 * cp.monte);
  D.pino[i] = smoothstep(12, 16, cp.T) * smoothstep(0.55, 0.35, cp.umidita);
  D.secco[i] = 0.5 * palude + 0.15 * sabbia;
  D.riva[i] = riva * 0.8;
  // Arbusti: macchia sui pendii (dove il colore la dipinge), margini e sottobosco, prati; sopra il limite degli
  // alberi ginepri e mughi; nel secco sterpi.
  const neve = 1 - cp.neve;
  const arb = asciutto * neve * (1 - 0.7 * cp.roccia) * (1 - smoothstep(V.pendenza.arbusti[0], V.pendenza.arbusti[1], pf));
  const macchia = (1 - cp.bosco) * (1 - cp.neveFissa) * cp.macchia;
  D.cespuglio[i] = arb * limite * (0.1 * macchia + 0.5 * foresta * (1 - foresta) + 0.04 * foresta + 0.008 * prato);
  D.alto[i] = arb * 0.07 * smoothstep(CLIMA.bosco + 2.5, CLIMA.bosco, cp.T) * smoothstep(CLIMA.bosco - 4, CLIMA.bosco - 1.5, cp.T);
  D.sterpo[i] = arb * 0.05 * Math.min(1, sabbia + 0.5 * nordSud * (cp.umidita < 0.45 ? 1 : 0.3));
  D.canne[i] = (distAcqua >= 1 && distAcqua <= 2 && cp.T > 4 ? V.riva.canne : 0) + 0.1 * palude * asciutto;
  // Rocce: dove il colore dipinge roccia, ghiaioni e chiazze; ai piedi delle pareti; poche ovunque.
  const piede = smoothstep(30, 45, pf);
  // Frane: macchie (rumore su ~200 m) ai piedi dei pendii ripidi in montagna e sopra il limite degli alberi, con massi
  // più fitti e più grandi (fino a ~8 m) da girarci attorno.
  const monte = Math.max(cp.alto, cp.monte);
  D.frana[i] = asciutto * smoothstep(22, 38, pf) * monte * smoothstep(0.05, 0.35, fbm(x, z, semeBordo ^ 0x1b873593, 200, 2));
  D.sasso[i] = asciutto * (1 - 0.7 * cp.neve) * (0.015 + 0.25 * cp.roccia + 1.4 * cp.ghiaia + 0.15 * piede + 0.12 * monte
    + 0.3 * D.frana[i]);
  D.masso[i] = asciutto * (1 - 0.5 * cp.neve) * (0.015 + 2 * cp.ghiaia + 0.3 * cp.roccia * cp.alto + 0.25 * piede
    + 0.05 * monte + 0.7 * D.frana[i]);
  D.ciottolo[i] = asciutto * (1 - 0.8 * cp.neve) * Math.min(0.5, 0.02 + 0.3 * cp.roccia + 1.2 * cp.ghiaia + 0.15 * monte
    + 0.2 * piede) * V.vicino.ciottolo;
  D.affioramento[i] = asciutto * (0.7 * cp.chiazze + 0.1 * cp.roccia);
  D.tronco[i] = asciutto * 0.06 * foresta * limite;
  // Vicino al cavaliere (erbaAttorno): ciuffi d'erba nei prati, felci nel sottobosco umido. E per il suolo (shader del
  // terreno): quanto bosco c'è sopra (lettiera).
  D.foresta[i] = foresta * limite * (1 - cp.roccia);
  D.erba[i] = asciutto * neve * (1 - cp.roccia) * Math.max(0, 1 - 2 * cp.ghiaia) * (1 - 0.95 * foresta) * (1 - 0.7 * sabbia)
    * (1 - smoothstep(38, 46, pf)) * V.vicino.erba;
  D.felce[i] = asciutto * neve * foresta * limite * smoothstep(0.3, 0.55, cp.umidita) * V.vicino.felce;
}

/**
 * Oggetti del blocco.
 * @param {object} o
 * @param {Float32Array} o.heights  quote dei vertici (riga per riga da nord), griglia quadrata cols × cols
 * @param {number} o.cols  @param {number} o.cell  passo dei vertici (m)
 * @param {number} o.cx  @param {number} o.cz  centro del blocco nel mondo (m; per i blocchi del mondo multiplo di cell)
 * @param {{fiume: Float32Array, lago: Float32Array}|null} o.acqua  pelo dell'acqua per vertice (NaN = asciutto)
 * @param {Function} o.copertura  coperturaMondo(carta) o coperturaTavullia()
 * @param {number} o.seme  seme del mondo
 * @param {Array} o.piani  terrapieni (come carta.luoghi[].piani, coordinate del mondo): niente oggetti dentro né sulla scarpata
 * @param {boolean} [o.mare]  true: sotto quota 0,3 m è mare
 * @returns {{ tipi: Object<string, {dati: Float32Array, n: number, gruppo: string}>, ms: number, msCampi: number }}
 */
export function posizionaVegetazione(o) {
  const t0 = performance.now();
  const { heights, cols, cell, cx, cz, copertura, seme } = o;
  const V = VEGETAZIONE, n = cols * cols, half = cell * (cols - 1) / 2;
  const H = (c, r) => heights[(r < 0 ? 0 : r >= cols ? cols - 1 : r) * cols + (c < 0 ? 0 : c >= cols ? cols - 1 : c)];

  // Acqua: vertici bagnati (alveo dei fiumi e dei torrenti, laghi, mare) e distanza in celle (8 vicini).
  const dist = new Uint8Array(n).fill(V.acquaCelle);
  const coda = [];
  for (let i = 0; i < n; i++) {
    const h = heights[i];
    const f = o.acqua ? o.acqua.fiume[i] : NaN, l = o.acqua ? o.acqua.lago[i] : NaN;
    if ((o.mare && h < 0.3) || f > h - 0.05 || l > h - 0.05) { dist[i] = 0; coda.push(i); }
  }
  for (let q = 0; q < coda.length; q++) {
    const i = coda[q], d = dist[i] + 1;
    if (d >= V.acquaCelle) continue;
    const r = (i / cols) | 0, c = i - r * cols;
    for (let b = -1; b <= 1; b++) {
      for (let a = -1; a <= 1; a++) {
        const rr = r + b, cc = c + a;
        if (rr < 0 || cc < 0 || rr >= cols || cc >= cols) continue;
        const j = rr * cols + cc;
        if (dist[j] > d) { dist[j] = d; coda.push(j); }
      }
    }
  }

  // Densità per vertice.
  const D = {};
  for (const k of ['alberi', 'limite', 'conifera', 'pino', 'secco', 'riva', 'cespuglio', 'alto', 'sterpo', 'canne',
    'sasso', 'masso', 'affioramento', 'tronco', 'foresta', 'erba', 'felce', 'frana', 'ciottolo']) D[k] = new Float32Array(n);
  const kz = Math.max(1, Math.round(COPERTURA.scalaPendenza / (2 * cell)));   // pendenza di zona, come il colore
  const semeBordo = derivaSeme(seme, 401);
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sx = (H(c + kz, r) - H(c - kz, r)) / (2 * kz * cell), sz = (H(c, r + kz) - H(c, r - kz)) / (2 * kz * cell);
      const pend = Math.atan(Math.hypot(sx, sz)) * 180 / Math.PI;
      const fx = (H(c + 1, r) - H(c - 1, r)) / (2 * cell), fz = (H(c, r + 1) - H(c, r - 1)) / (2 * cell);
      const pf = Math.atan(Math.hypot(fx, fz)) * 180 / Math.PI;
      const x = cx - half + c * cell, z = cz - half + r * cell;
      copertura(_cop, x, z, heights[i], pend);
      densitaVertice(_cop, pend, pf, dist[i], x, z, semeBordo, D, i);
    }
  }
  const msCampi = performance.now() - t0;

  // Lettura dei campi in un punto locale: bilineare sui vertici; quota e pendenza sul triangolo disegnato.
  let _c = 0, _r = 0, _u = 0, _v = 0;
  const trova = (lx, lz) => {
    let fx = (lx + half) / cell, fz = (lz + half) / cell;
    fx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx;
    fz = fz < 0 ? 0 : fz > cols - 1 ? cols - 1 : fz;
    _c = Math.min(Math.floor(fx), cols - 2); _r = Math.min(Math.floor(fz), cols - 2);
    _u = fx - _c; _v = fz - _r;
  };
  const campo = (A) => {
    const i = _r * cols + _c;
    return (A[i] * (1 - _u) + A[i + 1] * _u) * (1 - _v) + (A[i + cols] * (1 - _u) + A[i + cols + 1] * _u) * _v;
  };
  const quota = () => {
    const i = _r * cols + _c, a = heights[i], b = heights[i + 1], d = heights[i + cols], e = heights[i + cols + 1];
    return _u + _v <= 1 ? a + (b - a) * _u + (d - a) * _v : e + (d - e) * (1 - _u) + (b - e) * (1 - _v);
  };
  const pendenzaFine = () => {
    const i = _r * cols + _c, a = heights[i], b = heights[i + 1], d = heights[i + cols], e = heights[i + cols + 1];
    const gx = _u + _v <= 1 ? (b - a) / cell : (e - d) / cell, gz = _u + _v <= 1 ? (d - a) / cell : (e - b) / cell;
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  };
  const asciutta = () => {                // i 4 vertici della cella fuori dall'acqua
    const i = _r * cols + _c;
    return dist[i] > 0 && dist[i + 1] > 0 && dist[i + cols] > 0 && dist[i + cols + 1] > 0;
  };

  // Terrapieni: distanza (m) oltre la scarpata del piano più vicino (negativa dentro piano o scarpata).
  const piani = (o.piani || []).filter((p) => {
    const R = Math.max(p.a, p.b) + p.s + V.spianata;
    return Math.abs(p.cx - cx) < half + R && Math.abs(p.cz - cz) < half + R;
  });
  const oltreScarpata = (X, Z) => {
    let m = Infinity;
    for (const p of piani) {
      const d = distanzaPiano(p, X, Z) - p.s;
      if (d < m) m = d;
    }
    return m;
  };

  const buffer = {};
  for (const t of TIPI) buffer[t.nome] = [];
  const emetti = (t, ix, iz, sm, lx, lz, y, fattoreScala) => {
    const h = hash2(ix, iz, sm ^ 0x2545f491);
    const s = t.scala[0] + (t.scala[1] - t.scala[0]) * ((h & 0xffff) / 65536) ** (t.curva || 1);
    buffer[t.nome].push(lx, y, lz, s * fattoreScala, ((h >>> 16) & 0x3ff) / 1024 * 2 * Math.PI, (h >>> 26) / 64);
  };

  // Una griglia del mondo di passo P: chiama f(ix, iz, X, Z, lx, lz, u) per ogni cella con il suo punto spostato.
  const griglia = (P, sm, f) => {
    const i0 = Math.ceil((cx - half) / P) - 1, i1 = Math.floor((cx + half) / P);
    const j0 = Math.ceil((cz - half) / P) - 1, j1 = Math.floor((cz + half) / P);
    for (let iz = j0; iz <= j1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const u = hash2(ix, iz, sm) / 4294967296;
        const hj = hash2(ix, iz, sm ^ 0x9e3779b9);
        const X = (ix + (hj & 0xffff) / 65536) * P, Z = (iz + (hj >>> 16) / 65536) * P;
        const lx = X - cx, lz = Z - cz;
        if (lx < -half || lx > half || lz < -half || lz > half) continue;
        f(ix, iz, X, Z, lx, lz, u);
      }
    }
  };

  const T = Object.fromEntries(TIPI.map((t) => [t.nome, t]));
  // Alberi: una griglia sola; la specie si sceglie per peso con un altro hash.
  const sA = derivaSeme(seme, 410);
  griglia(V.passoAlberi, sA, (ix, iz, X, Z, lx, lz, u) => {
    trova(lx, lz);
    const p = campo(D.alberi);
    if (u >= p || !asciutta()) return;
    const pf = pendenzaFine();
    if (pf > V.pendenza.alberi[1] || oltreScarpata(X, Z) < V.spianata) return;
    const wc = campo(D.conifera), wp = campo(D.pino), ws = campo(D.secco), wr = campo(D.riva);
    const wl = Math.max(0, 1 - wc - wp) * (1 - wr);
    const tot = wl + wc + wp + ws + wr;
    let v = (hash2(ix, iz, sA ^ 0x68e31da4) / 4294967296) * tot;
    const tipo = (v -= wr) < 0 ? T.riva : (v -= ws) < 0 ? T.secco : (v -= wc) < 0 ? T.conifera : (v -= wp) < 0 ? T.pino : T.latifoglia;
    emetti(tipo, ix, iz, sA, lx, lz, quota(), 0.55 + 0.45 * campo(D.limite));
  });
  // Gli altri tipi: ognuno la sua griglia.
  const regole = {
    cespuglio: D.cespuglio, 'arbusto alto': D.alto, sterpo: D.sterpo, canne: D.canne,
    sasso: D.sasso, masso: D.masso, affioramento: D.affioramento, tronco: D.tronco,
  };
  TIPI.forEach((t, k) => {
    if (t.gruppo === 'alberi') return;
    const sm = derivaSeme(seme, 420 + k), A = regole[t.nome];
    const vegetale = t.gruppo !== 'rocce';
    griglia(t.passo, sm, (ix, iz, X, Z, lx, lz, u) => {
      trova(lx, lz);
      if (u >= campo(A)) return;
      if (t.nome !== 'canne' && !asciutta()) return;
      const pf = pendenzaFine();
      if (pf > V.pendenza.pareti) return;
      const oltre = oltreScarpata(X, Z);
      if (oltre < 0 || (vegetale && oltre < V.spianata)) return;
      emetti(t, ix, iz, sm, lx, lz, quota(), t.nome === 'masso' ? 1 + 1.2 * campo(D.frana) : 1);
    });
  });

  const tipi = {};
  for (const t of TIPI) {
    const b = buffer[t.nome];
    tipi[t.nome] = { dati: Float32Array.from(b), n: b.length / STRIDE, gruppo: t.gruppo };
  }
  // Suolo per lo shader del terreno: per vertice [bosco sopra, vicinanza dell'acqua (1 nell'acqua, 0 oltre 4 celle)].
  // Niente lettiera nella spianata attorno a rocca e borgo (lì non ci sono alberi): sfuma in 30 m.
  const suolo = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const r = (i / cols) | 0, c = i - r * cols;
    const oltre = piani.length ? oltreScarpata(cx - half + c * cell, cz - half + r * cell) : Infinity;
    suolo[i * 2] = D.foresta[i] * smoothstep(V.spianata, V.spianata + 30, oltre);
    suolo[i * 2 + 1] = dist[i] === 0 ? 1 : Math.max(0, 1 - (dist[i] - 1) / (V.acquaCelle - 1));
  }

  /**
   * Erba, felci e ciottoli in un cerchio attorno a (lx, lz) locali, raggio per tipo ({erba, felce, ciottolo}) o unico: stesse regole (griglie del mondo, hash) del resto,
   * quindi tornando in un punto si ritrovano gli stessi ciuffi. Formato come `tipi` (STRIDE per oggetto).
   */
  const sE = derivaSeme(seme, 450), sF = derivaSeme(seme, 451), sC = derivaSeme(seme, 452);
  function erbaAttorno(lx0, lz0, raggi) {
    const esito = {};
    for (const [nome, P, sm, A] of [['erba', V.vicino.passoErba, sE, D.erba], ['felce', V.vicino.passoFelci, sF, D.felce],
      ['ciottolo', V.vicino.passoCiottoli, sC, D.ciottolo]]) {
      const b = [], r = typeof raggi === 'number' ? raggi : raggi[nome] ?? 0;
      if (r <= 0) { esito[nome] = { dati: new Float32Array(0), n: 0 }; continue; }
      const X0 = cx + lx0, Z0 = cz + lz0;
      const i0 = Math.floor((X0 - r) / P), i1 = Math.floor((X0 + r) / P);
      const j0 = Math.floor((Z0 - r) / P), j1 = Math.floor((Z0 + r) / P);
      for (let iz = j0; iz <= j1; iz++) {
        for (let ix = i0; ix <= i1; ix++) {
          const hj = hash2(ix, iz, sm ^ 0x9e3779b9);
          const X = (ix + (hj & 0xffff) / 65536) * P, Z = (iz + (hj >>> 16) / 65536) * P;
          const lx = X - cx, lz = Z - cz, dx = lx - lx0, dz = lz - lz0;
          if (dx * dx + dz * dz > r * r || lx < -half || lx > half || lz < -half || lz > half) continue;
          trova(lx, lz);
          if (hash2(ix, iz, sm) / 4294967296 >= campo(A) || !asciutta()) continue;
          const oltre = oltreScarpata(X, Z);
          if (oltre < 0 || (nome === 'felce' && oltre < V.spianata)) continue;
          const h = hash2(ix, iz, sm ^ 0x2545f491);
          b.push(lx, quota(), lz, 0.7 + 0.6 * ((h & 0xffff) / 65536), ((h >>> 16) & 0x3ff) / 1024 * 2 * Math.PI, (h >>> 26) / 64);
        }
      }
      esito[nome] = { dati: Float32Array.from(b), n: b.length / STRIDE };
    }
    return esito;
  }

  return { tipi, ms: performance.now() - t0, msCampi, suolo, erbaAttorno };
}
