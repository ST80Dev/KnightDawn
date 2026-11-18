// Knight Dawn — calendario del mondo
// Gerarchia: Era → Luce → Stagione → Diario → Passo
//
// 1 Passo    = ~3 ore in-fiction (unità di tempo; nelle Scene 3D la distanza si
//              converte in frazioni di Passo, vedi VIAGGIO in config.js)
// 1 giorno   = 8 Passi, uno per ora canonica (Prima, Terza, … Lodi)
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
  PASSI_PER_GIORNO:    8,

  // Un Passo per ogni ora canonica; il giorno di gioco comincia a Prima (~6:00).
  ORE_CANONICHE: ['Prima', 'Terza', 'Sesta', 'Nona', 'Vespri', 'Compieta', 'Mattutino', 'Lodi'],
  ORA_INIZIO_GIORNO: 6,

  NOMI_STAGIONI: ['Primavera', 'Estate', 'Autunno', 'Inverno'],

  SPEED_MIN: 4,    // sec per passo (massima velocità)
  SPEED_MAX: 30,   // sec per passo (minima velocità)
  SPEED_DEFAULT: 10,
};

const Calendar = {
  passiTotali: 0,  // passi totali dalla creazione
  frazione: 0,     // parte del Passo corrente già trascorsa (0–1): la accumulano le Scene 3D
  era: 1,
  luce: 1,
  stagione: 0,   // indice 0-3 → Primavera..Inverno
  diario: 1,     // 1-based dentro la stagione corrente
  passo: 1,      // 1-based dentro il diario corrente

  inVeglia: true, // true fino all'evento di soglia
  giornoVeglia: 1, // ricavato dai Passi: 8 Passi = 1 giorno

  velocita: CALENDAR.SPEED_DEFAULT, // sec per passo corrente

  init() {
    this.passiTotali  = 0;
    this.frazione     = 0;
    this.era          = 1;
    this.luce         = 1;
    this.stagione     = 0;
    this.diario       = 1;
    this.passo        = 1;
    this.inVeglia     = true;
    this.giornoVeglia = 1;
    this.velocita     = CALENDAR.SPEED_DEFAULT;
  },

  // Avanza di una frazione di Passo (anche minuscola, ogni fotogramma): i Passi interi scattano
  // quando la frazione accumulata supera 1.
  avanzaFrazione(f) {
    if (!(f > 0)) return;
    this.frazione += f;
    while (this.frazione >= 1) {
      this.frazione -= 1;
      this._tick();
    }
  },

  // Tempo per distanza nelle Scene 3D: metri orizzontali + sovrappiù per la salita.
  // L'andatura non conta: correndo si copre la stessa distanza prima, non si "spende" più tempo.
  avanzaMetri(metri, salita) {
    const equivalenti = metri + Math.max(0, salita || 0) * VIAGGIO.METRI_PER_METRO_SALITA;
    this.avanzaFrazione(equivalenti / VIAGGIO.METRI_PER_PASSO);
  },

  // Indice del Passo nel giorno (0 = Prima … 7 = Lodi).
  indiceNelGiorno() {
    const n = this.inVeglia ? this.passiTotali : this.passo - 1;
    return ((n % CALENDAR.PASSI_PER_GIORNO) + CALENDAR.PASSI_PER_GIORNO) % CALENDAR.PASSI_PER_GIORNO;
  },

  oraCanonica() {
    return CALENDAR.ORE_CANONICHE[this.indiceNelGiorno()];
  },

  // Ora approssimativa (0–24, con decimali) per il pannello F3 e, più avanti, la luce del giorno.
  oraDelGiorno() {
    const ore = 24 / CALENDAR.PASSI_PER_GIORNO;
    return (CALENDAR.ORA_INIZIO_GIORNO + (this.indiceNelGiorno() + this.frazione) * ore) % 24;
  },

  avanza(n) {
    n = n || 1;
    for (let i = 0; i < n; i++) this._tick();
  },

  _tick() {
    this.passiTotali++;

    if (this.inVeglia) {
      this.giornoVeglia = 1 + Math.floor(this.passiTotali / CALENDAR.PASSI_PER_GIORNO);
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
      frazione:     this.frazione,
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
    this.frazione     = data.frazione     || 0;
    this.era          = data.era          || 1;
    this.luce         = data.luce         || 1;
    this.stagione     = data.stagione     || 0;
    this.diario       = data.diario       || 1;
    this.passo        = data.passo        || 1;
    this.inVeglia     = data.inVeglia !== undefined ? data.inVeglia : true;
    this.giornoVeglia = data.giornoVeglia || 1;
    this.velocita     = data.velocita     || CALENDAR.SPEED_DEFAULT;
  },
};
