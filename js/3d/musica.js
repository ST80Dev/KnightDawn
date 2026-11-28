// Knight Dawn — musica di sottofondo (deciso con l'utente, 28/11/2026: ambientale, lieve, in loop, senza effetti).
// Brani in assets/audio/ (licenze e crediti in assets/audio/README.md). Tre gruppi: giorno, notte, borgo (dentro le
// mura). Due elementi <audio> per la dissolvenza; un brano alla volta, con una pausa di silenzio tra un brano e
// l'altro. Parte al primo gesto dell'utente (i browser bloccano l'audio prima), si ferma con la scheda nascosta,
// U accende e spegne (ricordato nel browser). Nessun costo per fotogramma: `aggiorna` lavora al più una volta al secondo.

const CARTELLA = 'assets/audio/';
// [file, ripetizioni]: i brani brevi nati per il loop si ripetono qualche volta prima di passare al successivo.
const BRANI = {
  giorno: [['giorno-racconto-del-bardo.mp3', 3], ['giorno-teller-of-the-tales.mp3', 1],
    ['giorno-suonatore-di-liuto.mp3', 1], ['giorno-esplorazione.mp3', 1]],
  notte: [['notte-midnight-tale.mp3', 1], ['notte-heavy-heart.mp3', 1]],
  borgo: [['borgo-old-tower-inn.mp3', 3], ['borgo-market-day.mp3', 2]],
};
export const MUSICA = {
  volume: 0.32,          // lieve: sottofondo, non primo piano
  dissolvenza: 3,        // s
  pausaTraBrani: 18,     // s di silenzio tra un brano e il successivo dello stesso gruppo
  stabile: 6,            // s: il gruppo cambia solo se la condizione dura (niente sbalzi sul limite delle mura)
};

export function creaMusica() {
  let muto = false;
  try { muto = localStorage.getItem('kd.musica.muto') === '1'; } catch { /* niente preferenze */ }
  const voci = [new Audio(), new Audio()];
  voci.forEach((a) => { a.preload = 'auto'; a.volume = 0; });
  let attiva = 0, gruppo = null, indice = { giorno: 0, notte: 0, borgo: 0 }, ripetuti = 0, brano = null;
  let avviata = false, nascosta = false, attesa = 0, voluto = null, dal = 0, tUltimo = 0, sfuma = 0;

  const volumeVoluto = () => (muto || nascosta ? 0 : MUSICA.volume);

  /** Porta il volume di `a` a `v` in `s` secondi (passi da 50 ms; nessun lavoro nel ciclo del gioco). */
  function sfumaA(a, v, s, poi) {
    const da = a.volume, passi = Math.max(1, Math.round(s * 20));
    let k = 0;
    const t = setInterval(() => {
      k++;
      a.volume = Math.min(1, Math.max(0, da + (v - da) * (k / passi)));
      if (k >= passi) { clearInterval(t); poi?.(); }
    }, 50);
    return t;
  }

  function suona(nomeGruppo) {
    const lista = BRANI[nomeGruppo];
    brano = lista[indice[nomeGruppo] % lista.length];
    ripetuti = 0;
    const vecchia = voci[attiva];
    attiva = 1 - attiva;
    const nuova = voci[attiva];
    nuova.src = CARTELLA + brano[0];
    nuova.currentTime = 0;
    nuova.volume = 0;
    nuova.play().catch(() => { /* l'audio non è ancora permesso: riprova al prossimo gesto */ avviata = false; });
    clearInterval(sfuma);
    sfumaA(vecchia, 0, MUSICA.dissolvenza, () => vecchia.pause());
    sfuma = sfumaA(nuova, volumeVoluto(), MUSICA.dissolvenza);
  }

  // Fine di un brano: ripetizione (brani da loop) o pausa e poi il successivo dello stesso gruppo.
  voci.forEach((a, i) => a.addEventListener('ended', () => {
    if (i !== attiva || !brano) return;
    if (++ripetuti < brano[1]) { a.currentTime = 0; a.play().catch(() => {}); return; }
    indice[gruppo] = (indice[gruppo] + 1) % BRANI[gruppo].length;
    clearTimeout(attesa);
    attesa = setTimeout(() => { if (gruppo) suona(gruppo); }, MUSICA.pausaTraBrani * 1000);
  }));

  function avvia() {
    if (avviata) return;
    avviata = true;
    if (gruppo) suona(gruppo);
  }
  // I browser permettono l'audio solo dopo un gesto: il primo clic o tasto (di solito «Comincia» nel menu).
  const gesto = () => avvia();
  document.addEventListener('pointerdown', gesto);
  document.addEventListener('keydown', gesto);

  document.addEventListener('visibilitychange', () => {
    nascosta = document.visibilityState === 'hidden';
    const a = voci[attiva];
    if (nascosta) { a.pause(); return; }
    if (avviata && brano && !muto) { a.volume = volumeVoluto(); a.play().catch(() => {}); }
  });

  return {
    /**
     * Da chiamare a ogni fotogramma: lavora al più una volta al secondo.
     * @param {number} now ms; @param {{ notte: boolean, borgo: boolean }} stato
     */
    aggiorna(now, stato) {
      if (now - tUltimo < 1000) return;
      tUltimo = now;
      const g = stato.borgo ? 'borgo' : stato.notte ? 'notte' : 'giorno';
      if (g !== voluto) { voluto = g; dal = now; }
      if (g === gruppo || now - dal < MUSICA.stabile * 1000) return;
      gruppo = g;
      clearTimeout(attesa);
      if (avviata) suona(gruppo);
    },
    /** U: musica accesa o spenta. Restituisce true se ora è accesa. */
    alterna() {
      muto = !muto;
      try { localStorage.setItem('kd.musica.muto', muto ? '1' : '0'); } catch { /* pazienza */ }
      avvia();
      const a = voci[attiva];
      clearInterval(sfuma);
      if (muto) sfuma = sfumaA(a, 0, 0.6, () => a.pause());
      else if (brano) { a.play().catch(() => {}); sfuma = sfumaA(a, volumeVoluto(), 1); }
      return !muto;
    },
    get muto() { return muto; },
  };
}
