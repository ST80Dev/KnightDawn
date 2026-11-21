// Knight Dawn — vegetazione e oggetti sparsi: parte 3D (milestone in parallelo a M7).
// Il posizionamento sta in js/mondo/vegetazione.js (senza Three.js): qui solo ciò che si disegna.
//
// Passo 2: oggetti veri al posto dei punti di controllo (chiome a ciuffi con varianti; erba e felci vicine). Ogni tipo ha 1–3 livelli di dettaglio, ognuno una sola
// InstancedMesh (una chiamata di disegno): alberi vicini ricchi, a media distanza semplici, lontani ridotti a una
// sagoma; arbusti, canne e sassi solo entro una distanza. Le matrici si calcolano una volta; quando la camera si
// sposta di qualche metro ogni istanza passa al livello giusto (copia di 16 numeri). Geometrie da primitive Three.js
// deformate a codice, colori per vertice, un materiale per livello; nessun asset esterno (regola 6).

import * as THREE from 'three';
import { STRIDE, SAGOME, boscoLontano } from '../mondo/vegetazione.js';
import { SUOLO } from './terrain.js';

// ─── Costruzione delle geometrie ─────────────────────────────────────────

/** Generatore pseudo-casuale fisso (le geometrie sono le stesse a ogni avvio). */
function casuale(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3();

/** Rende la geometria non indicizzata e le aggiunge i colori: fn(colore, x, y, z) per vertice. */
function colora(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    fn(_c, p.getX(i), p.getY(i), p.getZ(i), i);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Unisce geometrie non indicizzate con posizione, normale e colore. */
function unisci(parti) {
  const n = parti.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parti) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Spostamento deterministico secondo la direzione (vertici coincidenti restano uniti: niente crepe). */
function bozza(x, y, z, seme, forza) {
  return 1 + forza * (Math.sin(x * 2.1 + seme) * Math.cos(z * 1.7 - seme * 0.7) * 0.6
    + Math.sin(y * 2.9 + seme * 1.3) * 0.4);
}

/**
 * Chioma (o masso): icosaedro deformato, scalato e spostato. Normali a metà tra la sfera (morbida) e la faccia
 * (un po' di sfaccettatura: si leggono le foglie). `scuro`/`chiaro`: colore sotto e sopra, `macchie` variazione.
 */
function lobo(r, dettaglio, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, forza = 0.18, seme = 1,
  scuro, chiaro, macchie = 0.12, morbido = 0.6, rnd }) {
  const geo = new THREE.IcosahedronGeometry(r, dettaglio);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    const k = bozza(_v.x / r, _v.y / r, _v.z / r, seme, forza);
    p.setXYZ(i, _v.x * k * sx + x, _v.y * k * sy + y, _v.z * k * sz + z);
  }
  geo.computeVertexNormals();                          // per faccia (non indicizzata)
  const nf = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _n.set((p.getX(i) - x) / sx, (p.getY(i) - y) / sy, (p.getZ(i) - z) / sz).normalize().multiplyScalar(morbido);
    _v.set(nf.getX(i), nf.getY(i), nf.getZ(i)).multiplyScalar(1 - morbido).add(_n).normalize();
    nf.setXYZ(i, _v.x, _v.y, _v.z);
  }
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro);
  let faccia = 0;
  return colora(geo, (c, px, py, pz, i) => {
    if (i % 3 === 0) faccia = 1 + (rnd() * 2 - 1) * macchie;   // un tono per faccia: foglie a ciuffi
    const t = Math.min(1, Math.max(0, ((py - y) / (r * sy) + 1) / 2));
    c.copy(ca).lerp(cb, t).multiplyScalar(faccia);
  });
}

/** Tronco o ramo: cilindro da (0,0,0) verso l'alto lungo h, inclinato e spostato; base sotto terra di `sotto`. */
function fusto(r0, r1, h, lati, colore, { x = 0, y = 0, z = 0, inclinaX = 0, inclinaZ = 0, sotto = 0.5, chiuso = false } = {}) {
  const geo = new THREE.CylinderGeometry(r1, r0, h + sotto, lati, 1, !chiuso);
  geo.translate(0, (h + sotto) / 2 - sotto, 0);
  geo.rotateX(inclinaX); geo.rotateZ(inclinaZ);
  geo.translate(x, y, z);
  const cs = new THREE.Color(colore), cc = cs.clone().multiplyScalar(0.7);
  return colora(geo, (c, px, py) => c.copy(cc).lerp(cs, Math.min(1, Math.max(0, (py - y) / 2))));
}

/** Cono (palco di conifera, foglie di canna), frastagliato sul bordo. */
function cono(r, h, lati, y, scuro, chiaro, { seme = 1, frastaglio = 0.15, x = 0, z = 0, inclinaX = 0, inclinaZ = 0, rnd } = {}) {
  const geo = new THREE.ConeGeometry(r, h, lati, 1, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i);
    if (vx * vx + vz * vz > 1e-6) {
      const k = 1 + frastaglio * Math.sin(Math.atan2(vz, vx) * 3 + seme);
      p.setX(i, vx * k); p.setZ(i, vz * k);
    }
  }
  geo.translate(0, h / 2, 0);
  geo.rotateX(inclinaX); geo.rotateZ(inclinaZ);
  geo.translate(x, y, z);
  geo.computeVertexNormals();
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro);
  let faccia = 1;
  return colora(geo, (c, px, py, pz, i) => {
    if (i % 3 === 0) faccia = 1 + (rnd() * 2 - 1) * 0.1;
    c.copy(ca).lerp(cb, Math.min(1, Math.max(0, (py - y) / h))).multiplyScalar(faccia);
  });
}

/**
 * Chioma fatta di tanti ciuffi (icosaedri piccoli) sparsi su un ellissoide di centro (x, y, z) e semiassi a, b, c.
 * Le normali guardano fuori dall'intera chioma (luce sopra e dal lato del sole, ombra sotto e dentro), un po'
 * mescolate a quelle dei ciuffi: niente aspetto a palle sfaccettate. Dentro e sotto più scuro (ombra delle foglie).
 */
function chioma({ x = 0, y, z = 0, a, b, c = a, ciuffi, raggio, dettaglio = 1, scuro, chiaro, rnd, morbido = 0.75,
  pieno = 0.55, sotto = 0.35 }) {
  const parti = [];
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro), tinta = new THREE.Color();
  for (let k = 0; k < ciuffi; k++) {
    // Direzione a caso; meno ciuffi sotto (la chioma è più piena in alto e ai lati).
    let dx, dy, dz, l;
    do { dx = rnd() * 2 - 1; dy = rnd() * 2 - 1; dz = rnd() * 2 - 1; l = dx * dx + dy * dy + dz * dz; } while (l > 1 || l < 0.01);
    l = Math.sqrt(l); dx /= l; dy /= l; dz /= l;
    if (dy < -0.4 && rnd() > sotto) dy = -dy * 0.5;
    const t = pieno + (1 - pieno) * rnd();
    const px = x + dx * a * t, py = y + dy * b * t, pz = z + dz * c * t;
    const r = raggio[0] + (raggio[1] - raggio[0]) * rnd();
    const geo = new THREE.IcosahedronGeometry(r, dettaglio);
    const p = geo.attributes.position, seme = rnd() * 10;
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i));
      const f = bozza(_v.x / r, _v.y / r, _v.z / r, seme, 0.22);
      p.setXYZ(i, _v.x * f + px, _v.y * f * 0.85 + py, _v.z * f + pz);
    }
    geo.computeVertexNormals();
    const nf = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _n.set((p.getX(i) - x) / (a * a), (p.getY(i) - y) / (b * b), (p.getZ(i) - z) / (c * c)).normalize().multiplyScalar(morbido);
      _v.set(nf.getX(i), nf.getY(i), nf.getZ(i)).multiplyScalar(1 - morbido).add(_n).normalize();
      nf.setXYZ(i, _v.x, _v.y, _v.z);
    }
    tinta.setRGB(1 + (rnd() - 0.5) * 0.16, 1 + (rnd() - 0.5) * 0.12, 1 + (rnd() - 0.5) * 0.16);
    parti.push(colora(geo, (col, qx, qy, qz) => {
      const ex = (qx - x) / a, ey = (qy - y) / b, ez = (qz - z) / c;
      const fuori = Math.min(1.15, Math.sqrt(ex * ex + ey * ey + ez * ez));   // 0 al centro, ~1 sulla superficie
      const alto = Math.min(1, Math.max(0, (ey + 1) / 2));
      col.copy(ca).lerp(cb, alto * 0.8 + 0.2 * fuori).multiplyScalar(0.62 + 0.38 * fuori).multiply(tinta);
    }));
  }
  return parti;
}

/** Palco di conifera: cono a 12 lati con il bordo che ricade a punte e normali morbide verso l'esterno. */
function palco(r, h, y, scuro, chiaro, rnd, { lati = 16, punte = 0.22, segmenti = 2 } = {}) {
  const geo = new THREE.ConeGeometry(r, h, lati, segmenti, true);
  const p = geo.attributes.position, seme = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i), vy = p.getY(i);
    if (vx * vx + vz * vz > 1e-6) {
      const ang = Math.atan2(vz, vx);
      const k = 1 + punte * Math.sin(ang * lati / 2 + seme) * (vy < -h / 2 + 0.01 ? 1 : 0.4);
      p.setX(i, vx * k); p.setZ(i, vz * k);
      if (vy < -h / 2 + 0.01) p.setY(i, vy - 0.35 * h * (0.5 + 0.5 * Math.sin(ang * 3 + seme)) * 0.4);   // rami che ricadono
    }
  }
  geo.translate(0, h / 2 + y, 0);
  const g = geo.toNonIndexed();
  geo.dispose();
  g.computeVertexNormals();
  const q = g.attributes.position, nf = g.attributes.normal;
  for (let i = 0; i < q.count; i++) {
    _n.set(q.getX(i), r * 0.45, q.getZ(i)).normalize().multiplyScalar(0.7);
    _v.set(nf.getX(i), nf.getY(i), nf.getZ(i)).multiplyScalar(0.3).add(_n).normalize();
    nf.setXYZ(i, _v.x, _v.y, _v.z);
  }
  const ca = new THREE.Color(scuro), cb = new THREE.Color(chiaro);
  let faccia = 1;
  return colora(g, (c, px, py, pz, i) => {
    if (i % 3 === 0) faccia = 1 + (rnd() * 2 - 1) * 0.12;
    const fuori = Math.min(1, Math.hypot(px, pz) / r);
    c.copy(ca).lerp(cb, Math.min(1, Math.max(0, (py - y) / h)) * 0.6 + 0.4 * fuori).multiplyScalar(faccia);
  });
}

/** Rami principali che dal fusto salgono dentro la chioma. */
function rami(n, y0, lunghezza, colore, rnd) {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.8, inc = 0.55 + rnd() * 0.35;
    return fusto(0.13, 0.05, lunghezza * (0.8 + 0.4 * rnd()), 5, colore,
      { y: y0 + rnd() * 1.2, inclinaZ: Math.cos(a) * inc, inclinaX: Math.sin(a) * inc, sotto: 0 });
  });
}

/**
 * Roccia spigolosa: icosaedro tagliato da piani a caso (facce piane, spigoli vivi, come pietra spaccata), con un
 * piccolo scarto per vertice e grigi diversi per faccia; le facce rivolte in alto un po' più chiare (dilavate), qualche
 * macchia di lichene. Vertici coincidenti hanno lo stesso scarto: niente crepe.
 */
function rocciaSpigolosa(r, rnd, { dettaglio = 1, tagli = 8, sx = 1, sy = 0.7, sz = 1, x = 0, y = 0, z = 0, profondita = [0.5, 0.85] } = {}) {
  const geo = new THREE.IcosahedronGeometry(r, dettaglio);
  const piani = Array.from({ length: tagli }, () => {
    let a, b, c, l;
    do { a = rnd() * 2 - 1; b = rnd() * 2 - 1; c = rnd() * 2 - 1; l = Math.hypot(a, b, c); } while (l < 0.2 || l > 1);
    return [a / l, b / l, c / l, r * (profondita[0] + (profondita[1] - profondita[0]) * rnd())];
  });
  const seme = Math.floor(rnd() * 1e6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    for (const [a, b, c, d] of piani) {
      const e = vx * a + vy * b + vz * c - d;
      if (e > 0) { vx -= a * e; vy -= b * e; vz -= c * e; }
    }
    // Scarto deterministico dalla posizione (arrotondata): uguale per i vertici coincidenti.
    const h = ((Math.round(vx * 997) * 73856093) ^ (Math.round(vy * 991) * 19349663) ^ (Math.round(vz * 983) * 83492791) ^ seme) >>> 0;
    const k = 1 + 0.07 * (((h % 1000) / 1000) - 0.5);
    p.setXYZ(i, vx * k * sx + x, vy * k * sy + y, vz * k * sz + z);
  }
  geo.computeVertexNormals();
  const scuro = new THREE.Color(COL.roccia[0]), chiaro = new THREE.Color(COL.roccia[1]), lichene = new THREE.Color('#8a8a5a');
  const nf = geo.attributes.normal;
  let tono = 1, lic = 0;
  return colora(geo, (c, px, py, pz, i) => {
    if (i % 3 === 0) { tono = rnd(); lic = rnd() < 0.08 ? 0.35 : 0; }
    const su = Math.max(0, nf.getY(i));
    c.copy(scuro).lerp(chiaro, 0.25 + 0.45 * tono + 0.3 * su).lerp(lichene, lic * su);
    c.multiplyScalar(0.55 + 0.45 * Math.min(1, Math.max(0, (py - y + 0.15 * r) / (0.5 * r))));   // base scura (contatto)
  });
}

// Colori (tarati sulla luce 3D, in tono con il terreno di terrain.js).
const COL = {
  corteccia: '#4f3d2c', cortecciaChiara: '#7d7468', cortecciaPino: '#6b4a34', cortecciaBetulla: '#8f8a80',
  foglia: ['#24431a', '#6a9440'], fogliaFaggio: ['#2c4d1c', '#7da24a'], fogliaRiva: ['#38592a', '#93ad62'],
  fogliaPino: ['#2e4a26', '#76904a'], ago: ['#15301f', '#3f6e45'], cespuglio: ['#2a4a1e', '#6a9040'],
  mugo: ['#1c3222', '#4a6a4a'], sterpo: '#8a7448', canna: ['#5f7a34', '#c4b46a'], roccia: ['#56565a', '#b2b0aa'],
  erba: ['#3f5a22', '#b8c070'], felce: ['#24461c', '#5f8f36'],
};

/** Ciuffo d'erba: fili piegati (due triangoli ciascuno), alla base scuri, in punta chiari. Il colore vero è per istanza. */
function ciuffoErba(rnd, fili = 14) {
  const pos = [], col = [];
  const ca = new THREE.Color(0.62, 0.66, 0.6), cb = new THREE.Color(1.12, 1.12, 1.0);
  for (let k = 0; k < fili; k++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.16, h = 0.18 + rnd() * 0.24, w = 0.02 + rnd() * 0.015;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const ox = Math.cos(a) * (0.08 + rnd() * 0.12), oz = Math.sin(a) * (0.08 + rnd() * 0.12);   // piega verso fuori
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const m = [bx + ox * 0.35, h * 0.55, bz + oz * 0.35], t = [bx + ox, h, bz + oz];
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, m[0] + px * 0.6, m[1], m[2] + pz * 0.6);
    pos.push(bx - px, 0, bz - pz, m[0] + px * 0.6, m[1], m[2] + pz * 0.6, m[0] - px * 0.6, m[1], m[2] - pz * 0.6);
    pos.push(m[0] - px * 0.6, m[1], m[2] - pz * 0.6, m[0] + px * 0.6, m[1], m[2] + pz * 0.6, ...t);
    for (const yy of [0, 0, 0.55, 0, 0.55, 0.55, 0.55, 0.55, 1]) { _c.copy(ca).lerp(cb, yy); col.push(_c.r, _c.g, _c.b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const nf = geo.attributes.normal;                  // l'erba prende luce come il prato: normali verso l'alto
  for (let i = 0; i < nf.count; i++) nf.setXYZ(i, nf.getX(i) * 0.3, 1, nf.getZ(i) * 0.3);
  geo.normalizeNormals();
  return geo;
}

/** Felce: fronde ad arco (strisce che si assottigliano) attorno al centro. */
function felce(rnd, fronde = 7) {
  const pos = [], col = [];
  const ca = new THREE.Color(COL.felce[0]), cb = new THREE.Color(COL.felce[1]);
  const S = 5;
  for (let k = 0; k < fronde; k++) {
    const a = (k / fronde) * Math.PI * 2 + rnd() * 0.5, L = 0.7 + rnd() * 0.5, alto = 0.45 + rnd() * 0.25;
    const ux = Math.cos(a), uz = Math.sin(a), px = -uz, pz = ux;
    const punto = (t) => [ux * L * t, alto * Math.sin(Math.PI * t * 0.85), uz * L * t];
    for (let s = 0; s < S; s++) {
      const t0 = s / S, t1 = (s + 1) / S, w0 = 0.16 * (1 - t0 * 0.9), w1 = 0.16 * (1 - t1 * 0.9);
      const p0 = punto(t0), p1 = punto(t1);
      const A = [p0[0] - px * w0, p0[1], p0[2] - pz * w0], B = [p0[0] + px * w0, p0[1], p0[2] + pz * w0];
      const C = [p1[0] - px * w1, p1[1], p1[2] - pz * w1], D = [p1[0] + px * w1, p1[1], p1[2] + pz * w1];
      pos.push(...A, ...B, ...D, ...A, ...D, ...C);
      for (const t of [t0, t0, t1, t0, t1, t1]) { _c.copy(ca).lerp(cb, 0.3 + 0.7 * t); col.push(_c.r, _c.g, _c.b); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const nf = geo.attributes.normal;
  for (let i = 0; i < nf.count; i++) nf.setXYZ(i, nf.getX(i) * 0.4, Math.abs(nf.getY(i)) + 0.6, nf.getZ(i) * 0.4);
  geo.normalizeNormals();
  return geo;
}

/**
 * Geometrie per tipo: un array di livelli { fino (m), varianti: [geo…], piatto (sfaccettato) }. Le varianti danno
 * forme diverse da vicino (ognuna una chiamata di disegno); in più ogni istanza ha scala e proporzioni sue.
 */
function creaModelli() {
  const rnd = casuale(20261119);
  const M = {};
  const F = COL.foglia, FF = COL.fogliaFaggio;

  // Latifoglie: quercia (larga e bassa), faggio (ovale e alto), castagno (irregolare, a due masse).
  // `det`: dettaglio dei ciuffi (1 = 80 triangoli, 0 = 20). Ogni specie ha il suo generatore: i due livelli vicini
  // hanno la stessa forma (stessi ciuffi negli stessi punti), cambia solo quanto sono sfaccettati.
  const quercia = (det) => { const r = casuale(311); return unisci([
    fusto(0.46, 0.3, 5.0, 8, COL.corteccia), ...rami(4, 3.6, 3.4, COL.corteccia, r),
    ...chioma({ y: 7.6, a: 4.6, b: 3.1, ciuffi: 30, raggio: [0.8, 1.45], dettaglio: det, scuro: F[0], chiaro: F[1], rnd: r }),
  ]); };
  const faggio = (det) => { const r = casuale(312); return unisci([
    fusto(0.36, 0.22, 6.5, 8, COL.cortecciaChiara), ...rami(3, 4.8, 3.0, COL.cortecciaChiara, r),
    ...chioma({ y: 9.4, a: 3.2, b: 4.4, ciuffi: 28, raggio: [0.75, 1.3], dettaglio: det, scuro: FF[0], chiaro: FF[1], rnd: r }),
  ]); };
  const castagno = (det) => { const r = casuale(313); return unisci([
    fusto(0.42, 0.26, 5.2, 8, COL.corteccia, { inclinaZ: -0.05 }), ...rami(3, 3.8, 3.2, COL.corteccia, r),
    ...chioma({ x: 0.8, y: 8.0, a: 3.4, b: 2.9, ciuffi: 20, raggio: [0.75, 1.3], dettaglio: det, scuro: F[0], chiaro: F[1], rnd: r }),
    ...chioma({ x: -2.4, y: 6.5, z: 0.6, a: 2.2, b: 1.9, ciuffi: 10, raggio: [0.7, 1.1], dettaglio: det, scuro: F[0], chiaro: F[1], rnd: r }),
  ]); };
  // Livelli (prestazioni, dopo la misura dell'utente: 28–30 FPS nel bosco; «meno definizione a centinaia di metri a
  // favore del realismo entro i 50 m»): vicino fino a 60 m, più ricco; medio fino a 300 m
  // con 3 ciuffi semplici (~70 triangoli); lontano un ciuffo solo e un fusto a 3 lati (~26).
  const latMedio = (a, b, y) => unisci([
    fusto(0.4, 0.26, y - b * 0.6, 4, COL.corteccia),
    ...chioma({ y, a, b, ciuffi: 3, raggio: [2.2, 2.8], dettaglio: 0, scuro: F[0], chiaro: F[1], rnd, morbido: 0.85, pieno: 0.3 }),
  ]);
  M.latifoglia = [
    // Misura nel bosco fitto (UHD 730): ~135 latifoglie entro 60 m da ~2450 triangoli valevano gran parte dei 6 ms
    // della vegetazione. Ciuffi pieni entro 25 m; da 25 a 60 m stessa chioma a ciuffi semplici (~650 triangoli).
    { fino: 25, varianti: [quercia(1), faggio(1), castagno(1)] },
    { fino: 60, varianti: [quercia(0), faggio(0), castagno(0)] },
    { fino: 300, varianti: [latMedio(4.2, 3.1, 7.6), latMedio(3.2, 4.2, 9.2)] },
    { fino: Infinity, sagoma: [SAGOME.latifogliaTonda, SAGOME.latifogliaOvale] },
  ];

  // Conifere: abete (largo, a palchi) e abete slanciato.
  const abete = (palchi, largo, alto) => unisci([
    fusto(0.32, 0.1, alto, 7, COL.corteccia),
    ...Array.from({ length: palchi }, (_, k) => {
      const t = k / palchi, r = largo * (1 - t * 0.85), h = (alto / palchi) * 1.9;
      return palco(r, h, 1.6 + t * (alto - 2.2), COL.ago[0], COL.ago[1], rnd);
    }),
  ]);
  M.conifera = [
    { fino: 60, varianti: [abete(8, 3.2, 14), abete(10, 2.3, 17)] },
    { fino: 300, varianti: [unisci([fusto(0.3, 0.15, 3, 3, COL.corteccia),
      palco(3.0, 7.5, 1.4, COL.ago[0], COL.ago[1], rnd, { lati: 6, segmenti: 1, punte: 0.15 }),
      palco(1.8, 7.0, 6.5, COL.ago[0], COL.ago[1], rnd, { lati: 6, segmenti: 1, punte: 0.15 })])] },
    { fino: Infinity, sagoma: [SAGOME.conifera] },
  ];

  // Pino domestico: ombrello piatto, o a due ripiani.
  const P = COL.fogliaPino;
  M.pino = [
    { fino: 60, varianti: [
      unisci([fusto(0.36, 0.2, 9.4, 8, COL.cortecciaPino, { inclinaZ: 0.06 }), ...rami(4, 7.6, 3.2, COL.cortecciaPino, rnd),
        ...chioma({ x: 0.55, y: 10.3, a: 4.6, b: 1.4, ciuffi: 18, raggio: [0.9, 1.4], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 })]),
      unisci([fusto(0.34, 0.2, 8.4, 8, COL.cortecciaPino, { inclinaZ: -0.08 }), ...rami(3, 6.6, 3.0, COL.cortecciaPino, rnd),
        ...chioma({ x: -0.6, y: 9.6, a: 3.6, b: 1.3, ciuffi: 12, raggio: [0.9, 1.3], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 }),
        ...chioma({ x: 1.6, y: 8.1, z: 0.8, a: 2.2, b: 0.9, ciuffi: 6, raggio: [0.8, 1.1], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 })]),
    ] },
    { fino: 300, varianti: [unisci([fusto(0.34, 0.22, 9.2, 4, COL.cortecciaPino, { inclinaZ: 0.06 }),
      ...chioma({ x: 0.5, y: 10.2, a: 4.2, b: 1.3, ciuffi: 3, raggio: [1.8, 2.3], dettaglio: 0, scuro: P[0], chiaro: P[1], rnd, morbido: 0.85 })])] },
    { fino: Infinity, sagoma: [SAGOME.pino] },
  ];

  // Albero di riva (pioppo): colonna alta e stretta, verde più chiaro, corteccia chiara.
  const R = COL.fogliaRiva;
  M.riva = [
    { fino: 60, varianti: [unisci([fusto(0.38, 0.14, 14, 8, COL.cortecciaBetulla), ...rami(3, 5, 3.0, COL.cortecciaBetulla, rnd),
      ...chioma({ y: 10.5, a: 2.0, b: 5.4, ciuffi: 28, raggio: [0.65, 1.05], scuro: R[0], chiaro: R[1], rnd })])] },
    { fino: 300, varianti: [unisci([fusto(0.34, 0.2, 6, 4, COL.cortecciaBetulla),
      ...chioma({ y: 10.5, a: 1.9, b: 5.2, ciuffi: 3, raggio: [1.6, 2.0], dettaglio: 0, scuro: R[0], chiaro: R[1], rnd, morbido: 0.85, pieno: 0.4 })])] },
    { fino: Infinity, sagoma: [SAGOME.riva] },
  ];

  // Albero secco: fusto e rami spogli.
  M.secco = [
    { fino: 60, varianti: [unisci([fusto(0.3, 0.1, 7.5, 7, COL.cortecciaChiara), ...rami(6, 2.8, 3.0, COL.cortecciaChiara, rnd)])] },
    { fino: 300, varianti: [unisci([fusto(0.3, 0.12, 7, 4, COL.cortecciaChiara), ...rami(2, 3.5, 2.8, COL.cortecciaChiara, rnd)])] },
    { fino: Infinity, sagoma: [SAGOME.secco] },
  ];

  // Cespugli: ciuffi su una cupola bassa (due forme da vicino).
  const C = COL.cespuglio, MG = COL.mugo;
  M.cespuglio = [
    { fino: 35, varianti: [
      unisci(chioma({ y: 0.55, a: 1.0, b: 0.65, ciuffi: 7, raggio: [0.4, 0.6], scuro: C[0], chiaro: C[1], rnd, sotto: 0, pieno: 0.3 })),
      unisci(chioma({ y: 0.7, a: 0.8, b: 0.85, ciuffi: 7, raggio: [0.35, 0.55], scuro: C[0], chiaro: C[1], rnd, sotto: 0, pieno: 0.3 })),
    ] },
    { fino: 160, varianti: [unisci(chioma({ y: 0.55, a: 0.9, b: 0.65, ciuffi: 3, raggio: [0.5, 0.7], dettaglio: 0, scuro: C[0], chiaro: C[1], rnd, sotto: 0, morbido: 0.85 }))] },
  ];
  M['arbusto alto'] = [
    { fino: 35, varianti: [unisci(chioma({ y: 0.35, a: 1.4, b: 0.45, ciuffi: 8, raggio: [0.4, 0.6], scuro: MG[0], chiaro: MG[1], rnd, sotto: 0, pieno: 0.3 }))] },
    { fino: 160, varianti: [unisci(chioma({ y: 0.35, a: 1.3, b: 0.45, ciuffi: 3, raggio: [0.5, 0.7], dettaglio: 0, scuro: MG[0], chiaro: MG[1], rnd, sotto: 0, morbido: 0.85 }))] },
  ];

  // Sterpo: ramaglie secche a raggiera.
  M.sterpo = [{ fino: 130, varianti: [unisci(Array.from({ length: 7 }, (_, k) =>
    fusto(0.04, 0.01, 0.9 + 0.3 * (k % 3), 3, COL.sterpo, { inclinaZ: 0.6 * Math.cos(k * 0.9), inclinaX: 0.6 * Math.sin(k * 0.9), sotto: 0.1 })))] }];

  // Canne: ciuffo di steli sottili con la punta chiara.
  M.canne = [{ fino: 110, varianti: [unisci(Array.from({ length: 11 }, (_, k) => {
    const a = k * 2.4, d = 0.15 + 0.25 * ((k * 7) % 5) / 5;
    return cono(0.035, 1.6 + 0.6 * ((k * 3) % 4) / 4, 3, 0, COL.canna[0], COL.canna[1],
      { x: d * Math.cos(a), z: d * Math.sin(a), inclinaX: 0.12 * Math.sin(a), inclinaZ: 0.12 * Math.cos(a), frastaglio: 0, rnd });
  }))] }];

  // Rocce spigolose (richiesta dell'utente): più forme, proporzioni per istanza, grigi diversi. Sasso, masso (anche
  // enorme, nelle frane), affioramento largo e basso fatto di lastre.
  const R1 = (r, o) => rocciaSpigolosa(r, rnd, o);
  M.sasso = [{ fino: 100, piatto: true, varianti: [
    unisci([R1(0.32, { dettaglio: 0, tagli: 5, y: 0.06, sy: 0.6 })]),
    unisci([R1(0.3, { dettaglio: 0, tagli: 6, y: 0.05, sx: 1.4, sy: 0.45 })]),
    unisci([R1(0.3, { dettaglio: 0, tagli: 6, y: 0.1, sy: 0.9, sz: 0.7 })]),
  ] }];
  M.masso = [
    { fino: 160, piatto: true, varianti: [
      unisci([R1(1.2, { tagli: 9, y: 0.3, sy: 0.72 })]),
      unisci([R1(1.1, { tagli: 8, y: 0.25, sx: 1.45, sy: 0.55 }), R1(0.6, { dettaglio: 0, tagli: 5, x: 1.2, y: 0.15, z: 0.6, sy: 0.7 })]),
      unisci([R1(1.15, { tagli: 10, y: 0.45, sx: 0.85, sy: 1.05, sz: 0.9, profondita: [0.45, 0.75] })]),
    ] },
    { fino: Infinity, piatto: true, varianti: [unisci([R1(1.2, { dettaglio: 0, tagli: 6, y: 0.3, sy: 0.75 })])] },
  ];
  M.affioramento = [{ fino: Infinity, piatto: true, varianti: [
    unisci([R1(1.0, { tagli: 9, y: 0.1, sx: 3.6, sy: 0.8, sz: 2.2 }), R1(0.8, { tagli: 7, x: 2.0, y: 0.25, z: 0.6, sx: 1.6, sy: 1.1, sz: 1.3 }),
      R1(0.6, { dettaglio: 0, tagli: 5, x: -2.6, y: 0.1, z: -0.8, sx: 1.5, sy: 0.6 })]),
    unisci([R1(1.0, { tagli: 8, y: 0.2, sx: 2.6, sy: 1.0, sz: 1.6 }), R1(0.9, { tagli: 8, x: -1.6, y: 0.1, z: 1.4, sx: 1.8, sy: 0.7, sz: 1.4 })]),
  ] }];

  // Tronco caduto: cilindro coricato con due monconi di ramo.
  const tronco = fusto(0.3, 0.24, 5, 7, COL.corteccia, { sotto: 0, chiuso: true });
  tronco.rotateZ(Math.PI / 2); tronco.translate(2.5, 0.22, 0);
  const moncone = fusto(0.09, 0.05, 0.8, 4, COL.corteccia, { x: -1.2, y: 0.4, inclinaZ: 0.7, sotto: 0 });
  M.tronco = [{ fino: 250, varianti: [unisci([tronco, moncone])] }];

  // Sorgenti dell'atlante delle sagome (nell'ordine di SAGOME): i modelli vicini.
  M.sorgentiSagome = [M.latifoglia[0].varianti[0], M.latifoglia[0].varianti[1], M.conifera[0].varianti[0],
    M.pino[0].varianti[0], M.riva[0].varianti[0], M.secco[0].varianti[0]];
  return M;
}

// ─── Sagome (impostor) degli alberi lontani ─────────────────────────────
// Concordato con l'utente e con la sessione delle prestazioni: oltre la media distanza (e negli ultimi 150 m verso il
// bordo del blocco) gli alberi sono sagome, cioè due triangoli rivolti alla camera con l'immagine dell'albero vero,
// disegnata dal codice al caricamento in un atlante; le stesse sagome continuano il bosco negli anelli dell'orizzonte
// fino a ~4 km (boscoLontano), così il bosco non finisce al bordo del blocco. Alpha test, niente trasparenza ordinata.

const ATLANTE = { tessera: 256, tessere: 8 };   // 2048×256 RGBA (2 MB)

/**
 * Atlante delle sagome: ogni modello disegnato di lato, con luce dall'alto, in una tessera quadrata.
 * @returns {{ texture: THREE.Texture, lato: number[], target: THREE.WebGLRenderTarget }}  lato: misura (m) della tessera
 */
function creaAtlante(renderer, geometrie) {
  const { tessera: T, tessere: N } = ATLANTE;
  const target = new THREE.WebGLRenderTarget(T * N, T, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const scena = new THREE.Scene();
  scena.add(new THREE.HemisphereLight('#dfe9f0', '#5a5040', 1.6));
  const luce = new THREE.DirectionalLight('#fff4e0', 2.2);
  luce.position.set(0.5, 1, 0.8);
  scena.add(luce);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const prima = { target: renderer.getRenderTarget(), alpha: renderer.getClearAlpha(), auto: renderer.autoClear };
  const colore = new THREE.Color();
  renderer.getClearColor(colore);
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.autoClear = false;
  const lato = [];
  geometrie.forEach((geo, i) => {
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const S = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y) * 1.04;   // tessera quadrata, base a terra
    lato.push(S);
    camera.left = -S / 2; camera.right = S / 2; camera.bottom = 0; camera.top = S;
    camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const m = new THREE.Mesh(geo, mat);
    scena.add(m);
    target.viewport.set(i * T, 0, T, T);
    target.scissor.set(i * T, 0, T, T);
    target.scissorTest = true;
    renderer.setRenderTarget(target);
    renderer.render(scena, camera);
    scena.remove(m);
  });
  target.scissorTest = false;
  renderer.setRenderTarget(prima.target);
  renderer.setClearColor(colore, prima.alpha);
  renderer.autoClear = prima.auto;
  mat.dispose();
  return { texture: target.texture, lato, target };
}

/** Materiale delle sagome: rivolte alla camera attorno all'asse verticale, luce come il terreno (normale in alto). */
function materialeSagome(texture) {
  const mat = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTessera;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vMapUv = vec2((uv.x + aTessera) / ${ATLANTE.tessere.toFixed(1)}, uv.y);`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', `
  vec3 kdC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float kdS = length(instanceMatrix[0].xyz);
  vec3 kdV = cameraPosition - kdC; kdV.y = 0.0;
  vec3 kdR = normalize(vec3(kdV.z, 0.0, -kdV.x) + vec3(1e-4, 0.0, 0.0));
  vec4 mvPosition = viewMatrix * vec4(kdC + kdR * position.x * kdS + vec3(0.0, position.y * kdS, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'kd-sagome-1';
  return mat;
}

/** Quadrato di lato 1, base a terra al centro (x −0,5…0,5, y 0…1). */
function quadSagoma() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** InstancedMesh di sagome con capacità `n` (matrici scritte a mano: posizione e scala). */
function meshSagome(materiale, n, nome) {
  const m = new THREE.InstancedMesh(quadSagoma(), materiale, Math.max(1, n));
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const t = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1);
  t.setUsage(THREE.DynamicDrawUsage);
  m.geometry.setAttribute('aTessera', t);
  m.frustumCulled = false;
  m.count = 0; m.visible = false;
  m.name = nome;
  return m;
}

/** Scrive in `a` (matrici) al posto j una sagoma in (x, y, z) di lato s. */
function scriviSagoma(a, j, x, y, z, s) {
  const o = j * 16;
  a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}
const SAGOMA_BORDO = { fascia: 150, oltre: 120 };
// Sagome del blocco diradate con la distanza dalla camera (misura nel bosco fitto: 59 000 sagome, 3,3 ms): piene fino
// a `da` m, poi la densità cala come (da/d)², la stessa legge del bosco lontano (cella 10 m al bordo del blocco, cioè
// il 36 % della densità del blocco): al bordo le due densità si raccordano. Gli alberi dietro sono comunque coperti.
const SAGOME_DIRADA = { da: 600 };

// ─── Collisioni (passo 3; deciso con l'utente: tronchi, massi, affioramenti e sassi grandi bloccano; arbusti, erba e
// sassi piccoli si attraversano) ───
// Cerchi sul piano in una griglia di 16 m: si controllano solo le celle attorno al cavaliere. Raggio per tipo al
// modello di scala 1 (m), moltiplicato per la scala dell'istanza; il tronco caduto è una fila di tre cerchi.
const COLLISIONI = { cella: 16, sassoMinimo: 1.1,
  raggio: { latifoglia: 0.42, conifera: 0.34, pino: 0.38, riva: 0.4, secco: 0.32, masso: 1.05, affioramento: 2.3,
    sasso: 0.3, tronco: 0.32 } };

function creaCollisioni(pos) {
  const C = COLLISIONI, celle = new Map();
  const aggiungi = (x, z, r) => {
    const i0 = Math.floor((x - r) / C.cella), i1 = Math.floor((x + r) / C.cella);
    const j0 = Math.floor((z - r) / C.cella), j1 = Math.floor((z + r) / C.cella);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i * 100003 + j;
      let l = celle.get(k);
      if (!l) celle.set(k, (l = []));
      l.push(x, z, r);
    }
  };
  let n = 0;
  for (const [nome, t] of Object.entries(pos.tipi)) {
    const r0 = C.raggio[nome];
    if (!r0) continue;
    for (let k = 0; k < t.n; k++) {
      const o = k * STRIDE, x = t.dati[o], z = t.dati[o + 2], s = t.dati[o + 3], rot = t.dati[o + 4], v = t.dati[o + 5];
      if (nome === 'sasso' && s < C.sassoMinimo) continue;           // i sassi piccoli si attraversano
      if (t.gruppo === 'rocce') {
        const largo = 0.7 + 0.8 * ((v * 3.71) % 1), lungo = 0.7 + 0.7 * ((v * 7.13) % 1);   // come le istanze
        aggiungi(x, z, r0 * s * (largo + lungo) / 2);
      } else if (nome === 'tronco') {
        for (const d of [0.6, 2.5, 4.4]) aggiungi(x + Math.cos(rot) * d * s, z - Math.sin(rot) * d * s, r0 * s);
      } else aggiungi(x, z, r0 * Math.max(0.6, s));
      n++;
    }
  }
  /** Punto (x, z) spinto fuori dai tronchi e dalle rocce (raggio del cavaliere), o null se libero. */
  function spingiFuori(x, z, raggio) {
    const l = celle.get(Math.floor(x / C.cella) * 100003 + Math.floor(z / C.cella));
    if (!l) return null;
    let mosso = false;
    for (let iter = 0; iter < 3; iter++) {
      let qui = false;
      for (let k = 0; k < l.length; k += 3) {
        const ex = x - l[k], ez = z - l[k + 1], min = l[k + 2] + raggio, d2 = ex * ex + ez * ez;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-6) { x = l[k] + ex / d * min; z = l[k + 1] + ez / d * min; } else x = l[k] + min;
        qui = mosso = true;
      }
      if (!qui) break;
    }
    return mosso ? { x, z } : null;
  }
  return { spingiFuori, n };
}   // m: vicino al bordo del blocco, oltre questa distanza, sagome

// ─── Istanze ─────────────────────────────────────────────────────────────

/** Variazione per istanza: tono (chiaro/scuro e più giallo o più verde) e proporzioni. */
const TONO = {
  alberi: [0.8, 1.15, 0.14], arbusti: [0.8, 1.12, 0.12], acqua: [0.85, 1.1, 0.1],
  rocce: [0.62, 1.2, 0], bosco: [0.8, 1.05, 0],
};
const GIALLO = new THREE.Color('#d9c85a');
const RIDISTRIBUISCI = { ms: 1.5, pezzo: 3000 };   // tempo per fotogramma e alberi tra un controllo e l'altro
const RIASSEGNA_DOPO = 12;              // m di spostamento della camera prima di ridistribuire le istanze
// Raggi lunghi con densità bassa (richiesta dell'utente: il bordo del cerchio a ~30 m si vedeva).
const VICINO = { erba: { raggio: 70, max: 12000 }, felce: { raggio: 70, max: 3000 }, ciottolo: { raggio: 50, max: 6000 }, rifai: 5 };

/**
 * Materiale di erba e felci: fili e fronde sono a una faccia vista dai due lati; la normale non si capovolge sul retro
 * (altrimenti il retro guarda in basso e resta nero), così prendono la luce come il prato. Niente vento (deciso con
 * l'utente: niente iperrealismo).
 */
function materialeFili(opz) {
  const mat = new THREE.MeshLambertMaterial({ ...opz, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'kd-fili-1';
  return mat;
}

// ─── Visuale pulita (richiesta dell'utente: nel bosco tronchi e chiome si mettevano tra la camera e il cavaliere) ───
// Ciò che sta tra la camera e il cavaliere si dirada «a retino»: ogni oggetto ha un grado di dissolvenza calcolato
// nello shader dalla posizione dell'istanza (tutto l'albero insieme, non un buco nel mezzo) e perde pixel secondo
// una trama 4×4 fissa sullo schermo; del tutto diradato non si disegna proprio. Niente trasparenze ordinate.
//  - alberi, arbusti, rocce: spariti se più vicini alla camera del cavaliere di `prima` m (lungo la direzione di
//    vista, sul piano); visibili da `dopo` m prima di lui in poi; vicino alla linea camera→cavaliere (entro
//    `largo` m più il raggio della chioma) spariscono fino alla sua altezza: così sparisce anche l'abete col tronco
//    di fianco al cavaliere ma la chioma davanti. Accanto e davanti al cavaliere il resto rimane.
//  - erba e felci: solo quelle a ridosso della camera (entro `vicino` m).
// Valori provabili dalla console: kd.vegetazione.cfgVisuale (x = prima, y = dopo, z = largo, w = vicino).

const VISUALE = { prima: 1.8, dopo: 0.5, largo: 1.4, vicino: 1.6 };

/** Raggio orizzontale massimo di una geometria (m, prima della scala dell'istanza). */
function raggioOrizzontale(geo) {
  const p = geo.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  return r;
}

/**
 * Aggiunge al materiale il diradamento della visuale. modo: 'pieno' (alberi, arbusti, rocce) | 'vicino' (erba, felci).
 * `raggio`: raggio orizzontale della geometria (solo 'pieno').
 */
function conVisuale(mat, uni, modo, raggio = 0) {
  const prima = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prima(sh, renderer);
    sh.uniforms.uCav = uni.uCav;
    sh.uniforms.uVisuale = uni.uVisuale;
    sh.uniforms.uVisCfg = uni.uVisCfg;
    sh.uniforms.uRaggio = { value: raggio };
    const calcolo = modo === 'pieno' ? `
      vec2 kdAsse = uCav.xz - cameraPosition.xz;
      float kdL = length(kdAsse);
      vec2 kdU = kdAsse / max(kdL, 1e-3);
      vec2 kdRel = kdO.xz - cameraPosition.xz;
      float kdT = dot(kdRel, kdU);                                   // profondità lungo la vista
      float kdD = abs(dot(kdRel, vec2(-kdU.y, kdU.x)));               // distanza dalla linea camera→cavaliere
      float kdProf = 1.0 - smoothstep(kdL - uVisCfg.x, kdL - uVisCfg.y, kdT);
      float kdR = uRaggio * length(instanceMatrix[0].xyz);           // raggio della chioma dell'istanza
      float kdLinea = (1.0 - smoothstep(kdL - 0.6, kdL, kdT)) * (1.0 - smoothstep(uVisCfg.z + kdR, uVisCfg.z + kdR + 1.0, kdD));
      vKdDirada = max(kdProf, kdLinea) * uVisuale;` : `
      vKdDirada = (1.0 - smoothstep(uVisCfg.w * 0.5, uVisCfg.w, distance(kdO, cameraPosition))) * uVisuale;`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCav;
uniform float uVisuale;
uniform vec4 uVisCfg;
uniform float uRaggio;
varying float vKdDirada;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
    {
      vec3 kdO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;${calcolo}
      if (vKdDirada > 0.999) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // tutto diradato: fuori dallo schermo
    }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vKdDirada;
const float KD_RETINO[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);`)
      .replace('void main() {', `void main() {
  if (vKdDirada > 0.0) {
    ivec2 kdI = ivec2(mod(gl_FragCoord.xy, 4.0));
    if (vKdDirada >= (KD_RETINO[kdI.y * 4 + kdI.x] + 0.5) / 16.0) discard;
  }`);
  };
  const chiave = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${chiave()}|kd-visuale-${modo}-1`;
  return mat;
}

/**
 * Oggetto 3D della vegetazione del blocco.
 * @param {object} pos  esito di posizionaVegetazione (tipi, suolo, erbaAttorno, ms, msCampi)
 * @param {object} [terrain]  terreno della Scena: riceve il suolo (lettiera, fango) e dà il colore all'erba
 * @returns {{ oggetto: THREE.Group, aggiorna: (x: number, z: number, t?: number) => void, conteggi: Object<string, number>,
 *   totale: number, msPosiziona: number, msCampi: number, msCostruzione: number, statistiche: () => object }}
 */
// ─── Ombre finte e piede scuro (richiesta dell'utente: gli oggetti sembravano sospesi sopra il terreno) ───
// Nel gioco non ci sono ombre proiettate (costerebbero un secondo disegno della scena). Al loro posto due texture del
// blocco lette dallo shader del suolo (terrain.js, materialeSuolo): l'ombra di ogni albero, cespuglio e roccia, a
// macchia sfumata spostata dalla parte opposta al sole e allungata quando il sole è basso (ridisegnata quando il sole si
// sposta, a pezzi su più fotogrammi); e il piede scuro attorno al punto di contatto, fisso. Una lettura per pixel.

/** Per tipo: altezza del centro della chioma o dell'oggetto (h), raggio (r), mezza altezza (v), ombra (a), piede (p, m). */
const FORMA_OMBRA = {
  latifoglia: { h: 7.6, r: 3.6, v: 3.0, a: 0.75, p: 1.6 }, conifera: { h: 7.0, r: 2.6, v: 6.0, a: 0.8, p: 1.4 },
  pino: { h: 10.2, r: 4.0, v: 1.3, a: 0.7, p: 1.4 }, riva: { h: 10.5, r: 2.0, v: 5.0, a: 0.7, p: 1.4 },
  secco: { h: 5.0, r: 1.8, v: 2.5, a: 0.3, p: 1.0 }, cespuglio: { h: 0.55, r: 1.0, v: 0.6, a: 0.6, p: 1.2 },
  'arbusto alto': { h: 0.35, r: 1.3, v: 0.4, a: 0.6, p: 1.4 }, sterpo: { h: 0.5, r: 0.6, v: 0.5, a: 0.3, p: 0.6 },
  canne: { h: 1.0, r: 0.45, v: 1.0, a: 0.4, p: 0.6 }, sasso: { h: 0.1, r: 0.35, v: 0.15, a: 0.6, p: 0.45 },
  masso: { h: 0.4, r: 1.3, v: 0.8, a: 0.7, p: 1.6 }, affioramento: { h: 0.2, r: 3.0, v: 0.6, a: 0.6, p: 3.2 },
  tronco: { h: 0.25, r: 1.6, v: 0.3, a: 0.5, p: 1.8 },
};
const OMBRE = { lato: 1024, latoPiede: 2048, rifaiGradi: 5, perFotogramma: 8000, forza: 0.5, piede: 0.42 };

// Le ombre si calcolano in JavaScript su un array di byte (texture a un canale), NON con una tela 2D: con la tela e
// il modo «lighten» il browser lavora sulla GPU e copia l'immagine intera per ogni oggetto; con ~78 000 oggetti un
// fotogramma superava i 2 s e Windows resettava la GPU (WebGL CONTEXT_LOST, seme 570549, dopo la PR #116).

/** Texture a un canale (rosso) da un array di byte, senza mipmap. */
function texturaCanale(dati, lato) {
  const t = new THREE.DataTexture(dati, lato, lato, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Stampa un'ellisse sfumata (massimo con il contenuto) in `buf` (lato × lato byte). Centro (cx, cz) e semiassi
 * a (lungo la direzione ux, uz) e b in pixel; `forza` 0–1.
 */
function stampa(buf, lato, cx, cz, a, b, ux, uz, forza) {
  const R = Math.max(a, b), x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(lato - 1, Math.ceil(cx + R));
  const z0 = Math.max(0, Math.floor(cz - R)), z1 = Math.min(lato - 1, Math.ceil(cz + R));
  if (x0 > x1 || z0 > z1) return;
  const ia = 1 / Math.max(a, 0.5), ib = 1 / Math.max(b, 0.5), f = forza * 255;
  for (let z = z0; z <= z1; z++) {
    const dz = z + 0.5 - cz, riga = z * lato;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const u = (dx * ux + dz * uz) * ia, w = (-dx * uz + dz * ux) * ib, t = u * u + w * w;
      if (t >= 1) continue;
      const v = f * (t < 0.3 ? 1 : (1 - t) / 0.7);
      if (v > buf[riga + x]) buf[riga + x] = v;
    }
  }
}

/**
 * Ombre del blocco. `oggetti`: Float32Array [x, z, s, tipo…] (coordinate locali). Restituisce le due texture e
 * `passo(sole)`: avanza il calcolo delle ombre del sole (a pezzi) e, quando ha finito, aggiorna la texture.
 */
function creaOmbre(oggetti, forme, half) {
  const n = oggetti.length / 4;
  // Piede: fisso, calcolato subito.
  const LP = OMBRE.latoPiede, kp = LP / (2 * half), bp = new Uint8Array(LP * LP);
  for (let i = 0; i < n; i++) {
    const f = forme[oggetti[i * 4 + 3]], r = f.p * oggetti[i * 4 + 2] * kp;
    stampa(bp, LP, (oggetti[i * 4] + half) * kp, (oggetti[i * 4 + 1] + half) * kp, r, r, 1, 0, 0.85);
  }
  const piede = texturaCanale(bp, LP);
  // Sole: due array, uno mostrato e uno in lavorazione.
  const L = OMBRE.lato, ko = L / (2 * half);
  const buf = [new Uint8Array(L * L), new Uint8Array(L * L)];
  const sole = texturaCanale(buf[0], L);
  let mostrato = 0, lavoro = null, disegnato = null;
  function passo(dir) {
    if (!lavoro) {
      if (dir.y < 0.03) return;
      if (disegnato && disegnato.angleTo(dir) < OMBRE.rifaiGradi * Math.PI / 180) return;
      const b = buf[1 - mostrato];
      b.fill(0);
      const dx = -dir.x, dz = -dir.z, l = Math.hypot(dx, dz) || 1;
      const cot = Math.min(4, Math.sqrt(1 - dir.y * dir.y) / Math.max(dir.y, 0.05));
      lavoro = { b, i: 0, ux: dx / l, uz: dz / l, cot, dir: dir.clone() };
    }
    // La prima volta tutto subito (si è appena caricata la Scena); poi a pezzi, per non dare scatti.
    const { b, ux, uz, cot } = lavoro, fine = disegnato ? Math.min(n, lavoro.i + OMBRE.perFotogramma) : n;
    for (let i = lavoro.i; i < fine; i++) {
      const f = forme[oggetti[i * 4 + 3]], s = oggetti[i * 4 + 2];
      const sposta = f.h * s * cot, a = (f.r * s + f.v * s * cot) * ko, r = f.r * s * ko;
      const cx = (oggetti[i * 4] + ux * sposta + half) * ko, cz = (oggetti[i * 4 + 1] + uz * sposta + half) * ko;
      stampa(b, L, cx, cz, a, r, ux, uz, f.a);
    }
    lavoro.i = fine;
    if (fine >= n) {                         // finito: si mostra l'array nuovo
      mostrato = 1 - mostrato;
      sole.image.data = buf[mostrato];
      sole.needsUpdate = true;
      disegnato = lavoro.dir;
      lavoro = null;
    }
  }
  return { sole, piede, passo, oggetti: n };
}

export function creaVegetazione(pos, terrain = null, renderer = null) {
  const t0 = performance.now();
  const oggetto = new THREE.Group();
  oggetto.name = 'vegetazione';
  const modelli = creaModelli();

  // Suolo: lettiera sotto il bosco e fango vicino all'acqua (shader del terreno, terrain.js).
  const superficie = terrain?.mesh.getObjectByName('terreno-superficie');
  const nVertici = terrain ? terrain.meta.cols * terrain.meta.rows : 0;
  let coloriTerreno = null;
  if (superficie && pos.suolo && superficie.geometry.attributes.position.count === nVertici) {
    superficie.geometry.setAttribute('aSuolo', new THREE.BufferAttribute(pos.suolo, 3));
    // Campi coltivati: origine (avvolta sul periodo del suolo, come vMondo), verso dei solchi e raggio degli orti.
    const uC = superficie.material?.userData?.uniformi?.uCampi;
    if (uC && pos.campi) {
      const P = SUOLO.periodo, c = pos.campi;
      uC.value.set(((c.x % P) + P) % P, ((c.z % P) + P) % P, c.ux, c.uz);
      superficie.material.userData.uniformi.uOrti.value = c.orti;
    }
    coloriTerreno = superficie.geometry.attributes.color?.array || null;
  }

  // Uniformi condivise da tutti i materiali della vegetazione (visuale pulita)
  const uniVis = {
    uCav: { value: new THREE.Vector3() },
    uVisuale: { value: 0 },                   // 0 finché non arriva la posizione del cavaliere
    uVisCfg: { value: new THREE.Vector4(VISUALE.prima, VISUALE.dopo, VISUALE.largo, VISUALE.vicino) },
  };

  // Sagome: atlante (serve il renderer) e mesh delle sagome del blocco, comune a tutti gli alberi.
  let atlante = null, matSagome = null, sagomeBlocco = null;
  if (renderer) {
    atlante = creaAtlante(renderer, modelli.sorgentiSagome);
    matSagome = materialeSagome(atlante.texture);
    const nAlberi = Object.values(pos.tipi).filter((t) => t.gruppo === 'alberi').reduce((s, t) => s + t.n, 0);
    sagomeBlocco = meshSagome(matSagome, nAlberi, 'vegetazione-sagome');
    oggetto.add(sagomeBlocco);
  }
  const halfBlocco = terrain ? terrain.half : 1000;

  const tipi = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [nome, t] of Object.entries(pos.tipi)) {
    const livelli = modelli[nome];
    if (!livelli || !t.n) continue;
    // Matrici e colori di tutte le istanze, calcolati una volta.
    const matrici = new Float32Array(t.n * 16), colori = new Float32Array(t.n * 3), xz = new Float32Array(t.n * 2);
    const varia = new Float32Array(t.n);
    const [lo, hi, giallo] = TONO[t.gruppo] || [0.9, 1.1, 0];
    const roccia = t.gruppo === 'rocce', albero = t.gruppo === 'alberi';
    for (let k = 0; k < t.n; k++) {
      const d = t.dati, o = k * STRIDE;
      const s = d[o + 3], rot = d[o + 4], v = d[o + 5];
      p.set(d[o], d[o + 1] + (roccia ? -0.15 * s : 0), d[o + 2]);
      // Rocce inclinate; alberi e arbusti tra slanciati e tozzi, larghi e stretti, con un'inclinazione minima.
      const v2 = (v * 7.13) % 1, v3 = (v * 3.71) % 1;
      e.set(roccia ? (v - 0.5) * 0.5 : (v2 - 0.5) * 0.06, rot, roccia ? (v3 - 0.5) * 0.4 : (v3 - 0.5) * 0.06);
      q.setFromEuler(e);
      const largo = roccia ? 0.7 + 0.8 * v3 : 0.8 + 0.45 * v3;
      const v4 = (v * 17.31) % 1;              // altezza indipendente dalla larghezza (richiesta dell'utente)
      const alto = roccia ? 0.55 + 0.7 * v : (albero ? 0.72 + 0.56 * v4 : 0.85 + 0.3 * v4);
      sc.set(s * largo, s * alto, s * (roccia ? 0.7 + 0.7 * v2 : largo * (0.9 + 0.2 * v2)));
      m4.compose(p, q, sc).toArray(matrici, k * 16);
      xz[k * 2] = d[o]; xz[k * 2 + 1] = d[o + 2];
      varia[k] = (v * 11.37) % 1;
      const b = lo + (hi - lo) * ((v * 13) % 1);
      if (roccia) {                            // grigi caldi (bruni) e freddi (azzurrini), chiari e scuri
        const w = (v * 5.3) % 1 - 0.5;
        _c.setRGB(b * (1 + 0.12 * w), b * (1 + 0.03 * w), b * (1 - 0.12 * w));
      } else _c.setRGB(b, b, b).lerp(GIALLO, giallo * ((v * 5) % 1));
      colori[k * 3] = _c.r; colori[k * 3 + 1] = _c.g; colori[k * 3 + 2] = _c.b;
    }
    // Sagome per albero (livello lontano): posizione, lato e tessera.
    const lSagoma = livelli.findIndex((L) => L.sagoma);
    let sag = null, caso = null;
    if (lSagoma >= 0 && atlante) {
      const tess = livelli[lSagoma].sagoma;
      sag = new Float32Array(t.n * 5);
      caso = new Float32Array(t.n);
      for (let k = 0; k < t.n; k++) {
        const ox = t.dati[k * STRIDE], oz = t.dati[k * STRIDE + 2];
        caso[k] = (Math.abs(Math.sin(ox * 12.9898 + oz * 78.233) * 43758.5453)) % 1;   // fisso per albero
        const o = k * STRIDE, ti = tess[Math.floor(varia[k] * tess.length)];
        const alto = 0.72 + 0.56 * ((t.dati[o + 5] * 17.31) % 1);
        sag.set([t.dati[o], t.dati[o + 1], t.dati[o + 2], atlante.lato[ti] * t.dati[o + 3] * alto, ti], k * 5);
      }
    }
    const mesh = livelli.map((L) => (L.sagoma ? [] : L.varianti).map((geo, vi) => {
      const m = new THREE.InstancedMesh(geo,
        conVisuale(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!L.piatto }), uniVis, 'pieno',
          raggioOrizzontale(geo)), t.n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(t.n * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;                 // le istanze coprono tutto il blocco
      m.count = 0;
      m.visible = false;
      m.name = `vegetazione-${nome}-${L.fino}-${vi}`;
      oggetto.add(m);
      return m;
    }));
    tipi.push({ nome, n: t.n, livelli, mesh, matrici, colori, xz, varia, lSagoma, sag, caso });
  }

  // Ombre finte e piede scuro nello shader del suolo (solo il mondo generato: materialeSuolo).
  const uniSuolo = superficie?.material?.userData?.uniformi;
  let ombre = null;
  if (uniSuolo && terrain) {
    const nomi = Object.keys(FORMA_OMBRA), forme = nomi.map((k) => FORMA_OMBRA[k]);
    const lista = [];
    nomi.forEach((nome, ti) => {
      const t = pos.tipi[nome];
      if (!t) return;
      for (let k = 0; k < t.n; k++) lista.push(t.dati[k * STRIDE], t.dati[k * STRIDE + 2], t.dati[k * STRIDE + 3], ti);
    });
    ombre = creaOmbre(Float32Array.from(lista), forme, terrain.half);
    uniSuolo.uOmbre.value = ombre.sole;
    uniSuolo.uPiede.value = ombre.piede;
    uniSuolo.uOmbreForza.value.set(0, OMBRE.piede);
  }

  // Erba e felci attorno alla camera: ricalcolate ogni pochi metri (posizionamento deterministico, js/mondo).
  const rnd = casuale(77);
  const vicini = {
    erba: { geo: ciuffoErba(rnd), fili: true, ...VICINO.erba },
    felce: { geo: felce(rnd), fili: true, ...VICINO.felce },
    ciottolo: { geo: unisci([rocciaSpigolosa(0.12, rnd, { dettaglio: 0, tagli: 5, y: 0.02, sy: 0.6 })]), piatto: true, ...VICINO.ciottolo },
  };
  for (const [nome, V] of Object.entries(vicini)) {
    V.mesh = new THREE.InstancedMesh(V.geo, V.fili
      ? conVisuale(materialeFili({ vertexColors: true }), uniVis, 'vicino')
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!V.piatto }), V.max);
    V.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    V.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(V.max * 3), 3);
    V.mesh.frustumCulled = false;
    V.mesh.count = 0;
    V.mesh.visible = false;
    V.mesh.name = `vegetazione-${nome}`;
    oggetto.add(V.mesh);
  }
  const half = terrain ? terrain.half : 1000, cell = terrain ? terrain.meta.cellSize : 1, cols = terrain ? terrain.meta.cols : 0;
  const ERBA_TAVULLIA = new THREE.Color('#8a9a4a');
  /** Colore del terreno sotto (bilineare sui colori dei vertici), per l'erba. */
  function coloreSotto(out, lx, lz) {
    if (!coloriTerreno) return out.copy(ERBA_TAVULLIA);
    const fx = Math.min(cols - 1.001, Math.max(0, (lx + half) / cell)), fz = Math.min(cols - 1.001, Math.max(0, (lz + half) / cell));
    const c0 = Math.floor(fx), r0 = Math.floor(fz), u = fx - c0, w = fz - r0;
    const i00 = (r0 * cols + c0) * 3, i10 = i00 + 3, i01 = i00 + cols * 3, i11 = i01 + 3, A = coloriTerreno;
    for (let k = 0; k < 3; k++) {
      const v = (A[i00 + k] * (1 - u) + A[i10 + k] * u) * (1 - w) + (A[i01 + k] * (1 - u) + A[i11 + k] * u) * w;
      if (k === 0) out.r = v; else if (k === 1) out.g = v; else out.b = v;
    }
    return out;
  }
  // Scatti (misura nel bosco fitto, CPU: erba, felci e ciottoli insieme 2–7 ms ogni 5 m): un tipo per fotogramma.
  // La prima volta tutti subito.
  let ultimoVicino = null, msVicino = 0, codaVicini = [];
  function aggiornaVicini(cx, cz) {
    if (!pos.erbaAttorno) return false;
    const primaVolta = !ultimoVicino;
    if (!codaVicini.length) {
      if (ultimoVicino && Math.hypot(cx - ultimoVicino.x, cz - ultimoVicino.z) < VICINO.rifai) return false;
      ultimoVicino = { x: cx, z: cz };
      codaVicini = Object.keys(vicini);
    }
    const t1 = performance.now();
    do rifaiVicino(codaVicini.shift(), ultimoVicino.x, ultimoVicino.z); while (primaVolta && codaVicini.length);
    msVicino = performance.now() - t1;
    return true;
  }
  function rifaiVicino(nome, cx, cz) {
    {
      const V = vicini[nome];
      const T = pos.erbaAttorno(cx, cz, { [nome]: V.raggio })[nome], am = V.mesh.instanceMatrix.array, ac = V.mesh.instanceColor.array;
      let j = 0;
      for (let k = 0; k < T.n && j < V.max; k++) {
        const o = k * STRIDE, x = T.dati[o], z = T.dati[o + 2];
        const dist = Math.hypot(x - cx, z - cz);
        if (dist > V.raggio) continue;
        // Dissolvenza: verso il limite i ciuffi si rimpiccioliscono (niente bordo netto che avanza).
        const f = 1 - Math.min(1, Math.max(0, (dist - 0.7 * V.raggio) / (0.3 * V.raggio)));
        if (f <= 0.05) continue;
        const s = T.dati[o + 3] * f, v = T.dati[o + 5];
        p.set(x, T.dati[o + 1], z);
        q.setFromAxisAngle(_v.set(0, 1, 0), T.dati[o + 4]);
        sc.set(s, s * (0.8 + 0.5 * v), s);
        m4.compose(p, q, sc).toArray(am, j * 16);
        if (nome === 'erba') coloreSotto(_c, x, z).multiplyScalar(1.15 + 0.25 * v);
        else if (nome === 'ciottolo') { const b = 0.65 + 0.5 * v, w = (v * 7.7) % 1 - 0.5; _c.setRGB(b * (1 + 0.1 * w), b, b * (1 - 0.1 * w)); }
        else _c.setRGB(0.85 + 0.3 * v, 0.85 + 0.3 * v, 0.85 + 0.2 * v);
        ac[j * 3] = _c.r; ac[j * 3 + 1] = _c.g; ac[j * 3 + 2] = _c.b;
        j++;
      }
      V.mesh.count = j;
      V.mesh.visible = j > 0;
      V.mesh.instanceMatrix.clearUpdateRanges(); V.mesh.instanceMatrix.addUpdateRange(0, j * 16);
      V.mesh.instanceColor.clearUpdateRanges(); V.mesh.instanceColor.addUpdateRange(0, j * 3);
      V.mesh.instanceMatrix.needsUpdate = true;
      V.mesh.instanceColor.needsUpdate = true;
    }
  }

  let ultimo = null, msAggiorna = 0;
  /** Ridistribuisce le istanze tra livelli e varianti secondo la distanza dalla camera (x, z locali). */
  let msOmbre = 0;
  /**
   * Ogni fotogramma: erba vicina, livelli di dettaglio e (se `sole`, direzione verso il sole) ombre finte.
   * `giorno` 0–1 attenua le ombre del sole di notte.
   */
  function aggiorna(cx, cz, sole = null, giorno = 1) {
    if (ombre && sole) {
      const t2 = performance.now();
      _v.copy(sole).normalize();
      ombre.passo(_v);
      uniSuolo.uOmbreForza.value.set(OMBRE.forza * giorno * Math.min(1, Math.max(0, (_v.y - 0.03) / 0.12)), OMBRE.piede * (0.6 + 0.4 * giorno));
      msOmbre = performance.now() - t2;
    }
    // Scatti (misura nel bosco fitto, CPU: erba vicina 2–7 ms ogni 5 m, ridistribuzione 3–6 ms ogni 12 m, fino a
    // ~11 ms in un fotogramma): la ridistribuzione si fa a pezzi, al più ~RIDISTRIBUISCI.ms per fotogramma, e mai
    // nel fotogramma in cui si è rifatto un tipo di erba. La prima volta tutto subito (la Scena è appena caricata).
    const vicinoFatto = aggiornaVicini(cx, cz);
    if (!lavoro && (!ultimo || Math.hypot(cx - ultimo.x, cz - ultimo.z) >= RIASSEGNA_DOPO)) {
      const prima = !ultimo;
      ultimo = { x: cx, z: cz };
      lavoro = ridistribuisci(cx, cz);
      if (prima) {
        const t0 = performance.now();
        while (!lavoro.next().done);
        lavoro = null;
        msAggiorna = performance.now() - t0;
        return;
      }
    }
    if (lavoro && !vicinoFatto) {
      const t0 = performance.now();
      let r;
      do r = lavoro.next(); while (!r.done && performance.now() - t0 < RIDISTRIBUISCI.ms);
      if (r.done) lavoro = null;
      msAggiorna = performance.now() - t0;
    }
  }

  // Ridistribuzione delle istanze tra livelli e varianti: generatore che si ferma ogni RIDISTRIBUISCI.pezzo alberi.
  // Mentre lavora, ogni tipo resta come prima finché non è finito (i conteggi cambiano alla fine del tipo).
  let lavoro = null;
  function* ridistribuisci(cx, cz) {
    let nSag = 0, passi = 0;
    const aS = sagomeBlocco ? sagomeBlocco.instanceMatrix.array : null;
    const tS = sagomeBlocco ? sagomeBlocco.geometry.attributes.aTessera.array : null;
    const bordoMin = halfBlocco - SAGOMA_BORDO.fascia, oltre2 = SAGOMA_BORDO.oltre * SAGOMA_BORDO.oltre;
    const da2 = SAGOME_DIRADA.da * SAGOME_DIRADA.da;
    for (const T of tipi) {
      const L = T.livelli, nL = L.length, fino2 = L.map((l) => l.fino * l.fino);
      const conta = T.mesh.map((ms) => new Array(ms.length).fill(0));
      const am = T.mesh.map((ms) => ms.map((m) => m.instanceMatrix.array));
      const ac = T.mesh.map((ms) => ms.map((m) => m.instanceColor.array));
      for (let k = 0; k < T.n; k++) {
        if (++passi % RIDISTRIBUISCI.pezzo === 0) yield;
        const dx = T.xz[k * 2] - cx, dz = T.xz[k * 2 + 1] - cz, d2 = dx * dx + dz * dz;
        let l = 0;
        while (l < nL && d2 > fino2[l]) l++;
        if (l === nL) continue;                    // oltre l'ultima distanza: non si disegna
        // Verso il bordo del blocco, già a media distanza, sagome: continuano senza stacchi quelle dell'orizzonte.
        if (T.sag && l !== T.lSagoma && d2 > oltre2
          && Math.max(Math.abs(T.xz[k * 2]), Math.abs(T.xz[k * 2 + 1])) > bordoMin) l = T.lSagoma;
        if (l === T.lSagoma) {
          if (T.sag && (d2 <= da2 || T.caso[k] * d2 < da2)) {
            const o = k * 5;
            scriviSagoma(aS, nSag, T.sag[o], T.sag[o + 1], T.sag[o + 2], T.sag[o + 3]);
            tS[nSag++] = T.sag[o + 4];
          }
          continue;
        }
        const vi = Math.floor(T.varia[k] * T.mesh[l].length);
        const j = conta[l][vi]++;
        am[l][vi].set(T.matrici.subarray(k * 16, k * 16 + 16), j * 16);
        const c = ac[l][vi];
        c[j * 3] = T.colori[k * 3]; c[j * 3 + 1] = T.colori[k * 3 + 1]; c[j * 3 + 2] = T.colori[k * 3 + 2];
      }
      T.mesh.forEach((ms, l) => ms.forEach((m, vi) => {
        const n = conta[l][vi];
        m.count = n;
        m.visible = n > 0;
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16);
        m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n * 3);
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      }));
    }
    if (sagomeBlocco) {
      sagomeBlocco.count = nSag; sagomeBlocco.visible = nSag > 0;
      sagomeBlocco.instanceMatrix.clearUpdateRanges(); sagomeBlocco.instanceMatrix.addUpdateRange(0, nSag * 16);
      sagomeBlocco.instanceMatrix.needsUpdate = true;
      const at = sagomeBlocco.geometry.attributes.aTessera;
      at.clearUpdateRanges(); at.addUpdateRange(0, nSag); at.needsUpdate = true;
    }
  }

  /**
   * Bosco lontano negli anelli dell'orizzonte (fino a ~4 km): sagome statiche. `quota(x, z)` dell'orizzonte.
   */
  let lontano = null, msLontano = 0;
  function aggiungiLontano(carta, cx, cz, quota, stagione = 0) {
    if (!matSagome || !quota) return;
    const b = boscoLontano(carta, cx, cz, halfBlocco, quota, stagione);
    const t2 = performance.now();
    lontano = meshSagome(matSagome, b.n, 'vegetazione-sagome-lontane');
    const a = lontano.instanceMatrix.array, ta = lontano.geometry.attributes.aTessera.array;
    for (let k = 0; k < b.n; k++) {
      const o = k * 5, ti = b.dati[o + 4];
      scriviSagoma(a, k, b.dati[o], b.dati[o + 1], b.dati[o + 2], atlante.lato[ti] * b.dati[o + 3]);
      ta[k] = ti;
    }
    lontano.count = b.n; lontano.visible = b.n > 0;
    lontano.instanceMatrix.needsUpdate = true;
    lontano.geometry.attributes.aTessera.needsUpdate = true;
    oggetto.add(lontano);
    msLontano = b.ms + performance.now() - t2;
  }

  /** Istanze disegnate, chiamate e triangoli della vegetazione (F3). */
  function statistiche() {
    let istanze = 0, chiamate = 0, triangoli = 0;
    oggetto.traverse((m) => {
      if (!m.isInstancedMesh || !m.visible) return;
      istanze += m.count; chiamate++;
      triangoli += m.count * m.geometry.attributes.position.count / 3;
    });
    return { istanze, chiamate, triangoli, msAggiorna, msVicino, msOmbre, ombre: ombre ? ombre.oggetti : 0, erba: vicini.erba.mesh.count, felci: vicini.felce.mesh.count,
      ciottoli: vicini.ciottolo.mesh.count };
  }

  const collisioni = creaCollisioni(pos);
  const conteggi = Object.fromEntries(Object.entries(pos.tipi).map(([k, t]) => [k, t.n]));
  return {
    oggetto, aggiorna, statistiche, conteggi, aggiungiLontano,
    /** Ostacolo per il cavaliere (stessa interfaccia delle mura del castello). */
    spingiFuori: collisioni.spingiFuori, ostacoli: collisioni.n,
    get lontano() { return lontano ? { n: lontano.count, ms: msLontano } : null; },
    /**
     * Visuale pulita: posizione del cavaliere (x, y, z) da tenere libera dalla vegetazione, o null per spegnerla
     * (camera libera di debug).
     */
    visuale(x, y, z) {
      if (x === null || x === undefined) { uniVis.uVisuale.value = 0; return; }
      uniVis.uCav.value.set(x, y, z);
      uniVis.uVisuale.value = 1;
    },
    cfgVisuale: uniVis.uVisCfg.value,
    /** Con la vegetazione nascosta (tasto V) spariscono anche le sue ombre. */
    nascondiOmbre: () => { if (uniSuolo) uniSuolo.uOmbreForza.value.set(0, 0); },
    totale: Object.values(conteggi).reduce((s, v) => s + v, 0),
    msPosiziona: pos.ms, msCampi: pos.msCampi,
    msCostruzione: performance.now() - t0,
  };
}
