// Knight Dawn — strade e sentieri del mondo generato (piano «Strade e sentieri» in docs/ESPLORAZIONE_3D.md).
// Modulo ES senza Three.js né DOM: gira nel Worker (rete sulla Carta) e nella pagina (tracciato fine nelle Scene).
//
// Due scale, come i fiumi:
// 1. `aggiungiStrade(carta)`: la RETE sulle celle di 1 km. Nodi: porte dei borghi, valichi con le due valli,
//    abitati provvisori (siti candidati non usati, finché non ci saranno i villaggi), cime panoramiche e forcelle
//    (sentieri). Albero di copertura minimo sui costi di viaggio più gli anelli utili; i tratti si tracciano dal
//    più importante e i passi già su strada costano meno, così le strade si uniscono in tronchi comuni.
// 2. `raffinaStrade` / `spianaStrade` / `distanzaStrada`: il TRACCIATO fine nelle Scene, a tratti di ~4 km tra
//    punti fissi della rete, su una griglia di 20 m in un corridoio attorno alla rete. Oltre la pendenza massima
//    della classe il passo costa moltissimo: il percorso gira, e nascono i tornanti.
//
// Costo di un passo: lunghezza × (1 + (p / p₀)²), con p la pendenza lungo il passo: un po' di salita costa poco,
// molta salita molto (corto ma non ripido). Sulla Carta (celle di 1 km i tornanti non si vedono) un dislivello
// oltre la pendenza massima conta come la strada a tornanti che servirebbe: dislivello / p_max × `tornanti`.

import { BIOMA, ACQUA } from './carta.js';
import { quotaMondo, scavaFiumi, livelloLago, distanzaPiano, raffinaZona } from './scena.js';
import { smoothstep } from './rumore.js';

export const STRADE = {
  // Classi [Ipotesi del piano, da tarare guardando]: pendenza comoda p0, massima pmax, semilarghezza (m).
  classi: {
    // banchina (m per lato): oltre la carreggiata il terreno resta alla quota della strada prima della scarpata
    // [richiesto dall'utente: «la strada scavi un piano nel rilievo», niente carreggiata inclinata di traverso]. Con
    // la griglia del blocco a 7,8 m, carreggiata + banchina ≥ ~7 m per le strade da carro: almeno una fila di
    // vertici piana per lato. Stretta per mulattiere e sentieri (non scavano terrazze).
    maestra: { p0: 0.05, pmax: 0.10, semi: 2.25, banchina: 5, nome: 'strada maestra' },
    carrareccia: { p0: 0.07, pmax: 0.14, semi: 1.5, banchina: 5, nome: 'carrareccia' },
    mulattiera: { p0: 0.12, pmax: 0.25, semi: 1.0, banchina: 2.5, nome: 'mulattiera' },
    sentiero: { p0: 0.20, pmax: 0.45, semi: 0.6, banchina: 1.2, nome: 'sentiero' },
  },
  carta: {
    tornanti: 1.2,              // un dislivello oltre pmax costa come la strada a tornanti (× questo)
    biomi: { [BIOMA.PALUDE]: 3, [BIOMA.FORESTA]: 1.15, [BIOMA.ROCCIA]: 1.6, [BIOMA.NEVE]: 3, [BIOMA.GHIACCIO]: 4, [BIOMA.SABBIA]: 1.3 },
    asprezza: 3,                // gruppi montuosi: costo × (1 + asprezza·a); pareti (a > 0,5) vietate
    // Rilievo dentro la cella [segnalato dall'utente: una strada restava su un altopiano tutto gobbe invece di
    // scendere a fondovalle]: la quota della Carta è una per km, il rilievo vero no. `ruvido`: pendenza media del
    // rilievo delle Scene (quotaMondo) su campioni a `passo` m nella cella; costo × (1 + peso·(ruvido/p0)²), al più
    // `massimo`. Nei fondovalle ~1–3 %, sugli altopiani aspri 20–40 %.
    ruvido: { campioni: 6, peso: 0.5, massimo: 25 },
    guado: 300,                 // m equivalenti per attraversare un corso d'acqua che si guada
    ponte: 600,                 // m equivalenti per un ponte nuovo: 2–4 ponti per mondo (aggirare un fiume costa poco)
    ponteEsistente: 150,
    riuso: 0.55,                // passo già su strada: costo × questo
    abitati: { distanza: 12, massimo: 20 },   // km tra i nodi; abitati provvisori al più
    anelli: { rapporto: 1.6, entro: 25000 }, // collegamento in più se il giro sulla rete supera 1,6× il diretto
    quotaMulattiera: 1500, quotaSentiero: 2100,   // m: tratti che salgono oltre diventano mulattiera / sentiero
    cime: { numero: 4, raggio: 6, quota: 1100, distanza: 10 },   // sentieri alle cime panoramiche
  },
  scena: {
    tratto: 4,                  // celle della rete tra due punti fissi (~4 km)
    cella: 20,                  // m: griglia del tracciato fine
    corridoio: 450,             // m dalla rete
    attrazione: 0.6,            // costo in più al bordo del corridoio (cresce col quadrato)
    oltre: 6,                   // oltre pmax il costo cresce di × (1 + oltre·(p − pmax)/pmax): gli strappi brevi si
                                // accettano, le salite lunghe e ripide si girano (tornanti)
    fisso: { raggio: 150, passo: 50 },   // m: il punto fisso tra due tratti si sposta sul terreno più dolce vicino
    svolta: 60,                 // m equivalenti per un'inversione (180°), in proporzione per angoli minori: lati
                                // dei tornanti lunghi, niente denti di sega su un pendio uniforme
    acqua: 40,                  // attraversare acqua non guadabile: × questo per metro (il ponte più corto)
    guado: 4,
    passo: 5,                   // m tra i punti del tracciato finale
    liscia: [3, 2],             // media mobile ±3 punti, 2 passate (toglie i gradini senza tagliare i tornanti)
    portaDritta: 30,            // m: tratto dritto lungo la normale della porta di un borgo, fino alla porta
    lisciaTerreno: 2,           // passate di media 3×3 sulle quote della griglia prima di cercare il percorso
    profilo: [5, 3],            // quota della strada: media mobile ±5 punti (25 m), 3 passate
    scarpata: 0.6,              // pendenza massima delle scarpate di taglio e di riporto (~31°)
    raccordo: 18,               // m oltre il bordo entro cui il terreno segue la strada
    ritorno: 10,                // m per tornare al terreno naturale
    cellaIndice: 100,
    zona: 1600,                 // m: tratti raffinati attorno al centro del blocco
  },
};

const DX = [1, -1, 0, 0, 1, 1, -1, -1, 2, 2, -2, -2, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 2, -2, 2, -2];
const LUNGO = DX.map((c, v) => Math.hypot(c, DY[v]));

// ─── Coda di priorità (heap binario) ───────────────────────────────────────

function nuovaCoda(capacita) {
  let K = new Int32Array(capacita), D = new Float64Array(capacita), n = 0;
  return {
    get vuota() { return n === 0; },
    get testa() { return D[0]; },
    spingi(k, d) {
      if (n === K.length) {
        const K2 = new Int32Array(n * 2), D2 = new Float64Array(n * 2);
        K2.set(K); D2.set(D); K = K2; D = D2;
      }
      let i = n++;
      while (i > 0) { const p = (i - 1) >> 1; if (D[p] <= d) break; K[i] = K[p]; D[i] = D[p]; i = p; }
      K[i] = k; D[i] = d;
    },
    togli() {
      const k = K[0], lk = K[--n], ld = D[n];
      let i = 0;
      for (;;) {
        let f = 2 * i + 1;
        if (f >= n) break;
        if (f + 1 < n && D[f + 1] < D[f]) f++;
        if (D[f] >= ld) break;
        K[i] = K[f]; D[i] = D[f]; i = f;
      }
      K[i] = lk; D[i] = ld;
      return k;
    },
  };
}

// ─── 1. Rete sulla Carta ────────────────────────────────────────────────────

// Mosse sulla Carta: le 16 della Scena più i salti dritti di 2 celle, che scavalcano un fiume largo una cella.
// Per ciascuna, le celle che la mossa sorvola (devono essere terra; un fiume grande sorvolato è un ponte).
const MX = [...DX, 2, -2, 0, 0, 2, 2, -2, -2];
const MY = [...DY, 0, 0, 2, -2, 2, -2, 2, -2];
const ML = MX.map((c, v) => Math.hypot(c, MY[v]));
const SORVOLA = MX.map((dx, v) => {
  const dy = MY[v], ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  if (ax + ay <= 1) return [];
  if (ax === 1 && ay === 1) return [[sx, 0], [0, sy]];
  if (ax === 2 && ay === 1) return [[sx, 0], [sx, sy]];
  if (ax === 1 && ay === 2) return [[0, sy], [sx, sy]];
  if (ax === 2 && ay === 0) return [[sx, 0]];
  if (ax === 0 && ay === 2) return [[0, sy]];
  return [[sx, sy]];                                  // 2, 2
});

/**
 * Corso d'acqua attraversato dalla mossa i → j (mossa v): un fiume grande sorvolato (le sue celle non si
 * calpestano: si passa solo scavalcandolo, cioè con un ponte), o un torrente nella cella d'arrivo o sorvolato con la
 * corrente di traverso alla mossa (guado). Restituisce la cella con il bacino più grande, o -1.
 */
function attraversamento(carta, i, j, v) {
  const { cols, bacino, ricevente, sogliaTorrente, sogliaFiume } = carta;
  const xi = i % cols, yi = (i / cols) | 0;
  let migliore = -1;
  const prova = (k, sorvolata) => {
    if (bacino[k] < sogliaTorrente || ricevente[k] < 0) return;
    let conta = sorvolata && bacino[k] >= sogliaFiume;
    if (!conta) {
      const r = ricevente[k];
      const fx = (r % cols) - (k % cols), fy = ((r / cols) | 0) - ((k / cols) | 0);
      conta = Math.abs(MX[v] * fx + MY[v] * fy) / (ML[v] * (Math.hypot(fx, fy) || 1)) < 0.7;
    }
    if (conta && (migliore < 0 || bacino[k] > bacino[migliore])) migliore = k;
  };
  prova(j, false);
  for (const [ox, oy] of SORVOLA[v]) prova((yi + oy) * cols + xi + ox, true);
  return migliore;
}

/**
 * Costi della Carta per una classe: funzione (da, a, mossa) → m equivalenti, o Infinity. Le celle dei fiumi grandi
 * non si calpestano (tranne quelle in `permesse`, i nodi): la strada li costeggia e li passa su un ponte.
 */
function costiCarta(carta, classe, stato, permesse = null, ruvido = null) {
  const { cols, quota, mare, acque, bioma, bacino, sogliaFiume, asprezza, cella } = carta;
  const C = STRADE.carta, K = STRADE.classi[classe];
  const fr = ruvido && new Float32Array(ruvido.length);
  if (fr) for (let i = 0; i < fr.length; i++) { const r = ruvido[i] / K.p0; fr[i] = Math.min(C.ruvido.massimo, 1 + C.ruvido.peso * r * r); }
  const vietata = (i) => mare[i] || (acque && acque[i] !== ACQUA.TERRA) || (asprezza && asprezza[i] > 0.5);
  return (i, j, v) => {
    if (vietata(j) || (bacino[j] >= sogliaFiume && !(permesse && permesse.has(j)))) return Infinity;
    const xi = i % cols, yi = (i / cols) | 0;
    for (const [ox, oy] of SORVOLA[v]) if (vietata((yi + oy) * cols + xi + ox)) return Infinity;
    const L = ML[v] * cella, dh = Math.abs(quota[j] - quota[i]), p = dh / L;
    const Leff = p > K.pmax ? dh / K.pmax * C.tornanti : L;
    const pp = Math.min(p, K.pmax) / K.p0;
    let c = Leff * (1 + pp * pp) * (C.biomi[bioma[j]] ?? 1) * (1 + C.asprezza * (asprezza ? asprezza[j] : 0));
    if (fr) c *= 0.5 * (fr[i] + fr[j]);
    if (stato && stato.strada[i] && stato.strada[j]) c *= C.riuso;
    // Attraversare un corso d'acqua: guado o ponte.
    const f = attraversamento(carta, i, j, v);
    if (f >= 0) c += bacino[f] < sogliaFiume ? C.guado : stato && stato.ponti.has(f) ? C.ponteEsistente : C.ponte;
    return c;
  };
}

/** Pendenza media del rilievo delle Scene dentro ogni cella (campioni a griglia, differenze tra vicini). */
function ruvidezza(carta) {
  const { cols, rows, cella, mare } = carta, m = STRADE.carta.ruvido.campioni, passo = cella / (m - 1);
  const out = new Float32Array(cols * rows), h = new Float64Array(m * m);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (mare[i]) continue;
      for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) h[b * m + a] = quotaMondo(carta, x * cella + a * passo, y * cella + b * passo);
      let s = 0;
      for (let b = 0; b < m; b++) for (let a = 0; a < m - 1; a++) s += Math.abs(h[b * m + a + 1] - h[b * m + a]) + Math.abs(h[(a + 1) * m + b] - h[a * m + b]);
      out[i] = s / (2 * m * (m - 1) * passo);
    }
  }
  return out;
}

/** Dijkstra sulle celle della Carta da più sorgenti; si ferma al bersaglio se c'è. */
function cammini(carta, sorgenti, costo, bersaglio = -1) {
  const { cols, rows } = carta, n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity), da = new Int32Array(n).fill(-1);
  const coda = nuovaCoda(4096);
  for (const s of sorgenti) { dist[s] = 0; coda.spingi(s, 0); }
  while (!coda.vuota) {
    const d = coda.testa, k = coda.togli();
    if (d > dist[k]) continue;
    if (k === bersaglio) break;
    const x = k % cols, y = (k / cols) | 0;
    for (let v = 0; v < MX.length; v++) {
      const xx = x + MX[v], yy = y + MY[v];
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const kk = yy * cols + xx, c = costo(k, kk, v);
      if (c === Infinity) continue;
      const nd = d + c;
      if (nd < dist[kk]) { dist[kk] = nd; da[kk] = k; coda.spingi(kk, nd); }
    }
  }
  return { dist, da };
}

function percorsoDa(da, bersaglio) {
  const p = [];
  for (let k = bersaglio; k !== -1; k = da[k]) p.push(k);
  return p.reverse();
}

/** Nodi della rete (coordinate in km della Carta, come i fiumi). */
function nodiRete(carta) {
  const { cols, rows, mare, acque, cella } = carta;
  const terra = (x, y) => {
    const i = Math.floor(y) * cols + Math.floor(x);
    return x >= 0 && y >= 0 && x < cols && y < rows && !mare[i] && (!acque || acque[i] === ACQUA.TERRA);
  };
  const nodi = [];
  const aggiungi = (x, y, tipo, extra = {}) => {
    if (!terra(x, y)) return -1;
    nodi.push({ id: nodi.length, x, y, tipo, ...extra });
    return nodi.length - 1;
  };
  for (const l of carta.luoghi ?? []) {
    const p = l.porta ?? { x: l.x, z: l.z };
    aggiungi(p.x / cella, p.z / cella, 'rocca', { luogo: l.id });
  }
  const valichi = [];
  for (const v of carta.valichi ?? []) {
    const a = aggiungi(v.x, v.y, 'valico', { valico: v.id });
    if (a < 0) continue;
    const valli = v.valli.map((w) => aggiungi(w.x, w.y, 'valle', { valico: v.id }));
    valichi.push({ nodo: a, valli: valli.filter((k) => k >= 0) });
  }
  // Abitati provvisori: i siti candidati non scelti per le rocche, lontani dagli altri nodi. Tengono il posto dei
  // villaggi (milestone dei luoghi): la rete collega già colline e pianure, e si infittirà con i luoghi veri.
  const A = STRADE.carta.abitati;
  const candidati = [...(carta.candidatiLuoghi ?? [])].sort((a, b) => b.punteggio - a.punteggio);
  let abitati = 0;
  for (const c of candidati) {
    if (abitati >= A.massimo) break;
    const x = c.x / cella, y = c.z / cella;
    if (nodi.some((n) => Math.hypot(n.x - x, n.y - y) < A.distanza)) continue;
    if (aggiungi(x, y, 'abitato', { provvisorio: true }) >= 0) abitati++;
  }
  return { nodi, valichi };
}

/** Cime panoramiche per i sentieri: massimi locali alti, lontani tra loro, fuori dalle pareti. */
function cime(carta) {
  const { cols, rows, quota, mare, asprezza } = carta, C = STRADE.carta.cime;
  const out = [];
  for (let y = C.raggio; y < rows - C.raggio; y++) {
    for (let x = C.raggio; x < cols - C.raggio; x++) {
      const i = y * cols + x, q = quota[i];
      if (q < C.quota || mare[i] || (asprezza && asprezza[i] > 0.5)) continue;
      let massimo = true;
      for (let b = -C.raggio; b <= C.raggio && massimo; b++) {
        for (let a = -C.raggio; a <= C.raggio; a++) if ((a || b) && quota[(y + b) * cols + x + a] > q) { massimo = false; break; }
      }
      if (massimo) out.push({ x: x + 0.5, y: y + 0.5, q });
    }
  }
  out.sort((a, b) => b.q - a.q);
  const scelte = [];
  for (const c of out) {
    if (scelte.length >= C.numero) break;
    if (scelte.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= C.distanza)) scelte.push(c);
  }
  return scelte;
}

/**
 * Rete delle strade sulla Carta: aggiunge `carta.strade` = { nodi, archi, ponti, info }. Ogni arco ha la classe,
 * i nodi agli estremi (o -1 per un sentiero che parte dalla rete) e il percorso in coordinate della Carta (km, come
 * i fiumi): `x`, `y` (Float32Array), primo e ultimo punto esatti sui nodi.
 */
export function aggiungiStrade(carta) {
  const t0 = performance.now();
  const { cols, rows, quota } = carta, n = cols * rows, C = STRADE.carta;
  const cellaDi = (x, y) => Math.min(rows - 1, Math.floor(y)) * cols + Math.min(cols - 1, Math.floor(x));
  const { nodi, valichi } = nodiRete(carta);
  const N = nodi.length;
  // Costi diretti tra tutti i nodi (carrareccia, senza riuso).
  const permesse = new Set(nodi.map((k) => cellaDi(k.x, k.y)));   // i nodi si raggiungono anche sui fiumi
  const ruvido = ruvidezza(carta);
  const base = costiCarta(carta, 'carrareccia', null, permesse, ruvido);
  const diretti = Array.from({ length: N }, () => new Float64Array(N).fill(Infinity));
  for (let a = 0; a < N; a++) {
    const { dist } = cammini(carta, [cellaDi(nodi[a].x, nodi[a].y)], base);
    for (let b = 0; b < N; b++) diretti[a][b] = dist[cellaDi(nodi[b].x, nodi[b].y)];
  }
  // Albero di copertura minimo (Kruskal), poi gli anelli utili.
  const coppie = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (Number.isFinite(diretti[a][b])) coppie.push([diretti[a][b], a, b]);
  coppie.sort((u, v) => u[0] - v[0]);
  const padre = Array.from({ length: N }, (_, i) => i);
  const radice = (i) => (padre[i] === i ? i : (padre[i] = radice(padre[i])));
  const scelti = [];
  for (const [d, a, b] of coppie) {
    const ra = radice(a), rb = radice(b);
    if (ra === rb) continue;
    padre[ra] = rb; scelti.push([a, b]);
  }
  // Valichi: il valico si collega sempre alle sue due valli (è la via tra le valli).
  for (const v of valichi) for (const w of v.valli) if (!scelti.some(([a, b]) => (a === v.nodo && b === w) || (a === w && b === v.nodo))) scelti.push([v.nodo, w]);
  const sulGrafo = () => {                            // distanze sul grafo dei collegamenti scelti (Floyd)
    const D = Array.from({ length: N }, (_, a) => Float64Array.from({ length: N }, (_, b) => (a === b ? 0 : Infinity)));
    for (const [a, b] of scelti) D[a][b] = D[b][a] = Math.min(D[a][b], diretti[a][b]);
    for (let k = 0; k < N; k++) for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (D[a][k] + D[k][b] < D[a][b]) D[a][b] = D[a][k] + D[k][b];
    return D;
  };
  let G = sulGrafo();
  for (const [d, a, b] of coppie) {
    if (d > C.anelli.entro) break;
    if (G[a][b] > C.anelli.rapporto * d) { scelti.push([a, b]); G = sulGrafo(); }
  }
  // Classe: tra rocche e valichi strade maestre, il resto carrarecce; poi la quota decide mulattiere e sentieri.
  const importante = (k) => nodi[k].tipo === 'rocca' || nodi[k].tipo === 'valico';
  const ordine = scelti.map(([a, b]) => ({ a, b, classe: importante(a) && importante(b) ? 'maestra' : 'carrareccia', d: diretti[a][b] }))
    .sort((u, v) => (u.classe === v.classe ? u.d - v.d : u.classe === 'maestra' ? -1 : 1));
  const stato = { strada: new Uint8Array(n), ponti: new Set() };
  const archi = [], ponti = [];
  let guadi = 0;
  const registra = (celle, classe, da, a, inizio, fine) => {
    for (let s = 1; s < celle.length; s++) {
      const i = celle[s - 1], j = celle[s];
      const v = MX.findIndex((dx, w) => dx === (j % cols) - (i % cols) && MY[w] === ((j / cols) | 0) - ((i / cols) | 0));
      if (v < 0) continue;
      // Ponti e guadi: dove il passo attraversa un corso d'acqua (stessa regola del costo).
      const f = attraversamento(carta, i, j, v);
      if (f < 0) continue;
      if (carta.bacino[f] >= carta.sogliaFiume) {
        if (!stato.ponti.has(f)) { stato.ponti.add(f); ponti.push({ x: (f % cols) + 0.5, y: ((f / cols) | 0) + 0.5, bacino: carta.bacino[f] }); }
      } else guadi++;
    }
    for (const k of celle) stato.strada[k] = 1;
    const x = new Float32Array(celle.length), y = new Float32Array(celle.length);
    celle.forEach((k, s) => { x[s] = (k % cols) + 0.5; y[s] = ((k / cols) | 0) + 0.5; });
    if (inizio) { x[0] = inizio.x; y[0] = inizio.y; }
    if (fine) { x[celle.length - 1] = fine.x; y[celle.length - 1] = fine.y; }
    let qMax = -Infinity;
    for (const k of celle) qMax = Math.max(qMax, quota[k]);
    archi.push({ id: archi.length, classe, da, a, x, y, quotaMassima: qMax });
  };
  const traccia = (classe, sorgenti, bersaglio) => {
    const { dist, da } = cammini(carta, sorgenti, costiCarta(carta, classe, stato, permesse, ruvido), bersaglio);
    return Number.isFinite(dist[bersaglio]) ? percorsoDa(da, bersaglio) : null;
  };
  for (const e of ordine) {
    const A = nodi[e.a], B = nodi[e.b], sa = cellaDi(A.x, A.y), sb = cellaDi(B.x, B.y);
    let classe = e.classe, celle = traccia(classe, [sa], sb);
    if (!celle) continue;
    let qMax = Math.max(...celle.map((k) => quota[k]));
    if (qMax > C.quotaMulattiera) {                 // in quota: mulattiera, o sentiero se molto in alto
      classe = qMax > C.quotaSentiero ? 'sentiero' : 'mulattiera';
      celle = traccia(classe, [sa], sb) ?? celle;
    }
    registra(celle, classe, e.a, e.b, A, B);
  }
  // Sentieri dalla rete alle cime panoramiche e alle forcelle dei gruppi montuosi.
  const mete = cime(carta).map((c) => ({ ...c, tipo: 'cima' }));
  for (const g of carta.massicci ?? []) for (const f of g.forcelle) mete.push({ x: f.x, y: f.y, tipo: 'forcella' });
  for (const m of mete) {
    const sorgenti = [];
    for (let k = 0; k < n; k++) if (stato.strada[k]) sorgenti.push(k);
    if (!sorgenti.length) break;
    const bersaglio = cellaDi(m.x, m.y);
    permesse.add(bersaglio);
    const celle = traccia('sentiero', sorgenti, bersaglio);
    if (!celle || celle.length < 2) continue;
    const id = nodi.length;
    nodi.push({ id, x: m.x, y: m.y, tipo: m.tipo });
    registra(celle, 'sentiero', -1, id, null, m);
  }
  const rami = ramiRete(carta, archi, nodi);
  const km = {};
  for (const a of rami) {
    let l = 0;
    for (let s = 1; s < a.x.length; s++) l += Math.hypot(a.x[s] - a.x[s - 1], a.y[s] - a.y[s - 1]);
    km[a.classe] = (km[a.classe] ?? 0) + l * carta.cella / 1000;
  }
  carta.strade = { nodi, archi, rami, ponti, info: { rami: rami.length, nodi: N, archi: archi.length, ponti: ponti.length, guadi, km, ms: performance.now() - t0 } };
  return carta;
}

const RANGO = { maestra: 3, carrareccia: 2, mulattiera: 1, sentiero: 0 };
const PER_RANGO = ['sentiero', 'mulattiera', 'carrareccia', 'maestra'];

/**
 * Rami della rete: i pezzi di strada unici tra due incroci (o estremi). Più archi possono passare per le stesse celle
 * (le strade si uniscono in tronchi comuni): nella Scena ogni tronco si traccia una volta sola, con la classe più
 * importante tra quelle che lo usano. Coordinate della Carta (km), estremi esatti sui nodi.
 */
function ramiRete(carta, archi, nodi) {
  const { cols } = carta;
  const cellaDi = (x, y) => Math.floor(y) * cols + Math.floor(x);
  const rango = new Map(), vicini = new Map();
  const lega = (a, b, r) => {
    const k = a < b ? a * 1e6 + b : b * 1e6 + a;
    rango.set(k, Math.max(rango.get(k) ?? -1, r));
    if (!vicini.has(a)) vicini.set(a, new Set());
    if (!vicini.has(b)) vicini.set(b, new Set());
    vicini.get(a).add(b); vicini.get(b).add(a);
  };
  for (const a of archi) {
    for (let s = 1; s < a.x.length; s++) {
      const i = cellaDi(a.x[s - 1], a.y[s - 1]), j = cellaDi(a.x[s], a.y[s]);
      if (i !== j) lega(i, j, RANGO[a.classe]);
    }
  }
  const esatti = new Map();
  for (const n of nodi) esatti.set(cellaDi(n.x, n.y), n);
  const speciale = (k) => esatti.has(k) || vicini.get(k).size !== 2;
  const fatti = new Set();
  const chiave = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  const rami = [];
  const percorri = (inizio, primo) => {
    const celle = [inizio, primo];
    fatti.add(chiave(inizio, primo));
    let r = rango.get(chiave(inizio, primo));
    let prec = inizio, cur = primo;
    while (!speciale(cur) && cur !== inizio) {
      let prossimo = -1;
      for (const v of vicini.get(cur)) if (v !== prec) { prossimo = v; break; }
      if (prossimo < 0 || fatti.has(chiave(cur, prossimo))) break;
      fatti.add(chiave(cur, prossimo));
      r = Math.max(r, rango.get(chiave(cur, prossimo)));
      celle.push(prossimo); prec = cur; cur = prossimo;
    }
    const x = new Float32Array(celle.length), y = new Float32Array(celle.length);
    celle.forEach((k, s) => { x[s] = (k % cols) + 0.5; y[s] = ((k / cols) | 0) + 0.5; });
    for (const s of [0, celle.length - 1]) { const n = esatti.get(celle[s]); if (n) { x[s] = n.x; y[s] = n.y; } }
    rami.push({ id: rami.length, classe: PER_RANGO[r], x, y });
  };
  for (const k of [...vicini.keys()].sort((a, b) => a - b)) {
    if (!speciale(k)) continue;
    for (const v of [...vicini.get(k)].sort((a, b) => a - b)) if (!fatti.has(chiave(k, v))) percorri(k, v);
  }
  for (const k of [...vicini.keys()].sort((a, b) => a - b)) {   // anelli senza incroci
    for (const v of [...vicini.get(k)].sort((a, b) => a - b)) if (!fatti.has(chiave(k, v))) percorri(k, v);
  }
  return rami;
}

// ─── 2. Tracciato fine nelle Scene ──────────────────────────────────────────

/**
 * Punto fisso tra due tratti: vicino a quello della rete (entro STRADE.scena.fisso.raggio) dove il terreno è più
 * dolce e non c'è un corso d'acqua della Carta. Usa solo il rilievo (quotaMondo): non dipende da cosa è già stato
 * cercato, quindi è lo stesso da qualunque blocco.
 */
function puntoFisso(carta, x, z) {
  const F = STRADE.scena.fisso, n = Math.round(F.raggio / F.passo) + 1, lato = 2 * n + 1;
  const h = new Float64Array(lato * lato);
  for (let b = 0; b < lato; b++) for (let a = 0; a < lato; a++) h[b * lato + a] = quotaMondo(carta, x + (a - n) * F.passo, z + (b - n) * F.passo);
  const { cols, rows, cella, bacino, sogliaTorrente } = carta;
  let migliore = Infinity, bx = x, bz = z;
  for (let b = 1; b < lato - 1; b++) {
    for (let a = 1; a < lato - 1; a++) {
      const gx = (h[b * lato + a + 1] - h[b * lato + a - 1]) / (2 * F.passo);
      const gz = (h[(b + 1) * lato + a] - h[(b - 1) * lato + a]) / (2 * F.passo);
      const px = x + (a - n) * F.passo, pz = z + (b - n) * F.passo;
      const i = Math.min(rows - 1, Math.max(0, Math.floor(pz / cella))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(px / cella)));
      const v = Math.hypot(gx, gz) + 1e-6 * ((px - x) ** 2 + (pz - z) ** 2) + (bacino[i] >= sogliaTorrente ? 0.3 : 0);
      if (v < migliore) { migliore = v; bx = px; bz = pz; }
    }
  }
  return [bx, bz];
}


const _scena = new WeakMap();

/** Tratti delle strade tra punti fissi della rete (m del mondo), con il riquadro; il tracciato fine si cerca a richiesta. */
function stradeScena(carta) {
  let s = _scena.get(carta);
  if (s) return s;
  const S = STRADE.scena, C = carta.cella, W = S.corridoio;
  const tratti = [];
  for (const a of carta.strade?.rami ?? []) {
    const m = a.x.length;
    const fissi = [0];
    for (let i = S.tratto; i < m - 1 - S.tratto / 2; i += S.tratto) fissi.push(i);
    fissi.push(m - 1);
    // Punti fissi intermedi spostati sul terreno più dolce lì vicino; gli estremi (nodi, incroci) restano.
    const spostati = new Map();
    for (let f = 1; f < fissi.length - 1; f++) spostati.set(fissi[f], puntoFisso(carta, a.x[fissi[f]] * C, a.y[fissi[f]] * C));
    for (let f = 0; f < fissi.length - 1; f++) {
      const i0 = fissi[f], i1 = fissi[f + 1];
      const px = [], pz = [];
      for (let i = i0; i <= i1; i++) {
        const sp = spostati.get(i);
        px.push(sp ? sp[0] : a.x[i] * C); pz.push(sp ? sp[1] : a.y[i] * C);
      }
      tratti.push({
        ramo: a.id, classe: a.classe, px: Float64Array.from(px), pz: Float64Array.from(pz),
        riquadro: [Math.min(...px) - W, Math.min(...pz) - W, Math.max(...px) + W, Math.max(...pz) + W],
        fine: null,
      });
    }
  }
  s = { tratti, indice: new Map(), raggio: Math.max(...Object.values(STRADE.classi).map((k) => k.semi + k.banchina)) + S.raccordo + S.ritorno };
  _scena.set(carta, s);
  return s;
}

/** La porta di un luogo (con la normale) se (x, z) ci cade sopra, altrimenti null. */
function portaIn(carta, x, z) {
  for (const l of carta.luoghi ?? []) {
    const P = l.porta;
    if (P && P.nx !== undefined && Math.abs(P.x - x) < 1 && Math.abs(P.z - z) < 1) return P;
  }
  return null;
}

/** Quota del terreno senza strade (rilievo e fiumi); in esito.livello il pelo dell'acqua se il punto è nell'alveo. */
function terreno(carta, x, z, esito) {
  return scavaFiumi(carta, x, z, quotaMondo(carta, x, z), esito);
}

/** Tracciato fine di un tratto: griglia di 20 m nel corridoio, costo per passo con la pendenza della classe. */
function tracciaTratto(carta, tr, W = STRADE.scena.corridoio) {
  const S = STRADE.scena, K = STRADE.classi[tr.classe], g = S.cella;
  const { px, pz } = tr, np = px.length;
  // I fiumi attorno devono essere già cercati: la strada si appoggia sul terreno con i fiumi definitivi.
  const rx0 = Math.min(...px) - W, rz0 = Math.min(...pz) - W, rx1 = Math.max(...px) + W, rz1 = Math.max(...pz) + W;
  raffinaZona(carta, (rx0 + rx1) / 2, (rz0 + rz1) / 2, Math.max(rx1 - rx0, rz1 - rz0) / 2);
  const x0 = rx0, z0 = rz0;
  const nx = Math.ceil((rx1 - rx0) / g) + 1, nz = Math.ceil((rz1 - rz0) / g) + 1, N = nx * nz;
  const d2 = new Float64Array(N).fill(Infinity);
  for (let i = 0; i < np - 1; i++) {
    const vx = px[i + 1] - px[i], vz = pz[i + 1] - pz[i], l2 = vx * vx + vz * vz;
    const c0 = Math.max(0, Math.floor((Math.min(px[i], px[i + 1]) - W - x0) / g));
    const c1 = Math.min(nx - 1, Math.ceil((Math.max(px[i], px[i + 1]) + W - x0) / g));
    const r0 = Math.max(0, Math.floor((Math.min(pz[i], pz[i + 1]) - W - z0) / g));
    const r1 = Math.min(nz - 1, Math.ceil((Math.max(pz[i], pz[i + 1]) + W - z0) / g));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = x0 + c * g, z = z0 + r * g, k = r * nx + c;
        let u = l2 > 0 ? ((x - px[i]) * vx + (z - pz[i]) * vz) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = x - px[i] - vx * u, dz = z - pz[i] - vz * u, d = dx * dx + dz * dz;
        if (d < d2[k]) d2[k] = d;
      }
    }
  }
  const A = { x: px[0], z: pz[0] }, B = { x: px[np - 1], z: pz[np - 1] };
  const hq = new Float64Array(N).fill(NaN), acqua = new Float32Array(N);   // 0 asciutto, >0 metri d'acqua
  const esito = { quota: 0, livello: NaN };
  const piani = [];
  for (const l of carta.luoghi ?? []) for (const p of l.piani ?? []) piani.push(p);
  for (let k = 0; k < N; k++) {
    if (d2[k] > W * W) continue;
    const x = x0 + (k % nx) * g, z = z0 + ((k / nx) | 0) * g;
    const h = terreno(carta, x, z, esito);
    const lago = livelloLago(carta, x, z);
    if (!Number.isNaN(lago) || h < 0) continue;                      // laghi e mare: fuori
    // Terrapieni di rocca e borgo: niente strada sui piani (le scarpate sì: la porta sta sul bordo del borgo,
    // tra le scarpate dei terrazzi), tranne vicino agli estremi.
    const vicino = Math.hypot(x - A.x, z - A.z) < 40 || Math.hypot(x - B.x, z - B.z) < 40;
    if (!vicino && piani.some((p) => distanzaPiano(p, x, z) < 0)) continue;
    hq[k] = h;
    acqua[k] = Number.isNaN(esito.livello) ? 0 : Math.max(0.01, esito.livello - h);
  }
  const cellaDi = (x, z) => Math.min(nz - 1, Math.max(0, Math.round((z - z0) / g))) * nx + Math.min(nx - 1, Math.max(0, Math.round((x - x0) / g)));
  const sA = cellaDi(A.x, A.z), sB = cellaDi(B.x, B.z);
  for (const s of [sA, sB]) if (Number.isNaN(hq[s])) { hq[s] = terreno(carta, x0 + (s % nx) * g, z0 + ((s / nx) | 0) * g, esito); acqua[s] = 0; }
  // Pendenze sul terreno lisciato (media su ~60 m, `lisciaTerreno` passate): la strada segue la forma del versante
  // e fa tornanti ampi, invece di zigzagare tra le gobbe del rilievo fine.
  for (let it = 0; it < S.lisciaTerreno; it++) {
    const t = hq.slice();
    for (let k = 0; k < N; k++) {
      if (Number.isNaN(hq[k])) continue;
      const r = (k / nx) | 0, c = k - r * nx;
      let somma = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const cc = c + a, rr = r + b;
        if (cc < 0 || rr < 0 || cc >= nx || rr >= nz) continue;
        const v = t[rr * nx + cc];
        if (!Number.isNaN(v)) { somma += v; n++; }
      }
      hq[k] = somma / n;
    }
  }
  const dist = new Float64Array(N).fill(Infinity), da = new Int32Array(N).fill(-1);
  const coda = nuovaCoda(8192);
  dist[sA] = 0; coda.spingi(sA, 0);
  while (!coda.vuota) {
    const d = coda.testa, k = coda.togli();
    if (d > dist[k]) continue;
    if (k === sB) break;
    const r = (k / nx) | 0, c = k - r * nx;
    // Direzione d'arrivo (dal predecessore): le svolte costano (approssimazione: lo stato non ha la direzione).
    const pk = da[k];
    let ux = 0, uz = 0;
    if (pk >= 0) { ux = c - (pk % nx); uz = r - ((pk / nx) | 0); const lu = Math.hypot(ux, uz); ux /= lu; uz /= lu; }
    for (let v = 0; v < 16; v++) {
      const cc = c + DX[v], rr = r + DY[v];
      if (cc < 0 || rr < 0 || cc >= nx || rr >= nz) continue;
      const kk = rr * nx + cc;
      if (Number.isNaN(hq[kk])) continue;
      let km = -1;
      if (v >= 8) { km = (r + Math.round(DY[v] / 2)) * nx + c + Math.round(DX[v] / 2); if (Number.isNaN(hq[km])) continue; }
      const L = LUNGO[v] * g, p = Math.abs(hq[kk] - hq[k]) / L, pp = p / K.p0;
      let costo = L * (1 + pp * pp);
      if (p > K.pmax) costo *= 1 + S.oltre * (p - K.pmax) / K.pmax;
      const w = Math.max(acqua[kk], km >= 0 ? acqua[km] : 0);
      if (w > 0) costo *= w > 0.9 ? S.acqua : S.guado;
      const via = Math.sqrt(d2[kk]) / W;
      costo += L * S.attrazione * via * via;
      if (pk >= 0) costo += S.svolta * (1 - (ux * DX[v] + uz * DY[v]) / LUNGO[v]) / 2;
      const nd = d + costo;
      if (nd < dist[kk]) { dist[kk] = nd; da[kk] = k; coda.spingi(kk, nd); }
    }
  }
  let cammino;
  if (Number.isFinite(dist[sB])) cammino = percorsoDa(da, sB);
  else cammino = null;
  let xs, zs;
  if (cammino) {
    xs = cammino.map((k) => x0 + (k % nx) * g); zs = cammino.map((k) => z0 + ((k / nx) | 0) * g);
    xs[0] = A.x; zs[0] = A.z; xs[xs.length - 1] = B.x; zs[zs.length - 1] = B.z;
  } else {                                           // nessun passaggio nel corridoio: la rete com'è
    xs = Array.from(px); zs = Array.from(pz);
  }
  // Punti a passo costante, poi media mobile con estremi fissi.
  const rx = [xs[0]], rz = [zs[0]];
  let resto = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const l = Math.hypot(xs[i + 1] - xs[i], zs[i + 1] - zs[i]);
    let u = S.passo - resto;
    while (u < l) { const f = u / l; rx.push(xs[i] + (xs[i + 1] - xs[i]) * f); rz.push(zs[i] + (zs[i + 1] - zs[i]) * f); u += S.passo; }
    resto = l - (u - S.passo);
  }
  rx.push(xs[xs.length - 1]); rz.push(zs[zs.length - 1]);
  const liscia = (arr, R, passate) => {
    let a = arr.slice();
    for (let it = 0; it < passate; it++) {
      const b = a.slice();
      for (let i = 1; i < a.length - 1; i++) {
        const r = Math.min(R, i, a.length - 1 - i);
        let s = 0;
        for (let j = i - r; j <= i + r; j++) s += a[j];
        b[i] = s / (2 * r + 1);
      }
      a = b;
    }
    return a;
  };
  let fx = liscia(rx, ...S.liscia), fz = liscia(rz, ...S.liscia);
  // Alla porta di un borgo la strada arriva dritta, lungo la normale della porta (prima arrivava di sbieco e finiva
  // contro il muro accanto all'arco): gli ultimi S.portaDritta m sono un segmento sulla normale.
  for (const inizio of [true, false]) {
    const ex = inizio ? fx[0] : fx[fx.length - 1], ez = inizio ? fz[0] : fz[fz.length - 1];
    const P = portaIn(carta, ex, ez);
    if (!P) continue;
    const R = S.portaDritta, X = [], Z = [];
    for (let t = 0; t < R - 1e-6; t += S.passo) { X.push(P.x + P.nx * t); Z.push(P.z + P.nz * t); }
    const resto = [], restoZ = [];
    for (let i = 0; i < fx.length; i++) {
      if (Math.hypot(fx[i] - ex, fz[i] - ez) > R) { resto.push(fx[i]); restoZ.push(fz[i]); }
    }
    if (!resto.length) continue;
    if (inizio) { fx = [...X, ...resto]; fz = [...Z, ...restoZ]; } else { fx = [...resto, ...X.reverse()]; fz = [...restoZ, ...Z.reverse()]; }
  }
  // Quota della strada: il terreno lungo il percorso, saltando l'acqua (lì passerà un ponte o un guado), lisciata.
  const m = fx.length, h = new Array(m), bagnato = new Uint8Array(m);
  for (let i = 0; i < m; i++) { h[i] = terreno(carta, fx[i], fz[i], esito); bagnato[i] = Number.isNaN(esito.livello) ? 0 : 1; }
  let prima = -1;
  for (let i = 0; i < m; i++) {
    if (bagnato[i]) continue;
    if (prima >= 0 && i - prima > 1) for (let j = prima + 1; j < i; j++) h[j] = h[prima] + (h[i] - h[prima]) * (j - prima) / (i - prima);
    prima = i;
  }
  const hh = liscia(h, ...S.profilo);
  return { x: Float64Array.from(fx), z: Float64Array.from(fz), h: Float64Array.from(hh), semi: K.semi, ok: !!cammino };
}

/** Cerca il tracciato fine dei tratti di strada entro `raggio` m (in quadrato) da (cx, cz). Restituisce i ms. */
export function raffinaStrade(carta, cx, cz, raggio = STRADE.scena.zona) {
  if (!carta.strade) return 0;
  const t0 = performance.now();
  const s = stradeScena(carta), Ci = STRADE.scena.cellaIndice, R = s.raggio;
  s.tratti.forEach((tr, id) => {
    if (tr.fine) return;
    const [x0, z0, x1, z1] = tr.riquadro;
    if (x1 < cx - raggio || x0 > cx + raggio || z1 < cz - raggio || z0 > cz + raggio) return;
    tr.fine = tracciaTratto(carta, tr);
    if (!tr.fine.ok) {                                // corridoio chiuso (acqua, terrapieni): più largo
      const largo = tracciaTratto(carta, tr, 2.5 * STRADE.scena.corridoio);
      if (largo.ok) tr.fine = largo;
    }
    const f = tr.fine;
    for (let i = 0; i < f.x.length - 1; i++) {
      const a0 = Math.floor((Math.min(f.x[i], f.x[i + 1]) - R) / Ci), a1 = Math.floor((Math.max(f.x[i], f.x[i + 1]) + R) / Ci);
      const b0 = Math.floor((Math.min(f.z[i], f.z[i + 1]) - R) / Ci), b1 = Math.floor((Math.max(f.z[i], f.z[i + 1]) + R) / Ci);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
        const k = a * 1000003 + b;
        let l = s.indice.get(k);
        if (!l) s.indice.set(k, (l = []));
        l.push(id, i);
      }
    }
  });
  return performance.now() - t0;
}

/**
 * Segmento di strada più vicino al punto (solo tratti già raffinati): scrive in `out` la distanza dall'asse `d`,
 * lo scostamento con segno `lato` (positivo a sinistra nel verso del tracciato), la semilarghezza `semi`, la quota
 * della strada `h` e la classe. `out.d` = Infinity se nessuna strada è entro ~30 m.
 */
export function distanzaStrada(carta, x, z, out = { d: Infinity, lato: 0, semi: 0, h: 0, classe: '' }) {
  out.d = Infinity;
  const s = carta.strade ? _scena.get(carta) : null;
  if (!s || !s.indice.size) return out;
  const Ci = STRADE.scena.cellaIndice;
  const l = s.indice.get(Math.floor(x / Ci) * 1000003 + Math.floor(z / Ci));
  if (!l) return out;
  for (let k = 0; k < l.length; k += 2) {
    const tr = s.tratti[l[k]], f = tr.fine, i = l[k + 1];
    const ax = f.x[i], az = f.z[i], vx = f.x[i + 1] - ax, vz = f.z[i + 1] - az, l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - ax - vx * t, dz = z - az - vz * t, d = Math.sqrt(dx * dx + dz * dz);
    if (d < out.d) {
      out.d = d; out.semi = f.semi; out.classe = tr.classe; out.banchina = STRADE.classi[tr.classe].banchina;
      out.h = f.h[i] + (f.h[i + 1] - f.h[i]) * t;
      out.lato = (vx * (z - az) - vz * (x - ax)) >= 0 ? d : -d;
    }
  }
  return out;
}

const _d = { d: Infinity, lato: 0, semi: 0, h: 0, classe: '' };

/**
 * Quota h con le strade: sulla carreggiata la quota della strada; ai lati scarpate di taglio e di riporto
 * (al più STRADE.scena.scarpata), poi il terreno naturale. Nell'alveo dei fiumi niente (ponti e guadi a parte).
 */
export function spianaStrade(carta, x, z, h, esito) {
  if (esito && !Number.isNaN(esito.livello)) return h;
  distanzaStrada(carta, x, z, _d);
  if (_d.d === Infinity) return h;
  const S = STRADE.scena, e = Math.max(0, _d.d - _d.semi - _d.banchina);   // carreggiata e banchina piane
  const f = 1 - smoothstep(S.raccordo, S.raccordo + S.ritorno, e);
  if (f <= 0) return h;
  const lo = _d.h - e * S.scarpata, hi = _d.h + e * S.scarpata;
  const c = h < lo ? lo : h > hi ? hi : h;
  return h + f * (c - h);
}


/** Solo per gli script di prova in Node: i tratti con il tracciato fine (se cercato). */
export function _trattiPerProve(carta) { return stradeScena(carta).tratti; }

/**
 * Percorsi delle strade (m del mondo) nel riquadro, per la vista della Carta: per ogni tratto che lo tocca il
 * tracciato fine se già cercato, altrimenti la rete. { x, z, classe }.
 */
export function percorsiStrade(carta, x0, z0, x1, z1) {
  if (!carta.strade) return [];
  const out = [];
  for (const tr of stradeScena(carta).tratti) {
    const [a0, b0, a1, b1] = tr.riquadro;
    if (a1 < x0 || a0 > x1 || b1 < z0 || b0 > z1) continue;
    out.push(tr.fine ? { x: tr.fine.x, z: tr.fine.z, classe: tr.classe } : { x: tr.px, z: tr.pz, classe: tr.classe });
  }
  return out;
}

/**
 * Strade nel blocco (coordinate locali, centro (cx, cz), lato 2·half): per ogni tratto raffinato i pezzi dentro il
 * blocco come Float32Array [x, z, semilarghezza, …], un punto ogni ~`passo` m. Per il nastro della carreggiata.
 * Se `quote` è un array, per ogni pezzo vi aggiunge un Float32Array con la quota della strada in ogni punto (la stessa
 * a cui spianaStrade porta carreggiata e banchina: il nastro può stare piano in larghezza). Nell'alveo dei fiumi è la
 * quota del ponte o del guado che verrà (il profilo salta l'acqua), non il terreno.
 */
export function stradeBlocco(carta, cx, cz, half, passo = 2, quote = null) {
  if (!carta.strade) return [];
  const out = [];
  for (const tr of stradeScena(carta).tratti) {
    const f = tr.fine;
    if (!f) continue;
    const [a0, b0, a1, b1] = tr.riquadro;
    if (a1 < cx - half || a0 > cx + half || b1 < cz - half || b0 > cz + half) continue;
    let pezzo = [], hs = [];
    const chiudi = () => {
      if (pezzo.length >= 6) { out.push(Float32Array.from(pezzo)); if (quote) quote.push(Float32Array.from(hs)); }
      pezzo = []; hs = [];
    };
    for (let i = 0; i < f.x.length; i++) {
      const n = i === 0 ? 1 : Math.max(1, Math.round(Math.hypot(f.x[i] - f.x[i - 1], f.z[i] - f.z[i - 1]) / passo));
      for (let k = 1; k <= n; k++) {
        const t = i === 0 ? 1 : k / n;
        const x = (i === 0 ? f.x[0] : f.x[i - 1] + (f.x[i] - f.x[i - 1]) * t) - cx;
        const z = (i === 0 ? f.z[0] : f.z[i - 1] + (f.z[i] - f.z[i - 1]) * t) - cz;
        if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) { chiudi(); continue; }
        pezzo.push(x, z, f.semi);
        hs.push(i === 0 ? f.h[0] : f.h[i - 1] + (f.h[i] - f.h[i - 1]) * t);
      }
    }
    chiudi();
  }
  return out;
}
