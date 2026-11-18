# Knight Dawn — Claude Code Briefing

Gioco di avventura medievale in **3D low-poly stilizzato**, terza persona, su **geografia reale**
(primo territorio: dintorni di Tavullia, Marche). Cavaliere errante, fazioni, combattimento a turni.
Il movimento di esplorazione è in tempo reale; il combattimento **resta a turni**.
**NON** è costruzione/civiltà, **NON** è un action game, **NON** è realismo fotografico.

## Stack
Vanilla JS (ES modules) / HTML / CSS + **Three.js r187 copiato in `lib/three/`**.
Nessun bundler, nessun npm in produzione, nessun CDN: Three.js si carica via `importmap` da file locali.
Deploy GitHub Pages. Single-player, localStorage. UI in italiano. Target: desktop, mouse + tastiera.
Test in locale con `python -m http.server` (aprire l'HTML con doppio clic NON funziona).

## Struttura
- `index.html` — canvas WebGL + overlay HUD in HTML/CSS + importmap
- `js/3d/` — moduli ES del motore 3D (scena, terreno, cavaliere, camera, castello, input)
- `js/` — logica di gioco ereditata, script classici senza grafica (`config` `calendar` `knight`
  `combat` `events` `news` `save` + `data/`). I moduli 3D li leggono come globali.
- `assets/terrain/` — heightmap reali (`.bin` + `.json`)
- `tools/dem/` — script Python (eseguiti sul PC dell'utente) per generare le heightmap
- `lib/three/` — Three.js vendorizzato: NON modificare

## Documenti di design — leggi SEMPRE quello rilevante prima di lavorare su un sistema

| Sistema | Documento |
|---|---|
| Esplorazione 3D, terreno, milestone attuali | `docs/ESPLORAZIONE_3D.md` ⭐ |
| Visione e meccaniche (le parti su mappa a tile sono superate) | `docs/GDD.md` |
| Combattimento | `docs/COMBAT.md` |
| Eventi | `docs/EVENTS.md` |
| Inizio gioco, ranghi, mercato | `docs/EARLY_GAME.md` |

## Regole operative

1. Comunicazione in italiano; codice/variabili possono essere in inglese
2. Mai toccare la struttura dei file senza conferma esplicita
3. Conferma prima di cambiamenti architetturali
4. Una milestone alla volta — non iniziare la successiva prima di completare e far testare quella corrente
5. Unica dipendenza ammessa: Three.js in `lib/three/`. Niente CDN, niente altre librerie senza conferma
6. Grafica procedurale: mesh costruite via codice con primitive Three.js, niente modelli `.glb` esterni
   (per ora). Unici asset ammessi: dati di terreno
7. Test incrementale: ogni milestone deve essere visibile e provabile nel browser prima di passare avanti
8. Prestazioni: obiettivo 60 FPS su PC medio; contatore FPS sempre attivabile con il tasto `F3`
9. La logica di gioco (`js/*.js` senza grafica) non deve dipendere da Three.js
10. **Branch — REGOLA OBBLIGATORIA:** eseguire prima di ogni modifica:
    ```
    git log origin/main..HEAD --oneline
    ```
    - **Vuoto** → branch già mergiato: creare nuovo branch descrittivo da `main` aggiornato
    - **Con commit** → continuare sullo stesso branch

## Mantenimento di questo file

Deve restare **breve e non ridondante** (massimo ~60 righe). Niente descrizioni di design o
architettura: quelle stanno in `docs/`. Aggiornare la fase corrente a ogni cambio di focus.

## Fase corrente

**Passaggio al 3D — prototipo minimo (M0→M5).** Dettagli e criteri di accettazione in
`docs/ESPLORAZIONE_3D.md`. La versione 2D è conservata nel tag git `v2d-final`.
