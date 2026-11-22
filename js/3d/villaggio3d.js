// Knight Dawn — villaggi e ovili del mondo generato (M8, passo 2). Piano: docs/ESPLORAZIONE_3D.md, «M8 — Luoghi del
// mondo». Usa il kit di edifici di M7 (edifici3d.js: case, edifici nominati, torce, finestre accese), lo stesso dei
// borghi e della campagna: stesso stile, stesse prestazioni (una chiamata per materiale, dettagli a istanze per zone
// spente da lontano).
//
// Siti da js/mondo/siti.js (`carta.siti`, coordinate del mondo):
//   - frazione (6–10 case) e villaggio (12–20 case, con pieve, locanda e fabbro): uno slargo con il pozzo, le case
//     attorno rivolte allo slargo; vicino alla strada che arriva al villaggio (strade.js la porta fin dentro) le case
//     si allineano alla strada, con la porta verso di lei. Case rurali (fienile, pagliaio, legna), basse e qualche
//     casa a schiera; mai sulla carreggiata, nell'acqua o su terreno troppo ripido (lo zoccolo resta di pochi metri);
//   - ovile: una stalla con il recinto e un pagliaio.
// Niente terrapieno: le case stanno sul terreno com'è, con lo zoccolo di pietra del kit (i siti dei villaggi sono già i
// punti più piani della cella). Gli alberi non crescono nel villaggio: main.js passa alla vegetazione un piano rotondo
// per sito (pianoDelSito) che la tiene fuori.
//
// Costruzione a pezzi (blocco che segue il cavaliere, M7 passo 9): createVillaggioAPezzi è un generatore che cede il
// passo ogni ~PEZZO_MS ms e restituisce lo stesso oggetto di createVillaggio.

import { creaKit, completaPezzi, siToccano, PEZZO_MS } from './edifici3d.js';
import { quotaFinale, livelloLago } from '../mondo/scena.js';
import { distanzaStrada } from '../mondo/strade.js';
import { hash2 } from '../mondo/rumore.js';
import { raggioSito } from '../mondo/siti.js';

export const VILLAGGI = {
  frazione: { case: [6, 10], slargo: 8, pozzo: 0.6 },
  villaggio: { case: [12, 20], slargo: 12, pozzo: 1, nominati: ['chiesa', 'taverna', 'fabbro'] },
  // Pieve: la chiesa del kit, più piccola (EDIFICI.chiesa è quella del borgo).
  pieve: { largo: 9, fondo: 16, piani: 2 },
  tipi: { frazione: { rurale: 0.65, bassa: 0.35 }, villaggio: { rurale: 0.45, bassa: 0.35, schiera: 0.2 } },
  dislivello: 2.6,          // m: dislivello massimo sotto una casa (lo zoccolo copre il resto)
  strada: { libero: 3.5, allinea: 22 },   // m oltre il bordo della banchina; entro `allinea` la casa guarda la strada
  margine: 2.5,             // m tra due edifici
  tentativi: 140,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Piano rotondo per tenere fuori la vegetazione (formato dei piani di luoghi.js, distanzaPiano di scena.js). Dentro il
 * piano niente vegetazione (terra battuta del villaggio); oltre, per VEGETAZIONE.spianata m, solo erba e sassi: con
 * raggio 0,7 R gli alberi restano fuori da tutto il villaggio, e tra le case di fuori cresce l'erba.
 */
export function pianoDelSito(s) {
  const r = 0.7 * raggioSito(s);
  return { cx: s.x, cz: s.z, ux: 1, uz: 0, a: r, b: r, r, s: 4 };
}

/**
 * Villaggio o ovile in coordinate del blocco: centro del sito in (ox, oz). `suolo.getHeight(x, z)` nel blocco (anche
 * fuori, con quotaFinale), `carta` per strade e acqua, (cx, cz) centro del blocco nel mondo.
 */
export function createVillaggio(suolo, sito, ox, oz, carta, cx, cz) {
  return completaPezzi(createVillaggioAPezzi(suolo, sito, ox, oz, carta, cx, cz));
}

export function* createVillaggioAPezzi(suolo, sito, ox, oz, carta, cx, cz) {
  const seme = hash2(Math.floor(sito.x), Math.floor(sito.z), carta.seme ^ 0x7a11a6e) || 1;
  const ovile = sito.tipo === 'ovile';
  const kit = creaKit({ X: (u) => ox + u, Z: (u, v) => oz + v, terreno: (u, v) => suolo.getHeight(ox + u, oz + v),
    seme, nome: ovile ? `ovile-${sito.id}` : `villaggio-${sito.id}`, contesto: 'campagna' });
  const rnd = kit.rnd;
  const R = raggioSito(sito);
  const lotti = [];                                       // rettangoli occupati { c, s, f, a, b }
  const es = { quota: 0, livello: NaN }, st = { d: Infinity, semi: 0, banchina: 0 };
  const W = (u, v) => [sito.x + u, sito.z + v];          // locale → mondo
  const fuoriStrada = (u, v) => {
    const [x, z] = W(u, v);
    distanzaStrada(carta, x, z, st);
    return st.d - st.semi - (st.banchina ?? 0);
  };
  const asciutto = (u, v) => {
    const [x, z] = W(u, v);
    quotaFinale(carta, x, z, undefined, es);
    return Number.isNaN(es.livello) && Number.isNaN(livelloLago(carta, x, z));
  };
  /** Il rettangolo (centro c, fronte f, mezze misure a lungo s, b lungo f) si può costruire qui? */
  function libero(c, f, a, b) {
    const s = [-f[1], f[0]], L = { c, s, f, a, b };
    if (lotti.some((o) => siToccano(o, L, VILLAGGI.margine))) return false;
    let mn = Infinity, mx = -Infinity;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const u = c[0] + s[0] * a * i + f[0] * b * j, v = c[1] + s[1] * a * i + f[1] * b * j;
      if (fuoriStrada(u, v) < VILLAGGI.strada.libero || !asciutto(u, v)) return false;
      const h = suolo.getHeight(ox + u, oz + v);
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    return mx - mn <= VILLAGGI.dislivello;
  }
  /** Fronte verso la strada più vicina (gradiente della distanza), se entro `allinea` m; altrimenti null. */
  function versoStrada(u, v) {
    const d0 = fuoriStrada(u, v);
    if (d0 > VILLAGGI.strada.allinea) return null;
    const gu = fuoriStrada(u + 1, v) - fuoriStrada(u - 1, v), gv = fuoriStrada(u, v + 1) - fuoriStrada(u, v - 1), n = Math.hypot(gu, gv);
    return n > 1e-6 ? [-gu / n, -gv / n] : null;
  }
  let t0 = performance.now();
  const forse = function* () { if (performance.now() - t0 > PEZZO_MS) { yield; t0 = performance.now(); } };
  const misure = { case: 0, scartate: 0 };

  if (ovile) {
    // Stalla con recinto (EDIFICI.stalla) e un pagliaio: verso a caso, spostata un poco se il punto non va.
    for (let k = 0; k < 12; k++) {
      const a = rnd() * Math.PI * 2, d = k ? 4 + rnd() * 10 : 0, c = [Math.cos(a) * d, Math.sin(a) * d];
      const fa = rnd() * Math.PI * 2, f = [Math.cos(fa), Math.sin(fa)];
      if (!libero(c, f, 7 + 9, 4)) continue;                // stalla 14 m + recinto 8 m
      kit.edificio('stalla', { u: c[0], v: c[1], fu: f[0], fv: f[1] });
      lotti.push({ c, s: [-f[1], f[0]], f, a: 16, b: 4 });
      kit.pagliaio(c[0] - f[0] * 9 + f[1] * 4, c[1] - f[1] * 9 - f[0] * 4);
      misure.case++;
      break;
    }
  } else {
    const V = VILLAGGI[sito.dimensione === 'villaggio' ? 'villaggio' : 'frazione'];
    const nCase = V.case[0] + Math.floor(rnd() * (V.case[1] - V.case[0] + 1));
    // Slargo: libero da case; il pozzo nel mezzo (se lo slargo è asciutto e non è la carreggiata).
    lotti.push({ c: [0, 0], s: [1, 0], f: [0, 1], a: V.slargo - VILLAGGI.margine, b: V.slargo - VILLAGGI.margine });
    if (rnd() < V.pozzo && fuoriStrada(0, 0) > 2 && asciutto(0, 0)) kit.pozzo(0, 0);
    // Edifici nominati (villaggio grande) per primi, vicino allo slargo.
    const coda = [...(V.nominati ?? []).map((tipo) => ({ tipo })), ...Array.from({ length: nCase }, () => ({ casa: true }))];
    for (const e of coda) {
      let fatto = false;
      for (let k = 0; k < VILLAGGI.tentativi && !fatto; k++) {
        // Anelli dallo slargo verso fuori: i primi tentativi vicini, poi sempre più lontano fino al raggio.
        const frac = Math.min(1, (k + 4) / VILLAGGI.tentativi * 1.6);
        const d = V.slargo + 6 + frac * (R - V.slargo - 10) * Math.sqrt(rnd());
        const ang = rnd() * Math.PI * 2, c = [Math.cos(ang) * d, Math.sin(ang) * d];
        let f = versoStrada(c[0], c[1]);
        if (!f) { const n = Math.hypot(c[0], c[1]); f = [-c[0] / n, -c[1] / n]; }     // verso lo slargo
        const tw = (rnd() - 0.5) * 0.25, cs = Math.cos(tw), sn = Math.sin(tw);
        f = [f[0] * cs - f[1] * sn, f[0] * sn + f[1] * cs];
        let largo, fondo, tipoCasa = null;
        if (e.tipo === 'chiesa') ({ largo, fondo } = VILLAGGI.pieve);
        else if (e.tipo) ({ largo, fondo } = { taverna: { largo: 11, fondo: 9 }, fabbro: { largo: 9 + 8.8, fondo: 7 } }[e.tipo]);
        else {
          let x = rnd();
          for (const [t, p] of Object.entries(VILLAGGI.tipi[sito.dimensione === 'villaggio' ? 'villaggio' : 'frazione'])) { tipoCasa = t; if ((x -= p) < 0) break; }
          largo = tipoCasa === 'rurale' ? 10 + 5.5 : tipoCasa === 'schiera' ? 7 : 6.5;   // con il fienile accanto
          fondo = tipoCasa === 'rurale' ? 8 : 8.5;
        }
        if (!libero(c, f, largo / 2, fondo / 2)) { misure.scartate++; continue; }
        if (e.tipo === 'chiesa') kit.edificio('chiesa', { u: c[0], v: c[1], fu: f[0], fv: f[1], misure: VILLAGGI.pieve });
        else if (e.tipo) kit.edificio(e.tipo, { u: c[0], v: c[1], fu: f[0], fv: f[1] });
        else { kit.casa({ u: c[0], v: c[1], fu: f[0], fv: f[1], tipo: tipoCasa }); misure.case++; }
        lotti.push({ c, s: [-f[1], f[0]], f, a: largo / 2, b: fondo / 2 + (tipoCasa === 'rurale' ? 6 : 0) });   // l'aia davanti
        fatto = true;
      }
      yield* forse();
    }
  }
  yield;
  const r = yield* kit.chiudiAPezzi();
  Object.assign(r.misure, misure);
  const scatole = r.scatole;
  // Collisioni: scatole orientate locali (u, v) = (x − ox, z − oz); griglia di 16 m per cercare solo le vicine.
  const griglia = new Map(), G = 16;
  scatole.forEach((s, i) => {
    const e = Math.max(s.hl, s.hw) + 1;
    for (let a = Math.floor((s.cu - e) / G); a <= Math.floor((s.cu + e) / G); a++) {
      for (let b = Math.floor((s.cv - e) / G); b <= Math.floor((s.cv + e) / G); b++) {
        const k = a * 100003 + b;
        if (!griglia.has(k)) griglia.set(k, []);
        griglia.get(k).push(i);
      }
    }
  });
  function spingiFuori(x, z, raggio, yPiedi = -Infinity, superabile = 0) {
    let u = x - ox, v = z - oz;
    if (Math.abs(u) > R + 20 || Math.abs(v) > R + 20) return null;
    const L = griglia.get(Math.floor(u / G) * 100003 + Math.floor(v / G));
    if (!L) return null;
    let mosso = false;
    for (let it = 0; it < 4; it++) {
      let qui = false;
      for (const i of L) {
        const s = scatole[i], du = u - s.cu, dv = v - s.cv;
        if (s.cima !== undefined && s.cima <= yPiedi + superabile) continue;   // basso: si supera
        const a = du * s.au + dv * s.av, b = -du * s.av + dv * s.au;
        const qa = clamp(a, -s.hl, s.hl), qb = clamp(b, -s.hw, s.hw), ea = a - qa, eb = b - qb, d2 = ea * ea + eb * eb;
        if (d2 >= raggio * raggio) continue;
        let na = a, nb = b;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); na = qa + ea / d * raggio; nb = qb + eb / d * raggio; } else {
          const vie = [a + s.hl, s.hl - a, b + s.hw, s.hw - b], m = vie.indexOf(Math.min(...vie));
          if (m === 0) na = -s.hl - raggio; else if (m === 1) na = s.hl + raggio; else if (m === 2) nb = -s.hw - raggio; else nb = s.hw + raggio;
        }
        u = s.cu + na * s.au - nb * s.av; v = s.cv + na * s.av + nb * s.au;
        qui = mosso = true;
      }
      if (!qui) break;
    }
    return mosso ? { x: u + ox, z: v + oz } : null;
  }
  return { tipo: ovile ? 'ovile' : 'villaggio', sito, object: r.object, solidi: r.solidi, spingiFuori, quotaSuolo: () => null,
    dentro: () => false, aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici, raggio: R };
}
