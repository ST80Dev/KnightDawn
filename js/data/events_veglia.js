// FERRO & CENERE — Catalogo eventi della Veglia (garzone di stalla)
// Hub iniziale del prologo: il cavaliere è ancora un garzone al castello.
// Si apre con il pulsante INTERAGISCI ed è ripetibile finché dura la Veglia
// (Calendar.inVeglia). Ogni lavoro rende poche monete e consuma giorni; con
// abbastanza oro ci si presenta all'investitura, che chiude la Veglia e
// promuove il cavaliere a Errante. Vedi docs/EARLY_GAME.md.
//
// L'evento è pescato per id (Events.getById('veglia.castello')), non dal
// pescaggio casuale: la condition lo tiene comunque fuori dai luoghi una volta
// finita la Veglia.

// Oro necessario per farsi armare ed essere investiti cavaliere.
// [DA BILANCIARE] insieme alle paghe dei lavori (vedi EARLY_GAME.md §5).
const VEGLIA_SOGLIA_INVESTITURA = 12;

Events.register({
  id: 'veglia.castello',
  kind: 'location',
  where: 'castle',
  condition: () => (typeof Calendar !== 'undefined' && Calendar.inVeglia),
  cooldown: 0,
  title: 'Al servizio del castello',
  text: 'Il cortile odora di paglia e fumo. Sei un garzone tra i garzoni: ' +
        'nessuno ti deve nulla, ma c\'è sempre lavoro per chi ha braccia. ' +
        'Qualche moneta onesta, e il resto verrà.',
  tone: 'contemplativo',
  portata: 'notevole',
  options: [
    {
      text: 'Strigliare e accudire i cavalli',
      effects: [
        { type: 'oro', delta: 2 },
        { type: 'forza', delta: -6 },
        { type: 'tempo', passi: 2 },
      ],
      reply: 'Passi la giornata tra criniere e zoccoli. Impari a leggere un ' +
             'cavallo con uno sguardo — ti servirà. Due monete nella scarsella.',
    },
    {
      text: 'Sbrigare commissioni nel borgo',
      effects: [
        { type: 'oro', delta: 1 },
        { type: 'forza', delta: -3 },
        { type: 'tempo', passi: 1 },
      ],
      reply: 'Pacchi da portare, acqua da attingere, messaggi da recapitare. ' +
             'Lavoro umile, una moneta sicura.',
    },
    {
      text: 'Servire alla taverna e origliare',
      effects: [
        { type: 'oro', delta: 1 },
        { type: 'tempo', passi: 2 },
        { type: 'log', text: 'Si dice che a oriente, tra le rovine, qualcosa si muova.' },
      ],
      reply: 'Tra un boccale e l\'altro raccogli mance e voci. Le seconde, ' +
             'a volte, valgono più delle prime.',
    },
    {
      text: 'Allenarti col maestro d\'armi',
      effects: [
        { type: 'volonta', delta: 4 },
        { type: 'forza', delta: -8 },
        { type: 'tempo', passi: 2 },
      ],
      reply: 'Il vecchio maestro ti concede un\'ora di legno e sudore. ' +
             'Le mani imparano, lo spirito si tempra.',
    },
    {
      text: 'Presentarti per l\'investitura',
      prereq: ctx => ctx.knight.oro >= VEGLIA_SOGLIA_INVESTITURA,
      prereqLabel: '(servono ' + VEGLIA_SOGLIA_INVESTITURA + ' oro)',
      effects: [
        ctx => {
          // Paghi la tua stessa armatura: un garzone si arma da sé.
          Knight.oro = Math.max(0, Knight.oro - 10);
          // Chiude la Veglia → Prima Era · Passo 1.
          if (typeof Calendar !== 'undefined' && Calendar.fineVeglia) Calendar.fineVeglia();
          // Promozione di rango e primo equipaggiamento cerimoniale.
          Knight.titolo = 'Cavaliere Errante';
          Knight.rango  = 'errante';
          Knight.equip.arma     = Knight.equip.arma     || 'Spada da arme';
          Knight.equip.armatura = Knight.equip.armatura || 'Giaco di cuoio';
          Knight.equip.viaggio  = Knight.equip.viaggio  || 'Mantello da viandante';
          const r = Knight.reputazione.find(x => x.id === 'vorn');
          if (r) r.val = Math.min(5, r.val + 1);
          ctx.log('Ti rialzi cavaliere. La Veglia è finita: ora i cronisti ti registrano.');
        },
      ],
      reply: 'In ginocchio nella cappella, la lama piatta sulle spalle. ' +
             'Ti rialzi con un nome che pesa e una strada davanti. ' +
             'Il castello non è più la tua casa: il mondo lo è.',
    },
    {
      text: 'Smettere per ora',
      effects: [],
      reply: 'Ti concedi un momento di respiro. Il lavoro aspetterà.',
    },
  ],
});
