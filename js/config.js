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

  bluFiume:      '#3a6a9a',
  bluFiumeCh:    '#4a80b4',

  marrMontagna:  '#6a5a3a',
  marrMontCh:    '#7a6a48',
  neveCime:      '#e8e0d0',

  rossoBandiera: '#8a1010',
  rossoBandCh:   '#aa1818',

  grigioPietra:  '#8a7a5a',
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
const ZOOM_LEVELS = [4, 8, 16, 32];

// Risoluzione interna del rendering pixel-art.
// Tutto viene disegnato a questa risoluzione, poi upscalato nearest-neighbor
// sul canvas visibile. Cambiare qui per pixel più grandi (valori più bassi)
// o più piccoli (valori più alti).
// 640x360 = pixel art moderna, più fine di Monkey Island (320x200).
// Risoluzione interna alta per ospitare HUD con molte info,
// ma i primitivi grafici disegnano in blocchi PIXEL×PIXEL per mantenere
// l'aspetto "a quadratini" sulle curve e i contorni.
const INTERNAL_W = 1280;
const INTERNAL_H = 720;
const PIXEL = 3; // dimensione del "pixel logico" per la grafica chunky

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
