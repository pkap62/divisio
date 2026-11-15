// Importi: sempre in CENTESIMI interi, mai numeri con la virgola.

/**
 * Converte il testo scritto dall'utente in centesimi.
 * Accetta "50", "50,5", "1.250,50", "1250.50", "€ 12,30".
 * Restituisce 0 per testo vuoto e NaN se il testo non è un importo valido
 * (anche con più di due decimali).
 */
export function parseEuro(testo) {
  let s = String(testo ?? "").replace(/[\s€]/g, "");
  if (s === "") return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.250" = milleduecentocinquanta
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  const cent = Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0"));
  return m[1] ? -cent : cent;
}

/** 125050 → "1.250,50 €" */
export function formatEuro(cent) {
  const neg = cent < 0;
  const a = Math.abs(cent);
  const intero = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${intero},${String(a % 100).padStart(2, "0")} €`;
}

/** 125050 → "1250,50" (per i campi da modificare e per i CSV) */
export function formatDecimale(cent) {
  const neg = cent < 0;
  const a = Math.abs(cent);
  return `${neg ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

/** Formato dei CSV di UNIO: 300250 → "3002,5", 0 → "0" */
export function formatUNIO(cent) {
  return formatDecimale(cent).replace(/0+$/, "").replace(/,$/, "");
}
