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

import { gradienteD, derivaSeme, smoothstep, ridged } from './rumore.js';
import { ACQUA, profiloMassicci } from './carta.js';
import { tracciaPercorso, lettoMonotono, PERCORSO } from './fiumi.js';

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
  q = { base, fondo };
  _liscia.set(carta, q);
  return q;
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
  semilarghezza: { base: 1.5, perRadice: 0.6, max: 60 }, // m: base + perRadice·√bacino (km²): torrente da 20 km² ~8 m
  profondita: { base: 0.5, perRadice: 0.022 },           // m d'acqua: ~0,8 m a 150 km² (si guada), ~1,2 m a 1000 km², ~2,7 m a 10 000 km²
  sponda: { larghezza: 6, altezza: 0.8 },                // m: sponde basse oltre il pelo dell'acqua
  argine: 0.15,                                          // pendenza oltre le sponde dove il terreno è più basso
  versante: 0.12, curva: 2,                              // pendenza dei versanti: versante + curva·(fuori/R)²
  valle: { base: 120, perSemilarghezza: 8 },             // R (m oltre le sponde): ~240 m a 15 m di semilarghezza
  raggio: 1000,                                          // R massimo (m), per l'indice spaziale
  riva: { soglia: 0.25, sopra: 0.5 },                    // laghi: indicatore oltre cui è lago; riva sopra il livello (m)
  scendi: 0.02,                                          // m: discesa minima del letto tra due punti (~0,2 km)
  cellaIndice: 1000,                                     // m: celle dell'indice spaziale dei tratti
  // Tratti tra punti fissi (js/mondo/fiumi.js): sorgente, foce e confluenze. Alla confluenza il punto fisso
  // sta nel punto più basso del terreno in una griglia di 7×7 punti a `scosta` m attorno al tracciato.
  tratti: { scosta: 80, zona: 6000, tieni: 6 },
};

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
      const r = Math.sqrt(Math.max(1, f[i * 4 + 2]));
      w[i] = Math.min(F.semilarghezza.max, F.semilarghezza.base + F.semilarghezza.perRadice * r);
      prof[i] = F.profondita.base + F.profondita.perRadice * r;
      // Letto sotto la superficie liscia della Carta: pelo dell'acqua F.sponda.altezza sotto il terreno.
      // Vicino ai laghi conta la riva rialzata come nella Scena (scavaFiumi), dentro il livello del lago.
      const suolo = conRiva(carta, x[i], z[i], quotaCarta(carta, x[i], z[i]));
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
      if (k === m - 1 && foce[ci]) {
        const f = fissi[foce[ci][0]].get(foce[ci][1]);
        if (f) { x = f.x; z = f.z; L = f.L; }
      } else if (k > 0 && k < m - 1) {
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
    // Tracciato della Carta con gli estremi nei punti fissi e il letto tra i loro due valori.
    const cv = pronto.curve[tr.ci], n = tr.kb - tr.ka + 1;
    const p = { x: new Float64Array(n), z: new Float64Array(n), letto: new Float64Array(n), w: new Float64Array(n), prof: new Float64Array(n) };
    for (let j = 0; j < n; j++) {
      const i = tr.ka + j;
      p.x[j] = cv.x[i]; p.z[j] = cv.z[i]; p.w[j] = cv.w[i]; p.prof[j] = cv.prof[i];
      p.letto[j] = Math.min(tr.A.L, Math.max(tr.B.L, cv.letto[i]));
    }
    p.x[0] = tr.A.x; p.z[0] = tr.A.z; p.letto[0] = tr.A.L;
    p.x[n - 1] = tr.B.x; p.z[n - 1] = tr.B.z; p.letto[n - 1] = tr.B.L;
    tr.grezzo = conRiquadro(p);
  }
  return tr.grezzo;
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

/** Cerca sul terreno il percorso di un tratto (una volta per Carta). */
function raffina(carta, pronto, id) {
  if (pronto.raffinati.has(id)) return;
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
  if (peggio <= F.tratti.tieni) { pronto.raffinati.set(id, polilinea(carta, pronto, id)); return; }
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
  pronto.raffinati.set(id, conRiquadro(p));
}

/**
 * Cerca il percorso sul terreno dei tratti di fiume entro `raggio` m (in quadrato) da (cx, cz). Fuori da
 * questa zona i fiumi seguono il tracciato della Carta (solo nell'orizzonte lontano). Restituisce i ms.
 */
export function raffinaZona(carta, cx, cz, raggio = FIUMI_SCENA.tratti.zona) {
  const t0 = performance.now();
  const pronto = fiumiScena(carta);
  pronto.tratti.forEach((tr, id) => {
    const [x0, z0, x1, z1] = tr.riquadro;
    if (x1 < cx - raggio || x0 > cx + raggio || z1 < cz - raggio || z0 > cz + raggio) return;
    raffina(carta, pronto, id);
  });
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
    const p = polilinea(carta, pronto, id);
    out.push({ x: p.x, z: p.z, w: p.w });
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
    for (const i of segmenti) {
    const ax = cv.x[i], az = cv.z[i], bx = cv.x[i + 1], bz = cv.z[i + 1];
    if ((ax < x - R && bx < x - R) || (ax > x + R && bx > x + R) || (az < z - R && bz < z - R) || (az > z + R && bz > z + R)) continue;
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
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
    } else {
      if (Number.isNaN(dettaglio)) dettaglio = h0 - quotaCarta(carta, x, z);
      const c = pelo + F.sponda.altezza + fuori * (F.versante + F.curva * (fuori / Rv) * (fuori / Rv))
        + dettaglio * smoothstep(0, 0.6 * Rv, fuori);
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

/** Distanza con segno (m) dal contorno di un piano: negativa dentro. */
export function distanzaPiano(p, x, z) {
  const dx = x - p.cx, dz = z - p.cz;
  const lu = dx * p.ux + dz * p.uz, lv = -dx * p.uz + dz * p.ux;
  const qx = (lu < 0 ? -lu : lu) - (p.a - p.r), qy = (lv < 0 ? -lv : lv) - (p.b - p.r);
  const ex = qx > 0 ? qx : 0, ey = qy > 0 ? qy : 0;
  const m = qx > qy ? qx : qy;
  return Math.sqrt(ex * ex + ey * ey) + (m < 0 ? m : 0) - p.r;
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
  const T = TERRAPIENO.pendenza;
  for (let k = 0; k < L.length; k++) {
    const l = L[k], P = l.piani;
    if (!P) continue;
    const ex = x - l.x, ez = z - l.z;
    if (ex * ex + ez * ez > l.raggioPiani * l.raggioPiani) continue;
    let lo = -Infinity, hi = Infinity, ritorno = 0;
    for (let j = 0; j < P.length; j++) {
      const p = P[j];
      let d = distanzaPiano(p, x, z);
      // Peso del piano: 1 fino alla sua scarpata, poi scende fino a zero in TERRAPIENO.ritorno m.
      const f = 1 - smoothstep(p.s, p.s + TERRAPIENO.ritorno, d);
      if (f > ritorno) ritorno = f;
      if (f <= 0) continue;
      if (d < 0) d = 0;
      const a = p.q - d * T, b = p.q + d * T;
      if (a > lo) lo = a;
      if (b < hi) hi = b;
    }
    if (ritorno <= 0) continue;
    const c = lo <= hi ? (h < lo ? lo : h > hi ? hi : h) : hi;
    return h + ritorno * (c - h);                    // i siti distano chilometri: al più uno tocca il punto
  }
  return h;
}

/**
 * Quota finale del mondo nel punto (x, z): rilievo (quotaMondo), fiumi e laghi (scavaFiumi), terrapieni dei luoghi
 * (spianaLuoghi). Unico punto usato da blocco, orizzonte e Carta zoomata.
 */
export function quotaFinale(carta, x, z, seedDettaglio = derivaSeme(carta.seme, 101), esito = _esito, pesi = null) {
  return spianaLuoghi(carta, x, z, scavaFiumi(carta, x, z, quotaMondo(carta, x, z, seedDettaglio, pesi), esito));
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
      for (let i = j === 0 ? 0 : 1; i < cv.x.length; i++) {
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
 * Blocco di terreno di una Scena, nello stesso formato del terreno reale (griglia di quote + metadati):
 * terrain.js lo usa senza sapere da dove viene.
 * @param {object} carta  dalla generaCarta
 * @param {number} cx  centro del blocco, x del mondo (m)
 * @param {number} cz  centro del blocco, z del mondo (m)
 * @returns {{ meta: object, heights: Float32Array }}
 */
export function generaScena(carta, cx, cz) {
  const t0 = performance.now();
  const msFiumi = raffinaZona(carta, cx, cz);
  const n = SCENA.celle + 1, cell = SCENA.lato / SCENA.celle, half = SCENA.lato / 2;
  const heights = new Float32Array(n * n);
  const fiume = new Float32Array(n * n).fill(NaN);      // pelo dell'acqua dei fiumi (NaN = asciutto)
  const lago = new Float32Array(n * n).fill(NaN);       // livello dei laghi in quota
  const seed = derivaSeme(carta.seme, 101);
  const esito = { quota: 0, livello: NaN };
  for (let r = 0; r < n; r++) {
    const z = cz - half + r * cell;
    for (let c = 0; c < n; c++) {
      const x = cx - half + c * cell, i = r * n + c;
      heights[i] = quotaFinale(carta, x, z, seed, esito);
      fiume[i] = esito.livello;
      lago[i] = livelloLago(carta, x, z);
    }
  }
  // Tracciati dei fiumi nel blocco (coordinate locali, tagliati sul bordo): per il nastro d'acqua.
  const tracciati = tracciatiFiumi(carta, cx, cz, half, true);
  const meta = {
    name: `mondo-${carta.seme}`, cols: n, rows: n, cellSize: cell, sizeMeters: SCENA.lato,
    source: `generato · seme ${carta.seme} · centro ${(cx / 1000).toFixed(2)}, ${(cz / 1000).toFixed(2)} km`,
    seme: carta.seme, centroMondo: { x: cx, z: cz },
    ms: performance.now() - t0, msFiumi,
  };
  return { meta, heights, acqua: { fiume, lago, tracciati } };
}
