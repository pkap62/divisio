import { test, uguale, vero, contiene } from "./mini.js";
import { tabellaDaTesto, leggiEstratto, leggiData, leggiImporto, separatore, testoDelFile, saldoFinale, impronta } from "../js/dominio/estrattoConto.js";
import { controparte, maiuscole, firma, preparaRighe, completa, movimentoProposta, importoRegistrato, fuoriContabilita, ricorda, importazioni, trovaFattura, numeroNelTesto, impronteRighe } from "../js/dominio/banca.js";
import { righeDaFoglio, testiCondivisi, stiliData } from "../js/dati/xlsx.js";
import { verificaMovimento, quadra } from "../js/dominio/scritture.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";
import { BPM, DUE_COLONNE, VIRGOLA, SENZA_TITOLI, HTML_XLS, XLSX_TESTI, XLSX_STILI, XLSX_FOGLIO } from "./esempi/estratti.js";

const BANCA = "A02-01-02";
const conti = new Map([...sottocontiIniziali(), { codice: BANCA, nome: "Banca Esempio" }].map((c) => [c.codice, c]));
const attivi = new Set(conti.keys());
const base = { cassa: BANCA, contiAttivi: attivi, casse: ["A02-01-01", BANCA] };
const leggi = (testo) => leggiEstratto(tabellaDaTesto(testo));

test("estratto conto: date e importi nei vari modi delle banche", () => {
  uguale(["31/03/2026", "1-4-26", "02.01.2026", "2026-03-04 09:27", "31/02/2026", "ciao", 46037].map(leggiData),
    ["2026-03-31", "2026-04-01", "2026-01-02", "2026-03-04", "", "", "2026-01-15"]);
  uguale(["-71,98", "1.250,50", "1,250.50", "€ 12,30", "+30", "(50,00)", "50,00-", "1250.5", "-57,1", "1.250", "", "abc", 12.345].map(leggiImporto),
    [-7198, 125050, 125050, 1230, 3000, -5000, -5000, 125050, -5710, 125000, NaN, NaN, 1235]);
});

test("estratto conto: separatore e codifica riconosciuti da soli", () => {
  uguale(separatore(["a;b;c", "1;2,5;3"]), ";");
  uguale(separatore(["a\tb\tc", "1\t2,5\t3"]), "\t");
  uguale(separatore(['"a","b"', '"1,5","2"']), ",");
  // Windows-1252: "è" = 0xE8, "€" = 0x80
  uguale(testoDelFile(Uint8Array.from([0x43, 0x61, 0x75, 0x73, 0xe8, 0x20, 0x80])), "Causè €");
  uguale(testoDelFile(Uint8Array.from([0xef, 0xbb, 0xbf, 0x63, 0xc3, 0xa0])), "cà");
});

test("estratto conto Banco BPM: colonne, segni e categorie", () => {
  const l = leggi(BPM);
  vero(l.ok, l.errore);
  uguale(l.righe.length, 10);
  uguale(l.colonne.data, [0]);
  uguale(l.colonne.categoria, [7, 8]);
  const r = l.righe[0];
  uguale([r.data, r.valuta, r.importo, r.categoria, r.n], ["2026-03-31", "2026-03-31", -5000, "Servizi / Spese per professionisti", 2]);
  vero(!r.descrizione.startsWith("260"), "la causale in codice non entra nella descrizione");
  uguale(l.righe[7].importo, -120709);
  uguale(l.impronta, "data contabile|data valuta|importo|divisa|causale|descrizione|canale|categoria|sotto categoria");
});

test("estratto conto con intestazione, addebiti e accrediti separati, riga di saldo", () => {
  const l = leggi(DUE_COLONNE);
  vero(l.ok, l.errore);
  uguale(l.rigaTitoli, 4);
  uguale(l.righe.map((r) => [r.data, r.importo]), [["2026-01-02", 15000], ["2026-01-05", -2340], ["2026-01-05", -20000], ["2026-01-10", -150]]);
  uguale(l.righe[2].valuta, "2026-01-04");
  uguale(l.scartate, []);
});

test("estratto conto all'inglese: virgola, segno D/C e saldo", () => {
  const l = leggi(VIRGOLA);
  vero(l.ok, l.errore);
  uguale(l.righe.map((r) => r.importo), [25000, -104550]);
  uguale(saldoFinale(l.righe), { data: "2026-02-03", saldo: 45450 });
});

test("estratto conto senza titoli: le colonne si indovinano dai dati", () => {
  const l = leggi(SENZA_TITOLI);
  vero(l.ok, l.errore);
  vero(l.indovinate, "deve dire che le ha indovinate");
  uguale(l.righe.map((r) => [r.data, r.importo, r.descrizione]), [["2026-02-03", 5000, "BONIFICO DA BIANCHI"], ["2026-02-04", -300, "SPESE TENUTA CONTO"]]);
});

test("estratto conto: tabella HTML salvata come .xls", () => {
  const l = leggi(HTML_XLS);
  vero(l.ok, l.errore);
  uguale(l.righe.map((r) => [r.importo, r.descrizione]), [[100000, "Bonifico da Rossi & Figli"], [-250, "Addebito canone mensile"]]);
});

test("estratto conto: foglio Excel .xlsx (date, testi e numeri)", () => {
  const t = righeDaFoglio(XLSX_FOGLIO, testiCondivisi(XLSX_TESTI), stiliData(XLSX_STILI));
  uguale(t, [["Data", "Descrizione", "Importo"], [], ["2026-01-15", "Bonifico da Verdi", 75.5], ["2026-01-16", "Spese & commissioni", -1.2]]);
  const l = leggiEstratto(t);
  vero(l.ok, l.errore);
  uguale(l.righe.map((r) => [r.data, r.importo]), [["2026-01-15", 7550], ["2026-01-16", -120]]);
});

test("estratto conto: colonne scelte a mano e file non riconosciuto", () => {
  const tab = tabellaDaTesto("A;B;C\nx;y;z\n");
  const l = leggiEstratto(tab);
  vero(!l.ok);
  uguale(l.numeroColonne, 3);
  const m = leggiEstratto(tabellaDaTesto("Giorno;Cosa;Euro\n01/02/2026;Offerta;20\n"), { colonne: { data: [0], descrizione: [1], importo: [2] }, riga: 0 });
  vero(m.ok, m.errore);
  uguale([m.righe[0].importo, m.impronta], [2000, impronta(["Giorno", "Cosa", "Euro"])]);
});

test("banca: nome e causale dalla descrizione", () => {
  const l = leggi(BPM).righe;
  uguale(controparte(l[0].descrizione), { nome: "studio rossi associati", causale: "saldo ft 12/00 del 18/03/2026", mandato: "" });
  uguale(controparte(l[4].descrizione).nome, "verdi anna");
  uguale(controparte(l[4].descrizione).causale, "donazione alla parrocchia");
  uguale(controparte(l[5].descrizione).nome, "neri luca e neri sara");
  uguale(controparte(l[6].descrizione), { nome: "telefonia esempio spa", causale: "", mandato: "000000000000000000001" });
  uguale(controparte("BONIFICO A VOSTRO FAVORE ORDINANTE: GIALLI MARIA CAUSALE: OFFERTA PER BATTESIMO"), { nome: "gialli maria", causale: "offerta per battesimo", mandato: "" });
  uguale(controparte("PAGAMENTO POS PRESSO CARTOLERIA ESEMPIO").nome, "cartoleria esempio");
  uguale(controparte("int. e comp. - competenze").nome, "");
  uguale(maiuscole("energia esempio societa. benefit srl"), "Energia Esempio Societa. Benefit SRL");
  uguale(maiuscole("publiacqua s p a"), "Publiacqua SPA");
  uguale(maiuscole("Mario Rossi"), "Mario Rossi");
  uguale(firma("rimborso colf febbraio 2026"), "rimborso colf");
  uguale(firma("marzo 2026"), "");
});

test("banca: numero della fattura nella descrizione", () => {
  vero(numeroNelTesto("234/00", "saldo ft 234/00 del 18/03/2026"));
  vero(numeroNelTesto("12", "saldo ft 12 del 21/03/2026"));
  vero(!numeroNelTesto("12", "pagati 12 euro"));
  vero(!numeroNelTesto("234", "saldo ft 234/00"));
});

test("banca: proposte dalle parole (bollo, colf, messe, contanti, professionista)", () => {
  const p = preparaRighe(leggi(BPM).righe, base);
  const per = (i) => [p[i].stato, p[i].tipo, p[i].voce || p[i].altra];
  uguale(per(0), ["pronto", "uscita", "U03-01-01"]);
  uguale(per(1), ["pronto", "uscita", "U08-02-07"]);
  uguale(per(2), ["pronto", "uscita", "U02-03-03"]);
  uguale(per(4), ["pronto", "entrata", "E01-04-05"]);
  uguale(per(5), ["pronto", "entrata", "E01-01-02"]);
  uguale(per(6), ["pronto", "uscita", "U08-01-04"]);
  uguale(per(7)[0], "da-completare");   // "luce e gas" nella categoria: due voci possibili, chiede
  uguale(per(8), ["pronto", "spostamento", "A02-01-01"]);
  uguale(per(9), ["pronto", "uscita", "U09-01-06"]);
  uguale(p[0].descr, "Studio Rossi Associati – saldo ft 12/00 del 18/03/2026");
  vero(p.every((x) => x.includi && x.id.startsWith("banca-" + BANCA + "-")));
  uguale(new Set(p.map((x) => x.id)).size, p.length);
});

test("banca: due righe identiche restano distinte, la stessa riga ha sempre lo stesso identificativo", () => {
  const r = { data: "2026-03-06", importo: -2000, descrizione: "ricarica" };
  const [a, b] = impronteRighe([r, { ...r }]);
  vero(a !== b);
  uguale(impronteRighe([r])[0], a);
});

test("banca: movimenti già caricati o già registrati non si registrano di nuovo", () => {
  const righe = leggi(BPM).righe;
  const prima = preparaRighe(righe, base);
  const imp = { id: "imp1", file: "es.csv", il: "2026-04-01T10:00:00.000Z" };
  const caricato = movimentoProposta(prima[0], BANCA, imp);
  const aMano = { id: "m1", data: "2026-03-14", descr: "Bolletta telefono", tipo: "uscita", righe: [{ conto: "U08-01-04", dare: 5710, avere: 0 }, { conto: BANCA, dare: 0, avere: 5710 }] };
  const p = preparaRighe(righe, { ...base, movimenti: [caricato, aMano] });
  uguale([p[0].stato, p[0].includi], ["gia-importato", false]);
  uguale([p[6].stato, p[6].includi, p[6].giaRegistrato.id], ["gia-registrato", false, "m1"]);
  uguale(p[1].stato, "pronto");
});

test("banca: il pagamento di una fattura dello scadenzario viene riconosciuto", () => {
  const fattura = { id: "f1", fornitore: "IDRAULICA ESEMPIO S.R.L.", numero: "45", data: "2026-03-21", piva: "01234567890", rate: [{ n: 1, importo: 18300, scadenza: "2026-04-20", stato: "da pagare" }] };
  const altra = { ...fattura, id: "f2", fornitore: "Altro Fornitore", numero: "99" };
  const righe = leggi(BPM).righe;
  const p = preparaRighe(righe, { ...base, fatture: [altra, fattura], fornitori: [{ chiave: "fornitore:01234567890", nome: "Idraulica Esempio", voce: "U05-03-01" }] });
  uguale([p[3].stato, p[3].fattura.id, p[3].voce], ["fattura", "f1", "U05-03-01"]);
  vero(completa(p[3]));
  uguale(trovaFattura({ importo: -18300, data: "2026-03-24", descrizione: "bonifico a sconosciuto" }, [fattura]), null);
});

test("banca: la scelta ricordata vale per lo stesso nome e la stessa causale", () => {
  const righe = leggi(BPM).righe;
  const p0 = preparaRighe(righe, base);
  // l'utente sceglie "Rimborsi a sacerdoti occasionali" per Mario Bianchi, causale "rimborso colf"
  const scelta = { ...p0[2], voce: "U02-03-04" };
  const valore = ricorda(undefined, scelta, "2026-04-01");
  uguale(valore.nome, "Mario Bianchi");
  uguale(valore.scelte[0], { tipo: "uscita", voce: "U02-03-04", altra: "", firma: "rimborso colf", quotaTeatro: 0, volte: 1, ultima: "2026-04-01" });
  const p = preparaRighe(righe, { ...base, memorie: new Map([[p0[2].chiave, valore]]) });
  uguale([p[2].voce, p[2].livello], ["U02-03-04", "ricordato"]);
  // ricordare di nuovo la stessa scelta la conta due volte, senza doppioni
  const ancora = ricorda(valore, scelta, "2026-07-01");
  uguale([ancora.scelte.length, ancora.scelte[0].volte], [1, 2]);
});

test("banca: registrazioni in quadratura (entrata, uscita, spostamento, teatro)", () => {
  const p = preparaRighe(leggi(BPM).righe, base);
  const imp = { id: "imp1", file: "es.csv", il: "2026-04-01T10:00:00.000Z" };
  for (const i of [0, 1, 4, 8]) {
    const m = movimentoProposta(p[i], BANCA, imp);
    uguale(verificaMovimento(m, { conti }), [], p[i].descrizione);
    uguale([m.origine, m.banca.importazione, m.banca.riga], ["banca", "imp1", p[i].impronta]);
  }
  const sp = movimentoProposta(p[8], BANCA, imp);
  uguale(sp.righe, [{ conto: BANCA, dare: 130500, avere: 0 }, { conto: "A02-01-01", dare: 0, avere: 130500 }]);
  const meta = { ...p[7], voce: "U08-01-01", quotaTeatro: 50 };
  const teatro = movimentoProposta(meta, BANCA, imp);
  vero(quadra(teatro.righe));
  uguale(teatro.righe.map((r) => [r.conto, r.dare, r.avere]), [["U08-01-01", 60354, 0], [BANCA, 0, 60354]], "al 50%: solo la metà della parrocchia");
  contiene([teatro.descr], "quota della parrocchia 50%");
  uguale([importoRegistrato(meta), importoRegistrato({ ...meta, quotaTeatro: 100 }), importoRegistrato(p[7])], [-60354, 0, -120709]);
  vero(fuoriContabilita({ ...meta, quotaTeatro: 100 }) && completa({ ...meta, voce: "", quotaTeatro: 100 }), "altra gestione: non serve la voce");
  uguale(importazioni([movimentoProposta(p[0], BANCA, imp), movimentoProposta(p[1], BANCA, imp)]), [{ id: "imp1", file: "es.csv", il: imp.il, cassa: BANCA, n: 2, dal: "2026-03-31", al: "2026-03-31" }]);
});

test("banca: altri formati (ordinante, prelievo, commissioni)", () => {
  const p = preparaRighe(leggi(DUE_COLONNE).righe, base);
  uguale(p.map((x) => [x.tipo, x.voce || x.altra]), [["entrata", "E01-03-01"], ["uscita", ""], ["spostamento", "A02-01-01"], ["uscita", "U08-02-07"]]);
  uguale(p[0].descr, "Gialli Maria – offerta per battesimo");
  uguale(movimentoProposta(p[2], BANCA, { id: "x" }).righe, [{ conto: "A02-01-01", dare: 20000, avere: 0 }, { conto: BANCA, dare: 0, avere: 20000 }]);
});
