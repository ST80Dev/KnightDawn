// Knight Dawn — cavallo 3D (milestone «Cavallo», docs/ESPLORAZIONE_3D.md; budget in docs/PRESTAZIONI.md, passo 6)
// Modello simil-realistico costruito via codice (forme tornite, normali lisce), come il cavaliere (knight3d.js).
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

// Misure (m) del ronzino: ~1,45 m al garrese.
const CENTRO_Y = 1.08;                       // asse del tronco
const ANTERIORE = { x: 0.155, y: 0.965, z: 0.46, L1: 0.44, L2: 0.53, piede: 0 };    // gomito → ginocchio → suolo
const POSTERIORE = { x: 0.165, y: 0.975, z: -0.5, L1: 0.465, L2: 0.53, piede: -0.15 }; // grassella → garretto → suolo
const PERNO_COLLO = new THREE.Vector3(0, 1.26, 0.56);
const PERNO_CODA = new THREE.Vector3(0, 1.36, -0.79);
const DIR_COLLO = new THREE.Vector3(0, Math.sin(0.75), Math.cos(0.75));   // ~43° sopra l'orizzonte
const LUNGHEZZA_COLLO = 0.7;
const PERNO_TESTA = PERNO_COLLO.clone().addScaledVector(DIR_COLLO, LUNGHEZZA_COLLO);
const ANGOLO_TESTA = 2.36;                   // asse della testa: dalla nuca al muso, ~45° sotto l'orizzonte
const LUNGHEZZA_TESTA = 0.58;

// ─── Pezzi: geometrie in coordinate di riposo (a terra, centro del corpo), poi unite per snodo ───────────────

/** Solido di rotazione attorno a Y. profilo: [[raggio, y], ...]; sx/sz schiacciano la sezione. */
function tornio(profilo, { seg = 16, sx = 1, sz = 1, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const geo = new THREE.LatheGeometry(profilo.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLength);
  geo.scale(sx, 1, sz);
  geo.computeVertexNormals();
  return geo;
}

/** Ellissoide di semiassi (rx, ry, rz). */
function ellissoide(rx, ry, rz, seg = 16) {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg / 2)));
  geo.scale(rx, ry, rz);
  geo.computeVertexNormals();
  return geo;
}

/** Ruota la geometria costruita lungo +Y in modo che l'asse punti lungo dir (unitario), poi la sposta in p. */
function orienta(geo, dir, p) {
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  geo.translate(p.x, p.y, p.z);
  return geo;
}

/** Raccoglitore dei pezzi di uno snodo: colore nei vertici, metallo a parte. */
function pezzi() {
  const lista = [];
  return {
    lista,
    add(geo, colore, metallo = false) { lista.push({ geo, colore, metallo }); return geo; },
  };
}

/**
 * Unisce i pezzi in una sola geometria non indicizzata con colore nei vertici, spostata in modo che il perno sia
 * l'origine. Gruppo 0 = Lambert, gruppo 1 = Phong (se ci sono metalli).
 */
function unisci(p, perno) {
  const ordinati = [...p.lista.filter((x) => !x.metallo), ...p.lista.filter((x) => x.metallo)];
  const parti = ordinati.map(({ geo, colore, metallo }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.translate(-perno.x, -perno.y, -perno.z);
    return { g, c: new THREE.Color(colore), metallo };
  });
  const n = parti.reduce((s, x) => s + x.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0, inizioMetallo = -1;
  for (const { g, c, metallo } of parti) {
    if (metallo && inizioMetallo < 0) inizioMetallo = o;
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < k; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
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

const gauss = (v, c, l) => Math.exp(-(((v - c) / l) ** 2));
/** Modella una geometria tornita attorno al tronco (asse Z, centro 0): larghezza, garrese, groppa, ventre. */
function formaTronco(geo) {
  const a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const larg = 0.68 + 0.09 * gauss(z, -0.5, 0.2) + 0.05 * gauss(z, 0.5, 0.16);   // groppa e spalle
    const centro = Math.max(0, 1 - (z / 0.62) ** 2);
    let dy;
    if (y < 0) dy = -0.05 * centro;                                                    // ventre
    else {
      const sopra = (y / 0.35) ** 2;
      dy = (-0.03 * centro + 0.065 * gauss(z, 0.43, 0.13) + 0.025 * gauss(z, -0.52, 0.16)) * sopra;  // sella, garrese, groppa
    }
    a.setXYZ(i, x * larg, y + dy, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Tronco, sella, gualdrappa, sottopancia, staffili e staffe.
function pezziCorpo() {
  const p = pezzi();
  // Tronco: un solo tornito lungo Z (asse Y del tornio → Z), poi modellato (formaTronco): groppa più larga,
  // spalle, garrese, ventre che scende. Niente masse sovrapposte: superficie continua e liscia.
  const tronco = tornio([[0, -0.84], [0.12, -0.82], [0.24, -0.76], [0.31, -0.66], [0.345, -0.52], [0.355, -0.35],
    [0.35, -0.15], [0.345, 0.05], [0.345, 0.25], [0.335, 0.42], [0.31, 0.55], [0.26, 0.65], [0.19, 0.72],
    [0.1, 0.77], [0, 0.79]], { seg: 30 });
  tronco.rotateX(Math.PI / 2);                   // y del profilo → z
  formaTronco(tronco);
  tronco.translate(0, CENTRO_Y, 0);
  p.add(tronco, COL.mantello);

  // Gualdrappa: lembo di stoffa sulla schiena (tornio parziale attorno al tronco), con orlo
  const rTronco = 0.35;
  const panno = tornio([[rTronco + 0.012, -0.26], [rTronco + 0.014, 0.0], [rTronco + 0.012, 0.32]],
    { seg: 14, phiStart: Math.PI - 1.25, phiLength: 2.5 });
  panno.rotateX(Math.PI / 2);
  panno.translate(0, 0, 0.02);
  formaTronco(panno);
  panno.translate(0, CENTRO_Y, 0);
  p.add(panno, COL.gualdrappa);
  // Sella: seggio, arcione davanti e paletta dietro
  const seggio = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, 1.0);
  seggio.scale(0.19, 0.1, 0.3);
  seggio.computeVertexNormals();
  p.add(seggio.translate(0, 1.4, 0.04), COL.cuoio);
  p.add(ellissoide(0.085, 0.05, 0.05, 10).translate(0, 1.455, 0.28), COL.cuoio);
  p.add(ellissoide(0.13, 0.065, 0.04, 10).rotateX(0.35).translate(0, 1.465, -0.2), COL.cuoio);
  // Sottopancia
  const cinghia = tornio([[rTronco + 0.016, 0.0], [rTronco + 0.016, 0.06]], { seg: 22 });
  cinghia.rotateX(Math.PI / 2);
  cinghia.translate(0, 0, 0.27);
  p.add(formaTronco(cinghia).translate(0, CENTRO_Y, 0), COL.cuoio);
  // Staffili e staffe (le staffe in ferro)
  for (const sx of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.012, 0.42, 0.035).rotateZ(0.06 * sx).translate(0.255 * sx, 1.2, 0.08), COL.cuoio);
    const staffa = new THREE.TorusGeometry(0.055, 0.009, 4, 10);
    staffa.scale(1, 1.1, 1).rotateY(Math.PI / 2);
    p.add(staffa.translate(0.27 * sx, 0.96, 0.08), COL.ferro, true);
  }
  return p;
}

// Collo con criniera. Costruito lungo +Y, poi orientato lungo DIR_COLLO dal perno.
function pezziCollo() {
  const p = pezzi();
  const L = LUNGHEZZA_COLLO;
  const collo = tornio([[0.2, -0.16], [0.215, 0.0], [0.19, 0.18], [0.155, 0.4], [0.13, 0.58], [0.12, L],
    [0.105, L + 0.08], [0.06, L + 0.13], [0, L + 0.14]], { seg: 20, sx: 0.56 });
  // Più profondo verso la gola: sezione spostata un poco in avanti-basso (+z locale)
  const a = collo.attributes.position;
  for (let i = 0; i < a.count; i++) if (a.getZ(i) > 0) a.setZ(i, a.getZ(i) * 1.15);
  collo.computeVertexNormals();
  p.add(orienta(collo, DIR_COLLO, PERNO_COLLO), COL.mantello);
  // Criniera: lama di crini lungo la cresta (lato -z locale = sopra-dietro), un po' ricadente
  const criniera = new THREE.BoxGeometry(0.035, L + 0.06, 0.06, 1, 6, 1);
  const c = criniera.attributes.position;
  for (let i = 0; i < c.count; i++) {
    const t = (c.getY(i) + (L + 0.06) / 2) / (L + 0.06);          // 0 alla base, 1 alla nuca
    c.setZ(i, c.getZ(i) - (0.205 - 0.09 * t) - 0.012);
    c.setX(i, c.getX(i) + 0.025);                                   // ricade sul lato destro dell'osservatore
  }
  criniera.translate(0, (L + 0.06) / 2 - 0.02, 0);
  criniera.computeVertexNormals();
  p.add(orienta(criniera, DIR_COLLO, PERNO_COLLO), COL.nero);
  return p;
}

// Testa con orecchie, occhi, ciuffo, finimenti e morso. Asse dalla nuca al muso.
function pezziTesta() {
  const p = pezzi();
  const L = LUNGHEZZA_TESTA;
  const asse = new THREE.Vector3(0, Math.cos(ANGOLO_TESTA), Math.sin(ANGOLO_TESTA));
  const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), asse);
  // Sistema della testa: Y lungo l'asse, -Z verso la fronte; ruotato col quaternione e spostato alla nuca.
  const inTesta = (geo) => { geo.applyQuaternion(rot); return geo.translate(PERNO_TESTA.x, PERNO_TESTA.y, PERNO_TESTA.z); };
  const cranio = tornio([[0.0, -0.11], [0.06, -0.1], [0.1, -0.05], [0.12, 0.04], [0.125, 0.12], [0.112, 0.25],
    [0.092, 0.4], [0.085, 0.5], [0.07, L - 0.02], [0.04, L], [0, L + 0.005]], { seg: 18, sx: 0.66 });
  p.add(inTesta(cranio), COL.mantello);
  // Ganasce (verso la gola, +z) e muso più scuro
  p.add(inTesta(ellissoide(0.085, 0.14, 0.1, 12).translate(0, 0.14, 0.055)), COL.mantello);
  p.add(inTesta(ellissoide(0.072, 0.08, 0.08, 12).translate(0, 0.51, 0.008)), COL.muso);
  // Occhi
  for (const sx of [-1, 1]) p.add(inTesta(ellissoide(0.018, 0.024, 0.018, 8).translate(0.07 * sx, 0.17, -0.04)), COL.occhio);
  // Ciuffo sulla fronte
  p.add(inTesta(new THREE.BoxGeometry(0.06, 0.12, 0.02).translate(0, 0.07, -0.075)), COL.nero);
  // Finimenti: frontale, capezzina, guance (cuoio); morso (ferro)
  const anello = (r, y, sx = 0.66) => {
    const g = new THREE.TorusGeometry(r, 0.008, 4, 16);
    g.rotateX(Math.PI / 2);
    g.scale(sx, 1, 1);
    return g.translate(0, y, 0);
  };
  p.add(inTesta(anello(0.1, 0.06)), COL.cuoio);
  p.add(inTesta(anello(0.082, 0.42)), COL.cuoio);
  for (const sx of [-1, 1]) {
    p.add(inTesta(new THREE.BoxGeometry(0.006, 0.38, 0.02).translate(0.068 * sx, 0.25, 0.0)), COL.cuoio);
  }
  p.add(inTesta(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6).rotateZ(Math.PI / 2).translate(0, 0.49, 0.03)),
    COL.ferro, true);
  // Orecchie: in coordinate di riposo, ritte e un poco in avanti
  for (const sx of [-1, 1]) {
    const o = new THREE.ConeGeometry(0.03, 0.13, 6, 1);
    o.scale(1, 1, 0.6);
    o.rotateX(0.25).rotateZ(-0.18 * sx);
    o.translate(PERNO_TESTA.x + 0.05 * sx, PERNO_TESTA.y + 0.07, PERNO_TESTA.z + 0.01);
    p.add(o, COL.mantello);
  }
  return p;
}

// Coda: attaccatura e crini, appesa dal perno verso il basso, un poco staccata dalle natiche.
function pezziCoda() {
  const p = pezzi();
  const crini = tornio([[0, 0.02], [0.045, 0.0], [0.07, -0.12], [0.09, -0.35], [0.085, -0.6], [0.05, -0.78],
    [0, -0.82]], { seg: 10, sx: 0.55, sz: 0.8 });
  crini.rotateX(0.18);
  p.add(crini.translate(PERNO_CODA.x, PERNO_CODA.y, PERNO_CODA.z), COL.nero);
  return p;
}

// Gamba: parte alta dal perno al ginocchio/garretto (lungo -Y, a riposo verticale) e parte bassa fino allo zoccolo.
function pezziGambaAlta(G, lato, posteriore) {
  const p = pezzi();
  const L = G.L1;
  const prof = posteriore
    ? [[0, 0.26], [0.1, 0.22], [0.12, 0.05], [0.1, -0.12], [0.07, -0.3], [0.058, -0.42], [0.062, -L], [0, -L - 0.03]]
    : [[0, 0.22], [0.085, 0.18], [0.092, 0.02], [0.078, -0.15], [0.058, -0.32], [0.054, -0.4], [0.06, -L], [0, -L - 0.03]];
  const g = tornio(prof, { seg: 16, sx: 0.74 });
  p.add(g.translate(G.x * lato, G.y, G.z), COL.mantello);
  return p;
}

function pezziGambaBassa(G, lato, posteriore) {
  const p = pezzi();
  const L = G.L2;
  const g = tornio([[0, 0.04], [0.058, 0.02], [0.05, -0.06], [0.04, -0.12], [0.04, -0.28], [0.053, -0.33],
    [0.046, -0.37], [0.04, -0.42], [0.045, -0.435]], { seg: 14, sx: 0.85 });
  const ginocchio = new THREE.Vector3(G.x * lato, G.y - G.L1, G.z);
  p.add(g.translate(ginocchio.x, ginocchio.y, ginocchio.z), COL.nero);
  const zoccolo = tornio([[0.046, -0.42], [0.056, -0.47], [0.066, -L + 0.005], [0.064, -L], [0, -L]], { seg: 14 });
  zoccolo.translate(0, 0, 0.008);
  p.add(zoccolo.translate(ginocchio.x, ginocchio.y, ginocchio.z), COL.zoccolo);
  if (posteriore) p.add(ellissoide(0.03, 0.05, 0.035, 8).translate(ginocchio.x, ginocchio.y + 0.01, ginocchio.z - 0.05), COL.nero);
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

  const stato = { x: 0, z: 0, y: 0, direzione: 0, beccheggio: 0, tempo: 0 };
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
      const zT = G.z + G.piede;
      const suolo = suoloA(G.x * g.lato, zT) - y;
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
    mod.testa.rotation.y = Math.sin(t * 0.21) * 0.15;
    mod.collo.rotation.x += Math.sin(t * 0.31 + 1) * 0.03;
    mod.collo.rotation.y = Math.sin(t * 0.17) * 0.06;
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
