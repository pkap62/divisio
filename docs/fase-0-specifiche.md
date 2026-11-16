# Divisio – Specifiche (Fase 0)

Documento di riferimento per costruire Divisio. Collegati:
[struttura del Rendiconto](rendiconto-firenze-struttura.md) · [piano dei conti di esempio](piano-dei-conti-esempio.md) ·
prototipo cliccabile in `prototipo/index.html`.

## 1. Scopo e confini
- Copre solo la parte **Amministrazione** di UNIO: registrazione dei movimenti, Rendiconto Parrocchiale, passaggio dei dati a UNIO.
- Il Rendiconto si **invia sempre da UNIO** (Diocesi di Firenze). Divisio prepara i dati e verifica che i totali coincidano.
- Esclusi per ora: anagrafiche, attività commerciali/registri IVA, budget, immobili, più utenti sugli stessi dati.

## 2. Principi
1. **Semplice prima di tutto**: parole di tutti i giorni ("Entrata", "Uscita", "Sposta soldi"), una cosa per schermata.
2. **I conti tornano sempre**: ogni movimento è salvato in partita doppia; un movimento con Dare ≠ Avere non si può salvare.
3. **I dati restano sul computer**: nessun server, nessun servizio esterno senza chiedere.
4. **Niente si perde in silenzio**: eliminazioni sempre confermate; copia di sicurezza su file con promemoria.
5. **La decisione è dell'utente**: l'app propone (voce, dati della fattura), l'utente conferma.

## 3. Piattaforma
PWA "local-first": si apre da un link, si installa come app, funziona anche senza internet.
- **HTML, CSS e JavaScript puri, senza librerie né strumenti da installare** (scelta fatta in Fase 1: sul Mac non c'è Node.js,
  e così il progetto non dipende da codice di terzi ed è più facile da mantenere). Dati nel browser con IndexedDB.
- Test con un piccolo sistema interno, eseguibili dal Terminale con il motore JavaScript del Mac (`tests/esegui.sh`) o nel browser.
- Ogni record porta `modificatoIl` e `autore`; i movimenti eliminati restano come segnaposto: così i dati di più computer
  si possono unire (vince la modifica più recente) – vedi `js/dominio/unione.js`.
- Importi sempre in **centesimi interi** (niente errori di arrotondamento).
- Pubblicazione su hosting statico gratuito (solo il programma, mai i dati).
- Richiesta di "memoria persistente" al browser + promemoria di backup.

## 4. Modello dei dati
| Elemento | Contenuto |
|---|---|
| Parrocchia | nome, codice ICSC, dati anagrafici del Rendiconto, CPAE |
| Esercizio | anno, stato (aperto / chiuso), saldi di apertura |
| Conto | codice `GRUPPO-CONTO-SOTTOCONTO`, nome, tipo (Attività, Passività, Patrimonio, Partite di giro, Entrate, Uscite), "è cassa/banca" |
| Movimento | data, descrizione, tipo (entrata, uscita, spostamento, partita doppia, apertura), righe |
| Riga | conto, dare (centesimi), avere (centesimi) |
| Regola di suggerimento | parola → sottoconto, peso, origine (di base / imparata) |
| Previsione | importo per gruppo (E01…E04, U01…U10) |
| Fattura (facoltativa) | dati estratti + file originale, collegata al movimento |

## 5. Regole contabili
**Entrate/Uscite → partita doppia** (automatico):
- Entrata di X su cassa/banca C → Dare C / Avere X
- Uscita per X da C → Dare X / Avere C
- Sposta soldi da C1 a C2 → Dare C2 / Avere C1
- Colletta imperata (es. Giornata missionaria): raccolta = entrata su `PG1-…` (debito verso la Diocesi), versamento = uscita su `PG1-…`.

**Saldi di apertura**: Dare casse/banche e crediti, Avere debiti e collette non versate; la differenza va in `PAT-01-01` Patrimonio netto.

**Chiusura dell'esercizio**: i saldi patrimoniali passano all'anno nuovo come apertura; l'avanzo/disavanzo si somma al Patrimonio netto. Un esercizio chiuso non si modifica.

**Controlli**: importo > 0; conto di ultimo livello; data dentro l'esercizio; Dare = Avere; avviso se una fattura (fornitore + numero) è già registrata.

## 6. Rendiconto
Calcolato da tutti i movimenti dell'anno, voce = primi due livelli del codice.
- Entrate: Avere − Dare · Uscite e Attività: Dare − Avere · Passività, Patrimonio, Collette: Avere − Dare.
- Avanzo/Disavanzo = Totale entrate − Totale uscite.
- **Quadratura**: Attività = Passività (incl. collette) + Patrimonio + Avanzo.
- Collette: C1 raccolte (Avere dell'anno), C2 versate (Dare dell'anno), C3 non versate dell'anno prima (apertura); da versare = C3 + C1 − C2.
- Contributo diocesano: 3% di (E01 + E03-01 + E04-01 + E04-02) + 10% di (E02-03 + E03-02), arrotondato al centesimo.
- Uscite: stampa in PDF; CSV nello stesso formato del CSV "saldi" di UNIO; bilancio analitico per sottoconto.

## 7. Ponte verso UNIO
- Per ogni cassa/banca e periodo (trimestre o anno) un CSV a 4 campi: `data;descrizione;uscite;entrate`.
- Una riga per **sottoconto e direzione**; descrizione che inizia con il codice: `[U08-01-04] Telefono e internet – 2° trim. 2026 (3 mov.)`.
- Spostamenti tra casse: esportati una sola volta, nel file del conto che **riceve** i soldi.
- Movimenti senza cassa/banca (rari: ammortamenti, debiti): elencati a parte, da inserire a mano in UNIO.
- Foglio guida stampabile con caselle da spuntare.
- Verifica: si carica in Divisio il CSV "saldi" esportato da UNIO → confronto voce per voce.
- **Da verificare con un primo import di prova**: separatore, riga di intestazione, formato data e decimali.

## 8. Fatture
- XML FatturaPA (anche `.p7m` firmato) → fornitore, P.IVA, numero, data, righe, imponibile, IVA, totale, scadenza.
- PDF di testo: estrazione con regole; PDF scansionati: lettura in locale (OCR) con avviso di minore precisione.
- **Sempre una schermata di conferma** con i dati modificabili prima di registrare.
- Parrocchia non commerciale: il costo registrato è il **totale IVA compresa**.

## 9. Suggerimento della voce
- Regole di base (parola → sottoconto, con un peso) + regole imparate dalle scelte dell'utente.
- Filtrate per direzione (un'entrata non propone conti di uscita).
- Mostra fino a 3 proposte con il motivo ("contiene «funerale»"); nessuna scelta automatica.
- Ogni registrazione rafforza le parole usate; una correzione vale di più.

## 10. Copia di sicurezza
- File `.json` con versione del formato, data e tutti i dati; ripristino con conferma.
- Prima di un ripristino Divisio salva in automatico una copia dei dati attuali.
- Promemoria se l'ultima copia è più vecchia di 7 giorni.

## 11. Privacy
- Nessun dato reale nel repository: solo dati inventati per esempi e test; `.gitignore` per backup e CSV.
- Nessuna chiamata a servizi esterni; eventuali eccezioni (es. OCR online) solo con richiesta esplicita.

## 12. Test previsti
- Quadratura: ogni tipo di movimento produce Dare = Avere; movimenti sbilanciati rifiutati; importi in centesimi.
- Rendiconto: totali per voce, T01/T02/F, stato patrimoniale in quadratura, collette, contributo 3% e 10%, su dati inventati con risultati calcolati a mano.
- Formato UNIO: CSV saldi identico al formato UNIO; CSV import con righe raggruppate corrette e giroconti non duplicati.
- Backup: salva → ripristina → dati identici.
- Fatture: lettura di file XML di esempio inventati.
- Suggerimenti: proposte attese per frasi tipiche; apprendimento dopo una correzione.

## 13. Risposte ricevute (15/11/2026)
- **Computer**: Mac e Windows → browser consigliati Chrome o Edge (identici sui due sistemi).
- **Saldi 2025**: non ancora chiusi → la schermata "Saldi di apertura" deve permettere di inserirli o correggerli in seguito.
- **Movimenti UNIO**: esportabili da "Visualizzazioni" → servono per l'anno di prova 2026 (il file resta sul computer).
- **Economato**: i movimenti riepilogativi in UNIO **vanno bene**.
- **Attività commerciale (teatro)**: tenuta dalla commercialista, che fornisce i dati da registrare sotto "Gestione teatro"
  (`P02-05-04`) → Divisio non gestisce l'IVA; serve solo un modo guidato per registrare i dati ricevuti.
- **Fatture**: quasi tutte XML da Aruba → caricamento di **più XML insieme** (es. tutto il trimestre); PDF rari → inserimento a mano con il PDF allegato (nessuna lettura automatica dei PDF nella prima versione).
- **Confratelli**: tutti della Diocesi di Firenze → un solo modello di Rendiconto e un solo piano dei conti di base.

- **Più persone**: il parroco su Mac, i collaboratori su Windows, **anche nello stesso momento**; la parrocchia usa **Google Drive**.
  → Condivisione prevista: ogni computer scrive il proprio file in una cartella condivisa di Google Drive e legge quelli degli altri;
  nessuno sovrascrive il lavoro altrui; sullo stesso movimento vince la modifica più recente. Nessun server.
- **Teatro**: la commercialista manda ogni trimestre una "Situazione contabile" **progressiva dal 1° gennaio** (ricavi e costi per conto);
  il parroco riporta i totali in UNIO.

## 14. Condivisione (fatta il 15/11/2026)
- Cartella **"Divisio" nel Google Drive della parrocchia**, sincronizzata da Google Drive per desktop su ogni computer
  (tutti collegati all'account Google della parrocchia). Divisio la apre con la File System Access API (Chrome/Edge).
- Ogni computer scrive solo `divisio-<computer>.json` (contenuto = tutti i dati che conosce, formato copia di sicurezza)
  e legge quelli degli altri; unione per record, vince la modifica più recente; eliminazioni come segnaposto.
- Sincronizza all'avvio, ogni 30 secondi, 2 secondi dopo ogni modifica e quando si torna sulla finestra.
- File rovinati o non validi vengono ignorati con un avviso; nessun dato non in quadratura entra nell'archivio.
- Limite noto: se due persone correggono lo stesso movimento quasi insieme, resta l'ultima correzione (l'altra si perde).

## 15. Ponte verso UNIO (fatto il 15/11/2026)
- Formato del file, copiato da un file già importato con successo in UNIO: UTF-8 con BOM, righe CRLF,
  intestazione `"DATA";"DESCRIZIONE";"USCITE";"ENTRATE"`, tutti i campi tra virgolette, data `GG/MM/AAAA`,
  importi `1250,50` (senza separatore delle migliaia), campo vuoto `""` per lo zero.
- Un file per cassa/banca e trimestre; una riga per sottoconto e direzione; descrizione `[U08-01-04] Telefono e internet – 2° trim. 2026 (3 mov.)`.
- Un movimento con più casse va solo nel file della cassa che riceve i soldi; i movimenti senza cassa si inseriscono a mano.
- "Ho importato in UNIO" salva una fotografia del riepilogo (impostazione `unio-invii`, condivisa tra i computer);
  in seguito si preparano solo le differenze (le diminuzioni diventano righe di correzione in direzione opposta).
- Il ponte parte dall'anno indicato (impostazione `unio-dal`, predefinito 2027): il 2026 è già in UNIO.
- Verificato con un test che simula l'import in UNIO di centinaia di movimenti casuali, correzioni comprese:
  il Rendiconto risultante in UNIO è identico a quello di Divisio.

## 16. Per l'anno di prova (Fase 5) – caricamento fatto il 15/11/2026
- Impostazioni → "Caricare i movimenti da UNIO": anteprima, registrazioni non valide escluse con spiegazione,
  sottoconti nuovi creati, nomi di UNIO facoltativi, identificativo fisso `unio-<anno>-<numero>` (nessun doppione), "Togli".
- Attenzione: il file AMM_ESTRATTOCONTO scaricato il 15/11 contiene SOLO 8 sottoconti delle entrate (filtro in UNIO):
  serve l'esportazione con TUTTI i conti. Divisio riconosce il file parziale e lo spiega.
- UNIO esporta i movimenti in partita doppia ("AMM_ESTRATTOCONTO.csv"): UTF-8 con BOM, `;`, colonne
  `Icsc;Azienda;Esercizio;Data registrazione;Numero registrazione;Data documento;Numero documento;Commento;Commento riga;Gruppo;Conto;Sottoconto;Descrizione;Dare;Avere`.
  Servirà per caricare il 2026 in Divisio.
- La banca permette di esportare i movimenti (CSV con data contabile, data valuta, importo, descrizione):
  idea per il futuro, proporre le registrazioni a partire dall'estratto conto.

## 17. Domande aperte
- Teatro: quali totali esattamente, e su quali conti, vengono riportati oggi in UNIO (uno screenshot di un movimento basterà).
- Colonne del file movimenti esportato da UNIO, "Visualizzazioni" (per l'import dell'anno di prova).

## 18. Fatture e scadenzario (fatto il 16/11/2026, versione 0.6)
- Pagina **Fatture**: caricamento di più file insieme (trascinamento o scelta): XML FatturaPA, `.p7m` (busta ASN.1 letta senza librerie, anche con XML spezzato), PDF.
  Lettura XML ripresa dallo "Scadenzario-fatture" (`xmlInvoiceParser.ts`), regole PDF da `pdfInstallmentDetector.ts`; nessun servizio esterno (lo Scadenzario usava Gemini: escluso).
- PDF: testo estratto con pdf.js (Mozilla, in `js/lib/pdfjs/`), campi "sicuri" solo se c'è un'unica risposta; controllo imponibile + IVA = totale.
  Campi incerti in arancione da confermare ("Ho controllato") accanto all'immagine del PDF. Scansioni: niente OCR, compilazione a mano.
- Doppione = stesso fornitore (partita IVA, altrimenti nome) + numero + data; segnalato e non caricato (anche tra file scelti insieme).
- Nuovo cassetto `fatture` (IndexedDB versione 3; gli altri cassetti non vengono toccati), incluso nella copia di sicurezza (formato 2) e nella condivisione.
  Record: dati della fattura + `rate:[{n, scadenza, importo, modalita, stato:"da pagare"|"pagata", pagataIl, cassa, voce, quotaTeatro, fuori, movimentoId}]`.
- **Regola**: solo una rata pagata genera un movimento, con id fisso `fattura-<id>-<rata>` e campo `fattura:{id, rata}`; fattura e movimento si salvano nella stessa operazione.
  "Torna da pagare" elimina il movimento; eliminare il movimento da Movimenti rimette la fattura "da pagare"; `coerenza()` segnala ogni differenza (es. da un altro computer).
- Costo registrato = importo pagato (IVA compresa); nota di credito = rimborso che riduce la spesa; ritenuta d'acconto esclusa dalla rata, con avviso (F24 a mano).
- Proposta della voce: scelta ricordata per il fornitore (impostazione `fornitore:<partita IVA>`), poi storico delle sue fatture pagate, poi parole (regole in `suggerimenti.js`);
  se non è chiaro nessuna proposta. Sempre conferma esplicita.
- Teatro (impostazione `teatro`, spenta per tutti): quota in % per fattura, ricordata per fornitore; parte del teatro sul conto scelto (predefinito P02-05-04);
  "pagata dal conto del teatro" → nessuna registrazione. Parole che indicano il teatro scritte dall'utente (nessun dato della parrocchia nel codice).
