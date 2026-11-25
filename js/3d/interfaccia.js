// Knight Dawn — interfaccia di gioco in HTML sopra la scena (G1, docs/EARLY_GAME.md §7).
// Passo 1: menu d'avvio, mostrato PRIMA della generazione del mondo. Poi qui: Carta del cronista vera (passo 2) e
// riquadro di combattimento (passo 4). Nessuna dipendenza da Three.js: solo DOM.

const MODALITA = {
  storia: { nome: 'Storia', riga: 'Dalla Veglia: garzone di stalla fuori dalla porta del borgo, a piedi, pochi spiccioli.' },
  libera: { nome: 'Libera', riga: 'Senza storia: cavaliere già armato, a cavallo, con gli strumenti di sviluppo (Carta con il clic, T).' },
};

// Nomi del garzone (registro italiano-medievale, docs/GDD.md §2 «Culture e nomi»): «casuale» nel menu d'avvio.
const NOMI_GARZONE = [
  'Aldo', 'Guido', 'Rinaldo', 'Bertoldo', 'Ugolino', 'Tebaldo', 'Gualtiero', 'Ansaldo', 'Corrado', 'Ottone',
  'Lapo', 'Nello', 'Vanni', 'Cecco', 'Bindo', 'Ghino', 'Dino', 'Puccio', 'Arrigo', 'Folco', 'Manfredo', 'Oddo',
];
const nomeCasuale = () => NOMI_GARZONE[(Math.random() * NOMI_GARZONE.length) | 0];

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
          <label>Nome del garzone <input type="text" class="nome-garzone" maxlength="24" spellcheck="false"></label>
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
      <div class="nota">Le due modalità hanno salvataggi separati: provare in Libera non tocca la Storia. F8 in gioco salva e
        riporta qui, dove la partita si può scaricare in un file.</div>
    </div>`;
    document.body.appendChild(el);

    const inSeme = el.querySelector('.seme');
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

/**
 * Carta del cronista (G1, passo 2): riquadro in stile manoscritto al centro dello schermo, sopra la scena ferma.
 * Mostra un titolo, un testo, righe di cronaca (esito) e una lista di pulsanti tematici; un pulsante non disponibile
 * resta visibile, spento, con l'etichetta del requisito («Richiede…»). Tasti: 1–9 scelgono, Esc chiude.
 * @param {{ onApri?: () => void, onChiudi?: () => void }} [opzioni]
 */
export function creaCartaCronista(opzioni = {}) {
  let el = null, scelte = [];
  function chiudi() {
    if (!el) return;
    el.remove();
    el = null;
    scelte = [];
    opzioni.onChiudi?.();
  }
  /**
   * @param {{ titolo: string, testo?: string, righe?: string[], nota?: string,
   *   opzioni: { testo: string, etichetta?: string, disponibile?: boolean, scegli: () => void }[] }} c
   */
  function mostra(c) {
    const nuova = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = 'carta-cronista';
      document.body.appendChild(el);
    }
    scelte = c.opzioni.filter((o) => o.disponibile !== false);
    let n = 0;
    el.innerHTML = `<div class="titolo">${_esc(c.titolo)}</div><div class="fregio">✦ ✦ ✦</div>`
      + (c.testo ? `<div class="testo">${_esc(c.testo)}</div>` : '')
      + (c.righe?.length ? `<div class="righe">${c.righe.map((r) => `<div>${_esc(r)}</div>`).join('')}</div>` : '')
      + (c.nota ? `<div class="nota">${_esc(c.nota)}</div>` : '')
      + `<div class="scelte">${c.opzioni.map((o, i) => {
        const ok = o.disponibile !== false;
        return `<button type="button" data-i="${i}"${ok ? '' : ' disabled'}>${ok ? `<span class="n">${++n}</span>` : ''}`
          + `${_esc(o.testo)}${o.etichetta && !ok ? ` <span class="req">${_esc(o.etichetta)}</span>` : ''}</button>`;
      }).join('')}</div>`;
    el.querySelectorAll('.scelte button').forEach((b) => b.addEventListener('click', () => c.opzioni[+b.dataset.i].scegli()));
    if (nuova) opzioni.onApri?.();
  }
  /** Tasti mentre la carta è aperta: true se il tasto è stato usato. */
  function tasto(e) {
    if (!el) return false;
    if (e.code === 'Escape') { chiudi(); return true; }
    const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) { scelte[+m[2] - 1]?.scegli(); return true; }
    return false;
  }
  return { mostra, chiudi, tasto, get aperta() { return !!el; } };
}
