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
- **Riflessi:** per scelta dell'utente niente mappe d'ambiente: i metalli sono satinati (`MeshPhongMaterial`, luccichio
  del sole). Se un giorno servissero riflessi veri: `MeshStandardMaterial` + ambiente generato dal cielo (PMREM),
  rigenerato solo al cambio di luce e mai nello stesso fotogramma della creazione della Scena.
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
**Sospesa dopo il passo 1 (novembre 2026):** l'utente ha detto «il cavaliere per adesso va bene così». I passi 2–4
restano qui come piano: non riprenderli senza una sua richiesta.
Vincolo: stessi punti di snodo e misure del corpo (anca, ginocchio, caviglia, spalla, gomito, busto, testa,
mantello), così movimento, animazione, collisioni e camera non cambiano.

Limite noto [Certo]: con le sole primitive una figura umana resta un manichino ben fatto. Il cavaliere in
armatura completa con elmo chiuso è il caso più favorevole: niente volto, mani nude o capelli.

1. **Forme e metallo vero — fatto, accettato dall'utente.** Grande elmo con fessure, fori di respirazione e
   rinforzi in ottone; spallacci a lamine; cosciali, ginocchiere, schinieri, scarpe a lamine; bracciali,
   cubitiere, guanti; sopraveste con falda e cintura; scudo curvo con bordo di ferro e umbone; spada con
   guardia, pomolo a disco e fodero. ~15 000 triangoli. **Riflessi tolti** su richiesta dell'utente («omettere così
   tanto realismo nei riflessi su armatura ed elmo», novembre 2026): metalli satinati Phong con il solo luccichio
   del sole, stoffa/cuoio/legno Lambert; niente mappa d'ambiente (PMREM), quindi anche nessun ricalcolo al cambio di luce.
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

### Strade (`creaNastroStrada` e `materialeStrada` in `js/3d/acqua.js`, sessione M6) — fatto, da provare dall'utente

Segnalazione dell'utente: «sembra un nastro di stoffa appoggiato sul rilievo», «era meglio di colore più chiaro».
- Bug: triangoli rivolti verso il basso e materiale a due facce → strada illuminata da sotto, quasi nera. Ora ogni
  quad ha il verso giusto (FrontSide).
- Colore più chiaro (`#a89272`); bordi a +0,08 m e centro a +0,25 m sul terreno disegnato (il bordo tocca terra).
- Seconda segnalazione: «le strade sembrano arrotondate come tubi lungo il pendio» (sezione bombata +0,08/+0,25 m e
  normali calcolate da lei). Ora la strada è piatta in larghezza (+0,12 m), con la normale media della sezione (segue
  solo la pendenza lungo la strada) e polygonOffset più deciso, che con la profondità invertita vale; scarto massimo dal
  terreno disegnato ±0,15 m.
- Shader: bordo frastagliato (fino al 22% della semilarghezza, rumore del mondo con periodo 8192 m, quindi uguale tra
  blocchi) che sfuma nell'erba calpestata; chiazze di tono; sassolini tondi entro 30 m. Costo trascurabile (pochi pixel).

## Foschia e visibilità (`aggiornaNebbia` in `js/3d/cielo.js`)

> Da sostituire con la foschia standard del meteo (`docs/ESPLORAZIONE_3D.md`, «Cielo e meteo», decisione 8).

Segnalazione dell'utente (tramite M6): da 1500 m si vedeva quasi tutta la mappa (foschia fissa 10–170 km). Ora la fine
della foschia è tirata per giorno dal seme e dal giorno del calendario: densa 40–50 km (15 %), di norma 55–75 km (60 %),
limpida 110–150 km (25 %); tra un giorno e il successivo cambia con continuità. Con 65 km: a 35 km si perde ~55 % del
contrasto, a 50 km ~85 %. Il valore del momento è nel pannello `F3` (riga «tempo»). Quando ci sarà il meteo, il tiro del
giorno verrà da lì (pioggia e vento → limpida). Curvatura ed esagerazione dei rilievi lontani: `orizzonte.js` (M6).

## Prestazioni

Budget, misure, cause note e piano della milestone «Prestazioni»: `docs/PRESTAZIONI.md` (scheda di riferimento:
integrata Intel). Già fatto qui: ottave del rumore del suolo saltate oltre la distanza di spegnimento e rumore da
texture per le scale fino a 32 m (PR #114), diagnostica `F4` nel pannello `F3`, riflessi d'ambiente del cavaliere
tolti (PR #117).

## Apporti esterni (rinviati)

Si decide solo dopo aver raggiunto il massimo con il codice. Regole già concordate: una sola fonte per
categoria (texture, vegetazione, personaggi); licenze CC0 preferite (CC-BY → file dei crediti); ogni elemento
si prova in scena accanto a quelli procedurali e si scarta se stona; materiali ricolorati sulla palette, nessuna
luce o effetto propri dei pacchetti. Richiede di cambiare la regola 6 di `CLAUDE.md`.
