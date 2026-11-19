// Knight Dawn — motore 3D: renderer, scena, luci, render loop, contatore FPS (F3).
// M4: cavaliere sul terreno reale con camera alle spalle (camera.js) e castello (castle3d.js).
// M5: il tempo di gioco scorre col tempo reale compresso (TEMPO_SCENA), la distanza consuma la
// Forza di Knight; ciclo giorno/notte; pausa (P); HUD di stato; salvataggio in localStorage
// (Save, slot 0). La logica sta negli script classici in js/.
// Il tasto C passa alla camera libera di debug (OrbitControls) per ispezionare il terreno.
// M6: il tasto M (o ?carta nell'indirizzo) apre la vista di sviluppo della Carta (cartaVista.js).
// Il mondo generato è l'avvio predefinito (?seme=… lo sceglie): la Scena è un blocco di 2×2 km ricavato
// dalla Carta (js/mondo/scena.js); un clic sulla Carta porta in un'altra Scena. Tavullia, scena di
// prova con il castello, si carica con ?terreno=tavullia.
// Unità: 1 unità Three.js = 1 metro, asse Y verso l'alto, nord verso -Z.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadTerrain, componiSuolo, createTerrain, coloreMondo } from './terrain.js';
import { createKnight } from './knight3d.js';
import { createFollowCamera } from './camera.js';
import { createCastle } from './castle3d.js';
import { createCartaVista } from './cartaVista.js';
import { creaOrizzonte } from './orizzonte.js';
import { creaAcqueScena } from './acqua.js';
import { generaCartaAsincrona } from '../mondo/generatore.js';
import { generaScena } from '../mondo/scena.js';
import { semeDaTesto } from '../mondo/rumore.js';

// Nebbia sulla distanza vera dalla camera, non sulla profondità lungo l'asse di vista (come fa Three.js):
// con la profondità, un monte al bordo dello schermo riceveva meno nebbia e spariva girandosi verso di lui.
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = length( mvPosition.xyz );\n#endif';

const COLORE_CIELO = '#c4d4d6';           // azzurro-pergamena, uguale alla nebbia
const NEBBIA = [900, 4000];               // m: inizio e fine della nebbia lineare (foschia leggera)
// m: con l'orizzonte (mondo generato). Più trasparente da quando salire per guardare lontano è un'azione
// di gioco: a 15 km si perde ~8 % del contrasto, a 25 km ~35 %. Più avanti dipenderà dal tempo atmosferico.
const NEBBIA_ORIZZONTE = [8000, 50000];
const LONTANO = 60000;                    // m: distanza massima disegnata dalla camera
const PARAMETRI = new URL(window.location.href).searchParams;
const TAVULLIA = PARAMETRI.get('terreno') === 'tavullia';   // scena di prova (terreno reale, castello)
const COLORE_ACQUA = '#4d7282';
const PROFONDITA_GUADO = 0.9;             // m d'acqua oltre i quali il cavaliere non entra (fiumi piccoli: si guadano)

// ─── Renderer, scena, camera ────────────────────────────────────────────
const canvas = document.getElementById('scena');
// Buffer di profondità logaritmico: dal cavaliere a pochi metri fino all'orizzonte a ~50 km senza che le
// superfici lontane (costa e mare, versanti vicini) si contendano i pixel.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORE_CIELO);
scene.fog = new THREE.Fog(COLORE_CIELO, NEBBIA[0], NEBBIA[1]);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, LONTANO);

// ─── Luci: sole che segue l'ora del giorno, luna, luce emisferica cielo/terra ───
// Di giorno sole forte e luce ambiente contenuta: il rilievo collinare si legge dal chiaroscuro.
// Il colore "da terra" è la luce riflessa dal suolo: schiarisce le pareti verticali in ombra (mura,
// cavaliere) e quasi non tocca il terreno, le cui facce guardano in alto.
// Di notte una luna fredda e fissa (alta a sud-est) lascia il paesaggio scuro ma leggibile.
const cielo = new THREE.HemisphereLight('#dce8ec', '#8a7550', 0.45);
scene.add(cielo);
const sole = new THREE.DirectionalLight('#fff0d4', 3.4);
sole.position.set(-700, 420, 500);
scene.add(sole);
const luna = new THREE.DirectionalLight('#9fb4dc', 0);
luna.position.set(600, 700, 750);
scene.add(luna);

// Ciclo del giorno (valori provvisori, senza stagioni): alba alle 5, tramonto alle 20, sole al
// massimo a 55° verso le 12:30. Di notte la "quota" del sole scende sotto l'orizzonte fino a −35°.
const CICLO = {
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
function posizioneSole(ora) {
  const { alba, tramonto, altezzaMax, profonditaNotte } = CICLO;
  if (ora >= alba && ora <= tramonto) {
    const t = (ora - alba) / (tramonto - alba);
    return { altezza: altezzaMax * Math.sin(Math.PI * t), azimut: 70 + 220 * t };
  }
  const t = ((ora - tramonto + 24) % 24) / (24 - (tramonto - alba));
  return { altezza: -profonditaNotte * Math.sin(Math.PI * t), azimut: 290 + 140 * t };
}

// Le pareti del castello hanno una piccola luce propria (luce riflessa): di notte va abbassata,
// altrimenti brillano. Si raccolgono una volta i materiali con emissive e la loro intensità di base.
let emissivi = [];
function raccogliEmissivi(radice) {
  radice.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.emissive && !emissivi.some((e) => e.m === m)) emissivi.push({ m, base: m.emissive.clone() });
    }
  });
}

const _col = new THREE.Color();
let _oraCielo = -1;
let _luceGiorno = 1;                       // 0 notte → 1 giorno: la usa anche la nebbia
function aggiornaCielo() {
  const ora = Calendar.oraDelGiorno();
  if (Math.abs(ora - _oraCielo) < 0.002) return;          // ~7 s di gioco: niente da ridisegnare
  _oraCielo = ora;
  const { altezza, azimut } = posizioneSole(ora);
  const C = CICLO.colori;
  const giorno = smoothstep(-5, 8, altezza);               // 0 notte → 1 pieno giorno
  _luceGiorno = giorno;
  const crepuscolo = Math.max(0, 1 - Math.abs(altezza - 1) / 9) * smoothstep(-8, -2, altezza);

  const a = altezza * _gradi, z = azimut * _gradi;
  sole.position.set(Math.sin(z) * Math.cos(a), Math.max(Math.sin(a), 0.02), -Math.cos(z) * Math.cos(a))
    .multiplyScalar(1000);
  sole.intensity = CICLO.soleMax * smoothstep(-2, 10, altezza);
  sole.color.copy(C.soleGiorno).lerp(C.soleBasso, 1 - smoothstep(4, 20, altezza));
  luna.intensity = CICLO.lunaMax * (1 - giorno);

  cielo.intensity = THREE.MathUtils.lerp(CICLO.emisferaNotte, CICLO.emisferaGiorno, giorno);
  cielo.color.copy(C.emisferaCieloNotte).lerp(C.emisferaCieloGiorno, giorno);
  cielo.groundColor.copy(C.emisferaTerraNotte).lerp(C.emisferaTerraGiorno, giorno);

  _col.copy(C.cieloNotte).lerp(C.cieloGiorno, giorno).lerp(C.cieloCrepuscolo, crepuscolo * 0.75);
  scene.background.copy(_col);
  scene.fog.color.copy(_col);

  const luceRiflessa = 0.2 + 0.8 * giorno;
  for (const e of emissivi) e.m.emissive.copy(e.base).multiplyScalar(luceRiflessa);
  const ombra = knight && knight.object.getObjectByName('ombra-cavaliere');
  if (ombra) ombra.material.opacity = 0.35 + 0.65 * giorno;
}

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

// ─── Schermata di caricamento (generazione del mondo nel Web Worker) ───
const caricamento = document.createElement('div');
caricamento.id = 'caricamento';
caricamento.hidden = true;
caricamento.innerHTML = '<div class="riquadro"><div class="titolo">Generazione del mondo</div>'
  + '<div class="fase">…</div><div class="barra"><i></i></div></div>';
document.body.appendChild(caricamento);
const elFase = caricamento.querySelector('.fase'), elBarra = caricamento.querySelector('.barra i');
function mostraCaricamento(testo, frazione) {
  caricamento.hidden = false;
  elFase.textContent = testo;
  elBarra.style.width = `${Math.round(Math.min(1, Math.max(0, frazione)) * 100)}%`;
}

/** Carta del mondo per un seme, dal Worker (con cache; ?rigenera la ignora), con la schermata di caricamento. */
async function cartaDelMondo(seme) {
  mostraCaricamento('Generazione del mondo', 0);
  try {
    return await generaCartaAsincrona(seme, {
      avanzamento: mostraCaricamento, cache: !PARAMETRI.has('rigenera'),
    });
  } finally {
    caricamento.hidden = true;
  }
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
let terrain = null;                       // terreno della Scena attuale
let knight = null;
let castle = null;                        // solo a Tavullia (fino a «rocca e borgo»)
let acqua = null;                         // superficie del mare a quota 0, se la Scena ne ha
let orizzonte = null;                     // terreno lontano attorno alla Scena (solo mondo generato)
let acqueScena = null;                    // fiumi e laghi in quota della Scena (mesh)
let livelliAcqua = null;                  // { fiume, lago, cols, cell, half }: pelo dell'acqua per vertice
let carta = null;                         // Carta del mondo generato (null a Tavullia)
let scenaAttuale = null;                  // { tipo: 'tavullia' } | { tipo: 'mondo', cx, cz } (centro, m del mondo)
let statPendenze = '';                    // percentili della pendenza della Scena (F3)

// Suolo calpestabile della Scena attuale: terreno + superfici costruite (cortile, rampa). Cavaliere e
// camera ricevono questi oggetti una volta sola; cambiando Scena cambia solo ciò a cui rimandano.
let _suolo = null;
const suolo = {
  getHeight: (x, z) => _suolo.getHeight(x, z),
  getSlope: (x, z) => _suolo.getSlope(x, z),
  contains: (x, z) => _suolo.contains(x, z),
  percorribile: (x, z) => {
    const h = _suolo.getHeight(x, z);
    if (h <= -PROFONDITA_GUADO) return false;                    // mare
    const l = livelloAcquaIn(x, z);
    return Number.isNaN(l) || l - h <= PROFONDITA_GUADO;          // fiumi profondi e laghi
  },
  get half() { return _suolo.half; },
  get size() { return _suolo.size; },
  get minElev() { return _suolo.minElev; },
  get maxElev() { return _suolo.maxElev; },
  get meta() { return _suolo.meta; },
};
/** Pelo dell'acqua di fiumi e laghi in quota nel punto (vertice più vicino del blocco), o NaN. */
function livelloAcquaIn(x, z) {
  const L = livelliAcqua;
  if (!L) return NaN;
  const c = Math.round((x + L.half) / L.cell), r = Math.round((z + L.half) / L.cell);
  if (c < 0 || r < 0 || c >= L.cols || r >= L.cols) return NaN;
  const a = L.fiume[r * L.cols + c], b = L.lago[r * L.cols + c];
  return Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b);
}
// La camera non scende sotto il pelo dell'acqua (mare, fiumi, laghi).
const suoloCamera = {
  getHeight: (x, z) => {
    let h = _suolo.getHeight(x, z);
    if (acqua && h < 0) h = 0;
    const l = livelloAcquaIn(x, z);
    return Number.isNaN(l) || l < h ? h : l;
  },
  getSlope: (x, z) => _suolo.getSlope(x, z),
  contains: (x, z) => _suolo.contains(x, z),
  get half() { return _suolo.half; },
};
const ostacoli = [];                      // spingono fuori il cavaliere (mura del castello)
const occlusori = [];                     // bloccano la vista della camera
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
  // Nuova partita = nuovo mondo: senza seme nell'indirizzo se ne sceglie uno a caso.
  const url = new URL(window.location.href);
  url.searchParams.delete('seme');
  window.location.replace(url);
}

// Recupero da fermi: ~10 Forza per Passo di gioco (VIAGGIO.FORZA_RIPOSO_PER_PASSO), con lo stesso
// ritmo in tutti i modi in cui passa il tempo (aspettando davvero, con T o con R): nessuno conviene.
const FERMO = 0.05;                        // m/s: sotto questa velocità il cavaliere è fermo
const _ore = (passi) => {
  const minuti = Math.round(passi * CALENDAR.SECONDI_PER_PASSO / 60);
  return minuti >= 60 ? `circa ${String(Math.round(minuti / 6) / 10).replace('.', ',')} ore` : `${minuti} minuti`;
};
const _guadagno = (prima) => {
  const g = Math.round(Knight.forza.cur - prima);
  return g > 0 ? `: Forza +${g}.` : '.';
};

// Avanza (T): salto atomico all'inizio della prossima ora canonica, di giorno o di notte: serve per
// non dover aspettare davvero (il tramonto, un'apertura…). Da fermi si recupera come aspettando.
function avanza() {
  if (!knight || inPausa) return;
  if (knight.stato.velEffettiva > 0.1) { messaggio('Fermati prima di far passare il tempo.'); return; }
  const prima = Knight.forza.cur;
  const passi = Calendar.avanzaAllaProssimaOra();
  Knight.riposaPassi(passi);
  messaggio(`Lasci passare il tempo fino a ${Calendar.oraCanonica()} (${_ore(passi)})${_guadagno(prima)}`);
  salvaOra();
}

// Riposo (R): scorciatoia per il riposo pieno (docs/GDD.md §3). Da Vespri in poi si dorme all'aperto
// fino a Prima (la notte passa d'un colpo); di giorno una sosta di un Passo (~3 ore).
function riposa() {
  if (!knight || inPausa) return;
  if (knight.stato.velEffettiva > 0.1) { messaggio('Fermati prima di riposare.'); return; }
  const prima = Knight.forza.cur;
  const sera = Calendar.eNotte() || Calendar.indiceNelGiorno() === CALENDAR.INDICE_NOTTE - 1;
  if (sera) {
    const passi = Calendar.avanzaFinoA(0);
    Knight.riposaPassi(passi);
    messaggio(`Dormi all'addiaccio fino a Prima (${_ore(passi)})${_guadagno(prima)}`);
  } else {
    if (Knight.forza.cur >= Knight.forza.max) {
      messaggio('Sei riposato. Per far passare il tempo: T (Avanza).');
      return;
    }
    Calendar.avanza(VIAGGIO.PASSI_SOSTA);
    Knight.riposaPassi(VIAGGIO.PASSI_SOSTA);
    messaggio(`Ti fermi a riposare (${_ore(VIAGGIO.PASSI_SOSTA)})${_guadagno(prima)}`);
  }
  salvaOra();
}

// Pausa (P): nulla scorre, né il tempo di gioco né il cavaliere. La scheda nascosta ferma comunque
// il ciclo di disegno, quindi è già una pausa automatica.
let inPausa = false;
let _avvisoPausa = null;
function cambiaPausa() {
  if (!knight) return;
  inPausa = !inPausa;
  if (!_avvisoPausa) _avvisoPausa = avvisoHud('In pausa · P per riprendere', 'pausa');
  _avvisoPausa.hidden = !inPausa;
  tasti.clear();
}

// Fatica per distanza: ogni fotogramma la strada fatta dal cavaliere consuma Forza (il tempo invece
// segue il tempo reale, vedi frame()).
const _prec = { x: 0, y: 0, z: 0 };
function contaPercorso() {
  const k = knight.stato;
  const d = Math.hypot(k.x - _prec.x, k.z - _prec.z);
  const salita = Math.max(0, k.y - _prec.y);
  _prec.x = k.x; _prec.y = k.y; _prec.z = k.z;
  if (d < 1e-6) return;
  const andatura = k.velocita < 0 ? 'camminata' : k.andatura;   // all'indietro si va al passo
  Knight.consumaForzaMetri(d, salita, andatura);
}

// ─── Scene: Tavullia o un blocco del mondo generato ────────────────────

function libera(oggetto) {
  oggetto.traverse((o) => {
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
  });
}

/** Percentili della pendenza della Scena (gradi), per il confronto con Tavullia (F3). */
function misuraPendenze(t) {
  const n = 128, passo = t.size / n, v = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) v.push(t.getSlope(-t.half + (c + 0.5) * passo, -t.half + (r + 0.5) * passo));
  }
  v.sort((a, b) => a - b);
  const p = (f) => fmt(v[Math.floor(f * (v.length - 1))]);
  return `pendenza p50 ${p(0.5)}° · p90 ${p(0.9)}° · p99 ${p(0.99)}°`;
}

/**
 * Carica una Scena al posto di quella attuale.
 * @param {{tipo:'tavullia'} | {tipo:'mondo', cx:number, cz:number}} desc
 */
async function caricaScena(desc) {
  for (const o of [terrain?.mesh, acqua, castle?.object, orizzonte?.oggetto, acqueScena]) {
    if (o) { scene.remove(o); libera(o); }
  }
  castle = null;
  acqua = null;
  orizzonte = null;
  acqueScena = null;
  livelliAcqua = null;
  emissivi = [];
  ostacoli.length = 0;
  occlusori.length = 0;

  if (desc.tipo === 'tavullia') {
    terrain = await loadTerrain('tavullia');
    if (terrain.isFallback) avvisoHud('Dati del terreno reale non trovati: terreno procedurale di prova.');
    castle = createCastle(terrain);
    scene.add(castle.object);
    raccogliEmissivi(castle.object);
    ostacoli.push(castle);
    occlusori.push(...castle.solidi);
  } else {
    const { meta, heights, acqua: dati } = generaScena(carta, desc.cx, desc.cz);
    terrain = createTerrain(meta, heights, false, coloreMondo(carta, Calendar.stagione));
    acqueScena = creaAcqueScena(dati, meta, COLORE_ACQUA);
    if (acqueScena) scene.add(acqueScena);
    livelliAcqua = { fiume: dati.fiume, lago: dati.lago, cols: meta.cols, cell: meta.cellSize, half: meta.sizeMeters / 2 };
  }
  scene.add(terrain.mesh);

  if (desc.tipo === 'mondo') {
    // Orizzonte: terreno lontano fino a ~50 km. Le pareti laterali del blocco si vedrebbero dall'esterno.
    orizzonte = creaOrizzonte(carta, desc.cx, desc.cz, terrain, COLORE_ACQUA, Calendar.stagione);
    scene.add(orizzonte.oggetto);
    const pareti = terrain.mesh.getObjectByName('terreno-bordo');
    if (pareti) pareti.visible = false;
    acqua = orizzonte.acqua;
    if (acqua) scene.add(acqua);
  } else if (terrain.minElev < 0) {
    acqua = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.size, terrain.size).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORE_ACQUA, transparent: true, opacity: 0.88 }));
    acqua.name = 'acqua';
    scene.add(acqua);
  }
  _suolo = componiSuolo(terrain, castle ? [castle] : []);
  scenaAttuale = desc;
  statPendenze = misuraPendenze(terrain);
  _oraCielo = -1;                          // ricalcola le luci (anche quelle proprie del castello)
}

/** Mette il cavaliere in (x, z) locali della Scena attuale; lo crea la prima volta. */
function posizionaCavaliere(x, z, direzione) {
  if (!knight) {
    knight = createKnight(suolo, { x, z, direzione }, ostacoli);
    scene.add(knight.object);
  } else {
    Object.assign(knight.stato, { x, z, direzione, velocita: 0, velAngolare: 0, velEffettiva: 0 });
    knight.update(0, { avanti: 0, gira: 0, giroMouse: 0, corsa: false, camminata: false });
  }
  _prec.x = knight.stato.x; _prec.y = knight.stato.y; _prec.z = knight.stato.z;   // niente fatica per il salto
  if (cam) {
    if (modoCamera === 'libera') cambiaModoCamera();
    cam.riattiva();
  }
}

/** Centro della prima Scena di una nuova partita: collina (250–600 m) la più vicina al centro della Carta. */
function puntoPartenza(c) {
  for (const [a, b] of [[250, 600], [100, Infinity], [1, Infinity]]) {
    let best = null, bd = Infinity;
    for (let r = 0; r < c.rows; r++) {
      for (let x = 0; x < c.cols; x++) {
        const i = r * c.cols + x, q = c.quota[i];
        if (c.mare[i] || q < a || q > b) continue;
        const d = (x - c.cols / 2) ** 2 + (r - c.rows / 2) ** 2;
        if (d < bd) { bd = d; best = { cx: (x + 0.5) * c.cella, cz: (r + 0.5) * c.cella }; }
      }
    }
    if (best) return best;
  }
  return { cx: c.cols * c.cella / 2, cz: c.rows * c.cella / 2 };
}

/**
 * Il seme del mondo va nell'indirizzo: ricaricando o condividendo il link si ritrova lo stesso mondo.
 * `?terreno=tavullia` resta solo se la Scena attuale è Tavullia.
 */
function scriviIndirizzo() {
  const url = new URL(window.location.href);
  if (carta) {
    const testo = url.searchParams.get('seme');
    if (testo === null || semeDaTesto(testo) !== carta.seme) url.searchParams.set('seme', String(carta.seme));
  }
  if (scenaAttuale?.tipo === 'tavullia') url.searchParams.set('terreno', 'tavullia');
  else url.searchParams.delete('terreno');
  window.history.replaceState(null, '', url);
}

/** Dalla Carta: entra nella Scena centrata nel punto (x, y) in km della Carta indicata (al metro). */
async function entraDallaCarta(cartaScelta, x, y) {
  carta = cartaScelta;
  await caricaScena({ tipo: 'mondo', cx: Math.round(x * carta.cella), cz: Math.round(y * carta.cella) });
  posizionaCavaliere(0, 0, Math.PI);
  scriviIndirizzo();
  cartaVista.chiudi();
  messaggio(`Scena a ${fmt(x, 2)}, ${fmt(y, 2)} km dall'angolo nord-ovest (seme ${carta.seme}).`);
  salvaOra();
}

/** Dalla Carta: la scena di prova di Tavullia (terreno reale, castello). La Carta resta quella del mondo. */
async function entraTavullia() {
  await caricaScena({ tipo: 'tavullia' });
  const porta = castle.davantiPorta();
  posizionaCavaliere(0, 0, Math.atan2(porta.x, porta.z));
  scriviIndirizzo();
  cartaVista.chiudi();
  messaggio('Tavullia: terreno reale, scena di prova. Dalla Carta (M) si torna al mondo generato.');
  salvaOra();
}

async function init() {
  // Partita ripresa dal salvataggio automatico, se c'è; altrimenti nuova.
  const ripresa = await Save.load(Save.AUTOSAVE_SLOT);
  if (!ripresa) nuovaPartitaDati();
  const sc = ripresa ? Save.scenaSalvata : null;
  const finiti = (...v) => v.every(Number.isFinite);

  // Seme del mondo: dall'indirizzo, poi dal salvataggio (anche se la partita è a Tavullia), altrimenti a caso.
  const testo = PARAMETRI.get('seme');
  const seme = testo ? semeDaTesto(testo)
    : (sc && Number.isFinite(sc.seme)) ? sc.seme
      : Math.floor(Math.random() * 1e6);

  if (TAVULLIA) {
    // Tavullia: anche qui la partita ha il suo mondo (la Carta, M, riporta lì e non a un seme a caso).
    carta = await cartaDelMondo(seme);
    // Dal punto salvato se riguarda questa scena, altrimenti al centro rivolti alla porta.
    await caricaScena({ tipo: 'tavullia' });
    const porta = castle.davantiPorta();
    if (sc && sc.terreno === 'tavullia' && finiti(sc.x, sc.z)) {
      posizionaCavaliere(sc.x, sc.z, Number.isFinite(sc.direzione) ? sc.direzione : 0);
    } else {
      posizionaCavaliere(0, 0, Math.atan2(porta.x, porta.z));
    }
    scriviIndirizzo();
  } else {
    carta = await cartaDelMondo(seme);
    if (sc && sc.terreno === 'mondo' && sc.seme === seme && finiti(sc.cx, sc.cz, sc.x, sc.z)) {
      await caricaScena({ tipo: 'mondo', cx: sc.cx, cz: sc.cz });
      posizionaCavaliere(sc.x, sc.z, Number.isFinite(sc.direzione) ? sc.direzione : Math.PI);
    } else {
      await caricaScena({ tipo: 'mondo', ...puntoPartenza(carta) });
      posizionaCavaliere(0, 0, Math.PI);
    }
    scriviIndirizzo();
  }

  Save.statoScena = () => {
    const k = knight.stato;
    return scenaAttuale.tipo === 'tavullia'
      ? { terreno: 'tavullia', seme: carta?.seme, x: k.x, z: k.z, direzione: k.direzione }
      : { terreno: 'mondo', seme: carta.seme, cx: scenaAttuale.cx, cz: scenaAttuale.cz, x: k.x, z: k.z, direzione: k.direzione };
  };
  Save.startAutosave();
  window.addEventListener('pagehide', salvaOra);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvaOra();
  });
  pannelloStato.hidden = false;
  if (ripresa) messaggio('Partita ripresa dall\'ultimo salvataggio.');

  cam = createFollowCamera(camera, suoloCamera, knight, renderer.domElement, occlusori);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;    // il trascinamento col tasto destro scorre sul piano orizzontale
  controls.minDistance = 5;
  controls.maxDistance = 8000;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

  // Per ispezione dalla console del browser (Knight, Calendar, Save sono comunque globali)
  window.kd = {
    scene, camera, cam, controls, suolo, Knight, Calendar, Save,
    get terrain() { return terrain; }, get knight() { return knight; }, get castle() { return castle; },
    get carta() { return carta; }, get scena() { return scenaAttuale; }, get orizzonte() { return orizzonte; },
    caricaScena, posizionaCavaliere,
  };

  avvisoHud('Frecce o WASD: muovi · trascina col mouse: gira · Shift: scatto · Ctrl: camminata sì/no'
    + ' · T: avanza all\'ora dopo · R: riposa/dormi · P: pausa · rotella: distanza · C: camera libera · M: Carta (clic: vai lì)'
    + ' · F3: info · F8: nuova partita',
  'aiuto');
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
// Di notte la nebbia, del colore del cielo notturno, si stringe: si vede bene solo attorno al punto
// osservato. Le luci di case, castello e fuochi (future) dovranno ignorarla per restare visibili da lontano.
function aggiornaNebbia(puntoOsservato) {
  const dist = camera.position.distanceTo(puntoOsservato);
  const nebbia = orizzonte ? NEBBIA_ORIZZONTE : NEBBIA;
  const nearGiorno = Math.max(nebbia[0], dist * 0.9);
  const farGiorno = Math.max(nebbia[1], nearGiorno + 3000);
  const g = _luceGiorno * _luceGiorno;     // la vista si allunga solo quando la luce è davvero tornata
  scene.fog.near = THREE.MathUtils.lerp(dist + CICLO.vicinoNotte, nearGiorno, g);
  scene.fog.far = THREE.MathUtils.lerp(dist + CICLO.lontanoNotte, farGiorno, g);
}

// ─── Tastiera ───────────────────────────────────────────────────────────
const tasti = new Set();

// Vista di sviluppo della Carta (M): mentre è aperta il gioco è fermo e la scena 3D non si disegna.
const cartaVista = createCartaVista(document.body, {
  onCambio: () => tasti.clear(),
  cartaAttuale: () => carta,
  generaCarta: (seme, avanzamento) => generaCartaAsincrona(seme, { avanzamento, cache: !PARAMETRI.has('rigenera') }),
  posizione: () => (scenaAttuale?.tipo === 'mondo' && knight
    ? { x: (scenaAttuale.cx + knight.stato.x) / carta.cella, y: (scenaAttuale.cz + knight.stato.z) / carta.cella }
    : null),
  onScegli: (c, x, y) => {
    entraDallaCarta(c, x, y).catch((err) => { console.error('[scena]', err); messaggio(`Errore: ${err.message}`); });
  },
  onTavullia: () => {
    entraTavullia().catch((err) => { console.error('[scena]', err); messaggio(`Errore: ${err.message}`); });
  },
});
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
  if (e.target instanceof HTMLInputElement) return;      // si sta scrivendo (es. il seme della Carta)
  if (e.code === 'KeyM' && !e.repeat) { cartaVista.alterna(); return; }
  if (cartaVista.aperta) return;
  if (e.code.startsWith('Arrow')) e.preventDefault();
  tasti.add(e.code);
  if (e.code === 'KeyC' && !e.repeat && knight) cambiaModoCamera();
  if (TASTI_CAMMINATA.includes(e.code) && !e.repeat) camminata = !camminata;
  if (e.code === 'KeyR' && !e.repeat) riposa();
  if (e.code === 'KeyT' && !e.repeat) avanza();
  if (e.code === 'KeyP' && !e.repeat) cambiaPausa();
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
      + ` · ${Calendar.eNotte() ? 'notte 1:' + TEMPO_SCENA.RAPPORTO_NOTTE : 'giorno 1:' + TEMPO_SCENA.RAPPORTO_GIORNO}`
      + (inPausa ? ' · in pausa' : '')
      + ` · sole ${fmt(posizioneSole(ora).altezza)}° · Forza ${fmt(Knight.forza.cur, 2)}`;
    const pelo = livelloAcquaIn(k.x, k.z);
    if (!Number.isNaN(pelo)) testo += `\nacqua: pelo a ${fmt(pelo, 1)} m · profondità ${fmt(Math.max(0, pelo - k.y), 1)} m`;
    testo += `\ncamera: ${modoCamera === 'segui' ? 'alle spalle' : 'libera (C per tornare)'}`;
    if (castle) {
      testo += castle.dentro(k.x, k.z) ? '\ncastello: nel cortile'
        : `\ncastello: a ${fmt(Math.hypot(k.x - castle.cfg.x, k.z - castle.cfg.z))} m dal centro`;
    }
  }
  if (terrain) {
    testo += `\nterreno: ${terrain.meta.source} · ${fmt(terrain.minElev)}–${fmt(terrain.maxElev)} m · ${statPendenze}`;
    if (orizzonte) testo += `\norizzonte: fino a ${fmt(48)} km · ${fmt(orizzonte.triangoli)} triangoli · ${fmt(orizzonte.ms)} ms`;
    if (scenaAttuale?.tipo === 'mondo' && knight) {
      testo += `\nmondo: cavaliere a ${fmt((scenaAttuale.cx + knight.stato.x) / 1000, 2)},`
        + ` ${fmt((scenaAttuale.cz + knight.stato.z) / 1000, 2)} km`;
    }
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
  if (cartaVista.aperta) return;           // la Carta copre tutto: niente tempo di gioco, niente disegno
  if (knight) {
    if (!inPausa) {
      knight.update(dt, leggiInput());
      contaPercorso();
      const passi = Calendar.avanzaTempoReale(dt);
      if (knight.stato.velEffettiva < FERMO) Knight.riposaPassi(passi);
    } else {
      cam.prendiGiroMouse();               // in pausa il mouse non gira il cavaliere
    }
    aggiornaCielo();
    castle?.aggiornaLuci(now / 1000, 1 - _luceGiorno);
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
init().then(() => {
  if (PARAMETRI.has('carta')) cartaVista.apri();
}).catch((err) => {
  console.error('[init]', err);
  avvisoHud(`Errore di avvio: ${err.message}`);
});
requestAnimationFrame(frame);
