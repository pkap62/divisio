# Rendiconto Parrocchiale – Diocesi di Firenze (struttura UNIO)

Ricavata dalla pagina "Rendiconto Parrocchiale" di UNIO (esercizio 2026), solo struttura: **nessun importo né dato reale**.
Ogni voce ha due colonne: anno corrente e anno precedente (tranne Previsione e Contributo).

## 1. Scheda anagrafica
Parrocchia, N° abitanti, Frazione, Indirizzo, Comune, Provincia, Partita IVA, Codice fiscale, Telefono, E-mail,
Parroco, Parroco dal, data approvazione CPAE, componenti CPAE (fino a 8: nome e cognome, professione, recapito),
Compilatore, E-mail di riferimento. Codice ICSC della parrocchia.

## 2. Situazione patrimoniale
**A – Attività**
- A01 Immobilizzazioni: 01 Terreni e fabbricati · 02 Impianti e strumentazioni · 03 Automezzi · 04 Immobilizzazioni immateriali
- A02 Attività correnti: 01 Cassa e conti correnti · 02 Titoli e investimenti
- A03 Crediti diversi: 01 v/ enti diocesani · 02 v/ altri enti · 03 v/ privati

**PAT – Patrimonio netto**: 01 Patrimonio netto anni precedenti

**P – Passività**
- P01 Mutui e finanziamenti: 01 Mutui e finanziamenti
- P02 Debiti diversi: 01 v/ fornitori · 02 per prestiti ricevuti · 03 con erario e previdenza · 04 per tassa diocesana · 05 diversi
- P03 Fondi: 01 Fondi ammortamento · 02 Fondi accantonamento
- PG1 Debiti per partite di giro: 01 Collette ordinarie · 02 Collette straordinarie

Quadratura: Totale attività = Totale passività + Patrimonio netto + Avanzo/Disavanzo di gestione.

## 3. Rendiconto di gestione
**Entrate**
- E01 Entrate ordinarie: 01 Offerte S. Messe · 02 Collette · 03 Offerte per sacramenti · 04 Offerte diverse · 05 Contributi ordinari
- E02 Entrate straordinarie: 01 Raccolte per iniziative straordinarie · 02 Contributi straordinari · 03 Eredità e alienazioni
- E03 Proventi da patrimonio immobiliare: 01 ordinari · 02 straordinari
- E04 Proventi finanziari: 01 ordinari · 02 straordinari da titoli · 03 straordinari
- T01 = E01 + E02 + E03 + E04

**Uscite**
- U01 Culto ed esercizio pastorale: 01 Attività pastorali · 02 Culto · 03 Attività caritative
- U02 Stipendi, remunerazioni, rimborsi: 01 Stipendi · 02 Remunerazioni · 03 Rimborsi
- U03 Onorari e compensi professionali: 01
- U04 Mobili e attrezzature: 01 Acquisto mobili e strumentazioni
- U05 Manutenzioni: 01 Immobili · 02 Mobili, strumentazioni, automezzi · 03 Impianti
- U06 Assicurazioni: 01
- U07 Locazioni passive: 01
- U08 Spese diverse: 01 Utenze · 02 Spese diverse
- U09 Oneri e imposte: 01 Imposte e tasse · 02 Oneri finanziari · 03 Altri oneri ordinari · 04 Altri oneri straordinari
- U10 Ammortamenti / accantonamenti: 01 Ammortamenti · 02 Accantonamenti
- T02 = U01 + … + U10

**F Avanzo/Disavanzo di gestione = T01 − T02**

## 4. Collette (partite di giro)
Colonne: C1 Raccolte nell'anno · C2 Versate.
- Ordinarie: 01 Seminario diocesano · 02 Carità del Papa · 03 Quaresima di carità · 04 Terra Santa · 05 Migranti ·
  06 Università Cattolica · 07 Avvento di fraternità · 08 Missionaria · 09 Infanzia missionaria · 10 Lebbrosi
- Straordinarie: 01 Colletta straordinaria
- C3 Raccolte non versate anno precedente
- Importo ancora da versare = C3 + C1 − C2 (coincide con PG1 nello stato patrimoniale)

## 5. Bilancio di previsione
Un importo per gruppo: entrate 01–04 (E01–E04), uscite 01–10 (U01–U10), totali e avanzo/disavanzo.

## 6. Contributo diocesano
- 3% su: E01-01 + E01-02 + E01-03 + E01-04 + E01-05 + E03-01 + E04-01 + E04-02
- 10% su: E02-03 + E03-02
- Totale = 3% + 10%

## 7. Altre informazioni
- Situazione fiscale: dichiarazioni da presentare (SI/NO) – Modello Unico, 770, Dichiarazione IVA, IMU; consulente (nome, contatto)
- Assicurazioni: compagnia; Incendio, Furto, Infortuni, Resp. civile (SI/NO + massimale)
- Allegati richiesti: verbale approvazione CPAE, estratti conto di dicembre, bilanci attività commerciali,
  estratti conto titoli, libretto risparmi, documentazione mutui/interessi; frontespizio firmato dal CPAE;
  verbali consuntivo/preventivo; stampa del Bilancio analitico.

## Note su UNIO
- Il Rendiconto è calcolato dai movimenti contabili; le caselle del Rendiconto sono **bloccate** (non si scrivono a mano). Dopo l'invio i movimenti si bloccano.
- Stati: 1 in compilazione · 2 inviato · 3 da correggere · 4 approvato.

### Piano dei conti: 3 livelli, allineato al Rendiconto
Codice = **Gruppo – Conto – Sottoconto** (es. `U08-01-04`). Gruppo + Conto coincidono con la voce del Rendiconto
(`U08-01` = Utenze); il sottoconto è il dettaglio (es. `04` Telefono e internet).
Esempi visti: `A02-01-02` Banca (conto finanziario), `U01-02-05` Spese varie per culto, `U04-01-01` Mobili e attrezzature – acquisti.
→ In Divisio la voce del Rendiconto si ricava direttamente dai primi due livelli del codice.

### Esportazione "saldi Patrimoniali e di Gestione" (.csv)
Separatore `;`, decimali con virgola, intestazione:
`Icsc;Azienda;Esercizio;Sezione;Gruppo;Conto;Descrizione;Anno corrente AAAA;Anno precedente AAAA`
Una riga per voce (Gruppo+Conto) di Situazione patrimoniale e Rendiconto di gestione; non contiene Collette né Contributo.
→ Divisio può produrre lo stesso formato per confrontare automaticamente i totali con UNIO.

### Importazione Prima Nota (menu Partita Doppia)
- CSV a 4 campi: data, descrizione, uscite, entrate.
- Si sceglie un **conto di riferimento** (cassa o banca, es. `A02-01-02`); ogni riga è un movimento di quel conto.
- Per **ogni riga** va scelto a mano il sottoconto di contropartita (Gruppo/Conto/Sottoconto).
- Importa solo righe con data nell'esercizio selezionato.
