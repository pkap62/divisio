// Saldi e riepiloghi calcolati dai movimenti.

import { crescInDare, tipoDi } from "./piano.js";

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
