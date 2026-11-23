// Knight Dawn — blocco di terreno di una Scena ricavato dalla Carta (M6, passo 3).
// Modulo ES senza grafica né DOM.
//
// La quota di un punto del mondo è una funzione pura delle sue coordinate (e del seme): blocchi vicini
// combaciano senza giunture, e una Scena si rigenera identica senza salvare il terreno.
//   quota = Carta interpolata (B-spline cubica sui centri delle celle da 1 km: liscia, senza pieghe a
//           griglia) + dettaglio su più scale (fBm «eroso»), con ampiezza che cresce con la quota.
//
// Coordinate del mondo: metri; x verso est dal bordo ovest della Carta, z verso sud dal bordo nord.
// La cella (c, r) della Carta copre [c·cella, (c+1)·cella] × [r·cella, (r+1)·cella].
// Il blocco usa coordinate locali centrate sul suo centro (vedi docs/ESPLORAZIONE_3D.md, Coordinate).

import { gradienteD, derivaSeme, smoothstep, ridged, completa } from './rumore.js';
import { ACQUA, profiloMassicci } from './carta.js';
import { tracciaPercorso, lettoMonotono, PERCORSO } from './fiumi.js';
import { spianaStrade, raffinaStrade, raffinaStradeAPezzi, stradeBlocco, attraversamentiBlocco } from './strade.js';   // import circolare: usate solo dentro le funzioni

export const SCENA = { lato: 2000, celle: 256 };   // 2×2 km, 257×257 vertici (come Tavullia)

// Dettaglio: lunghezza d'onda della prima ottava (m), ottave, ampiezza in funzione della quota.
const DETTAGLIO = {
  lunghezza: 1400, ottave: 6, guadagno: 0.5,
  // Ampiezza (m) in funzione della quota h della Carta: bassa in pianura, poi cresce forte dalla fascia
  // collinare (valli e crinali come a Tavullia: ~100 m di fondo valle ogni 500–800 m).
  // Tetto: oltre ~1300 m non cresce più (montagne percorribili a tratti, non pareti ovunque).
  ampiezza: { base: 8, perMetro: 0.05, collina: 0.32, rampa: [120, 420], massimo: 480, fondale: 1.5 },
  // Forma della Carta (passo 6, dopo la prova): l'ampiezza non cresce più con la sola quota oltre `tetto` m
  // (in pedemonte era ~415 m, un labirinto di gobbe uguale ovunque); cresce con il rilievo locale della Carta
  // (dislivello nelle 3×3 celle attorno, × perRilievo) ed è piena sulle creste, ridotta a `valle` nei fondovalle.
  forma: { tetto: 600, perRilievo: 0.3, valle: 0.65, cresta: 0.5 },
  // Montagna: oltre la rampa (quota della Carta) torna a crescere fino a `extra` m in più, piena sulle creste:
  // vette e crinali aspri, fondovalle percorribili.
  montagna: { rampa: [1200, 2200], extra: 220 },
  // Versanti lunghi in montagna (come Alpi e Montagne Rocciose): salendo di quota le ottave fini (350, 175, 88,
  // 44 m) si spengono di questa parte; la forma la fanno le scale grandi (1,4 km e 700 m). Con le ottave fini
  // piene la montagna era un «mare di schiuma» di gobbe e conche ogni 100–200 m.
  versanti: { quota: [600, 1500], spegni: [0, 0, 0.6, 0.88, 0.94, 0.97] },
  // Gruppi montuosi (Carta: massicci): torri con pareti sopra ghiaioni; pareti e cime un po' frastagliate.
  massicci: { frastaglio: 40, lunghezza: 260, ottave: 2, liscio: 0.7 },
  erosione: 1.0,                // quanto la pendenza accumulata smorza le ottave fini
};

// Rotazione tra un'ottava e l'altra (costanti esatte: 0,8 e 0,6), così le griglie non si allineano.
const RC = 0.8, RS = 0.6;

// Laghi in quota: nella B-spline il fondo del lago (anche 200 m sotto il livello) trascinava in basso le rive
// fino a ~1 km, e l'acqua restava sospesa sopra una riva più bassa del livello. Si leviga una quota in cui le
// celle di lago valgono il livello, poi si toglie la profondità del lago interpolata tra le celle: a riva il
// terreno resta quello dei dintorni, al centro del lago torna il fondo.
const _liscia = new WeakMap();
function quoteLisce(carta) {
  let q = _liscia.get(carta);
  if (q) return q;
  const { quota, acque, livelloAcqua } = carta;
  const base = Float32Array.from(quota), fondo = new Float32Array(quota.length);
  if (acque) {
    for (let i = 0; i < quota.length; i++) {
      if (acque[i] === ACQUA.LAGO) { base[i] = livelloAcqua[i]; fondo[i] = livelloAcqua[i] - quota[i]; }
    }
  }
  if (carta.mare) correggiCosta(carta, base);
  q = { base, fondo };
  _liscia.set(carta, q);
  return q;
}

// La B-spline cubica non interpola: al centro di una cella vale 4/9 della cella e il resto delle vicine. Un braccio
// di mare largo 1–2 km (celle a −40 m) fra terre a 100–200 m saliva sopra lo zero: nella Scena era terra, sulla
// Carta mare, e la Carta non lasciava sceglierlo [segnalato dall'utente]. Comanda la Carta: si abbassano i punti di
// controllo del mare (e si alzano quelli della terra) finché al centro di ogni cella il segno è quello della Carta.
const COSTA_SCENA = { mare: 15, terra: 3, giri: 12 };   // m sotto/sopra lo zero al centro della cella

function correggiCosta(carta, base) {
  const { cols, rows, mare } = carta, K = COSTA_SCENA, W = [1 / 6, 4 / 6, 1 / 6];
  const valore = (x, y) => {
    let s = 0;
    for (let b = -1; b <= 1; b++) {
      const j = specchio(y + b, rows);
      for (let a = -1; a <= 1; a++) s += W[a + 1] * W[b + 1] * base[j * cols + specchio(x + a, cols)];
    }
    return s;
  };
  for (let giro = 0; giro < K.giri; giro++) {
    let cambiate = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, v = valore(x, y);
        // Si corregge di poco più del necessario (le vicine si muovono anch'esse): converge in pochi giri.
        if (mare[i] && v > -K.mare) { base[i] -= 1.2 * (v + K.mare) / (W[1] * W[1]); cambiate++; }
        else if (!mare[i] && v < K.terra) { base[i] += 1.2 * (K.terra - v) / (W[1] * W[1]); cambiate++; }
      }
    }
    if (!cambiate) break;
  }
}

/**
 * Indice di cella riflesso ai bordi della Carta: oltre il confine il terreno prosegue a specchio (terre
 * selvagge, invalicabili), invece di ripetere all'infinito l'ultima cella (con il mondo di 120×90 km e
 * l'orizzonte a 110 km il bordo si vede quasi sempre: ripetuto, era una striscia piatta e innaturale).
 */
export function specchio(i, n) {
  const p = 2 * n, r = ((i % p) + p) % p;
  return r < n ? r : p - 1 - r;
}

/** Quota della Carta interpolata con una B-spline cubica (m), nel punto (x, z) del mondo. */
export function quotaCarta(carta, x, z) {
  const { cols, rows, cella } = carta;
  const { base, fondo } = quoteLisce(carta);
  const u = x / cella - 0.5, v = z / cella - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const tu = u - i0, tv = v - j0;
  const wu = pesi(tu), wv = pesi(tv);
  let somma = 0;
  for (let b = 0; b < 4; b++) {
    const j = specchio(j0 - 1 + b, rows);
    let riga = 0;
    for (let a = 0; a < 4; a++) {
      const i = specchio(i0 - 1 + a, cols);
      riga += wu[a] * base[j * cols + i];
    }
    somma += wv[b] * riga;
  }
  // Profondità dei laghi, bilineare tra i centri delle celle (le stesse dell'indicatore «lago»).
  for (let b = 0; b < 2; b++) {
    const j = specchio(j0 + b, rows);
    for (let a = 0; a < 2; a++) {
      const i = specchio(i0 + a, cols);
      const f = fondo[j * cols + i];
      if (f > 0) somma -= f * (a ? tu : 1 - tu) * (b ? tv : 1 - tv);
    }
  }
  return somma;
}

// Forma della Carta per cella: dislivello nelle 3×3 celle attorno e convessità (quota meno la media delle
// 5×5 attorno: > 0 sulle creste, < 0 nei fondovalle). Interpolate bilineari tra i centri delle celle.
const _forma = new WeakMap();
const _f = { rilievo: 0, convesso: 0 };
function formaCarta(carta, x, z) {
  const { cols, rows, cella } = carta;
  let F = _forma.get(carta);
  if (!F) {
    const q = quoteLisce(carta).base;
    const ril = new Float32Array(cols * rows), conv = new Float32Array(cols * rows);
    const Q = (i, j) => q[Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let mn = Infinity, mx = -Infinity, s = 0;
        for (let b = -2; b <= 2; b++) {
          for (let a = -2; a <= 2; a++) {
            const v = Q(i + a, j + b);
            s += v;
            if (a >= -1 && a <= 1 && b >= -1 && b <= 1) { if (v < mn) mn = v; if (v > mx) mx = v; }
          }
        }
        ril[j * cols + i] = Math.max(0, mx - mn);
        conv[j * cols + i] = q[j * cols + i] - s / 25;
      }
    }
    F = { ril, conv };
    _forma.set(carta, F);
  }
  const u = x / cella - 0.5, v = z / cella - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
  let r = 0, c = 0;
  for (let b = 0; b < 2; b++) {
    const j = specchio(j0 + b, rows);
    for (let a = 0; a < 2; a++) {
      const i = specchio(i0 + a, cols);
      const w = (a ? fu : 1 - fu) * (b ? fv : 1 - fv);
      r += w * F.ril[j * cols + i]; c += w * F.conv[j * cols + i];
    }
  }
  _f.rilievo = r; _f.convesso = c;
  return _f;
}

function pesi(t) {
  const t2 = t * t, t3 = t2 * t, s = 1 - t;
  return [s * s * s / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

const _n = [0, 0, 0];

/**
 * fBm «eroso» (alla maniera di I. Quílez): ogni ottava è divisa per (1 + |gradiente accumulato|²),
 * così sui versanti ripidi il dettaglio fine si smorza e il rilievo prende valli lisce e creste nette.
 * Risultato circa in [−1, 1].
 * `pesi` (facoltativo): peso di ogni ottava, 0…1. L'orizzonte spegne le ottave fini con la distanza; senza
 * pesi il calcolo è identico a quello del blocco della Scena (le quote al bordo coincidono).
 */
function fbmEroso(x, z, seed, pesi = null) {
  const D = DETTAGLIO;
  let px = x / D.lunghezza, pz = z / D.lunghezza;
  let somma = 0, amp = 1, norma = 0, dx = 0, dz = 0;
  for (let o = 0; o < D.ottave; o++) {
    const p = pesi ? pesi[o] : 1;
    if (p > 0) {
      gradienteD(px, pz, (seed + Math.imul(o, 0x9e3779b9)) | 0, _n);
      dx += _n[1] * amp; dz += _n[2] * amp;
      const c = amp * _n[0] / (1 + D.erosione * (dx * dx + dz * dz));
      somma += pesi ? c * p : c;
    }
    norma += amp;
    amp *= D.guadagno;
    const qx = (RC * px - RS * pz) * 2, qz = (RS * px + RC * pz) * 2;   // ruota e raddoppia
    px = qx + 1.7; pz = qz - 3.1;
  }
  return (somma / norma) * 1.8;
}

/** Numero di ottave del dettaglio e loro lunghezze d'onda (m), per chi le spegne con la distanza. */
export const OTTAVE_DETTAGLIO = Array.from({ length: DETTAGLIO.ottave }, (_, o) => DETTAGLIO.lunghezza / 2 ** o);

/**
 * Quota (m) del mondo generato nel punto (x, z), in metri del mondo.
 * `pesi`: vedi fbmEroso (solo per l'orizzonte; il blocco della Scena non li passa).
 */
export function quotaMondo(carta, x, z, seedDettaglio = derivaSeme(carta.seme, 101), pesi = null) {
  const h = quotaCarta(carta, x, z);
  const A = DETTAGLIO.ampiezza, Fo = DETTAGLIO.forma;
  // Sulla costa il dettaglio resta pieno: su un pendio così dolce sposta la riva di ~100 m e la rende
  // irregolare (insenature, lingue di terra). Verso il largo si spegne.
  let ampiezza;
  if (h > 0) {
    const hq = Math.min(h, Fo.tetto);
    const { rilievo, convesso } = formaCarta(carta, x, z);
    // Cresta o fondovalle: quanto la Carta sta sopra la media dei dintorni, rispetto al rilievo locale.
    const cresta = smoothstep(-Fo.cresta, Fo.cresta, convesso / (rilievo + 20));
    ampiezza = Math.min(A.massimo, A.base + A.perMetro * hq + A.collina * hq * smoothstep(A.rampa[0], A.rampa[1], hq)
      + Fo.perRilievo * rilievo + DETTAGLIO.montagna.extra * smoothstep(DETTAGLIO.montagna.rampa[0], DETTAGLIO.montagna.rampa[1], h))
      * (Fo.valle + (1 - Fo.valle) * cresta);
  } else ampiezza = A.fondale + (A.base - A.fondale) * smoothstep(-60, 0, h);
  let gruppo = 0, liscio = 1;
  if (carta.massicci && carta.massicci.length && h > 0) {
    const p = profiloMassicci(carta.massicci, x / 1000, z / 1000, _massiccio);
    if (p.a > 0) {
      const K = DETTAGLIO.massicci;
      // Frastaglio solo su pareti e cime (d < 1): i ghiaioni restano lisci e percorribili.
      const roccia = 1 - smoothstep(0.9, 1.05, p.d);
      const filo = K.frastaglio * (ridged(x, z, seedDettaglio ^ 0x6a09e667, K.lunghezza, K.ottave) - 0.3) * roccia
        * (pesi ? pesi[2] : 1);
      gruppo = p.altezza + filo;
      // Sui ghiaioni e nelle forcelle il rilievo fine si smorza: piede liscio, sella netta.
      liscio = 1 - K.liscio * Math.max(p.forcella, smoothstep(1.9, 1.2, p.d) * (1 - roccia));
    }
  }
  // Pesi delle ottave: quelli del chiamante (orizzonte) per la distanza, e in montagna i versanti lunghi.
  let p = pesi;
  const V = DETTAGLIO.versanti, m = h > 0 ? smoothstep(V.quota[0], V.quota[1], h) : 0;
  if (m > 0) {
    p = _pesiMonte;
    for (let o = 0; o < V.spegni.length; o++) p[o] = (pesi ? pesi[o] : 1) * (1 - m * V.spegni[o]);
  }
  return h + liscio * ampiezza * fbmEroso(x, z, seedDettaglio, p) + gruppo;
}

const _pesiMonte = new Float64Array(6);
const _massiccio = { a: 0, altezza: 0, d: Infinity, forcella: 0, forma: '', gruppo: -1 };

/** Campo per cella della Carta (Float32Array) interpolato bilineare tra i centri delle celle. */
function campoCarta(carta, campo, x, z) {
  const { cols, rows, cella } = carta;
  const u = x / cella - 0.5, v = z / cella - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
  let r = 0;
  for (let b = 0; b < 2; b++) {
    const j = specchio(j0 + b, rows);
    for (let a = 0; a < 2; a++) {
      const i = specchio(i0 + a, cols);
      r += (a ? fu : 1 - fu) * (b ? fv : 1 - fv) * campo[j * cols + i];
    }
  }
  return r;
}

// ─── Fiumi e laghi nelle Scene (passo 6) ────────────────────────────────
// Il letto di ogni fiume si calcola una volta per Carta lungo il tracciato curvo (carta.fiumi), dalla
// sorgente alla foce, sempre in discesa e raccordato alle confluenze: dipende solo dalla posizione nel
// mondo, quindi due Scene vicine (e l'orizzonte) combaciano. Attorno al tracciato: alveo (parabola fino al
// pelo dell'acqua), sponde basse, poi versanti che risalgono fino al terreno, sempre più ripidi con la
// distanza. La fascia dei versanti è larga in proporzione al fiume (FIUMI_SCENA.valle) e il dettaglio del
// rilievo vi torna man mano: la valle segue i rilievi attorno invece di essere un solco liscio e uniforme.

const FIUMI_SCENA = {
  // Larghezza e profondità crescono con il bacino (deciso con l'utente: torrenti piccoli alla sorgente, fiumi
  // grandi alle foci e dopo molti affluenti). Semilarghezza = k · bacino^esponente (km²), come nei fiumi veri
  // (larghezza ∝ portata^0,5–0,6): larghezza ~3,5 m a 20 km², ~12 m a 150, ~35 m a 1000, ~65 m a 2500.
  semilarghezza: { k: 0.3, esponente: 0.6, min: 1.2, max: 70 },
  profondita: { base: 0.3, perRadice: 0.045 },           // m d'acqua: ~0,5 a 20 km², ~0,85 a 150 (si guada), ~1,7 a 1000, ~2,5 a 2500
  sponda: { larghezza: 6, altezza: 0.8 },                // m: sponde basse oltre il pelo dell'acqua
  argine: 0.4,                                          // pendenza oltre le sponde dove il terreno è più basso
  versante: 0.12, curva: 2,                              // pendenza dei versanti: versante + curva·(fuori/R)²
  valle: { base: 120, perSemilarghezza: 8 },             // R (m oltre le sponde): ~240 m a 15 m di semilarghezza
  raggio: 1000,                                          // R massimo (m), per l'indice spaziale
  riva: { soglia: 0.25, sopra: 0.5 },                    // laghi: indicatore oltre cui è lago; riva sopra il livello (m)
  scendi: 0.02,                                          // m: discesa minima del letto tra due punti (~0,2 km)
  cellaIndice: 1000,                                     // m: celle dell'indice spaziale dei tratti
  // Tratti tra punti fissi (js/mondo/fiumi.js): sorgente, foce e confluenze. Alla confluenza il punto fisso
  // sta nel punto più basso del terreno in una griglia di 7×7 punti a `scosta` m attorno al tracciato.
  tratti: { scosta: 80, zona: 6000, tieni: 6, fondo: 4 },
  // Alla sorgente la valle nasce piano: i versanti scavano in proporzione alla distanza dalla sorgente lungo il
  // corso (pieni da `sorgente` m). Senza, attorno alla sorgente c'era una conca chiusa a ferro di cavallo.
  sorgente: 1500,
  // Il torrente nasce dove il terreno glielo permette: se nei primi `sorgente` m il letto (sempre in discesa) resta
  // più di `secco` m sotto il rilievo, la sorgente scende dopo l'ultimo punto così (prima scavava un canyon stretto
  // attraverso la gobba, con i versanti attenuati vicino alla sorgente; segnalato dall'utente). Più a monte, asciutto.
  secco: 4,
  ripa: 0.6,                                             // pendenza massima del fianco vicino alla sorgente (~31°)
};

/**
 * Fiumi sul rilievo fine (passo G2 del piano «Mondo generato in anticipo», docs/ESPLORAZIONE_3D.md). Sul rilievo
 * `quotaMondo` a FIUMI_FINI.passo m si calcola il deflusso (conche riempite dal mare, dai laghi della Carta e dal bordo;
 * direzioni; bacini); i corsi d'acqua sono le celle con bacino ≥ FIUMI_FINI.bacino km². Rete in tronchi: dalla foce si
 * risale sempre il ramo col bacino maggiore; gli altri sono affluenti che finiscono esattamente su un punto del
 * tronco. Stesso formato di `carta.fiumi` (Float32Array di x, y in km, bacino, letto = NaN), che sostituisce:
 * i fiumi stanno sul fondo delle valli vere invece di essere scavati dopo lungo i tracciati della Carta a 1 km
 * (radice di fiumi rialzati, canyon e strade di traverso segnalati dall'utente). `carta.fiumiFini` = true.
 */
export const FIUMI_FINI = { passo: 62.5, bacino: 20, minimo: 12, liscia: [2, 2],
  // Foce a imbuto (deciso con l'utente): negli ultimi `lunghezza` m (× larghezza del fiume, entro `tra` m) il letto si
  // allarga fino a `mare`/`lago` volte, di più per i fiumi grandi (da `piccolo` a `grande` m di larghezza): estuario al
  // mare, delta basso al lago; i ruscelli costieri al più raddoppiano. Il quarto valore dei punti di carta.fiumi.
  foce: { mare: [1.8, 4], lago: [1.3, 1.8], piccolo: 6, grande: 40, lunghezza: 40, tra: [400, 3000] } };
export function fiumiFini(carta, avanzamento = null) {
  const t0 = performance.now(), F = FIUMI_FINI, P = F.passo, C = carta.cella;
  const nx = Math.round(carta.cols * C / P) + 1, nz = Math.round(carta.rows * C / P) + 1, n = nx * nz;
  const g = new Float32Array(n), seme = derivaSeme(carta.seme, 101);
  for (let r = 0; r < nz; r++) {
    if (avanzamento && r % 64 === 0) avanzamento(0.6 * r / nz);
    for (let q = 0; q < nx; q++) g[r * nx + q] = quotaMondo(carta, q * P, r * P, seme);
  }
  // Foci: dove il terreno fine arriva davvero al livello dell'acqua (≤ 0 per mare e lagune, ≤ livello del lago vicino
  // ai laghi della Carta), e il bordo. Prima valeva la cella di 1 km: il fiume finiva decine di metri sopra il mare dove
  // la cella era già «mare», e attorno ai laghi le conche sotto il livello si colmavano in piani su cui il fiume correva
  // dritto e sopraelevato fino al lago (segnalato dall'utente).
  const vicinoLago = new Uint8Array(carta.cols * carta.rows);
  for (let i = 0; i < vicinoLago.length; i++) {
    if (carta.acque[i] !== ACQUA.LAGO) continue;
    const c0 = i % carta.cols, r0 = (i - c0) / carta.cols;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const cc = c0 + a, rr = r0 + b;
      if (cc >= 0 && rr >= 0 && cc < carta.cols && rr < carta.rows) vicinoLago[rr * carta.cols + cc] = 1;
    }
  }
  const foce = new Uint8Array(n);
  for (let r = 0; r < nz; r++) for (let q = 0; q < nx; q++) {
    const i = r * nx + q;
    if (g[i] <= 0 || q === 0 || r === 0 || q === nx - 1 || r === nz - 1) { foce[i] = 1; continue; }
    const c = Math.min(carta.cols - 1, Math.floor(q * P / C)), rr = Math.min(carta.rows - 1, Math.floor(r * P / C));
    if (vicinoLago[rr * carta.cols + c]) {
      const L = livelloLago(carta, q * P, r * P);
      if (!Number.isNaN(L) && g[i] <= L + 0.5) foce[i] = 1;
    }
  }
  // Riempimento delle conche (priority flood, mucchio binario) e direzioni: ogni cella scende verso chi l'ha raggiunta.
  const fill = new Float32Array(n), fatto = new Uint8Array(n), ric = new Int32Array(n).fill(-1), ordine = new Int32Array(n);
  const hk = new Int32Array(n), hv = new Float32Array(n);
  let hn = 0, no = 0;
  const spingi = (k, v) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= v) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const togli = () => {
    const k = hk[0], v = hv[--hn], kk = hk[hn];
    let i = 0;
    for (;;) { let a = 2 * i + 1; if (a >= hn) break; if (a + 1 < hn && hv[a + 1] < hv[a]) a++; if (hv[a] >= v) break; hk[i] = hk[a]; hv[i] = hv[a]; i = a; }
    hk[i] = kk; hv[i] = v; return k;
  };
  for (let i = 0; i < n; i++) if (foce[i]) { fill[i] = g[i]; fatto[i] = 1; spingi(i, g[i]); }
  const DQ = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
  while (hn) {
    const k = togli(); ordine[no++] = k;
    const q = k % nx, r = (k - q) / nx;
    for (let d = 0; d < 8; d++) {
      const qq = q + DQ[d], rr = r + DR[d];
      if (qq < 0 || rr < 0 || qq >= nx || rr >= nz) continue;
      const j = rr * nx + qq;
      if (fatto[j]) continue;
      fatto[j] = 1; fill[j] = Math.max(g[j], fill[k] + 1e-3); ric[j] = k; spingi(j, fill[j]);
    }
  }
  if (avanzamento) avanzamento(0.8);
  const bacino = new Float32Array(n).fill(P * P / 1e6);
  for (let a = no - 1; a >= 0; a--) { const k = ordine[a]; if (ric[k] >= 0) bacino[ric[k]] += bacino[k]; }
  // Rete in tronchi: per ogni cella di fiume, il ramo a monte col bacino maggiore.
  const fiume = (i) => !foce[i] && bacino[i] >= F.bacino;
  const su = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!fiume(i)) continue;
    const r = ric[i];
    if (r >= 0 && fiume(r) && (su[r] < 0 || bacino[i] > bacino[su[r]])) su[r] = i;
  }
  const punto = new Map();                               // cella → [x, y] (km) già lisciati: le confluenze coincidono
  const fiumi = [], coda = [];
  for (let i = 0; i < n; i++) if (fiume(i) && (ric[i] < 0 || !fiume(ric[i]))) coda.push([i, ric[i] >= 0 ? ric[i] : -1]);
  const L = (a, R, passate) => {                         // media mobile con estremi fermi
    for (let it = 0; it < passate; it++) {
      const b = a.slice();
      for (let i = 1; i < a.length - 1; i++) {
        const r = Math.min(R, i, a.length - 1 - i);
        let somma = 0;
        for (let j = i - r; j <= i + r; j++) somma += a[j];
        b[i] = somma / (2 * r + 1);
      }
      a = b;
    }
    return a;
  };
  while (coda.length) {
    const [bocca, valle] = coda.shift();
    const celle = [];
    for (let i = bocca; i >= 0; i = su[i]) celle.push(i);
    celle.reverse();                                     // dalla sorgente alla bocca
    if (celle.length < F.minimo) continue;
    // Punti: le celle, poi (se c'è) il punto a valle: la foce (mare, lago) o il punto del fiume in cui si confluisce.
    let xs = celle.map((i) => (i % nx) * P / C), ys = celle.map((i) => Math.floor(i / nx) * P / C);
    const giu = valle >= 0 ? (punto.get(valle) ?? [(valle % nx) * P / C, Math.floor(valle / nx) * P / C]) : null;
    if (giu) { xs.push(giu[0]); ys.push(giu[1]); }
    xs = L(xs, ...F.liscia); ys = L(ys, ...F.liscia);
    const m = xs.length, f = new Float32Array(m * 4);
    for (let k = 0; k < m; k++) {
      const cell = k < celle.length ? celle[k] : valle;
      f[k * 4] = xs[k]; f[k * 4 + 1] = ys[k]; f[k * 4 + 2] = bacino[cell]; f[k * 4 + 3] = 1;
    }
    // Foce in mare o in lago (non al bordo, non in un altro fiume): imbuto negli ultimi metri.
    const bordo = (i) => { const q = i % nx, r = (i - q) / nx; return q === 0 || r === 0 || q === nx - 1 || r === nz - 1; };
    if (valle >= 0 && foce[valle] && !bordo(valle)) {
      const Fo = F.foce, SW = FIUMI_SCENA.semilarghezza, b = bacino[celle[celle.length - 1]];
      const largo = 2 * Math.min(SW.max, Math.max(SW.min, SW.k * Math.pow(b, SW.esponente)));
      const [a, z] = g[valle] <= 0 ? Fo.mare : Fo.lago;
      const massimo = a + (z - a) * smoothstep(Fo.piccolo, Fo.grande, largo);
      const L = Math.min(Fo.tra[1], Math.max(Fo.tra[0], Fo.lunghezza * largo));
      let d = 0;
      for (let k = m - 1; k >= 0; k--) {
        if (k < m - 1) d += Math.hypot(xs[k + 1] - xs[k], ys[k + 1] - ys[k]) * C;
        if (d >= L) break;
        const t = 1 - d / L;
        f[k * 4 + 3] = 1 + (massimo - 1) * t * t;
      }
    }
    // I punti come Float32 (le chiavi delle confluenze sono quelle dei valori salvati).
    for (let k = 0; k < celle.length; k++) punto.set(celle[k], [f[k * 4], f[k * 4 + 1]]);
    fiumi.push(f);
    // Affluenti: le altre celle di fiume che scendono in questo tronco.
    for (const c of celle) {
      const q = c % nx, r = (c - q) / nx;
      for (let d = 0; d < 8; d++) {
        const qq = q + DQ[d], rr = r + DR[d];
        if (qq < 0 || rr < 0 || qq >= nx || rr >= nz) continue;
        const j = rr * nx + qq;
        if (j !== su[c] && ric[j] === c && fiume(j)) coda.push([j, c]);
      }
    }
  }
  carta.fiumi = fiumi;
  carta.fiumiFini = true;
  mappaAcqua(carta);                       // distanza dall'acqua, per chi sceglie dove stanno gli insediamenti
  carta.statistiche = { ...(carta.statistiche || {}), fiumiFini: { corsi: fiumi.length, ms: Math.round(performance.now() - t0) } };
  if (avanzamento) avanzamento(1);
  return carta;
}

const _fiumi = new WeakMap();

/** Fiumi della Carta pronti per le Scene: punti in metri, letto, semilarghezza, profondità, indice. */
export function fiumiScena(carta) {
  let pronto = _fiumi.get(carta);
  if (pronto) return pronto;
  const F = FIUMI_SCENA, C = carta.cella;
  const curve = [];
  const lettoDi = new Map();                             // punto (chiave esatta) → letto, per le confluenze
  const chiave = (x, y) => `${x},${y}`;
  for (const f of carta.fiumi || []) {
    const m = f.length / 4;
    if (m < 2) continue;
    const x = new Float64Array(m), z = new Float64Array(m), letto = new Float64Array(m);
    const w = new Float64Array(m), prof = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      x[i] = f[i * 4] * C; z[i] = f[i * 4 + 1] * C;
      const b = Math.max(1, f[i * 4 + 2]), r = Math.sqrt(b), SW = F.semilarghezza;
      // Foce a imbuto (fiumi fini, FIUMI_FINI.foce): più larga e più bassa (stessa portata su più larghezza).
      const imbuto = carta.fiumiFini && f[i * 4 + 3] > 1 ? f[i * 4 + 3] : 1;
      w[i] = Math.min(SW.max, Math.max(SW.min, SW.k * Math.pow(b, SW.esponente))) * imbuto;
      prof[i] = (F.profondita.base + F.profondita.perRadice * r) / Math.sqrt(imbuto);
      // Letto sotto la superficie liscia della Carta: pelo dell'acqua F.sponda.altezza sotto il terreno.
      // Vicino ai laghi conta la riva rialzata come nella Scena (scavaFiumi), dentro il livello del lago.
      const suolo = conRiva(carta, x[i], z[i], carta.fiumiFini ? quotaMondo(carta, x[i], z[i]) : quotaCarta(carta, x[i], z[i]));
      const grezzo = suolo - prof[i] - F.sponda.altezza;
      letto[i] = i === 0 ? grezzo : Math.min(grezzo, letto[i - 1] - F.scendi);
    }
    // Confluenza: l'ultimo punto è un punto di un fiume più grande (già calcolato): stesso letto, e a monte
    // il letto non scende sotto di esso (resta sempre in discesa verso valle).
    const valle = lettoDi.get(chiave(f[(m - 1) * 4], f[(m - 1) * 4 + 1]));
    if (valle !== undefined) {
      letto[m - 1] = valle;
      for (let i = m - 2; i >= 0; i--) if (letto[i] < letto[i + 1]) letto[i] = letto[i + 1];
    }
    // Immissario di un lago: arriva al livello del lago (la Carta levigata ne abbassa il fondovalle vicino
    // al fondo del lago, e il fiume taglierebbe la riva in una gola). A monte risale quanto serve.
    pesoLago(carta, x[m - 1], z[m - 1], _lago);
    if (_lago.peso > 0) {
      const minimo = _lago.livello - prof[m - 1] - F.sponda.altezza;
      if (letto[m - 1] < minimo) {
        letto[m - 1] = minimo;
        for (let i = m - 2; i >= 0 && letto[i] < letto[i + 1] + F.scendi; i--) letto[i] = letto[i + 1] + F.scendi;
      }
    }
    for (let i = 0; i < m; i++) {
      const k = chiave(f[i * 4], f[i * 4 + 1]);
      if (!lettoDi.has(k)) lettoDi.set(k, letto[i]);
    }
    const chiavi = [];
    for (let i = 0; i < m; i++) chiavi.push(chiave(f[i * 4], f[i * 4 + 1]));
    curve.push({ x, z, letto, w, prof, chiavi });
  }
  const { tratti, trattiDi } = puntiFissi(carta, curve);
  // Indice: celle di F.cellaIndice m → tratti il cui riquadro, allargato del raggio dei versanti e del
  // corridoio del percorso, le tocca.
  const indice = new Map();
  const R = F.raggio + PERCORSO.corridoio, L = F.cellaIndice;
  tratti.forEach((tr, id) => {
    const [bx0, bz0, bx1, bz1] = tr.riquadro;
    for (let gz = Math.floor((bz0 - R) / L); gz <= Math.floor((bz1 + R) / L); gz++) {
      for (let gx = Math.floor((bx0 - R) / L); gx <= Math.floor((bx1 + R) / L); gx++) {
        const k = gx * 1000003 + gz;
        let lista = indice.get(k);
        if (!lista) indice.set(k, (lista = []));
        lista.push(id);
      }
    }
  });
  pronto = { curve, indice, tratti, trattiDi, raffinati: new Map() };
  _fiumi.set(carta, pronto);
  return pronto;
}

/**
 * Punti fissi e tratti dei fiumi. Ogni fiume si divide in tratti tra punti fissi: sorgente, foce e i punti dove
 * confluisce un affluente (lo stesso punto fisso per i due fiumi, nel punto più basso del terreno lì attorno).
 * Il letto dei punti fissi scende sempre lungo il fiume. Tra due punti fissi il percorso si cerca sul terreno
 * (raffina), altrimenti è il tracciato della Carta.
 */
function puntiFissi(carta, curve) {
  const F = FIUMI_SCENA, T = F.tratti, seme = derivaSeme(carta.seme, 101);
  const quota = (x, z) => conRiva(carta, x, z, quotaMondo(carta, x, z, seme), false);
  const dove = new Map();                                // chiave del punto → [curva, indice] (prima occorrenza)
  curve.forEach((cv, ci) => cv.chiavi.forEach((k, i) => { if (!dove.has(k)) dove.set(k, [ci, i]); }));
  const extra = curve.map(() => new Set());
  const foce = curve.map(() => null);
  curve.forEach((cv, ci) => {
    const d = dove.get(cv.chiavi[cv.chiavi.length - 1]);
    if (d && d[0] !== ci) { extra[d[0]].add(d[1]); foce[ci] = d; }
  });
  const tratti = [], trattiDi = [];
  const fissi = curve.map(() => new Map());              // indice → { x, z, L }
  curve.forEach((cv, ci) => {
    const m = cv.x.length;
    const idx = new Set([0, m - 1, ...extra[ci]]);
    const ord = [...idx].sort((a, b) => a - b);
    let prev = Infinity, kPrev = 0;
    for (const k of ord) {
      let x = cv.x[k], z = cv.z[k], L = cv.letto[k];
      // Sorgente: sul terreno vero della Scena (appena sotto). Prima valeva anche il letto della Carta, che può stare
      // decine di metri sotto il terreno: il torrente nasceva in fondo a una conca chiusa (segnalato dall'utente).
      if (k === 0) L = quota(x, z) - cv.prof[k] - F.sponda.altezza;
      if (k === m - 1 && foce[ci]) {
        const f = fissi[foce[ci][0]].get(foce[ci][1]);
        if (f) { x = f.x; z = f.z; L = f.L; }
      } else if (k > 0 && k < m - 1 && !carta.fiumiFini) {   // fiumi fini: la confluenza è già sul fondo
        // Confluenza: il punto più basso attorno al tracciato (a parità, il più vicino).
        let hMin = Infinity;
        for (let b = -3; b <= 3; b++) {
          for (let a = -3; a <= 3; a++) {
            const qx = cv.x[k] + a * T.scosta, qz = cv.z[k] + b * T.scosta;
            const h = quota(qx, qz) + Math.hypot(a, b) * T.scosta * 0.02;
            if (h < hMin) { hMin = h; x = qx; z = qz; }
          }
        }
        L = Math.min(L, hMin - cv.prof[k] - F.sponda.altezza);
      }
      if (k > 0) L = Math.min(L, prev - F.scendi * (k - kPrev));
      fissi[ci].set(k, { x, z, L });
      prev = L; kPrev = k;
    }
    // Alla foce in un fiume più grande vale il suo letto: a monte il letto non scende sotto di esso.
    if (foce[ci]) {
      const f = fissi[foce[ci][0]].get(foce[ci][1]);
      if (f) {
        fissi[ci].get(m - 1).L = f.L;
        for (let j = ord.length - 2; j >= 0; j--) {
          const a = fissi[ci].get(ord[j]), b = fissi[ci].get(ord[j + 1]);
          if (a.L < b.L + F.scendi * (ord[j + 1] - ord[j])) a.L = b.L + F.scendi * (ord[j + 1] - ord[j]);
        }
      }
    }
    const lista = [];
    for (let j = 0; j < ord.length - 1; j++) {
      const ka = ord[j], kb = ord[j + 1], A = fissi[ci].get(ka), B = fissi[ci].get(kb);
      let x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), z0 = Math.min(A.z, B.z), z1 = Math.max(A.z, B.z);
      for (let i = ka; i <= kb; i++) {
        x0 = Math.min(x0, cv.x[i]); x1 = Math.max(x1, cv.x[i]); z0 = Math.min(z0, cv.z[i]); z1 = Math.max(z1, cv.z[i]);
      }
      lista.push(tratti.length);
      tratti.push({ ci, ka, kb, A, B, riquadro: [x0, z0, x1, z1], grezzo: null });
    }
    trattiDi.push(lista);
  });
  return { tratti, trattiDi };
}

/** Polilinea di un tratto con letto, semilarghezza e profondità: il percorso sul terreno se già cercato. */
function polilinea(carta, pronto, id) {
  const tr = pronto.tratti[id];
  const r = pronto.raffinati.get(id);
  if (r) return r;
  if (!tr.grezzo) {
    // Tracciato della Carta con gli estremi nei punti fissi; il letto segue il terreno vero della Scena (sempre in
    // discesa tra i due punti fissi). Con il letto della Carta il fiume restava sopra il fondo e l'argine lo
    // reggeva su un terrapieno (segnalato dall'utente).
    const cv = pronto.curve[tr.ci], n = tr.kb - tr.ka + 1;
    const p = { x: new Float64Array(n), z: new Float64Array(n), letto: new Float64Array(n), w: new Float64Array(n), prof: new Float64Array(n) };
    const seme = derivaSeme(carta.seme, 101), y = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const i = tr.ka + j;
      p.x[j] = cv.x[i]; p.z[j] = cv.z[i]; p.w[j] = cv.w[i]; p.prof[j] = cv.prof[i];
    }
    p.x[0] = tr.A.x; p.z[0] = tr.A.z; p.x[n - 1] = tr.B.x; p.z[n - 1] = tr.B.z;
    for (let j = 0; j < n; j++) {
      y[j] = conRiva(carta, p.x[j], p.z[j], quotaMondo(carta, p.x[j], p.z[j], seme), false) - p.prof[j] - FIUMI_SCENA.sponda.altezza;
    }
    p.letto = lettoMonotono(y, tr.A.L, tr.B.L);
    tr.grezzo = conRiquadro(inizioSorgente(p, y, tr));
  }
  return tr.grezzo;
}

/** Primo punto bagnato di un tratto che parte da una sorgente (FIUMI_SCENA.secco): `p.inizio`. */
function inizioSorgente(p, y, tr) {
  p.inizio = 0;
  if (tr.ka !== 0) return p;
  const F = FIUMI_SCENA;
  let d = 0, ultimo = -1;
  for (let i = 0; i < p.x.length; i++) {
    if (i > 0) d += Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
    if (d > F.sorgente) break;
    if (y[i] - p.letto[i] > F.secco) ultimo = i;
  }
  if (ultimo >= 0 && ultimo < p.x.length - 4) p.inizio = ultimo + 1;
  return p;
}

/** Riquadro della polilinea e indice dei suoi segmenti per cella (F.cellaIndice), allargati del raggio. */
function conRiquadro(p) {
  const R = FIUMI_SCENA.raggio, L = FIUMI_SCENA.cellaIndice;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const celle = new Map();
  for (let i = 0; i < p.x.length; i++) {
    x0 = Math.min(x0, p.x[i]); x1 = Math.max(x1, p.x[i]); z0 = Math.min(z0, p.z[i]); z1 = Math.max(z1, p.z[i]);
    if (i === p.x.length - 1) break;
    const a0 = Math.floor((Math.min(p.x[i], p.x[i + 1]) - R) / L), a1 = Math.floor((Math.max(p.x[i], p.x[i + 1]) + R) / L);
    const b0 = Math.floor((Math.min(p.z[i], p.z[i + 1]) - R) / L), b1 = Math.floor((Math.max(p.z[i], p.z[i + 1]) + R) / L);
    for (let b = b0; b <= b1; b++) {
      for (let a = a0; a <= a1; a++) {
        const k = a * 1000003 + b;
        let l = celle.get(k);
        if (!l) celle.set(k, (l = []));
        l.push(i);
      }
    }
  }
  p.riquadro = [x0, z0, x1, z1];
  p.celle = celle;
  return p;
}

/** Il tracciato corre sul fondo: a ogni punto, il terreno a 80 m ai lati non sta più di `metri` m sotto. */
function sulFondo(quota, px, pz, metri) {
  for (let j = 1; j < px.length - 1; j++) {
    const vx = px[j + 1] - px[j - 1], vz = pz[j + 1] - pz[j - 1], l = Math.hypot(vx, vz) || 1, h = quota(px[j], pz[j]);
    for (const s of [-80, 80]) if (quota(px[j] - vz / l * s, pz[j] + vx / l * s) < h - metri) return false;
  }
  return true;
}

/** Cerca sul terreno il percorso di un tratto (una volta per Carta). */
function raffina(carta, pronto, id) {
  if (pronto.raffinati.has(id)) return;
  // Fiumi calcolati sul rilievo fine (G2): il tracciato è già sul fondo, niente ricerca.
  if (carta.fiumiFini) { pronto.raffinati.set(id, polilinea(carta, pronto, id)); return; }
  const F = FIUMI_SCENA, tr = pronto.tratti[id], cv = pronto.curve[tr.ci];
  const seme = derivaSeme(carta.seme, 101);
  const quota = (x, z) => conRiva(carta, x, z, quotaMondo(carta, x, z, seme), false);
  const n = tr.kb - tr.ka + 1, px = new Float64Array(n), pz = new Float64Array(n);
  for (let j = 0; j < n; j++) { px[j] = cv.x[tr.ka + j]; pz[j] = cv.z[tr.ka + j]; }
  px[0] = tr.A.x; pz[0] = tr.A.z; px[n - 1] = tr.B.x; pz[n - 1] = tr.B.z;
  // Quota attesa del terreno accanto all'acqua: il letto della Carta, tra quelli dei due punti fissi.
  const pref = new Float64Array(n);
  for (let j = 0; j < n; j++) pref[j] = Math.min(tr.A.L, Math.max(tr.B.L, cv.letto[tr.ka + j])) + cv.prof[tr.ka + j] + F.sponda.altezza;
  // Se il tracciato della Carta passa già in basso (mai più di F.tratti.tieni m sopra il livello atteso), lo si
  // tiene com'è: in pianura il terreno non decide, e il percorso cercato perdeva le anse.
  let peggio = -Infinity;
  for (let j = 0; j < n; j++) peggio = Math.max(peggio, quota(px[j], pz[j]) - pref[j]);
  if (peggio <= F.tratti.tieni && sulFondo(quota, px, pz, F.tratti.fondo)) { pronto.raffinati.set(id, polilinea(carta, pronto, id)); return; }
  const via = tracciaPercorso(px, pz, pref, tr.A, tr.B, quota);
  if (!via) { pronto.raffinati.set(id, polilinea(carta, pronto, id)); return; }
  const m = via.x.length;
  const p = { x: via.x, z: via.z, letto: new Float64Array(m), w: new Float64Array(m), prof: new Float64Array(m) };
  // Letto: sempre in discesa tra i letti dei due punti fissi, il più vicino al terreno incontrato.
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const f = via.t[i] * (n - 1), j = Math.min(n - 2, Math.floor(f)), u = f - j;
    p.w[i] = cv.w[tr.ka + j] + (cv.w[tr.ka + j + 1] - cv.w[tr.ka + j]) * u;
    p.prof[i] = cv.prof[tr.ka + j] + (cv.prof[tr.ka + j + 1] - cv.prof[tr.ka + j]) * u;
    y[i] = via.h[i] - p.prof[i] - F.sponda.altezza;
  }
  p.letto = lettoMonotono(y, tr.A.L, tr.B.L);
  pronto.raffinati.set(id, conRiquadro(inizioSorgente(p, y, tr)));
}

/**
 * Cerca il percorso sul terreno dei tratti di fiume entro `raggio` m (in quadrato) da (cx, cz). Fuori da
 * questa zona i fiumi seguono il tracciato della Carta (solo nell'orizzonte lontano). Restituisce i ms.
 */
export function raffinaZona(carta, cx, cz, raggio) { return completa(raffinaZonaAPezzi(carta, cx, cz, raggio)); }

/** raffinaZona a pezzi (blocco che segue il cavaliere): yield dopo ogni tratto cercato (un tratto resta intero). */
export function* raffinaZonaAPezzi(carta, cx, cz, raggio = FIUMI_SCENA.tratti.zona) {
  const t0 = performance.now();
  const pronto = fiumiScena(carta);
  for (let id = 0; id < pronto.tratti.length; id++) {
    const [x0, z0, x1, z1] = pronto.tratti[id].riquadro;
    if (x1 < cx - raggio || x0 > cx + raggio || z1 < cz - raggio || z0 > cz + raggio) continue;
    if (pronto.raffinati.has(id)) continue;
    raffina(carta, pronto, id);
    yield;
  }
  return performance.now() - t0;
}

/**
 * Percorsi dei fiumi (m del mondo) nel riquadro: per ogni tratto che lo tocca, la polilinea con semilarghezza
 * (il percorso sul terreno se già cercato, altrimenti il tracciato della Carta). Per la vista della Carta.
 */
export function percorsiFiumi(carta, x0, z0, x1, z1) {
  const pronto = fiumiScena(carta), out = [];
  pronto.tratti.forEach((tr, id) => {
    const [a0, b0, a1, b1] = tr.riquadro;
    if (a1 < x0 || a0 > x1 || b1 < z0 || b0 > z1) return;
    const p = polilinea(carta, pronto, id), i0 = p.inizio ?? 0;
    out.push({ x: p.x.slice(i0), z: p.z.slice(i0), w: p.w.slice(i0) });
  });
  return out;
}

const _esito = { quota: 0, livello: NaN };

/**
 * Quota (m) nel punto (x, z) del mondo con fiumi scavati, a partire dalla quota senza fiumi h0. Scrive in
 * `esito.livello` il pelo dell'acqua del fiume se il punto è nell'alveo (altrimenti NaN).
 */
export function scavaFiumi(carta, x, z, h0, esito = _esito) {
  const F = FIUMI_SCENA, R = F.raggio;
  const pronto = fiumiScena(carta), { indice } = pronto;
  // Rive dei laghi in quota: la Carta levigata mescola la soglia del lago con il fondo e la riva scende sotto
  // il livello (l'acqua resterebbe sospesa). Nella fascia attorno al lago il terreno sale fino al livello.
  h0 = conRiva(carta, x, z, h0, false);
  esito.quota = h0; esito.livello = NaN;
  const chiaveCella = Math.floor(x / F.cellaIndice) * 1000003 + Math.floor(z / F.cellaIndice);
  const lista = indice.get(chiaveCella);
  if (!lista) return h0;
  let migliore = Infinity, mL = 0, mW = 0, mB = 0, mProf = 0, mD = 0;   // tratto con l'alveo più vicino
  let cap = Infinity;                       // versanti: il più basso tra i tratti
  let fuoriMin = Infinity, peloArgine = 0, Rargine = 1;   // tratto più vicino fuori dalle sponde (argine)
  let dettaglio = NaN;                      // h0 − quota liscia della Carta: il rilievo fine del punto
  for (let k = 0; k < lista.length; k++) {
    const cv = polilinea(carta, pronto, lista[k]);
    const [rx0, rz0, rx1, rz1] = cv.riquadro;
    if (x < rx0 - R || x > rx1 + R || z < rz0 - R || z > rz1 + R) continue;
    const segmenti = cv.celle.get(chiaveCella);
    if (!segmenti) continue;
    // Primo tratto di un corso d'acqua: distanza dalla sorgente lungo il percorso (per la valle che nasce piano).
    const i0 = cv.inizio ?? 0;                     // prima della sorgente vera: asciutto
    if (pronto.tratti[lista[k]].ka === 0 && !cv.daSorgente) {
      cv.daSorgente = new Float64Array(cv.x.length);
      for (let i = i0 + 1; i < cv.x.length; i++) cv.daSorgente[i] = cv.daSorgente[i - 1] + Math.hypot(cv.x[i] - cv.x[i - 1], cv.z[i] - cv.z[i - 1]);
    }
    const sorgente = pronto.tratti[lista[k]].ka === 0;
    for (const i of segmenti) {
    if (i < i0) continue;
    const ax = cv.x[i], az = cv.z[i], bx = cv.x[i + 1], bz = cv.z[i + 1];
    if ((ax < x - R && bx < x - R) || (ax > x + R && bx > x + R) || (az < z - R && bz < z - R) || (az > z + R && bz > z + R)) continue;
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
    // Punto a monte dell'inizio del segmento: lo copre il segmento prima (o il tratto a monte). Contato anche lui
    // per i versanti, un torrente più ripido dei versanti scavava accanto a sé una fossa alla quota del letto più a
    // valle, e l'alveo restava in cima a un muro (segnalato dall'utente). Resta solo all'inizio di una sorgente.
    const aMonte = t < 0 && !(i === i0 && sorgente);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - ax - vx * t, dz = z - az - vz * t;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= R) continue;
    const w = cv.w[i] + (cv.w[i + 1] - cv.w[i]) * t;
    const Rv = Math.min(R, F.valle.base + F.valle.perSemilarghezza * w);
    if (d - w - F.sponda.larghezza >= Rv) continue;
    const prof = cv.prof[i] + (cv.prof[i + 1] - cv.prof[i]) * t;
    const letto = cv.letto[i] + (cv.letto[i + 1] - cv.letto[i]) * t;
    const pelo = letto + prof;
    const fuori = d - w - F.sponda.larghezza;
    if (fuori <= 0) {
      if (d - w < migliore) { migliore = d - w; mL = pelo; mW = w; mB = letto; mProf = prof; mD = d; }
    } else if (!aMonte) {
      if (Number.isNaN(dettaglio)) dettaglio = h0 - quotaCarta(carta, x, z);
      // Il rilievo fine si somma al versante ma non lo porta sotto la sponda: dove era più basso della Carta
      // levigata (anche 40 m) scavava accanto all'alveo una fossa e il fiume restava in cima a un muro.
      let c = Math.max(pelo + F.sponda.altezza, pelo + F.sponda.altezza
        + fuori * (F.versante + F.curva * (fuori / Rv) * (fuori / Rv)) + dettaglio * smoothstep(0, 0.6 * Rv, fuori));
      if (cv.daSorgente && c < h0) {
        const ds = cv.daSorgente[i] + (cv.daSorgente[i + 1] - cv.daSorgente[i]) * t;
        if (ds < F.sorgente) c = h0 - (h0 - c) * smoothstep(0, F.sorgente, ds);
        // Mai pareti: anche vicino alla sorgente il fianco sale al più di `ripa` m per metro dalla sponda (prima, con
        // l'alveo profondo e i versanti attenuati, restava un canyon con pareti verticali; segnalato dall'utente).
        c = Math.min(c, pelo + F.sponda.altezza + fuori * F.ripa);
      }
      if (c < cap) cap = c;
      if (fuori < fuoriMin) { fuoriMin = fuori; peloArgine = pelo; Rargine = Rv; }
    }
    }
  }
  if (migliore !== Infinity) {                       // nell'alveo o sulle sponde: forma imposta
    if (mD < mW) {
      esito.livello = mL;
      esito.quota = mB + mProf * (mD / mW) * (mD / mW);
    } else {
      esito.quota = mL + F.sponda.altezza * smoothstep(0, 1, (mD - mW) / F.sponda.larghezza);
    }
    return esito.quota;
  }
  if (cap === Infinity) return h0;
  // Versanti: mai sopra il terreno. Dove il terreno è più basso del fiume, un argine che scende piano dalla
  // sponda (il fiume non resta sospeso sopra una conca), che si raccorda al terreno entro la fascia dei versanti.
  let argine = Math.min(peloArgine + F.sponda.altezza - F.argine * fuoriMin, cap);
  if (argine > h0) argine = h0 + (argine - h0) * (1 - smoothstep(0.5 * Rargine, Rargine, fuoriMin));
  const h = Math.max(h0 < cap ? h0 : cap, argine);
  esito.quota = h;
  return h;
}

// ─── Terrapieni di rocche e borghi (M7, passo 2) ──────────────────────────
// I piani stanno in carta.luoghi[].piani (calcolati una volta nel Worker, js/mondo/luoghi.js): rettangoli
// arrotondati con una quota, raccordati al terreno da una scarpata larga s. Funzione pura delle coordinate:
// blocchi vicini, orizzonte e Carta zoomata combaciano. I piani stanno fuori dalla fascia dei fiumi, quindi
// l'ordine con scavaFiumi non conta. Solo operazioni esatte (decidono la forma del mondo).

/**
 * Quota di un piano nel punto (x, z): costante (`p.q`, la rocca) oppure, se il piano ha una `griglia` (il borgo,
 * M7: pendio naturale lisciato, decisione dell'utente), interpolata bilineare sulla griglia nel punto del contorno
 * più vicino (fuori dal piano vale quella del bordo: la scarpata parte da lì).
 * griglia = { nu, nv, h }: nu × nv quote lungo u (da −a ad a) e v (da −b a b), h[j·nu + i].
 */
export function quotaPiano(p, x, z) {
  const G = p.griglia;
  if (!G) return p.q;
  const dx = x - p.cx, dz = z - p.cz;
  let lu = dx * p.ux + dz * p.uz, lv = -dx * p.uz + dz * p.ux;
  lu = lu < -p.a ? -p.a : lu > p.a ? p.a : lu;
  lv = lv < -p.b ? -p.b : lv > p.b ? p.b : lv;
  const fu = (lu + p.a) / (2 * p.a) * (G.nu - 1), fv = (lv + p.b) / (2 * p.b) * (G.nv - 1);
  let i = Math.floor(fu), j = Math.floor(fv);
  if (i > G.nu - 2) i = G.nu - 2;
  if (j > G.nv - 2) j = G.nv - 2;
  const tu = fu - i, tv = fv - j, h = G.h, n = G.nu;
  const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * tu;
  const b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * tu;
  return a + (b - a) * tv;
}

/** Distanza con segno (m) dal contorno di un piano: negativa dentro. */
export function distanzaPiano(p, x, z) {
  const dx = x - p.cx, dz = z - p.cz;
  const lu = dx * p.ux + dz * p.uz, lv = -dx * p.uz + dz * p.ux;
  const qx = (lu < 0 ? -lu : lu) - (p.a - p.r), qy = (lv < 0 ? -lv : lv) - (p.b - p.r);
  const ex = qx > 0 ? qx : 0, ey = qy > 0 ? qy : 0;
  const m = qx > qy ? qx : qy;
  const dr = Math.sqrt(ex * ex + ey * ey) + (m < 0 ? m : 0) - p.r;
  const P = p.poligono;
  // Contorno poligonale (rocche e borghi irregolari, M7): distanza con segno dal poligono. L'ingombro rettangolare
  // lo contiene, quindi fuori dalla portata del terrapieno basta la sua distanza (più piccola o uguale).
  if (!P || dr > p.s + TERRAPIENO.ritorno) return dr;
  let d2 = Infinity, dentro = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) dentro = !dentro;
    const ex2 = xj - xi, ez2 = zj - zi, l2 = ex2 * ex2 + ez2 * ez2;
    let t = l2 > 0 ? ((x - xi) * ex2 + (z - zi) * ez2) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const fx = x - xi - ex2 * t, fz = z - zi - ez2 * t, q2 = fx * fx + fz * fz;
    if (q2 < d2) d2 = q2;
  }
  const d = Math.sqrt(d2);
  return dentro ? -d : d;
}

// Terrapieno come quelli veri: dal contorno di ogni piano il terreno può scostarsi dal piano al più di
// TERRAPIENO.pendenza (tangente di 25°) per metro: riporto dove il terreno è più basso, sterro dove è più alto
// (h dentro [q − d·T, q + d·T] per ogni piano). Tra due piani vicini i vincoli si contraddicono vicino al
// contorno comune: vince il piano più basso (resta piatto fino al bordo) e nel più alto il terreno scende a 25°
// verso il bordo. Lì il piano più alto avrà il suo pavimento costruito (`quotaSuolo`, come il cortile di M4) e il
// muro di contenimento (passi 3–4): il terreno resta sotto il pavimento e dietro il muro, mai sopra. Su un versante più ripido di 25° il cono non raggiunge mai il terreno: oltre la larghezza
// della scarpata del piano (p.s) si torna al terreno naturale in TERRAPIENO.ritorno m.
export const TERRAPIENO = { pendenza: 0.4663076581549986, ritorno: 30 };

/** Quota h del punto con i terrapieni dei luoghi: dentro un piano la sua quota, fuori scarpate a 25° al più. */
export function spianaLuoghi(carta, x, z, h) {
  const L = carta.luoghi;
  if (!L) return h;
  for (let k = 0; k < L.length; k++) {
    const l = L[k], P = l.piani;
    if (!P) continue;
    const ex = x - l.x, ez = z - l.z;
    if (ex * ex + ez * ez > l.raggioPiani * l.raggioPiani) continue;
    const r = spianaPiani(P, x, z, h);
    if (r !== null) return r;                         // i siti distano chilometri: al più uno tocca il punto
  }
  return h;
}

/**
 * Quota h del punto coi terrapieni di un solo luogo (i suoi piani), o null se nessun piano lo tocca. La usa anche il
 * generatore dei luoghi (luoghi.js) per conoscere il terreno finale attorno al borgo mentre ne disegna la rampa.
 */
export function spianaPiani(P, x, z, h) {
  const T = TERRAPIENO.pendenza;
  let lo = -Infinity, hi = Infinity, ritorno = 0;
  // Rampe d'accesso lungo le mura (luoghi.js, tipo 'rampa'): dentro la loro impronta il terreno è la rampa, prima di
  // combinare gli altri piani (un tratto più basso a pochi metri, o il pianoro del borgo, la tirerebbero su o giù).
  for (let j = 0; j < P.length; j++) {
    const p = P[j];
    if (p.tipo === 'rampa' && distanzaPiano(p, x, z) <= 0) return p.griglia ? quotaPiano(p, x, z) : p.q;
  }
  for (let j = 0; j < P.length; j++) {
    const p = P[j];
    let d = distanzaPiano(p, x, z);
    // Peso del piano: 1 fino alla sua scarpata, poi scende fino a zero in TERRAPIENO.ritorno m.
    const f = 1 - smoothstep(p.s, p.s + TERRAPIENO.ritorno, d);
    if (f > ritorno) ritorno = f;
    if (f <= 0) continue;
    if (d < 0) d = 0;
    const q = p.griglia ? quotaPiano(p, x, z) : p.q;
    const a = q - d * T, b = q + d * T;
    if (a > lo) lo = a;
    if (b < hi) hi = b;
  }
  if (ritorno <= 0) return null;
  const c = lo <= hi ? (h < lo ? lo : h > hi ? hi : h) : hi;
  return h + ritorno * (c - h);
}

/**
 * Distanza dall'acqua corrente (m) su tutta la Carta, a `passo` m: fiumi, torrenti, laghi e mare. Calcolata una volta
 * con i fiumi fini (onda su griglia, 8 direzioni) e salvata nella Carta: serve a chi sceglie dove stanno insediamenti e
 * campi [richiesta dell'utente, novembre 2026: «villaggi e borghi stavano per necessità vicino a un fiume»], senza
 * ricalcolare niente. `distanzaAcqua(carta, x, z)` la legge (bilineare).
 */
export const ACQUA_VICINA = { passo: 125, massimo: 20000 };
export function mappaAcqua(carta) {
  const P = ACQUA_VICINA.passo, C = carta.cella;
  const nx = Math.round(carta.cols * C / P) + 1, nz = Math.round(carta.rows * C / P) + 1, n = nx * nz;
  // Due mappe: `d` da qualsiasi acqua, `dolce` solo da fiumi, torrenti e laghi interni [chiesto dalla sessione M8:
  // un villaggio a 500 m da un fiume è normale, uno a 500 m dal mare su una costa a picco no, e un mulino sul mare
  // non esiste].
  const d = new Float32Array(n).fill(Infinity), dolce = new Float32Array(n).fill(Infinity);
  const metti = (A, q, r) => { if (q >= 0 && r >= 0 && q < nx && r < nz) A[r * nx + q] = 0; };
  for (const f of carta.fiumi ?? []) {                      // punti dei corsi d'acqua (x, y in km)
    const m = f.length / 4;
    for (let k = 0; k < m; k++) {
      const q = Math.round(f[k * 4] * C / P), r = Math.round(f[k * 4 + 1] * C / P);
      metti(d, q, r); metti(dolce, q, r);
    }
  }
  for (let r = 0; r < nz; r++) for (let q = 0; q < nx; q++) {   // laghi e mare, dalle celle della Carta
    const c = Math.min(carta.cols - 1, Math.floor(q * P / C)), rr = Math.min(carta.rows - 1, Math.floor(r * P / C));
    const a = carta.acque[rr * carta.cols + c];
    if (a === ACQUA.TERRA) continue;
    metti(d, q, r);
    if (a === ACQUA.LAGO) metti(dolce, q, r);                 // il lago costiero è salmastro, il mare no di certo
  }
  // Trasformata di distanza a due passate (chamfer 3×3, pesi 1 e √2): errore di qualche per cento, basta per scegliere
  // dove sta un insediamento, e costa una sola scansione avanti e una indietro.
  const Dr = P, Dd = P * Math.SQRT2;
  for (const A of [d, dolce]) {
    const tocca = (i, j, w) => { const v = A[j] + w; if (v < A[i]) A[i] = v; };
    for (let r = 0; r < nz; r++) {
      for (let q = 0; q < nx; q++) {
        const i = r * nx + q;
        if (A[i] === 0) continue;
        if (q > 0) tocca(i, i - 1, Dr);
        if (r > 0) {
          tocca(i, i - nx, Dr);
          if (q > 0) tocca(i, i - nx - 1, Dd);
          if (q < nx - 1) tocca(i, i - nx + 1, Dd);
        }
      }
    }
    for (let r = nz - 1; r >= 0; r--) {
      for (let q = nx - 1; q >= 0; q--) {
        const i = r * nx + q;
        if (A[i] === 0) continue;
        if (q < nx - 1) tocca(i, i + 1, Dr);
        if (r < nz - 1) {
          tocca(i, i + nx, Dr);
          if (q > 0) tocca(i, i + nx - 1, Dd);
          if (q < nx - 1) tocca(i, i + nx + 1, Dd);
        }
      }
    }
    for (let i = 0; i < n; i++) if (A[i] > ACQUA_VICINA.massimo) A[i] = ACQUA_VICINA.massimo;
  }
  carta.acquaVicina = { passo: P, nx, nz, d, dolce };
  return carta.acquaVicina;
}

/**
 * Distanza (m) dall'acqua nel punto (x, z) del mondo, dalla mappa della Carta (bilineare). Con `dolce` vale solo per
 * fiumi, torrenti e laghi interni: mare e laghi costieri non contano.
 */
export function distanzaAcqua(carta, x, z, dolce = false) {
  const A = carta.acquaVicina;
  if (!A) return NaN;
  let fx = x / A.passo, fz = z / A.passo;
  fx = fx < 0 ? 0 : fx > A.nx - 1.001 ? A.nx - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > A.nz - 1.001 ? A.nz - 1.001 : fz;
  const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, i = r * A.nx + c, D = dolce ? A.dolce : A.d;
  return (D[i] * (1 - u) + D[i + 1] * u) * (1 - v) + (D[i + A.nx] * (1 - u) + D[i + A.nx + 1] * u) * v;
}

/**
 * Griglia del mondo generato (passo G1 del piano «Mondo generato in anticipo», docs/ESPLORAZIONE_3D.md): quota finale
 * (`quotaFinale`, con i percorsi di tutti i fiumi già cercati) e livello dell'acqua (fiumi e laghi; NaN asciutto) su tutta
 * la Carta, a `passo` m. Calcolata una volta nel Worker e salvata con la Carta: la Carta zoomata la legge invece di
 * ricalcolare il rilievo a ogni zoom.
 */
export const GRIGLIA = { passo: 62.5 };
export function grigliaMondo(carta, avanzamento = null, passo = GRIGLIA.passo) {
  const t0 = performance.now();
  raffinaZona(carta, carta.cols * carta.cella / 2, carta.rows * carta.cella / 2, Math.max(carta.cols, carta.rows) * carta.cella);
  const nx = Math.round(carta.cols * carta.cella / passo) + 1, nz = Math.round(carta.rows * carta.cella / passo) + 1;
  const h = new Float32Array(nx * nz), acqua = new Float32Array(nx * nz);
  const seme = derivaSeme(carta.seme, 101), esito = { quota: 0, livello: NaN };
  for (let r = 0; r < nz; r++) {
    if (avanzamento && r % 64 === 0) avanzamento(r / nz);
    for (let c = 0; c < nx; c++) {
      const x = c * passo, z = r * passo, i = r * nx + c;
      const q = quotaFinale(carta, x, z, seme, esito);
      let w = esito.livello;
      if (Number.isNaN(w)) { const l = livelloLago(carta, x, z); if (l > q) w = l; }
      h[i] = q; acqua[i] = w;
    }
  }
  return { passo, nx, nz, h, acqua, ms: performance.now() - t0 };
}

/** Quota e acqua dalla griglia, interpolate (bilineare) nel punto (x, z) del mondo; out = { quota, acqua }. */
export function leggiGriglia(G, x, z, out = { quota: 0, acqua: NaN }) {
  let fx = x / G.passo, fz = z / G.passo;
  fx = fx < 0 ? 0 : fx > G.nx - 1.001 ? G.nx - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > G.nz - 1.001 ? G.nz - 1.001 : fz;
  const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, i = r * G.nx + c, n = G.nx;
  const H = G.h;
  out.quota = (H[i] * (1 - u) + H[i + 1] * u) * (1 - v) + (H[i + n] * (1 - u) + H[i + n + 1] * u) * v;
  // Acqua: la più vicina (i bordi di fiumi e laghi restano netti come nelle Scene).
  const k = (v < 0.5 ? i : i + n) + (u < 0.5 ? 0 : 1);
  out.acqua = G.acqua[k];
  return out;
}

/**
 * Quota finale del mondo nel punto (x, z): rilievo (quotaMondo), fiumi e laghi (scavaFiumi), strade (spianaStrade,
 * solo dove il tracciato fine è già stato cercato), terrapieni dei luoghi (spianaLuoghi). Unico punto usato da blocco, orizzonte e Carta zoomata.
 */
export function quotaFinale(carta, x, z, seedDettaglio = derivaSeme(carta.seme, 101), esito = _esito, pesi = null) {
  const h = scavaFiumi(carta, x, z, quotaMondo(carta, x, z, seedDettaglio, pesi), esito);
  // Sui piani dei luoghi vince il terrapieno; fuori, la strada scava il suo ripiano anche nelle scarpate dei terrapieni
  // (prima la scarpata passava sopra la strada e verso la rocca restavano tratti a 30–45°, segnalato dall'utente). La
  // quota della strada tiene già conto dei terrapieni (js/mondo/strade.js, terrenoLuoghi).
  if (dentroPiano(carta, x, z)) return spianaLuoghi(carta, x, z, spianaStrade(carta, x, z, h, esito));
  return spianaStrade(carta, x, z, spianaLuoghi(carta, x, z, h), esito);
}

/** true se (x, z) sta su uno dei piani (terrapieni) di un luogo. */
function dentroPiano(carta, x, z) {
  const L = carta.luoghi;
  if (!L) return false;
  for (let k = 0; k < L.length; k++) {
    const l = L[k], P = l.piani;
    if (!P) continue;
    const ex = x - l.x, ez = z - l.z;
    if (ex * ex + ez * ez > l.raggioPiani * l.raggioPiani) continue;
    for (let j = 0; j < P.length; j++) if (distanzaPiano(P[j], x, z) < 0) return true;
    return false;
  }
  return false;
}

const _lago = { peso: 0, livello: NaN };

/**
 * Quota h con la riva dei laghi in quota: nella fascia attorno al lago (indicatore tra 0 e la soglia) sale
 * fino al livello + riva.sopra; dentro il lago, se `dentro`, vale il livello (per il letto dei fiumi).
 */
function conRiva(carta, x, z, h, dentro = true) {
  const R = FIUMI_SCENA.riva;
  pesoLago(carta, x, z, _lago);
  if (_lago.peso <= 0) return h;
  if (_lago.peso >= R.soglia) return dentro ? _lago.livello : h;
  const riva = _lago.livello + R.sopra;
  return h < riva ? h + (riva - h) * smoothstep(0, R.soglia, _lago.peso) : h;
}

/** Livello dei laghi in quota (m) nel punto del mondo, o NaN: indicatore «lago» interpolato tra le celle. */
export function livelloLago(carta, x, z) {
  pesoLago(carta, x, z, _lago);
  return _lago.peso >= FIUMI_SCENA.riva.soglia ? _lago.livello : NaN;
}

/** Indicatore «lago» interpolato (0–1) e livello della cella di lago più vicina: in out.peso, out.livello. */
function pesoLago(carta, x, z, out) {
  const { cols, rows, acque, livelloAcqua, cella } = carta;
  out.peso = 0; out.livello = NaN;
  if (!acque) return out;
  const u = x / cella - 0.5, v = z / cella - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
  let somma = 0, livello = NaN, peso = -1;
  for (let b = 0; b < 2; b++) {
    for (let a = 0; a < 2; a++) {
      const i = Math.min(cols - 1, Math.max(0, i0 + a)), j = Math.min(rows - 1, Math.max(0, j0 + b));
      const w = (a ? fu : 1 - fu) * (b ? fv : 1 - fv);
      const c = j * cols + i;
      if (acque[c] === ACQUA.LAGO) { somma += w; if (w > peso) { peso = w; livello = livelloAcqua[c]; } }
    }
  }
  out.peso = somma; out.livello = livello;
  return out;
}

/**
 * Pezzi dei tracciati dei fiumi attorno a (cx, cz), in coordinate locali: Float32Array [lx, lz, pelo, w, …].
 * `dentro` true: solo dentro il quadrato di metà lato `half` (il blocco); false: solo fuori, entro `raggio`
 * (in quadrato) e, per ogni punto, entro `vista(w)` (i fiumi stretti si perdono prima). Sul bordo del quadrato
 * i pezzi finiscono esattamente nel punto d'incrocio, lo stesso per il blocco e per l'orizzonte.
 */
export function tracciatiFiumi(carta, cx, cz, half, dentro, raggio = Infinity, vista = null) {
  const pronto = fiumiScena(carta);
  const pezzi = [];
  const dist = (p) => Math.max(Math.abs(p[0]), Math.abs(p[1]));
  const lato = (p) => (dist(p) <= half) === dentro;
  const visibile = (p) => { const d = dist(p); return d <= raggio && (!vista || d <= vista(p[3])); };
  const mescola = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  let pezzo = null;
  const chiudi = () => { if (pezzo && pezzo.length >= 8) pezzi.push(Float32Array.from(pezzo)); pezzo = null; };
  for (const lista of pronto.trattiDi) {
    let prima = null;
    // Il fiume intero: i suoi tratti uno dopo l'altro (il punto fisso in comune una volta sola).
    const punti = [];
    lista.forEach((id, j) => {
      const cv = polilinea(carta, pronto, id);
      for (let i = j === 0 ? (cv.inizio ?? 0) : 1; i < cv.x.length; i++) {
        // Dentro un lago in quota il nastro non serve (resterebbe visibile sotto la superficie).
        const pelo = cv.letto[i] + cv.prof[i], lago = livelloLago(carta, cv.x[i], cv.z[i]);
        punti.push(lago >= pelo ? null : [cv.x[i] - cx, cv.z[i] - cz, pelo, cv.w[i]]);
      }
    });
    for (const p of punti) {
      if (!p) { chiudi(); prima = null; continue; }
      if (prima && lato(prima) !== lato(p)) {
        let t0 = 0, t1 = 1;                      // incrocio con il bordo del quadrato (bisezione)
        for (let k = 0; k < 40; k++) {
          const t = (t0 + t1) / 2;
          if (lato(mescola(prima, p, t)) === lato(prima)) t0 = t; else t1 = t;
        }
        const X = mescola(prima, p, (t0 + t1) / 2);
        if (pezzo) { pezzo.push(...X); chiudi(); }
        else if (visibile(X)) pezzo = [...X];
      }
      if (lato(p) && visibile(p)) (pezzo ??= []).push(...p);
      else chiudi();
      prima = p;
    }
    chiudi();
  }
  return pezzi;
}

/**
 * Coordinata (m) del centro di un blocco sulla griglia fissa del mondo (multiplo del passo dei vertici, 7,8125 m):
 * i vertici di blocchi diversi cadono sugli stessi punti del mondo, quindi hanno le stesse quote e la vegetazione
 * (js/mondo/vegetazione.js) che legge i vertici dà gli stessi oggetti. Sposta il centro al più di 3,9 m.
 */
export function centroBlocco(v) {
  const passo = SCENA.lato / SCENA.celle;
  return Math.round(v / passo) * passo;
}

/**
 * Blocco di terreno di una Scena, nello stesso formato del terreno reale (griglia di quote + metadati):
 * terrain.js lo usa senza sapere da dove viene.
 * @param {object} carta  dalla generaCarta
 * @param {number} cx  centro del blocco, x del mondo (m); si allinea alla griglia del mondo (centroBlocco)
 * @param {number} cz  centro del blocco, z del mondo (m)
 * @returns {{ meta: object, heights: Float32Array }}
 */
export function generaScena(carta, cx, cz) { return completa(generaScenaAPezzi(carta, cx, cz)); }

/** generaScena a pezzi (blocco che segue il cavaliere, js/3d/blocchi.js): yield tra i tratti e ogni 4 righe. */
/**
 * Ripiano della strada sul terreno disegnato (segnalato dall'utente: carreggiata inclinata di traverso sui pendii). La
 * quota vera ha già carreggiata e banchina piane (spianaStrade), ma il blocco la disegna con un vertice ogni 7,8 m: i
 * triangoli sotto la carreggiata andavano da un vertice sul ripiano a uno sulla scarpata ed erano inclinati. Qui i
 * vertici delle celle che la carreggiata tocca prendono la quota della strada nel punto più vicino: un ripiano di una
 * cella sotto la strada, la scarpata nelle celle accanto. Non si toccano: il bordo del blocco (giunture con i vicini e
 * l'orizzonte), l'acqua, i terrapieni dei luoghi, i sentieri, i vertici che si sposterebbero più di `salto` m (l'altro
 * lato di un tornante), i dintorni delle porte di rocche e borghi (le rampe).
 */
// porta: striscia lasciata alla rampa fuori dalla porta (m lungo la normale della porta, dietro, di lato).
export const SOTTO_STRADA = { semiMinima: 1, passoLato: 1, salto: 5, porta: { lungo: 32, dietro: 8, lato: 11 } };
function spianaSottoStrade(carta, cx, cz, heights, fiume, lago, n, cell, half, strade, quote) {
  const S = SOTTO_STRADA, meglio = new Float32Array(n * n).fill(Infinity), val = new Float32Array(n * n);
  strade.forEach((t, s) => {
    const q = quote[s], m = t.length / 3;
    for (let k = 0; k < m; k++) {
      const x = t[k * 3], z = t[k * 3 + 1], w = t[k * 3 + 2];
      if (w < S.semiMinima) continue;
      const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
      let dx = t[b * 3] - t[a * 3], dz = t[b * 3 + 1] - t[a * 3 + 1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (let o = -w; o <= w + 1e-6; o += Math.min(S.passoLato, w)) {
        const px = x - dz * o, pz = z + dx * o;
        const c0 = Math.floor((px + half) / cell), r0 = Math.floor((pz + half) / cell);
        for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) {
          const c = c0 + dc, r = r0 + dr;
          if (c < 1 || r < 1 || c > n - 2 || r > n - 2) continue;           // il bordo resta com'è
          const i = r * n + c, d = Math.hypot(-half + c * cell - x, -half + r * cell - z);
          if (d < meglio[i]) { meglio[i] = d; val[i] = q[k]; }
        }
      }
    }
  });
  const vicini = (carta.luoghi || []).filter((l) => Math.abs(l.x - cx) < half + 2000 && Math.abs(l.z - cz) < half + 2000);
  const piani = vicini.flatMap((l) => l.piani || []);
  // Davanti alle porte la rampa di pietra (js/3d/borgo3d.js) scende fino al terreno: abbassarlo la lascerebbe sospesa.
  // Con la rampa lungo le mura (porta.arrivo) la rampa è un piano del luogo: niente striscia davanti alla porta.
  const porte = vicini.flatMap((l) => [l.porta?.arrivo ? null : l.porta, l.portaRocca]).filter(Boolean);
  for (let i = 0; i < n * n; i++) {
    if (meglio[i] === Infinity || !Number.isNaN(fiume[i]) || !Number.isNaN(lago[i])) continue;
    if (Math.abs(val[i] - heights[i]) > S.salto) continue;
    const x = cx - half + (i % n) * cell, z = cz - half + Math.floor(i / n) * cell;
    if (piani.some((p) => distanzaPiano(p, x, z) < 1)) continue;
    if (porte.some((q) => {
      const ox = x - q.x, oz = z - q.z, lungo = ox * (q.nx ?? 0) + oz * (q.nz ?? 0), lato = Math.abs(-ox * (q.nz ?? 0) + oz * (q.nx ?? 0));
      return q.nx === undefined ? Math.hypot(ox, oz) < S.porta.lungo : lungo > -S.porta.dietro && lungo < S.porta.lungo && lato < S.porta.lato;
    })) continue;
    heights[i] = val[i];
  }
}

export function* generaScenaAPezzi(carta, cx, cz) {
  const t0 = performance.now();
  cx = centroBlocco(cx); cz = centroBlocco(cz);
  const msFiumi = yield* raffinaZonaAPezzi(carta, cx, cz);
  const msStrade = yield* raffinaStradeAPezzi(carta, cx, cz);
  const n = SCENA.celle + 1, cell = SCENA.lato / SCENA.celle, half = SCENA.lato / 2;
  const heights = new Float32Array(n * n);
  const fiume = new Float32Array(n * n).fill(NaN);      // pelo dell'acqua dei fiumi (NaN = asciutto)
  const lago = new Float32Array(n * n).fill(NaN);       // livello dei laghi in quota
  const seed = derivaSeme(carta.seme, 101);
  const esito = { quota: 0, livello: NaN };
  for (let r = 0; r < n; r++) {
    if (r % 4 === 0) yield;
    const z = cz - half + r * cell;
    for (let c = 0; c < n; c++) {
      const x = cx - half + c * cell, i = r * n + c;
      heights[i] = quotaFinale(carta, x, z, seed, esito);
      fiume[i] = esito.livello;
      lago[i] = livelloLago(carta, x, z);
    }
  }
  // Strade nel blocco (nastro della carreggiata, js/3d/acqua.js) e ripiano sotto la carreggiata sul terreno disegnato.
  const quoteStrade = [];
  const strade = stradeBlocco(carta, cx, cz, half, 2, quoteStrade);
  spianaSottoStrade(carta, cx, cz, heights, fiume, lago, n, cell, half, strade, quoteStrade);
  yield;
  // Tracciati dei fiumi nel blocco (coordinate locali, tagliati sul bordo): per il nastro d'acqua.
  const tracciati = tracciatiFiumi(carta, cx, cz, half, true);
  const meta = {
    name: `mondo-${carta.seme}`, cols: n, rows: n, cellSize: cell, sizeMeters: SCENA.lato,
    source: `generato · seme ${carta.seme} · centro ${(cx / 1000).toFixed(2)}, ${(cz / 1000).toFixed(2)} km`,
    seme: carta.seme, centroMondo: { x: cx, z: cz },
    ms: performance.now() - t0, msFiumi, msStrade,
  };
  // Quota del terreno disegnato (triangoli NO–SE come terrain.getHeight) per appoggiarci il nastro della strada.
  const altezza = (x, z) => {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = Math.min(Math.max(fx, 0), n - 1); fz = Math.min(Math.max(fz, 0), n - 1);
    const c = Math.min(Math.floor(fx), n - 2), r = Math.min(Math.floor(fz), n - 2), u = fx - c, v = fz - r;
    const a = heights[r * n + c], b = heights[r * n + c + 1], d = heights[(r + 1) * n + c], e = heights[(r + 1) * n + c + 1];
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  };
  const attraversamenti = attraversamentiBlocco(carta, cx, cz, half);
  return { meta, heights, acqua: { fiume, lago, tracciati, strade, quoteStrade, altezza, attraversamenti } };
}
