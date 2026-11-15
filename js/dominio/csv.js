// Esportazione CSV (separatore ";" e virgola decimale, come piace a Excel in italiano).

import { formatDecimale } from "./importi.js";

export function campoCSV(x) {
  const s = String(x ?? "");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const rigaCSV = (campi) => campi.map(campoCSV).join(";");

const dataIt = (d) => d.split("-").reverse().join("/");

/** Ordine di lettura: per data, poi per momento di inserimento. */
export const perData = (a, b) => a.data.localeCompare(b.data) || String(a.creatoIl ?? "").localeCompare(String(b.creatoIl ?? "")) || String(a.id).localeCompare(String(b.id));

/** Una riga per ogni riga di partita doppia, in ordine di data (i movimenti eliminati sono esclusi). */
export function movimentiCSV(movimenti, nomeConto) {
  const righe = [rigaCSV(["Data", "Descrizione", "Tipo", "Conto", "Nome conto", "Dare", "Avere", "Inserito da"])];
  for (const m of movimenti.filter((x) => !x.eliminato).sort(perData)) {
    for (const r of m.righe) {
      righe.push(rigaCSV([dataIt(m.data), m.descr, m.tipo, r.conto, nomeConto(r.conto), formatDecimale(r.dare), formatDecimale(r.avere), m.autore ?? ""]));
    }
  }
  return righe.join("\r\n") + "\r\n";
}
