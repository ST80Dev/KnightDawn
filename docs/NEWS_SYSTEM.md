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

## TBD

- [ ] Tabella velocità di propagazione per terreno
- [ ] Catalogo varianti rumor per tipo di evento
- [ ] Specifica rete corvi (fazioni, nodi alleati)
- [ ] Algoritmo di selezione versione (vera/rumor) al canale di lettura
- [ ] Persistenza e decadimento delle news vecchie
- [ ] Integrazione con **Volieria** (struttura di covo, §3 *Compagnia e covi*)
