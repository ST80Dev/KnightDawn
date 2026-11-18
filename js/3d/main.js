// Knight Dawn — motore 3D: renderer, scena, luci, render loop, contatore FPS (F3).
// Milestone M1: terreno reale (o procedurale) ispezionabile con la camera libera di debug.
// Unità: 1 unità Three.js = 1 metro, asse Y verso l'alto, nord verso -Z.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadTerrain } from './terrain.js';

const COLORE_CIELO = '#c4d4d6';           // azzurro-pergamena, uguale alla nebbia
const NEBBIA = [600, 2000];               // m: inizio e fine della nebbia lineare

// ─── Renderer, scena, camera ────────────────────────────────────────────
const canvas = document.getElementById('scena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORE_CIELO);
scene.fog = new THREE.Fog(COLORE_CIELO, NEBBIA[0], NEBBIA[1]);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 5000);

// ─── Luci: sole del pomeriggio (da sud-ovest) + luce emisferica cielo/terra ───
// Sole abbastanza basso e luce ambiente contenuta: il rilievo collinare si legge dal chiaroscuro.
const cielo = new THREE.HemisphereLight('#dce8ec', '#5a4a30', 0.7);
scene.add(cielo);
const sole = new THREE.DirectionalLight('#fff0d4', 3.0);
sole.position.set(-700, 500, 500);
scene.add(sole);

// ─── HUD ────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud');
function avvisoHud(testo, classe = 'avviso') {
  const el = document.createElement('div');
  el.className = classe;
  el.textContent = testo;
  hud.appendChild(el);
  return el;
}

// ─── Terreno + camera libera di debug ───────────────────────────────────
let terrain = null;
let controls = null;
const ALTEZZA_MIN_CAMERA = 3;             // m sopra il terreno

async function init() {
  terrain = await loadTerrain('tavullia');
  scene.add(terrain.mesh);
  if (terrain.isFallback) {
    avvisoHud('Dati del terreno reale non trovati: terreno procedurale di prova.');
  }

  const y0 = terrain.getHeight(0, 0);
  // Da sud verso nord, come guardare una mappa: il nord è in alto/lontano.
  camera.position.set(-250, y0 + 420, 900);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, y0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;    // il trascinamento col tasto destro scorre sul piano orizzontale
  controls.minDistance = 5;
  controls.maxDistance = 1800;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.update();

  window.kd = { scene, camera, controls, terrain };   // per ispezione dalla console del browser

  avvisoHud('Camera di debug — trascina: ruota · tasto destro: sposta · rotella: zoom · F3: info', 'aiuto');
}

// Dopo ogni aggiornamento della camera: il punto osservato resta dentro l'area e appoggiato
// al terreno, e la camera non scende mai sotto la superficie.
function vincolaCamera() {
  const t = controls.target;
  const h = terrain.half;
  t.x = THREE.MathUtils.clamp(t.x, -h, h);
  t.z = THREE.MathUtils.clamp(t.z, -h, h);
  const dy = terrain.getHeight(t.x, t.z) - t.y;
  t.y += dy;
  camera.position.y += dy;                 // sposta insieme camera e bersaglio: niente scatti
  const minY = terrain.getHeight(camera.position.x, camera.position.z) + ALTEZZA_MIN_CAMERA;
  if (camera.position.y < minY) camera.position.y = minY;

  // Nebbia: da vicino nasconde il bordo del mondo; allontanandosi si ritira per la vista d'insieme.
  const dist = camera.position.distanceTo(t);
  scene.fog.near = Math.max(NEBBIA[0], dist * 0.9);
  scene.fog.far = Math.max(NEBBIA[1], scene.fog.near + 1600);
}

// ─── Resize ─────────────────────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ─── Pannello F3: FPS + quota e pendenza sotto il cursore ───────────────
const fpsEl = document.getElementById('fps');
const FPS_INTERVALLO_MS = 500;             // ogni quanto aggiornare il valore mostrato
let fpsFrame = 0;
let fpsT0 = performance.now();
let rigaFps = '… FPS';
fpsEl.textContent = rigaFps;

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();                    // in alcuni browser F3 apre la ricerca
    fpsEl.hidden = !fpsEl.hidden;
  }
});

const mouse = new THREE.Vector2();
let mouseDentro = false;
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouseDentro = true;
});
renderer.domElement.addEventListener('pointerleave', () => { mouseDentro = false; });

// Punto del terreno sotto il cursore: avanza lungo il raggio finché scende sotto la superficie,
// poi raffina per bisezione. Usa solo getHeight (nessun raycast sui 130 000 triangoli).
const raycaster = new THREE.Raycaster();
const _p = new THREE.Vector3();
function puntoSottoCursore() {
  raycaster.setFromCamera(mouse, camera);
  const { origin, direction } = raycaster.ray;
  const PASSO = 2, MAX = 4000;
  let prev = 0;
  for (let s = PASSO; s <= MAX; s += PASSO) {
    _p.copy(direction).multiplyScalar(s).add(origin);
    if (!terrain.contains(_p.x, _p.z) && s > 50 && _p.y < terrain.minElev) return null;
    if (_p.y <= terrain.getHeight(_p.x, _p.z)) {
      let lo = prev, hi = s;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        _p.copy(direction).multiplyScalar(mid).add(origin);
        if (_p.y <= terrain.getHeight(_p.x, _p.z)) hi = mid; else lo = mid;
      }
      _p.copy(direction).multiplyScalar(hi).add(origin);
      return terrain.contains(_p.x, _p.z) ? _p : null;
    }
    prev = s;
  }
  return null;
}

const fmt = (n, d = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

function aggiornaPannello(now) {
  fpsFrame++;
  const dt = now - fpsT0;
  if (dt >= FPS_INTERVALLO_MS) {
    rigaFps = `${Math.round((fpsFrame * 1000) / dt)} FPS · ${(dt / fpsFrame).toFixed(1)} ms`;
    fpsFrame = 0;
    fpsT0 = now;
  }
  if (fpsEl.hidden) return;
  let testo = rigaFps;
  if (terrain) {
    testo += `\nterreno: ${terrain.meta.source} · ${fmt(terrain.minElev)}–${fmt(terrain.maxElev)} m`;
    const p = mouseDentro ? puntoSottoCursore() : null;
    testo += p
      ? `\ncursore: x ${fmt(p.x)} · z ${fmt(p.z)} · quota ${fmt(terrain.getHeight(p.x, p.z), 1)} m`
        + ` · pendenza ${fmt(terrain.getSlope(p.x, p.z))}°`
      : '\ncursore: —';
  }
  fpsEl.textContent = testo;
}

// ─── Render loop ────────────────────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame);
  if (controls) {
    controls.update();
    vincolaCamera();
  }
  aggiornaPannello(now);
  renderer.render(scene, camera);
}

camera.position.set(0, 300, 900);          // vista provvisoria mentre il terreno si carica
init().catch((err) => {
  console.error('[init]', err);
  avvisoHud(`Errore di avvio: ${err.message}`);
});
requestAnimationFrame(frame);
