// Knight Dawn — Web Worker del generatore del mondo (M6). Genera la Carta fuori dal filo della pagina, che
// intanto resta reattiva (schermata di caricamento), fa le verifiche e tiene una cache in IndexedDB.
//
// Messaggi in arrivo:  { id, seme, cache }            (cache: false = ignora e rigenera)
//                      { id, semi: [..] }             (verifica su più semi, senza cache: esito per regola)
// Messaggi in uscita:  { id, tipo: 'avanzamento', testo, frazione }
//                      { id, tipo: 'carta', carta }   (carta.verifiche = { fiumi, panorami }; carta.daCache)
//                      { id, tipo: 'semi', esiti }    (esiti: [{ seme, ms, regole: [{nome, ok, testo}] }])
//                      { id, tipo: 'errore', messaggio }
//
// Cache: database «knightdawn», archivio «carte», chiave «VERSIONE_GENERATORE|seme». Restano le ultime
// CACHE_MASSIMO Carte usate (~8–10 MB l'una). Non è un salvataggio: la Carta si rigenera identica dal seme.

import { generaCarta, VERSIONE_GENERATORE } from './carta.js';
import { verificaFiumi, verificaPanorami, verificaVarieta } from './verifica.js';

const CACHE_MASSIMO = 3;

function apriDB() {
  return new Promise((risolvi, rifiuta) => {
    const r = indexedDB.open('knightdawn', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('carte');
    r.onsuccess = () => risolvi(r.result);
    r.onerror = () => rifiuta(r.error);
  });
}

function richiesta(r) {
  return new Promise((risolvi, rifiuta) => { r.onsuccess = () => risolvi(r.result); r.onerror = () => rifiuta(r.error); });
}

async function leggiCache(chiave) {
  try {
    const db = await apriDB();
    const voce = await richiesta(db.transaction('carte', 'readonly').objectStore('carte').get(chiave));
    if (voce) {                                        // segna l'uso (per tenere le più recenti)
      voce.usata = Date.now();
      db.transaction('carte', 'readwrite').objectStore('carte').put(voce, chiave);
    }
    return voce ? voce.carta : null;
  } catch {
    return null;                                       // finestre private, spazio pieno: si rigenera e basta
  }
}

async function scriviCache(chiave, carta) {
  try {
    const db = await apriDB();
    const archivio = db.transaction('carte', 'readwrite').objectStore('carte');
    await richiesta(archivio.put({ carta, usata: Date.now() }, chiave));
    const chiavi = await richiesta(db.transaction('carte', 'readonly').objectStore('carte').getAllKeys());
    if (chiavi.length > CACHE_MASSIMO) {
      const tx = db.transaction('carte', 'readwrite').objectStore('carte');
      const voci = await Promise.all(chiavi.map((k) => richiesta(tx.get(k)).then((v) => [k, v ? v.usata : 0])));
      voci.sort((a, b) => b[1] - a[1]);
      const via = db.transaction('carte', 'readwrite').objectStore('carte');
      for (const [k] of voci.slice(CACHE_MASSIMO)) via.delete(k);
    }
  } catch {
    // la cache è un'ottimizzazione: se non si può scrivere, pazienza
  }
}

/** Buffer da trasferire (non copiare) alla pagina. */
function trasferibili(carta) {
  const b = [];
  for (const v of Object.values(carta)) if (ArrayBuffer.isView(v)) b.push(v.buffer);
  for (const f of carta.fiumi) b.push(f.buffer);
  return b;
}

/** Verifica automatica su più semi (passo 8): ogni regola (fiumi, punti panoramici, varietà) per seme. */
function verificaSemi(id, semi) {
  const esiti = [];
  semi.forEach((seme, k) => {
    self.postMessage({ id, tipo: 'avanzamento', testo: `seme ${seme} (${k + 1} di ${semi.length})`, frazione: k / semi.length });
    const t0 = performance.now();
    const carta = generaCarta(seme);
    const f = verificaFiumi(carta), p = verificaPanorami(carta), v = verificaVarieta(carta);
    esiti.push({ seme, ms: performance.now() - t0, regole: [
      { nome: 'fiumi', ok: f.ok, testo: f.ok ? 'fiumi in discesa, con foce' : f.errori[0] },
      { nome: 'panorami', ok: p.ok, testo: `punti panoramici: ${(p.copertura * 100).toFixed(1)} %` },
      ...v.regole,
    ] });
  });
  self.postMessage({ id, tipo: 'semi', esiti });
}

self.onmessage = async (e) => {
  const { id, seme, cache = true } = e.data;
  const avanzamento = (testo, frazione) => self.postMessage({ id, tipo: 'avanzamento', testo, frazione });
  if (e.data.semi) {
    try { verificaSemi(id, e.data.semi); } catch (err) { self.postMessage({ id, tipo: 'errore', messaggio: String(err && err.stack || err) }); }
    return;
  }
  try {
    const chiave = `${VERSIONE_GENERATORE}|${seme >>> 0}`;
    let carta = cache ? await leggiCache(chiave) : null;
    if (carta) {
      carta.daCache = true;
    } else {
      carta = generaCarta(seme, { avanzamento });
      const t0 = performance.now();
      carta.verifiche = { fiumi: verificaFiumi(carta), panorami: verificaPanorami(carta), varieta: verificaVarieta(carta) };
      carta.statistiche.msVerifiche = performance.now() - t0;
      carta.daCache = false;
      await scriviCache(chiave, carta);                // prima di trasferire i buffer (la put li copia)
    }
    avanzamento('Pronto', 1);
    self.postMessage({ id, tipo: 'carta', carta }, trasferibili(carta));
  } catch (err) {
    self.postMessage({ id, tipo: 'errore', messaggio: String(err && err.stack || err) });
  }
};
