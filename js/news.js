// Knight Dawn — Sistema news (stub S3, implementazione completa in S6)
//
// In S3 questo modulo offre solo l'API che il sistema eventi userà per
// produrre e leggere news. Niente propagazione a onde, niente rumor,
// niente clima generale: tutto questo è S6 (docs/NEWS_SYSTEM.md).
//
// Quando S6 implementerà davvero le news, gli eventi non cambiano: cambia
// solo cosa "knownNow" significa (oggi: sempre noto al cavaliere; in S6:
// deciso dall'onda di propagazione).
//
// NewsToken (schema stabile):
//   {
//     id,         // stringa unica auto-generata
//     tipo,       // 'voce' | 'evento' | 'rumor' | 'clima' (futuro)
//     tag,        // identificatore semantico per query (es. 'lupi.nord')
//     testo,      // frase breve, mostrata al giocatore
//     x, y,       // coordinate sorgente (opzionali)
//     faction,    // fazione coinvolta (opzionale)
//     turno,      // Calendar.passiTotali al momento dell'emissione
//   }

const News = {
  tokens: [],
  noteAlCavaliere: new Set(),   // id dei token che il cavaliere conosce
  _counter: 0,

  reset() {
    this.tokens = [];
    this.noteAlCavaliere = new Set();
    this._counter = 0;
  },

  // Pubblica un token. Se knownNow è true (default), il cavaliere lo sa
  // immediatamente — in S3 è sempre così perché manca la propagazione.
  emit(payload, knownNow) {
    if (knownNow == null) knownNow = true;
    const turno = (typeof Calendar !== 'undefined') ? Calendar.passiTotali : 0;
    const token = {
      id: 'n' + (++this._counter),
      tipo:    payload.tipo    || 'voce',
      tag:     payload.tag     || '',
      testo:   payload.testo   || '',
      x:       (payload.x != null) ? payload.x : null,
      y:       (payload.y != null) ? payload.y : null,
      faction: payload.faction || null,
      turno,
    };
    this.tokens.push(token);
    if (knownNow) this.noteAlCavaliere.add(token.id);
    return token;
  },

  // True se il cavaliere ha sentito una news con quel tag.
  sa(tag) {
    if (!tag) return false;
    for (const t of this.tokens) {
      if (t.tag === tag && this.noteAlCavaliere.has(t.id)) return true;
    }
    return false;
  },

  // True se ha sentito news di un certo tipo, eventualmente di una fazione.
  saSu(tipo, faction) {
    for (const t of this.tokens) {
      if (!this.noteAlCavaliere.has(t.id)) continue;
      if (tipo && t.tipo !== tipo) continue;
      if (faction && t.faction !== faction) continue;
      return true;
    }
    return false;
  },

  // Ultime N news note al cavaliere, in ordine cronologico inverso.
  ultime(n) {
    const out = [];
    for (let i = this.tokens.length - 1; i >= 0 && out.length < (n || 5); i--) {
      const t = this.tokens[i];
      if (this.noteAlCavaliere.has(t.id)) out.push(t);
    }
    return out;
  },

  // ─── Hook futuri S6 — oggi no-op ─────────────────────────────────────────
  propaga(_passi)      { /* S6: avanza le onde sui token non ancora noti */ },
  rumorAt(_x, _y, _tag){ /* S6: ritorna variante distorta in fascia rumor */ return null; },

  // ─── Save / load ─────────────────────────────────────────────────────────
  toJSON() {
    return {
      tokens: this.tokens,
      note: [...this.noteAlCavaliere],
      counter: this._counter,
    };
  },
  fromJSON(data) {
    if (!data) { this.reset(); return; }
    this.tokens          = Array.isArray(data.tokens) ? data.tokens : [];
    this.noteAlCavaliere = new Set(Array.isArray(data.note) ? data.note : []);
    this._counter        = data.counter | 0;
  },
};
