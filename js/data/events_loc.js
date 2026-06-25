// Knight Dawn — Catalogo eventi di luogo
// Scene narrative all'arrivo in strutture (castle/village/keep) e — in
// futuro — al click su edifici/aree dentro il layout L1 (taverna, fabbro,
// cappella, sala del trono, scriptorium, …).
//
// Schema where:
//   - legacy stringa  ('castle'|'village'|'keep')   — fallback intera struttura
//   - { struttura, area }                            — area unica di una struttura
//   - { edificio }                                   — edificio condiviso L1
// Vedi docs/EVENTS.md per dettagli e linee guida.

Events.register({
  id: 'loc.castello.udienza',
  kind: 'location',
  where: 'castle',
  title: 'Udienza al castello',
  text: 'Un siniscalco severo ti guarda dall\'alto degli scalini. «Il signore concede udienza solo a chi ha qualcosa da dire o da offrire.»',
  tone: 'drammatico',
  portata: 'notevole',
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
  id: 'loc.castello.mercato',
  kind: 'location',
  where: 'castle',
  // Solo da cavaliere investito: durante la Veglia il mercato si raggiunge
  // dall'hub del garzone (vedi events_veglia.js).
  condition: () => !(typeof Calendar !== 'undefined' && Calendar.inVeglia),
  weight: 2,
  title: 'Il mercato del castello',
  text: 'Sotto i portici, armaioli e rigattieri espongono ferro vecchio e nuovo. Un banco tratta usato d\'ogni sorta: si compra e si vende.',
  tone: 'neutro',
  portata: 'marginale',
  options: [
    {
      text: 'Visitare il mercato',
      effects: [
        () => {
          if (typeof GameScreen !== 'undefined' && GameScreen.openMarket) GameScreen.openMarket();
        },
      ],
    },
    {
      text: 'Tirare dritto',
      effects: [],
      reply: 'Lasci i banchi alle spalle. Avrai altre occasioni.',
    },
  ],
});

Events.register({
  id: 'loc.villaggio.mercante',
  kind: 'location',
  where: 'village',
  title: 'Voci di mercato',
  text: 'Al banco di un mercante itinerante si discute a voce alta. Un anziano ti scruta da dietro una bancarella di tessuti.',
  tone: 'neutro',
  portata: 'marginale',
  options: [
    {
      text: 'Ascoltare le voci',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'news', tipo: 'voce', tag: 'lupi.nord',
          testo: 'Lupi scesi a nord, oltre le colline.' },
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
  tone: 'neutro',
  portata: 'marginale',
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
        { type: 'news', tipo: 'voce', tag: 'disertori.paludi_sud',
          testo: 'Disertori avvistati nelle paludi a sud.' },
        { type: 'log', text: 'Le guardie raccontano di disertori nelle paludi a sud.' },
      ],
      reply: 'Uno dei due si scioglie e parla di disertori visti nelle paludi a sud.',
    },
  ],
});
