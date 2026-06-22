# FERRO & CENERE — Guida Interfaccia

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

## 6. Vista dettaglio (laterale 2D)

[TBD] Quando il cavaliere entra in un luogo speciale:
- La mappa viene sostituita dalla scena laterale 2D
- L'HUD inferiore resta visibile ma il pannello centrale cambia contesto
- Pulsanti: [PARLA] [ESAMINA] [COMMERCIA] [ESCI]

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
