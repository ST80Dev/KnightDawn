# Heightmap del terreno — `tools/dem/`

Script Python che producono il terreno reale usato dal gioco:

- `assets/terrain/<nome>.bin` — griglia di quote `Uint16` little-endian, righe da nord a sud, in **decimetri**
- `assets/terrain/<nome>.json` — metadati (dimensioni, centro, quote minima/massima, fonte)

Il gioco li carica da `js/3d/terrain.js`; se mancano usa un terreno procedurale e lo segnala nel HUD.
Formato completo in `docs/ESPLORAZIONE_3D.md`.

> Nel repository c'è già `tavullia` generato da **Copernicus GLO-30**. Rigenerarlo serve solo per
> cambiare centro, dimensione o fonte dei dati.

## 1. Installazione (una volta sola)

Serve Python 3.9 o successivo. Da un terminale, nella cartella `tools/dem`:

```
pip install numpy rasterio pillow
```

`rasterio` include già GDAL: su Windows, macOS e Linux non serve installare altro.

## 2. Generare la heightmap

Tutti i comandi si lanciano da `tools/dem`. Senza opzioni scrivono `tavullia.bin` + `tavullia.json`
in `assets/terrain/`, sovrascrivendo i precedenti.

### A. Copernicus GLO-30 — consigliato per partire

Dati a 30 m dell'Agenzia Spaziale Europea, letti direttamente da AWS: nessuna registrazione,
nessun download manuale (scarica solo la porzione necessaria).

```
python make_heightmap.py --copernicus
```

### B. TINITALY 10 m — la qualità migliore

Il DEM dell'INGV a 10 m, più dettagliato. Va scaricato a mano dal sito INGV (tinitaly.pi.ingv.it):
si sceglie la tile che contiene Tavullia e si ottiene un GeoTIFF. Poi:

```
python make_heightmap.py percorso/della/tile.tif --source "TINITALY 10m"
```

Lo script riconosce da solo il sistema di coordinate del file e lo riproietta.
Se l'area di 2×2 km cade a cavallo di due tile, lo script si ferma con un errore: in quel caso
unire prima le tile (per esempio con QGIS, *Raster → Varie → Unione*) e passare il file unito.

### C. AWS Terrarium — alternativa

Tile pubbliche già pronte, qualità simile a Copernicus.

```
python fetch_terrarium.py
```

## 3. Opzioni comuni

| Opzione | Default | Significato |
|---|---|---|
| `--lat`, `--lon` | `43.8985`, `12.7517` | centro dell'area (gradi WGS84, come su Google Maps) |
| `--size` | `2000` | lato dell'area in metri |
| `--samples` | `257` | punti per lato (256 celle da 7,8125 m) |
| `--name` | `tavullia` | nome dei file prodotti |
| `--out` | `assets/terrain` | cartella di uscita |

Esempio: spostare il centro sul punto copiato da Google Maps (tasto destro sul luogo → coordinate):

```
python make_heightmap.py --copernicus --lat 43.8990 --lon 12.7550
```

## 4. Verificare nel gioco

1. Avviare il server locale dalla radice del progetto: `python -m http.server`
2. Aprire `http://localhost:8000` e premere `F3`: la seconda riga mostra la fonte e le quote
   minima–massima; passando il mouse sul terreno si leggono quota e pendenza del punto.

## Note sui dati

- Copernicus e Terrarium sono modelli **di superficie** (DSM): includono alberi ed edifici, quindi
  boschi e paesi risultano qualche metro più alti del suolo. TINITALY è più vicino al suolo nudo.
- Il ricampionamento è **cubico**: con dati a 30 m su celle da 7,8 m quello bilineare lascerebbe
  pieghe a griglia visibili con il flat shading.
- Le quote sotto il livello del mare vengono portate a 0.
