import { test, uguale, vero } from "./mini.js";
import { scritturaSemplice, scritturaApertura } from "../js/dominio/scritture.js";
import { riepilogoAnno, totaliPerConto, saldo, movimentiAnno, saldiProgressivi } from "../js/dominio/saldi.js";

const CASSA = "A02-01-01", BANCA = "A02-01-02";
let id = 1;
const m = (data, tipo, args) => ({ id: id++, data, descr: "x", tipo, righe: tipo === "apertura" ? scritturaApertura(args) : scritturaSemplice({ tipo, ...args }) });

// Anno di esempio con risultati calcolati a mano.
const anno2026 = [
  m("2026-01-01", "apertura", [{ conto: CASSA, importo: 85000 }, { conto: BANCA, importo: 1240000 }, { conto: "PG1-01-08", importo: 30000 }]),
  m("2026-01-11", "entrata", { importo: 41000, voce: "E01-02-01", cassa: CASSA }),
  m("2026-01-18", "entrata", { importo: 15000, voce: "E01-03-05", cassa: CASSA }),
  m("2026-01-20", "uscita", { importo: 18640, voce: "U08-01-01", cassa: BANCA }),
  m("2026-02-05", "spostamento", { importo: 70000, da: CASSA, verso: BANCA }),
  m("2026-10-18", "entrata", { importo: 56000, voce: "PG1-01-08", cassa: CASSA }),
  m("2026-11-08", "uscita", { importo: 86000, voce: "PG1-01-08", cassa: BANCA }),
];
const altroAnno = [m("2025-12-31", "entrata", { importo: 99999, voce: "E01-02-01", cassa: CASSA })];

test("saldi delle casse", () => {
  const t = totaliPerConto(movimentiAnno([...anno2026, ...altroAnno], 2026));
  uguale(saldo(CASSA, t), 85000 + 41000 + 15000 - 70000 + 56000);   // 127.000
  uguale(saldo(BANCA, t), 1240000 - 18640 + 70000 - 86000);         // 1.205.360
  uguale(saldo("A02-01-03", t), 0);
});

test("riepilogo dell'anno: entrate, uscite, avanzo, collette", () => {
  const r = riepilogoAnno([...anno2026, ...altroAnno], 2026);
  uguale(r.entrate, 56000, "collette e funerale, non la colletta imperata");
  uguale(r.uscite, 18640);
  uguale(r.avanzo, 37360);
  uguale(r.colletteDaVersare, 0, "300 dell'anno prima + 560 raccolte − 860 versate");
  uguale(r.patrimonio, 85000 + 1240000 - 30000);
  vero(r.quadra);
});

test("i movimenti eliminati non contano", () => {
  const conEliminato = [...anno2026, { ...anno2026[1], id: 999, eliminato: true }];
  uguale(riepilogoAnno(conEliminato, 2026).entrate, riepilogoAnno(anno2026, 2026).entrate);
});

test("il riepilogo considera solo l'anno richiesto", () => {
  uguale(riepilogoAnno([...anno2026, ...altroAnno], 2025).entrate, 99999);
});

test("saldo progressivo di una cassa, movimento per movimento", () => {
  // l'apertura inserita per ultima viene comunque contata per prima
  const lista = [...anno2026.slice(1).reverse(), anno2026[0]];
  const cassa = saldiProgressivi(lista, CASSA);
  uguale([...cassa.values()], [85000, 126000, 141000, 71000, 127000]);
  uguale(cassa.has(anno2026[3].id), false, "l'uscita dalla banca non tocca la cassa");
  uguale(cassa.get(anno2026[6 - 1].id), 127000);
  const banca = saldiProgressivi(anno2026, BANCA);
  uguale([...banca.values()], [1240000, 1221360, 1291360, 1205360]);
  uguale(saldiProgressivi([{ ...anno2026[1], eliminato: true }], CASSA).size, 0, "gli eliminati non contano");
});
