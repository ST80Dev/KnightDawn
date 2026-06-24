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
    // Cavaliere giocatore: armatura in piastre, cimiero rosso (16x24).
    cavaliere: [
      '......orro......',
      '......orro......',
      '......orro......',
      '.....ooddoo.....',
      '.....odmmdo.....',
      '....odmmmmdo....',
      '...odmllllmdo...',
      '...odmllllmdo...',
      '...odmaaaamdo...',
      '...odmddddmdo...',
      '...odmmmmmmdo...',
      '..odmmmmmmmmdo..',
      '.odmaammmaammdo.',
      '.odmmmmllmmmmdo.',
      '.odmmmmmmmmmmdo.',
      '.odmmaaaaaammdo.',
      '..oddmmmmmmddo..',
      '..odmmmddmmmdo..',
      '..odmmo..odmmo..',
      '..odmmo..odmmo..',
      '..odmmo..odmmo..',
      '..odmmo..odmmo..',
      '..oddo....oddo..',
      '..aoo......ooa..',
    ],
    // Umano (bandito/viandante): figura slanciata, vestita, a colori (16x24).
    umano: [
      '......hhhh......',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '...hssssssssh...',
      '...hssossossh...',
      '...hssssssssh...',
      '....kssssssk....',
      '......ssss......',
      '....dmmmmmmd....',
      '...dmmmmmmmmd...',
      '..dmmmmmmmmmmd..',
      '.sdmmmllmmmmmds.',
      '.sdmmmmmmmmmmds.',
      '..dmmmmmmmmmmd..',
      '..bbbbbbbbbbbb..',
      '..dppppppppppd..',
      '..dppp....pppd..',
      '..dppp....pppd..',
      '..dppp....pppd..',
      '..dppp....pppd..',
      '..dppp....pppd..',
      '..tttt....tttt..',
      '..tttt....tttt..',
      '..oot......too..',
    ],
    // Lupo: quadrupede di PROFILO, testa a destra (muso, orecchio, occhio),
    // coda a sinistra, quattro zampe (24x14).
    lupo: [
      '........................',
      '....................oo..',
      '....ooo...........odddo.',
      '...odddo.........odmmmno',
      '..odmmmdoooooooooodmmmedo',
      '.odmmmmmmmmmmmmmmmmmmmwwo',
      '.odmmmmmmmmmmmmmmmmmmmmmo',
      '.odllmmmmmmmmmmmmmmmmllmo',
      '.oddmmmmmmmmmmmmmmmmmmddo',
      '..odo...odo....odo..odo..',
      '..odo...odo....odo..odo..',
      '..ono...ono....ono..ono..',
      '........................',
      '........................',
    ],
    // Orso: quadrupede di PROFILO, gobba sul dorso, testa a destra (24x14).
    orso: [
      '........................',
      '..................oo....',
      '...oooo..........odddo..',
      '..odddmoooooooooodmmmno.',
      '.odmmmmmmmmmmmmmmmmmeedo.',
      '.odmmmmmmmmmmmmmmmmmmwwo',
      'odmmmmmmmmmmmmmmmmmmmmmo',
      'odmllmmmmmmmmmmmmmmmllmo',
      'odmmmmmmmmmmmmmmmmmmmmdo',
      '.oddmmmmmmmmmmmmmmmmddo.',
      '..odo...odo....odo.odo..',
      '..odo...odo....odo.odo..',
      '..owo...owo....owo.owo..',
      '........................',
    ],
    // Ragno: corpo tondo, otto zampe radiali, occhi rossi (20x13).
    ragno: [
      '..o....o..o....o....',
      '...oo..o..o..oo......',
      '....oo.oo.oo.oo......',
      '......odmmmmdo.......',
      '.....odmeemeedo......',
      '....odmmmmmmmmdo.....',
      '....odmmmmmmmmdo.....',
      '.....odmmmmmmdo......',
      '......odmmmmdo.......',
      '....oo.oo.oo.oo......',
      '...oo..o..o..oo......',
      '..o....o..o....o....',
      '....................',
    ],
    // Gigante (troll): mole massiccia, spalle enormi (18x24).
    gigante: [
      '......oddddo......',
      '.....odmmmmmdo....',
      '....odmlllllmdo...',
      '....odmeemmeemdo..',
      '....odmmmwwmmmdo..',
      '....oodmmmmmmddo..',
      '...odmmmmmmmmmmdo.',
      '..odmmmmmmmmmmmmdo',
      '.odmmmmmmmmmmmmmmdo'.slice(0,18),
      'odmmmmllmmmmmmmmmdo',
      'odmmmmmmmmmmmmmmmdo',
      'odmmmmmmmmmmmmmmmdo',
      '.odmmmmmmmmmmmmmdo.',
      '..oddmmmmmmmmmddo..',
      '..odmmmmmmmmmmmdo..',
      '..odmmmmddmmmmmdo..',
      '..odmmmo..odmmmdo..',
      '..odmmo....odmmdo..',
      '..odmmo....odmmo...',
      '..odmmo....odmmo...',
      '..oddo......oddo...',
      '..ono........ono...',
      '..oo..........oo...',
      '..................',
    ],
    // Mutaforma (licantropo): bipede bestiale, orecchie, fauci, artigli (16x21).
    mutaforma: [
      '...oo......oo...',
      '..odmo....odmo..',
      '..odmmo..odmmo..',
      '..odmemoomedo...',
      '..odmmmoommmdo..',
      '...odmwwwwwmdo..',
      '...oodmmmmmddo..',
      '..odmmmmmmmmmmdo',
      '.odmmmmllmmmmmdo',
      'wddmmmmmmmmmmddw',
      'wodmmmmmmmmmmdow',
      '..odmmmmmmmmmdo.',
      '..odmmmllmmmmdo.',
      '..odmmmmmmmmmdo.',
      '..oddmmmmmmmddo.',
      '..odmmo..odmmo..',
      '..odmo....odmo..',
      '..odmo....odmo..',
      '..owwo....owwo..',
      '..ww........ww..',
    ],
    // Non-morto singolo (scheletro): teschio e costato, osso chiaro (16x21).
    nonmorto: [
      '.....owwwwo.....',
      '....owwwwwwo....',
      '....owemmewo....',
      '....owwmmwwo....',
      '....oowwwwoo....',
      '.....owwwwo.....',
      '......owwo......',
      '...owwwwwwwwo...',
      '..owwwwwwwwwwo..',
      '..ow.ww..ww.wo..',
      '..ow.ww..ww.wo..',
      '..ow.ww..ww.wo..',
      '..oowwwwwwwwoo..',
      '...owwwwwwwwo...',
      '...owwo..owwo...',
      '....owo..owo....',
      '....owo..owo....',
      '....owo..owo....',
      '....owo..owo....',
      '...owwo..owwo...',
      '...oowo..owoo...',
    ],
    // Orda di non-morti: quattro figure scheletriche serrate (24x16).
    orda: [
      '.owo...owo...owo...owo..',
      'owwwo.owwwo.owwwo.owwwo.',
      'owewo.owewo.owewo.owewo.',
      'owwwo.owwwo.owwwo.owwwo.',
      '.owo...owo...owo...owo..',
      'owwwo.owwwo.owwwo.owwwo.',
      'owwwo.owwwo.owwwo.owwwo.',
      'owwwo.owwwo.owwwo.owwwo.',
      '.owo...owo...owo...owo..',
      '.owo...owo...owo...owo..',
      '.owo...owo...owo...owo..',
      '.o.o...o.o...o.o...o.o..',
      '........................',
      '........................',
      '........................',
      '........................',
    ],
    // Drago/Wyrm: di PROFILO, ali spiegate, collo e testa a destra,
    // coda a sinistra (24x16).
    drago: [
      '........................',
      '...........oo...........',
      '..........odwo..........',
      '.........odwwwo.........',
      '........odwwwwwo........',
      '..ooo...odwwwwwwo...ooo..',
      '.oddmoooommmmmmmoooodmno.'.slice(0,24),
      'odmmmmmmmmmmmmmmmmmmdmeno',
      'odmmmmmmmmmmmmmmmmmmmmwwo',
      '.ooummmmmmmmmmmmmmodmmmo.'.slice(0,24),
      '....odmmmmmmmmmmdo.oooo..',
      '.....odllmmmmllmdo.......',
      '......odo..odo..odo......',
      '......odo..odo..odo......',
      '......ono..ono..ono......',
      '........................',
    ],
    // Chimera/Bestia di leggenda: felino cornuto di PROFILO, criniera,
    // coda (24x14).
    chimera: [
      '........................',
      '...................oa.oa',
      '..................oaooao.'.slice(0,24),
      '.................odmmmmdo',
      '....ooo.........oamllllme'.slice(0,24),
      '...oddmoooooooooommmmmmno',
      '..odmmmmmmmmmmmmmmmmmmwwo',
      '..odmmmmmmmmmmmmmmmmmmmmo',
      '..odllmmmmmmmmmmmmmmllmdo',
      '..oddmmmmmmmmmmmmmmmmddo.',
      '...odo...odo....odo.odo..',
      '...odo...odo....odo.odo..',
      '...ono...ono....ono.ono..',
      '........................',
    ],
    // Orchi/Goblin: bruto verde, zanne, occhi rossi (16x24).
    orchi: [
      '....oggggggo....',
      '...oggggggggo...',
      '..oggllllllggo..',
      '..oggeggggeggo..',
      '..ogggggggggdo..',
      '..oggwggggwggo..',
      '..oodgggggddoo..',
      '...oggggggggo...',
      '..oggggggggggo..',
      '.oggggggggggggo.',
      '.ogggllgggggggo.',
      '.ogggggggggggdo.',
      '.oggggggggggggo.',
      '..oggggggggggo..',
      '..bbbbbbbbbbbb..',
      '..oggggggggggo..',
      '..oggg....gggo..',
      '..oggg....gggo..',
      '..oggg....gggo..',
      '..oggg....gggo..',
      '..oggg....gggo..',
      '..oddo....oddo..',
      '..ono......ono..',
      '..oo........oo..',
    ],
    // Cavaliere nero (wraith): figura ammantata, elmo cornuto, occhi rossi (16x24).
    wraith: [
      '...o......o.....',
      '..oao....oao....',
      '..odmo..odmo....',
      '..odmmoodmmdo...',
      '...oddmmmmddo...',
      '...odmeemmedo...',
      '...odmmmmmmdo...',
      '..odmmmmmmmmdo..',
      '.odmmmmmmmmmmdo.',
      'odmmmmmmmmmmmmdo',
      'odmllmmmmmmmmmdo',
      'odmmmmmmmmmmmmdo',
      'odmmmmmmmmmmmmdo',
      '.odmmmmmmmmmmdo.',
      '.odmmmmmmmmmmdo.',
      '..odmmmmmmmmdo..',
      '..odmmmmmmmmdo..',
      '..oddmmmmmmddo..',
      '..odmmo..ommdo..',
      '..odmo....omdo..',
      '..odo......odo..',
      '..odo......odo..',
      '..oo........oo..',
    ],
    // Spettro del gelo: umanoide pallido, occhi azzurri, lancia (16x24).
    spettrogelo: [
      '....obbbo.....ll',
      '...obbbbbo....ll',
      '...obeebeeo...ol',
      '...obbbbbbo...ol',
      '...oobbbboo...ol',
      '....obbbbo....ol',
      '...obbbbbbo...ol',
      '..obbbbbbbbo..ol',
      '.obbbbbbbbbbo.od',
      '.obbllbbbbbbo..d',
      '.obbbbbbbbbbo..d',
      '.obbbbbbbbbbo..d',
      '..obbbbbbbbo...d',
      '..obbbbbbbbo...d',
      '..obbbbbbbbo...d',
      '..obbb..bbbo....',
      '..obbb..bbbo....',
      '..obbb..bbbo....',
      '..obbb..bbbo....',
      '..oddo..oddo....',
    ],
    // Massa (battaglia/assedio): stendardi e lance su una schiera (22x16).
    battaglia: [
      'rr...o........o...rr..',
      'rrr..o.o....o.o..rrr..',
      '.rr..o.o....o.o..rr...',
      '.....oao....oao.......',
      '.....oao....oao.......',
      '......o......o........',
      '......o......o........',
      '...ooo.oo..oo.ooo.....',
      '..ommo.oo..oo.ommo....',
      '.ommmoommooommmommo...'.slice(0,22),
      'ommmmmmmmmmmmmmmmmmo..',
      'ommmmmmmmmmmmmmmmmmo..',
      'ooooooooooooooooooo..',
      '.....................',
      '.....................',
      '.....................',
    ],
  },

  // ─── Palette per chiave (carattere → colore) ──────────────────────────────
  palettes: {
    cavaliere:  { o:'#191710', d:'#45413a', m:'#7c7668', l:'#b6b0a0', a:'#caa030', r:'#9a1c1c' },
    umano:      { h:'#4a2e16', s:'#d2a474', k:'#a8794e', o:'#241a0e', d:'#3a2c1c',
                  m:'#6e5436', l:'#8e7048', b:'#5a3a1a', p:'#46506a', t:'#2a1d10' },
    lupo:       { o:'#16120c', d:'#34302a', m:'#5e564a', l:'#8a8272', e:'#d8b030', w:'#e8e0d0', n:'#201a14' },
    orso:       { o:'#1a120a', d:'#3a2616', m:'#5e4026', l:'#866036', e:'#d8a830', w:'#e0d4c0', a:'#cfc8ba', n:'#1a120a' },
    ragno:      { o:'#120a14', d:'#2e1e36', m:'#4a3454', l:'#6a5074', e:'#cc2424' },
    gigante:    { o:'#16180f', d:'#3a4226', m:'#5e6a3e', l:'#8a9a5c', e:'#d8c030', d2:'#000' },
    mutaforma:  { o:'#14100c', d:'#332a22', m:'#574a3c', l:'#7e6e58', e:'#d83018', w:'#e0d8c8', a:'#cfc8ba' },
    nonmorto:   { o:'#181818', w:'#d8d4c4', m:'#9a968a', e:'#cc2424' },
    orda:       { o:'#181818', w:'#cfc8b8', m:'#8a8478', e:'#cc2424' },
    drago:      { o:'#1a0c0a', d:'#5a1c14', m:'#8a2a1a', l:'#b04a26', e:'#e0b020', w:'#6a201a', n:'#e8dcc0' },
    chimera:    { o:'#1a1208', d:'#6a4a1a', m:'#9a7028', l:'#c69a40', e:'#e03018', a:'#caa030', n:'#1a1208', w:'#e8dcc0' },
    orchi:      { o:'#12160c', d:'#2e3a1c', g:'#5a6a2e', l:'#84984a', e:'#cc2424', w:'#e0d8c0', a:'#7a6a50', b:'#4a3420', n:'#1a2210' },
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

  // Larghezza in celle di una figura (massimo tra le righe: il renderer
  // tollera righe di lunghezza diversa, le celle mancanti sono trasparenti).
  _cols(bmp) {
    let w = 0;
    for (const row of bmp) if (row.length > w) w = row.length;
    return w;
  },

  // ─── Disegno ──────────────────────────────────────────────────────────────
  draw(ctx, key, x, y, cell, opts) {
    opts = opts || {};
    const bmp = this.bitmaps[key];
    const pal = this.palettes[key];
    if (!bmp || !pal) return;
    const cols = this._cols(bmp);
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
    return { w: this._cols(bmp) * cell, h: bmp.length * cell };
  },

  drawInBox(ctx, key, box, opts) {
    opts = opts || {};
    const bmp = this.bitmaps[key];
    if (!bmp) return null;
    const margin = opts.margin != null ? opts.margin : 0;
    const availW = box.w - margin * 2, availH = box.h - margin * 2;
    const cols = this._cols(bmp), rows = bmp.length;
    const cell = Math.max(1, Math.floor(Math.min(availW / cols, availH / rows)));
    const w = cols * cell, h = rows * cell;
    const x = Math.round(box.x + (box.w - w) / 2);
    const y = Math.round(box.y + (box.h - h) / 2);
    this.draw(ctx, key, x, y, cell, opts);
    return { x, y, w, h, cell };
  },
};
