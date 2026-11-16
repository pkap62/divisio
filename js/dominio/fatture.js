// Lettura delle fatture elettroniche (FatturaPA, XML e .p7m firmati) senza librerie.
// Logica ripresa dallo "Scadenzario-fatture" (src/utils/xmlInvoiceParser.ts) e adattata a Divisio:
// importi in centesimi, date AAAA-MM-GG, nessun servizio esterno.
//
// Una fattura letta è:
// { fornitore, piva, cf, intestatario, numero, data, tipoDoc, notaCredito, imponibile, iva, totale,
//   descrizione, righe:[testo], ritenuta, rate:[{n, scadenza, importo, modalita}], incerti:[campo], avvisi:[testo] }

/* ---------- modalità di pagamento (codici dell'Agenzia delle Entrate) ---------- */
export const MODALITA = {
  MP01: "Contanti", MP02: "Assegno", MP03: "Assegno circolare", MP04: "Contanti presso Tesoreria",
  MP05: "Bonifico", MP06: "Vaglia cambiario", MP07: "Bollettino bancario", MP08: "Carta di pagamento",
  MP09: "RID", MP10: "RID utenze", MP11: "RID veloce", MP12: "RiBa", MP13: "MAV", MP14: "Quietanza erario",
  MP15: "Giroconto", MP16: "Domiciliazione bancaria", MP17: "Domiciliazione postale", MP18: "Bollettino postale",
  MP19: "Addebito diretto SEPA", MP20: "Addebito diretto SEPA CORE", MP21: "Addebito diretto SEPA B2B",
  MP22: "Trattenuta su somme già riscosse", MP23: "PagoPA",
};
export const nomeModalita = (codice) => MODALITA[codice] ?? (codice || "");
/** I contanti si pagano dalla cassa, tutto il resto dalla banca. */
export const modalitaInContanti = (codice) => codice === "MP01" || codice === "MP04";

export const TIPI_DOCUMENTO = {
  TD01: "Fattura", TD02: "Acconto su fattura", TD03: "Acconto su parcella", TD04: "Nota di credito",
  TD05: "Nota di debito", TD06: "Parcella", TD24: "Fattura differita", TD25: "Fattura differita",
};

/* ---------- lettore XML minimo ---------- */
// Produce un albero { nome, figli:[], testo } ignorando i prefissi (p:, ns2:, ...): basta per la FatturaPA.

const ENTITA = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decodificaEntita = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : t; }
  return ENTITA[e.toLowerCase()] ?? t;
});
const senzaPrefisso = (nome) => nome.slice(nome.indexOf(":") + 1);

export function leggiXML(testo) {
  const radice = { nome: "#documento", figli: [], testo: "" };
  const pila = [radice];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s>/!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(testo))) {
    const cima = pila[pila.length - 1];
    if (m[1] !== undefined) cima.testo += m[1];
    else if (m[2]) {
      const nome = senzaPrefisso(m[2]);
      // chiude fino al tag corrispondente (tollera piccoli errori)
      for (let i = pila.length - 1; i > 0; i--) if (pila[i].nome === nome) { pila.length = i; break; }
    } else if (m[3]) {
      const nodo = { nome: senzaPrefisso(m[3]), figli: [], testo: "" };
      cima.figli.push(nodo);
      if (!m[5]) pila.push(nodo);
    } else if (m[6] !== undefined) cima.testo += decodificaEntita(m[6]);
  }
  return radice;
}

const figlio = (n, nome) => n?.figli.find((f) => f.nome === nome);
const figli = (n, nome) => n?.figli.filter((f) => f.nome === nome) ?? [];
/** Percorso "A/B/C" a partire da un nodo. */
const vai = (n, percorso) => percorso.split("/").reduce((x, p) => figlio(x, p), n);
const testo = (n, percorso) => (percorso ? vai(n, percorso) : n)?.testo.trim() ?? "";
function cerca(n, nome) {
  if (!n) return undefined;
  if (n.nome === nome) return n;
  for (const f of n.figli) { const r = cerca(f, nome); if (r) return r; }
  return undefined;
}

/* ---------- importi e date ---------- */

/** "123.45" / "-12.3" / "1234.5678" → centesimi interi (arrotondati). NaN se non è un numero. */
export function centesimi(valore) {
  const s = String(valore ?? "").trim().replace(",", ".");
  const m = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!s || !m || (m[2] === "" && !m[3])) return NaN;
  const dec = (m[3] || "").padEnd(3, "0");
  let c = Number(m[2] || "0") * 100 + Number(dec.slice(0, 2));
  if (Number(dec[2]) >= 5) c += 1;
  return m[1] === "-" ? -c : c;
}
const cent0 = (v) => { const c = centesimi(v); return Number.isNaN(c) ? 0 : c; };
const dataISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? "").trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };

/* ---------- byte → testo (anche senza TextDecoder) ---------- */

function utf8(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let cp, n;
    if (b < 0x80) { cp = b; n = 1; } else if (b >> 5 === 6) { cp = b & 31; n = 2; } else if (b >> 4 === 14) { cp = b & 15; n = 3; } else { cp = b & 7; n = 4; }
    for (let k = 1; k < n; k++) cp = (cp << 6) | (bytes[i + k] & 63);
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}
const latin1 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return s; };

/** Testo di un file XML, rispettando la codifica dichiarata (UTF-8 o ISO-8859-1). */
export function testoDaByte(bytes) {
  const inizio = latin1(bytes.subarray(0, 200));
  let corpo = bytes;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) corpo = bytes.subarray(3);
  return /encoding\s*=\s*["'](iso-8859-1|latin-?1|windows-1252)["']/i.test(inizio) ? latin1(corpo) : utf8(corpo);
}

/* ---------- file firmati .p7m ---------- */
// Un .p7m è una "busta" (formato ASN.1/DER) che contiene l'XML, a volte spezzato in più pezzi.
// Si cercano i contenuti di tipo OCTET STRING e si prende quello che contiene la fattura.

function leggiLunghezza(b, i) {
  const x = b[i];
  if (x < 0x80) return [x, i + 1];
  if (x === 0x80) return [-1, i + 1];   // lunghezza indefinita
  const n = x & 0x7f;
  let l = 0;
  for (let k = 0; k < n; k++) l = l * 256 + b[i + 1 + k];
  return [l, i + 1 + n];
}

/** Legge un elemento che inizia al byte i: {tag, inizio, fine, fineEl, figli} (figli solo se è "costruito"). */
function leggiEl(b, i, profondita = 0) {
  if (profondita > 40 || i + 1 >= b.length) throw new Error("struttura non valida");
  const tag = b[i];
  const [l, p] = leggiLunghezza(b, i + 1);
  if (l === -1) {   // lunghezza indefinita: i figli finiscono con due byte a zero
    const figli = [];
    let q = p;
    while (q + 1 < b.length && !(b[q] === 0 && b[q + 1] === 0)) { const f = leggiEl(b, q, profondita + 1); figli.push(f); q = f.fineEl; }
    return { tag, inizio: p, fine: q, fineEl: q + 2, figli };
  }
  if (p + l > b.length) throw new Error("struttura non valida");
  const el = { tag, inizio: p, fine: p + l, fineEl: p + l, figli: null };
  if (tag & 0x20) {
    el.figli = [];
    for (let q = p; q < p + l;) { const f = leggiEl(b, q, profondita + 1); el.figli.push(f); q = f.fineEl; }
  }
  return el;
}

function contenutoOctet(b, el) {
  if (!el.figli) return b.subarray(el.inizio, el.fine);
  const pezzi = el.figli.filter((f) => (f.tag & 0x1f) === 4).map((f) => contenutoOctet(b, f));
  const tot = new Uint8Array(pezzi.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of pezzi) { tot.set(p, k); k += p.length; }
  return tot;
}

const haFattura = (bytes) => /FatturaElettronica/.test(latin1(bytes.subarray(0, Math.min(bytes.length, 4000))));

export function xmlDaP7m(bytes) {
  // a volte il .p7m è salvato in base64
  const inizio = latin1(bytes.subarray(0, 4)).trim();
  if (/^MI/.test(inizio) && typeof atob === "function") {
    try { const bin = atob(latin1(bytes).replace(/[^A-Za-z0-9+/=]/g, "")); bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch { /* non era base64 */ }
  }
  const visita = (elenco) => {
    for (const el of elenco) {
      if ((el.tag & 0x1f) === 4) { const c = contenutoOctet(bytes, el); if (haFattura(c)) return c; }
      if (el.figli) { const r = visita(el.figli); if (r) return r; }
    }
    return null;
  };
  let xml = null;
  try { xml = visita([leggiEl(bytes, 0)]); } catch { xml = null; }
  if (!xml) {
    // ultima possibilità: cerca direttamente il testo dell'XML tra i byte
    const s = latin1(bytes);
    const a = s.search(/<\?xml|<([\w-]+:)?FatturaElettronica[\s>]/);
    const z = s.search(/<\/([\w-]+:)?FatturaElettronica\s*>/);
    if (a < 0 || z < 0) return null;
    xml = bytes.subarray(a, z + s.slice(z).indexOf(">") + 1);
  }
  return testoDaByte(xml);
}

/* ---------- lettura della fattura ---------- */

function nomeDa(anagrafica) {
  const den = testo(anagrafica, "Denominazione");
  return den || [testo(anagrafica, "Nome"), testo(anagrafica, "Cognome")].filter(Boolean).join(" ");
}

/**
 * Legge il testo di un file FatturaPA. Restituisce {ok:true, fatture:[…]} (un file può contenerne più d'una)
 * oppure {ok:false, errore}.
 */
export function leggiFatturaPA(xml) {
  if (!xml || !/FatturaElettronica/.test(xml)) return { ok: false, errore: "Non è una fattura elettronica (FatturaPA)." };
  let albero;
  try { albero = leggiXML(xml); } catch { return { ok: false, errore: "Il file XML è rovinato e non si riesce a leggere." }; }
  const radice = cerca(albero, "FatturaElettronica");
  const testata = figlio(radice, "FatturaElettronicaHeader");
  const corpi = figli(radice, "FatturaElettronicaBody");
  if (!testata || !corpi.length) return { ok: false, errore: "Nella fattura mancano le parti principali (intestazione o corpo)." };

  const ced = vai(testata, "CedentePrestatore/DatiAnagrafici");
  const fornitore = nomeDa(figlio(ced, "Anagrafica"));
  const piva = testo(ced, "IdFiscaleIVA/IdCodice");
  const cf = testo(ced, "CodiceFiscale");
  const ces = vai(testata, "CessionarioCommittente/DatiAnagrafici");
  const intestatario = nomeDa(figlio(ces, "Anagrafica"));
  const intestatarioPiva = testo(ces, "IdFiscaleIVA/IdCodice");

  const fatture = corpi.map((corpo) => {
    const doc = vai(corpo, "DatiGenerali/DatiGeneraliDocumento");
    const tipoDoc = testo(doc, "TipoDocumento").toUpperCase();
    const incerti = [], avvisi = [];

    const righe = figli(figlio(corpo, "DatiBeniServizi"), "DettaglioLinee").map((l) => testo(l, "Descrizione")).filter(Boolean);
    const riepiloghi = figli(figlio(corpo, "DatiBeniServizi"), "DatiRiepilogo");
    let imponibile = riepiloghi.reduce((s, r) => s + cent0(testo(r, "ImponibileImporto")), 0);
    const iva = riepiloghi.reduce((s, r) => s + cent0(testo(r, "Imposta")), 0);
    const arrotondamento = riepiloghi.reduce((s, r) => s + cent0(testo(r, "Arrotondamento")), 0);
    if (!riepiloghi.length) imponibile = figli(figlio(corpo, "DatiBeniServizi"), "DettaglioLinee").reduce((s, l) => s + cent0(testo(l, "PrezzoTotale")), 0);

    // rate (DettaglioPagamento): ogni rata ha la sua scadenza
    const rate = [];
    for (const dp of figli(corpo, "DatiPagamento")) {
      for (const d of figli(dp, "DettaglioPagamento")) {
        rate.push({ n: rate.length + 1, scadenza: dataISO(testo(d, "DataScadenzaPagamento")), importo: cent0(testo(d, "ImportoPagamento")),
          modalita: testo(d, "ModalitaPagamento").toUpperCase(), iban: testo(d, "IBAN") });
      }
    }

    let totale = centesimi(testo(doc, "ImportoTotaleDocumento"));
    if (Number.isNaN(totale) || totale === 0) {
      totale = imponibile + iva + arrotondamento;
      if (!totale) totale = rate.reduce((s, r) => s + r.importo, 0);
      if (totale) avvisi.push("Il totale non era scritto nella fattura: è stato calcolato da imponibile e IVA.");
    }
    const notaCredito = tipoDoc === "TD04" || totale < 0;
    totale = Math.abs(totale);
    imponibile = Math.abs(imponibile);

    const ritenuta = figli(doc, "DatiRitenuta").reduce((s, r) => s + cent0(testo(r, "ImportoRitenuta")), 0);
    if (ritenuta) avvisi.push(`C'è una ritenuta d'acconto di ${(ritenuta / 100).toFixed(2).replace(".", ",")} €: si paga a parte con l'F24 e va registrata a mano quando la si versa.`);

    if (!rate.length) rate.push({ n: 1, scadenza: "", importo: totale - ritenuta, modalita: "", iban: "" });
    for (const r of rate) if (!r.importo && rate.length === 1) r.importo = totale - ritenuta;
    if (rate.some((r) => !r.scadenza)) { incerti.push("scadenza"); avvisi.push("La fattura non indica la data di scadenza: la scriva lei."); }
    const daPagare = rate.reduce((s, r) => s + r.importo, 0);
    if (daPagare !== totale - ritenuta && rate.length) {
      avvisi.push(`Da pagare ${(daPagare / 100).toFixed(2).replace(".", ",")} € invece del totale della fattura (per esempio per uno sconto, un acconto già versato o lo "split payment").`);
    }

    const data = dataISO(testo(doc, "Data"));
    const numero = testo(doc, "Numero");
    if (!data) incerti.push("data");
    if (!numero) incerti.push("numero");
    if (!fornitore) incerti.push("fornitore");

    const causale = figli(doc, "Causale").map((c) => c.testo.trim()).filter(Boolean).join(" ");
    return {
      fornitore, piva, cf, intestatario, intestatarioPiva, numero, data, tipoDoc, notaCredito,
      imponibile, iva, totale, ritenuta,
      descrizione: [causale, ...righe].filter(Boolean).join(" · ").slice(0, 600),
      righe: righe.slice(0, 30).map((r) => r.slice(0, 200)),
      rate, incerti, avvisi,
    };
  });
  return { ok: true, fatture };
}

/* ---------- doppioni ---------- */

const normale = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nomeBase = (s) => normale(String(s ?? "").replace(/\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|soc(ieta)?\.?\s*coop(erativa)?\.?)\b/gi, ""));

/** Stesso fornitore (partita IVA o nome), stesso numero e stessa data. */
export function stessaFattura(a, b) {
  if (!a.numero || !b.numero || normale(a.numero) !== normale(b.numero) || a.data !== b.data) return false;
  if (a.piva && b.piva) return normale(a.piva) === normale(b.piva);
  return nomeBase(a.fornitore) !== "" && nomeBase(a.fornitore) === nomeBase(b.fornitore);
}
export const trovaDoppione = (f, elenco) => elenco.find((x) => !x.eliminato && x.id !== f.id && stessaFattura(f, x));

/** Chiave con cui Divisio ricorda un fornitore: la partita IVA, altrimenti il codice fiscale o il nome. */
export const chiaveFornitore = (f) => "fornitore:" + (normale(f.piva) || normale(f.cf) || nomeBase(f.fornitore));
