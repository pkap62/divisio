// Dati di una fattura dal TESTO di un PDF (il testo lo estrae dati/pdf.js con il lettore di Mozilla).
// Regole riprese dallo "Scadenzario-fatture" (pdfInstallmentDetector.ts, server.ts) e rese prudenti:
// ogni campo è "sicuro" solo quando c'è un'unica risposta chiara; altrimenti finisce in `incerti`
// e va controllato a mano. Divisio non indovina: meglio un campo vuoto che un campo sbagliato.

import { parseEuro } from "./importi.js";

const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
const RE_DATA = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b|\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\.?\s+(\d{4})\b/gi;
const RE_IMPORTO = /(?:€\s*)?(-?\d{1,3}(?:[.'\s]\d{3})+,\d{2}|-?\d+,\d{2}|-?\d{1,3}(?:,\d{3})+\.\d{2}|-?\d+\.\d{2})(?!\d)/g;

const due = (n) => String(n).padStart(2, "0");
function dataISO(m) {
  let g, me, a;
  if (m[1]) { g = +m[1]; me = +m[2]; a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
  else { g = +m[4]; me = MESI[m[5].toLowerCase()]; a = +m[6]; }
  if (!(g >= 1 && g <= 31 && me >= 1 && me <= 12 && a >= 1990 && a <= 2100)) return "";
  return `${a}-${due(me)}-${due(g)}`;
}
const date = (s) => [...s.matchAll(RE_DATA)].map(dataISO).filter(Boolean);
function importi(s) {
  return [...s.matchAll(RE_IMPORTO)].map((m) => {
    let t = m[1].replace(/['\s]/g, "");
    if (/,\d{3}\.\d{2}$/.test(t)) t = t.replace(/,/g, "");   // 1,234.56 (all'inglese)
    return parseEuro(t);
  }).filter((c) => Number.isInteger(c));
}

/** Per ogni riga che corrisponde all'etichetta: i valori trovati nel resto della riga o, se non ce ne sono, nelle due righe dopo. */
function dopoEtichetta(righe, etichetta, estrai, { escludi } = {}) {
  const out = [];
  righe.forEach((r, i) => {
    const m = etichetta.exec(r);
    if (!m || (escludi && escludi.test(r))) return;
    let v = estrai(r.slice(m.index + m[0].length));
    for (let k = 1; !v.length && k <= 2 && i + k < righe.length; k++) v = estrai(righe[i + k]);
    if (v.length) out.push(v[0]);
  });
  return out;
}
const distinti = (l) => [...new Set(l)];

/** Esito di un campo: {valore, sicuro}. */
function scegli(candidati) {
  const d = distinti(candidati);
  return { valore: d[0] ?? "", sicuro: d.length === 1 };
}

const MODI = [
  [/\bbonifico\b/i, "MP05"], [/\bri\.?\s?ba\b|ricevuta bancaria/i, "MP12"], [/addebito diretto|\bsdd\b|\brid\b|domiciliazione/i, "MP19"],
  [/\bcontanti\b/i, "MP01"], [/\bpago\s?pa\b/i, "MP23"], [/bollettino postale/i, "MP18"], [/\bassegno\b/i, "MP02"], [/carta di (credito|pagamento|debito)/i, "MP08"], [/\bmav\b/i, "MP13"],
];

/**
 * testo: testo del PDF, una riga per riga visiva.
 * opz.escludiPiva: partite IVA / codici fiscali da ignorare (quelli della parrocchia).
 * opz.fornitoriNoti: Map partitaIva → nome, per riconoscere un fornitore già visto.
 */
export function leggiFatturaDaTesto(testo, { escludiPiva = [], fornitoriNoti = new Map() } = {}) {
  const righe = String(testo ?? "").split(/\r?\n/).map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
  const vuota = { fornitore: "", piva: "", cf: "", intestatario: "", numero: "", data: "", tipoDoc: "TD01", notaCredito: false,
    imponibile: 0, iva: 0, totale: 0, ritenuta: 0, descrizione: "", righe: [], rate: [{ n: 1, scadenza: "", importo: 0, modalita: "", iban: "" }] };
  const tuttiICampi = ["fornitore", "piva", "numero", "data", "imponibile", "iva", "totale", "scadenza", "modalita"];

  if (righe.join("").replace(/\s/g, "").length < 40) {
    return { ...vuota, scansione: true, incerti: tuttiICampi,
      avvisi: ["Questo PDF è una scansione (un'immagine): Divisio non può leggerlo. Compili i campi guardando il PDF."] };
  }
  const tutto = righe.join("\n");
  const incerti = [], avvisi = [];

  // partita IVA del fornitore: la prima che non è della parrocchia
  const esclusi = new Set(escludiPiva.map((x) => String(x).replace(/\D/g, "")).filter(Boolean));
  const pive = distinti([...tutto.matchAll(/(?:partita\s*i\.?v\.?a\.?|p\.\s*i\.?v\.?a\.?|p\.?\s?iva|codice\s*iva|identificativo\s*fiscale[^:\n]*|vat(?:\s*(?:number|n\.?))?)\s*[:.]?\s*(?:IT\s*)?(\d{11})\b/gi)].map((m) => m[1]))
    .filter((p) => !esclusi.has(p));
  const piva = { valore: pive[0] ?? "", sicuro: pive.length === 1 };

  // fornitore: sicuro solo se è già noto per quella partita IVA
  let fornitore = { valore: "", sicuro: false };
  if (piva.valore && fornitoriNoti.get(piva.valore)) fornitore = { valore: fornitoriNoti.get(piva.valore), sicuro: true };
  else {
    const dopoCedente = dopoEtichetta(righe, /(cedente|prestatore|fornitore|mittente)\b[^:]*:?/i, (s) => (s.trim().length > 2 && !/\d{11}/.test(s) ? [s.trim()] : []));
    const conSigla = righe.find((r) => /\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|soc\.?\s*coop|cooperativa|ditta)\b/i.test(r) && r.length < 80);
    fornitore.valore = (dopoCedente[0] || conSigla || "").replace(/^(cedente|prestatore|fornitore)[^:]*:\s*/i, "").slice(0, 120);
  }

  const escludiNumero = /client|contratt|\bpod\b|\bpdr\b|telefon|ordine|\bddt\b|utenza|partita|codice fiscale|pagin|conto|iban|riferimento/i;
  const numero = scegli(dopoEtichetta(righe, /(numero\s*(documento|fattura)?|fattura\s*(n\.?|nr\.?|n°|num\.?|numero)|\bn[°.r]+\s*(documento|fattura)?|documento\s*n\.?)\s*[:.]?/i,
    (s) => [...s.matchAll(/\b([A-Z]{0,6}[-/]?\d[\w/.-]{0,24})\b/gi)].map((m) => m[1].replace(/[.]$/, "")).filter((x) => !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(x)).slice(0, 1),
    { escludi: escludiNumero }));

  const escludiScadenza = /scadenz|scade|entro|limite|pagare/i;
  const dataDoc = scegli([
    ...dopoEtichetta(righe, /data\s*(del\s*)?(documento|fattura|emissione)?\s*[:.]?/i, date, { escludi: escludiScadenza }),
    ...righe.filter((r) => /fattura|documento/i.test(r) && /\bdel\b/i.test(r) && !escludiScadenza.test(r)).flatMap((r) => date(r.slice(r.search(/\bdel\b/i)))).slice(0, 1),
  ]);
  const scadenza = scegli(dopoEtichetta(righe, /(data\s*(di\s*)?scadenza|scadenza(\s*pagamento)?|scade\s*il|da\s*pagare\s*entro|pagare\s*entro|entro\s*il|data\s*limite)\s*[:.]?/i, date));

  const totaleForte = dopoEtichetta(righe, /(totale\s*(documento|fattura|da\s*pagare|a\s*pagare|dovuto|complessivo|bolletta)|netto\s*a\s*pagare|importo\s*(totale|da\s*pagare))\s*(euro|eur)?\s*[:.]?\s*(€)?/i, importi);
  let totale = scegli(totaleForte);
  if (!totaleForte.length) totale = { valore: dopoEtichetta(righe, /\btotale\b/i, importi, { escludi: /imponibile|iva|imposta|merce|righe|parziale|sconto/i }).at(-1) ?? "", sicuro: false };
  const imponibile = scegli(dopoEtichetta(righe, /(totale\s*)?imponibile\s*(euro|eur)?\s*[:.]?/i, importi));
  const iva = scegli(dopoEtichetta(righe, /(totale\s*iva|totale\s*imposta|\bimposta\b|\biva\b)\s*(euro|eur)?\s*[:.]?/i, (s) => importi(s.replace(/\b\d{1,2}([.,]\d{1,2})?\s*%/g, "")),
    { escludi: /partita|p\.\s*iva|codice|identificativo|esente|esclus|aliquota\s*$/i }));

  // controllo incrociato: se imponibile + IVA = totale, i tre importi sono certi
  const imp = imponibile.valore === "" ? null : imponibile.valore, iv = iva.valore === "" ? null : iva.valore;
  if (imp !== null && iv !== null && totale.valore !== "" && imp + iv === totale.valore) { imponibile.sicuro = iva.sicuro = totale.sicuro = true; }
  else if (imp !== null && iv !== null && totale.valore === "") { totale = { valore: imp + iv, sicuro: false }; avvisi.push("Il totale è stato calcolato sommando imponibile e IVA: lo controlli."); }
  else if (imp !== null && iv !== null) { imponibile.sicuro = iva.sicuro = false; }

  const modi = distinti(MODI.filter(([re]) => re.test(tutto)).map(([, c]) => c));
  const modalita = { valore: modi[0] ?? "", sicuro: modi.length === 1 };
  const iban = (/\bIT\s?\d{2}\s?[A-Z]\s?(?:[\dA-Z]\s?){22}\b/.exec(tutto)?.[0] ?? "").replace(/\s/g, "");

  const campi = { fornitore, piva, numero, data: dataDoc, imponibile, iva, totale, scadenza, modalita };
  for (const [k, v] of Object.entries(campi)) if (!v.sicuro || v.valore === "") incerti.push(k);
  const notaCredito = /nota\s*di\s*credito/i.test(tutto.slice(0, 2000));
  const ce = (v) => (v.valore === "" ? 0 : Math.abs(v.valore));

  return {
    ...vuota,
    fornitore: fornitore.valore, piva: piva.valore, numero: numero.valore, data: dataDoc.valore, notaCredito, tipoDoc: notaCredito ? "TD04" : "TD01",
    imponibile: ce(imponibile), iva: ce(iva), totale: ce(totale),
    descrizione: righe.slice(0, 60).join(" ").slice(0, 600),
    rate: [{ n: 1, scadenza: scadenza.valore, importo: ce(totale), modalita: modalita.valore, iban }],
    incerti, avvisi, scansione: false,
  };
}
