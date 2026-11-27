// Knight Dawn — interfaccia di gioco in HTML sopra la scena (G1, docs/EARLY_GAME.md §7).
// Passo 1: menu d'avvio, mostrato PRIMA della generazione del mondo. Poi qui: Carta del cronista vera (passo 2) e
// riquadro di combattimento (passo 4). Nessuna dipendenza da Three.js: solo DOM.

const MODALITA = {
  storia: { nome: 'Storia', riga: 'Dalla Veglia: garzone di stalla fuori dalla porta del borgo, a piedi, pochi spiccioli.' },
  libera: { nome: 'Libera', riga: 'Senza storia: cavaliere già armato, a cavallo, con gli strumenti di sviluppo (Carta con il clic, T).' },
};

// Nomi del cavaliere: registro anglo-fantasy (docs/GDD.md §2 «Culture e nomi»), con l'impronta del Signore degli
// Anelli, delle Cronache del ghiaccio e del fuoco, degli Anelli del Potere, di House of the Dragon e di Lupo Solitario:
// per lo più varianti di nomi secondari. «Casuale» nel menu d'avvio; anche il nome della modalità Libera.
const NOMI_CAVALIERE = [
  'Elfwine', 'Grimbald', 'Erkenwald', 'Hirgan', 'Beregar', 'Forlan', 'Halbard', 'Damrel', 'Imrahel', 'Dervaric',
  'Jorren', 'Rodrick', 'Brynden', 'Harwin', 'Hallis', 'Torren', 'Quenric', 'Arthor', 'Vardis', 'Edric',
  'Cristan', 'Erryk', 'Lyonel', 'Gerold', 'Halbrin', 'Valandor', 'Arondel', 'Rhygar', 'Banedor', 'Aldric',
];
export const nomeCasuale = () => NOMI_CAVALIERE[(Math.random() * NOMI_CAVALIERE.length) | 0];

const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function _quando(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const due = (n) => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/**
 * Menu d'avvio. Si risolve con la scelta del giocatore; il chiamante genera il mondo dopo.
 * @param {{
 *   partite: { storia: object|null, libera: object|null },  // { label, updated_at, seme, terreno } o null
 *   seme?: string|null,                                       // precompila il campo
 *   esporta?: (modalita: string) => string|null,              // testo JSON della partita salvata, per scaricarla
 *   leggiFile?: (testo: string) => { modalita: string, row: object },  // lancia un Error se il file non va
 * }} opzioni
 * @returns {Promise<{ modalita: 'storia'|'libera', nuova: boolean, seme: string, luogo: 'partenza'|'tavullia',
 *   importa?: object, nome?: string|null }>}
 *   seme: testo scritto ('' = casuale); luogo vale solo per una partita Libera nuova; importa: la riga di salvataggio
 *   letta da un file (la partita continua da lì).
 */
export function mostraMenuAvvio(opzioni) {
  const { partite, seme = '', esporta, leggiFile } = opzioni;
  return new Promise((risolvi) => {
    const el = document.createElement('div');
    el.id = 'menu-avvio';
    const continua = ['storia', 'libera'].filter((m) => partite[m]).map((m) => {
      const p = partite[m];
      const dove = p.terreno === 'tavullia' ? 'Tavullia' : (Number.isFinite(p.seme) ? `seme ${p.seme}` : '');
      const det = [p.label, dove, _quando(p.updated_at) && `salvata il ${_quando(p.updated_at)}`].filter(Boolean).join(' · ');
      return `<div class="partita"><button type="button" class="continua" data-modalita="${m}"><b>Continua — ${MODALITA[m].nome}</b>`
        + `<span>${_esc(det)}</span></button>`
        + (esporta ? `<button type="button" class="scarica" data-modalita="${m}" title="Scarica questa partita in un file JSON">Scarica</button>` : '')
        + '</div>';
    }).join('');
    el.innerHTML = `<div class="riquadro">
      <div class="titolo">Knight Dawn</div>
      ${continua ? `<div class="sezione">${continua}</div>` : ''}
      ${leggiFile ? `<div class="sezione file">
        <button type="button" class="carica">Carica una partita da file…</button>
        <input type="file" class="file-partita" accept=".json,application/json" hidden>
        <div class="errore" hidden></div>
      </div>` : ''}
      <div class="sezione nuova">
        <div class="etichetta">Nuova partita</div>
        <div class="modi">
          ${Object.entries(MODALITA).map(([id, m], i) => `<label class="modo"><input type="radio" name="modalita" value="${id}"${i === 0 ? ' checked' : ''}>`
            + `<b>${m.nome}</b><span>${m.riga}</span></label>`).join('')}
        </div>
        <div class="riga nome">
          <label>Nome del cavaliere <input type="text" class="nome-garzone" maxlength="24" spellcheck="false"></label>
          <button type="button" class="nome-casuale" title="Un altro nome a caso">Casuale</button>
        </div>
        <div class="riga">
          <label>Seme del mondo <input type="text" class="seme" placeholder="casuale" value="${_esc(seme)}" spellcheck="false"></label>
          <button type="button" class="casuale" title="Svuota il campo: il seme si sceglie a caso">Casuale</button>
        </div>
        <div class="riga luogo" hidden>
          <label>Partenza <select class="dove">
            <option value="partenza">Fuori dalla porta del borgo di partenza</option>
            <option value="tavullia">Tavullia (scena di prova, terreno reale)</option>
          </select></label>
        </div>
        <div class="avviso" hidden></div>
        <button type="button" class="comincia">Comincia</button>
      </div>
      <div class="sezione impostazioni">
        <div class="riga"><label>Racconto delle azioni <select class="racconto-pref">
          <option value="completo">completo (circa 11 secondi)</option>
          <option value="breve">breve (circa 4 secondi)</option>
          <option value="spento">spento</option>
        </select></label></div>
      </div>
      <div class="nota">Le due modalità hanno salvataggi separati: provare in Libera non tocca la Storia. F8 in gioco salva e
        riporta qui, dove la partita si può scaricare in un file.</div>
    </div>`;
    document.body.appendChild(el);

    const inSeme = el.querySelector('.seme');
    // Preferenza del racconto (comodità del browser: si può perdere senza danno).
    const selRacconto = el.querySelector('.racconto-pref');
    try { selRacconto.value = localStorage.getItem('kd.racconto') || 'completo'; } catch { /* niente preferenze */ }
    selRacconto.addEventListener('change', () => { try { localStorage.setItem('kd.racconto', selRacconto.value); } catch { /* pazienza */ } });
    const rigaLuogo = el.querySelector('.luogo');
    const rigaNome = el.querySelector('.riga.nome'), inNome = el.querySelector('.nome-garzone');
    inNome.value = nomeCasuale();
    el.querySelector('.nome-casuale').addEventListener('click', () => { inNome.value = nomeCasuale(); });
    const avviso = el.querySelector('.avviso');
    const modoScelto = () => el.querySelector('input[name="modalita"]:checked').value;
    const aggiorna = () => {
      const m = modoScelto();
      rigaLuogo.hidden = m !== 'libera';
      rigaNome.hidden = m !== 'storia';
      avviso.hidden = !partite[m];
      avviso.textContent = partite[m] ? `La partita ${MODALITA[m].nome} salvata verrà sostituita.` : '';
    };
    el.querySelectorAll('input[name="modalita"]').forEach((r) => r.addEventListener('change', aggiorna));
    aggiorna();

    const fine = (scelta) => {
      document.removeEventListener('keydown', suTasto, true);
      el.remove();
      risolvi(scelta);
    };
    el.querySelectorAll('.continua').forEach((b) => b.addEventListener('click', () => {
      fine({ modalita: b.dataset.modalita, nuova: false, seme: '', luogo: 'partenza' });
    }));
    el.querySelectorAll('.scarica').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.modalita, testo = esporta(m);
      if (!testo) return;
      const p = partite[m], d = p.updated_at ? new Date(p.updated_at) : new Date();
      const due = (n) => String(n).padStart(2, '0');
      const quando = `${d.getFullYear()}${due(d.getMonth() + 1)}${due(d.getDate())}-${due(d.getHours())}${due(d.getMinutes())}`;
      const dove = p.terreno === 'tavullia' ? 'tavullia' : `seme${p.seme ?? ''}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
      a.download = `knightdawn-${m}-${dove}-${quando}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }));
    const inFile = el.querySelector('.file-partita'), errore = el.querySelector('.errore');
    el.querySelector('.carica')?.addEventListener('click', () => inFile.click());
    inFile?.addEventListener('change', async () => {
      const f = inFile.files && inFile.files[0];
      inFile.value = '';
      if (!f) return;
      try {
        const { modalita: m, row } = leggiFile(await f.text());
        if (partite[m] && !window.confirm(`Il file contiene una partita ${MODALITA[m].nome}: sostituirà quella salvata. Continuare?`)) return;
        fine({ modalita: m, nuova: false, seme: '', luogo: 'partenza', importa: row });
      } catch (err) {
        errore.textContent = `«${f.name}»: ${err.message}`;
        errore.hidden = false;
      }
    });
    el.querySelector('.casuale').addEventListener('click', () => { inSeme.value = ''; inSeme.focus(); });
    const comincia = () => {
      const m = modoScelto();
      if (partite[m] && !window.confirm(`Cominciare una nuova partita ${MODALITA[m].nome}? Quella salvata verrà cancellata.`)) return;
      fine({ modalita: m, nuova: true, seme: inSeme.value.trim(), luogo: m === 'libera' ? el.querySelector('.dove').value : 'partenza',
        nome: m === 'storia' ? (inNome.value.trim() || nomeCasuale()) : null });
    };
    el.querySelector('.comincia').addEventListener('click', comincia);
    // Invio nel campo del seme comincia (sui pulsanti fa il loro clic); nessun tasto arriva al gioco mentre il menu
    // è aperto (ascolto in cattura sul documento: i tasti di main.js stanno su window e non li ricevono).
    function suTasto(e) {
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && (e.target === inSeme || e.target === inNome)) { e.preventDefault(); comincia(); }
      if (e.code !== 'Tab') e.stopPropagation();
    }
    document.addEventListener('keydown', suTasto, true);
    (el.querySelector('.continua') ?? el.querySelector('.comincia')).focus();
  });
}

// ─── Cornice intagliata e fogli (stile dei riquadri, approvato con l'utente a novembre 2026) ──────────────────────
// Disegnati in SVG alla misura vera del riquadro, deterministici dal seme (il titolo): la stessa porta ha sempre la
// stessa cornice. Legno con venatura, arco in alto, filetti e intarsi d'oro, fregi diversi agli angoli; pergamena
// invecchiata con bordo strappato. Fogli delle notizie: voce (ritaglio), lettera (sigillo), bando (affisso).
// Gli id interni agli SVG hanno un prefisso per istanza: due SVG nella stessa pagina non si rubano i ritagli.

function rng(seme) {
  let a = seme >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function semeDaTesto(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

let ORO = 'url(#${k}oro)';
const ORO_SCURO = '#6e4c18';
let _istanza = 0;

// Fregi: disegnati attorno all'origine (l'angolo), verso +x +y; scala ~1 = 90 px.
const FREGI = {
  // Voluta d'acanto: spirale con foglie.
  voluta: (r) => `
    <path d="M6 6 C 46 4 74 16 76 40 C 78 58 60 66 50 56 C 42 48 50 38 58 44" fill="none" stroke="${ORO}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M6 6 C 4 40 14 64 34 70 C 48 74 54 62 46 56" fill="none" stroke="${ORO}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M22 14 Q 40 2 58 12 Q 40 20 22 14 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7"/>
    <path d="M14 24 Q 4 44 14 60 Q 22 42 14 24 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7"/>
    <path d="M30 26 Q 44 24 50 34 Q 38 38 30 26 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".6"/>
    <circle cx="58" cy="44" r="3" fill="${ORO}"/><circle cx="8" cy="8" r="5" fill="${ORO}" stroke="${ORO_SCURO}"/>`,
  // Giglio sulla diagonale con due tralci.
  giglio: (r) => `
    <g transform="translate(30 30) rotate(-45)">
      <path d="M0 -26 C 7 -16 7 -6 0 4 C -7 -6 -7 -16 0 -26 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".8"/>
      <path d="M0 2 C 10 -4 22 -2 22 -14 C 14 -12 8 -8 4 -2" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".8"/>
      <path d="M0 2 C -10 -4 -22 -2 -22 -14 C -14 -12 -8 -8 -4 -2" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".8"/>
      <rect x="-9" y="3" width="18" height="4" rx="1.5" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7"/>
      <path d="M0 8 C 2 14 -2 16 0 22" fill="none" stroke="${ORO}" stroke-width="2"/>
    </g>
    <path d="M4 4 Q 40 6 ${62 + r() * 14} ${18 + r() * 6}" fill="none" stroke="${ORO}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M4 4 Q 6 40 ${18 + r() * 6} ${62 + r() * 14}" fill="none" stroke="${ORO}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="5" cy="5" r="4.5" fill="${ORO}" stroke="${ORO_SCURO}"/>`,
  // Nodo intrecciato con due anelli.
  nodo: (r) => `
    <path d="M8 8 C 50 8 50 44 26 44 C 6 44 8 24 26 22 C 44 20 58 34 72 30" fill="none" stroke="${ORO_SCURO}" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M8 8 C 50 8 50 44 26 44 C 6 44 8 24 26 22 C 44 20 58 34 72 30" fill="none" stroke="${ORO}" stroke-width="3" stroke-linecap="round"/>
    <path d="M8 8 C 8 50 44 50 44 26 C 44 6 24 8 22 26 C 20 44 34 58 30 72" fill="none" stroke="${ORO_SCURO}" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M8 8 C 8 50 44 50 44 26 C 44 6 24 8 22 26 C 20 44 34 58 30 72" fill="none" stroke="${ORO}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="72" cy="30" r="2.6" fill="${ORO}"/><circle cx="30" cy="72" r="2.6" fill="${ORO}"/>`,
  // Rosa a cinque petali con foglia di quercia.
  rosa: (r) => {
    let p = '';
    for (let i = 0; i < 5; i++) {
      const a = i * 72 + r() * 8;
      p += `<path d="M0 0 C 6 -6 12 -4 12 2 C 12 8 4 10 0 0 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7" transform="rotate(${a})"/>`;
    }
    return `
    <path d="M30 30 C 54 34 70 26 ${84 + r() * 10} 10" fill="none" stroke="${ORO}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M60 30 C 64 18 76 16 80 22 C 74 22 70 26 68 32 C 66 26 62 28 60 30 Z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7"/>
    <path d="M30 30 C 26 52 36 66 ${16 + r() * 8} ${80 + r() * 10}" fill="none" stroke="${ORO}" stroke-width="2.2" stroke-linecap="round"/>
    <g transform="translate(26 26)">${p}<circle r="4" fill="#7a1f12" stroke="${ORO_SCURO}"/></g>`;
  },
};

/** Bordo strappato: curva lungo il rettangolo (x0,y0)-(x1,y1) con piccole irregolarità e qualche strappo
 * graduale (rientro a campana su più punti, mai una punta secca). Lisciata con curve quadratiche. */
function strappo(x0, y0, x1, y1, r, forza = 1) {
  const pts = [];
  const lato = (ax, ay, bx, by, nx, ny) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(L / 6));
    let morso = 0, lungo = 0, fondo = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let d = (0.6 + r() * 2.4) * forza;
      if (!morso && i > 2 && i < n - 6 && r() < 0.05 * forza) { lungo = 4 + Math.floor(r() * 5); morso = lungo; fondo = (5 + r() * 8) * forza; }
      if (morso) { d += fondo * Math.sin(Math.PI * (lungo - morso + 0.5) / lungo); morso--; }
      pts.push([ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d]);
    }
  };
  lato(x0, y0, x1, y0, 0, 1); lato(x1, y0, x1, y1, -1, 0); lato(x1, y1, x0, y1, 0, -1); lato(x0, y1, x0, y0, 1, 0);
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = (q) => q.map((v) => v.toFixed(1)).join(' ');
  let d = 'M' + f(m(pts[pts.length - 1], pts[0]));
  for (let i = 0; i < pts.length; i++) d += ' Q' + f(pts[i]) + ' ' + f(m(pts[i], pts[(i + 1) % pts.length]));
  return d + ' Z';
}

/**
 * SVG della cornice per un riquadro w×h (px). B: larghezza del legno; A: altezza dell'arco in alto al centro.
 * Ritorna { svg, interno } con l'area libera per la pergamena (x, y, w, h).
 */
function cornice(w, h, seme, { B = 24, A = 18, arco = 200 } = {}) {
  const r = rng(seme);
  const k = 'kd' + (++_istanza) + '-';
  ORO = `url(#${k}oro)`;
  const t = A;                                          // il legno comincia sotto l'arco
  const cx = w / 2, a0 = cx - arco / 2, a1 = cx + arco / 2;
  const N = 12;                                         // tacche concave agli angoli
  const esterno = `M${N} ${t} L${a0} ${t} C${a0 + 30} ${t} ${cx - 50} 0 ${cx} 0 C${cx + 50} 0 ${a1 - 30} ${t} ${a1} ${t} L${w - N} ${t}`
    + ` A${N} ${N} 0 0 0 ${w} ${t + N} L${w} ${h - N} A${N} ${N} 0 0 0 ${w - N} ${h} L${N} ${h} A${N} ${N} 0 0 0 0 ${h - N} L0 ${t + N} A${N} ${N} 0 0 0 ${N} ${t} Z`;
  const ix = B, iy = t + B, iw = w - 2 * B, ih = h - t - 2 * B;
  // filetto d'oro a 7 px dal bordo, che segue arco e tacche
  const o = 7, No = N + 2;
  const filetto = `M${No + o} ${t + o} L${a0 + 4} ${t + o} C${a0 + 32} ${t + o} ${cx - 48} ${o} ${cx} ${o} C${cx + 48} ${o} ${a1 - 32} ${t + o} ${a1 - 4} ${t + o} L${w - No - o} ${t + o}`
    + ` A${No} ${No} 0 0 0 ${w - o} ${t + No + o} L${w - o} ${h - No - o} A${No} ${No} 0 0 0 ${w - No - o} ${h - o} L${No + o} ${h - o}`
    + ` A${No} ${No} 0 0 0 ${o} ${h - No - o} L${o} ${t + No + o} A${No} ${No} 0 0 0 ${No + o} ${t + o} Z`;
  // Intarsi lungo i lati: una curva a S su ciascun lato lungo, in punti diversi.
  const yS = iy + ih * (0.3 + r() * 0.4), yD = iy + ih * (0.3 + r() * 0.4);
  const intarsi = `
    <path d="M${B / 2} ${yS - 34} C ${B - 2} ${yS - 16} 2 ${yS + 4} ${B / 2} ${yS + 30}" fill="none" stroke="${ORO}" stroke-width="2"/>
    <circle cx="${B / 2}" cy="${yS - 36}" r="2.6" fill="${ORO}"/><circle cx="${B / 2}" cy="${yS + 32}" r="2.6" fill="${ORO}"/>
    <path d="M${w - B / 2} ${yD - 28} c -9 10 9 22 0 34 c -9 10 9 22 0 30" fill="none" stroke="${ORO}" stroke-width="2"/>
    <path d="M${cx - 16} ${h - B / 2} l16 -6 l16 6 l-16 6 z" fill="${ORO}" stroke="${ORO_SCURO}" stroke-width=".7"/>
    <path d="M${cx - 70 - r() * 40} ${h - B / 2} q 20 -8 ${40 + r() * 10} 0" fill="none" stroke="${ORO}" stroke-width="1.6"/>
    <path d="M${cx + 30 + r() * 20} ${h - B / 2} q 20 8 ${40 + r() * 10} 0" fill="none" stroke="${ORO}" stroke-width="1.6"/>
    <g transform="translate(${cx} ${t / 2 + 6})"><circle r="7" fill="#7a1f12" stroke="${ORO}" stroke-width="2"/><circle r="2.4" fill="${ORO}"/></g>`;
  // Fregi agli angoli: quattro diversi, scala e rotazione variate.
  const nomi = Object.keys(FREGI);
  for (let i = nomi.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nomi[i], nomi[j]] = [nomi[j], nomi[i]]; }
  const angoli = [[0, t, 1, 1], [w, t, -1, 1], [w, h, -1, -1], [0, h, 1, -1]];
  const fregi = angoli.map(([x, y, sx, sy], i) => {
    const s = (1.0 + r() * 0.4) * (i >= 2 ? 0.8 : 1);      // in basso più piccoli: lì ci sono i pulsanti
    return `<g transform="translate(${x} ${y}) scale(${sx * s} ${sy * s})" filter="url(#${k}ombraFregio)">${FREGI[nomi[i]](r)}</g>`;
  }).join('');
  const strappata = strappo(ix + 2, iy + 2, ix + iw - 2, iy + ih - 2, r);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <defs>
      <linearGradient id="${k}oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e29c"/><stop offset=".35" stop-color="#d4a74a"/><stop offset=".6" stop-color="#9b7230"/><stop offset="1" stop-color="#f0d48a"/></linearGradient>
      <linearGradient id="${k}legnoBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e381a"/><stop offset=".5" stop-color="#40240f"/><stop offset="1" stop-color="#2c180a"/></linearGradient>
      <filter id="${k}venaO" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.22" numOctaves="3" seed="${seme % 97}"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .06  0 0 0 0 .02  0 0 0 1.8 -.55"/></filter>
      <filter id="${k}venaV" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.22 0.004" numOctaves="3" seed="${(seme >> 3) % 97}"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .06  0 0 0 0 .02  0 0 0 1.8 -.55"/></filter>
      <filter id="${k}macchie" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="${seme % 53}"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .30  0 0 0 0 .12  0 0 0 1.9 -.70"/></filter>
      <filter id="${k}grana" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .35 0"/></filter>
      <filter id="${k}bruciato" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="${k}ombraFregio" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-color="#000" flood-opacity=".7"/></filter>
      <radialGradient id="${k}perg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#e9d6a8"/><stop offset=".55" stop-color="#dcc08a"/><stop offset="1" stop-color="#b48d52"/></radialGradient>
      <clipPath id="${k}clipLegno"><path d="${esterno}"/></clipPath>
      <clipPath id="${k}clipPerg"><path d="${strappata}"/></clipPath>
    </defs>
    <path d="${esterno}" fill="url(#${k}legnoBase)"/>
    <g clip-path="url(#${k}clipLegno)">
      <rect x="0" y="0" width="${w}" height="${iy}" filter="url(#${k}venaO)"/>
      <rect x="0" y="${iy + ih}" width="${w}" height="${h - iy - ih}" filter="url(#${k}venaO)"/>
      <rect x="0" y="${iy}" width="${B}" height="${ih}" filter="url(#${k}venaV)"/>
      <rect x="${w - B}" y="${iy}" width="${B}" height="${ih}" filter="url(#${k}venaV)"/>
      <path d="M0 ${iy} L${B} ${iy} M${w} ${iy} L${w - B} ${iy} M0 ${iy + ih} L${B} ${iy + ih} M${w} ${iy + ih} L${w - B} ${iy + ih}" stroke="rgba(0,0,0,.5)" stroke-width="1"/>
    </g>
    <path d="${esterno}" fill="none" stroke="#1a0c04" stroke-width="2"/>
    <path d="${filetto}" fill="none" stroke="${ORO}" stroke-width="1.6"/>
    <rect x="${ix - 3}" y="${iy - 3}" width="${iw + 6}" height="${ih + 6}" fill="#1c0e05"/>
    <rect x="${ix - 3}" y="${iy - 3}" width="${iw + 6}" height="${ih + 6}" fill="none" stroke="${ORO}" stroke-width="1.2" opacity=".8"/>
    <path d="${strappata}" fill="url(#${k}perg)"/>
    <g clip-path="url(#${k}clipPerg)">
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" filter="url(#${k}macchie)"/>
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" filter="url(#${k}grana)"/>
      <path d="${strappata}" fill="none" stroke="#5a3410" stroke-width="20" stroke-opacity=".7" filter="url(#${k}bruciato)"/>
    </g>
    <path d="${strappata}" fill="none" stroke="#5a3512" stroke-width=".8" stroke-opacity=".7"/>
    ${intarsi}${fregi}
  </svg>`;
  return { svg, interno: { x: ix, y: iy, w: iw, h: ih } };
}

let _n = 0;
function foglio(w, h, seme, { tipo = 'lettera', usura = 0.3, sigillo = '#8a1a12', iniziale = 'C' } = {}) {
  const r = rng(seme), k = 'fg' + (++_n) + '-';
  const u = Math.max(0, Math.min(1, usura));
  const carta = tipo === 'voce' ? ['#e6dcc0', '#d6c8a2', '#b8a478'] : ['#e8d4a4', '#d6b880', '#a8824a'];
  const m = tipo === 'voce' ? 6 : 6;
  const bordo = strappo(m, m, w - m, h - m, r, tipo === 'voce' ? 1.7 : 0.9 + u);
  // pieghe: la lettera è stata piegata in tre, il ritaglio in due a caso
  const pieghe = tipo === 'lettera' ? [h / 3, 2 * h / 3] : tipo === 'voce' ? [h * (0.4 + r() * 0.2)] : [];
  const linee = pieghe.map((y) => `
    <rect x="0" y="${y - 7}" width="${w}" height="7" fill="url(#${k}pO)"/>
    <rect x="0" y="${y}" width="${w}" height="6" fill="url(#${k}pL)"/>`).join('');
  const chiodi = tipo === 'bando' ? [[22, 22], [w - 24, 20], [w / 2, h - 18]].map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="5" fill="#2a1a10"/><circle cx="${x - 1.4}" cy="${y - 1.4}" r="1.6" fill="#8a7a6a"/>
     <path d="M${x} ${y + 5} q 2 8 -1 14" stroke="rgba(60,30,10,.35)" stroke-width="3" fill="none"/>`).join('') : '';
  const cera = tipo === 'voce' ? '' : (() => {
    const cx = tipo === 'bando' ? w - 70 : w / 2, cy = tipo === 'bando' ? h - 62 : h - 44;
    let blob = '';
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = 26 + r() * 6; blob += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; }
    return `<path d="${blob}Z" fill="${sigillo}" stroke="rgba(0,0,0,.35)" filter="url(#${k}cera)"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="rgba(255,200,180,.25)" stroke-width="1" transform="translate(-.8 -.8)"/>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="UnifrakturMaguntia" font-size="24" fill="rgba(0,0,0,.45)">${iniziale}</text>
      <text x="${cx - .8}" y="${cy + 7.2}" text-anchor="middle" font-family="UnifrakturMaguntia" font-size="24" fill="rgba(255,190,170,.35)">${iniziale}</text>
      ${tipo === 'lettera' ? `<path d="M${cx - 10} ${cy + 24} l-8 26 l10 -6 l4 8 z M${cx + 6} ${cy + 24} l6 24 l-9 -5 l-5 7 z" fill="${sigillo}" opacity=".9"/>` : ''}`;
  })();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <defs>
      <radialGradient id="${k}c" cx=".45" cy=".4" r=".8"><stop offset="0" stop-color="${carta[0]}"/><stop offset=".6" stop-color="${carta[1]}"/><stop offset="1" stop-color="${carta[2]}"/></radialGradient>
      <linearGradient id="${k}pO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(80,50,20,0)"/><stop offset="1" stop-color="rgba(80,50,20,${0.18 + u * 0.15})"/></linearGradient>
      <linearGradient id="${k}pL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,245,220,${0.35})"/><stop offset="1" stop-color="rgba(255,245,220,0)"/></linearGradient>
      <filter id="${k}m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${0.012 + r() * 0.006}" numOctaves="3" seed="${seme % 89}"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .28  0 0 0 0 .10  0 0 0 ${1.4 + u * 1.2} ${-0.72 + u * 0.12}"/></filter>
      <filter id="${k}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .4 0"/></filter>
      <filter id="${k}b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${5 + u * 4}"/></filter>
      <filter id="${k}cera" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-opacity=".5"/></filter>
      <filter id="${k}o" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-opacity=".55"/></filter>
      <clipPath id="${k}clip"><path d="${bordo}"/></clipPath>
    </defs>
    <path d="${bordo}" fill="url(#${k}c)" filter="url(#${k}o)"/>
    <g clip-path="url(#${k}clip)">
      <rect width="${w}" height="${h}" filter="url(#${k}m)"/>
      <rect width="${w}" height="${h}" filter="url(#${k}g)"/>
      ${linee}
      <path d="${bordo}" fill="none" stroke="#4a2a0c" stroke-width="${14 + u * 14}" stroke-opacity="${0.45 + u * 0.3}" filter="url(#${k}b)"/>
    </g>
    <path d="${bordo}" fill="none" stroke="#4a2a0c" stroke-width=".7" stroke-opacity=".6"/>
    ${chiodi}${cera}
  </svg>`;
  return svg;
}

/** Lettera chiusa (icona d'arrivo): rettangolo piegato con il sigillo al centro. */
function letteraChiusa(sigillo = '#8a1a12', iniziale = 'C') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="44" viewBox="0 0 64 44">
    <rect x="2" y="4" width="60" height="36" rx="2" fill="#d6b880" stroke="#6b4415" stroke-width="1"/>
    <path d="M2 6 L32 26 L62 6" fill="none" stroke="#9a7440" stroke-width="1.4"/>
    <circle cx="32" cy="25" r="8.5" fill="${sigillo}" stroke="rgba(0,0,0,.4)"/>
    <text x="32" y="29.5" text-anchor="middle" font-family="UnifrakturMaguntia" font-size="12" fill="rgba(0,0,0,.5)">${iniziale}</text>
  </svg>`;
}

/** Mette dietro a `el` (position: relative) uno sfondo SVG rifatto alla misura di `el` quando cambia. */
function sfondoSvg(el, disegna) {
  const f = document.createElement('div');
  f.className = 'fondo';
  el.prepend(f);
  let w0 = 0, h0 = 0;
  const rifai = () => {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (!w || !h || (w === w0 && h === h0)) return;
    w0 = w; h0 = h;
    f.innerHTML = disegna(w, h);
  };
  rifai();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rifai) : null;
  ro?.observe(el);
  return () => ro?.disconnect();
}

/**
 * Carta del cronista (G1, passo 2): pergamena in una cornice intagliata, al centro dello schermo sopra la scena ferma.
 * Mostra un titolo, un testo (con iniziale miniata), righe di cronaca (esito) e una lista di pulsanti tematici; un
 * pulsante non disponibile resta visibile, sbiadito, con il requisito. Tasti: 1–9 scelgono, Esc chiude.
 * @param {{ onApri?: () => void, onChiudi?: () => void }} [opzioni]
 */
export function creaCartaCronista(opzioni = {}) {
  let el = null, contenuto = null, scelte = [], stacca = null, semeCornice = 0;
  function chiudi() {
    if (!el) return;
    stacca?.();
    el.remove();
    el = null;
    scelte = [];
    opzioni.onChiudi?.();
  }
  /**
   * @param {{ titolo: string, testo?: string, righe?: string[], nota?: string,
   *   tabelle?: { titolo: string, vuota?: string, righe: { nome: string, info?: string, prezzo?: string,
   *     azione?: string, disponibile?: boolean, etichetta?: string, scegli?: () => void }[] }[],
   *   opzioni: { testo: string, etichetta?: string, disponibile?: boolean, scegli: () => void }[] }} c
   *   tabelle: elenchi con un pulsante per riga (mercato, zaino), dopo la nota e prima delle scelte.
   */
  function mostra(c) {
    const nuova = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = 'carta-cronista';
      contenuto = document.createElement('div');
      contenuto.className = 'contenuto';
      el.appendChild(contenuto);
      document.body.appendChild(el);
      semeCornice = semeDaTesto(c.titolo);
      stacca = sfondoSvg(el, (w, h) => cornice(w, h, semeCornice).svg);
    }
    scelte = c.opzioni.filter((o) => o.disponibile !== false);
    el.classList.toggle('larga', !!c.tabelle?.length);
    let n = 0;
    contenuto.innerHTML = `<div class="titolo">${_esc(c.titolo)}</div><div class="fregio"></div>`
      + (c.testo ? `<div class="testo${/^[A-Za-zÀ-ÿ]/.test(c.testo) ? ' miniata' : ''}">${_esc(c.testo)}</div>` : '')
      + (c.righe?.length ? `<div class="righe">${c.righe.map((r) => `<div>${_esc(r)}</div>`).join('')}</div>` : '')
      + (c.nota ? `<div class="nota">${_esc(c.nota)}</div>` : '')
      + (c.tabelle ?? []).map((t, ti) => `<div class="tabella"><div class="tt">${_esc(t.titolo)}</div>`
        + (t.righe.length ? t.righe.map((r, ri) => {
          const ok = r.disponibile !== false;
          return `<div class="voce${ok ? '' : ' spenta'}"><span class="nome">${_esc(r.nome)}`
            + `${r.info ? `<i>${_esc(r.info)}</i>` : ''}</span><span class="prezzo">${_esc(r.prezzo ?? '')}</span>`
            + (r.azione ? `<button type="button" data-t="${ti}" data-r="${ri}"${ok ? '' : ' disabled'}`
              + `${!ok && r.etichetta ? ` title="${_esc(r.etichetta)}"` : ''}>${_esc(r.azione)}</button>` : '<span></span>')
            + '</div>';
        }).join('') : `<div class="vuota">${_esc(t.vuota ?? '—')}</div>`) + '</div>').join('')
      + `<div class="scelte">${c.opzioni.map((o, i) => {
        const ok = o.disponibile !== false;
        return `<button type="button" data-i="${i}"${ok ? '' : ' disabled'}><span class="n">${ok ? ++n : '·'}</span>`
          + `<span>${_esc(o.testo)}${o.etichetta && !ok ? ` <span class="req">${_esc(o.etichetta)}</span>` : ''}</span></button>`;
      }).join('')}</div>`;
    contenuto.querySelectorAll('.scelte button').forEach((b) => b.addEventListener('click', () => c.opzioni[+b.dataset.i].scegli()));
    contenuto.querySelectorAll('.tabella button').forEach((b) => b.addEventListener('click',
      () => c.tabelle[+b.dataset.t].righe[+b.dataset.r].scegli?.()));
    if (nuova) opzioni.onApri?.();
  }
  /** Tasti mentre la carta è aperta: true se il tasto è stato usato. */
  function tasto(e) {
    if (!el) return false;
    if (avanzaRacconto) {                          // racconto in corso: Spazio, Invio o Esc lo completano / lo chiudono
      if (['Space', 'Enter', 'NumpadEnter', 'Escape'].includes(e.code)) { e.preventDefault?.(); avanzaRacconto(); }
      return true;
    }
    if (e.code === 'Escape') { chiudi(); return true; }
    const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) { scelte[+m[2] - 1]?.scegli(); return true; }
    return false;
  }

  // ─── Racconto (richiesta dell'utente, novembre 2026): tra una scelta che fa passare ore o cambia qualcosa e il suo
  // esito, la pergamena racconta. Le frasi si scrivono parola per parola (scrittura a mano), poi le ore avanzano
  // («Prima → Terza», con `alTempo(f)` che muove la meridiana), poi il registro dei cambiamenti riga per riga; resta
  // fermo per leggere e si risolve da solo. Un clic (o Spazio, Invio) completa l'animazione; il secondo va avanti.
  // Gli effetti sono già applicati: è solo il modo di mostrarli.
  let avanzaRacconto = null;
  /**
   * @param {{ titolo: string, frasi: string[], ore?: { da: string, a: string }, registro: { testo: string, segno?: 'piu'|'meno' }[],
   *   durata?: number, alTempo?: (f: number) => void }} r   durata: ms dell'animazione (poi ~40 % in più di sosta)
   * @returns {Promise<void>}
   */
  function racconta(r) {
    return new Promise((risolvi) => {
      const nuova = !el;
      if (!el) {
        el = document.createElement('div');
        el.className = 'carta-cronista';
        contenuto = document.createElement('div');
        contenuto.className = 'contenuto';
        el.appendChild(contenuto);
        document.body.appendChild(el);
        semeCornice = semeDaTesto(r.titolo);
        stacca = sfondoSvg(el, (w, h) => cornice(w, h, semeCornice).svg);
      }
      el.classList.remove('larga');
      scelte = [];
      const parole = r.frasi.join(' ').split(/\s+/).filter(Boolean);
      contenuto.innerHTML = `<div class="titolo">${_esc(r.titolo)}</div><div class="fregio"></div>`
        + `<div class="racconto">${parole.map((p) => `<span>${_esc(p)}</span>`).join(' ')}</div>`
        + (r.ore ? `<div class="ore-racconto"><span>${_esc(r.ore.da)}</span><i><b></b></i><span>${_esc(r.ore.a)}</span></div>` : '')
        + `<div class="registro">${r.registro.map((v) => `<div class="${v.segno ?? ''}">${_esc(v.testo)}</div>`).join('')}</div>`
        + '<div class="avanti">clic, Spazio o Invio per continuare</div>';
      if (nuova) opzioni.onApri?.();
      const durata = Math.max(600, r.durata ?? 8000);
      // Tempi: parole nel primo 45 %, ore dal 35 al 70 %, registro dal 60 al 100 %; poi sosta.
      const sp = [...contenuto.querySelectorAll('.racconto span')], righe = [...contenuto.querySelectorAll('.registro div')];
      const barra = contenuto.querySelector('.ore-racconto b');
      const t0 = performance.now(), sosta = durata * 0.4;
      let finito = false, raf = 0, timer = 0;
      const passo = (f) => {
        sp.forEach((s, i) => s.classList.toggle('scritta', f >= (i / Math.max(1, sp.length)) * 0.45));
        const ft = Math.min(1, Math.max(0, (f - 0.35) / 0.35));
        if (barra) barra.style.width = `${ft * 100}%`;
        r.alTempo?.(ft);
        righe.forEach((d, i) => d.classList.toggle('vista', f >= 0.6 + (i / Math.max(1, righe.length)) * 0.4));
      };
      const chiudiRacconto = () => {
        cancelAnimationFrame(raf); clearTimeout(timer);
        avanzaRacconto = null;
        el?.removeEventListener('click', clic);
        risolvi();
      };
      const completa = () => {
        finito = true; cancelAnimationFrame(raf); passo(1);
        contenuto.querySelector('.avanti')?.classList.add('vista');
        clearTimeout(timer); timer = setTimeout(chiudiRacconto, sosta);
      };
      const ciclo = () => {
        const f = Math.min(1, (performance.now() - t0) / durata);
        passo(f);
        if (f >= 1) completa(); else raf = requestAnimationFrame(ciclo);
      };
      avanzaRacconto = () => (finito ? chiudiRacconto() : completa());
      const clic = () => avanzaRacconto?.();
      el.addEventListener('click', clic);
      raf = requestAnimationFrame(ciclo);
    });
  }
  return { mostra, chiudi, tasto, racconta, get aperta() { return !!el; }, get inRacconto() { return !!avanzaRacconto; } };
}

// ─── Meridiana (richiesta dell'utente, novembre 2026): in alto a sinistra, il momento del giorno ──────────────────
// Una tavoletta di pietra, sul modello delle meridiane canoniche medievali incise sulle chiese: il bordo è scheggiato e
// la superficie granulosa (l'irregolarità sta nella pietra), ma il disegno è dritto e leggibile [rivisto con l'utente:
// la versione sbilenca sembrava un graffito rupestre]: base orizzontale, semicerchio regolare, raggi incisi, numeri
// romani sulle ore canoniche (I Prima, III Terza, VI Sesta, IX Nona, XII Vespri), un piolo la cui ombra indica l'ora.
// Sotto, in orizzontale, l'ora canonica e l'orario «circa». Scatta a passi fissi (mezz'ora di gioco), non scorre di
// continuo. Di notte la pietra è al buio e mostra una luna. Scheggiature fisse (seme costante).
// [ora, raggio del sole, colore]: dall'alba pallida al mezzogiorno pieno, al tramonto rossiccio.
const SOLI_MERIDIANA = [[6, 3.2, '#d9a066'], [9, 4.6, '#e8b440'], [12, 6.2, '#f6cf3a'], [15, 4.6, '#e8b440'], [18, 3.2, '#d98a4a']];
export function creaMeridiana(contenitore) {
  const el = document.createElement('div');
  el.className = 'meridiana';
  el.hidden = true;
  const r = rng(77017);
  const j = (a) => (r() - 0.5) * 2 * a;
  const W = 220, H = 128, cx = W / 2, cy = 104, R = 62;
  const ang = (h) => Math.PI * (1 - (h - 6) / 15);           // 6 → sinistra, 21 → destra
  const pt = (h, rr) => [cx + Math.cos(ang(h)) * rr, cy - Math.sin(ang(h)) * rr];
  const f = (v) => v.toFixed(1);
  // Lastra: rettangolo con il bordo scheggiato (punti ogni ~12 px con piccoli scarti, qualche scheggia più profonda).
  const m = 4, pts = [];
  const lato = (x0, y0, x1, y1, nx, ny) => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 12);
    for (let k = 0; k < n; k++) {
      const t = k / n, d = r() * 2.2 + (r() < 0.12 ? 3 + r() * 3 : 0);
      pts.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
    }
  };
  lato(m, m, W - m, m, 0, 1); lato(W - m, m, W - m, H - m, -1, 0); lato(W - m, H - m, m, H - m, 0, -1); lato(m, H - m, m, m, 1, 0);
  const bordo = 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';
  // Quadrante: semicerchio e base dritti; raggi a ogni ora e mezza, i canonici più lunghi e più marcati.
  const [ax0, ay0] = pt(6, R), [ax1, ay1] = pt(21, R);
  const arco = `M${f(ax0)} ${f(ay0)} A${R} ${R} 0 0 1 ${f(ax1)} ${f(ay1)}`;
  const base = `M${f(cx - R - 6)} ${cy} H${f(cx + R + 6)}`;
  let raggi = '';
  for (let h = 6; h <= 21; h += 1.5) {
    const canonica = (h - 6) % 3 === 0, [x0, y0] = pt(h, 12), [x1, y1] = pt(h, canonica ? R : R - 14);
    raggi += `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" class="${canonica ? 'forte' : ''}"/>`;
  }
  // Al posto dei numeri, soli stilizzati (richiesta dell'utente): piccoli e pallidi all'alba e al tramonto, grandi e
  // luminosi a mezzogiorno. Un disco con otto raggi, come intarsiato nella pietra.
  const soli = SOLI_MERIDIANA.map(([h, rs, col]) => {
    const [x, y] = pt(h, R + 16);                           // fuori dal semicerchio, come attorno a un quadrante
    let raggiSole = '';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
      raggiSole += `M${f(x + c * rs * 1.35)} ${f(y + s2 * rs * 1.35)} L${f(x + c * rs * 1.95)} ${f(y + s2 * rs * 1.95)} `;
    }
    return `<g class="sole"><path d="${raggiSole}" stroke="${col}" stroke-width="${f(Math.max(1.2, rs * 0.32))}"/>`
      + `<circle cx="${f(x)}" cy="${f(y)}" r="${rs}" fill="${col}"/></g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H + 26}" aria-hidden="true">
      <defs>
        <linearGradient id="mer-pietra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8b0a0"/><stop offset="1" stop-color="#8e8676"/></linearGradient>
        <filter id="mer-grana" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .25  0 0 0 0 .23  0 0 0 0 .2  0 0 0 .9 -.25"/></filter>
        <filter id="mer-macchie" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .32  0 0 0 0 .22  0 0 0 1.4 -.6"/></filter>
        <filter id="mer-sfuma" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
        <clipPath id="mer-taglio"><path d="${bordo}"/></clipPath>
      </defs>
      <path class="pietra" d="${bordo}"/>
      <g clip-path="url(#mer-taglio)"><rect width="${W}" height="${H}" filter="url(#mer-macchie)"/><rect width="${W}" height="${H}" filter="url(#mer-grana)"/></g>
      <path class="orlo" d="${bordo}"/>
      <g class="incisioni"><path d="${arco}"/><path d="${base}"/>${raggi}</g>
      <g class="soli">${soli}</g>
      <path class="ombra" d="M${cx} ${cy}" filter="url(#mer-sfuma)"/>
      <circle class="piolo" cx="${cx}" cy="${cy}" r="4"/>
      <path class="luna" d="M${cx + 2} ${cy - 52} a15 15 0 1 0 12 22 a12 12 0 1 1 -12 -22z"/>
      <text class="testo" x="${cx}" y="${H + 19}"></text>
    </svg>`;
  contenitore.appendChild(el);
  const ombra = el.querySelector('.ombra'), testo = el.querySelector('.testo');
  let ultima = null;
  /** ora: 0–24 (con i decimali); passo: ore di gioco per scatto (0,5 = mezz'ora). */
  function aggiorna(ora, passo = 0.5) {
    const o = Math.floor(ora / passo) * passo;
    if (o === ultima) return;
    ultima = o;
    const notte = o < 6 || o >= 21;
    el.classList.toggle('notte', notte);
    if (!notte) {
      // L'ombra del piolo indica l'ora: un cuneo sottile che si allarga un poco verso la punta.
      const [x, y] = pt(o, R - 4), a = ang(o), w = 3.5, nx = -Math.sin(a) * w, ny = -Math.cos(a) * w;
      ombra.setAttribute('d', `M${cx} ${cy} L${f(x + nx)} ${f(y + ny)} L${f(x - nx)} ${f(y - ny)} Z`);
    }
    const h = Math.floor(o), mezza = o - h >= 0.5;
    const quando = h === 0 ? 'mezzanotte' : h === 12 ? 'mezzogiorno' : h === 1 || h === 13 ? "l'una" : `le ${h}`;
    testo.textContent = `${ORE_CANONICHE_DI(o)} · ${h === 0 || h === 12 ? '' : 'circa '}${quando}${mezza ? ' e mezza' : ''}`;
  }
  return { aggiorna, nascondi(si) { el.hidden = si; } };
}
// Ora canonica di un'ora del giorno: ogni canonica dura 3 ore da Prima (6:00).
const NOMI_CANONICHE = ['Prima', 'Terza', 'Sesta', 'Nona', 'Vespri', 'Compieta', 'Mattutino', 'Lodi'];
function ORE_CANONICHE_DI(o) { return NOMI_CANONICHE[Math.floor((((o - 6) % 24) + 24) % 24 / 3)]; }

// ─── Fogli delle notizie e scrittoio (J) ─────────────────────────────────────────────────────────────────────────
// Documento: { tipo:'voce'|'lettera'|'bando', testo, fonte?, quando?, a?, firma?, titolo?, sottotitolo?, usura? (0–1),
// sigillo? (colore), iniziale? }. La forma dice quanto fidarsi: voce = ritaglio senza sigillo (incerta), lettera =
// sigillata da chi scrive (certa), bando = pubblico e ufficiale.

/** Elemento HTML di un foglio, con il suo sfondo SVG; ritorna { el, stacca }. */
function elementoFoglio(d, seme) {
  const el = document.createElement('div');
  el.className = `foglio ${d.tipo}`;
  const s = document.createElement('div');
  s.className = 'scritto';
  if (d.tipo === 'bando') {
    s.innerHTML = `<div class="t">${_esc(d.titolo || 'Bando')}</div>${d.sottotitolo ? `<div class="st">${_esc(d.sottotitolo)}</div>` : ''}`
      + `<div class="corpo">${_esc(d.testo)}</div>${d.quando ? `<div class="quando">${_esc(d.quando)}</div>` : ''}`;
  } else if (d.tipo === 'lettera') {
    s.innerHTML = `${d.a ? `<div class="a">${_esc(d.a)}</div>` : ''}<div>${_esc(d.testo)}</div>`
      + `${d.firma ? `<div class="firma">${_esc(d.firma)}</div>` : ''}${d.quando ? `<div class="quando">${_esc(d.quando)}</div>` : ''}`;
  } else {
    s.innerHTML = `<div>${_esc(d.testo)}</div>${d.fonte ? `<div class="fonte">— ${_esc(d.fonte)}</div>` : ''}`;
  }
  el.appendChild(s);
  return { el, seme, s };
}

/**
 * Scrittoio (J): i fogli ricevuti, dal più recente; un clic su una riga apre il foglio. Mentre è aperto il gioco è
 * fermo. `elenco()` ritorna i documenti (con `id`).
 * @param {{ elenco: () => object[], onApri?: () => void, onChiudi?: () => void }} opzioni
 */
export function creaScrittoio(opzioni) {
  let el = null, stacchi = [];
  function chiudi() {
    if (!el) return;
    stacchi.forEach((f) => f());
    stacchi = [];
    el.remove();
    el = null;
    opzioni.onChiudi?.();
  }
  function apriFoglio(d, contenitore) {
    stacchi.forEach((f) => f());
    stacchi = [];
    contenitore.innerHTML = '';
    const { el: f } = elementoFoglio(d);
    contenitore.appendChild(f);
    stacchi.push(sfondoSvg(f, (w, h) => foglio(w, h, semeDaTesto(d.id + d.testo), {
      tipo: d.tipo, usura: d.usura ?? 0.3, sigillo: d.sigillo, iniziale: d.iniziale })));
  }
  function apri(scelto = null) {
    const nuovo = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = 'scrittoio';
      document.body.appendChild(el);
    }
    const docs = opzioni.elenco();
    const nomi = { voce: 'Voce', lettera: 'Lettera', bando: 'Bando' };
    el.innerHTML = `<div class="tavolo"><div class="intestazione">Scrittoio<span>J o Esc per chiudere</span></div>`
      + (docs.length
        ? `<div class="elenco">${docs.map((d, i) => `<button type="button" data-i="${i}" class="${d.tipo}">`
          + `<b>${nomi[d.tipo] ?? 'Foglio'}</b><span>${_esc(d.testo.length > 70 ? d.testo.slice(0, 68) + '…' : d.testo)}</span></button>`).join('')}</div>`
          + '<div class="lettura"></div>'
        : '<div class="vuoto">Nessun foglio, per ora. Le voci raccolte in taverna, le lettere e i bandi finiscono qui.</div>')
      + '</div>';
    const lettura = el.querySelector('.lettura');
    el.querySelectorAll('.elenco button').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.elenco button').forEach((x) => x.classList.toggle('su', x === b));
      apriFoglio(docs[+b.dataset.i], lettura);
    }));
    const i = Math.max(0, scelto ? docs.findIndex((d) => d.id === scelto) : 0);
    el.querySelectorAll('.elenco button')[i]?.click();
    if (nuovo) opzioni.onApri?.();
  }
  function tasto(e) {
    if (!el) return false;
    if (e.code === 'Escape' || e.code === 'KeyJ') { chiudi(); return true; }
    return false;
  }
  return { apri, chiudi, tasto, get aperto() { return !!el; } };
}

/** Avviso d'arrivo di un foglio, in alto al centro, che sparisce da solo; non ferma il gioco. */
export function avvisoFoglio(d, testo, sotto = 'J: scrittoio') {
  document.querySelector('.avviso-foglio')?.remove();
  const el = document.createElement('div');
  el.className = 'avviso-foglio';
  const icona = d.tipo === 'voce'
    ? '<svg width="48" height="36" viewBox="0 0 48 36"><path d="M4 6 L40 3 L44 14 L41 30 L8 33 L3 20 Z" fill="#d6c8a2" stroke="#6b4415"/><path d="M10 12h26M10 18h22M10 24h18" stroke="#6b4415" stroke-width="1.4"/></svg>'
    : letteraChiusa(d.sigillo || '#8a1a12', d.iniziale || '');
  el.innerHTML = `${icona}<div><b>${_esc(testo)}</b><span>${_esc(sotto)}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('via'), 5000);
  setTimeout(() => el.remove(), 6200);
}
