# Milestone «Prestazioni» — chiusa (novembre 2026)

> **Chiusa dall'utente il 21/11/2026.** Risultato sulla scheda di riferimento (Intel UHD 730, 1884×917): partenza standard
> da 38 a ~76 FPS; bosco fitto, il caso peggiore, 83 FPS (1% peggiori 49,8, fotogramma peggiore 20 ms), GPU 10,9 ms su
> 15,5 di budget. Da qui in avanti il documento vale come **regola**: budget (sotto), regole per i contenuti nuovi
> (passo 6) e percorso di prova per ogni PR che aggiunge cose disegnate. La sessione «M1 - grafica» resta il riferimento
> per le prestazioni. Rimasti aperti, senza urgenza: terreno 4,4 ms (budget 4,5), passi 4–5 in parte (unire il cavaliere
> per snodo prima di moltiplicare personaggi simili).

> Richiesta dell'utente (novembre 2026): «senza continuare a mettere toppe e togliere cose man mano, come possiamo avere
> una cosa più realistica da qui in avanti, se con questi elementi siamo già a 30 FPS? Con cavallo, personaggi ed
> edifici del borgo crasha tutta la scheda video». Questo documento è il riferimento per **tutte** le sessioni: chi
> aggiunge qualcosa che si disegna lo legge prima. Stile e materiali: `docs/GRAFICA_3D.md`.

## Situazione

- In pieno bosco ~30 FPS; senza vegetazione 40–45 FPS (misure dell'utente con F3). Un `CONTEXT_LOST` (crash della
  scheda) causato dalle ombre su tela 2D di ~78 000 oggetti in un solo fotogramma, ora corretto.
- **Scheda di riferimento: Intel UHD Graphics 730** (integrata, 24 unità di calcolo; Chrome su Windows via ANGLE
  Direct3D 11, driver 30.0.101.1273), schermo **1920×1080, ridimensionamento di Windows 100%** (`devicePixelRatio` 1).
  È il «PC medio» della regola 8 di `CLAUDE.md`.
- Causa di fondo [Probabile]: ogni sessione aggiunge la sua parte senza un tetto di costo e senza misure sulla scheda
  vera (in headless il rendering è software). Le singole scelte erano ragionevoli; sommate sforano.

## Cosa costa su una scheda integrata (in ordine di peso)

Memoria condivisa con la CPU, poca banda, pochi pixel al secondo. Il costo cresce soprattutto con
**pixel disegnati × lavoro per pixel**; poi le chiamate di disegno (driver Intel costosi); i triangoli pesano meno.
Nel codice di oggi [Probabile, da confermare con le misure del passo 1]:
1. **`logarithmicDepthBuffer: true`** (`main.js`): ogni frammento scrive la propria profondità, quindi si perde il test
   di profondità anticipato. Nel bosco ogni strato nascosto (foglie dietro foglie, terreno sotto gli alberi) esegue lo
   shader per intero. Serve per disegnare da 0,2 m a 130 km.
2. **`antialias: true`** (MSAA): più campioni per pixel.
3. **Risoluzione**: sulla scheda di riferimento `devicePixelRatio` è 1, quindi 1920×1080 = ~2 milioni di pixel, nessun
   raddoppio. Pesa su schermi con ridimensionamento sopra il 100% (fino a ×2,2 i pixel).
4. **Shader del suolo** a colore per pixel: decine di letture di rumore per pixel vicino (suolo, neve, lettiera,
   micro-rilievo del prato, ombre).
5. **Chiamate di disegno:** rocca 170 oggetti, cavaliere 86; il borgo, il cavallo e le persone ne aggiungerebbero
   centinaia se costruiti allo stesso modo.
6. Triangoli: vegetazione ~0,5–1,2 milioni nel bosco, orizzonte ~0,2 milioni.

## Obiettivi e budget

- **60 FPS nel preset «medio»** sulla UHD 730 a 1920×1080; **mai sotto 30** in nessun preset (confermato dall'utente).
- Budget per fotogramma (16,6 ms), **ritarato sulle misure e approvato dall'utente (21/11/2026)**; vale nel caso
  peggiore (bosco fitto, `&centro=99937,43289` del seme 570549), qualità media.

| Sistema | GPU (ms) | Chiamate | Note |
|---|---|---|---|
| Terreno (blocco + orizzonte) | 4,5 | 15 | blocco cotto in texture; anelli ridotti (misurato 4,4) |
| Vegetazione | 6,5 | 35 | sagome oltre la media distanza (misurato 6,5 nel bosco fitto, 3,4 alla partenza) |
| Borgo, cavallo e persone, insieme | 3 | 120 | edifici 1,5 + personaggi 1,5 nel profilatore; regole al passo 6 |
| Acqua, cielo, effetti | 1,5 | 10 | (misurato 0,3–1,0) |
| Totale | 15,5 | — | margine ~1 ms sui 16,6 dei 60 FPS |

- CPU: JavaScript per fotogramma ≤ 4 ms; nessun lavoro pesante in un solo fotogramma (a pezzi o nel Worker).
- Memoria GPU: texture ≤ 128 MB. Nessuna creazione di materiali o texture durante il gioco, solo al caricamento.

## Passi (ciascuno provato dall'utente nel browser)

1. **Misura vera.** Profilatore nel pannello F3 con i timer della scheda (`EXT_disjoint_timer_query_webgl2`): la scena
   si disegna a gruppi (terreno, vegetazione, edifici, personaggi, resto) e ogni gruppo ha i suoi millisecondi GPU,
   colorati in rosso se sforano il budget. Se la scheda non offre i timer, si ripiega su F4 (spegnere a turno).
   Mostra anche il nome della scheda (`WEBGL_debug_renderer_info`). **Percorso di prova**: un tasto fa percorrere alla
   camera un tragitto fisso di ~30 s (pianura, bosco fitto, rocca) e riporta medie e picchi: numeri confrontabili prima
   e dopo ogni modifica.
   **Stato: fatto, da provare dall'utente** (`js/3d/prestazioni.js`, agganci in `main.js`). Con `F3` aperto:
   - il pannello mostra scheda, timer GPU sì/no, profondità invertita possibile sì/no, MSAA, profondità logaritmica,
     tempi CPU (logica, invio comandi) e GPU del fotogramma (media e picco) contro il budget;
   - `F4` → «misura per gruppi»: ms GPU di terreno, vegetazione, edifici, personaggi, resto (⚠ se oltre il budget);
     l'immagine è identica a quella normale (verificato pixel per pixel);
   - `F9` (o `?prova` nell'indirizzo, parte da solo 3 s dopo la Scena): percorso di prova di ~35 s (giro dello
     sguardo dalla vista di gioco 12 s, giro dalla vista alta 5 s; due volte, normale e per gruppi; tempo di gioco
     fermo), poi un riquadro con i numeri da copiare. Prova di riferimento: `?seme=570549&prova` (partenza nel bosco).
   In headless (SwiftShader) i timer GPU non ci sono: «profondità invertita possibile: sì» c'è già lì.
2. **Fondamenta del renderer** — *prima si misura*: parametri facoltativi del percorso di prova (senza parametri il gioco
   non cambia): `&profondita=log` (predefinita) | `invertita` | `normale`, `&msaa=0`, `&centro=x,z` (partenza in un
   punto scelto, m del mondo; bosco fitto del seme 570549: `&centro=99937,43289`). [Probabile] la profondità invertita
   dà precisione solo con un buffer di profondità in virgola mobile: con quello del canvas (24 bit interi) e la scena da
   0,2 m a 130 km può far sfarfallare il lontano; le prove dicono quanto vale il guadagno prima di riscrivere il
   renderer (profondità invertita su un render target a 32 bit, o due passate lontano/vicino).
   **Deciso con l'utente (21/11/2026):** profondità **invertita** predefinita (bosco fitto 46,3 → 71,7 FPS; nessuno
   sfarfallio visto dall'utente; con la logaritmica il polygonOffset delle strade non valeva, ora sì), ripiego sulla
   logaritmica se manca `EXT_clip_control`. **MSAA resta acceso** (senza: +24 % ma bordi seghettati; candidato per un
   preset «basso»). Nel bosco fitto la vegetazione resta oltre il budget (8,8–10,3 ms): latifoglie vicine ~2.450
   triangoli l'una e 59k sagome nel blocco, alla sessione vegetazione.
   **Preset e risoluzione adattiva — fatto** (`creaQualita` in `prestazioni.js`): tasto `F2` (qualità bassa / media /
   alta, ricordata nel browser; `?qualita=` per le prove). Bassa: risoluzione ×0,75 e niente micro-rilievo di prato e
   neve; media: come prima sulla scheda di riferimento (`devicePixelRatio` fino a 1,5); alta: fino a 2. Risoluzione
   adattiva in tutti i preset: −10 % per volta (fino a ×0,6) se la GPU supera 15 ms (o i fotogrammi 18 ms senza timer),
   +5 % dopo 3 s sotto 10,5 ms (o 14 ms); ferma durante il percorso di prova e nelle prove F4. Limite noto: senza
   timer GPU, su uno schermo a 60 Hz i fotogrammi non scendono sotto 16,7 ms e la risoluzione non risale.
   Seguito: (guadagni grandi, senza toccare i contenuti):
   - togliere la profondità logaritmica: provare `reversedDepthBuffer` (presente in three r187, richiede
     `EXT_clip_control`); se la precisione non basta, due passate (lontano: orizzonte con near ~300 m; poi si azzera la
     profondità e si disegna il vicino con far ~3 km);
   - **preset di qualità** basso / medio / alto (+ «automatico» dalle misure dei primi secondi): risoluzione, MSAA,
     distanze dei livelli di dettaglio, densità della vegetazione, dettaglio dello shader del suolo;
   - **risoluzione adattiva**: scende quando il fotogramma sfora, risale quando c'è margine.
3. **Terreno.** Shader a livelli per distanza (vicino ricco, medio semplice, lontano solo colore) e materiale ridotto per
   gli anelli dell'orizzonte. Colore e dettaglio del blocco **cotti in una texture al caricamento** (es. 2048² sui 2 km,
   ~1 m per pixel, generata dal codice): una lettura invece di decine; il rumore fine resta solo entro ~50 m.
   **Stato: prima parte fatta, da misurare dall'utente** (`terrain.js`: `cuociSuolo`, modalità `SUOLO_COTTO`,
   `SUOLO_CUOCI`, `SUOLO_LONTANO`). Al caricamento della Scena, dopo la vegetazione (che aggiunge `aSuolo`), il blocco
   si disegna una volta dall'alto in una texture 2048² con mipmap (~21 MB): nel gioco una lettura per pixel; restano
   calcolati le ombre finte e il micro-rilievo di prato e neve vicino. Gli anelli dell'orizzonte (materiale senza
   `mezzo`) usano la modalità ridotta: solo rumori da 32 m in su, niente lettiera, terra nuda, bordo fine della neve.
   Rumori da 128 e 512 m da texture di 64² e 16² (periodo 8192 m invariato). Effetto visibile: le chiazze ocra e scure
   del prato, prima solo entro 60–180 m, ora sono cotte ovunque (prati un po' più variegati da lontano, nessun anello
   di comparsa). In headless (rendering software, dove le texture costano molto più che su una scheda vera): blocco
   −25/30 %, anelli −10/15 %; il micro-rilievo del prato vale ~¼ del blocco cotto. Sulla scheda vera: percorso di prova.
4. **Vegetazione.** **Impostor** per gli alberi oltre la media distanza: immagini dell'albero procedurale generate al
   caricamento in un atlante (resta tutto codice, nessun asset esterno), su due piani incrociati o rivolti alla camera.
   Densità e distanze dai preset.
5. **Oggetti composti.** Funzione comune che unisce le geometrie di un gruppo **per materiale**, rispettando gli snodi
   che si animano: rocca, cavaliere, poi ogni edificio del borgo. Livelli di dettaglio per gli edifici (lontano: volumi
   semplici).
6. **Regole per i contenuti nuovi** (M7 e dopo), da rispettare **prima** di farli. Budget complessivo di borgo, cavallo
   e persone: **3 ms GPU, ≤ 120 chiamate di disegno in più, ≤ 1,5 ms CPU** nel caso peggiore.
   - *Edifici del borgo*: ≤ 1.500 triangoli a casa vicino, ≤ 200 oltre ~150 m (volumi semplici); componenti ripetuti
     (finestre, porte, travi, tegole, comignoli) in `InstancedMesh` **condivise tra tutte le case**, così le chiamate
     del borgo intero restano ≤ 40 qualunque sia il numero di case; ≤ 8 materiali per tutto il borgo; il dettaglio dei
     muri (pietra, intonaco, mattoni) in una texture generata una volta al caricamento, non in geometria; niente interni
     finché non si entra; mura del borgo come la rocca, unite per materiale. Luci: nessuna `PointLight` oltre le 4–6
     già previste; fiaccole e finestre con materiali emissivi.
   - *Cavallo*: ≤ 6.000 triangoli, ≤ 12 oggetti (uno per snodo animato), materiali come il cavaliere (Phong per i
     metalli, Lambert il resto); animazione procedurale come il cavaliere.
   - *Persone*: ≤ 2.000 triangoli e ≤ 8 oggetti a persona (pezzi uniti per snodo); geometrie condivise tra persone
     (colori diversi per istanza dove si può); animate a piena frequenza entro ~40 m, a metà frequenza fino a ~120 m,
     ferme oltre, non disegnate (o sagome) oltre ~200 m; al più ~12 animate insieme e ~40 visibili.
   - *Sempre*: nessun lavoro oltre ~1,5 ms in un solo fotogramma (a pezzi o nel Worker); niente materiali o texture
     creati durante il gioco, solo al caricamento; alpha test solo dove serve; il cavaliere oggi è 86 oggetti
     (0,1 ms GPU, ma pesa sulle chiamate): unirlo per snodo prima di moltiplicare personaggi simili.
   - *Ogni PR* che aggiunge cose disegnate dichiara costo e budget e passa dal percorso di prova alla partenza e nel
     caso peggiore (bosco fitto; nel borgo con `&centro=` sul borgo, quando c'è); risultati nella tabella in fondo.
7. **Verifica e regola fissa.** Percorso di prova prima e dopo ogni PR che aggiunge cose disegnate; tabella dei risultati
   in fondo a questo documento. Una PR che fa sforare il budget non entra in `main` senza una decisione dell'utente.

## Organizzazione

- **M7 è in pausa** finché questa milestone non è chiusa (decisione dell'utente, regola 4): nessuna sessione aggiunge
  cose disegnate nuove; si possono chiudere lavori già in corso solo se non aumentano il costo.
- **Sessione responsabile: «M1 - grafica»** (decisione dell'utente). Le altre la consultano prima di aggiungere cose
  costose e non cambiano renderer, preset o budget.
- I passi 2–5 toccano file di tutte le sessioni (`main.js`, `terrain.js`, `vegetazione3d.js`, `castle3d.js`,
  `knight3d.js`): si lavora un file alla volta, avvisando prima il proprietario, unendo `main` spesso.

## Dove stanno i parametri (dalle sessioni proprietarie)

- *Vegetazione* (`js/3d/vegetazione3d.js`, `js/mondo/vegetazione.js`): livelli e distanze in `creaModelli` (alberi
  60 / 300 / oltre; cespugli 35 / 160 m) e `VICINO` (erba 70 m, felci 70, ciottoli 50); densità in `VEGETAZIONE`; ombre
  finte in `OMBRE` (sole 1024², piede 2048²); micro-rilievo del prato in `materialeSuolo` (`wPrato`, entro 80 m).
- *Strade e fiumi* (`js/3d/acqua.js`, sessione M6): nastro delle strade (`creaNastroStrada`) alzato di 0,25 m sul terreno
  disegnato con `polygonOffset`; nastri dei fiumi a +0,03 m sul pelo. **Cambiando la profondità** (invertita o due
  passate) verificare che non spariscano né sfarfallino.
- *Anelli dell'orizzonte*: quota da `quotaFinale` (`js/mondo/scena.js`, sessione M6); un materiale ridotto per gli anelli
  non dovrebbe richiedere cambi lì, altrimenti scrivere a M6.

## Rischi e incertezze

- [Probabile] La profondità logaritmica e l'MSAA sono una parte grossa del costo nel bosco; lo dirà il passo 1.
- [Ipotesi] Con ANGLE su Direct3D 11 non è certo che ci siano `EXT_clip_control` (profondità invertita) ed
  `EXT_disjoint_timer_query_webgl2` (timer GPU): il passo 1 lo verifica e mostra nel pannello F3 cosa c'è.
- [Ipotesi] `reversedDepthBuffer` sul buffer di profondità del canvas (24 bit) potrebbe non bastare per 0,2 m–130 km:
  in quel caso le due passate, più lavoro ma soluzione classica.
- [Certo] I timer GPU possono mancare su alcuni browser o driver: il ripiego (F4, tempi CPU) è più grossolano.
- [Probabile] Gli impostor si notano da vicino se la distanza di passaggio è troppo corta; si tarano guardando.
- [Certo] Il simil-realistico nel browser su scheda integrata ha un tetto: ombre proiettate vere, luce che rimbalza,
  decine di persone dettagliate non ci staranno. Si sceglie dove spendere: dettaglio vicino al cavaliere, impressione
  d'insieme lontano.
- Costo in tempo [Ipotesi]: 2–3 sessioni di lavoro per i passi 1–5, senza contenuti nuovi.

## Decisioni prese con l'utente (novembre 2026)

1. M7 in pausa durante questa milestone.
2. Obiettivo: 60 FPS nel preset medio, mai sotto 30.
3. Sessione responsabile: «M1 - grafica».
4. Scheda: Intel UHD Graphics 730 (ANGLE, Direct3D 11), 1920×1080 al 100%.

## Risultati del percorso di prova

Scheda Intel UHD 730 (il browser Brave nasconde il nome), 1920×935, seme 570549 (`?seme=570549&prova`).

| Data | Versione | FPS medio | 1% peggiori | GPU totale | Terreno | Vegetazione | Edifici | Personaggi | Resto | Chiamate | Triangoli |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20/11/2026 | main dopo #122–#123 (riferimento) | 38,0 | 19,9 | 24,7 | **16,7** | 4,9 | 0,1 | 0,1 | 1,8 | 301 | 859 mila |
| 20/11/2026 | main dopo #124–#125 (terreno cotto, sagome) ⚠ | 43,8 | 20,0 | 17,5 | 5,5 | **10,8** | 0,0 | 0,1 | 1,0 | 127 | 1222 mila |
| 20/11/2026 | main dopo #126 (partenza standard) | **75,7** | 49,8 | **11,4** | 5,1 | 3,4 | 0,2 | 0,1 | 1,0 | 310 | 720 mila |
| 21/11/2026 | bosco fitto (`&centro=99937,43289`), profondità logaritmica, MSAA | 46,3 | 24,9 | 16,4 | 4,9 | 10,3 | 0,0 | 0,1 | 0,9 | 127 | 1234 mila |
| 21/11/2026 | bosco fitto, **profondità invertita**, MSAA | **71,7** | 33,2 | 13,3 | 4,4 | 8,8 | 0,0 | 0,1 | 0,3 | 127 | 1253 mila |
| 21/11/2026 | bosco fitto, profondità logaritmica, senza MSAA | 57,3 | 25,0 | 13,7 | 3,3 | 9,5 | 0,0 | 0,1 | 0,6 | 127 | 1234 mila |
| 21/11/2026 | bosco fitto, main dopo #130–#132 (latifoglie leggere, vegetazione a pezzi, profondità invertita) | **83,1** | **49,8** | **10,9** | 4,4 | 6,5 | 0,0 | 0,1 | 0,3 | 131 | 1000 mila |
| 21/11/2026 | **nuova base** partenza (rocca), main dopo #135–#140 (meno mare, borgo, campi, curvatura, foschia) | 99,2 ¹ | 98,0 ¹ | 7,2 | 3,8 | 2,6 | 0,3 | 0,1 | 0,4 | 272 | 708 mila |
| 21/11/2026 | **nuova base** bosco fitto, stessa versione | 77,6 | 49,8 | 11,3 | 3,8 | **7,2** ⚠ | 0,0 | 0,1 | 0,2 | 128 | 1085 mila |
| 21/11/2026 | partenza dopo #141 (siepi) | 98,2 ¹ | **50,3** ⚠ | 6,9 | 3,9 | 2,2 | 0,3 | 0,1 | 0,4 | 272 | 660 mila |
| 21/11/2026 | **base attuale** partenza, main dopo #143 (erba vicina a fasce, latifoglie medie a 200 m) | 100,0 ¹ | **99,0** | 6,7 | 3,8 | 2,0 | 0,3 | 0,1 | 0,3 | 272 | 655 mila |
| 21/11/2026 | bosco fitto, main dopo #143 | **82,1** | 49,8 ² | 11,1 | 4,0 | 7,0 ⚠ | 0,0 | 0,1 | 0,2 | 127 | 898 mila |
| 21/11/2026 | **base attuale** bosco fitto, main dopo #144 (sagome diradate da 300 m) | **84,1** | 49,8 ² | 10,7 | 4,0 | 6,5 | 0,0 | 0,1 | 0,2 | 127 | 882 mila |

Nuova base (21/11/2026, qualità alta = media sullo schermo di riferimento al 100 %). Le Carte sono rigenerate (#135):
la scena della partenza e il bosco non sono gli stessi di prima, quindi il confronto con le righe precedenti è solo
indicativo. ¹ Alla partenza gli FPS sono fermi alla frequenza dello schermo (~100 Hz): conta la GPU, 7,2 ms.
- Bosco fitto: vegetazione 7,2 ms, **oltre il budget di 6,5** (sagome lontane 0,6 · sagome 1,6 · erba 0,1 · resto 4,9;
  latifoglie vicine ~4400 istanze, 300 mila triangoli). Totale ancora entro il budget (11,3 su 15,5). Segnalato alla
  sessione Vegetazione.
- Partenza: CPU massimo 14,3 ms, quasi tutto «vegetazione: aggiorna» (massimo 13,5, 1% peggiori 4,4); prima il massimo
  del processore era 7,2 ms. Non perde fotogrammi (peggiore 20,2 ms) ma va riportato sotto ~8 ms prima di borgo
  abitato e personaggi. Segnalato alla sessione Vegetazione.
- Terreno 3,8 ms in entrambi i punti (era 4,4–5,1).

Dopo #141 (siepi) lo scatto del processore alla partenza era peggiorato (1% peggiori 21,1 ms di «vegetazione: aggiorna»):
era il ricalcolo dell'erba vicina, tutto in un fotogramma. Con #143 (a fasce, tetto di ~1,5 ms condiviso) alla partenza
nessun fotogramma supera 10,2 ms e «vegetazione: aggiorna» ha massimo 3,1 ms.
² Bosco fitto: l'1% peggiore a 49,8 FPS (20 ms) è il doppio del periodo dello schermo a ~100 Hz: un fotogramma che
supera 10 ms aspetta il giro successivo. GPU di picco 14,9 ms.
Bosco fitto dopo #143: le latifoglie medie a 200 m hanno tolto 187 mila triangoli, ma la vegetazione è scesa solo da 7,2 a
7,0 ms: «veg. resto» 4,9 → 3,8, «veg. sagome» 1,6 → 2,5 (38 786 istanze). Il costo segue i pixel coperti, non i triangoli
[Probabile]: le sagome con alphaTest (discard) sovrapposte disegnano più volte gli stessi pixel, e il discard toglie alla
scheda lo scarto anticipato per profondità. Sforamento 0,5 ms con il totale a 11,1 su 15,5.

Ultima riga (bosco fitto, il caso peggiore): obiettivo raggiunto (83,1 FPS, 1% peggiori 49,8, fotogramma peggiore
20,2 ms); scatti risolti (CPU massimo 7,2 ms, nessun compito lungo; prima il pannello F3 ricostruito a ogni fotogramma e la
ridistribuzione della vegetazione tutta in un fotogramma). **Budget ritarati sulle misure (proposta all'utente):**
terreno 4,5 · vegetazione 6,5 (bosco fitto) · borgo, cavallo e persone insieme 3 · resto 1,5 = ~15,5 ms su 16,6.

Terza riga (stessa partenza della prima): obiettivo di 60 FPS raggiunto con margine (GPU 11,4 ms su 13,5; CPU 3,4 ms di
media, 21,7 ms di massimo). Vegetazione: sagome lontane 1,2 · sagome nel blocco 0,4 · erba 1,3 · resto 0,5 ms. Resta da
misurare un punto difficile (bosco fitto: la seconda riga, scena a 99937, 43289, aveva vegetazione a 10,8 ms).

⚠ Seconda riga: la prova era partita dal salvataggio dell'utente (scena centrata a 99937, 43289), non dalla partenza
standard: la vegetazione non è confrontabile. Da allora `?prova` non legge né scrive salvataggi (parte sempre dalla
partenza del seme) e il riquadro separa la vegetazione (sagome lontane, sagome nel blocco, erba, resto) e riporta i
tempi del processore (media, 1% peggiori, massimo).

Lettura: la GPU è il collo di bottiglia (24,7 ms su 26,3 ms di fotogramma); il **terreno** vale due terzi. Edifici e
personaggi costano ~0,1 ms: unire le geometrie (passo 5) non è urgente. Ordine dei passi rivisto: prima terreno
(passo 3) e profondità (passo 2), poi vegetazione.
