# Grafica 3D — stile simil-realistico da codice

> Regole di stile e piani di lavoro sull'aspetto di modelli e superfici. Mondo, terreno come dati, milestone:
> `docs/ESPLORAZIONE_3D.md`. Decisione di partenza (novembre 2026): dopo la valutazione di M4, **simil-realistico,
> non iper-realistico**, spinto al massimo con il solo codice; apporti esterni da decidere dopo (vedi in fondo).

## Convenzioni (valgono per tutti i modelli nuovi o rifatti)

- **Obiettivo:** proporzioni vere, materiali credibili, buona luce. Non fotorealismo. Il giudizio si dà dalla
  distanza di gioco (3–5 m dal cavaliere), non dal primo piano.
- **Forme:** solidi di rotazione (`LatheGeometry`), calotte, superfici incurvate, normali lisce. Le scatole
  restano solo dove la forma vera è squadrata (mattoni, travi, casse).
- **Materiali:** `MeshStandardMaterial` per ciò che deve sembrare metallo, pietra levigata, stoffa, cuoio
  (`metalness`, `roughness`). `MeshLambertMaterial` resta per superfici grandi e opache (terreno, vegetazione).
- **Riflessi:** il metallo senza un ambiente da riflettere appare nero. L'ambiente si **genera dal cielo della
  scena** (sfera con i colori di cielo, orizzonte e suolo + disco del sole → PMREM) e si rigenera solo quando la
  luce cambia (ciclo giorno/notte). Oggi vive in `knight3d.js` (`creaRiflessi`); quando servirà anche ad altri
  modelli va spostato in un modulo comune (cambio di struttura: chiedere conferma).
- **Texture:** solo generate dal codice (canvas o shader). Non sono asset esterni. Colori dalla palette.
- **Dettaglio fine nello shader:** dove la griglia è troppo rada per dare forma (terreno: un punto ogni 7,8 m),
  si inclina la normale nello shader con rumore in coordinate del blocco: solo luce, la geometria e `getHeight`
  non cambiano. Si dissolve con la distanza.
- **Colori chiari sotto il sole:** con il sole a intensità 3,4 un colore quasi bianco satura al massimo e le
  facce rivolte al sole diventano identiche. Verificare con una misura (piano illuminato a 0–60°) prima di
  usare colori sopra ~`#e0e0e0`.
- **Prestazioni:** obiettivo 60 FPS (`CLAUDE.md`). Il cavaliere ~15 000 triangoli; in headless il rendering è
  software e non fa testo: gli FPS li misura l'utente con `F3`.

## Cavaliere (`js/3d/knight3d.js`)

Attività parallela a M7, autorizzata dall'utente (deroga alla regola 4 di `CLAUDE.md`, come la vegetazione).
Vincolo: stessi punti di snodo e misure del corpo (anca, ginocchio, caviglia, spalla, gomito, busto, testa,
mantello), così movimento, animazione, collisioni e camera non cambiano.

Limite noto [Certo]: con le sole primitive una figura umana resta un manichino ben fatto. Il cavaliere in
armatura completa con elmo chiuso è il caso più favorevole: niente volto, mani nude o capelli.

1. **Forme e metallo vero — fatto, da provare dall'utente.** Grande elmo con fessure, fori di respirazione e
   rinforzi in ottone; spallacci a lamine; cosciali, ginocchiere, schinieri, scarpe a lamine; bracciali,
   cubitiere, guanti; sopraveste con falda e cintura; scudo curvo con bordo di ferro e umbone; spada con
   guardia, pomolo a disco e fodero. Materiali fisici + riflessi dal cielo (`knight.aggiornaRiflessi`, chiamata
   da `aggiornaCielo` in `main.js`). ~15 000 triangoli.
2. **Texture da codice.** Cotta di maglia alle giunture, trama della stoffa (sopraveste, mantello), cuoio,
   graffi e usura sull'acciaio (variazione di `roughness`), stemma disegnato su scudo e sopraveste al posto
   delle croci in rilievo.
3. **Mantello che si muove.** Telo suddiviso che ondeggia con velocità e curve; scudo che oscilla, testa che
   segue lo sguardo.
4. **Ombra vera del cavaliere** (facoltativa): ombra proiettata limitata alla zona attorno a lui al posto del
   disco finto. Si decide guardando gli FPS.

## Terreno

Piano generale (superficie sfumata + dettaglio nello shader, poi oggetti sparsi): `docs/ESPLORAZIONE_3D.md`,
M4 «Dopo la valutazione», e la sezione *Vegetazione e oggetti sparsi*.

### Neve (`materialeSuolo` in `js/3d/terrain.js`) — fatto, da provare dall'utente

Problema segnalato dall'utente: sulla neve, soprattutto vicino al cavaliere, non si capivano salite e discese.
- Causa misurata: con `#f1f3f6` la neve al sole usciva a `255,249,227` (rosso saturo); tra 0° e 20° di
  inclinazione la differenza era di 2 livelli su 255. La luce calda del sole la rendeva anche color crema.
- Rimedio, dentro il materiale a colore per pixel del terreno (`materialeSuolo`, che decide roccia e neve pixel
  per pixel):
  1. bianco freddo che non satura (`COLORE_NEVE` `#dde3ea`, anche per i biomi neve e ghiaccio);
  2. sui versanti la neve vira all'azzurro-grigio delle ombre (`COLORE_NEVE_VERSANTE`), secondo la pendenza
     della normale del pixel (`NEVE_VERSANTE`: da 2° a 24°);
  3. dettaglio della normale dove c'è neve: cumuli larghi (~8 m), onde del vento allungate (4×2 m) e grana fine
     (~1 m), pieno fino a 50 m dalla camera, spento a 150 m (`DETTAGLIO_NEVE`). Solo luce.
- Estensione naturale: lo stesso meccanismo (normale inclinata nello shader) per prato, terra e roccia.

## Apporti esterni (rinviati)

Si decide solo dopo aver raggiunto il massimo con il codice. Regole già concordate: una sola fonte per
categoria (texture, vegetazione, personaggi); licenze CC0 preferite (CC-BY → file dei crediti); ogni elemento
si prova in scena accanto a quelli procedurali e si scarta se stona; materiali ricolorati sulla palette, nessuna
luce o effetto propri dei pacchetti. Richiede di cambiare la regola 6 di `CLAUDE.md`.
