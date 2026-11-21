# Knight Dawn — Claude Code Briefing

Gioco di avventura medievale-fantasy in 3D, terza persona, su un **mondo inventato generato a ogni
partita** (il terreno reale di Tavullia resta come scena di prova). Due livelli: **Carta** (viaggio a
tempo compresso) e **Scene 3D** (di persona, 1:1). Cavaliere errante, fazioni, combattimento a turni.
Il movimento di esplorazione è in tempo reale; il combattimento **resta a turni**.
**NON** è costruzione/civiltà, **NON** è un action game, **NON** è realismo fotografico.

## Stack
Vanilla JS (ES modules) / HTML / CSS + **Three.js r187 copiato in `lib/three/`**.
Nessun bundler, nessun npm in produzione, nessun CDN: Three.js si carica via `importmap` da file locali.
Deploy GitHub Pages. Single-player, localStorage. UI in italiano. Target: desktop, mouse + tastiera.
Test: su GitHub Pages dopo il merge in `main` (ricaricare con Ctrl+F5, cache ~10 min); `main` può essere
instabile durante lo sviluppo. In alternativa in locale con `python -m http.server` (no doppio clic sull'HTML).

## Struttura
- `index.html` + `style.css` — canvas WebGL + overlay HUD in HTML/CSS + importmap
- `js/3d/` — moduli ES del motore 3D: `main.js` (renderer, luci, loop, input, F3), `terrain.js`, `orizzonte.js`, `acqua.js`, `knight3d.js`, `camera.js`, `castle3d.js` (Tavullia), `rocca3d.js` e `borgo3d.js` (mondo generato)
- `js/mondo/` — generatore del mondo, moduli ES senza grafica né DOM (`rumore.js`, `carta.js`, `verifica.js`,
  `scena.js`, `fiumi.js`, `luoghi.js`, `strade.js`; `lavoratore.js` = Web Worker con cache IndexedDB, `generatore.js` = lato pagina); la vista di
  sviluppo della Carta è `js/3d/cartaVista.js`. Cambiando le Carte generate: aggiornare `VERSIONE_GENERATORE`
- `js/` — logica di gioco ereditata, script classici senza grafica (`config` `calendar` `knight`
  `combat` `events` `news` `save` + `data/`). I moduli 3D li leggono come globali.
- `assets/terrain/` — heightmap reali (`.bin` + `.json`)
- `tools/dem/` — script Python per generare le heightmap (istruzioni nel suo `README.md`)
- `lib/three/` — Three.js r187 vendorizzato (`three.module.js` + `three.core.js` + `LICENSE`, addon usati
  in `addons/`, importati come `three/addons/...`): NON modificare

## Documenti di design — leggi SEMPRE quello rilevante prima di lavorare su un sistema

| Sistema | Documento |
|---|---|
| Scene 3D, terreno, generatore del mondo, milestone attuali | `docs/ESPLORAZIONE_3D.md` ⭐ |
| Stile grafico 3D, materiali, cavaliere | `docs/GRAFICA_3D.md` |
| Prestazioni: budget, misure, regole per ciò che si disegna | `docs/PRESTAZIONI.md` |
| Visione, mondo e regole di generazione, tempo, meccaniche | `docs/GDD.md` |
| Combattimento | `docs/COMBAT.md` |
| Eventi | `docs/EVENTS.md` |
| Inizio gioco, ranghi, mercato | `docs/EARLY_GAME.md` |

## Regole operative

1. Comunicazione in italiano; codice/variabili possono essere in inglese
2. Mai toccare la struttura dei file senza conferma esplicita
3. Conferma prima di cambiamenti architetturali
4. Una milestone alla volta — non iniziare la successiva prima di completare e far testare quella corrente
5. Unica dipendenza ammessa: Three.js in `lib/three/`. Niente CDN, niente altre librerie senza conferma.
   Unica eccezione (solo **modalità reale**, dopo M6): scaricare dati di terreno da fonti che lo
   permettono dal browser, con cache e avviso se non rispondono. Il mondo generato non scarica nulla
6. Grafica procedurale: mesh costruite via codice con primitive Three.js, niente modelli `.glb` esterni
   (per ora). Unici asset ammessi: dati di terreno
7. Test incrementale: ogni milestone deve essere provata nel browser (anche su Pages) prima di passare avanti
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

**M7, rocca e borgo sul mondo generato** (`docs/ESPLORAZIONE_3D.md`), ripresa. Milestone «Prestazioni» chiusa
(nov. 2026): ogni contenuto disegnato rispetta budget e regole di `docs/PRESTAZIONI.md` e passa dal percorso di prova
(`?seme=570549&prova`, anche `&centro=41009,51988` sul borgo). M0–M6 completate. La 2D resta nella cronologia git (`2c869fa`).
