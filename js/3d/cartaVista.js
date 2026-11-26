// Knight Dawn — vista di sviluppo della Carta (M6). Non è la Carta del cronista (fase G3): serve a
// guardare il mondo generato mentre si tara il generatore.
// Si apre con M (o con ?carta nell'indirizzo). Mostra la Carta del mondo della partita con la posizione
// del cavaliere; si possono generare anteprime di altri semi. Un clic su una cella di terra porta nella
// Scena centrata lì (anche in un mondo d'anteprima, che diventa quello della partita).
// Mentre è aperta il gioco è fermo e la scena 3D non si disegna.
//
// La pittura dei pixel (disegnaRilievo) non usa il DOM: si può chiamare anche fuori dal browser.
// Da zoom ×4 la parte visibile si ridisegna con le quote vere delle Scene (stessa funzione del terreno 3D,
// fino a pochi metri per campione): ombreggiatura e curve di livello, per scegliere una cima o una conca.

import { ACQUA, BIOMA, NOMI_BIOMI, profiloMassicci } from '../mondo/carta.js';
import { verificaFiumi, verificaPanorami, verificaVarieta, verificaLuoghi } from '../mondo/verifica.js';
import { verificaSiti, NOMI_SITI } from '../mondo/siti.js';
import { semeDaTesto, derivaSeme } from '../mondo/rumore.js';
import { quotaFinale, livelloLago, raffinaZona, percorsiFiumi, leggiGriglia } from '../mondo/scena.js';
import { raffinaStrade, percorsiStrade, STRADE } from '../mondo/strade.js';
import * as THREE from 'three';
import { coloreMondo } from './terrain.js';
import { boscoMondo } from '../mondo/vegetazione.js';

// Colori del rilievo: SOLO quota (metri), a un solo tono, più alto = più scuro. Niente verdi, ocra o
// bianchi: si leggerebbero come biomi (prati, deserti, neve), che arrivano al passo 7 come livello a sé.
// Una tappa per ogni limite di fascia: pianura 0–200, collina 200–700, pedemonte 700–1500, montagna.
const TERRA = [
  [0, [236, 228, 204]],
  [200, [212, 196, 162]],
  [700, [178, 156, 122]],
  [1500, [132, 112, 90]],
  [3500, [76, 62, 52]],
];
// Livelli (passo 7): temperatura media annua alla quota della cella, umidità, biomi.
const SCALA_T = [[-15, [80, 100, 185]], [-5, [150, 170, 220]], [0, [232, 236, 242]], [8, [168, 200, 120]],
  [15, [232, 200, 100]], [24, [196, 84, 48]]];
const SCALA_U = [[0, [205, 172, 110]], [0.5, [150, 182, 120]], [1, [46, 104, 150]]];
const COLORI_BIOMI = [];
COLORI_BIOMI[BIOMA.ACQUA] = [74, 120, 150]; COLORI_BIOMI[BIOMA.PIANURA] = [172, 192, 112];
COLORI_BIOMI[BIOMA.FORESTA] = [66, 106, 58]; COLORI_BIOMI[BIOMA.COLLINA] = [158, 150, 96];
COLORI_BIOMI[BIOMA.MONTAGNA] = [128, 114, 100]; COLORI_BIOMI[BIOMA.PALUDE] = [92, 112, 84];
COLORI_BIOMI[BIOMA.SABBIA] = [222, 196, 138]; COLORI_BIOMI[BIOMA.NEVE] = [240, 242, 246];
COLORI_BIOMI[BIOMA.GHIACCIO] = [200, 222, 236]; COLORI_BIOMI[BIOMA.FIUME] = [60, 110, 150];
COLORI_BIOMI[BIOMA.ROCCIA] = [142, 136, 130]; COLORI_BIOMI[BIOMA.PIANURA_N] = [166, 150, 116];
COLORI_BIOMI[BIOMA.PIANURA_S] = [206, 190, 128];
const COLORE_VALICO = [232, 180, 60];
const FASCE = [['pianura', 0, 200], ['collina', 200, 700], ['pedemonte', 700, 1500], ['montagna', 1500, Infinity]];
export const MARE_BASSO = [122, 158, 168], MARE_FONDO = [40, 70, 92];
export const LAGO = [104, 150, 178];
export const COLORE_FIUME = '#2f6690';
export const COLORE_STRADA = 'rgba(122, 74, 38, 0.95)';   // strade di terra battuta
export const COLORE_SENTIERO = 'rgba(150, 40, 30, 0.9)';
// [classe, spessore (come i fiumi), tratteggio]: dalla più importante.
export const STILE_STRADE = [['maestra', 1.6, []], ['carrareccia', 1.2, []], ['mulattiera', 1.0, [3, 2]], ['sentiero', 0.9, [1.5, 2]]];
// Nella Carta zoomata: larghezza minima in pixel per classe (si leggono sul rilievo) e bordino chiaro attorno.
export const STRADE_ZOOM = { minimo: { maestra: 3.2, carrareccia: 2.6, mulattiera: 2.1, sentiero: 1.7 }, bordo: 1.6,
  coloreBordo: 'rgba(238, 224, 190, 0.85)' };

/**
 * Colore «naturale» del terreno in un punto (x, z in m, quota h, pendenza in gradi), in RGB 0–255 sRGB: lo stesso del
 * terreno delle Scene (coloreMondo: biomi, bosco, campagna, roccia, ghiaioni, neve), per vedere sulla Carta boschi,
 * radure, campi e spianate rocciose [chiesto dall'utente, novembre 2026].
 */
export function coloreNaturale(carta) {
  const stagione = typeof Calendar !== 'undefined' ? Calendar.stagione : 0;
  const f = coloreMondo(carta, stagione);
  // Il bosco vero (anche quello di versante, che nelle Scene fanno gli alberi e non il colore del terreno): dalla
  // stessa funzione della vegetazione (boscoMondo, js/mondo/vegetazione.js), verso il verde scuro delle chiome.
  const bosco = boscoMondo(carta, stagione), b = { foresta: 0, visibile: 0 };
  const c = new THREE.Color(), t = { r: 0, g: 0, b: 0 };
  return (x, z, h, pendenza) => {
    f(c, x, z, h, pendenza);
    bosco(x, z, h, pendenza, b);
    if (b.visibile > 0) c.lerp(CHIOME, b.visibile * 0.85);
    c.getRGB(t, THREE.SRGBColorSpace);
    return [t.r * 255, t.g * 255, t.b * 255];
  };
}
const CHIOME = new THREE.Color('#2f4f22');     // verde scuro delle chiome viste dall'alto
const COSTA = [70, 52, 30];
const ESAGERAZIONE = 6;           // quanto il rilievo pesa nell'ombreggiatura
const COLORE_PANORAMA = 'rgba(150, 40, 30, 0.9)';
export const COLORE_CAVALIERE = '#e8402a';
const DISTANZE_CAVALIERE = [10, 20];   // km: cerchi attorno al cavaliere
// Tempo di marcia a piedi sulla Carta (docs/GDD.md §3 Viaggio): un Passo (3 h) ogni VIAGGIO.METRI_PER_PASSO.
const MINUTI_PER_KM = typeof VIAGGIO !== 'undefined' ? 180 * 1000 / VIAGGIO.METRI_PER_PASSO : 37;
const ORE_MARCIA_GIORNO = 9;           // ~3 Passi di marcia al giorno
// Rocche (M7): segno più grande secondo la classe; candidati scartati come puntini (pulsante «Candidati»).
export const CLASSI_ROCCA = { minore: ['rocca minore', 5], casata: ['castello di casata', 6.5], maggiore: ['sede maggiore', 8],
  citta: ['città', 9.5] };
const COLORE_ROCCA = '#8c1c13';
const COLORE_VALICHI = '#d9822b';
const COLORE_PONTE = 'rgba(52, 34, 20, 0.96)';
const COLORE_GUADO = 'rgba(32, 72, 124, 0.95)';
// Luoghi maggiori che non sono rocche (M8): stesso segno della rocca, altro colore e altra lettera.
// Misure dei segni in pixel CSS (× dpr): più grandi di prima per leggerli sopra il rilievo (richiesta dell'utente).
export const SEGNI = { valico: 6.5, ponte: 5.5, sito: [3.4, 4.4], panorama: 4.2, forcella: 4 };
export const TIPI_LUOGO = { rocca: [COLORE_ROCCA, 'R'], monastero: ['#4b2f7a', 'M'], citta: ['#1d4f86', 'C'] };
// Siti di villaggi e luoghi speciali (M8, js/mondo/siti.js): colore del segno.
export const COLORI_SITI = { villaggio: '#5a3416', ovile: '#6f8f3a', rovina: '#6b6359', abbandonato: '#3c3833', grotta: '#1d1a17',
  eremo: '#4b2f7a', fantastico: '#1f7a6a', accampamento: '#b0451c', sentinella: '#d9822b', ospizio: '#d9822b',
  mulino: '#2f6ea8' };
// Ordine del menu «Vai a» (M8): luoghi maggiori, poi i siti.
const VAI_A = ['rocca', 'monastero', 'citta', 'villaggio', 'mulino', 'rovina', 'abbandonato', 'grotta', 'eremo',
  'fantastico', 'accampamento', 'sentinella', 'ospizio', 'ovile'];

// Segni della Carta in pixel dello schermo. Un alone chiaro dietro al tratto li stacca dal rilievo (segnalato
// dall'utente: ponti e valichi si perdevano nel disegno di altimetria e terreno).
export function conAlone(ctx, dis, forza = 3) {
  ctx.save();
  ctx.shadowColor = 'rgba(250, 242, 222, 0.9)';
  ctx.shadowBlur = forza;
  dis();
  ctx.restore();
}

/** Valico: due archi contrapposti «)(»; con un quadratino se è presidiato. */
export function segnoValico(ctx, px, py, m, presidio) {
  ctx.strokeStyle = COLORE_VALICHI; ctx.lineWidth = m * 0.42;
  ctx.beginPath(); ctx.arc(px - m * 1.5, py, m * 1.2, -0.75, 0.75); ctx.stroke();
  ctx.beginPath(); ctx.arc(px + m * 1.5, py, m * 1.2, Math.PI - 0.75, Math.PI + 0.75); ctx.stroke();
  if (presidio) { ctx.fillStyle = COLORE_VALICHI; ctx.fillRect(px - m * 0.4, py - m * 0.4, m * 0.8, m * 0.8); }
}

/** Ponte: due archetti contrapposti lungo la strada (angolo `a`). */
export function segnoPonte(ctx, px, py, m, a = 0) {
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  ctx.strokeStyle = COLORE_PONTE; ctx.lineWidth = m * 0.42;
  ctx.beginPath(); ctx.arc(0, -m * 1.6, m, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, m * 1.6, m, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
  ctx.restore();
}

/** Guado: tre sassi in fila nell'acqua. */
export function segnoGuado(ctx, px, py, m) {
  ctx.fillStyle = COLORE_GUADO;
  for (const o of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(px + o * m * 0.95, py, m * 0.4, 0, 2 * Math.PI); ctx.fill(); }
}

/** Rocca, monastero o città: torre con due merli, colorata per tipo. */
export function segnoRocca(ctx, px, py, m, tipo = 'rocca') {
  ctx.fillStyle = TIPI_LUOGO[tipo]?.[0] ?? COLORE_ROCCA; ctx.strokeStyle = '#f4ead0'; ctx.lineWidth = m * 0.2;
  ctx.beginPath();
  ctx.moveTo(px - m, py + m); ctx.lineTo(px - m, py - m * 0.6); ctx.lineTo(px - m * 0.45, py - m * 0.6);
  ctx.lineTo(px - m * 0.45, py - m * 0.15); ctx.lineTo(px + m * 0.45, py - m * 0.15); ctx.lineTo(px + m * 0.45, py - m * 0.6);
  ctx.lineTo(px + m, py - m * 0.6); ctx.lineTo(px + m, py + m); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

/** Triangolo: gruppo montuoso (pieno scuro col bordo chiaro) o punto panoramico. */
export function segnoTriangolo(ctx, px, py, m, colore, bordo = null) {
  ctx.fillStyle = colore;
  ctx.beginPath(); ctx.moveTo(px, py - m); ctx.lineTo(px + m, py + m * 0.8); ctx.lineTo(px - m, py + m * 0.8); ctx.closePath();
  ctx.fill();
  if (bordo) { ctx.strokeStyle = bordo; ctx.lineWidth = m * 0.24; ctx.stroke(); }
}

/** Segno di un sito (M8) in pixel dello schermo, lato ~2m. */
export function segnoSito(ctx, s, px, py, m) {
  ctx.fillStyle = COLORI_SITI[s.tipo]; ctx.strokeStyle = COLORI_SITI[s.tipo];
  ctx.beginPath();
  switch (s.tipo) {
    case 'villaggio': {                                // casetta: quadrato col tetto; più grande se ha pieve e locanda
      const k = s.dimensione === 'villaggio' ? 1.25 : 0.9;
      ctx.moveTo(px - m * k, py + m * k); ctx.lineTo(px - m * k, py - m * 0.2 * k); ctx.lineTo(px, py - m * 1.1 * k);
      ctx.lineTo(px + m * k, py - m * 0.2 * k); ctx.lineTo(px + m * k, py + m * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'ovile': ctx.arc(px, py, m * 0.8, 0, Math.PI * 2); ctx.stroke(); break;
    case 'rovina':                                     // muro spezzato
      ctx.moveTo(px - m, py + m); ctx.lineTo(px - m, py - m); ctx.lineTo(px - m * 0.2, py - m * 0.4);
      ctx.moveTo(px + m * 0.3, py - m * 0.7); ctx.lineTo(px + m, py - m * 0.2); ctx.lineTo(px + m, py + m); ctx.lineTo(px - m, py + m);
      ctx.stroke(); break;
    case 'abbandonato':
      ctx.rect(px - m * 0.9, py - m * 0.9, m * 1.8, m * 1.8); ctx.moveTo(px - m * 0.9, py + m * 0.9); ctx.lineTo(px + m * 0.9, py - m * 0.9);
      ctx.stroke(); break;
    case 'grotta': ctx.arc(px, py + m * 0.6, m * 1.1, Math.PI, 0); ctx.closePath(); ctx.fill(); break;
    case 'eremo': case 'ospizio':                       // croce
      ctx.rect(px - m * 0.25, py - m * 1.1, m * 0.5, m * 2.2); ctx.rect(px - m * 0.8, py - m * 0.55, m * 1.6, m * 0.45); ctx.fill(); break;
    case 'fantastico':                                 // cerchio di pietre
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        ctx.moveTo(px + Math.cos(a) * m + m * 0.3, py + Math.sin(a) * m);
        ctx.arc(px + Math.cos(a) * m, py + Math.sin(a) * m, m * 0.3, 0, Math.PI * 2);
      }
      ctx.fill(); break;
    case 'accampamento':                               // tenda
      ctx.fillStyle = s.variante === 'briganti' ? '#8c1c13' : '#b0451c';
      ctx.moveTo(px, py - m * 1.1); ctx.lineTo(px + m * 1.1, py + m * 0.9); ctx.lineTo(px - m * 1.1, py + m * 0.9); ctx.closePath(); ctx.fill(); break;
    case 'sentinella':                                 // torre stretta
      ctx.rect(px - m * 0.45, py - m * 1.2, m * 0.9, m * 2.2); ctx.fill(); break;
    case 'mulino': {                                   // ruota: cerchio con quattro raggi
      ctx.arc(px, py, m * 0.85, 0, Math.PI * 2);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 4 + Math.PI / 8;
        ctx.moveTo(px - Math.cos(a) * m * 0.85, py - Math.sin(a) * m * 0.85);
        ctx.lineTo(px + Math.cos(a) * m * 0.85, py + Math.sin(a) * m * 0.85);
      }
      ctx.stroke(); break;
    }
  }
}
// Rilievo fine della parte visibile: da zoom DA, un campione ogni `passo` pixel (CSS) dello schermo,
// calcolato a pezzi tra un fotogramma e l'altro (`budget` ms) dopo che la vista si è fermata (`attesa` ms).
const DETTAGLIO = { da: 1, passo: 2, attesa: 120, budget: 12, esagerazione: 2, equidistanze: [5, 10, 20, 25, 50, 100, 200, 250, 500],
  percorsi: 130,    // km: finestra entro cui si cercano e si disegnano i percorsi dei fiumi sul terreno
  strade: 24 };     // km: finestra entro cui si cerca il tracciato fine delle strade (~50–100 ms per tratto di 4 km)
const fasciaDi = (m) => FASCE.find(([, a, b]) => m >= a && m < b)?.[0] ?? 'montagna';
export const LUCE = (() => {             // luce da nord-ovest, alta 45°
  const x = -1, y = -1, z = 1.4142135623730951;
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
})();

/** true se nel punto (x, y in km) c'è acqua (mare, lago, fiume): dalla griglia fine se c'è, altrimenti dalla cella. */
const _lg = { quota: 0, acqua: NaN };
export function acquaNelPunto(carta, x, y) {
  if (carta.griglia) {
    leggiGriglia(carta.griglia, x * carta.cella, y * carta.cella, _lg);
    return _lg.quota <= 0 || !Number.isNaN(_lg.acqua);
  }
  return !!carta.mare[Math.floor(y) * carta.cols + Math.floor(x)];
}

export function tinta(scala, t) {
  for (let i = 1; i < scala.length; i++) {
    if (t <= scala[i][0]) {
      const [t0, c0] = scala[i - 1], [t1, c1] = scala[i];
      const u = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return scala[scala.length - 1][1];
}

/**
 * Pixel RGBA (una cella = un pixel) della Carta: tinte del livello (quota, temperatura, umidità o biomi),
 * rilievo ombreggiato, costa.
 */
export function disegnaRilievo(carta, pixel = new Uint8ClampedArray(carta.cols * carta.rows * 4), livello = 'rilievo') {
  const { cols, rows, quota, mare, acque, livelloAcqua } = carta;
  const lago = (i) => acque && acque[i] === ACQUA.LAGO;
  const q = (x, y) => {
    x = x < 0 ? 0 : x >= cols ? cols - 1 : x;
    y = y < 0 ? 0 : y >= rows ? rows - 1 : y;
    const i = y * cols + x;
    const v = lago(i) ? livelloAcqua[i] : quota[i];   // i laghi (disegnati sopra, smussati) sono piani
    return v > 0 ? v : 0;                       // il mare è piatto per l'ombreggiatura
  };
  const piatto = LUCE[2];
  const naturale = livello === 'naturale' && carta.bioma ? coloreNaturale(carta) : null;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let c;
      if (mare[i] && livello === 'biomi' && carta.bioma) {
        c = COLORI_BIOMI[carta.bioma[i]];
      } else if (mare[i]) {
        c = tinta([[0, MARE_BASSO], [1, MARE_FONDO]], Math.sqrt(Math.min(1, -quota[i] / 2500)));
      } else {
        const dx = (q(x + 1, y) - q(x - 1, y)) * 0.5 / carta.cella * ESAGERAZIONE;
        const dy = (q(x, y + 1) - q(x, y - 1)) * 0.5 / carta.cella * ESAGERAZIONE;
        const l = Math.sqrt(dx * dx + dy * dy + 1);
        const luce = (-dx * LUCE[0] - dy * LUCE[1] + LUCE[2]) / l / piatto;
        const ombra = 0.55 + 0.45 * Math.min(1.5, Math.max(0, luce));
        const pend = Math.atan(Math.hypot(dx, dy) / ESAGERAZIONE) * 180 / Math.PI;
        const base = lago(i) ? LAGO
          : naturale ? naturale((x + 0.5) * carta.cella, (y + 0.5) * carta.cella, quota[i], pend)
          : livello === 'temperatura' && carta.temperatura ? tinta(SCALA_T, carta.temperatura[i])
          : livello === 'umidita' && carta.umidita ? tinta(SCALA_U, carta.umidita[i])
            : livello === 'biomi' && carta.bioma ? (carta.valico?.[i] ? COLORE_VALICO : COLORI_BIOMI[carta.bioma[i]])
              : tinta(TERRA, lago(i) ? livelloAcqua[i] : quota[i]);
        c = base.map((v) => v * ombra);
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
 * @param {{
 *   onCambio?: (aperta: boolean) => void,
 *   cartaAttuale?: () => (object|null),             // Carta del mondo della partita
 *   posizione?: () => ({x:number, y:number}|null),  // cavaliere sulla Carta (km da ovest e da nord)
 *   onScegli?: (carta: object, x: number, y: number) => void,   // clic su una cella di terra
 *   onTavullia?: () => void,                        // pulsante «Tavullia (prova)»
 *   onRocca?: (carta: object, sito: object) => void, // pulsante «Vai alla rocca» (M7)
 *   generaCarta: (seme: number, avanzamento) => Promise<object>,   // dal Web Worker (generatore.js)
 * }} opzioni
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
      <button type="button" class="panorami" title="Mostra le alture da cui si vede lontano (regola dei punti panoramici)">Punti panoramici</button>
      <select class="livello" title="Che cosa mostra la Carta">
        <option value="naturale">Naturale</option><option value="rilievo">Rilievo</option><option value="temperatura">Temperatura</option>
        <option value="umidita">Umidità</option><option value="biomi">Biomi</option>
      </select>
      <button type="button" class="intera" title="Tutta la Carta">Vista intera</button>
      <button type="button" class="centra" title="Ingrandisci attorno al cavaliere">Centra sul cavaliere</button>
      <button type="button" class="rocca" title="Scena della rocca successiva (fuori dalla porta del borgo)">Vai alla rocca</button>
      <select class="vaia" title="Scena del prossimo luogo del tipo scelto (M8)"><option value="">Vai a…</option></select>
      <button type="button" class="candidati" title="Siti validi non scelti, colorati per punteggio">Candidati</button>
      <button type="button" class="semi" title="Genera 10 semi a caso e verifica ogni regola (fiumi, punti panoramici, varietà)">Verifica 10 semi</button>
      <button type="button" class="tavullia" title="Terreno reale di Tavullia con il castello (scena di prova)">Tavullia (prova)</button>
      <button type="button" class="dettagli" title="Statistiche e verifiche del generatore">Dettagli</button>
      <span class="info"></span>
      <span class="tasto">rotella: zoom · trascina: sposta · clic sulla terra: vai lì · M: torna alla scena</span>
    </div>
    <div class="area">
      <canvas></canvas>
      <aside class="simboli"><canvas class="chiave"></canvas></aside>
    </div>
    <div class="piede">
      <div class="cursore">&nbsp;</div>
      <div class="dati" hidden>
        <div class="fasce"></div>
        <canvas class="istogramma" width="360" height="56" title="Quote della terra, a passi di 100 m"></canvas>
      </div>
    </div>`;
  contenitore.appendChild(el);
  const selLivello = el.querySelector('.livello');
  let livello = 'naturale';
  const elChiave = el.querySelector('.chiave');
  const elSimboli = el.querySelector('.simboli');

  /**
   * Legenda dei simboli accanto alla Carta (richiesta dell'utente): disegnata con gli stessi segni della Carta, così
   * quello che si vede nell'elenco è esattamente quello che si vede sul rilievo.
   */
  function legenda() {
    const d = window.devicePixelRatio || 1, W = 186;
    const righe = [];                               // { h, dis(g, y) } in pixel CSS
    const testo = (g, t, y, col = '#d8c8a0', size = 11.5) => {
      g.fillStyle = col; g.font = `${size}px Georgia, serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(t, 34, y);
    };
    const titolo = (t) => righe.push({ h: 19, dis: (g, y) => { g.fillStyle = '#c8a030'; g.font = '11px Georgia, serif';
      g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(t.toUpperCase(), 4, y + 7);
      g.strokeStyle = '#5a4020'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, y + 10); g.lineTo(W - 6, y + 10); g.stroke(); } });
    // Dietro al segno un riquadro chiaro come la pergamena della Carta: i tratti scuri (ponti, siti) si leggono anche
    // sul fondo scuro del pannello.
    const voce = (t, dis) => righe.push({ h: 18, dis: (g, y) => {
      g.fillStyle = '#cdbb92'; g.fillRect(4, y - 8, 28, 16);
      dis(g, 18, y); testo(g, t, y);
    } });
    const barra = (t, scala) => righe.push({ h: 24, dis: (g, y) => {
      const grad = g.createLinearGradient(4, 0, W - 6, 0);
      for (const [k, c] of scala.map(([q, c], i) => [i / (scala.length - 1), c])) grad.addColorStop(k, `rgb(${c.join(',')})`);
      g.fillStyle = grad; g.fillRect(4, y - 8, W - 10, 9);
      g.strokeStyle = '#5a4020'; g.lineWidth = 1; g.strokeRect(4.5, y - 8.5, W - 11, 10);
      g.fillStyle = '#b8a880'; g.font = '10.5px Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(t, 4, y + 3);
    } });
    const quadretto = (t, c) => voce(t, (g, x, y) => { g.fillStyle = Array.isArray(c) ? `rgb(${c.join(',')})` : c; g.fillRect(x - 6, y - 5, 12, 10);
      g.strokeStyle = '#5a4020'; g.lineWidth = 1; g.strokeRect(x - 6.5, y - 5.5, 13, 11); });

    // Scala del livello mostrato
    titolo(livello === 'temperatura' ? 'temperatura' : livello === 'umidita' ? 'umidità' : livello === 'biomi' ? 'biomi' : 'quota');
    if (livello === 'temperatura') barra('−15 … 24 °C', SCALA_T);
    else if (livello === 'umidita') barra('secco … umido', SCALA_U);
    else if (livello === 'biomi') {
      for (const b of [BIOMA.PIANURA_N, BIOMA.PIANURA, BIOMA.PIANURA_S, BIOMA.COLLINA, BIOMA.FORESTA, BIOMA.MONTAGNA,
        BIOMA.ROCCIA, BIOMA.NEVE, BIOMA.GHIACCIO, BIOMA.SABBIA, BIOMA.PALUDE]) quadretto(NOMI_BIOMI[b], COLORI_BIOMI[b]);
    } else barra('0 … 3500 m', TERRA);
    if (livello !== 'biomi') { quadretto('lago', LAGO); quadretto('mare', MARE_BASSO); }

    titolo('luoghi');
    for (const [t, [, lettera]] of Object.entries(TIPI_LUOGO)) {
      voce(`${NOMI_SITI[t]} (${lettera})`, (g, x, y) => segnoRocca(g, x, y, 6, t));
    }
    titolo('siti');
    for (const t of Object.keys(COLORI_SITI)) {
      if (t === 'ospizio') continue;
      voce(NOMI_SITI[t], (g, x, y) => segnoSito(g, { tipo: t, dimensione: 'villaggio', variante: '' }, x, y, 4.4));
    }
    titolo('passaggi');
    voce('valico', (g, x, y) => segnoValico(g, x, y, SEGNI.valico, false));
    voce('valico con sentinella', (g, x, y) => segnoValico(g, x, y, SEGNI.valico, true));
    voce('ponte', (g, x, y) => segnoPonte(g, x, y, SEGNI.ponte));
    voce('guado', (g, x, y) => segnoGuado(g, x, y, SEGNI.ponte));
    titolo('strade');
    for (const [classe, , trattino] of STILE_STRADE) {
      voce(classe, (g, x, y) => {
        g.strokeStyle = classe === 'sentiero' ? COLORE_SENTIERO : COLORE_STRADA;
        g.lineWidth = STRADE_ZOOM.minimo[classe];
        g.setLineDash(trattino.map((v) => v * STRADE_ZOOM.minimo[classe] * 1.5));
        g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.stroke(); g.setLineDash([]);
      });
    }
    titolo('rilievo');
    voce('gruppo montuoso', (g, x, y) => segnoTriangolo(g, x, y, 5, '#2a1a0c', '#f4ead0'));
    voce('forcella', (g, x, y) => { g.fillStyle = `rgb(${COLORE_VALICO.join(',')})`; g.beginPath(); g.arc(x, y, SEGNI.forcella, 0, Math.PI * 2); g.fill(); });
    voce('punto panoramico', (g, x, y) => segnoTriangolo(g, x, y, SEGNI.panorama, COLORE_PANORAMA));
    voce('fiume', (g, x, y) => { g.strokeStyle = COLORE_FIUME; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.stroke(); });

    const H = righe.reduce((a, r) => a + r.h, 0) + 10;
    elChiave.width = Math.round(W * d); elChiave.height = Math.round(H * d);
    elChiave.style.width = W + 'px'; elChiave.style.height = H + 'px';
    const g = elChiave.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
    let y = 6;
    for (const r of righe) { y += r.h; r.dis(g, y - r.h / 2); }
  }
  legenda();
  selLivello.addEventListener('change', () => { livello = selLivello.value; legenda(); adatta(); if (carta) mostra(carta); });
  selLivello.addEventListener('keydown', (e) => e.stopPropagation());
  // Statistiche e verifiche del generatore: nascoste (richiesta dell'utente: sopra e sotto la Carta erano decine di
  // righe), si aprono con «Dettagli».
  const elDati = el.querySelector('.dati');
  const btnDettagli = el.querySelector('.dettagli');
  btnDettagli.addEventListener('click', () => {
    elDati.hidden = !elDati.hidden;
    btnDettagli.classList.toggle('attivo', !elDati.hidden);
    adatta();
  });
  const elFasce = el.querySelector('.fasce');
  const isto = el.querySelector('.istogramma');

  const inSeme = el.querySelector('.seme');
  const elInfo = el.querySelector('.info');
  const elCursore = el.querySelector('.cursore');
  const area = el.querySelector('.area');
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let carta = null;
  let rilievo = null;                            // immagine del rilievo della Carta mostrata (1 px per cella)
  let tracciatiLaghi = null, tracciatiFiumi = null;   // Path2D in coordinate di cella, una volta per Carta
  let tracciatiStrade = null;                          // { classe: Path2D } dai rami della rete (js/mondo/strade.js)
  let verifica = null;                           // esito di verificaFiumi
  let panorami = null;                           // esito di verificaPanorami
  let varieta = null;                            // esito di verificaVarieta
  let esitoSemi = '';                            // ultima verifica su più semi
  let mostraPanorami = false;                    // i triangoli sono tanti: si mostrano a richiesta
  let mostraCandidati = false;                   // siti delle rocche validi ma non scelti
  let luoghiVerifica = null;                     // esito di verificaLuoghi
  let roccaSuccessiva = 0;
  let sitiVerifica = null;                       // esito di verificaSiti (M8)
  const prossimoSito = {};                       // tipo → indice del prossimo per «Vai a»

  // ─── Vista: centro (in celle = km) e zoom (1 = tutta la Carta nello spazio disponibile) ───
  const ZOOM_MAX = 80;
  const vista = { cx: 0, cy: 0, z: 1 };
  let dpr = 1, larghezza = 1, altezza = 1;        // canvas in pixel del dispositivo
  const base = () => Math.min(larghezza / carta.cols, altezza / carta.rows);   // pixel per cella a zoom 1
  const scala = () => base() * vista.z;
  const origine = () => [larghezza / 2 - vista.cx * scala(), altezza / 2 - vista.cy * scala()];
  /** Da coordinate dello schermo (evento) a km della Carta. */
  function inKm(e) {
    const r = canvas.getBoundingClientRect();
    const s = scala(), [tx, ty] = origine();
    return [((e.clientX - r.left) * dpr - tx) / s, ((e.clientY - r.top) * dpr - ty) / s];
  }
  function vistaIntera() { vista.cx = carta.cols / 2; vista.cy = carta.rows / 2; vista.z = 1; }
  function limitaVista() {
    vista.z = Math.min(ZOOM_MAX, Math.max(1, vista.z));
    vista.cx = Math.min(carta.cols, Math.max(0, vista.cx));
    vista.cy = Math.min(carta.rows, Math.max(0, vista.cy));
  }

  let richiesto = false;
  function ridisegnaPresto() {
    if (richiesto) return;
    richiesto = true;
    requestAnimationFrame(() => { richiesto = false; if (carta && !el.hidden) ridisegna(); });
  }

  function adatta() {
    if (!carta || el.hidden) return;
    dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, area.clientWidth - (elSimboli.offsetWidth || 0)), h = area.clientHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    larghezza = canvas.width = Math.max(1, Math.round(w * dpr));
    altezza = canvas.height = Math.max(1, Math.round(h * dpr));
    ridisegna();
  }

  const diPartita = () => carta !== null && carta === opzioni.cartaAttuale?.();

  /** Mostra una Carta (quella della partita o un'anteprima). */
  function mostra(c) {
    const nuova = !carta || carta.seme !== c.seme;
    carta = c;
    inSeme.value = String(carta.seme);
    rilievo = document.createElement('canvas');
    rilievo.width = carta.cols;
    rilievo.height = carta.rows;
    const c2 = rilievo.getContext('2d');
    const img = c2.createImageData(carta.cols, carta.rows);
    disegnaRilievo(carta, img.data, livello);
    c2.putImageData(img, 0, 0);
    tracciatiLaghi = costruisciLaghi();
    tracciatiFiumi = costruisciFiumi();
    tracciatiStrade = costruisciStrade();
    // Verifiche già fatte dal Worker; altrimenti qui (Carte di altra provenienza).
    verifica = carta.verifiche?.fiumi ?? verificaFiumi(carta);
    panorami = carta.verifiche?.panorami ?? verificaPanorami(carta);
    varieta = carta.verifiche?.varieta ?? verificaVarieta(carta);
    luoghiVerifica = carta.luoghi ? (carta.verifiche?.luoghi ?? verificaLuoghi(carta)) : null;
    sitiVerifica = carta.siti ? (carta.verifiche?.siti ?? verificaSiti(carta)) : null;
    if (nuova) { roccaSuccessiva = 0; for (const k in prossimoSito) delete prossimoSito[k]; aggiornaVaiA(); }
    if (nuova) vistaIntera();
    disegnaIstogramma();
    adatta();
  }

  // Classi di larghezza dei fiumi: multipli della soglia del bacino → pixel sullo schermo.
  // Classi per bacino (multipli di sogliaFiume, 150 km²): torrenti da 20 km², poi 150, 375, 900, 1800 km²
  // (nella regione di 120×90 km i bacini più grandi arrivano a ~2500 km²).
  const CLASSI_FIUMI = [[0.13, 0.35], [1, 0.7], [2.5, 1.1], [6, 1.6], [12, 2.3]];

  /** Strade: i rami della rete, un Path2D per classe (sopra i fiumi: i ponti si vedono). */
  function costruisciStrade() {
    const out = {};
    for (const r of carta.strade?.rami ?? []) {
      const p = (out[r.classe] ??= new Path2D());
      p.moveTo(r.x[0], r.y[0]);
      for (let i = 1; i < r.x.length; i++) p.lineTo(r.x[i], r.y[i]);
    }
    return out;
  }

  /** Fiumi: i tracciati curvi della Carta (tracciaFiumi), un Path2D per classe di larghezza. */
  function costruisciFiumi() {
    const { fiumi, sogliaFiume } = carta;
    if (!fiumi) return [];
    return CLASSI_FIUMI.map(([da0], k) => {
      const da = da0 * sogliaFiume, a = k + 1 < CLASSI_FIUMI.length ? CLASSI_FIUMI[k + 1][0] * sogliaFiume : Infinity;
      const p = new Path2D();
      for (const f of fiumi) {
        let aperto = false;
        for (let i = 4; i < f.length; i += 4) {        // punti: x, y, bacino, letto
          const b = f[i + 2];
          if (b < da || b >= a) { aperto = false; continue; }
          if (!aperto) { p.moveTo(f[i - 4], f[i - 3]); aperto = true; }
          p.lineTo(f[i], f[i + 1]);
        }
      }
      return p;
    });
  }

  /**
   * Laghi con contorni smussati: marching squares sul campo «lago» (1/0 ai centri delle celle) ammorbidito
   * con un filtro 3×3, soglia 0,5. A quadretti da 1 km sembravano macchie squadrate.
   */
  function costruisciLaghi() {
    const { cols, rows, acque } = carta;
    const p = new Path2D();
    if (!acque) return p;
    const v = new Float32Array(cols * rows);
    const k = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        let somma = 0, t = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const a = acque[(y + dy) * cols + x + dx];
            if (a === ACQUA.LAGO || a === ACQUA.LAGO_COSTIERO) somma += k[t];
            t++;
          }
        }
        v[y * cols + x] = somma / 16;
      }
    }
    const angoli = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const w = [v[y * cols + x], v[y * cols + x + 1], v[(y + 1) * cols + x + 1], v[(y + 1) * cols + x]];
        if (w[0] < 0.5 && w[1] < 0.5 && w[2] < 0.5 && w[3] < 0.5) continue;
        const punti = [];
        for (let a = 0; a < 4; a++) {
          const b = (a + 1) % 4;
          if (w[a] >= 0.5) punti.push(angoli[a]);
          if ((w[a] >= 0.5) !== (w[b] >= 0.5)) {
            const t = (0.5 - w[a]) / (w[b] - w[a]);
            punti.push([angoli[a][0] + (angoli[b][0] - angoli[a][0]) * t, angoli[a][1] + (angoli[b][1] - angoli[a][1]) * t]);
          }
        }
        p.moveTo(x + 0.5 + punti[0][0], y + 0.5 + punti[0][1]);
        for (let q = 1; q < punti.length; q++) p.lineTo(x + 0.5 + punti[q][0], y + 0.5 + punti[q][1]);
        p.closePath();
      }
    }
    return p;
  }

  // ─── Rilievo fine della parte visibile (da zoom DETTAGLIO.da) ───
  let dettaglio = null;                          // { img (canvas), x0, y0, w, h (km), eq (m), chiave }
  let chiaveInCorso = '', lavoro = 0, attesa = 0;
  const chiaveVista = () => `${carta.seme}|${vista.cx}|${vista.cy}|${vista.z}|${larghezza}|${altezza}|${livello}`;
  const conDettaglio = () => livello === 'rilievo' || livello === 'naturale';
  function chiediDettaglio() {
    if (vista.z < DETTAGLIO.da || !conDettaglio()) { clearTimeout(attesa); chiaveInCorso = ''; lavoro++; return; }
    const k = chiaveVista();
    if (k === chiaveInCorso || dettaglio?.chiave === k) return;
    clearTimeout(attesa);
    lavoro++;
    chiaveInCorso = k;
    attesa = setTimeout(() => calcolaDettaglio(k), DETTAGLIO.attesa);
  }
  async function calcolaDettaglio(chiave) {
    const mio = lavoro, c0 = carta;
    const s = scala(), [tx, ty] = origine();
    const k = DETTAGLIO.passo * dpr / s;          // km per campione
    const x0 = Math.max(0, -tx / s), y0 = Math.max(0, -ty / s);
    const x1 = Math.min(c0.cols, (larghezza - tx) / s), y1 = Math.min(c0.rows, (altezza - ty) / s);
    const nx = Math.max(1, Math.ceil((x1 - x0) / k)), ny = Math.max(1, Math.ceil((y1 - y0) / k));
    // Finestra piccola: prima i percorsi dei fiumi sul terreno (le quote li usano), poi si disegnano quelli.
    let percorsi = null;
    if (x1 - x0 <= DETTAGLIO.percorsi && y1 - y0 <= DETTAGLIO.percorsi) {
      const C = c0.cella, mx = (x0 + x1) / 2 * C, mz = (y0 + y1) / 2 * C;
      raffinaZona(c0, mx, mz, Math.max(x1 - x0, y1 - y0) / 2 * C + 1000);
      if (mio !== lavoro || carta !== c0) return;
      percorsi = percorsiFiumi(c0, x0 * C - 1000, y0 * C - 1000, x1 * C + 1000, y1 * C + 1000);
    }
    // Finestra ancora più piccola: il tracciato fine delle strade (tornanti), prima delle quote (le strade le spianano).
    let strade = null;
    if (x1 - x0 <= DETTAGLIO.strade && y1 - y0 <= DETTAGLIO.strade) {
      const C = c0.cella;
      raffinaStrade(c0, (x0 + x1) / 2 * C, (y0 + y1) / 2 * C, Math.max(x1 - x0, y1 - y0) / 2 * C);
      if (mio !== lavoro || carta !== c0) return;
      strade = percorsiStrade(c0, x0 * C - 500, y0 * C - 500, x1 * C + 500, y1 * C + 500);
    }
    const h = new Float32Array(nx * ny), acqua = new Float32Array(nx * ny);
    const seme = derivaSeme(c0.seme, 101), C = c0.cella, esito = { quota: 0, livello: NaN };
    let t = performance.now();
    // Griglia fine già calcolata con la Carta (G1): finché un campione copre almeno ~¾ del suo passo il rilievo si legge
    // da lì, subito (prima si ricalcolava a ogni zoom: 2–3 s di attesa, segnalato dall'utente).
    const G = c0.griglia, daGriglia = G && k * C >= 0.75 * G.passo, lg = { quota: 0, acqua: NaN };
    if (daGriglia) {
      for (let r = 0; r < ny; r++) {
        const Z = (y0 + (r + 0.5) * k) * C;
        for (let c = 0; c < nx; c++) {
          leggiGriglia(G, (x0 + (c + 0.5) * k) * C, Z, lg);
          h[r * nx + c] = lg.quota; acqua[r * nx + c] = lg.acqua;
        }
      }
    }
    for (let r = 0; r < ny && !daGriglia; r++) {
      const Z = (y0 + (r + 0.5) * k) * C;
      for (let c = 0; c < nx; c++) {
        const X = (x0 + (c + 0.5) * k) * C, i = r * nx + c;
        h[i] = quotaFinale(c0, X, Z, seme, esito);
        let w = esito.livello;
        if (Number.isNaN(w)) { const l = livelloLago(c0, X, Z); if (l > h[i]) w = l; }
        acqua[i] = w;
      }
      if (performance.now() - t > DETTAGLIO.budget) {
        await new Promise(requestAnimationFrame);
        if (mio !== lavoro || carta !== c0) return;
        t = performance.now();
      }
    }
    // Equidistanza delle curve [rivista con l'utente: prima un quarto dei metri per campione, troppo fitte]: circa
    // 5 volte i metri per campione, a valori tondi (~20 volte più rade di prima); una curva marcata ogni cinque.
    const eq = DETTAGLIO.equidistanze.find((e) => e >= k * C * 5) ?? 500;
    const naturale = livello === 'naturale' && c0.bioma ? coloreNaturale(c0) : null;
    const img = document.createElement('canvas');
    img.width = nx; img.height = ny;
    const g = img.getContext('2d'), dati = g.createImageData(nx, ny), px = dati.data;
    const H = (c, r) => h[Math.min(ny - 1, Math.max(0, r)) * nx + Math.min(nx - 1, Math.max(0, c))];
    const passoM = 2 * k * C / DETTAGLIO.esagerazione, piatto = LUCE[2];
    for (let r = 0; r < ny; r++) {
      if (naturale && performance.now() - t > DETTAGLIO.budget) {   // il colore naturale costa: a pezzi
        await new Promise(requestAnimationFrame);
        if (mio !== lavoro || carta !== c0) return;
        t = performance.now();
      }
      for (let c = 0; c < nx; c++) {
        const i = r * nx + c, v = h[i];
        let col;
        if (!Number.isNaN(acqua[i])) col = LAGO;
        else if (v < 0) col = tinta([[0, MARE_BASSO], [1, MARE_FONDO]], Math.sqrt(Math.min(1, -v / 2500)));
        else {
          const dx = (H(c + 1, r) - H(c - 1, r)) / passoM, dy = (H(c, r + 1) - H(c, r - 1)) / passoM;
          const l = Math.sqrt(dx * dx + dy * dy + 1);
          const luce = (-dx * LUCE[0] - dy * LUCE[1] + LUCE[2]) / l / piatto;
          let f = 0.55 + 0.45 * Math.min(1.5, Math.max(0, luce));
          const b = Math.floor(v / eq);             // curva di livello: cambia fascia verso destra o in basso
          const bd = Math.floor(H(c + 1, r) / eq), bg = Math.floor(H(c, r + 1) / eq);
          const marcata = Math.max(b, bd, bg) % 5 === 0;
          if (b !== bd || b !== bg) f *= naturale ? (marcata ? 0.72 : 0.88) : (marcata ? 0.55 : 0.78);
          const base = naturale
            ? naturale((x0 + (c + 0.5) * k) * C, (y0 + (r + 0.5) * k) * C, v, Math.atan(Math.hypot(dx, dy) / DETTAGLIO.esagerazione) * 180 / Math.PI)
            : tinta(TERRA, v);
          col = base.map((x) => x * f);
        }
        const p = i * 4;
        px[p] = col[0]; px[p + 1] = col[1]; px[p + 2] = col[2]; px[p + 3] = 255;
      }
    }
    g.putImageData(dati, 0, 0);
    dettaglio = { img, x0, y0, w: nx * k, h: ny * k, eq, chiave, percorsi, strade, livello };
    if (chiaveInCorso === chiave) chiaveInCorso = '';
    ridisegna();
  }

  /** Rilievo, laghi, fiumi, punti panoramici e (se è la Carta della partita) il cavaliere. */
  function ridisegna() {
    const s = scala(), [tx, ty] = origine();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a0e04';
    ctx.fillRect(0, 0, larghezza, altezza);
    ctx.setTransform(s, 0, 0, s, tx, ty);            // da qui: coordinate in celle (km)
    // Vista intera: celle nette. Da ×3: rilievo sfumato (più leggibile; coordinate e clic restano esatti).
    ctx.imageSmoothingEnabled = vista.z >= 3;
    ctx.drawImage(rilievo, 0, 0);
    if (dettaglio && dettaglio.chiave.startsWith(carta.seme + '|') && vista.z >= DETTAGLIO.da && conDettaglio() && dettaglio.livello === livello) {
      ctx.imageSmoothingEnabled = true;            // i laghi ci sono già, con la forma che hanno nelle Scene
      ctx.drawImage(dettaglio.img, dettaglio.x0, dettaglio.y0, dettaglio.w, dettaglio.h);
    } else {
      ctx.fillStyle = `rgb(${LAGO.join(',')})`;
      ctx.fill(tracciatiLaghi);
    }
    ctx.strokeStyle = COLORE_FIUME;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const spessore = (1 + 0.25 * Math.log2(vista.z)) * dpr / s;   // pixel sullo schermo, crescono poco con lo zoom
    const fini = dettaglio?.percorsi && dettaglio.chiave === chiaveVista() ? dettaglio.percorsi : null;
    if (fini) {
      // I fiumi dove corrono davvero nelle Scene: larghi quanto l'alveo, almeno ~1,5 pixel.
      const C = carta.cella;
      for (const f of fini) {
        ctx.lineWidth = Math.max(1.5 * dpr / s, (2 * f.w[0]) / C);
        ctx.beginPath();
        ctx.moveTo(f.x[0] / C, f.z[0] / C);
        for (let i = 1; i < f.x.length; i++) ctx.lineTo(f.x[i] / C, f.z[i] / C);
        ctx.stroke();
      }
    } else CLASSI_FIUMI.forEach(([, w], k) => { ctx.lineWidth = w * spessore; ctx.stroke(tracciatiFiumi[k]); });
    // Strade e sentieri: terra battuta, tratteggio per mulattiere e sentieri.
    const stradeFini = dettaglio?.strade && dettaglio.chiave === chiaveVista() ? dettaglio.strade : null;
    if (stradeFini) {
      // Il tracciato delle Scene (tornanti compresi), largo almeno ~1 pixel.
      const C = carta.cella;
      const linea = (f) => {
        ctx.beginPath();
        ctx.moveTo(f.x[0] / C, f.z[0] / C);
        for (let i = 1; i < f.x.length; i++) ctx.lineTo(f.x[i] / C, f.z[i] / C);
        ctx.stroke();
      };
      const larga = (classe) => Math.max(STRADE_ZOOM.minimo[classe] * dpr / s, 2 * STRADE.classi[classe].semi / C);
      // Prima il bordino chiaro di tutte le strade, poi le strade: si leggono anche sul rilievo scuro.
      ctx.strokeStyle = STRADE_ZOOM.coloreBordo;
      for (const f of stradeFini) { ctx.lineWidth = larga(f.classe) + 2 * STRADE_ZOOM.bordo * dpr / s; linea(f); }
      for (const [classe, , trattino] of STILE_STRADE) {
        ctx.strokeStyle = classe === 'sentiero' ? COLORE_SENTIERO : COLORE_STRADA;
        ctx.lineWidth = larga(classe);
        ctx.setLineDash(trattino.map((t) => t * larga(classe) * 1.5));
        for (const f of stradeFini) if (f.classe === classe) linea(f);
      }
      ctx.setLineDash([]);
    } else if (tracciatiStrade) {
      for (const [classe, w, trattino] of STILE_STRADE) {
        const p = tracciatiStrade[classe];
        if (!p) continue;
        ctx.strokeStyle = classe === 'sentiero' ? COLORE_SENTIERO : COLORE_STRADA;
        ctx.lineWidth = w * spessore;
        ctx.setLineDash(trattino.map((t) => t * spessore));
        ctx.stroke(p);
      }
      ctx.setLineDash([]);
    }
    // Segni in pixel dello schermo, indipendenti dallo zoom.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const P = (x, y) => [x * s + tx, y * s + ty];
    // Ponti e guadi delle strade: nella Carta zoomata quelli delle Scene, altrimenti i ponti della rete (celle).
    {
      const segni = [];
      if (stradeFini) for (const f of stradeFini) for (const at of f.attraversamenti ?? []) segni.push({ ...at, x: at.x / carta.cella, y: at.z / carta.cella });
      else for (const p of carta.strade?.ponti ?? []) segni.push({ ponte: true, x: p.x, y: p.y, dx: 1, dz: 0 });
      for (const g of segni) {
        const [px, py] = P(g.x, g.y);
        if (px < -14 || py < -14 || px > canvas.width + 14 || py > canvas.height + 14) continue;
        const m = SEGNI.ponte * dpr;
        if (g.ponte) conAlone(ctx, () => segnoPonte(ctx, px, py, m, Math.atan2(g.dz, g.dx)), 3 * dpr);
        else conAlone(ctx, () => segnoGuado(ctx, px, py, m), 3 * dpr);
      }
    }
    // Gruppi montuosi: un segno e un numero (il nome arriverà con i luoghi); forcelle in giallo.
    if (carta.massicci) {
      ctx.font = `${Math.round(11 * dpr)}px Georgia, serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const g of carta.massicci) {
        const [px, py] = P(g.x, g.y), m = 5 * dpr;
        if (px < -40 || py < -40 || px > larghezza + 40 || py > altezza + 40) continue;
        ctx.fillStyle = '#2a1a0c'; ctx.strokeStyle = '#f4ead0'; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.moveTo(px, py - m); ctx.lineTo(px + m, py + m * 0.8); ctx.lineTo(px - m, py + m * 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f4ead0'; ctx.fillText(`${g.id + 1}`, px + m + 2 * dpr, py);
        if (vista.z >= 4) {
          ctx.fillStyle = `rgb(${COLORE_VALICO.join(',')})`;
          for (const f of g.forcelle) { const [fx, fy] = P(f.x, f.y); ctx.beginPath(); ctx.arc(fx, fy, SEGNI.forcella * dpr, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
    if (panorami && mostraPanorami) {
      const m = SEGNI.panorama * dpr;
      ctx.fillStyle = COLORE_PANORAMA;
      ctx.beginPath();
      for (const [x, y] of panorami.punti) {
        const [px, py] = P(x + 0.5, y + 0.5);
        if (px < -m || py < -m || px > larghezza + m || py > altezza + m) continue;
        ctx.moveTo(px, py - m); ctx.lineTo(px + m, py + m * 0.8); ctx.lineTo(px - m, py + m * 0.8); ctx.closePath();
      }
      ctx.fill();
    }
    // Valichi (M7): due archi contrapposti «)(»; pieni se presidiati da una sentinella.
    if (carta.valichi) {
      const m = SEGNI.valico * dpr;
      for (const v of carta.valichi) {
        const [px, py] = P(v.x, v.y);
        if (px < -3 * m || py < -3 * m || px > larghezza + 3 * m || py > altezza + 3 * m) continue;
        conAlone(ctx, () => segnoValico(ctx, px, py, m, v.presidio), 3.5 * dpr);
      }
    }
    // Rocche (M7): torre stilizzata, più grande secondo la classe; la partenza cerchiata.
    if (mostraCandidati && carta.candidatiLuoghi?.length) {
      const C = carta.cella, ps = carta.candidatiLuoghi.map((k) => k.punteggio);
      const pmin = Math.min(...ps), pmax = Math.max(...ps);
      for (const k of carta.candidatiLuoghi) {
        const [px, py] = P(k.x / C, k.z / C);
        const t = pmax > pmin ? (k.punteggio - pmin) / (pmax - pmin) : 1;
        ctx.fillStyle = `rgba(${Math.round(80 + 160 * t)}, ${Math.round(60 + 40 * t)}, 40, 0.9)`;
        ctx.beginPath(); ctx.arc(px, py, 2.5 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Siti (M8): segni piccoli; i nomi dei tipi nel puntatore. Sotto le rocche.
    if (carta.siti) {
      const C = carta.cella, m = (vista.z >= 3 ? SEGNI.sito[1] : SEGNI.sito[0]) * dpr;
      ctx.lineWidth = 1.6 * dpr;
      for (const st of carta.siti) {
        const [px, py] = P(st.x / C, st.z / C);
        if (px < -14 || py < -14 || px > larghezza + 14 || py > altezza + 14) continue;
        conAlone(ctx, () => segnoSito(ctx, st, px, py, m), 2.5 * dpr);
      }
    }
    if (carta.luoghi) {
      const C = carta.cella;
      ctx.font = `${Math.round(11 * dpr)}px Georgia, serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const l of carta.luoghi) {
        const [px, py] = P(l.x / C, l.z / C), m = CLASSI_ROCCA[l.classe][1] * dpr;
        const lettera = TIPI_LUOGO[l.tipo ?? 'rocca'][1];
        segnoRocca(ctx, px, py, m, l.tipo ?? 'rocca');     // torre con due merli (misura della classe)
        ctx.strokeStyle = '#f4ead0'; ctx.lineWidth = 1.2 * dpr;
        if (l.partenza) { ctx.beginPath(); ctx.arc(px, py + m * 0.2, m * 1.7, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#f4ead0'; ctx.fillText(`${lettera}${l.id + 1}`, px + m + 3 * dpr, py);
        if (vista.z >= 8) {                                // verso del borgo
          ctx.beginPath(); ctx.moveTo(px, py);
          ctx.lineTo(px + l.verso.x * m * 2.4, py + l.verso.z * m * 2.4); ctx.stroke();
        }
      }
    }
    const p = diPartita() ? opzioni.posizione?.() : null;
    if (p) {
      const [px, py] = P(p.x, p.y);
      // Distanze dal cavaliere: cerchi leggeri a 10 e 20 km con il tempo di marcia sulla Carta (~15 min/km,
      // docs/GDD.md §3 Viaggio), così si valuta l'estensione del mondo. Solo se il cerchio è leggibile.
      ctx.font = `${Math.round(10.5 * dpr)}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const km of DISTANZE_CAVALIERE) {
        const r = km * s;
        if (r < 18 * dpr || r > 3 * Math.max(larghezza, altezza)) continue;
        ctx.strokeStyle = 'rgba(232, 64, 42, 0.45)'; ctx.lineWidth = 1.2 * dpr;
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const ore = km * MINUTI_PER_KM / 60, giorni = ore / ORE_MARCIA_GIORNO;
        ctx.fillStyle = 'rgba(120, 30, 20, 0.85)';
        ctx.fillText(`${km} km · ~${fmt(ore, 0)} h di marcia (~${fmt(giorni, giorni < 2 ? 1 : 0)} ${giorni < 1.5 ? 'giorno' : 'giorni'})`,
          px, py - r - 2 * dpr);
      }
      // Direzione in cui guarda il cavaliere (x verso est, z verso sud: in avanti è (sin, cos)).
      if (p.direzione !== undefined) {
        const dx = Math.sin(p.direzione), dy = Math.cos(p.direzione), L = 22 * dpr, w = 6 * dpr;
        const tx = px + dx * L, ty = py + dy * L;
        ctx.fillStyle = COLORE_CAVALIERE; ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px + dx * 8 * dpr - dy * w, py + dy * 8 * dpr + dx * w);
        ctx.lineTo(px + dx * 12 * dpr, py + dy * 12 * dpr);
        ctx.lineTo(px + dx * 8 * dpr + dy * w, py + dy * 8 * dpr - dx * w);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#fff6e0';
      ctx.beginPath(); ctx.arc(px, py, 6 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLORE_CAVALIERE;
      ctx.beginPath(); ctx.arc(px, py, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    const st = carta.statistiche;
    elInfo.textContent = `seme ${carta.seme} · ${carta.cols}×${carta.rows} km · zoom ×${fmt(vista.z, 1)}`
      + (vista.z < DETTAGLIO.da || !conDettaglio() ? '' : dettaglio?.chiave === chiaveVista()
        ? ` · curve ogni ${dettaglio.eq} m` : ' · calcolo del rilievo…');
    if (!elDati.hidden) {
      elInfo.textContent += ` · ${diPartita() ? 'mondo della partita' : 'anteprima'}`
        + ` · mare ${fmt(st.frazioneMare * 100, 1)} % · ${carta.daCache ? 'dalla cache' : `${fmt(st.ms)} ms`}`
        + ` · controllo ${carta.controllo}`;
    }
    chiediDettaglio();
  }

  /** Genera un'anteprima per un seme (testo libero; vuoto = a caso), nel Web Worker. */
  let inCorso = 0;
  async function genera(testo) {
    const t = String(testo).trim() || String(Math.floor(Math.random() * 1e6));
    const seme = semeDaTesto(t);
    const attuale = opzioni.cartaAttuale?.();
    if (attuale && attuale.seme === seme) { mostra(attuale); return; }
    const mio = ++inCorso;
    inSeme.value = t;
    for (const b of el.querySelectorAll('.barra button')) b.disabled = true;
    try {
      const c = await opzioni.generaCarta(seme, (fase, f) => {
        if (mio === inCorso) elInfo.textContent = `generazione del seme ${seme}: ${fase} · ${Math.round(f * 100)} %`;
      });
      if (mio === inCorso) mostra(c);
    } catch (err) {
      elInfo.textContent = `Errore nella generazione: ${err.message}`;
    } finally {
      if (mio === inCorso) for (const b of el.querySelectorAll('.barra button')) b.disabled = false;
    }
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
      + ` · poggi ${fmt(carta.poggi)}`
      + (verifica ? ` · laghi ${carta.statistiche.laghi} · fiumi: ${verifica.sorgenti} sorgenti, foci in mare`
        + ` ${verifica.foci.mare}, in lago ${verifica.foci.lago}, oltre il confine ${verifica.foci.bordo}`
        + ` · verifica ${verifica.ok ? 'superata' : `FALLITA (${verifica.errori.length}): ${verifica.errori[0]}`}` : '')
      + (panorami ? ` · punti panoramici ${fmt(panorami.punti.length)}: ${fmt(panorami.copertura * 100, 1)} % della terra`
        + ` entro ${panorami.raggio} km da uno (regola ≥ ${fmt(panorami.soglia * 100)} %: ${panorami.ok ? 'rispettata' : 'NON rispettata'})` : '')
      + (carta.statistiche.biomi ? ' · biomi: ' + Object.entries(carta.statistiche.biomi).filter(([, v]) => v >= 0.0005)
        .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v * 100, 1)} %`).join(', ') : '')
      + (varieta ? ` · varietà ${varieta.ok ? 'rispettata' : 'NON rispettata'}: ` + varieta.regole.map((r) => (r.ok ? '' : '✗ ') + r.testo).join('; ') : '')
      + (luoghiVerifica ? ` · rocche: ${luoghiVerifica.ok ? '' : 'VERIFICA NON SUPERATA: '}${luoghiVerifica.testo}`
        + (carta.statistiche.luoghi ? ` (siti validi ${carta.statistiche.luoghi.validi} su ${carta.statistiche.luoghi.affinati} esaminati, ${fmt(carta.statistiche.luoghi.ms)} ms)` : '') : '')
      + (sitiVerifica ? ` · siti: ${sitiVerifica.ok ? '' : 'VERIFICA NON SUPERATA: '}${sitiVerifica.testo}`
        + (carta.statistiche.siti ? ` (${fmt(carta.statistiche.siti.ms)} ms; strade ${fmt(carta.strade?.info.ms ?? 0)} ms)` : '') : '')
      + (esitoSemi ? ` · ${esitoSemi}` : '');
  }

  function apri() {
    if (!el.hidden) return;
    el.hidden = false;
    const attuale = opzioni.cartaAttuale?.();
    if (attuale) mostra(attuale);                // ogni volta: la posizione del cavaliere cambia
    else if (!carta) genera(new URL(window.location.href).searchParams.get('seme') || '');
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
  el.querySelector('.panorami').addEventListener('click', (e) => {
    mostraPanorami = !mostraPanorami;
    e.currentTarget.classList.toggle('attivo', mostraPanorami);
    if (carta) ridisegna();
  });
  el.querySelector('.candidati').addEventListener('click', (e) => {
    mostraCandidati = !mostraCandidati;
    e.currentTarget.classList.toggle('attivo', mostraCandidati);
    if (carta) ridisegna();
  });
  const btnRocca = el.querySelector('.rocca');
  if (opzioni.onRocca) {
    btnRocca.addEventListener('click', () => {
      if (!carta?.luoghi?.length) { elCursore.textContent = 'Questa Carta non ha rocche.'; return; }
      const sito = carta.luoghi[roccaSuccessiva % carta.luoghi.length];
      roccaSuccessiva++;
      opzioni.onRocca(carta, sito);
    });
  } else btnRocca.hidden = true;
  // «Vai a» (M8): il prossimo luogo del tipo scelto. Rocche, monasteri e città come «Vai alla rocca» (fuori dalla
  // porta); gli altri siti con la Scena centrata sul sito.
  const selVaiA = el.querySelector('.vaia');
  function aggiornaVaiA() {
    const conti = {};
    for (const l of carta?.luoghi ?? []) conti[l.tipo ?? 'rocca'] = (conti[l.tipo ?? 'rocca'] ?? 0) + 1;
    for (const st of carta?.siti ?? []) conti[st.tipo] = (conti[st.tipo] ?? 0) + 1;
    selVaiA.innerHTML = '<option value="">Vai a…</option>' + VAI_A.filter((t) => conti[t])
      .map((t) => `<option value="${t}">${NOMI_SITI[t]} (${conti[t]})</option>`).join('');
  }
  selVaiA.addEventListener('keydown', (e) => e.stopPropagation());
  selVaiA.addEventListener('change', () => {
    const tipo = selVaiA.value;
    selVaiA.value = '';
    if (!tipo || !carta) return;
    const maggiori = (carta.luoghi ?? []).filter((l) => (l.tipo ?? 'rocca') === tipo);
    const lista = maggiori.length ? maggiori : (carta.siti ?? []).filter((st) => st.tipo === tipo);
    if (!lista.length) return;
    const k = (prossimoSito[tipo] ?? 0) % lista.length;
    prossimoSito[tipo] = k + 1;
    const sito = lista[k];
    if (maggiori.length && opzioni.onRocca) opzioni.onRocca(carta, sito);
    else if (opzioni.onScegli) opzioni.onScegli(carta, sito.x / carta.cella, sito.z / carta.cella);
  });
  el.querySelector('.intera').addEventListener('click', () => { if (carta) { vistaIntera(); ridisegna(); } });
  el.querySelector('.centra').addEventListener('click', () => {
    const p = diPartita() ? opzioni.posizione?.() : null;
    if (!p) { elCursore.textContent = 'Il cavaliere non è su questa Carta.'; return; }
    vista.cx = p.x; vista.cy = p.y; vista.z = Math.max(vista.z, 12);
    limitaVista();
    ridisegna();
  });
  el.querySelector('.semi').addEventListener('click', async (e) => {
    if (!opzioni.verificaSemi) return;
    const b = e.currentTarget;
    b.disabled = true;
    const semi = Array.from({ length: 10 }, () => Math.floor(Math.random() * 1e6));
    try {
      const esiti = await opzioni.verificaSemi(semi, (testo, f) => { elInfo.textContent = `verifica: ${testo} · ${Math.round(f * 100)} %`; });
      const nomi = esiti[0].regole.map((r) => r.nome);
      const perRegola = nomi.map((nome) => `${nome} ${esiti.filter((x) => x.regole.find((r) => r.nome === nome)?.ok).length}/${esiti.length}`);
      const falliti = esiti.filter((x) => x.regole.some((r) => !r.ok))
        .map((x) => `${x.seme} (${x.regole.filter((r) => !r.ok).map((r) => r.testo).join('; ')})`);
      esitoSemi = `verifica su ${esiti.length} semi: ${perRegola.join(', ')}` + (falliti.length ? ` · non superati: ${falliti.join(', ')}` : ' · tutti superati');
      console.info('[verifica semi]', esiti);
    } catch (err) {
      esitoSemi = `verifica su più semi non riuscita: ${err.message}`;
    } finally {
      b.disabled = false;
      if (carta) { disegnaIstogramma(); ridisegna(); }
    }
  });
  const btnTavullia = el.querySelector('.tavullia');
  if (opzioni.onTavullia) btnTavullia.addEventListener('click', () => opzioni.onTavullia());
  else btnTavullia.hidden = true;
  inSeme.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') genera(inSeme.value);
    e.stopPropagation();                         // i tasti del gioco non devono scattare scrivendo
  });
  window.addEventListener('resize', adatta);

  // ─── Zoom (rotella, attorno al cursore), trascinamento e clic ───
  canvas.addEventListener('wheel', (e) => {
    if (!carta) return;
    e.preventDefault();
    const [x, y] = inKm(e);
    vista.z *= e.deltaY < 0 ? 1.25 : 1 / 1.25;
    vista.z = Math.min(ZOOM_MAX, Math.max(1, vista.z));
    // Il punto sotto il cursore resta sotto il cursore.
    const r = canvas.getBoundingClientRect(), s = scala();
    vista.cx = x - ((e.clientX - r.left) * dpr - larghezza / 2) / s;
    vista.cy = y - ((e.clientY - r.top) * dpr - altezza / 2) / s;
    limitaVista();
    ridisegnaPresto();
  }, { passive: false });

  let trascina = null;                           // { x, y, cx, cy, mosso }
  canvas.addEventListener('pointerdown', (e) => {
    if (!carta || e.button !== 0) return;
    trascina = { x: e.clientX, y: e.clientY, cx: vista.cx, cy: vista.cy, mosso: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!carta) return;
    if (trascina) {
      const dx = e.clientX - trascina.x, dy = e.clientY - trascina.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) trascina.mosso = true;
      if (trascina.mosso) {
        const s = scala() / dpr;
        vista.cx = trascina.cx - dx / s;
        vista.cy = trascina.cy - dy / s;
        limitaVista();
        ridisegnaPresto();
        canvas.style.cursor = 'grabbing';
      }
    }
    const [xf, yf] = inKm(e);
    const x = Math.floor(xf), y = Math.floor(yf);
    if (x < 0 || y < 0 || x >= carta.cols || y >= carta.rows) { elCursore.innerHTML = '&nbsp;'; return; }
    const i = y * carta.cols + x;
    const q = carta.quota[i];
    const X = xf * carta.cella, Z = yf * carta.cella;
    const esatta = carta.mare[i] ? '' : `quota nella Scena ${fmt(quotaFinale(carta, X, Z))} m · `;
    elCursore.textContent = `${fmt(xf, 2)}, ${fmt(yf, 2)} km (da ovest, da nord) · cella ${x}, ${y} · `
      + (carta.acque?.[i] === ACQUA.LAGO ? `lago, superficie a ${fmt(carta.livelloAcqua[i])} m, fondo a ${fmt(q)} m`
        : carta.acque?.[i] === ACQUA.LAGO_COSTIERO ? `lago costiero, fondo a ${fmt(-q)} m sotto il livello del mare`
          : carta.mare[i] ? `mare, profondità ${fmt(-q)} m`
            : roccaSotto(xf, yf) + gruppoSotto(xf, yf) + `${esatta}quota della cella ${fmt(q)} m (${fasciaDi(q)})`
              + (carta.bioma ? ` · ${NOMI_BIOMI[carta.bioma[i]]} · ${fmt(carta.temperatura[i], 1)} °C · umidità ${fmt(carta.umidita[i] * 100)} %` : '')
              + ` · catena ${fmt(carta.catena[i], 2)}`
              + (carta.bacino?.[i] >= carta.sogliaFiume ? ` · fiume, bacino ${fmt(carta.bacino[i])} km²` : ''));
  });
  /** Rocca entro ~1,5 km dal puntatore (o 8 pixel, se di più): classe, carattere e misure del sito. */
  function roccaSotto(x, y) {
    if (!carta.luoghi) return '';
    const raggio = Math.max(1.5, 8 * dpr / scala());
    for (const v of carta.valichi ?? []) {
      const dx = v.x - x, dy = v.y - y;
      if (dx * dx + dy * dy > raggio * raggio) continue;
      return `valico ${v.id + 1} a ${fmt(v.quota)} m, ${fmt(v.sopra)} m sopra i fondovalle (${fmt(v.valli[0].quota)} e ${fmt(v.valli[1].quota)} m),`
        + ` giro per le valli ${v.deviazione === Infinity ? 'nessuno (foci diverse)' : fmt(v.deviazione) + ' km'},`
        + ` ${v.presidio ? 'con sentinella' : 'senza sentinella'} · `;
    }
    for (const l of carta.luoghi) {
      const dx = l.x / carta.cella - x, dy = l.z / carta.cella - y;
      if (dx * dx + dy * dy > raggio * raggio) continue;
      const tipo = (l.tipo ?? 'rocca') === 'rocca' ? 'rocca' : `${NOMI_SITI[l.tipo]} (dalla rocca)`;
      return `${tipo} ${l.id + 1}${l.partenza ? ' (partenza)' : ''}: ${CLASSI_ROCCA[l.classe][0]}, ${l.carattere}, cima ${fmt(l.quota)} m,`
        + ` borgo ${fmt(l.quotaBorgo)} m, dominanza ${fmt(l.dominanza)} m, lavoro di terra ${fmt(l.dislivelli.rocca, 1)} / ${fmt(l.dislivelli.borgo, 1)} m,`
        + ` pendenza ${fmt(l.pendenza, 1)}°, fiume a ${l.fiume.distanza === Infinity ? '> 6' : fmt(l.fiume.distanza, 1)} km,`
        + ` valico a ${l.valico === Infinity ? '-' : fmt(l.valico)} km · `;
    }
    const vicino = Math.max(0.6, 6 * dpr / scala());
    for (const st of carta.siti ?? []) {
      const dx = st.x / carta.cella - x, dy = st.z / carta.cella - y;
      if (dx * dx + dy * dy > vicino * vicino) continue;
      return `${NOMI_SITI[st.tipo]} ${st.id + 1}${st.variante ? ` (${st.variante})` : ''}`
        + `${st.dimensione ? ` (${st.dimensione === 'villaggio' ? 'villaggio con pieve e locanda' : 'frazione'})` : ''}`
        + `, ${fmt(st.quota)} m, pendenza ${fmt(st.pendenza * 100)} % · `;
    }
    return '';
  }
  function gruppoSotto(x, y) {
    if (!carta.massicci) return '';
    const g = profiloMassicci(carta.massicci, x, y);
    return g.gruppo >= 0 ? `gruppo montuoso ${g.gruppo + 1} (${g.forma}) · ` : '';
  }
  const fine = (e) => {
    if (!trascina) return;
    const mosso = trascina.mosso;
    trascina = null;
    canvas.style.cursor = '';
    if (mosso || e.type !== 'pointerup' || !opzioni.onScegli) return;
    // Clic senza trascinamento: entra nella Scena centrata nel punto esatto (km, non il centro della cella).
    const [x, y] = inKm(e);
    if (x < 0 || y < 0 || x >= carta.cols || y >= carta.rows) return;
    // Acqua o terra dal rilievo fine (griglia G1), lo stesso disegnato e delle Scene: prima la cella di 1 km diceva «mare»
    // anche dove la Carta zoomata mostrava terra (segnalato dall'utente).
    if (acquaNelPunto(carta, x, y)) { elCursore.textContent = 'È acqua: scegli un punto di terra.'; return; }
    opzioni.onScegli(carta, x, y);
  };
  canvas.addEventListener('pointerup', fine);
  canvas.addEventListener('pointercancel', fine);
  canvas.addEventListener('pointerleave', () => { if (!trascina) elCursore.innerHTML = '&nbsp;'; });

  return {
    get aperta() { return !el.hidden; },
    get carta() { return carta; },
    apri, chiudi,
    alterna() { if (el.hidden) apri(); else chiudi(); },
    genera,
  };
}
