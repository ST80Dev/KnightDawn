# FERRO & CENERE — Modello di gameplay

> **Stato:** definizione concettuale. Verrà raffinato man mano che le fasi
> S2–S4 procedono. Sistemi di supporto: `docs/EVENTS.md` (eventi e scelte),
> `docs/TEXT_SYSTEM.md` (architettura testi), `docs/UI_GUIDE.md` (UI).

## Filosofia

Il gioco **non è action né solo gamebook**. È un'esperienza a turni che
cambia *modalità* (respiro) in base alla situazione: il giocatore non fa
sempre la stessa cosa, il suo ruolo si adatta a quello che il mondo gli
presenta.

Niente reflex, niente movimento real-time, niente puzzle point&click.
Il cuore è la **scelta narrativa pesata dal contesto**.

## Le cinque modalità (respiro multi-modale)

### 1. Calmo — Viaggio sulla mappa

- Click su destinazione → A* calcola percorso → cavaliere parte
- **Granularità: singolo Passo.** Lo scorrimento è *live* (tempo che scorre
  continuamente in Passi), pausabile in qualsiasi momento.
- Il giocatore può lasciare scorrere e nel frattempo:
  - sfogliare la cronaca / log eventi
  - controllare stato cavaliere, seguito, covi
  - leggere news note
  - consultare la mappa, fare zoom
- **Pausa automatica** quando: scatta un evento, si attraversa un luogo
  particolare, si raggiunge la destinazione, si subiscono ferite (es. meteo).
- Respiro: ampio, contemplativo, "esistenziale".

### 2. Sospeso — Scelta narrativa

- Trigger evento (viaggio o luogo) → tutto si ferma → appare una
  **Carta del cronista mobile** (vedi UI guide).
- **Pulsanti tematici** (non opzioni numerate): es. *"Avvicinati con cautela"*,
  *"Chiamali a gran voce"*, *"Ritirati nel bosco"*.
- Alcuni pulsanti hanno **prerequisito visibile** sotto forma di etichetta
  laterale (es. *"Richiede Spada lunga"*, *"Solo con Ombra nel seguito"*).
- Altri hanno **check nascosti opachi**: nessuna percentuale mostrata.
  Il giocatore non sa se ce la farà, scopre l'esito.
- Conseguenze immediate: stato, reputazione, oggetti, news generate,
  passaggio di Passi.
- Respiro: breve, denso, decisionale.

### 3. Tattico — Pre-combattimento

**Attivata solo se:**
- Il cavaliere ha **avvistato il nemico in anticipo** (esplorazione, terreno,
  compagno Ombra che individua minacce), oppure
- Il cavaliere **decide volontariamente** di attaccare un bersaglio.

In tutti gli altri casi (imboscata subita, scontro inevitabile), si salta
direttamente a modalità 4.

Pannello di **approccio**:
- *Assalto frontale* — bonus attacco iniziale, penalità difesa
- *Agguato* — richiede terreno favorevole o Ombra nel seguito; primo round gratis
- *Negoziazione* — può evitare lo scontro, richiede Onore alto o Conoscitore
- *Fuga preventiva* — consuma Passi, possibile inseguimento

Include scelte di schieramento dei compagni (es. chi tiene la linea, chi
manovra) e uso di consumabili (pozioni, talismani) prima del combattimento.

Respiro: concentrato. Poche scelte ma con peso.

### 4. Drammatico — Combattimento

- Risoluzione **automatica a round** (vedi `docs/COMBAT.md`).
- Log dettagliato + barre HP.
- Una sola micro-decisione tra un round e l'altro: **continuare /
  tentare la fuga / arrendersi**.
- Il giocatore *osserva* il risultato delle decisioni precedenti
  (equipaggiamento, alleanze, approccio, seguito).
- Respiro: tensione osservativa.

### 5. Contemplativo — Carta del cronista stanziale

Castello, taverna, monastero, accampamento, dungeon → appare una
**Carta del cronista stanziale** che riempie l'area mappa.

- **NIENTE vista 2D laterale point&click.**
- Si interagisce **per scelta**, non per click su elementi visivi.
- Pulsanti tematici contestuali, generati in base a: chi è presente, ora,
  stagione, reputazione locale, news note, seguito al fianco.
- L'esplorazione spaziale è **assorbita** dai pulsanti di scoperta:
  *"Osserva la sala"*, *"Cerca nei dintorni"*, *"Chiedi notizie"* fanno
  pescaggi pesati su **tabelle di scoperta** (oggetti, persone, eventi).
- La varietà nasce dalla **casualità contestualizzata**, non dalla
  navigabilità della scena.
- Ogni interazione consuma Passi.
- Respiro: lento, esplorativo per scelta.

## Le quattro decisioni chiave (riferimento)

Per riferimento storico, le decisioni di design fondative:

| Domanda | Risposta |
|---|---|
| Granularità viaggio | Passo singolo, scorrimento live, pausa automatica su eventi/luoghi |
| Opzioni di scelta | Pulsanti tematici (non numerate) |
| Test su attributi | Opachi, niente percentuali esplicite |
| Modalità tattica | Solo se nemico avvistato o attacco volontario |
| Scene di luogo | Carta del cronista (no point&click), esplorazione via scoperte |

## Transizioni e ritmo

Il gioco crea ritmo alternando le modalità:
```
Calmo (viaggio) → Sospeso (evento) → Calmo → Contemplativo (luogo)
              → Sospeso (interazione) → Calmo (riparte) → Tattico (avvisto nemico)
              → Drammatico (combat) → Calmo (riprendi)
```

Mai un'ora nella stessa modalità. La transizione è il piacere.

## TBD

- [ ] Schema dati `GameMode` e transizioni
- [ ] Soglia "luogo particolare" che causa pausa automatica
- [ ] Catalogo iniziale pulsanti tematici per modalità sospesa
- [ ] Granularità della pausa (istantanea vs animata)
- [ ] Bilanciamento frequenza eventi (modulato da terreno, fazione, stagione)
- [ ] Comportamento dell'UI in transizione (animazione carta che appare/scompare)
- [ ] Salvataggio dello stato di modalità nel save
