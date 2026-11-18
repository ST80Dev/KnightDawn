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
- **Stato:** implementata, in attesa del test dell'utente. Camera sopra la spalla destra (il cavaliere
  sta in basso, la vista resta libera davanti); se un dosso alle spalle copre la linea di vista, la camera
  si alza per scavalcarlo. Girando da fermo il cavaliere fa piccoli passi sul posto. Il tasto `C` passa
  ancora alla camera libera di debug (OrbitControls). Parametri provabili da console: `kd.cam.cfg`.
  Misurato in headless: camera mai a meno di 45 cm dal suolo, linea di vista mai sotto il terreno.

### M4 — Castello
- `js/3d/castle3d.js`: castello procedurale (mura, 4 torri, mastio, porta), posizionato su un punto
  configurabile e con fondamenta che si adattano al terreno (base che scende fino al suolo).
- Collisioni semplici (rettangoli/cerchi sul piano XZ) contro mura e torri; la porta resta attraversabile.
- **Accettazione:** si gira attorno al castello senza attraversare i muri e si entra dalla porta.
- **Qui si valuta il prototipo** con l'utente: se e come proseguire.

### M5 — Aggancio alla logica esistente (solo dopo la valutazione di M4)
- La distanza percorsa si converte in **Passi** (valore in `config.js`), che fanno avanzare `Calendar`
  e consumano Forza tramite `Knight`.
- HUD in HTML: data, Forza, Onore. Salvataggio della posizione con `Save`.
- **Accettazione:** camminando, la data avanza e la Forza cala come nel gioco 2D.

## Fuori dal prototipo (non farlo ora)

Multiplayer, server/VPS, NPC con IA, mondo a blocchi più grande di 2×2 km, mobile/touch,
modelli esterni, combattimento in 3D, ombre di alta qualità.
