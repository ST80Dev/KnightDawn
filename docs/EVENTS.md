# FERRO & CENERE — Eventi e incontri

> **Stato:** stub. Verrà ampliato all'inizio della **Fase S3** della
> roadmap. È il cuore del "respiro narrativo" del gioco.

## Scopo

Definire il sistema di trigger degli eventi durante il viaggio e dentro
i luoghi, e il modello di **scelte narrative** stile gamebook
(decisioni numerate con prerequisiti e conseguenze).

## Punti chiave (da espandere)

### Tipi di evento
- **Viaggio**: incontri casuali, meteo, scoperte, imboscate, viandanti
- **Luogo**: scene contestuali in castelli, taverne, monasteri, dungeon
- **Tempo**: cambi stagione, eventi di fazione, scadenze
- **Reputazione**: NPC che reagiscono al titolo emergente o al passato
- **News**: arrivo di una notizia che apre una scelta

### Trigger
- Probabilità per Passo di viaggio modulata da terreno, fazione di
  controllo, stagione, reputazione
- Trigger garantiti (scriptati) per archi narrativi
- Trigger condizionati (presenza di compagno X, oggetto Y, reputazione Z)

### Modello scelte narrative (gamebook)
- Opzioni numerate, da 2 a 5
- Alcune opzioni con **prerequisito** (equipaggiamento, attributo,
  reputazione, compagno presente, oggetto specifico)
- Conseguenze sul mondo (modifica stato, attributi, reputazione,
  passaggio passi, generazione news)
- Possibili check probabilistici nascosti

### Respiro / modalità di gioco
Il gioco alterna registri diversi a seconda della situazione:
- **Calmo** — viaggio sulla mappa, basso engagement
- **Sospeso** — pausa con scelta narrativa
- **Tattico** — pre-combattimento (approccio, posizionamento)
- **Drammatico** — combattimento (osservazione + micro-decisioni)
- **Contemplativo** — scene dentro luoghi
- Dettaglio definitivo in `docs/GDD.md` §3 *Modello di gameplay* [TBD]

## Indicazioni per i rinvii S3

Note di design per i punti accantonati dall'impalcatura S3 (vedi `js/events.js`).
Da consultare quando si implementano i rispettivi moduli.

### Sistema meteo

**Principio:** il meteo è ambientale, non scenico. Pochi stati, lenti a cambiare,
modulati dal contesto geografico. Non è una variabile tile-per-tile.

- **Stati base (5–6):** sereno, nuvoloso, pioggia/temporale, neve, nebbia,
  vento. Niente sotto-gradazioni. Lo stato corrente è uno solo, vale per tutto
  l'intorno del cavaliere.
- **Probabilità per zona:** ogni bioma + fascia di latitudine ha una
  distribuzione di probabilità degli stati base (es. NEVE+nord → 60% neve,
  20% nuvoloso, 15% sereno, 5% nebbia; SABBIA+sud → 80% sereno, 15% vento,
  5% pioggia rara; FORESTA temperata → mix bilanciato con pioggia frequente).
  Tabella in `config.js` quando implementato.
- **Persistenza:** lo stato meteo dura **N Passi** (proposta: 20–60 con
  jitter) o finché il cavaliere non entra in una zona con distribuzione
  sensibilmente diversa. Cambi possibili anche al cambio di **Diario** o
  **Stagione**. Mai cambio tile-per-tile.
- **Trigger di ricalcolo:** (a) scadenza durata corrente, (b) ingresso in
  bioma con profilo molto diverso da quello attuale (es. esce da foresta
  ed entra in montagna), (c) avanzamento di Diario/Stagione. Il ricalcolo
  estrae il nuovo stato dalla distribuzione della zona corrente.
- **Effetti meccanici (leggeri):** modifica al costo Forza per tile
  (es. pioggia +20%, neve +40%, vento contrario +15%), o malus a check
  futuri di combattimento/percezione. Niente effetti catastrofici dal meteo
  ambientale.

### Eventi meteo straordinari

Sopra il meteo ambientale, esistono **eventi meteo evento** — saltuari, mai
ricorrenti, coerenti col luogo. Trattati come normali eventi di viaggio
(entrano in `Events.registry`) ma con peso basso e prerequisito di bioma +
latitudine. Quando scattano possono **forzare** lo stato meteo per la loro
durata, sovrascrivendo l'ambientale.

Esempi (catalogo da espandere):
- **Tempesta di sabbia** — SABBIA, sud. Forza Forza+++, riduce visibilità,
  blocca progressione per qualche Passo.
- **Bufera di neve** — NEVE/MONTAGNA, nord. Rischio di smarrirsi, danno Forza.
- **Temporale violento** — FORESTA/PIANURA temperate. Fulmine, riparo
  forzato, possibile danno equipaggiamento.
- **Venti gelidi del nord** — fasce nord. Malus Volontà persistente fino a
  riparo/sosta.
- **Onda di calore / siccità** — sud, SABBIA/PIANURA_S. Malus consumo
  Forza, ricerca acqua come scelta.
- **Nebbia fitta** — PALUDE/FIUME/costa. Possibile incontro nascosto,
  rischio di incontri ostili senza preavviso.
- **Grandine** — PIANURA/COLLINA, primavera/autunno. Danno corto e duro.
- **Aurora / fenomeno raro** — nord estremo. Evento contemplativo, non
  meccanico (volontà +, log poetico).

Vincolo: un evento meteo straordinario non può ripetersi prima di X Passi
(cooldown per id), e ha peso molto inferiore agli eventi normali per non
saturare il viaggio.

### Trigger temporali

Due meccanismi distinti, entrambi minimali.

**Cambi stagione (passivi).** Tre soli effetti, nessun sistema dedicato:

1. **Bias meteo** — la stagione modifica i pesi della tabella distribuzione
   meteo (inverno → +neve/nebbia, estate → +sereno e +eventi siccità,
   autunno → +pioggia/temporale, primavera → mix). Tabella
   `METEO_BIAS_STAGIONE[stagione][stato] = moltiplicatore` in `config.js`.
2. **Moltiplicatore costo viaggio per bioma** — `STAGIONE_COST_MOD[stagione][bioma]`
   applicato in `Knight.consumaForza()` (es. inverno × FORESTA = 1.3,
   inverno × MONTAGNA = 1.5, estate × SABBIA = 1.4).
3. **1–2 eventi tematici una-tantum per stagione** — voci in `Events.registry`
   con prereq stagione + `once=true` (festa del raccolto, veglia d'inverno,
   mercato di primavera, calura estiva).

Niente sistema viveri separato: la Forza che cala più rapidamente nel
bioma+stagione cattivo è già il segnale di gestione.

**Scadenze.** Registro globale dentro `Events`:

```js
deadlines: [],  // { id, scade_a_passo, on_expire: [effects], label }

addDeadline(id, passi_da_ora, on_expire, label) { ... }
tickDeadlines()       // chiamato a ogni Passo dall'update()
completeDeadline(id)  // chiamato da una scelta che onora la scadenza
```

- Una scelta evento crea una scadenza come effetto:
  `Events.addDeadline('vorn.tributo', 60, [{type:'reputazione', id:'vorn', delta:-2},{type:'log',text:'…'}], 'Portare il tributo a Vorn')`.
- `tickDeadlines()` applica `on_expire` e rimuove l'entry quando il Passo
  corrente la supera.
- `on_expire` riusa lo stesso vocabolario di effetti già esistente
  (`reputazione`, `onore`, `oro`, `log`, …): zero codice nuovo.
- Pannello UI "Impegni" mostra id + label + Passi rimanenti.
- Persistenza: aggiungere `deadlines` a `Events.toJSON()/fromJSON()`
  insieme a `seenIds`.

### Trigger reputazione

Riusa `Knight.reputazione[]` (range **-5..+5** come Onore) e
`Knight.onore`. Niente sistema parallelo.

**Soglie standard** (in `config.js`):

| Valore  | Stato     |
|---------|-----------|
| ≤ -3    | ostile    |
| -2..-1  | freddo    |
| 0       | neutro    |
| +1..+2  | cordiale  |
| ≥ +3    | alleato   |

**Selezione evento.** Schema `Event` esteso con campo opzionale `if`:

```js
if: {
  repMin: { id:'banditi', val:-2 },   // o repMax
  onoreMin: 1,                         // o onoreMax
  titolo: 'Lama Senza Onore',          // match esatto
}
```

Letto da `Events._pick()` insieme a `where`/`once`. Esempi:
- `travel.agguato_banditi` — `repMax:{id:'banditi',val:-2}`
- `loc.castello.invito_corte` — `repMin:{id:'vorn',val:+3}`
- `travel.mercante_diffidente` — `onoreMax:-2`

**Prereq sulle scelte.** Helper standard nel sistema effetti:

```js
prereq: ctx => Events.repCheck(ctx, 'vorn', '>=', 2)
prereq: ctx => Events.onoreCheck(ctx, '<=', -1)
prereq: ctx => Events.tieneEquip(ctx, 'arma', 'Spada del Conte')
```

**Titolo dinamico.** `Knight.titolo` evolve in base allo stato cumulato.
Tabella in `knight.js`:

```js
TITOLI_RULES = [
  { titolo: 'Lama Senza Onore',    cond: k => k.onore <= -3 },
  { titolo: 'Cavaliere Maledetto', cond: k => k.onore <= -1 && repAlleatoBanditi(k) },
  { titolo: 'Paladino del Cervo',  cond: k => k.onore >=  3 && rep(k,'cervo') >= 3 },
  { titolo: 'Spada di Vorn',       cond: k => rep(k,'vorn') >= 3 },
  // 6-10 titoli totali, ordine = priorità
  { titolo: 'Cavaliere Errante',   cond: () => true },  // default
]
```

`Knight.recalcTitolo()` invocato da `_applyDescEffect` quando cambia
`reputazione` o `onore`. Se il titolo cambia → log "Da ora siete
conosciuti come **…**". Il titolo nuovo è a sua volta usabile come
prereq (`if.titolo`).

**Effetti.** `type:'reputazione'` e `type:'onore'` già esistono.
Aggiunto solo `type:'titolo'` per override esplicito da eventi speciali
(sovrascrive il calcolo automatico finché un altro evento non lo cambia
o `recalcTitolo()` non lo riporta a una regola attiva).

**Limite cosciente.** La reputazione **apre/chiude contenuti** (eventi
extra, opzioni extra, blocchi), non sfuma testo NPC per NPC. Le varianti
narrative sottili sono compito del text-system (S6).

### Catalogo eventi

Coerente con luoghi (layout L1/L2), fog di guerra a 3 livelli, sistema
effetti già implementato e linee guida dei rinvii sopra.

#### Volumi target (prima beta giocabile)

| Categoria                              | Target  |
|----------------------------------------|---------|
| `travel.<bioma>.*` (8 × 13 biomi)      | ~100    |
| `travel.meteo_evento.*`                | 6–10    |
| `travel.rep_*` (reputazione-driven)    | 10–15   |
| `loc.<edificio>.*` (15 × 5 edifici)    | ~75     |
| `loc.<struttura>.<area>.*` aree uniche | ~50     |
| `poi.<kind>.*` (5 × 8 kind)            | ~40     |
| `dungeon.<tipo>.stanze.*` (10 × 4)     | ~40     |
| `stagione.<s>.*` una-tantum            | 4–8     |
| **Totale**                             | **~300**|

Meglio 5 per bioma scritti bene che 15 ripetitivi.

#### Schema `Event` esteso

Campi nuovi (additivi, retro-compatibili con S3):
- `oncePerLuce` — bool, una volta per Luce (anno).
- `cooldown` — int, passi minimi prima di poter ripetersi.
- `tone` — autoriale: `drammatico|contemplativo|ironico|brutale|poetico|neutro`.
- `portata` — autoriale: `marginale|notevole|svolta`.
- `if` — prereq di selezione: `{ repMin, repMax, onoreMin, onoreMax, titolo }`.

`where` supporta più forme:
- `{ biomes:[int] }` — travel
- `'castle' | 'village' | 'keep'` — legacy struttura intera (fallback)
- `{ struttura, area }` — area unica di una struttura (layout L1)
- `{ edificio }` — edificio condiviso L1 (taverna, fabbro, …)
- `{ kind }` o stringa — POI

Selezione: nuovo `Events.pickArea(structureType, areaKey, structure)` per
il layout L1, che cerca prima namespace per-area e poi cade su namespace
per-edificio condiviso.

#### Linee guida autoriali

1. **≥ 2 scelte sempre.** Mai una sola — non è una scelta.
2. **Almeno una scelta ha costo o rischio.** Altrimenti l'evento è
   gratuito e non decide nulla.
3. **Asimmetria di outcome.** Scelte diverse devono dare conseguenze
   qualitativamente diverse (rep vs salute vs news), non solo
   `+5 vs +3` sulla stessa risorsa.
4. **Lunghezze.** `text` ≤ 4 righe (~280 char), `text` opzione ≤ 50 char,
   `reply` ≤ 2 righe. Niente romanzi.
5. **Seconda persona, presente.** "Ti imbatti…", "Decidi di…".
6. **NPC anonimi se non ricorrenti.** "Il viandante", "l'oste", "il
   fabbro". Niente nomi propri inventati per personaggi una-tantum.
7. **Ogni opzione ha `reply`**, anche minima, per chiudere il loop
   narrativo.
8. **Una prereq per opzione, max.** Eccezione: dungeon, dove la
   composizione di check è il punto.
9. **Niente filler.** Ogni evento ha un punto, una scelta significativa,
   una conseguenza.
10. **Coerenza con il fog.** Eventi che parlano di "vedere lontano" non
    presuppongono che il giocatore abbia visto cose ancora ignote. Se
    devono rivelare, usano l'effetto `type:'rivela'`.

#### Organizzazione del codice

```
js/events.js                 ← solo motore (registry, pick, applyEffects,
                                deadlines, validate, save/load)
js/data/events_travel.js     ← Events.register(...) per ogni bioma
js/data/events_loc.js
js/data/events_poi.js
js/data/events_dungeon.js
js/data/events_meteo.js
js/data/events_stagione.js
js/data/events_rep.js
```

Caricamento `<script>` ordinato in `index.html`: motore prima, dati dopo.
Vantaggio: file dati piccoli, una PR per categoria, review umana semplice.

#### Validazione catalogo (debug)

`Events.validate()` chiamabile a mano da console; logga warning (non
blocca): id duplicato, opzioni < 2, effetto con `type` sconosciuto,
`reputazione` id inesistente.

#### Priorità di scrittura

A. Travel per bioma (~100) — l'utente li incontra di più  
B. Edifici condivisi: taverna, fabbro, cappella, mercante, guaritore (~75)  
C. Aree uniche castello/monastero (~50)  
D. POI per kind (~40)  
E. Dungeon stanze (~40)  
F. Reputazione + stagionali + meteo straordinari (~50)

Per **questa fase di scaffold** sono stati implementati: schema esteso,
nuovi trigger (`oncePerLuce`, `cooldown`), `if` di selezione, helper
`repCheck/onoreCheck/tieneEquip`, effetto `rivela`, scadenze
(`addDeadline`/`tickDeadlines`/`completeDeadline`), validatore,
organizzazione file dati. Il riempimento del catalogo a ~300 eventi è
lavoro autoriale incrementale.

### Luoghi mancanti

Architettura allineata alla spec grafica **L1 (layout cliccabile) + L2
(Carta del cronista)**: entrando in un luogo complesso si apre prima un
layout schematico in pixel-art cartografica con edifici/aree cliccabili,
e ogni click apre una chronicle. Modulo dedicato previsto: `locations.js`.

**Taverna.** Non struttura sulla mappa, ma **edificio cliccabile**
dentro il layout L1 di villaggi (e futuri tipi urbani: città, porti).
Catalogo: namespace condiviso `loc.taverna.*` (assoldare compagno,
ascoltare voci/news, dadi, rissa, mercante curiosità, ubriaco con segreto,
ecc.). Effetti tipici: -oro, +volontà, +news, occasionalmente quest con
scadenza.

**Monastero.** Nuova struttura mondo (`type:'monastery'`), isolata in
collina/foresta/montagna, 3–6 per mondo. Funzione meccanica: recupero
Volontà (come la locanda per la Forza), guarigione spirituale, scrittura
e lettura di pergamene (lore/news antiche). Layout L1 proprio con aree:

```
loc.monastero.cappella.*
loc.monastero.foresteria.*
loc.monastero.infermeria.*
loc.monastero.biblioteca.*
loc.monastero.scriptorium.*   (variabile)
loc.monastero.cripta.*        (variabile, può aprire dungeon)
loc.monastero.giardino.*      (variabile)
```

Render mondo: icona dedicata (simbolo croce/torre piccola). Generazione
in `world.js` accanto a `placeStructures()`.

**Dungeon.** Caso speciale — non un tipo di luogo, ma una **modalità a
grafo di stanze che si svelano progressivamente**. Riusa
`openChronicle()` per ogni stanza, ma con modulo dedicato `dungeon.js`
che tiene la mappa delle stanze, quali sono scoperte e gli archi fra
loro. Trigger: POI esistenti (`cripta`, `rovine`, `voragine`, `tempio`),
oppure scelta dentro una `loc.*.cripta` di castello/monastero. Da
definire in fase propria; per ora basta lo stub di principio.

**Rovine.** Caso intermedio: niente layout L1 con edifici cliccabili,
ma un pannello di azioni — "Esplora sezione nord", "Scava macerie",
"Cerca ingresso nascosto" — ognuna apre una chronicle. Chiamiamolo
**L1-light**.

**Regola architetturale: namespace per edificio, non per struttura.**
Taverna, fabbro, cappella, mercante compaiono in più tipi di luogo.
Per evitare duplicazione il catalogo è organizzato così:

- Namespace **per edificio condiviso**: `loc.taverna.*`, `loc.fabbro.*`,
  `loc.cappella.*`, `loc.mercante.*`, `loc.guaritore.*`.
- Namespace **per area unica** dove serve: `loc.castello.salatrono.*`,
  `loc.castello.cameraconsiglio.*`, `loc.monastero.scriptorium.*`.

Il layout L1 di ogni struttura mappa le sue aree a questi pool senza
duplicare contenuto.

**Regola "una stanza = un pool distinto"** (autoriale): se due aree
avrebbero lo stesso pool eventi, vanno **fuse** anche a livello layout.
Il catalogo guida il layout, non viceversa.

**Migrazione del trigger.** L'attuale `Events.pickLocation(structureType)`
(scheletro S3, pesca su `loc.castello.*`/`loc.villaggio.*`/`loc.keep.*`)
sarà sostituito da `Events.pickArea(structureType, areaKey)` quando arriva
`locations.js`. Fino ad allora resta come fallback: il click su una
struttura apre direttamente una chronicle pescata dal pool generico.

**Priorità di lavoro.** Espandere prima il catalogo eventi per i namespace
per-area, in modo che all'implementazione del layout L1 le scene esistano
già. Layout senza catalogo è inerte.

### Integrazione news

(dipendenza S6) — eventi che leggono news note al nodo e generano scelte
contestuali, ed eventi che producono news.

## TBD operativo

- [ ] Catalogo iniziale eventi viaggio per bioma
- [ ] Catalogo eventi taverna / castello / dungeon / monastero
- [ ] Schema dati `Event` (id, trigger, condizioni, opzioni, conseguenze)
- [ ] Sistema di selezione evento (peso, anti-ripetizione, coerenza narrativa)
- [ ] Format scelte narrative + DSL leggera per autorialità
- [ ] Integrazione con sistema news (eventi che leggono o generano news)
- [ ] Tabella distribuzione meteo per bioma × latitudine
- [ ] Modulo `weather.js` (stato corrente, durata, ricalcolo, effetti)
