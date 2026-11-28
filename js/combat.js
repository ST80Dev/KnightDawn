// Knight Dawn — Sistema combattimento (motore)
// Scontro a Round interattivi. Ogni Round consumato avanza il calendario dei
// suoi MINUTI di gioco (docs/COMBAT.md §2, rivisto con l'utente a novembre 2026:
// prima valeva un Passo, ~3 ore), secondo il tipo di scontro (minutiRound).
// Zero UI qui dentro: il riquadro di combattimento sta in js/3d/interfaccia.js
// (creaCombattimento), il collegamento agli eventi in js/3d/main.js (G1 passo 4).
// Il catalogo nemici sta in js/data/enemies.js.
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
//     minutiRound,      // minuti di gioco per Round (minutiRound(enemy))
//     slancio,          // ±N: vantaggio cumulato del cavaliere
//     ultimo,           // ultimo Round: { scelta, delta, danno } (per la UI)
//     usate,            // set di azioni contestuali già usate (es. 'parlamento')
//     cronaca,          // [string] log narrativo dei Round
//     finito,           // bool
//     esito,            // null | 'vittoria'|'fuga'|'resa'|'sconfitta'|'morte'|'stallo'
//   }
//
// Esiti (vedi docs/COMBAT.md §7):
//   morte    → Salute a 0 (solo il corpo distrutto uccide). Game over.
//   sconfitta→ battuto ma vivo (Slancio ≤ -3 a fine Round). L'evento decide
//              la conseguenza nel ramo onDefeat (cattura, spoglio, ferita...).
//   vittoria → Slancio ≥ +3 a fine Round, o scelta vincente.
//   stallo   → nessuno prevale; disimpegno.
//   fuga/resa→ scelte del giocatore.

const Combat = {
  // Soglie di Slancio per esiti automatici a fine N Round.
  SLANCIO_VITTORIA: 3,
  SLANCIO_SCONFITTA: -3,
  // Un animale timido scappa quando lo Slancio del cavaliere arriva qui (G1 passo 5).
  TIMIDO_FUGGE: 3,

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
      minutiRound: opts.minutiRound || this.minutiRound(enemy),
      slancio: 0,
      ultimo: null,
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

  // Minuti di gioco per Round (docs/COMBAT.md §2) [DA BILANCIARE]: dal nemico
  // (enemy.minutiRound) o, se non li dice, dalla sua durata in Round:
  //   1 Round → 2 · fino a 3 → 3 · fino a 6 → 4 · oltre → 5.
  minutiRound(enemy) {
    if (enemy && enemy.minutiRound) return enemy.minutiRound;
    const hi = (enemy && (enemy.roundMax | 0)) || 1;
    return hi <= 1 ? 2 : hi <= 3 ? 3 : hi <= 6 ? 4 : 5;
  },

  // ─── Passo del giocatore ────────────────────────────────────────────────
  // choice ∈ { 'continua', 'fuga', 'resa', 'colpoDisperato',
  //            'parlamento', 'oggetto', ... } — sblocco dipende da contesto
  // Default 'continua' se assente.
  step(state, choice) {
    if (state.finito) return { state, outcome: state.esito };
    choice = choice || 'continua';
    state.ultimo = { scelta: choice, delta: 0, danno: 0 };
    const salute0 = state.knight.salute.cur, slancio0 = state.slancio;
    const res = this._esegui(state, choice);
    state.ultimo.delta = state.slancio - slancio0;
    state.ultimo.danno = Math.max(0, Math.round(salute0 - state.knight.salute.cur));
    return res;
  },

  _esegui(state, choice) {

    if (choice === 'fuga')        return this._tryFuga(state);
    if (choice === 'resa')        return this._tryResa(state);
    if (choice === 'parlamento')  return this._tryParlamento(state);
    if (choice === 'colpoDisperato') return this._colpoDisperato(state);

    // continua: Round normale
    return this._roundAuto(state);
  },

  // Avanza il calendario dei minuti di un Round per ogni Round consumato (auto,
  // fuga, resa, parlamento, colpo disperato). Spunta anche le scadenze attive
  // (GDD §3 "Modello del tempo"): scattano solo se il Passo scatta davvero.
  // Sicuro se Calendar/Events non sono disponibili.
  _avanzaCalendar(state) {
    if (typeof Calendar !== 'undefined') {
      if (Calendar.avanzaMinuti) Calendar.avanzaMinuti(state.minutiRound || 3);
      else if (Calendar.avanza) Calendar.avanza(1);
    }
    if (typeof Events !== 'undefined' && Events.tickDeadlines) Events.tickDeadlines();
  },

  // Avanza il Round automatico: calcola delta Slancio + narra.
  _roundAuto(state) {
    state.round++;
    state.combattuto = true;
    this._avanzaCalendar(state);
    const delta = this._formulaRound(state);
    state.slancio += delta;
    state.cronaca.push(this._narraRound(state, delta));
    return this._dopoRound(state);
  },

  // Fine di un Round (normale o colpo disperato): morte, fuga dell'animale timido, limite dei Round.
  _dopoRound(state) {
    // Morte immediata se Salute a zero (può capitare per colpo critico)
    if (state.knight.salute.cur <= 0) {
      return this._chiudi(state, 'morte');
    }
    // Timido: se lo Slancio gira a tuo favore, l'animale scappa (G1 passo 5).
    if (this._tratto(state.enemy, 'timido') && state.slancio >= this.TIMIDO_FUGGE) {
      state.cronaca.push(`${state.enemy.nome}: ${state.enemy.tipo === 'bestia' ? 'volta le spalle e sparisce' : 'si ritira'}.`);
      state.messoInFuga = true;
      return this._chiudi(state, 'vittoria');
    }
    // Limite Round raggiunto: esito automatico da Slancio.
    // NB: la morte la decide SOLO la Salute a 0 (intercettata sopra). Qui uno
    // Slancio molto negativo = sei stato battuto, non ucciso → 'sconfitta'.
    if (state.round >= state.roundMax) {
      if (state.slancio >=  this.SLANCIO_VITTORIA)  return this._chiudi(state, 'vittoria');
      if (state.slancio <=  this.SLANCIO_SCONFITTA) return this._chiudi(state, 'sconfitta');
      return this._chiudi(state, 'stallo');
    }
    return { state };
  },

  _tratto(enemy, t) { return !!(enemy && enemy.tratti && enemy.tratti.includes(t)); },

  /** Quanto valgono arma, armatura e scudo (Items: colpo, difesa); un oggetto sconosciuto vale come prima. */
  _valoreEquip(k) {
    const it = (n) => (n && typeof Items !== 'undefined' && Items.catalog && Items.catalog[n]) || null;
    const v = (slot, campo, base) => {
      const n = k.equip[slot];
      if (!n) return 0;
      const x = it(n);
      return x && x[campo] != null ? x[campo] : base;
    };
    return { arma: v('arma', 'colpo', 2), armatura: v('armatura', 'difesa', 1), scudo: v('scudo', 'difesa', 1) };
  },

  // Formula di Round (docs/COMBAT.md §5). G1 passo 5: l'arma dal catalogo (colpo) spinge lo Slancio, armatura e scudo
  // (difesa) riducono le ferite; il caso pesa di più (prima l'equipaggiamento decideva quasi da solo); danni per nemico.
  // Δ slancio = (vigoreEff - sfidaNemico) + rumore, fra −3 e +3.
  _formulaRound(state) {
    const k = state.knight, e = state.enemy;
    const vigore  = (k.forza.cur   / k.forza.max)   * 4;     // 0..4
    const volonta = (k.volonta.cur / k.volonta.max) * 2;     // 0..2
    const ferito  = (1 - k.salute.cur / k.salute.max) * 4;   // 0..4 malus
    const eq = this._valoreEquip(k);
    const terrenoBonus = this._terrenoBonus(state.terrain, e);
    // Possa del cavallo: bonus solo se in sella (vigore > 0). La carica perde
    // efficacia su terreni chiusi (foresta/palude/montagna): possa dimezzata.
    let cavalloBonus = 0;
    if (k.isMounted && k.isMounted() && k.cavallo) {
      const chiuso = (state.terrain === 2 || state.terrain === 4 || state.terrain === 5);
      cavalloBonus = chiuso ? Math.floor((k.cavallo.possa || 0) / 2) : (k.cavallo.possa || 0);
    }

    // L'arma spinge; armatura e scudo soprattutto parano (riducono le ferite, _ferisci), lo scudo spinge poco.
    const vigoreEff = vigore + volonta + eq.arma + eq.scudo * 0.5 + terrenoBonus + cavalloBonus - ferito;
    const sfida = (e.sfida != null) ? e.sfida : 4;
    const rumore = (Math.random() + Math.random() - 1) * 4;  // due dadi: ±4, più spesso vicino a 0

    let delta = Math.round(vigoreEff - sfida + rumore);
    delta = Math.max(-3, Math.min(3, delta));

    // Carica (primo Round): se non la reggi ti travolge, se la schivi guadagni terreno.
    if (state.round === 1 && this._tratto(e, 'carica')) {
      state.carica = delta >= 1 ? 'schivata' : 'subita';
      if (delta >= 1) delta = Math.min(3, delta + 1);
    }
    // Ferite: un Round perso male fa male; armatura e scudo assorbono una parte del colpo.
    let colpo = 0;
    if (state.carica === 'subita' && state.round === 1) colpo = 1;
    else if (delta <= -2) colpo = Math.random() < 0.8 ? 1 : 0;
    else if (delta === -1) colpo = Math.random() < 0.6 ? 0.5 : 0;
    else if (delta === 0) colpo = Math.random() < 0.35 ? 0.35 : 0;
    else if (delta === 1) colpo = Math.random() < 0.15 ? 0.25 : 0;   // anche vincendo, qualche graffio
    // Branco: da un fianco può sempre arrivare un morso (più piccolo).
    if (this._tratto(e, 'branco') && Math.random() < 0.3) colpo += 0.35;
    if (colpo > 0) this._ferisci(state, colpo);
    return delta;
  },

  /** Ferita di `quota` di un colpo pieno del nemico (enemy.danno, default 5–14), meno armatura e scudo (15 % per punto). */
  _ferisci(state, quota) {
    const d = state.enemy.danno || [5, 14];
    const pieno = d[0] + Math.random() * (d[1] - d[0]);
    const eq = this._valoreEquip(state.knight);
    const riduzione = Math.min(0.6, (eq.armatura + eq.scudo) * 0.15);
    const danno = Math.max(1, Math.round(pieno * quota * (1 - riduzione)));
    state.knight.danneggia(danno, 'salute');
    state.ferito = true;
    return danno;
  },

  _terrenoBonus(terrain, enemy) {
    // Affinità di terreno LEGGERE (±1): danno sapore, non decidono lo scontro.
    // Una bestia è più a suo agio fra gli alberi, il cavaliere in campo aperto.
    // Un nemico può dichiarare la propria affinità con enemy.terreni:
    //   { favorevole:[biomi], sfavorevole:[biomi] } — interpretati dal SUO
    //   punto di vista (favorevole al nemico = malus per il cavaliere).
    if (enemy.terreni) {
      if (enemy.terreni.favorevole  && enemy.terreni.favorevole.includes(terrain))  return -1;
      if (enemy.terreni.sfavorevole && enemy.terreni.sfavorevole.includes(terrain)) return  1;
      return 0;
    }
    // Default per archetipo se il nemico non specifica affinità.
    if (enemy.tipo === 'bestia' && terrain === 2 /*FORESTA*/) return -1;
    if (enemy.tipo === 'bestia' && terrain === 1 /*PIANURA*/) return  1;
    return 0;
  },

  _narraRound(state, delta) {
    const n = state.round;
    if (state.round === 1 && state.carica) {
      return state.carica === 'schivata' ? `${n}. Ti carica a testa bassa: ti scansi all'ultimo e lo colpisci al fianco.`
        : `${n}. Ti carica a testa bassa e ti travolge.`;
    }
    if (state.enemy.tipo === 'bestia') {
      if (delta >=  2) return `${n}. Lo colpisci in pieno: guaisce e arretra.`;
      if (delta ===  1) return `${n}. Lo tieni a distanza e lo ferisci.`;
      if (delta ===  0) return `${n}. Vi girate attorno, nessuno affonda.`;
      if (delta === -1) return `${n}. Ti salta addosso, cedi un passo.`;
      return                 `${n}. Zanne e artigli ti raggiungono.`;
    }
    if (delta >=  2) return `${n}. Colpo netto: il nemico arretra.`;
    if (delta ===  1) return `${n}. Affondi e guadagni terreno.`;
    if (delta ===  0) return `${n}. Lame che si misurano, nessuno cede.`;
    if (delta === -1) return `${n}. Il nemico ti incalza, cedi un passo.`;
    return                 `${n}. Colpo grave incassato.`;
  },

  // ─── Azioni speciali ────────────────────────────────────────────────────
  _tryFuga(state) {
    state.round++;
    this._avanzaCalendar(state);
    const k = state.knight;
    const chance = 0.35 + (k.volonta.cur / k.volonta.max) * 0.35
                       + this._terrenoBonus(state.terrain, state.enemy) * 0.05
                       - (this._tratto(state.enemy, 'veloce') ? 0.3 : 0);
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
    this._avanzaCalendar(state);
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
    this._avanzaCalendar(state);
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
    this._avanzaCalendar(state);
    state.knight.danneggia(8, 'salute');
    if (state.knight.salute.cur <= 0) {
      state.cronaca.push(`${state.round}. Tutto in un colpo: cadi con lui.`);
      return this._chiudi(state, 'morte');
    }
    state.slancio += 3;
    state.combattuto = true;
    state.cronaca.push(`${state.round}. Affondo disperato: ferito ma in vantaggio.`);
    if (state.round >= state.roundMax) {
      return this._chiudi(state, state.slancio > 0 ? 'vittoria' : 'sconfitta');
    }
    return this._dopoRound(state);
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

  // ─── Dopo lo scontro (G1 passo 4, decisioni dell'utente, docs/EARLY_GAME.md §7) ─
  // Durante la Veglia non si muore: a Salute 0 il garzone sviene e si risveglia
  // nel borgo, curato, con qualche ora persa e senza l'oro che aveva addosso.
  // Dopo l'investitura la morte è vera (il motore 3D mostra la schermata di morte).
  // Valori [DA BILANCIARE].
  SVENIMENTO: { minuti: 360, salute: 40 },

  /** Esito che conta per il gioco: 'morte' diventa 'svenuto' se `veglia`. */
  esitoFinale(esito, { veglia = false } = {}) {
    return (esito === 'morte' && veglia) ? 'svenuto' : esito;
  },

  /**
   * Svenimento della Veglia: passano SVENIMENTO.minuti (con il recupero di Forza
   * da fermi), la Salute torna almeno a SVENIMENTO.salute, l'oro addosso è perso.
   * Ritorna { oroPerso, minuti }. Non sposta il cavaliere (lo fa il motore 3D).
   */
  svieni(knight) {
    const k = knight || Knight;
    const S = this.SVENIMENTO;
    const oroPerso = k.oro;
    k.oro = 0;
    if (typeof Calendar !== 'undefined' && Calendar.avanzaMinuti) {
      Calendar.avanzaMinuti(S.minuti);
      if (typeof Events !== 'undefined' && Events.tickDeadlines) Events.tickDeadlines();
    }
    if (k.riposaPassi && typeof CALENDAR !== 'undefined') k.riposaPassi(S.minuti * 60 / CALENDAR.SECONDI_PER_PASSO);
    k.salute.cur = Math.min(k.salute.max, Math.max(k.salute.cur, S.salute));
    return { oroPerso, minuti: S.minuti };
  },

  // ─── Dopo lo scontro: veleno e prima battaglia (G1 passo 5) ─────────────
  /** Ciò che arriva dopo lo scontro: il veleno, se il nemico ha morso (mai fino a 0). Ritorna le righe da mostrare. */
  dopoScontro(state, esito) {
    const righe = [], e = state.enemy, k = state.knight;
    if (this._tratto(e, 'veleno') && state.ferito && esito !== 'morte' && esito !== 'svenuto') {
      const prima = k.salute.cur;
      k.salute.cur = Math.max(1, k.salute.cur - (e.veleno || 10));
      righe.push(`Il veleno brucia per ore: Salute −${Math.round(prima - k.salute.cur)}.`);
    }
    return righe;
  },
  /** Conta come «prima battaglia» (Knight.primaSangue) se si è davvero combattuto e se ne è usciti in piedi. */
  valeBattaglia(state, esito) {
    return !!state.combattuto && esito !== 'morte' && esito !== 'svenuto';
  },

  // ─── Incontri fuori porta (G1 passo 5, docs/EARLY_GAME.md §7) ──────────
  // Camminando (o cavalcando) fuori dai borghi, ogni tratto di strada fatta può portare un incontro con un animale
  // scelto per bioma e ora (Enemies: habitat, ore). Più spesso lontano dalle strade, di sera e di notte; in sella un
  // po' meno (il cavallo si sente da lontano). Il motore 3D chiama probIncontro sui metri fatti e, se capita,
  // pescaIncontro. Valori [DA BILANCIARE]: incontri per km lontano dalle strade, di giorno, a piedi.
  // sonno: probabilità di un incontro in una notte all'aperto, senza fuoco e accanto al fuoco (che tiene lontani i timidi).
  INCONTRI: { perKm: 0.35, strada: 0.3, sera: 1.6, notte: 2.2, sella: 0.6, borgo: 350, pausa: 400, sonno: { addiaccio: 0.25, fuoco: 0.08 } },

  /** Momento del giorno per gli incontri dall'ora canonica (0 Prima … 7 Lodi): giorno, sera (Vespri), notte. */
  momento(indice) { return indice <= 3 ? 'giorno' : indice === 4 ? 'sera' : 'notte'; },

  /** Probabilità che `metri` di cammino portino un incontro. */
  probIncontro(metri, { momento = 'giorno', suStrada = false, inSella = false } = {}) {
    const I = this.INCONTRI;
    const per = I.perKm * (suStrada ? I.strada : 1) * (momento === 'sera' ? I.sera : momento === 'notte' ? I.notte : 1)
      * (inSella ? I.sella : 1);
    return 1 - Math.exp(-per * metri / 1000);
  },

  /**
   * L'animale dell'incontro, pesato per habitat del bioma e ora; null se lì non vive niente. Nella Veglia, prima della
   * prima battaglia, niente bestie «forti» (orso, branco). `luce`: il cavaliere porta una torcia accesa (o dorme al
   * fuoco): gli animali timidi la evitano e non si fanno incontrare; i lupi, in branco o da soli, no.
   */
  pescaIncontro({ bioma = 1, momento = 'giorno', veglia = false, primaSangue = true, luce = false, rnd = Math.random } = {}) {
    if (typeof Enemies === 'undefined') return null;
    const b = bioma === 9 ? 1 : bioma;                       // lungo i fiumi: come in pianura
    const pool = [];
    let tot = 0;
    for (const e of Enemies.all()) {
      if (!e.habitat || !e.habitat[b]) continue;
      if (veglia && !primaSangue && e.forte) continue;
      if (luce && this._tratto(e, 'timido')) continue;
      const w = e.habitat[b] * (e.ore && e.ore[momento] != null ? e.ore[momento] : 1);
      if (w <= 0) continue;
      pool.push([e, w]);
      tot += w;
    }
    let r = rnd() * tot;
    for (const [e, w] of pool) { if ((r -= w) <= 0) return e; }
    return pool.length ? pool[pool.length - 1][0] : null;
  },

  /**
   * Probabilità di sottrarsi a un incontro prima che cominci. A piedi: facile con i timidi, difficile con i veloci.
   * In sella [approvato dall'utente, 28/11]: al galoppo si scappa sempre, tranne ai veloci (lupi, aquila),
   * che ci riescono una volta su due; al passo o al trotto il cavallo aiuta, ma i veloci raggiungono.
   */
  probSottrarsi(enemy, { inSella = false, galoppo = false } = {}) {
    const veloce = this._tratto(enemy, 'veloce'), timido = this._tratto(enemy, 'timido');
    if (inSella) return galoppo ? (veloce ? 0.5 : 1) : (veloce ? 0.3 : 0.8);
    return veloce ? 0.2 : timido ? 0.85 : 0.5;
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
