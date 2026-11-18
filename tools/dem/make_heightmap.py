#!/usr/bin/env python3
"""Knight Dawn — genera una heightmap di gioco da un DEM GeoTIFF.

Riproietta il DEM in UTM 33N (EPSG:32633), ritaglia un quadrato attorno al centro,
lo ricampiona a una griglia regolare (cubica) e scrive:
  <out>/<nome>.bin   griglia Uint16 little-endian, righe da nord a sud, quota in decimetri
  <out>/<nome>.json  metadati (vedi docs/ESPLORAZIONE_3D.md)

Esempi:
  python make_heightmap.py --copernicus                       # Copernicus GLO-30 da AWS, nessuna registrazione
  python make_heightmap.py tinitaly_tile.tif --source "TINITALY 10m"
  python make_heightmap.py dem.tif --lat 43.8985 --lon 12.7517 --size 2000 --samples 257

Dipendenze: numpy, rasterio  (pip install numpy rasterio)
"""

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.warp import transform as warp_transform

DST_CRS = 'EPSG:32633'          # UTM zona 33N, metri
DEFAULT_NAME = 'tavullia'
DEFAULT_LAT = 43.8985
DEFAULT_LON = 12.7517
DEFAULT_SIZE = 2000.0           # lato dell'area in metri
DEFAULT_SAMPLES = 257           # campioni per lato (256 celle)
DEFAULT_OUT = Path(__file__).resolve().parents[2] / 'assets' / 'terrain'


def copernicus_url(lat, lon):
    """URL pubblico (AWS Open Data) della tile Copernicus GLO-30 da 1°x1° che contiene il punto."""
    la, lo = math.floor(lat), math.floor(lon)
    ns = f"{'N' if la >= 0 else 'S'}{abs(la):02d}_00"
    ew = f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00"
    base = f'Copernicus_DSM_COG_10_{ns}_{ew}_DEM'
    return f'https://copernicus-dem-30m.s3.amazonaws.com/{base}/{base}.tif'


def center_utm(lat, lon):
    xs, ys = warp_transform('EPSG:4326', DST_CRS, [lon], [lat])
    return xs[0], ys[0]


def build_heightmap(src, out_dir, name, lat, lon, size=DEFAULT_SIZE,
                    samples=DEFAULT_SAMPLES, source_label=''):
    """Legge il DEM `src` (percorso, URL o dataset GDAL) e scrive .bin + .json. Restituisce i metadati."""
    cell = size / (samples - 1)
    cx, cy = center_utm(lat, lon)
    half = size / 2
    # I centri dei pixel di destinazione cadono esattamente sui punti della griglia di gioco:
    # colonna 0 = ovest (cx - half), riga 0 = nord (cy + half).
    dst_transform = from_origin(cx - half - cell / 2, cy + half + cell / 2, cell, cell)
    dst = np.full((samples, samples), np.nan, dtype=np.float32)

    if isinstance(src, str) and src.startswith(('http://', 'https://')):
        src = '/vsicurl/' + src

    with rasterio.open(src) as ds:
        reproject(
            source=rasterio.band(ds, 1),
            destination=dst,
            dst_transform=dst_transform,
            dst_crs=DST_CRS,
            # Cubica, non bilineare: ingrandendo un DEM a 30 m su celle da 7,8 m la bilineare lascia
            # pieghe lungo la griglia sorgente, che il flat shading rende visibili a quadretti.
            resampling=Resampling.cubic,
            src_nodata=ds.nodata,
            dst_nodata=np.nan,
        )

    missing = int(np.isnan(dst).sum())
    if missing:
        sys.exit(f'Errore: {missing} punti dell\'area non sono coperti dal DEM. '
                 'Serve un DEM che copra tutto il quadrato (o più tile unite).')

    dst = np.clip(dst, 0, 6553.5)                     # quote sotto il mare → 0
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    np.round(dst * 10).astype('<u2').tofile(out_dir / f'{name}.bin')

    meta = {
        'name': name,
        'cols': samples,
        'rows': samples,
        'cellSize': cell,
        'sizeMeters': size,
        'center': {'lat': lat, 'lon': lon},
        'centerUTM': {'x': round(cx, 2), 'y': round(cy, 2)},
        'crs': DST_CRS,
        'minElev': round(float(dst.min()), 1),
        'maxElev': round(float(dst.max()), 1),
        'source': source_label,
    }
    (out_dir / f'{name}.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n',
                                          encoding='utf-8')
    return meta


def add_area_args(p):
    p.add_argument('--name', default=DEFAULT_NAME, help='nome dei file di uscita (default: tavullia)')
    p.add_argument('--lat', type=float, default=DEFAULT_LAT, help='latitudine del centro (WGS84)')
    p.add_argument('--lon', type=float, default=DEFAULT_LON, help='longitudine del centro (WGS84)')
    p.add_argument('--size', type=float, default=DEFAULT_SIZE, help='lato dell\'area in metri (default 2000)')
    p.add_argument('--samples', type=int, default=DEFAULT_SAMPLES, help='campioni per lato (default 257)')
    p.add_argument('--out', default=str(DEFAULT_OUT), help='cartella di uscita (default assets/terrain)')


def print_summary(meta, out):
    print(f"Scritti {meta['name']}.bin e {meta['name']}.json in {out}")
    print(f"  griglia {meta['cols']}x{meta['rows']}, cella {meta['cellSize']:.4f} m")
    print(f"  quote: {meta['minElev']} – {meta['maxElev']} m  (fonte: {meta['source'] or 'n/d'})")


def main():
    p = argparse.ArgumentParser(description='Genera la heightmap di Knight Dawn da un DEM GeoTIFF.')
    p.add_argument('dem', nargs='?', help='GeoTIFF di input (percorso locale o URL)')
    p.add_argument('--copernicus', action='store_true',
                   help='usa la tile Copernicus GLO-30 pubblica su AWS (nessuna registrazione)')
    p.add_argument('--source', default='', help='etichetta della fonte da scrivere nel JSON')
    add_area_args(p)
    a = p.parse_args()

    if a.copernicus:
        src = copernicus_url(a.lat, a.lon)
        label = a.source or 'Copernicus GLO-30'
        print(f'Lettura da {src}')
    elif a.dem:
        src = a.dem
        label = a.source or Path(a.dem).name
    else:
        p.error('indica un file DEM oppure --copernicus')

    meta = build_heightmap(src, a.out, a.name, a.lat, a.lon, a.size, a.samples, label)
    print_summary(meta, a.out)


if __name__ == '__main__':
    main()
