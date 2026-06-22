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

## TBD

- [ ] Catalogo iniziale eventi viaggio per bioma
- [ ] Catalogo eventi taverna / castello / dungeon / monastero
- [ ] Schema dati `Event` (id, trigger, condizioni, opzioni, conseguenze)
- [ ] Sistema di selezione evento (peso, anti-ripetizione, coerenza narrativa)
- [ ] Format scelte narrative + DSL leggera per autorialità
- [ ] Integrazione con sistema news (eventi che leggono o generano news)
