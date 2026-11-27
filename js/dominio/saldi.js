// Saldi e riepiloghi calcolati dai movimenti.

import { crescInDare, tipoDi } from "./piano.js";
import { analizza } from "./scritture.js";

/** Movimenti validi di un anno (quelli eliminati non contano mai). */
export const movimentiAnno = (movimenti, anno) => movimenti.filter((m) => !m.eliminato && m.data.slice(0, 4) === String(anno));

/** Map conto → {dare, avere} sommati su tutti i movimenti dati. */
export function totaliPerConto(movimenti) {
  const t = new Map();
  for (const m of movimenti) {
    for (const r of m.righe) {
      const x = t.get(r.conto) ?? { dare: 0, avere: 0 };
      x.dare += r.dare;
      x.avere += r.avere;
      t.set(r.conto, x);
    }
  }
  return t;
}

/** Saldo "naturale": positivo quando il conto ha il suo segno normale (cassa piena, debito da pagare, entrata incassata…). */
export function saldo(conto, totali) {
  const x = totali.get(conto);
  if (!x) return 0;
  return crescInDare(conto) ? x.dare - x.avere : x.avere - x.dare;
}

/**
 * Saldo progressivo di un conto (per esempio la cassa): dopo ogni movimento che lo tocca, quanto c'è.
 * Ordine: data, a parità di data prima i saldi di apertura, poi l'ordine di inserimento.
 * Restituisce Map id del movimento → saldo naturale dopo quel movimento.
 */
export function saldiProgressivi(movimenti, conto) {
  const ordine = (a, b) => a.data.localeCompare(b.data) || (b.tipo === "apertura") - (a.tipo === "apertura")
    || String(a.creatoIl ?? "").localeCompare(String(b.creatoIl ?? "")) || String(a.id).localeCompare(String(b.id));
  const verso = crescInDare(conto) ? 1 : -1;
  const progressivi = new Map();
  let s = 0;
  for (const m of movimenti.filter((x) => !x.eliminato && x.righe.some((r) => r.conto === conto)).sort(ordine)) {
    for (const r of m.righe) if (r.conto === conto) s += verso * (r.dare - r.avere);
    progressivi.set(m.id, s);
  }
  return progressivi;
}

/**
 * Perché i totali della pagina Movimenti (soldi entrati e usciti da cassa e banche) differiscono da quelli di Inizio
 * (entrate e uscite della parrocchia, cioè le voci E e U). Per i movimenti dati restituisce, in centesimi:
 * - voci: Map conto → {entrate, uscite} per le voci che non sono né entrate né uscite (teatro, collette da versare, prestiti…):
 *   soldi contati in Movimenti, non in Inizio;
 * - rimborsi: voci di uscita in movimenti di entrata (es. una spesa rimborsata): in Movimenti sono entrate, in Inizio riducono le uscite;
 * - restituzioni: voci di entrata in movimenti di uscita (es. un'offerta restituita): in Movimenti sono uscite, in Inizio riducono le entrate;
 * - senzaCassa: {entrate, uscite} dei movimenti senza cassa né banca: contano in Inizio, non in Movimenti.
 * Così: entrate di Movimenti = entrate di Inizio + voci.entrate + rimborsi + restituzioni − senzaCassa.entrate (e lo stesso per le uscite).
 */
export function differenzeConInizio(movimenti) {
  const voci = new Map();
  let rimborsi = 0, restituzioni = 0;
  const senzaCassa = { entrate: 0, uscite: 0 };
  for (const m of movimenti) {
    if (m.eliminato) continue;
    const a = analizza(m);
    if (a.tipo === "senzaCassa") {
      for (const r of m.righe) {
        if (tipoDi(r.conto) === "E") senzaCassa.entrate += r.avere - r.dare;
        if (tipoDi(r.conto) === "U") senzaCassa.uscite += r.dare - r.avere;
      }
      continue;
    }
    if (!a.segno) continue;   // saldi di apertura e spostamenti
    for (const r of a.voci) {
      const t = tipoDi(r.conto);
      const importo = a.segno > 0 ? r.avere - r.dare : r.dare - r.avere;   // quanto pesa nel totale di Movimenti
      if (!importo) continue;
      if (t === "E") { if (a.segno < 0) restituzioni += importo; }
      else if (t === "U") { if (a.segno > 0) rimborsi += importo; }
      else {
        const x = voci.get(r.conto) ?? { entrate: 0, uscite: 0 };
        if (a.segno > 0) x.entrate += importo; else x.uscite += importo;
        voci.set(r.conto, x);
      }
    }
  }
  return { voci, rimborsi, restituzioni, senzaCassa };
}

/** Somma dei saldi naturali dei conti il cui tipo è tra quelli indicati. */
export function sommaPerTipo(totali, tipi) {
  let s = 0;
  for (const conto of totali.keys()) if (tipi.includes(tipoDi(conto))) s += saldo(conto, totali);
  return s;
}

/**
 * Riepilogo di un anno: entrate, uscite, avanzo e controllo dello stato patrimoniale
 * (Attività = Passività + Collette da versare + Patrimonio + Avanzo).
 */
export function riepilogoAnno(movimenti, anno) {
  const tot = totaliPerConto(movimentiAnno(movimenti, anno));
  const entrate = sommaPerTipo(tot, ["E"]);
  const uscite = sommaPerTipo(tot, ["U"]);
  const avanzo = entrate - uscite;
  const attivita = sommaPerTipo(tot, ["A"]);
  const passivita = sommaPerTipo(tot, ["P", "PG"]);
  const patrimonio = sommaPerTipo(tot, ["PAT"]);
  const colletteDaVersare = sommaPerTipo(tot, ["PG"]);
  return { totali: tot, entrate, uscite, avanzo, attivita, passivita, patrimonio, colletteDaVersare,
    quadra: attivita === passivita + patrimonio + avanzo };
}
