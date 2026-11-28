// Knight Dawn — Catalogo nemici (dati)
// Archetipi di avversari usati dal motore di combattimento (js/combat.js).
// Solo dati: nessuna logica di scontro qui. Gli eventi referenziano un nemico
// per id stringa (es. 'banditi.viandante') nell'effetto { type:'combat', ... };
// Combat.start risolve la stringa via Enemies.get().
//
// Design e tabella Round per archetipo: docs/COMBAT.md §2 e §6.
//
// Schema nemico:
//   {
//     id,           // stringa namespaced unica: 'categoria.nome'
//     nome,         // etichetta di display
//     tipo,         // 'umano' | 'bestia' | 'mitico'
//     categoria,    // archetipo leggibile: 'ladro'|'bandito'|'cavaliere'|...
//     numerosita,   // 'singolo' | 'gruppo' | 'orda' — combattenti avversari.
//                   //   Esplicita per i futuri modificatori seguito-vs-numero.
//     sfida,        // difficoltà nella formula di Round (vedi combat.js §5).
//                   //   Scala di riferimento (TBD bilanciamento S9):
//                   //   ~9 debole · ~11 medio · ~13 forte · ~15 letale
//     roundMin,     // durata minima scontro in Round
//     roundMax,     // durata massima
//     minutiRound,  // opz. minuti di gioco per Round (docs/COMBAT.md §2); senza,
//                   //   Combat.minutiRound li ricava dalla durata (2–5 minuti)
//     accettaResa,  // se false, il nemico non concede quartiere
//     terreni,      // opz. affinità LEGGERE (±1, mai decisive). Dal punto di
//                   //   vista del NEMICO: { favorevole:[biomi], sfavorevole:[biomi] }
//                   //   biomi = codici World.BIOME (1 PIANURA, 2 FORESTA, 4 MONTAGNA…)
//     descr,        // breve testo di sapore (per UI/cronaca)
//   }
//
// Note:
// - Il BOTTINO non è nei dati del nemico: si calcola a fine scontro (cosa
//   porta addosso un nemico è deciso al momento, non a priori).
// - 'parlamento' è ammesso solo per tipo 'umano' e con Onore alto (gestito
//   in combat.js, non serve un flag per nemico).
// - Le bestie degli incontri fuori porta hanno campi in più (habitat, ore, tratti, danno…): vedi più sotto.

const Enemies = {
  catalog: {},

  register(e) { this.catalog[e.id] = e; },

  // Risolve un nemico per id. Se passato già un oggetto nemico, lo ritorna
  // invariato (comodo per nemici ad-hoc definiti inline in un evento).
  get(idOrObj) {
    if (idOrObj && typeof idOrObj === 'object') return idOrObj;
    return this.catalog[idOrObj] || null;
  },

  all() { return Object.values(this.catalog); },

  // Tutti i nemici di una categoria (per selezione pesata futura).
  byCategoria(cat) { return this.all().filter(e => e.categoria === cat); },
};

// Codici bioma di riferimento (vedi js/knight.js TRAVEL_COST / World.BIOME):
//   1 PIANURA · 2 FORESTA · 3 COLLINA · 4 MONTAGNA · 5 PALUDE · 6 SABBIA
//   7 NEVE · 8 GHIACCIO · 10 ROCCIA · 11 PIANURA_N · 12 PIANURA_S

// ─── Umani: predoni e fuorilegge (scontri brevi, 1–4 Round) ────────────────
Enemies.register({
  id: 'banditi.ladro', nome: 'Ladro di strada', tipo: 'umano',
  categoria: 'ladro', numerosita: 'singolo',
  sfida: 9, roundMin: 1, roundMax: 1, accettaResa: true,
  descr: 'Un tagliaborse magro, più svelto che coraggioso. Fugge se può.',
});
Enemies.register({
  id: 'banditi.predone', nome: 'Predone', tipo: 'umano',
  categoria: 'bandito', numerosita: 'singolo',
  sfida: 11, roundMin: 2, roundMax: 3, accettaResa: true,
  descr: 'Brigante armato di ascia e malanimo, avvezzo alle imboscate.',
});
Enemies.register({
  id: 'banditi.boscaglia', nome: 'Banda della boscaglia', tipo: 'umano',
  categoria: 'bandito', numerosita: 'gruppo',
  sfida: 12, roundMin: 3, roundMax: 4, accettaResa: false,
  terreni: { favorevole: [2], sfavorevole: [1, 11, 12] },  // imboscate nel bosco
  descr: 'Un drappello di fuorilegge: in numero trovano il coraggio che non hanno.',
});

// ─── Umani: soldati e cavalieri (scontri medi, 3–6 Round) ──────────────────
Enemies.register({
  id: 'casata.soldato', nome: 'Soldato di casata', tipo: 'umano',
  categoria: 'soldato', numerosita: 'singolo',
  sfida: 12, roundMin: 3, roundMax: 5, accettaResa: true,
  descr: 'Armato e disciplinato, combatte per paga e per il suo signore.',
});
Enemies.register({
  id: 'casata.cavaliere', nome: 'Cavaliere avversario', tipo: 'umano',
  categoria: 'cavaliere', numerosita: 'singolo',
  sfida: 13, roundMin: 4, roundMax: 6, accettaResa: true,
  descr: 'Pari rango e pari ferro. Un duello che decide reputazioni.',
});

// ─── Bestie selvatiche: gli incontri fuori porta (G1 passo 5, docs/EARLY_GAME.md §7) ──────────────────────
// Si incontrano camminando fuori dai borghi (Combat.pescaIncontro), più spesso lontano dalle strade, di sera e di
// notte. Campi in più delle bestie:
//   habitat  { bioma: peso } — dove vivono (codici sopra); senza, nessun incontro casuale
//   ore      { giorno, sera, notte } — moltiplicatori del peso per momento del giorno (default 1)
//   tratti   caratteristiche di combattimento (js/combat.js):
//            veloce — fuggire è difficile (anche in sella, se non si galoppa)
//            branco — più Round, e a ogni Round un morso in più può arrivare da un fianco
//            carica — il primo Round è una carica: se non la reggi ti travolge, se la schivi guadagni terreno
//            veleno — se ti ha ferito, dopo lo scontro il veleno toglie ancora Salute (veleno: quanta)
//            timido — se lo Slancio gira a tuo favore (≥ 3, Combat.TIMIDO_FUGGE) l'animale scappa: è una vittoria
//   danno    [min, max] Salute di un colpo pieno (prima dell'armatura)
//   forte    non lo si incontra nella Veglia prima della prima battaglia (un garzone non regge un orso)
//   incontro testo della carta che lo annuncia
// sfida, Round e danni [DA BILANCIARE]: tarati in Node (1000 scontri per animale) perché il garzone con il
// coltello vinca più spesso di quanto perda contro un lupo, e non regga un orso.
Enemies.register({
  id: 'bestie.lupo', nome: 'Lupo', tipo: 'bestia', categoria: 'lupo', numerosita: 'singolo',
  sfida: 5.5, roundMin: 2, roundMax: 3, accettaResa: false, tratti: ['veloce'], danno: [8, 14],
  habitat: { 2: 3, 3: 2, 4: 1, 7: 3, 8: 1, 5: 0.5 }, ore: { giorno: 0.5, sera: 1.5, notte: 2 },
  incontro: 'Un lupo grigio esce dal folto e si ferma a una ventina di passi. Ti guarda con la testa bassa, le orecchie dritte. Non scappa.',
  descr: 'Affamato e rapido. Fuggirgli è difficile; affrontarlo, possibile.',
});
Enemies.register({
  id: 'bestie.branco', nome: 'Branco di lupi', tipo: 'bestia', categoria: 'lupo', numerosita: 'orda',
  sfida: 8, roundMin: 3, roundMax: 4, accettaResa: false, tratti: ['veloce', 'branco'], danno: [6, 11], forte: true,
  habitat: { 2: 2, 3: 1, 4: 1, 7: 3, 8: 1 }, ore: { giorno: 0.15, sera: 1, notte: 2.5 },
  incontro: 'Un ululato, poi un altro, più vicino. Fra gli alberi si accendono occhi, tre, cinque. Il branco ti ha preso in mezzo.',
  descr: 'Molti occhi nel buio. Il numero li rende audaci, e uno ti morde sempre da dove non guardi.',
});
Enemies.register({
  id: 'bestie.cinghiale', nome: 'Cinghiale', tipo: 'bestia', categoria: 'cinghiale', numerosita: 'singolo',
  sfida: 5, roundMin: 2, roundMax: 3, accettaResa: false, tratti: ['carica'], danno: [8, 15],
  habitat: { 2: 3, 3: 2, 5: 2.5, 1: 0.3 }, ore: { giorno: 0.8, sera: 1.5, notte: 1.2 },
  incontro: 'Un grugnito fra i cespugli, un fruscio pesante: un cinghiale maschio, le setole ritte, raspa la terra con lo zoccolo.',
  descr: 'Carica a testa bassa. Chi regge il primo urto ha già fatto metà del lavoro.',
});
Enemies.register({
  id: 'bestie.orso', nome: 'Orso', tipo: 'bestia', categoria: 'orso', numerosita: 'singolo',
  sfida: 10, roundMin: 3, roundMax: 5, accettaResa: false, tratti: ['carica'], danno: [14, 24], forte: true,
  habitat: { 4: 3, 2: 0.6, 3: 0.4, 7: 0.5 }, ore: { giorno: 1, sera: 1.2, notte: 0.6 },
  incontro: 'L\'orso si alza sulle zampe posteriori, più alto di un uomo, e soffia. Fra te e lui ci sono solo pochi passi di sassi.',
  descr: 'Una montagna di muscoli e artigli. Meglio non farsi trovare; se ti trova, meglio non restare.',
});
Enemies.register({
  id: 'bestie.vipera', nome: 'Vipera', tipo: 'bestia', categoria: 'vipera', numerosita: 'singolo',
  sfida: 4, roundMin: 1, roundMax: 2, accettaResa: false, tratti: ['veleno', 'timido'], danno: [3, 6], veleno: 12,
  habitat: { 10: 3, 6: 3, 3: 1.2, 1: 0.4, 11: 0.4, 12: 0.6 }, ore: { giorno: 1.5, sera: 0.8, notte: 0.2 },
  incontro: 'Fra le pietre calde, a un palmo dal tuo piede, una vipera si raccoglie a spirale e sibila.',
  descr: 'Piccola e lenta, ma il suo morso brucia per ore.',
});
Enemies.register({
  id: 'bestie.aquila', nome: 'Aquila reale', tipo: 'bestia', categoria: 'aquila', numerosita: 'singolo',
  sfida: 5, roundMin: 1, roundMax: 2, accettaResa: false, tratti: ['veloce', 'timido'], danno: [4, 9],
  habitat: { 4: 2, 10: 2, 7: 0.5 }, ore: { giorno: 1.5, sera: 0.5, notte: 0 },
  incontro: 'Un\'ombra passa sulle rocce, poi un grido: un\'aquila scende in picchiata, gli artigli aperti. Il nido deve essere vicino.',
  descr: 'Difende il nido dall\'alto. Non la si sfugge correndo; la si scaccia tenendo testa.',
});
Enemies.register({
  id: 'bestie.cani', nome: 'Cani inselvatichiti', tipo: 'bestia', categoria: 'cani', numerosita: 'gruppo',
  sfida: 6, roundMin: 2, roundMax: 4, accettaResa: false, tratti: ['branco', 'timido'], danno: [4, 8],
  habitat: { 1: 3, 11: 3, 12: 3, 6: 1, 3: 0.6 }, ore: { giorno: 0.6, sera: 1.5, notte: 1.5 },
  incontro: 'Cani senza padrone, magri e spelacchiati, ti vengono incontro nell\'erba alta abbaiando. Uno ringhia più degli altri.',
  descr: 'Un branco di randagi della pianura: coraggiosi in molti, vigliacchi appena uno guaisce.',
});
Enemies.register({
  id: 'bestie.cervo', nome: 'Cervo in amore', tipo: 'bestia', categoria: 'cervo', numerosita: 'singolo',
  sfida: 5.5, roundMin: 1, roundMax: 2, accettaResa: false, tratti: ['carica', 'timido'], danno: [8, 14],
  habitat: { 2: 1.5, 1: 1.2, 11: 1, 12: 1, 3: 0.8 }, ore: { giorno: 0.8, sera: 1.5, notte: 0.8 },
  incontro: 'Un bramito ti fa voltare: un cervo con un palco enorme abbassa la testa e ti punta, come fossi un rivale.',
  descr: 'Nella stagione degli amori non cede il passo. Regge una carica, poi di solito se ne va.',
});

// ─── Creature mitiche (scontri lunghi, 5–12 Round) ─────────────────────────
// Tono medievale-oscuro ispirato a Tolkien e Martin: niente magia barocca,
// piuttosto orrore antico, non-morti, bestie di leggenda del nord.
Enemies.register({
  id: 'mitici.spettro', nome: 'Spettro delle rovine', tipo: 'mitico',
  categoria: 'nonmorto', numerosita: 'singolo',
  sfida: 14, roundMin: 5, roundMax: 8, accettaResa: false,
  terreni: { favorevole: [10] },  // rovine/roccia
  descr: 'Ciò che resta di un guerriero antico, legato alle pietre cadute.',
});
Enemies.register({
  id: 'mitici.troll', nome: 'Troll delle pietre', tipo: 'mitico',
  categoria: 'gigante', numerosita: 'singolo',
  sfida: 15, roundMin: 6, roundMax: 9, accettaResa: false,
  terreni: { favorevole: [4, 10], sfavorevole: [1] },  // montagna; teme la luce aperta
  descr: 'Pelle come scisto, mazza come un tronco. Lento, ma ogni colpo è una condanna.',
});
Enemies.register({
  id: 'mitici.mannaro', nome: 'Licantropo', tipo: 'mitico',
  categoria: 'mutaforma', numerosita: 'singolo',
  sfida: 14, roundMin: 5, roundMax: 8, accettaResa: false,
  terreni: { favorevole: [2, 7] },  // bosco, inverno
  descr: 'Mezzo uomo, mezzo lupo, tutto fame. Caccia quando le lune si allineano.',
});
Enemies.register({
  id: 'mitici.ragno', nome: 'Ragno gigante', tipo: 'mitico',
  categoria: 'ragno', numerosita: 'singolo',
  sfida: 14, roundMin: 5, roundMax: 8, accettaResa: false,
  terreni: { favorevole: [2, 5], sfavorevole: [1, 6] },  // foreste fitte, paludi
  descr: 'Tessitrice di tenebra fra gli alberi. Dove cala il silenzio, lei aspetta.',
});
Enemies.register({
  id: 'mitici.non_morti', nome: 'Schiera dei non-morti', tipo: 'mitico',
  categoria: 'orda', numerosita: 'orda',
  sfida: 15, roundMin: 8, roundMax: 12, accettaResa: false,
  terreni: { favorevole: [7, 8] },  // gelo del nord
  descr: 'Morti che camminano sotto il gelo. Non si stancano, non temono, non finiscono mai.',
});
Enemies.register({
  id: 'mitici.bestiamitica', nome: 'Bestia di leggenda', tipo: 'mitico',
  categoria: 'bestiamitica', numerosita: 'singolo',
  sfida: 16, roundMin: 9, roundMax: 12, accettaResa: false,
  descr: 'Creatura da cantastorie. Affrontarla è già materia da cronaca.',
});

// ── Creature mitiche (ispirazione LotR/GoT) ────────────────────────────────
Enemies.register({
  id: 'mitici.drago', nome: 'Drago', tipo: 'mitico',
  categoria: 'drago', numerosita: 'singolo',
  sfida: 17, roundMin: 10, roundMax: 14, accettaResa: false,
  terreni: { favorevole: [4, 10] },  // alture e rovine
  descr: 'Ali come vele nere, gola di fuoco. Chi lo affronta entra nella leggenda — o nella cenere.',
});
Enemies.register({
  id: 'mitici.orchi', nome: 'Banda di orchi', tipo: 'mitico',
  categoria: 'orchi', numerosita: 'orda',
  sfida: 13, roundMin: 4, roundMax: 7, accettaResa: false,
  terreni: { favorevole: [2, 5, 10], sfavorevole: [1] },  // ombra e cunicoli
  descr: 'Zanne, ferro arrugginito e un fetore che precede l\'assalto. Vengono in molti.',
});
Enemies.register({
  id: 'mitici.cavaliere_nero', nome: 'Cavaliere nero', tipo: 'mitico',
  categoria: 'wraith', numerosita: 'singolo',
  sfida: 16, roundMin: 7, roundMax: 10, accettaResa: false,
  descr: 'Un\'armatura vuota in sella a un destriero d\'ombra. Dove passa, la Volontà gela.',
});
Enemies.register({
  id: 'mitici.spettro_gelo', nome: 'Spettro del gelo', tipo: 'mitico',
  categoria: 'gelo', numerosita: 'singolo',
  sfida: 16, roundMin: 7, roundMax: 10, accettaResa: false,
  terreni: { favorevole: [7, 8] },  // neve e ghiaccio del Nord
  descr: 'Occhi come schegge di ghiaccio. Avanza nel silenzio bianco, lancia levata.',
});

// ─── Battaglie e assedi (scontri di massa, fasi narrative — vedi COMBAT.md) ─
Enemies.register({
  id: 'guerra.scaramuccia', nome: 'Scaramuccia', tipo: 'umano',
  categoria: 'battaglia', numerosita: 'gruppo',
  sfida: 11, roundMin: 4, roundMax: 6, minutiRound: 10, accettaResa: false,
  descr: 'Due drappelli che si urtano lungo una strada o un guado.',
});
Enemies.register({
  id: 'guerra.battaglia', nome: 'Battaglia campale', tipo: 'umano',
  categoria: 'battaglia', numerosita: 'orda',
  sfida: 12, roundMin: 10, roundMax: 20, minutiRound: 60, accettaResa: false,
  descr: 'Eserciti schierati. Schieramento, urto, mischia, rotta.',
});
Enemies.register({
  id: 'guerra.assedio', nome: 'Assedio', tipo: 'umano',
  categoria: 'battaglia', numerosita: 'orda',
  sfida: 14, roundMin: 30, roundMax: 60, minutiRound: 180, accettaResa: false,
  descr: 'Giorni sotto le mura. Fame, macchine d\'assedio, sortite.',
});
