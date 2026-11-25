// Azzerare lo scadenzario, oppure ripartire da zero con tutti i dati della contabilità.
// Restano sempre: dati della parrocchia, cassa e banche, piano dei conti, impostazioni delle funzioni (teatro, causale)
// e il collegamento per lavorare insieme. Prima di azzerare la pagina scarica una copia di sicurezza; si può anche annullare.

const vivi = (elenco) => elenco.filter((x) => !x.eliminato);

/**
 * Azzera lo scadenzario: tutte le fatture spariscono.
 * ancheUscite = true: le uscite delle fatture pagate escono anche dalla contabilità;
 * false: restano in contabilità come movimenti normali (senza il collegamento alla fattura, che non c'è più).
 * Restituisce { fatture, movimenti, movimentiDaEliminare, conta: {fatture, pagate, uscite} } per salvaInsieme.
 */
export function azzeraScadenzario({ movimenti, fatture }, { ancheUscite = true } = {}) {
  const tutte = vivi(fatture);
  const ids = new Set(tutte.map((f) => f.id));
  const uscite = vivi(movimenti).filter((m) => m.fattura && ids.has(m.fattura.id));
  const pagate = tutte.filter((f) => f.rate.some((r) => r.stato === "pagata")).length;
  return {
    fatture: tutte.map((f) => ({ ...f, eliminato: true })),
    movimentiDaEliminare: ancheUscite ? uscite.map((m) => m.id) : [],
    movimenti: ancheUscite ? [] : uscite.map(({ fattura, ...m }) => m),
    conta: { fatture: tutte.length, pagate, uscite: uscite.length },
  };
}

/** Gruppi di impostazioni che si possono cancellare ripartendo da zero (le altre restano sempre). */
export const GRUPPI_IMPOSTAZIONI = {
  unio: { nome: "importazioni segnate per UNIO e segni «Rendiconto inviato»", vale: (k) => k === "unio-invii" || k === "unio-dal" || k.startsWith("invio-rendiconto-") },
  previsioni: { nome: "bilanci di previsione", vale: (k) => k.startsWith("previsione-") },
  ricordati: { nome: "fornitori e nomi ricordati (fatture, PDF, estratti conto)", vale: (k) => /^(fornitore:|modello-pdf:|banca:|formato-banca:)/.test(k) },
};

/**
 * Ripartire da zero. scelte = { movimenti, fatture, unio, previsioni, ricordati } (vero = da cancellare).
 * movimenti: tutti, di tutti gli anni, anche i saldi di apertura. fatture: tutto lo scadenzario.
 * Se si tengono le fatture ma si cancellano i movimenti, le fatture pagate tornano «da pagare» (la loro uscita non c'è più);
 * se si tengono i movimenti ma si cancellano le fatture, le uscite restano come movimenti normali.
 * Restituisce { fatture, movimenti, movimentiDaEliminare, impostazioni, conta } per salvaInsieme.
 */
export function ripartiDaZero({ movimenti, fatture, impostazioni }, scelte, tornaDaPagare) {
  const mov = vivi(movimenti), fat = vivi(fatture);
  const out = { fatture: [], movimenti: [], movimentiDaEliminare: [], impostazioni: [], conta: { movimenti: 0, fatture: 0, impostazioni: 0 } };
  if (scelte.fatture) {
    const s = azzeraScadenzario({ movimenti, fatture }, { ancheUscite: Boolean(scelte.movimenti) });
    out.fatture = s.fatture;
    if (!scelte.movimenti) out.movimenti = s.movimenti;
    out.conta.fatture = s.conta.fatture;
  } else if (scelte.movimenti) {
    // le fatture restano: quelle pagate tornano da pagare
    const perId = new Map(fat.map((f) => [f.id, f]));
    for (const m of mov) {
      if (!m.fattura || !perId.has(m.fattura.id)) continue;
      const f = perId.get(m.fattura.id);
      if (f.rate.some((r) => r.n === m.fattura.rata)) perId.set(f.id, tornaDaPagare(f, m.fattura.rata).fattura);
    }
    out.fatture = [...perId.values()].filter((f) => f !== fat.find((x) => x.id === f.id));
  }
  if (scelte.movimenti) { out.movimentiDaEliminare = mov.map((m) => m.id); out.conta.movimenti = mov.length; }
  for (const i of impostazioni) {
    if (i.valore == null) continue;
    if (Object.entries(GRUPPI_IMPOSTAZIONI).some(([g, x]) => scelte[g] && x.vale(i.chiave))) out.impostazioni.push({ chiave: i.chiave, valore: null });
  }
  out.conta.impostazioni = out.impostazioni.length;
  return out;
}
