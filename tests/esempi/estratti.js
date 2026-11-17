// Estratti conto di prova INVENTATI (nomi, importi e codici di fantasia), nei formati di banche diverse.

// Come Banco BPM: separatore ";", tutto tra virgolette, importo con il segno, causale in codice, categoria della banca.
export const BPM = `"Data contabile";"Data valuta";"Importo";"Divisa";"Causale";"Descrizione";"Canale";"Categoria";"Sotto Categoria"
"31/03/2026";"31/03/2026";"-50";"EUR";"260";"vostra disposizione - vs.disp. rif. mb0b00000001/90000001  favore studio rossi associati            - add.tot - saldo ft 12/00 del 18/03/2026";"";"Servizi";"Spese per professionisti"
"31/03/2026";"01/04/2026";"-15";"EUR";"16X";"int. e comp. - competenze";"";"Operazioni Finanziarie";"Interessi negativi"
"27/03/2026";"27/03/2026";"-600";"EUR";"260";"vostra disposizione - vs.disp. rif. mb0b00000002/90000002  favore mario bianchi                       - add.tot - rimborso colf febbraio 2026";"";"Risorse Umane";"Salari e stipendi"
"24/03/2026";"24/03/2026";"-183";"EUR";"260";"vostra disposizione - vs.disp. rif. mb0b00000003/90000003  favore idraulica esempio srl               - add.tot - saldo ft 45 del 21/03/2026";"";"Fornitori";"Generico"
"23/03/2026";"23/03/2026";"30";"EUR";"480";"bonif. vs. favore - bon.da verdi anna donazione alla parroc chia - donazione alla parrocchia";"";"Ricavi";"Ricavi dalle vendite"
"20/03/2026";"20/03/2026";"100";"EUR";"480";"bonif. vs. favore - bon.da neri luca e neri sara neri luca - aaaa00a00a000a - offert - neri luca - aaaa00a00a000a - offerta per ss. messe";"";"Ricavi";"Generico"
"16/03/2026";"16/03/2026";"-57,1";"EUR";"50C";"addebito diretto sdd - sdd b2b : 000000000000000000001 telefonia esempio spa";"";"Utenze";"Internet e spese telefoniche"
"12/03/2026";"12/03/2026";"-1.207,09";"EUR";"50C";"addebito diretto sdd - sdd core: abc000000000000000240 energia esempio societa. benefit srl";"";"Utenze";"Acqua, luce e gas"
"18/02/2026";"18/02/2026";"1305";"EUR";"780";"vers. contanti - ";"";"Ricavi";"Deposito contanti"
"03/01/2026";"03/01/2026";"-25,21";"EUR";"195";"imposta di bollo cc e lr - da 01/10/2025 a 31/12/2025";"";"Tasse";"Imposte e contributi"
`;

// Come molte banche "online": righe di intestazione prima della tabella, colonne Addebiti e Accrediti separate, saldo in fondo.
export const DUE_COLONNE = `Conto corrente n. 000000001234;;;;
Intestatario: PARROCCHIA DI SAN ESEMPIO;;;;
Movimenti dal 01/01/2026 al 31/03/2026;;;;
;;;;
Data operazione;Data valuta;Descrizione operazione;Addebiti (euro);Accrediti (euro)
02.01.2026;02.01.2026;BONIFICO A VOSTRO FAVORE ORDINANTE: GIALLI MARIA CAUSALE: OFFERTA PER BATTESIMO;;150,00
05.01.2026;05.01.2026;PAGAMENTO POS PRESSO CARTOLERIA ESEMPIO;23,40;
05.01.2026;04.01.2026;PRELIEVO BANCOMAT;200,00;
10.01.2026;10.01.2026;COMMISSIONI BONIFICO;1,50;
Saldo finale;;;;1.234,56
`;

// Separatore ",", importi all'inglese, segno in una colonna a parte, data ISO.
export const VIRGOLA = `"Booking date","Value date","Description","Amount","D/C","Balance"
"2026-02-01","2026-02-01","SEPA credit transfer from Rossi Paolo - offerta",250.00,"C","1,500.00"
"2026-02-03","2026-02-03","Card payment at Fiori Esempio","1,045.50","D","454.50"
`;

// Senza titoli: Divisio deve indovinare le colonne dai dati.
export const SENZA_TITOLI = `03/02/2026	03/02/2026	BONIFICO DA BIANCHI	50,00
04/02/2026	04/02/2026	SPESE TENUTA CONTO	-3,00
`;

// Molte banche chiamano ".xls" una pagina web con una tabella.
export const HTML_XLS = `<html><body><table>
<tr><th>Data</th><th>Descrizione</th><th>Importo</th></tr>
<tr><td>15/01/2026</td><td>Bonifico da Rossi &amp; Figli</td><td>1.000,00</td></tr>
<tr><td>16/01/2026</td><td>Addebito canone<br>mensile</td><td>-2,50</td></tr>
</table></body></html>`;

// Pezzi di un file Excel .xlsx (già decompressi).
export const XLSX_TESTI = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>Data</t></si><si><t>Descrizione</t></si><si><t>Importo</t></si><si><r><t>Bonifico </t></r><r><t>da Verdi</t></r></si></sst>`;
export const XLSX_STILI = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="4"/></cellXfs></styleSheet>`;
export const XLSX_FOGLIO = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="3"><c r="A3" s="1"><v>46037</v></c><c r="B3" t="s"><v>3</v></c><c r="C3" s="2"><v>75.5</v></c></row>
<row r="4"><c r="A4" s="1"><v>46038</v></c><c r="B4" t="inlineStr"><is><t>Spese &amp; commissioni</t></is></c><c r="C4"><v>-1.2</v></c></row>
</sheetData></worksheet>`;
