// Possibili doppioni quando si caricano fatture o movimenti (da file della banca o da UNIO).
// I doppioni sicuri li riconoscono già le singole pagine (stessa fattura: stesso fornitore, numero e data;
// stesso movimento della banca: stessa banca, stesso importo, date vicine). Qui si cercano quelli PROBABILI:
//   stesso importo e stessa data, oppure stesso importo e stessa descrizione.
// La stessa descrizione conta solo a pochi giorni di distanza: le spese di ogni mese (stipendio, canoni)
// hanno spesso lo stesso importo e la stessa descrizione, ma non sono doppioni.
// Divisio avvisa e non carica il possibile doppione, a meno che l'utente dica che è diverso.

import { stessaFattura } from "./fatture.js";
import { diversoServizio, etichettaServizio } from "./servizi.js";
import { analizza } from "./scritture.js";
import { formatEuro as euro } from "./importi.js";

export const GIORNI_DESCRIZIONE = 10;

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const compatto = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const giorni = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 864e5 : Infinity);
const dataIt = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Due descrizioni che dicono la stessa cosa (uguali, o una contenuta nell'altra se abbastanza lunga). */
export function stessaDescrizione(a, b) {
  const x = compatto(a), y = compatto(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corta, lunga] = x.length <= y.length ? [x, y] : [y, x];
  return corta.length >= 12 && lunga.includes(corta);
}

/* ---------- fatture ---------- */

const soloCifreELettere = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const numeroSimile = (a, b) => {
  const x = soloCifreELettere(a), y = soloCifreELettere(b);
  return Boolean(x && y) && (x === y || (x.length >= 3 && y.endsWith(x)) || (y.length >= 3 && x.endsWith(y)));
};
const testoFattura = (f) => [f.descrizione, ...(f.righe ?? [])].join(" ");

/**
 * Perché la fattura a potrebbe essere la stessa di b (testo), oppure "" se sembrano diverse.
 * Non sono mai la stessa: partite IVA diverse, servizi o contatori diversi (luce e gas dello stesso fornitore), importi diversi.
 */
export function forseStessaFattura(a, b) {
  if (!a || !b || stessaFattura(a, b)) return "";
  if (!(a.totale > 0) || a.totale !== b.totale || Boolean(a.notaCredito) !== Boolean(b.notaCredito)) return "";
  if (a.piva && b.piva && compatto(a.piva) !== compatto(b.piva)) return "";
  if (diversoServizio(a, b)) return "";
  if (a.data && a.data === b.data) return "stesso importo e stessa data";
  if (numeroSimile(a.numero, b.numero) && giorni(a.data, b.data) <= 31) return "stesso importo e numero quasi uguale";
  if (stessaDescrizione(testoFattura(a), testoFattura(b)) && giorni(a.data, b.data) <= GIORNI_DESCRIZIONE) return "stesso importo e stessa descrizione";
  return "";
}

/** Prima fattura dell'elenco che potrebbe essere la stessa: {fattura, perche, testo} oppure null. */
export function trovaForseDoppione(f, elenco) {
  for (const x of elenco) {
    if (x.eliminato || x === f || (x.id && x.id === f.id)) continue;
    const perche = forseStessaFattura(f, x);
    if (perche) {
      const s = etichettaServizio(x.servizio);
      return { fattura: x, perche,
        testo: `Potrebbe essere un doppione (${perche}) di ${x.fornitore || "una fattura"} n. ${x.numero || "?"} del ${dataIt(x.data)}, ${euro(x.totale)}${s ? `, ${s}` : ""}.` };
    }
  }
  return null;
}

/* ---------- movimenti ---------- */

/**
 * Movimento di Divisio che potrebbe essere lo stesso di quello che si sta caricando.
 * nuovo: {data, importo (centesimi: + entrata, − uscita), descrizioni:[testi]}.
 * movimenti: quelli di Divisio da confrontare; esclusi: id da non considerare (già abbinati o appena caricati).
 * Restituisce {movimento, perche, testo} oppure null. Gli spostamenti e i saldi di apertura non si confrontano.
 */
export function trovaMovimentoSimile(nuovo, movimenti, { esclusi = new Set() } = {}) {
  if (!nuovo.importo) return null;
  let migliore = null;
  for (const m of movimenti) {
    if (m.eliminato || esclusi.has(m.id) || m.tipo === "apertura") continue;
    const a = analizza(m);
    if (!a.segno || a.segno * a.importo !== nuovo.importo) continue;
    const g = giorni(m.data, nuovo.data);
    let perche = "";
    if (m.data === nuovo.data) perche = "stesso importo e stessa data";
    else if (g <= GIORNI_DESCRIZIONE && (nuovo.descrizioni ?? []).some((d) => stessaDescrizione(d, m.descr))) perche = "stesso importo e stessa descrizione";
    if (!perche) continue;
    const punti = (perche.includes("data") ? 2 : 1) - g / 100;
    if (!migliore || punti > migliore.punti) migliore = { movimento: m, perche, punti };
  }
  if (!migliore) return null;
  const m = migliore.movimento;
  return { movimento: m, perche: migliore.perche,
    testo: `Potrebbe essere un doppione (${migliore.perche}): in Divisio c'è già «${m.descr}» del ${dataIt(m.data)}, ${euro(Math.abs(nuovo.importo))}.` };
}

/** Importo con il segno di un movimento (+ entrata, − uscita; 0 per spostamenti e simili). */
export const importoConSegno = (m) => { const a = analizza(m); return a.segno * a.importo; };
