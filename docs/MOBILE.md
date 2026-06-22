# MOBILE — Versione mobile / responsive

Knight Dawn gira su **un unico codebase responsive**: niente fork mobile. La
stessa logica si dispone diversamente sopra/sotto un breakpoint di larghezza.
Lo stack (vanilla JS, canvas, grafica procedurale, zero asset, zero dipendenze)
è di per sé favorevole al mobile; le difficoltà erano solo layout, input e
scaling — affrontate qui.

## Principi

- **Più testo, meno grafica larga su schermi piccoli.** Le viste basate su
  testo (stato cavaliere, contesto, diario, "carta del cronista") sono naturali
  da portare in portrait: diventano schede/sheet a tutta larghezza invece di
  colonne affiancate. La mappa resta grafica ma con meno spazio attorno.
- **Un solo percorso di input** per mouse e touch (Pointer Events).
- **Nitidezza prima di tutto:** rendering HiDPI così testo e tile restano netti.

## Rendering HiDPI (`main.js`)

- Backing store del canvas in pixel **fisici** (`× devicePixelRatio`, cap a 2.5
  per le performance); CSS in pixel **logici**.
- Il contesto viene scalato di `dpr` una volta sola (`setTransform`), quindi
  **tutto il codice di disegno lavora in pixel logici (CSS px)** — i numeri nei
  layout restano leggibili e indipendenti dalla densità.
- Testo via `fillText` → reso alla risoluzione fisica → nitido su retina/mobile.
  Texture pergamena/tile → upscale nearest-neighbor (`imageSmoothingEnabled =
  false`) → restano "chunky" e crispe.

## Scaling tipografico (`UI.scale`, letto da `S()`/`SF()`)

- **Desktop (landscape ampio):** legato all'altezza (`h / DESIGN_H`, 900) — come
  da design originale.
- **Compatto in portrait:** legato alla larghezza (`w / DESIGN_W_PORTRAIT`, 440),
  altrimenti i font sfondano lo schermo stretto.
- **Compatto in landscape** (telefono coricato): altezza ridotta di riferimento.
- Clamp finale `[0.6, 1.6]`.

## Breakpoint e layout (`UI.compact`)

`COMPACT_BREAKPOINT = 820` (CSS px). Sotto questa larghezza → **layout compatto**.

- **Desktop:** 3 colonne — `stato | mappa+diario | contesto` + minimappa
  (sempre visibili).
- **Compatto (mobile):** `barra alta compatta → mappa grande → footer`.
  Il footer ha due righe di mini-pulsanti:
  - **navigazione aree** (Stato / Contesto / Diario / Regione): ognuno apre il
    relativo pannello come **overlay a tutto schermo** sopra la mappa (velo
    scuro + carta-pergamena + pulsante chiudi `X`; ri-tap sullo stesso pulsante
    o tap fuori dalla carta = chiudi). Così l'area centrale resta dedicata alla
    mappa e le info sono on-demand.
  - **azioni di gioco** (Inventario / Mappa / Accampa / Interagisci).

`UI` espone: `scale, w, h, dpr, isPortrait, compact` (dimensioni **logiche**).

## Zoom mappa

- **Desktop:** rotella del mouse (`wheel`) quando il puntatore è sopra l'area
  mappa; `preventDefault` per non scrollare la pagina. Pan con drag del mouse.
- **Mobile (compatto):** pulsanti `+` / `−` nell'angolo della mappa. Pan con
  drag del dito.
- Lo zoom è **discreto a passi ravvicinati** (`MAP_ZOOM_STEPS` in `config.js`,
  px/tile), **non** i 4 livelli semantici regione/zona/locale, e **non**
  continuo. È **centrato sul centro camera**, che l'utente sposta liberamente
  col pan: lo zoom mantiene fisso quel punto. Camera e disegno stanno in
  `renderer.js` (`MapRenderer`), lo stato `cam = {cx, cy, step}` nella scena.

## Input unificato (Pointer Events)

- `main.js` registra `pointermove/down/up/cancel` sul canvas e li smista alle
  scene via `Scenes.onPointer*`. Le scene implementano
  `onPointerMove(p, type)`, `onPointerDown(p, type)`, `onPointerUp(p, type)`,
  `onPointerCancel()`; `p` è in coordinate logiche, `type ∈ {mouse, pen, touch}`.
- **Niente hover su touch:** l'evidenziazione parte al `pointerdown` e si pulisce
  al `pointerup`; l'azione scatta solo se il rilascio è sullo stesso bersaglio
  della pressione (come un click). Su mouse, l'hover funziona come prima.
- `touch-action: none` (CSS) + `preventDefault` sui pointer touch evitano
  scroll/zoom/gesture di sistema sopra il canvas.

## Viewport / chrome mobile (`index.html`, `style.css`)

- `viewport`: `user-scalable=no, maximum-scale=1, viewport-fit=cover` — niente
  pinch-zoom involontario, supporto notch/safe-area.
- `theme-color` e meta web-app per un look integrato se aggiunto alla home.
- `-webkit-tap-highlight-color: transparent`, `user-select: none`.

## Da fare in seguito

- Dimensioni minime dei target touch (≥ ~44px) verificate su footer e overlay.
- Mappa: pan (drag) e pinch-zoom con gesture quando la mappa sarà navigabile
  (lo zoom attuale è il primo mattone).
- "Carta del cronista" e carte-evento in layout portrait dedicato (riuso del
  sistema overlay).
- Test reali su iOS Safari e Android Chrome (barra URL che cambia altezza →
  valutare `100dvh` / gestione `resize`).
