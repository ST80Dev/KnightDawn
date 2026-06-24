// FERRO & CENERE — Sistema eventi (Fase S3)
// Trigger di scene narrative durante il viaggio o nei luoghi, con scelte
// stile gamebook. Schema dati puro: la UI ("Carta del cronista") sta in
// game.js, l'aggancio al gameplay in travel/game.
//
// Modello dati
//   Event = {
//     id,                    // stringa unica
//     kind,                  // 'travel' | 'location' | 'poi'
//     title,                 // intestazione della carta
//     text,                  // corpo narrativo (può contenere "${nome}")
//     where,                 // per 'location': 'castle' | 'village' | 'keep'
//                            // per 'poi':      kind dello special ('rovine',
//                            //                 'tempio', 'cripta', ...)
//                            // per 'travel':   { biomes?: [int] }  filtro opzionale
//     weight,                // peso di selezione (default 1)
//     condition(ctx),        // opz. funzione → bool; ctx = { knight, world, meta }
//     once,                  // se true, dopo run viene contrassegnato in seenIds
//     options: [Option]      // 1-5 scelte
//   }
//   Option = {
//     text,                  // etichetta del pulsante
//     prereq(ctx),           // opz. funzione → bool. Falso = grigia/disabilitata
//     prereqLabel,           // opz. etichetta accanto al testo se prereq fallisce
//     effects: [Effect],     // applicati in ordine alla conferma
//     reply,                 // opz. breve testo che appare nella carta dopo la scelta
//                            // (prima della chiusura). Se assente → chiude subito.
//   }
//   Effect = (ctx) → void   o   oggetto descrittore { type, ... }
//
// Selezione: filtro per kind/where + condition → array; estrazione pesata
// (peso) + anti-ripetizione tramite seenIds (per 'once').

const Events = {
  registry: [],
  seenIds: new Set(),
  // Probabilità per Passo che un evento viaggio si attivi. Tieni basso —
  // sovrapposto a POI/strutture deve restare "carico ma non opprimente".
  TRAVEL_PROB_PER_STEP: 0.04,

  register(ev) { this.registry.push(ev); },

  reset() { this.seenIds = new Set(); },

  // Costruisce il contesto comune passato a condition/prereq/effects.
  _ctx(extra) {
    return Object.assign({
      knight: Knight,
      world:  World,
      meta:   (window.GameScreen ? GameScreen.meta : null),
    }, extra || {});
  },

  // Estrae un evento (o null) compatibile con i filtri.
  _pick(filterFn, extra) {
    const ctx = this._ctx(extra);
    const pool = [];
    let total = 0;
    for (const ev of this.registry) {
      if (!filterFn(ev)) continue;
      if (ev.once && this.seenIds.has(ev.id)) continue;
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

  // Tentativo: roll per evento di viaggio. Ritorna evento o null.
  rollTravel(biome) {
    if (Math.random() >= this.TRAVEL_PROB_PER_STEP) return null;
    return this._pick(ev =>
      ev.kind === 'travel' &&
      (!ev.where || !ev.where.biomes || ev.where.biomes.includes(biome))
    );
  },

  // Evento all'arrivo su una struttura (castle/village/keep).
  pickLocation(structureType, structure) {
    return this._pick(ev => ev.kind === 'location' && ev.where === structureType,
                      { structure });
  },

  // Evento all'esplorazione di un POI (per kind dello special).
  pickPOI(special) {
    return this._pick(ev => ev.kind === 'poi' && ev.where === special.kind,
                      { poi: special });
  },

  // Marca l'evento come visto (chiamato dopo la chiusura della carta).
  markSeen(ev) {
    if (ev && ev.once) this.seenIds.add(ev.id);
  },

  // ─── Applicazione effetti ─────────────────────────────────────────────────
  // Gli effetti possono essere funzioni (massima flessibilità) o oggetti
  // descrittori (più leggibili per i cataloghi). Ritorna un array di stringhe
  // di log da emettere in cronaca.
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
      case 'tempo':   if (typeof Calendar !== 'undefined') Calendar.avanza(eff.passi || 1); break;
      case 'log':     ctx.log(eff.text); break;
      case 'reputazione': {
        const r = Knight.reputazione.find(x => x.id === eff.id);
        if (r) r.val = clamp(r.val + eff.delta, -5, 5);
        break;
      }
    }
  },

  // ─── Save / load ─────────────────────────────────────────────────────────
  toJSON() { return { seen: [...this.seenIds] }; },
  fromJSON(data) {
    this.seenIds = new Set(Array.isArray(data && data.seen) ? data.seen : []);
  },
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ═══════════════════════════════════════════════════════════════════════════
// CATALOGO INIZIALE — Scheletro minimo testabile (S3)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Eventi di viaggio ────────────────────────────────────────────────────

Events.register({
  id: 'travel.viandante',
  kind: 'travel',
  title: 'Un viandante sulla strada',
  text: 'Un uomo magro avvolto in un mantello logoro ti viene incontro lungo il sentiero. Si appoggia a un bastone nodoso. «Pellegrino o ladro?» mormora, fissandoti.',
  weight: 2,
  options: [
    {
      text: 'Offrirgli del pane',
      prereq: ctx => ctx.knight.oro >= 1,
      prereqLabel: '(serve 1 oro)',
      effects: [
        { type: 'oro', delta: -1 },
        { type: 'onore', delta: 1 },
        { type: 'log', text: 'Il viandante ti benedice e prosegue.' },
      ],
      reply: 'Accetta in silenzio e ti benedice con un cenno del capo.',
    },
    {
      text: 'Interrogarlo sulla regione',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Il viandante parla di banditi nei boschi a est.' },
      ],
      reply: 'Parla a lungo, accennando a banditi annidati nei boschi a est.',
    },
    {
      text: 'Tirare oltre senza salutare',
      effects: [
        { type: 'onore', delta: -1 },
      ],
      reply: 'Lo sorpassi. Senti il suo sguardo addosso a lungo.',
    },
  ],
});

Events.register({
  id: 'travel.banditi',
  kind: 'travel',
  where: { biomes: [2, 3, 4, 10] }, // foresta, collina, montagna, roccia
  title: 'Imboscata',
  text: 'Tre figure emergono dai cespugli con coltelli sguainati. «La borsa, cavaliere, e proseguirai.»',
  weight: 1,
  options: [
    {
      text: 'Cedere l\'oro',
      prereq: ctx => ctx.knight.oro >= 3,
      prereqLabel: '(serve 3 oro)',
      effects: [
        { type: 'oro', delta: -3 },
        { type: 'onore', delta: -1 },
        { type: 'volonta', delta: -5 },
      ],
      reply: 'Getti la borsa. I banditi spariscono nella macchia.',
    },
    {
      text: 'Sguainare la spada',
      effects: [
        { type: 'salute', delta: -12 },
        { type: 'forza',  delta: -8 },
        { type: 'reputazione', id: 'banditi', delta: -1 },
        { type: 'log', text: 'Hai respinto i banditi a colpi di lama.' },
      ],
      reply: 'Lo scontro è breve e brutale. Due cadono, il terzo fugge zoppicando.',
    },
    {
      text: 'Tentare di parlare',
      prereq: ctx => ctx.knight.onore >= 0,
      prereqLabel: '(richiede Onore ≥ 0)',
      effects: [
        { type: 'volonta', delta: -3 },
      ],
      reply: 'La tua compostezza li disorienta. Si scambiano un\'occhiata e arretrano.',
    },
  ],
});

Events.register({
  id: 'travel.scoperta_erbe',
  kind: 'travel',
  title: 'Erbe selvatiche',
  where: { biomes: [2, 5] }, // foresta, palude
  text: 'Tra le radici scorgi un cespo di erbe medicinali, già pronte da cogliere.',
  weight: 1,
  options: [
    {
      text: 'Raccoglierle',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'salute', delta: 8 },
        { type: 'log', text: 'Mastichi le erbe lungo il cammino. Ti senti meglio.' },
      ],
      reply: 'Le strappi con cura, mastichi qualche foglia amara.',
    },
    {
      text: 'Lasciarle dove sono',
      effects: [],
      reply: 'Passi oltre. Forse un altro pellegrino ne avrà più bisogno.',
    },
  ],
});

Events.register({
  id: 'travel.tempesta',
  kind: 'travel',
  title: 'Tempesta improvvisa',
  text: 'Il cielo si oscura. Pioggia fitta e vento gelido ti investono. Il sentiero diventa fango.',
  weight: 1,
  options: [
    {
      text: 'Cercare riparo e attendere',
      effects: [
        { type: 'tempo', passi: 2 },
        { type: 'forza', delta: 8 },
      ],
      reply: 'Ti accuccii sotto un masso. Quando spiove, sei stanco ma asciutto.',
    },
    {
      text: 'Proseguire nonostante tutto',
      effects: [
        { type: 'forza', delta: -10 },
        { type: 'volonta', delta: -3 },
      ],
      reply: 'Cammini ore tra acqua e vento. Le ossa ti fanno male.',
    },
  ],
});

// ─── Scene di luogo ───────────────────────────────────────────────────────

Events.register({
  id: 'loc.castello.udienza',
  kind: 'location',
  where: 'castle',
  title: 'Udienza al castello',
  text: 'Un siniscalco severo ti guarda dall\'alto degli scalini. «Il signore concede udienza solo a chi ha qualcosa da dire o da offrire.»',
  options: [
    {
      text: 'Chiedere ospitalità',
      prereq: ctx => ctx.knight.onore >= 0,
      prereqLabel: '(serve Onore ≥ 0)',
      effects: [
        { type: 'forza', delta: 30 },
        { type: 'salute', delta: 5 },
        { type: 'tempo', passi: 3 },
      ],
      reply: 'Sei accolto in sala. Una cena calda e un giaciglio asciutto ti restituiscono le forze.',
    },
    {
      text: 'Offrire i propri servigi',
      effects: [
        { type: 'oro', delta: 5 },
        { type: 'reputazione', id: 'vorn', delta: 1 },
        { type: 'tempo', passi: 5 },
      ],
      reply: 'Il signore ti affida una commissione. Al ritorno ti dà 5 monete.',
    },
    {
      text: 'Andarsene in silenzio',
      effects: [],
      reply: 'Volti le spalle alle mura. Forse non era il momento.',
    },
  ],
});

Events.register({
  id: 'loc.villaggio.mercante',
  kind: 'location',
  where: 'village',
  title: 'Voci di mercato',
  text: 'Al banco di un mercante itinerante si discute a voce alta. Un anziano ti scruta da dietro una bancarella di tessuti.',
  options: [
    {
      text: 'Ascoltare le voci',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Si dice che i lupi siano scesi a nord, oltre le colline.' },
      ],
      reply: 'I contadini parlano di lupi numerosi a nord, mai visti così vicini.',
    },
    {
      text: 'Comprare provviste',
      prereq: ctx => ctx.knight.oro >= 2,
      prereqLabel: '(serve 2 oro)',
      effects: [
        { type: 'oro', delta: -2 },
        { type: 'forza', delta: 20 },
      ],
      reply: 'Carico la bisaccia di pane e formaggio. Mangerai a sufficienza per giorni.',
    },
    {
      text: 'Andare oltre',
      effects: [],
      reply: 'Lasci il mercato senza fermarti. Le voci ti seguono per un poco.',
    },
  ],
});

Events.register({
  id: 'loc.keep.guardia',
  kind: 'location',
  where: 'keep',
  title: 'Posto di guardia',
  text: 'Due soldati stanchi presidiano la torre. Ti studiano con sospetto, mani vicine alle else.',
  options: [
    {
      text: 'Dichiararsi e mostrarsi pacifico',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Le guardie ti lasciano passare borbottando.' },
      ],
      reply: 'Annuiscono di malavoglia. Almeno non ti fermano.',
    },
    {
      text: 'Chiedere notizie della regione',
      effects: [
        { type: 'tempo', passi: 2 },
        { type: 'log', text: 'Le guardie raccontano di disertori nelle paludi a sud.' },
      ],
      reply: 'Uno dei due si scioglie e parla di disertori visti nelle paludi a sud.',
    },
  ],
});

// ─── Scene POI ────────────────────────────────────────────────────────────

Events.register({
  id: 'poi.rovine',
  kind: 'poi',
  where: 'rovine',
  title: 'Tra le pietre cadute',
  text: 'I muri sbriciolati di una costruzione antica emergono dall\'erba. Mussolini di edera coprono lapidi illeggibili.',
  options: [
    {
      text: 'Frugare nei detriti',
      effects: [
        { type: 'tempo', passi: 2 },
        { type: 'forza', delta: -5 },
        { type: 'oro', delta: 3 },
        { type: 'log', text: 'Tra i sassi raccogli qualche moneta antica.' },
      ],
      reply: 'Sotto una pietra crollata luccicano tre monete consunte.',
    },
    {
      text: 'Riflettere sul passato del luogo',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'volonta', delta: 4 },
      ],
      reply: 'Resti fermo a lungo. Il silenzio ti ricompone.',
    },
  ],
});

Events.register({
  id: 'poi.cripta',
  kind: 'poi',
  where: 'cripta',
  title: 'Scalini nel buio',
  text: 'Una scala di pietra scende sotto terra. Dal fondo sale un odore di muffa antica.',
  options: [
    {
      text: 'Scendere con la lanterna',
      effects: [
        { type: 'tempo', passi: 3 },
        { type: 'salute', delta: -6 },
        { type: 'volonta', delta: -4 },
        { type: 'oro', delta: 6 },
        { type: 'log', text: 'Sotto, nella cripta, hai trovato un piccolo tesoro funebre.' },
      ],
      reply: 'Discendi. Un sarcofago aperto custodisce un anello d\'argento.',
    },
    {
      text: 'Allontanarsi',
      effects: [],
      reply: 'Non oggi. Risali e ti rimetti in cammino.',
    },
  ],
});

Events.register({
  id: 'poi.tempio',
  kind: 'poi',
  where: 'tempio',
  title: 'Tempio dimenticato',
  text: 'Pilastri spezzati delimitano uno spazio sacro. Al centro, una pietra d\'altare ancora intera, segnata da rune incise a mano.',
  options: [
    {
      text: 'Pregare all\'altare',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'volonta', delta: 8 },
        { type: 'onore', delta: 1 },
      ],
      reply: 'Ti inginocchi. Quando ti rialzi, la mente è più chiara.',
    },
    {
      text: 'Studiare le rune',
      effects: [
        { type: 'tempo', passi: 2 },
        { type: 'log', text: 'Le rune parlano di un giuramento spezzato secoli fa.' },
      ],
      reply: 'I segni narrano di un giuramento infranto, di un re privato del nome.',
    },
  ],
});
