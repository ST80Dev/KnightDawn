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

// Ciclo del giorno (valori provvisori, senza stagioni): alba alle 5, tramonto alle 20, sole al
// massimo a 55° verso le 12:30. Di notte la "quota" del sole scende sotto l'orizzonte fino a −35°.
export const CICLO = {
  alba: 5, tramonto: 20, altezzaMax: 55, profonditaNotte: 35,
  soleMax: 3.4, lunaMax: 0.45,
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
    emisferaTerraGiorno: new THREE.Color('#8a7550'), emisferaTerraNotte: new THREE.Color('#2c2a2a'),
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

/**
 * Crea luci, sfondo e nebbia della scena.
 * @returns {{ sole: THREE.DirectionalLight, luna: THREE.DirectionalLight, emisfera: THREE.HemisphereLight,
 *   readonly luceGiorno: number, aggiorna(ora: number): boolean, invalida(): void,
 *   aggiornaNebbia(camera: THREE.Camera, punto: THREE.Vector3, conOrizzonte: boolean, seme: number, giorni: number): void }}
 */
export function creaCielo(scene) {
  scene.background = new THREE.Color(COLORE_CIELO);
  scene.fog = new THREE.Fog(COLORE_CIELO, NEBBIA[0], NEBBIA[1]);

  // ─── Luci: sole che segue l'ora del giorno, luna, luce emisferica cielo/terra ───
  // Di giorno sole forte e luce ambiente contenuta: il rilievo collinare si legge dal chiaroscuro.
  // Il colore "da terra" è la luce riflessa dal suolo: schiarisce le pareti verticali in ombra (mura,
  // cavaliere) e quasi non tocca il terreno, le cui facce guardano in alto.
  // Di notte una luna fredda e fissa (alta a sud-est) lascia il paesaggio scuro ma leggibile.
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

  const _col = new THREE.Color();
  let _oraCielo = -1;
  let _luceGiorno = 1;                     // 0 notte → 1 giorno: la usa anche la nebbia

  /** Luci e colori per l'ora del giorno. Restituisce false se l'ora è quasi la stessa dell'ultima volta. */
  function aggiorna(ora) {
    if (Math.abs(ora - _oraCielo) < 0.002) return false;  // ~7 s di gioco: niente da ridisegnare
    _oraCielo = ora;
    const { altezza, azimut } = posizioneSole(ora);
    const C = CICLO.colori;
    const giorno = smoothstep(-5, 8, altezza);             // 0 notte → 1 pieno giorno
    _luceGiorno = giorno;
    const crepuscolo = Math.max(0, 1 - Math.abs(altezza - 1) / 9) * smoothstep(-8, -2, altezza);

    const a = altezza * _gradi, z = azimut * _gradi;
    sole.position.set(Math.sin(z) * Math.cos(a), Math.max(Math.sin(a), 0.02), -Math.cos(z) * Math.cos(a))
      .multiplyScalar(1000);
    sole.intensity = CICLO.soleMax * smoothstep(-2, 10, altezza);
    sole.color.copy(C.soleGiorno).lerp(C.soleBasso, 1 - smoothstep(4, 20, altezza));
    luna.intensity = CICLO.lunaMax * (1 - giorno);

    emisfera.intensity = THREE.MathUtils.lerp(CICLO.emisferaNotte, CICLO.emisferaGiorno, giorno);
    emisfera.color.copy(C.emisferaCieloNotte).lerp(C.emisferaCieloGiorno, giorno);
    emisfera.groundColor.copy(C.emisferaTerraNotte).lerp(C.emisferaTerraGiorno, giorno);

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
    sole, luna, emisfera, cupola,
    get luceGiorno() { return _luceGiorno; },
    aggiorna,
    /** Forza il ricalcolo al prossimo aggiorna (nuova Scena: luci proprie di castello e mura). */
    invalida() { _oraCielo = -1; },
    aggiornaNebbia,
  };
}
