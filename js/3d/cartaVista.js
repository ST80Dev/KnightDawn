// Knight Dawn — vista di sviluppo della Carta (M6). Non è la Carta del cronista (fase G3): serve a
// guardare il mondo generato mentre si tara il generatore.
// Si apre con M (o con ?carta nell'indirizzo); ?seme=… sceglie il seme. Mentre è aperta il gioco è
// fermo e la scena 3D non si disegna.
//
// La pittura dei pixel (disegnaRilievo) non usa il DOM: si può chiamare anche fuori dal browser.

import { generaCarta } from '../mondo/carta.js';
import { semeDaTesto } from '../mondo/rumore.js';

// Colori del rilievo: SOLO quota (metri), a un solo tono, più alto = più scuro. Niente verdi, ocra o
// bianchi: si leggerebbero come biomi (prati, deserti, neve), che arrivano al passo 6 come livello a sé.
// Una tappa per ogni limite di fascia: pianura 0–200, collina 200–700, pedemonte 700–1500, montagna.
const TERRA = [
  [0, [236, 228, 204]],
  [200, [212, 196, 162]],
  [700, [178, 156, 122]],
  [1500, [132, 112, 90]],
  [3500, [76, 62, 52]],
];
const FASCE = [['pianura', 0, 200], ['collina', 200, 700], ['pedemonte', 700, 1500], ['montagna', 1500, Infinity]];
const MARE_BASSO = [122, 158, 168], MARE_FONDO = [40, 70, 92];
const COSTA = [70, 52, 30];
const ESAGERAZIONE = 6;           // quanto il rilievo pesa nell'ombreggiatura
const COLORE_MASSICCI = 'rgba(150, 40, 30, 0.85)';
const fasciaDi = (m) => FASCE.find(([, a, b]) => m >= a && m < b)?.[0] ?? 'montagna';
const LUCE = (() => {             // luce da nord-ovest, alta 45°
  const x = -1, y = -1, z = 1.4142135623730951;
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
})();

function tinta(scala, t) {
  for (let i = 1; i < scala.length; i++) {
    if (t <= scala[i][0]) {
      const [t0, c0] = scala[i - 1], [t1, c1] = scala[i];
      const u = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return scala[scala.length - 1][1];
}

/** Pixel RGBA (una cella = un pixel) della Carta: tinte per quota, rilievo ombreggiato, costa. */
export function disegnaRilievo(carta, pixel = new Uint8ClampedArray(carta.cols * carta.rows * 4)) {
  const { cols, rows, quota, mare } = carta;
  const q = (x, y) => {
    x = x < 0 ? 0 : x >= cols ? cols - 1 : x;
    y = y < 0 ? 0 : y >= rows ? rows - 1 : y;
    const v = quota[y * cols + x];
    return v > 0 ? v : 0;                       // il mare è piatto per l'ombreggiatura
  };
  const piatto = LUCE[2];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let c;
      if (mare[i]) {
        c = tinta([[0, MARE_BASSO], [1, MARE_FONDO]], Math.sqrt(Math.min(1, -quota[i] / 2500)));
      } else {
        const dx = (q(x + 1, y) - q(x - 1, y)) * 0.5 / carta.cella * ESAGERAZIONE;
        const dy = (q(x, y + 1) - q(x, y - 1)) * 0.5 / carta.cella * ESAGERAZIONE;
        const l = Math.sqrt(dx * dx + dy * dy + 1);
        const luce = (-dx * LUCE[0] - dy * LUCE[1] + LUCE[2]) / l / piatto;
        const ombra = 0.55 + 0.45 * Math.min(1.5, Math.max(0, luce));
        c = tinta(TERRA, quota[i]).map((v) => v * ombra);
        const costa = (x > 0 && mare[i - 1]) || (x < cols - 1 && mare[i + 1])
          || (y > 0 && mare[i - cols]) || (y < rows - 1 && mare[i + cols]);
        if (costa) c = c.map((v, k) => v * 0.45 + COSTA[k] * 0.55);
      }
      const p = i * 4;
      pixel[p] = c[0]; pixel[p + 1] = c[1]; pixel[p + 2] = c[2]; pixel[p + 3] = 255;
    }
  }
  return pixel;
}

const fmt = (n, d = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Crea la vista (nascosta) e la aggiunge a `contenitore`.
 * @param {{ onCambio?: (aperta: boolean) => void }} opzioni
 */
export function createCartaVista(contenitore, opzioni = {}) {
  const el = document.createElement('div');
  el.id = 'carta';
  el.hidden = true;
  el.innerHTML = `
    <div class="barra">
      <span class="titolo">Carta · sviluppo</span>
      <label>Seme <input type="text" class="seme" spellcheck="false" autocomplete="off"></label>
      <button type="button" class="genera">Genera</button>
      <button type="button" class="casuale">Seme casuale</button>
      <span class="legenda" title="Colore = quota, non biomi (biomi al passo 6)">quota 0 <i></i> 3500 m · non biomi · <b>○</b> massicci</span>
      <span class="info"></span>
      <span class="tasto">M: torna alla scena</span>
    </div>
    <div class="area"><canvas></canvas></div>
    <div class="piede">
      <div class="cursore">&nbsp;</div>
      <div class="fasce"></div>
      <canvas class="istogramma" width="360" height="56" title="Quote della terra, a passi di 100 m"></canvas>
    </div>`;
  contenitore.appendChild(el);
  el.querySelector('.legenda i').style.background = 'linear-gradient(to right, '
    + TERRA.map(([, c], k) => `rgb(${c.join(',')}) ${k / (TERRA.length - 1) * 100}%`).join(', ') + ')';
  el.querySelector('.legenda b').style.color = COLORE_MASSICCI;
  const elFasce = el.querySelector('.fasce');
  const isto = el.querySelector('.istogramma');

  const inSeme = el.querySelector('.seme');
  const elInfo = el.querySelector('.info');
  const elCursore = el.querySelector('.cursore');
  const area = el.querySelector('.area');
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let carta = null;

  function adatta() {
    if (!carta || el.hidden) return;
    const w = area.clientWidth, h = area.clientHeight;
    const scala = Math.min(w / carta.cols, h / carta.rows);
    canvas.style.width = Math.floor(carta.cols * scala) + 'px';
    canvas.style.height = Math.floor(carta.rows * scala) + 'px';
  }

  function genera(testo) {
    const t = String(testo).trim() || String(Math.floor(Math.random() * 1e6));
    inSeme.value = t;
    carta = generaCarta(semeDaTesto(t));
    canvas.width = carta.cols;
    canvas.height = carta.rows;
    const img = ctx.createImageData(carta.cols, carta.rows);
    disegnaRilievo(carta, img.data);
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = COLORE_MASSICCI;
    ctx.lineWidth = 1.5;
    for (const m of carta.massicci) {
      ctx.beginPath();
      ctx.arc(m.x + 0.5, m.y + 0.5, m.raggio * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    disegnaIstogramma();
    const s = carta.statistiche;
    elInfo.textContent = `${carta.cols}×${carta.rows} km · mare ${fmt(s.frazioneMare * 100, 1)} %`
      + ` · ${fmt(s.ms)} ms · controllo ${carta.controllo}`;
    // Il seme va nell'indirizzo: ricaricando o condividendo il link si ritrova lo stesso mondo.
    const url = new URL(window.location.href);
    url.searchParams.set('seme', t);
    window.history.replaceState(null, '', url);
    adatta();
  }

  // Istogramma delle quote della terra (passi di 100 m, altezza in radice quadrata per vedere le code)
  // e parte della terra per fascia.
  function disegnaIstogramma() {
    const passo = 100, nBin = 36;
    const conta = new Uint32Array(nBin);
    for (let i = 0; i < carta.quota.length; i++) {
      if (carta.mare[i]) continue;
      conta[Math.min(nBin - 1, Math.floor(carta.quota[i] / passo))]++;
    }
    const max = Math.sqrt(Math.max(...conta)) || 1;
    const c2 = isto.getContext('2d');
    c2.clearRect(0, 0, isto.width, isto.height);
    const w = isto.width / nBin;
    for (let b = 0; b < nBin; b++) {
      const h = Math.sqrt(conta[b]) / max * (isto.height - 2);
      c2.fillStyle = `rgb(${tinta(TERRA, (b + 0.5) * passo).map(Math.round).join(',')})`;
      c2.fillRect(b * w + 0.5, isto.height - h, w - 1, h);
    }
    c2.fillStyle = '#8a6030';
    for (const [, a] of FASCE.slice(1)) c2.fillRect(a / passo * w - 0.5, 0, 1, isto.height);
    const f = carta.statistiche.fasce, pc = (x) => fmt(x * 100, 1) + ' %';
    elFasce.textContent = `pianura ${pc(f.pianura)} · collina ${pc(f.collina)} · pedemonte ${pc(f.pedemonte)}`
      + ` · montagna ${pc(f.montagna)} · cima ${fmt(carta.statistiche.cima)} m`
      + ` · massicci ${carta.massicci.length} (${carta.massicci.map((m) => fmt(m.cima)).join(', ')} m)`;
  }

  function apri() {
    if (!el.hidden) return;
    el.hidden = false;
    if (!carta) genera(new URL(window.location.href).searchParams.get('seme') || '');
    adatta();
    opzioni.onCambio?.(true);
  }
  function chiudi() {
    if (el.hidden) return;
    el.hidden = true;
    inSeme.blur();
    opzioni.onCambio?.(false);
  }

  el.querySelector('.genera').addEventListener('click', () => genera(inSeme.value));
  el.querySelector('.casuale').addEventListener('click', () => genera(''));
  inSeme.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') genera(inSeme.value);
    e.stopPropagation();                         // i tasti del gioco non devono scattare scrivendo
  });
  window.addEventListener('resize', adatta);

  canvas.addEventListener('pointermove', (e) => {
    if (!carta) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * carta.cols);
    const y = Math.floor((e.clientY - r.top) / r.height * carta.rows);
    if (x < 0 || y < 0 || x >= carta.cols || y >= carta.rows) return;
    const i = y * carta.cols + x;
    const q = carta.quota[i];
    elCursore.textContent = `cella ${x}, ${y} (km da ovest, da nord) · `
      + (carta.mare[i] ? `mare, profondità ${fmt(-q)} m`
        : `quota ${fmt(q)} m (${fasciaDi(q)}) · catena ${fmt(carta.catena[i], 2)}`);
  });
  canvas.addEventListener('pointerleave', () => { elCursore.innerHTML = '&nbsp;'; });

  return {
    get aperta() { return !el.hidden; },
    get carta() { return carta; },
    apri, chiudi,
    alterna() { if (el.hidden) apri(); else chiudi(); },
    genera,
  };
}
