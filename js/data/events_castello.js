// Knight Dawn — Eventi delle aree del castello (Layout L1, vista cortile)
// Raggiunti cliccando un edificio del cortile in modalità VISITA
// (js/castle.js → Events.pickArea('castle', area)). Schema where:
//   { struttura:'castle', area:'X' }  → area specifica del castello
//   { edificio:'X' }                  → edificio condiviso (riutilizzabile)
// Ripetibili. Vedi docs/EVENTS.md e GRAFICA.md §2b.

Events.register({
  id: 'loc.area.salatrono',
  kind: 'location',
  where: { struttura: 'castle', area: 'salatrono' },
  title: 'Sala del trono',
  text: 'Il siniscalco ti annuncia. Dal seggio, il signore del castello ti misura con lo sguardo: «Cosa porti, cavaliere?»',
  tone: 'drammatico', portata: 'notevole',
  options: [
    {
      text: 'Offrire i propri servigi',
      effects: [
        { type: 'oro', delta: 5 },
        { type: 'reputazione', id: 'vorn', delta: 1 },
        { type: 'tempo', passi: 4 },
      ],
      reply: 'Il signore ti affida una commissione e ti ricompensa con cinque monete.',
    },
    {
      text: 'Chiedere ospitalità',
      prereq: ctx => ctx.knight.onore >= 0,
      prereqLabel: '(Onore ≥ 0)',
      effects: [
        { type: 'forza', delta: 30 },
        { type: 'salute', delta: 5 },
        { type: 'tempo', passi: 3 },
      ],
      reply: 'Sei accolto in sala: cena calda e giaciglio asciutto ti restituiscono le forze.',
    },
    { text: 'Congedarsi', effects: [], reply: 'Ti inchini e lasci la sala.' },
  ],
});

Events.register({
  id: 'loc.edificio.taverna',
  kind: 'location',
  where: { edificio: 'taverna' },
  title: 'Taverna',
  text: 'Fumo, boccali e voci accavallate. Un posto buono per scaldarsi e tendere l\'orecchio.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Bere e riposare',
      prereq: ctx => ctx.knight.oro >= 1,
      prereqLabel: '(1 oro)',
      effects: [
        { type: 'oro', delta: -1 },
        { type: 'forza', delta: 15 },
        { type: 'volonta', delta: 5 },
        { type: 'tempo', passi: 2 },
      ],
      reply: 'Un boccale e una panca: per un poco il mondo è meno aspro.',
    },
    {
      text: 'Origliare le voci',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Si parla di banditi sulle strade del Sud e di un torneo in primavera.' },
      ],
      reply: 'Tra una bevuta e l\'altra raccogli più di una voce utile.',
    },
    { text: 'Uscire', effects: [], reply: 'Lasci la taverna.' },
  ],
});

Events.register({
  id: 'loc.edificio.stalla',
  kind: 'location',
  where: { edificio: 'stalla' },
  title: 'Stalla',
  text: 'Odore di fieno e cuoio. Gli stallieri si occupano delle bestie; c\'è acqua fresca e una mangiatoia.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Far riposare e abbeverare il cavallo',
      prereq: ctx => !!ctx.knight.cavallo,
      prereqLabel: '(serve un cavallo)',
      effects: [
        ctx => {
          if (Knight.cavallo) {
            Knight.cavallo.vigore = Knight.cavallo.vigoreMax;
            ctx.log(Knight.cavallo.nome + ' è riposato e abbeverato: vigore pieno.');
          }
        },
        { type: 'tempo', passi: 2 },
      ],
      reply: 'Lasci la tua bestia alle cure degli stallieri. Ne uscirà fresca.',
    },
    {
      text: 'Chiedere delle strade',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Gli stallieri dicono che il passo a nord è ancora aperto, ma non per molto.' },
      ],
      reply: 'Chi cura i cavalli conosce le strade meglio di molti.',
    },
    { text: 'Uscire', effects: [], reply: 'Lasci la stalla.' },
  ],
});

Events.register({
  id: 'loc.edificio.cappella',
  kind: 'location',
  where: { edificio: 'cappella' },
  title: 'Cappella',
  text: 'Una penombra di candele e pietra. Il silenzio qui dentro pesa e consola insieme.',
  tone: 'contemplativo', portata: 'marginale',
  options: [
    {
      text: 'Raccogliersi in preghiera',
      effects: [
        { type: 'volonta', delta: 12 },
        { type: 'tempo', passi: 2 },
      ],
      reply: 'Inginocchiato nel silenzio, ritrovi un filo di pace e fermezza.',
    },
    { text: 'Uscire', effects: [], reply: 'Esci nella luce del cortile.' },
  ],
});

Events.register({
  id: 'loc.area.cortile',
  kind: 'location',
  where: { struttura: 'castle', area: 'cortile' },
  title: 'Cortile del castello',
  text: 'Servi, soldati e mercanti si muovono tra i banchi. C\'è sempre qualcosa da osservare, per chi sa guardare.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Guardarti intorno',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'log', text: 'Cogli frammenti di pettegolezzi di corte: alleanze che si incrinano, debiti non pagati.' },
      ],
      reply: 'Un occhio attento, nel cortile di un castello, raccoglie più di una spada.',
    },
    { text: 'Tornare', effects: [], reply: 'Resti un momento, poi ti volti.' },
  ],
});
