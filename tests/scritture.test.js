import { test, uguale, vero, contiene, casuale } from "./mini.js";
import { scritturaSemplice, scritturaApertura, verificaMovimento, quadra, totaliRighe, analizza, CONTO_PATRIMONIO } from "../js/dominio/scritture.js";
import { riepilogoAnno } from "../js/dominio/saldi.js";
import { sottocontiIniziali, isCassaBanca, tipoDi } from "../js/dominio/piano.js";

const CASSA = "A02-01-01", BANCA = "A02-01-02";
// Di partenza c'è solo la cassa: per le prove si aggiunge una banca, come farebbe la parrocchia.
const conti = new Map([...sottocontiIniziali(), { codice: "A02-01-02", nome: "Banca di prova", attivo: true }].map((c) => [c.codice, c]));
const mov = (tipo, righe, extra = {}) => ({ data: "2026-03-01", descr: "prova", tipo, righe, ...extra });

test("entrata: Dare cassa / Avere voce", () => {
  const r = scritturaSemplice({ tipo: "entrata", importo: 5000, voce: "E01-03-05", cassa: CASSA });
  uguale(r, [{ conto: CASSA, dare: 5000, avere: 0 }, { conto: "E01-03-05", dare: 0, avere: 5000 }]);
  vero(quadra(r));
});

test("uscita: Dare voce / Avere banca", () => {
  const r = scritturaSemplice({ tipo: "uscita", importo: 18640, voce: "U08-01-01", cassa: BANCA });
  uguale(r, [{ conto: "U08-01-01", dare: 18640, avere: 0 }, { conto: BANCA, dare: 0, avere: 18640 }]);
  vero(quadra(r));
});

test("spostamento: Dare conto che riceve / Avere conto da cui escono", () => {
  const r = scritturaSemplice({ tipo: "spostamento", importo: 70000, da: CASSA, verso: BANCA });
  uguale(r, [{ conto: BANCA, dare: 70000, avere: 0 }, { conto: CASSA, dare: 0, avere: 70000 }]);
});

test("colletta imperata: raccolta e versamento si annullano sul debito verso la Diocesi", () => {
  const ms = [
    mov("entrata", scritturaSemplice({ tipo: "entrata", importo: 56000, voce: "PG1-01-08", cassa: CASSA })),
    mov("uscita", scritturaSemplice({ tipo: "uscita", importo: 56000, voce: "PG1-01-08", cassa: BANCA })),
  ];
  const r = riepilogoAnno(ms, 2026);
  uguale(r.colletteDaVersare, 0);
  uguale(r.entrate, 0, "una colletta imperata non è un'entrata della parrocchia");
});

test("verifica: un movimento corretto non ha errori", () => {
  const m = mov("entrata", scritturaSemplice({ tipo: "entrata", importo: 100, voce: "E01-02-01", cassa: CASSA }));
  uguale(verificaMovimento(m, { conti, anno: 2026 }), []);
});

test("verifica: Dare diverso da Avere viene rifiutato", () => {
  const m = mov("pd", [{ conto: "U08-01-01", dare: 10000, avere: 0 }, { conto: BANCA, dare: 0, avere: 8000 }]);
  contiene(verificaMovimento(m, { conti }), "mancano 20,00 € in Avere");
});

test("verifica: tutti gli altri errori", () => {
  const ok = [{ conto: CASSA, dare: 100, avere: 0 }, { conto: "E01-02-01", dare: 0, avere: 100 }];
  contiene(verificaMovimento({ ...mov("entrata", ok), descr: "  " }), "descrizione");
  contiene(verificaMovimento({ ...mov("entrata", ok), data: "" }), "data");
  contiene(verificaMovimento(mov("entrata", ok), { anno: 2025 }), "nell'anno 2025");
  contiene(verificaMovimento(mov("pd", [ok[0]])), "almeno due righe");
  contiene(verificaMovimento(mov("pd", [{ conto: "X99-01-01", dare: 100, avere: 0 }, ok[1]])), "non esiste");
  contiene(verificaMovimento(mov("pd", [{ conto: "U08-01-99", dare: 100, avere: 0 }, ok[1]]), { conti }), "non esiste");
  contiene(verificaMovimento(mov("pd", [{ conto: CASSA, dare: 100, avere: 100 }, ok[1], { conto: "E01-02-02", dare: 0, avere: 0 }])), "sia Dare sia Avere");
  contiene(verificaMovimento(mov("pd", [...ok, { conto: "E01-02-02", dare: 0, avere: 0 }])), "senza importo");
  contiene(verificaMovimento(mov("pd", [{ conto: CASSA, dare: 10.5, avere: 0 }, ok[1]])), "non valido");
  contiene(verificaMovimento(mov("pd", [{ conto: CASSA, dare: -100, avere: 0 }, { conto: "E01-02-01", dare: -100, avere: 0 }])), "non valido");
  contiene(verificaMovimento(mov("spostamento", scritturaSemplice({ tipo: "spostamento", importo: 100, da: CASSA, verso: CASSA }))), "due conti diversi");
  contiene(verificaMovimento(mov("entrata", [{ conto: "A03-03-02", dare: 100, avere: 0 }, ok[1]])), "cassa o la banca");
});

test("apertura: la differenza va nel Patrimonio netto", () => {
  const r = scritturaApertura([{ conto: CASSA, importo: 85000 }, { conto: BANCA, importo: 1240000 }, { conto: "PG1-01-08", importo: 30000 }]);
  vero(quadra(r));
  uguale(r.find((x) => x.conto === CONTO_PATRIMONIO), { conto: CONTO_PATRIMONIO, dare: 0, avere: 1295000 });
  uguale(r.find((x) => x.conto === "PG1-01-08"), { conto: "PG1-01-08", dare: 0, avere: 30000 });
});

test("apertura: banca in rosso e patrimonio negativo restano in quadratura", () => {
  const r = scritturaApertura([{ conto: BANCA, importo: -50000 }, { conto: "P02-05-03", importo: 10000 }]);
  vero(quadra(r));
  uguale(r, [
    { conto: BANCA, dare: 0, avere: 50000 },
    { conto: "P02-05-03", dare: 0, avere: 10000 },
    { conto: CONTO_PATRIMONIO, dare: 60000, avere: 0 },
  ]);
  uguale(scritturaApertura([{ conto: CASSA, importo: 0 }]), [], "importi a zero ignorati");
});

test("analizza: tipo e importo per gli elenchi", () => {
  uguale(analizza(mov("entrata", scritturaSemplice({ tipo: "entrata", importo: 500, voce: "E01-02-01", cassa: CASSA }))).segno, 1);
  const u = analizza(mov("uscita", scritturaSemplice({ tipo: "uscita", importo: 500, voce: "U08-01-01", cassa: BANCA })));
  uguale([u.tipo, u.importo, u.segno], ["uscita", 500, -1]);
  const s = analizza(mov("spostamento", scritturaSemplice({ tipo: "spostamento", importo: 700, da: CASSA, verso: BANCA })));
  uguale([s.tipo, s.importo, s.da, s.verso], ["spostamento", 700, CASSA, BANCA]);
  uguale(analizza(mov("pd", [{ conto: "U10-01-01", dare: 900, avere: 0 }, { conto: "P03-01-01", dare: 0, avere: 900 }])).tipo, "senzaCassa");
});

test("quadratura su 2000 movimenti casuali: Dare = Avere e stato patrimoniale in equilibrio", () => {
  const rnd = casuale(7);
  const tutti = [...conti.keys()];
  const casse = tutti.filter(isCassaBanca);
  const voci = { entrata: tutti.filter((c) => tipoDi(c) !== "U" && !isCassaBanca(c) && tipoDi(c) !== "PAT"),
                 uscita: tutti.filter((c) => tipoDi(c) !== "E" && !isCassaBanca(c) && tipoDi(c) !== "PAT") };
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const ms = [{ ...mov("apertura", scritturaApertura([{ conto: CASSA, importo: 85000 }, { conto: BANCA, importo: -1200 }, { conto: "PG1-01-03", importo: 30000 }])), data: "2026-01-01" }];
  for (let i = 0; i < 2000; i++) {
    const tipo = pick(["entrata", "uscita", "spostamento", "pd"]);
    const importo = 1 + Math.floor(rnd() * 500000);
    let righe;
    if (tipo === "pd") {
      const a = 1 + Math.floor(rnd() * 100000), b = 1 + Math.floor(rnd() * 100000);
      righe = [{ conto: pick(tutti), dare: a + b, avere: 0 }, { conto: pick(tutti), dare: 0, avere: a }, { conto: pick(tutti), dare: 0, avere: b }];
    } else if (tipo === "spostamento") {
      const da = pick(casse); righe = scritturaSemplice({ tipo, importo, da, verso: pick(casse.filter((c) => c !== da)) });
    } else righe = scritturaSemplice({ tipo, importo, voce: pick(voci[tipo]), cassa: pick(casse) });
    const m = { id: i + 2, data: `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-15`, descr: `mov ${i}`, tipo, righe };
    uguale(verificaMovimento(m, { conti, anno: 2026 }), [], `movimento ${i}`);
    ms.push(m);
  }
  const t = totaliRighe(ms.flatMap((m) => m.righe));
  uguale(t.dare, t.avere, "somma Dare = somma Avere");
  const r = riepilogoAnno(ms, 2026);
  vero(r.quadra, `Attività ${r.attivita} ≠ Passività ${r.passivita} + Patrimonio ${r.patrimonio} + Avanzo ${r.avanzo}`);
});

test("cassa e banche nell'ordine in cui sono state aggiunte, PayPal non più al secondo posto", async () => {
  const { casseInOrdine, prossimoOrdineCassa } = await import("../js/dominio/piano.js");
  const nomi = (cs) => casseInOrdine(cs).map((c) => c.nome);
  const conti = [{ codice: "A02-01-03", nome: "PayPal" }, { codice: "A02-01-02", nome: "Banca" }, { codice: "A02-01-01", nome: "Cassa" }];
  // Dati di prima: PayPal già in uso, senza "ordine" → dopo le banche.
  conti.push({ codice: "A02-01-04", nome: "Intesa" });
  uguale(nomi(conti), ["Cassa", "Banca", "Intesa", "PayPal"]);
  // Una banca aggiunta dopo PayPal va in fondo.
  conti.push({ codice: "A02-01-05", nome: "BancoPosta", ordine: prossimoOrdineCassa(conti) });
  uguale(nomi(conti), ["Cassa", "Banca", "Intesa", "PayPal", "BancoPosta"]);
  // PayPal rimesso in uso adesso: ultimo. La cassa resta sempre prima.
  conti[0] = { ...conti[0], ordine: prossimoOrdineCassa(conti) };
  uguale(nomi(conti), ["Cassa", "Banca", "Intesa", "BancoPosta", "PayPal"]);
  vero(!casseInOrdine([{ codice: "E01-02-01", nome: "x" }]).length, "solo casse e banche");
});

test("di partenza solo la cassa; le banche prendono i numeri man mano (02, 03…)", async () => {
  const { nuovoCodiceSottoconto } = await import("../js/dominio/piano.js");
  uguale(sottocontiIniziali().filter((c) => isCassaBanca(c.codice)).map((c) => c.nome), ["Cassa"]);
  const codici = sottocontiIniziali().map((c) => c.codice);
  uguale(nuovoCodiceSottoconto("A02-01", codici), "A02-01-02");
  uguale(nuovoCodiceSottoconto("A02-01", [...codici, "A02-01-02"]), "A02-01-03");
});

test("vecchi 'Banca' e 'PayPal' predefiniti: tolti solo se mai toccati né usati", async () => {
  const { cassePredefiniteDaTogliere, contiVisibili } = await import("../js/dominio/piano.js");
  const O = "2000-01-01T00:00:00.000Z";
  const conti = new Map([
    ["A02-01-01", { codice: "A02-01-01", nome: "Cassa", modificatoIl: O }],
    ["A02-01-02", { codice: "A02-01-02", nome: "Banca", modificatoIl: O }],
    ["A02-01-03", { codice: "A02-01-03", nome: "PayPal", attivo: false, modificatoIl: O }],
  ]);
  const codici = (l) => l.map((c) => c.codice);
  uguale(codici(cassePredefiniteDaTogliere(conti, [], O)), ["A02-01-02", "A02-01-03"]);
  // Usata in un movimento (anche nei saldi di apertura): resta.
  const usa = [{ righe: [{ conto: "A02-01-02" }, { conto: "E01-02-01" }] }];
  uguale(codici(cassePredefiniteDaTogliere(conti, usa, O)), ["A02-01-03"]);
  // Movimento eliminato: non conta.
  uguale(codici(cassePredefiniteDaTogliere(conti, [{ ...usa[0], eliminato: true }], O)), ["A02-01-02", "A02-01-03"]);
  // Rinominata dalla parrocchia: resta.
  conti.set("A02-01-02", { ...conti.get("A02-01-02"), nome: "Intesa", modificatoIl: "2026-05-01T10:00:00.000Z" });
  uguale(codici(cassePredefiniteDaTogliere(conti, [], O)), ["A02-01-03"]);
  // I tolti non si vedono, a meno che un movimento (es. da un altro computer) li usi.
  conti.set("A02-01-03", { ...conti.get("A02-01-03"), eliminato: true });
  uguale([...contiVisibili(conti, []).keys()], ["A02-01-01", "A02-01-02"]);
  uguale([...contiVisibili(conti, [{ righe: [{ conto: "A02-01-03" }] }]).keys()], ["A02-01-01", "A02-01-02", "A02-01-03"]);
});
