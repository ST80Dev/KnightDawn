// Knight Dawn — scheletro 3D (milestone M0)
// Scena di prova: cielo, una luce, un piano. Render loop, resize, contatore FPS (F3).
// Unità: 1 unità Three.js = 1 metro, asse Y verso l'alto.

import * as THREE from 'three';

// Colori: dalla palette di config.js se disponibile (globale degli script classici).
const PAL = (typeof PALETTE !== 'undefined') ? PALETTE : {};
const COLORE_CIELO = '#b7cdd3';                      // azzurro-pergamena
const COLORE_PIANO = PAL.verdePrato || '#9ec060';

// ─── Renderer, scena, camera ────────────────────────────────────────────
const canvas = document.getElementById('scena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORE_CIELO);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 12, 30);
camera.lookAt(0, 0, 0);

// ─── Luce ───────────────────────────────────────────────────────────────
const sole = new THREE.DirectionalLight('#fff4dc', 2.5);
sole.position.set(40, 80, 30);
scene.add(sole);

// ─── Piano di prova ─────────────────────────────────────────────────────
const piano = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: COLORE_PIANO }),
);
piano.rotation.x = -Math.PI / 2;   // il piano di default è verticale: lo stendiamo su XZ
scene.add(piano);

// ─── Resize ─────────────────────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ─── Contatore FPS (F3) ─────────────────────────────────────────────────
const fpsEl = document.getElementById('fps');
const FPS_INTERVALLO_MS = 500;     // ogni quanto aggiornare il valore mostrato
let fpsFrame = 0;
let fpsT0 = performance.now();
fpsEl.textContent = '… FPS';

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();             // in alcuni browser F3 apre la ricerca
    fpsEl.hidden = !fpsEl.hidden;
  }
});

function aggiornaFps(now) {
  fpsFrame++;
  const dt = now - fpsT0;
  if (dt >= FPS_INTERVALLO_MS) {
    if (!fpsEl.hidden) {
      const fps = (fpsFrame * 1000) / dt;
      fpsEl.textContent = `${Math.round(fps)} FPS · ${(dt / fpsFrame).toFixed(1)} ms`;
    }
    fpsFrame = 0;
    fpsT0 = now;
  }
}

// ─── Render loop ────────────────────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame);
  aggiornaFps(now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
