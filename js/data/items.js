// Knight Dawn — Catalogo oggetti e prezzi del mercato
// Economia volutamente semplice (vedi docs/EARLY_GAME.md §4):
//  - prezzi UGUALI in tutti i castelli, nessuna stagionalità;
//  - nessun livello di usura: ogni oggetto ha un prezzo base unico;
//  - rivendita a una FRAZIONE FISSA del prezzo base (perché "usato"),
//    uguale per tutti gli oggetti.
//
// L'equip del cavaliere memorizza il NOME dell'oggetto (stringa). Questo
// catalogo mappa nome → { slot, prezzo, glyph } per il mercato. Gli oggetti
// non in catalogo (ricompense uniche) non sono rivendibili.
// I valori sono [DA BILANCIARE] con l'economia generale.

const Items = {
  // Frazione del prezzo base che si ottiene rivendendo (oggetto usato).
  RESALE: 0.5,

  // Ordine canonico degli slot (per liste ordinate e vendita).
  SLOT_ORDER: ['arma', 'armatura', 'scudo', 'speciale', 'viaggio'],

  // Zaino (G1 passo 3, docs/GDD.md §2 «Pasti e zaino»): pochi posti per le cose che si consumano. Gli oggetti con
  // slot 'provviste' vanno nello zaino, non si indossano.
  ZAINO_POSTI: 8,

  // Cosa vende ogni bottega del borgo (tipo di edificio, js/3d/edifici3d.js → categorie). Prezzi uguali ovunque.
  NEGOZI: {
    fabbro:       { nome: 'Il fabbro',          vende: ['arma', 'scudo'] },
    armeria:      { nome: "L'armeria",          vende: ['arma', 'armatura', 'scudo'] },
    loggia:       { nome: 'Il mercato',         vende: ['provviste', 'viaggio'] },
    loggiaGrande: { nome: 'Il mercato',         vende: ['provviste', 'viaggio', 'armatura'] },
    taverna:      { nome: "L'oste",             vende: ['provviste'] },
    stalla:       { nome: 'Lo stalliere',       vende: ['cavalli'] },
  },

  catalog: {
    // ── Armi ──
    'Coltello da contadino': { slot: 'arma', prezzo: 4,  glyph: '⚔' },
    'Lancia da fante':       { slot: 'arma', prezzo: 9,  glyph: '⚔' },
    'Spada da arme':         { slot: 'arma', prezzo: 18, glyph: '⚔' },
    'Spada bastarda':        { slot: 'arma', prezzo: 32, glyph: '⚔' },
    // ── Armature ──
    'Giaco di cuoio':        { slot: 'armatura', prezzo: 10, glyph: '◇' },
    'Cotta di maglia':       { slot: 'armatura', prezzo: 28, glyph: '◇' },
    // ── Scudi ──
    'Scudo di legno':        { slot: 'scudo', prezzo: 6,  glyph: '◈' },
    'Scudo da campo':        { slot: 'scudo', prezzo: 16, glyph: '◈' },
    // ── Da viaggio ──
    'Mantello da viandante': { slot: 'viaggio', prezzo: 5,  glyph: '◊' },
    'Mantello scuro':        { slot: 'viaggio', prezzo: 9,  glyph: '◊' },
    // ── Provviste (nello zaino) ── pasto: vale il pasto del giorno; forza/salute: quanto rende usarlo.
    'Pane e formaggio':      { slot: 'provviste', prezzo: 1, glyph: '❦', pasto: true },
    'Carne secca e mele':    { slot: 'provviste', prezzo: 2, glyph: '❦', pasto: true, forza: 8 },
    'Bende di lino':         { slot: 'provviste', prezzo: 2, glyph: '✚', salute: 15 },
  },

  /** Oggetti in vendita in una bottega (lista come buyList), cavalli esclusi. */
  inVendita(categorie) {
    return this.buyList().filter((it) => categorie.includes(it.slot));
  },

  prezzo(nome)  { const it = this.catalog[nome]; return it ? it.prezzo : 0; },
  slotOf(nome)  { const it = this.catalog[nome]; return it ? it.slot : null; },
  glyphOf(nome) { const it = this.catalog[nome]; return it ? it.glyph : '•'; },

  // Valore di rivendita (frazione fissa del prezzo base, arrotondata in basso).
  rivendita(nome) { return Math.floor(this.prezzo(nome) * this.RESALE); },

  // ── Cavalli (montature) ──────────────────────────────────────────────────
  // Ogni cavallo ha DUE caratteristiche su assi diversi:
  //   vigoreMax = riserva di VIAGGIO: tile percorribili a cavallo prima che sia
  //               stremato (poi serve un fiume o una sosta). Vedi consumaForza.
  //   possa     = forza in BATTAGLIA: bonus al combattimento quando si è in
  //               sella (vedi js/combat.js). Un destriero da guerra carica
  //               forte; un palafreno da sella è comodo ma inutile in mischia.
  // I tier sono SPECIALIZZATI, non una scala lineare: si sceglie tra cavallo da
  // viaggio (molto vigore, poca possa) e cavallo da guerra (molta possa, meno
  // autonomia). Numeri [DA BILANCIARE].
  MOUNTS: {
    ronzino:   { nome: 'Ronzino',   prezzo: 14, vigoreMax: 20, possa: 0, glyph: '♞' },
    corsiero:  { nome: 'Corsiero',  prezzo: 38, vigoreMax: 40, possa: 1, glyph: '♞' },
    destriero: { nome: 'Destriero', prezzo: 60, vigoreMax: 28, possa: 3, glyph: '♞' },
    palafreno: { nome: 'Palafreno', prezzo: 46, vigoreMax: 52, possa: 0, glyph: '♞' },
  },

  // Lista cavalli acquistabili.
  mountList() {
    return Object.keys(this.MOUNTS).map(id => ({ id, ...this.MOUNTS[id] }));
  },

  // Crea un'istanza di montatura (vigore pieno) da mettere in Knight.cavallo.
  makeMount(id) {
    const m = this.MOUNTS[id];
    if (!m) return null;
    return { id, nome: m.nome, vigore: m.vigoreMax, vigoreMax: m.vigoreMax, possa: m.possa || 0 };
  },

  // Valore di rivendita di una montatura (stessa frazione fissa).
  mountResale(id) {
    const m = this.MOUNTS[id];
    return m ? Math.floor(m.prezzo * this.RESALE) : 0;
  },

  // Lista acquistabile: tutti gli oggetti del catalogo, ordinati per slot e
  // poi per prezzo crescente (così i più economici sono in cima).
  buyList() {
    const out = Object.keys(this.catalog).map(nome => ({
      nome, ...this.catalog[nome],
    }));
    out.sort((a, b) => {
      const sa = this.SLOT_ORDER.indexOf(a.slot), sb = this.SLOT_ORDER.indexOf(b.slot);
      return sa !== sb ? sa - sb : a.prezzo - b.prezzo;
    });
    return out;
  },
};
