// Lettura dei PDF sul computer con il lettore PDF di Mozilla (js/lib/pdfjs, vedi LEGGIMI.txt).
// Nessun invio su internet. Il lettore si carica solo la prima volta che serve.

let lettore = null;

async function caricaLettore() {
  if (!lettore) {
    lettore = import("../lib/pdfjs/pdf.min.js").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("../lib/pdfjs/pdf.worker.min.js", import.meta.url).href;
      return pdfjs;
    });
  }
  return lettore;
}

/**
 * Riga per riga: i pezzi di testo alla stessa altezza vengono uniti, da sinistra a destra.
 * Ogni riga ha anche le singole parole con la loro posizione sulla pagina (x da sinistra, y dall'alto,
 * in frazioni della pagina: 0 = bordo sinistro/alto, 1 = bordo destro/basso), per leggere i valori
 * scritti SOTTO un'etichetta (tabelle) e per ricordare dove un fornitore scrive i suoi dati.
 */
function righeDellaPagina(items, vista, p) {
  const perAltezza = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const [x, y] = vista.convertToViewportPoint(it.transform[4], it.transform[5]);
    const [x2] = vista.convertToViewportPoint(it.transform[4] + (it.width || 0), it.transform[5]);
    const alto = Math.max(2, (it.height || 8) * 0.4);
    let riga = perAltezza.find((r) => Math.abs(r.y - y) < alto);
    if (!riga) { riga = { y, pezzi: [] }; perAltezza.push(riga); }
    riga.pezzi.push({ x: Math.min(x, x2), x2: Math.max(x, x2), s: it.str });
  }
  const W = vista.width, H = vista.height;
  return perAltezza.sort((a, b) => a.y - b.y).map((r) => {
    const pezzi = r.pezzi.sort((a, b) => a.x - b.x);
    // parole con la posizione stimata in proporzione ai caratteri del pezzo
    const parole = pezzi.flatMap((q) => {
      const largo = (q.x2 - q.x) / Math.max(1, q.s.length);
      return [...q.s.matchAll(/\S+/g)].map((m) => ({ s: m[0], x: (q.x + m.index * largo) / W, x2: (q.x + (m.index + m[0].length) * largo) / W }));
    });
    return { p, y: r.y / H, testo: pezzi.map((q) => q.s).join(" "), parole };
  });
}

/**
 * Restituisce { testo, righe, immagini }: il testo delle prime pagine (una riga per riga visiva), le stesse righe con
 * la posizione delle parole
 * e l'immagine delle prime pagine, da mostrare accanto ai campi da controllare.
 * Le immagini si disegnano con lo stesso lettore, così si vedono in qualunque browser.
 */
export async function leggiPDF(buffer, { maxPagine = 4, maxImmagini = 2, larghezza = 1000 } = {}) {
  const pdfjs = await caricaLettore();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false,
    standardFontDataUrl: new URL("../lib/pdfjs/standard_fonts/", import.meta.url).href }).promise;
  const righe = [], immagini = [];
  let disegna = true;
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPagine); p++) {
      const pagina = await doc.getPage(p);
      righe.push(...righeDellaPagina((await pagina.getTextContent()).items, pagina.getViewport({ scale: 1 }), p));
      if (p <= maxImmagini && disegna) {
        try {
          const base = pagina.getViewport({ scale: 1 });
          const vista = pagina.getViewport({ scale: larghezza / base.width });
          const tela = document.createElement("canvas");
          tela.width = Math.round(vista.width); tela.height = Math.round(vista.height);
          // intent "print": disegna tutto subito, anche se la finestra non è in primo piano.
          // Per sicurezza, dopo qualche secondo si rinuncia all'immagine (resta il collegamento per aprire il PDF).
          const compito = pagina.render({ canvasContext: tela.getContext("2d"), viewport: vista, intent: "print" });
          let timer;
          const fatto = await Promise.race([compito.promise.then(() => true, () => false), new Promise((ok) => { timer = setTimeout(() => ok(false), 6000); })]);
          clearTimeout(timer);
          if (!fatto) { compito.cancel(); disegna = false; continue; }
          immagini.push(tela.toDataURL("image/jpeg", 0.85));
        } catch (e) { console.warn("Pagina del PDF non disegnata", e); }
      }
    }
  } finally {
    doc.destroy();
  }
  return { testo: righe.map((r) => r.testo).join("\n"), righe, immagini };
}
