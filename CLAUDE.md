# Knight Dawn — Claude Code Briefing

Gioco di avventura medievale top-down, pixel art cartografico su pergamena.
Cavaliere errante, mondo procedurale, fazioni, combattimento a turni.
**NON** è costruzione/civiltà/action real-time.

## Stack
Vanilla JS / HTML5 Canvas / CSS — zero framework, zero dipendenze esterne.
Deploy GitHub Pages. Single-player, localStorage. UI in italiano. Target: desktop browser, mouse + tastiera.

## File JS
`main.js` · `config.js` · `world.js` · `renderer.js` · `tiles.js` · `sprites.js`
`knight.js` · `travel.js` · `combat.js` · `events.js` · `factions.js` · `locations.js` · `ui.js` · `save.js`

## Documenti di design — leggi SEMPRE quello rilevante prima di lavorare su un sistema

| Sistema | Documento |
|---|---|
| Visione generale e meccaniche | `docs/GDD.md` |
| Inizio gioco, ranghi, mercato | `docs/EARLY_GAME.md` |
| Grafica, palette, tile, sprite | `docs/GRAFICA.md` ⭐ |
| Generazione mondo | `docs/WORLD_GEN.md` |
| Combattimento | `docs/COMBAT.md` |
| Interfaccia utente | `docs/UI_GUIDE.md` |

## Regole operative

1. Comunicazione in italiano; codice/variabili possono essere in inglese
2. Mai toccare la struttura dei file senza conferma esplicita
3. Conferma prima di cambiamenti architetturali
4. Un sistema alla volta — non iniziare il successivo prima di completare quello corrente
5. Nessuna dipendenza esterna (no CDN, tutto inline vanilla)
6. Grafica procedurale: tile e sprite disegnati in canvas via codice, non PNG
7. Test incrementale: ogni feature visibile e testabile prima di passare avanti
8. **Branch — REGOLA OBBLIGATORIA:** eseguire prima di ogni modifica:
   ```
   git log origin/main..HEAD --oneline
   ```
   - **Vuoto** → branch già mergiato: creare nuovo branch descrittivo da `main` aggiornato
   - **Con commit** → continuare sullo stesso branch

## Mantenimento di questo file

Questo file deve restare **breve e non ridondante**.
Regole per chi lo aggiorna (Claude o utente):

- **Niente descrizioni di design o architettura** — quelle stanno nei `docs/`. Se una sezione spiega *come funziona* un sistema, non appartiene qui: va in `docs/` con un link.
- **Niente elenchi di file con descrizioni lunghe** — il codice si documenta da sé; qui basta la lista dei nomi.
- **Aggiornare la fase corrente** a ogni cambio di focus, rimuovendo le fasi completate.
- **Obiettivo dimensione:** massimo ~60 righe. Se superi questo limite, consolida o sposta in `docs/`.

## Fase corrente

**Fetta verticale S3+S4 — COMPLETA (combattimento integrato con eventi)**
Motore `combat.js` (Round = Passo), catalogo `data/enemies.js` (22 nemici),
silhouette `sprites.js`, eventi-incontro in `data/events_travel.js`, scena
3 colonne in `game.js` agganciata all'effetto evento `combat`.
Prossimo focus: bilanciamento formula (TBD S9), o avvio S5 (fazioni).
Riferimento: `docs/COMBAT.md`, `docs/EVENTS.md`, `docs/GDD.md` §5.
