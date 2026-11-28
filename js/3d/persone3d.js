// Knight Dawn — modelli 3D delle persone (M7, passo 7; sessione «modelli 3D delle persone»)
//
// Gente dei borghi e, più avanti, contadini e viandanti: figure semplici ma leggibili come persone, non come
// capsule. Arti distinti che si muovono camminando, testa staccata sul collo, capigliatura come forma sul cranio,
// statura e corporatura variate dal seme. Il cavaliere (knight3d.js) resta il personaggio rifinito: qui niente
// riflessi, vestiti definiti, volti o dita (richiesta dell'utente).
//
// Convenzioni del modello (le stesse del cavaliere): origine ai piedi, Y in alto, la persona guarda verso +Z
// locale; rotazione attorno a X con angolo negativo = arto in avanti.
//
// ─── Perché una sola chiamata di disegno per tutte le persone ──────────────────────────────────────────────
// docs/PRESTAZIONI.md dà 120 chiamate a «borgo, cavallo e persone» insieme, e nel borgo ne sono già usate ~90
// (rocca 18 oggetti, borgo 37, campagna 18, 16 persone). Braccia e gambe come oggetti figli costerebbero 5
// chiamate a persona (80 per un borgo): fuori budget. Qui invece la persona è una geometria sola, l'oscillazione
// degli arti è nel vertex shader (ogni vertice sa a quale arto appartiene e a che quota sta il suo snodo) e tutte
// le persone del blocco stanno in un'unica `InstancedMesh`: **1 chiamata per tutte**, con colori, fase del passo,
// capigliatura e corporatura come attributi per istanza. I contadini e le altre persone che arriveranno non
// costeranno chiamate in più.
//
// Interfaccia usata da abitanti3d.js (che non va toccato):
//   creaPersone() → { creaPersona({ ruolo, colori, seme }), finisci() }
//   creaPersona(...) → { object: THREE.Object3D, update(dt, { modo, velocita }) }
// `finisci()` restituisce il gruppo con la mesh condivisa, da appendere a `abitanti.object` dopo `creaAbitanti`.

import * as THREE from 'three';

// ─── Misure del corpo (m, adulto di ~1,72 m) ───────────────────────────────────────────────────────────────
const H = {
  caviglia: 0.10,
  ginocchio: 0.47,
  anca: 0.90,
  spalla: 1.40,
  gomito: 1.11,
  polso: 0.86,
  testa: 1.60,          // centro della testa
};
const ANCA_X = 0.088;   // distanza laterale delle anche dal centro
const SPALLA_X = 0.180; // distanza laterale delle spalle dal centro
const APERTURA = 0.21;  // rad: quanto le braccia si staccano dal corpo a riposo (~12°)

// Ampiezze dell'andatura (rad): gambe ±OSC, braccia meno (il verso sta nell'attributo del vertice)
const OSC_GAMBA = 1.0;
const OSC_BRACCIO = -0.62;   // segno opposto: braccio e gamba dello stesso lato vanno in controtempo
const CICLO = 1.5;           // m percorsi in un ciclo completo di passo (due passi)

// Capigliature: dal seme. Scuro comune, biondo e rosso più rari, grigio e bianco per i vecchi.
const CAPELLI = [
  '#241d16', '#241d16', '#241d16',   // nero corvino
  '#3b2b1b', '#3b2b1b', '#3b2b1b',   // castano scuro
  '#5a4228', '#5a4228',              // castano
  '#7d5c30',                         // castano chiaro
  '#a07f44',                         // biondo scuro
  '#8a4526',                         // rosso
  '#8d8a80',                         // brizzolato
  '#cfc8bb',                         // bianco
];

// Pesi delle tinte di un vertice: (veste, pelle, capelli). Un peso sotto 1 sulla veste la scurisce senza
// disegnare un vestito a parte: calzoni e scarpe sono la stessa stoffa più scura.
// La quarta componente non è un peso: sceglie una tinta fissa (1 = acciaio, 2 = legno) per l'equipaggiamento,
// che non cambia da persona a persona.
const T_VESTE = [1, 0, 0, 0];
const T_GAMBE = [0.70, 0, 0, 0];
const T_SCARPE = [0.52, 0, 0, 0];
const T_PELLE = [0, 1, 0, 0];
const T_CAPELLI = [0, 0, 1, 0];
const T_ACCIAIO = [0, 0, 0, 1];
const T_LEGNO = [0, 0, 0, 2];
const COL_ACCIAIO = '#8e949b';
const COL_LEGNO = '#6b5236';

// ─── Costruzione della geometria comune ────────────────────────────────────────────────────────────────────

/** Tronco di cono lungo Y tra le quote y0 (raggio r0) e y1 (raggio r1). */
function cono(r0, r1, y0, y1, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

/**
 * Capigliatura: guscio appoggiato sul cranio che **non scende sui lati del viso** e non è simmetrico.
 * Per ogni direzione attorno alla testa il guscio finisce a una quota diversa: davanti all'attaccatura sulla
 * fronte, ai lati sopra le tempie (l'orecchio e la guancia restano scoperti), dietro giù sulla nuca; da un lato
 * il ciuffo scende un po' più dell'altro (scriminatura). Lo shader la gira di ±0,22 rad e ne cambia lunghezza e
 * volume, così da una forma sola vengono teste diverse.
 */
function capigliatura(R, SEG = 14, ANELLI = 5) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * Math.PI * 2;        // 0 = davanti (+Z)
    const sx = Math.sin(th), cz = Math.cos(th);
    // quota del bordo inferiore, in raggi: 0,55 davanti (attaccatura sulla fronte) · 0,22 ai lati (sopra
    // l'orecchio: guancia e tempia restano scoperte) · −0,52 dietro (nuca)
    let bordo = 0.22 + 0.33 * Math.max(0, cz) - 0.74 * Math.max(0, -cz);
    bordo += (sx > 0 ? -0.07 : 0.05) * Math.max(0, cz);     // scriminatura: da un lato il ciuffo scende di più
    const fiMax = Math.acos(Math.min(0.94, Math.max(-0.94, bordo)));
    for (let j = 0; j <= ANELLI; j++) {
      const fi = (j / ANELLI) * fiMax;
      const s = Math.sin(fi), c = Math.cos(fi);
      pos.push(R * s * sx, R * c, R * s * cz);
      nrm.push(s * sx, c, s * cz);             // normali della sfera: il guscio resta liscio
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < ANELLI; j++) {
      const a = i * (ANELLI + 1) + j, b = a + (ANELLI + 1);
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Ruota una geometria attorno a un asse passante per (px, py, pz). */
function ruotaAttorno(g, asse, ang, px, py, pz) {
  g.translate(-px, -py, -pz);
  if (asse === 'x') g.rotateX(ang); else if (asse === 'z') g.rotateZ(ang); else g.rotateY(ang);
  g.translate(px, py, pz);
  return g;
}

/**
 * Pezzi del corpo. Ogni pezzo porta con sé:
 *  - `snodo`: [verso dell'oscillazione primaria, quota dello snodo primario, piega secondaria, quota della piega]
 *    (tutto a zero per ciò che non si muove: tronco, collo, testa, capelli);
 *  - `tinta`: pesi di veste, pelle e capelli.
 */
function pezziDelCorpo() {
  const P = [];
  const metti = (geo, snodo, tinta) => P.push({ geo, snodo, tinta });
  const FERMO = [0, 0, 0, 0];

  // Tronco: solido di rotazione dal bacino alle spalle, schiacciato in profondità (le persone non sono botti).
  const profilo = [[0, 0.80], [0.148, 0.83], [0.152, 0.95], [0.133, 1.06], [0.150, 1.20], [0.174, 1.35],
    [0.168, 1.41], [0.120, 1.45], [0, 1.47]].map(([x, y]) => new THREE.Vector2(x, y));
  const tronco = new THREE.LatheGeometry(profilo, 10);
  tronco.scale(1, 1, 0.76);
  metti(tronco, FERMO, T_VESTE);

  // Collo e testa: la testa è staccata, si vede il collo tra le spalle e la mandibola.
  metti(cono(0.047, 0.043, 1.38, 1.50, 8), FERMO, T_PELLE);
  const testa = new THREE.SphereGeometry(0.105, 10, 7);
  testa.scale(0.93, 1.13, 1.0);
  testa.translate(0, H.testa, 0);
  metti(testa, FERMO, T_PELLE);

  const capelli = capigliatura(0.113);
  capelli.scale(1.03, 1.14, 1.05);
  capelli.translate(0, H.testa, -0.006);
  metti(capelli, FERMO, T_CAPELLI);

  for (const lato of [-1, 1]) {
    // ── Gamba: coscia attorno all'anca, stinco e scarpa anche attorno al ginocchio ──
    const verso = lato * OSC_GAMBA;
    const coscia = cono(0.106, 0.082, H.ginocchio, H.anca, 7);
    coscia.translate(lato * ANCA_X, 0, 0);
    metti(coscia, [verso, H.anca, 0, 0], T_GAMBE);

    const stinco = cono(0.055, 0.076, H.caviglia, H.ginocchio, 7);
    stinco.translate(lato * ANCA_X, 0, 0);
    metti(stinco, [verso, H.anca, 1, H.ginocchio], T_GAMBE);

    const piede = new THREE.BoxGeometry(0.090, 0.076, 0.205);
    piede.translate(lato * ANCA_X, 0.040, 0.036);
    metti(piede, [verso, H.anca, 1, H.ginocchio], T_SCARPE);

    // ── Braccio: tutto attorno alla spalla; gomito e polso piegati nella posa di riposo ──
    const versoB = lato * OSC_BRACCIO;
    const snodoB = [versoB, H.spalla, 0, 0];
    // Spalla tonda: riempie lo stacco tra il tronco e il braccio, che da dietro sembrava un'ala.
    const deltoide = new THREE.SphereGeometry(0.074, 7, 5);
    deltoide.scale(1, 0.95, 0.86);
    deltoide.translate(lato * (SPALLA_X - 0.014), H.spalla - 0.018, 0);
    metti(deltoide, snodoB, T_VESTE);

    // APERTURA: le braccia non cadono a piombo lungo i fianchi, si staccano di ~12° (il gomito resta fuori dal
    // tronco anche con le corporature larghe) e l'avambraccio rientra appena, come a riposo.
    const braccio = cono(0.058, 0.070, H.gomito, H.spalla + 0.01, 6);
    braccio.translate(lato * SPALLA_X, 0, 0);
    ruotaAttorno(braccio, 'z', lato * APERTURA, lato * SPALLA_X, H.spalla, 0);
    metti(braccio, snodoB, T_VESTE);

    const avambraccio = cono(0.046, 0.057, H.polso, H.gomito, 6);
    avambraccio.translate(lato * SPALLA_X, 0, 0);
    const mano = new THREE.SphereGeometry(0.050, 6, 5);
    mano.scale(0.84, 1.12, 0.74);
    mano.translate(lato * SPALLA_X, H.polso - 0.016, 0);
    for (const g of [avambraccio, mano]) {
      ruotaAttorno(g, 'x', -0.24, lato * SPALLA_X, H.gomito, 0);              // gomito appena piegato
      ruotaAttorno(g, 'z', -lato * 0.07, lato * SPALLA_X, H.gomito, 0);       // l'avambraccio rientra un poco
      ruotaAttorno(g, 'z', lato * APERTURA, lato * SPALLA_X, H.spalla, 0);
    }
    metti(avambraccio, snodoB, T_VESTE);
    metti(mano, snodoB, T_PELLE);
  }

  // ── Da guardia: cappello di ferro e lancia ──────────────────────────────────────────────────────────────
  // Stanno nella geometria condivisa da tutti e si chiudono a volume zero per chi non è una guardia (lo stesso
  // modo dei calvi): costano vertici, zero pixel e **zero chiamate di disegno**. Volutamente rozzi: la guardia
  // deve leggersi come una guardia a 3–5 m, non assomigliare al cavaliere.
  const calotta = new THREE.SphereGeometry(0.116, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.56);
  calotta.scale(1, 0.98, 1);
  calotta.translate(0, H.testa + 0.018, 0);
  metti(calotta, FERMO, T_ACCIAIO);
  const tesa = cono(0.206, 0.138, H.testa - 0.012, H.testa + 0.018, 14);   // falda che scende verso fuori
  metti(tesa, FERMO, T_ACCIAIO);

  const MANO_X = -0.272, MANO_Z = 0.065;                                   // dove cade la mano destra a riposo
  metti(cono(0.021, 0.019, 0.0, 2.02, 5).translate(MANO_X, 0, MANO_Z), FERMO, T_LEGNO);
  const cuspide = new THREE.ConeGeometry(0.036, 0.20, 6);
  cuspide.translate(MANO_X, 2.11, MANO_Z);
  metti(cuspide, FERMO, T_ACCIAIO);

  return P;
}

/** Unisce i pezzi in una geometria sola (non indicizzata) con gli attributi `aSnodo` e `aTinta`. */
function geometriaPersona() {
  const pezzi = pezziDelCorpo().map((p) => ({ ...p, geo: p.geo.toNonIndexed() }));
  let n = 0;
  for (const p of pezzi) n += p.geo.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const snodo = new Float32Array(n * 4), tinta = new Float32Array(n * 4);
  let i = 0;
  for (const p of pezzi) {
    const c = p.geo.attributes.position.count;
    pos.set(p.geo.attributes.position.array, i * 3);
    nrm.set(p.geo.attributes.normal.array, i * 3);
    for (let k = 0; k < c; k++) {
      snodo.set(p.snodo, (i + k) * 4);
      tinta.set(p.tinta, (i + k) * 4);
    }
    i += c;
    p.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aSnodo', new THREE.BufferAttribute(snodo, 4));
  geo.setAttribute('aTinta', new THREE.BufferAttribute(tinta, 4));
  geo.computeBoundingSphere();
  return geo;
}

// ─── Materiale: Lambert opaco, con l'andatura e le tinte innestate nel vertex shader ───────────────────────
// Una sola funzione a livello di modulo: Three.js usa il suo testo come chiave della cache dei programmi, quindi
// tutte le scene condividono lo stesso programma compilato anche se il materiale si rifà a ogni blocco.
function innesta(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec4 aSnodo;     // verso dell'oscillazione, quota dello snodo, piega secondaria, quota della piega
      attribute vec4 aTinta;     // pesi di veste, pelle, capelli; w: 0 corpo · 1 acciaio · 2 legno
      attribute vec3 iVeste;
      attribute vec3 iPelle;
      attribute vec3 iCapelli;
      attribute vec4 iMoto;      // fase del passo, ampiezza, lunghezza e volume della capigliatura
      attribute float iDota;     // 1 = porta elmo e lancia (guardia), 0 = l'equipaggiamento si chiude a zero
      const float KD_TESTA_Y = ${H.testa.toFixed(3)};
      void kdRuota(inout vec3 p, float y0, float a) {
        float c = cos(a), s = sin(a);
        float dy = p.y - y0, dz = p.z;
        p.y = y0 + dy * c - dz * s;
        p.z = dy * s + dz * c;
      }`)
    // Le tinte: un peso sotto 1 sulla veste scurisce senza aggiungere un vestito a parte (calzoni, scarpe).
    .replace('#include <color_vertex>', `
      vec3 kdTinta = aTinta.x * iVeste + aTinta.y * iPelle + aTinta.z * iCapelli;
      if (aTinta.w > 0.5) kdTinta = aTinta.w < 1.5 ? vec3(${tinta(COL_ACCIAIO)}) : vec3(${tinta(COL_LEGNO)});
      vColor = vec4(kdTinta, 1.0);`)
    // Gli angoli si calcolano una volta sola qui e servono anche a `begin_vertex`, più sotto nello stesso main().
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float kdS = sin(iMoto.x);
      float kdA1 = aSnodo.x * kdS * iMoto.y * 0.40;                             // anca o spalla
      float kdA2 = aSnodo.z * iMoto.y * 0.58 * max(0.0, aSnodo.x * kdS);        // ginocchio: piega all'indietro
      kdRuota(objectNormal, 0.0, kdA2);
      kdRuota(objectNormal, 0.0, kdA1);
      // La capigliatura gira attorno alla testa (il segno di iMoto.z): sposta la scriminatura senza specchiare
      // la geometria, che rovescerebbe il verso delle facce.
      float kdGiro = (iMoto.z < 0.0 ? -0.26 : 0.16);
      float kdCg = cos(kdGiro), kdSg = sin(kdGiro);
      if (aTinta.z > 0.5) {
        float nx = objectNormal.x * kdCg - objectNormal.z * kdSg;
        objectNormal.z = objectNormal.x * kdSg + objectNormal.z * kdCg;
        objectNormal.x = nx;
      }`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      kdRuota(transformed, aSnodo.w, kdA2);
      kdRuota(transformed, aSnodo.y, kdA1);
      if (aTinta.z > 0.5) {                                                     // capigliatura
        vec3 d = transformed - vec3(0.0, KD_TESTA_Y, 0.0);
        float px = d.x * kdCg - d.z * kdSg;
        d.z = d.x * kdSg + d.z * kdCg;
        d.x = px;
        d.xz *= iMoto.w;
        float dietro = clamp(-d.z * 18.0, 0.0, 1.0);                            // si allunga solo sulla nuca
        if (d.y < 0.0) d.y *= mix(1.0, abs(iMoto.z), dietro);
        transformed = vec3(0.0, KD_TESTA_Y, 0.0) + d;
      }
      // Elmo e lancia: chi non è una guardia li chiude in un punto (triangoli degeneri, zero pixel).
      if (aTinta.w > 0.5) transformed = mix(vec3(0.0, 1.0, 0.0), transformed, iDota);
      transformed.y += abs(kdS) * 0.035 * iMoto.y;`);                           // il corpo sale e scende col passo
}

/** Colore esadecimale → terna GLSL nello spazio di lavoro (come fa THREE.Color per i colori dei vertici). */
function tinta(hex) {
  const c = new THREE.Color(hex);
  return `${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)}`;
}

// Un solo materiale per tutta la partita: `userData.condivisa` dice a `libera()` di non cancellarlo al cambio di
// blocco (senza, lo shader si ricompilerebbe proprio mentre si cambia blocco).
let _materiale = null;
function materialePersone() {
  if (!_materiale) {
    _materiale = new THREE.MeshLambertMaterial({ vertexColors: true });
    _materiale.onBeforeCompile = innesta;
    _materiale.userData.condivisa = true;
  }
  return _materiale;
}

// ─── Fabbrica ──────────────────────────────────────────────────────────────────────────────────────────────

function generatore(seme) {
  let s = (seme >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Fabbrica delle persone di una Scena. La geometria si rifà per Scena, perché porta gli attributi di istanza
 * (tante quante le persone del blocco), e `libera()` di main.js la pulisce insieme a `abitanti.object`; il
 * materiale è uno solo per tutta la partita (`userData.condivisa`).
 * @returns {{ creaPersona:Function, finisci:() => THREE.Object3D|null }}
 */
export function creaPersone() {
  const gente = [];

  /**
   * Una persona. L'oggetto restituito non disegna nulla da solo: porta solo posizione, verso e visibilità, che
   * la mesh condivisa legge a ogni fotogramma.
   * @param {{ ruolo:string, colori:{ veste:string, pelle:string }, seme:number }} p
   */
  function creaPersona({ ruolo, colori, seme = 1 }) {
    const r = generatore(seme);
    const bambino = ruolo === 'bambino';
    const object = new THREE.Object3D();
    object.name = `persona-${ruolo}`;

    // Statura e corporatura dal seme: un borgo non deve sembrare fatto di cloni.
    const alta = (bambino ? 0.62 : 0.95) + r() * (bambino ? 0.10 : 0.12);
    const larga = alta * (0.90 + r() * 0.20);
    const scala = new THREE.Vector3(larga, alta, larga * (0.92 + r() * 0.14));

    // Capigliatura: colore dalla tavola, lunghezza sulla nuca e volume dal seme; qualche adulto è calvo.
    // Le guardie portano cappello di ferro e lancia (sotto l'elmo i capelli non si vedono).
    const guardia = ruolo === 'guardia';
    const calvo = guardia || (!bambino && r() < 0.09);
    const capelli = new THREE.Color(CAPELLI[Math.floor(r() * CAPELLI.length)]);
    // Il segno della lunghezza dice da che parte sta la scriminatura (lo legge lo shader).
    const lung = (bambino ? 0.6 + r() * 0.7 : 0.6 + r() * 1.6) * (r() < 0.5 ? -1 : 1);
    const vol = calvo ? 0.0 : 0.88 + r() * 0.34;

    // La tavola delle vesti di abitanti3d.js ha pochi toni: una schiaritura o una scurita per persona basta a
    // non far sembrare i popolani usciti dallo stesso telaio.
    const veste = new THREE.Color(colori.veste).multiplyScalar(0.86 + r() * 0.30);

    const dato = {
      object,
      scala,
      veste,
      pelle: new THREE.Color(colori.pelle),
      capelli,
      lung,
      vol,
      dota: guardia ? 1 : 0,
      fase: r() * Math.PI * 2,
      amp: 0,
    };
    gente.push(dato);

    return {
      object,
      /** @param {{ modo:'fermo'|'cammina', velocita:number }} stato */
      update(dt, stato) {
        const cammina = stato.modo === 'cammina';
        const v = cammina ? Math.max(0.3, stato.velocita || 0) : 0.35;
        // Camminando il ritmo segue la velocità; da fermi resta un dondolio appena accennato (non statue).
        dato.fase += dt * (cammina ? (Math.PI * 2 * v) / CICLO : 0.9);
        if (dato.fase > Math.PI * 4) dato.fase -= Math.PI * 4;
        const voluta = cammina ? 1 : 0.055;
        dato.amp += (voluta - dato.amp) * Math.min(1, dt * 7);
      },
    };
  }

  /** Mesh condivisa con tutte le persone registrate (null se non ce ne sono). Da chiamare dopo `creaAbitanti`. */
  function finisci() {
    if (!gente.length) return null;
    const geo = geometriaPersona();
    const n = gente.length;
    const veste = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const pelle = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const cap = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const moto = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const dota = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('iVeste', veste);
    geo.setAttribute('iPelle', pelle);
    geo.setAttribute('iCapelli', cap);
    geo.setAttribute('iMoto', moto);
    geo.setAttribute('iDota', dota);

    const mesh = new THREE.InstancedMesh(geo, materialePersone(), n);
    mesh.name = 'persone';
    mesh.frustumCulled = false;     // le istanze stanno sparse per il blocco: la selezione la fa `visible`
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    moto.setUsage(THREE.DynamicDrawUsage);

    const m = new THREE.Matrix4();
    // A ogni passata di disegno si riempiono solo le persone visibili, di seguito: `count` dice quante.
    mesh.onBeforeRender = () => {
      let k = 0;
      for (const d of gente) {
        if (!d.object.visible) continue;
        m.copy(d.object.matrixWorld).scale(d.scala);
        m.toArray(mesh.instanceMatrix.array, k * 16);
        d.veste.toArray(veste.array, k * 3);
        d.pelle.toArray(pelle.array, k * 3);
        d.capelli.toArray(cap.array, k * 3);
        moto.array[k * 4] = d.fase;
        moto.array[k * 4 + 1] = d.amp;
        moto.array[k * 4 + 2] = d.lung;
        moto.array[k * 4 + 3] = d.vol;
        dota.array[k] = d.dota;
        k++;
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
      veste.needsUpdate = true; pelle.needsUpdate = true; cap.needsUpdate = true;
      moto.needsUpdate = true; dota.needsUpdate = true;
    };

    const gruppo = new THREE.Group();
    gruppo.name = 'persone-comune';
    gruppo.add(mesh);
    return gruppo;
  }

  return { creaPersona, finisci };
}
