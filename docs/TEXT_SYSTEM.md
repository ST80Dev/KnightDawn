# Knight Dawn — Architettura del sistema testi

> **Stato:** stub architetturale. Verrà ampliato all'inizio della
> **Fase S3** della roadmap, in parallelo a `docs/EVENTS.md`.

## Scopo

Sostenere un mondo testualmente ricco senza dover scrivere ogni linea a mano.
La sensazione di varietà nasce dalla **combinazione contestuale di componenti
riusabili**, non dalla quantità di testo originale.

## I tre livelli di contenuto

### Livello A — Hand-crafted (raro, prezioso)

Testo scritto a mano per momenti unici e memorabili.

- Scene di archi narrativi principali
- Incontri con lord nominati e figure storiche del mondo
- Eventi unici di fazione (matrimoni reali, incoronazioni, tradimenti scriptati)
- Momenti rituali (uscita dall'Età della Veglia, fondazione covo,
  morte apprendista, primo titolo emergente)

Quantità target indicativa: poche centinaia di scene su tutto il gioco.

### Livello B — Template con slot (la maggior parte)

Strutture fisse per tipo di scena con **slot variabili** riempiti dal contesto.

Esempio (taverna):
```
"L'aria è {atmosfera_taverna}. {N_avventori} avventori siedono ai tavoli.
 L'oste, {descrittore_oste}, {azione_oste}.
 {if NPC_notevole_presente: NPC_notevole_frase}"
```

Ogni `{slot}` pesca da un pool ristretto filtrato per:
- Tipo di luogo
- Stagione, ora del giorno, meteo
- Reputazione del cavaliere nella regione
- Fazione che controlla il nodo
- News attive (clima generale)

### Livello C — Generativo combinatorio (riempitivo)

Frammenti brevi composti per riempire spazi atmosferici e reattivi.

- Descrizioni viaggio (*"Il sentiero attraversa una landa silenziosa."*)
- Reazioni standard NPC (saluti, addii, brontolii, esclamazioni)
- Esiti minori (*"Hai trovato qualche moneta abbandonata."*)

## Contesto del momento

Ogni scena ha accesso a un oggetto `Contesto` da cui template e slot leggono:

```
Contesto del momento:
  luogo: { tipo, fazione, ricchezza, posizione, popolazione }
  tempo: { era, luce, stagione, diario, passo, ora_del_giorno }
  cavaliere: { attributi, ferite, equipaggiamento_visibile,
               titolo_emergente, reputazione_locale, oro }
  seguito: { apprendista?, lama?, ombra?, conoscitore? }
  news: { clima_generale, voci_note_al_nodo }
  storico_locale: { visite_precedenti, ultima_visita_passi_fa,
                    eventi_passati_in_questo_nodo }
```

I template possono ramificarsi su qualsiasi attributo:
```
"L'oste ti guarda.
 {se reputazione_locale < -20: 'Le sue mani vanno al bastone sotto il banco.'
  altrimenti se titolo='Pellegrino Silenzioso': 'Annuisce in silenzio, rispettoso.'
  altrimenti se ferite > 60: 'Si fa il segno della croce vedendo le tue ferite.'
  altrimenti: 'Versa da bere senza chiedere.'}"
```

## Tabelle di scoperta (assorbono l'esplorazione)

Per ogni tipo di luogo e per ogni pulsante di esplorazione, una tabella
di possibili **scoperte** con peso e modificatori.

Esempio — tabella scoperte per *"Osserva la sala"* in taverna:

| Scoperta | Peso base | Modificatori |
|---|---|---|
| Forestiero incappucciato | 5 | reputazione_lord_locale alta → -2 |
| Mercante con offerta speciale | 8 | stagione=primavera → +3 |
| Litigio in corso | 6 | ora=notte → +4 |
| Cantastorie con voce non confermata | 4 | taverna_grande → +3 |
| Cantina con oggetto smarrito | 2 | Ombra nel seguito → +5 |
| Nulla di notevole | 10 | sempre |

Il giocatore non vede mai la tabella. Percepisce solo che *a volte succedono
cose, a volte no*, e che insistendo (più visite, più esplorazione) aumentano
le chance.

## Anti-ripetizione

- Pool di varianti per ogni slot frequente: minimo 5-10, idealmente 15+
- **Memoria locale**: il nodo ricorda le ultime N varianti usate, le esclude
  o le declassa
- **Memoria globale**: scoperte già ottenute si rimuovono o cambiano peso
- **Decadimento news**: news vecchie si trasformano in clima generale e
  scompaiono dai pannelli "fresche"

## Dove sta il lavoro di scrittura

In ordine di tempo richiesto:

1. **Pool di atomi descrittivi** — lavoro grande ma ripetitivo, scalabile.
   Aggettivi, oggetti, frammenti atmosferici per tipo di luogo, terreno,
   stagione, ora.
2. **Template per tipo di scena** — poche decine, ma curati. Definiscono
   la "grammatica" di taverna, sala del trono, cripta, accampamento, ecc.
3. **Tabelle di scoperta** — manutenibili nel tempo, si possono espandere
   continuamente senza rompere nulla.
4. **Scene hand-crafted** — le poche memorabili.
5. **Reazioni contestuali brevi** — frammenti attivati da condizioni
   (basso onore, ferite gravi, presenza compagno).

## Stima di scala (orientativa)

Per un mondo che dura 2-3 Luci di gameplay tipico, con ~10 tipi di luogo
e ~30 tipi di evento viaggio:

- ~30 template di scena (luoghi + eventi base)
- ~200-300 atomi descrittivi (aggettivi/oggetti/frammenti per terreno/stagione)
- ~50-100 voci nelle tabelle di scoperta
- ~30-50 scene hand-crafted per archi narrativi

Sostenibile da una persona. Crescita organica: si aggiungono righe alle
tabelle e atomi ai pool, non si riscrivono sistemi.

## Bootstrap (Fase S3 iniziale)

Si può partire con un **pool minimo** (3-5 varianti per atomo, 1-2 template
per luogo, 10-15 voci per tabella di scoperta) e ampliare giocando, segnando
mano a mano cosa stride o suona ripetitivo.

## TBD

- [ ] DSL/formato dei template (markup leggero per slot e condizioni)
- [ ] Schema dati per pool di atomi (organizzazione per tag)
- [ ] Schema dati per tabelle di scoperta
- [ ] Algoritmo di pescaggio pesato con anti-ripetizione
- [ ] Modalità autorialità (file separati per pool, template, scene)
- [ ] Localizzazione (se mai si volesse, struttura preparata)
- [ ] Tooling minimo di anteprima per controllare le varianti generate
