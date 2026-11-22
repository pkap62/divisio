// Tabella dei movimenti, usata in "Inizio" e in "Movimenti".

import { analizza, totaliRighe } from "../dominio/scritture.js";
import { esc, eur, dataIt } from "./util.js";

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

/**
 * progressivo (facoltativo): Map id → saldo della cassa scelta dopo quel movimento, mostrato in una colonna in più.
 * totali (facoltativo): righe finali ben evidenti con il totale delle entrate e delle uscite dei movimenti mostrati.
 */
export function tabellaMovimenti(lista, arch, { dettagli = false, progressivo = null, totali = false } = {}) {
  if (!lista.length) return `<p class="hint">Nessun movimento.</p>`;
  return `<div class="scorri"><table class="movimenti">
    <tr><th>Data</th><th>Descrizione</th><th>Voce</th><th>Cassa / banca</th><th class="n">Importo</th>${progressivo ? `<th class="n">Saldo dopo</th>` : ""}</tr>
    ${lista.map((m) => {
      const d = descrivi(m, arch);
      const classe = d.segno > 0 ? "pos" : d.segno < 0 ? "neg" : "";
      return `<tr><td class="nowrap">${dataIt(m.data)}</td><td>${esc(m.descr)}${m.fattura ? ` <span class="pill">da fattura</span>` : ""}
        ${dettagli ? `<details><summary>Dettagli</summary>${m.causale ? `<p class="hint piede">Causale: <b>${esc(m.causale)}</b></p>` : ""}${tabellaRighe(m.righe, arch)}
          <p class="hint">Inserito da ${esc(m.autore ?? "—")} · ultima modifica ${m.modificatoIl ? new Date(m.modificatoIl).toLocaleString("it-IT") : "—"}</p>
          ${m.tipo === "apertura"
            ? `<p class="hint">I saldi di apertura si cambiano da Impostazioni.</p>`
            : `<div class="riga-bottoni"><button class="btn sec piccolo" data-azione="modifica" data-id="${esc(m.id)}">Modifica</button>
               ${m.fattura ? "" : `<button class="btn sec piccolo" data-azione="copia" data-id="${esc(m.id)}">Registra di nuovo uguale</button>`}
               <button class="btn pericolo piccolo" data-azione="elimina" data-id="${esc(m.id)}">Elimina</button></div>`}
        </details>` : ""}</td>
        <td>${d.voce}</td><td>${d.cassa}</td><td class="n ${classe}">${d.segno > 0 ? "+" : d.segno < 0 ? "−" : ""}${eur(d.importo)}</td>${progressivo
          ? `<td class="n ${(progressivo.get(m.id) ?? 0) < 0 ? "neg" : ""}">${progressivo.has(m.id) ? eur(progressivo.get(m.id)) : ""}</td>` : ""}</tr>`;
    }).join("")}${totali ? righeTotali(lista, Boolean(progressivo)) : ""}</table></div>`;
}

function righeTotali(lista, conSaldo) {
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
    ${spostati ? `<tr class="nota-spostamenti"><td colspan="${conSaldo ? 6 : 5}" class="hint">Gli spostamenti tra casse e banche (${eur(spostati)}) non sono né entrate né uscite e non entrano nei totali.</td></tr>` : ""}
  </tbody>`;
}
