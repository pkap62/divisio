// Due codici per la stessa banca (dati inventati, come nel caso UNIO A02-01-02 / Divisio A02-01-04).
import { test, uguale, vero } from "./mini.js";
import { unisciBanche, stessaBanca, banchePerUNIO, spostaBanca, banchePerUnire, bancheInutili } from "../js/dominio/unisciBanche.js";
import { verificaMovimento } from "../js/dominio/scritture.js";

const UNIO = "A02-01-02", DIVISIO = "A02-01-04", CASSA = "A02-01-01";
const conti = new Map([
  [CASSA, { codice: CASSA, nome: "Cassa", attivo: true }],
  [UNIO, { codice: UNIO, nome: "Banca Esempio", attivo: false, ordine: 108 }],
  ["A02-01-03", { codice: "A02-01-03", nome: "PayPal", attivo: true, ordine: 104 }],
  [DIVISIO, { codice: DIVISIO, nome: "Banco Esempio", attivo: true, ordine: 105 }],
]);
const uscita = (id, conto, imp, extra = {}) => ({ id, data: "2026-02-10", descr: id, tipo: "uscita", ...extra,
  righe: [{ conto: "U08-01-01", dare: imp, avere: 0 }, { conto, dare: 0, avere: imp }] });

test("banche: nomi diversi della stessa banca", () => {
  vero(stessaBanca("Banco BPM", "Banco BPM S.p.A."));
  vero(stessaBanca("Banca Esempio S.p.A.", "banco esempio"));
  vero(!stessaBanca("Banco BPM", "UniCredit"));
  vero(!stessaBanca("Banca Etica", "Banca di Cambiano"));
});

test("banche: unire due codici della stessa banca", () => {
  const movimenti = [
    uscita("da-unio", UNIO, 1000, { origine: "UNIO" }),
    uscita("da-estratto", DIVISIO, 2000, { banca: { cassa: DIVISIO, riga: "x", file: "f.csv" } }),
    uscita("in-cassa", CASSA, 300),
    { id: "giroconto", data: "2026-02-11", descr: "Giroconto", tipo: "spostamento", righe: [{ conto: UNIO, dare: 500, avere: 0 }, { conto: DIVISIO, dare: 0, avere: 500 }] },
    { id: "apertura-2026", data: "2026-01-01", descr: "Saldi di apertura", tipo: "apertura", righe: [
      { conto: CASSA, dare: 100, avere: 0 }, { conto: UNIO, dare: 700, avere: 0 }, { conto: DIVISIO, dare: 300, avere: 0 }, { conto: "P01-01-01", dare: 0, avere: 1100 }] },
  ];
  const fatture = [{ id: "f1", rate: [{ n: 1, cassa: DIVISIO, stato: "pagata" }] }, { id: "f2", rate: [{ n: 1, cassa: CASSA }] }];
  const impostazioni = [{ chiave: "banca:rossi", valore: { scelte: [{ tipo: "spostamento", altra: DIVISIO }] } }, { chiave: "formato-banca:x", valore: { cassa: DIVISIO } }];
  const u = unisciBanche({ conti, movimenti, fatture, impostazioni }, DIVISIO, UNIO, "Banco Esempio");

  uguale(u.conti[0], { codice: UNIO, nome: "Banco Esempio", attivo: true });
  uguale([u.conti[1].codice, u.conti[1].eliminato, u.conti[1].attivo], [DIVISIO, true, false]);
  uguale(u.movimenti.map((m) => m.id), ["da-estratto", "apertura-2026"]);
  const estratto = u.movimenti[0];
  uguale(estratto.righe[1].conto, UNIO);
  uguale(estratto.banca.cassa, UNIO, "così il prossimo estratto conto riconosce le righe già caricate");
  const ap = u.movimenti[1];
  uguale(ap.righe.filter((r) => r.conto === UNIO), [{ conto: UNIO, dare: 1000, avere: 0 }], "saldi di apertura sommati");
  uguale(verificaMovimento(ap), []);
  uguale(u.movimentiDaEliminare, ["giroconto"], "spostamento dalla banca a sé stessa");
  uguale(u.fatture.map((f) => f.rate[0].cassa), [UNIO]);
  uguale(u.impostazioni.map((i) => i.valore), [{ scelte: [{ tipo: "spostamento", altra: UNIO }] }, { cassa: UNIO }]);
  uguale(u.conta, { movimenti: 2, eliminati: 1, fatture: 1, impostazioni: 2 });
});

test("banche: avviso quando UNIO usa per una banca un altro codice", () => {
  const nomi = new Map([[UNIO, "Banco Esempio"], [CASSA, "Cassa"]]);
  const coppie = banchePerUNIO(nomi, conti, new Set([CASSA, UNIO, "E01-02-01"]));
  uguale(coppie.map((c) => [c.unio, c.divisio, c.proposta]), [[UNIO, DIVISIO, true]]);
  // stesso codice in uso in Divisio: nessun avviso
  const giusti = new Map([...conti, [UNIO, { codice: UNIO, nome: "Banco Esempio", attivo: true }]]);
  uguale(banchePerUNIO(nomi, giusti, new Set([CASSA, UNIO])), []);
  // nomi diversi: si mostrano le possibilità, senza spunta
  const altre = banchePerUNIO(new Map([[UNIO, "Banca Lontana"]]), conti, new Set([UNIO]));
  uguale(altre.map((c) => [c.divisio, c.proposta]), [["A02-01-03", false], [DIVISIO, false]]);
});

test("banche: il numero di UNIO è di un'altra banca in Divisio", () => {
  // in Divisio PayPal ha preso il 02 (aggiunto per primo); in UNIO il 02 è la banca
  const qui = new Map([[CASSA, conti.get(CASSA)], [UNIO, { codice: UNIO, nome: "PayPal", attivo: true, ordine: 1 }],
    ["A02-01-03", { codice: "A02-01-03", nome: "Banco Esempio", attivo: true, ordine: 2 }]]);
  const piano = banchePerUNIO(new Map([[UNIO, "Banco Esempio S.p.A."]]), qui, new Set([CASSA, UNIO]));
  uguale(piano.map((b) => [b.tipo, b.divisio, b.verso ?? b.unio, b.proposta]), [["sposta", UNIO, "A02-01-04", true], ["unisci", "A02-01-03", UNIO, true]]);
  // il numero lasciato libero non è uno di quelli usati da UNIO
  uguale(banchePerUNIO(new Map([[UNIO, "Banco Esempio"]]), qui, new Set([CASSA, UNIO, "A02-01-04"]))[0].verso, "A02-01-05");
  // nome generico in UNIO («Banca»): non si può dire che sia un'altra banca
  uguale(banchePerUNIO(new Map([[UNIO, "Banca c/c"]]), qui, new Set([UNIO])), []);
});

test("banche: spostare una banca a un numero libero", () => {
  const qui = new Map([[CASSA, conti.get(CASSA)], [UNIO, { codice: UNIO, nome: "PayPal", attivo: true, ordine: 1 }]]);
  const movimenti = [uscita("pp", UNIO, 900), uscita("contanti", CASSA, 50)];
  const fatture = [{ id: "f1", rate: [{ n: 1, cassa: UNIO, stato: "pagata" }] }];
  const s = spostaBanca({ conti: qui, movimenti, fatture, impostazioni: [] }, UNIO, "A02-01-04");
  uguale(s.conti.map((c) => [c.codice, c.nome, Boolean(c.eliminato)]), [["A02-01-04", "PayPal", false], [UNIO, "PayPal", true]]);
  uguale(s.movimenti.map((m) => [m.id, m.righe[1].conto]), [["pp", "A02-01-04"]]);
  uguale(s.fatture[0].rate[0].cassa, "A02-01-04");
});

test("banche: stessa banca con due numeri già in Divisio, unita da sola all'apertura", () => {
  const qui = new Map([[CASSA, conti.get(CASSA)], [UNIO, { codice: UNIO, nome: "Banco Esempio", attivo: false }],
    ["A02-01-03", { codice: "A02-01-03", nome: "PayPal", attivo: true }], [DIVISIO, { codice: DIVISIO, nome: "Banco Esempio S.p.A.", attivo: true }]]);
  const movimenti = [uscita("u", UNIO, 100, { origine: "UNIO" }), uscita("d", DIVISIO, 200), uscita("p", "A02-01-03", 5)];
  uguale(banchePerUnire(qui, movimenti), [{ da: DIVISIO, verso: UNIO, nome: "Banco Esempio S.p.A." }]);
  // se anche l'altra ha movimenti da UNIO non è il caso «aggiunta in Divisio»: non si tocca
  uguale(banchePerUnire(qui, [...movimenti, uscita("u2", DIVISIO, 1, { origine: "UNIO" })]), []);
  // nomi di banche diverse: niente
  uguale(banchePerUnire(new Map([...qui, [DIVISIO, { codice: DIVISIO, nome: "Banca Lontana", attivo: true }]]), movimenti), []);
});

test("banche: quelle non in uso e mai usate si tolgono, il numero torna libero", () => {
  const qui = new Map([[CASSA, conti.get(CASSA)], [UNIO, { codice: UNIO, nome: "Banca", attivo: false }],
    ["A02-01-03", { codice: "A02-01-03", nome: "PayPal", attivo: false }], [DIVISIO, { codice: DIVISIO, nome: "Vecchia", attivo: false }]]);
  const inutili = bancheInutili(qui, [uscita("p", "A02-01-03", 5)], [{ id: "f", rate: [{ n: 1, cassa: DIVISIO }] }]);
  uguale(inutili.map((c) => c.codice), [UNIO]);
});
