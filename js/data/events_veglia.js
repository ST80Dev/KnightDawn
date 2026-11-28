// Knight Dawn — Catalogo eventi della Veglia (garzone di stalla), G1 passo 2 (docs/EARLY_GAME.md §7).
// Il garzone cammina nel borgo 3D della rocca di partenza; alla porta di un edificio si apre la sua Carta del
// cronista con questi eventi (aperti per id, non dal pescaggio casuale: vedi vegliaEventoPer). Ripetibili finché
// dura la Veglia (Calendar.inVeglia). Ogni azione costa la sua durata in minuti di gioco (GDD §3, «Azioni di
// persona»); orari: lavori, mercato e maestro da Prima a Nona, taverna fino a Vespri, di notte tutto chiuso tranne
// la stalla dove il garzone dorme.
//
// Arco della Veglia: lavori per oro → sala d'armi fino a Scudiero → prima battaglia (passo 5: incontri con gli
// animali fuori porta) → cappella per l'investitura, che chiude la Veglia e promuove a Cavaliere Errante.
//
// Il motore 3D passa nel contesto (Events.applyEffects(effetti, extra)): casata (nome della casata della rocca di
// partenza), dormi({ dove, forza, salute }) → testo, mangia() (il pasto del giorno), notizia(foglio). Senza (prove in
// Node) gli effetti che li usano non fanno nulla. Un'opzione con `apre: 'mercato'` apre la bottega dell'edificio
// (js/data/items.js, NEGOZI) invece di applicare effetti. `prereqLabel` può essere una funzione(ctx): dice solo ciò
// che manca (G1 passo 3: prima ripeteva il prezzo già scritto nel testo).

// Soglie e prezzi [DA BILANCIARE] per una Veglia di ~60 minuti reali (docs/EARLY_GAME.md §7).
const VEGLIA_SOGLIA_INVESTITURA = 10;   // oro per farsi armare
const VEGLIA_SOGLIA_ADDESTRAMENTO = 3;  // sessioni col maestro → scudiero
const VEGLIA_PREZZO_LEZIONE = 2;        // oro per sessione col maestro d'armi
const VEGLIA_PREZZO_STANZA = 2;         // oro per una notte in taverna
const VEGLIA_PREZZO_CURA = 2;           // oro per farsi medicare

const _vegliaCond = () => (typeof Calendar !== 'undefined' && Calendar.inVeglia);
// Ora canonica: 0 Prima, 1 Terza, 2 Sesta, 3 Nona, 4 Vespri, 5 Compieta, 6 Mattutino, 7 Lodi.
const _ora = () => (typeof Calendar !== 'undefined' ? Calendar.indiceNelGiorno() : 0);
const _diGiorno = () => _ora() <= 3;            // Prima–Nona: lavori, mercato, maestro, guaritore
const _taverna = () => _ora() <= 4;             // fino a Vespri compreso
const _sera = () => _ora() >= 4;                // da Vespri: si va a dormire
const _casata = (ctx) => (ctx && ctx.casata) || 'la casata';

// ─── Edifici del borgo di partenza → evento ─────────────────────────────────
// tipo dell'edificio (js/3d/edifici3d.js, EDIFICI) → id dell'evento. Se la rocca non ha la sala d'armi, il maestro sta
// all'armeria; se manca anche quella, nel palazzo del signore.
const VEGLIA_EDIFICI = {
  stalla: 'veglia.stalla', scuderia: 'veglia.stalla',
  taverna: 'veglia.taverna',
  salaArmi: 'veglia.saladarmi',
  armeria: 'veglia.mercato', fabbro: 'veglia.mercato', loggia: 'veglia.mercato', loggiaGrande: 'veglia.mercato',
  pozzo: 'veglia.commissioni', cucina: 'veglia.commissioni', cantina: 'veglia.commissioni',
  cappella: 'veglia.cappella', chiesa: 'veglia.cappella',
  guaritore: 'veglia.guaritore', infermeria: 'veglia.guaritore',
  palazzetto: 'veglia.palazzo', palazzoMinore: 'veglia.palazzo', palazzo: 'veglia.palazzo', palazzoMaggiore: 'veglia.palazzo',
};

/** Id dell'evento della Veglia per un edificio, sapendo quali tipi ha il luogo di partenza (Set), o null. */
function vegliaEventoPer(tipo, presenti) {
  if (!presenti.has('salaArmi')) {
    if (tipo === 'armeria') return 'veglia.saladarmi';
    if (!presenti.has('armeria') && /^palazz/.test(tipo)) return 'veglia.saladarmi';
  }
  return VEGLIA_EDIFICI[tipo] || null;
}

// Nome della casata della rocca di partenza, dal seme del mondo: registro anglo-fantasy (docs/GDD.md §2 «Culture e
// nomi»), varianti di casate minori dei romanzi e delle serie di riferimento. Provvisorio: G3 genera tutte le casate
// (con i nomi divisi per area: nord, centro, sud) e riprende questo nome.
const VEGLIA_CASATE = [
  'Ashford', 'Blackmoor', 'Caswold', 'Daynor', 'Dustane', 'Fossway', 'Glovern', 'Hornwold', 'Karstane', 'Mallistor',
  'Manderlane', 'Mormount', 'Redwynne', 'Ryswold', 'Swanmere', 'Tarlow', 'Westerlyn', 'Whentmoor', 'Cargill', 'Strongharrow',
  'Morthane', 'Valdris', 'Amrothe', 'Lossarn', 'Eorling', 'Durenhall', 'Sommerlane', 'Torane', 'Holmgarde', 'Vancel',
];
function vegliaNomeCasata(seme) {
  const n = Math.abs(Math.floor(seme || 0)) % VEGLIA_CASATE.length;
  return 'Casata ' + VEGLIA_CASATE[n];
}

// Voci raccolte servendo in taverna (aggancio col sistema News, S6/G4: per ora solo cronaca).
const VEGLIA_VOCI = [
  'Si dice che a oriente, tra le rovine, qualcosa si muova di notte.',
  'Un mercante giura di aver visto lupi grossi come vitelli sulle colline.',
  'I pastori lamentano capi spariti; nessuno ha trovato le carcasse.',
  'Al valico chiedono un pedaggio nuovo, e nessuno sa a nome di chi.',
  'Il signore cerca braccia armate: chi sa tenere una lancia avrà paga.',
  'Dicono che l\'eremita del bosco sappia guarire le febbri con le erbe.',
];

// ─── Consigli per la striscia degli avvisi (js/3d/avvisi.js) ──────────────────
// Suggerimenti non espliciti, scritti dentro il mondo, calcolati dallo stato del garzone. Dal più urgente; la striscia ne
// mostra al più tre a turno. Solo durante la Veglia (dopo l'investitura arriveranno quelli delle missioni, G4).
// ctx: { knight, ora (indice canonico 0–7, vedi _ora), mangiato (oggi), pastoNelloZaino }.
function vegliaConsigli(ctx) {
  if (!_vegliaCond()) return [];
  const k = ctx.knight, out = [];
  const add = (peso, chi, testo) => out.push({ peso, chi, testo });
  const lezioni = k.addestramento || 0;
  if (k.salute.cur < k.salute.max * 0.3) add(90, 'Voce di popolo', 'Il guaritore dietro la piazza cuce ferite fino a Nona.');
  if (!ctx.mangiato && !ctx.pastoNelloZaino && ctx.ora >= 2 && ctx.ora <= 4) add(80, "L'oste", '«Stomaco vuoto non regge la lancia. Una minestra, una moneta.»');
  if (ctx.ora >= 4) add(70, 'Voce di popolo', 'La taverna chiude a Vespri; il fienile della stalla non chiede moneta.');
  if (k.forza.cur < 25) add(60, 'Detto del maestro', '«Braccio stanco, lama storta. Prima il fieno, poi la spada.»');
  if (k.rango === 'garzone') {
    if (lezioni === 0 && k.oro < VEGLIA_PREZZO_LEZIONE) add(40, 'Voce di cortile', 'Il maestro d\'armi non insegna gratis, ma la stalla cerca braccia.');
    else if (lezioni === 0) add(40, 'Detto del maestro', '«Chi paga impara; chi non paga guarda.» Si comincia con la luce.');
    else add(40, 'Voce di cortile', 'Il maestro conta le lezioni su una mano sola, e gliene bastano tre.');
  } else if (!k.primaSangue) {
    add(40, 'Bando del signore', 'Il signore cerca scudieri che tengano testa alle bestie delle colline.');
  } else if (k.oro < VEGLIA_SOGLIA_INVESTITURA) {
    add(40, 'Il cappellano', '«La veglia d\'armi si paga in cera e in monete: ' + VEGLIA_SOGLIA_INVESTITURA + ', non una di meno.»');
  } else {
    add(40, 'Il cappellano', 'Le candele della cappella sono accese. Si aspetta qualcuno.');
  }
  if (k.rango === 'garzone' && k.oro >= VEGLIA_PREZZO_LEZIONE + 2 && lezioni < VEGLIA_SOGLIA_ADDESTRAMENTO) {
    add(20, 'Voce di cortile', 'Alla loggia del mercato il pane costa una moneta, e dura più di una promessa.');
  }
  return out.sort((a, b) => b.peso - a.peso);
}

// ─── Stalla: lavoro e letto del garzone ───────────────────────────────────────
Events.register({
  id: 'veglia.stalla', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'La stalla',
  text: 'Odore di paglia e di cavallo. I box vanno puliti, le bestie strigliate e nutrite. Lavoro di braccia, paga onesta — e un posto nel fienile per dormire.',
  tone: 'contemplativo', portata: 'marginale',
  options: [
    {
      text: 'Strigliare e accudire i cavalli (3 ore)',
      prereq: () => _diGiorno(), prereqLabel: '(di giorno, fino a Nona)',
      effects: [ { type: 'oro', delta: 2 }, { type: 'forza', delta: -12 }, { type: 'tempo', minuti: 180 } ],
      racconto: ['Riempi le mangiatoie di biada e cambi la paglia nei box.', 'Strigli il baio, poi il grigio, poi la giumenta che morde.',
        'Spali il letame finché le braccia non bruciano; il sole intanto scavalca le mura.'],
      reply: 'Passi ore tra criniere e zoccoli. Impari a leggere un cavallo con uno sguardo — ti servirà. Due monete nella scarsella.',
    },
    {
      text: 'Comprare o vendere un cavallo',
      prereq: () => _diGiorno(), prereqLabel: '(di giorno, fino a Nona)',
      apre: 'mercato',
    },
    {
      text: 'Dormire nel fienile',
      prereq: () => _sera(), prereqLabel: '(da Vespri)',
      effects: [ ctx => { if (ctx.dormi) ctx.log(ctx.dormi({ dove: 'nel fienile', salute: 5 })); } ],
      racconto: ['Ti scavi un giaciglio nel fieno, sopra le poste.', 'I cavalli sbuffano nel buio; da qualche parte un topo rosicchia.',
        'Il sonno arriva pesante.', 'Il gallo del borgo ti sveglia prima dell\'alba.'],
      reply: 'La paglia punge, i cavalli sbuffano nel buio. Ma è caldo, ed è gratis.',
    },
    { text: 'Uscire', effects: [] },
  ],
});

// ─── Commissioni (pozzo, cucina, cantina) ─────────────────────────────────────
Events.register({
  id: 'veglia.commissioni', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _diGiorno(), chiuso: 'A quest\'ora nessuno ha commissioni da affidare. Torna di giorno.',
  title: 'Commissioni',
  text: 'Secchi d\'acqua da portare, carri da scaricare, messaggi da recapitare nel borgo. Nessuno ringrazia, ma qualche moneta gira.',
  tone: 'neutro', portata: 'marginale',
  options: [
    {
      text: 'Sbrigare commissioni (2 ore)',
      effects: [ { type: 'oro', delta: 1 }, { type: 'forza', delta: -6 }, { type: 'tempo', minuti: 120 } ],
      racconto: ['Porti secchi d\'acqua dal pozzo alla cucina, avanti e indietro.', 'Aiuti a scaricare un carro di sacchi di farina.',
        'Corri a portare un messaggio in fondo al borgo, e torni con un altro.'],
      reply: 'Acqua, sacchi, messaggi. Lavoro umile, una moneta sicura.',
    },
    { text: 'Lasciar perdere', effects: [] },
  ],
});

// ─── Taverna: servire, voci, una stanza ───────────────────────────────────────
Events.register({
  id: 'veglia.taverna', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _taverna(), chiuso: 'Le imposte sono sbarrate: l\'oste ha chiuso. Riapre a Prima.',
  title: 'La taverna',
  text: 'Fumo, boccali e lingue sciolte. Chi serve ai tavoli raccoglie mance — e, a volte, voci che valgono più delle mance.',
  tone: 'ironico', portata: 'marginale',
  options: [
    {
      text: 'Servire ai tavoli e origliare (3 ore)',
      effects: [
        { type: 'oro', delta: 1 }, { type: 'forza', delta: -8 }, { type: 'tempo', minuti: 180 },
        ctx => {
          if (Math.random() < 0.5) { Knight.oro += 1; ctx.log('Un avventore generoso ti lascia una moneta in più.'); }
          const voce = VEGLIA_VOCI[(Math.random() * VEGLIA_VOCI.length) | 0];
          // Con il motore 3D la voce diventa un ritaglio nello scrittoio (J); senza, resta una riga di cronaca.
          if (ctx.notizia) ctx.notizia({ tipo: 'voce', testo: voce, fonte: 'sentito in taverna' });
          ctx.log('«' + voce + '»');
        },
      ],
      racconto: ['Porti boccali e scodelle fra i tavoli affollati.', 'Le voci si fanno alte col vino; tu ascolti senza parere.',
        'A sera hai le mani appiccicose di sidro e qualche moneta in tasca.'],
      reply: 'Tra un boccale e l\'altro raccogli mance e dicerie.',
    },
    {
      text: 'Mangiare un pasto caldo (1 oro, mezz\'ora)',
      prereq: ctx => ctx.knight.oro >= 1, prereqLabel: '(servono 1 oro)',
      effects: [ { type: 'oro', delta: -1 }, { type: 'tempo', minuti: 30 }, ctx => { if (ctx.mangia) ctx.log(ctx.mangia(5)); } ],
      racconto: ['Ti siedi in un angolo vicino al fuoco.', 'L\'oste ti mette davanti una scodella fumante e un tozzo di pane nero.'],
      reply: 'Zuppa di fave, pane nero e un boccale di sidro. Il pasto del giorno è fatto.',
    },
    { text: 'Comprare provviste per lo zaino', apre: 'mercato' },
    {
      text: 'Prendere un pagliericcio per la notte (' + VEGLIA_PREZZO_STANZA + ' oro)',
      prereq: ctx => _sera() && ctx.knight.oro >= VEGLIA_PREZZO_STANZA,
      prereqLabel: ctx => (!_sera() ? '(da Vespri)' : '(servono ' + VEGLIA_PREZZO_STANZA + ' oro)'),
      effects: [
        { type: 'oro', delta: -VEGLIA_PREZZO_STANZA },
        ctx => { if (ctx.dormi) ctx.log(ctx.dormi({ dove: 'in taverna', forza: 15, salute: 10 })); },
      ],
      racconto: ['Sali la scala stretta fino al sottotetto.', 'Un pagliericcio vero, una coperta che sa di fumo.',
        'Di sotto gli ultimi avventori cantano piano, poi tace tutto.', 'Ti svegli riposato, con la luce che filtra fra le tegole.'],
      reply: 'Un pagliericcio vero, una coperta, il fuoco che brontola di sotto. Ti svegli come nuovo.',
    },
    { text: 'Uscire', effects: [] },
  ],
});

// ─── Sala d'armi (maestro → scudiero) ────────────────────────────────────────
Events.register({
  id: 'veglia.saladarmi', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _diGiorno(), chiuso: 'Il maestro d\'armi non c\'è: allena solo con la luce. Torna all\'alba.',
  title: "Il maestro d'armi",
  text: 'Il vecchio maestro d\'armi squadra i garzoni con disprezzo paziente. Chi paga e ha fegato impara a reggere una lama di legno — e forse, un giorno, una vera.',
  tone: 'drammatico', portata: 'notevole',
  options: [
    {
      text: 'Allenarti col maestro (3 ore, ' + VEGLIA_PREZZO_LEZIONE + ' oro)',
      prereq: ctx => ctx.knight.oro >= VEGLIA_PREZZO_LEZIONE && ctx.knight.forza.cur >= 15,
      prereqLabel: ctx => (ctx.knight.oro < VEGLIA_PREZZO_LEZIONE ? '(servono ' + VEGLIA_PREZZO_LEZIONE + ' oro)' : '(troppo stanco: Forza 15)'),
      effects: [
        { type: 'oro', delta: -VEGLIA_PREZZO_LEZIONE },
        { type: 'volonta', delta: 4 }, { type: 'forza', delta: -15 }, { type: 'tempo', minuti: 180 },
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
      racconto: ['Il maestro ti mette in mano una spada di legno e ti corregge la guardia con un colpo secco.',
        'Parate, affondi, ancora parate; il sudore ti brucia gli occhi.', '«Di nuovo», dice. E poi ancora.'],
      reply: 'Ore di legno e sudore. Le mani imparano, lo spirito si tempra.',
    },
    { text: 'Andartene', effects: [] },
  ],
});

// ─── Mercato (armeria, fabbro, loggia): G1 passo 3 ───────────────────────────
Events.register({
  id: 'veglia.mercato', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _diGiorno(), chiuso: 'Banchi coperti e porte sbarrate: si vende di giorno.',
  title: 'Il mercato',
  text: 'Ferro vecchio e nuovo, cuoio, qualche cavallo da vendere. Si compra e si vende — se hai di che pagare.',
  tone: 'neutro', portata: 'marginale',
  options: [
    { text: 'Sfogliare le mercanzie', apre: 'mercato' },
    { text: 'Solo dare un\'occhiata', effects: [] },
  ],
});

// ─── Guaritore e infermeria: cure a pagamento ────────────────────────────────
Events.register({
  id: 'veglia.guaritore', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _diGiorno(), chiuso: 'Bussi a lungo; nessuno apre. Il guaritore riceve di giorno.',
  title: 'Il guaritore',
  text: 'Erbe appese ad asciugare, ampolle e un odore amaro di decotti. Le ferite si curano; la fretta no.',
  tone: 'contemplativo', portata: 'marginale',
  options: [
    {
      text: 'Farti medicare (1 ora e mezza, ' + VEGLIA_PREZZO_CURA + ' oro)',
      prereq: ctx => ctx.knight.salute.cur < ctx.knight.salute.max && ctx.knight.oro >= VEGLIA_PREZZO_CURA,
      prereqLabel: ctx => (ctx.knight.salute.cur >= ctx.knight.salute.max ? '(non sei ferito)' : '(servono ' + VEGLIA_PREZZO_CURA + ' oro)'),
      effects: [ { type: 'oro', delta: -VEGLIA_PREZZO_CURA }, { type: 'salute', delta: 30 }, { type: 'tempo', minuti: 90 } ],
      racconto: ['Il guaritore ti lava le ferite con acqua e aceto.', 'Un impiastro d\'erbe che brucia, bende strette, un decotto amarissimo.'],
      reply: 'Bende, un impiastro che brucia e un decotto amarissimo. Ti senti meglio.',
    },
    { text: 'Uscire', effects: [] },
  ],
});

// ─── Palazzo del signore ─────────────────────────────────────────────────────
Events.register({
  id: 'veglia.palazzo', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  title: 'Il palazzo del signore',
  text: ctx => 'Una guardia ti sbarra la soglia con l\'asta. «La ' + _casata(ctx) + ' non riceve garzoni di stalla. Torna quando avrai un nome.»',
  tone: 'drammatico', portata: 'marginale',
  options: [
    { text: 'Chiedere udienza al signore', prereq: ctx => ctx.knight.rango === 'errante', prereqLabel: '(da cavaliere)', effects: [] },
    { text: 'Andartene', effects: [] },
  ],
});

// ─── Cappella (investitura → fine Veglia) ────────────────────────────────────
Events.register({
  id: 'veglia.cappella', kind: 'location', where: 'castle', condition: _vegliaCond, cooldown: 0,
  aperto: () => _taverna(), chiuso: 'Il portale della cappella è chiuso per la notte.',
  title: 'La cappella',
  text: 'Candele, pietra fredda e il silenzio dei voti. È qui che gli scudieri degni vengono fatti cavalieri — quando sono pronti, e quando possono armarsi.',
  tone: 'poetico', portata: 'svolta',
  options: [
    {
      text: 'Presentarti per l\'investitura',
      prereq: ctx => ctx.knight.rango !== 'garzone'
                  && ctx.knight.primaSangue
                  && ctx.knight.oro >= VEGLIA_SOGLIA_INVESTITURA,
      prereqLabel: '(scudiero · prima battaglia · ' + VEGLIA_SOGLIA_INVESTITURA + ' oro)',
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
      racconto: ['Vegli tutta la notte in ginocchio, davanti all\'altare.', 'All\'alba il signore entra con la spada nuda.',
        'La lama piatta ti tocca le spalle, una e poi l\'altra.', '«Alzati, cavaliere.»'],
      reply: 'In ginocchio nella cappella, la lama piatta sulle spalle. Ti rialzi con un nome che pesa e una strada davanti. Il castello non è più la tua casa: il mondo lo è.',
    },
    { text: 'Inginocchiarti soltanto a pregare (mezz\'ora)', effects: [ { type: 'volonta', delta: 3 }, { type: 'tempo', minuti: 30 } ],
      racconto: ['Ti inginocchi sulla pietra fredda, davanti alla lampada.', 'Il silenzio ti entra dentro e i pensieri si fanno quieti.'],
      reply: 'Il silenzio della pietra ti calma i pensieri.' },
    { text: 'Uscire', effects: [] },
  ],
});
