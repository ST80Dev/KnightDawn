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

---

## 7. Implementazione corrente (Fase 1) — `js/world.js`

Primo passo, vanilla e senza dipendenze. Esposto come oggetto globale `World`.

- **Noise:** value-noise con hash interi + interpolazione bilineare smoothstep,
  sommato in fBm (5 ottave per l'elevazione, 4 per l'umidità). Seedabile.
- **Elevazione:** noise + **bias radiale "continente"** (centro alto, bordi
  mare) + **noise ridged** che genera **catene montuose** (creste lineari, non
  blob), più forti verso l'interno; poi **normalizzazione min/max** per
  sfruttare tutto l'intervallo. Le montagne risultano in catene fiancheggiate
  da colline, con foreste/pianure interposte.
- **Bordi:** oltre i confini del mondo il renderer disegna mare aperto, quindi
  il continente è circondato da oceano (confine naturale "invalicabile").
- **Biomi** (da elevazione `en` + umidità `mn`, entrambe normalizzate `[0,1]`):
  acqua `<0.34`, montagna `>0.82`, collina `>0.66`, palude (bassa+umida),
  foresta (umida), sabbia (secca), altrimenti pianura.
  Distribuzione tipica verificata: acqua ~10-30%, pianura ~30%, foresta/collina
  variabili, montagna ~3-12%.
- **Strutture:** 5 castelli (su collina/pianura, distanza ≥22) e 12 villaggi
  (pianura/foresta, preferibilmente vicino all'acqua, distanza ≥8), con nomi.
- **Partenza cavaliere:** accanto al primo castello (fallback: tile di terra
  più vicino al centro).
- **Dimensioni:** `WORLD_W × WORLD_H` (160×120) in `config.js`.

Non ancora implementati (passi successivi): fiumi, strade (A*), fazioni,
regioni nominate, fog of war, vincoli di connettività.
