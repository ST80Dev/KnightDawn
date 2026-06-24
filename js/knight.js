// FERRO & CENERE — stato del cavaliere
// Dati puri, niente UI. Acceduto da game.js per display, da travel.js (futuro)
// per costi di viaggio.
//
// Attributi:
//   Forza   (0-100) — energia di viaggio; si consuma tile per tile
//   Volontà (0-100) — forza mentale; cala con eventi oscuri e paura
//   Salute  (0-100) — integrità corporea; cala in combattimento (0 = morte)
//   Onore   (-5/+5) — statura morale; apre e chiude porte con fazioni e NPC

// Costo Forza per tile percorso, indicizzato per bioma (World.BIOME).
// Terreni normali: frazioni di 1. Terreni ostili: interi o più.
// null = impassabile (acqua aperta).
const TRAVEL_COST = [
  null,   // 0  ACQUA       — impassabile
  0.25,   // 1  PIANURA
  0.375,  // 2  FORESTA
  0.5,    // 3  COLLINA
  2.0,    // 4  MONTAGNA
  1.0,    // 5  PALUDE
  1.0,    // 6  SABBIA
  1.5,    // 7  NEVE
  2.5,    // 8  GHIACCIO
  0.5,    // 9  FIUME
  1.0,    // 10 ROCCIA
  0.25,   // 11 PIANURA_N
  0.25,   // 12 PIANURA_S
];

// Scala dei ranghi del cavaliere (progressione sociale, non livelli RPG).
// Vedi docs/EARLY_GAME.md §2. Il rango sblocca accesso e opportunità; i bonus
// passivi restano modesti. La partita inizia da 'garzone' (Età della Veglia).
const RANGHI = [
  { id: 'garzone',  nome: 'Garzone' },
  { id: 'scudiero', nome: 'Scudiero' },
  { id: 'errante',  nome: 'Cavaliere Errante' },
  { id: 'ventura',  nome: 'Cavaliere di Ventura' },
  { id: 'campione', nome: 'Campione' },
];

// Recupero Forza e Salute per tipo di sosta.
const RECOVERY = {
  accampamento: { forza: 30 },
  villaggio:    { forza: 50, salute: 10 },
  locanda:      { forza: 100, salute: 25 },  // forza = piena
  chirurgo:     { salute: 60 },
};

const Knight = {
  nome:   '',
  titolo: '',
  rango:  'garzone',   // id in RANGHI; sale per imprese/reputazione (vedi EARLY_GAME.md)

  forza:   { cur: 100, max: 100 },
  volonta: { cur: 100, max: 100 },
  salute:  { cur: 100, max: 100 },
  onore:   0,

  equip: {
    arma:     null,
    armatura: null,
    scudo:    null,
    speciale: null,
    viaggio:  null,
  },

  reputazione: [],
  oro: 0,
  apprendista: null,
  compagni: [],   // max 3: { nome, archetipo:'lama'|'ombra'|'conoscitore', fedelta }

  // Azzera e re-inizializza per una nuova partita.
  // Stato iniziale = garzone di stalla durante l'Età della Veglia (GDD §3,
  // docs/EARLY_GAME.md): nessun equipaggiamento, nessun cavallo, pochi spiccioli.
  // L'investitura (fine Veglia) promuove a 'errante' e consegna il primo kit.
  init(nome) {
    this.nome   = nome || 'Aldric di Vorn';
    this.titolo = 'Garzone';
    this.rango  = 'garzone';

    this.forza   = { cur: 100, max: 100 };
    this.volonta = { cur: 100, max: 100 };
    this.salute  = { cur: 100, max: 100 };
    this.onore   = 0;

    this.equip = {
      arma:     null,
      armatura: null,
      scudo:    null,
      speciale: null,
      viaggio:  null,
    };

    this.reputazione = [
      { id: 'vorn',     nome: 'Casata Vorn',      val: 0 },
      { id: 'cervo',    nome: 'Ordine del Cervo',  val: 0 },
      { id: 'mercanti', nome: 'Mercanti Liberi',   val: 0 },
      { id: 'banditi',  nome: 'Banditi del Sud',   val: 0 },
    ];

    this.oro          = 3;
    this.apprendista  = null;
    this.compagni     = [];
  },

  // Nome leggibile del rango corrente (per UI/log).
  rangoNome() {
    const r = RANGHI.find(x => x.id === this.rango);
    return r ? r.nome : this.titolo;
  },

  // Consuma Forza per il bioma del tile percorso.
  // Ritorna false se il tile è impassabile, true altrimenti.
  consumaForza(biome) {
    const cost = TRAVEL_COST[biome];
    if (cost == null) return false;
    this.forza.cur = Math.max(0, +(this.forza.cur - cost).toFixed(3));
    return true;
  },

  // Applica recupero da sosta.  tipo: chiave di RECOVERY.
  recupera(tipo) {
    const r = RECOVERY[tipo];
    if (!r) return;
    if (r.forza)  this.forza.cur  = Math.min(this.forza.max,  this.forza.cur  + r.forza);
    if (r.salute) this.salute.cur = Math.min(this.salute.max, this.salute.cur + r.salute);
  },

  // Applica danno.  tipo: 'salute' | 'volonta' | 'forza'
  danneggia(danno, tipo) {
    tipo = tipo || 'salute';
    this[tipo].cur = Math.max(0, this[tipo].cur - danno);
  },

  // Modifica Onore (clampa a -5/+5).
  modificaOnore(delta) {
    this.onore = Math.max(-5, Math.min(5, this.onore + delta));
  },

  isDead()      { return this.salute.cur  <= 0; },
  isExhausted() { return this.forza.cur   <= 0; },
  isBroken()    { return this.volonta.cur <= 0; },
};
