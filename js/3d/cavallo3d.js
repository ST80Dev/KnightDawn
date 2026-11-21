// Knight Dawn — cavallo 3D (milestone «Cavallo», docs/ESPLORAZIONE_3D.md; budget in docs/PRESTAZIONI.md, passo 6)
// Modello simil-realistico costruito via codice (sezioni ovali lungo curve, normali lisce), come il cavaliere.
//
// Passo 1: modello fermo accanto al cavaliere, appoggiato sul terreno (zoccoli con IK a due ossa), coda e testa
// che si muovono piano. Segue, andature e sella nei passi successivi.
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
  pendenzaMax: 22,    // gradi: dove il cavallo può stare fermo (posto alla partenza)
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

// ─── Cavallo: modello + posa sul terreno ────────────────────────────────

const clamp = THREE.MathUtils.clamp;
const avvicina = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @param terrain  suolo della Scena (getHeight, getSlope, percorribile, half)
 * @param ostacoli lista condivisa con il cavaliere (mura, tronchi, rocce); il cavallo ignora se stesso
 */
export function createCavallo(terrain, ostacoli = []) {
  const cfg = { ...CAVALLO_CFG };
  const mod = buildModel();
  const ombra = buildOmbra();
  const object = new THREE.Group();
  object.name = 'cavallo';
  object.add(mod.root, ombra);

  const stato = { x: 0, z: 0, y: 0, direzione: 0, beccheggio: 0, tempo: 0, riposo: 1 };   // riposo: 1 = fermo
  let self = null;

  // Punto del terreno a (lx a sinistra, lz in avanti) dal centro, in coordinate del mondo
  function locale(lx, lz, out) {
    const sd = Math.sin(stato.direzione), cd = Math.cos(stato.direzione);
    out.x = stato.x + lx * cd + lz * sd;
    out.z = stato.z - lx * sd + lz * cd;
    return out;
  }
  const _p = { x: 0, z: 0 };
  const suoloA = (lx, lz) => { locale(lx, lz, _p); return terrain.getHeight(_p.x, _p.z); };

  /** Libero da ostacoli e su terreno adatto, con il corpo centrato in (x, z) e orientato come direzione. */
  function postoLibero(x, z, direzione) {
    const L = terrain.half - 3;
    if (Math.abs(x) > L || Math.abs(z) > L) return false;
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
    posa(0, true);
  }

  // ─── Posa: corpo inclinato col pendio, zoccoli appoggiati al suolo con IK a due ossa ───
  const INTERASSE = ANTERIORE.z - (POSTERIORE.z + POSTERIORE.piede);   // m tra zoccoli anteriori e posteriori
  function posa(dt, subito = false) {
    const hA = (suoloA(ANTERIORE.x, ANTERIORE.z) + suoloA(-ANTERIORE.x, ANTERIORE.z)) / 2;
    const zP = POSTERIORE.z + POSTERIORE.piede;
    const hP = (suoloA(POSTERIORE.x, zP) + suoloA(-POSTERIORE.x, zP)) / 2;
    const b = clamp(Math.atan2(hA - hP, INTERASSE), -0.4, 0.4);
    stato.beccheggio = subito ? b : stato.beccheggio + (b - stato.beccheggio) * avvicina(8, dt);
    // Quota del centro: interpolata tra le coppie di zoccoli
    const t = (0 - zP) / (ANTERIORE.z - zP);
    let y = hP + (hA - hP) * t;
    const p = stato.beccheggio, cp = Math.cos(p), sp = Math.sin(p);

    // Per ogni gamba: perno nel sistema del corpo (inclinato), bersaglio a terra sotto il punto nominale.
    let abbassa = 0;
    const calcoli = mod.gambe.map((g) => {
      const G = g.G;
      const ry = G.y - CENTRO_Y, rz = G.z;
      // perno rispetto alla radice (corpo ruotato di -p attorno al suo centro)
      const py = CENTRO_Y + ry * cp + rz * sp, pz = -ry * sp + rz * cp;
      // Da fermo: posteriore destro in riposo sulla punta dello zoccolo, anteriore sinistro un poco avanti
      const riposa = g.posteriore && g.lato < 0, avanza = !g.posteriore && g.lato > 0;
      const zT = G.z + G.piede + (riposa ? 0.1 * stato.riposo : 0) + (avanza ? 0.05 * stato.riposo : 0);
      const suolo = suoloA(G.x * g.lato, zT) - y + (riposa ? 0.05 * stato.riposo : 0);
      return { g, py, pz, zT, suolo };
    });
    for (const c of calcoli) {
      const reach = (c.g.G.L1 + c.g.G.L2) * 0.995;
      const dz = c.zT - c.pz, dy = c.suolo - c.py;
      const D = Math.hypot(dz, dy);
      if (D > reach) abbassa = Math.max(abbassa, D - reach);
    }
    y -= abbassa;
    stato.y = y;
    for (const c of calcoli) {
      const { G } = c.g;
      // dal perno al suolo sotto lo zoccolo (il suolo era misurato prima di abbassare il corpo)
      const dz = c.zT - c.pz, dy = c.suolo + abbassa - c.py;
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
    mod.corpo.rotation.x = -stato.beccheggio;
    mod.corpo.rotation.z = 0.025 * stato.riposo;     // l'anca cede dal lato della gamba in riposo
    // Il collo compensa metà del beccheggio: in salita e in discesa la testa resta più naturale
    mod.collo.rotation.x = stato.beccheggio * 0.5;
    aggiornaOmbra();
  }

  // ─── Movimenti da fermo: respiro, coda, testa ───
  function anima(dt) {
    stato.tempo += dt;
    const t = stato.tempo;
    // Coda: oscillazione lenta e ogni tanto un colpo (scaccia le mosche)
    const colpo = Math.max(0, Math.sin(t * 0.37) - 0.92) * 12;
    mod.coda.rotation.z = Math.sin(t * 0.8) * 0.05 + Math.sin(t * 5.5) * 0.12 * colpo;
    mod.coda.rotation.x = -0.05 + Math.sin(t * 0.5) * 0.03;
    // Testa e collo: piccoli movimenti lenti, sguardo che si sposta
    mod.testa.rotation.x = Math.sin(t * 0.43) * 0.05;
    mod.testa.rotation.y = -0.18 * stato.riposo + Math.sin(t * 0.21) * 0.12;
    mod.testa.rotation.z = 0.06 * stato.riposo;      // testa appena inclinata
    mod.collo.rotation.x += Math.sin(t * 0.31 + 1) * 0.03 + 0.06 * stato.riposo;   // da fermo il collo scende un poco
    mod.collo.rotation.y = -0.1 * stato.riposo + Math.sin(t * 0.17) * 0.05;
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

  function update(dt) {
    posa(dt);
    anima(dt);
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

  const api = { object, cfg, stato, update, posizionaAccanto, spingiFuori };
  self = api;
  return api;
}
