// Knight Dawn — rocca del mondo generato (M7). Cinta poligonale irregolare (js/mondo/luoghi.js: 5–8 vertici attorno
// alla cima, diversa per ogni castello), una torre su ogni vertice (tonde o quadrate secondo il castello), mastio
// verso il retro, torre-porta sul lato verso il borgo col minor dislivello e rampa che scende lungo il muro (o dritta,
// se lungo il muro non c'è posto). Il castello di prova di Tavullia resta in castle3d.js.
//
// Coordinate locali come il borgo e il generatore: u lungo il verso del luogo (dalla rocca verso il borgo), v di
// traverso; origine al centro del sito. Le geometrie si costruiscono già nel blocco e si uniscono per materiale
// (docs/PRESTAZIONI.md, passo 6): una manciata di oggetti da disegnare per rocca.
// Interfaccia comune con il borgo: object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci.
// Da qui vengono anche le geometrie e le collisioni che il borgo (borgo3d.js) usa per la sua cinta.

import * as THREE from 'three';
import { creaKit, siToccano, EDIFICI, completaPezzi } from './edifici3d.js';

/** Misure secondo la classe del luogo. torre: raggio (tonde) o mezzo lato (quadrate). */
export const MISURE_ROCCA = {
  minore:   { altezza: 7.5, spessore: 2.0, torre: 3.2, mastio: { lato: 9, altezza: 18 } },
  casata:   { altezza: 9, spessore: 2.2, torre: 3.6, mastio: { lato: 11, altezza: 22 } },
  maggiore: { altezza: 10, spessore: 2.4, torre: 4.2, mastio: { lato: 13, altezza: 26 } },
};

const PORTA = { larghezza: 3.4, imposta: 3.0, torreLarghezza: 8, sporgenza: 3.5, profondita: 6, sopraMura: 3 };
// Corte del signore (M7, passo 10): il muro interno taglia la cinta di traverso; dietro (lontano dal borgo) `dietro` della
// profondità è la corte del signore, davanti la corte d'armi. Mastio a cavallo del muro, porta ad arco in linea con la porta della rocca.
const CORTI = { dietro: 0.46, altezza: 5.5, spessore: 1.3, porta: 3.2, imposta: 3.4 };
// stacco: m tra la torre-porta e la rampa lungo il muro (così passa fuori dalle torri dei vertici).
const RAMPA = { larghezza: 4.4, stacco: 2.5, pendenza: 0.22, minima: 3, massima: 40, parapetto: 0.5, muretto: 0.45 };
const SCARPA = 0.18;                      // inclinazione della scarpa alla base (tangente: ~10°)
const SOPRA_TORRI = 4;
// Terrazzi sotto la rocca (js/mondo/luoghi.js, piani di tipo 'terrazzo'): cinta bassa con torricelle sugli spigoli.
const TERRAZZO = { altezza: 3.5, spessore: 1.4, torre: 2.2, sopraTorre: 2, tratto: 6 };

// Pietra grigio-bruna (richiesta dell'utente: «meno mattone, più pietra», niente colori terra/fango): i nomi
// restano quelli di prima (mattone = muratura principale, scuro = scarpe, pietra = cornici e lastrici).
const COL = {
  mattone: '#aa9d87', scuro: '#8d8170', pietra: '#c4baa5', merlo: '#a29682',
  legno: '#5b3b20', ferro: '#2e2b28', terra: '#9c8762',
};
const LUCE_RIFLESSA = 0.2;                // come castle3d.js: i lati in ombra non escono neri
const MURATURA = new Set(['mattone', 'scuro', 'pietra', 'merlo']);   // materiali con texture e gradazione

const TORCIA = {
  altezza: 2.7, scostamento: 1.15,
  luce: { colore: '#ff9a40', intensita: 18, distanza: 16, decadimento: 1.7 },
  alone: 2.4,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ─── Geometrie comuni (anche per il borgo) ────────────────────────────────

/** Prisma a facce piane tra due quadrilateri (punti [x, z], stesso ordine), facce verso l'esterno. */
export function prisma(basso, alto, yb, yt) {
  // yt: un numero (cima piana) o 4 quote, una per vertice di `alto` (cima in pendenza: parapetti delle rampe).
  const V = [...basso.map(([x, z]) => [x, yb, z]), ...alto.map(([x, z], i) => [x, Array.isArray(yt) ? yt[i] : yt, z])];
  const C = [0, 1, 2].map((k) => V.reduce((s, v) => s + v[k], 0) / 8);
  const facce = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of facce) {
    const [a, b, c, d] = f.map((i) => V[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const fc = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - C[k]);
    const tri = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(...p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// ─── Gradazione delle mura (richiesta dell'utente: «sembra tutto piatto, non si capiscono spigoli e lati») ───
// Con la sola luce emisferica tutte le facce verticali in ombra escono dello stesso colore. Due rimedi senza costi
// di disegno (docs/PRESTAZIONI.md, passo 6: dettaglio in una texture generata una volta):
//   - colore per vertice: più chiaro o più scuro secondo dove guarda la faccia (una «luce del cielo» fissa di
//     traverso), più una leggera variazione di tono a chiazze di qualche metro;
//   - texture a corsi di mattoni e conci (scala di grigi, moltiplica il colore del materiale), coordinate dalla
//     posizione: lungo la faccia e in altezza sulle pareti, in pianta sulle facce orizzontali.
// Ombra secondo il sole (materialeMuro): luce del cielo e riflessa × `minimo` sulle facce girate dal sole; la luce
// riflessa fissa della pietra ridotta (× `riflessa`), perché schiariva uguale tutte le facce in ombra.
const OMBRA_SOLE = { minimo: 0.38, riflessa: 0.5 };
const GRADAZIONE = { cielo: [-0.6, -0.8], lati: 0.22, chiazze: 0.16, fini: 0.08, tessera: 6.4,
  // Piede più scuro (terra, umidità, ombra del terreno): da `piede` × al piede a 1 in `alto` m; galleria delle porte.
  piede: 0.68, alto: 4, galleria: [0.13, 0.4] };
// Tono di fondo diverso per ogni luogo (richiesta dell'utente), a caso entro questi limiti: chiarezza (×) e calore
// (+ più bruno, − più grigio). Rocca e borgo dello stesso luogo hanno lo stesso tono.
// Una parte dei luoghi (`scuri`) ha pietra molto scura (basalto, pietra annerita: tipico dei castelli fantasy,
// richiesta dell'utente), più fredda; gli altri restano nel range chiaro.
const TONO_LUOGO = { chiaro: [0.82, 1.1], scuri: 0.2, scuro: [0.45, 0.66], caldo: [-0.07, 0.09] };
let _muro = null;
/**
 * Texture della muratura di pietra (512 px = GRADAZIONE.tessera m, 80 px/m), ripetibile e poco regolare (richiesta
 * dell'utente: niente trama a griglia): corsi di altezza diversa, conci di lunghezza diversa con giunti storti,
 * qualcuno alto due corsi; il tono di ogni concio segue un campo a macchie larghe più una parte sua, così chiari e
 * scuri si raggruppano invece di fare una scacchiera. In scala di grigi caldi: moltiplica il colore del materiale.
 */
export function texturaMuro() {
  if (_muro) return _muro;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let seme = 777;
  const rnd = () => ((seme = (seme * 1103515245 + 12345) >>> 0) / 4294967296);
  // Campo di tono a macchie larghe, ripetibile: somma di onde con periodo intero sulla tessera.
  const onde = Array.from({ length: 6 }, () => ({ a: 1 + Math.floor(rnd() * 3), b: Math.floor(rnd() * 3), f: rnd() * 6.28, w: 0.5 + rnd() }));
  const campo = (x, y) => {
    let v = 0, t = 0;
    for (const o of onde) { v += o.w * Math.sin(2 * Math.PI * (o.a * x + o.b * y) / N + o.f); t += o.w; }
    return v / t;                                         // circa −1…1
  };
  g.fillStyle = 'rgb(140,136,128)';                      // malta
  g.fillRect(0, 0, N, N);
  const corsi = [];
  for (let y = 0; y < N;) {
    let h = 16 + Math.floor(rnd() * 26);
    if (N - (y + h) < 16) h = N - y;
    corsi.push([y, h]); y += h;
  }
  const concio = (x, y, w, h) => {
    const m = campo(x + w / 2, y + h / 2);
    let v = 178 + m * 34 + (rnd() - 0.5) * 50;
    if (rnd() < 0.06) v -= 45;                           // qualche concio scuro, raro
    v = clamp(Math.round(v), 80, 245);
    const t = Math.floor(rnd() * 22) - 8;                // > 0 più bruno, < 0 più grigio
    const col = (d) => `rgb(${clamp(v + t + d, 0, 255)},${clamp(v + d, 0, 255)},${clamp(v - t * 0.8 + d - 4, 0, 255)})`;
    const gx = x + 1.5, gy = y + 1.5, gw = w - 3, gh = h - 3, j = () => (rnd() - 0.5) * 4;
    g.fillStyle = col(0);
    g.beginPath();                                       // giunti storti, spigoli smussati
    g.moveTo(gx + 3 + j(), gy + j() * 0.5); g.lineTo(gx + gw * 0.5 + j(), gy + j() * 0.5); g.lineTo(gx + gw - 3 + j(), gy + j() * 0.5);
    g.lineTo(gx + gw + j(), gy + gh * 0.5 + j()); g.lineTo(gx + gw - 3 + j(), gy + gh + j() * 0.5);
    g.lineTo(gx + gw * 0.5 + j(), gy + gh + j() * 0.5); g.lineTo(gx + 3 + j(), gy + gh + j() * 0.5); g.lineTo(gx + j(), gy + gh * 0.5 + j());
    g.closePath(); g.fill();
    for (let k = 0; k < 7; k++) {                        // macchie e venature
      g.fillStyle = `rgba(${rnd() < 0.55 ? '40,34,28' : '255,250,240'},${0.04 + rnd() * 0.1})`;
      g.beginPath();
      g.ellipse(gx + rnd() * gw, gy + rnd() * gh, 2 + rnd() * gw * 0.3, 1 + rnd() * gh * 0.35, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(30,25,20,0.2)'; g.fillRect(gx + 2, gy + gh - 2, gw - 4, 2);
    g.fillStyle = 'rgba(255,250,240,0.1)'; g.fillRect(gx + 2, gy, gw - 4, 1.5);
  };
  // Conci alti due corsi: si segnano e il corso sotto lascia il posto.
  const occupato = [];
  corsi.forEach(([y, h], ri) => {
    let x = -Math.floor(rnd() * 60);
    while (x < N) {
      const w = 30 + Math.floor(rnd() * 80);
      const fine = x + w;
      const libero = !occupato.some((o) => o.ri === ri && o.x0 < fine && o.x1 > x);
      if (libero) {
        const doppio = ri + 1 < corsi.length && rnd() < 0.08;
        const hh = doppio ? h + corsi[ri + 1][1] : h;
        if (doppio) occupato.push({ ri: ri + 1, x0: x, x1: fine });
        for (const dx of [0, -N, N]) if (x + dx < N && fine + dx > 0) concio(x + dx, y, w, hh);
      }
      x = fine;
    }
  });
  // Grana fine su tutto.
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (rnd() - 0.5) * 18;
    d[i] = clamp(d[i] + k, 0, 255); d[i + 1] = clamp(d[i + 1] + k, 0, 255); d[i + 2] = clamp(d[i + 2] + k, 0, 255);
  }
  g.putImageData(img, 0, 0);
  _muro = new THREE.CanvasTexture(c);
  _muro.colorSpace = THREE.SRGBColorSpace;
  _muro.wrapS = _muro.wrapT = THREE.RepeatWrapping;
  _muro.anisotropy = 4;
  return _muro;
}
const _h3 = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
/**
 * Aggiunge `uv` (dalla posizione) e `color` (lato e chiazze) a una geometria. `orientata` = false per le geometrie
 * a istanze (le normali locali non dicono dove guarda la faccia nel mondo): solo le chiazze.
 */
export function rifinisci(geo, orientata = true, ombra = null, asse = null) {
  const p = geo.attributes.position, n = geo.attributes.normal, G = GRADAZIONE;
  const lc = Math.hypot(G.cielo[0], G.cielo[1]), cx = G.cielo[0] / lc, cz = G.cielo[1] / lc;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  // Geometrie non indicizzate (quelle unite): coordinate per triangolo dalla normale della sua faccia, e uno
  // scostamento della texture diverso per ogni piano (stessa normale e distanza → stesso scostamento: i due
  // triangoli di una faccia combaciano), così le ripetizioni non si allineano da un tratto di muro all'altro.
  const perFaccia = orientata && !geo.index && p.count % 3 === 0;
  let fnx = 0, fny = 1, fnz = 0, ou = 0, ov = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let nx = n ? n.getX(i) : 0, ny = n ? n.getY(i) : 1, nz = n ? n.getZ(i) : 0;
    if (perFaccia) {
      if (i % 3 === 0) {
        const ax = p.getX(i + 1) - x, ay = p.getY(i + 1) - y, az = p.getZ(i + 1) - z;
        const bx = p.getX(i + 2) - x, by = p.getY(i + 2) - y, bz = p.getZ(i + 2) - z;
        fnx = ay * bz - az * by; fny = az * bx - ax * bz; fnz = ax * by - ay * bx;
        const l = Math.hypot(fnx, fny, fnz) || 1;
        fnx /= l; fny /= l; fnz /= l;
        if (fnx * nx + fny * ny + fnz * nz < 0) { fnx = -fnx; fny = -fny; fnz = -fnz; }
        const dp = fnx * x + fny * y + fnz * z;
        ou = _h3(Math.round(fnx * 40), Math.round(fnz * 40) + Math.round(fny * 7) * 97, Math.round(dp * 2));
        ov = _h3(Math.round(fnz * 40) - 5, Math.round(fnx * 40) + 13, Math.round(dp * 2) + 71);
      }
      nx = fnx; ny = fny; nz = fnz;
    }
    if (Math.abs(ny) > 0.7 && asse && (asse[2 * i] || asse[2 * i + 1])) {
      // Facce in piano o poco inclinate con un asse proprio (falde dei tetti: i coppi corrono lungo la pendenza).
      const ax = asse[2 * i], az = asse[2 * i + 1];
      uv[2 * i] = (x * ax + z * az) / G.tessera + ou; uv[2 * i + 1] = (-x * az + z * ax) / G.tessera + ov;
    } else if (Math.abs(ny) > 0.7) { uv[2 * i] = x / G.tessera + ou; uv[2 * i + 1] = z / G.tessera + ov; } else {
      const l = Math.hypot(nx, nz) || 1, tx = -nz / l, tz = nx / l;
      uv[2 * i] = (x * tx + z * tz) / G.tessera + ou; uv[2 * i + 1] = y / G.tessera + ov;
    }
    let k = ombra ? ombra[i] : 1;
    if (orientata && Math.abs(ny) < 0.7) {
      const l = Math.hypot(nx, nz) || 1;
      k *= 1 - G.lati + G.lati * (0.5 + 0.5 * (nx * cx + nz * cz) / l) * 1.15;   // (× l'ombra del pezzo)
    } else if (orientata && ny < -0.7) k *= 0.7;           // sotto (sporti, parapetti)
    k *= 1 - G.chiazze + 2 * G.chiazze * _h3(Math.floor(x / 4), Math.floor(y / 3), Math.floor(z / 4));
    k *= 1 - G.fini + 2 * G.fini * _h3(Math.floor(x / 1.5) + 7, Math.floor(y / 1.2), Math.floor(z / 1.5) - 3);
    // Un po' più calda o più fredda a chiazze larghe (pietre di cave diverse, licheni, dilavamento).
    const tinta = (_h3(Math.floor(x / 7) - 11, Math.floor(y / 5), Math.floor(z / 7) + 5) - 0.5) * 0.08;
    col[3 * i] = Math.min(1, k * (1 + tinta)); col[3 * i + 1] = Math.min(1, k); col[3 * i + 2] = Math.min(1, k * (1 - tinta));
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** Materiale di muratura: colore × texture dei corsi × colore per vertice (vedi GRADAZIONE). */
export function materialeMuro(colore, riflessa, mappa = texturaMuro()) {
  const m = new THREE.MeshLambertMaterial({ color: colore, flatShading: true, map: mappa, vertexColors: true });
  m.emissive.set(colore).multiplyScalar(riflessa * OMBRA_SOLE.riflessa);
  // Facce in ombra davvero scure (richiesta dell'utente: una facciata girata dal sole sembrava illuminata come le
  // altre). Senza ombre portate, la luce del cielo e quella riflessa arrivano uguali su ogni parete verticale: qui
  // calano sulle facce girate dalla parte opposta al sole (o alla luna, la luce direzionale più forte), fino a
  // OMBRA_SOLE.minimo. Nessun costo di disegno: due righe nello shader della pietra.
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      #if NUM_DIR_LIGHTS > 0
        vec3 dirSole = vec3(0.0);
        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) dirSole += directionalLights[ i ].direction * dot(directionalLights[ i ].color, vec3(0.333));
        #pragma unroll_loop_end
        if (dot(dirSole, dirSole) > 1e-6) {
          float versoSole = dot(normal, normalize(dirSole));
          float kOmbra = mix(${OMBRA_SOLE.minimo.toFixed(2)}, 1.0, smoothstep(-0.7, 0.5, versoSole));
          reflectedLight.indirectDiffuse *= kOmbra;
          totalEmissiveRadiance *= kOmbra;
        }
      #endif`);
  };
  m.customProgramCacheKey = () => 'muro-ombra-sole';
  return m;
}

/** Unisce geometrie (posizione e normale) in una sola, non indicizzata, con uv e colori di rifinisci(). */
export function unisci(parti) {
  if (!parti.length) return null;
  const n = parti.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count), 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), ombra = new Float32Array(n), asse = new Float32Array(n * 2);
  const G = GRADAZIONE;
  let o = 0;
  for (const g0 of parti) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, c = p.count;
    pos.set(p.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    // Ombra di ogni pezzo: piede più scuro (dal suo punto più basso), per i volumi alti almeno 2 m; più quella
    // propria del pezzo (attributo `ombra`: la galleria delle porte).
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < c; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const alto = Math.min(G.alto, (y1 - y0) * 0.5), propria = g.attributes.ombra, A = g0.userData.asse;
    if (A) for (let i = 0; i < c; i++) { asse[2 * (o + i)] = A[0]; asse[2 * (o + i) + 1] = A[1]; }
    for (let i = 0; i < c; i++) {
      let k = 1;
      if (y1 - y0 >= 2) { const t = Math.min(1, (p.getY(i) - y0) / alto); k = G.piede + (1 - G.piede) * t * t * (3 - 2 * t); }
      ombra[o + i] = k * (propria ? propria.getX(i) : 1);
    }
    o += c;
    g.dispose();
    if (g !== g0) g0.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  rifinisci(geo, true, ombra, asse);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** true se (u, v) sta dentro il poligono [[u, v]...]. */
export function dentroPoligono(P, u, v) {
  let d = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ui, vi] = P[i], [uj, vj] = P[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) d = !d;
  }
  return d;
}

/** Distanza di (u, v) dal contorno del poligono. */
export function distanzaContorno(P, u, v) {
  let d2 = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ui, vi] = P[i], [uj, vj] = P[j], eu = uj - ui, ev = vj - vi, l2 = eu * eu + ev * ev;
    const t = l2 > 0 ? clamp(((u - ui) * eu + (v - vi) * ev) / l2, 0, 1) : 0;
    const fu = u - ui - eu * t, fv = v - vi - ev * t;
    d2 = Math.min(d2, fu * fu + fv * fv);
  }
  return Math.sqrt(d2);
}

/** Area con segno (> 0: vertici in senso antiorario nel piano u, v). */
export function areaPoligono(P) {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1];
  return a / 2;
}

/** Normale esterna unitaria del lato a→b di un poligono con area di segno `verso`. */
export function normaleLato(a, b, verso) {
  const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1;
  return verso > 0 ? [dv / l, -du / l] : [-dv / l, du / l];
}

/** Da coordinate del mondo a locali (u, v) del luogo. */
export function localeDelLuogo(luogo, P) {
  const ux = luogo.verso.x, uz = luogo.verso.z;
  return P.map(([x, z]) => { const dx = x - luogo.x, dz = z - luogo.z; return [dx * ux + dz * uz, -dx * uz + dz * ux]; });
}

/**
 * Collisioni in coordinate locali: scatole orientate { cu, cv, au, av (asse unitario), hl, hw } e cerchi { u, v, r }.
 * Spinge un cerchio fuori da tutte, lungo la normale: il cavaliere scivola lungo i muri.
 */
export function creaSpinta(scatole, cerchi) {
  return function spingi(u, v, raggio) {
    for (let iter = 0; iter < 5; iter++) {
      let mosso = false;
      for (const s of scatole) {
        const du = u - s.cu, dv = v - s.cv;
        const a = du * s.au + dv * s.av, b = -du * s.av + dv * s.au;
        if (a > s.hl + raggio || a < -s.hl - raggio || b > s.hw + raggio || b < -s.hw - raggio) continue;
        const qa = clamp(a, -s.hl, s.hl), qb = clamp(b, -s.hw, s.hw);
        let ea = a - qa, eb = b - qb;
        const d2 = ea * ea + eb * eb;
        if (d2 >= raggio * raggio) continue;
        let na, nb;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          na = qa + ea / d * raggio; nb = qb + eb / d * raggio;
        } else {
          const vie = [a + s.hl, s.hl - a, b + s.hw, s.hw - b];
          const m = vie.indexOf(Math.min(...vie));
          na = a; nb = b;
          if (m === 0) na = -s.hl - raggio; else if (m === 1) na = s.hl + raggio;
          else if (m === 2) nb = -s.hw - raggio; else nb = s.hw + raggio;
        }
        u = s.cu + na * s.au - nb * s.av; v = s.cv + na * s.av + nb * s.au;
        mosso = true;
      }
      for (const c of cerchi) {
        const eu = u - c.u, ev = v - c.v, d = Math.hypot(eu, ev), min = c.r + raggio;
        if (d >= min) continue;
        if (d > 1e-6) { u = c.u + eu / d * min; v = c.v + ev / d * min; } else u = c.u + min;
        mosso = true;
      }
      if (!mosso) break;
    }
    return [u, v];
  };
}

/** Scatola orientata dal segmento a→b (locale), larghezza tra `d0` e `d1` lungo la normale n. */
export function scatolaLato(a, b, n, d0, d1) {
  const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1;
  const m = (d0 + d1) / 2;
  return { cu: (a[0] + b[0]) / 2 + n[0] * m, cv: (a[1] + b[1]) / 2 + n[1] * m, au: du / l, av: dv / l,
    hl: l / 2, hw: Math.abs(d1 - d0) / 2 };
}

/**
 * Torre-porta ad arco (extrusa): centro della faccia sul filo del muro `m`, asse lungo il muro `e`, normale esterna
 * `n`; sporge di `sporgenza` fuori e rientra di `profondita − sporgenza` dentro. Quote: base, cima, fondo del foro
 * (`soglia`), imposta dell'arco. `X, Z` portano da locale a blocco. Ritorna la geometria nel blocco.
 */
export function geoTorrePorta({ m, e, n, gw, pw, sporgenza, profondita, base, cima, soglia, imposta }, X, Z) {
  const s = new THREE.Shape();
  s.moveTo(-gw / 2, base); s.lineTo(gw / 2, base); s.lineTo(gw / 2, cima); s.lineTo(-gw / 2, cima); s.closePath();
  const foro = new THREE.Path();
  foro.moveTo(-pw / 2, soglia); foro.lineTo(pw / 2, soglia); foro.lineTo(pw / 2, imposta);
  foro.absarc(0, imposta, pw / 2, 0, Math.PI, false);
  foro.lineTo(-pw / 2, soglia);
  s.holes.push(foro);
  // 4 tratti in profondità: la galleria ha vertici anche in mezzo, dove è più buia.
  const geo = new THREE.ExtrudeGeometry(s, { depth: profondita, steps: 4, bevelEnabled: false, curveSegments: 10 });
  // Forma: x lungo ±e (il segno tiene il sistema destrorso), y quota, profondità da fuori (sporgenza) verso dentro.
  const sg = e[0] * n[1] - e[1] * n[0] > 0 ? -1 : 1;
  const p = geo.attributes.position;
  geo.computeVertexNormals();
  const sxs = new Float32Array(p.count), ys = new Float32Array(p.count), zs = new Float32Array(p.count), nzs = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    sxs[i] = p.getX(i); ys[i] = p.getY(i); zs[i] = p.getZ(i); nzs[i] = geo.attributes.normal.getZ(i);
    const sx = p.getX(i) * sg, y = p.getY(i), d = sporgenza - p.getZ(i);
    const u = m[0] + e[0] * sx + n[0] * d, v = m[1] + e[1] * sx + n[1] * d;
    p.setXYZ(i, X(u, v), y, Z(u, v));
  }
  // Galleria: le facce del passaggio (sul contorno del foro, normale di traverso alla profondità) più scure, di
  // più a metà galleria; la luce entra dalle due bocche.
  const nrm = geo.attributes.normal, ombra = new Float32Array(p.count), [g0, g1] = GRADAZIONE.galleria;
  for (let i = 0; i < p.count; i++) {
    const sx = sxs[i], y = ys[i], z = zs[i];
    const sulForo = Math.abs(sx) <= pw / 2 + 1e-3 && y >= soglia - 1e-3 && y <= imposta + pw / 2 + 1e-3;
    if (!sulForo || Math.abs(nzs[i]) > 0.5) { ombra[i] = 1; continue; }
    const dentro = Math.min(z, profondita - z) / (profondita / 2);           // 0 alle bocche, 1 a metà
    ombra[i] = g1 + (g0 - g1) * Math.min(1, dentro * 1.6);
  }
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  geo.setAttribute('ombra', new THREE.BufferAttribute(ombra, 1));
  return geo;
}

/**
 * Ghiera dell'arco in pietra chiara, sulle due facce della torre-porta: sporge un poco e fa leggere l'arco anche
 * in ombra. Stessi parametri di geoTorrePorta.
 */
export function geoGhiera({ m, e, n, pw, sporgenza, profondita, imposta }, X, Z) {
  const r0 = pw / 2, r1 = pw / 2 + 0.5, sp = 0.32;
  const s = new THREE.Shape();
  s.moveTo(r1, 0); s.absarc(0, 0, r1, 0, Math.PI, false); s.lineTo(-r0, 0); s.absarc(0, 0, r0, Math.PI, 0, true); s.closePath();
  const sg = e[0] * n[1] - e[1] * n[0] > 0 ? -1 : 1, parti = [];
  for (const faccia of [-0.12, profondita - sp + 0.12]) {      // poco fuori dalla faccia esterna e da quella interna
    const g = new THREE.ExtrudeGeometry(s, { depth: sp, bevelEnabled: false, curveSegments: 10 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i) * sg, y = p.getY(i) + imposta, d = sporgenza - (p.getZ(i) + faccia);
      const u = m[0] + e[0] * sx + n[0] * d, v = m[1] + e[1] * sx + n[1] * d;
      p.setXYZ(i, X(u, v), y, Z(u, v));
    }
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.computeVertexNormals();
    parti.push(g);
  }
  return parti;
}

/** Merlo a coda di rondine: base all'origine, faccia verso +Z. */
function geoMerlo() {
  const w = 0.95, h = 1.4, coda = 0.5;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h + coda); s.lineTo(0, h); s.lineTo(-w / 2, h + coda);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: false });
  geo.translate(0, 0, -0.275);
  return geo;
}

let _alone = null;
export function texturaAlone() {
  if (_alone) return _alone;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,220,150,1)');
  grad.addColorStop(0.25, 'rgba(255,150,60,0.55)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _alone = new THREE.CanvasTexture(c);
  _alone.colorSpace = THREE.SRGBColorSpace;
  return _alone;
}

/** Torcia a muro (staffa, manico, fiamma, alone), rivolta verso −Z del gruppo. */
function costruisciTorcia(mat, matFiamma, matAlone) {
  const g = new THREE.Group();
  const staffa = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), mat.ferro);
  staffa.position.set(0, 0, -0.17);
  const manico = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6), mat.legno);
  manico.rotation.x = -0.35;
  manico.position.set(0, 0.2, -0.33);
  const fiamma = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 6), matFiamma);
  fiamma.position.set(0, 0.8, -0.5);
  const alone = new THREE.Sprite(matAlone);
  alone.scale.setScalar(TORCIA.alone);
  alone.position.set(0, 0.78, -0.5);
  g.add(staffa, manico, fiamma, alone);
  return { g, fiamma, alone };
}

/** Pseudo-caso stabile del luogo in [0, 1). */
/** Colore di muratura col tono di fondo del luogo (TONO_LUOGO): chiarezza e calore a caso, stabili per luogo. */
export function tonoDelLuogo(luogo, colore) {
  const T = TONO_LUOGO, c = new THREE.Color(colore);
  const q = casoLuogo(luogo, 31), scuro = q < T.scuri;
  const chiaro = scuro ? T.scuro[0] + (T.scuro[1] - T.scuro[0]) * q / T.scuri
    : T.chiaro[0] + (T.chiaro[1] - T.chiaro[0]) * (q - T.scuri) / (1 - T.scuri);
  const caldo = (T.caldo[0] + (T.caldo[1] - T.caldo[0]) * casoLuogo(luogo, 37)) * (scuro ? 0.4 : 1) - (scuro ? 0.03 : 0);
  c.r = Math.min(1, c.r * chiaro * (1 + caldo)); c.g = Math.min(1, c.g * chiaro); c.b = Math.min(1, c.b * chiaro * (1 - caldo * 1.3));
  return c;
}

function casoLuogo(luogo, k) {
  // Hash intero (uniforme; il vecchio sin(...)·43758 non lo era: 13 «scure» su 34 con soglia al 20 %).
  let h = Math.imul(Math.floor(luogo.x) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(luogo.z) + k * 7919, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ─── Rocca ───────────────────────────────────────────────────────────────

/** Versione sincrona: costruisce la rocca in un colpo (stesso risultato di createRoccaAPezzi). */
export function createRocca(suolo, luogo, ox, oz) {
  return completaPezzi(createRoccaAPezzi(suolo, luogo, ox, oz));
}

/**
 * Costruisce la rocca di un luogo generato.
 * @param {{getHeight:(x:number, z:number) => number}} suolo  quota del terreno in coordinate del blocco
 * @param {object} luogo  da carta.luoghi (piani con `poligono`, portaRocca, verso, classe)
 * @param {number} ox  centro del sito nel blocco
 * @param {number} oz
 */
export function* createRoccaAPezzi(suolo, luogo, ox, oz) {
  const K = MISURE_ROCCA[luogo.classe] ?? MISURE_ROCCA.casata;
  const ux = luogo.verso.x, uz = luogo.verso.z;
  const R0 = luogo.piani[0], B = luogo.piani[1];
  const SP = K.spessore, H = K.altezza, RT = K.torre;
  const tonde = casoLuogo(luogo, 1) < 0.55;                // torri tonde o quadrate, per castello
  const X = (u, v) => ox + ux * u - uz * v, Z = (u, v) => oz + uz * u + ux * v;
  const xz = (u, v) => [X(u, v), Z(u, v)];
  const terreno = (u, v) => suolo.getHeight(X(u, v), Z(u, v));
  const inLocale = (x, z) => { const dx = x - ox, dz = z - oz; return [dx * ux + dz * uz, -dx * uz + dz * ux]; };
  const P = localeDelLuogo(luogo, R0.poligono);
  const PB = B ? localeDelLuogo(luogo, B.poligono) : null;
  const verso = areaPoligono(P);
  const N = P.length;

  /** Quote minima e massima del terreno lungo un segmento (ogni ~1,5 m), anche spostato di `fuori` lungo n. */
  function quoteLungo(a, b, n, fuori) {
    const k = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
    let min = Infinity, max = -Infinity;
    for (let i = 0; i <= k; i++) {
      const u = a[0] + (b[0] - a[0]) * i / k, v = a[1] + (b[1] - a[1]) * i / k;
      for (const f of fuori) {
        const h = terreno(u + n[0] * f, v + n[1] * f);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    return { min, max };
  }

  // Quota del cortile: il piano del terrapieno; il terreno dentro resta sotto (scende solo verso il borgo).
  let piano = R0.q;
  for (let i = 0; i < N; i++) {
    const [u, v] = P[i];
    piano = Math.max(piano, terreno(u * 0.7, v * 0.7), terreno(u * 0.35, v * 0.35));
  }
  piano += 0.15;

  const mat = {};
  for (const [k, c] of Object.entries(COL)) {
    mat[k] = MURATURA.has(k) ? materialeMuro(tonoDelLuogo(luogo, c), LUCE_RIFLESSA) : new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    if (!MURATURA.has(k)) mat[k].emissive.set(c).multiplyScalar(LUCE_RIFLESSA);
  }
  mat.terra.flatShading = false;
  mat.terra.polygonOffset = true;
  mat.terra.polygonOffsetFactor = -1;
  mat.terra.polygonOffsetUnits = -1;
  const parti = { mattone: [], scuro: [], pietra: [], legno: [], terra: [] };
  const scatole = [], cerchi = [];
  const merli = [], beccatelli = [];                     // { u, v, y, nu, nv }
  const quad = (pp) => pp.map(([u, v]) => xz(u, v));

  yield;
  // ─── Porta: sul lato più vicino al punto scelto dal generatore ───
  const pr = luogo.portaRocca;
  const [pu, pv] = pr ? localeDelLuogo(luogo, [[pr.x, pr.z]])[0] : [P[0][0], P[0][1]];
  let latoPorta = 0, dPorta = Infinity;
  for (let i = 0; i < N; i++) {
    const a = P[i], b = P[(i + 1) % N], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(m[0] - pu, m[1] - pv);
    if (d < dPorta) { dPorta = d; latoPorta = i; }
  }
  const gA = P[latoPorta], gB = P[(latoPorta + 1) % N];
  const gL = Math.hypot(gB[0] - gA[0], gB[1] - gA[1]);
  const ge = [(gB[0] - gA[0]) / gL, (gB[1] - gA[1]) / gL], gn = normaleLato(gA, gB, verso);
  const gm = [(gA[0] + gB[0]) / 2, (gA[1] + gB[1]) / 2];
  const GW = PORTA.torreLarghezza, PW = PORTA.larghezza, SPOR = PORTA.sporgenza;

  yield;
  // ─── Mura: un prisma per lato (o due ai lati della torre-porta), scarpa all'esterno ───
  const cima = piano + H;
  for (let i = 0; i < N; i++) {
    const a0 = P[i], b0 = P[(i + 1) % N], n = normaleLato(a0, b0, verso);
    const tratti = i === latoPorta
      ? [[a0, [gm[0] - ge[0] * GW / 2, gm[1] - ge[1] * GW / 2]], [[gm[0] + ge[0] * GW / 2, gm[1] + ge[1] * GW / 2], b0]]
      : [[a0, b0]];
    for (const [a, b] of tratti) {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 0.5) continue;
      const q = quoteLungo(a, b, n, [0.5, 2.5]);
      const base = Math.min(q.min, piano) - 1;
      const yS = clamp(q.max + 2.5, base + 1, cima - 2);
      const off = (yS - base) * SCARPA;
      const i0 = [a[0] - n[0] * SP, a[1] - n[1] * SP], i1 = [b[0] - n[0] * SP, b[1] - n[1] * SP];
      const muro = [i0, i1, b, a];
      parti.mattone.push(prisma(quad(muro), quad(muro), base, cima));
      const fuori = [i0, i1, [b[0] + n[0] * off, b[1] + n[1] * off], [a[0] + n[0] * off, a[1] + n[1] * off]];
      parti.scuro.push(prisma(quad(fuori), quad(muro), base, yS));
      // Collisione a pezzi di ~3 m: la scarpa sporge di più dove il terreno è più basso.
      const k = Math.max(1, Math.round(l / 3));
      for (let j = 0; j < k; j++) {
        const pa = [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k];
        const pb = [a[0] + (b[0] - a[0]) * (j + 1) / k, a[1] + (b[1] - a[1]) * (j + 1) / k];
        const qq = quoteLungo(pa, pb, n, [0.5, 1.5]);
        scatole.push(scatolaLato(pa, pb, n, -SP, Math.max(0.2, (yS - qq.min) * SCARPA)));
      }
      // Merli sul filo esterno, lontano dalle torri.
      const libero = RT + 1;
      for (let s = 1; s < l; s += 2) {
        const u = a[0] + (b[0] - a[0]) * s / l, v = a[1] + (b[1] - a[1]) * s / l;
        if (Math.hypot(u - a0[0], v - a0[1]) < libero || Math.hypot(u - b0[0], v - b0[1]) < libero) continue;
        merli.push({ u: u - n[0] * 0.3, v: v - n[1] * 0.3, y: cima, nu: n[0], nv: n[1] });
      }
    }
  }

  yield;
  // ─── Torri sui vertici ───
  for (let i = 0; i < N; i++) {
    const [cu, cv] = P[i];
    const prev = P[(i + N - 1) % N], next = P[(i + 1) % N];
    const n1 = normaleLato(prev, P[i], verso), n2 = normaleLato(P[i], next, verso);
    let bu = n1[0] + n2[0], bv = n1[1] + n2[1];
    const bl = Math.hypot(bu, bv) || 1;
    bu /= bl; bv /= bl;                                   // bisettrice verso l'esterno
    let qMin = Infinity, qMax = -Infinity;
    for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const h = terreno(cu + du * (RT + 1.5), cv + dv * (RT + 1.5));
      qMin = Math.min(qMin, h); qMax = Math.max(qMax, h);
    }
    const base = Math.min(qMin, piano) - 1;
    const top = cima + SOPRA_TORRI, yS = clamp(qMax + 2.5, base + 1, top - 4);
    const allarga = (yS - base) * SCARPA, par = 1.3;
    if (tonde) {
      const y0 = (base + yS) / 2, y1 = (yS + top - par) / 2;
      const c1 = new THREE.CylinderGeometry(RT, RT + allarga, yS - base, 14); c1.translate(X(cu, cv), y0, Z(cu, cv));
      const c2 = new THREE.CylinderGeometry(RT, RT, top - par - yS, 14); c2.translate(X(cu, cv), y1, Z(cu, cv));
      const c3 = new THREE.CylinderGeometry(RT + 0.4, RT + 0.4, par, 14); c3.translate(X(cu, cv), top - par / 2, Z(cu, cv));
      const c4 = new THREE.CylinderGeometry(RT + 0.14, RT + 0.14, 0.3, 14); c4.translate(X(cu, cv), yS, Z(cu, cv));
      parti.scuro.push(c1); parti.mattone.push(c2, c3); parti.pietra.push(c4);
      const nm = Math.round(2 * Math.PI * (RT + 0.15) / 1.9);
      for (let k = 0; k < nm; k++) {
        const ang = k / nm * Math.PI * 2, nu = Math.cos(ang), nv = Math.sin(ang);
        merli.push({ u: cu + nu * (RT + 0.15), v: cv + nv * (RT + 0.15), y: top, nu, nv });
        beccatelli.push({ u: cu + nu * (RT + 0.2), v: cv + nv * (RT + 0.2), y: top - par - 0.3, nu, nv });
      }
      cerchi.push({ u: cu, v: cv, r: RT + Math.max(0, yS - qMin) * SCARPA });
    } else {
      // Quadrata, girata lungo la bisettrice (uno spigolo verso l'esterno).
      const au = bu, av = bv, q4 = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => [cu + au * a - av * b, cv + av * a + au * b]);
      parti.scuro.push(prisma(quad(q4(RT + allarga)), quad(q4(RT)), base, yS));
      parti.mattone.push(prisma(quad(q4(RT)), quad(q4(RT)), yS, top - par));
      parti.mattone.push(prisma(quad(q4(RT + 0.35)), quad(q4(RT + 0.35)), top - par, top));
      parti.pietra.push(prisma(quad(q4(RT + 0.12)), quad(q4(RT + 0.12)), yS - 0.15, yS + 0.15));
      for (const [nu0, nv0] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nu = au * nu0 - av * nv0, nv = av * nu0 + au * nv0;
        for (const o of [-RT + 0.7, 0, RT - 0.7]) {
          const tu = -nv, tv = nu;
          merli.push({ u: cu + nu * (RT + 0.05) + tu * o, v: cv + nv * (RT + 0.05) + tv * o, y: top, nu, nv });
          beccatelli.push({ u: cu + nu * (RT + 0.1) + tu * o, v: cv + nv * (RT + 0.1) + tv * o, y: top - par - 0.3, nu, nv });
        }
      }
      const h = RT + Math.max(0, yS - qMin) * SCARPA;
      scatole.push({ cu, cv, au, av, hl: h, hw: h });
    }
  }

  yield;
  // ─── Terrazzi: cinta bassa sui lati che non toccano la rocca, torricelle sugli spigoli esterni ───
  let terrazzi = 0;
  for (const T of luogo.piani.slice(2)) {
    if (T.tipo !== 'terrazzo' || !T.poligono) continue;
    terrazzi++;
    const PT = localeDelLuogo(luogo, T.poligono), vt = areaPoligono(PT), nT = PT.length, k0 = (T.nRocca ?? 2) - 1;
    const topT = T.q + TERRAZZO.altezza, SPT = TERRAZZO.spessore;
    for (let i = k0; i < nT; i++) {
      const A0 = PT[i], B0 = PT[(i + 1) % nT], n = normaleLato(A0, B0, vt);
      const len = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), k = Math.max(1, Math.round(len / TERRAZZO.tratto));
      for (let j = 0; j < k; j++) {
        const a = [A0[0] + (B0[0] - A0[0]) * j / k, A0[1] + (B0[1] - A0[1]) * j / k];
        const b = [A0[0] + (B0[0] - A0[0]) * (j + 1) / k, A0[1] + (B0[1] - A0[1]) * (j + 1) / k];
        const q = quoteLungo(a, b, n, [0.5, 2]);
        const base = Math.min(q.min, T.q) - 1, yS = clamp(q.max + 1.5, base + 0.5, topT - 1);
        const off = (yS - base) * SCARPA;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, eu = (b[0] - a[0]) / l * 0.05, ev = (b[1] - a[1]) / l * 0.05;
        const muro = [[a[0] - n[0] * SPT - eu, a[1] - n[1] * SPT - ev], [b[0] - n[0] * SPT + eu, b[1] - n[1] * SPT + ev], [b[0] + eu, b[1] + ev], [a[0] - eu, a[1] - ev]];
        parti.mattone.push(prisma(quad(muro), quad(muro), base, topT));
        const fuori = [muro[0], muro[1], [muro[2][0] + n[0] * off, muro[2][1] + n[1] * off], [muro[3][0] + n[0] * off, muro[3][1] + n[1] * off]];
        parti.scuro.push(prisma(quad(fuori), quad(muro), base, yS));
        scatole.push(scatolaLato(a, b, n, -SPT, Math.max(0.2, (yS - q.min) * SCARPA)));
        const m = Math.max(1, Math.floor(l / 2));
        for (let t = 0; t < m; t++) {
          const f = (t + 0.5) / m, u = a[0] + (b[0] - a[0]) * f, v = a[1] + (b[1] - a[1]) * f;
          if (i === k0 && Math.hypot(u - A0[0], v - A0[1]) < RT + 1) continue;          // dentro la torre della rocca
          if (i === nT - 1 && Math.hypot(u - B0[0], v - B0[1]) < RT + 1) continue;
          merli.push({ u: u - n[0] * 0.3, v: v - n[1] * 0.3, y: topT, nu: n[0], nv: n[1] });
        }
      }
    }
    // Torricelle sugli spigoli esterni (i vertici che non sono della rocca).
    for (let i = k0 + 1; i < nT; i++) {
      const [cu, cv] = PT[i], rt = TERRAZZO.torre;
      let qMin = Infinity;
      for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) qMin = Math.min(qMin, terreno(cu + du * (rt + 1), cv + dv * (rt + 1)));
      const base = Math.min(qMin, T.q) - 1, top = topT + TERRAZZO.sopraTorre;
      if (tonde) {
        const c = new THREE.CylinderGeometry(rt, rt + (T.q + 1.5 - base) * SCARPA, top - base, 12);
        c.translate(X(cu, cv), (base + top) / 2, Z(cu, cv));
        parti.mattone.push(c);
        const nm = Math.round(2 * Math.PI * rt / 1.9);
        for (let k = 0; k < nm; k++) {
          const ang = k / nm * Math.PI * 2, nu = Math.cos(ang), nv = Math.sin(ang);
          merli.push({ u: cu + nu * (rt - 0.2), v: cv + nv * (rt - 0.2), y: top, nu, nv });
        }
        cerchi.push({ u: cu, v: cv, r: rt + 0.3 });
      } else {
        const q4t = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => [cu + a, cv + b]);
        parti.mattone.push(prisma(quad(q4t(rt)), quad(q4t(rt)), base, top));
        for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (const o of [-rt + 0.6, rt - 0.6]) merli.push({ u: cu + nu * (rt - 0.2) - nv * o, v: cv + nv * (rt - 0.2) + nu * o, y: top, nu, nv });
        }
        scatole.push({ cu, cv, au: 1, av: 0, hl: rt + 0.2, hw: rt + 0.2 });
      }
    }
  }

  yield;
  // ─── Muro interno tra corte d'armi (davanti) e corte del signore (dietro), mastio a cavallo del muro ───
  let mastioL = null, corti = null;
  {
    let uMin = Infinity, uMax = -Infinity;
    for (const [u] of P) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); }
    const uC = uMin + CORTI.dietro * (uMax - uMin);
    const vs = [];
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[(i + 1) % N];
      if ((a[0] - uC) * (b[0] - uC) < 0) vs.push(a[1] + (uC - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
    }
    const k = K.mastio.lato, h = k / 2, serve = h + SP + 1;
    if (vs.length >= 2) {
      vs.sort((a, b) => a - b);
      const v0 = vs[0] + SP * 0.5, v1 = vs[vs.length - 1] - SP * 0.5, L = v1 - v0;
      // Porta del muro interno in linea con la porta della rocca (il passaggio tra le due corti resta dritto e lascia
      // spazio ai lati per gli edifici); mastio a metà del tratto più lungo dei due che restano.
      // Dalla linea della porta della rocca verso il centro del muro, finché davanti e dietro la porta interna c'è spazio
      // (dove la cinta corre di sbieco, accanto al capo del muro l'altra corte può essere già fuori).
      const libera = (v) => [-5, 5].every((du) => dentroPoligono(P, uC + du, v) && distanzaContorno(P, uC + du, v) >= SP + 2.5);
      let vg = clamp(gm[1], v0 + CORTI.porta / 2 + 2, v1 - CORTI.porta / 2 - 2);
      const verso0 = (v0 + v1) / 2 > vg ? 1 : -1;
      for (let k = 0; k < 40 && !libera(vg); k++) vg += verso0;
      const lungoSotto = vg - v0 > v1 - vg;
      const [ta, tb] = lungoSotto ? [v0, vg - CORTI.porta / 2 - 1] : [vg + CORTI.porta / 2 + 1, v1];
      let vm = null;
      for (let k = 0; k <= 10 && vm === null; k++) {        // dal centro del tratto verso i capi
        for (const sg of [1, -1]) {
          const v = (ta + tb) / 2 + sg * k * (tb - ta) / 22;
          if (v - h < ta || v + h > tb || vm !== null) continue;
          if (dentroPoligono(P, uC, v) && distanzaContorno(P, uC, v) >= serve * Math.SQRT1_2 + 1) vm = v;
        }
      }
      if (vm !== null) corti = { uC, v0, v1, vm, vg };
    }
    // Mastio: sul muro interno, o (cinta troppo stretta) verso il retro come prima.
    let cm;
    if (corti) cm = [corti.uC, corti.vm];
    else {
      let iRetro = 0;
      for (let i = 1; i < N; i++) if (P[i][0] < P[iRetro][0]) iRetro = i;
      cm = [0, 0];
      for (let t = 0.7; t >= 0; t -= 0.05) {
        const c = [P[iRetro][0] * t, P[iRetro][1] * t];
        if (dentroPoligono(P, c[0], c[1]) && distanzaContorno(P, c[0], c[1]) >= h * Math.SQRT2 + SP + 1) { cm = c; break; }
      }
    }
    const q4 = (e) => [[-h - e, -h - e], [h + e, -h - e], [h + e, h + e], [-h - e, h + e]].map(([a, b]) => [cm[0] + a, cm[1] + b]);
    mastioL = { c: cm, s: [1, 0], f: [0, 1], a: h + 1.5, b: h + 1.5 };
    const base = piano - 1, yS = piano + 1.5, top = piano + K.mastio.altezza, par = 1.4, off = (yS - base) * SCARPA;
    parti.scuro.push(prisma(quad(q4(off)), quad(q4(0)), base, yS));
    parti.mattone.push(prisma(quad(q4(0)), quad(q4(0)), yS, top - par));
    parti.mattone.push(prisma(quad(q4(0.4)), quad(q4(0.4)), top - par, top));
    parti.pietra.push(prisma(quad(q4(0.14)), quad(q4(0.14)), yS - 0.15, yS + 0.15));
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cnt = Math.round(k / 1.9);
      for (let i = 0; i < cnt; i++) {
        const o = -h + k * (i + 0.5) / cnt, tu = -nv, tv = nu;
        merli.push({ u: cm[0] + nu * (h + 0.1) + tu * o, v: cm[1] + nv * (h + 0.1) + tv * o, y: top, nu, nv });
        beccatelli.push({ u: cm[0] + nu * (h + 0.15) + tu * o, v: cm[1] + nv * (h + 0.15) + tv * o, y: top - par - 0.3, nu, nv });
      }
    }
    scatole.push({ cu: cm[0], cv: cm[1], au: 1, av: 0, hl: h + off * 0.6, hw: h + off * 0.6 });

    if (corti) {
      // Tratti del muro: dal capo al mastio, dal mastio alla porta, dalla porta all'altro capo.
      const { uC, v0, v1, vm, vg } = corti, t = CORTI.spessore / 2, yT = piano + CORTI.altezza, pw = CORTI.porta / 2;
      const buchi = [[vm - h, vm + h], [vg - pw, vg + pw]].sort((a, b) => a[0] - b[0]);
      const tratti = [[v0, buchi[0][0]], [buchi[0][1], buchi[1][0]], [buchi[1][1], v1]].filter(([a, b]) => b - a > 0.5);
      const rett4 = (a, b, e = 0) => [[uC - t - e, a], [uC + t + e, a], [uC + t + e, b], [uC - t - e, b]];
      for (const [a, b] of tratti) {
        parti.mattone.push(prisma(quad(rett4(a, b)), quad(rett4(a, b)), piano - 1, yT));
        parti.pietra.push(prisma(quad(rett4(a, b, 0.12)), quad(rett4(a, b, 0.12)), yT - 0.35, yT - 0.1));   // cornice
        scatole.push({ cu: uC, cv: (a + b) / 2, au: 0, av: 1, hl: (b - a) / 2, hw: t + 0.05 });
        for (const nu of [1, -1]) {                       // merli verso le due corti
          const cnt = Math.max(1, Math.round((b - a) / 1.9));
          for (let i = 0; i < cnt; i++) merli.push({ u: uC + nu * (t - 0.15), v: a + (b - a) * (i + 0.5) / cnt, y: yT, nu, nv: 0 });
        }
      }
      // Porta ad arco: architrave sopra il varco, stipiti in pietra chiara.
      const arco = rett4(vg - pw, vg + pw);
      parti.mattone.push(prisma(quad(arco), quad(arco), piano + CORTI.imposta, yT));
      parti.pietra.push(prisma(quad(rett4(vg - pw, vg + pw, 0.1)), quad(rett4(vg - pw, vg + pw, 0.1)), piano + CORTI.imposta - 0.3, piano + CORTI.imposta));
      for (const sgn of [-1, 1]) {
        const st = rett4(vg + sgn * pw - 0.25, vg + sgn * pw + 0.25, 0.08);
        parti.pietra.push(prisma(quad(st), quad(st), piano - 0.2, piano + CORTI.imposta));
      }
    }
  }

  yield;
  // ─── Torre-porta ───
  const torce = [];
  let luceTorce = null;
  {
    const qT = quoteLungo([gm[0] - ge[0] * GW / 2, gm[1] - ge[1] * GW / 2], [gm[0] + ge[0] * GW / 2, gm[1] + ge[1] * GW / 2], gn, [SPOR + 1, 0]);
    const base = Math.min(qT.min, piano) - 1.5, imposta = piano + PORTA.imposta;
    const tp = { m: gm, e: ge, n: gn, gw: GW, pw: PW, sporgenza: SPOR, profondita: PORTA.profondita,
      base, cima: cima + PORTA.sopraMura, soglia: piano - 0.4, imposta };
    parti.mattone.push(geoTorrePorta(tp, X, Z));
    parti.pietra.push(...geoGhiera(tp, X, Z));
    const dentroT = SPOR - PORTA.profondita;             // faccia interna (negativa: dentro la cinta)
    // Battenti aperti contro la faccia interna; lastrico del passaggio.
    for (const s of [-1, 1]) {
      const a = [gm[0] + ge[0] * s * PW / 2 + gn[0] * dentroT, gm[1] + ge[1] * s * PW / 2 + gn[1] * dentroT];
      const b = [gm[0] + ge[0] * s * PW + gn[0] * dentroT, gm[1] + ge[1] * s * PW + gn[1] * dentroT];
      const fb = [[a[0], a[1]], [b[0], b[1]], [b[0] - gn[0] * 0.14, b[1] - gn[1] * 0.14], [a[0] - gn[0] * 0.14, a[1] - gn[1] * 0.14]];
      parti.legno.push(prisma(quad(fb), quad(fb), piano - 0.2, imposta + 0.6));
      // Spalle della porta (collisione): tra il passaggio e lo spigolo della torre.
      const c0 = (PW / 2 + GW / 2) / 2 * s;
      scatole.push({ cu: gm[0] + ge[0] * c0 + gn[0] * (SPOR + dentroT) / 2, cv: gm[1] + ge[1] * c0 + gn[1] * (SPOR + dentroT) / 2,
        au: ge[0], av: ge[1], hl: (GW / 2 - PW / 2) / 2, hw: (SPOR - dentroT) / 2 + 0.15 });
    }
    // Merli della torre-porta.
    const top = cima + PORTA.sopraMura;
    for (let k = 0; k < 4; k++) {
      const o = -GW / 2 + 0.6 + (GW - 1.2) * k / 3;
      merli.push({ u: gm[0] + ge[0] * o + gn[0] * (SPOR - 0.3), v: gm[1] + ge[1] * o + gn[1] * (SPOR - 0.3), y: top, nu: gn[0], nv: gn[1] });
      merli.push({ u: gm[0] + ge[0] * o + gn[0] * (dentroT + 0.3), v: gm[1] + ge[1] * o + gn[1] * (dentroT + 0.3), y: top, nu: -gn[0], nv: -gn[1] });
    }
    // Torce ai lati dell'arco, sulla faccia esterna, e una luce sola tra le due.
    const matFiamma = new THREE.MeshBasicMaterial({ color: '#ffcf70', fog: false });
    const matAlone = new THREE.SpriteMaterial({ map: texturaAlone(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
    const nx = ux * gn[0] - uz * gn[1], nz = uz * gn[0] + ux * gn[1];
    for (const s of [-1, 1]) {
      const t = costruisciTorcia(mat, matFiamma, matAlone);
      const o = s * (PW / 2 + TORCIA.scostamento);
      t.g.position.set(X(gm[0] + ge[0] * o + gn[0] * SPOR, gm[1] + ge[1] * o + gn[1] * SPOR), piano + TORCIA.altezza,
        Z(gm[0] + ge[0] * o + gn[0] * SPOR, gm[1] + ge[1] * o + gn[1] * SPOR));
      t.g.rotation.y = Math.atan2(-nx, -nz);
      torce.push(t);
    }
    luceTorce = new THREE.PointLight(TORCIA.luce.colore, 0, TORCIA.luce.distanza, TORCIA.luce.decadimento);
    luceTorce.position.set(X(gm[0] + gn[0] * (SPOR + 1.2), gm[1] + gn[1] * (SPOR + 1.2)), piano + TORCIA.altezza + 0.6,
      Z(gm[0] + gn[0] * (SPOR + 1.2), gm[1] + gn[1] * (SPOR + 1.2)));
  }

  yield;
  // ─── Pianerottolo e rampa: lungo il muro o dritta, la più corta che arriva a terra ───
  // Il borgo scende dalla rocca: una rampa dritta giù per il pendio insegue il terreno e si allunga; lungo il muro
  // (di traverso al pendio) arriva prima. Pianerottolo davanti alla porta: e ∈ [−PLm, PLm], n ∈ [SPOR, SPOR + DL].
  // La rampa parte dal suo fianco (lungo il muro, discosta quanto basta a passare fuori dalle torri dei vertici) o dal
  // suo fronte (dritta); deve restare dentro il borgo, fuori dalla rocca e lontana dalle torri.
  const W = RAMPA.larghezza, PLm = PW / 2 + 0.8, STACCO = RAMPA.stacco, DL = STACCO + W;
  const loc = (e, d) => [gm[0] + ge[0] * e + gn[0] * d, gm[1] + ge[1] * e + gn[1] * d];
  const opzioni = [];
  for (const s of [-1, 1]) opzioni.push({ start: loc(s * PLm, SPOR + STACCO + W / 2), dir: [ge[0] * s, ge[1] * s], lato: s });
  opzioni.push({ start: loc(0, SPOR + DL), dir: gn, lato: 0 });
  const libera = (u, v) => {
    if (dentroPoligono(P, u, v) || distanzaContorno(P, u, v) < W / 2 + 0.5) return false;
    for (const [tu, tv] of P) if (Math.hypot(u - tu, v - tv) < RT + 2 + W / 2) return false;
    return !PB || (dentroPoligono(PB, u, v) && distanzaContorno(PB, u, v) >= W / 2 + 0.5);
  };
  // All'arrivo serve spazio per scendere e girare: lontano dalla cinta del borgo.
  const arrivo = (u, v) => !PB || (dentroPoligono(PB, u, v) && distanzaContorno(PB, u, v) >= W / 2 + 4);
  let rampa = null;
  for (const o of opzioni) {
    let migliore = null;
    for (let l = RAMPA.minima; l <= RAMPA.massima + 1e-6; l += 0.5) {
      const fine = [o.start[0] + o.dir[0] * l, o.start[1] + o.dir[1] * l];
      if (!libera(...fine)) break;
      const oltre = [fine[0] + o.dir[0] * 8, fine[1] + o.dir[1] * 8];
      if (!arrivo(...oltre)) continue;
      const g = Math.abs(piano - terreno(...fine)) / l;
      if (!migliore || g < migliore.g - 0.005) migliore = { g, l };
      if (g <= RAMPA.pendenza) break;
    }
    if (!migliore) continue;
    // Prima quelle che arrivano entro la pendenza, poi la più corta; altrimenti la meno ripida.
    const costo = migliore.g <= RAMPA.pendenza + 1e-9 ? migliore.l : 1000 + migliore.g * 100;
    if (!rampa || costo < rampa.costo) rampa = { ...o, l: migliore.l, g: migliore.g, costo };
  }
  if (!rampa) rampa = { ...opzioni[2], l: RAMPA.minima, g: Math.abs(piano - terreno(...opzioni[2].start)) / RAMPA.minima, costo: 1e9 };
  const rFine = [rampa.start[0] + rampa.dir[0] * rampa.l, rampa.start[1] + rampa.dir[1] * rampa.l];
  const qFine = terreno(...rFine);
  const rpu = -rampa.dir[1], rpv = rampa.dir[0];          // di traverso alla rampa
  /** Parametri della rampa nel punto: t lungo (0–l), s di traverso; null fuori. */
  const sullaRampa = (u, v) => {
    const du = u - rampa.start[0], dv = v - rampa.start[1];
    const t = du * rampa.dir[0] + dv * rampa.dir[1], s = du * rpu + dv * rpv;
    return t >= -0.01 && t <= rampa.l && Math.abs(s) <= W / 2 ? t : null;
  };
  const quotaRampa = (t) => piano + (qFine - piano) * clamp(t / rampa.l, 0, 1);
  const sulPianerottolo = (u, v) => {
    const du = u - gm[0], dv = v - gm[1], e = du * ge[0] + dv * ge[1], d = du * gn[0] + dv * gn[1];
    return Math.abs(e) <= PLm + 0.01 && d >= SPOR - 0.01 && d <= SPOR + DL + 0.01;
  };
  {
    // Pianerottolo: blocco pieno fino sotto il terreno.
    const pl = [loc(-PLm, SPOR), loc(PLm, SPOR), loc(PLm, SPOR + DL), loc(-PLm, SPOR + DL)];
    let qm = Infinity;
    for (const [u, v] of pl) qm = Math.min(qm, terreno(u, v));
    parti.pietra.push(prisma(quad(pl), quad(pl), Math.min(qm, piano) - 0.6, piano));
    // Rampa: superficie in pendenza e fianchi fino sotto il terreno, a tratti di ~1,5 m.
    const n = Math.max(2, Math.ceil(rampa.l / 1.5));
    const pos = [];
    const P3 = (t, s, y) => { const u = rampa.start[0] + rampa.dir[0] * t + rpu * s, v = rampa.start[1] + rampa.dir[1] * t + rpv * s; return [X(u, v), y, Z(u, v)]; };
    const terra = (t, s) => terreno(rampa.start[0] + rampa.dir[0] * t + rpu * s, rampa.start[1] + rampa.dir[1] * t + rpv * s);
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let i = 0; i < n; i++) {
      const t0 = rampa.l * i / n, t1 = rampa.l * (i + 1) / n, y0 = quotaRampa(t0), y1 = quotaRampa(t1);
      const a = P3(t0, -W / 2, y0), b = P3(t0, W / 2, y0), c = P3(t1, W / 2, y1), d = P3(t1, -W / 2, y1);
      tri(a, b, c); tri(a, c, d);
      for (const s of [-W / 2, W / 2]) {
        const yb = Math.min(terra(t0, s), terra(t1, s)) - 0.5;
        const p0 = P3(t0, s, Math.max(y0, yb)), p1 = P3(t1, s, Math.max(y1, yb)), q0 = P3(t0, s, yb), q1 = P3(t1, s, yb);
        tri(p0, q0, q1); tri(p0, q1, p1);
        tri(p0, q1, q0); tri(p0, p1, q1);                 // doppia faccia: il verso dipende dal lato
        // Parapetto (non sul pianerottolo né all'arrivo).
        const sp = Math.sign(s) * (W / 2 + RAMPA.muretto / 2);
        const qa = [rampa.start[0] + rampa.dir[0] * t0 + rpu * sp, rampa.start[1] + rampa.dir[1] * t0 + rpv * sp];
        const qb = [rampa.start[0] + rampa.dir[0] * t1 + rpu * sp, rampa.start[1] + rampa.dir[1] * t1 + rpv * sp];
        const hw = RAMPA.muretto / 2, pp = [[qa[0] - rpu * hw, qa[1] - rpv * hw], [qb[0] - rpu * hw, qb[1] - rpv * hw], [qb[0] + rpu * hw, qb[1] + rpv * hw], [qa[0] + rpu * hw, qa[1] + rpv * hw]];
        parti.scuro.push(prisma(quad(pp), quad(pp), yb, [y0, y1, y1, y0].map((y) => y + RAMPA.parapetto)));   // in pendenza
        scatole.push({ cu: (qa[0] + qb[0]) / 2, cv: (qa[1] + qb[1]) / 2, au: rampa.dir[0], av: rampa.dir[1], hl: (t1 - t0) / 2 + 0.05, hw });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    parti.pietra.push(geo);
    // Parapetti del pianerottolo dove non arriva la rampa.
    // Il fianco da cui parte la rampa resta chiuso nel tratto tra la torre-porta e la rampa (STACCO).
    const lati = [[[-PLm, SPOR + DL], [PLm, SPOR + DL]], [[-PLm, SPOR], [-PLm, SPOR + DL]], [[PLm, SPOR], [PLm, SPOR + DL]]];
    if (rampa.lato) lati.push([[rampa.lato * PLm, SPOR], [rampa.lato * PLm, SPOR + STACCO]]);
    const aperto = rampa.lato === 0 ? 0 : rampa.lato < 0 ? 1 : 2;
    lati.forEach(([e0, e1], k) => {
      if (k === aperto) return;
      const a = loc(e0[0], e0[1]), b = loc(e1[0], e1[1]), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const au = (b[0] - a[0]) / l, av = (b[1] - a[1]) / l, hw = RAMPA.muretto / 2;
      const pp = [[a[0] - av * hw, a[1] + au * hw], [b[0] - av * hw, b[1] + au * hw], [b[0] + av * hw, b[1] - au * hw], [a[0] + av * hw, a[1] - au * hw]];
      parti.scuro.push(prisma(quad(pp), quad(pp), piano - 1, piano + RAMPA.parapetto));
      scatole.push({ cu: (a[0] + b[0]) / 2, cv: (a[1] + b[1]) / 2, au, av, hl: l / 2, hw });
    });
  }

  yield;
  // ─── Cortile: piano di terra battuta dentro la cinta, lastrico nel passaggio ───
  {
    const s = new THREE.Shape(P.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ShapeGeometry(s);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); p.setXYZ(i, X(u, v), piano, Z(u, v)); }
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    parti.terra.push(g);
    const dentroT = SPOR - PORTA.profondita;
    const lp = [loc(-PW / 2, dentroT - 1), loc(PW / 2, dentroT - 1), loc(PW / 2, SPOR), loc(-PW / 2, SPOR)];
    parti.pietra.push(prisma(quad(lp), quad(lp), piano - 0.3, piano + 0.01));
  }

  yield;
  // ─── Oggetti: uno per materiale, merli e beccatelli a istanze ───
  const object = new THREE.Group();
  object.name = 'rocca';
  const solidi = [];
  for (const [k, lista] of Object.entries(parti)) {
    const geo = unisci(lista);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat[k]);
    m.name = `rocca-${k}`;
    object.add(m);
    if (k === 'mattone' || k === 'scuro') solidi.push(m);
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
  const istanze = (geo, m, lista, nome) => {
    const im = new THREE.InstancedMesh(geo, m, lista.length);
    lista.forEach((e, i) => {
      const nx = ux * e.nu - uz * e.nv, nz = uz * e.nu + ux * e.nv;
      q4.setFromAxisAngle(yAx, Math.atan2(nx, nz));
      im.setMatrixAt(i, m4.compose(p3.set(X(e.u, e.v), e.y, Z(e.u, e.v)), q4, s1));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = nome;
    object.add(im);
  };
  yield;
  // ─── Edifici del cortile (passo 5): cappella e pozzo; sala d'armi e armeria nel castello di casata e nella sede
  // maggiore. Addossati alle mura (facciata verso il cortile), o liberi nel cortile se lungo le mura non c'è posto.
  const kit = creaKit({ X, Z, ux, uz, terreno, luogo, seme: (Math.floor(luogo.x) * 19349663) ^ (Math.floor(luogo.z) * 83492791), nome: 'rocca-edifici', contesto: 'rocca' });
  {
    const lotti = [mastioL];
    const passaggio = [gm[0] - gn[0] * (PORTA.profondita - SPOR + 4), gm[1] - gn[1] * (PORTA.profondita - SPOR + 4)];
    // Zona: 'armi' davanti al muro interno, 'signore' dietro (con le corti); null ovunque (cinta senza muro interno).
    let zona = null;
    // Corridoi liberi: dall'ingresso della rocca alla porta del muro interno, e da lì al centro della corte del signore.
    const corridoi = corti ? [[passaggio, [corti.uC + 2, corti.vg]], [[corti.uC - 2, corti.vg], [corti.uC - 8, corti.vg]]] : [];
    const nelCorridoio = (u, v) => corridoi.some(([a, b]) => {
      const du = b[0] - a[0], dv = b[1] - a[1], l2 = du * du + dv * dv || 1;
      const t = clamp(((u - a[0]) * du + (v - a[1]) * dv) / l2, 0, 1);
      return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t) < 2.5;
    });
    const nellaZona = (u, v) => {
      if (!corti || !zona) return true;
      if (Math.hypot(u - corti.uC, v - corti.vg) < 4 || nelCorridoio(u, v)) return false;   // varco e corridoi liberi
      return zona === 'armi' ? u > corti.uC + CORTI.spessore / 2 + 0.6 : u < corti.uC - CORTI.spessore / 2 - 0.6;
    };
    const libero = (L) => {
      // Campioni ogni ~2 m sul lotto (bordi compresi): un corridoio non passa tra un campione e l'altro.
      const ni = Math.max(2, Math.ceil(L.a)), nj = Math.max(2, Math.ceil(L.b));
      for (let ii = 0; ii <= ni; ii++) for (let jj = 0; jj <= nj; jj++) {
        const i = -1 + 2 * ii / ni, j = -1 + 2 * jj / nj;
        const u = L.c[0] + L.s[0] * L.a * i + L.f[0] * L.b * j, v = L.c[1] + L.s[1] * L.a * i + L.f[1] * L.b * j;
        if (!dentroPoligono(P, u, v) || distanzaContorno(P, u, v) < SP + 0.3 || !nellaZona(u, v)) return false;
        for (const [tu, tv] of P) if (Math.hypot(u - tu, v - tv) < RT + 1.2) return false;
        if (Math.hypot(u - passaggio[0], v - passaggio[1]) < 6) return false;
      }
      return !lotti.some((A) => siToccano(A, L, 0.8));
    };
    const tipi = luogo.classe === 'minore' ? ['cappella'] : ['salaArmi', 'cappella', 'armeria'];
    const edificiFatti = new Set();
    for (const tipo of tipi) for (const z of tipo === 'cappella' ? ['signore', 'armi'] : ['armi']) {
      const E = EDIFICI[tipo];
      zona = z;                                           // la cappella nella corte del signore, se c'è posto
      if (edificiFatti.has(tipo)) continue;
      let fatto = false;
      for (let i = 0; i < N && !fatto; i++) {                 // lungo le mura, dal lato più lungo
        const a = P[i], b = P[(i + 1) % N], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (i === latoPorta || l < E.largo + 2) continue;
        const n = normaleLato(a, b, verso), t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        for (let x = E.largo / 2 + 1; x <= l - E.largo / 2 - 1 && !fatto; x += 1.5) {
          const c = [a[0] + t[0] * x - n[0] * (SP + E.fondo / 2 + 0.3), a[1] + t[1] * x - n[1] * (SP + E.fondo / 2 + 0.3)];
          const L = { c, f: [-n[0], -n[1]], s: [n[1], -n[0]], a: E.largo / 2, b: E.fondo / 2 };
          if (!libero(L)) continue;
          lotti.push(L); kit.edificio(tipo, { u: c[0], v: c[1], fu: -n[0], fv: -n[1], quota: piano - 0.15 }); fatto = true; edificiFatti.add(tipo);
        }
      }
      if (corti && !fatto) {                               // addossato al muro interno, nella sua corte
        const lato = z === 'armi' ? 1 : -1, d = CORTI.spessore / 2 + E.fondo / 2 + 0.3;
        for (let v = corti.v0 + E.largo / 2 + 1; v <= corti.v1 - E.largo / 2 - 1 && !fatto; v += 1.5) {
          const c = [corti.uC + lato * d, v], f = [lato, 0];
          const L = { c, f, s: [-f[1], f[0]], a: E.largo / 2, b: E.fondo / 2 };
          if (!libero(L)) continue;
          lotti.push(L); kit.edificio(tipo, { u: c[0], v: c[1], fu: f[0], fv: f[1], quota: piano - 0.15 }); fatto = true; edificiFatti.add(tipo);
        }
      }
      for (let r0 = 2; r0 < 45 && !fatto; r0 += 1.5) {      // libero nel cortile, rivolto verso la porta
        for (let k = 0; k < 16 && !fatto; k++) {
          const ang = k / 16 * Math.PI * 2, c = [Math.cos(ang) * r0, Math.sin(ang) * r0];
          const dg = Math.hypot(gm[0] - c[0], gm[1] - c[1]) || 1, f = [(gm[0] - c[0]) / dg, (gm[1] - c[1]) / dg];
          const L = { c, f, s: [-f[1], f[0]], a: E.largo / 2, b: E.fondo / 2 };
          if (!libero(L)) continue;
          lotti.push(L); kit.edificio(tipo, { u: c[0], v: c[1], fu: f[0], fv: f[1], quota: piano - 0.15 }); fatto = true; edificiFatti.add(tipo);
        }
      }
    }
    // Pozzo: nella corte del signore, il punto libero più vicino al suo centro (o al centro del cortile).
    zona = 'signore';
    const centroPozzo = corti ? [(corti.uC + Math.min(...P.map((p) => p[0]))) / 2, (corti.v0 + corti.v1) / 2] : [0, 0];
    let migliore = null;
    for (let u = -45; u <= 45; u += 1.5) for (let v = -45; v <= 45; v += 1.5) {
      const L = { c: [u, v], s: [1, 0], f: [0, 1], a: 1.4, b: 1.4 };
      if (!libero(L)) continue;
      const d = Math.hypot(u - centroPozzo[0], v - centroPozzo[1]);
      if (!migliore || d < migliore.d) migliore = { d, u, v };
    }
    if (migliore) kit.pozzo(migliore.u, migliore.v, piano - 0.15);
  }
  yield;
  const edificiRocca = yield* kit.chiudiAPezzi();
  yield;
  scatole.push(...edificiRocca.scatole);

  istanze(rifinisci(geoMerlo(), false), mat.merlo, merli, 'rocca-merli');
  istanze(rifinisci(new THREE.BoxGeometry(0.35, 0.6, 0.5), false), mat.pietra, beccatelli, 'rocca-beccatelli');
  for (const t of torce) object.add(t.g);
  object.add(luceTorce);
  const triMura = object.children.reduce((s2, m) => s2 + (m.isMesh ? (m.isInstancedMesh ? m.count : 1)
    * (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 : 0), 0);
  const oggettiMura = object.children.filter((m) => m.isMesh).length;
  object.add(edificiRocca.object);
  solidi.push(...edificiRocca.solidi);
  object.updateMatrixWorld(true);

  yield;
  // ─── Collisioni, suolo, luci ───
  let raggio = 0;
  for (const p of luogo.piani) {
    if (p.tipo === 'borgo' || !p.poligono) continue;
    for (const [u, v] of localeDelLuogo(luogo, p.poligono)) raggio = Math.max(raggio, Math.hypot(u, v));
  }
  const INGOMBRO = raggio + RT + 8 + rampa.l + W;
  const spingi = creaSpinta(scatole, cerchi);
  function spingiFuori(x, z, r) {
    const [u, v] = inLocale(x, z);
    if (Math.abs(u) > INGOMBRO + r || Math.abs(v) > INGOMBRO + r) return null;
    const [u2, v2] = spingi(u, v, r);
    return { x: X(u2, v2), z: Z(u2, v2) };
  }
  /** Quota del suolo costruito: cortile, passaggio, pianerottolo, rampa. null altrove. */
  function quotaSuolo(x, z) {
    const [u, v] = inLocale(x, z);
    if (Math.abs(u) > INGOMBRO || Math.abs(v) > INGOMBRO) return null;
    if (dentroPoligono(P, u, v) || sulPianerottolo(u, v)) return piano;
    {
      const du = u - gm[0], dv = v - gm[1], e = du * ge[0] + dv * ge[1], d = du * gn[0] + dv * gn[1];
      if (Math.abs(e) <= GW / 2 && d >= SPOR - PORTA.profondita - 0.5 && d <= SPOR) return piano;
    }
    const t = sullaRampa(u, v);
    return t === null ? null : quotaRampa(t);
  }
  function dentro(x, z) {
    const [u, v] = inLocale(x, z);
    return dentroPoligono(P, u, v) && distanzaContorno(P, u, v) > SP;
  }
  function aggiornaLuci(t, buio, quota) {
    edificiRocca.aggiornaLuci(t, buio, quota);
    const accese = buio > 0.15;
    const f = clamp((buio - 0.15) / 0.5, 0, 1);
    const tremolio = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.04 * Math.sin(t * 7.3);
    luceTorce.intensity = accese ? TORCIA.luce.intensita * f * tremolio : 0;
    torce.forEach((tc, i) => {
      tc.fiamma.visible = tc.alone.visible = accese;
      if (!accese) return;
      const k = tremolio + 0.05 * Math.sin(t * 17 + i * 2.1);
      tc.fiamma.scale.set(1, k, 1);
      tc.alone.material.opacity = f;
      tc.alone.scale.setScalar(TORCIA.alone * (0.9 + 0.15 * k));
    });
  }
  // Piede della rampa (locale), un paio di metri oltre l'arrivo: da qui il borgo porta la sua via principale.
  const piede = [rFine[0] + rampa.dir[0] * 2, rFine[1] + rampa.dir[1] * 2];
  return {
    tipo: 'rocca', luogo, object, solidi, spingiFuori, quotaSuolo, dentro, aggiornaLuci, inLocale,
    inBlocco: (u, v) => [X(u, v), Z(u, v)],      // locale → blocco (abitanti3d.js)
    piano, poligono: P, piede, torre: RT, tonde, terrazzi,
    corti,                                        // muro interno { uC, v0, v1, vm, vg } (locali) o null (passo 10)
    rampa: { lato: rampa.lato, lunghezza: rampa.l, pendenza: rampa.g, inizio: rampa.start, fine: rFine, dir: rampa.dir },
    porta: { u: gm[0], v: gm[1], nu: gn[0], nv: gn[1], sporgenza: SPOR, profondita: PORTA.profondita },
    edifici: edificiRocca.edifici,                // nominati: { tipo, nome, porta } (passo 6)
    sorgenti: edificiRocca.sorgenti,
    misure: {
      oggetti: oggettiMura + edificiRocca.misure.chiamate, merli: merli.length, edifici: edificiRocca.edifici.length,
      triangoli: triMura + edificiRocca.misure.triangoli,
    },
  };
}
