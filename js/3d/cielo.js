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
    sole, luna, emisfera,
    get luceGiorno() { return _luceGiorno; },
    aggiorna,
    /** Forza il ricalcolo al prossimo aggiorna (nuova Scena: luci proprie di castello e mura). */
    invalida() { _oraCielo = -1; },
    aggiornaNebbia,
  };
}
