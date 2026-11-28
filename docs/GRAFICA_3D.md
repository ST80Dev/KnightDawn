# Grafica 3D — stile simil-realistico da codice

> Regole di stile e piani di lavoro sull'aspetto di modelli e superfici. Mondo, terreno come dati, milestone:
> `docs/ESPLORAZIONE_3D.md`. Decisione di partenza (novembre 2026): dopo la valutazione di M4, **simil-realistico,
> non iper-realistico**, spinto al massimo con il solo codice; apporti esterni da decidere dopo (vedi in fondo).

## Convenzioni (valgono per tutti i modelli nuovi o rifatti)

- **Schermo di riferimento: 1920×1080.** Il repo è pubblico, ma le scelte di misura si prendono
  sull’esperienza di gioco dell’autore su quello schermo: non si rimpicciolisce né si comprime nulla per
  formati minori. Gli schermi più piccoli devono restare **usabili** (niente parti irraggiungibili o tagliate),
  non ottimali. Attenzione: su un monitor 1080p la finestra del browser è alta circa 900–950px, non 1080.
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

### Aspetto del cavaliere per livello, ruolo e Onore — deciso con l'utente, 28/11/2026, da fare

Oggi il modello è sempre lo stesso (grande elmo, cotta, scudo con la croce, spada, mantello rosso) anche per il
garzone con 3 oro: non è coerente. Regola: **abiti completi standard per livello**, più colori e segni per ruolo e
Onore; l'equipaggiamento comprato cambia solo i numeri, non l'aspetto (rivisto con l'utente lo stesso giorno: prima era
un pezzo 3D per ogni oggetto del catalogo). Motivo: la modellazione dei pezzi sarebbe decine di oggetti, lavoro tolto
al mondo; il cavaliere si vede sempre di spalle a 3–5 m, il mondo intorno è ciò che rende il gioco vario. Livelli,
ruoli ed Esperienza in `docs/EARLY_GAME.md` §2, Onore in `docs/GDD.md` §2, casate in `docs/FACTIONS.md`.

**1. Abito per livello** (cinque abiti completi, uno per gruppo di livelli).

| Abito | Livelli | Com'è |
|---|---|---|
| Garzone | Garzone | cappuccio di lana, tunica e cintura, niente armi in vista |
| Scudiero | Scudiero | cuffia di maglia, giaco di cuoio, spada corta nel fodero, scudo di legno |
| Cavaliere | Cavaliere Errante, Cavaliere Provato | cotta di maglia con sopravveste, elmo, spada, scudo, **speroni dorati** (il segno storico del cavaliere) |
| Veterano | Veterano, Campione | armatura più completa (quella di oggi), grande elmo, cimiero |
| Leggenda | Leggenda | la più ricca: finiture, cimiero alto, mantello pregiato |

**2. Ruolo: colori, non pezzi.**
- **Via giurata:** sopravveste, scudo e gualdrappa del cavallo nei **colori della casata** (generati in G3).
  **Via della ventura:** colori e stemma propri.
- **Capitano della casata:** **stendardo quadrato** sulla lancia o al seguito (come storicamente il banneret); gli altri
  cavalieri un pennoncello triangolare, quando portano la lancia.

**3. Onore (−5…+5): segni piccoli, sempre colori o stemmi.**
- Alto: finiture d'oro sullo scudo, mantello di qualità; per strada la gente si scosta (abitanti).
- Basso: stemma coperto o scudo senza insegne, mantello scuro, il «cavaliere senza colori».
- Lo scudo capovolto come disonore resta un possibile **evento** (punizione pubblica), non una regola di aspetto.

**Vincoli.**
- Stessi snodi e misure del corpo di oggi (vedi sopra): animazione, collisioni e camera non cambiano.
- Niente volto scoperto: con le sole primitive verrebbe da manichino; cappuccio, cuffia ed elmo lo evitano.
- L'abito si cambia **solo quando cambia il livello**, colori e stemmi quando cambiano ruolo o Onore: mai per
  fotogramma; un solo modello alla volta, stesse chiamate di disegno di oggi (~15 000 triangoli al massimo).
- Modalità Libera: parte con l'abito da Cavaliere.
- Gli stessi abiti serviranno ai cavalieri non giocanti (G3–G5).

**Tranche.**
- **A — con l'investitura (G1 passo 6):** abiti Garzone, Scudiero e Cavaliere. Il garzone diventa cavaliere anche a
  vedersi.
- **B — con G3 fazioni e nomi:** colori e stemmi delle due vie, segni dell'Onore.
- **C — quando esisteranno quei livelli (G4, S5):** abiti Veterano e Leggenda, stendardo del Capitano.

## Persone dei borghi (`js/3d/persone3d.js`) — fatto, da provare dall'utente

Il contrasto col cavaliere è voluto: lui è il personaggio del giocatore ed è rifinito, la gente intorno no.
Livello di dettaglio deciso dall'utente (novembre 2026): «arti visibili, testa e capigliatura diverse, niente
riflessi, vestiti definiti e altri particolari che hai fatto sul cavaliere».
- **Forma**: tronco tornito (`LatheGeometry`) schiacciato in profondità, gambe con ginocchio e scarpa, braccia
  con spalla tonda, gomito piegato a riposo e mano, collo e **testa staccata**. Le braccia si staccano dal corpo
  di ~12°: a piombo sui fianchi sembravano appese. Proporzioni dal cavaliere (anca 0,90 m, spalla 1,40 m,
  testa 1,60 m), adulto di ~1,72 m, bambino a ~0,65.
- **Capigliatura**: guscio sul cranio il cui bordo inferiore cambia quota secondo la direzione — attaccatura sulla
  fronte davanti, sopra l'orecchio ai lati (guancia e tempia scoperte), giù sulla nuca dietro — e **non è
  simmetrico**: da un lato il ciuffo scende di più (scriminatura). Dal seme: colore (tavola pesata di 9 toni, dal
  corvino al bianco), lunghezza sulla nuca, volume, lato della scriminatura, e qualche adulto calvo (il guscio si chiude a
  volume zero: costa vertici, zero pixel).
- **Materiale**: `MeshLambertMaterial` opaco, un solo materiale. Niente mappe d'ambiente, niente satinature.
  I colori stanno nei pesi per vertice (veste, pelle, capelli): un peso sotto 1 sulla veste scurisce senza
  aggiungere un vestito a parte, così calzoni e scarpe sono la stessa stoffa più scura.
- **Guardie**: cappello di ferro (calotta e falda che scende verso fuori) e lancia nella mano destra; sotto
  l'elmo i capelli non si vedono. Volutamente rozze: devono leggersi come guardie a 3–5 m, non assomigliare al
  cavaliere. Le due parti stanno **nella geometria condivisa da tutti** e per chi non è una guardia si chiudono
  in un punto (`iDota` a 0): triangoli degeneri, zero pixel, **zero chiamate di disegno in più**. È lo stesso
  meccanismo dei calvi ed è la via da seguire per ogni futuro attributo di ruolo (arco, grembiule, bastone).
- **Varietà**: statura e corporatura dal seme nella matrice di istanza; la tavola delle vesti è in
  `abitanti3d.js` ed è stretta (bruni e verdi), quindi ogni persona schiarisce o scurisce la sua di ±15 %.
  Le guardie prendono già il tono della casata da `abitanti3d.js`.
- **Costo**: vedi `docs/PRESTAZIONI.md`. Una sola chiamata di disegno per tutte le persone del blocco.

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

## Riquadri e testi (HTML sopra la scena) — approvato con l'utente, novembre 2026

Tono da manoscritto e da opera incorniciata, senza esagerare. Codice in `js/3d/interfaccia.js`, regole in `style.css`
(sezione «Stile dei riquadri»), font in `assets/fonts/` (SIL OFL, vedi il `README.md` lì).
- **Caratteri**: Cinzel (titoli, date, numeri dei tasti), EB Garamond (testo e pulsanti), UnifrakturMaguntia (solo
  iniziali miniate e sigilli: mai frasi intere), Fondamento (scrittura a mano di voci e lettere).
- **Carta del cronista**: pergamena invecchiata con bordo strappato in una cornice di legno intagliato, disegnata in
  SVG alla misura vera (`cornice`): venatura orizzontale sopra e sotto e verticale ai lati, arco in alto con bottone
  rosso, filetti e intarsi d'oro curvi, quattro fregi diversi agli angoli (voluta, giglio, nodo, rosa) con scala e
  dettagli variati. Deterministica dal titolo: la stessa porta ha sempre la stessa cornice. Il contorno esterno resta
  solido (un contorno storto sopra la scena sembrerebbe un errore). Iniziale miniata oro su rosso; testi in bruno scuro
  (la nota e le scelte non disponibili restano leggibili sulla pergamena).
- **Fogli delle notizie** (`foglio`): la forma dice quanto fidarsi. *Voce*: ritaglio di carta povera, strappato,
  scrittura frettolosa, nessun sigillo. *Lettera*: pergamena piegata in tre, scrittura a mano, destinatario e firma,
  sigillo di ceralacca con l'iniziale e i nastri, del colore di chi scrive. *Bando*: foglio affisso con i chiodi,
  intestazione incisa, iniziale miniata, sigillo. `usura` 0–1 (distanza e tempo del viaggio) scurisce, macchia e
  sgualcisce. Arrivo: avviso in alto al centro che sparisce da solo (non ferma il gioco); i fogli restano nello
  **scrittoio** (`J`).
- **Pannello di stato, messaggi, minimappa**: sobri, legno scuro con un filetto d'oro, così i numeri restano leggibili.
- **Menu d’avvio**: titolo inciso in oro e sottotitolo. È la schermata di presentazione del gioco, quindi il
  corpo è generoso: riquadro 860px, titolo 76px, titoli delle voci 21px, descrizioni 20px, «Comincia» 24px.
  EB Garamond ha l’altezza della x bassa: sotto i 16px le righe lunghe diventano illeggibili su fondo scuro.
  Il contenitore allinea in alto e il riquadro si centra con `margin: auto`: con `align-items: center` più
  `overflow-y: auto` la parte alta esce a coordinate negative e lo scorrimento non la raggiunge.
- **Tecnica**: gli id dentro gli SVG hanno un prefisso per istanza (due SVG nella stessa pagina non si rubano i
  ritagli); lo sfondo si rifà quando il riquadro cambia misura (`ResizeObserver`). Niente immagini. La Carta di
  sviluppo (M) e il pannello F3 restano come sono.

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
