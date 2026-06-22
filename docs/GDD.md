# FERRO & CENERE — Game Design Document

> Documento vivo. Le sezioni marcate [TBD] sono da definire.
> Ultimo aggiornamento: sessione di design iniziale.

---

## 1. Visione

Un cavaliere errante in un mondo medievale-fantasy oscuro. Non conquisti il mondo:
ci navighi dentro. Non costruisci castelli: attraversi quelli degli altri.
Il mondo ha fazioni, segreti, stagioni, tensioni politiche che si muovono
indipendentemente da te. Tu sei un viandante con una spada e una storia da scrivere.

### Tono e ispirazioni

- **House of the Dragon:** intrighi di casata, tradimenti, ambiguità morale, drago come forza
  della natura non come cavalcatura. Il potere corrompe. Nessuno è puramente buono.
- **Il Signore degli Anelli:** il viaggio epico attraverso terre vaste e pericolose,
  la solitudine del viandante, l'oscurità che avanza, alleanze improbabili.
- **Lupo Solitario (Librogame):** il cavaliere solitario con abilità speciali,
  l'equipaggiamento che conta, i combattimenti letali, il mondo ostile.
  MA senza la struttura a scelte del librogame — il gioco è esplorativo, non narrativo-ramificato.
- **Monkey Island / King's Quest:** estetica pixel art, dettaglio negli ambienti,
  il piacere di esplorare un mondo disegnato con cura.

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
- **Vigore** — salute fisica, resistenza al viaggio e al combattimento
- **Volontà** — forza mentale, resistenza alla magia e alla paura
- **Onore** — reputazione morale, influisce su come NPC e fazioni reagiscono
- **Ferite** — danno accumulato, non si resetta facilmente

[TBD] Sistema di progressione dettagliato
[TBD] Equipaggiamento e inventario (pesi, slot, durabilità?)
[TBD] Arti magiche / abilità speciali
[TBD] Sistema di titoli emergenti (condizioni di trigger)

### Il mondo

Grande mappa generata proceduralmente. Nebbia di guerra — scopri esplorando.

**Biomi:** pianura, foresta, montagna, palude, costa, deserto, neve, colline, lande vulcaniche
**Strutture:** castelli, villaggi, rovine, dungeon, porti, monasteri, accampamenti, torri
**Elementi naturali:** fiumi, laghi, passi montani, foreste fitte, paludi, coste

Il mondo ha **stagioni** che influenzano il gameplay:
- Primavera: viaggio facile, commercio attivo
- Estate: siccità possibili, ribellioni contadine
- Autunno: raccolto, feste, diplomazia
- Inverno: passi chiusi, fame, creature più aggressive

[TBD] Dettaglio biomi e tabella costi di viaggio
[TBD] Tabella strutture con frequenza di spawn e contenuto
[TBD] Sistema stagionale dettagliato
[TBD] Eventi del mondo autonomi (guerre tra fazioni, epidemie, migrazioni)

---

## 3. Meccaniche core

### Viaggio

- Click su destinazione nella mappa → A* calcola percorso → viaggio automatico tile-by-tile
- Ogni tile ha un costo in turni (1-3) basato sul terreno
- Durante il viaggio possono scattare eventi (incontri casuali, meteo, scoperte)
- Il giocatore può interrompere il viaggio con un click
- Al livello di zoom più basso, il viaggio mostra il cavaliere che si sposta sulla mappa

### Combattimento

Automatico ma NON istantaneo — si risolve in round visibili.
Durata proporzionale alla complessità dello scontro.

- Ogni round: calcolo attacco/difesa basato su attributi + armi + status
- Modificatori: ferite accumulate, stanchezza viaggio, bonus terreno, arti magiche,
  qualità armi, vantaggio numerico
- Output visivo: barre HP che scendono, testo nel log, possibilità di fuga
- Il giocatore NON sceglie azioni durante il combattimento — osserva il risultato
  delle sue decisioni pregresse (equipaggiamento, alleanze, preparazione)

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

Quando entri in un castello, villaggio, dungeon o luogo speciale, la vista passa
dalla mappa cartografica top-down a una **vista laterale 2D dettagliata** in pixel art.

In questa vista:
- Vedi l'ambiente interno (sala del trono, taverna, cella, biblioteca…)
- NPC presenti con cui puoi interagire
- Oggetti esaminabili
- Il tempo non scorre liberamente — ogni interazione consuma tempo/turni
- Non c'è movimento libero del personaggio — è una scena contestuale

[TBD] Lista tipi di luogo con descrizione della scena
[TBD] Sistema di interazione NPC
[TBD] Sistema di commercio
[TBD] Sistema di quest/missioni locali

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

### Fase 1 — Grafica e rendering ⭐ CORRENTE
- Palette e costanti
- Tile procedurali per ogni bioma
- Renderer con camera e zoom multi-livello
- Generazione mondo minima per test visivo

### Fase 2 — Mondo e navigazione
- Generazione mondo completa con vincoli
- Nebbia di guerra
- Pathfinding e viaggio automatico
- Sistema turni base

### Fase 3 — HUD e interfaccia
- Layout HUD a tre pannelli
- Log eventi
- Pannello stato cavaliere
- Minimappa

### Fase 4 — Cavaliere e interazioni
- Stato personaggio
- Inventario e equipaggiamento
- Incontri casuali durante il viaggio
- Interazione base con luoghi (vista laterale)

### Fase 5 — Combattimento
- Sistema combattimento a round
- Creature e avversari
- Loot e conseguenze

### Fase 6 — Fazioni e mondo vivo
- Sistema reputazione
- Eventi autonomi del mondo
- NPC con memoria

### Fase 7 — Archi narrativi
- Sistema missione/profezia
- Campagna episodica
- Titoli emergenti

### Fase 8 — Polish e salvataggio
- Save/load
- Bilanciamento
- Tutorial/onboarding
