// Knight Dawn — motore 3D: renderer, scena, luci, render loop, contatore FPS (F3).
// Milestone M2: cavaliere che cammina sul terreno reale. La camera è ancora OrbitControls:
// segue il cavaliere (provvisorio, la camera in terza persona vera è M3) oppure, con C, è libera.
// Unità: 1 unità Three.js = 1 metro, asse Y verso l'alto, nord verso -Z.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadTerrain } from './terrain.js';
import { createKnight } from './knight3d.js';

const COLORE_CIELO = '#c4d4d6';           // azzurro-pergamena, uguale alla nebbia
const NEBBIA = [900, 4000];               // m: inizio e fine della nebbia lineare (foschia leggera)

// ─── Renderer, scena, camera ────────────────────────────────────────────
const canvas = document.getElementById('scena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORE_CIELO);
scene.fog = new THREE.Fog(COLORE_CIELO, NEBBIA[0], NEBBIA[1]);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, 5000);

// ─── Luci: sole del pomeriggio (da sud-ovest) + luce emisferica cielo/terra ───
// Sole abbastanza basso e luce ambiente contenuta: il rilievo collinare si legge dal chiaroscuro.
const cielo = new THREE.HemisphereLight('#dce8ec', '#4a3c26', 0.45);
scene.add(cielo);
const sole = new THREE.DirectionalLight('#fff0d4', 3.4);
sole.position.set(-700, 420, 500);
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

// ─── Terreno, cavaliere, camera ─────────────────────────────────────────
let terrain = null;
let knight = null;
let controls = null;
let modoCamera = 'segui';                 // 'segui' = insegue il cavaliere · 'libera' = debug (tasto C)
const ALTEZZA_MIN_CAMERA = { segui: 0.8, libera: 3 };   // m sopra il terreno
const DISTANZA_CAMERA = { segui: [2.5, 60], libera: [5, 1800] };
const DISTANZA_RIENTRO = 6;               // m: distanza della camera quando si torna a seguire

async function init() {
  terrain = await loadTerrain('tavullia');
  scene.add(terrain.mesh);
  if (terrain.isFallback) {
    avvisoHud('Dati del terreno reale non trovati: terreno procedurale di prova.');
  }

  // Il cavaliere parte al centro dell'area, rivolto a nord (-Z)
  knight = createKnight(terrain, { x: 0, z: 0, direzione: Math.PI });
  scene.add(knight.object);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;    // il trascinamento col tasto destro scorre sul piano orizzontale
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

  // Camera alle spalle del cavaliere (a sud, guardando verso nord)
  const mira = knight.puntoMira();
  controls.target.copy(mira);
  camera.position.set(mira.x, mira.y + 1.6, mira.z + 5.2);
  impostaModoCamera('segui');

  window.kd = { scene, camera, controls, terrain, knight };   // per ispezione dalla console del browser

  avvisoHud('WASD/frecce: muovi · Shift: corri · trascina: ruota · rotella: zoom · C: camera libera · F3: info', 'aiuto');
}

function impostaModoCamera(modo) {
  modoCamera = modo;
  const [min, max] = DISTANZA_CAMERA[modo];
  controls.minDistance = min;
  controls.maxDistance = max;
  controls.enablePan = modo === 'libera';  // seguendo il cavaliere il centro della vista è lui
  if (modo === 'segui') {
    // Riporta la camera vicino al cavaliere mantenendo la direzione da cui lo si guarda
    const mira = knight.puntoMira();
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.35, 1);
    dir.normalize();
    if (dir.y < 0.15) { dir.y = 0.15; dir.normalize(); }
    const dist = Math.min(camera.position.distanceTo(controls.target), DISTANZA_RIENTRO);
    controls.target.copy(mira);
    camera.position.copy(mira).addScaledVector(dir, Math.max(dist, min));
  }
}

// Seguendo: bersaglio e camera si spostano insieme al cavaliere, così l'angolo scelto col mouse resta.
const _mira = new THREE.Vector3();
function seguiCavaliere() {
  knight.puntoMira(_mira);
  const dx = _mira.x - controls.target.x, dy = _mira.y - controls.target.y, dz = _mira.z - controls.target.z;
  controls.target.copy(_mira);
  camera.position.x += dx;
  camera.position.y += dy;
  camera.position.z += dz;
}

// Dopo ogni aggiornamento della camera: niente camera sotto la superficie; in modalità libera
// il punto osservato resta dentro l'area e appoggiato al terreno.
function vincolaCamera() {
  const t = controls.target;
  if (modoCamera === 'libera') {
    const h = terrain.half;
    t.x = THREE.MathUtils.clamp(t.x, -h, h);
    t.z = THREE.MathUtils.clamp(t.z, -h, h);
    const dy = terrain.getHeight(t.x, t.z) - t.y;
    t.y += dy;
    camera.position.y += dy;               // sposta insieme camera e bersaglio: niente scatti
  }
  const minY = terrain.getHeight(camera.position.x, camera.position.z) + ALTEZZA_MIN_CAMERA[modoCamera];
  if (camera.position.y < minY) camera.position.y = minY;

  // Nebbia: da vicino nasconde il bordo del mondo; allontanandosi si ritira per la vista d'insieme.
  const dist = camera.position.distanceTo(t);
  scene.fog.near = Math.max(NEBBIA[0], dist * 0.9);
  scene.fog.far = Math.max(NEBBIA[1], scene.fog.near + 3000);
}

// ─── Tastiera ───────────────────────────────────────────────────────────
const tasti = new Set();
const TASTI_MOVIMENTO = {
  avanti:   ['KeyW', 'ArrowUp'],
  indietro: ['KeyS', 'ArrowDown'],
  sinistra: ['KeyA', 'ArrowLeft'],
  destra:   ['KeyD', 'ArrowRight'],
  corsa:    ['ShiftLeft', 'ShiftRight'],
};
const premuto = (azione) => TASTI_MOVIMENTO[azione].some((k) => tasti.has(k));

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault();
  tasti.add(e.code);
  if (e.code === 'KeyC' && !e.repeat && knight) {
    impostaModoCamera(modoCamera === 'segui' ? 'libera' : 'segui');
  }
});
window.addEventListener('keyup', (e) => tasti.delete(e.code));
window.addEventListener('blur', () => tasti.clear());   // niente tasti "incollati" cambiando finestra

// Direzione voluta nel mondo, relativa a dove guarda la camera (proiettata sul piano orizzontale).
const _avanti = new THREE.Vector3();
const _input = { x: 0, z: 0, corsa: false };
function leggiInput() {
  const f = (premuto('avanti') ? 1 : 0) - (premuto('indietro') ? 1 : 0);
  const l = (premuto('destra') ? 1 : 0) - (premuto('sinistra') ? 1 : 0);
  _input.x = 0;
  _input.z = 0;
  _input.corsa = premuto('corsa');
  if (f === 0 && l === 0) return _input;
  _avanti.subVectors(controls.target, camera.position).setY(0);
  if (_avanti.lengthSq() < 1e-8) _avanti.set(0, 0, -1);
  _avanti.normalize();
  // destra = avanti × su = (-avanti.z, 0, avanti.x)
  let x = _avanti.x * f - _avanti.z * l;
  let z = _avanti.z * f + _avanti.x * l;
  const len = Math.hypot(x, z);
  _input.x = x / len;
  _input.z = z / len;
  return _input;
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
  if (knight) {
    const k = knight.stato;
    testo += `\ncavaliere: x ${fmt(k.x)} · z ${fmt(k.z)} · quota ${fmt(k.y, 1)} m`
      + ` · pendenza ${fmt(terrain.getSlope(k.x, k.z))}° · ${fmt(k.velEffettiva, 1)} m/s`
      + (k.bloccato ? ' · bloccato' : '');
    testo += `\ncamera: ${modoCamera === 'segui' ? 'segue il cavaliere' : 'libera'}`;
  }
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
const DT_MAX = 0.1;                        // s: dopo una pausa (scheda in background) niente salti
let tPrec = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = THREE.MathUtils.clamp((now - tPrec) / 1000, 0, DT_MAX);
  tPrec = now;
  if (knight) {
    knight.update(dt, leggiInput());
    if (modoCamera === 'segui') seguiCavaliere();
  }
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
