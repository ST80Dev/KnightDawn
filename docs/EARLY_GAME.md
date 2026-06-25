# FERRO & CENERE — Inizio gioco, ranghi e mercato

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

Tutto passa per la **Carta del cronista** del castello (GDD §3): scelte tematiche,
niente real-time. **Ogni azione consuma Passi** e rende **pochi oro**.

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
- [TBD] Condizioni precise dell'evento di soglia (investitura).
- [TBD] Catalogo oggetti iniziali (armi/armature/cavalli) con prezzo base.
- [TBD] Scelta dell'arco (Missione/Sandbox/Campagna, GDD §2): per ora default
  Sandbox; si aggancia qui quando si affronta S8.
