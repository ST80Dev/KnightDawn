# Esplorazione 3D — specifiche del prototipo minimo

> Obiettivo: capire se il 3D è sostenibile da sviluppatore singolo **prima** di investirci.
> Il prototipo è riuscito se, a fine M4, camminare sul terreno reale è fluido e piacevole.
> Se ci si impantana su camera, collisioni o prestazioni, si valuta come proseguire.
> La versione 2D resta nella cronologia git (commit `2c869fa`).

## Il minimo da raggiungere

Un'area reale di **2×2 km attorno a Tavullia**, con rilievo vero, un cavaliere low-poly in terza
persona che ci cammina sopra seguendo il terreno, e un castello low-poly in cui si può entrare dalla porta.

## Stile visivo

- Low-poly, *flat shading*, colori pieni: niente texture fotografiche.
  **Direzione decisa per dopo M4: simil-realistico, non iper-realistico**, per terreno, cavaliere e
  castello, spinto **al massimo con il solo codice**. Dettagli in M4, «Dopo la valutazione».
- Palette ispirata alla pergamena di `js/config.js` (`PALETTE`), adattata alla luce 3D.
- Colore del terreno per vertice, in base ad altitudine e pendenza (prato → bosco → roccia).
- Luce direzionale (sole) + luce emisferica + nebbia leggera per nascondere il bordo del mondo.

## Coordinate e unità

- 1 unità Three.js = **1 metro**. Asse Y verso l'alto.
- Origine (0,0,0) = centro dell'area, a quota 0 m s.l.m. (le Y sono quote reali in metri).
- Il centro dell'area è definito in `assets/terrain/*.json` (lat/lon + coordinate UTM 33N, EPSG:32633).

## Formato heightmap

**Non usare PNG a 16 bit:** il browser decodifica i PNG a 8 bit per canale e la precisione si perde.

- `assets/terrain/<nome>.bin` — griglia `Uint16` little-endian, riga per riga da nord a sud,
  valore = quota in **decimetri** (0–6553,5 m).
- `assets/terrain/<nome>.json` — metadati:
  ```json
  { "name": "tavullia", "cols": 257, "rows": 257, "cellSize": 7.8125,
    "sizeMeters": 2000, "center": { "lat": 43.8985, "lon": 12.7517 },
    "centerUTM": { "x": 319435.68, "y": 4863056.65 },
    "crs": "EPSG:32633", "minElev": 0, "maxElev": 0, "source": "TINITALY 10m" }
  ```
- Le coordinate del centro sono **da verificare**: sul DEM il punto cade su un versante a ~141 m,
  mentre il paese è dato a ~170 m; c'è un dosso a 172 m circa 250 m più a est. L'abitato è comunque
  dentro l'area. Spostare il centro = rilanciare lo script con `--lat/--lon`.

### Generazione (`tools/dem/`)

Gli script girano sul PC dell'utente, ma anche nell'ambiente cloud, che raggiunge le fonti su AWS
(Copernicus, Terrarium); TINITALY invece no (va scaricato a mano).
- `make_heightmap.py` — input: un GeoTIFF (TINITALY 10 m dell'INGV) oppure `--copernicus`, che legge
  la tile Copernicus GLO-30 pubblica su AWS senza registrazione. Riproietta in EPSG:32633, ritaglia
  2×2 km attorno al centro, ricampiona a 257×257 (**cubica**: la bilineare, ingrandendo dati a 30 m,
  lascia pieghe a griglia visibili con il flat shading) e scrive `.bin` + `.json`.
  Dipendenze: `rasterio` e `numpy`.
- `fetch_terrarium.py` — alternativa senza registrazione: scarica le tile pubbliche AWS
  "Terrarium" (`elevation-tiles-prod`), le decodifica (`(R*256 + G + B/256) - 32768`),
  le unisce e riusa la stessa pipeline. Qualità inferiore (dati ~30 m), ma utile per partire.
- `README.md` — istruzioni passo passo in italiano per l'utente.

### Fallback

Se il `.bin` manca, il gioco genera un **terreno procedurale collinare** con la stessa griglia e
mostra un avviso nel HUD. M1 non deve restare bloccata in attesa dei dati reali.

## Milestone

Ogni milestone si chiude solo dopo test nel browser da parte dell'utente.

### M0 — Pulizia e scheletro
- Rimuovere la parte 2D non più necessaria:
  `renderer.js` `tiles.js` `sprites.js` `world.js` `travel.js` `scenes.js` `title.js` `create.js`
  `saveui.js` `game.js` `castle.js` `main.js` · `sprites_preview.html` · `assets/sprites/` ·
  `docs/GRAFICA.md` `docs/WORLD_GEN.md` `docs/UI_GUIDE.md` `docs/MOBILE.md`.
- Conservare la logica: `config` `calendar` `knight` `combat` `events` `news` `save` + `js/data/`.
  Verificare che si carichino senza errori anche senza le scene 2D (correggere solo i riferimenti rotti).
- Copiare in `lib/three/` da npm `three@0.187.0`: `build/three.module.js`, `build/three.core.js`
  (il primo importa il secondo) e solo gli addon usati. Aggiungere `lib/three/LICENSE`.
- Nuovo `index.html` con importmap (`"three": "./lib/three/three.module.js"`) e `js/3d/main.js`:
  scena vuota con cielo, render loop, resize, contatore FPS con `F3`.
- **Accettazione:** pagina servita in locale senza errori in console, cielo visibile, FPS mostrati.

### M1 — Terreno
- `js/3d/terrain.js`: carica `.bin` + `.json` (o fallback), crea la mesh, colora i vertici, luci, nebbia.
- Espone `getHeight(x, z)` e `getSlope(x, z)` (gradi): le useranno gli altri moduli.
  L'interpolazione è sul **triangolo disegnato** (diagonale NE–SO), non bilineare: così la quota
  coincide esattamente con la superficie visibile (la bilineare può scostarsi di decine di cm).
- Camera libera di debug (orbitale) attivabile per ispezionare il terreno.
- `tools/dem/` completo con README.
- **Accettazione:** il rilievo è riconoscibile (con dati reali), almeno 60 FPS, nessuna cucitura visibile.
- **Stato:** implementata con dati Copernicus GLO-30 (quote 36–230 m). Camera di debug = OrbitControls
  (`lib/three/addons/`), attiva di default finché non esiste il cavaliere. `F3` mostra anche fonte dei
  dati, quota e pendenza sotto il cursore. **Completata** (test dell'utente superato).
- Nota per M2: con questi dati la pendenza massima è ~31° (punto più ripido, a nord del centro),
  quindi il limite di 35° in pratica non scatta: per provarlo, `kd.knight.cfg.pendenzaMax = 10` in console.

### M2 — Cavaliere
- `js/3d/knight3d.js`: cavaliere costruito con primitive (busto, testa con elmo, braccia, gambe,
  scudo, spada, mantello semplice), alto circa 1,8 m.
- Animazione procedurale: arti che oscillano in proporzione alla velocità, fermo = respiro leggero.
- Movimento: `WASD` o frecce, `Shift` per correre (camminata ~1,5 m/s, corsa ~5 m/s), rotazione fluida.
- Segue il terreno con `getHeight`; non sale su pendenze oltre ~35°; non esce dai bordi dell'area.
- **Accettazione:** camminata su e giù per le colline senza compenetrazioni né scatti.
- **Stato:** completata (l'unico rilievo dell'utente riguardava la camera, risolto in M3). Spada nel fodero al fianco sinistro (non in
  mano: si esplora, non si combatte). Gambe con IK a due ossa: ogni piede cerca il terreno reale sotto
  di sé, il bacino scende quanto serve (con un limite, per non accovacciarsi) e in pendenza il passo
  si accorcia; risultato misurato: piedi entro ~1,5 cm dal suolo anche sul punto più ripido. Ombra
  finta a disco adagiata sul terreno. La fase del passo avanza con la distanza percorsa, quindi
  i piedi non scivolano e, se una pendenza blocca il cavaliere, le gambe si fermano. Contro un pendio
  troppo ripido il cavaliere prova a costeggiarlo lungo un asse.

### M3 — Camera in terza persona
- `js/3d/camera.js`: camera alle spalle con inseguimento morbido (lerp).
- ~~Trascinamento del mouse per ruotare attorno al cavaliere~~ → **deciso con l'utente:** la vista guarda
  sempre dove guarda il cavaliere, come una "quasi prima persona"; non si gira attorno a lui per
  guardargli dietro. Quindi comandi classici: `W`/`S` avanti/indietro, `A`/`D` girano il cavaliere,
  trascinamento orizzontale del mouse = gira il cavaliere, verticale = alza/abbassa lo sguardo.
  Rotella per la distanza (limiti min/max).
- La camera non entra mai sotto il terreno; la direzione di movimento coincide con quella della camera.
- **Accettazione:** nessuna vista dentro le colline, nessun movimento nauseante.
- **Stato:** completata (test dell'utente superato). Camera sopra la spalla destra (il cavaliere
  sta in basso, la vista resta libera davanti); se un dosso alle spalle copre la linea di vista, la camera
  si alza per scavalcarlo. Girando da fermo il cavaliere fa piccoli passi sul posto. Il tasto `C` passa
  ancora alla camera libera di debug (OrbitControls). Parametri provabili da console: `kd.cam.cfg`.
  Misurato in headless: camera mai a meno di 45 cm dal suolo, linea di vista mai sotto il terreno.

### M4 — Castello
- `js/3d/castle3d.js`: castello procedurale (mura, 4 torri, mastio, porta), posizionato su un punto
  configurabile e con fondamenta che si adattano al terreno (base che scende fino al suolo).
- Collisioni semplici (rettangoli/cerchi sul piano XZ) contro mura e torri; la porta resta attraversabile.
- **Accettazione:** si gira attorno al castello senza attraversare i muri e si entra dalla porta.
- **Stato:** implementata, in attesa del test dell'utente. Castello in mattoni, come le rocche
  malatestiane della zona: cinta di 38 m con scarpa, 4 torri tonde, mastio addossato al lato di fondo,
  torre-porta con passaggio ad arco (saracinesca alzata, battenti aperti), merli a coda di rondine,
  beccatelli, feritoie; ~6 500 triangoli, ~60 mesh. Sta sul colle a est del punto di partenza
  (`CASTLE_CFG` in `castle3d.js`: x 225, z 8, ~173 m), porta verso ovest; il cavaliere parte rivolto
  verso la porta. Mura e torri hanno ognuna la propria base sotto il punto più basso del terreno che
  coprono; la cima di ogni lato è 9 m sopra il suo punto più alto. **Cortile in piano** (richiesta
  dell'utente): terrapieno alla quota più alta del terreno interno (173,65 m; il terreno sotto scende
  fino a 171 m), le mura fanno da muro di contenimento; fuori dalla porta una rampa di 5 m (14°) con
  muretti raccorda il piano al pendio. Su siti più scoscesi andranno terrazzamenti con scalini: non
  fatti finché non serve. **Suolo** (cambio architetturale approvato): `componiSuolo()` in
  `terrain.js` unisce terreno e superfici costruite (`quotaSuolo()` del castello); cavaliere e camera
  usano il suolo, non più il terreno nudo. Collisioni: rettangoli a pezzi di 2 m
  (la scarpa sporge di più dove il terreno è basso) e cerchi per le torri; il cavaliere viene spinto
  fuori lungo la normale e quindi scivola lungo i muri. Camera: se un muro si mette tra cavaliere e
  camera, la camera scatta davanti al muro e poi torna indietro con calma; con un muro a destra la
  spalla rientra. Le pareti hanno una piccola luce propria (luce riflessa), altrimenti i lati in ombra
  escono quasi neri; il colore "da terra" della luce emisferica è stato schiarito per lo stesso motivo
  (sul terreno quasi non si vede). Misurato in headless: nessuna compenetrazione in 72 assalti alle
  mura, ingresso solo dalla porta, camera mai coperta da un muro (49 000 fotogrammi di prova).
- **Qui si valuta il prototipo** con l'utente: se e come proseguire.
- **Dopo la valutazione — realismo del terreno (deciso con l'utente, da fare se il prototipo prosegue):**
  il terreno a facce piatte dà l'idea di "generato al computer" (stacchi netti tra triangoli da 7,8 m).
  Provato e **scartato**: solo sfumare (smooth shading + macchie di colore) → tappeto uniforme, rilievo
  meno leggibile; micro-rilievo geometrico → invisibile dalla vista di gioco e mesh 4× più pesante.
  Direzione scelta, senza texture né asset esterni:
  1. Superficie sfumata (normali per vertice) **+ dettaglio procedurale nello shader** in coordinate
     mondo, su scale 0,5–10 m: ciuffi chiari/scuri, chiazze di terra, passaggio al bosco per pendenza.
  2. **Oggetti sparsi** con primitive e *instancing*: ciuffi d'erba, sassi, cespugli, alberi.
  Cambia lo stile scritto sopra: aggiornarlo quando si fa. Ombre nette su versanti: già regolabili con
  il rapporto sole/luce emisferica; ombre proiettate solo per cavaliere/castello.
- **Dopo la valutazione — stile simil-realistico da codice (deciso con l'utente):**
  - Obiettivo: proporzioni vere, materiali credibili, buona luce. **Non** fotorealismo.
  - Tutto generato via codice: materiali fisici (`MeshStandardMaterial`: metallo, ruvidità), texture
    generate a runtime (canvas o shader: pietra, intonaco, legno, metallo, stoffa), superfici sfumate,
    ombre proiettate, luce d'ambiente. Le texture generate dal codice non sono asset esterni.
  - Cavaliere: più segmenti e forme arrotondate, armatura metallica, mantello che si muove.
    Limite noto: con le sole primitive una figura umana resta un fantoccio dettagliato.
  - Castello: mura, merli, torri e mastio con pietra procedurale; è la parte che rende di più.
  - **Apporti esterni rinviati:** si decide solo dopo aver raggiunto il massimo con il codice.
    Regole già concordate per quel momento: una sola fonte per categoria (texture, vegetazione,
    personaggi); preferire licenze CC0 (CC-BY → file dei crediti); ogni elemento si prova in scena
    accanto a quelli procedurali e si scarta se stona; materiali ricolorati sulla nostra palette, nessuna
    luce o effetto propri dei pacchetti. Richiede di cambiare la regola 6 di `CLAUDE.md`.

- **Dopo la valutazione — rocca, borgo ed edifici (deciso con l'utente, fase a sé):**
  - Edifici di `docs/EARLY_GAME.md` §3 (stalla, taverna, sala d'armi, armeria/mercato, cappella) e di
    `docs/EVENTS.md` (fabbro, guaritore). Non stanno nel cortile attuale (36×36 m, mastio compreso).
  - Proposta: **due cinte**, come i borghi fortificati della zona (Tavullia compresa): **rocca** con
    mastio, sala d'armi, armeria, cappella; **borgo murato** addossato con stalla, taverna, mercato,
    fabbro e una sua porta. Da confermare quando si fa (alternativa: una rocca più grande).
  - Edifici generati da codice (regola 6). **Non si entra negli edifici**: avvicinandosi alla porta
    si apre la Carta del cronista. Niente interni 3D.
  - Gli edifici poggiano sul suolo composto (`componiSuolo`): ogni edificio porta la sua quota.

### M5 — Aggancio alla logica esistente (solo dopo la valutazione di M4)
- La distanza percorsa si converte in **Passi** (valore in `config.js`), che fanno avanzare `Calendar`
  e consumano Forza tramite `Knight`.
- HUD in HTML: data, Forza, Onore. Salvataggio della posizione con `Save`.
- **Accettazione:** camminando, la data avanza e la Forza cala come nel gioco 2D.

## Fuori dal prototipo (non farlo ora)

Multiplayer, server/VPS, NPC con IA, mondo a blocchi più grande di 2×2 km, mobile/touch,
modelli esterni, combattimento in 3D, ombre di alta qualità.
