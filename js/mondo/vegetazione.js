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
import { fbm, derivaSeme, smoothstep, hash2, mulberry32 } from './rumore.js';
import { specchio, distanzaPiano, livelloLago, quotaFinale } from './scena.js';
import { distanzaStrada } from './strade.js';

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
  { nome: 'ramo', gruppo: 'bosco', passo: 5, scala: [0.6, 1.3] },     // rami secchi a terra (rive dei fiumi, boschi)
  { nome: 'muretto', gruppo: 'muri', scala: [0.95, 1.1] },
  { nome: 'siepe', gruppo: 'arbusti', scala: [1.0, 1.25] },          // cespugli fitti delle siepi (PARCELLE)          // sui confini dei campi vicino al borgo (PARCELLE)
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
  // Strade (js/mondo/strade.js, concordato con la sessione del generatore): m oltre il bordo della carreggiata.
  // Alberi, arbusti, canne e tronchi: niente entro `libero`, radi fino a `radi`; rocce e ciottoli non sulla carreggiata
  // (massi e affioramenti nemmeno a 1 m dal bordo); erba non sulla carreggiata, felci non entro `libero`.
  strada: { libero: 2, radi: 6, massi: 1 },
  acquaCelle: 4,                         // distanza dall'acqua misurata fino a 4 celle
  // Solo vicino al cavaliere (erbaAttorno): probabilità per cella di 1,1 m (erba), 2,2 m (felci), 1,6 m (ciottoli).
  // Erba e felci più rade (richiesta dell'utente): il prato lo fa soprattutto lo shader del terreno (colori, chiaroscuri).
  vicino: { erba: 0.4, felce: 0.12, ciottolo: 1, passoErba: 1.1, passoFelci: 2.2, passoCiottoli: 1.6 },
  // Fiumi: in più sulle rive (densità per cella di riva) e nell'alveo dove l'acqua è bassa: pietre che affiorano o
  // stanno a pelo d'acqua (l'acqua è quasi opaca), una cella della griglia ogni `passo` m con probabilità
  // `probabilita` (meno dove è più fonda), di cui `massi` sono massi.
  // Bosco ripariale (richiesta dell'utente: «lungo i fiumi un po' più alberi, qualche tronco e rami sul bordo»):
  // fascia di `fascia` (peso per cella di distanza dal fiume, dalla prima), densità `bosco`, specie di riva.
  fiume: { sassi: 0.6, massi: 0.25, ciottoli: 0.45,
    fascia: [1, 0.85, 0.6, 0.3], bosco: 0.42, tronchi: 0.12, rami: 0.22,
    // Ghiaia sulle rive (suolo, quarta componente): peso per cella dal fiume (0 = il fiume), a chiazze su ~35 m.
    ghiaia: { celle: [1, 0.9, 0.45], lunghezza: 35, soglia: [0.05, 0.3] },
    alveo: { passo: 2.5, probabilita: 0.22, massi: 0.25, profondita: 1.2, affiora: [0.05, 0.4] } },
};

const _cop = nuovaCopertura();

/**
 * Campagna attorno ai luoghi (carta.luoghi): nel Medioevo i primi 1–2 km attorno a un borgo erano coltivati e
 * disboscati. Estensione per tipo di luogo (raggio pieno, raggio dove finisce; m): rocche con borgo secondo la classe,
 * e già pronti i luoghi minori che arriveranno con la milestone dei luoghi (villaggi, case isolate: decisione
 * dell'utente, «qualcosa intorno a case isolate e villaggi»). Bordo irregolare: rumore su `lunghezza` m, ampio
 * `ampiezza` volte il raggio esterno.
 */
export const CAMPAGNA = {
  raggi: {
    rocca: { minore: [500, 1150], casata: [700, 1600], maggiore: [900, 2000] },
    villaggio: [300, 700],
    casa: [70, 200],
  },
  bordo: { lunghezza: 600, ampiezza: 0.19 },
};
function raggiCampagna(l) {
  const R = CAMPAGNA.raggi[l.tipo];
  if (!R) return null;
  return Array.isArray(R) ? R : (R[l.classe] || R.casata);
}
function coltivatoIn(luoghi, x, z, seme) {
  if (!luoghi || !luoghi.length) return 0;
  let v = 0;
  for (const l of luoghi) {
    const R = raggiCampagna(l);
    if (!R) continue;
    const amp = CAMPAGNA.bordo.ampiezza * R[1];
    let d = Math.hypot(x - l.x, z - l.z);
    if (d > R[1] + amp) continue;
    d += amp * fbm(x, z, seme, Math.min(CAMPAGNA.bordo.lunghezza, 3 * R[1]), 2);
    const c = 1 - smoothstep(R[0], R[1], d);
    if (c > v) v = c;
  }
  return v;
}
/** La campagna della Carta come funzione (x, z) → 0–1: la usa anche il colore del terreno (coloreMondo). */
export function campagnaMondo(carta) {
  const seme = derivaSeme(carta.seme, 402);
  return (x, z) => coltivatoIn(carta.luoghi, x, z, seme);
}

/**
 * Campi coltivati (dipinti dallo shader del terreno, js/3d/terrain.js): dove la campagna è piena, in piano, all'asciutto
 * e senza roccia, neve né ghiaia. Il disegno degli appezzamenti (arato, seminato, grano, prato da sfalcio, maggese,
 * orti) è dello shader e finisce nel colore cotto del blocco: nel gioco non costa. Qui solo dove possono stare
 * (`campo` per vertice, terza componente di `suolo`) e l'orientamento (quello del borgo più vicino). Niente stagioni
 * (decisione dell'utente). Nei campi niente alberi, cespugli né sassi.
 */
export const CAMPI_COLTIVATI = {
  coltivato: [0.45, 0.8],          // da quanta campagna cominciano i campi (0–1)
  pendenza: [9, 16],               // gradi (pendenza fine): pieni sotto, nessuno sopra (colline lavorate)
  oggetti: 0.95,                   // quanto tolgono alberi, arbusti e sassi
  erba: 0.6,                       // quanto tolgono i ciuffi d'erba vicini
};

/**
 * Appezzamenti, siepi e filari. Lo stesso disegno lo calcolano lo shader del suolo (colore, strisce scure delle siepi
 * viste da lontano) e `posizionaVegetazione` (le siepi come oggetti): per questo niente rumori della scheda video.
 * Coordinate dei campi `q` per vertice (attributo aCampi: lungo e di traverso al verso del borgo, piegate da un
 * rumore su `piega.lunghezza` m; terza componente < 0 negli orti) e una permutazione di 256 interi uguale per
 * tutti e due (PERM_CAMPI, texture R8 nello shader). Strisce larghe banda / (2 + 0…extra), appezzamenti lunghi
 * lungo[0] + lungo[1]·caso. Siepi sul lato lungo di una parte degli appezzamenti (`siepi.lungo`), su quello corto di
 * meno (`siepi.traverso`); una parte delle siepi è un filare d'alberi (`siepi.filari`). Negli orti niente siepi.
 */
export const PARCELLE = {
  banda: [110, 36], extra: [3, 2], lungo: [[70, 120], [18, 22]], spostamento: 500,
  piega: { lunghezza: 128, ampiezza: 25 }, orti: { bordo: 30, lunghezza: 64 },
  // Strade (richiesta dell'utente: i campi non tagliati a metà dalle strade, al più fino al margine): ogni lato di una
  // strada ha appezzamenti suoi (righe spostate di `lato` m) e i campi finiscono a `margine` m dal bordo, con erba.
  strada: { lato: 1000, margine: [0.6, 2.2], lontano: 25, fascia: 20 },
  siepi: { lungo: 0.4, traverso: 0.2, filari: 0.25, passo: 1.7, passoFilare: 9, dentro: 0.9, striscia: [1.6, 2.4],
    // Aperture naturali (richiesta dell'utente: «più di un punto per lato, una cosa naturale»): ogni tratto di `cella` m
    // ha un'apertura con probabilità `quota`, in un punto a caso, larga 2·(larghezza) m.
    aperture: { cella: 28, quota: 0.6, larghezza: [1.3, 3.0] } },
  // Muretti a secco: vicino al luogo (fino a `oltreOrti` m oltre il limite degli orti) una parte (`quota`) dei confini
  // con la siepe è un muretto; su ogni lato un varco largo 2·`varco` m per passare.
  muretti: { oltreOrti: 150, quota: 0.6, varco: 2.5, dentro: 0.6, striscia: [0.5, 1.0] },
};
export const PERM_CAMPI = (() => {
  const r = mulberry32(0x6a09e667), p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const k = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[k]; p[k] = t; }
  return Uint8Array.from(p);
})();
const permC = (x) => PERM_CAMPI[((x % 256) + 256) % 256];
/** Intero 0–255 da due interi (come hashC nello shader). */
export const hashCampi = (a, b) => permC(permC(b) + a);
/** Appezzamento del punto (qx, qy) dei campi; `orto` 0/1. Scrive i, j, W, L, fu, fv in `o`. */
export function parcella(qx, qy, orto, o) {
  const P = PARCELLE, k = orto ? 1 : 0, banda = P.banda[k];
  const W = banda / (2 + Math.floor(hashCampi(Math.floor(qy / banda), 7 + k) * P.extra[k] / 256));
  const j = Math.floor(qy / W), hj = hashCampi(j, 3 + k) / 255;
  const L = P.lungo[k][0] + P.lungo[k][1] * hj, u = qx + hj * P.spostamento, i = Math.floor(u / L);
  o.i = i; o.j = j; o.W = W; o.L = L; o.fu = u - i * L; o.fv = qy - j * W; o.u0 = i * L - hj * P.spostamento;
  return o;
}
const siepeLunga = (i, j) => hashCampi(i, j + 59) < PARCELLE.siepi.lungo * 256;
const siepeCorta = (i, j) => hashCampi(i, j + 83) < PARCELLE.siepi.traverso * 256;
const filare = (i, j, lato) => hashCampi(i, j + 97 + lato) < PARCELLE.siepi.filari * 256;
const muro = (i, j, lato) => hashCampi(i, j + 113 + lato) < PARCELLE.muretti.quota * 256;
/** La siepe ha un'apertura in questo punto del lato (`lungo`: m dall'inizio del lato)? Come `apertura` nello shader. */
function aperturaSiepe(i, j, lato, lungo) {
  const A = PARCELLE.siepi.aperture, c = Math.floor(lungo / A.cella), b = hashCampi(i, j + 141 + 7 * lato);
  if (hashCampi(c, b) >= A.quota * 256) return false;
  const centro = (c + 0.2 + 0.6 * hashCampi(c, b + 1) / 255) * A.cella;
  return Math.abs(lungo - centro) < A.larghezza[0] + (A.larghezza[1] - A.larghezza[0]) * hashCampi(c, b + 2) / 255;
}
/** Centro del varco del muretto lungo il lato (m dall'inizio del lato lungo `lunghezza`). */
const varco = (i, j, lato, lunghezza) => lunghezza * (0.15 + 0.7 * hashCampi(i, j + 127 + 4 * lato) / 255);

/**
 * Case fuori dal borgo (richiesta dell'utente: «ogni tanto, in mezzo o a lato dei campi, una casa isolata o un
 * gruppetto di 2–3»). Siti deterministici per Carta: per ogni luogo `gruppi` gruppi nella campagna, tra il limite degli
 * orti (+ `daOrti` m) e `fino` del raggio pieno, in piano, all'asciutto, lontano dai terrapieni e tra loro. Qui solo
 * dove stanno (e la loro aia libera, con un orto attorno): le case le disegna chi fa gli edifici (M7, passo 5).
 * Lontano dalle strade fini: un sito con la carreggiata entro `strada` m si scarta nel blocco (`casaSullaStrada`).
 */
export const CASE_CAMPAGNA = {
  gruppi: { minore: 4, casata: 6, maggiore: 9 }, villaggio: 3,
  daOrti: 60, fino: 0.95, candidati: 70, distanza: 150, pendenza: 8, piani: 50,
  quante: [0.4, 0.75],              // soglie: 1 casa sotto la prima, 2 sotto la seconda, altrimenti 3
  passo: [14, 22],                  // m tra le case di un gruppo
  aia: [12, 20],                    // m: niente oggetti entro il primo, pieni oltre il secondo
  orto: 26,                         // m: orto attorno alla casa
  strada: 9,
};
const _caseCache = new WeakMap();
/** Siti delle case della Carta: [{ x, z, verso (rad), gruppo, luogo }]. */
export function caseCampagna(carta) {
  if (_caseCache.has(carta)) return _caseCache.get(carta);
  const K = CASE_CAMPAGNA, out = [], es = { quota: 0, livello: NaN };
  const asciutto = (x, z) => {
    const h = quotaFinale(carta, x, z, undefined, es);
    return Number.isNaN(es.livello) && h > 0.5 && Number.isNaN(livelloLago(carta, x, z)) ? h : NaN;
  };
  const pianiTutti = (carta.luoghi || []).flatMap((l) => l.piani || []);
  const lontanoDaiPiani = (x, z) => pianiTutti.every((p) => distanzaPiano(p, x, z) - p.s > K.piani);
  const buono = (x, z) => {
    const h = asciutto(x, z);
    if (Number.isNaN(h) || !lontanoDaiPiani(x, z)) return false;
    for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
      const h2 = asciutto(x + dx, z + dz);
      if (Number.isNaN(h2) || Math.abs(h2 - h) > 12 * Math.tan(K.pendenza * Math.PI / 180)) return false;
    }
    return true;
  };
  (carta.luoghi || []).forEach((l, li) => {
    const R = raggiCampagna(l);
    if (!R) return;
    const n = l.tipo === 'rocca' ? (K.gruppi[l.classe] || K.gruppi.casata) : l.tipo === 'villaggio' ? K.villaggio : 0;
    if (!n) return;
    const sm = derivaSeme(carta.seme, 470 + li), r = mulberry32(sm);
    const pr = l.piani?.[0], ang0 = Math.atan2(pr?.uz ?? 0, pr?.ux ?? 1);
    const r0 = R[0] * 0.2 + K.daOrti, r1 = R[0] * K.fino;
    let presi = 0;
    for (let c = 0; c < K.candidati && presi < n; c++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r0 * r0 + r() * (r1 * r1 - r0 * r0));
      const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d;
      const q = r(), verso = ang0 + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.15;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < K.distanza) || !buono(x, z)) continue;
      const nCase = q < K.quante[0] ? 1 : q < K.quante[1] ? 2 : 3, gruppo = `${li}-${presi}`;
      out.push({ x, z, verso, gruppo, luogo: li });
      for (let k = 1; k < nCase; k++) {
        for (let t = 0; t < 6; t++) {
          const b = r() * Math.PI * 2, e = K.passo[0] + r() * (K.passo[1] - K.passo[0]);
          const xx = x + Math.cos(b) * e, zz = z + Math.sin(b) * e;
          if (out.some((o) => o.gruppo === gruppo && Math.hypot(o.x - xx, o.z - zz) < K.passo[0]) || !buono(xx, zz)) continue;
          out.push({ x: xx, z: zz, verso: verso + (r() < 0.3 ? Math.PI / 2 : 0), gruppo, luogo: li });
          break;
        }
      }
      presi++;
    }
  });
  _caseCache.set(carta, out);
  return out;
}

const CAMPI = ['ramo', 'campo', 'alberi', 'limite', 'conifera', 'pino', 'secco', 'riva', 'cespuglio', 'alto', 'sterpo', 'canne',
  'sasso', 'masso', 'affioramento', 'tronco', 'foresta', 'erba', 'felce', 'frana', 'ciottolo'];

/**
 * Quanto bosco (0–1) in un punto: il bosco della copertura (radure, alpeggi) con i bordi organici, i boschi di versante
 * sui pendii, disboscato nella campagna attorno ai luoghi. Unica definizione: la usano densitaVertice (gli alberi del
 * blocco) e boscoMondo (il colore della Carta). `pend`: pendenza «di zona» in gradi (come il colore, ~60 m).
 */
function forestaPunto(cp, pend, x, z, semeBordo, coltivato, sabbia, palude) {
  const V = VEGETAZIONE;
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
  // Campagna attorno a rocche e borghi (coltivato 0–1): il bosco è disboscato, restano alberi isolati e siepi.
  return Math.max(smoothstep(V.bosco.soglia[0], V.bosco.soglia[1], vista + e), versante) * (1 - 0.92 * coltivato);
}

/**
 * Bosco della Carta come funzione pura (richiesta della sessione M6, colore «naturale» della Carta):
 * (x, z, h, pendenza in gradi di zona) → { foresta, visibile } 0–1. `foresta` è quella di densitaVertice (bosco con
 * bordi, versante, campagna); `visibile` è il bosco che si vede davvero (anche limite degli alberi e roccia), lo stesso
 * che dà la lettiera. Senza distanza dall'acqua né rive (servono la griglia del blocco). `out` facoltativo da riusare.
 */
export function boscoMondo(carta, stagione = 0) {
  const copertura = coperturaMondo(carta, stagione), cp = nuovaCopertura();
  const semeBordo = derivaSeme(carta.seme, 401), campagna = campagnaMondo(carta);
  return (x, z, h, pendenza, out = { foresta: 0, visibile: 0 }) => {
    copertura(cp, x, z, h, pendenza);
    let sabbia = 0, palude = 0;
    for (let k = 0; k < 4; k++) {
      if (cp.bi[k] === BIOMA.SABBIA) sabbia += cp.w[k]; else if (cp.bi[k] === BIOMA.PALUDE) palude += cp.w[k];
    }
    const V = VEGETAZIONE, f = forestaPunto(cp, pendenza, x, z, semeBordo, campagna(x, z), sabbia, palude);
    const limite = smoothstep(CLIMA.bosco + V.limiteAlberi[0], CLIMA.bosco + V.limiteAlberi[1], cp.T);
    out.foresta = f; out.visibile = f * limite * (1 - cp.roccia);
    return out;
  };
}

/**
 * Densità per vertice della griglia del blocco: per ogni tipo la probabilità che una cella della sua griglia abbia
 * un oggetto, più i pesi delle specie di albero. `pend` è la pendenza «di zona» (come il colore), `pf` quella fine.
 */
function densitaVertice(cp, pend, pf, distAcqua, x, z, semeBordo, D, i, coltivato = 0, distFiume = 99) {
  const V = VEGETAZIONE;
  const prato = 1 - Math.max(cp.roccia, cp.neve, cp.ghiaia * 2);
  let sabbia = 0, palude = 0, nordSud = 0;
  for (let k = 0; k < 4; k++) {
    const b = cp.bi[k], w = cp.w[k];
    if (b === BIOMA.SABBIA) sabbia += w;
    else if (b === BIOMA.PALUDE) palude += w;
    else if (b === BIOMA.PIANURA_N || b === BIOMA.PIANURA_S) nordSud += w;
  }
  const foresta = forestaPunto(cp, pend, x, z, semeBordo, coltivato, sabbia, palude);
  const limite = smoothstep(CLIMA.bosco + V.limiteAlberi[0], CLIMA.bosco + V.limiteAlberi[1], cp.T);
  const ripido = 1 - smoothstep(V.pendenza.alberi[0], V.pendenza.alberi[1], pf);
  const riva = distAcqua >= V.riva.celle[0] && distAcqua <= V.riva.celle[1] && cp.T > 3 ? 1 : 0;
  // Fascia del bosco ripariale lungo i fiumi (non sopra il limite degli alberi né dove fa troppo freddo).
  const fasciaF = distFiume >= 1 && distFiume <= V.fiume.fascia.length && cp.T > 3 ? V.fiume.fascia[distFiume - 1] : 0;
  const isolati = (V.isolati.base + V.isolati.umidita * cp.umidita) * (1 + 2 * coltivato) * (1 - foresta) * prato * (1 - 0.8 * sabbia);
  const asciutto = distAcqua >= 1 ? 1 : 0;
  D.alberi[i] = asciutto * (1 - cp.neveFissa) * (1 - cp.roccia) * (1 - 0.8 * cp.ghiaia) * ripido * limite
    * Math.max(V.bosco.densita * foresta, isolati, riva * V.riva.densita, fasciaF * V.fiume.bosco, 0.04 * palude);
  D.limite[i] = limite;
  D.conifera[i] = Math.max(smoothstep(8, 3, cp.T), 0.6 * cp.monte);
  D.pino[i] = smoothstep(12, 16, cp.T) * smoothstep(0.55, 0.35, cp.umidita);
  D.secco[i] = 0.5 * palude + 0.15 * sabbia + 0.05 * foresta;   // legno morto: qualche albero secco anche nel bosco
  D.riva[i] = Math.max(riva * 0.8, fasciaF * 1.3);
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
  const sponda = distAcqua >= 1 && distAcqua <= 2 ? 1 : 0;           // ghiaia e sassi sulle rive
  // Rive dei fiumi (richiesta dell'utente: «pietre di diverse dimensioni lungo gli argini, senza esagerare»): in più
  // della sponda generica, sassi, ciottoli e qualche masso; di più sulla prima cella.
  const rivaF = distFiume === 1 ? 1 : distFiume === 2 ? 0.5 : 0;
  D.sasso[i] = asciutto * (1 - 0.7 * cp.neve) * (0.015 + 0.25 * cp.roccia + 1.4 * cp.ghiaia + 0.15 * piede + 0.12 * monte
    + 0.3 * D.frana[i] + 0.2 * sponda + V.fiume.sassi * rivaF);
  D.masso[i] = asciutto * (1 - 0.5 * cp.neve) * (0.015 + 2 * cp.ghiaia + 0.3 * cp.roccia * cp.alto + 0.25 * piede
    + 0.05 * monte + 0.7 * D.frana[i] + V.fiume.massi * rivaF);
  D.ciottolo[i] = asciutto * (1 - 0.8 * cp.neve) * Math.min(0.5, 0.02 + 0.3 * cp.roccia + 1.2 * cp.ghiaia + 0.15 * monte
    + 0.2 * piede + 0.35 * sponda + V.fiume.ciottoli * rivaF) * V.vicino.ciottolo;
  D.affioramento[i] = asciutto * (0.7 * cp.chiazze + 0.1 * cp.roccia);
  D.tronco[i] = asciutto * (0.06 * foresta + V.fiume.tronchi * fasciaF) * limite;
  D.ramo[i] = asciutto * (0.03 * foresta + V.fiume.rami * fasciaF) * (1 - cp.neve);
  // Vicino al cavaliere (erbaAttorno): ciuffi d'erba nei prati, felci nel sottobosco umido. E per il suolo (shader del
  // terreno): quanto bosco c'è sopra (lettiera).
  D.foresta[i] = foresta * limite * (1 - cp.roccia);
  D.erba[i] = asciutto * neve * (1 - cp.roccia) * Math.max(0, 1 - 2 * cp.ghiaia) * (1 - 0.95 * foresta) * (1 - 0.7 * sabbia)
    * (1 - smoothstep(38, 46, pf)) * V.vicino.erba;
  D.felce[i] = asciutto * neve * foresta * limite * smoothstep(0.3, 0.55, cp.umidita) * V.vicino.felce;
  // Campi coltivati: in piano, all'asciutto (non sulle rive), senza roccia, neve, ghiaia, sabbia né palude.
  const K = CAMPI_COLTIVATI;
  const campo = coltivato > 0 && distAcqua >= 3
    ? smoothstep(K.coltivato[0], K.coltivato[1], coltivato) * (1 - smoothstep(K.pendenza[0], K.pendenza[1], pf))
      * prato * (1 - cp.neve) * (1 - sabbia) * (1 - palude)
    : 0;
  D.campo[i] = campo;
  if (campo > 0) {
    // Netto: lo shader disegna un appezzamento già da campo ≈ 0,12–0,7 (soglia per appezzamento).
    const via = 1 - K.oggetti * smoothstep(0.05, 0.35, campo);
    for (const k of ['alberi', 'cespuglio', 'alto', 'sterpo', 'sasso', 'masso', 'affioramento', 'tronco', 'ramo', 'ciottolo']) D[k][i] *= via;
    D.erba[i] *= 1 - K.erba * campo;
  }
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
 * @param {object} [o.carta]  la Carta, per le strade (distanzaStrada, dopo generaScena); senza, niente strade
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

  // Distanza (in celle, fino a 3) dai soli fiumi: rive e alvei con sassi e massi (non laghi e mare).
  const DF = V.fiume.fascia.length + 1;
  const distFiume = new Uint8Array(n).fill(DF);
  if (o.acqua) {
    const cf = [];
    for (let i = 0; i < n; i++) {
      if (o.acqua.fiume[i] > heights[i] - 0.05 && !(o.acqua.lago[i] > heights[i] - 0.05)) { distFiume[i] = 0; cf.push(i); }
    }
    for (let q = 0; q < cf.length; q++) {
      const i = cf[q], d = distFiume[i] + 1;
      if (d >= DF) continue;
      const r = (i / cols) | 0, c = i - r * cols;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const rr = r + b, cc = c + a;
        if (rr < 0 || cc < 0 || rr >= cols || cc >= cols) continue;
        const j = rr * cols + cc;
        if (distFiume[j] > d) { distFiume[j] = d; cf.push(j); }
      }
    }
  }

  // Densità per vertice.
  const D = {};
  for (const k of CAMPI) D[k] = new Float32Array(n);
  const kz = Math.max(1, Math.round(COPERTURA.scalaPendenza / (2 * cell)));   // pendenza di zona, come il colore
  const semeBordo = derivaSeme(seme, 401), semeCampagna = derivaSeme(seme, 402);
  const luoghi = o.carta?.luoghi || null;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sx = (H(c + kz, r) - H(c - kz, r)) / (2 * kz * cell), sz = (H(c, r + kz) - H(c, r - kz)) / (2 * kz * cell);
      const pend = Math.atan(Math.hypot(sx, sz)) * 180 / Math.PI;
      const fx = (H(c + 1, r) - H(c - 1, r)) / (2 * cell), fz = (H(c, r + 1) - H(c, r - 1)) / (2 * cell);
      const pf = Math.atan(Math.hypot(fx, fz)) * 180 / Math.PI;
      const x = cx - half + c * cell, z = cz - half + r * cell;
      copertura(_cop, x, z, heights[i], pend);
      densitaVertice(_cop, pend, pf, dist[i], x, z, semeBordo, D, i, coltivatoIn(luoghi, x, z, semeCampagna), distFiume[i]);
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

  // Strade: metri oltre il bordo della carreggiata (Infinity se nessuna strada vicina).
  const _st = { d: Infinity, lato: 0, semi: 0, h: 0, classe: '' };   // usato anche per i campi
  const oltreStrada = o.carta?.strade ? (X, Z) => { distanzaStrada(o.carta, X, Z, _st); return _st.d - _st.semi; } : () => Infinity;
  /** Vegetazione alta ai lati della strada: niente entro `libero`, poi sempre più fitta fino a `radi`. */
  const lontanoDaStrada = (X, Z, ix, iz, sm) => {
    const m = oltreStrada(X, Z);
    if (m >= V.strada.radi) return true;
    if (m < V.strada.libero) return false;
    return hash2(ix, iz, sm ^ 0x5be0cd19) / 4294967296 < (m - V.strada.libero) / (V.strada.radi - V.strada.libero);
  };

  // Case fuori dal borgo (CASE_CAMPAGNA) in questo blocco, tolte quelle che la strada fine tocca. Attorno: aia libera
  // (densità di tutti gli oggetti a zero), poi orto (vedi aCampi); niente siepi né muretti.
  const KC = CASE_CAMPAGNA;
  const caseQui = o.carta ? caseCampagna(o.carta).filter((k) => Math.abs(k.x - cx) < half + 60 && Math.abs(k.z - cz) < half + 60
    && oltreStrada(k.x, k.z) >= KC.strada) : [];
  const dCasa = (X, Z) => { let m = Infinity; for (const k of caseQui) { const d = Math.hypot(X - k.x, Z - k.z); if (d < m) m = d; } return m; };
  if (caseQui.length) {
    for (let i = 0; i < n; i++) {
      const r = (i / cols) | 0, c = i - r * cols, d = dCasa(cx - half + c * cell, cz - half + r * cell);
      if (d >= KC.aia[1]) continue;
      const f = smoothstep(KC.aia[0], KC.aia[1], d);
      for (const k of CAMPI) if (k !== 'campo' && k !== 'foresta' && k !== 'limite' && k !== 'conifera' && k !== 'pino'
        && k !== 'secco' && k !== 'riva' && k !== 'frana') D[k][i] *= f;
    }
  }

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
  const chiome = new Float32Array(n);
  griglia(V.passoAlberi, sA, (ix, iz, X, Z, lx, lz, u) => {
    trova(lx, lz);
    const p = campo(D.alberi);
    if (u >= p || !asciutta()) return;
    const pf = pendenzaFine();
    if (pf > V.pendenza.alberi[1] || oltreScarpata(X, Z) < V.spianata || !lontanoDaStrada(X, Z, ix, iz, sA)) return;
    const wc = campo(D.conifera), wp = campo(D.pino), ws = campo(D.secco), wr = campo(D.riva);
    const wl = Math.max(0, 1 - wc - wp) * (1 - wr);
    const tot = wl + wc + wp + ws + wr;
    let v = (hash2(ix, iz, sA ^ 0x68e31da4) / 4294967296) * tot;
    const tipo = (v -= wr) < 0 ? T.riva : (v -= ws) < 0 ? T.secco : (v -= wc) < 0 ? T.conifera : (v -= wp) < 0 ? T.pino : T.latifoglia;
    // Margine del bosco: alberi più giovani e bassi dove il bosco sfuma nel prato.
    const fo = campo(D.foresta), giovani = 4 * fo * (1 - fo);
    const sc = (0.55 + 0.45 * campo(D.limite)) * (1 - 0.35 * giovani);
    emetti(tipo, ix, iz, sA, lx, lz, quota(), sc);
    // Chiome davvero piantate, per la lettiera: l'albero si somma ai 4 vertici vicini (bilineare).
    const gx = Math.min(cols - 1.001, (lx + half) / cell), gz = Math.min(cols - 1.001, (lz + half) / cell);
    const c0 = gx | 0, r0 = gz | 0, fx = gx - c0, fz = gz - r0, k = r0 * cols + c0;
    chiome[k] += sc * (1 - fx) * (1 - fz); chiome[k + 1] += sc * fx * (1 - fz);
    chiome[k + cols] += sc * (1 - fx) * fz; chiome[k + cols + 1] += sc * fx * fz;
  });
  // Gli altri tipi: ognuno la sua griglia.
  const regole = {
    cespuglio: D.cespuglio, 'arbusto alto': D.alto, sterpo: D.sterpo, canne: D.canne,
    sasso: D.sasso, masso: D.masso, affioramento: D.affioramento, tronco: D.tronco, ramo: D.ramo,
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
      if (vegetale ? !lontanoDaStrada(X, Z, ix, iz, sm) : oltreStrada(X, Z) < (t.nome === 'sasso' ? 0 : V.strada.massi)) return;
      emetti(t, ix, iz, sm, lx, lz, quota(), t.nome === 'masso' ? 1 + 1.2 * campo(D.frana) : 1);
    });
  });

  // Orientamento dei campi: lungo il verso del luogo più vicino con campagna (i solchi seguono il borgo).
  let campi = null, dMin = Infinity;
  for (const l of luoghi || []) {
    const R = raggiCampagna(l), d = Math.hypot(l.x - cx, l.z - cz);
    if (!R || d > R[1] * (1 + CAMPAGNA.bordo.ampiezza) + half * 1.5 || d >= dMin) continue;
    dMin = d;
    const pr = l.piani?.[0];
    const ux = pr?.ux ?? 1, uz = pr?.uz ?? 0, k = Math.hypot(ux, uz) || 1;
    campi = { x: l.x, z: l.z, ux: ux / k, uz: uz / k, orti: R[0] * 0.2 };
  }
  // Suolo per lo shader del terreno: per vertice [bosco sopra, vicinanza dell'acqua (1 nell'acqua, 0 oltre 4 celle)].
  // Niente lettiera nella spianata attorno a rocca e borgo (lì non ci sono alberi): sfuma in 30 m.
  // La lettiera segue gli alberi davvero piantati (chiome sfocate su 3×3 vertici, ~23 m), non solo la copertura:
  // dove il bosco è diradato (campagna attorno ai luoghi, margini) non restano macchie scure senza alberi sopra.
  // Bosco fitto: ~1 albero per cella di vertici (densità 0,62 su celle di 6 m) → piena da 0,7.
  // Terza componente: campi coltivati (CAMPI_COLTIVATI), fino a pochi metri dal piede delle scarpate.
  // Quarta componente: ghiaia sulle rive dei fiumi, a chiazze (richiesta dell'utente: «un po' di ghiaia sui bordi ogni
  // tanto», non sotto l'acqua).
  const suolo = new Float32Array(n * 4), sG = derivaSeme(seme, 461);
  for (let i = 0; i < n; i++) {
    const r = (i / cols) | 0, c = i - r * cols;
    const oltre = piani.length ? oltreScarpata(cx - half + c * cell, cz - half + r * cell) : Infinity;
    let somma = 0, peso = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr; if (rr < 0 || rr >= cols) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc; if (cc < 0 || cc >= cols) continue;
        const w = (dr ? 1 : 2) * (dc ? 1 : 2); somma += w * chiome[rr * cols + cc]; peso += w;
      }
    }
    const sotto = smoothstep(0.12, 0.7, somma / peso);
    suolo[i * 4] = D.foresta[i] * sotto * smoothstep(V.spianata, V.spianata + 30, oltre);
    suolo[i * 4 + 1] = dist[i] === 0 ? 1 : Math.max(0, 1 - (dist[i] - 1) / (V.acquaCelle - 1));
    suolo[i * 4 + 2] = D.campo[i] * smoothstep(2, 12, oltre)
      * (caseQui.length ? smoothstep(KC.aia[0] - 4, KC.aia[0] + 4, dCasa(cx - half + c * cell, cz - half + r * cell)) : 1);
    const dF = distFiume[i];
    if (dF <= 2) {
      const G = V.fiume.ghiaia;
      suolo[i * 4 + 3] = G.celle[dF] * smoothstep(G.soglia[0], G.soglia[1],
        fbm(cx - half + c * cell, cz - half + r * cell, sG, G.lunghezza, 2));
    }
  }

  // Coordinate dei campi per vertice (PARCELLE): q lungo e di traverso al verso del borgo, piegate; terza
  // componente: distanza dal luogo meno il raggio degli orti (< 0 negli orti). Lo shader le interpola sui triangoli
  // come qui sotto `attrCampi`, così le siepi oggetto stanno sulle strisce che lo shader dipinge.
  const PC = PARCELLE;
  let aCampi = null;
  if (campi) {
    aCampi = new Float32Array(n * 4);
    const sP1 = derivaSeme(seme, 403), sP2 = derivaSeme(seme, 404), sP3 = derivaSeme(seme, 405);
    const vx = -campi.uz, vz = campi.ux;
    for (let i = 0; i < n; i++) {
      const r = (i / cols) | 0, c = i - r * cols, x = cx - half + c * cell, z = cz - half + r * cell;
      // Il vertice e gli 8 vicini: ogni triangolo che tocca un campo ha tutti i vertici calcolati.
      let serve = false;
      for (let dr = -1; dr <= 1 && !serve; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < cols && cc >= 0 && cc < cols && suolo[(rr * cols + cc) * 4 + 2] > 0) { serve = true; break; }
      }
      if (!serve) continue;
      const dx = x - campi.x, dz = z - campi.z;
      aCampi[i * 4] = dx * campi.ux + dz * campi.uz + PC.piega.ampiezza * fbm(x, z, sP1, PC.piega.lunghezza, 1);
      aCampi[i * 4 + 1] = dx * vx + dz * vz + PC.piega.ampiezza * fbm(x, z, sP2, PC.piega.lunghezza, 1);
      const rumoreOrti = fbm(x, z, sP3, PC.orti.lunghezza, 1);
      aCampi[i * 4 + 2] = Math.min(Math.hypot(dx, dz) + PC.orti.bordo * rumoreOrti - campi.orti,
        dCasa(x, z) + 8 * rumoreOrti - KC.orto);                                   // orti anche attorno alle case
      // Quarta componente: lato della strada e margine. Dal lato positivo w = metri oltre il margine; dal lato
      // negativo w < 0 fino a `fascia` m (campi propri lungo la strada), poi torna positivo: |w| piccolo = capezzagna
      // (lungo il margine della strada e in fondo alla fascia). Dipende solo dal punto: blocchi vicini uguali.
      let w = PC.strada.lontano;
      if (o.carta?.strade) {
        distanzaStrada(o.carta, x, z, _st);
        const m = Math.max(0.01, _st.d - _st.semi), F = PC.strada.fascia;
        if (_st.d < Infinity) w = _st.lato >= 0 || m >= F ? Math.min(PC.strada.lontano, _st.lato >= 0 ? m : m - F)
          : -Math.min(m, F - m);
      }
      aCampi[i * 4 + 3] = w;
    }
  }
  // Valore di un attributo per vertice nel punto trovato (`trova`), interpolato sul triangolo come la scheda video.
  const triangolo = (A, stride, k) => {
    const i = _r * cols + _c, a = A[i * stride + k], b = A[(i + 1) * stride + k];
    const d = A[(i + cols) * stride + k], e = A[(i + cols + 1) * stride + k];
    return _u + _v <= 1 ? a + (b - a) * _u + (d - a) * _v : e + (d - e) * (1 - _u) + (b - e) * (1 - _v);
  };

  // Siepi e filari sui confini dei campi (richiesta dell'utente). Si cammina sui confini nello spazio q a passo fisso
  // (reticolo del mondo: blocchi vicini trovano gli stessi punti), si torna al mondo invertendo la piega e si tiene
  // il punto solo se lo shader lo vede davvero su quel confine, dentro un campo dipinto.
  if (aCampi) {
    let qx0 = Infinity, qx1 = -Infinity, qy0 = Infinity, qy1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (suolo[i * 4 + 2] <= 0.05) continue;
      const qx = aCampi[i * 4], qy = aCampi[i * 4 + 1];
      if (qx < qx0) qx0 = qx; if (qx > qx1) qx1 = qx; if (qy < qy0) qy0 = qy; if (qy > qy1) qy1 = qy;
    }
    const S = PC.siepi, par = {}, ver = {};
    const sP1 = derivaSeme(seme, 403), sP2 = derivaSeme(seme, 404);
    const sS = derivaSeme(seme, 406);
    const vx = -campi.uz, vz = campi.ux;
    // q → mondo: q = R·d + piega(X); tre passi bastano (la piega cambia su 128 m).
    const alMondo = (qx, qy, out) => {
      let wx = 0, wy = 0;
      for (let k = 0; k < 3; k++) {
        const a = qx - wx, b = qy - wy;
        out.x = campi.x + a * campi.ux + b * vx; out.z = campi.z + a * campi.uz + b * vz;
        wx = PC.piega.ampiezza * fbm(out.x, out.z, sP1, PC.piega.lunghezza, 1);
        wy = PC.piega.ampiezza * fbm(out.x, out.z, sP2, PC.piega.lunghezza, 1);
      }
      return out;
    };
    const P = {};
    // Un oggetto della siepe nel punto q (sul lato `lato`: 0 lungo, 1 corto, dell'appezzamento i, j).
    const pianta = (qx, qy, i, j, lato, albero, ix, iz, ls) => {
      alMondo(qx, qy - ls * PC.strada.lato, P);
      const lx = P.x - cx, lz = P.z - cz;
      if (lx < -half || lx > half || lz < -half || lz > half) return;
      trova(lx, lz);
      if (!asciutta() || pendenzaFine() > 28) return;
      if (triangolo(aCampi, 4, 2) < 0) return;                                       // orto
      const w = triangolo(aCampi, 4, 3);                                             // lato e margine della strada
      if ((w < 0 ? 1 : 0) !== ls || Math.abs(w) < PC.strada.margine[1]) return;
      parcella(triangolo(aCampi, 4, 0), triangolo(aCampi, 4, 1) + ls * PC.strada.lato, 0, ver);
      if (ver.i !== i || ver.j !== j || (lato ? ver.fu : ver.fv) > S.striscia[0]) return;
      if (triangolo(suolo, 4, 2) < 0.12 + 0.6 * hashCampi(i, j + 41) / 255 + 0.04) return;   // campo non dipinto
      if (oltreScarpata(P.x, P.z) < 3 || oltreStrada(P.x, P.z) < V.strada.libero) return;
      if (dCasa(P.x, P.z) < KC.aia[1] + 2) return;
      const h = hash2(ix, iz, sS);
      if (albero) { emetti(h & 1 ? T.riva : T.latifoglia, ix, iz, sS, lx, lz, quota(), 0.9); return; }
      // Muretto: vicino al luogo e sui lati scelti, fuori dal varco; orientato lungo il confine (direzione misurata
      // invertendo la piega mezzo metro prima e dopo).
      // Siepi e muretti non si attraversano (richiesta dell'utente): su ogni lato un varco dove cessano e si passa.
      const M = PC.muretti, y = quota();
      const lungo = lato ? ver.W : ver.L, lungoQui = lato ? ver.fv : ver.fu;
      const eMuro = triangolo(aCampi, 4, 2) < M.oltreOrti && muro(i, j, lato);
      if (eMuro ? Math.abs(lungoQui - varco(i, j, lato, lungo)) < M.varco : aperturaSiepe(i, j, lato, lungoQui)) return;
      if (eMuro) {
        // Diritto: sulla linea a M.dentro dal confine, senza lo spostamento di traverso delle siepi.
        const qxS = lato ? ver.u0 + M.dentro : qx, qyS = (lato ? qy : j * ver.W + M.dentro) - ls * PC.strada.lato;
        alMondo(qxS, qyS, P);
        const ax = P.x, az = P.z;
        alMondo(lato ? qxS : qxS + 0.5, lato ? qyS + 0.5 : qyS, P);
        const bx = P.x, bz = P.z;
        alMondo(lato ? qxS : qxS - 0.5, lato ? qyS - 0.5 : qyS, P);
        const rot = Math.atan2(-(bz - P.z), bx - P.x);
        const hm = hash2(ix, iz, sS ^ 0x6c62272e);
        buffer.muretto.push(ax - cx, y, az - cz, 0.95 + 0.15 * (hm & 0xff) / 255, rot, (hm >>> 26) / 64);
        return;
      }
      emetti(T.siepe, ix, iz, sS, lx, lz, y, 1);
    };
    const passoL = S.passo;
    for (let ls = 0; ls < 2; ls++)
    for (let jb = Math.floor((qy0 + ls * PC.strada.lato) / PC.banda[0]); jb * PC.banda[0] <= qy1 + ls * PC.strada.lato; jb++) {
      const W = PC.banda[0] / (2 + Math.floor(hashCampi(jb, 7) * PC.extra[0] / 256));
      for (let j = Math.round(jb * PC.banda[0] / W), jn = j + Math.round(PC.banda[0] / W); j < jn; j++) {
        const hj = hashCampi(j, 3) / 255, L = PC.lungo[0][0] + PC.lungo[0][1] * hj, off = hj * PC.spostamento;
        for (let i = Math.floor((qx0 + off) / L); i * L - off <= qx1; i++) {
          const u0 = i * L - off;
          // Lato lungo (in basso, fv = dentro): cespugli ogni passo o alberi ogni passoFilare.
          if (siepeLunga(i, j)) {
            const alb = filare(i, j, 0), ps = alb ? S.passoFilare : passoL;
            for (let k = Math.ceil((u0 + 1) / ps); k * ps < u0 + L - 1; k++) {
              const jit = hash2(k, j, sS ^ 0x51ed270b);
              pianta(k * ps + ((jit & 0xff) / 255 - 0.5) * 0.35 * ps, j * W + S.dentro + (((jit >>> 8) & 0xff) / 255 - 0.5) * 0.5,
                i, j, 0, alb, k, j * 2, ls);
            }
          }
          // Lato corto (a sinistra, fu = dentro).
          if (siepeCorta(i, j)) {
            const alb = filare(i, j, 1), ps = alb ? S.passoFilare : passoL;
            for (let k = Math.ceil((j * W + 2.5) / ps); k * ps < (j + 1) * W - 0.5; k++) {
              const jit = hash2(i, k, sS ^ 0x2f8b1c3d);
              pianta(u0 + S.dentro + ((jit & 0xff) / 255 - 0.5) * 0.5, k * ps + (((jit >>> 8) & 0xff) / 255 - 0.5) * 0.35 * ps,
                i, j, 1, alb, i, k * 2 + 1, ls);
            }
          }
        }
      }
    }
  }

  // Pietre nell'alveo dei fiumi (non laghi né mare): sul fondo, solo dove affiorano o restano a pelo d'acqua.
  if (o.acqua) {
    const A = V.fiume.alveo, sA = derivaSeme(seme, 460), F = o.acqua.fiume, Lg = o.acqua.lago;
    griglia(A.passo, sA, (ix, iz, X, Z, lx, lz, u) => {
      trova(lx, lz);
      const i = _r * cols + _c;
      // I fiumi sono larghi uno o due vertici: il pelo è la media dei vertici bagnati della cella, e il punto è
      // nell'alveo se il fondo sta sotto.
      let pelo = 0, nb = 0;
      for (const k of [i, i + 1, i + cols, i + cols + 1]) {
        if (Lg[k] > heights[k] - 0.05) return;
        if (F[k] > heights[k] - 0.05) { pelo += F[k]; nb++; }
      }
      if (!nb) return;
      pelo /= nb;
      const fondo = quota(), prof = pelo - fondo;
      if (prof <= 0.03 || prof > A.profondita || u >= A.probabilita * (1 - 0.6 * prof / A.profondita)) return;
      // Grandezza scelta perché la pietra affiori di `affiora` m (l'acqua è quasi opaca: sommersa non si vedrebbe):
      // sassi dove l'acqua è bassa, massi dove è più fonda o a caso.
      // La cima affiora di `affiora` m: la quota della pietra si sceglie per questo (la parte sotto il pelo resta
      // nascosta dall'acqua). Altezza della cima come la mesh in vegetazione3d.js: cima del modello per unità di scala
      // (prudente) × fattore d'altezza delle rocce (0,55 + 0,7·v), meno l'affondamento delle rocce (0,15·scala).
      const h = hash2(ix, iz, sA ^ 0x2545f491), e = A.affiora[0] + (A.affiora[1] - A.affiora[0]) * (h & 0xff) / 255;
      const masso = prof > 0.45 || ((h >>> 8) & 0xff) / 256 < A.massi;
      const t = masso ? T.masso : T.sasso, v = (h >>> 26) / 64;
      const sc = masso ? 0.6 + 1.0 * ((h >>> 16) & 0xff) / 255 : 0.9 + 1.1 * ((h >>> 16) & 0xff) / 255;
      const cima = sc * ((masso ? 0.75 : 0.2) * (0.55 + 0.7 * v) - 0.15);
      const y = Math.max(fondo, pelo + e - cima);
      if (y + cima < pelo + 0.03) return;
      buffer[t.nome].push(lx, y, lz, sc, ((h >>> 4) & 0x3ff) / 1024 * 2 * Math.PI, v);
    });
  }

  const tipi = {};
  for (const t of TIPI) {
    const b = buffer[t.nome];
    tipi[t.nome] = { dati: Float32Array.from(b), n: b.length / STRIDE, gruppo: t.gruppo };
  }
  /**
   * Erba, felci e ciottoli in un cerchio attorno a (lx, lz) locali, raggio per tipo ({erba, felce, ciottolo}) o unico: stesse regole (griglie del mondo, hash) del resto,
   * quindi tornando in un punto si ritrovano gli stessi ciuffi. Formato come `tipi` (STRIDE per oggetto).
   */
  const sE = derivaSeme(seme, 450), sF = derivaSeme(seme, 451), sC = derivaSeme(seme, 452);
  // `fascia` (facoltativa) [k, n]: solo la k-esima di n fasce di righe del cerchio (lavoro diviso tra fotogrammi;
  // le fasce insieme danno esattamente il cerchio intero).
  function erbaAttorno(lx0, lz0, raggi, fascia = null) {
    const esito = {};
    for (const [nome, P, sm, A] of [['erba', V.vicino.passoErba, sE, D.erba], ['felce', V.vicino.passoFelci, sF, D.felce],
      ['ciottolo', V.vicino.passoCiottoli, sC, D.ciottolo]]) {
      const b = [], r = typeof raggi === 'number' ? raggi : raggi[nome] ?? 0;
      if (r <= 0) { esito[nome] = { dati: new Float32Array(0), n: 0 }; continue; }
      const X0 = cx + lx0, Z0 = cz + lz0;
      const i0 = Math.floor((X0 - r) / P), i1 = Math.floor((X0 + r) / P);
      let j0 = Math.floor((Z0 - r) / P), j1 = Math.floor((Z0 + r) / P);
      if (fascia) {
        const nR = j1 - j0 + 1, a = j0 + Math.floor(nR * fascia[0] / fascia[1]);
        j1 = j0 + Math.floor(nR * (fascia[0] + 1) / fascia[1]) - 1; j0 = a;
      }
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
          if (oltreStrada(X, Z) < (nome === 'felce' ? V.strada.libero : 0)) continue;
          const h = hash2(ix, iz, sm ^ 0x2545f491);
          b.push(lx, quota(), lz, 0.7 + 0.6 * ((h & 0xffff) / 65536), ((h >>> 16) & 0x3ff) / 1024 * 2 * Math.PI, (h >>> 26) / 64);
        }
      }
      esito[nome] = { dati: Float32Array.from(b), n: b.length / STRIDE };
    }
    return esito;
  }

  return { tipi, ms: performance.now() - t0, msCampi, suolo, campi, aCampi, case: caseQui, erbaAttorno };
}

// ─── Bosco lontano (sagome negli anelli dell'orizzonte) ──────────────────

/** Tessere dell'atlante delle sagome (js/3d/vegetazione3d.js): una per forma d'albero. */
export const SAGOME = { latifogliaTonda: 0, latifogliaOvale: 1, conifera: 2, pino: 3, riva: 4, secco: 5 };

/** Parametri del bosco lontano ([Ipotesi] da tarare guardando e misurando). */
export const BOSCO_LONTANO = {
  griglia: 50,          // m: passo della griglia grossolana su cui si valutano copertura e quota
  raggio: 3000,         // m (in quadrato, dal centro del blocco): oltre, il bosco resta un colore
  // Prestazioni (misura della sessione M1: 137 000 sagome con alpha test raddoppiavano il fotogramma): oltre `da` m
  // la densità cala fino a `fino` a `a` m.
  dirada: { da: 1300, a: 3000, fino: 0.08 },
  // La cella degli alberi cresce con la distanza (10 m al bordo del blocco, 20 m a 2 km): la densità cala come 1/d².
  // Gli alberi restano della stessa taglia di quelli del blocco (l'utente: «gli alberi lontani sono molto grandi in
  // proporzione»): prima la scala cresceva con la cella e col diradamento, fino a ×6 a 3 km.
  cella: 10,
};

/**
 * Alberi degli anelli dell'orizzonte attorno al blocco centrato in (cx, cz) del mondo: stesse regole del bosco del
 * blocco (densitaVertice, coperturaMondo) valutate su una griglia grossolana, tra il bordo del blocco (`half`) e
 * BOSCO_LONTANO.raggio. `quota(x, z)` (coordinate locali) dà la quota della superficie disegnata degli anelli.
 * @returns {{ dati: Float32Array, n: number, ms: number }}  per albero: x, quota, z (locali), scala, tessera (SAGOME)
 */
export function boscoLontano(carta, cx, cz, half, quota, stagione = 0) {
  const t0 = performance.now();
  const B = BOSCO_LONTANO, G = B.griglia, R = B.raggio;
  const copertura = coperturaMondo(carta, stagione), semeBordo = derivaSeme(carta.seme, 401);
  const semeCampagna = derivaSeme(carta.seme, 402);
  // Griglia grossolana su [-R, R]² (locali): quote, poi densità e pesi delle specie.
  const ng = Math.ceil(2 * R / G) + 1, n = ng * ng;
  const H = new Float32Array(n);
  for (let r = 0; r < ng; r++) {
    for (let c = 0; c < ng; c++) {
      const x = -R + c * G, z = -R + r * G;
      const h = Math.max(Math.abs(x), Math.abs(z)) < half ? NaN : quota(x, z);
      H[r * ng + c] = h;
    }
  }
  const D = {};
  for (const k of CAMPI) D[k] = new Float32Array(1);
  const alb = new Float32Array(n), con = new Float32Array(n), pin = new Float32Array(n), sec = new Float32Array(n);
  const lim = new Float32Array(n);
  const Hc = (c, r) => H[Math.min(ng - 1, Math.max(0, r)) * ng + Math.min(ng - 1, Math.max(0, c))];
  for (let r = 0; r < ng; r++) {
    for (let c = 0; c < ng; c++) {
      const i = r * ng + c, h = H[i];
      if (Number.isNaN(h)) continue;
      const x = -R + c * G, z = -R + r * G;
      // Laghi e mare: niente alberi.
      if (h < 0.5 || !Number.isNaN(livelloLago(carta, cx + x, cz + z))) continue;
      const hx = Hc(c + 1, r) - Hc(c - 1, r), hz = Hc(c, r + 1) - Hc(c, r - 1);
      const g = Number.isNaN(hx) || Number.isNaN(hz) ? 0 : Math.hypot(hx, hz) / (2 * G);
      const pend = Math.atan(g) * 180 / Math.PI;
      copertura(_cop, cx + x, cz + z, h, pend);
      densitaVertice(_cop, pend, pend, VEGETAZIONE.acquaCelle, cx + x, cz + z, semeBordo, D, 0,
        coltivatoIn(carta.luoghi, cx + x, cz + z, semeCampagna));
      alb[i] = D.alberi[0]; con[i] = D.conifera[0]; pin[i] = D.pino[0]; sec[i] = D.secco[0]; lim[i] = D.limite[0];
    }
  }
  const campo = (A, x, z) => {
    let fx = (x + R) / G, fz = (z + R) / G;
    const c = Math.min(ng - 2, Math.max(0, Math.floor(fx))), r = Math.min(ng - 2, Math.max(0, Math.floor(fz)));
    fx -= c; fz -= r;
    const i = r * ng + c;
    return (A[i] * (1 - fx) + A[i + 1] * fx) * (1 - fz) + (A[i + ng] * (1 - fx) + A[i + ng + 1] * fx) * fz;
  };
  // Alberi: bande di distanza con cella 6·2^k; dentro la banda si accetta con (cella banda / cella voluta)².
  const out = [], sA = derivaSeme(carta.seme, 470);
  for (let k = 0, d0 = half; d0 < R; k++, d0 *= 2) {
    const d1 = Math.min(R, d0 * 2), P = B.cella * 2 ** k;
    const i0 = Math.floor((cx - d1) / P), i1 = Math.ceil((cx + d1) / P);
    const j0 = Math.floor((cz - d1) / P), j1 = Math.ceil((cz + d1) / P);
    for (let iz = j0; iz <= j1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const hj = hash2(ix, iz, sA ^ 0x9e3779b9);
        const X = (ix + (hj & 0xffff) / 65536) * P, Z = (iz + (hj >>> 16) / 65536) * P;
        const x = X - cx, z = Z - cz, d = Math.max(Math.abs(x), Math.abs(z));
        if (d < d0 || d >= d1) continue;
        const voluta = B.cella * d / half;                       // cella «continua» a questa distanza
        const t = Math.min(1, Math.max(0, (d - B.dirada.da) / (B.dirada.a - B.dirada.da)));
        const dirada = 1 - (1 - B.dirada.fino) * t;
        const p = campo(alb, x, z) * (P / voluta) * (P / voluta) * dirada;
        if (hash2(ix, iz, sA) / 4294967296 >= p) continue;
        const y = quota(x, z);
        if (Number.isNaN(y)) continue;
        const wc = campo(con, x, z), wp = campo(pin, x, z), ws = campo(sec, x, z);
        const wl = Math.max(0, 1 - wc - wp);
        const h2 = hash2(ix, iz, sA ^ 0x68e31da4);
        let v = (h2 / 4294967296) * (wl + wc + wp + ws);
        const tessera = (v -= ws) < 0 ? SAGOME.secco : (v -= wc) < 0 ? SAGOME.conifera : (v -= wp) < 0 ? SAGOME.pino
          : (h2 & 1 ? SAGOME.latifogliaTonda : SAGOME.latifogliaOvale);
        // Stessa distribuzione di taglie del blocco (TIPI: [0,45, 1,45] con curva 1,4) e stesso limite degli alberi.
        const eta = 0.45 + 1.0 * (((h2 >>> 8) & 0xff) / 256) ** 1.4;
        const scala = eta * (0.55 + 0.45 * campo(lim, x, z));
        out.push(x, y, z, scala, tessera);
      }
    }
  }
  return { dati: Float32Array.from(out), n: out.length / 5, ms: performance.now() - t0 };
}

