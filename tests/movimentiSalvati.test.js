// Caricare movimenti salvati: copia di sicurezza o CSV scaricato da Divisio (dati inventati).
import { test, uguale, vero } from "./mini.js";
import { leggiMovimentiSalvati, confrontaSalvati } from "../js/dominio/movimentiSalvati.js";
import { entrateUsciteCSV } from "../js/dominio/csv.js";
import { creaBackup } from "../js/dominio/backup.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";

const BANCA = "A02-01-02";
const conti = new Map([...sottocontiIniziali().map((c) => [c.codice, c]), [BANCA, { codice: BANCA, nome: "Banco Esempio", attivo: true }]]);
const nome = (c) => conti.get(c)?.nome ?? c;
const movimenti = [
  { id: "a", data: "2026-03-01", descr: "Offerte funerali", tipo: "entrata", causale: "EOO", righe: [
    { conto: "E01-03-05", dare: 0, avere: 5000, nota: "Esequie Mario Rossi" }, { conto: "E01-03-05", dare: 0, avere: 3000, nota: "Esequie Anna Bianchi" },
    { conto: "A02-01-01", dare: 8000, avere: 0 }] },
  { id: "b", data: "2026-03-02", descr: "Bolletta luce", tipo: "uscita", righe: [{ conto: "U08-01-01", dare: 12345, avere: 0 }, { conto: BANCA, dare: 0, avere: 12345 }] },
  { id: "c", data: "2026-03-05", descr: "Versamento in banca", tipo: "spostamento", righe: [{ conto: BANCA, dare: 8000, avere: 0 }, { conto: "A02-01-01", dare: 0, avere: 8000 }] },
  { id: "d", data: "2026-01-01", descr: "Saldi di apertura 2026", tipo: "apertura", righe: [{ conto: "A02-01-01", dare: 100, avere: 0 }, { conto: "P01-01-01", dare: 0, avere: 100 }] },
];
const senzaId = (m) => ({ data: m.data, descr: m.descr, tipo: m.tipo, causale: m.causale, righe: m.righe });

test("salvati: il CSV scaricato da Movimenti torna com'era (saldi di apertura esclusi)", () => {
  const csv = "﻿" + entrateUsciteCSV(movimenti, nome);
  const l = leggiMovimentiSalvati(csv, { conti });
  vero(l.ok, l.errore);
  uguale(l.tipo, "csv");
  uguale(l.movimenti.map(senzaId), movimenti.slice(0, 3).map(senzaId));
  uguale(l.problemi.length, 1, "avviso per i saldi di apertura");
  uguale(l.contiNuovi, []);
});

test("salvati: CSV modificato in Excel, cassa sconosciuta e importi con il punto delle migliaia", () => {
  const csv = ["Data;Causale;Descrizione;Dettaglio;Voce;Nome voce;Cassa / banca;Entrate;Uscite;Spostamenti e altro",
    "5/4/26;;Lavori tetto;;U05-01-01;Manutenzione;Banco Esempio S.p.A.;;1.250,50;",
    "06/04/2026;;Offerta;;E01-04-05;Offerte;Banca Lontana;20,00;;",
    ";;Totale;;;;;20,00;1.250,50;"].join("\r\n");
  const l = leggiMovimentiSalvati(csv, { conti });
  uguale(l.movimenti.map((m) => [m.data, m.righe.map((r) => [r.conto, r.dare, r.avere])]),
    [["2026-04-05", [["U05-01-01", 125050, 0], [BANCA, 0, 125050]]]]);
  vero(l.problemi.some((p) => p.includes("Banca Lontana")));
});

test("salvati: dalla copia di sicurezza solo i movimenti; uscite di fatture non più pagate staccate", () => {
  const conCopia = [...movimenti, { id: "e", data: "2026-03-09", descr: "Fattura idraulico", tipo: "uscita", fattura: { id: "f1", rata: 1 },
    righe: [{ conto: "U05-01-01", dare: 5000, avere: 0 }, { conto: "A02-01-03", dare: 0, avere: 5000 }] },
    { id: "x", data: "2026-03-10", descr: "Eliminato", tipo: "uscita", eliminato: true, righe: [] }];
  const contiCopia = [...conti.values(), { codice: "A02-01-03", nome: "PayPal", attivo: true }];
  const testo = JSON.stringify(creaBackup({ conti: contiCopia, movimenti: conCopia, impostazioni: [], fatture: [] }));
  const l = leggiMovimentiSalvati(testo, { conti, fatture: [{ id: "f1", rate: [{ n: 1, stato: "da pagare" }] }] });
  vero(l.ok, l.errore);
  uguale(l.movimenti.map((m) => m.id), ["a", "b", "c", "d", "e"]);
  vero(!("fattura" in l.movimenti[4]));
  uguale(l.fattureStaccate, 1);
  uguale(l.contiNuovi.map((c) => [c.codice, c.nome, c.attivo]), [["A02-01-03", "PayPal", true]]);
  const pagata = leggiMovimentiSalvati(testo, { conti, fatture: [{ id: "f1", rate: [{ n: 1, stato: "pagata" }] }] });
  uguale(pagata.movimenti[4].fattura, { id: "f1", rata: 1 });
});

test("salvati: i movimenti che ci sono già si saltano, quelli forse uguali si mostrano", () => {
  const csv = leggiMovimentiSalvati(entrateUsciteCSV(movimenti, nome), { conti });
  const tutti = confrontaSalvati(csv.movimenti, movimenti);
  uguale([tutti.nuovi.length, tutti.gia.length], [0, 3]);
  // in Divisio i due funerali erano due movimenti separati: il CSV li unisce, ma sono gli stessi
  const divisi = [{ ...movimenti[0], id: "a1", righe: [movimenti[0].righe[0], { conto: "A02-01-01", dare: 5000, avere: 0 }] },
    { ...movimenti[0], id: "a2", righe: [movimenti[0].righe[1], { conto: "A02-01-01", dare: 3000, avere: 0 }] }];
  uguale(confrontaSalvati(csv.movimenti.slice(0, 1), divisi).gia.length, 1);
  // movimento eliminato in Divisio: si può riprendere
  uguale(confrontaSalvati(movimenti.slice(1, 2), [{ ...movimenti[1], eliminato: true }]).nuovi.length, 1);
  // stesso importo e stessa data, descrizione diversa: forse
  const simile = { ...movimenti[1], id: "z", descr: "Addebito SDD" };
  const r = confrontaSalvati([movimenti[1]], [simile]);
  uguale([r.nuovi.length, r.forse.has("b")], [1, true]);
});
