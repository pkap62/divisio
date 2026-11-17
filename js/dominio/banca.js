// Dai movimenti dell'estratto conto alle registrazioni di Divisio. Divisio PROPONE, l'utente conferma.
//
// Per ogni movimento della banca Divisio cerca, in ordine:
//  1. se è già in contabilità (stessa banca, stesso importo, date vicine) → non lo registra di nuovo;
//  2. se paga una fattura dello scadenzario (stesso importo e stesso fornitore o numero) → propone di segnarla pagata;
//  3. la scelta fatta l'ultima volta per lo stesso nome (ordinante o beneficiario) → "ricordato";
//  4. un fornitore conosciuto dalle fatture → la sua voce;
//  5. parole della descrizione (es. "bollo", "colf", "offerta per ss. messe") → "parole";
//  altrimenti chiede di scegliere la voce.

import { scritturaSemplice } from "./scritture.js";
import { righePagamento, PAGATA } from "./scadenzario.js";
import { REGOLE } from "./suggerimenti.js";
import { chiaveFornitore } from "./fatture.js";

export const CASSA_CONTANTI = "A02-01-01";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const compatto = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const spazi = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/* ---------- chi ha pagato o ricevuto ---------- */

const FORME = /\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|sarl|soc(ieta)?\.?\s*coop(erativa)?\.?|societa\.?\s*benefit|aps|odv|onlus|ets)\b/g;
/** Nome senza forma societaria né segni, per riconoscere lo stesso soggetto scritto in modi diversi. */
export const nomeBase = (s) => compatto(norm(s).replace(FORME, " "));

const PICCOLE = new Set(["di", "de", "del", "della", "dei", "degli", "delle", "e", "ed", "il", "la", "lo", "le", "gli", "da", "in", "per", "a", "al", "alla"]);
const SIGLE = new Set(["srl", "spa", "snc", "sas", "aps", "odv", "onlus", "ets", "sarl", "it", "eu", "tim", "rai", "inps", "inail"]);
/** "studio rossi associati" → "Studio Rossi Associati" (solo se il testo è tutto minuscolo o tutto maiuscolo). */
export function maiuscole(s) {
  const t = spazi(s).replace(/\bs\.?\s?p\.?\s?a\.?(?=\s|,|$)/gi, (x) => (x === x.toUpperCase() ? "SPA" : "spa")).replace(/\bs\.?\s?r\.?\s?l\.?(?=\s|,|$)/gi, (x) => (x === x.toUpperCase() ? "SRL" : "srl"));
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(" ").map((w, i) => {
    const pulita = w.replace(/[^a-z]/g, "");
    if (SIGLE.has(pulita)) return w.toUpperCase();
    if (i > 0 && PICCOLE.has(w)) return w;
    return w.replace(/(^|[-'’.(])([a-zà-ù])/g, (m, p, c) => p + c.toUpperCase());
  }).join(" ");
}

/**
 * Ordinante "bon.da NOME CAUSALE-TRONCATA - CAUSALE-COMPLETA" (Banco BPM e simili):
 * la causale compare due volte, la prima volta tagliata; il nome è quello che c'è prima.
 */
function nomeEBonifico(resto) {
  let migliore = null;
  const separatori = [...resto.matchAll(/ - /g)].map((m) => m.index);
  for (const k of separatori) {
    const prima = resto.slice(0, k), completa = resto.slice(k + 3);
    const cc = compatto(completa);
    if (!cc) continue;
    const parole = [...prima.matchAll(/\S+/g)].map((m) => m.index);
    for (const i of parole.slice(1)) {   // il nome ha almeno una parola
      const troncata = prima.slice(i);
      const ct = compatto(troncata);
      if (ct.length >= 3 && cc.startsWith(ct)) {
        if (!migliore || ct.length > migliore.lunghezza) migliore = { nome: prima.slice(0, i), causale: completa, lunghezza: ct.length };
        break;   // la più lunga per questo separatore
      }
    }
  }
  if (migliore) return { nome: migliore.nome, causale: migliore.causale };
  const k = resto.indexOf(" - ");
  return k > 0 ? { nome: resto.slice(0, k), causale: resto.slice(k + 3) } : { nome: resto, causale: "" };
}

// Parole dopo cui le banche scrivono il nome, dalla più sicura.
const MARCATORI = [/\b(?:ordinante|beneficiario|benef\.?|ord\.|creditore|esercente)\s*:?\s*/, /\bdisposto\s+da\s+/, /\ba\s+favore\s+(?:di\s+)?(?!vostro|vs)/,
  /\bbonifico\s+(?:sepa\s+)?(?:istantaneo\s+)?(?:da|a)\s+(?!vostro|vs|favore)/, /\bpresso\s+/];
const FINE_NOME = /\s+(?:-\s|causale\b|caus\.?:|cau:|ric\.|rif\b|rif\.|cro\b|trn\b|id\b|iban\b|bic\b|info\b|data\b|note\b|per\s+conto\b)|\s{2,}|$/;
const prendi = (testo, inizio) => { const resto = testo.slice(inizio); const m = FINE_NOME.exec(resto); return { nome: resto.slice(0, m.index), dopo: resto.slice(m.index) }; };

/**
 * Nome di chi ha mandato o ricevuto i soldi, e causale, ricavati dalla descrizione della banca.
 * Restituisce { nome, causale, mandato } (stringhe vuote se non si trovano; mandato = contratto dell'addebito diretto SDD).
 */
export function controparte(descrizione) {
  const t = String(descrizione ?? "").toLowerCase().replace(/ /g, " ");
  let m;
  let esito = null;
  if ((m = /\bbon\.?\s?da\s+/.exec(t))) esito = nomeEBonifico(spazi(t.slice(m.index + m[0].length)));
  else if ((m = /\bfavore\s+(?:di\s+)?(.+?)\s+-\s+add\.?\s*tot\.?\s*-\s*(.*)$/.exec(t)) || (m = /\bfavore\s+(?:di\s+)?(.+?)\s+-\s+(.*)$/.exec(t))) esito = { nome: m[1], causale: m[2] };
  else if ((m = /\bsdd\s*(?:core|b2b|cor1)?\s*:\s*(\S+)\s+(.+)$/.exec(t))) esito = { nome: m[2], causale: "", mandato: m[1] };
  else if ((m = MARCATORI.map((re) => re.exec(t)).find(Boolean))) {
    const p = prendi(t, m.index + m[0].length);
    const caus = /(?:causale|caus\.?:|cau:|per)\s*:?\s*(.+)$/.exec(p.dopo);
    esito = { nome: p.nome, causale: caus ? caus[1] : "" };
  }
  if (!esito) return { nome: "", causale: "" };
  const nome = spazi(esito.nome).replace(/[\s,;:.\-]+$/, "");
  return { nome: /[a-z]{2}/.test(nome) && nome.length >= 3 ? nome : "", causale: spazi(esito.causale).replace(/^[-:\s]+/, ""), mandato: esito.mandato ?? "" };
}

/* ---------- firma della causale (per ricordare scelte diverse per lo stesso nome) ---------- */

const MESI = /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|mese|mesi|anno|anni)\b/g;
/** Parole importanti di una causale, senza numeri, date e mesi: "rimborso colf febbraio 2026" → "rimborso colf". */
export function firma(causale) {
  return norm(causale).replace(MESI, " ").replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 3 && !PICCOLE.has(w) && !/^(del|dal|alla|nel|ft|fatt|fattura|saldo|acconto|rata|num|nr)$/.test(w)).slice(0, 5).join(" ");
}

/** Chiave con cui Divisio ricorda le scelte per un nome (o, se manca, per il tipo di operazione). */
export function chiaveMemoria(riga) {
  const { nome } = riga.controparte ?? controparte(riga.descrizione);
  if (nome && nomeBase(nome)) return "banca:" + nomeBase(nome);
  const f = firma(riga.descrizione);
  return f ? "banca:op:" + f.replace(/ /g, "-") : "";
}

/** Descrizione proposta per il movimento. */
export function descrizioneProposta(riga) {
  const { nome, causale, mandato } = riga.controparte ?? controparte(riga.descrizione);
  const c = spazi(causale).replace(/^(add\.?\s*tot\.?\s*-\s*)/, "") || (mandato ? "addebito diretto" : "");
  if (nome) return spazi(`${maiuscole(nome)}${c ? " – " + c : ""}`).slice(0, 140);
  const d = spazi(riga.descrizione).replace(/[\s-]+$/, "");
  return (d.charAt(0).toUpperCase() + d.slice(1)).slice(0, 140);
}

/* ---------- regole sulle parole ---------- */

// [tipo, sottoconto (per spostamento: "contanti"), nome della regola, espressione, generica?]
export const REGOLE_BANCA = [
  ["spostamento", "contanti", "versamento di contanti", /vers\.?(amento)?\s*(di\s*)?contant|deposito\s*contant|versamento\s*(allo\s*)?sportello/],
  ["spostamento", "contanti", "prelievo di contanti", /prelievo|prel\.?\s*(bancomat|atm|contanti|sportello)|\batm\b/],
  ["spostamento", "altra", "giroconto", /giroconto|giro\s*conto|trasferimento\s*(fondi|tra\s*(i\s*)?conti)/],
  ["uscita", "U09-01-06", "imposta di bollo", /imposta\s*(di\s*)?bollo|\bbollo\b/],
  ["uscita", "U09-02-01", "interessi passivi", /interessi\s*(passivi|debitori)/],
  ["uscita", "U08-02-07", "spese bancarie", /\bcompetenze\b|commission|spese\s*(di\s*)?(tenuta|gestione|bonifico|conto|invio|incasso)|canone\s*(mensile|conto|trimestrale|annuo)|\bint\.?\s*e\s*comp|costo\s*(bonifico|operazione)|interessi\s*negativi/],
  ["uscita", "U02-03-05", "rimborso COLF", /\bcolf\b/],
  ["uscita", "U03-01-01", "professionista", /studio\s+\w+(\s+\w+)?\s+associat|commercialist|\bnotai|avvocat|geometra|architett|professionist/],
  ["uscita", "U08-02-04", "spese postali", /francoboll|raccomandat|spese\s*postali/],
  ["uscita", "U09-01-01", "IMU", /\bimu\b/],
  ["entrata", "E04-01-01", "interessi attivi", /interessi\s*(attivi|creditori)|\bint\.?\s*e\s*comp|\bcompetenze\b/],
  ["entrata", "E01-01-02", "offerte per le Messe", /\bs{0,2}\.?\s*mess[ae]\b|intenzion|suffragio|trigesimo/],
  ["entrata", "E01-03-01", "battesimo", /battesim/],
  ["entrata", "E01-03-02", "prima Comunione", /comunion/],
  ["entrata", "E01-03-03", "cresima", /cresim/],
  ["entrata", "E01-03-04", "matrimonio", /matrimon|\bnozze\b/],
  ["entrata", "E01-03-05", "funerale", /funeral|esequie/],
  ["entrata", "E01-04-01", "benedizioni", /benedizion/],
  ["entrata", "E01-04-02", "lumi votivi", /lumi\b|lumini|ceri\s*votiv|candel/],
  ["entrata", "E01-04-03", "Caritas", /caritas|famiglie\s*(bisognose|disagiate|in\s*difficolta)|\bpoveri\b/],
  ["entrata", "E02-01-01", "offerte per lavori", /offert[ae]?\s*(per\s*)?(i\s*)?lavori|lavori\s*parrocchial|restaur/],
  ["entrata", "E03-01-01", "affitto di un immobile", /canone\s*(di\s*)?locazione|pigione|affitto\s*(appartamento|mensile|immobile|casa|negozio)/],
  ["entrata", "E01-04-04", "uso dei locali", /uso\s*(della\s*)?sala|uso\s*(dei\s*)?locali|\bsala\b|teatro|affitto/],
  ["entrata", "E01-04-05", "offerta", /offert|donazion|erogazion[ei]\s*liberal|contributo\s*volontario|elargizion|caffe/, true],
];

/** Regole per tipo: quelle della banca, poi (per le uscite) quelle delle fatture. */
function regoleTrovate(testo, segno, usabile) {
  const t = norm(testo);
  const tipoGiusto = (tipo) => tipo === "spostamento" || (segno > 0 ? tipo === "entrata" : tipo === "uscita");
  const trovate = REGOLE_BANCA.filter(([tipo, c, , re]) => tipoGiusto(tipo) && (tipo === "spostamento" || usabile(c)) && re.test(t))
    .map(([tipo, voce, nome, re, generica]) => ({ tipo, voce, nome, re, generica: Boolean(generica) }));
  if (segno < 0) for (const [voce, nome, re] of REGOLE) if (usabile(voce) && re.test(t)) trovate.push({ tipo: "uscita", voce, nome, re, generica: false });
  // il versamento di contanti è un'entrata in banca, il prelievo un'uscita
  return trovate.filter((r) => !(r.nome === "versamento di contanti" && segno < 0) && !(r.nome === "prelievo di contanti" && segno > 0));
}

/* ---------- fornitori conosciuti e fatture da pagare ---------- */

const PAROLE_VUOTE = new Set(["srl", "spa", "snc", "sas", "sarl", "societa", "soc", "coop", "cooperativa", "benefit", "di", "e", "del", "della", "dei", "il", "la", "studio", "ditta", "impresa", "az", "agr", "azienda", "agricola", "branch", "it", "eu"]);
const paroleNome = (s) => norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !PAROLE_VUOTE.has(w));

/** Quanto il nome di un fornitore compare nel testo della banca (0 = per niente, 1 = tutto). */
export function somiglianza(nomeFornitore, testo) {
  const p = paroleNome(nomeFornitore);
  if (!p.length) return 0;
  const t = " " + norm(testo).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ") + " ";
  const c = compatto(testo);
  const trovate = p.filter((w) => t.includes(" " + w + " ") || (w.length >= 6 && c.includes(w)));
  return trovate.length / p.length;
}

/** Il numero della fattura compare nel testo? I numeri corti (es. "12") valgono solo se preceduti da "ft", "fattura" o "n.". */
export function numeroNelTesto(numero, testo) {
  const n = norm(numero).replace(/\s/g, "");
  if (!n || !/\d/.test(n)) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const prima = n.length >= 3 ? "(^|[^a-z0-9/])" : "\\b(?:ft|fatt\\w*|fattura|n\\.?|nr\\.?)\\s*";
  return new RegExp(`${prima}${esc}(?![a-z0-9]|/\\d)`).test(norm(testo));
}

/** La rata da pagare che questo movimento probabilmente paga: {fattura, rata, motivo} oppure null. */
export function trovaFattura(riga, fatture, giaUsate = new Set()) {
  if (riga.importo >= 0) return null;
  const importo = -riga.importo;
  let migliore = null;
  for (const f of fatture) {
    if (f.eliminato || f.notaCredito) continue;
    for (const r of f.rate) {
      if (r.stato === PAGATA || r.importo !== importo || giaUsate.has(`${f.id}-${r.n}`)) continue;
      const nome = somiglianza(f.fornitore, riga.descrizione);
      const numero = numeroNelTesto(f.numero, riga.descrizione);
      if (nome < 0.5 && !numero) continue;
      const punti = nome + (numero ? 1 : 0) - Math.abs(Date.parse(r.scadenza || f.data) - Date.parse(riga.data)) / 864e5 / 3650;
      if (!migliore || punti > migliore.punti) migliore = { fattura: f, rata: r, punti, motivo: numero && nome >= 0.5 ? "stesso fornitore, numero e importo" : numero ? "stesso numero di fattura e importo" : "stesso fornitore e importo" };
    }
  }
  return migliore;
}

/** Fornitore già conosciuto (dalle fatture) con lo stesso nome: {nome, voce, quotaTeatro} oppure null. */
export function trovaFornitore(nome, fornitori) {
  const b = nomeBase(nome);
  if (b.length < 4) return null;
  return fornitori.find((f) => { const x = nomeBase(f.nome); return x.length >= 4 && (x === b || (Math.min(x.length, b.length) >= 6 && (x.startsWith(b) || b.startsWith(x)))); }) ?? null;
}

/* ---------- già in contabilità? ---------- */

const nettoSu = (m, conto) => m.righe.reduce((s, r) => s + (r.conto === conto ? r.dare - r.avere : 0), 0);
const giorni = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

/**
 * Movimento di Divisio che sembra lo stesso movimento della banca: stessa banca, stesso importo, date entro 7 giorni.
 * giaUsati: id dei movimenti già abbinati ad altre righe (ognuno vale una volta sola).
 */
export function trovaGiaRegistrato(riga, cassa, movimenti, giaUsati = new Set()) {
  let migliore = null;
  for (const m of movimenti) {
    if (m.eliminato || giaUsati.has(m.id) || m.tipo === "apertura") continue;
    if (nettoSu(m, cassa) !== riga.importo) continue;
    const g = Math.min(giorni(m.data, riga.data), riga.valuta ? giorni(m.data, riga.valuta) : 99);
    if (g > 7) continue;
    if (!migliore || g < migliore.g) migliore = { movimento: m, g };
  }
  return migliore?.movimento ?? null;
}

/* ---------- identificativo stabile di ogni riga ---------- */

/** Numero di 53 bit da un testo (cyrb53): sempre uguale per lo stesso testo. */
function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Impronte delle righe: due righe identiche nello stesso file restano distinte (1ª, 2ª…). */
export function impronteRighe(righe) {
  const visti = new Map();
  return righe.map((r) => {
    const base = `${r.data}|${r.importo}|${compatto(r.descrizione)}`;
    const k = (visti.get(base) ?? 0) + 1;
    visti.set(base, k);
    return hash(`${base}|${k}`);
  });
}

/* ---------- proposta per ogni riga ---------- */

/**
 * Prepara le righe lette dall'estratto conto per la revisione.
 * dati = { cassa (sottoconto della banca), movimenti (tutti quelli di Divisio), fatture, memorie: Map chiave→valore,
 *          fornitori: [{chiave, nome, voce, quotaTeatro}] (ricordati dalla pagina Fatture), contiAttivi: Set di codici, casse: [codici delle casse e banche] }
 * Ogni proposta: { ...riga, id, impronta, controparte, chiave, firma, descr, tipo, voce, altra, stato, livello, motivo, includi,
 *                  fattura?:{id, n, motivo}, giaRegistrato?:{id, descr, data}, quotaTeatro }
 * stato: "gia-importato" | "gia-registrato" | "fattura" | "pronto" | "da-completare"
 */
export function preparaRighe(righe, dati) {
  const { cassa, movimenti = [], fatture = [], memorie = new Map(), fornitori = [], contiAttivi, casse = [] } = dati;
  const usabile = (c) => Boolean(c) && (!contiAttivi || contiAttivi.has(c));
  const impronte = impronteRighe(righe);
  const importati = new Map(movimenti.filter((m) => !m.eliminato && m.banca?.riga).map((m) => [`${m.banca.cassa}|${m.banca.riga}`, m]));
  const usatiMov = new Set(), usateRate = new Set();
  const altre = casse.filter((c) => c !== cassa);

  return righe.map((r, i) => {
    const cp = controparte(r.descrizione);
    const base = { ...r, impronta: impronte[i], id: `banca-${cassa}-${impronte[i]}`, controparte: cp };
    const chiave = chiaveMemoria(base);
    // la firma distingue scelte diverse per lo stesso nome (es. "rimborso colf" e lo stipendio; i contratti luce e gas dello stesso fornitore)
    const fir = cp.mandato ? "sdd " + compatto(cp.mandato).slice(-12) : cp.nome ? firma(cp.causale) : firma(r.descrizione);
    const p = { ...base, chiave, firma: fir, descr: descrizioneProposta(base), tipo: r.importo > 0 ? "entrata" : "uscita", voce: "", altra: "",
      quotaTeatro: 0, stato: "da-completare", livello: "nessuno", motivo: "", includi: true, fattura: null, giaRegistrato: null };

    // 1. già importato da un estratto conto precedente
    const imp = importati.get(`${cassa}|${p.impronta}`);
    if (imp) { usatiMov.add(imp.id); return { ...p, stato: "gia-importato", includi: false, giaRegistrato: { id: imp.id, descr: imp.descr, data: imp.data }, motivo: "Già caricato da un estratto conto precedente." }; }
    return p;
  }).map((p) => {
    if (p.stato === "gia-importato") return p;
    const segno = Math.sign(p.importo);
    // 1b. già registrato a mano (o da una fattura pagata) in Divisio
    const gia = trovaGiaRegistrato(p, cassa, movimenti, usatiMov);
    if (gia) { usatiMov.add(gia.id); return { ...p, stato: "gia-registrato", includi: false, giaRegistrato: { id: gia.id, descr: gia.descr, data: gia.data }, motivo: `In Divisio c'è già «${gia.descr}» del ${gia.data.split("-").reverse().join("/")} con lo stesso importo.` }; }

    // 2. paga una fattura dello scadenzario
    const fa = trovaFattura(p, fatture, usateRate);
    const mem = p.chiave ? memorie.get(p.chiave) : null;
    const forn = p.controparte.nome ? trovaFornitore(p.controparte.nome, fornitori) : fa ? trovaFornitore(fa.fattura.fornitore, fornitori) : null;
    if (fa) {
      usateRate.add(`${fa.fattura.id}-${fa.rata.n}`);
      const ricordo = fornitori.find((x) => x.chiave === chiaveFornitore(fa.fattura)) ?? forn;
      const voce = usabile(ricordo?.voce) ? ricordo.voce : usabile(fa.rata.voce) ? fa.rata.voce : "";
      return { ...p, stato: "fattura", fattura: { id: fa.fattura.id, n: fa.rata.n, motivo: fa.motivo }, usaFattura: true, voce, quotaTeatro: Number(ricordo?.quotaTeatro) || 0,
        livello: voce ? "fornitore" : "nessuno", motivo: `Paga la fattura ${fa.fattura.fornitore} n. ${fa.fattura.numero} (${fa.motivo}).` };
    }

    // 3. scelta ricordata per questo nome
    const tipoMem = (s) => (s.tipo === "spostamento" || (segno > 0 ? s.tipo === "entrata" : s.tipo === "uscita"));
    const scelte = (mem?.scelte ?? []).filter((s) => tipoMem(s) && (s.tipo === "spostamento" ? s.altra && s.altra !== cassa : usabile(s.voce)));
    const stessa = scelte.find((s) => s.firma === p.firma);
    const usata = stessa ?? (scelte.length === 1 || !p.firma ? [...scelte].sort((a, b) => (b.volte ?? 0) - (a.volte ?? 0))[0] : null);
    if (usata) {
      const chi = mem.nome ? maiuscole(mem.nome) : "questo movimento";
      return pronto({ ...p, tipo: usata.tipo, voce: usata.tipo === "spostamento" ? "" : usata.voce, altra: usata.tipo === "spostamento" ? usata.altra : "", quotaTeatro: Number(usata.quotaTeatro) || 0,
        livello: "ricordato", motivo: stessa && p.firma ? `Scelta dell'ultima volta per ${chi} («${p.firma}»).` : `Scelta dell'ultima volta per ${chi}.` });
    }

    // 4. fornitore conosciuto dalle fatture
    if (forn && segno < 0 && usabile(forn.voce)) return pronto({ ...p, voce: forn.voce, quotaTeatro: Number(forn.quotaTeatro) || 0, livello: "fornitore", motivo: `È la voce usata per le fatture di ${forn.nome}.` });

    // 5. parole della descrizione (prima la descrizione, poi anche la categoria della banca)
    for (const testo of [p.descrizione, `${p.descrizione} ${p.categoria ?? ""}`]) {
      const trovate = regoleTrovate(testo, segno, usabile);
      if (!trovate.length) continue;
      const specifiche = trovate.filter((x) => !x.generica);
      const usate = specifiche.length ? specifiche : trovate;
      const voci = [...new Set(usate.map((x) => `${x.tipo}|${x.voce}`))];
      if (voci.length > 1) return { ...p, motivo: "Potrebbe riguardare più voci: scelga lei quella giusta." };
      const x = usate[0];
      const parola = norm(testo).match(x.re)?.[0]?.trim();
      if (x.tipo === "spostamento") {
        const altra = x.voce === "contanti" ? (casse.includes(CASSA_CONTANTI) && cassa !== CASSA_CONTANTI ? CASSA_CONTANTI : "") : altre.length === 1 ? altre[0] : "";
        return pronto({ ...p, tipo: "spostamento", altra, livello: "parole", motivo: `La descrizione contiene «${parola}»: è un ${x.nome}, non un'entrata né un'uscita (i soldi passano da un conto all'altro).` });
      }
      return pronto({ ...p, voce: x.voce, livello: "parole", motivo: `La descrizione contiene «${parola}» (${x.nome}).` });
    }
    return { ...p, motivo: "Divisio non sa quale voce usare: la scelga lei." };
  });
}

/** Una proposta è "pronta" quando ha tutto quello che serve per registrarla. */
export function completa(p) {
  if (p.stato === "fattura" && p.usaFattura) return Boolean(p.voce) || (p.quotaTeatro >= 100);
  if (p.tipo === "spostamento") return Boolean(p.altra);
  return Boolean(p.voce);
}
const pronto = (p) => ({ ...p, stato: completa(p) ? "pronto" : "da-completare" });
export const aggiornaStato = (p) => (["gia-importato", "gia-registrato", "fattura"].includes(p.stato) ? p : pronto(p));

/* ---------- registrazioni ---------- */

/**
 * Righe in partita doppia per una proposta (non per il pagamento di una fattura: quello lo fa segnaPagata).
 *  entrata: Dare banca / Avere voce   ·  uscita: Dare voce (+ teatro) / Avere banca
 *  spostamento: i soldi entrano nella banca dall'altra cassa (importo +) o escono verso l'altra (importo −)
 */
export function righeProposta(p, cassa, { contoTeatro } = {}) {
  const importo = Math.abs(p.importo);
  if (p.tipo === "spostamento") return p.importo > 0 ? scritturaSemplice({ tipo: "spostamento", importo, da: p.altra, verso: cassa }) : scritturaSemplice({ tipo: "spostamento", importo, da: cassa, verso: p.altra });
  if (p.tipo === "entrata") return scritturaSemplice({ tipo: "entrata", importo, voce: p.voce, cassa });
  return righePagamento({ notaCredito: false }, { importo }, { cassa, voce: p.voce, quotaTeatro: p.quotaTeatro || 0, contoTeatro });
}

/** Movimento di Divisio per una proposta. importazione = {id, file, il}. */
export function movimentoProposta(p, cassa, importazione, opz = {}) {
  return {
    id: p.id, data: p.data, descr: spazi(p.descr) || descrizioneProposta(p), tipo: p.tipo, righe: righeProposta(p, cassa, opz), origine: "banca",
    banca: datiBanca(p, cassa, importazione),
  };
}

export const datiBanca = (p, cassa, importazione) => ({ cassa, riga: p.impronta, importazione: importazione.id, file: importazione.file, il: importazione.il, testo: p.descrizione, valuta: p.valuta || "" });

/** Modalità di pagamento della fattura ricavata dalla descrizione della banca. */
export const modalitaDaTesto = (testo) => (/\bsdd\b|addebito\s*diretto|\brid\b/i.test(testo) ? "MP19" : /bonif|disposizione|\bsct\b/i.test(testo) ? "MP05" : /\bpos\b|carta|bancomat/i.test(testo) ? "MP08" : "");

/**
 * Aggiorna la memoria di un nome con la scelta fatta. valore = {nome, scelte:[{tipo, voce, altra, firma, quotaTeatro, volte, ultima}]}
 * Tiene al massimo 8 scelte diverse per nome (le più recenti).
 */
export function ricorda(valore, p, oggi) {
  const scelta = { tipo: p.tipo, voce: p.tipo === "spostamento" ? "" : p.voce, altra: p.tipo === "spostamento" ? p.altra : "", firma: p.firma, quotaTeatro: p.quotaTeatro || 0 };
  const scelte = (valore?.scelte ?? []).filter((s) => !(s.firma === scelta.firma && (s.tipo === "spostamento") === (scelta.tipo === "spostamento") && (s.tipo === "entrata") === (scelta.tipo === "entrata")));
  const prima = (valore?.scelte ?? []).find((s) => s.firma === scelta.firma && s.tipo === scelta.tipo && s.voce === scelta.voce && s.altra === scelta.altra);
  scelte.unshift({ ...scelta, volte: (prima?.volte ?? 0) + 1, ultima: oggi });
  return { nome: p.controparte?.nome ? maiuscole(p.controparte.nome) : valore?.nome || firma(p.descrizione), scelte: scelte.slice(0, 8) };
}

/** Riepilogo delle importazioni già fatte (dai movimenti): [{id, file, il, cassa, n, dal, al}] dalla più recente. */
export function importazioni(movimenti) {
  const m = new Map();
  for (const x of movimenti) {
    if (x.eliminato || !x.banca?.importazione) continue;
    const i = m.get(x.banca.importazione) ?? { id: x.banca.importazione, file: x.banca.file, il: x.banca.il, cassa: x.banca.cassa, n: 0, dal: x.data, al: x.data };
    i.n++;
    if (x.data < i.dal) i.dal = x.data;
    if (x.data > i.al) i.al = x.data;
    m.set(i.id, i);
  }
  return [...m.values()].sort((a, b) => String(b.il).localeCompare(String(a.il)));
}
