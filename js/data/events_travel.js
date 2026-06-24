// FERRO & CENERE — Catalogo eventi di viaggio
// Tutti gli eventi che scattano lungo il cammino, filtrati per bioma.
// Target di volumi: ~8 per bioma × 13 biomi (vedi docs/EVENTS.md).
// Schema e linee guida autoriali in docs/EVENTS.md.

Events.register({
  id: 'travel.viandante',
  kind: 'travel',
  title: 'Un viandante sulla strada',
  text: 'Un uomo magro avvolto in un mantello logoro ti viene incontro lungo il sentiero. Si appoggia a un bastone nodoso. «Pellegrino o ladro?» mormora, fissandoti.',
  weight: 2,
  tone: 'neutro',
  portata: 'marginale',
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
        { type: 'news', tipo: 'voce', tag: 'banditi.boschi_est',
          testo: 'Banditi annidati nei boschi a est.', faction: 'banditi' },
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
  tone: 'drammatico',
  portata: 'notevole',
  cooldown: 40,
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
  tone: 'contemplativo',
  portata: 'marginale',
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
  tone: 'brutale',
  portata: 'notevole',
  cooldown: 50,
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
