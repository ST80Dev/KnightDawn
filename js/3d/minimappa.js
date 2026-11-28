// Knight Dawn — minimappa delle Scene (richiesta dell'utente, novembre 2026).
// In basso a destra, durante il gioco di persona: il mondo visto dall'alto attorno al cavaliere, nord in alto.
// Disegnata su una tela 2D (nessun costo per la scena 3D): sotto la Carta del mondo (1 pixel per km, colori
// «naturali»), sopra il rilievo fine della zona calcolato con la stessa funzione del terreno delle Scene (quotaFinale),
// a pezzi (1,5 ms per fotogramma, 3 allargata) e solo quando serve; poi fiumi, strade, luoghi e siti come nella vista della Carta.
// Zoom: rotella sopra la minimappa, + e − (tastiera o pulsanti). N fa il giro icona → piccola → allargata → icona
// (⤢ alterna piccola e allargata); allargata, un clic porta il cavaliere lì (SOLO per le prove, finché non c'è il
// viaggio vero).
// Prestazioni [regola decisa con l'utente, novembre 2026; docs/ESPLORAZIONE_3D.md, «Minimappa»]: la minimappa
// rappresenta il mondo, non lo riproduce alla definizione della Carta a tutto schermo (M). Il dettaglio dipende dallo
// zoom (MINIMAPPA.dettaglio) e tutto ciò che non si muove col cavaliere (terreno, acque, strade, segni, nebbia) sta in
// un fondo in cache, rifatto solo quando lo spostamento esce dal suo margine o cambia ciò che contiene: girandosi si
// ridisegnano solo il fondo spostato, il cavallo e la freccia. Ridotta a icona non fa nessun lavoro.

import { quotaFinale, livelloLago, percorsiFiumi } from '../mondo/scena.js';
import { percorsiStrade, STRADE } from '../mondo/strade.js';
import { derivaSeme } from '../mondo/rumore.js';
import { ACQUA } from '../mondo/carta.js';
import {
  disegnaRilievo, coloreNaturale, segnoSito, tinta, LUCE, LAGO, MARE_BASSO, MARE_FONDO, COLORE_FIUME,
  COLORE_STRADA, COLORE_SENTIERO, STILE_STRADE, STRADE_ZOOM, COLORE_CAVALIERE, CLASSI_ROCCA, TIPI_LUOGO,
} from './cartaVista.js';

export const MINIMAPPA = {
  lato: 210,                                   // px (CSS) della minimappa piccola
  grande: { altezza: 0.7, larghezza: 0.45 },   // allargata: lato = min(70 % dell'altezza, 45 % della larghezza)
  // Metri per pixel (CSS): un livello di zoom per valore. Piccola a 4 m/px = ~840 m di lato.
  zoom: [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256],
  zoomIniziale: 3,
  // Livelli di dettaglio per lato della vista (m): fino a `vicino` rilievo fine, tutte le strade e i siti; fino a
  // `medio` rilievo fine, strade senza sentieri, siti; oltre solo colore dei biomi della Carta (senza ombreggiatura),
  // acque, strade maestre semplificate e luoghi principali (rocche, città, monasteri).
  dettaglio: { vicino: 3000, medio: 15000 },
  // Rilievo fine: un campione ogni `pixel` px (CSS); la finestra calcolata è `margine` volte la vista, così si cammina
  // a lungo prima di ricalcolare. Lavoro per fotogramma: `budget` ms (allargata: `budgetGrande`).
  fine: { pixel: 2, pixelGrande: 3, margine: 1.6, margineGrande: 1.3, passoMin: 3, budget: 1.5, budgetGrande: 3,
    esagerazione: 2 },
  ridisegnoMs: 40, ridisegnoMsGrande: 80,      // al massimo ~25 ridisegni al secondo (allargata ~12)
  // Fondo in cache: sborda di `margine` volte il lato per parte; mentre il rilievo fine si calcola si rifà al più ogni
  // `progressoMs`. Linee: punti più vicini di `semplifica` pixel si saltano.
  // `nebbiaMs`: la nebbia della conoscenza (Storia) cambia camminando; il fondo si rifà per lei al più ogni tanto.
  fondo: { margine: 0.25, progressoMs: 250, nebbiaMs: 1000 },
  semplifica: 1.5,
};
const STATI = ['icona', 'piccola', 'grande'];

const COLORE_CAVALLO = '#6b4a2a';

/**
 * Crea la minimappa (nascosta finché non c'è una posizione nel mondo generato) e la aggiunge a `contenitore`.
 * @param {HTMLElement} contenitore
 * @param {{
 *   carta: () => (object|null),                                   // Carta del mondo della partita
 *   posizione: () => ({x:number, z:number, direzione:number}|null), // cavaliere in m del mondo (null: niente minimappa)
 *   cavallo?: () => ({x:number, z:number}|null),                  // il cavallo, se è lontano dal cavaliere
 *   blocco?: () => ({x:number, z:number, half:number}|null),      // blocco disegnato in 3D (m del mondo)
 *   onVai?: (x: number, z: number) => void,                       // clic sulla minimappa grande (prova)
 *   conoscenza?: () => (object|null),   // Conoscenza (js/news.js) se attiva (Storia): ignoto coperto, intravisto sbiadito
 *   prove?: () => boolean,              // true se il clic che porta lì è permesso (Libera): cambia la riga in basso
 * }} opzioni
 */
export function creaMinimappa(contenitore, opzioni) {
  const el = document.createElement('div');
  el.id = 'minimappa';
  el.hidden = true;
  el.innerHTML = `
    <canvas></canvas>
    <div class="nord" title="Nord">N</div>
    <div class="scala"><i></i><span></span></div>
    <div class="comandi">
      <button type="button" class="meno" title="Allontana (−)">−</button>
      <button type="button" class="piu" title="Avvicina (+)">+</button>
      <button type="button" class="grande" title="Allarga / riduci">⤢</button>
      <button type="button" class="chiudi" title="Riduci a icona (N)">▾</button>
    </div>
    <button type="button" class="apri" title="Minimappa (N)">Mappa</button>
    <div class="piede"></div>`;
  contenitore.appendChild(el);
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const elScala = el.querySelector('.scala i'), elScalaTesto = el.querySelector('.scala span');
  const elPiede = el.querySelector('.piede');

  // Preferenze di chi gioca (zoom, allargata): comodità del browser, si può perdere senza danno.
  let livello = MINIMAPPA.zoomIniziale, stato = 'piccola';
  try {
    const p = JSON.parse(localStorage.getItem('kd.minimappa') || 'null');
    if (p && Number.isInteger(p.livello) && p.livello >= 0 && p.livello < MINIMAPPA.zoom.length) livello = p.livello;
    if (p && STATI.includes(p.stato)) stato = p.stato;
    else if (p) stato = p.grande ? 'grande' : 'piccola';    // preferenze di prima (solo piccola / allargata)
  } catch { /* niente preferenze */ }
  let grande = stato === 'grande';
  const ricorda = () => {
    try { localStorage.setItem('kd.minimappa', JSON.stringify({ livello, stato })); } catch { /* pazienza */ }
  };

  let nascosta = false;                        // nascosta da fuori (Carta aperta, percorso di prova)
  let lato = 1, dpr = 1;                       // lato in px CSS, rapporto dei pixel
  let sporca = true, tUltimo = -Infinity;
  // Fondo in cache (vedi in testa): `fondoSporco` quando cambia ciò che contiene, `progresso` quando il rilievo fine
  // in calcolo ha righe nuove.
  const fondo = document.createElement('canvas'), fctx = fondo.getContext('2d');
  let fondoSporco = true, progresso = false, nebbiaNuova = false, fondoInfo = null, tFondo = -Infinity, chiaveBlocco = '';
  const misure = { fondi: 0, msFondo: 0, msRidisegno: 0, maxRidisegno: 0 };
  const ultimo = { x: NaN, z: NaN, d: NaN };
  let pos = null;

  // ─── Carta del mondo, 1 pixel per km (una volta per Carta e stagione) ───
  let cartaFatta = null, stagioneFatta = -1, rilievo = null, piatta = null, colore = null;
  function preparaCarta(c) {
    const stagione = typeof Calendar !== 'undefined' ? Calendar.stagione : 0;
    if (c === cartaFatta && stagione === stagioneFatta) return;
    cartaFatta = c; stagioneFatta = stagione;
    rilievo = document.createElement('canvas');
    rilievo.width = c.cols; rilievo.height = c.rows;
    const g = rilievo.getContext('2d'), img = g.createImageData(c.cols, c.rows);
    disegnaRilievo(c, img.data, c.bioma ? 'naturale' : 'rilievo');
    g.putImageData(img, 0, 0);
    colore = c.bioma ? coloreNaturale(c) : null;
    piatta = null;                             // si fa la prima volta che serve (zoom lontano)
    corrente = null; lavoro = null;
    sporca = fondoSporco = true;
  }
  /** Carta a 1 km senza ombreggiatura (zoom lontano): colore dei biomi, laghi e mare. Una volta per Carta e stagione. */
  function cartaPiatta() {
    if (piatta) return piatta;
    const c = cartaFatta, { cols, rows, quota, mare, acque } = c;
    piatta = document.createElement('canvas');
    piatta.width = cols; piatta.height = rows;
    const g = piatta.getContext('2d'), img = g.createImageData(cols, rows), px = img.data;
    const q = (x, y) => quota[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let col;
        if (mare[i]) col = tinta([[0, MARE_BASSO], [1, MARE_FONDO]], Math.sqrt(Math.min(1, -quota[i] / 2500)));
        else if (acque && acque[i] === ACQUA.LAGO) col = LAGO;
        else if (colore) {
          const d = Math.hypot(q(x + 1, y) - q(x - 1, y), q(x, y + 1) - q(x, y - 1)) * 0.5 / c.cella;
          col = colore((x + 0.5) * c.cella, (y + 0.5) * c.cella, quota[i], Math.atan(d) * 180 / Math.PI);
        } else col = [200, 190, 160];
        const p = i * 4;
        px[p] = col[0]; px[p + 1] = col[1]; px[p + 2] = col[2]; px[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return piatta;
  }

  // ─── Nebbia della conoscenza: uno strato di pergamena, una cella (100 m) per pixel ───
  // Ignoto coperto del tutto, intravisto sbiadito, percorso libero. Si rifà solo il rettangolo cambiato.
  const NEBBIA = { colore: [196, 172, 124], alfa: [255, 150, 0] };
  let maschera = null, mImg = null, mGen = -1, mVer = -1;
  function preparaMaschera(k) {
    if (!maschera || mGen !== k.generazione || maschera.width !== k.w || maschera.height !== k.h) {
      maschera = document.createElement('canvas');
      maschera.width = k.w; maschera.height = k.h;
      mImg = maschera.getContext('2d').createImageData(k.w, k.h);
      mGen = k.generazione;
    }
    if (mVer === k.versione) return;
    mVer = k.versione;
    const r = k.prendiSporco();
    if (!r) return;
    const px = mImg.data, [R, G, B] = NEBBIA.colore;
    for (let j = r.y0; j <= r.y1; j++) {
      for (let i = r.x0; i <= r.x1; i++) {
        const c = j * k.w + i, p = c * 4;
        px[p] = R; px[p + 1] = G; px[p + 2] = B; px[p + 3] = NEBBIA.alfa[k.dati[c]] ?? 0;
      }
    }
    maschera.getContext('2d').putImageData(mImg, 0, 0, r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
    sporca = nebbiaNuova = true;
  }

  // ─── Rilievo fine della zona: un lavoro alla volta, a pezzi ───
  let corrente = null;                         // ultimo finito: { img, x0, z0, w, passo, fiumi, strade, ... }
  let lavoro = null;                           // in corso (stessi campi + gen)
  const mpp = () => MINIMAPPA.zoom[livello];
  /** Livello di dettaglio dal lato della vista: 'vicino' | 'medio' | 'lontano' (MINIMAPPA.dettaglio). */
  function dettaglio() {
    const L = lato * mpp(), D = MINIMAPPA.dettaglio;
    return L <= D.vicino ? 'vicino' : L <= D.medio ? 'medio' : 'lontano';
  }
  /** Fiumi e strade di una finestra, con il riquadro di ogni linea (per scartare quelle fuori vista). */
  function vettori(x0, z0, w, det) {
    const conRiquadro = (f) => {
      let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
      for (let i = 0; i < f.x.length; i++) {
        const x = f.x[i], z = f.z[i];
        if (x < a0) a0 = x; if (x > a1) a1 = x; if (z < b0) b0 = z; if (z > b1) b1 = z;
      }
      f.riquadro = [a0, b0, a1, b1];
      return f;
    };
    const classi = det === 'lontano' ? ['maestra'] : det === 'medio' ? ['maestra', 'carrareccia', 'mulattiera'] : null;
    const strade = percorsiStrade(cartaFatta, x0, z0, x0 + w, z0 + w).filter((f) => !classi || classi.includes(f.classe));
    return { fiumi: percorsiFiumi(cartaFatta, x0, z0, x0 + w, z0 + w).map(conRiquadro), strade: strade.map(conRiquadro) };
  }
  function passoVoluto() {
    return Math.max(MINIMAPPA.fine.passoMin, mpp() * (grande ? MINIMAPPA.fine.pixelGrande : MINIMAPPA.fine.pixel));
  }
  /** Serve un nuovo rilievo fine? (nessuno, zoom cambiato, o il cavaliere si avvicina al bordo di quello che c'è). */
  function daRifare(r) {
    if (!r || r.carta !== cartaFatta || r.stagione !== stagioneFatta || r.passo !== passoVoluto() || r.det !== dettaglio()) return true;
    const vista = lato * mpp() / 2, cx = r.x0 + r.w / 2, cz = r.z0 + r.w / 2;
    return Math.max(Math.abs(pos.x - cx), Math.abs(pos.z - cz)) + vista > r.w / 2;
  }
  function nuovoLavoro() {
    const F = MINIMAPPA.fine, passo = passoVoluto(), det = dettaglio();
    const n = Math.max(16, Math.ceil(lato * mpp() * (grande ? F.margineGrande : F.margine) / passo));
    const w = n * passo, x0 = pos.x - w / 2, z0 = pos.z - w / 2;
    // Fiumi e strade già pronti (il tracciato fine dove le Scene l'hanno cercato, altrimenti quello della Carta).
    const { fiumi, strade } = vettori(x0, z0, w, det);
    const base = { carta: cartaFatta, stagione: stagioneFatta, det, passo, w, x0, z0, fiumi, strade };
    fondoSporco = true;
    if (det === 'lontano') {                  // lontano: niente rilievo fine, la Carta a 1 km basta
      corrente = { ...base, n: 0, righe: 0, img: null, ms: 0 };
      lavoro = null;
      return;
    }
    const img = document.createElement('canvas');
    img.width = n; img.height = n;
    const g = img.getContext('2d'), dati = g.createImageData(n, n);
    lavoro = { ...base, n, img, g, dati, righe: 0 };
    lavoro.gen = calcola(lavoro);
  }
  function* calcola(L) {
    const { n, passo, x0, z0, dati } = L, c = L.carta, px = dati.data;
    const seme = derivaSeme(c.seme, 101), esito = { quota: 0, livello: NaN };
    const h = new Float32Array(n * (n + 1)), acqua = new Float32Array(n * (n + 1));
    const riga = (r) => {                       // quote della riga r (una in più in fondo per l'ombreggiatura)
      const Z = z0 + (r + 0.5) * passo;
      for (let k = 0; k < n; k++) {
        const X = x0 + (k + 0.5) * passo, i = r * n + k;
        h[i] = quotaFinale(c, X, Z, seme, esito);
        let w = esito.livello;
        if (Number.isNaN(w)) { const l = livelloLago(c, X, Z); if (l > h[i]) w = l; }
        acqua[i] = w;
      }
    };
    const H = (k, r) => h[Math.min(n, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, k))];
    const passoM = 2 * passo / MINIMAPPA.fine.esagerazione, piatto = LUCE[2];
    riga(0);
    for (let r = 0; r < n; r++) {
      riga(r + 1);
      const Z = z0 + (r + 0.5) * passo;
      for (let k = 0; k < n; k++) {
        const i = r * n + k, v = h[i];
        let col;
        if (!Number.isNaN(acqua[i])) col = LAGO;
        else if (v < 0) col = tinta([[0, MARE_BASSO], [1, MARE_FONDO]], Math.sqrt(Math.min(1, -v / 2500)));
        else {
          const dx = (H(k + 1, r) - H(k - 1, r)) / passoM, dy = (H(k, r + 1) - H(k, r - 1)) / passoM;
          const l = Math.sqrt(dx * dx + dy * dy + 1);
          const luce = (-dx * LUCE[0] - dy * LUCE[1] + LUCE[2]) / l / piatto;
          const f = 0.55 + 0.45 * Math.min(1.5, Math.max(0, luce));
          const base = colore
            ? colore(x0 + (k + 0.5) * passo, Z, v, Math.atan(Math.hypot(dx, dy) / MINIMAPPA.fine.esagerazione) * 180 / Math.PI)
            : [200, 190, 160];
          col = [base[0] * f, base[1] * f, base[2] * f];
        }
        const p = i * 4;
        px[p] = col[0]; px[p + 1] = col[1]; px[p + 2] = col[2]; px[p + 3] = 255;
      }
      L.righe = r + 1;
      yield;
    }
  }
  /** Qualche ms di lavoro sul rilievo fine; la parte pronta si vede subito. */
  function avanzaLavoro() {
    if (!lavoro) return;
    const t0 = performance.now(), fine = t0 + (grande ? MINIMAPPA.fine.budgetGrande : MINIMAPPA.fine.budget);
    const da = lavoro.righe;
    let r;
    do r = lavoro.gen.next(); while (!r.done && performance.now() < fine);
    if (lavoro.righe > da) lavoro.g.putImageData(lavoro.dati, 0, 0, 0, da, lavoro.n, lavoro.righe - da);
    lavoro.ms = (lavoro.ms || 0) + performance.now() - t0;
    sporca = progresso = true;
    if (r.done) { lavoro.gen = null; lavoro.dati = null; corrente = lavoro; lavoro = null; fondoSporco = true; }
  }

  // ─── Dimensioni ───
  function adatta() {
    dpr = window.devicePixelRatio || 1;
    lato = grande
      ? Math.round(Math.min(window.innerHeight * MINIMAPPA.grande.altezza, window.innerWidth * MINIMAPPA.grande.larghezza))
      : MINIMAPPA.lato;
    const W = Math.round(lato * dpr);
    if (canvas.width !== W) {
      canvas.style.width = canvas.style.height = lato + 'px';
      canvas.width = canvas.height = W;
    }
    el.classList.toggle('allargata', grande);
    el.classList.toggle('icona', stato === 'icona');
    piede();
    document.documentElement.style.setProperty('--minimappa', el.hidden ? '0px' : `${el.offsetHeight + 8}px`);
    sporca = fondoSporco = true;
  }
  function piede() {
    elPiede.textContent = !grande ? ''
      : (opzioni.prove?.() ?? true) ? 'clic: porta lì il cavaliere (prova) · rotella o +/−: zoom · N: a icona'
        : 'rotella o +/−: zoom · N: a icona · M: Carta';
  }
  window.addEventListener('resize', () => { if (!el.hidden) adatta(); });

  // ─── Disegno ───
  /**
   * Il fondo: tutto ciò che non si muove col cavaliere, attorno a (pos), con `margine` di lato in più per parte, in
   * pixel del dispositivo alla scala attuale. Linee fuori dal fondo scartate dal loro riquadro, punti semplificati.
   */
  function rifaiFondo(W, s) {
    const t0 = performance.now();
    const M = Math.round(W * MINIMAPPA.fondo.margine), F = W + 2 * M;
    if (fondo.width !== F) { fondo.width = fondo.height = F; }
    const g = fctx, c = cartaFatta, C = c.cella, Wm = c.cols * C, Hm = c.rows * C;
    const fx = pos.x, fz = pos.z, tx = F / 2 - fx * s, ty = F / 2 - fz * s;
    const v = lavoro ?? corrente, det = v?.det ?? dettaglio();
    // Rettangolo del fondo in metri (per scartare)
    const r0x = -tx / s, r0z = -ty / s, r1x = (F - tx) / s, r1z = (F - ty) / s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a0e04';
    g.fillRect(0, 0, F, F);
    g.imageSmoothingEnabled = true;
    g.setTransform(s * C, 0, 0, s * C, tx, ty);              // celle della Carta (km)
    g.drawImage(det === 'lontano' ? cartaPiatta() : rilievo, 0, 0);
    g.setTransform(s, 0, 0, s, tx, ty);                      // da qui: metri del mondo
    if (det !== 'lontano') {
      for (const r of [corrente, lavoro]) {
        if (!r || r.carta !== c || !r.righe || !r.img) continue;
        const k = r.righe / r.n;
        g.drawImage(r.img, 0, 0, r.n, r.righe, r.x0, r.z0, r.w, r.w * k);
      }
    }
    // Fiumi e strade della finestra più recente (quella in corso, se c'è, copre la vista attuale).
    if (v && v.carta === c) {
      const px = dpr / s;                                     // un pixel del dispositivo, in metri
      const tol = MINIMAPPA.semplifica * px;
      const dentro = (f) => {
        const [a0, b0, a1, b1] = f.riquadro;
        return !(a1 < r0x || a0 > r1x || b1 < r0z || b0 > r1z);
      };
      const fiumi = v.fiumi.filter(dentro), strade = v.strade.filter(dentro);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = COLORE_FIUME;
      for (const f of fiumi) {
        g.lineWidth = Math.max(1.2 * px, 2 * f.w[0]);
        linea(g, f, tol);
      }
      const minimo = grande ? 1 : 0.7;
      const larga = (classe) => Math.max(STRADE_ZOOM.minimo[classe] * minimo * px, 2 * STRADE.classi[classe].semi);
      g.strokeStyle = STRADE_ZOOM.coloreBordo;
      for (const f of strade) { g.lineWidth = larga(f.classe) + 2 * STRADE_ZOOM.bordo * minimo * px; linea(g, f, tol); }
      for (const [classe, , trattino] of STILE_STRADE) {
        g.strokeStyle = classe === 'sentiero' ? COLORE_SENTIERO : COLORE_STRADA;
        g.lineWidth = larga(classe);
        g.setLineDash(trattino.map((t) => t * larga(classe) * 1.5));
        for (const f of strade) if (f.classe === classe) linea(g, f, tol);
      }
      g.setLineDash([]);
    }
    // Nebbia della conoscenza (Storia): sopra rilievo, fiumi e strade, sotto i segni.
    const k = opzioni.conoscenza?.() ?? null;
    if (k && maschera) {
      g.setTransform(s * k.CELLA, 0, 0, s * k.CELLA, tx, ty);
      g.drawImage(maschera, 0, 0);
      g.setTransform(s, 0, 0, s, tx, ty);
    }
    // Oltre il confine del mondo niente terreno «a specchio»: nebbia piena in Storia, fondo scuro in Libera,
    // e una linea sul confine (richiesta dell'utente: capire la forma del mondo e dove si è).
    {
      const m = F / s + Math.max(Wm, Hm);
      g.fillStyle = k ? 'rgb(122, 100, 66)' : '#1a0e04';     // più scuro della nebbia: si distingue dall'ignoto
      g.beginPath();                                          // un solo tracciato pari-dispari: niente giunture
      g.rect(-m, -m, Wm + 2 * m, Hm + 2 * m);
      g.rect(0, 0, Wm, Hm);
      g.fill('evenodd');
      g.strokeStyle = k ? 'rgba(110, 76, 36, 0.8)' : 'rgba(216, 178, 90, 0.7)';
      g.lineWidth = 1.5 * dpr / s;
      g.strokeRect(0, 0, Wm, Hm);
    }
    const noto = (x, z) => !k || k.livello(x, z) >= 1;
    // Blocco disegnato in 3D (solo allargata: dentro, il clic sposta senza ricaricare).
    const b = grande && !k ? opzioni.blocco?.() : null;
    if (b) {
      g.strokeStyle = 'rgba(255, 246, 224, 0.55)';
      g.lineWidth = 1.2 * dpr / s;
      g.setLineDash([6 * dpr / s, 5 * dpr / s]);
      g.strokeRect(b.x - b.half, b.z - b.half, 2 * b.half, 2 * b.half);
      g.setLineDash([]);
    }
    // Segni in pixel (del fondo).
    g.setTransform(1, 0, 0, 1, 0, 0);
    const P = (x, z) => [x * s + tx, z * s + ty];
    const fuori = (x, y, m) => x < -m || y < -m || x > F + m || y > F + m;
    if (c.siti && det !== 'lontano') {
      const m = (grande ? 3.2 : 2.6) * dpr;
      g.lineWidth = 1.3 * dpr;
      for (const st of c.siti) {
        const [x, y] = P(st.x, st.z);
        if (!fuori(x, y, 10) && noto(st.x, st.z)) segnoSito(g, st, x, y, m);
      }
    }
    if (c.luoghi) {
      g.font = `${Math.round(11 * dpr)}px Georgia, serif`;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      for (const l of c.luoghi) {
        const [x, y] = P(l.x, l.z), m = CLASSI_ROCCA[l.classe][1] * dpr * (grande ? 1 : 0.8);
        if (fuori(x, y, 40) || !noto(l.x, l.z)) continue;
        const [col, lettera] = TIPI_LUOGO[l.tipo ?? 'rocca'];
        g.fillStyle = col; g.strokeStyle = '#f4ead0'; g.lineWidth = 1.2 * dpr;
        g.beginPath();                                        // torre con due merli, come sulla Carta
        g.moveTo(x - m, y + m); g.lineTo(x - m, y - m * 0.6); g.lineTo(x - m * 0.45, y - m * 0.6);
        g.lineTo(x - m * 0.45, y - m * 0.15); g.lineTo(x + m * 0.45, y - m * 0.15); g.lineTo(x + m * 0.45, y - m * 0.6);
        g.lineTo(x + m, y - m * 0.6); g.lineTo(x + m, y + m); g.closePath();
        g.fill(); g.stroke();
        if (grande) { g.fillStyle = '#f4ead0'; g.fillText(`${lettera}${l.id + 1}`, x + m + 3 * dpr, y); }
      }
    }
    fondoInfo = { x: fx, z: fz, s, F, M };
    fondoSporco = progresso = nebbiaNuova = false;
    misure.fondi++;
    misure.msFondo = performance.now() - t0;
  }

  /** Il fondo spostato (rifatto se serve), poi cavallo, cavaliere e scala. */
  function ridisegna(now) {
    const t0 = performance.now();
    const W = canvas.width, s = dpr / mpp();                 // pixel del dispositivo per metro
    const fi = fondoInfo;
    const fuoriMargine = !fi || fi.s !== s || fi.F !== W + 2 * Math.round(W * MINIMAPPA.fondo.margine)
      || Math.max(Math.abs(pos.x - fi.x), Math.abs(pos.z - fi.z)) * s > fi.M;
    const passato = now - tFondo;
    if (fuoriMargine || fondoSporco || (progresso && passato >= MINIMAPPA.fondo.progressoMs)
      || (nebbiaNuova && passato >= MINIMAPPA.fondo.nebbiaMs)) {
      rifaiFondo(W, s);
      tFondo = now;
    }
    const { x: fx, z: fz, F } = fondoInfo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fondo, W / 2 - F / 2 + (fx - pos.x) * s, W / 2 - F / 2 + (fz - pos.z) * s);
    const tx = W / 2 - pos.x * s, ty = W / 2 - pos.z * s;
    const P = (x, z) => [x * s + tx, z * s + ty];
    const fuori = (x, y, m) => x < -m || y < -m || x > W + m || y > W + m;
    const cv = opzioni.cavallo?.();
    if (cv && Math.hypot(cv.x - pos.x, cv.z - pos.z) > 3) {
      let [x, y] = P(cv.x, cv.z);
      const bordo = 7 * dpr, fuoriVista = fuori(x, y, -bordo);
      if (fuoriVista) {                                       // il cavallo fuori vista: sul bordo, nella sua direzione
        const dx = x - W / 2, dy = y - W / 2, k = (W / 2 - bordo) / Math.max(Math.abs(dx), Math.abs(dy));
        x = W / 2 + dx * k; y = W / 2 + dy * k;
      }
      ctx.fillStyle = COLORE_CAVALLO; ctx.strokeStyle = '#f4ead0'; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, (fuoriVista ? 3.5 : 4.5) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // Il cavaliere al centro, con la direzione in cui guarda (x verso est, z verso sud: in avanti è (sin, cos)).
    {
      const x = W / 2, y = W / 2, dx = Math.sin(pos.direzione), dy = Math.cos(pos.direzione);
      const L = 9 * dpr, w = 5.5 * dpr;
      ctx.fillStyle = COLORE_CAVALIERE; ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + dx * L, y + dy * L);
      ctx.lineTo(x - dx * L * 0.6 - dy * w, y - dy * L * 0.6 + dx * w);
      ctx.lineTo(x - dx * L * 0.25, y - dy * L * 0.25);
      ctx.lineTo(x - dx * L * 0.6 + dy * w, y - dy * L * 0.6 - dx * w);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Scala: un valore tondo lungo ~1/4 del lato.
    const voluto = lato * mpp() / 4;
    const tondo = [1, 2, 5].flatMap((a) => [1, 10, 100, 1000, 10000].map((b) => a * b)).sort((a, b) => a - b)
      .filter((m) => m <= voluto).pop() ?? 1;
    elScala.style.width = `${tondo / mpp()}px`;
    elScalaTesto.textContent = tondo >= 1000 ? `${tondo / 1000} km` : `${tondo} m`;
    misure.msRidisegno = performance.now() - t0;
    misure.maxRidisegno = Math.max(misure.maxRidisegno, misure.msRidisegno);
  }
  /** Una linea in metri del mondo; i punti più vicini di `tol` m all'ultimo disegnato si saltano (non l'ultimo). */
  function linea(g, f, tol) {
    const X = f.x, Z = f.z, n = X.length;
    g.beginPath();
    let ax = X[0], az = Z[0];
    g.moveTo(ax, az);
    for (let i = 1; i < n; i++) {
      const x = X[i], z = Z[i];
      if (i < n - 1 && Math.abs(x - ax) + Math.abs(z - az) < tol) continue;
      g.lineTo(x, z); ax = x; az = z;
    }
    g.stroke();
  }

  // ─── Comandi ───
  function zoom(d) {
    if (stato === 'icona') return;
    const n = Math.min(MINIMAPPA.zoom.length - 1, Math.max(0, livello + d));
    if (n === livello) return;
    livello = n; lavoro = null; sporca = fondoSporco = true; ricorda();
  }
  /** Icona, piccola o allargata. */
  function imposta(nuovo) {
    if (nuovo === stato) return;
    stato = nuovo; grande = stato === 'grande'; lavoro = null; ricorda();
    if (!el.hidden) adatta();
  }
  /** N: icona → piccola → allargata → icona. */
  function alterna() { imposta(STATI[(STATI.indexOf(stato) + 1) % STATI.length]); }
  el.querySelector('.meno').addEventListener('click', () => zoom(1));
  el.querySelector('.piu').addEventListener('click', () => zoom(-1));
  el.querySelector('.grande').addEventListener('click', () => imposta(grande ? 'piccola' : 'grande'));
  el.querySelector('.chiudi').addEventListener('click', () => imposta('icona'));
  el.querySelector('.apri').addEventListener('click', () => imposta('piccola'));
  el.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); zoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  /** Punto del mondo (m) sotto il puntatore. */
  function nelMondo(e) {
    const r = canvas.getBoundingClientRect();
    return { x: pos.x + (e.clientX - r.left - lato / 2) * mpp(), z: pos.z + (e.clientY - r.top - lato / 2) * mpp() };
  }
  canvas.addEventListener('click', (e) => {
    if (!pos) return;
    if (!grande) { imposta('grande'); return; }
    const p = nelMondo(e);
    opzioni.onVai?.(p.x, p.z);
  });
  const PUNTI = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  canvas.addEventListener('pointermove', (e) => {
    if (!grande || !pos || !cartaFatta) return;
    const p = nelMondo(e), dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
    if (p.x < 0 || p.z < 0 || p.x > cartaFatta.cols * cartaFatta.cella || p.z > cartaFatta.rows * cartaFatta.cella) {
      elPiede.textContent = 'oltre il confine del mondo'; return;
    }
    const k = opzioni.conoscenza?.();
    if (k && k.livello(p.x, p.z) < 1) { elPiede.textContent = 'terre ignote · rotella o +/−: zoom'; return; }
    const verso = PUNTI[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8];
    const q = quotaFinale(cartaFatta, p.x, p.z);
    elPiede.textContent = `${d >= 1000 ? `${(d / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km` : `${Math.round(d)} m`}`
      + ` a ${verso} · quota ${Math.round(q)} m${(opzioni.prove?.() ?? true) ? ' · clic: porta lì il cavaliere (prova)' : ''}`;
  });
  canvas.addEventListener('pointerleave', piede);

  return {
    get grande() { return grande; },
    /** Per la console (kd.minimappa.info). */
    get info() {
      const d = (r) => r && { det: r.det, passo: r.passo, n: r.n, righe: r.righe, ms: Math.round(r.ms), x0: r.x0, z0: r.z0, w: r.w, fiumi: r.fiumi.length, strade: r.strade.length };
      return { stato, livello, mpp: mpp(), lato, dettaglio: dettaglio(), corrente: d(corrente), lavoro: d(lavoro),
        fondi: misure.fondi, msFondo: +misure.msFondo.toFixed(2), msRidisegno: +misure.msRidisegno.toFixed(2),
        maxRidisegno: +misure.maxRidisegno.toFixed(2) };
    },
    get stato() { return stato; },
    /** Per le misure dalla console: il prossimo ridisegno rifà anche il fondo. */
    rifai() { sporca = fondoSporco = true; },
    zoom, alterna, imposta,
    /** Nasconde (Carta aperta, percorso di prova) o lascia mostrare la minimappa. */
    nascondi(si) { nascosta = si; if (si) { el.hidden = true; adatta(); } },
    /** Ogni fotogramma: segue il cavaliere, avanza il rilievo fine, ridisegna se serve. */
    aggiorna(now) {
      const c = opzioni.carta();
      pos = nascosta || !c ? null : opzioni.posizione();
      if (!pos) {
        if (!el.hidden) { el.hidden = true; adatta(); }
        return;
      }
      if (el.hidden) { el.hidden = false; adatta(); }
      if (stato === 'icona') return;           // ridotta a icona: nessun lavoro
      preparaCarta(c);
      const k = opzioni.conoscenza?.();
      if (k && k.dati) preparaMaschera(k);
      if (grande && !k) {                      // riquadro del blocco (nel fondo): si rifà quando il blocco cambia
        const b = opzioni.blocco?.(), chiave = b ? `${b.x},${b.z},${b.half}` : '';
        if (chiave !== chiaveBlocco) { chiaveBlocco = chiave; sporca = fondoSporco = true; }
      }
      if (!lavoro && daRifare(corrente)) nuovoLavoro();
      if (lavoro) avanzaLavoro();
      const spost = Math.hypot(pos.x - ultimo.x, pos.z - ultimo.z) / mpp();
      if (!sporca && !(spost > 0.3) && !(Math.abs(pos.direzione - ultimo.d) > 0.03)) return;
      if (now - tUltimo < (grande ? MINIMAPPA.ridisegnoMsGrande : MINIMAPPA.ridisegnoMs)) return;
      ridisegna(now);
      tUltimo = now; sporca = nebbiaNuova;         // nebbia nuova ancora fuori dal fondo: si riprova
      ultimo.x = pos.x; ultimo.z = pos.z; ultimo.d = pos.direzione;
    },
  };
}
