// Scambio con UNIO: CSV dei "saldi Patrimoniali e di Gestione" (stesso formato dell'esportazione UNIO)
// e confronto voce per voce.

import { VOCI, GRUPPI } from "./piano.js";
import { formatUNIO, parseEuro } from "./importi.js";

const SEZIONE = { A: "SITUAZIONE PATRIMONIALE", PAT: "SITUAZIONE PATRIMONIALE", P: "SITUAZIONE PATRIMONIALE", PG: "SITUAZIONE PATRIMONIALE",
  E: "RENDICONTO DI GESTIONE", U: "RENDICONTO DI GESTIONE" };

/** Voci nello stesso ordine del CSV di UNIO: patrimoniale (A, PAT, P, PG) e poi gestione (E, U). */
export const VOCI_UNIO = GRUPPI.filter((g) => SEZIONE[g.tipo]).flatMap((g) => g.voci);

/**
 * CSV identico a quello che UNIO esporta dalla pagina Rendiconto.
 * precedente: rendiconto dell'anno prima (facoltativo; se manca la colonna resta vuota).
 */
export function saldiCSV(rendiconto, { icsc = "", azienda = "A1", precedente = null } = {}) {
  const a = rendiconto.anno;
  const righe = [`Icsc;Azienda;Esercizio;Sezione;Gruppo;Conto;Descrizione;Anno corrente ${a};Anno precedente ${a - 1}`];
  for (const v of VOCI_UNIO) {
    const prec = precedente ? formatUNIO(precedente.voci.get(v.codice)) : "";
    righe.push(`${icsc};${azienda};${a};${SEZIONE[v.tipo]};${v.gruppo};${v.codice.slice(4)};${v.nome};${formatUNIO(rendiconto.voci.get(v.codice))};${prec};`);
  }
  return righe.join("\r\n") + "\r\n";
}

/**
 * Legge il CSV esportato da UNIO. Restituisce {ok, anno, icsc, voci: Map codiceVoce → {corrente, precedente}}
 * oppure {ok:false, errore}.
 */
export function leggiSaldiUNIO(testo) {
  const righe = String(testo).replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim());
  if (!righe.length || !/^Icsc;Azienda;Esercizio;Sezione;Gruppo;Conto/i.test(righe[0])) {
    return { ok: false, errore: "Questo file non è il CSV dei saldi esportato da UNIO (pagina Rendiconto → \"Esporta saldi Patrimoniali e di Gestione in .csv\")." };
  }
  const voci = new Map();
  let anno = null, icsc = "";
  for (const r of righe.slice(1)) {
    const c = r.split(";");
    if (c.length < 8) continue;
    const codice = `${c[4]}-${c[5]}`;
    const corrente = parseEuro(c[7]), precedente = c[8] ? parseEuro(c[8]) : null;
    if (Number.isNaN(corrente)) return { ok: false, errore: `Importo non leggibile per la voce ${codice}: «${c[7]}»` };
    voci.set(codice, { corrente, precedente: Number.isNaN(precedente) ? null : precedente });
    anno = Number(c[2]); icsc = c[0];
  }
  if (!voci.size) return { ok: false, errore: "Il file non contiene voci." };
  return { ok: true, anno, icsc, voci };
}

/** Confronto voce per voce: [{codice, nome, divisio, unio, uguale}] per tutte le voci presenti nel CSV di UNIO. */
export function confronta(rendiconto, saldiUNIO) {
  return VOCI.filter((v) => saldiUNIO.voci.has(v.codice)).map((v) => {
    const divisio = rendiconto.voci.get(v.codice), unio = saldiUNIO.voci.get(v.codice).corrente;
    return { codice: v.codice, nome: v.nome, divisio, unio, uguale: divisio === unio };
  });
}
