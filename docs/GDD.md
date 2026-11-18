# Knight Dawn — Game Design Document

> Documento vivo. Le sezioni marcate [TBD] sono da definire.
> Ultimo aggiornamento: novembre 2026 — il gioco diventa **Carta e Scene su geografia reale**
> (§2 *Il mondo*, §3 *Tempo e calendario*, §3 *Viaggio*). Le parti sulla mappa a tile del 2D
> sono superate dove lo dicono queste sezioni.

---

## 1. Visione

Un cavaliere errante in un mondo medievale-fantasy oscuro. Non conquisti il mondo:
ci navighi dentro. Non costruisci castelli: attraversi quelli degli altri.
Il mondo ha fazioni, segreti, stagioni, tensioni politiche che si muovono
indipendentemente da te. Tu sei un viandante con una spada e una storia da scrivere.

Il mondo è la **geografia reale di Europa, Nord Africa e Terrasanta** (rilievo, coste, fiumi,
valichi, posizione di città, borghi e castelli). Sono inventati la storia, le fazioni, i
personaggi, il contenuto dei luoghi e le presenze fantastiche. Dettagli in §2 *Il mondo*.

### Tono e ispirazioni

- **House of the Dragon:** intrighi di casata, tradimenti, ambiguità morale, drago come forza
  della natura non come cavalcatura. Il potere corrompe. Nessuno è puramente buono.
- **Il Signore degli Anelli:** il viaggio epico attraverso terre vaste e pericolose,
  la solitudine del viandante, l'oscurità che avanza, alleanze improbabili.
- **Lupo Solitario (Librogame):** il cavaliere solitario con abilità speciali,
  l'equipaggiamento che conta, i combattimenti letali, il mondo ostile.
  MA senza la struttura a scelte del librogame — il gioco è esplorativo, non narrativo-ramificato.
- **Monkey Island / King's Quest:** dettaglio negli ambienti, il piacere di esplorare un mondo
  disegnato con cura. (L'estetica pixel art valeva per il 2D: ora il gioco è in 3D, vedi
  `docs/ESPLORAZIONE_3D.md`.)

### Cosa NON è

- Non è un city builder / 4X / strategico di conquista
- Non è un librogame / visual novel a scelte ramificate
- Non è un action game in tempo reale
- Non è un roguelike puro (anche se ha generazione procedurale)

---

## 2. Struttura del gioco

### Inizio partita — Scelta dell'arco

All'avvio di una nuova partita, il giocatore sceglie tra:

1. **Missione / Profezia** — Un arco narrativo principale con atti e rivelazioni.
   Il mondo genera eventi collegati alla missione. Obiettivo preciso da raggiungere.

2. **Sandbox** — Nessun obiettivo imposto. Sopravvivi, esplora, accumula storia e reputazione.
   Il mondo genera eventi emergenti basati sulle tue azioni.

3. **Campagna episodica** — Capitoli autonomi, ciascuno con un obiettivo breve.
   Il cavaliere persiste tra i capitoli. La sandbox è il "tessuto connettivo" tra gli episodi.

> L'opzione 1 e 3 contengono comunque la sandbox come base. La sandbox è il sottogioco
> sempre presente; missione e campagna aggiungono struttura sopra.

### Il cavaliere

Parte generico — nessuna classe, nessun albero abilità predefinito.
Si definisce attraverso le scelte di gioco:

- Quale equipaggiamento usi → diventi guerriero, esploratore, mago, diplomatico
- Con chi ti allei → la tua reputazione ti apre e chiude porte
- Quali battaglie combatti e quali eviti → il mondo ti legge e reagisce
- Il "titolo" del cavaliere emerge organicamente (es: "Il Macellaro di Vorn",
  "L'Ombra del Cervo", "Il Pellegrino Silenzioso")

**Attributi base:**
- **Forza** (0-100) — energia di viaggio e combattimento; si consuma con la distanza, secondo
  terreno, pendenza e andatura (100 ≈ una giornata di marcia; vedi §3 *Viaggio*)
- **Volontà** (0-100) — forza mentale; cala con eventi oscuri, paura, magia nemica
- **Salute** (0-100) — integrità corporea; cala in combattimento (0 = morte)
- **Onore** (-5/+5) — statura morale bipolare; apre e chiude porte con fazioni e NPC

**Progressione per ranghi.** Il cavaliere non parte tale: inizia come **garzone
di stalla** nella Veglia e sale per **ranghi sociali** (Garzone → Scudiero →
Cavaliere Errante → di Ventura → Campione/Bannerale). I ranghi sbloccano
*accesso e opportunità* (corti, contratti, covi, compagni) con bonus modesti —
niente albero abilità. Dettaglio completo (apertura, azioni, mercato) in
`docs/EARLY_GAME.md`.

[TBD] Equipaggiamento e inventario (pesi, slot, durabilità?)
[TBD] Arti magiche / abilità speciali
[TBD] Sistema di titoli emergenti (condizioni di trigger)

#### Seguito

Il cavaliere è sempre il POV: la sua morte chiude la partita. Attorno a lui
possono però aggregarsi figure che lo accompagnano nei viaggi e nei combattimenti,
trattate come **unità integrata**, non micro-gestita.

Tre cerchi:

1. **Cavaliere** — sempre presente.
2. **Apprendista** — slot unico, non permanente. Si ottiene per evento narrativo
   (taverna, villaggio, incontro casuale). Cresce nel tempo, poi prima o poi se
   ne va (parte per la propria strada, muore, viene reclamato da una fazione,
   fonda una sua compagnia). Il giocatore può poi trovarne un altro.
3. **Compagni d'arme** — max 3, slot per ruolo/archetipo distinto:
   - **Lama** — guerriero diretto, bonus attacco in combattimento aperto
   - **Ombra** — esploratore/ladro, riduce costi di movimento in certi terreni,
     bonus in imboscate e fuga, accesso a informazioni
   - **Conoscitore** — medico/saggio/araldo, recupero ferite più rapido, bonus
     reputazione in interazioni diplomatiche, identifica oggetti
   La compagnia funziona anche incompleta; non è obbligatorio averli tutti.

Tutti i membri del seguito contribuiscono al combattimento come modificatori
sull'unità singola (HP totali, attacchi extra per round, bonus a fuga ecc.),
senza ordini individuali.

Dettagli (paga, fedeltà, eventi) → `### Compagnia e covi` in §3.

### Il mondo

> Deciso a novembre 2026, dopo la valutazione del prototipo 3D: sostituisce la mappa procedurale
> del 2D. Dati e architettura tecnica in `docs/ESPLORAZIONE_3D.md`, «Carta e Scene».

**Geografia reale, mondo inventato.** È reale la geografia di **Europa, Nord Africa e Terrasanta**:
rilievo, coste, fiumi, laghi, valichi, posizione di città, borghi e castelli. Sono inventati, o generati
a ogni partita: chi governa, fazioni, personaggi, cosa contengono i luoghi, rovine, covi, dungeon,
presenze fantastiche. Il tono resta medievale-fantasy oscuro (§1). Dove si può, il fantastico si
appoggia sulle leggende vere dei luoghi (es. la Grotta della Sibilla e il Lago di Pilato sui Sibillini).

**Due livelli: Carta e Scene.**
- **Carta del cronista** (livello strategico): viaggio con tempo compresso, eventi a ogni Passo,
  fazioni, notizie, scadenze. Qui vive quasi intera la logica del 2D. Centinaia di km si
  percorrono in pochi minuti reali (vedi §3 *Viaggio*).
- **Scene 3D** (livello di persona): arrivando in un luogo, fermandosi, o quando un evento
  ferma il viaggio, si è lì in 3D a scala 1:1 e ci si muove liberamente nei dintorni. In scena il tempo
  segue la distanza percorsa (minuti, non Passi interi); le azioni costano Passi alla conferma.
  Il combattimento resta a turni.
- Camminare in 3D non deve far avanzare molto la data: è il momento in cui si è presenti. Il tempo
  «grosso» lo consumano viaggi e azioni. Il gioco di persona si ottiene con scene **dense**
  (castello, borgo, dintorni di 1–2 km con cose da fare), non con distanze lunghe a piedi.

**Estensione e contenuti.** La Carta copre Europa e Mediterraneo, con Nord Africa e Terrasanta
(pellegrinaggi, crociate, Outremer: lì sono anche i deserti veri). **Regione di partenza: Montefeltro
e Romagna** (~100×100 km attorno a Tavullia), con contenuti curati qui per primi. Altrove i luoghi si
generano dai dati reali (posizione vera di paesi e castelli) e da **generatori di architettura per area
culturale** (mediterraneo/malatestiano, alpino, nordico, mediorientale…), aggiunti uno alla volta.
L'architettura del gioco prevede partenze in altre regioni e nazioni, che però si realizzano più avanti.
Il collo di bottiglia sono i contenuti, non i km.

**Terreni (biomi).** Le categorie restano quelle del 2D (pianura, foresta, collina, montagna,
palude, sabbia/deserto, neve, ghiaccio, fiume, roccia, acqua): eventi e costi già scritti restano
validi. Ogni cella della Carta si classifica dai dati reali (quota, pendenza, copertura del suolo,
fiumi; neve e ghiaccio secondo quota e stagione). Il paesaggio dei dati è quello di oggi, non quello
medievale: città moderne → campi o borghi, più bosco, paludi bonificate ripristinate dove note. Le
coste cambiate (es. Ravenna, allora sul mare) si ritoccano a mano solo dove contano.

**Strutture:** castelli, villaggi, città, rovine, dungeon, porti, monasteri, accampamenti, torri,
valichi, ponti, guadi
**Elementi naturali:** fiumi, laghi, passi montani, foreste fitte, paludi, coste, deserti

#### Scoperta su geografia nota (proposta, da confermare)

Il giocatore conosce la geografia, non il mondo. Le fonti di incertezza e di scelta sono cinque:

1. **Conta ciò che sa il cavaliere, non il giocatore.** La Carta mostra solo ciò che il cavaliere ha
   visto o sentito dire (nebbia della conoscenza, al posto della nebbia di guerra del 2D). Da lontano
   i luoghi sono voci: nomi incerti, posizioni approssimate, come nelle carte medievali. Verso un
   luogo mai visto si va per indicazioni (strada, direzione), non con un clic preciso.
2. **Le condizioni cambiano.** Sapere dov'è un valico non dice se quest'inverno è chiuso dalla neve,
   presidiato da una fazione ostile, infestato da briganti, gravato da un pedaggio o colpito da
   un'epidemia. Le notizie arrivano in ritardo e imprecise (§3 *Propagazione delle informazioni*):
   scegliere il percorso resta una scommessa che si può perdere.
3. **Lo strato umano si genera a ogni partita** (seme): signori e fazioni, alleanze, chi controlla
   strade e ponti, rovine, covi, dungeon, eremi e luoghi minori.
4. **Strade e vegetazione medievali** sono incerte anche nella realtà: si possono generare a ogni
   partita sul rilievo vero (sentieri, guadi, ponti, boschi, paludi). Il rilievo non cambia, il modo
   di attraversarlo sì.
5. **Il fantastico** (creature, maledizioni, luoghi leggendari) non sta su nessuna carta reale.

Limite accettato: le grandi linee (dove sono le Alpi e i passi principali, dove è il mare) il
giocatore le conosce già.

Il mondo ha **stagioni** che influenzano il gameplay:
- Primavera: viaggio facile, commercio attivo
- Estate: siccità possibili, ribellioni contadine
- Autunno: raccolto, feste, diplomazia
- Inverno: passi chiusi, fame, creature più aggressive

[TBD] Classificazione dei biomi dai dati reali e tabella costi di viaggio per cella
[TBD] Tabella strutture con frequenza di spawn e contenuto
[TBD] Sistema stagionale dettagliato
[TBD] Eventi del mondo autonomi (guerre tra fazioni, epidemie, migrazioni)

---

## 3. Meccaniche core

### Tempo e calendario

Il tempo non è misurato in unità "umane" (anno, mese, settimana) ma in una gerarchia
mitologico-cronachistica propria del mondo di gioco.

#### Gerarchia

```
Era → Luce → Stagione → Diario → Passo
```

- **Passo** — turno minimo del gioco: **~3 ore in-fiction**. È un'unità di **tempo**, non di spazio.
  Nel 2D valeva 1 tile; ora il viaggio converte la distanza in Passi (§3 *Viaggio*). Ogni Passo
  può generare eventi, consumare Forza, avviare combattimenti. Velocità di scorrimento sulla
  Carta regolabile (vedi sotto).
- **Diario** — **200 Passi** (~25 giorni in-fiction, "un mese"). Unità di cronaca,
  cadenza per eventi di fazione, tributi, consigli. Numerato dentro la Stagione (1-3).
- **Stagione** — **3 Diari = 600 Passi** (~2,5 mesi). Quattro per Luce, nell'ordine:
  Primavera, Estate, Autunno, Inverno. Modulano viaggio, eventi, raccolti.
- **Luce** — **4 Stagioni = 12 Diari = 2.400 Passi** (~10 mesi, "un anno").
  Numerata dentro l'Era (*Prima Luce, Seconda Luce…*).
- **Era** — **5 Luci = 60 Diari = 12.000 Passi** ("un lustro", ~5 anni).
  Scandita da svolte cosmiche o cataclismi. Numerata in ordinale.

#### Conversioni di riferimento

| Unità    | Passi  | Tempo appross. |
|----------|--------|----------------|
| Passo    | 1      | ~3 ore         |
| Diario   | 200    | ~25 giorni     |
| Stagione | 600    | ~2,5 mesi      |
| Luce     | 2.400  | ~10 mesi       |
| Era      | 12.000 | ~5 anni        |

#### Velocità di gioco e tempo reale

Vale solo per il viaggio sulla Carta. [TBD] allineare i valori: `js/calendar.js` usa oggi
4–30 s/Passo. Il giocatore può regolare la velocità da 3 a 60 secondi per Passo (preset
`[60, 30, 15, 7.5, 3]`, default 15 s/passo). Il pulsante `+` accelera,
`−` rallenta. A velocità massima una Luce dura ~2 ore reali, un'Era ~10
ore. A velocità minima una Luce dura ~40 ore reali, un'Era ~200 ore.
Le pause per eventi, combattimento e scelte allungano la sessione reale
senza far avanzare i Passi.

#### Modello del tempo: cosa scorre e quando

Il tempo reale regolabile (s/passo) governa **solo il viaggio sulla
Carta**. Tutto il resto è discreto e atomico, scandito dalle
azioni del giocatore — non dal cronometro.

| Contesto                          | Come scorre il tempo                              |
|-----------------------------------|---------------------------------------------------|
| Viaggio sulla Carta               | 1 Passo ogni *N* secondi reali (velocità scelta)  |
| Scena 3D, in movimento            | Segue la distanza percorsa (frazioni di Passo)    |
| Scena 3D, fermi                   | Nulla scorre                                      |
| **Pausa (`II/▶`)**                | **Nulla scorre**: né Passi, né deadlines, né mondo |
| Pausa modale (pre-recap, POI)     | Come la pausa: nulla scorre                       |
| Lettura evento / scelta narrativa | Nulla scorre durante la lettura                   |
| Azione atomica dentro luogo       | *N* Passi scattano d'un colpo a conferma azione   |
| Combattimento (Round interattivi) | 1 Passo a ogni Round confermato dal giocatore     |

**Conseguenze di design:**

- **La pausa è UX, mai meccanica.** Serve a leggere e decidere senza
  fretta. Mettere in pausa per "guadagnare tempo nel mondo" non esiste:
  il mondo è fermo quanto te.
- **Le azioni costano Passi solo alla conferma.** Entrare in una taverna
  non costa nulla; scegliere *"Riposa la notte"* fa scattare gli 8 Passi
  in un solo tick atomico (Calendar avanza, deadlines vengono spuntate,
  recuperi vengono applicati), poi lo stato torna a quello precedente —
  se eri in pausa, resti in pausa. Nessuna tensione passiva sul testo.
- **Il combattimento sospende il tempo reale** e diventa puro turn-based:
  il cronometro si ferma e ogni Round confermato (auto, fuga, resa,
  parlamento, colpo) avanza il calendario di 1 Passo. La durata reale
  del combattimento è decisa dal giocatore, non dal sistema.
- **Le deadlines (`addDeadline`) vengono spuntate solo quando il Passo
  scatta davvero** — viaggio, azione atomica, Round combat. Una scadenza
  fissata a 60 Passi non scade mentre stai leggendo un evento.

**Costi standard per azione atomica** (riferimento, ogni evento decide
il proprio valore dichiarando `{type:'tempo', passi:N}` nei suoi effetti
— vedi `docs/EVENTS.md`):

| Azione                                | Passi  | In-fiction  |
|---------------------------------------|-------:|-------------|
| Parlare con NPC, chiedere informazioni|  1     | ~3 ore      |
| Contrattare al mercato                |  1–3   | mezza giornata |
| Curare ferita lieve                   |  2–4   | mezza giornata |
| Addestrarsi / studiare                |  4–8   | un giorno   |
| Riposare alla locanda (notte)         |  8–12  | un giorno+notte |
| Convalescenza (ferita grave)          | 20–40  | una settimana |
| Forgiare / commissionare arma         | 12–24  | 3–5 giorni  |

#### Corrispondenza con viaggio medievale

Ritmi indicativi (da tarare): **a piedi ~12 km per Passo di marcia** in piano (pendenza e terreno
rallentano), circa 3 Passi di marcia al giorno, poi la Forza impone la sosta. A cavallo ~20 km per
Passo. Per mare ~20–25 km per Passo, giorno e notte, secondo il meteo. Le **soste** (notte,
accampamento) sono azioni atomiche: avanzano il calendario d'un colpo, senza tempo reale.

| Da Tavullia a… | Distanza | Tempo in-fiction | Tempo reale (15 s / 3 s per Passo) |
|---|---|---|---|
| Appennino (Carpegna, Nerone, Fumaiolo) | 30–60 km | 1–2 giorni | ~1 min / ~15 s |
| Paludi (Ravenna, Comacchio, delta del Po) | 80–150 km | 3–5 giorni | 2–3 min / ~40 s |
| Alpi | 250–300 km | ~10 giorni (~25 Passi di marcia + soste) | ~6 min / ~1 min |
| Nord Africa, Terrasanta (per mare) | 2000–3000 km | 3–4 settimane | ~30 min / ~6 min |

Il tempo reale esclude le soste per gli eventi, che sono il gioco vero. Attraversare la mappa del 2D
(240 tile) costava circa un'ora reale: l'ordine di grandezza è lo stesso. Il calendario (Diario,
Stagione, Luce) non si ritocca: regge già queste distanze con tempi medievali credibili.

#### Età della Veglia (prologo)

Prima della Prima Era esiste l'**Età della Veglia**: periodo di ambientamento e
addestramento del cavaliere. Caratteristiche:

- Il conteggio formale di passi/diari/stagioni **non è visibile** al giocatore.
  L'HUD mostra solo *"Veglia · giorno N"* o equivalente. Il giorno si ricava dai Passi
  (8 Passi = 1 giorno), non più un giorno per ogni Passo come nel codice attuale.
- Eventi tutorial: imparare viaggio, combattimento, dialoghi, gestione equipaggiamento.
- Termina con un **evento di soglia** narrativo (cerimonia, partenza, prima vera
  battaglia). Da quel turno parte il conteggio ufficiale:
  *Prima Era · Prima Luce · Primavera · Diario 1 · Passo 1*.
- Lore in-fiction: periodo "fuori dalla storia", non registrato dai cronisti —
  coerente col fatto che i Diari sono unità di cronaca.
- Contenuto concreto della Veglia: il protagonista è un **garzone di stalla** che
  guadagna i primi oro, compra cavallo ed equipaggiamento e si qualifica
  all'investitura (= evento di soglia). Azioni, ranghi e mercato in
  `docs/EARLY_GAME.md`.

#### Visualizzazione

Forma estesa (schermate narrative, log eventi):
> *Passo 5 del Diario 12, Autunno della Seconda Luce, Prima Era*

Forma compatta (HUD):
> *I · II · Aut 12.5*

Durante la Veglia:
> *Veglia · giorno 14*

[TBD] Stile font e collocazione esatta nell'HUD → `docs/UI_GUIDE.md`

### Viaggio

**Sulla Carta.**
- Si sceglie la destinazione (o una strada o direzione, se il luogo è noto solo per sentito dire) →
  percorso sulle celle (A*), che preferisce strade, ponti, guadi e valichi → viaggio automatico.
- Celle di ~1 km ([TBD] più grandi nelle aree lontane). Il costo di ogni cella in tempo, Forza e
  vigore del cavallo dipende da bioma, pendenza e presenza di strade. La tabella per bioma del
  2D (`TRAVEL_COST`) resta come base.
- Mezzi: a piedi, a cavallo, per mare (dai porti; anche traghetti e guadi).
- Durante il viaggio possono scattare eventi (incontri, meteo, scoperte). Il giocatore può fermarsi
  quando vuole: fermarsi vuol dire entrare nella scena 3D di quel punto. Un evento (imboscata,
  incontro) può fermare il viaggio e portare in 3D lì.

**Nelle Scene 3D.**
- A scala 1:1, a piedi (poi a cavallo). Il tempo segue la distanza: ~1 Passo ogni 12 km in piano,
  di più in salita. Correre non fa passare più tempo ma costa più Forza.
- «Vai a» dentro l'area locale (300 m–1 km), con dissolvenza.
- Dettagli in `docs/ESPLORAZIONE_3D.md`.

### Combattimento

Combattimento **a Round interattivi** (vedi `docs/COMBAT.md`). Sospende
il tempo reale del viaggio e diventa turn-based puro: il calendario
avanza di 1 Passo solo a ogni Round confermato dal giocatore (auto,
fuga, resa, parlamento, colpo disperato).

- Risultato del singolo Round automatico (attributi + equipaggiamento +
  terreno + ferite + vantaggio numerico); il **percorso dello scontro**
  è scelto dal giocatore.
- Durata in Round scala con la complessità (ladro 1, cavaliere 4-6,
  battaglia 10-20). Letale: morte possibile.
- Output: barre HP visibili, cronaca testuale, scelte per Round.

[TBD] Formula di combattimento dettagliata → `docs/COMBAT.md`
[TBD] Tabella creature e avversari
[TBD] Sistema di fuga
[TBD] Combattimento multiplo (alleati, gruppi)

### Fazioni e reputazione

Il mondo ha fazioni con relazioni tra loro. Le tue azioni modificano la tua reputazione
con ciascuna. La reputazione apre e chiude porte.

**Fazioni esempio:**
- Casate nobiliari (Morthane, Valdris, Ashford…)
- Ordini cavallereschi / religiosi (Ordine del Cervo, Confraternita della Cenere…)
- Villaggi e comunità locali
- Culti e organizzazioni segrete
- Creature/razze non umane

[TBD] Lista fazioni definitiva
[TBD] Matrice relazioni tra fazioni
[TBD] Scala reputazione e conseguenze per livello
[TBD] Eventi fazione-specifici

### Interazione con luoghi

Quando entri in un castello, villaggio, dungeon o luogo speciale, la vista
cartografica si oscura e appare una **Carta del cronista**: una composizione
statica in stile manoscritto miniato medievale (cornice ornata, miniatura
centrale, testo sotto, pulsanti tematici).

**Non** è una scena navigabile point&click. Si interagisce *per scelta*,
non *per click su posizione*.

- **Miniatura** in alto: illuminazione singola (sala del trono, taverna,
  cella, biblioteca…) coerente con lo stile della mappa.
- **Pannello narrativo** sotto: descrizione testuale generata dal contesto
  + lista di pulsanti tematici per azioni e NPC presenti.
- **Pulsanti contestuali**: cambiano in base a chi è presente, ora del giorno,
  stagione, reputazione del cavaliere, news note al nodo, seguito al fianco.
- **Tempo**: ogni interazione consuma Passi.
- **Esplorazione assorbita**: pulsanti come *"Osserva la sala"*, *"Cerca nei
  dintorni"*, *"Chiedi notizie"* fanno *pescaggi pesati* su tabelle di
  scoperta (oggetti, persone, eventi). La varietà nasce dalla casualità
  contestualizzata, non dal click su elementi visivi.

Stesso linguaggio visivo viene riusato per gli eventi di viaggio
(modalità *Sospesa*), che appaiono come *carte mobili* sopra la mappa.

Dettaglio completo del modello di gameplay → `docs/GAMEPLAY.md`
Dettaglio architettura testi → `docs/TEXT_SYSTEM.md`

[TBD] Lista tipi di luogo con relativa miniatura
[TBD] Sistema di interazione NPC
[TBD] Sistema di commercio
[TBD] Sistema di quest/missioni locali

### Compagnia e covi

Estensione del **Seguito** (definito in §2 *Il cavaliere*) con regole di
gestione narrativa — non strategica. L'obiettivo è dare profondità senza
trasformare il gioco in gestionale: nessuna economia complessa, nessuna
produzione di truppe, nessuna costruzione libera.

#### Apprendista

- Slot unico, mai più di uno alla volta.
- Si ottiene per **evento narrativo** (incontro in taverna, villaggio, scampato
  da un combattimento ecc.). Non si compra.
- Cresce nel tempo: piccoli miglioramenti di abilità, sviluppo di un arco proprio
  (lealtà, ambizione, talento emergente).
- Esce di scena per **evento di chiusura**: parte per la sua strada, muore in
  combattimento, viene reclamato da una fazione, fonda una sua compagnia.
- Dopo la sua uscita il giocatore può trovarne un altro, sempre per evento.
  Ogni apprendista è una figura unica, non intercambiabile.

#### Compagni d'arme

- Max 3 slot, uno per archetipo: **Lama** / **Ombra** / **Conoscitore**.
- Assoldati o reclutati per archi narrativi. Hanno nome, storia, eventi propri.
- Paga periodica in **Diari** (ogni Diario o ogni N Diari — [TBD]).
- Possono **morire in combattimento** (sempre prima del cavaliere, mai dopo).

**Dinamica paga / fedeltà:**

1. *Paga regolare* → prestazioni piene, fedeltà stabile.
2. *Ritardo breve* → malus prestazioni (meno efficaci in combattimento).
3. *Ritardo lungo* → fedeltà scende → eventi di confronto/negoziazione
   (perlopiù recuperabili con denaro, favori, gesti narrativi).
4. *Fedeltà a zero* → abbandono silenzioso **o** tradimento narrativo.
   Quasi sempre recuperabile se il giocatore la gestisce bene; raramente i
   compagni diventano antagonisti permanenti.

#### Covi

Il cavaliere può fondare uno o più covi sulla mappa: rifugi personali con
servizi tematici.

- **Multipli consentiti**, ma il **costo di fondazione cresce** per ogni covo
  aggiuntivo (1° accessibile, 2° impegnativo, 3°+ costoso).
- Sbloccabili anche in **early/mid game**, non solo a metà partita: quando il
  giocatore individua un'area di mondo di suo interesse, può piantare lì radici.
- **Non si costruiscono da zero:** si *riprendono* location preesistenti sulla
  mappa, compatibili per tipo (torre abbandonata, maniero decaduto, monastero in
  rovina, casale isolato, grotta sistemata, ecc.).
- Il giocatore sceglie tra i candidati compatibili nell'area. Tipo di location e
  tipo di strutture installabili sono correlati (es. torre → buona volieria;
  grotta → non adatta a stalla).

**Slot strutture (max 4 per covo):**

- **Stalla** — cavallo di riserva o di razza migliore
- **Fucina** — manutenzione e lieve potenziamento armi (non crafting libero)
- **Alloggio** — recupero ferite accelerato tra viaggi
- **Volieria** — estende la rete dei corvi del giocatore (vedi *Propagazione
  delle informazioni*): notizie più rapide nella zona
- **Dispensa** — riduce il costo di paga dei compagni mentre stazionano lì
- **Archivio** — accumula lore/mappe, bonus esplorazione nella regione

**Degrado per assenza:**

- Se il cavaliere non torna entro **X Diari** [TBD], il covo inizia a degradare:
  perde slot attivi uno alla volta (fucina arrugginisce, stalla saccheggiata,
  corvi della volieria si disperdono).
- Recuperabile rientrando e pagando un **costo di ripristino**.
- Dopo assenza molto prolungata → covo **perso definitivamente**, rioccupato
  da altri (briganti, fazioni, eremiti).

[TBD] Numeri esatti: costi di fondazione, paga compagni, soglia Diari per
degrado, costi di ripristino. Da definire con l'economia generale del gioco.
[TBD] Tabella compatibilità location ↔ strutture installabili.
[TBD] Catalogo eventi recovery per fedeltà compagni e per recupero apprendista.

### Propagazione delle informazioni

Nel mondo medievale le notizie non arrivano istantanee. Questo sistema definisce
come gli eventi del mondo raggiungono il giocatore (e gli altri attori) nel tempo,
in funzione della distanza e del tipo di informazione.

**Principio:** il mondo vive autonomamente, ma la conoscenza del mondo è locale,
parziale e ritardata. Il giocatore impara cose nuove parlando con NPC, entrando
in insediamenti, o viaggiando vicino a luoghi-evento.

#### Tre livelli di informazione

1. **Voci certe locali** — eventi puntuali (battaglie, morti, raid, matrimoni,
   tradimenti). Si propagano per *onde* dalla sorgente, con velocità modulata
   dal terreno (strade veloci, foreste/montagne lente). Prima dell'onda: silenzio.
   Dopo: notizia precisa, attribuibile, con dettagli.

2. **Voci distorte (rumor)** — nella fascia intermedia tra sorgente e fronte
   d'onda certo, l'informazione esiste in versione imprecisa: nomi sbagliati,
   numeri gonfiati, esito ambiguo. Si risolvono in certezza quando l'onda certa
   arriva al nodo, o se il giocatore visita di persona il luogo dell'evento.

3. **Clima generale** — andamenti di fondo (guerre in corso, carestie, umori
   delle fazioni, prezzi medi) disponibili ovunque ma a granularità grossa,
   senza dettagli specifici. Si raffinano avvicinandosi alle terre coinvolte.

#### Modello tecnico (riepilogo)

Ogni evento mondiale genera un **NewsToken** con: id, tipo, coordinate origine,
turno di emissione, payload "verità", varianti rumor.

A ogni turno si calcola un raggio di propagazione
(`r = turni_passati × velocità_terreno_media`). Gli insediamenti dentro il raggio
"conoscono" la verità; quelli appena fuori conoscono una variante distorta;
oltre, nulla — tranne le news flaggate come `global_climate`, sempre disponibili
in forma vaga.

Quando il giocatore parla con un NPC o entra in una locanda, l'UI pesca dalle
news note a quel nodo, scegliendo la versione (vera/rumor) in base al raggio.

#### Eccezioni e override

- **Corvi messaggeri delle fazioni:** rete propria più veloce, ma limitata ai
  nodi alleati alla fazione mittente.
- **Spie e informatori:** in cambio di oro/favori, accelerano l'arrivo di una
  specifica notizia al giocatore.
- **Sogni profetici, reliquie, poteri arcani:** override narrativi che bypassano
  il raggio normale per news selezionate.
- **Presenza diretta:** se il giocatore è alla sorgente, conosce subito la verità
  e diventa egli stesso vettore di propagazione viaggiando.

[TBD] Tabella velocità di propagazione per tipo di terreno
[TBD] Catalogo varianti rumor per tipo di evento
[TBD] Specifica rete dei corvi (quali fazioni, quali nodi)
[TBD] Documento autonomo `docs/NEWS_SYSTEM.md` quando l'implementazione parte

---

## 4. Interfaccia

> Layout del 2D: da rivedere per Carta e Scene (nel 3D: HUD in overlay HTML sopra la scena).

Layout: la mappa occupa la parte superiore (~70% schermo).
L'HUD inferiore (~30%) è diviso in tre pannelli:

1. **Pannello sinistro — Stato cavaliere:** attributi, equipaggiamento, reputazione
2. **Pannello centrale — Log eventi + azioni:** narrazione, pulsanti contestuali
3. **Pannello destro — Minimappa regionale**

Palette: pergamena per la mappa, fondo scuro per l'HUD.
Font: monospace per dati, serif per narrativa.

Dettagli in `docs/UI_GUIDE.md`.

---

## 5. Roadmap di sviluppo

> Roadmap della versione 2D. Il binario Grafica è sostituito dal prototipo 3D
> (`docs/ESPLORAZIONE_3D.md`, che ha l'ordine attuale delle milestone); la fase S2 diventa la
> **Carta su dati reali**. Le fasi S3–S9 restano valide.

Due binari procedono in parallelo: **Grafica** (Fase G1…Gn, definita in
`docs/GRAFICA.md`) e **Sistemi** (Fase S1…Sn, definita qui). I sistemi
seguono dati-prima, UI-dopo: ogni fase deve essere testabile (anche solo
da console / log testuale) prima di aggiungere la sua UI.

### Binario Grafica

#### Fase G1 — Grafica e rendering (2D, superata)
- Palette e costanti
- Tile procedurali per ogni bioma
- Renderer con camera e zoom multi-livello
- Generazione mondo minima per test visivo
- Dettaglio in `docs/GRAFICA.md`

#### Fase G2 — HUD e interfaccia
- Layout HUD a tre pannelli, log eventi, minimappa
- Pannello stato cavaliere
- Visualizzazione data calendario (forma estesa + compatta)
- Dettaglio in `docs/UI_GUIDE.md`

#### Fase G3 — Carta del cronista
- Componente UI riusabile (carta stanziale per luoghi, mobile per eventi)
- Cornice ornata in stile manoscritto miniato
- Catalogo iniziale miniature per tipo di scena
- Sistema medaglioni-ritratto per NPC
- Integrazione con il sistema testi (vedi `docs/TEXT_SYSTEM.md`)

### Binario Sistemi

#### Fase S1 — Fondamenta di stato
- Stato cavaliere (attributi, ferite, equipaggiamento — dati, non UI ricca)
- Sistema turno + calendario (Veglia → Era/Luce/Stagione/Diario/Passo)
- Save/load minimale (JSON in localStorage)
- Calendario specificato in §3 *Tempo e calendario* di questo GDD

#### Fase S2 — Mondo dati e viaggio
- Carta su dati reali (celle classificate in biomi), regione di partenza prima, poi estensione
- Nebbia della conoscenza (ciò che il cavaliere sa)
- Pathfinding A* sulle celle e viaggio automatico; passaggio Carta ↔ Scena
- Costo in Passi e Forza per cella (bioma, pendenza, strade)
- Dettaglio in §2 *Il mondo* e in `docs/ESPLORAZIONE_3D.md`

#### Fase S3 — Eventi e interazione luoghi
- Sistema trigger eventi durante viaggio (incontri, meteo, scoperte)
- Vista dettaglio luoghi (logica scene, dialoghi base, scelte)
- Sistema scelte narrative stile gamebook (vedi §3 *Modello di gameplay* [TBD])
- Dettaglio in `docs/EVENTS.md`

#### Fase S4 — Combattimento
- Scontro a **Round interattivi**: ogni Round presenta scelte (continua,
  fuga, resa, azioni speciali contestuali)
- **1 Round = 1 Passo del calendario** (~3 ore in-fiction): nessuna sotto-unità
- Numero di Round scala con la complessità del nemico (ladro 1,
  cavaliere 4-6, battaglia in esercito 10-20)
- Risoluzione automatica del singolo Round via formula su attributi,
  equipaggiamento, terreno, seguito; il percorso dello scontro è scelto
- Slancio cumulato, ferite, fuga, resa, morte
- Punto di sutura con S3: effetto evento `{ type: 'combat', ... }`
- Dettaglio in `docs/COMBAT.md`

#### Fase S5 — Fazioni e reputazione
- Lista fazioni concrete + matrice relazioni
- Reputazione che cambia per azioni
- NPC e luoghi reagiscono al valore di reputazione
- Dettaglio in `docs/FACTIONS.md`

#### Fase S6 — Propagazione delle informazioni
- NewsToken, onde, varianti rumor
- Eventi del mondo che generano news
- Locande/NPC come canali di lettura news per il giocatore
- Override (corvi, spie, sogni profetici)
- Dettaglio in `docs/NEWS_SYSTEM.md`

#### Fase S7 — Compagnia e covi
- Apprendista (slot unico, acquisizione e uscita narrativa)
- Compagni d'arme (Lama / Ombra / Conoscitore) con paga e fedeltà
- Integrazione nel combattimento (modificatori, niente micromanagement)
- Sistema covi: fondazione su location esistenti, slot strutture, degrado
- Integrazione covi ↔ news (volieria), paga (dispensa)
- Dettaglio in `docs/COMPANIONS.md`

#### Fase S8 — Archi narrativi e titoli
- Sistema missione/profezia
- Campagna episodica
- Titoli emergenti (osservano pattern dai sistemi precedenti)

#### Fase S9 — Polish, bilanciamento, retuning
- Risoluzione dei `[TBD]` numerici (calendario, paga, costi covo, frequenze eventi)
- Cataloghi concreti (fazioni, oggetti, creature, eventi)
- Tutorial/onboarding (uscita dall'Età della Veglia)
- Save/load completo e robusto
