// Tabella dei movimenti, usata in "Inizio" e in "Movimenti".

import { analizza, totaliRighe } from "../dominio/scritture.js";
import { esc, eur, dataIt } from "./util.js";
import { etichettaCausale } from "../dominio/causali.js";
import { differenzeConInizio } from "../dominio/saldi.js";
import { tipoDi } from "../dominio/piano.js";

export function descrivi(m, arch) {
  const a = analizza(m);
  const nome = (c) => esc(arch.nomeConto(c));
  if (a.tipo === "apertura") return { ...a, voce: "Saldi di apertura", cassa: "" };
  if (a.tipo === "spostamento") return { ...a, voce: "Spostamento", cassa: `${nome(a.da)} → ${nome(a.verso)}` };
  // più righe sulla stessa voce (es. tre funerali) contano come una voce sola
  const unica = a.voci.length > 0 && a.voci.every((r) => r.conto === a.voci[0].conto);
  const voce = unica ? `${nome(a.voci[0].conto)} <span class="codice">${a.voci[0].conto}</span>` : "Più voci";
  return { ...a, voce, cassa: a.casse.map((r) => nome(r.conto)).join(", ") || "—" };
}

export function tabellaRighe(righe, arch) {
  const { dare, avere } = totaliRighe(righe);
  return `<table class="righe"><tr><th>Conto</th><th class="n">Dare</th><th class="n">Avere</th></tr>
    ${righe.map((r) => `<tr><td>${esc(arch.nomeConto(r.conto))} <span class="codice">${r.conto}</span>${r.nota ? `<br><span class="hint">${esc(r.nota)}</span>` : ""}</td>
      <td class="n">${r.dare ? eur(r.dare) : ""}</td><td class="n">${r.avere ? eur(r.avere) : ""}</td></tr>`).join("")}
    <tr class="tot"><td>Totale ${dare === avere ? "✓" : "✗"}</td><td class="n">${eur(dare)}</td><td class="n">${eur(avere)}</td></tr></table>`;
}

/** Movimenti con i Dettagli aperti (restano aperti anche quando l'elenco si ridisegna, es. mentre si cerca). */
export const dettagliAperti = new Set();

/** Contenuto dei Dettagli: occupa tutta la larghezza della tabella, in una riga sotto il movimento. */
function contenutoDettagli(m, arch) {
  return `${m.causale ? `<p class="piede">Causale: <b>${esc(etichettaCausale(m.causale))}</b></p>` : ""}${tabellaRighe(m.righe, arch)}
    <p class="hint">Inserito da ${esc(m.autore ?? "—")} · ultima modifica ${m.modificatoIl ? new Date(m.modificatoIl).toLocaleString("it-IT") : "—"}</p>
    ${m.tipo === "apertura"
      ? `<p class="hint">I saldi di apertura si cambiano da Impostazioni.</p>`
      : `<div class="riga-bottoni stretta"><button class="btn sec piccolo" data-azione="modifica" data-id="${esc(m.id)}">Modifica</button>
         ${m.fattura ? "" : `<button class="btn sec piccolo" data-azione="copia" data-id="${esc(m.id)}">Registra di nuovo uguale</button>`}
         <button class="btn pericolo piccolo" data-azione="elimina" data-id="${esc(m.id)}">Elimina</button></div>`}`;
}

/* ---------- ordinare i movimenti per colonna (pagina Movimenti) ---------- */
export const COLONNE = [["data", "Data"], ["descr", "Descrizione"], ["voce", "Voce"], ["cassa", "Cassa / banca"], ["importo", "Importo"]];
const testoSemplice = (html) => String(html).replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Ordina i movimenti per una colonna. ordine = {campo, verso: "su" (dalla A alla Z, dal più piccolo) | "giu"}.
 * A parità, i movimenti restano in ordine di data (i più recenti prima).
 */
export function ordinaMovimenti(lista, arch, { campo = "data", verso = "giu" } = {}) {
  const chiave = new Map(lista.map((m) => {
    if (campo === "data") return [m, null];
    if (campo === "importo") return [m, descrivi(m, arch).importo];
    if (campo === "descr") return [m, String(m.descr ?? "").toLowerCase()];
    const d = descrivi(m, arch);
    return [m, testoSemplice(campo === "voce" ? d.voce : d.cassa)];
  }));
  const perData = (a, b) => a.data.localeCompare(b.data) || String(a.creatoIl ?? "").localeCompare(String(b.creatoIl ?? "")) || String(a.id).localeCompare(String(b.id));
  const confronta = (a, b) => {
    if (campo === "data") return perData(a, b);
    const x = chiave.get(a), y = chiave.get(b);
    return typeof x === "number" ? x - y : x.localeCompare(y, "it", { numeric: true });
  };
  const s = verso === "su" ? 1 : -1;
  return [...lista].sort((a, b) => s * confronta(a, b) || -perData(a, b));
}

/** Titolo di colonna che, cliccato, ordina per quella colonna (o inverte l'ordine). */
function titoloOrdina(campo, nome, ordine, classe = "") {
  if (!ordine) return `<th class="${classe}">${nome}</th>`;
  const attivo = ordine.campo === campo;
  const freccia = attivo ? (ordine.verso === "su" ? "▲" : "▼") : "";
  const prossimo = attivo && ordine.verso === "giu" ? "su" : attivo ? "giu" : campo === "data" || campo === "importo" ? "giu" : "su";
  const spiega = { data: prossimo === "su" ? "dal più vecchio" : "dal più recente", importo: prossimo === "su" ? "dal più piccolo" : "dal più grande" }[campo] ?? (prossimo === "su" ? "dalla A alla Z" : "dalla Z alla A");
  return `<th class="${classe}" aria-sort="${attivo ? (ordine.verso === "su" ? "ascending" : "descending") : "none"}">
    <button type="button" class="ordina" data-azione="ordina" data-campo="${campo}" data-verso="${prossimo}" title="Ordina per ${nome.toLowerCase()}, ${spiega}">${nome} <span class="freccia" aria-hidden="true">${freccia}</span></button></th>`;
}

/**
 * progressivo (facoltativo): Map id → saldo della cassa scelta dopo quel movimento, mostrato in una colonna in più.
 * totali (facoltativo): righe finali ben evidenti con il totale delle entrate e delle uscite dei movimenti mostrati.
 * ordine (facoltativo): {campo, verso}: i titoli delle colonne diventano pulsanti per ordinare.
 */
export function tabellaMovimenti(lista, arch, { dettagli = false, progressivo = null, totali = false, ordine = null } = {}) {
  if (!lista.length) return `<p class="hint">Nessun movimento.</p>`;
  return `<div class="scorri"><table class="movimenti">
    <tr>${COLONNE.map(([c, n]) => titoloOrdina(c, n, ordine, c === "importo" ? "n" : "")).join("")}${progressivo ? `<th class="n">Saldo dopo</th>` : ""}</tr>
    ${lista.map((m) => {
      const d = descrivi(m, arch);
      const classe = d.segno > 0 ? "pos" : d.segno < 0 ? "neg" : "";
      const aperto = dettagli && dettagliAperti.has(m.id);
      return `<tr class="${aperto ? "con-dettagli" : ""}"><td class="nowrap">${dataIt(m.data)}</td><td>${esc(m.descr)}${m.fattura ? ` <span class="pill">da fattura</span>` : ""}
        ${dettagli ? `<br><button type="button" class="apri-dettagli" data-azione="dettagli" data-id="${esc(m.id)}" aria-expanded="${aperto}">${aperto ? "▾" : "▸"} Dettagli</button>` : ""}</td>
        <td>${d.voce}</td><td>${d.cassa}</td><td class="n ${classe}">${d.segno > 0 ? "+" : d.segno < 0 ? "−" : ""}${eur(d.importo)}</td>${progressivo
          ? `<td class="n ${(progressivo.get(m.id) ?? 0) < 0 ? "neg" : ""}">${progressivo.has(m.id) ? eur(progressivo.get(m.id)) : ""}</td>` : ""}</tr>
        ${aperto ? `<tr class="riga-dettagli"><td colspan="${progressivo ? 6 : 5}">${contenutoDettagli(m, arch)}</td></tr>` : ""}`;
    }).join("")}${totali ? righeTotali(lista, arch, Boolean(progressivo)) : ""}</table></div>`;
}

/**
 * Nota sotto i totali: perché qui (soldi entrati e usciti da cassa e banche) i totali sono diversi da quelli della pagina Inizio
 * (entrate e uscite della parrocchia). Una riga per ogni causa trovata nei movimenti mostrati.
 */
function notaDifferenze(lista, arch, colonne) {
  const d = differenzeConInizio(lista);
  const parti = (x) => [x.entrate ? `${eur(x.entrate)} fra le entrate` : "", x.uscite ? `${eur(x.uscite)} fra le uscite` : ""].filter(Boolean).join(" e ");
  const righe = [];
  for (const [conto, x] of [...d.voci].sort(([a], [b]) => a.localeCompare(b))) {
    if (!x.entrate && !x.uscite) continue;
    const perche = tipoDi(conto) === "PG" ? "collette da versare alla Diocesi: non sono soldi della parrocchia"
      : "non è una voce di entrata o di uscita della parrocchia";
    righe.push(`<b>${esc(arch.nomeConto(conto))}</b> <code>${esc(conto)}</code>: ${parti(x)} (${perche}).`);
  }
  if (d.rimborsi) righe.push(`<b>Spese rimborsate</b>: ${eur(d.rimborsi)} fra le entrate; in Inizio riducono le uscite.`);
  if (d.restituzioni) righe.push(`<b>Entrate restituite</b>: ${eur(d.restituzioni)} fra le uscite; in Inizio riducono le entrate.`);
  if (d.senzaCassa.entrate || d.senzaCassa.uscite) {
    righe.push(`<b>Movimenti senza cassa né banca</b>: ${parti(d.senzaCassa)} di Inizio; qui non entrano nei totali, perché nessun soldo è entrato o uscito.`);
  }
  if (!righe.length) return "";
  return `<tr class="nota-spostamenti"><td colspan="${colonne}" class="hint">Perché questi totali sono diversi da «L'anno … finora» della pagina Inizio:
    qui si contano i soldi entrati e usciti da cassa e banche, in Inizio solo le entrate e le uscite della parrocchia.
    <ul class="differenze-inizio">${righe.map((r) => `<li>${r}</li>`).join("")}</ul></td></tr>`;
}

function righeTotali(lista, arch, conSaldo) {
  let entrate = 0, uscite = 0, spostati = 0;
  for (const m of lista) {
    const a = analizza(m);
    if (a.segno > 0) entrate += a.importo; else if (a.segno < 0) uscite += a.importo; else if (a.tipo === "spostamento") spostati += a.importo;
  }
  const diff = entrate - uscite;
  const vuota = conSaldo ? "<td></td>" : "";
  const quanti = lista.length === 1 ? "1 movimento" : `${lista.length} movimenti`;
  return `<tbody class="totali-movimenti">
    <tr class="primo"><td colspan="4"><b>Totale entrate</b> <span class="hint">(${quanti} mostrati)</span></td><td class="n pos">+${eur(entrate)}</td>${vuota}</tr>
    <tr><td colspan="4"><b>Totale uscite</b></td><td class="n neg">−${eur(uscite)}</td>${vuota}</tr>
    <tr class="differenza"><td colspan="4"><b>Differenza</b> <span class="hint">(entrate meno uscite)</span></td><td class="n ${diff < 0 ? "neg" : diff > 0 ? "pos" : ""}">${diff < 0 ? "−" : diff > 0 ? "+" : ""}${eur(Math.abs(diff))}</td>${vuota}</tr>
    ${notaDifferenze(lista, arch, conSaldo ? 6 : 5)}
    ${spostati ? `<tr class="nota-spostamenti"><td colspan="${conSaldo ? 6 : 5}" class="hint">Gli spostamenti tra casse e banche (${eur(spostati)}) non sono né entrate né uscite e non entrano nei totali.</td></tr>` : ""}
  </tbody>`;
}
