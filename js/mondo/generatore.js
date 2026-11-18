// Knight Dawn — generazione della Carta dalla pagina (M6): la chiede al Web Worker (lavoratore.js), che
// lavora fuori dal filo della pagina e tiene una cache in IndexedDB. Se il Worker non parte (browser senza
// Worker in moduli ES), genera qui, dopo aver lasciato disegnare la schermata di caricamento.

import { generaCarta } from './carta.js';
import { verificaFiumi, verificaPanorami } from './verifica.js';

let lavoratore = null;
let senzaWorker = false;
let prossimoId = 1;
const attese = new Map();               // id → { risolvi, rifiuta, avanzamento }

function avviaLavoratore() {
  if (lavoratore || senzaWorker) return lavoratore;
  try {
    lavoratore = new Worker(new URL('./lavoratore.js', import.meta.url), { type: 'module' });
    lavoratore.onmessage = (e) => {
      const m = e.data, a = attese.get(m.id);
      if (!a) return;
      if (m.tipo === 'avanzamento') a.avanzamento?.(m.testo, m.frazione);
      else if (m.tipo === 'carta') { attese.delete(m.id); a.risolvi(m.carta); }
      else { attese.delete(m.id); a.rifiuta(new Error(m.messaggio)); }
    };
    lavoratore.onerror = (e) => {                     // il Worker non è partito: si genera nella pagina
      console.warn('[generatore] Web Worker non disponibile, genero nella pagina:', e.message);
      e.preventDefault?.();
      senzaWorker = true;
      lavoratore = null;
      for (const [id, a] of attese) { attese.delete(id); generaQui(a.seme, a.avanzamento).then(a.risolvi, a.rifiuta); }
    };
  } catch (err) {
    console.warn('[generatore] Web Worker non disponibile:', err);
    senzaWorker = true;
    lavoratore = null;
  }
  return lavoratore;
}

async function generaQui(seme, avanzamento) {
  avanzamento?.('Generazione del mondo', 0);
  await new Promise((r) => setTimeout(r, 30));      // lascia disegnare la schermata
  const carta = generaCarta(seme, { avanzamento });
  carta.verifiche = { fiumi: verificaFiumi(carta), panorami: verificaPanorami(carta) };
  carta.daCache = false;
  return carta;
}

/**
 * Carta per un seme, con le verifiche.
 * @param {number} seme
 * @param {{ avanzamento?: (testo:string, frazione:number) => void, cache?: boolean }} opzioni
 * @returns {Promise<object>}
 */
export function generaCartaAsincrona(seme, opzioni = {}) {
  const w = avviaLavoratore();
  if (!w) return generaQui(seme, opzioni.avanzamento);
  return new Promise((risolvi, rifiuta) => {
    const id = prossimoId++;
    attese.set(id, { risolvi, rifiuta, avanzamento: opzioni.avanzamento, seme });
    w.postMessage({ id, seme, cache: opzioni.cache !== false });
  });
}
