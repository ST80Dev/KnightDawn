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
        { type: 'combat', enemy: 'banditi.boscaglia',
          onWin: [
            { type: 'oro', delta: 5 },
            { type: 'reputazione', id: 'banditi', delta: -1 },
            { type: 'log', text: 'Hai respinto i banditi a colpi di lama e raccolto il loro bottino.' },
          ],
          onDefeat: [
            { type: 'oro', delta: -5 },
            { type: 'volonta', delta: -6 },
            { type: 'log', text: 'Ti sopraffanno e ti spogliano della borsa prima di dileguarsi.' },
          ],
          onDeath: [
            { type: 'log', text: 'Cadi sul sentiero, lontano da ogni soccorso.' },
          ],
        },
      ],
      reply: 'Lo scontro è breve e brutale.',
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

// ─── Eventi-incontro (combattimento via motore js/combat.js) ───────────────
// La scelta morale resta gamebook (combatti / evita / parla); solo il ramo
// "combatti" entra nel motore via effetto { type:'combat', ... }. Rami esito:
// onWin (bottino), onDefeat (battuto ma vivo: spoglio/ferita), onDeath (morte).

Events.register({
  id: 'travel.ladro',
  kind: 'travel',
  where: { biomes: [1, 3, 11, 12] }, // pianure e collina: strade aperte
  title: 'Il tagliaborse',
  text: 'Un giovane sbuca da dietro un masso, lama corta in pugno. «Solo la borsa. Non voglio farti del male.» La mano gli trema.',
  weight: 2,
  tone: 'ironico',
  portata: 'marginale',
  cooldown: 25,
  options: [
    {
      text: 'Affrontarlo',
      effects: [
        { type: 'combat', enemy: 'banditi.ladro',
          onWin: [
            { type: 'oro', delta: 2 },
            { type: 'log', text: 'Lo disarmi con un gesto. Fugge lasciando cadere due monete.' },
          ],
          onDefeat: [
            { type: 'oro', delta: -3 },
            { type: 'log', text: 'Più svelto di quanto credessi: ti taglia la borsa e sparisce.' },
          ],
          onDeath: [
            { type: 'log', text: 'Un colpo fortunato del ragazzo ti stende. Ironia amara.' },
          ],
        },
      ],
      reply: 'Porti la mano all\'elsa.',
    },
    {
      text: 'Lanciargli una moneta e proseguire',
      prereq: ctx => ctx.knight.oro >= 1,
      prereqLabel: '(serve 1 oro)',
      effects: [
        { type: 'oro', delta: -1 },
        { type: 'onore', delta: 1 },
      ],
      reply: 'Gli getti una moneta. La afferra al volo e scappa, quasi grato.',
    },
    {
      text: 'Intimorirlo con lo sguardo',
      prereq: ctx => ctx.knight.onore >= 1,
      prereqLabel: '(richiede Onore ≥ 1)',
      effects: [
        { type: 'volonta', delta: 2 },
      ],
      reply: 'Non dici nulla. Basta il tuo silenzio: arretra e fugge.',
    },
  ],
});

Events.register({
  id: 'travel.lupo',
  kind: 'travel',
  where: { biomes: [2, 7] }, // foresta, neve — terreno favorevole al lupo
  title: 'Occhi tra gli alberi',
  text: 'Un ringhio basso. Un lupo magro esce dall\'ombra, il pelo irto, la fame negli occhi. Ti studia.',
  weight: 1,
  tone: 'drammatico',
  portata: 'notevole',
  cooldown: 35,
  options: [
    {
      text: 'Tenergli testa con la lama',
      effects: [
        { type: 'combat', enemy: 'bestie.lupo',
          onWin: [
            { type: 'forza', delta: -6 },
            { type: 'log', text: 'La bestia cede e si ritira zoppicando nel folto.' },
          ],
          onDefeat: [
            { type: 'salute', delta: -8 },
            { type: 'volonta', delta: -4 },
            { type: 'log', text: 'I denti trovano la carne prima che riesca a respingerlo.' },
          ],
          onDeath: [
            { type: 'log', text: 'La foresta si richiude in silenzio sopra di te.' },
          ],
        },
      ],
      reply: 'Pianti i piedi e sollevi la lama.',
    },
    {
      text: 'Indietreggiare lentamente',
      effects: [
        { type: 'tempo', passi: 2 },
        { type: 'volonta', delta: -3 },
      ],
      reply: 'Passo dopo passo, senza voltarti. Il lupo non ti segue oltre il limitare.',
    },
  ],
});

Events.register({
  id: 'travel.cavaliere_rivale',
  kind: 'travel',
  where: { biomes: [1, 3, 11, 12] }, // campo aperto: terreno da duello
  title: 'Sfida sul cammino',
  text: 'Un cavaliere in arme ti sbarra la strada, lancia abbassata. «Nessuno passa senza misurarsi con me. Il tuo nome, o il tuo ferro.»',
  weight: 1,
  tone: 'drammatico',
  portata: 'svolta',
  cooldown: 60,
  options: [
    {
      text: 'Accettare il duello',
      effects: [
        { type: 'combat', enemy: 'casata.cavaliere',
          onWin: [
            { type: 'onore', delta: 2 },
            { type: 'oro', delta: 8 },
            { type: 'news', tipo: 'voce', tag: 'duello.vinto',
              testo: 'Un cavaliere errante ha abbattuto un campione in duello.' },
            { type: 'log', text: 'Lo disarcioni. Si arrende con onore e ti lascia le sue monete.' },
          ],
          onDefeat: [
            { type: 'onore', delta: -1 },
            { type: 'salute', delta: -10 },
            { type: 'log', text: 'Ti atterra ma ti risparmia. «Allenati, e torna.»' },
          ],
          onDeath: [
            { type: 'log', text: 'L\'ultima cosa che vedi è il cielo, e una lancia che cala.' },
          ],
        },
      ],
      reply: 'Abbassi la visiera e sguaini.',
    },
    {
      text: 'Declinare con cortesia',
      prereq: ctx => ctx.knight.onore >= 2,
      prereqLabel: '(richiede Onore ≥ 2)',
      effects: [
        { type: 'onore', delta: -1 },
        { type: 'volonta', delta: -2 },
      ],
      reply: 'Pronunci parole misurate. Lui esita, poi ti concede il passo a malincuore.',
    },
  ],
});

Events.register({
  id: 'travel.orso',
  kind: 'travel',
  where: { biomes: [2, 3, 4] }, // foresta, collina, montagna
  title: 'Il padrone del bosco',
  text: 'Un orso enorme si erge sulle zampe posteriori a pochi passi da te, le fauci aperte in un ruggito che fa tremare i rami.',
  weight: 1,
  tone: 'brutale',
  portata: 'notevole',
  cooldown: 70,
  options: [
    {
      text: 'Affrontare la bestia',
      effects: [
        { type: 'combat', enemy: 'bestie.orso',
          onWin: [
            { type: 'forza', delta: -10 },
            { type: 'onore', delta: 1 },
            { type: 'log', text: 'Cade con un ultimo lamento. Pochi possono dire di aver vinto un orso.' },
          ],
          onDefeat: [
            { type: 'salute', delta: -15 },
            { type: 'forza', delta: -10 },
            { type: 'log', text: 'Una zampata ti scaraventa lontano. Ti trascini via a fatica.' },
          ],
          onDeath: [
            { type: 'log', text: 'La forza della bestia è troppa. Il bosco reclama il suo.' },
          ],
        },
      ],
      reply: 'Non c\'è spazio per la paura. Sollevi lo scudo.',
    },
    {
      text: 'Restare immobile e arretrare',
      effects: [
        { type: 'tempo', passi: 1 },
        { type: 'volonta', delta: -5 },
      ],
      reply: 'Trattieni il respiro. Dopo un\'eternità, l\'orso si volta e si allontana.',
    },
  ],
});

Events.register({
  id: 'travel.predone',
  kind: 'travel',
  where: { biomes: [5, 6, 10] }, // palude, sabbia, roccia: terre desolate
  title: 'Il predone solitario',
  text: 'Un uomo dal volto coperto ti aspetta su un masso, ascia in grembo. «Brutte terre per viaggiare soli. Lascia qualcosa, e vivrai per raccontarlo.»',
  weight: 1,
  tone: 'drammatico',
  portata: 'notevole',
  cooldown: 40,
  options: [
    {
      text: 'Rifiutare e combattere',
      effects: [
        { type: 'combat', enemy: 'banditi.predone',
          onWin: [
            { type: 'oro', delta: 4 },
            { type: 'reputazione', id: 'banditi', delta: -1 },
            { type: 'log', text: 'Cade nella polvere. Frughi nelle sue tasche.' },
          ],
          onDefeat: [
            { type: 'oro', delta: -4 },
            { type: 'salute', delta: -6 },
            { type: 'log', text: 'L\'ascia è più rapida di te. Ti lascia spoglio ma vivo.' },
          ],
          onDeath: [
            { type: 'log', text: 'Le terre desolate inghiottono un altro viandante.' },
          ],
        },
      ],
      reply: 'Stringi l\'elsa. Niente tributi, oggi.',
    },
    {
      text: 'Pagare il pedaggio',
      prereq: ctx => ctx.knight.oro >= 2,
      prereqLabel: '(serve 2 oro)',
      effects: [
        { type: 'oro', delta: -2 },
        { type: 'onore', delta: -1 },
      ],
      reply: 'Lasci cadere due monete. Lui annuisce e ti lascia passare.',
    },
  ],
});
