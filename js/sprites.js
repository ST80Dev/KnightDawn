// FERRO & CENERE — Silhouette pixel-art (procedurali)
// Figure pixel ombreggiate per cavaliere e nemici, usate nella scena di
// combattimento (e riutilizzabili altrove). Ogni figura è una BITMAP (array
// di stringhe) + una PALETTE (mappa carattere → colore esadecimale): così
// ogni figura usa più tonalità (contorno, ombra, corpo, luce, accenti), non
// un solo colore. '.' o ' ' = trasparente; ogni altro carattere prende il
// colore dalla palette della figura (caratteri non in palette = ignorati).
//
// Convenzione caratteri (non obbligatoria, aiuta a leggere le bitmap):
//   o contorno · d ombra · m corpo · l luce · a accento metallo/oro
//   r rosso (sangue/cresta) · e occhio/bagliore · w osso/bianco
//   g pelle verde · b ghiaccio/azzurro · p viola/magia
// Nessuna dipendenza esterna: serve solo un context 2D. Stile docs/GRAFICA.md.

const Sprites = {
  // ─── Bitmap per chiave ───────────────────────────────────────────────────
  bitmaps: {
    // Cavaliere giocatore: armatura in piastre, cimiero rosso, ombreggiata.
    cavaliere: [
      '.......rr.......',
      '......orro......',
      '......ormo......',
      '.....odmmdo.....',
      '....odmllmdo....',
      '...odmllllmdo...',
      '...odmaaaamdo...',
      '...odmddddmdo...',
      '...odmmmmmmdo...',
      '..odmmmmmmmmdo..',
      '..odmaammaamdo..',
      '..odmmllmmmmdo..',
      '..odmmmmmmmmdo..',
      '..odmaaaaaamdo..',
      '..oodmmmmmmdoo..',
      '...odmmddmmdo...',
      '...odmo..odmo...',
      '...odmo..odmo...',
      '...oddo..oddo...',
    ],
    // Umano (bandito/viandante): figura slanciata, vestita, a colori
    // (pelle, capelli, tunica, cintura, calzoni, stivali).
    umano: [
      '....hhhhhh....',
      '...hhhhhhhh...',
      '..hhsssssshh..',
      '..hssossossh..',
      '..hssssssssh..',
      '...hssssssh...',
      '....kssssk....',
      '...dmmmmmmd...',
      '..dmmmmmmmmd..',
      '.sdmmllmmmmds.',
      '.sdmmmmmmmmds.',
      '..dmmmmmmmmd..',
      '..bbbbbbbbbb..',
      '..dppppppppd..',
      '..dppp..pppd..',
      '..dppp..pppd..',
      '..dppp..pppd..',
      '..dppp..pppd..',
      '..dtt....ttd..',
      '..ddt....tdd..',
    ],
    // Lupo: quadrupede di profilo, testa a destra, occhio ambra.
    // Quadrupede di PROFILO, testa a destra (muso, orecchio, occhio),
    // coda a sinistra, quattro zampe.
    lupo: [
      '....................',
      '.............oo.....',
      '...ooo......odddo...',
      '..odmmmoooooodmmmno.',
      '.odmmmmmmmmmmmmmmedo',
      '.odmmmmmmmmmmmmmmmwo',
      '.odllmmmmmmmmmmllmdo',
      '.oddmmmmmmmmmmmmmddo',
      '..odo.odo...odo.odo.',
      '..odo.odo...odo.odo.',
      '..ono.ono...ono.ono.',
      '....................',
    ],
    // Orso: mole eretta, piccole orecchie, artigli chiari.
    orso: [
      '...oo......oo...',
      '..odmo....odmo..',
      '..odmmoooodmmo..',
      '.odmmmmmmmmmmmo.',
      '.odmleemmmeelmo.',
      '.odmmmmwwmmmmmo.',
      'odmmmmmmmmmmmmmo',
      'odmmmmmmmmmmmmmo',
      'odmmmmllmmmmmmmo',
      'odmmmmmmmmmmmmmo',
      '.odmmmmmmmmmmdo.',
      '.oddmmmmmmmmddo.',
      '.aoodmmmmmmdooa.',
      '.aa.oddo.oddo.aa',
    ],
    // Ragno: corpo tondo bilobato, otto zampe, occhi rossi.
    ragno: [
      'o..o........o..o',
      '.oo.oo....oo.oo.',
      '..oo.oo..oo.oo..',
      '....odmmmmdo....',
      '...odmeemeedmo..',
      '...odmmmmmmmdo..',
      '....odmmmmdo....',
      '..oo.oo..oo.oo..',
      '.oo.oo....oo.oo.',
      'o..o........o..o',
    ],
    // Gigante (troll): spalle enormi, mole massiccia.
    gigante: [
      '....oddddo......',
      '...odmmmmmdo....',
      '...odmlllmmdo...',
      '...odmeemmmdo...',
      '...oodmmmmddo...',
      '.oodmmmmmmmmdo..',
      'odmmmmmmmmmmmmdo',
      'odmmmmmmmmmmmmdo',
      'odmmmllmmmmmmmdo',
      '.oddmmmmmmmmddo.',
      '..odmmmmmmmmdo..',
      '..odmmmddmmmdo..',
      '..odmmo..odmmdo.',
      '..oddo....oddo..',
    ],
    // Mutaforma (licantropo): bipede bestiale, orecchie e fauci.
    mutaforma: [
      '...oo......oo...',
      '..odmo....odmo..',
      '..odmmo..odmmo..',
      '..odmeemoodmeedo',
      '...odmmwwwwmmdo.',
      '...oodmmmmmmddo.',
      '..odmmmmmmmmmmdo',
      '.odmmmmllmmmmmdo',
      'aoddmmmmmmmmddoa',
      '.a.odmmmmmmdo.a.',
      '...odmmmmmmdo...',
      '...odmmddmmdo...',
      '...odmo..odmo...',
      '..aodo....odoa..',
      '..aa........aa..',
    ],
    // Non-morto singolo (scheletro): teschio e costato, osso chiaro.
    nonmorto: [
      '......owwwo......',
      '.....owwwwwo.....',
      '.....owemmewo....',
      '.....owwwwwwo....',
      '......oowwoo.....',
      '.......owwo......',
      '.....owwwwwwo....',
      '....owwowwowwo...',
      '....owwowwowwo...',
      '....oowwwwwwoo...',
      '.....owwoowwo....',
      '.....owo..owo....',
      '....owwo..owwo...',
      '....oowo..owoo...',
    ],
    // Orda di non-morti: tre figure scheletriche serrate.
    orda: [
      '.owo..owo..owo..',
      '.owwo.owwo.owwo.',
      '.oweo.oweo.oweo.',
      '.owwo.owwo.owwo.',
      '.owwo.owwo.owwo.',
      '.owwo.owwo.owwo.',
      '.owwo.owwo.owwo.',
      '.owo..owo..owo..',
      '.owo..owo..owo..',
      '.oo...oo...oo...',
    ],
    // Drago/Wyrm: ali spiegate, collo e testa a sinistra, coda a destra.
    drago: [
      '..o..........o..',
      '.odo........odo.',
      '.odmo......odmo.',
      'odmmmo....odmmmo',
      'odmllmoooomllmmo',
      'oemmmmmmmmmmmmdo',
      '.oommmmmmmmmmmdo',
      '...odmmmmmmmddoo',
      '....oodmmmddo.o.',
      '......oddoodddo.',
      '........o...oddo',
    ],
    // Chimera/Bestia di leggenda: felino cornuto, criniera, coda.
    chimera: [
      '..o........o....',
      '.oao......oao...',
      '.oao.oooo.oao...',
      '.odmoddddomdo...',
      'oemmmllllmmmeo..',
      'odmmmmmmmmmmmdo.',
      'odmmmmmmmmmmmmdo',
      'odmmmllmmmmmmmdo',
      '.oddmmmmmmmmmddo',
      '..odmo.odmo.oddo',
      '..oddo.oddo..ooo',
    ],
    // Orchi/Goblin: bruto tozzo, zanne, occhi rossi, scure di ferro.
    orchi: [
      '....oddddo.....a',
      '...odmggggmdo..a',
      '...odgggggdo..aa',
      '..odgeggegdo.odd',
      '..odgwggwggdoodm',
      '..oodgggggddoodm',
      '.odggggggggdoodd',
      'odgggllgggggdooo',
      'odggggggggggdo..',
      '.oddggggggddo...',
      '..odggggggdo....',
      '..odggddggdo....',
      '..odgo..odgo....',
      '..oddo..oddo....',
    ],
    // Cavaliere nero (wraith): figura ammantata, elmo cornuto, spada.
    wraith: [
      '...o......o....a',
      '..oao....oao...a',
      '..odmo..odmo..aa',
      '..odmeoodmedo.da',
      '...oddmmmmddo.da',
      '..odmmmmmmmmdoda',
      '.odmmmmmmmmmmdda',
      '.odmllmmmmmmmdo.',
      'oddmmmmmmmmmmddo',
      '.odmmmmmmmmmmdo.',
      '..odmmmmmmmmdo..',
      '..odmmmddmmdo...',
      '..odmo..odmo....',
      '..oddo..oddo....',
    ],
    // Spettro del gelo: umanoide pallido, occhi azzurri, lancia di ghiaccio.
    spettrogelo: [
      '.....obbbo.....b',
      '....obbbbbo....b',
      '....obeebeo....b',
      '....obbbbbbo...b',
      '....oobbbboo...b',
      '...obbbbbbbbo..b',
      '..obbbbbbbbbbo.b',
      '..obbllbbbbbo..b',
      '.obbbbbbbbbbbbob',
      '..obbbbbbbbbbo..',
      '...obbbbbbbbo...',
      '...obbo..obbo...',
      '...obbo..obbo...',
      '...oddo..oddo...',
    ],
    // Massa (battaglia/assedio): stendardi incrociati su una schiera.
    battaglia: [
      'r..o......o..r..',
      'rr.o.o..o.o.rr..',
      '.rro.o..o.o.rr..',
      '...oao..oao.....',
      '...oao..oao.....',
      '....o....o......',
      '..ooo.oo.ooo....',
      '.ommo.oo.ommo...',
      'ommmoommooommmo.',
      'ommmmmmmmmmmmmo.',
      'ooooooooooooooo.',
    ],
  },

  // ─── Palette per chiave (carattere → colore) ──────────────────────────────
  palettes: {
    cavaliere:  { o:'#191710', d:'#45413a', m:'#7c7668', l:'#b6b0a0', a:'#caa030', r:'#9a1c1c' },
    umano:      { h:'#4a2e16', s:'#d2a474', k:'#a8794e', o:'#241a0e', d:'#3a2c1c',
                  m:'#6e5436', l:'#8e7048', b:'#5a3a1a', p:'#46506a', t:'#2a1d10' },
    lupo:       { o:'#16120c', d:'#34302a', m:'#5e564a', l:'#8a8272', e:'#d8b030', w:'#e8e0d0', n:'#201a14' },
    orso:       { o:'#1a120a', d:'#3a2616', m:'#5e4026', l:'#866036', e:'#d8a830', w:'#e0d4c0', a:'#cfc8ba' },
    ragno:      { o:'#120a14', d:'#2e1e36', m:'#4a3454', l:'#6a5074', e:'#cc2424' },
    gigante:    { o:'#16180f', d:'#3a4226', m:'#5e6a3e', l:'#8a9a5c', e:'#d8c030', d2:'#000' },
    mutaforma:  { o:'#14100c', d:'#332a22', m:'#574a3c', l:'#7e6e58', e:'#d83018', w:'#e0d8c8', a:'#cfc8ba' },
    nonmorto:   { o:'#181818', w:'#d8d4c4', m:'#9a968a', e:'#cc2424' },
    orda:       { o:'#181818', w:'#cfc8b8', m:'#8a8478', e:'#cc2424' },
    drago:      { o:'#1a0c0a', d:'#5a1c14', m:'#8a2a1a', l:'#b04a26', e:'#e0b020' },
    chimera:    { o:'#1a1208', d:'#6a4a1a', m:'#9a7028', l:'#c69a40', e:'#e03018', a:'#caa030' },
    orchi:      { o:'#12160c', d:'#2e3a1c', g:'#5a6a2e', l:'#84984a', e:'#cc2424', w:'#e0d8c0', a:'#7a6a50' },
    wraith:     { o:'#0a0808', d:'#262024', m:'#463c46', l:'#665a68', e:'#cc2424', a:'#9aa0a8' },
    spettrogelo:{ o:'#10242c', b:'#9ed0e0', l:'#d8f0f8', e:'#3a78c8', d:'#3a2410' },
    battaglia:  { o:'#1a160c', m:'#6a5a40', l:'#9a8a60', a:'#caa030', r:'#8a1010' },
  },

  // Alias di palette per caratteri di comodo (es. 'd2' non usato qui).
  // Mappa categoria nemico → chiave silhouette.
  byCategoria: {
    ladro: 'umano', bandito: 'umano', soldato: 'umano', cavaliere: 'cavaliere',
    lupo: 'lupo', cinghiale: 'lupo', orso: 'orso',
    nonmorto: 'nonmorto', orda: 'orda', gigante: 'gigante', mutaforma: 'mutaforma',
    ragno: 'ragno', bestiamitica: 'chimera',
    drago: 'drago', orchi: 'orchi', wraith: 'wraith', gelo: 'spettrogelo',
    battaglia: 'battaglia',
  },

  // Fallback per tipo se la categoria non è mappata.
  byTipo: { umano: 'umano', bestia: 'lupo', mitico: 'nonmorto' },

  // ─── Resolver ─────────────────────────────────────────────────────────────
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
  draw(ctx, key, x, y, cell, opts) {
    opts = opts || {};
    const bmp = this.bitmaps[key];
    const pal = this.palettes[key];
    if (!bmp || !pal) return;
    const cols = bmp[0].length;
    for (let r = 0; r < bmp.length; r++) {
      const row = bmp[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const color = pal[ch];
        if (!color) continue;
        const cc = opts.flip ? (cols - 1 - c) : c;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + cc * cell), Math.round(y + r * cell), cell, cell);
      }
    }
  },

  size(key, cell) {
    const bmp = this.bitmaps[key];
    if (!bmp) return { w: 0, h: 0 };
    return { w: bmp[0].length * cell, h: bmp.length * cell };
  },

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
