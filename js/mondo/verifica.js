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

// ─── Punti panoramici (regola decisa con l'utente) ─────────────────────
// Da quasi ogni punto della terra, entro PANORAMI.raggio km, c'è un'altura da cui si vede lontano: in almeno
// PANORAMI.direzioni delle direzioni (32 raggi) qualcosa tra PANORAMI.vista e PANORAMI.vista + PANORAMI.oltre
// km sporge sopra tutto ciò che sta davanti (colline e crinali lontani, non il suolo esattamente a 20 km,
// che in collina sta quasi sempre dietro un rilievo). Sulla Carta (celle da 1 km), con la curvatura della
// Terra (raggio efficace 7/6 per la rifrazione).
// La regola vale sotto PANORAMI.quotaMassima (pianura, collina, pedemonte): in montagna tra una cima e
// l'altra c'è quasi sempre un crinale più alto, ed è giusto così. «In una direzione»: basta un quarto delle
// direzioni (un settore di 90°).
export const PANORAMI = {
  raggio: 10, vista: 20, oltre: 10, direzioni: 0.25, soglia: 0.9, quotaMassima: 1500,
  occhio: 2, finestra: 2, passo: 0.5, raggi: 32,
};

/**
 * @returns {{ ok: boolean, punti: number[][], copertura: number, soglia: number, raggio: number,
 *   candidati: number }}  punti: [x, y] delle celle panoramiche; copertura: parte della terra entro raggio km
 */
export function verificaPanorami(carta) {
  const { cols, rows, quota, acque } = carta;
  const P = PANORAMI, n = cols * rows;
  const R = 6371 * 7 / 6;                                  // km
  const q = (x, y) => {                                    // m, superficie (acqua a quota 0)
    const c = Math.min(cols - 1, Math.max(0, Math.round(x - 0.5))), r = Math.min(rows - 1, Math.max(0, Math.round(y - 0.5)));
    const i = r * cols + c;
    return acque[i] === ACQUA.MARE || acque[i] === ACQUA.LAGO_COSTIERO ? 0 : acque[i] === ACQUA.LAGO ? carta.livelloAcqua[i] : quota[i];
  };
  const dir = Array.from({ length: P.raggi }, (_, k) => [Math.cos(2 * Math.PI * k / P.raggi), Math.sin(2 * Math.PI * k / P.raggi)]);
  const punti = [];
  let candidati = 0;
  const panoramica = new Uint8Array(n);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (acque[i]) continue;
      // Candidati: cime locali (la cella più alta nella finestra attorno).
      let cima = true;
      for (let dy = -P.finestra; dy <= P.finestra && cima; dy++) {
        for (let dx = -P.finestra; dx <= P.finestra; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || (dx === 0 && dy === 0)) continue;
          if (quota[yy * cols + xx] > quota[i]) { cima = false; break; }
        }
      }
      if (!cima) continue;
      candidati++;
      const occhio = quota[i] + P.occhio;
      let visibili = 0;
      for (const [ux, uy] of dir) {
        let davanti = -Infinity, lontano = -Infinity;
        for (let s = P.passo; s <= P.vista + P.oltre + 1e-9; s += P.passo) {
          const h = q(x + 0.5 + ux * s, y + 0.5 + uy * s) - s * s / (2 * R) * 1000;
          const pendenza = (h - occhio) / (s * 1000);
          if (s < P.vista) { if (pendenza > davanti) davanti = pendenza; } else if (pendenza > lontano) lontano = pendenza;
        }
        if (lontano > davanti) visibili++;
      }
      if (visibili >= P.direzioni * P.raggi) { panoramica[i] = 1; punti.push([x, y]); }
    }
  }
  // Copertura: terra entro P.raggio km (8 vicini) da una cella panoramica.
  const d = new Int32Array(n).fill(-1), coda = new Int32Array(n);
  let testa = 0, fine = 0;
  for (let i = 0; i < n; i++) if (panoramica[i]) { d[i] = 0; coda[fine++] = i; }
  while (testa < fine) {
    const i = coda[testa++], x = i % cols, y = (i - x) / cols;
    if (d[i] >= P.raggio) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const j = yy * cols + xx;
        if (d[j] < 0) { d[j] = d[i] + 1; coda[fine++] = j; }
      }
    }
  }
  let terra = 0, coperta = 0, terraM = 0, copertaM = 0;
  for (let i = 0; i < n; i++) {
    if (acque[i]) continue;
    if (quota[i] < P.quotaMassima) { terra++; if (d[i] >= 0) coperta++; } else { terraM++; if (d[i] >= 0) copertaM++; }
  }
  const copertura = terra ? coperta / terra : 0;
  return { ok: copertura >= P.soglia, punti, copertura, coperturaMontagna: terraM ? copertaM / terraM : 0,
    soglia: P.soglia, raggio: P.raggio, quotaMassima: P.quotaMassima, candidati };
}
