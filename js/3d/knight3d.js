// Knight Dawn — cavaliere 3D (milestone M2)
// Modello low-poly costruito con primitive Three.js, animazione procedurale e movimento sul terreno.
//
// Convenzioni del modello: origine ai piedi, asse Y in alto, il cavaliere guarda verso +Z locale.
// Il suo lato destro è quindi -X (spada al fianco sinistro, scudo sul braccio sinistro, +X).
// Rotazione intorno a X: angolo negativo = arto in avanti, positivo = indietro.

import * as THREE from 'three';

const PAL = (typeof PALETTE !== 'undefined') ? PALETTE : {};

/** Parametri del movimento: modificabili dalla console (kd.knight.cfg) per i test. */
export const KNIGHT_CFG = {
  velCammino: 1.5,      // m/s
  velCorsa: 5.0,        // m/s (Shift)
  pendenzaMax: 35,      // gradi: oltre questa pendenza il cavaliere non sale
  margineBordo: 2,      // m dal bordo dell'area
  accelerazione: 8,     // 1/s: rapidità con cui la velocità raggiunge quella voluta
  virata: 10,           // 1/s: rapidità con cui il cavaliere si gira verso la direzione voluta
};

// Lunghezza di un ciclo completo del passo (due passi), in metri: cammino → corsa
const CICLO_PASSO = [1.6, 2.6];
const PASSO_MAX = 0.6;          // m: massimo avanzamento del piede davanti/dietro l'anca
const SOLLEVAMENTO = [0.08, 0.2]; // m: quanto si alza il piede in volo, cammino → corsa

// Gamba (m): anca → ginocchio → caviglia → pianta del piede. Totale 0,92 m.
const COSCIA = 0.46;
const STINCO = 0.38;
const PIEDE = 0.08;
const ALTEZZA_ANCA = COSCIA + STINCO + PIEDE;
const ANCA_X = 0.10;            // distanza laterale delle anche dal centro
const BACINO_MIN = -0.14;       // m: di quanto può abbassarsi al massimo il bacino (no accovacciate)

const COL = {
  acciaio:     '#8d949b',
  acciaioScuro:'#575c62',
  sopraveste:  PAL.rossoBandiera || '#8a1010',
  mantello:    '#5a1410',
  cuoio:       PAL.marrTetto || '#6a3a18',
  oro:         '#c8a030',
  fessura:     '#16100a',
};

// ─── Costruzione del modello ────────────────────────────────────────────

function materiali() {
  const m = {};
  for (const [k, c] of Object.entries(COL)) {
    m[k] = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  }
  m.mantello.side = THREE.DoubleSide;
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop, rBot, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function pivot(x, y, z, ...figli) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const f of figli) g.add(f);
  return g;
}

/** Gamba: anca → coscia → ginocchio → stinco → caviglia → piede. */
function gamba(m, x) {
  const caviglia = pivot(0, -STINCO, 0,
    box(0.14, PIEDE, 0.27, m.acciaioScuro, 0, -PIEDE / 2, 0.05),
  );
  const ginocchio = pivot(0, -COSCIA, 0,
    box(0.13, STINCO + 0.02, 0.15, m.acciaio, 0, -STINCO / 2, 0),
    box(0.10, 0.09, 0.05, m.acciaioScuro, 0, 0.0, 0.08),         // ginocchiera
    caviglia,
  );
  const anca = pivot(x, ALTEZZA_ANCA, 0,
    box(0.15, COSCIA, 0.17, m.acciaio, 0, -COSCIA / 2, 0),
    ginocchio,
  );
  return { anca, ginocchio, caviglia };
}

/** Braccio: spalla → braccio → gomito → avambraccio → guanto. Restituisce { spalla, gomito }. */
function braccio(m, x) {
  const gomito = pivot(0, -0.30, 0,
    box(0.11, 0.26, 0.12, m.acciaio, 0, -0.13, 0),
    box(0.10, 0.10, 0.11, m.acciaioScuro, 0, -0.30, 0),
  );
  const spalla = pivot(x, 0.42, 0,
    box(0.12, 0.30, 0.13, m.acciaio, 0, -0.15, 0),
    gomito,
  );
  return { spalla, gomito };
}

/** Scudo a goccia (heater) rosso con croce d'oro; la faccia guarda verso +Z del gruppo. */
function scudo(m) {
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0.30);
  s.lineTo(0.24, 0.30);
  s.lineTo(0.24, 0.05);
  s.quadraticCurveTo(0.24, -0.18, 0, -0.33);
  s.quadraticCurveTo(-0.24, -0.18, -0.24, 0.05);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 3 });
  geo.translate(0, 0, -0.0175);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m.sopraveste));
  g.add(box(0.08, 0.50, 0.01, m.oro, 0, -0.01, 0.022));     // palo
  g.add(box(0.44, 0.08, 0.01, m.oro, 0, 0.13, 0.022));      // fascia
  return g;
}

/** Spada nel fodero, appesa alla cintura: la lama scende lungo -Y, l'elsa sta sopra l'origine. */
function spadaNelFodero(m) {
  const g = new THREE.Group();
  g.add(box(0.06, 0.66, 0.03, m.cuoio, 0, -0.35, 0));                 // fodero
  g.add(box(0.065, 0.05, 0.035, m.oro, 0, -0.66, 0));                 // puntale
  g.add(box(0.20, 0.03, 0.04, m.oro, 0, 0.0, 0));                     // guardia
  g.add(cyl(0.018, 0.018, 0.16, 6, m.cuoio, 0, 0.095, 0));            // impugnatura
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), m.oro));
  g.children.at(-1).position.y = 0.19;                                // pomolo
  return g;
}

/** Mantello: pannello sottile che si allarga verso il basso, appeso alle spalle. */
function mantello(m) {
  const geo = new THREE.BoxGeometry(0.42, 1.0, 0.025, 1, 2, 1);
  geo.translate(0, -0.5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i);                     // 0 in alto, 1 in basso
    p.setX(i, p.getX(i) * (1 + 0.32 * t));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, m.mantello);
}

function buildModel() {
  const m = materiali();

  const root = new THREE.Group();            // posizione e orientamento nel mondo
  root.name = 'cavaliere';
  const corpo = new THREE.Group();           // oscillazione verticale del passo
  root.add(corpo);

  // Bacino (cotta di maglia) e gambe
  corpo.add(box(0.36, 0.16, 0.24, m.acciaioScuro, 0, 0.93, 0));
  const gambaD = gamba(m, -ANCA_X);
  const gambaS = gamba(m, ANCA_X);
  corpo.add(gambaD.anca, gambaS.anca);

  // Busto: pivot alla vita, ruota per inclinarsi in corsa
  const busto = pivot(0, 0.98, 0);
  corpo.add(busto);
  busto.add(box(0.44, 0.50, 0.26, m.sopraveste, 0, 0.24, 0));                      // sopraveste
  const gonna = cyl(0.21, 0.26, 0.32, 8, m.sopraveste, 0, -0.12, 0);               // falda
  gonna.scale.z = 0.62;
  busto.add(gonna);
  busto.add(box(0.46, 0.06, 0.28, m.cuoio, 0, 0.02, 0));                           // cintura
  busto.add(box(0.07, 0.06, 0.02, m.oro, 0, 0.02, 0.145));                         // fibbia
  busto.add(box(0.06, 0.30, 0.01, m.oro, 0, 0.27, 0.133));                         // croce sul petto
  busto.add(box(0.24, 0.06, 0.01, m.oro, 0, 0.33, 0.133));
  for (const sx of [-1, 1]) {                                                      // spallacci
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.115, 6, 4), m.acciaio);
    sp.position.set(0.28 * sx, 0.45, 0);
    sp.scale.y = 0.8;
    busto.add(sp);
  }
  busto.add(cyl(0.09, 0.10, 0.08, 8, m.acciaio, 0, 0.54, 0));                      // gorgiera

  // Testa: elmo chiuso con fessura e croce frontale
  const testa = pivot(0, 0.56, 0,
    cyl(0.125, 0.135, 0.27, 8, m.acciaio, 0, 0.135, 0),
    cyl(0.07, 0.125, 0.04, 8, m.acciaio, 0, 0.29, 0),
    box(0.19, 0.025, 0.03, m.fessura, 0, 0.165, 0.122),
    box(0.025, 0.20, 0.02, m.oro, 0, 0.10, 0.132),
  );
  busto.add(testa);

  // Braccia: destro libero, sinistro regge lo scudo
  const braccioD = braccio(m, -0.29);
  const braccioS = braccio(m, 0.29);
  busto.add(braccioD.spalla, braccioS.spalla);
  const sc = scudo(m);
  sc.rotation.y = Math.PI / 2;               // faccia verso l'esterno (+X)
  sc.position.set(0.085, -0.14, 0.04);
  braccioS.gomito.add(sc);

  // Spada al fianco sinistro, inclinata con l'elsa in avanti
  const spada = spadaNelFodero(m);
  spada.position.set(0.25, 0.04, 0.02);
  spada.rotation.set(0.62, 0, 0.1);
  busto.add(spada);

  // Mantello appeso dietro le spalle
  const cappa = mantello(m);
  const attaccoMantello = pivot(0, 0.47, -0.145, cappa);
  busto.add(attaccoMantello);

  return {
    root, corpo, busto, testa, mantello: attaccoMantello,
    gambaD, gambaS, braccioD, braccioS,
  };
}

// ─── Ombra a disco (finta, economica) ───────────────────────────────────

function buildOmbra() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mat);
  m.name = 'ombra-cavaliere';
  m.renderOrder = 1;
  return m;
}

// ─── Cavaliere: modello + movimento + animazione ────────────────────────

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const avvicina = (rate, dt) => 1 - Math.exp(-rate * dt);   // fattore di lerp indipendente dagli FPS

function angoloTra(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Crea il cavaliere sul terreno.
 * @param {object} terrain  oggetto restituito da loadTerrain (getHeight, getSlope, half)
 * @param {{x:number, z:number, direzione?:number}} start  posizione iniziale; direzione in radianti (0 = +Z, π = nord)
 */
export function createKnight(terrain, start = { x: 0, z: 0, direzione: Math.PI }) {
  const cfg = { ...KNIGHT_CFG };
  const mod = buildModel();
  const ombra = buildOmbra();
  const object = new THREE.Group();
  object.add(mod.root, ombra);

  const stato = {
    x: start.x, z: start.z, y: 0,
    direzione: start.direzione ?? Math.PI,
    velocita: 0,           // m/s voluta (con accelerazione)
    velEffettiva: 0,       // m/s realmente percorsa (0 se bloccato da una pendenza)
    fase: 0,               // fase del ciclo del passo (radianti)
    tempo: 0,
    bloccato: false,       // true se l'ultimo passo è stato fermato da una pendenza
  };

  const lim = () => terrain.half - cfg.margineBordo;

  // Un punto è raggiungibile se non obbliga a salire su una pendenza oltre il limite.
  function puoAndare(x, z) {
    const h0 = terrain.getHeight(stato.x, stato.z);
    const h1 = terrain.getHeight(x, z);
    return !(h1 > h0 + 1e-4 && terrain.getSlope(x, z) > cfg.pendenzaMax);
  }

  // Sposta di (dx, dz). Se il passo è bloccato prova a scivolare lungo un solo asse,
  // così contro un pendio ripido il cavaliere lo costeggia invece di fermarsi di colpo.
  function muovi(dx, dz) {
    const L = lim();
    const tentativi = Math.abs(dx) >= Math.abs(dz)
      ? [[dx, dz], [dx, 0], [0, dz]]
      : [[dx, dz], [0, dz], [dx, 0]];
    for (const [tx, tz] of tentativi) {
      if (tx === 0 && tz === 0) continue;
      const nx = clamp(stato.x + tx, -L, L);
      const nz = clamp(stato.z + tz, -L, L);
      if (puoAndare(nx, nz)) {
        const d = Math.hypot(nx - stato.x, nz - stato.z);
        stato.x = nx;
        stato.z = nz;
        return { distanza: d, bloccato: tx !== dx || tz !== dz };
      }
    }
    return { distanza: 0, bloccato: true };
  }

  /**
   * Aggiorna movimento e animazione.
   * @param {number} dt  secondi dall'ultimo frame
   * @param {{x:number, z:number, corsa:boolean}} input  direzione voluta nel mondo (normalizzata o nulla)
   */
  function update(dt, input) {
    stato.tempo += dt;
    const vuoleMuoversi = input.x !== 0 || input.z !== 0;

    // Rotazione fluida verso la direzione voluta; rallenta mentre si gira molto
    let fattoreVirata = 1;
    if (vuoleMuoversi) {
      const obiettivo = Math.atan2(input.x, input.z);
      const diff = angoloTra(stato.direzione, obiettivo);
      stato.direzione += diff * avvicina(cfg.virata, dt);
      fattoreVirata = 0.35 + 0.65 * Math.max(0, Math.cos(diff));
    }
    const velVoluta = vuoleMuoversi ? (input.corsa ? cfg.velCorsa : cfg.velCammino) * fattoreVirata : 0;
    stato.velocita += (velVoluta - stato.velocita) * avvicina(cfg.accelerazione, dt);
    if (stato.velocita < 0.01 && !vuoleMuoversi) stato.velocita = 0;

    // Spostamento lungo la direzione in cui il cavaliere guarda
    const passo = stato.velocita * dt;
    let percorso = 0;
    stato.bloccato = false;
    if (passo > 0) {
      const r = muovi(Math.sin(stato.direzione) * passo, Math.cos(stato.direzione) * passo);
      percorso = r.distanza;
      stato.bloccato = r.bloccato;
    }
    stato.velEffettiva += (percorso / Math.max(dt, 1e-4) - stato.velEffettiva) * avvicina(12, dt);
    if (stato.velEffettiva < 0.005) stato.velEffettiva = 0;

    // Segue esattamente la superficie disegnata
    stato.y = terrain.getHeight(stato.x, stato.z);
    mod.root.position.set(stato.x, stato.y, stato.z);
    mod.root.rotation.y = stato.direzione;

    anima(percorso);
    aggiornaOmbra();
  }

  // ─── Animazione procedurale ───
  // Le gambe non seguono angoli fissi: ogni piede ha un bersaglio (avanti/indietro rispetto
  // all'anca, sollevato in volo) appoggiato al terreno reale sotto di lui. Il bacino scende
  // quanto basta perché entrambi i piedi ci arrivino, e una IK a due ossa piega anca e ginocchio.
  // Così niente piedi nel terreno, anche in salita o di traverso su un pendio.
  const gambe = [
    { lato: -ANCA_X, mod: mod.gambaD, sfasamento: Math.PI, f: 0, cavigliaY: 0, pendenza: 0, rollio: 0 },
    { lato: ANCA_X, mod: mod.gambaS, sfasamento: 0, f: 0, cavigliaY: 0, pendenza: 0, rollio: 0 },
  ];
  const REACH = (COSCIA + STINCO) * 0.995;

  // Coordinate locali (lx a sinistra del cavaliere = +X, lz in avanti) → quota del terreno relativa ai piedi
  function suoloLocale(lx, lz) {
    const sd = Math.sin(stato.direzione), cd = Math.cos(stato.direzione);
    return terrain.getHeight(stato.x + lx * cd + lz * sd, stato.z - lx * sd + lz * cd) - stato.y;
  }

  function anima(percorso) {
    const v = stato.velEffettiva;
    const passoF = clamp(v / cfg.velCammino, 0, 1);                                  // 0 fermo → 1 cammino
    const corsaF = clamp((v - cfg.velCammino) / (cfg.velCorsa - cfg.velCammino), 0, 1); // 0 cammino → 1 corsa
    const riposo = 1 - passoF;

    // La fase avanza con la distanza percorsa: i piedi non scivolano e, se bloccato, si fermano.
    const ciclo = lerp(CICLO_PASSO[0], CICLO_PASSO[1], corsaF);
    stato.fase += percorso * Math.PI * 2 / ciclo;
    const s = Math.sin(stato.fase);

    // In salita e in discesa il passo si accorcia, come per una persona vera
    const pendenzaAvanti = Math.abs(suoloLocale(0, 0.5) - suoloLocale(0, -0.5));    // tangente
    const accorcia = 1 / (1 + 1.5 * pendenzaAvanti);
    const ampPasso = passoF * Math.min(ciclo / 4, PASSO_MAX) * accorcia;
    const ampVolo = passoF * lerp(SOLLEVAMENTO[0], SOLLEVAMENTO[1], corsaF) * accorcia;
    const ampBraccia = passoF * lerp(0.35, 0.65, corsaF);

    // Bersaglio di ogni piede: avanti/indietro con la fase, sollevato mentre torna avanti
    let bacino = 0;
    for (const g of gambe) {
      const fg = stato.fase + g.sfasamento;
      g.f = ampPasso * Math.sin(fg);
      const volo = ampVolo * Math.max(0, Math.cos(fg));
      g.pendenza = Math.atan2(suoloLocale(g.lato, g.f + 0.12) - suoloLocale(g.lato, g.f - 0.12), 0.24);
      g.rollio = Math.atan2(suoloLocale(g.lato + 0.07, g.f) - suoloLocale(g.lato - 0.07, g.f), 0.14);
      g.cavigliaY = suoloLocale(g.lato, g.f) + volo + PIEDE;
      // altezza massima dell'anca da cui questo piede si raggiunge ancora
      const maxAnca = g.cavigliaY + Math.sqrt(Math.max(REACH * REACH - g.f * g.f, 0));
      bacino = Math.min(bacino, maxAnca - ALTEZZA_ANCA);
    }
    // Limite all'abbassamento: su un pendio molto ripido il piede a valle resta un filo sollevato
    // piuttosto che far accovacciare il cavaliere con le ginocchia dentro il versante.
    bacino = Math.max(bacino, BACINO_MIN) - corsaF * 0.05;   // in corsa leggermente accovacciato
    mod.corpo.position.y = bacino;

    // IK a due ossa nel piano sagittale di ogni gamba
    for (const g of gambe) {
      const giu = ALTEZZA_ANCA + bacino - g.cavigliaY;            // anca → caviglia, verso il basso
      const D = Math.min(Math.hypot(g.f, giu), REACH);
      const cosK = (D * D - COSCIA * COSCIA - STINCO * STINCO) / (2 * COSCIA * STINCO);
      const k = Math.acos(clamp(cosK, -1, 1));                   // piegamento del ginocchio
      const alfa = Math.atan2(g.f, giu) + Math.atan2(STINCO * Math.sin(k), COSCIA + STINCO * Math.cos(k));
      g.mod.anca.rotation.x = -alfa;                             // coscia in avanti
      g.mod.ginocchio.rotation.x = k;                            // stinco all'indietro
      g.mod.caviglia.rotation.x = alfa - k - g.pendenza;         // pianta parallela al terreno…
      g.mod.caviglia.rotation.z = g.rollio;                      // …anche di traverso
    }

    // Respiro da fermo
    const respiro = Math.sin(stato.tempo * 1.7);

    // Busto: inclinato in avanti in corsa, leggera torsione opposta alle anche
    mod.busto.rotation.x = 0.03 + corsaF * 0.2;
    mod.busto.rotation.y = ampBraccia * 0.18 * s;
    mod.busto.position.y = 0.98 + respiro * 0.007 * riposo;
    mod.testa.rotation.x = -corsaF * 0.15 + respiro * 0.02 * riposo;

    // Braccia: il destro oscilla opposto alla gamba destra, il sinistro (scudo) molto meno
    mod.braccioD.spalla.rotation.x = -ampBraccia * s;
    mod.braccioS.spalla.rotation.x = ampBraccia * 0.35 * s;
    mod.braccioD.spalla.rotation.z = -0.07 - respiro * 0.02 * riposo;
    mod.braccioS.spalla.rotation.z = 0.13 + respiro * 0.02 * riposo;
    mod.braccioD.gomito.rotation.x = -(0.15 + corsaF * 1.0);
    mod.braccioS.gomito.rotation.x = -(0.75 + corsaF * 0.25);

    // Mantello: si solleva all'indietro con la velocità e sventola col passo
    mod.mantello.rotation.x = 0.05 + passoF * 0.12 + corsaF * 0.45
      + Math.sin(stato.fase * 2) * 0.05 * passoF + respiro * 0.01 * riposo;
  }

  // ─── Ombra adagiata sul terreno ───
  const _n = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1);
  function aggiornaOmbra() {
    const e = 0.4;
    const dhdx = (terrain.getHeight(stato.x + e, stato.z) - terrain.getHeight(stato.x - e, stato.z)) / (2 * e);
    const dhdz = (terrain.getHeight(stato.x, stato.z + e) - terrain.getHeight(stato.x, stato.z - e)) / (2 * e);
    _n.set(-dhdx, 1, -dhdz).normalize();
    ombra.quaternion.setFromUnitVectors(_z, _n);
    ombra.position.set(stato.x, stato.y, stato.z).addScaledVector(_n, 0.04);
  }

  update(0, { x: 0, z: 0, corsa: false });

  return {
    object,
    cfg,
    stato,
    update,
    /** Punto da inquadrare (petto del cavaliere), in coordinate del mondo. */
    puntoMira(out = new THREE.Vector3()) {
      return out.set(stato.x, stato.y + 1.3, stato.z);
    },
  };
}
