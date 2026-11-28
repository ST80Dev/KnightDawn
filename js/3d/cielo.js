// Knight Dawn — cielo: ciclo giorno/notte (sole, luna, luce emisferica, colore del cielo) e nebbia.
// Spostato da main.js (milestone «Cielo e meteo», passo 0: comportamento identico). Piano in
// docs/ESPLORAZIONE_3D.md, «Cielo e meteo». main.js chiama creaCielo una volta e poi, a ogni fotogramma,
// aggiorna(ora) e aggiornaNebbia(...).
// Unità: metri; azimut in gradi da nord, in senso orario; nord verso -Z.

import * as THREE from 'three';

// Nebbia sulla distanza vera dalla camera, non sulla profondità lungo l'asse di vista (come fa Three.js):
// con la profondità, un monte al bordo dello schermo riceveva meno nebbia e spariva girandosi verso di lui.
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = length( mvPosition.xyz );\n#endif';

const COLORE_CIELO = '#c4d4d6';           // azzurro-pergamena, uguale alla nebbia
const NEBBIA = [900, 4000];               // m: inizio e fine della nebbia lineare (foschia leggera)
// Con l'orizzonte (mondo generato) la foschia dipende dal giorno (visibilitaDelGiorno): inizio a 1,5 km, fine
// (`far`, m) tirata per giorno. Nebbia lineare addolcita (smoothstep di Three.js): con far 65 km a 20 km si perde
// ~25 % del contrasto, a 35 km ~55 %, a 50 km ~85 % (sagome dei monti alti ancora leggibili). Giornate limpide
// (dopo la pioggia, col vento) fino a far 150 km: a 80 km ~55 %, a 100 km ~75 %. Quando ci sarà il meteo, il tiro
// del giorno verrà da lì.
const NEBBIA_ORIZZONTE_INIZIO = 1500;
const VISIBILITA = [                       // [probabilità, far minimo, far massimo] (m)
  [0.15, 40000, 50000],                    // foschia densa, afa
  [0.60, 55000, 75000],                    // di norma
  [0.25, 110000, 150000],                  // limpida
];

// Ciclo del giorno (stagioni ferme in Primavera): alba alle 5:45, tramonto alle 18:45, sole al massimo a 55° verso le
// 12:15 (deciso con l'utente, 28/11/2026: Prima, ~6, è l'alba vera e Vespri, ~18, cade al tramonto; prima erano le 5 e
// le 20, e a Prima il sole era già a 11° con le luci piene).
// Di notte la "quota" del sole scende sotto l'orizzonte fino a −35°.
export const CICLO = {
  alba: 5.75, tramonto: 18.75, altezzaMax: 55, profonditaNotte: 35,
  // Luna: perenne e fissa, è l'83 % della luce che arriva su una faccia rivolta in su di notte (irradianza 0,12
  // contro 0,025 dell'emisfera), ed essendo direzionale dà rilievo dove l'emisfera appiattisce. Riportata da 0,45 a
  // 1,0 (prima del 18/11 era 1,1): lì era stata tagliata insieme all'emisfera e alla nebbia, ma «di notte si vede
  // bene solo vicino» lo fa la nebbia, che resta com'è. Misurato nel bosco fitto: suolo da 6 a 12 su 255, tronchi da
  // 14 a 23, cespugli da 19 a 30 (deciso con l'utente, 28/11/2026).
  soleMax: 3.4, lunaMax: 1.0,
  emisferaGiorno: 0.45, emisferaNotte: 0.16,
  // Di notte si vede bene solo vicino: la nebbia (color notte) si stringe attorno a ciò che si guarda.
  // Metri oltre la distanza camera–bersaglio: nitido fino a vicinoNotte, buio pieno a lontanoNotte.
  vicinoNotte: 15, lontanoNotte: 110,
  colori: {
    cieloGiorno: new THREE.Color('#c4d4d6'), cieloNotte: new THREE.Color('#0b1019'),
    cieloCrepuscolo: new THREE.Color('#d9a882'),
    // Cupola (passo 1): lo zenit è più scuro e saturo dell'orizzonte; l'orizzonte resta il colore della nebbia.
    zenitGiorno: new THREE.Color('#6f9cc0'), zenitNotte: new THREE.Color('#03060c'),
    zenitCrepuscolo: new THREE.Color('#4a5f86'),
    alonCrepuscolo: new THREE.Color('#f0a060'),   // fascia calda sopra l'orizzonte, dalla parte del sole
    discoLuna: new THREE.Color('#e4e8ee'),
    soleGiorno: new THREE.Color('#fff0d4'), soleBasso: new THREE.Color('#ffb070'),
    emisferaCieloGiorno: new THREE.Color('#dce8ec'), emisferaCieloNotte: new THREE.Color('#5a6c94'),
    emisferaTerraGiorno: new THREE.Color('#8a7550'), emisferaTerraNotte: new THREE.Color('#363330'),
  },
};
const _gradi = Math.PI / 180;
const smoothstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

/** Posizione del sole (gradi) per un'ora del giorno 0–24: { altezza, azimut } (azimut da nord, orario). */
export function posizioneSole(ora) {
  const { alba, tramonto, altezzaMax, profonditaNotte } = CICLO;
  if (ora >= alba && ora <= tramonto) {
    const t = (ora - alba) / (tramonto - alba);
    return { altezza: altezzaMax * Math.sin(Math.PI * t), azimut: 70 + 220 * t };
  }
  const t = ((ora - tramonto + 24) % 24) / (24 - (tramonto - alba));
  return { altezza: -profonditaNotte * Math.sin(Math.PI * t), azimut: 290 + 140 * t };
}

/** `far` della foschia (m) per il giorno `g` (intero) del seme: tiro deterministico, stesso giorno = stessa vista. */
function farDelGiorno(seme, g) {
  let h = (Math.imul(seme | 0, 0x9e3779b1) ^ Math.imul(g | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  let soglia = 0;
  for (const [p, min, max] of VISIBILITA) {
    soglia += p;
    if (r < soglia) return min + (max - min) * ((r - soglia + p) / p);
  }
  return VISIBILITA.at(-1)[2];
}

/**
 * Visibilità del momento: interpola tra il giorno corrente e il successivo, così cambia piano e senza scatti.
 * @param {number} seme   seme della Carta (0 senza Carta)
 * @param {number} giorni giorni di gioco trascorsi, con la frazione
 */
export function visibilitaDelGiorno(seme, giorni) {
  const g = Math.floor(giorni), f = giorni - g;
  return THREE.MathUtils.lerp(farDelGiorno(seme, g), farDelGiorno(seme, g + 1), f * f * (3 - 2 * f));
}

// ─── Cupola del cielo ───
// Sfera attorno alla camera, senza nebbia, disegnata per ULTIMA tra gli opachi e con il test di profondità: lo
// shader gira solo sui pixel di cielo rimasti scoperti (misura dell'utente sulla UHD 730 con la cupola disegnata per
// prima su tutto lo schermo: 1,2 ms). Resta prima dei trasparenti (mare, acque), che la coprono. In basso (direzione orizzontale e
// sotto) ha esattamente il colore della nebbia, così il terreno lontano, che nella nebbia sfuma in quel colore,
// non lascia una riga all'orizzonte, anche dalle alture. Sopra: gradiente verso lo zenit, fascia calda dalla parte
// del sole al crepuscolo, disco e alone del sole, disco della luna. Un solo calcolo leggero per pixel di cielo.
// m: oltre il terreno disegnato (anelli dell'orizzonte e mare fino a ~110 km) e dentro il far della camera (130 km).
// Con 48×24 segmenti le facce rientrano al più di ~0,5 km.
const RAGGIO_CUPOLA = 125000;
const RAGGIO_SOLE = 0.75 * _gradi;        // più grande del vero (0,27°): si deve vedere dalla vista di gioco
const RAGGIO_LUNA = 0.6 * _gradi;

const VERTICI_CUPOLA = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    #include <logdepthbuf_vertex>
  }`;
const FRAMMENTI_CUPOLA = /* glsl */ `
  uniform vec3 uOrizzonte, uZenit, uAlone, uColoreSole, uColoreLuna;
  uniform vec3 uDirSole, uDirLuna;
  uniform float uCrepuscolo, uSole, uLuna, uCosSole, uCosLuna;
  varying vec3 vDir;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float h = d.y;
    // Gradiente: nullo sotto e all'orizzonte (colore della nebbia), pieno verso lo zenit.
    float t = smoothstep(0.0, 1.0, pow(clamp(h, 0.0, 1.0), 0.55));
    vec3 col = mix(uOrizzonte, uZenit, t);
    // Crepuscolo: fascia calda bassa dalla parte del sole, che si allarga attorno a lui.
    vec3 sOriz = normalize(vec3(uDirSole.x, 0.0, uDirSole.z) + 1e-5);
    float verso = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sOriz), 0.0);
    float fascia = smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.02, 0.35, h));
    col = mix(col, uAlone, uCrepuscolo * fascia * (0.25 + 0.75 * verso * verso));
    // Sole: alone largo, alone stretto, disco. Solo sopra l'orizzonte (sotto c'è il terreno o il mare).
    float s = dot(d, uDirSole);
    float sopra = smoothstep(-0.01, 0.01, h);
    col += uColoreSole * uSole * sopra * (0.10 * pow(max(s, 0.0), 12.0) + 0.35 * pow(max(s, 0.0), 300.0));
    col = mix(col, uColoreSole * 1.6, uSole * sopra * smoothstep(uCosSole - 0.00004, uCosSole + 0.00004, s));
    // Luna: disco pallido e alone appena accennato.
    float l = dot(d, uDirLuna);
    col += uColoreLuna * uLuna * sopra * (0.03 * pow(max(l, 0.0), 40.0) + 0.10 * pow(max(l, 0.0), 2000.0));
    col = mix(col, uColoreLuna, uLuna * sopra * smoothstep(uCosLuna - 0.00004, uCosLuna + 0.00004, l));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function creaCupola() {
  const materiale = new THREE.ShaderMaterial({
    uniforms: {
      uOrizzonte: { value: new THREE.Color() }, uZenit: { value: new THREE.Color() },
      uAlone: { value: new THREE.Color() }, uColoreSole: { value: new THREE.Color() },
      uColoreLuna: { value: CICLO.colori.discoLuna.clone() },
      uDirSole: { value: new THREE.Vector3(0, 1, 0) }, uDirLuna: { value: new THREE.Vector3(0, 1, 0) },
      uCrepuscolo: { value: 0 }, uSole: { value: 0 }, uLuna: { value: 0 },
      uCosSole: { value: Math.cos(RAGGIO_SOLE) }, uCosLuna: { value: Math.cos(RAGGIO_LUNA) },
    },
    vertexShader: VERTICI_CUPOLA, fragmentShader: FRAMMENTI_CUPOLA,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const cupola = new THREE.Mesh(new THREE.SphereGeometry(RAGGIO_CUPOLA, 48, 24), materiale);
  cupola.name = 'cielo-cupola';
  cupola.renderOrder = 1000;               // ultima tra gli opachi (i trasparenti vengono comunque dopo)
  cupola.frustumCulled = false;
  // Segue la camera (qualunque camera la disegni: anche quella del percorso di prova).
  cupola.onBeforeRender = (_r, _s, cam) => { cupola.position.copy(cam.position); cupola.updateMatrixWorld(); };
  return cupola;
}

// ─── Stelle ───
// ~2000 punti su una sfera dentro la cupola, disegnati dopo di lei e con il test di profondità (il terreno le copre).
// Luminosità e colore per stella, fascia più fitta come la Via Lattea, cielo che si svuota verso l'orizzonte
// (foschia). Sorgono e tramontano col tempo: tutto il cielo ruota attorno alla stella polare, come quello vero.
// Niente texture, una sola chiamata di disegno.
const STELLE = {
  numero: 2400,
  raggio: 120000,                          // m: dentro la cupola (125 km)
  dimensione: 2.3,                         // px (a risoluzione piena) della stella più luminosa
  latitudine: 44,                          // gradi: altezza della polare sull'orizzonte (come l'Italia centrale)
  viaLattea: 0.45,                         // quota di stelle addensate nella fascia
};

const VERTICI_STELLE = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uScala, uNotte;
  attribute float aLum;
  varying vec3 vCol;
  varying float vFuoco;
  void main() {
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    // Verso l'orizzonte la foschia le spegne; sotto l'orizzonte non ci sono.
    vec3 d = normalize(position);
    float basse = smoothstep(0.015, 0.22, d.y);
    vFuoco = uNotte * basse * aLum;
    vCol = color;
    gl_PointSize = uScala * (0.55 + 0.75 * aLum);
    #include <logdepthbuf_vertex>
  }`;
const FRAMMENTI_STELLE = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vCol;
  varying float vFuoco;
  void main() {
    #include <logdepthbuf_fragment>
    if (vFuoco <= 0.002) discard;
    // Disco morbido: piena al centro, spenta al bordo del punto (niente texture).
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = vFuoco * (1.0 - smoothstep(0.35, 1.0, r));
    gl_FragColor = vec4(vCol * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Numeri casuali ripetibili: le stelle sono le stesse ogni notte e in ogni partita. */
function _rng(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function creaStelle() {
  const n = STELLE.numero;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), lum = new Float32Array(n);
  const r = _rng(20261122);
  const _v = new THREE.Vector3();
  // Colore per temperatura: la maggior parte bianco-azzurre, poche giallo-arancio.
  const caldo = new THREE.Color('#ffd0a0'), freddo = new THREE.Color('#cfe0ff'), _c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // Direzione in coordinate del cielo: distribuzione uniforme sulla sfera, più una fascia densa (Via Lattea).
    let x, y, z;
    if (r() < STELLE.viaLattea) {
      const t = r() * Math.PI * 2;
      // Fascia stretta attorno a un piano inclinato: somma di due sorteggi = addensamento al centro.
      const b = (r() + r() - 1) * 0.30;
      x = Math.cos(t); y = b; z = Math.sin(t);
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
      // Inclinazione della fascia rispetto all'equatore celeste.
      const inc = 62 * _gradi, ci = Math.cos(inc), si = Math.sin(inc);
      const y2 = y * ci - z * si, z2 = y * si + z * ci;
      y = y2; z = z2;
    } else {
      const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      x = s * Math.cos(t); y = u; z = s * Math.sin(t);
    }
    _v.set(x, y, z).multiplyScalar(STELLE.raggio);
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    // Poche stelle luminose, molte deboli (curva ripida come le magnitudini vere).
    lum[i] = Math.pow(r(), 2.6);
    _c.copy(freddo).lerp(caldo, Math.pow(r(), 2));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLum', new THREE.BufferAttribute(lum, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STELLE.raggio * 1.01);
  const materiale = new THREE.ShaderMaterial({
    uniforms: { uScala: { value: STELLE.dimensione }, uNotte: { value: 0 } },
    vertexShader: VERTICI_STELLE, fragmentShader: FRAMMENTI_STELLE,
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, fog: false,
  });
  const stelle = new THREE.Points(geo, materiale);
  stelle.name = 'cielo-stelle';
  stelle.renderOrder = 1001;               // dopo la cupola (nessuna delle due scrive la profondità)
  stelle.frustumCulled = false;
  // L'asse del cielo punta alla polare: alto sull'orizzonte verso nord (-Z), inclinato come la latitudine.
  stelle.rotation.order = 'YXZ';
  stelle.rotation.x = (90 - STELLE.latitudine) * _gradi;
  stelle.onBeforeRender = (_r, _s, cam) => { stelle.position.copy(cam.position); stelle.updateMatrixWorld(); };
  return stelle;
}

/**
 * Crea luci, sfondo e nebbia della scena.
 * @returns {{ sole: THREE.DirectionalLight, luna: THREE.DirectionalLight, emisfera: THREE.HemisphereLight,
 *   readonly luceGiorno: number, aggiorna(ora: number): boolean, invalida(): void,
 *   aggiornaNebbia(camera: THREE.Camera, punto: THREE.Vector3, conOrizzonte: boolean, seme: number, giorni: number): void }}
 */
export function creaCielo(scene, renderer = null) {
  scene.background = new THREE.Color(COLORE_CIELO);
  scene.fog = new THREE.Fog(COLORE_CIELO, NEBBIA[0], NEBBIA[1]);

  // ─── Luci: sole che segue l'ora del giorno, luna, luce emisferica cielo/terra ───
  // Di giorno sole forte e luce ambiente contenuta: il rilievo collinare si legge dal chiaroscuro.
  // Il colore "da terra" è la luce riflessa dal suolo: schiarisce le pareti verticali in ombra (mura,
  // cavaliere) e quasi non tocca il terreno, le cui facce guardano in alto.
  // Di notte una luna fredda e fissa (alta a sud-est) lascia il paesaggio scuro ma leggibile: niente shadow map in
  // tutto il motore, quindi la sua luce arriva al suolo anche sotto la chioma del bosco.
  const emisfera = new THREE.HemisphereLight('#dce8ec', '#8a7550', 0.45);
  scene.add(emisfera);
  const sole = new THREE.DirectionalLight('#fff0d4', 3.4);
  sole.position.set(-700, 420, 500);
  scene.add(sole);
  const luna = new THREE.DirectionalLight('#9fb4dc', 0);
  luna.position.set(600, 700, 750);
  scene.add(luna);
  const cupola = creaCupola();
  scene.add(cupola);
  const U = cupola.material.uniforms;
  U.uDirLuna.value.copy(luna.position).normalize();
  const stelle = creaStelle();
  scene.add(stelle);
  const S = stelle.material.uniforms;

  const _col = new THREE.Color();
  let _oraCielo = -1;
  let _luceGiorno = 1;                     // 0 notte → 1 giorno: la usa anche la nebbia

  /** Luci e colori per l'ora del giorno. Restituisce false se l'ora è quasi la stessa dell'ultima volta. */
  function aggiorna(ora) {
    if (Math.abs(ora - _oraCielo) < 0.002) return false;  // ~7 s di gioco: niente da ridisegnare
    _oraCielo = ora;
    const { altezza, azimut } = posizioneSole(ora);
    const C = CICLO.colori;
    // 0 notte → 1 pieno giorno. La luce sale piano (pieno giorno a 14°, il sole pieno a 20°): la prima ora dopo
    // l'alba ha luce bassa e calda e ombre lunghe (deciso con l'utente, 28/11/2026; prima 8° e 10°).
    const giorno = smoothstep(-5, 14, altezza);
    _luceGiorno = giorno;
    // La luce ambiente (emisfera) sale prima del sole: sotto la chioma del bosco è l'unica luce che arriva, e con la
    // curva del sole il sottobosco restava quasi nero per due ore (deciso con l'utente, 28/11/2026). Il sole mantiene
    // la sua curva lunga: ombre lunghe e luce calda all'alba restano.
    const ambiente = smoothstep(-5, 8, altezza);
    const crepuscolo = Math.max(0, 1 - Math.abs(altezza - 1) / 9) * smoothstep(-8, -2, altezza);

    const a = altezza * _gradi, z = azimut * _gradi;
    sole.position.set(Math.sin(z) * Math.cos(a), Math.max(Math.sin(a), 0.02), -Math.cos(z) * Math.cos(a))
      .multiplyScalar(1000);
    sole.intensity = CICLO.soleMax * smoothstep(-2, 20, altezza);
    sole.color.copy(C.soleGiorno).lerp(C.soleBasso, 1 - smoothstep(4, 26, altezza));
    luna.intensity = CICLO.lunaMax * (1 - giorno);

    emisfera.intensity = THREE.MathUtils.lerp(CICLO.emisferaNotte, CICLO.emisferaGiorno, ambiente);
    emisfera.color.copy(C.emisferaCieloNotte).lerp(C.emisferaCieloGiorno, ambiente);
    emisfera.groundColor.copy(C.emisferaTerraNotte).lerp(C.emisferaTerraGiorno, ambiente);

    _col.copy(C.cieloNotte).lerp(C.cieloGiorno, giorno).lerp(C.cieloCrepuscolo, crepuscolo * 0.75);
    scene.background.copy(_col);
    scene.fog.color.copy(_col);

    U.uOrizzonte.value.copy(_col);
    U.uZenit.value.copy(C.zenitNotte).lerp(C.zenitGiorno, giorno).lerp(C.zenitCrepuscolo, crepuscolo * 0.6);
    U.uAlone.value.copy(C.alonCrepuscolo);
    U.uCrepuscolo.value = Math.max(crepuscolo, 1 - smoothstep(2, 14, Math.abs(altezza))) * smoothstep(-8, -1, altezza);
    // Direzione vera del sole (anche sotto l'orizzonte: il disco scende dietro i monti).
    U.uDirSole.value.set(Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a));
    U.uColoreSole.value.copy(sole.color);
    U.uSole.value = smoothstep(-3, 2, altezza);
    U.uLuna.value = 1 - giorno;

    // Stelle: si accendono col buio (prima le più luminose: la scala non è lineare) e girano con l'ora.
    S.uNotte.value = Math.pow(1 - smoothstep(-12, 2, altezza), 1.4);
    S.uScala.value = STELLE.dimensione * (renderer ? renderer.getPixelRatio() : 1);
    // Un giro completo in 24 ore, verso ovest (orario visto da sotto la polare).
    stelle.rotation.y = -ora / 24 * Math.PI * 2;
    return true;
  }

  // Nebbia: da vicino nasconde il bordo del mondo; allontanandosi si ritira per la vista d'insieme.
  // Di notte la nebbia, del colore del cielo notturno, si stringe: si vede bene solo attorno al punto
  // osservato. Le luci di case, castello e fuochi (future) dovranno ignorarla per restare visibili da lontano.
  function aggiornaNebbia(camera, puntoOsservato, conOrizzonte, seme, giorni) {
    const dist = camera.position.distanceTo(puntoOsservato);
    const nebbia = conOrizzonte ? [NEBBIA_ORIZZONTE_INIZIO, visibilitaDelGiorno(seme, giorni)] : NEBBIA;
    const nearGiorno = Math.max(nebbia[0], dist * 0.9);
    const farGiorno = Math.max(nebbia[1], nearGiorno + 3000);
    const g = _luceGiorno * _luceGiorno;   // la vista si allunga solo quando la luce è davvero tornata
    scene.fog.near = THREE.MathUtils.lerp(dist + CICLO.vicinoNotte, nearGiorno, g);
    scene.fog.far = THREE.MathUtils.lerp(dist + CICLO.lontanoNotte, farGiorno, g);
  }

  return {
    sole, luna, emisfera, cupola, stelle,
    get luceGiorno() { return _luceGiorno; },
    aggiorna,
    /** Forza il ricalcolo al prossimo aggiorna (nuova Scena: luci proprie di castello e mura). */
    invalida() { _oraCielo = -1; },
    aggiornaNebbia,
  };
}
