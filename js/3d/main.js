// Knight Dawn — motore 3D: renderer, scena, luci, render loop, contatore FPS (F3).
// M4: cavaliere sul terreno reale con camera alle spalle (camera.js) e castello (castle3d.js).
// M5: la distanza percorsa fa avanzare Calendar e consuma la Forza di Knight; HUD di stato;
// salvataggio in localStorage (Save, slot 0). La logica sta negli script classici in js/.
// Il tasto C passa alla camera libera di debug (OrbitControls) per ispezionare il terreno.
// Unità: 1 unità Three.js = 1 metro, asse Y verso l'alto, nord verso -Z.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadTerrain, componiSuolo } from './terrain.js';
import { createKnight } from './knight3d.js';
import { createFollowCamera } from './camera.js';
import { createCastle } from './castle3d.js';

const COLORE_CIELO = '#c4d4d6';           // azzurro-pergamena, uguale alla nebbia
const NEBBIA = [900, 4000];               // m: inizio e fine della nebbia lineare (foschia leggera)
const NOME_TERRENO = 'tavullia';          // scena di prova (terreno reale)

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
// Il colore "da terra" è la luce riflessa dal suolo: schiarisce le pareti verticali in ombra (mura,
// cavaliere) e quasi non tocca il terreno, le cui facce guardano in alto.
const cielo = new THREE.HemisphereLight('#dce8ec', '#8a7550', 0.45);
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

// Messaggio temporaneo al centro in alto (uno alla volta).
let _messaggio = null;
let _messaggioTimer = 0;
function messaggio(testo, ms = 4500) {
  if (!_messaggio) _messaggio = avvisoHud('', 'messaggio');
  _messaggio.textContent = testo;
  _messaggio.hidden = false;
  clearTimeout(_messaggioTimer);
  _messaggioTimer = setTimeout(() => { _messaggio.hidden = true; }, ms);
}

// ─── Pannello di stato: data e ora, Forza, Salute, Volontà, Onore ──────
const pannelloStato = document.createElement('div');
pannelloStato.className = 'stato';
pannelloStato.hidden = true;
const ATTRIBUTI = [['forza', 'Forza'], ['salute', 'Salute'], ['volonta', 'Volontà']];
pannelloStato.innerHTML = '<div class="data"></div>'
  + ATTRIBUTI.map(([id, nome]) => `<div class="attr ${id}"><span class="nome">${nome}</span>`
    + '<span class="barra"><i></i></span><span class="val"></span></div>').join('')
  + '<div class="onore"></div>';
hud.appendChild(pannelloStato);
const elData = pannelloStato.querySelector('.data');
const elOnore = pannelloStato.querySelector('.onore');
const elAttr = Object.fromEntries(ATTRIBUTI.map(([id]) => {
  const riga = pannelloStato.querySelector('.attr.' + id);
  return [id, { riga, barra: riga.querySelector('i'), val: riga.querySelector('.val') }];
}));
const _cacheHud = new Map();               // tocca il DOM solo quando un valore cambia
function imposta(chiave, applica, valore) {
  if (_cacheHud.get(chiave) === valore) return;
  _cacheHud.set(chiave, valore);
  applica(valore);
}

function aggiornaStato() {
  const data = Calendar.inVeglia ? Calendar.formatEsteso() : Calendar.formatCompatto();
  imposta('data', (v) => { elData.textContent = v; }, `${data} · ${Calendar.oraCanonica()}`);
  for (const [id] of ATTRIBUTI) {
    const a = Knight[id], el = elAttr[id];
    const pct = Math.max(0, Math.min(100, (a.cur / a.max) * 100));
    imposta(id + '.w', (v) => { el.barra.style.width = v + '%'; }, pct.toFixed(1));
    imposta(id + '.v', (v) => { el.val.textContent = v; }, String(Math.ceil(a.cur)));
    imposta(id + '.b', (v) => { el.riga.classList.toggle('basso', v); }, pct < 20);
  }
  imposta('onore', (v) => { elOnore.textContent = v; },
    `Onore ${Knight.onore > 0 ? '+' : ''}${Knight.onore}`);
}

// ─── Terreno, cavaliere, camera ─────────────────────────────────────────
let terrain = null;
let knight = null;
let castle = null;
let suolo = null;                         // terreno + superfici costruite (cortile, rampa)
let cam = null;                           // camera alle spalle del cavaliere
let controls = null;                      // camera libera di debug (tasto C)
let modoCamera = 'segui';                 // 'segui' | 'libera'
const ALTEZZA_MIN_LIBERA = 3;             // m sopra il terreno, camera libera

// ─── Partita: nuova o ripresa dal salvataggio automatico ───────────────
let nonSalvare = false;                   // true mentre si ricomincia (niente salvataggio in uscita)

function nuovaPartitaDati() {
  Knight.init();
  Calendar.init();
  if (typeof Events !== 'undefined' && Events.reset) Events.reset();
  if (typeof News !== 'undefined' && News.reset) News.reset();
}

function salvaOra() {
  if (knight && !nonSalvare) Save.save(Save.AUTOSAVE_SLOT);
}

function nuovaPartita() {
  if (!window.confirm('Nuova partita? Il salvataggio attuale verrà cancellato.')) return;
  nonSalvare = true;
  Save.stopAutosave();
  Save.delete(Save.AUTOSAVE_SLOT);
  window.location.reload();
}

// Bivacco: azione atomica. Recupera Forza e fa passare il tempo d'un colpo (docs/GDD.md §3).
function accampati() {
  if (!knight) return;
  if (knight.stato.velEffettiva > 0.1) { messaggio('Fermati prima di accamparti.'); return; }
  if (Knight.forza.cur >= Knight.forza.max) { messaggio('Sei riposato: non serve accamparsi.'); return; }
  const prima = Knight.forza.cur;
  Knight.recupera('accampamento');
  Calendar.avanza(VIAGGIO.PASSI_ACCAMPAMENTO);
  const ore = VIAGGIO.PASSI_ACCAMPAMENTO * 24 / CALENDAR.PASSI_PER_GIORNO;
  messaggio(`Ti accampi: Forza +${Math.round(Knight.forza.cur - prima)}. `
    + `Passano ${VIAGGIO.PASSI_ACCAMPAMENTO} Passi (circa ${ore} ore).`);
  salvaOra();
}

// Tempo e fatica per distanza: ogni fotogramma la strada fatta dal cavaliere va a Calendar e Knight.
const _prec = { x: 0, y: 0, z: 0 };
function contaPercorso() {
  const k = knight.stato;
  const d = Math.hypot(k.x - _prec.x, k.z - _prec.z);
  const salita = Math.max(0, k.y - _prec.y);
  _prec.x = k.x; _prec.y = k.y; _prec.z = k.z;
  if (d < 1e-6) return;
  const andatura = k.velocita < 0 ? 'camminata' : k.andatura;   // all'indietro si va al passo
  Calendar.avanzaMetri(d, salita);
  Knight.consumaForzaMetri(d, salita, andatura);
}

async function init() {
  terrain = await loadTerrain(NOME_TERRENO);
  scene.add(terrain.mesh);
  if (terrain.isFallback) {
    avvisoHud('Dati del terreno reale non trovati: terreno procedurale di prova.');
  }

  castle = createCastle(terrain);
  scene.add(castle.object);

  // Partita ripresa dal salvataggio automatico, se c'è; altrimenti nuova.
  const ripresa = await Save.load(Save.AUTOSAVE_SLOT);
  if (!ripresa) nuovaPartitaDati();

  // Nuova partita: il cavaliere parte al centro dell'area, rivolto verso la porta del castello.
  // Partita ripresa: dal punto salvato, se riguarda questa stessa scena.
  const porta = castle.davantiPorta();
  const sc = Save.scenaSalvata;
  const start = (ripresa && sc && sc.terreno === NOME_TERRENO && Number.isFinite(sc.x) && Number.isFinite(sc.z))
    ? { x: sc.x, z: sc.z, direzione: Number.isFinite(sc.direzione) ? sc.direzione : 0 }
    : { x: 0, z: 0, direzione: Math.atan2(porta.x, porta.z) };
  suolo = componiSuolo(terrain, [castle]);
  knight = createKnight(suolo, start, [castle]);
  scene.add(knight.object);
  _prec.x = knight.stato.x; _prec.y = knight.stato.y; _prec.z = knight.stato.z;

  Save.statoScena = () => ({
    terreno: NOME_TERRENO, x: knight.stato.x, z: knight.stato.z, direzione: knight.stato.direzione,
  });
  Save.startAutosave();
  window.addEventListener('pagehide', salvaOra);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvaOra();
  });
  pannelloStato.hidden = false;
  if (ripresa) messaggio('Partita ripresa dall\'ultimo salvataggio.');

  cam = createFollowCamera(camera, suolo, knight, renderer.domElement, castle.solidi);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;    // il trascinamento col tasto destro scorre sul piano orizzontale
  controls.minDistance = 5;
  controls.maxDistance = 1800;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

  // Per ispezione dalla console del browser (Knight, Calendar, Save sono comunque globali)
  window.kd = { scene, camera, cam, controls, terrain, suolo, knight, castle, Knight, Calendar, Save };

  avvisoHud('Frecce o WASD: muovi · trascina col mouse: gira · Shift: scatto · Ctrl: camminata sì/no'
    + ' · R: accampati · rotella: distanza · C: camera libera · F3: info · F8: nuova partita', 'aiuto');
}

function cambiaModoCamera() {
  if (modoCamera === 'segui') {
    modoCamera = 'libera';
    cam.disattiva();
    controls.target.copy(knight.puntoMira());
    controls.enabled = true;
    controls.update();
  } else {
    modoCamera = 'segui';
    controls.enabled = false;
    cam.riattiva();
  }
}

// Camera libera: il punto osservato resta dentro l'area e appoggiato al terreno, la camera sopra la superficie.
function vincolaCameraLibera() {
  const t = controls.target;
  const h = terrain.half;
  t.x = THREE.MathUtils.clamp(t.x, -h, h);
  t.z = THREE.MathUtils.clamp(t.z, -h, h);
  const dy = terrain.getHeight(t.x, t.z) - t.y;
  t.y += dy;
  camera.position.y += dy;                 // sposta insieme camera e bersaglio: niente scatti
  const minY = terrain.getHeight(camera.position.x, camera.position.z) + ALTEZZA_MIN_LIBERA;
  if (camera.position.y < minY) camera.position.y = minY;
}

// Nebbia: da vicino nasconde il bordo del mondo; allontanandosi si ritira per la vista d'insieme.
function aggiornaNebbia(puntoOsservato) {
  const dist = camera.position.distanceTo(puntoOsservato);
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
// Interruttore della camminata: Ctrl (premi e rilascia). Attenzione: Ctrl+W chiude la scheda del browser
// e la pagina non può impedirlo; chi usa WASD deve premere Ctrl da solo.
const TASTI_CAMMINATA = ['ControlLeft', 'ControlRight'];
let camminata = false;
const indicatoreAndatura = document.createElement('div');
indicatoreAndatura.className = 'andatura';
indicatoreAndatura.hidden = true;
document.getElementById('hud').appendChild(indicatoreAndatura);
const sfinito = () => Knight.forza.cur <= 0;   // a Forza 0 niente corsa né scatto

function aggiornaIndicatoreAndatura() {
  const testo = sfinito() ? 'Sfinito: solo camminata (R per accamparti)'
    : camminata ? 'Camminata (Ctrl per la corsetta)' : '';
  imposta('andatura', (v) => {
    indicatoreAndatura.textContent = v;
    indicatoreAndatura.hidden = !v;
    indicatoreAndatura.classList.toggle('sfinito', sfinito());
  }, testo);
}
const premuto = (azione) => TASTI_MOVIMENTO[azione].some((k) => tasti.has(k));

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault();
  tasti.add(e.code);
  if (e.code === 'KeyC' && !e.repeat && knight) cambiaModoCamera();
  if (TASTI_CAMMINATA.includes(e.code) && !e.repeat) camminata = !camminata;
  if (e.code === 'KeyR' && !e.repeat) accampati();
  if (e.code === 'F8' && !e.repeat) {
    e.preventDefault();
    nuovaPartita();
  }
});
window.addEventListener('keyup', (e) => tasti.delete(e.code));
window.addEventListener('blur', () => tasti.clear());   // niente tasti "incollati" cambiando finestra

const _input = { avanti: 0, gira: 0, giroMouse: 0, corsa: false, camminata: false };
function leggiInput() {
  _input.avanti = (premuto('avanti') ? 1 : 0) - (premuto('indietro') ? 1 : 0);
  _input.gira = (premuto('destra') ? 1 : 0) - (premuto('sinistra') ? 1 : 0);
  _input.giroMouse = cam.prendiGiroMouse();
  _input.corsa = premuto('corsa') && !sfinito();
  _input.camminata = camminata || sfinito();
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
      + ` · pendenza ${fmt(suolo.getSlope(k.x, k.z))}° · ${fmt(k.velEffettiva, 1)} m/s`
      + (k.bloccato ? ' · bloccato' : '')
      + `\nmarcia: ${k.pendenzaMarcia >= 0 ? 'salita' : 'discesa'} ${fmt(Math.abs(Math.atan(k.pendenzaMarcia)) * 180 / Math.PI)}°`
      + ` · velocità ×${fmt(k.fattorePendenza, 2)} · andatura: ${k.andatura}`;
    const ora = Calendar.oraDelGiorno();
    testo += `\ntempo: Passi ${Calendar.passiTotali} + ${fmt(Calendar.frazione, 3)}`
      + ` · ore ${String(Math.floor(ora)).padStart(2, '0')}:${String(Math.floor((ora % 1) * 60)).padStart(2, '0')}`
      + ` · Forza ${fmt(Knight.forza.cur, 2)}`;
    testo += `\ncamera: ${modoCamera === 'segui' ? 'alle spalle' : 'libera (C per tornare)'}`;
    if (castle) {
      testo += castle.dentro(k.x, k.z) ? '\ncastello: nel cortile'
        : `\ncastello: a ${fmt(Math.hypot(k.x - castle.cfg.x, k.z - castle.cfg.z))} m dal centro`;
    }
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
    contaPercorso();
    aggiornaStato();
    aggiornaIndicatoreAndatura();
    if (modoCamera === 'segui') {
      cam.update(dt);
      aggiornaNebbia(cam.mira);
    } else {
      controls.update();
      vincolaCameraLibera();
      aggiornaNebbia(controls.target);
    }
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
