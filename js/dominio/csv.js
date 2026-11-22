// Esportazione CSV (separatore ";" e virgola decimale, come piace a Excel in italiano).

import { formatDecimale } from "./importi.js";
import { analizza } from "./scritture.js";

export function campoCSV(x) {
  const s = String(x ?? "");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const rigaCSV = (campi) => campi.map(campoCSV).join(";");

const dataIt = (d) => d.split("-").reverse().join("/");

/** Ordine di lettura: per data, poi per momento di inserimento. */
export const perData = (a, b) => a.data.localeCompare(b.data) || String(a.creatoIl ?? "").localeCompare(String(b.creatoIl ?? "")) || String(a.id).localeCompare(String(b.id));

/**
 * Movimenti come entrate e uscite (non in partita doppia), per Excel: una riga per ogni voce del movimento,
 * così un movimento con più righe (es. tre funerali) mostra ogni dettaglio con il suo importo.
 * Gli spostamenti tra casse e banche e le altre registrazioni senza entrate né uscite hanno una colonna a parte.
 * In fondo, la riga dei totali. I movimenti eliminati sono esclusi.
 */
export function entrateUsciteCSV(movimenti, nomeConto) {
  const righe = [rigaCSV(["Data", "Causale", "Descrizione", "Dettaglio", "Voce", "Nome voce", "Cassa / banca", "Entrate", "Uscite", "Spostamenti e altro"])];
  let tE = 0, tU = 0, tA = 0;
  const importo = (c) => (c ? formatDecimale(c) : "");
  for (const m of movimenti.filter((x) => !x.eliminato).sort(perData)) {
    const a = analizza(m);
    const base = [dataIt(m.data), m.causale ?? "", m.descr];
    if (a.tipo === "entrata" || a.tipo === "uscita") {
      const casse = a.casse.map((r) => nomeConto(r.conto)).join(", ");
      for (const r of a.voci) {
        // Avere su una voce = soldi entrati, Dare = soldi usciti (vale anche per righe "al contrario", es. una commissione trattenuta)
        tE += r.avere; tU += r.dare;
        righe.push(rigaCSV([...base, r.nota ?? "", r.conto, nomeConto(r.conto), casse, importo(r.avere), importo(r.dare), ""]));
      }
    } else {
      const sposta = a.tipo === "spostamento";
      const voce = sposta ? "Spostamento" : a.tipo === "apertura" ? "Saldi di apertura" : `Senza cassa: ${[...new Set(a.voci.map((r) => nomeConto(r.conto)))].join(", ")}`;
      tA += a.importo;
      righe.push(rigaCSV([...base, "", "", voce, sposta ? `${nomeConto(a.da)} → ${nomeConto(a.verso)}` : "", "", "", importo(a.importo)]));
    }
  }
  righe.push(rigaCSV(["", "", "Totale", "", "", "", "", formatDecimale(tE), formatDecimale(tU), tA ? formatDecimale(tA) : ""]));
  return righe.join("\r\n") + "\r\n";
}
