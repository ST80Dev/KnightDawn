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

(da definire) — eventi che leggono `Knight.reputazione[]` e attivano scene
specifiche per fazione (es. agguato dei banditi se rep banditi molto negativa,
invito a corte se rep casata molto positiva).

### Catalogo eventi

(da espandere) — attualmente 10 eventi totali. Obiettivo realistico: 50+
viaggio per bioma, 20+ per ogni tipo struttura, 30+ POI.

### Luoghi mancanti

Attualmente solo `castle`/`village`/`keep`. Da aggiungere: **taverna**,
**monastero**, **dungeon** (con generazione propria, non procedurale-tile
ma scena narrativa).

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
