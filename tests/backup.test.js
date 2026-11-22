import { test, uguale, vero, contiene } from "./mini.js";
import { creaBackup, leggiBackup } from "../js/dominio/backup.js";
import { entrateUsciteCSV, campoCSV } from "../js/dominio/csv.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";
import { scritturaSemplice, scritturaPiuVoci } from "../js/dominio/scritture.js";

const dati = () => ({
  conti: [...sottocontiIniziali(), { codice: "A02-01-02", nome: "Banca di prova", attivo: true }],
  impostazioni: [{ chiave: "parrocchia", valore: { nome: "Parrocchia di San Esempio" } }],
  movimenti: [
    { id: "m1", data: "2026-03-01", descr: "Offerta funerale", tipo: "entrata", righe: scritturaSemplice({ tipo: "entrata", importo: 5000, voce: "E01-03-05", cassa: "A02-01-01" }) },
    { id: "m2", data: "2026-03-02", descr: "Luce; bolletta \"marzo\"", tipo: "uscita", righe: scritturaSemplice({ tipo: "uscita", importo: 12345, voce: "U08-01-01", cassa: "A02-01-02" }) },
  ],
});

test("copia di sicurezza: salva e ripristina dati identici", () => {
  const d = dati();
  const testo = JSON.stringify(creaBackup(d, new Date("2026-11-15T10:00:00Z")));
  const r = leggiBackup(testo);
  vero(r.ok, JSON.stringify(r.errori));
  for (const k of ["conti", "movimenti", "impostazioni"]) uguale(r.dati[k], d[k], k);
  uguale(r.salvatoIl, "2026-11-15T10:00:00.000Z");
});

test("copia di sicurezza: file sbagliati vengono rifiutati con una spiegazione", () => {
  contiene(leggiBackup("non è json").errori, "non è leggibile");
  contiene(leggiBackup(JSON.stringify({ app: "Altro" })).errori, "non è una copia di Divisio");
  contiene(leggiBackup(JSON.stringify({ ...creaBackup(dati()), formato: 99 })).errori, "versione più nuova");
  contiene(leggiBackup(JSON.stringify({ app: "Divisio", formato: 1, dati: {} })).errori, "incompleti");
});

test("copia di sicurezza: un movimento sbilanciato o duplicato blocca il ripristino", () => {
  const d = dati();
  d.movimenti[0].righe[0].dare = 4999;
  contiene(leggiBackup(JSON.stringify(creaBackup(d))).errori, "Offerta funerale");
  const d2 = dati();
  d2.movimenti[1].id = "m1";
  contiene(leggiBackup(JSON.stringify(creaBackup(d2))).errori, "identificativo non valido");
});

test("CSV dei movimenti: entrate e uscite (non partita doppia), una riga per voce, totale in fondo", () => {
  const funerali = { id: "m4", data: "2026-03-05", descr: "Offerte funerali marzo", causale: "Offerte per Sacramenti", tipo: "pd",
    righe: scritturaPiuVoci({ tipo: "entrata", cassa: "A02-01-01", voci: [{ voce: "E01-03-05", importo: 30000, nota: "Esequie A" }, { voce: "E01-03-05", importo: 5000, nota: "Esequie B" }] }) };
  const sposta = { id: "m5", data: "2026-03-06", descr: "Versamento", tipo: "spostamento", righe: scritturaSemplice({ tipo: "spostamento", importo: 20000, da: "A02-01-01", verso: "A02-01-02" }) };
  const csv = entrateUsciteCSV([...dati().movimenti, funerali, sposta], (c) => `nome ${c}`).trim().split("\r\n");
  uguale(csv[0], "Data;Causale;Descrizione;Dettaglio;Voce;Nome voce;Cassa / banca;Entrate;Uscite;Spostamenti e altro");
  uguale(csv[1], "01/03/2026;;Offerta funerale;;E01-03-05;nome E01-03-05;nome A02-01-01;50,00;;");
  uguale(csv[2], '02/03/2026;;"Luce; bolletta ""marzo""";;U08-01-01;nome U08-01-01;nome A02-01-02;;123,45;');
  uguale(csv[3], "05/03/2026;Offerte per Sacramenti;Offerte funerali marzo;Esequie A;E01-03-05;nome E01-03-05;nome A02-01-01;300,00;;");
  uguale(csv[4], "05/03/2026;Offerte per Sacramenti;Offerte funerali marzo;Esequie B;E01-03-05;nome E01-03-05;nome A02-01-01;50,00;;");
  uguale(csv[5], "06/03/2026;;Versamento;;;Spostamento;nome A02-01-01 → nome A02-01-02;;;200,00");
  uguale(csv[6], ";;Totale;;;;;400,00;123,45;200,00");
  const conEliminato = [...dati().movimenti, { ...dati().movimenti[0], id: "m3", eliminato: true }];
  uguale(entrateUsciteCSV(conEliminato, (c) => c).trim().split("\r\n").length, 4, "i movimenti eliminati non si esportano");
  uguale(campoCSV("a\nb"), '"a\nb"');
});
