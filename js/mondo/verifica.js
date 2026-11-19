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
  // Punti di osservazione: le cime locali (finestra 3×3 km) e un punto ogni `griglia` km anche sui versanti
  // (da un costone a metà versante si guarda a valle lontano; contando solo le cime, i fianchi delle catene
  // risultavano scoperti).
  occhio: 2, finestra: 1, griglia: 3, passo: 0.5, raggi: 16,
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
      // Candidati: cime locali (la cella più alta nella finestra attorno) e punti della griglia.
      let cima = x % P.griglia === 0 && y % P.griglia === 0 ? 'griglia' : true;
      for (let dy = -P.finestra; dy <= P.finestra && cima; dy++) {
        for (let dx = -P.finestra; dx <= P.finestra; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || (dx === 0 && dy === 0)) continue;
          if (cima === true && quota[yy * cols + xx] > quota[i]) { cima = false; break; }
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

// ─── Regole di varietà (passo 8, GDD §2 «Regole di generazione») ──────────

export const VARIETA = {
  finestra: 25, passoFinestra: 12, tipiMinimi: 3, parteTipo: 0.02, terraMinima: 0.5, estremi: 0.5,
  uniforme: 15,          // km: diametro massimo di un'area uniforme senza interruzioni
  sabbiaNeve: 4,         // km: sabbia e neve non si toccano (deciso con l'utente: niente più 80 km)
  paludeQuota: 300,      // m: nessuna palude sopra
};

/** Tipo di paesaggio di una cella (per le regole di varietà): i biomi del 2D raggruppati. */
export const TIPI = ['pianura', 'collina', 'bosco', 'montagna', 'neve', 'deserto', 'palude', 'acqua', 'roccia'];
export function tipoPaesaggio(bioma, acqua) {
  if (acqua) return 7;
  switch (bioma) {
    case 1: case 11: case 12: return 0;     // pianure
    case 3: return 1;                       // collina
    case 2: return 2;                       // foresta
    case 4: return 3;                       // montagna (pascoli d'alta quota)
    case 10: return 8;                      // roccia: creste, pareti, affioramenti
    case 7: case 8: return 4;               // neve, ghiaccio
    case 6: return 5;                       // sabbia
    case 5: return 6;                       // palude
    default: return 7;
  }
}

/** Distanza (km, metrica a scacchiera smussata 1 / √2) di ogni cella dalla più vicina sorgente. */
export function distanzaDa(cols, rows, sorgente) {
  const n = cols * rows, d = new Float32Array(n).fill(1e9);
  for (let i = 0; i < n; i++) if (sorgente(i)) d[i] = 0;
  const D = Math.SQRT2;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (y > 0) {
      d[i] = Math.min(d[i], d[i - cols] + 1);
      if (x > 0) d[i] = Math.min(d[i], d[i - cols - 1] + D);
      if (x < cols - 1) d[i] = Math.min(d[i], d[i - cols + 1] + D);
    }
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
    const i = y * cols + x;
    if (x < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (y < rows - 1) {
      d[i] = Math.min(d[i], d[i + cols] + 1);
      if (x < cols - 1) d[i] = Math.min(d[i], d[i + cols + 1] + D);
      if (x > 0) d[i] = Math.min(d[i], d[i + cols - 1] + D);
    }
  }
  return d;
}

/**
 * Tipi di paesaggio per cella e distanza di ogni cella dall'interruzione più vicina (un altro tipo, un fiume, un
 * lago, il mare): due volte la distanza è il diametro dell'area uniforme che la contiene.
 */
export function uniformita(carta) {
  const { cols, rows, bioma, mare, acque, bacino, sogliaFiume } = carta;
  const n = cols * rows, tipo = new Uint8Array(n);
  for (let i = 0; i < n; i++) tipo[i] = tipoPaesaggio(bioma[i], mare[i] || (acque && acque[i] !== 0));
  const bordo = (i) => {
    if (tipo[i] === 7 || (bacino && bacino[i] >= sogliaFiume)) return true;
    const x = i % cols;
    return (x > 0 && tipo[i - 1] !== tipo[i]) || (x < cols - 1 && tipo[i + 1] !== tipo[i])
      || (i >= cols && tipo[i - cols] !== tipo[i]) || (i < n - cols && tipo[i + cols] !== tipo[i]);
  };
  return { tipo, distanza: distanzaDa(cols, rows, bordo) };
}

/**
 * Verifica delle regole di varietà del GDD su una Carta con i biomi.
 * @returns {{ ok: boolean, regole: {nome: string, ok: boolean, testo: string}[], peggiori: object }}
 */
export function verificaVarieta(carta) {
  const V = VARIETA, { cols, rows, bioma, quota } = carta;
  if (!bioma) return { ok: false, regole: [{ nome: 'biomi', ok: false, testo: 'Carta senza biomi' }] };
  const { tipo, distanza } = uniformita(carta);
  const regole = [];
  // 1. Finestre di 40×40 km: almeno 3 tipi di paesaggio (fuori dalle zone estreme e dal mare aperto).
  let finestre = 0, buone = 0;
  const cattive = [];
  const F = V.finestra, conta = new Int32Array(TIPI.length);
  for (let y0 = 0; y0 + F <= rows; y0 += V.passoFinestra) {
    for (let x0 = 0; x0 + F <= cols; x0 += V.passoFinestra) {
      conta.fill(0);
      for (let y = y0; y < y0 + F; y++) for (let x = x0; x < x0 + F; x++) conta[tipo[y * cols + x]]++;
      const terra = F * F - conta[7];
      if (terra < V.terraMinima * F * F || conta[4] + conta[5] > V.estremi * terra) continue;
      finestre++;
      let tipi = 0;
      for (let t = 0; t < TIPI.length; t++) if (conta[t] >= V.parteTipo * F * F) tipi++;
      if (tipi >= V.tipiMinimi) buone++; else cattive.push([x0 + F / 2, y0 + F / 2, tipi]);
    }
  }
  regole.push({ nome: 'finestre', ok: buone === finestre,
    testo: `finestre di ${F}×${F} km con almeno ${V.tipiMinimi} tipi di paesaggio: ${buone} su ${finestre}` });
  // 2. Aree uniformi: diametro massimo senza interruzioni (neve, deserto e roccia esclusi: zone estreme e rupi).
  let dMax = 0, dove = null;
  for (let i = 0; i < cols * rows; i++) {
    if (tipo[i] === 4 || tipo[i] === 5 || tipo[i] === 7 || tipo[i] === 8) continue;
    if (distanza[i] > dMax) { dMax = distanza[i]; dove = [i % cols, (i / cols) | 0, TIPI[tipo[i]]]; }
  }
  regole.push({ nome: 'uniforme', ok: 2 * dMax <= V.uniforme,
    testo: `area uniforme più ampia: ${(2 * dMax).toFixed(0)} km (${dove ? dove[2] : '-'}; regola ≤ ${V.uniforme} km)` });
  // 3. Deserto lontano dalla neve.
  const dNeve = distanzaDa(cols, rows, (i) => tipo[i] === 4);
  let minDN = Infinity, deserto = 0;
  for (let i = 0; i < cols * rows; i++) if (tipo[i] === 5) { deserto++; if (dNeve[i] < minDN) minDN = dNeve[i]; }
  regole.push({ nome: 'sabbiaNeve', ok: minDN >= V.sabbiaNeve,
    testo: deserto ? `sabbia–neve: ${minDN > 1e8 ? 'niente neve' : minDN.toFixed(0) + ' km'} (regola ≥ ${V.sabbiaNeve} km)` : 'sabbia–neve: niente sabbia' });
  // 4. Niente palude in quota.
  let paludiAlte = 0;
  for (let i = 0; i < cols * rows; i++) if (tipo[i] === 6 && quota[i] > V.paludeQuota) paludiAlte++;
  regole.push({ nome: 'paludeQuota', ok: paludiAlte === 0, testo: `paludi sopra ${V.paludeQuota} m: ${paludiAlte}` });
  // 5. Valichi: le creste aspre (invalicabili) non separano parti della stessa terraferma.
  if (carta.asprezza) {
    const separate = partiSeparate(carta);
    regole.push({ nome: 'valichi', ok: separate === 0,
      testo: `gruppi montuosi ${carta.massicci?.length ?? '?'} con ${carta.statistiche?.valichi ?? '?'} forcelle, parti di terra chiuse dalle pareti ${separate}` });
  }
  return { ok: regole.every((r) => r.ok), regole, peggiori: { finestre: cattive, uniforme: dove } };
}

/** Parti della terra percorribile (asprezza ≤ 0,5) separate dal resto della loro terraferma dalle creste aspre. */
function partiSeparate(carta) {
  const { cols, rows, mare, acque, asprezza } = carta, n = cols * rows;
  const terra = (i) => !mare[i] && (!acque || acque[i] === 0);
  const etichetta = (passa) => {
    const comp = new Int32Array(n).fill(-1), coda = new Int32Array(n);
    let c = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (comp[s0] >= 0 || !passa(s0)) continue;
      let t = 0, f = 0; coda[f++] = s0; comp[s0] = c;
      while (t < f) {
        const i = coda[t++], x = i % cols;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const j = i + b * cols + a, xx = x + a;
          if ((!a && !b) || xx < 0 || xx >= cols || j < 0 || j >= n || comp[j] >= 0 || !passa(j)) continue;
          comp[j] = c; coda[f++] = j;
        }
      }
      c++;
    }
    return comp;
  };
  const terre = etichetta(terra), perc = etichetta((i) => terra(i) && asprezza[i] <= 0.5);
  const parti = new Map();                       // terraferma → insieme delle parti percorribili
  for (let i = 0; i < n; i++) {
    if (perc[i] < 0) continue;
    let s = parti.get(terre[i]);
    if (!s) parti.set(terre[i], (s = new Set()));
    s.add(perc[i]);
  }
  let separate = 0;
  for (const s of parti.values()) separate += s.size - 1;
  return separate;
}

/**
 * Siti delle rocche (M7, `carta.luoghi`): almeno 2, ciascuno su terra (non mare né lago), lontano dalle pareti
 * dei gruppi montuosi, dai fiumi e dai bordi, con lavoro di terra e pendenza entro i limiti, a ≥ 10 km l'uno
 * dall'altro (la scelta parte da 20 km e scende a scalini solo se serve). Controlla le celle della Carta da sé,
 * senza fidarsi delle misure del generatore, tranne quelle che richiedono la quota del mondo.
 * @returns {{ ok: boolean, testo: string, errori: string[] }}
 */
export function verificaLuoghi(carta, limiti = { asprezza: 0.2, bordo: 7, fiume: 0.9, distanza: 10, rocca: 12, borgo: 30, pendenza: 15 }) {
  const L = carta.luoghi, errori = [];
  if (!L) return { ok: false, testo: 'Carta senza luoghi', errori: ['Carta senza luoghi'] };
  if (L.length < 2) errori.push(`solo ${L.length} siti`);
  const { cols, rows, cella, mare, acque, asprezza } = carta;
  for (const l of L) {
    const c = Math.floor(l.x / cella), r = Math.floor(l.z / cella), i = r * cols + c, nome = `sito ${l.id + 1}`;
    if (c < limiti.bordo || r < limiti.bordo || c >= cols - limiti.bordo || r >= rows - limiti.bordo) errori.push(`${nome} vicino al bordo`);
    else if (mare[i] || (acque && acque[i] !== ACQUA.TERRA)) errori.push(`${nome} in acqua`);
    else if (asprezza && asprezza[i] > limiti.asprezza) errori.push(`${nome} sulle pareti`);
    if (!(l.fiume.distanza >= (l.carattere === 'valle' ? 0.35 : limiti.fiume))) errori.push(`${nome} a ${l.fiume.distanza.toFixed(2)} km da un fiume`);
    if (l.dislivelli.rocca > limiti.rocca || l.dislivelli.borgo > limiti.borgo) errori.push(`${nome}: troppo lavoro di terra`);
    if (l.pendenza > limiti.pendenza) errori.push(`${nome}: pendenza ${l.pendenza.toFixed(1)}°`);
    // Passo 2 (terrapieno): piani presenti, scarpate percorribili, piano più basso sopra l'acqua vicina.
    if (!l.piani || !l.piani.length) errori.push(`${nome} senza terrapieno`);
    else {
      const basso = Math.min(...l.piani.map((p) => p.q));
      if (l.terrapieno.pelo !== null && basso < l.terrapieno.pelo + 6 - 0.01) errori.push(`${nome}: borgo a ${(basso - l.terrapieno.pelo).toFixed(1)} m sull'acqua`);
      if (l.terrapieno.pendenza > 26) errori.push(`${nome}: scarpate a ${l.terrapieno.pendenza.toFixed(0)}°`);
    }
  }
  let dMin = Infinity;
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    dMin = Math.min(dMin, Math.hypot(L[a].x - L[b].x, L[a].z - L[b].z) / cella);
  }
  if (dMin < limiti.distanza) errori.push(`siti a ${dMin.toFixed(1)} km`);
  const caratteri = [...new Set(L.map((l) => l.carattere))].join(', ');
  // Castello di valle (deciso con l'utente): se il mondo ha montagne, almeno un sito a ≤ 5 km da un crinale.
  const montagne = carta.quota.some((q, i) => !carta.mare[i] && q >= 1500);
  if (montagne && !L.some((l) => l.crinale <= 5)) errori.push('nessun castello a ≤ 5 km da un crinale');
  const V = carta.valichi ?? [];
  return {
    ok: errori.length === 0, errori,
    testo: errori.length ? errori[0] : `rocche ${L.length} (${caratteri}), distanza minima ${dMin === Infinity ? '-' : dMin.toFixed(0) + ' km'}`
      + ` · valichi ${V.length}, con sentinella ${V.filter((v) => v.presidio).length}`,
  };
}
