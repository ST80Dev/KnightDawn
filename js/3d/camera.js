// Knight Dawn — camera in terza persona (milestone M3)
// Camera bassa e vicina, sopra la spalla destra del cavaliere, che guarda sempre nella direzione
// in cui guarda lui: l'idea è quella di una "quasi prima persona", non di girargli attorno.
//
// Mouse: trascinamento orizzontale = gira il cavaliere (la camera lo segue); verticale = alza o
// abbassa lo sguardo; rotella = distanza. La camera non scende mai sotto il terreno.

import * as THREE from 'three';

/** Parametri della camera: modificabili dalla console (kd.cam.cfg) per le prove. */
export const CAMERA_CFG = {
  distanza: 4.2,          // m dal perno (all'altezza delle spalle)
  distanzaMin: 1.4,
  distanzaMax: 12,
  altezzaPerno: 1.6,      // m sopra i piedi del cavaliere
  spalla: 0.7,            // m di spostamento a destra: il cavaliere non copre il centro della vista
  inclinazione: 0.28,     // rad: 0 = camera all'altezza del perno; positivo = più alta, sguardo verso il basso
  inclinazioneMin: -0.3,
  inclinazioneMax: 0.9,
  guardaAvanti: 10,       // m: punto osservato davanti al cavaliere
  sensibilita: 0.004,     // rad per pixel di trascinamento
  rapiditaGiro: 12,       // 1/s: quanto in fretta la camera si riallinea alle spalle
  rapiditaQuota: 8,       // 1/s: smorza i piccoli scalini di quota del terreno
  margineTerreno: 0.45,   // m minimi tra camera (e linea di vista) e terreno
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
 */
export function createFollowCamera(camera, terrain, knight, dom) {
  const cfg = { ...CAMERA_CFG };
  const k = knight.stato;
  const stato = {
    attiva: true,
    yaw: k.direzione,
    perY: k.y + cfg.altezzaPerno,
    giroMouse: 0,          // rad accumulati dal trascinamento, consumati dal cavaliere a ogni frame
    trascina: false,
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

  function update(dt, immediato = false) {
    const a = immediato ? 1 : avvicina(cfg.rapiditaGiro, dt);
    stato.yaw += angoloTra(stato.yaw, k.direzione) * a;
    stato.perY += (k.y + cfg.altezzaPerno - stato.perY) * (immediato ? 1 : avvicina(cfg.rapiditaQuota, dt));

    // avanti = (sin yaw, cos yaw); destra = avanti × su = (-avanti.z, avanti.x)
    const fx = Math.sin(stato.yaw), fz = Math.cos(stato.yaw);
    const rx = -fz, rz = fx;
    perno.set(k.x + rx * cfg.spalla, stato.perY, k.z + rz * cfg.spalla);

    const inc = cfg.inclinazione;
    const orizz = cfg.distanza * Math.cos(inc);
    pos.set(perno.x - fx * orizz, perno.y + cfg.distanza * Math.sin(inc), perno.z - fz * orizz);

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
