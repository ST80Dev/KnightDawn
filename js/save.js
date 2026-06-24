// FERRO & CENERE — save/load
// Tutto su Supabase. Tabella public.saves con colonna 'slot' unique.
//
// Convenzione slot:
//   0       → autosave automatico (ogni AUTOSAVE_INTERVAL)
//   1..5    → slot manuali del giocatore
//
// Il "save blob" è un oggetto JSON con tutto lo stato di gioco.

const SUPABASE_URL = 'https://ysiluaqmexhssvumokzx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzaWx1YXFtZXhoc3N2dW1va3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM5MzksImV4cCI6MjA5Nzc3OTkzOX0.mGUWlG6ireYAdnP54DmVe9agAtDBOg6SBTFMJBbvYv4';

const AUTOSAVE_SLOT = 0;
const MANUAL_SLOTS = [1, 2, 3, 4, 5];
const ALL_SLOTS = [0, 1, 2, 3, 4, 5];
const AUTOSAVE_INTERVAL = 60_000; // 1 minuto

const Save = {
  _autoTimer: null,
  AUTOSAVE_SLOT, MANUAL_SLOTS, ALL_SLOTS,

  // ─── Costruzione blob ────────────────────────────────────────────────

  buildBlob() {
    return {
      version: 1,
      timestamp: Date.now(),
      knight: this._snapshotKnight(),
      calendar: Calendar.toJSON(),
      events: (typeof Events !== 'undefined' && Events.toJSON) ? Events.toJSON() : null,
      news: (typeof News !== 'undefined' && News.toJSON) ? News.toJSON() : null,
      world: {
        seed: World.seed,
        width: World.width,
        height: World.height,
      },
      game: {
        knightPos: GameScreen.knightPos,
        cam: { cx: GameScreen.cam.cx, cy: GameScreen.cam.cy, step: GameScreen.cam.step },
        log: GameScreen.log,
        meta: GameScreen.meta,
        fogVersion: 2,
        fog: (() => {
          if (!World.fog) return '';
          let s = '';
          for (let i = 0; i < World.fog.length; i++) s += String.fromCharCode(World.fog[i]);
          return btoa(s);
        })(),
      },
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
      apprendista: Knight.apprendista,
      compagni: Knight.compagni.map(c => ({ ...c })),
    };
  },

  // ─── Ripristino blob ─────────────────────────────────────────────────

  applyBlob(blob) {
    if (!blob || blob.version !== 1) return false;

    const k = blob.knight;
    Knight.nome     = k.nome;
    Knight.titolo   = k.titolo;
    Knight.rango    = k.rango || 'errante';   // back-compat: salvataggi pre-ranghi
    Knight.forza    = k.forza;
    Knight.volonta  = k.volonta;
    Knight.salute   = k.salute;
    Knight.onore    = k.onore;
    Knight.equip    = k.equip;
    Knight.reputazione = k.reputazione;
    Knight.oro         = k.oro;
    Knight.apprendista = k.apprendista;
    Knight.compagni    = k.compagni;

    Calendar.fromJSON(blob.calendar);
    if (typeof Events !== 'undefined' && Events.fromJSON) Events.fromJSON(blob.events);
    if (typeof News   !== 'undefined' && News.fromJSON)   News.fromJSON(blob.news);

    World.generate(blob.world.seed);

    // Nebbia di guerra
    if (blob.game.fog) {
      const raw = atob(blob.game.fog);
      World.fog = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) World.fog[i] = raw.charCodeAt(i);
      // Migrazione fog v1 (binario 0/1) → v2 (0/1/2): i tile esplorati passano a 2.
      const fv = blob.game.fogVersion || 1;
      if (fv < 2) {
        for (let i = 0; i < World.fog.length; i++) {
          if (World.fog[i] > 0) World.fog[i] = 2;
        }
      }
    }

    // Game state
    GameScreen.knightPos = blob.game.knightPos;
    GameScreen.cam = blob.game.cam;
    GameScreen.log = blob.game.log;
    GameScreen.meta = blob.game.meta;
    GameScreen.knight = Knight;
    GameScreen.activeOverlay = null;
    GameScreen.dragging = false;

    return true;
  },

  // ─── Cloud (Supabase) ────────────────────────────────────────────────

  async _supaFetch(path, options) {
    const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
      ...options,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': options?.prefer || 'return=representation',
        ...(options?.headers || {}),
      },
    });
    return res;
  },

  async save(slot) {
    if (slot == null) return false;
    const blob = this.buildBlob();
    const row = {
      slot,
      player_name: Knight.nome,
      label: Calendar.formatCompatto(),
      data: blob,
      updated_at: new Date().toISOString(),
    };

    const res = await this._supaFetch(
      '/saves?on_conflict=slot',
      {
        method: 'POST',
        prefer: 'return=representation,resolution=merge-duplicates',
        body: JSON.stringify(row),
      }
    );

    if (!res.ok) {
      console.error('Save fallito (slot ' + slot + '):', res.status, await res.text());
      return false;
    }
    return true;
  },

  async load(slot) {
    if (slot == null) return false;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot + '&select=data&limit=1',
      { method: 'GET' }
    );

    if (!res.ok) {
      console.error('Load fallito (slot ' + slot + '):', res.status);
      return false;
    }

    const rows = await res.json();
    if (!rows.length) return false;
    return this.applyBlob(rows[0].data);
  },

  async delete(slot) {
    if (slot == null) return false;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot,
      { method: 'DELETE' }
    );
    return res.ok;
  },

  // Ritorna metadata di tutti gli slot in una sola fetch.
  // Risultato: { 0: {...} | null, 1: {...} | null, ... }
  async listSlots() {
    const res = await this._supaFetch(
      '/saves?select=slot,player_name,label,updated_at&order=slot.asc',
      { method: 'GET' }
    );
    const out = {};
    for (const s of ALL_SLOTS) out[s] = null;
    if (!res.ok) return out;
    const rows = await res.json();
    for (const r of rows) out[r.slot] = r;
    return out;
  },

  async hasSave(slot) {
    if (slot == null) return null;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot + '&select=slot,player_name,label,updated_at&limit=1',
      { method: 'GET' }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0] : null;
  },

  // ─── Autosave periodico (slot 0) ─────────────────────────────────────

  startAutosave() {
    this.stopAutosave();
    this._autoTimer = setInterval(() => {
      this.save(AUTOSAVE_SLOT).catch(e => console.error('Autosave:', e));
    }, AUTOSAVE_INTERVAL);
  },

  stopAutosave() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  },
};
