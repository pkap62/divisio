# Divisio

Contabilità parrocchiale semplice, in italiano, pensata per chi non è esperto di contabilità.
Copre la parte "Amministrazione" di UNIO e prepara i dati per il Rendiconto Parrocchiale della Diocesi di Firenze.

> **Software sperimentale.** Divisio è offerto così com'è, senza garanzie: controllare sempre movimenti, totali e Rendiconto prima di usarli.
> L'autore non si assume responsabilità per eventuali errori.

## Novità
**0.9 – PDF letti meglio e ricordati; Prima Nota di UNIO; azzeramenti**
- Fatture **PDF**: il lettore usa anche la posizione delle parole sulla pagina (valori scritti sotto l'etichetta, in tabella), controlla gli importi tra loro
  (imponibile + IVA = totale, con l'aliquota), riconosce numero e data della fattura senza confonderli con proforma, documenti commerciali o R.E.A.,
  il nome del fornitore sopra la sua partita IVA o come beneficiario del bonifico allegato, le scadenze al plurale e le parole con le legature perse ("Partta IVA").
- **Memoria per fornitore** (impostazioni `modello-pdf:…`): quando si aggiunge una fattura PDF Divisio ricorda nome, partita IVA e la posizione di numero, date e importi,
  con le correzioni dell'utente; la volta dopo riconosce il fornitore da partita IVA, IBAN, e-mail o sito (un identificativo comune a più fornitori non conta)
  e legge i dati da lì. Elenco in «Fornitori ricordati», con «Dimentica».
- Scritta **PAGATA / PAGATO con la data** sul PDF: dopo l'aggiunta Divisio apre «Segna come pagata» con quella data (una fattura dopo l'altra, sempre con conferma).
- Caricamento da UNIO anche del file **AMM_PRIMA_NOTA** (colonne «Codice gruppo/conto/sottoconto», causale, più esercizi). Non si caricano i doppioni:
  riepiloghi arrivati in UNIO dalla pagina Per UNIO se in Divisio ci sono già i movimenti di quella cassa e trimestre, pagamenti di fatture già pagate in Divisio.
- **Azzera i movimenti** dell'anno (pagina Movimenti, con copia di sicurezza automatica; le fatture pagate con quei movimenti tornano da pagare),
  **Azzera il confronto** con UNIO (pagina Rendiconto) e **Azzera le importazioni segnate** dell'anno (pagina Per UNIO).

**0.8.1** – Guida e Impostazioni: scorciatoia in "Il mio Drive" per i collaboratori.

**0.8 – Nuovo logo; fatture del teatro o di altre gestioni**
- Nuovo logo (icona dell'app, del browser e della Guida).
- Funzione facoltativa, **spenta per tutti all'inizio** (Impostazioni → «Fatture del teatro o di altre gestioni»). Se accesa, per ogni fattura si sceglie fra tre possibilità: **della parrocchia** (entra in contabilità per intero), **del teatro o di altra gestione** (non entra in contabilità e resta da parte, nell'elenco «Teatro e altre gestioni»), **al 50%** (il totale con l'IVA si divide a metà e in contabilità entra una metà).
- La scelta si fa quando si caricano le fatture e si ricontrolla quando si segnano pagate; Divisio la ricorda per ogni fornitore e la propone la volta dopo, ma va sempre confermata (riepilogo prima di aggiungere) e si può cambiare nei «Dettagli» della fattura.
- Anche nella pagina Banca: al 50% si registra metà dell'uscita, quelle di altra gestione non si registrano (il riepilogo indica di quanto il saldo di Divisio differisce da quello della banca).
- Prima di questa versione la parte del teatro andava sul conto «Gestione teatro» (P02-05-04): i pagamenti già registrati così restano com'erano.

**0.7.2** – Scadenzario: tornati i colori di prima (fatture scadute in rosso, entro 7 giorni in arancione).

**0.7 – Estratti conto della banca**
- Nuova pagina **Banca**: si carica l'elenco dei movimenti scaricato dalla banca online. Formati: CSV (separatore `;` `,` tabulazione, UTF-8 o Windows-1252), tabelle HTML salvate come `.xls`, Excel `.xlsx` (letto senza librerie). Colonne riconosciute dai titoli usati dalle banche italiane (data, valuta, importo con segno o addebiti/accrediti, segno D/A, descrizione, causale, categoria, saldo), righe di intestazione e di saldo saltate; se i titoli mancano le colonne si indovinano dai dati e si possono correggere a mano. L'abbinamento viene ricordato per i file successivi con le stesse colonne.
- Per ogni movimento Divisio ricava il nome di chi paga o riceve e la causale (bonifici, disposizioni, addebiti diretti SDD con il loro mandato, POS) e propone tipo e voce: scelta ricordata per quel nome e quella causale, fornitore conosciuto dalle fatture, parole della descrizione. Le scelte si propagano agli altri movimenti dello stesso nome e vengono ricordate.
- Riconosce i pagamenti delle fatture dello scadenzario (le segna pagate insieme all'uscita), i versamenti di contanti (spostamento dalla Cassa) e i movimenti già presenti in Divisio (stessa riga già caricata, oppure stesso importo sulla stessa banca con date vicine).
- Niente entra in contabilità senza conferma; riepilogo con il saldo della banca dopo la registrazione; ogni importazione si può togliere per intero.

**0.6.3** – I collaboratori possono usare il **proprio account Google**: il parroco condivide con loro solo la cartella Divisio, senza dare la password della parrocchia (Guida, capitoli 5 e 6). Il numero di versione compare in alto nell'app e nell'intestazione della Guida.

**0.6.2** – Nel piano dei conti di partenza c'è solo la **Cassa** (A02-01-01): non ci sono più «Banca» e «PayPal» già pronti. Ogni banca aggiunta in Impostazioni → Cassa e banche prende il primo numero libero (A02-01-02, poi 03…). Nei dati già esistenti «Banca» e «PayPal» si tolgono da soli se non sono mai stati rinominati, messi in uso o usati in un movimento.

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
- Fase 5 (in corso) – anno di prova: caricamento dei movimenti già registrati in UNIO (file "AMM_PRIMA_NOTA" oppure "AMM_ESTRATTOCONTO" con tutti i conti) con anteprima, nomi dei sottoconti di UNIO, nessun doppione e annullamento; poi confronto del Rendiconto con il CSV dei saldi di UNIO.
- Fase 4 – fatture ricevute e scadenzario (versione 0.6, vedi Novità).
- Estratti conto della banca (versione 0.7, vedi Novità).
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

