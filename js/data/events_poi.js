// FERRO & CENERE — Catalogo eventi POI
// Scene narrative all'esplorazione delle zone speciali agli estremi del
// mondo (rovine, tempio, monolite, relitto, cripta, faro, santuario,
// voragine). Target volumi: ~5 per kind (vedi docs/EVENTS.md).

Events.register({
  id: 'poi.rovine',
  kind: 'poi',
  where: 'rovine',
  title: 'Tra le pietre cadute',
  text: 'I muri sbriciolati di una costruzione antica emergono dall\'erba. Mussolini di edera coprono lapidi illeggibili.',
  tone: 'contemplativo',
  portata: 'marginale',
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
  tone: 'drammatico',
  portata: 'notevole',
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
  tone: 'poetico',
  portata: 'notevole',
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
        { type: 'news', tipo: 'voce', tag: 'giuramento.spezzato',
          testo: 'Antico giuramento spezzato, un re privato del nome.' },
        { type: 'log', text: 'Le rune parlano di un giuramento spezzato secoli fa.' },
      ],
      reply: 'I segni narrano di un giuramento infranto, di un re privato del nome.',
    },
  ],
});
