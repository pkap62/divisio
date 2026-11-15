// Caricamento dei movimenti esportati da UNIO (file di esempio INVENTATO, stesso formato).
import { test, uguale, vero, contiene } from "./mini.js";
import { leggiEstrattoConto, aMovimenti, campiCSV, tipoDaRighe } from "../js/dominio/importaUNIO.js";
import { verificaMovimento } from "../js/dominio/scritture.js";
import { calcolaRendiconto } from "../js/dominio/rendiconto.js";
import { saldiCSV, leggiSaldiUNIO, confronta } from "../js/dominio/unio.js";

const INTEST = "Icsc;Azienda;Esercizio;Data registrazione;Numero registrazione;Data documento;Numero documento;Commento;Commento riga;Gruppo;Conto;Sottoconto;Descrizione;Dare;Avere";
const q = (x) => (x.includes(";") ? `"${x}"` : x);   // come un CSV vero: virgolette se serve
const r = (n, data, comm, g, c, s, nome, dare, avere, rigaComm = "") => `0000000;A1;2026;${data};${n};;;${q(comm)};${q(rigaComm)};${g};${c};${s};${nome};${dare};${avere}`;
const FILE = "﻿" + [INTEST,
  r(1, "10/01/2026", "Colletta domenicale", "A02", "01", "01", "Cassa", "410", "0"),
  r(1, "10/01/2026", "Colletta domenicale", "E01", "02", "01", "Collette domenicali", "0", "410"),
  r(2, "20/01/2026", "Bolletta luce; gennaio", "U08", "01", "01", "Energia elettrica", "186,4", "0"),
  r(2, "20/01/2026", "Bolletta luce; gennaio", "A02", "01", "02", "Banca Esempio", "0", "186,4"),
  r(3, "05/02/2026", "", "A02", "01", "02", "Banca Esempio", "700", "0", "Versamento contanti"),
  r(3, "05/02/2026", "", "A02", "01", "01", "Cassa", "0", "700"),
  r(4, "15/06/2026", "Fattura con ritenuta", "U03", "01", "01", "Onorari", "1000", "0"),
  r(4, "15/06/2026", "Fattura con ritenuta", "A02", "01", "02", "Banca Esempio", "0", "800"),
  r(4, "15/06/2026", "Fattura con ritenuta", "P02", "03", "01", "Erario", "0", "200"),
  r(5, "20/06/2026", "Sbilanciata", "U01", "02", "02", "Fiori", "50", "0"),
  r(5, "20/06/2026", "Sbilanciata", "A02", "01", "01", "Cassa", "0", "45"),
  r(6, "30/06/2026", "Chiusura", "CH", "01", "01", "Profitti e Perdite", "10", "0"),
  r(6, "30/06/2026", "Chiusura", "A02", "01", "01", "Cassa", "0", "10"),
  r(7, "01/07/2026", "Rimborso", "U02", "03", "06", "Rimborso sacerdote collaboratore", "300", "0"),
  r(7, "01/07/2026", "Rimborso", "A02", "01", "01", "Cassa", "0", "300"),
  r(8, "02/07/2026", "Spesa su sottoconto nuovo", "U08", "02", "11", "Manutenzione organo", "120,50", "0"),
  r(8, "02/07/2026", "Spesa su sottoconto nuovo", "A02", "01", "01", "Cassa", "0", "120,50"),
].join("\r\n") + "\r\n";

test("UNIO: campi CSV con virgolette e punto e virgola", () => {
  uguale(campiCSV('a;"b;c";"d ""e""";;f'), ["a", "b;c", 'd "e"', "", "f"]);
});

test("UNIO: lettura del file movimenti e raggruppamento per registrazione", () => {
  const l = leggiEstrattoConto(FILE);
  vero(l.ok, l.errore);
  uguale([l.anno, l.icsc], [2026, "0000000"]);
  uguale(l.registrazioni.map((x) => x.numero), ["1", "2", "3", "4", "7", "8"]);
  const luce = l.registrazioni.find((x) => x.numero === "2");
  uguale(luce, { numero: "2", data: "2026-01-20", descr: "Bolletta luce; gennaio", righe: [
    { conto: "U08-01-01", dare: 18640, avere: 0 }, { conto: "A02-01-02", dare: 0, avere: 18640 }] });
  uguale(l.registrazioni.find((x) => x.numero === "3").descr, "Versamento contanti", "senza commento si usa il commento di riga");
  uguale(l.nomi.get("A02-01-02"), "Banca Esempio", "nomi dei sottoconti di UNIO");
  uguale(l.nomi.get("U08-02-11"), "Manutenzione organo");
});

test("UNIO: registrazioni non valide escluse con una spiegazione", () => {
  const { problemi } = leggiEstrattoConto(FILE);
  uguale(problemi.length, 2);
  contiene(problemi, "n. 5 del 20/06/2026 («Sbilanciata»): esclusa perché Dare e Avere non sono uguali");
  contiene(problemi, "n. 6 del 30/06/2026 («Chiusura»): esclusa perché è una scrittura di chiusura");
  vero(!leggiEstrattoConto("Data;Descrizione;Uscite;Entrate\r\n").ok, "file sbagliato");
});

test("UNIO: un estratto conto di pochi conti viene riconosciuto e spiegato", () => {
  const parziale = "\uFEFF" + [INTEST,
    r(1, "10/01/2026", "Colletta", "E01", "02", "01", "Collette domenicali", "0", "410"),
    r(2, "17/01/2026", "Colletta", "E01", "02", "01", "Collette domenicali", "0", "380"),
    r(3, "18/01/2026", "Funerale", "E01", "03", "05", "Funerali", "0", "150")].join("\r\n");
  const l = leggiEstrattoConto(parziale);
  vero(!l.ok && l.parziale);
  contiene([l.errore], "solo l'estratto conto di 2 sottoconti");
  contiene([l.errore], "TUTTI i conti");
});

test("UNIO: movimenti di Divisio validi, con il tipo giusto e identificativo fisso", () => {
  const l = leggiEstrattoConto(FILE);
  const ms = aMovimenti(l.registrazioni, l.anno);
  uguale(ms.map((m) => [m.id, m.tipo]), [["unio-2026-1", "entrata"], ["unio-2026-2", "uscita"], ["unio-2026-3", "spostamento"],
    ["unio-2026-4", "pd"], ["unio-2026-7", "uscita"], ["unio-2026-8", "uscita"]]);
  const conti = new Map([...l.nomi.keys()].map((c) => [c, {}]));
  for (const m of ms) uguale(verificaMovimento(m, { conti, anno: 2026 }), [], m.id);
  uguale(tipoDaRighe([{ conto: "U08-01-01", dare: 1, avere: 0 }, { conto: "P02-01-01", dare: 0, avere: 1 }]), "pd");
});

test("UNIO: il Rendiconto dei movimenti caricati coincide con quello calcolato da UNIO", () => {
  const l = leggiEstrattoConto(FILE);
  const R = calcolaRendiconto(aMovimenti(l.registrazioni, l.anno), 2026);
  uguale(R.voci.get("E01-02"), 41000);
  uguale(R.voci.get("A02-01"), 41000 - 18640 - 80000 - 30000 - 12050, "cassa e banca insieme, senza saldi di apertura (come in UNIO)");
  uguale(R.voci.get("P02-03"), 20000, "ritenuta da versare");
  // "UNIO" esporta i saldi: il confronto deve dare tutte le voci uguali
  vero(confronta(R, leggiSaldiUNIO(saldiCSV(R, { icsc: "0000000" }))).every((x) => x.uguale));
});
