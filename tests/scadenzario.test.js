import { test, uguale, vero, contiene } from "./mini.js";
import { leggiFatturaPA } from "../js/dominio/fatture.js";
import { nuovaFattura, segnaPagata, tornaDaPagare, scadenze, riepilogo, coerenza, dividi, idMovimento, PAGATA, DA_PAGARE } from "../js/dominio/scadenzario.js";
import { proponiVoce, propostaTeatro } from "../js/dominio/suggerimenti.js";
import { verificaMovimento, quadra } from "../js/dominio/scritture.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";
import { creaBackup, leggiBackup } from "../js/dominio/backup.js";
import { unisciDati } from "../js/dominio/unione.js";
import { riepilogoAnno } from "../js/dominio/saldi.js";
import { FIORI, LUCE_RATE, NOTA_CREDITO } from "./esempi/esempi.js";

const conti = new Map([...sottocontiIniziali(), { codice: "A02-01-02", nome: "Banca di prova", attivo: true }].map((c) => [c.codice, c]));   // cassa + una banca aggiunta
const fattura = (xml, id) => ({ ...nuovaFattura(leggiFatturaPA(xml).fatture[0], { origine: "xml" }), id });
const BANCA = "A02-01-02", CASSA = "A02-01-01";

test("scadenzario: una fattura importata è 'da pagare' e non genera registrazioni", () => {
  const f = fattura(FIORI, "f1");
  uguale(f.rate.map((r) => r.stato), [DA_PAGARE]);
  uguale(coerenza([f], () => undefined), [], "nessun movimento atteso");
});

test("scadenzario: segnare pagata crea UNA uscita in quadratura sulla banca", () => {
  const f = fattura(FIORI, "f1");
  const { fattura: pagata, movimento } = segnaPagata(f, 1, { data: "2026-11-20", cassa: BANCA, voce: "U01-02-02", modalita: "MP05" });
  uguale(pagata.rate[0].stato, PAGATA);
  uguale(movimento.id, idMovimento(f, 1));
  uguale(movimento.righe, [{ conto: "U01-02-02", dare: 14640, avere: 0 }, { conto: BANCA, dare: 0, avere: 14640 }]);
  uguale(verificaMovimento(movimento, { conti, anno: 2026 }), []);
  contiene([movimento.descr], "Fattura Fioreria Esempio");
  const tutti = new Map([[movimento.id, movimento]]);
  uguale(coerenza([pagata], (id) => tutti.get(id)), []);
  uguale(riepilogoAnno([movimento], 2026).uscite, 14640, "la spesa entra nel Rendiconto");
});

test("scadenzario: senza cassa, voce o data non si può segnare pagata", () => {
  const f = fattura(FIORI, "f1");
  const prova = (p) => { try { segnaPagata(f, 1, p); return ""; } catch (e) { return e.message; } };
  contiene([prova({ data: "2026-11-20", voce: "U01-02-02" })], "cassa o la banca");
  contiene([prova({ data: "2026-11-20", cassa: BANCA })], "voce");
  contiene([prova({ cassa: BANCA, voce: "U01-02-02" })], "data");
});

test("scadenzario: tornare 'da pagare' indica l'uscita da togliere; se resta, viene segnalato", () => {
  const f = fattura(FIORI, "f1");
  const { fattura: pagata, movimento } = segnaPagata(f, 1, { data: "2026-11-20", cassa: BANCA, voce: "U01-02-02" });
  const { fattura: diNuovo, movimentoDaEliminare } = tornaDaPagare(pagata, 1);
  uguale(movimentoDaEliminare, movimento.id);
  uguale(diNuovo.rate[0], f.rate[0], "la rata torna com'era");
  contiene(coerenza([diNuovo], (id) => (id === movimento.id ? movimento : undefined)).map((x) => x.problema), "in-piu");
});

test("scadenzario: uscita eliminata a parte (es. da un altro computer) → segnalata", () => {
  const { fattura: pagata } = segnaPagata(fattura(FIORI, "f1"), 1, { data: "2026-11-20", cassa: BANCA, voce: "U01-02-02" });
  const p = coerenza([pagata], () => undefined);
  uguale(p.map((x) => x.problema), ["manca"]);
  contiene([p[0].testo], "non c'è più");
});

test("scadenzario: rate pagate una per volta, ognuna con la sua data", () => {
  let f = fattura(LUCE_RATE, "f2");
  const r1 = segnaPagata(f, 1, { data: "2026-11-05", cassa: BANCA, voce: "U08-01-01" });
  f = r1.fattura;
  uguale(f.rate.map((r) => r.stato), [PAGATA, DA_PAGARE]);
  const r2 = segnaPagata(f, 2, { data: "2026-12-05", cassa: BANCA, voce: "U08-01-01" });
  uguale([r1.movimento.data, r2.movimento.data, r1.movimento.righe[0].dare, r2.movimento.righe[0].dare], ["2026-11-05", "2026-12-05", 30500, 30500]);
  vero(r1.movimento.id !== r2.movimento.id);
  contiene([r2.movimento.descr], "rata 2 di 2");
});

test("scadenzario: nota di credito rimborsata riduce la spesa", () => {
  const f = fattura(NOTA_CREDITO, "nc");
  const { movimento } = segnaPagata(f, 1, { data: "2026-11-25", cassa: CASSA, voce: "U01-02-02" });
  uguale(movimento.righe, [{ conto: CASSA, dare: 2440, avere: 0 }, { conto: "U01-02-02", dare: 0, avere: 2440 }]);
  uguale(riepilogoAnno([movimento], 2026).uscite, -2440);
});

test("teatro: quota divisa al centesimo, parte del teatro su 'Gestione teatro'", () => {
  uguale(dividi(30501, 50), { teatro: 15251, parrocchia: 15250 });
  uguale(dividi(1000, 0), { teatro: 0, parrocchia: 1000 });
  const f = fattura(LUCE_RATE, "f2");
  const { movimento } = segnaPagata(f, 1, { data: "2026-11-05", cassa: BANCA, voce: "U08-01-01", quotaTeatro: 50 });
  uguale(movimento.righe, [{ conto: "U08-01-01", dare: 15250, avere: 0 }, { conto: "P02-05-04", dare: 15250, avere: 0 }, { conto: BANCA, dare: 0, avere: 30500 }]);
  vero(quadra(movimento.righe));
  uguale(verificaMovimento(movimento, { conti }), []);
  uguale(riepilogoAnno([movimento], 2026).uscite, 15250, "nel Rendiconto entra solo la parte della parrocchia");
});

test("teatro: tutta del teatro e pagata dal conto del teatro → nessuna registrazione", () => {
  const f = fattura(LUCE_RATE, "f2");
  const { fattura: pagata, movimento } = segnaPagata(f, 1, { data: "2026-11-05", fuori: true, quotaTeatro: 100 });
  uguale(movimento, null);
  vero(pagata.rate[0].fuori);
  uguale(coerenza([pagata], () => undefined), [], "non manca nulla: era fuori dalla contabilità");
  const tutta = segnaPagata(f, 1, { data: "2026-11-05", cassa: BANCA, quotaTeatro: 100 }).movimento;
  uguale(tutta.righe, [{ conto: "P02-05-04", dare: 30500, avere: 0 }, { conto: BANCA, dare: 0, avere: 30500 }], "pagata dalla banca della parrocchia: senza voce di spesa");
});

test("scadenzario: ordine per scadenza, scadute e in arrivo, totali", () => {
  const a = fattura(FIORI, "a"), b = fattura(LUCE_RATE, "b"), c = fattura(NOTA_CREDITO, "c");
  const el = scadenze([a, b, c], "2026-11-27");
  uguale(el.map((x) => [x.fattura.id, x.rata.n, x.urgenza]), [["c", 1, "senza-data"], ["b", 1, "scaduta"], ["a", 1, "presto"], ["b", 2, "normale"]]);
  const r = riepilogo(el);
  uguale([r.daPagare, r.scadute, r.presto, r.totale], [4, 1, 1, 14640 + 61000], "le note di credito non si sommano al da pagare");
});

test("copia di sicurezza e condivisione: le fatture viaggiano con gli altri dati", () => {
  const f = { ...fattura(FIORI, "f1"), modificatoIl: "2026-11-16T10:00:00.000Z" };
  const d = { conti: sottocontiIniziali(), movimenti: [], impostazioni: [], fatture: [f] };
  const r = leggiBackup(JSON.stringify(creaBackup(d)));
  vero(r.ok, JSON.stringify(r.errori));
  uguale(r.dati.fatture, [f]);
  // una copia fatta con la 0.5 (senza fatture) si legge ancora
  const vecchia = leggiBackup(JSON.stringify({ app: "Divisio", formato: 1, salvatoIl: "2026-11-01T00:00:00Z", dati: { conti: d.conti, movimenti: [], impostazioni: [] } }));
  vero(vecchia.ok);
  uguale(vecchia.dati.fatture, []);
  // l'unione tiene la modifica più recente anche per le fatture
  const pagata = { ...segnaPagata(f, 1, { data: "2026-11-20", cassa: BANCA, voce: "U01-02-02" }).fattura, modificatoIl: "2026-11-16T11:00:00.000Z" };
  uguale(unisciDati({ fatture: [f] }, { fatture: [pagata] }).fatture, [pagata]);
  uguale(unisciDati({ fatture: [pagata] }, { fatture: [f] }).fatture, [pagata]);
});

/* ---------- proposta della voce ---------- */
const attivi = new Set([...conti.keys()]);

test("proposta della voce: prima la scelta ricordata, poi lo storico, poi le parole", () => {
  const f = fattura(FIORI, "f1");
  uguale(proponiVoce(f, { ricordo: { voce: "U01-01-05" }, contiAttivi: attivi }).livello, "ricordato");
  const vecchia = { ...f, id: "v", rate: [{ ...f.rate[0], stato: PAGATA, voce: "U01-01-05" }] };
  uguale(proponiVoce(f, { pagate: [vecchia], contiAttivi: attivi }).voce, "U01-01-05");
  const p = proponiVoce(f, { contiAttivi: attivi });
  uguale([p.voce, p.livello], ["U01-02-02", "parole"]);
  contiene([p.motivo], "fiori");
});

test("proposta della voce: luce e caldaia riconosciute; nessuna proposta se non è chiaro", () => {
  uguale(proponiVoce(fattura(LUCE_RATE, "l"), { contiAttivi: attivi }).voce, "U08-01-01");
  uguale(proponiVoce({ fornitore: "Idraulica Prova", descrizione: "Riparazione caldaia", righe: [] }, { contiAttivi: attivi }).voce, "U05-03-01");
  const nulla = proponiVoce({ fornitore: "Ditta Generica", descrizione: "Servizi vari", righe: [] }, { contiAttivi: attivi });
  uguale([nulla.voce, nulla.livello], ["", "nessuno"]);
  const due = proponiVoce({ fornitore: "Multiservizi", descrizione: "luce e telefono", righe: [] }, { contiAttivi: attivi });
  uguale(due.voce, "", "più voci possibili: chiede");
  uguale(proponiVoce({ fornitore: "Fioreria", descrizione: "fiori", righe: [] }, { contiAttivi: new Set(["U08-01-01"]) }).voce, "", "non propone voci fuori uso");
});

test("teatro: proposta dalla scelta ricordata o dalle parole; altrimenti chiede", () => {
  const luce = fattura(LUCE_RATE, "l");
  uguale(propostaTeatro(luce, { ricordo: { quotaTeatro: 50 } }), { quota: 50, motivo: "Per Energia Esempio S.p.A. l'ultima volta il 50% era del teatro.", chiedi: false });
  const p = propostaTeatro(luce, { parole: ["Sala della Comunita"] });
  uguale([p.quota, p.chiedi], [100, true]);
  uguale(propostaTeatro(fattura(FIORI, "f"), { parole: ["Sala della Comunità"] }).chiedi, true);
  uguale(propostaTeatro(fattura(FIORI, "f"), { parole: ["Sala della Comunità"] }).quota, 0);
});
