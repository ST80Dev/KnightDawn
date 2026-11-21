# Esplorazione 3D — specifiche del prototipo minimo

> Obiettivo: capire se il 3D è sostenibile da sviluppatore singolo **prima** di investirci.
> Il prototipo è riuscito se, a fine M4, camminare sul terreno reale è fluido e piacevole.
> Se ci si impantana su camera, collisioni o prestazioni, si valuta come proseguire.
> La versione 2D resta nella cronologia git (commit `2c869fa`).
>
> **Esito della valutazione (novembre 2026): il prototipo prosegue.** Il gioco diventa **Carta e
> Scene** su un **mondo inventato, generato a ogni partita** (`docs/GDD.md` §2 *Il mondo*).
> Il terreno reale di Tavullia resta come scena di prova. Questo documento copre le Scene 3D,
> il terreno e il generatore del mondo (sezione «Carta e Scene»).

## Il minimo da raggiungere

Un'area reale di **2×2 km attorno a Tavullia**, con rilievo vero, un cavaliere low-poly in terza
persona che ci cammina sopra seguendo il terreno, e un castello low-poly in cui si può entrare dalla porta.

## Stile visivo

- Low-poly, *flat shading*, colori pieni: niente texture fotografiche.
  **Direzione decisa per dopo M4: simil-realistico, non iper-realistico**, per terreno, cavaliere e
  castello, spinto **al massimo con il solo codice**. Dettagli in M4, «Dopo la valutazione».
  Convenzioni di stile, materiali e piano del cavaliere: `docs/GRAFICA_3D.md`.
- Palette ispirata alla pergamena di `js/config.js` (`PALETTE`), adattata alla luce 3D.
- Colore del terreno per vertice, in base ad altitudine e pendenza (prato → bosco → roccia).
- Luce direzionale (sole) + luce emisferica + nebbia leggera per nascondere il bordo del mondo.

## Coordinate e unità

- 1 unità Three.js = **1 metro**. Asse Y verso l'alto.
- Origine (0,0,0) = centro dell'area, a quota 0 m s.l.m. (le Y sono quote reali in metri).
- Il centro dell'area è definito in `assets/terrain/*.json` (lat/lon + coordinate UTM 33N, EPSG:32633).

## Formato heightmap

**Non usare PNG a 16 bit:** il browser decodifica i PNG a 8 bit per canale e la precisione si perde.

- `assets/terrain/<nome>.bin` — griglia `Uint16` little-endian, riga per riga da nord a sud,
  valore = quota in **decimetri** (0–6553,5 m).
- `assets/terrain/<nome>.json` — metadati:
  ```json
  { "name": "tavullia", "cols": 257, "rows": 257, "cellSize": 7.8125,
    "sizeMeters": 2000, "center": { "lat": 43.8985, "lon": 12.7517 },
    "centerUTM": { "x": 319435.68, "y": 4863056.65 },
    "crs": "EPSG:32633", "minElev": 0, "maxElev": 0, "source": "TINITALY 10m" }
  ```
- Le coordinate del centro sono **da verificare**: sul DEM il punto cade su un versante a ~141 m,
  mentre il paese è dato a ~170 m; c'è un dosso a 172 m circa 250 m più a est. L'abitato è comunque
  dentro l'area. Spostare il centro = rilanciare lo script con `--lat/--lon`.

### Generazione (`tools/dem/`)

Gli script girano sul PC dell'utente, ma anche nell'ambiente cloud, che raggiunge le fonti su AWS
(Copernicus, Terrarium); TINITALY invece no (va scaricato a mano).
- `make_heightmap.py` — input: un GeoTIFF (TINITALY 10 m dell'INGV) oppure `--copernicus`, che legge
  la tile Copernicus GLO-30 pubblica su AWS senza registrazione. Riproietta in EPSG:32633, ritaglia
  2×2 km attorno al centro, ricampiona a 257×257 (**cubica**: la bilineare, ingrandendo dati a 30 m,
  lascia pieghe a griglia visibili con il flat shading) e scrive `.bin` + `.json`.
  Dipendenze: `rasterio` e `numpy`.
- `fetch_terrarium.py` — alternativa senza registrazione: scarica le tile pubbliche AWS
  "Terrarium" (`elevation-tiles-prod`), le decodifica (`(R*256 + G + B/256) - 32768`),
  le unisce e riusa la stessa pipeline. Qualità inferiore (dati ~30 m), ma utile per partire.
- `README.md` — istruzioni passo passo in italiano per l'utente.

### Fallback

Se il `.bin` manca, il gioco genera un **terreno procedurale collinare** con la stessa griglia e
mostra un avviso nel HUD. M1 non deve restare bloccata in attesa dei dati reali.

## Milestone

Ogni milestone si chiude solo dopo test nel browser da parte dell'utente.

### M0 — Pulizia e scheletro
- Rimuovere la parte 2D non più necessaria:
  `renderer.js` `tiles.js` `sprites.js` `world.js` `travel.js` `scenes.js` `title.js` `create.js`
  `saveui.js` `game.js` `castle.js` `main.js` · `sprites_preview.html` · `assets/sprites/` ·
  `docs/GRAFICA.md` `docs/WORLD_GEN.md` `docs/UI_GUIDE.md` `docs/MOBILE.md`.
- Conservare la logica: `config` `calendar` `knight` `combat` `events` `news` `save` + `js/data/`.
  Verificare che si carichino senza errori anche senza le scene 2D (correggere solo i riferimenti rotti).
- Copiare in `lib/three/` da npm `three@0.187.0`: `build/three.module.js`, `build/three.core.js`
  (il primo importa il secondo) e solo gli addon usati. Aggiungere `lib/three/LICENSE`.
- Nuovo `index.html` con importmap (`"three": "./lib/three/three.module.js"`) e `js/3d/main.js`:
  scena vuota con cielo, render loop, resize, contatore FPS con `F3`.
- **Accettazione:** pagina servita in locale senza errori in console, cielo visibile, FPS mostrati.

### M1 — Terreno
- `js/3d/terrain.js`: carica `.bin` + `.json` (o fallback), crea la mesh, colora i vertici, luci, nebbia.
- Espone `getHeight(x, z)` e `getSlope(x, z)` (gradi): le useranno gli altri moduli.
  L'interpolazione è sul **triangolo disegnato** (diagonale NE–SO), non bilineare: così la quota
  coincide esattamente con la superficie visibile (la bilineare può scostarsi di decine di cm).
- Camera libera di debug (orbitale) attivabile per ispezionare il terreno.
- `tools/dem/` completo con README.
- **Accettazione:** il rilievo è riconoscibile (con dati reali), almeno 60 FPS, nessuna cucitura visibile.
- **Stato:** implementata con dati Copernicus GLO-30 (quote 36–230 m). Camera di debug = OrbitControls
  (`lib/three/addons/`), attiva di default finché non esiste il cavaliere. `F3` mostra anche fonte dei
  dati, quota e pendenza sotto il cursore. **Completata** (test dell'utente superato).
- Nota per M2: con questi dati la pendenza massima è ~31° (punto più ripido, a nord del centro),
  quindi il limite di 35° in pratica non scatta: per provarlo, `kd.knight.cfg.pendenzaMax = 10` in console.

### M2 — Cavaliere
- `js/3d/knight3d.js`: cavaliere costruito con primitive (busto, testa con elmo, braccia, gambe,
  scudo, spada, mantello semplice), alto circa 1,8 m.
- Animazione procedurale: arti che oscillano in proporzione alla velocità, fermo = respiro leggero.
- Movimento: `WASD` o frecce, `Shift` per correre (camminata ~1,5 m/s, corsa ~5 m/s), rotazione fluida.
- Segue il terreno con `getHeight`; non sale su pendenze oltre ~35°; non esce dai bordi dell'area.
- **Accettazione:** camminata su e giù per le colline senza compenetrazioni né scatti.
- **Stato:** completata (l'unico rilievo dell'utente riguardava la camera, risolto in M3). Spada nel fodero al fianco sinistro (non in
  mano: si esplora, non si combatte). Gambe con IK a due ossa: ogni piede cerca il terreno reale sotto
  di sé, il bacino scende quanto serve (con un limite, per non accovacciarsi) e in pendenza il passo
  si accorcia; risultato misurato: piedi entro ~1,5 cm dal suolo anche sul punto più ripido. Ombra
  finta a disco adagiata sul terreno. La fase del passo avanza con la distanza percorsa, quindi
  i piedi non scivolano e, se una pendenza blocca il cavaliere, le gambe si fermano. Contro un pendio
  troppo ripido il cavaliere prova a costeggiarlo lungo un asse.

### M3 — Camera in terza persona
- `js/3d/camera.js`: camera alle spalle con inseguimento morbido (lerp).
- ~~Trascinamento del mouse per ruotare attorno al cavaliere~~ → **deciso con l'utente:** la vista guarda
  sempre dove guarda il cavaliere, come una "quasi prima persona"; non si gira attorno a lui per
  guardargli dietro. Quindi comandi classici: `W`/`S` avanti/indietro, `A`/`D` girano il cavaliere,
  trascinamento orizzontale del mouse = gira il cavaliere, verticale = alza/abbassa lo sguardo.
  Rotella per la distanza (limiti min/max).
- La camera non entra mai sotto il terreno; la direzione di movimento coincide con quella della camera.
- **Accettazione:** nessuna vista dentro le colline, nessun movimento nauseante.
- **Stato:** completata (test dell'utente superato). Camera sopra la spalla destra (il cavaliere
  sta in basso, la vista resta libera davanti); se un dosso alle spalle copre la linea di vista, la camera
  si alza per scavalcarlo. Girando da fermo il cavaliere fa piccoli passi sul posto. Il tasto `C` passa
  ancora alla camera libera di debug (OrbitControls). Parametri provabili da console: `kd.cam.cfg`.
  Misurato in headless: camera mai a meno di 45 cm dal suolo, linea di vista mai sotto il terreno.
  Ritocchi chiesti dall'utente (nov. 2026): all'indietro la velocità segue l'andatura (camminata 1,0, corsetta 2,4,
  scatto 3,2 m/s; prima 0,9 fissi), senza busto inclinato né mantello alzato; la rotazione con A/D parte con
  accelerazione costante (4,5 rad/s², piena a 115°/s in ~0,45 s) e si spegne subito lasciando il tasto: un tocco di
  0,1–0,15 s gira di 3–5° invece di ~17° (misurato in headless).

### M4 — Castello
- `js/3d/castle3d.js`: castello procedurale (mura, 4 torri, mastio, porta), posizionato su un punto
  configurabile e con fondamenta che si adattano al terreno (base che scende fino al suolo).
- Collisioni semplici (rettangoli/cerchi sul piano XZ) contro mura e torri; la porta resta attraversabile.
- **Accettazione:** si gira attorno al castello senza attraversare i muri e si entra dalla porta.
- **Stato:** completata (test dell'utente superato). Castello in mattoni, come le rocche
  malatestiane della zona: cinta di 38 m con scarpa, 4 torri tonde, mastio addossato al lato di fondo,
  torre-porta con passaggio ad arco (saracinesca alzata, battenti aperti), merli a coda di rondine,
  beccatelli, feritoie; ~6 500 triangoli, ~60 mesh. Sta sul colle a est del punto di partenza
  (`CASTLE_CFG` in `castle3d.js`: x 225, z 8, ~173 m), porta verso ovest; il cavaliere parte rivolto
  verso la porta. Mura e torri hanno ognuna la propria base sotto il punto più basso del terreno che
  coprono; la cima di ogni lato è 9 m sopra il suo punto più alto. **Cortile in piano** (richiesta
  dell'utente): terrapieno alla quota più alta del terreno interno (173,65 m; il terreno sotto scende
  fino a 171 m), le mura fanno da muro di contenimento; fuori dalla porta una rampa di 5 m (14°) con
  muretti raccorda il piano al pendio. Su siti più scoscesi andranno terrazzamenti con scalini: non
  fatti finché non serve. **Suolo** (cambio architetturale approvato): `componiSuolo()` in
  `terrain.js` unisce terreno e superfici costruite (`quotaSuolo()` del castello); cavaliere e camera
  usano il suolo, non più il terreno nudo. Collisioni: rettangoli a pezzi di 2 m
  (la scarpa sporge di più dove il terreno è basso) e cerchi per le torri; il cavaliere viene spinto
  fuori lungo la normale e quindi scivola lungo i muri. Camera: se un muro si mette tra cavaliere e
  camera, la camera scatta davanti al muro e poi torna indietro con calma; con un muro a destra la
  spalla rientra. Le pareti hanno una piccola luce propria (luce riflessa), altrimenti i lati in ombra
  escono quasi neri; il colore "da terra" della luce emisferica è stato schiarito per lo stesso motivo
  (sul terreno quasi non si vede). Misurato in headless: nessuna compenetrazione in 72 assalti alle
  mura, ingresso solo dalla porta, camera mai coperta da un muro (49 000 fotogrammi di prova).
- **Qui si valuta il prototipo** con l'utente: se e come proseguire.
- **Dopo la valutazione — realismo del terreno (deciso con l'utente, da fare se il prototipo prosegue):**
  il terreno a facce piatte dà l'idea di "generato al computer" (stacchi netti tra triangoli da 7,8 m).
  Provato e **scartato**: solo sfumare (smooth shading + macchie di colore) → tappeto uniforme, rilievo
  meno leggibile; micro-rilievo geometrico → invisibile dalla vista di gioco e mesh 4× più pesante.
  Direzione scelta, senza texture né asset esterni:
  1. Superficie sfumata (normali per vertice) **+ dettaglio procedurale nello shader** in coordinate
     mondo, su scale 0,5–10 m: ciuffi chiari/scuri, chiazze di terra, passaggio al bosco per pendenza.
  2. **Oggetti sparsi** con primitive e *instancing*: ciuffi d'erba, sassi, cespugli, alberi.
  Cambia lo stile scritto sopra: aggiornarlo quando si fa. Ombre nette su versanti: già regolabili con
  il rapporto sole/luce emisferica; ombre proiettate solo per cavaliere/castello.
- **Dopo la valutazione — stile simil-realistico da codice (deciso con l'utente):**
  - Obiettivo: proporzioni vere, materiali credibili, buona luce. **Non** fotorealismo.
  - Tutto generato via codice: materiali fisici (`MeshStandardMaterial`: metallo, ruvidità), texture
    generate a runtime (canvas o shader: pietra, intonaco, legno, metallo, stoffa), superfici sfumate,
    ombre proiettate, luce d'ambiente. Le texture generate dal codice non sono asset esterni.
  - Cavaliere: più segmenti e forme arrotondate, armatura metallica, mantello che si muove.
    Limite noto: con le sole primitive una figura umana resta un fantoccio dettagliato.
  - Castello: mura, merli, torri e mastio con pietra procedurale; è la parte che rende di più.
  - **Apporti esterni rinviati:** si decide solo dopo aver raggiunto il massimo con il codice.
    Regole già concordate per quel momento: una sola fonte per categoria (texture, vegetazione,
    personaggi); preferire licenze CC0 (CC-BY → file dei crediti); ogni elemento si prova in scena
    accanto a quelli procedurali e si scarta se stona; materiali ricolorati sulla nostra palette, nessuna
    luce o effetto propri dei pacchetti. Richiede di cambiare la regola 6 di `CLAUDE.md`.

- **Dopo la valutazione — rocca, borgo ed edifici (deciso con l'utente, fase a sé):**
  - Edifici di `docs/EARLY_GAME.md` §3 (stalla, taverna, sala d'armi, armeria/mercato, cappella) e di
    `docs/EVENTS.md` (fabbro, guaritore). Non stanno nel cortile attuale (36×36 m, mastio compreso).
  - **Confermato: due cinte**, come i borghi fortificati della zona (Tavullia compresa): **rocca** con
    mastio, sala d'armi, armeria, cappella; **borgo murato** addossato con stalla, taverna, mercato,
    fabbro e una sua porta.
  - Da decidere più avanti: come trattare i castelli e i borghi di paesi o città molto grandi o
    importanti nel gioco (scala, numero di edifici, prestazioni).
  - Edifici generati da codice (regola 6). **Non si entra negli edifici**: avvicinandosi alla porta
    si apre la Carta del cronista. Niente interni 3D.
  - Gli edifici poggiano sul suolo composto (`componiSuolo`): ogni edificio porta la sua quota.
  - **Luci notturne** (richiesta dell'utente): finestre di case, torce di castello e porte, fuochi
    di bivacco. Di notte devono essere gli unici punti visibili da lontano: fiamme e finestre con
    materiali luminosi che ignorano la nebbia (`fog: false`); luce vera sull'intorno (`PointLight`)
    solo per poche sorgenti vicine al cavaliere, per restare nei 60 FPS. [Probabile] serve un limite
    di luci attive, scelte per distanza.
    **Prova fatta:** due torce ai lati della porta del castello (`castle3d.js`, `TORCIA`): staffa,
    manico, fiamma e alone (sprite additivo) che ignorano la nebbia, una sola `PointLight` tra le due
    (intensità 18, raggio 16 m), tremolio; si accendono al crepuscolo (`aggiornaLuci(t, buio)`). Di
    notte dal punto di partenza (225 m) si vedono come due punti luminosi.
  - **Persone con cui parlare (deciso con l'utente):** niente aloni permanenti su tutti. Tre livelli:
    da lontano nessun segno (al più indizi naturali: chi ti guarda, chi fa un cenno, chi sta in
    disparte); entro ~8–10 m chi ha qualcosa da dire mostra un **piccolo simbolo sopra la testa** in
    stile manoscritto (sigillo o pergamena, diverso per incarico, informazione, commercio); vicinissimo
    compare «E: parla» col nome, se noto. Simbolo come sprite (costo trascurabile); un contorno luminoso
    vero richiede post-elaborazione: semmai solo sul personaggio inquadrato. Le azioni costano la loro
    durata plausibile (`docs/GDD.md` §3).

- **Dopo la valutazione — movimento e viaggio (deciso con l'utente):** a scala reale anche 200 m di
  corsa sono lunghi; il terreno **non** si miniaturizza. Due scale, ognuna coerente:
  - **Locale, 1:1**: a piedi nell'area attorno a sé (castello, borgo, dintorni). Velocità a piedi
    invariate: la lentezza è voluta (il garzone parte a piedi, `docs/EARLY_GAME.md`).
  - **Cavallo**: trotto ~4 m/s, galoppo ~12–14 m/s. Milestone a sé (modello e animazione da codice).
  - **Viaggio su mappa** per i km: si sceglie la destinazione, il tragitto si risolve in tempo di gioco,
    Passi, Forza ed eventi di viaggio (logica già esistente, agganciata da M5 e dalla Carta). **Ci si può fermare
    quando si vuole**: si carica il blocco di terreno in quel punto e si esplora in 3D; poi si riparte
    dalla mappa. Anche gli eventi (imboscate, incontri) possono fermare il viaggio e portare in 3D lì.
  - **"Vai a"** dentro l'area locale (300 m–1 km): destinazione indicata, dissolvenza, il tempo avanza
    quanto servirebbe a piedi. Un moltiplicatore di velocità al massimo 2x, solo come comodità: a 4x e oltre
    animazione e camera diventano nauseanti e non basterebbe comunque per i km.
  - Tempo: sulla Carta segue la **distanza**; nelle Scene il **tempo reale compresso** (×15 di giorno,
    ×60 di notte; deciso in M5, `docs/GDD.md` §3). Le due scale non coincidono, ed è voluto.
  - **Andature — fatto** (dopo il test di M4: a passo d'uomo, senza niente da fare nel terreno, anche
    1 km di dintorni richiede troppo tempo reale): **corsetta 3,2 m/s** come andatura normale (`W` o
    freccia su), **scatto 6 m/s** con `Shift`, **camminata 1,5 m/s** con l'interruttore `Ctrl` (indicatore
    in basso a destra). Valori provvisori: si potrà tornare più bassi quando il terreno avrà contenuti
    (velocità alte riducono la scala percepita). In M5 lo scatto costerà più Forza. L'animazione dipende
    dalla velocità reale (riferimenti fissi 1,5 e 5 m/s), non dai parametri; in corsa il bacino scende
    meno (fase di volo). Rischio noto: Ctrl+W chiude la scheda del browser e la pagina non può impedirlo
    (con le frecce non succede).
  - **Pendenza e velocità — fatto** (`knight3d.js`, parametri in `kd.knight.cfg`): curva tipo Tobler
    sulla pendenza nella direzione di marcia (misurata 1 m avanti), ammorbidita per il gioco
    (`pendenzaK` 2 invece di 3,5): ×1,1 sulle discese dolci (~3°), più lento in salita e sulle discese
    ripide, **mai sotto ×0,5** (sul punto più ripido, ~30°: cammino 0,75 m/s, corsa 2,5 m/s). Di traverso
    si rallenta poco. Anche il blocco a 35° ora conta la pendenza del passo, non quella del versante:
    un pendio ripido si può tagliare di traverso. F3 mostra pendenza di marcia e fattore.
  - **Pendenza e fatica — fatto in M5**: il consumo di Forza cresce con la distanza, la salita e
    l'andatura. Sulla Carta la salita costerà anche tempo; nelle Scene il tempo è quello reale compresso.
  - **Cadute** (dopo M5): oltre ~30–35° in discesa o di traverso, probabilità di scivolare per metro che
    cresce con pendenza e velocità (correndo molto di più); scivolata di qualche metro, danno alla Salute,
    costo di Forza; avviso "terreno ripido" nell'HUD. È un rischio scelto, risolto come un evento:
    **non** una prova di abilità (il gioco non è un action game). Oggi la discesa non ha limiti.
  - Cavallo: stessa curva con parametri propri (sale bene i pendii moderati, scende i ripidi con molta
    cautela, rifiuta prima di un uomo, indicativamente oltre 25–30°).
  - Richiede il **terreno a blocchi** e il caricamento del blocco accanto al bordo (prima con
    dissolvenza, poi senza stacchi). Estensione del mondo, formato e provenienza dei dati sono decisi
    in «Carta e Scene», più sotto.
  - Fermarsi "nel nulla" offre qualcosa solo con vegetazione e oggetti sparsi: vanno fatti insieme.

### M5 — Aggancio alla logica esistente (ridotta, dopo la valutazione di M4)
Nel 2D 1 Passo era 1 tile; ora il **Passo è solo un'unità di tempo** (~3 ore, `docs/GDD.md` §3).
- **Tempo reale compresso (ricalibrato con l'utente dopo la prima prova):** il primo modello (tempo
  per distanza, 12 km per Passo) dava ~30 minuti di gioco ogni 10 minuti reali e un'ora canonica ogni
  ~ora reale: nelle Scene il tempo era quasi fermo. Ora `TEMPO_SCENA` in `config.js`: **×15 di giorno**
  (Prima–Vespri: un'ora canonica ogni 12 minuti reali) e **×60 di notte** (Compieta–Lodi: ogni
  3 minuti), anche da fermi. `METRI_PER_PASSO` e la regola della salita restano per la Carta.
- **`Calendar` accumula frazioni di Passo** (`avanzaTempoReale`, `avanzaMinuti`, `avanzaFinoA`).
  Veglia: il giorno si ricava dai Passi (8 Passi = 1 giorno), non più un giorno per Passo.
- **Forza per distanza:** nuova funzione in `Knight` che riceve metri, dislivello e andatura (solo
  numeri: niente Three.js, regola 9). Scala provvisoria: 100 di Forza ≈ 30 km in piano camminando;
  corsetta ×1,5, scatto ×3 al metro; un metro di salita vale ~6,7 m in piano. `TRAVEL_COST` per
  bioma resta per la Carta.
- **Forza a 0:** niente corsa né scatto, solo camminata.
- **Recupero da fermi** (deciso con l'utente): ~10 Forza per Passo di gioco trascorso da fermi
  (`VIAGGIO.FORZA_RIPOSO_PER_PASSO`, ~3,3 l'ora), con lo **stesso ritmo** in tutti i modi in cui passa
  il tempo: aspettando davvero, con `T` o con `R`. Nessuno conviene più degli altri. In movimento non
  si recupera. Effetto noto: nelle Scene la Forza pesa poco (10 minuti di corsetta ≈ −10, 12 minuti
  fermi ≈ +10); conterà soprattutto sulla Carta, nei giorni di viaggio.
- **Avanza** con `T` (solo da fermi): salto atomico all'inizio della prossima ora canonica, di giorno
  o di notte. Serve a non dover aspettare davvero (il tramonto, un incontro…): i 12 minuti reali per
  ora valgono per il tempo in cui si fa qualcosa.
- **Riposa** con `R` (solo da fermi), scorciatoia per il riposo pieno: da Vespri in poi si dorme
  all'addiaccio fino a Prima (da Compieta: 9 ore, +30 Forza); di giorno una sosta di un Passo
  (~3 ore, +10 Forza). Con la Forza piena di giorno rimanda a `T`.
- **Pausa** con `P`: nulla scorre. La scheda nascosta ferma il ciclo di disegno: pausa automatica.
- **Ciclo giorno/notte:** sole che segue l'ora (alba alle 5, tramonto alle 20, massimo 55°), colore
  di luce, cielo e nebbia; crepuscolo caldo; la luce propria delle mura e l'ombra del cavaliere si
  abbassano. Niente stagioni per ora. **Notte (ritoccata dopo la prova dell'utente):** buia, luna
  debole; la nebbia, del colore del cielo notturno, si stringe attorno al punto osservato (nitido
  fino a ~15 m, buio pieno a ~110 m oltre la camera): si vede bene solo vicino, il castello a 225 m
  sparisce. Parametri in `CICLO` (`cielo.js`, prima in `main.js`).
- **HUD in HTML:** data (o «Veglia · giorno N») con l'ora, Forza, Salute, Volontà, Onore.
- **Salvataggio locale** (localStorage, come da `CLAUDE.md`): posizione e direzione del cavaliere,
  terreno corrente, stato di `Knight` e `Calendar`, autosalvataggio. Supabase abbandonato (deciso
  con l'utente: lo spazio gratuito è esaurito); tolte da `save.js` anche le sezioni 2D.
- `Calendar.velocita` (secondi reali per Passo) non serve nelle Scene: resterà per la Carta.
- **Accettazione:** il tempo scorre anche da fermi, un'ora canonica ogni ~12 minuti reali di giorno
  e ~3 di notte, e si ferma con `P`; sole, cielo e luce seguono l'ora; la Forza cala con la distanza,
  di più correndo e in salita; a Forza 0 si cammina soltanto; `R` riposa di giorno e fa dormire fino a
  Prima di sera; ricaricando la pagina si riparte dal punto salvato con data e attributi salvati.
- **Stato: completata** (novembre 2026). Provati dall'utente su Pages: ritmo del tempo, giorno/notte,
  notte buia con visibilità solo vicina, torce della porta, `T`, `R`, pausa. **Verifiche dell'utente in
  sospeso** (si è deciso di passare a M6 senza aspettarle; rischio basso, già verificate in headless):
  ripresa dal salvataggio dopo il ricaricamento (posizione, ora, Forza; `F8` riparte da zero) e Forza
  a 0 (solo camminata, `R` la ricarica; per provarla: `Knight.forza.cur = 0` dalla console).
  Misurato in headless: 4 s da fermi di giorno = 0,0056 Passi (atteso 0,0057), 3 s di notte = 0,0163
  (atteso 0,0167); in pausa il tempo non cambia; dormire da Compieta porta a Prima del giorno dopo; la
  sosta di giorno dà +10 Forza e 1 Passo; da fermi 4 s di giorno danno +0,053 Forza (atteso 0,053) e
  `T` da 0,3 del Passo +7; dopo il ricaricamento posizione, tempo e attributi sono identici; F8
  ricomincia da zero.
  Rimandati, fuori da M5: le stagioni non cambiano la durata del giorno; velocità della Carta da
  allineare (GDD 3–60 s per Passo, `calendar.js` 4–30); eventi già scritti con costi in Passi interi
  da rivedere quando si agganciano alle Scene.
  **Un Passo per ogni ora canonica** (Prima, Terza, Sesta, Nona, Vespri, Compieta, Mattutino, Lodi;
  il giorno comincia a Prima, ~6:00), nel pannello di stato in alto a destra; F3 mostra Passi,
  frazione, ora, rapporto giorno/notte, altezza del sole e Forza esatte. `F8` nuova partita (con
  conferma). Salvataggio automatico ogni minuto, quando si lascia la pagina e dopo ogni riposo.

## M6 — Prototipo del generatore del mondo (Carta e Scene) — fase corrente

Design di gioco e regole di generazione in `docs/GDD.md` §2 *Il mondo* e §3 *Viaggio*. Qui la tecnica.

**Ordine proposto:** M5 (completata) → **M6, prototipo del generatore** (Carta più una Scena
generata, con passaggio Carta ↔ Scena) → rocca e borgo → vegetazione e oggetti sparsi → luoghi, fazioni e nomi
generati.

**Il rischio maggiore è la credibilità del rilievo nelle Scene.** Una Scena di 2×2 km copre circa
2×2 celle della Carta: dalla Carta riceve solo l'andamento d'insieme. Valli e crinali alla scala di
Tavullia (300–800 m) nascono dal **dettaglio della Scena**, che deve dipendere solo dalle coordinate
del mondo (niente erosione idraulica per blocco: lascerebbe giunture). L'erosione della Carta serve per
le grandi valli fluviali e per le catene. Rischio tipico del rumore: conche chiuse sparse (alcune
possono diventare stagni; troppe tradiscono il generatore).

### Piano approvato (novembre 2026): 8 passi, ciascuno provato nel browser

(Il passo 5, orizzonte, è stato inserito dopo il passo 4 su richiesta dell'utente: i passi successivi
sono slittati di uno. Nelle note dei passi 1–4 «passo 5/6/7» vanno letti come 6/7/8.)

1. **Seme e rumore deterministici; vista di sviluppo della Carta** (tasto `M`, oppure `?carta`
   nell'indirizzo): seme, rilievo ombreggiato del continente (fase 1), livello del mare per quantile,
   tempo di generazione e codice di controllo. *Prova:* semi diversi → mondi diversi; stesso seme →
   stesso codice di controllo, anche su un altro browser.
   **Stato: fatto, da provare dall'utente.** Generazione ~250–350 ms per Carta (niente Web Worker per
   ora). Stesso codice di controllo in Node e in Chromium (stesso motore V8: la prova su Firefox resta
   all'utente). Forma: fBm con dominio deformato più una scala molto grande (golfi, mari interni,
   penisole), mare per quantile al 10–22 %, inclinazione per seme (più mare da un lato). **Bordi liberi**
   come nel 2D (`docs/WORLD_GEN.md` in `2c869fa`: «niente anello d'acqua forzato»): terra o mare secondo
   il rumore, con una leggera spinta verso il mare negli ultimi 40 km; il mondo non è sempre un'isola.
   (Una prima versione forzava il mare lungo i bordi e alzava il mare al 25–38 %: scartata, violava la
   regola.) Catene lungo le linee di zero di un rumore liscio su grande scala (linee lunghe e sinuose),
   con contrafforti *ridged*, in tratti scelti da una maschera la cui soglia si cerca perché le catene
   coprano il 4,5–10 % della terra. Limiti noti: i mari chiusi sono ancora «mare» (laghi e mari si
   distinguono al passo 4); l'interno è piatto finché il passo 2 non aggiunge colline e quote in metri;
   isole al largo rare. Un bordo di terra è un **confine invalicabile** (deciso con l'utente).
   La vista colora **solo la quota**, a un tono (più alto = più scuro), con legenda: la prima scala
   verde-ocra-bianco si leggeva come biomi (prati, deserti, neve), che arrivano al passo 6.
2. **Quote in metri e massicci isolati** (fasi 2–3); al passaggio del mouse quota e coordinate della
   cella. *Prova:* pianure 0–200 m, colline 200–700 m, catene 1500–3500 m; istogramma delle quote.
   **Stato: fatto, da provare dall'utente.** Un campo «composto» (pianure + colline + catene) si
   rimappa in metri con una curva a fasce fissate per quantile sulla terra: pianura 0–200 m (~65 %),
   collina 200–700 m (17–25 %, GDD ~20 %), pedemonte 700–1500 m (5–9 %), montagna da 1500 m alla cima
   (4,5–10 %, cima 2800–3500 m per seme). Dentro le fasce la curva è lineare sul valore composto, tranne
   la montagna, mappata per rango (curva r^1,25): in lineare pochi picchi schiacciavano le catene appena
   sopra i 1500 m. Colline: zone da un campo su grande scala e dai fianchi delle catene, con rampa larga
   (salgono gradualmente dalla pianura) e rilievo interno ad alto contrasto. Catene: creste e selle
   anche sulla spina. Massicci isolati: 3–7 per seme, 1500–3000 m, raggio 9–19 km, a ≥ 25 km dalla
   costa, ≥ 50 km dalle catene e ≥ 100 km tra loro, coni irregolari (raggio variabile con la direzione,
   senza trigonometria). Fondali fino a −2500 m. Vista: quota e fascia sotto il cursore, istogramma a
   passi di 100 m, parti per fascia, massicci cerchiati. Generazione ~350–550 ms.
   **Misura del rilievo** (dislivello mediano in finestre di 5×5 km, 8 semi): pianura ~30 m, collina
   180–250 m, pedemonte 380–700 m, montagna 500–810 m (90° percentile 1000–1500 m). Riferimento:
   Tavullia ha 194 m di dislivello in 2 km. Le prime versioni avevano colline a 100–140 m e montagne a
   400–550 m: troppo dolci. Le valli fluviali (passo 4) e il dettaglio delle Scene (passo 3) aggiungono
   rilievo. Limiti noti: a 1 km per cella le colline restano «a macchie» finché il drenaggio non scava
   le valli; dove due linee di catena si incrociano può nascere un nodo montuoso a macchia.
   **Ritocco (richiesta dell'utente): massicci meno identici e meno piramidali.** Ognuno ha un tipo (cupola,
   cono a fianchi concavi, cresta allungata 1,8–2,8 volte, gruppo di 2–4 cime), un profilo misto
   cono/conca/cupola con pesi propri, un versante più ripido dell'altro, contorno a lobi, spalle e
   terrazzi a quote diverse secondo la direzione, creste ridged sui fianchi; almeno 30 km dal bordo della
   Carta. Posizione, raggio e cima restano quelli di prima (stesso generatore).
3. **Scena dalla Carta con il dettaglio**: clic sulla Carta → blocco 257×257 (interpolazione liscia +
   dettaglio su più scale in coordinate del mondo) passato a `terrain.js` nello stesso formato;
   coordinate locali; `M` riporta alla Carta. Il mondo generato diventa l'avvio predefinito, Tavullia
   si carica con `?terreno=tavullia`; il salvataggio tiene seme e posizione nel mondo. *Prova:*
   confronto con Tavullia, a occhio e con i percentili della pendenza in F3; due blocchi vicini combaciano.
   **Stato: fatto, da provare dall'utente.** `js/mondo/scena.js`: quota del mondo = Carta interpolata
   con una B-spline cubica (liscia, senza pieghe a griglia) + fBm «eroso» (alla Quílez: le ottave fini si
   smorzano dove la pendenza accumulata è forte), 6 ottave da 1400 m a ~44 m (più fini davano solo
   tremolio sotto la griglia da 7,8 m). Ampiezza dalla quota della Carta: ~8 m in pianura, cresce forte
   dalla collina (rampa 120–420 m), tetto 480 m in montagna; piena anche sulla costa. Generazione di una
   Scena 20–30 ms; giuntura tra blocchi vicini 0 m (la quota è funzione pura delle coordinate del mondo).
   `terrain.js` esporta `createTerrain` (griglia in memoria). In `main.js` un «suolo» intermedio rimanda al
   terreno attivo: si cambia Scena senza ricaricare la pagina; il castello resta solo a Tavullia
   (`?terreno=tavullia`). Mare: superficie a quota 0 se la Scena scende sotto; il cavaliere non entra
   oltre 0,6 m d'acqua; la camera non va sotto il pelo dell'acqua. Carta (tasto M): mostra il mondo della
   partita con il cavaliere; clic sulla terra = Scena centrata lì (anche da un'anteprima di un altro seme,
   che diventa il mondo della partita). Salvataggio: seme, centro della Scena e posizione. Nuova partita
   (F8) = nuovo mondo a caso; si parte in collina (250–600 m) vicino al centro della Carta. F3: pendenze
   della Scena (p50, p90, p99) e posizione nel mondo. Sulla Carta il fondale vicino alla costa è passato
   a −40 m: a −5 m l'interpolazione spostava la costa al largo e il mare quasi spariva dalle Scene.
   **Misure** (seme 48213; pendenza p50 / p90 / p99): Tavullia 8,5° / 13,1° / 19,9° (36–230 m); collina
   bassa 8,2° / 13,3° / 19,2° (173–507 m); collina 10,4° / 18,5° / 26° (331–664 m); pedemonte 16° / 29° /
   38°; montagna 21° / 37° / 48° (le prime versioni: 28° / 47° / 58°, quasi impraticabile con il limite di
   35° del cavaliere); pianura 0,6° / 1,1° / 1,7°. Limiti noti: le montagne sono «a panettone», senza
   creste nette né valli a V (attese dal drenaggio, passo 4); i colori del terreno sono quelli di Tavullia
   (relativi alla quota del blocco, a quadretti dove la pendenza passa le soglie del bosco): si rifanno con
   i biomi (passo 6); dentro una Scena la costa è un arco dolce; si esce da una Scena solo dalla Carta.
4. **Drenaggio sulla Carta**: riempimento delle conche (*priority-flood*), direzioni di flusso, flusso
   accumulato, fiumi e laghi (fase 5); valli scavate in proporzione al flusso (fase 4, versione semplice;
   se non basta, erosione fluviale *stream power*, da decidere guardando il risultato). *Prova:* verifica
   automatica che ogni fiume scenda sempre e finisca in mare o in un lago.
   **Stato: fatto, da provare dall'utente.** In `carta.js` (fasi 4–5, su una quota qualunque):
   - acque: mare (collegato al bordo o ≥ 1500 km²), lago costiero (specchio chiuso più piccolo, a quota 0),
     lago in quota; foci = mare, laghi costieri e bordi di terra (il fiume esce oltre il confine);
   - micro-rilievo delle pianure (±6 m su 12 km), poi primo drenaggio → valli: letto a quota − 8·√bacino
     (al massimo il 45 % della quota), corretto perché scenda sempre; versanti abbassati verso il letto
     con profilo a V entro 1,5–8 km, mai sotto il letto (lo scavo non crea conche);
   - secondo drenaggio: conche profonde > 3 m e ampie ≥ 4 km² → laghi (40–90 per seme); le altre colmate;
   - riempimento senza ε (priority-flood, Barnes et al. 2014); direzione verso una vicina più bassa, a caso
     (hash) tra quelle entro il 90 % della più ripida (sennò righe parallele sui pendii uniformi); zone
     piatte col gradiente combinato di Barnes, Lehman e Mulla (2014), laghi compresi; bacini in ordine
     topologico. Niente cicli per costruzione. Fiume = bacino ≥ 150 km².
   `js/mondo/verifica.js` → `verificaFiumi`: ogni cella di fiume seguita fino alla foce; il letto non sale
   (fuori dai laghi), nessun ciclo, foce in mare, lago o oltre il confine. **8 semi: superata, risalita
   massima 0,000 m.** La vista della Carta disegna fiumi (larghezza dal bacino) e laghi, e riporta sorgenti,
   foci ed esito della verifica. Carta ~0,7–0,85 s (Web Worker non ancora necessario, ma vicino).
   Tentativi scartati: scavo «quota − profondità» (creava 500 laghi); rugosità dopo lo scavo (non toglieva
   le righe parallele, che venivano dalle zone piatte); zone piatte = sole celle colmate (cicli al confine
   con i laghi). Misure: dislivello in 5 km, collina ~245 m (prima 180–250), montagna 570–760 m.
   Limiti noti: sui fondovalle piatti il fiume può fare lunghe diagonali dritte; nelle Scene le valli della
   Carta sono larghe chilometri (in 2 km se ne vede un fianco) e non c'è ancora acqua né alveo: passo 5;
   i laghi in quota nelle Scene sono conche asciutte (passo 5); la pioggia è uniforme (con l'umidità del
   passo 6 i bacini cambieranno).
   **Ritocchi (richiesta dell'utente: fiumi troppo rettilinei, angoli a 90°, laghi «a pettine»).**
   - Tracciati curvi (`tracciaFiumi` in `carta.js`, `carta.fiumi`): rete in tronchi (a ogni confluenza
     prosegue il ramo più lungo a monte), punti delle celle spostati da un campo dolce (fino a 0,42 km in
     pianura, 0,12 in montagna; stesso punto per tutti i tronchi di una cella, quindi si agganciano),
     angoli arrotondati (Chaikin), anse laterali con lunghezza d'onda 2–9 km e ampiezza fino a 0,65 km,
     grandi in pianura e collina, piccole in montagna, nulle agli estremi. Sono questi i tracciati da
     scavare nelle Scene al passo 6. La vista della Carta li disegna al posto delle catene di celle.
   - Laghi: lago = l'intera conca colmata (fino allo sfioro) se profonda oltre 3 m in qualche punto e
     ampia ≥ 4 km² (contando solo le celle profonde, i canaletti davano laghi a strisce); nelle zone
     piatte i corsi minori scavano solo il proprio canale (che apre il varco e svuota la conca; senza, i
     laghi diventavano ~500, con i versanti a V i solchi vicini si abbassavano a vicenda); le dita larghe
     una cella si tolgono (una passata). 25–53 laghi per seme; verifica dei fiumi superata su 5 semi.
   **Secondo ritocco (utente: ancora troppi rettilinei, laghi poco verosimili).**
   - Le valli dei fiumi (bacino ≥ 150 km²) si scavano lungo i tracciati curvi (anse comprese), con il letto
     interpolato che scende sempre; i rigagnoli minori lungo le celle come prima. I tracciati finali sono
     proprio quelli: ricavati di nuovo dal secondo drenaggio a celle da 1 km, le anse si perdevano
     (sinuosità mediana su finestre di 20 km: 1,22 contro 1,72). Ora 1,58 (90° percentile 2,15; i fiumi
     reali stanno in media tra 1,2 e 1,5, quelli di pianura con meandri oltre 2). Tracciati a punti
     (x, y, bacino, letto): il letto servirà alle Scene (passo 6). Dentro i laghi il tracciato si interrompe.
   - Anse ampie anche in collina (la valle le segue); spostamento dei punti fino a 1,5 km in pianura su
     9 e 30 km. I corsi che scendono dritti dalle catene restano in parte dritti (come i fiumi appenninici
     verso l'Adriatico): piegarli di più vorrebbe dire tagliare i rilievi.
   - Vista: laghi con contorni smussati (marching squares su un campo ammorbidito), non a quadretti.
   - Laghi 64–109 per seme (le valli curve lasciano qualche conca in più). Carta ~0,85–0,95 s.
   - Pulsante «Tavullia (prova)» nella vista della Carta: carica la scena di prova senza ricaricare la
     pagina; un clic sulla Carta riporta al mondo generato.
   **Revisione del rilievo (decisa con l'utente): più collina, poggi al posto dei massicci, punti panoramici.**
   - Fasce: pianura 25–35 %, collina 45–55 %, pedemonte 8–12 %, montagna 4,5–10 % (misurate dopo lo scavo:
     pianura ~35–40 %, collina ~43–48 %: lo scavo riporta in basso una parte della collina). Zone collinari
     più estese (soglia del campo più bassa).
   - Massicci isolati tolti. **Poggi**: 1400–1800 per seme, 80–300 m, larghi 2–5 km, fitti o radi secondo un
     campo su grande scala (distanza minima 4–14 km), molti piccoli e pochi grandi, allungati lungo un campo di
     direzioni dolce, il 15 % a sommità larga; messi **dopo** il drenaggio e lontani dai corsi d'acqua (prima
     del drenaggio chiudevano conche: ~150 laghetti in più).
   - Letto dei fiumi dalle sorgenti verso la foce, mai più alto a valle: il fiume taglia il bordo delle conche
     (breccia, fino a 60 m oltre lo scavo normale) e le svuota; sui fondi piatti i corsi minori non scavano
     (davano solchi paralleli). Laghi: conche > 20 m e ≥ 10 km² (75–99 per seme).
   - `verificaPanorami` (in `verifica.js`): cime locali (finestra 5×5 km); panoramica se in ≥ 25 % di 32
     direzioni qualcosa tra 20 e 30 km sporge sopra tutto ciò che sta davanti (curvatura compresa); copertura =
     terra sotto 1500 m entro 10 km da una cima panoramica. **Oggi 79–82 %: la regola (≥ 90 %) non è ancora
     rispettata.** In montagna 14–24 % (lì la regola non vale). La vista lo riporta; i punti si mostrano col
     pulsante «Punti panoramici».
   - Foschia diurna da 8 a 50 km (salire per guardare lontano è un'azione di gioco).
   - Limiti: Carta ~1,2–1,5 s (oltre la soglia prevista per il Web Worker); in pianura i poggi piccoli sulla
     Carta sembrano puntini regolari (rischio «pluriball», da giudicare in 3D); le conche restano molte perché il
     rilievo collinare viene da rumore: il rimedio vero è l'erosione fluviale (stream power), proposta all'utente.
   **Erosione fluviale, Web Worker e cache (approvati dall'utente).**
   - `erosioneFluviale` (in `carta.js`): «stream power» con lo schema implicito di Braun e Willett (2013),
     senza sollevamento: 24 passi, ogni cella si avvicina alla cella a valle con peso 0,004·√(bacino km²);
     direzioni di flusso ricalcolate ogni 3 passi (riempimento e zone piatte del drenaggio). Poi
     `mappaFasce` rimette le quote sulle fasce decise (trasformazione monotona: i fiumi scendono ancora).
     Laghi 44–67 per seme (prima 75–99); scavo semplice più leggero (k = 5). Fasce misurate: pianura 34–38 %,
     collina 46–49 % (si assegna il 5 % di collina in più perché lo scavo successivo ne abbassa una parte).
   - Tracciati: confluenza anticipata (un corso entro 1,5 km da uno più grande lo raggiunge lì; sui
     fondovalle larghi in pendenza uniforme i rigagnoli scendevano paralleli). Sinuosità mediana 1,49.
     Restano coppie di fiumi grandi paralleli a qualche km in fondovalle larghi (come nelle pianure alluvionali).
   - Poggi: raggio minimo 1,6 km (sotto erano quadratini di una cella); 12 % «belvedere» di 300–450 m.
   - Punti panoramici: osservazione anche sui versanti (un punto ogni 3 km oltre alle cime locali 3×3 km;
     contando solo le cime i fianchi delle catene risultavano scoperti), 16 direzioni. **Regola rispettata:
     97–99 % della terra sotto i 1500 m** (montagna 44–62 %). Su una pianura piatta non passa (da 2 m
     d'altezza l'orizzonte è a ~5 km).
   - **Web Worker** (`js/mondo/lavoratore.js`, lato pagina `js/mondo/generatore.js`): generazione e
     verifiche fuori dal filo della pagina, schermata «Generazione del mondo» con avanzamento per fasi;
     anteprime dalla Carta con l'avanzamento nella barra. Se il Worker non parte, si genera nella pagina.
     Misurato (Chromium headless): Carta ~3,4 s, prima apertura ~4,8 s.
   - **Cache** in IndexedDB (database «knightdawn», archivio «carte»), chiave «VERSIONE_GENERATORE|seme»,
     ultime 3 Carte: ricaricando con lo stesso seme ~1 s. `?rigenera` ignora la cache. Non è un
     salvataggio (si salva solo il seme): `VERSIONE_GENERATORE` in `carta.js` va cambiata a ogni modifica
     che cambia le Carte. Stesso codice di controllo nel Worker e in Node (seme 48213 → `39857c7c`).
   **Vista della Carta: zoom (richiesta dell'utente).** Rotella attorno al cursore fino a ×40 (una cella ~60 px),
   trascinamento per spostarsi, «Vista intera», «Centra sul cavaliere» (×12); clic senza trascinamento = Scena
   centrata nel punto esatto (al metro, non più al centro della cella); coordinate al centesimo di km sotto il
   cursore. Fiumi e segni in pixel dello schermo (laghi e fiumi precalcolati come Path2D); rilievo a celle nette
   a vista intera, sfumato da ×3.
   **Tavullia e mondo della partita.** «Tavullia (prova)» è solo la scena di prova di 2×2 km, non la modalità
   reale (milestone dopo M6). Anche a Tavullia la partita conserva il suo mondo (seme nel salvataggio e
   nell'indirizzo): la Carta riporta lì e non a un seme a caso.
   **Fiumi dritti per decine di km (segnalati dall'utente sul seme 350364).** Due cause, due rimedi:
   - le zone piatte (conche colmate) si attraversavano con la distanza a scacchiera di Barnes: rette a 45°
     fino allo sfioro, poi scavate dall'erosione. Ora percorso di costo minimo (Dijkstra) verso il bordo
     basso, con un costo che varia dolcemente (rumore su ~8 km, ±40 %): il percorso piega; ogni cella punta
     alla precedente sul percorso minimo, quindi niente cicli né celle senza uscita;
   - prima dell'erosione un'ondulazione su 12 e 30 km (12 m + 3 % della quota): sui pendii lunghi e uniformi
     il flusso devia invece di correre dritto.
   Restano tratti di ~30 km poco curvi e, sulle pianure in pendenza, affluenti paralleli «a pettine».
   `VERSIONE_GENERATORE` = `m6-erosione-3`.
5. **Orizzonte** (inserito dopo il passo 4): oltre il blocco di 2×2 km non si vedeva nulla, nemmeno una
   catena a pochi km. Terreno lontano solo da guardare, dalla Carta già in memoria (`js/3d/orizzonte.js`).
   *Prova:* dal pedemonte si vedono le montagne lontane; nessuna fessura al raccordo col blocco; FPS.
   **Stato: fatto, da provare dall'utente.** Tre anelli quadrati attorno al blocco: 1–6 km a passo 62,5 m,
   6–18 km a 187,5 m, 18–48 km a 750 m (~167 000 triangoli, costruiti in 150–270 ms al cambio di Scena).
   Una sola funzione di quota: la quota del mondo in cui ogni ottava del dettaglio si spegne alla distanza
   in cui la griglia non la rappresenta più (piene al bordo del blocco, a 18 km resta la sola Carta); una
   prima versione a due anelli, con la sola Carta oltre 6 km, mostrava montagne lontane a cupola liscia.
   Cuciture a ventaglio sui vertici più fitti dentro, con le stesse quote: niente fessure né pareti (le
   pareti laterali del blocco si nascondono). Curvatura della Terra oltre 1,5 km (raggio efficace 7/6 per
   la rifrazione: −125 m circa a 40 km); mare come griglia larga che scende con la curvatura. Camera fino a
   60 km, buffer di profondità logaritmico (niente sfarfallio tra costa e mare lontani), nebbia di giorno
   da 1,5 a 46 km (foschia azzurrina sulle cose lontane); di notte come prima, solo vicino. Solo nel mondo
   generato: Tavullia resta com'era. F3: triangoli e tempo dell'orizzonte. Limiti noti: FPS su GPU vera da
   misurare (in headless il rendering è software e non fa testo); colori come il blocco (biomi al passo 7);
   oltre il confine della Carta l'orizzonte prolunga piatto l'ultimo bordo.
   **Correzione (segnalata dall'utente): nebbia sulla distanza vera.** Three.js calcola la nebbia sulla
   profondità lungo l'asse della camera: i monti ai lati dello schermo ricevevano meno nebbia e sparivano
   girandosi verso di loro. Ora `fog_vertex` usa la distanza dalla camera (sostituzione del pezzo di
   shader da `main.js`, senza toccare `lib/three/`). Foschia di giorno da 3 a 50 km.
6. **Fiumi nella Scena**: tracciato liscio (non a celle), letto scavato sempre in discesa, superficie
   dell'acqua. *Prova:* il fiume sta in una valle, scende, prosegue senza stacchi nel blocco accanto.
   **Stato: fatto, da provare dall'utente.** Tutto in `js/mondo/scena.js` (senza grafica) più le mesh in
   `js/3d/acqua.js`; la Carta non cambia (`VERSIONE_GENERATORE` invariata).
   - *Letto:* calcolato una volta per Carta lungo i tracciati curvi (`fiumiScena`, ~350 ms alla prima Scena):
     pelo dell'acqua 0,8 m sotto la superficie liscia della Carta, letto che scende di almeno 2 cm ogni
     0,2 km, alle confluenze lo stesso letto del fiume principale e a monte mai più basso. Verificato: 0
     risalite su 421 tracciati (seme 48213).
   - *Sezione* (`scavaFiumi`, funzione del solo punto del mondo, quindi blocchi accanto e orizzonte
     combaciano): alveo a parabola largo 2·0,3·bacino^0,6 m (max 140 m; come nei fiumi veri, larghezza ∝
     portata^0,5–0,6), profondo 0,3 + 0,045·√bacino m. Il fiume cresce lungo il corso [richiesto
     dall'utente: torrenti piccoli alla sorgente, grandi alle foci e dopo gli affluenti]: ~3,5 m e ~0,5 m
     d'acqua a 20 km², ~12 m e ~0,85 m a 150 (si guada ancora), ~35 m e ~1,7 m a 1000, ~65 m e ~2,5 m a
     2500 km² (prima 8 m → 17 m → 65 m: i torrenti erano già larghi). Seme 48213: larghezze p5/p50/p95
     4/16/63 m; il fiume più lungo va da 12 a 67 m. Sponde basse di 6 m, poi versanti che risalgono
     fino al terreno sempre più ripidi entro 1 km; dove il terreno è più basso del fiume un argine che
     scende piano (il fiume non resta sospeso).
   - *Acqua:* nastro lungo il tracciato al pelo dell'acqua; laghi in quota come quadrati da ~31 m al livello
     del lago. Fuori dal blocco continuano nell'orizzonte: i tracciati sono tagliati esattamente sul bordo
     del blocco, e oltre i nastri si posano sulla superficie (più grossolana) degli anelli, ciascun punto
     finché è largo almeno ~1 pixel (fino a 18 km per i fiumi grandi); i laghi come celle degli anelli.
   - *Cavaliere:* non entra dove l'acqua supera 0,9 m (fiumi grandi e laghi; si guadano i piccoli); la camera
     non scende sotto il pelo dell'acqua. F3: pelo e profondità dell'acqua sotto il cavaliere.
   - *Tempi* (headless): Scena con fiume ~110 ms, orizzonte con valli e acqua 250–320 ms (prima 150–270).
   Limiti noti: i laghi fuori dal blocco hanno la riva a gradini di 62,5 m; il nastro dei fiumi lontani è
   posato sopra il terreno (pochi metri, invisibili da lontano); colori dell'acqua e delle rive provvisori
   (passo 7). L'acqua non scorre (nessuna animazione).
   **Aggiunta (segnalata dall'utente): rilievo fine nella Carta.** Zoomando, la Carta a celle di 1 km
   sfumata non lasciava distinguere una cima da una conca. Da zoom ×4 la parte visibile si ricalcola con
   le quote vere delle Scene (stessa funzione del terreno 3D, valli dei fiumi comprese), con
   ombreggiatura e curve di livello (equidistanza 5–50 m secondo lo zoom, una curva su cinque più scura),
   a pezzi tra un fotogramma e l'altro (200–330 ms); zoom massimo ×80 (~15 m per campione). Sotto il
   puntatore la quota nella Scena oltre a quella della cella.
   **Correzioni dopo la prova (segnalate dall'utente):**
   - *Valli troppo larghe e lisce.* I versanti si raccordavano al terreno entro 1 km per ogni fiume e
     cancellavano il dettaglio: attorno anche a un torrente c'era per km una conca liscia e uniforme. Ora la
     fascia dei versanti è proporzionale al fiume (R = 120 + 8·semilarghezza m: ~240 m per un torrente,
     ~600 m per i fiumi più grandi) e il dettaglio del rilievo vi torna man mano (pieno da 0,6·R): la valle
     segue i rilievi attorno. L'argine (dove il terreno è più basso del fiume) si raccorda entro R.
   - *Linea nera all'orizzonte e «parete».* Era la superficie di un lago in quota vista di taglio da sotto:
     la B-spline della Carta mescolava il fondo del lago (anche 200 m sotto il livello) con la soglia, la
     riva nella Scena scendeva sotto il livello e l'acqua restava sospesa. Ora la levigatura usa il livello
     per le celle di lago e toglie poi la profondità interpolata tra le celle (a riva il terreno resta quello
     dei dintorni); in più, nella fascia attorno al lago, il terreno sale fino al livello + 0,5 m. Il letto
     dei fiumi vicino ai laghi segue la stessa riva; un immissario arriva al livello del lago.
   - *Bracci di mare che nella Scena erano terra.* La B-spline non interpola: un braccio di mare largo 1–2 km
     (celle a −40 m) fra terre alte saliva sopra lo zero; nella Scena era terra percorribile, sulla Carta mare
     (non si poteva scegliere). Misurato: 44 celle di mare su 2133 (seme 48213) più che a metà terra. Comanda la
     Carta: `correggiCosta` (scena.js) abbassa i punti di controllo del mare (al centro della cella ≤ −15 m) e
     alza quelli della terra (≥ +3 m), in pochi giri, 3–5 ms. Ora 0 celle di mare a metà terra su 3 semi; terra
     a metà mare 0–8 celle (resti di riva). Fiumi, giunture e terrapieni invariati.
   - *Rilievo fine a labirinto e fiumi tra gole o su terrapieni.* Misurato: il fiume non sale rispetto alla
     Carta (1 m in mediana, 26 m all'1 % in pedemonte); è il rilievo fine della Scena, generato senza sapere
     dei fiumi, a mettere colline (66 m nel 10 % dei punti, 155 m nell'1 %) o conche sul tracciato. Prima
     correzione: l'ampiezza del rilievo fine non cresce più con la sola quota oltre 600 m (in pedemonte era
     ~415 m ovunque), cresce con il dislivello locale della Carta ed è piena sulle creste, dimezzata nei
     fondovalle (`DETTAGLIO.forma`). Pendenza p50/p90 in pedemonte da 17°/33° a 12°/25°, in montagna da
     22°/37° a 13°/27°, collina quasi invariata (6,0°/13,2° → 5,5°/12,5°); area in conche > 5 m dimezzata.
     Le montagne risultavano troppo dolci (segnalato dall'utente): fondovalle meno smorzati, più rilievo
     dove la Carta è accidentata e in montagna fino a 220 m in più sulle creste. Pendenza p50/p90: collina
     6,4°/14,2°, pedemonte 13,8°/28,3°, montagna 19,5°/34,0°.
   - **Fiumi tracciati sul terreno della Scena** (deciso con l'utente, `js/mondo/fiumi.js`). Punti fissi
     solo a sorgente, foce e confluenze (alla confluenza nel punto più basso di una griglia 7×7 a 80 m); il
     loro letto scende sempre lungo il fiume. Tra due punti fissi il percorso è quello a costo minimo su una
     griglia di 40 m (16 direzioni) in un corridoio di 800 m attorno al tracciato della Carta: costa salire
     sopra il letto atteso (al quadrato, 6 m raddoppiano il costo), poco allontanarsi dal tracciato (in
     pianura tiene le anse della Carta); poi punti ogni 20 m e media mobile su ~200 m. Letto: la successione
     non crescente più vicina al terreno incontrato (scava i dossi e colma le conche quanto basta). Il
     percorso si cerca per i tratti entro 6 km dalla Scena (e nella Carta zoomata entro una finestra di 50
     km, dove si disegnano i fiumi come nelle Scene); più lontano l'orizzonte usa il tracciato della Carta.
     Misure (seme 855588, tratti entro 20 km): terreno sopra il pelo dell'acqua sull'asse p10/p50/p90/p99
     da −19/3/28/76 m (tracciato della Carta) a −5/1/8/28 m; a 150 m dall'asse −9/3/21/38 m (versanti di
     valle, non gole). Tempi: preparazione dei punti fissi ~0,6 s alla prima Scena, percorsi 60–400 ms al
     cambio di zona, orizzonte 250–390 ms. Limiti: tratti lunghi tra due confluenze si calcolano interi; nei
     casi peggiori (1 %) restano tagli o colmate di 20–30 m.
7. **Temperatura, umidità, biomi** (fasi 6–7) e limite delle nevi nello shader; colori della Scena per
   bioma. *Prova:* livelli della Carta; neve sulle cime.
   **Stato: fatto, da provare dall'utente.**
   - *Carta* (`carta.js`, fasi 6–7, `VERSIONE_GENERATORE` = `m6-biomi-2`): temperatura media annua al livello
     del mare da latitudine (−4 °C a nord, 21 °C a sud), ±2 °C per seme e rumore su ~220 km (±3 °C); −6,5 °C
     ogni 1000 m. Umidità da vicinanza al mare, rumore su ~150 km e piogge sui rilievi, più secco o umido
     per seme. Biomi con i codici del 2D (costi di viaggio ed eventi validi): neve dove la media annua è
     sotto −5 °C; roccia sui pendii ripidi (più dolci sopra il limite degli alberi); montagna oltre 1500 m;
     palude solo in basso, vicino alla costa, umida e calda (rara: 0–0,2 %); sabbia dove è caldo e secco;
     collina dove la Carta è mossa (dislivello > 110 m nelle 3×3 celle) o oltre 700 m; pianura di tre tipi
     secondo la temperatura; boschi a grumi con soglia per quantile (copertura del seme 20–42 %). Soglie
     frastagliate da un rumore su ~7 km. Vista della Carta: livelli rilievo / temperatura / umidità / biomi
     con legenda, clima e bioma sotto il puntatore, parti dei biomi nel piede. FIUME non è un bioma di cella
     (i fiumi hanno il loro tracciato).
   - *Scene* (`terrain.js`, `coloreMondo`): colore per vertice dai biomi delle 4 celle vicine (bilineare, letti
     in un punto spostato di ±350 m da un rumore: confini irregolari), toni ampi più verdi o più secchi,
     macchia più scura sui pendii 14–28°, roccia oltre 32–44°, radure nei boschi, alpeggi sopra il limite
     degli alberi; neve sopra il limite della stagione (media stagionale < −3 °C: alla latitudine media ~1800
     m in primavera e autunno, ~3000 m d'estate, ~400 m d'inverno; ondeggia di ±90 m, non sui pendii oltre
     ~45°) e sempre sulla neve perenne. Normali lisce (niente più chiazze a triangoli né facce staccate dalla
     luce); l'orizzonte usa la stessa funzione con normali dai triangoli attorno a ogni vertice. Tavullia
     resta con i colori di prima.
   - *Roccia in montagna* (richiesta dall'utente): sopra il limite degli alberi e nel bioma roccia la roccia
     compare già dai 18–30° (altrove 32–44°), con affioramenti a chiazze sui pendii medi (più frequenti in
     alto, rari in collina), ghiaioni anche sul dolce 3–6 °C sotto il limite degli alberi, roccia chiara e
     scura; sulle pareti oltre ~30–42° la neve non tiene e affiora la roccia. Il colore usa la pendenza su
     ~60 m (come l'orizzonte vicino; con quella fine il blocco veniva più roccioso dei dintorni e si vedeva
     il riquadro); la luce del blocco passa dalle normali fini a quelle su ~60 m negli ultimi 600 m verso il
     bordo. Limite: pareti davvero verticali richiedono rilievo apposito (oggi le pendenze arrivano a ~45°).
   - **Gruppi montuosi e forcelle** (deciso con l'utente sul modello di Dolomiti e Alpi, da provare). Prima
     distese di guglie tutte uguali (ci si perdeva), poi poche muraglie lunghe (troppo poche, tutte uguali).
     Ora (`carta.js`, `massicciEForcelle`, `VERSIONE_GENERATORE` = `m6-massicci-1`): **4–12 gruppi** (uno ogni
     ~900 km² di terra oltre 1400 m), su cime alte ad almeno 16 km l'uno dall'altro (con le valli in mezzo, dove
     si cammina), ognuno con una **forma** sua — torre (cima a punta), altopiano (cima piatta), piramide,
     cresta (allungata) — e 1–4 torri: pareti invalicabili (60–70°) sopra un piede di ghiaioni percorribili
     (15–25°), contorno irregolare (speroni e canaloni), torri di 0,55–1,15 km di semiasse e 480–880 m sopra il
     terreno. Tra le torri dello stesso gruppo i ghiaioni si toccano: le **forcelle**, selle ~400 m sotto le
     vette con pendii di 3–13°. Sulla Carta: `carta.massicci` (id, forma, torri, forcelle), segno e numero di
     ogni gruppo (il nome arriverà con i luoghi), forcelle gialle da zoom ×4, gruppo e forma sotto il
     puntatore. Nelle Scene i ghiaioni e le forcelle hanno il rilievo fine smorzato, le pareti un frastaglio.
     *Cavaliere* (`knight3d.js`): oltre 48° di pendenza del terreno non si entra in nessuna direzione.
     *Verifica*: regola «valichi» (nessuna parte di terra chiusa dalle pareti) e roccia tipo di paesaggio a sé:
     20 semi su 20 rispettano tutte le regole. Limiti: le cime innevate sembrano un po' «panettoni» (manca il
     dettaglio verticale delle pareti, ~8 m di griglia); strade, pedaggi e luoghi alle forcelle con la
     milestone dei luoghi.
   - *Versanti lunghi in montagna* (segnalato dall'utente: «un mare di schiuma», saliscendi continui). Le
     ottave fini del rilievo (350, 175, 88, 44 m) salendo da 600 a 1500 m si spengono del 60–97 % (`DETTAGLIO.
     versanti`); la forma la fanno le scale di 1,4 km e 700 m, come i versanti lunghi di Alpi e Montagne
     Rocciose. Conche chiuse per km²: montagna da 3,4 a 0,8, pedemonte da 3,3 a 1,4 (Tavullia 1,6); pendenza
     p50/p90 in montagna 15°/29° (prima 20°/34°). Collina e pianura invariate.
   - *Montagne lontane per orientarsi* (richiesta dell'utente): orizzonte esteso a 110 km (quarto anello, passo
     2 km, solo Carta più i gruppi montuosi; ~187 000 triangoli, 350–400 ms), camera fino a 130 km, foschia da 10
     a 170 km (a 100 km ~55 % del contrasto perso). Per il gioco, non per il realismo: curvatura con raggio 4
     volte quello vero (a 100 km −200 m invece di −680 m) ed esagerazione verticale che cresce con la distanza
     (nessuna fino a 20 km, ×1,4 oltre 100 km; applicata anche ai laghi dell'orizzonte). Seme 855588: dalla
     pianura a 91 km la catena principale (3370 m) si vede innevata; prima non si vedeva niente.
   Limiti noti: il limite delle nevi si calcola al caricamento della Scena (cambiando stagione dentro la
   Scena si aggiorna alla Scena successiva); niente alberi né rocce come oggetti (il bosco è un colore);
   paludi rare; le regole di varietà (deserto–neve, distese monotone) si verificano al passo 8.
8. **Regole di varietà e verifica automatica** (fase 8) su N semi, con esito per regola. Con i passi 3 e
   6 chiude l'accettazione.
   **Stato: fatto, da provare dall'utente.**
   - *Verifica* (`verifica.js`, `verificaVarieta`): tipi di paesaggio = biomi raggruppati (pianura, collina,
     bosco, montagna e roccia, neve e ghiaccio, deserto, palude, acqua). Regole: (1) ogni finestra di 40×40 km
     (passo 20 km; almeno metà terra; escluse quelle per più di metà neve o deserto) ha almeno 3 tipi, ognuno
     ≥ 2 % della finestra; (2) nessuna area uniforme più larga di 15 km senza un'interruzione (altro tipo,
     fiume, lago, mare; neve e deserto esclusi): diametro = 2 × distanza dall'interruzione più vicina;
     (3) deserto ad almeno 80 km dalla neve; (4) niente paludi sopra 300 m.
   - *Correzioni* (`carta.js`, fase 8, solo copertura, mai il rilievo; `VERSIONE_GENERATORE` =
     `m6-varieta-1`): deserto troppo vicino alla neve → pianura arida; al centro delle distese troppo ampie
     un grumo organico di 8–22 km² di un paesaggio compatibile (radura nel bosco, bosco in pianura e collina,
     bosco o pascolo in montagna, affioramenti di roccia), ripetuto finché la regola vale; nelle finestre
     con meno di 3 tipi un grumo del tipo plausibile che manca (bosco, roccia, collina, pianura; in tundra
     torbiere e rocce levigate; ultima scelta affioramenti di roccia, anche in steppa). I grumi crescono solo
     dove il paesaggio è ammesso (paludi sotto 250 m, boschi sotto il limite degli alberi).
   - *Esiti*: 30 semi su 30 rispettano tutte le regole (prima delle correzioni: 6–13 % di finestre povere,
     distese uniformi di 23–38 km, deserto–neve a 55–60 km in 2 semi su 6); generazione ≤ 2,7 s. Nella Carta
     l'esito della varietà è nel piede; il pulsante «Verifica 10 semi» genera 10 semi a caso nel Worker
     (~27 s) e riporta l'esito per regola (fiumi, punti panoramici, finestre, uniforme, deserto–neve,
     paludi) e i semi non superati.
   Limiti: i grumi sono solo copertura (un «bosco» o una «roccia» senza oggetti in scena); le soglie
   (40 km, 3 tipi, 15 km, 80 km) sono quelle del GDD, da tarare giocando.

### Decisioni prese con il piano
- **File:** `js/mondo/` con moduli ES **senza Three.js né DOM** (regola 9, e pronti per un Web Worker):
  `rumore.js` (generatore pseudo-casuale e rumori), `carta.js` (generatore), poi `verifica.js` e
  `scena.js` (blocco di quote per una Scena). La vista di sviluppo della Carta è `js/3d/cartaVista.js`.
  `terrain.js` esporterà la costruzione del terreno da una griglia in memoria.
- **Fuori da M6:** luoghi (castelli, villaggi, porti, rovine), strade e porti: vanno con la milestone
  «luoghi, fazioni e nomi generati». La fase 9 qui sotto resta come traccia. Della costa sì.
- **Castello** solo nella scena di prova di Tavullia fino a «rocca e borgo» (oggi verrebbe piazzato alla
  cieca, anche su un pendio o in un fiume).
- **Le fasi dal drenaggio ai luoghi (5–9) lavorano su una quota qualunque**, senza dipendere da come è
  stata creata: generatore oppure dati reali (modalità reale, sotto). La Scena si costruisce da un oggetto
  «Carta» (griglia di quote a 1 km + metadati), non dal generatore. Le correzioni di varietà devono poter
  agire solo sulla copertura (boschi, rocce, paludi), senza toccare il rilievo.
- **Determinismo anche tra browser:** hash su interi (`Math.imul`) e, nelle parti che decidono la forma
  del mondo, solo operazioni dal risultato esatto (`+ − × ÷`, `Math.sqrt`, `Math.floor`). [Probabile]
  `Math.sin`, `Math.exp`, `Math.pow` possono differire tra i motori JS, e l'erosione amplifica lo scarto.
- **Web Worker** solo se la generazione blocca la pagina per più di ~1–2 s (da confermare: è un
  cambio architetturale).
- Il passaggio Carta ↔ Scena di M6 è uno strumento di sviluppo: non costa tempo e non usa A*
  (viaggio, fase S2). La vista della Carta non è ancora la Carta del cronista (fase G3).

**Accettazione di M6:** camminando in una Scena generata, il terreno è
credibile quanto quello reale di Tavullia. Sulla Carta le regole di varietà del GDD sono rispettate,
con una verifica automatica: tipi di paesaggio per finestra, distanza tra deserto e neve,
estensione massima delle aree uniformi.

- **Tutto nel browser, dal seme.** Niente dati scaricati e niente dipendenze esterne: la regola 5
  resta com'è e il peso del gioco non cambia.
- **Determinismo.** Stesso seme, stesso mondo. Ogni Scena si rigenera identica dal seme e dalla
  posizione: non si salva il terreno, solo il seme.
- **Carta:** ~600×450 celle da 1 km (~270 000 celle). Per ogni cella: quota in metri, bioma,
  temperatura, umidità, segni di fiume e costa (strade e porti dopo M6, con i luoghi). [Probabile] La generazione richiede
  pochi secondi in JS; se blocca la pagina, si sposta in un Web Worker.
- **Fasi del generatore** (punto di partenza: `world.js` del 2D, commit `2c869fa`):
  1. rumore fBm, forma del continente e rumore *ridged* per le catene;
  2. quote in metri con una curva di distribuzione delle altezze;
  3. massicci isolati: pochi e sparsi, a cono irregolare;
  4. erosione semplificata a scala di Carta, per valli credibili [Ipotesi: da provare, è la parte
     più incerta];
  5. fiumi dal drenaggio sulla quota (flusso accumulato), con letto sempre in discesa; laghi nei
     minimi;
  6. temperatura (latitudine, quota, rumore) e umidità;
  7. biomi;
  8. correzioni per le regole di varietà e per gli accostamenti vietati;
  9. luoghi (castelli, villaggi, porti, rovine) con i vincoli di validità (**dopo M6**).
- **Scene:** blocco di 2×2 km ricavato dalla Carta per interpolazione liscia, più dettaglio
  procedurale su più scale coerente col bioma (rocce in montagna, calanchi in collina, fossi,
  stagni). I fiumi della Carta sono scavati nel blocco. Il dettaglio dipende dalle coordinate del
  mondo, non da quelle del blocco: tra un blocco e l'altro non ci sono giunture.
- **Stesso formato del terreno di oggi** (griglia di quote più metadati), costruito in memoria:
  `terrain.js` lo usa senza sapere se viene da un file o dal generatore.
- **Coordinate:** piano in metri, nessuna proiezione geografica. Ogni Scena usa coordinate locali
  centrate sul suo blocco: a centinaia di km dall'origine i numeri a 32 bit della scheda video
  farebbero tremare la scena.
- **Neve:** limite delle nevi da temperatura e stagione, applicato al colore del terreno nello
  shader.
- **Tavullia** resta in `assets/terrain/` come scena di prova, caricabile a parte con `?terreno=tavullia`
  nell'indirizzo (dal passo 3). `tools/dem` resta per rigenerarla e per tarare il
  generatore (es. confronto delle pendenze generate con quelle reali).
- **Architettura per area culturale:** la prima è quella attuale (mattoni, rocca); le altre si
  aggiungono con le aree culturali.

### Modalità reale (dopo M6, milestone a sé)

Seconda modalità di gioco (design in `docs/GDD.md` §2 *Il mondo*): **rilievo reale** di una regione,
con copertura, fiumi mostrati, clima, luoghi, nomi e fazioni generati dalle stesse fasi 5–9.
- **Dati scaricati quando servono** (eccezione alla regola 5 di `CLAUDE.md`, solo per questa modalità):
  tile **Terrarium** su AWS (`elevation-tiles-prod`, PNG decodificati dal browser senza librerie).
  Verificato (novembre 2026): leggibili da qualsiasi sito (`Access-Control-Allow-Origin: *`); in Italia
  la fonte è EU-DEM (~25 m), file fermi dal 2017; una tile a zoom 13 (~3,5×3,5 km) pesa ~100 KB, quindi
  100–400 KB per Scena; la Carta di 600×450 km a ~1 km richiede una decina di tile a zoom basso (~1 MB).
  Copernicus invece non è leggibile dal browser (niente intestazione CORS): resta per `tools/dem`.
- **Rischi:** servizio gratuito senza garanzie di durata (Mapzen ha chiuso nel 2018, le tile sono
  ospitate dal programma Open Data di AWS) → cache nel browser delle zone visitate e messaggio chiaro
  se il servizio non risponde; funziona solo online; attribuzione delle fonti nei crediti.
- **Proiezione:** nelle tile la scala varia con la latitudine (~10 % su 600 km nord-sud): riproiettare
  su un piano locale in metri, come fa `make_heightmap.py`.
- **Decodifica:** [Probabile] le correzioni di colore del browser alterano le quote; decodificare senza
  conversione di spazio colore e verificarlo.
- **Primo passo:** prova di fattibilità: scaricare Tavullia nel browser e confrontare quote e pendenze
  con `tavullia.bin` (Copernicus; Terrarium usa EU-DEM: dati diversi, qualità simile).
- I fiumi principali coincideranno con quelli veri: il drenaggio sulla quota reale li ritrova nelle
  valli che hanno scavato. Si sceglie quanti mostrarne, non dove.
- Copernicus e Terrarium includono edifici e alberi (modelli di superficie): i paesi veri lasciano
  piccoli rilievi dove nel gioco non ci sono.

## M7 — Rocca e borgo — fase corrente

> Ripresa dopo la chiusura della milestone «Prestazioni» (21/11/2026): i contenuti nuovi seguono le regole di
> `docs/PRESTAZIONI.md`, passo 6 (borgo, cavallo e persone insieme ≤ 3 ms GPU e ≤ 120 chiamate; case ≤ 1.500 / 200
> triangoli; componenti ripetuti in InstancedMesh condivise, ≤ 40 chiamate per il borgo; ≤ 8 materiali; niente
> interni; nessuna PointLight oltre le 4–6 previste) e ogni PR passa dal percorso di prova (`?seme=570549&prova`,
> anche con `&centro=` sul borgo).

> **Riallineato (novembre 2026)** alla regione di 120×90 km, alla gerarchia di densità, al castello di valle,
> ai valichi tra grandi valli e al tempo ×10 (`docs/GDD.md` §2 «Dimensioni e densità», «Valichi e forcelle»;
> §3 «Ritmo del tempo nelle Scene»). Design di partenza: M4, «Dopo la valutazione — rocca, borgo ed edifici»
> e «stile simil-realistico da codice»; `docs/GDD.md` §3 *Interazione con luoghi*; `docs/EARLY_GAME.md` §1 e §3.

**Obiettivo.** Nella regione generata ci sono **2–3 rocche** con il loro borgo murato, su siti credibili e
diversi, di importanza e quindi di grandezza diversa. Il garzone parte **fuori dalla porta del borgo di un
castello di valle**: dal borgo vede la rocca sopra le mura e, alle spalle, il crinale a 3–5 km. La sessione
tipica del GDD (15–20 minuti reali) è salire dal castello al crinale per guardare oltre. Ci si cammina
attorno e dentro le due cinte; le porte degli edifici aprono la Carta del cronista (segnaposto); di notte le
finestre e le torce si vedono da lontano; qualche persona sta al suo posto. Da lontano (orizzonte) e sulla
Carta la rocca si riconosce.

**Cosa offre oggi il mondo** (M6 chiusa, più i ritocchi fatti durante M7):
- regione di **120×90 km** a celle di 1 km; oltre il confine la Carta prosegue a specchio; generazione
  0,2–0,6 s;
- quota del mondo come funzione pura delle coordinate (`quotaMondo` + `scavaFiumi` in `scena.js`), usata dal
  blocco, dall'orizzonte, dalla Carta zoomata e dalla ricerca dei percorsi dei fiumi (`fiumi.js`);
- fiumi (bacino ≥ 150 km²) e **torrenti** (≥ 20 km²) in `carta.fiumi`, laghi; nelle Scene il fiume scava una
  fascia di versanti larga R = 120 + 8·semilarghezza m (~240–600 m) dall'asse;
- catene con **zoccolo** (fondovalle che salgono addentrandosi), **valichi tra grandi valli contrapposte**
  (`carta.valichiCarta` → `carta.valichi`, 0–4 per mondo nei 30 semi di prova, 85 % con sentinella), 2–6
  gruppi montuosi con pareti e forcelle;
- siti delle rocche (`carta.luoghi`, passo 1): **la partenza è un castello di valle in 30 semi su 30**
  (quota 155–1284 m, crinale +800 m a 2,9–5 km, fiume a 1–4,2 km o nessuno entro 6, lavoro di terra 2,5–12 m
  sotto la rocca e 5–25 m sotto il borgo, pendenza del borgo 3–15°); gli altri siti sono quasi sempre di
  fiume, a volte d'altura, di valle o di valico (valico in 4 semi su 30: i valichi sono pochi);
- orizzonte in quattro anelli fino a 110 km (il quarto, a passo 2 km, usa la sola Carta); di notte la nebbia
  chiude la vista a ~110 m: restano solo le luci;
- tempo ×10 nelle Scene, la Carta costa lo stesso tempo di gioco; il calendario scorre per ciò che si fa;
- **il cavaliere non esce dal blocco di 2×2 km** della Scena: da una Scena all'altra si passa solo dalla
  Carta. Il crinale del castello di valle (3–5 km) oggi non si raggiunge di persona.

Il castello di M4 (`castle3d.js`) misura il terreno sotto di sé e si adatta; `componiSuolo` unisce terreno e
superfici costruite. Mancano: il terreno modellato sotto rocca e borgo, tutto ciò che è borgo, e l'uscita dal
blocco.

### Decisioni tecniche

**1. Siti** (fatto, passo 1; dettagli e misure nel passo). Fase 9 ridotta del generatore nel Worker
(`js/mondo/luoghi.js`), in cache con la Carta. Quattro caratteri: **valle** (≤ 5 km da un crinale 800 m più
alto: terrazzo o dosso di fondovalle, senza obbligo di cima né dominanza), **fiume**, **valico** (sotto un
valico, a 8–15 km), **altura**. 2–3 siti a ≥ 15 km (scalini 12 e 8), nelle zone a 25–80 km dal centro; la
partenza è di valle ed è un castello di casata, degli altri il migliore è la sede maggiore se sono tre.
Densità del GDD: i luoghi maggiori stanno a ~18 km e saranno 30–40 per mondo con la milestone dei luoghi,
che riuserà questo punteggio; in M7 se ne costruiscono 2–3.

**2. Terreno sotto: due livelli.**
- *Grosso, nel mondo* (terrapieni e terrazze, ~10–30 m di scala): `spianaLuoghi(carta, x, z, h)` dopo
  `scavaFiumi`, funzione **pura** delle coordinate e dei soli dati di `carta.luoghi` (quote dei piani e
  contorni calcolati una volta nel Worker). Dentro ogni contorno (rocca, terrazze del borgo) la quota è quella
  del piano; fuori si raccorda al terreno con una scarpata morbida larga in proporzione al salto (sotto ~25°)
  tranne dove c'è un muro di contenimento. Un **solo punto** per la quota finale (`quotaFinale`): oggi la
  stessa somma è ripetuta in blocco, orizzonte e Carta zoomata, e dimenticarne uno darebbe una giuntura.
  [Certo] se la modifica è pura, blocchi vicini e orizzonte combaciano come oggi. Il quarto anello
  dell'orizzonte (solo Carta) la ignora: a 18+ km un terrapieno di 100 m non si vede.
- *Fiumi:* i contorni e le loro scarpate stanno **fuori dalla fascia del fiume** (R dall'asse più 50 m), così
  `spianaLuoghi` non tocca alvei e versanti scavati e il percorso dei fiumi (calcolato sulla quota senza
  luoghi) resta valido. Nei siti di valle con il fiume vicino (fino a 350 m) il borgo si allunga sul lato
  opposto o il sito si scarta: lo decide il passo 2 nel Worker, con un controllo nella verifica dei luoghi.
- Il piano più basso sta almeno 6 m sopra il pelo dell'acqua del fiume più vicino (niente borgo
  allagabile).
- Solo operazioni esatte (`+ − × ÷`, `sqrt`, `floor`), come le altre parti che decidono la forma del mondo.
- *Fine, costruito* (cortili, passaggi, rampe, scalini, sotto il metro): `quotaSuolo` di rocca e borgo
  tramite `componiSuolo`, come in M4. La griglia del terreno (7,8 m) non fa muri né scalini: lo stacco
  verticale lo fanno i **muri di contenimento** (mesh), il terreno sotto resta appena più basso e coperto.

**3. Cinte ed edifici.**
- *Importanza e grandezza* (richiesta dell'utente): tre classi, decise per ora dal sito e più avanti dalla
  fazione con la milestone dei luoghi:

  | Classe | Rocca | Borgo | Case | Edifici |
  |---|---|---|---|---|
  | *rocca minore* | ~36×32 m, mastio, niente sala d'armi | ~80×60 m, 1–2 terrazze | 8–14 | stalla, taverna, fabbro; cappella nella rocca |
  | *castello di casata* (corte minore) | ~48×40 m | ~130×90 m, 2–3 terrazze | 20–30 | tutti quelli sotto |
  | *sede maggiore* (corte maggiore) | ~60×50 m, doppio mastio o palazzo | ~200×130 m, 3–4 terrazze, seconda piazza | 40–60 | tutti, più chiesa nel borgo e loggia grande |

  La sede maggiore si costruisce in M7 solo se il budget di prestazioni regge (passo 5). [Ipotesi] misure e
  numeri delle case da tarare a occhio. Città più grandi restano fuori.
- *Disposizione secondo il carattere del sito* (orientamento dal sito: `verso` del borgo):
  - **valle** (la partenza): rocca su un terrazzo o sperone del versante, sopra il fondovalle; borgo ai suoi
    piedi, allungato lungo la valle su 1–2 terrazze; porta del borgo verso la via di fondovalle; il crinale
    sopra la rocca è la meta della sessione;
  - **fiume** e **altura**: rocca in cima, borgo addossato più in basso sulle terrazze, porta verso valle o
    verso il fiume;
  - **valico**: rocca allo sbocco della valle, borgo lungo la valle; porta verso la strada che sale al passo.
  In tutti i casi due porte: **porta del borgo** (torre-porta) e **porta della rocca**, che si apre nel borgo;
  via principale dalla porta del borgo alla piazza del mercato e su fino alla rocca.
- *Rocca*: mastio, sala d'armi (palazzo a due piani), armeria, cappella con campaniletto, pozzo; torri
  angolari tonde come in M4. *Borgo*: stalla (lunga e bassa, vicino alla porta, con recinto), taverna (con
  insegna), mercato (piazza con banchi e loggia), fabbro (bottega con forgia), guaritore, case a schiera nei
  lotti lungo la via. Mura del borgo più basse (~7 m) con torri quadrate ogni ~35 m.
- *Codice*: rocca e borgo sono **oggetti del mondo**, costruiti da `carta.luoghi` in coordinate del mondo e
  posati nella Scena con lo spostamento del blocco, non parti del blocco: così sopravvivono al cambio di
  blocco (punto 6) e un sito tagliato dal bordo non è un caso speciale. `castle3d.js` si generalizza (piano e
  misure dal sito, non misurati), `js/3d/borgo3d.js` per borgo ed edifici (approvato). Le case nascono da
  pochi tipi variati per lotto.
- *Prestazioni* (60 FPS su PC medio): [Probabile] il limite vero sono le chiamate di disegno, non i
  triangoli. Castello di casata: ≤ 80 chiamate, ≤ 80 000 triangoli; la sede maggiore con le stesse chiamate.
  *Instancing* per merli, finestre, coppi, banchi, case dello stesso tipo; geometrie fuse per materiale
  (`BufferGeometryUtils`, approvato); collisioni in una griglia; la camera fa il raycast su sagome semplici.
  F3 mostra chiamate, triangoli e luci attive.
- *Stile*: simil-realistico da codice: mattoni per rocca e mura, intonaco chiaro e mattoni per le case,
  coppi, legno scuro; texture generate a runtime (canvas); `MeshStandardMaterial` dove rende. Un'unica area
  culturale.

**4. Porte, luci, persone.**
- *Porte*: entro ~1,5 m e rivolti verso la porta, «E: entra — Taverna»; `E` apre la **Carta del cronista
  segnaposto** (overlay in stile manoscritto: nome dell'edificio, una riga, «Esci»). Mentre è aperta il tempo
  non scorre e per ora entrare non costa tempo: le azioni con la loro durata (GDD §3, «il calendario scorre per
  ciò che si fa») arrivano con la Veglia. Niente interni 3D; le case generiche non si aprono.
- *Luci notturne*: torce alle due porte e su alcune torri, finestre accese (meno dopo Compieta), taverna e
  forgia più luminose; materiali emissivi con `fog: false`, a istanze (di notte la nebbia chiude a ~110 m: sono
  l'unica cosa visibile). `PointLight` vere solo per le **4–6 sorgenti più vicine** al cavaliere.
- *Persone segnaposto*: figure semplici ferme ai loro posti (stalliere, oste, fabbro, mercante, guaritore, due
  guardie per porta) e **alcuni popolani che camminano** su percorsi fissi (2–3 nel borgo minore, fino a 6–8
  nella sede maggiore), che girano attorno al cavaliere. Di notte restano le guardie. Simbolo sopra la testa
  entro 8–10 m, «E: parla — Oste» da vicino; stesso overlay. Collisione a cerchio.

**5. Da lontano e sulla Carta.**
- Il terrapieno è nel mondo: l'orizzonte lo mostra da sé. **Sagoma** semplificata (mastio, torri, cinta, tetti:
  < 1 000 triangoli, 2–3 chiamate) sulla superficie degli anelli fino a 6 km; fino a 18 km solo il mastio;
  oltre niente (a 18 km un mastio di 22 m è sotto il pixel). Di notte le luci come punti che ignorano la nebbia,
  fino a ~10 km.
- *Carta* (fatto al passo 1): segni per classe, partenza cerchiata, valichi, «Vai alla rocca». Con lo zoom il
  terrapieno comparirà nelle curve di livello. Niente nomi (milestone luoghi).

**6. Uscire dal blocco** (nuovo, [da decidere con l'utente]). La sessione del GDD «dal castello al crinale»
chiede di camminare 3–5 km; oggi il cavaliere si ferma al bordo del blocco di 2×2 km. Proposta: quando il
cavaliere si avvicina al bordo (~400 m), si genera nel Worker il blocco centrato su di lui e si sostituisce
quello vecchio senza stacchi (la quota è pura: blocchi e orizzonte combaciano già, giuntura 0 m; orizzonte e
acque si ricostruiscono, 250–400 ms oggi, da spostare nel Worker o da spezzare tra i fotogrammi); rocca e
borgo restano perché sono oggetti del mondo. Il castello di valle senza questo passo resta una partenza
con un crinale visibile ma irraggiungibile.

**7. Fuori da M7** (milestone «luoghi, fazioni e nomi»): altri castelli (30–40 per mondo), villaggi, città,
porti, monasteri; le **torri di sentinella dei valichi** (oggi solo un dato); strade, ponti e guadi (resta il
viottolo dalle porte); nomi e fazioni; azioni della Veglia ed eventi degli edifici; interni; cavallo;
vegetazione e oggetti sparsi (milestone successiva); altre aree culturali; nebbia della conoscenza sulla
Carta. Tavullia resta la scena di prova con il castello di M4.

### Passi (ciascuno provato nel browser)

1. **Siti sulla Carta.** Fase 9 ridotta, `carta.luoghi` con 2–3 siti e la loro classe, segni e «Vai
   alla rocca» nella vista della Carta; pulsante di sviluppo che mostra i candidati con il punteggio.
   *Prova:* su più semi i segni stanno su siti di valle, fiume, valico o altura, mai in acqua né sulle
   pareti, a ≥ 15 km tra loro; verifica su 30 semi.
   **Stato: fatto.** Qui sotto la cronologia del passo, con le modifiche al generatore fatte nel frattempo
   (valichi, zoccolo, torrenti, regione di 120×90 km, tempo): le misure più vecchie (zone a 90 km, distanza
   20 km, 600×450 km) valgono per il mondo di allora. Stato attuale riassunto in «Cosa offre oggi il mondo».
   *Prima versione* (mondo di 600×450 km): `js/mondo/luoghi.js` (`scegliLuoghi`, `aggiungiLuoghi`), chiamato
   nel Worker dopo `generaCarta` e salvato nella cache con la Carta (`VERSIONE_GENERATORE` = `m7-siti-1`).
   - *Stadio 1:* ~55 000–65 000 celle ammesse; si affinano le 260 stime migliori, 65 per ognuna delle zone
     a 90, 140, 220 e 400 km dal centro.
   - *Valichi* (`trovaValichi`, deciso con l'utente: vedi `docs/GDD.md` §2, «Valichi e forcelle»): selle
     della Carta (≥ 4 cambi di segno attorno alla cella) **tra 1000 e 2000 m** i cui due lati bassi scendono,
     seguendo il flusso, a due fiumi diversi almeno 300 m più in basso, che lungo i fiumi si raggiungono solo con un giro
     ≥ 25 km (o mai: foci diverse); ai due lati alti il crinale sale di ≥ 100 m entro 5 km; niente pareti
     dei gruppi montuosi nel raggio di 2 km (lì sono forcelle). Dei valichi entro 10 km il più basso.
     L'85 % ha una **sentinella** (`presidio`; la costruzione arriva con la milestone dei luoghi).
     30 semi: 12–57 valichi per mondo, 0–12 entro 90 km dal centro. **L'85 % sta su una catena**: le valli
     che si addentrano dai due lati lasciano una sella tra le testate. 119 delle 127 catene lunghe (crinale
     oltre 1500 m esteso più di 40 km) hanno almeno un valico. `carta.valico` resta il nome delle celle di
     forcella (legenda corretta: «forcella»).
     *Prima versione (scartata dall'utente):* senza limiti di quota e con 250 m sui fondovalle, 74–157
     valichi per mondo, il 10 % sotto i ~450 m: selle di collina, che sono semmai siti da rocca.
     *Correzione:* la prima versione del passo misurava la vicinanza alle **forcelle** (8–12 km): sono a
     2300–3400 m e la terra sotto i 900 m sta a 5–17 km, quindi in 30 semi nessun sito «di valico».
     L'utente ha fatto notare che il criterio era sbagliato in sé (le forcelle raramente si presidiano).
   - *Valichi tra grandi valli e zoccolo* (richiesta dell'utente, passata dalla sessione M5; seme 171289: le
     valli che salivano da lati opposti della catena non avevano un passo tra le testate, che invece cadeva tra
     valli indistinte). Misurato: le selle tra quelle testate stavano a 2248 e 2666 m (fuori dai 1000–2000 m
     accettati) e i fondovalle restavano 1500–1900 m sotto il crinale fin quasi ai suoi piedi. Nessun parametro
     esistente cambiava il profilo (erosione: solo più laghi; pedemonte: nullo o contrario); la causa era la
     formula dei fianchi delle catene, di soli contrafforti. Due cambi in `carta.js`
     (`VERSIONE_GENERATORE` = `m7-valichi-3`):
     1. **Zoccolo dei contrafforti** (`FORMA.catene.zoccolo` = 0,3): il piede della catena ha una base continua.
        Quota mediana dei fiumi a 0-3 / 3-6 / 6-10 / 10-20 km dalla terra sopra i 2000 m: seme 171289 da
        1687/1062/675/354 a 1928/1381/1017/381 m, seme 48213 da 1789/1336/886/560 a 1875/1389/1092/626 m; fasce
        di quota e laghi quasi invariati.
     2. **Valichi tra grandi valli contrapposte** (`valichiTraValli`, prima del drenaggio, regola nuova
        approvata dall'utente): testate dei fiumi (bacino ≥ 150 km², 250–1600 m, entro 15 km da terra oltre
        1700 m); coppie a 6–32 km di sistemi diversi (foci diverse o giro ≥ 25 km); il passo è il punto più alto
        del percorso che minimizza la quota massima in un corridoio di 3 km, almeno 400 m sopra entrambe le
        testate e al più a 3000 m. Se è sopra i 2000 m si scava un intaglio (dolce lungo il passaggio, che
        sale ai lati) fino a 2000 m, al più di 500 m: valichi alti fino a ~2500 m, senza chiusura invernale
        (deciso con l'utente). Punteggio: quota del passo, salita dalla testata più bassa, distanza tra le
        testate, grandezza delle due valli; al più un valico ogni 20 km. Drenaggio, fiumi e laghi si
        calcolano poi sul rilievo scavato. Nessun gruppo montuoso a meno di 9 km da un valico.
        `luoghi.js` (`valichiDaCarta`) li rende `carta.valichi` (con sentinella all'85 %); `trovaValichi`
        resta per le Carte senza `valichiCarta`. 12 semi: 8–21 valichi, 0–5 alti; tutte le verifiche
        (fiumi, panorami, varietà, luoghi) superate; generazione 3,2–4,3 s (prima 2,6–3,4).
        Seme 171289: un valico a 1389 m verso (327, 98), vicino alla prima coppia indicata dall'utente, e uno a
        1799 m verso (362, 104), vicino alla seconda. Con lo zoccolo il rilievo cambia, quindi le sorgenti
        indicate sullo screenshot non sono più le stesse. Limite: le testate di questi due valichi restano
        basse (265–404 m e 219–869 m), quindi la salita all'ultimo tratto è ancora ripida.
   - *Valichi come i passi dolomitici* (segnalato dall'utente: valichi in cima a cucuzzoli isolati, con la strada
     che ci sale per niente). Misurato sul rilievo delle Scene (seme 395728): due valichi su quattro erano cime
     (il terreno scendeva di oltre 150 m in 10–12 direzioni su 16). Causa: il passo era il punto più alto di un
     percorso «minimax» in un corridoio di 3 km tra due testate; se la via bassa passava fuori dal corridoio,
     il punto cadeva su un rilievo. Nuovo calcolo (`valichiTraValli`, `VERSIONE_GENERATORE` + `valichi-2`):
     ogni cella appartiene alla valle in cui scende (il ramo di fiume tra due confluenze, bacino ≥ 40 km², entro
     10 km di discesa); tra due valli confinanti il valico è il punto più basso del loro spartiacque. Condizioni:
     giro lungo i fiumi ≥ 20 km (o sistemi diversi), passo 250 m sopra le due valli, tra 900 e 3000 m, entro
     8 km da terra oltre 1700 m (una sella in collina non è un valico), cresta ai lati almeno 250 m sopra il passo
     scavato entro 4 km. Punteggio: salita dalla valle più alta, pendenza della salita più ripida, grandezza
     delle valli, strada risparmiata. Poi `luoghi.js` (`sellaFine`) cerca la sella sul rilievo delle Scene, su
     una griglia di 125 m tra due punti giù per le due discese. 10 semi: 1–5 valichi (881–2526 m), nessun
     cucuzzolo, 14 su 24 selle simmetriche (scende da due lati opposti e sale dagli altri due); gli altri sono
     colli asimmetrici sul fianco di un massiccio o varchi dove si toccano tre valli. Strade: ogni valico è
     collegato alle sue valli; regole del generatore tutte superate, tempi invariati.
   - *Valli più alte e torrenti* (richiesta dell'utente: fondovalle a 400 m sotto montagne di 2000 m sono rari;
     le sorgenti partono quasi dalle cime). Misurato: le «sorgenti» visibili erano solo i punti dove il bacino
     arriva a 150 km² (già un fiume); i torrenti esistevano nel drenaggio ma non si disegnavano. Due cambi
     (`VERSIONE_GENERATORE` = `m7-torrenti-1`):
     1. Zoccolo dei contrafforti a 0,6: fiumi a 3-6 / 6-10 km dalla terra sopra i 2000 m a 1534/1250 m (seme
        171289; erano 1062/675 senza zoccolo) e 1523/1326 m (48213); laghi 71 e 55, fasce invariate.
     2. **Torrenti** (`tracciaTorrenti`, `DRENAGGIO.torrente` = 20 km²): corsi da 20 a 150 km² dalle sorgenti
        al fiume (o torrente) in cui confluiscono, punti delle celle spostati da un rumore (niente righe a
        griglia), ultimo punto esattamente sul corso ricevente (le Scene raccordano lì il letto). Sono in
        `carta.fiumi` dopo i fiumi (`carta.sogliaTorrente`); nelle Scene alvei più stretti (semilarghezza 1,5 +
        0,6·√bacino m: ~8 m a 20 km²); nella Carta una classe sottile. Le rocche contano solo i fiumi. In
        montagna i torrenti nascono a ~1700 m, 750–1000 m sotto la cima vicina (come nelle Alpi). Costo:
        ~2250 corsi in più, `fiumiScena` ~0,9 s alla prima Scena (prima ~0,6). Valichi: testate fino a 2100 m e
        250 m sotto il passo (con le valli più alte i 400 m ne lasciavano 2–11 per mondo): 5–18 per mondo.
   - *Fiumi diritti nella Carta zoomata* (segnalato dall'utente): in pianura il percorso a costo minimo era una
     retta che perdeva le anse della Carta. Ora il tratto tiene il tracciato della Carta se questo non sale mai
     più di 6 m sopra il livello atteso (`FIUMI_SCENA.tratti.tieni`), e altrove il richiamo verso le anse è più
     forte (`PERCORSO.attrazione` 3).
   - *Carta, il cavaliere* (richiesta dell'utente): freccia della direzione in cui guarda e cerchi a 10 e 20 km
     con il tempo di marcia sulla Carta (~15 min/km, `docs/GDD.md` §3: 2,5 e 5 h).
   - **Mondo regionale di 120×90 km** (deciso con l'utente, `docs/GDD.md` §2 «Dimensioni e densità»;
     `VERSIONE_GENERATORE` = `regione-1`). A 600×450 km tra due luoghi d'interesse c'erano ore di cammino. Si
     rimpicciolisce la scala d'insieme, non quella locale:
     - *forma*: deformazione 60 km, continente 70, scala grande 160, bordo 10; catene: linea 110 km, maschera
       140, spina e pedemonte più larghi in proporzione (0,2 / 0,5), contrafforti ogni ~7 km (`dettaglio` 7,
       erano 32: creste e valli ogni ~16 km) più alti (1,4), zoccolo 0,55; colline 40 km, poggi 30 km;
     - *clima*: latitudine completa (−4 → 21 °C) su 90 km, rumore 60 km, umidità con il mare a 25 km e il sud
       più secco (con il mare sempre vicino la zona arida c'era in 6 mondi su 30; ora in 24); boschi a grumi
       di 14 km;
     - *varietà*: finestre di 25×25 km (passo 12); deserto–neve sostituita da «sabbia e neve non si toccano»
       (≥ 4 km); distese ≤ 15 km come prima;
     - *gruppi montuosi* 2–6 (uno ogni 300 km² oltre 1400 m), *valichi* testate da 40 km² entro 10 km dai monti,
       coppie a 5–25 km, uno ogni 15 km; *rocche* zone a 25–80 km dal centro, distanza 15/12/8 km, bordo 8 km;
     - *castello di valle* (regola dell'utente): carattere `valle` per i siti a ≤ 5 km da un punto 800 m più
       alto (niente obbligo di cima né dominanza: terrazzo di fondovalle, fiume anche a 350 m); la partenza è
       di valle, e la verifica dei luoghi lo chiede quando il mondo ha montagne;
     - *bordo*: oltre il confine la Carta prosegue a specchio nelle Scene e nell'orizzonte (con l'orizzonte a
       110 km il bordo si vede quasi sempre; ripetuta, l'ultima cella dava una striscia piatta);
     - *Carta*: rilievo delle Scene e fiumi come nelle Scene già da zoom ×1 (la Carta intera è 120×90 celle).
     Misure su 30 semi: generazione 0,2–0,6 s (era 3–4,7 s); 1–7 catene; fondovalle→crinale (+800 m) in
     montagna con mediana 2,2–6,4 km; 29 su 30 rispettano tutte le verifiche (fiumi, panorami, varietà, luoghi):
     nel seme 79190 la sola catena ha i fondovalle a 5–9 km dal crinale e nessun sito di valle. Un salvataggio
     del mondo di prima fuori dalla regione riparte dalla rocca.
   - *Salita più rapida* (richiesta dell'utente: 100 m di dislivello in ~3 minuti di corsetta, crinale a 800 m in
     20–25 minuti): in salita la curva della velocità è più dolce (`pendenzaKSalita` 0,7, minimo ×0,7 invece di
     ×0,5); discese e piano invariati. Minuti di corsetta per 100 m di dislivello a 10°/15°/20°/30°: da
     4,3/3,4/3,0/2,1 a 3,4/2,4/2,0/1,5 (un escursionista vero: ~10). Crinale a 800 m in ~12–16 minuti.
   - *Tempo nelle Scene ×10* (deciso con l'utente): un solo rapporto, da fermi come in movimento, di giorno come
     di notte (prima ×15 e ×60). Dal castello al valico ~3,5 ore di gioco in ~20 minuti reali; la Carta conta già
     la salita (`VIAGGIO.METRI_PER_METRO_SALITA`). M6 chiusa dall'utente.
   - *Carta allineata alla Scena* (deciso con l'utente): `VIAGGIO.METRI_PER_PASSO` 3456 m (un Passo = 18 minuti
     reali di corsetta a ×10), ~52 minuti di gioco per km, ~10 km al giorno a piedi; a cavallo ~2× (solo regola:
     `METRI_PER_PASSO_CAVALLO`, il cavallo è una milestone futura). Forza invariata (100 ≈ 30 km camminando: una
     giornata di marcia ne consuma ~metà–tre quarti). Cerchi della Carta con ore e giorni di marcia. Tasto T
     (Avanza) solo per i test, tolto dall'aiuto a schermo: il tempo passa muovendosi, agendo o riposando.
   - *Prova: andature più veloci* (richiesta dell'utente: di persona 1 km costava ~5 minuti reali di corsetta, e
     tra un luogo e l'altro non c'è ancora nulla): corsetta 4,5 m/s (era 3,2), scatto 8 (era 6); 1 km in ~3,7 e
     ~2,1 minuti reali. Carta riallineata: `METRI_PER_PASSO` 4860 (~37 minuti di gioco per km, ~14 km al giorno).
     La cura vera resta la densità (cose della campagna ogni 0,5–1,5 km, dettagli ogni 100–300 m).
   - *Punti panoramici solo sulle alture* (segnalato dall'utente: la pianura aperta era piena di triangoli, la
     collina quasi vuota). La griglia ogni 3 km faceva passare i punti di pianura, che vedono le montagne lontane
     già da terra. Ora (`verificaPanorami`): candidati solo se almeno 40 m sopra la media dei dintorni a 2 km;
     una direzione conta solo se dall'altura si vede qualcosa tra 15 e 30 km che dal piede non si vedeva; sulla
     Carta il punto migliore ogni 10 km. Con 20–30 km la copertura scendeva a 85–89 % in 5 semi su 30 (le colline
     si coprono tra loro); con 15–30 km: 95,7–98+ %, tutti i 30 semi oltre il 90 %.
   - *Fiumi su terrapieni nel mondo regionale* (segnalato dall'utente). Misurato (seme 48213): nel 23 % dei punti
     il pelo dell'acqua stava più di 5 m sopra il terreno a lato (p99 48 m), e l'argine lo reggeva su un terrazzo
     con una scarpata. Cause: il letto dei tratti tenuti dalla Carta veniva dalla Carta levigata (più alta del fondo
     vero), la sorgente pure, e la media monotona lasciava il fiume sospeso sulle conche lungo la via. Ora il letto
     segue sempre il terreno della Scena e non sta mai sopra quello incontrato (dove serve scende, poi non risale);
     sorgente al terreno vero; il percorso preferisce il fondovalle (costo se a 80 m di lato il terreno scende);
     il tracciato della Carta si tiene solo se corre sul fondo; argine più ripido (0,4) e media mobile più corta.
     Terrapieni oltre 5 m: 23 → 10 % (48213), 21 → 8,5 % (855588); p99 48 → 24 m; risalite 0, giuntura 0 m.
   - *Stadio 2:* il punto più alto della cella (griglia di 50 m, poi 10 m) deve essere **una cima vera**:
     nulla più alto entro 150, 300 e 450 m (16 direzioni). Senza questa regola il primo sito del seme 48213
     era un dosso a 469 m ai piedi di un rilievo di 522 m a 400 m di distanza, e il borgo cadeva nella sella.
     Poi lavoro di terra su 52×52 m (rocca) e 90×130 m (borgo, nella migliore delle 8 direzioni in discesa),
     pendenza media del borgo, dominanza sull'anello a 1,5 km, distanza esatta dal segmento di fiume più
     vicino e dal valico più vicino (conta solo se il sito sta più in basso del valico: 15 km pieno, 25 km
     nullo). Vicino a un valico il sito può salire fino a 1300 m (altrimenti 900); per zona 20 posti
     riservati ai candidati vicino a un valico. Direzioni e gradi senza trigonometria (costanti scritte e
     arcotangente approssimata).
   - *Scelta:* il migliore nella zona più vicina al centro (partenza, castello di casata), poi uno di
     carattere diverso (fiume, valico, altura) e il migliore rimasto, a ≥ 20 km (scalini 15 e 10 km, zone più
     larghe se non bastano). Degli altri due, quello col punteggio più alto è la sede maggiore.
   - *Verifica* (`verificaLuoghi` in `verifica.js`, regola «rocche» anche in «Verifica 10 semi»): almeno 2
     siti su terra, non sulle pareti né vicino al bordo, ≥ 0,9 km dai fiumi, lavoro di terra e pendenza nei
     limiti, ≥ 10 km tra loro. **30 semi su 30: 3 siti, sempre allo scalino migliore** (zona 90 km,
     distanza 20 km), **in 26 su 30 almeno uno di valico** (negli altri 4 nessun valico entro ~110 km dal
     centro); 400–600 ms per Carta nel Worker, valichi compresi. `VERSIONE_GENERATORE` = `m7-valichi-2`.
     Le catene non sono una barriera fisica: fuori dalle pareti dei gruppi montuosi ci si può arrampicare
     ovunque (pendenza p90 in montagna ~34°). Che si passi dai valichi lo deciderà il costo del viaggio
     sulla Carta (pendenza, quota, neve) con le strade, nella milestone dei luoghi.
   - *Carta:* valichi come «)(» arancio, con un quadratino se hanno la sentinella; sotto il puntatore quota,
     altezza sui fondovalle, giro per le valli. Torre rossa più grande secondo la classe, partenza cerchiata, verso del borgo da zoom ×8;
     sotto il puntatore classe, carattere, quote, dominanza, lavoro di terra, pendenza, distanze; pulsanti
     «Vai alla rocca» (alla successiva, a ogni clic) e «Candidati» (siti validi non scelti, più chiari col
     punteggio più alto). Esito nel piede.
   - *Partenza:* nuova partita nella Scena centrata sulla rocca di partenza, 170 m più in basso verso il
     borgo, rivolti alla cima. Provvisorio: un'asta con bandiera (colore della classe) sulla cima di ogni
     rocca nel blocco.
   Limiti: la rocca di valico è vicina al valico e più bassa, ma non si controlla ancora che stia proprio
   nella valle che sale al passo; le partite salvate nel mondo generato riprendono dove erano (il terreno
   non cambia fino al passo 2).
2. **Terrapieno nel mondo.** `spianaLuoghi`, contorni e quote dei piani nel Worker (dentro `carta.luoghi`),
   il punto unico `quotaFinale`; contorni come rettangoli arrotondati; fascia dei fiumi rispettata e piano
   più basso ≥ 6 m sopra l'acqua (controlli nella verifica dei luoghi). *Prova:* sul castello di valle di
   partenza si vedono i piani e le scarpate; nessuna giuntura con il blocco accanto e con l'orizzonte; la
   Carta zoomata mostra il terrapieno; F3: salto e pendenza massima delle scarpate.
   **Stato: fatto, da provare dall'utente** (`VERSIONE_GENERATORE` = `m7-terrapieno-1`).
   - *Piani* (`luoghi.js`, `pianifica`, nel Worker dopo la scelta dei siti): piano della rocca (classe minore
     40×36 m, casata 52×46, maggiore 64×56) alla quota (massimo + media)/2 del terreno sotto; borgo subito
     dopo, lungo il verso (60×80, 90×130, 130×200 m) diviso in 1–2, 2–3 o 3–4 terrazze secondo il dislivello
     (una ogni ~6 m), ciascuna alla quota media del suo terreno, mai più alta della precedente; la rocca
     almeno 3 m sopra la prima terrazza. Si provano le 8 direzioni del borgo e si tiene quella col minor
     lavoro di terra (scarto medio piano–terreno; la direzione dell'affinamento ha uno sconto del 20 %).
   - *Fiumi:* prima `raffinaZona` attorno al sito (percorsi come nelle Scene, 50–150 ms per 3 siti); una
     direzione si scarta se nel piano o nella sua scarpata `scavaFiumi` cambia la quota o c'è acqua (fiumi
     **e torrenti**). Il piano più basso sta almeno 6 m sopra il pelo d'acqua più alto entro 300 m (si alza
     fino a 12 m, oltre la direzione si scarta). Se nessuna direzione va bene, il sito si scarta e la scelta
     si ripete. 30 semi: nessun sito scartato, nessun piano da alzare; scelta e piani 0,23–0,52 s.
   - *Quota* (`scena.js`): `quotaFinale` = `spianaLuoghi(scavaFiumi(quotaMondo))`, usata dal blocco e dalla
     Carta zoomata; l'orizzonte applica gli stessi due ultimi passi (ha un suo ramo «solo Carta»).
     `spianaLuoghi` è un **terrapieno a 25°**: per ogni piano la quota resta tra q − d·tan 25° e
     q + d·tan 25° (d = distanza dal contorno, rettangolo arrotondato): riporto dove il terreno è più basso,
     sterro dove è più alto; oltre la scarpata del piano (salto × 2,15 + 10 m, 15–120 m) si torna al terreno
     naturale in 30 m. Tra due piani vicini vince il più basso, che resta piatto fino al bordo; nel più alto il
     terreno scende a 25° verso il bordo comune: lì andranno pavimento costruito e muro di contenimento (passi
     3–4), e il terreno resterà sotto e dietro. *Scartati:* una scarpata a raccordo morbido (smoothstep)
     sommava la pendenza del versante: 31–44° in scena invece di 25°; un gradino netto tra le terrazze dava,
     sulla griglia di 7,8 m in diagonale, un bordo seghettato.
   - *Misure* (5 semi, blocco centrato sulla partenza): scarpate e raccordi 25° (27–28° dove il versante
     naturale è già così ripido); giuntura con il blocco accanto 0 m; dentro i piani più bassi quota esatta;
     piatto il 76–95 % dei piani del castello di casata, 42–87 % nella sede maggiore (salti fino a ~20 m tra
     rocca e borgo). Verifica dei luoghi con il terrapieno (piani presenti, sopra l'acqua, scarpate ≤ 26°):
     30 semi su 30.
   - *Partenza:* 35 m fuori dalla porta del borgo (fine dell'ultima terrazza), rivolti alla rocca. F3: piani
     con le quote, salto massimo, scarpate, lavoro medio, acqua vicina.
   Limiti: finché non ci sono muri, tra una terrazza e l'altra c'è una rampa a 25° (si sale) e sulle rampe in
   diagonale resta una lieve seghettatura della griglia; contorni rettangolari (forme irregolari con il borgo).
3. **Rocca sul mondo generato.** `castle3d.js` generalizzato, misure dalla classe, oggetto del mondo posato
   nel blocco; partenza davanti alla porta della rocca (provvisoria). *Prova:* come M4 (giro attorno, ingresso
   dalla porta, nessuna compenetrazione, camera mai coperta) su un sito di valle e uno d'altura; Tavullia
   invariata.
   **Stato: fatto, da provare dall'utente.**
   - `castle3d.js`: cinta rettangolare (`latoX` di traverso, `latoZ` lungo l'asse della porta; senza, quadrata
     come a Tavullia), quota del cortile dal piano del terrapieno (`piano`, mai sotto il terreno interno),
     `CLASSI_ROCCA`: rocca minore 34×30 m (mura 7,5 m, mastio 9 m di lato e 18 di altezza), casata 46×40 (9;
     11/22), sede maggiore 58×50 (10; 13/26), dentro i piani di 40×36, 52×46, 64×56 m.
   - `main.js` (`costruisciRocche`): una rocca per ogni luogo il cui piano tocca il blocco (o gli sta a meno di
     150 m), in coordinate del blocco (i blocchi ora stanno su una griglia, `centroBlocco`: il sito di solito
     non è al centro), porta verso il borgo (`verso`), rampa fino a 40 m. Il terreno sotto viene dal blocco e,
     fuori, da `quotaFinale`: una rocca tagliata dal bordo si costruisce intera. Collisioni, luci delle torce,
     pavimento costruito (`componiSuolo`) e raycast della camera come a Tavullia. Al posto delle aste.
   - Un salvataggio che cade dentro le mura (partite di prima) riparte fuori dalla porta del borgo.
   - *Misure* (Chromium headless, 3 semi: 12345 e 241996 di valle, 99454 di valle con salti grandi): 32
     assalti da 70 m verso il centro per seme, di corsa per 40 s: si entra nel cortile solo nell'assalto
     allineato alla porta (1 su 32), nessuna compenetrazione oltre 5 cm. Tavullia: stesso castello, cortile a
     173,65 m, nessuna rocca del mondo.
   Limiti: dove tra rocca e prima terrazza il salto è grande (seme 99454, ~12 m) la rampa è lunga e ripida e
   attraversa le terrazze: va ridisegnata con la via del borgo (passo 4). Nessuna prova della camera
   (stesso meccanismo di M4, già misurato).
4. **Borgo murato.** Contorno secondo il carattere del sito, terrazze con muri di contenimento, porta del
   borgo, via in rampa, raccordo con la rocca; ancora senza edifici; partenza fuori dalla porta del borgo.
   *Prova:* da fuori si capisce dove si è (rocca sopra le mura, crinale dietro); si entra, si sale alla
   rocca, nessun punto in cui si cade tra muro e terreno o si resta incastrati.
   **Stato: rifatto dopo la prova dell'utente, da riprovare.** Nuovo `js/3d/borgo3d.js` (approvato), agganciato in
   `main.js` accanto a ogni rocca (stessa interfaccia: collisioni, suolo costruito, camera, F3).
   - *Prima versione (scartata dall'utente):* terrazze piatte con un muro di sostegno a tutta larghezza tra l'una e
     l'altra e una rampa al centro: «troppo moderno», «dà l'idea dell'interno di un palazzo». Il borgo deve
     somigliare a un borgo vero: in pendio, con strade interne che girano per tutto il borgo e portano alle case.
   - *Terreno* (`luoghi.js`, `VERSIONE_GENERATORE` `…m7-borgo-pendio-1…`): il borgo è **un solo piano in pendio**:
     il terreno naturale campionato su una griglia di 10 m e lisciato (3 passate di media 3×3), in `piani[1].griglia`;
     `quotaPiano` (`scena.js`) lo interpola e il terrapieno a 25° parte dal suo bordo. La rocca resta in piano, almeno
     3 m sopra il borgo lungo il bordo comune. 20 semi: verifica dei luoghi superata; pendenza media del borgo 6–28 %,
     massima locale 10–55 %; dentro il borgo il terreno coincide con la griglia.
   - *Mura:* cinta **a gradoni lungo il pendio** (tratti di ~6 m, ognuno alto 6/7/8 m sopra il terreno interno secondo
     la classe; scarpa esterna; base sotto il terreno esterno), torri quadrate agli angoli e lungo i lati, torre-porta
     con arco e battenti dove arriva la strada (il passaggio segue il terreno), rampa fuori dalla porta fino al terreno.
     Uno **sperone** chiude l'angolo tra la torre anteriore della rocca e il retro del borgo (lì il cavaliere restava
     incastrato tra la torre tonda e il muro: 23 cm di compenetrazione).
   - *Strade interne* (richiesta dell'utente: devono girare per tutto il borgo, verso case ed edifici, non solo
     portare alla rocca): **via principale** dalla porta al piede della rampa della rocca, a tornanti da un lato
     all'altro se il pendio supera il 10 %; **via lungo le mura** a 10 m dalla cinta (posto per le case addossate alle
     mura), lati diritti e angoli smussati; **vicoli** lungo le curve di livello (1/2/3 secondo la classe) da un lato
     all'altro. Curve morbide e un leggero serpeggiare, bordi irregolari; **ciottolato** in una texture generata una
     volta al caricamento. Le polilinee restano nel borgo (`strade`) per il passo 5: gli isolati tra le strade.
   - *Rocca:* la rampa della sua porta scende sul pendio del borgo (fino a 40 m, 25 %); lì finisce la via principale.
   - *Prestazioni* (`docs/PRESTAZIONI.md`, passo 6): un borgo = **6 oggetti disegnati** (mura e torri, scarpe, pietra,
     legno, strade, merli in istanza), 5 materiali più quello del ciottolato, ~8.200 triangoli (casata).
   - *Misure* (Chromium headless): dal fuori della porta del borgo al cortile della rocca in **12 borghi su 12** (4
     semi, tre classi), 32 assalti alle mura per 3 semi: si entra solo dalla porta, **nessuna compenetrazione**.
   Limiti: borgo ancora vuoto (case ed edifici al passo 5, negli isolati tra le strade).
   - *Forme irregolari* (seconda prova dell'utente: rocca e borgo «troppo regolari», tutti uguali; porte «forzate
     davanti nel mezzo del muro frontale» con rampe sproporzionate). `VERSIONE_GENERATORE` `…m7-forme-5…`; nuovo file
     `js/3d/rocca3d.js` (approvato) per le rocche del mondo generato, `castle3d.js` resta per Tavullia.
     - *Contorni* (`luoghi.js`, solo operazioni esatte): **rocca** = poligono di 5–8 vertici attorno alla cima, raggio
       in ognuna delle 16 direzioni fin dove il terreno resta entro 5 m dalla cima (13–21 / 17–27 / 21–33 m secondo la
       classe), lisciato e variato per castello. **Borgo** = dai due vertici anteriori della rocca (A, B) una catena
       arrotondata e irregolare gira dall'altra parte; il contorno si chiude sui lati anteriori della rocca, le cui mura
       chiudono anche il borgo. Ogni piano ha `poligono` (mondo) e l'ingombro rettangolare che lo contiene (controlli
       veloci, griglia del pendio); `distanzaPiano` (`scena.js`) dà la distanza con segno dal poligono.
     - *Porte sul lato col minor dislivello:* quella del **borgo** sul lato della catena dove il terreno fuori è più
       vicino a quello dentro (lontano dalla rocca); quella della **rocca** sul lato anteriore col salto minore verso il
       borgo, con spazio davanti (i lati agli estremi A e B danno sull'angolo stretto tra rocca e cinta: penalizzati).
       Il borgo scende dalla rocca: una rampa in muratura dal cortile veniva lunga 26–40 m anche lungo il muro.
       Ora davanti alla porta della rocca il terreno del borgo si rialza in uno **spalto** di terra (0,5 m sotto il
       cortile, piatto per 8 m, poi al 16 %): la rampa in muratura è di **5–5,5 m**, lungo il muro o dritta (la più
       corta che arriva a terra entro il 22 %, dentro il borgo e fuori dalle torri), con pianerottolo e parapetti.
     - *Rocca 3D* (`rocca3d.js`): mura per lato con scarpa, una torre su ogni vertice (tonde o quadrate secondo il
       castello), mastio verso il retro, torre-porta con torce e una sola luce. Collisioni: scatole orientate e cerchi
       (le stesse funzioni servono il borgo). **Borgo 3D:** cinta a gradoni lungo la catena, torri quadrate sui suoi
       vertici e ogni ~32–38 m, torre-porta e rampa orientate secondo il lato; anello delle strade sul contorno
       rientrato di 10 m, via a tornanti adattati al contorno, vicoli di traverso alla via. La via arriva al piede
       della rampa della rocca da fuori e nel suo verso (prima passava di fianco sopra la rampa lungo il muro e il
       cavaliere ci urtava).
     - *Terrazzi sotto la rocca* (per distinguere i castelli): 0–3 fasce su 1–2 lati del retro, larghe 8–15 m (diverse
       da vertice a vertice), 2,5–7 m sotto il cortile secondo il terreno; scartate se toccano il borgo, un fiume o un
       versante troppo ripido. Cinta bassa (3,5 m) con torricelle sugli spigoli. Su 20 semi (60 rocche): 29 senza, 26
       con uno, 5 con due.
     - *Più rocche* (richiesta dell'utente, per provare tempi di generazione e varietà): `LUOGHI.numero` 36 secondo
       la densità del GDD (luoghi maggiori, 30–40 per mondo; per ora tutti rocche con borgo, con la milestone dei
       luoghi una parte diventerà città e monasteri). Candidati su tutta la Carta (900 celle affinate, al più 8 per
       tessera di 12 km), distanza minima a scalini 15/13/11/10 km; classi per punteggio: 15 % sedi maggiori, 35 %
       castelli di casata, il resto rocche minori (la partenza resta un castello di casata di valle).
       `VERSIONE_GENERATORE` `…m7-forme-5+luoghi-36…`. Misure (Node, 20 semi): **27–36 rocche**, verifica superata
       20/20, scelta dei luoghi ≤ 1,3 s; nel browser la pagina è pronta in ~4 s senza cache. [Certo] Con il bordo di
       8 km, il mare e le pareti, 30 e più rocche stanno a **~12,5 km dalla più vicina** (minimo 10), non ai ~18 km
       del GDD: o si accetta, o se ne fanno ~20 a 15 km. Seme 12345 (34 rocche): dalla porta del borgo al cortile
       della rocca **34 su 34**; rampe della rocca 30 lungo il muro e 4 dritte; terrazzi: 20 senza, 12 con uno, 2 con
       due; al più ~22.000 triangoli tra rocca e borgo (sede maggiore).
     - *Terza prova dell'utente* (porta del borgo, colore delle mura). La strada arriva dritta alla porta del borgo
       lungo la sua normale (ultimi 30 m, `strade.js`, `STRADE.scena.portaDritta`; prima arrivava di sbieco e finiva
       contro il muro); la rampa fuori dalla porta c'è solo se il terreno scende sotto la soglia di oltre 35 cm (prima
       i suoi fianchi uscivano comunque, come due panche di pietra). Mura meno piatte: texture dei corsi di mattoni
       generata una volta e colore per vertice secondo dove guarda la faccia (una luce del cielo fissa di traverso,
       ±15 %) più chiazze di tono di qualche metro (±8 %), su mura, torri, merli e pietra di rocca e borgo; nessun
       oggetto né materiale in più. `VERSIONE_GENERATORE` `…strade-3…`. Poi (utente: «meno mattone, più pietra»,
       niente colori terra/fango, niente aspetto levigato) **pietra grigio-bruna**: texture di conci di lunghezza e
       corsi di altezza diversi, ognuno col suo tono, macchiati, con grana; chiazze di tono su due scale e una tinta
       un poco più calda o più fredda a chiazze larghe. Tavullia resta in mattone. Poi (utente) più distanza tra grigi
       chiari e scuri, soprattutto verso lo scuro (il 15 % dei conci molto scuri, chiazze ±16 % e ±8 %), e un **tono di
       fondo diverso per ogni luogo**, a caso ma stabile (`TONO_LUOGO`: chiarezza ×0,82–1,10, calore −7…+9 %), uguale
       per rocca e borgo dello stesso luogo. Poi (utente: castelli molto scuri, tipici del fantasy) ~1 luogo su 5 in
       **pietra molto scura** e più fredda (chiarezza ×0,45–0,66); su 5 semi 25 rocche scure su 158. Il caso per luogo
       ora viene da un hash intero (il vecchio `sin(…)·43758` non era uniforme: 13 «scure» su 34 al 20 %).
       Poi (utente: «niente texture regolari ripetitive», si vedeva una griglia) texture più grande (512 px = 6,4 m),
       conci con giunti storti e qualcuno alto due corsi, tono di ogni concio da un campo a macchie larghe più una
       parte sua (chiari e scuri raggruppati, non a scacchiera; conci molto scuri rari), e **scostamento della texture
       diverso per ogni faccia** (dalla normale e dalla distanza del piano, uguale per i due triangoli della faccia):
       le ripetizioni non si allineano più da un tratto di muro all'altro.
     - *Strada e rampa alla porta del borgo* (stessa prova). Le strade di passaggio pagano ×4 sulle scarpate dei
       terrapieni (+15 m, `STRADE.scena.mura`): girano al largo delle mura invece di costeggiarle (sembravano una
       seconda strada accanto alla porta); il tratto dritto verso la porta toglie anche i punti che costeggiavano le
       mura; la quota della strada negli ultimi 30 m va a quella della soglia. Dove il terreno davanti alla porta
       scende davvero (una conca) la rampa esterna ora ha il **piano in pietra** (prima mancava: il cavaliere
       camminava sospeso sul terreno) e i fianchi in pendenza (prima a gradini); il suolo della rampa non va mai
       sotto il terreno. Anche i parapetti della rampa della rocca sono in pendenza.
     - *Ombre delle mura* (utente: «troppe poche sfumature», l'arco della porta non si distingueva, una facciata in
       ombra sembrava illuminata come le altre). Nello shader della pietra (`materialeMuro`) la luce del cielo e
       quella riflessa calano fino a ×0,38 sulle facce girate dal sole (o dalla luna: la luce direzionale più forte),
       e la luce riflessa fissa è dimezzata: le facce in ombra sono davvero scure e cambiano con l'ora. La galleria
       delle porte è scura (×0,13–0,40, più a metà); una **ghiera** di pietra chiara sporge attorno all'arco sulle due
       facce; il piede delle mura e delle torri è più scuro (×0,68, in 4 m). Corretto un errore: la gradazione per lato
       sovrascriveva quella del pezzo (piede, galleria), che quindi non c'era sulle pareti verticali.
     - *Misure* (Chromium headless): seguendo la via, dal fuori della porta del borgo al cortile della rocca in
       **24 rocche su 24** (8 semi, tre classi); 32 assalti al borgo e 32 alla rocca per 3 semi: si entra solo dalla
       porta, **nessuna compenetrazione**. Rocca 10
       oggetti disegnati (4.400–7.400 triangoli), borgo 6 (7.800–8.400). 20 semi: verifica dei luoghi superata.
5. **Edifici e case.** Edifici nominati, case per lotto secondo la classe, instancing, geometrie fuse,
   collisioni a griglia, texture da codice. *Prova:* le classi si distinguono a colpo d'occhio; FPS su PC
   medio nel borgo e nella rocca, anche nel borgo più grande; chiamate e triangoli in F3 entro il budget;
   giudizio dell'utente sullo stile.
   **Stato: fatto, da provare dall'utente.** Decisioni dell'utente: file nuovo `js/3d/edifici3d.js` (kit unico per
   borgo, rocca, campagna e poi villaggi); case in pietra con parti intonacate chiare e coppi rossi; sede maggiore
   subito; tutte le tappe insieme.
   - *Kit:* tipi di casa (a schiera, bassa, casa-torre, con bottega, rurale con fienile), edifici nominati (stalla con
     recinto, taverna con insegna, fabbro con tettoia, guaritore, loggia del mercato e banchi, chiesa con campanile e
     loggia grande nella sede maggiore; nella rocca cappella con campaniletto, pozzo, sala d'armi e armeria). Zoccolo
     di pietra fino al terreno più basso (niente terrazze), pareti, tetto a due falde (colmo lungo la via), finestre,
     porte, comignoli. Texture generate una volta: coppi (canali lungo la falda, muschio) e intonaco (macchie,
     colature, pietre a vista). Il tono della pietra segue quello del luogo.
   - *Irregolarità* (richiesta dell'utente: spigoli non tutti lineari, «l'idea delle pietre irregolari»): pareti fuori
     squadra di qualche cm; **cantonali** di pietra di misure diverse, alternati sui due lati, ma solo su ~1 spigolo
     su 3 e a tratti, con buchi (utente: spigoli tutti pieni sembravano edifici restaurati di oggi); interi solo sui
     campanili.
   - *Medievale e un po' fantasy* (utente: case «troppo curate, quasi del 1900», tetti «in mattoni»): **piani alti a
     graticcio** che sporgono di 45 cm su metà delle case del borgo (travi scure, controventi nelle campate di testa;
     taverna e guaritore sempre); **tetti** ripidi e irregolari (colmo che si incurva, gronde storte, pendenze diverse)
     in paglia, scandole, lastre di pietra o coppi secondo il contesto (borgo, campagna, rocca), con **muschio** verso
     le gronde; una sola texture per i tetti a lastre irregolari, tinta per casa, e una per la paglia. **Finestre**
     piccole e poche, non allineate, con imposte di legno aperte; edera e umido al piede di alcune case; comignoli
     di misure diverse. Attorno: **pagliai**, **cataste** di legna e **botti** (campagna, porte delle case, taverna,
     fabbro).
   - *Appoggiati sul terreno* (utente: non staccati dal suolo; muschio, polvere, imperfezioni): zoccolo bruno di terra
     e polvere verso il basso, edera e umido al piede di alcune case, **sassi** irregolari mezzi interrati lungo i muri
     (a istanze, spariscono da lontano), una sottile **ombra di contatto** di terra scura attorno alla pianta, col
     bordo che sfuma a puntini (alphaTest). Una fascia di terra larga 1–1,6 m l'ho provata e scartata: da lontano
     sembrava un marciapiede.
   - *Selciato del borgo* (utente: «sanpietrini grossi irregolari misti a terra e polvere», non a mosaico): pietre di
     15–25 cm in file approssimative di traverso, bordi storti, l'8 % mancanti (resta la terra), erba nelle fughe,
     polvere e fango a chiazze; texture di 3,2 m.
   - *Chiamate*: porte e portoni, finestre e celle campanarie sono lo stesso dettaglio con misure diverse (−8 chiamate
     nella sede maggiore).
   - *Lotti* (`borgo3d.js`): lungo le strade, facciata sulla via; prima gli edifici nominati lungo la via dalla porta
     (la stalla vicino alla porta), poi la piazza del mercato a metà della via (raggio 11 m casata, 15 m maggiore) con
     loggia, chiesa e banchi, poi le case (via: botteghe e schiere; anello: anche col retro contro le mura; vicoli)
     fino a 14 / 30 / 60 per classe. Un lotto è libero se, campionato ogni ~2 m, sta nel borgo, fuori dalle strade,
     dalle torri, dalla porta, dalla rampa della rocca e dagli altri lotti (prima i campioni erano solo angoli e
     mezzerie: il recinto della stalla, lungo 32 m, finiva sulla via in curva). Nella rocca gli edifici stanno contro
     le mura (facciata sul cortile) o liberi nel cortile; il pozzo nel punto libero più vicino al centro.
   - *Campagna:* case rurali (a volte col fienile) sui siti di `caseCampagna` della sessione Vegetazione, costruite
     con la Scena (`main.js`, `creaCaseCampagna`).
   - *Prestazioni:* volumi uniti per materiale (pietra, intonaco, tetti, paglia, legno); finestre, imposte, porte,
     comignoli, travi del graticcio, cantonali e celle campanarie a istanze in zone (al più 2 × 2 per kit) che si spengono oltre 160 m (`THREE.LOD`);
     per la camera una sagoma a scatole invisibile; una scatola di collisione per edificio. Borgo con le mura:
     casata ~30 oggetti, sede maggiore ~40 (limite 40, al bordo); triangoli ~30.000 (casata) e ~82.000 (sede maggiore)
     da vicino. Rocca con i suoi edifici ~15 oggetti; campagna ~11 oggetti per blocco.
   - *Edifici nominati con la porta* (`edifici: [{ tipo, nome, porta: { u, v, fu, fv } }]` di rocca e borgo): per il
     passo 6 (Carta del cronista).
6. **Porte → Carta del cronista.** Soglie, «E: entra», overlay segnaposto, tempo fermo. *Prova:* ogni
   edificio nominato si apre e si chiude; il tempo non scorre.
   **Stato: fatto, da provare dall'utente.** Ogni edificio nominato di rocca e borgo (e il pozzo) ha la sua porta
   nel blocco (`edifici3d.js`, `edifici[].porta`: x, z e normale). Entro 2,4 m, dalla parte giusta e rivolto verso la
   porta compare «E: entra — Taverna»; E apre la **Carta del cronista segnaposto** (nome, una riga per tipo
   d'edificio, «Esci»; Esc o E per uscire): tempo fermo e cavaliere fermo finché è aperta; entrare per ora non costa
   tempo. Il tasto è **provvisorio** (la scelta dei tasti è rinviata dall'utente). Un solo gestore di E in
   `main.js` (`AZIONI_TASTO`): agisce la prima voce pronta, in ordine persona vicina → porta → cavallo (accordo con
   la sessione Cavallo, che aggiunge la sua voce in fondo; in sella la porta non vale). Prova (headless, seme 12345): 8 porte su 8
   raggiunte a piedi, invito e apertura giusti, ora ferma con la Carta aperta.
   *Ripartizione dei passi rimasti* (utente: farli in questa sessione, o in quelle già aperte se toccano i loro file):
   passi 6 e 7 qui; le persone segnaposto proposte alla sessione M1 (modelli insieme al cavaliere unito per snodo);
   passi 8 (sagome da lontano, orizzonte) e 9 (blocco che segue il cavaliere) proposti alla sessione M6.
7. **Luci notturne e persone.** Torce, finestre, forgia, gruppo di luci vicine; figure ai loro posti e
   popolani che camminano, simbolo e «E: parla». *Prova:* di notte il borgo si vede acceso da qualche
   centinaio di metri; FPS di notte nel borgo; le persone non si attraversano.
   **Stato delle luci: fatto, da provare dall'utente.** Finestre accese di notte (`edifici3d.js`): ogni finestra ha
   una soglia per istanza e si accende se la soglia è sotto la quota dell'ora (`quotaFinestre`: 50% a sera, 30% dopo
   le 21, 8% a notte fonda; le celle campanarie mai), luce calda nello shader, nessun oggetto in più. Torce (fiamma
   a istanze e alone) ai lati della porta del borgo e alle porte di taverna, stalla, cappella e sala d'armi; forgia
   del fabbro come sorgente. Luci vere: **4 PointLight fisse** (`main.js`, `LUCI_VICINE`) assegnate alle sorgenti
   più vicine al cavaliere entro 70 m, con tremolio; numero fisso, quindi nessuna ricompilazione degli shader.
   Il buio viene da `aggiornaLuci(t, buio, quota)` di rocca, borgo e campagna (col meteo il buio lo darà il cielo).
   Prova (headless, seme 12345, ore 21): finestre e torce accese, porta del borgo illuminata; cammino 34/34.
   Da misurare sulla scheda dell'utente: FPS di notte nel borgo.
   **Stato delle persone: fatto con segnaposto, da provare dall'utente.** File nuovi approvati dall'utente:
   `js/3d/abitanti3d.js` (questa sessione: posti, percorsi, collisioni, «E: parla») e `js/3d/persone3d.js` (sessione
   M1: i modelli, `creaPersona({ ruolo, colori, seme }) → { object, update(dt, { modo, velocita }) }`); finché non
   c'è, un segnaposto a capsula con la stessa interfaccia. *Posti:* accanto alla porta (non davanti) di taverna
   (oste), fabbro, stalla (stalliere), guaritore, cappella e chiesa (chierico), sala d'armi (maestro d'armi), armeria
   (armaiolo), loggia (mercante); due guardie fuori dalla porta del borgo, una fuori da quella della rocca.
   *Popolani* (3 / 6 / 10 per borgo minore / casata / maggiore; popolani, popolane, bambini) camminano a tratti lungo
   le strade del borgo, un po' fuori mezzeria, con soste; si fermano se davanti c'è qualcuno o il cavaliere. Chi sta
   fermo si volta verso il cavaliere che arriva. Di notte restano fuori solo guardie e oste. Oltre 110 m non si
   disegnano né si muovono. Il cavaliere non le attraversa (ostacolo come mura e ponti). *«E: parla»*: entro 2,6 m e
   rivolti verso la persona (~45°) compare «E: parla — L'oste» e si apre una carta con una riga segnaposto; la
   persona ha la precedenza sulla porta. Prova (headless, seme 12345): 16 persone, i 6 popolani camminano 60 s
   senza mai scendere sotto 0,84 m tra loro; «parla» con l'oste; cammino 34/34 e porte 8/8 con le persone in scena.
   Da fare dopo: campagna (contadini), il simbolo sopra chi ha qualcosa da dire, i modelli di M1.
8. **Da lontano.** Sagoma negli anelli, luci lontane. *Prova:* dal fondovalle a 2–5 km la rocca si
   riconosce di giorno e di notte; nessuna rocca «doppia» tra modello e sagoma; FPS invariati fuori dal sito.
   **Fatto (sessione M6, da provare dall'utente):** `sagomeLuoghi` in `orizzonte.js`. Per i luoghi che la Scena non
   costruisce (stessa regola di `costruisciRocche`, quindi niente rocca doppia): entro 6 km cinte di rocca e borgo
   (altezze di `MISURE_ROCCA` e `CLASSI_BORGO`), torri agli spigoli della rocca, mastio, una massa di tetti nel borgo;
   tra 6 e 18 km solo il mastio. Di notte 4/7/11 luci per borgo (minore, casata, maggiore) sopra i tetti, punti che
   ignorano la nebbia, fino a 10 km (`luciLontane(notte)`, chiamata in `main.js` con le luci delle rocche). Una mesh
   per tutte le sagome (~250 triangoli per luogo) e un `Points` per le luci: 2 chiamate. Provato in una scena di prova
   (seme 570549, rocca di partenza a 3, 6 e 9 km): di giorno mastio e mura sulla cresta, di notte le luci del borgo.
9. **Blocco che segue il cavaliere** (se l'utente lo approva in M7, punto 6). *Prova:* dal borgo di partenza
   si sale al crinale in 15–20 minuti reali senza fermarsi al bordo e senza stacchi visibili né cali di FPS al
   cambio di blocco; rocca e borgo restano al loro posto; tornando indietro si ritrova tutto.
   **Piano (sessione M6, da approvare):**
   - *Cosa costa oggi* (caricaScena, headless, seme 570549): blocco con fiumi e strade ~0,35 s, orizzonte ~0,5–0,6 s,
     vegetazione ~0,4 s (posizionamento + costruzione), rocche, case e suolo cotto il resto: **1,3–1,6 s in un colpo
     solo**. Fatto a ogni cambio di blocco (ogni ~1 km di cammino) sarebbe uno scatto di un secondo e più.
   - *Quando*: il cavaliere a meno di ~350 m dal bordo del blocco (cioè ~650 m dal centro) → si prepara il blocco
     centrato su di lui (griglia di `centroBlocco`), lo si sostituisce quando è pronto. Il bordo vero non si raggiunge
     mai (oggi a 2 m il cavaliere si ferma).
   - *Il cambio*: tutto si sposta di (vecchio centro − nuovo centro): cavaliere, cavallo, camera, persone. Le rocche
     e le case già costruite che restano vicine si **spostano** (sono già oggetti del mondo), quelle che escono si
     liberano, quelle che entrano si costruiscono. Terreno, acque, ponti, orizzonte, vegetazione si rifanno. Salvataggi
     già in coordinate del mondo: invariati.
   - *Tappe*:
     1. **Cambio con pausa breve**: tutto come oggi, ma senza schermata di caricamento e con lo spostamento dello stato;
        si misura la pausa sulla scheda dell'utente. Serve a verificare che niente si perda o si sposti male.
     2. **Preparazione a pezzi in sottofondo**: il nuovo blocco si calcola a fette tra un fotogramma e l'altro (righe
        della griglia, un tratto di fiume o di strada, un anello dell'orizzonte, una parte della vegetazione per volta,
        entro ~4 ms per fotogramma: regola di `docs/PRESTAZIONI.md`); il cambio diventa un solo fotogramma (solo
        l'invio delle geometrie alla scheda, preparato in anticipo). Obiettivo: nessuno scatto oltre ~50 ms.
     3. *Se non basta*: posizionamento della vegetazione e quote del blocco nel Worker (moduli già senza grafica).
   - *Chi tocca cosa*: l'orchestrazione è nuova e sta quasi tutta in `main.js` (caricaScena). Proposta: un modulo nuovo
     `js/3d/blocchi.js` per la preparazione a pezzi e il cambio, così `main.js` resta leggibile e i conflitti con le
     altre sessioni restano pochi (file nuovo: serve la conferma, regola 2). Le funzioni delle altre sessioni si
     usano così come sono (`creaVegetazione`, `costruisciRocche`, `creaCaseCampagna`), chiedendo solo la versione «a
     pezzi» dove servirà (Vegetazione per il posizionamento).
   - *Prova*: dal borgo di partenza al crinale senza fermarsi; F3 con i ms del cambio; percorso di prova con un tratto
     che attraversa due bordi di blocco.
   - **Tappa 1 fatta** (approvata dall'utente con il file `js/3d/blocchi.js`): `vicinoAlBordo` e `trasla` in
     `blocchi.js`, `cambiaBlocco` in `main.js` (ricarica la Scena centrata sul cavaliere, sposta cavaliere, cavallo,
     camera e il punto della fatica; F3: numero e ms dei cambi; `kd.cambiaBlocco(x, z)` per il percorso di prova).
     Prova in headless (seme 570549): dopo il cambio il cavaliere è nello stesso punto del mondo e alla stessa quota
     (1224,29 m), nessun errore; **pausa 2,8 s** (headless). Attiva solo con `?blocchi` nell'indirizzo finché c'è la
     pausa: senza, il cavaliere si ferma al bordo come prima.
   - **Tappa 2, prima parte fatta**: `caricaScena` del mondo è diviso in `preparaMondo` (generatore: `generaScenaAPezzi`,
     `createTerrainAPezzi`, `creaOrizzonteAPezzi` con le acque lontane a pezzi, e un `yield` tra un lavoro e l'altro) e
     `applicaMondo`; il caricamento normale li usa di seguito e fa quello che faceva. Con `?blocchi`, vicino al bordo la
     preparazione avanza ~4 ms per fotogramma (`avanzaBlocco` in `main.js`, perché tocca le sue variabili); pronta, lo
     scambio dura ~10 ms (headless) e il blocco vecchio si libera un oggetto per fotogramma. Il cavaliere resta nello stesso
     punto del mondo. `kd.cambiBlocco.ultimo.lunghi` elenca i pezzi oltre 8 ms. In headless (CPU più lenta di un PC
     medio) restano lunghi, tutti atomici: posizionamento della vegetazione ~850 ms, `creaVegetazione` ~250, bosco
     lontano ~120, rocche e borghi ~90; le parti della scena, del terreno e dell'orizzonte stanno sotto ~26 ms. Mancano
     le versioni a pezzi di Vegetazione e M7 (chieste) e il caricamento sulla scheda e la compilazione degli shader
     prima dello scambio (note di M1); intanto resta con `?blocchi`. Poi aggiunti: shader compilati in parallelo
     (`compileAsync`, la preparazione aspetta senza fermare i fotogrammi) e texture caricate sulla scheda prima dello
     scambio; F3 mostra anche il disegno del fotogramma dopo lo scambio (le geometrie salgono lì).
   - **Tappa 2 fatta** (da provare nel browser): nel generatore entrano le versioni a pezzi di Vegetazione
     (`posizionaVegetazioneAPezzi`, `creaVegetazioneAPezzi`, `aggiungiLontanoAPezzi`, `preparaOmbre`) e di M7
     (`createRoccaAPezzi`, `createBorgoAPezzi`: `costruisciRocche` è un generatore), con ~2 ms per pezzo dentro i
     4 ms per fotogramma; `libera()` salta i modelli condivisi della vegetazione (`userData.condivisa`). Headless
     (seme 570549): pezzo più lungo 22–24 ms (la cottura del suolo, un render 2048² che sulla scheda vera costa
     pochi ms), gli altri ≤ 16 ms, scambio 10–12 ms; il cavaliere resta nello stesso punto del mondo. **Il blocco
     segue il cavaliere senza parametri**; `?blocchi=no` lo spegne (cavaliere fermo al bordo, per confronti).
     Ancora da fare se serve: cottura del suolo divisa (se sulla scheda dell'utente lo scatto si vede).
   - *Note della sessione M1 (prestazioni)*, da rispettare alla tappa 2: nel fotogramma del cambio non devono cadere
     la cottura del suolo (`cuociSuolo`, render 2048²), il caricamento sulla scheda di terreno, istanze della vegetazione
     e texture (ombre, piede, cotto) né compilazioni di shader: tutto nella preparazione, uno per fotogramma
     (`renderer.initTexture`, `renderer.compileAsync` o un render del gruppo nuovo in un bersaglio 1×1). Il blocco vecchio
     si libera a pezzi nei fotogrammi dopo (`dispose`), non nel cambio. Al più due blocchi e due orizzonti in memoria,
     mai un terzo in anticipo. Orizzonte: spostando il centro di ~1 km le fasce degli anelli cambiano posto; se i
     rilievi vicini «saltano» si rifà solo l'anello 1 e si spostano gli altri. La tappa 1 (pausa ~1,5 s) solo come prova,
     non a lungo in `main`. Un comando per forzare un cambio di blocco da codice (in `kd`) per il percorso di prova.

### Accettazione

In una regione generata ci sono 2–3 rocche con borgo, di classi diverse e riconoscibili; il garzone parte
fuori dalla porta del borgo di un castello di valle e da lì capisce dove si trova; rocche e borghi stanno su
siti credibili (valle, fiume, valico o altura; mai in acqua, su una parete o nella fascia di un fiume), su
terrazze senza giunture con il terreno, le Scene vicine e l'orizzonte; si gira attorno e dentro le due cinte
senza attraversare muri né incastrarsi; ogni edificio nominato apre la sua Carta del cronista segnaposto; di
notte le luci si vedono da lontano; 60 FPS su PC medio nel borgo, di giorno e di notte; Tavullia invariata;
siti validi su 30 semi su 30 (verifica automatica). Con il passo 9: dal borgo si sale al crinale di persona.

### Rischi e incertezze

- [Certo] Il terrapieno cambia la quota del mondo: le Carte in cache si rigenerano (`VERSIONE_GENERATORE`) e
  una posizione salvata può cadere dentro un muro → se il punto salvato è dentro un solido, si riparte fuori
  dalla porta del borgo.
- [Probabile] Il castello di valle è il sito più difficile da costruire: il versante è più ripido di un
  colle (pendenza del borgo fino a 15°, 25 m di dislivello sotto il borgo) e il fiume può essere a 350 m. Il
  passo 2 dirà quanti siti di valle reggono la fascia del fiume e i 6 m sopra l'acqua; [Ipotesi] alcuni
  andranno sostituiti da un altro sito di valle.
- [Probabile] Il costo maggiore resta il borgo (passi 4–5): terrazze, muri di contenimento e lotti su un
  pendio irregolare. Ripiego: borgo su un solo piano, con il terrapieno che fa più lavoro di terra.
- [Probabile] Le prestazioni dipendono da chiamate di disegno, luci e raycast della camera più che dai
  triangoli; in headless il rendering è software e non fa testo: la misura vera è dell'utente su Pages.
- [Probabile] Il passo 9 è il più rischioso per gli FPS: oggi orizzonte e acque si ricostruiscono in
  250–400 ms, e farlo durante il cammino darebbe uno scatto; va spostato nel Worker o spezzato.
- [Ipotesi] Una scarpata larga fino a ~100 m attorno al sito può sembrare artificiale; rimedio: più muri
  di contenimento, meno terra.
- [Probabile] La sede maggiore è il caso più a rischio per i 60 FPS: è condizionata al passo 5.
- [Certo] Con le sole primitive le persone restano fantocci (limite già noto per il cavaliere).

### Decisioni prese con l'utente (novembre 2026)

1. **File nuovi approvati:** `js/mondo/luoghi.js` (siti e terrapieno, senza grafica), `js/3d/borgo3d.js`
   (borgo ed edifici), addon `BufferGeometryUtils.js` di r187 in `lib/three/addons/`; poi `js/3d/rocca3d.js`
   (rocche irregolari del mondo generato; `castle3d.js` resta per Tavullia).
2. **2–3 siti diversi** in M7, non uno solo; poi (richiesta dell'utente) **tante rocche quante ne dice il GDD**
   (30–40 luoghi maggiori), per provare tempi di generazione e varietà.
3. **Partenza fuori dalla porta del borgo**: il garzone deve rendersi conto da fuori di dove si trova.
4. **Carta del cronista segnaposto**: le azioni vere arrivano con la Veglia.
5. **Grandezza variabile secondo l'importanza** del luogo: tre classi (da confermare guardando il risultato).
6. **Persone ferme ai loro posti più alcune che camminano.**
7. **Tavullia invariata**, con il castello di M4.
8. **Valichi e forcelle distinti**; valichi tra 1000 e ~2500 m, quasi sempre con sentinella (GDD §2).
9. **Castello di valle come partenza**, a ≤ 5 km da un crinale 800 m più alto (regione di 120×90 km).

10. **Passo 9 in M7** (blocco che segue il cavaliere): approvato.
11. **Vegetazione e oggetti sparsi in parallelo a M7** (deroga alla regola 4 decisa dall'utente): altra sessione,
    sezione a sé in questo documento; esclude i terrapieni dei luoghi (`carta.luoghi[].piani`).
12. **Forme irregolari e porte sul lato col minor dislivello**, terrazzi sotto la rocca non sempre uguali (seconda
    prova del passo 4); sforzo unico con il borgo in pendio, in una sola PR.

### Da decidere

- **Torri di sentinella dei valichi**: in M7 o con la milestone dei luoghi (oggi fuori da M7)?

## M8 — Luoghi del mondo

> **Stato: piano approvato dall'utente (21 novembre 2026)** con le decisioni seguenti:
> 1. file nuovi approvati: `js/mondo/siti.js`, `js/3d/villaggio3d.js`, `js/3d/rovine3d.js`;
> 2. monasteri (4–6) e città (2–4) **ricavati da una parte delle rocche** attuali: i luoghi maggiori restano 30–40;
>    il percorso di prova va ricontrollato (la rocca del borgo di prova non deve cambiare tipo);
> 3. quantità della tabella, con un tetto rigido di **+1,5 s** sul tempo di generazione: se si sfora si riducono prima
>    i villaggi (verso 60) e le strade vanno solo ai villaggi;
> 4. ordine: M8 passo 1 subito; poi M7 passo 9 (blocco che segue il cavaliere); poi M8 passi 2 e seguenti. I passi
>    6–8 di M7 procedono in parallelo.

Decisione dell'utente (novembre 2026): M8 comincia **prima di chiudere M7** (deroga alla regola 4; M7 resta ai passi
6–9: porte e Carta del cronista, luci e persone, da lontano, blocco che segue il cavaliere). Oggi nel mondo ci sono
solo le rocche con borgo (27–36), le case di campagna, ponti e guadi: tra un castello e l'altro (~17 km) il mondo è
vuoto. Fazioni e nomi restano fuori da M8 (milestone a sé, «fazioni e nomi»).

### Quanti luoghi

[Certo] Il GDD (§2, *Dimensioni e densità*) conta tre gerarchie **separate**: luoghi maggiori 30–40 (castelli, città,
monasteri), villaggi 60–100, luoghi speciali 60–100. Quindi villaggi e luoghi speciali **si aggiungono** ai 30–40,
non ne fanno parte. Con ~10.000 km² di terra per mondo (tre semi: 9.800–10.000 km²): oggi un luogo ogni ~300 km²
(uno ogni ~17 km); con M8 ~170–220 luoghi, uno ogni ~50 km² (**uno ogni ~7 km**: da qualunque punto un luogo entro
3–4 km, ~40–60 minuti di cammino di gioco). [Probabile] È la densità giusta per non avere vuoti senza riempire il mondo
di luoghi generici.

| Tipo | Per mondo | Dove | A cosa serve (GDD, EARLY_GAME, EVENTS) |
|---|---|---|---|
| **Castelli** con borgo | ~28 (dai 30–40) | come oggi | corte, fazioni, mercato, Veglia |
| **Monasteri / abbazie** | 4–6 (dai 30–40) | collina, bosco, monte, isolati | Volontà, guarigione, lore; cripta → dungeon |
| **Città** | 2–4 (dai 30–40) | pianura, fiumi, costa (porto) | commercio, notizie, contratti (ultimo passo) |
| **Villaggi** | 60–80 (frazioni di 6–10 case, villaggi di 12–20 con pieve e locanda) | vicino all'acqua, pendii dolci, sulle strade | locanda (Forza), voci, missioni locali; la Veglia («il villaggio vicino») |
| **Rovine** (castello diroccato, torre crollata, chiesa sventrata, villaggio abbandonato) | 15–20 | ovunque, anche in alto | esplorazione, dungeon, covi |
| **Abbandonati** (torre isolata, maniero decaduto, casale) | 10–15 | margini, colline | candidati **covo** (GDD §3) |
| **Grotte** | 10–15 | monti, rocce, valli strette | dungeon, tane, covo |
| **Eremi** | 6–10 | monte, bosco | Volontà, apprendisti, lore |
| **Luoghi del fantastico** (cerchio di pietre, tumulo, albero sacro, rovine di un'altra epoca) | 8–12 | alture, brughiere, boschi | «creature, maledizioni, luoghi leggendari» (GDD §2 *Scoperta*): il tocco fantasy |
| **Accampamenti** (briganti, mercanti, soldati) | 8–12 | boschi lontani dalle rocche; lungo le strade | incontri, combattimenti, notizie |
| **Valichi**: torre di sentinella, ospizio | come i valichi (dato già pronto: sentinella all'85 %) | valichi | presidio, pedaggio, neve (GDD §2) |
| **Ovili e pastori** | 1–2 entro 2–4 km da ogni castello, poi sparsi | pascoli | la Veglia («scacciare i lupi dall'ovile») |

### Passi (ciascuno provato nel browser, una PR per passo)

1. **Siti sulla Carta.** Tutti i tipi scelti nel Worker con le regole della tabella e distanze minime per tipo; i
   villaggi diventano nodi delle strade (carrarecce); segni sulla Carta e «Vai a»; verifica automatica (30 semi).
   *Prova:* distribuzione credibile, nessun vuoto più largo di ~10 km, tempo di generazione ≤ +1,5 s.
2. **Villaggi e ovili 3D** (kit di `edifici3d.js`): case rurali attorno a uno slargo o lungo la strada, pieve,
   locanda, fabbro, pozzo, forno, mulino sul fiume, orti e palizzata a volte; ovile con recinto. Spianata leggera
   (terrapieno come i borghi, senza mura).
3. **Monasteri ed eremi:** chiesa, chiostro, foresteria, infermeria, biblioteca, muro basso, orti; eremo con cappella.
4. **Rovine e luoghi abbandonati:** mura e torri spezzate (dalla rocca, tagliate e senza tetti), macerie, edera;
   torre, maniero e casale abbandonati come candidati covo.
5. **Grotte e luoghi del fantastico:** imbocco nella roccia, cerchio di pietre, tumulo, albero sacro, rovine antiche.
6. **Accampamenti:** tende, fuoco, carri, palizzata leggera.
7. **Valichi:** torri di sentinella e ospizi.
8. **Città** (2–4, dai 30–40) e porti: borgo grande con cattedrale e piazza.

Le porte degli edifici nominati (locanda, pieve, chiostro…) avranno il punto «porta» come nel borgo, per il passo 6
di M7 (Carta del cronista).

### Passo 1 — siti sulla Carta (fatto, da provare)

Codice: `js/mondo/siti.js` (nuovo), agganci in `lavoratore.js` e `generatore.js`, villaggi nella rete in `strade.js`,
segni e «Vai a…» in `cartaVista.js`; `VERSIONE_GENERATORE` + `siti-1`.
- **Ordine nel Worker:** rocche (`aggiungiLuoghi`) → `aggiungiSiti` (monasteri e città dalle rocche, ovili vicino ai
  castelli, villaggi, sentinelle e ospizi dei valichi, rovine, grotte, eremi, luoghi del fantastico, abbandonati,
  ovili sparsi, riempimento dei vuoti) → strade → `completaSiti` (accampamenti: briganti nei boschi lontani dalle
  strade, mercanti e soldati sulle strade). Tutto in `carta.siti` = `[{ id, tipo, x, z (m), quota, pendenza,
  variante?, dimensione? }]`; monasteri e città restano in `carta.luoghi` con `tipo: 'monastero' | 'citta'` (mai
  la partenza: il percorso di prova resta sul borgo della rocca 1).
- **Scelta:** punteggio per cella secondo il tipo (tabella sopra) + un poco di caso + **copertura** (più punti alle
  celle lontane dai luoghi già scelti), distanze minime dal proprio tipo, da tutti i siti e dalle rocche; il punto
  si affina nella cella sul rilievo delle Scene (il più piano per villaggi, eremi, ovili; il più alto per rovine e
  luoghi del fantastico; il più ripido non parete per le grotte). Dove resta un vuoto, i luoghi speciali salgono
  fino al massimo della loro quantità.
- **Strade:** i villaggi prendono il posto degli «abitati provvisori» (fino a 20 come nodi della rete, i grandi per
  primi); gli altri si collegano con una carrareccia dal villaggio alla strada più vicina (Dijkstra fermato alla
  prima cella di strada; un ponte nuovo costa molto di più, così si resta dalla propria parte del fiume). Tutti i
  villaggi sono sulla rete. Seme 570549: carrarecce da 182 a 715 km, ponti da 10 a 13, rami da 68 a 204.
- **Misure** [Certo, Node, 30 semi]: 170–200 siti per mondo (villaggi 62–78, monasteri 4–6, città 2–4, rovine e
  speciali ~85, ovili ~30–40); siti ~30–130 ms, strade +0,3–0,5 s; in tutto la generazione cresce di ~0,4 s (tetto
  +1,5 s). **Vuoti:** il vuoto più largo è di 13–16 km (mediana 14), con ≤ 1 % delle celle di terra percorribile a più
  di 6 km da un luogo. L'obiettivo «nessun vuoto oltre ~10 km» **non si raggiunge** con queste quantità (un luogo ogni
  ~6,5 km in media lascia sempre qualche buco): la verifica chiede vuoto ≤ 18 km e ≤ 1 % delle celle oltre 6 km;
  29 semi su 30 la superano (55446: 1,1 %).
- **Da provare** (vista della Carta, tasto M): distribuzione credibile dei segni; «Vai a…» porta a ogni tipo (le
  Scene dei siti sono ancora vuote: il 3D arriva dal passo 2; monasteri e città mostrano ancora rocca e borgo fino
  ai passi 3 e 8); tempo di generazione nel browser.

### Decisioni tecniche

- **File nuovi** (approvati, regola 2): `js/mondo/siti.js` (scelta dei siti di villaggi e luoghi speciali, senza
  grafica, nel Worker come `luoghi.js`); `js/3d/villaggio3d.js` (villaggi, ovili, monasteri, eremi);
  `js/3d/rovine3d.js` (rovine, abbandonati, grotte, luoghi del fantastico, accampamenti, sentinelle). Le città
  riusano `borgo3d.js` e `rocca3d.js`.
- **Terreno:** villaggi e monasteri con un terrapieno leggero (stesso meccanismo di `spianaLuoghi`, pezzi piccoli);
  rovine, grotte e luoghi del fantastico sul terreno com'è. `VERSIONE_GENERATORE` a ogni cambio.
- **Prestazioni** (`docs/PRESTAZIONI.md`, passo 6): un villaggio ≤ 20 chiamate e ≤ 30.000 triangoli, un luogo
  speciale ≤ 8 chiamate; si costruiscono solo i luoghi nel blocco e vicini. [Probabile] Il caso peggiore è un blocco
  con castello, due villaggi e un monastero: va misurato al percorso di prova.
- **Classi delle rocche:** i 30–40 luoghi maggiori restano tali; una parte (4–6 monasteri, 2–4 città) cambia tipo,
  scelta dal punteggio e dal carattere del sito (monasteri isolati e in alto, città in pianura o sulla costa).

### Rischi

- [Probabile] Il tempo di generazione: oggi luoghi e strade ~2 s; ~200 siti in più con le loro verifiche e le strade
  verso i villaggi possono raddoppiarlo. Rimedio: verifiche leggere per i luoghi speciali, strade solo verso i
  villaggi.
- [Ipotesi] Troppi luoghi vicini a un castello affollano la Scena: distanza minima dai castelli (~2,5 km per i
  villaggi, ~1,5 km per gli altri).

## Vegetazione e oggetti sparsi (in parallelo a M7)

> Autorizzata dall'utente in parallelo a M7 (deroga alla regola 4 di `CLAUDE.md`). Design di partenza: M4,
> «Dopo la valutazione — realismo del terreno» (punto 2, oggetti sparsi a *instancing*) e «stile
> simil-realistico da codice»; M6 passo 7 (`coloreMondo`); M7, terrapieni (passo 2) e blocco che segue il
> cavaliere (punto 6, passo 9); `docs/GDD.md` §2 («Dentro le Scene», regole di varietà, «Dimensioni e densità»).
> **Stato: piano approvato dall'utente (novembre 2026) con le decisioni in fondo; passo 1 fatto, da provare.**

**Obiettivo.** Nelle Scene del mondo generato ci sono alberi, arbusti, erba, sassi, massi e affioramenti dove il
colore del terreno già li promette: il bosco dipinto diventa bosco, la macchia sui pendii diventa cespugli, le
chiazze di roccia diventano affioramenti e i ghiaioni sassi. Tutto è coerente con bioma, quota, pendenza e clima,
deterministico dalle coordinate del mondo, e regge 60 FPS su PC medio. Fermarsi «nel nulla» deve offrire qualcosa
da guardare (M4, «movimento e viaggio»).

**Cosa c'è oggi** [Certo, dal codice]: il bosco è solo un colore (`coloreMondo` in `terrain.js`: biomi delle 4
celle vicine letti in un punto spostato di ±350 m, radure, alpeggi sopra il limite degli alberi, macchia sui pendii
14–28°, roccia oltre 32–44° o 18–30° in alto, affioramenti a chiazze, ghiaioni, neve); blocco di 2×2 km a griglia
di 7,8 m; nebbia di giorno dai **10 km** (con l'orizzonte): il bordo del blocco si vede nitido; ombre proiettate solo
per cavaliere e castello; collisioni con `ostacoli[].spingiFuori(x, z, r)` (`knight3d.js`).

### Decisioni tecniche (proposte)

**1. Due moduli** (regola 2: nomi da confermare, domanda 1).
- `js/mondo/vegetazione.js` — **posizionamento**, senza Three.js né DOM (gira in Node e in un Worker): catalogo
  dei tipi con densità per bioma, quota, pendenza e clima; funzione che, dato il blocco, restituisce per ogni tipo
  un array compatto (`Float32Array`: x, z, quota, scala, rotazione, variante) più i conteggi e i ms.
- `js/3d/vegetazione3d.js` — **mesh**: geometrie da codice per tipo e livello di dettaglio, materiali, una
  `InstancedMesh` per tipo e livello, aggiornamento delle istanze vicine mentre il cavaliere si muove, collisioni
  dei tronchi, contatori per F3.
- `main.js`: solo agganci (creazione e rimozione in `caricaScena`, `ostacoli.push`, aggiornamento in `frame`,
  righe in F3).
- **Coerenza col colore** [Probabile, la parte più delicata]: alberi e colore devono dire la stessa cosa. Oggi il
  «quanto bosco» (biomi spostati di ±350 m, radure, alpeggi) è calcolato dentro `coloreMondo`, in un modulo 3D.
  Proposta: spostare quel calcolo in una funzione pura `coperturaMondo(carta)` in `js/mondo/vegetazione.js`
  (bosco, radura, macchia, roccia, ghiaione, neve, temperatura) e farla usare **anche** da `coloreMondo`. [Certo]
  se lo spostamento è esatto i colori non cambiano (si verifica confrontando i colori di un blocco prima e dopo).
  Alternativa: copiare la formula (rischio di divergenza a ogni ritocco del colore).

**2. Posizionamento deterministico.**
- Per ogni tipo una **griglia del mondo** a passo proprio (alberi ~6 m, arbusti ~4 m, sassi ~5 m, massi ~20 m,
  affioramenti ~40 m, erba ~1 m): per la cella intera (ix, iz) `hash2(ix, iz, semeTipo)` decide se c'è un oggetto
  (confronto con la densità del punto), un secondo hash lo sposta dentro la cella, altri ne danno scala, rotazione
  e variante. Un solo albero per cella (i tipi di albero si contendono la cella per peso): niente tronchi
  compenetrati. Le celle sono del mondo, non del blocco: **due blocchi vicini producono gli stessi oggetti nella
  zona comune** [Certo, se densità ed esclusioni dipendono solo dal punto del mondo; vedi punto 3].
- Solo hash su interi e rumori esistenti (`rumore.js`); niente `Math.random`.
- **Densità** = prodotto di fattori lisci (bioma e copertura, temperatura alla quota, umidità, pendenza), così un
  bordo di bosco si dirada invece di finire a righello. Ai margini del bosco alberi più radi e più cespugli.

**3. Quota ed esclusioni.**
- **Decisione** (c'è o non c'è) da grandezze del mondo: bioma e clima dalla Carta, quota e pendenza da
  `quotaFinale`, acqua da `scavaFiumi` (pelo nell'alveo) e `livelloLago`, terrapieni da `distanzaPiano`.
- **Quota a cui si posa l'oggetto: quella della mesh del blocco** (`terrain.getHeight`, interpolazione dei
  triangoli disegnati), non `quotaFinale` diretta (domanda 2). [Certo] la mesh è `quotaFinale` campionata ogni
  7,8 m e interpolata a triangoli: ciò che si vede è la mesh, e tra un vertice e l'altro le due quote
  differiscono. [Probabile] lo scarto è di centimetri–decimetri sul rilievo fine (ottava più corta ~44 m), di più
  dove la quota piega di colpo (sponde e argini dei fiumi, bordi dei terrapieni): un tronco posato su `quotaFinale`
  resterebbe lì sospeso o sepolto. Costa anche meno (punto seguente).
- **Costo** [Probabile]: `quotaFinale` per ogni candidato (decine di migliaia, centinaia di migliaia per l'erba) è
  troppo lenta. Proposta: le esclusioni di quota, pendenza e acqua si leggono dalla **griglia del blocco** (quote,
  `fiume`, `lago` già calcolati da `generaScena`), che è `quotaFinale` campionata. Perché due blocchi diano gli stessi
  oggetti serve che la griglia del blocco stia su punti fissi del mondo (centro del blocco multiplo di 7,8125 m):
  oggi non è così (il blocco è centrato sul sito o sul punto scelto). È un dettaglio da concordare con la sessione
  di M7 per il passo 9 (domanda 8); finché il blocco non segue il cavaliere la differenza non si vede.
- **Esclusioni** (nessun oggetto, erba compresa salvo dove detto):
  - acqua: punti con pelo del fiume, del torrente o del lago, più un margine di riva di 1–2 celle (8–16 m) dove
    restano solo canne ed erba di riva;
  - pareti: pendenza oltre ~48° (dove il cavaliere non entra); alberi radi già da ~32°, nessun albero oltre ~40°;
    massi e sassi ammessi fino a 45° (ai piedi delle pareti sono i ghiaioni);
  - terrapieni: dentro un piano o la sua scarpata (`distanzaPiano(p, x, z) < p.s`) niente; nella fascia di ritorno
    (30 m) e in una **spianata** attorno alle mura (proposta 40 m, domanda 7) solo erba e sassi, niente alberi né
    cespugli (le cinte medievali tenevano sgombro il terreno attorno alle mura; e non coprono la rocca dal basso);
  - neve al suolo: niente erba né arbusti dove `coloreMondo` dipinge neve piena; conifere sì fino al limite degli
    alberi.

**4. Catalogo** (prima stesura, [Ipotesi] da tarare guardando):

| Tipo | Dove | Note |
|---|---|---|
| latifoglia (2–3 chiome) | bosco e alberi isolati in pianura e collina temperate | quercia, castagno, faggio stilizzati |
| conifera | bosco freddo e di montagna fino al limite degli alberi, nord | abete a palchi; più bassa e rada vicino al limite |
| pino | sud secco, pianura arida, collina calda | fusto alto, chioma a ombrello |
| albero di riva | lungo fiumi, torrenti e laghi | pioppo/salice |
| albero secco | palude, tundra, margine della steppa | rado |
| cespuglio | macchia sui pendii, margini del bosco, sottobosco | 2 varianti |
| arbusto d'alta quota | sopra il limite degli alberi (ginepro, mugo) | basso, scuro |
| canne | rive e palude | a ciuffi |
| erba (ciuffi) | ovunque ci sia prato, vicino al cavaliere | colore dal terreno sotto |
| fiori / felci | prati (fiori), sottobosco (felci) | punti di colore, pochi |
| sassi | dove c'è roccia o ghiaione, radi ovunque | piccoli, molti |
| massi | ai piedi delle pareti, alpeggi, erratici rari in collina | grandi, collisione |
| affioramenti | dove `coloreMondo` dipinge chiazze di roccia | lastre basse e larghe, collisione |
| tronchi caduti e ceppi | nel bosco | radi |

Deserto e steppa: arbusti secchi radi, sassi; niente piante esotiche (stile medievale europeo-mediterraneo).

**5. Mesh e stile** (regola 6).
- Geometrie da primitive deformate a codice (cilindri, coni, icosaedri schiacciati e spostati per vertice), un
  solo materiale per tipo con **colori per vertice** (tronco e chioma nella stessa geometria): una chiamata di
  disegno per tipo e livello. Variazione per istanza con `instanceColor` (tono della chioma) e scala/rotazione.
- `MeshLambertMaterial` o `MeshStandardMaterial` opaco (niente trasparenze ordinate: costano e sfarfallano);
  chiome a più lobi per non sembrare palle. Vento: leggera oscillazione nello shader per erba e chiome vicine
  (`onBeforeCompile`), costo trascurabile.
- **Livelli di dettaglio**: alberi *vicino* (~200–400 triangoli) entro ~150–200 m, *lontano* (~10–20 triangoli,
  stessa sagoma e colore medio) fino al bordo del blocco; arbusti e sassi in un solo livello con distanza propria.
  Il passaggio non deve «saltare»: gli oggetti che entrano crescono di scala nei primi metri.
- **Ombre**: nessuna ombra proiettata dalla vegetazione all'inizio; [Probabile] l'ombra dei soli alberi vicini
  (entro ~60 m) raddoppia le loro chiamate nel passaggio delle ombre e si valuta al passo 7 (domanda 6).

**6. Prestazioni.**
- **Chiamate di disegno ≤ 40** per tutta la vegetazione (il borgo di M7 ne avrà fino a 80). Conto previsto:
  alberi 5 tipi × 2 livelli = 10, arbusti 3, canne 1, erba 2, fiori/felci 1, sassi 1, massi 1, affioramenti 1,
  tronchi 1 → **~21**, margine per ombre o varianti.
- Una `InstancedMesh` grande non viene scartata per frustum (la sfera di contorno copre il blocco): la GPU elabora
  tutte le istanze. Quindi le istanze **vicine** (alberi vicini, erba, arbusti) si riscrivono quando il cavaliere
  si sposta di qualche metro, scegliendo dalla lista precalcolata solo quelle entro la distanza; le **lontane**
  restano fisse. [Probabile] riscrivere ~5 000–20 000 matrici ogni ~5–10 m di cammino costa 1–3 ms: va misurato.
- Distanze per tipo (proposte): erba 40–60 m, fiori/felci 40 m, sassi 120 m, arbusti 250 m, alberi vicini 180 m,
  alberi lontani e massi fino al bordo del blocco. Di notte (nebbia a ~110 m) gli alberi lontani si possono
  spegnere.
- Numeri attesi [Ipotesi, si misurano al passo 1]: blocco in collina boscosa ~30 000–70 000 alberi, ~10 000–40 000
  arbusti e sassi, ~10 000–30 000 ciuffi d'erba attivi; triangoli ~1–2 milioni. Costruzione < 300 ms (al cambio di
  Scena c'è già la schermata); oltre, nel Worker (cambio architetturale: si chiede allora).
- F3: istanze per tipo (attive/totali), chiamate di disegno della vegetazione e totali, triangoli, ms di
  costruzione e di aggiornamento delle istanze vicine.

**7. Collisioni e camera.**
- Tronchi degli alberi, massi e affioramenti alti: cerchi in una **griglia di 16 m** (si controllano solo le celle
  attorno al cavaliere), esposti come un ostacolo `spingiFuori` come il castello. Arbusti, erba, canne e sassi si
  attraversano (domanda 5).
- Camera: non urta la vegetazione (nel bosco salterebbe di continuo) [Probabile]; se una chioma si mette tra camera e
  cavaliere si accetta, o si rimpicciolisce l'albero più vicino alla camera (si decide guardando, passo 3).
  **Deciso con l'utente (visuale pulita):** nel bosco tronchi e chiome coprivano quasi sempre il cavaliere; ora sparisce
  solo ciò che lo copre davvero (`conVisuale` in `vegetazione3d.js`). Ogni oggetto è approssimato da volumi nel suo
  sistema (tronco + 4 fasce di chioma: cilindri verticali, scatole per le fasce allungate come i muretti) e lo shader
  controlla se i segmenti camera → piedi, busto e testa del cavaliere li attraversano (margine 0,35 m); i segmenti si
  fermano 0,4 m prima del cavaliere (il tronco contro cui cammina resta). Calcolo solo per gli oggetti vicini alla
  linea di vista. Storia delle richieste: prima spariva tutto ciò che era più vicino alla camera del cavaliere (anche
  siepi e muretti di lato: tolto); poi la dissolvenza «a retino» sembrava sfocata, non coerente con la grafica: ora
  l'oggetto **sparisce netto** (vertici fuori dallo schermo), senza trasparenze né `discard`. Erba e felci a ridosso
  della camera (1,6 m) si rimpiccioliscono. Spento con la camera libera (C). Le ombre finte a terra restano. Valori
  provabili da console: `kd.vegetazione.cfgVisuale` (margine, arretramento, raggio di erba e felci).
  **Comparsa con la distanza (richieste dell'utente, nov. 2026):** camminando alberi, massi e altri oggetti «apparivano
  dal nulla». Una prima versione li dissolveva a retino alle soglie di distanza (anche tra i modelli dello stesso
  oggetto, disegnati due volte nella fascia: +41 % di triangoli nel bosco fitto) e l'utente l'ha trovata sfocata e
  incoerente. Ora gli oggetti con una distanza massima (cespugli, sassi, siepi, muretti, tronchi caduti…) **crescono**
  dal suolo negli ultimi metri prima di quella distanza (12 % della distanza, 6–30 m; `CRESCITA`, `kdCresci`), solidi;
  le sagome diradate oltre 300 m crescono quando la densità supera la loro soglia (attributo `aSoglia`). Il passaggio tra
  i modelli dello stesso oggetto (vicino → medio → sagoma) è istantaneo come in origine. Il livello più lontano si
  assegna fino a 13 m oltre la sua distanza (lì misura zero); ridistribuzione ogni 12 m come prima. Misura in headless
  (seme 570549, blocco 97,00/80,64 km): ~355 mila triangoli elaborati contro ~419 mila della versione a retino, nessun
  errore. [Probabile] nessun costo GPU in più rispetto a prima delle due richieste (niente doppio disegno, niente
  `discard`): da confermare con il percorso di prova nel bosco fitto.

**8. Bordo del blocco e orizzonte.** Nell'orizzonte il bosco resta un colore (vincolo). [Probabile] con la nebbia
solo dai 10 km, dal blocco il bosco «finisce» al bordo e oltre resta il colore piatto: si vedrà, soprattutto
dall'alto. Rimedi senza toccare l'orizzonte: alberi lontani fino all'ultimo metro del blocco, più radi e più bassi
negli ultimi ~150 m; colore del terreno sotto il bosco già scuro. Se non basta, è una decisione dell'utente
(domanda 9).

**9. Tavullia, stagioni, M7.**
- Tavullia: non ha Carta né biomi (domanda 3).
- Stagioni (domanda 4): erba e latifoglie cambiano colore, d'inverno latifoglie spoglie e conifere con neve; calcolate
  al caricamento della Scena come la neve oggi.
- M7: nessuna modifica a `luoghi.js`, `castle3d.js`, `borgo3d.js`; i terrapieni si leggono da `carta.luoghi[].piani`.
  Prima della PR si fa il merge di `main` e si riprova la spianata sul borgo nuovo. Il blocco che segue il cavaliere
  (M7 passo 9) riuserà il modulo di posizionamento così com'è.

### Passi (ciascuno provato nel browser)

1. **Posizionamento e punti di controllo.** `js/mondo/vegetazione.js` con densità ed esclusioni; `coperturaMondo`
   condivisa con `coloreMondo` (colori invariati); in scena ogni oggetto è un punto colorato per tipo (una sola
   chiamata, `THREE.Points`), attivabile con un tasto di sviluppo. Script di prova in Node: due blocchi sovrapposti
   danno gli stessi oggetti nella zona comune; nessun oggetto in acqua, in alveo, oltre 48° o sui terrapieni, su
   30 semi. *Prova:* i punti verdi scuri coprono il bosco dipinto e lasciano le radure; niente punti in fiumi,
   laghi, pareti, rocca e borgo; F3 mostra conteggi per tipo e ms di costruzione; colori del terreno uguali a prima.
   **Stato: fatto, da provare dall'utente.**
   - *Copertura condivisa* (`coperturaMondo` in `js/mondo/vegetazione.js`, usata da `coloreMondo`): colori del
     terreno identici al bit a prima (1,2 milioni di punti a caso, 3 semi, primavera e inverno). `COLORI_MONDO`
     resta come altro nome di `COPERTURA`.
   - *Griglia del blocco sul mondo* (`centroBlocco` in `scena.js`, chiamato da `generaScena` e da `caricaScena`): il
     centro si sposta al più di 3,9 m su un multiplo di 7,8125 m; il cavaliere resta nello stesso punto del mondo
     (`scostamento` in `posizionaCavaliere`, anche per i salvataggi di prima). Due blocchi a 1 km hanno le stesse
     quote e lo stesso pelo dell'acqua su tutti i 33 153 vertici in comune.
   - *Posizionamento* (`posizionaVegetazione`): densità per vertice (bosco come il colore con bordi frastagliati da un
     rumore su 90 m, alberi isolati, rive, limite degli alberi, pendenza fine, roccia, ghiaioni, neve), una griglia
     del mondo per tipo (alberi 6 m con la specie per peso; cespugli e arbusti alti 4 m, sterpi 5, canne 3, sassi 5,
     massi 20, affioramenti 40, tronchi caduti 15), quota dal triangolo disegnato. 13 tipi: latifoglia, conifera,
     pino, albero di riva, albero secco, cespuglio, arbusto alto, sterpo, canne, sasso, masso, affioramento, tronco.
     Erba, fiori e felci (solo vicino al cavaliere) arrivano al passo 5.
   - *Confini netti tra biomi* [richiesto dall'utente dopo il passo 1: «i colori si sfumano nei bordi»]: in
     `coperturaMondo` i pesi bilineari delle 4 celle della Carta si accentuano (peso di ciascun bioma alla potenza
     8, passaggio largo ~140 m invece di ~1 km), lo spostamento dei confini ha 4 ottave (frastagliato fino a
     ~200 m); roccia su 6° di pendenza invece di 12°, affioramenti con soglia più stretta. Il clima resta continuo.
     Vale per colore e vegetazione insieme (bosco più netto ai margini). Effetto visibile ma modesto: la
     morbidezza che resta viene dal colore per vertice (7,8 m nel blocco, 62,5–2000 m negli anelli) e dalle
     normali lisce.
   - *Colore per pixel* [chiesto dall'utente: «più vicino più definito, più lontano meno»; fatto nella sessione
     M6]: `materialeSuolo` (terrain.js), usato dal blocco e dagli anelli dell'orizzonte. I vertici portano gli
     strati di `coloreMondo` (base, peso di roccia e neve, variazione, tono della roccia: attributi `base` e
     `strati`; `color` resta il colore completo per vertice). Nel fragment shader roccia e neve hanno una soglia
     per pixel sul peso interpolato più un rumore del mondo (scale 2–512 m): bordi netti e frastagliati, morbidi
     da lontano per anti-alias (`fwidth`); prato e roccia hanno un dettaglio di luminosità (2–128 m) che si
     spegne con la distanza (scala s tra 60·s e 200·s m). Rumore periodico su 8192 m in coordinate del mondo:
     blocchi diversi danno lo stesso disegno. `coperturaMondo` non cambia: la roccia piena dipinta sta dove il
     peso di roccia supera ~0,5 (± il rumore), dove la vegetazione mette affioramenti e sassi. Da misurare gli
     FPS su GPU vera (in headless nessun errore).
   - *Punti di controllo* (`js/3d/vegetazione3d.js`): un punto colorato per oggetto, 3 chiamate; tasto `V`.
     F3: oggetti per tipo, chiamate, ms di posizionamento (e dei campi), chiamate e triangoli totali.
   - *Misure* (Node, blocchi di 2×2 km): posizionamento 100–200 ms (campi sui vertici 55–100 ms; il blocco ne costa
     125–145); oggetti per blocco: bosco 60 000–75 000 (alberi 40 000–63 000), collina 6 000–20 000, pianura
     5 000–35 000, montagna 25 000–40 000 (soprattutto arbusti alti e sassi), sud e sabbia 7 000–25 000, palude
     ~30 000. **30 semi su 30** (blocco della partenza): nessun oggetto in acqua né sui terrapieni; il blocco spostato
     di 1 km mette gli stessi oggetti nella zona comune (oltre 40 m dai bordi). Tavullia: ~10 800 oggetti, nessuno sul
     colle del castello. In headless nessun errore.
   - *Limiti*: nei ~30 m dal bordo la pendenza «di zona» e la distanza dall'acqua non vedono oltre il blocco (lì
     blocchi vicini possono differire); il seme 48213 parte in una valle fredda (0,9 °C al mare): niente alberi, solo
     arbusti alti, coerente col clima; da vicino un punto copre mezzo schermo (sono punti di prova, non oggetti).
   - *Densità ritoccate dopo la prova dell'utente* (nel prato gli alberi isolati capitavano ogni 35–45 m: un pascolo
     alberato). Deciso con l'utente: **alberi isolati veri**, uno ogni ~100–150 m (`VEGETAZIONE.isolati`, ~4 volte
     meno), e **boschi di versante** a macchie (rumore su 350 m) sui pendii di 15–34° sotto il limite degli alberi,
     dove l'umidità supera ~0,3–0,45 (niente in sabbia, palude, neve), con la stessa densità del bosco della Carta.
     Il colore del terreno non cambia: sui versanti il bosco lo fanno gli alberi. Provato un bosco più fitto (0,9 per
     cella di 6 m, ~250 alberi per ettaro, fino a 93 000 alberi per blocco): **scartato dall'utente** per il carico;
     resta 0,62 (~170 per ettaro, 40 000–63 000 alberi nei blocchi di bosco). Misure: pianura ~1 albero ogni 125 m;
     collina umida 2 500 → 8 700 alberi, collina secca invariata. 30 semi: esclusioni e zona comune come prima;
     posizionamento 110–220 ms.
2. **Alberi.** Latifoglia e conifera, livelli vicino e lontano, aggiornamento delle istanze vicine, crescita
   all'ingresso. *Prova:* il bosco si legge come bosco da vicino e da 1 km; nessun tronco sospeso o sepolto;
   FPS in pieno bosco e da un'altura che guarda il blocco; chiamate e istanze in F3; giudizio dell'utente sullo stile.
   **Stato: fatto insieme alle mesh del passo 4 (richiesta dell'utente: tutti i punti diventano oggetti), da
   provare dall'utente.** `js/3d/vegetazione3d.js` sostituisce i punti di controllo:
   - *Modelli* da primitive deformate a codice, colori per vertice, `MeshLambertMaterial` (rocce sfaccettate):
     latifoglia (~11 m, sei lobi di chioma e due rami), conifera (~14 m, cinque palchi frastagliati), pino a
     ombrello, albero di riva (pioppo stretto e alto, verde più chiaro), albero secco (rami spogli), cespuglio, arbusto
     alto (mugo, basso e scuro), sterpo, canne, sasso, masso semisepolto, affioramento (lastra larga e bassa), tronco
     caduto. Variazione per istanza: tono, un po' di giallo, alberi più slanciati o tozzi, rocce inclinate.
   - *Livelli di dettaglio*: alberi vicini fino a 150 m (~400–600 triangoli), medi fino a 500 m (~60–100), lontani
     fino al bordo del blocco (~20–30, sagoma con fusto); cespugli e arbusti alti 70 m dettagliati e fino a 300 m
     semplici; canne 150 m, sterpi 200 m, sassi 120 m, tronchi 250 m; massi e affioramenti in tutto il blocco.
     Una `InstancedMesh` per tipo e livello (al più 22 chiamate, 14 nel blocco di partenza del seme 855588); matrici
     calcolate una volta, ridistribuite tra i livelli ogni 12 m di spostamento della camera (2–3 ms in headless).
   - *Misure* (headless, rendering software: non fa testo per gli FPS): partenza del seme 855588 ~12 500 oggetti
     disegnati, 0,4–0,8 milioni di triangoli di vegetazione (1,1 in tutto); costruzione 35–40 ms oltre al
     posizionamento. Nessun errore in console, nel mondo e a Tavullia. Le collisioni con i tronchi arrivano al passo 3.
   - *Dopo la prova dell'utente su Pages* (seme 570549: «bella la diversità tra campo aperto e bosco; chiome più
     verosimili, più varie, meno poligonali; serve sottobosco e prato, terra, fango, terreno misto»; poi sulle rocce:
     «più sassi piccoli in montagna, misure varie anche grandi massi di frana da girarci attorno, forme irregolari,
     grigi diversi»; poi «terra del sottobosco più scura e disomogenea, marrone chiaro e scuro, nero e verde»):
     - *Chiome a ciuffi*: 14–22 icosaedri piccoli sparsi su un ellissoide, con le normali dell'intera chioma (luce
       sopra, ombra sotto e dentro) e un tono per ciuffo. **Varianti** da vicino: quercia (larga), faggio (ovale e
       alto), castagno (a due masse); abete largo e slanciato (palchi a 12 lati con le punte che ricadono); pino a
       ombrello piatto e a due ripiani; due forme di cespuglio. Ogni istanza ha larghezza, altezza e una piccola
       inclinazione sue. Livello vicino ridotto a 110 m, medio a 450 m.
     - *Rocce spigolose*: icosaedro tagliato da 5–10 piani a caso (pietra spaccata) con uno scarto per vertice, grigi
       diversi per faccia, facce in alto più chiare, qualche lichene; per istanza grigi caldi e freddi, proporzioni e
       inclinazione. Tre forme di sasso, tre di masso, due di affioramento. Misure: sassi 0,2–2,2 e massi 0,4–3,4
       volte il modello (tanti piccoli, pochi enormi); **frane** a macchie ai piedi dei pendii ripidi in montagna con
       massi più fitti e fino a ~8 m; più sassi in montagna; **ciottoli** vicino al cavaliere (griglia di 1,5 m,
       raggio 40 m). Le collisioni con i massi grandi restano per il passo 3.
     - *Suolo nello shader del terreno* (`materialeSuolo` in `terrain.js`, unito al colore per pixel fatto in parallelo
       nella sessione del generatore, che dà già il dettaglio del prato): terra nuda a chiazze nei prati (anche negli
       anelli dell'orizzonte), **lettiera** sotto il bosco tra marrone chiaro,
       marrone scuro, quasi nero e muschio (tre scale di rumore), **fango** vicino all'acqua. Bosco e acqua arrivano
       per vertice dal posizionamento (`suolo`, attributo `aSuolo`); niente lettiera nella spianata di rocca e borgo;
       negli ultimi 120 m del blocco terra, lettiera e fango sfumano (l'orizzonte ha il solo colore).
     - *Erba e felci vicine* (anticipato dal passo 5): ciuffi di 14 fili entro 32 m (griglia del mondo di 0,6 m, colore
       dal terreno sotto), felci nel sottobosco umido entro 45 m, quasi niente erba sotto gli alberi; vento nello
       shader; si rimpiccioliscono verso il limite. Ricalcolati ogni 4 m (`erbaAttorno`, deterministico).
     - *Misure* (headless): blocco di bosco (seme 570549) ~56 000 oggetti disegnati, 2,0–2,2 milioni di triangoli di
       vegetazione, 25 chiamate; partenza del seme 855588 ~16 000 oggetti, 1,2 milioni; massimo teorico 40 chiamate.
       Ridistribuzione dei livelli 3–7 ms ogni 12 m, erba vicina ~6 ms ogni 4 m: [Probabile] un piccolo scatto in
       corsa sui PC lenti; se si vede, il lavoro va spezzato tra più fotogrammi. 30 semi: esclusioni e zona comune come
       prima; posizionamento 140–220 ms.
   - *Prestazioni dopo la misura dell'utente su Pages* (seme 570549, nel bosco: **40–48 FPS senza vegetazione, 28–30
     con**, 1,9 milioni di triangoli di vegetazione). Due cause distinte: (1) la scena senza vegetazione resta sotto i
     60 FPS con soli ~380 000 triangoli: [Probabile] il costo è per pixel (terreno a colore per pixel, ~15 rumori per
     pixel; ridotti da 4 a 3 quelli della lettiera), da guardare con la sessione del generatore; (2) la vegetazione
     aggiungeva ~18 ms, soprattutto con gli alberi medi (110–450 m, ~1 milione di triangoli) e i cespugli vicini.
     Deciso con l'utente: **meno definizione a centinaia di metri, più realismo entro 50 m**. Ora alberi vicini fino a
     **60 m** e più ricchi (latifoglie 20–30 ciuffi, abeti 8–10 palchi a 16 lati), medi fino a **300 m** con 3 ciuffi o
     2 palchi semplici, lontani ridotti a un ciuffo o un cono (abete lontano senza fusto, ~5 triangoli); cespugli e
     arbusti alti dettagliati fino a 35 m e semplici fino a 160 m; sassi 100 m, canne 110, sterpi 130, massi
     dettagliati 160. Nello stesso bosco: **540 000 triangoli** di vegetazione (erano ~2,1 milioni), 22 chiamate.
   - *Età diverse* (richiesta dell'utente: «alberi troppo identici, stesse altezze»): scale da 0,4–0,45 a 1,45–1,5
     con più alberi giovani (esponente 1,4), altezza indipendente dalla larghezza (0,72–1,28).
   - *Strade* (concordato con la sessione del generatore, `distanzaStrada` in `js/mondo/strade.js`, `VEGETAZIONE.strada`):
     niente alberi, arbusti, canne e tronchi entro 2 m dal bordo della carreggiata, radi fino a 6 m; sassi e ciottoli
     non sulla carreggiata, massi e affioramenti nemmeno a 1 m; erba non sulla carreggiata, felci non entro 2 m. La
     Carta arriva a `posizionaVegetazione` (`carta`). Seme 855588, 570549, 171289, 7: nessun oggetto sulla carreggiata,
     nessun albero entro 2 m, zona comune tra blocchi identica.
   - *Terreno vario senza oggetti* (richiesta dell'utente: «meno erba e felci; colorazione varia e chiaroscuri marcati
     da vicino anche senza pendenze, senza sprecare FPS in oggetti»; poi «niente vento, non vogliamo l'iperrealismo» e
     «se l'erba è più rada allunga il raggio oltre 50 m: il bordo del cerchio si vede»). Nello shader del suolo
     (`materialeSuolo`, blocco «Vegetazione»), entro ~150 m: chiazze secche (ocra) e cupe (verde scuro) su 4–16 m e
     luminosità che oscilla di ±38 % su 4 m; **micro-rilievo finto** della normale (gobbe ~4 m, zolle ~2 m, ciuffi ~1 m)
     su prato e sottobosco: la luce del sole fa il chiaroscuro anche sul piano e cambia con l'ora (stesso schema della
     neve della sessione grafica). Lettiera con meno muschio (con il rumore a texture dominava il verde oliva). Erba
     ~4 volte più rada su una griglia di 1,1 m ma fino a **70 m** (felci 70 m, ciottoli 50 m), più chiara; fili e fronde
     con la normale che non si capovolge sul retro (prima il retro restava nero); **niente vento**.
   - *Ombre finte e piede scuro* (richiesta dell'utente: «gli oggetti sembrano staccati dal terreno, su due piani»; nel
     gioco non c'è nessuna ombra proiettata, e senza ombra l'occhio non vede il contatto). Scelta con l'utente tra tre
     strade (ombre a macchia nel terreno, piede scuro, ombre vere di Three.js entro ~40 m): le prime due, che costano
     una lettura di texture per pixel; le ombre vere restano un'opzione per dopo (secondo disegno della scena, 5–8 ms).
     In `vegetazione3d.js` (`creaOmbre`, `FORMA_OMBRA`): una texture di 1024² sul blocco (~2 m per pixel) con l'ombra di
     ogni albero, cespuglio e roccia, macchia sfumata spostata dalla parte opposta al sole e allungata col sole basso
     (fino a 4 volte l'altezza), sovrapposte con il massimo (il bosco fitto fa penombra continua); ridisegnata quando il
     sole si sposta di 5°, a pezzi di 6 000 oggetti per fotogramma su una seconda tela, poi scambiata (la prima volta
     tutta subito). Una texture di 2048² (~1 m) con il **piede**: alone scuro fisso attorno al punto di contatto. Lo
     shader del suolo (`uOmbre`, `uPiede`, `uOmbreForza` in `materialeSuolo`) scurisce il colore del massimo dei due;
     le ombre del sole si spengono di notte e con il tasto V. Più scura anche la base delle rocce e dei ciuffi d'erba.
     **Correzione (WebGL CONTEXT_LOST sul PC dell'utente, seme 570549, dopo la PR #116; segnalato dalla sessione M6):**
     le ombre erano disegnate su una tela 2D in modo «lighten», che sulla GPU copia l'immagine intera a ogni oggetto;
     con ~78 000 oggetti il fotogramma superava i 2 s e Windows resettava la GPU (in headless la tela è sul processore e
     non succedeva). Ora le ombre si calcolano in JavaScript su array di byte (ellissi sfumate, massimo), caricati come
     texture a un canale (`DataTexture` R8): nessuna operazione di tela. Il micro-rilievo del prato si ferma a 80 m
     (prima 150) e usa differenze in avanti (9 letture di texture invece di 12).
   - *Sagome degli alberi lontani e bosco oltre il blocco* (richiesta dell'utente: «uno stacco troppo netto tra la
     vegetazione della cella del cavaliere e il nulla delle celle vicine»; concordato con la sessione delle prestazioni,
     `docs/PRESTAZIONI.md` passo 4; prima misura sulla scheda dell'utente: vegetazione 4,9 ms GPU contro 4,0 di budget).
     Al caricamento si disegna dal codice un **atlante** (2048×256, 8 tessere da 256) con i modelli vicini di quercia,
     faggio, abete, pino, pioppo e albero secco; le **sagome** sono due triangoli rivolti alla camera attorno all'asse
     verticale, alpha test, luce come il terreno (`materialeSagome`). Nel blocco prendono il posto del livello lontano
     (oltre 300 m) e, negli ultimi 150 m verso il bordo, già oltre 120 m dalla camera: una sola chiamata per tutti gli
     alberi lontani (prima una per tipo). Negli **anelli dell'orizzonte** fino a 4 km (`boscoLontano` in
     `js/mondo/vegetazione.js`): stesse regole del bosco del blocco valutate su una griglia di 50 m sulla quota
     disegnata degli anelli (`quota` esposta da `creaOrizzonte`, una riga in `orizzonte.js`), cella degli alberi che
     cresce con la distanza (6 m al bordo del blocco, 12 m a 2 km: densità come 1/d²) e scala come la radice della
     cella; niente alberi in laghi e mare; una chiamata. Prima versione: seme 570549 ~137 000 sagome lontane, e la
     sessione delle prestazioni ha misurato che da sole raddoppiavano il fotogramma in headless (2190 contro 610 ms).
     **Ridotte** (obiettivo ≤ 20–30 000): raggio 3 km; oltre 1,3 km il bosco si dirada fino all'8 % a 3 km, con
     alberi più grandi a compensare (scala fino a ×2,8) perché la massa resti; cella di base 10 m. **Corretto**
     (l'utente: «gli alberi lontani sono molto grandi in proporzione»): la scala cresceva anche con la cella, ×1,3 al
     bordo e fino a ×6 a 3 km; ora le sagome lontane hanno le stesse taglie degli alberi del blocco e il bosco lontano
     si legge più rado. Seme 570549:
     ~28 000 sagome lontane (63 ms) più ~12 500 nel blocco; seme 855588: ~13 000 più ~3 400. Nessun vuoto al bordo
     del blocco. Da rimisurare (sessione delle prestazioni, poi la scheda dell'utente con `?prova`).
   - *Bosco fitto* (misura dell'utente sulla UHD 730, seme 570549 a 99937, 43289: vegetazione 10,3 ms contro 4 di
     budget; «resto» 6,2 ms, sagome del blocco 3,3 ms con 59 000 istanze): latifoglie vicine con ciuffi pieni (80
     triangoli l'uno, ~2450 ad albero) solo entro 25 m, da 25 a 60 m la stessa chioma a ciuffi semplici (20 triangoli,
     ~650 ad albero; ogni specie ha un generatore suo, quindi la forma non cambia al passaggio); sagome del blocco
     piene fino a 600 m dalla camera, poi diradate come (600/d)², la legge del bosco lontano, con cui al bordo si
     raccordano. In headless nello stesso punto: latifoglie vicine da ~333 000 a ~145 000 triangoli, sagome del
     blocco da 59 500 a 36 200, vegetazione da 792 000 a 571 000 triangoli; chiamate da 26 a 29.
   - *Scatti dopo i campi e Carta rigenerata* (misura dell'utente dopo #135–#140: «vegetazione: aggiorna» fino a
     13,5 ms alla partenza; bosco fitto 7,2 ms GPU contro 6,5): il pezzo lungo era l'erba vicina, un tipo intero in un
     fotogramma (in headless fino a 21 ms attorno alla rocca). Ora l'erba si calcola a fasce di righe (`fascia` in
     `erbaAttorno`; 32 per l'erba) e si scrive in un buffer a parte copiato alla fine; erba e ridistribuzione
     dividono un tetto unico di ~1,5 ms per fotogramma. Percorso di prova in headless: picco da 21 a ~3,2 ms. Bosco
     fitto: latifoglie medie fino a 200 m invece di 300 (poi sagome): triangoli della vegetazione da 649 000 a
     478 000, sagome +2 600; a vista uguale. Misura dell'utente dopo: partenza risolta (aggiorna al più 3,1 ms);
     bosco fitto 7,0 ms, il costo passato alle sagome (2,5 ms, 38 800, pixel sovrapposti con alpha test). Sagome del
     blocco diradate già da 300 m (prima 600) con densità (300/d)^k, k scelto perché al bordo valga il 36 % del bosco
     lontano: in headless da 38 900 a 30 800.
   - *Campi coltivati* (dopo la milestone Prestazioni; decisioni dell'utente: niente stagioni, estensione come
     proposta più «qualcosa intorno a case isolate e villaggi»): `CAMPAGNA.raggi` per tipo di luogo (rocca secondo la
     classe 0,5–2 km; `villaggio` 0,3–0,7 km e `casa` 70–200 m già pronti per quando la milestone dei luoghi li
     aggiungerà a `carta.luoghi`). `CAMPI_COLTIVATI`: campi dove la campagna è piena, pendenza fine sotto 9–16°,
     all'asciutto, senza roccia, neve, sabbia né palude; terza componente di `aSuolo`. Lo shader del suolo (ramo che
     finisce nella cottura: nel gioco non costa) disegna strisce lungo il verso del borgo (20–55 × 70–190 m, piegate
     da un rumore su 128 m): arato con solchi, seminato, grano, fieno, maggese; orti più piccoli entro ~0,2 del raggio
     pieno; capezzagne erbose tra un appezzamento e l'altro; dove la campagna finisce si fermano appezzamenti interi.
     Nei campi niente alberi, arbusti né sassi, meno erba. Caricamento di un blocco vicino a un luogo: ~+60 ms.
     *Siepi e filari*: il disegno degli appezzamenti (`PARCELLE`) è calcolato uguale dallo shader e da
     `posizionaVegetazione`: coordinate dei campi per vertice (attributo `aCampi`, interpolato sui triangoli come la
     scheda video) e una permutazione di 256 interi (`PERM_CAMPI`, texture R8), niente rumori della scheda. Siepi sul
     40 % dei lati lunghi e sul 20 % dei corti; un quarto sono filari di alberi (pioppi, betulle o querce ogni 9 m).
     Cespugli ogni 1,7 m a 0,9 m dal confine, solo dove il campo è dipinto; lo shader dipinge sotto la siepe una
     striscia scura che da lontano, dove i cespugli non si disegnano più, la mostra. Circa 6000 cespugli in un blocco
     attorno a una rocca. *Strade* (richiesta dell'utente: i campi non tagliati a metà dalle strade, al più fino al
     margine): quarta componente di `aCampi` = lato e margine della strada; i campi finiscono 1–2 m oltre il margine
     con erba; da un lato una fascia di campi propria larga 20 m, poi riprende il disegno normale (regola che dipende
     solo dal punto: blocchi vicini uguali, verificato). Percorso di prova in headless alla partenza (una rocca):
     triangoli da 583 000 a 596–640 000, CPU della vegetazione come prima (picchi già presenti senza le siepi).
     *Muretti a secco* (`PARCELLE.muretti`): fino a 150 m oltre il limite degli orti il 60 % dei confini con la
     siepe è un muretto (tratti di 2,2 m di pietre spaccate a passo 1,7 m, alti ~1 m, diritti lungo il confine; da
     50 a 220 m un blocco semplice; oltre, una striscia di pietra nel suolo cotto), con un varco di 5 m per lato per
     passare; collisione come i tronchi caduti (tre cerchi). 300–1300 tratti in un blocco attorno a una rocca.
     *Siepi* (richieste dell'utente: «senza collegamento con il terreno, si vedono sospese»; «non attraversabili, con
     punti dove cessa e si possa passare»; «più di un punto per lato, una cosa naturale»): tipo `siepe` con un modello
     suo che scende sotto il terreno (alta ~1,8–2,2 m), collisione a cerchi da 0,75 m che si toccano (il cavaliere ci
     sbatte); aperture naturali: ogni tratto di 28 m ha col 60 % un'apertura larga 2,6–6 m in un punto a caso (anche
     nella striscia del suolo cotto). I muretti restano con un varco solo per lato. Prova: camminando verso una siepe
     il cavaliere si ferma a 0,6–1,2 m (11 su 12; il dodicesimo passa da un'apertura).
     *Fiumi* (richiesta dell'utente: «molte pietre di diverse dimensioni lungo gli argini e in mezzo al corso d'acqua,
     senza esagerare»): distanza dai soli fiumi (non laghi né mare); sulle prime due celle di riva più sassi, ciottoli
     e qualche masso (`VEGETAZIONE.fiume`); nell'alveo, dove l'acqua è fonda al più 1,2 m, pietre su una griglia di
     2,5 m (22 %, meno dove è più fonda; massi dove supera 0,45 m), alla quota scelta perché la cima affiori di
     5–40 cm (l'acqua è quasi opaca: sommerse non si vedrebbero). In un blocco con ~1,6 km di fiume: ~300 pietre
     nell'alveo e ~850 in più sulle rive. Le prove di regressione contano a parte le pietre nell'alveo.
     *Bosco ripariale* (richiesta dell'utente: «lungo i fiumi un po' più alberi, qualche tronco e rami sul bordo»):
     fascia di 4 celle (~30 m) dai fiumi con densità degli alberi fino a 0,42 (pesi 1 / 0,85 / 0,6 / 0,3 per cella),
     specie di riva (pioppi, betulle), più tronchi caduti; nuovo tipo `ramo` (rami secchi a terra, si attraversano;
     anche pochi nei boschi). Blocco arido con ~1,6 km di fiume: alberi da 482 a 809, 36 tronchi, ~600 rami.
     Bosco lontano: lungo i tracciati dei fiumi fuori dal blocco (`tracciatiFiumi`) tre file di sagome di riva per lato
     (a 4, 12, 22 m oltre la sponda, probabilità 0,85 / 0,6 / 0,3; passo che cresce con la distanza, reticolo del
     mondo): ~1700 sagome in più in un blocco con un fiume (prima 43 sagome lontane in quella zona arida).
     *Ghiaia sulle rive* (richiesta dell'utente: «un po' di ghiaia sui bordi ogni tanto», non sotto l'acqua): quarta
     componente di `aSuolo`, a chiazze su ~35 m nelle prime due celle dai fiumi, dipinta nel suolo cotto.
     *Massi erratici* (`VEGETAZIONE.erratici`): pochi massi di 4–8 m isolati nei prati (non nel bosco, nei campi,
     vicino a strade, case e terrapieni). *Alberi lungo le strade* (`stradaAlberi`): a tratti, a 2,5–5 m dal bordo,
     fuori dal bosco; poi ridotti (richiesta dell'utente: «il mondo medievale è più casuale, non un viale»): pochi
     tratti, radi, sparsi tra 2,5 e 10 m dal bordo (~50 in un blocco).
     *Chiome e cespugli* (richiesta dell'utente: chiome «troppo arrotondate o piene, si vede che sono di un gioco»;
     arbusti «con pezzi vuoti, fatti da più elementi, non un blocco come un masso»; senza appesantire): `chiomaAMasse`,
     la chioma in 4–7 masse separate, ognuna con pochi ciuffi e un ramo dal fusto (`ramoVerso`), con vuoti da cui si
     vedono cielo e rami; stesso numero di ciuffi di prima (latifoglie, alberi di riva, livello medio con 4 masse).
     Cespugli di 4–6 ciuffi bassi su rametti, il più basso a terra. Niente foglie con alpha test (costose sulla
     scheda di riferimento). Poi, su richiesta dell'utente («rami e foglie mischiati anche più in basso, buchi che fanno
     vedere i rami anche in alto; non un disegno da bambini»): latifoglie e alberi di riva `ramificato`: fusto corto, una
     cima che prosegue, 5–6 rami principali da altezze diverse con 2 rametti l'uno; foglie in gruppi di 2 ciuffi piccoli
     lungo i rami, sulle punte e lungo la cima, a tutte le altezze. Livelli: pieni entro 18 m, ciuffi semplici fino a
     50 m, medio (3 masse) fino a 200 m, poi sagome (rifatte dai modelli nuovi). Rami (richiesta dell'utente: «troppo
     fuori dal tronco, cadrebbero; tutti lunghi uguali e con le stesse angolazioni»): 35–75° sull'orizzontale, due
     tratti con il secondo che piega in su, lunghezze 45–115 %, direzioni irregolari, 1–3 rametti, punte coperte di
     foglie; più foglie lungo i rami nel bosco («troppi buchi»). Ciuffi a *schegge* («niente marshmallow di verde,
     senza arrivare alle foglie singole»): ogni ciuffo è un grappolo di tetraedri appiattiti orientati a caso (12 da
     vicino, 5–6 più lontano e nel livello medio), luce secondo l'inviluppo dell'intera chioma; anche i cespugli.
     Correzioni successive dell'utente: con le sole schegge «sembrano alberi spogli» e poi «torna un po' alle
     rotondità»: ogni ciuffo ha un *nucleo* tondeggiante (icosaedro deformato; ottaedro nel livello medio) e poche
     schegge piccole di frangia (4 entro 18 m, 1 fino a 50 m, 2 nel medio), forme miste tetraedri/ottaedri; rami più
     corti (−30 %) e ciuffi più grandi, chiome compatte. Tronco («stuzzicadenti dritto da base a cima», «troncato in
     cima»): sopra il fusto si divide in 2–3 cime storte (quercia e castagno 3, faggio 2, riva 1) che si assottigliano
     fino a 2–3 cm e finiscono dentro l'ultimo ciuffo; ramo e rametti finiscono a 1–2 cm; nel livello medio il fusto
     sale dentro la chioma assottigliandosi. Spessore del tronco proporzionato all'altezza dell'istanza (larghezza =
     altezza ±15 %, prima indipendenti). Cespugli: ciuffi ravvicinati e uno al centro.
     Tronco e rami curvi («stuzzicadenti incastrati»): `ramoCurvo`, tubo lungo una curva Catmull-Rom che si assottiglia;
     tronco con l'asse un po' storto, cime, rami e rametti in un pezzo solo con piccole pieghe a caso (`piega`); 3–6
     tratti entro 18 m, 2–4 fino a 50 m.
     Livelli medi coerenti con i vicini («pali con ciuffi di cespuglio in cima», vista dall'alto oltre i 50 m): la
     latifoglia media (50–200 m) aveva il verde a 5,8–13,8 m contro 2,3–9,5 del modello vicino, in 3 masse staccate;
     ora 7 ottaedri che si toccano alla stessa altezza e larghezza (~64 triangoli come prima; `chioma` con `leggero` e
     senza schegge). Pioppo di riva: cima corta e 8 rami ripidi (prima una cima nuda di ~9 m), medio con il verde da
     ~3 m. Pino domestico rifatto (`pinoDomestico`): fusto storto che si apre in 2–3 branche, ombrello largo e piatto
     con un gruppo di ciuffi su ogni branca e uno al centro (~1150 triangoli vicino, ~100 medio). Bosco fitto invariato
     (763 000 contro 769 000 triangoli in headless, con le fasce di passaggio).
     Cime senza ciuffi staccati (richiesta dell'utente: in punta ai pioppi e ai faggi un ciuffo chiaro sopra un tratto
     di ramo nudo, ripetuto su ogni albero uguale): foglie lungo tutta la cima (metà del primo tratto, piega, metà del
     secondo solo entro 18 m, punta) con l'ultimo ciuffo centrato un po' sotto la punta; cime più corte (faggio 5,2 m,
     pioppo 3 m). Bosco fitto: 568 000 triangoli contro 553 000.
     Bosco fitto in headless: ~550 000 triangoli (prima delle chiome nuove 458 000): da misurare sulla scheda.
     *Case fuori dal borgo* (richiesta dell'utente: case isolate o a gruppetti di 2–3 in mezzo o a lato dei campi):
     `CASE_CAMPAGNA` / `caseCampagna(carta)`, siti deterministici per Carta (4–9 gruppi per rocca secondo la classe,
     tra gli orti e il limite dei campi pieni, in piano, all'asciutto, lontano dai terrapieni e tra loro, orientati
     come i campi); nel blocco si scartano quelli che la strada fine tocca. Attorno: aia libera (12–20 m), poi orto;
     niente siepi né muretti. Gli edifici li disegna chi fa le case (M7, passo 5): `pos.case` ha posizione e verso.
     Da fare: i campi negli anelli dell'orizzonte (ora solo nel blocco); il bordo della zona coltivata segue i
     triangoli del terreno (un po' seghettato).
   - *A pezzi* (passo 9 di M7, blocco che segue il cavaliere): `posizionaVegetazioneAPezzi(o, budget)`,
     `boscoLontanoAPezzi(…, budget)`, `creaVegetazioneAPezzi(pos, terrain, renderer, budget)` e, sull'oggetto,
     `aggiungiLontanoAPezzi(…, budget)` e `preparaOmbre(dir, budget)`: generatori che fanno `yield` ogni ~`budget` ms
     (2,5) e alla fine restituiscono lo stesso risultato delle versioni intere (che ora li eseguono fino in fondo;
     verificato uguale, oggetto per oggetto). Modelli, atlante delle sagome e volumi della visuale si fanno una volta
     sola e si condividono tra i blocchi (`userData.condivisa`: chi libera un blocco non ne chiama dispose). In
     headless: pezzi ≤ ~4–5 ms; costruzione 3D da ~360 a ~95 ms (modelli già fatti).
   - *Scatti*: la ridistribuzione delle istanze (ogni 12 m) si fa a pezzi, al più ~1,5 ms per fotogramma, e mai nel
     fotogramma in cui si rifà l'erba vicina; erba, felci e ciottoli si rifanno uno per fotogramma. In headless nel
     bosco fitto, camminando 200 m: costo peggiore di un fotogramma da ~11 a ~5–6 ms (resta il calcolo dell'erba).
   - *Collisioni (passo 3)*: tronchi, massi, affioramenti, tronchi caduti (tre cerchi) e sassi di scala ≥ 1,1 come
     cerchi in una griglia di 16 m, ostacolo per il cavaliere come le mura (`spingiFuori`). Prova: correndo contro un
     tronco il cavaliere si ferma a 0,6–0,8 m dal centro e ci scivola attorno.
   - *Elementi che mancavano* (proposti all'utente, primi passi): **campagna attorno a rocche e borghi** (bosco
     disboscato al 92 % entro 0,7–1,6 km dal luogo, bordo irregolare ±300 m, il triplo degli alberi isolati; anche nel
     bosco lontano; seme 570549 da 78 000 a 45 000 oggetti); **margine del bosco** con alberi più giovani e bassi
     (fino a −35 %); **legno morto** (5 % di alberi secchi anche nei boschi); **rive** con ghiaia e sassi. Da fare: campi,
     orti, siepi e muretti (shader del suolo e luoghi, con le sessioni M1, M6 e M7), alvei con ghiaia nell'acqua,
     fiori, biomi meno curati (palude, tundra, deserto); le cose della campagna con la milestone dei luoghi.
   - *Suolo della campagna* (segnalato dalla sessione delle prestazioni: macchie scure dove il bosco è stato
     diradato): il colore del terreno (`coloreMondo`) dipingeva il verde cupo del bosco dalla copertura anche dove
     gli alberi non ci sono più → nella campagna (`campagnaMondo`) il bosco passa al colore del prato (~13 ms in più
     per blocco vicino a un luogo, solo al caricamento). La lettiera (`aSuolo`) segue gli alberi davvero piantati
     (chiome sfocate su 3×3 vertici) e non solo la copertura: nel bosco fitto resta quasi uguale (media da 0,94 a
     0,91), attorno alla rocca del seme 570549 i vertici con lettiera > 0,3 scendono da 14 500 a 3 500.
3. **Collisioni.** Tronchi, massi e affioramenti come ostacoli a griglia. *Prova:* si attraversa un bosco fitto
   scivolando tra i tronchi senza incastrarsi; la camera resta usabile nel bosco.
4. **Arbusti e rocce.** Cespugli (macchia, margini, sottobosco), arbusti d'alta quota, sassi, massi, affioramenti
   e ghiaioni ai piedi delle pareti. *Prova:* in montagna e in collina sassi e massi stanno dove il terreno è
   dipinto di roccia o ghiaione; FPS invariati.
5. **Erba vicina.** Ciuffi entro 40–60 m che seguono il cavaliere, colore dal terreno sotto, vento, dissolvenza per
   scala al limite. *Prova:* camminando non si vede il bordo dell'erba che avanza; FPS invariati.
6. **Varietà per bioma e clima.** Pino e macchia del sud, steppa e deserto radi, conifere basse al limite degli
   alberi, palude (canne, alberi secchi), rive (alberi di riva, canne), alberi isolati, fiori, felci, tronchi
   caduti. *Prova:* su 3–4 semi, scene in pianura, collina, bosco, montagna, sud arido, nord freddo e lungo un
   fiume si distinguono a colpo d'occhio.
7. **Rifiniture** (stagioni rinviate, ombre dopo: decisioni 4 e 6). Vento, toni per istanza, resa delle chiome
   dopo il giudizio dell'utente al passo 2; bordo del blocco non affrontato (decisione 9). *Prova:* FPS invariati.
8. **Misure e chiusura.** Caso peggiore (bosco fitto in collina accanto alla rocca di partenza, dopo il merge di
   M7) di giorno e di notte; verifica su 30 semi delle esclusioni; aggiornare «Stile visivo» in testa al documento.
   *Prova:* 60 FPS su PC medio dell'utente su Pages; vegetazione ≤ 40 chiamate.

### Accettazione

Nelle Scene del mondo generato il bosco dipinto è un bosco vero, con radure, margini radi e sottobosco; macchia,
rocce, massi e ghiaioni stanno dove il colore li indica; erba vicina al cavaliere; tipi diversi per bioma, quota e
clima; niente oggetti in acqua, negli alvei, sulle pareti, sui terrapieni di rocca e borgo; si cammina nel bosco
senza attraversare i tronchi e senza incastrarsi; due blocchi vicini hanno gli stessi oggetti nella zona comune;
60 FPS su PC medio; vegetazione ≤ 40 chiamate di disegno; F3 mostra istanze, chiamate e tempo di costruzione;
Carta e `VERSIONE_GENERATORE` invariate.

### Rischi e incertezze

- [Probabile] Il rischio maggiore sono le **prestazioni nel bosco fitto**: decine di migliaia di alberi lontani più
  le istanze vicine, sommati al borgo di M7 (80 chiamate). In headless il rendering è software e non fa testo: la
  misura vera è dell'utente su Pages. Ripiego: alberi lontani più radi (si vede solo la sagoma del bosco) o una
  distanza più corta per il livello lontano.
- [Probabile] Lo **stacco al bordo del blocco** (punto 8) con la nebbia dai 10 km.
- [Probabile] Con le sole primitive un albero resta riconoscibile ma stilizzato; la resa vera si giudica al passo 2
  (le regole per eventuali apporti esterni sono già scritte in M4 e richiedono di cambiare la regola 6).
- [Ipotesi] Il bosco fitto rende difficile orientarsi e inquadrare il cavaliere (camera); rimedio: radure e
  sentieri naturali più frequenti, chiome trasparenti vicino alla camera.
- [Certo] Lavorando in parallelo a M7, `main.js` e `terrain.js` saranno toccati da entrambe le sessioni: conflitti
  al merge probabili ma piccoli (agganci). Si fa il merge di `main` prima di ogni PR.
- [Probabile] Se la griglia del blocco non si allinea al mondo (domanda 8), al cambio di blocco qualche oggetto
  vicino a una soglia (riva, 48°, bordo di un terrapieno) può comparire o sparire.

### Decisioni prese con l'utente (novembre 2026)

1. **File nuovi approvati:** `js/mondo/vegetazione.js` (posizionamento, senza grafica) e `js/3d/vegetazione3d.js`
   (mesh); la copertura (bosco, radure, roccia, neve) si sposta da `coloreMondo` in `coperturaMondo`, condivisa.
2. **Quota degli oggetti dalla mesh del blocco**; le decisioni sulle grandezze del mondo (campionate sui vertici
   del blocco, che stanno su punti fissi del mondo).
3. **Tavullia: profilo fisso di collina temperata** (bosco e roccia dove il suo colore li dipinge).
4. **Stagioni rinviate** (il passo 7 resta per le rifiniture).
5. **Collisioni**: tronchi, massi, affioramenti e sassi grandi; sassi piccoli, arbusti ed erba si attraversano.
6. **Ombre della vegetazione: dopo.**
7. **Spianata attorno alle mura: non fondamentale**; resta un parametro (`VEGETAZIONE.spianata`, 20 m).
8. **Griglia del blocco allineata al mondo: fatta qui** (`centroBlocco` in `scena.js`).
9. **Bordo del blocco** (stacco tra gli ultimi alberi e il colore piatto dell'orizzonte): **non affrontato**, si
   vedrà più avanti.

## Vista meno lunga dalle alture (novembre 2026)

Segnalato dall'utente: da un'altura di 1500 m si vedeva quasi tutta la mappa (fisicamente possibile solo con aria
tersa: l'orizzonte geometrico è a ~140 km). Tre interventi decisi con l'utente:
1. **Foschia secondo il tempo** (sessione «M1 - grafica», `main.js`): di norma il paesaggio sbiadisce oltre 30–40 km,
   nelle giornate limpide si vede fino a 80–100 km.
2. **Curvatura** (`orizzonte.js`): raggio 2 volte quello vero invece di 4; a 50 km il terreno cala di ~90 m (prima
   ~45), a 100 km di ~380 m (prima ~190; vero ~680 con la rifrazione).
3. **Esagerazione lontana solo dei rilievi alti** (`orizzonte.js`, `esagera.soglia` 1000 m): si gonfia solo la parte
   oltre 1000 m, fino a +40 % a 100 km; colline e pianure lontane restano vere.

## Meno mare (novembre 2026)

Richiesto dall'utente: nel mondo di 120×90 km non c'è un «di là dal mare», il mare aperto ai bordi era spazio sprecato;
i bracci di mare interni invece danno varietà e restano. Misurato su 20 semi: mare 16 % in mediana (max 22 %), di cui
7 % oltre 5 km dalla costa. Provati due modi di tagliare solo il mare aperto (alzando le celle lontane dalla terra:
anelli e canali attorno alla terra nuova; tenendo solo una fascia lungo il bordo: strisce dritte e golfi persi):
scartati. Fatto: la parte a mare del carattere del seme scende da 10–22 % a **5–11 %** (`FORMA.mare`), niente più
spinta verso il mare ai bordi (`FORMA.bordo.profondita` 0). Il livello per quantile tiene le coste naturali e il mare
si ritira nelle parti più basse, bracci e mari interni compresi. Risultato su 20 semi: mare 8 % in mediana (5–11 %),
oltre 5 km dalla costa 2 %; verifiche su 8 semi come prima (79190 senza castello di valle, già noto).
`VERSIONE_GENERATORE` `…+mare-1`.

## Strade e sentieri (proposta, da approvare)

> Chiesto dall'utente (novembre 2026): «strade di terra battuta che colleghino gli elementi di colline e pianure,
> e sentieri di montagna; un compromesso tra il tragitto più breve e pendenze non esagerate, a cavallo e a
> piedi». Riferimenti: `docs/GDD.md` §2 («Strade, ponti e guadi», valichi e forcelle) e §3 «Viaggio».
> **Stato: passi 1–2 fatti (approvati dall'utente: «procedi con le strade passi 1-2»), da provare. Pendenze della
> tabella, file `js/mondo/strade.js`: confermati.** Passi 3–5 da fare.

**Cosa c'è oggi** [Certo, dal codice]: rocche e borghi di M7 (3 per mondo), valichi (2 per mondo), gruppi
montuosi con le forcelle, fiumi con bacino, profondità e guadabilità (fino a ~0,9 m, bacino ~150 km²). Il
viottolo dalle porte del borgo è l'unica «strada». Il GDD prevede 30–40 castelli e 60–100 villaggi: **la rete
vera ha bisogno di luoghi che ancora non ci sono** [Certo]. Con 3 rocche e 2 valichi una rete generata oggi è
rada; il generatore deve quindi prendere i nodi come dati e funzionare uguale quando i luoghi arriveranno.

### Decisioni tecniche (proposte)

**1. Due scale, come i fiumi.** Sulla Carta la **rete** (celle di 1 km, ricerca A* a 16 direzioni, pochi ms per
tutta la regione); nella Scena il **tracciato fine** di ogni tratto (griglia di ~10–20 m in un corridoio attorno
al tracciato della Carta, come `tracciaPercorso` per i fiumi), dove nascono i **tornanti**. Su celle di 1 km i
tornanti non esistono: lì la pendenza si misura sulla quota della Carta e il vincolo duro vale solo nella Scena.

**2. Costo: corto ma non ripido.** Costo di un passo = lunghezza × (1 + (p / p₀)²) + attraversamenti, con p la
pendenza lungo il passo; oltre p_max il passo è vietato (il percorso è costretto a girare: tornanti o
traversi). Per classe [Ipotesi, da tarare guardando]:

| Classe | Per chi | p₀ (comoda) | p_max | Larghezza nella Scena |
|---|---|---|---|---|
| strada maestra | carri, cavalli, a piedi | 5 % | 10 % | 4–5 m |
| carrareccia | carri leggeri, cavalli | 7 % | 14 % | 3 m |
| mulattiera | cavallo a mano, bestie da soma | 12 % | 25 % (tornanti) | 2 m |
| sentiero di montagna | a piedi | 20 % | 45 % (tornanti stretti) | 1 m |

Il quadrato fa sì che un po' di salita costi poco e molta salita molto: il tracciato allunga quanto serve, non
di più (come le strade vere). Altri costi: guado (basso, solo dove si guada), **ponte** (alto, così i ponti sono
pochi e le strade ci convergono), palude ed esposizione sulle creste (alti), bosco (lieve), neve e quota oltre il
limite degli alberi (per le classi da carro), terrapieni di rocca e borgo vietati salvo le porte.

**3. La rete.** Nodi: rocche e borghi (porte), valichi, e poi villaggi, porti e luoghi speciali quando ci
saranno. Grafo: albero di copertura minimo sui costi di viaggio, più i collegamenti in cui il giro sull'albero
supera ~1,5 volte il diretto (le reti vere hanno anelli). I tratti si tracciano dal più importante: i passi
già su una strada costano meno, così le strade **si uniscono** in tronchi comuni invece di correre parallele, e
gli incroci nascono da soli (crocevia, possibili luoghi). Gerarchia: maestre tra rocche e verso i valichi
principali, carrarecce verso borghi e villaggi, mulattiere sui valichi alti.

**4. Sentieri di montagna.** Dalle testate delle valli (e dagli alpeggi) ai valichi e alle **forcelle** dei
gruppi montuosi (per il GDD scorciatoie rischiose, non strade), con la classe «sentiero»: ripidi, a tornanti
stretti, segnati più deboli. Alcuni a vicolo cieco (a un panorama, a un alpeggio): i sentieri veri non vanno
sempre da qualche parte.

**5. Nella Scena.** Striscia spianata lungo il tracciato (in pendio taglio a monte e rilevato a valle, raccordati;
la quota resta pura funzione del punto del mondo, quindi blocchi e orizzonte combaciano), colore di **terra
battuta** come nuovo strato di `materialeSuolo` (bordi netti per pixel, solchi delle ruote vicino), niente
alberi né cespugli sulla striscia e radi ai margini (la vegetazione legge una `distanzaStrada(x, z)` come oggi
`distanzaPiano`: va concordato con la sessione della vegetazione), ponti da codice dove la strada passa un fiume
non guadabile, guadi con sassi.

**6. Carta e viaggio.** Strade disegnate per classe; il viaggio sulla Carta (A* sulle celle, GDD §3) preferisce
le strade: costo per cella ridotto su strada, tempi e Forza per classe. A piedi e a cavallo nella Scena: su
strada non si rallenta per il terreno [da decidere].

**Moduli.** Nuovo `js/mondo/strade.js` (senza Three.js né DOM: rete sulla Carta e tracciato fine, gira nel
Worker); strade nella cache della Carta (`VERSIONE_GENERATORE`); ponti in `js/3d/` (nome da decidere). Un file
nuovo: serve la conferma (regola 2).

### Passi (proposta)

1. **Rete sulla Carta** con i nodi di oggi; disegno nella vista della Carta; verifiche in Node su 30 semi
   (pendenza massima per classe sulle celle, numero di ponti, lunghezza rispetto alla linea d'aria).
2. **Tracciato fine e tornanti** nella Scena, striscia spianata. *Prova:* salire a un valico a piedi e a cavallo.
3. **Colore e vegetazione** (con la sessione della vegetazione).
4. **Ponti e guadi.**
5. **Viaggio sulla Carta** lungo le strade.

### Passo 4 — Ponti e guadi (approvato dall'utente: pietra per le maestre e luci > 20 m, legno altrimenti; presidi e pedaggi con i luoghi)

Affidato alla sessione M6 su indicazione dell'utente (novembre 2026). Oggi nell'alveo la strada si interrompe: il
fiume la taglia e il nastro resta a ±0,3 m dal terreno. Comandi e tasti restano per dopo (decisione dell'utente).

**Cosa c'è da collegare** [Certo, misurato sui tracciati delle Scene di tutta la regione]:

| Seme | Attraversamenti | Ponti (acqua > 0,9 m) | Luce dei ponti | Guadi (luce) |
|---|---|---|---|---|
| 570549 | 51 | 8 | 15–56 m | 5–20 m |
| 48213 | 61 | 14 | 15–88 m | 5–15 m |
| 855588 | 42 | 11 | 14–59 m | 5–15 m |

Quello che decide è la Scena (profondità vera nell'alveo), non la Carta: la soglia è la stessa del guado a piedi
(`PROFONDITA_GUADO` 0,9 m). Un blocco di 2×2 km ha di solito 0–2 ponti e 0–5 guadi.

**1. Dove e a che quota** (`js/mondo/strade.js`, senza grafica). Nel tracciato fine di ogni tratto si trovano le
corse di punti nell'alveo: profondità massima > 0,9 m → **ponte**, altrimenti **guado**. Per il ponte la carreggiata
passa alla quota dell'impalcato: pelo dell'acqua + luce libera (1,5 m + 3 % della luce) o la quota delle rive se più
alta, con **rampe in terra** alle testate entro la pendenza massima della classe (le fa `spianaStrade`, come la
banchina). Per il guado la strada scende nel letto con la pendenza della classe e il letto si alza a una **soglia di
ghiaia** dove l'acqua resta ≤ 0,4 m, larga quanto carreggiata e banchina (il nastro d'acqua del fiume resta sopra:
acqua bassa e chiara sopra il guado). Tutto funzione del punto del mondo: blocchi e orizzonte combaciano.

**2. Ponti** (stile di `docs/GRAFICA_3D.md`, mesh da codice, niente modelli):
- *Pietra* per le strade maestre e per luci oltre ~20 m: archi a sesto ribassato (uno ogni 10–18 m: 1 arco a 15 m,
  5 a 88 m), pile con rostri a monte, leggera schiena d'asino, parapetti bassi; `ExtrudeGeometry` sul profilo degli archi
  più blocchi, `MeshStandardMaterial` opaco (pietra) con colori per vertice dalla palette, filari di conci nello
  shader solo come luce (convenzione del terreno). ~1 500–3 000 triangoli.
- *Legno* per carrarecce, mulattiere e sentieri su luci fino a ~20 m: travi, tavolato, parapetti a croce di
  Sant'Andrea, cavalletti nel letto ogni 6–8 m. Lambert. ~600–1 200 triangoli.
- Una mesh per ponte (geometrie unite), una o due chiamate; nessuna `InstancedMesh` necessaria (ponti diversi tra loro).
- **Camminarci**: ogni ponte è un oggetto con `quotaSuolo` (impalcato) e `spingiFuori` (parapetti), come il castello;
  entra in `componiSuolo` e negli ostacoli (una riga in `main.js`, dove si raccolgono le rocche). Sotto l'impalcato si
  passa solo dove l'acqua si guada.

**3. Guadi**: soglia di ghiaia chiara (colore nel nastro della strada sotto l'acqua) e 10–30 **pietre** di guado
grosse e piatte in una sola `InstancedMesh` per blocco (una chiamata per tutti i guadi), vegetazione esclusa come sulla
strada (già lo fa `distanzaStrada`).

**4. Carta**: un segno per i ponti (arco) e per i guadi (puntini) sui rami; nella Carta zoomata quelli veri delle Scene.

**Prestazioni** (`docs/PRESTAZIONI.md`, gruppo «resto», 1,5 ms): per blocco ≤ 2 ponti (≤ 6 000 triangoli, ≤ 4 chiamate)
e 1 chiamata per le pietre di guado; atteso ≤ 0,2 ms. Percorso di prova anche con
`?seme=570549&prova&centro=39277,18877` (ponte di una strada maestra, luce ~25 m). Materiali creati al caricamento.

**Passi** (ciascuno provato nel browser):
1. Attraversamenti, quote, rampe e soglia del guado (`strade.js`); verifiche in Node su 30 semi: nessuna rampa oltre la
   pendenza della classe, giuntura tra blocchi 0, guadi ≤ 0,4 m.
2. Ponti di pietra e di legno, camminabili; percorso di prova sul ponte.
3. Guadi: pietre e ghiaia.
4. Segni sulla Carta.

**Fatto (da provare dall'utente):**
- `strade.js`: nel tracciato fine le corse nell'acqua diventano `attraversamenti` (ponte se > 0,9 m d'acqua); profilo:
  impalcato piano con rampe alla pendenza della classe, guado con soglia a 0,35 m d'acqua e discese nelle rive;
  `tipo` per punto (0 strada, 1 ponte, 2 guado) letto da `distanzaStrada`; `spianaStrade` nel letto alza la soglia del
  guado e sotto i ponti lascia il fiume. `attraversamentiBlocco` per la Scena; il nastro della strada salta i ponti.
  Misure (seme 570549 / 48213): 8 / 14 ponti (luce fino a 61 / 97 m), 43 / 47 guadi, acqua sui guadi ≤ 0,35 m,
  giuntura tra blocchi 0; vicino agli attraversamenti il 99 % del profilo entro la pendenza della classe.
- `acqua.js`, `creaPonti`: pietra (fianco con archi estruso, uno ogni ~14 m, pile 1,8 m, schiena d'asino ≤ 1,2 m,
  parapetti) o legno (tavolato, travi, cavalletti ogni ~6,5 m, parapetti a montanti); una mesh per ponte; ogni ponte è
  suolo (`quotaSuolo`) e ostacolo (`spingiFuori`, parapetti). Guadi: pietre piatte accanto alla carreggiata, una
  `InstancedMesh` per blocco. `main.js`: ponti in `componiSuolo`, negli ostacoli e negli occlusori.
- Carta: segno «)(» per i ponti della rete; nella Carta zoomata ponti e guadi (puntini blu) delle Scene.
- Prova in headless: sul ponte (`?seme=570549&prova&centro=39277,18877`) il cavaliere sta a 76,2 m sopra l'acqua a 72,8;
  al guado (`&centro=91485,11432`) è nell'acqua a 0,3 m. FPS e ms da misurare sulla scheda vera (gruppo «resto»).
- Non fatto: rostri delle pile, filari di conci nello shader, ghiaia colorata sotto l'acqua del guado.

### Fatto (passi 1–2)

- **Rete** (`aggiungiStrade`, nel Worker con i luoghi; `VERSIONE_GENERATORE` `…+strade-1`): nodi = porte dei borghi,
  valichi e le loro due valli, **16 abitati provvisori** (i siti candidati non usati per le rocche, a ≥ 12 km dagli
  altri nodi: tengono il posto dei villaggi), poi sentieri dalla rete a cime panoramiche (≤ 4, ≥ 1100 m, massimi
  locali su 6 km) e forcelle. Albero minimo sui costi + anelli dove il giro supera 1,6× il diretto (entro 25 km).
  Mosse a 24 direzioni (anche salti di 2 celle: scavalcano un fiume). Le celle dei fiumi grandi (≥ 150 km²) non si
  calpestano: si passano solo scavalcandole, cioè con un **ponte**; i torrenti si guadano.
- **Ponti** [misurato]: anche con ponti gratuiti la rete attraversa i fiumi grandi solo 4–11 volte per mondo e si
  accorcia dell'1–2 % (in 120×90 km le sorgenti sono vicine: aggirare costa poco). Costo del ponte 600 m
  equivalenti: **2–4 ponti per mondo**, 4–15 guadi. Le strade si fondono in tronchi comuni: la rete si salva
  come **rami** unici tra incroci (classe = la più importante tra le strade che li usano).
- Misure su 3 semi: 250–600 ms nel Worker; 400–600 km di strade (soprattutto carrarecce: i nodi provvisori sono
  abitati), 1–7 strade maestre, mulattiere e sentieri in quota.
- **Tracciato fine** (`raffinaStrade`, nella pagina con i fiumi della zona): tratti di ~4 km tra punti fissi (spostati
  entro 150 m sul terreno più dolce), griglia di 20 m in un corridoio di 450 m (1125 m se chiuso), 16 direzioni,
  pendenze sul terreno lisciato su ~60 m, costo oltre pmax che cresce con l'eccesso (gli strappi brevi si accettano,
  le salite lunghe si girano), **svolta** che costa fino a 60 m equivalenti (tornanti a lati lunghi, niente denti di
  sega). Su 4 semi: oltre 1,1·pmax lo 0,5–2 % della lunghezza; nessun tratto senza percorso. Scena di partenza
  +160–300 ms (una volta per tratto, poi in cache).
- **Nella Scena** (`spianaStrade` in `quotaFinale`, dopo i fiumi e prima dei terrapieni): carreggiata alla quota della
  strada (profilo lisciato su 25 m, l'acqua saltata), scarpate di taglio e di riporto al più 0,6, ritorno al terreno
  in 18 + 10 m; nell'alveo niente (il guado è il fiume; il ponte arriverà al passo 4). Giuntura tra blocchi 0 m.
- **Colore**: strato `strada` di `materialeSuolo` (scostamento con segno dall'asse, semilarghezza, distanza):
  terra battuta per pixel con bordo frastagliato, solchi delle ruote ed erba al centro sulle strade da carro; solo
  nel blocco. **Carta**: rami per classe (mulattiere e sentieri tratteggiati).
- **Correzioni dopo la prova dell'utente** (seme 570549):
  - *Strada che restava su un altopiano tutto gobbe senza scendere a fondovalle*: la quota della Carta è una per km;
    ora il costo conta anche il rilievo vero dentro la cella (`ruvidezza`: pendenza media di quotaMondo su campioni a
    200 m; fondovalle 1–3 %, altopiani aspri 20–40 %; costo × (1 + 0,5·(ruvido/p0)²), al più ×25; 170 ms nel Worker).
    Le strade seguono le valli. `VERSIONE_GENERATORE` `…+strade-2`.
  - *Sulla Carta niente tornanti*: la Carta zoomata (finestra ≤ 24 km) cerca e disegna il tracciato fine delle Scene.
  - *Strade larghe, a cunei e spigoli fuori dal castello*: il colore del terreno per vertice (7,8 m) non disegna una
    carreggiata di 1–4,5 m. Ora la strada è un **nastro** suo (`creaNastroStrada` in `js/3d/acqua.js`): 5 vertici per
    sezione (bordi, solchi, centro), un punto ogni 2 m, appoggiato sul terreno disegnato + 25 cm (con 6 cm spariva
    sotto le pieghe dei triangoli). Lo strato `strada` del suolo è tolto (anche dallo shader: meno costo per pixel).
  - *Carreggiata inclinata di traverso* («non esistono strade con pendenze diagonali così»): la carreggiata era più
    stretta di una cella del blocco (7,8 m) e il terreno disegnato la attraversava in pendio. Ora c'è una **banchina**
    piana oltre la carreggiata prima della scarpata (5 m per lato per strade maestre e carrarecce, 2,5 per le
    mulattiere, 1,2 per i sentieri). Pendenza di traverso del terreno disegnato sulla carreggiata, mediana: seme 570549
    da 18 % a 0,8 %, 855588 (molti tornanti) da 21 % a 11,5 %, 48213 da 2,1 % a 0,3 %. `generaScena` dà anche
    `acqua.quoteStrade` (quota della strada per punto) per il nastro piano in larghezza.
- **Vegetazione**: `distanzaStrada(carta, x, z)` è pronta; l'esclusione degli alberi dalla carreggiata è della
  sessione della vegetazione (passo 3 di questo piano).

### Da decidere

1. Passi 3–5 (colore e vegetazione con l'altra sessione, ponti e guadi, viaggio sulla Carta): quando.
2. ~~Velocità su strada~~ [deciso con l'utente: su strada e sentiero in salita si rallenta meno che fuori; fatto: `terrain.suStrada` (main.js, carreggiata + 0,5 m) e in `knight3d.js` curva di salita dimezzata (K 0,35 invece di 0,7) con minimo 0,85 invece di 0,7: al 10 % 0,97 invece di 0,93, al 25 % 0,92 invece di 0,84. In piano e in discesa nessuna differenza].
3. **Penalità fuori strada** [deciso con l'utente, novembre 2026]: si fa **con i villaggi e gli altri luoghi**, quando la
   rete sarà fitta (strada più vicina quasi sempre entro 1–2 km). Non piatta ma **secondo il terreno** (dalla copertura
   di `coperturaMondo`): prati e campi quasi come una carrareccia; bosco fitto, macchia, ghiaioni, palude e pendii
   senza tornanti più lenti e più faticosi (velocità e Forza). Con il viaggio sulla Carta lungo le strade (passo 5).

## Cavallo (milestone a sé) — piano approvato (novembre 2026)

> Richiesta dell'utente (novembre 2026): un cavallo che accompagna il cavaliere e un comando per salire in sella e
> scendere. C'è **fin dall'inizio della partita**; l'acquisto al mercato (`docs/EARLY_GAME.md` §5) resta per il gameplay
> più avanti. Si lavora in parallelo a M7 (deroga alla regola 4 concessa dall'utente). Codice in `js/3d/cavallo3d.js`;
> in `main.js` solo agganci piccoli.

### Cose da sapere prima (contrasti con i documenti e con il codice)

1. **Il garzone parte senza cavallo** (`docs/EARLY_GAME.md` §1 e §5, `knight.js`: `cavallo = null`). Proposta: la
   partita nuova dà un **ronzino** (`js/data/items.js`, vigore 20, possa 0), con un commento «provvisorio» in `knight.js`;
   il ronzino non dà bonus in battaglia, quindi il combattimento non cambia. `EARLY_GAME.md` va aggiornato con una nota.
2. **`Knight.isMounted()` oggi vuol dire «possiede un cavallo con vigore»**, non «è in sella»: lo usano lo sconto di
   Forza (×0,7) e la possa in battaglia (`combat.js`). Con il cavallo vero diventa **in sella e con vigore** (nuovo campo
   `Knight.inSella`, salvato). Senza questa correzione, avendo il cavallo dall'inizio, si avrebbe lo sconto anche a piedi.
3. **Trotto ~4 m/s è più lento della corsetta a piedi (4,5 m/s)**, alzata dopo che il documento lo fissava. Proposta:
   trotto **5 m/s**, così montare non è mai più lento che correre [deciso con l'utente].
4. **Galoppo a 13 m/s** è quasi il doppio dello scatto (8): erba vicina, ridistribuzione della vegetazione e caricamento
   del blocco al bordo sono stati tarati sulla corsa a piedi. [Probabile] serve una verifica di scatti al passo 3.
5. **Il cavaliere seduto** richiede una posa in sella in `knight3d.js` (gambe piegate, piedi nelle staffe, niente IK a
   terra): piccola modifica a un file non mio, da concordare con la sessione «M1 - Grafica».

### Decisioni (approvate dall'utente, novembre 2026: tasti E e F, ricomparsa fuori vista, passo 1,8 / trotto 5 / galoppo 13, ronzino provvisorio)

- **Tasti.** Occupati: W A S D, frecce, Shift, Ctrl, C, M, P, R, T, V, F2, F3, F4, F8, F9. Proposta:
  - **E** = monta in sella (entro ~3 m dal cavallo; scritta «E: monta in sella») e smonta. È lo stesso tasto previsto
    per «E: parla» (M7): un solo tasto d'azione che fa la cosa vicina. In sella, finché non c'è nessuno con cui parlare,
    E smonta; quando arriveranno le persone, la regola di precedenza si decide allora (proposta: la persona vicina vince,
    per smontare si sta lontani da chi parla).
  - **F** = fischio: richiama il cavallo.
- **Quando segue** (a piedi):
  - tiene ~4–6 m dietro e un po' di lato; adatta l'andatura alla distanza (passo, trotto, galoppo per recuperare);
  - **ripercorre le tracce** del cavaliere (un punto ogni ~1 m, gli ultimi ~80 m), invece di cercare una strada: costa
    quasi nulla e funziona nel bosco e lungo le strade. Taglia dritto solo quando la linea è libera;
  - **se il cavaliere si ferma**: si ferma a ~3–4 m, dopo qualche secondo abbassa la testa a brucare (o si gira a
    guardarlo); non si mette tra la camera e il cavaliere;
  - **bosco fitto**: dove il cavaliere passa e il cavallo no (corpo lungo ~2,4 m) resta fermo e aspetta;
  - **acqua profonda**: come il cavaliere, non ci entra (`terrain.percorribile`); guadi bassi sì;
  - **pendii**: rifiuta salite oltre ~28° e discese oltre ~30° (più prudente del cavaliere, 35°): se il cavaliere sale
    dove lui non può, resta sotto;
  - **rimasto indietro** (bloccato o oltre ~60 m): smette di seguire e aspetta; avviso nell'HUD «Il cavallo è rimasto
    indietro (F: fischia)».
  - **Ritrovarlo**: col fischio, se è entro ~250 m e la strada è libera arriva al trotto o al galoppo; altrimenti
    **ricompare fuori dall'inquadratura**, ~15 m dietro il cavaliere su un punto percorribile, e lo raggiunge (lieve
    trucco, accettabile perché non si vede). **Al cambio di Scena** (viaggio sulla Carta) viaggia con il cavaliere e
    ricompare accanto. Il cavaliere non lo attraversa: a piedi il cavallo è un ostacolo come un tronco (due cerchi).
- **In sella:**
  - andature **passo 1,8 m/s** (interruttore Ctrl, come la camminata), **trotto 5** (normale), **galoppo 13** (Shift);
    indietro 1 m/s; curve più larghe al galoppo (velocità di rotazione ridotta), niente giro sul posto al galoppo;
  - **pendenze**: stessa curva tipo Tobler del cavaliere con parametri propri: sale bene i pendii moderati (fino a ~15°
    quasi senza perdere velocità), rifiuta oltre ~28° in salita; in discesa **molta cautela**: oltre ~12° il galoppo
    diventa trotto, oltre ~20° passo e velocità fino a ×0,25, oltre ~30° non scende; su strada come il cavaliere
    (salita più dolce);
  - **camera** più alta e più lontana (perno ~2,6 m invece di 1,6; distanza ~6,5 m invece di 4,2), con transizione
    morbida montando e smontando; rotella come oggi;
  - **collisioni**: due cerchi (petto e groppa, raggio ~0,45 m) contro mura, tronchi e rocce, come oggi il cavaliere;
  - **edifici**: si entra a cavallo nei cortili della rocca e nelle vie del borgo; negli interni no (oggi non esistono:
    la regola vale quando arriveranno, con «smonta per entrare»);
  - **montare e smontare**: niente animazione elaborata; ~0,6 s di passaggio dalla staffa alla sella. Si smonta solo se
    accanto al cavallo c'è un punto percorribile (non acqua profonda, non un muro), altrimenti avviso.
- **Tempo e Forza:**
  - nelle Scene il tempo resta **×10 fisso** (`docs/GDD.md` §3): in sella non cambia nulla [Certo]. Al galoppo 1 km costa
    ~77 s reali e ~13 minuti di gioco, come scritto nel GDD;
  - Forza del cavaliere in sella: **×0,7 della camminata a ogni andatura** (regola di `EARLY_GAME.md`; la fatica
    dell'andatura la paga il cavallo). Sulla giornata (~28 km) torna come a piedi (~14 km di corsetta) [Probabile];
  - **vigore del cavallo**: segnaposto. Non cala nelle Scene; resta il campo di `Knight.cavallo`. Il calo per andatura e
    pendenza (galoppo costoso, recupero da fermo e all'abbeverata) è un passo futuro;
  - **Carta**: il viaggio in sella usa `VIAGGIO.METRI_PER_PASSO_CAVALLO` (già in `config.js`, mai usato), ~2× a piedi.
- **Salvataggio**: posizione e direzione del cavallo nella Scena, `Knight.inSella`. Salvataggi vecchi: senza cavallo →
  ronzino nuovo accanto al cavaliere, a piedi.

### Budget e stile (regole di `docs/PRESTAZIONI.md` passo 6, `docs/GRAFICA_3D.md`)

- **≤ 6.000 triangoli, ≤ 12 oggetti**, uno per snodo animato: corpo (con sella, gualdrappa, finimenti), collo, testa
  (con briglia e morso), coda, 4 gambe × 2 snodi (spalla/anca e ginocchio/garretto; lo stinco e lo zoccolo uniti al
  secondo pezzo). Pezzi uniti per snodo al caricamento.
- Modellazione come il cavaliere: `LatheGeometry` e profili deformati, normali lisce; mantello baio in `Lambert`, metalli
  (morso, staffe, fibbie) in `Phong` satinato, niente PMREM; ≤ 5 materiali creati al caricamento; ombra a disco finta.
- Animazione procedurale come il cavaliere: zoccoli con bersaglio sul terreno e IK a due ossa; passo a 4 tempi, trotto
  a diagonali, galoppo a 3 tempi con sospensione; collo che pompa al galoppo; respiro, coda e brucare da fermo. Fermo
  e lontano oltre ~120 m: animazione a metà frequenza (regola delle persone).
- Nel profilatore il cavallo è nel gruppo **«personaggi»** (`gruppoDi` in `main.js`): con il cavaliere ≤ 1,5 ms GPU.
  Compare accanto alla partenza, quindi il percorso di prova lo inquadra senza modifiche [Probabile, da verificare].

### Passi (ciascuno provato nel browser e dal percorso di prova `?seme=570549&prova`, anche `&centro=99937,43289`)

1. **Modello fermo.** Cavallo con sella accanto al cavaliere, alla partenza; respiro e coda. F3: triangoli e chiamate in
   più, gruppo «personaggi». *Prova:* guardarlo da vicino di giorno e al tramonto; numeri del percorso di prova.
   **Stato: fatto, da provare dall'utente** (`js/3d/cavallo3d.js`; in `main.js`: creazione in `posizionaCavaliere`,
   ostacolo per il cavaliere, `update`, ombra, `gruppoDi`, `kd.cavallo`). Baio con gualdrappa rossa, sella, staffe e
   finimenti; **5.368 triangoli, 12 snodi in 12 mesh** (+ ombra), **15 chiamate** (corpo e testa hanno un secondo gruppo
   Phong per staffe e morso); 2 materiali con colore nei vertici + ombra, creati al caricamento. Zoccoli appoggiati con
   IK a due ossa (garretto all'indietro), corpo inclinato col pendio (provato a 19°); coda, testa e collo si muovono
   piano, ogni tanto un colpo di coda. Posto alla partenza a sinistra del cavaliere (poi destra, dietro…) dove il
   terreno è percorribile, sotto 22° e libero da ostacoli. In headless il percorso di prova parte senza errori;
   «cavaliere e tempo» (che ora comprende il cavallo) 0,10 ms di CPU; tempi GPU solo sulla scheda vera.
   *Correzione dopo il primo sguardo dell'utente* (collo troppo largo in basso, buco tra fronte e nuca, troppo massiccio
   e segmentato): tronco in un solo tornito modellato (groppa, spalle, garrese, ventre) al posto di cinque masse
   sovrapposte, più stretto; base del collo da 0,29 a 0,215 m; collo prolungato e cranio esteso dietro la nuca, così
   testa e collo si chiudono; più segmenti su tronco, collo, testa e gambe; gambe un poco più sottili.
   *Seconda correzione* (dopo la prova su Pages: «ancora troppo giocattolo di legno, corpo tozzo, collo e testa con
   angolazione fissa a 45°»): niente più solidi torniti dritti. Ogni parte è un **tubo a sezioni ovali lungo una curva**
   (`tubo` in `cavallo3d.js`), con semilarghezza e due semialtezze diverse sopra e sotto: tronco più asciutto (largo
   ~0,45 m, ventre a ~0,77 m da terra) con garrese e groppa; **collo ad arco** (da ~36° alla base a ~63° alla nuca,
   cresta più alta della gola); **testa a ~60°** con ganasce, fronte piatta e muso; gambe con avambraccio e gamba
   muscolosi e tendini dietro lo stinco, pastorale inclinato; coda che esce indietro e poi scende. Ombreggiatura finta
   nei colori dei vertici (facce rivolte in basso più scure). 5.5 mila triangoli, stessi 12 snodi e 15 chiamate.
   *Naturalezza invece di simmetria* (richiesta dell'utente): rilievi anatomici spostando i vertici lungo la normale
   (spalla, scapola, punta della spalla, pettorali, tricipite, incavo dietro il gomito, fianco, punta dell'anca, groppa,
   natiche, costole appena accennate), con ampiezze diverse a sinistra e a destra; rumore liscio sulla superficie e
   sul colore del pelo; da fermo **posteriore destro in riposo** sulla punta dello zoccolo con l'anca che cede da quel
   lato, anteriore sinistro un poco avanti, collo più basso e testa girata e inclinata verso il cavaliere; orecchie
   diverse (una avanti, una di lato); criniera a ciocche che ricade a destra; coda che piega di lato. 5.536 triangoli.
   Limite che resta [Certo]: ogni snodo è un pezzo rigido, quindi dove la gamba entra nel corpo si vede l'attacco.
   Una pelle continua chiede una `SkinnedMesh` (ossa che deformano un'unica superficie). **Decisione dell'utente
   (novembre 2026): per ora restano i pezzi rigidi**; la pelle unica si riconsidera più avanti.
2. **Segue a piedi.** Tracce, distanza, andature animate (passo, trotto, galoppo), sosta e brucare, attesa se bloccato
   (bosco fitto, acqua, pendii), avviso «rimasto indietro», fischio con F, ostacolo per il cavaliere. *Prova:* correre e
   scattare nel bosco, guadare, salire un pendio ripido, fischiare da lontano.
3. **In sella.** E per montare e smontare, posa del cavaliere seduto, camera, andature con Ctrl e Shift, pendenze,
   collisioni, Forza ×0,7, `Knight.inSella` e `isMounted` corretto. *Prova:* galoppo in pianura e nel bosco (scatti?),
   discesa ripida, cortile della rocca, smontare in un punto stretto; percorso di prova con il cavaliere in sella.
4. **Partita e viaggio.** Ronzino alla partita nuova, salvataggio (posizione, in sella), cambio di Scena con il cavallo
   accanto, Carta con `METRI_PER_PASSO_CAVALLO` se si parte in sella; note in `EARLY_GAME.md` e `GDD.md`. *Prova:*
   ricaricare la pagina in sella e a piedi; viaggio sulla Carta e ritorno in Scena.

### Accordi con le altre sessioni (novembre 2026)

- **M1 - Grafica**: la posa in sella in `knight3d.js` la fa questa sessione, con gli stessi snodi e le stesse misure,
  nessun materiale nuovo, nessun oggetto o triangolo in più e il mantello piegato o accorciato in posa per non
  compenetrare la groppa. Il diff va a M1 prima del merge. `&sella` in `prestazioni.js`: il percorso senza `&sella`
  resta identico; in sella si usano perno e distanza della camera in sella. Nel riquadro va una riga
  «scena: … · cavallo: a piedi/in sella». Base sulla UHD 730: personaggi 0,1 ms, edifici 0,3 ms alla partenza.
- **Vegetazione**: `spingiFuori` non cambia. I muretti a secco attorno ai borghi (tre cerchi da 0,4 m per tratto,
  varchi di 5 m) e le siepi dei campi (cerchi da ~0,75 m ogni 1,7 m, aperture di 2,6–6 m ogni ~45 m) bloccano anche il
  cavallo: passa dalle aperture o ci gira attorno. Erba al galoppo: si rifà ogni 5 m a fasce
  (tetto ~1,5 ms per fotogramma); a 13 m/s può restare indietro rispetto al cavaliere (piena entro ~50 m). Leve, da
  decidere insieme con i numeri del passo 3: `VICINO.rifai` più grande al galoppo, o un raggio diverso.
- **M6**: `suolo.suStrada` si riusa com'è. Il viaggio sulla Carta lungo le strade è rinviato alla milestone dei
  villaggi: se il viaggio in sella sulla Carta terrà conto delle strade, ci si coordina allora.

### Rischi

- [Probabile] il galoppo a 13 m/s fa emergere scatti nello streaming della vegetazione: se succede, si coordina con la
  sessione Vegetazione (o si limita il galoppo nel bosco, che è anche realistico).
- [Ipotesi] le tracce non bastano nei punti stretti del borgo: il cavallo aspetta e si fischia; una ricerca di percorso
  vera si fa solo se serve.
- Il cavaliere è ancora 86 oggetti (`PRESTAZIONI.md` passo 5): con il cavallo le chiamate dei personaggi salgono di ~12,
  dentro le 120 del budget.

## Cielo e meteo (in parallelo a M7) — piano da approvare

> Avviata dalla sessione «M1 - Grafica» su richiesta dell'utente (novembre 2026), in parallelo a M7. Riferimenti:
> M5 «Ciclo giorno/notte» (sopra), `docs/GRAFICA_3D.md` «Foschia e visibilità», `docs/PRESTAZIONI.md` (budget
> «acqua, cielo, effetti» 1,5 ms GPU e ≤ 10 chiamate; oggi 0,3–0,6 ms). **Stato: piano approvato dall'utente (21/11/2026)** con le
> decisioni 7–10 qui sotto; passo 0 in corso.

**Decisioni già prese dall'utente.**
1. File nuovo **`js/3d/cielo.js`** (deroga alla regola 2): ci va tutto ciò che è cielo, oggi in `main.js` (`COLORE_CIELO`,
   `CICLO`, `posizioneSole`, luci sole/luna/emisfera e loro colori, `NEBBIA`, `aggiornaNebbia`, `VISIBILITA`,
   `farDelGiorno`, `visibilitaDelGiorno`). In `main.js` restano gli agganci.
2. **Meteo solo grafico:** nessun effetto su Forza, velocità, incontri. Gli effetti sul gioco verranno con la logica.
3. **Meteo a periodi** (parole dell'utente: «un meteo fisso per ogni diversa ora progressivamente… al massimo ogni 2/3
   ore canoniche… per adesso senza sfumature»): il meteo resta fisso per **2–3 ore canoniche** (36–54 minuti reali a ×10),
   deterministico da seme e tempo di gioco; al cambio di periodo può cambiare **di colpo**, anche dentro la Scena.
   Nuvole ferme, nessuna transizione per ora. Il sole continua a muoversi (un giorno ~2 h 24 min reali).
4. **Continuità:** un periodo è vicino al precedente («non si può andare da tempo caldo a neve»): passi piccoli su una
   scala di stati, legata a stagione e clima della regione.
5. **Pioggia o neve secondo il luogo:** con lo stesso stato di precipitazione, sotto la quota della neve piove, sopra
   nevica; la quota dipende da quota, latitudine e stagione. Salendo in montagna nella stessa Scena si passa dalla pioggia
   alla neve.
6. **La foschia per giorno di M1** (densa / normale / limpida) è sostituita dal meteo, con lo stesso ritmo a periodi.
7. **Periodi variabili di 2 o 3 ore canoniche** (21/11/2026).
8. **Foschia standard** (21/11/2026, «la foschia lasciala standard indipendentemente dall'ora»; scelta: «distanza fissa,
   meteo escluso»): di giorno la foschia finisce sempre alla stessa distanza (~65 km, la «normale» di M1) qualunque sia lo
   stato; si accorcia solo con la nebbia vera e le precipitazioni forti. La notte resta stretta come in M5. Niente tinta
   calda verso il sole al tramonto (non ora).
9. **Neve in pianura al Nord, ogni tanto** (21/11/2026): possibile anche a quota bassa nelle regioni settentrionali.
10. **Meteo per zona, tendenziale** (21/11/2026): non uguale in tutto il mondo, ma con tendenze secondo bioma e latitudine.
11. **Salti da 1 a 3 gradini con frequenza calante** (21/11/2026; esempi dell'utente: sereno → nuvoloso, nuvoloso → neve,
   velato → pioggia forte).

**Cosa c'è oggi** [Certo, dal codice]: `scene.background` è un colore unico uguale alla nebbia (niente sfumatura, sole,
luna, stelle, nuvole). La nebbia di giorno va da 1,5 km a 40–150 km (tiro del giorno, interpolato con continuità tra un
giorno e il successivo); di notte si stringe a ~110 m. La luna è una luce fissa alta a sud-est. Il clima del generatore è
già pronto per la neve: `temperaturaMare` e `umidita` per cella e `limiteNevi(t0, stagione)` in `js/mondo/carta.js`
(gradiente 0,0065 °C/m, scarti di stagione −9 / +8 °C), usati anche dalla vegetazione per la neve a terra. Tre cose
leggono la luce del sole e dovranno sapere quanto è «diretta»: ombre finte della vegetazione
(`vegetazione.aggiorna(…, sole.position, luceGiorno)`), ombre del suolo (`terrain.js`), ombre delle mura
(`materialeMuro` in `rocca3d.js`, che prende la direzione della luce direzionale più forte).

### Decisioni tecniche (proposte)

1. **Cupola del cielo:** una sfera attorno alla camera (raggio ~100 km, dentro il `far` di 130 km), disegnata per prima,
   senza nebbia né scrittura di profondità; uno shader solo: gradiente zenit → orizzonte, disco e alone del sole, disco
   della luna, nuvole. **Il colore all'orizzonte è il colore della nebbia** (stesso valore, calcolato in un punto): il
   terreno lontano sfuma nel cielo senza stacco, anche dalle alture dove l'orizzonte scende sotto la linea dell'occhio.
   1 chiamata.
2. **Nuvole ferme:** una texture di copertura (1024², rumore frattale da codice) **cotta sulla GPU** all'ingresso nella
   Scena e a ogni cambio di periodo, in render target creati una volta (nessuna texture nuova durante il gioco). Al cambio
   di periodo la cottura si fa a strisce in più fotogrammi in un secondo target, poi si scambia: nessun fotogramma oltre
   ~1,5 ms (regola di `docs/PRESTAZIONI.md`). Proiettata come uno strato a quota fissa (si stringe verso l'orizzonte e si
   perde nella foschia); lo shader la legge una volta per pixel e la illumina col sole del momento (bianche a mezzogiorno,
   rosate al tramonto, grigio scuro di notte). Forma per stato: cumuli sparsi, velo, coperto con chiazze più scure.
3. **Stelle:** ~2000 punti in una chiamata, solo di notte, spenti dove ci sono nuvole (leggono la stessa texture).
   Luna come disco nella cupola, nella direzione della luce lunare; fasi della luna dal giorno [facoltativo].
4. **Scala del meteo e periodi.** Il tempo di gioco si divide in periodi di 2 o 3 Passi (lunghezza tirata dal seme, confini
   sulle ore canoniche). Lo stato di un periodo è un indice su una scala:

   | Indice | Stato | Luce del sole | Visibilità (fine foschia) |
   |---|---|---|---|
   | 0 | sereno | piena | standard (~65 km) |
   | 1 | poco nuvoloso (cumuli) | piena | standard |
   | 2 | velato (sole con alone) | ×0,6 | standard |
   | 3 | coperto | ×0,2, emisfera più forte e grigia | standard |
   | 4 | precipitazioni deboli | ×0,1 | standard |
   | 5 | precipitazioni forti | ×0,05 | 8–15 km (cortina di pioggia o neve) |

   L'indice viene da un **rumore liscio sul tempo** (valore all'inizio del periodo), spostato dalle tendenze della zona:
   `umidita` della cella (umido → più nuvole e precipitazioni), bioma (sabbia e sud arido più sereni, palude più nebbia,
   montagna più nuvole), latitudine (il nord più coperto) e stagione. Tra un periodo e il successivo lo stato cambia di
   **1–3 gradini con frequenza calante** (decisione 11) [valori da tarare guardando]: di norma resta o cambia di 1; di 2
   circa una volta su 6; di 3 circa una volta su 20 (temporale d'estate velato → pioggia forte, fronte freddo al nord poco
   nuvoloso → neve). Si ottiene con il rumore liscio (passi di 0–1) più rari «salti» tirati dal seme per il periodo;
   le tendenze della zona restano, quindi niente neve dal caldo (la neve dipende comunque dalla temperatura del luogo). Niente catena da ripercorrere: lo stato di
   qualunque periodo si calcola direttamente, quindi è lo stesso caricando un salvataggio o tornando nello stesso luogo.
   **Nebbia vera** (inizio ~100 m, fine 0,6–2,5 km, luce ×0,3): non un gradino della scala ma una variante del sereno o del
   velato nei periodi di notte e del mattino, in autunno e inverno, nelle celle basse e umide [regola da tarare].
   **Regione:** la cella della Carta dove sta il cavaliere (dentro una Scena di 2 km è una sola o poche: si usa quella del
   centro della Scena, così il meteo non cambia attraversando un confine di cella).
5. **Pioggia o neve:** temperatura del luogo nel momento = `temperaturaMare` + scarto di stagione − 0,0065 · quota (le
   stesse costanti del generatore, importate da `carta.js`, non copiate), più uno **scarto del periodo** di ±4 °C (rumore
   liscio sul tempo: ondate di freddo e di caldo). Al nord la media annua al mare è ~−4 °C (`CLIMA.latitudine`): d'inverno
   lì nevica anche in pianura; in primavera e autunno solo nelle ondate di freddo; al centro solo d'inverno con un'ondata
   di freddo; al sud mai in pianura. Nevica dove è ≤ 0 °C, piove sopra +1,5 °C, in
   mezzo nevischio (una parte delle strisce diventa fiocchi). Si valuta alla quota della camera, a ogni fotogramma (costo
   nullo): salendo il versante la pioggia diventa neve. [Probabile] La neve che cade scende ~450 m sotto il limite della
   neve a terra (che usa la media della stagione sotto −3 °C): nevicate su prati ancora verdi, come accade davvero.
   Va bene all'utente: «ogni tanto deve essere possibile neve in pianura bassa se si è al Nord».
6. **Luci col meteo:** con poca luce diretta il sole cala e l'emisfera sale e si ingrigisce (luce diffusa); il cielo
   non è più azzurro. `cielo.js` espone `luceDiretta` (0–1) per chi disegna ombre finte (vegetazione, suolo, mura), che
   le attenua col cielo coperto. Le sessioni proprietarie decidono come usarlo (vedi «Accordi»).
7. **Precipitazioni attorno alla camera:** strisce sottili (pioggia) e fiocchi (neve) in una scatola di ~40 m che segue
   la camera; la caduta è animata nello shader dei vertici (nessun lavoro della CPU). 1 chiamata, poche migliaia di
   elementi (niente interni per ora, quindi nessun riparo da gestire).
8. **Per le prove:** `?meteo=0…5` o `?meteo=nebbia` forza lo stato; il pannello `F3` mostra stato, periodo (inizio e fine),
   visibilità, temperatura del luogo, `luceDiretta`. Il percorso di prova usa il sereno se non indicato (numeri
   confrontabili con la tabella di `docs/PRESTAZIONI.md`); il caso peggiore si misura con `&meteo=5`.

**Budget** [Ipotesi, da misurare sulla UHD 730]: cupola con nuvole 0,2–0,4 ms (un pixel di cielo costa una lettura di
texture), stelle < 0,05, precipitazioni 0,1–0,3; cottura delle nuvole ~2–5 ms in tutto, a strisce. Con l'acqua (0,3–0,6)
si resta sotto 1,5 ms e ≤ 10 chiamate (cupola 1, stelle 1, precipitazioni 1). Memoria: due texture di nuvole, ~8 MB.

### Passi (ciascuno provato nel browser e dal percorso di prova `?seme=570549&prova`, anche `&centro=99937,43289`)

0. **Spostamento in `cielo.js`, comportamento identico.** Solo codice spostato; in `main.js` gli agganci (crea, aggiorna
   ogni fotogramma, nebbia sul punto osservato, testo per F3). Verifica: immagini headless a 4 ore (6, 12, 19:30, 0)
   identiche pixel per pixel prima e dopo; poi prova dell'utente.
   **Stato: fatto, da provare dall'utente.** `js/3d/cielo.js`: `creaCielo(scene)` crea sfondo, nebbia e le tre luci e
   restituisce `aggiorna(ora)` (false se l'ora è quasi la stessa), `aggiornaNebbia(camera, punto, conOrizzonte, seme,
   giorni)`, `invalida()`, `luceGiorno`, `sole`, `luna`, `emisfera`; esporta anche `CICLO`, `posizioneSole`,
   `visibilitaDelGiorno(seme, giorni)` e la modifica di `fog_vertex`. In `main.js` restano gli agganci: luci proprie di
   mura e castello e ombre finte di cavaliere e cavallo (dopo `aggiorna`), nebbia sul punto osservato, riga di F3.
   Verificato in headless (seme 570549, ore 6, 12, 19:30, 0): immagini identiche pixel per pixel, stessa nebbia;
   Tavullia e pannello F3 senza errori.
1. **Cupola a gradiente, sole e luna, alba e tramonto.** Zenit più scuro e saturo, orizzonte = nebbia; al crepuscolo il
   cielo è caldo verso il sole e freddo dalla parte opposta (la nebbia resta di un colore solo).
   **Stato: fatto, da provare dall'utente** (insieme al passo 0). `creaCupola` in `cielo.js`: sfera `cielo-cupola` di 5 km
   attorno alla camera (segue qualunque camera la disegni), disegnata per prima, senza profondità né nebbia; 48×24
   segmenti, uno shader leggero (nessuna texture). Colori in `CICLO.colori` (`zenitGiorno`, `zenitNotte`,
   `zenitCrepuscolo`, `alonCrepuscolo`, `discoLuna`): all'orizzonte e sotto è il colore della nebbia (in headless nessuna
   riga tra terreno lontano e cielo, anche dalle alture); fascia calda bassa dalla parte del sole tra ~14° e −8° di
   altezza; disco del sole di 0,75° (più grande del vero, per vederlo dalla vista di gioco) con due aloni; luna di 0,6°
   nella direzione della luce lunare (fissa, alta a sud-est), solo di notte. Nel percorso di prova la cupola finisce in
   «resto» finché non entra in `main` il gruppo «cielo» di M1.
2. **Stelle di notte.**
3. **Meteo a periodi senza nuvole disegnate:** scala, periodi, regione, foschia standard al posto di quella per giorno,
   luci, `?meteo=`, F3. Qui si provano con M7 le mura col cielo coperto e con Vegetazione le ombre finte.
4. **Nuvole ferme** per stato, illuminate dall'ora, ricotte a strisce al cambio di periodo.
5. **Precipitazioni attorno alla camera** (pioggia, nevischio, neve secondo la temperatura del luogo) **e nebbia vera.**
6. **Chiusura:** percorso di prova sereno e con `&meteo=5`, righe nella tabella di `docs/PRESTAZIONI.md`, documenti
   aggiornati (`docs/GRAFICA_3D.md` «Foschia e visibilità» rimanda qui).

### Accordi con le altre sessioni (da prendere)

- **M1 - Grafica** (risposta ricevuta): spostamento della foschia in `cielo.js` e sostituzione col meteo confermati. Gruppo
  «cielo» nel profilatore pronto sul branch di M1 `claude/keen-gauss-74qlkn` (da unire con l'ok dell'utente): ci rientra
  ogni oggetto figlio diretto della scena con nome che comincia per «cielo» (`cielo-cupola`, `cielo-stelle`,
  `cielo-precipitazioni`); «acqua, cielo ed effetti» somma cielo e resto contro 1,5 ms. Per questo la cupola è una mesh e
  non `scene.background` (lo sfondo nel percorso per gruppi finirebbe in «ter. blocco»).
- **M7:** `materialeMuro` scurisce fino a ×0,38 le facce girate dalla luce più forte; col cielo coperto la luce più forte
  resta il sole indebolito e le mura avrebbero ombre nette sotto un cielo senza sole. Proposta: attenuare con `luceDiretta`.
- **Vegetazione:** ombre finte attenuate con `luceDiretta`; conferma che la neve a terra resta solo da `limiteNevi`
  (la neve che cade non imbianca il suolo: niente accumulo per ora).
- **M6:** l'orizzonte usa la nebbia di scena: nessun cambio atteso; `cielo.js` importa da `carta.js` `CLIMA` e legge
  `temperaturaMare` e `umidita` della Carta (solo lettura).

### Rischi

- [Probabile] Il punto delicato è l'orizzonte: se il colore della cupola in basso e quello della nebbia non coincidono
  esattamente si vede una riga. Si calcolano nello stesso punto.
- [Probabile] I cambi di colpo (decisi dall'utente) si notano di più col cielo coperto ↔ sereno: luce, ombre e nuvole
  cambiano nello stesso fotogramma. È il comportamento voluto per ora; le transizioni sono il seguito naturale.
- [Ipotesi] Nuvole proiettate su uno strato piatto possono sembrare «dipinte» vicino all'orizzonte; si sfumano lì.
- [Certo] Dopo lo spostamento, `main.js` e `cielo.js` si toccano da più sessioni: modifiche minime e `main` unito spesso.

### Decise con l'utente (21/11/2026)

Periodi variabili 2–3 ore canoniche; foschia calda al tramonto non ora; neve anche in pianura al Nord, ogni tanto; meteo
tendenziale per bioma e latitudine; foschia di giorno a distanza standard per ogni stato (decisioni 7–10 sopra).

## Fuori dal prototipo (non farlo ora)

Multiplayer, server/VPS, NPC con IA, mobile/touch, modelli esterni, combattimento in 3D, ombre di
alta qualità. Il mondo più grande di 2×2 km non è più escluso: è pianificato dopo M5
(«Carta e Scene»).
