// FERRO & CENERE — Sistema combattimento (motore)
// Scontro a passi interattivi. Questo file contiene solo motore e formula
// del singolo passo: zero UI, zero scelte forzate. La UI (scena, scelte
// del giocatore, Carta del cronista) sarà innestata in scenes.js/game.js.
// Il catalogo nemici sta in js/data/enemies.js (sottofase successiva).
//
// Design: docs/COMBAT.md
//
// API pubblica:
//   Combat.start({ enemy, terrain, knight? }) → state
//   Combat.step(state, choice?)                → { state, outcome? }
//   Combat.resolveAuto(opts)                   → outcome  (auto-test da console)
//
// Stato di uno scontro (state):
//   {
//     enemy,            // oggetto nemico {id, nome, tipo, passiMin, passiMax, ...}
//     terrain,          // codice bioma corrente (per modificatori)
//     knight,           // ref a Knight (default = singleton globale)
//     passo,            // numero passo corrente (1-based)
//     passiMax,         // limite passi prima dell'esito automatico
//     slancio,          // ±N: vantaggio cumulato del cavaliere
//     usate,            // set di azioni contestuali già usate (es. 'parlamento')
//     cronaca,          // [string] log narrativo dei passi
//     finito,           // bool
//     esito,            // null | 'vittoria'|'fuga'|'resa'|'morte'|'stallo'
//   }

const Combat = {
  // Soglie di Slancio per esiti automatici a fine N passi.
  SLANCIO_VITTORIA: 3,
  SLANCIO_SCONFITTA: -3,

  // ─── Avvio ───────────────────────────────────────────────────────────────
  start(opts) {
    const enemy   = opts.enemy;
    const knight  = opts.knight  || Knight;
    const terrain = (opts.terrain != null) ? opts.terrain : 1;
    const passiMax = this._rollPassiMax(enemy);
    return {
      enemy, terrain, knight,
      passo: 0, passiMax,
      slancio: 0,
      usate: new Set(),
      cronaca: [],
      finito: false, esito: null,
    };
  },

  _rollPassiMax(enemy) {
    const lo = enemy.passiMin | 0 || 3;
    const hi = enemy.passiMax | 0 || (lo + 2);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  },

  // ─── Passo del giocatore ────────────────────────────────────────────────
  // choice ∈ { 'continua', 'fuga', 'resa', 'colpoDisperato',
  //            'parlamento', 'oggetto', ... } — sblocco dipende da contesto
  // Default 'continua' se assente.
  step(state, choice) {
    if (state.finito) return { state, outcome: state.esito };
    choice = choice || 'continua';

    if (choice === 'fuga')        return this._tryFuga(state);
    if (choice === 'resa')        return this._tryResa(state);
    if (choice === 'parlamento')  return this._tryParlamento(state);
    if (choice === 'colpoDisperato') return this._colpoDisperato(state);

    // continua: passo normale
    return this._passoAuto(state);
  },

  // Avanza il passo automatico: calcola delta Slancio + narra.
  _passoAuto(state) {
    state.passo++;
    const delta = this._formulaPasso(state);
    state.slancio += delta;
    state.cronaca.push(this._narraPasso(state, delta));

    // Morte immediata se Salute a zero (può capitare per colpo critico)
    if (state.knight.salute.cur <= 0) {
      return this._chiudi(state, 'morte');
    }

    // Limite passi raggiunto: esito automatico da Slancio.
    if (state.passo >= state.passiMax) {
      if (state.slancio >=  this.SLANCIO_VITTORIA) return this._chiudi(state, 'vittoria');
      if (state.slancio <=  this.SLANCIO_SCONFITTA) return this._chiudi(state, 'morte');
      return this._chiudi(state, 'stallo');
    }
    return { state };
  },

  // Formula di passo (semplice, TBD §5 docs/COMBAT.md).
  // Δ slancio = (vigoreEff - sfidaNemico) + rumore.
  _formulaPasso(state) {
    const k = state.knight;
    const vigore  = (k.forza.cur   / k.forza.max)   * 5;     // 0..5
    const volonta = (k.volonta.cur / k.volonta.max) * 3;     // 0..3
    const ferito  = (1 - k.salute.cur / k.salute.max) * 4;   // 0..4 malus
    const armaBonus    = k.equip.arma     ? 2 : 0;
    const armaturaBonus= k.equip.armatura ? 1 : 0;
    const scudoBonus   = k.equip.scudo    ? 1 : 0;
    const terrenoBonus = this._terrenoBonus(state.terrain, state.enemy);

    const vigoreEff = vigore + volonta + armaBonus + armaturaBonus
                     + scudoBonus + terrenoBonus - ferito;
    const sfida = (state.enemy.sfida != null) ? state.enemy.sfida : 4;
    const rumore = (Math.random() * 2 - 1) * 2;              // ±2

    let delta = Math.round(vigoreEff - sfida + rumore);
    delta = Math.max(-3, Math.min(3, delta));

    // Possibile ferita su colpo subito grave.
    if (delta <= -2 && Math.random() < 0.5) {
      const danno = 5 + Math.floor(Math.random() * 10);
      state.knight.danneggia(danno, 'salute');
    }
    return delta;
  },

  _terrenoBonus(terrain, enemy) {
    // Placeholder: nemico animale è svantaggiato su strada, vantaggiato in foresta.
    // Catalogo terrain-vs-archetipo da affinare con js/data/enemies.js.
    if (enemy.tipo === 'bestia' && terrain === 2 /*FORESTA*/) return -1;
    if (enemy.tipo === 'bestia' && terrain === 1 /*PIANURA*/) return  1;
    return 0;
  },

  _narraPasso(state, delta) {
    const n = state.passo;
    if (delta >=  2) return `${n}. Colpo netto: il nemico arretra.`;
    if (delta ===  1) return `${n}. Affondi e guadagni terreno.`;
    if (delta ===  0) return `${n}. Lame che si misurano, nessuno cede.`;
    if (delta === -1) return `${n}. Il nemico ti incalza, cedi un passo.`;
    return                 `${n}. Colpo grave incassato.`;
  },

  // ─── Azioni speciali ────────────────────────────────────────────────────
  _tryFuga(state) {
    state.passo++;
    const k = state.knight;
    const chance = 0.35 + (k.volonta.cur / k.volonta.max) * 0.35
                       + this._terrenoBonus(state.terrain, state.enemy) * 0.05;
    if (Math.random() < chance) {
      state.cronaca.push(`${state.passo}. Approfitti di un varco e fuggi.`);
      return this._chiudi(state, 'fuga');
    }
    state.slancio -= 2;
    state.cronaca.push(`${state.passo}. Tenti la fuga ma il nemico ti raggiunge.`);
    return { state };
  },

  _tryResa(state) {
    state.passo++;
    const e = state.enemy;
    state.cronaca.push(`${state.passo}. Getti le armi.`);
    if (e.accettaResa === false) {
      state.slancio -= 3;
      state.cronaca.push(`Il nemico non concede quartiere.`);
      // Lo scontro continua: prossimo step sarà un passo subìto.
      return { state };
    }
    return this._chiudi(state, 'resa');
  },

  _tryParlamento(state) {
    if (state.usate.has('parlamento')) return this._passoAuto(state);
    state.usate.add('parlamento');
    state.passo++;
    const e = state.enemy;
    const k = state.knight;
    if (e.tipo !== 'umano' || k.onore < 2) {
      state.cronaca.push(`${state.passo}. Provi a parlare: nessuna risposta.`);
      return { state };
    }
    if (Math.random() < 0.5) {
      state.cronaca.push(`${state.passo}. Le tue parole pesano. Il nemico si ritrae.`);
      return this._chiudi(state, 'vittoria');
    }
    state.cronaca.push(`${state.passo}. Le tue parole cadono nel vuoto.`);
    return { state };
  },

  _colpoDisperato(state) {
    state.passo++;
    state.knight.danneggia(8, 'salute');
    if (state.knight.salute.cur <= 0) {
      state.cronaca.push(`${state.passo}. Tutto in un colpo: cadi con lui.`);
      return this._chiudi(state, 'morte');
    }
    state.slancio += 3;
    state.cronaca.push(`${state.passo}. Affondo disperato: ferito ma in vantaggio.`);
    if (state.passo >= state.passiMax) {
      return this._chiudi(state, state.slancio > 0 ? 'vittoria' : 'morte');
    }
    return { state };
  },

  // ─── Scelte disponibili in questo passo ─────────────────────────────────
  // Utile alla UI per decidere quali pulsanti mostrare.
  scelteDisponibili(state) {
    if (state.finito) return [];
    const opts = ['continua', 'fuga', 'resa'];
    if (!state.usate.has('parlamento')
        && state.enemy.tipo === 'umano'
        && state.knight.onore >= 2) {
      opts.push('parlamento');
    }
    if (state.knight.salute.cur > 10) opts.push('colpoDisperato');
    return opts;
  },

  // ─── Chiusura ───────────────────────────────────────────────────────────
  _chiudi(state, esito) {
    state.finito = true;
    state.esito  = esito;
    return { state, outcome: esito };
  },

  // ─── Helper di test (console) ───────────────────────────────────────────
  // Esegue automaticamente "continua" finché lo scontro non chiude.
  resolveAuto(opts) {
    let state = this.start(opts);
    let safety = 100;
    while (!state.finito && safety-- > 0) {
      ({ state } = this.step(state, 'continua'));
    }
    return { esito: state.esito, passo: state.passo, slancio: state.slancio,
             cronaca: state.cronaca };
  },
};
