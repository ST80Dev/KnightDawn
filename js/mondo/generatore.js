// Knight Dawn — generazione della Carta dalla pagina (M6): la chiede al Web Worker (lavoratore.js), che
// lavora fuori dal filo della pagina e tiene una cache in IndexedDB. Se il Worker non parte (browser senza
// Worker in moduli ES), genera qui, dopo aver lasciato disegnare la schermata di caricamento.

import { generaCarta } from './carta.js';
import { verificaFiumi, verificaPanorami, verificaVarieta, verificaLuoghi, verificaAccessi } from './verifica.js';
import { aggiungiLuoghi } from './luoghi.js';
import { aggiungiStrade, precalcolaStrade, aggiungiTraghetti } from './strade.js';
import { grigliaMondo, fiumiFini, terrenoBase } from './scena.js';
import { aggiungiSiti, completaSiti, verificaSiti } from './siti.js';

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
      else if (m.tipo === 'semi') { attese.delete(m.id); a.risolvi(m.esiti); }
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
  const carta = fiumiFini(generaCarta(seme, { avanzamento }));
  aggiungiLuoghi(carta);
  terrenoBase(carta);
  completaSiti(aggiungiStrade(aggiungiSiti(carta)));
  aggiungiTraghetti(carta);                         // tratte via acqua fra approdi dello stesso lago
  precalcolaStrade(carta);                          // tracciato fine di tutte le strade (G6), come nel Worker
  carta.griglia = grigliaMondo(carta);              // griglia fine (G1), come nel Worker
  carta.statistiche.msTerrenoBase = carta.terrenoBase.ms;   // prima di liberarlo: serve al conto delle fasi
  carta.terrenoBase = null;                         // servito a strade e griglia: 25 MB da liberare
  carta.verifiche = { fiumi: verificaFiumi(carta), panorami: verificaPanorami(carta), varieta: verificaVarieta(carta),
    luoghi: verificaLuoghi(carta), siti: verificaSiti(carta), accessi: verificaAccessi(carta) };
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

/**
 * Verifica automatica su più semi (passo 8), nel Worker: per ogni seme l'esito di ogni regola.
 * @param {number[]} semi
 * @param {(testo:string, frazione:number) => void} [avanzamento]
 * @returns {Promise<{seme:number, ms:number, regole:{nome:string, ok:boolean, testo:string}[]}[]>}
 */
export function verificaSemi(semi, avanzamento) {
  const w = avviaLavoratore();
  if (!w) return Promise.reject(new Error('serve il Web Worker'));
  return new Promise((risolvi, rifiuta) => {
    const id = prossimoId++;
    attese.set(id, { risolvi, rifiuta, avanzamento });
    w.postMessage({ id, semi });
  });
}
