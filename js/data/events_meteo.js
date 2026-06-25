// Knight Dawn — Catalogo eventi meteo straordinari
// Eventi di viaggio pesati basso, con cooldown alto, coerenti per
// bioma/latitudine. Quando scattano possono sovrascrivere lo stato meteo
// ambientale per la loro durata (vedi docs/EVENTS.md → Sistema meteo).
//
// Target catalogo iniziale: 6–10 voci (tempesta sabbia, bufera neve,
// temporale violento, venti gelidi, siccità, nebbia fitta, grandine,
// aurora). Da popolare quando si implementa weather.js.
//
// Schema atteso:
//   { id, kind:'meteo', where:{ biomes:[...], lat:'nord'|'sud'|'centro' },
//     durataPassi: N, statoForzato:'pioggia'|'neve'|... ,
//     options:[...] }
