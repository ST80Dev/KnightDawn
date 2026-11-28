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
import { quotaMondo, scavaFiumi, livelloLago, distanzaPiano, raffinaZona, quotaPiano, spianaLuoghi, quotaBase,
  terrenoRipido, distanzaAcqua } from './scena.js';
import { smoothstep, completa } from './rumore.js';

// Otto vicini della Carta (come in carta.js e scena.js): spostamenti e distanze.
const V8X = [1, -1, 0, 0, 1, 1, -1, -1], V8Y = [0, 0, 1, -1, 1, -1, 1, -1];
const V8D = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
import { RAMPA_PORTA } from './luoghi.js';   // import circolare (luoghi → scena → strade): usata solo dentro le funzioni

export const STRADE = {
  // Classi [Ipotesi del piano, da tarare guardando]: pendenza comoda p0, massima pmax, semilarghezza (m).
  classi: {
    // banchina (m per lato): oltre la carreggiata il terreno resta alla quota della strada prima della scarpata
    // [richiesto dall'utente: «la strada scavi un piano nel rilievo», niente carreggiata inclinata di traverso]. Con
    // la griglia del blocco a 7,8 m, carreggiata + banchina ≥ ~7 m per le strade da carro: almeno una fila di
    // vertici piana per lato. Stretta per mulattiere e sentieri (non scavano terrazze).
    // Larghezze [decise con l'utente, novembre 2026]: sulla maestra due carri si incrociano e una colonna marcia in
    // 6 di fronte (7 m), sulla carrareccia due carri passano con attenzione (4,5 m); sentieri invariati. La banchina
    // della maestra scende a 4 m, così il ripiano scavato nel pendio resta largo come prima (15 m) ma è più carreggiata.
    maestra: { p0: 0.05, pmax: 0.10, semi: 3.5, banchina: 4, nome: 'strada maestra' },
    carrareccia: { p0: 0.07, pmax: 0.14, semi: 2.25, banchina: 4.5, nome: 'carrareccia' },
    mulattiera: { p0: 0.12, pmax: 0.25, semi: 1.4, banchina: 2.5, nome: 'mulattiera' },
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
    ponteVillaggio: 6000,       // m equivalenti in più per un ponte nuovo sul tratto che collega un villaggio (M8)
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
    mura: { oltre: 15, costo: 4 },  // scarpate dei terrapieni (+ oltre m): costo × questo (strade al largo delle mura)
    oltre: 6,                   // oltre pmax il costo cresce di × (1 + oltre·(p − pmax)/pmax): gli strappi brevi si
                                // accettano, le salite lunghe e ripide si girano (tornanti)
    fisso: { raggio: 150, passo: 50 },   // m: il punto fisso tra due tratti si sposta sul terreno più dolce vicino
    svolta: 60,                 // m equivalenti per un'inversione (180°), in proporzione per angoli minori: lati
                                // dei tornanti lunghi, niente denti di sega su un pendio uniforme
    acqua: 40,                  // attraversare acqua non guadabile: × questo per metro (il ponte più corto)
    guado: 4,
    passo: 5,                   // m tra i punti del tracciato finale
    liscia: [3, 2],             // media mobile ±3 punti, 2 passate (toglie i gradini senza tagliare i tornanti)
    vicinoAcqua: 120,           // m: oltre questa distanza da un corso d'acqua il punto è asciutto (mappa dell'acqua)
    rampaMargine: 6,            // m: distanza minima del tracciato dai piani della rampa lungo le mura
    portaDritta: 12,            // m: tratto dritto lungo la normale della porta di un borgo, fino alla porta
    lisciaTerreno: 2,           // passate di media 3×3 sulle quote della griglia prima di cercare il percorso
    lisciaVera: 1,              // passate dopo cui si prende anche la pendenza «vera» (la più ripida delle due conta)
    profilo: [5, 3],            // quota della strada: media mobile ±5 punti (25 m), 3 passate
    profiloMax: 1.5,            // pendenza massima del profilo: × pmax della classe (scavi e riporti per i gradini)
    taglio: 3,                  // m: scavo o riporto massimo del profilo rispetto al terreno lisciato
    raccordoEstremi: 30,        // m: agli estremi del tratto la quota resta quella di prima (incroci, porte)
    scarpata: 0.6,              // pendenza massima delle scarpate di taglio e di riporto (~31°)
    raccordo: 18,               // m oltre il bordo entro cui il terreno segue la strada
    ritorno: 10,                // m per tornare al terreno naturale
    cellaIndice: 100,
    zona: 1600,                 // m: tratti raffinati attorno al centro del blocco
    // Attraversamenti (passo 4, ponti e guadi): oltre `guado` m d'acqua un ponte (la stessa soglia del guado a piedi,
    // PROFONDITA_GUADO in main.js). Impalcato a pelo + `franco` + `francoLuce`·luce (o alle rive se più alte), rampe
    // in terra alla pendenza massima della classe. Guado: soglia di ghiaia con `acquaGuado` m d'acqua.
    attraversa: { guado: 0.9, franco: 1.5, francoLuce: 0.03, acquaGuado: 0.35, pietra: 20 },
  },
};

const PEZZO = 256;                 // a pezzi: celle o passi tra un yield e l'altro
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

/**
 * Dijkstra sulle celle della Carta da più sorgenti; si ferma al bersaglio se c'è, o alla prima cella per cui
 * `fermaSe(k)` è vero (M8: dal villaggio alla strada più vicina), che restituisce in `arrivo`.
 */
function cammini(carta, sorgenti, costo, bersaglio = -1, fermaSe = null) {
  const { cols, rows } = carta, n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity), da = new Int32Array(n).fill(-1);
  const coda = nuovaCoda(4096);
  for (const s of sorgenti) { dist[s] = 0; coda.spingi(s, 0); }
  let arrivo = -1;
  while (!coda.vuota) {
    const d = coda.testa, k = coda.togli();
    if (d > dist[k]) continue;
    if (k === bersaglio) break;
    if (fermaSe && fermaSe(k)) { arrivo = k; break; }
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
  return { dist, da, arrivo };
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
  // Villaggi (M8, js/mondo/siti.js): i grandi e poi gli altri, lontani dagli altri nodi, diventano nodi della rete
  // (al più A.massimo: il costo cresce col quadrato dei nodi); gli altri si collegano dopo con un tratto corto
  // (collegaVillaggi). Carte senza villaggi: come prima, abitati provvisori dai siti candidati delle rocche.
  const A = STRADE.carta.abitati;
  const villaggi = (carta.siti ?? []).filter((s) => s.tipo === 'villaggio')
    .sort((a, b) => (a.dimensione === b.dimensione ? a.id - b.id : a.dimensione === 'villaggio' ? -1 : 1));
  const candidati = villaggi.length ? villaggi : [...(carta.candidatiLuoghi ?? [])].sort((a, b) => b.punteggio - a.punteggio);
  let abitati = 0;
  for (const c of candidati) {
    if (abitati >= A.massimo) break;
    const x = c.x / cella, y = c.z / cella;
    if (nodi.some((n) => Math.hypot(n.x - x, n.y - y) < A.distanza)) continue;
    const extra = villaggi.length ? { sito: c.id } : { provvisorio: true };
    if (aggiungi(x, y, villaggi.length ? 'villaggio' : 'abitato', extra) >= 0) abitati++;
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
  // Villaggi non ancora sulla rete: un tratto dal villaggio alla prima cella di strada (Dijkstra fermato lì), in ordine
  // di id; i tratti già fatti valgono come strada per i successivi.
  const sulla = new Set(nodi.filter((k) => k.tipo === 'villaggio').map((k) => k.sito));
  let collegati = 0;
  for (const v of (carta.siti ?? [])) {
    if (v.tipo !== 'villaggio' || sulla.has(v.id)) continue;
    const x = v.x / carta.cella, y = v.z / carta.cella, sv = cellaDi(x, y);
    if (stato.strada[sv]) { nodi.push({ id: nodi.length, x, y, tipo: 'villaggio', sito: v.id }); continue; }
    permesse.add(sv);
    const corsa = (classe) => {
      // un ponte nuovo per un villaggio costa molto di più: si va alla strada dalla propria parte del fiume
      const base = costiCarta(carta, classe, stato, permesse, ruvido);
      const costo = (i, j, w) => {
        const c = base(i, j, w);
        if (c === Infinity) return c;
        const f = attraversamento(carta, i, j, w);
        return f >= 0 && carta.bacino[f] >= carta.sogliaFiume && !stato.ponti.has(f) ? c + C.ponteVillaggio : c;
      };
      const { da, arrivo } = cammini(carta, [sv], costo, -1, (k) => stato.strada[k] === 1);
      return arrivo < 0 ? null : percorsoDa(da, arrivo).reverse();      // dalla strada al villaggio
    };
    let classe = 'carrareccia', celle = corsa(classe);
    if (!celle) continue;
    const qMax = Math.max(...celle.map((k) => quota[k]));
    if (qMax > C.quotaMulattiera) { classe = qMax > C.quotaSentiero ? 'sentiero' : 'mulattiera'; celle = corsa(classe) ?? celle; }
    const id = nodi.length;
    nodi.push({ id, x, y, tipo: 'villaggio', sito: v.id });
    registra(celle, classe, -1, id, null, { x, y });
    collegati++;
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
  carta.strade = { nodi, archi, rami, ponti, info: { rami: rami.length, nodi: N, villaggiCollegati: collegati, archi: archi.length, ponti: ponti.length, guadi, km, ms: performance.now() - t0 } };
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
  // Tracciati fini già calcolati nel Worker (precalcolaStrade): si rimettono ai tratti e si indicizzano.
  if (carta.stradeFini?.length === tratti.length) {
    tratti.forEach((t, id) => { if (carta.stradeFini[id]) { t.fine = carta.stradeFini[id]; indicizza(s, id); } });
  }
  return s;
}

/** La porta di un luogo (con la normale) se (x, z) ci cade sopra, altrimenti null. */
function portaIn(carta, x, z) {
  for (const l of carta.luoghi ?? []) {
    const P = l.porta;
    if (!P || P.nx === undefined) continue;
    if (Math.abs(P.x - x) < 1 && Math.abs(P.z - z) < 1) return { ...P, borgo: l.piani?.[1] };
    // Borgo con la rampa lungo le mura (M7): la strada finisce dove la rampa tocca terra, `porta.arrivo`.
    const A = P.arrivo;
    if (A && Math.abs(A.x - x) < 1 && Math.abs(A.z - z) < 1) return { ...A, arrivo: true };
  }
  return null;
}

/** Estremo del tracciato fine: il punto della rete, o l'arrivo della rampa lungo le mura se la porta ne ha una. */
function estremo(carta, x, z) {
  for (const l of carta.luoghi ?? []) {
    const P = l.porta;
    if (P?.arrivo && Math.abs(P.x - x) < 1 && Math.abs(P.z - z) < 1) return [P.arrivo.x, P.arrivo.z];
  }
  return [x, z];
}

/**
 * Rampa fuori dalla porta di un borgo, come la costruisce js/3d/borgo3d.js (RAMPA_PORTA: dalla soglia, `sporgenza` m
 * fuori dal muro, scende al terreno in 3–24 m al più al 20 %): restituisce la distanza dalla porta dove finisce e la
 * quota lì. La strada fa lo stesso tratto dritto e la stessa quota, così strada e rampa coincidono (segnalato
 * dall'utente: all'ingresso non combaciavano).
 */
function rampaPorta(carta, P) {
  const RAMPA = RAMPA_PORTA;
  const q = (d) => terrenoLuoghi(carta, P.x + P.nx * d, P.z + P.nz * d, { quota: 0, livello: NaN });
  const qs = q(RAMPA.sporgenza);
  let lunga = RAMPA.minima, migliore = Infinity;
  for (let l = RAMPA.minima; l <= RAMPA.massima; l += 0.5) {
    const g = Math.abs(qs - q(RAMPA.sporgenza + l)) / l;
    if (g < migliore) { migliore = g; lunga = l; }
    if (g <= RAMPA.pendenza) break;
  }
  const fine = RAMPA.sporgenza + lunga;
  return { fine, quota: q(fine) };
}

/** Quota del terreno senza strade (rilievo e fiumi); in esito.livello il pelo dell'acqua se il punto è nell'alveo. */
function terreno(carta, x, z, esito) {
  return scavaFiumi(carta, x, z, quotaMondo(carta, x, z), esito);
}
/** Terreno con i terrapieni dei luoghi (le loro scarpate a 25° ci sono anche per la strada: quotaFinale le mette sopra). */
function terrenoLuoghi(carta, x, z, esito) {
  return spianaLuoghi(carta, x, z, terreno(carta, x, z, esito));
}

/** Tracciato fine di un tratto: griglia di 20 m nel corridoio, costo per passo con la pendenza della classe. */
function tracciaTratto(carta, tr, W) { return completa(tracciaTrattoAPezzi(carta, tr, W)); }

/** tracciaTratto a pezzi: yield ogni PEZZO celle della griglia e ogni PEZZO passi della ricerca. */
function* tracciaTrattoAPezzi(carta, tr, W = STRADE.scena.corridoio) {
  const S = STRADE.scena, K = STRADE.classi[tr.classe], g = S.cella;
  const np = tr.px.length, px = Array.from(tr.px), pz = Array.from(tr.pz);
  [px[0], pz[0]] = estremo(carta, px[0], pz[0]);
  [px[np - 1], pz[np - 1]] = estremo(carta, px[np - 1], pz[np - 1]);
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
  const mura = new Uint8Array(N);                                       // 1: scarpata di un terrapieno
  const esito = { quota: 0, livello: NaN };
  const base = !!carta.terrenoBase;        // terreno della ricerca dalla griglia senza strade
  // Solo i piani dei luoghi vicini al tratto (prima tutti, per ogni cella: metà del tempo delle strade).
  const piani = [];
  for (const l of carta.luoghi ?? []) {
    const m = (l.raggioPiani ?? 300) + 100;
    if (l.x < rx0 - m || l.x > rx1 + m || l.z < rz0 - m || l.z > rz1 + m) continue;
    for (const p of l.piani ?? []) piani.push(p);
  }
  for (let k = 0; k < N; k++) {
    if (d2[k] > W * W) continue;
    if (k % PEZZO === 0) yield;
    const x = x0 + (k % nx) * g, z = z0 + ((k / nx) | 0) * g;
    // Terreno della ricerca: dalla griglia senza strade dove il terreno è dolce (la ricerca liscia comunque le quote
    // su ~60 m, quindi là il dettaglio sotto il passo della griglia non cambia il percorso). Sui versanti ripidi la
    // griglia appiattisce dossi e incisioni e la strada ci finisce dentro: lì la quota si ricalcola esatta.
    let h, preciso = !base;
    if (!base) h = terrenoLuoghi(carta, x, z, esito);
    else {
      if (terrenoRipido(carta, x, z)) { h = terrenoLuoghi(carta, x, z, esito); preciso = true; }
      else h = quotaBase(carta, x, z);
    }
    const lago = livelloLago(carta, x, z);
    if (!Number.isNaN(lago) || h < 0) continue;                      // laghi e mare: fuori
    // Terrapieni di rocca e borgo: niente strada sui piani (le scarpate sì: la porta sta sul bordo del borgo,
    // tra le scarpate dei terrazzi), tranne vicino agli estremi.
    const vicino = Math.hypot(x - A.x, z - A.z) < 40 || Math.hypot(x - B.x, z - B.z) < 40;
    let dp = Infinity, sp = 0, dRampa = Infinity;
    for (const p of piani) {
      const d = distanzaPiano(p, x, z);
      if (p.tipo === 'rampa') { if (d < dRampa) dRampa = d; continue; }
      if (d < dp) { dp = d; sp = p.s; }
    }
    if (!vicino && dp < 0) continue;
    // La rampa lungo le mura (M7) non è strada: mai sopra né rasente, nemmeno vicino all'arrivo (prima la strada le
    // correva accanto per decine di metri e il terreno disegnato tra le due saliva a 37°).
    if (dRampa < S.rampaMargine) continue;
    // Sulle scarpate dei terrapieni (rasente alle mura) costa di più, tranne vicino agli estremi: le strade di
    // passaggio girano al largo, alla porta si arriva per la diramazione.
    if (!vicino && dp < sp + S.mura.oltre) mura[k] = 1;
    hq[k] = h;
    // L'acqua la dice scavaFiumi, che dalla griglia non si saprebbe; ma solo dove un alveo può esserci davvero, cioè
    // vicino a un corso d'acqua (mappa delle distanze): altrove è asciutto e si risparmia il calcolo del terreno.
    if (preciso) acqua[k] = Number.isNaN(esito.livello) ? 0 : Math.max(0.01, esito.livello - h);
    else if (distanzaAcqua(carta, x, z) < S.vicinoAcqua) {
      const hf = terreno(carta, x, z, esito);
      if (!Number.isNaN(esito.livello)) acqua[k] = Math.max(0.01, esito.livello - hf);
    }
  }
  const cellaDi = (x, z) => Math.min(nz - 1, Math.max(0, Math.round((z - z0) / g))) * nx + Math.min(nx - 1, Math.max(0, Math.round((x - x0) / g)));
  const sA = cellaDi(A.x, A.z), sB = cellaDi(B.x, B.z);
  for (const s of [sA, sB]) if (Number.isNaN(hq[s])) { hq[s] = terreno(carta, x0 + (s % nx) * g, z0 + ((s / nx) | 0) * g, esito); acqua[s] = 0; }
  // Pendenze sul terreno lisciato (media su ~60 m, `lisciaTerreno` passate): la strada segue la forma del versante
  // e fa tornanti ampi, invece di zigzagare tra le gobbe del rilievo fine. Conta però anche la pendenza vera (media
  // su ~40 m, `lisciaVera` passate): su una cima stretta la lisciatura la nascondeva e la strada saliva dritta a 30°
  // verso la rocca (segnalato dall'utente).
  let hv = null;
  for (let it = 0; it < S.lisciaTerreno; it++) {
    if (it === S.lisciaVera) hv = hq.slice();
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
  let passi = 0;
  while (!coda.vuota) {
    if (++passi % (PEZZO * 4) === 0) yield;
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
      const L = LUNGO[v] * g, p = Math.max(Math.abs(hq[kk] - hq[k]), hv ? Math.abs(hv[kk] - hv[k]) : 0) / L, pp = p / K.p0;
      let costo = L * (1 + pp * pp);
      if (p > K.pmax) costo *= 1 + S.oltre * (p - K.pmax) / K.pmax;
      const w = Math.max(acqua[kk], km >= 0 ? acqua[km] : 0);
      if (w > 0) costo *= w > 0.9 ? S.acqua : S.guado;
      const via = Math.sqrt(d2[kk]) / W;
      costo += L * S.attrazione * via * via;
      if (mura[kk]) costo *= S.mura.costo;
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
    const R = P.arrivo ? S.portaDritta : Math.max(S.portaDritta, rampaPorta(carta, P).fine + 4), X = [], Z = [];
    for (let t = 0; t < R - 1e-6; t += S.passo) { X.push(P.x + P.nx * t); Z.push(P.z + P.nz * t); }
    // Via tutti i punti fino all'ultimo (dalla porta) ancora vicino o non ancora davanti alla porta: se il
    // tracciato costeggiava le mura prima di arrivare, quel pezzo resterebbe come una seconda strada accanto.
    const n0 = fx.length, ord = inizio ? (i) => i : (i) => n0 - 1 - i;
    let ultimo = -1;
    for (let i = 0; i < n0; i++) {
      const k = ord(i), dx = fx[k] - P.x, dz = fz[k] - P.z, d = Math.hypot(dx, dz), davanti = dx * P.nx + dz * P.nz;
      if (d <= R || (d < 4 * R && davanti < R)) ultimo = i;
    }
    const resto = [], restoZ = [];
    for (let i = ultimo + 1; i < n0; i++) { const k = ord(i); resto.push(fx[k]); restoZ.push(fz[k]); }
    if (!inizio) { resto.reverse(); restoZ.reverse(); }
    if (!resto.length) continue;
    if (inizio) { fx = [...X, ...resto]; fz = [...Z, ...restoZ]; } else { fx = [...resto, ...X.reverse()]; fz = [...restoZ, ...Z.reverse()]; }
    // Raccordo: niente gomito dove il tratto dritto incontra il resto (estremi fermi, la porta resta in asse).
    fx = liscia(fx, 1, 2); fz = liscia(fz, 1, 2);
  }
  // Quota della strada: il terreno lungo il percorso, saltando l'acqua (lì passerà un ponte o un guado), lisciata.
  const m = fx.length, h = new Array(m), bagnato = new Uint8Array(m), pelo = new Float64Array(m), suolo = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    h[i] = suolo[i] = terrenoLuoghi(carta, fx[i], fz[i], esito);
    bagnato[i] = Number.isNaN(esito.livello) ? 0 : 1; pelo[i] = esito.livello;
  }
  let prima = -1;
  for (let i = 0; i < m; i++) {
    if (bagnato[i]) continue;
    if (prima >= 0 && i - prima > 1) for (let j = prima + 1; j < i; j++) h[j] = h[prima] + (h[i] - h[prima]) * (j - prima) / (i - prima);
    prima = i;
  }
  let hh = liscia(h, ...S.profilo);
  // Alla porta di un borgo la strada arriva alla quota della soglia (il pendio del borgo appena dentro), salendo o
  // scendendo in linea retta negli ultimi S.portaDritta m: davanti alla porta niente gradino e niente rampa lunga.
  hh = hh.slice();
  for (const inizio of [true, false]) {
    const k0 = inizio ? 0 : m - 1, P = portaIn(carta, fx[k0], fz[k0]);
    if (!P || !(P.borgo || P.arrivo)) continue;
    // All'arrivo della rampa lungo le mura la strada parte dalla sua quota (la rampa di pietra fa il resto).
    const qs = P.arrivo ? P.quota : quotaPiano(P.borgo, P.x - P.nx * 3, P.z - P.nz * 3);
    const rampa = P.arrivo ? { fine: 0.01, quota: P.quota } : rampaPorta(carta, P), R = rampa.fine;
    let kR = k0;
    for (let i = 0; i < m; i++) {
      const k = inizio ? i : m - 1 - i;
      if (Math.hypot(fx[k] - P.x, fz[k] - P.z) > R) { kR = k; break; }
    }
    // Fino alla fine della rampa la quota è quella della rampa (dalla soglia al terreno), poi si raccorda.
    const hR = rampa.quota, dR = R;
    for (let i = 0; i < m; i++) {
      const k = inizio ? i : m - 1 - i, d = Math.hypot(fx[k] - P.x, fz[k] - P.z);
      if (d <= R) continue;
      const w = 1 - Math.min(1, (d - R) / S.raccordoEstremi);
      if (w <= 0) break;
      hh[k] = hh[k] + (hR - hh[k]) * w;
    }
    for (let i = 0; i < m; i++) {
      const k = inizio ? i : m - 1 - i;
      if (k === kR) break;
      const d = Math.hypot(fx[k] - P.x, fz[k] - P.z);
      hh[k] = qs + (hR - qs) * Math.min(1, d / dR);
    }
  }
  // Pendenza massima del profilo (segnalato dall'utente: gradini a 30–57° verso una rocca): la quota della strada non
  // sale né scende più di `profiloMax`·pmax per metro; i gradini corti si tagliano o si riempiono, al più di `taglio` m
  // dal profilo di prima (oltre resta la salita: lì il tracciato avrebbe dovuto girare). Agli estremi (incroci, porte)
  // la quota resta quella di prima, raccordata su `raccordoEstremi` m.
  {
    const G = K.pmax * S.profiloMax, T = S.taglio, base = hh.slice();
    const lung = new Float64Array(m);
    for (let i = 1; i < m; i++) lung[i] = Math.hypot(fx[i] - fx[i - 1], fz[i] - fz[i - 1]);
    const F = base.slice(), B = base.slice();
    for (let i = 1; i < m; i++) F[i] = Math.min(Math.max(F[i], F[i - 1] - G * lung[i]), F[i - 1] + G * lung[i]);
    for (let i = m - 2; i >= 0; i--) B[i] = Math.min(Math.max(B[i], B[i + 1] - G * lung[i + 1]), B[i + 1] + G * lung[i + 1]);
    let d0 = 0;
    const dFine = new Float64Array(m);
    for (let i = m - 2; i >= 0; i--) dFine[i] = dFine[i + 1] + lung[i + 1];
    for (let i = 0; i < m; i++) {
      if (i > 0) d0 += lung[i];
      let v = (F[i] + B[i]) / 2;
      v = Math.min(Math.max(v, base[i] - T), base[i] + T);
      // Pieno entro la rampa della porta più lunga (RAMPA_PORTA), poi sfuma in raccordoEstremi m.
      const w = 1 - Math.min(1, Math.max(0, Math.min(d0, dFine[i]) - RAMPA_PORTA.sporgenza - RAMPA_PORTA.massima) / S.raccordoEstremi);
      hh[i] = v + (base[i] - v) * w;
    }
  }
  // Attraversamenti: corse di punti nell'acqua. Ponte (acqua profonda): impalcato piano tra le due rive asciutte e rampe;
  // guado: soglia di ghiaia poco sotto il pelo e discese nelle rive. tipo per punto: 0 strada, 1 ponte, 2 guado.
  const AT = S.attraversa, tipo = new Uint8Array(m), attraversamenti = [];
  const lungo = (a, b) => { let l = 0; for (let k = Math.min(a, b); k < Math.max(a, b); k++) l += Math.hypot(fx[k + 1] - fx[k], fz[k + 1] - fz[k]); return l; };
  for (let i = 0; i < m;) {
    if (!bagnato[i]) { i++; continue; }
    let j = i, prof = 0, peloMax = -Infinity;
    while (j < m && bagnato[j]) { prof = Math.max(prof, pelo[j] - suolo[j]); peloMax = Math.max(peloMax, pelo[j]); j++; }
    // Il ponte si appoggia per due punti (~10 m) su ciascuna riva: il terreno disegnato (un vertice ogni 7,8 m, quelli
    // nell'alveo restano bassi) sale davvero fino all'impalcato prima della testata [segnalato dall'utente: gradino].
    const a = Math.max(0, i - 2), b = Math.min(m - 1, j + 1), luce = lungo(a, b);
    const ponte = prof > AT.guado;
    let quota;
    if (ponte) {
      quota = Math.max(peloMax + AT.franco + AT.francoLuce * luce, hh[a], hh[b]);
      for (let k = a; k <= b; k++) { hh[k] = quota; tipo[k] = 1; }
      // Rampe: verso l'esterno la strada non scende più ripida della classe (rilevato fino all'impalcato).
      for (let k = a - 1; k >= 0; k--) { const v = quota - K.pmax * lungo(k, a); if (hh[k] >= v) break; hh[k] = v; }
      for (let k = b + 1; k < m; k++) { const v = quota - K.pmax * lungo(b, k); if (hh[k] >= v) break; hh[k] = v; }
    } else {
      quota = peloMax - AT.acquaGuado;
      for (let k = i; k < j; k++) { hh[k] = quota; tipo[k] = 2; }
      // Discese nelle rive alla pendenza della classe.
      for (let k = i - 1; k >= 0; k--) { const v = quota + K.pmax * lungo(k, i); if (hh[k] <= v) break; hh[k] = v; }
      for (let k = j; k < m; k++) { const v = quota + K.pmax * lungo(j - 1, k); if (hh[k] <= v) break; hh[k] = v; }
    }
    attraversamenti.push({ ponte, a, b, quota, pelo: peloMax, profondita: prof, luce });
    i = j;
  }
  return { x: Float64Array.from(fx), z: Float64Array.from(fz), h: Float64Array.from(hh), tipo, attraversamenti, semi: K.semi, ok: !!cammino };
}

/** Cerca il tracciato fine dei tratti di strada entro `raggio` m (in quadrato) da (cx, cz). Restituisce i ms. */
export function raffinaStrade(carta, cx, cz, raggio) { return completa(raffinaStradeAPezzi(carta, cx, cz, raggio)); }

/**
 * Due strade che arrivano alla stessa porta: la seconda finisce dove incontra la prima (si innesta), invece di correrle
 * accanto fino alla porta (segnalato dall'utente: «due strade arrivano alla porta senza unirsi»). Si accorcia il
 * tracciato fine di `tr` dal lato della porta fino all'ultimo punto ancora affiancato all'altra strada.
 */
function innestaAllaPorta(carta, tratti, tr) {
  const f = tr.fine, m = f.x.length;
  for (const inizio of [true, false]) {
    const k0 = inizio ? 0 : m - 1, P = portaIn(carta, f.x[k0], f.z[k0]);
    if (!P) continue;
    const altro = tratti.find((t) => t !== tr && t.fine && [0, t.fine.x.length - 1]
      .some((k) => Math.hypot(t.fine.x[k] - P.x, t.fine.z[k] - P.z) < 1));
    if (!altro) continue;
    const g = altro.fine, soglia = g.semi + f.semi + 1.5;
    const vicino = (x, z) => {
      for (let j = 0; j < g.x.length; j++) if (Math.hypot(g.x[j] - x, g.z[j] - z) < soglia) return true;
      return false;
    };
    // Dalla porta verso fuori: ultimo punto ancora affiancato all'altra strada (entro 400 m dalla porta).
    let taglio = 0;
    for (let i = 1; i < m; i++) {
      const k = inizio ? i : m - 1 - i;
      if (Math.hypot(f.x[k] - P.x, f.z[k] - P.z) > 400) break;
      if (vicino(f.x[k], f.z[k])) taglio = i; else if (i - taglio > 3) break;
    }
    if (taglio < 2 || m - taglio < 4) continue;
    const tieni = inizio ? [taglio, m] : [0, m - taglio];
    const sl = (a) => a.slice(tieni[0], tieni[1]);
    tr.fine = { ...f, x: sl(f.x), z: sl(f.z), h: sl(f.h), tipo: sl(f.tipo),
      attraversamenti: f.attraversamenti.map((a) => ({ ...a, a: a.a - tieni[0], b: a.b - tieni[0] }))
        .filter((a) => a.a >= 0 && a.b < tieni[1] - tieni[0]) };
    return;
  }
}

/** Indice per celle (cellaIndice) dei segmenti del tracciato fine del tratto `id` (distanzaStrada, spianaStrade). */
function indicizza(s, id) {
  const Ci = STRADE.scena.cellaIndice, R = s.raggio, f = s.tratti[id].fine;
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
}

/**
 * Tracciato fine di tutte le strade della Carta, calcolato una volta nel Worker e salvato con lei (piano «Mondo generato
 * in anticipo», passo G6): `carta.stradeFini`, uno per tratto (null se il tratto non ne ha). Nella pagina stradeScena li
 * rimette ai tratti: la Carta mostra subito le strade vere e i blocchi non le cercano più.
 */
export function precalcolaStrade(carta) {
  if (!carta.strade) return carta;
  const t0 = performance.now(), C = carta.cella;
  raffinaStrade(carta, carta.cols * C / 2, carta.rows * C / 2, Math.max(carta.cols, carta.rows) * C);
  carta.stradeFini = stradeScena(carta).tratti.map((t) => t.fine && {
    x: Float64Array.from(t.fine.x), z: Float64Array.from(t.fine.z), h: Float64Array.from(t.fine.h), tipo: Uint8Array.from(t.fine.tipo),
    attraversamenti: t.fine.attraversamenti, semi: t.fine.semi, ok: t.fine.ok,
  });
  carta.strade.info.msFini = Math.round(performance.now() - t0);
  return carta;
}

/** raffinaStrade a pezzi (blocco che segue il cavaliere): yield dentro la ricerca di ogni tratto. */
export function* raffinaStradeAPezzi(carta, cx, cz, raggio = STRADE.scena.zona) {
  if (!carta.strade) return 0;
  const t0 = performance.now();
  const s = stradeScena(carta);
  for (let id = 0; id < s.tratti.length; id++) {
    const tr = s.tratti[id];
    if (tr.fine) continue;
    const [x0, z0, x1, z1] = tr.riquadro;
    if (x1 < cx - raggio || x0 > cx + raggio || z1 < cz - raggio || z0 > cz + raggio) continue;
    const fine = yield* tracciaTrattoAPezzi(carta, tr);
    if (tr.fine) continue;                            // cercato nel frattempo da una versione tutta in una volta
    tr.fine = fine;
    if (!tr.fine.ok) {                                // corridoio chiuso (acqua, terrapieni): più largo
      const largo = yield* tracciaTrattoAPezzi(carta, tr, 2.5 * STRADE.scena.corridoio);
      if (largo.ok) tr.fine = largo;
    }
    innestaAllaPorta(carta, s.tratti, tr);
    indicizza(s, id);
    yield;
  }
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
      out.tipo = f.tipo ? f.tipo[t < 0.5 ? i : i + 1] : 0;
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
  const inAcqua = esito && !Number.isNaN(esito.livello);
  distanzaStrada(carta, x, z, _d);
  if (_d.d === Infinity) return h;
  // Nell'alveo: sotto un ponte il fiume resta; al guado il letto sale alla soglia di ghiaia (mai si abbassa).
  if (inAcqua && _d.tipo !== 2) return h;
  const S = STRADE.scena, e = Math.max(0, _d.d - _d.semi - _d.banchina);   // carreggiata e banchina piane
  const f = 1 - smoothstep(S.raccordo, S.raccordo + S.ritorno, e);
  if (f <= 0) return h;
  const lo = _d.h - e * S.scarpata, hi = _d.h + e * S.scarpata;
  let c = h < lo ? lo : h > hi ? hi : h;
  if (inAcqua && c < h) c = h;
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
    if (!tr.fine) { out.push({ x: tr.px, z: tr.pz, classe: tr.classe }); continue; }
    const f = tr.fine;
    // Attraversamenti (ponti e guadi) con il punto di mezzo, per i segni sulla Carta zoomata.
    const attraversamenti = (f.attraversamenti || []).map((at) => ({ ponte: at.ponte,
      x: (f.x[at.a] + f.x[at.b]) / 2, z: (f.z[at.a] + f.z[at.b]) / 2, dx: f.x[at.b] - f.x[at.a], dz: f.z[at.b] - f.z[at.a] }));
    out.push({ x: f.x, z: f.z, classe: tr.classe, attraversamenti });
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
        // Sul ponte niente nastro: la carreggiata è l'impalcato del ponte (js/3d/acqua.js, creaPonte).
        // Al guado neanche: la strada passa sotto l'acqua (prima il nastro la attraversava sopra, segnalato dall'utente).
        if (f.tipo && i > 0 && f.tipo[i - 1] > 0 && f.tipo[i] > 0) { chiudi(); continue; }
        pezzo.push(x, z, f.semi);
        hs.push(i === 0 ? f.h[0] : f.h[i - 1] + (f.h[i] - f.h[i - 1]) * t);
      }
    }
    chiudi();
  }
  return out;
}

/**
 * Ponti e guadi nel blocco (coordinate locali, centro (cx, cz)): per ogni attraversamento dei tratti raffinati che cade
 * nel blocco, { ponte, materiale ('pietra'|'legno'), x0, z0, x1, z1 (le due rive asciutte), quota (impalcato o soglia),
 * pelo, profondita, luce, semi, classe, punti: [x, z, …] (il tracciato tra le rive) }.
 */
export function attraversamentiBlocco(carta, cx, cz, half) {
  if (!carta.strade) return [];
  const out = [], A = STRADE.scena.attraversa;
  for (const tr of stradeScena(carta).tratti) {
    const f = tr.fine;
    if (!f || !f.attraversamenti) continue;
    for (const at of f.attraversamenti) {
      const x0 = f.x[at.a] - cx, z0 = f.z[at.a] - cz, x1 = f.x[at.b] - cx, z1 = f.z[at.b] - cz;
      const dentro = (x, z) => Math.abs(x) < half - 2 && Math.abs(z) < half - 2;
      if (!dentro(x0, z0) || !dentro(x1, z1)) continue;           // tagliato dal bordo: nel blocco accanto
      const punti = [];
      for (let k = at.a; k <= at.b; k++) punti.push(f.x[k] - cx, f.z[k] - cz);
      out.push({
        ponte: at.ponte, materiale: at.ponte && (tr.classe === 'maestra' || at.luce > A.pietra) ? 'pietra' : 'legno',
        x0, z0, x1, z1, quota: at.quota, pelo: at.pelo, profondita: at.profondita, luce: at.luce,
        semi: f.semi, classe: tr.classe, punti,
      });
    }
  }
  return out;
}

/**
 * Traghetti sugli specchi d'acqua interni [richiesta dell'utente, novembre 2026: «villaggi che siano porti anche su
 * specchi d'acqua interni… per sbarcare nelle isole o sull'altra sponda, per accelerare il viaggio»]. Meccanismo
 * scelto dall'utente: passaggio sulla Carta, non barca guidabile.
 *
 * Due approdi si collegano quando girare il lago costa molto più che attraversarlo, e **sempre** quando le loro rive
 * non si toccano (isole): la distanza lungo la riva si misura con un'onda sulle celle di riva, che per costruzione
 * non passa da una riva all'altra. Niente ricerche di percorso in più: la generazione non rallenta.
 */
export const TRAGHETTI = {
  lago: 10,                 // km² minimi dello specchio d'acqua
  daRiva: 2.5,              // km: distanza massima di un villaggio dalla riva per essere un approdo
  traversata: [0.8, 25],    // km: traversata più corta e più lunga ammesse
  attesa: 3,                // km equivalenti di imbarco e attesa: il giro a piedi deve costare almeno traversata + questo
  perLago: 3,               // tratte al più per ogni specchio d'acqua (oltre a quelle che raggiungono rive isolate)
  traApprodi: 4,            // km: due approdi dello stesso lago più vicini di così sono lo stesso scalo
};

/** Rotta (coordinate della Carta, km) ricostruita dai predecessori dell'onda sull'acqua, dall'inizio alla fine. */
function rottaDa(carta, prima, fine) {
  const { cols } = carta, x = [], y = [];
  for (let i = fine; i >= 0; i = prima[i]) { x.push((i % cols) + 0.5); y.push(((i / cols) | 0) + 0.5); }
  return { x: Float32Array.from(x.reverse()), y: Float32Array.from(y.reverse()) };
}

/** Specchi d'acqua interni della Carta: componenti di celle LAGO, con dimensione in km². */
function specchi(carta) {
  const { cols, rows, acque } = carta, n = cols * rows;
  const lago = (i) => acque[i] === ACQUA.LAGO || acque[i] === ACQUA.LAGO_COSTIERO;
  const id = new Int32Array(n).fill(-1), dim = [], coda = new Int32Array(n);
  let k = 0;
  for (let s = 0; s < n; s++) {
    if (!lago(s) || id[s] >= 0) continue;
    let t = 0, f = 0; coda[f++] = s; id[s] = k; let m = 0;
    while (t < f) {
      const i = coda[t++]; m++;
      const x = i % cols, y = (i - x) / cols;
      for (let d = 0; d < 8; d++) {
        const xx = x + V8X[d], yy = y + V8Y[d];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (lago(j) && id[j] < 0) { id[j] = k; coda[f++] = j; }
      }
    }
    dim.push(m); k++;
  }
  return { id, dim };
}

/** Celle di riva di uno specchio (terra che tocca l'acqua di `s`). */
function celleRiva(carta, idLago, s) {
  const { cols, rows } = carta, n = cols * rows, riva = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (idLago[i] !== s) continue;
    const x = i % cols, y = (i - x) / cols;
    for (let d = 0; d < 8; d++) {
      const xx = x + V8X[d], yy = y + V8Y[d];
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const j = yy * cols + xx;
      if (idLago[j] < 0) riva[j] = 1;
    }
  }
  return riva;
}

/** Pezzi di riva separati (le rive di un lago e quelle delle sue isole non si toccano): id per cella, -1 altrove. */
function pezziDiRiva(carta, riva) {
  const { cols, rows } = carta, n = cols * rows, id = new Int32Array(n).fill(-1), coda = new Int32Array(n);
  let k = 0;
  for (let s = 0; s < n; s++) {
    if (!riva[s] || id[s] >= 0) continue;
    let t = 0, f = 0; coda[f++] = s; id[s] = k;
    while (t < f) {
      const i = coda[t++], x = i % cols, y = (i - x) / cols;
      for (let d = 0; d < 8; d++) {
        const xx = x + V8X[d], yy = y + V8Y[d];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (riva[j] && id[j] < 0) { id[j] = k; coda[f++] = j; }
      }
    }
    k++;
  }
  return id;
}

/** Distanza (km) lungo la riva dalle celle `sorgenti`: onda a 8 direzioni sulle sole celle di riva. */
function ondaRiva(carta, riva, sorgenti) {
  const { cols, rows, cella } = carta, n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity), coda = [];
  for (const i of sorgenti) if (riva[i]) { dist[i] = 0; coda.push(i); }
  for (let t = 0; t < coda.length; t++) {
    const i = coda[t], x = i % cols, y = (i - x) / cols;
    for (let d = 0; d < 8; d++) {
      const xx = x + V8X[d], yy = y + V8Y[d];
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const j = yy * cols + xx;
      if (!riva[j]) continue;                       // da una riva all'altra non si passa: le isole restano a ∞
      const nd = dist[i] + V8D[d] * cella / 1000;
      if (nd < dist[j] - 1e-9) { dist[j] = nd; coda.push(j); }
    }
  }
  return dist;
}

/**
 * Aggiunge `carta.traghetti`: tratte via acqua fra approdi dello stesso specchio. Da chiamare dopo `aggiungiStrade`
 * (gli approdi stanno sui villaggi, che la rete ha già collegato). Ogni tratta:
 * `{ lago, km, a: { sito, x, y, rx, ry }, b: {...}, isolata }` — x, y del villaggio e rx, ry della cella di riva
 * (coordinate della Carta, in km come i fiumi); `isolata` se le due rive non si toccano, cioè è l'unico accesso.
 */
export function aggiungiTraghetti(carta) {
  const t0 = performance.now(), T = TRAGHETTI;
  const { cols, rows, cella } = carta;
  const { id: idLago, dim } = specchi(carta);
  const cellaDi = (x, y) => Math.min(rows - 1, Math.max(0, Math.floor(y))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x)));
  // Approdi possibili: villaggi e rocche. Le rocche contano perché una rocca su un'isola, senza villaggi attorno,
  // resterebbe altrimenti senza alcun collegamento (misurato: capita in un mondo su sette).
  const villaggi = [...(carta.siti ?? []).filter((v) => v.tipo === 'villaggio').map((v) => ({ ...v, sorta: 'villaggio' })),
    ...(carta.luoghi ?? []).map((l) => ({ id: l.id, x: l.x, z: l.z, sorta: 'rocca' }))];
  const tratte = [];
  _scartate.length = 0;
  for (let s = 0; s < dim.length; s++) {
    if (dim[s] < T.lago) continue;
    const riva = celleRiva(carta, idLago, s);
    // Approdi: villaggi vicini alla riva, uno per scalo (due villaggi vicini non fanno due approdi).
    const vicini = [];
    for (const v of villaggi) {
      const x = v.x / cella, y = v.z / cella;
      let miglior = -1, md = Infinity;
      const raggio = Math.ceil(T.daRiva);
      for (let dy = -raggio; dy <= raggio; dy++) for (let dx = -raggio; dx <= raggio; dx++) {
        const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (!riva[j]) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d < md) { md = d; miglior = j; }
      }
      if (miglior < 0 || md * cella / 1000 > T.daRiva) continue;
      vicini.push({ sito: v.id, sorta: v.sorta, x, y, cella: miglior, rx: (miglior % cols) + 0.5, ry: ((miglior / cols) | 0) + 0.5, d: md });
    }
    vicini.sort((a, b) => a.d - b.d);
    const approdi = [];
    for (const a of vicini) {
      if (approdi.some((b) => Math.hypot(b.rx - a.rx, b.ry - a.ry) * cella / 1000 < T.traApprodi)) continue;
      approdi.push(a);
    }
    if (approdi.length < 2) continue;
    // Per ogni approdo: quanto costa girare il lago a piedi (onda sulla riva) e quanto navigare (onda sull'acqua).
    for (const a of approdi) a.imbarco = imbarco(carta, idLago, s, a.cella);
    const rive = pezziDiRiva(carta, riva);
    const perRiva = approdi.map((a) => ondaRiva(carta, riva, [a.cella]));
    const perAcqua = approdi.map((a) => (a.imbarco >= 0 ? ondaAcqua(carta, idLago, s, a.imbarco) : null));
    const coppie = [];
    for (let i = 0; i < approdi.length; i++) for (let j = i + 1; j < approdi.length; j++) {
      const A = approdi[i], B = approdi[j];
      if (!perAcqua[i] || B.imbarco < 0) continue;
      const km = perAcqua[i].dist[B.imbarco];
      if (!(km >= T.traversata[0]) || km > T.traversata[1]) { _scartate.push({ lago: s, km, motivo: 'lunghezza' }); continue; }
      const giro = perRiva[i][B.cella];
      const isolata = !Number.isFinite(giro);
      const utile = isolata || giro >= km + T.attesa;
      _scartate.push({ lago: s, km, giro, isolata, motivo: utile ? '' : 'giro corto' });
      if (!utile) continue;                 // girare a piedi costa poco più che imbarcarsi: niente traghetto
      coppie.push({ tipo: 'traghetto', lago: s, km, giro: isolata ? Infinity : giro, isolata,
        cellaA: A.cella, cellaB: B.cella,
        rotta: rottaDa(carta, perAcqua[i].prima, B.imbarco),
        a: { sito: A.sito, sorta: A.sorta, x: A.x, y: A.y, rx: A.rx, ry: A.ry },
        b: { sito: B.sito, sorta: B.sorta, x: B.x, y: B.y, rx: B.rx, ry: B.ry } });
    }
    // Rive separate: una sola tratta per coppia di rive, la più corta. Senza questo un villaggio su un isolotto
    // diventava il capolinea di diciannove traghetti, perché ogni coppia che lo tocca è «unico accesso».
    const miglioreTra = new Map();
    for (const c of coppie) {
      if (!c.isolata) continue;
      const r1 = rive[c.cellaA], r2 = rive[c.cellaB], chiave = r1 < r2 ? `${r1}|${r2}` : `${r2}|${r1}`;
      const avuta = miglioreTra.get(chiave);
      if (!avuta || c.km < avuta.km) miglioreTra.set(chiave, c);
    }
    const scorciatoie = coppie.filter((c) => !c.isolata).sort((u, v) => v.giro / v.km - u.giro / u.km);
    tratte.push(...miglioreTra.values(), ...scorciatoie.slice(0, T.perLago));
  }
  rotteDiMare(carta, tratte);
  // Approdi sulla riva vera [segnalato dall'utente: «approdi un po' nell'entroterra rispetto alla costa»]: rx, ry è il
  // centro di una cella di riva di 1 km, quindi per costruzione centinaia di metri dentro terra (misurato su 30 semi: 352
  // segni su 536 oltre 300 m dall'acqua). Si fa per ultimo perché rx, ry restano la cella con cui tutto il resto
  // ragiona (rive, terre servite, verificaAccessi); il punto preciso va in px, pz (m), con il verso dell'acqua vx, vz.
  for (const t of tratte) for (const a of [t.a, t.b]) suRiva(carta, a, t.tipo !== 'mare');   // il barcaiolo anche sui laghi
  carta.traghetti = tratte;
  const perTipo = {};
  for (const t of tratte) perTipo[t.tipo] = (perTipo[t.tipo] ?? 0) + 1;
  carta.statistiche = { ...(carta.statistiche ?? {}), traghetti: { tratte: tratte.length, ...perTipo, ms: Math.round(performance.now() - t0) } };
  return carta;
}

/** Riva vera di un approdo: raggio di ricerca attorno alla cella (m), passi della bisezione sul bordo dell'acqua. */
export const RIVA_APPRODO = { raggio: 1500, bisezione: 7, mare: 0.3 };

/**
 * Scrive in `a` il punto di riva vero (px, pz in m, verso l'acqua vx, vz) vicino alla cella di riva (rx, ry): fra i nodi
 * asciutti del terreno base che toccano l'acqua ferma (mare, o lago se `lago`), quello più vicino al luogo servito; poi
 * il bordo dell'acqua si cerca esatto sul segmento verso il nodo bagnato. Senza nodi di riva resta il centro della cella.
 */
function suRiva(carta, a, lago) {
  const C = carta.cella, R = RIVA_APPRODO, B = carta.terrenoBase, es = { quota: 0, livello: NaN };
  const acquaFerma = (x, z) => {
    const h = scavaFiumi(carta, x, z, quotaMondo(carta, x, z), es);
    if (h < R.mare) return true;
    return lago && livelloLago(carta, x, z) > h;
  };
  const cx = a.rx * C, cz = a.ry * C, sx = a.x * C, sz = a.y * C;
  a.px = cx; a.pz = cz; a.vx = 0; a.vz = 0; a.riva = false;
  let P, nx, nz, bagnato;
  if (B) {
    P = B.passo; nx = B.nx; nz = B.nz;
    bagnato = (c, r) => B.h[r * nx + c] < R.mare || (lago && (B.flag[r * nx + c] & 1) !== 0);
  } else {                                           // senza terreno base (script di prova): quota esatta, griglia rada
    P = 62.5; nx = Math.round(carta.cols * C / P) + 1; nz = Math.round(carta.rows * C / P) + 1;
    const memo = new Map();
    bagnato = (c, r) => { const k = r * nx + c; let v = memo.get(k); if (v === undefined) memo.set(k, (v = acquaFerma(c * P, r * P))); return v; };
  }
  const c0 = Math.max(1, Math.floor((cx - R.raggio) / P)), c1 = Math.min(nx - 2, Math.ceil((cx + R.raggio) / P));
  const r0 = Math.max(1, Math.floor((cz - R.raggio) / P)), r1 = Math.min(nz - 2, Math.ceil((cz + R.raggio) / P));
  let best = null;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (bagnato(c, r)) continue;
    const x = c * P, z = r * P, d = Math.hypot(x - sx, z - sz);
    if (best && d >= best.d) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!bagnato(c + dc, r + dr)) continue;
      best = { d, x, z, wx: (c + dc) * P, wz: (r + dr) * P };
      break;
    }
  }
  if (!best) return;
  // Bisezione esatta fra il nodo asciutto e quello bagnato: il bordo dell'acqua delle Scene, non della griglia.
  let t0 = 0, t1 = 1;
  if (acquaFerma(best.x, best.z)) t1 = 0;            // la griglia sbagliava: si resta sul nodo
  else if (acquaFerma(best.wx, best.wz)) {
    for (let k = 0; k < R.bisezione; k++) {
      const t = (t0 + t1) / 2;
      if (acquaFerma(best.x + (best.wx - best.x) * t, best.z + (best.wz - best.z) * t)) t1 = t; else t0 = t;
    }
  } else t0 = 0;
  const vx = best.wx - best.x, vz = best.wz - best.z, l = Math.hypot(vx, vz) || 1;
  a.px = best.x + vx * t0; a.pz = best.z + vz * t0; a.vx = vx / l; a.vz = vz / l; a.riva = true;
}

const _scartate = [];
/** Solo per gli script di prova in Node: le coppie di approdi esaminate, con il motivo dello scarto. */
export function _coppiePerProve() { return _scartate; }

/**
 * Distanza navigabile (km) sull'acqua dello specchio `s` dalla cella `da`, con il predecessore di ogni cella: i laghi
 * hanno bracci e penisole, e una rotta in linea retta finirebbe sulla terra (misurato: 15 coppie di approdi su 18
 * scartate per questo). La barca gira attorno agli ostacoli come farebbe davvero.
 */
function ondaAcqua(carta, idLago, s, da) {
  const { cols, rows, cella } = carta, n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity), prima = new Int32Array(n).fill(-1), coda = [da];
  dist[da] = 0;
  for (let t = 0; t < coda.length; t++) {
    const i = coda[t], x = i % cols, y = (i - x) / cols;
    for (let d = 0; d < 8; d++) {
      const xx = x + V8X[d], yy = y + V8Y[d];
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const j = yy * cols + xx;
      if (idLago[j] !== s) continue;
      const nd = dist[i] + V8D[d] * cella / 1000;
      if (nd < dist[j] - 1e-9) { dist[j] = nd; prima[j] = i; coda.push(j); }
    }
  }
  return { dist, prima };
}

/** Cella d'acqua dello specchio `s` adiacente alla cella di riva `i` (la più vicina al centro del lago). */
function imbarco(carta, idLago, s, i) {
  const { cols, rows } = carta, x = i % cols, y = (i - x) / cols;
  for (let d = 0; d < 8; d++) {
    const xx = x + V8X[d], yy = y + V8Y[d];
    if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
    const j = yy * cols + xx;
    if (idLago[j] === s) return j;
  }
  return -1;
}

/**
 * Porti, rotte per mare e barcaioli [deciso dall'utente, novembre 2026, dopo che su 30 semi sono emerse isole
 * abitate senza alcun accesso: un'isola di 181 km² con un monastero e due villaggi, una di 127 km² con una rocca].
 * Regole di `docs/GDD.md` §3: il mare che tocca il bordo prosegue oltre la mappa, quindi tratti di costa diversi
 * sono collegati da rotte esterne lungo il perimetro; un porto nasce solo dove serve.
 */
export const MARE = {
  daRiva: 3,                // km: distanza massima di un villaggio o rocca dalla riva per essere un porto
  traversata: [1, 70],      // km: rotta utile più corta e più lunga (le rotte obbligate non hanno tetto)
  attesa: 6,                // km equivalenti di imbarco e attesa: più di un traghetto di lago
  utili: 5,                 // rotte di sola scorciatoia al più per mondo
  traPorti: 6,              // km: due porti più vicini di così sono lo stesso scalo
  // Barcaiolo: conta la traversata, non quanto dista il villaggio. Nessuno rema 18 km, ma un pescatore ti porta
  // dall'altra parte di un braccio di mare di tre; il villaggio che noleggia può stare un po' nell'entroterra.
  barcaiolo: { traversata: 14, dalVillaggio: 12 },
};

/** Pezzi di terra della Carta (4 vicini): id per cella, dimensioni, e l'indice del continente (il più grande). */
function terreFerme(carta) {
  const { cols, rows, mare, acque } = carta, n = cols * rows;
  const terra = (i) => !mare[i] && acque[i] === ACQUA.TERRA;
  const id = new Int32Array(n).fill(-1), dim = [], coda = new Int32Array(n);
  let k = 0;
  for (let s = 0; s < n; s++) {
    if (!terra(s) || id[s] >= 0) continue;
    let t = 0, f = 0; coda[f++] = s; id[s] = k; let m = 0;
    while (t < f) {
      const i = coda[t++]; m++;
      const x = i % cols, y = (i - x) / cols;
      for (let d = 0; d < 4; d++) {
        const xx = x + V8X[d], yy = y + V8Y[d];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (terra(j) && id[j] < 0) { id[j] = k; coda[f++] = j; }
      }
    }
    dim.push(m); k++;
  }
  let principale = 0;
  for (let i = 1; i < dim.length; i++) if (dim[i] > dim[principale]) principale = i;
  return { id, dim, principale };
}

/** Posizione (km) lungo il perimetro della Carta di una cella di bordo; -1 se non sta sul bordo. */
function suPerimetro(carta, i) {
  const { cols, rows } = carta, x = i % cols, y = (i - x) / cols;
  if (y === 0) return x;
  if (x === cols - 1) return cols + y;
  if (y === rows - 1) return cols + rows + (cols - 1 - x);
  if (x === 0) return 2 * cols + rows + (rows - 1 - y);
  return -1;
}

/**
 * Distanza navigabile (km) sul mare dalla cella `da`, con i predecessori. Il mare che tocca il bordo prosegue
 * oltre la mappa (GDD §3): le celle di bordo sono collegate fra loro lungo il perimetro esterno, così due tratti
 * di costa separati sulla Carta restano raggiungibili — e in tutti i semi provati ogni mare tocca il bordo.
 */
function ondaMare(carta, da) {
  const { cols, rows, acque, cella } = carta, n = cols * rows, km = cella / 1000;
  const dist = new Float64Array(n).fill(Infinity), prima = new Int32Array(n).fill(-1);
  const propaga = (coda) => {
    for (let t = 0; t < coda.length; t++) {
      const i = coda[t], x = i % cols, y = (i - x) / cols;
      for (let d = 0; d < 8; d++) {
        const xx = x + V8X[d], yy = y + V8Y[d];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (acque[j] !== ACQUA.MARE) continue;
        const nd = dist[i] + V8D[d] * km;
        if (nd < dist[j] - 1e-9) { dist[j] = nd; prima[j] = i; coda.push(j); }
      }
    }
  };
  dist[da] = 0;
  propaga([da]);
  // Anello esterno: le celle di bordo ordinate lungo il perimetro, due passate (avanti e indietro) sul ciclo.
  const bordo = [];
  for (let i = 0; i < n; i++) {
    if (acque[i] !== ACQUA.MARE) continue;
    const p = suPerimetro(carta, i);
    if (p >= 0) bordo.push({ i, p });
  }
  if (bordo.length > 1) {
    bordo.sort((a, b) => a.p - b.p);
    const B = bordo.length, giroCarta = 2 * (cols + rows), aggiornate = [];
    const passa = (verso) => {
      // Due giri dell'anello per verso: al secondo il collegamento che «scavalca» l'inizio è già aggiornato.
      for (let r = 0; r < 2; r++) for (let k = 0; k < B; k++) {
        const iu = verso > 0 ? k : B - 1 - k;
        const iv = (iu + verso + B) % B;
        const u = bordo[iu], v = bordo[iv];
        const avanti = (((verso > 0 ? v.p - u.p : u.p - v.p) % giroCarta) + giroCarta) % giroCarta;
        const nd = dist[u.i] + avanti * km;
        if (nd < dist[v.i] - 1e-9) { dist[v.i] = nd; prima[v.i] = u.i; aggiornate.push(v.i); }
      }
    };
    passa(1);
    passa(-1);
    if (aggiornate.length) propaga(aggiornate);
  }
  return { dist, prima };
}

/** Celle di terra che toccano il mare. */
function rivaMare(carta) {
  const { cols, rows, acque, mare } = carta, n = cols * rows, riva = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (acque[i] !== ACQUA.MARE) continue;
    const x = i % cols, y = (i - x) / cols;
    for (let d = 0; d < 8; d++) {
      const xx = x + V8X[d], yy = y + V8Y[d];
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const j = yy * cols + xx;
      if (!mare[j] && acque[j] === ACQUA.TERRA) riva[j] = 1;
    }
  }
  return riva;
}

/**
 * Aggiunge a `tratte` le rotte per mare e i barcaioli. Due obblighi e una comodità:
 * 1. ogni pezzo di terra separato che ha una rocca o un villaggio va collegato al continente, a qualunque distanza
 *    (è la regola «nessun luogo dove non si sbarca»);
 * 2. un pezzo con soli siti speciali (rovine, grotte, accampamenti) ha un **barcaiolo**: una barca a noleggio dal
 *    villaggio di riva più vicino, senza porto né rotta fissa;
 * 3. fra i porti del continente, le rotte che fanno risparmiare strada, come per i traghetti di lago.
 */
function rotteDiMare(carta, tratte) {
  const M = MARE, { cols, rows, cella, acque } = carta;
  const terre = terreFerme(carta);
  const riva = rivaMare(carta);
  const cellaDi = (x, z) => Math.min(rows - 1, Math.max(0, Math.floor(z / cella))) * cols
    + Math.min(cols - 1, Math.max(0, Math.floor(x / cella)));
  const abitati = [...(carta.siti ?? []).filter((v) => v.tipo === 'villaggio').map((v) => ({ ...v, sorta: 'villaggio' })),
    ...(carta.luoghi ?? []).map((l) => ({ id: l.id, x: l.x, z: l.z, sorta: 'rocca' }))];
  // Candidati porto: abitati vicini alla riva del mare, con la loro cella di riva e il loro pezzo di terra.
  const porti = [];
  for (const v of abitati) {
    const cx = Math.floor(v.x / cella), cz = Math.floor(v.z / cella);
    const raggio = Math.ceil(M.daRiva);
    let best = -1, md = Infinity;
    for (let dy = -raggio; dy <= raggio; dy++) for (let dx = -raggio; dx <= raggio; dx++) {
      const xx = cx + dx, yy = cz + dy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || !riva[yy * cols + xx]) continue;
      const d = Math.hypot(xx + 0.5 - v.x / cella, yy + 0.5 - v.z / cella);
      if (d < md) { md = d; best = yy * cols + xx; }
    }
    if (best < 0 || md * cella / 1000 > M.daRiva) continue;
    porti.push({ sito: v.id, sorta: v.sorta, x: v.x / cella, y: v.z / cella, cella: best,
      rx: (best % cols) + 0.5, ry: ((best / cols) | 0) + 0.5, terra: terre.id[best], d: md });
  }
  // Un porto per scalo: due abitati sulla stessa insenatura non fanno due porti.
  porti.sort((a, b) => a.d - b.d);
  const scali = [];
  for (const p of porti) {
    if (scali.some((q) => q.terra === p.terra && Math.hypot(q.rx - p.rx, q.ry - p.ry) * cella / 1000 < M.traPorti)) continue;
    scali.push(p);
  }
  for (const p of scali) p.imbarco = imbarcoMare(carta, p.cella);
  const utili = scali.filter((p) => p.imbarco >= 0);
  if (utili.length < 2) { barcaioli(carta, tratte, terre, riva, cellaDi); return; }
  const onde = utili.map((p) => ondaMare(carta, p.imbarco));
  const rivaOnda = utili.map((p) => ondaRiva(carta, riva, [p.cella]));
  const coppie = [];
  for (let i = 0; i < utili.length; i++) for (let j = i + 1; j < utili.length; j++) {
    const A = utili[i], B = utili[j];
    const km = onde[i].dist[B.imbarco];
    if (!Number.isFinite(km) || km < M.traversata[0]) continue;
    const giro = rivaOnda[i][B.cella];
    const separati = A.terra !== B.terra;
    coppie.push({ tipo: 'mare', km, giro, separati, i, j,
      rotta: rottaDa(carta, onde[i].prima, B.imbarco),
      a: { sito: A.sito, sorta: A.sorta, x: A.x, y: A.y, rx: A.rx, ry: A.ry },
      b: { sito: B.sito, sorta: B.sorta, x: B.x, y: B.y, rx: B.rx, ry: B.ry } });
  }
  // 1. Obbligo: ogni pezzo di terra con un porto, che non sia il continente, va collegato — la più corta che ha.
  const collegate = new Set([terre.principale]);
  for (const t of terre.dim.keys()) {
    if (t === terre.principale) continue;
    if (!utili.some((p) => p.terra === t)) continue;
    const verso = coppie.filter((c) => (utili[c.i].terra === t) !== (utili[c.j].terra === t))
      .sort((u, v) => u.km - v.km);
    const scelta = verso.find((c) => utili[c.i].terra === terre.principale || utili[c.j].terra === terre.principale) ?? verso[0];
    if (!scelta) continue;
    scelta.obbligata = true;
    collegate.add(t);
  }
  // 2. Comodità: rotte che accorciano davvero, fra porti già raggiungibili, con un tetto per mondo.
  const scorciatoie = coppie.filter((c) => !c.obbligata && c.km <= M.traversata[1]
      && (!Number.isFinite(c.giro) || c.giro >= c.km + M.attesa))
    .sort((u, v) => (Number.isFinite(v.giro) ? v.giro / v.km : 99) - (Number.isFinite(u.giro) ? u.giro / u.km : 99));
  for (const c of coppie) if (c.obbligata) tratte.push(ripulisci(c));
  for (const c of scorciatoie.slice(0, M.utili)) tratte.push(ripulisci(c));
  barcaioli(carta, tratte, terre, riva, cellaDi);
}

/** Toglie i campi di lavoro dalla tratta prima di salvarla nella Carta. */
function ripulisci(c) {
  const { i, j, separati, obbligata, ...resto } = c;
  return { ...resto, isolata: !!separati };
}

/** Cella di mare adiacente a una cella di riva. */
function imbarcoMare(carta, i) {
  const { cols, rows, acque } = carta, x = i % cols, y = (i - x) / cols;
  for (let d = 0; d < 8; d++) {
    const xx = x + V8X[d], yy = y + V8Y[d];
    if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
    const j = yy * cols + xx;
    if (acque[j] === ACQUA.MARE) return j;
  }
  return -1;
}

/**
 * Barcaioli: pezzi di terra separati che hanno **solo siti speciali** (rovine, grotte, accampamenti, luoghi del
 * fantastico) e nessun porto. Non meritano una rotta fissa, ma non devono restare irraggiungibili: dal villaggio
 * di riva più vicino si noleggia una barca. Nessun molo, nessun orario.
 */
function barcaioli(carta, tratte, terre, riva, cellaDi) {
  const M = MARE, { cols, rows, cella } = carta, n = cols * rows;
  const servite = new Set([terre.principale]);
  for (const t of tratte) for (const a of [t.a, t.b]) {
    const i = cellaDi(a.rx * cella, a.ry * cella);
    if (terre.id[i] >= 0) servite.add(terre.id[i]);
  }
  // Che cosa sta su ogni pezzo di terra non servito.
  const sopra = new Map();
  const segna = (x, z, abitato) => {
    const t = terre.id[cellaDi(x, z)];
    if (t < 0 || servite.has(t)) return;
    const r = sopra.get(t) ?? { abitato: false, siti: 0 };
    if (abitato) r.abitato = true; else r.siti++;
    sopra.set(t, r);
  };
  for (const l of carta.luoghi ?? []) segna(l.x, l.z, true);
  for (const s of carta.siti ?? []) segna(s.x, s.z, s.tipo === 'villaggio');
  if (!sopra.size) return;
  const villaggi = (carta.siti ?? []).filter((v) => v.tipo === 'villaggio')
    .map((v) => ({ sito: v.id, x: v.x / cella, y: v.z / cella, terra: terre.id[cellaDi(v.x, v.z)] }));
  // Le barche partono e arrivano sulla riva: celle di terra che toccano un'acqua qualsiasi (mare o lago: le terre si
  // separano anche sui laghi, e `riva` del mare da sola lasciava senza barcaiolo le isole dei laghi).
  const sponda = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (terre.id[i] < 0) continue;
    const x = i % cols, y = (i - x) / cols;
    for (let d = 0; d < 8; d++) {
      const xx = x + V8X[d], yy = y + V8Y[d];
      if (xx >= 0 && yy >= 0 && xx < cols && yy < rows && terre.id[yy * cols + xx] < 0) { sponda[i] = 1; break; }
    }
  }
  for (const [t, r] of sopra) {
    if (!r.siti && !r.abitato) continue;
    // Riva dell'isola e riva di una terra già servita **che abbia un villaggio a portata**: le due condizioni vanno
    // valutate insieme. Prima sceglievo la riva più vicina e poi cercavo chi noleggia: se quella riva non aveva
    // villaggi, l'isola restava scoperta anche quando poco più in là ce n'era una servita e abitata.
    let miglior = null;
    for (let i = 0; i < n; i++) {
      if (terre.id[i] !== t || !sponda[i]) continue;   // dalla riva, non dal mezzo dell'isola
      const ix = (i % cols) + 0.5, iy = ((i / cols) | 0) + 0.5;
      for (let j = 0; j < n; j++) {
        if (terre.id[j] < 0 || !servite.has(terre.id[j]) || !sponda[j]) continue;
        const jx = (j % cols) + 0.5, jy = ((j / cols) | 0) + 0.5;
        const km = Math.hypot(ix - jx, iy - jy) * cella / 1000;
        if (km > M.barcaiolo.traversata || (miglior && km >= miglior.km)) continue;
        let v = null, md = Infinity;
        for (const w of villaggi) {
          if (w.terra !== terre.id[j]) continue;
          const d = Math.hypot(w.x - jx, w.y - jy) * cella / 1000;
          if (d < md) { md = d; v = w; }
        }
        if (!v || md > M.barcaiolo.dalVillaggio) continue;
        miglior = { km, ix, iy, jx, jy, v };
      }
    }
    if (!miglior) continue;
    const v = miglior.v;
    tratte.push({ tipo: 'barcaiolo', km: miglior.km, giro: Infinity, isolata: true,
      rotta: { x: Float32Array.from([miglior.jx, miglior.ix]), y: Float32Array.from([miglior.jy, miglior.iy]) },
      a: { sito: v.sito, sorta: 'villaggio', x: v.x, y: v.y, rx: miglior.jx, ry: miglior.jy },
      b: { sito: -1, sorta: 'approdo', x: miglior.ix, y: miglior.iy, rx: miglior.ix, ry: miglior.iy } });
  }
}
