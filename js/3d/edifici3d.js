// Knight Dawn — kit degli edifici (M7, passo 5): case e edifici nominati di borgo, rocca e campagna, poi villaggi.
//
// Un solo kit, così borgo, rocca e campagna hanno lo stesso stile, medievale (1200–1400) con un tocco fantasy
// (richiesta dell'utente: niente case «finite» da Ottocento-Novecento): pietra (come le mura) e intonaco, piani alti
// a graticcio che sporgono, tetti ripidi e irregolari in paglia, scandole, lastre di pietra o coppi, con muschio;
// finestre piccole e poche, imposte di legno; pagliai, cataste e botti attorno. Tipi di casa: a schiera, bassa, casa-torre, con
// bottega, rurale (con fienile). Edifici nominati: stalla, taverna, fabbro, guaritore, mercato (banchi e loggia),
// chiesa e loggia grande (sede maggiore); nella rocca cappella, pozzo, sala d'armi, armeria.
//
// Prestazioni (docs/PRESTAZIONI.md, passo 6): i volumi di tutte le case si uniscono per materiale (una chiamata per
// materiale per tutto il kit); finestre, porte e comignoli sono istanze condivise, divise in zone di ~60 m che si
// spengono oltre DETTAGLIO.lontano m (THREE.LOD): da lontano restano i volumi (~50 triangoli a casa). Dettaglio dei
// muri e dei coppi in texture generate una volta. Collisioni: una scatola per edificio. Camera: una sagoma a scatole
// invisibile (il raycast non passa sulle geometrie vere, troppe).
//
// Coordinate: il kit lavora nelle coordinate locali (u, v) di chi lo usa (borgo, rocca: quelle del luogo; campagna:
// quelle del blocco) e porta i punti nel blocco con X(u, v), Z(u, v); le direzioni con la stessa rotazione (ux, uz).

import * as THREE from 'three';
import { prisma, unisci, rifinisci, materialeMuro, tonoDelLuogo, texturaAlone } from './rocca3d.js';

const COL = {
  pietra: '#aa9d87', intonaco: '#d2c6ad', tetto: '#ffffff', paglia: '#a8946a', legno: '#4a3220', finestra: '#1e1915',
};
/**
 * Coperture: pendenza (tangente) [min, max], spessore (m), tinta (moltiplica il colore per vertice: la texture dei
 * tetti è una sola, a lastre irregolari), muschio (quota di vertici verdi verso la gronda), sporto (m).
 * Per contesto, le probabilità di ciascuna.
 */
const TETTI = {
  coppi:    { falda: [0.42, 0.55], spessore: 0.2, tinta: [1.0, 0.6, 0.46], muschio: 0.35, sporto: 0.45 },
  scandole: { falda: [0.62, 0.9], spessore: 0.18, tinta: [0.5, 0.42, 0.34], muschio: 0.55, sporto: 0.5 },
  lastre:   { falda: [0.45, 0.62], spessore: 0.26, tinta: [0.74, 0.73, 0.7], muschio: 0.5, sporto: 0.35 },
  paglia:   { falda: [0.95, 1.25], spessore: 0.5, tinta: [1, 1, 1], muschio: 0.45, sporto: 0.65, paglia: true },
};
const COPERTURE = {
  borgo:    { coppi: 0.25, scandole: 0.35, lastre: 0.25, paglia: 0.15 },
  campagna: { coppi: 0.08, scandole: 0.25, lastre: 0.12, paglia: 0.55 },
  rocca:    { coppi: 0.3, scandole: 0.25, lastre: 0.45, paglia: 0 },
};
/**
 * Clima del luogo (M8, scelta dell'utente): case diverse al freddo, al temperato (come prima) e al caldo arido.
 * coperture: probabilità per ogni contesto, al posto di COPERTURE; sostituisci: la copertura data da un edificio (stalla
 * in paglia, chiesa in lastre…) diventa questa (null: una a caso tra le coperture del clima); tetti: modifiche a TETTI;
 * legno: quota di case a 2+ piani coi piani alti in tronchi (al posto del graticcio); graticcio: probabilità al posto di
 * GRATICCIO; intonaco: probabilità per le case (al posto di quella del tipo); tinte: tinte dell'intonaco, una per casa;
 * finestre: probabilità in più di saltarne una, scala, alzata (m), imposte (probabilità); porta: scala dell'altezza;
 * comignolo: probabilità e scala; cataste: catasta in più accanto alla porta; ballatoio: probabilità (case a 2+ piani);
 * forno: forno a cupola accanto alle case basse e rurali; campanile: 'tozzo' | 'vela'; colori: al posto di COL.
 */
const CLIMA = {
  temperato: {},
  freddo: {
    coperture: { lastre: 0.5, scandole: 0.5 }, sostituisci: { paglia: 'scandole', coppi: 'lastre' },
    tetti: { lastre: { falda: [0.26, 0.38], sporto: 0.95 }, scandole: { falda: [0.85, 1.1], sporto: 0.85 } },
    legno: 0.75, intonaco: 0.1, finestre: { salta: 0.2, scala: 0.75, alza: 0 }, comignolo: { p: 0.95, scala: 1.45 },
    cataste: 0.6, ballatoio: 0.35, campanile: 'tozzo',
  },
  caldo: {
    coperture: { terrazza: 0.65, coppi: 0.35 }, sostituisci: { paglia: null, scandole: null, lastre: null },
    tetti: { coppi: { falda: [0.16, 0.26], sporto: 0.3 } },
    graticcio: 0, intonaco: 0.9, tinte: [[1.08, 1.07, 1.04], [1.05, 0.93, 0.75], [1.02, 0.97, 0.88]],
    finestre: { salta: 0.2, scala: 0.6, alza: 0.45, imposte: 0.12 }, porta: 0.86, comignolo: { p: 0, scala: 1 },
    forno: 0.2, campanile: 'vela', colori: { intonaco: '#e4d8bd', pietra: '#b8a688' },
  },
};
// Tetto piatto a terrazza (clima caldo): solaio e parapetto basso nel materiale delle pareti.
const TERRAZZA = { sporto: 0.12, solaio: 0.25, parapetto: [0.5, 0.8], spessore: 0.22 };
const GRATICCIO = { borgo: 0.5, campagna: 0.2, rocca: 0.15, sporto: 0.45, passo: 1.4 };   // probabilità, m
const LUCE_RIFLESSA = 0.2;
const PIANO = 3.0;                         // m: altezza di un piano
const FALDA = 0.47;                        // tangente della pendenza dei tetti (~25°)
const SPORTO = 0.45;                       // m: sporto del tetto
// Irregolarità (richiesta dell'utente: spigoli non tutti lineari, l'idea delle pietre irregolari): pareti fuori
// squadra di ± fuoriSquadra m; cantonali alti `alto`, lunghi `lungo`, profondi `fondo` (m), sporgenti ~`sporge` m.
const IRREGOLARE = { fuoriSquadra: 0.08, alto: [0.32, 0.6], lungo: [0.45, 0.95], fondo: [0.25, 0.4], sporge: 0.025,
  // Cantonali solo su una parte degli spigoli e a tratti (utente: spigoli tutti pieni sembravano restauri di oggi).
  spigolo: 0.3, tratto: [0.3, 0.8], buco: 0.3 };
export const DETTAGLIO = { lontano: 160, zona: 60 };
// Luci notturne (M7, passo 7): finestre accese (emissive, quota secondo l'ora), torce a muro (fiamme a istanze e
// aloni in un solo oggetto per kit) e sorgenti per le PointLight più vicine al cavaliere (main.js).
export const LUCI = {
  finestra: [1.0, 0.52, 0.18], forzaFinestra: 0.9,
  torcia: { colore: '#ff9a40', intensita: 14, distanza: 14, alone: 2.2, altezza: 2.4 },
  forgia: { colore: '#ff6a20', intensita: 22, distanza: 12 },
};
/** Quota di finestre accese secondo l'ora (0–24): sera la metà, notte fonda poche, all'alba qualcuna. */
export function quotaFinestre(ora) {
  if (ora >= 17 && ora < 21) return 0.5;
  if (ora >= 21) return 0.3;
  if (ora < 4.5) return 0.08;
  return 0.25;
}
// Piede degli edifici: fascia di terra larga `largo` m, un sasso ogni ~passoSassi m con probabilità `sassi`, sassi
// di `sasso` m.
const BASE = { largo: [0.35, 0.65], passoSassi: 1.1, sassi: 0.45, sasso: [0.18, 0.5] };

/** Tipi di casa: larghezza (lungo la via) e profondità [min, max] in m, piani [min, max], intonaco (probabilità). */
export const TIPI_CASA = {
  schiera: { largo: [5.5, 8], fondo: [7, 9.5], piani: [2, 3], intonaco: 0.45 },
  bassa:   { largo: [5, 7], fondo: [6, 8], piani: [1, 1], intonaco: 0.25 },
  torre:   { largo: [4.5, 5.5], fondo: [4.5, 5.5], piani: [3, 4], intonaco: 0.1 },
  bottega: { largo: [6.5, 9], fondo: [8, 10], piani: [2, 2], intonaco: 0.5 },
  rurale:  { largo: [8, 11], fondo: [6.5, 8], piani: [1, 2], intonaco: 0.35 },
};

/** Edifici nominati: misure (largo × fondo, m), piani, materiale delle pareti. */
export const EDIFICI = {
  stalla:    { nome: 'Stalla', largo: 14, fondo: 7, piani: 1, intonaco: false, recinto: 8, copertura: 'paglia' },
  taverna:   { nome: 'Taverna', largo: 11, fondo: 9, piani: 2, intonaco: true, graticcio: true, copertura: 'scandole' },
  fabbro:    { nome: 'Fabbro', largo: 9, fondo: 7, piani: 1, intonaco: false, tettoia: 4 },
  guaritore: { nome: 'Guaritore', largo: 7, fondo: 7, piani: 2, intonaco: true, graticcio: true },
  loggia:    { nome: 'Loggia del mercato', largo: 10, fondo: 6, loggia: true },
  loggiaGrande: { nome: 'Loggia', largo: 16, fondo: 8, loggia: true },
  chiesa:    { nome: 'Chiesa', largo: 11, fondo: 22, piani: 3, intonaco: false, campanile: 4, copertura: 'lastre' },
  cappella:  { nome: 'Cappella', largo: 6, fondo: 10, piani: 2, intonaco: false, campanile: 1.8, copertura: 'lastre' },
  salaArmi:  { nome: "Sala d'armi", largo: 16, fondo: 9, piani: 2, intonaco: false, copertura: 'lastre' },
  armeria:   { nome: 'Armeria', largo: 8, fondo: 6, piani: 1, intonaco: false },
  // Dimora dei signori nella corte del signore (M7, passo 10b): piano nobile con bifore, cornici, stemma, scala esterna.
  // Più grandi delle case del borgo, in proporzione alla casata (richiesta dell'utente: «ben più maestoso»).
  palazzetto:      { nome: 'Palazzo del signore', largo: 15, fondo: 10, piani: 2, intonaco: false, palazzo: true, copertura: 'lastre' },
  palazzoMinore:   { nome: 'Palazzo del signore', largo: 20, fondo: 11, piani: 3, intonaco: false, palazzo: true, copertura: 'lastre' },
  palazzo:         { nome: 'Palazzo del signore', largo: 26, fondo: 13, piani: 3, intonaco: false, palazzo: true, copertura: 'lastre' },
  palazzoMaggiore: { nome: 'Palazzo del signore', largo: 32, fondo: 14, piani: 4, intonaco: false, palazzo: true, copertura: 'lastre' },
};

// ─── Texture (una volta) ──────────────────────────────────────────────────

let _tetto = null, _paglia = null, _intonaco = null;
const rndDa = (seme) => () => ((seme = (seme * 1103515245 + 12345) >>> 0) / 4294967296);
const lim = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Tetto (512 px = 6,4 m): file di elementi irregolari sovrapposti (lastre, scandole, coppi: la tinta per vertice fa il
 * resto), di larghezza e altezza diverse, col bordo basso consumato e l'ombra della fila sopra. Scala di grigi.
 */
function texturaTetto() {
  if (_tetto) return _tetto;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), rnd = rndDa(4242);
  g.fillStyle = 'rgb(60,55,50)';
  g.fillRect(0, 0, N, N);
  for (let y = 0; y < N;) {
    const h = 16 + Math.floor(rnd() * 16);
    let x = -Math.floor(rnd() * 40);
    while (x < N) {
      const w = 14 + Math.floor(rnd() * 34), v = 130 + Math.floor(rnd() * 100);
      for (const dx of [0, -N]) {
        const x0 = x + dx + 1, y0 = y - 4, hh = h + 4 + rnd() * 3;
        g.fillStyle = `rgb(${v},${v - 4},${v - 9})`;
        g.beginPath();
        g.moveTo(x0, y0); g.lineTo(x0 + w - 2, y0); g.lineTo(x0 + w - 2 - rnd() * 3, y0 + hh - 3);
        g.quadraticCurveTo(x0 + w / 2, y0 + hh + 3 * (rnd() - 0.3), x0 + rnd() * 3, y0 + hh - 2);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(15,10,8,0.35)'; g.fillRect(x0, y0 + hh - 2, w - 2, 2);
        if (rnd() < 0.3) { g.fillStyle = `rgba(30,25,20,${0.1 + rnd() * 0.2})`; g.fillRect(x0 + rnd() * w * 0.6, y0 + 2, 2 + rnd() * 6, hh * 0.7); }
      }
      x += w;
    }
    y += h;
  }
  // Le file in alto si ripetono in basso: la texture resta ripetibile anche in verticale (prima fila riscritta).
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * 16; d[i] = lim(d[i] + k); d[i + 1] = lim(d[i + 1] + k); d[i + 2] = lim(d[i + 2] + k); }
  g.putImageData(img, 0, 0);
  _tetto = new THREE.CanvasTexture(c);
  _tetto.colorSpace = THREE.SRGBColorSpace;
  _tetto.wrapS = _tetto.wrapT = THREE.RepeatWrapping;
  _tetto.anisotropy = 4;
  return _tetto;
}

/**
 * Terra al piede degli edifici (256 × 128 px: u lungo il muro, v dal muro verso fuori): terra battuta bruna, ghiaia,
 * chiazze di muschio e d'erba, più scura contro il muro; l'alpha cala verso fuori con un bordo frastagliato
 * (alphaTest: nessuna trasparenza da ordinare).
 */
let _base = null;
function texturaBase() {
  if (_base) return _base;
  const W = 256, H = 128, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rndDa(3131);
  const img = g.createImageData(W, H), d = img.data;
  const onda = (x) => 0.45 + 0.22 * Math.sin(x * 0.07) + 0.16 * Math.sin(x * 0.19 + 1.3) + 0.1 * Math.sin(x * 0.43 + 2.1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H, k = (y * W + x) * 4, rumore = rnd();
      const verso = Math.max(0, 1 - t * 1.2);                 // ombra di contatto: scura contro il muro
      let r0 = 92 - 50 * verso + (rumore - 0.5) * 30, g0 = 82 - 46 * verso + (rumore - 0.5) * 26, b0 = 62 - 36 * verso + (rumore - 0.5) * 20;
      d[k] = lim(r0); d[k + 1] = lim(g0); d[k + 2] = lim(b0);
      // Bordo sfumato a puntini: sempre piena contro il muro, poi sempre più rada fino a sparire (alphaTest).
      const bordo = 0.35 + 0.5 * onda(x);
      d[k + 3] = t < bordo * 0.4 || rnd() > (t - bordo * 0.4) / (bordo * 0.8) ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';                // ghiaia e chiazze solo dove c'è terra
  for (let k = 0; k < 120; k++) {
    const x = rnd() * W, y = rnd() * H, rr = 1 + rnd() * 2.5, v = 90 + Math.floor(rnd() * 60);
    g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
    g.beginPath(); g.ellipse(x, y, rr * 1.3, rr, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k < 30; k++) {
    const x = rnd() * W, y = rnd() * H, rr = 5 + rnd() * 14, muschio = rnd() < 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, muschio ? 'rgba(70,88,40,0.6)' : 'rgba(120,105,80,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
  _base = new THREE.CanvasTexture(c);
  _base.colorSpace = THREE.SRGBColorSpace;
  _base.wrapS = THREE.RepeatWrapping; _base.wrapT = THREE.ClampToEdgeWrapping;
  return _base;
}

/** Paglia (512 px = 6,4 m): fili lungo la falda (v), a mazzi in file orizzontali, toni dal dorato al grigio. */
function texturaPaglia() {
  if (_paglia) return _paglia;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), rnd = rndDa(777);
  g.fillStyle = 'rgb(150,135,100)';
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 5000; k++) {
    const x = rnd() * N, y = rnd() * N, l = 10 + rnd() * 40, v = 110 + Math.floor(rnd() * 120);
    g.strokeStyle = `rgba(${v + 15},${v + 5},${v - 25},${0.35 + rnd() * 0.4})`;
    g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + l); g.stroke();
  }
  for (let y = 0; y < N; y += 40 + Math.floor(rnd() * 20)) {   // bordi dei mazzi
    g.fillStyle = 'rgba(40,30,20,0.25)'; g.fillRect(0, y, N, 3);
  }
  _paglia = new THREE.CanvasTexture(c);
  _paglia.colorSpace = THREE.SRGBColorSpace;
  _paglia.wrapS = _paglia.wrapT = THREE.RepeatWrapping;
  _paglia.anisotropy = 4;
  return _paglia;
}

/** Intonaco (512 px = 6,4 m): chiaro, macchiato, dilavato, con qualche pietra che affiora dove è caduto. */
function texturaIntonaco() {
  if (_intonaco) return _intonaco;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), rnd = rndDa(9191);
  g.fillStyle = 'rgb(226,220,208)';
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 90; k++) {                                   // macchie e aloni
    const x = rnd() * N, y = rnd() * N, r = 10 + rnd() * 70, scuro = rnd() < 0.6;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, scuro ? `rgba(110,95,75,${0.06 + rnd() * 0.1})` : `rgba(255,250,240,${0.08 + rnd() * 0.1})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  for (let k = 0; k < 7; k++) {                                    // intonaco caduto: pietre a vista
    const x0 = rnd() * N, y0 = rnd() * N, w = 30 + rnd() * 60, h = 20 + rnd() * 40;
    for (let s = 0; s < 10; s++) {
      const v = 120 + Math.floor(rnd() * 60);
      g.fillStyle = `rgb(${v + 8},${v},${v - 8})`;
      g.beginPath();
      g.ellipse(x0 + rnd() * w, y0 + rnd() * h, 6 + rnd() * 8, 4 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let k = 0; k < 40; k++) {                                   // colature verticali
    const x = rnd() * N, y = rnd() * N, l = 30 + rnd() * 120;
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, `rgba(90,80,65,${0.08 + rnd() * 0.08})`); gr.addColorStop(1, 'rgba(90,80,65,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 4, l);
  }
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * 14; d[i] = lim(d[i] + k); d[i + 1] = lim(d[i + 1] + k); d[i + 2] = lim(d[i + 2] + k); }
  g.putImageData(img, 0, 0);
  _intonaco = new THREE.CanvasTexture(c);
  _intonaco.colorSpace = THREE.SRGBColorSpace;
  _intonaco.wrapS = _intonaco.wrapT = THREE.RepeatWrapping;
  _intonaco.anisotropy = 4;
  return _intonaco;
}

// ─── Geometrie ────────────────────────────────────────────────────────────

/** Solido a 6 facce da 4 punti sopra e 4 sotto ([x, y, z], stesso ordine), facce verso l'esterno. */
function esaedro(sopra, sotto) {
  const V = [...sotto, ...sopra];
  const C = [0, 1, 2].map((k) => V.reduce((s, v) => s + v[k], 0) / 8);
  const facce = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of facce) {
    const [a, b, c, d] = f.map((i) => V[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(...n) < 1e-9) {                     // primo triangolo degenere (timpani): l'altro
      const w2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      n = [w[1] * w2[2] - w[2] * w2[1], w[2] * w2[0] - w[0] * w2[2], w[0] * w2[1] - w[1] * w2[0]];
    }
    const fc = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - C[k]);
    const tri = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(...p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Costruzione a pezzi (M7 passo 9): un pezzo dura al più ~PEZZO_MS ms prima di cedere il passo (yield). */
export const PEZZO_MS = 3;
/** Porta a termine un generatore «a pezzi» in un colpo e ne restituisce il risultato. */
export function completaPezzi(gen) {
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

/**
 * Crea un kit di edifici.
 * @param {object} o
 * @param {(u:number, v:number) => number} o.X  da locale a blocco
 * @param {(u:number, v:number) => number} o.Z
 * @param {number} o.ux  rotazione delle direzioni (verso del luogo; 1, 0 per il blocco)
 * @param {number} o.uz
 * @param {(u:number, v:number) => number} o.terreno  quota del terreno nel punto locale
 * @param {object} [o.luogo]  per il tono di fondo della pietra (tonoDelLuogo)
 * @param {number} [o.seme]
 */
export function creaKit({ X, Z, ux = 1, uz = 0, terreno, luogo = null, seme = 1, nome = 'edifici', contesto = 'borgo', zone: quanteZone = 2, clima = 'temperato' }) {
  let s0 = (seme >>> 0) || 1;
  const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296);
  const tono = (c) => (luogo ? tonoDelLuogo(luogo, c) : new THREE.Color(c));
  const CL = CLIMA[clima] ?? CLIMA.temperato, col = { ...COL, ...CL.colori };
  const TT = Object.fromEntries(Object.entries(TETTI).map(([k, t]) => [k, { ...t, ...CL.tetti?.[k] }]));
  const mat = {
    pietra: materialeMuro(tono(col.pietra), LUCE_RIFLESSA),
    intonaco: materialeMuro(tono(col.intonaco), LUCE_RIFLESSA, texturaIntonaco()),
    tetto: materialeMuro(new THREE.Color(COL.tetto), LUCE_RIFLESSA * 0.6, texturaTetto()),
    paglia: materialeMuro(new THREE.Color(COL.paglia), LUCE_RIFLESSA, texturaPaglia()),
    legno: new THREE.MeshLambertMaterial({ color: col.legno, flatShading: true }),
    finestra: new THREE.MeshLambertMaterial({ color: COL.finestra }),
  };
  // Finestre accese: colore per istanza r = soglia (0–1); accesa se r < uQuota, quando è buio (uAccese).
  // Il colore per istanza non tinge la finestra (via color_fragment); nel frammento r187 lo segnala USE_COLOR.
  const uLuci = { uAccese: { value: 0 }, uQuota: { value: 0 } };
  mat.finestra.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uLuci);
    sh.fragmentShader = 'uniform float uAccese;\nuniform float uQuota;\n' + sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance += uAccese * step(vColor.r, uQuota) * vec3(${LUCI.finestra.map((x) => x.toFixed(2)).join(', ')}) * ${LUCI.forzaFinestra.toFixed(2)};
      #endif`);
  };
  mat.finestra.customProgramCacheKey = () => 'finestra-accesa';
  const torce = [];                                    // { u, v, y, fu, fv }
  const sorgenti = [];                                 // { x, y, z, colore, intensita, distanza } nel blocco
  mat.legno.emissive.set(col.legno).multiplyScalar(LUCE_RIFLESSA * 0.5);
  const parti = { pietra: [], intonaco: [], tetto: [], paglia: [], legno: [] };
  const scegli = (tabella) => { let x = rnd(); for (const [k, p] of Object.entries(tabella)) { if ((x -= p) < 0) return k; } return Object.keys(tabella)[0]; };
  /** Segna una geometria con tinta (moltiplica il colore), muschio (verde verso il basso) ed edera (verde al piede). */
  const segna = (g, o) => { Object.assign(g.userData, o); return g; };
  const sagome = [];                                   // scatole invisibili per la camera
  const piedi = [];                                    // fasce di terra attorno agli edifici (piede())
  const scatole = [];                                  // collisioni (locali)
  const dettagli = [];                                 // { tipo, u, v, y, fu, fv, sx, sy, sz }
  const edifici = [];                                  // edifici nominati: { tipo, nome, porta: { u, v, fu, fv } }
  let case_ = 0;
  const P = (u, v, y) => [X(u, v), y, Z(u, v)];
  const q4 = (pp) => pp.map(([u, v]) => [X(u, v), Z(u, v)]);

  /** Rettangolo locale: centro c, asse s (lungo la via), fronte f; mezze misure a (lungo s), b (lungo f). */
  const rett = (c, s, f, a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]].map(([i, j]) => [c[0] + s[0] * i + f[0] * j, c[1] + s[1] * i + f[1] * j]);

  /** Quote del terreno sotto un rettangolo (angoli, mezzerie, centro). */
  function quote(c, s, f, a, b) {
    let mn = Infinity, mx = -Infinity;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      const h = terreno(c[0] + s[0] * a * i + f[0] * b * j, c[1] + s[1] * a * i + f[1] * b * j);
      if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return { mn, mx };
  }

  /**
   * Tetto a due falde con colmo lungo s, da quota `gronda`, nello stile `stile` (TETTI): pendenza a caso nel suo
   * intervallo, colmo che si incurva un poco a metà, gronde non dritte, muschio; timpani nel materiale delle pareti.
   */
  function tetto(c, s, f, a, b, gronda, materialeTimpano, stile = scegli(CL.coperture ?? COPERTURE[contesto])) {
    if (CL.sostituisci && stile in CL.sostituisci) stile = CL.sostituisci[stile] ?? scegli(CL.coperture);
    if (stile === 'terrazza') return terrazza(c, s, f, a, b, gronda, materialeTimpano);
    const T = TT[stile], falda = T.falda[0] + rnd() * (T.falda[1] - T.falda[0]);
    const SP = T.sporto * (0.8 + rnd() * 0.4), A = a + SP * 0.8, Bf = b + SP;
    const colmo = gronda + b * falda, basso = gronda - SP * falda, cala = (0.05 + rnd() * 0.12) * a;
    const n = Math.max(2, Math.round(2 * A / 1.6));
    const yc = (t) => colmo - cala * Math.sin(Math.PI * t) + (rnd() - 0.5) * 0.04;   // colmo che si incurva
    const ridge = Array.from({ length: n + 1 }, (_, k) => yc(k / n));
    ridge[0] = colmo; ridge[n] = colmo;
    for (const lato of [-1, 1]) {
      const gr = Array.from({ length: n + 1 }, () => basso + (rnd() - 0.5) * 0.12 - (T.paglia ? 0.1 : 0));
      for (let k = 0; k < n; k++) {
        const i0 = -A + 2 * A * k / n, i1 = -A + 2 * A * (k + 1) / n;
        const sopra = [[i0, 0, ridge[k]], [i1, 0, ridge[k + 1]], [i1, lato * Bf, gr[k + 1]], [i0, lato * Bf, gr[k]]]
          .map(([i, j, y]) => P(c[0] + s[0] * i + f[0] * j, c[1] + s[1] * i + f[1] * j, y));
        const sotto = sopra.map(([x, y, z]) => [x, y - T.spessore, z]);
        const g = segna(esaedro(sopra, sotto), { tinta: T.tinta, muschio: T.muschio });
        g.userData.asse = [ux * s[0] - uz * s[1], uz * s[0] + ux * s[1]];   // file lungo il colmo, elementi lungo la falda
        (T.paglia ? parti.paglia : parti.tetto).push(g);
      }
    }
    for (const lato of [-1, 1]) {                       // timpani
      const pA = P(c[0] + s[0] * lato * a + f[0] * -b, c[1] + s[1] * lato * a + f[1] * -b, gronda);
      const pB = P(c[0] + s[0] * lato * a + f[0] * b, c[1] + s[1] * lato * a + f[1] * b, gronda);
      const pC = P(c[0] + s[0] * lato * a, c[1] + s[1] * lato * a, colmo - 0.05);
      const dx = (ux * s[0] - uz * s[1]) * -lato * 0.3, dz = (uz * s[0] + ux * s[1]) * -lato * 0.3;
      const sopra = [pA, pB, pC, pC], sotto = [pA, pB, pC, pC].map(([x, y, z]) => [x + dx, y, z + dz]);
      materialeTimpano.push(esaedro(sopra, sotto));
    }
    return { colmo, falda };
  }

  /**
   * Tetto piatto a terrazza (clima caldo): solaio che sporge appena e parapetto basso tutt'attorno, nel materiale delle
   * pareti; su una tettoia (pali di legno) solo il piano di legno, come un pergolato coperto.
   */
  function terrazza(c, s, f, a, b, gronda, materiale) {
    const T = TERRAZZA, A = a + T.sporto, B = b + T.sporto, Rs = rett(c, s, f, A, B), top = gronda + T.solaio;
    materiale.push(segna(prisma(q4(Rs), q4(Rs), gronda - 0.05, top), { muschio: 0.15 }));
    if (materiale === parti.legno) return { colmo: top, falda: 0 };
    const h = T.parapetto[0] + rnd() * (T.parapetto[1] - T.parapetto[0]), w = T.spessore;
    for (const j of [-1, 1]) {
      const Rf = rett([c[0] + f[0] * j * (B - w / 2), c[1] + f[1] * j * (B - w / 2)], s, f, A, w / 2);
      const Rl = rett([c[0] + s[0] * j * (A - w / 2), c[1] + s[1] * j * (A - w / 2)], s, f, w / 2, B - w);
      materiale.push(prisma(q4(Rf), q4(Rf), top, top + h), prisma(q4(Rl), q4(Rl), top, top + h));
    }
    return { colmo: top + h, falda: 0 };
  }

  /** Finestre e porte su una facciata (lungo s, normale `n`), `piani` piani da `pavimento`. */
  function facciata(c, s, n, a, piani, pavimento, { porta = 0, finestre = true, bottega = false, daPiano = 0, posti = null } = {}) {
    // Finestre piccole e poche, non allineate al millimetro; qualcuna con le imposte di legno aperte.
    const passo = 2.8, k = Math.max(1, Math.floor((2 * a - 1) / passo));
    for (let p = daPiano; p < piani; p++) {
      const slot = posti ?? Array.from({ length: k }, (_, i) => -a + 2 * a * (i + 0.5) / k);
      for (const t0 of slot) {
        const t = t0 + (rnd() - 0.5) * 0.4;
        if (p === 0 && porta && Math.abs(t) < (bottega ? 1.8 : 1.1)) continue;
        const FI = CL.finestre;
        if (!finestre || rnd() < (p === 0 ? 0.6 : 0.4) + (FI?.salta ?? 0)) continue;
        const y = pavimento + p * PIANO + (p === 0 ? 1.5 : 1.55) + (rnd() - 0.5) * 0.25 + (FI?.alza ?? 0);
        const sc = FI?.scala ?? 1;
        dettagli.push({ tipo: 'finestra', u: c[0] + s[0] * t + n[0] * 0.04, v: c[1] + s[1] * t + n[1] * 0.04, y, fu: n[0], fv: n[1],
          sx: (0.85 + rnd() * 0.35) * sc, sy: (0.85 + rnd() * 0.3) * sc });
        if (rnd() < (FI?.imposte ?? 0.45)) {                                // imposte aperte contro il muro
          for (const lato of [-1, 1]) {
            const tt = t + lato * 0.55;
            dettagli.push({ tipo: 'imposta', u: c[0] + s[0] * tt + n[0] * 0.07, v: c[1] + s[1] * tt + n[1] * 0.07, y, fu: n[0], fv: n[1] });
          }
        }
      }
    }
    if (porta) {
      dettagli.push({ tipo: 'porta', u: c[0] + n[0] * 0.05, v: c[1] + n[1] * 0.05, y: pavimento, fu: n[0], fv: n[1],
        ...(bottega ? { sx: 2.17, sy: 1.18 } : { sx: 0.9 + rnd() * 0.2, sy: (0.92 + rnd() * 0.12) * (CL.porta ?? 1) }) });   // portone: la stessa porta più grande
    }
  }

  /** Travi del graticcio su una facciata (centro c, lungo s, normale n), larga 2·a, tra y0 e y1. */
  function graticcio(c, s, n, a, y0, y1) {
    const sp = 0.06, h = y1 - y0, bay = Math.max(1.1, (2 * a) / Math.max(2, Math.round(2 * a / GRATICCIO.passo)));
    const nb = Math.round(2 * a / bay);
    const at = (t, y, o) => ({ u: c[0] + s[0] * t + n[0] * sp, v: c[1] + s[1] * t + n[1] * sp, y, fu: n[0], fv: n[1], ...o });
    dettagli.push({ tipo: 'trave', ...at(0, y0 + 0.12, { sx: 2 * a + 0.1, sy: 0.24, sz: 0.16 }) });     // dormiente
    dettagli.push({ tipo: 'trave', ...at(0, y1 - 0.1, { sx: 2 * a + 0.1, sy: 0.2, sz: 0.16 }) });       // corrente
    if (rnd() < 0.6) dettagli.push({ tipo: 'trave', ...at(0, y0 + h * 0.45, { sx: 2 * a, sy: 0.14, sz: 0.12 }) });
    const posti = [];
    for (let k = 0; k <= nb; k++) {
      const t = -a + 2 * a * k / nb + (k > 0 && k < nb ? (rnd() - 0.5) * 0.2 : 0);
      dettagli.push({ tipo: 'trave', ...at(t, (y0 + y1) / 2, { sx: 0.18, sy: h, sz: 0.15 }) });
      if (k < nb) posti.push(-a + 2 * a * (k + 0.5) / nb);
    }
    for (const k of [0, nb - 1]) {                          // controventi nelle campate di testa
      const t = -a + 2 * a * (k + 0.5) / nb, l = Math.hypot(bay, h - 0.3), ang = Math.atan2(h - 0.3, bay) * (k === 0 ? 1 : -1);
      dettagli.push({ tipo: 'trave', ...at(t, (y0 + y1) / 2, { sx: l, sy: 0.14, sz: 0.12, rot: ang }) });
    }
    return posti.slice(1, -1);                              // le finestre stanno nelle campate di mezzo
  }

  /**
   * Una casa (o il corpo di un edificio): zoccolo di pietra fino al terreno più basso, pareti, tetto, finestre.
   * c: centro; f: fronte (verso la via); largo lungo la via, fondo di traverso; quota: pavimento dato (rocca).
   * I piani alti possono essere a graticcio e sporgere (GRATICCIO); muschio ed edera al piede di alcune case.
   */
  function corpo({ c, f, largo, fondo, piani, intonaco, quota = null, porta = true, bottega = false, comignolo = true, finestre = true, retro = true, legno = null, copertura, tinta = null }) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2;
    const { mn, mx } = quote(c, s, f, a, b);
    const pavimento = (quota ?? mx) + 0.15;
    const R = rett(c, s, f, a, b);
    const umido = rnd() < 0.45 ? 1.2 + rnd() * 1.8 : 0;   // edera e muffa al piede (m)
    parti.pietra.push(segna(prisma(q4(R), q4(R), Math.min(mn, pavimento) - 0.6, pavimento + 0.5), { edera: umido, sporco: 1 }));   // zoccolo
    piede(c, s, f, a, b);
    const H = piani * PIANO, gronda = pavimento + H;
    // Pareti un po' fuori squadra (richiesta dell'utente: niente spigoli tutti lineari): ogni angolo spostato di
    // qualche cm, diverso alla base e in cima; il tetto sporge e copre la differenza.
    const storto = (RR) => RR.map(([u, v]) => [u + (rnd() - 0.5) * 2 * IRREGOLARE.fuoriSquadra, v + (rnd() - 0.5) * 2 * IRREGOLARE.fuoriSquadra]);
    let aGraticcio = legno ?? (piani >= 2 && rnd() < (CL.graticcio ?? GRATICCIO[contesto]));
    // Clima freddo: piani alti in tronchi al posto del graticcio (anche dove l'edificio lo chiede, come la taverna).
    const aTronchi = !!CL.legno && legno !== false && piani >= 2 && (aGraticcio || rnd() < CL.legno);
    if (aTronchi || CL.graticcio === 0) aGraticcio = false;
    let bT = b;                                               // mezza profondità del tetto (sporto del graticcio)
    const fr = [c[0] + f[0] * b, c[1] + f[1] * b], rt = [c[0] - f[0] * b, c[1] - f[1] * b];
    if (aGraticcio) {
      // Piano terra in pietra, piani alti intonacati a graticcio che sporgono davanti e dietro.
      parti.pietra.push(segna(prisma(q4(storto(R)), q4(storto(R)), pavimento + 0.5, pavimento + PIANO), { edera: umido }));
      const j = GRATICCIO.sporto, Rj = rett(c, s, f, a, b + j);
      bT = b + j;
      parti.intonaco.push(prisma(q4(storto(Rj)), q4(storto(Rj)), pavimento + PIANO, gronda));
      parti.legno.push(prisma(q4(Rj), q4(Rj), pavimento + PIANO - 0.22, pavimento + PIANO));   // testate dei travetti
      for (let p = 1; p < piani; p++) {
        const y0 = pavimento + p * PIANO, y1 = y0 + PIANO;
        const pf = graticcio([c[0] + f[0] * bT, c[1] + f[1] * bT], s, f, a, y0, y1);
        const pr = graticcio([c[0] - f[0] * bT, c[1] - f[1] * bT], s, [-f[0], -f[1]], a, y0, y1);
        for (const lato of [-1, 1]) graticcio([c[0] + s[0] * lato * a, c[1] + s[1] * lato * a], [f[0], f[1]], [s[0] * lato, s[1] * lato], bT, y0, y1);
        facciata([c[0] + f[0] * bT, c[1] + f[1] * bT], s, f, a, p + 1, pavimento, { finestre, daPiano: p, posti: pf });
        if (retro) facciata([c[0] - f[0] * bT, c[1] - f[1] * bT], s, [-f[0], -f[1]], a, p + 1, pavimento, { finestre, daPiano: p, posti: pr });
      }
      facciata(fr, s, f, a, 1, pavimento, { porta, finestre, bottega });
    } else if (aTronchi) {
      // Piano terra in pietra, piani alti in tronchi scuri che sporgono un poco; a volte un ballatoio sul davanti.
      parti.pietra.push(segna(prisma(q4(storto(R)), q4(storto(R)), pavimento + 0.5, pavimento + PIANO), { edera: umido }));
      const j = 0.22, Rj = rett(c, s, f, a + j, b + j), tn = 0.85 + rnd() * 0.3;
      bT = b + j;
      parti.legno.push(segna(prisma(q4(storto(Rj)), q4(storto(Rj)), pavimento + PIANO - 0.1, gronda), { tinta: [tn * 1.75, tn * 1.5, tn * 1.25] }));
      facciata([c[0] + f[0] * bT, c[1] + f[1] * bT], s, f, a, piani, pavimento, { finestre, daPiano: 1 });
      if (retro) facciata([c[0] - f[0] * bT, c[1] - f[1] * bT], s, [-f[0], -f[1]], a, piani, pavimento, { finestre, daPiano: 1 });
      facciata(fr, s, f, a, 1, pavimento, { porta, finestre, bottega });
      if (rnd() < (CL.ballatoio ?? 0)) {
        const y = pavimento + PIANO, L = a * (0.55 + rnd() * 0.3), t0 = (rnd() - 0.5) * (a - L), d = 1.0;
        const cb = [c[0] + s[0] * t0 + f[0] * (bT + d / 2), c[1] + s[1] * t0 + f[1] * (bT + d / 2)];
        const Rb = rett(cb, s, f, L, d / 2), Rp = rett([cb[0] + f[0] * (d / 2 - 0.04), cb[1] + f[1] * (d / 2 - 0.04)], s, f, L, 0.04);
        parti.legno.push(prisma(q4(Rb), q4(Rb), y - 0.16, y), prisma(q4(Rp), q4(Rp), y, y + 0.95));
        for (const k of [-1, 1]) {                            // mensole sotto il ballatoio
          const Rm = rett([cb[0] + s[0] * k * (L - 0.2), cb[1] + s[1] * k * (L - 0.2)], s, f, 0.08, d / 2);
          parti.legno.push(prisma(q4(Rm), q4(Rm), y - 0.6, y - 0.16));
        }
      }
    } else {
      (intonaco ? parti.intonaco : parti.pietra).push(segna(prisma(q4(storto(R)), q4(storto(R)), pavimento + 0.5, gronda), intonaco ? { edera: 0, tinta } : { edera: umido }));
      cantonali(c, s, f, a, b, pavimento + 0.5, gronda);
      facciata(fr, s, f, a, piani, pavimento, { porta, finestre, bottega });
      if (retro) facciata(rt, s, [-f[0], -f[1]], a, piani, pavimento, { finestre });
    }
    const { colmo, falda } = tetto(c, s, f, a, bT, gronda, aTronchi ? parti.legno : aGraticcio || intonaco ? parti.intonaco : parti.pietra, copertura);
    if (comignolo && rnd() < (CL.comignolo?.p ?? 0.7)) {
      const t = (rnd() - 0.5) * a, dq = -bT * (0.2 + rnd() * 0.4), k = CL.comignolo?.scala ?? 1;
      dettagli.push({ tipo: 'comignolo', u: c[0] + s[0] * t + f[0] * dq, v: c[1] + s[1] * t + f[1] * dq,
        y: gronda + (bT + dq) * falda - 0.3, fu: f[0], fv: f[1], sx: (0.8 + rnd() * 0.5) * k, sy: (0.7 + rnd() * 0.8) * k, sz: (0.8 + rnd() * 0.4) * k });
    }
    // Sagoma per la camera e collisione.
    sagome.push(prisma(q4(R), q4(R), Math.min(mn, pavimento) - 0.5, colmo));
    scatole.push({ cu: c[0], cv: c[1], au: s[0], av: s[1], hl: a + 0.05, hw: b + 0.05 });
    return { pavimento, gronda, colmo, s, a, b };
  }

  /**
   * Piede dell'edificio (richiesta dell'utente: che sembri appoggiato sul terreno, non staccato): una fascia di terra
   * battuta, polvere, ghiaia e muschio attorno alla pianta, col bordo esterno irregolare (texture con alpha), e
   * qualche sasso mezzo interrato lungo il muro. La fascia si disegna sempre (pochi triangoli), i sassi spariscono da
   * lontano con gli altri dettagli.
   */
  function piede(c, s, f, a, b, largo = BASE.largo[0] + rnd() * (BASE.largo[1] - BASE.largo[0])) {
    piedi.push({ c, s, f, a, b, w: largo });
    const giro = 2 * (2 * a + 2 * b);
    for (let k = 0, n = Math.round(giro / BASE.passoSassi); k < n; k++) {
      if (rnd() > BASE.sassi) continue;
      let t = rnd() * giro, i, j;                            // punto sul perimetro
      if (t < 2 * a) { i = -a + t; j = -b; } else if ((t -= 2 * a) < 2 * b) { i = a; j = -b + t; } else if ((t -= 2 * b) < 2 * a) { i = a - t; j = b; } else { t -= 2 * a; i = -a; j = b - t; }
      const fuori = 0.12 + rnd() * 0.35, ni = Math.sign(i) * (Math.abs(i) >= a - 1e-6 ? 1 : 0), nj = Math.sign(j) * (Math.abs(j) >= b - 1e-6 ? 1 : 0);
      const u = c[0] + s[0] * (i + ni * fuori) + f[0] * (j + nj * fuori), v = c[1] + s[1] * (i + ni * fuori) + f[1] * (j + nj * fuori);
      const dim = BASE.sasso[0] + rnd() * (BASE.sasso[1] - BASE.sasso[0]), ang = rnd() * Math.PI * 2;
      const sy = dim * (0.45 + rnd() * 0.35);                 // mezzo interrato: si vede poco più di metà
      dettagli.push({ tipo: 'sasso', u, v, y: terreno(u, v) + sy * 0.12, fu: Math.cos(ang), fv: Math.sin(ang), rot: (rnd() - 0.5) * 0.6,
        sx: dim * (0.9 + rnd() * 0.6), sy, sz: dim * (0.8 + rnd() * 0.5) });
    }
  }

  /**
   * Cantonali: blocchi di pietra agli spigoli verticali, di misure diverse e alternati una volta lungo un lato e una
   * lungo l'altro, che sporgono di qualche cm (lo spigolo si legge dentellato, come nelle murature vere). Dettagli a
   * istanze: da lontano spariscono con le finestre.
   */
  function cantonali(c, s, f, a, b, y0, y1, tutti = false) {
    const I = IRREGOLARE;
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      if (!tutti && rnd() > I.spigolo) continue;              // solo alcuni spigoli
      let y = y0, k = rnd() < 0.5 ? 0 : 1;
      const fine = tutti ? y1 : y0 + (y1 - y0) * (I.tratto[0] + rnd() * (I.tratto[1] - I.tratto[0]));
      while (y < fine - 0.15) {
        const h = Math.min(fine - y, I.alto[0] + rnd() * (I.alto[1] - I.alto[0]));
        if (rnd() < I.buco) { y += h; k++; continue; }       // a tratti: qua e là la pietra d'angolo manca
        const L = I.lungo[0] + rnd() * (I.lungo[1] - I.lungo[0]), D = I.fondo[0] + rnd() * (I.fondo[1] - I.fondo[0]);
        const sp = I.sporge * (0.5 + rnd());
        const lungoS = (k++ % 2) === 0;                     // il lato lungo del blocco: lungo s o lungo f
        const ls = lungoS ? L : D, lf = lungoS ? D : L;
        const du = i * (a - ls / 2 + sp), dv = j * (b - lf / 2 + sp);
        dettagli.push({ tipo: 'cantonale', u: c[0] + s[0] * du + f[0] * dv, v: c[1] + s[1] * du + f[1] * dv, y: y + h / 2,
          fu: f[0], fv: f[1], sx: ls, sy: h - 0.03, sz: lf });
        y += h;
      }
    }
  }

  /** Casa di un tipo (TIPI_CASA), misure a caso nel tipo salvo quelle date. */
  function casa({ u, v, fu, fv, tipo = 'schiera', largo, fondo, quota = null }) {
    const T = TIPI_CASA[tipo] ?? TIPI_CASA.schiera;
    const L = largo ?? T.largo[0] + rnd() * (T.largo[1] - T.largo[0]);
    const F = fondo ?? T.fondo[0] + rnd() * (T.fondo[1] - T.fondo[0]);
    const piani = T.piani[0] + Math.floor(rnd() * (T.piani[1] - T.piani[0] + 1));
    const tinte = CL.tinte, tinta = tinte ? tinte[Math.floor(rnd() * tinte.length)] : null;
    const r = corpo({ c: [u, v], f: [fu, fv], largo: L, fondo: F, piani, intonaco: rnd() < (CL.intonaco ?? T.intonaco), quota, bottega: tipo === 'bottega', tinta });
    if ((tipo === 'rurale' || tipo === 'bassa') && rnd() < (CL.forno ?? 0)) {   // caldo: forno a cupola accanto alla casa
      const lato = rnd() < 0.5 ? -1 : 1, d = r.a + 1.5;
      forno(u + r.s[0] * lato * d + fu * r.b * 0.3, v + r.s[1] * lato * d + fv * r.b * 0.3, tinta);
    }
    if (rnd() < (CL.cataste ?? 0)) {                       // freddo: legna accatastata accanto alla porta
      const lato = rnd() < 0.5 ? -1 : 1, t = r.a * 0.62;
      catasta(u + r.s[0] * lato * t + fu * (r.b + 0.45), v + r.s[1] * lato * t + fv * (r.b + 0.45), fu, fv, 0.85);
    }
    if (tipo === 'rurale') {
      const lato = rnd() < 0.5 ? -1 : 1;
      if (rnd() < 0.6) {                                 // fienile: tettoia su pali accanto alla casa
        const w = 4.5, c2 = [u + r.s[0] * lato * (r.a + w / 2 + 0.2), v + r.s[1] * lato * (r.a + w / 2 + 0.2)];
        tettoia(c2, [fu, fv], w, F * 0.9, r.pavimento + 3.2);
      }
      if (rnd() < 0.7) {                                  // pagliaio sull'aia, davanti di lato
        const d = r.a + 3 + rnd() * 3;
        pagliaio(u - r.s[0] * lato * d + fu * (r.b + 4), v - r.s[1] * lato * d + fv * (r.b + 4));
      }
      if (rnd() < 0.5) catasta(u - fu * (r.b + 0.65), v - fv * (r.b + 0.65), -fu, -fv);   // legna contro il retro
    } else if (rnd() < 0.25) {                            // in borgo: botti o legna accanto alla porta
      const lato = rnd() < 0.5 ? -1 : 1, t = r.a * 0.6;
      if (rnd() < 0.5) botte(u + r.s[0] * lato * t + fu * (r.b + 0.5), v + r.s[1] * lato * t + fv * (r.b + 0.5));
      else catasta(u + r.s[0] * lato * t + fu * (r.b + 0.45), v + r.s[1] * lato * t + fv * (r.b + 0.45), fu, fv, 0.7);
    }
    case_++;
    return r;
  }

  /** Forno a cupola (clima caldo): base tonda e cupola d'intonaco, una bocca scura. */
  function forno(u, v, tinta = null) {
    const h0 = terreno(u, v), r0 = 0.85 + rnd() * 0.25;
    const b0 = new THREE.CylinderGeometry(r0, r0 * 1.05, 0.7, 10); b0.translate(X(u, v), h0 + 0.3, Z(u, v));
    const cu = new THREE.SphereGeometry(r0 * 0.95, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2); cu.translate(X(u, v), h0 + 0.65, Z(u, v));
    parti.intonaco.push(segna(b0, { tinta, sporco: 1 }), segna(cu, { tinta }));
    const ang = rnd() * Math.PI * 2, fu = Math.cos(ang), fv = Math.sin(ang);
    dettagli.push({ tipo: 'finestra', u: u + fu * (r0 * 0.9), v: v + fv * (r0 * 0.9), y: h0 + 0.55, fu, fv, sx: 0.7, sy: 0.5 });
    scatole.push({ cu: u, cv: v, au: 1, av: 0, hl: r0, hw: r0, cima: h0 + 0.65 + r0 });
    sagome.push(prisma(q4(rett([u, v], [1, 0], [0, 1], r0, r0)), q4(rett([u, v], [1, 0], [0, 1], r0, r0)), h0, h0 + 0.6 + r0));
  }
  /** Pagliaio: covone tondo di paglia attorno a un palo. */
  function pagliaio(u, v) {
    const h0 = terreno(u, v), r0 = 1.4 + rnd() * 0.5, h = 1.2 + rnd() * 0.6;
    const c1 = new THREE.CylinderGeometry(r0, r0 * 0.92, h, 10, 1, false); c1.translate(X(u, v), h0 + h / 2 - 0.1, Z(u, v));
    const c2 = new THREE.ConeGeometry(r0 * 1.06, 1.8 + rnd() * 0.8, 10); c2.translate(X(u, v), h0 + h + 0.8, Z(u, v));
    parti.paglia.push(segna(c1, { muschio: 0.2 }), segna(c2, { muschio: 0.3 }));
    const Rp = rett([u, v], [1, 0], [0, 1], 0.06, 0.06);
    parti.legno.push(prisma(q4(Rp), q4(Rp), h0 + h, h0 + h + 3.2));
    scatole.push({ cu: u, cv: v, au: 1, av: 0, hl: r0, hw: r0 });
    sagome.push(prisma(q4(rett([u, v], [1, 0], [0, 1], r0, r0)), q4(rett([u, v], [1, 0], [0, 1], r0, r0)), h0, h0 + h + 2));
  }
  /** Catasta di legna (contro un muro, facciata verso f). */
  function catasta(u, v, fu, fv, scala = 1) {
    const f = [fu, fv], s = [-fv, fu], h0 = terreno(u, v), L = (1.6 + rnd() * 1.2) * scala, H = (0.8 + rnd() * 0.6) * scala;
    const R = rett([u, v], s, f, L / 2, 0.4 * scala);
    parti.legno.push(segna(prisma(q4(R), q4(R), h0 - 0.1, [h0 + H, h0 + H * 0.9, h0 + H * 0.95, h0 + H]), { tinta: [1.35, 1.2, 1.05] }));
    scatole.push({ cu: u, cv: v, au: s[0], av: s[1], hl: L / 2, hw: 0.4 * scala, cima: h0 + H });   // si scavalca se bassa
  }
  /** Botte (o due), di legno. */
  function botte(u, v) {
    for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
      const du = (k ? 0.85 : 0), h0 = terreno(u + du, v);
      const g = new THREE.CylinderGeometry(0.36, 0.42, 0.95, 9); g.translate(X(u + du, v), h0 + 0.47, Z(u + du, v));
      parti.legno.push(segna(g, { tinta: [1.3, 1.15, 1.0] }));
    }
    scatole.push({ cu: u + 0.4, cv: v, au: 1, av: 0, hl: 0.9, hw: 0.45, cima: Math.max(terreno(u, v), terreno(u + 0.85, v)) + 0.95 });
  }

  /** Tettoia su quattro pali (fienile, fabbro). */
  /**
   * Palazzo dei signori: corpo in pietra senza le finestre del kit; piano terra con finestrelle e portone, piano nobile
   * con bifore (due luci alte affiancate), ultimo piano con finestre medie; cornici di pietra tra i piani, stemma sopra il
   * portone; se è abbastanza largo, scala esterna in pietra con pianerottolo e porta al piano nobile.
   */
  function palazzo(c, f, E, quota) {
    const s = [-f[1], f[0]], a = E.largo / 2, b = E.fondo / 2;
    const r = corpo({ c, f, largo: E.largo, fondo: E.fondo, piani: E.piani, intonaco: false, quota, porta: true, finestre: false,
      retro: false, legno: false, copertura: E.copertura });
    const pav = r.pavimento, fr = [c[0] + f[0] * b, c[1] + f[1] * b];
    const su = (t, o = 0.04) => [fr[0] + s[0] * t + f[0] * o, fr[1] + s[1] * t + f[1] * o];
    const conScala = 2 * a >= 18;
    const Ls = PIANO / 0.62, tAlto = a - 1 - Ls, tPian = tAlto - 1;          // scala: dal capo verso il centro
    // Finestre.
    const k = Math.max(2, Math.floor((2 * a - 2) / 3.4));
    for (let p = 0; p < E.piani; p++) {
      for (let i = 0; i < k; i++) {
        const t = -a + 2 * a * (i + 0.5) / k;
        if (p === 0 && Math.abs(t) < 2) continue;                          // portone
        if (conScala && p <= 1 && t > tPian - 1.6) continue;                // dietro la scala e la porta del piano nobile
        const nobile = p === 1, y = pav + p * PIANO + (p === 0 ? 1.6 : nobile ? 1.25 : 1.5);
        for (const o of nobile ? [-0.42, 0.42] : [0]) {
          const [u, v] = su(t + o);
          dettagli.push({ tipo: 'finestra', u, v, y, fu: f[0], fv: f[1], sx: p === 0 ? 0.75 : nobile ? 0.66 : 0.95, sy: p === 0 ? 0.8 : nobile ? 2.1 : 1.2 });
        }
        if (nobile) {                                                      // davanzale sotto la bifora
          const [u, v] = su(t, 0.12), R2 = rett([u, v], s, f, 0.9, 0.1);
          parti.pietra.push(prisma(q4(R2), q4(R2), y - 0.12, y - 0.02));
        }
      }
    }
    // Cornici (marcapiani) tra i piani, lungo la facciata.
    for (let p = 1; p < E.piani; p++) {
      const y = pav + p * PIANO, [u, v] = su(0, 0.1), R2 = rett([u, v], s, f, a + 0.1, 0.14);
      parti.pietra.push(prisma(q4(R2), q4(R2), y - 0.14, y + 0.1));
    }
    // Stemma della casata sopra il portone: scudo di legno dipinto in una cornice di pietra.
    {
      const [u, v] = su(0, 0.1), Rc = rett([u, v], s, f, 0.62, 0.08), [u2, v2] = su(0, 0.17), Rs = rett([u2, v2], s, f, 0.48, 0.06);
      parti.pietra.push(prisma(q4(Rc), q4(Rc), pav + 2.75, pav + 4.05));
      parti.legno.push(prisma(q4(Rs), q4(Rs), pav + 2.85, [pav + 3.95, pav + 3.95, pav + 3.95, pav + 3.95]));
    }
    if (conScala) {
      // Scala esterna lungo la facciata: sale dal capo (t = a − 1) verso il centro fino al pianerottolo del piano nobile.
      const w = 1.4, off = b + w / 2 + 0.05, yT = pav + PIANO;
      const P4 = (t0, t1) => [[t0, off - w / 2], [t1, off - w / 2], [t1, off + w / 2], [t0, off + w / 2]]
        .map(([t, d]) => [c[0] + s[0] * t + f[0] * d, c[1] + s[1] * t + f[1] * d]);
      const gr = P4(a - 1, tAlto), pi = P4(tAlto, tPian - 1.2);
      parti.pietra.push(prisma(q4(gr), q4(gr), pav - 0.5, [pav + 0.05, yT, yT, pav + 0.05]));
      parti.pietra.push(prisma(q4(pi), q4(pi), pav - 0.5, yT));
      // Parapetto sul lato esterno della scala e del pianerottolo.
      const par = (t0, t1, y0, y1) => {
        const pp = [[t0, off + w / 2], [t1, off + w / 2], [t1, off + w / 2 + 0.25], [t0, off + w / 2 + 0.25]]
          .map(([t, d]) => [c[0] + s[0] * t + f[0] * d, c[1] + s[1] * t + f[1] * d]);
        parti.pietra.push(prisma(q4(pp), q4(pp), pav - 0.3, [y0 + 0.9, y1 + 0.9, y1 + 0.9, y0 + 0.9]));
      };
      par(a - 1, tAlto, pav + 0.05, yT);
      par(tAlto, tPian - 1.2, yT, yT);
      // Porta del piano nobile sul pianerottolo.
      const [u, v] = su(tPian - 0.1, 0.05);
      dettagli.push({ tipo: 'porta', u, v, y: yT, fu: f[0], fv: f[1], sx: 0.95, sy: 1.05 });
      const cs = [c[0] + s[0] * ((a - 1 + tPian - 1.2) / 2) + f[0] * off, c[1] + s[1] * ((a - 1 + tPian - 1.2) / 2) + f[1] * off];
      scatole.push({ cu: cs[0], cv: cs[1], au: s[0], av: s[1], hl: (a - 1 - (tPian - 1.2)) / 2, hw: w / 2 + 0.3 });
      sagome.push(prisma(q4(gr), q4(gr), pav - 0.5, yT));
    }
    return r;
  }

  function tettoia(c, f, largo, fondo, gronda) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2;
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const pu = c[0] + s[0] * (a - 0.2) * i + f[0] * (b - 0.2) * j, pv = c[1] + s[1] * (a - 0.2) * i + f[1] * (b - 0.2) * j;
      const R = rett([pu, pv], s, f, 0.13, 0.13);
      parti.legno.push(prisma(q4(R), q4(R), terreno(pu, pv) - 0.3, gronda));
    }
    tetto(c, s, f, a, b, gronda, parti.legno, rnd() < 0.6 ? 'scandole' : 'paglia');
    scatole.push({ cu: c[0], cv: c[1], au: s[0], av: s[1], hl: a, hw: b });
    sagome.push(prisma(q4(rett(c, s, f, a, b)), q4(rett(c, s, f, a, b)), gronda - 0.5, gronda + b * FALDA));
  }

  /** Loggia: tetto su pilastri di pietra, aperta. */
  function loggia(c, f, largo, fondo, quota) {
    const s = [-f[1], f[0]], a = largo / 2, b = fondo / 2, { mn, mx } = quote(c, s, f, a, b);
    const pav = (quota ?? mx) + 0.15, gronda = pav + 4.2;
    const R = rett(c, s, f, a, b);
    parti.pietra.push(prisma(q4(R), q4(R), Math.min(mn, pav) - 0.6, pav));                  // pavimento rialzato
    const n = Math.max(2, Math.round(largo / 3.5));
    for (let i = 0; i <= n; i++) for (const j of [-1, 1]) {
      const t = -a + 0.4 + (2 * a - 0.8) * i / n, pu = c[0] + s[0] * t + f[0] * (b - 0.4) * j, pv = c[1] + s[1] * t + f[1] * (b - 0.4) * j;
      const Rp = rett([pu, pv], s, f, 0.3, 0.3);
      parti.pietra.push(prisma(q4(Rp), q4(Rp), pav, gronda));
      scatole.push({ cu: pu, cv: pv, au: s[0], av: s[1], hl: 0.32, hw: 0.32 });
    }
    const Rt = rett(c, s, f, a, b);                                                         // architrave
    parti.pietra.push(prisma(q4(Rt), q4(Rt), gronda - 0.5, gronda));
    const { colmo } = tetto(c, s, f, a, b, gronda, parti.pietra, rnd() < 0.5 ? 'coppi' : 'lastre');
    sagome.push(prisma(q4(Rt), q4(Rt), gronda - 0.5, colmo));
    return { pavimento: pav };
  }

  /**
   * Campanile a vela (clima caldo): un muro alto sopra la facciata, largo poco più del campanile, con due luci per le
   * campane e un coronamento; s, f: assi dell'edificio.
   */
  function vela(c, s, f, lato, base, alto) {
    const a = lato * 0.75, R = rett(c, s, f, a, 0.4), Rc = rett(c, s, f, a + 0.15, 0.5);
    parti.pietra.push(prisma(q4(R), q4(R), base, alto), prisma(q4(Rc), q4(Rc), alto, alto + 0.3));
    for (const n of [-1, 1]) for (const t of [-a * 0.45, a * 0.45]) {
      dettagli.push({ tipo: 'finestra', u: c[0] + s[0] * t + f[0] * n * 0.43, v: c[1] + s[1] * t + f[1] * n * 0.43, y: alto - 1.6,
        fu: f[0] * n, fv: f[1] * n, sx: lato * 0.4, sy: 1.7 });
    }
    sagome.push(prisma(q4(R), q4(R), base, alto + 0.3));
    scatole.push({ cu: c[0], cv: c[1], au: s[0], av: s[1], hl: a, hw: 0.4 });
  }

  /** Campanile (quadrato, tetto a piramide; tozzo al freddo: la piramide più bassa). */
  function campanile(c, lato, base, alto, tozzo = false) {
    const h = lato / 2, R = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([i, j]) => [c[0] + i, c[1] + j]);
    parti.pietra.push(prisma(q4(R), q4(R), base, alto));
    cantonali(c, [1, 0], [0, 1], h, h, base, alto, true);
    const cima = P(c[0], c[1], alto + lato * (tozzo ? 0.55 : 0.9)), Rs = R.map(([u, v]) => P(u + Math.sign(u - c[0]) * 0.25, v + Math.sign(v - c[1]) * 0.25, alto));
    for (let k = 0; k < 4; k++) {
      const A = Rs[k], B = Rs[(k + 1) % 4];
      parti.tetto.push(segna(esaedro([A, B, cima, cima], [A, B, cima, cima].map(([x, y, z]) => [x, y - 0.15, z])), { tinta: TETTI.lastre.tinta, muschio: 0.3 }));
    }
    // Cella campanaria: aperture scure sui quattro lati.
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      dettagli.push({ tipo: 'finestra', u: c[0] + nu * (h + 0.03), v: c[1] + nv * (h + 0.03), y: alto - 2.4, fu: nu, fv: nv, sx: lato * 0.72, sy: 1.9 });
    }
    sagome.push(prisma(q4(R), q4(R), base, alto + lato * (tozzo ? 0.55 : 0.9)));
    scatole.push({ cu: c[0], cv: c[1], au: 1, av: 0, hl: h, hw: h });
  }

  /**
   * Edificio nominato (EDIFICI). Restituisce le misure occupate (largo, fondo con gli annessi) per i lotti.
   */
  function edificio(tipo, { u, v, fu, fv, quota = null, misure = null }) {
    // `misure` ({ largo, fondo, piani }): al posto di quelle di EDIFICI (il palazzo si restringe dove la cinta è stretta).
    const E = misure ? { ...EDIFICI[tipo], ...misure } : EDIFICI[tipo], f = [fu, fv], s = [-fv, fu], c = [u, v];
    let r;
    if (E.loggia) r = loggia(c, f, E.largo, E.fondo, quota);
    else if (E.palazzo) r = palazzo(c, f, E, quota);
    else r = corpo({ c, f, largo: E.largo, fondo: E.fondo, piani: E.piani, intonaco: E.intonaco, quota, bottega: tipo === 'stalla' || tipo === 'fabbro',
      comignolo: tipo !== 'chiesa' && tipo !== 'cappella', legno: E.graticcio ?? false, copertura: E.copertura });
    if (tipo === 'taverna') { botte(u + s[0] * (E.largo / 2 - 1.5) + f[0] * (E.fondo / 2 + 0.55), v + s[1] * (E.largo / 2 - 1.5) + f[1] * (E.fondo / 2 + 0.55)); }
    if (tipo === 'fabbro') catasta(u - s[0] * (E.largo / 2 - 1.6) + f[0] * (E.fondo / 2 + 0.5), v - s[1] * (E.largo / 2 - 1.6) + f[1] * (E.fondo / 2 + 0.5), f[0], f[1], 0.8);
    if (E.campanile) {
      const l = E.campanile, cc = [u + s[0] * (E.largo / 2 - l / 2) + f[0] * (E.fondo / 2 - l / 2), v + s[1] * (E.largo / 2 - l / 2) + f[1] * (E.fondo / 2 - l / 2)];
      const sopra = (tipo === 'chiesa' ? 9 : 2.2) * (CL.campanile === 'tozzo' ? 0.5 : 1);
      if (CL.campanile === 'vela') {                    // sulla facciata, al centro
        const cv = [u + f[0] * (E.fondo / 2 - 0.4), v + f[1] * (E.fondo / 2 - 0.4)];
        vela(cv, s, f, l, r.gronda - 0.5, Math.max(r.colmo, r.gronda) + (tipo === 'chiesa' ? 5 : 2.5));
      } else campanile(cc, l, r.gronda - 0.5, r.colmo + sopra, CL.campanile === 'tozzo');
    }
    if (E.tettoia) tettoia([u + s[0] * (E.largo / 2 + E.tettoia / 2 + 0.2), v + s[1] * (E.largo / 2 + E.tettoia / 2 + 0.2)], f, E.tettoia, E.fondo * 0.9, r.pavimento + 3);
    if (E.recinto) {                                    // recinto di pali e due traverse, accanto alla stalla
      const w = E.recinto, cc = [u + s[0] * (E.largo / 2 + w / 2 + 0.5), v + s[1] * (E.largo / 2 + w / 2 + 0.5)], b = E.fondo / 2;
      const lati = [[[-w / 2, -b], [w / 2, -b]], [[w / 2, -b], [w / 2, b]], [[w / 2, b], [-w / 2, b]]];
      for (const [[i0, j0], [i1, j1]] of lati) {
        const A = [cc[0] + s[0] * i0 + f[0] * j0, cc[1] + s[1] * i0 + f[1] * j0], B = [cc[0] + s[0] * i1 + f[0] * j1, cc[1] + s[1] * i1 + f[1] * j1];
        const l = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(l / 2)), du = (B[0] - A[0]) / l, dv = (B[1] - A[1]) / l;
        for (let k = 0; k <= n; k++) {
          const pu = A[0] + (B[0] - A[0]) * k / n, pv = A[1] + (B[1] - A[1]) * k / n, Rp = rett([pu, pv], [du, dv], [-dv, du], 0.07, 0.07);
          parti.legno.push(prisma(q4(Rp), q4(Rp), terreno(pu, pv) - 0.3, terreno(pu, pv) + 1.3));
        }
        for (const y of [0.55, 1.1]) {
          const segs = Math.max(1, Math.round(l / 3));
          for (let k = 0; k < segs; k++) {
            const a0 = [A[0] + (B[0] - A[0]) * k / segs, A[1] + (B[1] - A[1]) * k / segs], a1 = [A[0] + (B[0] - A[0]) * (k + 1) / segs, A[1] + (B[1] - A[1]) * (k + 1) / segs];
            const m = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], Rr = rett(m, [du, dv], [-dv, du], l / segs / 2, 0.05);
            const h0 = terreno(...a0), h1 = terreno(...a1);
            parti.legno.push(prisma(q4(Rr), q4(Rr), Math.min(h0, h1) + y - 0.07, [h0 + y + 0.07, h1 + y + 0.07, h1 + y + 0.07, h0 + y + 0.07]));
          }
        }
        // traversa alta a 1,1 m (+ 7 cm): il recinto si scavalca
        scatole.push({ cu: (A[0] + B[0]) / 2, cv: (A[1] + B[1]) / 2, au: du, av: dv, hl: l / 2, hw: 0.12,
          cima: Math.max(terreno(...A), terreno(...B), terreno((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) + 1.17 });
      }
    }
    // Torce alla porta di taverna e stalla; il fabbro ha la forgia (luce bassa e rossa dalla porta).
    if (tipo === 'taverna' || tipo === 'stalla' || tipo === 'cappella' || tipo === 'salaArmi') {
      const t = (tipo === 'stalla' ? 1.8 : 1.1);
      torcia(u + s[0] * t + f[0] * (E.fondo / 2 + 0.02), v + s[1] * t + f[1] * (E.fondo / 2 + 0.02), (r.pavimento ?? terreno(u, v)) + LUCI.torcia.altezza, fu, fv,
        tipo === 'cappella' || tipo === 'salaArmi' ? null : LUCI.torcia);
    }
    if (tipo === 'fabbro') sorgenti.push({ u: u + f[0] * (E.fondo / 2 + 0.8), v: v + f[1] * (E.fondo / 2 + 0.8), y: (r.pavimento ?? terreno(u, v)) + 1.2, ...LUCI.forgia });
    if (tipo === 'taverna') {                           // insegna a bandiera sulla facciata
      const t = E.largo / 2 - 1.2, pu = u + s[0] * t + f[0] * (E.fondo / 2 + 0.7), pv = v + s[1] * t + f[1] * (E.fondo / 2 + 0.7);
      const R1 = rett([pu, pv], s, f, 0.04, 0.6), y = r.pavimento + 3.3;
      parti.legno.push(prisma(q4(R1), q4(R1), y - 0.75, y + 0.1));
      const R2 = rett([u + s[0] * t + f[0] * (E.fondo / 2 + 0.5), v + s[1] * t + f[1] * (E.fondo / 2 + 0.5)], s, f, 0.05, 0.55);
      parti.legno.push(prisma(q4(R2), q4(R2), y + 0.1, y + 0.22));
    }
    const porta = { u: u + f[0] * (E.fondo / 2 + 0.6), v: v + f[1] * (E.fondo / 2 + 0.6), fu, fv };
    edifici.push({ tipo, nome: E.nome, porta, largo: E.largo, fondo: E.fondo, piani: E.piani });
    const largo = E.largo + (E.recinto ? E.recinto + 1 : 0) * 2 + (E.tettoia ? E.tettoia + 0.4 : 0) * 2;
    return { largo, fondo: E.fondo };
  }

  /** Torcia a muro (staffa e manico uniti nel legno; fiamma e alone in chiudi()), rivolta verso f; con `luce` una sorgente. */
  function torcia(u, v, y, fu, fv, luce = LUCI.torcia) {
    const f = [fu, fv], s = [-fv, fu];
    const Rs = rett([u + fu * 0.2, v + fv * 0.2], s, f, 0.05, 0.2);
    parti.legno.push(prisma(q4(Rs), q4(Rs), y - 0.05, y + 0.05));
    const Rm = rett([u + fu * 0.35, v + fv * 0.35], s, f, 0.04, 0.04);
    parti.legno.push(prisma(q4(Rm), q4(Rm), y, y + 0.6));
    const fx = u + fu * 0.38, fz = v + fv * 0.38;
    torce.push({ u: fx, v: fz, y: y + 0.75 });
    if (luce) sorgenti.push({ u: u + fu * 1.2, v: v + fv * 1.2, y: y + 0.9, ...luce });
  }

  /** Pozzo: vera di pietra, due pilastrini, trave e tettuccio. */
  function pozzo(u, v, quota = null) {
    const h0 = quota ?? terreno(u, v);
    const vera = new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12);
    vera.translate(X(u, v), h0 + 0.5, Z(u, v));
    parti.pietra.push(vera);
    for (const i of [-1, 1]) {
      const R = rett([u + i * 0.95, v], [1, 0], [0, 1], 0.12, 0.12);
      parti.legno.push(prisma(q4(R), q4(R), h0 + 0.9, h0 + 2.6));
    }
    const Rt = rett([u, v], [1, 0], [0, 1], 1.15, 0.08);
    parti.legno.push(prisma(q4(Rt), q4(Rt), h0 + 2.4, h0 + 2.55));
    scatole.push({ cu: u, cv: v, au: 1, av: 0, hl: 1.25, hw: 1.25 });
    edifici.push({ tipo: 'pozzo', nome: 'Pozzo', porta: { u: u, v: v + 1.6, fu: 0, fv: 1 } });
  }

  /** Banco del mercato: tavolo e tendone. */
  function banco(u, v, fu, fv) {
    const f = [fu, fv], s = [-fv, fu], h0 = terreno(u, v), R = rett([u, v], s, f, 1.1, 0.5);
    parti.legno.push(prisma(q4(R), q4(R), h0 - 0.2, h0 + 0.9));
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      const Rp = rett([u + s[0] * 1.05 * i + f[0] * 0.55 * j, v + s[1] * 1.05 * i + f[1] * 0.55 * j], s, f, 0.05, 0.05);
      parti.legno.push(prisma(q4(Rp), q4(Rp), h0, h0 + 2.2));
    }
    const Rt = rett([u + f[0] * 0.15, v + f[1] * 0.15], s, f, 1.25, 0.85);
    parti.intonaco.push(prisma(q4(Rt), q4(Rt), h0 + 2.15, [h0 + 2.3, h0 + 2.3, h0 + 2.05, h0 + 2.05]));
    scatole.push({ cu: u, cv: v, au: s[0], av: s[1], hl: 1.15, hw: 0.6 });
  }

  /**
   * Colori per vertice dei pezzi uniti: tinta (moltiplica), muschio (verde verso il punto più basso del pezzo, a
   * chiazze: gronde dei tetti), edera (verde dal piede fino a `edera` m, a chiazze).
   */
  function tingi(geo, pezzi) {
    const col = geo.attributes.color, pos = geo.attributes.position;
    if (!col) return;
    const verde = [0.5, 0.62, 0.34];
    let o = 0;
    for (const { n, d } of pezzi) {
      if (d.tinta || d.muschio || d.edera || d.sporco) {
        let y0 = Infinity, y1 = -Infinity;
        for (let i = o; i < o + n; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
        for (let i = o; i < o + n; i++) {
          let r0 = col.getX(i), g0 = col.getY(i), b0 = col.getZ(i);
          if (d.tinta) { r0 *= d.tinta[0]; g0 *= d.tinta[1]; b0 *= d.tinta[2]; }
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const macchia = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 2.3 + Math.sin(x * 0.6 - z * 0.9) * 3);
          let m = 0;
          if (d.muschio && y1 - y0 > 0.05) m = Math.max(m, d.muschio * Math.pow(1 - (y - y0) / (y1 - y0), 2) * (0.4 + macchia));
          if (d.edera) m = Math.max(m, 0.75 * Math.max(0, 1 - (y - (y0 + 0.6)) / d.edera) * macchia);
          m = Math.min(0.85, m);
          r0 *= 1 - m + m * verde[0]; g0 *= 1 - m + m * verde[1]; b0 *= 1 - m + m * verde[2];
          if (d.sporco && y1 - y0 > 0.05) {                  // terra e polvere salite dal suolo: bruno verso il basso
            const t = Math.pow(1 - (y - y0) / (y1 - y0), 1.4) * d.sporco * (0.75 + 0.25 * macchia);
            r0 *= 1 - t * 0.35; g0 *= 1 - t * 0.42; b0 *= 1 - t * 0.55;
          }
          col.setXYZ(i, Math.min(1, r0), Math.min(1, g0), Math.min(1, b0));
        }
      }
      o += n;
    }
    col.needsUpdate = true;
  }

  /** Chiude il kit: oggetti da disegnare, collisioni, sagome per la camera, misure. */
  /** Chiude il kit: unisce i volumi, crea dettagli, torce e sagome. Generatore: cede il passo tra un pezzo e l'altro. */
  function* chiudiAPezzi() {
    const object = new THREE.Group();
    object.name = nome;
    const solidi = [];
    for (const [k, lista] of Object.entries(parti)) {
      // Tinte, muschio ed edera dei pezzi (userData), dopo l'unione: i pezzi stanno in fila nella geometria unita.
      const pezzi = lista.map((g) => ({ n: g.index ? g.index.count : g.attributes.position.count, d: { ...g.userData } }));
      const geo = unisci(lista);
      if (!geo) continue;
      tingi(geo, pezzi);
      const m = new THREE.Mesh(geo, mat[k]);
      m.name = `${nome}-${k}`;
      object.add(m);
      yield;
    }
    if (piedi.length) {                                  // fasce di terra al piede degli edifici
      const pos = [], uv = [], idx = [];
      for (const { c, s, f, a, b, w } of piedi) {
        // Quattro lati, ciascuno a tratti di ~1,5 m, prolungati agli spigoli per chiudere gli angoli.
        const lati = [[[-a - w, -b], [a + w, -b], [0, -1]], [[a, -b - w], [a, b + w], [1, 0]], [[a + w, b], [-a - w, b], [0, 1]], [[-a, b + w], [-a, -b - w], [-1, 0]]];
        let lung = rnd() * 10;
        for (const [[i0, j0], [i1, j1], [ni, nj]] of lati) {
          const L = Math.hypot(i1 - i0, j1 - j0), n = Math.max(2, Math.ceil(L / 1.5)), base0 = pos.length / 3;
          for (let k = 0; k <= n; k++) {
            const i = i0 + (i1 - i0) * k / n, j = j0 + (j1 - j0) * k / n;
            for (const [o, vv] of [[0.02, 0], [w, 1]]) {
              const u = c[0] + s[0] * (i + ni * o) + f[0] * (j + nj * o), v = c[1] + s[1] * (i + ni * o) + f[1] * (j + nj * o);
              pos.push(X(u, v), terreno(u, v) + 0.035, Z(u, v));
              uv.push((lung + L * k / n) / 2.5, vv);
            }
          }
          for (let k = 0; k < n; k++) { const q = base0 + 2 * k; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
          lung += L;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal;                   // le normali in su (il verso dei lati dipende dagli assi)
      let giu = 0;
      for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) giu++;
      if (giu > nrm.count / 2) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
      const mb = new THREE.MeshLambertMaterial({ map: texturaBase(), alphaTest: 0.5, side: THREE.DoubleSide });
      mb.polygonOffset = true; mb.polygonOffsetFactor = -3; mb.polygonOffsetUnits = -3;
      const m = new THREE.Mesh(geo, mb);
      m.name = `${nome}-piede`;
      object.add(m);
    }
    yield;
    {
      const geo = unisci(sagome);                         // invisibile: solo per il raycast della camera
      if (geo) {
        const m = new THREE.Mesh(geo, mat.finestra);
        m.visible = false;
        m.name = `${nome}-sagome`;
        object.add(m);
        solidi.push(m);
      }
    }
    // Dettagli a istanze, per zone, spenti da lontano.
    const geoD = {
      finestra: (() => { const g = new THREE.BoxGeometry(0.62, 0.85, 0.14); return g; })(),
      porta: (() => { const g = new THREE.BoxGeometry(1.2, 2.2, 0.16); g.translate(0, 1.1, 0); return g; })(),
      comignolo: (() => { const g = new THREE.BoxGeometry(0.6, 1.4, 0.6); g.translate(0, 0.7, 0); return rifinisci(g, false); })(),
      trave: new THREE.BoxGeometry(1, 1, 1),
      imposta: new THREE.BoxGeometry(0.42, 0.95, 0.05),
      cantonale: rifinisci(new THREE.BoxGeometry(1, 1, 1), false),
      sasso: rifinisci(new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(), false),
    };
    const matD = { finestra: mat.finestra, porta: mat.legno, comignolo: mat.pietra, cantonale: mat.pietra,
      trave: mat.legno, imposta: mat.legno, sasso: mat.pietra };
    // Zone: al più 2 × 2 qualunque sia la grandezza (le chiamate restano ≤ 4 × tipi di dettaglio), di lato almeno
    // DETTAGLIO.zona m. Con zone = 1 (luoghi piccoli) una zona sola: le chiamate scendono a 1 × tipi di dettaglio.
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const d of dettagli) { u0 = Math.min(u0, d.u); u1 = Math.max(u1, d.u); v0 = Math.min(v0, d.v); v1 = Math.max(v1, d.v); }
    const lato = quanteZone <= 1 ? Infinity : Math.max(DETTAGLIO.zona, (u1 - u0) / 2 + 0.01, (v1 - v0) / 2 + 0.01);
    const zone = new Map();
    for (const d of dettagli) {
      const k = `${Math.floor((d.u - u0) / lato)},${Math.floor((d.v - v0) / lato)}`;
      if (!zone.has(k)) zone.set(k, []);
      zone.get(k).push(d);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), zAx = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    let istanze = 0;
    for (const lista of zone.values()) {
      let cu = 0, cv = 0, cy = 0;
      for (const d of lista) { cu += d.u / lista.length; cv += d.v / lista.length; cy += d.y / lista.length; }
      const lod = new THREE.LOD();
      lod.position.set(X(cu, cv), cy, Z(cu, cv));
      const g = new THREE.Group();
      for (const tipo of Object.keys(geoD)) {
        const L = lista.filter((d) => d.tipo === tipo);
        if (!L.length) continue;
        const im = new THREE.InstancedMesh(geoD[tipo], matD[tipo], L.length);
        if (tipo === 'finestra') {                        // soglia di accensione per finestra (le celle mai)
          const cc = new THREE.Color();
          L.forEach((d, i) => im.setColorAt(i, cc.setRGB(d.sy > 1.5 ? 1 : rnd() * 0.999, 1, 1)));
          im.instanceColor.needsUpdate = true;
        }
        L.forEach((d, i) => {
          const nx = ux * d.fu - uz * d.fv, nz = uz * d.fu + ux * d.fv;
          q.setFromAxisAngle(yAx, Math.atan2(nx, nz));
          if (d.rot) q.multiply(qr.setFromAxisAngle(zAx, d.rot));          // travi oblique del graticcio
          sc.set(d.sx ?? 1, d.sy ?? 1, d.sz ?? 1);
          im.setMatrixAt(i, m4.compose(p3.set(X(d.u, d.v) - lod.position.x, d.y - cy, Z(d.u, d.v) - lod.position.z), q, sc));
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.name = `${nome}-${tipo}`;
        g.add(im);
        istanze += L.length;
      }
      lod.addLevel(g, 0);
      lod.addLevel(new THREE.Object3D(), DETTAGLIO.lontano);
      object.add(lod);
      yield;
    }
    // Fiamme (coni a istanze) e aloni (punti) delle torce: due oggetti per tutto il kit.
    let fiamme = null, aloni = null;
    if (torce.length) {
      const geoF = new THREE.ConeGeometry(0.1, 0.38, 6);
      fiamme = new THREE.InstancedMesh(geoF, new THREE.MeshBasicMaterial({ color: '#ffcf70', fog: false }), torce.length);
      fiamme.name = `${nome}-fiamme`;
      const pos = [];
      torce.forEach((t, i) => {
        fiamme.setMatrixAt(i, m4.compose(p3.set(X(t.u, t.v), t.y, Z(t.u, t.v)), q.identity(), sc.set(1, 1, 1)));
        pos.push(X(t.u, t.v), t.y, Z(t.u, t.v));
      });
      fiamme.instanceMatrix.needsUpdate = true;
      fiamme.computeBoundingSphere();
      const ga = new THREE.BufferGeometry();
      ga.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      aloni = new THREE.Points(ga, new THREE.PointsMaterial({ map: texturaAlone(), size: LUCI.torcia.alone, sizeAttenuation: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      aloni.name = `${nome}-aloni`;
      fiamme.visible = aloni.visible = false;
      object.add(fiamme, aloni);
    }
    for (const sg of sorgenti) { sg.x = X(sg.u, sg.v); sg.z = Z(sg.u, sg.v); }
    /** Luci della notte: buio 0–1, quota di finestre accese (quotaFinestre), t in s per il tremolio. */
    function aggiornaLuci(t, buio, quota = 0.3) {
      const f = Math.min(1, Math.max(0, (buio - 0.15) / 0.5));
      uLuci.uAccese.value = f;
      uLuci.uQuota.value = quota;
      if (!fiamme) return;
      const accese = f > 0;
      fiamme.visible = aloni.visible = accese;
      if (!accese) return;
      torce.forEach((tc, i) => {
        const k = 0.85 + 0.12 * Math.sin(t * 13.1 + i * 2.1) + 0.06 * Math.sin(t * 23.7 + i);
        fiamme.setMatrixAt(i, m4.compose(p3.set(X(tc.u, tc.v), tc.y, Z(tc.u, tc.v)), q.identity(), sc.set(1, k, 1)));
      });
      fiamme.instanceMatrix.needsUpdate = true;
      aloni.material.opacity = f;
      aloni.material.size = LUCI.torcia.alone * (0.92 + 0.08 * Math.sin(t * 11.3));
    }
    object.updateMatrixWorld(true);
    let triangoli = 0, chiamate = 0;
    object.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      chiamate++;
      triangoli += (m.isInstancedMesh ? m.count : 1) * (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    });
    // Porte degli edifici nominati anche nel blocco (x, z) con la normale verso fuori (nx, nz): per «Entra» (M7, passo 6).
    for (const e of edifici) {
      const p = e.porta;
      Object.assign(p, { x: X(p.u, p.v), z: Z(p.u, p.v), nx: ux * p.fu - uz * p.fv, nz: uz * p.fu + ux * p.fv });
    }
    return { object, solidi, scatole, edifici, sorgenti, aggiornaLuci, misure: { case: case_, edifici: edifici.length, istanze, zone: zone.size, chiamate, triangoli } };
  }

  const chiudi = () => completaPezzi(chiudiAPezzi());
  return { casa, edificio, pozzo, banco, loggia, corpo, chiudi, chiudiAPezzi, rnd, rett, pagliaio, catasta, botte, torcia };
}

// ─── Lotti ────────────────────────────────────────────────────────────────

/** true se due rettangoli orientati ({ c, s, f, a, b }) si sovrappongono (assi separatori), con margine. */
export function siToccano(A, B, margine = 0) {
  const assi = [A.s, A.f, B.s, B.f];
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
  for (const ax of assi) {
    const proA = A.a * Math.abs(A.s[0] * ax[0] + A.s[1] * ax[1]) + A.b * Math.abs(A.f[0] * ax[0] + A.f[1] * ax[1]);
    const proB = B.a * Math.abs(B.s[0] * ax[0] + B.s[1] * ax[1]) + B.b * Math.abs(B.f[0] * ax[0] + B.f[1] * ax[1]);
    if (Math.abs(d[0] * ax[0] + d[1] * ax[1]) > proA + proB + margine) return false;
  }
  return true;
}

/**
 * Case di campagna (siti da js/mondo/vegetazione.js, caseCampagna / posizionaVegetazione().case, coordinate del mondo)
 * nel blocco centrato in (cx, cz). Interfaccia come rocca e borgo per le collisioni e la camera.
 */
export function creaCaseCampagna(suolo, siti, cx, cz, seme = 7, clima = 'temperato') {
  const kit = creaKit({ X: (u) => u, Z: (u, v) => v, terreno: (u, v) => suolo.getHeight(u, v), seme, nome: 'campagna', contesto: 'campagna', clima });
  for (const k of siti) {
    const fu = Math.cos(k.verso), fv = Math.sin(k.verso);
    kit.casa({ u: k.x - cx, v: k.z - cz, fu, fv, tipo: kit.rnd() < 0.75 ? 'rurale' : 'bassa' });
  }
  const r = kit.chiudi();
  const spingiOggetti = r.scatole;
  // Collisioni: le stesse scatole orientate di rocca e borgo, con una griglia di 32 m per cercare solo le vicine.
  const griglia = new Map(), G = 32;
  spingiOggetti.forEach((s, i) => {
    const e = Math.max(s.hl, s.hw) + 1;
    for (let a = Math.floor((s.cu - e) / G); a <= Math.floor((s.cu + e) / G); a++) {
      for (let b = Math.floor((s.cv - e) / G); b <= Math.floor((s.cv + e) / G); b++) {
        const k = a * 100003 + b;
        if (!griglia.has(k)) griglia.set(k, []);
        griglia.get(k).push(i);
      }
    }
  });
  function spingiFuori(x, z, raggio, yPiedi = -Infinity, superabile = 0) {
    const L = griglia.get(Math.floor(x / G) * 100003 + Math.floor(z / G));
    if (!L) return null;
    let u = x, v = z;
    for (let it = 0; it < 4; it++) {
      let mosso = false;
      for (const i of L) {
        const s = spingiOggetti[i], du = u - s.cu, dv = v - s.cv;
        if (s.cima !== undefined && s.cima <= yPiedi + superabile) continue;   // basso: si supera
        const a = du * s.au + dv * s.av, b = -du * s.av + dv * s.au;
        const qa = clamp(a, -s.hl, s.hl), qb = clamp(b, -s.hw, s.hw), ea = a - qa, eb = b - qb, d2 = ea * ea + eb * eb;
        if (d2 >= raggio * raggio) continue;
        let na = a, nb = b;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); na = qa + ea / d * raggio; nb = qb + eb / d * raggio; } else {
          const vie = [a + s.hl, s.hl - a, b + s.hw, s.hw - b], m = vie.indexOf(Math.min(...vie));
          if (m === 0) na = -s.hl - raggio; else if (m === 1) na = s.hl + raggio; else if (m === 2) nb = -s.hw - raggio; else nb = s.hw + raggio;
        }
        u = s.cu + na * s.au - nb * s.av; v = s.cv + na * s.av + nb * s.au;
        mosso = true;
      }
      if (!mosso) break;
    }
    return { x: u, z: v };
  }
  return { tipo: 'campagna', object: r.object, solidi: r.solidi, spingiFuori, quotaSuolo: () => null, dentro: () => false,
    aggiornaLuci: r.aggiornaLuci, sorgenti: r.sorgenti, misure: r.misure, edifici: r.edifici };
}
