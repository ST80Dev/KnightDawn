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
  sparisce. Parametri in `CICLO` (`main.js`).
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
     combaciano): alveo a parabola largo 2·(3 + 0,6·√bacino) m (max 120 m), profondo 0,5 + 0,022·√bacino m
     (~0,8 m a 150 km², si guada; ~2,7 m a 10 000 km²), sponde basse di 6 m, poi versanti che risalgono
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
7. **Temperatura, umidità, biomi** (fasi 6–7) e limite delle nevi nello shader; colori della Scena per
   bioma. *Prova:* livelli della Carta; neve sulle cime.
8. **Regole di varietà e verifica automatica** (fase 8) su N semi, con esito per regola. Con i passi 3 e
   6 chiude l'accettazione.

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

## Fuori dal prototipo (non farlo ora)

Multiplayer, server/VPS, NPC con IA, mobile/touch, modelli esterni, combattimento in 3D, ombre di
alta qualità. Il mondo più grande di 2×2 km non è più escluso: è pianificato dopo M5
(«Carta e Scene»).
