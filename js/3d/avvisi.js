// Knight Dawn — riquadro degli avvisi, in alto a sinistra (G1, proposta approvata dall'utente, novembre 2026).
// Linguette Notizie · Voci · Bandi · Consigli (con un pallino se c'è qualcosa di non letto; il clic apre quella sezione
// dello scrittoio) e due strisce di carta come i messaggi dei piccioni viaggiatori: «dal mondo» (l'ultima notizia, voce
// o fatto) e «consiglio» (un suggerimento scritto dentro il mondo, calcolato dallo stato del gioco).
// Ogni striscia cambia lentamente (CICLO_MS) e solo tra i messaggi recenti; un messaggio nuovo resta fermo con il
// sigillo finché non viene letto (mouse sopra o clic). Nessun costo per fotogramma: il DOM cambia solo all'arrivo di un
// messaggio o allo scatto del ciclo. Solo DOM, niente Three.js.

import { sfondoSvg, strappo, rng } from './interfaccia.js';

export const SEZIONI = [['notizie', 'Notizie'], ['voci', 'Voci'], ['bandi', 'Bandi'], ['consigli', 'Consigli']];
const CICLO_MS = 25000;       // ogni striscia cambia ogni ~25 s (ruoli diversi: sfasate di metà ciclo)
const RECENTI = 3;            // la striscia «dal mondo» gira tra gli ultimi messaggi

/** Sezione dello scrittoio per un foglio (`doc.tipo`). */
export const sezioneDi = (doc) => (doc.tipo === 'voce' ? 'voci' : doc.tipo === 'bando' ? 'bandi' : doc.tipo === 'consiglio' ? 'consigli' : 'notizie');

const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SIGILLO = (l) => `<svg class="sigillo" viewBox="0 0 52 52" aria-hidden="true"><path d="M26 3 L33 6 L40 5 L45 12 L49 18 L48 26 L50 33 L45 40 L40 46 L32 47 L26 50 L19 47 L12 46 L7 40 L3 33 L5 26 L3 18 L8 12 L12 5 L19 6 Z" fill="#8a1a12" stroke="rgba(0,0,0,.35)"/>`
  + `<circle cx="26" cy="26" r="15" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><text x="26" y="33" text-anchor="middle" font-family="UnifrakturMaguntia" font-size="21" fill="rgba(0,0,0,.45)">${_esc(l)}</text></svg>`;
const PICCIONE = '<svg class="piccione" width="26" height="20" viewBox="0 0 26 20" aria-hidden="true"><path d="M2 12 C6 6 10 6 13 9 C15 4 20 1 24 2 C20 4 18 7 17 10 C19 11 21 13 21 15 C17 15 13 15 9 14 C6 14 4 13 2 12 Z" fill="#6e5534"/><circle cx="20.5" cy="4" r=".9" fill="#efdfb4"/></svg>';

/** Striscia di carta arrotolata a sinistra, con la cordicella; bordo appena irregolare (il testo resta leggibile). */
function striscia(seme, w, h) {
  const b = strappo(30, 4, w - 3, h - 4, rng(seme), 0.3), k = 'av' + seme;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>
    <linearGradient id="${k}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecdcb0"/><stop offset=".5" stop-color="#e6d2a2"/><stop offset="1" stop-color="#cfb27a"/></linearGradient>
    <linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8945a"/><stop offset=".3" stop-color="#f0e2bc"/><stop offset=".7" stop-color="#d8bc84"/><stop offset="1" stop-color="#8a6a38"/></linearGradient>
    <filter id="${k}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seme}"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .22 0"/></filter>
    <clipPath id="${k}k"><path d="${b}"/></clipPath></defs>
    <path d="${b}" fill="url(#${k}c)"/><g clip-path="url(#${k}k)"><rect width="${w}" height="${h}" filter="url(#${k}g)"/>
    <path d="${b}" fill="none" stroke="#7a5420" stroke-width="5" stroke-opacity=".25"/></g>
    <path d="${b}" fill="none" stroke="#5a3512" stroke-width=".8" stroke-opacity=".5"/>
    <rect x="8" y="1" width="26" height="${h - 2}" rx="11" fill="url(#${k}r)" stroke="#6a4a1c" stroke-width=".8"/>
    <path d="M14 0 C 17 ${h * 0.4} 16 ${h * 0.6} 13 ${h} M24 0 C 21 ${h * 0.4} 22 ${h * 0.6} 25 ${h}" stroke="#7a5a30" stroke-width="1.8" fill="none"/></svg>`;
}

/**
 * Riquadro degli avvisi.
 * @param {{ onApri: (sezione: string) => void, notizie: () => object[] }} opzioni
 *   `notizie()`: i fogli ricevuti (doc con `id`, `tipo`, `testo`, `chi`, `letto`), dal più recente.
 * @returns {{ aggiorna: () => void, consigli: (lista: object[]) => void, nascondi: (b: boolean) => void,
 *   consigliAttuali: () => object[], nonLetti: (sezione: string) => number, segnaLetti: (sezione: string) => void, distruggi: () => void }}
 */
export function creaAvvisi(opzioni) {
  const el = document.createElement('div');
  el.className = 'avvisi';
  el.innerHTML = `<div class="linguette">${SEZIONI.map(([id, n]) => `<button type="button" data-s="${id}">${n}</button>`).join('')}`
    + '<span class="tasto">J: scrittoio</span></div>'
    + '<div class="striscia mondo" hidden><div class="chi"></div><div class="riga"></div><span class="segno"></span></div>'
    + '<div class="striscia consiglio" hidden><div class="chi"></div><div class="riga"></div><span class="segno"></span></div>';
  document.body.appendChild(el);
  document.body.classList.add('con-avvisi');
  const linguette = Object.fromEntries([...el.querySelectorAll('.linguette button')].map((b) => [b.dataset.s, b]));
  for (const [id, b] of Object.entries(linguette)) b.addEventListener('click', () => opzioni.onApri(id));
  const strisce = [...el.querySelectorAll('.striscia')].map((s, i) => ({
    el: s, chi: s.querySelector('.chi'), riga: s.querySelector('.riga'), segno: s.querySelector('.segno'),
    i: 0, mostrato: null, timer: 0, stacca: sfondoSvg(s, (w, h) => striscia(11 + i * 7, w, h)),
  }));
  const [S1, S2] = strisce;

  let sopra = false, nascosto = false, contati = {};
  let consigli = [];                         // [{ chi, testo, peso }], il primo è il più urgente
  const consigliVisti = new Set();           // testi dei consigli già letti (nella sessione)

  // Messaggi candidati per ciascuna striscia; `nuovo`: non ancora letto (si ferma lì col sigillo).
  const candidatiMondo = () => opzioni.notizie().filter((d) => sezioneDi(d) !== 'consigli').slice(0, RECENTI)
    .map((d) => ({ chiave: d.id, chi: d.chi || etichetta(d), testo: d.testo, nuovo: !d.letto, sezione: sezioneDi(d), doc: d }));
  const candidatiConsiglio = () => consigli.slice(0, RECENTI)
    .map((c) => ({ chiave: c.testo, chi: c.chi, testo: c.testo, nuovo: !consigliVisti.has(c.testo), sezione: 'consigli', consiglio: c }));

  function mostra(s, m) {
    s.el.hidden = !m;
    if (!m) { s.mostrato = null; return; }
    if (s.mostrato?.chiave !== m.chiave || s.mostrato?.nuovo !== m.nuovo) {
      s.chi.textContent = m.chi;
      s.riga.textContent = m.testo;
      s.el.title = m.testo;
      s.segno.innerHTML = m.nuovo ? SIGILLO(m.chi[0] || '') : PICCIONE;
      s.el.classList.toggle('nuova', m.nuovo);
    }
    s.mostrato = m;
  }
  /** Sceglie il messaggio di una striscia: il primo non letto (fermo), altrimenti il ciclo. */
  function scegli(s, candidati, avanza) {
    const c = candidati();
    if (!c.length) { mostra(s, null); return; }
    const nuovo = c.findIndex((m) => m.nuovo);
    if (nuovo >= 0) s.i = nuovo;
    else if (avanza) s.i = (s.i + 1) % c.length;
    else s.i = Math.min(s.i, c.length - 1);
    mostra(s, c[s.i]);
  }
  function programma(s, candidati, ritardo = CICLO_MS) {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      if (!sopra && !nascosto && !s.mostrato?.nuovo) scegli(s, candidati, true);
      programma(s, candidati);
    }, ritardo);
  }

  function aggiornaLinguette() {
    const nonLetti = { notizie: 0, voci: 0, bandi: 0, consigli: 0 };
    for (const d of opzioni.notizie()) if (!d.letto) nonLetti[sezioneDi(d)]++;
    for (const c of consigli) if (!consigliVisti.has(c.testo)) nonLetti.consigli++;
    for (const [id, b] of Object.entries(linguette)) b.classList.toggle('nuovo', nonLetti[id] > 0);
    contati = nonLetti;
  }
  /** Ridisegna strisce e linguette (all'arrivo di un messaggio, dopo una lettura). */
  function aggiorna() {
    scegli(S1, candidatiMondo, false);
    scegli(S2, candidatiConsiglio, false);
    aggiornaLinguette();
  }
  /** Il messaggio di una striscia è stato letto (mouse sopra o clic). */
  function leggi(s) {
    const m = s.mostrato;
    if (!m?.nuovo) return;
    if (m.doc) m.doc.letto = true;
    if (m.consiglio) consigliVisti.add(m.consiglio.testo);
    aggiorna();
  }
  for (const s of strisce) {
    s.el.addEventListener('mouseenter', () => leggi(s));
    s.el.addEventListener('click', () => { leggi(s); if (s.mostrato) opzioni.onApri(s.mostrato.sezione); });
  }
  el.addEventListener('mouseenter', () => { sopra = true; });
  el.addEventListener('mouseleave', () => { sopra = false; });
  programma(S1, candidatiMondo);
  programma(S2, candidatiConsiglio, CICLO_MS * 1.5);   // sfasata: le due strisce non cambiano insieme

  return {
    aggiorna,
    /** Nuova lista di consigli (calcolata dallo stato del gioco): cambia la striscia solo se cambia la lista. */
    consigli(lista) {
      const prima = consigli.map((c) => c.testo).join('\n');
      consigli = lista ?? [];
      if (consigli.map((c) => c.testo).join('\n') !== prima) aggiorna();
    },
    consigliAttuali: () => consigli,
    /** Quanti messaggi non letti ci sono in una sezione (pallino della linguetta). */
    nonLetti: (sezione) => contati[sezione] ?? 0,
    /** Tutto ciò che è in una sezione si considera letto (lo scrittoio l'ha mostrata). */
    segnaLetti(sezione) {
      if (sezione === 'consigli') for (const c of consigli) consigliVisti.add(c.testo);
      else for (const d of opzioni.notizie()) if (sezioneDi(d) === sezione) d.letto = true;
      aggiorna();
    },
    nascondi(b) {
      if (b === nascosto) return;
      nascosto = b;
      el.hidden = b;
      document.body.classList.toggle('con-avvisi', !b);
    },
    distruggi() { strisce.forEach((s) => { clearTimeout(s.timer); s.stacca(); }); el.remove(); document.body.classList.remove('con-avvisi'); },
  };
}

function etichetta(d) {
  return d.tipo === 'voce' ? 'Voce di popolo' : d.tipo === 'bando' ? 'Bando' : d.tipo === 'lettera' ? 'Lettera' : 'Dal mondo';
}
