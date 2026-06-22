# FERRO & CENERE — Generazione Mondo

> Documento da definire nella Fase 2. Scheletro iniziale.

---

## 1. Principi

- Mondo grande, esplorabile, con nebbia di guerra
- Generato casualmente a ogni partita **entro vincoli** (non puro random)
- Deve risultare credibile: fiumi che scendono da montagne, villaggi vicino all'acqua,
  castelli su alture, foreste in aree fertili
- Ogni partita è unica ma tutte le partite hanno un mondo "giocabile"

## 2. Dimensioni mondo

[TBD] Definire griglia — proposta: 200×200 tile per il mondo completo

## 3. Algoritmo di generazione

[TBD] Probabile approccio:
1. Simplex Noise per elevazione base
2. Noise secondario per umidità/temperatura
3. Biomi assegnati in base a elevazione + umidità
4. Piazzamento strutture con vincoli (distanza minima, bioma compatibile)
5. Generazione fiumi (discesa da montagne verso pianure/mare)
6. Generazione strade (connessione strutture con A*)
7. Assegnazione fazioni ai castelli e territori

## 4. Vincoli di validità

[TBD] Ogni mondo generato deve avere:
- Almeno N castelli (uno per casata)
- Almeno M villaggi distribuiti
- Almeno 1 porto (se c'è costa)
- Almeno 2 dungeon/rovine
- Connessione percorribile tra tutti i castelli
- Varietà di biomi (non può essere tutto foresta)

## 5. Zone e regioni

[TBD] Il mondo è diviso in regioni nominate.
Ogni regione ha un carattere (nordica, paludosa, desertica, costiera…)
e fazioni dominanti.

## 6. Semi e riproducibilità

[TBD] Il seed del mondo è un numero che il giocatore può condividere
per giocare lo stesso mondo.
