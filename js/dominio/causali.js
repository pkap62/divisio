// Causale del movimento, come in UNIO (facoltativa, si accende in Impostazioni).
// In UNIO ogni registrazione ha tre testi: Causale ("Tipologia operazione" sullo schermo),
// Commento ("Descrizione") e Commento riga ("Descrizione dettaglio").
// In Divisio: m.causale, m.descr e r.nota di ogni riga.

import { isCassaBanca, tipoDi } from "./piano.js";

/** Causali che si vedono nelle esportazioni di UNIO (Diocesi di Firenze). */
export const CAUSALI_UNIO = {
  entrata: ["Offerte ordinarie", "Offerte per S.Messe", "Offerte per Collette", "Offerte per Sacramenti", "Offerte per partite di giro"],
  uscita: ["Spese per il Culto", "Spese per attività pastorale", "Rimborsi", "Manutenzioni ordinarie", "Acquisto mobili e strumentazioni",
    "Spese diverse", "Imposte e Tasse"],
  spostamento: ["Prelievo / Versamento"],
};

// voce (inizio del codice) → causale di UNIO più probabile
const PER_VOCE = [
  ["E01-01", "Offerte per S.Messe"], ["E01-02", "Offerte per Collette"], ["E01-03", "Offerte per Sacramenti"], ["E01-04", "Offerte ordinarie"],
  ["U01-01", "Spese per attività pastorale"], ["U01-02", "Spese per il Culto"], ["U02-03", "Rimborsi"],
  ["U04-01", "Acquisto mobili e strumentazioni"], ["U05", "Manutenzioni ordinarie"], ["U08-02", "Spese diverse"], ["U09-01", "Imposte e Tasse"],
];

const pulita = (s) => String(s ?? "").trim();

/**
 * Causale proposta per un movimento nuovo.
 * Prima quella usata più spesso con la stessa voce nei movimenti già registrati (anche quelli caricati da UNIO),
 * poi quella tipica di UNIO. tipo: "entrata" | "uscita" | "spostamento".
 */
export function causaleProposta(voce, tipo, movimenti = []) {
  if (tipo === "spostamento") return usataPiuSpesso(movimenti, (m) => m.righe.length === 2 && m.righe.every((r) => isCassaBanca(r.conto))) || "Prelievo / Versamento";
  if (!voce) return "";
  const usata = usataPiuSpesso(movimenti, (m) => m.righe.some((r) => r.conto === voce));
  if (usata) return usata;
  if (tipoDi(voce) === "PG") return tipo === "entrata" ? "Offerte per partite di giro" : "";
  return PER_VOCE.find(([inizio]) => voce.startsWith(inizio))?.[1] ?? "";
}

function usataPiuSpesso(movimenti, scelta) {
  const conta = new Map();
  for (const m of movimenti) {
    const c = pulita(m.causale);
    if (!c || m.eliminato || !scelta(m)) continue;
    conta.set(c, (conta.get(c) ?? 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** Elenco per il suggerimento mentre si scrive: causali di UNIO del tipo giusto + quelle già usate. */
export function elencoCausali(tipo, movimenti = []) {
  const base = tipo === "pd" ? [...CAUSALI_UNIO.entrata, ...CAUSALI_UNIO.uscita, ...CAUSALI_UNIO.spostamento] : CAUSALI_UNIO[tipo] ?? [];
  const usate = movimenti.filter((m) => !m.eliminato).map((m) => pulita(m.causale)).filter(Boolean);
  return [...new Set([...base, ...usate])].sort((a, b) => a.localeCompare(b, "it"));
}
