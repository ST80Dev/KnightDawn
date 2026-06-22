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
  specials: [],   // [{ x, y, kind, discovered, name }] — luoghi ignoti agli estremi
  knightStart: { x: 0, y: 0 },

  BIOME: {
    ACQUA: 0, PIANURA: 1, FORESTA: 2, COLLINA: 3, MONTAGNA: 4, PALUDE: 5,
    SABBIA: 6, NEVE: 7, GHIACCIO: 8, FIUME: 9,
  },

  CASTLE_NAMES: ['Vornkeep', 'Ashford', 'Greymoor', 'Duncairn', 'Highrock',
                 'Carthwall', 'Stonereach', 'Blackmere', 'Ravensgate', 'Ironhold'],
  VILLAGE_NAMES: ['Lyhall', 'Brackmere', 'Oakford', 'Mosswell', 'Thornby', 'Reedmoor',
                  'Holloway', 'Cairnside', 'Dunmere', 'Fennwick', 'Greenford', 'Larkhollow',
                  'Briarwood', 'Stoneford', 'Hartmere', 'Willowend', 'Crowhill',
                  'Marshgate', 'Pineholt', 'Foxglen', 'Stagford', 'Whitebrook'],

  generate(seed) {
    this.seed = (seed >>> 0) || 1;
    this.width = WORLD_W;
    this.height = WORLD_H;
    const W = this.width, H = this.height;
    const B = this.BIOME;
    this.tiles = new Uint8Array(W * H);
    this.elev = new Float32Array(W * H);

    const freqL = 2.2 / Math.max(W, H);   // forma continente a grande scala
    const freqD = 5.0 / Math.max(W, H);   // dettaglio coste + isole
    const freqR = 5.5 / Math.max(W, H);   // creste montuose
    const freqM = 6.0 / Math.max(W, H);   // umidità a grana fine
    const seedL = this.seed;
    const seedD = (this.seed ^ 0x27d4eb2f) | 0;
    const seedR = (this.seed ^ 0x68bc21eb) | 0;
    const seedM = (this.seed ^ 0x5bd1e995) | 0;
    const seedT = (this.seed ^ 0x13579bdf) | 0; // variazione climatica

    // Passata 1: elevazione = continente (grande scala) + dettaglio costiero,
    // SENZA bias radiale forzato → i confini del mondo variano (terra o mare),
    // con isole, istmi e canali generati dal noise. Più creste montuose.
    // Un falloff MOLTO leggero solo sull'ultimo anello evita tagli netti.
    const hum = new Float32Array(W * H);
    let eMin = Infinity, eMax = -Infinity, mMin = Infinity, mMax = -Infinity;
    const edge = 6; // tile dell'anello esterno con leggero abbassamento
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cont = _fbm(x, y, seedL, 4, freqL);
        const det  = _fbm(x, y, seedD, 4, freqD);
        let e = cont * 0.70 + det * 0.30;
        // Catene montuose dove l'elevazione è già medio-alta.
        const r = _ridge(x, y, seedR, 4, freqR);
        e += r * 0.45 * Math.max(0, e - 0.52);
        // Falloff leggerissimo sull'orlo estremo (no anello d'acqua forzato).
        const em = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (em < edge) e -= (1 - em / edge) * 0.12;

        const m = _fbm(x + 1000, y + 1000, seedM, 4, freqM);
        const i = y * W + x;
        this.elev[i] = e; hum[i] = m;
        if (e < eMin) eMin = e; if (e > eMax) eMax = e;
        if (m < mMin) mMin = m; if (m > mMax) mMax = m;
      }
    }

    // Passata 2: soglie per QUANTILE sull'elevazione → quantità di mare,
    // colline e montagne consistenti tra i seed (sempre mare navigabile e
    // catene), mentre la FORMA (coste, isole, istmi, canali) resta variabile.
    const sorted = Float32Array.from(this.elev).sort();
    const N = sorted.length;
    const q = (f) => sorted[Math.max(0, Math.min(N - 1, Math.floor(f * N)))];
    const rng = mulberry32((this.seed ^ 0xBEEFCAFE) >>> 0);
    // Meno mare aperto: la frazione resta variabile per seed ma più bassa.
    const seaFrac = 0.16 + rng() * 0.10;   // 16%–26% di mare
    const seaLevel   = q(seaFrac);
    const coastLevel = q(seaFrac + 0.06);  // bassopiano costiero → paludi
    const hillLevel  = q(0.78);            // ~22% terreni alti (colline+)
    const mountLevel = q(0.93);            // ~7% montagne (le creste)

    // Rumore a bassa frequenza per "macchie di bosco" sparse ovunque: si
    // somma alla umidità così foreste compaiono anche in pianura asciutta e
    // tra le montagne, evitando ampie zone monocrome di montagna o pianura.
    const seedF = (this.seed ^ 0x71f3a9d5) | 0;
    const freqF1 = 7.0 / Math.max(W, H);    // macchie medie
    const freqF2 = 14.0 / Math.max(W, H);   // dettaglio macchie
    // Rumore "roccia/dosso": macchie di collina sparse anche in pianura,
    // così evita la monotonia di lunghi stretch piatti dello stesso bioma.
    const seedH = (this.seed ^ 0x2a7c11f9) | 0;
    const freqH1 = 8.0 / Math.max(W, H);
    const freqH2 = 16.0 / Math.max(W, H);

    const mSpan = (mMax - mMin) || 1;
    const eSpanE = (eMax - eMin) || 1;
    // Clima emisfero boreale: nord (y basso) freddo, sud (y alto) caldo;
    // la quota raffredda; un po' di noise rompe le bande nette.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const e = this.elev[i];
        const mn = (hum[i] - mMin) / mSpan;
        const enorm = (e - eMin) / eSpanE;
        const tN = _fbm(x + 5000, y + 5000, seedT, 3, freqL * 1.6);
        let temp = (y / (H - 1));               // 0 nord freddo .. 1 sud caldo
        temp -= Math.max(0, enorm - 0.5) * 0.7; // quota → più freddo
        temp += (tN - 0.5) * 0.16;
        temp = Math.max(0, Math.min(1, temp));

        // "Macchie di bosco": noise dedicato a media frequenza. Indipendente
        // dall'umidità climatica → boschi anche in zone secche e in quota.
        const f = _fbm(x + 2000, y + 7000, seedF, 3, freqF1) * 0.7 +
                  _fbm(x + 7000, y + 2000, seedF + 1, 2, freqF2) * 0.3;
        const forestScore = mn * 0.55 + f * 0.45;
        // "Dossi": noise indipendente per macchie rocciose/collinari sparse
        // anche in pianura → micro-zone mischiate, niente monotonia.
        const hPatch = _fbm(x + 3000, y + 9000, seedH, 3, freqH1) * 0.6 +
                       _fbm(x + 9000, y + 3000, seedH + 1, 2, freqH2) * 0.4;

        let b;
        if (e < seaLevel) {
          b = (temp < 0.10) ? B.GHIACCIO : B.ACQUA; // mare ghiacciato solo all'estremo nord
        } else if (e >= mountLevel) {
          // Macchie di foresta alpina anche tra le montagne, dove la macchia
          // di bosco è marcata e il clima non è polare.
          b = (forestScore > 0.62 && temp > 0.20) ? B.FORESTA : B.MONTAGNA;
        } else if (temp < 0.15) {
          b = B.NEVE;                                // neve/tundra solo nelle terre più fredde
        } else if (e >= hillLevel) {
          // Colline boscose dove la macchia è alta.
          b = (forestScore > 0.50) ? B.FORESTA : B.COLLINA;
        } else if (e < coastLevel && mn > 0.55 && temp > 0.35) {
          b = B.PALUDE;                              // paludi nelle basse terre umide
        } else if (temp > 0.66 && mn < 0.32 && f < 0.40) {
          b = B.SABBIA;                              // deserti: caldi, secchi e senza macchie boscose
        } else if (forestScore > 0.42) {
          b = B.FORESTA;                             // boschi diffusi, a macchie ovunque
        } else if (hPatch > 0.62) {
          b = B.COLLINA;                             // dossi/collinette anche in pianura
        } else {
          b = B.PIANURA;
        }
        this.tiles[i] = b;
      }
    }

    // Isolinee di altitudine simboliche: 4 soglie quantili sopra il livello
    // del mare. Il renderer disegna un tratto fine sul bordo tra due tile la
    // cui elevazione attraversa una di queste soglie → cartografia "a vista"
    // delle zone rialzate, senza numeri.
    this.contourLevels = [q(0.55), q(0.70), q(0.82), q(0.92)];

    this._carveRivers();
    this._placeStructures();
    this._placeSpecials();
    return this;
  },

  biomeAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.tiles[y * this.width + x];
  },

  elevAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -Infinity;
    return this.elev[y * this.width + x];
  },

  biomeClamped(x, y) {
    const W = this.width, H = this.height;
    if (x < 0) x = 0; else if (x >= W) x = W - 1;
    if (y < 0) y = 0; else if (y >= H) y = H - 1;
    return this.tiles[y * W + x];
  },

  isWater(b) {
    const B = this.BIOME;
    return b === B.ACQUA || b === B.GHIACCIO || b === B.FIUME;
  },

  isLand(x, y) {
    const b = this.biomeAt(x, y);
    return b > 0 && !this.isWater(b); // né mare/lago/fiume né fuori mappa
  },

  _nearWater(x, y, r) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const b = this.biomeAt(x + dx, y + dy);
        if (b >= 0 && this.isWater(b)) return true;
      }
    return false;
  },

  // Fiumi: dai rilievi scendono per pendenza fino a mare/lago o minimo locale
  // (dove formano un piccolo lago). Marcati come FIUME; i laghi come ACQUA.
  _carveRivers() {
    const W = this.width, H = this.height, B = this.BIOME;
    const rng = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
    // Sorgenti: tutte le terre alte (montagna, collina) E pianure/foreste
    // d'altura: così i fiumi nascono ovunque sia abbastanza elevato.
    const sources = [];
    for (let i = 0; i < this.tiles.length; i++) {
      const b = this.tiles[i];
      if (b === B.MONTAGNA || b === B.COLLINA) sources.push(i);
      else if ((b === B.PIANURA || b === B.FORESTA) && this.elev[i] > 0 && rng() < 0.04) {
        sources.push(i);
      }
    }
    if (!sources.length) return;
    // Molti più fiumi, proporzionali alla superficie del mondo.
    const baseN = Math.round((W * H) / 800);   // ~54 per 240×180
    const N = baseN + Math.floor(rng() * baseN * 0.4);
    for (let s = 0; s < N; s++) {
      let idx = sources[Math.floor(rng() * sources.length)];
      let x = idx % W, y = (idx / W) | 0;
      const visited = new Set();
      let steps = 0;
      while (steps++ < W + H) {
        const i = y * W + x;
        if (this.isWater(this.tiles[i])) break;          // raggiunto mare/lago
        if (this.tiles[i] !== B.MONTAGNA) this.tiles[i] = B.FIUME;
        visited.add(i);
        let bx = -1, by = -1, be = this.elev[i];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (visited.has(ni)) continue;
            if (this.elev[ni] < be) { be = this.elev[ni]; bx = nx; by = ny; }
          }
        if (bx < 0) { this._makeLake(x, y); break; }      // minimo locale → lago
        x = bx; y = by;
      }
    }
  },

  _makeLake(cx, cy) {
    const W = this.width, H = this.height, B = this.BIOME;
    const e0 = this.elev[cy * W + cx];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (Math.abs(dx) + Math.abs(dy) <= 2 && this.elev[ni] <= e0 + 0.015) {
          this.tiles[ni] = B.ACQUA;
        }
      }
  },

  // Zone speciali agli estremi (nord, sud, isola remota): tipo casuale, ma la
  // natura resta IGNOTA (discovered=false) — si scoprono giocando.
  _placeSpecials() {
    const W = this.width, H = this.height;
    const rng = mulberry32((this.seed ^ 0x1234abcd) >>> 0);
    const kinds = ['rovine', 'tempio', 'monolite', 'relitto', 'cripta', 'faro', 'santuario', 'voragine'];
    this.specials = [];
    const far = (x, y, md) => this.specials.every(s => (s.x - x) ** 2 + (s.y - y) ** 2 >= md * md);
    const add = (x, y) => {
      this.specials.push({ x, y, kind: kinds[Math.floor(rng() * kinds.length)], discovered: false, name: 'Luogo ignoto' });
    };

    // Estremo nord e sud: terra alla latitudine più estrema ma verso il CENTRO
    // orizzontale (evita gli angoli). Punteggio = latitudine + scarto da x medio.
    let bestN = -1, scN = Infinity, bestS = -1, scS = Infinity;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] === 0 || this.isWater(this.tiles[i])) continue;
      const x = i % W, y = (i / W) | 0;
      const offc = Math.abs(x - W / 2) * 0.35;
      const sn = y + offc;            // piccolo = nord & centrale
      const ss = (H - 1 - y) + offc;  // piccolo = sud & centrale
      if (sn < scN) { scN = sn; bestN = i; }
      if (ss < scS) { scS = ss; bestS = i; }
    }
    if (bestN >= 0) add(bestN % W, (bestN / W) | 0);
    if (bestS >= 0) add(bestS % W, (bestS / W) | 0);

    // Isola remota: terra circondata da acqua VERA (no fuori-mappa), lontana
    // dal centro e dalle altre zone speciali.
    let bi = -1, bs = -1; const cxC = W / 2, cyC = H / 2;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] === 0 || this.isWater(this.tiles[i])) continue;
      const x = i % W, y = (i / W) | 0;
      let w = 0, tot = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          tot++;
          if (this.isWater(this.tiles[ny * W + nx])) w++;
        }
      if (tot >= 5 && w >= tot - 1 && far(x, y, 18)) { // quasi tutto acqua attorno
        const d = (x - cxC) * (x - cxC) + (y - cyC) * (y - cyC);
        if (d > bs) { bs = d; bi = i; }
      }
    }
    if (bi >= 0) add(bi % W, (bi / W) | 0);
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
    for (let tries = 0; tries < 6000 && ci < 8; tries++) {
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
    for (let tries = 0; tries < 10000 && vi < 22; tries++) {
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
      this.knightStart = { x: firstCastle.x, y: firstCastle.y };
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
