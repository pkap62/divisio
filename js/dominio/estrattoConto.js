// Lettura degli estratti conto delle banche (CSV, file di testo, tabelle HTML salvate come .xls, Excel .xlsx).
//
// Ogni banca esporta a modo suo: colonne con nomi diversi, separatori diversi (; , tabulazione),
// importi con il segno oppure in due colonne (addebiti / accrediti), righe di intestazione prima della tabella.
// Divisio cerca da solo la riga dei titoli e riconosce le colonne. Se non ci riesce, l'utente le indica
// a mano e Divisio ricorda la scelta per i file successivi con le stesse colonne (vedi `impronta`).

import { testoDaByte } from "./fatture.js";

/** Le informazioni che Divisio cerca in un estratto conto, con il nome mostrato all'utente. */
export const CAMPI = {
  data: "Data dell'operazione",
  valuta: "Data valuta",
  importo: "Importo (con il segno)",
  uscite: "Uscite / addebiti",
  entrate: "Entrate / accrediti",
  segno: "Segno (D/A oppure +/−)",
  descrizione: "Descrizione",
  causale: "Causale",
  categoria: "Categoria della banca",
  divisa: "Divisa (EUR)",
  saldo: "Saldo dopo l'operazione",
};

// Nomi con cui le banche chiamano le colonne (scritti già "normalizzati": minuscole, senza accenti e simboli).
const NOMI = {
  data: ["data contabile", "data operazione", "data registrazione", "data movimento", "data contabilizzazione", "data esecuzione",
    "data", "data op", "data mov", "data reg", "data cont", "booking date", "date", "data accredito addebito"],
  valuta: ["data valuta", "valuta", "value date", "data val"],
  importo: ["importo", "importo eur", "importo euro", "importo in euro", "importo operazione", "importo movimento", "ammontare", "amount", "importo in eur"],
  uscite: ["dare", "addebiti", "addebito", "uscite", "uscita", "importo dare", "importo addebito", "addebiti euro", "addebiti eur", "dare euro", "dare eur", "debit", "debiti", "pagamenti"],
  entrate: ["avere", "accrediti", "accredito", "entrate", "entrata", "importo avere", "importo accredito", "accrediti euro", "accrediti eur", "avere euro", "avere eur", "credit", "crediti", "incassi"],
  segno: ["segno", "d a", "d c", "dc", "segno importo", "dare avere", "debit credit", "credit debit"],
  descrizione: ["descrizione", "descrizione operazione", "descrizione estesa", "descrizione movimento", "descrizione completa", "dettagli", "dettaglio",
    "operazione", "causale descrizione", "description", "concetto", "descrizione aggiuntiva", "note", "informazioni aggiuntive"],
  causale: ["causale", "causale abi", "codice causale", "cod causale", "causale operazione", "tipo operazione", "tipologia"],
  categoria: ["categoria", "sotto categoria", "sottocategoria", "categoria movimento", "macro categoria"],
  divisa: ["divisa", "currency", "moneta"],
  saldo: ["saldo", "saldo contabile", "saldo disponibile", "balance", "saldo progressivo"],
};
// Campi che possono occupare più colonne (si uniscono): es. "Categoria" + "Sotto Categoria", "Descrizione" + "Note".
const MULTIPLI = new Set(["descrizione", "categoria"]);

export const normaTitolo = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* ---------- testo del file ---------- */

function utf8Valido(b) {
  for (let i = 0; i < b.length;) {
    const x = b[i];
    const n = x < 0x80 ? 0 : (x & 0xe0) === 0xc0 ? 1 : (x & 0xf0) === 0xe0 ? 2 : (x & 0xf8) === 0xf0 ? 3 : -1;
    if (n < 0 || (n > 0 && i + n >= b.length)) return false;
    for (let k = 1; k <= n; k++) if ((b[i + k] & 0xc0) !== 0x80) return false;
    i += n + 1;
  }
  return true;
}
// Windows-1252: le lettere "speciali" tra 0x80 e 0x9f (euro, apostrofi curvi…).
const CP1252 = { 0x80: "€", 0x82: "‚", 0x84: "„", 0x85: "…", 0x8a: "Š", 0x8c: "Œ", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—", 0x99: "™", 0x9a: "š", 0x9c: "œ" };

/** Testo di un file di testo, in UTF-8 o (per i programmi più vecchi) Windows-1252. */
export function testoDelFile(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {   // UTF-16 (alcuni export "testo Unicode" di Excel)
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    return s;
  }
  if (utf8Valido(bytes)) return testoDaByte(bytes);
  let s = "";
  for (const x of bytes) s += CP1252[x] ?? String.fromCharCode(x);
  return s;
}

/* ---------- da testo a tabella ---------- */

/** Divide una riga CSV rispettando le virgolette. */
function campiCSV(riga, sep) {
  const out = [];
  let cur = "", virg = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (virg) {
      if (c === '"') { if (riga[i + 1] === '"') { cur += '"'; i++; } else virg = false; }
      else cur += c;
    } else if (c === '"' && cur.trim() === "") { virg = true; cur = ""; }
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Righe del file: un "a capo" dentro le virgolette non chiude la riga. */
function righeTesto(testo) {
  const righe = [];
  let cur = "", virg = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (c === '"') virg = !virg;
    if (!virg && (c === "\n" || c === "\r")) {
      if (c === "\r" && testo[i + 1] === "\n") i++;
      righe.push(cur); cur = "";
    } else cur += c;
  }
  if (cur !== "") righe.push(cur);
  return righe;
}

/** Il separatore più probabile: quello che dà lo stesso numero di colonne (più di una) nel maggior numero di righe. */
export function separatore(righe) {
  const campione = righe.filter((r) => r.trim()).slice(0, 60);
  let migliore = ";", punti = -1;
  for (const sep of [";", "\t", ",", "|"]) {
    const conteggi = new Map();
    for (const r of campione) { const n = campiCSV(r, sep).length; if (n > 1) conteggi.set(n, (conteggi.get(n) ?? 0) + 1); }
    const [n, volte] = [...conteggi].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
    const p = volte * 100 + n;
    if (p > punti) { punti = p; migliore = sep; }
  }
  return migliore;
}

const entita = (s) => s.replace(/&nbsp;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Tabella da una pagina HTML (molte banche chiamano ".xls" una pagina web con una tabella). */
export function tabellaDaHTML(html) {
  const righe = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const corpo = tr.split(/<\/tr>/i)[0];
    const celle = [...corpo.matchAll(/<t[dh][^>]*>([\s\S]*?)(?=<t[dh][\s>]|<\/t[dh]>|$)/gi)]
      .map((m) => entita(m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim());
    if (celle.length) righe.push(celle);
  }
  return righe;
}

/** Tabella da un file di testo (CSV o simile, oppure HTML). */
export function tabellaDaTesto(testo) {
  const t = String(testo ?? "").replace(/^﻿/, "");
  if (/^\s*<(!doctype|html|table|\?xml)/i.test(t) && /<t[dr][\s>]/i.test(t)) return tabellaDaHTML(t);
  const righe = righeTesto(t);
  const sep = separatore(righe);
  return righe.map((r) => campiCSV(r, sep).map((c) => c.trim()));
}

/* ---------- date e importi ---------- */

const due = (n) => String(n).padStart(2, "0");
function dataValida(a, m, g) {
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || g < 1) return "";
  const giorni = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return g <= giorni ? `${a}-${due(m)}-${due(g)}` : "";
}

/** "31/03/2026", "31-03-26", "31.03.2026", "2026-03-31", "2026-03-04 09:27", numero di Excel → "AAAA-MM-GG" ("" se non è una data). */
export function leggiData(x) {
  if (typeof x === "number") {   // data di Excel (giorni dal 30/12/1899)
    if (x < 30000 || x > 80000) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(x) * 864e5);
    return dataValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(x ?? "").trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\s.*)?$/.exec(s);
  if (m) return dataValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return "";
}

/**
 * Importo in centesimi: "-71,98", "1.250,50", "1,250.50", "€ 12,30", "+30", "(50,00)", "50,00-", "1250.5".
 * Restituisce NaN se non è un importo (vuoto compreso).
 */
export function leggiImporto(x) {
  if (typeof x === "number") return Number.isFinite(x) ? Math.round(x * 100) : NaN;
  let s = String(x ?? "").replace(/[\s '’]/g, "").replace(/€|eur(o)?/gi, "");
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[-−–]/.test(s)) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (/[-−–]$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const ultimaV = s.lastIndexOf(","), ultimoP = s.lastIndexOf(".");
  let intero = s, dec = "";
  if (ultimaV >= 0 && ultimoP >= 0) {   // ci sono tutti e due: il decimale è l'ultimo
    const k = Math.max(ultimaV, ultimoP);
    intero = s.slice(0, k); dec = s.slice(k + 1);
  } else if (ultimaV >= 0) {
    if ((s.match(/,/g) || []).length > 1) intero = s;   // "1,250,000": solo migliaia
    else { intero = s.slice(0, ultimaV); dec = s.slice(ultimaV + 1); }
  } else if (ultimoP >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) intero = s;   // "1.250" = milleduecentocinquanta
    else { intero = s.slice(0, ultimoP); dec = s.slice(ultimoP + 1); }
  }
  intero = intero.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intero) || !/^\d*$/.test(dec) || (intero === "" && dec === "")) return NaN;
  if (dec.length > 2) { if (/^\d{2}0+$/.test(dec)) dec = dec.slice(0, 2); else return NaN; }
  const cent = Number(intero || "0") * 100 + Number(dec.padEnd(2, "0"));
  return neg ? -cent : cent;
}

/* ---------- riconoscimento delle colonne ---------- */

/** Abbina i titoli delle colonne ai campi di Divisio. Restituisce {colonne:{campo: [indici]}, trovati: numero di titoli riconosciuti}. */
export function riconosciTitoli(titoli) {
  const norm = titoli.map(normaTitolo);
  const colonne = {};
  const usate = new Set();
  let trovati = 0;
  const assegna = (campo, i) => { (colonne[campo] ??= []).push(i); usate.add(i); trovati++; };
  // 1) nomi identici; 2) titoli che iniziano con un nome noto (es. "Importo (EUR)", "Data contabile operazione")
  for (const passo of [1, 2]) {
    for (const [campo, nomi] of Object.entries(NOMI)) {
      norm.forEach((t, i) => {
        if (!t || usate.has(i) || (colonne[campo] && !MULTIPLI.has(campo))) return;
        const ok = passo === 1 ? nomi.includes(t) : nomi.some((n) => n.length >= 4 && (t.startsWith(n + " ") || t.endsWith(" " + n)));
        if (ok) assegna(campo, i);
      });
    }
  }
  return { colonne, trovati };
}

const haImporti = (c) => c.importo || c.uscite || c.entrate;

/** Cerca, tra le prime righe, quella dei titoli. */
export function trovaTitoli(tabella) {
  let migliore = null;
  for (let i = 0; i < Math.min(tabella.length, 40); i++) {
    const r = riconosciTitoli(tabella[i]);
    if (!r.colonne.data || !haImporti(r.colonne)) continue;
    if (!migliore || r.trovati > migliore.trovati) migliore = { ...r, riga: i };
  }
  return migliore;
}

/** Quando i titoli non ci sono o non si riconoscono: si guarda il contenuto delle colonne. */
export function indovinaColonne(tabella) {
  const dati = tabella.filter((r) => r.some((c) => leggiData(c)) && r.some((c, i) => typeof c === "number" || /\d[.,]\d{2}\b/.test(String(c)) && !leggiData(c)));
  if (dati.length < 1) return null;
  const n = Math.max(...dati.map((r) => r.length));
  const quota = (fn) => Array.from({ length: n }, (_, i) => dati.filter((r) => fn(r[i])).length / dati.length);
  const date = quota((c) => Boolean(leggiData(c)));
  const numeri = quota((c) => c !== "" && c != null && !leggiData(c) && !Number.isNaN(leggiImporto(c)) && (typeof c === "number" || /[.,]\d{1,2}\s*$|^-?\d+$/.test(String(c).trim())));
  const pieni = quota((c) => String(c ?? "").trim() !== "");
  const lunghezza = Array.from({ length: n }, (_, i) => dati.reduce((s, r) => s + String(r[i] ?? "").length, 0) / dati.length);
  const colonne = {};
  const colDate = date.map((q, i) => [q, i]).filter(([q]) => q >= 0.8).map(([, i]) => i);
  if (!colDate.length) return null;
  colonne.data = [colDate[0]];
  if (colDate[1] !== undefined) colonne.valuta = [colDate[1]];
  const colNum = numeri.map((q, i) => [q, i]).filter(([q, i]) => q >= 0.3 && !colDate.includes(i)).map(([, i]) => i);
  if (!colNum.length) return null;
  // due colonne numeriche che non sono mai piene insieme = addebiti e accrediti
  const [a, b] = colNum;
  const insieme = b !== undefined && dati.some((r) => String(r[a] ?? "").trim() && String(r[b] ?? "").trim());
  if (b !== undefined && !insieme && pieni[a] < 0.95 && pieni[b] < 0.95) { colonne.uscite = [a]; colonne.entrate = [b]; }
  else colonne.importo = [a];
  const testo = lunghezza.map((l, i) => [l, i]).filter(([, i]) => !colDate.includes(i) && !colNum.includes(i)).sort((x, y) => y[0] - x[0]);
  if (testo[0]) colonne.descrizione = [testo[0][1]];
  return { colonne, riga: -1 };
}

/** Impronta del formato del file (i titoli delle colonne): con questa Divisio riconosce i file successivi della stessa banca. */
export const impronta = (titoli) => titoli.map(normaTitolo).join("|").slice(0, 400);

/* ---------- lettura completa ---------- */

const RIGHE_DI_SALDO = /^(saldo|totale|totali|movimenti|riepilogo)\b/;
const DESCRIZIONE_DI_SALDO = /^(saldo|totale)( iniziale| finale| contabile| disponibile| liquido| al\b| a debito| a credito| movimenti|$)/;
const unisci = (r, idx) => (idx ?? []).map((i) => String(r[i] ?? "").trim()).filter(Boolean);
const soloCodice = (s) => /^[\w.]{1,5}$/.test(s) && /\d/.test(s);   // es. "260", "16X", "50C": codici, non parole

/**
 * Legge la tabella di un estratto conto.
 * opz.colonne: abbinamento già noto (ricordato o scelto dall'utente); opz.riga: riga dei titoli (-1 = nessuna).
 * Restituisce { ok, errore?, titoli, rigaTitoli, colonne, indovinate, impronta, righe:[…], scartate:[{n, testo, motivo}], numeroColonne }.
 * Ogni riga: { n (riga del file, da 1), data, valuta, importo (centesimi, + entrata, − uscita), descrizione, causale, categoria, saldo, testo }.
 */
export function leggiEstratto(tabella, opz = {}) {
  if (!tabella?.length) return { ok: false, errore: "Il file è vuoto." };
  let scelta;
  if (opz.colonne) scelta = { colonne: opz.colonne, riga: opz.riga ?? -1, indovinate: false };
  else {
    const t = trovaTitoli(tabella);
    if (t) scelta = { colonne: t.colonne, riga: t.riga, indovinate: false };
    else { const g = indovinaColonne(tabella); if (g) scelta = { ...g, indovinate: true }; }
  }
  const numeroColonne = Math.max(...tabella.slice(0, 200).map((r) => r.length));
  if (!scelta) return { ok: false, errore: "Divisio non riconosce le colonne di questo file: non trova le date e gli importi dei movimenti.", numeroColonne, tabella: tabella.slice(0, 12) };
  const c = scelta.colonne;
  const titoli = scelta.riga >= 0 ? tabella[scelta.riga].map((x) => String(x ?? "").trim()) : Array.from({ length: numeroColonne }, (_, i) => `Colonna ${i + 1}`);
  if (!c.data || !haImporti(c)) return { ok: false, errore: "Indichi almeno la colonna della data e quella dell'importo (o quelle di addebiti e accrediti).", titoli, rigaTitoli: scelta.riga, colonne: c, numeroColonne, tabella: tabella.slice(0, 12) };

  // "valuta" a volte è la divisa (EUR): se la colonna non contiene date, la si tratta così
  const corpo = tabella.slice(scelta.riga + 1);
  if (c.valuta && !c.divisa && corpo.filter((r) => String(r[c.valuta[0]] ?? "").trim()).every((r) => !leggiData(r[c.valuta[0]]))) { c.divisa = c.valuta; delete c.valuta; }

  const righe = [], scartate = [];
  corpo.forEach((r, k) => {
    const n = scelta.riga + 2 + k;
    const testo = r.map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
    if (!testo) return;
    const data = leggiData(r[c.data[0]]);
    let importo = NaN;
    if (c.importo) importo = leggiImporto(r[c.importo[0]]);
    else {
      const u = c.uscite ? leggiImporto(r[c.uscite[0]]) : NaN, e = c.entrate ? leggiImporto(r[c.entrate[0]]) : NaN;
      if (!Number.isNaN(u) || !Number.isNaN(e)) importo = (Number.isNaN(e) ? 0 : Math.abs(e)) - (Number.isNaN(u) ? 0 : Math.abs(u));
    }
    if (c.segno && !Number.isNaN(importo)) {
      const s = normaTitolo(r[c.segno[0]]);
      if (/^(d|dare|addebito|uscita|debit|dr)$/.test(s) || String(r[c.segno[0]]).trim() === "-") importo = -Math.abs(importo);
      else if (/^(a|c|avere|accredito|entrata|credit|cr)$/.test(s) || String(r[c.segno[0]]).trim() === "+") importo = Math.abs(importo);
    }
    const descrizioni = unisci(r, c.descrizione);
    const causale = unisci(r, c.causale).join(" ");
    if (!data) {
      if (Number.isNaN(importo) || RIGHE_DI_SALDO.test(normaTitolo(testo))) return;   // titoli ripetuti, saldi, totali, righe vuote
      scartate.push({ n, testo, motivo: "manca la data" });
      return;
    }
    if (DESCRIZIONE_DI_SALDO.test(normaTitolo(descrizioni.join(" ") || causale))) { scartate.push({ n, testo, motivo: "è una riga di saldo o di totale" }); return; }
    if (Number.isNaN(importo)) { scartate.push({ n, testo, motivo: "l'importo non si legge" }); return; }
    if (importo === 0) { scartate.push({ n, testo, motivo: "l'importo è zero" }); return; }
    const divisa = c.divisa ? String(r[c.divisa[0]] ?? "").trim().toUpperCase() : "";
    if (divisa && !/^(EUR|EURO|€)$/.test(divisa)) { scartate.push({ n, testo, motivo: `è in ${divisa}: la registri a mano in euro` }); return; }
    // la causale serve solo se è un testo (non un codice come "260")
    const descrizione = [causale && !soloCodice(causale) && !descrizioni.some((d) => normaTitolo(d).startsWith(normaTitolo(causale))) ? causale : "", ...descrizioni].filter(Boolean).join(" - ");
    const saldo = c.saldo ? leggiImporto(r[c.saldo[0]]) : NaN;
    righe.push({ n, data, valuta: c.valuta ? leggiData(r[c.valuta[0]]) : "", importo, descrizione: descrizione || causale || "(senza descrizione)",
      causale, categoria: unisci(r, c.categoria).join(" / "), saldo: Number.isNaN(saldo) ? null : saldo, testo });
  });
  if (!righe.length) return { ok: false, errore: "Nel file non ci sono movimenti con data e importo.", titoli, rigaTitoli: scelta.riga, colonne: c, numeroColonne, scartate, tabella: tabella.slice(0, 12) };
  return { ok: true, titoli, rigaTitoli: scelta.riga, colonne: c, indovinate: scelta.indovinate, impronta: scelta.riga >= 0 ? impronta(titoli) : "", righe, scartate, numeroColonne, tabella: tabella.slice(0, 12) };
}

/**
 * Saldo finale dichiarato dalla banca (se il file ha la colonna "saldo"): quello della riga più recente.
 * I file possono essere dal più vecchio al più recente o al contrario: si guarda la prima e l'ultima riga.
 */
export function saldoFinale(righe) {
  const conSaldo = righe.filter((r) => r.saldo !== null);
  if (!conSaldo.length) return null;
  const primo = conSaldo[0], ultimo = conSaldo.at(-1);
  const r = primo.data > ultimo.data ? primo : ultimo;
  return { data: r.data, saldo: r.saldo };
}
