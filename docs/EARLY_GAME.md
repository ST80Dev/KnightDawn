# Knight Dawn — Inizio gioco, ranghi e mercato

> Documento di design dell'**apertura** (Età della Veglia) e dei sistemi che la
> sorreggono: ranghi del cavaliere, azioni/missioni iniziali, mercato/economia.
> Vincolato alle scelte già prese nel `GDD.md` (§2 *Il cavaliere*, §3 *Tempo e
> calendario → Età della Veglia*, §3 *Interazione con luoghi*).
> Le sezioni marcate [DA BILANCIARE] contengono numeri provvisori.

---

## 1. Da dove si parte: il garzone di stalla

Il cavaliere **non nasce cavaliere**. La partita inizia nell'**Età della Veglia**
(prologo "fuori dalla storia", GDD §3): il protagonista è un **giovane garzone
di stalla** al servizio di un castello di fazione, **senza equipaggiamento, senza
cavallo, con pochi spiccioli**.

- Vive e lavora *dentro* il castello: è il suo hub iniziale (Carta del cronista).
- Con piccole azioni guadagna i primi oro → compra un ronzino e l'attrezzatura
  povera → si fa notare → si qualifica all'**investitura**.
- L'investitura è l'**evento di soglia** che chiude la Veglia: da quel Passo parte
  il conteggio ufficiale (*Prima Era · Prima Luce · Primavera · Diario 1 · Passo 1*)
  e il cavaliere diventa **Errante**, libero sulla mappa.

Questo riconcilia le scelte del GDD: la Veglia *era* descritta come "ambientamento
e addestramento, non registrato dai cronisti" — la fase del garzone **è** quel
contenuto, e funge anche da tutorial (viaggio, dialogo, primo combattimento).

### Stato iniziale del cavaliere (obiettivo per `Knight.init`)

Quando si costruirà la Veglia, lo stato di partenza dovrà essere:

- **Titolo:** `Garzone` (non più `Cavaliere Errante`).
- **Equipaggiamento:** nessuno (o al più un attrezzo da stalla improvvisato).
- **Cavallo:** nessuno (a piedi: viaggio lento, raggio d'azione ridotto).
- **Oro:** pochissimo [DA BILANCIARE, es. 2–3].
- **Attributi:** Forza/Volontà/Salute pieni; Onore 0. Nessuna classe (GDD §2).

> Il nome è scelto in creazione (editabile + casuale). Il **titolo** non si sceglie
> mai: parte da `Garzone`, sale di rango e più avanti diventa emergente (GDD §2).

---

## 2. Ranghi del cavaliere

I "livelli" sono **ranghi sociali**, non livelli RPG con punti-stat (coerente col
GDD §2: *"nessuna classe, nessun albero abilità"*). Un rango fa avanzare soprattutto
**accesso e opportunità**; i bonus passivi sono **modesti** (l'ascesa è sociale,
non power-creep). Riempie il `[TBD] Sistema di progressione` del GDD §2.

| Rango | Fase | Sblocca |
|---|---|---|
| **Garzone** | Veglia | lavori umili, mercato base, acquisto del primo ronzino |
| **Scudiero** | Veglia | addestramento col maestro d'armi, prime armi vere, piccole missioni fuori porta |
| **Cavaliere Errante** | soglia → Prima Era | libertà sulla mappa, contratti, assoldare il 1° compagno (Seguito) |
| **Cavaliere di Ventura** | mid | corti minori, fondazione del 1° covo |
| **Campione / Bannerale** | late | corti maggiori, più compagni, contratti d'élite |

[Proposta, novembre 2026, con la scelta tra fedeltà e ventura di `docs/FACTIONS.md` §3] Dopo Cavaliere
Errante i ranghi si dividono in due vie: **del vessillo** (giurato a una casata, fino a **Bannerale**) e
**della ventura** (libero, fino a **Capitano di ventura**; «Campione» resta un titolo d'impresa). Si può
passare da una via all'altra giurando o sciogliendo il giuramento. Nomi intermedi da decidere.

### Come si sale

Avanzamento per **imprese + reputazione + soglie d'oro**, mai per grinding puro.
La promozione è un **evento narrativo** (riconoscimento, investitura, nomina),
non un pulsante "sali di livello".

### Bonus per rango [DA BILANCIARE]

Volutamente piccoli, per non trasformare i ranghi in power-creep:

- piccolo aumento dei *cap* di attributo (es. +5 a un cap a ogni promozione);
- un **floor di reputazione** con la fazione che ti promuove;
- soprattutto: **porte che si aprono** (vedi colonna "Sblocca").

I ranghi si legano ai sistemi futuri: **Seguito** (S7 — quanti compagni puoi
assoldare), **Covi** (S7 — quando puoi fondarne), **Fazioni** (S5 — quali corti
ti ricevono).

---

## 3. Azioni e missioni del garzone (Veglia)

La Veglia si gioca **di persona nel borgo 3D della rocca di partenza** [rivisto con l'utente,
novembre 2026: la vista top-down del 2D, `js/castle.js`, non c'è più]. Il garzone cammina fino
alla porta di un edificio (stalla, taverna, armeria o fabbro, loggia del mercato, cappella,
palazzo del signore, porta del borgo) o fino a una persona; lì si apre la sua **Carta del
cronista** con il compito. **Ogni azione costa la sua durata in minuti di gioco** (GDD §3, tabella
«Azioni di persona») e rende **pochi oro**. Piano di attuazione in §7.

### Lavori al castello — oro sicuro, basso

- **Accudire i cavalli** — strigliare, dar fieno, pulire le stalle. Oltre alla paga,
  *impari a valutare i cavalli*: sblocca l'acquisto di un buon destriero più avanti.
- **Commissioni** — scaricare carri, portare messaggi, attingere acqua.
- **Servire alla taverna / origliare** — paga minima + **notizie** (aggancio col
  sistema News, S6): scopri lavori migliori o pericoli vicini.

### Piccole missioni fuori porta — primo assaggio di viaggio/combattimento

Raggiungibili **a piedi** (lente: rimarcano il bisogno di un cavallo). Nemici
facili per imparare il combattimento (S4):

- scacciare i lupi dall'ovile;
- ritrovare una bestia smarrita;
- consegnare un pacco al villaggio vicino (un ladruncolo lungo la strada).

### Investire ciò che guadagni

- **Maestro d'armi** — spendi oro + tempo per migliorare attributi base e
  **qualificarti all'investitura** (gate dell'evento di soglia).
- **Mercato/armaiolo** — dal coltello da contadino alla lancia, dal cuoio
  borchiato al **ronzino** (vedi §4).

**Arco tipico:** lavori umili → primi oro → ronzino + arma povera → prima missione
fuori porta → riconoscimento → **investitura** (fine Veglia).

---

## 4. Mercato / negozio nei castelli

Ogni **castello principale** ha un mercato, presentato come **scelta nella Carta
del cronista** (pulsante *Mercato* / *Armaiolo*) — non una scena navigabile.
Permette di **comprare e rivendere** equipaggiamento usato.

### Economia — volutamente semplice

Per scelta di design l'economia resta minimale:

- **Prezzi uguali in tutti i castelli.** Nessuna variazione regionale.
- **Niente stagionalità.** I prezzi non cambiano con Stagioni o clima economico.
- **Nessun (o quasi) livello di usura.** Gli oggetti **non** hanno gradi di
  condizione/età: un pezzo ha un **prezzo base unico**.
- **Rivendita a valore fisso.** Rivendendo un oggetto si ottiene una **frazione
  fissa X del prezzo base** — *perché è usato*, non in base a usura o età.
  X è uguale per tutti gli oggetti [DA BILANCIARE, es. ~50%].

In pratica:

```
prezzo_acquisto(oggetto) = oggetto.prezzoBase
prezzo_vendita(oggetto)  = round(X * oggetto.prezzoBase)   // X fisso, es. 0.5
```

### Inventario del negozio

Pescato dal **tipo di castello** e dalla **fazione** (modello a "pescaggi pesati"
del GDD §3). Categorie iniziali: armi, armature, scudi, cavalli, oggetti da viaggio.

### Distinzione dalla fucina del covo

Il mercato **commercia** (compra/vendi). La **fucina** del covo (GDD §3 *Covi*) fa
solo **manutenzione e lieve potenziamento**, non compravendita. Sistemi separati.

---

## 5. Cavallo (montatura)

Il cavallo riguarda **solo il cavaliere POV**. La compagnia (Seguito, GDD §2)
viaggia con lui in astratto: nessun cavallo né logistica per i compagni, che
contribuiscono solo in battaglia o con bonus speciali.

Ogni cavallo ha **due caratteristiche su assi diversi**:

- **Vigore** — riserva di **viaggio**. Cala tile per tile cavalcando (doppio sui
  terreni duri: montagna, palude, neve, ghiaccio). A 0 il cavallo è **stremato**:
  si prosegue a piedi finché non recupera. Si ricarica **abbeverandosi a un fiume**
  (attraversare un tile fiume) o con una **sosta** (accampa → Vigore pieno).
- **Possa** — forza in **battaglia**: bonus al combattimento quando si è in sella
  (dimezzato su terreni chiusi: foresta/palude/montagna; nullo se stremato).

A cavallo (con Vigore) il cavaliere **spende meno Forza** per tile (×0,7): è il
vantaggio di viaggio. A piedi o a cavallo stremato, la Forza si consuma come al
solito.

I **tier sono specializzati**, non una scala lineare — si sceglie tra cavallo da
viaggio e cavallo da guerra [DA BILANCIARE]:

| Cavallo | Prezzo | Vigore | Possa | Vocazione |
|---|---|---|---|---|
| **Ronzino**   | 14 | 20 | 0 | da garzone, povero in tutto |
| **Corsiero**  | 38 | 40 | 1 | gran viaggiatore, poca battaglia |
| **Destriero** | 60 | 28 | 3 | cavallo da guerra, autonomia media |
| **Palafreno** | 46 | 52 | 0 | comodo e di lungo raggio, nullo in mischia |

Si compra/vende al **mercato** (categoria cavalli); comprarne uno nuovo **permuta**
in automatico il precedente. Il garzone si compra il primo ronzino in Veglia
lavorando.

> [TBD] Il cavallo può essere **ferito o perso** in battaglia/eventi (per ora è al
> sicuro). [TBD] La cura dei cavalli in Veglia potrebbe sbloccare l'accesso a
> cavalli migliori.

---

## 6. Aperti / da definire

- [DA BILANCIARE] Valore dell'oro, prezzi base, paghe dei lavori, costo del ronzino.
- [DA BILANCIARE] Frazione di rivendita X.
- [DA BILANCIARE] Bonus esatti per rango e soglie di promozione.
- L'evento di soglia (investitura) è implementato: richiede **rango scudiero**
  (3 sessioni col maestro d'armi), **prima battaglia** (un incarico fuori porta
  vinto/sopravvissuto) e **oro** per armarsi. Numeri [DA BILANCIARE].
- [TBD] Morte del cavaliere in battaglia: manca lo schermo di game-over.
- [TBD] Catalogo oggetti iniziali (armi/armature/cavalli) con prezzo base.
- [TBD] Scelta dell'arco (Missione/Sandbox/Campagna, GDD §2): per ora default
  Sandbox; si aggancia qui quando si affronta S8.

---

## 7. Milestone G1 — Veglia giocabile e menu d'avvio

> Prima milestone di **gioco** (non di grafica), decisa con l'utente a novembre 2026: oggi nel 3D sono
> collegati solo `Knight`, `Calendar` e `Save`; `Events`, `Combat`, `News`, `Items` ed `Enemies` sono
> caricati ma nessuno li usa, e la Carta del cronista è un segnaposto (`main.js`, `apriCronista`).
> Ordine dei sistemi dopo G1 in `docs/GDD.md` §5. I passi aperti di grafica (M7 7–8, M8 5–8) proseguono
> solo quando un passo di gioco li richiede.

**Decisioni dell'utente (novembre 2026):**
1. Un Round di combattimento costa **minuti di gioco**, non un Passo (`docs/COMBAT.md` §2).
2. Il combattimento si gioca in un **riquadro a sé sopra la scena ferma** (`docs/COMBAT.md` §9).
3. Si comincia dalla Veglia, ma resta sempre una **modalità libera** senza storia, per provare la grafica
   e il resto senza ripassare dall'inizio.
4. La **scelta del tipo di partita viene prima della generazione del mondo** (menu d'avvio).
5. **Stagioni ferme**: il mondo resta in Primavera e la data non nomina la stagione (`docs/GDD.md` §2
   *Scoperta*, stagioni).
6. **Salvataggi in file JSON** che il giocatore scarica e ricarica dal menu d'avvio, prima della generazione del
   mondo; il seme di una partita nuova è casuale se non lo si scrive.

**Obiettivo.** Da una partita nuova in modalità Storia si gioca la Veglia dall'inizio all'investitura:
lavori nel borgo per i primi oro, mercato, maestro d'armi, un incarico fuori porta con il primo
combattimento, l'investitura. La modalità Libera parte invece da un cavaliere già fatto, con gli
strumenti di sviluppo.

**Durata della Veglia** [confermata dall'utente: ~60 minuti reali]: è il tempo reale che il prologo richiede prima che il
garzone diventi Cavaliere Errante e il mondo si apra. Decide quanti lavori servono, quanto pagano e
quanto costano ronzino e armi. Proposta: **~60 minuti reali** (forbice 45–90), cioè ~15–20 azioni e
~5–8 giorni di gioco (le azioni e il sonno fanno saltare il tempo d'un colpo; camminare nel borgo costa
poco). Più corta, il prologo diventa una formalità; più lunga, chi rigioca un mondo nuovo si annoia
(in quel caso c'è la modalità Libera).

### Passi (ciascuno provato nel browser e dal percorso di prova `?seme=570549&prova`)

1. **Menu d'avvio, prima della generazione.** Una schermata HTML all'apertura, prima che il Worker
   generi la Carta:
   - *Continua* (per ogni salvataggio presente): modalità, seme, data di gioco;
   - *Nuova partita — Storia*: Veglia, garzone fuori dalla porta del borgo, a piedi, 2–3 oro;
   - *Nuova partita — Libera*: Cavaliere Errante armato, con oro e cavallo; partenza standard del seme,
     Tavullia o coordinate (`centro`); strumenti di sviluppo attivi (Carta con il clic che porta lì, `T`
     Avanza); nessun evento di storia obbligato;
   - **seme**: casuale (predefinito) o scritto;
   - **due salvataggi automatici separati**, uno per modalità: provare in Libera non cancella la Storia;
   - `F8` riporta al menu invece di ricominciare su un seme a caso;
   - `?prova` salta il menu come oggi (il percorso di prova resta automatico); `?libera` e `?storia`
     saltano il menu e continuano (o cominciano) quella modalità; `?seme=` precompila il seme.
   - In Storia `T` (Avanza) è spento (GDD §3: «solo per i test») e la Carta di sviluppo si guarda senza
     il clic che teletrasporta, finché non arriva la Carta di gioco (G2).
   *Prova:* aprire, scegliere, ricaricare (si torna al menu con *Continua*), passare da una modalità
   all'altra senza perdere l'altra partita.
   **Stato: fatto, da provare dall'utente** (`js/3d/interfaccia.js`, `mostraMenuAvvio`; `save.js`: slot 0 Libera,
   slot 6 Storia, `modalita` nel salvataggio; `main.js`: `sceltaDiAvvio`, `nuovaPartitaDati(modalita)`, `tornaAlMenu`,
   `soloInLibera`). In Storia niente cavallo, `T` e i clic di Carta e minimappa che teletrasportano rispondono
   «solo nella modalità Libera». In Libera: Cavaliere Errante fuori dalla Veglia, spada, cotta e scudo, 60 oro, cavallo
   3D accanto (`Knight.cavallo` resta vuoto finché la milestone Cavallo non corregge `isMounted`, che oggi darebbe lo
   sconto di Forza anche a piedi). Provato in headless: menu, Storia nuova su seme scritto, `T` rifiutato, F8 al menu
   con *Continua*, Libera nuova su seme casuale, ricarica con due *Continua*, ripresa della Storia, `?prova` senza menu;
   nessun errore.
   *Seconda parte (dopo la prima lettura dell'utente):* **file JSON**. Nel menu ogni partita salvata ha «Scarica»
   (file `knightdawn-<modalità>-seme<N>-<data>.json`, la riga del salvataggio così com'è) e «Carica una partita da
   file…» riprende una partita da un file: entra nello slot della sua modalità (con conferma se ce n'è già una) e si
   gioca da lì, anche se il browser non permette localStorage. Un file che non è un salvataggio, o di un'altra versione,
   dà un messaggio e non tocca nulla. In gioco: F8 salva e porta al menu, da lì si scarica. Il campo del seme parte
   vuoto (casuale). Provato in headless: scarica, file non valido rifiutato, caricamento in un browser pulito con
   oro, data e seme identici.
2. **Carta del cronista vera.** Riquadro con titolo, testo, pulsanti tematici, prerequisiti visibili
   («Richiede…») ed esito; usa il motore di `js/events.js` così com'è. Effetto di tempo nuovo
   `{ type:'tempo', minuti:N }` accanto a `passi` (`Calendar.avanzaMinuti`); i costi della Veglia passano
   in minuti. Le porte degli edifici del borgo di partenza aprono gli eventi `veglia.*`: stalla → stalla
   o scuderia, taverna → taverna, mercato → loggia del mercato o armeria, sala d'armi → cortile della
   rocca, portale → porta del borgo, cappella → cappella o chiesa. Mentre è aperta il tempo è fermo.
   Pannello di stato con oro, rango ed equipaggiamento.
   **Orari** [deciso]: mercato, fabbro e lavori da Prima a Vespri; taverna fino a Compieta; di notte le porte
   sono chiuse. **Sonno** [deciso]: in stalla gratis (recupero di oggi), in taverna a pagamento (più Forza);
   `R` all'aperto resta, fuori dal borgo più rischioso. **Cure** [deciso]: la Salute torna piano dormendo, più in
   fretta pagando il guaritore o l'infermeria. **Con chi si parla** [deciso]: maestro d'armi, stalliere, oste e
   mercante alle porte dei loro edifici; le persone che camminano danno una riga e qualche voce.
   **Nome del garzone** nel menu (solo Storia, con «casuale») e **nome generato della casata di partenza** al posto
   della «Casata Vorn» scritta a mano: G3 lo riprenderà [deciso].
   **Stato: fatto, da provare dall'utente.** `js/3d/interfaccia.js` (`creaCartaCronista`: pergamena con titolo, testo,
   righe di cronaca e pulsanti; quelli non disponibili restano visibili, spenti, con il requisito; tasti 1–9, Esc o E
   per uscire), `js/events.js` (`{ type:'tempo', minuti }`; campi `aperto`/`chiuso` e `text` come funzione),
   `js/data/events_veglia.js` riscritto, `main.js` (porte → eventi, `dormiNelBorgo`, nome e oro nel pannello).
   Edifici → eventi nel borgo di partenza: stalla (lavoro 3 ore, +2 oro, −12 Forza; dormire nel fienile da Vespri,
   gratis, +5 Salute), pozzo, cucina e cantina (commissioni 2 ore, +1 oro), taverna (servire 3 ore, +1 oro e a volte
   una mancia, una voce; pagliericcio da Vespri 2 oro, +15 Forza e +10 Salute oltre al sonno), sala d'armi (lezione
   3 ore, 2 oro, −15 Forza, +4 Volontà; tre lezioni: Scudiero) — se la rocca non ha la sala d'armi il maestro sta
   all'armeria, se manca anche quella nel palazzo —, armeria, fabbro e loggia (mercato: pulsante spento fino al
   passo 3), guaritore e infermeria (cura 90 minuti, 2 oro, +30 Salute), palazzo del signore (la guardia non fa
   entrare un garzone), cappella e chiesa (investitura con i requisiti di prima; pregare 30 minuti, +3 Volontà).
   Orari: lavori, maestro, mercato e guaritore Prima–Nona; taverna e cappella fino a Vespri; poi la carta dice che
   è chiuso. Fuori dal borgo di partenza o in Libera la carta ha il nome e una riga. Menu: «Nome del cavaliere» con
   «Casuale» (solo Storia; 30 nomi anglo-fantasy, `docs/GDD.md` §2 «Culture e nomi»). Casata di partenza: `vegliaNomeCasata(seme)` (30 nomi anglo-fantasy, provvisorio fino a G3).
   Provato in headless (seme 570549): stalla, esito con «Indietro», taverna, maestro all'armeria (la rocca non ha la
   sala d'armi), palazzo con il nome della casata, taverna chiusa a Compieta, sonno nel fienile fino a Prima del
   giorno 2, guaritore; in Libera la taverna dà solo la riga; nessun errore. Numeri [DA BILANCIARE]: oggi una
   giornata di lavoro rende ~6–7 oro.
3. **Mercato, equipaggiamento, zaino e pasti.** Compra e vendi dal catalogo `js/data/items.js` (rivendita al
   50 %), equipaggiamento indossato; **zaino** con pochi posti e **pasti** (uno al giorno, `docs/GDD.md` §2
   «Pasti e zaino»); il ronzino comprato compare accanto al cavaliere (milestone Cavallo,
   `docs/ESPLORAZIONE_3D.md`). In Storia si parte a piedi, in Libera con il cavallo.
4. **Combattimento nel riquadro.** Tre colonne (cavaliere, scelte e Slancio, nemico) e cronaca dei Round;
   la scena dietro è ferma. Ogni Round confermato avanza il calendario dei suoi minuti; i rami di esito
   tornano all'evento. In Veglia a Salute 0 si sviene; dopo l'investitura **schermata di morte** con
   ritorno al menu. In Libera un comando di prova apre un
   combattimento con un nemico a scelta.
5. **Incontri fuori porta con gli animali** [rivisto con l'utente, novembre 2026: non i lupi sempre e solo
   all'ovile]. Camminando fuori dal borgo, soprattutto lontano dalle strade, di sera e di notte, può capitare un
   incontro casuale con un animale **scelto per bioma** (lupi e cinghiali nei boschi e in collina, orsi in
   montagna, vipere e rapaci sulle rocce, branchi in pianura aperta…), ognuno con **caratteristiche di
   combattimento proprie** (veloce: fuga difficile; in branco: più Round; carica; veleno: Salute persa dopo;
   timido: fugge se lo Slancio gira). Si gioca **solo nel riquadro di combattimento**: niente animali in 3D per
   ora. Serve ampliare il catalogo `js/data/enemies.js` (oggi 4 bestie). Il primo scontro sopravvissuto vale come
   «prima battaglia» per l'investitura. Gli incarichi del borgo (bestia smarrita, pacco al villaggio, guardia
   all'ovile) restano possibili, con l'animale pescato allo stesso modo.
6. **Investitura e fine della Veglia.** Requisiti come oggi (rango scudiero, prima battaglia, oro);
   cerimonia nella Carta del cronista, con la prima scelta tra **giurare fedeltà** alla casata del
   castello o **partire libero** (`docs/FACTIONS.md` §3; in G1 è solo la scelta registrata, gli effetti
   arrivano con G3); parte il calendario ufficiale (*Prima Era · Prima Luce · Primavera ·
   Diario 1 · Passo 1*); il garzone diventa Cavaliere Errante. Da qui la Storia prosegue a piedi o a
   cavallo; il viaggio vero sulla Carta arriva con G2.

### Accettazione

Una partita Storia nuova si gioca dall'apertura all'investitura senza console e senza `T`, in un tempo
vicino a quello deciso; morire porta alla schermata di morte; la modalità Libera parte in pochi secondi
dal menu e conserva la sua partita a parte; il percorso di prova funziona come prima; 60 FPS invariati
(il riquadro è HTML, la scena è ferma).

### Rischi

- [Certo] I salvataggi di oggi non hanno la modalità: alla prima apertura dopo G1 l'unico salvataggio
  diventa una partita Libera (è quella usata finora per provare).
- [Probabile] I 32 eventi scritti bastano per la Veglia, non per il resto del gioco: dopo G1 servono
  modelli di evento per tipo di luogo, riempiti con nomi e fazioni generati.
- [Probabile] Non tutti i borghi hanno tutti gli edifici della Veglia; per la rocca di partenza va
  garantito il gruppo minimo (stalla, taverna, mercato o armeria, cappella).
- [Ipotesi] La formula dello Slancio (`js/combat.js`) non è mai stata provata con un giocatore: il
  bilanciamento del primo combattimento chiederà qualche giro.

### Decise con l'utente (novembre 2026)

- Durata della Veglia: ~60 minuti reali.
- **Durante la Veglia non si muore**: a Salute 0 il garzone sviene e si risveglia nel borgo, curato, con
  qualche ora persa e senza l'oro che aveva addosso (confermato). **Dopo l'investitura la morte è vera**: la
  partita Storia finisce e il suo salvataggio si cancella (confermato; un file JSON scaricato prima resta
  del giocatore).
- File nuovo approvato: `js/3d/interfaccia.js` (menu d'avvio, Carta del cronista, riquadro di
  combattimento).
- Orari, sonno, cure, nome del garzone, casata di partenza generata, interlocutori alle porte (passo 2), pasti e
  zaino (passo 3), incontri casuali con animali per bioma solo nel riquadro (passo 5); numeri proposti da Claude e
  tarati dopo la prova.
