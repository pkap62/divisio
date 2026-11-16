# Divisio

Contabilità parrocchiale semplice, in italiano, pensata per chi non è esperto di contabilità.
Copre la parte "Amministrazione" di UNIO e prepara i dati per il Rendiconto Parrocchiale della Diocesi di Firenze.

> **Software sperimentale.** Divisio è offerto così com'è, senza garanzie: controllare sempre movimenti, totali e Rendiconto prima di usarli.
> L'autore non si assume responsabilità per eventuali errori.

## Novità
**0.6.1** – Cassa e banche compaiono nell'ordine in cui sono state aggiunte (la cassa sempre per prima): PayPal non si mette più al secondo posto.

**0.6 – Fatture e scadenze**
- Nuova pagina **Fatture**: si caricano le fatture ricevute, anche molte insieme (trascinandole o scegliendole): XML FatturaPA, anche firmati `.p7m`, e PDF.
- Dagli XML si leggono fornitore, partita IVA, numero, data, imponibile, IVA, totale, rate con scadenza e modalità di pagamento. Dai PDF con testo gli stessi dati,
  con i campi incerti evidenziati da controllare accanto all'immagine del PDF; i PDF scansionati si compilano a mano.
- Doppioni (stesso fornitore, numero e data) segnalati e non caricati.
- **Scadenzario**: rate da pagare in ordine di scadenza, scadute ed entro 7 giorni, totali; promemoria in Inizio.
- In contabilità entra **solo una fattura pagata**, dopo la conferma: Divisio propone la voce di spesa (scelta ricordata per il fornitore, storico, parole della fattura)
  e la ricorda. "Torna da pagare" toglie l'uscita collegata; scadenzario e contabilità vengono controllati a vicenda.
- Facoltativo, spento all'inizio: divisione delle spese tra parrocchia e attività commerciale (teatro) in percentuale.
- Copia di sicurezza in formato 2 (con le fatture); le copie precedenti si leggono ancora. Avvertenza "software sperimentale" in Inizio.
- Logica di lettura ripresa dal progetto "Scadenzario-fatture"; i PDF si leggono con [pdf.js](https://mozilla.github.io/pdf.js/) di Mozilla (Apache 2.0), copiato in `js/lib/pdfjs/`, che lavora sul computer.


**Stato:**
- Fase 1 – registro dei movimenti (entrate/uscite e partita doppia), saldi di apertura, copia di sicurezza, esportazione CSV.
- Fase 2 – Rendiconto Parrocchiale completo (gestione, patrimoniale, collette, contributo, previsione, analitico), stampa/PDF, CSV nel formato UNIO e confronto voce per voce con il CSV esportato da UNIO.
- Fase 3 – ponte verso UNIO: per ogni cassa/banca e trimestre un file riepilogativo (una riga per sottoconto, codice all'inizio della descrizione) nel formato dell'"Importazione Prima Nota" di UNIO, foglio guida stampabile, registro delle importazioni e, dopo, solo le differenze; promemoria in Inizio.
- Fase 5 (in corso) – anno di prova: caricamento dei movimenti già registrati in UNIO (file "AMM_ESTRATTOCONTO", tutti i conti) con anteprima, nomi dei sottoconti di UNIO, nessun doppione e annullamento; poi confronto del Rendiconto con il CSV dei saldi di UNIO.
- Fase 4 – fatture ricevute e scadenzario (versione 0.6, vedi Novità).
- Condivisione – più persone (Mac e Windows) lavorano insieme tramite una cartella "Divisio" nel Google Drive della parrocchia (Google Drive per desktop): ogni computer scrive il proprio file `divisio-<computer>.json` e legge quelli degli altri; per ogni record vince la modifica più recente. Richiede Chrome o Edge.

## Usarlo
Guida completa (anche da stampare): <https://pkap62.github.io/divisio/guida.html>

Aprire **<https://pkap62.github.io/divisio/>** con Google Chrome o Microsoft Edge (Mac o Windows) e,
dal menu del browser, scegliere **"Installa Divisio"**: comparirà come un'app sul computer e funzionerà anche senza internet.
Il sito contiene solo il programma: i dati della parrocchia restano sul computer (e, se attivata, nella cartella condivisa di Google Drive).

## Pubblicare una nuova versione
1. Cambiare `VERSIONE` in `js/versione.js` e in `sw.js` (e aggiungere a `sw.js` eventuali nuovi file) e scrivere le novità qui sopra.
2. Far girare i test (`./tests/esegui.sh`).
3. `git push`: GitHub Pages pubblica in automatico in circa un minuto; i computer ricevono l'aggiornamento alla riapertura.

## Principi
- I dati della parrocchia restano **sul computer** (nel browser) e, se attivata la condivisione, nella cartella del Google Drive della parrocchia. Nessun server, nessun altro invio su internet.
- Ogni movimento è salvato in **partita doppia**: Dare = Avere sempre.
- **Nessun dato reale** in questo repository: solo dati inventati per esempi e test.
- Nessuna installazione: HTML, CSS e JavaScript puri. Unica eccezione, scelta per affidabilità: il lettore PDF di Mozilla (pdf.js), copiato nel progetto e usato senza internet.

## Struttura
| Cartella | Contenuto |
|---|---|
| `js/dominio/` | regole contabili, senza interfaccia: importi, piano dei conti, scritture, saldi, Rendiconto, formato UNIO, copia di sicurezza, CSV, unione dei dati tra computer, lettura delle fatture (XML/P7M e testo dei PDF), scadenzario, proposta della voce |
| `js/dati/` | salvataggio nel browser (IndexedDB), condivisione tramite cartella, lettura dei PDF |
| `js/ui/` | le pagine: Inizio, Registra, Movimenti, Fatture, Rendiconto, Per UNIO, Impostazioni |
| `js/lib/pdfjs/` | lettore PDF di Mozilla (pdf.js 4.10.38, licenza Apache 2.0) |
| `tests/` | test automatici; in `tests/esempi/` fatture di prova inventate (XML e PDF) per provare la pagina Fatture |
| `docs/` | specifiche, struttura del Rendiconto, piano dei conti di esempio |
| `prototipo/` | prototipo cliccabile della Fase 0 |

## Provarlo sul proprio computer
Serve un piccolo server locale (Python è già presente sul Mac):
```bash
python3 -m http.server 8765 --bind 127.0.0.1
```
poi aprire <http://localhost:8765> con Chrome o Edge. Aggiungendo `?app` all'indirizzo si attiva anche il funzionamento senza internet.

## Test
Dal Terminale del Mac (usa il motore JavaScript già presente, nessuna installazione):
```bash
./tests/esegui.sh
```
oppure, con il server acceso, aprire <http://localhost:8765/tests/>.

