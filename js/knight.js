// Knight Dawn — stato del cavaliere
// Dati puri, niente UI. Acceduto da game.js per display, da travel.js (futuro)
// per costi di viaggio.
//
// Attributi:
//   Forza   (0-100) — energia di viaggio; si consuma con la distanza (Scene 3D:
//                     consumaForzaMetri; Carta: consumaForza per bioma)
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
  cavallo: null,   // null = a piedi; altrimenti { id, nome, vigore, vigoreMax }
  inSella: false,  // in sella (milestone Cavallo, passo 3): finché non si monta, avere un cavallo non dà lo sconto
  zaino: [],       // nomi degli oggetti nello zaino (Items, slot 'provviste'), al più Items.ZAINO_POSTI
  ultimoPasto: -1, // giorno di gioco (Calendar) dell'ultimo pasto
  giornoControllato: 0, // ultimo giorno di cui si è controllato il pasto (G1 passo 3)
  addestramento: 0, // sessioni col maestro d'armi (Veglia → promozione a scudiero)
  primaSangue: false, // true dopo la prima vera battaglia (gate investitura)
  apprendista: null,
  compagni: [],   // max 3: { nome, archetipo:'lama'|'ombra'|'conoscitore', fedelta }

  // Azzera e re-inizializza per una nuova partita.
  // Stato iniziale = garzone di stalla durante l'Età della Veglia (GDD §3,
  // docs/EARLY_GAME.md): nessun equipaggiamento, nessun cavallo, pochi spiccioli.
  // L'investitura (fine Veglia) promuove a 'errante' e consegna il primo kit.
  init(nome) {
    this.nome   = nome || 'Aldric';
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
    this.cavallo      = null;   // il garzone parte a piedi: compra un ronzino al mercato
    this.inSella      = false;
    this.zaino        = ['Pane e formaggio'];   // un pasto per il primo giorno
    this.ultimoPasto  = -1;
    this.giornoControllato = 0;
    this.addestramento = 0;
    this.primaSangue   = false;
    this.apprendista  = null;
    this.compagni     = [];
  },

  // Promozione di rango: imposta rango/titolo e applica un bonus modesto a un
  // cap (EARLY_GAME.md §2). Ritorna true se la promozione è avvenuta.
  promuovi(rango) {
    const r = RANGHI.find(x => x.id === rango);
    if (!r) return false;
    this.rango  = rango;
    this.titolo = r.nome;
    if (rango === 'scudiero') this.forza.max   += 5;
    if (rango === 'errante')  this.volonta.max += 5;
    return true;
  },

  // ─── Cavallo (montatura) — vedi js/data/items.js e docs/EARLY_GAME.md ──────
  // A cavallo (con vigore) il viaggio costa meno Forza al cavaliere; il cavallo
  // però consuma Vigore tile per tile e, a Vigore 0, è stremato: bisogna
  // abbeverarlo a un fiume o riposare (accampa). Il sistema riguarda SOLO il
  // cavaliere: la compagnia viaggia con lui in astratto (GDD §2 Seguito).
  isMounted()    { return !!(this.cavallo && this.inSella && this.cavallo.vigore > 0); },
  isHorseTired() { return !!(this.cavallo && this.cavallo.vigore <= 0); },

  // ─── Mercato e zaino (G1 passo 3) — prezzi e regole in js/data/items.js ─────
  // Ritornano { ok, testo } con una riga per la cronaca. Niente DOM.

  /** Compra un oggetto: si indossa (permutando quello che c'era, al prezzo di rivendita) o va nello zaino. */
  compra(nome) {
    const it = Items.catalog[nome];
    if (!it) return { ok: false, testo: 'Questo non è in vendita.' };
    if (it.slot === 'provviste') {
      if (this.zaino.length >= Items.ZAINO_POSTI) return { ok: false, testo: 'Lo zaino è pieno.' };
      if (this.oro < it.prezzo) return { ok: false, testo: `Servono ${it.prezzo} oro.` };
      this.oro -= it.prezzo;
      this.zaino.push(nome);
      return { ok: true, testo: `Metti nello zaino: ${nome} (−${it.prezzo} oro).` };
    }
    const vecchio = this.equip[it.slot];
    const permuta = vecchio ? Items.rivendita(vecchio) : 0;
    if (this.oro + permuta < it.prezzo) return { ok: false, testo: `Servono ${it.prezzo} oro.` };
    this.oro += permuta - it.prezzo;
    this.equip[it.slot] = nome;
    return { ok: true, testo: vecchio
      ? `Prendi ${nome} e lasci ${vecchio} in permuta (−${it.prezzo - permuta} oro).`
      : `Prendi ${nome} (−${it.prezzo} oro).` };
  },

  /** Vende ciò che si indossa in uno slot, o l'oggetto `i` dello zaino (slot = 'zaino'). */
  vendi(slot, i) {
    const nome = slot === 'zaino' ? this.zaino[i] : this.equip[slot];
    if (!nome || !Items.catalog[nome]) return { ok: false, testo: 'Nessuno lo compra.' };
    const v = Items.rivendita(nome);
    if (slot === 'zaino') this.zaino.splice(i, 1); else this.equip[slot] = null;
    this.oro += v;
    return { ok: true, testo: `Vendi ${nome} (+${v} oro).` };
  },

  /** Compra un cavallo (permuta del precedente). */
  compraCavallo(id) {
    const m = Items.MOUNTS[id];
    if (!m) return { ok: false, testo: 'Non c\'è un cavallo così.' };
    const permuta = this.cavallo ? Items.mountResale(this.cavallo.id) : 0;
    if (this.oro + permuta < m.prezzo) return { ok: false, testo: `Servono ${m.prezzo} oro.` };
    const vecchio = this.cavallo;
    this.oro += permuta - m.prezzo;
    this.cavallo = Items.makeMount(id);
    return { ok: true, testo: vecchio ? `Prendi un ${m.nome} e lasci il ${vecchio.nome} in permuta.` : `Prendi un ${m.nome} (−${m.prezzo} oro).` };
  },

  /** Vende il cavallo. */
  vendiCavallo() {
    if (!this.cavallo) return { ok: false, testo: 'Non hai un cavallo.' };
    const v = Items.mountResale(this.cavallo.id), nome = this.cavallo.nome;
    this.cavallo = null; this.inSella = false;
    this.oro += v;
    return { ok: true, testo: `Vendi il ${nome} (+${v} oro).` };
  },

  /** Usa l'oggetto `i` dello zaino (mangiare un pasto, bendarsi). `giorno`: giorno di gioco di oggi. */
  usa(i, giorno) {
    const nome = this.zaino[i], it = nome && Items.catalog[nome];
    if (!it) return { ok: false, testo: 'Non c\'è niente lì.' };
    if (!it.pasto && !it.salute && !it.forza) return { ok: false, testo: `${nome} non si usa così.` };
    if (it.salute && !it.pasto && this.salute.cur >= this.salute.max) return { ok: false, testo: 'Non sei ferito.' };
    this.zaino.splice(i, 1);
    if (it.pasto) this.ultimoPasto = Math.max(this.ultimoPasto, giorno);
    if (it.forza) this.forza.cur = Math.min(this.forza.max, this.forza.cur + it.forza);
    if (it.salute) this.salute.cur = Math.min(this.salute.max, this.salute.cur + it.salute);
    return { ok: true, testo: it.pasto ? `Mangi: ${nome}.` : `Usi: ${nome}.` };
  },

  /**
   * Pasti (docs/GDD.md §2 «Pasti e zaino»): per ogni giorno finito prima di `giorno` senza pasto, il cavaliere mangia
   * da sé un pasto dello zaino; se non ne ha, salta il pasto (−3 Salute). Ritorna { testi, digiuno } (digiuno: almeno
   * un pasto saltato: chi dorme non recupera Forza).
   */
  controllaPasti(giorno) {
    const testi = [];
    let digiuno = false;
    while (this.giornoControllato < giorno) {
      const d = this.giornoControllato;
      if (this.ultimoPasto < d) {
        const i = this.zaino.findIndex((n) => Items.catalog[n] && Items.catalog[n].pasto);
        if (i >= 0) testi.push(this.usa(i, d).testo.replace('Mangi', 'Mangi dallo zaino'));
        else {
          this.salute.cur = Math.max(0, this.salute.cur - 3);
          digiuno = true;
          testi.push('Hai saltato il pasto: la fame si fa sentire (Salute −3).');
        }
      }
      this.giornoControllato++;
    }
    return { testi, digiuno };
  },

  // Nome leggibile del rango corrente (per UI/log).
  rangoNome() {
    const r = RANGHI.find(x => x.id === this.rango);
    return r ? r.nome : this.titolo;
  },

  // Consuma Forza per il bioma del tile percorso.
  // Ritorna false se il tile è impassabile, true altrimenti.
  consumaForza(biome) {
    const base = TRAVEL_COST[biome];
    if (base == null) return false;

    // A cavallo (con vigore) il cavaliere fatica meno: sconto sulla Forza.
    const mounted = this.isMounted();
    const cost = base * (mounted ? 0.7 : 1.0);
    this.forza.cur = Math.max(0, +(this.forza.cur - cost).toFixed(3));

    if (this.cavallo) {
      if (mounted) {
        // Vigore: terreni duri (montagna/palude/neve/ghiaccio) stancano il doppio.
        const dura = (biome === 4 || biome === 5 || biome === 7 || biome === 8);
        this.cavallo.vigore = Math.max(0, this.cavallo.vigore - (dura ? 2 : 1));
      }
      // Abbeverata: attraversare un fiume ridà fiato al cavallo.
      if (biome === 9) {
        this.cavallo.vigore = Math.min(this.cavallo.vigoreMax, this.cavallo.vigore + 8);
      }
    }
    return true;
  },

  // Consumo di Forza per distanza nelle Scene 3D (docs/ESPLORAZIONE_3D.md, M5).
  // metri: distanza orizzontale; salita: dislivello positivo in metri; andatura: chiave di
  // VIAGGIO.FORZA_ANDATURA ('camminata' | 'corsetta' | 'scatto'). Niente arrotondamenti: arriva
  // un pezzetto per fotogramma.
  consumaForzaMetri(metri, salita, andatura) {
    const molt = VIAGGIO.FORZA_ANDATURA[andatura] ?? 1;
    // La salita pesa almeno ×1 anche al passo (camminata ×0 in piano): le montagne restano faticose.
    const equivalenti = metri * molt + Math.max(0, salita || 0) * VIAGGIO.METRI_PER_METRO_SALITA * Math.max(1, molt);
    const cavallo = this.isMounted() ? 0.7 : 1;
    const costo = equivalenti * cavallo * this.forza.max / VIAGGIO.METRI_PER_FORZA_PIENA;
    this.forza.cur = Math.max(0, this.forza.cur - costo);
  },

  // Recupero da fermi nelle Scene 3D, proporzionale al tempo di gioco trascorso (frazione di Passo):
  // stesso ritmo che si aspetti davvero, si usi Avanza o si riposi (docs/ESPLORAZIONE_3D.md, M5).
  riposaPassi(passi) {
    if (!(passi > 0)) return;
    this.forza.cur = Math.min(this.forza.max, this.forza.cur + VIAGGIO.FORZA_RIPOSO_PER_PASSO * passi);
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
