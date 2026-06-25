// Knight Dawn — Catalogo eventi stagionali
// Una-tantum per Luce (oncePerLuce: true) con prereq stagione corrente.
// Target: 1–2 eventi per stagione = 4–8 totali.
// Esempi: festa del raccolto (autunno), veglia d'inverno, mercato di
// primavera, calura estiva.
//
// Schema atteso:
//   { id, kind:'stagione', oncePerLuce: true,
//     condition: ctx => Calendar.stagione === N,  // 0=Pri 1=Est 2=Aut 3=Inv
//     options:[...] }
