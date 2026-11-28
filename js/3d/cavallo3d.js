// Knight Dawn — cavallo 3D (milestone «Cavallo», docs/ESPLORAZIONE_3D.md; budget in docs/PRESTAZIONI.md, passo 6)
// Modello simil-realistico costruito via codice (sezioni ovali lungo curve, normali lisce), come il cavaliere.
//
// Passo 1: modello fermo accanto al cavaliere, appoggiato sul terreno (zoccoli con IK a due ossa), coda e testa
// che si muovono piano. Passo 2: segue il cavaliere a piedi ripercorrendo le sue tracce (o dritto, se la linea è
// libera), con passo, trotto e galoppo animati; da fermo bruca o lo guarda; bloccato aspetta; col fischio (F) arriva o
// ricompare fuori dall'inquadratura. La sella (montare, andature comandate) nel passo 3.
//
// Convenzioni come il cavaliere: origine a terra sotto il centro del corpo, asse Y in alto, il cavallo guarda
// verso +Z locale; rotazione intorno a X: angolo negativo = in avanti (in su per collo e coda), positivo = indietro.
//
// Budget: ≤ 6.000 triangoli e ≤ 12 oggetti, uno per snodo animato (corpo, collo, testa, coda, 4 gambe × 2).
// Ogni snodo è UNA mesh: i pezzi sono uniti al caricamento con il colore nei vertici; i metalli (staffe, morso)
// sono un secondo gruppo della stessa mesh con materiale Phong (una chiamata di disegno in più, niente oggetti).

import * as THREE from 'three';

const PAL = (typeof PALETTE !== 'undefined') ? PALETTE : {};

export const CAVALLO_CFG = {
  raggio: 0.45,       // m: ingombro di ognuno dei due cerchi (petto e groppa) contro mura, tronchi e cavaliere
  semiAsse: 0.55,     // m: distanza dei due cerchi dal centro, lungo l'asse del corpo
  accanto: 2.6,       // m: di lato al cavaliere, alla partenza
  pendenzaMax: 22,    // gradi: dove il cavallo può stare fermo (posto alla partenza, ricomparsa)
  // Passo 2: segue a piedi (decisioni in docs/ESPLORAZIONE_3D.md, «Cavallo»)
  distanza: 5,        // m dal cavaliere quando lo segue (4–6)
  cono: 0.5,          // rad: non sta nel cono alle spalle del cavaliere, dove guarda la camera
  diretto: 45,        // m: entro questa distanza, se la linea è libera, taglia dritto invece di seguire le tracce
  passoTraccia: 1,    // m tra due punti delle tracce
  tracce: 80,         // punti tenuti (gli ultimi ~80 m)
  velPasso: 1.8,      // m/s
  velTrotto: 8,       // m/s: trotto più veloce (oltre, galoppo)
  velSegue: 13,       // m/s: al massimo, quando recupera
  accelerazione: 3,   // m/s²
  frenata: 5,         // m/s²
  salitaMax: 28,      // gradi nella direzione di marcia (il cavaliere: 40)
  discesaMax: 30,
  pendenzaParete: 48, // gradi del terreno naturale: lì non entra, come il cavaliere
  gradino: 0.3,       // m: ostacoli più bassi non lo fermano (non scavalca come il cavaliere)
  attesa: 2.5,        // s bloccato prima di smettere di seguire
  indietro: 60,       // m: oltre smette di seguire e aspetta
  fischio: 250,       // m: entro questa distanza, con la strada libera, al fischio arriva
  // Fermo finché il cavaliere non si allontana (richiesta dell'utente, 28/11: avvicinarlo per montare). Zona morta tra
  // il posto in cui si ferma (~4,5 m) e riparte: dentro, non si gira né si sposta; si avvicina il cavaliere, non lui.
  riparte: 10,        // m: oltre questa distanza dal cavaliere riparte a seguirlo
  incontro: 8,        // m: se il cavaliere gli viene incontro entro questa distanza, si ferma e lo aspetta
  // Passo 3: in sella (andature riviste con l'utente il 28/11/2026: a cavallo le distanze devono sembrare più corte)
  sella: {
    vel: { passo: 1.8, trotto: 8, galoppo: 18 },   // m/s: Ctrl, normale, Shift
    indietro: 1,                                    // m/s
    accelerazione: 4, frenata: 7,                   // m/s²
    giro: { passo: 1.6, trotto: 1.3, galoppo: 0.8 },// rad/s con A/D: curve più larghe al galoppo
    accelGiro: 4, arrestoGiro: 14,
  },
};

// Colori (sRGB) nei vertici. Baio: mantello bruno rossiccio, criniera, coda e gambe nere.
const COL = {
  mantello:  '#6e3b1f',
  muso:      '#3d2416',
  nero:      '#17110d',
  zoccolo:   '#2b2520',
  occhio:    '#060403',
  cuoio:     '#4e2c14',
  gualdrappa: PAL.rossoBandiera || '#8a1010',
  orlo:      '#a8853f',     // bordo della gualdrappa (stesso ottone del cavaliere, qui come stoffa)
  ferro:     '#9aa1a8',     // staffe, morso, fibbie (Phong)
};

// Misure (m) del ronzino: ~1,45 m al garrese. Le forme sono sezioni ovali lungo curve (tubo): ogni sezione ha
// semilarghezza w e due semialtezze, hs verso la «parte alta» della curva (schiena, cresta, fronte, davanti della
// gamba) e hi verso l'opposta (ventre, gola, ganasce, tendini): così si fanno garrese, cresta, ganasce e tendini.
const CENTRO_Y = 1.12;                       // perno del corpo (beccheggio sul pendio)
const ANTERIORE = { x: 0.155, y: 0.965, z: 0.46, L1: 0.44, L2: 0.53, piede: 0 };    // gomito → ginocchio → suolo
const POSTERIORE = { x: 0.15, y: 0.975, z: -0.5, L1: 0.465, L2: 0.53, piede: -0.15 }; // grassella → garretto → suolo
const PERNO_COLLO = new THREE.Vector3(0, 1.25, 0.52);
const PERNO_CODA = new THREE.Vector3(0, 1.37, -0.82);
const PERNO_TESTA = new THREE.Vector3(0, 1.76, 0.975);              // nuca
const DIR_TESTA = new THREE.Vector3(0, -Math.sin(1.05), Math.cos(1.05));   // dalla nuca al muso, ~60° sotto l'orizzonte

// Chiavi [z, y, w, hs, hi] lungo la curva (dalla coda al petto, dalla base del collo alla nuca…)
const TRONCO = [
  [-0.88, 1.13, 0.03, 0.03, 0.03], [-0.83, 1.15, 0.13, 0.18, 0.2], [-0.7, 1.15, 0.2, 0.25, 0.27],
  [-0.5, 1.14, 0.225, 0.27, 0.29], [-0.25, 1.12, 0.215, 0.24, 0.32], [0.0, 1.12, 0.22, 0.23, 0.35],
  [0.25, 1.13, 0.215, 0.25, 0.34], [0.45, 1.12, 0.195, 0.3, 0.31], [0.62, 1.07, 0.17, 0.24, 0.27],
  [0.73, 1.02, 0.12, 0.15, 0.19], [0.77, 1.0, 0.03, 0.03, 0.03],
];
const COLLO = [
  [0.36, 1.2, 0.15, 0.18, 0.2], [0.56, 1.29, 0.13, 0.15, 0.2], [0.74, 1.42, 0.105, 0.125, 0.15],
  [0.87, 1.58, 0.085, 0.1, 0.11], [0.95, 1.72, 0.072, 0.075, 0.085], [0.985, 1.79, 0.05, 0.04, 0.05],
];
const CODA = [
  [-0.8, 1.38, 0.045, 0.045, 0.045], [-0.9, 1.33, 0.055, 0.055, 0.055], [-0.96, 1.2, 0.065, 0.07, 0.07],
  [-0.99, 1.0, 0.07, 0.08, 0.08], [-0.99, 0.78, 0.06, 0.07, 0.07], [-0.97, 0.62, 0.035, 0.045, 0.045],
  [-0.96, 0.56, 0.01, 0.01, 0.01],
];
// Testa: [t lungo DIR_TESTA dalla nuca, w, hs (fronte), hi (ganasce)]
const TESTA = [
  [-0.07, 0.04, 0.04, 0.04], [-0.01, 0.08, 0.07, 0.09], [0.12, 0.1, 0.07, 0.14], [0.25, 0.085, 0.065, 0.1],
  [0.38, 0.065, 0.055, 0.065], [0.5, 0.06, 0.05, 0.06], [0.57, 0.066, 0.046, 0.062], [0.615, 0.03, 0.02, 0.03],
];
// Gambe: [dy dal perno, dz, w, hs (davanti), hi (dietro)]
const ALTA_ANT = [[0.15, 0, 0.05, 0.07, 0.07], [0.08, 0, 0.075, 0.105, 0.095], [0.0, 0, 0.075, 0.09, 0.075],
  [-0.15, 0, 0.06, 0.06, 0.055], [-0.32, 0, 0.045, 0.045, 0.04], [-0.42, 0, 0.05, 0.05, 0.045], [-0.465, 0, 0.03, 0.03, 0.03]];
const ALTA_POST = [[0.2, 0, 0.085, 0.12, 0.12], [0.1, 0, 0.105, 0.12, 0.16], [-0.05, 0, 0.085, 0.07, 0.11],
  [-0.25, 0, 0.06, 0.045, 0.07], [-0.4, 0, 0.05, 0.045, 0.06], [-0.465, 0, 0.05, 0.045, 0.055], [-0.5, 0, 0.03, 0.03, 0.03]];
const STINCO = [[-0.06, 0, 0.04, 0.035, 0.045], [-0.14, 0, 0.031, 0.028, 0.048], [-0.27, 0, 0.032, 0.03, 0.05],
  [-0.325, 0.005, 0.044, 0.043, 0.055], [-0.37, 0.018, 0.036, 0.036, 0.036], [-0.415, 0.03, 0.042, 0.04, 0.04],
  [-0.445, 0.035, 0.046, 0.045, 0.045]];
const BASSA_ANT = [[0.04, 0, 0.04, 0.04, 0.04], [0.0, 0, 0.05, 0.05, 0.05], ...STINCO];
const BASSA_POST = [[0.04, 0, 0.045, 0.045, 0.07], [0.0, 0, 0.055, 0.05, 0.08], [-0.05, 0, 0.045, 0.038, 0.06], ...STINCO.slice(1)];

// ─── Pezzi: geometrie in coordinate di riposo (a terra, centro del corpo), poi unite per snodo ───────────────

/** Solido di rotazione attorno a Y. profilo: [[raggio, y], ...]; sx/sz schiacciano la sezione. */
function tornio(profilo, { seg = 16, sx = 1, sz = 1 } = {}) {
  const geo = new THREE.LatheGeometry(profilo.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  geo.scale(sx, 1, sz);
  geo.computeVertexNormals();
  return geo;
}

/** Ellissoide di semiassi (rx, ry, rz). */
function ellissoide(rx, ry, rz, seg = 12) {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg / 2)));
  geo.scale(rx, ry, rz);
  geo.computeVertexNormals();
  return geo;
}

const _X = new THREE.Vector3(1, 0, 0);
/**
 * Tubo a sezioni ovali lungo una curva nel piano YZ (eventualmente spostata in x).
 * chiavi: [{ x, y, z, w, hs, hi }] in ordine; n sezioni ricampionate, seg punti per sezione.
 * La «parte alta» della sezione è cross(tangente, X): sopra per una curva che va avanti, davanti per una che scende.
 * arco: [a0, a1] per una superficie aperta (es. la gualdrappa); altrimenti chiusa, con i tappi.
 * Restituisce la geometria e le sezioni campionate (centro, alto, w, hs, hi).
 */
function tubo(chiavi, { n = 16, seg = 14, arco = null, tappi = true, gonfia = 0 } = {}) {
  const pos = new THREE.CatmullRomCurve3(chiavi.map((k) => new THREE.Vector3(k.x || 0, k.y, k.z)), false, 'centripetal');
  const dim = new THREE.CatmullRomCurve3(chiavi.map((k) => new THREE.Vector3(k.w, k.hs, k.hi)));
  const chiuso = !arco;
  const m = chiuso ? seg : seg + 1;
  const v = [], sezioni = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const c = pos.getPoint(u), t = pos.getTangent(u), d = dim.getPoint(u);
    const alto = new THREE.Vector3().crossVectors(t, _X).normalize();
    const w = d.x + gonfia, hs = d.y + gonfia, hi = d.z + gonfia;
    sezioni.push({ c, alto, t, w, hs, hi });
    for (let j = 0; j < m; j++) {
      const a = chiuso ? (j / seg) * Math.PI * 2 : arco[0] + (arco[1] - arco[0]) * (j / seg);
      const s = Math.sin(a);
      v.push(c.x + w * Math.cos(a), c.y + alto.y * s * (s > 0 ? hs : hi), c.z + alto.z * s * (s > 0 ? hs : hi));
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < (chiuso ? seg : seg); j++) {
      const j1 = chiuso ? (j + 1) % seg : j + 1;
      const a = i * m + j, b = i * m + j1, c = (i + 1) * m + j, d = (i + 1) * m + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Verso delle facce laterali: se puntano dentro, si girano tutte
  const P = (q) => new THREE.Vector3(v[q * 3], v[q * 3 + 1], v[q * 3 + 2]);
  const fuori = (q0, q1, q2, rif) => {
    const A = P(q0);
    return P(q1).sub(A).cross(P(q2).sub(A)).dot(rif) >= 0;
  };
  const im = Math.floor(n / 2) * m + Math.floor(seg / 4);
  const k0 = idx.findIndex((q, k) => k % 3 === 0 && q === im);
  if (k0 >= 0 && !fuori(idx[k0], idx[k0 + 1], idx[k0 + 2], P(idx[k0]).sub(sezioni[Math.floor(n / 2)].c))) {
    for (let k = 0; k < idx.length; k += 3) { const q = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = q; }
  }
  // Tappi alle estremità, ogni triangolo rivolto verso l'esterno (lungo la tangente)
  if (chiuso && tappi) {
    for (const [i, verso] of [[0, -1], [n - 1, 1]]) {
      const s = sezioni[i], k = v.length / 3;
      v.push(s.c.x + s.t.x * 0.004 * verso, s.c.y + s.t.y * 0.004 * verso, s.c.z + s.t.z * 0.004 * verso);
      const rif = s.t.clone().multiplyScalar(verso);
      for (let j = 0; j < seg; j++) {
        const a = i * m + j, b = i * m + (j + 1) % seg;
        if (fuori(k, a, b, rif)) idx.push(k, a, b); else idx.push(k, b, a);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, sezioni };
}

// ─── Naturalezza: rumore liscio, rilievi anatomici, piccole asimmetrie ───────────────────────────────
/** Rumore liscio deterministico in [-1, 1] (somma di onde sfasate: niente tabelle, stesso risultato a ogni avvio). */
function rumore(x, y, z) {
  return (Math.sin(x * 7.3 + y * 2.1 + 1.7) * Math.sin(y * 6.1 - z * 3.3 + 0.4) * Math.sin(z * 5.7 + x * 1.9 + 2.3)
    + 0.5 * Math.sin(x * 15.1 - z * 11.3 + 0.9) * Math.sin(y * 13.7 + x * 4.1 + 1.1)) / 1.5;
}

// Rilievi del tronco: [x, y, z, raggio, ampiezza]; x > 0 = lato sinistro, ripetuti a destra un poco diversi
// (un cavallo vero non è speculare). Ampiezza positiva = muscolo o osso che affiora, negativa = incavo.
const RILIEVI_TRONCO = [
  [0.17, 1.17, 0.5, 0.12, 0.02],     // massa della spalla
  [0.13, 1.3, 0.44, 0.07, 0.012],    // margine della scapola
  [0.17, 1.0, 0.65, 0.06, 0.022],    // punta della spalla
  [0.07, 0.93, 0.7, 0.07, 0.016],    // pettorale
  [0.19, 0.95, 0.45, 0.08, 0.02],    // tricipite sopra il gomito
  [0.2, 0.9, 0.32, 0.07, -0.012],    // incavo dietro il gomito
  [0.2, 1.06, -0.25, 0.1, -0.014],   // fianco
  [0.17, 1.31, -0.38, 0.06, 0.02],   // punta dell'anca
  [0.14, 1.25, -0.62, 0.14, 0.02],   // groppa
  [0.15, 1.05, -0.78, 0.1, 0.014],   // natica
  [0.05, 1.37, -0.05, 0.1, -0.008],  // lieve sella della schiena
];

/**
 * Sposta i vertici lungo la normale: rilievi (gaussiane, a sinistra e a destra con ampiezze diverse) e rumore liscio,
 * poi ricalcola le normali. lati: [sinistra, destra] = moltiplicatori dell'ampiezza.
 */
function modella(geo, rilievi = [], { rumoreAmp = 0.004, lati = [1, 0.85], seme = 0, forza = 1 } = {}) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, nr = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d = rumoreAmp * rumore(x * 3 + seme, y * 3, z * 3);
    for (const [rx, ry, rz, r, a] of rilievi) {
      for (const [sx, k] of [[1, lati[0]], [-1, lati[1]]]) {
        if (rx === 0 && sx < 0) continue;
        const q = ((x - rx * sx) ** 2 + (y - ry) ** 2 + (z - rz) ** 2) / (r * r);
        if (q < 9) d += a * k * forza * Math.exp(-q);
      }
    }
    // costole appena accennate sul costato
    if (z > -0.15 && z < 0.3 && y > 0.85 && y < 1.15 && Math.abs(x) > 0.15) {
      d += 0.0025 * Math.sin(z * 42) * Math.min(1, (0.3 - z) * 6, (z + 0.15) * 6);
    }
    p.setXYZ(i, x + nr.getX(i) * d, y + nr.getY(i) * d, z + nr.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

const chiaviZY = (lista, x = 0) => lista.map(([z, y, w, hs, hi]) => ({ x, y, z, w, hs, hi }));
const chiaviGamba = (lista, G, lato) => lista.map(([dy, dz, w, hs, hi]) =>
  ({ x: G.x * lato, y: G.y + dy, z: G.z + dz, w, hs, hi }));
const puntoTesta = (t) => PERNO_TESTA.clone().addScaledVector(DIR_TESTA, t);

/** Raccoglitore dei pezzi di uno snodo: colore nei vertici, metallo a parte; ombra = scurisce le parti in basso. */
function pezzi() {
  const lista = [];
  return {
    lista,
    add(geo, colore, metallo = false, ombra = true) { lista.push({ geo, colore, metallo, ombra }); return geo; },
  };
}

/**
 * Unisce i pezzi in una sola geometria non indicizzata con colore nei vertici, spostata in modo che il perno sia
 * l'origine. Gruppo 0 = Lambert, gruppo 1 = Phong (se ci sono metalli). Le facce rivolte in basso sono un poco più
 * scure (occlusione finta: ventre, gola, interno delle gambe), così il mantello non è una tinta piatta.
 */
function unisci(p, perno) {
  const ordinati = [...p.lista.filter((x) => !x.metallo), ...p.lista.filter((x) => x.metallo)];
  const parti = ordinati.map(({ geo, colore, metallo, ombra }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.translate(-perno.x, -perno.y, -perno.z);
    return { g, c: new THREE.Color(colore), metallo, ombra };
  });
  const n = parti.reduce((s, x) => s + x.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0, inizioMetallo = -1;
  for (const { g, c, metallo, ombra } of parti) {
    if (metallo && inizioMetallo < 0) inizioMetallo = o;
    const k = g.attributes.position.count, na = g.attributes.normal;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(na.array, o * 3);
    for (let i = 0; i < k; i++) {
      const pa = g.attributes.position;
      // facce in basso più scure + variazione irregolare del pelo (schiena più scura, macchie appena accennate)
      const f = ombra ? (0.66 + 0.34 * (0.5 + 0.5 * na.getY(i)))
        * (1 + 0.07 * rumore(pa.getX(i) * 2.2 + 3, pa.getY(i) * 2.2, pa.getZ(i) * 2.2)) : 1;
      col.set([c.r * f, c.g * f, c.b * f], (o + i) * 3);
    }
    o += k;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (inizioMetallo < 0) return { geo, metallo: false };
  geo.addGroup(0, inizioMetallo, 0);
  geo.addGroup(inizioMetallo, n - inizioMetallo, 1);
  return { geo, metallo: true };
}

// Sezione del tronco più vicina a una z (per appoggiare sella e gualdrappa)
let _sezTronco = null;
function sezioneTronco(z) {
  if (!_sezTronco) _sezTronco = tubo(chiaviZY(TRONCO), { n: 120, seg: 4 }).sezioni;
  let best = _sezTronco[0];
  for (const s of _sezTronco) if (Math.abs(s.c.z - z) < Math.abs(best.c.z - z)) best = s;
  return best;
}

// Tronco, sella, gualdrappa, sottopancia, staffili e staffe.
function pezziCorpo() {
  const p = pezzi();
  p.add(modella(tubo(chiaviZY(TRONCO), { n: 21, seg: 18 }).geo, RILIEVI_TRONCO, { forza: 1.7, rumoreAmp: 0.006 }), COL.mantello);
  // Gualdrappa: lembo di stoffa sulla schiena, appena sopra il tronco (superficie aperta)
  const zPanno = [-0.28, -0.12, 0.05, 0.22, 0.34];
  const panno = zPanno.map((z) => { const s = sezioneTronco(z); return { x: 0, y: s.c.y, z, w: s.w, hs: s.hs, hi: s.hi }; });
  p.add(tubo(panno, { n: 8, seg: 14, arco: [Math.PI / 2 - 1.2, Math.PI / 2 + 1.2], gonfia: 0.012 }).geo, COL.gualdrappa, false, false);
  // Sottopancia
  const cinghia = [0.24, 0.3].map((z) => { const s = sezioneTronco(z); return { x: 0, y: s.c.y, z, w: s.w, hs: s.hs, hi: s.hi }; });
  p.add(tubo(cinghia, { n: 2, seg: 18, tappi: false, gonfia: 0.016 }).geo, COL.cuoio);
  // Sella: seggio, arcione davanti e paletta dietro, appoggiati sulla schiena
  const sopra = (z) => { const s = sezioneTronco(z); return s.c.y + s.hs; };
  const seggio = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, 1.0);
  seggio.scale(0.19, 0.09, 0.3);
  seggio.computeVertexNormals();
  p.add(seggio.translate(0, sopra(0.04) - 0.06, 0.04), COL.cuoio);
  p.add(ellissoide(0.085, 0.05, 0.05, 10).translate(0, sopra(0.28) + 0.03, 0.28), COL.cuoio);
  p.add(ellissoide(0.13, 0.065, 0.04, 10).rotateX(0.35).translate(0, sopra(-0.2) + 0.035, -0.2), COL.cuoio);
  // Staffili e staffe (le staffe in ferro)
  const xStaffa = sezioneTronco(0.08).w + 0.02;
  for (const sx of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.012, 0.42, 0.035).rotateZ(0.05 * sx).translate(xStaffa * sx, 1.17, 0.08), COL.cuoio, false, false);
    const staffa = new THREE.TorusGeometry(0.055, 0.009, 4, 10);
    staffa.scale(1, 1.1, 1).rotateY(Math.PI / 2);
    p.add(staffa.translate((xStaffa + 0.012) * sx, 0.95, 0.08), COL.ferro, true);
  }
  return p;
}

// Collo arcuato con criniera lungo la cresta.
function pezziCollo() {
  const p = pezzi();
  const { geo, sezioni } = tubo(chiaviZY(COLLO), { n: 14, seg: 14 });
  p.add(modella(geo, [[0.1, 1.38, 0.66, 0.08, 0.01], [0.06, 1.5, 0.84, 0.05, -0.006]], { seme: 1 }), COL.mantello);
  // Criniera: lama di crini sulla cresta, ricadente da un lato
  const crini = sezioni.filter((_, i) => i % 2 === 0 || i === sezioni.length - 1).map((s, i, a) => {
    const k = i / (a.length - 1);
    const q = s.c.clone().addScaledVector(s.alto, s.hs * 0.92);
    const ciocca = 1 + 0.35 * Math.sin(i * 2.7 + 0.5) * Math.sin(i * 1.3);     // ciocche di altezza diversa
    return { x: -0.02 - 0.012 * Math.sin(k * 3), y: q.y, z: q.z, w: 0.024 - 0.008 * k, hs: (0.042 - 0.012 * k) * ciocca, hi: 0.012 };
  });
  p.add(tubo(crini, { n: 12, seg: 8 }).geo, COL.nero, false, false);
  return p;
}

// Testa con ganasce, muso, orecchie, occhi, narici, finimenti e morso.
function pezziTesta() {
  const p = pezzi();
  const chiavi = TESTA.map(([t, w, hs, hi]) => { const c = puntoTesta(t); return { x: 0, y: c.y, z: c.z, w, hs, hi }; });
  const sopraOcchio = puntoTesta(0.15), ganascia = puntoTesta(0.13), narice = puntoTesta(0.56);
  p.add(modella(tubo(chiavi, { n: 16, seg: 16 }).geo, [
    [0.08, sopraOcchio.y + 0.03, sopraOcchio.z + 0.02, 0.035, 0.008],
    [0.085, ganascia.y - 0.05, ganascia.z - 0.03, 0.06, 0.01],
    [0.045, narice.y, narice.z, 0.025, 0.006],
  ], { rumoreAmp: 0.0025, seme: 2 }), COL.mantello);
  // Muso più scuro: ultimo tratto un poco più largo
  const muso = TESTA.slice(5).map(([t, w, hs, hi]) => { const c = puntoTesta(t); return { x: 0, y: c.y, z: c.z, w, hs, hi }; });
  p.add(tubo(muso, { n: 5, seg: 14, gonfia: 0.004 }).geo, COL.muso);
  // Sistema della testa per i dettagli: Y lungo DIR_TESTA dalla nuca, -Z verso la fronte
  const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), DIR_TESTA);
  const inTesta = (geo) => { geo.applyQuaternion(rot); return geo.translate(PERNO_TESTA.x, PERNO_TESTA.y, PERNO_TESTA.z); };
  for (const sx of [-1, 1]) {
    p.add(inTesta(ellissoide(0.016, 0.024, 0.018, 8).translate(0.088 * sx, 0.17, -0.03)), COL.occhio, false, false);
    p.add(inTesta(ellissoide(0.012, 0.022, 0.012, 6).translate(0.04 * sx, 0.585, 0.0)), COL.occhio, false, false);
  }
  // Finimenti: frontale, capezzina, guance (cuoio); morso (ferro)
  for (const t of [0.04, 0.43]) {
    const fascia = TESTA.map(([tt, w, hs, hi]) => [tt, w, hs, hi]);
    const k = (tt) => { let i = 0; while (i < fascia.length - 2 && fascia[i + 1][0] < tt) i++; const [a, b] = [fascia[i], fascia[i + 1]]; const f = (tt - a[0]) / (b[0] - a[0]); return [0, 1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * f); };
    const ch = [t, t + 0.025].map((tt) => { const [, w, hs, hi] = k(tt); const c = puntoTesta(tt); return { x: 0, y: c.y, z: c.z, w, hs, hi }; });
    p.add(tubo(ch, { n: 2, seg: 16, tappi: false, gonfia: 0.008 }).geo, COL.cuoio, false, false);
  }
  for (const sx of [-1, 1]) {
    p.add(inTesta(new THREE.BoxGeometry(0.006, 0.4, 0.018).translate(0.083 * sx, 0.24, 0.0)), COL.cuoio, false, false);
  }
  p.add(inTesta(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6).rotateZ(Math.PI / 2).translate(0, 0.52, 0.04)),
    COL.ferro, true);
  // Orecchie: ritte sulla nuca, un poco in avanti e in fuori
  for (const sx of [-1, 1]) {
    const o = new THREE.ConeGeometry(0.028, 0.11, 7, 1);
    o.scale(1, 1, 0.55);
    o.translate(0, 0.055, 0);
    if (sx > 0) o.rotateX(0.25).rotateZ(-0.2);          // sinistra: in avanti
    else o.rotateY(0.9).rotateX(-0.25).rotateZ(0.45);   // destra: girata di lato, un poco indietro
    o.translate(PERNO_TESTA.x + 0.045 * sx, PERNO_TESTA.y + 0.04, PERNO_TESTA.z + 0.03);
    p.add(o, COL.mantello);
  }
  return p;
}

// Coda: crini che scendono dall'attaccatura, prima indietro poi giù.
function pezziCoda() {
  const p = pezzi();
  const chiavi = chiaviZY(CODA).map((k, i) => ({ ...k, x: 0.025 * Math.sin(i * 0.9) + 0.01 * i }));
  p.add(modella(tubo(chiavi, { n: 12, seg: 10 }).geo, [], { rumoreAmp: 0.008, seme: 3 }), COL.nero, false, false);
  return p;
}

// Gamba: parte alta dal perno al ginocchio/garretto e parte bassa fino allo zoccolo (a riposo verticali).
function pezziGambaAlta(G, lato, posteriore) {
  const p = pezzi();
  p.add(modella(tubo(chiaviGamba(posteriore ? ALTA_POST : ALTA_ANT, G, lato), { n: 8, seg: 12 }).geo, [],
    { rumoreAmp: 0.004, seme: lato * 5 + (posteriore ? 2 : 0) }), COL.mantello);
  return p;
}

function pezziGambaBassa(G, lato, posteriore) {
  const p = pezzi();
  const ginocchio = { ...G, y: G.y - G.L1 };
  p.add(tubo(chiaviGamba(posteriore ? BASSA_POST : BASSA_ANT, ginocchio, lato), { n: 11, seg: 12 }).geo, COL.nero);
  const L = G.L2;
  const zoccolo = tornio([[0.045, -0.43], [0.056, -0.47], [0.066, -L + 0.005], [0.064, -L], [0, -L]], { seg: 12 });
  p.add(zoccolo.translate(G.x * lato, ginocchio.y, G.z + 0.04), COL.zoccolo, false, false);
  return p;
}

function materiali() {
  return [
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    new THREE.MeshPhongMaterial({ vertexColors: true, specular: '#5c6168', shininess: 38 }),
  ];
}

function buildModel() {
  const mats = materiali();
  const meshDi = (p, perno, nome) => {
    const { geo, metallo } = unisci(p, perno);
    const m = new THREE.Mesh(geo, metallo ? mats : mats[0]);
    m.name = nome;
    return m;
  };
  const snodo = (mesh, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(mesh); return g; };

  const root = new THREE.Group();
  root.name = 'cavallo';
  // Corpo: perno sull'asse del tronco, così il beccheggio sul pendio non sposta il centro.
  const pc = new THREE.Vector3(0, CENTRO_Y, 0);
  const corpo = snodo(meshDi(pezziCorpo(), pc, 'cavallo-corpo'), 0, CENTRO_Y, 0);
  root.add(corpo);
  const rel = (v) => v.clone().sub(pc);
  const pcollo = rel(PERNO_COLLO), pcoda = rel(PERNO_CODA);
  const collo = snodo(meshDi(pezziCollo(), PERNO_COLLO, 'cavallo-collo'), pcollo.x, pcollo.y, pcollo.z);
  corpo.add(collo);
  const ptesta = PERNO_TESTA.clone().sub(PERNO_COLLO);
  const testa = snodo(meshDi(pezziTesta(), PERNO_TESTA, 'cavallo-testa'), ptesta.x, ptesta.y, ptesta.z);
  collo.add(testa);
  const coda = snodo(meshDi(pezziCoda(), PERNO_CODA, 'cavallo-coda'), pcoda.x, pcoda.y, pcoda.z);
  corpo.add(coda);

  const gambe = [];
  for (const [G, posteriore] of [[ANTERIORE, false], [POSTERIORE, true]]) {
    for (const lato of [1, -1]) {          // +1 = sinistra del cavallo (+X)
      const perno = new THREE.Vector3(G.x * lato, G.y, G.z);
      const ginocchio = new THREE.Vector3(G.x * lato, G.y - G.L1, G.z);
      const pr = rel(perno);
      const alta = snodo(meshDi(pezziGambaAlta(G, lato, posteriore), perno, 'cavallo-gamba'), pr.x, pr.y, pr.z);
      const bassa = snodo(meshDi(pezziGambaBassa(G, lato, posteriore), ginocchio, 'cavallo-gamba'), 0, -G.L1, 0);
      alta.add(bassa);
      corpo.add(alta);
      gambe.push({ G, lato, posteriore, alta, bassa });
    }
  }
  return { root, corpo, collo, testa, coda, gambe };
}

// Ombra ovale finta (come quella del cavaliere), adagiata sul terreno.
function buildOmbra() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.4)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.24)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const geo = new THREE.PlaneGeometry(1.0, 2.5).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'ombra-cavallo';
  m.renderOrder = 1;
  return m;
}


// ─── Andature e pendenze (senza grafica: si provano in Node) ─────────────────────────

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const avvicina = (rate, dt) => 1 - Math.exp(-rate * dt);
const angolo = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // in (-π, π]
const GRADI = Math.PI / 180;

// Andature: lunghezza del ciclo (m percorsi in un ciclo completo delle quattro gambe), frazione del ciclo con lo
// zoccolo a terra, sfasamento di ogni gamba [AS, AD, PS, PD] (anteriore/posteriore, sinistra/destra) e quanto si alza
// lo zoccolo. Passo a 4 tempi (laterale), trotto a diagonali, galoppo a 3 tempi con sospensione (piede sinistro avanti).
// Le falcate sono più corte del vero (gambe rigide dal gomito): la frequenza compensa.
export const ANDATURE = {
  passo:   { ciclo: () => 1.5, appoggio: 0.62, sfasa: [0.25, 0.75, 0, 0.5], alza: 0.1 },
  trotto:  { ciclo: (v) => lerp(2.0, 2.9, clamp((v - 3) / 6, 0, 1)), appoggio: 0.42, sfasa: [0, 0.5, 0.5, 0], alza: 0.17 },
  galoppo: { ciclo: (v) => lerp(3.4, 5.2, clamp((v - 10) / 8, 0, 1)), appoggio: 0.34, sfasa: [0.6, 0.33, 0.33, 0], alza: 0.22 },
};
const FALCATA_MAX = 0.95;   // m: escursione massima dello zoccolo a terra (oltre, al galoppo, lo zoccolo scivola un poco)

/** Andatura per la velocità v (m/s), con isteresi rispetto a quella attuale (niente sfarfallio al limite). */
export function sceltaAndatura(v, attuale = 'passo') {
  if (attuale === 'passo') return v > 10 ? 'galoppo' : v > 2.8 ? 'trotto' : 'passo';
  if (attuale === 'trotto') return v < 2.3 ? 'passo' : v > 10 ? 'galoppo' : 'trotto';
  return v < 2.3 ? 'passo' : v < 9 ? 'trotto' : 'galoppo';
}

/**
 * Pendenza per il cavallo: g = tangente nella direzione di marcia (+ = salita). Curva propria, più prudente del
 * cavaliere: sale bene fino a ~15°, rifiuta oltre salitaMax; in discesa oltre 12° al massimo il trotto, oltre 20° il
 * passo e la velocità cala fino a ×0,25, oltre discesaMax non scende. Su strada la salita pesa meno.
 * @returns {{fattore:number, massima:'passo'|'trotto'|'galoppo'}|null} null = lì non ci va
 */
export function pendenzaCavallo(g, strada = false, cfg = CAVALLO_CFG) {
  const ang = Math.atan(g) / GRADI;
  if (ang >= 0) {
    if (ang > cfg.salitaMax) return null;
    const a = strada ? ang * 0.6 : ang;
    const f = a <= 15 ? 1 - 0.1 * a / 15 : lerp(0.9, 0.45, (a - 15) / (cfg.salitaMax - 15));
    return { fattore: Math.max(f, strada ? 0.6 : 0.45), massima: 'galoppo' };
  }
  const d = -ang;
  if (d > cfg.discesaMax) return null;
  if (d <= 12) return { fattore: 1, massima: 'galoppo' };
  if (d <= 20) return { fattore: lerp(1, 0.6, (d - 12) / 8), massima: 'trotto' };
  return { fattore: lerp(0.6, 0.25, (d - 20) / (cfg.discesaMax - 20)), massima: 'passo' };
}

/**
 * Velocità voluta quando segue (m/s): recupera il distacco `gap` (m dal posto che deve tenere) e accompagna il
 * cavaliere che va a vk. Da fermo riparte solo se il posto si è allontanato un poco (isteresi).
 */
export function velocitaSegue(gap, vk, fermoOra, cfg = CAVALLO_CFG) {
  const cavaliereFermo = vk < 0.4;
  if (fermoOra && gap < (cavaliereFermo ? 2 : 0.8)) return 0;
  if (cavaliereFermo && gap < 0.4) return 0;
  return clamp(vk * 0.9 + 1.1 * gap, 0, cfg.velSegue);
}

// ─── Cavallo: modello, posa sul terreno, andature, segue il cavaliere ────────────────

/**
 * @param terrain  suolo della Scena (getHeight, getSlope, percorribile, half, suStrada)
 * @param ostacoli lista condivisa con il cavaliere (mura, tronchi, rocce, persone); il cavallo ignora se stesso
 */
export function createCavallo(terrain, ostacoli = []) {
  const cfg = { ...CAVALLO_CFG };
  const mod = buildModel();
  const ombra = buildOmbra();
  const object = new THREE.Group();
  object.name = 'cavallo';
  object.add(mod.root, ombra);
  for (const g of mod.gambe) { g.z0 = g.alta.position.z; g.f = 0; g.volo = 0; }

  const stato = {
    x: 0, z: 0, y: 0, direzione: 0, beccheggio: 0, tempo: 0, riposo: 1,   // riposo: 1 = fermo
    velocita: 0,            // m/s voluta (con accelerazione), sempre in avanti
    velEffettiva: 0,        // m/s percorsa davvero
    andatura: 'passo',      // 'passo' | 'trotto' | 'galoppo'
    fase: 0,                // ciclo delle gambe, in [0, 1)
    modo: 'segue',          // 'segue' | 'aspetta' (rimasto indietro: bloccato o troppo lontano)
    richiamato: false,      // fischiato: va dritto al cavaliere, anche da lontano
    fermo: true,            // arrivato: resta dov'è finché il cavaliere non è oltre cfg.riparte
    distanza: 0,            // m dal cavaliere
    bloccatoDa: 0,          // s di fila senza riuscire ad avanzare
    fermoDa: 0,             // s da fermo
    bruca: 0,               // 0 → 1: testa giù a brucare
    sobbalzo: 0, dondolo: 0, abbassa: 0,
    passiGiro: 0,           // m/s «equivalenti» dei passi fatti girando sul posto (animazione)
    limitePendenza: null,   // in sella: 'trotto' | 'passo' se la pendenza limita l'andatura, 'rifiuta' se non va
  };
  const tracce = [];        // { x, z } del cavaliere, un punto ogni cfg.passoTraccia m, dal più vecchio
  const pesi = { passo: 1, trotto: 0, galoppo: 0 };          // andature mescolate nel cambio
  const anda = { sfasa: [...ANDATURE.passo.sfasa], appoggio: ANDATURE.passo.appoggio, alza: ANDATURE.passo.alza, ciclo: 1.5 };
  let self = null;
  let tLinea = 0, lineaDiretta = false;                       // linea libera verso il cavaliere (ricontrollata ~3 volte al s)
  let inBruca = false, tBruca = 0, saltato = 0;

  // Punto del terreno a (lx a sinistra, lz in avanti) dal centro, in coordinate del mondo
  function locale(lx, lz, out) {
    const sd = Math.sin(stato.direzione), cd = Math.cos(stato.direzione);
    out.x = stato.x + lx * cd + lz * sd;
    out.z = stato.z - lx * sd + lz * cd;
    return out;
  }
  const _p = { x: 0, z: 0 };
  const suoloA = (lx, lz) => { locale(lx, lz, _p); return terrain.getHeight(_p.x, _p.z); };
  const pendenzaNaturale = terrain.getSlopeNaturale || terrain.getSlope;
  const dentro = (x, z) => { const L = terrain.half - 3; return Math.abs(x) < L && Math.abs(z) < L; };
  const VEL = { passo: cfg.velPasso, trotto: cfg.velTrotto, galoppo: Infinity };

  /** Libero da ostacoli e su terreno adatto, con il corpo centrato in (x, z) e orientato come direzione. */
  function postoLibero(x, z, direzione) {
    if (!dentro(x, z)) return false;
    const sd = Math.sin(direzione), cd = Math.cos(direzione);
    for (const k of [-1, 0, 1]) {
      const px = x + sd * cfg.semiAsse * 1.2 * k, pz = z + cd * cfg.semiAsse * 1.2 * k;
      if (terrain.percorribile && !terrain.percorribile(px, pz)) return false;
      if (terrain.getSlope(px, pz) > cfg.pendenzaMax) return false;
      for (const o of ostacoli) if (o !== self && o.spingiFuori(px, pz, cfg.raggio + 0.15)) return false;
    }
    return true;
  }

  /** Mette il cavallo accanto al cavaliere (a sinistra, poi a destra, dietro…), con la sua stessa direzione. */
  function posizionaAccanto(k) {
    const sd = Math.sin(k.direzione), cd = Math.cos(k.direzione);
    const a = cfg.accanto;
    // (lato, avanti): a sinistra un poco indietro, a destra, dietro, più lontano
    const prove = [[a, -0.6], [-a, -0.6], [0, -3.2], [a, 1.5], [-a, 1.5], [a * 1.6, -1], [-a * 1.6, -1], [0, -5], [a * 2.4, 0], [-a * 2.4, 0]];
    let scelto = null;
    for (const [lx, lz] of prove) {
      const x = k.x + lx * cd + lz * sd, z = k.z - lx * sd + lz * cd;
      if (postoLibero(x, z, k.direzione)) { scelto = { x, z }; break; }
    }
    if (!scelto) scelto = { x: k.x - 3.2 * sd, z: k.z - 3.2 * cd };   // ripiego: dietro il cavaliere
    stato.x = scelto.x;
    stato.z = scelto.z;
    stato.direzione = k.direzione;
    azzera();
    posa(0, true);
  }

  /** Fermo, al passo, a seguire da capo (nuova Scena, ricomparsa). */
  function azzera() {
    Object.assign(stato, { velocita: 0, velEffettiva: 0, andatura: 'passo', modo: 'segue', richiamato: false,
      fermo: true, bloccatoDa: 0, sobbalzo: 0, dondolo: 0 });
    for (const g of mod.gambe) { g.f = 0; g.volo = 0; }
    tracce.length = 0;
    tLinea = 0;
  }

  // ─── Movimento: due cerchi (petto e groppa) contro gli ostacoli, terreno, pendenze ───

  /** Il corpo centrato in (x, z) spinto fuori da ostacoli e cavaliere (`evita`): ci scivola lungo, come lui. */
  function spingiCorpo(x, z, dir, evita) {
    const sd = Math.sin(dir), cd = Math.cos(dir);
    for (let it = 0; it < 2; it++) {
      let mosso = false;
      for (const k of [1, -1]) {
        let cx = x + sd * cfg.semiAsse * k, cz = z + cd * cfg.semiAsse * k;
        const y = terrain.getHeight(cx, cz);
        for (const o of ostacoli) {
          if (o === self) continue;
          const p = o.spingiFuori(cx, cz, cfg.raggio, y, cfg.gradino);
          if (p && (Math.abs(p.x - cx) > 1e-4 || Math.abs(p.z - cz) > 1e-4)) {
            x += p.x - cx; z += p.z - cz; cx = p.x; cz = p.z; mosso = true;
          }
        }
        if (evita) {
          const ex = cx - evita.x, ez = cz - evita.z, d = Math.hypot(ex, ez), min = cfg.raggio + 0.4;
          if (d < min && d > 1e-6) { x += ex / d * (min - d); z += ez / d * (min - d); mosso = true; }
        }
      }
      if (!mosso) break;
    }
    return [x, z];
  }

  /** Quanti dei due cerchi stanno su terreno inadatto (acqua profonda, pareti); 3 = fuori dal blocco. */
  function inadatto(x, z, dir) {
    if (!dentro(x, z)) return 3;
    const sd = Math.sin(dir), cd = Math.cos(dir);
    let n = 0;
    for (const k of [1, -1]) {
      const cx = x + sd * cfg.semiAsse * k, cz = z + cd * cfg.semiAsse * k;
      if ((terrain.percorribile && !terrain.percorribile(cx, cz)) || pendenzaNaturale(cx, cz) > cfg.pendenzaParete) n++;
    }
    return n;
  }

  /** Pendenza (tangente) lungo la direzione del corpo, dal centro a 1 m più avanti (verso -1: più indietro). */
  function pendenzaAvanti(verso = 1) {
    const e = verso;
    return (terrain.getHeight(stato.x + Math.sin(stato.direzione) * e, stato.z + Math.cos(stato.direzione) * e)
      - terrain.getHeight(stato.x, stato.z)) / Math.abs(e);
  }

  /** Avanza di `passo` m lungo la direzione del corpo (negativo: indietro); restituisce i metri fatti, col segno. */
  function avanza(passo, evita) {
    if (!passo) return 0;
    const sd = Math.sin(stato.direzione), cd = Math.cos(stato.direzione);
    const [nx, nz] = spingiCorpo(stato.x + sd * passo, stato.z + cd * passo, stato.direzione, evita);
    // Non entra in acqua profonda né su una parete; se ci si trova già (ricomparsa, cambio di Scena) ne può uscire
    const dopo = inadatto(nx, nz, stato.direzione);
    if (dopo > 0 && dopo >= inadatto(stato.x, stato.z, stato.direzione)) return 0;
    const d = Math.hypot(nx - stato.x, nz - stato.z);
    if (d > Math.abs(passo) * 1.5 + 0.05) return 0;     // spinto lontano (incastrato): resta dov'è
    stato.x = nx;
    stato.z = nz;
    return d * Math.sign(passo);
  }

  /** Linea libera per il corpo da a a b: terreno, pendenze e ostacoli ogni ~1,5 m. */
  function lineaLibera(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1) return true;
    const n = Math.ceil(L / 1.5), ux = (bx - ax) / L, uz = (bz - az) / L, passo = L / n;
    let hPrima = terrain.getHeight(ax, az);
    for (let i = 1; i <= n; i++) {
      const x = ax + ux * passo * i, z = az + uz * passo * i;
      if (!dentro(x, z) || (terrain.percorribile && !terrain.percorribile(x, z))) return false;
      const h = terrain.getHeight(x, z);
      if (!pendenzaCavallo((h - hPrima) / passo, false, cfg)) return false;
      hPrima = h;
      if (i === n) break;                               // l'ultimo punto è il cavaliere stesso
      for (const o of ostacoli) {
        if (o === self) continue;
        const p = o.spingiFuori(x, z, cfg.raggio, h, cfg.gradino);
        if (p && (Math.abs(p.x - x) > 1e-3 || Math.abs(p.z - z) > 1e-3)) return false;
      }
    }
    return true;
  }

  // ─── Seguire il cavaliere ───

  function registraTraccia(k) {
    const u = tracce[tracce.length - 1];
    if (u) {
      const d = Math.hypot(k.x - u.x, k.z - u.z);
      if (d < cfg.passoTraccia) return;
      if (d > 20) tracce.length = 0;                    // salto (cambio di Scena, ricomparsa): tracce da capo
    }
    tracce.push({ x: k.x, z: k.z });
    if (tracce.length > cfg.tracce) tracce.shift();
  }

  /** Prossimo punto delle tracce: il più vicino al cavallo, più due metri; quelli già passati si tolgono. */
  function puntoTracce() {
    let iMin = -1, dMin = Infinity;
    for (let i = 0; i < tracce.length; i++) {
      const d = (tracce[i].x - stato.x) ** 2 + (tracce[i].z - stato.z) ** 2;
      if (d < dMin) { dMin = d; iMin = i; }
    }
    if (iMin < 0 || dMin > 15 * 15) return null;
    if (iMin > 0) tracce.splice(0, iMin);
    return tracce[Math.min(tracce.length - 1, 2)];
  }

  /**
   * Posto da tenere quando la linea è libera: a ~4,5 m dal cavaliere, dalla parte in cui si trova il cavallo, ma
   * fuori dal cono alle sue spalle (dove sta la camera). Il lato preferito è il sinistro: la camera guarda sopra la
   * spalla destra. (Non si scansa più davanti a lui: chi gli viene incontro lo trova fermo, vedi segui.)
   */
  function postoVicino(k) {
    let a = Math.atan2(stato.x - k.x, stato.z - k.z);           // direzione cavaliere → cavallo
    const dietro = angolo(k.direzione + Math.PI);
    const s = angolo(a - dietro);
    if (Math.abs(s) < cfg.cono) a = dietro + (s > 0.05 ? cfg.cono : -cfg.cono);
    const r = cfg.distanza * 0.9;
    return [k.x + Math.sin(a) * r, k.z + Math.cos(a) * r];
  }

  function frena(dt) {
    stato.velocita = Math.max(0, stato.velocita - cfg.frenata * dt);
    return avanza(stato.velocita * dt, null);
  }

  /** Un fotogramma a seguire il cavaliere k: restituisce i metri percorsi. */
  function segui(dt, k) {
    registraTraccia(k);
    const d = Math.hypot(k.x - stato.x, k.z - stato.z);
    stato.distanza = d;
    if ((tLinea -= dt) <= 0) {
      tLinea = 0.3;
      lineaDiretta = d < cfg.diretto && lineaLibera(stato.x, stato.z, k.x, k.z);
    }
    if (stato.modo === 'aspetta') {
      if (d < 20 && lineaDiretta) { stato.modo = 'segue'; stato.bloccatoDa = 0; }
      else return frena(dt);
    }
    if (stato.richiamato && d < 12) stato.richiamato = false;
    if (d > cfg.indietro && !stato.richiamato) { stato.modo = 'aspetta'; return frena(dt); }
    // Zona morta: arrivato, resta fermo (bruca, si guarda attorno) finché il cavaliere non va oltre cfg.riparte.
    if (stato.fermo && !stato.richiamato) {
      if (d <= cfg.riparte) return frena(dt);
      stato.fermo = false;
    }
    // Il cavaliere gli viene incontro: si ferma e lo aspetta, senza scansarsi né girargli intorno
    const vk = k.velEffettiva || 0;
    const incontro = d < cfg.incontro && d > 1e-3 && vk > 0.3 && !stato.richiamato
      && (Math.sin(k.direzione) * (stato.x - k.x) + Math.cos(k.direzione) * (stato.z - k.z)) / d > 0.5;
    if (incontro) { if (stato.velocita < 0.05) stato.fermo = true; return frena(dt); }

    // Meta: il posto vicino se la linea è libera, altrimenti le tracce (o dritto, se fischiato)
    let mx = k.x, mz = k.z, gap;
    if (lineaDiretta) {
      [mx, mz] = postoVicino(k);
      gap = Math.hypot(mx - stato.x, mz - stato.z);
    } else {
      const p = stato.richiamato ? null : puntoTracce();
      if (p) { mx = p.x; mz = p.z; }
      gap = Math.max(0, d - cfg.distanza);
    }
    let v = velocitaSegue(gap, vk, stato.velEffettiva < 0.05, cfg);

    // Rotazione verso la meta: al galoppo le curve sono larghe; per girarsi molto rallenta al passo
    const manca = angolo(Math.atan2(mx - stato.x, mz - stato.z) - stato.direzione);
    if (v > 0 || Math.abs(manca) > 0.3 && gap > 0.6) {
      const velRot = { passo: 1.6, trotto: 1.2, galoppo: 0.8 }[stato.andatura];
      const dir = angolo(stato.direzione + clamp(manca, -velRot * dt, velRot * dt));
      if (inadatto(stato.x, stato.z, dir) <= inadatto(stato.x, stato.z, stato.direzione)) stato.direzione = dir;
      if (Math.abs(manca) > 1.2) v = Math.min(Math.max(v, 0.7), cfg.velPasso);
    }
    // Pendenza davanti: rallenta, limita l'andatura o rifiuta
    const r = pendenzaCavallo(pendenzaAvanti(), terrain.suStrada?.(stato.x, stato.z), cfg);
    if (!r) v = 0;
    else v = Math.min(v * r.fattore, VEL[r.massima]);

    stato.velocita += clamp(v - stato.velocita, -cfg.frenata * dt, cfg.accelerazione * dt);
    if (stato.velocita < 0.02 && v === 0) stato.velocita = 0;
    if (v === 0 && stato.velocita === 0 && r && d <= cfg.riparte) stato.fermo = true;   // arrivato
    const voluto = stato.velocita * dt;
    const fatto = avanza(voluto, k);
    // Bloccato (bosco fitto, acqua, pendio, muro): dopo un poco smette di seguire e aspetta
    const vuole = (!r && gap > 1) || (voluto > 0 && fatto < voluto * 0.3 && stato.velocita > 0.4);
    stato.bloccatoDa = vuole ? stato.bloccatoDa + dt : Math.max(0, stato.bloccatoDa - 2 * dt);
    if (stato.bloccatoDa > cfg.attesa) {
      stato.modo = 'aspetta';
      stato.richiamato = false;
      stato.velocita = 0;
    }
    return fatto;
  }

  /**
   * F: il cavaliere fischia. Se il cavallo è vicino alza la testa; entro cfg.fischio m con la strada libera arriva;
   * altrimenti ricompare fuori dall'inquadratura, ~15 m dietro il cavaliere, e lo raggiunge.
   * @param k        stato del cavaliere
   * @param inVista  (x, y, z) → true se il punto è nell'inquadratura (facoltativo)
   * @returns 'qui' | 'arriva' | 'ricompare' | 'nessunPosto'
   */
  function fischia(k, inVista = null) {
    const d = Math.hypot(k.x - stato.x, k.z - stato.z);
    stato.bloccatoDa = 0;
    stato.fermoDa = 0;
    inBruca = false;
    if (d < 12) { stato.modo = 'segue'; return 'qui'; }
    if (d <= cfg.fischio && lineaLibera(stato.x, stato.z, k.x, k.z)) {
      Object.assign(stato, { modo: 'segue', richiamato: true });
      return 'arriva';
    }
    const p = postoFuoriVista(k, inVista);
    if (!p) return 'nessunPosto';
    stato.x = p.x;
    stato.z = p.z;
    stato.direzione = p.direzione;
    azzera();
    stato.richiamato = true;
    posa(0, true);
    return 'ricompare';
  }

  /** Punto percorribile ~15 m dietro il cavaliere, fuori dall'inquadratura (prima con la strada libera fino a lui). */
  function postoFuoriVista(k, inVista) {
    for (const libera of [true, false]) {
      for (const dist of [15, 19, 12, 24]) {
        for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
          const a = k.direzione + Math.PI + da;
          const x = k.x + Math.sin(a) * dist, z = k.z + Math.cos(a) * dist, direzione = angolo(a + Math.PI);
          if (!postoLibero(x, z, direzione)) continue;
          if (inVista && inVista(x, terrain.getHeight(x, z), z)) continue;
          if (libera && !lineaLibera(x, z, k.x, k.z)) continue;
          return { x, z, direzione };
        }
      }
    }
    return null;
  }

  // ─── Andature: zoccoli avanti e indietro secondo la fase, corpo che sobbalza ───
  function animaGambe(dt, percorso) {
    const v = Math.max(stato.velEffettiva, stato.passiGiro);
    stato.andatura = sceltaAndatura(v, stato.andatura);
    const A = ANDATURE[stato.andatura];
    const r = avvicina(6, dt);
    for (const n in pesi) pesi[n] += ((n === stato.andatura ? 1 : 0) - pesi[n]) * r;
    for (let i = 0; i < 4; i++) {           // sfasamenti verso quelli dell'andatura, per la via più breve sul ciclo
      const s = A.sfasa[i] - anda.sfasa[i];
      anda.sfasa[i] += (s - Math.round(s)) * r;
    }
    anda.appoggio += (A.appoggio - anda.appoggio) * r;
    anda.alza += (A.alza - anda.alza) * r;
    anda.ciclo += (A.ciclo(v) - anda.ciclo) * r;
    stato.fase = ((stato.fase + percorso / anda.ciclo) % 1 + 1) % 1;   // all'indietro il ciclo va a ritroso
    const moto = clamp(v / 0.6, 0, 1);       // 0 fermo → 1 in marcia
    const S = Math.min(anda.appoggio * anda.ciclo, FALCATA_MAX) * moto;
    mod.gambe.forEach((g, i) => {
      const p = ((stato.fase + anda.sfasa[i]) % 1 + 1) % 1;
      if (p < anda.appoggio) {               // a terra: lo zoccolo va indietro rispetto al corpo
        g.f = S * (0.5 - p / anda.appoggio);
        g.volo = 0;
      } else {                               // in volo: torna avanti, sollevato
        const u = (p - anda.appoggio) / (1 - anda.appoggio), e = u * u * (3 - 2 * u);
        g.f = S * (e - 0.5);
        g.volo = anda.alza * moto * Math.sin(Math.PI * u);
      }
    });
    const f = stato.fase * Math.PI * 2;
    stato.sobbalzo = moto * ((pesi.passo * 0.008 + pesi.trotto * 0.02) * Math.cos(2 * f) + pesi.galoppo * 0.035 * Math.sin(f));
    stato.dondolo = moto * pesi.galoppo * 0.05 * Math.sin(f + 0.8);
    stato.riposo += ((v < 0.05 && stato.fermoDa > 1 ? 1 : 0) - stato.riposo) * avvicina(v < 0.05 ? 2 : 6, dt);
  }

  // ─── Posa: corpo inclinato col pendio, zoccoli appoggiati al suolo con IK a due ossa ───
  const INTERASSE = ANTERIORE.z - (POSTERIORE.z + POSTERIORE.piede);   // m tra zoccoli anteriori e posteriori
  function posa(dt, subito = false) {
    const hA = (suoloA(ANTERIORE.x, ANTERIORE.z) + suoloA(-ANTERIORE.x, ANTERIORE.z)) / 2;
    const zP = POSTERIORE.z + POSTERIORE.piede;
    const hP = (suoloA(POSTERIORE.x, zP) + suoloA(-POSTERIORE.x, zP)) / 2;
    const b = clamp(Math.atan2(hA - hP, INTERASSE), -0.4, 0.4);
    stato.beccheggio = subito ? b : stato.beccheggio + (b - stato.beccheggio) * avvicina(8, dt);
    // Quota del centro: interpolata tra le coppie di zoccoli, più il sobbalzo dell'andatura
    const t = (0 - zP) / (ANTERIORE.z - zP);
    let y = hP + (hA - hP) * t + stato.sobbalzo;
    const p = stato.beccheggio + stato.dondolo, cp = Math.cos(p), sp = Math.sin(p);

    // Per ogni gamba: perno nel sistema del corpo (inclinato), bersaglio a terra sotto il punto voluto.
    // In marcia gomito e grassella scorrono un poco avanti e indietro con lo zoccolo (la spalla e l'anca che ruotano).
    let abbassa = 0;
    const calcoli = mod.gambe.map((g) => {
      const G = g.G;
      const scorre = clamp(g.f * 0.45, -0.2, 0.2);
      const ry = G.y - CENTRO_Y, rz = G.z + scorre;
      // perno rispetto alla radice (corpo ruotato di -p attorno al suo centro)
      const py = CENTRO_Y + ry * cp + rz * sp, pz = -ry * sp + rz * cp;
      // Da fermo: posteriore destro in riposo sulla punta dello zoccolo, anteriore sinistro un poco avanti
      const riposa = g.posteriore && g.lato < 0, avanza = !g.posteriore && g.lato > 0;
      const zT = G.z + G.piede + g.f + (riposa ? 0.1 * stato.riposo : 0) + (avanza ? 0.05 * stato.riposo : 0);
      const suolo = suoloA(G.x * g.lato, zT) - y + g.volo + (riposa ? 0.05 * stato.riposo : 0);
      return { g, py, pz, zT, suolo, scorre };
    });
    for (const c of calcoli) {
      if (c.g.volo > 0.01) continue;           // il corpo scende solo per gli zoccoli a terra
      const reach = (c.g.G.L1 + c.g.G.L2) * 0.995;
      const D = Math.hypot(c.zT - c.pz, c.suolo - c.py);
      if (D > reach) abbassa = Math.max(abbassa, D - reach);
    }
    abbassa = Math.min(abbassa, 0.12);
    stato.abbassa = subito ? abbassa : stato.abbassa + (abbassa - stato.abbassa) * avvicina(25, dt);
    y -= stato.abbassa;
    stato.y = y;
    for (const c of calcoli) {
      const { G } = c.g;
      c.g.alta.position.z = c.g.z0 + c.scorre;
      // dal perno al suolo sotto lo zoccolo (il suolo era misurato prima di abbassare il corpo)
      const dz = c.zT - c.pz, dy = c.suolo + stato.abbassa - c.py;
      // vettore nel sistema del corpo (ruotato di +p)
      const yc = dy * cp - dz * sp, zc = dy * sp + dz * cp;
      const f = zc, giu = -yc;
      const reach = (G.L1 + G.L2) * 0.995;
      const D = Math.min(Math.hypot(f, giu), reach);
      const cosK = (D * D - G.L1 * G.L1 - G.L2 * G.L2) / (2 * G.L1 * G.L2);
      const k = Math.acos(clamp(cosK, -1, 1));
      const phi = Math.atan2(f, giu);
      const beta = Math.atan2(G.L2 * Math.sin(k), G.L1 + G.L2 * Math.cos(k));
      if (c.g.posteriore) {          // garretto all'indietro: lo stinco torna in avanti
        c.g.alta.rotation.x = -(phi - beta);
        c.g.bassa.rotation.x = -k;
      } else {                       // ginocchio in avanti: lo stinco va indietro
        c.g.alta.rotation.x = -(phi + beta);
        c.g.bassa.rotation.x = k;
      }
    }
    mod.root.position.set(stato.x, stato.y, stato.z);
    mod.root.rotation.y = stato.direzione;
    mod.corpo.rotation.x = -p;
    mod.corpo.rotation.z = 0.025 * stato.riposo;     // l'anca cede dal lato della gamba in riposo
    // Il collo compensa metà del beccheggio: in salita e in discesa la testa resta più naturale
    mod.collo.rotation.x = stato.beccheggio * 0.5;
    aggiornaOmbra();
  }

  // ─── Testa, collo, coda: respiro, sguardo, brucare; il collo pompa al galoppo ───
  function anima(dt, k) {
    stato.tempo += dt;
    const t = stato.tempo;
    // Da fermo, dopo qualche secondo, a tratti abbassa la testa a brucare; altrimenti guarda il cavaliere
    stato.fermoDa = stato.velEffettiva < 0.05 ? stato.fermoDa + dt : 0;
    if (stato.fermoDa > 5) {
      if ((tBruca -= dt) <= 0) {
        inBruca = !inBruca;
        tBruca = inBruca ? 6 + Math.random() * 8 : 4 + Math.random() * 6;
      }
    } else { inBruca = false; tBruca = 1 + Math.random() * 2; }
    stato.bruca += ((inBruca ? 1 : 0) - stato.bruca) * avvicina(inBruca ? 1.2 : 3, dt);
    let guarda = -0.18;
    if (k) guarda = clamp(angolo(Math.atan2(k.x - stato.x, k.z - stato.z) - stato.direzione), -1.2, 1.2);
    const fermo = stato.riposo * (1 - stato.bruca);
    const moto = clamp(stato.velEffettiva / 0.6, 0, 1);
    const f = stato.fase * Math.PI * 2;
    const pompa = moto * ((pesi.passo * 0.05 + pesi.trotto * 0.02) * Math.sin(2 * f) + pesi.galoppo * 0.13 * Math.sin(f + 1.6));
    // Coda: oscillazione lenta e ogni tanto un colpo (scaccia le mosche); in marcia si alza un poco
    const colpo = Math.max(0, Math.sin(t * 0.37) - 0.92) * 12;
    mod.coda.rotation.z = Math.sin(t * 0.8) * 0.05 * (1 - moto) + Math.sin(t * 5.5) * 0.12 * colpo;
    mod.coda.rotation.x = -0.05 + Math.sin(t * 0.5) * 0.03 - moto * (pesi.trotto * 0.15 + pesi.galoppo * 0.35)
      + moto * pesi.galoppo * 0.06 * Math.sin(f);
    // Testa e collo
    mod.testa.rotation.x = Math.sin(t * 0.43) * 0.05 * (1 - moto) - pompa * 0.5 - 0.7 * stato.bruca;
    mod.testa.rotation.y = guarda * 0.3 * fermo + Math.sin(t * 0.21) * 0.12 * (1 - moto) * (1 - stato.bruca);
    mod.testa.rotation.z = 0.06 * fermo;             // testa appena inclinata
    mod.collo.rotation.x += Math.sin(t * 0.31 + 1) * 0.03 * (1 - moto) + 0.06 * fermo + pompa
      + moto * pesi.galoppo * 0.12 + 1.35 * stato.bruca;
    mod.collo.rotation.y = guarda * 0.35 * fermo + Math.sin(t * 0.17) * 0.05 * (1 - moto) + 0.15 * stato.bruca;
    // Respiro: il tronco si alza appena
    mod.corpo.position.y = CENTRO_Y + Math.sin(t * 1.2) * 0.004;
  }

  const _n = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
  function aggiornaOmbra() {
    const e = 0.8;
    const dhdx = (terrain.getHeight(stato.x + e, stato.z) - terrain.getHeight(stato.x - e, stato.z)) / (2 * e);
    const dhdz = (terrain.getHeight(stato.x, stato.z + e) - terrain.getHeight(stato.x, stato.z - e)) / (2 * e);
    _n.set(-dhdx, 1, -dhdz).normalize();
    ombra.quaternion.setFromUnitVectors(_y, _n).multiply(_q.setFromAxisAngle(_y, stato.direzione));
    ombra.position.set(stato.x, terrain.getHeight(stato.x, stato.z), stato.z).addScaledVector(_n, 0.05);
  }

  // ─── In sella (passo 3): il cavaliere comanda andatura e direzione ───
  // Andature: passo (Ctrl, interruttore), trotto (normale), galoppo (Shift); all'indietro piano. Curve più larghe al
  // galoppo; niente giro sul posto al galoppo (da fermo si gira al passo). Pendenze con la curva del cavallo: in
  // discesa ripida l'andatura scende da sola, oltre i limiti non va.
  let velAngolare = 0;
  function guida(dt, input) {
    const S = cfg.sella;
    const voluta = input.camminata ? 'passo' : input.corsa && !input.senzaGaloppo ? 'galoppo' : 'trotto';
    // Rotazione: i tasti con accelerazione (come il cavaliere), il mouse diretto
    const v0 = Math.abs(stato.velocita);
    const velRot = v0 > 9 ? S.giro.galoppo : v0 > 2.5 ? S.giro.trotto : S.giro.passo;
    if (input.gira !== 0) {
      const obiettivo = input.gira * velRot, manca = obiettivo - velAngolare;
      const inverte = velAngolare !== 0 && Math.sign(velAngolare) !== Math.sign(obiettivo);
      velAngolare += Math.sign(manca) * Math.min(Math.abs(manca), S.accelGiro * (inverte ? 3 : 1) * dt);
    } else {
      velAngolare *= Math.exp(-S.arrestoGiro * dt);
      if (Math.abs(velAngolare) < 1e-3) velAngolare = 0;
    }
    const dGiro = velAngolare * dt + (input.giroMouse || 0);
    if (dGiro !== 0) {
      // Girando, la groppa o il petto possono toccare un muro: il corpo ne viene spinto fuori, se di poco
      const dir = angolo(stato.direzione - dGiro);
      const [nx, nz] = spingiCorpo(stato.x, stato.z, dir, null);
      if (Math.hypot(nx - stato.x, nz - stato.z) < 0.3 && inadatto(nx, nz, dir) <= inadatto(stato.x, stato.z, stato.direzione)) {
        stato.direzione = dir; stato.x = nx; stato.z = nz;
      } else velAngolare = 0;
    }
    stato.passiGiro += (Math.abs(dGiro) * 0.6 / Math.max(dt, 1e-4) - stato.passiGiro) * avvicina(10, dt);

    // Velocità: andatura voluta, poi pendenza nel verso di marcia
    const verso = input.avanti > 0 ? 1 : input.avanti < 0 ? -1 : 0;
    let v = verso > 0 ? S.vel[voluta] : verso < 0 ? -S.indietro : 0;
    stato.limitePendenza = null;
    if (verso !== 0) {
      const r = pendenzaCavallo(pendenzaAvanti(verso), terrain.suStrada?.(stato.x, stato.z), cfg);
      if (!r) { v = 0; stato.limitePendenza = 'rifiuta'; }
      else {
        const vmax = S.vel[r.massima] ?? Infinity;
        if (Math.abs(v) * r.fattore > vmax) stato.limitePendenza = r.massima;
        v = Math.sign(v) * Math.min(Math.abs(v) * r.fattore, vmax);
      }
    }
    const acc = Math.abs(v) > Math.abs(stato.velocita) ? S.accelerazione : S.frenata;
    stato.velocita += clamp(v - stato.velocita, -acc * dt, acc * dt);
    if (Math.abs(stato.velocita) < 0.02 && v === 0) stato.velocita = 0;
    const voluto = stato.velocita * dt;
    const fatto = avanza(voluto, null);
    // Contro un ostacolo o il bordo il cavallo si ferma (niente slittamento a 18 m/s lungo un muro)
    if (voluto && Math.abs(fatto) < Math.abs(voluto) * 0.3) stato.velocita *= Math.exp(-10 * dt);
    stato.distanza = 0;
    return fatto;
  }

  // Sella: radice del cavaliere seduto, nel sistema del corpo (anca ~8 cm sopra il seggio, ANCA = 0,92 m)
  const SELLA = new THREE.Vector3(0, sezioneTronco(0.04).c.y + sezioneTronco(0.04).hs + 0.03 + 0.08 - 0.92 - CENTRO_Y, 0.02);
  const _s = new THREE.Vector3();
  const _sella = { x: 0, y: 0, z: 0, direzione: 0, beccheggio: 0, cx: 0, cz: 0, velocita: 0, velEffettiva: 0,
    andatura: 'passo', fase: 0, galoppo: 0, moto: 0 };
  /** Dove sta il cavaliere seduto, e quanto si muove (per la sua posa). */
  function sella() {
    mod.corpo.updateWorldMatrix(true, false);
    _s.copy(SELLA).applyMatrix4(mod.corpo.matrixWorld);
    return Object.assign(_sella, { x: _s.x, y: _s.y, z: _s.z, direzione: stato.direzione,
      beccheggio: stato.beccheggio + stato.dondolo, cx: stato.x, cz: stato.z, velocita: stato.velocita,
      velEffettiva: stato.velEffettiva, andatura: stato.andatura, fase: stato.fase, galoppo: pesi.galoppo,
      moto: clamp(stato.velEffettiva / 0.6, 0, 1) });
  }

  /**
   * @param dt    secondi dall'ultimo fotogramma
   * @param k     stato del cavaliere da seguire (null: resta dov'è, es. nel percorso di prova)
   * @param input comandi del cavaliere in sella (passo 3): se c'è, il cavallo è guidato e non segue
   */
  function update(dt, k = null, input = null) {
    const percorso = input ? guida(dt, input) : k ? segui(dt, k) : 0;
    if (!input) stato.passiGiro *= Math.exp(-10 * dt);
    stato.velEffettiva += (Math.abs(percorso) / Math.max(dt, 1e-4) - stato.velEffettiva) * avvicina(10, dt);
    if (stato.velEffettiva < 0.01) stato.velEffettiva = 0;
    // Fermo e lontano: animazione a metà frequenza (regola delle persone)
    if (stato.velEffettiva === 0 && stato.distanza > 120) {
      saltato += dt;
      if (saltato < 2 * dt) return;
      dt = saltato;
    }
    saltato = 0;
    animaGambe(dt, percorso);
    posa(dt);
    anima(dt, k);
  }

  /** Spinge fuori (x, z) dai due cerchi del corpo (petto e groppa), o null se libero. */
  function spingiFuori(x, z, raggio) {
    const sd = Math.sin(stato.direzione), cd = Math.cos(stato.direzione);
    let spinto = null;
    for (const k of [1, -1]) {
      const cx = stato.x + sd * cfg.semiAsse * k, cz = stato.z + cd * cfg.semiAsse * k;
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), min = cfg.raggio + raggio;
      if (d < min) {
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        x = cx + ux * min; z = cz + uz * min;
        spinto = { x, z };
      }
    }
    return spinto;
  }

  const api = {
    object, cfg, stato, update, posizionaAccanto, spingiFuori, fischia, sella,
    /** Il cavallo in (x, z) con la direzione data, se lì c'è posto (ripresa dal salvataggio); false altrimenti. */
    posizionaSeLibero(x, z, direzione) {
      if (![x, z, direzione].every(Number.isFinite) || !postoLibero(x, z, direzione)) return false;
      stato.x = x; stato.z = z; stato.direzione = direzione; azzera(); posa(0, true);
      return true;
    },
    /** Il cavallo esattamente in (x, z), con la direzione data (in sella al cambio di Scena). */
    posiziona(x, z, direzione) { stato.x = x; stato.z = z; stato.direzione = direzione; azzera(); posa(0, true); },
    /** Rimasto indietro: bloccato o troppo lontano, aspetta il fischio. */
    get indietro() { return stato.modo === 'aspetta'; },
    /** Stato e tracce da spostare al cambio di blocco (blocchi.js, trasla). */
    puntiDaTraslare: () => [stato, ...tracce],
  };
  self = api;
  return api;
}

/**
 * Forme e misure del cavallo, per gli animali da tiro semplificati e istanziati dei veicoli (js/3d/carri3d.js): stesse
 * sezioni e stessi snodi, meno suddivisioni. Solo lettura.
 */
export const FORME_CAVALLO = {
  tubo, tornio, chiaviZY, chiaviGamba, puntoTesta, TRONCO, COLLO, CODA, TESTA, ALTA_ANT, ALTA_POST, BASSA_ANT, BASSA_POST,
  ANTERIORE, POSTERIORE, PERNO_COLLO, PERNO_CODA, PERNO_TESTA, DIR_TESTA, CENTRO_Y, COL,
};
