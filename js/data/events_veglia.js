// Knight Dawn — Catalogo eventi della Veglia (garzone di stalla)
// Un evento per EDIFICIO del cortile (vedi js/castle.js, vista Livello 1 di
// docs/GRAFICA.md §2b). Recandosi a un edificio si apre la sua Carta del
// cronista (Livello 2). Ripetibili finché dura la Veglia (Calendar.inVeglia).
// Gli eventi sono aperti per id (Events.getById), non dal pescaggio casuale.
//
// Arco della Veglia (docs/EARLY_GAME.md): lavori per oro → sala d'armi fino a
// Scudiero → portale per la prima battaglia → cappella per l'investitura, che
// chiude la Veglia e promuove a Cavaliere Errante.

// Soglie [DA BILANCIARE].
const VEGLIA_SOGLIA_INVESTITURA = 10;   // oro per farsi armare
const VEGLIA_SOGLIA_ADDESTRAMENTO = 3;  // sessioni col maestro → scudiero
const VEGLIA_NEMICI = ['bestie.lupo', 'banditi.ladro'];

const _vegliaCond = () => (typeof Calendar !== 'undefined' && Calendar.inVeglia);

// ─── Stalla ──────────────────────────────────────────────────────────────────
Events.register({
  id: 'veglia.stalla', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'La stalla',
  text: 'Odore di paglia e di cavallo. I box vanno puliti, le bestie strigliate e nutrite. Lavoro di braccia, paga onesta.',
  tone: 'contemplativo', portata: 'marginale',
  options: [
    {
      text: 'Strigliare e accudire i cavalli',
      effects: [ { type: 'oro', delta: 2 }, { type: 'forza', delta: -6 }, { type: 'tempo', passi: 2 } ],
      reply: 'Passi la giornata tra criniere e zoccoli. Impari a leggere un cavallo con uno sguardo — ti servirà. Due monete nella scarsella.',
    },
    { text: 'Tornare nel cortile', effects: [] },
  ],
});

// ─── Cortile / borgo ─────────────────────────────────────────────────────────
Events.register({
  id: 'veglia.cortile', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'Il cortile',
  text: 'Carri da scaricare, secchi d\'acqua da portare, messaggi da recapitare nel borgo. Nessuno ringrazia, ma qualche moneta gira.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Sbrigare commissioni',
      effects: [ { type: 'oro', delta: 1 }, { type: 'forza', delta: -3 }, { type: 'tempo', passi: 1 } ],
      reply: 'Pacchi, acqua, messaggi. Lavoro umile, una moneta sicura.',
    },
    { text: 'Lasciar perdere', effects: [] },
  ],
});

// ─── Taverna ─────────────────────────────────────────────────────────────────
Events.register({
  id: 'veglia.taverna', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'La taverna',
  text: 'Fumo, boccali e lingue sciolte. Chi serve ai tavoli raccoglie mance — e, a volte, voci che valgono più delle mance.',
  tone: 'ironico', portata: 'marginale',
  options: [
    {
      text: 'Servire e origliare',
      effects: [
        { type: 'oro', delta: 1 }, { type: 'tempo', passi: 2 },
        { type: 'log', text: 'Si dice che a oriente, tra le rovine, qualcosa si muova.' },
      ],
      reply: 'Tra un boccale e l\'altro raccogli mance e dicerie. Le seconde, a volte, valgono più delle prime.',
    },
    { text: 'Tornare al lavoro', effects: [] },
  ],
});

// ─── Sala d'armi (maestro → scudiero) ────────────────────────────────────────
Events.register({
  id: 'veglia.saladarmi', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: "La sala d'armi",
  text: 'Il vecchio maestro d\'armi squadra i garzoni con disprezzo paziente. Chi ha fegato impara a reggere una lama di legno — e forse, un giorno, una vera.',
  tone: 'drammatico', portata: 'notevole',
  options: [
    {
      text: 'Allenarti col maestro d\'armi',
      effects: [
        { type: 'volonta', delta: 4 }, { type: 'forza', delta: -8 }, { type: 'tempo', passi: 2 },
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
      reply: 'Un\'ora di legno e sudore. Le mani imparano, lo spirito si tempra.',
    },
    { text: 'Riporre la spada di legno', effects: [] },
  ],
});

// ─── Armeria / mercato ───────────────────────────────────────────────────────
Events.register({
  id: 'veglia.mercato', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'L\'armeria',
  text: 'Banchi di armaioli e rigattieri sotto il portico: ferro vecchio e nuovo, cuoio, e qualche cavallo da vendere. Si compra e si vende.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Sfogliare le mercanzie',
      effects: [ () => { if (typeof GameScreen !== 'undefined' && GameScreen.openMarket) GameScreen.openMarket(); } ],
      // Nessun reply: la Carta si chiude e si apre l'overlay mercato.
    },
    { text: 'Solo dare un\'occhiata', effects: [] },
  ],
});

// ─── Portale / uscita (incarico fuori porta → prima battaglia) ───────────────
Events.register({
  id: 'veglia.portale', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'Il portale',
  text: 'Oltre il ponte levatoio si apre la strada. C\'è sempre qualche guaio nei dintorni per cui un castello cerca braccia armate — e una paga.',
  tone: 'drammatico', portata: 'notevole',
  options: [
    {
      text: 'Accettare un incarico fuori porta',
      prereq: ctx => ctx.knight.rango !== 'garzone',
      prereqLabel: '(da scudiero)',
      effects: [
        { type: 'forza', delta: -10 }, { type: 'tempo', passi: 3 },
        () => {
          if (typeof GameScreen === 'undefined' || !GameScreen.openCombat) return;
          const id = VEGLIA_NEMICI[(Math.random() * VEGLIA_NEMICI.length) | 0];
          GameScreen.openCombat(id, {
            onEnd: (esito) => {
              if (esito === 'vittoria') {
                Knight.oro += 5; Knight.primaSangue = true;
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
      // Nessun reply: parte la scena di combattimento.
    },
    { text: 'Restare entro le mura', effects: [] },
  ],
});

// ─── Cappella (investitura → fine Veglia) ────────────────────────────────────
Events.register({
  id: 'veglia.cappella', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'La cappella',
  text: 'Candele, pietra fredda e il silenzio dei voti. È qui che gli scudieri degni vengono fatti cavalieri — quando sono pronti, e quando possono armarsi.',
  tone: 'poetico', portata: 'svolta',
  options: [
    {
      text: 'Presentarti per l\'investitura',
      prereq: ctx => ctx.knight.rango !== 'garzone'
                  && ctx.knight.primaSangue
                  && ctx.knight.oro >= VEGLIA_SOGLIA_INVESTITURA,
      prereqLabel: '(scudiero · 1ª battaglia · ' + VEGLIA_SOGLIA_INVESTITURA + ' oro)',
      effects: [
        ctx => {
          Knight.oro = Math.max(0, Knight.oro - VEGLIA_SOGLIA_INVESTITURA);
          if (typeof Calendar !== 'undefined' && Calendar.fineVeglia) Calendar.fineVeglia();
          Knight.promuovi('errante');
          Knight.equip.arma     = Knight.equip.arma     || 'Spada da arme';
          Knight.equip.armatura = Knight.equip.armatura || 'Giaco di cuoio';
          Knight.equip.viaggio  = Knight.equip.viaggio  || 'Mantello da viandante';
          const r = Knight.reputazione.find(x => x.id === 'vorn');
          if (r) r.val = Math.min(5, r.val + 1);
          ctx.log('Ti rialzi cavaliere. La Veglia è finita: ora i cronisti ti registrano.');
        },
      ],
      reply: 'In ginocchio nella cappella, la lama piatta sulle spalle. Ti rialzi con un nome che pesa e una strada davanti. Il castello non è più la tua casa: il mondo lo è.',
    },
    { text: 'Inginocchiarti soltanto a pregare', effects: [] },
  ],
});
