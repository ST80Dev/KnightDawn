# Knight Dawn — Fazioni, territori e fedeltà

> **Stato: proposta da approvare** (novembre 2026), dallo spunto dell'utente: scegliere quando si vuole
> se giurare fedeltà a una casata o restare libero e mercenario, con conseguenze sull'Onore; casate con
> territorio attorno al castello, terre di nessuno in mezzo, unioni di casate («stile Trono di spade») e
> alleanze, visibili sulla Carta a colori; un mondo che si muove da solo a periodi medi, legato a notizie,
> scaramucce e guerre. Visione generale in `docs/GDD.md` §3 *Fazioni e reputazione*; ordine delle
> milestone in `docs/GDD.md` §5 (G3 statico, G4 dinamico).

## 1. Chi c'è nel mondo

- **Casate** — una per castello maggiore o per gruppo di castelli: la sede (castello di classe più alta)
  e 0–2 castelli vassalli. Proposta: **10–16 casate** sui ~28 castelli di un mondo. Ogni casata ha nome,
  blasone (due colori e una figura, generati), signore, carattere (ambiziosa, prudente, pia, avida,
  crudele…) e una **forza** astratta (uomini d'arme) e **ricchezza**.
- **Unioni** — 2–4 per mondo: più casate sotto una casata capo (regno, ducato, lega). Danno influenza su
  un territorio largo e obblighi tra i membri (una guerra a un membro chiama gli altri). Alcune casate
  restano **indipendenti**.
- **Alleanze** — patti tra casate o unioni, anche di unioni diverse; si fanno e si rompono.
- **Altre fazioni**, senza territorio a colori ma con reputazione: ordini religiosi (monasteri), città
  libere (comuni, mercanti), briganti (accampamenti). Nomi secondo le aree culturali del GDD §2.

## 2. Territori sulla Carta

- **Influenza per distanza di viaggio**, non a cerchi: da ogni castello si espande lungo il costo di
  viaggio (strade veloci, creste e fiumi senza ponte lenti), fino a un raggio che cresce con la classe
  del castello e la forza della casata. Una cella va alla casata con influenza maggiore.
- **Terre di nessuno**: dove nessuna influenza supera la soglia (lontano dai castelli, dietro le creste,
  paludi, alte valli) la cella resta libera. Lì briganti, eremiti, rovine; nessuna legge, nessun pedaggio.
- **Confini naturali**: un valico o un ponte presidiato appartiene a chi ha la torre di sentinella.
- **Sulla Carta**: tinta leggera del colore della casata, bordo più marcato per l'unione, terre di nessuno
  senza colore; legenda con casate, unioni e alleanze. Calcolo leggero (~10.800 celle, una ricerca a più
  sorgenti): si rifà a ogni cambio di confine.
- **Ciò che si sa**: la Carta politica mostra la **versione che conosce il cavaliere**, aggiornata dalle
  notizie (`docs/NEWS_SYSTEM.md`): un castello caduto lontano resta del vecchio colore finché la voce non
  arriva. (G4; in G3 la Carta politica è esatta.)
- Nelle Scene: stendardi del colore della casata su rocca e porta del borgo.

## 3. Fedeltà o ventura

La scelta si fa **quando si vuole**, la prima volta all'investitura: il signore che arma il garzone
chiede il giuramento, che si può accettare o rifiutare (si parte libero). Più tardi si può giurare a
qualunque casata che ti accetti, o sciogliere il giuramento.

| | **Giurato** (vassallo di una casata) | **Di ventura** (libero, mercenario) |
|---|---|---|
| Lavoro | incarichi della casata e dei suoi alleati | contratti con chiunque, a termine |
| Paga | modesta e regolare, poi un feudo minore (covo) | più alta, solo per contratto |
| Castelli | alloggio, cure e stalla gratis nei castelli della casata e dell'unione | si paga; le corti ricevono solo con reputazione |
| Strade | niente pedaggi nel territorio, protezione | pedaggi ovunque |
| Obblighi | **chiamata alle armi** quando la casata è in guerra; non si serve un nemico | nessuno oltre il contratto in corso |
| Nemici | i nemici della casata sono i tuoi | il nemico del committente, finché dura il contratto |
| Rango | via del vessillo: … → **Bannerale** della casata | via della ventura: … → **Capitano di ventura** |
| Onore | si guadagna rispettando gli obblighi | il contratto è affare: rispettarlo non dà Onore, romperlo lo toglie |

**Onore** (−5…+5, `Knight.onore`) [numeri DA BILANCIARE]:
- rispondere a una chiamata alle armi: +1 (una volta per guerra); rifiutarla: −1 e reputazione −;
- **congedarsi** in pace, con il permesso del signore: 0 (piccolo calo di reputazione con la casata);
- **sciogliersi da un signore fellone** (la casata ha commesso un atto infame, notizia nota): 0 o +1;
- **tradire** (lasciare durante una guerra, passare al nemico, consegnare un castello): **−3**; la casata
  tradita e i suoi alleati diventano ostili a lungo (si recupera solo con una grande impresa); il nuovo
  signore premia (oro, rango, feudo); la notizia si propaga e cambia l'accoglienza dove arriva;
- rompere un contratto di ventura a metà: −1; cambiare committente tra un contratto e l'altro: 0.
- Le casate con Onore alto non accettano il giuramento di chi ha Onore basso (soglia per casata secondo il
  carattere); le casate crudeli o avide sì, e pagano bene il lavoro sporco.

## 4. Il mondo si muove da solo

- **Simulazione astratta**, senza eserciti che camminano: ogni casata ha forza, ricchezza, ambizione,
  rancori e relazioni (−100…+100) con le altre. Gli scontri si risolvono a tiri pesati.
- **Due cadenze, nessuna breve** [proposta]:
  - **giro minore ogni ~5 giorni di gioco**: tensioni, scaramucce di confine, razzie, briganti, matrimoni,
    morti; ogni fatto è una **notizia** che parte dal suo luogo;
  - **giro maggiore a ogni Diario** (~25 giorni): alleanze fatte e rotte, guerre dichiarate o concluse,
    castelli che cambiano casata, unioni che si formano o si sciolgono; confini ricalcolati.
- **Guerre a fasi** (tensione → dichiarazione → razzie → assedio o battaglia → pace o caduta del castello):
  ogni fase dura giri, produce notizie e **incarichi** (difendere un villaggio, scortare un carro, portare
  un messaggio oltre le linee, combattere nella battaglia campale).
- **Il cavaliere pesa**: una battaglia vinta o persa da lui, un messaggio consegnato, un tradimento spostano
  le probabilità. Il mondo non aspetta il cavaliere, ma il cavaliere può cambiarlo.
- [Ipotesi, da tarare giocando] Se un giorno di gioco costa 10–20 minuti reali, il giro minore cade ogni
  ~1–1,5 ore di gioco e il Diario ogni 4–8 ore: abbastanza raro da non essere caos, abbastanza frequente da
  vedere il mondo cambiare in una partita.

## 5. Cosa rischia questo sistema

- [Certo] Una simulazione che il giocatore non vede è lavoro sprecato: tutto deve arrivare come notizia,
  incarico, colore sulla Carta o stendardo nella Scena.
- [Probabile] Mondi che degenerano: una casata che conquista tutto, o pace eterna. Servono freni
  (stanchezza di guerra, ribellioni nei castelli appena presi, carestie) e una verifica automatica sui
  30 semi che simuli 2–3 Luci senza giocatore.
- [Probabile] Il ritardo delle notizie sulla Carta politica è il pezzo più costoso: si fa in G4, dopo che
  quello esatto di G3 è provato.

## 6. Ordine di lavoro proposto

- **G3 — Casate e territori statici**: generazione per seme di casate, unioni, alleanze, nomi e blasoni;
  territori e terre di nessuno sulla Carta; stendardi; reputazione per casata; giuramento all'investitura
  e più tardi, congedo e tradimento con i loro effetti sull'Onore.
- **G4 — Mondo che si muove**: i due giri, guerre a fasi, notizie che si propagano, Carta politica
  conosciuta (in ritardo), incarichi e contratti generati dalle guerre e dai luoghi.

## Da decidere

- Numero di casate e unioni per mondo (proposta: 10–16 casate, 2–4 unioni).
- Nomi dei ranghi nelle due vie dopo Cavaliere Errante (`docs/EARLY_GAME.md` §2).
- Se un tradimento possa mai essere perdonato del tutto.
- File nuovo per la generazione e la simulazione (proposta: `js/mondo/fazioni.js`, senza grafica né DOM).
