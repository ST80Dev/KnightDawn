// FERRO & CENERE — Sistema combattimento (motore)
// Scontro a Round interattivi. Un Round di combattimento = un Passo del
// calendario (~3 ore in-fiction): nessuna sotto-unità tattica, stessa
// griglia temporale del viaggio. Ogni Round avanza Calendar di 1 Passo.
// Zero UI, zero scelte forzate qui dentro. La UI (scena, scelte del
// giocatore, Carta del cronista) sarà innestata in scenes.js/game.js.
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
//     enemy,            // oggetto nemico {id, nome, tipo, roundMin, roundMax, ...}
//     terrain,          // codice bioma corrente (per modificatori)
//     knight,           // ref a Knight (default = singleton globale)
//     round,            // numero Round corrente (1-based)
//     roundMax,         // limite Round prima dell'esito automatico
//     slancio,          // ±N: vantaggio cumulato del cavaliere
//     usate,            // set di azioni contestuali già usate (es. 'parlamento')
//     cronaca,          // [string] log narrativo dei Round
//     finito,           // bool
//     esito,            // null | 'vittoria'|'fuga'|'resa'|'morte'|'stallo'
//   }

const Combat = {
  // Soglie di Slancio per esiti automatici a fine N Round.
  SLANCIO_VITTORIA: 3,
  SLANCIO_SCONFITTA: -3,

  // ─── Avvio ───────────────────────────────────────────────────────────────
  // opts.enemy può essere un oggetto nemico oppure un id stringa risolto
  // tramite il catalogo Enemies (js/data/enemies.js).
  start(opts) {
    const enemy   = this._resolveEnemy(opts.enemy);
    const knight  = opts.knight  || Knight;
    const terrain = (opts.terrain != null) ? opts.terrain : 1;
    const roundMax = this._rollRoundMax(enemy);
    return {
      enemy, terrain, knight,
      round: 0, roundMax,
      slancio: 0,
      usate: new Set(),
      cronaca: [],
      finito: false, esito: null,
    };
  },

  // Risolve un nemico da id stringa o oggetto. Fallback difensivo a un
  // archetipo minimo se l'id è sconosciuto o il catalogo non è caricato.
  _resolveEnemy(enemy) {
    if (typeof Enemies !== 'undefined' && Enemies.get) {
      const e = Enemies.get(enemy);
      if (e) return e;
    }
    if (enemy && typeof enemy === 'object') return enemy;
    return { id: '?', nome: 'Avversario', tipo: 'umano', sfida: 10,
             roundMin: 2, roundMax: 3, accettaResa: true };
  },

  // Range di Round per archetipo (vedi docs/COMBAT.md §2):
  //   ladro/animale piccolo: 1
  //   bandito/lupo/predone:  2-3
  //   cavaliere/orso/boss:   4-6
  //   creatura mitica:       6-10
  //   battaglia esercito:    10-20
  //   assedio prolungato:    30-60
  // I valori vengono dal catalogo nemici (enemy.roundMin/roundMax).
  _rollRoundMax(enemy) {
    const lo = enemy.roundMin | 0 || 1;
    const hi = enemy.roundMax | 0 || lo;
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

    // continua: Round normale
    return this._roundAuto(state);
  },

  // Avanza Calendar di 1 Passo per ogni Round consumato (auto, fuga, resa,
  // parlamento, colpo disperato). Sicuro se Calendar non è disponibile (es.
  // test in Node senza il calendario caricato).
  _avanzaCalendar() {
    if (typeof Calendar !== 'undefined' && Calendar.avanza) Calendar.avanza(1);
  },

  // Avanza il Round automatico: calcola delta Slancio + narra.
  _roundAuto(state) {
    state.round++;
    this._avanzaCalendar();
    const delta = this._formulaRound(state);
    state.slancio += delta;
    state.cronaca.push(this._narraRound(state, delta));

    // Morte immediata se Salute a zero (può capitare per colpo critico)
    if (state.knight.salute.cur <= 0) {
      return this._chiudi(state, 'morte');
    }

    // Limite Round raggiunto: esito automatico da Slancio.
    if (state.round >= state.roundMax) {
      if (state.slancio >=  this.SLANCIO_VITTORIA) return this._chiudi(state, 'vittoria');
      if (state.slancio <=  this.SLANCIO_SCONFITTA) return this._chiudi(state, 'morte');
      return this._chiudi(state, 'stallo');
    }
    return { state };
  },

  // Formula di Round (semplice, TBD §5 docs/COMBAT.md).
  // Δ slancio = (vigoreEff - sfidaNemico) + rumore.
  _formulaRound(state) {
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

  _narraRound(state, delta) {
    const n = state.round;
    if (delta >=  2) return `${n}. Colpo netto: il nemico arretra.`;
    if (delta ===  1) return `${n}. Affondi e guadagni terreno.`;
    if (delta ===  0) return `${n}. Lame che si misurano, nessuno cede.`;
    if (delta === -1) return `${n}. Il nemico ti incalza, cedi un passo.`;
    return                 `${n}. Colpo grave incassato.`;
  },

  // ─── Azioni speciali ────────────────────────────────────────────────────
  _tryFuga(state) {
    state.round++;
    this._avanzaCalendar();
    const k = state.knight;
    const chance = 0.35 + (k.volonta.cur / k.volonta.max) * 0.35
                       + this._terrenoBonus(state.terrain, state.enemy) * 0.05;
    if (Math.random() < chance) {
      state.cronaca.push(`${state.round}. Approfitti di un varco e fuggi.`);
      return this._chiudi(state, 'fuga');
    }
    state.slancio -= 2;
    state.cronaca.push(`${state.round}. Tenti la fuga ma il nemico ti raggiunge.`);
    return { state };
  },

  _tryResa(state) {
    state.round++;
    this._avanzaCalendar();
    const e = state.enemy;
    state.cronaca.push(`${state.round}. Getti le armi.`);
    if (e.accettaResa === false) {
      state.slancio -= 3;
      state.cronaca.push(`Il nemico non concede quartiere.`);
      // Lo scontro continua: prossimo step sarà un Round subìto.
      return { state };
    }
    return this._chiudi(state, 'resa');
  },

  _tryParlamento(state) {
    if (state.usate.has('parlamento')) return this._roundAuto(state);
    state.usate.add('parlamento');
    state.round++;
    this._avanzaCalendar();
    const e = state.enemy;
    const k = state.knight;
    if (e.tipo !== 'umano' || k.onore < 2) {
      state.cronaca.push(`${state.round}. Provi a parlare: nessuna risposta.`);
      return { state };
    }
    if (Math.random() < 0.5) {
      state.cronaca.push(`${state.round}. Le tue parole pesano. Il nemico si ritrae.`);
      return this._chiudi(state, 'vittoria');
    }
    state.cronaca.push(`${state.round}. Le tue parole cadono nel vuoto.`);
    return { state };
  },

  _colpoDisperato(state) {
    state.round++;
    this._avanzaCalendar();
    state.knight.danneggia(8, 'salute');
    if (state.knight.salute.cur <= 0) {
      state.cronaca.push(`${state.round}. Tutto in un colpo: cadi con lui.`);
      return this._chiudi(state, 'morte');
    }
    state.slancio += 3;
    state.cronaca.push(`${state.round}. Affondo disperato: ferito ma in vantaggio.`);
    if (state.round >= state.roundMax) {
      return this._chiudi(state, state.slancio > 0 ? 'vittoria' : 'morte');
    }
    return { state };
  },

  // ─── Scelte disponibili in questo Round ─────────────────────────────────
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
    return { esito: state.esito, round: state.round, slancio: state.slancio,
             cronaca: state.cronaca };
  },
};
