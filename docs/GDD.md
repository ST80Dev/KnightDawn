# Knight Dawn — Game Design Document

> Documento vivo. Le sezioni marcate [TBD] sono da definire.
> Ultimo aggiornamento: novembre 2026 — ordine delle milestone di gioco (§5), combattimento in minuti
> e nel riquadro (§3), Carta del cronista per il gioco di persona (§3 *Interazione con luoghi*).
> Prima: il gioco diventa **Carta e Scene su un mondo inventato,
> generato a ogni partita** (§2 *Il mondo*, §3 *Tempo e calendario*, §3 *Viaggio*). Le parti sulla
> mappa a tile del 2D sono superate dove lo dicono queste sezioni.

---

## 1. Visione

Un cavaliere errante in un mondo medievale-fantasy oscuro. Non conquisti il mondo:
ci navighi dentro. Non costruisci castelli: attraversi quelli degli altri.
Il mondo ha fazioni, segreti, stagioni, tensioni politiche che si muovono
indipendentemente da te. Tu sei un viandante con una spada e una storia da scrivere.

Il mondo è **inventato e generato a ogni partita** (seme condivisibile): forma, rilievo, mari,
fiumi, climi, luoghi, fazioni. Non si sa cosa c'è oltre l'orizzonte finché non ci si va.
Lo stile resta medievale, come il castello attuale. Dettagli in §2 *Il mondo*.

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
- **Esperienza** (cresce, cala raramente) — quanto il cavaliere ha vissuto; con un evento fa salire di livello
  (deciso con l'utente, 28/11/2026; regole in `docs/EARLY_GAME.md` §2)

**Progressione per ranghi.** Il cavaliere non parte tale: inizia come **garzone
di stalla** nella Veglia e sale di **livello** con l'Esperienza (Garzone → Scudiero → Cavaliere Errante →
Cavaliere Provato → Veterano → Campione → Leggenda), con un **ruolo** secondo la via (giurato: fino a Capitano e
Campione della casata; di ventura: Capitano di ventura, Condottiero). Livelli e ruoli sbloccano
*accesso e opportunità* (corti, contratti, covi, compagni) con bonus modesti —
niente albero abilità. Dettaglio completo (apertura, azioni, mercato) in
`docs/EARLY_GAME.md`.

**Pasti e zaino** [deciso con l'utente, novembre 2026, in stile Lupo Solitario; numeri da bilanciare]:
- uno **zaino** con pochi posti (proposta: 8) per le cose che si consumano: pasti, bende, torce, oggetti
  trovati; l'equipaggiamento indossato (arma, armatura, scudo) non occupa posti;
- **un pasto al giorno**: si compra in taverna e al mercato, si trova negli eventi; mangiare in taverna non
  consuma lo zaino. Se il giorno passa senza mangiare: niente recupero di Forza nel sonno e un poco di Salute
  persa (proposta: −3), come la Resistenza persa nel librogame. Il pasto si consuma da sé al risveglio, se
  ce n'è uno nello zaino, con un messaggio: niente micro-gestione;
- più avanti caccia e pesca come scelte (eventi), non come sistema a sé.

[TBD] Equipaggiamento: pesi, durabilità (resta il principio di `docs/EARLY_GAME.md` §4: nessuna usura)
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

> Deciso a novembre 2026, dopo la valutazione del prototipo 3D. Per un giorno si è scelta la
> geografia reale; scartata perché toglie la scoperta: si saprebbe già dove sono montagne, mari e
> valichi. Tecnica in `docs/ESPLORAZIONE_3D.md`, «Carta e Scene».

**Mondo inventato, generato a ogni partita.** Forma del continente, rilievo, mari, fiumi, climi,
luoghi, fazioni e nomi nascono dal seme. Il seme si può condividere per giocare lo stesso mondo.
Stile **medievale**, come il castello attuale; tono medievale-fantasy oscuro (§1).
Il terreno reale di **Tavullia** resta solo come **scena di prova** per lo sviluppo e come metro di
paragone per la credibilità del terreno generato.

**Due livelli: Carta e Scene.**
- **Carta del cronista** (livello strategico): viaggio con tempo compresso, eventi a ogni Passo,
  fazioni, notizie, scadenze. Qui vive quasi intera la logica del 2D.
- **Scene 3D** (livello di persona): arrivando in un luogo, fermandosi, o quando un evento
  ferma il viaggio, si è lì in 3D a scala 1:1 e ci si muove liberamente nei dintorni. In scena il tempo
  scorre col tempo reale, compresso (§3 *Tempo e calendario*); le azioni costano la loro durata
  plausibile, alla conferma. Il combattimento resta a turni.
- Nelle Scene il tempo scorre al ritmo della presenza (un'ora canonica ogni ~18 minuti reali, da fermi
  come in movimento, di giorno come di notte); i giorni di viaggio si consumano sulla Carta. Il gioco di persona si ottiene con scene **dense**
  (castello, borgo, dintorni di 1–2 km con cose da fare), non con distanze lunghe a piedi.

**Dimensioni e densità** [deciso con l'utente, novembre 2026; prima era una proposta di 600×450 km].
Il mondo è una **regione di ~120×90 km** (Carta a celle di 1 km): a 600×450 km, anche con molti luoghi,
tra due luoghi d'interesse c'erano ore di cammino e le missioni si sarebbero allungate a dismisura.
- **Gerarchia di densità** (distanze tipiche): luoghi maggiori (castelli di casata, città, monasteri)
  ~18 km, **30–40** per mondo; villaggi **60–100**; luoghi speciali (rovine, grotte, accampamenti,
  monasteri minori) **60–100**; le cose della campagna (cappelle, fonti, pastori, ponti) ogni 0,5–1,5 km e
  i dettagli e gli incontri ogni 100–300 m si generano dentro le Scene. Si visitano pochi luoghi ben fatti,
  non migliaia di luoghi generici.
- **Sessione di persona di 15–20 minuti**: da un castello di fondovalle al crinale per guardare oltre. Due
  regole, verificate in automatico: in montagna dal fondovalle al crinale ci sono **~3–5 km**; una parte dei
  castelli sta nei fondovalle o allo sbocco delle valli, **a ≤ 5 km da un crinale** con almeno ~800 m di
  dislivello.
- **Spostamenti**: o di persona nella Scena o sulla Carta, allo **stesso costo in tempo di gioco** (§3).
  Da castello a castello ~1,3 giorni a piedi, meno di 1 a cavallo; il mondo si attraversa in ~6–9 giorni a piedi.
- **Varietà nella distribuzione, non nel numero**: un mondo ha sempre catena, colline, pianura, costa,
  laghi, fiumi e il clima dal freddo all'arido, solo meno ripetuti. Si rimpicciolisce la scala d'insieme
  (forma del continente, numero di catene, fascia del clima), non la scala locale (larghezza delle catene,
  valli, gruppi montuosi, poggi, laghi, valichi). Accostamenti anche inverosimili a breve distanza sono
  accettati se rendono il gioco più vario (decade la distanza minima deserto–neve; resta solo che sabbia e
  neve non si tocchino).

**Modalità reale** [dopo M6, decisa con l'utente a novembre 2026]. Seconda modalità, accanto al mondo
generato, da giocare sapendo che rispecchia una regione vera: **rilievo reale** (coste, valli, montagne),
mentre copertura (boschi, rocce, paludi), clima, luoghi, nomi e fazioni sono **generati con le stesse
regole** del mondo inventato. Non riproduce città, paesi e borghi veri. I fiumi principali coincidono
con quelli veri (il drenaggio li ritrova nelle valli che hanno scavato); si sceglie quanti mostrarne.
Il mondo può essere più grande di quello generato (anche 600×450 km o più): i dati del terreno si scaricano
quando servono (tecnica e rischi in `docs/ESPLORAZIONE_3D.md`, «Modalità reale»).
- **Rinuncia accettata:** si perde parte della scoperta (si sa già dove sono montagne e valichi).
- **Varietà:** una regione vera ha meno tipi di paesaggio (in Italia niente deserto). Regge se la
  regione va dal mare alle montagne; le regole di varietà valgono per la copertura, non per il rilievo.
  Il contenuto legato ai biomi assenti (es. eventi del deserto) in questa modalità non compare.
- **Distanze accorciate** [proposta dell'utente, novembre 2026]: per viaggiare tra regioni diverse
  (es. l'Europa) senza decine di giorni di gioco, sulla Carta una cella vale *k* km reali ma costa come
  1 km del mondo generato. Con *k* scelto in modo che la Carta resti di dimensioni gestibili, il ritmo di
  viaggio è lo stesso delle due modalità [da ricalcolare dopo il passaggio a 120×90 km]. Le Scene restano 1:1: è la
  stessa distinzione già prevista tra tempo della marcia (Carta) e tempo della presenza (Scene).
- [TBD] Clima reale oppure «compresso» per latitudine come nel mondo generato (varietà ravvicinata su
  rilievo vero); regione fissa o scelta dal giocatore.

#### Regole di generazione: varietà ravvicinata, coerenza di massima

Il mondo **non è verosimile in scala**: i paesaggi diversi stanno molto più vicini che nella
realtà, perché viaggiare offra sempre qualcosa. Resta però **coerente**: nessun accostamento
assurdo.

Regole già definite nel 2D (`WORLD_GEN.md` e `world.js`, commit `2c869fa`), che **restano**:
- **Clima per latitudine**: nord freddo (neve, tundra, mare ghiacciato), sud caldo (deserti,
  pianure aride), centro temperato. La temperatura cala con la quota. I confini tra le fasce sono
  frastagliati da un rumore, quindi niente bande nette.
- **Catene montuose come creste** (rumore *ridged*), non altopiani a blob, con roccia ai piedi e
  colline ai fianchi.
- **Quote per quantile**: mare (5–11 %, mediana ~8 % [rivisto con l'utente, novembre 2026: prima 10–22 %; nel mondo di 120×90 km il mare aperto era spazio sprecato, i bracci di mare interni restano]) e, sulla terra, pianura (25–35 %), collina (45–55 %),
  pedemonte (8–12 %) e montagna (4,5–10 %) sono quote fisse della superficie [rivisto con l'utente a
  novembre 2026: più collina che pianura, per salire e guardare lontano]. Ogni mondo ha abbastanza mare e montagna, ma con forma sempre diversa
  (coste, isole, istmi, canali).
- **Boschi a grumi**, non tappeto uniforme. Più **micro-grumi di varietà** (3–5 celle, forma
  irregolare) per rompere ogni distesa: roccia e laghetti ghiacciati nella neve, ecc.
- **Fiumi** dalle alture al mare, con meandri; in un minimo locale formano un lago.
- **Carattere per seme**: più o meno mare, catene, boschi, deserto; mondi diversi tra loro.
- **Bordi liberi**: il mondo non è per forza un'isola; ai bordi c'è terra o mare secondo il rumore
  (anche una catena che arriva all'orlo). Un bordo di terra è un **confine invalicabile** (terre
  selvagge oltre le quali non si va) [deciso a novembre 2026].
- **Luoghi ignoti agli estremi** (nord, sud, isola remota), di natura nascosta finché non raggiunti.
- Vincoli di validità: abbastanza castelli e villaggi, almeno un porto se c'è costa, rovine e
  dungeon, castelli collegati, varietà di biomi.

Regole **nuove** per il 3D e per la varietà ravvicinata:
- **Poggi** [al posto dei massicci isolati, deciso con l'utente a novembre 2026: i coni di 1500–3000 m
  sembravano vulcani]. Molti rialzi arrotondati di 80–300 m, larghi 2–5 km, nelle zone basse: si sale
  per guardare lontano. Niente mosaico ripetuto pianura/colle: fitti o radi secondo zone ampie, misure
  e forme diverse, allineati in dorsali e gruppi. Non sui corsi d'acqua.
- **Punti panoramici** [regola decisa con l'utente]: sotto i 1500 m, da quasi ogni punto (≥ 90 % della
  terra) entro ~10 km c'è un'**altura** (almeno ~40 m sopra i dintorni) da cui si vede a 15–30 km in almeno una
  direzione (un settore di 90°) **che dal piede non si vedeva**: salire deve servire. [Rivisto con l'utente,
  novembre 2026: prima contavano anche punti di pianura che vedevano lontano già da terra; nel mondo di
  120×90 km la vista parte da 15 km invece di 20.]
  In montagna tra una cima e l'altra c'è quasi sempre un crinale più alto: lì la regola non vale.
- **Limite delle nevi** calcolato da latitudine (temperatura) e stagione: d'inverno scende, d'estate
  sale. Neve e ghiaccio dipendono da quota e temperatura, non da un bioma dipinto.
- **Gruppi montuosi riconoscibili** [deciso con l'utente, novembre 2026, sul modello di Dolomiti e Alpi]:
  4–12 gruppi per mondo, ognuno con una forma sua (torre, altopiano, piramide, cresta), separati da valli
  dove si cammina; pareti invalicabili, ghiaioni percorribili alla base, forcelle tra le torri dello stesso
  gruppo. Ogni gruppo è un luogo («il monte X», con un nome quando arriveranno i luoghi) a cui andare.
  Niente distese di guglie uguali né creste tutte identiche: ci si perderebbe.
- **Valichi e forcelle: due cose diverse** [deciso con l'utente, novembre 2026].
  - *Valico*: passaggio tra **due valli medio-grandi confinanti**, come i passi dolomitici: il punto **più
    basso e più abbordabile dello spartiacque** tra le due, una sella vera che scende verso le due valli e sale
    lungo la cresta ai lati (mai un cucuzzolo isolato) [deciso con l'utente, novembre 2026]; serve dove senza
    il valico le due valli sarebbero lontane (sistemi diversi o un lungo giro lungo i fiumi); di solito tra
    **~1000 e ~2000 m**, **valichi alti fino a ~2500 m**. Nessun valico si apre o si chiude, né con le stagioni
    né per altro: si può sempre passare; su un valico alto pesano rischio e fatica (quota, neve, freddo), nel
    costo del viaggio e negli eventi [deciso con l'utente].
    Se il crinale è troppo alto, il passo è scavato (al più di 500 m); al più un valico ogni ~20 km. I
    fondovalle salgono gradualmente addentrandosi nella catena (zoccolo dei contrafforti). È la via normale
    per passare da una valle all'altra (strade, pedaggi, imboscate). **Quasi sempre presidiato** da
    una costruzione di sentinella (torre, posto di guardia). Una rocca «di valico» sta più in basso, allo
    sbocco di una delle due valli.
  - *Forcella*: sella tra le torri di un gruppo montuoso, spesso molto più alta; passarci è **azzardato e
    faticoso**, spesso è nella neve, e **raramente qualcuno la sorveglia**: scorciatoia rischiosa, non strada.
  - Una sella tra due valli più in basso, in collina, non è un valico: è semmai un buon posto per una rocca.
- **Accostamenti vietati**: sabbia e neve non si toccano (almeno qualche km di prateria o roccia in
  mezzo), niente palude in quota. [Rivisto con l'utente, novembre 2026: niente più distanza minima
  deserto–neve; nel mondo di 120×90 km la varietà conta più della verosimiglianza.]
- **Niente distese monotone.** In ogni finestra di ~25×25 km (40 km nel mondo di 600 km) ci sono almeno 3 tipi di paesaggio
  (fuori dalle zone estreme). Nessuna area uniforme supera ~15 km senza un elemento che la
  interrompa: forra, lago, rupe, affioramento roccioso, bosco, palude, massiccio isolato
  [valori TBD, da tarare giocando].
- **Transizioni brevi** (1–3 km) e irregolari tra un paesaggio e l'altro, non lunghe sfumature.
- **Quote in metri** (il 2D usava valori normalizzati): pianure 0–200 m, colline 200–700 m
  (come il Montefeltro), pedemonte 700–1500 m, catene 1500–3500 m, poggi 80–300 m sul terreno.
- **Dentro le Scene** (blocchi di 2×2 km), dettaglio locale coerente col bioma della cella: rocce,
  calanchi, fossi, stagni, radure, alberi isolati.
- **I fiumi scendono davvero.** Nel 2D seguivano la distanza dal mare, non la quota. In 3D il loro
  letto deve scendere sempre e scavare la valle nel rilievo.
- **Strade, ponti e guadi** [deciso con l'utente, novembre 2026; si fanno **con i luoghi, dopo M6**:
  un ponte sta dove una strada incrocia un fiume, e una strada collega luoghi]. Nelle Scene i fiumi
  piccoli (fino a ~0,9 m d'acqua) si guadano, i grandi e i laghi no: non si deve poter passare ovunque,
  e il viaggio va indirizzato in modo coerente.
  - *Strade* tra i luoghi lungo i percorsi più comodi (poca pendenza, pochi attraversamenti, evitando
    paludi e creste), in gerarchia: strade maestre tra città e castelli, carrarecce verso i villaggi,
    sentieri (anche di pastori e di valico). Nelle Scene: terra battuta, terreno spianato sulla striscia.
  - *Ponti* dove una strada incrocia un fiume non guadabile, sparsi e quindi preziosi (luoghi da
    sorvegliare, pedaggi, imboscate); *guadi naturali* nei tratti larghi e bassi; *traghetti* sui fiumi
    più grandi.
  - Dove la strada passa, vegetazione meno folta (con i biomi, passo 7 di M6): la si segue anche senza
    vederla sulla Carta.

**Biomi.** Restano le categorie del 2D (pianura nei suoi tre tipi, foresta, collina, montagna,
roccia, palude, sabbia/deserto, neve, ghiaccio, fiume, acqua): eventi e costi già scritti restano
validi.

**Culture e nomi** [rivisto con l'utente, novembre 2026: prima il centro aveva un registro italiano-medievale].
**Tutto il mondo ha nomi anglo-fantasy** (cavaliere, casate, luoghi, persone), con l'impronta del Signore degli
Anelli, delle Cronache del ghiaccio e del fuoco (Trono di spade), degli Anelli del Potere, di House of the Dragon e di
Lupo Solitario: per lo più **varianti di nomi secondari** (es. Tarlow, Karstane, Mormount; Elfwine, Halbard, Rhygar),
pochi identici, mai i protagonisti. La lingua dell'interfaccia resta l'italiano («Casata Tarlow», «la taverna»),
come in una traduzione italiana di quei romanzi. Restano le **aree culturali legate al clima**, ora come sfumature
dello stesso registro: nord aspro e nordico (Rohan, il Nord di Westeros, Holmgard), centro cavalleresco (Gondor,
l'Altopiano, le Terre dei fiumi, Sommerlund), sud più caldo e antico (Dorne, Númenor, Durenor). Ogni area dà nomi,
fazioni generate per seme (G3) e, più avanti, il proprio stile di architettura. Oggi esistono solo le liste del
nome del cavaliere (`js/3d/interfaccia.js`) e della casata di partenza (`js/data/events_veglia.js`).

**Strutture:** castelli, villaggi, città, rovine, dungeon, porti, monasteri, accampamenti, torri,
valichi, ponti, guadi
**Elementi naturali:** fiumi, laghi, passi montani, foreste fitte, paludi, coste, deserti, poggi

#### Scoperta

Il giocatore non sa cosa c'è oltre l'orizzonte: la forma del mondo è nuova a ogni partita.
In più:
1. **Conta ciò che sa il cavaliere.** La Carta mostra solo ciò che il cavaliere ha visto o sentito
   dire (nebbia della conoscenza, erede della nebbia di guerra del 2D). Da lontano i luoghi sono
   voci: nomi incerti, posizioni approssimate. Dalle alture si vede lontano: salire su un
   massiccio rivela il paesaggio attorno.
2. **Le condizioni cambiano**: un valico alto più duro d'inverno (neve, freddo: rischio, mai chiusura), presidiato da una fazione
   ostile, infestato da briganti o gravato da un pedaggio. Le notizie arrivano in ritardo e
   imprecise (§3 *Propagazione delle informazioni*).
3. **Il fantastico**: creature, maledizioni e luoghi leggendari.

Il mondo ha **stagioni** che influenzano il gameplay. **Ferme** [deciso con l'utente, novembre 2026]: le
stagioni non scorrono; il mondo resta in **Primavera** (colori, limite delle nevi). La varietà di clima la danno
i biomi della Carta, dal freddo all'arido. Il calendario non nomina la stagione: i Diari si contano da 1 a 12
dentro la Luce (`CALENDAR.STAGIONI_ATTIVE = false` in `js/calendar.js`). Se un giorno si riattivano:
- Primavera: viaggio facile, commercio attivo
- Estate: siccità possibili, ribellioni contadine
- Autunno: raccolto, feste, diplomazia
- Inverno: valichi alti più duri (neve, freddo: rischio e fatica, mai chiusi), fame, creature più aggressive

[TBD] Tabella costi di viaggio per cella (bioma, pendenza, strade)
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
  cadenza per eventi di fazione, tributi, consigli. Numerato dentro la Stagione (1-3); con le stagioni
  ferme (oggi) numerato dentro la Luce (1-12).
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
| Scena 3D, di giorno e di notte    | Tempo reale ×10: 1 Passo ogni 18 min reali, da fermi come in movimento; dormendo, salto a Prima |
| **Pausa (`P`, scheda nascosta)**  | **Nulla scorre**: né Passi, né deadlines, né mondo |
| Pausa modale (pre-recap, POI)     | Come la pausa: nulla scorre                       |
| Lettura evento / scelta narrativa | Nulla scorre durante la lettura                   |
| Azione atomica dentro luogo       | *N* Passi scattano d'un colpo a conferma azione   |
| Combattimento (Round interattivi) | I minuti del Round a ogni Round confermato (`docs/COMBAT.md` §2) |

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
  parlamento, colpo) avanza il calendario dei suoi minuti di gioco (pochi
  minuti in un duello, ore per una fase di battaglia; prima era 1 Passo).
  La durata reale del combattimento è decisa dal giocatore, non dal sistema.
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

**Nelle Scene 3D (deciso a novembre 2026)** le azioni fatte di persona costano la loro **durata
plausibile in minuti di gioco**, convertita in frazione di Passo (`Calendar.avanzaMinuti`). La tabella
sopra era calibrata per il 2D, dove ogni azione doveva consumare un turno intero: parlare con 4 persone
non può costare 12 ore. Gli eventi già scritti (`js/data/events_*.js`, costi in Passi interi) vanno
rivisti quando si agganciano alle Scene.

| Azione di persona                                  | Durata in-fiction | Frazione di Passo |
|----------------------------------------------------|-------------------|-------------------|
| Scambio breve (saluto, domanda, indicazione)       | ~10 min           | ~1/18             |
| Conversazione vera (informazioni, racconto, trattativa) | 30–60 min    | 1/6–1/3           |
| Contrattare al mercato (più acquisti)              | 1–2 ore           | 1/3–2/3           |
| Curare una ferita lieve                            | 1–3 ore           | 1/3–1             |
| Sosta di riposo di giorno (+10 Forza)              | ~3 ore            | 1                 |
| Addestrarsi                                        | mezza giornata    | 2–4 Passi         |
| Dormire (all'addiaccio ~+30 Forza da Compieta; di più in locanda) | fino a Prima | salto atomico |

Esempio: girare il borgo a piedi (10 minuti reali ≈ 1h40 di gioco), parlare con 3–4 persone (~45–60 minuti),
contrattare al mercato o dal fabbro (1–2 ore) e una sosta in taverna (~1 ora): ~14 minuti reali, mezza giornata
di gioco. **Il calendario scorre per ciò che si fa** (muoversi, parlare, contrattare, riposare), non per il tempo
reale passato a decidere.

**Ritmo del tempo nelle Scene** [rivisto con l'utente, novembre 2026: prima ×15 di giorno e ×60 di notte].
Un solo rapporto **×10**, da fermi come in movimento, di giorno come di notte: stando fermi il tempo non corre
più in fretta. Un'ora canonica ogni 18 minuti reali; dal castello al valico (~5 km, ~900 m di salita, ~20
minuti reali di corsetta) passano ~3,5 ore, come per un escursionista vero e quasi come sulla Carta, che
conta la salita (regola tipo Naismith). **La Carta è allineata alla Scena**: 1 km di corsetta costa ~37
minuti di gioco in entrambe (a piedi ~14 km al giorno; a cavallo ~28), così andare di persona non è mai una
penalità di calendario: costa solo tempo reale. **Niente salti di tempo senza motivo** [deciso con
l'utente]: Avanza (tasto T) resta solo per i test. Il tempo passa muovendosi, agendo o riposando (R); per
arrivare a un'ora precisa (un incontro a Vespri, le porte del borgo) ci saranno azioni con un motivo e un
luogo: aspettare all'osteria, fare la guardia, appostarsi. La notte di solito si salta dormendo; chi resta
sveglio la vede passare in ~54 minuti reali, al buio e con incontri più rischiosi: vegliare è una scelta. A ogni ora canonica il mondo
«gira» (meteo, scadenze, possibile incontro casuale, notizie), come nel 2D; gli incontri di persona
invece nascono dai luoghi e dalle persone, senza aspettare l'ora. Nelle Scene la Forza cala con la
distanza (di più correndo e in salita) e **si recupera da fermi**, ~10 per Passo di gioco, allo stesso
ritmo che si aspetti o si riposi.

#### Corrispondenza con viaggio medievale

Ritmi [rivisti con l'utente, novembre 2026: Carta allineata alla Scena, prima 12 km per Passo]: **a piedi
~4,9 km per Passo di marcia** in piano (la salita conta come strada in più: 600 m ≈ 4 km), circa 3 Passi di
marcia al giorno (~14 km), poi la Forza impone la sosta. **A cavallo ~2×**: ~10 km per Passo, ~28 km al giorno
(di persona il galoppo va a ~13 min per km ma consuma il vigore del cavallo; sulla giornata la media è la
stessa). Per mare ~2–2,5× a piedi, giorno e notte, secondo il meteo [da ritarare]. Sono ritmi di gioco, non
reali (un viandante vero fa 25–30 km al giorno): il mondo è piccolo in km e grande in giorni. Le **soste** (notte,
accampamento) sono azioni atomiche: avanzano il calendario d'un colpo, senza tempo reale.

| Distanza nel mondo generato | Esempio | Tempo in-fiction | Tempo reale (15 s / 3 s per Passo) |
|---|---|---|---|
| ~18 km | da un castello al vicino | ~1,3 giorni a piedi (~4 Passi di marcia), meno di 1 a cavallo | ~1 min / ~11 s |
| 30–45 km | da una fascia climatica alla vicina | 2–3 giorni a piedi | ~2 min / ~25 s |
| 90 km | da nord a sud | ~6,5 giorni a piedi (~19 Passi di marcia + soste) | ~4,5 min / ~1 min |
| 120 km | da ovest a est | ~8,5 giorni a piedi, ~4,5 a cavallo | ~6 min / ~1,3 min |

Il tempo reale esclude le soste per gli eventi, che sono il gioco vero. [Mondo di 120×90 km, deciso con
l'utente: il tempo si passa nei luoghi e nelle Scene, non a marciare sulla Carta.] Il calendario (Diario,
Stagione, Luce) non si ritocca.

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
- **Scelta della meta** [deciso con l'utente, novembre 2026; si fa in G2, sulla Carta di gioco e sulla minimappa
  grande]. Passando col mouse, un luogo si «aggancia» entro una ventina di pixel (vince il più vicino al puntatore):
  il nome si ingrandisce, il segno si illumina, cambia il cursore. Al clic un riquadro nello stile della Carta del
  cronista chiede conferma e dice il costo: «Viaggiare fino a Villaggio di Hornwold? 6 km per strada, ~4 ore a piedi,
  arrivo a Vespri, Forza −20» (con l'eventuale traghetto o barcaiolo e il suo prezzo), «Parti» o «Annulla». In Storia è
  un viaggio vero (tempo, Forza, eventi lungo la strada); in Libera sposta subito e gratis, per le prove. Si scelgono
  solo luoghi conosciuti o intravisti (nebbia della conoscenza); sull'ignoto al più «cammina in quella direzione».
  **Punto d'arrivo**: fuori dal luogo, a poche decine di metri, con il luogo in vista e il cavaliere rivolto verso di
  esso, dal lato da cui si arriva (sulla strada percorsa): borgo e rocca ~35–40 m fuori dalla porta, sulla strada
  d'accesso; villaggio, rovina, grotta, monastero 30–60 m fuori dall'ingombro, su terreno percorribile (mai in acqua o
  contro un muro).
- Celle di ~1 km. Il costo di ogni cella in tempo, Forza e
  vigore del cavallo dipende da bioma, pendenza e presenza di strade. La tabella per bioma del
  2D (`TRAVEL_COST`) resta come base.
- Mezzi: a piedi, a cavallo, per mare (dai porti; anche traghetti e guadi).
- **Porti e rotte per mare** [deciso con l'utente, novembre 2026; si fanno con i luoghi]:
  - il mare che tocca il bordo della Carta **continua oltre la mappa** (come nella Scena, dove oltre il bordo il
    paesaggio prosegue a specchio): tutti i tratti di mare che toccano il bordo sono collegati da **rotte esterne**
    appena fuori dalla mappa, lungo il perimetro; il tempo si conta sulla loro lunghezza vera (da un angolo
    all'opposto ~200 km: 2–3 giorni di nave contro 9–12 a piedi). Per ora le navi toccano solo porti della mappa
    (destinazioni fuori mappa, anche solo di nome, da decidere);
  - i **mari interni** (che non toccano il bordo) collegano solo i porti sulle loro rive;
  - un **porto** nasce solo dove serve: almeno un altro porto raggiungibile per mare e una rotta che fa risparmiare
    tempo rispetto al viaggio a piedi. Uno specchio d'acqua piccolo e isolato non ha porti (al più un villaggio di
    pescatori).
- **Isole e traghetti** [segnalato dall'utente, novembre 2026; misurato su 28 semi]. Le isole abitate stanno nel mare
  (seme 6: 181 km² con un monastero e due villaggi) e nelle lagune costiere (seme 19: 52 km² con una città); nei
  laghi interni solo isolette (seme 17: un villaggio su 1 km²). Decisioni dell'utente: **nessun luogo dove non si
  sbarca** (sorvegliato da `verificaAccessi` nel generatore: zero luoghi irraggiungibili su 30 semi), **rotte per mare
  subito**, **barcaiolo** approvato. Il generatore (M6, `carta.traghetti`) dà un solo elenco di tratte con
  `tipo: 'traghetto' | 'mare' | 'barcaiolo'`, `km` navigati, `giro` (km a piedi per lo stesso tragitto, `Infinity`
  se non c'è), `isolata` (unica via d'accesso), `rotta`, e due capi `a`/`b` con `sorta` `'villaggio' | 'rocca' |
  'approdo'` (`'approdo'` = riva senza insediamento, capolinea del barcaiolo, `sito: -1`; gli id non sono unici fra
  `carta.siti` e `carta.luoghi`: guardare `sorta`) e la cella di riva `rx, ry` dove sta il molo. Numeri su 10 semi:
  ~8 tratte per mondo (metà traghetti, metà mare, pochi barcaioli); traghetti 2–21 km, mare fino a ~70 km, barcaioli
  ≤ 14 km. Il viaggio (G2) le tratta tutte con il **passaggio sulla Carta** (al molo della Scena «imbarcati» riporta
  alla Carta e sbarca all'altro capo; nessuna barca da guidare). **Regole per i costi** (da fissare in G2): tempo
  alla velocità della barca (2–2,5× a piedi), un'attesa d'imbarco, qualche moneta (di più per mare e per il
  barcaiolo, che va solo di giorno); una tratta `isolata` non deve mai diventare impossibile (troppo cara o chiusa
  dal maltempo renderebbe irraggiungibile un luogo); le altre sono scorciatoie e devono costare meno del `giro`,
  altrimenti non servono.
- Durante il viaggio possono scattare eventi (incontri, meteo, scoperte). Il giocatore può fermarsi
  quando vuole: fermarsi vuol dire entrare nella scena 3D di quel punto. Un evento (imboscata,
  incontro) può fermare il viaggio e portare in 3D lì.

**Nelle Scene 3D.**
- A scala 1:1, a piedi (poi a cavallo). Il tempo scorre col tempo reale compresso (§3 *Tempo e
  calendario*); la Forza segue la distanza: correre fa vedere più cose nello stesso tempo ma stanca
  di più.
- Muoversi nella Scena costa lo **stesso tempo di gioco** che sulla Carta (1 km di corsetta ≈ 37 minuti):
  si sceglie solo quanto tempo reale spendere. **La Scena è il tempo della presenza** (guardarsi attorno,
  cercare, salire a guardare oltre, parlare), **la Carta quello della marcia** con una meta. Uso tipico:
  sulla Carta fino ai dintorni della meta, di persona gli ultimi 1–3 km.
- Dettagli in `docs/ESPLORAZIONE_3D.md`.

### Combattimento

Combattimento **a Round interattivi** (vedi `docs/COMBAT.md`), in un **riquadro a sé sopra la
scena ferma** [deciso con l'utente, novembre 2026]. Sospende il tempo reale e diventa turn-based
puro: il calendario avanza dei minuti del Round solo a ogni Round confermato dal giocatore (auto,
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

[Rivisto con l'utente, novembre 2026, per il gioco di persona.] **Il 3D decide dove sei e con chi
parli, la Carta del cronista decide cosa fai.** Nel luogo si cammina di persona (borgo, villaggio,
monastero); arrivati alla porta di un edificio o a una persona si apre una **Carta del cronista**:
una composizione in stile manoscritto miniato medievale (cornice ornata, testo, pulsanti tematici;
la miniatura in alto arriverà più avanti). Gli interni non si disegnano (`docs/PRESTAZIONI.md`):
ciò che accade dentro un edificio sta nella carta.

Dentro la carta si interagisce *per scelta*, non *per clic su posizione*.

- **Miniatura** in alto: illuminazione singola (sala del trono, taverna,
  cella, biblioteca…) coerente con lo stile della mappa.
- **Pannello narrativo** sotto: descrizione testuale generata dal contesto
  + lista di pulsanti tematici per azioni e NPC presenti.
- **Pulsanti contestuali**: cambiano in base a chi è presente, ora del giorno,
  stagione, reputazione del cavaliere, news note al nodo, seguito al fianco.
- **Tempo**: ogni interazione consuma Passi.
- **Esplorazione assorbita** solo per ciò che non si disegna: pulsanti come *"Osserva la sala"*,
  *"Chiedi notizie"* fanno *pescaggi pesati* su tabelle di scoperta (oggetti, persone, eventi).
  Fuori dagli edifici si cerca di persona: nelle Scene gli incontri stanno in un punto del mondo
  (un accampamento, un viandante sulla strada, il lupo vicino all'ovile); gli eventi a probabilità
  per Passo valgono per il viaggio sulla Carta.

Stesso linguaggio visivo viene riusato per gli eventi di viaggio
(modalità *Sospesa*), che appaiono come *carte mobili* sopra la mappa.

Dettaglio completo del modello di gameplay → `docs/GAMEPLAY.md`
Dettaglio architettura testi → `docs/TEXT_SYSTEM.md`

[TBD] Lista tipi di luogo con relativa miniatura
[TBD] Sistema di interazione NPC
[TBD] Sistema di commercio
**Missioni** [principio deciso con l'utente, novembre 2026; tipologie, durata e ricompense da discutere
prima di G4]: niente schema fisso «incarico → ritorno». Il cavaliere ha più missioni aperte insieme, di
tipi, obiettivi e destinazioni diversi, e sceglie lui quali portare avanti e in che ordine, intrecciando le
trame a piacere. Ogni missione ha **obiettivi parziali** che danno già qualcosa (oro, notizie, reputazione,
esperienza) anche se la missione non si chiude; chiuderla dà il premio maggiore. Il ritorno dal committente
è solo uno dei tipi possibili.

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
> **generatore del mondo** (Carta e Scene). Le fasi S3–S9 restano valide come contenuto.
>
> **Ordine del gioco dopo il 3D** [deciso con l'utente, novembre 2026]. I sistemi esistono in parte
> come logica (`js/*.js`) ma nel 3D sono collegati solo `Knight`, `Calendar` e `Save`. Si procede
> per milestone di gioco, ognuna giocabile:
> 1. **G1 — Veglia giocabile e menu d'avvio** (Storia o Libera, prima della generazione): Carta del
>    cronista vera, mercato, combattimento nel riquadro, lupi all'ovile, investitura. Piano in
>    `docs/EARLY_GAME.md` §7.
> 2. **G2 — Viaggio sulla Carta**: la Carta di sviluppo diventa di gioco (percorso, tempo e Forza,
>    eventi di viaggio, «fermati qui» che porta nella Scena) e **nebbia della conoscenza** rivelata da
>    ciò che il cavaliere vede dalle alture. (La versione base della nebbia, per vicinanza, è già in G1:
>    `docs/EARLY_GAME.md` §7, passo 1b.)
>    Comprende traghetti, rotte per mare e isole (§3 *Viaggio*, «Isole e traghetti»).
> 3. **G3 — Fazioni e nomi generati** (S5, prima parte).
> 4. **G4 — Incarichi per tipo di luogo, reputazione, notizie che si propagano** (S3, S5, S6).
> 5. **G5 — Seguito e covi** (S7). 6. **G6 — Archi narrativi e titoli** (S8).
>
> La **modalità Libera** (senza storia, strumenti di sviluppo attivi) resta sempre disponibile per
> provare grafica e sistemi senza ripassare dall'inizio. I passi aperti della grafica proseguono
> quando un passo di gioco li richiede.

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
- Generatore del mondo (Carta a celle di 1 km e Scene coerenti con essa), dal seme
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
- **Un Round costa minuti di gioco** secondo il tipo di scontro (prima 1 Passo, rivisto a novembre 2026)
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
