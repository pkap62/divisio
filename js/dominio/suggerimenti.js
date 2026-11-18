// Proposta della voce di spesa (sottoconto) per una fattura pagata. Divisio PROPONE, l'utente conferma.
// In ordine di affidabilità:
//  1. la scelta già fatta per questo fornitore (ricordata da Divisio);
//  2. le fatture già pagate dello stesso fornitore;
//  3. parole della fattura (regole riprese dallo "Scadenzario-fatture", categorizeService, collegate ai sottoconti della Diocesi).
// Se nessuna regola è abbastanza chiara, non propone nulla e chiede.

const nome = (f) => String(f.fornitore || "questo fornitore");
/** Fine frase senza doppio punto quando il nome finisce già con "." (es. "s.n.c."). */
const punto = (t) => (t.endsWith(".") ? t : t + ".");
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// [sottoconto, nome della regola, espressione]
export const REGOLE = [
  ["U08-01-01", "energia elettrica", /\bluce\b|energia\s*elettrica|\bkwh\b|potenza\s*impegnata|\bpod\b/],
  ["U08-01-02", "gas e riscaldamento", /gas\s*naturale|\bmetano\b|\bsmc\b|\bpdr\b|distribuzione\s*gas|gasolio|combustibil|teleriscaldamento/],
  ["U08-01-03", "acqua", /servizio\s*idrico|acquedott|fognatur|depurazione|publiacqua|\bacqua\b/],
  ["U08-01-04", "telefono e internet", /telefon|\bfibra\b|\badsl\b|internet|linea\s*fissa|\btim\b|telecom|vodafone|wind\s*tre|fastweb|iliad|\beolo\b/],
  ["U09-01-04", "rifiuti (TARI)", /\btari\b|tassa\s*rifiuti|igiene\s*ambientale|alia\s*servizi|smaltimento\s*rifiuti/],
  ["U08-02-05", "spurgo e fosse biologiche", /spurgo|fosse?\s*biologic/],
  ["U05-03-01", "manutenzione impianti", /caldaia|ascensor|estintor|termoidraul|impianto\s*(elettrico|termico|antincendio|di\s*riscaldamento)|elettricista|idraulic|condizionator/],
  ["U05-01-01", "manutenzione dell'edificio", /muratur|tinteggiat|imbiancat|copertura|tetto|campanile|infiss|grondai|ristrutturazion/],
  ["U01-02-01", "vino, ostie, libri liturgici", /\bostie\b|particole|vino\s*(da\s*)?messa|libri\s*liturgic|messale|lezionario/],
  ["U01-02-03", "cera e candele", /\bcera\b|candel|lumini/],
  ["U01-02-02", "fiori", /\bfior[ei]\b|fioreria|fiorista|addobbi\s*floreali/],
  ["U01-02-05", "spese per il culto", /paramenti|arredi\s*sacri|liturgic|articoli\s*religiosi/],
  ["U06-01-03", "assicurazioni", /assicuraz|polizza|premio\s*assicurativo/],
  ["U08-02-01", "cancelleria", /cancelleria|\btoner\b|cartucc|risme?\b/],
  ["U08-02-03", "fotocopie e stampati", /fotocopi|stampat|tipografi|\bcopie\b|volantin|manifesti/],
  ["U08-02-02", "materiale per pulizie", /detersiv|detergent|materiale\s*(per\s*)?pulizi/],
  ["U08-02-06", "vigilanza", /vigilanza|allarme|videosorveglianza/],
  ["U08-02-10", "software", /software|hosting|dominio\s*web|licenza\s*d'?uso|abbonamento\s*(online|cloud)/],
  ["U08-02-08", "noleggi e licenze", /noleggio|\bcanone\b|siae/],
  ["U03-01-01", "onorari e compensi", /onorari|parcella|consulenza|prestazione\s*professionale|competenze\s*professionali/],
  ["U04-01-01", "mobili e attrezzature", /acquisto\s*(di\s*)?(mobili|arredi|attrezzatur)|\bsedie\b|\btavoli\b|armadi/],
];

/**
 * f: fattura; ricordo: {voce, …} salvato per il fornitore (o undefined);
 * pagate: fatture dello stesso fornitore già pagate; contiAttivi: Set dei codici utilizzabili.
 * Restituisce {voce, motivo, livello} con livello "ricordato" | "storico" | "parole" | "nessuno".
 */
export function proponiVoce(f, { ricordo, pagate = [], contiAttivi }) {
  const usabile = (c) => c && (!contiAttivi || contiAttivi.has(c));
  if (usabile(ricordo?.voce)) return { voce: ricordo.voce, motivo: punto(`È la voce scelta l'ultima volta per ${nome(f)}`), livello: "ricordato" };

  const conteggio = new Map();
  for (const x of pagate) for (const r of x.rate) if (r.voce && usabile(r.voce)) conteggio.set(r.voce, (conteggio.get(r.voce) ?? 0) + 1);
  const migliore = [...conteggio].sort((a, b) => b[1] - a[1])[0];
  if (migliore) return { voce: migliore[0], motivo: punto(`Usata per ${migliore[1] === 1 ? "un'altra fattura" : `altre ${migliore[1]} fatture`} di ${nome(f)}`), livello: "storico" };

  const testo = norm(`${f.fornitore} ${f.descrizione} ${(f.righe ?? []).join(" ")}`);
  const trovate = REGOLE.filter(([c, , re]) => usabile(c) && re.test(testo));
  const voci = [...new Set(trovate.map(([c]) => c))];
  if (voci.length === 1) {
    const parola = testo.match(trovate[0][2])?.[0];
    return { voce: voci[0], motivo: `La fattura parla di ${trovate[0][1]} (contiene «${parola}»).`, livello: "parole" };
  }
  if (f.tipoDoc === "TD06" && usabile("U03-01-01")) return { voce: "U03-01-01", motivo: "È una parcella di un professionista.", livello: "parole" };
  return { voce: "", motivo: voci.length > 1 ? "La fattura potrebbe riguardare più voci: scelga lei quella giusta." : "Divisio non sa quale voce usare: la scelga lei dall'elenco.", livello: "nessuno" };
}

const NOMI_GESTIONE = { 0: "della parrocchia", 50: "al 50%", 100: "del teatro o di altra gestione" };

/**
 * Di chi è la fattura (solo se la divisione delle fatture è accesa): 0 parrocchia, 50 al 50%, 100 teatro o altra gestione.
 * ricordo: {quotaTeatro} salvato per il fornitore; parole: frasi che indicano il teatro (scritte nelle Impostazioni).
 * Restituisce {quota, motivo, chiedi}: chiedi = true quando Divisio non è sicuro e l'utente deve scegliere.
 * quota = null quando non c'è nessuna proposta.
 */
export function propostaTeatro(f, { ricordo, parole = [] }) {
  const q = ricordo?.quotaTeatro;
  if (q === 0 || q === 50 || q === 100) return { quota: q, motivo: `Per ${nome(f)} l'ultima volta ha scelto: ${NOMI_GESTIONE[q]}.`, chiedi: false };
  const testo = norm(`${f.intestatario} ${f.descrizione} ${(f.righe ?? []).join(" ")}`);
  const trovata = parole.map((p) => String(p).trim()).filter(Boolean).find((p) => testo.includes(norm(p)));
  if (trovata) return { quota: 100, motivo: `La fattura contiene «${trovata}»: sembra del teatro o di un'altra gestione. Lo confermi.`, chiedi: true };
  const prima = typeof q === "number" && q > 0 ? ` (l'ultima volta per ${nome(f)} era stata indicata una parte del ${q}%)` : "";
  return { quota: null, motivo: `È della parrocchia, del teatro / di un'altra gestione o al 50%? Divisio non lo sa: lo scelga lei${prima}.`, chiedi: true };
}
