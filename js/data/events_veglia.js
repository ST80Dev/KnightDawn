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

// Soglie della Veglia [DA BILANCIARE] (vedi EARLY_GAME.md §2-§3).
// L'investitura ora richiede TRE cose: rango scudiero, prima battaglia e oro.
const VEGLIA_SOGLIA_INVESTITURA = 10;   // oro per farsi armare
const VEGLIA_SOGLIA_ADDESTRAMENTO = 3;  // sessioni col maestro → scudiero
// Nemici facili per la prima battaglia fuori porta (catalogo js/data/enemies.js).
const VEGLIA_NEMICI = ['bestie.lupo', 'banditi.ladro'];

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
        ctx => {
          Knight.addestramento = (Knight.addestramento || 0) + 1;
          if (Knight.rango === 'garzone' && Knight.addestramento >= VEGLIA_SOGLIA_ADDESTRAMENTO) {
            Knight.promuovi('scudiero');
            ctx.log('Il maestro d\'armi ti riconosce: da oggi sei uno scudiero.');
          } else if (Knight.rango === 'garzone') {
            ctx.log('Addestramento ' + Knight.addestramento + '/' + VEGLIA_SOGLIA_ADDESTRAMENTO + '.');
          }
        },
      ],
      reply: 'Il vecchio maestro ti concede un\'ora di legno e sudore. ' +
             'Le mani imparano, lo spirito si tempra.',
    },
    {
      text: 'Accettare un incarico fuori porta',
      // Solo da scudiero: la tua prima vera battaglia (gate dell'investitura).
      prereq: ctx => ctx.knight.rango !== 'garzone',
      prereqLabel: '(da scudiero)',
      effects: [
        { type: 'forza', delta: -10 },   // a piedi, lento: il tragitto stanca
        { type: 'tempo', passi: 3 },
        () => {
          if (typeof GameScreen === 'undefined' || !GameScreen.openCombat) return;
          const id = VEGLIA_NEMICI[(Math.random() * VEGLIA_NEMICI.length) | 0];
          GameScreen.openCombat(id, {
            onEnd: (esito) => {
              if (esito === 'vittoria') {
                Knight.oro += 5;
                Knight.primaSangue = true;
                GameScreen._logEvent('Hai avuto la meglio: 5 monete e la tua prima vittoria.');
              } else if (esito === 'sconfitta') {
                Knight.primaSangue = true;
                GameScreen._logEvent('Battuto ma vivo: ora sai cos\'è una battaglia.');
              } else {
                GameScreen._logEvent('Ti sei sottratto allo scontro. Nessuna gloria, oggi.');
              }
            },
          });
        },
      ],
      // Nessun reply: la Carta si chiude e parte la scena di combattimento.
    },
    {
      text: 'Visitare il mercato',
      effects: [
        () => {
          if (typeof GameScreen !== 'undefined' && GameScreen.openMarket) GameScreen.openMarket();
        },
      ],
      // Nessun reply: la Carta si chiude e si apre l'overlay mercato.
    },
    {
      text: 'Presentarti per l\'investitura',
      // Tre requisiti: scudiero (addestrato), prima battaglia, oro per armarti.
      prereq: ctx => ctx.knight.rango !== 'garzone'
                  && ctx.knight.primaSangue
                  && ctx.knight.oro >= VEGLIA_SOGLIA_INVESTITURA,
      prereqLabel: '(scudiero · 1ª battaglia · ' + VEGLIA_SOGLIA_INVESTITURA + ' oro)',
      effects: [
        ctx => {
          // Paghi la tua stessa armatura: uno scudiero si arma da sé.
          Knight.oro = Math.max(0, Knight.oro - VEGLIA_SOGLIA_INVESTITURA);
          // Chiude la Veglia → Prima Era · Passo 1.
          if (typeof Calendar !== 'undefined' && Calendar.fineVeglia) Calendar.fineVeglia();
          // Promozione di rango (+ bonus cap) e primo equipaggiamento cerimoniale.
          Knight.promuovi('errante');
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
