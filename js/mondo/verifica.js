// Knight Dawn — verifiche automatiche del mondo generato (M6). Modulo ES senza grafica né DOM.
// Passo 4: i fiumi scendono sempre e finiscono in mare, in un lago o oltre il confine della Carta.
// Passo 7 (da fare): regole di varietà del GDD.

import { ACQUA } from './carta.js';

// Sulle zone piatte (conche colmate) il letto è piano: ha dislivelli di millimetri dati dal riempimento.
// Una risalita fino a questa soglia conta come piano, non come errore (la massima è riportata).
export const TOLLERANZA_PIANO = 0.05;   // m

/**
 * Controlla ogni cella di fiume (bacino ≥ soglia) seguendo il flusso fino alla foce:
 *   - fuori dai laghi la quota non sale mai da una cella alla successiva (letto sempre in discesa; sulle
 *     zone piatte sono ammessi dislivelli fino a TOLLERANZA_PIANO);
 *   - il percorso finisce in mare, in un lago (anche costiero) o su un bordo di terra, senza cicli.
 * @returns {{ ok: boolean, celle: number, sorgenti: number, foci: {mare:number, lago:number, bordo:number},
 *   errori: string[], salitaMassima: number }}
 */
export function verificaFiumi(carta) {
  const { cols, rows, quota, acque, ricevente, bacino, sogliaFiume } = carta;
  const n = cols * rows;
  const fiume = (i) => acque[i] !== ACQUA.MARE && acque[i] !== ACQUA.LAGO_COSTIERO && bacino[i] >= sogliaFiume;
  const stato = new Uint8Array(n);          // 0 da vedere, 1 in corso, 2 verificata
  const percorso = [];
  const errori = [];
  const foci = { mare: 0, lago: 0, bordo: 0 };
  let celle = 0, sorgenti = 0, salitaMassima = 0;

  // Sorgenti: celle di fiume senza celle di fiume a monte.
  const haMonte = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (fiume(i) && ricevente[i] >= 0) haMonte[ricevente[i]] = 1;

  for (let s = 0; s < n; s++) {
    if (!fiume(s)) continue;
    celle++;
    if (!haMonte[s]) sorgenti++;
    if (stato[s]) continue;
    percorso.length = 0;
    let i = s;
    for (;;) {
      if (stato[i] === 2) break;
      if (stato[i] === 1) { errori.push(`ciclo nel flusso alla cella ${i % cols}, ${(i / cols) | 0}`); break; }
      stato[i] = 1;
      percorso.push(i);
      const j = ricevente[i];
      if (j < 0) {
        const t = acque[i];
        if (t === ACQUA.MARE) foci.mare++;
        else if (t === ACQUA.LAGO_COSTIERO || t === ACQUA.LAGO) foci.lago++;
        else {
          const x = i % cols, y = (i - x) / cols;
          if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) foci.bordo++;
          else errori.push(`fiume senza foce alla cella ${x}, ${y}`);
        }
        break;
      }
      if (acque[j] === ACQUA.MARE) { foci.mare++; break; }
      if (acque[j] === ACQUA.LAGO_COSTIERO) { foci.lago++; break; }
      // Letto in discesa fuori dai laghi (dentro un lago la superficie è piana e la quota è il fondo).
      if (acque[i] !== ACQUA.LAGO && acque[j] !== ACQUA.LAGO && quota[j] > quota[i]) {
        const salita = quota[j] - quota[i];
        if (salita > salitaMassima) salitaMassima = salita;
        if (salita > TOLLERANZA_PIANO && errori.length < 20) {
          errori.push(`il letto sale di ${salita.toFixed(2)} m alla cella ${j % cols}, ${(j / cols) | 0}`);
        }
      }
      i = j;
    }
    for (const k of percorso) stato[k] = 2;
  }
  return { ok: errori.length === 0, celle, sorgenti, foci, errori, salitaMassima };
}
