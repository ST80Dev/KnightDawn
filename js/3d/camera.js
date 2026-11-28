// Knight Dawn — camera in terza persona (milestone M3)
// Camera bassa e vicina, sopra la spalla destra del cavaliere, che guarda sempre nella direzione
// in cui guarda lui: l'idea è quella di una "quasi prima persona", non di girargli attorno.
//
// Mouse: trascinamento orizzontale = gira il cavaliere (la camera lo segue); verticale = alza o
// abbassa lo sguardo; rotella = distanza. La camera non scende mai sotto il terreno e non entra
// nei muri (M4): se un edificio si mette tra il cavaliere e la camera, la camera si avvicina.

import * as THREE from 'three';

/** Parametri della camera: modificabili dalla console (kd.cam.cfg) per le prove. */
export const CAMERA_CFG = {
  distanza: 4.2,          // m dal perno (all'altezza delle spalle)
  distanzaMin: 1.4,
  distanzaMax: 12,
  altezzaPerno: 1.6,      // m sopra i piedi del cavaliere
  spalla: 0.7,            // m di spostamento a destra: il cavaliere non copre il centro della vista
  // In sella (milestone Cavallo): la camera gira attorno al perno verso un lato (rad, + = da destra, − = da sinistra) e si
  // allontana di `aggiunta` m oltre la distanza scelta con la rotella. A piedi restano 0 (main.js, aggiornaCameraSella).
  angolo: 0,
  aggiunta: 0,
  inclinazione: 0.28,     // rad: 0 = camera all'altezza del perno; positivo = più alta, sguardo verso il basso
  inclinazioneMin: -0.3,
  inclinazioneMax: 0.9,
  guardaAvanti: 10,       // m: punto osservato davanti al cavaliere
  sensibilita: 0.004,     // rad per pixel di trascinamento
  rapiditaGiro: 12,       // 1/s: quanto in fretta la camera si riallinea alle spalle
  rapiditaQuota: 8,       // 1/s: smorza i piccoli scalini di quota del terreno
  margineTerreno: 0.45,   // m minimi tra camera (e linea di vista) e terreno
  margineMuri: 0.35,      // m minimi tra camera e muri degli edifici
  rapiditaRitorno: 3,     // 1/s: quanto in fretta la camera torna indietro dopo un muro
};

const avvicina = (rate, dt) => 1 - Math.exp(-rate * dt);

function angoloTra(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} terrain  getHeight(x, z)
 * @param {object} knight   createKnight(): stato.{x, y, z, direzione}
 * @param {HTMLElement} dom elemento che riceve mouse e rotella (il canvas)
 * @param {THREE.Object3D[]} [occlusori] mesh solide (mura, torri…) in cui la camera non deve entrare
 */
export function createFollowCamera(camera, terrain, knight, dom, occlusori = []) {
  const cfg = { ...CAMERA_CFG };
  const k = knight.stato;
  const stato = {
    attiva: true,
    yaw: k.direzione,
    perY: k.y + cfg.altezzaPerno,
    giroMouse: 0,          // rad accumulati dal trascinamento, consumati dal cavaliere a ogni frame
    trascina: false,
    distanzaLibera: cfg.distanza,   // distanza effettiva, accorciata quando un muro è alle spalle
    spallaLibera: cfg.spalla,       // spostamento a destra effettivo, ridotto con un muro a destra
  };

  // ─── Mouse ───
  let ultimoX = 0, ultimoY = 0;
  dom.addEventListener('pointerdown', (e) => {
    if (!stato.attiva || (e.button !== 0 && e.button !== 2)) return;
    stato.trascina = true;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (!stato.attiva || !stato.trascina) return;
    const dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    stato.giroMouse += dx * cfg.sensibilita;
    cfg.inclinazione = THREE.MathUtils.clamp(cfg.inclinazione + dy * cfg.sensibilita,
      cfg.inclinazioneMin, cfg.inclinazioneMax);
  });
  const fine = (e) => {
    stato.trascina = false;
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
  };
  dom.addEventListener('pointerup', fine);
  dom.addEventListener('pointercancel', fine);
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('wheel', (e) => {
    if (!stato.attiva) return;
    e.preventDefault();
    cfg.distanza = THREE.MathUtils.clamp(cfg.distanza * Math.exp(e.deltaY * 0.0012),
      cfg.distanzaMin, cfg.distanzaMax);
  }, { passive: false });

  /** Rotazione chiesta col mouse dall'ultimo frame (rad, positivo = verso destra). */
  function prendiGiroMouse() {
    const g = stato.giroMouse;
    stato.giroMouse = 0;
    return g;
  }

  // ─── Posizionamento ───
  const perno = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const mira = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3();
  const DISTANZA_MIN = 0.15;   // m: a ridosso di un muro la camera arriva quasi alla spalla

  /** Valore che scatta subito verso il basso (muro) e risale con calma (niente avanti e indietro). */
  function frena(attuale, limite, dt, immediato) {
    if (immediato || limite < attuale) return limite;
    return attuale + (limite - attuale) * avvicina(cfg.rapiditaRitorno, dt);
  }

  /** Distanza del primo muro lungo il raggio (origine, direzione unitaria), entro `max`; altrimenti Infinity. */
  function primoMuro(origine, direzione, max) {
    if (!occlusori.length) return Infinity;
    raycaster.set(origine, direzione);
    raycaster.far = max;
    const hit = raycaster.intersectObjects(occlusori, false);
    return hit.length ? hit[0].distance : Infinity;
  }

  function update(dt, immediato = false) {
    const a = immediato ? 1 : avvicina(cfg.rapiditaGiro, dt);
    stato.yaw += angoloTra(stato.yaw, k.direzione) * a;
    stato.perY += (k.y + cfg.altezzaPerno - stato.perY) * (immediato ? 1 : avvicina(cfg.rapiditaQuota, dt));

    // avanti = (sin yaw, cos yaw); destra = avanti × su = (-avanti.z, avanti.x)
    const fx = Math.sin(stato.yaw), fz = Math.cos(stato.yaw);
    const rx = -fz, rz = fx;
    // Spalla: se il cavaliere ha un muro subito a destra, il perno si accosta al centro
    _c.set(k.x, stato.perY, k.z);                       // centro del cavaliere all'altezza del perno
    const muroDestra = primoMuro(_c, _d.set(rx, 0, rz), cfg.spalla + cfg.margineMuri);
    stato.spallaLibera = frena(stato.spallaLibera,
      Math.min(cfg.spalla, Math.max(0, muroDestra - cfg.margineMuri)), dt, immediato);
    perno.set(k.x + rx * stato.spallaLibera, stato.perY, k.z + rz * stato.spallaLibera);

    // Distanza: se un muro sta tra il cavaliere e la camera, la camera si porta subito davanti
    // al muro, poi torna indietro con calma quando il muro non c'è più. Si controllano due raggi,
    // dal perno e dal centro del cavaliere, così uno spigolo non si infila tra camera e cavaliere.
    const inc = cfg.inclinazione;
    // Dietro, ruotato di cfg.angolo verso il lato (destra: (rx, rz))
    const ca = Math.cos(cfg.angolo), sa = Math.sin(cfg.angolo);
    const bx = -fx * ca + rx * sa, bz = -fz * ca + rz * sa;
    const distanza = cfg.distanza + cfg.aggiunta;
    _d.set(bx * Math.cos(inc), Math.sin(inc), bz * Math.cos(inc));
    let limite = Math.min(distanza, primoMuro(perno, _d, distanza + cfg.margineMuri) - cfg.margineMuri);
    if (occlusori.length) {
      _t.copy(perno).addScaledVector(_d, distanza).sub(_c);          // centro → camera a piena distanza
      const lt = _t.length();
      const muro = primoMuro(_c, _t.normalize(), lt + cfg.margineMuri);
      if (muro < Infinity) limite = Math.min(limite, distanza * (muro - cfg.margineMuri) / lt);
    }
    stato.distanzaLibera = frena(stato.distanzaLibera, Math.max(DISTANZA_MIN, limite), dt, immediato);
    pos.copy(perno).addScaledVector(_d, stato.distanzaLibera);

    // Linea di vista perno → camera sopra il terreno: se un punto intermedio è sotto,
    // alza la camera quanto basta (scavalca il dosso alle spalle invece di entrarci).
    let alza = 0;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const px = perno.x + (pos.x - perno.x) * t;
      const pz = perno.z + (pos.z - perno.z) * t;
      const py = perno.y + (pos.y - perno.y) * t;
      const deficit = terrain.getHeight(px, pz) + cfg.margineTerreno - py;
      if (deficit > 0) alza = Math.max(alza, deficit / t);
    }
    pos.y += alza;
    const minY = terrain.getHeight(pos.x, pos.z) + cfg.margineTerreno;
    if (pos.y < minY) pos.y = minY;
    camera.position.copy(pos);

    // Punto osservato davanti al cavaliere; con l'inclinazione lo sguardo scende o sale
    const avanti = cfg.guardaAvanti;
    mira.set(perno.x + fx * avanti, perno.y - avanti * Math.tan(inc) * 0.5, perno.z + fz * avanti);
    camera.lookAt(mira);
  }

  /** Riattiva la camera dopo la modalità libera, già alle spalle del cavaliere. */
  function riattiva() {
    stato.attiva = true;
    update(0, true);
  }

  update(0, true);

  return {
    cfg, stato, update, prendiGiroMouse, riattiva,
    disattiva() { stato.attiva = false; stato.trascina = false; },
    /** Punto osservato: serve alla nebbia e alla camera libera. */
    get mira() { return mira; },
  };
}
