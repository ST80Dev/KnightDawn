// FERRO & CENERE — Silhouette pixel-art (procedurali)
// Figure semplici e evocative per cavaliere e nemici, usate nella scena di
// combattimento (e riutilizzabili altrove). Ogni silhouette è una BITMAP:
// un array di stringhe, un carattere per cella:
//   '.' o ' '  → trasparente
//   '#'        → corpo (colore primario)
//   'o'        → accento (occhi, visiera, dettaglio — colore secondario)
//   ':'        → ombra/bordo (colore terziario, opz.)
// Il renderer disegna ogni cella come un blocco pixel-art. Nessuna dipendenza
// esterna: serve solo un context 2D. Stile coerente con docs/GRAFICA.md.
//
// Le forme sono volutamente NON dettagliate: devono "rendere l'idea"
// (un umanoide, un quadrupede, una mole, uno spettro), non illustrare.

const Sprites = {
  // ─── Bitmap per chiave ───────────────────────────────────────────────────
  // Larghezze uniformi per riga all'interno della stessa figura.
  bitmaps: {
    cavaliere: [
      '...#####...',
      '..#######..',
      '..##ooo##..',
      '..#######..',
      '...#####...',
      '.#########.',
      '##.#####.##',
      '#..#####..#',
      '...#####...',
      '...#####...',
      '..###.###..',
      '..##...##..',
      '.###...###.',
      '.##.....##.',
    ],
    // Umano generico (bandito/predone/soldato): incappucciato, lama al fianco.
    umano: [
      '...####....',
      '..#oooo#...',
      '..######...',
      '...####....',
      '.######.#..',
      '#..###..#..',
      '...####.#..',
      '...####....',
      '..##..##...',
      '..#....#...',
      '.##....##..',
      '.#......#..',
    ],
    // Quadrupede (lupo/cinghiale): testa a destra, muso e orecchio.
    lupo: [
      '...........',
      '.......###.',
      '......#####',
      '.###.####oo',
      '###########',
      '###########',
      '##########.',
      '.#..#..#.#.',
      '.#..#..#.#.',
    ],
    // Mole (orso): grande, eretto, piccole orecchie.
    orso: [
      '..##....##..',
      '.####..####.',
      '..########..',
      '.#oo####oo#.',
      '.##########.',
      '############',
      '############',
      '############',
      '.##########.',
      '.###....###.',
      '.###....###.',
    ],
    // Gigante (troll): spalle larghe, clava a destra.
    gigante: [
      '...####.....',
      '..######....',
      '..#oo##.....',
      '..######....',
      '.########..#',
      '##########.#',
      '##########.#',
      '#########..#',
      '..######....',
      '..######....',
      '..####.####.',
      '..###...###.',
    ],
    // Ragno: corpo tondo, otto zampe radiali.
    ragno: [
      '#...#.#...#',
      '.#..#.#..#.',
      '..#.###.#..',
      '...#ooo#...',
      '..#######..',
      '...#ooo#...',
      '..#.###.#..',
      '.#..#.#..#.',
      '#...#.#...#',
    ],
    // Non-morto (spettro): umanoide lacero, occhiaie vuote.
    nonmorto: [
      '...####....',
      '..#oooo#...',
      '..#o..o#...',
      '..######...',
      '...####....',
      '..######...',
      '.###.###...',
      '..#.#.#....',
      '..#.#.#....',
      '...#.#.....',
      '..#...#....',
      '.#.....#...',
    ],
    // Mutaforma (licantropo): bipede bestiale, orecchie e artigli.
    mutaforma: [
      '..#.....#..',
      '..##...##..',
      '..#oooo#...',
      '..######...',
      '.#######...',
      '#..####..#.',
      '...####....',
      '...####....',
      '..##..##...',
      '..#....#...',
      '.##....##..',
      '.#.....##..',
    ],
    // Drago/Wyrm: ali spiegate, corpo serpentino, testa a sinistra.
    drago: [
      '..#........#..',
      '..##......##..',
      '.###......###.',
      '.####....####.',
      'oo############',
      '.############.',
      '..####..####..',
      '...##....##...',
      '.......####...',
      '........##....',
    ],
    // Orchi/Goblin: umanoide tozzo, occhiaie e zanne (accento).
    orchi: [
      '...####...',
      '..#oooo#..',
      '..#o##o#..',
      '..######..',
      '.########.',
      '##.####.##',
      '#..####..#',
      '..######..',
      '..##..##..',
      '.##....##.',
      '.#......#.',
    ],
    // Cavaliere nero (wraith): figura ammantata in sella a un cavallo scuro.
    wraith: [
      '.....##.......',
      '....####......',
      '....####......',
      '...######.....',
      '..########..oo',
      '.###########o.',
      '.############.',
      '.##########...',
      '..#..#..#.#...',
      '..#..#..#.#...',
    ],
    // Spettro del gelo: umanoide pallido con lancia (alla "non-morto del Nord").
    spettrogelo: [
      '...####...#',
      '..#oooo#..#',
      '..######..#',
      '...####...#',
      '..######..#',
      '.###.###..#',
      '..#.#.#...#',
      '..#.#.#....',
      '...#.#.....',
      '..#...#....',
      '.#.....#...',
    ],
    // Massa (battaglia/assedio): schiera con lance e stendardo.
    battaglia: [
      '#.........#',
      '.#.......#.',
      '#.#.....#.#',
      '#..#...#..#',
      '...#...#...',
      '...#...#...',
      '...#...#...',
      '..#######..',
      '.#########.',
      '###########',
    ],
  },

  // ─── Colori per chiave ────────────────────────────────────────────────────
  // { body, accent, shade } — '#'→body, 'o'→accent, ':'→shade.
  colors: {
    cavaliere: { body: '#6a5a40', accent: '#c8a030', shade: '#3a2010' },
    umano:     { body: '#5a3a18', accent: '#8a5a20', shade: '#1a0e04' },
    lupo:      { body: '#5a5048', accent: '#c8a030', shade: '#2a2420' },
    orso:      { body: '#4a3420', accent: '#c8a030', shade: '#241810' },
    gigante:   { body: '#5a6a4a', accent: '#c8a030', shade: '#2a3422' },
    ragno:     { body: '#3a2a3a', accent: '#aa1818', shade: '#1a0e1a' },
    nonmorto:  { body: '#9eb0b0', accent: '#3a6a9a', shade: '#4a5858' },
    mutaforma: { body: '#4a4038', accent: '#aa1818', shade: '#221c18' },
    drago:       { body: '#7a2a18', accent: '#c8a030', shade: '#3a1408' },
    orchi:       { body: '#4a5a2a', accent: '#aa1818', shade: '#222a14' },
    wraith:      { body: '#2a2420', accent: '#aa1818', shade: '#0a0608' },
    spettrogelo: { body: '#bcd0d8', accent: '#4a80b4', shade: '#6a8a9a' },
    battaglia: { body: '#6a5a40', accent: '#8a1010', shade: '#3a2010' },
  },

  // Mappa categoria nemico → chiave silhouette.
  byCategoria: {
    ladro: 'umano', bandito: 'umano', soldato: 'umano', cavaliere: 'cavaliere',
    lupo: 'lupo', cinghiale: 'lupo', orso: 'orso',
    nonmorto: 'nonmorto', gigante: 'gigante', mutaforma: 'mutaforma',
    ragno: 'ragno', bestiamitica: 'drago',
    drago: 'drago', orchi: 'orchi', wraith: 'wraith', gelo: 'spettrogelo',
    battaglia: 'battaglia',
  },

  // Fallback per tipo se la categoria non è mappata.
  byTipo: { umano: 'umano', bestia: 'lupo', mitico: 'nonmorto' },

  // ─── Resolver ─────────────────────────────────────────────────────────────
  // Sceglie la silhouette per un nemico: enemy.sprite esplicito →
  // per categoria → per tipo → 'umano'.
  keyFor(enemy) {
    if (!enemy) return 'umano';
    if (enemy.sprite && this.bitmaps[enemy.sprite]) return enemy.sprite;
    const byCat = this.byCategoria[enemy.categoria];
    if (byCat && this.bitmaps[byCat]) return byCat;
    const byTipo = this.byTipo[enemy.tipo];
    if (byTipo && this.bitmaps[byTipo]) return byTipo;
    return 'umano';
  },

  // ─── Disegno ──────────────────────────────────────────────────────────────
  // Disegna la silhouette `key` con celle `cell`×`cell` px, angolo (x,y).
  // opts.flip → specchia orizzontalmente (es. nemico rivolto a sinistra).
  draw(ctx, key, x, y, cell, opts) {
    opts = opts || {};
    const bmp = this.bitmaps[key];
    if (!bmp) return;
    const col = this.colors[key] || this.colors.umano;
    const cols = bmp[0].length;
    for (let r = 0; r < bmp.length; r++) {
      const row = bmp[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        let color = null;
        if (ch === '#') color = col.body;
        else if (ch === 'o') color = col.accent;
        else if (ch === ':') color = col.shade;
        if (!color) continue;
        const cc = opts.flip ? (cols - 1 - c) : c;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + cc * cell), Math.round(y + r * cell), cell, cell);
      }
    }
  },

  // Dimensioni in px di una silhouette a una data dimensione cella.
  size(key, cell) {
    const bmp = this.bitmaps[key];
    if (!bmp) return { w: 0, h: 0 };
    return { w: bmp[0].length * cell, h: bmp.length * cell };
  },

  // Disegna centrata dentro un box {x,y,w,h}, scegliendo la cella più grande
  // che ci sta (con margine). Ritorna il rect effettivamente occupato.
  drawInBox(ctx, key, box, opts) {
    opts = opts || {};
    const bmp = this.bitmaps[key];
    if (!bmp) return null;
    const margin = opts.margin != null ? opts.margin : 0;
    const availW = box.w - margin * 2, availH = box.h - margin * 2;
    const cols = bmp[0].length, rows = bmp.length;
    const cell = Math.max(1, Math.floor(Math.min(availW / cols, availH / rows)));
    const w = cols * cell, h = rows * cell;
    const x = Math.round(box.x + (box.w - w) / 2);
    const y = Math.round(box.y + (box.h - h) / 2);
    this.draw(ctx, key, x, y, cell, opts);
    return { x, y, w, h, cell };
  },
};
