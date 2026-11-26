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
import { loadTerrain, componiSuolo, createTerrainAPezzi, coloreMondo, coloreStrada, cuociSuolo, cuociOrizzonteAPezzi } from './terrain.js';
import { createKnight } from './knight3d.js';
import { createCavallo } from './cavallo3d.js';
import { createFollowCamera } from './camera.js';
import { createCastle } from './castle3d.js';
import { createRoccaAPezzi } from './rocca3d.js';
import { creaCaseCampagna, quotaFinestre } from './edifici3d.js';
import { createBorgoAPezzi } from './borgo3d.js';
import { createVillaggioAPezzi, createMonasteroAPezzi, createEremoAPezzi, pianoDelSito } from './villaggio3d.js';
import { createRovinaAPezzi, createMisteroAPezzi } from './rovine3d.js';
import { raggioSito, climaDelLuogo } from '../mondo/siti.js';
import { createCartaVista } from './cartaVista.js';
import { mostraMenuAvvio, creaCartaCronista, creaScrittoio, avvisoFoglio, nomeCasuale } from './interfaccia.js';
import { creaMinimappa } from './minimappa.js';
import { creaOrizzonteAPezzi } from './orizzonte.js';
import { creaAcqueScena, creaPonti, suoloStrade } from './acqua.js';
import { vicinoAlBordo, trasla } from './blocchi.js';
import { generaCartaAsincrona, verificaSemi } from '../mondo/generatore.js';
import { generaScenaAPezzi, centroBlocco, quotaFinale } from '../mondo/scena.js';
import { distanzaStrada, percorsiStrade } from '../mondo/strade.js';
import { posizionaVegetazione, posizionaVegetazioneAPezzi, coperturaMondo, coperturaTavullia } from '../mondo/vegetazione.js';
import { creaVegetazione, creaVegetazioneAPezzi } from './vegetazione3d.js';
import { creaAbitanti } from './abitanti3d.js';
import { semeDaTesto, completa } from '../mondo/rumore.js';
import { creaCielo, posizioneSole, visibilitaDelGiorno } from './cielo.js';
import { creaProfilatore, creaPercorso, GRUPPI, FAMIGLIE, BUDGET_GPU, budgetDi, creaQualita } from './prestazioni.js';

const LONTANO = 130000;                   // m: distanza massima disegnata dalla camera
const PARAMETRI = new URL(window.location.href).searchParams;
// Tavullia (scena di prova): dal menu d'avvio (partita Libera), dal salvataggio o con ?terreno=tavullia (vedi init).
let TAVULLIA = PARAMETRI.get('terreno') === 'tavullia';
// Clima delle case (freddo | temperato | caldo). `?clima=` lo forza ovunque, per provare gli stili; senza, il clima
// del luogo dal bioma e dalla temperatura della Carta (climaDelLuogo, M8). Tavullia non ha Carta: temperato.
// x, z sono in metri del mondo. Le case di campagna ne chiedono uno per blocco (una cella di clima è 1 km, il blocco
// 2 km): sul confine fra due climi tutto il blocco prende quello del centro, in cambio di un solo kit di edifici.
const CLIMA_FORZATO = ['freddo', 'temperato', 'caldo'].includes(PARAMETRI.get('clima')) ? PARAMETRI.get('clima') : null;
const climaDi = (x, z) => CLIMA_FORZATO ?? (carta ? climaDelLuogo(carta, x, z) : 'temperato');
const PROVA_PRESTAZIONI = PARAMETRI.has('prova');             // percorso di prova: niente salvataggi (vedi init)
const CENTRO_PROVA = (() => {                                   // ?centro=x,z (m del mondo) per il percorso di prova
  const v = (PARAMETRI.get('centro') || '').split(',').map(Number);
  return v.length === 2 && v.every(Number.isFinite) ? v : null;
})();   // scena di prova (terreno reale, castello)
const COLORE_ACQUA = '#4d7282';
const PROFONDITA_GUADO = 0.9;             // m d'acqua oltre i quali il cavaliere non entra (fiumi piccoli: si guadano)

// ─── Renderer, scena, camera ────────────────────────────────────────────
const canvas = document.getElementById('scena');
// Buffer di profondità logaritmico: dal cavaliere a pochi metri fino all'orizzonte a ~110 km senza che le
// superfici lontane (costa e mare, versanti vicini) si contendano i pixel.
// Profondità (docs/PRESTAZIONI.md, passo 2). Predefinita: **invertita** (EXT_clip_control). Misura sulla scheda di
// riferimento, bosco fitto: 46,3 → 71,7 FPS rispetto alla logaritmica, che scrive la profondità in ogni pixel e impedisce
// alla scheda di scartare in anticipo i pixel nascosti; nessuno sfarfallio visto dall'utente. Se il browser non ha
// EXT_clip_control si ripiega sulla logaritmica (con la normale, da 0,2 m a 130 km, il lontano sfarfallerebbe).
// Per le prove: ?profondita=log | invertita | normale e ?msaa=0 (senza MSAA: +24 % FPS nel bosco fitto, ma bordi
// seghettati: candidato per un preset «basso»).
const PROFONDITA = (() => {
  const scelta = PARAMETRI.get('profondita');
  if (['log', 'invertita', 'normale'].includes(scelta)) return scelta;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ok = !!gl && (gl.getSupportedExtensions() || []).includes('EXT_clip_control');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok ? 'invertita' : 'log';
  } catch {
    return 'log';
  }
})();
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: PARAMETRI.get('msaa') !== '0',
  logarithmicDepthBuffer: PROFONDITA === 'log', reversedDepthBuffer: PROFONDITA === 'invertita',
});
const profilatore = creaProfilatore(renderer);   // tempi GPU/CPU (docs/PRESTAZIONI.md, passo 1)
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
// Cielo: luci del giorno e della notte, colore del cielo, nebbia (cielo.js).
const cieloScena = creaCielo(scene, renderer);
const { sole } = cieloScena;

// Qualità (F2, ?qualita=basso|medio|alto, ricordata nel browser) e risoluzione adattiva: prestazioni.js.
/** Micro-rilievo di prato e neve nello shader del suolo: spento nella qualità bassa. */
function applicaRilievo(acceso, radice = scene) {
  radice.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || m?.customProgramCacheKey?.() !== 'suolo-mondo') return;
    const d = { ...(m.defines || {}) };
    if (acceso) delete d.SENZA_RILIEVO; else d.SENZA_RILIEVO = '';
    m.defines = d;
    m.needsUpdate = true;
  });
}
const qualita = creaQualita(renderer, profilatore, PARAMETRI.get('qualita') || (() => {
  try { return localStorage.getItem('kd-qualita'); } catch { return null; }
})() || 'medio', applicaRilievo);
qualita.imposta(qualita.chiave);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, LONTANO);

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

/** Cielo e luci dell'ora; poi le luci proprie di mura e castello e le ombre finte di cavaliere e cavallo. */
// Copia di cieloScena.luceGiorno (0 notte → 1 giorno) con il nome di prima del passo 0: altre sessioni la usano
// già nei loro branch (luci lontane, luci di rocche e borghi), così le loro unioni restano valide.
let _luceGiorno = 1;
function aggiornaCielo() {
  const cambiato = cieloScena.aggiorna(Calendar.oraDelGiorno());
  _luceGiorno = cieloScena.luceGiorno;
  if (!cambiato) return;
  const giorno = _luceGiorno;
  const luceRiflessa = 0.2 + 0.8 * giorno;
  for (const e of emissivi) e.m.emissive.copy(e.base).multiplyScalar(luceRiflessa);
  const ombra = knight && knight.object.getObjectByName('ombra-cavaliere');
  if (ombra) ombra.material.opacity = 0.35 + 0.65 * giorno;
  const ombraCavallo = cavallo && cavallo.object.getObjectByName('ombra-cavallo');
  if (ombraCavallo) ombraCavallo.material.opacity = 0.35 + 0.65 * giorno;
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
pannelloStato.innerHTML = '<div class="data"></div><div class="chi"></div>'
  + ATTRIBUTI.map(([id, nome]) => `<div class="attr ${id}"><span class="nome">${nome}</span>`
    + '<span class="barra"><i></i></span><span class="val"></span></div>').join('')
  + '<div class="onore"></div>';
hud.appendChild(pannelloStato);
const elData = pannelloStato.querySelector('.data');
const elOnore = pannelloStato.querySelector('.onore');
const elChi = pannelloStato.querySelector('.chi');
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
  imposta('chi', (v) => { elChi.textContent = v; }, `${Knight.nome} · ${Knight.titolo} · ${Knight.oro} oro`);
  imposta('onore', (v) => { elOnore.textContent = v; },
    `Onore ${Knight.onore > 0 ? '+' : ''}${Knight.onore}`);
}

// ─── Terreno, cavaliere, camera ─────────────────────────────────────────
let terrain = null;                       // terreno della Scena attuale
let knight = null;
let castle = null;                        // solo a Tavullia (fino a «rocca e borgo»)
let rocche = [];                          // M7, passo 3: rocche del mondo generato nel blocco (o vicine)
let ponti = [], gruppoPonti = null;       // strade, passo 4: ponti del blocco (suolo e ostacoli, js/3d/acqua.js)
let acqua = null;                         // superficie del mare a quota 0, se la Scena ne ha
let orizzonte = null;                     // terreno lontano attorno alla Scena (solo mondo generato)
let acqueScena = null;                    // fiumi e laghi in quota della Scena (mesh)
let livelliAcqua = null;                  // { fiume, lago, cols, cell, half }: pelo dell'acqua per vertice
let carta = null;                         // Carta del mondo generato (null a Tavullia)
let scenaAttuale = null;                  // { tipo: 'tavullia' } | { tipo: 'mondo', cx, cz } (centro, m del mondo)
let statPendenze = '';                    // percentili della pendenza della Scena (F3)
let vegetazione = null;                   // alberi, arbusti, rocce della Scena (vegetazione3d.js)
let villaggi = [];                        // M8: villaggi, ovili, monasteri ed eremi del blocco (villaggio3d.js)
let campagna = null;                      // M7, passo 5: case di campagna del blocco (edifici3d.js)
let abitanti = null;                      // M7, passo 7: persone di rocche e borghi (abitanti3d.js)
let vegetazioneVisibile = true;           // tasto V
// Il blocco del mondo si centra sulla griglia fissa del mondo (centroBlocco): le coordinate locali chieste per la
// Scena (rispetto al centro richiesto) si spostano di tanto in posizionaCavaliere.
let scostamento = { x: 0, z: 0 };

// Suolo calpestabile della Scena attuale: terreno + superfici costruite (cortile, rampa). Cavaliere e
// camera ricevono questi oggetti una volta sola; cambiando Scena cambia solo ciò a cui rimandano.
let _suolo = null;
const _sullaStrada = { d: Infinity, lato: 0, semi: 0, h: 0, classe: '' };
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
  // Sulla carreggiata di una strada o di un sentiero (js/mondo/strade.js): in salita si rallenta meno.
  suStrada: (x, z) => {
    const m = _suolo?.meta?.centroMondo, c = carta;
    if (!m || !c) return false;
    distanzaStrada(c, m.x + x, m.z + z, _sullaStrada);
    return _sullaStrada.d <= _sullaStrada.semi + 0.5;
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
let cavallo = null;                       // il cavallo del cavaliere (js/3d/cavallo3d.js)
let controls = null;                      // camera libera di debug (tasto C)
let modoCamera = 'segui';                 // 'segui' | 'libera'
const ALTEZZA_MIN_LIBERA = 3;             // m sopra il terreno, camera libera

// ─── Partita: modalità, nuova o ripresa dal salvataggio automatico ─────
// G1 (docs/EARLY_GAME.md §7): Storia (dalla Veglia) o Libera (senza storia, strumenti di sviluppo), scelte nel menu
// d'avvio prima della generazione del mondo; ognuna ha il suo autosave (Save.slotAutosave).
let modalita = 'libera';
const inStoria = () => modalita === 'storia';
let nonSalvare = false;                   // true mentre si torna al menu dopo aver salvato, o nel percorso di prova

/** Stato di una partita nuova. Storia: il garzone della Veglia. Libera: Cavaliere Errante già armato, fuori Veglia. */
function nuovaPartitaDati(m, nome) {
  Knight.init(nome || nomeCasuale());
  Calendar.init();
  if (typeof Events !== 'undefined' && Events.reset) Events.reset();
  if (typeof News !== 'undefined' && News.reset) News.reset();
  if (typeof Conoscenza !== 'undefined') Conoscenza.reset();
  if (m === 'libera') {
    Knight.promuovi('errante');
    Object.assign(Knight.equip, { arma: 'Spada da arme', armatura: 'Cotta di maglia', scudo: 'Scudo di legno' });
    Knight.oro = 60;
    Knight.addestramento = 3;
    Calendar.fineVeglia();
    // Knight.cavallo resta null finché la milestone Cavallo non corregge isMounted (oggi conterebbe anche a piedi):
    // il cavallo 3D c'è comunque in Libera (posizionaCavaliere).
  }
}

function salvaOra() {
  if (knight && !nonSalvare) Save.save(Save.slotAutosave(modalita));
}

/** F8: salva e torna al menu d'avvio (lì si continua, si cambia modalità o si comincia una partita nuova). */
function tornaAlMenu() {
  salvaOra();
  nonSalvare = true;
  Save.stopAutosave();
  const url = new URL(window.location.href);
  for (const k of ['seme', 'terreno', 'storia', 'libera', 'carta']) url.searchParams.delete(k);
  window.location.replace(url);
}

/** In Storia gli strumenti di sviluppo sono spenti: avvisa e dice di no. */
function soloInLibera(cosa) {
  if (!inStoria()) return true;
  messaggio(`${cosa}: solo nella modalità Libera (F8 torna al menu).`);
  return false;
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

// Avanza (T, solo per i test: niente salti di tempo senza motivo, docs/GDD.md §3): salto atomico
// all'inizio della prossima ora canonica. Da fermi si recupera come aspettando.
function avanza() {
  if (!knight || inPausa) return;
  if (!soloInLibera('Avanza (T)')) return;      // GDD §3: Avanza resta solo per i test
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
      messaggio('Sei riposato: la Forza è piena.');
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

// ─── Porte degli edifici → Carta del cronista (M7, passo 6) ─────────────
// Vicino alla porta di un edificio nominato (taverna, stalla, cappella…), a piedi e rivolto verso di essa, compare
// «E: entra — Taverna»; E apre la Carta del cronista (più sotto). Entrare non costa tempo; costano le azioni scelte,
// con la loro durata (GDD §3). Niente interni 3D. Il tasto è provvisorio: la scelta dei tasti è rinviata dall'utente.
const PORTA = { distanza: 2.4, rivolto: 0.35, tasto: 'KeyE', nomeTasto: 'E' };
const RIGHE_CRONISTA = {
  stalla: 'Odore di fieno e di cavalli; lo stalliere alza appena gli occhi dal lavoro.',
  taverna: "Fumo, voci e boccali: chi ha sete, chi ha notizie, chi cerca guai.",
  fabbro: "Il martello batte sull'incudine; la forgia arrossa le pareti annerite.",
  guaritore: 'Erbe appese ad asciugare, ampolle e un odore amaro di decotti.',
  loggia: 'Sotto la loggia i mercanti contrattano a voce alta.',
  loggiaGrande: 'Sotto la loggia grande si tratta, si giudica, si annunciano bandi.',
  chiesa: 'Penombra, cera e pietra fredda; un canto lontano dal coro.',
  cappella: 'Una cappella piccola e spoglia: una lampada accesa davanti all\'altare.',
  salaArmi: "Rastrelliere di lance e scudi; un maestro d'armi osserva chi entra.",
  armeria: 'Lame, maglie e corazze in fila: tutto ha un prezzo.',
  palazzetto: "Una casa-forte di pietra: il signore vive qui, tra le carte e le armi di famiglia.",
  palazzoMinore: "Un servo vi ferma sulla soglia: il signore riceve solo chi è annunciato.",
  palazzo: "Arazzi, un camino acceso e un lungo tavolo: la sala grande della casata.",
  palazzoMaggiore: "Scale di pietra, stemmi alle pareti e un brusio di cortigiani: qui si decide la sorte della regione.",
  pozzo: "L'acqua è fredda e profonda; la corda è consumata dalle mani.",
  // Corte del signore (M7, passo 10c) e monastero (M8, passo 3).
  cucina: 'Il fuoco è sempre acceso; pentole di rame e un odore di pane e brodo.',
  cantina: "Botti in fila nel fresco; il cellerario conta gli orci a mente.",
  colombaia: 'Un battito d\'ali nel buio: i colombi tornano al loro fusto di pietra.',
  scuderia: 'Selle lucide e cavalli da battaglia: nessuno li monta senza permesso.',
  foresteria: 'Letti per i pellegrini, una brocca d\'acqua e nessuna domanda.',
  infermeria: 'Pochi letti, erbe e silenzio: qui si guarisce o si prega.',
  dormitorio: 'File di giacigli sotto le travi; di giorno non c\'è nessuno.',
  biblioteca: 'Banchi da copista, inchiostro e pergamene legate con cura.',
  refettorio: 'Tavole lunghe e un leggio: si mangia mentre uno legge.',
};
let cronista = null;                       // la Carta del cronista aperta (elemento), o null
let personaVicina = null;                  // abitante a portata di «E: parla» (abitanti3d.js)

// Un solo gestore del tasto d'azione (E): la prima voce disponibile, in ordine di priorità, agisce. Le altre
// sessioni aggiungono qui la loro voce invece di un proprio keydown (persona vicina in testa, cavallo in fondo).
const AZIONI_TASTO = [
  { nome: 'parla', pronta: () => personaVicina,
    esegui: () => apriCronista({ nome: personaVicina.nome, riga: abitanti.riga(personaVicina) }) },
  { nome: 'porta', pronta: () => portaVicina, esegui: () => apriCronista(portaVicina, portaLuogo) },
];
let portaVicina = null;                    // { nome, tipo, porta } dell'edificio vicino, o null
let portaLuogo = null;                     // il luogo (carta.luoghi) dell'edificio vicino: la Veglia vale nel borgo di partenza
let _invitoPorta = null;
function cercaPortaVicina() {
  portaVicina = null;
  personaVicina = null;
  if (!knight || cronista || percorso) { if (_invitoPorta) _invitoPorta.hidden = true; return; }
  const st = knight.stato, dx0 = Math.sin(st.direzione), dz0 = Math.cos(st.direzione);
  personaVicina = abitanti?.personaVicina(st.x, st.z, st.direzione) ?? null;
  let migliore = PORTA.distanza;
  for (const r of [...rocche, ...villaggi]) {
    for (const e of r.edifici ?? []) {
      const p = e.porta;
      if (p.x === undefined) continue;
      const ex = st.x - p.x, ez = st.z - p.z, d = Math.hypot(ex, ez);
      if (d > migliore) continue;
      if (ex * p.nx + ez * p.nz < -0.3) continue;                      // dalla parte giusta della porta
      if (-(dx0 * p.nx + dz0 * p.nz) < PORTA.rivolto) continue;        // rivolto verso la porta
      migliore = d;
      portaVicina = e;
      portaLuogo = r.luogo ?? null;
    }
  }
  if (!_invitoPorta) _invitoPorta = avvisoHud('', 'messaggio');
  _invitoPorta.hidden = !portaVicina && !personaVicina;
  if (personaVicina) _invitoPorta.textContent = `${PORTA.nomeTasto}: parla — ${personaVicina.nome}`;
  else if (portaVicina) _invitoPorta.textContent = `${PORTA.nomeTasto}: entra — ${portaVicina.nome}`;
}

// Scavalcamento (Spazio, contestuale; niente salto libero): l'invito compare quando davanti, entro un metro, c'è
// un ostacolo o uno stacco che si può superare (knight3d.js, cercaScavalco). Cercato ogni ~0,2 s.
let scavalcaRichiesto = false, _invitoScavalco = null, _tScavalco = 0;
function cercaScavalcoVicino(dt) {
  if ((_tScavalco += dt) < 0.2) return;
  _tScavalco = 0;
  const p = knight && !cronista && !percorso && !inPausa && !knight.stato.scavalco ? knight.cercaScavalco() : null;
  if (!_invitoScavalco) { _invitoScavalco = avvisoHud('', 'messaggio'); _invitoScavalco.style.top = '80px'; }
  _invitoScavalco.hidden = !p || portaVicina || personaVicina;
  if (p) _invitoScavalco.textContent = `Spazio: ${p.tipo === 'sali' ? 'sali' : 'scavalca'}`;
}
// Carta del cronista (G1, passo 2, interfaccia.js): mentre è aperta il tempo non scorre e il cavaliere non si muove.
// Nel borgo di partenza, durante la Veglia, le porte aprono gli eventi `veglia.*` (js/data/events_veglia.js) con le
// azioni che costano la loro durata in minuti; altrove (e in Libera) la carta ha il nome e una riga.
const cartaCronista = creaCartaCronista({
  onApri: () => { cronista = true; tasti.clear(); if (_invitoPorta) _invitoPorta.hidden = true; },
  onChiudi: () => { cronista = null; tasti.clear(); salvaOra(); },
});
const ESCI = { testo: 'Esci', scegli: () => cartaCronista.chiudi() };

/** Nome della casata della rocca di partenza (dal seme; G3 lo riprenderà). */
const nomeCasata = () => (typeof vegliaNomeCasata === 'function' ? vegliaNomeCasata(carta?.seme ?? 0) : 'la casata');

/** Dormire fino a Prima in un luogo del borgo (stalla, taverna): come R di sera, più i bonus del letto. */
function dormiNelBorgo({ dove, forza = 0, salute = 0 }) {
  const prima = Knight.forza.cur;
  const passi = Calendar.avanzaFinoA(0);
  Knight.riposaPassi(passi);
  Knight.forza.cur = Math.min(Knight.forza.max, Knight.forza.cur + forza);
  Knight.salute.cur = Math.min(Knight.salute.max, Knight.salute.cur + salute);
  if (typeof Events !== 'undefined') Events.tickDeadlines();
  return `Dormi ${dove} fino a Prima (${_ore(passi)})${_guadagno(prima)}`;
}
/** Una notizia diventa un foglio nello scrittoio (J), con l'avviso d'arrivo. */
function annotaNotizia(doc) {
  const quando = `${Calendar.oraCanonica()} del ${Calendar.inVeglia ? `giorno ${Calendar.giornoVeglia}` : `Diario ${Calendar.diario}`}`;
  const d = { ...doc, fonte: doc.fonte ? `${doc.fonte}, a ${quando}` : null };
  News.emit({ tipo: d.tipo === 'voce' ? 'rumor' : 'evento', tag: d.tag || d.tipo, testo: d.testo, doc: d }, true);
  avvisoFoglio(d, d.tipo === 'voce' ? 'Una voce annotata nello scrittoio' : d.tipo === 'bando' ? 'Un bando è stato affisso' : 'Una lettera giunge da lontano');
}
const contestoEventi = () => ({ casata: nomeCasata(), dormi: dormiNelBorgo, notizia: annotaNotizia });

// Scrittoio (J): i fogli delle notizie che il cavaliere ha ricevuto, dal più recente. Mentre è aperto il gioco è fermo.
const scrittoio = creaScrittoio({
  elenco: () => (typeof News === 'undefined' ? [] : News.ultime(200).filter((t) => t.doc).map((t) => ({ ...t.doc, id: t.id }))),
  onApri: () => { cronista = true; tasti.clear(); if (_invitoPorta) _invitoPorta.hidden = true; },
  onChiudi: () => { cronista = null; tasti.clear(); },
});

/** Evento della Veglia per la porta di un edificio del borgo di partenza, o null. */
function eventoDellaPorta(e, luogo) {
  if (!Calendar.inVeglia || !luogo?.partenza || typeof vegliaEventoPer !== 'function') return null;
  const presenti = new Set();
  for (const r of rocche) if (r.luogo?.partenza) for (const ed of r.edifici ?? []) presenti.add(ed.tipo);
  const id = vegliaEventoPer(e.tipo, presenti);
  return id ? Events.getById(id) : null;
}

function mostraEvento(ev, luogo) {
  const ctx = Events._ctx(contestoEventi());
  const titolo = ev.title;
  if (ev.aperto && !ev.aperto(ctx)) {
    cartaCronista.mostra({ titolo, testo: ev.chiuso ?? 'Chiuso.', opzioni: [ESCI] });
    return;
  }
  cartaCronista.mostra({
    titolo,
    testo: typeof ev.text === 'function' ? ev.text(ctx) : ev.text,
    nota: `${Calendar.oraCanonica()} · ${Knight.oro} oro · Forza ${Math.ceil(Knight.forza.cur)}`,
    opzioni: ev.options.map((o) => ({
      testo: o.text, etichetta: o.prereqLabel,
      disponibile: !o.prereq || !!o.prereq(ctx),
      scegli: () => scegliOpzione(ev, o, luogo),
    })),
  });
}

function scegliOpzione(ev, o, luogo) {
  if (!o.effects?.length && !o.reply) { cartaCronista.chiudi(); return; }
  const righe = Events.applyEffects(o.effects, contestoEventi());
  Events.markSeen(ev);
  salvaOra();
  // Dopo l'investitura la Veglia è finita: la carta non torna agli eventi della Veglia.
  const ancora = Calendar.inVeglia ? [{ testo: 'Indietro', scegli: () => mostraEvento(ev, luogo) }] : [];
  cartaCronista.mostra({ titolo: ev.title, testo: o.reply ?? '', righe, opzioni: [...ancora, ESCI] });
}

function apriCronista(e, luogo = null) {
  const ev = eventoDellaPorta(e, luogo);
  if (ev) { mostraEvento(ev, luogo); return; }
  const nota = Calendar.inVeglia && e.porta
    ? 'Qui nessuno ha lavoro per un garzone che non conosce.'
    : e.nota ?? (e.porta ? 'Le azioni di questo luogo arriveranno con le missioni.' : null);
  cartaCronista.mostra({
    titolo: e.nome,
    testo: e.riga ?? RIGHE_CRONISTA[e.tipo] ?? 'Qui finisce la strada e comincia il racconto.',
    nota, opzioni: [ESCI],
  });
}
function chiudiCronista() { cartaCronista.chiudi(); }

// ─── Luci vicine (M7, passo 7) ──────────────────────────────────────────
// Le sorgenti di borghi, rocche e campagna (torce, forge) sono molte; PointLight vere solo per le LUCI_VICINE più
// vicine al cavaliere, sempre le stesse (un numero fisso di luci: niente ricompilazione degli shader). Le altre
// restano fiamme e aloni. Con la luce della torre-porta di ogni rocca si resta nelle 4–6 previste.
const LUCI_VICINE = { quante: 4, raggio: 70 };
const _luciVicine = [];
function luciVicine(t, buio) {
  if (!_luciVicine.length) {
    for (let i = 0; i < LUCI_VICINE.quante; i++) {
      const l = new THREE.PointLight('#ff9a40', 0, 14, 1.7);
      l.name = 'luce-vicina';
      scene.add(l);
      _luciVicine.push(l);
    }
  }
  const f = Math.min(1, Math.max(0, (buio - 0.15) / 0.5));
  const st = knight?.stato;
  const tutte = [];
  if (f > 0 && st) {
    for (const r of [...rocche, ...villaggi, campagna]) for (const sg of r?.sorgenti ?? []) {
      const d = Math.hypot(sg.x - st.x, sg.z - st.z);
      if (d < LUCI_VICINE.raggio) tutte.push({ sg, d });
    }
    tutte.sort((a, b) => a.d - b.d);
  }
  _luciVicine.forEach((l, i) => {
    const v = tutte[i];
    if (!v) { l.intensity = 0; return; }
    const tremolio = 0.85 + 0.1 * Math.sin(t * 13.1 + i * 1.7) + 0.05 * Math.sin(t * 23.7 + i);
    l.position.set(v.sg.x, v.sg.y, v.sg.z);
    l.color.set(v.sg.colore);
    l.distance = v.sg.distanza;
    l.intensity = v.sg.intensita * f * tremolio;
  });
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
    // Modelli della vegetazione condivisi tra i blocchi (userData.condivisa): li usa già il blocco nuovo.
    if (!o.geometry?.userData.condivisa) o.geometry?.dispose();
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
 * M7, passo 3: le rocche dei luoghi il cui piano tocca il blocco (o gli sta a meno di 150 m), costruite in
 * coordinate del blocco. Il terreno sotto viene dal blocco e, fuori, dalla stessa quota del mondo (quotaFinale):
 * una rocca tagliata dal bordo del blocco si costruisce intera.
 */
function* costruisciRocche(cx, cz, ter) {
  const half = ter.size / 2, out = [];
  const suoloMondo = {
    getHeight: (x, z) => (Math.abs(x) <= half && Math.abs(z) <= half ? ter.getHeight(x, z) : quotaFinale(carta, x + cx, z + cz)),
  };
  for (const l of carta?.luoghi ?? []) {
    if (!l.piani) continue;
    if (l.tipo === 'monastero') continue;        // M8, passo 3: qui si costruisce il monastero (costruisciVillaggi)
    const x = l.x - cx, z = l.z - cz, m = (l.raggioPiani ?? 300) + 50;
    if (Math.abs(x) > half + m || Math.abs(z) > half + m) continue;
    // Carte di prima delle forme irregolari (senza poligoni): niente rocca (la cache si rigenera con la versione).
    if (!l.piani[0].poligono) continue;
    const clima = climaDi(l.x, l.z);
    const rocca = yield* createRoccaAPezzi(suoloMondo, l, x, z, clima);         // cinta poligonale, porta verso il borgo (M7)
    out.push(rocca);
    // M7, passo 4: il borgo murato in pendio, addossato alla rocca.
    if (l.piani.length > 1) out.push(yield* createBorgoAPezzi(suoloMondo, l, x, z, rocca, clima));
  }
  return out;
}

/**
 * M8, passi 2 e 3: villaggi, ovili ed eremi (carta.siti) e monasteri (carta.luoghi) il cui ingombro tocca il blocco o
 * gli sta a meno di 50 m, costruiti interi in coordinate del blocco (fuori dal blocco il terreno viene da quotaFinale,
 * come per le rocche).
 */
function* costruisciVillaggi(cx, cz, ter) {
  const half = ter.size / 2, out = [];
  const suoloMondo = {
    getHeight: (x, z) => (Math.abs(x) <= half && Math.abs(z) <= half ? ter.getHeight(x, z) : quotaFinale(carta, x + cx, z + cz)),
  };
  for (const s of carta?.siti ?? []) {
    const eremo = s.tipo === 'eremo', rovina = s.tipo === 'rovina' || s.tipo === 'abbandonato';
    const mistero = s.tipo === 'grotta' || s.tipo === 'fantastico';
    if (s.tipo !== 'villaggio' && s.tipo !== 'ovile' && !eremo && !rovina && !mistero) continue;
    const x = s.x - cx, z = s.z - cz, m = raggioSito(s) + 50;
    if (Math.abs(x) > half + m || Math.abs(z) > half + m) continue;
    if (mistero) out.push(yield* createMisteroAPezzi(suoloMondo, s, x, z, carta));        // M8, passo 5
    else if (rovina) out.push(yield* createRovinaAPezzi(suoloMondo, s, x, z, carta));     // M8, passo 4
    else out.push(eremo ? yield* createEremoAPezzi(suoloMondo, s, x, z, carta)
      : yield* createVillaggioAPezzi(suoloMondo, s, x, z, carta, cx, cz));
  }
  // M8, passo 3: i monasteri sono rocche che hanno cambiato tipo, quindi hanno già il terrapieno e il poligono del
  // piano; `costruisciRocche` li salta e li costruiamo qui, con la stessa regola di inclusione delle rocche.
  for (const l of carta?.luoghi ?? []) {
    if (l.tipo !== 'monastero' || !l.piani?.[0]?.poligono) continue;
    const x = l.x - cx, z = l.z - cz, m = (l.raggioPiani ?? 300) + 50;
    if (Math.abs(x) > half + m || Math.abs(z) > half + m) continue;
    out.push(yield* createMonasteroAPezzi(suoloMondo, l, x, z, carta));
  }
  return out;
}

/** Toglie dalla scena gli oggetti della Scena attuale; se `subito` li libera ora, altrimenti a pezzi (M7, passo 9). */
function togliScenaAttuale(subito = true) {
  for (const o of [terrain?.mesh, acqua, castle?.object, orizzonte?.oggetto, acqueScena, vegetazione?.oggetto,
    ...rocche.map((r) => r.object), ...villaggi.map((r) => r.object), gruppoPonti, campagna?.object, abitanti?.object]) {
    if (!o) continue;
    scene.remove(o);
    if (subito) libera(o); else daLiberare.push(o);
  }
  rocche = [];
  villaggi = [];
  campagna = null;
  abitanti = null;
  ponti = []; gruppoPonti = null;
  vegetazione = null;
  castle = null;
  acqua = null;
  orizzonte = null;
  acqueScena = null;
  livelliAcqua = null;
  emissivi = [];
  ostacoli.length = 0;
  occlusori.length = 0;
}
const daLiberare = [];                    // oggetti del blocco vecchio da liberare uno per fotogramma (passo 9)

/**
 * Scena del mondo centrata in (desc.cx, desc.cz), preparata a pezzi senza toccare quella attuale (M7, passo 9): un
 * generatore che fa yield tra un lavoro e l'altro e restituisce gli oggetti pronti per applicaMondo.
 */
function* preparaMondo(desc) {
  const cx = centroBlocco(desc.cx), cz = centroBlocco(desc.cz);
  const { meta, heights, acqua: dati } = yield* generaScenaAPezzi(carta, cx, cz);
  const ter = yield* createTerrainAPezzi(meta, heights, false, coloreMondo(carta, Calendar.stagione));
  yield 'terreno';
  const acque = creaAcqueScena(dati, meta, COLORE_ACQUA, meta.centroMondo, coloreStrada(carta));
  // Suolo delle carreggiate: serve ai ponti (testate alla quota della strada, non del terreno: niente gradino) e poi
  // al suolo composto della Scena.
  const strade = suoloStrade(acque, (x, z) => ter.getHeight(x, z));   // con la rampa dal prato sul bordo (#181)
  const pp = creaPonti(dati.attraversamenti, dati.altezza, strade.quotaSuolo);
  yield 'acque e ponti';
  const roc = yield* costruisciRocche(cx, cz, ter);
  yield 'rocche';
  const vil = yield* costruisciVillaggi(cx, cz, ter);
  yield 'villaggi';
  const posVeg = yield* posizionaVegetazioneAPezzi({
    heights, cols: meta.cols, cell: meta.cellSize, cx, cz, acqua: dati,
    copertura: coperturaMondo(carta, Calendar.stagione), seme: carta.seme, carta,
    piani: [...(carta.luoghi || []).flatMap((l) => l.piani || []),
      ...(carta.siti || []).filter((s) => s.tipo === 'villaggio' || s.tipo === 'ovile' || s.tipo === 'eremo').map((s) => pianoDelSito(s)),
      // Rovine e abbandonati: cerchio più stretto, gli alberi stanno fuori dai muri ma il bosco se li riprende.
      ...(carta.siti || []).filter((s) => s.tipo === 'rovina' || s.tipo === 'abbandonato').map((s) => pianoDelSito(s, 0.45)),
      // Grotte e luoghi del fantastico: cerchio ancora più stretto, stanno dentro il paesaggio che li circonda.
      ...(carta.siti || []).filter((s) => s.tipo === 'grotta' || s.tipo === 'fantastico').map((s) => pianoDelSito(s, 0.4))], mare: true,
  }, MS_PEZZO);
  yield 'posizione vegetazione';
  const veg = yield* creaVegetazioneAPezzi(posVeg, ter, renderer, MS_PEZZO);   // il terreno nuovo, mai quello in scena
  yield 'vegetazione';
  // Case di campagna (passo 5) sui siti della vegetazione (aia e orto già liberi attorno).
  let camp = null;
  if (posVeg.case?.length) {
    const half = ter.size / 2;
    const suoloC = { getHeight: (x, z) => (Math.abs(x) <= half && Math.abs(z) <= half ? ter.getHeight(x, z) : quotaFinale(carta, x + cx, z + cz)) };
    camp = creaCaseCampagna(suoloC, posVeg.case, cx, cz, carta.seme, climaDi(cx, cz));
    yield 'case';
  }
  // Colore del blocco in una texture (docs/PRESTAZIONI.md, passo 3): dopo la vegetazione, che aggiunge al terreno
  // l'attributo aSuolo (lettiera sotto il bosco, fango vicino all'acqua) letto dalla cottura.
  const msCot = cuociSuolo(renderer, ter);
  // I materiali nuovi nascono con il rilievo; il terreno qui non è ancora nella scena, si cerca in lui.
  if (qualita.chiave === 'basso') applicaRilievo(false, ter.mesh);
  yield 'cottura';
  // Orizzonte: terreno lontano fino a ~110 km. Le pareti laterali del blocco si vedrebbero dall'esterno.
  const oriz = yield* creaOrizzonteAPezzi(carta, cx, cz, ter, COLORE_ACQUA, Calendar.stagione);
  const msCotOriz = yield* cuociOrizzonteAPezzi(renderer, oriz, ter);   // colore degli anelli in texture (prestazioni)
  // Bosco lontano: sagome degli alberi negli anelli fino a ~4 km (niente stacco al bordo del blocco).
  yield 'orizzonte: luoghi';
  yield* veg.aggiungiLontanoAPezzi(carta, cx, cz, oriz.quota, Calendar.stagione, MS_PEZZO);
  yield 'bosco lontano';
  // Prima ombra del sole sulla vegetazione: senza, il primo aggiorna() dopo lo scambio la calcola tutta.
  yield* veg.preparaOmbre(sole.position, MS_PEZZO);
  yield 'ombre';
  // Shader e texture pronti prima dello scambio (note di M1): niente compilazioni né caricamenti nel suo fotogramma.
  yield* preparaScheda([ter.mesh, acque, pp.gruppo, ...roc.map((r) => r.object), ...vil.map((r) => r.object), veg.oggetto, camp?.object,
    oriz.oggetto, oriz.acqua]);
  return { desc: { ...desc, cx, cz }, scostamento: { x: desc.cx - cx, z: desc.cz - cz }, meta, dati, ter, acque, strade, pp, roc, vil,
    veg, camp, msCot, msCotOriz, oriz };
}

/**
 * Compila in parallelo i materiali degli oggetti non ancora in scena, con le luci della scena (compileAsync: fa yield
 * della promessa e avanzaBlocco aspetta senza fermare i fotogrammi), poi carica sulla scheda le loro texture, una per pezzo.
 * Le geometrie salgono al primo disegno.
 */
function* preparaScheda(oggetti) {
  const texture = new Set();
  const raccogli = (v) => { if (v?.isTexture) texture.add(v); };
  for (const o of oggetti) {
    if (!o) continue;
    yield renderer.compileAsync(o, camera, scene);
    o.traverse((m) => {
      for (const mat of [m.material].flat()) {
        if (!mat) continue;
        for (const v of Object.values(mat)) raccogli(v);
        for (const u of Object.values(mat.uniforms || {})) raccogli(u?.value);
      }
    });
  }
  for (const t of texture) {
    renderer.initTexture(t);
    yield 'texture';
  }
}

/** Mette in scena una Scena del mondo preparata da preparaMondo (la scena attuale è già stata tolta). */
function applicaMondo(p) {
  scostamento = p.scostamento;
  terrain = p.ter;
  acqueScena = p.acque;
  if (acqueScena) scene.add(acqueScena);
  ({ gruppo: gruppoPonti, ponti } = p.pp);
  scene.add(gruppoPonti);
  ostacoli.push(...ponti);
  occlusori.push(...ponti.flatMap((q) => q.solidi));
  const { meta, dati } = p;
  livelliAcqua = { fiume: dati.fiume, lago: dati.lago, cols: meta.cols, cell: meta.cellSize, half: meta.sizeMeters / 2 };
  rocche = p.roc;
  for (const r of rocche) {
    scene.add(r.object);
    raccogliEmissivi(r.object);
    ostacoli.push(r);
    occlusori.push(...r.solidi);
  }
  villaggi = p.vil ?? [];
  for (const r of villaggi) {
    scene.add(r.object);
    raccogliEmissivi(r.object);
    ostacoli.push(r);
    occlusori.push(...r.solidi);
  }
  vegetazione = p.veg;
  campagna = p.camp;
  if (campagna) {
    scene.add(campagna.object);
    raccogliEmissivi(campagna.object);
    ostacoli.push(campagna);
    occlusori.push(...campagna.solidi);
  }
  msCottura = p.msCot;
  msCotturaOrizzonte = p.msCotOriz;
  vegetazione.oggetto.visible = vegetazioneVisibile;
  scene.add(vegetazione.oggetto);
  ostacoli.push(vegetazione);              // tronchi, massi, affioramenti e sassi grandi
  scene.add(terrain.mesh);
  orizzonte = p.oriz;
  scene.add(orizzonte.oggetto);
  const pareti = terrain.mesh.getObjectByName('terreno-bordo');
  if (pareti) pareti.visible = false;
  acqua = orizzonte.acqua;
  if (acqua) scene.add(acqua);
  // Le strade per ultime: sotto un ponte la carreggiata nell'alveo non deve vincere sull'impalcato.
  // Le rocce basse (fino a 40 cm) fanno suolo: ci si sale sopra come su un gradino (knight3d.js).
  _suolo = componiSuolo(terrain, [...rocche, ...ponti, p.strade ?? suoloStrade(acqueScena, (x, z) => terrain.getHeight(x, z))],
    vegetazione?.quotaOstacoli ? [vegetazione] : []);
  // Persone ai loro posti e per le strade (passo 7), sul suolo composto. Al cambio di blocco (scambiaBlocco) si rifanno
  // con rocche e borghi, già nelle coordinate del blocco nuovo: non serve spostarle (abitanti.sposta resta per altri usi).
  if (rocche.length) {
    abitanti = creaAbitanti({ rocche, quota: (x, z) => suolo.getHeight(x, z), seme: carta.seme });
    scene.add(abitanti.object);
    ostacoli.push(abitanti);
  }
  scenaAttuale = p.desc;
  statPendenze = misuraPendenze(terrain);
  cieloScena.invalida();                   // ricalcola le luci
}

/**
 * Carica una Scena al posto di quella attuale.
 * @param {{tipo:'tavullia'} | {tipo:'mondo', cx:number, cz:number}} desc
 */
async function caricaScena(desc) {
  chiudiCronista();
  preparazione = null;                    // un cambio di blocco in corso non vale più
  togliScenaAttuale(true);
  scostamento = { x: 0, z: 0 };
  if (desc.tipo === 'mondo') {
    applicaMondo(completa(preparaMondo(desc)));
    return;
  }
  if (desc.tipo === 'tavullia') {
    terrain = await loadTerrain('tavullia');
    if (terrain.isFallback) avvisoHud('Dati del terreno reale non trovati: terreno procedurale di prova.');
    castle = createCastle(terrain);
    scene.add(castle.object);
    raccogliEmissivi(castle.object);
    ostacoli.push(castle);
    occlusori.push(...castle.solidi);
  }
  if (desc.tipo === 'tavullia') {
    // Profilo fisso di collina temperata; niente vegetazione sul colle del castello e sulla rampa.
    const m = terrain.meta, C = castle.cfg;
    vegetazione = creaVegetazione(posizionaVegetazione({
      heights: terrain.heights, cols: m.cols, cell: m.cellSize, cx: 0, cz: 0, acqua: null,
      copertura: coperturaTavullia(), seme: 7,
      piani: [{ cx: C.x, cz: C.z, ux: 1, uz: 0, a: C.lato / 2 + 9, b: C.lato / 2 + 9, r: 4, s: 10 }],
      mare: terrain.minElev < 0,
    }), terrain, renderer);
  }
  vegetazione.oggetto.visible = vegetazioneVisibile;
  scene.add(vegetazione.oggetto);
  ostacoli.push(vegetazione);              // tronchi, massi, affioramenti e sassi grandi
  scene.add(terrain.mesh);

  if (terrain.minElev < 0) {
    acqua = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.size, terrain.size).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORE_ACQUA, transparent: true, opacity: 0.88 }));
    acqua.name = 'acqua';
    scene.add(acqua);
  }
  _suolo = componiSuolo(terrain, castle ? [castle] : [...rocche, ...ponti], vegetazione?.quotaOstacoli ? [vegetazione] : []);
  scenaAttuale = desc;
  statPendenze = misuraPendenze(terrain);
  cieloScena.invalida();                   // ricalcola le luci (anche quelle proprie del castello)
}

/** Mette il cavaliere in (x, z) locali della Scena attuale; lo crea la prima volta. */
function posizionaCavaliere(x, z, direzione) {
  x += scostamento.x; z += scostamento.z;
  if (!knight) {
    knight = createKnight(suolo, { x, z, direzione }, ostacoli);
    scene.add(knight.object);
  } else {
    Object.assign(knight.stato, { x, z, direzione, velocita: 0, velAngolare: 0, velEffettiva: 0 });
    knight.update(0, { avanti: 0, gira: 0, giroMouse: 0, corsa: false, camminata: false });
  }
  _prec.x = knight.stato.x; _prec.y = knight.stato.y; _prec.z = knight.stato.z;   // niente fatica per il salto
  // Cavallo accanto al cavaliere; è anche un ostacolo per lui (la lista si rifà a ogni Scena). In Storia il garzone
  // parte a piedi: il cavallo arriva comprandolo (G1, passo 3).
  if (!cavallo && (!inStoria() || Knight.cavallo)) {
    cavallo = createCavallo(suolo, ostacoli);
    scene.add(cavallo.object);
  }
  if (cavallo) {
    cavallo.posizionaAccanto(knight.stato);
    if (!ostacoli.includes(cavallo)) ostacoli.push(cavallo);
  }
  if (cam) {
    if (modoCamera === 'libera') cambiaModoCamera();
    cam.riattiva();
  }
}

const NOMI_CLASSI = { minore: 'rocca minore', casata: 'castello di casata', maggiore: 'sede maggiore', citta: 'città' };
const PARTENZA_DAL_SITO = 170;   // m dalla rocca verso il borgo, se il sito non ha ancora la porta (Carte di prima)
const FUORI_DALLA_PORTA = 35;    // m fuori dalla porta del borgo (M7, passo 2: fine del terrapieno del borgo)

/** Punto di partenza (locale alla Scena centrata sul sito) e direzione: fuori dalla porta del borgo, verso la rocca. */
function partenzaDelSito(sito) {
  const d = FUORI_DALLA_PORTA, P = sito.porta;
  // La porta guarda fuori lungo la sua normale (forme irregolari: non più per forza lungo il verso).
  const v = P && P.nx !== undefined ? { x: P.nx, z: P.nz } : sito.verso;
  const p = P ? { x: P.x - sito.x + v.x * d, z: P.z - sito.z + v.z * d }
    : { x: v.x * PARTENZA_DAL_SITO, z: v.z * PARTENZA_DAL_SITO };
  return { ...p, direzione: Math.atan2(-v.x, -v.z) };
}

/** Centro della prima Scena se la Carta non ha rocche: collina (250–600 m) la più vicina al centro della Carta. */
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

/** Dalla Carta: la Scena centrata su una rocca (M7), con il cavaliere fuori dalla porta del borgo. */
async function entraNelSito(cartaScelta, sito) {
  carta = cartaScelta;
  await caricaScena({ tipo: 'mondo', cx: sito.x, cz: sito.z });
  const p = partenzaDelSito(sito);
  posizionaCavaliere(p.x, p.z, p.direzione);
  scriviIndirizzo();
  cartaVista.chiudi();
  messaggio(`Rocca ${sito.id + 1} (${NOMI_CLASSI[sito.classe]}), seme ${carta.seme}.`);
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

/**
 * Scelta d'avvio (G1, passo 1): menu prima della generazione del mondo, con le partite salvate, i file JSON da
 * scaricare o caricare e la partita nuova (seme casuale se non scritto). ?storia o ?libera lo saltano (continua la
 * partita di quella modalità, o ne comincia una se non c'è, sul ?seme= dell'indirizzo se c'è).
 */
async function sceltaDiAvvio() {
  const partite = { storia: Save.infoPartita('storia'), libera: Save.infoPartita('libera') };
  const diretta = PARAMETRI.has('storia') ? 'storia' : PARAMETRI.has('libera') ? 'libera' : null;
  if (diretta) {
    return { modalita: diretta, nuova: !partite[diretta], seme: PARAMETRI.get('seme') ?? '', luogo: TAVULLIA ? 'tavullia' : 'partenza' };
  }
  return mostraMenuAvvio({
    partite,
    esporta: (m) => Save.esporta(m),
    leggiFile: (testo) => Save.leggiFile(testo),
  });
}

async function init() {
  // Percorso di prova (?prova): niente menu e niente salvataggio letto né scritto, così parte sempre dalla partenza
  // standard del seme (misure confrontabili) e non tocca le partite dell'utente. Come una partita Libera nuova.
  if (PROVA_PRESTAZIONI) nonSalvare = true;
  const scelta = PROVA_PRESTAZIONI
    ? { modalita: 'libera', nuova: true, seme: PARAMETRI.get('seme') ?? '', luogo: TAVULLIA ? 'tavullia' : 'partenza' }
    : await sceltaDiAvvio();
  modalita = scelta.modalita;
  const slot = Save.slotAutosave(modalita);
  // Partita da file: entra nello slot della sua modalità (se localStorage lo permette) e si riprende da lì.
  if (scelta.importa) Save.importa(modalita, scelta.importa);
  const ripresa = scelta.importa ? Save.applyBlob(scelta.importa.data) : !scelta.nuova && await Save.load(slot);
  if (!ripresa) {
    if (!PROVA_PRESTAZIONI) await Save.delete(slot);
    nuovaPartitaDati(modalita, scelta.nome);
  }
  Save.modalita = modalita;
  const sc = ripresa ? Save.scenaSalvata : null;
  const finiti = (...v) => v.every(Number.isFinite);
  TAVULLIA = ripresa ? sc?.terreno === 'tavullia' : scelta.luogo === 'tavullia';

  // Seme del mondo: ripresa → quello salvato (anche se la partita è a Tavullia); nuova → quello scritto, o a caso.
  const seme = (sc && Number.isFinite(sc.seme)) ? sc.seme
    : scelta.seme ? semeDaTesto(scelta.seme)
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
    // Un salvataggio del mondo di prima (600×450 km) può stare fuori dalla regione di oggi: si riparte.
    const dentro = (x, z) => x >= 0 && z >= 0 && x <= carta.cols * carta.cella && z <= carta.rows * carta.cella;
    if (sc && sc.terreno === 'mondo' && sc.seme === seme && finiti(sc.cx, sc.cz, sc.x, sc.z) && dentro(sc.cx, sc.cz)) {
      await caricaScena({ tipo: 'mondo', cx: sc.cx, cz: sc.cz });
      posizionaCavaliere(sc.x, sc.z, Number.isFinite(sc.direzione) ? sc.direzione : Math.PI);
      // Un salvataggio di prima delle rocche può cadere dentro un muro: si riparte fuori dalla porta del borgo.
      const k = knight.stato, sito = carta.luoghi?.find((l) => l.partenza);
      const murato = rocche.some((r) => { const p = r.spingiFuori(k.x, k.z, 0.45); return p && Math.hypot(p.x - k.x, p.z - k.z) > 0.05; });
      if (murato && sito) {
        await caricaScena({ tipo: 'mondo', cx: sito.x, cz: sito.z });
        const p = partenzaDelSito(sito);
        posizionaCavaliere(p.x, p.z, p.direzione);
        messaggio('Il punto salvato era dentro le mura di una rocca: si riparte fuori dalla porta del borgo.');
      }
    } else if (PROVA_PRESTAZIONI && CENTRO_PROVA) {
      // Percorso di prova in un punto scelto (?centro=x,z in metri del mondo): cavaliere al centro del blocco.
      await caricaScena({ tipo: 'mondo', cx: CENTRO_PROVA[0], cz: CENTRO_PROVA[1] });
      posizionaCavaliere(0, 0, Math.PI);
    } else {
      const sito = carta.luoghi?.find((l) => l.partenza);
      if (sito) {
        // M7: Scena centrata sulla rocca di partenza; il garzone sta fuori dalla porta del borgo (fine del
        // terrapieno), rivolto verso la rocca.
        await caricaScena({ tipo: 'mondo', cx: sito.x, cz: sito.z });
        const p = partenzaDelSito(sito);
        posizionaCavaliere(p.x, p.z, p.direzione);
        messaggio(`Rocca di partenza (${NOMI_CLASSI[sito.classe]}): fuori dalla porta del borgo. Vicino alle porte degli edifici, ${PORTA.nomeTasto}: entra.`);
      } else {
        await caricaScena({ tipo: 'mondo', ...puntoPartenza(carta) });
        posizionaCavaliere(0, 0, Math.PI);
      }
    }
    scriviIndirizzo();
  }

  // La casata della rocca di partenza ha un nome generato dal seme (G1, passo 2): la reputazione lo mostra.
  const repCasata = Knight.reputazione.find((r) => r.id === 'vorn');
  if (repCasata) repCasata.nome = nomeCasata();
  preparaConoscenza();

  Save.statoScena = () => {
    const k = knight.stato;
    return scenaAttuale.tipo === 'tavullia'
      ? { terreno: 'tavullia', seme: carta?.seme, x: k.x, z: k.z, direzione: k.direzione }
      : { terreno: 'mondo', seme: carta.seme, cx: scenaAttuale.cx, cz: scenaAttuale.cz, x: k.x, z: k.z, direzione: k.direzione };
  };
  if (!PROVA_PRESTAZIONI) Save.startAutosave();
  window.addEventListener('pagehide', salvaOra);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvaOra();
  });
  pannelloStato.hidden = false;
  if (ripresa) messaggio(`Partita ${inStoria() ? 'Storia' : 'Libera'} ripresa dall'ultimo salvataggio.`);

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
    scene, camera, cam, controls, suolo, Knight, Calendar, Save, renderer, qualita,
    get terrain() { return terrain; }, get knight() { return knight; }, get castle() { return castle; },
    get carta() { return carta; }, get scena() { return scenaAttuale; }, get orizzonte() { return orizzonte; },
    get rocche() { return rocche; }, get villaggi() { return villaggi; }, get campagna() { return campagna; }, get abitanti() { return abitanti; },
    get vegetazione() { return vegetazione; }, get cavallo() { return cavallo; }, get ponti() { return ponti; },
    caricaScena, posizionaCavaliere, minimappa,
    /** M7, passo 9: ricentra il blocco (su { x, z } del mondo, o sul cavaliere) — per il percorso di prova. */
    cambiaBlocco: (x, z) => cambiaBlocco(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null),
    get cambiBlocco() { return { quanti: cambiBlocco, ms: msCambioBlocco, totale: msTotaleBlocco, inCorso: !!preparazione, ultimo: ultimoCambio }; },
  };

  avvisoHud('Frecce o WASD: muovi · trascina col mouse: gira · Shift: scatto · Ctrl: camminata sì/no · Spazio: scavalca'
    + ` · R: riposa/dormi · P: pausa · rotella: distanza · C: camera libera · M: Carta${inStoria() ? '' : ' (clic: vai lì) · T: avanza'}`
    + ' · N: minimappa grande · +/−: zoom minimappa · J: scrittoio'
    + ` · F2: qualità · F3: info · F8: menu · modalità ${inStoria() ? 'Storia' : 'Libera'}`,
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

/** Nebbia attorno al punto osservato (cielo.js); con l'orizzonte la foschia dipende dal giorno. */
function aggiornaNebbia(puntoOsservato) {
  cieloScena.aggiornaNebbia(camera, puntoOsservato, !!orizzonte, carta?.seme ?? 0, giorniDiGioco());
}

/** Giorni di gioco trascorsi, con la frazione. */
function giorniDiGioco() {
  return (Calendar.passiTotali + Calendar.frazione) / CALENDAR.PASSI_PER_GIORNO;
}

// ─── Tastiera ───────────────────────────────────────────────────────────
const tasti = new Set();

// Vista di sviluppo della Carta (M): mentre è aperta il gioco è fermo e la scena 3D non si disegna.
const cartaVista = createCartaVista(document.body, {
  onCambio: (aperta) => { tasti.clear(); minimappa?.nascondi(!!aperta); },
  cartaAttuale: () => carta,
  generaCarta: (seme, avanzamento) => generaCartaAsincrona(seme, { avanzamento, cache: !PARAMETRI.has('rigenera') }),
  verificaSemi,
  posizione: () => (scenaAttuale?.tipo === 'mondo' && knight
    ? { x: (scenaAttuale.cx + knight.stato.x) / carta.cella, y: (scenaAttuale.cz + knight.stato.z) / carta.cella,
      direzione: knight.stato.direzione }
    : null),
  onScegli: (c, x, y) => {
    if (!soloInLibera('Il clic sulla Carta che porta lì')) return;
    entraDallaCarta(c, x, y).catch((err) => { console.error('[scena]', err); messaggio(`Errore: ${err.message}`); });
  },
  onRocca: (c, sito) => {
    if (!soloInLibera('«Vai a» sulla Carta')) return;
    entraNelSito(c, sito).catch((err) => { console.error('[scena]', err); messaggio(`Errore: ${err.message}`); });
  },
  onTavullia: () => {
    if (!soloInLibera('Tavullia')) return;
    entraTavullia().catch((err) => { console.error('[scena]', err); messaggio(`Errore: ${err.message}`); });
  },
});
// ─── Nebbia della conoscenza (versione base, G1; Conoscenza in js/news.js) ─────────────────────────────
// In Storia il cavaliere conosce all'inizio la sua valle (il borgo e ~1,5 km attorno, la strada fino al villaggio più
// vicino) e scopre camminando: percorso entro ~250 m, intravisto entro ~700 m (di notte molto meno). La minimappa copre
// l'ignoto e nasconde i luoghi mai visti. In Libera si vede tutto. Con G2: linea di vista dalle alture e voci.
const CONOSCENZA = { percorso: 250, intravisto: 700, percorsoNotte: 120, intravistoNotte: 200, ogni: 0.5, passo: 25,
  inizio: { valle: 1500, intorno: 2200, villaggio: 400, corridoio: 1200, strada: 150, lungoStrada: 450 } };

function preparaConoscenza() {
  if (typeof Conoscenza === 'undefined') return;
  Conoscenza.attiva = inStoria() && !!carta;
  if (!Conoscenza.attiva) return;
  const W = carta.cols * carta.cella, H = carta.rows * carta.cella;
  if (Conoscenza.dati && Conoscenza.w === Math.ceil(W / Conoscenza.CELLA) && Conoscenza.h === Math.ceil(H / Conoscenza.CELLA)) return;
  Conoscenza.init(W, H);
  rivelaInizio();
}

/** Ciò che il garzone sa all'inizio della Storia: la sua valle e la strada fino al villaggio più vicino. */
function rivelaInizio() {
  const I = CONOSCENZA.inizio, k = Conoscenza;
  const sito = carta.luoghi?.find((l) => l.partenza);
  if (sito) {
    k.rivela(sito.x, sito.z, I.valle, 2);
    k.rivela(sito.x, sito.z, I.intorno, 1);
    let v = null, dv = Infinity;
    for (const s of carta.siti ?? []) {
      if (s.tipo !== 'villaggio') continue;
      const d = Math.hypot(s.x - sito.x, s.z - sito.z);
      if (d < dv) { dv = d; v = s; }
    }
    if (v) {
      k.rivela(v.x, v.z, I.villaggio, 2);
      // Strade nel corridoio tra la rocca e il villaggio: un punto ogni ~80 m, se vicino al segmento rocca–villaggio.
      const ax = sito.x, az = sito.z, bx = v.x - ax, bz = v.z - az, L2 = bx * bx + bz * bz || 1, m = I.corridoio;
      const strade = percorsiStrade(carta, Math.min(ax, v.x) - m, Math.min(az, v.z) - m, Math.max(ax, v.x) + m, Math.max(az, v.z) + m);
      for (const f of strade) {
        let lx = NaN, lz = NaN;
        for (let i = 0; i < f.x.length; i++) {
          const x = f.x[i], z = f.z[i];
          if (Math.hypot(x - lx, z - lz) < 80) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / L2));
          if (Math.hypot(x - ax - t * bx, z - az - t * bz) > m) continue;
          k.rivela(x, z, I.strada, 2);
          k.rivela(x, z, I.lungoStrada, 1);
          lx = x; lz = z;
        }
      }
    }
  }
  // Partita ripresa senza conoscenza (salvataggi di prima): anche il punto dove si trova.
  if (knight && scenaAttuale?.tipo === 'mondo') {
    k.rivela(scenaAttuale.cx + knight.stato.x, scenaAttuale.cz + knight.stato.z, CONOSCENZA.intravisto, 1);
  }
}

let _tConoscenza = 0;
const _ultimaRivelazione = { x: NaN, z: NaN };
/** Ogni ~0,5 s, se il cavaliere si è spostato: percorso attorno e intravisto più in là (di notte poco). */
function aggiornaConoscenza(dt) {
  if (typeof Conoscenza === 'undefined' || !Conoscenza.attiva || !Conoscenza.dati) return;
  if (!knight || scenaAttuale?.tipo !== 'mondo' || inPausa || cronista) return;
  if ((_tConoscenza += dt) < CONOSCENZA.ogni) return;
  _tConoscenza = 0;
  const x = scenaAttuale.cx + knight.stato.x, z = scenaAttuale.cz + knight.stato.z;
  if (Math.hypot(x - _ultimaRivelazione.x, z - _ultimaRivelazione.z) < CONOSCENZA.passo) return;
  _ultimaRivelazione.x = x; _ultimaRivelazione.z = z;
  const notte = Calendar.eNotte();
  Conoscenza.rivela(x, z, notte ? CONOSCENZA.percorsoNotte : CONOSCENZA.percorso, 2);
  Conoscenza.rivela(x, z, notte ? CONOSCENZA.intravistoNotte : CONOSCENZA.intravisto, 1);
}

// Minimappa (js/3d/minimappa.js): in basso a destra durante il gioco di persona, solo nel mondo generato.
const nelMondo = () => scenaAttuale?.tipo === 'mondo' && knight && carta;
const minimappa = creaMinimappa(document.body, {
  carta: () => carta,
  posizione: () => (nelMondo() ? { x: scenaAttuale.cx + knight.stato.x, z: scenaAttuale.cz + knight.stato.z,
    direzione: knight.stato.direzione } : null),
  cavallo: () => (nelMondo() && cavallo ? { x: scenaAttuale.cx + cavallo.stato.x, z: scenaAttuale.cz + cavallo.stato.z } : null),
  blocco: () => (nelMondo() ? { x: scenaAttuale.cx, z: scenaAttuale.cz, half: terrain.size / 2 } : null),
  conoscenza: () => (typeof Conoscenza !== 'undefined' && Conoscenza.attiva ? Conoscenza : null),
  prove: () => !inStoria(),
  onVai: (x, z) => {
    if (!soloInLibera('Il clic sulla minimappa che porta lì')) return;
    vaiA(x, z).catch((err) => { console.error('[minimappa]', err); messaggio(`Errore: ${err.message}`); });
  },
});

/**
 * SOLO per le prove (clic sulla minimappa allargata): porta il cavaliere nel punto (x, z) del mondo. Dentro il blocco
 * disegnato lo sposta e basta; fuori carica la Scena centrata lì, come un clic sulla Carta.
 */
async function vaiA(x, z) {
  if (!nelMondo() || percorso) return;
  const lx = x - scenaAttuale.cx, lz = z - scenaAttuale.cz, half = terrain.size / 2;
  if (Math.max(Math.abs(lx), Math.abs(lz)) < half - 5) {
    if (!suolo.percorribile(lx, lz)) { messaggio('Lì c\'è acqua troppo profonda.', 2500); return; }
    posizionaCavaliere(lx - scostamento.x, lz - scostamento.z, knight.stato.direzione);
    salvaOra();
    return;
  }
  if (quotaFinale(carta, x, z) < -PROFONDITA_GUADO) { messaggio('Lì c\'è il mare.', 2500); return; }
  await entraDallaCarta(carta, x / carta.cella, z / carta.cella);
}

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
  // M: in Storia la minimappa grande (la Carta di gioco arriva con G2); in Libera la Carta di sviluppo.
  if (e.code === 'KeyM' && !e.repeat) { if (inStoria() && !cartaVista.aperta) minimappa.alterna(); else cartaVista.alterna(); return; }
  if (cartaVista.aperta) return;
  if (cronista) {                                        // Carta del cronista aperta: scelte con 1–9, Esc o E per uscire
    if (e.repeat) return;
    if (scrittoio.aperto) { scrittoio.tasto(e); return; }
    if (!cartaCronista.tasto(e) && e.code === PORTA.tasto) chiudiCronista();
    return;
  }
  if (e.code === 'KeyJ' && !e.repeat && knight) { scrittoio.apri(); return; }
  if (e.code === PORTA.tasto && !e.repeat) {
    const azione = AZIONI_TASTO.find((a) => a.pronta());
    if (azione) { azione.esegui(); return; }
  }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) scavalcaRichiesto = true; }
  tasti.add(e.code);
  if (e.code === 'KeyC' && !e.repeat && knight) cambiaModoCamera();
  if (e.code === 'KeyN' && !e.repeat) minimappa.alterna();
  // Zoom della minimappa: per carattere (sulla tastiera italiana + e − non hanno i codici di quella americana).
  if ((e.key === '+' || e.code === 'NumpadAdd') && !e.repeat) minimappa.zoom(-1);
  if ((e.key === '-' || e.code === 'NumpadSubtract') && !e.repeat) minimappa.zoom(1);
  if (TASTI_CAMMINATA.includes(e.code) && !e.repeat) camminata = !camminata;
  if (e.code === 'KeyR' && !e.repeat) riposa();
  if (e.code === 'KeyT' && !e.repeat) avanza();
  if (e.code === 'KeyP' && !e.repeat) cambiaPausa();
  if (e.code === 'KeyV' && !e.repeat && vegetazione) {
    vegetazioneVisibile = !vegetazioneVisibile;
    vegetazione.oggetto.visible = vegetazioneVisibile;
    if (!vegetazioneVisibile) vegetazione.nascondiOmbre();
  }
  if (e.code === 'F8' && !e.repeat) {
    e.preventDefault();
    tornaAlMenu();
  }
});
window.addEventListener('keyup', (e) => tasti.delete(e.code));
window.addEventListener('blur', () => tasti.clear());   // niente tasti "incollati" cambiando finestra

const _input = { avanti: 0, gira: 0, giroMouse: 0, corsa: false, camminata: false, scavalca: false };
function leggiInput() {
  _input.avanti = (premuto('avanti') ? 1 : 0) - (premuto('indietro') ? 1 : 0);
  _input.gira = (premuto('destra') ? 1 : 0) - (premuto('sinistra') ? 1 : 0);
  _input.giroMouse = cam.prendiGiroMouse();
  _input.corsa = premuto('corsa') && !sfinito();
  _input.camminata = camminata || sfinito();
  _input.scavalca = scavalcaRichiesto;
  scavalcaRichiesto = false;
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
  } else if (e.code === 'F4' && !fpsEl.hidden) {
    e.preventDefault();
    applicaProva((provaPrestazioni + 1) % PROVE_PRESTAZIONI.length);
  } else if (e.code === 'F2') {
    e.preventDefault();
    qualita.successiva();
    messaggio(`Qualità ${qualita.nome} (F2 per cambiare)`);
  } else if (e.code === 'F9' && !fpsEl.hidden) {
    e.preventDefault();
    avviaPercorso();
  }
});

// ─── Prova prestazioni (F4 con il pannello F3 aperto) ───────────────────
// Spegne un pezzo alla volta per vedere, sulla scheda video vera, dove si perdono gli FPS (in headless il rendering
// è software e non fa testo). Solo diagnostica: non cambia nulla finché non si preme F4.
const PROVE_PRESTAZIONI = ['normale', 'misura per gruppi', 'suolo semplice (senza colore per pixel)',
  'senza vegetazione', 'senza orizzonte', 'senza rocche', 'risoluzione ×0,6'];
let provaPrestazioni = 0;
const _materialiSuolo = new Map();
function applicaProva(n) {
  for (const [m, mat] of _materialiSuolo) { m.material.dispose(); m.material = mat; }
  _materialiSuolo.clear();
  const rocchePresenti = [castle, ...rocche].filter(Boolean).map((r) => r.object);
  for (const o of [vegetazione?.oggetto, orizzonte?.oggetto, ...rocchePresenti]) if (o) o.visible = true;
  qualita.azzeraAdattiva();
  provaPrestazioni = n;
  switch (n) {
    case 1: break;                         // «misura per gruppi»: cambia solo il modo di disegno (frame)
    case 2:
      scene.traverse((c) => {
        if (c.isMesh && c.material?.customProgramCacheKey?.() === 'suolo-mondo') {
          _materialiSuolo.set(c, c.material);
          c.material = new THREE.MeshLambertMaterial({ vertexColors: true });
        }
      });
      break;
    case 3: if (vegetazione) vegetazione.oggetto.visible = false; break;
    case 4: if (orizzonte) orizzonte.oggetto.visible = false; break;
    case 5: for (const o of rocchePresenti) o.visible = false; break;
    case 6: renderer.setPixelRatio(qualita.scala * 0.6); break;
  }
}

/**
 * Gruppo di un oggetto disegnabile per il profilatore (null = «resto»). La vegetazione si divide per tipo di mesh
 * (sagome lontane, sagome nel blocco, erba, resto) dal nome, ovunque sia appesa.
 */
function gruppoDi(o) {
  const nome = o.name || '';
  if (nome.startsWith('vegetazione')) {
    if (nome.includes('sagome-lontane')) return 'veg. sagome lontane';
    if (nome.includes('sagome')) return 'veg. sagome';
    if (nome.includes('erba')) return 'veg. erba';
    return 'veg. resto';
  }
  let top = o;
  while (top.parent && top.parent !== scene) top = top.parent;
  if ((top.name || '').startsWith('cielo')) return 'cielo';
  if (terrain && top === terrain.mesh) return 'ter. blocco';
  if (orizzonte && top === orizzonte.oggetto) return 'ter. orizzonte';
  if (vegetazione && top === vegetazione.oggetto) return 'veg. resto';
  if ((castle && top === castle.object) || rocche.some((r) => r.object === top) || villaggi.some((r) => r.object === top) || (campagna && top === campagna.object)) return 'edifici';
  if ((knight && top === knight.object) || (cavallo && top === cavallo.object) || (abitanti && top === abitanti.object)) return 'personaggi';
  return null;
}

// ─── Percorso di prova (F9 con F3 aperto, o ?prova nell'indirizzo) ───────
let msCottura = null;                    // ms della cottura del colore del blocco (F3)
let msCotturaOrizzonte = null;           // ms della cottura degli anelli dell'orizzonte (F3)
let msCambioBlocco = null, cambiBlocco = 0;   // M7, passo 9: fotogramma più lungo dell'ultimo cambio di blocco e quanti (F3)
let msTotaleBlocco = null;                // ms dall'inizio della preparazione allo scambio (F3)
let ultimoCambio = null;                  // dettagli dell'ultimo cambio (kd.cambiBlocco)
let tScambio = null;                      // quando è avvenuto lo scambio: il fotogramma dopo misura il disegno che segue
let preparazione = null;                  // { gen, t0, picco } preparazione del blocco nuovo in sottofondo
// Il blocco segue il cavaliere (tappa 2: tutto a pezzi, nessun fotogramma oltre ~25 ms in headless). Con ?blocchi=no
// nell'indirizzo si torna al cavaliere che si ferma al bordo (per confronti).
const SEGUI_BLOCCO = PARAMETRI.get('blocchi') !== 'no';
const MS_PREPARAZIONE = 4;                // ms per fotogramma dati alla preparazione del blocco nuovo
const MS_PEZZO = 2;                       // ms per pezzo chiesti ai generatori a pezzi (vegetazione: ~2 dentro i 4)

/** Mette in scena il blocco preparato: cavaliere, cavallo e camera restano nello stesso punto del mondo. */
function scambiaBlocco(p) {
  const c0 = terrain.meta.centroMondo, k = knight.stato;
  togliScenaAttuale(false);               // il blocco vecchio si libera a pezzi nei fotogrammi seguenti
  applicaMondo(p);
  const c1 = terrain.meta.centroMondo;
  scostamento = { x: 0, z: 0 };
  trasla(c0.x - c1.x, c0.z - c1.z, [k, cavallo?.stato, _prec], [camera.position]);
  if (cavallo && !ostacoli.includes(cavallo)) ostacoli.push(cavallo);
  cam?.riattiva();
  cambiBlocco++;
}

/**
 * M7, passo 9 (js/3d/blocchi.js): il blocco si ricentra sul cavaliere quando si avvicina al bordo. Il blocco nuovo si
 * prepara in sottofondo, pochi ms per fotogramma (avanzaBlocco), mentre si continua a giocare su quello attuale; pronto,
 * si scambia. `dove` (facoltativo): punto del mondo { x, z } su cui centrare, subito e tutto in una volta (comando
 * kd.cambiaBlocco per il percorso di prova).
 */
function cambiaBlocco(dove = null) {
  if (!knight || scenaAttuale?.tipo !== 'mondo') return;
  const c0 = terrain.meta.centroMondo, k = knight.stato;
  if (dove) {
    preparazione = null;
    const t0 = performance.now();
    scambiaBlocco(completa(preparaMondo({ tipo: 'mondo', cx: dove.x, cz: dove.z })));
    msCambioBlocco = performance.now() - t0;
    return;
  }
  if (preparazione) return;
  preparazione = { gen: preparaMondo({ tipo: 'mondo', cx: c0.x + k.x, cz: c0.z + k.z }), t0: performance.now(), picco: 0, n: 0, lunghi: [] };
}

/** Un fotogramma di lavoro sul cambio di blocco: un oggetto vecchio da liberare, qualche ms di preparazione. */
function avanzaBlocco() {
  const vecchio = daLiberare.pop();
  if (vecchio) libera(vecchio);
  if (!preparazione) return;
  const t0 = performance.now(), fine = t0 + MS_PREPARAZIONE;
  const P = preparazione;
  if (P.attesa) return;                   // compilazione in parallelo non ancora finita
  let r, t = t0;
  do {
    r = P.gen.next();
    if (typeof r.value?.then === 'function') {
      P.attesa = true;
      r.value.then(() => { P.attesa = false; }, () => { P.attesa = false; });
      r.value = 'compilazione';
    }
    const t1 = performance.now();
    // I pezzi più lunghi, per capire dove spezzare ancora (kd.cambiBlocco.ultimo.lunghi).
    const nome = typeof r.value === 'string' ? r.value : `dopo ${P.ultimo ?? 'inizio'}`;
    if (typeof r.value === 'string') P.ultimo = r.value;
    if (t1 - t > 8) P.lunghi.push(`${nome} ${Math.round(t1 - t)}`);
    P.n++;
    t = t1;
  } while (!r.done && !P.attesa && t < fine);
  if (r.done) {
    scambiaBlocco(r.value);
    P.scambio = performance.now() - t;
  }
  P.picco = Math.max(P.picco, performance.now() - t0);
  if (r.done) {
    msCambioBlocco = P.picco;
    msTotaleBlocco = performance.now() - P.t0;
    ultimoCambio = { picco: P.picco, totale: msTotaleBlocco, pezzi: P.n, lunghi: P.lunghi, scambio: P.scambio };
    tScambio = performance.now();
    preparazione = null;
  }
}
let percorso = null;
let percorsoNormale = null;               // istantanea alla fine del giro normale
let provaAutomatica = PROVA_PRESTAZIONI;
let attesaProva = 0;
function avviaPercorso() {
  if (!knight || percorso) return;
  qualita.azzeraAdattiva();               // misure confrontabili: risoluzione piena del preset, ferma durante il giro
  if (modoCamera === 'libera') cambiaModoCamera();
  const k = knight.stato;
  percorso = creaPercorso({ x: k.x, y: k.y, z: k.z, direzione: k.direzione },
    { maxFotogramma: PARAMETRI.has('lento') ? Infinity : undefined });
  percorsoNormale = null;
  profilatore.azzera();
  fpsEl.hidden = false;
  messaggio('Percorso di prova: circa 35 secondi, non toccare nulla.', 6000);
}
const fmtMs = (m) => (m ? `${fmt(m.media, 1)} ms (picco ${fmt(m.max, 1)})` : 'n/d');
function fineDelPercorso() {
  const st = percorso.statistiche();
  if (percorso.interrotto || !st) {
    const s = percorso.interrotto;
    percorso = null;
    messaggio(`Percorso di prova interrotto${s ? `: il browser si è fermato per ${fmt(s, 0)} s` : ''} (finestra nascosta`
      + ' o ridotta a icona?). Rifallo con F9 lasciando la finestra in primo piano.', 10000);
    return;
  }
  const P = profilatore.info, buf = renderer.getDrawingBufferSize(_dimBuffer);
  const righe = [
    `Knight Dawn — percorso di prova (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
    `scheda: ${P.scheda}`,
    `timer GPU: ${P.timerGPU ? 'sì' : 'no'} · profondità invertita possibile: ${P.clipControl ? 'sì' : 'no'}`
      + ` · MSAA ${P.campioniMSAA}× · profondità: ${P.profonditaLog ? 'logaritmica' : P.profonditaInvertita ? 'invertita' : 'normale'}`
      + ` · ${buf.x}×${buf.y} pixel`,
    `qualità: ${qualita.nome} · risoluzione ×${fmt(qualita.scala, 2)}`,
    `scena: ${scenaAttuale?.tipo === 'mondo' ? `seme ${carta?.seme}, centro ${scenaAttuale.cx}, ${scenaAttuale.cz}` : scenaAttuale?.tipo}`
      + ` · vegetazione ${vegetazioneVisibile ? 'accesa' : 'spenta'}`,
    st ? `FPS medio ${fmt(st.fps, 1)} (${fmt(st.msMedio, 1)} ms) · 1% peggiori ${fmt(st.fps1, 1)} FPS`
      + ` · fotogramma peggiore ${fmt(st.msPeggiore, 1)} ms · ${st.fotogrammi} fotogrammi` : 'FPS: n/d',
    st && Number.isFinite(st.cpuMedia) ? `CPU per fotogramma (logica + invio): media ${fmt(st.cpuMedia, 1)} ms · 1% peggiori`
      + ` ${fmt(st.cpu99, 1)} ms · massimo ${fmt(st.cpuMax, 1)} ms` : 'CPU: n/d',
    ...(st?.parti?.length ? ['CPU per parte (media · 1% peggiori · massimo, ms):',
      ...st.parti.map((p) => `  ${p.nome}: ${fmt(p.media, 2)} · ${fmt(p.p99, 1)} · ${fmt(p.max, 1)}`)] : []),
    st?.lunghi ? `compiti lunghi fuori dal fotogramma (> 50 ms): ${st.lunghi.n} · il più lungo ${fmt(st.lunghi.max)} ms` : '',
    `GPU totale: ${fmtMs(percorsoNormale?.totale)} · budget ${fmt(BUDGET_GPU.totale, 1)} ms`,
    `chiamate ${percorsoNormale?.calls ?? 'n/d'} · ${fmt((percorsoNormale?.triangles ?? 0) / 1000)} mila triangoli`,
    'GPU per gruppo (ripartizione):',
    ...GRUPPI.map((g) => {
      const m = profilatore.media(g), b = budgetDi(g);
      return `  ${g}: ${fmtMs(m)}${b != null ? ` · budget ${fmt(b, 1)}${m && m.media > b ? '  ⚠ oltre il budget' : ''}` : ''}`;
    }),
    ...Object.entries(FAMIGLIE).map(([chiave, gruppi]) => {
      const v = gruppi.reduce((s, g) => s + (profilatore.media(g)?.media || 0), 0);
      return `  ${chiave === 'resto' ? 'acqua, cielo ed effetti' : chiave} in tutto: ${fmt(v, 1)} ms · budget ${fmt(BUDGET_GPU[chiave], 1)}`
        + (v > BUDGET_GPU[chiave] + 0.05 ? '  ⚠ oltre il budget' : '');
    }),
  ];
  // Gli oggetti più pesanti (triangoli disegnati, istanze comprese): per capire se qualcosa si duplica.
  const pesi = [];
  scene.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
    pesi.push({ nome: o.name || o.parent?.name || '(senza nome)', ist: o.isInstancedMesh ? o.count : 1, tri: n * (o.isInstancedMesh ? o.count : 1) });
  });
  pesi.sort((a, b) => b.tri - a.tri);
  righe.push(`oggetti visibili: ${pesi.length} (chiamate ≈ oggetti nel campo visivo) · i più pesanti:`);
  for (const p of pesi.slice(0, 12)) righe.push(`  ${p.nome}: ${fmt(p.tri / 1000)} mila triangoli${p.ist > 1 ? ` · ${p.ist} istanze` : ''}`);
  percorso = null;
  mostraRisultati(righe.filter((r) => r !== '').join('\n'));
}
function mostraRisultati(testo) {
  console.log(testo);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;'
    + 'background:rgba(26,14,4,0.95);border:1px solid #8a6030;padding:14px;color:#d8c8a0;font:13px Georgia,serif;'
    + 'max-width:92vw';
  box.innerHTML = '<div style="margin-bottom:8px">Risultati del percorso di prova — copiali e mandali in chat</div>';
  const area = document.createElement('textarea');
  area.readOnly = true;
  area.value = testo;
  area.style.cssText = 'width:min(760px,88vw);height:260px;font:12px ui-monospace,Consolas,monospace;'
    + 'background:#120c04;color:#d8c8a0;border:1px solid #5a3a18';
  const copia = document.createElement('button');
  copia.textContent = 'Copia';
  copia.onclick = () => { area.select(); navigator.clipboard?.writeText(testo).catch(() => document.execCommand('copy')); copia.textContent = 'Copiato'; };
  const chiudi = document.createElement('button');
  chiudi.textContent = 'Chiudi';
  chiudi.onclick = () => box.remove();
  for (const b of [copia, chiudi]) b.style.cssText = 'margin:8px 8px 0 0;padding:4px 12px';
  box.append(area, document.createElement('br'), copia, chiudi);
  document.body.appendChild(box);
}

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

const _dimBuffer = new THREE.Vector2();
const PANNELLO_INTERVALLO_MS = 200;
let _pannelloT = -Infinity;
const infoFrame = { calls: 0, triangles: 0, msInvio: 0, msLogica: 0 };
function aggiornaPannello(now) {
  fpsFrame++;
  const dt = now - fpsT0;
  if (dt >= FPS_INTERVALLO_MS) {
    rigaFps = `${Math.round((fpsFrame * 1000) / dt)} FPS · ${(dt / fpsFrame).toFixed(1)} ms`;
    fpsFrame = 0;
    fpsT0 = now;
  }
  if (fpsEl.hidden) return;
  // Il testo si ricostruisce 5 volte al secondo, non a ogni fotogramma: il percorso di prova misurava fino a 23 ms
  // di picco per il pannello (statistiche, raggio sotto il cursore, DOM), cioè scatti causati dalla misura stessa.
  if (now - _pannelloT < PANNELLO_INTERVALLO_MS) return;
  _pannelloT = now;
  let testo = rigaFps;
  const ri = infoFrame, buf = renderer.getDrawingBufferSize(_dimBuffer);
  testo += `\nprestazioni (F4 cambia, F9 percorso di prova): ${percorso ? 'PERCORSO DI PROVA in corso' : PROVE_PRESTAZIONI[provaPrestazioni]}`
    + ` · ${ri.calls} chiamate · ${fmt(ri.triangles / 1000)} mila triangoli · ${buf.x}×${buf.y} pixel`;
  const P = profilatore.info;
  testo += `\nscheda: ${P.scheda}\n  timer GPU: ${P.timerGPU ? 'sì' : 'no'} · profondità invertita possibile: ${P.clipControl ? 'sì' : 'no'}`
    + ` · MSAA ${P.campioniMSAA}× · profondità: ${P.profonditaLog ? 'logaritmica' : P.profonditaInvertita ? 'invertita' : 'normale'}`;
  testo += `\nqualità: ${qualita.nome} (F2) · risoluzione ×${fmt(qualita.scala, 2)}`
    + (qualita.adatta < 1 ? ` (adattiva ×${fmt(qualita.adatta, 2)})` : '');
  testo += `\nCPU: logica ${fmt(ri.msLogica, 1)} ms · invio comandi ${fmt(ri.msInvio, 1)} ms`;
  if (msCottura != null) testo += ` · suolo cotto in ${fmt(msCottura)} ms`;
  if (msCotturaOrizzonte != null) testo += ` · orizzonte cotto in ${fmt(msCotturaOrizzonte)} ms`;
  if (msCambioBlocco != null) testo += ` · cambi di blocco ${cambiBlocco} (l'ultimo: fotogramma più lungo ${fmt(msCambioBlocco)} ms`
    + (ultimoCambio?.disegno != null ? `, disegno dopo lo scambio ${fmt(ultimoCambio.disegno)} ms` : '')
    + (msTotaleBlocco != null ? `, in tutto ${fmt(msTotaleBlocco / 1000, 1)} s)` : ')');
  if (!P.timerGPU) testo += '\nGPU: timer non disponibili su questa scheda o browser (usare F4)';
  else if ((percorso ? percorso.modo : provaPrestazioni === 1 ? 'gruppi' : 'normale') === 'gruppi') {
    testo += '\nGPU per gruppo: ' + GRUPPI.map((g) => {
      const m = profilatore.media(g);
      const b = budgetDi(g);
      return `${g} ${m ? fmt(m.media, 1) : '…'}${m && b != null && m.media > b ? '⚠' : ''}`;
    }).join(' · ') + ' ms';
  } else testo += `\nGPU: ${fmtMs(profilatore.media('totale'))} · budget ${fmt(BUDGET_GPU.totale, 1)} ms`;
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
      + ` · sole ${fmt(posizioneSole(ora).altezza)}° · Forza ${fmt(Knight.forza.cur, 2)}`
      + (orizzonte ? ` · foschia fino a ${fmt(visibilitaDelGiorno(carta?.seme ?? 0, giorniDiGioco()) / 1000)} km` : '');
    const pelo = livelloAcquaIn(k.x, k.z);
    if (!Number.isNaN(pelo)) testo += `\nacqua: pelo a ${fmt(pelo, 1)} m · profondità ${fmt(Math.max(0, pelo - k.y), 1)} m`;
    testo += `\ncamera: ${modoCamera === 'segui' ? 'alle spalle' : 'libera (C per tornare)'}`;
    if (scenaAttuale?.tipo === 'mondo' && carta?.luoghi) {
      // M7, passo 2: terrapieno della rocca più vicina (entro 1,5 km).
      const X = scenaAttuale.cx + k.x, Z = scenaAttuale.cz + k.z;
      for (const l of carta.luoghi) {
        const d = Math.hypot(l.x - X, l.z - Z);
        if (d > 1500 || !l.terrapieno) continue;
        const t = l.terrapieno;
        testo += `\nrocca ${l.id + 1} (${NOMI_CLASSI[l.classe]}, ${l.carattere}) a ${fmt(d)} m: ${l.piani.length} piani`
          + ` (rocca ${fmt(l.piani[0].q, 1)} m, borgo in pendio, media ${fmt(l.piani[1]?.q ?? NaN, 1)} m),`
          + ` salto massimo ${fmt(t.salto, 1)} m, scarpate ≤ ${fmt(t.pendenza)}°, lavoro medio ${fmt(t.lavoro, 1)} m`
          + (t.pelo !== null ? `, acqua vicina a ${fmt(t.pelo, 1)} m` : '');
      }
      for (const r of rocche) {
        if (!r.dentro(k.x, k.z)) continue;
        testo += r.tipo === 'borgo' ? `\nnel borgo ${r.luogo.id + 1}` : `\nnel cortile della rocca ${r.luogo.id + 1}`;
      }
      for (const r of rocche) {
        if (r.tipo === 'borgo') testo += `\nborgo ${r.luogo.id + 1}: ${r.poligono.length} vertici, ${r.misure.strade} strade,`
          + ` ${r.misure.torri} torri, ${r.misure.case} case e ${r.misure.edifici} edifici, porta con rampa di ${fmt(r.porta.rampa, 1)} m,`
          + ` ${r.misure.oggetti} oggetti, ${fmt(r.misure.triangoli)} triangoli`;
        else testo += `\nrocca ${r.luogo.id + 1}: ${r.poligono.length} torri ${r.tonde ? 'tonde' : 'quadrate'}, ${r.terrazzi} terrazzi, rampa`
          + ` ${r.rampa.lato ? 'lungo il muro' : 'dritta'} di ${fmt(r.rampa.lunghezza, 1)} m al ${fmt(100 * r.rampa.pendenza)} %,`
          + ` ${r.misure.edifici} edifici, ${r.misure.oggetti} oggetti, ${fmt(r.misure.triangoli)} triangoli`;
      }
      for (const r of villaggi) {
        const o = r.sito ?? r.luogo;
        const d = Math.hypot(o.x - (scenaAttuale.cx + k.x), o.z - (scenaAttuale.cz + k.z));
        const nome = r.tipo === 'villaggio' ? (r.sito.dimensione === 'villaggio' ? 'villaggio' : 'frazione') : r.tipo;
        testo += `\n${nome} ${o.id + 1} a ${fmt(d)} m:`
          + ` ${r.misure.case} case, ${r.misure.edifici} edifici, ${r.misure.chiamate} chiamate, ${fmt(r.misure.triangoli)} triangoli`;
      }
      if (campagna) testo += `\ncase di campagna: ${campagna.misure.case}, ${campagna.misure.chiamate} oggetti, ${fmt(campagna.misure.triangoli)} triangoli`;
    }
    if (castle) {
      testo += castle.dentro(k.x, k.z) ? '\ncastello: nel cortile'
        : `\ncastello: a ${fmt(Math.hypot(k.x - castle.cfg.x, k.z - castle.cfg.z))} m dal centro`;
    }
  }
  if (terrain) {
    testo += `\nterreno: ${terrain.meta.source} · ${fmt(terrain.minElev)}–${fmt(terrain.maxElev)} m · ${statPendenze}`;
    if (vegetazione) {
      const v = vegetazione;
      const st = v.statistiche();
      testo += `\nvegetazione (V): ${fmt(v.totale)} oggetti, ${fmt(st.istanze)} disegnati · ${st.chiamate} chiamate`
        + ` · ${fmt(st.triangoli)} triangoli · posizionamento ${fmt(v.msPosiziona)} ms (campi ${fmt(v.msCampi)})`
        + ` · costruzione ${fmt(v.msCostruzione)} ms · livelli ${fmt(st.msAggiorna, 1)} ms${vegetazioneVisibile ? '' : ' · nascosta'}`
        + `\n  vicino: erba ${fmt(st.erba)} ciuffi · felci ${fmt(st.felci)} · ciottoli ${fmt(st.ciottoli)} · ${fmt(st.msVicino, 1)} ms`
        + ` · ombre di ${fmt(st.ombre)} oggetti · ${fmt(st.msOmbre, 1)} ms`
        + (v.lontano ? ` · bosco lontano ${fmt(v.lontano.n)} sagome · ${fmt(v.lontano.ms)} ms` : '')
        + `\n  ${Object.entries(v.conteggi).filter(([, n]) => n).map(([k, n]) => `${k} ${fmt(n)}`).join(' · ')}`
        + `\ndisegno: ${fmt(renderer.info.render.calls)} chiamate · ${fmt(renderer.info.render.triangles)} triangoli`;
    }
    if (orizzonte) testo += `\norizzonte: fino a ${fmt(110)} km · ${fmt(orizzonte.triangoli)} triangoli · ${fmt(orizzonte.ms)} ms`;
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
// Tempo di processore per parte del fotogramma (percorso di prova: per trovare gli scatti).
const partiCPU = {};
function segna(nome, t) {
  const n = performance.now();
  partiCPU[nome] = (partiCPU[nome] || 0) + (n - t);
  return n;
}

function frame(now) {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  for (const k in partiCPU) partiCPU[k] = 0;
  let tt = t0;
  const dtReale = Math.max(0, (now - tPrec) / 1000);
  const dt = THREE.MathUtils.clamp(dtReale, 0, DT_MAX);
  tPrec = now;
  if (tScambio != null && ultimoCambio) {
    // Dallo scambio all'inizio di questo fotogramma: il disegno del blocco nuovo (geometrie sulla scheda) compreso.
    ultimoCambio.disegno = t0 - tScambio;
    tScambio = null;
  }
  if (cartaVista.aperta) return;           // la Carta copre tutto: niente tempo di gioco, niente disegno
  if (provaAutomatica && knight && caricamento.hidden && (attesaProva += dt) > 3) { provaAutomatica = false; avviaPercorso(); }
  if (knight) {
    if (percorso) {
      // Percorso di prova: tempo di gioco fermo, la camera segue il giro fisso.
    } else if (!inPausa && !cronista) {
      knight.update(dt, leggiInput());
      if (SEGUI_BLOCCO && scenaAttuale?.tipo === 'mondo' && vicinoAlBordo(knight.stato.x, knight.stato.z, terrain.size / 2)) cambiaBlocco();
      avanzaBlocco();
      contaPercorso();
      const passi = Calendar.avanzaTempoReale(dt);
      if (knight.stato.velEffettiva < FERMO) Knight.riposaPassi(passi);
    } else {
      cam.prendiGiroMouse();               // in pausa il mouse non gira il cavaliere
    }
    if (cavallo && !inPausa && !cronista) cavallo.update(dt);
    if (abitanti && !inPausa && !cronista && !percorso) abitanti.update(dt, knight.stato, 1 - _luceGiorno);
    cercaPortaVicina();
    cercaScavalcoVicino(dt);
    tt = segna('cavaliere e tempo', tt);
    aggiornaCielo();
    castle?.aggiornaLuci(now / 1000, 1 - _luceGiorno);
    {
      const quota = quotaFinestre(Calendar.oraDelGiorno());
      for (const r of rocche) r.aggiornaLuci(now / 1000, 1 - _luceGiorno, quota);
      campagna?.aggiornaLuci(now / 1000, 1 - _luceGiorno, quota);
      for (const r of villaggi) r.aggiornaLuci(now / 1000, 1 - _luceGiorno, quota);
      luciVicine(now / 1000, 1 - _luceGiorno);
    }
    orizzonte?.luciLontane?.(1 - _luceGiorno);   // M7, passo 8: luci dei borghi lontani (orizzonte.js)
    tt = segna('cielo e luci', tt);
    aggiornaStato();
    aggiornaIndicatoreAndatura();
    tt = segna('interfaccia', tt);
    minimappa.nascondi(!!percorso);        // percorso di prova: misure confrontabili con quelle di prima
    aggiornaConoscenza(dtReale);
    minimappa.aggiorna(now);
    tt = segna('minimappa', tt);
    if (percorso) {
      const r = percorso.aggiorna(dtReale, camera, (x, z) => suolo.getHeight(x, z));
      if (r.azzera) {
        if (percorso.modo === 'gruppi') {
          percorsoNormale = { totale: profilatore.media('totale'), calls: infoFrame.calls, triangles: infoFrame.triangles };
        }
        profilatore.azzera();
      }
      if (r.mira) aggiornaNebbia(r.mira);
      if (percorso.finito) fineDelPercorso();
    } else if (modoCamera === 'segui') {
      cam.update(dt);
      aggiornaNebbia(cam.mira);
    } else {
      controls.update();
      vincolaCameraLibera();
      aggiornaNebbia(controls.target);
    }
    tt = segna('camera', tt);
  }
  if (vegetazione && vegetazioneVisibile) {
    vegetazione.aggiorna(camera.position.x, camera.position.z, sole.position, _luceGiorno);
    tt = segna('vegetazione: aggiorna', tt);
    // Visuale pulita: ciò che sta tra camera e cavaliere si dirada (solo con la camera alle spalle)
    if (knight && modoCamera === 'segui' && !percorso) vegetazione.visuale(knight.stato.x, knight.stato.y, knight.stato.z);
    else vegetazione.visuale(null);
    tt = segna('vegetazione: visuale', tt);
  }
  aggiornaPannello(now);
  tt = segna('pannello F3', tt);
  qualita.aggiorna(dtReale, !!percorso || provaPrestazioni !== 0);
  infoFrame.msLogica = performance.now() - t0;
  const modoDisegno = percorso ? percorso.modo : provaPrestazioni === 1 ? 'gruppi' : 'normale';
  const r = profilatore.disegna(scene, camera, modoDisegno, gruppoDi);
  infoFrame.calls = r.calls;
  infoFrame.triangles = r.triangles;
  infoFrame.msInvio = r.msInvio;
  partiCPU['invio comandi'] = r.msInvio;
  if (percorso) {
    percorso.registraCPU(infoFrame.msLogica + r.msInvio);
    percorso.registraParti(partiCPU);
  }
}

camera.position.set(0, 300, 900);          // vista provvisoria mentre il terreno si carica
init().then(() => {
  if (PARAMETRI.has('carta') && !inStoria()) cartaVista.apri();
}).catch((err) => {
  console.error('[init]', err);
  avvisoHud(`Errore di avvio: ${err.message}`);
});
requestAnimationFrame(frame);
