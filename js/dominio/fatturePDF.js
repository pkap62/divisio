// Dati di una fattura dal TESTO di un PDF (il testo e la posizione delle parole li estrae dati/pdf.js con il lettore di Mozilla).
// Regole riprese dallo "Scadenzario-fatture" e rese prudenti: ogni campo è "sicuro" solo quando c'è un'unica risposta chiara;
// altrimenti finisce in `incerti` e va controllato a mano. Divisio non indovina: meglio un campo vuoto che un campo sbagliato.
//
// Come legge:
//  - i valori scritti accanto all'etichetta ("Totale documento 258,62") oppure SOTTO, nella stessa colonna di una tabella
//    ("Numero   Data" e sotto "2025V1001859   30/11/2025");
//  - gli importi si controllano a vicenda: imponibile + IVA = totale;
//  - la scritta "PAGATA … 19/02/2026" messa sul PDF diventa una proposta di pagamento;
//  - per ogni fornitore Divisio impara DOVE stanno i dati nel suo PDF (modello), riconoscendolo dalla partita IVA,
//    dall'IBAN, dall'e-mail o dal sito: dalla volta dopo li legge da lì, anche se il nome è solo nel logo.

import { parseEuro } from "./importi.js";

const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
const RE_DATA = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b|\b(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})\b|\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\.?\s+(\d{4})\b/gi;
const RE_IMPORTO = /(?:€\s*)?(-?\d{1,3}(?:[.'\s]\d{3})+,\d{2}|-?\d+,\d{2}|-?\d{1,3}(?:,\d{3})+\.\d{2}|-?\d+\.\d{2})(?!\d)/g;
const RE_IBAN = /\bIT\s?\d{2}\s?[A-Z]\s?(?:[\dA-Z]\s?){22}\b/g;

const due = (n) => String(n).padStart(2, "0");
function dataISO(m) {
  let g, me, a;
  if (m[1]) { g = +m[1]; me = +m[2]; a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
  else if (m[4]) { a = +m[4]; me = +m[5]; g = +m[6]; }
  else { g = +m[7]; me = MESI[m[8].toLowerCase()]; a = +m[9]; }
  if (!(g >= 1 && g <= 31 && me >= 1 && me <= 12 && a >= 1990 && a <= 2100)) return "";
  return `${a}-${due(me)}-${due(g)}`;
}
const date = (s) => [...String(s).matchAll(RE_DATA)].map(dataISO).filter(Boolean);
function importi(s) {
  return [...String(s).matchAll(RE_IMPORTO)].map((m) => {
    let t = m[1].replace(/['\s]/g, "");
    if (/,\d{3}\.\d{2}$/.test(t)) t = t.replace(/,/g, "");   // 1,234.56 (all'inglese)
    return parseEuro(t);
  }).filter((c) => Number.isInteger(c));
}
const distinti = (l) => [...new Set(l)];

/* ---------- righe con la posizione delle parole ---------- */

/**
 * Righe dal solo testo (prove automatiche, PDF già letti): la posizione delle parole si stima dai caratteri,
 * come in un testo a spaziatura fissa. Ogni riga: {p, y, parole:[{s, x, x2}]}.
 */
export function righeDaTesto(testo) {
  return String(testo ?? "").split(/\r?\n/).map((riga, i) => ({
    p: 1, y: i / 100,
    parole: [...riga.matchAll(/\S+/g)].map((m) => ({ s: m[0], x: m.index / 100, x2: (m.index + m[0].length) / 100 })),
  }));
}

/** Righe pronte: testo con uno spazio tra le parole e, per ogni parola, dove comincia e finisce nel testo. */
function prepara(righe) {
  return righe.map((r) => {
    let pos = 0;
    const parole = (r.parole ?? []).filter((w) => w.s.trim()).map((w) => { const o = { ...w, da: pos, a: pos + w.s.length }; pos += w.s.length + 1; return o; });
    return { p: r.p ?? 1, y: r.y ?? 0, t: parole.map((w) => w.s).join(" "), parole };
  }).filter((r) => r.t).map((r, i) => ({ ...r, i }));
}
const paroleTra = (r, da, a) => r.parole.filter((w) => w.a > da && w.da < a);
const sovrapposte = (w, xa, xb, tol = 0.006) => w.x2 > xa - tol && w.x < xb + tol;

/**
 * Valori vicino a un'etichetta. Per ogni etichetta trovata:
 *  - accanto: nel resto della riga (al massimo 60 caratteri dopo);
 *  - sotto: nelle 3 righe dopo, tra le parole nella stessa colonna dell'etichetta;
 *  - dopo (meno sicuro): nelle 2 righe dopo, se l'etichetta è quasi da sola sulla sua riga.
 * escludi: se il testo intorno all'etichetta corrisponde, l'etichetta non vale (es. "R.E.A. … N°").
 * Restituisce [{v, livello}] (livello 1 = accanto o sotto, 2 = dopo).
 */
function vicino(R, etichetta, estrai, { escludi, sotto = true } = {}) {
  const out = [];
  const re = new RegExp(etichetta.source, etichetta.flags.includes("g") ? etichetta.flags : etichetta.flags + "g");
  for (const r of R) {
    for (const m of r.t.matchAll(re)) {
      const intorno = r.t.slice(Math.max(0, m.index - 18), m.index + m[0].length + 12);
      if (escludi && escludi.test(intorno)) continue;
      const fine = m.index + m[0].length;
      let v = estrai(r.t.slice(fine, fine + 60));
      if (v.length) { out.push({ v: v[0], livello: 1, riga: r.i }); continue; }
      const parole = paroleTra(r, m.index, fine);
      if (sotto && parole.length) {
        const xa = Math.min(...parole.map((w) => w.x)), xb = Math.max(...parole.map((w) => w.x2));
        let trovato = false;
        for (let k = 1; k <= 3 && !trovato; k++) {
          const s = R[r.i + k];
          if (!s || s.p !== r.p) break;
          const colonna = s.parole.filter((w) => sovrapposte(w, xa, xb));
          if (!colonna.length) continue;
          v = estrai(colonna.map((w) => w.s).join(" "));
          if (v.length) { out.push({ v: v[0], livello: 1, riga: s.i }); trovato = true; }
        }
        if (trovato) continue;
      }
      if (r.parole.length - parole.length <= 3) {
        for (let k = 1; k <= 2; k++) {
          const s = R[r.i + k];
          if (!s) break;
          v = estrai(s.t);
          if (v.length) { out.push({ v: v[0], livello: 2, riga: s.i }); break; }
        }
      }
    }
  }
  return out;
}

/** Esito di un campo: {valore, sicuro}. candidati in ordine di affidabilità, a gruppi (livelli): vince il primo gruppo non vuoto. */
function scegli(...gruppi) {
  for (const g of gruppi) {
    const d = distinti(g.filter((x) => x !== "" && x != null));
    if (d.length) return { valore: d[0], sicuro: d.length === 1 };
  }
  return { valore: "", sicuro: false };
}
const livello = (cand, n) => cand.filter((c) => c.livello === n).map((c) => c.v);

const MODI = [
  [/\bbonifico\b/i, "MP05"], [/\bri\.?\s?ba\b|ricevuta bancaria/i, "MP12"], [/addebito diretto|\bsdd\b|\brid\b|domiciliazione/i, "MP19"],
  [/\bcontanti\b/i, "MP01"], [/\bpago\s?pa\b/i, "MP23"], [/bollettino postale/i, "MP18"], [/\bassegno\b/i, "MP02"], [/carta di (credito|pagamento|debito)/i, "MP08"], [/\bmav\b/i, "MP13"],
];
const modalitaIn = (s) => distinti(MODI.filter(([re]) => re.test(s)).map(([, c]) => c));

// Alcuni PDF perdono le legature "ti" e "tt": "Partita" diventa "Partta", "fattura" "fatura", "netto" "neto".
const FATTURA = String.raw`fatt?ura`;
const PARTITA_IVA = String.raw`(?:par?t+i?t*a\s*i\.?\s*v\.?\s*a\.?|p\.?\s*i\.?\s*v\.?\s*a\.?|codice\s*iva|vat\s*(?:number|n\.?|no\.?|code)?)`;
const RE_PIVA = new RegExp(String.raw`\b` + PARTITA_IVA + String.raw`[^\d\n]{0,25}?(?:IT\s*)?(\d{11})\b`, "gi");
const RE_NUM_FATTURA = new RegExp(String.raw`\b${FATTURA}\b(?:\s+(?:di\s+vendita|immediata|elettronica|differita|accompagnatoria|n\.?\s*ro))?\s*(?:n(?:r|um(?:ero)?)?\s*\.?|n°|nº)?\s*[:.]?\s*([A-Z]{0,8}[-/]?\d[\w/.\-]{0,24})\s+(?:del|data|in\s+data)\s*[:.]?\s*`, "i");
const RE_NUM_FATTURA_N = new RegExp(String.raw`\b${FATTURA}\b\s*(?:n(?:r|um(?:ero)?)?\s*\.|n°|nº|numero|nr)\s*[:.]?\s*([A-Z]{0,8}[-/]?\d[\w/.\-]{0,24})`, "i");
const NON_FATTURA = /pro\s*-?\s*forma|preventivo|documento\s+commerciale|formulario|\bddt\b|ordine|nota\s+di\s+consegna|copia\s+(?:informatica|analogica|di\s+cortesia)|ai\s+sensi/i;
const TIMBRO = /\bpagat[ao]\b/i;
const INDIRIZZO = /\b(via|viale|piazza|p\.?\s?zza|corso|largo|vicolo|loc\.|località|strada|tel\.?|telefono|fax|cell|e-?mail|pec|www\.|https?:|@|sede|capitale|registro|r\.?e\.?a\.?|c\.?f\.?|codice\s*fiscale|cap\b|iban|banca|aut\.)/i;
const CLIENTE = /\b(spett(?:\.|abile)?(?:\s*le)?|messrs|destinatario|intestatario|cessionario|committente|cliente|fatturare\s+a)\b/i;

/** Identificativi del fornitore nel PDF (partite IVA, IBAN, e-mail, siti), per riconoscerlo la volta dopo. */
function impronteDi(R, { esclusi, nomiParrocchia }) {
  const out = [];
  const tutto = R.map((r) => r.t).join("\n");
  for (const m of tutto.matchAll(RE_PIVA)) if (!esclusi.has(m[1])) out.push(`piva:${m[1]}`);
  R.forEach((r, i) => {
    // l'IBAN di chi paga (ricevuta del bonifico allegata: "Dati ordinante") è quello della parrocchia
    const ordinante = R.slice(Math.max(0, i - 3), i + 1).some((x) => /ordinante/i.test(x.t)) && !/beneficiario/i.test(r.t);
    if (!ordinante && !nomiParrocchia.some((n) => n && r.t.toLowerCase().includes(n))) {
      for (const m of r.t.matchAll(RE_IBAN)) out.push(`iban:${m[0].replace(/\s/g, "")}`);
    }
  });
  for (const m of tutto.matchAll(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g)) out.push(`email:${m[0].toLowerCase()}`);
  for (const m of tutto.matchAll(/\bwww\.([\w-]+(?:\.[\w-]+)+)\b/gi)) out.push(`web:${m[1].toLowerCase()}`);
  return distinti(out);
}

/**
 * Modello ricordato per il fornitore di questo PDF: quello che ha più identificativi in comune
 * (la partita IVA conta più di tutto). Gli identificativi presenti in più modelli non contano (es. l'IBAN della parrocchia).
 */
export function trovaModello(impronte, modelli = []) {
  if (!impronte.length || !modelli.length) return null;
  const quanti = new Map();
  for (const m of modelli) for (const x of new Set(m.valore?.impronte ?? [])) quanti.set(x, (quanti.get(x) ?? 0) + 1);
  const punti = modelli.map((m) => {
    const proprie = new Set((m.valore?.impronte ?? []).filter((x) => quanti.get(x) === 1));
    return { m, punti: impronte.filter((x) => proprie.has(x)).reduce((t, x) => t + (x.startsWith("piva:") ? 10 : 3), 0) };
  }).filter((x) => x.punti > 0).sort((a, b) => b.punti - a.punti);
  if (!punti.length || (punti[1] && punti[1].punti === punti[0].punti)) return null;
  return punti[0].m;
}

const TIPO_CAMPO = { numero: "testo", data: "data", scadenza: "data", imponibile: "importo", iva: "importo", totale: "importo" };
const valoreParola = (s, tipo) => (tipo === "importo" ? importi(s)[0] : tipo === "data" ? date(s)[0] : s.replace(/[.,;:]+$/, "")) ?? "";

/** Valore che, nel PDF, si trova in una delle posizioni ricordate (stessa pagina, stessa altezza, stessa colonna). */
function nellaPosizione(R, posizioni = [], tipo) {
  for (const pos of posizioni) {
    let migliore = null;
    for (const r of R) {
      const dy = Math.abs(r.y - pos.y);
      if (r.p !== pos.p || dy > 0.01) continue;
      for (const [k, w] of r.parole.entries()) {
        const dx = Math.abs(w.x - pos.x), d = dx + 2 * dy;
        if (dx > 0.02 || (migliore && migliore.d <= d)) continue;
        // una data o un importo possono essere divisi in due parole ("17 giugno 2026", "€ 50,00")
        const v = valoreParola(w.s, tipo) || (tipo !== "testo" ? valoreParola(r.parole.slice(k, k + 3).map((x) => x.s).join(" "), tipo) : "");
        if (v !== "") migliore = { d, v };
      }
    }
    if (migliore) return migliore.v;
  }
  return "";
}

/**
 * Impara dove stanno i dati nel PDF di un fornitore, dai valori controllati dall'utente.
 * righe: quelle di dati/pdf.js (o di righeDaTesto). dati: la fattura come è stata aggiunta.
 * precedente: il modello già ricordato (si aggiorna). Restituisce il nuovo modello, da salvare nelle impostazioni.
 */
export function imparaModello(righe, dati, { precedente = null, escludiPiva = [], nomiParrocchia = [] } = {}) {
  const R = prepara(righe ?? []);
  const esclusi = new Set(escludiPiva.map((x) => String(x).replace(/\D/g, "")).filter(Boolean));
  const valori = { numero: dati.numero, data: dati.data, imponibile: dati.imponibile, iva: dati.iva, totale: dati.totale, scadenza: dati.rate?.[0]?.scadenza };
  const campi = { ...(precedente?.campi ?? {}) };
  for (const [k, valore] of Object.entries(valori)) {
    if (valore === "" || valore == null || valore === 0) continue;
    const tipo = TIPO_CAMPO[k];
    const posizioni = [];
    for (const r of R) for (const w of r.parole) {
      if (posizioni.length >= 3) break;
      const v = valoreParola(w.s, tipo);
      const uguale = tipo === "testo" ? v.toUpperCase() === String(valore).toUpperCase() : v === valore;
      if (uguale) posizioni.push({ p: r.p, x: Math.round(w.x * 1000) / 1000, y: Math.round(r.y * 1000) / 1000 });
    }
    if (posizioni.length) campi[k] = posizioni;
  }
  const impronte = distinti([...(dati.piva ? [`piva:${dati.piva}`] : []), ...impronteDi(R, { esclusi, nomiParrocchia: nomiParrocchia.map((n) => String(n).toLowerCase()) }),
    ...(precedente?.impronte ?? [])]).slice(0, 16);
  return { nome: dati.fornitore, piva: dati.piva || "", impronte, campi, volte: (precedente?.volte ?? 0) + 1 };
}

/** Coppie imponibile + IVA = totale tra gli importi del PDF; vince quella con le etichette e l'aliquota più convincenti. */
function risolviImporti(tutti, pesi) {
  const presenti = new Set(tutti);
  const peso = (tipo, v) => pesi[tipo].get(v) ?? 0;
  const totali = pesi.totale.size ? [...pesi.totale.keys()] : [];
  let migliore = null, pari = false;
  for (const T of totali) {
    for (const I of presenti) {
      const V = T - I;
      if (!(I > 0 && V >= 0 && V <= I * 0.3)) continue;
      if (V === 0 ? !peso("imponibile", I) : !presenti.has(V)) continue;
      const aliquota = V > 0 && [0.04, 0.05, 0.1, 0.22].some((a) => Math.abs(I * a - V) <= 2 + I * 0.002);
      const punti = peso("totale", T) * 2 + peso("imponibile", I) + peso("iva", V) + (aliquota ? 3 : 0);
      if (!aliquota && !peso("imponibile", I) && !peso("iva", V)) continue;
      if (!migliore || punti > migliore.punti) { migliore = { imponibile: I, iva: V, totale: T, punti }; pari = false; }
      else if (punti === migliore.punti && (I !== migliore.imponibile || T !== migliore.totale)) pari = true;
    }
  }
  return migliore ? { ...migliore, sicuro: !pari } : null;
}

/**
 * testo: testo del PDF, una riga per riga visiva.
 * opz.righe: le stesse righe con la posizione delle parole (da dati/pdf.js); senza, la posizione si stima dal testo.
 * opz.escludiPiva: partite IVA / codici fiscali da ignorare (quelli della parrocchia).
 * opz.nomiParrocchia: nomi con cui la parrocchia compare nelle fatture (per non scambiarla per il fornitore).
 * opz.fornitoriNoti: Map partitaIva → nome, per riconoscere un fornitore già visto.
 * opz.modelli: modelli ricordati [{chiave, valore}] (vedi imparaModello).
 */
export function leggiFatturaDaTesto(testo, { righe = null, escludiPiva = [], nomiParrocchia = [], fornitoriNoti = new Map(), modelli = [] } = {}) {
  const R = prepara(righe ?? righeDaTesto(testo));
  const vuota = { fornitore: "", piva: "", cf: "", intestatario: "", numero: "", data: "", tipoDoc: "TD01", notaCredito: false,
    imponibile: 0, iva: 0, totale: 0, ritenuta: 0, descrizione: "", righe: [], rate: [{ n: 1, scadenza: "", importo: 0, modalita: "", iban: "" }] };
  const tuttiICampi = ["fornitore", "piva", "numero", "data", "imponibile", "iva", "totale", "scadenza", "modalita"];

  if (R.map((r) => r.t).join("").replace(/\s/g, "").length < 40) {
    return { ...vuota, scansione: true, incerti: tuttiICampi, impronte: [], pagata: null, modello: null,
      avvisi: ["Questo PDF è una scansione (un'immagine): Divisio non può leggerlo. Compili i campi guardando il PDF."] };
  }
  const tutto = R.map((r) => r.t).join("\n");
  const incerti = [], avvisi = [];
  const esclusi = new Set(escludiPiva.map((x) => String(x).replace(/\D/g, "")).filter(Boolean));
  const nomiPar = nomiParrocchia.map((n) => String(n).toLowerCase().trim()).filter((n) => n.length > 3);

  // righe del destinatario (la parrocchia): non contengono il fornitore
  const delCliente = new Set();
  R.forEach((r) => {
    if (CLIENTE.test(r.t)) for (let k = 0; k <= 4; k++) delCliente.add(r.i + k);
    if (/parrocchia/i.test(r.t) || nomiPar.some((n) => r.t.toLowerCase().includes(n))) delCliente.add(r.i);
  });
  const timbro = R.filter((r) => TIMBRO.test(r.t) && date(r.t).length && r.t.length < 70 && !/da\s+pagare|non\s+pagat/i.test(r.t));

  // ---------- partita IVA ----------
  const pive = distinti([...tutto.matchAll(RE_PIVA)].map((m) => m[1]).filter((p) => !esclusi.has(p)));
  const piveDeboli = distinti([...tutto.matchAll(/\bIT\s?(\d{11})\b/g)].map((m) => m[1]).filter((p) => !esclusi.has(p)));
  let piva = scegli(pive, piveDeboli);
  if (!pive.length) piva.sicuro = false;

  // ---------- modello ricordato ----------
  const impronte = distinti([...pive.map((p) => `piva:${p}`), ...impronteDi(R, { esclusi, nomiParrocchia: nomiPar })]);
  const modello = trovaModello(impronte, modelli);
  const dalModello = {};
  if (modello) {
    for (const [k, tipo] of Object.entries(TIPO_CAMPO)) {
      const v = nellaPosizione(R, modello.valore.campi?.[k], tipo);
      if (v !== "" && v != null) dalModello[k] = v;
    }
    if (modello.valore.piva && !piva.valore) piva = { valore: modello.valore.piva, sicuro: true };
    else if (modello.valore.piva === piva.valore) piva.sicuro = true;
  }

  // ---------- fornitore ----------
  let fornitore = { valore: "", sicuro: false };
  if (piva.valore && fornitoriNoti.get(piva.valore)) fornitore = { valore: fornitoriNoti.get(piva.valore), sicuro: true };
  else if (modello?.valore.nome) fornitore = { valore: modello.valore.nome, sicuro: true };
  else {
    const pulisci = (s) => s.replace(/^(cedente|prestatore|fornitore|mittente|nome\s+beneficiario|beneficiario)[^:]*:\s*/i, "")
      .replace(/\s+(filiale|banca|iban|p\.?\s?iva|partita|c\.?f\.?)\b.*$/i, "").trim().slice(0, 120);
    const beneficiario = R.filter((r) => /\bbeneficiario\s*:/i.test(r.t)).map((r) => pulisci(r.t.slice(r.t.search(/beneficiario\s*:/i))));
    // le righe del nome sopra la partita IVA del fornitore (intestazione: nome, indirizzo, telefono, P.IVA)
    const sopra = [];
    const rigaPiva = piva.valore ? R.find((r) => r.t.includes(piva.valore) && !delCliente.has(r.i)) : null;
    if (rigaPiva) {
      const nome = [];
      for (let k = rigaPiva.i - 1; k >= Math.max(0, rigaPiva.i - 6); k--) {
        const r = R[k];
        const daSaltare = delCliente.has(k) || TIMBRO.test(r.t) || INDIRIZZO.test(r.t) || /\b\d{5}\b/.test(r.t);
        if (!daSaltare && /[a-zà-ù]{2}/i.test(r.t) && r.t.length < 70) nome.unshift(r.t);
        else if (nome.length) break;
      }
      if (nome.length) sopra.push(nome.join(" "));
    }
    const dopoCedente = vicino(R, /(cedente|prestatore|fornitore|mittente)\b[^:]*:?/i, (s) => (s.trim().length > 2 && !/\d{11}/.test(s) ? [s.trim()] : []), { sotto: false })
      .filter((c) => !delCliente.has(c.riga)).map((c) => c.v);
    const conSigla = R.filter((r) => !delCliente.has(r.i) && !/\b(banca|banco|bank|iban|poste)\b/i.test(r.t) && !TIMBRO.test(r.t)
      && /\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|soc\.?\s*coop|cooperativa|ditta|studio|associati)\b/i.test(r.t) && r.t.length < 80).map((r) => r.t);
    fornitore.valore = pulisci(beneficiario[0] || sopra[0] || dopoCedente[0] || conSigla[0] || "");
  }

  // ---------- numero e data ----------
  const forti = [];
  for (const r of R) {
    if (NON_FATTURA.test(r.t) || TIMBRO.test(r.t)) continue;
    const m = RE_NUM_FATTURA.exec(r.t);
    if (m) { forti.push({ numero: m[1].replace(/[.]$/, ""), data: date(r.t.slice(m.index + m[0].length, m.index + m[0].length + 30))[0] ?? "" }); continue; }
    const n = RE_NUM_FATTURA_N.exec(r.t);
    if (n) forti.push({ numero: n[1].replace(/[.]$/, ""), data: "" });
  }
  const escludiNumero = /client|contratt|\bpod\b|\bpdr\b|telefon|ordine|\bddt\b|utenza|partita|codice\s*fiscale|pagin|conto|iban|riferimento|r\.?\s?e\.?\s?a\.?|registro|formulario|commerciale|pro\s*-?forma|\bpag\b|albo|aut\.|verde|\btel\b|telefono|fax/i;
  const estraiNumero = (s) => [...s.matchAll(/(?:^|\s)([A-Z]{0,8}[-/]?\d[\w/.\-]{0,24})(?=\s|$)/gi)].map((m) => m[1].replace(/[.]$/, ""))
    .filter((x) => !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(x) && !/^\d+,\d{2}$/.test(x)).slice(0, 1);
  const candNumero = vicino(R, /(numero\s*(documento|fattura)?|\bn[°.r]+\s*(documento|fattura)|documento\s*n\.?|\bnumero\b)\s*[:.]?/i, estraiNumero, { escludi: escludiNumero });
  // il valore trovato dove il fornitore lo scrive di solito vince; se però la lettura normale è sicura e dice altro, va controllato
  const conModello = (k, letto) => {
    const m = dalModello[k];
    if (m === undefined) return letto;
    return { valore: m, sicuro: letto.valore === "" || letto.valore === m || !letto.sicuro };
  };
  const numeroLetto = scegli(forti.map((f) => f.numero), livello(candNumero, 1), livello(candNumero, 2));
  if (!forti.length && candNumero.length && !livello(candNumero, 1).length) numeroLetto.sicuro = false;
  const numero = conModello("numero", numeroLetto);

  const escludiData = /scadenz|scade|entro|limite|pagat|esecuzione|nascita|intervento|consegna|ddt|ordine|commerciale|formulario|pro\s*-?forma|albo|creato|stampa/i;
  const righeTimbro = new Set(timbro.map((r) => r.i));
  const candData = vicino(R, /\bdata\s*(del\s*)?(documento|fattura|emissione)?\s*[:.]?/i, date, { escludi: escludiData }).filter((c) => !righeTimbro.has(c.riga));
  const delDocumento = R.filter((r) => new RegExp(`${FATTURA}|documento`, "i").test(r.t) && /\bdel\b/i.test(r.t) && !escludiData.test(r.t) && !NON_FATTURA.test(r.t))
    .flatMap((r) => date(r.t.slice(r.t.search(/\bdel\b/i)))).slice(0, 1);
  const dataDoc = conModello("data", scegli(forti.map((f) => f.data), livello(candData, 1), livello(candData, 2), delDocumento));

  const candScadenza = vicino(R, /(data\s*(di\s*)?scadenz[ae]|scadenz[ae](\s*(del\s*)?pagament[oi])?|scade\s*il|da\s*pagare\s*entro|pagare\s*entro|entro\s*il|data\s*limite)\s*[:.]?/i, date);
  const scadenza = conModello("scadenza", scegli(livello(candScadenza, 1), livello(candScadenza, 2)));

  // ---------- importi ----------
  const tuttiImporti = distinti(R.filter((r) => !TIMBRO.test(r.t)).flatMap((r) => importi(r.t)).filter((c) => c > 0));
  const etichettaTotale = new RegExp(String.raw`(tot(?:ale)?\.?\s*(documento|fattura|da\s*pagare|a\s*pagare|dovuto|complessivo|bolletta)|${String.raw`nett?o`}\s*(da|a)\s*pagare|importo\s*(totale|da\s*pagare))\s*(euro|eur)?\s*[:.]?\s*(€)?`, "i");
  const totaleForte = vicino(R, etichettaTotale, importi);
  const totaleDebole = vicino(R, /\btotale\b/i, importi, { escludi: /imponibile|iva|imposta|merce|righe|parziale|sconto|rimbors|competenz|ritenuta|quantit/i });
  const imponibili = vicino(R, /(totale\s*)?imponibile\s*(iva|euro|eur)?\s*[:.]?/i, importi, { escludi: /ritenuta|rit\.?\s*acc/i });
  const ive = vicino(R, /(totale\s*iva|totale\s*imposta|\bimposta\b|\biva\b)\s*(euro|eur)?\s*[:.]?/i, (s) => importi(s.replace(/\b\d{1,2}([.,]\d{1,2})?\s*%/g, "")),
    { escludi: /partita|p\.\s*iva|codice|identificativo|esente|esclus|aliquota\s*$|%\s*iva|imponibile\s*iva/i });
  const pesi = { totale: new Map(), imponibile: new Map(), iva: new Map() };
  const aggiungi = (mappa, cand, forza) => { for (const c of cand) mappa.set(c.v, Math.max(mappa.get(c.v) ?? 0, forza - (c.livello - 1))); };
  aggiungi(pesi.totale, totaleForte, 3); aggiungi(pesi.totale, totaleDebole, 1);
  aggiungi(pesi.imponibile, imponibili, 2); aggiungi(pesi.iva, ive, 2);
  for (const k of ["totale", "imponibile", "iva"]) if (dalModello[k]) pesi[k].set(dalModello[k], 5);

  let imponibile, iva, totale;
  const coppia = risolviImporti(tuttiImporti, pesi);
  if (coppia && coppia.sicuro) {
    imponibile = { valore: coppia.imponibile, sicuro: true }; iva = { valore: coppia.iva, sicuro: true }; totale = { valore: coppia.totale, sicuro: true };
  } else {
    totale = scegli(livello(totaleForte, 1), livello(totaleForte, 2));
    if (!totaleForte.length) totale = { valore: totaleDebole.map((c) => c.v).at(-1) ?? "", sicuro: false };
    imponibile = scegli(livello(imponibili, 1), livello(imponibili, 2));
    iva = scegli(livello(ive, 1), livello(ive, 2));
    if (coppia) { imponibile = { valore: coppia.imponibile, sicuro: false }; iva = { valore: coppia.iva, sicuro: false }; totale = { valore: coppia.totale, sicuro: false }; }
    const imp = imponibile.valore === "" ? null : imponibile.valore, iv = iva.valore === "" ? null : iva.valore;
    if (imp !== null && iv !== null && totale.valore !== "" && imp + iv === totale.valore) { if (!coppia) imponibile.sicuro = iva.sicuro = totale.sicuro = true; }
    else if (imp !== null && iv !== null && totale.valore === "") { totale = { valore: imp + iv, sicuro: false }; avvisi.push("Il totale è stato calcolato sommando imponibile e IVA: lo controlli."); }
    else if (imp !== null && iv !== null) { imponibile.sicuro = iva.sicuro = false; }
  }

  // ---------- pagamento ----------
  const modi = modalitaIn(tutto);
  const modalita = { valore: modi[0] ?? "", sicuro: modi.length === 1 };
  const ibanFornitore = impronte.find((x) => x.startsWith("iban:"))?.slice(5) ?? "";
  const pagata = timbro.length ? { data: date(timbro[0].t)[0], modalita: modalitaIn(timbro[0].t)[0] ?? "" } : null;
  if (pagata) {
    avvisi.push(`Sul PDF c'è scritto «${timbro[0].t}»: dopo averla aggiunta, Divisio le proporrà di segnarla pagata il ${pagata.data.split("-").reverse().join("/")}.`);
    if (!modalita.valore && pagata.modalita) { modalita.valore = pagata.modalita; modalita.sicuro = true; }
  }

  const campi = { fornitore, piva, numero, data: dataDoc, imponibile, iva, totale, scadenza, modalita };
  for (const [k, v] of Object.entries(campi)) if (!v.sicuro || v.valore === "") incerti.push(k);
  if (pagata && incerti.includes("scadenza") && !scadenza.valore) incerti.splice(incerti.indexOf("scadenza"), 1);
  const notaCredito = /nota\s*di\s*credito/i.test(tutto.slice(0, 2000));
  const ce = (v) => (v.valore === "" ? 0 : Math.abs(v.valore));

  return {
    ...vuota,
    fornitore: fornitore.valore, piva: piva.valore, numero: numero.valore, data: dataDoc.valore, notaCredito, tipoDoc: notaCredito ? "TD04" : "TD01",
    imponibile: ce(imponibile), iva: ce(iva), totale: ce(totale),
    descrizione: R.slice(0, 60).map((r) => r.t).join(" ").slice(0, 600),
    rate: [{ n: 1, scadenza: scadenza.valore, importo: ce(totale), modalita: modalita.valore, iban: ibanFornitore }],
    incerti, avvisi, scansione: false, impronte, pagata, modello: modello ? modello.chiave : null,
  };
}
