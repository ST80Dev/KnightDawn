// Knight Dawn — percorso dei fiumi sul terreno della Scena (M6, passo 6). Modulo ES senza grafica né DOM.
//
// Il tracciato della Carta (celle da 1 km) non conosce il rilievo fine delle Scene: seguito alla lettera, il
// fiume tagliava colline in gole o scavalcava conche su terrapieni. Qui, tra due punti fissi del fiume (ricavati
// dalla Carta, ~2 km l'uno dall'altro), si cerca il percorso più conveniente sul terreno vero: costa poco
// passare in basso, molto salire sopra il livello atteso dell'acqua; il fiume va per conche e selle e gira
// attorno alle alture. Il percorso resta in un corridoio attorno al tracciato della Carta, che lo attira un
// poco (in pianura, dove il terreno non decide, tiene le anse della Carta).
//
// Funzione pura: stessi punti e stessa funzione di quota → stesso percorso, chiunque lo chieda (le Scene vicine
// e l'orizzonte combaciano).

export const PERCORSO = {
  cella: 40,            // m: passo della griglia su cui si cerca il percorso
  corridoio: 800,       // m: distanza massima dal tracciato della Carta
  dislivello: 6,        // m: salire di tanto sopra il livello atteso raddoppia il costo (cresce col quadrato)
  attrazione: 3,        // costo in più al bordo del corridoio (cresce col quadrato della distanza): con poco
                        // richiamo, in pianura il percorso più corto era una retta e perdeva le anse della Carta
  // Fondovalle (segnalato dall'utente: fiumi a mezza costa su terrapieni): costa stare dove a fianco il terreno
  // scende più in basso (non si è sul fondo): (quota − minimo dei vicini a `fondo.distanza` m) / `fondo.metri`, al quadrato.
  fondo: { distanza: 80, metri: 1 },
  passo: 20,            // m: distanza tra i punti del percorso finale
  liscia: [3, 2],       // media mobile su ±5 punti (~200 m), 4 passate: via i gradini della griglia
};

/**
 * Percorso tra due punti fissi.
 * @param {Float64Array} px, pz  tracciato della Carta tra i due punti (m), estremi compresi
 * @param {Float64Array} pref  quota attesa del terreno accanto all'acqua in ogni punto del tracciato (m)
 * @param {{x:number, z:number}} A, B  punti fissi
 * @param {(x:number, z:number) => number} quota  quota del terreno senza fiumi
 * @returns {{ x: Float64Array, z: Float64Array, t: Float64Array, h: Float64Array }|null}  punti del percorso,
 *   posizione relativa lungo il tratto (0–1) e quota del terreno; null se il corridoio non collega A e B
 */
export function tracciaPercorso(px, pz, pref, A, B, quota, P = PERCORSO) {
  const n = px.length;
  // Lunghezze cumulate del tracciato, per la posizione relativa di ogni cella.
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
  const tot = cum[n - 1] || 1;
  let x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), z0 = Math.min(A.z, B.z), z1 = Math.max(A.z, B.z);
  for (let i = 0; i < n; i++) {
    if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i];
    if (pz[i] < z0) z0 = pz[i]; if (pz[i] > z1) z1 = pz[i];
  }
  const g = P.cella, W = P.corridoio;
  x0 -= W; z0 -= W;
  const nx = Math.ceil((x1 + W - x0) / g) + 1, nz = Math.ceil((z1 + W - z0) / g) + 1;
  const N = nx * nz;
  // Corridoio: per ogni segmento del tracciato, le celle vicine; si tiene il segmento più vicino.
  const d2 = new Float64Array(N).fill(Infinity), tc = new Float64Array(N), rc = new Float64Array(N);
  for (let i = 0; i < n - 1; i++) {
    const vx = px[i + 1] - px[i], vz = pz[i + 1] - pz[i], l2 = vx * vx + vz * vz;
    const c0 = Math.max(0, Math.floor((Math.min(px[i], px[i + 1]) - W - x0) / g));
    const c1 = Math.min(nx - 1, Math.ceil((Math.max(px[i], px[i + 1]) + W - x0) / g));
    const r0 = Math.max(0, Math.floor((Math.min(pz[i], pz[i + 1]) - W - z0) / g));
    const r1 = Math.min(nz - 1, Math.ceil((Math.max(pz[i], pz[i + 1]) + W - z0) / g));
    for (let r = r0; r <= r1; r++) {
      const z = z0 + r * g;
      for (let c = c0; c <= c1; c++) {
        const x = x0 + c * g, k = r * nx + c;
        let u = l2 > 0 ? ((x - px[i]) * vx + (z - pz[i]) * vz) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = x - px[i] - vx * u, dz = z - pz[i] - vz * u, d = dx * dx + dz * dz;
        if (d < d2[k]) {
          d2[k] = d; tc[k] = (cum[i] + (cum[i + 1] - cum[i]) * u) / tot; rc[k] = pref[i] + (pref[i + 1] - pref[i]) * u;
        }
      }
    }
  }
  const costo = new Float64Array(N).fill(Infinity), hq = new Float64Array(N).fill(NaN);
  for (let k = 0; k < N; k++) if (d2[k] <= W * W) hq[k] = quota(x0 + (k % nx) * g, z0 + ((k / nx) | 0) * g);
  const passiFondo = Math.max(1, Math.round(P.fondo.distanza / g));
  for (let k = 0; k < N; k++) {
    if (Number.isNaN(hq[k])) continue;
    const c = k % nx, r = (k / nx) | 0, h = hq[k];
    const sopra = Math.max(0, h - rc[k]) / P.dislivello;
    const via = Math.sqrt(d2[k]) / W;
    let minimo = h;
    for (let b = -passiFondo; b <= passiFondo; b += passiFondo) for (let a = -passiFondo; a <= passiFondo; a += passiFondo) {
      const cc = c + a, rr = r + b;
      if ((a || b) && cc >= 0 && rr >= 0 && cc < nx && rr < nz) {
        const v = hq[rr * nx + cc];
        if (v < minimo) minimo = v;
      }
    }
    const fondo = (h - minimo) / P.fondo.metri;
    costo[k] = 1 + sopra * sopra + fondo * fondo + P.attrazione * via * via;
  }
  const cellaDi = (x, z) => {
    const c = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / g)));
    const r = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / g)));
    return r * nx + c;
  };
  const sA = cellaDi(A.x, A.z), sB = cellaDi(B.x, B.z);
  if (!Number.isFinite(costo[sA])) costo[sA] = 1;
  if (!Number.isFinite(costo[sB])) costo[sB] = 1;
  // Dijkstra con coda a heap binario.
  const dist = new Float64Array(N).fill(Infinity), da = new Int32Array(N).fill(-1);
  const heapK = new Int32Array(N * 4), heapD = new Float64Array(N * 4);
  let hn = 0;
  const spingi = (k, d) => {
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapD[p] <= d) break;
      heapK[i] = heapK[p]; heapD[i] = heapD[p]; i = p;
    }
    heapK[i] = k; heapD[i] = d;
  };
  const togli = () => {
    const k = heapK[0];
    const lk = heapK[--hn], ld = heapD[hn];
    let i = 0;
    for (;;) {
      let f = 2 * i + 1;
      if (f >= hn) break;
      if (f + 1 < hn && heapD[f + 1] < heapD[f]) f++;
      if (heapD[f] >= ld) break;
      heapK[i] = heapK[f]; heapD[i] = heapD[f]; i = f;
    }
    heapK[i] = lk; heapD[i] = ld;
    return k;
  };
  dist[sA] = 0;
  spingi(sA, 0);
  // 16 direzioni (anche le mosse «a cavallo»): meno tratti dritti e angoli a 45°.
  const DC = [1, -1, 0, 0, 1, 1, -1, -1, 2, 2, -2, -2, 1, 1, -1, -1];
  const DR = [0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 2, -2, 2, -2];
  const LUNGO = DC.map((c, v) => Math.hypot(c, DR[v]));
  while (hn > 0) {
    const dk = heapD[0], k = togli();
    if (dk > dist[k]) continue;
    if (k === sB) break;
    const r = (k / nx) | 0, c = k - r * nx;
    for (let v = 0; v < 16; v++) {
      const cc = c + DC[v], rr = r + DR[v];
      if (cc < 0 || rr < 0 || cc >= nx || rr >= nz) continue;
      const kk = rr * nx + cc;
      if (!Number.isFinite(costo[kk])) continue;
      if (v >= 8) {                                  // mossa lunga: la cella a metà strada dev'essere nel corridoio
        const km = (r + Math.round(DR[v] / 2)) * nx + c + Math.round(DC[v] / 2);
        if (!Number.isFinite(costo[km])) continue;
      }
      const passo = LUNGO[v] * g * 0.5 * (costo[k] + costo[kk]);
      const nd = dk + passo;
      if (nd < dist[kk]) { dist[kk] = nd; da[kk] = k; if (hn < heapK.length) spingi(kk, nd); }
    }
  }
  if (!Number.isFinite(dist[sB])) return null;
  // Percorso a gradini (centri delle celle), estremi esatti.
  const cammino = [];
  for (let k = sB; k !== -1; k = da[k]) cammino.push(k);
  cammino.reverse();
  let xs = cammino.map((k) => x0 + (k % nx) * g), zs = cammino.map((k) => z0 + ((k / nx) | 0) * g);
  let ts = cammino.map((k) => tc[k]);
  xs[0] = A.x; zs[0] = A.z; ts[0] = 0;
  xs[xs.length - 1] = B.x; zs[zs.length - 1] = B.z; ts[ts.length - 1] = 1;
  // Punti a passo costante, poi media mobile con estremi fissi: toglie i gradini della griglia.
  {
    const rx = [xs[0]], rz = [zs[0]], rt = [ts[0]];
    let resto = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const l = Math.hypot(xs[i + 1] - xs[i], zs[i + 1] - zs[i]);
      let u = P.passo - resto;
      while (u <= l) {
        const f = u / l;
        rx.push(xs[i] + (xs[i + 1] - xs[i]) * f); rz.push(zs[i] + (zs[i + 1] - zs[i]) * f); rt.push(ts[i] + (ts[i + 1] - ts[i]) * f);
        u += P.passo;
      }
      resto = l - (u - P.passo);
    }
    rx.push(xs[xs.length - 1]); rz.push(zs[zs.length - 1]); rt.push(ts[ts.length - 1]);
    xs = rx; zs = rz; ts = rt;
    const [R, passate] = P.liscia;
    for (let it = 0; it < passate; it++) {
      const nxs = xs.slice(), nzs = zs.slice();
      for (let i = 1; i < xs.length - 1; i++) {
        const r = Math.min(R, i, xs.length - 1 - i);
        let sx = 0, sz = 0;
        for (let j = i - r; j <= i + r; j++) { sx += xs[j]; sz += zs[j]; }
        nxs[i] = sx / (2 * r + 1); nzs[i] = sz / (2 * r + 1);
      }
      xs = nxs; zs = nzs;
    }
  }
  // Posizione relativa monotona (serve a interpolare larghezza e profondità lungo il tratto).
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1]) ts[i] = ts[i - 1];
  const m = xs.length;
  const out = { x: Float64Array.from(xs), z: Float64Array.from(zs), t: Float64Array.from(ts), h: new Float64Array(m) };
  for (let i = 0; i < m; i++) out.h[i] = quota(out.x[i], out.z[i]);
  return out;
}

/**
 * Letto lungo un percorso: la successione non crescente più vicina (minimi quadrati) ai valori `y` (terreno
 * meno profondità e sponde), tra `alto` e `basso`, con gli estremi fissi. Così il fiume scava i dossi e colma
 * le conche lungo la via quanto basta, invece di scavare sempre fino al punto più basso già passato.
 */
export function lettoMonotono(y, alto, basso) {
  const n = y.length;
  // Pool adjacent violators per una successione non crescente.
  const val = [], peso = [], fine = [];
  for (let i = 0; i < n; i++) {
    let v = Math.min(alto, Math.max(basso, y[i])), w = 1, f = i;
    while (val.length && val[val.length - 1] < v) {
      const pv = val.pop(), pw = peso.pop(); fine.pop();
      v = (v * w + pv * pw) / (w + pw); w += pw;
    }
    val.push(v); peso.push(w); fine.push(f);
  }
  const out = new Float64Array(n);
  let i = 0;
  for (let b = 0; b < val.length; b++) for (; i <= fine[b]; i++) out[i] = val[b];
  // Mai sopra il terreno incontrato (segnalato dall'utente: nelle conche lungo la via la media lasciava il fiume
  // sospeso su un terrapieno): dove serve si scende, e da lì in giù il letto non risale.
  let tetto = alto;
  for (let k = 0; k < n; k++) {
    tetto = Math.min(tetto, out[k], Math.max(basso, Math.min(alto, y[k])));
    out[k] = tetto;
  }
  out[0] = alto; out[n - 1] = basso;
  return out;
}
