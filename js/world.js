// FERRO & CENERE — generazione mondo procedurale
// Vanilla, niente dipendenze. Value-noise fBm con seed → elevazione + umidità
// → biomi; poi piazzamento di castelli e villaggi con vincoli minimi.
// Vedi docs/WORLD_GEN.md e docs/GRAFICA.md.

// ─── Value noise (hash → bilineare → fBm) ──────────────────────────────────
function _hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9E3779B1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function _smooth(t) { return t * t * (3 - 2 * t); }
function _valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = _hash2(ix,     iy,     seed);
  const b = _hash2(ix + 1, iy,     seed);
  const c = _hash2(ix,     iy + 1, seed);
  const d = _hash2(ix + 1, iy + 1, seed);
  const ux = _smooth(fx), uy = _smooth(fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) +
         c * (1 - ux) * uy + d * ux * uy;
}
function _fbm(x, y, seed, octaves, freq) {
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * _valueNoise(x * f, y * f, (seed + i * 1013) | 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
// Ridged multifractal: crea creste/linee → catene montuose (non blob).
function _ridge(x, y, seed, octaves, freq) {
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let i = 0; i < octaves; i++) {
    let n = _valueNoise(x * f, y * f, (seed + i * 1013) | 0);
    n = 1 - Math.abs(2 * n - 1); // cresta
    n = n * n;                   // affila il profilo
    sum += amp * n;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

const World = {
  width: 0,
  height: 0,
  seed: 0,
  tiles: null,    // Uint8Array: bioma per tile
  elev: null,     // Float32Array: elevazione (per ombreggiature future)
  structures: [], // [{ type:'castle'|'village', x, y, name }]
  knightStart: { x: 0, y: 0 },

  BIOME: { ACQUA: 0, PIANURA: 1, FORESTA: 2, COLLINA: 3, MONTAGNA: 4, PALUDE: 5, SABBIA: 6 },

  CASTLE_NAMES: ['Vornkeep', 'Ashford', 'Greymoor', 'Duncairn', 'Highrock', 'Carthwall'],
  VILLAGE_NAMES: ['Lyhall', 'Brackmere', 'Oakford', 'Mosswell', 'Thornby', 'Reedmoor',
                  'Holloway', 'Cairnside', 'Dunmere', 'Fennwick', 'Greenford', 'Larkhollow'],

  generate(seed) {
    this.seed = (seed >>> 0) || 1;
    this.width = WORLD_W;
    this.height = WORLD_H;
    const W = this.width, H = this.height;
    const B = this.BIOME;
    this.tiles = new Uint8Array(W * H);
    this.elev = new Float32Array(W * H);

    const freqE = 4.2 / Math.max(W, H);   // feature medie (mixing maggiore)
    const freqR = 5.5 / Math.max(W, H);   // creste montuose
    const freqM = 6.0 / Math.max(W, H);   // umidità a grana più fine
    const seedE = this.seed;
    const seedR = (this.seed ^ 0x68bc21eb) | 0;
    const seedM = (this.seed ^ 0x5bd1e995) | 0;

    // Passata 1: campi grezzi di elevazione (continente + catene montuose) e
    // umidità. Salviamo min/max per normalizzare su tutto l'intervallo.
    const hum = new Float32Array(W * H);
    let eMin = Infinity, eMax = -Infinity, mMin = Infinity, mMax = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const base = _fbm(x, y, seedE, 5, freqE);
        const dx = (x / W - 0.5) * 2;
        const dy = (y / H - 0.5) * 2;
        const d = Math.sqrt(dx * dx + dy * dy);
        const cont = 1 - d;                 // gradiente continente (centro alto)
        let e = base * 0.5 + cont * 0.5;
        // Catene montuose: creste ridged, soprattutto verso l'interno.
        const r = _ridge(x, y, seedR, 4, freqR);
        e += r * 0.5 * Math.max(0, cont);
        const m = _fbm(x + 1000, y + 1000, seedM, 4, freqM);
        const i = y * W + x;
        this.elev[i] = e; hum[i] = m;
        if (e < eMin) eMin = e; if (e > eMax) eMax = e;
        if (m < mMin) mMin = m; if (m > mMax) mMax = m;
      }
    }

    // Passata 2: normalizza e assegna biomi su intervallo [0,1].
    const eSpan = (eMax - eMin) || 1;
    const mSpan = (mMax - mMin) || 1;
    for (let i = 0; i < W * H; i++) {
      const en = (this.elev[i] - eMin) / eSpan;
      const mn = (hum[i] - mMin) / mSpan;
      let b;
      if (en < 0.34)       b = B.ACQUA;
      else if (en > 0.82)  b = B.MONTAGNA;
      else if (en > 0.66)  b = B.COLLINA;
      else if (en < 0.42 && mn > 0.60) b = B.PALUDE;
      else if (mn > 0.58)  b = B.FORESTA;
      else if (mn < 0.28)  b = B.SABBIA;
      else                 b = B.PIANURA;
      this.tiles[i] = b;
    }

    this._placeStructures();
    return this;
  },

  biomeAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.tiles[y * this.width + x];
  },

  isLand(x, y) {
    const b = this.biomeAt(x, y);
    return b > 0; // tutto tranne ACQUA (0) e fuori mappa (-1)
  },

  _nearWater(x, y, r) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (this.biomeAt(x + dx, y + dy) === this.BIOME.ACQUA) return true;
    return false;
  },

  _far(x, y, minD) {
    for (const s of this.structures) {
      const dx = s.x - x, dy = s.y - y;
      if (dx * dx + dy * dy < minD * minD) return false;
    }
    return true;
  },

  _placeStructures() {
    const B = this.BIOME;
    const rnd = mulberry32((this.seed ^ 0xC0FFEE) >>> 0);
    this.structures = [];
    const W = this.width, H = this.height;

    // Castelli: su collina o pianura, ben distanziati.
    let ci = 0;
    for (let tries = 0; tries < 4000 && ci < 5; tries++) {
      const x = 2 + Math.floor(rnd() * (W - 4));
      const y = 2 + Math.floor(rnd() * (H - 4));
      const b = this.biomeAt(x, y);
      if ((b === B.COLLINA || b === B.PIANURA) && this._far(x, y, 22)) {
        this.structures.push({ type: 'castle', x, y, name: this.CASTLE_NAMES[ci % this.CASTLE_NAMES.length] });
        ci++;
      }
    }

    // Villaggi: pianura/foresta, preferibilmente vicino all'acqua, distanziati.
    let vi = 0;
    for (let tries = 0; tries < 6000 && vi < 12; tries++) {
      const x = 1 + Math.floor(rnd() * (W - 2));
      const y = 1 + Math.floor(rnd() * (H - 2));
      const b = this.biomeAt(x, y);
      const okBiome = (b === B.PIANURA || b === B.FORESTA);
      // bonus vicino acqua: accetta sempre se vicino acqua, altrimenti 1 su 2
      const okPlace = okBiome && this._far(x, y, 8) &&
                      (this._nearWater(x, y, 2) || rnd() < 0.5);
      if (okPlace) {
        this.structures.push({ type: 'village', x, y, name: this.VILLAGE_NAMES[vi % this.VILLAGE_NAMES.length] });
        vi++;
      }
    }

    // Partenza del cavaliere: primo castello, altrimenti centro su terra.
    const firstCastle = this.structures.find(s => s.type === 'castle');
    if (firstCastle) {
      this.knightStart = { x: firstCastle.x, y: firstCastle.y + 1 };
    } else {
      let bx = Math.floor(W / 2), by = Math.floor(H / 2);
      outer:
      for (let r = 0; r < Math.max(W, H); r++) {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = Math.floor(W / 2) + dx, y = Math.floor(H / 2) + dy;
            if (this.isLand(x, y)) { bx = x; by = y; break outer; }
          }
      }
      this.knightStart = { x: bx, y: by };
    }
  },
};
