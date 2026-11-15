# Divisio

Contabilità parrocchiale semplice, in italiano, pensata per chi non è esperto di contabilità.
Copre la parte "Amministrazione" di UNIO e prepara i dati per il Rendiconto Parrocchiale della Diocesi di Firenze.

**Stato:**
- Fase 1 – registro dei movimenti (entrate/uscite e partita doppia), saldi di apertura, copia di sicurezza, esportazione CSV.
- Fase 2 – Rendiconto Parrocchiale completo (gestione, patrimoniale, collette, contributo, previsione, analitico), stampa/PDF, CSV nel formato UNIO e confronto voce per voce con il CSV esportato da UNIO.
- Fase 3 – ponte verso UNIO: per ogni cassa/banca e trimestre un file riepilogativo (una riga per sottoconto, codice all'inizio della descrizione) nel formato dell'"Importazione Prima Nota" di UNIO, foglio guida stampabile, registro delle importazioni e, dopo, solo le differenze; promemoria in Inizio.
- Condivisione – più persone (Mac e Windows) lavorano insieme tramite una cartella "Divisio" nel Google Drive della parrocchia (Google Drive per desktop): ogni computer scrive il proprio file `divisio-<computer>.json` e legge quelli degli altri; per ogni record vince la modifica più recente. Richiede Chrome o Edge.

## Principi
- I dati della parrocchia restano **sul computer** (nel browser) e, se attivata la condivisione, nella cartella del Google Drive della parrocchia. Nessun server, nessun altro invio su internet.
- Ogni movimento è salvato in **partita doppia**: Dare = Avere sempre.
- **Nessun dato reale** in questo repository: solo dati inventati per esempi e test.
- Nessuna libreria esterna e nessuna installazione: HTML, CSS e JavaScript puri.

## Struttura
| Cartella | Contenuto |
|---|---|
| `js/dominio/` | regole contabili, senza interfaccia: importi, piano dei conti, scritture, saldi, Rendiconto, formato UNIO, copia di sicurezza, CSV, unione dei dati tra computer |
| `js/dati/` | salvataggio nel browser (IndexedDB) e condivisione tramite cartella |
| `js/ui/` | le pagine: Inizio, Registra, Movimenti, Rendiconto, Per UNIO, Impostazioni |
| `tests/` | test automatici |
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

## Nuova versione
Cambiare `VERSIONE` in `js/app.js` e in `sw.js`, e aggiungere a `sw.js` eventuali nuovi file.
