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

/** Riga per riga: i pezzi di testo alla stessa altezza vengono uniti, da sinistra a destra. */
function righeDellaPagina(items) {
  const perAltezza = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const y = it.transform[5], x = it.transform[4];
    let riga = perAltezza.find((r) => Math.abs(r.y - y) < Math.max(2, (it.height || 8) * 0.4));
    if (!riga) { riga = { y, pezzi: [] }; perAltezza.push(riga); }
    riga.pezzi.push({ x, s: it.str });
  }
  return perAltezza.sort((a, b) => b.y - a.y).map((r) => r.pezzi.sort((a, b) => a.x - b.x).map((q) => q.s).join(" "));
}

/**
 * Restituisce { testo, immagini }: il testo delle prime pagine (una riga per riga visiva)
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
      righe.push(...righeDellaPagina((await pagina.getTextContent()).items));
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
  return { testo: righe.join("\n"), immagini };
}
