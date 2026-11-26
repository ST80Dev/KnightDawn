// Knight Dawn — siti di villaggi e luoghi speciali del mondo generato (M8, passo 1: «Siti sulla Carta»).
// Modulo ES senza grafica né DOM (regola 9): gira nel Worker dopo le rocche (luoghi.js) e scrive nella Carta, che
// finisce nella cache con VERSIONE_GENERATORE. Piano: docs/ESPLORAZIONE_3D.md, «M8 — Luoghi del mondo».
//
// Due fasi:
//   1. `aggiungiSiti` (prima delle strade): una parte delle rocche diventa monastero o città (`luogo.tipo`, mai la
//      partenza); villaggi, rovine, luoghi abbandonati, grotte, eremi, luoghi del fantastico, sentinelle e ospizi
//      dei valichi, ovili. I villaggi diventano nodi della rete delle strade (strade.js).
//   2. `completaSiti` (dopo le strade): accampamenti di mercanti e soldati lungo le strade, di briganti nei boschi.
//
// Scelta di un tipo: ogni cella della Carta (1 km) ha un punteggio dalle regole del tipo (quota, bioma, asprezza,
// acqua, distanza dalle rocche); un poco di rumore (hash) evita che vincano sempre le stesse celle; poi si prendono
// le migliori rispettando le distanze minime (dal proprio tipo e da tutti i siti già scelti). Dentro la cella il
// punto si affina sul rilievo delle Scene (quotaMondo): il più piano per villaggi ed eremi, il più alto per rovine
// e luoghi del fantastico, il più ripido (non parete) per le grotte.
// Solo operazioni dal risultato esatto (+ − × ÷, sqrt, floor) e hash su interi: uguale in ogni browser.

import { ACQUA, BIOMA } from './carta.js';
import { quotaMondo, distanzaAcqua } from './scena.js';
import { derivaSeme, hash2 } from './rumore.js';
import { distanzaDa } from './verifica.js';
import { ripianificaLuogo } from './luoghi.js';

const B = BIOMA;
const ABITABILI = [B.PIANURA, B.PIANURA_N, B.PIANURA_S, B.FORESTA, B.COLLINA];

export const SITI = {
  bordo: 4,                         // km dal bordo della Carta
  // Rocche che cambiano tipo (decisione dell'utente: monasteri e città ricavati dalle rocche, i luoghi maggiori
  // restano 30–40). Monasteri isolati e in alto; città in basso, sull'acqua (fiume, lago, costa).
  monasteri: { numero: [4, 6], distanza: 20 },
  citta: { numero: [2, 4], distanza: 30, quota: 500 },
  // Tipi (quantità [min, max] per mondo; distanze minime in km dal proprio tipo, da tutti i siti, dalle rocche).
  tipi: {
    // Quantità alzate su richiesta dell'utente (M6 aveva misurato un villaggio ogni 126 km², mediana 4,9 km fra
    // l'uno e l'altro): il mondo sembrava spoglio. Con `proprio` a 4,5 km non ci stavano 300 villaggi, qualunque
    // numero si chiedesse: la distanza minima fra due villaggi è il vero limite, non il numero.
    villaggio: { numero: [250, 300], proprio: 1.8, altri: 1, rocche: 1.6, quota: [0, 1700], inQuota: 0.25 },
    mulino: { numero: [30, 50], proprio: 3, altri: 0.7, rocche: 1.2, quota: [0, 1100] },
    rovina: { numero: [15, 20], proprio: 7, altri: 2, rocche: 3, quota: [0, 2200],
      varianti: ['castello', 'torre', 'chiesa', 'villaggio'] },
    abbandonato: { numero: [10, 15], proprio: 8, altri: 2, rocche: 3, quota: [0, 1600],
      varianti: ['torre', 'maniero', 'casale'] },
    grotta: { numero: [10, 15], proprio: 7, altri: 1.5, rocche: 2, quota: [200, 2600] },
    eremo: { numero: [6, 10], proprio: 10, altri: 2, rocche: 3, quota: [300, 2000] },
    fantastico: { numero: [8, 12], proprio: 9, altri: 2, rocche: 4, quota: [0, 2400],
      varianti: ['cerchio di pietre', 'tumulo', 'albero sacro', 'rovine antiche'] },
    ovile: { perRocca: [1, 2], entro: [2, 4], sparsi: [34, 48], proprio: 1.8, altri: 1, rocche: 1.2, quota: [0, 1900] },
    accampamento: { numero: [8, 12], proprio: 8, altri: 2, rocche: 6, quota: [0, 1600],
      varianti: ['briganti', 'mercanti', 'soldati'] },
  },
  // Acqua del villaggio: in pianura deve essere vicinissima, in quota si allarga. I fiumi del generatore nascono dove
  // il bacino è grande, cioè in basso: sopra i 600 m solo 29 celle su 1875 hanno acqua dolce entro 400 m, e con il
  // limite di pianura la montagna restava vuota (misurato sul seme 570549). Un paese di montagna vive di sorgenti e
  // di pozzi, che la Carta non disegna, quindi il limite cresce con la quota.
  villaggioAcqua: 650,              // m in pianura
  villaggioAcquaMonte: 2200,        // m sopra `villaggioQuota`
  villaggioQuota: [250, 900],       // m: fra queste due quote il limite passa dall'uno all'altro
  villaggioMonti: 600,              // m: sopra, anche montagna e roccia ospitano villaggi (alpeggi), e c'è la riserva
  mulinoAcqua: 140,                 // m: oltre questa distanza dall'acqua dolce la cella non è da mulino
  riempi: 5,                        // km: vuoti da riempire con i luoghi speciali avanzati
  ospizio: 0.6,                     // probabilità di un ospizio a un valico (oltre alla sentinella, se presidiato)
  rumore: 0.35,                     // peso del caso nel punteggio delle celle (0 = sempre le stesse)
  // Copertura: punteggio in più alle celle lontane dai luoghi già scelti (fino a `entro` km), per non lasciare vuoti
  // larghi (piano: nessun vuoto oltre ~10 km). Peso per tipo: i villaggi riempiono le terre abitabili, rovine e
  // luoghi del fantastico anche deserti, paludi e alture.
  copertura: { entro: 8, pesi: { villaggio: 1.5, rovina: 2.5, abbandonato: 1, grotta: 1.2, eremo: 1, fantastico: 2,
    ovile: 0.6, accampamento: 1, mulino: 0.4 } },
  villaggio: { grande: 0.4 },       // frazione dei villaggi grandi (12–20 case, pieve e locanda)
};

const hashU = (a, b, seme) => hash2(a, b, seme) / 4294967296;
const conta = ([a, b], seme, sale) => a + Math.floor(hashU(sale, 7, seme) * (b - a + 1));
const rampa = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));     // 0 fino ad a, 1 da b
/** Quanto può stare lontano dall'acqua dolce un villaggio a quota h: poco in pianura, molto in montagna. */
export function acquaDelVillaggio(h) {
  const [q0, q1] = SITI.villaggioQuota;
  return SITI.villaggioAcqua + (SITI.villaggioAcquaMonte - SITI.villaggioAcqua) * rampa(h, q0, q1);
}
const campana = (v, a, b, c, d) => Math.min(rampa(v, a, b), 1 - rampa(v, c, d));   // 1 tra b e c

/** Campi della Carta che servono a tutti i tipi (distanze in km a celle). */
function campi(carta) {
  const { cols, rows, mare, acque, bacino, sogliaTorrente, sogliaFiume } = carta;
  const lago = (i) => acque && (acque[i] === ACQUA.LAGO || acque[i] === ACQUA.LAGO_COSTIERO);
  return {
    acqua: distanzaDa(cols, rows, (i) => !mare[i] && (bacino[i] >= sogliaTorrente || lago(i))),
    fiume: distanzaDa(cols, rows, (i) => !mare[i] && bacino[i] >= sogliaFiume),
    costa: distanzaDa(cols, rows, (i) => mare[i] || lago(i)),
    terra: (i) => !mare[i] && (!acque || acque[i] === ACQUA.TERRA) && bacino[i] < sogliaFiume,
  };
}

/** Punteggio di una cella per un tipo (−Infinity = non ammessa). Coordinate della cella e campi. */
function punteggio(tipo, carta, i, F) {
  const { quota, bioma, asprezza, temperatura, umidita } = carta;
  const h = quota[i], b = bioma[i], a = asprezza ? asprezza[i] : 0, T = SITI.tipi[tipo];
  if (h < T.quota[0] || h > T.quota[1]) return -Infinity;
  if (a > 0.5 && tipo !== 'grotta') return -Infinity;                      // pareti dei gruppi montuosi
  const abitabile = ABITABILI.includes(b);
  switch (tipo) {
    case 'villaggio': {
      // Anche nel deserto, ma solo all'acqua (oasi); in montagna e sulla roccia solo in quota (alpeggi, richiesta
      // dell'utente: «in montagna non ci sarà sempre quasi nulla»).
      const montano = (b === B.MONTAGNA || b === B.ROCCIA) && h > SITI.villaggioMonti;
      if ((!abitabile && !montano && !(b === B.SABBIA && F.acqua[i] < 1.5)) || a > 0.33) return -Infinity;
      // L'acqua si misura sulla mappa fine, al centro della cella, col limite che cresce con la quota.
      const cx = (i % carta.cols + 0.5) * carta.cella, cz = (Math.floor(i / carta.cols) + 0.5) * carta.cella;
      if (carta.acquaVicina && distanzaAcqua(carta, cx, cz, true) > acquaDelVillaggio(h) + 400) return -Infinity;
      // Vicino all'acqua, in basso, su terreno dolce. L'utente: «villaggi e borghi stavano per necessità vicino a un
      // fiume». La cella è larga 1 km, quindi qui l'acqua pesa solo per scegliere la cella: il punto dentro la cella
      // lo sceglie affinaPunto col modo 'villaggio', sulla mappa fine dell'acqua dolce.
      // La quota pesa poco, e solo in alta montagna: con la penalità che partiva da 300 m i villaggi stavano tutti
      // in pianura (mediana 160 m, il 3 % sopra i 600 m, contro il 25 % della terra abitabile) e il giocatore in
      // montagna non trovava nulla. Scelta dell'utente: giocabilità prima del realismo.
      return 1.2 * campana(F.acqua[i], 0, 0.3, 1.5, 4) + 0.35 * (1 - rampa(h, 900, 1800)) + 0.5 * (1 - rampa(a, 0, 0.33))
        + (b === B.FORESTA ? 0 : 0.3) + (montano ? -0.25 : 0)
        + 0.2 * campana(umidita ? umidita[i] : 0.5, 0.15, 0.3, 0.8, 0.95);
    }
    case 'mulino': {
      // Mulino ad acqua: sul torrente o sul fiume, mai sul mare; in basso, dove c'è gente da servire.
      if (!abitabile || a > 0.3 || F.acqua[i] > 1) return -Infinity;
      return 1.6 * (1 - rampa(F.acqua[i], 0, 1)) + 0.7 * (1 - rampa(h, 200, 1100)) + 0.4 * (1 - rampa(a, 0, 0.3));
    }
    case 'rovina':
      // ovunque, meglio in alto e lontano dalle rocche (dove nessuno le ha ricostruite)
      return 0.8 * rampa(h, 100, 1200) + 0.6 * rampa(F.rocca[i], 3, 10) + 0.3 * rampa(a, 0, 0.3);
    case 'abbandonato':
      if (!abitabile && b !== B.PALUDE) return -Infinity;
      // ai margini: colline, lontano dalle rocche ma non troppo (candidati covo, GDD §3)
      return 1.0 * campana(F.rocca[i], 3, 6, 12, 20) + 0.6 * campana(h, 100, 300, 900, 1400) + (b === B.COLLINA ? 0.4 : 0);
    case 'grotta':
      if (a > 0.7 || b === B.NEVE || b === B.GHIACCIO) return -Infinity;
      // monti e rocce, valli strette: asprezza alta (non le pareti vere), rilievo
      return 1.2 * rampa(a, 0.05, 0.45) + 0.6 * rampa(h, 300, 1500) + (b === B.ROCCIA || b === B.MONTAGNA ? 0.5 : 0);
    case 'eremo':
      if (b !== B.FORESTA && b !== B.MONTAGNA && b !== B.COLLINA && b !== B.ROCCIA) return -Infinity;
      // in alto o nel bosco, lontano da tutti
      return 0.8 * rampa(h, 400, 1400) + (b === B.FORESTA ? 0.5 : 0) + 0.8 * rampa(F.rocca[i], 4, 12);
    case 'fantastico':
      if (b === B.GHIACCIO) return -Infinity;
      // alture, brughiere (pianure fredde e umide), boschi, paludi
      return 0.7 * rampa(h, 200, 1500) + (b === B.FORESTA || b === B.PALUDE ? 0.6 : 0)
        + 0.4 * (1 - rampa(temperatura ? temperatura[i] : 10, 4, 14)) + 0.5 * rampa(F.rocca[i], 4, 12);
    case 'ovile':
      if (b !== B.PIANURA && b !== B.PIANURA_N && b !== B.PIANURA_S && b !== B.COLLINA && b !== B.MONTAGNA) return -Infinity;
      if (a > 0.3) return -Infinity;
      // pascoli: colline e alpeggi, terreno dolce
      return 0.8 * campana(h, 100, 300, 1400, 1900) + 0.5 * (1 - rampa(a, 0, 0.3)) + (b === B.COLLINA ? 0.3 : 0);
    case 'accampamento':
      if (!abitabile) return -Infinity;
      return 1;                                                            // il punteggio lo danno strade e boschi
  }
  return -Infinity;
}

/**
 * Punto del sito dentro la cella (m): griglia 5×5 di quotaMondo con la pendenza ai vicini (passo 25 m).
 * modo: 'piano' (pendenza minima), 'alto' (quota massima, pendenza moderata), 'ripido' (pendenza massima ammessa),
 * 'villaggio' (dolce e vicino all'acqua dolce), 'acqua' (il più vicino possibile all'acqua dolce: i mulini).
 *
 * I due modi nuovi usano la mappa fine dell'acqua dolce (125 m, `distanzaAcqua` di scena.js, chiesta a M6): la cella
 * è larga 1 km, quindi sceglierla «vicino all'acqua» non bastava — il punto finiva lo stesso a mezzo chilometro dal
 * fiume. Il mare e i laghi costieri non contano: un mulino sul mare non esiste, e un villaggio sulla scogliera non ha
 * acqua da bere.
 */
function affinaPunto(carta, c, r, modo, seed) {
  const C = carta.cella, d = 25;
  // I modi che inseguono l'acqua cercano su una griglia più fitta: con 200 m di passo il punto migliore restava
  // lontano dal fiume anche quando il fiume attraversava la cella.
  // …e cercano anche un poco FUORI dalla cella: se il fiume scorre nella cella accanto, il punto migliore dentro la
  // cella resta comunque lontano dall'acqua, e il villaggio nasce in mezzo ai campi invece che sulla riva.
  const acquoso = modo === 'villaggio' || modo === 'acqua';
  const n = acquoso ? 9 : 5, oltre = acquoso ? 0.2 : 0;
  const p0 = -oltre + 0.5 * (1 + 2 * oltre) / n, pd = (1 + 2 * oltre) / n;
  let migliore = null;
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const x = (c + p0 + pd * k) * C, z = (r + p0 + pd * j) * C;
    // Cercando fuori dalla cella si finisce in mare o in un lago: la cella di partenza è terra, quella accanto no.
    // (Trovato dalla verifica: cinque semi su otto avevano un villaggio o un mulino «in acqua».)
    if (oltre) {
      const cc = Math.floor(x / C), rr = Math.floor(z / C);
      if (cc < 0 || rr < 0 || cc >= carta.cols || rr >= carta.rows) continue;
      const ci = rr * carta.cols + cc;
      if (carta.mare[ci] || (carta.acque && carta.acque[ci] !== ACQUA.TERRA)) continue;
    }
    const h = quotaMondo(carta, x, z, seed);
    const gx = (quotaMondo(carta, x + d, z, seed) - quotaMondo(carta, x - d, z, seed)) / (2 * d);
    const gz = (quotaMondo(carta, x, z + d, seed) - quotaMondo(carta, x, z - d, seed)) / (2 * d);
    const p = Math.sqrt(gx * gx + gz * gz);
    let v;
    if (modo === 'piano') v = -p;
    else if (modo === 'alto') v = h - (p > 0.4 ? 1e4 : 0);
    else if (modo === 'villaggio') {
      const dA = distanzaAcqua(carta, x, z, true);
      v = -3 * p - 1.2 * rampa(dA, 120, 900) - (p > 0.3 || dA < 40 ? 1e4 : 0);   // sulla riva, non nel fiume
    }
    else if (modo === 'acqua') {
      const dA = distanzaAcqua(carta, x, z, true);
      v = -rampa(dA, 0, 300) - 0.5 * p - (p > 0.35 || dA < 12 ? 1e4 : 0);        // sulla riva, non in mezzo
    }
    else v = (p > 1 ? -1e4 : p);
    if (!migliore || v > migliore.v) migliore = { v, x, z, h, p };
  }
  return { x: migliore.x, z: migliore.z, quota: migliore.h, pendenza: migliore.p };
}

const MODO = { villaggio: 'villaggio', mulino: 'acqua', rovina: 'alto', abbandonato: 'alto', grotta: 'ripido',
  eremo: 'piano', fantastico: 'alto', ovile: 'piano', accampamento: 'piano', sentinella: 'alto', ospizio: 'piano' };

/** Stato della scelta: siti già presi e una griglia di secchi (5 km) per le distanze. */
function nuovoInsieme(carta, dRocche) {
  const lato = 5, gc = Math.ceil(carta.cols / lato), gr = Math.ceil(carta.rows / lato);
  const secchi = Array.from({ length: gc * gr }, () => []);
  const siti = [];
  const secchio = (x, y) => Math.min(gr - 1, Math.max(0, Math.floor(y / lato))) * gc + Math.min(gc - 1, Math.max(0, Math.floor(x / lato)));
  const { cols, rows } = carta, E = SITI.copertura.entro;
  const vuoto = Float32Array.from(dRocche, (d) => Math.min(d, E));    // km dal luogo più vicino, al più E
  return {
    siti, vuoto,
    aggiungi(s) {
      s.id = siti.length; siti.push(s);
      const x = s.x / carta.cella, y = s.z / carta.cella;
      secchi[secchio(x, y)].push(s);
      for (let r = Math.max(0, Math.floor(y - E)); r <= Math.min(rows - 1, Math.floor(y + E)); r++) {
        for (let c = Math.max(0, Math.floor(x - E)); c <= Math.min(cols - 1, Math.floor(x + E)); c++) {
          const dx = c + 0.5 - x, dy = r + 0.5 - y, d = Math.sqrt(dx * dx + dy * dy), i = r * cols + c;
          if (d < vuoto[i]) vuoto[i] = d;
        }
      }
      return s;
    },
    /** Vero se nessun sito entro `altri` km, né dello stesso tipo entro `proprio` km. */
    libero(x, y, tipo, proprio, altri) {
      const R = Math.max(proprio, altri), g0 = Math.floor((x - R) / lato), g1 = Math.floor((x + R) / lato);
      const h0 = Math.floor((y - R) / lato), h1 = Math.floor((y + R) / lato);
      for (let gy = Math.max(0, h0); gy <= Math.min(gr - 1, h1); gy++) {
        for (let gx = Math.max(0, g0); gx <= Math.min(gc - 1, g1); gx++) {
          for (const s of secchi[gy * gc + gx]) {
            const dx = s.x / carta.cella - x, dy = s.z / carta.cella - y, d2 = dx * dx + dy * dy;
            const m = s.tipo === tipo ? proprio : altri;
            if (d2 < m * m) return false;
          }
        }
      }
      return true;
    },
  };
}

/**
 * Sceglie `numero` siti di un tipo: a ogni passo la cella ammessa col punteggio più alto (regole del tipo, un poco di
 * caso, copertura dei vuoti) che rispetta le distanze. `extra(i)` aggiunge al punteggio (es. vicinanza alle strade).
 */
function scegliTipo(carta, insieme, F, tipo, numero, seme, extra = null, varianti = null, accetta = null) {
  const { cols, rows } = carta, T = SITI.tipi[tipo], bordo = SITI.bordo, sale = derivaSeme(seme, tipo.length * 131 + tipo.charCodeAt(0));
  const celle = [];
  for (let r = bordo; r < rows - bordo; r++) for (let c = bordo; c < cols - bordo; c++) {
    const i = r * cols + c;
    if (!F.terra(i) || F.rocca[i] < T.rocche) continue;
    let s = punteggio(tipo, carta, i, F);
    if (s === -Infinity) continue;
    if (extra) { const e = extra(i); if (e === -Infinity) continue; s += e; }
    celle.push({ c, r, s: s + SITI.rumore * 3 * hashU(c, r, sale) });
  }
  const presi = [], scartate = new Uint8Array(celle.length);
  const seed = derivaSeme(carta.seme, 101), w = SITI.copertura.pesi[tipo] / SITI.copertura.entro, V = insieme.vuoto;
  while (presi.length < numero) {
    let k = -1, mk = -Infinity;
    for (let q = 0; q < celle.length; q++) {
      if (scartate[q]) continue;
      const st = celle[q], v = st.s + w * V[st.r * cols + st.c];
      if (v > mk || (v === mk && (st.r < celle[k].r || (st.r === celle[k].r && st.c < celle[k].c)))) { mk = v; k = q; }
    }
    if (k < 0) break;
    scartate[k] = 1;
    const st = celle[k];
    if (!insieme.libero(st.c + 0.5, st.r + 0.5, tipo, T.proprio, T.altri)) continue;
    const p = affinaPunto(carta, st.c, st.r, MODO[tipo], seed);
    if (accetta && !accetta(p)) continue;            // il punto non va bene comunque (un mulino lontano dall'acqua)
    if (!insieme.libero(p.x / carta.cella, p.z / carta.cella, tipo, T.proprio, T.altri)) continue;
    const sito = { tipo, ...p };
    const v = varianti ?? T.varianti;
    if (v) sito.variante = v[Math.floor(hashU(st.c, st.r, sale ^ 0x9e37) * v.length)];
    presi.push(insieme.aggiungi(sito));
  }
  return presi;
}

/** Distanza (km) dalla rocca più vicina, per cella (le rocche di ogni tipo). */
function distanzaRocche(carta) {
  const { cols, rows, cella } = carta, celle = new Set();
  for (const l of carta.luoghi ?? []) celle.add(Math.floor(l.z / cella) * cols + Math.floor(l.x / cella));
  return distanzaDa(cols, rows, (i) => celle.has(i));
}

/** Monasteri e città dalle rocche (mai la partenza): cambia `luogo.tipo`. */
function classiRocche(carta, F, seme) {
  const L = carta.luoghi ?? [], { cols, cella, quota } = carta;
  for (const l of L) l.tipo = 'rocca';
  const altri = L.filter((l) => !l.partenza);
  const km = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) / cella;
  const cellaDi = (l) => Math.floor(l.z / cella) * cols + Math.floor(l.x / cella);
  // Città: in basso, sull'acqua (fiume o costa), le classi grandi prima (il borgo è già il più largo).
  const pesoClasse = { maggiore: 1, casata: 0.5, minore: 0 };
  const perCitta = altri.map((l) => {
    const i = cellaDi(l);
    return { l, s: 1.5 * (1 - rampa(quota[i], 100, SITI.citta.quota)) + 1.2 * (1 - rampa(Math.min(F.fiume[i], F.costa[i]), 1, 6))
      + pesoClasse[l.classe] + 0.3 * hashU(l.id, 3, seme) };
  }).sort((a, b) => b.s - a.s || a.l.id - b.l.id);
  const nC = conta(SITI.citta.numero, seme, 11), citta = [];
  for (const { l } of perCitta) {
    if (citta.length >= nC) break;
    if (!citta.every((c) => km(c, l) >= SITI.citta.distanza)) continue;
    // Una città è più grande di qualunque rocca (richiesta dell'utente): si rifanno i piani con la classe `citta`
    // (js/mondo/luoghi.js). Dove il terreno non regge il borgo più grande il luogo resta una rocca e si prova il
    // candidato dopo, così non esistono città piccole.
    if (!ripianificaLuogo(carta, l, 'citta')) continue;
    l.tipo = 'citta';
    citta.push(l);
  }
  // Monasteri: isolati e in alto (dominanza, quota, lontano dalle altre rocche), le classi piccole prima.
  const nM = conta(SITI.monasteri.numero, seme, 13), monasteri = [];
  const isolamento = (l) => Math.min(...L.filter((o) => o !== l).map((o) => km(o, l)));
  const perMonastero = altri.filter((l) => l.tipo === 'rocca').map((l) => ({ l,
    s: rampa(l.quota, 200, 1200) + 0.5 * rampa(l.dominanza ?? 0, 15, 150) + 0.6 * rampa(isolamento(l), 10, 20)
      + (1 - pesoClasse[l.classe]) * 0.5 + (l.carattere === 'altura' ? 0.3 : 0) + 0.3 * hashU(l.id, 5, seme),
  })).sort((a, b) => b.s - a.s || a.l.id - b.l.id);
  for (const { l } of perMonastero) {
    if (monasteri.length >= nM) break;
    if (monasteri.every((m) => km(m, l) >= SITI.monasteri.distanza)) { l.tipo = 'monastero'; monasteri.push(l); }
  }
  return { citta: citta.length, monasteri: monasteri.length };
}

/** Prima delle strade: classi delle rocche, villaggi e luoghi speciali. Scrive `carta.siti`. */
export function aggiungiSiti(carta) {
  const t0 = performance.now();
  const seme = derivaSeme(carta.seme, 1801);
  const F = campi(carta);
  F.rocca = distanzaRocche(carta);
  const classi = classiRocche(carta, F, seme);
  const insieme = nuovoInsieme(carta, F.rocca);     // le rocche contano per la copertura, non sono siti
  const T = SITI.tipi;
  // Ovili vicino ai castelli (la Veglia: «scacciare i lupi dall'ovile»), prima di tutto il resto.
  const seed = derivaSeme(carta.seme, 101);
  for (const l of carta.luoghi ?? []) {
    if (l.tipo !== 'rocca') continue;
    const quanti = conta(T.ovile.perRocca, seme, 100 + l.id);
    let fatti = 0;
    for (let k = 0; k < 16 && fatti < quanti; k++) {
      // direzioni da un hash (niente trigonometria): punto su un quadrato e normalizzato
      const ux = hashU(l.id, k, seme ^ 0x51) * 2 - 1, uz = hashU(l.id, k, seme ^ 0x93) * 2 - 1, n = Math.sqrt(ux * ux + uz * uz);
      if (n < 0.2 || n > 1) continue;
      const d = (T.ovile.entro[0] + hashU(l.id, k, seme ^ 0x77) * (T.ovile.entro[1] - T.ovile.entro[0])) * carta.cella;
      const x = l.x + ux / n * d, z = l.z + uz / n * d, c = Math.floor(x / carta.cella), r = Math.floor(z / carta.cella);
      if (c < SITI.bordo || r < SITI.bordo || c >= carta.cols - SITI.bordo || r >= carta.rows - SITI.bordo) continue;
      const i = r * carta.cols + c;
      if (!F.terra(i) || punteggio('ovile', carta, i, F) === -Infinity) continue;
      if (!insieme.libero(c + 0.5, r + 0.5, 'ovile', T.ovile.proprio, T.ovile.altri)) continue;
      const p = affinaPunto(carta, c, r, 'piano', seed);
      insieme.aggiungi({ tipo: 'ovile', ...p, rocca: l.id });
      fatti++;
    }
  }
  // Un villaggio senza acqua dolce a portata non si scarta subito: la cella si scarta e se ne prova un'altra. Senza
  // questo filtro un villaggio su tre restava oltre 600 m dall'acqua (richiesta dell'utente: «stavano per necessità
  // vicino a un fiume»).
  // Una parte dei villaggi è riservata alla terra alta e si sceglie PRIMA. Senza la riserva la montagna restava
  // vuota comunque: le celle di pianura vincono sempre il punteggio, e i 250–300 posti finivano tutti là (misurato:
  // il 3 % dei villaggi sopra i 600 m, contro il 25 % della terra). Richiesta dell'utente: giocabilità prima del
  // realismo, «in montagna non ci sarà sempre quasi nulla».
  const nVil = conta(T.villaggio.numero, seme, 21);
  const nAlti = Math.round(nVil * T.villaggio.inQuota);
  const acquaOk = (p) => distanzaAcqua(carta, p.x, p.z, true) <= acquaDelVillaggio(p.quota);
  scegliTipo(carta, insieme, F, 'villaggio', nAlti, seme,
    (i) => (carta.quota[i] > SITI.villaggioMonti ? 0 : -Infinity), null, acquaOk);
  const fatti = insieme.siti.filter((s) => s.tipo === 'villaggio').length;
  scegliTipo(carta, insieme, F, 'villaggio', nVil - fatti, seme, null, null, acquaOk);
  // Un mulino lontano dall'acqua non è un mulino: se il punto migliore della cella non ce l'ha, la cella si scarta.
  scegliTipo(carta, insieme, F, 'mulino', conta(T.mulino.numero, seme, 23), seme, null, null,
    (p) => distanzaAcqua(carta, p.x, p.z, true) <= SITI.mulinoAcqua);
  // Valichi: sentinella dove c'è il presidio, a volte un ospizio sul passo.
  for (const v of carta.valichi ?? []) {
    const c = Math.floor(v.x), r = Math.floor(v.y);
    if (v.presidio) insieme.aggiungi({ tipo: 'sentinella', ...affinaPunto(carta, c, r, 'alto', seed), valico: v.id });
    if (hashU(v.id, 17, seme) < SITI.ospizio) insieme.aggiungi({ tipo: 'ospizio', ...affinaPunto(carta, c, r, 'piano', seed), valico: v.id });
  }
  for (const tipo of ['rovina', 'grotta', 'eremo', 'fantastico', 'abbandonato']) {
    scegliTipo(carta, insieme, F, tipo, conta(T[tipo].numero, seme, 30 + tipo.length), seme);
  }
  scegliTipo(carta, insieme, F, 'ovile', conta(T.ovile.sparsi, seme, 41), seme);
  // Riempimento: dove resta un vuoto (oltre `SITI.riempi` km dal luogo più vicino) i luoghi speciali salgono fino al
  // massimo della loro quantità.
  for (const tipo of ['rovina', 'fantastico', 'abbandonato', 'grotta', 'eremo']) {
    const ora = insieme.siti.filter((s) => s.tipo === tipo).length;
    scegliTipo(carta, insieme, F, tipo, T[tipo].numero[1] - ora, seme ^ 0x7f4a, (i) => (insieme.vuoto[i] > SITI.riempi ? 0 : -Infinity));
  }
  // Villaggi grandi (pieve e locanda): i più vicini all'acqua e in basso, per punteggio.
  const villaggi = insieme.siti.filter((s) => s.tipo === 'villaggio');
  const nG = Math.round(villaggi.length * SITI.villaggio.grande);
  [...villaggi].sort((a, b) => a.quota - b.quota || a.id - b.id).forEach((s, k) => { s.dimensione = k < nG ? 'villaggio' : 'frazione'; });
  carta.siti = insieme.siti;
  carta._insiemeSiti = insieme;                      // per completaSiti (non va in cache: lo toglie completaSiti)
  carta._campiSiti = F;
  const ms = performance.now() - t0;
  if (carta.statistiche) carta.statistiche.siti = { classi, ms };
  return carta;
}

/** Dopo le strade: accampamenti (mercanti e soldati lungo le strade, briganti nei boschi lontani). */
export function completaSiti(carta) {
  const t0 = performance.now();
  const insieme = carta._insiemeSiti, F = carta._campiSiti;
  delete carta._insiemeSiti; delete carta._campiSiti;
  if (!insieme) return carta;
  const seme = derivaSeme(carta.seme, 1801), { cols, rows } = carta;
  const strada = new Uint8Array(cols * rows);
  for (const a of carta.strade?.archi ?? []) {
    for (let s = 0; s < a.x.length; s++) strada[Math.floor(a.y[s]) * cols + Math.floor(a.x[s])] = 1;
  }
  const dStrada = distanzaDa(cols, rows, (i) => strada[i] === 1);
  const n = conta(SITI.tipi.accampamento.numero, seme, 51);
  const nBriganti = Math.round(n * 0.4);
  scegliTipo(carta, insieme, F, 'accampamento', nBriganti, seme, (i) => (carta.bioma[i] === B.FORESTA && dStrada[i] >= 2 ? 1 + rampa(F.rocca[i], 6, 14) : -Infinity), ['briganti']);
  scegliTipo(carta, insieme, F, 'accampamento', n - nBriganti, seme ^ 0x2545, (i) => (dStrada[i] < 0.5 ? 1 : -Infinity), ['mercanti', 'soldati']);
  if (carta.statistiche?.siti) {
    const conti = {};
    for (const s of carta.siti) conti[s.tipo] = (conti[s.tipo] ?? 0) + 1;
    carta.statistiche.siti.conti = conti;
    carta.statistiche.siti.ms += performance.now() - t0;
  }
  return carta;
}

/**
 * Raggio d'ingombro (m) di un sito attorno al suo centro: quanto spazio occupano le sue costruzioni (M8, passo 2). Serve
 * per decidere in quale blocco costruirlo (main.js) e per tenere fuori gli alberi (villaggio3d.js, pianoDelSito).
 */
export const RAGGI_SITI = { frazione: 55, villaggio: 85, ovile: 22, altro: 30 };
export function raggioSito(s) {
  if (s.tipo === 'villaggio') return s.dimensione === 'villaggio' ? RAGGI_SITI.villaggio : RAGGI_SITI.frazione;
  return RAGGI_SITI[s.tipo] ?? RAGGI_SITI.altro;
}

/**
 * Clima di un luogo per lo stile delle case (richiesta dell'utente: villaggi, case isolate e borghi diversi secondo il
 * clima): 'freddo', 'temperato' o 'caldo', dalla temperatura media annua (°C), dall'umidità e dal bioma della cella.
 *
 * Il tetto piatto a terrazza e l'intonaco chiaro vogliono un clima SECCO, non soltanto caldo: con la sola temperatura
 * un borgo in piena foresta a 15 °C prendeva le case da zona arida. Perciò «caldo» chiede poca umidità, e la foresta e
 * la palude (dove piove) non lo sono mai. Misure sui luoghi di cinque semi: sabbia U 0,22–0,31 e T 14–18,5 °C; foresta
 * U 0,36–0,62 anche calda; pianura meridionale T ≈ 17 °C, U 0,33–0,41. Risultato: ~30 % freddo, ~10 % caldo.
 */
export const CLIMI = { freddo: 0.5, caldo: 12, secco: 0.34 };
export function climaDelLuogo(carta, x, z) {
  const c = Math.min(carta.cols - 1, Math.max(0, Math.floor(x / carta.cella)));
  const r = Math.min(carta.rows - 1, Math.max(0, Math.floor(z / carta.cella)));
  const i = r * carta.cols + c, b = carta.bioma?.[i], t = carta.temperatura?.[i] ?? 8;
  const u = carta.umidita?.[i] ?? 0.5;
  if (b === BIOMA.NEVE || b === BIOMA.GHIACCIO || b === BIOMA.PIANURA_N || t <= CLIMI.freddo) return 'freddo';
  if (b === BIOMA.FORESTA || b === BIOMA.PALUDE) return 'temperato';
  if (b === BIOMA.SABBIA || b === BIOMA.PIANURA_S) return 'caldo';
  return t >= CLIMI.caldo && u <= CLIMI.secco ? 'caldo' : 'temperato';
}

/** Nome leggibile per la Carta e per F3. */
export const NOMI_SITI = {
  villaggio: 'villaggio', rovina: 'rovine', abbandonato: 'luogo abbandonato', grotta: 'grotta', eremo: 'eremo',
  fantastico: 'luogo del fantastico', ovile: 'ovile', accampamento: 'accampamento', sentinella: 'torre di sentinella',
  ospizio: 'ospizio', monastero: 'monastero', citta: 'città', rocca: 'rocca', mulino: 'mulino',
};

/**
 * Verifica dei siti (automatica, su più semi): quantità per tipo, nessun sito in acqua, vuoti. Per ogni cella di
 * terra percorribile la distanza dal luogo più vicino (rocche e siti); il vuoto è il doppio. Le celle sopra
 * `quotaVuoto` m e le pareti non contano (lassù il mondo è vuoto per natura).
 * Limiti [misurati su 10 semi, novembre 2026]: il piano chiedeva nessun vuoto oltre ~10 km, ma con ~230 luoghi su
 * ~10.000 km² (uno ogni ~6,5 km) restano sempre poche celle più lontane: si chiede che quelle oltre `oltre` km
 * siano al più `frazione` e che nessuna superi `vuoto` km (vuoto di 2 × `vuoto` km).
 */
export function verificaSiti(carta, limiti = { vuoto: 9, oltre: 6, frazione: 0.01, quotaVuoto: 1800 }) {
  const S = carta.siti, errori = [];
  if (!S) return { ok: false, testo: 'Carta senza siti', errori: ['Carta senza siti'] };
  const { cols, rows, cella, mare, acque, quota, asprezza } = carta;
  const conti = {};
  for (const s of S) {
    conti[s.tipo] = (conti[s.tipo] ?? 0) + 1;
    const i = Math.floor(s.z / cella) * cols + Math.floor(s.x / cella);
    if (mare[i] || (acque && acque[i] !== ACQUA.TERRA)) errori.push(`${NOMI_SITI[s.tipo]} ${s.id} in acqua`);
  }
  for (const [tipo, T] of Object.entries(SITI.tipi)) {
    if (!T.numero) continue;
    const n = conti[tipo] ?? 0;
    if (n < T.numero[0] * 0.75) errori.push(`${NOMI_SITI[tipo]}: ${n} (attesi ${T.numero[0]}–${T.numero[1]})`);
  }
  const celle = new Set();
  for (const s of [...S, ...(carta.luoghi ?? [])]) celle.add(Math.floor(s.z / cella) * cols + Math.floor(s.x / cella));
  const d = distanzaDa(cols, rows, (i) => celle.has(i));
  let vuoto = 0, oltre = 0, contate = 0;
  const bordo = SITI.bordo;
  for (let r = bordo; r < rows - bordo; r++) for (let c = bordo; c < cols - bordo; c++) {
    const i = r * cols + c;
    if (mare[i] || (acque && acque[i] !== ACQUA.TERRA) || quota[i] > limiti.quotaVuoto || (asprezza && asprezza[i] > 0.5)) continue;
    contate++;
    if (d[i] > vuoto) vuoto = d[i];
    if (d[i] > limiti.oltre) oltre++;
  }
  const frazione = oltre / Math.max(1, contate);
  if (vuoto > limiti.vuoto || frazione > limiti.frazione) {
    errori.push(`vuoto di ${(2 * vuoto).toFixed(0)} km (${(100 * frazione).toFixed(1)} % delle celle oltre ${limiti.oltre} km)`);
  }
  // Villaggi e mulini devono stare sull'acqua dolce (richiesta dell'utente). Si misura sul punto, non sulla cella.
  let lontani = 0, vill = 0, mulLontani = 0;
  if (carta.acquaVicina) {
    for (const s of S) {
      if (s.tipo === 'villaggio') { vill++; if (distanzaAcqua(carta, s.x, s.z, true) > acquaDelVillaggio(s.quota) + 200) lontani++; }
      else if (s.tipo === 'mulino' && distanzaAcqua(carta, s.x, s.z, true) > SITI.mulinoAcqua + 60) mulLontani++;
    }
    if (vill && lontani / vill > 0.12) errori.push(`villaggi lontani dall'acqua: ${(100 * lontani / vill).toFixed(0)} %`);
    if (mulLontani) errori.push(`mulini lontani dall'acqua: ${mulLontani}`);
  }
  const L = carta.luoghi ?? [];
  const nT = (t) => L.filter((l) => l.tipo === t).length;
  return {
    ok: errori.length === 0, errori, conti, vuoto: 2 * vuoto, frazione,
    testo: (errori.length ? errori[0] + ' · ' : '') + `siti ${S.length}: villaggi ${conti.villaggio ?? 0}, monasteri ${nT('monastero')}, città ${nT('citta')}, `
      + `mulini ${conti.mulino ?? 0}, speciali ${S.length - (conti.villaggio ?? 0) - (conti.ovile ?? 0) - (conti.mulino ?? 0)}, `
      + `ovili ${conti.ovile ?? 0}; lontani dall'acqua ${vill ? (100 * lontani / vill).toFixed(0) : '-'} %; vuoto massimo ${(2 * vuoto).toFixed(0)} km`
      + ` (${(100 * frazione).toFixed(1)} % oltre ${limiti.oltre} km)`,
  };
}
