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

import { gradienteD, derivaSeme, smoothstep } from './rumore.js';
import { ACQUA } from './carta.js';

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
    let j = j0 - 1 + b;
    j = j < 0 ? 0 : j >= rows ? rows - 1 : j;
    let riga = 0;
    for (let a = 0; a < 4; a++) {
      let i = i0 - 1 + a;
      i = i < 0 ? 0 : i >= cols ? cols - 1 : i;
      riga += wu[a] * base[j * cols + i];
    }
    somma += wv[b] * riga;
  }
  // Profondità dei laghi, bilineare tra i centri delle celle (le stesse dell'indicatore «lago»).
  for (let b = 0; b < 2; b++) {
    const j = Math.min(rows - 1, Math.max(0, j0 + b));
    for (let a = 0; a < 2; a++) {
      const i = Math.min(cols - 1, Math.max(0, i0 + a));
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
    const j = Math.min(rows - 1, Math.max(0, j0 + b));
    for (let a = 0; a < 2; a++) {
      const i = Math.min(cols - 1, Math.max(0, i0 + a));
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
  return h + ampiezza * fbmEroso(x, z, seedDettaglio, pesi);
}

// ─── Fiumi e laghi nelle Scene (passo 6) ────────────────────────────────
// Il letto di ogni fiume si calcola una volta per Carta lungo il tracciato curvo (carta.fiumi), dalla
// sorgente alla foce, sempre in discesa e raccordato alle confluenze: dipende solo dalla posizione nel
// mondo, quindi due Scene vicine (e l'orizzonte) combaciano. Attorno al tracciato: alveo (parabola fino al
// pelo dell'acqua), sponde basse, poi versanti che risalgono fino al terreno, sempre più ripidi con la
// distanza. La fascia dei versanti è larga in proporzione al fiume (FIUMI_SCENA.valle) e il dettaglio del
// rilievo vi torna man mano: la valle segue i rilievi attorno invece di essere un solco liscio e uniforme.

const FIUMI_SCENA = {
  semilarghezza: { base: 3, perRadice: 0.6, max: 60 },   // m: base + perRadice·√bacino (km²)
  profondita: { base: 0.5, perRadice: 0.022 },           // m d'acqua: ~0,8 m a 150 km² (si guada), ~1,2 m a 1000 km², ~2,7 m a 10 000 km²
  sponda: { larghezza: 6, altezza: 0.8 },                // m: sponde basse oltre il pelo dell'acqua
  argine: 0.15,                                          // pendenza oltre le sponde dove il terreno è più basso
  versante: 0.12, curva: 2,                              // pendenza dei versanti: versante + curva·(fuori/R)²
  valle: { base: 120, perSemilarghezza: 8 },             // R (m oltre le sponde): ~240 m a 15 m di semilarghezza
  raggio: 1000,                                          // R massimo (m), per l'indice spaziale
  riva: { soglia: 0.25, sopra: 0.5 },                    // laghi: indicatore oltre cui è lago; riva sopra il livello (m)
  scendi: 0.02,                                          // m: discesa minima del letto tra due punti (~0,2 km)
  cellaIndice: 1000,                                     // m: celle dell'indice spaziale dei tratti
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
    curve.push({ x, z, letto, w, prof });
  }
  // Indice: celle di F.cellaIndice m → tratti (curva, punto) il cui riquadro allargato del raggio le tocca.
  const indice = new Map();
  const R = F.raggio, L = F.cellaIndice;
  curve.forEach((cv, ci) => {
    for (let i = 0; i < cv.x.length - 1; i++) {
      const x0 = Math.floor((Math.min(cv.x[i], cv.x[i + 1]) - R) / L), x1 = Math.floor((Math.max(cv.x[i], cv.x[i + 1]) + R) / L);
      const z0 = Math.floor((Math.min(cv.z[i], cv.z[i + 1]) - R) / L), z1 = Math.floor((Math.max(cv.z[i], cv.z[i + 1]) + R) / L);
      for (let gz = z0; gz <= z1; gz++) {
        for (let gx = x0; gx <= x1; gx++) {
          const k = gx * 1000003 + gz;
          let lista = indice.get(k);
          if (!lista) indice.set(k, (lista = []));
          lista.push(ci, i);
        }
      }
    }
  });
  pronto = { curve, indice };
  _fiumi.set(carta, pronto);
  return pronto;
}

const _esito = { quota: 0, livello: NaN };

/**
 * Quota (m) nel punto (x, z) del mondo con fiumi scavati, a partire dalla quota senza fiumi h0. Scrive in
 * `esito.livello` il pelo dell'acqua del fiume se il punto è nell'alveo (altrimenti NaN).
 */
export function scavaFiumi(carta, x, z, h0, esito = _esito) {
  const F = FIUMI_SCENA, R = F.raggio;
  const { curve, indice } = fiumiScena(carta);
  // Rive dei laghi in quota: la Carta levigata mescola la soglia del lago con il fondo e la riva scende sotto
  // il livello (l'acqua resterebbe sospesa). Nella fascia attorno al lago il terreno sale fino al livello.
  h0 = conRiva(carta, x, z, h0, false);
  esito.quota = h0; esito.livello = NaN;
  const lista = indice.get(Math.floor(x / F.cellaIndice) * 1000003 + Math.floor(z / F.cellaIndice));
  if (!lista) return h0;
  let migliore = Infinity, mL = 0, mW = 0, mB = 0, mProf = 0, mD = 0;   // tratto con l'alveo più vicino
  let cap = Infinity;                       // versanti: il più basso tra i tratti
  let fuoriMin = Infinity, peloArgine = 0, Rargine = 1;   // tratto più vicino fuori dalle sponde (argine)
  let dettaglio = NaN;                      // h0 − quota liscia della Carta: il rilievo fine del punto
  for (let k = 0; k < lista.length; k += 2) {
    const cv = curve[lista[k]], i = lista[k + 1];
    const ax = cv.x[i], az = cv.z[i], bx = cv.x[i + 1], bz = cv.z[i + 1];
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
  const { curve } = fiumiScena(carta);
  const pezzi = [];
  const dist = (p) => Math.max(Math.abs(p[0]), Math.abs(p[1]));
  const lato = (p) => (dist(p) <= half) === dentro;
  const visibile = (p) => { const d = dist(p); return d <= raggio && (!vista || d <= vista(p[3])); };
  const mescola = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  let pezzo = null;
  const chiudi = () => { if (pezzo && pezzo.length >= 8) pezzi.push(Float32Array.from(pezzo)); pezzo = null; };
  for (const cv of curve) {
    let prima = null;
    for (let i = 0; i < cv.x.length; i++) {
      const p = [cv.x[i] - cx, cv.z[i] - cz, cv.letto[i] + cv.prof[i], cv.w[i]];
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
      heights[i] = scavaFiumi(carta, x, z, quotaMondo(carta, x, z, seed), esito);
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
    ms: performance.now() - t0,
  };
  return { meta, heights, acqua: { fiume, lago, tracciati } };
}
