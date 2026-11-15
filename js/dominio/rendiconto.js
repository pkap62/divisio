// Rendiconto Parrocchiale (Diocesi di Firenze), calcolato dai movimenti di un anno.
// Segni come in UNIO: ogni voce ha il suo segno "naturale" (entrate e uscite positive,
// cassa positiva se ci sono soldi, debiti positivi se si devono pagare).

import { VOCI, GRUPPI, voceDi, tipoDi } from "./piano.js";
import { totaliPerConto, saldo, movimentiAnno } from "./saldi.js";

/**
 * @param movimenti tutti i movimenti (validi)
 * @param anno      anno del Rendiconto
 * @param conti     (facoltativo) Map dei sottoconti, per elencare anche le collette senza movimenti
 */
export function calcolaRendiconto(movimenti, anno, { conti } = {}) {
  const mov = movimentiAnno(movimenti, anno);
  const tot = totaliPerConto(mov);

  // saldi per sottoconto (bilancio analitico) e per voce
  const sottoconti = new Map();
  const voci = new Map(VOCI.map((v) => [v.codice, 0]));
  for (const c of tot.keys()) {
    const s = saldo(c, tot);
    sottoconti.set(c, s);
    if (voci.has(voceDi(c))) voci.set(voceDi(c), voci.get(voceDi(c)) + s);
  }
  const gruppi = new Map(GRUPPI.map((g) => [g.codice, g.voci.reduce((s, v) => s + voci.get(v.codice), 0)]));
  const perTipo = (tipi) => GRUPPI.filter((g) => tipi.includes(g.tipo)).reduce((s, g) => s + gruppi.get(g.codice), 0);

  // gestione
  const entrate = perTipo(["E"]);                 // T01
  const uscite = perTipo(["U"]);                  // T02
  const avanzo = entrate - uscite;                // F

  // situazione patrimoniale
  const attivita = perTipo(["A"]);
  const passivita = perTipo(["P", "PG"]);         // come UNIO: le collette da versare sono tra le passività
  const patrimonio = perTipo(["PAT"]);
  const passivitaPiuCapitale = passivita + patrimonio;

  // collette: C1 raccolte nell'anno, C2 versate, C3 non versate dell'anno prima (dai saldi di apertura)
  const apertura = totaliPerConto(mov.filter((m) => m.tipo === "apertura"));
  const anno_ = totaliPerConto(mov.filter((m) => m.tipo !== "apertura"));
  const codiciPG = new Set([...(conti ? conti.keys() : []), ...tot.keys()].filter((c) => tipoDi(c) === "PG"));
  const collette = [...codiciPG].sort().map((conto) => {
    const C1 = anno_.get(conto)?.avere ?? 0, C2 = anno_.get(conto)?.dare ?? 0, C3 = saldo(conto, apertura);
    return { conto, C1, C2, C3, daVersare: C3 + C1 - C2 };
  });
  const somma = (k) => collette.reduce((s, x) => s + x[k], 0);
  const totaleCollette = { C1: somma("C1"), C2: somma("C2"), C3: somma("C3"), daVersare: somma("daVersare") };

  // contributo diocesano
  const v = (codice) => voci.get(codice);
  const base3 = gruppi.get("E01") + v("E03-01") + v("E04-01") + v("E04-02");
  const base10 = v("E02-03") + v("E03-02");
  const contributo3 = Math.round((base3 * 3) / 100);
  const contributo10 = Math.round((base10 * 10) / 100);

  return {
    anno, numeroMovimenti: mov.length, voci, gruppi, sottoconti,
    entrate, uscite, avanzo,
    attivita, passivita, patrimonio, passivitaPiuCapitale,
    quadra: attivita === passivitaPiuCapitale + avanzo,
    collette, totaleCollette,
    contributo: { base3, contributo3, base10, contributo10, totale: contributo3 + contributo10 },
  };
}

/** Bilancio di previsione: un importo per gruppo (E01…E04, U01…U10). */
export function totaliPrevisione(previsione = {}) {
  const somma = (t) => GRUPPI.filter((g) => g.tipo === t).reduce((s, g) => s + (previsione[g.codice] || 0), 0);
  const entrate = somma("E"), uscite = somma("U");
  return { entrate, uscite, avanzo: entrate - uscite };
}
