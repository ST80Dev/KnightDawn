# FERRO & CENERE — Claude Code Briefing

## Cos'è

Gioco di avventura medievale top-down con pixel art stile cartografico su pergamena.
Un cavaliere errante esplora un mondo generato proceduralmente, interagisce con fazioni,
combatte creature e avversari, accumula reputazione e si definisce attraverso le scelte di gioco.

**NON è:** un gioco di costruzione/civiltà/conquista, un librogame a scelte, un action real-time.

**È:** un gioco a turni di esplorazione e avventura semisolitaria dove il mondo vive
indipendentemente dal giocatore. Il tempo scorre a passi di viaggio, interazione o combattimento.

## Stack tecnico

- **Vanilla JS / HTML5 Canvas / CSS** — zero framework, zero dipendenze esterne
- **Deploy:** GitHub Pages (repo: ferro-e-cenere)
- **Single-player** con salvataggio localStorage + esporta/importa JSON
- **Lingua interfaccia:** Italiano
- **Target:** desktop browser (Chrome, Firefox, Safari) — mouse + tastiera

## Struttura progetto

```
/
├── CLAUDE.md                  ← QUESTO FILE (briefing sessione)
├── index.html                 ← Entry point
├── style.css                  ← Stili globali
├── js/
│   ├── main.js                ← Bootstrap, game loop, state machine
│   ├── config.js              ← Costanti, palette, configurazione
│   ├── world.js               ← Generazione mondo procedurale
│   ├── renderer.js            ← Canvas rendering, camera, zoom, fog of war
│   ├── tiles.js               ← Tileset procedurale (disegnato in canvas)
│   ├── sprites.js             ← Sprite cavaliere, NPC, creature
│   ├── knight.js              ← Stato personaggio, attributi, equipaggiamento
│   ├── travel.js              ← Pathfinding A*, viaggio automatico, costo turni
│   ├── combat.js              ← Combattimento automatico a fasi
│   ├── events.js              ← Trigger incontri, NPC, mercanti, dungeon
│   ├── factions.js            ← Casate, ordini, reputazione
│   ├── locations.js           ← Vista dettaglio laterale per castelli/luoghi
│   ├── ui.js                  ← HUD, pannelli, log eventi, menu
│   └── save.js                ← localStorage, esporta/importa
├── assets/                    ← Eventuale grafica statica (opzionale)
└── docs/
    ├── GDD.md                 ← Game Design Document completo
    ├── GRAFICA.md             ← Specifiche grafiche, palette, tileset, sprite
    ├── WORLD_GEN.md           ← Sistema generazione mondo
    ├── COMBAT.md              ← Sistema combattimento
    └── UI_GUIDE.md            ← Guida interfaccia e layout
```

## Documenti di design

**Leggi SEMPRE il documento rilevante prima di lavorare su un sistema:**

- Visione generale e meccaniche → `docs/GDD.md`
- Grafica, palette, tile, sprite → `docs/GRAFICA.md` ⭐ (focus corrente)
- Generazione mondo → `docs/WORLD_GEN.md`
- Combattimento → `docs/COMBAT.md`
- Interfaccia utente → `docs/UI_GUIDE.md`

## Regole di sessione

1. **Lingua:** tutto in italiano (codice, commenti, variabili possono essere in inglese)
2. **Mai toccare** la struttura dei file senza conferma esplicita
3. **Conferma prima** di procedere con cambiamenti architetturali
4. **Un sistema alla volta:** non iniziare un nuovo sistema prima di aver completato quello corrente
5. **Nessuna dipendenza esterna:** tutto vanilla, tutto inline, nessun CDN
6. **Grafica procedurale:** i tile e sprite sono disegnati in canvas via codice, non caricati da file PNG
   (possibilità futura di caricare spritesheet, ma lo scheletro parte procedurale)
7. **Test incrementale:** ogni feature deve essere visibile e testabile prima di passare alla successiva

## Fase corrente

**FASE 1 — Grafica e rendering base**
Obiettivo: avere la mappa cartografica visibile, zoomabile, con tile disegnati proceduralmente.

Ordine di lavoro:
1. `config.js` — palette colori, dimensioni tile, costanti
2. `tiles.js` — funzioni di disegno tile per ogni bioma (procedurali in canvas)
3. `renderer.js` — camera, zoom multi-livello, disegno mappa
4. `world.js` — generazione mondo minima (noise → biomi) per testare il rendering
5. `main.js` — bootstrap e game loop base
6. `index.html` + `style.css` — struttura pagina

## Note architetturali

### Due viste

1. **Vista mappa (top-down cartografica):** vista principale, stile pergamena medievale.
   Zoomabile a più livelli: regione → zona → locale.
   Zoom out = icone simboliche cartografiche. Zoom in = più dettaglio sui tile.

2. **Vista dettaglio (laterale 2D):** si attiva entrando in castelli, taverne, dungeon,
   luoghi speciali. Stile pixel art classico laterale tipo Monkey Island / King's Quest.
   Il giocatore non controlla il personaggio in questa vista — è una scena narrativa
   con interazioni contestuali.

### Generazione mondo

Mondo grande con nebbia di guerra. Generato casualmente a ogni partita entro vincoli
(deve avere almeno N castelli, villaggi, biomi diversi, punti di interesse).
Dettagli in `docs/WORLD_GEN.md`.

### Tempo e turni

Ogni tile di viaggio costa turni (1-3 a seconda del terreno). Gli eventi del mondo
avanzano con i turni (stagioni, guerre tra fazioni, morte di lord). Il combattimento
consuma turni proporzionalmente alla complessità dello scontro.
