// Service worker: permette a Divisio di aprirsi anche senza internet.
// Contiene SOLO i file del programma, mai i dati della parrocchia.
// A ogni nuova versione cambiare VERSIONE (così i computer scaricano i file aggiornati).

const VERSIONE = "divisio-0.8.1";
const FILE = [
  "./", "index.html", "guida.html", "manifest.webmanifest", "css/divisio.css",
  "icone/icona-32.png", "icone/icona-180.png", "icone/icona-192.png", "icone/icona-512.png",
  "js/app.js", "js/versione.js", "js/dati/db.js", "js/dati/archivio.js", "js/dati/condivisione.js",
  "js/dominio/importi.js", "js/dominio/piano.js", "js/dominio/scritture.js", "js/dominio/saldi.js",
  "js/dominio/backup.js", "js/dominio/csv.js", "js/dominio/unione.js", "js/dominio/rendiconto.js", "js/dominio/unio.js", "js/dominio/ponte.js", "js/dominio/importaUNIO.js",
  "js/dominio/fatture.js", "js/dominio/fatturePDF.js", "js/dominio/scadenzario.js", "js/dominio/suggerimenti.js", "js/dati/pdf.js",
  "js/dominio/estrattoConto.js", "js/dominio/banca.js", "js/dati/xlsx.js",
  "js/lib/pdfjs/pdf.min.js", "js/lib/pdfjs/pdf.worker.min.js",
  "js/ui/util.js", "js/ui/elenco.js", "js/ui/inizio.js", "js/ui/registra.js", "js/ui/movimenti.js", "js/ui/rendiconto.js", "js/ui/unio.js", "js/ui/impostazioni.js", "js/ui/condivisione.js", "js/ui/importa.js", "js/ui/fatture.js", "js/ui/banca.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Prima la rete (versione più aggiornata), se non c'è internet la copia salvata.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSIONE).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
