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

export const GRUPPI = ['terreno', 'veg. sagome lontane', 'veg. sagome', 'veg. erba', 'veg. resto', 'edifici',
  'personaggi', 'resto'];
/** Budget provvisori in ms di GPU (docs/PRESTAZIONI.md, «Obiettivi e budget»); la vegetazione ha un budget complessivo. */
export const BUDGET_GPU = { terreno: 4, vegetazione: 4, edifici: 2, personaggi: 2, resto: 1.5, totale: 13.5 };
/** Budget di un gruppo (i gruppi «veg. …» condividono quello della vegetazione: null = vedi la somma). */
export const budgetDi = (g) => (g.startsWith('veg.') ? null : BUDGET_GPU[g]);

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
const ATTESA_INIZIALE = 1.5;               // s di assestamento (compilazione, primi caricamenti) non contati

/**
 * Percorso di prova: due giri uguali, il primo «normale», il secondo «per gruppi».
 * @param {{x:number, y:number, z:number, direzione:number}} centro  punto e direzione del cavaliere alla partenza
 */
export function creaPercorso(centro) {
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
  return {
    get finito() { return finito; },
    /** Modo di disegno del giro attuale. */
    get modo() { return t >= DURATA_GIRO ? 'gruppi' : 'normale'; },
    /**
     * Avanza di dt secondi e mette la camera sul percorso. Restituisce il punto guardato (per la nebbia) e `azzera`:
     * true al primo fotogramma di ciascun giro (le medie del profilatore vanno ripulite lì).
     */
    aggiorna(dt, camera, quota) {
      const prima = t;
      t += dt;
      const azzera = (prima < 0 && t >= 0) || (prima < DURATA_GIRO && t >= DURATA_GIRO);
      if (t >= 0 && t < DURATA_GIRO) tempi.push(dt * 1000);
      if (t >= 2 * DURATA_GIRO) { finito = true; osservatore?.disconnect(); return { mira: null, azzera: false }; }
      let tt = Math.max(0, t) % DURATA_GIRO, f = FASI[0];
      for (const fase of FASI) { f = fase; if (tt < fase.durata) break; tt -= fase.durata; }
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
