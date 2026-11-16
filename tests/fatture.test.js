import { test, uguale, vero, contiene } from "./mini.js";
import { leggiFatturaPA, xmlDaP7m, testoDaByte, centesimi, stessaFattura, trovaDoppione, chiaveFornitore } from "../js/dominio/fatture.js";
import { leggiFatturaDaTesto } from "../js/dominio/fatturePDF.js";
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
