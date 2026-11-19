# Milestone «Prestazioni» — piano (da approvare)

> Richiesta dell'utente (novembre 2026): «senza continuare a mettere toppe e togliere cose man mano, come possiamo avere
> una cosa più realistica da qui in avanti, se con questi elementi siamo già a 30 FPS? Con cavallo, personaggi ed
> edifici del borgo crasha tutta la scheda video». Questo documento è il riferimento per **tutte** le sessioni: chi
> aggiunge qualcosa che si disegna lo legge prima. Stile e materiali: `docs/GRAFICA_3D.md`.

## Situazione

- In pieno bosco ~30 FPS; senza vegetazione 40–45 FPS (misure dell'utente con F3). Un `CONTEXT_LOST` (crash della
  scheda) causato dalle ombre su tela 2D di ~78 000 oggetti in un solo fotogramma, ora corretto.
- **Scheda di riferimento: integrata Intel** (quella dell'utente). È il «PC medio» della regola 8 di `CLAUDE.md`.
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
3. **Risoluzione** fino a `devicePixelRatio` 2 (con lo zoom di Windows al 125–150% sono 1,5–2,2 volte i pixel).
4. **Shader del suolo** a colore per pixel: decine di letture di rumore per pixel vicino (suolo, neve, lettiera,
   micro-rilievo del prato, ombre).
5. **Chiamate di disegno:** rocca 170 oggetti, cavaliere 86; il borgo, il cavallo e le persone ne aggiungerebbero
   centinaia se costruiti allo stesso modo.
6. Triangoli: vegetazione ~0,5–1,2 milioni nel bosco, orizzonte ~0,2 milioni.

## Obiettivi e budget

- **60 FPS nel preset «medio»** sulla scheda dell'utente, alla sua risoluzione; **mai sotto 30** in nessun preset.
  Da confermare con l'utente.
- Budget per fotogramma (16,6 ms), **provvisorio**: si tara con le misure del passo 1.

| Sistema | GPU (ms) | Chiamate | Note |
|---|---|---|---|
| Terreno (blocco + orizzonte) | 4 | 15 | shader a livelli per distanza |
| Vegetazione | 4 | 30 | impostor oltre la media distanza |
| Edifici (rocca, borgo) | 2 | 40 | geometrie unite per materiale |
| Personaggi (cavaliere, cavallo, persone) | 2 | 30 | 1–3 oggetti a personaggio |
| Acqua, cielo, effetti | 1,5 | 10 | |
| Margine | 3 | — | picchi, scheda più lenta |

- CPU: JavaScript per fotogramma ≤ 4 ms; nessun lavoro pesante in un solo fotogramma (a pezzi o nel Worker).
- Memoria GPU: texture ≤ 128 MB. Nessuna creazione di materiali o texture durante il gioco, solo al caricamento.

## Passi (ciascuno provato dall'utente nel browser)

1. **Misura vera.** Profilatore nel pannello F3 con i timer della scheda (`EXT_disjoint_timer_query_webgl2`): la scena
   si disegna a gruppi (terreno, vegetazione, edifici, personaggi, resto) e ogni gruppo ha i suoi millisecondi GPU,
   colorati in rosso se sforano il budget. Se la scheda non offre i timer, si ripiega su F4 (spegnere a turno).
   Mostra anche il nome della scheda (`WEBGL_debug_renderer_info`). **Percorso di prova**: un tasto fa percorrere alla
   camera un tragitto fisso di ~30 s (pianura, bosco fitto, rocca) e riporta medie e picchi: numeri confrontabili prima
   e dopo ogni modifica.
2. **Fondamenta del renderer** (guadagni grandi, senza toccare i contenuti):
   - togliere la profondità logaritmica: provare `reversedDepthBuffer` (presente in three r187, richiede
     `EXT_clip_control`); se la precisione non basta, due passate (lontano: orizzonte con near ~300 m; poi si azzera la
     profondità e si disegna il vicino con far ~3 km);
   - **preset di qualità** basso / medio / alto (+ «automatico» dalle misure dei primi secondi): risoluzione, MSAA,
     distanze dei livelli di dettaglio, densità della vegetazione, dettaglio dello shader del suolo;
   - **risoluzione adattiva**: scende quando il fotogramma sfora, risale quando c'è margine.
3. **Terreno.** Shader a livelli per distanza (vicino ricco, medio semplice, lontano solo colore) e materiale ridotto per
   gli anelli dell'orizzonte. Colore e dettaglio del blocco **cotti in una texture al caricamento** (es. 2048² sui 2 km,
   ~1 m per pixel, generata dal codice): una lettura invece di decine; il rumore fine resta solo entro ~50 m.
4. **Vegetazione.** **Impostor** per gli alberi oltre la media distanza: immagini dell'albero procedurale generate al
   caricamento in un atlante (resta tutto codice, nessun asset esterno), su due piani incrociati o rivolti alla camera.
   Densità e distanze dai preset.
5. **Oggetti composti.** Funzione comune che unisce le geometrie di un gruppo **per materiale**, rispettando gli snodi
   che si animano: rocca, cavaliere, poi ogni edificio del borgo. Livelli di dettaglio per gli edifici (lontano: volumi
   semplici).
6. **Regole per i contenuti nuovi**, prima di farli:
   - *edifici del borgo*: componenti ripetuti in `InstancedMesh` o uniti per materiale; niente interni finché non si
     entra;
   - *cavallo*: come il cavaliere, ~5–8 mila triangoli, pochi oggetti (uno per snodo animato);
   - *persone*: 1–3 mila triangoli, unite per snodo; animate solo entro ~40 m, oltre ferme o impostor; al massimo
     ~12 animate insieme (da tarare);
   - ogni sistema nuovo dichiara costo e budget nella PR e nel proprio documento.
7. **Verifica e regola fissa.** Percorso di prova prima e dopo ogni PR che aggiunge cose disegnate; tabella dei risultati
   in fondo a questo documento. Una PR che fa sforare il budget non entra in `main` senza una decisione dell'utente.

## Organizzazione

- **Una sessione responsabile delle prestazioni** (proposta: la sessione «M1 - grafica», che ha già misure e
  diagnostica). Le altre la consultano prima di aggiungere cose costose e non cambiano renderer, preset o budget.
- I passi 2–5 toccano file di tutte le sessioni (`main.js`, `terrain.js`, `vegetazione3d.js`, `castle3d.js`,
  `knight3d.js`): si lavora un file alla volta, avvisando prima il proprietario, unendo `main` spesso.

## Rischi e incertezze

- [Probabile] La profondità logaritmica e l'MSAA sono una parte grossa del costo nel bosco; lo dirà il passo 1.
- [Ipotesi] `reversedDepthBuffer` sul buffer di profondità del canvas (24 bit) potrebbe non bastare per 0,2 m–130 km:
  in quel caso le due passate, più lavoro ma soluzione classica.
- [Certo] I timer GPU possono mancare su alcuni browser o driver: il ripiego (F4, tempi CPU) è più grossolano.
- [Probabile] Gli impostor si notano da vicino se la distanza di passaggio è troppo corta; si tarano guardando.
- [Certo] Il simil-realistico nel browser su scheda integrata ha un tetto: ombre proiettate vere, luce che rimbalza,
  decine di persone dettagliate non ci staranno. Si sceglie dove spendere: dettaglio vicino al cavaliere, impressione
  d'insieme lontano.
- Costo in tempo [Ipotesi]: 2–3 sessioni di lavoro per i passi 1–5, senza contenuti nuovi.

## Da decidere con l'utente

1. **M7 in pausa** durante questa milestone (regola 4), o in parallelo con il vincolo di non aggiungere cose disegnate?
2. Obiettivo: 60 FPS nel preset medio, mai sotto 30 — va bene?
3. Quale sessione è responsabile delle prestazioni?
4. Dati della scheda: nome esatto (in Chrome `chrome://gpu`, riga «GL_RENDERER»), risoluzione dello schermo e
   ridimensionamento di Windows (100%, 125%, 150%…).

## Risultati del percorso di prova

(vuoto: si riempie dal passo 1)
