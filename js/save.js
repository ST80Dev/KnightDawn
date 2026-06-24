// FERRO & CENERE — save/load
// Primario: Supabase cloud (tabella public.saves, slot unico per ora).
// Fallback: localStorage autosave periodico (singolo, niente storico).
//
// Il "save blob" è un oggetto JSON con tutto lo stato di gioco.
// Ogni modulo espone toJSON()/fromJSON() per la propria fetta.

const SUPABASE_URL = 'https://ysiluaqmexhssvumokzx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzaWx1YXFtZXhoc3N2dW1va3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM5MzksImV4cCI6MjA5Nzc3OTkzOX0.mGUWlG6ireYAdnP54DmVe9agAtDBOg6SBTFMJBbvYv4';

const LOCAL_SAVE_KEY = 'knightdawn_autosave';
const AUTOSAVE_INTERVAL = 60_000; // 1 minuto

const Save = {
  _autoTimer: null,

  // ─── Costruzione blob ────────────────────────────────────────────────

  buildBlob() {
    return {
      version: 1,
      timestamp: Date.now(),
      knight: Knight.toJSON ? Knight.toJSON() : this._snapshotKnight(),
      calendar: Calendar.toJSON(),
      events: (typeof Events !== 'undefined' && Events.toJSON) ? Events.toJSON() : null,
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

    // Knight
    const k = blob.knight;
    Knight.nome     = k.nome;
    Knight.titolo   = k.titolo;
    Knight.forza    = k.forza;
    Knight.volonta  = k.volonta;
    Knight.salute   = k.salute;
    Knight.onore    = k.onore;
    Knight.equip    = k.equip;
    Knight.reputazione = k.reputazione;
    Knight.oro         = k.oro;
    Knight.apprendista = k.apprendista;
    Knight.compagni    = k.compagni;

    // Calendar
    Calendar.fromJSON(blob.calendar);
    if (typeof Events !== 'undefined' && Events.fromJSON) Events.fromJSON(blob.events);

    // World — rigenera dallo stesso seed
    World.generate(blob.world.seed);

    // Nebbia di guerra
    if (blob.game.fog) {
      const raw = atob(blob.game.fog);
      World.fog = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) World.fog[i] = raw.charCodeAt(i);
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

  async saveCloud(slot) {
    slot = slot || 1;
    const blob = this.buildBlob();
    const row = {
      slot,
      player_name: Knight.nome,
      label: Calendar.formatCompatto(),
      data: blob,
      updated_at: new Date().toISOString(),
    };

    // Upsert: se il slot esiste aggiorna, altrimenti inserisce.
    const res = await this._supaFetch(
      '/saves?on_conflict=slot',
      {
        method: 'POST',
        prefer: 'return=representation,resolution=merge-duplicates',
        body: JSON.stringify(row),
      }
    );

    if (!res.ok) {
      console.error('Save cloud fallito:', res.status, await res.text());
      return false;
    }
    // Aggiorna anche il fallback locale
    this.saveLocal();
    return true;
  },

  async loadCloud(slot) {
    slot = slot || 1;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot + '&select=data&limit=1',
      { method: 'GET' }
    );

    if (!res.ok) {
      console.error('Load cloud fallito:', res.status);
      return false;
    }

    const rows = await res.json();
    if (!rows.length) return false;
    return this.applyBlob(rows[0].data);
  },

  async deleteCloud(slot) {
    slot = slot || 1;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot,
      { method: 'DELETE' }
    );
    return res.ok;
  },

  async hasCloudSave(slot) {
    slot = slot || 1;
    const res = await this._supaFetch(
      '/saves?slot=eq.' + slot + '&select=slot,player_name,label,updated_at&limit=1',
      { method: 'GET' }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0] : null;
  },

  // ─── Locale (localStorage fallback) ──────────────────────────────────

  saveLocal() {
    try {
      const blob = this.buildBlob();
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(blob));
      return true;
    } catch (e) {
      console.error('Autosave locale fallito:', e);
      return false;
    }
  },

  loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (!raw) return false;
      return this.applyBlob(JSON.parse(raw));
    } catch (e) {
      console.error('Load locale fallito:', e);
      return false;
    }
  },

  hasLocalSave() {
    return localStorage.getItem(LOCAL_SAVE_KEY) !== null;
  },

  clearLocal() {
    localStorage.removeItem(LOCAL_SAVE_KEY);
  },

  // ─── Autosave periodico ──────────────────────────────────────────────

  startAutosave() {
    this.stopAutosave();
    this._autoTimer = setInterval(() => this.saveLocal(), AUTOSAVE_INTERVAL);
  },

  stopAutosave() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  },
};
