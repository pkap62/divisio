// Lettura dei movimenti esportati da UNIO ("AMM_ESTRATTOCONTO.csv", partita doppia) per caricarli in Divisio.
// Colonne: Icsc;Azienda;Esercizio;Data registrazione;Numero registrazione;Data documento;Numero documento;
//          Commento;Commento riga;Gruppo;Conto;Sottoconto;Descrizione;Dare;Avere
// Ogni "Numero registrazione" diventa un movimento; "Descrizione" è il nome del sottoconto in UNIO.

import { parseEuro } from "./importi.js";
import { codiceValido, isCassaBanca } from "./piano.js";
import { totaliRighe } from "./scritture.js";

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

const COLONNE = ["Icsc", "Azienda", "Esercizio", "Data registrazione", "Numero registrazione", "Data documento", "Numero documento",
  "Commento", "Commento riga", "Gruppo", "Conto", "Sottoconto", "Descrizione", "Dare", "Avere"];

const dataISO = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s).trim()); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };

/**
 * Legge il file. Restituisce {ok, anno, icsc, registrazioni:[{numero, data, descr, righe}], nomi: Map codice→nome, problemi:[testo]}
 * Le registrazioni non valide (non in quadratura, conti sconosciuti, conti di chiusura) finiscono in `problemi` e vengono escluse.
 */
export function leggiEstrattoConto(testo) {
  const linee = String(testo).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linee.length) return { ok: false, errore: "Il file è vuoto." };
  const intest = campiCSV(linee[0]).map((x) => x.trim());
  const col = Object.fromEntries(COLONNE.map((c) => [c, intest.indexOf(c)]));
  if (Object.values(col).some((i) => i < 0)) {
    return { ok: false, errore: "Questo file non è l'esportazione dei movimenti di UNIO (file \"AMM_ESTRATTOCONTO\" con le colonne Gruppo, Conto, Sottoconto, Dare, Avere)." };
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
    anno = Number(v("Esercizio")) || Number(data.slice(0, 4));
    icsc = v("Icsc");
    if (v("Descrizione")) nomi.set(conto, v("Descrizione"));
    const g = gruppi.get(numero) ?? { numero, data, descr: v("Commento") || v("Commento riga"), righe: [], scarta: null };
    if (!g.descr) g.descr = v("Commento riga");
    if (!(dare === 0 && avere === 0)) {
      // una riga con Dare e Avere insieme diventa due righe
      if (dare) g.righe.push({ conto, dare, avere: 0 });
      if (avere) g.righe.push({ conto, dare: 0, avere });
    }
    if (conto.startsWith("CH")) g.scarta = "è una scrittura di chiusura o apertura dei conti di UNIO";
    else if (!codiceValido(conto)) g.scarta = `usa il conto ${conto}, che non esiste nel piano dei conti diocesano`;
    gruppi.set(numero, g);
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
    else registrazioni.push({ numero: g.numero, data: g.data, descr: g.descr || `Registrazione UNIO n. ${g.numero}`, righe: g.righe });
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
  return registrazioni.map((r) => ({ id: `unio-${anno}-${r.numero}`, data: r.data, descr: r.descr, tipo: tipoDaRighe(r.righe), righe: r.righe, origine: "UNIO" }));
}
