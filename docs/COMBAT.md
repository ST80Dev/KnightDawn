# FERRO & CENERE — Sistema Combattimento

> Documento di design per la **Fase S4**. Implementazione preceduta da
> scaffold dati come da regole operative CLAUDE.md.

---

## 1. Principi

- Combattimento **a passi interattivi** — ogni passo (round) presenta scelte
  al giocatore: continuare, fuggire, arrendersi, o azioni speciali contestuali
- **Non istantaneo** — durata variabile in passi, scala con la complessità del
  nemico (ladro 2-3, cavaliere 6-10, battaglia in esercito 20-40)
- Il **risultato del singolo passo** è automatico (formula su attributi /
  equipaggiamento / terreno); il **percorso dello scontro** è scelto dal giocatore
- Le decisioni pregresse contano: equipaggiamento, seguito, ferite, preparazione
- Letale: la morte è possibile come esito di un passo o di una scelta estrema

## 2. Lunghezza dello scontro

Numero indicativo di passi totali per archetipo (N):

| Tipo scontro                                  | N passi |
|-----------------------------------------------|--------:|
| Ladro disarmato, animale piccolo              |   2–3   |
| Bandito armato, lupo, predone                 |   4–6   |
| Cavaliere singolo, orso, creatura selvatica   |   6–10  |
| Boss di fazione, creatura mitica              |  10–15  |
| Scaramuccia con piccolo seguito               |   8–12  |
| Battaglia in esercito                         |  20–40  |

Battaglie lunghe sono suddivise in **fasi narrative** (es. schieramento → urto
→ mischia → rotta), con scelte diverse per fase.

## 3. Struttura di un passo

Ogni passo esegue, in ordine:

1. **Risoluzione automatica**: micro-scambio calcolato da formula (§5),
   narrato in cronaca + Carta del cronista.
2. **Aggiornamento Slancio**: variabile bilanciata ±N che misura il vantaggio
   cumulato. Più leggibile di HP astratti; a fine N passi lo Slancio determina
   l'esito di default (vittoria se positivo, sconfitta se negativo, stallo
   altrimenti).
3. **Scelte del passo**: presentate al giocatore (§4). Una scelta consuma il
   passo successivo o termina lo scontro in anticipo.
4. **Costo tempo**: ogni passo avanza il calendario di una frazione di
   Diario. Scaramuccia ≈ 1 Diario, battaglia ≈ 1–2 Luci.

## 4. Scelte disponibili

### Sempre disponibili
- **Continua** — prossimo passo automatico
- **Tenta fuga** — tiro su Volontà + terreno; fallita = -slancio + 1 passo extra
- **Arrenditi** — l'esito dipende dal nemico (umano onorevole → cattura;
  bandito → spogliato; mostro → morte)

### Contestuali (sbloccate da condizioni, uso limitato)
- **Disarcionare** — se a cavallo e nemico a piedi
- **Invocare il ferro magico** — se possiedi arma magica non ancora usata
- **Chiedere parlamento** — se Onore alto e nemico umano, una sola volta
- **Colpo disperato** — costo: ferita garantita, in cambio di +slancio forte
- **Usare oggetto** — talismani, pozioni, reliquie dal bagaglio
- **Comando agli arcieri / Carica / Ritirata ordinata** — solo in battaglia
  con esercito al seguito

Le contestuali appaiono solo nei passi in cui hanno senso (es. *parlamento*
non disponibile dopo che è stato versato sangue significativo).

## 5. Formula di passo

`[TBD]` — fissata in S9. Fattori in input:

- Attributi base (Vigore, Volontà)
- Arma equipaggiata (danno base, tipo)
- Armatura (riduzione, tipo)
- Ferite accumulate (malus)
- Stanchezza da viaggio (malus se appena viaggiato)
- Terreno corrente (bonus/malus per tipo di scontro)
- Arti magiche attive
- Numero combattenti / seguito (vantaggio numerico)
- Reputazione (intimidazione passiva sul morale nemico)

Output del passo: `{ slancioDelta: ±int, ferita?: bool, narrazione: string }`

## 6. Tipi di avversari

`[TBD]` — catalogo concreto in S9. Categorie:

- Banditi (umani, deboli, numerosi)
- Soldati di casata (umani, equipaggiati, disciplinati)
- Cavalieri (umani, forti, singoli)
- Creature selvatiche (lupi, orsi, cinghiali)
- Creature magiche/mitiche
- Boss di fazione

Ogni archetipo definisce: N passi, scelte di resa/parlamento ammesse,
modificatori in formula, esiti possibili.

## 7. Esiti

- **Vittoria** — bottino (oro/oggetti), onore, news propagata
- **Fuga riuscita** — perdita oro/oggetti, malus reputazione locale
- **Resa accettata** — cattura → arco narrativo prigionia (S8)
- **Resa rifiutata** — lo scontro continua con +slancio negativo forte
- **Ferita** — uscita dallo scontro con malus persistente (vedi `knight.js`)
- **Morte** — game over (oppure penalità grave, da decidere in S9)

## 8. Integrazione con S3 (eventi)

Il punto di sutura S3↔S4 è un nuovo tipo di effetto evento:

```js
{ type: 'combat', enemy: 'banditi.boscaglia', onWin: [...], onFlee: [...],
  onSurrender: [...], onDeath: [...] }
```

Un evento di viaggio o di luogo può sospendere e lanciare il combattimento,
poi applicare gli effetti del ramo-esito al ritorno. Schema dettagliato in
`docs/EVENTS.md` quando S4 esce dallo stub.

## 9. Visualizzazione

Vista combattimento dedicata in `scenes.js`:
- Carta del cronista per il passo corrente (narrazione + miniatura)
- Indicatore Slancio (barra simbolica, non numerica)
- Pulsantiera scelte (sempre + contestuali del passo)
- Cronaca scorrevole dei passi precedenti
- Niente sprite animate dei combattenti — la narrazione regge la scena
