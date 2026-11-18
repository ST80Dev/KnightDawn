# Esplorazione 3D — specifiche del prototipo minimo

> Obiettivo: capire se il 3D è sostenibile da sviluppatore singolo **prima** di investirci.
> Il prototipo è riuscito se, a fine M4, camminare sul terreno reale è fluido e piacevole.
> Se ci si impantana su camera, collisioni o prestazioni, si valuta il ritorno al 2D (tag `v2d-final`).

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
    "crs": "EPSG:32633", "minElev": 0, "maxElev": 0, "source": "TINITALY 10m" }
  ```
- Le coordinate del centro sono **da verificare** sul DEM reale.

### Generazione (`tools/dem/`)

Gli script girano **sul PC dell'utente**, perché l'ambiente cloud non raggiunge i server dei dati.
- `make_heightmap.py` — input: un GeoTIFF (TINITALY 10 m dell'INGV oppure Copernicus GLO-30).
  Riproietta in EPSG:32633, ritaglia 2×2 km attorno al centro, ricampiona a 257×257 (bilineare)
  e scrive `.bin` + `.json`. Dipendenze: `rasterio` e `numpy` (oppure GDAL da riga di comando).
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
- Tag `v2d-final` su `main` **prima** di qualsiasi rimozione.
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
- Espone `getHeight(x, z)` (interpolazione bilineare) e `getSlope(x, z)`: le useranno gli altri moduli.
- Camera libera di debug (orbitale) attivabile per ispezionare il terreno.
- `tools/dem/` completo con README.
- **Accettazione:** il rilievo è riconoscibile (con dati reali), almeno 60 FPS, nessuna cucitura visibile.

### M2 — Cavaliere
- `js/3d/knight3d.js`: cavaliere costruito con primitive (busto, testa con elmo, braccia, gambe,
  scudo, spada, mantello semplice), alto circa 1,8 m.
- Animazione procedurale: arti che oscillano in proporzione alla velocità, fermo = respiro leggero.
- Movimento: `WASD` o frecce, `Shift` per correre (camminata ~1,5 m/s, corsa ~5 m/s), rotazione fluida.
- Segue il terreno con `getHeight`; non sale su pendenze oltre ~35°; non esce dai bordi dell'area.
- **Accettazione:** camminata su e giù per le colline senza compenetrazioni né scatti.

### M3 — Camera in terza persona
- `js/3d/camera.js`: camera alle spalle con inseguimento morbido (lerp).
- Trascinamento del mouse per ruotare attorno al cavaliere, rotella per lo zoom (limiti min/max).
- La camera non entra mai sotto il terreno; la direzione di movimento è relativa alla camera.
- **Accettazione:** nessuna vista dentro le colline, nessun movimento nauseante.

### M4 — Castello
- `js/3d/castle3d.js`: castello procedurale (mura, 4 torri, mastio, porta), posizionato su un punto
  configurabile e con fondamenta che si adattano al terreno (base che scende fino al suolo).
- Collisioni semplici (rettangoli/cerchi sul piano XZ) contro mura e torri; la porta resta attraversabile.
- **Accettazione:** si gira attorno al castello senza attraversare i muri e si entra dalla porta.
- **Qui si valuta il prototipo** con l'utente: proseguire in 3D o tornare al 2D.

### M5 — Aggancio alla logica esistente (solo dopo la valutazione di M4)
- La distanza percorsa si converte in **Passi** (valore in `config.js`), che fanno avanzare `Calendar`
  e consumano Forza tramite `Knight`.
- HUD in HTML: data, Forza, Onore. Salvataggio della posizione con `Save`.
- **Accettazione:** camminando, la data avanza e la Forza cala come nel gioco 2D.

## Fuori dal prototipo (non farlo ora)

Multiplayer, server/VPS, NPC con IA, mondo a blocchi più grande di 2×2 km, mobile/touch,
modelli esterni, combattimento in 3D, ombre di alta qualità.
