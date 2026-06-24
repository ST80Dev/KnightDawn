# FERRO & CENERE — Sistema di propagazione delle informazioni

> **Stato:** stub. La definizione concettuale è in `docs/GDD.md` §3
> *Propagazione delle informazioni*. Questo documento verrà ampliato
> all'inizio della **Fase S6** della roadmap.

## Scopo

Modellare come le notizie del mondo (eventi puntuali, voci, clima generale)
raggiungono il giocatore e gli altri attori con ritardo, distorsione e
parzialità — coerentemente con un'ambientazione medievale.

## Punti chiave (da espandere)

- **NewsToken**: struttura dati con id, tipo, coordinate origine, turno
  di emissione, payload "verità", varianti rumor.
- **Onde di propagazione**: raggio per Passo modulato dal tipo di terreno.
- **Tre livelli**: voci certe locali, voci distorte (rumor), clima generale.
- **Canali di lettura**: locande, NPC viaggianti, mercati, templi.
- **Override**: corvi messaggeri di fazione, spie/informatori a pagamento,
  poteri narrativi (sogni profetici, reliquie).

## Stato S3 (stub) → S6 (completo)

**S3 — stub minimo già implementato (`js/news.js`):**

API stabile (non cambierà passando a S6):
```js
News.emit(payload, knownNow)
News.sa(tag)
News.saSu(tipo, faction?)
News.ultime(n)
News.propaga(passi)         // no-op in S3
News.rumorAt(x, y, tag)     // no-op in S3
News.toJSON()/fromJSON()
```

Schema NewsToken stabile:
```
{ id, tipo:'voce'|'evento'|'rumor'|'clima', tag, testo, x?, y?, faction?, turno }
```

In S3 `knownNow:true` è il default: la news pubblicata da un evento è
immediatamente nota al cavaliere (sta parlando con la fonte). Niente
propagazione, niente rumor, niente clima generale. Gli eventi possono
già emettere e leggere news con tag — il pattern `news`+`log` doppio
binario è documentato in `docs/EVENTS.md`.

**S6 — implementazione completa:**

- `News.propaga()` avanza le onde a ogni Passo, decide quali token
  diventano noti in quali tile/nodi.
- `News.rumorAt()` ritorna variante distorta nella fascia rumor.
- Canali di lettura: taverne, mercati, NPC viaggianti, corvi.
- Clima generale (granularità grossa, sempre disponibile).
- Decadimento news vecchie → confluiscono in clima generale.
- UI diario news per il giocatore.

## TBD

- [ ] Tabella velocità di propagazione per terreno
- [ ] Catalogo varianti rumor per tipo di evento
- [ ] Specifica rete corvi (fazioni, nodi alleati)
- [ ] Algoritmo di selezione versione (vera/rumor) al canale di lettura
- [ ] Persistenza e decadimento delle news vecchie
- [ ] Integrazione con **Volieria** (struttura di covo, §3 *Compagnia e covi*)
