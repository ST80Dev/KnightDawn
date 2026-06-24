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
//     sfida,        // difficoltà nella formula di Round (vedi combat.js §5).
//                   //   Scala di riferimento (TBD bilanciamento S9):
//                   //   ~9 debole · ~11 medio · ~13 forte · ~15 letale
//     roundMin,     // durata minima scontro in Round (= Passi calendario)
//     roundMax,     // durata massima
//     accettaResa,  // se false, il nemico non concede quartiere
//     descr,        // breve testo di sapore (per UI/cronaca)
//   }
//
// Nota: 'parlamento' è ammesso solo per tipo 'umano' e con Onore alto
// (gestito in combat.js, non serve un flag per nemico).

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

// ─── Umani: predoni e fuorilegge (scontri brevi, 1–3 Round) ────────────────
Enemies.register({
  id: 'banditi.ladro', nome: 'Ladro di strada', tipo: 'umano',
  categoria: 'ladro', sfida: 9, roundMin: 1, roundMax: 1, accettaResa: true,
  descr: 'Un tagliaborse magro, più svelto che coraggioso. Fugge se può.',
});
Enemies.register({
  id: 'banditi.predone', nome: 'Predone', tipo: 'umano',
  categoria: 'bandito', sfida: 11, roundMin: 2, roundMax: 3, accettaResa: true,
  descr: 'Brigante armato di ascia e malanimo, avvezzo alle imboscate.',
});
Enemies.register({
  id: 'banditi.boscaglia', nome: 'Banda della boscaglia', tipo: 'umano',
  categoria: 'bandito', sfida: 12, roundMin: 3, roundMax: 4, accettaResa: false,
  descr: 'Un drappello di fuorilegge: in numero trovano il coraggio che non hanno.',
});

// ─── Umani: soldati e cavalieri (scontri medi, 4–6 Round) ──────────────────
Enemies.register({
  id: 'casata.soldato', nome: 'Soldato di casata', tipo: 'umano',
  categoria: 'soldato', sfida: 12, roundMin: 3, roundMax: 5, accettaResa: true,
  descr: 'Armato e disciplinato, combatte per paga e per il suo signore.',
});
Enemies.register({
  id: 'casata.cavaliere', nome: 'Cavaliere avversario', tipo: 'umano',
  categoria: 'cavaliere', sfida: 13, roundMin: 4, roundMax: 6, accettaResa: true,
  descr: 'Pari rango e pari ferro. Un duello che decide reputazioni.',
});

// ─── Bestie selvatiche (terreno conta, vedi combat.js _terrenoBonus) ───────
Enemies.register({
  id: 'bestie.lupo', nome: 'Lupo', tipo: 'bestia',
  categoria: 'lupo', sfida: 10, roundMin: 2, roundMax: 3, accettaResa: false,
  descr: 'Affamato e rapido. Pericoloso fra gli alberi, esposto in pianura.',
});
Enemies.register({
  id: 'bestie.branco', nome: 'Branco di lupi', tipo: 'bestia',
  categoria: 'lupo', sfida: 12, roundMin: 3, roundMax: 5, accettaResa: false,
  descr: 'Molti occhi nel buio. Il numero li rende audaci.',
});
Enemies.register({
  id: 'bestie.orso', nome: 'Orso', tipo: 'bestia',
  categoria: 'orso', sfida: 13, roundMin: 4, roundMax: 6, accettaResa: false,
  descr: 'Una montagna di muscoli e artigli. Pochi colpi, ma devastanti.',
});

// ─── Creature mitiche (scontri lunghi, 6–10 Round) ─────────────────────────
Enemies.register({
  id: 'mitici.spettro', nome: 'Spettro delle rovine', tipo: 'mitico',
  categoria: 'mitico', sfida: 14, roundMin: 6, roundMax: 8, accettaResa: false,
  descr: 'Ciò che resta di un guerriero antico, legato alle pietre cadute.',
});
Enemies.register({
  id: 'mitici.bestiamitica', nome: 'Bestia mitica', tipo: 'mitico',
  categoria: 'mitico', sfida: 15, roundMin: 8, roundMax: 10, accettaResa: false,
  descr: 'Creatura di leggenda. Affrontarla è già materia da cronaca.',
});

// ─── Battaglie e assedi (scontri di massa, fasi narrative — vedi COMBAT.md) ─
Enemies.register({
  id: 'guerra.scaramuccia', nome: 'Scaramuccia', tipo: 'umano',
  categoria: 'battaglia', sfida: 11, roundMin: 4, roundMax: 6, accettaResa: false,
  descr: 'Due drappelli che si urtano lungo una strada o un guado.',
});
Enemies.register({
  id: 'guerra.battaglia', nome: 'Battaglia campale', tipo: 'umano',
  categoria: 'battaglia', sfida: 12, roundMin: 10, roundMax: 20, accettaResa: false,
  descr: 'Eserciti schierati. Schieramento, urto, mischia, rotta.',
});
Enemies.register({
  id: 'guerra.assedio', nome: 'Assedio', tipo: 'umano',
  categoria: 'battaglia', sfida: 14, roundMin: 30, roundMax: 60, accettaResa: false,
  descr: 'Giorni sotto le mura. Fame, macchine d\'assedio, sortite.',
});
