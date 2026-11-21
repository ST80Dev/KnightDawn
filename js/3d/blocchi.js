// Knight Dawn — blocco che segue il cavaliere (M7, passo 9; piano in docs/ESPLORAZIONE_3D.md).
// Il mondo generato si disegna a blocchi di 2×2 km centrati sulla griglia del mondo (centroBlocco); quando il cavaliere
// si avvicina al bordo si prepara il blocco centrato su di lui e lo si sostituisce: il bordo vero non si raggiunge mai.
//
// Tappa 1 (questa): la decisione e lo spostamento dello stato (cavaliere, cavallo, camera) dal vecchio al nuovo centro;
// il blocco si ricarica tutto in una volta (pausa breve, misurata in F3). Tappa 2: la preparazione a pezzi in
// sottofondo e il cambio in un solo fotogramma (note della sessione M1 nel piano).

export const BLOCCHI = {
  soglia: 350,        // m dal bordo del blocco entro cui si cambia blocco (il blocco è largo 2000 m)
};

/** true se il punto locale (x, z) del blocco di semilato `half` è a meno di BLOCCHI.soglia m dal bordo. */
export function vicinoAlBordo(x, z, half, soglia = BLOCCHI.soglia) {
  return Math.max(Math.abs(x), Math.abs(z)) > half - soglia;
}

/**
 * Sposta lo stato da un blocco al successivo: (dx, dz) = vecchio centro − nuovo centro (m). `oggetti`: stati con x, z
 * (cavaliere, cavallo, punto di partenza della fatica…); `posizioni`: Vector3 di three.js (camera).
 */
export function trasla(dx, dz, oggetti = [], posizioni = []) {
  for (const o of oggetti) if (o) { o.x += dx; o.z += dz; }
  for (const p of posizioni) if (p) { p.x += dx; p.z += dz; }
}
