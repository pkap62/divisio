// Caricare in Divisio movimenti salvati prima: da una copia di sicurezza (.json) o dal file «Scarica in CSV (Excel)» della pagina Movimenti.
// Dalla copia di sicurezza si prendono solo i movimenti (fatture, impostazioni e piano dei conti restano come sono adesso).
// Dal CSV si ricostruiscono entrate, uscite e spostamenti; i saldi di apertura no (il CSV ne ha solo il totale).
// I movimenti che ci sono già in Divisio si saltano; quelli che forse ci sono già si mostrano, da spuntare uno per uno.

import { leggiBackup } from "./backup.js";
import { campiCSV } from "./importaUNIO.js";
import { parseEuro } from "./importi.js";
import { codiceValido, isCassaBanca } from "./piano.js";
import { verificaMovimento, analizza } from "./scritture.js";
import { nuovoId } from "./unione.js";
import { stessaBanca } from "./unisciBanche.js";
import { trovaMovimentoSimile, importoConSegno } from "./doppioni.js";

const vivi = (elenco) => elenco.filter((x) => !x.eliminato);
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Legge il file. attuali = { conti: Map codice → conto, fatture }.
 * Restituisce { ok: false, errore } oppure
 * { ok: true, tipo: "copia" | "csv", salvatoIl, movimenti, contiNuovi, problemi, fattureStaccate }.
 * contiNuovi: sottoconti usati dai movimenti che in Divisio adesso non ci sono (da aggiungere insieme ai movimenti).
 */
export function leggiMovimentiSalvati(testo, attuali) {
  const t = String(testo ?? "").replace(/^﻿/, "");
  if (/^\s*\{/.test(t)) return daCopia(t, attuali);
  const prima = t.split(/\r?\n/, 1)[0] ?? "";
  if (/;/.test(prima) && /data/i.test(prima)) return daCSV(t, attuali);
  return { ok: false, errore: "Questo file non è una copia di sicurezza di Divisio né un file scaricato con «Scarica in CSV (Excel)» dalla pagina Movimenti." };
}

/* ---------- copia di sicurezza ---------- */
function daCopia(testo, { conti, fatture = [] }) {
  const r = leggiBackup(testo);
  if (!r.ok) return { ok: false, errore: r.errori.join(" ") };
  const contiCopia = new Map(r.dati.conti.map((c) => [c.codice, c]));
  const fattureQui = new Map(vivi(fatture).map((f) => [f.id, f]));
  let fattureStaccate = 0;
  const movimenti = vivi(r.dati.movimenti).map(({ modificatoIl, autore, ...m }) => {
    if (!m.fattura) return m;
    // il collegamento alla fattura resta solo se quella rata in Divisio è ancora segnata pagata
    const rata = fattureQui.get(m.fattura.id)?.rate.find((x) => x.n === m.fattura.rata);
    if (rata?.stato === "pagata") return m;
    fattureStaccate++;
    const { fattura, ...senza } = m;
    return senza;
  });
  const contiNuovi = contiMancanti(movimenti, conti, (codice) => contiCopia.get(codice));
  return { ok: true, tipo: "copia", salvatoIl: r.salvatoIl, movimenti, contiNuovi, problemi: [], fattureStaccate };
}

/** Sottoconti usati dai movimenti che in Divisio non ci sono (o sono stati tolti): si rimettono, in uso. */
function contiMancanti(movimenti, conti, daDove) {
  const out = new Map();
  for (const m of movimenti) for (const r of m.righe) {
    if (conti.has(r.conto) || out.has(r.conto)) continue;
    const c = daDove(r.conto);
    if (c) { const { modificatoIl, autore, eliminato, ...resto } = c; out.set(r.conto, { ...resto, attivo: true }); }
  }
  return [...out.values()];
}

/* ---------- CSV scaricato dalla pagina Movimenti ---------- */
const COLONNE_CSV = { data: "data", causale: "causale", descr: "descrizione", dettaglio: "dettaglio", voce: "voce", nomeVoce: "nome voce",
  cassa: "cassa / banca", entrate: "entrate", uscite: "uscite", altro: "spostamenti e altro" };

/** "15/03/2026" (anche "15/3/26", "2026-03-15") → "2026-03-15" */
function dataISO(s) {
  const v = String(s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (!m) return "";
  const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anno}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function daCSV(testo, { conti }) {
  const linee = testo.split(/\r?\n/).filter((l) => l.trim());
  const intest = campiCSV(linee[0]).map(norm);
  const col = Object.fromEntries(Object.entries(COLONNE_CSV).map(([k, n]) => [k, intest.indexOf(n)]));
  if (["data", "descr", "voce", "cassa", "entrate", "uscite"].some((k) => col[k] < 0)) {
    return { ok: false, errore: "Questo CSV non è quello scaricato da Divisio con «Scarica in CSV (Excel)»: mancano le colonne Data, Descrizione, Voce, Cassa / banca, Entrate e Uscite." };
  }
  const casse = [...conti.values()].filter((c) => isCassaBanca(c.codice) && !c.eliminato);
  const trovaCassa = (nome) => casse.find((c) => norm(c.nome) === norm(nome)) ?? (casse.filter((c) => stessaBanca(c.nome, nome)).length === 1 ? casse.find((c) => stessaBanca(c.nome, nome)) : null);
  const problemi = [], movimenti = [], contiNuovi = new Map();
  const saltaAvviso = new Set();
  let gruppo = null;   // righe consecutive dello stesso movimento (stessa data, causale, descrizione e cassa)
  const chiudi = () => {
    if (!gruppo) return;
    const g = gruppo; gruppo = null;
    const voci = g.righe.map((r) => ({ conto: r.voce, dare: r.uscite, avere: r.entrate, ...(r.dettaglio ? { nota: r.dettaglio } : {}) }));
    const netto = voci.reduce((s, r) => s + r.avere - r.dare, 0);
    if (!netto) { problemi.push(`Riga ${g.riga}: «${g.descr}» ha entrate e uscite che si annullano: non caricato.`); return; }
    const m = { id: nuovoId(), data: g.data, descr: g.descr, tipo: netto > 0 ? "entrata" : "uscita", ...(g.causale ? { causale: g.causale } : {}),
      righe: [...voci, { conto: g.cassa, dare: Math.max(netto, 0), avere: Math.max(-netto, 0) }] };
    aggiungi(m, g.riga);
  };
  const aggiungi = (m, riga) => {
    const tutti = new Map([...conti, ...[...contiNuovi.values()].map((c) => [c.codice, c])]);
    const e = verificaMovimento(m, { conti: tutti });
    if (e.length) problemi.push(`Riga ${riga}: «${m.descr}» non caricato. ${e.join(" ")}`);
    else movimenti.push(m);
  };

  for (const [i, linea] of linee.slice(1).entries()) {
    const n = i + 2;
    const c = campiCSV(linea);
    const v = (k) => (col[k] >= 0 ? String(c[col[k]] ?? "").trim() : "");
    const descr = v("descr"), data = dataISO(v("data"));
    if (!v("data") && norm(descr) === "totale") continue;   // riga dei totali
    if (!data) { chiudi(); problemi.push(`Riga ${n}: data non leggibile («${v("data")}»).`); continue; }
    if (!descr) { chiudi(); problemi.push(`Riga ${n}: manca la descrizione.`); continue; }
    const voce = v("voce").toUpperCase(), nomeVoce = v("nomeVoce"), causale = v("causale");
    const entrate = parseEuro(v("entrate")), uscite = parseEuro(v("uscite")), altro = parseEuro(v("altro"));
    if ([entrate, uscite, altro].some(Number.isNaN)) { chiudi(); problemi.push(`Riga ${n}: importo non leggibile.`); continue; }

    if (!voce) {
      chiudi();
      // spostamento tra casse e banche: «Cassa → Banco BPM»
      if (norm(nomeVoce) === "spostamento") {
        const [da, verso] = v("cassa").split("→").map((x) => x.trim());
        const cDa = trovaCassa(da), cVerso = trovaCassa(verso);
        if (!cDa || !cVerso) { problemi.push(`Riga ${n}: spostamento «${v("cassa")}»: ${[!cDa && da, !cVerso && verso].filter(Boolean).map((x) => `«${x}»`).join(" e ")} non ${!cDa && !cVerso ? "sono" : "è"} tra le casse e banche di Divisio.`); continue; }
        aggiungi({ id: nuovoId(), data, descr, tipo: "spostamento", ...(causale ? { causale } : {}),
          righe: [{ conto: cVerso.codice, dare: Math.abs(altro), avere: 0 }, { conto: cDa.codice, dare: 0, avere: Math.abs(altro) }] }, n);
        continue;
      }
      const chiave = /apertura/i.test(nomeVoce) ? "apertura" : "altro";
      if (!saltaAvviso.has(chiave)) {
        saltaAvviso.add(chiave);
        problemi.push(chiave === "apertura"
          ? "I saldi di apertura non si possono riprendere dal CSV (c'è solo il totale): li inserisca in Impostazioni → Saldi di apertura, oppure usi la copia di sicurezza."
          : `Riga ${n}: i movimenti «senza cassa» non si possono riprendere dal CSV: usi la copia di sicurezza.`);
      }
      continue;
    }
    if (!codiceValido(voce)) { chiudi(); problemi.push(`Riga ${n}: voce «${voce}» sconosciuta.`); continue; }
    if (!conti.has(voce) && !contiNuovi.has(voce)) contiNuovi.set(voce, { codice: voce, nome: nomeVoce || voce, attivo: true });
    const nomeCassa = v("cassa");
    if (nomeCassa.includes(",")) { chiudi(); problemi.push(`Riga ${n}: «${descr}» usa più casse o banche insieme (${nomeCassa}): dal CSV non si può dividere l'importo. Usi la copia di sicurezza.`); continue; }
    const cassa = trovaCassa(nomeCassa);
    if (!cassa) { chiudi(); problemi.push(`Riga ${n}: la cassa o banca «${nomeCassa}» non c'è in Divisio: la aggiunga in Impostazioni → Cassa e banche e carichi di nuovo il file.`); continue; }
    const stesso = gruppo && gruppo.data === data && gruppo.descr === descr && gruppo.causale === causale && gruppo.cassa === cassa.codice;
    if (!stesso) { chiudi(); gruppo = { riga: n, data, descr, causale, cassa: cassa.codice, righe: [] }; }
    gruppo.righe.push({ voce, dettaglio: v("dettaglio"), entrate: Math.abs(entrate), uscite: Math.abs(uscite) });
  }
  chiudi();
  return { ok: true, tipo: "csv", movimenti, contiNuovi: [...contiNuovi.values()], problemi, fattureStaccate: 0 };
}

/* ---------- confronto con quello che c'è già ---------- */
const firmaRiga = (r) => `${r.conto}|${r.dare}|${r.avere}`;
const firma = (m) => `${m.data}|${norm(m.descr)}|${m.righe.map(firmaRiga).sort().join(",")}`;
// una riga «di voce» con la sua cassa, per riconoscere un movimento del CSV anche se in Divisio era diviso in due (o il contrario)
const righeVoce = (m) => {
  const a = analizza(m);
  if (a.tipo !== "entrata" && a.tipo !== "uscita") return [`${m.data}|${norm(m.descr)}|${a.tipo}|${m.righe.map(firmaRiga).sort().join(",")}`];
  const cassa = a.casse.map((r) => r.conto).join("+");
  return a.voci.map((r) => `${m.data}|${norm(m.descr)}|${cassa}|${firmaRiga(r)}`);
};

/**
 * Divide i movimenti letti in: nuovi, già in Divisio (si saltano) e forse già in Divisio (Map id → spiegazione, da spuntare).
 * esistenti: tutti i movimenti di Divisio (anche eliminati: un movimento eliminato si può riprendere).
 */
export function confrontaSalvati(movimenti, esistenti) {
  const qui = vivi(esistenti);
  const perId = new Map(qui.map((m) => [m.id, m]));
  const firme = new Set(qui.map(firma));
  const righe = new Map();
  for (const m of qui) for (const k of righeVoce(m)) righe.set(k, (righe.get(k) ?? 0) + 1);
  const nuovi = [], gia = [], forse = new Map(), usati = new Set();
  for (const m of movimenti) {
    if (perId.has(m.id) || firme.has(firma(m))) { gia.push(m); continue; }
    const mie = righeVoce(m);
    const prova = new Map(righe);
    if (mie.every((k) => { const n = prova.get(k) ?? 0; prova.set(k, n - 1); return n > 0; })) {
      for (const [k, n] of prova) righe.set(k, n);
      gia.push(m); continue;
    }
    const s = m.tipo === "apertura" ? null : trovaMovimentoSimile({ data: m.data, importo: importoConSegno(m), descrizioni: [m.descr] }, qui, { esclusi: usati });
    if (s) { usati.add(s.movimento.id); forse.set(m.id, s.testo); }
    nuovi.push(m);
  }
  return { nuovi, gia, forse };
}
