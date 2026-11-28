// Knight Dawn — misura delle prestazioni sulla scheda vera (milestone «Prestazioni», passo 1: docs/PRESTAZIONI.md).
//
// - Profilatore: tempi della scheda video (EXT_disjoint_timer_query_webgl2) del fotogramma intero o, in modalità
//   «per gruppi», di terreno, vegetazione, edifici, personaggi e resto disegnati uno dopo l'altro (la profondità resta
//   tra un gruppo e l'altro; l'ordine di disegno cambia un poco rispetto al normale, quindi i gruppi sommati possono
//   differire dal totale: valgono come ripartizione). Tempi del processore: logica del fotogramma e invio dei comandi.
// - Percorso di prova: la camera fa un giro fisso attorno al cavaliere (vista di gioco, poi vista alta), due volte:
//   prima normale (FPS e tempo GPU totale), poi per gruppi (ripartizione). Il tempo di gioco è fermo. Alla fine un
//   riquadro riporta i numeri da copiare.
// Nessun effetto sul gioco finché non si usa (F3 → F4 «misura per gruppi», F9 o ?prova nell'indirizzo).

import * as THREE from 'three';

export const GRUPPI = ['ter. blocco', 'ter. orizzonte', 'veg. sagome lontane', 'veg. sagome', 'veg. erba', 'veg. resto',
  'edifici', 'personaggi', 'cielo', 'resto'];
/** Famiglie di gruppi con un budget comune: chiave di BUDGET_GPU → gruppi (la somma si confronta col budget). Il cielo
 *  (cupola, stelle, precipitazioni: oggetti col nome che comincia per «cielo») sta nel budget di acqua, cielo ed effetti. */
export const FAMIGLIE = {
  terreno: GRUPPI.filter((g) => g.startsWith('ter.')),
  vegetazione: GRUPPI.filter((g) => g.startsWith('veg.')),
  resto: ['cielo', 'resto'],
};
/** Budget in ms di GPU (docs/PRESTAZIONI.md, «Obiettivi e budget», approvati dall'utente); vegetazione complessiva. */
export const BUDGET_GPU = { terreno: 4.5, vegetazione: 6.5, edifici: 1.5, personaggi: 1.5, resto: 1.5, totale: 15.5 };
/** Budget di un gruppo (i gruppi «ter. …» e «veg. …» condividono quello della famiglia: null = vedi la somma). */
export const budgetDi = (g) => (Object.values(FAMIGLIE).some((f) => f.includes(g)) ? null : BUDGET_GPU[g]);

const CAMPIONI = 90;                       // media mobile sugli ultimi ~1,5 s a 60 FPS

/**
 * @param {THREE.WebGLRenderer} renderer
 */
export function creaProfilatore(renderer) {
  const gl = renderer.getContext();
  const supportate = gl.getSupportedExtensions() || [];
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const info = {
    scheda: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    timerGPU: !!ext,
    clipControl: supportate.includes('EXT_clip_control'),     // serve per la profondità invertita
    campioniMSAA: gl.getParameter(gl.SAMPLES),
    profonditaLog: !!renderer.capabilities.logarithmicDepthBuffer,
    profonditaInvertita: !!renderer.capabilities.reversedDepthBuffer,
    antialias: !!renderer.getContextAttributes()?.antialias,
  };

  // ─── Query dei tempi GPU (una sola attiva alla volta; i risultati arrivano qualche fotogramma dopo) ───
  const libere = [];
  const inAttesa = [];                     // { q, nome }
  const storico = {};                      // nome → array di ms
  function registra(nome, ms) {
    const a = storico[nome] || (storico[nome] = []);
    a.push(ms);
    if (a.length > CAMPIONI) a.shift();
  }
  function misura(nome, fn) {
    if (!ext) { fn(); return; }
    const q = libere.pop() || gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    fn();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    inAttesa.push({ q, nome });
  }
  /** Raccoglie i risultati pronti; se la GPU segnala un'interruzione (disjoint) li scarta. */
  function raccogli() {
    if (!ext || !inAttesa.length) return;
    const scarta = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (inAttesa.length) {
      const { q, nome } = inAttesa[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      inAttesa.shift();
      if (!scarta) registra(nome, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      libere.push(q);
    }
  }
  function media(nome) {
    const a = storico[nome];
    if (!a || !a.length) return null;
    let s = 0, max = 0;
    for (const v of a) { s += v; if (v > max) max = v; }
    return { media: s / a.length, max };
  }
  function azzera() { for (const k of Object.keys(storico)) delete storico[k]; }

  // ─── Disegno ───
  const salvati = [];
  /**
   * Disegna il fotogramma. modo 'normale': una passata (tempo «totale»); 'gruppi': una passata per gruppo.
   * @param {(o: THREE.Object3D) => string|null} gruppoDi  gruppo di un oggetto disegnabile (null = «resto»)
   * @returns {{calls:number, triangles:number, msInvio:number}}
   */
  function disegna(scene, camera, modo, gruppoDi) {
    raccogli();
    const t0 = performance.now();
    let calls = 0, triangles = 0;
    if (modo !== 'gruppi') {
      misura('totale', () => renderer.render(scene, camera));
      calls = renderer.info.render.calls; triangles = renderer.info.render.triangles;
    } else {
      // Gli oggetti disegnabili visibili (mesh, punti, linee, sprite), con il loro gruppo.
      salvati.length = 0;
      scene.traverseVisible((o) => {
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) salvati.push(o, gruppoDi(o) || 'resto');
      });
      // Uno sfondo a colore fa ripulire lo schermo a ogni render (anche con autoClear spento): si tiene solo nella
      // prima passata, poi si toglie, così ogni gruppo si disegna sopra i precedenti con la loro profondità.
      const autoClear = renderer.autoClear, sfondo = scene.background;
      renderer.clear();
      renderer.autoClear = false;
      for (const g of GRUPPI) {
        if (g !== GRUPPI[0]) scene.background = null;
        // Le luci non si toccano; gli oggetti già nascosti restano nascosti (non sono nella lista).
        for (let i = 0; i < salvati.length; i += 2) salvati[i].visible = salvati[i + 1] === g;
        misura(g, () => renderer.render(scene, camera));
        calls += renderer.info.render.calls; triangles += renderer.info.render.triangles;
      }
      renderer.autoClear = autoClear;
      scene.background = sfondo;
      for (let i = 0; i < salvati.length; i += 2) salvati[i].visible = true;
    }
    return { calls, triangles, msInvio: performance.now() - t0 };
  }

  return { info, disegna, media, azzera, raccogli };
}

// ─── Percorso di prova ──────────────────────────────────────────────────

const FASI = [
  // vista di gioco: alle spalle del cavaliere, giro completo dello sguardo
  { durata: 12, distanza: 4.5, altezza: 2.2, avanti: 30 },
  // vista alta: sopra e dietro, giro completo (molta vegetazione e orizzonte in vista)
  { durata: 5, distanza: 120, altezza: 70, avanti: 200 },
];
const DURATA_GIRO = FASI.reduce((s, f) => s + f.durata, 0);
const MAX_FOTOGRAMMA = 1;                 // s: un fotogramma più lungo invalida il percorso (finestra nascosta)
const ATTESA_INIZIALE = 1.5;               // s di assestamento (compilazione, primi caricamenti) non contati

/**
 * Percorso di prova: due giri uguali, il primo «normale», il secondo «per gruppi».
 * @param {{x:number, y:number, z:number, direzione:number}} centro  punto e direzione del cavaliere alla partenza
 * @param {{maxFotogramma?: number}} opz  s oltre cui un fotogramma invalida la misura (Infinity: mai, per la prova in
 *   headless con ?lento, dove ogni fotogramma dura secondi; lì contano solo errori e conteggi, non i tempi)
 */
export function creaPercorso(centro, { maxFotogramma = MAX_FOTOGRAMMA, sella = false } = {}) {
  // &sella (milestone Cavallo, passo 3): il cavaliere in sella, la vista di gioco con perno e distanza della camera in
  // sella (2,6 m invece di 1,6; ×6,5/4,2). Senza &sella il percorso resta identico.
  const fasi = sella ? [{ ...FASI[0], distanza: FASI[0].distanza * 6.5 / 4.2, altezza: FASI[0].altezza + 1.0 }, FASI[1]] : FASI;
  const tempi = [];                        // durata dei fotogrammi (ms) nel giro normale
  const cpu = [];                          // ms di processore per fotogramma (logica + invio) nel giro normale
  const parti = {};                        // nome → ms per fotogramma, nel giro normale
  // Compiti lunghi del browser (> 50 ms), anche fuori dal fotogramma: raccolta di memoria, messaggi, timer…
  const lunghi = { n: 0, max: 0 };
  let osservatore = null;
  try {
    osservatore = new PerformanceObserver((lista) => {
      if (t < 0 || t >= DURATA_GIRO) return;
      for (const e of lista.getEntries()) { lunghi.n++; lunghi.max = Math.max(lunghi.max, e.duration); }
    });
    osservatore.observe({ type: 'longtask', buffered: false });
  } catch { osservatore = null; }
  let t = -ATTESA_INIZIALE;
  let finito = false;
  let interrotto = 0;                      // s del fotogramma che ha invalidato la misura (0: valida)
  return {
    get finito() { return finito; },
    /** Durata (s) del fotogramma lunghissimo che ha interrotto il percorso, 0 se la misura è valida. */
    get interrotto() { return interrotto; },
    /** Modo di disegno del giro attuale. */
    get modo() { return t >= DURATA_GIRO ? 'gruppi' : 'normale'; },
    /**
     * Avanza di dt secondi e mette la camera sul percorso. Restituisce il punto guardato (per la nebbia) e `azzera`:
     * true al primo fotogramma di ciascun giro (le medie del profilatore vanno ripulite lì).
     */
    aggiorna(dt, camera, quota) {
      // Finestra nascosta o ridotta a icona: il browser ferma i fotogrammi e alla ripresa arriva un dt di decine di
      // secondi, che faceva saltare tutto il percorso senza un campione (risultati tutti «n/d»). Misura non valida.
      // Durante l'attesa iniziale il fotogramma lungo si ignora soltanto.
      if (dt > maxFotogramma) {
        if (t < 0) dt = 0;
        else { interrotto = dt; finito = true; osservatore?.disconnect(); return { mira: null, azzera: false }; }
      }
      const prima = t;
      t += dt;
      const azzera = (prima < 0 && t >= 0) || (prima < DURATA_GIRO && t >= DURATA_GIRO);
      if (t >= 0 && t < DURATA_GIRO) tempi.push(dt * 1000);
      if (t >= 2 * DURATA_GIRO) { finito = true; osservatore?.disconnect(); return { mira: null, azzera: false }; }
      let tt = Math.max(0, t) % DURATA_GIRO, f = fasi[0];
      for (const fase of fasi) { f = fase; if (tt < fase.durata) break; tt -= fase.durata; }
      const ang = centro.direzione + (tt / f.durata) * Math.PI * 2;
      const sx = Math.sin(ang), sz = Math.cos(ang);
      const cx = centro.x - sx * f.distanza, cz = centro.z - sz * f.distanza;
      const cy = Math.max(centro.y, quota(cx, cz)) + f.altezza;
      const tx = centro.x + sx * f.avanti, tz = centro.z + sz * f.avanti;
      const mira = new THREE.Vector3(tx, quota(tx, tz) + 1.5, tz);
      camera.position.set(cx, cy, cz);
      camera.lookAt(mira);
      return { mira, azzera };
    },
    /** ms di processore di questo fotogramma (logica + invio dei comandi). */
    registraCPU(ms) { if (t >= 0 && t < DURATA_GIRO) cpu.push(ms); },
    /** ms di ciascuna parte del fotogramma (oggetto nome → ms). */
    registraParti(p) {
      if (t < 0 || t >= DURATA_GIRO) return;
      for (const k in p) (parti[k] || (parti[k] = [])).push(p[k]);
    },
    /** Statistiche dei fotogrammi del giro normale. */
    statistiche() {
      const v = tempi.slice().sort((a, b) => a - b);
      if (!v.length) return null;
      const media = v.reduce((s, x) => s + x, 0) / v.length;
      const p99 = v[Math.min(v.length - 1, Math.floor(v.length * 0.99))];
      const c = cpu.slice().sort((a, b) => a - b);
      const cpuMedia = c.length ? c.reduce((s, x) => s + x, 0) / c.length : NaN;
      const cpu99 = c.length ? c[Math.min(c.length - 1, Math.floor(c.length * 0.99))] : NaN;
      const elenco = Object.entries(parti).map(([nome, a]) => {
        const o = a.slice().sort((x, y) => x - y);
        return { nome, media: o.reduce((s, x) => s + x, 0) / o.length, p99: o[Math.min(o.length - 1, Math.floor(o.length * 0.99))], max: o[o.length - 1] };
      }).sort((x, y) => y.max - x.max);
      return { fotogrammi: v.length, fps: 1000 / media, msMedio: media, fps1: 1000 / p99, msPeggiore: v[v.length - 1],
        cpuMedia, cpu99, cpuMax: c.length ? c[c.length - 1] : NaN, parti: elenco, lunghi: osservatore ? lunghi : null };
    },
  };
}

// ─── Qualità e risoluzione adattiva (docs/PRESTAZIONI.md, passo 2) ────────────────────────────────────────────────
// Tre preset (tasto F2, ?qualita=basso|medio|alto, ricordato nel browser). Sulla scheda di riferimento (Intel UHD 730,
// schermo al 100 %) «medio» è identico a com'era prima: servono ai PC più deboli o agli schermi ad alta densità.
// La risoluzione adattiva scende a passi del 10 % (fino al 60 %) quando la scheda sfora e risale del 5 % quando c'è
// margine; usa i tempi GPU se ci sono, altrimenti la durata dei fotogrammi. Ferma durante il percorso di prova.

export const PRESET_QUALITA = {
  basso: { nome: 'bassa', maxDpr: 1, scala: 0.75, rilievo: false },
  medio: { nome: 'media', maxDpr: 1.5, scala: 1, rilievo: true },
  alto: { nome: 'alta', maxDpr: 2, scala: 1, rilievo: true },
};
const ORDINE_QUALITA = ['basso', 'medio', 'alto'];
const ADATTIVA = { min: 0.6, giu: 0.9, su: 1.05, finestra: 1000, msSfora: 15, msMargine: 10.5, fotoSfora: 18,
  fotoMargine: 14, finestreSu: 3 };

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {ReturnType<typeof creaProfilatore>} profilatore
 * @param {string} iniziale  chiave di PRESET_QUALITA
 * @param {(rilievo: boolean) => void} applicaRilievo  accende o spegne il micro-rilievo del suolo
 */
export function creaQualita(renderer, profilatore, iniziale, applicaRilievo) {
  let chiave = PRESET_QUALITA[iniziale] ? iniziale : 'medio';
  let adatta = 1;                          // fattore della risoluzione adattiva (ADATTIVA.min … 1)
  let t = 0, somma = 0, n = 0, buone = 0;
  const base = () => Math.min(window.devicePixelRatio || 1, PRESET_QUALITA[chiave].maxDpr) * PRESET_QUALITA[chiave].scala;
  const applica = () => renderer.setPixelRatio(base() * adatta);
  function imposta(k) {
    chiave = PRESET_QUALITA[k] ? k : 'medio';
    adatta = 1; t = somma = n = buone = 0;
    applica();
    applicaRilievo(PRESET_QUALITA[chiave].rilievo);
    try { localStorage.setItem('kd-qualita', chiave); } catch { /* niente memoria: va bene lo stesso */ }
  }
  return {
    get chiave() { return chiave; },
    get nome() { return PRESET_QUALITA[chiave].nome; },
    get scala() { return base() * adatta; },
    get adatta() { return adatta; },
    imposta,
    successiva() { imposta(ORDINE_QUALITA[(ORDINE_QUALITA.indexOf(chiave) + 1) % ORDINE_QUALITA.length]); },
    /** Torna alla risoluzione piena del preset (inizio del percorso di prova). */
    azzeraAdattiva() { adatta = 1; t = somma = n = buone = 0; applica(); },
    /** Da chiamare a ogni fotogramma con la durata reale (s); `ferma` = niente adattamento (percorso di prova). */
    aggiorna(dt, ferma) {
      if (ferma || dt <= 0 || dt > 0.25) return;      // fotogrammi enormi (cambio di scena, scheda nascosta): ignorati
      t += dt * 1000; somma += dt * 1000; n++;
      if (t < ADATTIVA.finestra) return;
      const foto = somma / n, gpu = profilatore.media('totale')?.media;
      const sfora = gpu != null ? gpu > ADATTIVA.msSfora : foto > ADATTIVA.fotoSfora;
      const margine = gpu != null ? gpu < ADATTIVA.msMargine : foto < ADATTIVA.fotoMargine;
      t = somma = n = 0;
      if (sfora && adatta > ADATTIVA.min) {
        adatta = Math.max(ADATTIVA.min, adatta * ADATTIVA.giu); buone = 0; applica(); profilatore.azzera();
      } else if (margine && adatta < 1) {
        if (++buone >= ADATTIVA.finestreSu) { adatta = Math.min(1, adatta * ADATTIVA.su); buone = 0; applica(); profilatore.azzera(); }
      } else buone = 0;
    },
  };
}
