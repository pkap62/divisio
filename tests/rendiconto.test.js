// Rendiconto su un anno INVENTATO, con tutti i risultati calcolati a mano (vedi commenti).
import { test, uguale, vero, contiene } from "./mini.js";
import { scritturaSemplice, scritturaApertura } from "../js/dominio/scritture.js";
import { calcolaRendiconto, totaliPrevisione } from "../js/dominio/rendiconto.js";
import { saldiCSV, leggiSaldiUNIO, confronta, VOCI_UNIO } from "../js/dominio/unio.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";

const CASSA = "A02-01-01", BANCA = "A02-01-02";
let n = 0;
const s = (data, tipo, args) => ({ id: `t${++n}`, data, descr: "x", tipo, righe: scritturaSemplice({ tipo, ...args }) });
const pd = (data, righe) => ({ id: `t${++n}`, data, descr: "x", tipo: "pd", righe: righe.map(([conto, dare, avere]) => ({ conto, dare, avere })) });
const E = (data, importo, voce, cassa) => s(data, "entrata", { importo, voce, cassa });
const U = (data, importo, voce, cassa) => s(data, "uscita", { importo, voce, cassa });

const ANNO = [
  // apertura: cassa 800, banca 10.000, credito 200, debito 500, colletta missionaria non versata 300 → patrimonio 10.200
  { id: "apertura-2026", data: "2026-01-01", descr: "apertura", tipo: "apertura", righe: scritturaApertura([
    { conto: CASSA, importo: 80000 }, { conto: BANCA, importo: 1000000 }, { conto: "A03-03-02", importo: 20000 },
    { conto: "P02-05-03", importo: 50000 }, { conto: "PG1-01-08", importo: 30000 }]) },
  E("2026-01-10", 150000, "E01-02-01", CASSA),     // collette domenicali 1.500
  E("2026-01-20", 25000, "E01-03-05", CASSA),      // funerali 250
  E("2026-02-01", 12000, "E01-01-02", BANCA),      // intenzioni Messe 120
  E("2026-02-05", 240000, "E03-01-01", BANCA),     // affitti 2.400
  E("2026-03-01", 10000, "E04-02-01", BANCA),      // plusvalenze titoli 100
  E("2026-03-15", 500000, "E02-03-01", BANCA),     // eredità 5.000
  E("2026-03-20", 3333, "E04-03-02", BANCA),       // sopravvenienze attive 33,33 (fuori dal contributo)
  U("2026-04-01", 45678, "U08-01-01", BANCA),      // luce 456,78
  U("2026-04-02", 6000, "U01-02-02", CASSA),       // fiori 60
  U("2026-05-01", 100000, "U05-01-01", BANCA),     // manutenzione 1.000
  E("2026-10-18", 40000, "PG1-01-08", CASSA),      // giornata missionaria raccolta 400
  U("2026-11-08", 60000, "PG1-01-08", BANCA),      // versata 600 (300 dell'anno prima + 300)
  E("2026-03-22", 15000, "PG1-01-03", CASSA),      // quaresima raccolta 150, non ancora versata
  s("2026-06-01", "spostamento", { importo: 100000, da: CASSA, verso: BANCA }),
  E("2026-06-10", 20000, "A03-03-02", BANCA),      // incassato il credito di 200
  pd("2026-07-01", [["P02-05-03", 50000, 0], [BANCA, 0, 50000]]),            // pagato il debito di 500
  pd("2026-12-31", [["U10-01-01", 30000, 0], ["P03-01-01", 0, 30000]]),      // ammortamento 300, senza cassa
  E("2025-12-31", 999900, "E01-02-01", CASSA),     // anno diverso: non deve contare
];
const conti = new Map(sottocontiIniziali().map((c) => [c.codice, c]));
const R = calcolaRendiconto(ANNO, 2026, { conti });

test("rendiconto di gestione: voci e totali", () => {
  const v = (c) => R.voci.get(c);
  uguale([v("E01-01"), v("E01-02"), v("E01-03"), v("E01-04")], [12000, 150000, 25000, 0]);
  uguale(R.gruppi.get("E01"), 187000);
  uguale(R.gruppi.get("E02"), 500000);
  uguale(R.gruppi.get("E03"), 240000);
  uguale(R.gruppi.get("E04"), 13333);
  uguale(R.entrate, 940333, "T01 = 9.403,33");
  uguale([v("U08-01"), v("U01-02"), v("U05-01"), v("U10-01")], [45678, 6000, 100000, 30000]);
  uguale(R.uscite, 181678, "T02 = 1.816,78");
  uguale(R.avanzo, 758655, "F = 7.586,55");
});

test("situazione patrimoniale: voci e quadratura", () => {
  uguale(R.sottoconti.get(CASSA), 204000, "cassa 2.040");
  uguale(R.sottoconti.get(BANCA), 1629655, "banca 16.296,55");
  uguale(R.voci.get("A02-01"), 1833655);
  uguale(R.voci.get("A03-03"), 0, "credito incassato");
  uguale(R.voci.get("P02-05"), 0, "debito pagato");
  uguale(R.voci.get("P03-01"), 30000);
  uguale(R.voci.get("PG1-01"), 25000, "collette ancora da versare");
  uguale(R.attivita, 1833655);
  uguale(R.passivita, 55000);
  uguale(R.patrimonio, 1020000);
  uguale(R.passivitaPiuCapitale, 1075000);
  vero(R.quadra, "Attività = Passività + Capitale + Avanzo");
  uguale(R.attivita, R.passivitaPiuCapitale + R.avanzo);
});

test("collette: raccolte, versate, anno prima, da versare", () => {
  const c = (conto) => R.collette.find((x) => x.conto === conto);
  uguale(c("PG1-01-03"), { conto: "PG1-01-03", C1: 15000, C2: 0, C3: 0, daVersare: 15000 });
  uguale(c("PG1-01-08"), { conto: "PG1-01-08", C1: 40000, C2: 60000, C3: 30000, daVersare: 10000 });
  uguale(c("PG1-01-01"), { conto: "PG1-01-01", C1: 0, C2: 0, C3: 0, daVersare: 0 }, "elencate anche senza movimenti");
  uguale(R.collette.length, 11);
  uguale(R.totaleCollette, { C1: 55000, C2: 60000, C3: 30000, daVersare: 25000 });
  uguale(R.totaleCollette.daVersare, R.voci.get("PG1-01") + R.voci.get("PG1-02"), "coincide con lo stato patrimoniale");
});

test("contributo diocesano 3% e 10%", () => {
  uguale(R.contributo, { base3: 437000, contributo3: 13110, base10: 500000, contributo10: 50000, totale: 63110 });
  const arrot = calcolaRendiconto([E("2026-01-01", 1234567, "E01-04-10", CASSA)], 2026).contributo;
  uguale(arrot.contributo3, 37037, "3% di 12.345,67 = 370,37");
});

test("anno senza movimenti: tutto a zero e in quadratura", () => {
  const vuoto = calcolaRendiconto([], 2030);
  uguale([vuoto.entrate, vuoto.uscite, vuoto.attivita, vuoto.numeroMovimenti], [0, 0, 0, 0]);
  vero(vuoto.quadra);
});

test("bilancio di previsione", () => {
  uguale(totaliPrevisione({ E01: 500000, E03: 100000, U01: 200000, U08: 150000 }), { entrate: 600000, uscite: 350000, avanzo: 250000 });
  uguale(totaliPrevisione(), { entrate: 0, uscite: 0, avanzo: 0 });
});

test("CSV come UNIO: intestazione, 54 voci nell'ordine di UNIO, numeri nel formato UNIO", () => {
  const righe = saldiCSV(R, { icsc: "0000000" }).trim().split("\r\n");
  uguale(righe[0], "Icsc;Azienda;Esercizio;Sezione;Gruppo;Conto;Descrizione;Anno corrente 2026;Anno precedente 2025");
  uguale(righe.length, 55);
  uguale(VOCI_UNIO.length, 54);
  uguale(righe[1], "0000000;A1;2026;SITUAZIONE PATRIMONIALE;A01;01;Terreni e fabbricati;0;;");
  uguale(righe[5], "0000000;A1;2026;SITUAZIONE PATRIMONIALE;A02;01;Cassa e Conti Correnti;18336,55;;");
  uguale(righe[20], "0000000;A1;2026;SITUAZIONE PATRIMONIALE;PG1;02;Collette Straordinarie;0;;");
  uguale(righe[21], "0000000;A1;2026;RENDICONTO DI GESTIONE;E01;01;Offerte S.Messe;120;;");
  contiene(righe, "0000000;A1;2026;RENDICONTO DI GESTIONE;E04;03;Proventi finanziari straordinari;33,33;;");
  uguale(righe[54], "0000000;A1;2026;RENDICONTO DI GESTIONE;U10;02;Accantonamenti;0;;");
  const conPrec = saldiCSV(R, { icsc: "0000000", precedente: calcolaRendiconto(ANNO, 2025) }).split("\r\n");
  contiene(conPrec, "0000000;A1;2026;RENDICONTO DI GESTIONE;E01;02;Collette;1500;9999;");
});

test("confronto con UNIO: lettura del CSV e differenze voce per voce", () => {
  const letto = leggiSaldiUNIO(saldiCSV(R, { icsc: "0000000" }));
  vero(letto.ok);
  uguale([letto.anno, letto.icsc, letto.voci.size], [2026, "0000000", 54]);
  vero(confronta(R, letto).every((x) => x.uguale), "un CSV di Divisio coincide con se stesso");

  // CSV in stile UNIO (valori inventati), con fine riga Windows e segni meno
  const csvUNIO = "Icsc;Azienda;Esercizio;Sezione;Gruppo;Conto;Descrizione;Anno corrente 2026;Anno precedente 2025\r\n" +
    "0000000;A1;2026;SITUAZIONE PATRIMONIALE;A02;01;Cassa e Conti Correnti;-1234,5;46,74;\r\n" +
    "0000000;A1;2026;RENDICONTO DI GESTIONE;E01;02;Collette;1500;0;\r\n";
  const u = leggiSaldiUNIO(csvUNIO);
  uguale(u.voci.get("A02-01"), { corrente: -123450, precedente: 4674 });
  const diff = confronta(R, u);
  uguale(diff.length, 2);
  uguale(diff.find((x) => x.codice === "E01-02").uguale, true);
  uguale(diff.find((x) => x.codice === "A02-01"), { codice: "A02-01", nome: "Cassa e Conti Correnti", divisio: 1833655, unio: -123450, uguale: false });

  vero(!leggiSaldiUNIO("Data;Descrizione;Uscite;Entrate\r\n01/01/2026;x;1;0").ok, "file sbagliato rifiutato");
  vero(!leggiSaldiUNIO("").ok);
});
