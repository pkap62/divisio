// Possibili doppioni e servizi diversi dello stesso fornitore (dati inventati).
import { test, uguale, vero } from "./mini.js";
import { servizioDaTesto, diversoServizio, ricordoPer, ricordoAggiornato, chiaveServizio } from "../js/dominio/servizi.js";
import { forseStessaFattura, trovaForseDoppione, trovaMovimentoSimile, stessaDescrizione } from "../js/dominio/doppioni.js";
import { leggiFatturaPA } from "../js/dominio/fatture.js";
import { proponiVoce } from "../js/dominio/suggerimenti.js";
import { preparaRighe } from "../js/dominio/banca.js";
import { sottocontiIniziali } from "../js/dominio/piano.js";

const LUCE = { tipo: "luce", codice: "POD IT001E12345678" };
const GAS = { tipo: "gas", codice: "PDR 01234567890123" };
const fattura = (x) => ({ fornitore: "Energia Esempio S.p.A.", piva: "01234567890", numero: "1", data: "2026-03-10", totale: 12345, descrizione: "", righe: [], ...x });

test("servizi: luce e gas riconosciuti dal contatore, poi dalle unità di misura", () => {
  uguale(servizioDaTesto("Codice POD: IT001E12345678 – consumi"), LUCE);
  uguale(servizioDaTesto("PDR 01234567890123 Gas naturale"), GAS);
  uguale(servizioDaTesto("Punto di riconsegna (PDR): 01234567890123"), GAS);
  uguale(servizioDaTesto("POD IT001E12345678 e PDR 01234567890123")?.tipo, "luce e gas");
  uguale(servizioDaTesto("Consumo 350 kWh fascia F1"), { tipo: "luce", codice: "" });
  uguale(servizioDaTesto("Consumo 120 Smc"), { tipo: "gas", codice: "" });
  // la pubblicità "luce e gas" senza consumi non decide nulla
  uguale(servizioDaTesto("Scopri le nostre offerte luce e gas"), null);
  // un IBAN e una partita IVA non sono un POD
  uguale(servizioDaTesto("IBAN IT60X0542811101000000123456 P.IVA IT01234567890"), null);
});

test("servizi: fatture di servizi o contatori diversi non sono la stessa cosa", () => {
  vero(diversoServizio({ servizio: LUCE }, { servizio: GAS }));
  vero(diversoServizio({ servizio: LUCE }, { servizio: { tipo: "luce", codice: "POD IT001E87654321" } }));
  vero(!diversoServizio({ servizio: LUCE }, { servizio: LUCE }));
  vero(!diversoServizio({ servizio: LUCE }, { servizio: null }), "servizio sconosciuto: non si può dire");
  uguale(chiaveServizio({ servizio: { tipo: "gas", codice: "" } }), "gas");
});

test("servizi: lettura del contatore da una FatturaPA", () => {
  const xml = `<?xml version="1.0"?><p:FatturaElettronica><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
    <Anagrafica><Denominazione>Energia Esempio S.p.A.</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader>
    <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-03-10</Data><Numero>1</Numero><ImportoTotaleDocumento>123.45</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DettaglioLinee><Descrizione>Spesa per la materia gas naturale</Descrizione><PrezzoTotale>101.19</PrezzoTotale><AltriDatiGestionali><TipoDato>PDR</TipoDato><RiferimentoTesto>01234567890123</RiferimentoTesto></AltriDatiGestionali></DettaglioLinee></DatiBeniServizi>
    <Allegati><Attachment>SVQwMDFFMTIzNDU2Nzg=</Attachment></Allegati></FatturaElettronicaBody></p:FatturaElettronica>`;
  uguale(leggiFatturaPA(xml).fatture[0].servizio, GAS);
});

test("doppioni: fatture con stesso importo e stessa data", () => {
  const a = fattura({ numero: "100" });
  uguale(forseStessaFattura(fattura({ numero: "101" }), a), "stesso importo e stessa data");
  uguale(forseStessaFattura(fattura({ numero: "100" }), a), "", "è proprio la stessa fattura: la riconosce già trovaDoppione");
  uguale(forseStessaFattura(fattura({ numero: "101", totale: 999 }), a), "");
  uguale(forseStessaFattura(fattura({ numero: "101", piva: "99999999999" }), a), "", "partite IVA diverse");
  // numero letto male dal PDF, data diversa
  uguale(forseStessaFattura(fattura({ numero: "FT 100", data: "2026-03-12" }), a), "stesso importo e numero quasi uguale");
  // stessa descrizione: solo a pochi giorni di distanza (i canoni di ogni mese non sono doppioni)
  const canone = fattura({ numero: "7", data: "2026-01-31", descrizione: "Canone mensile assistenza software" });
  uguale(forseStessaFattura(fattura({ numero: "9", data: "2026-02-03", descrizione: "Canone mensile assistenza software" }), canone), "stesso importo e stessa descrizione");
  uguale(forseStessaFattura(fattura({ numero: "12", data: "2026-02-28", descrizione: "Canone mensile assistenza software" }), canone), "");
});

test("doppioni: luce e gas dello stesso fornitore non sono doppioni", () => {
  const luce = fattura({ numero: "500", servizio: LUCE });
  const gas = fattura({ numero: "501", servizio: GAS });
  uguale(forseStessaFattura(gas, luce), "");
  uguale(trovaForseDoppione(gas, [luce]), null);
  vero(trovaForseDoppione(fattura({ numero: "502", servizio: LUCE }), [luce, gas])?.fattura === luce);
});

test("servizi: voce ricordata per ogni servizio dello stesso fornitore", () => {
  const luce = fattura({ servizio: LUCE }), gas = fattura({ servizio: GAS });
  let r = ricordoAggiornato(undefined, luce, { voce: "U08-01-01", quotaTeatro: 50 });
  r = ricordoAggiornato(r, gas, { voce: "U08-01-02", quotaTeatro: 0 });
  uguale(ricordoPer(r, luce).voce, "U08-01-01");
  uguale(ricordoPer(r, luce).quotaTeatro, 50);
  uguale(ricordoPer(r, gas).voce, "U08-01-02");
  uguale(ricordoPer(r, gas).quotaTeatro, 0);
  // un contatore nuovo (per esempio un altro POD): non usa la scelta di un altro contatore
  uguale(ricordoPer(r, fattura({ servizio: { tipo: "acqua", codice: "" } })).voce, "");
  // ricordo vecchio, senza servizi, con la voce della luce: per il gas non va bene
  uguale(ricordoPer({ nome: "X", voce: "U08-01-01" }, gas).voce, "");
  uguale(ricordoPer({ nome: "X", voce: "U05-03-01" }, gas).voce, "U05-03-01");
  const attivi = new Set(sottocontiIniziali().map((c) => c.codice));
  const p = proponiVoce(gas, { ricordo: ricordoPer({ nome: "X", voce: "U08-01-01" }, { ...gas, descrizione: "gas naturale" }), contiAttivi: attivi });
  vero(p.voce !== "U08-01-01", "non propone la voce della luce per il gas");
});

test("doppioni: movimenti con stesso importo e stessa data o stessa descrizione", () => {
  const mov = (id, data, descr, importo, cassa = "A02-01-01") => ({ id, data, descr, tipo: "uscita",
    righe: [{ conto: "U08-01-01", dare: importo, avere: 0 }, { conto: cassa, dare: 0, avere: importo }] });
  const elenco = [mov("a", "2026-03-10", "Bolletta luce", 5000), mov("b", "2026-01-31", "Stipendio colf", 40000)];
  uguale(trovaMovimentoSimile({ data: "2026-03-10", importo: -5000, descrizioni: ["Pagamento"] }, elenco)?.movimento.id, "a");
  uguale(trovaMovimentoSimile({ data: "2026-03-10", importo: 5000, descrizioni: [] }, elenco), null, "un'entrata non è un'uscita");
  uguale(trovaMovimentoSimile({ data: "2026-02-03", importo: -40000, descrizioni: ["Stipendio COLF"] }, elenco)?.perche, "stesso importo e stessa descrizione");
  uguale(trovaMovimentoSimile({ data: "2026-02-28", importo: -40000, descrizioni: ["Stipendio colf"] }, elenco), null, "un mese dopo: è lo stipendio del mese nuovo");
  uguale(trovaMovimentoSimile({ data: "2026-03-10", importo: -5000, descrizioni: [] }, elenco, { esclusi: new Set(["a"]) }), null);
  vero(stessaDescrizione("Bonifico a favore di Mario Rossi", "BONIFICO A FAVORE DI MARIO ROSSI CRO 123"));
  vero(!stessaDescrizione("Luce", "Luce chiesa"), "parole troppo corte");
});

test("doppioni: estratto conto, movimento già registrato in un'altra cassa", () => {
  const BANCA = "A02-01-02";
  const attivi = new Set([...sottocontiIniziali().map((c) => c.codice), BANCA]);
  const inCassa = { id: "m1", data: "2026-03-10", descr: "Bolletta luce", tipo: "uscita",
    righe: [{ conto: "U08-01-01", dare: 5000, avere: 0 }, { conto: "A02-01-01", dare: 0, avere: 5000 }] };
  const [p] = preparaRighe([{ data: "2026-03-10", importo: -5000, descrizione: "ADDEBITO SDD ENERGIA ESEMPIO" }],
    { cassa: BANCA, movimenti: [inCassa], contiAttivi: attivi, casse: ["A02-01-01", BANCA] });
  uguale(p.stato, "forse-doppione");
  uguale(p.includi, false);
  uguale(p.giaRegistrato.id, "m1");
});
