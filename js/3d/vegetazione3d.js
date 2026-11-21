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
  pieno = 0.55, sotto = 0.35, schegge = 0, inviluppo = null, leggero = false }) {
  const parti = [];
  // Luce e colore secondo l'inviluppo dell'intera chioma (se dato): un albero fatto di gruppi di foglie si illumina
  // come una chioma sola, non come tante palle.
  const E = inviluppo || { x, y, z, a, b, c };
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
    let geo;
    if (schegge) {
      // Ciuffo a schegge (richiesta dell'utente: niente «marshmallow di verde attaccati ai rami», senza arrivare alle
      // foglie singole): `schegge` tetraedri appiattiti orientati a caso dentro il ciuffo, contorno frastagliato.
      // Nucleo pieno (richiesta dell'utente: con le sole schegge «sembrano tutti alberi spogli»): un solido irregolare
      // dentro il ciuffo chiude la vista; le schegge intorno fanno il bordo frastagliato.
      // Forme miste (richiesta dell'utente: «un mix di forme»): nucleo a volte tondeggiante (icosaedro), a volte
      // spigoloso (ottaedro); schegge tetraedri o ottaedri.
      // (oltre i 18 m solo ottaedri: 8 triangoli invece di 20; la scelta a caso si fa comunque, stesse forme ai due livelli)
      // Un passo indietro verso il tondo (richiesta dell'utente: «buchi evidenti nelle chiome»): nucleo più grande,
      // icosaedro deformato (bozza), poche schegge più piccole che fanno solo da frangia («torna un po' alle rotondità,
      // sennò si va troppo verso le singole foglie»). Livello medio (`leggero`, migliaia di alberi): ottaedro, 8 triangoli.
      const tondo = rnd() < 0.55 && dettaglio;
      const nucleo = leggero ? new THREE.OctahedronGeometry(r * 0.95, 0) : new THREE.IcosahedronGeometry(r * (tondo ? 0.95 : 0.88), 0);
      { const pn = nucleo.attributes.position, sn = rnd() * 10, rn = r * 0.9;
        for (let i = 0; i < pn.count; i++) {
          _v.set(pn.getX(i), pn.getY(i), pn.getZ(i));
          const f = bozza(_v.x / rn, _v.y / rn, _v.z / rn, sn, 0.2);
          pn.setXYZ(i, _v.x * f, _v.y * f, _v.z * f);
        } }
      nucleo.scale(1, 0.82, 1);
      nucleo.rotateY(rnd() * 6.283);
      nucleo.translate(px, py, pz);
      nucleo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nucleo.attributes.position.count * 3), 3));
      const pezzi = [nucleo];
      for (let j = 0; j < schegge; j++) {
        const g = rnd() < 0.6 ? new THREE.TetrahedronGeometry(r * (0.4 + 0.2 * rnd())) : new THREE.OctahedronGeometry(r * (0.3 + 0.15 * rnd()));
        g.scale(1, 0.6 + 0.25 * rnd(), 1);
        g.rotateX(rnd() * 6.283); g.rotateY(rnd() * 6.283); g.rotateZ(rnd() * 6.283);
        let qx, qy, qz, q2;
        do { qx = rnd() * 2 - 1; qy = rnd() * 2 - 1; qz = rnd() * 2 - 1; q2 = qx * qx + qy * qy + qz * qz; } while (q2 > 1);
        g.translate(px + qx * r * 0.8, py + qy * r * 0.6, pz + qz * r * 0.8);
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
        pezzi.push(g);
      }
      geo = unisci(pezzi);
    } else {
      geo = new THREE.IcosahedronGeometry(r, dettaglio);
      const p0 = geo.attributes.position, seme = rnd() * 10;
      for (let i = 0; i < p0.count; i++) {
        _v.set(p0.getX(i), p0.getY(i), p0.getZ(i));
        const f = bozza(_v.x / r, _v.y / r, _v.z / r, seme, 0.22);
        p0.setXYZ(i, _v.x * f + px, _v.y * f * 0.85 + py, _v.z * f + pz);
      }
    }
    const p = geo.attributes.position;
    geo.computeVertexNormals();
    const nf = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _n.set((p.getX(i) - E.x) / (E.a * E.a), (p.getY(i) - E.y) / (E.b * E.b), (p.getZ(i) - E.z) / (E.c * E.c)).normalize().multiplyScalar(morbido);
      _v.set(nf.getX(i), nf.getY(i), nf.getZ(i)).multiplyScalar(1 - morbido).add(_n).normalize();
      nf.setXYZ(i, _v.x, _v.y, _v.z);
    }
    tinta.setRGB(1 + (rnd() - 0.5) * 0.16, 1 + (rnd() - 0.5) * 0.12, 1 + (rnd() - 0.5) * 0.16);
    parti.push(colora(geo, (col, qx, qy, qz) => {
      const ex = (qx - E.x) / E.a, ey = (qy - E.y) / E.b, ez = (qz - E.z) / E.c;
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
/** Ramo da (x0, y0, z0) a (x1, y1, z1): cilindro aperto che si assottiglia, orientato lungo il segmento. */
function ramoVerso(x0, y0, z0, x1, y1, z1, r0, r1, colore, lati = 5) {
  const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), L = v.length();
  const geo = new THREE.CylinderGeometry(r1, r0, L, lati, 1, true);
  geo.translate(0, L / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
  geo.translate(x0, y0, z0);
  const cs = new THREE.Color(colore), cc = cs.clone().multiplyScalar(0.75);
  return colora(geo, (c, px, py) => c.copy(cc).lerp(cs, Math.min(1, Math.max(0, (py - y0) / Math.max(0.5, y1 - y0)))));
}

/**
 * Ramo curvo (richiesta dell'utente: «rendi curvi tronco alto e rami, sennò resta l'effetto stuzzicadenti incastrati»):
 * tubo lungo una curva liscia (Catmull-Rom) per `punti`, raggio da r0 a r1, `seg` tratti; colore più scuro all'attacco.
 */
function ramoCurvo(punti, r0, r1, colore, lati = 5, seg = 3) {
  const curva = new THREE.CatmullRomCurve3(punti.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const geo = new THREE.TubeGeometry(curva, seg, 1, lati, false);
  const p = geo.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = r0 + (r1 - r0) * t;
    curva.getPointAt(t, c);
    for (let j = 0; j <= lati; j++) {
      const k = i * (lati + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  const y0 = punti[0][1], y1 = punti[punti.length - 1][1];
  const cs = new THREE.Color(colore), cc = cs.clone().multiplyScalar(0.75);
  return colora(geo, (col, px, py) => col.copy(cc).lerp(cs, Math.min(1, Math.max(0, (py - y0) / Math.max(0.5, y1 - y0)))));
}

/** Punto intermedio tra a e b spostato a caso di `k` volte la distanza (piega del ramo). */
function piega(a, b, f, k, rnd) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * k;
  return [a[0] + (b[0] - a[0]) * f + (rnd() - 0.5) * 2 * L, a[1] + (b[1] - a[1]) * f + (rnd() - 0.5) * L,
    a[2] + (b[2] - a[2]) * f + (rnd() - 0.5) * 2 * L];
}

/**
 * Chioma a masse (richiesta dell'utente: chiome «troppo arrotondate o piene, si vede che sono di un gioco»): `masse`
 * gruppi di foglie separati, ognuno con pochi ciuffi e un ramo dal fusto (`da`), sparsi nell'ellissoide (x, y, z, a,
 * b, c) con vuoti in mezzo da cui si vedono cielo e rami. Gli stessi triangoli di una chioma piena (masse × ciuffi).
 */
function chiomaAMasse({ x = 0, y, z = 0, a, b, c = a, masse, ciuffi, raggio, dettaglio = 1, scuro, chiaro, rnd,
  da = null, colRamo = COL.corteccia, rRamo = 0.1, alto = 0.25, schegge = 0 }) {
  const parti = [], centri = [];
  for (let m = 0, tent = 0; m < masse && tent < 200; tent++) {
    let dx = rnd() * 2 - 1, dy = rnd() * 1.3 - 0.3 + alto, dz = rnd() * 2 - 1;
    const l = Math.hypot(dx, dy, dz);
    if (l < 0.05 || l > 1.4) continue;
    dx /= l; dy /= l; dz /= l;
    const t = 0.5 + 0.45 * rnd();
    const px = x + dx * a * t, py = y + dy * b * t, pz = z + dz * c * t;
    const ma = Math.min(a, c) * (0.3 + 0.2 * rnd());
    if (centri.some(([qx, qy, qz, qa]) => Math.hypot(px - qx, py - qy, pz - qz) < 0.95 * (ma + qa))) continue;
    centri.push([px, py, pz, ma]);
    parti.push(...chioma({ x: px, y: py, z: pz, a: ma, b: ma * (0.65 + 0.3 * rnd()), c: ma * (0.8 + 0.35 * rnd()),
      ciuffi, raggio, dettaglio, scuro, chiaro, rnd, pieno: 0.35, sotto: 0.3, morbido: 0.7, schegge, leggero: true, inviluppo: { x, y, z, a, b, c } }));
    if (da) parti.push(ramoVerso(da[0] + (rnd() - 0.5) * 0.3, da[1] + rnd() * 0.8, da[2] + (rnd() - 0.5) * 0.3,
      x + (px - x) * 0.85, py - ma * 0.4, z + (pz - z) * 0.85, rRamo, rRamo * 0.35, colRamo, 4));
    m++;
  }
  return parti;
}

/**
 * Albero ramificato (richiesta dell'utente: «rami e foglie mischiati in modo naturale anche più in basso, buchi di
 * foglie che fanno vedere i rami anche in alto; non un disegno da bambini»). Fusto fino a `fusto` m, poi una cima
 * (`cima`) che prosegue; `rami` rami principali che partono dal fusto tra `parte`[0] e `parte`[1] della sua altezza,
 * inclinati tra `inc` gradi dall'orizzontale, lunghi `lungo`; ognuno con 2 rametti. Le foglie sono ciuffetti lungo i rami
 * (a metà, verso la punta, sulle punte dei rametti) e lungo la cima: vuoti a tutte le altezze, rami visibili dentro.
 * Restituisce le parti da unire (il fusto a parte).
 */
function ramificato({ fusto: hF, cima, rami: nR, parte, inc, lungo, r0, colRamo, ciuffi, rCiuffo, raggio, dettaglio,
  scuro, chiaro, rnd, piatto = 1, rCima = r0 * 0.6, cime = 1, tronco = null }) {
  const parti = [];
  const inviluppo = { x: 0, y: hF + cima * 0.45, z: 0, a: lungo * 0.95, b: cima * 0.75 + 1, c: lungo * 0.95 };
  const foglie = (x, y, z, k = 1) => parti.push(...chioma({ x, y, z, a: rCiuffo * k * (0.8 + 0.4 * rnd()),
    b: rCiuffo * k * piatto * (0.65 + 0.3 * rnd()), c: rCiuffo * k * (0.8 + 0.4 * rnd()), ciuffi, raggio, dettaglio,
    scuro, chiaro, rnd, pieno: 0.3, sotto: 0.35, morbido: 0.7, schegge: dettaglio ? 4 : 1, inviluppo }));
  // Cima (richiesta dell'utente: «tronco dritto da base a cima che spunta come uno stuzzicadenti»): sopra il fusto il
  // tronco si divide in `cime` fusti storti che divergono (come quercia e castagno), ognuno in due tratti piegati, dal
  // raggio del fusto fino a pochi centimetri; la punta finisce dentro l'ultimo ciuffo, non spunta fuori.
  // Tronco curvo (se dato `tronco`: raggi alla base e in cima): asse un po' storto, i rami partono dall'asse.
  const sv = dettaglio ? 1 : 0;
  const P0 = [0, -0.5, 0], P1 = [(rnd() - 0.5) * 0.35, hF * 0.45, (rnd() - 0.5) * 0.35], P2 = [(rnd() - 0.5) * 0.45, hF, (rnd() - 0.5) * 0.45];
  if (!tronco) { P1[0] = P1[2] = P2[0] = P2[2] = 0; }
  const asse = (y) => { const t = Math.min(1, Math.max(0, y / hF)), [A, B, u] = t < 0.45 ? [P0, P1, t / 0.45] : [P1, P2, (t - 0.45) / 0.55];
    return [A[0] + (B[0] - A[0]) * u, A[2] + (B[2] - A[2]) * u]; };
  if (tronco) parti.push(ramoCurvo([P0, P1, P2], tronco[0], tronco[1], colRamo, 8, 3 + sv));
  const an0 = rnd() * Math.PI * 2;
  for (let c = 0; c < cime; c++) {
    const a = an0 + c * (Math.PI * 2 / cime) + (rnd() - 0.5) * 0.9;
    const dev = cime > 1 ? 0.3 + 0.3 * rnd() : 0.1 + 0.12 * rnd();       // scarto dalla verticale (rad)
    const L = cima * (c === 0 ? 0.92 : 0.72 + 0.2 * rnd()), rc = rCima * (cime > 1 ? 0.75 : 1);
    const mx = P2[0] + Math.cos(a) * Math.sin(dev) * L * 0.5, my = hF + Math.cos(dev) * L * 0.5, mz = P2[2] + Math.sin(a) * Math.sin(dev) * L * 0.5;
    const a2 = a + (rnd() - 0.5) * 1.4, d2 = dev * (0.4 + 0.6 * rnd());
    const ex = mx + Math.cos(a2) * Math.sin(d2) * L * 0.45, ey = my + Math.cos(d2) * L * 0.45, ez = mz + Math.sin(a2) * Math.sin(d2) * L * 0.45;
    const b0 = [P2[0], hF - 0.3, P2[2]], m = [mx, my, mz], e = [ex, ey, ez];
    parti.push(ramoCurvo([b0, piega(b0, m, 0.5, 0.12, rnd), m, piega(m, e, 0.5, 0.14, rnd), e], rc, 0.025, colRamo, 5, 4 + 2 * sv));
    foglie(mx * 0.6 + (rnd() - 0.5) * 0.6, hF + (my - hF) * 0.6, mz * 0.6 + (rnd() - 0.5) * 0.6, 0.9);
    foglie(mx + (rnd() - 0.5) * 0.5, my + 0.2, mz + (rnd() - 0.5) * 0.5, 1.0);
    foglie(ex, ey + 0.15, ez, 1.2);                                        // copre la punta
  }
  // Rami principali (richiesta dell'utente: «rami troppo fuori dal tronco, cadrebbero per gravità; direzioni e lunghezze
  // diverse»): direzioni irregolari (angolo aureo più caso), lunghezze molto diverse, due tratti con il secondo che
  // piega in su; rametti 1–3 con angoli e lunghezze diverse; ogni punta coperta di foglie.
  let an = rnd() * Math.PI * 2;
  for (let k = 0; k < nR; k++) {
    an += 2.39996 + (rnd() - 0.5) * 1.2;
    const y0 = hF * (parte[0] + (parte[1] - parte[0]) * ((k * 0.618 + rnd() * 0.35) % 1));
    const el = (inc[0] + (inc[1] - inc[0]) * rnd()) * Math.PI / 180, L = lungo * (0.55 + 0.55 * rnd());
    const ca = Math.cos(an), sa = Math.sin(an);
    // Primo tratto (60 %) e secondo che sale di 15–35° in più.
    const L1 = L * 0.6, L2 = L * 0.45, el2 = Math.min(1.45, el + (0.26 + 0.35 * rnd()));
    const mx = ca * Math.cos(el) * L1, my = y0 + Math.sin(el) * L1, mz = sa * Math.cos(el) * L1;
    const ex = mx + ca * Math.cos(el2) * L2, ey = my + Math.sin(el2) * L2, ez = mz + sa * Math.cos(el2) * L2;
    const rr = r0 * (0.32 + 0.12 * rnd()), [ax, az] = asse(y0);
    // Ramo curvo in un pezzo: parte dall'asse del tronco, s'inarca e risale; piccole pieghe a caso.
    const b0 = [ax, y0, az], m = [mx, my, mz], e = [ex, ey, ez];
    parti.push(ramoCurvo([b0, piega(b0, m, 0.5, 0.14, rnd), m, piega(m, e, 0.5, 0.16, rnd), e], rr, 0.02, colRamo, 4, 4 + 2 * sv));
    // Foglie lungo tutto il ramo (richiesta dell'utente: nel bosco «troppi buchi che fanno vedere i rami»): nel primo
    // tratto, alla piega e in punta; vuoti più piccoli.
    foglie(mx * 0.55, y0 + (my - y0) * 0.55 + 0.25, mz * 0.55, 0.75);
    foglie(mx, my + 0.2, mz, 0.9);
    foglie(ex, ey + 0.1, ez, 1.1);
    const nRam = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < nRam; j++) {
      const t = 0.3 + 0.6 * rnd(), seg = t < 0.6;
      const bx = seg ? mx * t / 0.6 : mx + (ex - mx) * (t - 0.6) / 0.4, by = seg ? y0 + (my - y0) * t / 0.6 : my + (ey - my) * (t - 0.6) / 0.4;
      const bz = seg ? mz * t / 0.6 : mz + (ez - mz) * (t - 0.6) / 0.4;
      const a2 = an + (rnd() < 0.5 ? -1 : 1) * (0.4 + 0.9 * rnd()), l2 = L * (0.2 + 0.35 * rnd());
      const e2 = (-0.15 + 0.85 * rnd());                       // da un po' in giù a molto in su
      const cx2 = bx + Math.cos(a2) * Math.cos(e2) * l2, cy2 = by + Math.sin(e2) * l2, cz2 = bz + Math.sin(a2) * Math.cos(e2) * l2;
      const q0 = [bx, by, bz], q1 = [cx2, cy2, cz2];
      parti.push(ramoCurvo([q0, piega(q0, q1, 0.5, 0.15, rnd), q1], rr * 0.35, 0.015, colRamo, 3, 2 + sv));
      foglie(cx2, cy2 + 0.1, cz2, 0.6 + 0.35 * rnd());
    }
  }
  return parti;
}

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
  // Alberi ramificati: foglie lungo i rami a tutte le altezze, vuoti e rami visibili (≈ 30–34 ciuffi come prima).
  const quercia = (det) => { const r = casuale(311); return unisci([
    ...ramificato({ fusto: 4.2, cima: 4.6, rami: 4, cime: 3, parte: [0.55, 1.0], inc: [32, 62], lungo: 3.2, r0: 0.5, rCima: 0.3, tronco: [0.46, 0.3],
      colRamo: COL.corteccia, ciuffi: 2, rCiuffo: 1.4, raggio: [0.52, 0.85], dettaglio: det, scuro: F[0], chiaro: F[1], rnd: r, piatto: 0.85 }),
  ]); };
  const faggio = (det) => { const r = casuale(312); return unisci([
    ...ramificato({ fusto: 4.6, cima: 6.2, rami: 4, cime: 3, parte: [0.5, 1.0], inc: [40, 68], lungo: 2.7, r0: 0.4, rCima: 0.22, tronco: [0.36, 0.22],
      colRamo: COL.cortecciaChiara, ciuffi: 2, rCiuffo: 1.3, raggio: [0.5, 0.8], dettaglio: det, scuro: FF[0], chiaro: FF[1], rnd: r }),
  ]); };
  const castagno = (det) => { const r = casuale(313); return unisci([
    ...ramificato({ fusto: 3.8, cima: 4.8, rami: 4, cime: 3, parte: [0.45, 1.0], inc: [35, 68], lungo: 3.0, r0: 0.46, rCima: 0.26, tronco: [0.42, 0.26],
      colRamo: COL.corteccia, ciuffi: 2, rCiuffo: 1.35, raggio: [0.52, 0.82], dettaglio: det, scuro: F[0], chiaro: F[1], rnd: r }),
  ]); };
  // Livelli (prestazioni, dopo la misura dell'utente: 28–30 FPS nel bosco; «meno definizione a centinaia di metri a
  // favore del realismo entro i 50 m»): vicino fino a 60 m, più ricco; medio fino a 300 m
  // con 3 ciuffi semplici (~70 triangoli); lontano un ciuffo solo e un fusto a 3 lati (~26).
  const latMedio = (a, b, y) => unisci([
    fusto(0.4, 0.05, y - b * 0.1, 4, COL.corteccia),     // si assottiglia dentro la chioma, niente moncone in vista
    ...chiomaAMasse({ y, a, b, masse: 3, ciuffi: 1, raggio: [1.5, 1.95], dettaglio: 0, scuro: F[0], chiaro: F[1], rnd, schegge: 2 }),
  ]);
  M.latifoglia = [
    // Misura nel bosco fitto (UHD 730): ~135 latifoglie entro 60 m da ~2450 triangoli valevano gran parte dei 6 ms
    // della vegetazione. Ciuffi pieni entro 25 m; da 25 a 60 m stessa chioma a ciuffi semplici (~650 triangoli).
    // Alberi ramificati (~46 ciuffi in gruppi da 2): pieni entro 18 m, ciuffi semplici fino a 50 m (stessa forma).
    { fino: 18, varianti: [quercia(1), faggio(1), castagno(1)] },
    { fino: 50, varianti: [quercia(0), faggio(0), castagno(0)] },
    // Medio fino a 200 m (prima 300; misura nel bosco fitto dopo la Carta rigenerata: vegetazione 7,2 ms contro 6,5 di
    // budget, ~4400 latifoglie medie per ~300 000 triangoli); oltre, sagome.
    { fino: 200, varianti: [latMedio(4.2, 3.1, 7.6), latMedio(3.2, 4.2, 9.2)] },
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
    { fino: 60, varianti: [unisci([
      ...ramificato({ fusto: 5.5, cima: 9.5, rami: 6, parte: [0.6, 1.0], inc: [55, 75], lungo: 2.3, r0: 0.3, rCima: 0.22, tronco: [0.38, 0.22],
        colRamo: COL.cortecciaBetulla, ciuffi: 2, rCiuffo: 0.95, raggio: [0.45, 0.7], dettaglio: 1, scuro: R[0], chiaro: R[1], rnd })])] },
    { fino: 300, varianti: [unisci([fusto(0.34, 0.04, 9.5, 4, COL.cortecciaBetulla),
      ...chiomaAMasse({ y: 10.3, a: 2.0, b: 5.2, masse: 5, ciuffi: 1, raggio: [1.0, 1.4], dettaglio: 0, scuro: R[0], chiaro: R[1], rnd, schegge: 2 })])] },
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
  // Siepi (richiesta dell'utente: «senza collegamento con il terreno, si vedono sospese»): ciuffi su un ellissoide
  // che scende sotto il terreno, fitti in basso; i tratti a passo 1,7 m si toccano.
  const siepe = (det, ciuffi) => unisci(chioma({ y: 0.85, a: 1.05, b: 1.2, c: 0.85, ciuffi, raggio: [0.5, 0.75],
    dettaglio: det, scuro: C[0], chiaro: C[1], rnd, sotto: 0.9, pieno: 0.4, morbido: 0.8 }));
  M.siepe = [
    { fino: 40, varianti: [siepe(1, 7), siepe(1, 7)] },
    { fino: 180, varianti: [siepe(0, 5)] },
  ];
  // Cespugli (richiesta dell'utente: «pezzi vuoti, fatti da più elementi, non un blocco unico come un masso»):
  // 3–5 ciuffi distinti su rametti dalla base, con spazi in mezzo.
  const cesp = (n, larg, alt, ciuffi, det) => {
    const parti = [];
    for (let k = 0; k < n; k++) {
      // Ciuffi bassi: il più basso tocca terra, gli altri a altezze diverse; nessuno sospeso sopra un gambo. Ciuffi
      // ravvicinati e uno al centro (richiesta dell'utente: «sembrano mezzi spogli»): vuoti piccoli, non trasparenze.
      const an = (k / n) * Math.PI * 2 + rnd() * 1.2, d = k === 1 ? 0 : larg * (0.15 + 0.45 * rnd()), r = 0.3 + 0.18 * rnd();
      const h = Math.max(r * 0.55, alt * (k === 0 ? 0.15 : 0.2 + 0.5 * rnd()));
      const x = Math.cos(an) * d, z = Math.sin(an) * d;
      parti.push(...chioma({ x, y: h, z, a: r, b: r * (0.7 + 0.3 * rnd()), ciuffi, raggio: [0.3, 0.46], dettaglio: det,
        scuro: C[0], chiaro: C[1], rnd, sotto: 0.3, pieno: 0.3, morbido: 0.6, schegge: det ? 6 : 2,
        inviluppo: { x: 0, y: alt * 0.5, z: 0, a: larg + 0.3, b: alt * 0.7 + 0.2, c: larg + 0.3 } }));
      if (det) parti.push(ramoVerso(0, 0, 0, x * 0.85, h - r * 0.5, z * 0.85, 0.035, 0.015, COL.corteccia, 3));
    }
    return unisci(parti);
  };
  M.cespuglio = [
    { fino: 35, varianti: [cesp(6, 0.9, 0.9, 2, 1), cesp(5, 0.75, 1.0, 2, 1)] },
    { fino: 160, varianti: [cesp(4, 0.8, 0.8, 1, 0)] },
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
  // Rami secchi a terra: un ramo coricato (lungo x) con due rametti; due forme. Piccoli: si attraversano.
  const ramo = (lungo, piega) => {
    const asse = fusto(0.07, 0.03, lungo, 4, COL.corteccia, { sotto: 0 });
    asse.rotateZ(Math.PI / 2 - piega); asse.translate(lungo / 2, 0.06, 0);
    const r1 = fusto(0.03, 0.012, 0.7, 3, COL.corteccia, { sotto: 0 });
    r1.rotateZ(Math.PI / 2); r1.rotateY(0.7); r1.translate(-lungo * 0.15, 0.05, 0);
    const r2 = fusto(0.025, 0.01, 0.5, 3, COL.corteccia, { sotto: 0 });
    r2.rotateZ(Math.PI / 2); r2.rotateY(-0.9); r2.translate(lungo * 0.2, 0.04, 0);
    return unisci([asse, r1, r2]);
  };
  M.ramo = [{ fino: 60, varianti: [ramo(2.2, 0.04), ramo(1.6, -0.03)] }];

  // Muretti a secco: tratti di 2,2 m lungo x (si sovrappongono a passo 1,7 m), alti ~0,95 m: due corsi di pietre
  // spaccate e una fila di copertina; da lontano un blocco semplice.
  const tratto = () => {
    const pietre = [];
    for (const [y, n, r, sy] of [[0.2, 4, 0.3, 0.62], [0.52, 4, 0.27, 0.6], [0.8, 3, 0.26, 0.5]]) {
      for (let k = 0; k < n; k++) {
        const x = -1.1 + (k + 0.5) * (2.2 / n) + (rnd() - 0.5) * 0.15;
        pietre.push(R1(r * (0.9 + 0.25 * rnd()), { dettaglio: 0, tagli: 5, x, y, z: (rnd() - 0.5) * 0.08,
          sx: 1.25 + 0.3 * rnd(), sy, sz: y < 0.4 ? 1.0 : 0.85 }));
      }
    }
    return unisci(pietre);
  };
  const blocco = new THREE.BoxGeometry(2.2, 0.9, 0.5).toNonIndexed();
  blocco.translate(0, 0.42, 0);
  M.muretto = [
    { fino: 50, piatto: true, varianti: [tratto(), tratto()] },
    { fino: 220, piatto: true, varianti: [colora(blocco, (c) => c.set(COL.roccia[0]).lerp(new THREE.Color(COL.roccia[1]), 0.35))] },
  ];

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
function materialeSagome(texture, uniDirada) {
  const mat = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirada = uniDirada;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTessera;
// Comparsa graduale delle sagome diradate (vedi CRESCITA): soglia dell'albero (< 0: mai diradata, sempre piena)
attribute float aSoglia;
uniform vec2 uDirada;    // distanza da cui le sagome si diradano, esponente (densità (da/d)^(2k))`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vMapUv = vec2((uv.x + aTessera) / ${ATLANTE.tessere.toFixed(1)}, uv.y);`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', `
  vec3 kdC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float kdS = length(instanceMatrix[0].xyz);
  if (aSoglia >= 0.0) {                     // diradata: cresce quando la densità a questa distanza supera la sua soglia
    float kdD = distance(kdC.xz, cameraPosition.xz);
    float kdP = kdD <= uDirada.x ? 1.0 : pow(uDirada.x * uDirada.x / (kdD * kdD), uDirada.y);
    kdS *= smoothstep(aSoglia - ${CRESCITA.comparsa.toFixed(3)}, aSoglia, kdP);
  }
  vec3 kdV = cameraPosition - kdC; kdV.y = 0.0;
  vec3 kdR = normalize(vec3(kdV.z, 0.0, -kdV.x) + vec3(1e-4, 0.0, 0.0));
  vec4 mvPosition = viewMatrix * vec4(kdC + kdR * position.x * kdS + vec3(0.0, position.y * kdS, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  if (kdS <= 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'kd-sagome-3';
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
  // Comparsa graduale: di base mai diradata (sempre piena)
  const ap = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)).fill(-1), 1);
  ap.setUsage(THREE.DynamicDrawUsage);
  m.geometry.setAttribute('aSoglia', ap);
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
// a `da` m, poi la densità cala fino al 36 % al bordo del blocco, la densità del bosco lontano (cella 10 m contro 6):
// le due si raccordano. Gli alberi dietro sono comunque coperti.
const SAGOME_DIRADA = { da: 300, bordo: 0.36 };
// (dopo la misura nel bosco fitto con le latifoglie medie a 200 m: sagome 2,5 ms con 38 800 istanze, sovrapposte con
// alpha test) Diradate già da `da` m, con una legge più dolce: densità (da/d)^k, k tale che al bordo del blocco valga
// `bordo`, la densità del bosco lontano (cella 10 m contro 6): il raccordo resta.

// ─── Collisioni (passo 3; deciso con l'utente: tronchi, massi, affioramenti e sassi grandi bloccano; arbusti, erba e
// sassi piccoli si attraversano) ───
// Cerchi sul piano in una griglia di 16 m: si controllano solo le celle attorno al cavaliere. Raggio per tipo al
// modello di scala 1 (m), moltiplicato per la scala dell'istanza; il tronco caduto è una fila di tre cerchi.
const COLLISIONI = { cella: 16, sassoMinimo: 1.1,
  raggio: { latifoglia: 0.42, conifera: 0.34, pino: 0.38, riva: 0.4, secco: 0.32, masso: 1.05, affioramento: 2.3,
    sasso: 0.3, tronco: 0.32, muretto: 0.4, siepe: 0.75 } };

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
      } else if (nome === 'muretto') {
        for (const d of [-0.75, 0, 0.75]) aggiungi(x + Math.cos(rot) * d * s, z - Math.sin(rot) * d * s, r0 * s);
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
  rocce: [0.62, 1.2, 0], bosco: [0.8, 1.05, 0], muri: [1.1, 1.4, 0],
};
const GIALLO = new THREE.Color('#d9c85a');
const RIDISTRIBUISCI = { ms: 1.5, pezzo: 2000 };   // tempo per fotogramma e alberi tra un controllo e l'altro
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

// ─── Comparsa graduale con la distanza (richieste dell'utente: alberi, massi e altri oggetti «apparivano dal nulla»
// camminando; poi: la dissolvenza a puntini sembrava sfocata, non coerente con la grafica → gli oggetti crescono) ───
// Gli oggetti con una distanza massima (cespugli, sassi, siepi, muretti, tronchi caduti…) crescono da zero alla loro
// misura negli ultimi metri prima di quella distanza (CRESCITA.quota della distanza, tra min e max m): nello shader,
// dal suolo in su, solidi e senza trasparenze; allontanandosi si rimpiccioliscono allo stesso modo. Le sagome diradate
// oltre 300 m crescono quando la densità a quella distanza supera la loro soglia. Il passaggio tra i modelli dello
// stesso oggetto (vicino → medio → sagoma) resta istantaneo. Il livello più lontano si assegna fino a
// CRESCITA.margine m oltre la sua distanza (≥ RIASSEGNA_DOPO): lì l'oggetto ha misura zero e non si disegna.
const CRESCITA = { quota: 0.12, min: 6, max: 30, margine: 13, comparsa: 0.08 };
const GLSL_CRESCITA = `
// Misura (0–1) di un oggetto che c'è fino a fin m dalla camera, a distanza d: piena fino all'inizio della fascia.
float kdCresci(float fin, float d) {
  float b = clamp(fin * ${CRESCITA.quota.toFixed(3)}, ${CRESCITA.min.toFixed(1)}, ${CRESCITA.max.toFixed(1)});
  return 1.0 - smoothstep(fin - b, fin, d);
}`;

// ─── Visuale pulita (richiesta dell'utente: nel bosco tronchi e chiome si mettevano tra la camera e il cavaliere) ───
// Sparisce solo ciò che copre davvero il cavaliere (seconda richiesta dell'utente: prima sparivano anche
// siepi, alberi e muretti di lato, a 3–4 m, che non coprivano niente). Ogni oggetto è approssimato con dei volumi nel
// suo sistema (ruotati e scalati come l'istanza): il tronco sotto la chioma e la chioma (o l'oggetto intero) divisa in
// FASCE_VISUALE fasce di altezza. Ogni volume è un cilindro verticale (alberi, cespugli, rocce: segue la sagoma rotonda
// o a cono, mentre una scatola «occupa» anche gli angoli vuoti) oppure, se la fascia è allungata (muretti), una
// scatola. Lo shader porta nel sistema dell'istanza i segmenti camera → piedi, busto e testa del cavaliere e controlla
// se attraversano i volumi, allargati di un margine: se sì l'oggetto sparisce, netto (terza richiesta dell'utente: la
// dissolvenza a puntini sembrava sfocata, non coerente con la grafica; niente stati a metà). I segmenti si fermano poco
// prima del cavaliere: il tronco contro cui sta camminando resta. Sparisce anche ciò che tocca l'obiettivo (entro il
// margine). Nessuna trasparenza e nessun discard: un oggetto nascosto ha i vertici fuori dallo schermo. Erba e felci a
// ridosso della camera si rimpiccioliscono. Il calcolo si fa solo per gli oggetti vicini alla linea camera→cavaliere.
// Valori provabili dalla console: kd.vegetazione.cfgVisuale (x = margine, y = di quanto i segmenti si fermano prima
// del cavaliere, z = raggio attorno alla camera per erba e felci), in metri.

const VISUALE = { margine: 0.35, arretra: 0.4, vicino: 1.6 };
const ALTEZZE_CAVALIERE = [0.15, 0.95, 1.75];   // m: piedi, busto, testa
const FASCE_VISUALE = 4;                         // fasce della chioma; più il tronco
const VOLUMI_VISUALE = FASCE_VISUALE + 1;
const ALLUNGATA = 1.4;                           // rapporto dei lati oltre il quale una fascia è una scatola

/**
 * Volumi per la visuale nel sistema della geometria: il primo è il tronco (sotto la chioma; vuoto se non c'è), poi
 * FASCE_VISUALE fasce della chioma (o dell'oggetto intero) di uguale altezza. La chioma comincia dove i vertici superano
 * metà del raggio orizzontale massimo. Per ogni volume: min e max (scatola) e, in `cil`, centro x, z, raggio e 1 se
 * cilindro / 0 se scatola. min > max = volume vuoto.
 */
function volumiVisuale(geo) {
  const p = geo.attributes.position;
  let rMax = 0, yTop = -Infinity;
  for (let i = 0; i < p.count; i++) { rMax = Math.max(rMax, Math.hypot(p.getX(i), p.getZ(i))); yTop = Math.max(yTop, p.getY(i)); }
  let yChioma = Infinity;
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) > 0.5 * rMax) yChioma = Math.min(yChioma, p.getY(i));
  const alta = Math.max(yTop - yChioma, 1e-3);
  const scatole = Array.from({ length: VOLUMI_VISUALE }, () => new THREE.Box3());
  const membri = Array.from({ length: VOLUMI_VISUALE }, () => []);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const metti = (k) => { scatole[k].expandByPoint(v); membri[k].push(i); };
    if (v.y < yChioma) { metti(0); continue; }
    const g = (v.y - yChioma) / alta * FASCE_VISUALE, f = Math.min(FASCE_VISUALE - 1, Math.floor(g));
    metti(f + 1);
    if (f > 0 && g - f < 1e-6) metti(f);         // vertice al confine: in entrambe le fasce, niente fessure
  }
  const min = [], max = [], cil = [];
  scatole.forEach((S, k) => {
    if (S.isEmpty()) {
      min.push(new THREE.Vector3(1, 1, 1)); max.push(new THREE.Vector3(-1, -1, -1)); cil.push(new THREE.Vector4());
      return;
    }
    min.push(S.min.clone()); max.push(S.max.clone());
    const lx = S.max.x - S.min.x, lz = S.max.z - S.min.z;
    const cx = (S.min.x + S.max.x) / 2, cz = (S.min.z + S.max.z) / 2;
    let r = 0;
    for (const i of membri[k]) r = Math.max(r, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
    cil.push(new THREE.Vector4(cx, cz, r, Math.max(lx, lz) / Math.max(Math.min(lx, lz), 1e-3) > ALLUNGATA ? 0 : 1));
  });
  return { min, max, cil, raggio: rMax };
}

/**
 * Aggiunge al materiale la visuale pulita e la crescita con la distanza. modo: 'pieno' (alberi, arbusti, rocce,
 * muretti: spariscono se coprono il cavaliere) | 'vicino' (erba, felci: si rimpiccioliscono a ridosso della camera).
 * `geo`: la geometria della mesh (solo 'pieno', per i volumi). `fine`: distanza massima dell'oggetto se questo è il
 * suo livello più lontano (cresce prima di quella distanza), altrimenti null.
 */
function conVisuale(mat, uni, modo, geo = null, fine = null) {
  const vol = modo === 'pieno' ? volumiVisuale(geo) : null;
  const prima = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prima(sh, renderer);
    sh.uniforms.uCav = uni.uCav;
    sh.uniforms.uVisuale = uni.uVisuale;
    sh.uniforms.uVisCfg = uni.uVisCfg;
    if (vol) {
      sh.uniforms.uVol0 = { value: vol.min };
      sh.uniforms.uVol1 = { value: vol.max };
      sh.uniforms.uVolC = { value: vol.cil };
      sh.uniforms.uRaggio = { value: vol.raggio };
    }
    if (fine !== null) sh.uniforms.uFine = { value: fine };
    // Misura dell'istanza: crescita con la distanza (livello più lontano) o, per erba e felci, a ridosso della camera
    const misura = modo === 'pieno' ? (fine !== null ? `
    {
      vec3 kdQ = (modelMatrix * instanceMatrix[3]).xyz;
      kdMisura = kdCresci(uFine, distance(kdQ.xz, cameraPosition.xz));
    }` : '') : `
    {
      vec3 kdQ = (modelMatrix * instanceMatrix[3]).xyz;
      kdMisura = mix(1.0, smoothstep(uVisCfg.z * 0.5, uVisCfg.z, distance(kdQ, cameraPosition)), uVisuale);
    }`;
    const calcolo = modo === 'pieno' ? `
      mat4 kdM = modelMatrix * instanceMatrix;
      vec3 kdO = kdM[3].xyz;
      vec3 kdS2 = vec3(dot(kdM[0].xyz, kdM[0].xyz), dot(kdM[1].xyz, kdM[1].xyz), dot(kdM[2].xyz, kdM[2].xyz));
      vec3 kdSc = sqrt(kdS2);
      vec2 kdAsse = uCav.xz - cameraPosition.xz;
      float kdL = length(kdAsse);
      vec2 kdU = kdAsse / max(kdL, 1e-3);
      vec2 kdRel = kdO.xz - cameraPosition.xz;
      float kdR = uRaggio * max(kdSc.x, kdSc.z) + uVisCfg.x;
      float kdT = dot(kdRel, kdU);
      // Solo gli oggetti che possono stare tra camera e cavaliere (gli altri: niente calcolo)
      if (uVisuale > 0.0 && kdMisura > 0.0 && kdT > -kdR && kdT < kdL + kdR && abs(dot(kdRel, vec2(-kdU.y, kdU.x))) < kdR + 1.0) {
        // Segmenti nel sistema dell'istanza: colonne ortogonali (rotazione per scala lungo gli assi)
        vec3 kdA = cameraPosition - kdO;
        vec3 kdPa = vec3(dot(kdA, kdM[0].xyz), dot(kdA, kdM[1].xyz), dot(kdA, kdM[2].xyz)) / kdS2;
        vec3 kdFine = vec3(uCav.x - kdU.x * uVisCfg.y, 0.0, uCav.z - kdU.y * uVisCfg.y) - kdO;
        vec3 mg = vec3(uVisCfg.x) / kdSc;
        float mr = uVisCfg.x / (0.5 * (kdSc.x + kdSc.z));
        for (int i = 0; i < 3; i++) {
          vec3 kdB = kdFine + vec3(0.0, uCav.y + (i == 0 ? ${ALTEZZE_CAVALIERE[0].toFixed(2)} : i == 1 ? ${ALTEZZE_CAVALIERE[1].toFixed(2)} : ${ALTEZZE_CAVALIERE[2].toFixed(2)}), 0.0);
          vec3 kdPb = vec3(dot(kdB, kdM[0].xyz), dot(kdB, kdM[1].xyz), dot(kdB, kdM[2].xyz)) / kdS2;
          for (int f = 0; f < ${VOLUMI_VISUALE}; f++) kdNascosto = kdNascosto || kdSegVolume(kdPa, kdPb, uVol0[f] - mg, uVol1[f] + mg, uVolC[f], mr);
        }
      }` : '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCav;
uniform float uVisuale;
uniform vec3 uVisCfg;${fine !== null ? `
uniform float uFine;     // distanza massima dell'oggetto (livello più lontano)
${GLSL_CRESCITA}` : ''}${vol ? `
uniform vec3 uVol0[${VOLUMI_VISUALE}], uVol1[${VOLUMI_VISUALE}];
uniform vec4 uVolC[${VOLUMI_VISUALE}];
uniform float uRaggio;
// Il segmento p→q attraversa il volume? s0, s1: scatola già allargata (vuota se s0 > s1); c: centro x, z, raggio,
// 1 = cilindro verticale tra s0.y e s1.y (raggio allargato di mr) / 0 = la scatola stessa.
bool kdSegVolume(vec3 p, vec3 q, vec3 s0, vec3 s1, vec4 c, float mr) {
  if (any(greaterThan(s0, s1))) return false;
  vec3 d = q - p;
  d += step(abs(d), vec3(1e-5)) * 1e-5;
  vec3 t0 = (s0 - p) / d, t1 = (s1 - p) / d;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  if (c.w < 0.5) return max(max(tmin.x, tmin.y), max(tmin.z, 0.0)) <= min(min(tmax.x, tmax.y), min(tmax.z, 1.0));
  // cilindro: tratto in cui la quota sta nella fascia ∩ tratto in cui la distanza orizzontale è entro il raggio
  float a0 = max(tmin.y, 0.0), a1 = min(tmax.y, 1.0);
  vec2 w = p.xz - c.xy;
  float r = c.z + mr;
  float A = dot(d.xz, d.xz), B = dot(w, d.xz), C = dot(w, w) - r * r;
  float D = B * B - A * C;
  if (D < 0.0) return false;
  float sq = sqrt(D);
  return max(a0, (-B - sq) / A) <= min(a1, (-B + sq) / A);
}` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
    float kdMisura = 1.0;${misura}
    transformed *= kdMisura;                // dal suolo in su (origine dell'oggetto a terra)`)
      .replace('#include <project_vertex>', `#include <project_vertex>
    {
      bool kdNascosto = kdMisura <= 1e-4;${calcolo}
      if (kdNascosto) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // non si disegna: fuori dallo schermo
    }`);
  };
  const chiave = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${chiave()}|kd-visuale-${modo}-6${fine !== null ? '-cresce' : ''}`;
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
  tronco: { h: 0.25, r: 1.6, v: 0.3, a: 0.5, p: 1.8 }, muretto: { h: 0.45, r: 1.2, v: 0.5, a: 0.55, p: 1.3 },
  siepe: { h: 1.0, r: 1.1, v: 1.2, a: 0.65, p: 1.3 },
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
    superficie.geometry.setAttribute('aSuolo', new THREE.BufferAttribute(pos.suolo, 4));
    // Campi coltivati: coordinate degli appezzamenti per vertice (PARCELLE, vegetazione.js).
    if (pos.aCampi) superficie.geometry.setAttribute('aCampi', new THREE.BufferAttribute(pos.aCampi, 4));
    coloriTerreno = superficie.geometry.attributes.color?.array || null;
  }

  // Uniformi condivise da tutti i materiali della vegetazione (visuale pulita)
  const uniVis = {
    uCav: { value: new THREE.Vector3() },
    uVisuale: { value: 0 },                   // 0 finché non arriva la posizione del cavaliere
    uVisCfg: { value: new THREE.Vector3(VISUALE.margine, VISUALE.arretra, VISUALE.vicino) },
  };
  const uniDirada = { value: new THREE.Vector2(SAGOME_DIRADA.da, 0) };

  // Sagome: atlante (serve il renderer) e mesh delle sagome del blocco, comune a tutti gli alberi.
  let atlante = null, matSagome = null, sagomeBlocco = null;
  if (renderer) {
    atlante = creaAtlante(renderer, modelli.sorgentiSagome);
    matSagome = materialeSagome(atlante.texture, uniDirada);
    const nAlberi = Object.values(pos.tipi).filter((t) => t.gruppo === 'alberi').reduce((s, t) => s + t.n, 0);
    sagomeBlocco = meshSagome(matSagome, nAlberi, 'vegetazione-sagome');
    oggetto.add(sagomeBlocco);
  }
  const halfBlocco = terrain ? terrain.half : 1000;
  uniDirada.value.y = Math.log(SAGOME_DIRADA.bordo) / Math.log(SAGOME_DIRADA.da / halfBlocco) / 2;

  const tipi = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [nome, t] of Object.entries(pos.tipi)) {
    const livelli = modelli[nome];
    if (!livelli || !t.n) continue;
    // Matrici e colori di tutte le istanze, calcolati una volta.
    const matrici = new Float32Array(t.n * 16), colori = new Float32Array(t.n * 3), xz = new Float32Array(t.n * 2);
    const varia = new Float32Array(t.n);
    const [lo, hi, giallo] = TONO[t.gruppo] || [0.9, 1.1, 0];
    const roccia = t.gruppo === 'rocce', albero = t.gruppo === 'alberi', muro = t.gruppo === 'muri';
    for (let k = 0; k < t.n; k++) {
      const d = t.dati, o = k * STRIDE;
      const s = d[o + 3], rot = d[o + 4], v = d[o + 5];
      p.set(d[o], d[o + 1] + (roccia ? -0.15 * s : nome === 'siepe' ? -0.12 * s : 0), d[o + 2]);
      // Rocce inclinate; alberi e arbusti tra slanciati e tozzi, larghi e stretti, con un'inclinazione minima.
      const v2 = (v * 7.13) % 1, v3 = (v * 3.71) % 1;
      e.set(roccia ? (v - 0.5) * 0.5 : (v2 - 0.5) * 0.06, rot, roccia ? (v3 - 0.5) * 0.4 : (v3 - 0.5) * 0.06);
      q.setFromEuler(e);
      const v4 = (v * 17.31) % 1;              // altezza indipendente dalla larghezza (richiesta dell'utente)
      const alto = roccia ? 0.55 + 0.7 * v : (albero ? 0.72 + 0.56 * v4 : 0.85 + 0.3 * v4);
      // Alberi: larghezza (e quindi spessore del tronco) proporzionata all'altezza, ±15 % (richiesta dell'utente:
      // «tronchi tutti uguali alla base»); arbusti e rocce come prima.
      const largo = roccia ? 0.7 + 0.8 * v3 : albero ? alto * (0.85 + 0.3 * v3) : 0.8 + 0.45 * v3;
      sc.set(s * largo, s * alto, s * (roccia ? 0.7 + 0.7 * v2 : largo * (0.9 + 0.2 * v2)));
      if (muro) {                              // muretti: diritti, lungo il confine, solo un po' più alti o bassi
        e.set(0, rot, 0); q.setFromEuler(e);
        p.y = d[o + 1] - 0.08;
        sc.set(s, s * (0.88 + 0.24 * v4), s);
      }
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
    const mesh = livelli.map((L, li) => (L.sagoma ? [] : L.varianti).map((geo, vi) => {
      // Il livello più lontano, se finisce a una distanza, fa crescere l'oggetto prima di quella distanza
      const fine = li === livelli.length - 1 && Number.isFinite(L.fino) ? L.fino : null;
      const m = new THREE.InstancedMesh(geo,
        conVisuale(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!L.piatto }), uniVis, 'pieno', geo, fine), t.n);
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
  // Generatore: per ogni tipo, il cerchio a fasce di righe (`VICINO_FASCE`, misura: l'erba di un colpo fino a 21 ms
  // sulla CPU attorno alla rocca), poi le istanze in un buffer a parte, a pezzi; alla fine si copiano nella mesh
  // tutte insieme (niente fotogrammi con mezza erba).
  const VICINO_FASCE = { erba: 32, felce: 6, ciottolo: 10 }, VICINO_PEZZO = 1000;
  const tempVicini = Object.fromEntries(Object.entries(vicini).map(([k, V]) => [k, { m: new Float32Array(V.max * 16), c: new Float32Array(V.max * 3) }]));
  function* generaVicini(cx, cz) {
    for (const nome of Object.keys(vicini)) {
      const V = vicini[nome], nF = VICINO_FASCE[nome] || 4, parti = [];
      for (let f = 0; f < nF; f++) { parti.push(pos.erbaAttorno(cx, cz, { [nome]: V.raggio }, [f, nF])[nome]); yield; }
      const am = tempVicini[nome].m, ac = tempVicini[nome].c;
      let j = 0, passi = 0;
      for (const T of parti) {
        for (let k = 0; k < T.n && j < V.max; k++) {
          if (++passi % VICINO_PEZZO === 0) yield;
          const o = k * STRIDE, x = T.dati[o], z = T.dati[o + 2];
          const dist = Math.hypot(x - cx, z - cz);
          if (dist > V.raggio) continue;
          // Dissolvenza: verso il limite i ciuffi si rimpiccioliscono (niente bordo netto che avanza).
          const f = 1 - Math.min(1, Math.max(0, (dist - 0.7 * V.raggio) / (0.3 * V.raggio)));
          if (f <= 0.05) continue;
          const sz = T.dati[o + 3] * f, v = T.dati[o + 5];
          p.set(x, T.dati[o + 1], z);
          q.setFromAxisAngle(_v.set(0, 1, 0), T.dati[o + 4]);
          sc.set(sz, sz * (0.8 + 0.5 * v), sz);
          m4.compose(p, q, sc).toArray(am, j * 16);
          if (nome === 'erba') coloreSotto(_c, x, z).multiplyScalar(1.15 + 0.25 * v);
          else if (nome === 'ciottolo') { const b = 0.65 + 0.5 * v, w = (v * 7.7) % 1 - 0.5; _c.setRGB(b * (1 + 0.1 * w), b, b * (1 - 0.1 * w)); }
          else _c.setRGB(0.85 + 0.3 * v, 0.85 + 0.3 * v, 0.85 + 0.2 * v);
          ac[j * 3] = _c.r; ac[j * 3 + 1] = _c.g; ac[j * 3 + 2] = _c.b;
          j++;
        }
      }
      V.mesh.instanceMatrix.array.set(am.subarray(0, j * 16));
      V.mesh.instanceColor.array.set(ac.subarray(0, j * 3));
      V.mesh.count = j;
      V.mesh.visible = j > 0;
      V.mesh.instanceMatrix.clearUpdateRanges(); V.mesh.instanceMatrix.addUpdateRange(0, j * 16);
      V.mesh.instanceColor.clearUpdateRanges(); V.mesh.instanceColor.addUpdateRange(0, j * 3);
      V.mesh.instanceMatrix.needsUpdate = true;
      V.mesh.instanceColor.needsUpdate = true;
      yield;
    }
  }
  let ultimoVicino = null, msVicino = 0, lavoroVicino = null;

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
    // Scatti (misure CPU: erba vicina fino a 21 ms attorno alla rocca, ridistribuzione 3–6 ms): tutto il lavoro a
    // pezzi, con un tetto unico per fotogramma (RIDISTRIBUISCI.ms, meno quello che hanno già preso le ombre): prima
    // l'erba vicina, poi la ridistribuzione. La prima volta tutto subito (la Scena è appena caricata).
    const t0 = performance.now();
    const prima = !ultimo;
    if (!lavoroVicino && pos.erbaAttorno && (!ultimoVicino || Math.hypot(cx - ultimoVicino.x, cz - ultimoVicino.z) >= VICINO.rifai)) {
      ultimoVicino = { x: cx, z: cz };
      lavoroVicino = generaVicini(cx, cz);
    }
    if (!lavoro && (prima || Math.hypot(cx - ultimo.x, cz - ultimo.z) >= RIASSEGNA_DOPO)) {
      ultimo = { x: cx, z: cz };
      lavoro = ridistribuisci(cx, cz);
    }
    const tetto = prima ? Infinity : Math.max(0.3, RIDISTRIBUISCI.ms - msOmbre);
    if (lavoroVicino) {
      let r;
      do r = lavoroVicino.next(); while (!r.done && performance.now() - t0 < tetto);
      if (r.done) lavoroVicino = null;
    }
    const t1 = performance.now();
    msVicino = t1 - t0;
    if (lavoro && t1 - t0 < tetto) {
      let r;
      do r = lavoro.next(); while (!r.done && performance.now() - t0 < tetto);
      if (r.done) lavoro = null;
    }
    msAggiorna = performance.now() - t1;
  }

  // Ridistribuzione delle istanze tra livelli e varianti: generatore che si ferma ogni RIDISTRIBUISCI.pezzo alberi.
  // Mentre lavora, ogni tipo resta come prima finché non è finito (i conteggi cambiano alla fine del tipo).
  let lavoro = null;
  function* ridistribuisci(cx, cz) {
    let nSag = 0, passi = 0;
    const aS = sagomeBlocco ? sagomeBlocco.instanceMatrix.array : null;
    const tS = sagomeBlocco ? sagomeBlocco.geometry.attributes.aTessera.array : null;
    const sS = sagomeBlocco ? sagomeBlocco.geometry.attributes.aSoglia.array : null;
    const bordoMin = halfBlocco - SAGOMA_BORDO.fascia, oltre2 = SAGOMA_BORDO.oltre * SAGOMA_BORDO.oltre;
    const da2 = SAGOME_DIRADA.da * SAGOME_DIRADA.da, kDir = uniDirada.value.y, M = CRESCITA.margine;
    for (const T of tipi) {
      // Il livello più lontano, se ha una distanza massima, si assegna fino a M m oltre (lì l'oggetto ha misura zero
      // e cresce avvicinandosi, CRESCITA): così la crescita segue la camera tra una ridistribuzione e l'altra.
      const L = T.livelli, nL = L.length;
      const fino2 = L.map((l, i) => (i === nL - 1 && Number.isFinite(l.fino) ? (l.fino + M) ** 2 : l.fino * l.fino));
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
          if (!T.sag) continue;
          // Diradate oltre `da`: c'è (o crescerà entro M m di cammino) se la densità supera la sua soglia
          const dm2 = Math.max(Math.sqrt(d2) - M, SAGOME_DIRADA.da) ** 2;
          if (d2 > da2 && !(T.caso[k] - CRESCITA.comparsa < (da2 / dm2) ** kDir)) continue;
          const o = k * 5;
          scriviSagoma(aS, nSag, T.sag[o], T.sag[o + 1], T.sag[o + 2], T.sag[o + 3]);
          tS[nSag] = T.sag[o + 4];
          sS[nSag] = d2 > da2 ? T.caso[k] : -1;
          nSag++;
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
      const sg = sagomeBlocco.geometry.attributes.aSoglia;
      sg.clearUpdateRanges(); sg.addUpdateRange(0, nSag); sg.needsUpdate = true;
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
