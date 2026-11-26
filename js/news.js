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
      doc:     payload.doc     || null,   // foglio da mostrare nello scrittoio (G1: { tipo, testo, fonte, quando… })
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

// ─── Conoscenza del mondo (nebbia della conoscenza, versione base: G1, docs/EARLY_GAME.md §7) ───────────────────
// Ciò che il cavaliere sa della geografia: una griglia del mondo a celle di CELLA m con tre stati per cella:
// 0 ignoto, 1 intravisto (visto da lontano: rilievo sbiadito, nessun dettaglio), 2 percorso (passato vicino).
// Solo dati: la minimappa ne ricava lo strato da disegnare. Attiva in Storia; in Libera si vede tutto.
// Con G2 la rivelazione passerà per la linea di vista dalle alture e per le voci (luoghi «sentiti dire").
const Conoscenza = {
  CELLA: 100,           // m per cella
  attiva: false,
  w: 0, h: 0,
  dati: null,           // Uint8Array w*h
  versione: 0,          // cresce a ogni cambiamento (chi disegna sa quando rifare)
  generazione: 0,       // cresce a ogni init/fromJSON (chi disegna rifà tutto)
  _sporco: null,        // { x0, y0, x1, y1 } in celle, o null

  /** Griglia vuota per un mondo largo larghezzaM × altezzaM metri. */
  init(larghezzaM, altezzaM) {
    this.w = Math.max(1, Math.ceil(larghezzaM / this.CELLA));
    this.h = Math.max(1, Math.ceil(altezzaM / this.CELLA));
    this.dati = new Uint8Array(this.w * this.h);
    this.generazione++; this.versione++;
    this._sporco = { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1 };
  },

  reset() { this.attiva = false; this.w = this.h = 0; this.dati = null; this.generazione++; this.versione++; this._sporco = null; },

  /** Livello della cella che contiene (x, z) in metri del mondo (fuori dalla griglia: 0). */
  livello(x, z) {
    if (!this.dati) return 0;
    const i = Math.floor(x / this.CELLA), j = Math.floor(z / this.CELLA);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.dati[j * this.w + i];
  },

  /** Porta almeno a `livello` le celle entro `raggio` m da (x, z). Ritorna quante celle sono cambiate. */
  rivela(x, z, raggio, livello) {
    if (!this.dati) return 0;
    const C = this.CELLA, r = raggio / C, ci = x / C, cj = z / C;
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(this.w - 1, Math.floor(ci + r));
    const j0 = Math.max(0, Math.floor(cj - r)), j1 = Math.min(this.h - 1, Math.floor(cj + r));
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - ci, dy = j + 0.5 - cj;
        if (dx * dx + dy * dy > r * r) continue;
        const k = j * this.w + i;
        if (this.dati[k] < livello) { this.dati[k] = livello; n++; }
      }
    }
    if (n) {
      this.versione++;
      const s = this._sporco;
      this._sporco = s ? { x0: Math.min(s.x0, i0), y0: Math.min(s.y0, j0), x1: Math.max(s.x1, i1), y1: Math.max(s.y1, j1) }
        : { x0: i0, y0: j0, x1: i1, y1: j1 };
    }
    return n;
  },

  /** Il rettangolo (celle) cambiato dall'ultima chiamata, o null; lo azzera. */
  prendiSporco() { const s = this._sporco; this._sporco = null; return s; },

  /** Quota di celle conosciute (≥ 1), per F3 e per le prove. */
  quota() {
    if (!this.dati) return 0;
    let n = 0;
    for (let k = 0; k < this.dati.length; k++) if (this.dati[k]) n++;
    return n / this.dati.length;
  },

  // Salvataggio: corse di valori uguali [valore, lunghezza, …] (la griglia è quasi tutta 0).
  toJSON() {
    if (!this.dati) return null;
    const corse = [];
    let v = this.dati[0], n = 0;
    for (let k = 0; k < this.dati.length; k++) {
      if (this.dati[k] === v) { n++; continue; }
      corse.push(v, n); v = this.dati[k]; n = 1;
    }
    corse.push(v, n);
    return { cella: this.CELLA, w: this.w, h: this.h, corse };
  },
  /** Ripristina; false se i dati mancano o non tornano (allora la griglia resta da preparare). */
  fromJSON(d) {
    if (!d || d.cella !== this.CELLA || !Array.isArray(d.corse) || !(d.w > 0) || !(d.h > 0)) { this.reset(); return false; }
    const dati = new Uint8Array(d.w * d.h);
    let k = 0;
    for (let c = 0; c < d.corse.length; c += 2) {
      const v = d.corse[c] | 0, n = d.corse[c + 1] | 0;
      if (k + n > dati.length) { this.reset(); return false; }
      dati.fill(v, k, k + n); k += n;
    }
    this.w = d.w; this.h = d.h; this.dati = dati;
    this.generazione++; this.versione++;
    this._sporco = { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1 };
    return true;
  },
};
