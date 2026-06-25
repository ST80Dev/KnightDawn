# Knight Dawn — Specifiche Grafiche

> Documento di riferimento per la grafica del gioco.
> **Questo è il focus della Fase 1.**

---

## 1. Filosofia visiva

### Stile: Cartografia medievale su pergamena

La mappa principale è disegnata come una carta geografica medievale autentica:
pergamena invecchiata, inchiostro bruno, icone simboliche per montagne/foreste/castelli.
Lo stile richiama le title sequence di Game of Thrones / House of the Dragon
e le mappe illustrate del Signore degli Anelli.

**NON è** pixel art a blocchi grossi stile 8-bit.
**È** pixel art fine stile VGA/SVGA anni '90 (Monkey Island, King's Quest V-VI)
con palette limitata e dithering autentico, applicata a un'estetica cartografica.

### Due registri visivi

1. **Mappa top-down (cartografica):** pergamena, inchiostro, simboli. Vista principale.
2. **Carta del cronista (luoghi ed eventi):** composizione statica in stile
   manoscritto miniato medievale — cornice ornata, miniatura centrale,
   testo narrativo, pulsanti tematici. Non è una scena navigabile.
   Stesso formato usato per scene di luogo (carte stanziali) e per eventi
   di viaggio (carte mobili). Dettaglio in `docs/GAMEPLAY.md`.

---

## 2. Palette colori

### Palette pergamena (mappa top-down)

Tutti i colori della mappa derivano dalla pergamena. Limitati, caldi, terrosi.

```
NOME                  HEX       USO
──────────────────────────────────────────────────────
pergamena-chiara      #d8c8a0   sfondo base, zone esplorate
pergamena-media       #c8aa6a   sfondo variazione, texture
pergamena-scura       #b09050   ombre pergamena, bordi
pergamena-macchia     #9a7a3a   macchie invecchiamento, angoli
inchiostro-leggero    #7a5a2a   testi secondari, sentieri
inchiostro-medio      #5a3a18   bordi elementi, testi
inchiostro-scuro      #3a2010   testi principali, contorni forti
inchiostro-nero       #1a0e04   contorni netti, dettagli fini

verde-bosco           #2a5a18   foreste, vegetazione
verde-bosco-scuro     #1a3a10   foreste dense, ombre vegetazione
verde-palude          #3a5a2a   paludi, zone umide

blu-fiume             #3a6a9a   fiumi, laghi, costa
blu-fiume-chiaro      #4a80b4   riflessi acqua

marrone-montagna      #6a5a3a   montagne base
marrone-montagna-ch   #7a6a48   montagne luce
neve-cime             #e8e0d0   neve sulle cime

rosso-bandiera        #8a1010   stendardi, sangue, pericolo
rosso-bandiera-ch     #aa1818   stendardi luce

grigio-pietra         #8a7a5a   castelli, mura, rovine
grigio-pietra-scuro   #6a5a40   ombre pietra
marrone-tetto         #6a3a18   tetti edifici

cavaliere-marker      #cc2020   posizione giocatore sulla mappa

sabbia                #c8a870   zone desertiche
nero-dungeon          #2a1a08   aperture, portoni, caverne

terra-sentiero        #5a3a18   sentieri e strade (tratteggiati)
```

### Palette HUD (pannello inferiore)

L'HUD usa toni scuri per non competere con la mappa.

```
NOME                  HEX       USO
──────────────────────────────────────────────────────
hud-sfondo            #1e1008   sfondo pannelli
hud-sfondo-alt        #120c04   sfondo alternativo, più scuro
hud-bordo             #5a3a18   bordi pannelli
hud-bordo-luce       #8a6030   bordi evidenziati
hud-testo-titolo      #c8a030   titoli, etichette principali
hud-testo-evento      #c87020   eventi importanti nel log
hud-testo-normale     #8a5a20   testo log standard
hud-testo-dim         #5a3a18   testo secondario, vecchio
hud-testo-morto       #3a2210   testo molto vecchio nel log
hud-pulsante-bg       #120c04   sfondo pulsanti
hud-pulsante-bordo    #4a3010   bordo pulsanti
hud-pulsante-testo    #c8a030   testo pulsanti

barra-vigore          #2a7a1a   barra vigore
barra-vigore-luce     #3a9a22   highlight barra vigore
barra-volonta         #4a3ab0   barra volontà
barra-volonta-luce    #6050c8   highlight barra volontà
barra-onore           #b07a18   barra onore
barra-onore-luce      #d09820   highlight barra onore
barra-ferite          #aa2020   barra ferite
barra-ferite-luce     #cc2828   highlight barra ferite
barra-sfondo          #0e0804   sfondo barre
```

### Palette Carta del cronista (luoghi ed eventi)

[TBD] Da definire quando si lavora sulla Fase G3.
Direzione: estendere la famiglia cromatica della pergamena con:
- Tonalità più sature per le miniature (rossi cinabro, blu lapislazzulo,
  ori, verdi malachite — i pigmenti del manoscritto miniato)
- Cornice ornata: ori scuri, bruni, rosso porpora
- Testo: stessa palette inchiostro della mappa per coerenza

---

## 2b. Vista luoghi — Layout top-down

Quando il cavaliere entra in un luogo interattivo (castello, villaggio, monastero…),
la mappa non cambia registro visivo: si mostra un **layout schematizzato del luogo
visto dall'alto**, con la stessa grammatica cartografica della mappa di viaggio
(pergamena, inchiostro, pixel art).

### Principio di interazione a due livelli

1. **Livello 1 — Layout luogo:** vista top-down dell'area, edifici cliccabili.
   Il cavaliere si sposta automaticamente all'area selezionata. Non è navigazione
   libera: si clicca una destinazione, il cavaliere ci va.
2. **Livello 2 — Carta del cronista:** cliccando un edificio/area specifica,
   appare la Carta del cronista per quell'area. La miniatura mostra l'edificio
   specifico (taverna, sala del trono, fabbro), non il luogo generico.

### Elementi fissi vs variabili

Ogni tipo di luogo ha:
- **Sempre presenti** — edifici garantiti, sempre cliccabili
- **Standard** — presenti nella maggior parte delle istanze
- **Variabili** — randomizzati per singola istanza (alcuni castelli li hanno, altri no)

Il catalogo dettagliato per tipo di luogo verrà definito in una fase successiva,
incrociando questo schema con il catalogo completo dei luoghi di gioco.

### Caso speciale — Palazzo del Signore (castello)

Il palazzo/keep principale è suddiviso in zone interne solo se ciascuna produce
un'interazione meccanicamente diversa dalle altre. Soglia minima:
- **Sala del trono** — incontro formale, missioni, giuramenti
- **Camera del consiglio** — informazioni politiche, intrighi

Ulteriori stanze solo se portano dinamiche di evento non coperte da quelle sopra.

### Caso speciale — Rovine e dungeon

Non hanno un layout cliccabile per edificio. Mostrano una planimetria parziale
(muri crollati, aperture, corridoi) con **pulsanti di esplorazione testuale**
(*"Esplora sezione nord"*, *"Scava macerie"*, *"Cerca ingresso nascosto"*) che
aprono la Carta del cronista. Il dungeon è da trattare separatamente come
mini-dungeon a stanze progressive.

> Specifiche complete da definire in Fase G3, incrociando con il catalogo
> definitivo dei luoghi di gioco.

---

## 3. Tile system — Mappa top-down

### Dimensioni

- **Tile base:** 16×16 pixel (unità logica della griglia mondo)
- **Rendering:** scalato in base al livello di zoom
- **Zoom livelli:**
  - Livello 1 (massimo zoom out): tile a 4px → visione regione intera, icone simboliche
  - Livello 2: tile a 8px → visione zona, dettaglio medio
  - Livello 3: tile a 16px → visione locale, dettaglio pieno
  - Livello 4 (massimo zoom in): tile a 32px → dettaglio massimo

### Biomi e tile

Ogni bioma ha un set di tile con variazioni per evitare ripetizione visiva.

#### Pianura / Prateria
- Sfondo: pergamena-chiara con sottili variazioni di tono
- Decorazioni: tratteggio leggero per erba, piccoli ciuffi
- A zoom out: praticamente vuoto (è il "vuoto" della mappa)

#### Foresta
- Icone albero stilizzate in verde-bosco su pergamena
- 3-4 variazioni di albero (forma sfera, pino, quercia)
- Zoom out: chiazza verde uniforme
- Zoom in: singoli alberi distinguibili con tronchi

#### Montagna
- Triangoli/picchi in marrone-montagna con neve sulle cime
- Stile cartografico classico: profilo laterale anche se vista è top-down
  (convenzione cartografica medievale — le montagne si disegnano "di lato")
- Zoom out: catene montuose come linee marroni
- Zoom in: singoli picchi con ombreggiatura e neve

#### Acqua (fiumi, laghi, costa)
- Linee ondulate in blu-fiume
- Fiumi: singola/doppia linea serpeggiante
- Laghi: aree piene con bordo più scuro
- Costa: linea tratteggiata tra terra e "nulla" (acqua = pergamena con linee)

#### Palude
- Tratteggio verde-palude + linee acqua
- Simboli canne/giunchi stilizzati
- Atmosfera: zona ambigua, né terra né acqua

#### Deserto / Sabbia
- Pergamena più chiara, puntini sabbia
- Dune stilizzate con linee curve

#### Neve / Tundra
- Pergamena quasi bianca
- Puntini/tratteggi per neve
- Rari alberi spogli

#### Colline
- Come pianura ma con ombreggiature ondulate
- A zoom in: profili collinari stilizzati

#### Lande vulcaniche
[TBD] — Fase avanzata

---

## 4. Strutture e icone cartografiche

Le strutture sono disegnate come icone simboliche sulla mappa, in stile cartografico medievale.
A zoom maggiore diventano più dettagliate.

### Castello / Fortezza
- Zoom out: piccolo quadrato con torretta
- Zoom in: mura perimetrali, torri angolari, merlature, portone, stendardo
  con colore della casata
- Include: nome della casata come testo sotto l'icona

### Villaggio
- Zoom out: piccolo triangolo (tetto capanna)
- Zoom in: 2-3 edifici con tetti a punta, eventuale palizzata
- Include: nome del villaggio

### Rovine
- Zoom out: linee spezzate
- Zoom in: colonne spezzate, muri crollati, detriti
- Atmosfera: pericolo + mistero

### Monastero / Tempio
- Zoom out: croce o simbolo religioso
- Zoom in: edificio con campanile/torre centrale, muro di cinta, giardino
- Atmosfera: rifugio, conoscenza, segreti

### Porto
- Zoom out: ancora stilizzata
- Zoom in: molo, 1-2 barche, magazzini
- Solo su tile costieri

### Torre di guardia
- Zoom out: punto con linea verticale
- Zoom in: torre singola alta e stretta
- Funzione: estende la visibilità (riduce fog of war nell'area)

### Accampamento
- Zoom out: triangolino (tenda)
- Zoom in: tenda, fuoco, figure
- Può essere amichevole, neutrale o ostile

### Dungeon / Grotta
- Zoom out: cerchio nero
- Zoom in: apertura nella roccia/collina, oscurità
- Atmosfera: pericolo, loot, creature

---

## 5. Sprite — Cavaliere

Il cavaliere sulla mappa è un marker/icona (cerchio rosso + croce direzionale a zoom out,
sprite piccolo a zoom in).

### Sprite mappa (zoom in, 8×12 pixel circa)
- Sagoma riconoscibile: mantello, elmo, spada
- Colori: armatura grigio-scuro, mantello (colore variabile per personalizzazione?)
- Animazione minima: 2 frame di "camminata" per il viaggio

### Miniature per Carta del cronista
- Illuminazioni statiche in stile manoscritto miniato medievale
- Una miniatura per **tipo di scena** (sala del trono, taverna, cripta,
  monastero, accampamento, ecc.) — non per singolo luogo
- Composizione frontale o leggermente prospettica, soggetto al centro
- Cornice decorativa attorno (motivi geometrici, vegetali, blasoni)
- Dimensione orientativa: ~256×192 pixel di area utile
- Il cavaliere e gli NPC NON appaiono nelle miniature (sono fuori scena);
  vengono rappresentati eventualmente con piccoli **medaglioni-ritratto**
  accanto alle azioni nel pannello narrativo

[TBD] Catalogo miniature per tipo di scena
[TBD] Sistema medaglioni-ritratto per NPC nei pannelli
[TBD] Sprite NPC principali (sulla mappa)
[TBD] Sprite creature e avversari (sulla mappa / in combattimento)
[TBD] Animazioni

---

## 6. Fog of war

### Tre stati per ogni tile

1. **Inesplorato:** tile non visibile. Sulla mappa = pergamena vuota (nessun dettaglio).
   A zoom out = zona uniformemente color pergamena.
   Bordo nebbia: sfumatura graduale con dithering pergamena.

2. **Esplorato ma non visibile:** tile già visitato ma fuori raggio visivo.
   Visibile ma "sbiadito" — colori desaturati, come un ricordo.
   Le informazioni vecchie potrebbero non essere più accurate (accampamento sparito, ecc.)

3. **Visibile:** nel raggio visivo attuale del cavaliere (e delle torri di guardia alleate).
   Pieno colore e dettaglio.

### Raggio visivo

- Base cavaliere: ~5 tile in pianura, 3 in foresta, 2 in montagna/palude
- Torri di guardia: +8 tile raggio nel territorio della fazione alleata
- Alture: bonus +2 se su tile collina/montagna
- Notte: raggio dimezzato (se implementiamo ciclo giorno/notte)

[TBD] Implementazione esatta del raggio e calcolo visibilità

---

## 7. Decorazioni cartografiche

### Rosa dei venti
- Posizionata in un angolo della mappa visibile
- Stile classico cartografico con N/S/E/O
- Freccia Nord decorata

### Bordo mappa
- Doppio bordo linea con angoli decorati
- Eventuali fregi negli angoli

### Testo "Terra Incognita"
- Nelle zone inesplorate, a zoom medio, appare in corsivo sbiadito
- Richiama le mappe medievali reali

### Scritta titolo regione
- Nome della regione visibile a zoom medio, in font serif corsivo
- Es: "Le Marche di Vorn", "Terre del Cervo", "Costa di Ashford"

### Sentieri e strade
- Linee tratteggiate tra punti di interesse
- Strade principali: tratteggio più spesso
- Sentieri secondari: tratteggio fine
- Generati proceduralmente connettendo castelli e villaggi

---

## 8. Specifiche tecniche rendering

### Canvas setup
```
Canvas principale: dimensione viewport del browser
Rendering: contesto 2D
image-rendering: pixelated (CSS) per mantenere i pixel netti allo zoom
```

### Camera
- Posizione (x, y) nel mondo in coordinate tile
- Zoom level (1-4) — discreto, non continuo
- Scroll: mouse drag o WASD
- Zoom: rotella mouse o +/-

### Ordine di disegno (back to front)
1. Sfondo pergamena (base)
2. Tile terreno (biomi)
3. Fiumi e acqua
4. Strade e sentieri
5. Strutture (castelli, villaggi, rovine…)
6. Etichette testo (nomi luoghi)
7. Fog of war (overlay)
8. Cavaliere marker/sprite
9. Decorazioni cartografiche (bordo, rosa dei venti)
10. HUD (layer separato sopra la mappa)

### Performance
- Solo i tile visibili vengono disegnati (culling basato su camera + viewport)
- I tile fuori viewport sono ignorati
- Possibile cache dei tile pre-renderizzati in offscreen canvas
- Target: 30fps minimo con mondo 200×200 tile

---

## 9. Priorità di implementazione grafica (Fase 1)

1. **Sfondo pergamena procedurale** — texture base con variazioni
2. **Tile pianura** — il bioma più semplice come test
3. **Tile foresta** — alberi stilizzati cartografici
4. **Tile montagna** — picchi in stile cartografico medievale
5. **Tile acqua** — fiumi e laghi
6. **Castello** — icona a dettaglio variabile per zoom
7. **Villaggio** — icona semplice
8. **Camera e zoom** — navigazione base
9. **Cavaliere marker** — posizione sulla mappa
10. **Fog of war** — stati base (esplorato/inesplorato)
11. **Decorazioni** — bordo, rosa dei venti, etichette
12. **Strade** — connessioni tra strutture
