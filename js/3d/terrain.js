// Knight Dawn — terreno 3D (milestone M1)
// Carica la heightmap reale (assets/terrain/<nome>.bin + .json) oppure, se manca, genera un
// terreno collinare procedurale con la stessa griglia. Costruisce una mesh low-poly a facce
// piatte, colorata per faccia in base ad altitudine e pendenza, ed espone le query di quota.
//
// Coordinate: 1 unità = 1 m, Y in alto = quota reale s.l.m., origine al centro dell'area.
// Colonna 0 = ovest (x = -size/2), riga 0 = nord (z = -size/2): il nord è verso -Z.
//
// Ogni cella è divisa in due triangoli lungo la diagonale NE–SO. getHeight() interpola sul
// triangolo effettivamente disegnato (non in bilineare), così ciò che sta sul terreno
// combacia esattamente con la superficie visibile.
//
// Mondo generato (M6, passo 7): colori per vertice dal bioma delle celle della Carta (sfumati, bordi
// irregolari), dalla pendenza e dal limite delle nevi della stagione; normali lisce. Niente più chiazze a
// triangoli: la stessa funzione colora il blocco e l'orizzonte (coloreMondo). Tavullia resta com'era.

import * as THREE from 'three';
import { BIOMA, CLIMA } from '../mondo/carta.js';
import { smoothstep, completa } from '../mondo/rumore.js';
import { COPERTURA, coperturaMondo, nuovaCopertura, campagnaMondo, PARCELLE, PERM_CAMPI, CASE_CAMPAGNA, LATO_FONDI } from '../mondo/vegetazione.js';

const PAL = (typeof PALETTE !== 'undefined') ? PALETTE : {};

// Colori del terreno (adattati alla luce 3D, ispirati alla PALETTE di config.js)
const COL = {
  fondovalle: new THREE.Color('#76a043'),          // campi di fondovalle, più verdi
  prato:      new THREE.Color(PAL.verdePrato || '#9ec060').lerp(new THREE.Color(PAL.pianuraSud || '#d4bc84'), 0.3).multiplyScalar(0.87),
  pratoAlto:  new THREE.Color('#ab9c55'),          // crinali, stoppie e grano: più ocra
  bosco:      new THREE.Color('#3f6428'),
  roccia:     new THREE.Color(PAL.grigioPietra || '#8a7a5a').lerp(new THREE.Color('#b0a080'), 0.3),
  bordo:      new THREE.Color(PAL.inkLeggero || '#7a5a2a'),
};

// Soglie di pendenza (gradi) per il passaggio prato → bosco → roccia
const PENDENZA_BOSCO = [13, 24];
const PENDENZA_ROCCIA = [30, 40];
const VARIAZIONE_FACCIA = 0.05;   // ± luminosità casuale per faccia (look low-poly)
const RIGHE_PEZZO = 8;            // righe di vertici per pezzo di createTerrainAPezzi (M7, passo 9)
const PROFONDITA_BORDO = 25;      // m sotto la quota minima a cui scendono i lati del blocco

// Griglia del fallback (uguale a quella prevista per i dati reali)
const FALLBACK_META = {
  name: 'procedurale', cols: 257, rows: 257, cellSize: 2000 / 256, sizeMeters: 2000,
  source: 'procedurale (dati reali non trovati)',
};

// ─── Caricamento ────────────────────────────────────────────────────────

/**
 * Carica il terreno e restituisce l'oggetto Terrain (vedi createTerrain).
 * Se i file mancano o non sono validi usa il terreno procedurale (isFallback = true).
 */
export async function loadTerrain(name = 'tavullia', basePath = 'assets/terrain/') {
  try {
    const [metaRes, binRes] = await Promise.all([
      fetch(`${basePath}${name}.json`),
      fetch(`${basePath}${name}.bin`),
    ]);
    if (!metaRes.ok || !binRes.ok) throw new Error(`HTTP ${metaRes.status}/${binRes.status}`);
    const meta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    const n = meta.cols * meta.rows;
    if (buf.byteLength !== n * 2) throw new Error(`dimensione .bin errata: ${buf.byteLength} byte, attesi ${n * 2}`);

    const view = new DataView(buf);
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) heights[i] = view.getUint16(i * 2, true) / 10;   // decimetri → metri
    return createTerrain(meta, heights, false);
  } catch (err) {
    console.warn(`[terreno] heightmap "${name}" non disponibile (${err.message}): uso il terreno procedurale.`);
    const meta = { ...FALLBACK_META };
    return createTerrain(meta, proceduralHeights(meta), true);
  }
}

// ─── Terreno ────────────────────────────────────────────────────────────

/**
 * Costruisce il terreno da una griglia di quote in memoria (riga per riga da nord, metri), con gli
 * stessi metadati del formato su file (cols, rows, cellSize, …): così lo usano sia la heightmap reale
 * sia il generatore del mondo (js/mondo/scena.js).
 * @returns {{
 *   mesh: THREE.Group, meta: object, isFallback: boolean,
 *   size: number, half: number, minElev: number, maxElev: number,
 *   getHeight: (x:number, z:number) => number,
 *   getSlope:  (x:number, z:number) => number,
 *   contains:  (x:number, z:number) => boolean,
 * }}
 */
export function createTerrain(meta, heights, isFallback = false, colore = null) {
  return completa(createTerrainAPezzi(meta, heights, isFallback, colore));
}

/** Come createTerrain, a pezzi (M7, passo 9): generatore con yield ogni poche righe di vertici; stesso risultato. */
export function* createTerrainAPezzi(meta, heights, isFallback = false, colore = null) {
  const { cols, rows } = meta;
  const cell = meta.cellSize;
  const size = cell * (cols - 1);
  const half = size / 2;

  let minElev = Infinity, maxElev = -Infinity;
  for (const h of heights) { if (h < minElev) minElev = h; if (h > maxElev) maxElev = h; }
  meta.minElev = minElev;
  meta.maxElev = maxElev;

  const H = (c, r) => heights[r * cols + c];

  // Trova cella e coordinate locali (u verso est, v verso sud), con clamp ai bordi.
  function locate(x, z) {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = Math.min(Math.max(fx, 0), cols - 1);
    fz = Math.min(Math.max(fz, 0), rows - 1);
    const c = Math.min(Math.floor(fx), cols - 2);
    const r = Math.min(Math.floor(fz), rows - 2);
    return { c, r, u: fx - c, v: fz - r };
  }

  /** Quota del terreno (m) nel punto (x, z), interpolata sul triangolo disegnato. */
  function getHeight(x, z) {
    const { c, r, u, v } = locate(x, z);
    const a = H(c, r), b = H(c + 1, r), d = H(c, r + 1), e = H(c + 1, r + 1);
    if (u + v <= 1) return a + (b - a) * u + (d - a) * v;            // triangolo NO: a, d, b
    return e + (d - e) * (1 - u) + (b - e) * (1 - v);                // triangolo SE: b, d, e
  }

  /** Pendenza del terreno (gradi, 0 = piano) nel punto (x, z). */
  function getSlope(x, z) {
    const { c, r, u, v } = locate(x, z);
    const a = H(c, r), b = H(c + 1, r), d = H(c, r + 1), e = H(c + 1, r + 1);
    const gx = (u + v <= 1) ? (b - a) / cell : (e - d) / cell;
    const gz = (u + v <= 1) ? (d - a) / cell : (e - b) / cell;
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }

  /** true se (x, z) è dentro l'area del terreno. */
  function contains(x, z) {
    return x >= -half && x <= half && z >= -half && z <= half;
  }

  const mesh = new THREE.Group();
  mesh.name = 'terreno';
  mesh.add(colore
    ? yield* buildSurfaceMondo(heights, cols, rows, cell, half, colore, meta.centroMondo)
    : buildSurface(heights, cols, rows, cell, half, minElev, maxElev));
  mesh.add(buildSkirt(heights, cols, rows, cell, half, minElev - PROFONDITA_BORDO));

  return { mesh, meta, heights, isFallback, size, half, minElev, maxElev, getHeight, getSlope, contains };
}

// ─── Colori del mondo generato (passo 7) ────────────────────────────────

// Colori dei biomi nelle Scene (tarati sulla luce 3D; più tenui della Carta).
const COLORI_SCENA = [];
COLORI_SCENA[BIOMA.ACQUA] = new THREE.Color('#7d8a55');          // rive e fondali bassi (sotto l'acqua)
COLORI_SCENA[BIOMA.PIANURA] = new THREE.Color('#8fae55');
COLORI_SCENA[BIOMA.PIANURA_N] = new THREE.Color('#9a9566');      // steppa, prati radi del nord
COLORI_SCENA[BIOMA.PIANURA_S] = new THREE.Color('#b5a868');      // prati secchi del sud
COLORI_SCENA[BIOMA.COLLINA] = new THREE.Color('#9aa65a');
COLORI_SCENA[BIOMA.FORESTA] = new THREE.Color('#41652c');
COLORI_SCENA[BIOMA.MONTAGNA] = new THREE.Color('#87975a');       // pascoli d'alta quota
COLORI_SCENA[BIOMA.ROCCIA] = new THREE.Color('#8e8678');
COLORI_SCENA[BIOMA.NEVE] = new THREE.Color('#dde3ea');
COLORI_SCENA[BIOMA.GHIACCIO] = new THREE.Color('#c3d3df');
COLORI_SCENA[BIOMA.SABBIA] = new THREE.Color('#d6bf8a');
COLORI_SCENA[BIOMA.PALUDE] = new THREE.Color('#5f7048');
COLORI_SCENA[BIOMA.FIUME] = COLORI_SCENA[BIOMA.PIANURA];
const COLORE_ROCCIA = new THREE.Color('#8f877a');
const COLORE_ROCCIA_SCURA = new THREE.Color('#6c665e');
const COLORE_GHIAIONE = new THREE.Color('#9d978b');
// Neve (docs/GRAFICA_3D.md): un bianco freddo che al sole pieno NON satura. Con '#f1f3f6' ogni faccia rivolta al sole
// usciva a 255 (misurato): salita e discesa avevano lo stesso colore, e la luce calda la rendeva color crema.
// Nel materiale per pixel (materialeSuolo) la neve vira all'azzurro-grigio delle ombre sui versanti (pendenza della
// normale del pixel) e, vicino alla camera, cumuli e onde del vento inclinano la normale: il rilievo si legge
// anche vicino al cavaliere, dove la griglia da 7,8 m è liscia. Solo luce: geometria e getHeight non cambiano.
const COLORE_NEVE = new THREE.Color('#dde3ea');
const COLORE_NEVE_VERSANTE = new THREE.Color('#9fadc2');
const NEVE_VERSANTE = [2, 24, 0.85];       // gradi di pendenza (inizio, pieno) e quanto vira al massimo
const DETTAGLIO_NEVE = [1.4, 50, 150];     // forza; pieno fino a (m dalla camera); spento a (m)
const COLORE_RADURA = new THREE.Color('#7f9f4c');
const COLORE_ALPEGGIO = new THREE.Color('#8a985c');

// Parametri del colore: sono quelli della copertura (js/mondo/vegetazione.js), condivisi con la vegetazione.
export const COLORI_MONDO = COPERTURA;

/**
 * Colore del terreno del mondo generato in un punto del mondo (x, z in metri, quota h, pendenza in gradi).
 * La copertura (bosco, radure, roccia, neve…) viene da coperturaMondo, la stessa da cui la vegetazione decide dove
 * stanno alberi, cespugli e rocce: alberi e colore dicono la stessa cosa.
 * @param {object} carta  @param {number} stagione  indice del calendario (0 primavera … 3 inverno)
 * @returns {(out: THREE.Color, x: number, z: number, h: number, pendenza: number) => THREE.Color}
 */
export function coloreMondo(carta, stagione = 0) {
  const K = COLORI_MONDO;
  const copertura = coperturaMondo(carta, stagione), cp = nuovaCopertura();
  const campagna = campagnaMondo(carta);
  const c = new THREE.Color();
  // `strati` (facoltativo): per il materiale a colore per pixel (materialeSuolo) scrive il colore prima di roccia e
  // neve (base, già con la variazione di luminosità), i pesi di roccia e neve, la variazione e il tono della roccia.
  return (out, x, z, h, pendenza, strati = null) => {
    copertura(cp, x, z, h, pendenza);
    out.setRGB(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const col = COLORI_SCENA[cp.bi[k]] || COLORI_SCENA[BIOMA.PIANURA], w = cp.w[k];
      out.r += col.r * w; out.g += col.g * w; out.b += col.b * w;
    }
    const { bosco, neveFissa } = cp;
    // Radure nel bosco; sopra il limite degli alberi il bosco lascia il posto agli alpeggi.
    if (bosco > 0) {
      if (cp.radura > 0) out.lerp(COLORE_RADURA, cp.radura * bosco * 0.8);
      if (cp.T < CLIMA.bosco + 1) out.lerp(COLORE_ALPEGGIO, bosco * cp.alpeggio);
      // Campagna attorno a rocche e borghi: il bosco è disboscato (vegetazione.js), quindi niente verde cupo del
      // bosco dove gli alberi non ci sono più; resta il prato.
      const coltivato = campagna(x, z);
      if (coltivato > 0) out.lerp(COLORE_RADURA, coltivato * bosco * (1 - cp.radura * 0.8) * 0.85);
    }
    // Toni ampi (più verde o più secco) e macchia più scura sui pendii: il rilievo si legge anche da lontano.
    const tono = cp.tono;
    if (tono > 0) out.lerp(COLORE_RADURA, tono * (1 - bosco)); else out.lerp(COLORI_SCENA[BIOMA.PIANURA_S], -tono * 0.6 * (1 - bosco));
    out.lerp(COLORI_SCENA[BIOMA.FORESTA], K.macchia[2] * (1 - bosco) * (1 - neveFissa) * cp.macchia);
    // Roccia, affioramenti e ghiaioni.
    if (cp.ghiaia > 0) out.lerp(COLORE_GHIAIONE, cp.ghiaia);
    if (strati) {
      strati.base.copy(out).multiplyScalar(cp.variazione);
      strati.roccia = cp.roccia; strati.neve = cp.neve; strati.variazione = cp.variazione; strati.tono = cp.tonoRoccia;
    }
    if (cp.roccia > 0) {
      c.copy(COLORE_ROCCIA).lerp(COLORE_ROCCIA_SCURA, cp.tonoRoccia);
      out.lerp(c, cp.roccia);
    }
    // Variazione lenta di luminosità (niente distese piatte, niente chiazze a triangoli).
    out.multiplyScalar(cp.variazione);
    // Neve: sopra il limite della stagione, non sui pendii più ripidi; sempre sulla neve perenne.
    if (cp.neve > 0) out.lerp(COLORE_NEVE, cp.neve);
    return out;
  };
}

// ─── Colore per pixel del mondo generato ────────────────────────────────
//
// Richiesto dall'utente: «i colori si sfumano nei bordi», «più vicino più definito, più lontano meno». Il colore
// per vertice (7,8 m nel blocco, 62,5–2000 m negli anelli) sfumava ogni passaggio su un triangolo intero. Ora i
// vertici portano gli strati di coloreMondo (base, roccia, neve) e il fragment shader decide pixel per pixel:
// - roccia e neve con una soglia sul peso interpolato più un rumore del mondo a più scale: bordi netti e
//   frastagliati; la soglia si allarga con fwidth (anti-alias), quindi lontano il bordo torna morbido da solo;
// - dettaglio del prato e venature della roccia: rumori da 2 m a 128 m che si spengono quando la loro
//   lunghezza d'onda scende sotto ~3 pixel (vicino definito, lontano liscio, niente sfarfallio).
// Il rumore è in coordinate del mondo e periodico su 8192 m (scale potenze di 2): blocchi diversi danno lo
// stesso disegno nello stesso punto. La copertura (coperturaMondo) resta l'unica fonte: la vegetazione la legge
// uguale; la roccia dipinta piena è dove il peso di roccia supera ~0,5 (± il rumore).
/**
 * Colore della terra battuta nel punto (x, z, quota h), dal clima del luogo [deciso con l'utente, novembre 2026: polvere
 * nel secco, più scura fino al fango nell'umido, fango chiaro al freddo come neve sciolta su terra; nessuna stagione,
 * «i biomi le rappresentano già»]. Temperatura e umidità vengono da `coperturaMondo`, interpolate: il colore cambia con
 * continuità, senza stacchi tra una cella e l'altra della Carta.
 */
export const STRADA_CLIMA = {
  polvereCalda: '#cdb98f', polvere: '#bba376', umida: '#8a7250', fango: '#9d9179',
  caldo: [12, 25], umidita: [0.32, 0.68], freddo: [8, -2], quantoFango: 0.6,
};
export function coloreStrada(carta) {
  const K = STRADA_CLIMA;
  const copertura = coperturaMondo(carta), cp = nuovaCopertura();
  const calda = new THREE.Color(K.polvereCalda), asciutta = new THREE.Color(K.polvere);
  const umida = new THREE.Color(K.umida), fango = new THREE.Color(K.fango);
  const secca = new THREE.Color();
  return (out, x, z, h) => {
    copertura(cp, x, z, h, 0);
    secca.copy(asciutta).lerp(calda, smoothstep(K.caldo[0], K.caldo[1], cp.T));
    out.copy(secca).lerp(umida, smoothstep(K.umidita[0], K.umidita[1], cp.umidita));
    const gelo = smoothstep(K.freddo[0], K.freddo[1], cp.T);
    if (gelo > 0) out.lerp(fango, gelo * K.quantoFango);
    return out;
  };
}

export const SUOLO = {
  periodo: 8192,
  // Bordo di roccia e neve: [scala (m), ampiezza]. Somma delle ampiezze ~0,6: con peso 0,2–0,8 decide il rumore.
  bordo: [[512, 0.2], [128, 0.18], [32, 0.16], [8, 0.12], [2, 0.06]],
  dettaglio: [[2, 0.16], [8, 0.13], [32, 0.09], [128, 0.06]],   // variazione di luminosità del prato
  venature: [[2, 0.35], [8, 0.4]],                             // tono della roccia (chiara/scura)
  spegni: [60, 200],     // la scala s si spegne tra 60·s e 200·s m dalla camera (~8 → ~3 pixel per onda)
};

// Ogni ottava si calcola solo dove non è già spenta: lontano il rumore fine valeva zero ma costava lo stesso
// (misurato: lo shader del suolo era circa metà del tempo di un frame). Il risultato visivo non cambia.
const ottaveGLSL = (lista, varNome) => lista.map(([s, a]) =>
  `  if (dist < ${(s * SUOLO.spegni[1]).toFixed(1)}) ${varNome} += (rumoreSuolo(p, ${s.toFixed(1)}) - 0.5) * ${a.toFixed(3)}`
  + ` * spegniSuolo(${s.toFixed(1)}, dist);`).join('\n');

/** Texture nera 1×1: ombre spente (anelli dell'orizzonte, prima che la vegetazione le disegni). */
const TEXTURE_NERA = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
TEXTURE_NERA.needsUpdate = true;
const TEXTURE_PERM_CAMPI = new THREE.DataTexture(PERM_CAMPI, 256, 1, THREE.RedFormat, THREE.UnsignedByteType);
TEXTURE_PERM_CAMPI.magFilter = TEXTURE_PERM_CAMPI.minFilter = THREE.NearestFilter;
TEXTURE_PERM_CAMPI.needsUpdate = true;

/**
 * Materiale del terreno del mondo generato a colore per pixel. La geometria deve avere gli attributi `base` (vec3)
 * e `strati` (vec4: roccia, neve, variazione, tono della roccia), oltre a `color` (colore per vertice completo, per
 * chi lo legge). (cx, cz): coordinate del mondo dell'origine della mesh.
 * Vegetazione: se la geometria ha anche `aSuolo` (vec4 per vertice: bosco sopra, vicinanza dell'acqua, campi, 1 − ghiaia; lo aggiunge
 * vegetazione3d.js al blocco) sul prato compaiono lettiera sotto il bosco (marrone chiaro e scuro, quasi nero,
 * muschio) e fango vicino all'acqua; la terra nuda a chiazze nei prati c'è ovunque (anche negli anelli). `mezzo`:
 * metà lato del blocco, negli ultimi 120 m lettiera e fango sfumano (l'orizzonte non li ha).
 */
// Rumore del suolo da texture (prestazioni, docs/GRAFICA_3D.md): una griglia 256×256 di valori casuali generata qui,
// letta con un solo campionamento bilineare spostato con la curva smoothstep (i + u + 0.5) / 256. È lo stesso rumore
// a valori di prima (valori diversi, stessa statistica) ma costa una lettura invece di 4 hash e 4 mod. Vale per le
// scale finché 256 celle dividono il periodo di 8192 m (scale ≤ 32 m): oltre, la
// texture si ripeterebbe prima del periodo e i blocchi non combacerebbero, quindi lì resta il calcolo con l'hash.
const LATO_RUMORE = 256;
let _texRumore = null;
function textureRumore(lato = LATO_RUMORE, seme = 0x9e3779b9) {
  if (lato === LATO_RUMORE && _texRumore) return _texRumore;
  const dati = new Uint8Array(lato * lato);
  let x = seme;                                         // xorshift32 con seme fisso: stesso disegno a ogni avvio
  for (let i = 0; i < dati.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    dati[i] = (x >>> 24) & 255;
  }
  const t = new THREE.DataTexture(dati, lato, lato, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  if (lato === LATO_RUMORE) _texRumore = t;
  return t;
}
// Scale grandi (128 e 512 m): una texture con esattamente periodo/scala celle (64 e 16), così anche lì una lettura
// invece di 4 hash e il periodo resta 8192 m (prestazioni: servivano soprattutto agli anelli dell'orizzonte).
let _texRumore128 = null, _texRumore512 = null;
const textureRumore128 = () => _texRumore128 || (_texRumore128 = textureRumore(SUOLO.periodo / 128, 0x2545f491));
const textureRumore512 = () => _texRumore512 || (_texRumore512 = textureRumore(SUOLO.periodo / 512, 0x6c078965));

export function materialeSuolo(cx, cz, mezzo = 1e9) {
  const P = SUOLO.periodo;
  const mat = new THREE.MeshLambertMaterial();
  // Anelli dell'orizzonte (chiamati senza `mezzo`, da orizzonte.js): oltre 1 km i rumori sotto i 32 m, la lettiera, la
  // terra nuda e il bordo frastagliato della neve non si vedono ma costavano quanto nel blocco (misura: gli anelli
  // pesavano più del blocco). Modalità ridotta SUOLO_LONTANO.
  if (mezzo >= 1e8) mat.defines = { SUOLO_LONTANO: '' };
  const uniformi = {
    uOrigine: { value: new THREE.Vector2(((cx % P) + P) % P, ((cz % P) + P) % P) },
    uRoccia: { value: COLORE_ROCCIA.clone() },
    uRocciaScura: { value: COLORE_ROCCIA_SCURA.clone() },
    uNeve: { value: COLORE_NEVE.clone() },
    uNeveVersante: { value: COLORE_NEVE_VERSANTE.clone() },
    uNeveV: { value: new THREE.Vector3(...NEVE_VERSANTE) },
    uDettaglioNeve: { value: new THREE.Vector3(...DETTAGLIO_NEVE) },
    uCentro: { value: new THREE.Vector2(((cx % P) + P) % P, ((cz % P) + P) % P) },
    uMezzo: { value: mezzo },
    uRumore: { value: textureRumore() },
    uRumore128: { value: textureRumore128() },
    uRumore512: { value: textureRumore512() },
    // Vegetazione: ombre finte degli oggetti (r: ombra del sole, ridisegnata quando il sole si sposta) e piede scuro
    // attorno al punto di contatto (r, fisso), in coordinate del blocco; forza (sole, piede). Le imposta
    // vegetazione3d.js tramite mat.userData.uniformi; negli anelli restano spente.
    uOmbre: { value: TEXTURE_NERA },
    uPiede: { value: TEXTURE_NERA },
    uOmbreForza: { value: new THREE.Vector2(0, 0) },
    // Prestazioni (docs/PRESTAZIONI.md, passo 3): colore del blocco «cotto» in una texture al caricamento (cuociSuolo).
    uCotto: { value: TEXTURE_NERA },
    // Campi coltivati (vegetazione.js, PARCELLE): permutazione condivisa. La maschera è la terza componente di aSuolo,
    // le coordinate dei campi l'attributo aCampi (li aggiunge vegetazione3d.js).
    uPermCampi: { value: TEXTURE_PERM_CAMPI },
    uOrti: { value: 0 },          // raggio degli orti del luogo dei campi (m; 0 = niente orti): PARCELLE.orti
    // Fondi coltivati del blocco (vegetazione.js, fondoColtivato): tabella LATO_FONDI², dal fondo (i0, j0).
    uFondi: { value: TEXTURE_NERA },
    uFondi0: { value: new THREE.Vector2(0, 0) },
  };
  mat.userData.uniformi = uniformi;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformi);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 base;
attribute vec4 strati;
attribute vec4 aSuolo;
varying vec4 vSuolo;
attribute vec4 aCampi;
varying vec4 vCampi;
uniform vec2 uOrigine;
varying vec3 vBase;
varying vec4 vStrati;
varying vec2 vMondo;
varying vec2 vLocCotto;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vBase = base;
  vStrati = strati;
  vSuolo = aSuolo;
  vCampi = aCampi;
  vMondo = (modelMatrix * vec4(transformed, 1.0)).xz + uOrigine;
  vLocCotto = transformed.xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRoccia;
uniform vec3 uRocciaScura;
uniform vec3 uNeve;
uniform vec3 uNeveVersante;
uniform vec3 uNeveV;
uniform vec3 uDettaglioNeve;
float kdNeve = 0.0;   // quanta neve c'è in questo pixel (la usa il dettaglio della normale)
float kdPrato = 0.0;  // quanto prato o sottobosco (vegetazione: micro-rilievo della normale)
uniform vec2 uCentro;
uniform float uMezzo;
uniform sampler2D uOmbre;
uniform sampler2D uPiede;
uniform vec2 uOmbreForza;
uniform sampler2D uCotto;
varying vec3 vBase;
varying vec4 vStrati;
varying vec2 vMondo;
varying vec2 vLocCotto;
varying vec4 vSuolo;
varying vec4 vCampi;
uniform sampler2D uPermCampi;
uniform float uOrti;
uniform sampler2D uFondi;
uniform vec2 uFondi0;
float fondoC(float i, float jb) {
  vec2 t = vec2(i, jb) - uFondi0;
  if (t.x < 0.0 || t.y < 0.0 || t.x >= ${LATO_FONDI.toFixed(1)} || t.y >= ${LATO_FONDI.toFixed(1)}) return 0.0;
  return texture2D(uFondi, (t + 0.5) / ${LATO_FONDI.toFixed(1)}).r > 0.5 ? 1.0 : 0.0;
}
// Permutazione dei campi (PERM_CAMPI): interi esatti, uguali a quelli di vegetazione.js.
float permC(float x) { return floor(texture2D(uPermCampi, vec2((mod(x, 256.0) + 0.5) / 256.0, 0.5)).r * 255.0 + 0.5); }
float hashC(float a, float b) { return permC(permC(b) + a); }
// Aperture naturali delle siepi (come aperturaSiepe in vegetazione.js).
float aperturaC(float i, float j, float lato, float lungo) {
  float c = floor(lungo / ${PARCELLE.siepi.aperture.cella.toFixed(1)}), b = hashC(i, j + 141.0 + 7.0 * lato);
  if (hashC(c, b) >= ${(PARCELLE.siepi.aperture.quota * 256).toFixed(1)}) return 0.0;
  float centro = (c + 0.2 + 0.6 * hashC(c, b + 1.0) / 255.0) * ${PARCELLE.siepi.aperture.cella.toFixed(1)};
  return abs(lungo - centro) < ${PARCELLE.siepi.aperture.larghezza[0].toFixed(2)} + ${(PARCELLE.siepi.aperture.larghezza[1] - PARCELLE.siepi.aperture.larghezza[0]).toFixed(2)} * hashC(c, b + 2.0) / 255.0 ? 1.0 : 0.0;
}
// Carrareccia sul bordo basso della banda jb (come carrareccia in vegetazione.js).
float carrC(float jb) { return hashC(jb, 9.0) < ${(PARCELLE.carrareccia.quota * 256).toFixed(1)} ? 1.0 : 0.0; }
// Tipo del fondo (come tipoFondo in vegetazione.js): 0 campo, 1 orto, 2 incolto.
float tipoFondoC(float i, float jb, float L, float u0) {
  if (uOrti <= 0.0) return 0.0;
  float d = length(vec2(u0 + 0.5 * L, (jb + 0.5) * ${PARCELLE.banda.toFixed(1)})) / uOrti;
  if (hashC(i, jb + 151.0) < ${(PARCELLE.orti.quota * 256).toFixed(2)} * (1.0 - smoothstep(${PARCELLE.orti.vicino[0].toFixed(2)}, ${PARCELLE.orti.vicino[1].toFixed(2)}, d))) return 1.0;
  float p = (${PARCELLE.incolti.quota[0].toFixed(3)} + ${(PARCELLE.incolti.quota[1] - PARCELLE.incolti.quota[0]).toFixed(3)} * smoothstep(${PARCELLE.incolti.vicino[0].toFixed(2)}, ${PARCELLE.incolti.vicino[1].toFixed(2)}, d)) * 256.0;
  if (hashC(i, jb + 171.0) < p * ${(1 - PARCELLE.incolti.gruppi).toFixed(3)} || hashC(floor(i / 2.0) + 61.0, floor(jb / 2.0) + 173.0) < p * ${PARCELLE.incolti.gruppi.toFixed(3)}) return 2.0;
  return 0.0;
}
float hashSuolo(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
uniform sampler2D uRumore;
uniform sampler2D uRumore128;
uniform sampler2D uRumore512;
// Rumore a valori, periodico su ${P} m (la scala è una potenza di 2). Fino a ${P / LATO_RUMORE} m di scala: una lettura
// della texture (vedi textureRumore); oltre, hash.
float rumoreSuolo(vec2 p, float scala) {
  float per = ${P.toFixed(1)} / scala;
  vec2 q = p / scala, i = floor(q), f = fract(q), u = f * f * (3.0 - 2.0 * f);
  if (scala <= ${(P / LATO_RUMORE).toFixed(1)}) return texture2D(uRumore, (i + u + 0.5) / ${LATO_RUMORE.toFixed(1)}).r;
  if (scala == 128.0) return texture2D(uRumore128, (i + u + 0.5) / ${(P / 128).toFixed(1)}).r;
  if (scala == 512.0) return texture2D(uRumore512, (i + u + 0.5) / ${(P / 512).toFixed(1)}).r;
  float a = hashSuolo(mod(i, per)), b = hashSuolo(mod(i + vec2(1.0, 0.0), per));
  float c = hashSuolo(mod(i + vec2(0.0, 1.0), per)), d = hashSuolo(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float spegniSuolo(float scala, float dist) {
  return 1.0 - smoothstep(scala * ${SUOLO.spegni[0].toFixed(1)}, scala * ${SUOLO.spegni[1].toFixed(1)}, dist);
}
float sogliaSuolo(float x) {
  float e = max(fwidth(x) * 0.75, 0.02);
  return smoothstep(0.5 - e, 0.5 + e, x);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef SUOLO_COTTO
  {
    // Colore cotto (cuociSuolo): una lettura. Alfa = 0,5 + 0,5·neve − 0,5·prato (servono al dettaglio della normale).
    // Coordinate dell'oggetto (non vMondo, che si avvolge ogni ${P} m: gli anelli dell'orizzonte sono più larghi).
    vec4 cotto = texture2D(uCotto, vec2(vLocCotto.x / (2.0 * uMezzo) + 0.5, 0.5 - vLocCotto.y / (2.0 * uMezzo)));
    vec2 dB = vMondo - uCentro;
    dB -= ${P.toFixed(1)} * floor(dB / ${P.toFixed(1)} + 0.5);
    vec3 c = pow(cotto.rgb, vec3(2.2));
    kdNeve = clamp((cotto.a - 0.5) * 2.0, 0.0, 1.0);
    kdPrato = clamp((0.5 - cotto.a) * 2.0, 0.0, 1.0);
    if (uOmbreForza.x + uOmbreForza.y > 0.0) {
      vec2 uvO = dB / (2.0 * uMezzo) + 0.5;
      if (uvO.x > 0.0 && uvO.y > 0.0 && uvO.x < 1.0 && uvO.y < 1.0) {
        float om = texture2D(uOmbre, uvO).r * uOmbreForza.x;
        float pi = texture2D(uPiede, uvO).r * uOmbreForza.y;
        c *= 1.0 - max(om, pi);
      }
    }
    diffuseColor.rgb = c;
  }
#else
  {
#ifdef SUOLO_CUOCI
    float dist = 0.0;   // cottura: dettaglio pieno; da lontano lo filtrano le mipmap
#else
    float dist = length(vViewPosition);
#endif
    vec2 p = vMondo;
    float bordo = 0.0, dettaglio = 0.0, venature = 0.0;
#ifdef SUOLO_LONTANO
${ottaveGLSL(SUOLO.bordo.filter(([sc]) => sc >= 32), 'bordo')}
${ottaveGLSL(SUOLO.dettaglio.filter(([sc]) => sc >= 32), 'dettaglio')}
#else
${ottaveGLSL(SUOLO.bordo, 'bordo')}
${ottaveGLSL(SUOLO.dettaglio, 'dettaglio')}
${ottaveGLSL(SUOLO.venature, 'venature')}
#endif
    float roccia = sogliaSuolo(vStrati.x + bordo);
    vec3 cRoccia = mix(uRoccia, uRocciaScura, clamp(vStrati.w + venature, 0.0, 1.0)) * vStrati.z;
    vec3 cPrato = vBase * (1.0 + dettaglio);
    {
      // Vegetazione: terra nuda a chiazze nei prati; lettiera sotto il bosco e fango vicino all'acqua (solo nel blocco).
      float prato = smoothstep(0.3, 0.6, (vBase.g - vBase.b) / max(vBase.g, 0.001));
      vec2 loc = abs(vMondo - uCentro);
      loc = min(loc, ${P.toFixed(1)} - loc);
      float blocco = 1.0 - smoothstep(uMezzo - 120.0, uMezzo, max(loc.x, loc.y));
      // Prestazioni: niente rumori dove non servono. Terra nuda solo sul prato entro 3 km; lettiera e fango solo dove
      // il blocco li porta (aSuolo, 0 negli anelli); la grana di 2 m solo vicino.
      float ghiaiaV = 1.0 - vSuolo.w;                // aSuolo.w = 1 − ghiaia (assente: 1, niente ghiaia)
      float suoloV = max(max(vSuolo.x, vSuolo.y), max(vSuolo.z, ghiaiaV)) * blocco;
#ifdef SUOLO_LONTANO
      if (false) {
#else
      if (prato > 0.01 && dist < 3000.0 || suoloV > 0.01) {
#endif
        float r1 = rumoreSuolo(p, 32.0), r2 = rumoreSuolo(p, 8.0);
        float r3 = dist < 400.0 ? rumoreSuolo(p, 2.0) : 0.5, r4 = 1.0 - r1;
        float terra = smoothstep(0.62, 0.78, r1 * 0.6 + r2 * 0.4) * prato;
        cPrato = mix(cPrato, vec3(0.19, 0.125, 0.06) * (0.8 + 0.4 * r3), terra * 0.5);
        if (suoloV > 0.01) {
          vec3 lett = mix(vec3(0.011, 0.0065, 0.003), vec3(0.06, 0.036, 0.016), smoothstep(0.3, 0.8, r2));
          lett = mix(lett, vec3(0.003, 0.003, 0.002), smoothstep(0.55, 0.8, r3 * 0.5 + r2 * 0.5) * 0.85);
          lett = mix(lett, vec3(0.012, 0.03, 0.007), smoothstep(0.62, 0.8, r4) * 0.6);
          lett *= 0.6 + 0.8 * r3;
          cPrato = mix(cPrato, lett, vSuolo.x * 0.95 * prato * blocco);
          cPrato = mix(cPrato, vec3(0.07, 0.055, 0.035) * (0.8 + 0.4 * r2), smoothstep(0.3, 1.0, vSuolo.y) * 0.6 * blocco);
          // Ghiaia a chiazze sulle rive dei fiumi: grigio-beige a grana fine (sassolini) e qualche ciottolo più chiaro.
          if (ghiaiaV > 0.01) {
            float g1 = rumoreSuolo(p + 91.0, 2.0);
            vec3 ghiaia = mix(vec3(0.20, 0.18, 0.15), vec3(0.36, 0.33, 0.28), g1) * (0.75 + 0.5 * r3);
            ghiaia = mix(ghiaia, vec3(0.45, 0.43, 0.38), smoothstep(0.72, 0.85, r3) * 0.6);
            cPrato = mix(cPrato, ghiaia, smoothstep(0.15, 0.6, ghiaiaV + 0.25 * (r2 - 0.5)) * blocco);
          }
        }
        if (vSuolo.z > 0.01) {
          // Campi coltivati attorno ai luoghi (niente stagioni; disegno in PARCELLE, js/mondo/vegetazione.js, che lo
          // calcola uguale per mettere siepi e muretti). Fondi larghi una banda e lunghi 130–220 m, divisi per il lungo
          // in 2–4 strisce di colture diverse (arato, seminato, grano, fieno, maggese) separate solo da un solco; in
          // testa al fondo una capezzagna erbosa; su una parte dei bordi di banda una carrareccia di terra. Ogni fondo è
          // campo, orto (aiuole con vialetti, chiuso da muretti) o incolto (pascolo). Dove la campagna finisce si
          // fermano fondi interi, netti; alla strada i campi finiscono al margine, con erba.
          float B = ${PARCELLE.banda.toFixed(1)}, MEZZA = ${PARCELLE.carrareccia.mezza.toFixed(2)};
          vec2 q = vCampi.xy;
          float margineS = vCampi.w;
          float jb = floor(q.y / B), fb = q.y - jb * B;
          float nS = ${PARCELLE.strisce[0].toFixed(1)} + floor(hashC(jb, 7.0) * ${(PARCELLE.strisce[1] - PARCELLE.strisce[0] + 1).toFixed(1)} / 256.0), W = B / nS;
          float hb = hashC(jb, 3.0) / 255.0, L = ${PARCELLE.fondo[0].toFixed(1)} + ${(PARCELLE.fondo[1] - PARCELLE.fondo[0]).toFixed(1)} * hb;
          float off = hb * ${PARCELLE.spostamento.toFixed(1)};
          float i = floor((q.x + off) / L), u0 = i * L - off, fu = q.x - u0;
          float s = min(nS - 1.0, floor(fb / W)), fv = fb - s * W, j = jb * 8.0 + s;
          float tipo = tipoFondoC(i, jb, L, u0);
          float dCm = length(vec2(u0 + 0.5 * L, (jb + 0.5) * B));
          float c0 = carrC(jb), c1 = carrC(jb + 1.0);
          float y0 = c0 * MEZZA, y1 = B - c1 * MEZZA;                      // il fondo tra le carrarecce (in fb)
          // Erba: capezzagne in testa, bordi di banda senza carrareccia, margine della strada.
          float erbaB = min(min(min(fu, L - fu), min(c0 > 0.5 ? 1e4 : fb, c1 > 0.5 ? 1e4 : B - fb)),
            margineS - ${PARCELLE.strada.margine[0].toFixed(1)});
          vec3 cC;
          if (tipo > 1.5) {
            cC = cPrato * vec3(1.05, 1.02, 0.88);                              // incolto: pascolo
          } else if (tipo > 0.5) {
            // Orto: aiuole di ~${PARCELLE.orti.aiuola[0]} × ${PARCELLE.orti.aiuola[1]} m con vialetti di terra battuta.
            float Lu = L - ${(2 * PARCELLE.capezzagna).toFixed(2)}, Lv = y1 - y0;
            float pu = Lu / max(2.0, floor(Lu / ${PARCELLE.orti.aiuola[0].toFixed(1)} + 0.5)), pv = Lv / max(2.0, floor(Lv / ${PARCELLE.orti.aiuola[1].toFixed(1)} + 0.5));
            float iu = fu - ${PARCELLE.capezzagna.toFixed(2)}, iv = fb - y0;
            float su = floor(iu / pu), sv = floor(iv / pv), au = iu - su * pu, av = iv - sv * pv;
            float ho = hashC(i + su * 37.0, jb + sv * 53.0 + 19.0) / 255.0;
            float so = 0.5 + 0.5 * sin(av * 6.2832 / 1.3);
            if (ho < 0.3) cC = vec3(0.15, 0.095, 0.05) * (0.85 + 0.2 * so);                                  // vangato
            else if (ho < 0.62) cC = mix(vec3(0.12, 0.08, 0.04), vec3(0.05, 0.12, 0.03), 0.35 + 0.4 * smoothstep(0.3, 0.7, so));
            else if (ho < 0.8) cC = vec3(0.04, 0.09, 0.025) * (0.85 + 0.3 * so);                             // foglie
            else cC = cPrato * 0.95;                                                                          // prato
            cC *= 0.9 + 0.2 * r2;
            float vial = min(min(au, pu - au), min(av, pv - av));
            cC = mix(vec3(0.26, 0.20, 0.12) * (0.9 + 0.2 * r3), cC, smoothstep(${(PARCELLE.orti.vialetto - 0.2).toFixed(2)}, ${(PARCELLE.orti.vialetto + 0.2).toFixed(2)}, vial));
          } else {
            float h = hashC(i, j + 17.0) / 255.0;
            float solchi = 0.5 + 0.5 * sin(fv * 6.2832 / 2.4);
            if (h < 0.24) cC = vec3(0.15, 0.095, 0.05) * (0.78 + 0.32 * solchi);                    // arato
            else if (h < 0.46) cC = mix(vec3(0.10, 0.20, 0.03), vec3(0.15, 0.26, 0.05), solchi * 0.6);  // seminato
            else if (h < 0.7) cC = vec3(0.42, 0.32, 0.11) * (0.9 + 0.15 * solchi);                    // grano
            else if (h < 0.88) cC = vec3(0.24, 0.27, 0.09) * (0.9 + 0.12 * solchi);                  // fieno, prato da sfalcio
            else cC = mix(cPrato, vec3(0.2, 0.14, 0.07), 0.45);                                          // maggese
            cC *= 0.9 + 0.2 * r2;
            // Solco tra le strisce (non sui bordi di banda): niente erba, solo una riga più scura.
            float dS = min(s > 0.5 ? fv : 1e4, s < nS - 1.5 ? W - fv : 1e4);
            cC *= mix(0.7, 1.0, smoothstep(${(PARCELLE.solco * 0.4).toFixed(2)}, ${PARCELLE.solco.toFixed(2)}, dS));
          }
          if (tipo < 1.5) cC = mix(cC, cPrato * 0.85, 1.0 - smoothstep(${(PARCELLE.capezzagna - 0.3).toFixed(2)}, ${(PARCELLE.capezzagna + 0.3).toFixed(2)}, erbaB));
          {
            // Siepi (non i filari d'alberi: quelli hanno le loro ombre finte) e muretti a secco sui bordi del fondo, come
            // in posizionaVegetazione: lato 0 basso, 1 in testa; gli orti chiusi su tutti e quattro.
            float zona = dCm < uOrti + ${PARCELLE.muretti.oltreOrti.toFixed(1)} || vCampi.z > ${(CASE_CAMPAGNA.vicino - CASE_CAMPAGNA.muretti).toFixed(1)} ? 1.0 : 0.0;
            float orto = tipo > 0.5 && tipo < 1.5 ? 1.0 : 0.0;
            float VARCO = ${PARCELLE.muretti.varco.toFixed(2)}, MD = ${PARCELLE.muretti.dentro.toFixed(2)}, SD = ${PARCELLE.siepi.dentro.toFixed(2)};
            float dSiepe = 1e4, dMuro = 1e4;
            bool has0 = orto > 0.5 || hashC(i, jb + 59.0) < ${(PARCELLE.siepi.lungo * 256).toFixed(1)};
            bool has1 = orto > 0.5 || hashC(i, jb + 83.0) < ${(PARCELLE.siepi.traverso * 256).toFixed(1)};
            bool m0 = orto > 0.5 || zona > 0.5 && hashC(i, jb + 113.0) < ${(PARCELLE.muretti.quota * 256).toFixed(1)};
            bool m1 = orto > 0.5 || zona > 0.5 && hashC(i, jb + 114.0) < ${(PARCELLE.muretti.quota * 256).toFixed(1)};
            if (has0) {
              if (m0) { if (abs(fu - L * (0.15 + 0.7 * hashC(i, jb + 127.0) / 255.0)) >= VARCO) dMuro = min(dMuro, abs(fb - y0 - MD)); }
              else if (hashC(i, jb + 97.0) >= ${(PARCELLE.siepi.filari * 256).toFixed(1)} && aperturaC(i, jb, 0.0, fu) < 0.5) dSiepe = min(dSiepe, abs(fb - y0 - SD));
            }
            if (has1 && fb > y0 + 1.0 && fb < y1 - 1.0) {
              if (m1) { if (abs(fb - B * (0.15 + 0.7 * hashC(i, jb + 131.0) / 255.0)) >= VARCO) dMuro = min(dMuro, abs(fu - MD)); }
              else if (hashC(i, jb + 98.0) >= ${(PARCELLE.siepi.filari * 256).toFixed(1)} && aperturaC(i, jb, 1.0, fb) < 0.5) dSiepe = min(dSiepe, abs(fu - SD));
            }
            if (orto > 0.5) {
              if (abs(fu - L * (0.15 + 0.7 * hashC(i, jb + 135.0) / 255.0)) >= VARCO) dMuro = min(dMuro, abs(fb - y1 + MD));
              if (fb > y0 + 1.0 && fb < y1 - 1.0 && abs(fb - B * (0.15 + 0.7 * hashC(i, jb + 139.0) / 255.0)) >= VARCO) dMuro = min(dMuro, abs(fu - L + MD));
            }
            cC = mix(cC, vec3(0.035, 0.055, 0.02) * (0.7 + 0.6 * r2), 1.0 - smoothstep(${PARCELLE.siepi.striscia[0].toFixed(1)}, ${PARCELLE.siepi.striscia[1].toFixed(1)}, dSiepe));
            cC = mix(cC, vec3(0.13, 0.125, 0.115) * (0.75 + 0.5 * r3), 1.0 - smoothstep(${PARCELLE.muretti.striscia[0].toFixed(1)}, ${PARCELLE.muretti.striscia[1].toFixed(1)}, dMuro));
          }
          // Carrareccia: due carreggiate di terra con l'erba nel mezzo, fino al margine della strada.
          float dL = min(c0 > 0.5 ? fb : 1e4, c1 > 0.5 ? B - fb : 1e4);
          float carr = (1.0 - smoothstep(MEZZA - 0.3, MEZZA + 0.1, dL)) * step(${PARCELLE.strada.margine[0].toFixed(1)}, margineS);
          vec3 cTerra = mix(vec3(0.25, 0.19, 0.115), vec3(0.18, 0.135, 0.08), r2) * (0.85 + 0.3 * r3);
          cC = mix(cC, mix(cTerra, cPrato * 0.8, (1.0 - smoothstep(0.25, 0.5, dL)) * 0.85), carr);
          // Fondo coltivato per intero (tabella del blocco); il campo per vertice toglie solo acqua, rive e terrapieni.
          float dentro = fondoC(i, jb) * smoothstep(0.06, 0.1, vSuolo.z) * step(0.3, margineS);
          cPrato = mix(cPrato, cC, dentro * blocco);
        }
        if (vCampi.z > 0.01) {
          // Case isolate (CASE_CAMPAGNA; richiesta dell'utente: «l'intorno dovrebbe essere terra battuta chiara o scura,
          // qualche orto solo un po' nelle vicinanze»): un orto compatto (gruppi di 2 × 2 aiuole di 12 × 9 m, ~un terzo
          // dei gruppi) a ridosso dell'aia, poi l'aia di terra battuta a chiazze. vCampi.z = vicino − distanza.
          float dK = ${CASE_CAMPAGNA.vicino.toFixed(1)} - vCampi.z + 5.0 * (r2 - 0.5);
          if (dK < ${(CASE_CAMPAGNA.aia[1] + CASE_CAMPAGNA.orti).toFixed(1)}) {
            vec2 qo = vCampi.xy;
            float oi = floor(qo.x / 12.0), oj = floor(qo.y / 9.0), ou = qo.x - oi * 12.0, ov = qo.y - oj * 9.0;
            // A gruppi di 2 × 2 aiuole (un orto compatto accanto all'aia, non quadratini sparsi).
            float ho = hashC(floor(oi / 2.0), floor(oj / 2.0) + 201.0) < 90.0 ? hashC(oi, oj + 205.0) / 255.0 * 0.45 : 1.0;
            if (ho < 0.45) {
              float so = 0.5 + 0.5 * sin(ov * 6.2832 / 1.3);
              vec3 cO = ho < 0.18 ? vec3(0.15, 0.095, 0.05) * (0.85 + 0.2 * so)
                : mix(vec3(0.12, 0.08, 0.04), vec3(0.05, 0.12, 0.03), 0.35 + 0.4 * smoothstep(0.3, 0.7, so));
              cO = mix(cO, cPrato * 0.85, 1.0 - smoothstep(0.5, 1.2, min(min(ou, 12.0 - ou), min(ov, 9.0 - ov))));
              cPrato = mix(cPrato, cO, blocco);
            }
          }
          vec3 cT = mix(vec3(0.27, 0.20, 0.12), vec3(0.15, 0.10, 0.06), smoothstep(0.3, 0.7, r2)) * (0.88 + 0.24 * r3);
          cPrato = mix(cPrato, cT, (1.0 - smoothstep(${CASE_CAMPAGNA.aia[0].toFixed(1)}, ${(CASE_CAMPAGNA.aia[1] - 2).toFixed(1)}, dK)) * blocco);
        }
        // Colori vari e chiaroscuri da vicino (richiesta dell'utente: «colorazione varia e chiaroscuri marcati nel
        // breve anche senza pendenze, senza sprecare FPS in oggetti»): chiazze secche (ocra) e cupe (verde scuro) su
        // 4–16 m, luminosità che oscilla di ±25 % su 4 m entro ~150 m. Il rilievo finto è in normal_fragment_maps.
        float vicinoP = 1.0 - smoothstep(60.0, 180.0, dist);
        if (vicinoP > 0.0 && prato > 0.01) {
          float r5 = rumoreSuolo(p, 4.0), r6 = rumoreSuolo(p + 37.0, 16.0);
          float aperto = (1.0 - vSuolo.x) * (1.0 - vSuolo.z);
          cPrato = mix(cPrato, vec3(0.30, 0.23, 0.07), smoothstep(0.58, 0.82, r6) * 0.4 * prato * aperto * vicinoP);
          cPrato = mix(cPrato, vec3(0.035, 0.08, 0.02), smoothstep(0.55, 0.8, r5 * 0.6 + r2 * 0.4) * 0.35 * prato * aperto * vicinoP);
          cPrato *= mix(1.0, 0.62 + 0.76 * r5, prato * vicinoP);
        }

      }
    }
    kdPrato = smoothstep(0.3, 0.6, (vBase.g - vBase.b) / max(vBase.g, 0.001)) * (1.0 - roccia);
    vec3 c = mix(cPrato, cRoccia * (1.0 + 0.5 * dettaglio), roccia);
    // Le strade sono un nastro a parte (js/3d/acqua.js, creaNastroStrada): il suolo non le disegna.
    // La neve ha un bordo suo (rumore spostato), non quello della roccia.
    // Rumore del bordo della neve solo dove la neve può esserci e non è già spento. fwidth (in sogliaSuolo)
    // resta fuori dai rami: le derivate dentro un ramo non uniforme non sono definite.
    float bordoNeve = 0.0;
#ifndef SUOLO_LONTANO
    if (vStrati.y > 0.05 && dist < ${(16 * SUOLO.spegni[1]).toFixed(1)})
#else
    if (false)
#endif
      bordoNeve = (rumoreSuolo(p + 517.0, 16.0) - 0.5) * 0.12 * spegniSuolo(16.0, dist);
    float neve = sogliaSuolo(vStrati.y + 0.8 * bordo + bordoNeve);
    // Sui versanti la neve vira all'azzurro-grigio: pendenza dalla normale del pixel (vista → mondo).
    vec3 nMondo = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
    float pendNeve = degrees(acos(clamp(nMondo.y, -1.0, 1.0)));
    vec3 cNeve = mix(uNeve, uNeveVersante, smoothstep(uNeveV.x, uNeveV.y, pendNeve) * uNeveV.z);
    c = mix(c, cNeve * (1.0 + 0.3 * dettaglio), neve);
    kdNeve = neve;
    kdPrato *= 1.0 - neve;
    // Vegetazione: ombre finte di alberi, cespugli e rocce, e piede scuro attorno al punto di contatto (solo nel blocco).
#ifndef SUOLO_CUOCI
    if (uOmbreForza.x + uOmbreForza.y > 0.0) {
      vec2 dB = vMondo - uCentro;
      dB -= ${P.toFixed(1)} * floor(dB / ${P.toFixed(1)} + 0.5);
      vec2 uvO = dB / (2.0 * uMezzo) + 0.5;
      if (uvO.x > 0.0 && uvO.y > 0.0 && uvO.x < 1.0 && uvO.y < 1.0) {
        float om = texture2D(uOmbre, uvO).r * uOmbreForza.x;
        float pi = texture2D(uPiede, uvO).r * uOmbreForza.y;
        c *= 1.0 - max(om, pi);
      }
    }
#endif
    diffuseColor.rgb = c;
  }
#endif`)
      .replace('#include <opaque_fragment>', `#ifdef SUOLO_CUOCI
  gl_FragColor = vec4(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)), 0.5 + 0.5 * kdNeve - 0.5 * kdPrato);
#else
#include <opaque_fragment>
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // Cumuli larghi (~8 m), onde del vento allungate, grana fine (~1 m): inclinano la normale dove c'è neve.
    // SENZA_RILIEVO: qualità «bassa» (prestazioni.js): niente micro-rilievo di neve e prato.
#ifdef SENZA_RILIEVO
    float wNeve = 0.0;
#else
    float wNeve = kdNeve * uDettaglioNeve.x
      * (1.0 - smoothstep(uDettaglioNeve.y, uDettaglioNeve.z, length(vViewPosition)));
#endif
    if (wNeve > 0.001) {
      const float e = 0.12;
      vec2 p = vMondo;
      #define KD_NEVE(q) (rumoreSuolo(q, 8.0) * 0.8 + rumoreSuolo(vec2((q).x, (q).y * 2.0), 4.0) * 0.3 + rumoreSuolo(q, 1.0) * 0.06)
      float gx = (KD_NEVE(p + vec2(e, 0.0)) - KD_NEVE(p - vec2(e, 0.0))) / (2.0 * e);
      float gz = (KD_NEVE(p + vec2(0.0, e)) - KD_NEVE(p - vec2(0.0, e))) / (2.0 * e);
      #undef KD_NEVE
      normal = normalize(normal - (viewMatrix * vec4(gx, 0.0, gz, 0.0)).xyz * wNeve);
    }
    // Vegetazione: micro-rilievo del prato e del sottobosco (gobbe ~4 m, zolle ~2 m, ciuffi ~1 m) entro ~150 m. La luce
    // del sole fa da sé il chiaroscuro anche dove il terreno è piano; al tramonto e di notte cambia con lei.
    // Prestazioni (dopo il CONTEXT_LOST segnalato): solo entro 80 m, differenze in avanti (3 valutazioni, non 4).
    float wPrato = kdPrato * 1.1 * (1.0 - smoothstep(40.0, 80.0, length(vViewPosition)));
#ifdef SENZA_RILIEVO
    wPrato = 0.0;
#endif
    if (wPrato > 0.001) {
      const float e = 0.15;
      vec2 p = vMondo;
      #define KD_PRATO(q) (rumoreSuolo(q, 4.0) * 0.55 + rumoreSuolo(q + 13.0, 2.0) * 0.3 + rumoreSuolo(q + 29.0, 1.0) * 0.12)
      float h0 = KD_PRATO(p);
      float gx = (KD_PRATO(p + vec2(e, 0.0)) - h0) / e;
      float gz = (KD_PRATO(p + vec2(0.0, e)) - h0) / e;
      #undef KD_PRATO
      normal = normalize(normal - (viewMatrix * vec4(gx, 0.0, gz, 0.0)).xyz * wPrato);
    }
  }`);
  };
  mat.customProgramCacheKey = () => 'suolo-mondo';
  return mat;
}

// ─── Colore del blocco cotto in una texture (prestazioni, docs/PRESTAZIONI.md passo 3) ───────────────────
// Misura sulla scheda di riferimento (Intel UHD 730): lo shader del suolo costava 16,7 ms su 24,7 per fotogramma, con
// 20–30 letture di rumore per pixel. Al caricamento della Scena il blocco si disegna una volta dall'alto, senza luce,
// in una texture di LATO_COTTO² (circa 1 m per pixel su 2 km) con tutto il colore (rumori, roccia, neve, lettiera,
// chiazze); poi il materiale del blocco passa alla modalità SUOLO_COTTO: una lettura per pixel. Restano calcolati al
// momento le ombre finte della vegetazione (si spostano col sole) e il micro-rilievo della normale vicino alla camera.
// Da lontano le mipmap fanno il lavoro che faceva lo spegnimento delle ottave.
const LATO_COTTO = 2048;

/**
 * Cuoce il colore del blocco e passa il suo materiale alla modalità cotta. Da chiamare dopo createTerrain del mondo
 * generato (serve il renderer). Restituisce i ms impiegati, o null se il terreno non ha il materiale del suolo.
 */
export function cuociSuolo(renderer, terrain) {
  const sup = terrain?.mesh?.getObjectByName('terreno-superficie');
  return sup ? cuociMesh(renderer, sup, terrain.half, LATO_COTTO) : null;
}

/**
 * Cuoce il colore di una mesh con materialeSuolo (blocco o anello dell'orizzonte) in una texture quadrata di `lato` px
 * che copre ±half (coordinate dell'oggetto), poi il materiale passa a SUOLO_COTTO. Restituisce i ms.
 */
function cuociMesh(renderer, sup, half, lato, dentro = []) {
  const mat = sup?.material;
  if (!mat?.userData?.uniformi?.uCotto) return null;
  const t0 = performance.now();
  const rt = new THREE.WebGLRenderTarget(lato, lato, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // Materiale di cottura: lo stesso shader con SUOLO_CUOCI (dettaglio pieno, colore senza luce, niente nebbia).
  // (un materiale nuovo, non mat.clone(): clone copierebbe userData via JSON, texture comprese)
  const materialeCottura = (m) => {
    const c = new THREE.MeshLambertMaterial();
    c.onBeforeCompile = m.onBeforeCompile;     // stesse uniformi (chiusura di materialeSuolo)
    c.customProgramCacheKey = () => 'suolo-mondo-cuoci';
    c.defines = { ...(m.defines || {}), SUOLO_CUOCI: '' };
    c.fog = false;
    c.depthTest = false;
    c.depthWrite = false;
    return c;
  };
  const scena = new THREE.Scene(), usati = [];
  // Stessa matrice del mondo (vMondo come nel gioco); la camera inquadra ±half attorno all'origine dell'oggetto, che è
  // quella delle coordinate di vLocCotto. `dentro`: le mesh nel foro (anelli interni, blocco), disegnate prima, così
  // al bordo interno dell'anello le mipmap non mescolano il nero del foro (linee scure lungo le giunture).
  for (const m of [...dentro, sup]) {
    if (!m?.material?.onBeforeCompile) continue;
    const c = materialeCottura(m.material);
    usati.push(c);
    m.updateWorldMatrix(true, false);
    const copia = new THREE.Mesh(m.geometry, c);
    copia.matrixAutoUpdate = false;
    copia.matrix.copy(m.matrixWorld);
    scena.add(copia);
  }
  const ox = sup.matrixWorld.elements[12], oz = sup.matrixWorld.elements[14];
  // Vista dall'alto: destra = +x, alto = −z (quindi v = 0,5 − z / lato, come legge SUOLO_COTTO).
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2e6);
  cam.position.set(ox, 1e6, oz);
  cam.up.set(0, 0, -1);
  cam.lookAt(ox, 0, oz);
  const prima = renderer.getRenderTarget(), autoClear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.render(scena, cam);
  renderer.setRenderTarget(prima);
  renderer.autoClear = autoClear;
  usati.forEach((c) => c.dispose());
  // La texture appartiene al materiale del suo blocco: si libera con lui (dispose del materiale) o se lo stesso blocco
  // si ricuoce. Non al blocco successivo: con il blocco che segue il cavaliere (M7 passo 9) il nuovo si cuoce mentre
  // il vecchio è ancora in vista.
  if (mat.userData.rtCotto) mat.userData.rtCotto.dispose();
  else mat.addEventListener('dispose', () => mat.userData.rtCotto?.dispose());
  mat.userData.rtCotto = rt;
  mat.userData.uniformi.uCotto.value = rt.texture;
  mat.userData.uniformi.uMezzo.value = half;
  mat.defines = { ...(mat.defines || {}), SUOLO_COTTO: '' };
  mat.needsUpdate = true;
  return performance.now() - t0;
}

/**
 * Prestazioni (misura dell'utente alla partenza in montagna: anelli 4,3 ms di GPU, terreno in tutto 8,0 su 4,5): il
 * colore degli anelli dell'orizzonte si cuoce come quello del blocco, una texture per anello (mesh con
 * userData.raggio, ciascuna col suo materiale). Un anello per passo (generatore). Restituisce i ms totali.
 */
export function* cuociOrizzonteAPezzi(renderer, orizzonte, terrain = null) {
  let ms = 0;
  const dentro = [terrain?.mesh?.getObjectByName('terreno-superficie')].filter(Boolean);
  const anelli = (orizzonte?.oggetto?.children ?? []).filter((m) => m.userData?.raggio)
    .sort((a, b) => a.userData.raggio - b.userData.raggio);
  for (const m of anelli) {
    ms += cuociMesh(renderer, m, m.userData.raggio, m.userData.raggio <= 6000 ? LATO_COTTO : LATO_COTTO / 2, dentro) || 0;
    dentro.push(m);
    yield 'cottura orizzonte';
  }
  return ms;
}

/** Contenitore degli strati di coloreMondo (da riusare). */
export function nuoviStrati() {
  return { base: new THREE.Color(), roccia: 0, neve: 0, variazione: 1, tono: 0 };
}

/**
 * Superficie del mondo generato: colori e normali per vertice (lisce), triangoli come buildSurface (diagonale
 * NE–SO), quindi getHeight combacia. `colore` lavora in coordinate del mondo: centro del blocco + locali.
 */
function* buildSurfaceMondo(heights, cols, rows, cell, half, colore, centro) {
  const n = cols * rows;
  const H = (c, r) => heights[Math.min(Math.max(r, 0), rows - 1) * cols + Math.min(Math.max(c, 0), cols - 1)];
  const nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const bas = new Float32Array(n * 3), str = new Float32Array(n * 4), S = nuoviStrati();
  const tmp = new THREE.Color();
  const cx = centro ? centro.x : 0, cz = centro ? centro.z : 0;
  // Il colore usa la pendenza su ~60 m (come l'orizzonte vicino): con quella fine il blocco veniva più roccioso
  // dei dintorni e si vedeva il riquadro. La luce usa le normali fini.
  const k = Math.max(1, Math.round(COLORI_MONDO.scalaPendenza / (2 * cell)));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sx = (H(c + k, r) - H(c - k, r)) / (2 * k * cell), sz = (H(c, r + k) - H(c, r - k)) / (2 * k * cell);
      // Luce: normali fini, che verso il bordo del blocco passano a quelle su ~60 m dell'orizzonte (niente riquadro).
      const bordo = smoothstep(half - 600, half, Math.max(Math.abs(c * cell - half), Math.abs(r * cell - half)));
      const gx = ((H(c + 1, r) - H(c - 1, r)) / (2 * cell)) * (1 - bordo) + sx * bordo;
      const gz = ((H(c, r + 1) - H(c, r - 1)) / (2 * cell)) * (1 - bordo) + sz * bordo;
      const l = Math.hypot(gx, 1, gz);
      nor[i * 3] = -gx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -gz / l;
      const pend = Math.atan(Math.hypot(sx, sz)) * 180 / Math.PI;
      colore(tmp, cx - half + c * cell, cz - half + r * cell, heights[i], pend, S);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      bas[i * 3] = S.base.r; bas[i * 3 + 1] = S.base.g; bas[i * 3 + 2] = S.base.b;
      str[i * 4] = S.roccia; str[i * 4 + 1] = S.neve; str[i * 4 + 2] = S.variazione; str[i * 4 + 3] = S.tono;
    }
    if (r % RIGHE_PEZZO === RIGHE_PEZZO - 1) yield;
  }
  const pos = new Float32Array(n * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pos[i * 3] = -half + c * cell; pos[i * 3 + 1] = heights[i]; pos[i * 3 + 2] = -half + r * cell;
    }
  }
  const indici = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let o = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indici[o++] = a; indici[o++] = d; indici[o++] = b;      // NO: a, d, b
      indici[o++] = b; indici[o++] = d; indici[o++] = e;      // SE: b, d, e
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('base', new THREE.BufferAttribute(bas, 3));
  geo.setAttribute('strati', new THREE.BufferAttribute(str, 4));
  geo.setIndex(new THREE.BufferAttribute(indici, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const m = new THREE.Mesh(geo, materialeSuolo(cx, cz, half));
  m.name = 'terreno-superficie';
  return m;
}

// ─── Mesh della superficie ──────────────────────────────────────────────

function buildSurface(heights, cols, rows, cell, half, minElev, maxElev) {
  const triCount = (cols - 1) * (rows - 1) * 2;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const range = Math.max(maxElev - minElev, 1);
  const tmp = new THREE.Color();
  let o = 0;

  // Pendenza "di zona" per vertice (differenze centrali su 2 celle): il colore segue i versanti
  // e non il rumore della singola faccia, che darebbe macchie a quadretti.
  const H = (c, r) => heights[Math.min(Math.max(r, 0), rows - 1) * cols + Math.min(Math.max(c, 0), cols - 1)];
  const zona = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = (H(c + 1, r) - H(c - 1, r)) / (2 * cell);
      const gz = (H(c, r + 1) - H(c, r - 1)) / (2 * cell);
      zona[r * cols + c] = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
    }
  }

  // Scrive un triangolo (vertici in senso antiorario visti dall'alto) con normale e colore della faccia.
  function tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, slope, seed) {
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const t = ((y0 + y1 + y2) / 3 - minElev) / range;
    faceColor(tmp, t, slope, seed);

    pos.set([x0, y0, z0, x1, y1, z1, x2, y2, z2], o);
    for (let k = 0; k < 9; k += 3) {
      nor[o + k] = nx; nor[o + k + 1] = ny; nor[o + k + 2] = nz;
      col[o + k] = tmp.r; col[o + k + 1] = tmp.g; col[o + k + 2] = tmp.b;
    }
    o += 9;
  }

  for (let r = 0; r < rows - 1; r++) {
    const z0 = -half + r * cell, z1 = z0 + cell;
    for (let c = 0; c < cols - 1; c++) {
      const x0 = -half + c * cell, x1 = x0 + cell;
      const a = heights[r * cols + c], b = heights[r * cols + c + 1];
      const d = heights[(r + 1) * cols + c], e = heights[(r + 1) * cols + c + 1];
      const za = zona[r * cols + c], zb = zona[r * cols + c + 1];
      const zd = zona[(r + 1) * cols + c], ze = zona[(r + 1) * cols + c + 1];
      tri(x0, a, z0, x0, d, z1, x1, b, z0, (za + zd + zb) / 3, hash2(c, r * 2, 7));       // NO: a, d, b
      tri(x1, b, z0, x0, d, z1, x1, e, z1, (zb + zd + ze) / 3, hash2(c, r * 2 + 1, 7));   // SE: b, d, e
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'terreno-superficie';
  return m;
}

const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

// Colore di una faccia: altitudine relativa t (0 = punto più basso, 1 = più alto) e pendenza di zona in gradi.
function faceColor(out, t, slope, rnd) {
  // prato: dal fondovalle ai crinali
  if (t < 0.5) out.copy(COL.fondovalle).lerp(COL.prato, smooth(0, 0.5, t));
  else out.copy(COL.prato).lerp(COL.pratoAlto, smooth(0.5, 1, t));
  // versanti ripidi → bosco; ripidissimi → roccia/argilla (calanchi)
  out.lerp(COL.bosco, smooth(PENDENZA_BOSCO[0], PENDENZA_BOSCO[1], slope));
  out.lerp(COL.roccia, smooth(PENDENZA_ROCCIA[0], PENDENZA_ROCCIA[1], slope));
  out.multiplyScalar(1 + (rnd * 2 - 1) * VARIAZIONE_FACCIA);
}

/**
 * Colore di una faccia di terreno anche fuori dal blocco (es. l'orizzonte, orizzonte.js), con la stessa
 * scala del blocco: quota relativa al suo minimo e massimo (limitata a 0…1) e pendenza in gradi.
 */
export function coloreTerreno(out, quota, pendenza, rnd, minElev, maxElev) {
  const t = Math.min(Math.max((quota - minElev) / Math.max(maxElev - minElev, 1), 0), 1);
  faceColor(out, t, pendenza, rnd);
  return out;
}

// ─── Lati del blocco di terreno ─────────────────────────────────────────
// Pareti verticali dal bordo della superficie fino a una base comune: viste da lontano,
// l'area sembra un plastico invece di un foglio sottile sospeso.

function buildSkirt(heights, cols, rows, cell, half, baseY) {
  const edges = [
    { n: cols, p: (i) => [-half + i * cell, heights[i], -half] },                                   // nord
    { n: cols, p: (i) => [-half + i * cell, heights[(rows - 1) * cols + i], half] },                // sud
    { n: rows, p: (i) => [-half, heights[i * cols], -half + i * cell] },                            // ovest
    { n: rows, p: (i) => [half, heights[i * cols + cols - 1], -half + i * cell] },                  // est
  ];
  const pos = [];
  for (const { n, p } of edges) {
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0, z0] = p(i), [x1, y1, z1] = p(i + 1);
      pos.push(x0, y0, z0, x0, baseY, z0, x1, y1, z1);
      pos.push(x1, y1, z1, x0, baseY, z0, x1, baseY, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: COL.bordo, side: THREE.DoubleSide, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'terreno-bordo';
  return m;
}

// ─── Fallback procedurale ───────────────────────────────────────────────

// Hash deterministico 2D → [0, 1)
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise 2D con interpolazione smoothstep, in [0, 1)
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Colline simili all'entroterra marchigiano: quote ~40–230 m.
function proceduralHeights(meta) {
  const { cols, rows, cellSize } = meta;
  const ottave = [[900, 75], [420, 32], [190, 12], [80, 4]];   // [lunghezza d'onda m, ampiezza m]
  const h = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellSize, z = r * cellSize;
      let y = 130;
      ottave.forEach(([w, amp], i) => { y += (valueNoise(x / w, z / w, 11 + i) * 2 - 1) * amp; });
      h[r * cols + c] = Math.max(y, 20);
    }
  }
  return h;
}

// ─── Suolo: terreno + strutture ─────────────────────────────────────────

/**
 * Suolo calpestabile: il terreno naturale, sostituito dove serve da superfici costruite
 * (terrapieno del cortile, rampe, più avanti pavimenti). Stessa interfaccia del terreno,
 * così cavaliere e camera non distinguono tra i due.
 * @param {object} terrain  oggetto restituito da loadTerrain
 * @param {Array<{quotaSuolo:(x:number, z:number) => (number|null)}>} strutture
 * @param {Array<{quotaOstacoli:(x:number, z:number) => (number|null)}>} [sopra] oggetti bassi su cui si sale
 *   (rocce sotto il mezzo metro: gradini): la loro sommità vale come suolo se è più alta.
 */
export function componiSuolo(terrain, strutture, sopra = []) {
  function costruita(x, z) {
    for (const s of strutture) {
      const h = s.quotaSuolo(x, z);
      if (h !== null) return h;
    }
    return null;
  }
  function getHeight(x, z) {
    const c = costruita(x, z);
    let h = c !== null ? c : terrain.getHeight(x, z);
    for (const o of sopra) {
      const t = o.quotaOstacoli(x, z);
      if (t !== null && t > h) h = t;
    }
    return h;
  }
  /** Pendenza del solo terreno naturale (0 sulle superfici costruite): per le pareti, che i gradini non sono. */
  function getSlopeNaturale(x, z) {
    return costruita(x, z) === null ? terrain.getSlope(x, z) : 0;
  }
  function getSlope(x, z) {
    if (costruita(x, z) === null && !sopra.some((o) => o.quotaOstacoli(x, z) !== null)) return terrain.getSlope(x, z);
    const e = 0.3;
    const gx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
    const gz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }
  return { ...terrain, terreno: terrain, getHeight, getSlope, getSlopeNaturale };
}
