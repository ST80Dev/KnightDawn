# Knight Dawn — Guida Interfaccia

> Documento da definire nella Fase 3. Scheletro iniziale.

---

## 1. Layout generale

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    MAPPA CARTOGRAFICA                        │
│                    (vista top-down)                          │
│                    ~70% altezza                              │
│                                                              │
│                                                              │
├──────────┬──────────────────────────────┬────────────────────┤
│ STATO    │ LOG EVENTI + AZIONI          │ MINIMAPPA          │
│ CAVALIERE│                              │ REGIONALE          │
│ ~25%     │ ~50%                         │ ~25%               │
│          │                              │                    │
│ Attributi│ Narrazione turno per turno   │ Mappa piccola      │
│ Barre    │ Pulsanti contestuali         │ con fog of war     │
│ Equip    │ [INVENTARIO] [MAPPA] [CAMP]  │ e posizione        │
│ Reputa.  │ Info destinazione/stagione   │                    │
└──────────┴──────────────────────────────┴────────────────────┘
```

## 2. Mappa cartografica (pannello principale)

- Occupa la parte superiore dello schermo
- Sfondo pergamena con tile cartografici
- Zoom con rotella mouse (4 livelli discreti)
- Scroll con mouse drag o WASD
- Click su tile per selezionare destinazione → calcolo percorso → viaggio

## 3. Pannello sinistro — Stato cavaliere

[TBD] Contenuto:
- Nome e titolo
- Barre: Vigore, Volontà, Onore, Ferite
- Equipaggiamento (lista compatta)
- Reputazione fazioni (stelline o barre)

## 4. Pannello centrale — Log eventi e azioni

[TBD] Contenuto:
- Log scrollabile degli eventi recenti (stile terminale)
- Colore testo in base all'importanza (dal più brillante al più spento)
- Pulsanti azione contestuali: [INVENTARIO] [MAPPA MONDO] [ACCAMPA] [INTERAGISCI]
- Info turno corrente, stagione, destinazione

## 5. Pannello destro — Minimappa

[TBD] Contenuto:
- Versione ridotta della mappa regionale
- Mostra fog of war
- Posizione cavaliere come punto luminoso
- Strutture note come piccoli simboli

## 6. Carta del cronista (luoghi ed eventi)

Quando il cavaliere entra in un luogo speciale o scatta un evento di viaggio,
appare una **Carta del cronista** sopra/al posto della mappa.

- **Carta stanziale** (luoghi): occupa l'area mappa, la cartografia si oscura
  dietro. Il cavaliere "resta" in quel luogo finché non sceglie di uscire.
- **Carta mobile** (eventi di viaggio): pop-up centrale più piccolo,
  scompare dopo la scelta, il viaggio riprende.

**Composizione:**
- Cornice ornata in stile manoscritto miniato
- Miniatura statica in alto (tipo di scena, non specifica del luogo)
- Pannello narrativo testuale sotto, generato dal contesto
- Pulsanti tematici contestuali (azioni e NPC presenti)
- L'HUD inferiore resta visibile

Esempi di pulsanti contestuali: *"Parla con l'oste"*, *"Osserva la sala"*,
*"Chiedi notizie"*, *"Cerca lavoro"*, *"Esci"*. La pressione di un pulsante
di esplorazione fa un pescaggio pesato su una **tabella di scoperta**
(vedi `docs/TEXT_SYSTEM.md`).

[TBD] Estetica dettagliata cornice e font per la carta → `docs/GRAFICA.md`
[TBD] Layout responsivo carta mobile vs stanziale

## 7. Schermate speciali

[TBD]
- Schermata titolo / menu principale
- Schermata scelta arco (Missione / Sandbox / Campagna)
- Schermata inventario (full screen o overlay)
- Schermata mappa mondo (zoom massimo, overview)
- Schermata combattimento
- Schermata game over

## 8. Font

- **Monospace:** per dati numerici, log, coordinate, sistema
- **Serif (Georgia o simile):** per nomi luoghi sulla mappa, testo narrativo
- **Dimensioni:** definire scala tipografica per i vari contesti

## 9. Responsive

[TBD] Il gioco è progettato per desktop.
Supporto mobile opzionale in futuro (touch, layout verticale?).
