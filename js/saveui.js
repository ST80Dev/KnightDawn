// FERRO & CENERE — overlay gestione slot di salvataggio
// Stato disaccoppiato dalle scene; mostra slot 0 (autosave, sola lettura)
// e slot 1-5 (manuali). Riusabile sia da titolo (mode='title') sia da
// in-game (mode='game').
//
// API:
//   SaveUI.open(mode, opts?)  — mode: 'title' | 'game'
//   SaveUI.close()
//   SaveUI.isOpen()
//   SaveUI.onPointerMove(p, type)
//   SaveUI.onPointerDown(p)
//   SaveUI.onPointerUp(p, type)
//   SaveUI.draw(ctx)
//
// Quando il giocatore carica con successo, esegue opts.onLoaded(blob).
// Quando il giocatore chiude, esegue opts.onClose().

const SaveUI = {
  _open: false,
  _mode: 'game',         // 'title' | 'game'
  _opts: null,
  _slots: {},            // map slot → metadata | null (sync display)
  _loading: true,
  _busy: false,
  _busyMsg: '',
  _toast: null,          // { text, until }
  _hover: null,          // { slot, action } | 'close'
  _pressed: null,
  _buttons: [],          // hit-test rebuilt on draw
  _closeBtn: null,
  _cardRect: null,

  isOpen() { return this._open; },
  mode()   { return this._mode; },

  open(mode, opts) {
    this._open = true;
    this._mode = mode || 'game';
    this._opts = opts || {};
    this._loading = true;
    this._busy = false;
    this._busyMsg = '';
    this._toast = null;
    this._hover = null;
    this._pressed = null;
    this._refresh();
  },

  close() {
    this._open = false;
    const cb = this._opts && this._opts.onClose;
    this._opts = null;
    this._hover = null;
    this._pressed = null;
    if (cb) cb();
    window.GameRender && window.GameRender.invalidate();
  },

  async _refresh() {
    this._loading = true;
    window.GameRender && window.GameRender.invalidate();
    try {
      this._slots = await Save.listSlots();
    } catch (e) {
      console.error('SaveUI list fallito:', e);
      this._slots = {};
    }
    this._loading = false;
    window.GameRender && window.GameRender.invalidate();
  },

  _flash(text) {
    this._toast = { text, until: Date.now() + 2400 };
    window.GameRender && window.GameRender.invalidate();
  },

  async _doSave(slot) {
    if (this._busy) return;
    this._busy = true;
    this._busyMsg = 'Salvataggio slot ' + slot + '…';
    window.GameRender && window.GameRender.invalidate();
    const ok = await Save.save(slot);
    this._busy = false;
    this._busyMsg = '';
    this._flash(ok ? ('Slot ' + slot + ' salvato.') : 'Errore di salvataggio.');
    if (ok) this._refresh();
  },

  async _doLoad(slot) {
    if (this._busy) return;
    this._busy = true;
    this._busyMsg = 'Caricamento slot ' + slot + '…';
    window.GameRender && window.GameRender.invalidate();
    const ok = await Save.load(slot);
    this._busy = false;
    this._busyMsg = '';
    if (ok) {
      const cb = this._opts && this._opts.onLoaded;
      this._open = false;
      window.GameRender && window.GameRender.invalidate();
      if (cb) cb();
    } else {
      this._flash('Errore di caricamento.');
    }
  },

  async _doDelete(slot) {
    if (this._busy) return;
    this._busy = true;
    this._busyMsg = 'Cancellazione slot ' + slot + '…';
    window.GameRender && window.GameRender.invalidate();
    const ok = await Save.delete(slot);
    this._busy = false;
    this._busyMsg = '';
    this._flash(ok ? ('Slot ' + slot + ' cancellato.') : 'Errore di cancellazione.');
    if (ok) this._refresh();
  },

  // ─── Input ──────────────────────────────────────────────────────────

  _hit(p) {
    if (this._closeBtn) {
      const c = this._closeBtn;
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        return { type: 'close' };
      }
    }
    for (const b of this._buttons) {
      if (b.disabled) continue;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        return { type: 'btn', action: b.action, slot: b.slot };
      }
    }
    return null;
  },

  onPointerMove(p, type) {
    if (!this._open) return;
    if (type === 'touch') return;
    const h = this._hit(p);
    const key = h ? (h.type === 'close' ? 'close' : (h.action + ':' + h.slot)) : null;
    const prevKey = this._hover
      ? (this._hover.type === 'close' ? 'close' : (this._hover.action + ':' + this._hover.slot))
      : null;
    if (key !== prevKey) {
      this._hover = h;
      document.getElementById('game').style.cursor = h ? 'pointer' : 'default';
      window.GameRender && window.GameRender.invalidate();
    }
  },

  onPointerDown(p) {
    if (!this._open) return;
    this._pressed = this._hit(p);
    window.GameRender && window.GameRender.invalidate();
  },

  onPointerUp(p, type) {
    if (!this._open) return;
    const h = this._hit(p);
    const pressed = this._pressed;
    this._pressed = null;
    if (type === 'touch') this._hover = null;

    if (!h || !pressed) { window.GameRender && window.GameRender.invalidate(); return; }
    if (h.type !== pressed.type) { window.GameRender && window.GameRender.invalidate(); return; }
    if (h.type === 'btn' && (h.action !== pressed.action || h.slot !== pressed.slot)) {
      window.GameRender && window.GameRender.invalidate();
      return;
    }

    if (h.type === 'close') { this.close(); return; }
    if (this._busy) return;

    if (h.action === 'save')   this._doSave(h.slot);
    if (h.action === 'load')   this._doLoad(h.slot);
    if (h.action === 'delete') this._doDelete(h.slot);
  },

  onPointerCancel() {
    if (!this._open) return;
    this._pressed = null;
    this._hover = null;
    window.GameRender && window.GameRender.invalidate();
  },

  // ─── Draw ───────────────────────────────────────────────────────────

  draw(ctx) {
    if (!this._open) return;
    const W = window.UI.w, H = window.UI.h;

    // Velo di fondo
    ctx.fillStyle = 'rgba(10,6,2,0.78)';
    ctx.fillRect(0, 0, W, H);

    // Card centrale
    const compact = window.UI.compact;
    const cardW = Math.min(SF(640), W - SF(24));
    const cardH = Math.min(SF(compact ? 540 : 480), H - SF(24));
    const card = {
      x: Math.floor((W - cardW) / 2),
      y: Math.floor((H - cardH) / 2),
      w: cardW, h: cardH,
    };
    this._cardRect = card;

    // Pannello stile pergamena
    ctx.fillStyle = PALETTE.pergScura;
    ctx.fillRect(card.x, card.y, card.w, card.h);
    drawPixelRectStroke(ctx, card.x, card.y, card.w, card.h, PALETTE.inkScuro);
    drawPixelRectStroke(ctx,
      card.x + PIXEL * 2, card.y + PIXEL * 2,
      card.w - PIXEL * 4, card.h - PIXEL * 4,
      PALETTE.inkMedio);

    // Banda titolo
    const bandH = SF(30);
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.fillRect(card.x + PIXEL * 4, card.y + PIXEL * 4, card.w - PIXEL * 8, bandH);
    ctx.fillStyle = PALETTE.hudTitolo;
    ctx.font = `bold ${SF(16)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const title = this._mode === 'title' ? 'CARICA PARTITA' : 'GESTIONE PARTITA';
    ctx.fillText(title, card.x + PIXEL * 8, card.y + PIXEL * 4 + bandH / 2);

    // Close button (X rossa, allineato banda)
    const cs = SF(22);
    this._closeBtn = {
      x: card.x + card.w - PIXEL * 8 - cs,
      y: card.y + PIXEL * 4 + Math.floor((bandH - cs) / 2),
      w: cs, h: cs,
    };
    const closeHover = this._hover && this._hover.type === 'close';
    ctx.fillStyle = closeHover ? PALETTE.rossoBandCh : PALETTE.rossoBandiera;
    ctx.fillRect(this._closeBtn.x, this._closeBtn.y, this._closeBtn.w, this._closeBtn.h);
    drawPixelRectStroke(ctx, this._closeBtn.x, this._closeBtn.y, this._closeBtn.w, this._closeBtn.h, PALETTE.inkScuro);
    ctx.fillStyle = PALETTE.pergChiara;
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', this._closeBtn.x + cs / 2, this._closeBtn.y + cs / 2 + PIXEL);

    // Area lista slot
    this._buttons = [];
    const listX = card.x + SF(14);
    const listW = card.w - SF(28);
    let y = card.y + bandH + SF(18);

    if (this._loading) {
      ctx.fillStyle = PALETTE.inkLeggero;
      ctx.font = `italic ${SF(14)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('Caricamento slot…', card.x + card.w / 2, card.y + card.h / 2);
    } else {
      const slots = Save.ALL_SLOTS;
      const rowH = SF(compact ? 78 : 64);
      const rowGap = SF(6);
      for (const slot of slots) {
        this._drawSlotRow(ctx, slot, listX, y, listW, rowH);
        y += rowH + rowGap;
      }
    }

    // Busy overlay (sopra la card)
    if (this._busy) {
      ctx.fillStyle = 'rgba(10,6,2,0.55)';
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.fillStyle = PALETTE.hudTitolo;
      ctx.font = `bold ${SF(16)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._busyMsg, card.x + card.w / 2, card.y + card.h / 2);
    }

    // Toast (in basso nella card)
    if (this._toast && this._toast.until > Date.now()) {
      ctx.fillStyle = PALETTE.hudEvento;
      ctx.font = `italic ${SF(13)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._toast.text, card.x + card.w / 2, card.y + card.h - SF(10));
    } else if (this._toast) {
      this._toast = null;
    }
  },

  _drawSlotRow(ctx, slot, x, y, w, h) {
    const meta = this._slots[slot];
    const empty = !meta;
    const isAuto = slot === Save.AUTOSAVE_SLOT;
    const compact = window.UI.compact;

    // Sfondo riga
    ctx.fillStyle = empty ? PALETTE.pergMedia : PALETTE.pergChiara;
    ctx.fillRect(x, y, w, h);
    drawPixelRectStroke(ctx, x, y, w, h, PALETTE.inkMedio);

    // Etichetta slot a sinistra
    ctx.fillStyle = PALETTE.inkScuro;
    ctx.font = `bold ${SF(14)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const tag = isAuto ? 'AUTOSAVE' : 'SLOT ' + slot;
    ctx.fillText(tag, x + SF(10), y + SF(8));

    // Dati o "vuoto"
    ctx.font = `${SF(12)}px "Courier New", monospace`;
    if (empty) {
      ctx.fillStyle = PALETTE.inkLeggero;
      ctx.fillText('— vuoto —', x + SF(10), y + SF(28));
    } else {
      ctx.fillStyle = PALETTE.inkMedio;
      const name = meta.player_name || '(senza nome)';
      const label = meta.label || '';
      const when = this._fmtTime(meta.updated_at);
      ctx.fillText(name + (label ? ' · ' + label : ''), x + SF(10), y + SF(28));
      ctx.fillStyle = PALETTE.inkLeggero;
      ctx.fillText(when, x + SF(10), y + SF(44));
    }

    // Pulsanti azione (a destra in normale, sotto in compatto)
    const actions = [];
    if (this._mode === 'game' && !isAuto) actions.push({ action: 'save', label: 'Salva qui' });
    if (!empty) actions.push({ action: 'load', label: 'Carica' });
    if (!empty && !isAuto) actions.push({ action: 'delete', label: 'Cancella' });

    if (actions.length === 0) return;

    const btnH = SF(compact ? 22 : 24);
    const btnGap = SF(6);
    if (compact) {
      const totalW = w - SF(20);
      const btnW = Math.floor((totalW - btnGap * (actions.length - 1)) / actions.length);
      const by = y + h - btnH - SF(8);
      let bx = x + SF(10);
      for (const a of actions) {
        this._addBtn(ctx, bx, by, btnW, btnH, slot, a);
        bx += btnW + btnGap;
      }
    } else {
      const btnW = SF(86);
      const totalW = btnW * actions.length + btnGap * (actions.length - 1);
      let bx = x + w - totalW - SF(10);
      const by = y + Math.floor((h - btnH) / 2);
      for (const a of actions) {
        this._addBtn(ctx, bx, by, btnW, btnH, slot, a);
        bx += btnW + btnGap;
      }
    }
  },

  _addBtn(ctx, x, y, w, h, slot, a) {
    const isHover = this._hover && this._hover.type === 'btn'
      && this._hover.action === a.action && this._hover.slot === slot;
    const isPressed = this._pressed && this._pressed.type === 'btn'
      && this._pressed.action === a.action && this._pressed.slot === slot;

    const danger = a.action === 'delete';
    let bg;
    if (isPressed)   bg = danger ? PALETTE.rossoBandiera : PALETTE.inkMedio;
    else if (isHover) bg = danger ? PALETTE.rossoBandCh  : PALETTE.pergScura;
    else              bg = danger ? PALETTE.rossoBandiera : PALETTE.pergMedia;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    drawPixelRectStroke(ctx, x, y, w, h, PALETTE.inkScuro);

    ctx.fillStyle = danger ? PALETTE.pergChiara
                   : (isHover ? PALETTE.inkNero : PALETTE.inkScuro);
    ctx.font = `bold ${SF(11)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.label, x + w / 2, y + h / 2 + PIXEL);

    this._buttons.push({ x, y, w, h, slot, action: a.action });
  },

  _fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },
};
