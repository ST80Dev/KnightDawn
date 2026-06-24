// FERRO & CENERE — Catalogo stanze dungeon
// Sequenze di stanze (grafo) per dungeon attivabili da POI (cripta, rovine,
// voragine, tempio) o da scelte interne a castelli/monasteri.
//
// Modulo dungeon.js (fase futura) gestirà la mappa stanze e gli archi; qui
// stanno solo i contenuti narrativi per stanza. Target volumi: ~10 per tipo.
//
// Schema atteso (provvisorio):
//   { id, kind:'dungeon', where:{ tipo:'cripta'|'rovine'|'voragine'|'tempio',
//     ruolo:'ingresso'|'corridoio'|'sala'|'trappola'|'bivio'|'finale' },
//     options:[...] }
//
// Da popolare quando si implementa dungeon.js.
