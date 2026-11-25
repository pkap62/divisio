// Azzerare lo scadenzario e ripartire da zero (dati inventati).
import { test, uguale, vero } from "./mini.js";
import { azzeraScadenzario, ripartiDaZero } from "../js/dominio/azzera.js";
import { tornaDaPagare } from "../js/dominio/scadenzario.js";

const fatture = [
  { id: "f1", fornitore: "Ditta Esempio", rate: [{ n: 1, importo: 1000, stato: "pagata", pagataIl: "2026-03-01", voce: "U08-01-01", cassa: "A02-01-01" }] },
  { id: "f2", fornitore: "Altra Ditta", rate: [{ n: 1, importo: 500, stato: "da pagare" }] },
  { id: "f3", eliminato: true, rate: [] },
];
const movimenti = [
  { id: "fattura-f1-1", data: "2026-03-01", descr: "Fattura Ditta Esempio", tipo: "uscita", fattura: { id: "f1", rata: 1 },
    righe: [{ conto: "U08-01-01", dare: 1000, avere: 0 }, { conto: "A02-01-01", dare: 0, avere: 1000 }] },
  { id: "m2", data: "2025-05-01", descr: "Offerte", tipo: "entrata", righe: [{ conto: "A02-01-01", dare: 300, avere: 0 }, { conto: "E01-04-05", dare: 0, avere: 300 }] },
];
const impostazioni = [
  { chiave: "parrocchia", valore: { nome: "Parrocchia di prova" } }, { chiave: "teatro", valore: { attivo: false } },
  { chiave: "unio-invii", valore: [] }, { chiave: "invio-rendiconto-2026", valore: { inviato: "2026-05-01" } },
  { chiave: "previsione-2026", valore: { E01: 100 } }, { chiave: "fornitore:123", valore: { voce: "U08-01-01" } },
  { chiave: "banca:rossi", valore: { scelte: [] } }, { chiave: "vecchia", valore: null },
];

test("azzera: lo scadenzario, con o senza le uscite delle fatture pagate", () => {
  const con = azzeraScadenzario({ movimenti, fatture });
  uguale(con.fatture.map((f) => [f.id, f.eliminato]), [["f1", true], ["f2", true]]);
  uguale(con.movimentiDaEliminare, ["fattura-f1-1"]);
  uguale(con.conta, { fatture: 2, pagate: 1, uscite: 1 });
  const senza = azzeraScadenzario({ movimenti, fatture }, { ancheUscite: false });
  uguale(senza.movimentiDaEliminare, []);
  uguale(senza.movimenti.length, 1);
  vero(!("fattura" in senza.movimenti[0]), "l'uscita resta, senza collegamento alla fattura che non c'è più");
});

test("azzera: ripartire da zero tiene parrocchia, impostazioni e (se scelto) i fornitori ricordati", () => {
  const r = ripartiDaZero({ movimenti, fatture, impostazioni }, { movimenti: true, fatture: true, unio: true, previsioni: true, ricordati: false }, tornaDaPagare);
  uguale(r.movimentiDaEliminare, ["fattura-f1-1", "m2"]);
  uguale(r.fatture.map((f) => f.id), ["f1", "f2"]);
  uguale(r.impostazioni.map((i) => i.chiave), ["unio-invii", "invio-rendiconto-2026", "previsione-2026"]);
  vero(r.impostazioni.every((i) => i.valore === null));
  const tutto = ripartiDaZero({ movimenti, fatture, impostazioni }, { movimenti: true, fatture: true, unio: true, previsioni: true, ricordati: true }, tornaDaPagare);
  uguale(tutto.impostazioni.map((i) => i.chiave), ["unio-invii", "invio-rendiconto-2026", "previsione-2026", "fornitore:123", "banca:rossi"]);
});

test("azzera: solo i movimenti, le fatture pagate tornano da pagare", () => {
  const r = ripartiDaZero({ movimenti, fatture, impostazioni }, { movimenti: true }, tornaDaPagare);
  uguale(r.movimentiDaEliminare.length, 2);
  uguale(r.fatture.map((f) => [f.id, f.rate[0].stato]), [["f1", "da pagare"]]);
  uguale(r.impostazioni, []);
  const soloFatture = ripartiDaZero({ movimenti, fatture, impostazioni }, { fatture: true }, tornaDaPagare);
  uguale(soloFatture.movimentiDaEliminare, []);
  uguale(soloFatture.movimenti.map((m) => m.id), ["fattura-f1-1"]);
});
