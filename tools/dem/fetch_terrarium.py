#!/usr/bin/env python3
"""Knight Dawn — heightmap dalle tile pubbliche AWS "Terrarium" (nessuna registrazione).

Scarica le tile PNG di elevation-tiles-prod che coprono l'area, le decodifica
(quota = R*256 + G + B/256 - 32768), le unisce in un GeoTIFF temporaneo (EPSG:3857)
e lo passa alla stessa pipeline di make_heightmap.py.
Qualità inferiore ai DEM nazionali (dati di origine ~30 m), ma utile per partire.

Esempio:
  python fetch_terrarium.py
  python fetch_terrarium.py --lat 43.8985 --lon 12.7517 --zoom 14

Dipendenze: numpy, rasterio, pillow  (pip install numpy rasterio pillow)
"""

import argparse
import io
import math
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin
from rasterio.warp import transform as warp_transform

from make_heightmap import DST_CRS, add_area_args, build_heightmap, center_utm, print_summary

TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
MERC_MAX = 20037508.342789244           # metà circonferenza in EPSG:3857
MARGIN = 300.0                          # metri extra attorno all'area per la riproiezione


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return int(x), int(y)


def fetch_tile(z, x, y):
    url = TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={'User-Agent': 'KnightDawn-dem-tool'})
    with urllib.request.urlopen(req, timeout=30) as r:
        rgb = np.asarray(Image.open(io.BytesIO(r.read())).convert('RGB'), dtype=np.float32)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def main():
    p = argparse.ArgumentParser(description='Heightmap di Knight Dawn dalle tile AWS Terrarium.')
    p.add_argument('--zoom', type=int, default=14, help='livello di zoom delle tile (default 14, ~7 m/pixel)')
    add_area_args(p)
    a = p.parse_args()

    # Angoli dell'area (più un margine) in lat/lon, per sapere quali tile servono.
    cx, cy = center_utm(a.lat, a.lon)
    h = a.size / 2 + MARGIN
    lons, lats = warp_transform(DST_CRS, 'EPSG:4326',
                                [cx - h, cx + h, cx - h, cx + h], [cy - h, cy - h, cy + h, cy + h])
    x0, y0 = lonlat_to_tile(min(lons), max(lats), a.zoom)   # nord-ovest
    x1, y1 = lonlat_to_tile(max(lons), min(lats), a.zoom)   # sud-est

    n_tiles = (x1 - x0 + 1) * (y1 - y0 + 1)
    print(f'Scarico {n_tiles} tile (zoom {a.zoom}, x {x0}-{x1}, y {y0}-{y1})...')
    rows = []
    for ty in range(y0, y1 + 1):
        rows.append(np.hstack([fetch_tile(a.zoom, tx, ty) for tx in range(x0, x1 + 1)]))
    mosaic = np.vstack(rows).astype(np.float32)

    tile_m = 2 * MERC_MAX / 2 ** a.zoom
    px = tile_m / 256
    transform = from_origin(-MERC_MAX + x0 * tile_m, MERC_MAX - y0 * tile_m, px, px)

    with tempfile.TemporaryDirectory() as tmp:
        tif = Path(tmp) / 'terrarium_mosaic.tif'
        with rasterio.open(tif, 'w', driver='GTiff', width=mosaic.shape[1], height=mosaic.shape[0],
                           count=1, dtype='float32', crs='EPSG:3857', transform=transform) as ds:
            ds.write(mosaic, 1)
        meta = build_heightmap(str(tif), a.out, a.name, a.lat, a.lon, a.size, a.samples,
                               f'AWS Terrarium z{a.zoom}')
    print_summary(meta, a.out)


if __name__ == '__main__':
    main()
