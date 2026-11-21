// Lettura dei movimenti esportati da UNIO (partita doppia) per caricarli in Divisio.
// Due esportazioni di UNIO, con quasi le stesse colonne:
//  - "AMM_PRIMA_NOTA.csv": Icsc;Azienda;Nome Azienda;Esercizio;Data registrazione;Numero registrazione;Data documento;Numero documento;
//                          Causale;Commento;Commento riga;Codice gruppo;Codice conto;Codice sottoconto;Descrizione;Dare;Avere
//  - "AMM_ESTRATTOCONTO.csv": come sopra, ma senza Nome Azienda e Causale e con Gruppo;Conto;Sottoconto
// Ogni "Numero registrazione" (di un esercizio) diventa un movimento; "Descrizione" è il nome del sottoconto in UNIO.

import { parseEuro } from "./importi.js";
import { codiceValido, isCassaBanca } from "./piano.js";
import { totaliRighe } from "./scritture.js";
import { periodo } from "./ponte.js";

/** Divide una riga CSV con ";" rispettando le virgolette. */
export function campiCSV(riga) {
  const out = [];
  let cur = "", dentro = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (dentro) {
      if (c === '"' && riga[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') dentro = false;
      else cur += c;
    } else if (c === '"') dentro = true;
    else if (c === ";") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// colonna → nomi possibili (il primo è quello dell'estratto conto, il secondo quello della prima nota)
const COLONNE = {
  "Icsc": ["Icsc"], "Esercizio": ["Esercizio"], "Data registrazione": ["Data registrazione"], "Numero registrazione": ["Numero registrazione"],
  "Commento": ["Commento"], "Commento riga": ["Commento riga"],
  "Gruppo": ["Gruppo", "Codice gruppo"], "Conto": ["Conto", "Codice conto"], "Sottoconto": ["Sottoconto", "Codice sottoconto"],
  "Descrizione": ["Descrizione"], "Dare": ["Dare"], "Avere": ["Avere"],
};
const FACOLTATIVE = { "Causale": ["Causale"] };

const dataISO = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s).trim()); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };

/**
 * Legge il file. Restituisce {ok, anno, icsc, registrazioni:[{numero, data, descr, righe}], nomi: Map codice→nome, problemi:[testo]}
 * Le registrazioni non valide (non in quadratura, conti sconosciuti, conti di chiusura) finiscono in `problemi` e vengono escluse.
 */
export function leggiEstrattoConto(testo) {
  const linee = String(testo).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linee.length) return { ok: false, errore: "Il file è vuoto." };
  const intest = campiCSV(linee[0]).map((x) => x.trim().toLowerCase());
  const indice = (nomi) => nomi.map((n) => intest.indexOf(n.toLowerCase())).find((i) => i >= 0) ?? -1;
  const col = Object.fromEntries(Object.entries({ ...COLONNE, ...FACOLTATIVE }).map(([c, nomi]) => [c, indice(nomi)]));
  if (Object.keys(COLONNE).some((c) => col[c] < 0)) {
    return { ok: false, errore: "Questo file non è l'esportazione dei movimenti di UNIO (file \"AMM_PRIMA_NOTA\" o \"AMM_ESTRATTOCONTO\", con le colonne Gruppo, Conto, Sottoconto, Dare e Avere)." };
  }
  const gruppi = new Map(), nomi = new Map(), problemi = [];
  let anno = null, icsc = "";
  for (const [i, linea] of linee.slice(1).entries()) {
    const c = campiCSV(linea);
    const v = (nome) => (c[col[nome]] ?? "").trim();
    const numero = v("Numero registrazione"), data = dataISO(v("Data registrazione"));
    const conto = `${v("Gruppo")}-${v("Conto").padStart(2, "0")}-${v("Sottoconto").padStart(2, "0")}`;
    const dare = parseEuro(v("Dare")), avere = parseEuro(v("Avere"));
    if (!numero || !data) { problemi.push(`Riga ${i + 2}: manca il numero o la data della registrazione.`); continue; }
    if (Number.isNaN(dare) || Number.isNaN(avere)) { problemi.push(`Riga ${i + 2}: importo non leggibile.`); continue; }
    const esercizio = Number(v("Esercizio")) || Number(data.slice(0, 4));
    anno = Math.max(anno ?? esercizio, esercizio);
    icsc = v("Icsc");
    if (v("Descrizione")) nomi.set(conto, v("Descrizione"));
    const chiave = `${esercizio}|${numero}`;
    const g = gruppi.get(chiave) ?? { numero, anno: esercizio, data, descr: v("Commento") || v("Commento riga"), causale: v("Causale"), righe: [], scarta: null };
    if (!g.descr) g.descr = v("Commento riga");
    if (!(dare === 0 && avere === 0)) {
      // una riga con Dare e Avere insieme diventa due righe
      if (dare) g.righe.push({ conto, dare, avere: 0 });
      if (avere) g.righe.push({ conto, dare: 0, avere });
    }
    if (conto.startsWith("CH")) g.scarta = "è una scrittura di chiusura o apertura dei conti di UNIO";
    else if (!codiceValido(conto)) g.scarta = `usa il conto ${conto}, che non esiste nel piano dei conti diocesano`;
    gruppi.set(chiave, g);
  }
  // Estratto conto di POCHI conti (filtro in UNIO): le registrazioni hanno una sola parte e non tornano mai.
  const sbilanciate = [...gruppi.values()].filter((g) => !g.scarta && g.righe.length && totaliRighe(g.righe).dare !== totaliRighe(g.righe).avere).length;
  if (sbilanciate > 0 && sbilanciate >= gruppi.size / 2) {
    return { ok: false, parziale: true, sottoconti: nomi.size,
      errore: `Il file contiene solo l'estratto conto di ${nomi.size} sottoconti, non tutta la partita doppia: quasi nessuna registrazione è completa. ` +
        "In UNIO esporti di nuovo i movimenti scegliendo TUTTI i conti (dal primo all'ultimo gruppo, oppure senza filtri sui conti)." };
  }
  const registrazioni = [];
  for (const g of gruppi.values()) {
    const t = totaliRighe(g.righe);
    const etichetta = `Registrazione n. ${g.numero} del ${g.data.split("-").reverse().join("/")}${g.descr ? ` («${g.descr}»)` : ""}`;
    if (g.scarta) problemi.push(`${etichetta}: esclusa perché ${g.scarta}.`);
    else if (!g.righe.length) problemi.push(`${etichetta}: esclusa perché è senza importi.`);
    else if (t.dare !== t.avere) problemi.push(`${etichetta}: esclusa perché Dare e Avere non sono uguali.`);
    else {
      const r = { numero: g.numero, data: g.data, descr: g.descr || g.causale || `Registrazione UNIO n. ${g.numero}`, righe: g.righe };
      if (g.anno !== anno) r.anno = g.anno;
      const dd = daDivisio(r);
      if (dd) r.daDivisio = dd;
      registrazioni.push(r);
    }
  }
  registrazioni.sort((a, b) => a.data.localeCompare(b.data) || Number(a.numero) - Number(b.numero));
  return { ok: true, anno, icsc, registrazioni, nomi, problemi };
}

/** Tipo del movimento in Divisio, dedotto dalle righe. */
export function tipoDaRighe(righe) {
  const casse = righe.filter((r) => isCassaBanca(r.conto));
  if (righe.length === 2 && casse.length === 2) return "spostamento";
  if (righe.length === 2 && casse.length === 1) return casse[0].dare ? "entrata" : "uscita";
  return "pd";
}

/** Registrazioni → movimenti di Divisio. L'identificativo fisso evita doppioni se si carica di nuovo lo stesso file. */
export function aMovimenti(registrazioni, anno) {
  return registrazioni.map((r) => ({ id: `unio-${r.anno ?? anno}-${r.numero}`, data: r.data, descr: r.descr, tipo: tipoDaRighe(r.righe), righe: r.righe, origine: "UNIO" }));
}

/**
 * Registrazione che UNIO ha ricevuto da Divisio (pagina "Per UNIO"): il commento comincia con il codice tra parentesi quadre
 * e indica il trimestre, es. "[E01-04-02] Offerte per lumi votivi – 4° trim. 2026 (1 mov.)".
 * Restituisce {trimestre:"T4", anno:2026, casse:[codici]} oppure null.
 */
export function daDivisio(r) {
  const m = /^\[[A-Z]+\d*-\d{2}-\d{2}\].*?\b([1-4])\s*°\s*trim\.?\s*(\d{4})/i.exec(r.descr ?? "");
  if (!m) return null;
  return { trimestre: `T${m[1]}`, anno: Number(m[2]), casse: [...new Set(r.righe.filter((x) => isCassaBanca(x.conto)).map((x) => x.conto))] };
}

/** Pagamento di una fattura registrato in UNIO, es. "Fattura LO SPURGO S.P.A. nr. 1/497 del 30/01/2026 - …": {numero, data} oppure null. */
export function fatturaNelCommento(descr) {
  const m = /^fattura\b.*?\bn(?:r|um|umero)?\.?\s*([^\s]+)\s+del\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(descr ?? "");
  return m ? { numero: m[1], data: `${m[4]}-${m[3].padStart(2, "0")}-${m[2].padStart(2, "0")}` } : null;
}
const soloCifreELettere = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Stesso numero di fattura, anche scritto in modo un po' diverso ("1/497" e "497", "FAN/69" e "FAN69"). */
const stessoNumero = (a, b) => {
  const x = soloCifreELettere(a), y = soloCifreELettere(b);
  return Boolean(x && y) && (x === y || (x.length >= 3 && y.endsWith(x)) || (y.length >= 3 && x.endsWith(y)));
};

/**
 * Doppioni tra il file di UNIO e quello che c'è già in Divisio (movimenti non caricati da UNIO):
 *  - registrazioni arrivate in UNIO da Divisio (pagina "Per UNIO"): doppioni se in Divisio ci sono già i movimenti
 *    della stessa cassa o banca nello stesso trimestre (lì ci sono in dettaglio); se Divisio è stato azzerato, servono;
 *  - pagamenti di fatture ("Fattura … nr. … del …"): doppioni se in Divisio la stessa fattura è già pagata e registrata.
 * fatture: quelle dello scadenzario di Divisio. Restituisce {daCaricare, saltate}.
 */
export function separaDoppioniDivisio(registrazioni, movimentiDivisio, fatture = []) {
  const propri = movimentiDivisio.filter((m) => !m.eliminato && m.origine !== "UNIO" && m.tipo !== "apertura");
  const giaInDivisio = (dd) => {
    const p = periodo(dd.anno, dd.trimestre);
    return propri.some((m) => m.data >= p.da && m.data <= p.a && m.righe.some((x) => dd.casse.includes(x.conto)));
  };
  const perId = new Map(fatture.filter((f) => !f.eliminato).map((f) => [f.id, f]));
  const pagateInDivisio = propri.filter((m) => m.fattura && perId.has(m.fattura.id)).map((m) => perId.get(m.fattura.id));
  const fatturaGiaPagata = (rif) => pagateInDivisio.some((f) => f.data === rif.data && stessoNumero(f.numero, rif.numero));
  const daCaricare = [], saltate = [];
  for (const r of registrazioni) {
    const rif = fatturaNelCommento(r.descr);
    const doppione = (r.daDivisio && giaInDivisio(r.daDivisio)) || (rif && fatturaGiaPagata(rif));
    (doppione ? saltate : daCaricare).push(r);
  }
  return { daCaricare, saltate };
}
