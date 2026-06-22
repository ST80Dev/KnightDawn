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
    SABBIA: 6, NEVE: 7, GHIACCIO: 8, FIUME: 9, ROCCIA: 10,
    // Sotto-tipi di pianura per zona climatica (rendering diverso, stessa
    // semantica di gameplay della PIANURA: terra aperta percorribile).
    PIANURA_N: 11,  // settentrionale, marrone chiaro (tundra/steppa)
    PIANURA_S: 12,  // meridionale, beige caldo (arida non desertica)
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

    // Per-seed style: ogni mappa ha "carattere" diverso (più mare/più terra,
    // più catene/poche, foreste sparse/fitte). Le frequenze e le frazioni
    // variano per seed → mappe distinte tra loro, non sempre la stessa cosa.
    const styleRng = mulberry32((this.seed ^ 0xA5A5A5A5) >>> 0);
    const seaFrac     = 0.14 + styleRng() * 0.18;          // 14%–32%
    const mountFrac   = 0.045 + styleRng() * 0.055;        // 4.5%–10%
    const forestCover = 0.20 + styleRng() * 0.22;          // 20%–42%
    const desertBias  = styleRng();                        // 0..1
    const freqL = (1.8 + styleRng() * 0.9) / Math.max(W, H);
    const freqD = (4.0 + styleRng() * 2.0) / Math.max(W, H);
    const freqR = (3.5 + styleRng() * 2.5) / Math.max(W, H);  // ridge
    const freqM = (5.0 + styleRng() * 2.5) / Math.max(W, H);
    const freqC = (4.0 + styleRng() * 2.5) / Math.max(W, H);  // grumi foresta
    const seedL = this.seed;
    const seedD = (this.seed ^ 0x27d4eb2f) | 0;
    const seedR = (this.seed ^ 0x68bc21eb) | 0;
    const seedM = (this.seed ^ 0x5bd1e995) | 0;
    const seedT = (this.seed ^ 0x13579bdf) | 0;
    const seedFC = (this.seed ^ 0x71f3a9d5) | 0; // grumi foresta
    const seedFR = (this.seed ^ 0x33a712cc) | 0; // dettaglio bordi grumi
    const seedCJ = (this.seed ^ 0x4d8e2b07) | 0; // jitter confine climatico

    // Passata 1: elevazione + umidità + ridge (separato). Il ridge NON viene
    // sommato a elev: lo usiamo poi come SELETTORE per le catene montuose,
    // così le montagne formano linee curve (catene), non blob di altopiano.
    const hum = new Float32Array(W * H);
    const ridge = new Float32Array(W * H);
    let eMin = Infinity, eMax = -Infinity, mMin = Infinity, mMax = -Infinity;
    const edge = 6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cont = _fbm(x, y, seedL, 4, freqL);
        const det  = _fbm(x, y, seedD, 4, freqD);
        let e = cont * 0.70 + det * 0.30;
        const em = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (em < edge) e -= (1 - em / edge) * 0.12;
        ridge[y * W + x] = _ridge(x, y, seedR, 4, freqR);

        const m = _fbm(x + 1000, y + 1000, seedM, 4, freqM);
        const i = y * W + x;
        this.elev[i] = e; hum[i] = m;
        if (e < eMin) eMin = e; if (e > eMax) eMax = e;
        if (m < mMin) mMin = m; if (m > mMax) mMax = m;
      }
    }

    // Quantili elev (forma del continente) e ridge (catene).
    const sorted = Float32Array.from(this.elev).sort();
    const Ntot = sorted.length;
    const q = (f) => sorted[Math.max(0, Math.min(Ntot - 1, Math.floor(f * Ntot)))];
    const sortedR = Float32Array.from(ridge).sort();
    const qR = (f) => sortedR[Math.max(0, Math.min(Ntot - 1, Math.floor(f * Ntot)))];
    const seaLevel   = q(seaFrac);
    // Coste pulite: fascia palude STRETTA (+0.015, era +0.06). La palude
    // diventa eccezione locale dove condizioni di umidità/temperatura sono
    // estreme, non una fascia continua costiera.
    const coastLevel = q(Math.min(0.99, seaFrac + 0.015));
    const hillLevel  = q(0.78);
    const ridgeMountain = qR(1 - mountFrac);   // top mountFrac → catene

    const mSpan = (mMax - mMin) || 1;
    const eSpanE = (eMax - eMin) || 1;
    const eSeaSpan = (eMax - seaLevel) || 1;

    // Passata 2: bioma base SENZA foreste. Le montagne sono selezionate dal
    // RIDGE (catene curve) + soglia di elevazione minima → niente blob
    // d'altopiano. Le foreste arrivano in passata 4 (grumi).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const e = this.elev[i];
        const mn = (hum[i] - mMin) / mSpan;
        const enorm = (e - eMin) / eSpanE;
        const tN = _fbm(x + 5000, y + 5000, seedT, 3, freqL * 1.6);
        let temp = (y / (H - 1)) - Math.max(0, enorm - 0.5) * 0.6 + (tN - 0.5) * 0.16;
        temp = Math.max(0, Math.min(1, temp));

        let b;
        if (e < seaLevel) {
          b = (temp < 0.10) ? B.GHIACCIO : B.ACQUA;
        } else if (ridge[i] >= ridgeMountain && (e - seaLevel) > eSeaSpan * 0.10) {
          b = B.MONTAGNA;
        } else if (temp < 0.13) {
          b = B.NEVE;
        } else if (e >= hillLevel) {
          b = B.COLLINA;
        } else if (e < coastLevel && mn > 0.80 && temp > 0.45) {
          b = B.PALUDE;
        } else if (temp > 0.66 && mn < (0.26 + desertBias * 0.10)) {
          b = B.SABBIA;
        } else {
          // Pianura: sotto-tipo per zona climatica. Confine FRASTAGLIATO
          // grazie a un noise dedicato sommato a temp → niente bande
          // orizzontali nette. Soglie 0.40 / 0.62 → fasce sud/centro/nord
          // approssimative ma irregolari.
          const cjit = _fbm(x + 11111, y + 22222, seedCJ, 2, freqL * 3.2);
          const zone = temp + (cjit - 0.5) * 0.22;
          if (zone < 0.40)       b = B.PIANURA_N;  // marrone chiaro (nord freddo)
          else if (zone > 0.62)  b = B.PIANURA_S;  // beige caldo (sud arido)
          else                   b = B.PIANURA;    // verde chiaro (centro)
        }
        this.tiles[i] = b;
      }
    }

    // Passata 3: ROCCIA come "piedi" delle catene. I tile alti adiacenti a
    // due o più montagne diventano roccia → affioramenti grigi attorno alle
    // catene, niente più verde/marrone monolitico.
    const tilesCopy = new Uint8Array(this.tiles);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const b = tilesCopy[i];
        if (b !== B.PIANURA && b !== B.PIANURA_N && b !== B.PIANURA_S &&
            b !== B.COLLINA && b !== B.NEVE) continue;
        if ((this.elev[i] - seaLevel) < eSeaSpan * 0.18) continue;
        let adj = 0;
        for (let dy = -1; dy <= 1 && adj < 2; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (tilesCopy[ny * W + nx] === B.MONTAGNA) { adj++; if (adj >= 2) break; }
          }
        }
        if (adj >= 2) this.tiles[i] = B.ROCCIA;
      }
    }

    // Passata 4: FORESTE A GRUMI. Noise low-freq con soglia hard → cluster
    // discreti (cartografia fantasy: gruppi di alberi, non tappeto verde).
    // Possibili anche sui fianchi di montagna/roccia se molto marcate.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const b = this.tiles[i];
        if (b === B.ACQUA || b === B.GHIACCIO || b === B.FIUME ||
            b === B.PALUDE || b === B.SABBIA) continue;
        const e = this.elev[i];
        const mn = (hum[i] - mMin) / mSpan;
        const enorm = (e - eMin) / eSpanE;
        const tN = _fbm(x + 5000, y + 5000, seedT, 3, freqL * 1.6);
        let temp = (y / (H - 1)) - Math.max(0, enorm - 0.5) * 0.6 + (tN - 0.5) * 0.16;
        temp = Math.max(0, Math.min(1, temp));
        if (temp < 0.18) continue;

        const c1 = _fbm(x + 2000, y + 7000, seedFC, 3, freqC);
        const c2 = _fbm(x + 9000, y + 3000, seedFR, 2, freqC * 2.2);
        const score = c1 * 0.55 + mn * 0.25 + c2 * 0.20;
        const thr = 0.62 - forestCover * 0.35;
        if (score > thr) {
          if (b === B.MONTAGNA) {
            // Solo fianchi (ridge non al top) e grumo deciso.
            if (score > thr + 0.06 &&
                ridge[i] < ridgeMountain + (sortedR[Ntot - 1] - ridgeMountain) * 0.3) {
              this.tiles[i] = B.FORESTA;
            }
          } else if (b === B.ROCCIA) {
            if (score > thr + 0.08) this.tiles[i] = B.FORESTA;
          } else {
            this.tiles[i] = B.FORESTA;
          }
        }
      }
    }

    // Passata 5: micro-GRUMI di varietà (niente puntinismo). Pochi "semi"
    // ma ognuno cresce in mini-BFS di 3-5 tile compatibili sui vicini →
    // variazioni leggibili in gruppi, mai isolate. Include passaggi che
    // rompono la monotonia delle zone fredde (roccia/ghiaccio nella neve).
    const microRng = mulberry32((this.seed ^ 0x33333333) >>> 0);
    const plainList = [B.PIANURA, B.PIANURA_N, B.PIANURA_S];
    const growCluster = (sx, sy, fromList, to, sizeMin, sizeMax) => {
      const startIdx = sy * W + sx;
      if (fromList.indexOf(this.tiles[startIdx]) < 0) return;
      const target = sizeMin + Math.floor(microRng() * (sizeMax - sizeMin + 1));
      const seen = new Set();
      const queue = [[sx, sy]];
      let qi = 0, placed = 0;
      while (qi < queue.length && placed < target) {
        const [x, y] = queue[qi++];
        const i = y * W + x;
        if (seen.has(i)) continue;
        if (fromList.indexOf(this.tiles[i]) < 0) continue;
        seen.add(i);
        this.tiles[i] = to;
        placed++;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let k = dirs.length - 1; k > 0; k--) {
          const j = Math.floor(microRng() * (k + 1));
          [dirs[k], dirs[j]] = [dirs[j], dirs[k]];
        }
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!seen.has(ny * W + nx)) queue.push([nx, ny]);
        }
      }
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const b = this.tiles[y * W + x];
        const h = _hash2(x, y, this.seed ^ 0x33333333);
        const isPlain = (b === B.PIANURA || b === B.PIANURA_N || b === B.PIANURA_S);
        if      (isPlain          && h < 0.0030) growCluster(x, y, plainList,    B.FORESTA, 3, 5);
        else if (isPlain          && h > 0.9970) growCluster(x, y, plainList,    B.ROCCIA,  3, 5);
        else if (b === B.COLLINA  && h < 0.0045) growCluster(x, y, [B.COLLINA],  B.FORESTA, 3, 5);
        else if (b === B.COLLINA  && h > 0.9955) growCluster(x, y, [B.COLLINA],  B.ROCCIA,  3, 5);
        else if (b === B.FORESTA  && h > 0.9925) growCluster(x, y, [B.FORESTA],  B.PIANURA, 3, 5);
        else if (b === B.MONTAGNA && h < 0.0050) growCluster(x, y, [B.MONTAGNA], B.ROCCIA,  3, 5);
        // Nord: la distesa di neve riceve grumi di roccia (affioramenti) e
        // qualche piccolo lago ghiacciato → niente più bianco uniforme.
        else if (b === B.NEVE     && h < 0.0070) growCluster(x, y, [B.NEVE],     B.ROCCIA,  3, 6);
        else if (b === B.NEVE     && h > 0.9960) growCluster(x, y, [B.NEVE],     B.GHIACCIO, 4, 7);
      }
    }

    // Isolinee di altitudine: poche soglie ben evidenti (terre alte, vette).
    this.contourLevels = [q(0.65), q(0.88)];

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

  // Fiumi: random walk guidato dalla DISTANZA-DAL-MARE (BFS in tile), non
  // dal gradiente di elevazione. Risultato: percorsi serpeggianti, vari,
  // con meandri e curve, ma sempre in direzione del mare (mai si allontanano).
  _carveRivers() {
    const W = this.width, H = this.height, B = this.BIOME;
    const rng = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);

    // BFS multi-sorgente da tutte le acque → distanza in tile dal mare.
    const dist = new Int32Array(W * H);
    for (let i = 0; i < dist.length; i++) dist[i] = -1;
    const queue = [];
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.isWater(this.tiles[i])) { dist[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (dist[ni] !== -1) continue;
          dist[ni] = dist[i] + 1;
          queue.push(ni);
        }
      }
    }

    // Sorgenti: terre alte e qualche pianura/foresta in quota.
    const sources = [];
    for (let i = 0; i < this.tiles.length; i++) {
      const b = this.tiles[i];
      if (b === B.MONTAGNA || b === B.COLLINA || b === B.ROCCIA) sources.push(i);
      else if ((b === B.PIANURA || b === B.PIANURA_N || b === B.PIANURA_S ||
                b === B.FORESTA) && this.elev[i] > 0 && rng() < 0.04) {
        sources.push(i);
      }
    }
    if (!sources.length) return;
    const baseN = Math.round((W * H) / 800);
    const N = baseN + Math.floor(rng() * baseN * 0.4);

    for (let s = 0; s < N; s++) {
      const idx = sources[Math.floor(rng() * sources.length)];
      if (dist[idx] < 0) continue;     // isolata dal mare: salta
      let x = idx % W, y = (idx / W) | 0;
      const visited = new Set();
      let lastDx = 0, lastDy = 0;
      let steps = 0;
      while (steps++ < (W + H) * 2) {
        const i = y * W + x;
        if (this.isWater(this.tiles[i])) break;
        if (this.tiles[i] !== B.MONTAGNA) this.tiles[i] = B.FIUME;
        visited.add(i);
        const di = dist[i];

        // Vicini: ammessi solo quelli che NON si allontanano dal mare.
        // Tra "uguali" (stessa distanza) il random walk crea meandri.
        const cands = [];
        let totalW = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (visited.has(ni)) continue;
            const dn = dist[ni];
            if (dn < 0 || dn > di) continue;          // mai indietro
            // Peso: chi avvicina al mare è preferito, ma "uguale" è
            // ammesso → meandri. Bonus per continuità di direzione
            // (curve morbide) e jitter casuale per varieta'.
            let w = (dn < di) ? 1.6 : 0.9;
            if (dx * lastDx + dy * lastDy > 0) w *= 1.5;     // stessa direz
            else if (dx * lastDx + dy * lastDy < 0) w *= 0.3; // backtrack
            w *= 0.5 + rng() * 1.0;
            cands.push({ nx, ny, dx, dy, w });
            totalW += w;
          }
        }
        if (!cands.length) { this._makeLake(x, y); break; }
        let r = rng() * totalW;
        let pick = cands[cands.length - 1];
        for (const c of cands) { r -= c.w; if (r <= 0) { pick = c; break; } }
        lastDx = pick.dx; lastDy = pick.dy;
        x = pick.nx; y = pick.ny;
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
      const isPlainAny = (b === B.PIANURA || b === B.PIANURA_N || b === B.PIANURA_S);
      if ((b === B.COLLINA || isPlainAny) && this._far(x, y, 22)) {
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
      const okBiome = (b === B.PIANURA || b === B.PIANURA_N || b === B.PIANURA_S || b === B.FORESTA);
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
