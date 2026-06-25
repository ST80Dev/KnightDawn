// FERRO & CENERE — Sistema eventi (motore)
// Trigger di scene narrative durante il viaggio o nei luoghi, con scelte
// stile gamebook. Solo motore: registry, selezione, applicazione effetti,
// scadenze, save/load. Il CATALOGO sta in js/data/events_*.js
// La UI ("Carta del cronista") sta in game.js.
//
// Schema Event (vedi docs/EVENTS.md per dettagli e linee guida autoriali):
//   {
//     id,            // stringa unica
//     kind,          // 'travel' | 'location' | 'poi' | 'dungeon' | 'meteo' | 'stagione'
//     where,         // filtro contesto: { biomes:[int] } per travel
//                    //                  | { struttura:'castello', area:'salatrono' } per loc area unica
//                    //                  | { edificio:'taverna' } per edificio condiviso L1
//                    //                  | { kind:'cripta' } per POI
//                    //                  | legacy: stringa = structureType (backcompat S3)
//     if,            // opz. prereq di selezione: { repMin, repMax, onoreMin, onoreMax, titolo }
//     once,          // se true, una volta sola per partita
//     oncePerLuce,   // se true, una volta per Luce (anno)
//     cooldown,      // passi minimi prima di poter ripetersi (default 0)
//     weight,        // peso di selezione (default 1)
//     condition(ctx),// opz. funzione → bool. ctx = { knight, world, meta }
//     tone,          // autoriale: 'drammatico'|'contemplativo'|'ironico'|'brutale'|'poetico'|'neutro'
//     portata,       // autoriale: 'marginale'|'notevole'|'svolta'
//     title, text,
//     options: [Option]    // ≥ 2 scelte (linea guida)
//   }
// Option = { text, prereq(ctx), prereqLabel, effects:[Effect], reply }
// Effect = function(ctx) | { type:'forza'|'volonta'|'salute'|'onore'|'oro'|
//                                 'tempo'|'log'|'reputazione'|'rivela'|
//                                 'deadlineAdd'|'deadlineDone'|'news'|'combat', ... }
//
// Effetto combat: { type:'combat', enemy, terrain?, onWin:[Effect],
//                   onFlee:[Effect], onSurrender:[Effect], onDefeat:[Effect],
//                   onDeath:[Effect], onStallo?:[Effect] }
//   enemy: id stringa del catalogo (js/data/enemies.js) o oggetto nemico.
//   Rami esito: onWin (vittoria), onFlee (fuga), onSurrender (resa),
//   onDefeat (sconfitta = battuto ma vivo), onDeath (morte = Salute 0),
//   onStallo (default → onFlee). Per ora risolve in automatico
//   (Combat.resolveAuto); quando la UI scena combattimento sarà disponibile,
//   l'effetto sospenderà l'evento e il ramo verrà applicato al ritorno.

const Events = {
  registry: [],
  seenIds: new Set(),
  lastSeenAtPasso: {},      // id → passiTotali ultima volta visto (per cooldown)
  seenInLuceKey: {},        // id → "era.luce" ultima volta visto (per oncePerLuce)
  deadlines: [],            // [{ id, scadePasso, onExpire, label }]

  // Probabilità per Passo che un evento viaggio si attivi.
  TRAVEL_PROB_PER_STEP: 0.04,

  register(ev) { this.registry.push(ev); },

  // Ritorna un evento del catalogo per id (o null). Usato per aprire eventi
  // specifici fuori dal pescaggio pesato (es. hub del garzone in Veglia).
  getById(id) { return this.registry.find(ev => ev.id === id) || null; },

  reset() {
    this.seenIds = new Set();
    this.lastSeenAtPasso = {};
    this.seenInLuceKey = {};
    this.deadlines = [];
    if (typeof News !== 'undefined' && News.reset) News.reset();
  },

  _ctx(extra) {
    return Object.assign({
      knight: Knight,
      world:  World,
      meta:   (window.GameScreen ? GameScreen.meta : null),
    }, extra || {});
  },

  // ─── Helper di check (esposti per uso nei prereq) ────────────────────────
  rep(ctx, id) {
    const r = ctx.knight.reputazione.find(x => x.id === id);
    return r ? r.val : 0;
  },
  repCheck(ctx, id, op, val) {
    const v = this.rep(ctx, id);
    switch (op) {
      case '>=': return v >= val; case '<=': return v <= val;
      case '>':  return v >  val; case '<':  return v <  val;
      case '==': return v === val;
    }
    return false;
  },
  onoreCheck(ctx, op, val) {
    const v = ctx.knight.onore;
    switch (op) {
      case '>=': return v >= val; case '<=': return v <= val;
      case '>':  return v >  val; case '<':  return v <  val;
      case '==': return v === val;
    }
    return false;
  },
  tieneEquip(ctx, slot, name) {
    return ctx.knight.equip && ctx.knight.equip[slot] === name;
  },

  // ─── Filtri di selezione ─────────────────────────────────────────────────
  _passesIf(ev, ctx) {
    const cond = ev.if;
    if (!cond) return true;
    if (cond.repMin && this.rep(ctx, cond.repMin.id) <  cond.repMin.val) return false;
    if (cond.repMax && this.rep(ctx, cond.repMax.id) >  cond.repMax.val) return false;
    if (cond.onoreMin != null && ctx.knight.onore <  cond.onoreMin) return false;
    if (cond.onoreMax != null && ctx.knight.onore >  cond.onoreMax) return false;
    if (cond.titolo && ctx.knight.titolo !== cond.titolo) return false;
    return true;
  },

  _passesRepeat(ev) {
    if (ev.once && this.seenIds.has(ev.id)) return false;
    if (ev.oncePerLuce && typeof Calendar !== 'undefined') {
      const key = Calendar.era + '.' + Calendar.luce;
      if (this.seenInLuceKey[ev.id] === key) return false;
    }
    if (ev.cooldown && typeof Calendar !== 'undefined') {
      const last = this.lastSeenAtPasso[ev.id];
      if (last != null && (Calendar.passiTotali - last) < ev.cooldown) return false;
    }
    return true;
  },

  _pick(filterFn, extra) {
    const ctx = this._ctx(extra);
    const pool = [];
    let total = 0;
    for (const ev of this.registry) {
      if (!filterFn(ev)) continue;
      if (!this._passesRepeat(ev)) continue;
      if (!this._passesIf(ev, ctx)) continue;
      if (ev.condition && !ev.condition(ctx)) continue;
      const w = ev.weight || 1;
      pool.push({ ev, w });
      total += w;
    }
    if (!pool.length) return null;
    let r = Math.random() * total;
    for (const p of pool) { r -= p.w; if (r <= 0) return p.ev; }
    return pool[pool.length - 1].ev;
  },

  // ─── Trigger pubblici ────────────────────────────────────────────────────
  rollTravel(biome) {
    if (Math.random() >= this.TRAVEL_PROB_PER_STEP) return null;
    return this._pick(ev =>
      ev.kind === 'travel' &&
      (!ev.where || !ev.where.biomes || ev.where.biomes.includes(biome))
    );
  },

  // Compat S3 + nuovo: pickLocation può ricevere structureType solo (vecchio
  // catalogo con where=string) oppure essere chiamato come pickArea via il
  // wrapper sotto.
  pickLocation(structureType, structure) {
    return this._pick(ev =>
      ev.kind === 'location' &&
      (ev.where === structureType ||
       (ev.where && ev.where.struttura === structureType && !ev.where.area)),
      { structure });
  },

  // Layout L1 (futuro): pesca eventi per AREA specifica di una struttura.
  // Cerca prima namespace per-area (struttura+area), poi cade su namespace
  // per-edificio condiviso se l'area è etichettata come edificio.
  pickArea(structureType, areaKey, structure) {
    const byArea = this._pick(ev =>
      ev.kind === 'location' && ev.where &&
      ev.where.struttura === structureType && ev.where.area === areaKey,
      { structure, area: areaKey });
    if (byArea) return byArea;
    return this._pick(ev =>
      ev.kind === 'location' && ev.where && ev.where.edificio === areaKey,
      { structure, area: areaKey });
  },

  pickPOI(special) {
    return this._pick(ev =>
      ev.kind === 'poi' &&
      (ev.where === special.kind ||
       (ev.where && ev.where.kind === special.kind)),
      { poi: special });
  },

  // Marca evento visto al momento di chiusura della Carta.
  markSeen(ev) {
    if (!ev) return;
    if (ev.once) this.seenIds.add(ev.id);
    if (typeof Calendar !== 'undefined') {
      this.lastSeenAtPasso[ev.id] = Calendar.passiTotali;
      if (ev.oncePerLuce) {
        this.seenInLuceKey[ev.id] = Calendar.era + '.' + Calendar.luce;
      }
    }
  },

  // ─── Applicazione effetti ────────────────────────────────────────────────
  applyEffects(effects, ctxExtra) {
    const ctx = this._ctx(ctxExtra);
    const logs = [];
    ctx.log = (m) => logs.push(m);
    for (const eff of (effects || [])) {
      if (typeof eff === 'function') { eff(ctx); continue; }
      this._applyDescEffect(eff, ctx);
    }
    return logs;
  },

  _applyDescEffect(eff, ctx) {
    switch (eff.type) {
      case 'forza':   Knight.forza.cur   = clamp(Knight.forza.cur   + eff.delta, 0, Knight.forza.max);   break;
      case 'volonta': Knight.volonta.cur = clamp(Knight.volonta.cur + eff.delta, 0, Knight.volonta.max); break;
      case 'salute':  Knight.salute.cur  = clamp(Knight.salute.cur  + eff.delta, 0, Knight.salute.max);  break;
      case 'onore':   Knight.modificaOnore(eff.delta); break;
      case 'oro':     Knight.oro = Math.max(0, Knight.oro + eff.delta); break;
      case 'tempo':
        if (typeof Calendar !== 'undefined') {
          Calendar.avanza(eff.passi || 1);
          this.tickDeadlines();
        }
        break;
      case 'log':     ctx.log(eff.text); break;
      case 'reputazione': {
        const r = Knight.reputazione.find(x => x.id === eff.id);
        if (r) r.val = clamp(r.val + eff.delta, -5, 5);
        break;
      }
      case 'rivela': {
        if (typeof World !== 'undefined' && World.revealArea) {
          const lvl = (eff.livello != null) ? eff.livello
            : (World.FOG ? World.FOG.INTRAVISTO : 1);
          World.revealArea(eff.x | 0, eff.y | 0, eff.raggio | 0 || 2, lvl);
        }
        break;
      }
      case 'deadlineAdd':
        this.addDeadline(eff.id, eff.passi || 60, eff.onExpire || [], eff.label || eff.id);
        break;
      case 'deadlineDone':
        this.completeDeadline(eff.id);
        break;
      case 'news':
        if (typeof News !== 'undefined' && News.emit) {
          News.emit(eff, (eff.knownNow !== false));
        }
        break;
      case 'combat': {
        // Risoluzione automatica (stub finché manca scena UI).
        if (typeof Combat === 'undefined' || !eff.enemy) break;
        // Terreno: esplicito nell'effetto, altrimenti il bioma del tile corrente
        // (così le affinità di terreno del nemico si attivano da sole).
        let terrain = eff.terrain;
        if (terrain == null && typeof World !== 'undefined' && World.biomeAt
            && typeof GameScreen !== 'undefined' && GameScreen.knightPos) {
          terrain = World.biomeAt(GameScreen.knightPos.x, GameScreen.knightPos.y);
        }
        const res = Combat.resolveAuto({
          enemy:   eff.enemy,
          terrain: terrain,
          knight:  Knight,
        });
        for (const line of res.cronaca) ctx.log(line);
        ctx.log(`Esito scontro: ${res.esito}.`);
        const ramo = ({
          vittoria:  eff.onWin,
          fuga:      eff.onFlee,
          resa:      eff.onSurrender,
          sconfitta: eff.onDefeat,        // battuto ma vivo: conseguenza scelta dall'evento
          morte:     eff.onDeath,         // Salute a 0: game over
          stallo:    eff.onStallo || eff.onFlee,
        })[res.esito];
        if (ramo) this.applyEffects(ramo).forEach(m => ctx.log(m));
        break;
      }
    }
  },

  // ─── Scadenze ────────────────────────────────────────────────────────────
  addDeadline(id, passi, onExpire, label) {
    if (typeof Calendar === 'undefined') return;
    const scadePasso = Calendar.passiTotali + (passi | 0);
    const idx = this.deadlines.findIndex(d => d.id === id);
    const entry = { id, scadePasso, onExpire, label };
    if (idx >= 0) this.deadlines[idx] = entry; else this.deadlines.push(entry);
  },
  completeDeadline(id) {
    this.deadlines = this.deadlines.filter(d => d.id !== id);
  },
  tickDeadlines() {
    if (typeof Calendar === 'undefined' || !this.deadlines.length) return;
    const now = Calendar.passiTotali;
    const stillActive = [];
    for (const d of this.deadlines) {
      if (now >= d.scadePasso) {
        this.applyEffects(d.onExpire);
      } else {
        stillActive.push(d);
      }
    }
    this.deadlines = stillActive;
  },

  // ─── Validazione catalogo (debug) ────────────────────────────────────────
  // Chiamabile a mano da console: Events.validate(). Logga warning, non blocca.
  validate() {
    const seen = new Set();
    const warns = [];
    const validTypes = new Set([
      'forza','volonta','salute','onore','oro','tempo','log',
      'reputazione','rivela','deadlineAdd','deadlineDone','news','combat',
    ]);
    const repIds = new Set((Knight.reputazione || []).map(r => r.id));
    const enemyIds = (typeof Enemies !== 'undefined' && Enemies.catalog)
      ? new Set(Object.keys(Enemies.catalog)) : null;
    // Valida ricorsivamente una lista di effetti (entra nei rami combat).
    const checkEffects = (effects, evId) => {
      for (const eff of (effects || [])) {
        if (typeof eff === 'function') continue;
        if (!validTypes.has(eff.type)) warns.push(`${evId}: effetto type sconosciuto "${eff.type}"`);
        if (eff.type === 'reputazione' && !repIds.has(eff.id)) {
          warns.push(`${evId}: reputazione id sconosciuto "${eff.id}"`);
        }
        if (eff.type === 'combat') {
          if (enemyIds && typeof eff.enemy === 'string' && !enemyIds.has(eff.enemy)) {
            warns.push(`${evId}: nemico sconosciuto "${eff.enemy}"`);
          }
          for (const ramo of ['onWin','onFlee','onSurrender','onDefeat','onDeath','onStallo']) {
            checkEffects(eff[ramo], evId);
          }
        }
      }
    };
    for (const ev of this.registry) {
      if (!ev.id) { warns.push('evento senza id'); continue; }
      if (seen.has(ev.id)) warns.push(`id duplicato: ${ev.id}`);
      seen.add(ev.id);
      if (!ev.options || ev.options.length < 2) warns.push(`${ev.id}: opzioni < 2`);
      for (const opt of (ev.options || [])) {
        checkEffects(opt.effects, ev.id);
      }
    }
    if (warns.length) console.warn('Events.validate:', warns);
    else console.info('Events.validate: catalogo ok (' + this.registry.length + ' eventi)');
    return warns;
  },

  // ─── Save / load ─────────────────────────────────────────────────────────
  toJSON() {
    return {
      seen: [...this.seenIds],
      lastSeen: this.lastSeenAtPasso,
      seenInLuce: this.seenInLuceKey,
      deadlines: this.deadlines,
    };
  },
  fromJSON(data) {
    if (!data) data = {};
    this.seenIds = new Set(Array.isArray(data.seen) ? data.seen : []);
    this.lastSeenAtPasso = data.lastSeen || {};
    this.seenInLuceKey   = data.seenInLuce || {};
    this.deadlines       = Array.isArray(data.deadlines) ? data.deadlines : [];
  },
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
