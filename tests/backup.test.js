import { test, uguale, vero, contiene } from "./mini.js";
import { creaBackup, leggiBackup } from "../js/dominio/backup.js";
import { movimentiCSV, campoCSV } from "../js/dominio/csv.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";
import { scritturaSemplice } from "../js/dominio/scritture.js";

const dati = () => ({
  conti: sottocontiIniziali(),
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

test("CSV dei movimenti: una riga per riga contabile, campi protetti", () => {
  const csv = movimentiCSV(dati().movimenti, (c) => `nome ${c}`).trim().split("\r\n");
  uguale(csv.length, 5);
  uguale(csv[0], "Data;Descrizione;Tipo;Conto;Nome conto;Dare;Avere;Inserito da");
  uguale(csv[1], "01/03/2026;Offerta funerale;entrata;A02-01-01;nome A02-01-01;50,00;0,00;");
  uguale(csv[3], '02/03/2026;"Luce; bolletta ""marzo""";uscita;U08-01-01;nome U08-01-01;123,45;0,00;');
  const conEliminato = [...dati().movimenti, { ...dati().movimenti[0], id: "m3", eliminato: true }];
  uguale(movimentiCSV(conEliminato, (c) => c).trim().split("\r\n").length, 5, "i movimenti eliminati non si esportano");
  uguale(campoCSV("a\nb"), '"a\nb"');
});
