// FERRO & CENERE — configurazione globale
// Palette e costanti derivate da docs/GRAFICA.md

const PALETTE = {
  // Pergamena (mappa top-down)
  pergChiara:    '#d8c8a0',
  pergMedia:     '#c8aa6a',
  pergScura:     '#b09050',
  pergMacchia:   '#9a7a3a',
  inkLeggero:    '#7a5a2a',
  inkMedio:      '#5a3a18',
  inkScuro:      '#3a2010',
  inkNero:       '#1a0e04',

  verdeBosco:    '#2a5a18',
  verdeBoscoSc:  '#1a3a10',
  verdePalude:   '#3a5a2a',
  sabbia:        '#c8a870',

  bluFiume:      '#3a6a9a',
  bluFiumeCh:    '#4a80b4',

  marrMontagna:  '#6a5a3a',
  marrMontCh:    '#7a6a48',
  neveCime:      '#e8e0d0',
  ghiaccio:      '#bcd0d8',

  rossoBandiera: '#8a1010',
  rossoBandCh:   '#aa1818',

  grigioPietra:  '#8a7a5a',
  grigioPietraSc:'#6a5a40',
  marrTetto:     '#6a3a18',

  cavMarker:     '#cc2020',

  // HUD
  hudSfondo:     '#1e1008',
  hudSfondoAlt:  '#120c04',
  hudBordo:      '#5a3a18',
  hudBordoLuce:  '#8a6030',
  hudTitolo:     '#c8a030',
  hudEvento:     '#c87020',
  hudNormale:    '#8a5a20',
  hudDim:        '#5a3a18',
  hudMorto:      '#3a2210',
};

// Tile e zoom
const TILE_BASE = 16;
const ZOOM_LEVELS = [4, 8, 16, 32]; // livelli semantici di riferimento (GRAFICA.md)

// Dimensioni del mondo (griglia di tile)
const WORLD_W = 160;
const WORLD_H = 120;

// Zoom mappa: passi discreti ravvicinati (px per tile), NON i 4 livelli
// semantici regione/zona/locale. Lo zoom è centrato sul centro camera, che
// l'utente sposta liberamente col pan.
const MAP_ZOOM_STEPS = [3, 4, 5, 6, 8, 10, 13, 16, 20, 26, 32];
const MAP_ZOOM_DEFAULT = 5; // indice → 10 px/tile

// Rendering pixel-art:
// Il canvas viene disegnato DIRETTAMENTE alle dimensioni dell'area utile del
// browser (vedi main.js) — nessun upscale/downscale che possa rovinare il
// testo. La "chunkiness" della grafica e affidata a PIXEL: tutti i primitivi
// grafici (cerchi, linee, triangoli, bordi, dithering) disegnano in blocchi
// PIXEL x PIXEL → curve e contorni "a quadrettini" visibili.
// Le dimensioni di font, pannelli, margini ecc. nelle scene passano da
// S(...) (vedi main.js) per restare proporzionate al canvas attuale.
const PIXEL = 3;

// Seed RNG semplice (mulberry32) per texture procedurali
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
