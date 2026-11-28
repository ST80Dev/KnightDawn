// Knight Dawn — Diario del cavaliere, in alto a destra (G1, proposta approvata dall'utente, novembre 2026).
// Compatto, sempre visibile: nome, rango, oro, giorno e ora canonica, Forza, Salute, Volontà e le linguette delle sezioni.
// Aperto (clic, o I per lo Zaino): un libro al centro con il gioco fermo; a sinistra lo stato e l'indice, a destra la
// sezione (Zaino ed equipaggiamento, Cavallo, Propositi, Cronaca, Luoghi conosciuti), con i nastri per cambiarla.
// Il contenuto delle sezioni lo prepara main.js (dati del gioco); qui solo il DOM. Il compatto tocca il DOM solo quando
// un valore cambia. Niente Three.js.

export const SEZIONI_DIARIO = [
  ['zaino', 'Zaino', 'Zaino ed equipaggiamento', '#7a1f12'],
  ['cavallo', 'Cavallo', 'Cavallo', '#5a4a1a'],
  ['propositi', 'Propositi', 'Propositi', '#2f4a2a'],
  ['cronaca', 'Cronaca', 'Cronaca', '#3a3a5a'],
  ['luoghi', 'Luoghi', 'Luoghi conosciuti', '#2a4a5a'],
];
const ATTRIBUTI = [['forza', 'Forza'], ['salute', 'Salute'], ['volonta', 'Volontà']];

const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = ([c, m]) => Math.max(0, Math.min(100, (c / m) * 100));

/**
 * @param {{
 *   stato: () => { nome, titolo, oro, onore, data, sottotitolo, attr: { forza: [cur, max], salute, volonta },
 *     cavallo?: { vigore: [cur, max] } | null, andatura?: string },
 *   sezione: (id: string) => { titolo?, sottotitolo?, blocchi: object[] },
 *   onApri?: () => void, onChiudi?: () => void }} opzioni
 * Blocchi di una sezione: { titolo?, testo? , vuota?, righe?: [{ nome, info?, destra?, azione?, disponibile?, scegli? }],
 *   voci?: [{ segno: 'fatto'|'mezzo'|'da fare'|'ignoto', nome, info?, destra? }], cronaca?: [{ quando, testo }] }.
 */
export function creaDiario(opzioni) {
  // ─── Compatto ───
  const el = document.createElement('div');
  el.className = 'diario';
  el.hidden = true;
  el.innerHTML = '<div class="pagina"><div class="nome"></div><div class="rango"><span class="titolo"></span><span class="oro"></span></div>'
    + '<div class="data"></div>'
    + ATTRIBUTI.map(([id, n]) => `<div class="attr ${id}"><span>${n}</span><span class="b"><i></i></span><span class="v"></span></div>`).join('')
    + '<div class="attr cavallo" hidden><span>Cavallo</span><span class="b"><i></i></span><span class="v"></span></div>'
    + '<div class="andatura-riga"></div>'
    + `<div class="linguette">${SEZIONI_DIARIO.map(([id, n]) => `<button type="button" data-s="${id}">${id === 'zaino' ? '<b>I</b>' : ''}${n}</button>`).join('')}</div>`
    + '</div><div class="nastro"></div>';
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const campi = { nome: q('.nome'), titolo: q('.rango .titolo'), oro: q('.rango .oro'), data: q('.data') };
  const attr = Object.fromEntries([...ATTRIBUTI, ['cavallo']].map(([id]) => {
    const r = q('.attr.' + id);
    return [id, { r, b: r.querySelector('i'), v: r.querySelector('.v') }];
  }));
  const rigaAndatura = q('.andatura-riga');
  el.querySelectorAll('.linguette button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); apri(b.dataset.s); }));
  el.querySelector('.pagina').addEventListener('click', () => apri(ultima));
  const cache = new Map();
  const imposta = (k, v, f) => { if (cache.get(k) !== v) { cache.set(k, v); f(v); } };

  /** Il compatto: chiamato a ogni fotogramma, tocca il DOM solo quando un valore cambia. */
  function aggiorna() {
    if (el.hidden) return;
    const s = opzioni.stato();
    imposta('nome', s.nome, (v) => { campi.nome.textContent = v; });
    imposta('titolo', s.titolo, (v) => { campi.titolo.textContent = v; });
    imposta('oro', s.oro, (v) => { campi.oro.textContent = v; });
    imposta('data', s.data, (v) => { campi.data.textContent = v; });
    for (const [id] of ATTRIBUTI) {
      const a = s.attr[id], p = pct(a), x = attr[id];
      imposta(id + '.w', p.toFixed(1), (v) => { x.b.style.width = v + '%'; });
      imposta(id + '.v', Math.ceil(a[0]), (v) => { x.v.textContent = v; });
      imposta(id + '.basso', p < 20, (v) => { x.r.classList.toggle('basso', v); });
    }
    // Cavallo (vigore: quanto galoppo resta) e andatura tenuta: a piedi o in sella
    const c = s.cavallo, x = attr.cavallo;
    imposta('cav.c', !!c, (v) => { x.r.hidden = !v; });
    if (c) {
      const p = pct(c.vigore);
      imposta('cav.w', p.toFixed(1), (v) => { x.b.style.width = v + '%'; });
      imposta('cav.v', Math.ceil(c.vigore[0]), (v) => { x.v.textContent = v; });
      imposta('cav.basso', p < 25, (v) => { x.r.classList.toggle('basso', v); });
    }
    imposta('andatura', s.andatura ?? '', (v) => { rigaAndatura.textContent = v; rigaAndatura.hidden = !v; });
  }

  // ─── Aperto: il libro ───
  let libro = null, ultima = 'zaino';
  function chiudi() {
    if (!libro) return;
    libro.remove();
    libro = null;
    el.classList.remove('nascosto');
    opzioni.onChiudi?.();
  }
  function riga(r) {
    const b = r.azione ? `<button type="button" ${r.disponibile === false ? 'disabled' : ''} title="${_esc(r.disponibile === false ? r.etichetta ?? '' : '')}">${_esc(r.azione)}</button>` : '<span></span>';
    return `<div class="voce-tab"><span>${_esc(r.nome)}${r.info ? `<i>${_esc(r.info)}</i>` : ''}</span><span class="destra">${_esc(r.destra ?? '')}</span>${b}</div>`;
  }
  const SEGNI = { fatto: '●', mezzo: '◐', 'da fare': '○', ignoto: '○' };
  function blocco(b) {
    let h = b.titolo ? `<div class="tt">${_esc(b.titolo)}</div>` : '';
    if (b.testo) h += `<p class="testo">${_esc(b.testo)}</p>`;
    if (b.righe) h += b.righe.length ? b.righe.map(riga).join('') : `<div class="vuota">${_esc(b.vuota ?? '')}</div>`;
    if (b.voci) h += b.voci.map((v) => `<div class="proposito ${v.segno.replace(' ', '-')}"><span class="s">${SEGNI[v.segno] ?? '○'}</span>`
      + `<span>${_esc(v.nome)}${v.info ? `<i>${_esc(v.info)}</i>` : ''}</span><span class="destra">${_esc(v.destra ?? '')}</span></div>`).join('');
    if (b.cronaca) h += b.cronaca.length
      ? `<div class="cron">${b.cronaca.map((c) => `<div>${c.quando ? `<b>${_esc(c.quando)}</b>` : ''}${_esc(c.testo)}</div>`).join('')}</div>`
      : `<div class="vuota">${_esc(b.vuota ?? '')}</div>`;
    return h;
  }
  /** Apre il diario sulla sezione `id` (o la ridisegna, se è già aperto). */
  function apri(id = ultima) {
    ultima = SEZIONI_DIARIO.some(([s]) => s === id) ? id : 'zaino';
    const nuovo = !libro;
    if (!libro) {
      libro = document.createElement('div');
      libro.className = 'diario-aperto';
      document.body.appendChild(libro);
      libro.addEventListener('mousedown', (e) => { if (e.target === libro) chiudi(); });
    }
    const s = opzioni.stato(), sez = opzioni.sezione(ultima);
    const [, , nomeLungo] = SEZIONI_DIARIO.find(([x]) => x === ultima);
    const azioni = [];
    const destra = (sez.blocchi ?? []).map((b) => {
      (b.righe ?? []).forEach((r) => { if (r.azione) azioni.push(r); });
      return blocco(b);
    }).join('');
    libro.innerHTML = `<div class="libro">
      <div class="pag pag-s"><h2>Diario di ${_esc(s.nome)}</h2><div class="sott">${_esc(s.sottotitolo)}</div><div class="fregio"></div>
        <div class="stato">${ATTRIBUTI.map(([id, n]) => `<span>${n}</span><span class="b ${id}"><i style="width:${pct(s.attr[id]).toFixed(1)}%"></i></span>`
          + `<span>${Math.ceil(s.attr[id][0])} / ${s.attr[id][1]}</span>`).join('')}
          <span>Oro</span><span></span><span>${s.oro}</span><span>Onore</span><span></span><span>${s.onore > 0 ? '+' : ''}${s.onore}</span></div>
        <div class="sott quando">${_esc(s.data)}</div>
        <div class="indice">${SEZIONI_DIARIO.map(([x, , n]) => `<button type="button" data-s="${x}" class="${x === ultima ? 'su' : ''}">`
          + `<span>❧ ${n}</span><span>${x === 'zaino' ? 'I' : ''}</span></button>`).join('')}</div>
        <div class="piede">Esc o I per chiudere · 1–5 le sezioni · il tempo è fermo</div></div>
      <div class="pag pag-d"><h2>${_esc(sez.titolo ?? nomeLungo)}</h2>${sez.sottotitolo ? `<div class="sott">${_esc(sez.sottotitolo)}</div>` : ''}<div class="fregio"></div>
        <div class="corpo">${destra}</div></div>
      <div class="nastri">${SEZIONI_DIARIO.map(([x, n, , c]) => `<button type="button" data-s="${x}" class="${x === ultima ? 'su' : ''}" style="background:${c}">${n}</button>`).join('')}</div>
    </div>`;
    libro.querySelectorAll('.indice button, .nastri button').forEach((b) => b.addEventListener('click', () => apri(b.dataset.s)));
    libro.querySelectorAll('.pag-d .voce-tab button').forEach((b, i) => b.addEventListener('click', () => { azioni[i].scegli?.(); }));
    el.classList.add('nascosto');
    if (nuovo) opzioni.onApri?.();
  }
  function tasto(e) {
    if (!libro) return false;
    if (e.code === 'Escape' || e.code === 'KeyI') { chiudi(); return true; }
    const n = Number(e.key);
    if (n >= 1 && n <= SEZIONI_DIARIO.length) { apri(SEZIONI_DIARIO[n - 1][0]); return true; }
    return false;
  }
  return {
    aggiorna, apri, chiudi, tasto,
    mostra(b) { el.hidden = !b; if (b) aggiorna(); },
    get aperto() { return !!libro; },
    get sezione() { return ultima; },
  };
}
