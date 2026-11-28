// Knight Dawn — save/load
// Tutto in localStorage del browser (prima su Supabase: abbandonato con M5).
// Ogni slot è una chiave 'knightdawn.slot.N' con { slot, player_name, label, updated_at, data }.
//
// Convenzione slot:
//   0       → autosave della modalità Libera (ogni AUTOSAVE_INTERVAL e quando si lascia la pagina);
//             i salvataggi di prima del menu d'avvio (G1) stanno qui e diventano partite Libere
//   6       → autosave della modalità Storia (G1, docs/EARLY_GAME.md §7)
//   1..5    → slot manuali del giocatore
//
// Il "save blob" è un oggetto JSON con tutto lo stato di gioco. La posizione nella Scena 3D la
// fornisce il motore 3D tramite Save.statoScena (funzione): questo file non dipende da Three.js.

const AUTOSAVE_SLOT = 0;
const AUTOSAVE_STORIA = 6;
const MANUAL_SLOTS = [1, 2, 3, 4, 5];
const ALL_SLOTS = [0, 1, 2, 3, 4, 5, 6];
const AUTOSAVE_INTERVAL = 60_000; // 1 minuto
const SAVE_PREFIX = 'knightdawn.slot.';
const SAVE_VERSION = 2;           // 2: localStorage + Scena 3D (la 1 era il 2D su Supabase)

const Save = {
  _autoTimer: null,
  AUTOSAVE_SLOT, AUTOSAVE_STORIA, MANUAL_SLOTS, ALL_SLOTS,

  // Modalità della partita in corso ('storia' | 'libera'), scritta nel blob. La imposta il motore 3D.
  modalita: 'libera',

  /** Slot dell'autosave di una modalità. */
  slotAutosave(modalita) { return modalita === 'storia' ? AUTOSAVE_STORIA : AUTOSAVE_SLOT; },

  /** Riassunto della partita salvata di una modalità (per il menu d'avvio), o null. Non tocca lo stato. */
  infoPartita(modalita) {
    const row = this._leggi(this.slotAutosave(modalita));
    if (!row || !row.data || row.data.version !== SAVE_VERSION) return null;
    if ((row.data.modalita || 'libera') !== modalita) return null;
    const sc = row.data.scena || {};
    return { label: row.label, updated_at: row.updated_at, seme: sc.seme, terreno: sc.terreno };
  },

  // Impostata dal motore 3D: () => ({ terreno, x, z, direzione }). null = nessuna scena attiva.
  statoScena: null,
  // Dopo un caricamento: la scena salvata (o null), letta dal motore 3D per riposizionare il cavaliere.
  scenaSalvata: null,

  // ─── Costruzione blob ────────────────────────────────────────────────

  buildBlob() {
    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      modalita: this.modalita,
      knight: this._snapshotKnight(),
      calendar: Calendar.toJSON(),
      events: (typeof Events !== 'undefined' && Events.toJSON) ? Events.toJSON() : null,
      news: (typeof News !== 'undefined' && News.toJSON) ? News.toJSON() : null,
      conoscenza: (typeof Conoscenza !== 'undefined') ? Conoscenza.toJSON() : null,
      scena: (typeof this.statoScena === 'function') ? this.statoScena() : null,
    };
  },

  _snapshotKnight() {
    return {
      nome: Knight.nome,
      titolo: Knight.titolo,
      rango: Knight.rango,
      forza: { ...Knight.forza },
      volonta: { ...Knight.volonta },
      salute: { ...Knight.salute },
      onore: Knight.onore,
      equip: { ...Knight.equip },
      reputazione: Knight.reputazione.map(r => ({ ...r })),
      oro: Knight.oro,
      cavallo: Knight.cavallo ? { ...Knight.cavallo } : null,
      inSella: Knight.inSella,
      cronaca: Knight.cronaca.slice(-60),
      zaino: [...Knight.zaino],
      ultimoPasto: Knight.ultimoPasto,
      giornoControllato: Knight.giornoControllato,
      addestramento: Knight.addestramento,
      primaSangue: Knight.primaSangue,
      apprendista: Knight.apprendista,
      compagni: Knight.compagni.map(c => ({ ...c })),
    };
  },

  // ─── Ripristino blob ─────────────────────────────────────────────────

  applyBlob(blob) {
    if (!blob || blob.version !== SAVE_VERSION) return false;

    const k = blob.knight;
    Knight.nome     = k.nome;
    Knight.titolo   = k.titolo;
    Knight.rango    = k.rango || 'garzone';
    Knight.forza    = k.forza;
    Knight.volonta  = k.volonta;
    Knight.salute   = k.salute;
    Knight.onore    = k.onore;
    Knight.equip    = k.equip;
    Knight.reputazione = k.reputazione;
    Knight.oro         = k.oro;
    Knight.cavallo     = k.cavallo || null;
    Knight.inSella     = !!k.inSella;
    Knight.zaino       = Array.isArray(k.zaino) ? k.zaino : [];
    Knight.cronaca     = Array.isArray(k.cronaca) ? k.cronaca : [];
    // Salvataggi di prima del passo 3: si considera mangiato fino a oggi (niente fame retroattiva).
    const oggi = Math.floor(((blob.calendar && blob.calendar.passiTotali) || 0) / 8);
    Knight.ultimoPasto = Number.isFinite(k.ultimoPasto) ? k.ultimoPasto : oggi;
    Knight.giornoControllato = Number.isFinite(k.giornoControllato) ? k.giornoControllato : oggi;
    Knight.addestramento = k.addestramento || 0;
    Knight.primaSangue   = !!k.primaSangue;
    Knight.apprendista = k.apprendista;
    Knight.compagni    = k.compagni;

    Calendar.fromJSON(blob.calendar);
    if (typeof Events !== 'undefined' && Events.fromJSON) Events.fromJSON(blob.events);
    if (typeof News   !== 'undefined' && News.fromJSON)   News.fromJSON(blob.news);
    if (typeof Conoscenza !== 'undefined') Conoscenza.fromJSON(blob.conoscenza);

    this.modalita = blob.modalita || 'libera';
    this.scenaSalvata = blob.scena || null;
    return true;
  },

  // ─── localStorage ────────────────────────────────────────────────────
  // Le funzioni restano async come ai tempi di Supabase: chi le chiama può continuare a usare await.
  // In finestre private o con i dati del sito bloccati localStorage può lanciare: si segnala e basta.

  _key(slot) { return SAVE_PREFIX + slot; },

  _leggi(slot) {
    try {
      const raw = localStorage.getItem(this._key(slot));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Lettura salvataggio fallita (slot ' + slot + '):', e);
      return null;
    }
  },

  async save(slot) {
    if (slot == null) return false;
    const row = {
      slot,
      player_name: Knight.nome,
      label: Calendar.formatCompatto(),
      updated_at: new Date().toISOString(),
      data: this.buildBlob(),
    };
    try {
      localStorage.setItem(this._key(slot), JSON.stringify(row));
      return true;
    } catch (e) {
      console.error('Save fallito (slot ' + slot + '):', e);
      return false;
    }
  },

  async load(slot) {
    if (slot == null) return false;
    const row = this._leggi(slot);
    return row ? this.applyBlob(row.data) : false;
  },

  // ─── File JSON (G1: il giocatore scarica e ricarica le partite dal menu d'avvio) ─────────────────
  // Il file è la riga dello slot così com'è ({ slot, player_name, label, updated_at, data }).

  /** Testo JSON della partita salvata di una modalità, per scaricarla; null se non c'è. */
  esporta(modalita) {
    const row = this._leggi(this.slotAutosave(modalita));
    return row ? JSON.stringify(row, null, 1) : null;
  },

  /**
   * Legge il testo di un file di salvataggio. Ritorna { modalita, row }; lancia un Error con un messaggio per il
   * giocatore se il file non è un salvataggio di questa versione del gioco.
   */
  leggiFile(testo) {
    let row;
    try { row = JSON.parse(testo); } catch (e) { throw new Error('Il file non è un JSON valido.'); }
    const d = row && row.data;
    if (!d || !d.knight || !d.calendar) throw new Error('Il file non è un salvataggio di Knight Dawn.');
    if (d.version !== SAVE_VERSION) throw new Error(`Salvataggio di un'altra versione (${d.version}, serve ${SAVE_VERSION}).`);
    return { modalita: d.modalita === 'storia' ? 'storia' : 'libera', row };
  },

  /** Scrive una partita letta da file nello slot della sua modalità (sostituisce quella salvata). */
  importa(modalita, row) {
    const slot = this.slotAutosave(modalita);
    try {
      localStorage.setItem(this._key(slot), JSON.stringify({ ...row, slot }));
      return true;
    } catch (e) {
      console.error('Importazione fallita:', e);
      return false;
    }
  },

  /** Cancella la partita salvata di una modalità (G1 passo 4: la morte dopo l'investitura chiude la Storia). */
  cancella(modalita) { return this.delete(this.slotAutosave(modalita)); },

  async delete(slot) {
    if (slot == null) return false;
    try {
      localStorage.removeItem(this._key(slot));
      return true;
    } catch (e) {
      console.error('Cancellazione fallita (slot ' + slot + '):', e);
      return false;
    }
  },

  // Metadata di tutti gli slot: { 0: {...} | null, 1: {...} | null, ... }
  async listSlots() {
    const out = {};
    for (const s of ALL_SLOTS) {
      const row = this._leggi(s);
      out[s] = row ? { slot: s, player_name: row.player_name, label: row.label, updated_at: row.updated_at } : null;
    }
    return out;
  },

  async hasSave(slot) {
    if (slot == null) return null;
    const row = this._leggi(slot);
    return row ? { slot, player_name: row.player_name, label: row.label, updated_at: row.updated_at } : null;
  },

  // ─── Autosave periodico (slot della modalità in corso) ───────────────

  startAutosave() {
    this.stopAutosave();
    this._autoTimer = setInterval(() => {
      this.save(this.slotAutosave(this.modalita)).catch(e => console.error('Autosave:', e));
    }, AUTOSAVE_INTERVAL);
  },

  stopAutosave() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  },
};
