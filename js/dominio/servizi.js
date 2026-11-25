// Di quale servizio parla una fattura (luce, gas, acqua, telefono) e per quale contatore.
// Serve quando lo stesso fornitore manda fatture diverse: per esempio una società che vende sia luce sia gas.
// Il segno più sicuro è il codice del contatore scritto in ogni bolletta:
//  - POD  (luce): «IT001E12345678», sempre IT + 3 cifre + E + 8 caratteri;
//  - PDR  (gas):  14 cifre, scritte accanto alla parola PDR o «punto di riconsegna».
// Senza codice si guardano le unità di misura (kWh = luce, Smc = gas) e poi le parole.
// Due bollette con contatori diversi non sono mai la stessa fattura, anche se hanno stessa data e stesso importo,
// e Divisio ricorda la voce (e la parte del teatro) per ciascun contatore.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Voce di spesa del Rendiconto di ogni servizio. */
export const VOCE_SERVIZIO = { luce: "U08-01-01", gas: "U08-01-02", acqua: "U08-01-03", telefono: "U08-01-04" };
const NOMI = { luce: "luce", gas: "gas", "luce e gas": "luce e gas", acqua: "acqua", telefono: "telefono e internet" };

const POD = /\bIT\s?(\d{3})\s?E\s?([0-9A-Z]{8})\b/gi;
const PDR = /\b(?:P\.?\s?D\.?\s?R\.?|punto\s+di\s+riconsegna)\b[^0-9\n]{0,40}(\d{14})\b/gi;

function codici(testo) {
  const pod = new Set(), pdr = new Set();
  for (const m of String(testo).matchAll(POD)) pod.add(`IT${m[1]}E${m[2].toUpperCase()}`);
  for (const m of String(testo).matchAll(PDR)) pdr.add(m[1]);
  return { pod: [...pod], pdr: [...pdr] };
}

/**
 * Servizio di una fattura dal suo testo (XML senza allegati, oppure testo del PDF).
 * Restituisce { tipo: "luce" | "gas" | "luce e gas" | "acqua" | "telefono", codice: "POD IT001E…" | "PDR …" | "" } oppure null.
 */
export function servizioDaTesto(testo) {
  const t = String(testo ?? "");
  const { pod, pdr } = codici(t);
  if (pod.length && pdr.length) return { tipo: "luce e gas", codice: [...pod.map((c) => "POD " + c), ...pdr.map((c) => "PDR " + c)].join(", ") };
  if (pod.length) return { tipo: "luce", codice: pod.map((c) => "POD " + c).join(", ") };
  if (pdr.length) return { tipo: "gas", codice: pdr.map((c) => "PDR " + c).join(", ") };
  const n = norm(t);
  // unità di misura: compaiono solo nei consumi, non nella pubblicità
  const kwh = /\bkwh\b/.test(n), smc = /\bsmc\b|\bstandard\s*metri\s*cubi\b/.test(n);
  if (kwh && !smc) return { tipo: "luce", codice: "" };
  if (smc && !kwh) return { tipo: "gas", codice: "" };
  if (kwh && smc) return { tipo: "luce e gas", codice: "" };
  const luce = /energia\s*elettrica|potenza\s*impegnata/.test(n), gas = /gas\s*naturale|\bmetano\b|distribuzione\s*gas/.test(n);
  if (luce !== gas) return { tipo: luce ? "luce" : "gas", codice: "" };
  if (/servizio\s*idrico|acquedott|fognatur|depurazione/.test(n)) return { tipo: "acqua", codice: "" };
  if (/telefon|\bfibra\b|\badsl\b|linea\s*fissa|traffico\s*(voce|dati)/.test(n)) return { tipo: "telefono", codice: "" };
  return null;
}

/** Testo breve per le etichette: «gas · PDR 01234567890123». */
export const etichettaServizio = (s) => (s?.tipo ? `${NOMI[s.tipo] ?? s.tipo}${s.codice ? " · " + s.codice : ""}` : "");

/** Chiave con cui ricordare le scelte per un servizio di un fornitore: il contatore, se c'è, altrimenti il tipo. */
export const chiaveServizio = (f) => (f?.servizio?.codice ? f.servizio.codice : f?.servizio?.tipo || "");

/** Vero quando si capisce che due fatture riguardano servizi o contatori diversi. */
export function diversoServizio(a, b) {
  const x = a?.servizio, y = b?.servizio;
  if (!x?.tipo || !y?.tipo) return false;
  if (x.codice && y.codice) return x.codice !== y.codice;
  return x.tipo !== y.tipo;
}

/**
 * Le scelte ricordate per un fornitore, adattate al servizio di questa fattura.
 * valore: {nome, voce, quotaTeatro, servizi:{chiave → {voce, quotaTeatro, nome}}} (impostazione "fornitore:…").
 * Se il fornitore ha già scelte per altri servizi ma non per questo, non propone la voce di un altro servizio.
 */
export function ricordoPer(valore, f) {
  if (!valore) return valore;
  const k = chiaveServizio(f);
  if (!k) return valore;
  const servizi = valore.servizi ?? {};
  const proprio = servizi[k] ?? (f.servizio.codice ? servizi[f.servizio.tipo] : undefined);
  if (proprio) return { ...valore, ...proprio, perServizio: etichettaServizio(f.servizio) };
  const giusta = VOCE_SERVIZIO[f.servizio.tipo];
  const daAltroServizio = Object.keys(servizi).length > 0
    || (giusta && Object.values(VOCE_SERVIZIO).includes(valore.voce) && valore.voce !== giusta);
  return daAltroServizio ? { ...valore, voce: "", quotaTeatro: undefined } : valore;
}

/** Nuovo valore da ricordare per il fornitore della fattura f, con le scelte {voce, quotaTeatro} (anche per il suo servizio). */
export function ricordoAggiornato(prima, f, scelte) {
  const pulite = Object.fromEntries(Object.entries(scelte).filter(([, v]) => v !== undefined));
  const base = { ...prima, nome: f.fornitore, ...pulite };
  delete base.perServizio;
  const k = chiaveServizio(f);
  if (!k) return base;
  const vecchio = prima?.servizi?.[k] ?? {};
  return { ...base, servizi: { ...prima?.servizi, [k]: { ...vecchio, ...pulite, nome: etichettaServizio(f.servizio) } } };
}
