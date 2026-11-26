// Abitanti di rocche e borghi (M7, passo 7): figure ferme ai loro posti (oste, fabbro, guardie…) e popolani che
// camminano per le strade del borgo. Questo modulo sceglie posti e percorsi, muove le persone, le tiene distanti
// tra loro e dal cavaliere e trova chi è abbastanza vicino per «E: parla». I modelli sono della sessione M1
// (js/3d/persone3d.js, `creaPersona({ ruolo, colori, seme }) → { object, update(dt, stato) }`); finché non ci sono,
// un segnaposto a capsula con la stessa interfaccia (creaPersonaSegnaposto).
import * as THREE from 'three';

export const ABITANTI = {
  raggio: 0.35,                            // m: ingombro di una persona (collisioni)
  parla: { distanza: 2.6, rivolto: 0.7 },  // «E: parla» entro 2,6 m, rivolti verso la persona (entro ~45°)
  lontano: 110,                            // m: oltre, le persone non si disegnano e non si muovono
  velocita: [0.9, 1.35],                   // m/s dei popolani
  sosta: [2, 9],                           // s di sosta a fine tratto
  tratto: [6, 22],                         // punti della strada percorsi prima di fermarsi
  notte: 0.55,                             // buio oltre il quale restano fuori solo guardie e oste
  popolani: { minore: 3, casata: 6, maggiore: 10 },
  porta: { fuori: 1.2, lato: [1.8, 2.4] }, // m: chi lavora in un edificio sta accanto alla porta, non davanti
};

/** Chi sta davanti a quale edificio. */
const RUOLO_EDIFICIO = {
  taverna: 'oste', fabbro: 'fabbro', stalla: 'stalliere', guaritore: 'guaritore', cappella: 'chierico',
  chiesa: 'chierico', salaArmi: 'maestroArmi', armeria: 'armaiolo', loggia: 'mercante', loggiaGrande: 'mercante',
};
export const NOMI_RUOLI = {
  oste: "L'oste", fabbro: 'Il fabbro', stalliere: 'Lo stalliere', guaritore: 'Il guaritore', chierico: 'Il chierico',
  maestroArmi: "Il maestro d'armi", armaiolo: "L'armaiolo", mercante: 'Un mercante', guardia: 'Una guardia',
  popolano: 'Un popolano', popolana: 'Una popolana', bambino: 'Un bambino',
};
export const RIGHE_PERSONE = {
  oste: '«Vino, zuppa e un pagliericcio: per chi paga c\'è sempre posto.»',
  fabbro: '«Ferri per cavalli e chiodi li faccio in giornata; le lame chiedono tempo.»',
  stalliere: '«Bella bestia, la vostra. Biada e strigliata, se volete.»',
  guaritore: '«Le ferite si curano; la fretta no.»',
  chierico: '«Che il Signore vi guardi la strada, cavaliere.»',
  maestroArmi: '«Chi vuole imparare viene all\'alba. Chi vuole vantarsi, al tramonto in taverna.»',
  armaiolo: '«Maglia buona, cuoio buono, prezzo onesto. Quasi.»',
  mercante: '«Stoffe di fuori, sale e spezie: guardare non costa.»',
  guardia: '«Si passa, si passa. Ma senza far guai.»',
  popolano: 'Un cenno del capo, e tira dritto per la sua strada.',
  popolana: 'Vi squadra un momento, poi torna alle sue faccende.',
  bambino: 'Vi fissa a bocca aperta, poi scappa via ridendo.',
};
const COLORI = {
  popolano: ['#6b5a44', '#7a6a50', '#5a4a3a', '#8a7458'], popolana: ['#7a5a48', '#6a6a50', '#8a6a5a', '#5a5040'],
  bambino: ['#7a6a50', '#8a7458'], mercante: ['#6a2c2a', '#2f4a6a'], chierico: ['#3a3430'], oste: ['#6b4a30'],
  fabbro: ['#3a3028'], stalliere: ['#5a4a30'], guaritore: ['#4a5a3a'], maestroArmi: ['#555555'], armaiolo: ['#4a4038'],
};
const PELLE = ['#d9b08c', '#c99872', '#b07d5a', '#e0bd9a'];

function generatore(seme) {
  let s = (seme >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ─── Segnaposto: capsula colorata con la testa (un oggetto, colori nei vertici, materiale condiviso) ───
let _geoSegnaposto = null, _matSegnaposto = null;
/**
 * Persona segnaposto con l'interfaccia dei modelli della sessione M1.
 * @param {{ ruolo:string, colori:{ veste:string, pelle:string }, seme:number }} p
 * @returns {{ object:THREE.Object3D, update:(dt:number, stato:{ modo:'fermo'|'cammina', velocita:number }) => void }}
 */
export function creaPersonaSegnaposto({ ruolo, colori, seme = 1 }) {
  if (!_geoSegnaposto) {
    const corpo = new THREE.CapsuleGeometry(0.26, 0.9, 3, 8).toNonIndexed();
    corpo.translate(0, 0.71, 0);
    const testa = new THREE.SphereGeometry(0.15, 8, 6).toNonIndexed();
    testa.translate(0, 1.5, 0);
    _geoSegnaposto = { corpo, testa };
    _matSegnaposto = new THREE.MeshLambertMaterial({ vertexColors: true });
    _matSegnaposto.userData.condivisa = true;   // vive quanto la pagina: libera() in main.js non deve disporlo
  }
  const { corpo, testa } = _geoSegnaposto;
  const n0 = corpo.attributes.position.count, n1 = testa.attributes.position.count;
  const pos = new Float32Array((n0 + n1) * 3), nrm = new Float32Array((n0 + n1) * 3), col = new Float32Array((n0 + n1) * 3);
  pos.set(corpo.attributes.position.array); pos.set(testa.attributes.position.array, n0 * 3);
  nrm.set(corpo.attributes.normal.array); nrm.set(testa.attributes.normal.array, n0 * 3);
  const cv = new THREE.Color(colori.veste), cp = new THREE.Color(colori.pelle);
  for (let i = 0; i < n0 + n1; i++) (i < n0 ? cv : cp).toArray(col, i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, _matSegnaposto);
  const r = generatore(seme);
  const scala = (ruolo === 'bambino' ? 0.65 : 0.95) + r() * 0.12;
  mesh.scale.set(scala * (0.9 + r() * 0.2), scala, scala * (0.9 + r() * 0.2));
  mesh.name = `persona-${ruolo}`;
  const object = new THREE.Group();
  object.add(mesh);
  let fase = r() * 10;
  return {
    object,
    update(dt, stato) {                    // dondolio del passo, proporzionale alla velocità
      fase += dt * (stato.modo === 'cammina' ? 6 * Math.max(0.6, stato.velocita) : 0);
      mesh.position.y = stato.modo === 'cammina' ? Math.abs(Math.sin(fase)) * 0.05 : 0;
      mesh.rotation.z = stato.modo === 'cammina' ? Math.sin(fase) * 0.04 : 0;
    },
  };
}

/**
 * Abitanti di tutte le rocche e i borghi del blocco.
 * @param {{ rocche:object[], quota:(x:number, z:number) => number, seme?:number,
 *           creaPersona?:typeof creaPersonaSegnaposto }} p
 *   rocche: quelle di main.js (rocca3d.js e borgo3d.js; servono edifici[].porta, porta, strade, inBlocco)
 * @returns {{ object:THREE.Group, persone:object[], update:Function, spingiFuori:Function, personaVicina:Function }}
 */
export function creaAbitanti({ rocche, quota, seme = 1, creaPersona = creaPersonaSegnaposto }) {
  const object = new THREE.Group();
  object.name = 'abitanti';
  const rnd = generatore(seme * 2654435761);
  const tra = ([a, b]) => a + rnd() * (b - a);
  const scegli = (L) => L[Math.floor(rnd() * L.length)];
  const persone = [];

  function aggiungi(ruolo, x, z, dir, extra = {}) {
    const s = Math.floor(rnd() * 1e9);
    const colori = { veste: extra.veste ?? scegli(COLORI[ruolo] ?? COLORI.popolano), pelle: scegli(PELLE) };
    const modello = creaPersona({ ruolo, colori, seme: s });
    const p = { ruolo, nome: NOMI_RUOLI[ruolo] ?? 'Qualcuno', x, z, dir, modello, fisso: true, notturno: false,
      stato: { modo: 'fermo', velocita: 0 }, ...extra };
    modello.object.position.set(x, quota(x, z), z);
    modello.object.rotation.y = dir;
    object.add(modello.object);
    persone.push(p);
    return p;
  }
  const versoDi = (nx, nz) => Math.atan2(nx, nz);

  for (const r of rocche) {
    const blocco = r.inBlocco;
    // Accanto alla porta degli edifici nominati: chi ci lavora, voltato verso la strada (la porta resta libera).
    for (const e of r.edifici ?? []) {
      const ruolo = RUOLO_EDIFICIO[e.tipo];
      const p = e.porta;
      if (!ruolo || p?.x === undefined) continue;
      const lato = (rnd() < 0.5 ? -1 : 1) * tra(ABITANTI.porta.lato), fuori = ABITANTI.porta.fuori;
      const x = p.x + p.nx * fuori - p.nz * lato, z = p.z + p.nz * fuori + p.nx * lato;
      aggiungi(ruolo, x, z, versoDi(p.nx, p.nz) + (rnd() - 0.5) * 0.8, { notturno: ruolo === 'oste' });
    }
    if (!blocco || !r.porta) continue;
    // Guardie: due fuori dalla porta del borgo, una fuori da quella della rocca.
    const g = r.porta, fuori = (g.sporgenza ?? 1) + 2.2;
    const lati = r.tipo === 'borgo' ? [-1, 1] : [1];
    const tono = r.tono ?? null;
    for (const l of lati) {
      const [x, z] = blocco(g.u + g.nu * fuori - g.nv * l * 2.8, g.v + g.nv * fuori + g.nu * l * 2.8);
      const [x1, z1] = blocco(g.u + g.nu * (fuori + 1), g.v + g.nv * (fuori + 1));
      aggiungi('guardia', x, z, Math.atan2(x1 - x, z1 - z), { notturno: true, veste: tono ?? '#5a3a2a' });
    }
    // Popolani lungo le strade del borgo.
    if (r.tipo !== 'borgo' || !r.strade?.length) continue;
    const percorsi = r.strade.filter((st) => st.punti.length >= 6).map((st) => st.punti.map(([u, v]) => blocco(u, v)));
    if (!percorsi.length) continue;
    const quanti = ABITANTI.popolani[r.luogo?.classe] ?? ABITANTI.popolani.casata;
    for (let k = 0; k < quanti; k++) {
      const P = scegli(percorsi), i = Math.floor(rnd() * (P.length - 1));
      const ruolo = rnd() < 0.12 ? 'bambino' : rnd() < 0.5 ? 'popolano' : 'popolana';
      const lato = (rnd() - 0.5) * 1.6;                       // non tutti sulla mezzeria
      const p = aggiungi(ruolo, P[i][0], P[i][1], 0, { fisso: false, P, i, verso: rnd() < 0.5 ? 1 : -1, lato,
        meta: 0, sosta: tra([0, 3]), v: tra(ABITANTI.velocita) * (ruolo === 'bambino' ? 1.2 : 1) });
      p.meta = nuovaMeta(p);
    }
  }

  function nuovaMeta(p) {
    const passi = Math.round(tra(ABITANTI.tratto));
    let m = p.i + p.verso * passi;
    if (m <= 0 || m >= p.P.length - 1) { p.verso = -p.verso; m = p.i + p.verso * passi; }
    return Math.max(0, Math.min(p.P.length - 1, m));
  }

  const libero = (p, x, z, cav) => {
    if (cav && Math.hypot(cav.x - x, cav.z - z) < 1.1) return false;
    for (const q of persone) {
      if (q === p || !q.modello.object.visible) continue;
      if (Math.hypot(q.x - x, q.z - z) < ABITANTI.raggio * 2.2) return false;
    }
    return true;
  };

  /**
   * @param {number} dt  s
   * @param {{x:number, z:number}|null} cav  il cavaliere (per fermarsi e per la distanza di disegno)
   * @param {number} buio  0–1
   */
  function update(dt, cav, buio = 0) {
    const notte = buio > ABITANTI.notte;
    for (const p of persone) {
      const o = p.modello.object;
      const vicino = !cav || Math.hypot(cav.x - p.x, cav.z - p.z) < ABITANTI.lontano;
      o.visible = vicino && (!notte || p.notturno);
      if (!o.visible) continue;
      if (!p.fisso) {
        p.stato.modo = 'fermo'; p.stato.velocita = 0;
        if (p.sosta > 0) p.sosta -= dt;
        else {
          const j = p.i + p.verso, Q = p.P[Math.max(0, Math.min(p.P.length - 1, j))], R = p.P[p.i];
          const tx = Q[0] - R[0], tz = Q[1] - R[1], l = Math.hypot(tx, tz) || 1;
          const qx = Q[0] - tz / l * p.lato, qz = Q[1] + tx / l * p.lato;      // un po' fuori mezzeria
          const dx = qx - p.x, dz = qz - p.z, d = Math.hypot(dx, dz);
          const passo = Math.min(d, p.v * dt);
          const nx = p.x + dx / (d || 1) * passo, nz = p.z + dz / (d || 1) * passo;
          if (libero(p, nx + dx / (d || 1) * 0.4, nz + dz / (d || 1) * 0.4, cav)) {
            p.x = nx; p.z = nz;
            p.stato.modo = 'cammina'; p.stato.velocita = p.v;
            const voluto = Math.atan2(dx, dz);
            let dd = voluto - p.dir; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
            p.dir += dd * Math.min(1, dt * 6);
          }
          if (d < 0.3) {
            p.i = j;
            if (p.i === p.meta || p.i <= 0 || p.i >= p.P.length - 1) { p.sosta = tra(ABITANTI.sosta); p.meta = nuovaMeta(p); }
          }
        }
        o.position.set(p.x, quota(p.x, p.z), p.z);
        o.rotation.y = p.dir;
      } else if (cav && Math.hypot(cav.x - p.x, cav.z - p.z) < 6) {       // chi sta fermo si volta verso chi arriva
        const voluto = Math.atan2(cav.x - p.x, cav.z - p.z);
        let dd = voluto - p.dir; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        p.dir += dd * Math.min(1, dt * 2);
        o.rotation.y = p.dir;
      }
      p.modello.update(dt, p.stato);
    }
  }

  /** Ostacolo per il cavaliere (stessa interfaccia di rocche e ponti). */
  function spingiFuori(x, z, raggio) {
    let mosso = false;
    for (const p of persone) {
      if (!p.modello.object.visible) continue;
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), min = raggio + ABITANTI.raggio;
      if (d >= min) continue;
      const k = d > 1e-6 ? min / d : 0;
      x = d > 1e-6 ? p.x + dx * k : p.x + min; z = d > 1e-6 ? p.z + dz * k : z;
      mosso = true;
    }
    return mosso ? { x, z } : null;
  }

  /** La persona più vicina davanti al cavaliere, per «E: parla» (o null). */
  function personaVicina(x, z, direzione) {
    const fx = Math.sin(direzione), fz = Math.cos(direzione);
    let migliore = ABITANTI.parla.distanza, trovata = null;
    for (const p of persone) {
      if (!p.modello.object.visible) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d > migliore || d < 1e-6) continue;
      if ((dx * fx + dz * fz) / d < ABITANTI.parla.rivolto) continue;
      migliore = d; trovata = p;
    }
    return trovata;
  }

  /** Riga da mostrare parlando con p. */
  const riga = (p) => RIGHE_PERSONE[p.ruolo] ?? '…';

  /** Trasla tutti (posizioni e percorsi) di (dx, dz): al cambio di blocco (M6, passo 9). */
  function sposta(dx, dz) {
    const percorsi = new Set();
    for (const p of persone) {
      p.x += dx; p.z += dz;
      if (p.P) percorsi.add(p.P);
      p.modello.object.position.x += dx; p.modello.object.position.z += dz;
    }
    for (const P of percorsi) for (const q of P) { q[0] += dx; q[1] += dz; }
  }

  return { object, persone, update, spingiFuori, personaVicina, riga, sposta };
}
