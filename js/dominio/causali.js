// Causali come in UNIO (facoltative, si accendono in Impostazioni).
// In UNIO ogni registrazione ha tre testi: Causale ("Tipologia operazione" sullo schermo), Commento ("Descrizione")
// e Commento riga ("Descrizione dettaglio"). In Divisio: m.causale, m.descr e r.nota di ogni riga.
//
// In UNIO la causale decide anche QUALI VOCI si possono usare: ogni causale ha il suo elenco di conti, con il lato
// Dare o Avere. L'elenco qui sotto è quello della Diocesi di Firenze (letto da UNIO, Gestione Piano dei conti →
// Gestione causali, novembre 2026), con i codici delle voci del Rendiconto: valgono tutti i sottoconti della voce,
// così funziona anche con i sottoconti rinominati o aggiunti da ogni parrocchia. Le casse e le banche valgono tutte.
// La causale si salva come in UNIO: con la sua descrizione (es. "Offerte ordinarie").

import { isCassaBanca } from "./piano.js";

// modo|tipologia (come in UNIO)|codice|descrizione|voci|voci in più (es. spese bancarie)|teatro
// modo: entrata, uscita (modalità semplice, con una cassa o banca), spostamento (fra casse e banche),
//       pd (solo partita doppia: i conti ammessi sono tutti nelle voci; nessuna voce = tutti i conti).
const ELENCO = `
entrata|Entrate ordinarie|ECO|Offerte per Collette|E01-02
entrata|Entrate ordinarie|EME|Offerte per S.Messe|E01-01
entrata|Entrate ordinarie|EOO|Offerte ordinarie|E01-04
entrata|Entrate ordinarie|EPG|Offerte per partite di giro|PG1
entrata|Entrate ordinarie|ESA|Offerte per Sacramenti|E01-03
entrata|Entrate straordinarie|ECSL|Contributi e offerte straordinarie per lavori pluriennali|P02-05-02
entrata|Entrate straordinarie|EEA|Eredità e alienazioni|E02-03
entrata|Entrate straordinarie|EOS|Offerte e contr. Straordinari|E02-01,E02-02
entrata|Entrate straordinarie|SMU|Sottoscrizione Mutuo|P01-01
entrata|Entrate varie|EAF|Locazioni immobili|E03-01
entrata|Entrate Att. Commerciali|ETE|Entrate Teatro|P02-05-04||teatro
uscita|Uscite ordinarie|PTD|Pagamento tassa diocesana|P02-04|U08-02-07
uscita|Uscite ordinarie|UAC|Spese per attività caritative|U01-03
uscita|Uscite ordinarie|UAM|Acquisto mobili e strumentazioni|U04-01|U08-02-07
uscita|Uscite ordinarie|UAP|Spese per attività pastorale|U01-01|U08-02-07
uscita|Uscite ordinarie|UAS|Assicurazioni|U06-01
uscita|Uscite ordinarie|UCU|Spese per il Culto|U01-02|U08-02-07
uscita|Uscite ordinarie|UDI|Spese diverse|U08-02
uscita|Uscite ordinarie|UIT|Imposte e Tasse|U09-01|U08-02-07
uscita|Uscite ordinarie|ULP|Locazioni Passive|U07-01|U08-02-07
uscita|Uscite ordinarie|UMA|Manutenzioni ordinarie|U05|U08-02-07
uscita|Uscite ordinarie|UOP|Onorari e Comp. Professionali|U03-01|U08-02-07
uscita|Uscite ordinarie|UPG|Versamento giornate e collette|PG1|U08-02-07
uscita|Uscite ordinarie|UPM|Pagamento rata mutuo|P01-01,U09-02-02|U08-02-07
uscita|Uscite ordinarie|URE|Remunerazioni|U02-02
uscita|Uscite ordinarie|URI|Rimborsi|U02-03|U08-02-07
uscita|Uscite ordinarie|UST|Stipendi|U02-01|U08-02-07
uscita|Uscite ordinarie|UUT|Utenze|U08-01|U08-02-07
uscita|Uscite finanziarie|PTFR|Pagamento TFR|P03-02-01|U08-02-07
uscita|Uscite Att. Commerciali|UTE|Uscite Teatro|P02-05-04||teatro
spostamento|Uscite finanziarie|PRE|Prelevamento in banca|
spostamento|Uscite finanziarie|VER|Versamento in banca|
pd|Movimento finanziario|ATFR|Accantonamento TFR|U10-02-01,P03-02-01
pd|Movimento finanziario|PF|Pagamento fattura|A02-01,P02-01,U08-02-07
pd|Movimento finanziario|RF|Ricevimento fattura|
pd|Movimento finanziario|RFLP|Ricevimento fattura per lavori pluriennali|P02-05-02,P02-01
pd|Movimento finanziario|SAL|Scritture aggiustamento fine anno per lavori|U05-01-01,U03-01-01,E02-02,P03-02-02
pd|Movimento finanziario|TDI|Determinazione Tassa diocesana|U09-03-01,U09-03-02,P02-04
pd|Generico|PN|MOVIMENTO DI PRIMA NOTA|
pd|Generico|PA|PRIMA APERTURA|
pd|Generico|AC|APERTURA E CHIUSURA ESERCIZIO|
`;

const lista = (s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);

/** Tutte le causali: { codice, descr, modo, tipologia, voci, extra, teatro }. */
export const CAUSALI = ELENCO.trim().split("\n").map((riga) => {
  const [modo, tipologia, codice, descr, voci, extra, teatro] = riga.split("|");
  return { codice, descr, modo, tipologia, voci: lista(voci), extra: lista(extra), teatro: teatro === "teatro" };
});

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const PER_TESTO = new Map(CAUSALI.flatMap((c) => [[norm(c.descr), c], [norm(c.codice), c], [norm(`${c.codice} - ${c.descr}`), c]]));

/** La causale scritta in un movimento (descrizione come in UNIO, oppure il codice): null se non è tra quelle di UNIO. */
export const causaleDa = (testo) => PER_TESTO.get(norm(testo)) ?? null;

/** Come si mostra: "EOO · Offerte ordinarie" (se non è tra quelle di UNIO, il testo com'è). */
export function etichettaCausale(testo) {
  const c = causaleDa(testo);
  return c ? `${c.codice} · ${c.descr}` : String(testo ?? "");
}

/**
 * Causali da scegliere per un tipo di movimento: "entrata", "uscita", "spostamento" o "pd" (in partita doppia tutte).
 * Quelle del teatro solo se la parrocchia ha acceso la funzione del teatro (opz.teatro).
 */
export function causaliPer(tipo, { teatro = false } = {}) {
  return CAUSALI.filter((c) => (tipo === "pd" || c.modo === tipo) && (teatro || !c.teatro));
}

/** Questa causale libera tutti i conti? (es. "Movimento di prima nota") */
export const libera = (c) => !c || (c.modo === "pd" && c.voci.length === 0);

/**
 * Il conto (sottoconto, es. "E01-04-02") si può usare con la causale?
 * Nessuna causale o una causale libera: sì. Casse e banche: sì per entrate, uscite e spostamenti; in partita doppia solo se la causale le prevede.
 */
export function contoAmmesso(c, conto) {
  if (libera(c)) return true;
  if (isCassaBanca(conto) && c.modo !== "pd") return true;
  if (c.modo === "spostamento") return isCassaBanca(conto);
  return [...c.voci, ...c.extra].some((v) => conto.startsWith(v));
}

const CASSA_PRINCIPALE = "A02-01-01";

/** Spostamento fra casse e banche: dalla banca alla cassa = Prelevamento (PRE), dalla cassa alla banca = Versamento (VER). */
export function causalePerSpostamento(da, verso) {
  if (verso === CASSA_PRINCIPALE && da && da !== CASSA_PRINCIPALE) return "Prelevamento in banca";
  if (da === CASSA_PRINCIPALE && verso && verso !== CASSA_PRINCIPALE) return "Versamento in banca";
  return "";
}

const pulita = (s) => String(s ?? "").trim();

/**
 * Causale proposta per un movimento nuovo, dalla voce scelta (descrizione, come in UNIO; "" se nessuna).
 * Prima quella usata più spesso con la stessa voce nei movimenti già registrati (anche quelli caricati da UNIO),
 * purché sia tra quelle di UNIO e ammetta la voce; poi la causale di UNIO che ha quella voce fra le sue (non fra quelle in più).
 * tipo: "entrata" | "uscita".
 */
export function causaleProposta(voce, tipo, movimenti = [], opz = {}) {
  if (!voce) return "";
  const scelte = causaliPer(tipo, opz);
  const usata = usataPiuSpesso(movimenti, (m) => m.righe.some((r) => r.conto === voce), (t) => {
    const c = causaleDa(t);
    return c && scelte.includes(c) && contoAmmesso(c, voce);
  });
  if (usata) return causaleDa(usata).descr;
  // la più precisa: "U09-02-02" vince su "U09"
  const adatte = scelte.map((c) => ({ c, lung: Math.max(0, ...c.voci.filter((v) => voce.startsWith(v)).map((v) => v.length)) })).filter((x) => x.lung > 0);
  adatte.sort((a, b) => b.lung - a.lung);
  return adatte[0]?.c.descr ?? "";
}

function usataPiuSpesso(movimenti, scelta, valida) {
  const conta = new Map();
  for (const m of movimenti) {
    const c = pulita(m.causale);
    if (!c || m.eliminato || !scelta(m) || !valida(c)) continue;
    conta.set(c, (conta.get(c) ?? 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
