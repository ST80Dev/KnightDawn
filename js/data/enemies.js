// FERRO & CENERE — Catalogo nemici (dati)
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
//     roundMin,     // durata minima scontro in Round (= Passi calendario)
//     roundMax,     // durata massima
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

// ─── Bestie selvatiche (terreno conta — affinità leggere) ──────────────────
Enemies.register({
  id: 'bestie.lupo', nome: 'Lupo', tipo: 'bestia',
  categoria: 'lupo', numerosita: 'singolo',
  sfida: 10, roundMin: 2, roundMax: 3, accettaResa: false,
  terreni: { favorevole: [2, 7], sfavorevole: [1, 11, 12] },  // bosco/neve
  descr: 'Affamato e rapido. Pericoloso fra gli alberi, esposto in pianura.',
});
Enemies.register({
  id: 'bestie.branco', nome: 'Branco di lupi', tipo: 'bestia',
  categoria: 'lupo', numerosita: 'orda',
  sfida: 12, roundMin: 3, roundMax: 5, accettaResa: false,
  terreni: { favorevole: [2, 7], sfavorevole: [1, 11, 12] },
  descr: 'Molti occhi nel buio. Il numero li rende audaci.',
});
Enemies.register({
  id: 'bestie.orso', nome: 'Orso', tipo: 'bestia',
  categoria: 'orso', numerosita: 'singolo',
  sfida: 13, roundMin: 4, roundMax: 6, accettaResa: false,
  terreni: { favorevole: [2, 3], sfavorevole: [1] },
  descr: 'Una montagna di muscoli e artigli. Pochi colpi, ma devastanti.',
});
Enemies.register({
  id: 'bestie.cinghiale', nome: 'Cinghiale', tipo: 'bestia',
  categoria: 'cinghiale', numerosita: 'singolo',
  sfida: 11, roundMin: 2, roundMax: 4, accettaResa: false,
  terreni: { favorevole: [2, 5], sfavorevole: [1] },
  descr: 'Caricatore cieco e testardo. Sottovalutarlo costa caro.',
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
  categoria: 'nonmorto', numerosita: 'orda',
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
  sfida: 11, roundMin: 4, roundMax: 6, accettaResa: false,
  descr: 'Due drappelli che si urtano lungo una strada o un guado.',
});
Enemies.register({
  id: 'guerra.battaglia', nome: 'Battaglia campale', tipo: 'umano',
  categoria: 'battaglia', numerosita: 'orda',
  sfida: 12, roundMin: 10, roundMax: 20, accettaResa: false,
  descr: 'Eserciti schierati. Schieramento, urto, mischia, rotta.',
});
Enemies.register({
  id: 'guerra.assedio', nome: 'Assedio', tipo: 'umano',
  categoria: 'battaglia', numerosita: 'orda',
  sfida: 14, roundMin: 30, roundMax: 60, accettaResa: false,
  descr: 'Giorni sotto le mura. Fame, macchine d\'assedio, sortite.',
});
