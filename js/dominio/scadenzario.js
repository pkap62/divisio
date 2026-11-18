// Scadenzario delle fatture e collegamento con la contabilità.
//
// Regola fondamentale: in contabilità entra SOLO una rata "pagata". Una rata "da pagare" non genera nulla.
// Ogni rata pagata ha (al massimo) un movimento collegato, con identificativo fisso "fattura-<id>-<rata>":
// - segnare pagata  → crea il movimento (stessa operazione);
// - tornare "da pagare" → elimina il movimento (stessa operazione);
// - se le due cose non coincidono (es. movimento eliminato da un altro computer) coerenza() lo segnala.

import { scritturaSemplice } from "./scritture.js";
import { nomeModalita } from "./fatture.js";

export const DA_PAGARE = "da pagare";
export const PAGATA = "pagata";
export const CONTO_TEATRO = "P02-05-04";   // Debiti diversi – Gestione teatro: solo per i pagamenti registrati prima della versione 0.8

/**
 * Divisione delle fatture (funzione facoltativa, spenta all'inizio). Tre scelte; quota = parte che NON è della parrocchia:
 *   0   della parrocchia               → entra tutta in contabilità
 *   100 del teatro o di altra gestione → non entra in contabilità
 *   50  al 50%                         → metà del totale (IVA compresa) entra in contabilità, l'altra metà no
 */
export const GESTIONI = [
  { quota: 0, nome: "Della parrocchia", spiega: "entra tutta in contabilità" },
  { quota: 100, nome: "Del teatro o di altra gestione", spiega: "non entra in contabilità" },
  { quota: 50, nome: "Al 50%", spiega: "metà dell'importo (IVA compresa) entra in contabilità" },
];
export const gestioneValida = (q) => q === 0 || q === 50 || q === 100;
export const nomeGestione = (q) => GESTIONI.find((g) => g.quota === q)?.nome ?? `Altra gestione ${q}%`;

const dataIt = (d) => (d ? d.split("-").reverse().join("/") : "");
const giorniTra = (da, a) => Math.round((Date.UTC(...a.split("-").map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...da.split("-").map((x, i) => (i === 1 ? x - 1 : +x)))) / 864e5);

/** Record dello scadenzario da una fattura letta (XML, PDF o scritta a mano). */
export function nuovaFattura(letta, { origine, nomeFile = "" } = {}) {
  const { avvisi, incerti, scansione, ...dati } = letta;
  return {
    ...dati, origine, nomeFile,
    note: (avvisi ?? []).join(" "),
    rate: dati.rate.map((r, i) => ({ n: i + 1, scadenza: r.scadenza || "", importo: r.importo, modalita: r.modalita || "", iban: r.iban || "", stato: DA_PAGARE })),
  };
}

export const idMovimento = (fattura, n) => `fattura-${fattura.id}-${n}`;

export function descrizione(f, rata) {
  const tipo = f.notaCredito ? "Nota di credito" : "Fattura";
  const r = f.rate.length > 1 ? ` – rata ${rata.n} di ${f.rate.length}` : "";
  return `${tipo} ${f.fornitore || "fornitore"} n. ${f.numero || "?"}${f.data ? " del " + dataIt(f.data) : ""}${r}`;
}

/** Parte del teatro e parte della parrocchia di un importo, con la percentuale del teatro (0–100). */
export function dividi(importo, quotaTeatro = 0) {
  const q = Math.min(100, Math.max(0, Number(quotaTeatro) || 0));
  const teatro = Math.round((importo * q) / 100);
  return { teatro, parrocchia: importo - teatro };
}

/**
 * Righe in partita doppia del pagamento di una rata.
 *  fattura:        Dare voce / Avere cassa o banca. Al 50%: solo la metà della parrocchia.
 *  nota di credito (rimborso): l'opposto, così la spesa diminuisce.
 *  Solo per i pagamenti registrati prima della 0.8 (contoTeatro indicato): la parte del teatro andava su quel conto.
 */
export function righePagamento(f, rata, { cassa, voce, quotaTeatro = 0, contoTeatro = "" }) {
  const { teatro, parrocchia } = dividi(rata.importo, quotaTeatro);
  if (!teatro) return scritturaSemplice({ tipo: f.notaCredito ? "entrata" : "uscita", importo: rata.importo, voce, cassa });
  if (!contoTeatro) return scritturaSemplice({ tipo: f.notaCredito ? "entrata" : "uscita", importo: parrocchia, voce, cassa });
  const costo = [];
  if (parrocchia) costo.push({ conto: voce, importo: parrocchia });
  costo.push({ conto: contoTeatro, importo: teatro });
  const righe = f.notaCredito
    ? [{ conto: cassa, dare: rata.importo, avere: 0 }, ...costo.map((c) => ({ conto: c.conto, dare: 0, avere: c.importo }))]
    : [...costo.map((c) => ({ conto: c.conto, dare: c.importo, avere: 0 })), { conto: cassa, dare: 0, avere: rata.importo }];
  return righe;
}

/**
 * Segna pagata la rata n. pagamento = {data, modalita, cassa, voce, quotaTeatro, contoTeatro, fuori}
 * fuori = true (o quota 100: del teatro o di altra gestione) → nessuna registrazione.
 * quota 50: si registra solo la metà della parrocchia.
 * Restituisce {fattura, movimento} (movimento = null se fuori dalla contabilità).
 */
export function segnaPagata(f, n, pagamento) {
  const rata = f.rate.find((r) => r.n === n);
  if (!rata) throw new Error("Rata inesistente.");
  if (rata.stato === PAGATA) throw new Error("Questa rata è già segnata come pagata.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagamento.data ?? "")) throw new Error("Manca la data del pagamento.");
  const quota = Math.min(100, Math.max(0, Number(pagamento.quotaTeatro) || 0));
  const contoTeatro = pagamento.contoTeatro || "";
  const fuori = Boolean(pagamento.fuori) || (quota >= 100 && !contoTeatro);
  if (!fuori && !pagamento.cassa) throw new Error("Indichi la cassa o la banca da cui è stata pagata.");
  if (!fuori && dividi(rata.importo, pagamento.quotaTeatro).parrocchia && !pagamento.voce) throw new Error("Scelga la voce di spesa.");
  if (!(rata.importo > 0)) throw new Error("L'importo della rata deve essere maggiore di zero.");

  const movimento = fuori ? null : {
    id: idMovimento(f, n), data: pagamento.data, descr: descrizione(f, rata) + (quota && !contoTeatro ? ` – quota della parrocchia ${100 - quota}%` : ""),
    tipo: f.notaCredito ? "entrata" : "uscita", origine: "fattura", fattura: { id: f.id, rata: n },
    righe: righePagamento(f, rata, pagamento),
  };
  const nuovaRata = { ...rata, stato: PAGATA, pagataIl: pagamento.data, modalitaPagamento: pagamento.modalita || rata.modalita || "",
    cassa: fuori ? "" : pagamento.cassa, voce: pagamento.voce || "", quotaTeatro: quota,
    contoTeatro, fuori, movimentoId: movimento?.id ?? null };
  return { fattura: { ...f, rate: f.rate.map((r) => (r.n === n ? nuovaRata : r)) }, movimento };
}

/** La rata torna "da pagare": restituisce {fattura, movimentoDaEliminare} (id o null). */
export function tornaDaPagare(f, n) {
  const rata = f.rate.find((r) => r.n === n);
  if (!rata) throw new Error("Rata inesistente.");
  const { stato, pagataIl, modalitaPagamento, cassa, voce, quotaTeatro, contoTeatro, fuori, movimentoId, ...resto } = rata;
  return { fattura: { ...f, rate: f.rate.map((r) => (r.n === n ? { ...resto, stato: DA_PAGARE } : r)) }, movimentoDaEliminare: movimentoId || null };
}

/**
 * Elenco delle rate per lo scadenzario: [{fattura, rata, giorni, urgenza}] ordinate per scadenza.
 * urgenza: "pagata" | "scaduta" | "presto" (entro 7 giorni) | "senza-data" | "normale"
 */
export function scadenze(fatture, oggi) {
  const out = [];
  for (const f of fatture) {
    if (f.eliminato) continue;
    for (const rata of f.rate) {
      let urgenza = "normale", giorni = null;
      if (rata.stato === PAGATA) urgenza = "pagata";
      else if (!rata.scadenza) urgenza = "senza-data";
      else {
        giorni = giorniTra(oggi, rata.scadenza);
        urgenza = giorni < 0 ? "scaduta" : giorni <= 7 ? "presto" : "normale";
      }
      out.push({ fattura: f, rata, giorni, urgenza });
    }
  }
  const chiave = (x) => (x.rata.stato === PAGATA ? "2" + (x.rata.pagataIl || "") : x.rata.scadenza ? "1" + x.rata.scadenza : "0");
  return out.sort((a, b) => chiave(a).localeCompare(chiave(b)) || a.fattura.fornitore.localeCompare(b.fattura.fornitore));
}

export function riepilogo(elenco) {
  const daPagare = elenco.filter((x) => x.rata.stato !== PAGATA);
  const somma = (l) => l.reduce((s, x) => s + (x.fattura.notaCredito ? 0 : x.rata.importo), 0);
  const scadute = daPagare.filter((x) => x.urgenza === "scaduta"), presto = daPagare.filter((x) => x.urgenza === "presto");
  return { daPagare: daPagare.length, totale: somma(daPagare), scadute: scadute.length, totaleScadute: somma(scadute), presto: presto.length, totalePresto: somma(presto),
    senzaData: daPagare.filter((x) => x.urgenza === "senza-data").length };
}

/**
 * Controlla che scadenzario e contabilità coincidano. movimento(id) → movimento valido o undefined.
 * Restituisce [{fattura, rata, problema, testo}].
 */
export function coerenza(fatture, movimento, movimentiConFattura = []) {
  const out = [];
  for (const f of fatture) {
    if (f.eliminato) continue;
    for (const rata of f.rate) {
      const id = idMovimento(f, rata.n);
      if (rata.stato === PAGATA && !rata.fuori && !movimento(id)) {
        out.push({ fattura: f, rata, problema: "manca", testo: `${descrizione(f, rata)} risulta pagata, ma la sua registrazione in contabilità non c'è più.` });
      }
      if (rata.stato !== PAGATA && movimento(id)) {
        out.push({ fattura: f, rata, problema: "in-piu", testo: `${descrizione(f, rata)} risulta da pagare, ma in contabilità c'è ancora la sua uscita.` });
      }
    }
  }
  // movimenti che puntano a fatture tolte dallo scadenzario
  const ids = new Set(fatture.filter((f) => !f.eliminato).map((f) => f.id));
  for (const m of movimentiConFattura) if (!ids.has(m.fattura.id)) out.push({ fattura: null, rata: null, movimento: m, problema: "orfano", testo: `Il movimento «${m.descr}» è collegato a una fattura che non è più nello scadenzario.` });
  return out;
}

export const testoModalita = (r) => nomeModalita(r.modalitaPagamento || r.modalita) || "—";
