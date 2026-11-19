// Knight Dawn — vegetazione e oggetti sparsi: parte 3D (milestone in parallelo a M7).
// Il posizionamento sta in js/mondo/vegetazione.js (senza Three.js): qui solo ciò che si disegna.
//
// Passo 2: oggetti veri al posto dei punti di controllo (chiome a ciuffi con varianti; erba e felci vicine). Ogni tipo ha 1–3 livelli di dettaglio, ognuno una sola
// InstancedMesh (una chiamata di disegno): alberi vicini ricchi, a media distanza semplici, lontani ridotti a una
// sagoma; arbusti, canne e sassi solo entro una distanza. Le matrici si calcolano una volta; quando la camera si
// sposta di qualche metro ogni istanza passa al livello giusto (copia di 16 numeri). Geometrie da primitive Three.js
// deformate a codice, colori per vertice, un materiale per livello; nessun asset esterno (regola 6).

import * as THREE from 'three';
import { STRIDE } from '../mondo/vegetazione.js';

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
function palco(r, h, y, scuro, chiaro, rnd, { lati = 12, punte = 0.22 } = {}) {
  const geo = new THREE.ConeGeometry(r, h, lati, 2, true);
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
  const ca = new THREE.Color(0.82, 0.84, 0.8), cb = new THREE.Color(1.12, 1.12, 1.0);
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
  const quercia = () => unisci([
    fusto(0.46, 0.3, 5.0, 8, COL.corteccia), ...rami(4, 3.6, 3.4, COL.corteccia, rnd),
    ...chioma({ y: 7.6, a: 4.6, b: 3.1, ciuffi: 20, raggio: [1.0, 1.7], scuro: F[0], chiaro: F[1], rnd }),
  ]);
  const faggio = () => unisci([
    fusto(0.36, 0.22, 6.5, 8, COL.cortecciaChiara), ...rami(3, 4.8, 3.0, COL.cortecciaChiara, rnd),
    ...chioma({ y: 9.4, a: 3.2, b: 4.4, ciuffi: 20, raggio: [0.9, 1.5], scuro: FF[0], chiaro: FF[1], rnd }),
  ]);
  const castagno = () => unisci([
    fusto(0.42, 0.26, 5.2, 8, COL.corteccia, { inclinaZ: -0.05 }), ...rami(3, 3.8, 3.2, COL.corteccia, rnd),
    ...chioma({ x: 0.8, y: 8.0, a: 3.4, b: 2.9, ciuffi: 14, raggio: [0.9, 1.5], scuro: F[0], chiaro: F[1], rnd }),
    ...chioma({ x: -2.4, y: 6.5, z: 0.6, a: 2.2, b: 1.9, ciuffi: 7, raggio: [0.8, 1.3], scuro: F[0], chiaro: F[1], rnd }),
  ]);
  const latMedio = (a, b, y) => unisci([
    fusto(0.4, 0.26, y - b * 0.6, 5, COL.corteccia),
    ...chioma({ y, a, b, ciuffi: 7, raggio: [1.6, 2.4], dettaglio: 0, scuro: F[0], chiaro: F[1], rnd, morbido: 0.85 }),
  ]);
  M.latifoglia = [
    { fino: 110, varianti: [quercia(), faggio(), castagno()] },
    { fino: 450, varianti: [latMedio(4.2, 3.1, 7.6), latMedio(3.2, 4.2, 9.2)] },
    { fino: Infinity, varianti: [unisci([fusto(0.42, 0.3, 5.5, 3, COL.corteccia),
      ...chioma({ y: 8, a: 3.8, b: 3.4, ciuffi: 3, raggio: [2.2, 2.8], dettaglio: 0, scuro: F[0], chiaro: F[1], rnd, morbido: 0.9, pieno: 0.2 })])] },
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
    { fino: 110, varianti: [abete(6, 3.2, 14), abete(8, 2.3, 17)] },
    { fino: 450, varianti: [unisci([fusto(0.3, 0.15, 4, 4, COL.corteccia),
      palco(3.0, 6.5, 1.8, COL.ago[0], COL.ago[1], rnd, { lati: 8 }), palco(2.1, 6.0, 6.0, COL.ago[0], COL.ago[1], rnd, { lati: 8 }),
      palco(1.2, 5.0, 10.0, COL.ago[0], COL.ago[1], rnd, { lati: 8 })])] },
    { fino: Infinity, varianti: [unisci([fusto(0.35, 0.2, 3, 3, COL.corteccia),
      palco(2.8, 12.5, 1.8, COL.ago[0], COL.ago[1], rnd, { lati: 6, punte: 0 })])] },
  ];

  // Pino domestico: ombrello piatto, o a due ripiani.
  const P = COL.fogliaPino;
  M.pino = [
    { fino: 110, varianti: [
      unisci([fusto(0.36, 0.2, 9.4, 8, COL.cortecciaPino, { inclinaZ: 0.06 }), ...rami(4, 7.6, 3.2, COL.cortecciaPino, rnd),
        ...chioma({ x: 0.55, y: 10.3, a: 4.6, b: 1.4, ciuffi: 18, raggio: [0.9, 1.4], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 })]),
      unisci([fusto(0.34, 0.2, 8.4, 8, COL.cortecciaPino, { inclinaZ: -0.08 }), ...rami(3, 6.6, 3.0, COL.cortecciaPino, rnd),
        ...chioma({ x: -0.6, y: 9.6, a: 3.6, b: 1.3, ciuffi: 12, raggio: [0.9, 1.3], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 }),
        ...chioma({ x: 1.6, y: 8.1, z: 0.8, a: 2.2, b: 0.9, ciuffi: 6, raggio: [0.8, 1.1], scuro: P[0], chiaro: P[1], rnd, pieno: 0.4 })]),
    ] },
    { fino: 450, varianti: [unisci([fusto(0.34, 0.22, 9.2, 5, COL.cortecciaPino, { inclinaZ: 0.06 }),
      ...chioma({ x: 0.5, y: 10.2, a: 4.2, b: 1.3, ciuffi: 6, raggio: [1.4, 1.9], dettaglio: 0, scuro: P[0], chiaro: P[1], rnd, morbido: 0.85 })])] },
    { fino: Infinity, varianti: [unisci([fusto(0.36, 0.26, 9, 3, COL.cortecciaPino),
      ...chioma({ x: 0.5, y: 10.2, a: 4.0, b: 1.2, ciuffi: 2, raggio: [2.2, 2.6], dettaglio: 0, scuro: P[0], chiaro: P[1], rnd, morbido: 0.9, pieno: 0.2 })])] },
  ];

  // Albero di riva (pioppo): colonna alta e stretta, verde più chiaro, corteccia chiara.
  const R = COL.fogliaRiva;
  M.riva = [
    { fino: 110, varianti: [unisci([fusto(0.38, 0.14, 14, 8, COL.cortecciaBetulla), ...rami(3, 5, 3.0, COL.cortecciaBetulla, rnd),
      ...chioma({ y: 10.5, a: 2.0, b: 5.4, ciuffi: 20, raggio: [0.8, 1.2], scuro: R[0], chiaro: R[1], rnd })])] },
    { fino: 450, varianti: [unisci([fusto(0.34, 0.2, 6, 5, COL.cortecciaBetulla),
      ...chioma({ y: 10.5, a: 1.9, b: 5.2, ciuffi: 6, raggio: [1.3, 1.8], dettaglio: 0, scuro: R[0], chiaro: R[1], rnd, morbido: 0.85 })])] },
    { fino: Infinity, varianti: [unisci([fusto(0.35, 0.25, 6, 3, COL.cortecciaBetulla),
      ...chioma({ y: 10.5, a: 1.8, b: 5.0, ciuffi: 2, raggio: [1.8, 2.2], dettaglio: 0, scuro: R[0], chiaro: R[1], rnd, morbido: 0.9, pieno: 0.3 })])] },
  ];

  // Albero secco: fusto e rami spogli.
  M.secco = [
    { fino: 110, varianti: [unisci([fusto(0.3, 0.1, 7.5, 7, COL.cortecciaChiara), ...rami(6, 2.8, 3.0, COL.cortecciaChiara, rnd)])] },
    { fino: 450, varianti: [unisci([fusto(0.3, 0.12, 7, 4, COL.cortecciaChiara), ...rami(2, 3.5, 2.8, COL.cortecciaChiara, rnd)])] },
    { fino: Infinity, varianti: [unisci([fusto(0.32, 0.15, 7, 3, COL.cortecciaChiara)])] },
  ];

  // Cespugli: ciuffi su una cupola bassa (due forme da vicino).
  const C = COL.cespuglio, MG = COL.mugo;
  M.cespuglio = [
    { fino: 70, varianti: [
      unisci(chioma({ y: 0.55, a: 1.0, b: 0.65, ciuffi: 9, raggio: [0.35, 0.55], scuro: C[0], chiaro: C[1], rnd, sotto: 0, pieno: 0.3 })),
      unisci(chioma({ y: 0.7, a: 0.8, b: 0.85, ciuffi: 9, raggio: [0.3, 0.5], scuro: C[0], chiaro: C[1], rnd, sotto: 0, pieno: 0.3 })),
    ] },
    { fino: 300, varianti: [unisci(chioma({ y: 0.55, a: 0.9, b: 0.65, ciuffi: 3, raggio: [0.5, 0.7], dettaglio: 0, scuro: C[0], chiaro: C[1], rnd, sotto: 0, morbido: 0.85 }))] },
  ];
  M['arbusto alto'] = [
    { fino: 70, varianti: [unisci(chioma({ y: 0.35, a: 1.4, b: 0.45, ciuffi: 10, raggio: [0.35, 0.55], scuro: MG[0], chiaro: MG[1], rnd, sotto: 0, pieno: 0.3 }))] },
    { fino: 300, varianti: [unisci(chioma({ y: 0.35, a: 1.3, b: 0.45, ciuffi: 3, raggio: [0.5, 0.7], dettaglio: 0, scuro: MG[0], chiaro: MG[1], rnd, sotto: 0, morbido: 0.85 }))] },
  ];

  // Sterpo: ramaglie secche a raggiera.
  M.sterpo = [{ fino: 200, varianti: [unisci(Array.from({ length: 7 }, (_, k) =>
    fusto(0.04, 0.01, 0.9 + 0.3 * (k % 3), 3, COL.sterpo, { inclinaZ: 0.6 * Math.cos(k * 0.9), inclinaX: 0.6 * Math.sin(k * 0.9), sotto: 0.1 })))] }];

  // Canne: ciuffo di steli sottili con la punta chiara.
  M.canne = [{ fino: 150, varianti: [unisci(Array.from({ length: 11 }, (_, k) => {
    const a = k * 2.4, d = 0.15 + 0.25 * ((k * 7) % 5) / 5;
    return cono(0.035, 1.6 + 0.6 * ((k * 3) % 4) / 4, 3, 0, COL.canna[0], COL.canna[1],
      { x: d * Math.cos(a), z: d * Math.sin(a), inclinaX: 0.12 * Math.sin(a), inclinaZ: 0.12 * Math.cos(a), frastaglio: 0, rnd });
  }))] }];

  // Rocce spigolose (richiesta dell'utente): più forme, proporzioni per istanza, grigi diversi. Sasso, masso (anche
  // enorme, nelle frane), affioramento largo e basso fatto di lastre.
  const R1 = (r, o) => rocciaSpigolosa(r, rnd, o);
  M.sasso = [{ fino: 130, piatto: true, varianti: [
    unisci([R1(0.32, { dettaglio: 0, tagli: 5, y: 0.06, sy: 0.6 })]),
    unisci([R1(0.3, { dettaglio: 1, tagli: 7, y: 0.05, sx: 1.4, sy: 0.45 })]),
    unisci([R1(0.3, { dettaglio: 0, tagli: 6, y: 0.1, sy: 0.9, sz: 0.7 })]),
  ] }];
  M.masso = [
    { fino: 220, piatto: true, varianti: [
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

  return M;
}

// ─── Istanze ─────────────────────────────────────────────────────────────

/** Variazione per istanza: tono (chiaro/scuro e più giallo o più verde) e proporzioni. */
const TONO = {
  alberi: [0.8, 1.15, 0.14], arbusti: [0.8, 1.12, 0.12], acqua: [0.85, 1.1, 0.1],
  rocce: [0.62, 1.2, 0], bosco: [0.8, 1.05, 0],
};
const GIALLO = new THREE.Color('#d9c85a');
const RIASSEGNA_DOPO = 12;              // m di spostamento della camera prima di ridistribuire le istanze
const VICINO = { erba: { raggio: 32, max: 16000 }, felce: { raggio: 45, max: 3000 }, ciottolo: { raggio: 40, max: 6000 }, rifai: 4 };

/** Materiale con il vento: oscilla la parte alta (y locale) secondo il tempo e la posizione dell'istanza. */
function materialeVento(opz, ampiezza, tempo) {
  const mat = new THREE.MeshLambertMaterial(opz);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = tempo;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTempo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 kdI = instanceMatrix[3].xyz;
        float kdW = position.y * position.y * ${ampiezza.toFixed(3)};
        transformed.x += sin(uTempo * 1.9 + kdI.x * 0.31 + kdI.z * 0.17) * kdW;
        transformed.z += cos(uTempo * 1.6 + kdI.z * 0.27 - kdI.x * 0.11) * kdW * 0.7;
      #endif`);
  };
  mat.customProgramCacheKey = () => `kd-vento-${ampiezza}`;
  return mat;
}

/**
 * Oggetto 3D della vegetazione del blocco.
 * @param {object} pos  esito di posizionaVegetazione (tipi, suolo, erbaAttorno, ms, msCampi)
 * @param {object} [terrain]  terreno della Scena: riceve il suolo (lettiera, fango) e dà il colore all'erba
 * @returns {{ oggetto: THREE.Group, aggiorna: (x: number, z: number, t?: number) => void, conteggi: Object<string, number>,
 *   totale: number, msPosiziona: number, msCampi: number, msCostruzione: number, statistiche: () => object }}
 */
export function creaVegetazione(pos, terrain = null) {
  const t0 = performance.now();
  const oggetto = new THREE.Group();
  oggetto.name = 'vegetazione';
  const modelli = creaModelli();
  const tempo = { value: 0 };

  // Suolo: lettiera sotto il bosco e fango vicino all'acqua (shader del terreno, terrain.js).
  const superficie = terrain?.mesh.getObjectByName('terreno-superficie');
  const nVertici = terrain ? terrain.meta.cols * terrain.meta.rows : 0;
  let coloriTerreno = null;
  if (superficie && pos.suolo && superficie.geometry.attributes.position.count === nVertici) {
    superficie.geometry.setAttribute('aSuolo', new THREE.BufferAttribute(pos.suolo, 2));
    coloriTerreno = superficie.geometry.attributes.color?.array || null;
  }

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
      const alto = roccia ? 0.55 + 0.7 * v : (albero ? 0.8 + 0.4 * v : 0.85 + 0.3 * v);
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
    const mesh = livelli.map((L) => L.varianti.map((geo, vi) => {
      const m = new THREE.InstancedMesh(geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!L.piatto }), t.n);
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
    tipi.push({ nome, n: t.n, livelli, mesh, matrici, colori, xz, varia });
  }

  // Erba e felci attorno alla camera: ricalcolate ogni pochi metri (posizionamento deterministico, js/mondo).
  const rnd = casuale(77);
  const vicini = {
    erba: { geo: ciuffoErba(rnd), vento: 0.35, ...VICINO.erba },
    felce: { geo: felce(rnd), vento: 0.08, ...VICINO.felce },
    ciottolo: { geo: unisci([rocciaSpigolosa(0.12, rnd, { dettaglio: 0, tagli: 5, y: 0.02, sy: 0.6 })]), vento: 0, piatto: true, ...VICINO.ciottolo },
  };
  for (const [nome, V] of Object.entries(vicini)) {
    V.mesh = new THREE.InstancedMesh(V.geo, V.vento
      ? materialeVento({ vertexColors: true, side: THREE.DoubleSide }, V.vento, tempo)
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
  let ultimoVicino = null, msVicino = 0;
  function aggiornaVicini(cx, cz) {
    if (!pos.erbaAttorno) return;
    if (ultimoVicino && Math.hypot(cx - ultimoVicino.x, cz - ultimoVicino.z) < VICINO.rifai) return;
    const t1 = performance.now();
    ultimoVicino = { x: cx, z: cz };
    const esito = pos.erbaAttorno(cx, cz, { erba: VICINO.erba.raggio, felce: VICINO.felce.raggio, ciottolo: VICINO.ciottolo.raggio });
    for (const [nome, V] of Object.entries(vicini)) {
      const T = esito[nome], am = V.mesh.instanceMatrix.array, ac = V.mesh.instanceColor.array;
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
        if (nome === 'erba') coloreSotto(_c, x, z).multiplyScalar(0.95 + 0.2 * v);
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
    msVicino = performance.now() - t1;
  }

  let ultimo = null, msAggiorna = 0;
  /** Ridistribuisce le istanze tra livelli e varianti secondo la distanza dalla camera (x, z locali); t: tempo (s). */
  function aggiorna(cx, cz, t = 0) {
    tempo.value = t;
    aggiornaVicini(cx, cz);
    if (ultimo && Math.hypot(cx - ultimo.x, cz - ultimo.z) < RIASSEGNA_DOPO) return;
    const t1 = performance.now();
    ultimo = { x: cx, z: cz };
    for (const T of tipi) {
      const L = T.livelli, nL = L.length, fino2 = L.map((l) => l.fino * l.fino);
      const conta = T.mesh.map((ms) => new Array(ms.length).fill(0));
      const am = T.mesh.map((ms) => ms.map((m) => m.instanceMatrix.array));
      const ac = T.mesh.map((ms) => ms.map((m) => m.instanceColor.array));
      for (let k = 0; k < T.n; k++) {
        const dx = T.xz[k * 2] - cx, dz = T.xz[k * 2 + 1] - cz, d2 = dx * dx + dz * dz;
        let l = 0;
        while (l < nL && d2 > fino2[l]) l++;
        if (l === nL) continue;                    // oltre l'ultima distanza: non si disegna
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
    msAggiorna = performance.now() - t1;
  }

  /** Istanze disegnate, chiamate e triangoli della vegetazione (F3). */
  function statistiche() {
    let istanze = 0, chiamate = 0, triangoli = 0;
    oggetto.traverse((m) => {
      if (!m.isInstancedMesh || !m.visible) return;
      istanze += m.count; chiamate++;
      triangoli += m.count * m.geometry.attributes.position.count / 3;
    });
    return { istanze, chiamate, triangoli, msAggiorna, msVicino, erba: vicini.erba.mesh.count, felci: vicini.felce.mesh.count,
      ciottoli: vicini.ciottolo.mesh.count };
  }

  const conteggi = Object.fromEntries(Object.entries(pos.tipi).map(([k, t]) => [k, t.n]));
  return {
    oggetto, aggiorna, statistiche, conteggi,
    totale: Object.values(conteggi).reduce((s, v) => s + v, 0),
    msPosiziona: pos.ms, msCampi: pos.msCampi,
    msCostruzione: performance.now() - t0,
  };
}
