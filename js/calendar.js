// Knight Dawn — calendario del mondo
// Gerarchia: Era → Luce → Stagione → Diario → Passo
//
// 1 Passo    = 1 tile di viaggio (~2-3 ore in-fiction)
// 1 Diario   = 200 Passi  (~25 giorni, "un mese")
// 1 Stagione = 3 Diari = 600 Passi  (~2,5 mesi)
// 1 Luce     = 4 Stagioni = 12 Diari = 2.400 Passi  (~10 mesi, "un anno")
// 1 Era      = 5 Luci = 60 Diari = 12.000 Passi  ("un lustro")
//
// Velocità di scorrimento regolabile dal giocatore: 4–30 sec/passo.

const CALENDAR = {
  PASSI_PER_DIARIO:    200,
  DIARI_PER_STAGIONE:  3,
  STAGIONI_PER_LUCE:   4,
  LUCI_PER_ERA:        5,

  PASSI_PER_STAGIONE:  600,   // 200 × 3
  PASSI_PER_LUCE:      2400,  // 600 × 4
  PASSI_PER_ERA:       12000, // 2400 × 5

  NOMI_STAGIONI: ['Primavera', 'Estate', 'Autunno', 'Inverno'],

  SPEED_MIN: 4,    // sec per passo (massima velocità)
  SPEED_MAX: 30,   // sec per passo (minima velocità)
  SPEED_DEFAULT: 10,
};

const Calendar = {
  ppiTotali: 0,  // passi totali dalla creazione
  era: 1,
  luce: 1,
  stagione: 0,   // indice 0-3 → Primavera..Inverno
  diario: 1,     // 1-based dentro la stagione corrente
  passo: 1,      // 1-based dentro il diario corrente

  inVeglia: true, // true fino all'evento di soglia
  giornoVeglia: 0,

  velocita: CALENDAR.SPEED_DEFAULT, // sec per passo corrente

  init() {
    this.passiTotali  = 0;
    this.era          = 1;
    this.luce         = 1;
    this.stagione     = 0;
    this.diario       = 1;
    this.passo        = 1;
    this.inVeglia     = true;
    this.giornoVeglia = 0;
    this.velocita     = CALENDAR.SPEED_DEFAULT;
  },

  avanza(n) {
    n = n || 1;
    for (let i = 0; i < n; i++) this._tick();
  },

  _tick() {
    this.passiTotali++;

    if (this.inVeglia) {
      this.giornoVeglia++;
      return;
    }

    this.passo++;
    if (this.passo > CALENDAR.PASSI_PER_DIARIO) {
      this.passo = 1;
      this.diario++;
    }
    if (this.diario > CALENDAR.DIARI_PER_STAGIONE) {
      this.diario = 1;
      this.stagione++;
    }
    if (this.stagione >= CALENDAR.STAGIONI_PER_LUCE) {
      this.stagione = 0;
      this.luce++;
    }
    if (this.luce > CALENDAR.LUCI_PER_ERA) {
      this.luce = 1;
      this.era++;
    }
  },

  fineVeglia() {
    this.inVeglia = false;
    this.era      = 1;
    this.luce     = 1;
    this.stagione = 0;
    this.diario   = 1;
    this.passo    = 1;
  },

  nomeStagione() {
    return CALENDAR.NOMI_STAGIONI[this.stagione];
  },

  // "Prima Era", "Seconda Era", ...
  nomeEra() {
    const ord = ['Prima','Seconda','Terza','Quarta','Quinta',
                 'Sesta','Settima','Ottava','Nona','Decima'];
    return (ord[this.era - 1] || this.era + 'ª') + ' Era';
  },

  nomeLuce() {
    const ord = ['Prima','Seconda','Terza','Quarta','Quinta'];
    return (ord[this.luce - 1] || this.luce + 'ª') + ' Luce';
  },

  // Forma estesa: "Passo 5 del Diario 2, Autunno della Seconda Luce, Prima Era"
  formatEsteso() {
    if (this.inVeglia) return 'Veglia · giorno ' + this.giornoVeglia;
    return 'Passo ' + this.passo +
           ' del Diario ' + this.diario +
           ', ' + this.nomeStagione() +
           ' della ' + this.nomeLuce() +
           ', ' + this.nomeEra();
  },

  // Forma compatta HUD: "I · I · Pri 1.5" (era · luce · stagione diario.passo)
  formatCompatto() {
    if (this.inVeglia) return 'Veglia · g' + this.giornoVeglia;
    const stagAbbr = this.nomeStagione().substring(0, 3);
    return this._romano(this.era) + ' · ' +
           this._romano(this.luce) + ' · ' +
           stagAbbr + ' ' + this.diario + '.' + this.passo;
  },

  _romano(n) {
    const rom = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return rom[n] || '' + n;
  },

  setVelocita(sec) {
    this.velocita = Math.max(CALENDAR.SPEED_MIN,
                   Math.min(CALENDAR.SPEED_MAX, sec));
  },

  // Serializzazione per save/load.
  toJSON() {
    return {
      passiTotali:  this.passiTotali,
      era:          this.era,
      luce:         this.luce,
      stagione:     this.stagione,
      diario:       this.diario,
      passo:        this.passo,
      inVeglia:     this.inVeglia,
      giornoVeglia: this.giornoVeglia,
      velocita:     this.velocita,
    };
  },

  fromJSON(data) {
    if (!data) return;
    this.passiTotali  = data.passiTotali  || 0;
    this.era          = data.era          || 1;
    this.luce         = data.luce         || 1;
    this.stagione     = data.stagione     || 0;
    this.diario       = data.diario       || 1;
    this.passo        = data.passo        || 1;
    this.inVeglia     = data.inVeglia !== undefined ? data.inVeglia : true;
    this.giornoVeglia = data.giornoVeglia || 0;
    this.velocita     = data.velocita     || CALENDAR.SPEED_DEFAULT;
  },
};
