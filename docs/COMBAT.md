# FERRO & CENERE — Sistema Combattimento

> Documento di design per la **Fase S4**. Implementazione preceduta da
> scaffold dati come da regole operative CLAUDE.md.

---

## 1. Principi

- Combattimento **a Round interattivi** — ogni Round presenta scelte al
  giocatore: continuare, fuggire, arrendersi, o azioni speciali contestuali
- **Non istantaneo** — durata variabile in Round, scala con la complessità del
  nemico (ladro 1, cavaliere 4-6, battaglia in esercito 10-20)
- **Un Round di combattimento = un Passo del calendario** (~3 ore in-fiction):
  stessa griglia temporale del viaggio, niente sotto-unità tattiche
- Il **risultato del singolo Round** è automatico (formula su attributi /
  equipaggiamento / terreno); il **percorso dello scontro** è scelto dal giocatore
- Le decisioni pregresse contano: equipaggiamento, seguito, ferite, preparazione
- Letale: la morte è possibile come esito di un Round o di una scelta estrema

## 2. Lunghezza dello scontro

**Unità di tempo:** un Round di combattimento = un **Passo del calendario**
(~3 ore in-fiction, vedi GDD §3). Non esistono sotto-unità tattiche: la
stessa griglia temporale del viaggio governa anche lo scontro.

Numero indicativo di Round totali per archetipo (N):

| Tipo scontro                                  | N Round | In-fiction      |
|-----------------------------------------------|--------:|-----------------|
| Ladro disarmato, animale piccolo              |    1    | ~3 ore          |
| Bandito armato, lupo, predone                 |   2–3   | mezza giornata  |
| Cavaliere singolo, orso, creatura selvatica   |   4–6   | un giorno       |
| Boss di fazione, creatura mitica              |   6–10  | 1–2 giorni      |
| Scaramuccia con piccolo seguito               |   4–6   | un giorno       |
| Battaglia in esercito                         |  10–20  | 1–3 giorni      |
| Assedio prolungato                            |  30–60  | 4–8 giorni      |

Scontri da **1 Round** (ladro, animaletto) si risolvono inline nell'evento
gamebook: scelte morali (*Combatti / Fuggi / Parla*) all'incontro, esito
immediato, niente scena combat dedicata.

Battaglie e assedi lunghi sono suddivisi in **fasi narrative** (es.
schieramento → urto → mischia → rotta), con scelte diverse per fase.

## 3. Struttura di un Round

Ogni Round esegue, in ordine:

1. **Risoluzione automatica**: micro-scambio calcolato da formula (§5),
   narrato in cronaca + Carta del cronista.
2. **Aggiornamento Slancio**: variabile bilanciata ±N che misura il vantaggio
   cumulato. Più leggibile di HP astratti; a fine N Round lo Slancio determina
   l'esito di default (vittoria se positivo, sconfitta se negativo, stallo
   altrimenti).
3. **Scelte del Round**: presentate al giocatore (§4). Una scelta consuma il
   Round successivo o termina lo scontro in anticipo.
4. **Costo tempo**: ogni Round avanza il calendario di esattamente **1
   Passo**. Una scaramuccia (1 Round) costa 1 Passo, una battaglia (10–20
   Round) costa 1–3 Diari di gioco.

Per battaglie/assedi lunghi conviene prevedere in S9 un meccanismo di
**fast-forward intra-combat** (passa N Round in blocco con resoconto
sintetico) per non costringere il giocatore a clic ripetuti su decine
di Round.

## 4. Scelte disponibili

### Sempre disponibili
- **Continua** — prossimo Round automatico
- **Tenta fuga** — tiro su Volontà + terreno; fallita = -slancio + 1 Round extra
- **Arrenditi** — l'esito dipende dal nemico (umano onorevole → cattura;
  bandito → spogliato; mostro → morte)

### Contestuali (sbloccate da condizioni, uso limitato)
- **Disarcionare** — se a cavallo e nemico a piedi
- **Invocare il ferro magico** — se possiedi arma magica non ancora usata
- **Chiedere parlamento** — se Onore alto e nemico umano, una sola volta
- **Colpo disperato** — costo: ferita garantita, in cambio di +slancio forte
- **Usare oggetto** — talismani, pozioni, reliquie dal bagaglio
- **Comando agli arcieri / Carica / Ritirata ordinata** — solo in battaglia
  con esercito al seguito

Le contestuali appaiono solo nei Round in cui hanno senso (es. *parlamento*
non disponibile dopo che è stato versato sangue significativo).

## 5. Formula di Round

`[TBD]` — fissata in S9. Fattori in input:

- Attributi base (Vigore, Volontà)
- Arma equipaggiata (danno base, tipo)
- Armatura (riduzione, tipo)
- Ferite accumulate (malus)
- Stanchezza da viaggio (malus se appena viaggiato)
- Terreno corrente (bonus/malus per tipo di scontro)
- Arti magiche attive
- Numero combattenti / seguito (vantaggio numerico)
- Reputazione (intimidazione passiva sul morale nemico)

Output del Round: `{ slancioDelta: ±int, ferita?: bool, narrazione: string }`

## 6. Tipi di avversari

Catalogo in `js/data/enemies.js` (oggetto `Enemies`). Copertura iniziale:

- **Fuorilegge** — ladro, predone, banda della boscaglia
- **Casata** — soldato, cavaliere
- **Bestie** — lupo, branco, orso, cinghiale (affinità di terreno)
- **Mitici** — spettro, troll delle pietre, licantropo, ragno gigante,
  schiera dei non-morti, bestia di leggenda (tono Tolkien/Martin: orrore
  antico, non magia barocca)
- **Guerra** — scaramuccia, battaglia campale, assedio (fasi narrative)

Nemici legati alle **fazioni concrete** (Ordine del Cervo, Banditi del Sud…)
arriveranno con S5, quando le fazioni saranno definite.

Ogni nemico definisce: `tipo`, `categoria`, `numerosita` (singolo/gruppo/orda),
`sfida`, range `roundMin/roundMax`, `accettaResa`, affinità `terreni` opzionali.
I valori di `sfida` sono provvisori — bilanciamento numerico ufficiale in S9.
Il **bottino** non è nei dati del nemico: si calcola a fine scontro.

## 7. Esiti

Due binari indipendenti governano la fine dello scontro:

- **Salute** (`Knight.salute`, 0-100, persistente): il corpo. A **0 = morte**,
  sempre, in qualsiasi Round. È l'unica cosa che uccide.
- **Slancio** (±N, solo durante lo scontro): il vantaggio tattico cumulato.
  A fine Round decide vittoria/sconfitta/stallo, **ma non uccide**.

Esiti possibili:

- **Vittoria** — Slancio ≥ +3 a fine Round (o scelta vincente). Bottino
  (oro/oggetti, calcolati a fine scontro), onore, news propagata.
- **Sconfitta** — Slancio ≤ −3 a fine Round, ma cavaliere **vivo**. Sei stato
  battuto, non ucciso. La conseguenza concreta (cattura → prigionia S8;
  spoglio di oro/oggetti; ferita grave; fuga forzata; malus reputazione) è
  decisa **dall'evento** nel ramo `onDefeat`, non cablata nel motore.
- **Stallo** — Slancio fra le soglie: nessuno prevale, disimpegno.
- **Fuga riuscita** — scelta del giocatore; perdita oro/oggetti possibile.
- **Resa accettata** — scelta del giocatore; esito dipende dal nemico.
- **Resa rifiutata** — il nemico non concede quartiere; lo scontro prosegue.
- **Morte** — Salute a 0. Game over.

## 8. Integrazione con S3 (eventi)

Il punto di sutura S3↔S4 è un nuovo tipo di effetto evento:

```js
{ type: 'combat', enemy: 'banditi.boscaglia', onWin: [...], onFlee: [...],
  onSurrender: [...], onDefeat: [...], onDeath: [...] }
```

`onDefeat` (sconfitta: battuto ma vivo) e `onDeath` (morte: Salute a 0) sono
rami distinti: dalla sconfitta si torna a giocare con una penalità decisa
dall'evento, dalla morte no.

Un evento di viaggio o di luogo può sospendere e lanciare il combattimento,
poi applicare gli effetti del ramo-esito al ritorno. Schema dettagliato in
`docs/EVENTS.md` quando S4 esce dallo stub.

## 9. Visualizzazione

Vista combattimento dedicata in `scenes.js`, attiva per scontri di **≥2 Round**.
Per scontri da 1 Round la risoluzione resta inline nella Carta dell'evento
gamebook che li ha originati.

- Carta del cronista per il Round corrente (narrazione + miniatura)
- Indicatore Slancio (barra simbolica, non numerica)
- Pulsantiera scelte (sempre + contestuali del Round)
- Cronaca scorrevole dei Round precedenti
- Niente sprite animate dei combattenti — la narrazione regge la scena
