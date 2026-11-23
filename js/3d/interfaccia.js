// Knight Dawn — interfaccia di gioco in HTML sopra la scena (G1, docs/EARLY_GAME.md §7).
// Passo 1: menu d'avvio, mostrato PRIMA della generazione del mondo. Poi qui: Carta del cronista vera (passo 2) e
// riquadro di combattimento (passo 4). Nessuna dipendenza da Three.js: solo DOM.

const MODALITA = {
  storia: { nome: 'Storia', riga: 'Dalla Veglia: garzone di stalla fuori dalla porta del borgo, a piedi, pochi spiccioli.' },
  libera: { nome: 'Libera', riga: 'Senza storia: cavaliere già armato, a cavallo, con gli strumenti di sviluppo (Carta con il clic, T).' },
};

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
 *   seme?: string|null,                                       // precompila il campo (es. da ?seme=)
 * }} opzioni
 * @returns {Promise<{ modalita: 'storia'|'libera', nuova: boolean, seme: string, luogo: 'partenza'|'tavullia' }>}
 *   seme: testo scritto ('' = casuale); luogo vale solo per una partita Libera nuova.
 */
export function mostraMenuAvvio(opzioni) {
  const { partite, seme = '' } = opzioni;
  return new Promise((risolvi) => {
    const el = document.createElement('div');
    el.id = 'menu-avvio';
    const continua = ['storia', 'libera'].filter((m) => partite[m]).map((m) => {
      const p = partite[m];
      const dove = p.terreno === 'tavullia' ? 'Tavullia' : (Number.isFinite(p.seme) ? `seme ${p.seme}` : '');
      const det = [p.label, dove, _quando(p.updated_at) && `salvata il ${_quando(p.updated_at)}`].filter(Boolean).join(' · ');
      return `<button type="button" class="continua" data-modalita="${m}"><b>Continua — ${MODALITA[m].nome}</b>`
        + `<span>${_esc(det)}</span></button>`;
    }).join('');
    el.innerHTML = `<div class="riquadro">
      <div class="titolo">Knight Dawn</div>
      ${continua ? `<div class="sezione">${continua}</div>` : ''}
      <div class="sezione nuova">
        <div class="etichetta">Nuova partita</div>
        <div class="modi">
          ${Object.entries(MODALITA).map(([id, m], i) => `<label class="modo"><input type="radio" name="modalita" value="${id}"${i === 0 ? ' checked' : ''}>`
            + `<b>${m.nome}</b><span>${m.riga}</span></label>`).join('')}
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
      <div class="nota">Le due modalità hanno salvataggi separati: provare in Libera non tocca la Storia. F8 in gioco riporta qui.</div>
    </div>`;
    document.body.appendChild(el);

    const inSeme = el.querySelector('.seme');
    const rigaLuogo = el.querySelector('.luogo');
    const avviso = el.querySelector('.avviso');
    const modoScelto = () => el.querySelector('input[name="modalita"]:checked').value;
    const aggiorna = () => {
      const m = modoScelto();
      rigaLuogo.hidden = m !== 'libera';
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
    el.querySelector('.casuale').addEventListener('click', () => { inSeme.value = ''; inSeme.focus(); });
    const comincia = () => {
      const m = modoScelto();
      if (partite[m] && !window.confirm(`Cominciare una nuova partita ${MODALITA[m].nome}? Quella salvata verrà cancellata.`)) return;
      fine({ modalita: m, nuova: true, seme: inSeme.value.trim(), luogo: m === 'libera' ? el.querySelector('.dove').value : 'partenza' });
    };
    el.querySelector('.comincia').addEventListener('click', comincia);
    // Invio nel campo del seme comincia (sui pulsanti fa il loro clic); nessun tasto arriva al gioco mentre il menu
    // è aperto (ascolto in cattura sul documento: i tasti di main.js stanno su window e non li ricevono).
    function suTasto(e) {
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target === inSeme) { e.preventDefault(); comincia(); }
      if (e.code !== 'Tab') e.stopPropagation();
    }
    document.addEventListener('keydown', suTasto, true);
    (el.querySelector('.continua') ?? el.querySelector('.comincia')).focus();
  });
}
