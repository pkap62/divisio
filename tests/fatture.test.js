import { test, uguale, vero, contiene } from "./mini.js";
import { leggiFatturaPA, xmlDaP7m, testoDaByte, centesimi, stessaFattura, trovaDoppione, chiaveFornitore } from "../js/dominio/fatture.js";
import { leggiFatturaDaTesto, imparaModello, righeDaTesto, trovaModello } from "../js/dominio/fatturePDF.js";
import { FIORI, LUCE_RATE, NOTA_CREDITO } from "./esempi/esempi.js";

const byte = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
function utf8Byte(s) {   // codifica UTF-8 senza TextEncoder (non c'è in jsc)
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

test("fatture XML: legge fornitore, numero, data, importi, scadenza e modalità", () => {
  const r = leggiFatturaPA(FIORI);
  vero(r.ok, r.errore);
  const f = r.fatture[0];
  uguale(f.fornitore, "Fioreria Esempio s.n.c. di Rossi & C.");
  uguale([f.piva, f.numero, f.data, f.tipoDoc, f.notaCredito], ["01234567890", "2026/118", "2026-11-03", "TD01", false]);
  uguale([f.imponibile, f.iva, f.totale], [12000, 2640, 14640]);
  uguale(f.rate, [{ n: 1, scadenza: "2026-12-03", importo: 14640, modalita: "MP05", iban: "IT00X0000000000000000000000" }]);
  uguale(f.incerti, []);
  contiene([f.descrizione], "festa patronale");
  uguale(f.intestatario, "Parrocchia di San Esempio");
});

test("fatture XML: due rate, prefisso ns2:, entità numeriche", () => {
  const f = leggiFatturaPA(LUCE_RATE).fatture[0];
  uguale(f.rate.map((r) => [r.scadenza, r.importo, r.modalita]), [["2026-11-05", 30500, "MP19"], ["2026-12-05", 30500, "MP19"]]);
  uguale(f.intestatario, "Sala della Comunità Esempio");
  uguale(f.totale, 61000);
});

test("fatture XML: nota di credito riconosciuta, senza scadenza → da controllare", () => {
  const f = leggiFatturaPA(NOTA_CREDITO).fatture[0];
  uguale([f.notaCredito, f.totale, f.rate[0].importo], [true, 2440, 2440]);
  contiene(f.incerti, "scadenza");
});

test("fatture XML: file che non sono fatture vengono rifiutati con una spiegazione", () => {
  contiene([leggiFatturaPA("<html><body>ciao</body></html>").errore], "Non è una fattura");
  contiene([leggiFatturaPA("<FatturaElettronica></FatturaElettronica>").errore], "mancano");
});

test("fatture XML: più fatture nello stesso file, totale mancante calcolato", () => {
  const corpo = (n, imp) => `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-01-0${n}</Data><Numero>${n}</Numero></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DatiRiepilogo><ImponibileImporto>${imp}</ImponibileImporto><Imposta>2.20</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>`;
  const xml = `<FatturaElettronica><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><Anagrafica><Nome>Mario</Nome><Cognome>Esempio</Cognome></Anagrafica></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader>${corpo(1, "10.00")}${corpo(2, "20.00")}</FatturaElettronica>`;
  const r = leggiFatturaPA(xml);
  uguale(r.fatture.map((f) => [f.fornitore, f.numero, f.totale]), [["Mario Esempio", "1", 1220], ["Mario Esempio", "2", 2220]]);
  contiene(r.fatture[0].avvisi, "calcolato");
});

test("fatture XML: ritenuta d'acconto → si paga il netto, con avviso", () => {
  const xml = FIORI.replace("<ImportoTotaleDocumento>", "<DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>24.00</ImportoRitenuta></DatiRitenuta><ImportoTotaleDocumento>")
    .replace(/<DatiPagamento>[\s\S]*<\/DatiPagamento>/, "");
  const f = leggiFatturaPA(xml).fatture[0];
  uguale(f.ritenuta, 2400);
  uguale(f.rate[0].importo, 14640 - 2400);
  contiene(f.avvisi, "ritenuta d'acconto");
});

test("importi: centesimi esatti, anche con molti decimali", () => {
  uguale([centesimi("146.40"), centesimi("60.00000000"), centesimi("0.125"), centesimi("-12.3"), centesimi("7")], [14640, 6000, 13, -1230, 700]);
  vero(Number.isNaN(centesimi("abc")) && Number.isNaN(centesimi("")));
});

test("codifica: UTF-8 e ISO-8859-1 dichiarato", () => {
  vero(testoDaByte(utf8Byte('﻿<?xml version="1.0" encoding="UTF-8"?><a>Comunità</a>')).endsWith("<a>Comunità</a>"), "UTF-8");
  vero(testoDaByte(byte('<?xml version="1.0" encoding="ISO-8859-1"?><a>Comunità</a>')).endsWith("<a>Comunità</a>"), "ISO-8859-1");
});

/* ---------- .p7m: busta firmata costruita a mano, con l'XML spezzato in due pezzi ---------- */
function der(tag, contenuto) {
  const l = contenuto.length;
  const lung = l < 128 ? [l] : l < 256 ? [0x81, l] : [0x82, l >> 8, l & 255];
  return Uint8Array.from([tag, ...lung, ...contenuto]);
}
const unisci = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
function p7m(xmlByte, { indefinita }) {
  const meta = Math.floor(xmlByte.length / 2);
  const pezzi = unisci(der(0x04, xmlByte.subarray(0, meta)), der(0x04, xmlByte.subarray(meta)));
  const octet = indefinita ? unisci([0x24, 0x80], pezzi, [0, 0]) : der(0x24, pezzi);
  const oid = der(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]);
  const contentInfo = der(0x30, unisci(oid, indefinita ? unisci([0xa0, 0x80], octet, [0, 0]) : der(0xa0, octet)));
  const signed = der(0x30, unisci(der(0x02, [1]), der(0x31, []), contentInfo, der(0x31, [])));
  return der(0x30, unisci(der(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]), der(0xa0, signed)));
}

test("fatture .p7m: estrae l'XML firmato, anche spezzato in pezzi", () => {
  for (const indefinita of [false, true]) {
    const xml = xmlDaP7m(p7m(utf8Byte(FIORI), { indefinita }));
    vero(xml, "XML non trovato");
    const f = leggiFatturaPA(xml).fatture[0];
    uguale([f.numero, f.totale, f.fornitore], ["2026/118", 14640, "Fioreria Esempio s.n.c. di Rossi & C."], indefinita ? "indefinita" : "definita");
  }
  uguale(xmlDaP7m(byte("non è una busta")), null);
});

test("doppioni: stesso fornitore, numero e data", () => {
  const a = { piva: "01234567890", fornitore: "Fioreria Esempio snc", numero: "2026/118", data: "2026-11-03" };
  vero(stessaFattura(a, { ...a, fornitore: "altro nome" }), "stessa partita IVA");
  vero(stessaFattura({ ...a, piva: "" }, { ...a, piva: "", fornitore: "FIORERIA ESEMPIO S.N.C." }), "stesso nome");
  vero(!stessaFattura(a, { ...a, data: "2026-11-04" }), "data diversa");
  vero(!stessaFattura(a, { ...a, numero: "2026/119" }), "numero diverso");
  vero(!stessaFattura(a, { ...a, piva: "09876543210" }), "fornitore diverso");
  uguale(trovaDoppione(a, [{ ...a, id: "x", eliminato: true }]), undefined, "le fatture tolte non contano");
  uguale(chiaveFornitore(a), "fornitore:01234567890");
});

/* ---------- PDF (testo già estratto) ---------- */
const TESTO_PDF = `Idraulica Prova S.r.l.
Via degli Esempi 12 - 50100 Firenze
Partita IVA 05555555555
Spett.le Parrocchia di San Esempio
Codice fiscale 90000000000
FATTURA
Numero documento: 45/2026 Data documento: 28/10/2026
Descrizione Importo
Riparazione caldaia locali parrocchiali e sostituzione valvola 250,00
Imponibile 250,00
IVA 22% 55,00
Totale documento 305,00
Modalita' di pagamento: bonifico bancario
Data scadenza: 27/11/2026`;

test("fatture PDF: legge i campi e controlla imponibile + IVA = totale", () => {
  const f = leggiFatturaDaTesto(TESTO_PDF, { escludiPiva: ["90000000000"] });
  uguale([f.piva, f.numero, f.data, f.imponibile, f.iva, f.totale], ["05555555555", "45/2026", "2026-10-28", 25000, 5500, 30500]);
  uguale([f.rate[0].scadenza, f.rate[0].importo, f.rate[0].modalita], ["2026-11-27", 30500, "MP05"]);
  uguale(f.fornitore, "Idraulica Prova S.r.l.");
  uguale(f.incerti, ["fornitore"], "il nome del fornitore va sempre controllato se non è già noto");
  const noto = leggiFatturaDaTesto(TESTO_PDF, { fornitoriNoti: new Map([["05555555555", "Idraulica Prova Srl"]]) });
  uguale([noto.fornitore, noto.incerti], ["Idraulica Prova Srl", []]);
});

test("fatture PDF: quando i conti non tornano gli importi diventano incerti", () => {
  const f = leggiFatturaDaTesto(TESTO_PDF.replace("Totale documento 305,00", "Totale documento 310,00"));
  contiene(f.incerti, "imponibile");
  contiene(f.incerti, "iva");
  uguale(f.totale, 31000);
});

test("fatture PDF: campi mancanti segnalati, nessuna data inventata", () => {
  const f = leggiFatturaDaTesto(TESTO_PDF.replace("Data scadenza: 27/11/2026", "Grazie per la preferenza, a presto da tutto lo staff"));
  uguale(f.rate[0].scadenza, "");
  contiene(f.incerti, "scadenza");
});

test("fatture PDF: una scansione non viene letta e va compilata a mano", () => {
  const f = leggiFatturaDaTesto("   \n ");
  vero(f.scansione);
  uguale(f.totale, 0);
  contiene(f.avvisi, "scansione");
});

/* ---------- PDF con tabelle, timbro PAGATA e memoria del fornitore (fatture INVENTATE) ---------- */
// riga con i testi messi a colonne fisse, come appaiono sulla pagina
const col = (...pezzi) => pezzi.reduce((riga, [c, t]) => riga.padEnd(c) + t, "");

// come una fattura con il nome del fornitore solo nel logo (immagine) e i dati in tabella, sotto le etichette
const TABELLA = [
  "PAGATA con bonifico bancario 05/03/2026",
  "Spet.le", "PARROCCHIA DI SAN ESEMPIO", "VIA DEGLI ESEMPI, 1", "FATTURA",
  col([0, "Numero"], [14, "Data"], [26, "Codice Cliente"], [42, "Partta IVA"], [55, "Codice Fiscale"], [72, "Pagamento"]),
  col([0, "2026V0000123"], [14, "28/02/2026"], [26, "C00001"], [42, "IT"], [55, "IT90000000000"], [72, "BONIFICO BANCARIO 30 GG FM"]),
  "BANCA DI PROVA S.P.A. IBAN IT60X0542811101000000123456",
  "Codice Artcolo Descrizione U.M. Quanttà Prezzo SC. Importo IVA",
  "TOTALE A CORPO NR 1,00 100,00 100,00 22",
  "Copia informatca di fatura emessa tramite SDI ai sensi della L. 205 del 27/12/2017",
  col([0, "Totale Merce"], [30, "Netto Merce"], [70, "Totale Imponibile"]),
  col([0, "100,00"], [30, "100,00"], [75, "100,00 €"]),
  col([70, "Totale Iva"]), col([77, "22,00 €"]),
  col([0, "Imponibile"], [12, "% Iva"], [20, "Imposta"]), col([0, "100,00"], [12, "22"], [20, "22,00"]),
  col([70, "Totale documento"]), col([75, "122,00 €"]),
  col([0, "Scadenze"], [12, "31/03/2026"]), col([12, "122,00"]),
].join("\n");
const PARR = { escludiPiva: ["90000000000"], nomiParrocchia: ["Parrocchia di San Esempio"] };

test("fatture PDF: valori scritti sotto le etichette, legature perse, timbro PAGATA", () => {
  const f = leggiFatturaDaTesto(TABELLA, PARR);
  uguale([f.numero, f.data, f.imponibile, f.iva, f.totale, f.rate[0].scadenza], ["2026V0000123", "2026-02-28", 10000, 2200, 12200, "2026-03-31"]);
  uguale([f.rate[0].modalita, f.rate[0].iban], ["MP05", "IT60X0542811101000000123456"]);
  uguale(f.pagata, { data: "2026-03-05", modalita: "MP05" });
  uguale([f.fornitore, f.piva], ["", ""], "il nome è solo nel logo: niente di inventato");
  uguale(f.incerti, ["fornitore", "piva"]);
  contiene(f.avvisi, "segnarla pagata il 05/03/2026");
});

test("fatture PDF: Divisio ricorda il fornitore corretto a mano e la volta dopo lo riconosce dall'IBAN", () => {
  const letta = leggiFatturaDaTesto(TABELLA, PARR);
  const corretta = { ...letta, fornitore: "Ditta Prova S.r.l.", piva: "01234567897" };
  const modello = imparaModello(righeDaTesto(TABELLA), corretta, PARR);
  uguale(modello.impronte, ["piva:01234567897", "iban:IT60X0542811101000000123456"]);
  vero(modello.campi.numero && modello.campi.data && modello.campi.totale && modello.campi.scadenza, "posizioni ricordate");
  // un'altra fattura dello stesso fornitore, stessa impaginazione, altri valori
  const seconda = TABELLA.replace("2026V0000123", "2026V0000456").replace("28/02/2026", "15/03/2026").replace("31/03/2026", "14/04/2026")
    .replace(/122,00/g, "244,00").replace(/100,00/g, "200,00").replace(/\b22,00/g, "44,00").replace("PAGATA con bonifico bancario 05/03/2026", "");
  const f = leggiFatturaDaTesto(seconda, { ...PARR, modelli: [{ chiave: "modello-pdf:01234567897", valore: modello }] });
  uguale([f.fornitore, f.piva, f.numero, f.data, f.totale, f.rate[0].scadenza], ["Ditta Prova S.r.l.", "01234567897", "2026V0000456", "2026-03-15", 24400, "2026-04-14"]);
  uguale(f.incerti, []);
  uguale(f.modello, "modello-pdf:01234567897");
  uguale(f.pagata, null);
});

test("fatture PDF: un identificativo in comune a due fornitori (es. IBAN della parrocchia) non basta", () => {
  const m = (nome, impronte) => ({ chiave: `modello-pdf:${nome}`, valore: { nome, impronte, campi: {} } });
  const modelli = [m("A", ["iban:IT00A1", "email:a@a.it"]), m("B", ["iban:IT00A1", "piva:01234567897"])];
  uguale(trovaModello(["iban:IT00A1"], modelli), null);
  uguale(trovaModello(["iban:IT00A1", "email:a@a.it"], modelli).chiave, "modello-pdf:A");
  uguale(trovaModello(["piva:01234567897"], modelli).chiave, "modello-pdf:B");
});

// come la fattura di uno studio: nome sopra la partita IVA, totali in una tabella in fondo
const STUDIO = [
  "PAGATO 20/06/2026",
  "STUDIO ESEMPIO", "ASSOCIATI", "VIA DELLE PROVE 3", "50100 - FIRENZE - FI", "Tel. 055 000000 Fax 055 000001",
  "P.IVA 01234567897 C.F. 01234567897",
  "Spett.le", "PARROCCHIA DI SAN ESEMPIO", "PIAZZA DELLE PROVE 6", "P.IVA",
  "FATTURA N. 77/00", "DATA 17/06/26",
  col([0, "CAUSALE"], [50, "COMPETENZE"], [64, "RIMBORSI"], [76, "IVA"]),
  "ONORARI 2° TRIMESTRE 2026", col([50, "39,40"], [76, "22"]),
  col([0, "TOT.COMPETENZE"], [16, "TOTALE RIMBORSI"], [34, "TOTALE"], [44, "IMPONIBILE IVA"], [60, "%"], [66, "IVA"]),
  col([0, "39,40"], [34, "39,40"], [44, "40,98"], [60, "22"]), col([66, "9,02"]),
  col([0, "SPESE INCASSO"], [16, "BOLLI"], [34, "CONTR.INTEGRATIVO"], [74, "Totale Fattura"]),
  col([34, "1,58"], [78, "50,00"]),
  col([0, "IMPONIBILE RIT.ACC."], [30, "%"], [44, "RITENUTA D'ACCONTO"], [70, "NETTO A PAGARE"]), col([74, "50,00"]),
  "BANCA D'APPOGGIO", "2 IT 60 X 05428 11101 000000123456",
].join("\n");

test("fatture PDF: nome sopra la partita IVA, importi da una tabella di totali", () => {
  const f = leggiFatturaDaTesto(STUDIO, PARR);
  uguale([f.fornitore, f.piva, f.numero, f.data], ["STUDIO ESEMPIO ASSOCIATI", "01234567897", "77/00", "2026-06-17"]);
  uguale([f.imponibile, f.iva, f.totale], [4098, 902, 5000], "imponibile + IVA = totale, anche se il totale è in un'altra colonna");
  uguale(f.pagata, { data: "2026-06-20", modalita: "" });
  uguale(f.incerti, ["fornitore", "modalita"], "già pagata: la scadenza mancante non va segnalata");
});

// come una fattura con riferimenti ad altri documenti (proforma, formulario, R.E.A.)
const VENDITA = [
  "Sede Legale: Via Esempio, 50 - 50100 Firenze - Tel. 055/000000",
  "Partita I.V.A. e Cod. Fiscale 01234567897 - Capitale Sociale € 200.000,00 i.v.",
  "Registro Imprese di Firenze 01234567897 - R.E.A. Firenze N° 999999",
  "www.esempio-spurghi.it - info@esempio-spurghi.it",
  col([0, "Fattura di vendita 497 del 30/01/2026"], [50, "SPETT.LE/ MESSRS."]), col([50, "PARROCCHIA DI SAN ESEMPIO"]),
  "Fattura Proforma 260222 del 14/01/26 1",
  col([0, "P.IVA/ VAT"], [20, "CODICE FISCALE/ FISCAL CODE"]), col([20, "90000000000"]),
  "BONIFICO BANCARIO 30GG DF",
  "Documento Commerciale Numero DOC007197/25 del 2026/01/14",
  "Svuotamento fosse 1,00 1.000,00 1.000,00 10",
  col([0, "IMPONIBILE/ AMOUNT"], [30, "COD. I.V.A./ VAT (%)"], [52, "IMPOSTA / TAX"], [70, "TOT. DOCUMENTO/"]),
  col([70, "TOTAL INVOICE"]),
  col([10, "1.000,00"], [32, "10"], [52, "100,00"], [80, "1.100,00"]),
  col([0, "SCADENZE"], [70, "NETTO DA PAGARE/"]),
  col([70, "NET TO PAY"], [80, "1.100,00"]),
  col([1, "28/02/26"], [12, "1.100,00"]),
].join("\n");

test("fatture PDF: numero e data della fattura, non della proforma o del R.E.A.", () => {
  const f = leggiFatturaDaTesto(VENDITA, PARR);
  uguale([f.piva, f.numero, f.data, f.rate[0].scadenza], ["01234567897", "497", "2026-01-30", "2026-02-28"]);
  uguale([f.imponibile, f.iva, f.totale], [100000, 10000, 110000], "il capitale sociale non è il totale");
  uguale(f.incerti, ["fornitore"]);
  contiene(f.impronte, "web:esempio-spurghi.it");
  contiene(f.impronte, "email:info@esempio-spurghi.it");
});
